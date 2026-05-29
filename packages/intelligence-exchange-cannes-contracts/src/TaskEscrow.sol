// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @custom:security-contact security@iex.cannes

import {IntelToken} from "./IntelToken.sol";
import {IntelStaking} from "./IntelStaking.sol";

/// @title TaskEscrow
/// @notice On-chain INTEL escrow for the Assay Protocol.
///
/// Holds INTEL tokens in escrow for tasks and releases them on acceptance
/// with a configurable split: worker (81%), staker yield (9%), treasury (10%).
///
/// Access:
///   - fundTask: anyone (funder provides INTEL)
///   - release: only whitelisted operators (broker)
///   - refund: funder after refund window or owner anytime
///   - config: only owner (Ownable2Step — two-step transfer prevents key loss)
contract TaskEscrow {
    // ─── Errors ──────────────────────────────────────────────────────────────

    error Unauthorized();
    error ZeroAddress();
    error ZeroAmount();
    error TaskAlreadyExists();
    error TaskNotFunded();
    error RefundWindowNotElapsed();
    error InvalidSplit();

    // ─── Events ───────────────────────────────────────────────────────────────

    event TaskFunded(bytes32 indexed taskId, address indexed funder, address indexed worker, uint256 amount);
    event TaskReleased(
        bytes32 indexed taskId,
        address indexed worker,
        uint256 workerShare,
        uint256 stakerShare,
        uint256 treasuryShare
    );
    event TaskRefunded(bytes32 indexed taskId, address indexed funder, uint256 amount);
    event SplitUpdated(uint256 workerBps, uint256 stakerBps, uint256 treasuryBps);
    event TreasuryUpdated(address indexed treasury);
    event OperatorSet(address indexed op, bool approved);
    event RefundWindowUpdated(uint256 window);
    event OwnershipTransferStarted(address indexed previous, address indexed next);
    event OwnershipTransferred(address indexed previous, address indexed next);

    // ─── Storage ──────────────────────────────────────────────────────────────

    IntelToken public immutable intel;
    IntelStaking public immutable staking;

    address public owner;
    address public pendingOwner;       // Ownable2Step — nominee must call acceptOwnership()
    mapping(address => bool) public operators;

    address public treasury;

    uint256 public workerBps;      // default 8100 (81%)
    uint256 public stakerBps;      // default 900  (9%)
    uint256 public treasuryBps;    // default 1000 (10%) — must sum to 10000

    uint256 public constant BPS = 10_000;

    enum TaskState { Empty, Funded, Released, Refunded }

    struct Task {
        bytes32 taskId;
        address funder;
        address worker;
        uint256 amount;       // INTEL escrowed
        TaskState state;
        uint256 fundedAt;
        uint256 releasedAt;
    }

    mapping(bytes32 => Task) public tasks;

    uint256 public taskRefundWindow; // seconds after funding before refund is allowed, default 7 days

    // ─── Reentrancy guard ─────────────────────────────────────────────────────

    uint256 private _reentrancyStatus;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED     = 2;

    modifier nonReentrant() {
        require(_reentrancyStatus != _ENTERED, "TaskEscrow: reentrant call");
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

    /// @notice Deploy TaskEscrow.
    /// @param _intel       INTEL token address (non-zero).
    /// @param _staking     IntelStaking address (non-zero).
    /// @param _treasury    Treasury address — receives 10% of released funds.
    constructor(
        address _intel,
        address _staking,
        address _treasury
    ) {
        if (_intel == address(0)) revert ZeroAddress();
        if (_staking == address(0)) revert ZeroAddress();
        if (_treasury == address(0)) revert ZeroAddress();

        intel = IntelToken(_intel);
        staking = IntelStaking(payable(_staking));
        owner = msg.sender;
        treasury = _treasury;

        workerBps = 8100;   // 81%
        stakerBps = 900;    // 9%
        treasuryBps = 1000; // 10%

        taskRefundWindow = 7 days;

        _reentrancyStatus = _NOT_ENTERED;
    }

    // ─── Core Escrow Functions ────────────────────────────────────────────────

    /// @notice Fund a task with INTEL. Tokens are transferred from caller and held in escrow.
    /// @param taskId  Unique task identifier (bytes32).
    /// @param worker  Address of the worker who will receive the funds on acceptance.
    /// @param amount  INTEL amount to escrow (in wei, 18 decimals).
    function fundTask(bytes32 taskId, address worker, uint256 amount) external nonReentrant {
        if (worker == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        Task storage task = tasks[taskId];
        if (task.state != TaskState.Empty) revert TaskAlreadyExists();

        // Transfer INTEL from funder to escrow
        bool transferOk = intel.transferFrom(msg.sender, address(this), amount);
        require(transferOk, "TaskEscrow: fundTask transferFrom failed");

        task.taskId = taskId;
        task.funder = msg.sender;
        task.worker = worker;
        task.amount = amount;
        task.state = TaskState.Funded;
        task.fundedAt = block.timestamp;

        emit TaskFunded(taskId, msg.sender, worker, amount);
    }

    /// @notice Release escrowed INTEL to worker, staker yield pool, and treasury.
    /// @custom:access operator only
    /// @param taskId  Task identifier to release.
    /// @param worker  Address of the worker to receive funds (actual accepted worker).
    function release(bytes32 taskId, address worker) external onlyOperator nonReentrant {
        if (worker == address(0)) revert ZeroAddress();

        Task storage task = tasks[taskId];
        if (task.state != TaskState.Funded) revert TaskNotFunded();

        uint256 workerShare = (task.amount * workerBps) / BPS;
        uint256 stakerShare = (task.amount * stakerBps) / BPS;
        uint256 treasuryShare = task.amount - workerShare - stakerShare; // remainder avoids rounding dust

        // Transfer worker share to the actual worker (not task.worker)
        bool workerOk = intel.transfer(worker, workerShare);
        require(workerOk, "TaskEscrow: release worker transfer failed");

        // Approve and transfer staker share to IntelStaking
        bool approveOk = intel.approve(address(staking), stakerShare);
        require(approveOk, "TaskEscrow: release approve failed");
        staking.depositYield(stakerShare);

        // Transfer treasury share
        bool treasuryOk = intel.transfer(treasury, treasuryShare);
        require(treasuryOk, "TaskEscrow: release treasury transfer failed");

        task.state = TaskState.Released;
        task.releasedAt = block.timestamp;

        emit TaskReleased(taskId, worker, workerShare, stakerShare, treasuryShare);
    }

    /// @notice Refund escrowed INTEL to funder. Allowed after refund window or by owner anytime.
    /// @param taskId  Task identifier to refund.
    function refund(bytes32 taskId) external nonReentrant {
        Task storage task = tasks[taskId];
        if (task.state != TaskState.Funded) revert TaskNotFunded();

        bool canRefund = msg.sender == owner || block.timestamp >= task.fundedAt + taskRefundWindow;
        if (!canRefund) revert RefundWindowNotElapsed();

        bool refundOk = intel.transfer(task.funder, task.amount);
        require(refundOk, "TaskEscrow: refund transfer failed");

        task.state = TaskState.Refunded;

        emit TaskRefunded(taskId, task.funder, task.amount);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    /// @notice Set the revenue split basis points. Must sum to BPS (10000).
    /// @custom:access owner
    /// @param _workerBps   Worker share in BPS.
    /// @param _stakerBps   Staker yield share in BPS.
    /// @param _treasuryBps Treasury share in BPS.
    function setSplitBps(uint256 _workerBps, uint256 _stakerBps, uint256 _treasuryBps) external onlyOwner {
        if (_workerBps + _stakerBps + _treasuryBps != BPS) revert InvalidSplit();

        workerBps = _workerBps;
        stakerBps = _stakerBps;
        treasuryBps = _treasuryBps;

        emit SplitUpdated(_workerBps, _stakerBps, _treasuryBps);
    }

    /// @notice Set the treasury address.
    /// @custom:access owner
    /// @param _treasury New treasury address.
    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert ZeroAddress();
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    /// @notice Approve or revoke an operator address.
    /// @custom:access owner
    /// @param op       Address to configure.
    /// @param approved True to grant operator rights, false to revoke.
    function setOperator(address op, bool approved) external onlyOwner {
        if (op == address(0)) revert ZeroAddress();
        operators[op] = approved;
        emit OperatorSet(op, approved);
    }

    /// @notice Set the refund window duration.
    /// @custom:access owner
    /// @param _window New refund window in seconds.
    function setRefundWindow(uint256 _window) external onlyOwner {
        taskRefundWindow = _window;
        emit RefundWindowUpdated(_window);
    }

    // ─── Ownable2Step ─────────────────────────────────────────────────────────

    /// @notice Begin ownership transfer. New owner must call acceptOwnership().
    ///         Two-step prevents irrecoverable loss from typo or wrong address.
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