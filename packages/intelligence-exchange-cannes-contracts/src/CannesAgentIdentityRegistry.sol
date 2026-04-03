// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract CannesAgentIdentityRegistry {
    struct AgentRecord {
        address owner;
        address agentWallet;
        string agentURI;
        bool active;
    }

    uint256 public nextAgentId = 1;
    mapping(uint256 => AgentRecord) public agents;

    event Registered(uint256 indexed agentId, string agentURI, address indexed owner);
    event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy);
    event AgentWalletUpdated(uint256 indexed agentId, address indexed newWallet);

    function register(string calldata agentURI) external returns (uint256 agentId) {
        require(bytes(agentURI).length > 0, "agentURI required");
        agentId = nextAgentId++;
        agents[agentId] = AgentRecord({
            owner: msg.sender,
            agentWallet: msg.sender,
            agentURI: agentURI,
            active: true
        });
        emit Registered(agentId, agentURI, msg.sender);
    }

    function setAgentURI(uint256 agentId, string calldata newURI) external {
        AgentRecord storage record = agents[agentId];
        require(record.owner == msg.sender, "not owner");
        record.agentURI = newURI;
        emit URIUpdated(agentId, newURI, msg.sender);
    }

    function setAgentWallet(uint256 agentId, address newWallet) external {
        AgentRecord storage record = agents[agentId];
        require(record.owner == msg.sender, "not owner");
        require(newWallet != address(0), "wallet required");
        record.agentWallet = newWallet;
        emit AgentWalletUpdated(agentId, newWallet);
    }

    function getAgent(uint256 agentId) external view returns (AgentRecord memory) {
        return agents[agentId];
    }
}
