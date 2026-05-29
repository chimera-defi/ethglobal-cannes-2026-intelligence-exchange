// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @custom:security-contact security@iex.cannes

import {IntelToken} from "./IntelToken.sol";

/// @title WorkerStakeManager
/// @notice Worker stake manager for the Assay Protocol.
///
/// Workers must stake INTEL tokens to be eligible to claim high-value tasks.
/// If a worker commits fraud on an accepted task, their stake can be slashed.
/// This closes the economic security gap: reviewers are WorldID-gated, but workers
/// currently have no skin in the game.
///
/// Access:
///   - stake, requestUnstake, finalizeUnstake: any worker
///   - canClaim: view function used by broker/escrow to gate high-value task claims
///   - slash: only operators
///   - config: only owner (Ownable2Step — two-step transfer prevents key loss)
contract WorkerStakeManager {
    // ─── Errors ──────────────────────────────────────────────────────────────

    error Unauthorized();
    error ZeroAmount();
    error ZeroAddress();
    error CooldownActive(uint256 availableAt);
    error NoPendingUnstake();
    error InsufficientStake();
    error SlashExceedsStake(uint256 requested, uint256 available);
    error InvalidParam();

    // ─── Events ───────────────────────────────────────────────────────────────

    event WorkerStaked(address indexed worker, uint256 amount, uint256 newTotal);
    event UnstakeRequested(address indexed worker, uint256 amount, uint256 availableAt);
    event UnstakeFinalized(address indexed worker, uint256 amount);
    event WorkerSlashed(
        address indexed worker,
        uint256 amount,
        address indexed reporter,
        uint256 treasuryShare,
        uint256 reporterShare
    );
    event ParamsUpdated(
        uint256 minStakeToClaimHighValue,
        uint256 highValueThresholdWei,
        uint256 cooldown,
        uint256 slashTreasuryBps
    );
    event OperatorSet(address indexed operator, bool approved);
    event TreasurySet(address indexed treasury);
    event OwnershipTransferStarted(address indexed previous, address indexed next);
    event OwnershipTransferred(address indexed previous, address indexed next);

    // ─── Storage ──────────────────────────────────────────────────────────────

    IntelToken public immutable intel;

    address public owner;
    address public pendingOwner; // Ownable2Step — nominee must call acceptOwnership()
    mapping(address => bool) public operators;

    // Stake configuration
    uint256 public minStakeToClaimHighValue; // default 1000e18 INTEL
    uint256 public highValueThresholdWei;    // tasks above this ETH value require stake
    uint256 public cooldown;                 // default 7 days
    uint256 public slashTreasuryBps;         // portion of slash going to treasury, default 5000 (50%)

    // Worker stake state
    mapping(address => uint256) public workerStake;
    mapping(address => uint256) public unstakeAvailableAt;
    mapping(address => uint256) public pendingUnstake;

    address public treasuryAddress;

    uint256 public constant BPS = 10_000;

    // ─── Reentrancy guard ─────────────────────────────────────────────────────

    uint256 private _reentrancyStatus;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    modifier nonReentrant() {
        require(_reentrancyStatus != _ENTERED, "WorkerStakeManager: reentrant call");
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

    /// @notice Deploy WorkerStakeManager.
    /// @param _intel          Address of the INTEL ERC-20 token.
    /// @param _treasury       Treasury address for receiving slash proceeds.
    constructor(address _intel, address _treasury) {
        if (_intel == address(0)) revert ZeroAddress();
        if (_treasury == address(0)) revert ZeroAddress();

        intel = IntelToken(_intel);
        owner = msg.sender;
        treasuryAddress = _treasury;

        // Sensible defaults
        minStakeToClaimHighValue = 1000e18;  // 1000 INTEL
        highValueThresholdWei = 0.1 ether;    // 0.1 ETH
        cooldown = 7 days;
        slashTreasuryBps = 5000;              // 50%
        _reentrancyStatus = _NOT_ENTERED;
    }

    // ─── Staking ──────────────────────────────────────────────────────────────

    /// @notice Stake INTEL tokens. Tokens are transferred from caller.
    /// @param amount INTEL amount to stake (in wei, 18 decimals).
    function stake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();

        // Transfer tokens from worker
        bool stakeOk = intel.transferFrom(msg.sender, address(this), amount);
        require(stakeOk, "WorkerStakeManager: stake transferFrom failed");

        // Update stake
        workerStake[msg.sender] += amount;

        emit WorkerStaked(msg.sender, amount, workerStake[msg.sender]);
    }

    /// @notice Request unstake. Begins cooldown; tokens remain locked until cooldown expires.
    /// @param amount INTEL amount to queue for unstake.
    function requestUnstake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();

        uint256 currentStake = workerStake[msg.sender];
        if (currentStake < amount) revert InsufficientStake();

        // Move from staked to pending
        workerStake[msg.sender] = currentStake - amount;
        pendingUnstake[msg.sender] += amount;
        unstakeAvailableAt[msg.sender] = block.timestamp + cooldown;

        emit UnstakeRequested(msg.sender, amount, unstakeAvailableAt[msg.sender]);
    }

    /// @notice Withdraw tokens after cooldown expires.
    function finalizeUnstake() external nonReentrant {
        uint256 pending = pendingUnstake[msg.sender];
        if (pending == 0) revert NoPendingUnstake();
        if (block.timestamp < unstakeAvailableAt[msg.sender]) {
            revert CooldownActive(unstakeAvailableAt[msg.sender]);
        }

        // Clear pending state
        pendingUnstake[msg.sender] = 0;
        unstakeAvailableAt[msg.sender] = 0;

        // Transfer tokens back to worker
        bool unstakeOk = intel.transfer(msg.sender, pending);
        require(unstakeOk, "WorkerStakeManager: finalizeUnstake transfer failed");

        emit UnstakeFinalized(msg.sender, pending);
    }

    // ─── View ─────────────────────────────────────────────────────────────────

    /// @notice Check if a worker can claim a task based on their stake.
    /// @param worker        Worker address to check.
    /// @param taskValueWei  Task value in ETH wei.
    /// @return True if worker can claim the task.
    function canClaim(address worker, uint256 taskValueWei) external view returns (bool) {
        // Low-value tasks don't require stake
        if (taskValueWei < highValueThresholdWei) {
            return true;
        }

        // High-value tasks require minimum stake
        return workerStake[worker] >= minStakeToClaimHighValue;
    }

    // ─── Slashing ─────────────────────────────────────────────────────────────

    /// @notice Slash a worker's stake for fraud. Split between treasury and reporter.
    /// @custom:access operator only
    /// @param worker  Worker address to slash.
    /// @param amount  Amount to slash (in INTEL wei).
    /// @param reporter Address that reported the fraud (receives reporter share).
    function slash(address worker, uint256 amount, address reporter)
        external
        onlyOperator
        nonReentrant
    {
        if (amount == 0) revert ZeroAmount();
        if (worker == address(0)) revert ZeroAddress();
        if (reporter == address(0)) revert ZeroAddress();

        uint256 currentStake = workerStake[worker] + pendingUnstake[worker];
        if (amount > currentStake) revert SlashExceedsStake(amount, currentStake);

        // Calculate shares
        uint256 treasuryShare = (amount * slashTreasuryBps) / BPS;
        uint256 reporterShare = amount - treasuryShare;

        // Deduct from staked first, then pending
        uint256 stakedToSlash = amount;
        if (workerStake[worker] >= stakedToSlash) {
            workerStake[worker] -= stakedToSlash;
        } else {
            stakedToSlash -= workerStake[worker];
            workerStake[worker] = 0;
            pendingUnstake[worker] -= stakedToSlash;
        }

        // Transfer shares
        if (treasuryShare > 0) {
            bool treasuryOk = intel.transfer(treasuryAddress, treasuryShare);
            require(treasuryOk, "WorkerStakeManager: slash treasury transfer failed");
        }

        if (reporterShare > 0) {
            bool reporterOk = intel.transfer(reporter, reporterShare);
            require(reporterOk, "WorkerStakeManager: slash reporter transfer failed");
        }

        emit WorkerSlashed(worker, amount, reporter, treasuryShare, reporterShare);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    /// @notice Set the minimum stake required to claim high-value tasks.
    /// @custom:access owner
    /// @param _minStake New minimum stake in INTEL wei.
    function setMinStake(uint256 _minStake) external onlyOwner {
        minStakeToClaimHighValue = _minStake;
        _emitParamsUpdated();
    }

    /// @notice Set the high-value task threshold in ETH wei.
    /// @custom:access owner
    /// @param _threshold New threshold in ETH wei.
    function setHighValueThreshold(uint256 _threshold) external onlyOwner {
        highValueThresholdWei = _threshold;
        _emitParamsUpdated();
    }

    /// @notice Set the unstake cooldown period.
    /// @custom:access owner
    /// @param _cooldown New cooldown in seconds.
    function setCooldown(uint256 _cooldown) external onlyOwner {
        cooldown = _cooldown;
        _emitParamsUpdated();
    }

    /// @notice Set the treasury address.
    /// @custom:access owner
    /// @param _treasury New treasury address (non-zero).
    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert ZeroAddress();
        treasuryAddress = _treasury;
        emit TreasurySet(_treasury);
    }

    /// @notice Set the slash split between treasury and reporter.
    /// @custom:access owner
    /// @param _slashTreasuryBps New treasury share in BPS (e.g. 5000 = 50%).
    function setSlashSplit(uint256 _slashTreasuryBps) external onlyOwner {
        if (_slashTreasuryBps > BPS) revert InvalidParam();
        slashTreasuryBps = _slashTreasuryBps;
        _emitParamsUpdated();
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

    /// @notice Begin ownership transfer. Nominee must call acceptOwnership().
    /// @custom:access owner
    /// @param newOwner Nominee address.
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    /// @notice Nominee accepts ownership to complete the two-step transfer.
    /// @custom:access pendingOwner
    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert Unauthorized();
        address previousOwner = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, owner);
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _emitParamsUpdated() private {
        emit ParamsUpdated(
            minStakeToClaimHighValue,
            highValueThresholdWei,
            cooldown,
            slashTreasuryBps
        );
    }
}