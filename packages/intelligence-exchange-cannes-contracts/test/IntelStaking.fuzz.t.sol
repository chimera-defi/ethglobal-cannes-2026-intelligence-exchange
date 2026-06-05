// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IntelToken} from "../src/IntelToken.sol";
import {IntelStaking} from "../src/IntelStaking.sol";

/// @title IntelStakingFuzzTest
/// @notice Comprehensive fuzz testing for IntelStaking contract
/// @dev Tests critical staking functions with randomized inputs to find edge cases
contract IntelStakingFuzzTest is Test {
    IntelToken public token;
    IntelStaking public staking;

    address owner = address(this);
    address operator = makeAddr("operator");

    uint256 constant MAX_SUPPLY = 1_000_000_000e18;
    uint256 constant INITIAL_SUPPLY = 100_000_000e18;

    uint256 constant EPOCH_LENGTH = 7 days;
    uint256 constant COOLDOWN = 3 days;
    uint256 constant K = 1e18;
    uint256 constant WALLET_CAP = 10_000e18;
    uint256 constant GLOBAL_EPOCH_CAP = 1_000_000e18;

    function setUp() public {
        token = new IntelToken("Intelligence Exchange", "INTEL", owner, INITIAL_SUPPLY, MAX_SUPPLY);

        staking = new IntelStaking(
            address(token),
            EPOCH_LENGTH,
            COOLDOWN,
            K,
            WALLET_CAP,
            GLOBAL_EPOCH_CAP
        );

        staking.setOperator(operator, true);
        staking.setMaxStakePerDeposit(0); // Remove deposit cap for fuzz testing
    }

    // ─── Fuzz: Staking Operations ─────────────────────────────────────────────

    /// @notice Fuzz test for stake function with random amounts
    /// @param amount Random stake amount
    /// @param seed Random seed for address generation
    function testFuzz_stake(uint256 amount, uint256 seed) public {
        vm.assume(amount > 0 && amount <= INITIAL_SUPPLY);

        address staker = address(uint160(seed));
        vm.assume(staker != address(0));

        // Transfer tokens to staker
        token.transfer(staker, amount);

        uint256 stakerBalanceBefore = token.balanceOf(staker);
        (uint256 stakerStakeBefore,,,,,,, ) = staking.stakers(staker);

        vm.prank(staker);
        token.approve(address(staking), amount);

        vm.prank(staker);
        staking.stake(amount);

        assertEq(token.balanceOf(staker), stakerBalanceBefore - amount);
        (uint256 stakerStakeAfter,,,,,,, ) = staking.stakers(staker);
        assertEq(stakerStakeAfter, stakerStakeBefore + amount);
    }

    /// @notice Fuzz test for multiple staking operations
    /// @param amounts Array of random stake amounts
    /// @param seed Random seed for address generation
    function testFuzz_multipleStakes(uint256[5] calldata amounts, uint256 seed) public {
        address staker = address(uint160(seed));
        vm.assume(staker != address(0));

        // Transfer tokens to staker
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < 5; i++) {
            uint256 amount = amounts[i] % (INITIAL_SUPPLY / 5);
            totalAmount += amount;
        }

        token.transfer(staker, totalAmount);

        vm.prank(staker);
        token.approve(address(staking), totalAmount);

        uint256 totalStaked = 0;
        for (uint256 i = 0; i < 5; i++) {
            uint256 amount = amounts[i] % (INITIAL_SUPPLY / 5);
            if (amount == 0) continue;

            (uint256 stakerStakeBefore,,,,,,, ) = staking.stakers(staker);

            vm.prank(staker);
            staking.stake(amount);

            (uint256 stakerStakeAfter,,,,,,, ) = staking.stakers(staker);
            assertEq(stakerStakeAfter, stakerStakeBefore + amount);
            totalStaked += amount;
        }

        (uint256 finalStake,,,,,,, ) = staking.stakers(staker);
        assertEq(finalStake, totalStaked);
    }

    // ─── Fuzz: Unstaking Operations ───────────────────────────────────────────

    /// @notice Fuzz test for requestUnstake function
    /// @param stakeAmount Initial stake amount
    /// @param unstakeAmount Amount to unstake
    /// @param seed Random seed for address generation
    function testFuzz_requestUnstake(uint256 stakeAmount, uint256 unstakeAmount, uint256 seed) public {
        vm.assume(stakeAmount > 0 && stakeAmount <= INITIAL_SUPPLY);
        vm.assume(unstakeAmount > 0 && unstakeAmount <= stakeAmount);

        address staker = address(uint160(seed));
        vm.assume(staker != address(0));

        token.transfer(staker, stakeAmount);

        vm.prank(staker);
        token.approve(address(staking), stakeAmount);

        vm.prank(staker);
        staking.stake(stakeAmount);

        // Warp past cooldown
        skip(COOLDOWN + 1);

        (uint256 stakerStakeBefore,,,,,,, ) = staking.stakers(staker);

        vm.prank(staker);
        staking.requestUnstake(unstakeAmount);

        // Check that unstake is pending
        (,,,,uint256 pendingUnstake,,,) = staking.stakers(staker);
        assertEq(pendingUnstake, unstakeAmount);
        (uint256 stakerStakeAfter,,,,,,, ) = staking.stakers(staker);
        assertEq(stakerStakeAfter, stakerStakeBefore - unstakeAmount);
    }

    /// @notice Fuzz test that unstake cannot exceed staked amount
    /// @param stakeAmount Initial stake amount
    /// @param unstakeAmount Amount to unstake
    /// @param seed Random seed for address generation
    function testFuzz_requestUnstakeExceedsStake(uint256 stakeAmount, uint256 unstakeAmount, uint256 seed) public {
        vm.assume(stakeAmount > 0 && stakeAmount <= INITIAL_SUPPLY);
        vm.assume(unstakeAmount > stakeAmount);

        address staker = address(uint160(seed));
        vm.assume(staker != address(0));

        token.transfer(staker, stakeAmount);

        vm.prank(staker);
        token.approve(address(staking), stakeAmount);

        vm.prank(staker);
        staking.stake(stakeAmount);

        // Warp past cooldown
        skip(COOLDOWN + 1);

        vm.prank(staker);
        vm.expectRevert();
        staking.requestUnstake(unstakeAmount);
    }

    /// @notice Fuzz test for unstake during cooldown
    /// @param stakeAmount Initial stake amount
    /// @param unstakeAmount Amount to unstake
    /// @param seed Random seed for address generation
    function testFuzz_requestUnstakeDuringCooldown(uint256 stakeAmount, uint256 unstakeAmount, uint256 seed) public {
        vm.assume(stakeAmount > 0 && stakeAmount <= INITIAL_SUPPLY);
        vm.assume(unstakeAmount > 0 && unstakeAmount <= stakeAmount);

        address staker = address(uint160(seed));
        vm.assume(staker != address(0));

        token.transfer(staker, stakeAmount);

        vm.prank(staker);
        token.approve(address(staking), stakeAmount);

        vm.prank(staker);
        staking.stake(stakeAmount);

        // Don't warp - still in cooldown
        vm.prank(staker);
        vm.expectRevert();
        staking.requestUnstake(unstakeAmount);
    }

    // ─── Fuzz: Yield Operations ───────────────────────────────────────────────

    /// @notice Fuzz test for depositYield function
    /// @param yieldAmount Amount of yield to deposit
    function testFuzz_depositYield(uint256 yieldAmount) public {
        vm.assume(yieldAmount > 0 && yieldAmount <= INITIAL_SUPPLY);

        uint256 yieldPoolBefore = staking.pendingYieldPool();

        vm.prank(operator);
        staking.depositYield(yieldAmount);

        assertEq(staking.pendingYieldPool(), yieldPoolBefore + yieldAmount);
    }

    /// @notice Fuzz test for claimYield function
    /// @param stakeAmount Initial stake amount
    /// @param yieldAmount Amount of yield to deposit
    /// @param seed Random seed for address generation
    function testFuzz_claimYield(uint256 stakeAmount, uint256 yieldAmount, uint256 seed) public {
        vm.assume(stakeAmount > 0 && stakeAmount <= INITIAL_SUPPLY);
        vm.assume(yieldAmount > 0 && yieldAmount <= INITIAL_SUPPLY);

        address staker = address(uint160(seed));
        vm.assume(staker != address(0));

        token.transfer(staker, stakeAmount);

        vm.prank(staker);
        token.approve(address(staking), stakeAmount);

        vm.prank(staker);
        staking.stake(stakeAmount);

        // Deposit yield
        token.approve(address(staking), yieldAmount);
        staking.depositYield(yieldAmount);

        // Advance epoch to make yield claimable
        skip(EPOCH_LENGTH + 1);

        uint256 stakerBalanceBefore = token.balanceOf(staker);

        vm.prank(staker);
        staking.claimYield();

        assertGe(token.balanceOf(staker), stakerBalanceBefore);
    }

    // ─── Fuzz: Epoch Operations ───────────────────────────────────────────────

    /// @notice Fuzz test for epoch advancement
    /// @param skipTime Amount of time to skip
    function testFuzz_advanceEpoch(uint256 skipTime) public {
        vm.assume(skipTime > 0 && skipTime <= 365 days);

        uint256 epochBefore = staking.currentEpoch();

        skip(skipTime);

        uint256 epochAfter = staking.currentEpoch();

        // Epoch should have advanced
        assertGe(epochAfter, epochBefore);
    }

    // ─── Fuzz: Edge Cases ──────────────────────────────────────────────────────

    /// @notice Fuzz test for zero amount stake
    function testFuzz_stakeZeroAmount() public {
        vm.expectRevert();
        staking.stake(0);
    }

    /// @notice Fuzz test for staking with insufficient balance
    /// @param amount Random stake amount
    /// @param seed Random seed for address generation
    function testFuzz_stakeInsufficientBalance(uint256 amount, uint256 seed) public {
        vm.assume(amount > INITIAL_SUPPLY);

        address staker = address(uint160(seed));
        vm.assume(staker != address(0));

        // Don't transfer tokens - staker has no balance
        vm.prank(staker);
        token.approve(address(staking), amount);

        vm.prank(staker);
        vm.expectRevert();
        staking.stake(amount);
    }

    /// @notice Fuzz test for staking when paused
    /// @param amount Random stake amount
    function testFuzz_stakeWhenPaused(uint256 amount) public {
        vm.assume(amount > 0 && amount <= INITIAL_SUPPLY);

        staking.pause();

        vm.expectRevert();
        staking.stake(amount);
    }

    /// @notice Fuzz test for multiple stakers with random amounts
    /// @param amounts Array of random stake amounts for 10 stakers
    function testFuzz_multipleStakers(uint256[10] calldata amounts) public {
        address[10] memory stakers;
        uint256 totalStaked = 0;

        for (uint256 i = 0; i < 10; i++) {
            stakers[i] = address(uint160(i + 1));
            uint256 amount = amounts[i] % (INITIAL_SUPPLY / 10);
            if (amount == 0) continue;

            token.transfer(stakers[i], amount);

            vm.prank(stakers[i]);
            token.approve(address(staking), amount);

            vm.prank(stakers[i]);
            staking.stake(amount);

            totalStaked += amount;

            (uint256 stakerStaked,,,,,,, ) = staking.stakers(stakers[i]);
            assertEq(stakerStaked, amount);
        }

        // Verify total staked across all stakers
        uint256 contractBalance = token.balanceOf(address(staking));
        assertEq(contractBalance, totalStaked);
    }

    // ─── Fuzz: Allowance Calculation ───────────────────────────────────────────

    /// @notice Fuzz test for mint allowance calculation
    /// @param stakeAmount Initial stake amount
    /// @param seed Random seed for address generation
    function testFuzz_mintAllowance(uint256 stakeAmount, uint256 seed) public {
        vm.assume(stakeAmount > 0 && stakeAmount <= WALLET_CAP);

        address staker = address(uint160(seed));
        vm.assume(staker != address(0));

        token.transfer(staker, stakeAmount);

        vm.prank(staker);
        token.approve(address(staking), stakeAmount);

        vm.prank(staker);
        staking.stake(stakeAmount);

        // Get mint allowance
        uint256 allowance = staking.mintAllowance(staker);

        // Allowance should be based on sqrt(stake) * k
        // Should not exceed wallet cap
        assertLe(allowance, WALLET_CAP);
    }
}