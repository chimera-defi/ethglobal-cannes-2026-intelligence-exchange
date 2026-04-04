// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {AdvancedArcEscrow} from "../src/AdvancedArcEscrow.sol";
import {IdentityGate} from "../src/IdentityGate.sol";

contract MockArcUSDC {
    string public constant name = "Mock Arc USDC";
    string public constant symbol = "USDC";
    uint8 public constant decimals = 6;

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
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/// @title AdvancedArcEscrowTest
/// @notice Comprehensive test suite for Prize 1 judging criteria:
///         - Conditional escrow with dispute + automatic release
///         - Programmable payroll/vesting in USDC
///         - Advanced stablecoin logic
contract AdvancedArcEscrowTest is Test {
    AdvancedArcEscrow public escrow;
    IdentityGate public identityGate;
    MockArcUSDC internal mockUsdcImpl;
    
    // Mock USDC token (we'll simulate the real Arc USDC behavior)
    address public constant USDC = 0x3600000000000000000000000000000000000000;
    
    address public owner;
    address public platformWallet;
    address public disputeResolver;
    address public poster;
    address public worker;
    address public reviewer;
    address public attacker;
    
    bytes32 public constant POSTER_ROLE = keccak256("poster");
    bytes32 public constant WORKER_ROLE = keccak256("worker");
    bytes32 public constant REVIEWER_ROLE = keccak256("reviewer");
    
    bytes32 public ideaId;
    bytes32 public milestoneId;
    
    event IdeaFunded(bytes32 indexed ideaId, address indexed poster, uint256 amount, uint256 platformFeeReserved);
    event MilestoneReserved(bytes32 indexed ideaId, bytes32 indexed milestoneId, uint256 amount, uint256 vestingDuration, uint256 vestingCliff);
    event MilestoneSubmitted(bytes32 indexed milestoneId, address indexed worker, bytes32 submissionHash, uint256 submittedAt);
    event MilestoneUnderReview(bytes32 indexed milestoneId, address indexed reviewer, uint256 reviewDeadline);
    event MilestoneApproved(bytes32 indexed milestoneId, address indexed reviewer, bytes32 attestationHash, uint256 releaseAmount, uint256 platformFee);
    event MilestoneReleased(bytes32 indexed ideaId, bytes32 indexed milestoneId, address indexed worker, uint256 amount, uint256 vestedAmount, uint256 platformFee);
    event MilestoneAutoReleased(bytes32 indexed milestoneId, address indexed worker, uint256 amount, uint256 autoReleaseAt);
    event DisputeRaised(bytes32 indexed milestoneId, address indexed disputant, bytes32 reasonHash, uint256 raisedAt, uint256 resolutionDeadline);
    event DisputeResolved(bytes32 indexed milestoneId, address indexed resolver, AdvancedArcEscrow.DisputeResolution resolution, uint256 workerPayout, uint256 posterRefund);
    event PlatformFeeWithdrawn(address indexed to, uint256 amount);

    function setUp() public {
        owner = makeAddr("owner");
        platformWallet = makeAddr("platformWallet");
        disputeResolver = makeAddr("disputeResolver");
        poster = makeAddr("poster");
        worker = makeAddr("worker");
        reviewer = makeAddr("reviewer");
        attacker = makeAddr("attacker");
        
        vm.startPrank(owner);
        
        // Deploy IdentityGate
        identityGate = new IdentityGate(owner);
        
        // Deploy AdvancedArcEscrow
        escrow = new AdvancedArcEscrow(
            address(identityGate),
            platformWallet,
            disputeResolver
        );
        
        vm.stopPrank();
        
        // Setup roles in IdentityGate
        vm.startPrank(owner);
        identityGate.setVerified(poster, POSTER_ROLE, true);
        identityGate.setVerified(worker, WORKER_ROLE, true);
        identityGate.setVerified(reviewer, REVIEWER_ROLE, true);
        vm.stopPrank();
        
        // Setup test data
        ideaId = keccak256("test-idea-1");
        milestoneId = keccak256("test-milestone-1");

        // Install mock Arc USDC code at the fixed chain address used by the contract.
        mockUsdcImpl = new MockArcUSDC();
        vm.etch(USDC, address(mockUsdcImpl).code);

        // Fund test actors with mock USDC balances.
        MockArcUSDC(USDC).mint(poster, 10000e6); // 10,000 USDC
        MockArcUSDC(USDC).mint(worker, 100e6);
        MockArcUSDC(USDC).mint(reviewer, 100e6);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PRIZE 1 CRITERION 1: Conditional Escrow with USDC
    // ═══════════════════════════════════════════════════════════════════════

    function test_FundIdea_WithUSDC() public {
        uint256 fundAmount = 1000e6; // 1000 USDC
        uint256 expectedFee = (fundAmount * 1000) / 10000; // 10% = 100 USDC
        
        vm.startPrank(poster);
        
        // Approve escrow to spend USDC
        (bool success,) = USDC.call(abi.encodeWithSelector(
            bytes4(keccak256("approve(address,uint256)")),
            address(escrow),
            fundAmount
        ));
        require(success, "USDC approve failed");
        
        vm.expectEmit(true, true, false, true);
        emit IdeaFunded(ideaId, poster, fundAmount, expectedFee);
        
        escrow.fundIdea(ideaId, fundAmount);
        
        vm.stopPrank();
        
        // Verify balances
        (uint256 available, uint256 totalFunded, uint256 platformFees) = escrow.getIdeaBalance(ideaId);
        assertEq(totalFunded, fundAmount);
        assertEq(platformFees, expectedFee);
        assertEq(available, fundAmount - expectedFee);
    }

    function test_ConditionalEscrow_LockedUntilApproval() public {
        // Setup: Fund and reserve milestone
        _setupFundedAndReservedMilestone(1000e6, 0, 0, false);
        
        // Worker submits
        vm.prank(worker);
        escrow.submitMilestone(milestoneId, keccak256("submission"));
        
        // At this point, funds should be locked
        (uint256 available,,) = escrow.getIdeaBalance(ideaId);
        assertEq(available, 0, "Funds should be locked after submission");
        
        // Worker cannot withdraw
        vm.prank(worker);
        vm.expectRevert();
        escrow.releaseMilestone(milestoneId);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PRIZE 1 CRITERION 2: Programmable Vesting / Payroll
    // ═══════════════════════════════════════════════════════════════════════

    function test_ProgrammableVesting_Linear() public {
        uint256 milestoneAmount = 1000e6;
        uint256 vestingDuration = 30 days;
        uint256 vestingCliff = 7 days;
        
        _setupFundedAndReservedMilestone(milestoneAmount, vestingDuration, vestingCliff, true);
        _submitAndStartReview();
        
        // Approve after dispute window
        vm.warp(block.timestamp + 4 days);
        
        vm.prank(reviewer);
        escrow.approveMilestone(milestoneId, keccak256("attestation"));
        
        // Check initial releasable (should be 0 during cliff)
        uint256 releasable = escrow.getReleasableAmount(milestoneId);
        assertEq(releasable, 0, "Nothing should be releasable during cliff");
        
        // Warp past cliff
        vm.warp(block.timestamp + 7 days);
        
        releasable = escrow.getReleasableAmount(milestoneId);
        uint256 expectedReleasable = (milestoneAmount * 7 days) / vestingDuration; // 7/30 of amount
        assertApproxEqRel(releasable, expectedReleasable, 0.01e18);
        
        // Full vesting
        vm.warp(block.timestamp + 30 days);
        releasable = escrow.getReleasableAmount(milestoneId);
        assertEq(releasable, milestoneAmount, "Full amount should be releasable");
    }

    function test_ProgrammableVesting_MilestoneBased() public {
        uint256 milestoneAmount = 1000e6;
        uint256 vestingDuration = 90 days;
        uint256 vestingCliff = 30 days;
        
        _setupFundedAndReservedMilestone(milestoneAmount, vestingDuration, vestingCliff, false);
        _submitAndStartReview();
        
        vm.warp(block.timestamp + 4 days);
        
        vm.prank(reviewer);
        escrow.approveMilestone(milestoneId, keccak256("attestation"));
        
        uint256 approvalTime = block.timestamp;
        
        // Early in vesting - minimal or nothing releasable
        vm.warp(approvalTime + 15 days);
        uint256 earlyReleasable = escrow.getReleasableAmount(milestoneId);
        assertLt(earlyReleasable, milestoneAmount / 2, "Less than 50% early on");
        
        // After cliff - should have cliff amount (25%) plus some post-cliff vesting
        vm.warp(approvalTime + 45 days); // 15 days post-cliff
        uint256 midReleasable = escrow.getReleasableAmount(milestoneId);
        assertGt(midReleasable, milestoneAmount / 4, "At least 25% after cliff");
        assertLt(midReleasable, milestoneAmount, "Not fully vested yet");
        
        // Full vesting after duration
        vm.warp(approvalTime + 90 days + 1);
        uint256 fullReleasable = escrow.getReleasableAmount(milestoneId);
        assertEq(fullReleasable, milestoneAmount, "Full amount after duration");
    }

    function test_PartialVesting_Release() public {
        uint256 milestoneAmount = 1000e6;
        
        _setupFundedAndReservedMilestone(milestoneAmount, 30 days, 0, true);
        _submitStartReviewAndApprove();
        
        // Warp to 50% vesting
        vm.warp(block.timestamp + 15 days);
        
        uint256 workerBalanceBefore = IERC20(USDC).balanceOf(worker);
        
        vm.prank(worker);
        escrow.releaseMilestone(milestoneId);
        
        uint256 workerBalanceAfter = IERC20(USDC).balanceOf(worker);
        uint256 released = workerBalanceAfter - workerBalanceBefore;
        
        // Should have released ~50% minus 10% fee
        uint256 expectedGross = milestoneAmount / 2;
        uint256 expectedNet = (expectedGross * 9000) / 10000; // minus 10% fee
        
        assertApproxEqRel(released, expectedNet, 0.01e18);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PRIZE 1 CRITERION 3: Dispute Mechanism + Automatic Release
    // ═══════════════════════════════════════════════════════════════════════

    function test_Dispute_RaisedDuringWindow() public {
        _setupFundedAndReservedMilestone(1000e6, 0, 0, false);
        _submitAndStartReview();
        
        bytes32 reasonHash = keccak256("dispute reason");
        
        vm.prank(worker);
        vm.expectEmit(true, true, false, true);
        emit DisputeRaised(milestoneId, worker, reasonHash, block.timestamp, block.timestamp + 14 days);
        
        escrow.raiseDispute(milestoneId, reasonHash);
        
        AdvancedArcEscrow.MilestoneStatus status = escrow.getMilestoneStatus(milestoneId);
        assertEq(uint256(status), uint256(AdvancedArcEscrow.MilestoneStatus.Disputed));
    }

    function test_Dispute_CannotRaiseAfterWindow() public {
        _setupFundedAndReservedMilestone(1000e6, 0, 0, false);
        _submitAndStartReview();
        
        // Warp past dispute window (3 days)
        vm.warp(block.timestamp + 4 days);
        
        vm.prank(worker);
        vm.expectRevert(AdvancedArcEscrow.DisputeWindowExpired.selector);
        escrow.raiseDispute(milestoneId, keccak256("too late"));
    }

    function test_Dispute_ResolveWorkerWins() public {
        _setupFundedAndReservedMilestone(1000e6, 0, 0, false);
        _submitAndStartReview();
        
        vm.prank(poster);
        escrow.raiseDispute(milestoneId, keccak256("poster dispute"));
        
        uint256 workerBalanceBefore = IERC20(USDC).balanceOf(worker);
        
        vm.prank(disputeResolver);
        vm.expectEmit(true, true, false, true);
        emit DisputeResolved(milestoneId, disputeResolver, AdvancedArcEscrow.DisputeResolution.WorkerWins, 900e6, 0);
        
        escrow.resolveDispute(milestoneId, AdvancedArcEscrow.DisputeResolution.WorkerWins, 0);
        
        uint256 workerBalanceAfter = IERC20(USDC).balanceOf(worker);
        uint256 received = workerBalanceAfter - workerBalanceBefore;
        
        // Worker gets 1000 - 10% fee = 900 USDC
        assertEq(received, 900e6);
    }

    function test_Dispute_ResolvePosterWins() public {
        _setupFundedAndReservedMilestone(1000e6, 0, 0, false);
        _submitAndStartReview();
        
        vm.prank(worker);
        escrow.raiseDispute(milestoneId, keccak256("worker dispute"));
        
        uint256 posterAvailableBefore;
        (posterAvailableBefore,,) = escrow.getIdeaBalance(ideaId);
        
        vm.prank(disputeResolver);
        escrow.resolveDispute(milestoneId, AdvancedArcEscrow.DisputeResolution.PosterWins, 0);
        
        uint256 posterAvailableAfter;
        (posterAvailableAfter,,) = escrow.getIdeaBalance(ideaId);
        
        // Poster gets refund (minus platform fee still taken)
        assertEq(posterAvailableAfter - posterAvailableBefore, 900e6);
    }

    function test_Dispute_ResolveSplit() public {
        _setupFundedAndReservedMilestone(1000e6, 0, 0, false);
        _submitAndStartReview();
        
        vm.prank(worker);
        escrow.raiseDispute(milestoneId, keccak256("dispute"));
        
        uint256 workerBalanceBefore = IERC20(USDC).balanceOf(worker);
        uint256 posterAvailableBefore;
        (posterAvailableBefore,,) = escrow.getIdeaBalance(ideaId);
        
        // 60% to worker, 40% to poster
        vm.prank(disputeResolver);
        escrow.resolveDispute(milestoneId, AdvancedArcEscrow.DisputeResolution.Split, 6000);
        
        uint256 workerBalanceAfter = IERC20(USDC).balanceOf(worker);
        uint256 posterAvailableAfter;
        (posterAvailableAfter,,) = escrow.getIdeaBalance(ideaId);
        
        // Worker: 60% of 900 = 540, Poster: 40% of 900 = 360
        assertEq(workerBalanceAfter - workerBalanceBefore, 540e6);
        assertEq(posterAvailableAfter - posterAvailableBefore, 360e6);
    }

    function test_AutoRelease_AfterTimeout() public {
        _setupFundedAndReservedMilestone(1000e6, 0, 0, false);
        _submitAndStartReview();
        
        // Warp past review timeout (7 days)
        vm.warp(block.timestamp + 8 days);
        
        assertTrue(escrow.canAutoRelease(milestoneId));
        
        uint256 workerBalanceBefore = IERC20(USDC).balanceOf(worker);
        
        vm.prank(attacker); // Anyone can call autoRelease
        vm.expectEmit(true, true, false, true);
        emit MilestoneAutoReleased(milestoneId, worker, 900e6, block.timestamp);
        
        escrow.autoReleaseMilestone(milestoneId);
        
        uint256 workerBalanceAfter = IERC20(USDC).balanceOf(worker);
        // Worker gets full amount minus fee
        assertEq(workerBalanceAfter - workerBalanceBefore, 900e6);
    }

    function test_AutoResolve_DisputeTimeout() public {
        _setupFundedAndReservedMilestone(1000e6, 0, 0, false);
        _submitAndStartReview();
        
        vm.prank(worker);
        escrow.raiseDispute(milestoneId, keccak256("dispute"));
        
        // Warp past resolution timeout (14 days)
        vm.warp(block.timestamp + 15 days);
        
        assertTrue(escrow.canAutoResolve(milestoneId));
        
        uint256 workerBalanceBefore = IERC20(USDC).balanceOf(worker);
        
        // Anyone can trigger auto-resolve
        vm.prank(attacker);
        escrow.autoResolveDispute(milestoneId);
        
        // Should be 50/50 split
        uint256 workerBalanceAfter = IERC20(USDC).balanceOf(worker);
        // Worker gets 50% of 900 = 450
        assertEq(workerBalanceAfter - workerBalanceBefore, 450e6);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Platform Fee Tests
    // ═══════════════════════════════════════════════════════════════════════

    function test_PlatformFee_Withdrawal() public {
        // Setup and complete a milestone to generate fees
        _setupFundedAndReservedMilestone(1000e6, 0, 0, false);
        _submitStartReviewAndApprove();
        
        vm.warp(block.timestamp + 4 days);
        
        uint256 platformBalanceBefore = IERC20(USDC).balanceOf(platformWallet);
        uint256 workerBalanceBefore = IERC20(USDC).balanceOf(worker);
        
        vm.prank(worker);
        escrow.releaseMilestone(milestoneId);
        
        uint256 platformBalanceAfter = IERC20(USDC).balanceOf(platformWallet);
        uint256 workerBalanceAfter = IERC20(USDC).balanceOf(worker);
        
        // Platform gets 10% fee immediately on release
        assertEq(platformBalanceAfter - platformBalanceBefore, 100e6, "Platform gets 10% fee");
        assertEq(workerBalanceAfter - workerBalanceBefore, 900e6, "Worker gets 90%");
    }

    function test_PlatformFee_CorrectCalculation() public {
        uint256 amount = 1234e6; // Random amount
        uint256 expectedFee = (amount * 1000) / 10000; // 10%
        
        assertEq(escrow.getPlatformFee(amount), expectedFee);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Access Control Tests
    // ═══════════════════════════════════════════════════════════════════════

    function test_Unauthorized_CannotFund() public {
        // Attacker doesn't have poster role
        vm.prank(attacker);
        vm.expectRevert(AdvancedArcEscrow.Unauthorized.selector);
        escrow.fundIdea(ideaId, 1000e6);
    }

    function test_Unauthorized_CannotSubmit() public {
        _setupFundedAndReservedMilestone(1000e6, 0, 0, false);
        
        // Attacker doesn't have worker role
        vm.prank(attacker);
        vm.expectRevert(AdvancedArcEscrow.Unauthorized.selector);
        escrow.submitMilestone(milestoneId, keccak256("submission"));
    }

    function test_Unauthorized_CannotReview() public {
        _setupFundedAndReservedMilestone(1000e6, 0, 0, false);
        
        vm.prank(worker);
        escrow.submitMilestone(milestoneId, keccak256("submission"));
        
        // Attacker doesn't have reviewer role
        vm.prank(attacker);
        vm.expectRevert(AdvancedArcEscrow.Unauthorized.selector);
        escrow.startReview(milestoneId);
    }

    function test_Unauthorized_CannotApprove() public {
        _setupFundedAndReservedMilestone(1000e6, 0, 0, false);
        _submitAndStartReview();
        
        // Warp past dispute window
        vm.warp(block.timestamp + 4 days);
        
        // Different reviewer tries to approve
        address otherReviewer = makeAddr("otherReviewer");
        vm.prank(owner);
        identityGate.setVerified(otherReviewer, REVIEWER_ROLE, true);
        
        vm.prank(otherReviewer);
        vm.expectRevert(AdvancedArcEscrow.Unauthorized.selector);
        escrow.approveMilestone(milestoneId, keccak256("attestation"));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Edge Cases and Security Tests
    // ═══════════════════════════════════════════════════════════════════════

    function test_CannotDoubleRelease() public {
        _setupFundedAndReservedMilestone(1000e6, 0, 0, false);
        _submitStartReviewAndApprove();
        
        vm.warp(block.timestamp + 4 days);
        
        vm.prank(worker);
        escrow.releaseMilestone(milestoneId);
        
        // Try to release again - status is now Released (6), not Approved (5)
        vm.prank(worker);
        vm.expectRevert();
        escrow.releaseMilestone(milestoneId);
    }

    function test_CannotApproveDuringDisputeWindow() public {
        _setupFundedAndReservedMilestone(1000e6, 0, 0, false);
        _submitAndStartReview();
        
        // Try to approve immediately (during 3-day dispute window)
        vm.prank(reviewer);
        vm.expectRevert(AdvancedArcEscrow.DisputeWindowActive.selector);
        escrow.approveMilestone(milestoneId, keccak256("attestation"));
    }

    function test_CannotRaiseDisputeTwice() public {
        _setupFundedAndReservedMilestone(1000e6, 0, 0, false);
        _submitAndStartReview();
        
        vm.prank(worker);
        escrow.raiseDispute(milestoneId, keccak256("dispute 1"));
        
        // Status is now Disputed (4), not UnderReview (3)
        vm.prank(poster);
        vm.expectRevert();
        escrow.raiseDispute(milestoneId, keccak256("dispute 2"));
    }

    function test_CannotResolveNonexistentDispute() public {
        vm.prank(disputeResolver);
        vm.expectRevert(AdvancedArcEscrow.DisputeNotFound.selector);
        escrow.resolveDispute(milestoneId, AdvancedArcEscrow.DisputeResolution.WorkerWins, 0);
    }

    function test_Refund_BeforeSubmission() public {
        _setupFundedAndReservedMilestone(1000e6, 0, 0, false);
        
        uint256 availableBefore;
        (availableBefore,,) = escrow.getIdeaBalance(ideaId);
        
        vm.prank(poster);
        escrow.refundMilestone(milestoneId);
        
        uint256 availableAfter;
        (availableAfter,,) = escrow.getIdeaBalance(ideaId);
        
        assertEq(availableAfter - availableBefore, 1000e6);
        assertEq(uint256(escrow.getMilestoneStatus(milestoneId)), uint256(AdvancedArcEscrow.MilestoneStatus.Refunded));
    }

    function test_CannotRefund_AfterSubmission() public {
        _setupFundedAndReservedMilestone(1000e6, 0, 0, false);
        
        vm.prank(worker);
        escrow.submitMilestone(milestoneId, keccak256("submission"));
        
        vm.prank(poster);
        vm.expectRevert();
        escrow.refundMilestone(milestoneId);
    }

    function test_MultipleMilestones_BatchReserve() public {
        uint256 fundAmount = 5556e6; // 5000 + ~10% for fees
        
        vm.startPrank(poster);
        (bool success,) = USDC.call(abi.encodeWithSelector(
            bytes4(keccak256("approve(address,uint256)")),
            address(escrow),
            fundAmount
        ));
        require(success, "USDC approve failed");
        
        escrow.fundIdea(ideaId, fundAmount);
        
        bytes32[] memory milestoneIds = new bytes32[](3);
        milestoneIds[0] = keccak256("milestone-1");
        milestoneIds[1] = keccak256("milestone-2");
        milestoneIds[2] = keccak256("milestone-3");
        
        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 1000e6;
        amounts[1] = 1500e6;
        amounts[2] = 2000e6;
        
        uint256[] memory durations = new uint256[](3);
        durations[0] = 30 days;
        durations[1] = 60 days;
        durations[2] = 90 days;
        
        uint256[] memory cliffs = new uint256[](3);
        cliffs[0] = 7 days;
        cliffs[1] = 14 days;
        cliffs[2] = 30 days;
        
        bool[] memory linear = new bool[](3);
        linear[0] = true;
        linear[1] = true;
        linear[2] = false;
        
        escrow.reserveMilestones(ideaId, milestoneIds, amounts, durations, cliffs, linear);
        
        vm.stopPrank();
        
        // Verify all milestones reserved
        for (uint i = 0; i < 3; i++) {
            assertEq(uint256(escrow.getMilestoneStatus(milestoneIds[i])), uint256(AdvancedArcEscrow.MilestoneStatus.Reserved));
        }
        
        // Verify available balance reduced correctly (amounts sum = 4500)
        (uint256 available,,) = escrow.getIdeaBalance(ideaId);
        assertGt(available, 0); // Just verify there's some balance left
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Helper Functions
    // ═══════════════════════════════════════════════════════════════════════

    function _setupFundedAndReservedMilestone(
        uint256 amount,
        uint256 vestingDuration,
        uint256 vestingCliff,
        bool linear
    ) internal {
        uint256 fundAmount = (amount * 10000) / 9000; // Account for 10% fee
        
        vm.startPrank(poster);
        
        (bool success,) = USDC.call(abi.encodeWithSelector(
            bytes4(keccak256("approve(address,uint256)")),
            address(escrow),
            fundAmount
        ));
        require(success, "USDC approve failed");
        
        escrow.fundIdea(ideaId, fundAmount);
        
        escrow.reserveMilestone(
            ideaId,
            milestoneId,
            amount,
            vestingDuration,
            vestingCliff,
            linear
        );
        
        vm.stopPrank();
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

// Mock interface for USDC
interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}
