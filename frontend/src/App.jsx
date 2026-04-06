import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import KYCArtifact from './config/KYC.json';
import contractAddress from './config/contract-address.json';

const GANACHE_URL = "http://127.0.0.1:8545";

function App() {
  const [provider, setProvider] = useState(null);
  const [accounts, setAccounts] = useState([]);
  
  // Login State
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [selectedLoginAddress, setSelectedLoginAddress] = useState("");
  const [currentAccount, setCurrentAccount] = useState(null);
  
  // Contract & Roles State
  const [contract, setContract] = useState(null);
  const [isBank, setIsBank] = useState(false);
  const [isCustomer, setIsCustomer] = useState(false);
  
  // UI State
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [activeTab, setActiveTab] = useState("Home");
  const [selectedRequest, setSelectedRequest] = useState(null); // For Bank viewing full details

  // Forms & App Data
  const [bankName, setBankName] = useState("");
  const [customerName, setCustomerName] = useState("");
  
  const [formData, setFormData] = useState({
    fullName: "",
    dob: "",
    idNumber: "",
    physicalAddress: "",
    nationality: ""
  });

  const [allBanks, setAllBanks] = useState([]);
  const [customerBankStatuses, setCustomerBankStatuses] = useState([]); // Array of statuses for the customer
  const [pendingRequests, setPendingRequests] = useState([]); // For Bank
  
  // Feedback Data
  const [bankFeedbacks, setBankFeedbacks] = useState([]);
  const [feedbackText, setFeedbackText] = useState("");
  const [selectedBankForFeedback, setSelectedBankForFeedback] = useState("");

  useEffect(() => {
    async function init() {
      try {
        const _provider = new ethers.JsonRpcProvider(GANACHE_URL);
        setProvider(_provider);
        const _accounts = await _provider.listAccounts();
        setAccounts(_accounts);
        
        const savedAccount = localStorage.getItem('kyc_logged_in_account');
        if (savedAccount && _accounts.some(a => a.address === savedAccount)) {
          setSelectedLoginAddress(savedAccount);
          setCurrentAccount(savedAccount);
          setIsLoggedIn(true);
          setupContract(_provider, savedAccount);
        } else if (_accounts.length > 0) {
          setSelectedLoginAddress(_accounts[0].address);
        }
      } catch (err) {
        setErrorMessage("Could not connect to Ganache. Ensure it is running on port 8545.");
      }
    }
    init();
  }, []);

  const clearMessages = () => { setErrorMessage(""); setSuccessMessage(""); };

  const handleLogin = async () => {
    clearMessages();
    setCurrentAccount(selectedLoginAddress);
    setIsLoggedIn(true);
    localStorage.setItem('kyc_logged_in_account', selectedLoginAddress);
    await setupContract(provider, selectedLoginAddress);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setContract(null);
    setIsBank(false);
    setIsCustomer(false);
    setActiveTab("Home");
    localStorage.removeItem('kyc_logged_in_account');
    clearMessages();
  };

  const forceRefresh = async () => {
    if (provider && currentAccount) {
      await setupContract(provider, currentAccount);
      setSuccessMessage("Data refreshed from blockchain.");
      setTimeout(() => setSuccessMessage(""), 2000);
    }
  };

  const setupContract = async (_provider, accountAddress) => {
    try {
      const signer = await _provider.getSigner(accountAddress);
      const _contract = new ethers.Contract(
        contractAddress.address,
        KYCArtifact.abi,
        signer
      );
      setContract(_contract);
      await checkRole(_contract, accountAddress);
      await fetchAllBanks(_contract);
    } catch (err) {
      console.error(err);
      setErrorMessage("Contract setup failed. Check if deployed.");
    }
  };

  const checkRole = async (_contract, address) => {
    try {
      const bankData = await _contract.banks(address);
      const custData = await _contract.customers(address);
      setIsBank(bankData.isRegistered);
      setIsCustomer(custData.isRegistered);

      if (custData.isRegistered && custData.dataPayload) {
        try {
          const parsed = JSON.parse(custData.dataPayload);
          setFormData(parsed);
        } catch(e) {}
      }
      
      if (bankData.isRegistered) {
          await fetchPendingRequests(_contract);
          await fetchBankFeedbacks(_contract, address);
      }
      if (custData.isRegistered) await fetchCustomerStatuses(_contract, address);
      
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAllBanks = async (_contract) => {
    try {
      const banks = await _contract.getAllBanks();
      setAllBanks(banks || []);
    } catch (err) { console.error(err); }
  };

  const fetchBankFeedbacks = async (_contract, address) => {
    try {
      const fb = await _contract.getBankFeedbacks(address);
      setBankFeedbacks(fb);
    } catch (err) { console.error(err); }
  };

  const fetchCustomerStatuses = async (_contract, address) => {
    try {
      const banks = await _contract.getAllBanks();
      let statuses = [];
      for (let b of banks) {
        const [status, hasAccess] = await _contract.getStatusWithBank(address, b.ethAddress);
        statuses.push({ bankAddress: b.ethAddress, bankName: b.name, status, hasAccess });
      }
      setCustomerBankStatuses(statuses);
    } catch (err) { console.error(err); }
  };

  const fetchPendingRequests = async (_contract) => {
    try {
      const [customers, addresses] = await _contract.getAllCustomers();
      let reqs = [];
      for(let i = 0; i < customers.length; i++) {
        if(customers[i].isRegistered) {
          // If the bank has access, we can view data.
          try {
            const [uName, payload, status] = await _contract.viewCustomerKYC(addresses[i]);
            reqs.push({
              address: addresses[i],
              userName: uName,
              payload: payload,
              status: status
            });
          } catch(e) {
            // Reverted means no access, so we skip
          }
        }
      }
      setPendingRequests(reqs);
    } catch(err) { console.error(err); }
  };

  // ACTIONS
  const registerAsBank = async () => {
    if(!contract || !bankName) return;
    try {
      const tx = await contract.registerBank(bankName);
      await tx.wait();
      setSuccessMessage("Bank registered successfully!");
      checkRole(contract, currentAccount);
    } catch(e) { setErrorMessage(e.reason || e.message); }
  };

  const registerAsCustomer = async () => {
    if(!contract || !customerName) return;
    try {
      const tx = await contract.registerCustomer(customerName);
      await tx.wait();
      setSuccessMessage("Customer registered successfully!");
      checkRole(contract, currentAccount);
    } catch(e) { setErrorMessage(e.reason || e.message); }
  };

  const handleFormChange = (e) => {
    setFormData({...formData, [e.target.name]: e.target.value});
  };

  const updateCustomerData = async () => {
    try {
      const jsonStr = JSON.stringify(formData);
      const tx = await contract.updateCustomerData(jsonStr);
      await tx.wait();
      setSuccessMessage("Profile data safely updated on the blockchain.");
    } catch(e) { setErrorMessage(e.reason || e.message); }
  };

  const grantAccess = async (bAddr) => {
    try {
      const tx = await contract.grantAccess(bAddr);
      await tx.wait();
      setSuccessMessage("Access Granted.");
      fetchCustomerStatuses(contract, currentAccount);
    } catch(e) { setErrorMessage(e.reason || e.message); }
  };

  const revokeAccess = async (bAddr) => {
    try {
      const tx = await contract.revokeAccess(bAddr);
      await tx.wait();
      setSuccessMessage("Access Revoked.");
      fetchCustomerStatuses(contract, currentAccount);
    } catch(e) { setErrorMessage(e.reason || e.message); }
  };

  const setKYCStatus = async (cAddr, isApprove) => {
    try {
      const tx = isApprove ? await contract.approveKYC(cAddr) : await contract.rejectKYC(cAddr);
      await tx.wait();
      setSuccessMessage(`KYC ${isApprove ? 'Approved' : 'Rejected'} successfully.`);
      setSelectedRequest(null);
      fetchPendingRequests(contract);
    } catch(e) { setErrorMessage(e.reason || e.message); }
  };

  const submitFeedback = async () => {
    if(!contract || !selectedBankForFeedback || !feedbackText) return;
    try {
      const tx = await contract.addFeedback(selectedBankForFeedback, feedbackText);
      await tx.wait();
      setSuccessMessage("Feedback submitted successfully.");
      setFeedbackText("");
    } catch(e) { setErrorMessage(e.reason || e.message); }
  };

  // --- RENDERERS ---

  if (!isLoggedIn) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="logo-icon">🔐</div>
          <h2>KYC Portal V2</h2>
          <p>Select an account from your local Ganache provider to simulate login.</p>
          
          <label style={{textAlign:'left'}}>Ganache Account Address</label>
          <select value={selectedLoginAddress} onChange={e => setSelectedLoginAddress(e.target.value)}>
            {accounts.map((a, i) => <option key={a.address} value={a.address}>Account {i+1} : {a.address.slice(0,8)}...</option>)}
          </select>
          
          <button className="btn-primary" style={{width:'100%', marginTop: '1rem'}} onClick={handleLogin}>
            Connect Wallet
          </button>
          
          {errorMessage && <div className="mt-4"><span style={{color:'#ff7b72'}}>{errorMessage}</span></div>}
        </div>
      </div>
    );
  }

  // Registration Mode for unrecognized accounts
  if (!isBank && !isCustomer) {
    return (
      <div className="login-container flex-col">
        {errorMessage && <div className="alert alert-error">{errorMessage}</div>}
        {successMessage && <div className="alert alert-success">{successMessage}</div>}
        
        <h2>Welcome to the Network</h2>
        <p>This address is not yet registered. Choose your role below:</p>
        <div className="flex gap-4 mt-4">
          <div className="card text-center" style={{width: 300}}>
            <h3>🏦 Bank Portal</h3>
            <p>Process KYC requests</p>
            <input placeholder="Enter Bank Name" value={bankName} onChange={e => setBankName(e.target.value)} />
            <button className="btn-primary" onClick={registerAsBank}>Register as Bank</button>
          </div>
          <div className="card text-center" style={{width: 300}}>
            <h3>👤 Customer</h3>
            <p>Manage Identity</p>
            <input placeholder="Enter Username" value={customerName} onChange={e => setCustomerName(e.target.value)} />
            <button className="btn-primary" onClick={registerAsCustomer}>Register as Customer</button>
          </div>
        </div>
        <button className="btn-outline mt-4" onClick={handleLogout}>Disconnect</button>
      </div>
    );
  }

  return (
    <div className="dashboard-layout">
      
      {/* SIDEBAR */}
      <div className="sidebar">
        <div className="sidebar-title">
          {isBank ? '🏦 Bank Portal' : '👤 Customer Portal'}
        </div>
        
        <div className={`nav-item ${activeTab === 'Home' ? 'active' : ''}`} onClick={() => setActiveTab('Home')}>
          📊 Dashboard
        </div>
        
        {isCustomer && (
          <>
            <div className={`nav-item ${activeTab === 'Profile' ? 'active' : ''}`} onClick={() => setActiveTab('Profile')}>
              📝 Identity Profile
            </div>
            <div className={`nav-item ${activeTab === 'Access' ? 'active' : ''}`} onClick={() => setActiveTab('Access')}>
              🔐 Access Control
            </div>
            <div className={`nav-item ${activeTab === 'Feedback' ? 'active' : ''}`} onClick={() => setActiveTab('Feedback')}>
              🗣️ Provide Feedback
            </div>
          </>
        )}
        
        {isBank && (
          <>
            <div className={`nav-item ${activeTab === 'Requests' ? 'active' : ''}`} onClick={() => { setActiveTab('Requests'); setSelectedRequest(null); }}>
               📥 KYC Queue
            </div>
            <div className={`nav-item ${activeTab === 'Processed' ? 'active' : ''}`} onClick={() => { setActiveTab('Processed'); setSelectedRequest(null); }}>
               ✅ Processed KYC
            </div>
            <div className={`nav-item ${activeTab === 'Feedbacks' ? 'active' : ''}`} onClick={() => { setActiveTab('Feedbacks'); setSelectedRequest(null); }}>
               🗣️ Received Feedbacks
            </div>
          </>
        )}

        <div style={{flex: 1}}></div>
        <button className="btn-outline" onClick={handleLogout} style={{width:'100%'}}>Logout</button>
      </div>

      {/* MAIN CONTENT */}
      <div className="main-content">
        <div className="flex justify-between items-center mb-4">
          <div className="flex gap-4 items-center">
            <h2>{activeTab}</h2>
            <button className="btn-outline" onClick={forceRefresh} style={{padding: '0.4rem 0.8rem', fontSize: '0.8rem'}}>🔄 Refresh</button>
          </div>
          <span style={{color: '#8b949e'}}>{currentAccount}</span>
        </div>
        
        {errorMessage && <div className="alert alert-error">{errorMessage}</div>}
        {successMessage && <div className="alert alert-success">{successMessage}</div>}

        {/* --- CUSTOMER VIEWS --- */}
        {isCustomer && activeTab === 'Home' && (
          <div>
            <div className="stats-grid">
              <div className="stat-card">
                <div>Active Connected Banks</div>
                <div className="stat-value">{customerBankStatuses.filter(s => s.hasAccess).length}</div>
              </div>
            </div>
            <div className="card">
              <h3>Welcome back</h3>
              <p>Navigate to Identity Profile to update your details securely, and Access Control to seamlessly share your details with financial institutions.</p>
            </div>
          </div>
        )}

        {isCustomer && activeTab === 'Profile' && (
          <div className="card" style={{maxWidth: 600}}>
            <h3>Your Encrypted Digital Identity</h3>
            <p>This data is compressed and securely managed on the ledger.</p>
            <label>Full Name</label>
            <input name="fullName" value={formData.fullName} onChange={handleFormChange} />
            <label>Date of Birth</label>
            <input type="date" name="dob" value={formData.dob} onChange={handleFormChange} />
            <label>ID / Passport Number</label>
            <input name="idNumber" value={formData.idNumber} onChange={handleFormChange} />
            <label>Nationality</label>
            <input name="nationality" value={formData.nationality} onChange={handleFormChange} />
            <label>Physical Address</label>
            <input name="physicalAddress" value={formData.physicalAddress} onChange={handleFormChange} />
            
            <button className="btn-primary mt-4" onClick={updateCustomerData}>💾 Save Profile to Ledger</button>
          </div>
        )}

        {isCustomer && activeTab === 'Access' && (
          <div className="card">
            <h3>Registered Banks</h3>
            <p>Control who has access to read your Identity Profile.</p>
            <table>
              <thead>
                <tr>
                  <th>Bank Name</th>
                  <th>Bank Address</th>
                  <th>View Access</th>
                  <th>Approval Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {customerBankStatuses.map(b => (
                  <tr key={b.bankAddress}>
                    <td><strong>{b.bankName}</strong></td>
                    <td><small>{b.bankAddress.slice(0,10)}...</small></td>
                    <td>{b.hasAccess ? <span className="badge badge-approved">Granted</span> : <span className="badge badge-rejected">Revoked</span>}</td>
                    <td><span className={`badge badge-${b.status.toLowerCase()}`}>{b.status}</span></td>
                    <td>
                      {b.hasAccess ? (
                        <button className="btn-danger" onClick={() => revokeAccess(b.bankAddress)}>Revoke</button>
                      ) : (
                        <button onClick={() => grantAccess(b.bankAddress)}>Grant Access</button>
                      )}
                    </td>
                  </tr>
                ))}
                {customerBankStatuses.length === 0 && <tr><td colSpan="5">No banks registered on the network yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {/* --- BANK VIEWS --- */}
        {isBank && activeTab === 'Home' && (
          <div>
            <div className="stats-grid">
              <div className="stat-card">
                <div>Total Granted Accesses</div>
                <div className="stat-value">{pendingRequests.length}</div>
              </div>
              <div className="stat-card">
                <div>Pending Actions</div>
                <div className="stat-value">{pendingRequests.filter(r => r.status === 'Pending').length}</div>
              </div>
            </div>
          </div>
        )}

        {isBank && activeTab === 'Requests' && !selectedRequest && (
          <div className="card">
            <h3>Customers (Access Granted)</h3>
            <table>
              <thead>
                <tr>
                  <th>Customer Address</th>
                  <th>Username</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingRequests.filter(r => r.status === 'Pending').map(r => (
                  <tr key={r.address}>
                    <td><small>{r.address}</small></td>
                    <td>{r.userName}</td>
                    <td><span className={`badge badge-${r.status.toLowerCase()}`}>{r.status}</span></td>
                    <td>
                      <button onClick={() => setSelectedRequest(r)}>View Full Info</button>
                    </td>
                  </tr>
                ))}
                {pendingRequests.filter(r => r.status === 'Pending').length === 0 && <tr><td colSpan="4">No pending customers in the queue.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {isBank && activeTab === 'Requests' && selectedRequest && (
          <div className="card" style={{maxWidth: 800}}>
            <button className="btn-outline mb-4" onClick={() => setSelectedRequest(null)}>← Back to Queue</button>
            <h3>Reviewing Applicant: {selectedRequest.userName}</h3>
            <p><strong>Address:</strong> {selectedRequest.address}</p>
            <hr/>
            
            {(() => {
              try {
                const data = JSON.parse(selectedRequest.payload);
                return (
                  <div className="stats-grid" style={{textAlign:'left'}}>
                    <div><label>Full Name</label><h4>{data.fullName || 'N/A'}</h4></div>
                    <div><label>Date of Birth</label><h4>{data.dob || 'N/A'}</h4></div>
                    <div><label>ID Number</label><h4>{data.idNumber || 'N/A'}</h4></div>
                    <div><label>Nationality</label><h4>{data.nationality || 'N/A'}</h4></div>
                    <div style={{gridColumn: '1 / -1'}}><label>Physical Address</label><h4>{data.physicalAddress || 'N/A'}</h4></div>
                  </div>
                );
              } catch(e) {
                return <div className="alert alert-error">Customer data payload is invalid or empty.</div>
              }
            })()}

            <hr/>
            <div className="flex gap-4 mt-4">
               <button className="btn-primary" onClick={() => setKYCStatus(selectedRequest.address, true)}>Approve KYC</button>
               <button className="btn-danger" onClick={() => setKYCStatus(selectedRequest.address, false)}>Reject KYC</button>
            </div>
            {selectedRequest.status !== 'Pending' && <p className="mt-4">Current Status: <span className={`badge badge-${selectedRequest.status.toLowerCase()}`}>{selectedRequest.status}</span></p>}
          </div>
        )}

        {isBank && activeTab === 'Processed' && !selectedRequest && (
          <div className="card">
            <h3>Processed Customers (Previous History)</h3>
            <p>Customers whose KYC requests you have already approved or rejected.</p>
            <table>
              <thead>
                <tr>
                  <th>Customer Address</th>
                  <th>Username</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingRequests.filter(r => r.status !== 'Pending').map(r => (
                  <tr key={r.address}>
                    <td><small>{r.address}</small></td>
                    <td>{r.userName}</td>
                    <td><span className={`badge badge-${r.status.toLowerCase()}`}>{r.status}</span></td>
                    <td>
                      <button onClick={() => setSelectedRequest(r)}>View</button>
                    </td>
                  </tr>
                ))}
                {pendingRequests.filter(r => r.status !== 'Pending').length === 0 && <tr><td colSpan="4">No processed customers in history.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        
        {isBank && activeTab === 'Processed' && selectedRequest && (
          <div className="card" style={{maxWidth: 800}}>
            <button className="btn-outline mb-4" onClick={() => setSelectedRequest(null)}>← Back to List</button>
            <h3>Reviewing Previously Processed: {selectedRequest.userName}</h3>
            <p><strong>Address:</strong> {selectedRequest.address}</p>
            <hr/>
            
            {(() => {
              try {
                const data = JSON.parse(selectedRequest.payload);
                return (
                  <div className="stats-grid" style={{textAlign:'left'}}>
                    <div><label>Full Name</label><h4>{data.fullName || 'N/A'}</h4></div>
                    <div><label>Date of Birth</label><h4>{data.dob || 'N/A'}</h4></div>
                    <div><label>ID Number</label><h4>{data.idNumber || 'N/A'}</h4></div>
                    <div><label>Nationality</label><h4>{data.nationality || 'N/A'}</h4></div>
                    <div style={{gridColumn: '1 / -1'}}><label>Physical Address</label><h4>{data.physicalAddress || 'N/A'}</h4></div>
                  </div>
                );
              } catch(e) {
                return <div className="alert alert-error">Customer data payload is invalid or empty.</div>
              }
            })()}

            <hr/>
            <p className="mt-4"><strong>Current Status:</strong> <span className={`badge badge-${selectedRequest.status.toLowerCase()}`}>{selectedRequest.status}</span></p>
            <p><small>You may still modify the status if new findings arise.</small></p>
            <div className="flex gap-4 mt-4">
               <button className="btn-primary" onClick={() => setKYCStatus(selectedRequest.address, true)}>Change to Approved</button>
               <button className="btn-danger" onClick={() => setKYCStatus(selectedRequest.address, false)}>Change to Rejected</button>
            </div>
          </div>
        )}

        {isBank && activeTab === 'Feedbacks' && (
          <div className="card">
            <h3>Customer Feedbacks</h3>
            <p>What customers are saying about your services.</p>
            {bankFeedbacks.length === 0 ? (
              <p style={{color: '#8b949e'}}>No feedback received yet.</p>
            ) : (
              <div style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
                {bankFeedbacks.map((fb, idx) => (
                  <div key={idx} style={{padding: '1rem', border: '1px solid #30363d', borderRadius: '8px', textAlign: 'left'}}>
                    <div style={{fontWeight: 'bold', marginBottom: '0.5rem'}}>{fb.userName} <span style={{fontSize:'0.8rem', color:'#8b949e'}}>({fb.customer.slice(0,8)}...)</span></div>
                    <div>{fb.message}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {isCustomer && activeTab === 'Feedback' && (
          <div className="card" style={{maxWidth: 600}}>
            <h3>Leave Feedback for a Bank</h3>
            <p>Your feedback helps improve the network.</p>
            
            <label>Select Bank</label>
            <select value={selectedBankForFeedback} onChange={e => setSelectedBankForFeedback(e.target.value)} style={{width: '100%', padding: '0.8rem', marginBottom: '1rem', background: '#0d1117', color: 'white', border: '1px solid #30363d', borderRadius: '4px'}}>
              <option value="">-- Choose a Bank --</option>
              {allBanks.map(b => (
                <option key={b.ethAddress} value={b.ethAddress}>{b.name} ({b.ethAddress.slice(0,8)}...)</option>
              ))}
            </select>
            
            <label>Feedback Message</label>
            <textarea 
              value={feedbackText} 
              onChange={e => setFeedbackText(e.target.value)} 
              rows={4}
              style={{width: '100%', padding: '0.8rem', marginBottom: '1rem', background: '#0d1117', color: 'white', border: '1px solid #30363d', borderRadius: '4px'}}
              placeholder="Share your experience..."
            ></textarea>
            
            <button className="btn-primary" onClick={submitFeedback}>✉️ Submit Feedback</button>
          </div>
        )}

      </div>
    </div>
  );
}

export default App;
