// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @custom:security-contact security@iex.cannes

/// @title CategoryRegistry
/// @notice Registry for task categories with per-category AIU tracking and reward weights.
///         Inspired by Bittensor DTAO: each category has its own AIU sub-index weight and
///         reward pool allocation, enabling future per-category intelligence derivatives.
contract CategoryRegistry {
    // ─── Errors ──────────────────────────────────────────────────────────────

    error Unauthorized();
    error InvalidCategory();
    error ZeroAmount();
    error ZeroAddress();
    error CategoryInactive();
    error WeightSumInvalid();

    // ─── Events ───────────────────────────────────────────────────────────────

    event CategoryCompletionRecorded(
        address indexed agent,
        uint256 indexed category,
        uint256 aiuScore,
        uint256 newCategoryAiu
    );
    event EpochVolumeUpdated(uint256 indexed category, uint256 settledVolume);
    event CategoryWeightUpdated(uint256 indexed category, uint256 oldWeight, uint256 newWeight);
    event CategoryActivationToggled(uint256 indexed category, bool active);
    event OperatorSet(address indexed operator, bool approved);
    event OwnershipTransferStarted(address indexed previous, address indexed next);
    event OwnershipTransferred(address indexed previous, address indexed next);

    // ─── Types ───────────────────────────────────────────────────────────────

    /// @notice Task categories for the Assay Protocol
    enum TaskCategory { Code, Design, Research, Audit, Data, General }

    /// @notice Category configuration and state
    struct Category {
        string name;              // Human-readable name
        uint256 rewardWeightBps;  // Reward weight in basis points (sum = 10000)
        uint256 minAiuPerEpoch;   // Minimum AIU required per epoch for this category
        uint256 totalAiuAllTime;  // Total AIU earned in this category across all time
        uint256 settledVolumeEpoch; // Settled volume in the current epoch
        bool active;              // Whether this category is currently active
    }

    // ─── Storage ──────────────────────────────────────────────────────────────

    /// @notice Array of 6 categories indexed by TaskCategory enum
    Category[6] public categories;

    /// @notice AIU scores per agent per category
    mapping(address => mapping(uint256 => uint256)) public agentCategoryAiu;

    /// @notice Job completion counts per agent per category
    mapping(address => mapping(uint256 => uint256)) public agentCategoryJobs;

    /// @notice Primary category for each agent (category with most AIU)
    mapping(address => uint256) public agentPrimaryCategory;

    /// @notice Operator addresses (can record completions and update epoch volume)
    mapping(address => bool) public operators;

    address public owner;
    address public pendingOwner;

    uint256 private constant BPS_TOTAL = 10000;

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

    /// @notice Deploy CategoryRegistry with initial category weights
    /// @dev    Initializes 6 categories with weights summing to 10000 bps
    constructor() {
        owner = msg.sender;

        // Initialize categories with specified weights
        categories[uint256(TaskCategory.Code)] = Category({
            name: "Code",
            rewardWeightBps: 3500,
            minAiuPerEpoch: 0,
            totalAiuAllTime: 0,
            settledVolumeEpoch: 0,
            active: true
        });

        categories[uint256(TaskCategory.Design)] = Category({
            name: "Design",
            rewardWeightBps: 1500,
            minAiuPerEpoch: 0,
            totalAiuAllTime: 0,
            settledVolumeEpoch: 0,
            active: true
        });

        categories[uint256(TaskCategory.Research)] = Category({
            name: "Research",
            rewardWeightBps: 2000,
            minAiuPerEpoch: 0,
            totalAiuAllTime: 0,
            settledVolumeEpoch: 0,
            active: true
        });

        categories[uint256(TaskCategory.Audit)] = Category({
            name: "Audit",
            rewardWeightBps: 2000,
            minAiuPerEpoch: 0,
            totalAiuAllTime: 0,
            settledVolumeEpoch: 0,
            active: true
        });

        categories[uint256(TaskCategory.Data)] = Category({
            name: "Data",
            rewardWeightBps: 500,
            minAiuPerEpoch: 0,
            totalAiuAllTime: 0,
            settledVolumeEpoch: 0,
            active: true
        });

        categories[uint256(TaskCategory.General)] = Category({
            name: "General",
            rewardWeightBps: 500,
            minAiuPerEpoch: 0,
            totalAiuAllTime: 0,
            settledVolumeEpoch: 0,
            active: true
        });
    }

    // ─── Core Functions ───────────────────────────────────────────────────────

    /// @notice Record a task completion for an agent in a specific category
    /// @custom:access operator only
    /// @param agent      Address of the agent completing the task
    /// @param category   Task category (0-5)
    /// @param aiuScore   AIU score earned for this completion
    function recordCategoryCompletion(
        address agent,
        uint256 category,
        uint256 aiuScore
    ) external onlyOperator {
        if (category >= 6) revert InvalidCategory();
        if (aiuScore == 0) revert ZeroAmount();
        if (!categories[category].active) revert CategoryInactive();

        // Update agent's category stats
        agentCategoryAiu[agent][category] += aiuScore;
        agentCategoryJobs[agent][category] += 1;

        // Update category totals
        categories[category].totalAiuAllTime += aiuScore;

        // Update primary category if this category now has the most AIU
        if (agentCategoryAiu[agent][category] > agentCategoryAiu[agent][agentPrimaryCategory[agent]]) {
            agentPrimaryCategory[agent] = category;
        }

        emit CategoryCompletionRecorded(
            agent,
            category,
            aiuScore,
            agentCategoryAiu[agent][category]
        );
    }

    /// @notice Update the settled volume for a category in the current epoch
    /// @custom:access operator only
    /// @param category        Task category (0-5)
    /// @param settledVolume   Volume settled in this epoch
    function updateEpochVolume(uint256 category, uint256 settledVolume) external onlyOperator {
        if (category >= 6) revert InvalidCategory();
        categories[category].settledVolumeEpoch = settledVolume;
        emit EpochVolumeUpdated(category, settledVolume);
    }

    /// @notice Update the reward weight for a category, rebalancing others proportionally
    /// @custom:access owner only
    /// @dev    Ensures the sum of all weights remains 10000 bps
    /// @param category     Task category (0-5)
    /// @param newWeightBps New weight in basis points
    function setCategoryWeight(uint256 category, uint256 newWeightBps) external onlyOwner {
        if (category >= 6) revert InvalidCategory();
        if (newWeightBps == 0) revert ZeroAmount();

        uint256 oldWeight = categories[category].rewardWeightBps;
        categories[category].rewardWeightBps = newWeightBps;

        // Rebalance other categories proportionally to maintain 10000 total
        uint256 remainingWeight = BPS_TOTAL - newWeightBps;
        uint256 oldRemainingWeight = BPS_TOTAL - oldWeight;

        if (oldRemainingWeight > 0) {
            uint256 distributedWeight;
            for (uint256 i = 0; i < 6; i++) {
                if (i != category) {
                    uint256 oldCatWeight = categories[i].rewardWeightBps;
                    // Proportional rebalancing
                    uint256 newCatWeight = (oldCatWeight * remainingWeight) / oldRemainingWeight;
                    categories[i].rewardWeightBps = newCatWeight;
                    distributedWeight += newCatWeight;
                }
            }

            // Allocate any rounding remainder to the last non-target category
            if (distributedWeight < remainingWeight) {
                uint256 remainder = remainingWeight - distributedWeight;
                for (uint256 i = 0; i < 6; i++) {
                    if (i != category) {
                        categories[i].rewardWeightBps += remainder;
                        break;
                    }
                }
            }
        } else {
            // When target category has ALL the weight (10000 bps), distribute evenly
            uint256 distributedWeight;
            uint256 evenShare = remainingWeight / 5; // 5 other categories
            for (uint256 i = 0; i < 6; i++) {
                if (i != category) {
                    categories[i].rewardWeightBps = evenShare;
                    distributedWeight += evenShare;
                }
            }
            // Add remainder to first non-target category
            if (distributedWeight < remainingWeight) {
                uint256 remainder = remainingWeight - distributedWeight;
                uint256 firstNonTarget = (category == 0) ? 1 : 0;
                categories[firstNonTarget].rewardWeightBps += remainder;
            }
        }

        // Validate that all category weights sum to BPS_TOTAL
        uint256 totalWeight = 0;
        for (uint256 i = 0; i < 6; i++) {
            totalWeight += categories[i].rewardWeightBps;
        }
        if (totalWeight != BPS_TOTAL) revert WeightSumInvalid();

        emit CategoryWeightUpdated(category, oldWeight, newWeightBps);
    }

    /// @notice Get an agent's complete category profile
    /// @param agent Address to query
    /// @return aiuScores      Array of 6 AIU scores (one per category)
    /// @return jobCounts      Array of 6 job counts (one per category)
    /// @return primaryCategory The agent's primary category (most AIU)
    function getAgentCategoryProfile(address agent)
        external
        view
        returns (
            uint256[6] memory aiuScores,
            uint256[6] memory jobCounts,
            uint256 primaryCategory
        )
    {
        for (uint256 i = 0; i < 6; i++) {
            aiuScores[i] = agentCategoryAiu[agent][i];
            jobCounts[i] = agentCategoryJobs[agent][i];
        }
        primaryCategory = agentPrimaryCategory[agent];
    }

    // ─── Admin Functions ──────────────────────────────────────────────────────

    /// @notice Activate or deactivate a category
    /// @custom:access owner only
    /// @param category Task category (0-5)
    /// @param active   True to activate, false to deactivate
    function setActive(uint256 category, bool active) external onlyOwner {
        if (category >= 6) revert InvalidCategory();
        categories[category].active = active;
        emit CategoryActivationToggled(category, active);
    }

    /// @notice Approve or revoke an operator address
    /// @custom:access owner only
    /// @param op       Address to configure
    /// @param approved True to grant operator rights, false to revoke
    function setOperator(address op, bool approved) external onlyOwner {
        if (op == address(0)) revert ZeroAddress();
        operators[op] = approved;
        emit OperatorSet(op, approved);
    }

    /// @notice Begin ownership transfer. Nominee must call acceptOwnership().
    /// @custom:access owner only
    /// @dev    Two-step prevents irrecoverable ownership loss from a typo.
    /// @param newOwner Nominee address
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    /// @notice Nominee accepts ownership to complete the two-step transfer
    /// @custom:access pendingOwner only
    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert Unauthorized();
        address oldOwner = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(oldOwner, owner);
    }
}