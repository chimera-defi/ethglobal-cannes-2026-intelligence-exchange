// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IntelTimelockController
/// @notice A minimal time-lock for admin actions on Intelligence Exchange contracts.
///
/// Flow:
///   1. A proposer calls queue() → operation is scheduled with a timestamp
///   2. After `delay` seconds, anyone calls execute() → operation runs
///   3. If no longer desired, proposer or admin calls cancel() before execution
///
/// Self-administration: setDelay() and setProposer() use `onlySelf`,
/// meaning they must be called via execute() — this ensures governance
/// changes are themselves time-locked.
///
/// chainId is included in hashOperation to prevent cross-chain replay of
/// queued operations during forks.
///
/// No external dependencies — hand-rolled to match the codebase style.
contract IntelTimelockController {
    // ─── Errors ──────────────────────────────────────────────────────────

    error Unauthorized();
    error ZeroAddress();
    error ZeroDelay();
    error DelayTooShort(uint256 provided, uint256 minimum);
    error OperationNotQueued(bytes32 id);
    error OperationAlreadyQueued(bytes32 id);
    error OperationNotReady(bytes32 id, uint256 readyAt, uint256 now_);
    error OperationExpired(bytes32 id, uint256 expiredAt, uint256 now_);
    error OperationAlreadyExecuted(bytes32 id);
    error ExecutionFailed(bytes32 id);

    // ─── Events ───────────────────────────────────────────────────────────

    event OperationQueued(
        bytes32 indexed id,
        address indexed target,
        uint256 value,
        bytes   data,
        bytes32 salt,
        uint256 readyAt
    );
    event OperationExecuted(bytes32 indexed id, address indexed target, uint256 value, bytes data);
    event OperationCancelled(bytes32 indexed id);
    event DelayChanged(uint256 oldDelay, uint256 newDelay);
    event ProposerChanged(address indexed proposer, bool approved);
    event AdminChanged(address indexed previousAdmin, address indexed newAdmin);

    // ─── Constants ────────────────────────────────────────────────────────

    /// @notice Minimum enforceable delay.
    /// @dev    Set to 15 minutes for testnet convenience (audit finding P4-T8).
    ///         MAINNET BLOCKER: deploy with `_delay >= 24 hours` and raise this
    ///         constant to `24 hours` before any mainnet deployment.
    ///         The `_delay` constructor param enforces the floor; passing `48 hours`
    ///         (DEFAULT_TIMELOCK_DELAY in Deploy.s.sol) is correct for mainnet.
    uint256 public constant MINIMUM_DELAY = 15 minutes;

    /// @notice Window after readyAt during which execute() is valid.
    ///         After this window the operation expires and must be re-queued.
    uint256 public constant GRACE_PERIOD = 14 days;

    // ─── Storage ──────────────────────────────────────────────────────────

    /// @notice Address with admin power (can cancel, change admin via self)
    address public admin;

    /// @notice Enforced minimum wait between queue and execute
    uint256 public delay;

    /// @notice Approved proposers (can queue and cancel)
    mapping(address => bool) public isProposer;

    /// @notice Operation state: 0 = unknown, 1 = queued, 2 = executed
    ///         Values > 1 are the unix timestamp at which the op becomes ready.
    ///         Bit packing: readyAt is stored directly; 0 = not queued, 1 = executed.
    mapping(bytes32 => uint256) public operationTimestamp;

    // ─── Constructor ──────────────────────────────────────────────────────

    /// @param _admin     Initial admin address
    /// @param _delay     Initial delay in seconds (must be >= MINIMUM_DELAY)
    /// @param _proposers Initial list of proposer addresses
    constructor(address _admin, uint256 _delay, address[] memory _proposers) {
        if (_admin == address(0))  revert ZeroAddress();
        if (_delay == 0)           revert ZeroDelay();
        if (_delay < MINIMUM_DELAY) revert DelayTooShort(_delay, MINIMUM_DELAY);

        admin = _admin;
        delay = _delay;

        for (uint256 i; i < _proposers.length; ++i) {
            if (_proposers[i] != address(0)) {
                isProposer[_proposers[i]] = true;
                emit ProposerChanged(_proposers[i], true);
            }
        }

        emit AdminChanged(address(0), _admin);
        emit DelayChanged(0, _delay);
    }

    // ─── Modifiers ────────────────────────────────────────────────────────

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized();
        _;
    }

    modifier onlyProposer() {
        if (!isProposer[msg.sender] && msg.sender != admin) revert Unauthorized();
        _;
    }

    /// @dev Operations that govern the timelock itself must be self-calls
    ///      so they go through the time-lock queue.
    modifier onlySelf() {
        if (msg.sender != address(this)) revert Unauthorized();
        _;
    }

    // ─── Views ────────────────────────────────────────────────────────────

    /// @notice Deterministic operation id.
    ///         Includes chainid to prevent cross-chain replay after forks.
    function hashOperation(
        address target,
        uint256 value,
        bytes calldata data,
        bytes32 salt
    ) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, target, value, data, salt));
    }

    /// @notice True if the operation has been queued and not yet executed/cancelled.
    function isQueued(bytes32 id) public view returns (bool) {
        uint256 ts = operationTimestamp[id];
        return ts > 1; // 0 = unknown, 1 = executed, >1 = readyAt timestamp
    }

    /// @notice True if the operation is ready to execute (delay elapsed, not expired).
    function isReady(bytes32 id) public view returns (bool) {
        uint256 readyAt = operationTimestamp[id];
        if (readyAt <= 1) return false;
        return block.timestamp >= readyAt && block.timestamp < readyAt + GRACE_PERIOD;
    }

    /// @notice True if the operation has been executed.
    function isExecuted(bytes32 id) public view returns (bool) {
        return operationTimestamp[id] == 1;
    }

    // ─── Proposer actions ─────────────────────────────────────────────────

    /// @notice Queue an operation for delayed execution.
    /// @param target   Contract to call
    /// @param value    ETH to forward
    /// @param data     Calldata to forward
    /// @param salt     Uniqueness salt (use 0 if operation is naturally unique)
    /// @return id      Operation id
    function queue(
        address target,
        uint256 value,
        bytes calldata data,
        bytes32 salt
    ) external onlyProposer returns (bytes32 id) {
        id = hashOperation(target, value, data, salt);

        if (operationTimestamp[id] == 1) revert OperationAlreadyExecuted(id);
        if (operationTimestamp[id] > 1)  revert OperationAlreadyQueued(id);

        uint256 readyAt = block.timestamp + delay;
        operationTimestamp[id] = readyAt;

        emit OperationQueued(id, target, value, data, salt, readyAt);
    }

    /// @notice Cancel a queued operation before it executes.
    ///         Callable by proposers or admin.
    function cancel(bytes32 id) external {
        if (!isProposer[msg.sender] && msg.sender != admin) revert Unauthorized();
        if (!isQueued(id)) revert OperationNotQueued(id);

        delete operationTimestamp[id];

        emit OperationCancelled(id);
    }

    // ─── Execution ────────────────────────────────────────────────────────

    /// @notice Execute a queued operation after delay has elapsed.
    ///         Permissionless — anyone may execute a ready operation.
    /// @return result  Raw bytes returned by the call
    function execute(
        address target,
        uint256 value,
        bytes calldata data,
        bytes32 salt
    ) external payable returns (bytes memory result) {
        bytes32 id = hashOperation(target, value, data, salt);

        uint256 readyAt = operationTimestamp[id];
        if (readyAt <= 1) revert OperationNotQueued(id);
        if (block.timestamp < readyAt)
            revert OperationNotReady(id, readyAt, block.timestamp);
        if (block.timestamp >= readyAt + GRACE_PERIOD)
            revert OperationExpired(id, readyAt + GRACE_PERIOD, block.timestamp);

        // Mark executed before external call (reentrancy safety)
        operationTimestamp[id] = 1;

        bool success;
        (success, result) = target.call{value: value}(data);
        if (!success) revert ExecutionFailed(id);

        emit OperationExecuted(id, target, value, data);
    }

    // ─── Self-governed parameter changes ─────────────────────────────────
    // These must be called via execute() — they are time-locked by design.

    /// @notice Update the minimum delay. Must be called via execute().
    function setDelay(uint256 newDelay) external onlySelf {
        if (newDelay < MINIMUM_DELAY) revert DelayTooShort(newDelay, MINIMUM_DELAY);
        uint256 old = delay;
        delay = newDelay;
        emit DelayChanged(old, newDelay);
    }

    /// @notice Add or remove a proposer. Must be called via execute().
    function setProposer(address proposer, bool approved) external onlySelf {
        if (proposer == address(0)) revert ZeroAddress();
        isProposer[proposer] = approved;
        emit ProposerChanged(proposer, approved);
    }

    /// @notice Transfer admin role. Must be called via execute().
    function setAdmin(address newAdmin) external onlySelf {
        if (newAdmin == address(0)) revert ZeroAddress();
        address old = admin;
        admin = newAdmin;
        emit AdminChanged(old, newAdmin);
    }

    // ─── Admin emergency ─────────────────────────────────────────────────

    /// @notice Admin can cancel any queued operation (emergency use).
    ///         Cancel by admin does NOT require going through the queue.
    function adminCancel(bytes32 id) external onlyAdmin {
        if (!isQueued(id)) revert OperationNotQueued(id);
        delete operationTimestamp[id];
        emit OperationCancelled(id);
    }

    // ─── Receive ETH ─────────────────────────────────────────────────────

    receive() external payable {}
}
