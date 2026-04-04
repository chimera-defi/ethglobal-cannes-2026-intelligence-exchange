// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {IdentityGate} from "./IdentityGate.sol";

/// @title AdvancedArcEscrow
/// @notice Advanced USDC-native escrow with conditional release, disputes, automatic timeout,
///         programmable vesting, and platform fee splits. Designed for Arc testnet/mainnet.
/// @dev This contract implements Prize 1 criteria: conditional escrow with dispute + auto-release,
///      programmable payroll/vesting in USDC, and advanced stablecoin logic.
///
/// Key Features:
/// - Native USDC integration (Arc's gas token at 0x3600...0000)
/// - Multi-milestone programmable vesting with per-milestone schedules
/// - Conditional escrow: funds locked until reviewer approval + attestation
/// - On-chain dispute mechanism with challenge window and resolver
/// - Automatic release after dispute timeout (prevents indefinite locks)
/// - 10% platform fee split on every release
/// - Integration with IdentityGate for role verification
///
/// State Flow:
///   funded → reserved → submitted → underReview → (approved → released | disputed → resolved | timeout → autoReleased)
///          → refunded (if cancelled before submission)
contract AdvancedArcEscrow {
    // ─────────────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────────────
    
    error Unauthorized();
    error InvalidState(bytes32 milestoneId, MilestoneStatus current, MilestoneStatus required);
    error IdeaAlreadyFunded(bytes32 ideaId);
    error IdeaNotFunded(bytes32 ideaId);
    error InsufficientBalance(bytes32 ideaId, uint256 required, uint256 available);
    error MilestoneAlreadyExists(bytes32 milestoneId);
    error MilestoneNotFound(bytes32 milestoneId);
    error MilestoneAlreadySettled(bytes32 milestoneId);
    error ArrayLengthMismatch();
    error ZeroAmount();
    error TransferFailed();
    error DisputeWindowActive();
    error DisputeWindowExpired();
    error DisputeAlreadyRaised();
    error DisputeNotFound();
    error InvalidDisputeResolution();
    error TimeoutNotReached();
    error InvalidVestingSchedule();
    error VestingPeriodTooShort();
    error VestingAlreadyCompleted();
    error InvalidReviewer();
    error PlatformFeeTransferFailed();

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────
    
    event IdeaFunded(bytes32 indexed ideaId, address indexed poster, uint256 amount);
    event MilestoneReserved(bytes32 indexed ideaId, bytes32 indexed milestoneId, uint256 amount, uint256 vestingDuration, uint256 vestingCliff);
    event MilestoneSubmitted(bytes32 indexed milestoneId, address indexed worker, bytes32 submissionHash, uint256 submittedAt);
    event MilestoneUnderReview(bytes32 indexed milestoneId, address indexed reviewer, uint256 reviewDeadline);
    event MilestoneApproved(bytes32 indexed milestoneId, address indexed reviewer, bytes32 attestationHash);
    event MilestoneReleased(bytes32 indexed ideaId, bytes32 indexed milestoneId, address indexed worker, uint256 workerAmount, uint256 platformFee);
    event MilestoneAutoReleased(bytes32 indexed milestoneId, address indexed worker, uint256 workerAmount, uint256 platformFee, uint256 autoReleaseAt);
    event MilestoneRefunded(bytes32 indexed ideaId, bytes32 indexed milestoneId, address indexed poster, uint256 amount);
    event DisputeRaised(bytes32 indexed milestoneId, address indexed disputant, bytes32 reasonHash, uint256 raisedAt, uint256 resolutionDeadline);
    event DisputeResolved(bytes32 indexed milestoneId, address indexed resolver, uint8 resolution, uint256 workerPayout, uint256 posterRefund);
    event DisputeResolverSet(address indexed resolver);
    event ReviewTimeoutSet(uint256 newTimeout);
    event DisputeWindowSet(uint256 newWindow);

    // ─────────────────────────────────────────────────────────────────────────
    // Enums
    // ─────────────────────────────────────────────────────────────────────────
    
    enum MilestoneStatus { None, Reserved, Submitted, UnderReview, Disputed, Approved, Released, AutoReleased, Refunded }
    enum DisputeResolution { None, WorkerWins, PosterWins, Split }

    // ─────────────────────────────────────────────────────────────────────────
    // Structs
    // ─────────────────────────────────────────────────────────────────────────
    
    struct IdeaFund {
        address poster;
        uint256 totalFunded;
        uint256 available;
        bool exists;
        uint256 fundedAt;
    }

    struct VestingSchedule {
        uint256 duration;
        uint256 cliff;
        uint256 startTime;
        bool linear;
    }

    struct MilestoneFund {
        bytes32 ideaId;
        uint256 amount;
        MilestoneStatus status;
        address worker;
        address reviewer;
        uint256 submittedAt;
        uint256 reviewStartedAt;
        uint256 approvedAt;
        bytes32 submissionHash;
        bytes32 attestationHash;
        VestingSchedule vesting;
        uint256 releasedAmount;
    }

    struct Dispute {
        bytes32 milestoneId;
        address disputant;
        bytes32 reasonHash;
        uint256 raisedAt;
        uint256 resolutionDeadline;
        DisputeResolution resolution;
        bool resolved;
        address resolver;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Constants & Config
    // ─────────────────────────────────────────────────────────────────────────
    
    address public constant USDC = 0x3600000000000000000000000000000000000000;
    uint256 public constant PLATFORM_FEE_BPS = 1000; // 10%
    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public constant MIN_VESTING_DURATION = 1 days;
    
    uint256 public reviewTimeout = 7 days;
    uint256 public disputeWindow = 3 days;
    uint256 public disputeResolutionTimeout = 14 days;

    // ─────────────────────────────────────────────────────────────────────────
    // State Variables
    // ─────────────────────────────────────────────────────────────────────────
    
    IdentityGate public immutable identityGate;
    address public owner;
    address public platformWallet;
    address public disputeResolver;
    
    mapping(bytes32 ideaId => IdeaFund) public ideas;
    mapping(bytes32 milestoneId => MilestoneFund) public milestones;
    mapping(bytes32 milestoneId => Dispute) public disputes;
    mapping(bytes32 milestoneId => bytes32) public milestoneToIdea;
    
    uint256 public totalEscrowed;

    // ─────────────────────────────────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────────────────────────────────
    
    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyResolver() {
        if (msg.sender != disputeResolver && msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyReviewer(bytes32 milestoneId) {
        if (msg.sender != milestones[milestoneId].reviewer) revert Unauthorized();
        _;
    }

    modifier onlyPoster(bytes32 ideaId) {
        if (msg.sender != ideas[ideaId].poster) revert Unauthorized();
        _;
    }

    modifier onlyVerifiedPoster() {
        if (!identityGate.isVerified(msg.sender, keccak256("poster"))) revert Unauthorized();
        _;
    }

    modifier onlyVerifiedWorker() {
        if (!identityGate.isVerified(msg.sender, keccak256("worker"))) revert Unauthorized();
        _;
    }

    modifier onlyVerifiedReviewer() {
        if (!identityGate.isVerified(msg.sender, keccak256("reviewer"))) revert Unauthorized();
        _;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────
    
    constructor(address _identityGate, address _platformWallet, address _disputeResolver) {
        identityGate = IdentityGate(_identityGate);
        platformWallet = _platformWallet;
        disputeResolver = _disputeResolver;
        owner = msg.sender;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Core Funding Functions
    // ─────────────────────────────────────────────────────────────────────────
    
    function fundIdea(bytes32 ideaId, uint256 amount) external onlyVerifiedPoster {
        if (amount == 0) revert ZeroAmount();
        if (ideas[ideaId].exists) revert IdeaAlreadyFunded(ideaId);

        bool ok = IERC20(USDC).transferFrom(msg.sender, address(this), amount);
        if (!ok) revert TransferFailed();

        ideas[ideaId] = IdeaFund({
            poster: msg.sender,
            totalFunded: amount,
            available: amount,
            exists: true,
            fundedAt: block.timestamp
        });

        totalEscrowed += amount;
        emit IdeaFunded(ideaId, msg.sender, amount);
    }

    function reserveMilestone(bytes32 ideaId, bytes32 milestoneId, uint256 amount, uint256 vestingDuration, uint256 vestingCliff, bool linearVesting) external onlyPoster(ideaId) {
        IdeaFund storage fund = ideas[ideaId];
        if (!fund.exists) revert IdeaNotFunded(ideaId);
        if (amount == 0) revert ZeroAmount();
        if (fund.available < amount) revert InsufficientBalance(ideaId, amount, fund.available);
        if (milestones[milestoneId].status != MilestoneStatus.None) revert MilestoneAlreadyExists(milestoneId);
        if (vestingDuration > 0 && vestingDuration < MIN_VESTING_DURATION) revert VestingPeriodTooShort();
        if (vestingCliff > vestingDuration) revert InvalidVestingSchedule();

        fund.available -= amount;
        
        milestones[milestoneId] = MilestoneFund({
            ideaId: ideaId,
            amount: amount,
            status: MilestoneStatus.Reserved,
            worker: address(0),
            reviewer: address(0),
            submittedAt: 0,
            reviewStartedAt: 0,
            approvedAt: 0,
            submissionHash: bytes32(0),
            attestationHash: bytes32(0),
            vesting: VestingSchedule({duration: vestingDuration, cliff: vestingCliff, startTime: 0, linear: linearVesting}),
            releasedAmount: 0
        });
        
        milestoneToIdea[milestoneId] = ideaId;
        emit MilestoneReserved(ideaId, milestoneId, amount, vestingDuration, vestingCliff);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Worker Submission
    // ─────────────────────────────────────────────────────────────────────────
    
    function submitMilestone(bytes32 milestoneId, bytes32 submissionHash) external onlyVerifiedWorker {
        MilestoneFund storage m = milestones[milestoneId];
        if (m.status != MilestoneStatus.Reserved) revert InvalidState(milestoneId, m.status, MilestoneStatus.Reserved);

        m.worker = msg.sender;
        m.submissionHash = submissionHash;
        m.submittedAt = block.timestamp;
        m.status = MilestoneStatus.Submitted;

        emit MilestoneSubmitted(milestoneId, msg.sender, submissionHash, block.timestamp);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Reviewer Flow
    // ─────────────────────────────────────────────────────────────────────────
    
    function startReview(bytes32 milestoneId) external onlyVerifiedReviewer {
        MilestoneFund storage m = milestones[milestoneId];
        if (m.status != MilestoneStatus.Submitted) revert InvalidState(milestoneId, m.status, MilestoneStatus.Submitted);

        m.reviewer = msg.sender;
        m.reviewStartedAt = block.timestamp;
        m.status = MilestoneStatus.UnderReview;

        emit MilestoneUnderReview(milestoneId, msg.sender, block.timestamp + disputeWindow);
    }

    function approveMilestone(bytes32 milestoneId, bytes32 attestationHash) external onlyReviewer(milestoneId) {
        MilestoneFund storage m = milestones[milestoneId];
        if (m.status != MilestoneStatus.UnderReview) revert InvalidState(milestoneId, m.status, MilestoneStatus.UnderReview);
        if (block.timestamp < m.reviewStartedAt + disputeWindow) revert DisputeWindowActive();

        m.attestationHash = attestationHash;
        m.approvedAt = block.timestamp;
        m.vesting.startTime = block.timestamp;
        m.status = MilestoneStatus.Approved;

        emit MilestoneApproved(milestoneId, msg.sender, attestationHash);
    }

    function releaseMilestone(bytes32 milestoneId) external {
        _releaseMilestone(milestoneId);
    }

    function _releaseMilestone(bytes32 milestoneId) internal {
        MilestoneFund storage m = milestones[milestoneId];
        if (m.status != MilestoneStatus.Approved) revert InvalidState(milestoneId, m.status, MilestoneStatus.Approved);

        uint256 releasable = _calculateReleasable(milestoneId);
        if (releasable == 0) revert VestingAlreadyCompleted();

        uint256 alreadyReleased = m.releasedAmount;
        uint256 toRelease = releasable - alreadyReleased;
        if (toRelease == 0) revert VestingAlreadyCompleted();

        m.releasedAmount = releasable;

        uint256 platformFee = (toRelease * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
        uint256 workerAmount = toRelease - platformFee;

        if (releasable >= m.amount) m.status = MilestoneStatus.Released;

        if (platformFee > 0) {
            bool feeOk = IERC20(USDC).transfer(platformWallet, platformFee);
            if (!feeOk) revert PlatformFeeTransferFailed();
        }

        bool ok = IERC20(USDC).transfer(m.worker, workerAmount);
        if (!ok) revert TransferFailed();

        emit MilestoneReleased(m.ideaId, milestoneId, m.worker, workerAmount, platformFee);
    }

    function autoReleaseMilestone(bytes32 milestoneId) external {
        MilestoneFund storage m = milestones[milestoneId];
        
        if (m.status == MilestoneStatus.UnderReview) {
            if (block.timestamp < m.reviewStartedAt + reviewTimeout) revert TimeoutNotReached();
            
            m.approvedAt = block.timestamp;
            m.status = MilestoneStatus.AutoReleased;
            
            uint256 platformFee = (m.amount * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
            uint256 workerAmount = m.amount - platformFee;

            if (platformFee > 0) {
                bool feeOk = IERC20(USDC).transfer(platformWallet, platformFee);
                if (!feeOk) revert PlatformFeeTransferFailed();
            }

            bool ok = IERC20(USDC).transfer(m.worker, workerAmount);
            if (!ok) revert TransferFailed();

            emit MilestoneAutoReleased(milestoneId, m.worker, workerAmount, platformFee, block.timestamp);
        } else if (m.status == MilestoneStatus.Approved) {
            _releaseMilestone(milestoneId);
        } else {
            revert InvalidState(milestoneId, m.status, MilestoneStatus.UnderReview);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Dispute Mechanism
    // ─────────────────────────────────────────────────────────────────────────
    
    function raiseDispute(bytes32 milestoneId, bytes32 reasonHash) external {
        MilestoneFund storage m = milestones[milestoneId];
        
        bool isStakeholder = (msg.sender == m.worker || msg.sender == ideas[m.ideaId].poster || msg.sender == m.reviewer);
        if (!isStakeholder) revert Unauthorized();
        
        if (m.status != MilestoneStatus.UnderReview) revert InvalidState(milestoneId, m.status, MilestoneStatus.UnderReview);
        if (block.timestamp >= m.reviewStartedAt + disputeWindow) revert DisputeWindowExpired();
        if (disputes[milestoneId].raisedAt != 0) revert DisputeAlreadyRaised();

        disputes[milestoneId] = Dispute({
            milestoneId: milestoneId,
            disputant: msg.sender,
            reasonHash: reasonHash,
            raisedAt: block.timestamp,
            resolutionDeadline: block.timestamp + disputeResolutionTimeout,
            resolution: DisputeResolution.None,
            resolved: false,
            resolver: address(0)
        });

        m.status = MilestoneStatus.Disputed;
        emit DisputeRaised(milestoneId, msg.sender, reasonHash, block.timestamp, block.timestamp + disputeResolutionTimeout);
    }

    function resolveDispute(bytes32 milestoneId, DisputeResolution resolution, uint256 workerPayoutBps) external onlyResolver {
        _resolveDispute(milestoneId, resolution, workerPayoutBps, msg.sender);
    }

    function _resolveDispute(bytes32 milestoneId, DisputeResolution resolution, uint256 workerPayoutBps, address resolver) internal {
        Dispute storage d = disputes[milestoneId];
        if (d.raisedAt == 0) revert DisputeNotFound();
        if (d.resolved) revert InvalidDisputeResolution();
        if (resolution == DisputeResolution.None) revert InvalidDisputeResolution();

        MilestoneFund storage m = milestones[milestoneId];
        IdeaFund storage fund = ideas[m.ideaId];

        d.resolution = resolution;
        d.resolved = true;
        d.resolver = resolver;

        uint256 platformFee = (m.amount * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;

        if (platformFee > 0) {
            bool feeOk = IERC20(USDC).transfer(platformWallet, platformFee);
            if (!feeOk) revert PlatformFeeTransferFailed();
        }

        if (resolution == DisputeResolution.WorkerWins) {
            uint256 workerAmount = m.amount - platformFee;
            m.status = MilestoneStatus.Released;
            
            bool ok = IERC20(USDC).transfer(m.worker, workerAmount);
            if (!ok) revert TransferFailed();
            
            emit DisputeResolved(milestoneId, resolver, uint8(resolution), workerAmount, 0);
        } else if (resolution == DisputeResolution.PosterWins) {
            uint256 posterRefund = m.amount - platformFee;
            m.status = MilestoneStatus.Refunded;
            
            bool ok = IERC20(USDC).transfer(fund.poster, posterRefund);
            if (!ok) revert TransferFailed();
            
            emit DisputeResolved(milestoneId, resolver, uint8(resolution), 0, posterRefund);
        } else if (resolution == DisputeResolution.Split) {
            if (workerPayoutBps > BPS_DENOMINATOR) revert InvalidDisputeResolution();
            
            uint256 remaining = m.amount - platformFee;
            uint256 workerShare = (remaining * workerPayoutBps) / BPS_DENOMINATOR;
            uint256 posterShare = remaining - workerShare;
            
            m.status = MilestoneStatus.Released;
            
            bool ok1 = IERC20(USDC).transfer(m.worker, workerShare);
            if (!ok1) revert TransferFailed();
            
            bool ok2 = IERC20(USDC).transfer(fund.poster, posterShare);
            if (!ok2) revert TransferFailed();
            
            emit DisputeResolved(milestoneId, resolver, uint8(resolution), workerShare, posterShare);
        }
    }

    function autoResolveDispute(bytes32 milestoneId) external {
        Dispute storage d = disputes[milestoneId];
        if (d.raisedAt == 0) revert DisputeNotFound();
        if (d.resolved) revert InvalidDisputeResolution();
        if (block.timestamp < d.resolutionDeadline) revert TimeoutNotReached();

        _resolveDispute(milestoneId, DisputeResolution.Split, 5000, msg.sender);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Refund & Cancellation
    // ─────────────────────────────────────────────────────────────────────────
    
    function refundMilestone(bytes32 milestoneId) external {
        bytes32 ideaId = milestoneToIdea[milestoneId];
        MilestoneFund storage m = milestones[milestoneId];
        IdeaFund storage fund = ideas[ideaId];
        
        if (msg.sender != fund.poster && msg.sender != owner) revert Unauthorized();
        
        if (m.status != MilestoneStatus.Reserved) revert InvalidState(milestoneId, m.status, MilestoneStatus.Reserved);

        uint256 amount = m.amount;
        m.status = MilestoneStatus.Refunded;
        fund.available += amount;

        emit MilestoneRefunded(ideaId, milestoneId, fund.poster, amount);
    }

    function withdrawAvailable(bytes32 ideaId, uint256 amount) external onlyPoster(ideaId) {
        IdeaFund storage fund = ideas[ideaId];
        if (fund.available < amount) revert InsufficientBalance(ideaId, amount, fund.available);

        fund.available -= amount;
        totalEscrowed -= amount;

        bool ok = IERC20(USDC).transfer(fund.poster, amount);
        if (!ok) revert TransferFailed();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Vesting Calculation
    // ─────────────────────────────────────────────────────────────────────────
    
    function _calculateReleasable(bytes32 milestoneId) internal view returns (uint256) {
        MilestoneFund storage m = milestones[milestoneId];
        VestingSchedule storage v = m.vesting;
        
        if (v.startTime == 0) return 0;
        if (v.duration == 0) return m.amount;
        
        uint256 elapsed = block.timestamp - v.startTime;
        if (elapsed < v.cliff) return m.releasedAmount;
        if (elapsed >= v.duration) return m.amount;
        
        if (v.linear) {
            return (m.amount * elapsed) / v.duration;
        } else {
            uint256 postCliff = elapsed - v.cliff;
            uint256 postCliffDuration = v.duration - v.cliff;
            if (postCliffDuration == 0) return m.amount;
            
            uint256 cliffRelease = m.amount / 4;
            uint256 remaining = m.amount - cliffRelease;
            uint256 postCliffVested = (remaining * postCliff) / postCliffDuration;
            return cliffRelease + postCliffVested;
        }
    }

    function getReleasableAmount(bytes32 milestoneId) external view returns (uint256) {
        MilestoneFund storage m = milestones[milestoneId];
        uint256 totalReleasable = _calculateReleasable(milestoneId);
        if (totalReleasable <= m.releasedAmount) return 0;
        return totalReleasable - m.releasedAmount;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin Functions
    // ─────────────────────────────────────────────────────────────────────────
    
    function setPlatformWallet(address _platformWallet) external onlyOwner {
        platformWallet = _platformWallet;
    }

    function setDisputeResolver(address _disputeResolver) external onlyOwner {
        disputeResolver = _disputeResolver;
        emit DisputeResolverSet(_disputeResolver);
    }

    function setReviewTimeout(uint256 _reviewTimeout) external onlyOwner {
        reviewTimeout = _reviewTimeout;
        emit ReviewTimeoutSet(_reviewTimeout);
    }

    function setDisputeWindow(uint256 _disputeWindow) external onlyOwner {
        disputeWindow = _disputeWindow;
        emit DisputeWindowSet(_disputeWindow);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // View Functions
    // ─────────────────────────────────────────────────────────────────────────
    
    function getIdeaBalance(bytes32 ideaId) external view returns (uint256 available, uint256 totalFunded) {
        IdeaFund storage fund = ideas[ideaId];
        return (fund.available, fund.totalFunded);
    }

    function getMilestoneStatus(bytes32 milestoneId) external view returns (MilestoneStatus) {
        return milestones[milestoneId].status;
    }

    function getPlatformFee(uint256 amount) external pure returns (uint256) {
        return (amount * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
    }

    function canAutoRelease(bytes32 milestoneId) external view returns (bool) {
        MilestoneFund storage m = milestones[milestoneId];
        if (m.status == MilestoneStatus.UnderReview) {
            return block.timestamp >= m.reviewStartedAt + reviewTimeout;
        }
        if (m.status == MilestoneStatus.Approved) {
            uint256 releasable = _calculateReleasable(milestoneId);
            return releasable > m.releasedAmount;
        }
        return false;
    }

    function canAutoResolve(bytes32 milestoneId) external view returns (bool) {
        Dispute storage d = disputes[milestoneId];
        if (d.raisedAt == 0 || d.resolved) return false;
        return block.timestamp >= d.resolutionDeadline;
    }

    receive() external payable {
        revert("Use fundIdea() for USDC deposits");
    }
}
