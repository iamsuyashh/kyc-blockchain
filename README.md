# KYC Blockchain System 🔐

A simplified Blockchain-based Know Your Customer (KYC) application. This project demonstrates how sensitive KYC data can be securely updated, authorized, and accessed using Smart Contracts on a local Ethereum network.

## 🚀 Features
- **Bank Registration:** Banks can register on the network and view pending KYC requests from customers.
- **Customer Identity Management:** Customers can securely save their personal details onto the blockchain.
- **Access Control:** Customers have full authority over their data and can grant or revoke view-access for specific banks.
- **KYC Verification:** Approved banks can review customer identities and approve or reject their KYC status.

## 🛠 Tech Stack
- **Smart Contract Backend:** Solidity, Hardhat
- **Local Network:** Ganache CLI (running on port 8545)
- **Frontend UI:** React.js, Vite, ethers.js (v6)

## 📋 Installation & Setup Instructions

Follow these steps to run the application locally on your machine.

### 1. Start the Blockchain Network (Terminal 1)
Open a new terminal, install the dependencies, and start the local Ganache network.
```bash
cd blockchain
npm install
npm run ganache
```
*(This will start a local Ethereum node running on `http://127.0.0.1:8545` and provide you with predefined test accounts)*

### 2. Deploy Smart Contract (Terminal 2)
In a separate terminal, deploy the `KYC.sol` contract to your local Ganache network.
```bash
cd blockchain
npm run deploy:local
```
*(This script automatically deploys the contract and copies the resulting Contract ABI and Address directly into the frontend's `config` folder!)*

### 3. Run the Web Application (Terminal 3)
Finally, start the React frontend app.
```bash
cd frontend
npm install
npm run dev
```
*(Your application will be live at `http://localhost:5173`. Open this URL in your browser.)*

## 💡 How to Use
1. **Login:** Once the frontend is running, the login screen will fetch test accounts from your Ganache instance. Select an account to log in.
2. **Choose Role:** On your first login with an empty account, choose to register either as a **Bank** or a **Customer**. (Use a different Ganache account for different roles).
3. **As a Customer:**
   - Go to **Identity Profile** to submit your personal details onto the blockchain.
   - Go to **Access Control** to see the list of all registered banks and **Grant** them access to read your data.
4. **As a Bank:**
   - Go to the **KYC Queue** to view the list of customers who have explicitly granted you access.
   - Click "View Full Info" to verify their details and subsequently Approve or Reject their KYC status.

## 📁 Project Structure

```text
📦 newkyc
 ┣ 📂 blockchain
 ┃ ┣ 📂 contracts      # Solidity Smart Contracts (KYC.sol)
 ┃ ┣ 📂 scripts        # Hardhat Deployment Script (deploy.js)
 ┃ ┣ 📜 hardhat.config.js 
 ┃ ┗ 📜 package.json 
 ┗ 📂 frontend
   ┣ 📂 src            # React Application folder
   ┃ ┣ 📂 config       # Stores Auto-generated config (ABI, Address)
   ┃ ┣ 📜 App.jsx      # Main Application User Interface & Logic
   ┃ ┗ 📜 index.css    # Core Styling
   ┣ 📜 vite.config.js 
   ┗ 📜 package.json
```
