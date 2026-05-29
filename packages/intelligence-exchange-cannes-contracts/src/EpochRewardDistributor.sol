// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @custom:security-contact security@iex.cannes

import {IntelToken} from "./IntelToken.sol";

/// @title EpochRewardDistributor
/// @notice Distributes bonus INTEL to top performers each epoch based on AIU score.
///
/// Workers need an incentive beyond per-task payouts to stay on the platform and improve quality.
/// This contract distributes bonus INTEL to top performers each epoch, ranked by AIU (Accepted Intelligence Unit)
/// score — a normalized measure of accepted work quality. Inspired by Bittensor's emission-to-top-miners model,
/// adapted for acceptance-gated human-reviewed work.
///
/// Access:
///   - submitEpochScores, distributeEpochRewards, advanceEpoch: only operators or owner
///   - claimReward: any eligible worker
///   - depositRewardPool: anyone
///   - config: only owner (Ownable2Step — two-step transfer prevents key loss)
contract EpochRewardDistributor {
    // ─── Errors ──────────────────────────────────────────────────────────────

    error Unauthorized();
    error ZeroAddress();
    error ZeroAmount();
    error InvalidParam();
    error EpochAlreadyDistributed();
    error EpochNotDistributed();
    error NothingToClaim();
    error AlreadyClaimed();
    error ScoresNotSubmitted();
    error ArrayLengthMismatch();
    error BelowMinAiu();

    // ─── Constants ────────────────────────────────────────────────────────────

    uint256 public constant BPS = 10_000;

    // ─── Events ───────────────────────────────────────────────────────────────

    event EpochScoresSubmitted(uint256 indexed epoch, uint256 workerCount, uint256 topCount);
    event EpochRewardsDistributed(uint256 indexed epoch, uint256 pool, uint256 topCount);
    event RewardClaimed(uint256 indexed epoch, address indexed worker, uint256 amount);
    event RewardPoolDeposited(address indexed from, uint256 amount, uint256 newBalance);
    event EpochAdvanced(uint256 indexed newEpoch);
    event OwnershipTransferStarted(address indexed previous, address indexed next);
    event OwnershipTransferred(address indexed previous, address indexed next);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event EpochRewardPoolUpdated(uint256 oldPool, uint256 newPool);
    event TopPercentileBpsUpdated(uint256 oldBps, uint256 newBps);
    event MinAiuThresholdUpdated(uint256 oldThreshold, uint256 newThreshold);
    event OperatorSet(address indexed operator, bool approved);

    // ─── Storage ──────────────────────────────────────────────────────────────

    IntelToken public immutable intel;
    address public treasury;
    mapping(address => bool) public operators;

    uint256 public epochRewardPool;
    uint256 public topPercentileBps;
    uint256 public minAiuThreshold;

    struct EpochReward {
        uint256 epoch;
        uint256 totalPool;
        uint256 workerCount;
        uint256 topCount;
        bool distributed;
        mapping(address => uint256) aiuScore;
        mapping(address => uint256) rewardEarned;
        mapping(address => bool) claimed;
        address[] rankedWorkers;
    }

    mapping(uint256 => EpochReward) public epochRewards;
    uint256 public currentEpoch;

    address public owner;
    address public pendingOwner;

    // ─── Reentrancy guard ─────────────────────────────────────────────────────

    uint256 private _reentrancyStatus;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    modifier nonReentrant() {
        require(_reentrancyStatus != _ENTERED, "EpochRewardDistributor: reentrant call");
        _reentrancyStatus = _ENTERED;
        _;
        _reentrancyStatus = _NOT_ENTERED;
    }

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyOperator() {
        if (!operators[msg.sender] && msg.sender != owner) revert Unauthorized();
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    /// @notice Deploy EpochRewardDistributor.
    /// @param _intel INTEL token address (non-zero).
    /// @param _treasury Treasury address — source of bonus INTEL pool (non-zero).
    constructor(address _intel, address _treasury) {
        if (_intel == address(0)) revert ZeroAddress();
        if (_treasury == address(0)) revert ZeroAddress();

        intel = IntelToken(_intel);
        treasury = _treasury;
        owner = msg.sender;
        epochRewardPool = 10_000e18;
        topPercentileBps = 1000; // 10%
        minAiuThreshold = 1;
        currentEpoch = 1;
        _reentrancyStatus = _NOT_ENTERED;
    }

    // ─── Operator Functions ───────────────────────────────────────────────────

    /// @notice Submit AIU scores for an epoch. Workers must be sorted descending by AIU score.
    /// @custom:access operator or owner
    /// @param epoch The epoch number to submit scores for.
    /// @param workers Array of worker addresses (sorted descending by AIU score).
    /// @param aiuScores Array of AIU scores corresponding to each worker.
    function submitEpochScores(
        uint256 epoch,
        address[] calldata workers,
        uint256[] calldata aiuScores
    ) external onlyOperator {
        if (workers.length != aiuScores.length) revert ArrayLengthMismatch();

        EpochReward storage reward = epochRewards[epoch];
        reward.epoch = epoch;
        reward.workerCount = workers.length;
        reward.topCount = (workers.length * topPercentileBps) / BPS;
        if (reward.topCount == 0 && workers.length > 0) reward.topCount = 1;

        for (uint256 i = 0; i < workers.length; i++) {
            if (aiuScores[i] < minAiuThreshold) revert BelowMinAiu();
            reward.aiuScore[workers[i]] = aiuScores[i];
            reward.rankedWorkers.push(workers[i]);
        }

        emit EpochScoresSubmitted(epoch, workers.length, reward.topCount);
    }

    /// @notice Distribute epoch rewards to top performers pro-rata by AIU score.
    /// @custom:access operator or owner
    /// @param epoch The epoch number to distribute rewards for.
    function distributeEpochRewards(uint256 epoch) external onlyOperator nonReentrant {
        EpochReward storage reward = epochRewards[epoch];

        if (reward.workerCount == 0) revert ScoresNotSubmitted();
        if (reward.distributed) revert EpochAlreadyDistributed();

        uint256 topCount = reward.topCount;
        if (topCount == 0 && reward.workerCount > 0) topCount = 1;
        if (topCount > reward.workerCount) topCount = reward.workerCount;

        uint256 totalAiu = 0;
        for (uint256 i = 0; i < topCount; i++) {
            totalAiu += reward.aiuScore[reward.rankedWorkers[i]];
        }

        if (totalAiu == 0) revert ZeroAmount();

        uint256 pool = epochRewardPool;
        intel.transferFrom(treasury, address(this), pool);
        reward.totalPool = pool;

        for (uint256 i = 0; i < topCount; i++) {
            address worker = reward.rankedWorkers[i];
            uint256 workerAiu = reward.aiuScore[worker];
            uint256 rewardAmount = (pool * workerAiu) / totalAiu;
            reward.rewardEarned[worker] = rewardAmount;
        }

        reward.distributed = true;

        emit EpochRewardsDistributed(epoch, pool, topCount);
    }

    /// @notice Advance to the next epoch. Only callable by operators or owner.
    /// @custom:access operator or owner
    function advanceEpoch() external onlyOperator {
        currentEpoch += 1;
        emit EpochAdvanced(currentEpoch);
    }

    // ─── User Functions ────────────────────────────────────────────────────────

    /// @notice Claim reward for a specific epoch.
    /// @param epoch The epoch number to claim rewards for.
    function claimReward(uint256 epoch) external nonReentrant {
        EpochReward storage reward = epochRewards[epoch];

        if (!reward.distributed) revert EpochNotDistributed();
        if (reward.rewardEarned[msg.sender] == 0) revert NothingToClaim();
        if (reward.claimed[msg.sender]) revert AlreadyClaimed();

        uint256 amount = reward.rewardEarned[msg.sender];
        reward.claimed[msg.sender] = true;

        intel.transfer(msg.sender, amount);

        emit RewardClaimed(epoch, msg.sender, amount);
    }

    /// @notice Deposit INTEL to the reward pool. Anyone can deposit.
    /// @param amount Amount of INTEL to deposit.
    function depositRewardPool(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();

        intel.transferFrom(msg.sender, address(this), amount);

        uint256 newBalance = intel.balanceOf(address(this));
        emit RewardPoolDeposited(msg.sender, amount, newBalance);
    }

    // ─── Admin Functions ───────────────────────────────────────────────────────

    /// @notice Set the epoch reward pool size.
    /// @custom:access only owner
    function setEpochRewardPool(uint256 _epochRewardPool) external onlyOwner {
        uint256 oldPool = epochRewardPool;
        epochRewardPool = _epochRewardPool;
        emit EpochRewardPoolUpdated(oldPool, _epochRewardPool);
    }

    /// @notice Set the top percentile basis points.
    /// @custom:access only owner
    function setTopPercentileBps(uint256 _topPercentileBps) external onlyOwner {
        if (_topPercentileBps > BPS) revert InvalidParam();
        uint256 oldBps = topPercentileBps;
        topPercentileBps = _topPercentileBps;
        emit TopPercentileBpsUpdated(oldBps, _topPercentileBps);
    }

    /// @notice Set the minimum AIU threshold for eligibility.
    /// @custom:access only owner
    function setMinAiuThreshold(uint256 _minAiuThreshold) external onlyOwner {
        uint256 oldThreshold = minAiuThreshold;
        minAiuThreshold = _minAiuThreshold;
        emit MinAiuThresholdUpdated(oldThreshold, _minAiuThreshold);
    }

    /// @notice Set the treasury address.
    /// @custom:access only owner
    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert ZeroAddress();
        address oldTreasury = treasury;
        treasury = _treasury;
        emit TreasuryUpdated(oldTreasury, _treasury);
    }

    /// @notice Set an operator address.
    /// @custom:access only owner
    function setOperator(address _operator, bool _approved) external onlyOwner {
        if (_operator == address(0)) revert ZeroAddress();
        operators[_operator] = _approved;
        emit OperatorSet(_operator, _approved);
    }

    // ─── Ownable2Step ─────────────────────────────────────────────────────────

    /// @notice Begin ownership transfer. New owner must call acceptOwnership().
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    /// @notice Nominee accepts ownership. Completes the two-step transfer.
    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert Unauthorized();
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = address(0);
    }
}