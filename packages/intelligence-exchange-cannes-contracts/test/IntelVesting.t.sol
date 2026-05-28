// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {IntelVesting} from "../src/IntelVesting.sol";
import {IntelToken} from "../src/IntelToken.sol";

contract IntelVestingTest is Test {
    IntelToken token;
    IntelVesting vesting;

    address treasury    = makeAddr("treasury");
    address beneficiary = makeAddr("beneficiary");

    uint256 constant TOTAL = 2_000_000e18; // 2M INTEL

    // Vesting params: 1yr cliff, 3yr duration (4yr total)
    uint256 constant CLIFF_DELAY  = 365 days;
    uint256 constant DURATION     = 3 * 365 days;

    uint256 startTime;

    function setUp() public {
        startTime = block.timestamp;

        token = new IntelToken(
            "Intelligence Exchange Token",
            "INTEL",
            address(this),
            10_000_000e18,
            100_000_000e18
        );

        vesting = new IntelVesting(
            address(token),
            beneficiary,
            treasury,
            startTime,
            CLIFF_DELAY,
            DURATION,
            TOTAL
        );

        // Fund vesting contract
        token.transfer(address(vesting), TOTAL);
    }

    // ─── Constructor ──────────────────────────────────────────────────────

    function test_constructor_stores_params() public view {
        assertEq(vesting.token(),           address(token));
        assertEq(vesting.beneficiary(),     beneficiary);
        assertEq(vesting.treasury(),        treasury);
        assertEq(vesting.cliff(),           startTime + CLIFF_DELAY);
        assertEq(vesting.duration(),        DURATION);
        assertEq(vesting.totalAllocation(), TOTAL);
        assertEq(vesting.released(),        0);
        assertFalse(vesting.revoked());
    }

    function test_reverts_on_zero_token() public {
        vm.expectRevert(IntelVesting.ZeroAddress.selector);
        new IntelVesting(address(0), beneficiary, treasury, startTime, CLIFF_DELAY, DURATION, TOTAL);
    }

    function test_reverts_on_zero_beneficiary() public {
        vm.expectRevert(IntelVesting.ZeroAddress.selector);
        new IntelVesting(address(token), address(0), treasury, startTime, CLIFF_DELAY, DURATION, TOTAL);
    }

    function test_reverts_on_zero_treasury() public {
        vm.expectRevert(IntelVesting.ZeroAddress.selector);
        new IntelVesting(address(token), beneficiary, address(0), startTime, CLIFF_DELAY, DURATION, TOTAL);
    }

    function test_reverts_on_zero_duration() public {
        vm.expectRevert(IntelVesting.InvalidDuration.selector);
        new IntelVesting(address(token), beneficiary, treasury, startTime, CLIFF_DELAY, 0, TOTAL);
    }

    // ─── vestedAmount ─────────────────────────────────────────────────────

    function test_vested_before_cliff_is_zero() public view {
        uint256 justBeforeCliff = startTime + CLIFF_DELAY - 1;
        assertEq(vesting.vestedAmount(justBeforeCliff), 0);
    }

    function test_vested_at_cliff_is_zero() public view {
        // At exactly the cliff timestamp: elapsed=0, so 0/DURATION * TOTAL = 0
        assertEq(vesting.vestedAmount(startTime + CLIFF_DELAY), 0);
    }

    function test_vested_halfway_through_duration() public view {
        uint256 halfway = startTime + CLIFF_DELAY + (DURATION / 2);
        uint256 expected = TOTAL / 2;
        assertApproxEqAbs(vesting.vestedAmount(halfway), expected, 1e15);
    }

    function test_vested_at_end_is_total() public view {
        uint256 end = startTime + CLIFF_DELAY + DURATION;
        assertEq(vesting.vestedAmount(end), TOTAL);
    }

    function test_vested_after_end_is_total() public view {
        uint256 farFuture = startTime + CLIFF_DELAY + DURATION + 365 days;
        assertEq(vesting.vestedAmount(farFuture), TOTAL);
    }

    // ─── releasable ───────────────────────────────────────────────────────

    function test_releasable_before_cliff_is_zero() public {
        vm.warp(startTime + CLIFF_DELAY - 1);
        assertEq(vesting.releasable(), 0);
    }

    function test_releasable_after_partial_release() public {
        // Warp to halfway
        vm.warp(startTime + CLIFF_DELAY + DURATION / 2);
        uint256 rel1 = vesting.releasable();
        assertGt(rel1, 0);

        vesting.release();

        uint256 rel2 = vesting.releasable();
        assertEq(rel2, 0, "Nothing more releasable immediately after release");
    }

    // ─── release ──────────────────────────────────────────────────────────

    function test_release_sends_tokens_to_beneficiary() public {
        vm.warp(startTime + CLIFF_DELAY + DURATION); // fully vested

        uint256 beforeBal = token.balanceOf(beneficiary);
        vesting.release();
        uint256 afterBal  = token.balanceOf(beneficiary);

        assertEq(afterBal - beforeBal, TOTAL);
        assertEq(vesting.released(), TOTAL);
    }

    function test_release_emits_event() public {
        vm.warp(startTime + CLIFF_DELAY + DURATION);

        vm.expectEmit(true, false, false, true);
        emit IntelVesting.Released(beneficiary, TOTAL);
        vesting.release();
    }

    function test_release_reverts_when_nothing_to_release() public {
        vm.expectRevert(IntelVesting.NothingToRelease.selector);
        vesting.release(); // before cliff
    }

    function test_release_cumulative_correct() public {
        // Release at 25% mark
        vm.warp(startTime + CLIFF_DELAY + DURATION / 4);
        vesting.release();
        uint256 bal1 = token.balanceOf(beneficiary);

        // Release at 75% mark
        vm.warp(startTime + CLIFF_DELAY + (3 * DURATION) / 4);
        vesting.release();
        uint256 bal2 = token.balanceOf(beneficiary);

        // bal2 - bal1 should be roughly another 50%
        assertApproxEqAbs(bal2 - bal1, TOTAL / 2, TOTAL / 100);

        // Release remainder
        vm.warp(startTime + CLIFF_DELAY + DURATION + 1);
        vesting.release();
        uint256 bal3 = token.balanceOf(beneficiary);
        assertApproxEqAbs(bal3, TOTAL, TOTAL / 1000);
    }

    function test_release_callable_by_anyone() public {
        vm.warp(startTime + CLIFF_DELAY + DURATION);

        address caller = makeAddr("randomCaller");
        vm.prank(caller);
        vesting.release(); // should not revert

        assertEq(token.balanceOf(beneficiary), TOTAL);
    }

    // ─── revoke ───────────────────────────────────────────────────────────

    function test_revoke_before_cliff_returns_tokens_to_treasury() public {
        vm.warp(startTime + CLIFF_DELAY / 2); // before cliff

        uint256 tBefore = token.balanceOf(treasury);
        vm.prank(treasury);
        vesting.revoke();
        uint256 tAfter  = token.balanceOf(treasury);

        // All TOTAL goes back to treasury (nothing released yet)
        assertEq(tAfter - tBefore, TOTAL);
        assertTrue(vesting.revoked());
    }

    function test_revoke_emits_event() public {
        vm.warp(startTime);

        vm.expectEmit(true, false, false, true);
        emit IntelVesting.Revoked(treasury, TOTAL);
        vm.prank(treasury);
        vesting.revoke();
    }

    function test_revoke_only_treasury() public {
        vm.prank(beneficiary);
        vm.expectRevert(IntelVesting.Unauthorized.selector);
        vesting.revoke();
    }

    function test_revoke_after_cliff_reverts() public {
        vm.warp(startTime + CLIFF_DELAY + 1); // after cliff
        vm.prank(treasury);
        vm.expectRevert(IntelVesting.RevocationLockedAfterCliff.selector);
        vesting.revoke();
    }

    function test_revoke_twice_reverts() public {
        vm.prank(treasury);
        vesting.revoke();

        vm.prank(treasury);
        vm.expectRevert(IntelVesting.AlreadyRevoked.selector);
        vesting.revoke();
    }

    function test_release_after_revoke_reverts() public {
        vm.warp(startTime + CLIFF_DELAY - 1);
        vm.prank(treasury);
        vesting.revoke();

        vm.warp(startTime + CLIFF_DELAY + DURATION);
        vm.expectRevert(IntelVesting.NothingToRelease.selector);
        vesting.release();
    }

    // ─── Fuzz ─────────────────────────────────────────────────────────────

    function testFuzz_vestedAmount_monotonic(uint256 t1, uint256 t2) public view {
        uint256 cliffTs = startTime + CLIFF_DELAY;
        t1 = bound(t1, cliffTs, cliffTs + DURATION);
        t2 = bound(t2, t1, cliffTs + DURATION + 365 days);

        uint256 v1 = vesting.vestedAmount(t1);
        uint256 v2 = vesting.vestedAmount(t2);
        assertGe(v2, v1, "Vesting must be monotonically non-decreasing");
    }

    function testFuzz_vestedAmount_never_exceeds_total(uint256 t) public view {
        t = bound(t, 0, type(uint128).max);
        assertLe(vesting.vestedAmount(t), TOTAL);
    }
}
