// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IntelToken} from "../src/IntelToken.sol";
import {ReviewerStakeManager} from "../src/ReviewerStakeManager.sol";
import {CategoryRegistry} from "../src/CategoryRegistry.sol";
import {ReviewerQueue} from "../src/ReviewerQueue.sol";
import {IdentityGate} from "../src/IdentityGate.sol";

contract ReviewerQueueTest is Test {
    IntelToken public intel;
    ReviewerStakeManager public stakeManager;
    CategoryRegistry public categoryRegistry;
    ReviewerQueue public queue;
    IdentityGate public identityGate;

    address owner = address(this);
    address operator = address(0x0F);
    address treasury = address(0x1234);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address charlie = address(0xC4);

    uint256 constant MIN_BOND = 500e18;
    uint256 constant MAX_SUPPLY = 10_000_000e18;

    function setUp() public {
        intel = new IntelToken("INTEL", "INTEL", owner, 0, MAX_SUPPLY);
        stakeManager = new ReviewerStakeManager(address(intel), treasury);
        categoryRegistry = new CategoryRegistry();
        identityGate = new IdentityGate(address(this)); // owner as attestor
        queue = new ReviewerQueue(address(stakeManager), address(categoryRegistry));

        // Mint tokens to test users
        intel.mint(alice, 100_000e18);
        intel.mint(bob, 100_000e18);
        intel.mint(charlie, 100_000e18);
        intel.mint(treasury, 1_000_000e18);

        // Approve stakeManager for users
        vm.prank(alice);
        intel.approve(address(stakeManager), type(uint256).max);
        vm.prank(bob);
        intel.approve(address(stakeManager), type(uint256).max);
        vm.prank(charlie);
        intel.approve(address(stakeManager), type(uint256).max);

        // Register operators
        stakeManager.setOperator(operator, true);
        queue.setOperator(operator, true);
        categoryRegistry.setOperator(operator, true);

        // Set IdentityGate for most tests
        queue.setIdentityGate(address(identityGate));

        // Verify test users with WorldID for reviewer role
        identityGate.setVerified(alice, keccak256("reviewer"), true);
        identityGate.setVerified(bob, keccak256("reviewer"), true);
        identityGate.setVerified(charlie, keccak256("reviewer"), true);
    }

    // ─── assignReview Tests ────────────────────────────────────────────────────

    function test_assignReview_happyPath() public {
        // Register reviewers with different bond amounts
        vm.prank(alice);
        stakeManager.registerAsReviewer(500e18);
        vm.prank(bob);
        stakeManager.registerAsReviewer(1000e18);

        address[] memory eligibleReviewers = new address[](2);
        eligibleReviewers[0] = alice;
        eligibleReviewers[1] = bob;

        bytes32 taskId = keccak256("task1");
        uint256 taskCategory = 0; // Code

        vm.prank(operator);
        queue.assignReview(taskId, taskCategory, eligibleReviewers, address(0));

        // Check assignment was created
        (bytes32 storedTaskId, address assignedReviewer, uint256 assignedAt, uint256 category, bool completed, bool timedOut) = 
            queue.assignments(taskId);
        assertEq(storedTaskId, taskId);
        assertTrue(assignedReviewer == alice || assignedReviewer == bob);
        assertEq(assignedAt, block.timestamp);
        assertEq(category, taskCategory);
        assertFalse(completed);
        assertFalse(timedOut);

        // Check reviewer's active count increased
        assertEq(queue.reviewerActiveCount(assignedReviewer), 1);

        // Check reviewer's queue contains the task
        bytes32[] memory reviewerQueue = queue.getReviewerQueue(assignedReviewer);
        assertEq(reviewerQueue.length, 1);
        assertEq(reviewerQueue[0], taskId);
    }

    function test_assignReview_stakeWeightedSelection() public {
        // Register reviewers with significantly different bonds
        vm.prank(alice);
        stakeManager.registerAsReviewer(500e18);
        vm.prank(bob);
        stakeManager.registerAsReviewer(5000e18);

        address[] memory eligibleReviewers = new address[](2);
        eligibleReviewers[0] = alice;
        eligibleReviewers[1] = bob;

        // Run multiple assignments to check weighted distribution
        // Bob with 10x bond should be selected more often
        uint256 bobSelections = 0;
        for (uint256 i = 0; i < 20; i++) {
            bytes32 taskId = keccak256(abi.encodePacked("task", uint256(i)));
            vm.prank(operator);
            queue.assignReview(taskId, 0, eligibleReviewers, address(0));

            (, address assignedReviewer,,,,) = queue.assignments(taskId);
            if (assignedReviewer == bob) {
                bobSelections++;
            }

            // Complete the review to reset capacity
            vm.prank(operator);
            queue.completeReview(taskId, assignedReviewer);
        }

        // Bob should be selected significantly more often (not guaranteed but highly likely)
        // We use a loose threshold since it's probabilistic
        assertGt(bobSelections, 5); // At least 25% of the time
    }

    function test_assignReview_noEligibleReviewers() public {
        address[] memory eligibleReviewers = new address[](0);

        bytes32 taskId = keccak256("task1");

        vm.prank(operator);
        vm.expectRevert(ReviewerQueue.NoEligibleReviewers.selector);
        queue.assignReview(taskId, 0, eligibleReviewers, address(0));
    }

    function test_assignReview_reviewerAtCapacity() public {
        // Register reviewers
        vm.prank(alice);
        stakeManager.registerAsReviewer(500e18);
        vm.prank(bob);
        stakeManager.registerAsReviewer(500e18);

        address[] memory eligibleReviewers = new address[](2);
        eligibleReviewers[0] = alice;
        eligibleReviewers[1] = bob;

        // Fill alice's capacity (default max is 5)
        for (uint256 i = 0; i < 5; i++) {
            bytes32 taskId = keccak256(abi.encodePacked("alice_task", i));
            vm.prank(operator);
            queue.assignReview(taskId, 0, eligibleReviewers, address(0));
        }

        // Try to assign another task - only bob should be eligible
        bytes32 newTaskId = keccak256("new_task");
        vm.prank(operator);
        queue.assignReview(newTaskId, 0, eligibleReviewers, address(0));

        (, address assignedReviewer,,,,) = queue.assignments(newTaskId);
        assertEq(assignedReviewer, bob);
    }

    function test_assignReview_allReviewersAtCapacity() public {
        // Register reviewers
        vm.prank(alice);
        stakeManager.registerAsReviewer(500e18);
        vm.prank(bob);
        stakeManager.registerAsReviewer(500e18);

        address[] memory eligibleReviewers = new address[](2);
        eligibleReviewers[0] = alice;
        eligibleReviewers[1] = bob;

        // Fill both reviewers' capacity
        for (uint256 i = 0; i < 5; i++) {
            bytes32 taskId1 = keccak256(abi.encodePacked("alice_task", i));
            bytes32 taskId2 = keccak256(abi.encodePacked("bob_task", i));

            vm.prank(operator);
            queue.assignReview(taskId1, 0, eligibleReviewers, address(0));
            vm.prank(operator);
            queue.assignReview(taskId2, 0, eligibleReviewers, address(0));
        }

        // Try to assign another task - should revert
        bytes32 newTaskId = keccak256("new_task");
        vm.prank(operator);
        vm.expectRevert(ReviewerQueue.ReviewerAtCapacity.selector);
        queue.assignReview(newTaskId, 0, eligibleReviewers, address(0));
    }

    function test_assignReview_unauthorized() public {
        address[] memory eligibleReviewers = new address[](1);
        eligibleReviewers[0] = alice;

        vm.prank(alice);
        vm.expectRevert(ReviewerQueue.Unauthorized.selector);
        queue.assignReview(keccak256("task1"), 0, eligibleReviewers, address(0));
    }

    // ─── completeReview Tests ──────────────────────────────────────────────────

    function test_completeReview_happyPath() public {
        // Register reviewer and assign task
        vm.prank(alice);
        stakeManager.registerAsReviewer(500e18);

        address[] memory eligibleReviewers = new address[](1);
        eligibleReviewers[0] = alice;

        bytes32 taskId = keccak256("task1");

        vm.prank(operator);
        queue.assignReview(taskId, 0, eligibleReviewers, address(0));

        // Complete the review
        vm.prank(operator);
        queue.completeReview(taskId, alice);

        (,,, , bool completed, bool timedOut) = queue.assignments(taskId);
        assertTrue(completed);
        assertFalse(timedOut);

        // Check active count decreased
        assertEq(queue.reviewerActiveCount(alice), 0);
    }

    function test_completeReview_assignmentNotFound() public {
        vm.prank(operator);
        vm.expectRevert(ReviewerQueue.AssignmentNotFound.selector);
        queue.completeReview(keccak256("nonexistent"), alice);
    }

    function test_completeReview_alreadyCompleted() public {
        // Register reviewer and assign task
        vm.prank(alice);
        stakeManager.registerAsReviewer(500e18);

        address[] memory eligibleReviewers = new address[](1);
        eligibleReviewers[0] = alice;

        bytes32 taskId = keccak256("task1");

        vm.prank(operator);
        queue.assignReview(taskId, 0, eligibleReviewers, address(0));

        // Complete the review
        vm.prank(operator);
        queue.completeReview(taskId, alice);

        // Try to complete again
        vm.prank(operator);
        vm.expectRevert(ReviewerQueue.AlreadyCompleted.selector);
        queue.completeReview(taskId, alice);
    }

    function test_completeReview_unauthorized() public {
        vm.prank(alice);
        vm.expectRevert(ReviewerQueue.Unauthorized.selector);
        queue.completeReview(keccak256("task1"), alice);
    }

    // ─── reassignTimedOut Tests ────────────────────────────────────────────────

    function test_reassignTimedOut_afterTimeout() public {
        // Register reviewers
        vm.prank(alice);
        stakeManager.registerAsReviewer(500e18);
        vm.prank(bob);
        stakeManager.registerAsReviewer(500e18);

        address[] memory eligibleReviewers = new address[](2);
        eligibleReviewers[0] = alice;
        eligibleReviewers[1] = bob;

        bytes32 taskId = keccak256("task1");

        vm.prank(operator);
        queue.assignReview(taskId, 0, eligibleReviewers, address(0));

        (, address oldReviewer,,,,) = queue.assignments(taskId);
        uint256 oldActiveCount = queue.reviewerActiveCount(oldReviewer);

        // Warp past timeout
        skip(25 hours);

        // Reassign with new eligible reviewers
        vm.prank(operator);
        queue.reassignTimedOut(taskId, eligibleReviewers);

        (, address newReviewer,,, bool completed, bool timedOut) = queue.assignments(taskId);
        assertFalse(timedOut); // Reset for new assignment
        assertFalse(completed);

        // Check old reviewer's active count decreased by 1
        assertEq(queue.reviewerActiveCount(oldReviewer), oldActiveCount - 1);

        // Check new reviewer's active count increased by 1
        assertEq(queue.reviewerActiveCount(newReviewer), 1);
    }

    function test_reassignTimedOut_beforeTimeout() public {
        // Register reviewer
        vm.prank(alice);
        stakeManager.registerAsReviewer(500e18);

        address[] memory eligibleReviewers = new address[](1);
        eligibleReviewers[0] = alice;

        bytes32 taskId = keccak256("task1");

        vm.prank(operator);
        queue.assignReview(taskId, 0, eligibleReviewers, address(0));

        // Try to reassign before timeout
        vm.prank(operator);
        vm.expectRevert(ReviewerQueue.ReviewNotTimedOut.selector);
        queue.reassignTimedOut(taskId, eligibleReviewers);
    }

    function test_reassignTimedOut_assignmentNotFound() public {
        address[] memory eligibleReviewers = new address[](1);
        eligibleReviewers[0] = alice;

        vm.prank(operator);
        vm.expectRevert(ReviewerQueue.AssignmentNotFound.selector);
        queue.reassignTimedOut(keccak256("nonexistent"), eligibleReviewers);
    }

    function test_reassignTimedOut_alreadyCompleted() public {
        // Register reviewer and assign task
        vm.prank(alice);
        stakeManager.registerAsReviewer(500e18);

        address[] memory eligibleReviewers = new address[](1);
        eligibleReviewers[0] = alice;

        bytes32 taskId = keccak256("task1");

        vm.prank(operator);
        queue.assignReview(taskId, 0, eligibleReviewers, address(0));

        // Complete the review
        vm.prank(operator);
        queue.completeReview(taskId, alice);

        // Warp past timeout
        skip(25 hours);

        // Try to reassign completed review
        vm.prank(operator);
        vm.expectRevert(ReviewerQueue.AlreadyCompleted.selector);
        queue.reassignTimedOut(taskId, eligibleReviewers);
    }

    function test_reassignTimedOut_unauthorized() public {
        address[] memory eligibleReviewers = new address[](1);
        eligibleReviewers[0] = alice;

        vm.prank(alice);
        vm.expectRevert(ReviewerQueue.Unauthorized.selector);
        queue.reassignTimedOut(keccak256("task1"), eligibleReviewers);
    }

    // ─── View Function Tests ───────────────────────────────────────────────────

    function test_getReviewerQueue() public {
        // Register reviewer
        vm.prank(alice);
        stakeManager.registerAsReviewer(500e18);

        address[] memory eligibleReviewers = new address[](1);
        eligibleReviewers[0] = alice;

        // Assign multiple tasks
        bytes32 taskId1 = keccak256("task1");
        bytes32 taskId2 = keccak256("task2");

        vm.prank(operator);
        queue.assignReview(taskId1, 0, eligibleReviewers, address(0));
        vm.prank(operator);
        queue.assignReview(taskId2, 0, eligibleReviewers, address(0));

        bytes32[] memory reviewerQueue = queue.getReviewerQueue(alice);
        assertEq(reviewerQueue.length, 2);
        assertEq(reviewerQueue[0], taskId1);
        assertEq(reviewerQueue[1], taskId2);
    }

    function test_isAssignedReviewer() public {
        // Register reviewer
        vm.prank(alice);
        stakeManager.registerAsReviewer(500e18);

        address[] memory eligibleReviewers = new address[](1);
        eligibleReviewers[0] = alice;

        bytes32 taskId = keccak256("task1");

        // Before assignment
        assertFalse(queue.isAssignedReviewer(taskId, alice));

        // After assignment
        vm.prank(operator);
        queue.assignReview(taskId, 0, eligibleReviewers, address(0));
        assertTrue(queue.isAssignedReviewer(taskId, alice));

        // After completion
        vm.prank(operator);
        queue.completeReview(taskId, alice);
        assertFalse(queue.isAssignedReviewer(taskId, alice));
    }

    // ─── Admin Function Tests ─────────────────────────────────────────────────

    function test_setReviewTimeout() public {
        uint256 newTimeout = 48 hours;

        queue.setReviewTimeout(newTimeout);
        assertEq(queue.reviewTimeout(), newTimeout);
    }

    function test_setMaxActiveReviews() public {
        uint256 newMax = 10;

        queue.setMaxActiveReviews(newMax);
        assertEq(queue.maxActiveReviewsPerReviewer(), newMax);
    }

    function test_setOperator() public {
        address newOperator = address(0x9999);

        queue.setOperator(newOperator, true);
        assertTrue(queue.operators(newOperator));

        queue.setOperator(newOperator, false);
        assertFalse(queue.operators(newOperator));
    }

    function test_setOperator_zeroAddress() public {
        vm.expectRevert(ReviewerQueue.ZeroAddress.selector);
        queue.setOperator(address(0), true);
    }

    function test_transferOwnership() public {
        address newOwner = address(0xFEDC);

        queue.transferOwnership(newOwner);
        assertEq(queue.pendingOwner(), newOwner);

        vm.prank(newOwner);
        queue.acceptOwnership();

        assertEq(queue.owner(), newOwner);
        assertEq(queue.pendingOwner(), address(0));
    }

    function test_transferOwnership_zeroAddress() public {
        vm.expectRevert(ReviewerQueue.ZeroAddress.selector);
        queue.transferOwnership(address(0));
    }

    function test_acceptOwnership_unauthorized() public {
        queue.transferOwnership(address(0x789));

        vm.prank(alice);
        vm.expectRevert(ReviewerQueue.Unauthorized.selector);
        queue.acceptOwnership();
    }

    // ─── Integration Tests ────────────────────────────────────────────────────

    function test_fullWorkflow() public {
        // Register reviewers with different bonds
        vm.prank(alice);
        stakeManager.registerAsReviewer(500e18);
        vm.prank(bob);
        stakeManager.registerAsReviewer(1000e18);

        address[] memory eligibleReviewers = new address[](2);
        eligibleReviewers[0] = alice;
        eligibleReviewers[1] = bob;

        // Assign multiple tasks
        for (uint256 i = 0; i < 3; i++) {
            bytes32 taskId = keccak256(abi.encodePacked("task", i));
            vm.prank(operator);
            queue.assignReview(taskId, 0, eligibleReviewers, address(0));
        }

        // Complete some reviews
        bytes32 task1 = keccak256(abi.encodePacked("task", uint256(0)));
        (, address reviewer1,,,,) = queue.assignments(task1);
        uint256 activeCountBefore = queue.reviewerActiveCount(reviewer1);
        vm.prank(operator);
        queue.completeReview(task1, reviewer1);

        // Check active count decreased
        assertEq(queue.reviewerActiveCount(reviewer1), activeCountBefore - 1);

        // Reassign a timed-out review
        bytes32 task2 = keccak256(abi.encodePacked("task", uint256(1)));
        skip(25 hours);
        vm.prank(operator);
        queue.reassignTimedOut(task2, eligibleReviewers);

        (,,, , bool timedOut,) = queue.assignments(task2);
        assertFalse(timedOut); // Reset for new assignment
    }

    // ─── WorldID Verification Tests ───────────────────────────────────────────

    function test_assignReview_identityGateAddressZero_allReviewersEligible() public {
        // Deploy a new queue without IdentityGate set
        ReviewerQueue queueNoGate = new ReviewerQueue(address(stakeManager), address(categoryRegistry));

        // Set operator for the new queue
        queueNoGate.setOperator(operator, true);

        // Register reviewers with bonds
        vm.prank(alice);
        stakeManager.registerAsReviewer(500e18);
        vm.prank(bob);
        stakeManager.registerAsReviewer(1000e18);

        // No WorldID verification - all bonded reviewers should be eligible
        address[] memory eligibleReviewers = new address[](2);
        eligibleReviewers[0] = alice;
        eligibleReviewers[1] = bob;

        bytes32 taskId = keccak256("task1");
        uint256 taskCategory = 0;

        vm.prank(operator);
        queueNoGate.assignReview(taskId, taskCategory, eligibleReviewers, address(0));

        // Check assignment - either should be assigned (no WorldID gate)
        (, address assignedReviewer,,,,) = queueNoGate.assignments(taskId);
        assertTrue(assignedReviewer == alice || assignedReviewer == bob);
    }

    function test_assignReview_identityGateSet_unverifiedReviewerExcluded() public {
        // Register reviewers with bonds
        vm.prank(alice);
        stakeManager.registerAsReviewer(500e18);
        vm.prank(bob);
        stakeManager.registerAsReviewer(1000e18);

        // Only verify alice with WorldID
        identityGate.setVerified(alice, keccak256("reviewer"), true);
        identityGate.setVerified(bob, keccak256("reviewer"), false); // bob not verified

        address[] memory eligibleReviewers = new address[](2);
        eligibleReviewers[0] = alice;
        eligibleReviewers[1] = bob;

        bytes32 taskId = keccak256("task1");
        uint256 taskCategory = 0;

        vm.prank(operator);
        queue.assignReview(taskId, taskCategory, eligibleReviewers, address(0));

        // Check assignment - only alice should be assigned (bob excluded due to no WorldID)
        (, address assignedReviewer,,,,) = queue.assignments(taskId);
        assertEq(assignedReviewer, alice);
    }

    function test_assignReview_reviewerWithBondAndWorldID_included() public {
        // Register reviewers with bonds
        vm.prank(alice);
        stakeManager.registerAsReviewer(500e18);
        vm.prank(bob);
        stakeManager.registerAsReviewer(1000e18);

        // Verify both with WorldID
        identityGate.setVerified(alice, keccak256("reviewer"), true);
        identityGate.setVerified(bob, keccak256("reviewer"), true);

        address[] memory eligibleReviewers = new address[](2);
        eligibleReviewers[0] = alice;
        eligibleReviewers[1] = bob;

        bytes32 taskId = keccak256("task1");
        uint256 taskCategory = 0;

        vm.prank(operator);
        queue.assignReview(taskId, taskCategory, eligibleReviewers, address(0));

        // Check assignment - either should be assigned (both have bond + WorldID)
        (, address assignedReviewer,,,,) = queue.assignments(taskId);
        assertTrue(assignedReviewer == alice || assignedReviewer == bob);
    }

    function test_setIdentityGate() public {
        IdentityGate newGate = new IdentityGate(address(this));
        queue.setIdentityGate(address(newGate));
        assertEq(address(queue.identityGate()), address(newGate));
    }

    // ─── Max Reviewer Scan Cap Tests ───────────────────────────────────────────

    function test_setMaxReviewerScanCount_validRange() public {
        queue.setMaxReviewerScanCount(100);
        assertEq(queue.maxReviewerScanCount(), 100);

        queue.setMaxReviewerScanCount(10);
        assertEq(queue.maxReviewerScanCount(), 10);

        queue.setMaxReviewerScanCount(200);
        assertEq(queue.maxReviewerScanCount(), 200);
    }

    function test_setMaxReviewerScanCount_tooLow() public {
        vm.expectRevert("Invalid scan count");
        queue.setMaxReviewerScanCount(9);
    }

    function test_setMaxReviewerScanCount_tooHigh() public {
        vm.expectRevert("Invalid scan count");
        queue.setMaxReviewerScanCount(201);
    }

    function test_setMaxReviewerScanCount_unauthorized() public {
        vm.prank(alice);
        vm.expectRevert(ReviewerQueue.Unauthorized.selector);
        queue.setMaxReviewerScanCount(100);
    }

    // ─── Self-Assignment Prevention Tests ──────────────────────────────────────

    function test_assignReview_selfAssignmentPrevented() public {
        // Register alice as reviewer
        vm.prank(alice);
        stakeManager.registerAsReviewer(500e18);

        address[] memory eligibleReviewers = new address[](1);
        eligibleReviewers[0] = alice;

        bytes32 taskId = keccak256("task1");

        // Try to assign with alice as both reviewer and worker - should skip alice
        vm.prank(operator);
        vm.expectRevert(ReviewerQueue.ReviewerAtCapacity.selector);
        queue.assignReview(taskId, 0, eligibleReviewers, alice);
    }

    function test_assignReview_selfAssignmentPrevented_multipleReviewers() public {
        // Register both alice and bob as reviewers
        vm.prank(alice);
        stakeManager.registerAsReviewer(500e18);
        vm.prank(bob);
        stakeManager.registerAsReviewer(1000e18);

        address[] memory eligibleReviewers = new address[](2);
        eligibleReviewers[0] = alice;
        eligibleReviewers[1] = bob;

        bytes32 taskId = keccak256("task1");

        // Assign with alice as worker - should only select bob
        vm.prank(operator);
        queue.assignReview(taskId, 0, eligibleReviewers, alice);

        (, address assignedReviewer,,,,) = queue.assignments(taskId);
        assertEq(assignedReviewer, bob); // Only bob should be selected since alice is the worker
    }

    function test_assignReview_selfAssignmentAllowed_whenWorkerIsZero() public {
        // Register alice as reviewer
        vm.prank(alice);
        stakeManager.registerAsReviewer(500e18);

        address[] memory eligibleReviewers = new address[](1);
        eligibleReviewers[0] = alice;

        bytes32 taskId = keccak256("task1");

        // Assign with address(0) as worker - alice should be eligible
        vm.prank(operator);
        queue.assignReview(taskId, 0, eligibleReviewers, address(0));

        (, address assignedReviewer,,,,) = queue.assignments(taskId);
        assertEq(assignedReviewer, alice);
    }

    // ─── O(1) Queue Removal Tests ───────────────────────────────────────────────

    function test_removeFromQueue_correctness() public {
        // Register alice as reviewer
        vm.prank(alice);
        stakeManager.registerAsReviewer(500e18);

        address[] memory eligibleReviewers = new address[](1);
        eligibleReviewers[0] = alice;

        // Assign multiple tasks
        bytes32 taskId1 = keccak256("task1");
        bytes32 taskId2 = keccak256("task2");
        bytes32 taskId3 = keccak256("task3");

        vm.prank(operator);
        queue.assignReview(taskId1, 0, eligibleReviewers, address(0));
        vm.prank(operator);
        queue.assignReview(taskId2, 0, eligibleReviewers, address(0));
        vm.prank(operator);
        queue.assignReview(taskId3, 0, eligibleReviewers, address(0));

        // Complete middle task to test O(1) removal
        vm.prank(operator);
        queue.completeReview(taskId2, alice);

        // Check that queue still has correct tasks
        bytes32[] memory reviewerQueue = queue.getReviewerQueue(alice);
        assertEq(reviewerQueue.length, 2);
        // The order may change due to swap-and-pop, but both remaining tasks should be present
        assertTrue(reviewerQueue[0] == taskId1 || reviewerQueue[0] == taskId3);
        assertTrue(reviewerQueue[1] == taskId1 || reviewerQueue[1] == taskId3);
    }

    function test_removeFromQueue_multipleRemovals() public {
        // Register alice as reviewer
        vm.prank(alice);
        stakeManager.registerAsReviewer(500e18);

        address[] memory eligibleReviewers = new address[](1);
        eligibleReviewers[0] = alice;

        // Assign multiple tasks
        bytes32 taskId1 = keccak256("task1");
        bytes32 taskId2 = keccak256("task2");
        bytes32 taskId3 = keccak256("task3");
        bytes32 taskId4 = keccak256("task4");

        vm.prank(operator);
        queue.assignReview(taskId1, 0, eligibleReviewers, address(0));
        vm.prank(operator);
        queue.assignReview(taskId2, 0, eligibleReviewers, address(0));
        vm.prank(operator);
        queue.assignReview(taskId3, 0, eligibleReviewers, address(0));
        vm.prank(operator);
        queue.assignReview(taskId4, 0, eligibleReviewers, address(0));

        // Complete tasks in non-sequential order
        vm.prank(operator);
        queue.completeReview(taskId2, alice);
        vm.prank(operator);
        queue.completeReview(taskId4, alice);
        vm.prank(operator);
        queue.completeReview(taskId1, alice);

        // Check that only task3 remains
        bytes32[] memory reviewerQueue = queue.getReviewerQueue(alice);
        assertEq(reviewerQueue.length, 1);
        assertEq(reviewerQueue[0], taskId3);
    }
}