// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract KYC {
    // ── State Machine ──────────────────────────────────────────────
    enum Status { None, Pending, Accepted, Submitted, Verified, Rejected }

    struct KYCRequest {
        address bank;
        address customer;
        Status  status;
        string  documentHash;   // IPFS / SHA-256 hash submitted by customer
        uint256 createdAt;
        uint256 updatedAt;
    }

    // requestId → KYCRequest
    mapping(uint256 => KYCRequest) public requests;
    uint256 public requestCount;

    // Lookup helpers
    mapping(address => uint256[]) public customerRequests;   // customer → requestIds
    mapping(address => uint256[]) public bankRequests;        // bank     → requestIds

    // Role tracking (lightweight – real auth lives in the backend)
    mapping(address => bool) public isBank;
    mapping(address => bool) public isCustomer;
    mapping(address => string) public bankNames;
    mapping(address => string) public customerNames;

    address[] public registeredBanks;
    address[] public registeredCustomers;

    // ── Events ─────────────────────────────────────────────────────
    event BankRegistered(address indexed bank, string name);
    event CustomerRegistered(address indexed customer, string name);
    event KYCInitiated(uint256 indexed requestId, address indexed bank, address indexed customer);
    event KYCAccepted(uint256 indexed requestId, address indexed customer);
    event KYCSubmitted(uint256 indexed requestId, address indexed customer, string documentHash);
    event KYCVerified(uint256 indexed requestId, address indexed bank);
    event KYCRejected(uint256 indexed requestId, address indexed bank);
    event KYCReopened(uint256 indexed requestId, address indexed customer);

    // ── Registration ───────────────────────────────────────────────
    function registerBank(string memory _name) external {
        require(!isBank[msg.sender],     "Already registered as bank");
        require(!isCustomer[msg.sender], "Address is a customer");
        isBank[msg.sender] = true;
        bankNames[msg.sender] = _name;
        registeredBanks.push(msg.sender);
        emit BankRegistered(msg.sender, _name);
    }

    function registerCustomer(string memory _name) external {
        require(!isCustomer[msg.sender], "Already registered as customer");
        require(!isBank[msg.sender],     "Address is a bank");
        isCustomer[msg.sender] = true;
        customerNames[msg.sender] = _name;
        registeredCustomers.push(msg.sender);
        emit CustomerRegistered(msg.sender, _name);
    }

    // ── KYC Flow ───────────────────────────────────────────────────

    /// @notice Bank initiates a KYC request for a customer  (NONE → PENDING)
    function initiateKYC(address _customer) external returns (uint256) {
        require(isBank[msg.sender],     "Only banks can initiate");
        require(isCustomer[_customer],  "Target is not a customer");

        uint256 id = requestCount++;
        requests[id] = KYCRequest({
            bank:         msg.sender,
            customer:     _customer,
            status:       Status.Pending,
            documentHash: "",
            createdAt:    block.timestamp,
            updatedAt:    block.timestamp
        });

        bankRequests[msg.sender].push(id);
        customerRequests[_customer].push(id);

        emit KYCInitiated(id, msg.sender, _customer);
        return id;
    }

    /// @notice Customer accepts the bank's request  (PENDING → ACCEPTED)
    function acceptRequest(uint256 _requestId) external {
        KYCRequest storage r = requests[_requestId];
        require(r.customer == msg.sender,    "Not your request");
        require(r.status == Status.Pending,  "Status must be Pending");

        r.status    = Status.Accepted;
        r.updatedAt = block.timestamp;
        emit KYCAccepted(_requestId, msg.sender);
    }

    /// @notice Customer submits document hash  (ACCEPTED → SUBMITTED)
    function submitKYC(uint256 _requestId, string memory _docHash) external {
        KYCRequest storage r = requests[_requestId];
        require(r.customer == msg.sender,     "Not your request");
        require(r.status == Status.Accepted,  "Status must be Accepted");
        require(bytes(_docHash).length > 0,   "Hash cannot be empty");

        r.documentHash = _docHash;
        r.status       = Status.Submitted;
        r.updatedAt    = block.timestamp;
        emit KYCSubmitted(_requestId, msg.sender, _docHash);
    }

    /// @notice Bank verifies the submitted documents  (SUBMITTED → VERIFIED)
    function verifyKYC(uint256 _requestId) external {
        KYCRequest storage r = requests[_requestId];
        require(r.bank == msg.sender,          "Not your request");
        require(r.status == Status.Submitted,  "Status must be Submitted");

        r.status    = Status.Verified;
        r.updatedAt = block.timestamp;
        emit KYCVerified(_requestId, msg.sender);
    }

    /// @notice Bank rejects at any stage after Pending  (→ REJECTED)
    function rejectKYC(uint256 _requestId) external {
        KYCRequest storage r = requests[_requestId];
        require(r.bank == msg.sender,         "Not your request");
        require(r.status != Status.None,      "No request found");
        require(r.status != Status.Verified,  "Already verified");
        require(r.status != Status.Rejected,  "Already rejected");

        r.status    = Status.Rejected;
        r.updatedAt = block.timestamp;
        emit KYCRejected(_requestId, msg.sender);
    }

    /// @notice Customer re-opens a rejected request  (REJECTED → ACCEPTED)
    ///         so they can update docs and re-submit.
    function reopenRequest(uint256 _requestId) external {
        KYCRequest storage r = requests[_requestId];
        require(r.customer == msg.sender,     "Not your request");
        require(r.status == Status.Rejected,  "Status must be Rejected");

        r.status       = Status.Accepted;
        r.documentHash = "";           // clear old hash so customer can re-submit
        r.updatedAt    = block.timestamp;
        emit KYCReopened(_requestId, msg.sender);
    }

    // ── View Helpers ───────────────────────────────────────────────

    function getRequest(uint256 _id) external view returns (KYCRequest memory) {
        return requests[_id];
    }

    function getCustomerRequestIds(address _customer) external view returns (uint256[] memory) {
        return customerRequests[_customer];
    }

    function getBankRequestIds(address _bank) external view returns (uint256[] memory) {
        return bankRequests[_bank];
    }

    function getAllBanks() external view returns (address[] memory, string[] memory) {
        string[] memory names = new string[](registeredBanks.length);
        for (uint i = 0; i < registeredBanks.length; i++) {
            names[i] = bankNames[registeredBanks[i]];
        }
        return (registeredBanks, names);
    }

    function getAllCustomers() external view returns (address[] memory, string[] memory) {
        string[] memory names = new string[](registeredCustomers.length);
        for (uint i = 0; i < registeredCustomers.length; i++) {
            names[i] = customerNames[registeredCustomers[i]];
        }
        return (registeredCustomers, names);
    }
}
