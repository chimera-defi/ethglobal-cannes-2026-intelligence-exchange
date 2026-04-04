// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentIdentityRegistry} from "../src/AgentIdentityRegistry.sol";
import {IdentityGate} from "../src/IdentityGate.sol";

contract AgentIdentityRegistryTest is Test {
    IdentityGate public gate;
    AgentIdentityRegistry public registry;

    uint256 attestorPk = 0xA11CE;
    address attestor = vm.addr(attestorPk);
    address operator = address(0xDEAD);
    address reviewer = address(0xBEEF);
    bytes32 permissionsHash = keccak256("claim_jobs|submit_results");
    bytes32 role = keccak256("worker");
    bytes32 jobId1 = keccak256("job-981");
    bytes32 jobId2 = keccak256("job-982");

    function setUp() public {
        gate = new IdentityGate(attestor);
        registry = new AgentIdentityRegistry(address(gate), attestor);

        vm.prank(attestor);
        gate.setVerified(operator, gate.WORKER_ROLE(), true);
    }

    function _expectedFingerprint() internal view returns (bytes32) {
        return keccak256(abi.encodePacked("claude-code", "1.0.0", operator));
    }

    function _registerWorker() internal returns (bytes32 fingerprint, uint256 tokenId) {
        vm.prank(operator);
        return registry.registerAgent("claude-code", "1.0.0", role, permissionsHash);
    }

    function _signAttestation(
        bytes32 fingerprint,
        bytes32 jobId,
        uint256 score,
        address reviewerAddress,
        bool payoutReleased,
        uint256 signerPk
    ) internal returns (bytes memory) {
        bytes32 digest = registry.getAttestationDigest(fingerprint, jobId, score, reviewerAddress, payoutReleased);
        bytes32 ethSignedDigest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, ethSignedDigest);
        return abi.encodePacked(r, s, v);
    }

    function test_registerAgent_mintsTokenIdAndFingerprint() public {
        (bytes32 fingerprint, uint256 tokenId) = _registerWorker();

        assertEq(fingerprint, _expectedFingerprint());
        assertEq(tokenId, 1);
        assertTrue(registry.isRegistered(fingerprint));

        (bytes32 storedFingerprint, string memory agentType) = registry.getAgentByTokenId(tokenId);
        assertEq(storedFingerprint, fingerprint);
        assertEq(agentType, "claude-code");
    }

    function test_registerAgent_emitsEvent() public {
        bytes32 fingerprint = _expectedFingerprint();

        vm.expectEmit(true, true, true, true);
        emit AgentIdentityRegistry.AgentRegistered(
            fingerprint,
            1,
            operator,
            "claude-code",
            role,
            permissionsHash
        );

        _registerWorker();
    }

    function test_registerAgent_revert_whenOperatorNotVerified() public {
        vm.prank(address(0xCAFE));
        vm.expectRevert(abi.encodeWithSelector(AgentIdentityRegistry.OperatorNotVerified.selector, address(0xCAFE)));
        registry.registerAgent("claude-code", "1.0.0", role, permissionsHash);
    }

    function test_registerAgent_revert_invalidRole() public {
        vm.prank(operator);
        vm.expectRevert(AgentIdentityRegistry.InvalidRole.selector);
        registry.registerAgent("claude-code", "1.0.0", keccak256("reviewer"), permissionsHash);
    }

    function test_registerAgent_revert_alreadyRegistered() public {
        (bytes32 fingerprint,) = _registerWorker();

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(AgentIdentityRegistry.AgentAlreadyRegistered.selector, fingerprint));
        registry.registerAgent("claude-code", "1.0.0", role, permissionsHash);
    }

    function test_recordAcceptedSubmission_updatesReputation() public {
        (bytes32 fingerprint,) = _registerWorker();
        bytes memory signature = _signAttestation(fingerprint, jobId1, 85, reviewer, false, attestorPk);

        registry.recordAcceptedSubmission(fingerprint, jobId1, 85, reviewer, false, signature);

        (uint256 count, uint256 avgScore) = registry.getReputation(fingerprint);
        assertEq(count, 1);
        assertEq(avgScore, 85);
    }

    function test_recordAcceptedSubmission_updatesAverageOverMultipleAcceptedJobs() public {
        (bytes32 fingerprint,) = _registerWorker();
        bytes memory signature1 = _signAttestation(fingerprint, jobId1, 80, reviewer, false, attestorPk);
        bytes memory signature2 = _signAttestation(fingerprint, jobId2, 100, reviewer, true, attestorPk);

        registry.recordAcceptedSubmission(fingerprint, jobId1, 80, reviewer, false, signature1);
        registry.recordAcceptedSubmission(fingerprint, jobId2, 100, reviewer, true, signature2);

        (uint256 count, uint256 avgScore) = registry.getReputation(fingerprint);
        assertEq(count, 2);
        assertEq(avgScore, 90);
    }

    function test_recordAcceptedSubmission_emitsEvents() public {
        (bytes32 fingerprint,) = _registerWorker();
        bytes memory signature = _signAttestation(fingerprint, jobId1, 92, reviewer, false, attestorPk);

        vm.expectEmit(true, true, false, true);
        emit AgentIdentityRegistry.SubmissionRecorded(fingerprint, jobId1, 92, 1);
        vm.expectEmit(true, false, false, true);
        emit AgentIdentityRegistry.ReputationUpdated(fingerprint, 1, 92);

        registry.recordAcceptedSubmission(fingerprint, jobId1, 92, reviewer, false, signature);
    }

    function test_recordAcceptedSubmission_revert_agentNotFound() public {
        bytes32 fingerprint = _expectedFingerprint();
        bytes memory signature = _signAttestation(fingerprint, jobId1, 85, reviewer, false, attestorPk);

        vm.expectRevert(abi.encodeWithSelector(AgentIdentityRegistry.AgentNotFound.selector, fingerprint));
        registry.recordAcceptedSubmission(fingerprint, jobId1, 85, reviewer, false, signature);
    }

    function test_recordAcceptedSubmission_revert_invalidScore() public {
        (bytes32 fingerprint,) = _registerWorker();
        bytes memory signature = _signAttestation(fingerprint, jobId1, 101, reviewer, false, attestorPk);

        vm.expectRevert(abi.encodeWithSelector(AgentIdentityRegistry.InvalidScore.selector, 101));
        registry.recordAcceptedSubmission(fingerprint, jobId1, 101, reviewer, false, signature);
    }

    function test_recordAcceptedSubmission_revert_invalidSignature() public {
        (bytes32 fingerprint,) = _registerWorker();
        bytes memory signature = _signAttestation(fingerprint, jobId1, 85, reviewer, false, 0xBAD);

        vm.expectRevert(AgentIdentityRegistry.InvalidSignature.selector);
        registry.recordAcceptedSubmission(fingerprint, jobId1, 85, reviewer, false, signature);
    }

    function test_recordAcceptedSubmission_revert_duplicateJobAttestation() public {
        (bytes32 fingerprint,) = _registerWorker();
        bytes memory signature = _signAttestation(fingerprint, jobId1, 85, reviewer, false, attestorPk);

        registry.recordAcceptedSubmission(fingerprint, jobId1, 85, reviewer, false, signature);

        vm.expectRevert(abi.encodeWithSelector(AgentIdentityRegistry.JobAlreadyAttested.selector, jobId1));
        registry.recordAcceptedSubmission(fingerprint, jobId1, 85, reviewer, false, signature);
    }
}
