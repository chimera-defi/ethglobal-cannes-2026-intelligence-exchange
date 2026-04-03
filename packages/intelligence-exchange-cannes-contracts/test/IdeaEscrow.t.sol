// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IdeaEscrow} from "../src/IdeaEscrow.sol";

/// @dev Minimal ERC-20 mock for testing
contract MockUSDC {
    string public name = "Mock USDC";
    string public symbol = "USDC";
    uint8 public decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "insufficient balance");
        require(allowance[from][msg.sender] >= amount, "insufficient allowance");
        balanceOf[from] -= amount;
        allowance[from][msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract IdeaEscrowTest is Test {
    IdeaEscrow public escrow;
    MockUSDC public usdc;

    address poster = address(0xA11CE);
    address worker = address(0xB0B);

    bytes32 ideaId = keccak256("idea-demo-cannes-2026");
    bytes32 milestoneId1 = keccak256("milestone-1");
    bytes32 milestoneId2 = keccak256("milestone-2");

    uint256 constant IDEA_BUDGET = 1000e6;    // 1000 USDC
    uint256 constant MILESTONE_AMT = 250e6;  // 250 USDC per milestone

    function setUp() public {
        escrow = new IdeaEscrow();
        usdc = new MockUSDC();

        usdc.mint(poster, IDEA_BUDGET * 2);

        vm.prank(poster);
        usdc.approve(address(escrow), type(uint256).max);
    }

    // ─── fundIdea ─────────────────────────────────────────────────────────────

    function test_fundIdea_emitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit IdeaEscrow.IdeaFunded(ideaId, poster, address(usdc), IDEA_BUDGET);

        vm.prank(poster);
        escrow.fundIdea(ideaId, address(usdc), IDEA_BUDGET);
    }

    function test_fundIdea_storesBalances() public {
        vm.prank(poster);
        escrow.fundIdea(ideaId, address(usdc), IDEA_BUDGET);

        (uint256 available, uint256 total) = escrow.getIdeaBalance(ideaId);
        assertEq(available, IDEA_BUDGET);
        assertEq(total, IDEA_BUDGET);
        assertEq(usdc.balanceOf(address(escrow)), IDEA_BUDGET);
    }

    function test_fundIdea_revert_doubleFund() public {
        vm.startPrank(poster);
        escrow.fundIdea(ideaId, address(usdc), IDEA_BUDGET);

        vm.expectRevert(abi.encodeWithSelector(IdeaEscrow.IdeaAlreadyFunded.selector, ideaId));
        escrow.fundIdea(ideaId, address(usdc), IDEA_BUDGET);
        vm.stopPrank();
    }

    function test_fundIdea_revert_zeroAmount() public {
        vm.prank(poster);
        vm.expectRevert(IdeaEscrow.ZeroAmount.selector);
        escrow.fundIdea(ideaId, address(usdc), 0);
    }

    // ─── reserveMilestone ─────────────────────────────────────────────────────

    function _fund() internal {
        vm.prank(poster);
        escrow.fundIdea(ideaId, address(usdc), IDEA_BUDGET);
    }

    function test_reserveMilestone_emitsEvent() public {
        _fund();
        vm.expectEmit(true, true, false, true);
        emit IdeaEscrow.MilestoneReserved(ideaId, milestoneId1, MILESTONE_AMT);

        vm.prank(poster);
        escrow.reserveMilestone(ideaId, milestoneId1, MILESTONE_AMT);
    }

    function test_reserveMilestone_reducesAvailable() public {
        _fund();
        vm.prank(poster);
        escrow.reserveMilestone(ideaId, milestoneId1, MILESTONE_AMT);

        (uint256 available,) = escrow.getIdeaBalance(ideaId);
        assertEq(available, IDEA_BUDGET - MILESTONE_AMT);
    }

    function test_reserveMilestone_revert_insufficientBalance() public {
        _fund();
        vm.prank(poster);
        vm.expectRevert(
            abi.encodeWithSelector(IdeaEscrow.InsufficientBalance.selector, ideaId, IDEA_BUDGET + 1, IDEA_BUDGET)
        );
        escrow.reserveMilestone(ideaId, milestoneId1, IDEA_BUDGET + 1);
    }

    function test_reserveMilestone_revert_alreadyReserved() public {
        _fund();
        vm.startPrank(poster);
        escrow.reserveMilestone(ideaId, milestoneId1, MILESTONE_AMT);

        vm.expectRevert(abi.encodeWithSelector(IdeaEscrow.MilestoneAlreadyReserved.selector, milestoneId1));
        escrow.reserveMilestone(ideaId, milestoneId1, MILESTONE_AMT);
        vm.stopPrank();
    }

    function test_reserveMilestone_revert_unauthorized() public {
        _fund();
        vm.prank(worker);
        vm.expectRevert(IdeaEscrow.Unauthorized.selector);
        escrow.reserveMilestone(ideaId, milestoneId1, MILESTONE_AMT);
    }

    // ─── releaseMilestone ─────────────────────────────────────────────────────

    function _reserve() internal {
        _fund();
        vm.prank(poster);
        escrow.reserveMilestone(ideaId, milestoneId1, MILESTONE_AMT);
    }

    function test_releaseMilestone_sendsTokens() public {
        _reserve();
        uint256 workerBefore = usdc.balanceOf(worker);

        vm.prank(poster);
        escrow.releaseMilestone(ideaId, milestoneId1, worker);

        assertEq(usdc.balanceOf(worker), workerBefore + MILESTONE_AMT);
    }

    function test_releaseMilestone_emitsEvent() public {
        _reserve();
        vm.expectEmit(true, true, true, true);
        emit IdeaEscrow.MilestoneReleased(ideaId, milestoneId1, worker, MILESTONE_AMT);

        vm.prank(poster);
        escrow.releaseMilestone(ideaId, milestoneId1, worker);
    }

    function test_releaseMilestone_revert_notReserved() public {
        _fund();
        vm.prank(poster);
        vm.expectRevert(abi.encodeWithSelector(IdeaEscrow.MilestoneNotReserved.selector, milestoneId1));
        escrow.releaseMilestone(ideaId, milestoneId1, worker);
    }

    function test_releaseMilestone_revert_alreadySettled() public {
        _reserve();
        vm.startPrank(poster);
        escrow.releaseMilestone(ideaId, milestoneId1, worker);

        vm.expectRevert(abi.encodeWithSelector(IdeaEscrow.MilestoneAlreadySettled.selector, milestoneId1));
        escrow.releaseMilestone(ideaId, milestoneId1, worker);
        vm.stopPrank();
    }

    // ─── refundMilestone ──────────────────────────────────────────────────────

    function test_refundMilestone_restoresAvailable() public {
        _reserve();
        (uint256 availBefore,) = escrow.getIdeaBalance(ideaId);

        vm.prank(poster);
        escrow.refundMilestone(ideaId, milestoneId1, poster);

        (uint256 availAfter,) = escrow.getIdeaBalance(ideaId);
        assertEq(availAfter, availBefore + MILESTONE_AMT);
    }

    function test_refundMilestone_emitsEvent() public {
        _reserve();
        vm.expectEmit(true, true, true, true);
        emit IdeaEscrow.MilestoneRefunded(ideaId, milestoneId1, poster, MILESTONE_AMT);

        vm.prank(poster);
        escrow.refundMilestone(ideaId, milestoneId1, poster);
    }

    function test_refundMilestone_revert_alreadyReleased() public {
        _reserve();
        vm.startPrank(poster);
        escrow.releaseMilestone(ideaId, milestoneId1, worker);

        vm.expectRevert(abi.encodeWithSelector(IdeaEscrow.MilestoneAlreadySettled.selector, milestoneId1));
        escrow.refundMilestone(ideaId, milestoneId1, poster);
        vm.stopPrank();
    }

    // ─── Full lifecycle ───────────────────────────────────────────────────────

    function test_fullLifecycle_fundReserveRelease() public {
        // Fund
        vm.prank(poster);
        escrow.fundIdea(ideaId, address(usdc), IDEA_BUDGET);

        // Reserve two milestones
        vm.startPrank(poster);
        escrow.reserveMilestone(ideaId, milestoneId1, MILESTONE_AMT);
        escrow.reserveMilestone(ideaId, milestoneId2, MILESTONE_AMT);
        vm.stopPrank();

        (uint256 avail,) = escrow.getIdeaBalance(ideaId);
        assertEq(avail, IDEA_BUDGET - 2 * MILESTONE_AMT);

        // Release milestone 1
        vm.prank(poster);
        escrow.releaseMilestone(ideaId, milestoneId1, worker);

        assertEq(usdc.balanceOf(worker), MILESTONE_AMT);
        assertEq(
            uint256(escrow.getMilestoneStatus(milestoneId1)),
            uint256(IdeaEscrow.MilestoneStatus.Released)
        );

        // Refund milestone 2
        vm.prank(poster);
        escrow.refundMilestone(ideaId, milestoneId2, poster);

        (uint256 availFinal,) = escrow.getIdeaBalance(ideaId);
        assertEq(availFinal, IDEA_BUDGET - MILESTONE_AMT); // refunded amount back
    }
}
