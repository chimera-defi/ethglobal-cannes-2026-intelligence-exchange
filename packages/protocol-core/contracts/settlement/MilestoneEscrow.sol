// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {IAuthorization} from "../identity/IAuthorization.sol";

/// @title MilestoneEscrow
/// @notice Token-agnostic milestone escrow with conditional release, disputes,
///         automatic timeout, programmable vesting, and platform fee splits.
///         Designed to be the canonical settlement primitive across all products.
///
/// State Flow:
///   funded → reserved → submitted → underReview → (approved → released | disputed → resolved | timeout → autoReleased)
///          → refunded (if cancelled before submission)
contract MilestoneEscrow {
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
    error AttestationInvalid();
    error PlatformFeeTransferFailed();
    error CrossChainNotSupported();
    error InvalidDestinationChain();

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event IdeaFunded(bytes32 indexed ideaId, address indexed poster, address token, uint256 amount);
    event MilestoneReserved(
        bytes32 indexed ideaId,
        bytes32 indexed milestoneId,
        uint256 amount,
        uint256 vestingDuration,
        uint256 vestingCliff
    );
    event MilestoneSubmitted(
        bytes32 indexed milestoneId,
        address indexed worker,
        bytes32 submissionHash,
        uint256 submittedAt
    );
    event MilestoneUnderReview(
        bytes32 indexed milestoneId,
        address indexed reviewer,
        uint256 reviewDeadline
    );
    event MilestoneApproved(
        bytes32 indexed milestoneId,
        address indexed reviewer,
        bytes32 attestationHash,
        uint256 releaseAmount,
        uint256 platformFee
    );
    event MilestoneReleased(
        bytes32 indexed ideaId,
        bytes32 indexed milestoneId,
        address indexed worker,
        uint256 amount,
        uint256 vestedAmount,
        uint256 platformFee
    );
    event MilestoneAutoReleased(
        bytes32 indexed milestoneId,
        address indexed worker,
        uint256 amount,
        uint256 autoReleaseAt
    );
    event MilestoneRefunded(
        bytes32 indexed ideaId,
        bytes32 indexed milestoneId,
        address indexed poster,
        uint256 amount
    );
    event DisputeRaised(
        bytes32 indexed milestoneId,
        address indexed disputant,
        bytes32 reasonHash,
        uint256 raisedAt,
        uint256 resolutionDeadline
    );
    event DisputeResolved(
        bytes32 indexed milestoneId,
        address indexed resolver,
        uint8 resolution,
        uint256 workerPayout,
        uint256 posterRefund
    );
    event DisputeResolverSet(address indexed resolver);
    event ReviewTimeoutSet(uint256 newTimeout);
    event DisputeWindowSet(uint256 newWindow);
    event PlatformFeeRateSet(uint256 newRate);
    event TokenUpdated(address indexed newToken);

    // ─────────────────────────────────────────────────────────────────────────
    // Enums
    // ─────────────────────────────────────────────────────────────────────────

    enum MilestoneStatus {
        None,
        Reserved,      // Funds locked, waiting for worker submission
        Submitted,     // Worker submitted, waiting for review
        UnderReview,   // Reviewer assigned, in challenge window
        Disputed,      // Dispute raised, awaiting resolution
        Approved,      // Reviewer approved, ready for release
        Released,      // Funds released to worker (minus fee)
        AutoReleased,  // Auto-released after timeout
        Refunded       // Funds returned to poster
    }

    enum DisputeResolution {
        None,
        WorkerWins,    // Full payout to worker
        PosterWins,    // Full refund to poster
        Split          // Proportional split
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Structs
    // ─────────────────────────────────────────────────────────────────────────

    struct IdeaFund {
        address poster;
        address token;              // ERC-20 token used for this idea
        uint256 totalFunded;        // Total tokens deposited
        uint256 available;          // Available for reservation
        uint256 platformFeesReserved; // Portion reserved for platform
        bool exists;
        uint256 fundedAt;
    }

    struct VestingSchedule {
        uint256 duration;           // Total vesting duration in seconds
        uint256 cliff;              // Cliff duration in seconds
        uint256 startTime;          // When vesting starts (usually approval time)
        bool linear;                // true = linear, false = milestone-based
    }

    struct MilestoneFund {
        bytes32 ideaId;
        uint256 amount;             // Total milestone amount
        MilestoneStatus status;
        address worker;             // Assigned worker (zero if unclaimed)
        address reviewer;           // Assigned reviewer
        uint256 submittedAt;        // When worker submitted
        uint256 reviewStartedAt;    // When reviewer started review
        uint256 approvedAt;         // When reviewer approved
        bytes32 submissionHash;     // Hash of submission data (off-chain)
        bytes32 attestationHash;    // Reviewer's signed attestation
        VestingSchedule vesting;    // Programmable vesting config
        uint256 releasedAmount;     // Amount already released (for partials)
    }

    struct Dispute {
        bytes32 milestoneId;
        address disputant;          // Who raised the dispute
        bytes32 reasonHash;         // IPFS hash or document reference
        uint256 raisedAt;
        uint256 resolutionDeadline; // When auto-resolve kicks in
        DisputeResolution resolution;
        bool resolved;
        address resolver;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Constants & Config
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Platform fee rate in basis points (1000 = 10%)
    uint256 public constant PLATFORM_FEE_BPS = 1000;
    uint256 public constant BPS_DENOMINATOR = 10000;

    /// @notice Minimum vesting period (1 day)
    uint256 public constant MIN_VESTING_DURATION = 1 days;

    /// @notice Default review timeout (7 days)
    uint256 public reviewTimeout = 7 days;

    /// @notice Default dispute window (3 days after submission)
    uint256 public disputeWindow = 3 days;

    /// @notice Default dispute resolution timeout (14 days)
    uint256 public disputeResolutionTimeout = 14 days;

    // ─────────────────────────────────────────────────────────────────────────
    // State Variables
    // ─────────────────────────────────────────────────────────────────────────

    IAuthorization public immutable authorization;
    address public owner;
    address public platformWallet;      // Receives platform fees
    address public disputeResolver;     // Can resolve disputes
    address public defaultToken;        // Default settlement token (e.g., INTEL)

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
        if (!authorization.isAuthorized(msg.sender, keccak256("poster"))) revert Unauthorized();
        _;
    }

    modifier onlyVerifiedWorker() {
        if (!authorization.isAuthorized(msg.sender, keccak256("worker"))) revert Unauthorized();
        _;
    }

    modifier onlyVerifiedReviewer() {
        if (!authorization.isAuthorized(msg.sender, keccak256("reviewer"))) revert Unauthorized();
        _;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    constructor(
        address _authorization,
        address _platformWallet,
        address _disputeResolver,
        address _defaultToken
    ) {
        authorization = IAuthorization(_authorization);
        platformWallet = _platformWallet;
        disputeResolver = _disputeResolver;
        defaultToken = _defaultToken;
        owner = msg.sender;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Core Funding Functions
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Fund an idea with a specific ERC-20 token, creating an escrow fund.
    /// @param ideaId Unique identifier for the idea
    /// @param token ERC-20 token address to use for this idea
    /// @param amount Total token amount to escrow
    function fundIdea(bytes32 ideaId, address token, uint256 amount) external onlyVerifiedPoster {
        if (amount == 0) revert ZeroAmount();
        if (ideas[ideaId].exists) revert IdeaAlreadyFunded(ideaId);

        bool ok = IERC20(token).transferFrom(msg.sender, address(this), amount);
        if (!ok) revert TransferFailed();

        ideas[ideaId] = IdeaFund({
            poster: msg.sender,
            token: token,
            totalFunded: amount,
            available: amount,
            platformFeesReserved: 0,
            exists: true,
            fundedAt: block.timestamp
        });

        totalEscrowed += amount;

        emit IdeaFunded(ideaId, msg.sender, token, amount);
    }

    /// @notice Fund an idea with the default settlement token (convenience overload).
    function fundIdea(bytes32 ideaId, uint256 amount) external onlyVerifiedPoster {
        fundIdea(ideaId, defaultToken, amount);
    }

    /// @notice Reserve funds for a milestone with programmable vesting.
    function reserveMilestone(
        bytes32 ideaId,
        bytes32 milestoneId,
        uint256 amount,
        uint256 vestingDuration,
        uint256 vestingCliff,
        bool linearVesting
    ) external onlyPoster(ideaId) {
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
            vesting: VestingSchedule({
                duration: vestingDuration,
                cliff: vestingCliff,
                startTime: 0,
                linear: linearVesting
            }),
            releasedAmount: 0
        });

        milestoneToIdea[milestoneId] = ideaId;

        emit MilestoneReserved(ideaId, milestoneId, amount, vestingDuration, vestingCliff);
    }

    /// @notice Batch reserve multiple milestones.
    function reserveMilestones(
        bytes32 ideaId,
        bytes32[] calldata milestoneIds,
        uint256[] calldata amounts,
        uint256[] calldata vestingDurations,
        uint256[] calldata vestingCliffs,
        bool[] calldata linearVestings
    ) external onlyPoster(ideaId) {
        if (
            milestoneIds.length != amounts.length ||
            milestoneIds.length != vestingDurations.length ||
            milestoneIds.length != vestingCliffs.length ||
            milestoneIds.length != linearVestings.length
        ) revert ArrayLengthMismatch();

        uint256 totalRequired = 0;
        for (uint256 i = 0; i < milestoneIds.length; i++) {
            totalRequired += amounts[i];
        }

        IdeaFund storage fund = ideas[ideaId];
        if (fund.available < totalRequired) {
            revert InsufficientBalance(ideaId, totalRequired, fund.available);
        }

        fund.available -= totalRequired;

        for (uint256 i = 0; i < milestoneIds.length; i++) {
            bytes32 milestoneId = milestoneIds[i];
            if (milestones[milestoneId].status != MilestoneStatus.None) {
                revert MilestoneAlreadyExists(milestoneId);
            }

            milestones[milestoneId] = MilestoneFund({
                ideaId: ideaId,
                amount: amounts[i],
                status: MilestoneStatus.Reserved,
                worker: address(0),
                reviewer: address(0),
                submittedAt: 0,
                reviewStartedAt: 0,
                approvedAt: 0,
                submissionHash: bytes32(0),
                attestationHash: bytes32(0),
                vesting: VestingSchedule({
                    duration: vestingDurations[i],
                    cliff: vestingCliffs[i],
                    startTime: 0,
                    linear: linearVestings[i]
                }),
                releasedAmount: 0
            });

            milestoneToIdea[milestoneId] = ideaId;

            emit MilestoneReserved(
                ideaId,
                milestoneId,
                amounts[i],
                vestingDurations[i],
                vestingCliffs[i]
            );
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Worker Submission
    // ─────────────────────────────────────────────────────────────────────────

    function submitMilestone(bytes32 milestoneId, bytes32 submissionHash) external onlyVerifiedWorker {
        MilestoneFund storage m = milestones[milestoneId];
        if (m.status != MilestoneStatus.Reserved) {
            revert InvalidState(milestoneId, m.status, MilestoneStatus.Reserved);
        }

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
        if (m.status != MilestoneStatus.Submitted) {
            revert InvalidState(milestoneId, m.status, MilestoneStatus.Submitted);
        }

        m.reviewer = msg.sender;
        m.reviewStartedAt = block.timestamp;
        m.status = MilestoneStatus.UnderReview;

        emit MilestoneUnderReview(milestoneId, msg.sender, block.timestamp + disputeWindow);
    }

    function approveMilestone(bytes32 milestoneId, bytes32 attestationHash) external onlyReviewer(milestoneId) {
        MilestoneFund storage m = milestones[milestoneId];
        if (m.status != MilestoneStatus.UnderReview) {
            revert InvalidState(milestoneId, m.status, MilestoneStatus.UnderReview);
        }
        if (block.timestamp < m.reviewStartedAt + disputeWindow) {
            revert DisputeWindowActive();
        }

        m.attestationHash = attestationHash;
        m.approvedAt = block.timestamp;
        m.vesting.startTime = block.timestamp;
        m.status = MilestoneStatus.Approved;

        uint256 platformFee = (m.amount * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
        uint256 releaseAmount = m.amount - platformFee;

        emit MilestoneApproved(
            milestoneId,
            msg.sender,
            attestationHash,
            releaseAmount,
            platformFee
        );
    }

    function releaseMilestone(bytes32 milestoneId) external {
        _releaseMilestone(milestoneId);
    }

    function _releaseMilestone(bytes32 milestoneId) internal {
        MilestoneFund storage m = milestones[milestoneId];
        if (m.status != MilestoneStatus.Approved) {
            revert InvalidState(milestoneId, m.status, MilestoneStatus.Approved);
        }

        uint256 releasable = _calculateReleasable(milestoneId);
        if (releasable == 0) revert VestingAlreadyCompleted();

        uint256 alreadyReleased = m.releasedAmount;
        uint256 toRelease = releasable - alreadyReleased;

        if (toRelease == 0) revert VestingAlreadyCompleted();

        m.releasedAmount = releasable;

        uint256 platformFee = (toRelease * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
        uint256 workerAmount = toRelease - platformFee;

        if (releasable >= m.amount) {
            m.status = MilestoneStatus.Released;
        }

        address token = ideas[m.ideaId].token;

        if (platformFee > 0) {
            bool feeOk = IERC20(token).transfer(platformWallet, platformFee);
            if (!feeOk) revert PlatformFeeTransferFailed();
        }

        bool ok = IERC20(token).transfer(m.worker, workerAmount);
        if (!ok) revert TransferFailed();

        emit MilestoneReleased(
            m.ideaId,
            milestoneId,
            m.worker,
            workerAmount,
            releasable,
            platformFee
        );
    }

    function autoReleaseMilestone(bytes32 milestoneId) external {
        MilestoneFund storage m = milestones[milestoneId];

        if (m.status == MilestoneStatus.UnderReview) {
            if (block.timestamp < m.reviewStartedAt + reviewTimeout) {
                revert TimeoutNotReached();
            }
            m.approvedAt = block.timestamp;
            m.status = MilestoneStatus.AutoReleased;

            uint256 platformFee = (m.amount * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
            uint256 workerAmount = m.amount - platformFee;

            address token = ideas[m.ideaId].token;

            if (platformFee > 0) {
                bool feeOk = IERC20(token).transfer(platformWallet, platformFee);
                if (!feeOk) revert PlatformFeeTransferFailed();
            }

            bool ok = IERC20(token).transfer(m.worker, workerAmount);
            if (!ok) revert TransferFailed();

            emit MilestoneAutoReleased(milestoneId, m.worker, workerAmount, block.timestamp);
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

        bool isStakeholder = (
            msg.sender == m.worker ||
            msg.sender == ideas[m.ideaId].poster ||
            msg.sender == m.reviewer
        );
        if (!isStakeholder) revert Unauthorized();

        if (m.status != MilestoneStatus.UnderReview) {
            revert InvalidState(milestoneId, m.status, MilestoneStatus.UnderReview);
        }
        if (block.timestamp >= m.reviewStartedAt + disputeWindow) {
            revert DisputeWindowExpired();
        }
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

        emit DisputeRaised(
            milestoneId,
            msg.sender,
            reasonHash,
            block.timestamp,
            block.timestamp + disputeResolutionTimeout
        );
    }

    function resolveDispute(
        bytes32 milestoneId,
        DisputeResolution resolution,
        uint256 workerPayoutBps
    ) external onlyResolver {
        _resolveDispute(milestoneId, resolution, workerPayoutBps, msg.sender);
    }

    function _resolveDispute(
        bytes32 milestoneId,
        DisputeResolution resolution,
        uint256 workerPayoutBps,
        address resolver
    ) internal {
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
        address token = fund.token;

        if (platformFee > 0) {
            bool feeOk = IERC20(token).transfer(platformWallet, platformFee);
            if (!feeOk) revert PlatformFeeTransferFailed();
        }

        if (resolution == DisputeResolution.WorkerWins) {
            uint256 workerAmount = m.amount - platformFee;
            m.status = MilestoneStatus.Released;

            bool ok = IERC20(token).transfer(m.worker, workerAmount);
            if (!ok) revert TransferFailed();

            emit DisputeResolved(milestoneId, resolver, uint8(resolution), workerAmount, 0);
        } else if (resolution == DisputeResolution.PosterWins) {
            uint256 posterRefund = m.amount - platformFee;
            m.status = MilestoneStatus.Refunded;

            bool ok = IERC20(token).transfer(fund.poster, posterRefund);
            if (!ok) revert TransferFailed();

            emit DisputeResolved(milestoneId, resolver, uint8(resolution), 0, posterRefund);
        } else if (resolution == DisputeResolution.Split) {
            if (workerPayoutBps > BPS_DENOMINATOR) revert InvalidDisputeResolution();

            uint256 remaining = m.amount - platformFee;
            uint256 workerShare = (remaining * workerPayoutBps) / BPS_DENOMINATOR;
            uint256 posterShare = remaining - workerShare;

            m.status = MilestoneStatus.Released;

            bool ok1 = IERC20(token).transfer(m.worker, workerShare);
            if (!ok1) revert TransferFailed();

            bool ok2 = IERC20(token).transfer(fund.poster, posterShare);
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

        if (m.status == MilestoneStatus.Reserved) {
            // Not yet claimed/work started - full refund available
        } else if (m.status == MilestoneStatus.Disputed && disputes[milestoneId].resolved) {
            revert MilestoneAlreadySettled(milestoneId);
        } else {
            revert InvalidState(milestoneId, m.status, MilestoneStatus.Reserved);
        }

        uint256 amount = m.amount;
        m.status = MilestoneStatus.Refunded;
        fund.available += amount;
        totalEscrowed -= amount;

        emit MilestoneRefunded(ideaId, milestoneId, fund.poster, amount);
    }

    function withdrawAvailable(bytes32 ideaId, uint256 amount) external onlyPoster(ideaId) {
        IdeaFund storage fund = ideas[ideaId];
        if (fund.available < amount) revert InsufficientBalance(ideaId, amount, fund.available);

        fund.available -= amount;
        totalEscrowed -= amount;

        address token = fund.token;
        bool ok = IERC20(token).transfer(fund.poster, amount);
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
            uint256 vested = (m.amount * elapsed) / v.duration;
            return vested;
        } else {
            uint256 postCliff = elapsed - v.cliff;
            uint256 postCliffDuration = v.duration - v.cliff;

            if (postCliffDuration == 0) {
                return m.amount;
            }

            uint256 cliffRelease = m.amount / 4;
            uint256 remaining = m.amount - cliffRelease;

            uint256 postCliffVested = (remaining * postCliff) / postCliffDuration;
            return cliffRelease + postCliffVested;
        }
    }

    function getReleasableAmount(bytes32 milestoneId) external view returns (uint256) {
        return _getReleasableAmount(milestoneId);
    }

    function _getReleasableAmount(bytes32 milestoneId) internal view returns (uint256) {
        MilestoneFund storage m = milestones[milestoneId];
        uint256 totalReleasable = _calculateReleasable(milestoneId);
        if (totalReleasable <= m.releasedAmount) return 0;
        return totalReleasable - m.releasedAmount;
    }

    function getVestingProgress(bytes32 milestoneId) external view returns (
        uint256 totalAmount,
        uint256 releasedAmount,
        uint256 releasableNow,
        uint256 startTime,
        uint256 cliff,
        uint256 duration,
        bool isLinear
    ) {
        MilestoneFund storage m = milestones[milestoneId];
        VestingSchedule storage v = m.vesting;

        return (
            m.amount,
            m.releasedAmount,
            _getReleasableAmount(milestoneId),
            v.startTime,
            v.cliff,
            v.duration,
            v.linear
        );
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

    function setDefaultToken(address _defaultToken) external onlyOwner {
        defaultToken = _defaultToken;
        emit TokenUpdated(_defaultToken);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // View Functions
    // ─────────────────────────────────────────────────────────────────────────

    function getIdeaBalance(bytes32 ideaId) external view returns (
        uint256 available,
        uint256 totalFunded,
        uint256 platformFeesReserved
    ) {
        IdeaFund storage fund = ideas[ideaId];
        return (fund.available, fund.totalFunded, fund.platformFeesReserved);
    }

    function getMilestoneStatus(bytes32 milestoneId) external view returns (MilestoneStatus) {
        return milestones[milestoneId].status;
    }

    function getMilestoneDetails(bytes32 milestoneId) external view returns (MilestoneFund memory) {
        return milestones[milestoneId];
    }

    function getDisputeDetails(bytes32 milestoneId) external view returns (Dispute memory) {
        return disputes[milestoneId];
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
}
