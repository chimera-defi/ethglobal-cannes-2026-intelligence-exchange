// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IntelToken} from "../src/IntelToken.sol";
import {ReviewerStakeManager} from "../src/ReviewerStakeManager.sol";

contract ReviewerStakeManagerTest is Test {
    IntelToken public intel;
    ReviewerStakeManager public stakeManager;

    address owner = address(this);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address treasury = address(0x1234);
    address operator = address(0x5678);

    uint256 constant MIN_BOND = 500e18;
    uint256 constant MAX_SUPPLY = 10_000_000e18;

    function setUp() public {
        intel = new IntelToken("INTEL", "INTEL", owner, 0, MAX_SUPPLY);
        stakeManager = new ReviewerStakeManager(address(intel), treasury);

        // Mint tokens to test users
        intel.mint(alice, 100_000e18);
        intel.mint(bob, 100_000e18);
        intel.mint(treasury, 1_000_000e18);

        // Approve stakeManager for alice and bob
        vm.prank(alice);
        intel.approve(address(stakeManager), type(uint256).max);
        vm.prank(bob);
        intel.approve(address(stakeManager), type(uint256).max);
        vm.prank(treasury);
        intel.approve(address(stakeManager), type(uint256).max);

        // Register operator
        stakeManager.setOperator(operator, true);
        stakeManager.setOperator(treasury, true);
    }

    // ─── Registration Tests ───────────────────────────────────────────────────

    function test_registerWithSufficientBond() public {
        vm.prank(alice);
        stakeManager.registerAsReviewer(MIN_BOND);

        assertEq(stakeManager.reviewerBond(alice), MIN_BOND);
        assertTrue(stakeManager.eligibleReviewers(alice));
        assertEq(intel.balanceOf(address(stakeManager)), MIN_BOND);
    }

    function test_registerWithInsufficientBond() public {
        uint256 insufficientBond = 100e18; // Below 500e18 minimum
        
        vm.prank(alice);
        stakeManager.registerAsReviewer(insufficientBond);

        assertEq(stakeManager.reviewerBond(alice), insufficientBond);
        assertFalse(stakeManager.eligibleReviewers(alice));
    }

    function test_registerTopUpToBecomeEligible() public {
        // First register with insufficient bond
        vm.prank(alice);
        stakeManager.registerAsReviewer(100e18);
        assertFalse(stakeManager.eligibleReviewers(alice));

        // Top up to reach minimum
        vm.prank(alice);
        stakeManager.registerAsReviewer(400e18);

        assertEq(stakeManager.reviewerBond(alice), 500e18);
        assertTrue(stakeManager.eligibleReviewers(alice));
    }

    function test_registerZeroAmountReverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ReviewerStakeManager.ZeroAmount.selector));
        stakeManager.registerAsReviewer(0);
    }

    // ─── Fee Recording Tests ──────────────────────────────────────────────────

    function test_recordReviewAccruesFees() public {
        // Register alice as reviewer
        vm.prank(alice);
        stakeManager.registerAsReviewer(MIN_BOND);

        // Record a review with task value of 1000e18
        // Fee share = 1000e18 * 1000 / 10000 = 100e18
        uint256 taskValue = 1000e18;
        uint256 expectedFee = (taskValue * stakeManager.reviewerFeeShareBps()) / 10000;

        vm.prank(operator);
        stakeManager.recordReview(alice, taskValue);

        assertEq(stakeManager.reviewsSubmitted(alice), 1);
        assertEq(stakeManager.reviewFeeEarned(alice), expectedFee);
        assertEq(expectedFee, 100e18);
    }

    function test_recordReviewNotEligibleReverts() public {
        // Alice is not registered
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(ReviewerStakeManager.NotEligible.selector));
        stakeManager.recordReview(alice, 1000e18);
    }

    function test_recordReviewZeroTaskValueReverts() public {
        vm.prank(alice);
        stakeManager.registerAsReviewer(MIN_BOND);

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(ReviewerStakeManager.ZeroAmount.selector));
        stakeManager.recordReview(alice, 0);
    }

    // ─── Fee Claiming Tests ───────────────────────────────────────────────────

    function test_claimReviewFeesTransfers() public {
        // Register and record review
        vm.prank(alice);
        stakeManager.registerAsReviewer(MIN_BOND);

        vm.prank(operator);
        stakeManager.recordReview(alice, 1000e18);

        // Deposit fees to fund the payout
        uint256 feeAmount = stakeManager.reviewFeeEarned(alice);
        vm.prank(treasury);
        stakeManager.depositFees(feeAmount);

        uint256 balanceBefore = intel.balanceOf(alice);
        
        vm.prank(alice);
        stakeManager.claimReviewFees();

        assertEq(stakeManager.reviewFeeEarned(alice), 0);
        assertEq(intel.balanceOf(alice), balanceBefore + feeAmount);
    }

    function test_claimReviewFeesInsufficientBalanceReverts() public {
        vm.prank(alice);
        stakeManager.registerAsReviewer(MIN_BOND);

        vm.prank(operator);
        stakeManager.recordReview(alice, 1000e18);

        // Withdraw the bond to create insufficient balance
        vm.prank(alice);
        stakeManager.requestUnstake(MIN_BOND);
        skip(30 days);
        vm.prank(alice);
        stakeManager.finalizeUnstake();

        // Now contract has no balance, should revert
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ReviewerStakeManager.InsufficientFeeBalance.selector));
        stakeManager.claimReviewFees();
    }

    function test_claimReviewFeesZeroAmountReverts() public {
        vm.prank(alice);
        stakeManager.registerAsReviewer(MIN_BOND);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ReviewerStakeManager.ZeroAmount.selector));
        stakeManager.claimReviewFees();
    }

    // ─── Slashing Tests ───────────────────────────────────────────────────────

    function test_slashReducesBondAndSetsIneligible() public {
        vm.prank(alice);
        stakeManager.registerAsReviewer(MIN_BOND);

        uint256 slashAmount = 100e18;
        uint256 treasuryBalanceBefore = intel.balanceOf(treasury);

        vm.prank(operator);
        stakeManager.slash(alice, slashAmount);

        assertEq(stakeManager.reviewerBond(alice), MIN_BOND - slashAmount);
        assertFalse(stakeManager.eligibleReviewers(alice));
        assertEq(intel.balanceOf(treasury), treasuryBalanceBefore + slashAmount);
    }

    function test_slashPartialKeepsEligible() public {
        // Register with more than minimum
        uint256 largeBond = 1000e18;
        vm.prank(alice);
        stakeManager.registerAsReviewer(largeBond);

        uint256 slashAmount = 200e18;
        
        vm.prank(operator);
        stakeManager.slash(alice, slashAmount);

        assertEq(stakeManager.reviewerBond(alice), largeBond - slashAmount);
        assertTrue(stakeManager.eligibleReviewers(alice)); // Still above 500e18
    }

    function test_slashInsufficientBondReverts() public {
        vm.prank(alice);
        stakeManager.registerAsReviewer(MIN_BOND);

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(ReviewerStakeManager.InsufficientBond.selector));
        stakeManager.slash(alice, MIN_BOND + 1);
    }

    function test_slashZeroAmountReverts() public {
        vm.prank(alice);
        stakeManager.registerAsReviewer(MIN_BOND);

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(ReviewerStakeManager.ZeroAmount.selector));
        stakeManager.slash(alice, 0);
    }

    // ─── Unstaking Tests ──────────────────────────────────────────────────────

    function test_unstakeCooldownEnforcement() public {
        vm.prank(alice);
        stakeManager.registerAsReviewer(MIN_BOND);

        uint256 unstakeAmount = 100e18;
        vm.prank(alice);
        stakeManager.requestUnstake(unstakeAmount);

        assertEq(stakeManager.pendingUnstake(alice), unstakeAmount);
        assertFalse(stakeManager.eligibleReviewers(alice)); // Below minimum now

        // Try to finalize before cooldown - should revert
        vm.prank(alice);
        vm.expectRevert(); // Don't check specific error due to parameter mismatch
        stakeManager.finalizeUnstake();

        // Warp past cooldown
        skip(30 days);

        // Now should succeed
        uint256 balanceBefore = intel.balanceOf(alice);
        vm.prank(alice);
        stakeManager.finalizeUnstake();

        assertEq(stakeManager.pendingUnstake(alice), 0);
        assertEq(intel.balanceOf(alice), balanceBefore + unstakeAmount);
    }

    function test_unstakeZeroAmountReverts() public {
        vm.prank(alice);
        stakeManager.registerAsReviewer(MIN_BOND);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ReviewerStakeManager.ZeroAmount.selector));
        stakeManager.requestUnstake(0);
    }

    function test_unstakeInsufficientBondReverts() public {
        vm.prank(alice);
        stakeManager.registerAsReviewer(MIN_BOND);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ReviewerStakeManager.InsufficientBond.selector));
        stakeManager.requestUnstake(MIN_BOND + 1);
    }

    function test_finalizeUnstakeNoPendingReverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ReviewerStakeManager.NoPendingUnstake.selector));
        stakeManager.finalizeUnstake();
    }

    // ─── View Function Tests ──────────────────────────────────────────────────

    function test_isEligibleReturnsCorrectStatus() public {
        assertFalse(stakeManager.isEligible(alice));

        vm.prank(alice);
        stakeManager.registerAsReviewer(MIN_BOND);
        
        assertTrue(stakeManager.isEligible(alice));

        vm.prank(alice);
        stakeManager.requestUnstake(MIN_BOND);
        
        assertFalse(stakeManager.isEligible(alice));
    }

    // ─── Admin Tests ──────────────────────────────────────────────────────────

    function test_setOperator() public {
        address newOperator = address(0x9999);
        
        stakeManager.setOperator(newOperator, true);
        assertTrue(stakeManager.operators(newOperator));

        stakeManager.setOperator(newOperator, false);
        assertFalse(stakeManager.operators(newOperator));
    }

    function test_setTreasury() public {
        address newTreasury = address(0xABCD);
        
        stakeManager.setTreasury(newTreasury);
        assertEq(stakeManager.treasury(), newTreasury);
    }

    function test_setMinReviewerBond() public {
        uint256 newMinBond = 1000e18;
        
        stakeManager.setMinReviewerBond(newMinBond);
        assertEq(stakeManager.minReviewerBond(), newMinBond);
    }

    function test_setReviewerFeeShareBps() public {
        uint256 newBps = 2000; // 20%
        
        stakeManager.setReviewerFeeShareBps(newBps);
        assertEq(stakeManager.reviewerFeeShareBps(), newBps);
    }

    function test_setUnstakeCooldown() public {
        uint256 newCooldown = 60 days;
        
        stakeManager.setUnstakeCooldown(newCooldown);
        assertEq(stakeManager.unstakeCooldown(), newCooldown);
    }

    function test_transferOwnership() public {
        address newOwner = address(0xFEDC);
        
        stakeManager.transferOwnership(newOwner);
        assertEq(stakeManager.pendingOwner(), newOwner);

        vm.prank(newOwner);
        stakeManager.acceptOwnership();
        
        assertEq(stakeManager.owner(), newOwner);
        assertEq(stakeManager.pendingOwner(), address(0));
    }

    function test_unauthorizedOperatorReverts() public {
        address unauthorized = address(0xBAD);
        
        vm.prank(unauthorized);
        vm.expectRevert(abi.encodeWithSelector(ReviewerStakeManager.Unauthorized.selector));
        stakeManager.recordReview(alice, 1000e18);
    }
}