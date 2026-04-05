// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract KYC {
    struct Bank {
        string name;
        address ethAddress;
        bool isRegistered;
    }

    struct Customer {
        string userName;
        string dataPayload; // JSON string payload
        bool isRegistered;
    }
    
    mapping(address => Bank) public banks;
    mapping(address => Customer) public customers;
    
    // address[] arrays to fetch lists on frontend
    address[] public registeredBankAddresses;
    address[] public registeredCustomerAddresses;

    // Granular Access Control: Has the customer granted access to the respective bank?
    mapping(address => mapping(address => bool)) public customerBankAccess;
    
    // Status mapping: What is the bank's KYC decision for a specific customer?
    // "None", "Pending", "Approved", "Rejected"
    mapping(address => mapping(address => string)) public bankCustomerStatus;
    
    event BankRegistered(address indexed bankAddress, string name);
    event CustomerRegistered(address indexed customerAddress, string name);
    event AccessGranted(address indexed customerAddress, address indexed bankAddress);
    event AccessRevoked(address indexed customerAddress, address indexed bankAddress);
    event KYCStatusChanged(address indexed customerAddress, address indexed bankAddress, string newStatus);

    function registerBank(string memory _name) public {
        require(!banks[msg.sender].isRegistered, "Bank already exists");
        require(!customers[msg.sender].isRegistered, "Customers cannot be banks");
        banks[msg.sender] = Bank(_name, msg.sender, true);
        registeredBankAddresses.push(msg.sender);
        emit BankRegistered(msg.sender, _name);
    }
    
    function registerCustomer(string memory _userName) public {
        require(!customers[msg.sender].isRegistered, "Customer already exists");
        require(!banks[msg.sender].isRegistered, "Banks cannot be customers");
        customers[msg.sender] = Customer(_userName, "", true);
        registeredCustomerAddresses.push(msg.sender);
        emit CustomerRegistered(msg.sender, _userName);
    }
    
    function updateCustomerData(string memory _dataPayload) public {
        require(customers[msg.sender].isRegistered, "Customer not registered");
        customers[msg.sender].dataPayload = _dataPayload;
    }

    // Customer grants access to a specific bank and sets status to Pending
    function grantAccess(address _bankAddress) public {
        require(customers[msg.sender].isRegistered, "Customer not registered");
        require(banks[_bankAddress].isRegistered, "Target bank is not registered");
        
        customerBankAccess[msg.sender][_bankAddress] = true;
        bankCustomerStatus[_bankAddress][msg.sender] = "Pending";
        
        emit AccessGranted(msg.sender, _bankAddress);
    }
    
    // Customer revokes access to a specific bank
    function revokeAccess(address _bankAddress) public {
        require(customers[msg.sender].isRegistered, "Customer not registered");
        
        customerBankAccess[msg.sender][_bankAddress] = false;
        bankCustomerStatus[_bankAddress][msg.sender] = "None";
        
        emit AccessRevoked(msg.sender, _bankAddress);
    }

    // Bank views customer data (Requires access)
    function viewCustomerKYC(address _customerAddress) public view returns (string memory, string memory, string memory) {
        require(banks[msg.sender].isRegistered, "Only banks can view");
        require(customerBankAccess[_customerAddress][msg.sender], "Access Denied by Customer");
        
        return (
            customers[_customerAddress].userName, 
            customers[_customerAddress].dataPayload, 
            bankCustomerStatus[msg.sender][_customerAddress]
        );
    }
    
    // Bank approves the KYC
    function approveKYC(address _customerAddress) public {
        require(banks[msg.sender].isRegistered, "Only banks can approve");
        require(customerBankAccess[_customerAddress][msg.sender], "Access Denied");
        bankCustomerStatus[msg.sender][_customerAddress] = "Approved";
        emit KYCStatusChanged(_customerAddress, msg.sender, "Approved");
    }
    
    // Bank rejects the KYC
    function rejectKYC(address _customerAddress) public {
        require(banks[msg.sender].isRegistered, "Only banks can reject");
        require(customerBankAccess[_customerAddress][msg.sender], "Access Denied");
        bankCustomerStatus[msg.sender][_customerAddress] = "Rejected";
        emit KYCStatusChanged(_customerAddress, msg.sender, "Rejected");
    }

    // Helper functions for frontend fetching logic
    function getAllBanks() public view returns (Bank[] memory) {
        Bank[] memory activeBanks = new Bank[](registeredBankAddresses.length);
        for(uint i = 0; i < registeredBankAddresses.length; i++) {
            activeBanks[i] = banks[registeredBankAddresses[i]];
        }
        return activeBanks;
    }

    function getAllCustomers() public view returns (Customer[] memory, address[] memory) {
        Customer[] memory activeCustomers = new Customer[](registeredCustomerAddresses.length);
        for(uint i = 0; i < registeredCustomerAddresses.length; i++) {
            activeCustomers[i] = customers[registeredCustomerAddresses[i]];
        }
        return (activeCustomers, registeredCustomerAddresses);
    }

    // Utility to get a customer's specific status with a specific bank
    function getStatusWithBank(address _customerAddress, address _bankAddress) public view returns (string memory, bool) {
        return (bankCustomerStatus[_bankAddress][_customerAddress], customerBankAccess[_customerAddress][_bankAddress]);
    }
}
