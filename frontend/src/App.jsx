import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import KYCArtifact from './config/KYC.json';
import contractAddress from './config/contract-address.json';

// ── Config ─────────────────────────────────────────────────────────
const GANACHE_URL = "http://127.0.0.1:8545";
const API_URL = "http://localhost:4000/api";

// ── Helpers ────────────────────────────────────────────────────────
const api = (path, opts = {}) => {
  const token = localStorage.getItem("kyc_token");
  return fetch(`${API_URL}${path}`, {
    ...opts,
    headers: {
      ...(opts.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
  }).then(async (r) => {
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Request failed");
    return data;
  });
};

const STATUS_MAP = ["None", "Pending", "Accepted", "Submitted", "Verified", "Rejected"];
const STATUS_FLOW = ["Pending", "Accepted", "Submitted", "Verified"];
const shortAddr = (a) => a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";

// ════════════════════════════════════════════════════════════════════
// MAIN APP
// ════════════════════════════════════════════════════════════════════
export default function App() {
  // ── Auth state ────────────────────────────────────────────────
  const [user, setUser] = useState(null);   // { id, username, role, displayName, ethAddress }
  const [authTab, setAuthTab] = useState("login");
  const [authForm, setAuthForm] = useState({ username: "", password: "", displayName: "", role: "customer" });
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // ── Blockchain state ──────────────────────────────────────────
  const [contract, setContract] = useState(null);
  const [isRegisteredOnChain, setIsRegisteredOnChain] = useState(false);

  // ── UI state ──────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // ── Data state ────────────────────────────────────────────────
  const [kycRequests, setKycRequests] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [allCustomers, setAllCustomers] = useState([]);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [selectedReviewDocs, setSelectedReviewDocs] = useState([]);
  const [selectedReviewProfile, setSelectedReviewProfile] = useState(null);

  // Profile state
  const [profile, setProfile] = useState({ fullName: "", email: "", phone: "", dob: "", gender: "", address: "" });
  const [profileErrors, setProfileErrors] = useState({});

  // Document form
  const [docForm, setDocForm] = useState({ docType: "aadhar", docNumber: "", file: null });
  const [docErrors, setDocErrors] = useState("");

  // Initiate KYC form
  const [initiateAddr, setInitiateAddr] = useState("");

  // Document selection for submission
  const [selectedDocIds, setSelectedDocIds] = useState({}); // { requestId: [docId1, docId2] }

  const toggleDocSelection = (reqId, docId) => {
    setSelectedDocIds(prev => {
      const current = prev[reqId] || [];
      const next = current.includes(docId)
        ? current.filter(id => id !== docId)
        : [...current, docId];
      return { ...prev, [reqId]: next };
    });
  };

  // ── Boot: restore session ─────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem("kyc_token");
    const saved = localStorage.getItem("kyc_user");
    if (token && saved) {
      try {
        const u = JSON.parse(saved);
        setUser(u);
      } catch { localStorage.clear(); }
    }
  }, []);

  // ── Setup contract when user is available ─────────────────────
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const provider = new ethers.JsonRpcProvider(GANACHE_URL);
        const signer = await provider.getSigner(user.ethAddress);
        const c = new ethers.Contract(contractAddress.address, KYCArtifact.abi, signer);
        setContract(c);

        // Check if already registered on-chain
        const isBk = await c.isBank(user.ethAddress);
        const isCu = await c.isCustomer(user.ethAddress);
        setIsRegisteredOnChain(isBk || isCu);

        // Auto-register on chain if not yet
        if (!isBk && !isCu) {
          if (user.role === "bank") {
            const tx = await c.registerBank(user.displayName);
            await tx.wait();
          } else {
            const tx = await c.registerCustomer(user.displayName);
            await tx.wait();
          }
          setIsRegisteredOnChain(true);
        }
      } catch (err) {
        console.error("Contract setup error:", err);
        setErrorMsg("Blockchain connection failed. Is Ganache running?");
      }
    })();
  }, [user]);

  // ── Data fetchers ─────────────────────────────────────────────
  const fetchKycRequests = useCallback(async () => {
    if (!contract || !user) return;
    try {
      let ids;
      if (user.role === "bank") {
        ids = await contract.getBankRequestIds(user.ethAddress);
      } else {
        ids = await contract.getCustomerRequestIds(user.ethAddress);
      }
      const reqs = [];
      for (const id of ids) {
        const r = await contract.getRequest(id);
        const [bankName, customerName] = await Promise.all([
          contract.bankNames(r.bank),
          contract.customerNames(r.customer)
        ]);
        reqs.push({
          id: Number(id),
          bank: r.bank,
          bankName,
          customer: r.customer,
          customerName,
          status: STATUS_MAP[Number(r.status)],
          documentHash: r.documentHash,
          createdAt: Number(r.createdAt),
          updatedAt: Number(r.updatedAt),
        });
      }
      setKycRequests(reqs.reverse());
    } catch (err) { console.error(err); }
  }, [contract, user]);

  const fetchDocuments = useCallback(async () => {
    if (!user) return;
    try {
      const docs = await api("/documents");
      setDocuments(docs);
    } catch (err) { console.error(err); }
  }, [user]);

  const fetchProfile = useCallback(async () => {
    if (!user) return;
    try {
      const p = await api("/profile");
      setProfile({
        fullName: p.full_name || "",
        email: p.email || "",
        phone: p.phone || "",
        dob: p.dob || "",
        gender: p.gender || "",
        address: p.address || "",
      });
    } catch (err) { console.error(err); }
  }, [user]);

  const fetchCustomers = useCallback(async () => {
    if (!user || user.role !== "bank") return;
    try {
      const c = await api("/users/customers");
      setAllCustomers(c);
    } catch (err) { console.error(err); }
  }, [user]);

  // Fetch everything on contract ready
  useEffect(() => {
    if (contract && isRegisteredOnChain) {
      fetchKycRequests();
      fetchDocuments();
      fetchProfile();
      fetchCustomers();
    }
  }, [contract, isRegisteredOnChain, fetchKycRequests, fetchDocuments, fetchProfile, fetchCustomers]);

  // ── Auth handlers ─────────────────────────────────────────────
  const clearMessages = () => { setErrorMsg(""); setSuccessMsg(""); };

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    try {
      let data;
      if (authTab === "login") {
        data = await api("/login", {
          method: "POST",
          body: JSON.stringify({ username: authForm.username, password: authForm.password }),
        });
      } else {
        data = await api("/register", {
          method: "POST",
          body: JSON.stringify({
            username: authForm.username,
            password: authForm.password,
            role: authForm.role,
            displayName: authForm.displayName,
          }),
        });
      }
      localStorage.setItem("kyc_token", data.token);
      localStorage.setItem("kyc_user", JSON.stringify(data.user));
      setUser(data.user);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("kyc_token");
    localStorage.removeItem("kyc_user");
    setUser(null);
    setContract(null);
    setIsRegisteredOnChain(false);
    setActiveTab("Dashboard");
    setKycRequests([]);
    setDocuments([]);
    setProfile({ fullName: "", email: "", phone: "", dob: "", gender: "", address: "" });
    clearMessages();
  };

  // ── KYC actions ───────────────────────────────────────────────
  const initiateKYC = async () => {
    if (!contract || !initiateAddr) return;
    clearMessages();
    setLoading(true);
    try {
      const tx = await contract.initiateKYC(initiateAddr);
      await tx.wait();
      setSuccessMsg("KYC Request initiated on blockchain!");
      setInitiateAddr("");
      await fetchKycRequests();
    } catch (err) { setErrorMsg(err.reason || err.message); }
    finally { setLoading(false); }
  };

  const acceptKYC = async (reqId) => {
    if (!contract) return;
    clearMessages();
    setLoading(true);
    try {
      const tx = await contract.acceptRequest(reqId);
      await tx.wait();
      setSuccessMsg("Request accepted!");
      await fetchKycRequests();
    } catch (err) { setErrorMsg(err.reason || err.message); }
    finally { setLoading(false); }
  };

  const submitKYC = async (reqId) => {
    const selectedIds = selectedDocIds[reqId] || [];
    const toSubmit = documents.filter(d => selectedIds.includes(d.id));

    if (!contract) return;
    if (toSubmit.length === 0) {
      setErrorMsg("Please select at least one document to submit.");
      return;
    }
    clearMessages();
    setLoading(true);
    try {
      // Build a hash from the selected doc numbers
      const payload = toSubmit.map(d => `${d.doc_type}:${d.doc_number}`).join("|");
      const hash = ethers.keccak256(ethers.toUtf8Bytes(payload));
      const tx = await contract.submitKYC(reqId, hash);
      await tx.wait();
      setSuccessMsg("Documents submitted to blockchain!");
      // Clear selection
      setSelectedDocIds(prev => {
        const next = { ...prev };
        delete next[reqId];
        return next;
      });
      await fetchKycRequests();
    } catch (err) { setErrorMsg(err.reason || err.message); }
    finally { setLoading(false); }
  };

  const verifyKYC = async (reqId) => {
    if (!contract) return;
    clearMessages();
    setLoading(true);
    try {
      const tx = await contract.verifyKYC(reqId);
      await tx.wait();
      setSuccessMsg("KYC Verified on blockchain!");
      setSelectedRequest(null);
      await fetchKycRequests();
    } catch (err) { setErrorMsg(err.reason || err.message); }
    finally { setLoading(false); }
  };

  const rejectKYC = async (reqId) => {
    if (!contract) return;
    clearMessages();
    setLoading(true);
    try {
      const tx = await contract.rejectKYC(reqId);
      await tx.wait();
      setSuccessMsg("KYC Rejected.");
      setSelectedRequest(null);
      await fetchKycRequests();
    } catch (err) { setErrorMsg(err.reason || err.message); }
    finally { setLoading(false); }
  };

  const reopenKYC = async (reqId) => {
    if (!contract) return;
    clearMessages();
    setLoading(true);
    try {
      const tx = await contract.reopenRequest(reqId);
      await tx.wait();
      setSuccessMsg("Request re-opened! You can now update your documents and re-submit.");
      await fetchKycRequests();
    } catch (err) { setErrorMsg(err.reason || err.message); }
    finally { setLoading(false); }
  };

  // ── Document validation ────────────────────────────────────────
  const validateDocNumber = (type, number) => {
    const n = number.replace(/\s/g, "");
    if (type === "aadhar") {
      if (!/^\d{12}$/.test(n)) return "Aadhar must be exactly 12 digits";
    } else if (type === "pan") {
      if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(n.toUpperCase())) return "PAN must be in format ABCDE1234F";
    } else if (type === "voter") {
      if (!/^[A-Z]{3}\d{7}$/.test(n.toUpperCase())) return "Voter ID must be in format ABC1234567";
    }
    return "";
  };

  // ── Document actions ──────────────────────────────────────────
  const uploadDocument = async (e) => {
    e.preventDefault();
    clearMessages();
    setDocErrors("");

    // Validate document number format
    const validationErr = validateDocNumber(docForm.docType, docForm.docNumber);
    if (validationErr) { setDocErrors(validationErr); return; }

    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("docType", docForm.docType);
      fd.append("docNumber", docForm.docNumber.replace(/\s/g, "").toUpperCase());
      if (docForm.file) fd.append("file", docForm.file);
      await api("/documents", { method: "POST", body: fd });
      setSuccessMsg("Document saved!");
      setDocForm({ docType: "aadhar", docNumber: "", file: null });
      setDocErrors("");
      await fetchDocuments();
    } catch (err) { setErrorMsg(err.message); }
    finally { setLoading(false); }
  };

  // ── Profile actions ───────────────────────────────────────────
  const saveProfile = async (e) => {
    e.preventDefault();
    clearMessages();
    setProfileErrors({});

    // Client-side validation
    const errs = {};
    if (!profile.fullName || profile.fullName.trim().length < 2) errs.fullName = "Min 2 characters";
    if (!profile.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) errs.email = "Invalid email";
    if (!profile.phone || !/^[6-9]\d{9}$/.test(profile.phone)) errs.phone = "Valid 10-digit Indian mobile";
    if (!profile.dob) errs.dob = "Required";
    if (!profile.gender) errs.gender = "Required";
    if (!profile.address || profile.address.trim().length < 5) errs.address = "Min 5 characters";

    if (Object.keys(errs).length > 0) { setProfileErrors(errs); return; }

    setLoading(true);
    try {
      await api("/profile", { method: "POST", body: JSON.stringify(profile) });
      setSuccessMsg("Profile saved successfully!");
      setProfileErrors({});
    } catch (err) { setErrorMsg(err.message); }
    finally { setLoading(false); }
  };

  // ── Bank: load docs + profile for a specific customer ─────────
  const loadCustomerDocs = async (ethAddress) => {
    try {
      const u = await api(`/users/by-address/${ethAddress}`);
      const docs = await api(`/documents/${u.id}`);
      setSelectedReviewDocs(docs);
      const prof = await api(`/profile/${u.id}`);
      setSelectedReviewProfile(prof);
    } catch (err) {
      setSelectedReviewDocs([]);
      setSelectedReviewProfile(null);
      console.error(err);
    }
  };

  // ── Force refresh ─────────────────────────────────────────────
  const forceRefresh = async () => {
    clearMessages();
    await fetchKycRequests();
    await fetchDocuments();
    await fetchProfile();
    await fetchCustomers();
    setSuccessMsg("Data refreshed!");
    setTimeout(() => setSuccessMsg(""), 2000);
  };

  // ── Status stepper component ──────────────────────────────────
  const StatusStepper = ({ status }) => {
    const isRejected = status === "Rejected";
    const currentIdx = STATUS_FLOW.indexOf(status);
    return (
      <div className="status-stepper">
        {STATUS_FLOW.map((s, i) => {
          let cls = "step";
          if (isRejected) cls += " rejected";
          else if (i < currentIdx) cls += " done";
          else if (i === currentIdx) cls += " active";
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
              <div className={cls}>
                <div className="step-dot">
                  {isRejected && i === currentIdx ? "✕" : (i < currentIdx ? "✓" : i + 1)}
                </div>
                <div className="step-label">{s}</div>
              </div>
              {i < STATUS_FLOW.length - 1 && (
                <div className={`step-connector ${i < currentIdx ? 'done' : ''}`} />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // ════════════════════════════════════════════════════════════════
  // RENDER: Login / Signup
  // ════════════════════════════════════════════════════════════════
  if (!user) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="logo-icon">🔗</div>
          <h2>KYC Chain Portal</h2>
          <p>Blockchain-powered identity verification</p>

          <div className="auth-tabs">
            <button className={`auth-tab ${authTab === 'login' ? 'active' : ''}`} onClick={() => { setAuthTab('login'); setAuthError(''); }}>Sign In</button>
            <button className={`auth-tab ${authTab === 'signup' ? 'active' : ''}`} onClick={() => { setAuthTab('signup'); setAuthError(''); }}>Create Account</button>
          </div>

          <form onSubmit={handleAuth}>
            {authTab === "signup" && (
              <>
                <label>Display Name</label>
                <input
                  placeholder="e.g. HDFC Bank or John Doe"
                  value={authForm.displayName}
                  onChange={e => setAuthForm({ ...authForm, displayName: e.target.value })}
                  required
                />
                <label>Role</label>
                <div className="role-selector">
                  <button type="button" className={`role-btn ${authForm.role === 'customer' ? 'active' : ''}`} onClick={() => setAuthForm({ ...authForm, role: 'customer' })}>
                    👤 Customer
                  </button>
                  <button type="button" className={`role-btn ${authForm.role === 'bank' ? 'active' : ''}`} onClick={() => setAuthForm({ ...authForm, role: 'bank' })}>
                    🏦 Bank
                  </button>
                </div>
              </>
            )}
            <label>Username</label>
            <input
              placeholder="Enter username"
              value={authForm.username}
              onChange={e => setAuthForm({ ...authForm, username: e.target.value })}
              required
            />
            <label>Password</label>
            <input
              type="password"
              placeholder="Enter password"
              value={authForm.password}
              onChange={e => setAuthForm({ ...authForm, password: e.target.value })}
              required
            />

            {authError && <div className="alert alert-error">{authError}</div>}

            <button className="btn-primary w-full mt-3" type="submit" disabled={authLoading}>
              {authLoading && <span className="spinner" />}
              {authTab === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // RENDER: Dashboard
  // ════════════════════════════════════════════════════════════════
  const isBank = user.role === "bank";
  const isCustomer = user.role === "customer";

  // Tab config per role
  const navItems = isBank
    ? [
      { key: "Dashboard", icon: "📊", label: "Dashboard" },
      { key: "Initiate", icon: "📤", label: "Initiate KYC" },
      { key: "Requests", icon: "📥", label: "KYC Queue" },
    ]
    : [
      { key: "Dashboard", icon: "📊", label: "Dashboard" },
      { key: "Profile", icon: "👤", label: "My Profile" },
      { key: "KYCStatus", icon: "🔐", label: "KYC Requests" },
      { key: "Documents", icon: "📄", label: "My Documents" },
    ];

  return (
    <div className="dashboard-layout">

      {/* ── SIDEBAR ──────────────────────────────────────────────── */}
      <div className="sidebar">
        <div className="sidebar-title">
          {isBank ? '🏦' : '👤'} {user.displayName}
        </div>

        {navItems.map(n => (
          <div
            key={n.key}
            className={`nav-item ${activeTab === n.key ? 'active' : ''}`}
            onClick={() => { setActiveTab(n.key); setSelectedRequest(null); clearMessages(); }}
          >
            {n.icon} {n.label}
          </div>
        ))}

        <div className="nav-divider" />
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '0 0.5rem', marginBottom: '0.5rem' }}>
          Eth: {shortAddr(user.ethAddress)}
        </div>

        <div style={{ flex: 1 }} />
        <button className="btn-outline w-full" onClick={handleLogout}>Logout</button>
      </div>

      {/* ── MAIN CONTENT ─────────────────────────────────────────── */}
      <div className="main-content">
        <div className="page-header">
          <div className="flex gap-3 items-center">
            <h2>{activeTab === "KYCStatus" ? "KYC Requests" : activeTab === "Profile" ? "My Profile" : activeTab}</h2>
            <button className="btn-outline" onClick={forceRefresh} style={{ padding: '0.4rem 0.8rem', fontSize: '0.78rem' }}>🔄 Refresh</button>
          </div>
          <span className="address-tag">{user.role === 'bank' ? '🏦 Bank' : '👤 Customer'} • {user.username}</span>
        </div>

        {errorMsg && <div className="alert alert-error">{errorMsg}</div>}
        {successMsg && <div className="alert alert-success">{successMsg}</div>}

        {/* ═══════════════════════════════════════════════════════════
            CUSTOMER VIEWS
           ═══════════════════════════════════════════════════════════ */}

        {/* ── Customer Dashboard ─────────────────────────────────── */}
        {isCustomer && activeTab === "Dashboard" && (
          <div>
            <div className="stats-grid">
              <div className="stat-card purple">
                <div className="stat-label">Total KYC Requests</div>
                <div className="stat-value">{kycRequests.length}</div>
              </div>
              <div className="stat-card green">
                <div className="stat-label">Verified</div>
                <div className="stat-value">{kycRequests.filter(r => r.status === 'Verified').length}</div>
              </div>
              <div className="stat-card amber">
                <div className="stat-label">Pending Action</div>
                <div className="stat-value">{kycRequests.filter(r => ['Pending', 'Accepted'].includes(r.status)).length}</div>
              </div>
              <div className="stat-card blue">
                <div className="stat-label">Documents</div>
                <div className="stat-value">{documents.length}</div>
              </div>
            </div>
            <div className="card">
              <h3>Welcome back, {user.displayName}</h3>
              <p>Use the sidebar to complete your profile, upload identity documents, and respond to KYC requests from banks.</p>
            </div>
          </div>
        )}

        {/* ── Customer: KYC Requests ─────────────────────────────── */}
        {isCustomer && activeTab === "KYCStatus" && (
          <div>
            {kycRequests.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📭</div>
                <h3>No KYC Requests Yet</h3>
                <p>Banks will initiate KYC requests for you. They'll appear here.</p>
              </div>
            ) : (
              kycRequests.map(req => (
                <div className="card" key={req.id}>
                  <div className="flex justify-between items-center mb-3">
                    <div>
                      <h3 style={{ marginBottom: '0.1rem' }}>Request #{req.id}</h3>
                      <p style={{ margin: 0, fontSize: '0.82rem' }}>From Bank: <strong>{req.bankName}</strong> ({shortAddr(req.bank)})</p>
                    </div>
                    <span className={`badge badge-${req.status.toLowerCase()}`}>{req.status}</span>
                  </div>

                  <StatusStepper status={req.status} />

                  <div className="flex gap-3 mt-3">
                    {req.status === "Pending" && (
                      <button className="btn-primary" onClick={() => acceptKYC(req.id)} disabled={loading}>
                        ✓ Accept Request
                      </button>
                    )}
                    {req.status === "Accepted" && (
                      <div style={{ width: '100%' }}>
                        <div style={{ marginBottom: '1rem', border: '1px solid var(--border)', borderRadius: '8px', padding: '1rem', background: 'rgba(0,0,0,0.02)' }}>
                          <h4 style={{ marginTop: 0, marginBottom: '0.8rem', fontSize: '0.9rem', color: 'var(--text-main)' }}>Select Documents to Share</h4>
                          {documents.length === 0 ? (
                            <p style={{ fontSize: '0.8rem', color: 'var(--red)', margin: 0 }}>No documents found. Please upload documents in "My Documents" first.</p>
                          ) : (
                            <div className="flex flex-col gap-2">
                              {documents.map(d => (
                                <label key={d.id} className="flex gap-2 items-center cursor-pointer hover:opacity-80" style={{ fontSize: '0.85rem' }}>
                                  <input 
                                    type="checkbox" 
                                    style={{ width: '16px', height: '16px' }}
                                    checked={(selectedDocIds[req.id] || []).includes(d.id)}
                                    onChange={() => toggleDocSelection(req.id, d.id)}
                                  />
                                  <span style={{ textTransform: 'capitalize' }}>{d.doc_type}</span>
                                  <code style={{ fontSize: '0.75rem', background: 'var(--bg-light)', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>{d.doc_number}</code>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                        <button 
                          className="btn-success w-full" 
                          onClick={() => submitKYC(req.id)} 
                          disabled={loading || (selectedDocIds[req.id] || []).length === 0}
                        >
                          {loading ? <span className="spinner" /> : '📤'} Submit Selected Documents
                        </button>
                      </div>
                    )}
                    {(req.status === "Submitted") && (
                      <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.85rem' }}>⏳ Waiting for bank verification…</p>
                    )}
                    {req.status === "Verified" && (
                      <p style={{ color: 'var(--green)', margin: 0, fontWeight: 600 }}>✓ Your identity has been verified!</p>
                    )}
                    {req.status === "Rejected" && (
                      <div className="flex-col gap-2">
                        <p style={{ color: 'var(--red)', margin: 0, fontWeight: 600 }}>✕ This request was rejected by the bank.</p>
                        <button className="btn-primary" onClick={() => reopenKYC(req.id)} disabled={loading} style={{ width: 'fit-content' }}>
                          {loading && <span className="spinner" />} 🔄 Re-apply — Update & Re-submit
                        </button>
                        <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.8rem' }}>Update your profile & documents, then re-submit for review.</p>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Customer: My Profile ──────────────────────────────── */}
        {isCustomer && activeTab === "Profile" && (
          <div className="card" style={{ maxWidth: 650 }}>
            <h3>Personal Information</h3>
            <p>Complete your profile. This information is stored securely in the database and shared with banks during KYC verification.</p>

            <form onSubmit={saveProfile}>
              <label>Full Name <span style={{ color: 'var(--red)' }}>*</span></label>
              <input
                placeholder="e.g. Rajesh Kumar Sharma"
                value={profile.fullName}
                onChange={e => setProfile({ ...profile, fullName: e.target.value })}
              />
              {profileErrors.fullName && <div style={{ color: 'var(--red)', fontSize: '0.8rem', marginTop: '-0.75rem', marginBottom: '0.5rem' }}>{profileErrors.fullName}</div>}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1rem' }}>
                <div>
                  <label>Email <span style={{ color: 'var(--red)' }}>*</span></label>
                  <input
                    type="email"
                    placeholder="e.g. rajesh@email.com"
                    value={profile.email}
                    onChange={e => setProfile({ ...profile, email: e.target.value })}
                  />
                  {profileErrors.email && <div style={{ color: 'var(--red)', fontSize: '0.8rem', marginTop: '-0.75rem', marginBottom: '0.5rem' }}>{profileErrors.email}</div>}
                </div>
                <div>
                  <label>Phone Number <span style={{ color: 'var(--red)' }}>*</span></label>
                  <input
                    placeholder="e.g. 9876543210"
                    maxLength={10}
                    value={profile.phone}
                    onChange={e => setProfile({ ...profile, phone: e.target.value.replace(/\D/g, '') })}
                  />
                  {profileErrors.phone && <div style={{ color: 'var(--red)', fontSize: '0.8rem', marginTop: '-0.75rem', marginBottom: '0.5rem' }}>{profileErrors.phone}</div>}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1rem' }}>
                <div>
                  <label>Date of Birth <span style={{ color: 'var(--red)' }}>*</span></label>
                  <input
                    type="date"
                    value={profile.dob}
                    onChange={e => setProfile({ ...profile, dob: e.target.value })}
                  />
                  {profileErrors.dob && <div style={{ color: 'var(--red)', fontSize: '0.8rem', marginTop: '-0.75rem', marginBottom: '0.5rem' }}>{profileErrors.dob}</div>}
                </div>
                <div>
                  <label>Gender <span style={{ color: 'var(--red)' }}>*</span></label>
                  <select value={profile.gender} onChange={e => setProfile({ ...profile, gender: e.target.value })}>
                    <option value="">-- Select --</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                  {profileErrors.gender && <div style={{ color: 'var(--red)', fontSize: '0.8rem', marginTop: '-0.75rem', marginBottom: '0.5rem' }}>{profileErrors.gender}</div>}
                </div>
              </div>

              <label>Residential Address <span style={{ color: 'var(--red)' }}>*</span></label>
              <textarea
                placeholder="Full address with city, state and pincode"
                rows={3}
                value={profile.address}
                onChange={e => setProfile({ ...profile, address: e.target.value })}
              />
              {profileErrors.address && <div style={{ color: 'var(--red)', fontSize: '0.8rem', marginTop: '-0.75rem', marginBottom: '0.5rem' }}>{profileErrors.address}</div>}

              <button className="btn-primary mt-3" type="submit" disabled={loading}>
                {loading && <span className="spinner" />} 💾 Save Profile
              </button>
            </form>
          </div>
        )}

        {/* ── Customer: My Documents ─────────────────────────────── */}
        {isCustomer && activeTab === "Documents" && (
          <div>
            <div className="card" style={{ maxWidth: 600 }}>
              <h3>Upload Identity Document</h3>
              <p>Your documents are stored securely in the backend database and <em>never</em> placed on the public blockchain.</p>

              <form onSubmit={uploadDocument}>
                <label>Document Type</label>
                <select value={docForm.docType} onChange={e => { setDocForm({ ...docForm, docType: e.target.value }); setDocErrors(""); }}>
                  <option value="aadhar">Aadhar Card</option>
                  <option value="pan">PAN Card</option>
                  <option value="voter">Voter ID</option>
                </select>

                <label>Document Number</label>
                <input
                  placeholder={docForm.docType === 'aadhar' ? 'e.g. 1234 5678 9012 (12 digits)' : docForm.docType === 'pan' ? 'e.g. ABCDE1234F' : 'e.g. ABC1234567'}
                  value={docForm.docNumber}
                  onChange={e => { setDocForm({ ...docForm, docNumber: e.target.value }); setDocErrors(""); }}
                  required
                />
                {docErrors && <div style={{ color: 'var(--red)', fontSize: '0.82rem', marginTop: '-0.75rem', marginBottom: '0.75rem' }}>{docErrors}</div>}

                <label>Upload Scan (optional)</label>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={e => setDocForm({ ...docForm, file: e.target.files[0] })}
                />

                <button className="btn-primary mt-3" type="submit" disabled={loading}>
                  {loading && <span className="spinner" />} 💾 Save Document
                </button>
              </form>
            </div>

            <h3 className="mt-4">Saved Documents</h3>
            {documents.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📁</div>
                <p>No documents uploaded yet.</p>
              </div>
            ) : (
              <div className="doc-grid">
                {documents.map(d => (
                  <div className="doc-card" key={d.id}>
                    <div className="doc-icon">
                      {d.doc_type === 'aadhar' ? '🪪' : d.doc_type === 'pan' ? '💳' : '🗳️'}
                    </div>
                    <h4>{d.doc_type === 'aadhar' ? 'Aadhar Card' : d.doc_type === 'pan' ? 'PAN Card' : 'Voter ID'}</h4>
                    <div className="doc-number">{d.doc_number}</div>
                    <div className="doc-status">
                      {d.file_path ? '📎 File attached' : 'No file'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}



        {/* ═══════════════════════════════════════════════════════════
            BANK VIEWS
           ═══════════════════════════════════════════════════════════ */}

        {/* ── Bank Dashboard ─────────────────────────────────────── */}
        {isBank && activeTab === "Dashboard" && (
          <div>
            <div className="stats-grid">
              <div className="stat-card purple">
                <div className="stat-label">Total Requests</div>
                <div className="stat-value">{kycRequests.length}</div>
              </div>
              <div className="stat-card amber">
                <div className="stat-label">Awaiting Action</div>
                <div className="stat-value">{kycRequests.filter(r => ['Pending', 'Accepted', 'Submitted'].includes(r.status)).length}</div>
              </div>
              <div className="stat-card green">
                <div className="stat-label">Verified</div>
                <div className="stat-value">{kycRequests.filter(r => r.status === 'Verified').length}</div>
              </div>
              <div className="stat-card blue">
                <div className="stat-label">Registered Customers</div>
                <div className="stat-value">{allCustomers.length}</div>
              </div>
            </div>
            <div className="card">
              <h3>Bank Operations Center</h3>
              <p>Initiate KYC requests for customers, review submitted documents, and manage verifications — all recorded immutably on the blockchain.</p>
            </div>
          </div>
        )}

        {/* ── Bank: Initiate KYC ─────────────────────────────────── */}
        {isBank && activeTab === "Initiate" && (
          <div className="card" style={{ maxWidth: 600 }}>
            <h3>Initiate KYC Request</h3>
            <p>Select a registered customer to send a KYC verification request to.</p>

            <label>Customer</label>
            <select value={initiateAddr} onChange={e => setInitiateAddr(e.target.value)}>
              <option value="">-- Select a Customer --</option>
              {allCustomers.map(c => (
                <option key={c.eth_address} value={c.eth_address}>
                  {c.display_name} ({shortAddr(c.eth_address)})
                </option>
              ))}
            </select>

            <button className="btn-primary mt-3" onClick={initiateKYC} disabled={loading || !initiateAddr}>
              {loading && <span className="spinner" />} 📤 Send KYC Request
            </button>
          </div>
        )}

        {/* ── Bank: KYC Queue ────────────────────────────────────── */}
        {isBank && activeTab === "Requests" && !selectedRequest && (
          <div className="card">
            <h3>All KYC Requests</h3>
            {kycRequests.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📭</div>
                <p>No requests yet. Go to "Initiate KYC" to start.</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Customer</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {kycRequests.map(r => (
                    <tr key={r.id}>
                      <td>#{r.id}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{r.customerName}</div>
                        <small style={{ color: 'var(--text-muted)' }}>{shortAddr(r.customer)}</small>
                      </td>
                      <td><span className={`badge badge-${r.status.toLowerCase()}`}>{r.status}</span></td>
                      <td><small>{new Date(r.createdAt * 1000).toLocaleDateString()}</small></td>
                      <td>
                        <button className="btn-outline" style={{ padding: '0.35rem 0.7rem', fontSize: '0.8rem' }} onClick={async () => {
                          setSelectedRequest(r);
                          if (r.status === 'Submitted' || r.status === 'Verified') {
                            await loadCustomerDocs(r.customer);
                          }
                        }}>
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Bank: Request Detail / Review ──────────────────────── */}
        {isBank && activeTab === "Requests" && selectedRequest && (
          <div className="card" style={{ maxWidth: 800 }}>
            <button className="btn-outline mb-4" onClick={() => { setSelectedRequest(null); setSelectedReviewDocs([]); setSelectedReviewProfile(null); }}>
              ← Back to Queue
            </button>
            <div className="flex justify-between items-center">
              <h3>Request #{selectedRequest.id}</h3>
              <span className={`badge badge-${selectedRequest.status.toLowerCase()}`}>{selectedRequest.status}</span>
            </div>

            <StatusStepper status={selectedRequest.status} />

            <div className="review-grid">
              <div>
                <div className="field-label">Customer</div>
                <div className="field-value"><strong>{selectedRequest.customerName}</strong> <small style={{ fontWeight: 400, color: 'var(--text-muted)' }}>({shortAddr(selectedRequest.customer)})</small></div>
              </div>
              <div>
                <div className="field-label">Bank</div>
                <div className="field-value"><strong>{selectedRequest.bankName}</strong> <small style={{ fontWeight: 400, color: 'var(--text-muted)' }}>({shortAddr(selectedRequest.bank)})</small></div>
              </div>
              <div>
                <div className="field-label">Created</div>
                <div className="field-value">{new Date(selectedRequest.createdAt * 1000).toLocaleString()}</div>
              </div>
              <div>
                <div className="field-label">Last Updated</div>
                <div className="field-value">{new Date(selectedRequest.updatedAt * 1000).toLocaleString()}</div>
              </div>
              {selectedRequest.documentHash && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <div className="field-label">Document Hash (Blockchain)</div>
                  <div className="field-value" style={{ fontSize: '0.8rem', wordBreak: 'break-all', fontFamily: 'monospace', fontWeight: 400 }}>{selectedRequest.documentHash}</div>
                </div>
              )}
            </div>

            {/* Show customer profile if available */}
            {selectedReviewProfile && selectedReviewProfile.full_name && (
              <>
                <hr />
                <h3>Customer Profile</h3>
                <div className="review-grid">
                  <div><div className="field-label">Full Name</div><div className="field-value">{selectedReviewProfile.full_name || 'N/A'}</div></div>
                  <div><div className="field-label">Email</div><div className="field-value">{selectedReviewProfile.email || 'N/A'}</div></div>
                  <div><div className="field-label">Phone</div><div className="field-value">{selectedReviewProfile.phone || 'N/A'}</div></div>
                  <div><div className="field-label">Date of Birth</div><div className="field-value">{selectedReviewProfile.dob || 'N/A'}</div></div>
                  <div><div className="field-label">Gender</div><div className="field-value" style={{ textTransform: 'capitalize' }}>{selectedReviewProfile.gender || 'N/A'}</div></div>
                  <div><div className="field-label">Address</div><div className="field-value">{selectedReviewProfile.address || 'N/A'}</div></div>
                </div>
              </>
            )}

            {/* Show uploaded docs if available */}
            {selectedReviewDocs.length > 0 && (
              <>
                <hr />
                <h3>Submitted Documents</h3>
                <div className="doc-grid">
                  {selectedReviewDocs.map(d => (
                    <div className="doc-card" key={d.id}>
                      <div className="doc-icon">
                        {d.doc_type === 'aadhar' ? '🪪' : d.doc_type === 'pan' ? '💳' : '🗳️'}
                      </div>
                      <h4>{d.doc_type === 'aadhar' ? 'Aadhar Card' : d.doc_type === 'pan' ? 'PAN Card' : 'Voter ID'}</h4>
                      <div className="doc-number">{d.doc_number}</div>
                      <div className="doc-status">
                        {d.file_path ? <a href={`http://localhost:4000${d.file_path}`} target="_blank" rel="noreferrer">📎 View File</a> : 'No file'}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <hr />
            <div className="flex gap-3 flex-wrap items-center">
              {selectedRequest.status === "Submitted" && (
                <>
                  <button className="btn-success" onClick={() => verifyKYC(selectedRequest.id)} disabled={loading}>
                    {loading && <span className="spinner" />} ✓ Verify KYC
                  </button>
                  <button className="btn-danger" onClick={() => rejectKYC(selectedRequest.id)} disabled={loading}>
                    ✕ Reject
                  </button>
                </>
              )}
              {selectedRequest.status === "Pending" && (
                <>
                  <p style={{ color: 'var(--text-muted)', margin: 0 }}>⏳ Waiting for customer to accept…</p>
                  <button className="btn-danger" onClick={() => rejectKYC(selectedRequest.id)} disabled={loading} style={{ marginLeft: 'auto' }}>
                    ✕ Reject Request
                  </button>
                </>
              )}
              {selectedRequest.status === "Accepted" && (
                <>
                  <p style={{ color: 'var(--text-muted)', margin: 0 }}>⏳ Customer accepted, waiting for document submission…</p>
                  <button className="btn-danger" onClick={() => rejectKYC(selectedRequest.id)} disabled={loading} style={{ marginLeft: 'auto' }}>
                    ✕ Reject Request
                  </button>
                </>
              )}
              {selectedRequest.status === "Verified" && (
                <p style={{ color: 'var(--green)', margin: 0, fontWeight: 600 }}>✓ This KYC is fully verified.</p>
              )}
              {selectedRequest.status === "Rejected" && (
                <p style={{ color: 'var(--red)', margin: 0, fontWeight: 600 }}>✕ This request was rejected. Customer can re-apply.</p>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
