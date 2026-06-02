// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IntelToken} from "../src/IntelToken.sol";
import {LiquidityMining} from "../src/LiquidityMining.sol";

contract LiquidityMiningTest is Test {
    IntelToken public intel;
    LiquidityMining public mining;

    address owner = address(this);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address operator = address(0x0FFFF);

    uint256 constant MAX_SUPPLY = 1_000_000e18;

    function setUp() public {
        intel = new IntelToken("INTEL", "INTEL", owner, 0, MAX_SUPPLY);
        mining = new LiquidityMining(address(intel));

        // Mint tokens to alice, bob, and operator
        intel.mint(alice, 100_000e18);
        intel.mint(bob, 100_000e18);
        intel.mint(operator, 100_000e18);

        // Approve mining contract
        vm.prank(alice);
        intel.approve(address(mining), type(uint256).max);
        vm.prank(bob);
        intel.approve(address(mining), type(uint256).max);
        vm.prank(operator);
        intel.approve(address(mining), type(uint256).max);

        // Register operator
        mining.setOperator(operator, true);
    }

    // ─── Basic stake/unstake ───────────────────────────────────────────────────

    function test_stake_basic() public {
        vm.prank(alice);
        mining.stake(100e18);

        assertEq(mining.totalStaked(), 100e18);
        (uint256 staked,) = mining.miners(alice);
        assertEq(staked, 100e18);
        assertEq(intel.balanceOf(address(mining)), 100e18);
    }

    function test_unstake_basic() public {
        vm.prank(alice);
        mining.stake(100e18);

        vm.prank(alice);
        mining.unstake(50e18);

        assertEq(mining.totalStaked(), 50e18);
        (uint256 staked,) = mining.miners(alice);
        assertEq(staked, 50e18);
        assertEq(intel.balanceOf(alice), 100_000e18 - 50e18);
    }

    function test_stake_zero_amount() public {
        vm.prank(alice);
        vm.expectRevert();
        mining.stake(0);
    }

    function test_unstake_zero_amount() public {
        vm.prank(alice);
        vm.expectRevert();
        mining.unstake(0);
    }

    // ─── Reward accrual over time ──────────────────────────────────────────────

    function test_reward_accrual_over_time() public {
        // Deposit rewards and set rate
        mining.setRewardRate(1e16); // 0.01 INTEL per second (called by owner)
        vm.prank(operator);
        mining.depositRewards(1000e18);

        // Alice stakes
        vm.prank(alice);
        mining.stake(100e18);

        // Warp 100 seconds
        vm.warp(block.timestamp + 100);

        // Alice should have accrued 1 INTEL (100s * 0.01 INTEL/s)
        uint256 pending = mining.pendingReward(alice);
        assertEq(pending, 1e18);

        // Claim rewards
        uint256 balanceBefore = intel.balanceOf(alice);
        vm.prank(alice);
        mining.claimRewards();
        assertEq(intel.balanceOf(alice) - balanceBefore, 1e18);
    }

    function test_reward_ends_after_endTime() public {
        mining.setRewardRate(1e16); // 0.01 INTEL per second (called by owner)
        vm.prank(operator);
        mining.depositRewards(100e18);

        vm.prank(alice);
        mining.stake(100e18);

        // Warp past reward end time (100e18 / 1e16 = 10000 seconds)
        vm.warp(block.timestamp + 10001);

        // Pending should be capped at total pool
        uint256 pending = mining.pendingReward(alice);
        assertEq(pending, 100e18);
    }

    // ─── Deposit rewards ───────────────────────────────────────────────────────

    function test_depositRewards() public {
        vm.prank(operator);
        mining.depositRewards(500e18);

        assertEq(mining.miningPool(), 500e18);
    }

    function test_depositRewards_extends_endTime() public {
        mining.setRewardRate(1e16); // called by owner
        vm.prank(operator);
        mining.depositRewards(100e18);

        uint256 endTime1 = mining.rewardEndTime();
        assertEq(endTime1, block.timestamp + 10000); // 100e18 / 1e16 = 10000s

        // Deposit more rewards
        vm.prank(operator);
        mining.depositRewards(100e18);
        uint256 endTime2 = mining.rewardEndTime();
        assertEq(endTime2, endTime1 + 10000); // Extended by another 10000s
    }

    // ─── Claim rewards ─────────────────────────────────────────────────────────

    function test_claimRewards() public {
        mining.setRewardRate(1e16); // called by owner
        vm.prank(operator);
        mining.depositRewards(100e18);

        vm.prank(alice);
        mining.stake(100e18);

        vm.warp(block.timestamp + 100);

        uint256 balanceBefore = intel.balanceOf(alice);
        vm.prank(alice);
        mining.claimRewards();
        assertEq(intel.balanceOf(alice) - balanceBefore, 1e18);
    }

    function test_claimRewards_nothing_to_claim() public {
        vm.prank(alice);
        mining.stake(100e18);

        vm.prank(alice);
        vm.expectRevert();
        mining.claimRewards();
    }

    // ─── Emergency withdraw ────────────────────────────────────────────────────

    function test_emergencyWithdraw() public {
        mining.setRewardRate(1e16); // called by owner
        vm.prank(operator);
        mining.depositRewards(100e18);

        vm.prank(alice);
        mining.stake(100e18);

        vm.warp(block.timestamp + 100);

        uint256 balanceBefore = intel.balanceOf(alice);
        vm.prank(alice);
        mining.emergencyWithdraw();

        // Should get principal back but not rewards
        assertEq(intel.balanceOf(alice) - balanceBefore, 100e18);
        assertEq(mining.totalStaked(), 0);
        (uint256 staked,) = mining.miners(alice);
        assertEq(staked, 0);
    }

    function test_emergencyWithdraw_no_stake() public {
        vm.prank(alice);
        vm.expectRevert();
        mining.emergencyWithdraw();
    }

    // ─── Edge cases ────────────────────────────────────────────────────────────

    function test_double_stake() public {
        vm.prank(alice);
        mining.stake(50e18);

        vm.prank(alice);
        mining.stake(50e18);

        assertEq(mining.totalStaked(), 100e18);
        (uint256 staked,) = mining.miners(alice);
        assertEq(staked, 100e18);
    }

    function test_zero_stake_pending_reward() public {
        uint256 pending = mining.pendingReward(alice);
        assertEq(pending, 0);
    }

    function test_setRewardRate() public {
        mining.setRewardRate(1e16);
        assertEq(mining.rewardRate(), 1e16);

        mining.setRewardRate(2e16);
        assertEq(mining.rewardRate(), 2e16);
    }

    function test_setRewardRate_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        mining.setRewardRate(1e16);
    }

    function test_setRewardRate_queuesDuringActivePeriod() public {
        // Start active mining period
        mining.setRewardRate(1e16);
        vm.prank(operator);
        mining.depositRewards(1000e18);
        
        vm.prank(alice);
        mining.stake(100e18);
        
        // Try to change rate during active period - should queue, not apply immediately
        mining.setRewardRate(2e16);
        
        // Rate should still be old rate
        assertEq(mining.rewardRate(), 1e16);
        // Pending rate should be set
        assertEq(mining.pendingRewardRate(), 2e16);
        // Rate change should be available after 2 days
        assertEq(mining.rateChangeAvailableAt(), block.timestamp + 2 days);
    }

    function test_commitRewardRate_afterDelay() public {
        // Start active mining period
        mining.setRewardRate(1e16);
        vm.prank(operator);
        mining.depositRewards(1000e18);
        
        vm.prank(alice);
        mining.stake(100e18);
        
        // Queue rate change
        mining.setRewardRate(2e16);
        
        // Try to commit before delay - should revert
        vm.expectRevert();
        mining.commitRewardRate();
        
        // Warp past 2-day delay
        vm.warp(block.timestamp + 2 days + 1);
        
        // Commit should now succeed
        vm.expectEmit(true, false, false, true);
        emit LiquidityMining.RewardRateUpdated(1e16, 2e16);
        mining.commitRewardRate();
        
        // Rate should be updated
        assertEq(mining.rewardRate(), 2e16);
        // Pending should be cleared
        assertEq(mining.pendingRewardRate(), 0);
        assertEq(mining.rateChangeAvailableAt(), 0);
    }

    function test_setRewardRate_appliesImmediatelyWhenInactive() public {
        // No active mining period
        assertEq(mining.rewardEndTime(), 0);
        
        // Should apply immediately
        vm.expectEmit(true, false, false, true);
        emit LiquidityMining.RewardRateUpdated(0, 1e16);
        mining.setRewardRate(1e16);
        
        assertEq(mining.rewardRate(), 1e16);
        assertEq(mining.pendingRewardRate(), 0);
    }

    function test_depositRewards_onlyOperator() public {
        vm.prank(alice);
        vm.expectRevert();
        mining.depositRewards(100e18);
    }

    // ─── Ownership transfer ───────────────────────────────────────────────────

    function test_transferOwnership() public {
        mining.transferOwnership(bob);
        assertEq(mining.pendingOwner(), bob);

        vm.prank(bob);
        mining.acceptOwnership();
        assertEq(mining.owner(), bob);
        assertEq(mining.pendingOwner(), address(0));
    }

    function test_acceptOwnership_unauthorized() public {
        mining.transferOwnership(bob);

        vm.prank(alice);
        vm.expectRevert();
        mining.acceptOwnership();
    }
}