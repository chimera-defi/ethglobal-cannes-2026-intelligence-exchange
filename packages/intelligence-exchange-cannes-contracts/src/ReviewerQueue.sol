// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @custom:security-contact security@iex.cannes

import {ReviewerStakeManager} from "./ReviewerStakeManager.sol";
import {CategoryRegistry} from "./CategoryRegistry.sol";
import {IdentityGate} from "./IdentityGate.sol";

/// @title ReviewerQueue
/// @notice Deterministic, stake-weighted review assignment for the Assay Protocol.
///
/// Prevents review concentration and Sybil stacking by assigning pending reviews
/// to specific eligible reviewers based on their stake weight and task category
/// specialization. Inspired by Olas's service coordination model.
///
/// Key features:
///   - Deterministic assignment using stake-weighted selection
///   - Per-reviewer capacity limits to prevent concentration
///   - Timeout-based reassignment for unreviewed tasks
///   - Category-aware assignment from CategoryRegistry
contract ReviewerQueue {
    // ─── Errors ──────────────────────────────────────────────────────────────

    error Unauthorized();
    error ZeroAddress();
    error NoEligibleReviewers();
    error ReviewerAtCapacity();
    error AssignmentNotFound();
    error ReviewNotTimedOut();
    error AlreadyCompleted();
    

    // ─── Events ───────────────────────────────────────────────────────────────

    event ReviewAssigned(bytes32 indexed taskId, address indexed reviewer, uint256 category);
    event ReviewCompleted(bytes32 indexed taskId, address indexed reviewer);
    event ReviewReassigned(bytes32 indexed taskId, address indexed oldReviewer, address indexed newReviewer);
    event ReviewTimedOut(bytes32 indexed taskId, address indexed reviewer);
    event ReviewTimeoutUpdated(uint256 oldTimeout, uint256 newTimeout);
    event MaxActiveReviewsUpdated(uint256 oldMax, uint256 newMax);
    event OperatorSet(address indexed operator, bool approved);
    event OwnershipTransferStarted(address indexed previous, address indexed next);
    event OwnershipTransferred(address indexed previous, address indexed next);
    event IdentityGateUpdated(address newGate);

    // ─── Storage ──────────────────────────────────────────────────────────────

    /// @notice Review assignment tracking
    struct ReviewAssignment {
        bytes32 taskId;
        address assignedReviewer;
        uint256 assignedAt;
        uint256 taskCategory;
        bool completed;
        bool timedOut;
    }

    ReviewerStakeManager public immutable reviewerStakeManager;
    CategoryRegistry public immutable categoryRegistry;
    IdentityGate public identityGate;

    mapping(address => bool) public operators;

    uint256 public reviewTimeout; // seconds before unreviewed task can be reassigned, default 24 hours
    uint256 public maxActiveReviewsPerReviewer; // default 5
    uint256 public maxReviewerScanCount = 50; // max reviewers to scan per assignment

    mapping(bytes32 => ReviewAssignment) public assignments; // taskId => assignment
    mapping(address => bytes32[]) public reviewerQueue; // reviewer => assigned taskIds
    mapping(address => uint256) public reviewerActiveCount; // reviewer => active review count
    mapping(address => mapping(bytes32 => uint256)) private _queueTaskIndex; // reviewer => taskId => 1-based index in queue

    address public owner;
    address public pendingOwner;

    // ─── Reentrancy guard ─────────────────────────────────────────────────────

    uint256 private _reentrancyStatus;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    modifier nonReentrant() {
        require(_reentrancyStatus != _ENTERED, "ReviewerQueue: reentrant call");
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

    /// @notice Deploy ReviewerQueue.
    /// @param _reviewerStakeManager Address of the ReviewerStakeManager contract.
    /// @param _categoryRegistry Address of the CategoryRegistry contract.
    constructor(address _reviewerStakeManager, address _categoryRegistry) {
        if (_reviewerStakeManager == address(0)) revert ZeroAddress();
        if (_categoryRegistry == address(0)) revert ZeroAddress();

        reviewerStakeManager = ReviewerStakeManager(_reviewerStakeManager);
        categoryRegistry = CategoryRegistry(_categoryRegistry);
        owner = msg.sender;

        reviewTimeout = 24 hours;
        maxActiveReviewsPerReviewer = 5;

        _reentrancyStatus = _NOT_ENTERED;
    }

    // ─── Review Assignment ─────────────────────────────────────────────────────

    /// @notice Assign a review to a specific eligible reviewer based on stake weight.
    /// @dev Uses deterministic stake-weighted selection from eligible reviewers.
    /// @custom:access operator only
    /// @param taskId Unique identifier for the task.
    /// @param taskCategory Task category (0-5 from CategoryRegistry.TaskCategory).
    /// @param eligibleReviewers List of pre-filtered eligible reviewer addresses.
    /// @param taskWorker Address of the task worker (to prevent self-assignment).
    function assignReview(
        bytes32 taskId,
        uint256 taskCategory,
        address[] calldata eligibleReviewers,
        address taskWorker
    ) external onlyOperator nonReentrant {
        _assignReview(taskId, taskCategory, eligibleReviewers, taskWorker);
    }

    /// @notice Mark a review as completed.
    /// @dev Decrements the reviewer's active count.
    /// @custom:access operator only
    /// @param taskId Unique identifier for the task.
    /// @param reviewer Address of the reviewer who completed the review.
    function completeReview(bytes32 taskId, address reviewer) external onlyOperator nonReentrant {
        ReviewAssignment storage assignment = assignments[taskId];
        if (assignment.taskId == bytes32(0)) revert AssignmentNotFound();
        if (assignment.completed) revert AlreadyCompleted();

        assignment.completed = true;
        reviewerActiveCount[reviewer]--;
        _removeFromQueue(reviewer, taskId);

        emit ReviewCompleted(taskId, reviewer);
    }

    /// @notice Reassign a timed-out review to a new reviewer.
    /// @dev Can only be called after reviewTimeout has elapsed.
    /// @custom:access operator only
    /// @param taskId Unique identifier for the task.
    /// @param newEligibleReviewers List of new eligible reviewer addresses.
    function reassignTimedOut(
        bytes32 taskId,
        address[] calldata newEligibleReviewers
    ) external onlyOperator nonReentrant {
        ReviewAssignment storage assignment = assignments[taskId];
        if (assignment.taskId == bytes32(0)) revert AssignmentNotFound();
        if (assignment.completed) revert AlreadyCompleted();

        if (block.timestamp < assignment.assignedAt + reviewTimeout) {
            revert ReviewNotTimedOut();
        }

        address oldReviewer = assignment.assignedReviewer;
        assignment.timedOut = true;

        // Remove from old reviewer's queue and decrement count
        _removeFromQueue(oldReviewer, taskId);
        reviewerActiveCount[oldReviewer]--;

        emit ReviewTimedOut(taskId, oldReviewer);

        // Select new reviewer and update assignment (address(0) for taskWorker since it's reassignment)
        address newReviewer = _selectReviewerForTask(taskId, assignment.taskCategory, newEligibleReviewers, address(0));

        assignment.assignedReviewer = newReviewer;
        assignment.assignedAt = block.timestamp;
        assignment.timedOut = false; // Reset timedOut for new assignment

        // Update new reviewer's queue and active count
        reviewerQueue[newReviewer].push(taskId);
        _queueTaskIndex[newReviewer][taskId] = reviewerQueue[newReviewer].length; // 1-based index
        reviewerActiveCount[newReviewer]++;

        emit ReviewAssigned(taskId, newReviewer, assignment.taskCategory);
        emit ReviewReassigned(taskId, oldReviewer, newReviewer);
    }

    // ─── View Functions ───────────────────────────────────────────────────────

    /// @notice Get a reviewer's active task queue.
    /// @param reviewer Address of the reviewer.
    /// @return Array of active taskIds assigned to the reviewer.
    function getReviewerQueue(address reviewer) external view returns (bytes32[] memory) {
        return reviewerQueue[reviewer];
    }

    /// @notice Check if a specific reviewer is assigned to a task.
    /// @param taskId Unique identifier for the task.
    /// @param reviewer Address of the reviewer to check.
    /// @return True if the reviewer is assigned to this task.
    function isAssignedReviewer(bytes32 taskId, address reviewer) external view returns (bool) {
        ReviewAssignment storage assignment = assignments[taskId];
        return assignment.assignedReviewer == reviewer && !assignment.completed && !assignment.timedOut;
    }

    // ─── Admin Functions ──────────────────────────────────────────────────────

    /// @notice Set the review timeout period.
    /// @custom:access owner only
    /// @param newTimeout New timeout in seconds.
    function setReviewTimeout(uint256 newTimeout) external onlyOwner {
        emit ReviewTimeoutUpdated(reviewTimeout, newTimeout);
        reviewTimeout = newTimeout;
    }

    /// @notice Set the maximum active reviews per reviewer.
    /// @custom:access owner only
    /// @param newMax New maximum active reviews.
    function setMaxActiveReviews(uint256 newMax) external onlyOwner {
        emit MaxActiveReviewsUpdated(maxActiveReviewsPerReviewer, newMax);
        maxActiveReviewsPerReviewer = newMax;
    }

    /// @notice Set the maximum reviewers to scan per assignment.
    /// @custom:access owner only
    /// @param count New maximum scan count (must be between 10 and 200).
    function setMaxReviewerScanCount(uint256 count) external onlyOwner {
        require(count >= 10 && count <= 200, "Invalid scan count");
        maxReviewerScanCount = count;
    }

    /// @notice Approve or revoke an operator address.
    /// @custom:access owner only
    /// @param op Address to configure.
    /// @param approved True to grant operator rights, false to revoke.
    function setOperator(address op, bool approved) external onlyOwner {
        if (op == address(0)) revert ZeroAddress();
        operators[op] = approved;
        emit OperatorSet(op, approved);
    }

    /// @notice Set the IdentityGate contract address for WorldID verification.
    /// @custom:access owner only
    /// @param _identityGate Address of the IdentityGate contract.
    function setIdentityGate(address _identityGate) external onlyOwner {
        identityGate = IdentityGate(_identityGate);
        emit IdentityGateUpdated(_identityGate);
    }

    /// @notice Begin ownership transfer. Nominee must call acceptOwnership().
    /// @custom:access owner only
    /// @param newOwner Nominee address.
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    /// @notice Nominee accepts ownership to complete the two-step transfer.
    /// @custom:access pendingOwner only
    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert Unauthorized();
        address oldOwner = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(oldOwner, owner);
    }

    // ─── Internal Functions ────────────────────────────────────────────────────

    /// @notice Select a reviewer for a task based on stake weight.
    /// @param taskId Unique identifier for the task (used as seed).
    /// @param taskCategory Task category (0-5 from CategoryRegistry.TaskCategory).
    /// @param eligibleReviewers List of pre-filtered eligible reviewer addresses.
    /// @param taskWorker Address of the task worker (to prevent self-assignment).
    /// @return Selected reviewer address.
    function _selectReviewerForTask(
        bytes32 taskId,
        uint256 taskCategory,
        address[] calldata eligibleReviewers,
        address taskWorker
    ) internal view returns (address) {
        if (eligibleReviewers.length == 0) revert NoEligibleReviewers();

        // Filter out reviewers at capacity and collect stake weights
        address[] memory availableReviewers = new address[](eligibleReviewers.length);
        uint256[] memory stakeWeights = new uint256[](eligibleReviewers.length);
        uint256 availableCount = 0;
        uint256 scanCount = 0;

        for (uint256 i = 0; i < eligibleReviewers.length; i++) {
            // Prevent OOG by limiting scan count
            scanCount++;
            if (scanCount > maxReviewerScanCount) {
                break;
            }

            address reviewer = eligibleReviewers[i];

            // Prevent self-assignment
            if (reviewer == taskWorker) {
                continue;
            }

            if (reviewerActiveCount[reviewer] < maxActiveReviewsPerReviewer) {
                // Check WorldID verification if IdentityGate is set
                if (address(identityGate) != address(0)) {
                    if (!identityGate.isVerified(reviewer, keccak256("reviewer"))) {
                        continue; // Skip reviewers without WorldID verification
                    }
                }

                // Wrap stake manager call in try/catch to prevent reverts
                try reviewerStakeManager.reviewerBond(reviewer) returns (uint256 stake) {
                    availableReviewers[availableCount] = reviewer;
                    stakeWeights[availableCount] = stake;
                    availableCount++;
                } catch {
                    // Skip reviewer if stake manager call fails
                    continue;
                }
            }
        }

        if (availableCount == 0) revert ReviewerAtCapacity();

        // Resize arrays to actual available count
        assembly {
            mstore(availableReviewers, availableCount)
            mstore(stakeWeights, availableCount)
        }

        // Deterministic stake-weighted selection
        return _selectWeightedReviewer(taskId, availableReviewers, stakeWeights);
    }

    /// @notice Internal function to assign a review to a specific eligible reviewer based on stake weight.
    /// @param taskId Unique identifier for the task.
    /// @param taskCategory Task category (0-5 from CategoryRegistry.TaskCategory).
    /// @param eligibleReviewers List of pre-filtered eligible reviewer addresses.
    /// @param taskWorker Address of the task worker (to prevent self-assignment).
    function _assignReview(
        bytes32 taskId,
        uint256 taskCategory,
        address[] calldata eligibleReviewers,
        address taskWorker
    ) internal {
        address selectedReviewer = _selectReviewerForTask(taskId, taskCategory, eligibleReviewers, taskWorker);

        // Create assignment
        assignments[taskId] = ReviewAssignment({
            taskId: taskId,
            assignedReviewer: selectedReviewer,
            assignedAt: block.timestamp,
            taskCategory: taskCategory,
            completed: false,
            timedOut: false
        });

        // Update reviewer queue and active count
        reviewerQueue[selectedReviewer].push(taskId);
        _queueTaskIndex[selectedReviewer][taskId] = reviewerQueue[selectedReviewer].length; // 1-based index
        reviewerActiveCount[selectedReviewer]++;

        emit ReviewAssigned(taskId, selectedReviewer, taskCategory);
    }

    /// @notice Select a reviewer using deterministic stake-weighted random selection.
    /// @param taskId Unique identifier for the task (used as seed).
    /// @param reviewers Array of available reviewer addresses.
    /// @param stakeWeights Array of stake weights corresponding to reviewers.
    /// @return Selected reviewer address.
    function _selectWeightedReviewer(
        bytes32 taskId,
        address[] memory reviewers,
        uint256[] memory stakeWeights
    ) internal view returns (address) {
        uint256 totalWeight = 0;
        for (uint256 i = 0; i < reviewers.length; i++) {
            totalWeight += stakeWeights[i];
        }

        // Deterministic weighted selection
        uint256 seed = uint256(keccak256(abi.encodePacked(taskId, block.timestamp)));

        if (totalWeight == 0) {
            // Fallback to uniform selection if all stakes are zero
            return reviewers[seed % reviewers.length];
        }

        uint256 selection = seed % totalWeight;

        uint256 cumulativeWeight = 0;
        for (uint256 i = 0; i < reviewers.length; i++) {
            cumulativeWeight += stakeWeights[i];
            if (selection < cumulativeWeight) {
                return reviewers[i];
            }
        }

        // Fallback to last reviewer (should not reach here with proper weights)
        return reviewers[reviewers.length - 1];
    }

    /// @notice Remove a taskId from a reviewer's queue using O(1) swap-and-pop.
    /// @param reviewer Address of the reviewer.
    /// @param taskId TaskId to remove.
    function _removeFromQueue(address reviewer, bytes32 taskId) internal {
        uint256 idx = _queueTaskIndex[reviewer][taskId];
        if (idx == 0) return; // not in queue

        idx--; // convert to 0-based
        bytes32[] storage queue = reviewerQueue[reviewer];
        uint256 last = queue.length - 1;

        if (idx != last) {
            bytes32 lastTask = queue[last];
            queue[idx] = lastTask;
            _queueTaskIndex[reviewer][lastTask] = idx + 1; // update moved task's index (1-based)
        }

        queue.pop();
        delete _queueTaskIndex[reviewer][taskId];
    }
}