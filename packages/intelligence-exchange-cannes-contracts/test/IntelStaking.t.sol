// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IntelToken} from "../src/IntelToken.sol";
import {IntelStaking} from "../src/IntelStaking.sol";

contract IntelStakingTest is Test {
    IntelToken public intel;
    IntelStaking public staking;

    address owner = address(this);
    address alice = address(0xA11CE);
    address bob   = address(0xB0B);
    address operator = address(0x0FFFF);

    // Params: 7d epoch, 3d cooldown, k=1e18, walletCap=10_000e18, globalCap=100_000e18
    uint256 constant EPOCH  = 7 days;
    uint256 constant COOL   = 3 days;
    uint256 constant K      = 1e18;
    uint256 constant WALLET_CAP = 10_000e18;
    uint256 constant GLOBAL_CAP = 100_000e18;

    uint256 constant MAX_SUPPLY = 1_000_000e18;

    function setUp() public {
        intel = new IntelToken("INTEL", "INTEL", owner, 0, MAX_SUPPLY);
        staking = new IntelStaking(
            address(intel),
            EPOCH,
            COOL,
            K,
            WALLET_CAP,
            GLOBAL_CAP
        );

        // Grant staking contract minting rights for yield transfers
        // (staking only transfers existing tokens, no mint needed)

        // Approve staking for alice and bob
        intel.mint(alice, 100_000e18);
        intel.mint(bob, 100_000e18);

        vm.prank(alice);
        intel.approve(address(staking), type(uint256).max);
        vm.prank(bob);
        intel.approve(address(staking), type(uint256).max);

        // Register operator
        staking.setOperator(operator, true);
    }

    // ─── Happy path: stake + allowance ───────────────────────────────────────

    function test_stake_basic() public {
        vm.prank(alice);
        staking.stake(100e18);

        assertEq(staking.totalStaked(), 100e18);
        (uint256 staked,,,,,, ) = staking.stakers(alice);
        assertEq(staked, 100e18);
        assertEq(intel.balanceOf(address(staking)), 100e18);
    }

    function test_mintAllowance_sqrt_formula() public {
        // k=1, staked=100 tokens → sqrt(100e18) = 10e9 (sqrt of wei amount)
        // allowance = k * sqrt(staked) / 1e18
        // With k=1e18 and staked=100e18: sqrt(100e18)≈10e9, allowance = 1e18 * 10e9 / 1e18 = 10e9
        // That's well below walletCap=10_000e18 so walletCap won't bind here.
        vm.prank(alice);
        staking.stake(100e18);

        uint256 allowance = staking.mintAllowance(alice);
        // sqrt(100e18) = 10_000_000_000 (1e10)
        // k * sqrt(staked) / 1e18 = 1e18 * 1e10 / 1e18 = 1e10
        assertEq(allowance, 1e10);
    }

    function test_mintAllowance_wallet_cap_binds() public {
        // Stake enough that k*sqrt(staked) > walletCap
        // Need k*sqrt(staked)/1e18 > 10_000e18
        // sqrt(staked) > 10_000e18 → staked > 1e44 which exceeds supply
        // So let's lower walletCap to test capping
        staking.setParams(EPOCH, COOL, K, 5e9, GLOBAL_CAP);

        vm.prank(alice);
        staking.stake(100e18); // allowance would be 1e10 without cap

        uint256 allowance = staking.mintAllowance(alice);
        assertEq(allowance, 5e9); // capped at walletCap=5e9
    }

    function test_mintAllowance_global_cap_binds() public {
        staking.setParams(EPOCH, COOL, K, WALLET_CAP, 3e9); // globalCap < walletCap < rawAllowance

        vm.prank(alice);
        staking.stake(100e18);

        uint256 allowance = staking.mintAllowance(alice);
        assertEq(allowance, 3e9); // capped at globalCap
    }

    function test_mintAllowance_zero_for_zero_stake() public {
        uint256 allowance = staking.mintAllowance(alice);
        assertEq(allowance, 0);
    }

    // ─── Consume allowance ────────────────────────────────────────────────────

    function test_consumeAllowance_reduces_remaining() public {
        vm.prank(alice);
        staking.stake(100e18);

        uint256 before = staking.mintAllowance(alice);
        vm.prank(operator);
        staking.consumeAllowance(alice, 1e9);

        uint256 after_ = staking.mintAllowance(alice);
        assertEq(after_, before - 1e9);
    }

    function test_consumeAllowance_reverts_if_exceeded() public {
        vm.prank(alice);
        staking.stake(100e18);

        uint256 avail = staking.mintAllowance(alice);

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(IntelStaking.AllowanceExceeded.selector, avail + 1, avail));
        staking.consumeAllowance(alice, avail + 1);
    }

    function test_consumeAllowance_only_operator() public {
        vm.prank(alice);
        staking.stake(100e18);

        vm.prank(alice);
        vm.expectRevert(IntelStaking.Unauthorized.selector);
        staking.consumeAllowance(alice, 1);
    }

    // ─── Unstake + cooldown ───────────────────────────────────────────────────

    function test_unstake_cooldown_flow() public {
        vm.prank(alice);
        staking.stake(50e18);

        vm.prank(alice);
        staking.requestUnstake(50e18);

        // Immediately trying to unstake should fail
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IntelStaking.CooldownActive.selector, block.timestamp + COOL));
        staking.unstake();

        // Advance past cooldown
        vm.warp(block.timestamp + COOL + 1);

        uint256 balBefore = intel.balanceOf(alice);
        vm.prank(alice);
        staking.unstake();

        assertEq(intel.balanceOf(alice) - balBefore, 50e18);
        assertEq(staking.totalStaked(), 0);
    }

    function test_unstake_reverts_if_no_pending() public {
        vm.prank(alice);
        vm.expectRevert(IntelStaking.NoPendingUnstake.selector);
        staking.unstake();
    }

    // ─── Epoch advancement ────────────────────────────────────────────────────

    function test_epoch_advances_after_length() public {
        assertEq(staking.epoch(), 1);
        vm.warp(block.timestamp + EPOCH + 1);
        staking.advanceEpoch();
        assertEq(staking.epoch(), 2);
    }

    function test_epoch_advance_resets_global_cap() public {
        vm.prank(alice);
        staking.stake(100e18);

        vm.prank(operator);
        staking.consumeAllowance(alice, 1e9);

        vm.warp(block.timestamp + EPOCH + 1);
        staking.advanceEpoch();

        // After epoch advance, globalCapRemaining should reset to GLOBAL_CAP
        assertEq(staking.globalCapRemaining(), GLOBAL_CAP);
    }

    function test_epoch_not_advanceable_early() public {
        vm.expectRevert(IntelStaking.EpochNotAdvanceable.selector);
        staking.advanceEpoch();
    }

    function test_allowance_resets_each_epoch() public {
        vm.prank(alice);
        staking.stake(100e18);

        uint256 allowanceBefore = staking.mintAllowance(alice);
        vm.prank(operator);
        staking.consumeAllowance(alice, allowanceBefore);
        assertEq(staking.mintAllowance(alice), 0);

        // Advance epoch
        vm.warp(block.timestamp + EPOCH + 1);
        staking.advanceEpoch();

        // Allowance should be restored
        assertGt(staking.mintAllowance(alice), 0);
    }

    // ─── Yield ────────────────────────────────────────────────────────────────

    function test_yield_deposit_and_claim() public {
        vm.prank(alice);
        staking.stake(100e18);

        // Owner mints INTEL for yield deposit
        intel.mint(owner, 10e18);
        intel.approve(address(staking), 10e18);
        staking.depositYield(10e18);

        uint256 pending = staking.pendingYield(alice);
        assertEq(pending, 10e18);

        uint256 balBefore = intel.balanceOf(alice);
        vm.prank(alice);
        staking.claimYield();

        assertEq(intel.balanceOf(alice) - balBefore, 10e18);
    }

    function test_yield_split_proportionally() public {
        vm.prank(alice);
        staking.stake(100e18);
        vm.prank(bob);
        staking.stake(300e18); // bob has 3x stake

        intel.mint(owner, 400e18);
        intel.approve(address(staking), 400e18);
        staking.depositYield(400e18);

        // alice 25%, bob 75%
        assertEq(staking.pendingYield(alice), 100e18);
        assertEq(staking.pendingYield(bob), 300e18);
    }

    function test_yield_claim_reverts_if_nothing() public {
        vm.prank(alice);
        vm.expectRevert(IntelStaking.NothingToClaim.selector);
        staking.claimYield();
    }

    function test_yield_buffered_if_no_stakers() public {
        // Deposit with no stakers
        intel.mint(owner, 10e18);
        intel.approve(address(staking), 10e18);
        staking.depositYield(10e18);

        // No stakers → buffered
        assertEq(staking.pendingYieldPool(), 10e18);

        // Alice stakes — advance epoch to flush buffer
        vm.prank(alice);
        staking.stake(100e18);
        vm.warp(block.timestamp + EPOCH + 1);
        staking.advanceEpoch(); // flushes pendingYieldPool into accYieldPerShare

        // Staking after epoch advance means Alice's stake was active at flush
        // Actually buffer is flushed at epoch advance, alice was staked before that
        assertGt(staking.pendingYield(alice), 0);
    }

    // ─── Edge cases ───────────────────────────────────────────────────────────

    function test_stake_zero_reverts() public {
        vm.prank(alice);
        vm.expectRevert(IntelStaking.ZeroAmount.selector);
        staking.stake(0);
    }

    function test_requestUnstake_more_than_staked_reverts() public {
        vm.prank(alice);
        staking.stake(10e18);

        vm.prank(alice);
        vm.expectRevert();
        staking.requestUnstake(11e18);
    }

    function test_allowance_zero_when_no_global_cap() public {
        staking.setParams(EPOCH, COOL, K, WALLET_CAP, 0); // globalCap=0 means uncapped by global

        vm.prank(alice);
        staking.stake(100e18);

        // When globalEpochCap=0 → uncapped by global (condition: globalEpochCap > 0)
        uint256 allowance = staking.mintAllowance(alice);
        // Should just be k*sqrt(staked) capped by walletCap
        assertGt(allowance, 0);
    }

    // ─── Security: yieldDebt initialization (pass-2 audit) ───────────────────

    /// @dev Regression: a new staker must NOT be able to claim yield that
    ///      accumulated before their deposit (flash-staker / pre-stake yield exploit).
    ///
    ///      Before fix: _settleYield wrote yieldDebt = 0 when staked == 0,
    ///      then stake() increased staked without re-syncing debt, letting the
    ///      new staker claim (staked * accYieldPerShare) / PRECISION on first claim.
    ///
    ///      After fix: stake() writes yieldDebt = (newStaked * accYieldPerShare)
    ///      / PRECISION immediately after updating staked, so pendingYield == 0
    ///      right after staking.
    function test_new_staker_cannot_claim_prestake_yield() public {
        // Alice stakes first and earns 100 INTEL yield
        vm.prank(alice);
        staking.stake(100e18);

        intel.mint(owner, 100e18);
        intel.approve(address(staking), 100e18);
        staking.depositYield(100e18);

        // Sanity: alice has 100 INTEL pending
        assertEq(staking.pendingYield(alice), 100e18);

        // Bob stakes AFTER the yield was deposited
        vm.prank(bob);
        staking.stake(100e18); // same size as alice

        // Bob must have zero pending yield — he was not staked when yield was deposited
        assertEq(staking.pendingYield(bob), 0, "new staker must not receive pre-stake yield");

        // Attempting to claimYield should revert with NothingToClaim
        vm.prank(bob);
        vm.expectRevert(IntelStaking.NothingToClaim.selector);
        staking.claimYield();
    }

    /// @dev Deposit yield after Bob already has a stake; he should receive his fair share.
    function test_existing_staker_receives_yield_after_deposit() public {
        vm.prank(alice);
        staking.stake(100e18);
        vm.prank(bob);
        staking.stake(100e18);

        intel.mint(owner, 200e18);
        intel.approve(address(staking), 200e18);
        staking.depositYield(200e18);

        // Each has 50% share → 100 INTEL each
        assertEq(staking.pendingYield(alice), 100e18);
        assertEq(staking.pendingYield(bob), 100e18);
    }

    /// @dev A user who stakes, partially unstakes, then re-stakes should not
    ///      receive yield that accumulated during the period they had no stake.
    function test_restaker_cannot_claim_yield_from_zero_stake_period() public {
        // Alice stakes
        vm.prank(alice);
        staking.stake(50e18);

        // Deposit yield — alice should get it all
        intel.mint(owner, 50e18);
        intel.approve(address(staking), 50e18);
        staking.depositYield(50e18);
        assertEq(staking.pendingYield(alice), 50e18);

        // Alice claims, then fully unstakes (enters cooldown, staked drops to 0)
        vm.prank(alice);
        staking.claimYield();
        vm.prank(alice);
        staking.requestUnstake(50e18);
        assertEq(staking.totalStaked(), 0);

        // More yield deposited while alice has zero stake
        intel.mint(owner, 50e18);
        intel.approve(address(staking), 50e18);
        staking.depositYield(50e18); // goes to pendingYieldPool (no stakers)

        // Alice re-stakes (same amount)
        intel.mint(alice, 50e18);
        vm.prank(alice);
        intel.approve(address(staking), 50e18);
        vm.prank(alice);
        staking.stake(50e18);

        // Alice should have 0 pending — the 50 INTEL is in pendingYieldPool, not yet distributed
        assertEq(staking.pendingYield(alice), 0, "re-staker must not receive pre-stake pending pool yield at stake time");
    }

    // ─── Access control ───────────────────────────────────────────────────────

    function test_setOperator_only_owner() public {
        vm.prank(alice);
        vm.expectRevert(IntelStaking.Unauthorized.selector);
        staking.setOperator(bob, true);
    }

    function test_transferOwnership() public {
        staking.transferOwnership(alice);
        assertEq(staking.owner(), alice);
    }

    function test_transferOwnership_to_zero_reverts() public {
        vm.expectRevert(IntelStaking.ZeroAddress.selector);
        staking.transferOwnership(address(0));
    }
}
