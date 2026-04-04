import { parseAbi } from 'viem';

export const agentIdentityRegistryAbi = parseAbi([
  'function registerAgent(string agentType, string agentVersion, bytes32 role, bytes32 permissionsHash) returns (bytes32 fingerprint, uint256 tokenId)',
  'function recordAcceptedSubmission(bytes32 fingerprint, bytes32 jobId, uint256 score, address reviewer, bool payoutReleased, bytes signature)',
  'function getReputation(bytes32 fingerprint) view returns (uint256 acceptedCount, uint256 avgScore)',
  'event AgentRegistered(bytes32 indexed fingerprint, uint256 indexed tokenId, address indexed operator, string agentType, bytes32 role, bytes32 permissionsHash)',
  'event SubmissionRecorded(bytes32 indexed fingerprint, bytes32 indexed jobId, uint256 score, uint256 newAcceptedCount)',
  'event ReputationUpdated(bytes32 indexed fingerprint, uint256 acceptedCount, uint256 avgScore)',
]);
