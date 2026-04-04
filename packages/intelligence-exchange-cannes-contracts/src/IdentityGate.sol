// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IdentityGate
/// @notice On-chain mirror for backend World verification state.
contract IdentityGate {
    error Unauthorized();

    bytes32 public constant POSTER_ROLE = keccak256("poster");
    bytes32 public constant WORKER_ROLE = keccak256("worker");
    bytes32 public constant REVIEWER_ROLE = keccak256("reviewer");

    address public owner;
    address public attestor;

    mapping(address account => mapping(bytes32 role => bool verified)) private verifiedRoles;

    event RoleVerificationUpdated(address indexed account, bytes32 indexed role, bool verified);
    event AttestorUpdated(address indexed attestor);

    constructor(address _attestor) {
        owner = msg.sender;
        attestor = _attestor;
    }

    modifier onlyAttestor() {
        if (msg.sender != attestor && msg.sender != owner) revert Unauthorized();
        _;
    }

    function setVerified(address account, bytes32 role, bool verified) external onlyAttestor {
        verifiedRoles[account][role] = verified;
        emit RoleVerificationUpdated(account, role, verified);
    }

    function isVerified(address account, bytes32 role) external view returns (bool) {
        return verifiedRoles[account][role];
    }

    function setAttestor(address _attestor) external {
        if (msg.sender != owner) revert Unauthorized();
        attestor = _attestor;
        emit AttestorUpdated(_attestor);
    }
}
