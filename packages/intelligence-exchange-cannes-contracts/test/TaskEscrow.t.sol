// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IntelToken} from "../src/IntelToken.sol";
import {IntelStaking} from "../src/IntelStaking.sol";
import {TaskEscrow} from "../src/TaskEscrow.sol";

contract TaskEscrowTest is Test {
    IntelToken public token;
    IntelStaking public staking;
    TaskEscrow public escrow;

    address owner = address(this);
    address funder = address(0xF00D);
    address worker = address(0xBEEF);
    address treasury = address(0xFEED);
    address operator = address(0xDEAD);

    uint256 constant INITIAL_SUPPLY = 1_000_000e18;
    uint256 constant TASK_AMOUNT = 1000e18;

    bytes32 constant TASK_ID = keccak256("test-task");

    function setUp() public {
        // Deploy IntelToken
        token = new IntelToken("Intelligence Exchange", "INTEL", owner, INITIAL_SUPPLY, type(uint256).max);

        // Deploy IntelStaking
        staking = new IntelStaking(
            address(token),
            7 days,  // epochLength
            3 days,  // cooldown
            1e18,    // k
            10_000e18, // walletCap
            500_000e18  // globalEpochCap
        );

        // Deploy TaskEscrow
        escrow = new TaskEscrow(address(token), address(staking), treasury);

        // Fund funder with INTEL
        token.transfer(funder, INITIAL_SUPPLY / 2);

        // Set operator
        escrow.setOperator(operator, true);

        // Make TaskEscrow an operator of IntelStaking so it can call depositYield
        staking.setOperator(address(escrow), true);

        // Approve escrow to spend funder's INTEL
        vm.prank(funder);
        token.approve(address(escrow), type(uint256).max);

        // Approve escrow to spend this contract's INTEL for staking
        token.approve(address(staking), type(uint256).max);
    }

    // ─── fundTask ─────────────────────────────────────────────────────────────

    function test_fundTask_happyPath() public {
        vm.prank(funder);
        escrow.fundTask(TASK_ID, worker, TASK_AMOUNT);

        (bytes32 taskId, address funderAddr, address workerAddr, uint256 amount, , uint256 fundedAt, ) = escrow.tasks(TASK_ID);

        assertEq(taskId, TASK_ID);
        assertEq(funderAddr, funder);
        assertEq(workerAddr, worker);
        assertEq(amount, TASK_AMOUNT);
        assertGt(fundedAt, 0);
        assertEq(token.balanceOf(address(escrow)), TASK_AMOUNT);
    }

    function test_fundTask_duplicateRevert() public {
        vm.prank(funder);
        escrow.fundTask(TASK_ID, worker, TASK_AMOUNT);

        vm.prank(funder);
        vm.expectRevert(TaskEscrow.TaskAlreadyExists.selector);
        escrow.fundTask(TASK_ID, worker, TASK_AMOUNT);
    }

    function test_fundTask_zeroWorker() public {
        vm.prank(funder);
        vm.expectRevert(TaskEscrow.ZeroAddress.selector);
        escrow.fundTask(TASK_ID, address(0), TASK_AMOUNT);
    }

    function test_fundTask_zeroAmount() public {
        vm.prank(funder);
        vm.expectRevert(TaskEscrow.ZeroAmount.selector);
        escrow.fundTask(TASK_ID, worker, 0);
    }

    // ─── release ───────────────────────────────────────────────────────────────

    function test_release_correctSplit() public {
        vm.prank(funder);
        escrow.fundTask(TASK_ID, worker, TASK_AMOUNT);

        uint256 workerBalanceBefore = token.balanceOf(worker);
        uint256 treasuryBalanceBefore = token.balanceOf(treasury);
        uint256 stakingBalanceBefore = token.balanceOf(address(staking));

        vm.prank(operator);
        escrow.release(TASK_ID, worker);

        uint256 workerBalanceAfter = token.balanceOf(worker);
        uint256 treasuryBalanceAfter = token.balanceOf(treasury);
        uint256 stakingBalanceAfter = token.balanceOf(address(staking));

        // 81% to worker
        assertEq(workerBalanceAfter - workerBalanceBefore, (TASK_AMOUNT * 8100) / 10_000);
        // 10% to treasury
        assertEq(treasuryBalanceAfter - treasuryBalanceBefore, (TASK_AMOUNT * 1000) / 10_000);
        // 9% to staking (via depositYield)
        assertEq(stakingBalanceAfter - stakingBalanceBefore, (TASK_AMOUNT * 900) / 10_000);

        // Escrow should be empty
        assertEq(token.balanceOf(address(escrow)), 0);
    }

    function test_release_notFunded() public {
        vm.prank(operator);
        vm.expectRevert(TaskEscrow.TaskNotFunded.selector);
        escrow.release(TASK_ID, worker);
    }

    function test_release_unauthorized() public {
        vm.prank(funder);
        escrow.fundTask(TASK_ID, worker, TASK_AMOUNT);

        vm.prank(funder);
        vm.expectRevert(TaskEscrow.Unauthorized.selector);
        escrow.release(TASK_ID, worker);
    }

    function test_release_zeroWorker() public {
        vm.prank(funder);
        escrow.fundTask(TASK_ID, worker, TASK_AMOUNT);

        vm.prank(operator);
        vm.expectRevert(TaskEscrow.ZeroAddress.selector);
        escrow.release(TASK_ID, address(0));
    }

    // ─── refund ───────────────────────────────────────────────────────────────

    function test_refund_afterWindow() public {
        vm.prank(funder);
        escrow.fundTask(TASK_ID, worker, TASK_AMOUNT);

        uint256 funderBalanceBefore = token.balanceOf(funder);

        // Warp past refund window (7 days)
        vm.warp(8 days);

        vm.prank(funder);
        escrow.refund(TASK_ID);

        assertEq(token.balanceOf(funder), funderBalanceBefore + TASK_AMOUNT);
        assertEq(token.balanceOf(address(escrow)), 0);
    }

    function test_refund_beforeWindow() public {
        vm.prank(funder);
        escrow.fundTask(TASK_ID, worker, TASK_AMOUNT);

        vm.prank(funder);
        vm.expectRevert(TaskEscrow.RefundWindowNotElapsed.selector);
        escrow.refund(TASK_ID);
    }

    function test_refund_ownerCanForce() public {
        vm.prank(funder);
        escrow.fundTask(TASK_ID, worker, TASK_AMOUNT);

        uint256 funderBalanceBefore = token.balanceOf(funder);

        // Owner can refund immediately
        escrow.refund(TASK_ID);

        assertEq(token.balanceOf(funder), funderBalanceBefore + TASK_AMOUNT);
    }

    function test_refund_notFunded() public {
        vm.prank(funder);
        vm.expectRevert(TaskEscrow.TaskNotFunded.selector);
        escrow.refund(TASK_ID);
    }

    // ─── setSplitBps ──────────────────────────────────────────────────────────

    function test_setSplitBps_valid() public {
        escrow.setSplitBps(7000, 2000, 1000);

        assertEq(escrow.workerBps(), 7000);
        assertEq(escrow.stakerBps(), 2000);
        assertEq(escrow.treasuryBps(), 1000);
    }

    function test_setSplitBps_invalidSum() public {
        vm.expectRevert(TaskEscrow.InvalidSplit.selector);
        escrow.setSplitBps(5000, 3000, 1000); // sum = 9000, not 10000
    }

    function test_setSplitBps_unauthorized() public {
        vm.prank(funder);
        vm.expectRevert(TaskEscrow.Unauthorized.selector);
        escrow.setSplitBps(7000, 2000, 1000);
    }

    // ─── Configuration ─────────────────────────────────────────────────────────

    function test_setTreasury() public {
        address newTreasury = address(0xBEEF);
        escrow.setTreasury(newTreasury);
        assertEq(escrow.treasury(), newTreasury);
    }

    function test_setTreasury_zeroAddress() public {
        vm.expectRevert(TaskEscrow.ZeroAddress.selector);
        escrow.setTreasury(address(0));
    }

    function test_setOperator() public {
        address newOperator = address(0xC0DE);
        escrow.setOperator(newOperator, true);
        assertTrue(escrow.operators(newOperator));
    }

    function test_setRefundWindow() public {
        uint256 newWindow = 14 days;
        escrow.setRefundWindow(newWindow);
        assertEq(escrow.taskRefundWindow(), newWindow);
    }

    // ─── Ownable2Step ─────────────────────────────────────────────────────────

    function test_transferOwnership() public {
        address newOwner = address(0x1234);
        escrow.transferOwnership(newOwner);
        assertEq(escrow.pendingOwner(), newOwner);
    }

    function test_acceptOwnership() public {
        address newOwner = address(0x1234);
        escrow.transferOwnership(newOwner);

        vm.prank(newOwner);
        escrow.acceptOwnership();

        assertEq(escrow.owner(), newOwner);
        assertEq(escrow.pendingOwner(), address(0));
    }

    function test_acceptOwnership_unauthorized() public {
        address newOwner = address(0x1234);
        escrow.transferOwnership(newOwner);

        vm.prank(funder);
        vm.expectRevert(TaskEscrow.Unauthorized.selector);
        escrow.acceptOwnership();
    }
}