// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IdeaEscrow} from "../src/IdeaEscrow.sol";

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
    bytes32 milestoneId3 = keccak256("milestone-3");

    uint256 constant IDEA_BUDGET = 1000e6;
    uint256 constant MILESTONE_AMT = 250e6;

    function setUp() public {
        escrow = new IdeaEscrow();
        usdc = new MockUSDC();

        usdc.mint(poster, IDEA_BUDGET * 2);

        vm.prank(poster);
        usdc.approve(address(escrow), type(uint256).max);
    }

    function _fund() internal {
        vm.prank(poster);
        escrow.fundIdea(ideaId, address(usdc), IDEA_BUDGET);
    }

    function _reserve() internal {
        _fund();
        vm.prank(poster);
        escrow.reserveMilestone(ideaId, milestoneId1, MILESTONE_AMT);
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

    function test_reserveMilestone_reducesAvailable() public {
        _fund();
        vm.prank(poster);
        escrow.reserveMilestone(ideaId, milestoneId1, MILESTONE_AMT);

        (uint256 available,) = escrow.getIdeaBalance(ideaId);
        assertEq(available, IDEA_BUDGET - MILESTONE_AMT);
    }

    function test_reserveMilestones_emitsPerMilestoneAndTracksBalance() public {
        _fund();

        bytes32[] memory milestoneIds = new bytes32[](2);
        milestoneIds[0] = milestoneId1;
        milestoneIds[1] = milestoneId2;

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = MILESTONE_AMT;
        amounts[1] = MILESTONE_AMT;

        vm.expectEmit(true, true, false, true);
        emit IdeaEscrow.MilestoneReserved(ideaId, milestoneId1, MILESTONE_AMT);
        vm.expectEmit(true, true, false, true);
        emit IdeaEscrow.MilestoneReserved(ideaId, milestoneId2, MILESTONE_AMT);

        vm.prank(poster);
        escrow.reserveMilestones(ideaId, milestoneIds, amounts);

        (uint256 available,) = escrow.getIdeaBalance(ideaId);
        assertEq(available, IDEA_BUDGET - (2 * MILESTONE_AMT));
        assertEq(uint256(escrow.getMilestoneStatus(milestoneId1)), uint256(IdeaEscrow.MilestoneStatus.Reserved));
        assertEq(uint256(escrow.getMilestoneStatus(milestoneId2)), uint256(IdeaEscrow.MilestoneStatus.Reserved));
    }

    function test_reserveMilestones_revert_lengthMismatch() public {
        _fund();

        bytes32[] memory milestoneIds = new bytes32[](2);
        milestoneIds[0] = milestoneId1;
        milestoneIds[1] = milestoneId2;

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = MILESTONE_AMT;

        vm.prank(poster);
        vm.expectRevert(IdeaEscrow.ArrayLengthMismatch.selector);
        escrow.reserveMilestones(ideaId, milestoneIds, amounts);
    }

    function test_reserveMilestones_revert_insufficientBalance() public {
        _fund();

        bytes32[] memory milestoneIds = new bytes32[](3);
        milestoneIds[0] = milestoneId1;
        milestoneIds[1] = milestoneId2;
        milestoneIds[2] = milestoneId3;

        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 400e6;
        amounts[1] = 400e6;
        amounts[2] = 400e6;

        vm.prank(poster);
        vm.expectRevert(abi.encodeWithSelector(IdeaEscrow.InsufficientBalance.selector, ideaId, 1200e6, IDEA_BUDGET));
        escrow.reserveMilestones(ideaId, milestoneIds, amounts);
    }

    function test_releaseMilestone_sendsTokens() public {
        _reserve();
        uint256 workerBefore = usdc.balanceOf(worker);

        vm.prank(poster);
        escrow.releaseMilestone(ideaId, milestoneId1, worker);

        assertEq(usdc.balanceOf(worker), workerBefore + MILESTONE_AMT);
    }

    function test_refundMilestone_restoresAvailable() public {
        _reserve();
        (uint256 availBefore,) = escrow.getIdeaBalance(ideaId);

        vm.prank(poster);
        escrow.refundMilestone(ideaId, milestoneId1, poster);

        (uint256 availAfter,) = escrow.getIdeaBalance(ideaId);
        assertEq(availAfter, availBefore + MILESTONE_AMT);
    }

    function test_fullLifecycle_fundBatchReserveReleaseAndRefund() public {
        _fund();

        bytes32[] memory milestoneIds = new bytes32[](2);
        milestoneIds[0] = milestoneId1;
        milestoneIds[1] = milestoneId2;

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = MILESTONE_AMT;
        amounts[1] = MILESTONE_AMT;

        vm.prank(poster);
        escrow.reserveMilestones(ideaId, milestoneIds, amounts);

        (uint256 availAfterReserve,) = escrow.getIdeaBalance(ideaId);
        assertEq(availAfterReserve, IDEA_BUDGET - (2 * MILESTONE_AMT));

        vm.prank(poster);
        escrow.releaseMilestone(ideaId, milestoneId1, worker);
        assertEq(usdc.balanceOf(worker), MILESTONE_AMT);
        assertEq(uint256(escrow.getMilestoneStatus(milestoneId1)), uint256(IdeaEscrow.MilestoneStatus.Released));

        vm.prank(poster);
        escrow.refundMilestone(ideaId, milestoneId2, poster);

        (uint256 availFinal,) = escrow.getIdeaBalance(ideaId);
        assertEq(availFinal, IDEA_BUDGET - MILESTONE_AMT);
    }
}
