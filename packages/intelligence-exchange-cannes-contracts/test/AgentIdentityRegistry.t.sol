// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentIdentityRegistry} from "../src/AgentIdentityRegistry.sol";

contract AgentIdentityRegistryTest is Test {
    AgentIdentityRegistry public registry;

    address broker = address(0xB0C);
    address operator = address(0xDEAD);

    bytes32 fingerprint1 = keccak256(abi.encodePacked("claude-code", "1.0.0", operator));
    bytes32 fingerprint2 = keccak256(abi.encodePacked("codex", "1.0.0", address(0)));
    bytes32 jobId1 = keccak256("job-981");
    bytes32 jobId2 = keccak256("job-982");

    function setUp() public {
        registry = new AgentIdentityRegistry(broker);
    }

    // ─── registerAgent ────────────────────────────────────────────────────────

    function test_registerAgent_mintsTokenId() public {
        vm.prank(broker);
        uint256 tokenId = registry.registerAgent(fingerprint1, "claude-code", "1.0.0", operator);
        assertEq(tokenId, 1);
        assertTrue(registry.isRegistered(fingerprint1));
    }

    function test_registerAgent_emitsEvent() public {
        vm.expectEmit(true, true, true, true);
        emit AgentIdentityRegistry.AgentRegistered(fingerprint1, 1, operator, "claude-code");

        vm.prank(broker);
        registry.registerAgent(fingerprint1, "claude-code", "1.0.0", operator);
    }

    function test_registerAgent_incrementsTokenId() public {
        vm.startPrank(broker);
        uint256 t1 = registry.registerAgent(fingerprint1, "claude-code", "1.0.0", operator);
        uint256 t2 = registry.registerAgent(fingerprint2, "codex", "1.0.0", address(0));
        vm.stopPrank();

        assertEq(t2, t1 + 1);
    }

    function test_registerAgent_revert_alreadyRegistered() public {
        vm.startPrank(broker);
        registry.registerAgent(fingerprint1, "claude-code", "1.0.0", operator);

        vm.expectRevert(
            abi.encodeWithSelector(AgentIdentityRegistry.AgentAlreadyRegistered.selector, fingerprint1)
        );
        registry.registerAgent(fingerprint1, "claude-code", "1.0.0", operator);
        vm.stopPrank();
    }

    function test_registerAgent_revert_unauthorized() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(AgentIdentityRegistry.Unauthorized.selector);
        registry.registerAgent(fingerprint1, "claude-code", "1.0.0", operator);
    }

    // ─── recordAcceptedSubmission ─────────────────────────────────────────────

    function _register1() internal {
        vm.prank(broker);
        registry.registerAgent(fingerprint1, "claude-code", "1.0.0", operator);
    }

    function test_recordSubmission_updatesCount() public {
        _register1();
        vm.prank(broker);
        registry.recordAcceptedSubmission(fingerprint1, jobId1, 85);

        (uint256 count, uint256 avg) = registry.getReputation(fingerprint1);
        assertEq(count, 1);
        assertEq(avg, 85);
    }

    function test_recordSubmission_updatesAvgScore() public {
        _register1();
        vm.startPrank(broker);
        registry.recordAcceptedSubmission(fingerprint1, jobId1, 80);
        registry.recordAcceptedSubmission(fingerprint1, jobId2, 100);
        vm.stopPrank();

        (uint256 count, uint256 avg) = registry.getReputation(fingerprint1);
        assertEq(count, 2);
        assertEq(avg, 90); // (80+100)/2
    }

    function test_recordSubmission_emitsEvent() public {
        _register1();
        vm.expectEmit(true, true, false, true);
        emit AgentIdentityRegistry.SubmissionRecorded(fingerprint1, jobId1, 92, 1);

        vm.prank(broker);
        registry.recordAcceptedSubmission(fingerprint1, jobId1, 92);
    }

    function test_recordSubmission_revert_agentNotFound() public {
        vm.prank(broker);
        vm.expectRevert(
            abi.encodeWithSelector(AgentIdentityRegistry.AgentNotFound.selector, fingerprint1)
        );
        registry.recordAcceptedSubmission(fingerprint1, jobId1, 85);
    }

    function test_recordSubmission_revert_invalidScore() public {
        _register1();
        vm.prank(broker);
        vm.expectRevert(abi.encodeWithSelector(AgentIdentityRegistry.InvalidScore.selector, 101));
        registry.recordAcceptedSubmission(fingerprint1, jobId1, 101);
    }

    function test_recordSubmission_revert_unauthorized() public {
        _register1();
        vm.prank(address(0xBAD));
        vm.expectRevert(AgentIdentityRegistry.Unauthorized.selector);
        registry.recordAcceptedSubmission(fingerprint1, jobId1, 85);
    }

    // ─── Reputation for unregistered agent ───────────────────────────────────

    function test_getReputation_unregistered_returnsZero() public view {
        (uint256 count, uint256 avg) = registry.getReputation(fingerprint1);
        assertEq(count, 0);
        assertEq(avg, 0);
    }

    // ─── getAgentByTokenId ───────────────────────────────────────────────────

    function test_getAgentByTokenId() public {
        vm.prank(broker);
        registry.registerAgent(fingerprint1, "claude-code", "1.0.0", operator);

        (bytes32 fp, string memory agentType) = registry.getAgentByTokenId(1);
        assertEq(fp, fingerprint1);
        assertEq(agentType, "claude-code");
    }
}
