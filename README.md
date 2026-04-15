# KYC Chain Portal 🔗

A hybrid **Blockchain + Database** Know Your Customer (KYC) application. This project demonstrates a realistic bank-initiated KYC verification flow where sensitive PII is stored securely in a backend database, while the verification status and document hashes are recorded immutably on a local Ethereum blockchain.

## 🏗 Architecture

```
┌──────────────┐       ┌──────────────────┐       ┌───────────────────┐
│   Frontend   │──────▶│  Backend (API)   │──────▶│   SQLite Database │
│  React/Vite  │       │  Express + JWT   │       │  Users, Docs,     │
│  ethers.js   │       │  Port 4000       │       │  Profiles         │
└──────┬───────┘       └──────────────────┘       └───────────────────┘
       │
       │  (Direct blockchain calls via ethers.js)
       ▼
┌──────────────────┐
│  Smart Contract  │
│  KYC.sol on      │
│  Ganache :8545   │
└──────────────────┘
```

- **Blockchain** → Immutable KYC status tracking via a 5-step state machine.
- **Backend API** → JWT authentication, user profiles, document storage, Ganache account auto-assignment.
- **Frontend** → React SPA with role-based dashboards (Bank / Customer).

---

## 🚀 Features

### Authentication & Accounts
- Web2-style **Sign Up / Sign In** with username and password (JWT tokens).
- **Ganache Ethereum addresses** are auto-assigned from a pool on registration.
- Auto on-chain registration (Bank or Customer) happens transparently at first login.

### Customer Portal
- **My Profile** — Fill and save personal information (name, email, phone, DOB, gender, address) with full validation.
- **My Documents** — Upload identity documents (Aadhar, PAN, Voter ID) with format validation:
  - Aadhar: 12 digits
  - PAN: `ABCDE1234F` format
  - Voter ID: `ABC1234567` format
- **KYC Requests** — View incoming requests from banks, accept them, submit documents, and track status through a visual stepper.
- **Re-apply** — After a bank rejects KYC, customers can click "Re-apply", update their documents/profile, and re-submit.

### Bank Portal
- **Initiate KYC** — Select a registered customer and send them a KYC request.
- **KYC Queue** — View all requests with status filters. Click into any request to review:
  - Customer profile (name, email, phone, etc.)
  - Submitted documents (Aadhar, PAN, Voter ID numbers + file attachments)
  - Document hash recorded on blockchain
- **Verify / Reject** — Approve or reject at any stage (Pending, Accepted, Submitted).

### KYC State Machine (On-Chain)
```
NONE ──▶ PENDING ──▶ ACCEPTED ──▶ SUBMITTED ──▶ VERIFIED
              │           │            │
              └───────────┴────────────┴──▶ REJECTED ──▶ (Re-apply) ──▶ ACCEPTED
```

---

## 🛠 Tech Stack

| Layer           | Technology                               |
|-----------------|------------------------------------------|
| Smart Contract  | Solidity 0.8.24, Hardhat                 |
| Local Blockchain| Ganache CLI (port 8545, chainId 1337)    |
| Backend API     | Node.js, Express, JWT, sql.js (SQLite)   |
| Frontend        | React 18, Vite, ethers.js v6             |
| Styling         | Vanilla CSS (dark glassmorphism theme)   |

---

## 📋 Installation & Setup

### Prerequisites
- **Node.js** v18+ installed
- **npm** package manager

### 1. Install Dependencies

```bash
# Blockchain
cd blockchain
npm install

# Backend
cd ../backend
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Start Ganache (Terminal 1)
```bash
npx ganache-cli --port 8545 --chainId 1337
```
> This starts a local Ethereum node with 10 test accounts.

### 3. Deploy Smart Contract (Terminal 2)
```bash
cd blockchain
npx hardhat compile
npx hardhat run scripts/deploy.js --network localhost
```
> This deploys `KYC.sol` and auto-copies the ABI + contract address into `frontend/src/config/`.

### 4. Initialize Database & Start Backend (Terminal 3)
```bash
cd backend
node init_db.js
node server.js
```
> Backend runs on **http://localhost:4000**. The database file `database.sqlite` is created in the `backend/` directory.

### 5. Start Frontend (Terminal 4)
```bash
cd frontend
npm run dev
```
> Frontend runs on **http://localhost:5173**. Open this in your browser.

---

## 💡 How to Use

### Step 1: Create Accounts
1. Open the app and click **"Create Account"**.
2. Register a **Bank** account (e.g., Display Name: "HDFC Bank", Role: Bank).
3. In a separate browser or incognito tab, register a **Customer** account (e.g., Display Name: "Rajesh Kumar", Role: Customer).

### Step 2: Customer — Complete Profile & Upload Documents
1. Go to **My Profile** → Fill in all fields (name, email, phone, DOB, gender, address) → Save.
2. Go to **My Documents** → Upload Aadhar (12 digits), PAN (ABCDE1234F), or Voter ID → Save.

### Step 3: Bank — Initiate KYC
1. Log in as the Bank.
2. Go to **Initiate KYC** → Select the customer from the dropdown → Click "Send KYC Request".

### Step 4: Customer — Accept & Submit
1. Log in as the Customer.
2. Go to **KYC Requests** → See the pending request → Click **"✓ Accept Request"**.
3. After accepting, click **"📤 Submit Documents"** (this hashes your document numbers and records them on the blockchain).

### Step 5: Bank — Review & Verify
1. Log in as the Bank.
2. Go to **KYC Queue** → Click **"View Details"** on the submitted request.
3. Review the customer's profile, documents, and blockchain hash.
4. Click **"✓ Verify KYC"** or **"✕ Reject"**.

### Step 6 (Optional): Re-apply After Rejection
1. If rejected, the Customer sees a **"🔄 Re-apply"** button.
2. Clicking it re-opens the request → Customer can update docs → Re-submit → Bank re-reviews.

---

## 📁 Project Structure

```
📦 newkyc
 ┣ 📂 blockchain
 ┃ ┣ 📂 contracts         # KYC.sol (5-step state machine)
 ┃ ┣ 📂 scripts           # deploy.js (auto-copies ABI to frontend)
 ┃ ┣ 📜 hardhat.config.js
 ┃ ┗ 📜 package.json
 ┣ 📂 backend
 ┃ ┣ 📜 server.js          # Express API (auth, docs, profiles)
 ┃ ┣ 📜 init_db.js         # SQLite schema initializer
 ┃ ┣ 📜 package.json
 ┃ ┣ 📜 database.sqlite    # Generated after init_db.js
 ┃ ┗ 📂 uploads            # Uploaded document scans
 ┗ 📂 frontend
   ┣ 📂 src
   ┃ ┣ 📂 config           # Auto-generated (contract ABI + address)
   ┃ ┣ 📜 App.jsx          # Main app (auth, dashboards, KYC flow)
   ┃ ┣ 📜 index.css        # Design system (dark glassmorphism)
   ┃ ┗ 📜 main.jsx
   ┣ 📜 vite.config.js
   ┗ 📜 package.json
```

---

## 🔒 Smart Contract API

| Function          | Called By  | Transition                    |
|-------------------|-----------|-------------------------------|
| `registerBank`    | Bank      | —                             |
| `registerCustomer`| Customer  | —                             |
| `initiateKYC`     | Bank      | None → Pending                |
| `acceptRequest`   | Customer  | Pending → Accepted            |
| `submitKYC`       | Customer  | Accepted → Submitted          |
| `verifyKYC`       | Bank      | Submitted → Verified          |
| `rejectKYC`       | Bank      | Any → Rejected                |
| `reopenRequest`   | Customer  | Rejected → Accepted           |

---

## 🔌 Backend API Endpoints

| Method | Endpoint                      | Auth | Description                          |
|--------|-------------------------------|------|--------------------------------------|
| POST   | `/api/register`               | No   | Create account (auto-assigns ETH)    |
| POST   | `/api/login`                  | No   | Login (returns JWT)                  |
| GET    | `/api/me`                     | Yes  | Get current user info                |
| GET    | `/api/profile`                | Yes  | Get own profile                      |
| POST   | `/api/profile`                | Yes  | Save/update own profile              |
| GET    | `/api/profile/:userId`        | Bank | View customer's profile              |
| GET    | `/api/documents`              | Yes  | Get own documents                    |
| POST   | `/api/documents`              | Yes  | Upload/upsert a document             |
| GET    | `/api/documents/:userId`      | Bank | View customer's documents            |
| GET    | `/api/users/customers`        | Bank | List all registered customers        |
| GET    | `/api/users/by-address/:addr` | Yes  | Lookup user by ETH address           |

---

## 📝 Notes

- **Database Reset**: Run `node init_db.js` to reset the database. This creates a fresh `database.sqlite`.
- **Contract Redeployment**: If you modify `KYC.sol`, recompile and redeploy. This will generate a new contract address — all previous on-chain data is lost.
- **Ganache Restart**: Restarting Ganache resets all accounts and balances. You'll need to redeploy the contract and re-initialize the database.
- **File Uploads**: Document scans are saved to `backend/uploads/`. Banks can view attached files via the review screen.
