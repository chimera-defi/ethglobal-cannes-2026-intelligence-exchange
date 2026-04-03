// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { CannesMilestoneEscrow } from "../src/CannesMilestoneEscrow.sol";

contract CannesMilestoneEscrowTest is Test {
    CannesMilestoneEscrow internal escrow;
    address internal poster = vm.addr(1);
    address internal worker = vm.addr(2);
    address internal workerTwo = vm.addr(3);
    bytes32 internal milestoneId = keccak256("idea-cannes-001-scaffold");
    bytes32 internal reviewId = keccak256("idea-cannes-001-review");

    function setUp() public {
        escrow = new CannesMilestoneEscrow(poster, 400);
        vm.deal(poster, 10 ether);
        vm.txGasPrice(0);
    }

    function testFundReserveAndReleaseMilestone() public {
        vm.prank(poster);
        escrow.fund{ value: 0.25 ether }();

        vm.prank(poster);
        escrow.reserveMilestone(milestoneId, worker, 400);

        uint256 workerBalanceBefore = worker.balance;
        vm.prank(poster);
        escrow.releaseMilestone(milestoneId);

        assertEq(worker.balance - workerBalanceBefore, 0.25 ether);
        assertEq(uint256(escrow.escrowStatus()), uint256(CannesMilestoneEscrow.EscrowStatus.Closed));
    }

    function testPartialReleaseKeepsEscrowOpen() public {
        vm.prank(poster);
        escrow.fund{ value: 0.25 ether }();

        vm.prank(poster);
        escrow.reserveMilestone(milestoneId, worker, 160);
        vm.prank(poster);
        escrow.reserveMilestone(reviewId, workerTwo, 80);

        uint256 workerBalanceBefore = worker.balance;
        vm.prank(poster);
        escrow.releaseMilestone(milestoneId);

        assertEq(worker.balance - workerBalanceBefore, 0.1 ether);
        assertEq(address(escrow).balance, 0.15 ether);
        assertEq(uint256(escrow.escrowStatus()), uint256(CannesMilestoneEscrow.EscrowStatus.Funded));
    }

    function testRefundMilestone() public {
        vm.prank(poster);
        escrow.fund{ value: 0.25 ether }();

        vm.prank(poster);
        escrow.reserveMilestone(milestoneId, worker, 160);

        uint256 posterBalanceBefore = poster.balance;
        vm.prank(poster);
        escrow.refundMilestone(milestoneId);

        assertGt(poster.balance, posterBalanceBefore);
    }

    function testCloseEscrowRefundsUnreservedBalance() public {
        vm.prank(poster);
        escrow.fund{ value: 0.25 ether }();

        vm.prank(poster);
        escrow.reserveMilestone(milestoneId, worker, 160);

        vm.prank(poster);
        escrow.releaseMilestone(milestoneId);

        vm.prank(poster);
        escrow.closeEscrow();

        assertEq(uint256(escrow.escrowStatus()), uint256(CannesMilestoneEscrow.EscrowStatus.Closed));
        assertEq(address(escrow).balance, 0);
    }
}
