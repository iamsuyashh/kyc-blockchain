/**
 * server.js  –  Express backend for the KYC Hybrid Portal.
 *
 * Uses sql.js (pure JS SQLite – no native compilation needed).
 *
 * Handles:
 *   • User registration / login  (JWT)
 *   • Auto-assign Ganache addresses to new users
 *   • KYC document CRUD  (Aadhar, PAN, Voter)
 *   • File uploads via multer
 *   • Bank account balance & statements
 */

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const initSqlJs = require("sql.js");

// ── Config ─────────────────────────────────────────────────────────
const PORT = 4000;
const JWT_SECRET = "kyc-portal-super-secret-key-2026";
const DB_PATH = path.join(__dirname, "database.sqlite");
const UPLOADS_DIR = path.join(__dirname, "uploads");

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(UPLOADS_DIR));

// ── Multer setup ───────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e4);
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// ── Ganache address pool ───────────────────────────────────────────
// Fetched dynamically from the running Ganache instance at boot.
// First 2 accounts are reserved (deployer / Hardhat default signer).
const GANACHE_URL = "http://127.0.0.1:8545";
let GANACHE_ACCOUNTS = []; // populated in boot()

// ── sql.js database wrapper ────────────────────────────────────────
let db; // set during boot

function saveDb() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

/** Run a SELECT and return all rows as plain objects. */
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

/** Run a SELECT and return the first row (or undefined). */
function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows.length ? rows[0] : undefined;
}

/** Run an INSERT / UPDATE / DELETE.  Returns { changes, lastId }. */
function runSql(sql, params = []) {
  db.run(sql, params);
  const changes = db.getRowsModified();
  const lastId = queryOne("SELECT last_insert_rowid() AS id");
  saveDb();
  return { changes, lastId: lastId ? lastId.id : 0 };
}

function getNextAddress() {
  const used = queryAll("SELECT eth_address FROM users").map((r) =>
    r.eth_address.toLowerCase()
  );
  const available = GANACHE_ACCOUNTS.find(
    (a) => !used.includes(a.toLowerCase())
  );
  if (!available) throw new Error("No more Ganache accounts available");
  return available;
}

// ── Auth middleware ────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: "No token" });
  try {
    const token = header.split(" ")[1];
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

// ═══════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════════════

app.post("/api/register", (req, res) => {
  try {
    const { username, password, role, displayName } = req.body;

    if (!username || !password || !role || !displayName)
      return res.status(400).json({ error: "All fields required" });
    if (!["bank", "customer"].includes(role))
      return res.status(400).json({ error: "Role must be bank or customer" });

    const exists = queryOne("SELECT id FROM users WHERE username = ?", [username]);
    if (exists) return res.status(409).json({ error: "Username taken" });

    const hash = bcrypt.hashSync(password, 10);
    const ethAddress = getNextAddress();

    const { lastId } = runSql(
      "INSERT INTO users (username, password, role, display_name, eth_address) VALUES (?, ?, ?, ?, ?)",
      [username, hash, role, displayName, ethAddress]
    );

    // If customer, create a bank account with ₹10,000 and a welcome credit
    if (role === "customer") {
      runSql("INSERT INTO bank_accounts (user_id, balance) VALUES (?, ?)", [lastId, 10000]);
      runSql(
        "INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)",
        [lastId, "credit", 10000, "Welcome bonus – account opening"]
      );
    }

    const token = jwt.sign(
      { id: lastId, username, role, displayName, ethAddress },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      token,
      user: { id: lastId, username, role, displayName, ethAddress },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/login", (req, res) => {
  try {
    const { username, password } = req.body;
    const user = queryOne("SELECT * FROM users WHERE username = ?", [username]);
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    if (!bcrypt.compareSync(password, user.password))
      return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        displayName: user.display_name,
        ethAddress: user.eth_address,
      },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        displayName: user.display_name,
        ethAddress: user.eth_address,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/me", authMiddleware, (req, res) => {
  res.json(req.user);
});

// ═══════════════════════════════════════════════════════════════════
// DOCUMENT ROUTES
// ═══════════════════════════════════════════════════════════════════

// Upload / upsert a document
app.post("/api/documents", authMiddleware, upload.single("file"), (req, res) => {
  try {
    const { docType, docNumber } = req.body;
    if (!docType || !docNumber)
      return res.status(400).json({ error: "docType and docNumber required" });

    const filePath = req.file ? `/uploads/${req.file.filename}` : null;

    // Upsert – replace if same type exists
    const existing = queryOne(
      "SELECT id FROM documents WHERE user_id = ? AND doc_type = ?",
      [req.user.id, docType]
    );

    if (existing) {
      runSql(
        "UPDATE documents SET doc_number = ?, file_path = ?, uploaded_at = datetime('now') WHERE id = ?",
        [docNumber, filePath, existing.id]
      );
    } else {
      runSql(
        "INSERT INTO documents (user_id, doc_type, doc_number, file_path) VALUES (?, ?, ?, ?)",
        [req.user.id, docType, docNumber, filePath]
      );
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all documents for the logged-in user
app.get("/api/documents", authMiddleware, (req, res) => {
  const docs = queryAll("SELECT * FROM documents WHERE user_id = ?", [req.user.id]);
  res.json(docs);
});

// Get documents for a specific user (bank use-case)
app.get("/api/documents/:userId", authMiddleware, (req, res) => {
  if (req.user.role !== "bank")
    return res.status(403).json({ error: "Only banks can view other's docs" });
  const docs = queryAll("SELECT * FROM documents WHERE user_id = ?", [
    Number(req.params.userId),
  ]);
  res.json(docs);
});

// Lookup user by eth address (used by bank to find user_id)
app.get("/api/users/by-address/:address", authMiddleware, (req, res) => {
  const user = queryOne(
    "SELECT id, username, role, display_name, eth_address FROM users WHERE LOWER(eth_address) = LOWER(?)",
    [req.params.address]
  );
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

// List all customers (for bank's "Initiate KYC" form)
app.get("/api/users/customers", authMiddleware, (req, res) => {
  if (req.user.role !== "bank")
    return res.status(403).json({ error: "Only banks" });
  const customers = queryAll(
    "SELECT id, username, display_name, eth_address FROM users WHERE role = 'customer'"
  );
  res.json(customers);
});

// ═══════════════════════════════════════════════════════════════════
// PROFILE ROUTES
// ═══════════════════════════════════════════════════════════════════

// Get own profile
app.get("/api/profile", authMiddleware, (req, res) => {
  const profile = queryOne("SELECT * FROM profiles WHERE user_id = ?", [req.user.id]);
  res.json(profile || { full_name: "", email: "", phone: "", dob: "", gender: "", address: "" });
});

// Save / update own profile
app.post("/api/profile", authMiddleware, (req, res) => {
  try {
    const { fullName, email, phone, dob, gender, address } = req.body;

    // Validation
    const errors = [];
    if (!fullName || fullName.trim().length < 2) errors.push("Full name is required (min 2 characters)");
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Valid email is required");
    if (!phone || !/^[6-9]\d{9}$/.test(phone)) errors.push("Valid 10-digit Indian mobile number required");
    if (!dob) errors.push("Date of birth is required");
    if (!gender || !["male", "female", "other"].includes(gender)) errors.push("Gender is required");
    if (!address || address.trim().length < 5) errors.push("Address is required (min 5 characters)");

    if (errors.length > 0) return res.status(400).json({ error: errors.join(". ") });

    const existing = queryOne("SELECT id FROM profiles WHERE user_id = ?", [req.user.id]);
    if (existing) {
      runSql(
        "UPDATE profiles SET full_name=?, email=?, phone=?, dob=?, gender=?, address=?, updated_at=datetime('now') WHERE user_id=?",
        [fullName.trim(), email.trim(), phone.trim(), dob, gender, address.trim(), req.user.id]
      );
    } else {
      runSql(
        "INSERT INTO profiles (user_id, full_name, email, phone, dob, gender, address) VALUES (?,?,?,?,?,?,?)",
        [req.user.id, fullName.trim(), email.trim(), phone.trim(), dob, gender, address.trim()]
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bank: view a customer's profile by user id
app.get("/api/profile/:userId", authMiddleware, (req, res) => {
  if (req.user.role !== "bank")
    return res.status(403).json({ error: "Only banks can view profiles" });
  const profile = queryOne("SELECT * FROM profiles WHERE user_id = ?", [Number(req.params.userId)]);
  res.json(profile || { full_name: "", email: "", phone: "", dob: "", gender: "", address: "" });
});

// ═══════════════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════════════

async function fetchGanacheAccounts() {
  // Use a raw JSON-RPC call to get the accounts from Ganache
  const resp = await fetch(GANACHE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "eth_accounts", params: [], id: 1 }),
  });
  const data = await resp.json();
  if (!data.result || data.result.length === 0) {
    throw new Error("No accounts returned from Ganache. Is it running?");
  }
  // Skip first 2 accounts (reserved for Hardhat deployer)
  return data.result.slice(2);
}

async function boot() {
  // 1. Load Ganache accounts
  try {
    GANACHE_ACCOUNTS = await fetchGanacheAccounts();
    console.log(`🔗  Fetched ${GANACHE_ACCOUNTS.length} Ganache accounts (skipped first 2)`);
  } catch (err) {
    console.error("⚠️  Could not connect to Ganache:", err.message);
    console.error("    Backend will start but registration will fail until Ganache is available.");
  }

  // 2. Load SQLite database
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log("📂  Loaded existing database from", DB_PATH);
  } else {
    console.error("❌  database.sqlite not found. Run 'node init_db.js' first.");
    process.exit(1);
  }

  // 3. Start server
  app.listen(PORT, () => {
    console.log(`🚀  KYC Backend running on http://localhost:${PORT}`);
  });
}

boot().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});

