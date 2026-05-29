// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IntelToken} from "../src/IntelToken.sol";
import {IntelStaking} from "../src/IntelStaking.sol";
import {ReviewerStakeManager} from "../src/ReviewerStakeManager.sol";
import {WorkerStakeManager} from "../src/WorkerStakeManager.sol";
import {DisputeResolution} from "../src/DisputeResolution.sol";

contract DisputeResolutionTest is Test {
    IntelToken public intel;
    IntelStaking public staking;
    ReviewerStakeManager public reviewerStakeManager;
    WorkerStakeManager public workerStakeManager;
    DisputeResolution public disputeResolution;

    address owner = address(this);
    address operator = address(0x0F);
    address treasury = address(0x1);
    address disputer = address(0x2);
    address worker = address(0x3);
    address reviewer = address(0x4);
    address juror1 = address(0x5);
    address juror2 = address(0x6);
    address juror3 = address(0x7);
    address juror4 = address(0x8);
    address juror5 = address(0x9);

    bytes32 constant TASK_ID = bytes32("task_123");

    uint256 constant MAX_SUPPLY = 10_000_000e18;
    uint256 constant STAKE_AMOUNT = 1000e18;
    uint256 constant DISPUTE_BOND = 100e18;
    uint256 constant REVIEWER_BOND = 500e18;
    uint256 constant WORKER_STAKE = 1000e18;

    function setUp() public {
        // Deploy IntelToken
        intel = new IntelToken("INTEL", "INTEL", owner, 0, MAX_SUPPLY);

        // Deploy IntelStaking
        staking = new IntelStaking(
            address(intel),
            7 days,
            3 days,
            1e18,
            10_000e18,
            100_000e18
        );

        // Deploy stake managers
        reviewerStakeManager = new ReviewerStakeManager(address(intel), treasury);
        workerStakeManager = new WorkerStakeManager(address(intel), treasury);

        // Deploy DisputeResolution
        disputeResolution = new DisputeResolution(
            address(intel),
            payable(address(staking)),
            treasury
        );

        // Set stake managers in dispute resolution
        disputeResolution.setReviewerStakeManager(address(reviewerStakeManager));
        disputeResolution.setWorkerStakeManager(address(workerStakeManager));

        // Set dispute resolution as operator in stake managers so it can call slash
        reviewerStakeManager.setOperator(address(disputeResolution), true);
        workerStakeManager.setOperator(address(disputeResolution), true);

        // Mint tokens to all participants
        intel.mint(disputer, 10_000e18);
        intel.mint(worker, 10_000e18);
        intel.mint(reviewer, 10_000e18);
        intel.mint(juror1, 10_000e18);
        intel.mint(juror2, 10_000e18);
        intel.mint(juror3, 10_000e18);
        intel.mint(juror4, 10_000e18);
        intel.mint(juror5, 10_000e18);

        // Fund dispute resolution contract with INTEL for bond operations
        intel.mint(address(disputeResolution), 100_000e18);

        // Fund stake managers with INTEL for slash operations
        intel.mint(address(reviewerStakeManager), 1_000_000e18);
        intel.mint(address(workerStakeManager), 1_000_000e18);

        // Approve dispute resolution for disputer
        vm.prank(disputer);
        intel.approve(address(disputeResolution), type(uint256).max);

        // Approve staking for jurors
        vm.prank(juror1);
        intel.approve(address(staking), type(uint256).max);
        vm.prank(juror2);
        intel.approve(address(staking), type(uint256).max);
        vm.prank(juror3);
        intel.approve(address(staking), type(uint256).max);
        vm.prank(juror4);
        intel.approve(address(staking), type(uint256).max);
        vm.prank(juror5);
        intel.approve(address(staking), type(uint256).max);

        // Stake jurors so they can be selected
        vm.prank(juror1);
        staking.stake(STAKE_AMOUNT);
        vm.prank(juror2);
        staking.stake(STAKE_AMOUNT);
        vm.prank(juror3);
        staking.stake(STAKE_AMOUNT);
        vm.prank(juror4);
        staking.stake(STAKE_AMOUNT);
        vm.prank(juror5);
        staking.stake(STAKE_AMOUNT);

        // Register reviewer and stake worker
        vm.prank(reviewer);
        intel.approve(address(reviewerStakeManager), type(uint256).max);
        vm.prank(reviewer);
        reviewerStakeManager.registerAsReviewer(REVIEWER_BOND);

        vm.prank(worker);
        intel.approve(address(workerStakeManager), type(uint256).max);
        vm.prank(worker);
        workerStakeManager.stake(WORKER_STAKE);

        // Set operator
        disputeResolution.setOperator(operator, true);
    }

    // ─── Happy path: openDispute ───────────────────────────────────────────────

    function test_openDispute_happyPath() public {
        vm.prank(disputer);
        disputeResolution.openDispute(TASK_ID, worker, reviewer);

        assertEq(disputeResolution.nextDisputeId(), 1);

        (
            bytes32 taskId,
            address disputerAddr,
            address workerAddr,
            address reviewerAddr,
            uint256 bond,
            uint256 openedAt,
            uint256 votingDeadline,
            DisputeResolution.DisputeState state,
            ,

        ) = disputeResolution.disputes(0);

        assertEq(taskId, TASK_ID);
        assertEq(disputerAddr, disputer);
        assertEq(workerAddr, worker);
        assertEq(reviewerAddr, reviewer);
        assertEq(bond, DISPUTE_BOND);
        assertGt(openedAt, 0);
        assertEq(votingDeadline, 0); // Not set until jury selected
        assertEq(uint256(state), uint256(DisputeResolution.DisputeState.Pending));
    }

    // ─── Happy path: selectJury ─────────────────────────────────────────────────

    function test_selectJury_happyPath() public {
        vm.prank(disputer);
        disputeResolution.openDispute(TASK_ID, worker, reviewer);

        address[] memory jurors = new address[](5);
        jurors[0] = juror1;
        jurors[1] = juror2;
        jurors[2] = juror3;
        jurors[3] = juror4;
        jurors[4] = juror5;

        vm.prank(operator);
        disputeResolution.selectJury(0, jurors);

        (, , , , , , uint256 votingDeadline, ,, ) = disputeResolution.disputes(0);
        assertGt(votingDeadline, block.timestamp);
        assertEq(votingDeadline, block.timestamp + 48 hours);
    }

    function test_selectJury_invalidJurorNoStake() public {
        vm.prank(disputer);
        disputeResolution.openDispute(TASK_ID, worker, reviewer);

        address nonStaker = address(0xA);
        address[] memory jurors = new address[](5);
        jurors[0] = juror1;
        jurors[1] = juror2;
        jurors[2] = juror3;
        jurors[3] = juror4;
        jurors[4] = nonStaker;

        vm.prank(operator);
        vm.expectRevert(DisputeResolution.InvalidJuror.selector);
        disputeResolution.selectJury(0, jurors);
    }

    // ─── Happy path: castVote ──────────────────────────────────────────────────

    function test_castVote_valid() public {
        vm.prank(disputer);
        disputeResolution.openDispute(TASK_ID, worker, reviewer);

        address[] memory jurors = new address[](5);
        jurors[0] = juror1;
        jurors[1] = juror2;
        jurors[2] = juror3;
        jurors[3] = juror4;
        jurors[4] = juror5;

        vm.prank(operator);
        disputeResolution.selectJury(0, jurors);

        vm.prank(juror1);
        disputeResolution.castVote(0, true);

        (, , , , , , , , uint256 votesUphold, uint256 votesReject) = disputeResolution.disputes(0);
        assertEq(votesUphold, 1);
        assertEq(votesReject, 0);
    }

    function test_castVote_doubleVoteRevert() public {
        vm.prank(disputer);
        disputeResolution.openDispute(TASK_ID, worker, reviewer);

        address[] memory jurors = new address[](5);
        jurors[0] = juror1;
        jurors[1] = juror2;
        jurors[2] = juror3;
        jurors[3] = juror4;
        jurors[4] = juror5;

        vm.prank(operator);
        disputeResolution.selectJury(0, jurors);

        vm.prank(juror1);
        disputeResolution.castVote(0, true);

        vm.prank(juror1);
        vm.expectRevert(DisputeResolution.AlreadyVoted.selector);
        disputeResolution.castVote(0, false);
    }

    function test_castVote_nonJurorRevert() public {
        vm.prank(disputer);
        disputeResolution.openDispute(TASK_ID, worker, reviewer);

        address[] memory jurors = new address[](5);
        jurors[0] = juror1;
        jurors[1] = juror2;
        jurors[2] = juror3;
        jurors[3] = juror4;
        jurors[4] = juror5;

        vm.prank(operator);
        disputeResolution.selectJury(0, jurors);

        address nonJuror = address(0xB);
        vm.prank(nonJuror);
        vm.expectRevert(DisputeResolution.NotJuror.selector);
        disputeResolution.castVote(0, true);
    }

    // ─── Happy path: resolveDispute upheld (worker slashed) ───────────────────

    function test_resolveDispute_upheldWorkerSlashed() public {
        vm.prank(disputer);
        disputeResolution.openDispute(TASK_ID, worker, reviewer);

        address[] memory jurors = new address[](5);
        jurors[0] = juror1;
        jurors[1] = juror2;
        jurors[2] = juror3;
        jurors[3] = juror4;
        jurors[4] = juror5;

        vm.prank(operator);
        disputeResolution.selectJury(0, jurors);

        // All jurors vote uphold (60% quorum = 3 votes needed)
        vm.prank(juror1);
        disputeResolution.castVote(0, true);
        vm.prank(juror2);
        disputeResolution.castVote(0, true);
        vm.prank(juror3);
        disputeResolution.castVote(0, true);

        // Fast forward past voting deadline
        vm.warp(block.timestamp + 49 hours);

        uint256 disputerBalanceBefore = intel.balanceOf(disputer);

        disputeResolution.resolveDispute(0, false);

        (, , , , , , , DisputeResolution.DisputeState state,, ) = disputeResolution.disputes(0);

        assertEq(uint256(state), uint256(DisputeResolution.DisputeState.UpheldWorkerFault));

        // Disputer should get bond back + reporter share of worker slash (50% of DISPUTE_BOND)
        uint256 expectedReporterShare = DISPUTE_BOND / 2; // 50% to reporter
        assertEq(intel.balanceOf(disputer), disputerBalanceBefore + DISPUTE_BOND + expectedReporterShare);
    }

    // ─── Happy path: resolveDispute rejected (bond slashed) ───────────────────

    function test_resolveDispute_rejectedBondSlashed() public {
        vm.prank(disputer);
        disputeResolution.openDispute(TASK_ID, worker, reviewer);

        address[] memory jurors = new address[](5);
        jurors[0] = juror1;
        jurors[1] = juror2;
        jurors[2] = juror3;
        jurors[3] = juror4;
        jurors[4] = juror5;

        vm.prank(operator);
        disputeResolution.selectJury(0, jurors);

        // Only 2 jurors vote uphold (below 60% quorum of 3)
        vm.prank(juror1);
        disputeResolution.castVote(0, true);
        vm.prank(juror2);
        disputeResolution.castVote(0, true);
        vm.prank(juror3);
        disputeResolution.castVote(0, false); // Vote reject

        // Fast forward past voting deadline
        vm.warp(block.timestamp + 49 hours);

        uint256 treasuryBalanceBefore = intel.balanceOf(treasury);
        uint256 disputerBalanceBefore = intel.balanceOf(disputer);

        disputeResolution.resolveDispute(0, false);

        (, , , , , , , DisputeResolution.DisputeState state,, ) = disputeResolution.disputes(0);

        assertEq(uint256(state), uint256(DisputeResolution.DisputeState.Rejected));

        // Treasury should receive slashed bond
        assertGt(intel.balanceOf(treasury), treasuryBalanceBefore);

        // Disputer should not get bond back
        assertEq(intel.balanceOf(disputer), disputerBalanceBefore);
    }

    // ─── Happy path: expireDispute ─────────────────────────────────────────────

    function test_expireDispute_noVotes() public {
        vm.prank(disputer);
        disputeResolution.openDispute(TASK_ID, worker, reviewer);

        address[] memory jurors = new address[](5);
        jurors[0] = juror1;
        jurors[1] = juror2;
        jurors[2] = juror3;
        jurors[3] = juror4;
        jurors[4] = juror5;

        vm.prank(operator);
        disputeResolution.selectJury(0, jurors);

        // Fast forward past voting deadline + 24h grace
        vm.warp(block.timestamp + 48 hours + 25 hours);

        uint256 disputerBalanceBefore = intel.balanceOf(disputer);

        disputeResolution.expireDispute(0);

        (, , , , , , , DisputeResolution.DisputeState state,, ) = disputeResolution.disputes(0);

        assertEq(uint256(state), uint256(DisputeResolution.DisputeState.Expired));

        // Disputer should get bond back
        assertEq(intel.balanceOf(disputer), disputerBalanceBefore + DISPUTE_BOND);
    }

    // ─── Admin config tests ────────────────────────────────────────────────────

    function test_setJurorCount() public {
        disputeResolution.setJurorCount(7);
        assertEq(disputeResolution.jurorCount(), 7);
    }

    function test_setQuorumBps() public {
        disputeResolution.setQuorumBps(7000);
        assertEq(disputeResolution.quorumBps(), 7000);
    }

    function test_setQuorumBps_tooHigh() public {
        vm.expectRevert(DisputeResolution.QuorumTooHigh.selector);
        disputeResolution.setQuorumBps(11000);
    }

    function test_setDisputeWindow() public {
        disputeResolution.setDisputeWindow(96 hours);
        assertEq(disputeResolution.disputeWindow(), 96 hours);
    }

    function test_setVotingWindow() public {
        disputeResolution.setVotingWindow(72 hours);
        assertEq(disputeResolution.votingWindow(), 72 hours);
    }

    function test_setDisputeBond() public {
        disputeResolution.setDisputeBond(200e18);
        assertEq(disputeResolution.disputeBond(), 200e18);
    }

    function test_setTreasury() public {
        address newTreasury = address(0xC);
        disputeResolution.setTreasury(newTreasury);
        assertEq(disputeResolution.treasury(), newTreasury);
    }

    function test_setOperator() public {
        address newOperator = address(0xD);
        disputeResolution.setOperator(newOperator, true);
        assertTrue(disputeResolution.operators(newOperator));
    }

    // ─── Access control tests ─────────────────────────────────────────────────

    function test_onlyOwner_canSetConfig() public {
        vm.prank(disputer);
        vm.expectRevert(DisputeResolution.Unauthorized.selector);
        disputeResolution.setJurorCount(7);
    }

    function test_onlyOperator_canSelectJury() public {
        vm.prank(disputer);
        disputeResolution.openDispute(TASK_ID, worker, reviewer);

        address[] memory jurors = new address[](5);
        jurors[0] = juror1;
        jurors[1] = juror2;
        jurors[2] = juror3;
        jurors[3] = juror4;
        jurors[4] = juror5;

        vm.prank(disputer);
        vm.expectRevert(DisputeResolution.Unauthorized.selector);
        disputeResolution.selectJury(0, jurors);
    }

    // ─── Ownership transfer tests ──────────────────────────────────────────────

    function test_transferOwnership_twoStep() public {
        address newOwner = address(0xE);

        disputeResolution.transferOwnership(newOwner);
        assertEq(disputeResolution.pendingOwner(), newOwner);
        assertEq(disputeResolution.owner(), owner);

        vm.prank(newOwner);
        disputeResolution.acceptOwnership();

        assertEq(disputeResolution.owner(), newOwner);
        assertEq(disputeResolution.pendingOwner(), address(0));
    }

    function test_acceptOwnership_unauthorized() public {
        address newOwner = address(0xE);

        disputeResolution.transferOwnership(newOwner);

        vm.prank(disputer);
        vm.expectRevert(DisputeResolution.Unauthorized.selector);
        disputeResolution.acceptOwnership();
    }

    // ─── Reviewer fault path tests ─────────────────────────────────────────────

    function test_resolveDispute_reviewerAtFault_slashesReviewerBond() public {
        vm.prank(disputer);
        disputeResolution.openDispute(TASK_ID, worker, reviewer);

        address[] memory jurors = new address[](5);
        jurors[0] = juror1;
        jurors[1] = juror2;
        jurors[2] = juror3;
        jurors[3] = juror4;
        jurors[4] = juror5;

        vm.prank(operator);
        disputeResolution.selectJury(0, jurors);

        // All jurors vote uphold (60% quorum = 3 votes needed)
        vm.prank(juror1);
        disputeResolution.castVote(0, true);
        vm.prank(juror2);
        disputeResolution.castVote(0, true);
        vm.prank(juror3);
        disputeResolution.castVote(0, true);

        // Fast forward past voting deadline
        vm.warp(block.timestamp + 49 hours);

        uint256 reviewerBondBefore = reviewerStakeManager.reviewerBond(reviewer);
        uint256 treasuryBalanceBefore = intel.balanceOf(treasury);
        uint256 disputerBalanceBefore = intel.balanceOf(disputer);

        // Resolve with reviewer at fault (fraudulent accept)
        disputeResolution.resolveDispute(0, true);

        (, , , , , , , DisputeResolution.DisputeState state,, ) = disputeResolution.disputes(0);

        assertEq(uint256(state), uint256(DisputeResolution.DisputeState.UpheldReviewerFault));

        // Reviewer should be slashed by 20%
        uint256 expectedSlash = (reviewerBondBefore * 2000) / 10000;
        uint256 reviewerBondAfter = reviewerStakeManager.reviewerBond(reviewer);
        assertEq(reviewerBondAfter, reviewerBondBefore - expectedSlash);

        // Treasury should receive slashed amount
        assertEq(intel.balanceOf(treasury), treasuryBalanceBefore + expectedSlash);

        // Disputer should get bond back
        assertEq(intel.balanceOf(disputer), disputerBalanceBefore + DISPUTE_BOND);
    }

    function test_resolveDispute_reviewerAtFault_zeroBond_noSlash() public {
        vm.prank(disputer);
        disputeResolution.openDispute(TASK_ID, worker, reviewer);

        address[] memory jurors = new address[](5);
        jurors[0] = juror1;
        jurors[1] = juror2;
        jurors[2] = juror3;
        jurors[3] = juror4;
        jurors[4] = juror5;

        vm.prank(operator);
        disputeResolution.selectJury(0, jurors);

        // All jurors vote uphold
        vm.prank(juror1);
        disputeResolution.castVote(0, true);
        vm.prank(juror2);
        disputeResolution.castVote(0, true);
        vm.prank(juror3);
        disputeResolution.castVote(0, true);

        // Fast forward past voting deadline
        vm.warp(block.timestamp + 49 hours);

        // Unstake all reviewer bond
        vm.prank(reviewer);
        reviewerStakeManager.requestUnstake(REVIEWER_BOND);
        vm.warp(block.timestamp + 31 days);
        vm.prank(reviewer);
        reviewerStakeManager.finalizeUnstake();

        uint256 reviewerBondBefore = reviewerStakeManager.reviewerBond(reviewer);
        uint256 disputerBalanceBefore = intel.balanceOf(disputer);

        // Resolve with reviewer at fault (but zero bond)
        disputeResolution.resolveDispute(0, true);

        (, , , , , , , DisputeResolution.DisputeState state,, ) = disputeResolution.disputes(0);

        assertEq(uint256(state), uint256(DisputeResolution.DisputeState.UpheldReviewerFault));

        // Reviewer bond should remain zero (no slash possible)
        assertEq(reviewerStakeManager.reviewerBond(reviewer), 0);

        // Disputer should still get bond back
        assertEq(intel.balanceOf(disputer), disputerBalanceBefore + DISPUTE_BOND);
    }

    function test_setReviewerSlashBps() public {
        disputeResolution.setReviewerSlashBps(3000); // 30%
        assertEq(disputeResolution.reviewerSlashBps(), 3000);
    }

    function test_setReviewerSlashBps_tooHigh() public {
        vm.expectRevert(DisputeResolution.QuorumTooHigh.selector);
        disputeResolution.setReviewerSlashBps(11000);
    }
}