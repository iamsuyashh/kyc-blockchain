/**
 * init_db.js  –  Initialise the SQLite database for the KYC backend.
 * Run once:  node init_db.js
 */

const initSqlJs = require("sql.js");
const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "database.sqlite");

async function main() {
  const SQL = await initSqlJs();

  // Create a fresh database
  const db = new SQL.Database();

  // ── Users ──────────────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      username     TEXT    NOT NULL UNIQUE,
      password     TEXT    NOT NULL,
      role         TEXT    NOT NULL,
      display_name TEXT    NOT NULL,
      eth_address  TEXT    NOT NULL UNIQUE,
      created_at   TEXT    DEFAULT (datetime('now'))
    );
  `);

  // ── Documents (Aadhar / PAN / Voter ID) ────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS documents (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL,
      doc_type   TEXT    NOT NULL,
      doc_number TEXT    NOT NULL,
      file_path  TEXT,
      uploaded_at TEXT   DEFAULT (datetime('now'))
    );
  `);

  // ── Bank Accounts ──────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS bank_accounts (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id   INTEGER NOT NULL UNIQUE,
      balance   REAL    NOT NULL DEFAULT 10000.00
    );
  `);

  // ── Transactions / Statements ──────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL,
      type        TEXT    NOT NULL,
      amount      REAL    NOT NULL,
      description TEXT,
      created_at  TEXT    DEFAULT (datetime('now'))
    );
  `);

  // ── Profiles (Customer personal info) ──────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS profiles (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL UNIQUE,
      full_name   TEXT    NOT NULL DEFAULT '',
      email       TEXT    NOT NULL DEFAULT '',
      phone       TEXT    NOT NULL DEFAULT '',
      dob         TEXT    NOT NULL DEFAULT '',
      gender      TEXT    NOT NULL DEFAULT '',
      address     TEXT    NOT NULL DEFAULT '',
      updated_at  TEXT    DEFAULT (datetime('now'))
    );
  `);

  // Save to file
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);

  console.log("✅  Database initialised at", DB_PATH);
  db.close();
}

main().catch(console.error);
