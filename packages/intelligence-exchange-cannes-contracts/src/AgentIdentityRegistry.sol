// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IdentityGate} from "./IdentityGate.sol";

/// @title AgentIdentityRegistry
/// @notice Authorization-time agent identity registration plus attested reputation updates.
contract AgentIdentityRegistry {
    error AgentAlreadyRegistered(bytes32 fingerprint);
    error AgentNotFound(bytes32 fingerprint);
    error Unauthorized();
    error InvalidScore(uint256 score);
    error InvalidRole();
    error OperatorNotVerified(address operator);
    error InvalidSignature();
    error JobAlreadyAttested(bytes32 jobId);

    event AgentRegistered(
        bytes32 indexed fingerprint,
        uint256 indexed tokenId,
        address indexed operator,
        string agentType,
        bytes32 role,
        bytes32 permissionsHash
    );
    event SubmissionRecorded(bytes32 indexed fingerprint, bytes32 indexed jobId, uint256 score, uint256 newAcceptedCount);
    event ReputationUpdated(bytes32 indexed fingerprint, uint256 acceptedCount, uint256 avgScore);
    event AttestorUpdated(address indexed attestor);

    struct AgentIdentity {
        uint256 tokenId;
        string agentType;
        string agentVersion;
        address operatorAddress;
        bytes32 role;
        bytes32 permissionsHash;
        uint256 acceptedCount;
        uint256 cumulativeScore;
        bool registered;
        uint256 registeredAt;
    }

    mapping(bytes32 fingerprint => AgentIdentity) public agents;
    mapping(uint256 tokenId => bytes32) public tokenToFingerprint;
    mapping(bytes32 jobId => bool) public attestedJobs;
    uint256 public nextTokenId = 1;

    IdentityGate public identityGate;
    address public attestor;
    address public owner;

    bytes32 public constant POSTER_ROLE = keccak256("poster");
    bytes32 public constant WORKER_ROLE = keccak256("worker");

    constructor(address _identityGate, address _attestor) {
        identityGate = IdentityGate(_identityGate);
        attestor = _attestor;
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    function registerAgent(
        string calldata agentType,
        string calldata agentVersion,
        bytes32 role,
        bytes32 permissionsHash
    ) external returns (bytes32 fingerprint, uint256 tokenId) {
        if (role != POSTER_ROLE && role != WORKER_ROLE) revert InvalidRole();
        if (!identityGate.isVerified(msg.sender, role)) revert OperatorNotVerified(msg.sender);

        fingerprint = keccak256(abi.encodePacked(agentType, agentVersion, msg.sender));
        if (agents[fingerprint].registered) revert AgentAlreadyRegistered(fingerprint);

        tokenId = nextTokenId++;
        agents[fingerprint] = AgentIdentity({
            tokenId: tokenId,
            agentType: agentType,
            agentVersion: agentVersion,
            operatorAddress: msg.sender,
            role: role,
            permissionsHash: permissionsHash,
            acceptedCount: 0,
            cumulativeScore: 0,
            registered: true,
            registeredAt: block.timestamp
        });
        tokenToFingerprint[tokenId] = fingerprint;

        emit AgentRegistered(fingerprint, tokenId, msg.sender, agentType, role, permissionsHash);
        return (fingerprint, tokenId);
    }

    function recordAcceptedSubmission(
        bytes32 fingerprint,
        bytes32 jobId,
        uint256 score,
        address reviewer,
        bool payoutReleased,
        bytes calldata signature
    ) external {
        if (score > 100) revert InvalidScore(score);
        AgentIdentity storage agent = agents[fingerprint];
        if (!agent.registered) revert AgentNotFound(fingerprint);
        if (attestedJobs[jobId]) revert JobAlreadyAttested(jobId);

        bytes32 digest = getAttestationDigest(fingerprint, jobId, score, reviewer, payoutReleased);
        address recovered = recoverSigner(digest, signature);
        if (recovered != attestor) revert InvalidSignature();

        agent.acceptedCount += 1;
        agent.cumulativeScore += score;
        attestedJobs[jobId] = true;

        emit SubmissionRecorded(fingerprint, jobId, score, agent.acceptedCount);
        emit ReputationUpdated(fingerprint, agent.acceptedCount, getAvgScore(fingerprint));
    }

    function getReputation(bytes32 fingerprint) external view returns (uint256 acceptedCount, uint256 avgScore) {
        AgentIdentity storage agent = agents[fingerprint];
        if (!agent.registered) return (0, 0);
        return (agent.acceptedCount, getAvgScore(fingerprint));
    }

    function getAvgScore(bytes32 fingerprint) public view returns (uint256) {
        AgentIdentity storage agent = agents[fingerprint];
        if (agent.acceptedCount == 0) return 0;
        return agent.cumulativeScore / agent.acceptedCount;
    }

    function isRegistered(bytes32 fingerprint) external view returns (bool) {
        return agents[fingerprint].registered;
    }

    function getAgentByTokenId(uint256 tokenId) external view returns (bytes32 fingerprint, string memory agentType) {
        fingerprint = tokenToFingerprint[tokenId];
        agentType = agents[fingerprint].agentType;
    }

    function setAttestor(address _attestor) external onlyOwner {
        attestor = _attestor;
        emit AttestorUpdated(_attestor);
    }

    function setIdentityGate(address _identityGate) external onlyOwner {
        identityGate = IdentityGate(_identityGate);
    }

    function getAttestationDigest(
        bytes32 fingerprint,
        bytes32 jobId,
        uint256 score,
        address reviewer,
        bool payoutReleased
    ) public view returns (bytes32) {
        return keccak256(abi.encodePacked(address(this), block.chainid, fingerprint, jobId, score, reviewer, payoutReleased));
    }

    function recoverSigner(bytes32 digest, bytes calldata signature) public pure returns (address) {
        if (signature.length != 65) revert InvalidSignature();

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }

        if (v < 27) v += 27;

        bytes32 ethSignedDigest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        return ecrecover(ethSignedDigest, v, r, s);
    }
}
