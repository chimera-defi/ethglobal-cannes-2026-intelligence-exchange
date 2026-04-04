// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AdvancedArcEscrow} from "../src/AdvancedArcEscrow.sol";
import {IdentityGate} from "../src/IdentityGate.sol";

contract AdvancedArcEscrowTest is Test {
    AdvancedArcEscrow public escrow;
    IdentityGate public identityGate;
    
    address public constant USDC = 0x3600000000000000000000000000000000000000;
    
    address public owner = makeAddr("owner");
    address public platformWallet = makeAddr("platformWallet");
    address public disputeResolver = makeAddr("disputeResolver");
    address public poster = makeAddr("poster");
    address public worker = makeAddr("worker");
    address public reviewer = makeAddr("reviewer");
    
    bytes32 public constant POSTER_ROLE = keccak256("poster");
    bytes32 public constant WORKER_ROLE = keccak256("worker");
    bytes32 public constant REVIEWER_ROLE = keccak256("reviewer");
    
    bytes32 public ideaId = keccak256("test-idea-1");
    bytes32 public milestoneId = keccak256("test-milestone-1");

    function setUp() public {
        // Deploy mock USDC at the expected address
        MockUSDC mockUsdc = new MockUSDC();
        vm.etch(USDC, address(mockUsdc).code);
        
        vm.startPrank(owner);
        identityGate = new IdentityGate(owner);
        escrow = new AdvancedArcEscrow(address(identityGate), platformWallet, disputeResolver);
        vm.stopPrank();
        
        vm.prank(owner);
        identityGate.setVerified(poster, POSTER_ROLE, true);
        vm.prank(owner);
        identityGate.setVerified(worker, WORKER_ROLE, true);
        vm.prank(owner);
        identityGate.setVerified(reviewer, REVIEWER_ROLE, true);
        
        // Mint USDC to test accounts
        MockUSDC(USDC).mint(poster, 10000e6);
        MockUSDC(USDC).mint(worker, 100e6);
        MockUSDC(USDC).mint(platformWallet, 0);
    }

    function test_FundIdea() public {
        uint256 fundAmount = 1000e6;
        
        vm.startPrank(poster);
        MockUSDC(USDC).approve(address(escrow), fundAmount);
        escrow.fundIdea(ideaId, fundAmount);
        vm.stopPrank();
        
        (uint256 available, uint256 totalFunded) = escrow.getIdeaBalance(ideaId);
        assertEq(totalFunded, fundAmount);
        assertEq(available, fundAmount);
    }

    function test_ReserveMilestone() public {
        _setupFundedIdea(1000e6);
        
        vm.prank(poster);
        escrow.reserveMilestone(ideaId, milestoneId, 1000e6, 0, 0, true);
        
        assertEq(uint256(escrow.getMilestoneStatus(milestoneId)), uint256(AdvancedArcEscrow.MilestoneStatus.Reserved));
    }

    function test_SubmitAndApprove() public {
        _setupFundedAndReservedMilestone(1000e6, 0, 0, true);
        
        vm.prank(worker);
        escrow.submitMilestone(milestoneId, keccak256("submission"));
        
        vm.prank(reviewer);
        escrow.startReview(milestoneId);
        
        vm.warp(block.timestamp + 4 days);
        
        vm.prank(reviewer);
        escrow.approveMilestone(milestoneId, keccak256("attestation"));
        
        assertEq(uint256(escrow.getMilestoneStatus(milestoneId)), uint256(AdvancedArcEscrow.MilestoneStatus.Approved));
    }

    function test_ReleaseWithPlatformFee() public {
        _setupFundedAndReservedMilestone(1000e6, 0, 0, true);
        _submitStartReviewAndApprove();
        
        vm.warp(block.timestamp + 4 days);
        
        uint256 platformBalanceBefore = MockUSDC(USDC).balanceOf(platformWallet);
        uint256 workerBalanceBefore = MockUSDC(USDC).balanceOf(worker);
        
        vm.prank(worker);
        escrow.releaseMilestone(milestoneId);
        
        uint256 platformBalanceAfter = MockUSDC(USDC).balanceOf(platformWallet);
        uint256 workerBalanceAfter = MockUSDC(USDC).balanceOf(worker);
        
        assertEq(platformBalanceAfter - platformBalanceBefore, 100e6, "Platform gets 10%");
        assertEq(workerBalanceAfter - workerBalanceBefore, 900e6, "Worker gets 90%");
    }

    function test_DisputeAndResolve() public {
        _setupFundedAndReservedMilestone(1000e6, 0, 0, true);
        _submitAndStartReview();
        
        vm.prank(worker);
        escrow.raiseDispute(milestoneId, keccak256("dispute"));
        
        uint256 workerBalanceBefore = MockUSDC(USDC).balanceOf(worker);
        uint256 posterBalanceBefore = MockUSDC(USDC).balanceOf(poster);
        
        vm.prank(disputeResolver);
        escrow.resolveDispute(milestoneId, AdvancedArcEscrow.DisputeResolution.Split, 6000);
        
        uint256 workerBalanceAfter = MockUSDC(USDC).balanceOf(worker);
        uint256 posterBalanceAfter = MockUSDC(USDC).balanceOf(poster);
        
        assertEq(workerBalanceAfter - workerBalanceBefore, 540e6, "Worker gets 60% of 90%");
        assertEq(posterBalanceAfter - posterBalanceBefore, 360e6, "Poster gets 40% of 90%");
    }

    function test_AutoRelease() public {
        _setupFundedAndReservedMilestone(1000e6, 0, 0, true);
        _submitAndStartReview();
        
        vm.warp(block.timestamp + 8 days);
        
        uint256 workerBalanceBefore = MockUSDC(USDC).balanceOf(worker);
        
        escrow.autoReleaseMilestone(milestoneId);
        
        uint256 workerBalanceAfter = MockUSDC(USDC).balanceOf(worker);
        assertEq(workerBalanceAfter - workerBalanceBefore, 900e6);
    }

    function test_Vesting() public {
        _setupFundedAndReservedMilestone(1000e6, 30 days, 7 days, true);
        _submitAndStartReview();
        
        vm.warp(block.timestamp + 4 days);
        
        vm.prank(reviewer);
        escrow.approveMilestone(milestoneId, keccak256("attestation"));
        
        uint256 approvalTime = block.timestamp;
        
        vm.warp(approvalTime + 15 days);
        assertEq(escrow.getReleasableAmount(milestoneId), 500e6, "50% after 15 days");
        
        vm.warp(approvalTime + 30 days + 1);
        assertEq(escrow.getReleasableAmount(milestoneId), 1000e6, "100% after vesting");
    }

    function test_CannotApproveDuringDisputeWindow() public {
        _setupFundedAndReservedMilestone(1000e6, 0, 0, true);
        _submitAndStartReview();
        
        vm.prank(reviewer);
        vm.expectRevert(AdvancedArcEscrow.DisputeWindowActive.selector);
        escrow.approveMilestone(milestoneId, keccak256("attestation"));
    }

    function test_RefundBeforeSubmission() public {
        _setupFundedAndReservedMilestone(1000e6, 0, 0, true);
        
        (uint256 availableBefore,) = escrow.getIdeaBalance(ideaId);
        
        vm.prank(poster);
        escrow.refundMilestone(milestoneId);
        
        (uint256 availableAfter,) = escrow.getIdeaBalance(ideaId);
        assertEq(availableAfter - availableBefore, 1000e6);
    }

    // Helpers
    function _setupFundedIdea(uint256 amount) internal {
        vm.startPrank(poster);
        MockUSDC(USDC).approve(address(escrow), amount);
        escrow.fundIdea(ideaId, amount);
        vm.stopPrank();
    }

    function _setupFundedAndReservedMilestone(uint256 amount, uint256 vestingDuration, uint256 vestingCliff, bool linear) internal {
        _setupFundedIdea(amount);
        vm.prank(poster);
        escrow.reserveMilestone(ideaId, milestoneId, amount, vestingDuration, vestingCliff, linear);
    }

    function _submitAndStartReview() internal {
        vm.prank(worker);
        escrow.submitMilestone(milestoneId, keccak256("submission"));
        vm.prank(reviewer);
        escrow.startReview(milestoneId);
    }

    function _submitStartReviewAndApprove() internal {
        _submitAndStartReview();
        vm.warp(block.timestamp + 4 days);
        vm.prank(reviewer);
        escrow.approveMilestone(milestoneId, keccak256("attestation"));
    }
}

contract MockUSDC {
    string public name = "USD Coin";
    string public symbol = "USDC";
    uint8 public decimals = 6;
    
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public totalSupply;
    
    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }
    
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
    
    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
    
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "Insufficient balance");
        require(allowance[from][msg.sender] >= amount, "Insufficient allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}
