// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AgentIdentityRegistry
/// @notice On-chain identity and reputation registry for AI agents.
///
/// Each AI agent that completes accepted work on the Intelligence Exchange earns
/// a verifiable on-chain identity. Reputation accrues per accepted submission.
///
/// Implementation note: ERC-8004 is referenced in the spec for agent-bound accounts.
/// This contract implements a simplified registry that tracks agent fingerprints and
/// reputation scores. A full ERC-8004 implementation can be added post-hackathon.
/// The fingerprint scheme is: keccak256(abi.encodePacked(agentType, agentVersion, operatorAddress))
///
/// Identity structure:
///   fingerprint → AgentIdentity (acceptedCount, avgScore, tokenId, metadata)
contract AgentIdentityRegistry {
    // ─── Errors ──────────────────────────────────────────────────────────────

    error AgentAlreadyRegistered(bytes32 fingerprint);
    error AgentNotFound(bytes32 fingerprint);
    error Unauthorized();
    error InvalidScore(uint256 score);

    // ─── Events ───────────────────────────────────────────────────────────────

    event AgentRegistered(bytes32 indexed fingerprint, uint256 indexed tokenId, address indexed operator, string agentType);
    event SubmissionRecorded(bytes32 indexed fingerprint, bytes32 indexed jobId, uint256 score, uint256 newAcceptedCount);
    event ReputationUpdated(bytes32 indexed fingerprint, uint256 acceptedCount, uint256 avgScore);

    // ─── Storage ──────────────────────────────────────────────────────────────

    struct AgentIdentity {
        uint256 tokenId;
        string agentType;
        string agentVersion;
        address operatorAddress;
        uint256 acceptedCount;
        uint256 cumulativeScore;  // sum of all scores (divide by acceptedCount for avg)
        bool registered;
        uint256 registeredAt;
    }

    mapping(bytes32 fingerprint => AgentIdentity) public agents;
    mapping(uint256 tokenId => bytes32) public tokenToFingerprint;
    uint256 public nextTokenId = 1;

    // Broker address — only broker can record submissions
    address public broker;
    address public owner;

    constructor(address _broker) {
        broker = _broker;
        owner = msg.sender;
    }

    modifier onlyBroker() {
        if (msg.sender != broker && msg.sender != owner) revert Unauthorized();
        _;
    }

    // ─── Functions ────────────────────────────────────────────────────────────

    /// @notice Register a new agent identity. Called by broker on first accepted submission.
    /// @param fingerprint   keccak256(agentType + agentVersion + operatorAddress) computed off-chain.
    /// @param agentType     Human-readable agent type (e.g. "claude-code", "codex").
    /// @param agentVersion  Agent version string.
    /// @param operator      EVM address of the human operator running the agent (optional, address(0) if anonymous).
    /// @return tokenId      ERC-like token ID for this agent identity.
    function registerAgent(
        bytes32 fingerprint,
        string calldata agentType,
        string calldata agentVersion,
        address operator
    ) external onlyBroker returns (uint256 tokenId) {
        if (agents[fingerprint].registered) revert AgentAlreadyRegistered(fingerprint);

        tokenId = nextTokenId++;
        agents[fingerprint] = AgentIdentity({
            tokenId: tokenId,
            agentType: agentType,
            agentVersion: agentVersion,
            operatorAddress: operator,
            acceptedCount: 0,
            cumulativeScore: 0,
            registered: true,
            registeredAt: block.timestamp
        });
        tokenToFingerprint[tokenId] = fingerprint;

        emit AgentRegistered(fingerprint, tokenId, operator, agentType);
        return tokenId;
    }

    /// @notice Record an accepted submission and update agent reputation.
    /// @param fingerprint  Agent fingerprint (must be registered first).
    /// @param jobId        Job identifier.
    /// @param score        Score 0–100 for this submission.
    function recordAcceptedSubmission(
        bytes32 fingerprint,
        bytes32 jobId,
        uint256 score
    ) external onlyBroker {
        if (score > 100) revert InvalidScore(score);
        AgentIdentity storage agent = agents[fingerprint];
        if (!agent.registered) revert AgentNotFound(fingerprint);

        agent.acceptedCount += 1;
        agent.cumulativeScore += score;

        emit SubmissionRecorded(fingerprint, jobId, score, agent.acceptedCount);
        emit ReputationUpdated(fingerprint, agent.acceptedCount, getAvgScore(fingerprint));
    }

    // ─── View helpers ─────────────────────────────────────────────────────────

    /// @notice Returns agent reputation: (acceptedCount, avgScore 0–100).
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

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setBroker(address _broker) external {
        if (msg.sender != owner) revert Unauthorized();
        broker = _broker;
    }
}
