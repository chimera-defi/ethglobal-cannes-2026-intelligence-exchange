// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IntelToken} from "../src/IntelToken.sol";
import {WorkerStakeManager} from "../src/WorkerStakeManager.sol";

contract WorkerStakeManagerTest is Test {
    IntelToken public intel;
    WorkerStakeManager public stakeManager;

    address owner = address(this);
    address worker = makeAddr("worker");
    address operator = makeAddr("operator");
    address treasury = makeAddr("treasury");
    address reporter = makeAddr("reporter");

    uint256 constant MIN_STAKE = 1000e18;    // 1000 INTEL
    uint256 constant HIGH_VALUE_THRESHOLD = 0.1 ether;
    uint256 constant COOLDOWN = 7 days;
    uint256 constant SLASH_TREASURY_BPS = 5000; // 50%

    uint256 constant MAX_SUPPLY = 1_000_000e18;

    function setUp() public {
        intel = new IntelToken("INTEL", "INTEL", owner, 0, MAX_SUPPLY);
        stakeManager = new WorkerStakeManager(address(intel), treasury);

        // Mint tokens to worker
        intel.mint(worker, 10_000e18);

        // Approve stake manager
        vm.prank(worker);
        intel.approve(address(stakeManager), type(uint256).max);

        // Register operator
        stakeManager.setOperator(operator, true);
    }

    // ─── Happy path: stake ─────────────────────────────────────────────────────

    function test_stake_basic() public {
        vm.prank(worker);
        stakeManager.stake(500e18);

        assertEq(stakeManager.workerStake(worker), 500e18);
        assertEq(intel.balanceOf(address(stakeManager)), 500e18);
        assertEq(intel.balanceOf(worker), 10_000e18 - 500e18);
    }

    function test_stake_multiple() public {
        vm.prank(worker);
        stakeManager.stake(500e18);

        vm.prank(worker);
        stakeManager.stake(300e18);

        assertEq(stakeManager.workerStake(worker), 800e18);
        assertEq(intel.balanceOf(address(stakeManager)), 800e18);
    }

    function test_stake_zeroAmount_reverts() public {
        vm.prank(worker);
        vm.expectRevert(WorkerStakeManager.ZeroAmount.selector);
        stakeManager.stake(0);
    }

    // ─── Happy path: requestUnstake ────────────────────────────────────────────

    function test_requestUnstake_basic() public {
        vm.prank(worker);
        stakeManager.stake(500e18);

        vm.prank(worker);
        stakeManager.requestUnstake(200e18);

        assertEq(stakeManager.workerStake(worker), 300e18);
        assertEq(stakeManager.pendingUnstake(worker), 200e18);
        assertEq(stakeManager.unstakeAvailableAt(worker), block.timestamp + COOLDOWN);
    }

    function test_requestUnstake_insufficientStake_reverts() public {
        vm.prank(worker);
        stakeManager.stake(100e18);

        vm.prank(worker);
        vm.expectRevert(WorkerStakeManager.InsufficientStake.selector);
        stakeManager.requestUnstake(200e18);
    }

    function test_requestUnstake_zeroAmount_reverts() public {
        vm.prank(worker);
        vm.expectRevert(WorkerStakeManager.ZeroAmount.selector);
        stakeManager.requestUnstake(0);
    }

    // ─── Happy path: finalizeUnstake ───────────────────────────────────────────

    function test_finalizeUnstake_afterCooldown() public {
        vm.prank(worker);
        stakeManager.stake(500e18);

        vm.prank(worker);
        stakeManager.requestUnstake(200e18);

        // Warp past cooldown
        vm.warp(block.timestamp + COOLDOWN + 1);

        vm.prank(worker);
        stakeManager.finalizeUnstake();

        assertEq(stakeManager.pendingUnstake(worker), 0);
        assertEq(stakeManager.unstakeAvailableAt(worker), 0);
        assertEq(intel.balanceOf(worker), 10_000e18 - 300e18); // 500 staked - 200 unstaked = 300 still staked
    }

    function test_finalizeUnstake_beforeCooldown_reverts() public {
        vm.prank(worker);
        stakeManager.stake(500e18);

        vm.prank(worker);
        stakeManager.requestUnstake(200e18);

        // Try to finalize before cooldown
        vm.prank(worker);
        vm.expectRevert();
        stakeManager.finalizeUnstake();
    }

    function test_finalizeUnstake_noPendingUnstake_reverts() public {
        vm.prank(worker);
        vm.expectRevert(WorkerStakeManager.NoPendingUnstake.selector);
        stakeManager.finalizeUnstake();
    }

    // ─── View: canClaim ───────────────────────────────────────────────────────

    function test_canClaim_lowValueTask_noStakeRequired() public {
        // Low-value task (below threshold) - no stake required
        bool canClaim = stakeManager.canClaim(worker, 0.05 ether);
        assertTrue(canClaim);
    }

    function test_canClaim_highValueTask_withSufficientStake() public {
        vm.prank(worker);
        stakeManager.stake(MIN_STAKE);

        bool canClaim = stakeManager.canClaim(worker, HIGH_VALUE_THRESHOLD);
        assertTrue(canClaim);
    }

    function test_canClaim_highValueTask_withInsufficientStake() public {
        vm.prank(worker);
        stakeManager.stake(500e18); // Less than MIN_STAKE

        bool canClaim = stakeManager.canClaim(worker, HIGH_VALUE_THRESHOLD);
        assertFalse(canClaim);
    }

    function test_canClaim_highValueTask_noStake() public {
        bool canClaim = stakeManager.canClaim(worker, HIGH_VALUE_THRESHOLD);
        assertFalse(canClaim);
    }

    function test_canClaim_exactlyAtThreshold() public {
        vm.prank(worker);
        stakeManager.stake(MIN_STAKE);

        bool canClaim = stakeManager.canClaim(worker, HIGH_VALUE_THRESHOLD);
        assertTrue(canClaim);
    }

    // ─── Slashing ─────────────────────────────────────────────────────────────

    function test_slash_happyPath() public {
        vm.prank(worker);
        stakeManager.stake(1000e18);

        vm.prank(operator);
        stakeManager.slash(worker, 500e18, reporter);

        assertEq(stakeManager.workerStake(worker), 500e18);
        assertEq(intel.balanceOf(treasury), 250e18); // 50% to treasury
        assertEq(intel.balanceOf(reporter), 250e18); // 50% to reporter
    }

    function test_slash_fromPendingUnstake() public {
        vm.prank(worker);
        stakeManager.stake(1000e18);

        vm.prank(worker);
        stakeManager.requestUnstake(800e18);

        vm.prank(operator);
        stakeManager.slash(worker, 500e18, reporter);

        // Should deduct from staked first (200), then pending (300)
        assertEq(stakeManager.workerStake(worker), 0);
        assertEq(stakeManager.pendingUnstake(worker), 500e18);
    }

    function test_slash_exceedsStake_reverts() public {
        vm.prank(worker);
        stakeManager.stake(100e18);

        vm.prank(operator);
        vm.expectRevert();
        stakeManager.slash(worker, 200e18, reporter);
    }

    function test_slash_zeroAmount_reverts() public {
        vm.prank(operator);
        vm.expectRevert(WorkerStakeManager.ZeroAmount.selector);
        stakeManager.slash(worker, 0, reporter);
    }

    function test_slash_zeroWorker_reverts() public {
        vm.prank(operator);
        vm.expectRevert(WorkerStakeManager.ZeroAddress.selector);
        stakeManager.slash(address(0), 100e18, reporter);
    }

    function test_slash_zeroReporter_reverts() public {
        vm.prank(operator);
        vm.expectRevert(WorkerStakeManager.ZeroAddress.selector);
        stakeManager.slash(worker, 100e18, address(0));
    }

    function test_slash_unauthorized_reverts() public {
        vm.prank(worker);
        stakeManager.stake(1000e18);

        vm.prank(address(0xBAD));
        vm.expectRevert(WorkerStakeManager.Unauthorized.selector);
        stakeManager.slash(worker, 500e18, reporter);
    }

    // ─── Admin functions ───────────────────────────────────────────────────────

    function test_setMinStake() public {
        stakeManager.setMinStake(2000e18);
        assertEq(stakeManager.minStakeToClaimHighValue(), 2000e18);
    }

    function test_setHighValueThreshold() public {
        stakeManager.setHighValueThreshold(0.5 ether);
        assertEq(stakeManager.highValueThresholdWei(), 0.5 ether);
    }

    function test_setCooldown() public {
        stakeManager.setCooldown(14 days);
        assertEq(stakeManager.cooldown(), 14 days);
    }

    function test_setTreasury() public {
        address newTreasury = address(0x9999);
        stakeManager.setTreasury(newTreasury);
        assertEq(stakeManager.treasuryAddress(), newTreasury);
    }

    function test_setTreasury_zeroAddress_reverts() public {
        vm.expectRevert(WorkerStakeManager.ZeroAddress.selector);
        stakeManager.setTreasury(address(0));
    }

    function test_setSlashSplit() public {
        stakeManager.setSlashSplit(7000); // 70%
        assertEq(stakeManager.slashTreasuryBps(), 7000);
    }

    function test_setSlashSplit_exceedsBps_reverts() public {
        vm.expectRevert(WorkerStakeManager.InvalidParam.selector);
        stakeManager.setSlashSplit(15000); // > 10000
    }

    function test_setOperator() public {
        address newOperator = address(0x8888);
        stakeManager.setOperator(newOperator, true);
        assertTrue(stakeManager.operators(newOperator));
    }

    function test_setOperator_zeroAddress_reverts() public {
        vm.expectRevert(WorkerStakeManager.ZeroAddress.selector);
        stakeManager.setOperator(address(0), true);
    }

    function test_ownershipTransfer() public {
        address newOwner = address(0x7777);

        stakeManager.transferOwnership(newOwner);
        assertEq(stakeManager.pendingOwner(), newOwner);

        vm.prank(newOwner);
        stakeManager.acceptOwnership();

        assertEq(stakeManager.owner(), newOwner);
        assertEq(stakeManager.pendingOwner(), address(0));
    }

    function test_acceptOwnership_unauthorized_reverts() public {
        stakeManager.transferOwnership(address(0x7777));

        vm.prank(address(0xBAD));
        vm.expectRevert(WorkerStakeManager.Unauthorized.selector);
        stakeManager.acceptOwnership();
    }

    function test_adminUnauthorized_reverts() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(WorkerStakeManager.Unauthorized.selector);
        stakeManager.setMinStake(2000e18);
    }
}