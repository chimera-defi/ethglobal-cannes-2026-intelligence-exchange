import { parseAbi } from 'viem';

export const agentIdentityRegistryAbi = parseAbi([
  'function registerAgent(string agentType, string agentVersion, bytes32 role, bytes32 permissionsHash) returns (bytes32 fingerprint, uint256 tokenId)',
  'event AgentRegistered(bytes32 indexed fingerprint, uint256 indexed tokenId, address indexed operator, string agentType, bytes32 role, bytes32 permissionsHash)',
]);
