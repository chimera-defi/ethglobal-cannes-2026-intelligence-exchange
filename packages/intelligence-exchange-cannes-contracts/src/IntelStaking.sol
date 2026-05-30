// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @custom:security-contact security@iex.cannes

import {IntelToken} from "./IntelToken.sol";

/// @title IntelStaking
/// @notice Stake INTEL to earn per-epoch mint allowances and staker yield.
///
/// Epoch mint allowance formula:
///   allowancePerEpoch(wallet) = min(k * sqrt(stakedIntel(wallet)), walletCap, globalCapRemaining)
///
/// Anti-mercenary controls:
///   - Cooldown on unstake (default 3 days).
///   - Time-weighted stake used for yield so late joiners don't capture full epoch.
///
/// Yield flow:
///   - The staker yield pool is an accumulated balance on this contract.
///   - Yield is deposited by the MintController (direct mint inflows) and by settlement
///     contracts (9% of accepted tasks).
///   - Yield is claimed pro-rata based on a share model (deposit-time snapshot).
contract IntelStaking {
    // ─── Errors ──────────────────────────────────────────────────────────────

    error Unauthorized();
    error ZeroAmount();
    error ZeroAddress();
    error CooldownActive(uint256 availableAt);
    error NoPendingUnstake();
    error NothingToClaim();
    error EpochNotAdvanceable();
    error AllowanceExceeded(uint256 requested, uint256 remaining);
    error ContractPaused();
    error DepositTooLarge(uint256 amount, uint256 cap);

    // ─── Events ───────────────────────────────────────────────────────────────

    event Staked(address indexed staker, uint256 amount, uint256 newTotal, uint256 epoch);
    event UnstakeRequested(address indexed staker, uint256 amount, uint256 availableAt);
    event Unstaked(address indexed staker, uint256 amount);
    event YieldDeposited(address indexed depositor, uint256 amount, uint256 epoch);
    event YieldClaimed(address indexed staker, uint256 amount, uint256 epoch);
    event EthYieldDeposited(address indexed depositor, uint256 amount, uint256 epoch);
    event EthYieldClaimed(address indexed staker, uint256 amount, uint256 epoch);
    event EpochAdvanced(uint256 indexed epoch, uint256 globalCapRemaining, uint256 totalStaked);
    event OperatorSet(address indexed operator, bool approved);
    event OwnershipTransferStarted(address indexed previous, address indexed next);
    event OwnershipTransferred(address indexed previous, address indexed next);
    event ParamsUpdated(uint256 epochLength, uint256 cooldown, uint256 k, uint256 walletCap, uint256 globalEpochCap);
    event Paused(address indexed by);
    event Unpaused(address indexed by);
    event MaxStakePerDepositChanged(uint256 oldCap, uint256 newCap);

    // ─── Storage ──────────────────────────────────────────────────────────────

    struct StakerInfo {
        uint256 staked;             // Current staked amount
        uint256 stakedAt;           // Timestamp of last stake (for cooldown-free check)
        uint256 pendingUnstake;     // Amount queued for unstake
        uint256 unstakeAvailableAt; // When pending unstake can be withdrawn
        uint256 yieldDebt;          // Tracks claimed portion of INTEL yield (share model)
        uint256 ethYieldDebt;       // Tracks claimed portion of ETH yield (share model)
        uint256 epochAllowanceUsed; // Allowance consumed in current epoch
        uint256 lastEpoch;          // Epoch at which epochAllowanceUsed was reset
    }

    struct EpochSnapshot {
        uint256 totalStaked;        // Total staked at epoch start
        uint256 globalCapRemaining; // Mint cap remaining at epoch start
        uint256 yieldPerShare;      // Cumulative INTEL yield-per-share at epoch end
        uint256 ethYieldPerShare;   // Cumulative ETH yield-per-share at epoch end
        uint256 startTime;
    }

    IntelToken public immutable intel;

    address public owner;
    address public pendingOwner;     // Ownable2Step — nominee must call acceptOwnership()
    mapping(address => bool) public operators;

    // Configurable parameters
    uint256 public epochLength;     // seconds per epoch (default 7 days)
    uint256 public cooldown;        // unstake cooldown in seconds (default 3 days)
    uint256 public k;               // sqrt coefficient scaled by 1e18 (default 1e18 → k=1)
    uint256 public walletCap;       // max allowance per wallet per epoch (in INTEL)
    uint256 public globalEpochCap;  // max global mint allowance per epoch (in INTEL)

    uint256 public currentEpoch;
    uint256 public epochStartTime;

    uint256 public totalStaked;

    // INTEL yield accounting (standard reward-per-share model)
    uint256 public accYieldPerShare;    // accumulated INTEL yield per 1e18 of stake, scaled by 1e36
    uint256 public pendingYieldPool;    // undistributed INTEL yield waiting for epoch snapshot

    // ETH yield accounting (parallel accumulator for ETH routed from MintController)
    uint256 public accEthYieldPerShare; // accumulated ETH yield per 1e18 of stake, scaled by 1e36
    uint256 public pendingEthYieldPool; // undistributed ETH yield buffered until first staker joins

    mapping(address => StakerInfo) public stakers;
    mapping(uint256 => EpochSnapshot) public epochSnapshots;

    // Remaining global cap for the current epoch
    uint256 public globalCapRemaining;

    uint256 private constant PRECISION = 1e36;

    // ─── Circuit breaker + deposit cap (appended to storage layout) ──────────

    /// @notice Whether staking operations are paused. Set by owner in emergencies.
    bool public paused;

    /// @notice Maximum INTEL per single stake() call. 0 = no cap.
    /// @dev Initialised to 100_000e18 (100k INTEL) as a conservative bootstrap value.
    ///      Can only be increased (or set to 0 to remove) by owner.
    uint256 public maxStakePerDeposit;

    // ─── Reentrancy guard ─────────────────────────────────────────────────────

    uint256 private _reentrancyStatus;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    modifier nonReentrant() {
        require(_reentrancyStatus != _ENTERED, "IntelStaking: reentrant call");
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

    modifier whenNotPaused() {
        if (paused) revert ContractPaused();
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    /// @notice Deploy IntelStaking.
    /// @param _intel          Address of the INTEL ERC-20 token.
    /// @param _epochLength    Epoch length in seconds (0 → 7 days default).
    /// @param _cooldown       Unstake cooldown in seconds (0 → 3 days default).
    /// @param _k              Sqrt coefficient scaled by 1e18 (0 → 1e18 default).
    /// @param _walletCap      Max mint allowance per wallet per epoch (in INTEL wei).
    /// @param _globalEpochCap Max global mint allowance per epoch (in INTEL wei).
    constructor(
        address _intel,
        uint256 _epochLength,
        uint256 _cooldown,
        uint256 _k,
        uint256 _walletCap,
        uint256 _globalEpochCap
    ) {
        if (_intel == address(0)) revert ZeroAddress();
        intel = IntelToken(_intel);
        owner = msg.sender;
        epochLength = _epochLength == 0 ? 7 days : _epochLength;
        cooldown = _cooldown == 0 ? 3 days : _cooldown;
        k = _k == 0 ? 1e18 : _k;
        walletCap = _walletCap;
        globalEpochCap = _globalEpochCap;
        currentEpoch = 1;
        epochStartTime = block.timestamp;
        globalCapRemaining = _globalEpochCap;
        _reentrancyStatus = _NOT_ENTERED;
        // Conservative bootstrap cap — prevents single large deposits during launch.
        // Owner can raise this at any time via setMaxStakePerDeposit().
        maxStakePerDeposit = 100_000e18;
    }

    // ─── Staking ──────────────────────────────────────────────────────────────

    /// @notice Stake INTEL tokens. Tokens are transferred from caller.
    /// @dev    Reverts if contract is paused or the deposit exceeds maxStakePerDeposit.
    /// @param  amount INTEL amount to stake (in wei, 18 decimals).
    function stake(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        if (maxStakePerDeposit > 0 && amount > maxStakePerDeposit) {
            revert DepositTooLarge(amount, maxStakePerDeposit);
        }

        _advanceEpochIfNeeded();
        _settleYield(msg.sender);
        _settleEthYield(msg.sender);

        StakerInfo storage s = stakers[msg.sender];
        s.staked += amount;
        s.stakedAt = block.timestamp;
        totalStaked += amount;

        // Sync yield debts to the current accumulators AFTER updating staked.
        // This prevents a new (or returning) staker from claiming yield that
        // accumulated before their stake was added.
        s.yieldDebt    = (s.staked * accYieldPerShare)    / PRECISION;
        s.ethYieldDebt = (s.staked * accEthYieldPerShare) / PRECISION;

        // Pull tokens; IntelToken always returns true or reverts — check anyway for safety
        // Note: IntelToken is a standard OZ ERC20 that reverts on failure.
        // The bool check is defensive; the require ensures execution stops on false return.
        bool stakeOk = intel.transferFrom(msg.sender, address(this), amount);
        require(stakeOk, "IntelStaking: stake transferFrom failed");

        emit Staked(msg.sender, amount, s.staked, currentEpoch);
    }

    /// @notice Request unstake. Begins cooldown; tokens remain locked until cooldown expires.
    /// @dev    Reverts if contract is paused.
    /// @param  amount INTEL amount to queue for unstake.
    function requestUnstake(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();

        _advanceEpochIfNeeded();
        _settleYield(msg.sender);
        _settleEthYield(msg.sender);

        StakerInfo storage s = stakers[msg.sender];
        // staked must cover new request + existing pending
        require(s.staked >= amount, "IntelStaking: insufficient staked");

        s.staked -= amount;
        totalStaked -= amount;
        s.pendingUnstake += amount;
        s.unstakeAvailableAt = block.timestamp + cooldown;

        // Re-sync yield debts to the new (smaller) staked position.
        // Without this, the staker's debt is anchored to the pre-unstake staked amount,
        // causing them to earn zero yield until the accumulator grows by amount/remaining_staked.
        // This mirrors the pattern in stake() where debts are re-synced after staked increases.
        s.yieldDebt    = (s.staked * accYieldPerShare)    / PRECISION;
        s.ethYieldDebt = (s.staked * accEthYieldPerShare) / PRECISION;

        emit UnstakeRequested(msg.sender, amount, s.unstakeAvailableAt);
    }

    /// @notice Withdraw tokens after cooldown expires.
    /// @dev    Reverts if contract is paused, no pending unstake exists, or cooldown is active.
    function unstake() external nonReentrant whenNotPaused {
        StakerInfo storage s = stakers[msg.sender];
        if (s.pendingUnstake == 0) revert NoPendingUnstake();
        if (block.timestamp < s.unstakeAvailableAt) {
            revert CooldownActive(s.unstakeAvailableAt);
        }

        uint256 amount = s.pendingUnstake;
        s.pendingUnstake = 0;
        s.unstakeAvailableAt = 0;

        // Note: IntelToken is a standard OZ ERC20 that reverts on failure.
        // The bool check is defensive; the require ensures execution stops on false return.
        bool unstakeOk = intel.transfer(msg.sender, amount);
        require(unstakeOk, "IntelStaking: unstake transfer failed");

        emit Unstaked(msg.sender, amount);
    }

    // ─── Yield ────────────────────────────────────────────────────────────────

    /// @notice Deposit yield into the pool. Called by MintController and settlement contracts.
    /// @dev    Caller must have approved this contract to transfer `amount` of INTEL.
    /// @custom:access operator only
    /// @param  amount INTEL yield amount to deposit (in wei).
    function depositYield(uint256 amount) external onlyOperator nonReentrant {
        if (amount == 0) revert ZeroAmount();
        // Note: IntelToken is a standard OZ ERC20 that reverts on failure.
        // The bool check is defensive; the require ensures execution stops on false return.
        bool yieldOk = intel.transferFrom(msg.sender, address(this), amount);
        require(yieldOk, "IntelStaking: depositYield transferFrom failed");

        if (totalStaked > 0) {
            // Distribute immediately to current stakers
            require(accYieldPerShare + (amount * PRECISION) / totalStaked <= type(uint128).max, 'accumulator overflow');
            accYieldPerShare += (amount * PRECISION) / totalStaked;
        } else {
            // No stakers yet — buffer for next distribution
            pendingYieldPool += amount;
        }

        emit YieldDeposited(msg.sender, amount, currentEpoch);
    }

    /// @notice Claim accrued INTEL yield.
    /// @dev    Reverts if contract is paused or there is nothing to claim.
    /// @return claimed INTEL amount transferred to caller.
    function claimYield() external nonReentrant whenNotPaused returns (uint256 claimed) {
        _advanceEpochIfNeeded();
        claimed = _settleYield(msg.sender);
        if (claimed == 0) revert NothingToClaim();
        emit YieldClaimed(msg.sender, claimed, currentEpoch);
    }

    /// @notice Deposit ETH yield into the pool. Called by IntelMintController (ETH mint path).
    ///         ETH is distributed pro-rata to current stakers via the accEthYieldPerShare model.
    /// @custom:access operator only
    function depositEthYield() external payable onlyOperator {
        if (msg.value == 0) revert ZeroAmount();
        _handleEthYieldDeposit(msg.value);
        emit EthYieldDeposited(msg.sender, msg.value, currentEpoch);
    }

    /// @notice Claim accrued ETH yield.
    /// @dev    Reverts if contract is paused or there is nothing to claim.
    /// @return claimed ETH amount (in wei) transferred to caller.
    function claimEthYield() external nonReentrant whenNotPaused returns (uint256 claimed) {
        _advanceEpochIfNeeded();
        claimed = _settleEthYield(msg.sender);
        if (claimed == 0) revert NothingToClaim();
        emit EthYieldClaimed(msg.sender, claimed, currentEpoch);
    }

    /// @notice Pending ETH yield claimable by a staker right now (view-only).
    /// @param  wallet Address to query.
    /// @return Claimable ETH yield in wei.
    function pendingEthYield(address wallet) external view returns (uint256) {
        StakerInfo storage s = stakers[wallet];
        if (s.staked == 0) return 0;
        uint256 accumulated = (s.staked * accEthYieldPerShare) / PRECISION;
        if (accumulated <= s.ethYieldDebt) return 0;
        return accumulated - s.ethYieldDebt;
    }

    // ─── Epoch & Allowance ────────────────────────────────────────────────────

    /// @notice Advance epoch if enough time has passed.
    /// @dev    Reverts with EpochNotAdvanceable if epochLength has not elapsed.
    function advanceEpoch() external {
        if (!_canAdvanceEpoch()) revert EpochNotAdvanceable();
        _advanceEpoch();
    }

    /// @notice Returns the caller's mint allowance for the current epoch.
    /// @param  wallet Address to query.
    /// @return Remaining mint allowance for the epoch (in INTEL wei).
    function mintAllowance(address wallet) external view returns (uint256) {
        return _mintAllowance(wallet);
    }

    /// @notice Called by MintController to consume allowance when minting.
    /// @custom:access operator or owner
    /// @param wallet  Address whose allowance is consumed.
    /// @param amount  Amount to consume.
    function consumeAllowance(address wallet, uint256 amount) external onlyOperator {
        _refreshEpochAllowance(wallet);
        uint256 avail = _mintAllowance(wallet);
        if (amount > avail) revert AllowanceExceeded(amount, avail);
        stakers[wallet].epochAllowanceUsed += amount;
        if (globalCapRemaining >= amount) {
            globalCapRemaining -= amount;
        } else {
            globalCapRemaining = 0;
        }
    }

    // ─── View ─────────────────────────────────────────────────────────────────

    /// @notice Pending yield claimable by a staker right now (view-only).
    /// @param  wallet Address to query.
    /// @return Claimable INTEL yield in wei.
    function pendingYield(address wallet) external view returns (uint256) {
        StakerInfo storage s = stakers[wallet];
        if (s.staked == 0) return 0;
        uint256 accumulated = (s.staked * accYieldPerShare) / PRECISION;
        if (accumulated <= s.yieldDebt) return 0;
        return accumulated - s.yieldDebt;
    }

    /// @notice Current epoch number.
    /// @return Current epoch counter starting at 1.
    function epoch() external view returns (uint256) {
        return currentEpoch;
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    /// @notice Approve or revoke an operator address.
    /// @custom:access owner
    /// @param op       Address to configure.
    /// @param approved True to grant operator rights, false to revoke.
    function setOperator(address op, bool approved) external onlyOwner {
        if (op == address(0)) revert ZeroAddress();
        operators[op] = approved;
        emit OperatorSet(op, approved);
    }

    /// @notice Update staking parameters.
    /// @custom:access owner
    /// @dev globalCapRemaining is NOT reset here — the new globalEpochCap takes effect at
    ///      the next _advanceEpoch() boundary. This prevents bypassing the current-epoch
    ///      mint cap via a mid-epoch setParams() call (audit H4 fix).
    /// @param _epochLength  New epoch length in seconds.
    /// @param _cooldown     New unstake cooldown in seconds.
    /// @param _k            New sqrt coefficient (1e18 scale).
    /// @param _walletCap    New per-wallet mint allowance cap per epoch.
    /// @param _globalEpochCap New global mint allowance cap per epoch.
    function setParams(
        uint256 _epochLength,
        uint256 _cooldown,
        uint256 _k,
        uint256 _walletCap,
        uint256 _globalEpochCap
    ) external onlyOwner {
        epochLength = _epochLength;
        cooldown = _cooldown;
        k = _k;
        walletCap = _walletCap;
        globalEpochCap = _globalEpochCap;
        // globalCapRemaining intentionally not reset — takes effect at next epoch boundary
        emit ParamsUpdated(_epochLength, _cooldown, _k, _walletCap, _globalEpochCap);
    }

    /// @notice Pause all staking operations. Emergency circuit breaker.
    /// @custom:access owner
    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    /// @notice Unpause staking operations.
    /// @custom:access owner
    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    /// @notice Set the maximum INTEL allowed per single stake() call.
    /// @custom:access owner
    /// @dev    Can only be increased (or set to 0 to remove cap entirely).
    ///         Prevents the owner from accidentally locking current stakers
    ///         by decreasing the cap below an already-applied level.
    /// @param  newCap New cap in INTEL wei. 0 = no cap.
    function setMaxStakePerDeposit(uint256 newCap) external onlyOwner {
        require(newCap == 0 || newCap >= maxStakePerDeposit, "CannotDecreaseCap");
        emit MaxStakePerDepositChanged(maxStakePerDeposit, newCap);
        maxStakePerDeposit = newCap;
    }

    /// @notice Begin ownership transfer. Nominee must call acceptOwnership().
    /// @custom:access owner
    /// @dev    Two-step prevents irrecoverable ownership loss from a typo.
    /// @param  newOwner Nominee address.
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    /// @notice Nominee accepts ownership to complete the two-step transfer.
    /// @custom:access pendingOwner
    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert Unauthorized();
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = address(0);
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    /// @dev Settle pending yield for a staker and return the claimed amount.
    ///      yieldDebt is initialized/synced in stake() after staked is updated,
    ///      so this branch just early-returns when there is nothing staked.
    function _settleYield(address wallet) internal returns (uint256 claimed) {
        StakerInfo storage s = stakers[wallet];
        if (s.staked == 0) {
            return 0;
        }
        uint256 accumulated = (s.staked * accYieldPerShare) / PRECISION;
        if (accumulated > s.yieldDebt) {
            claimed = accumulated - s.yieldDebt;
            s.yieldDebt = accumulated;
            bool claimOk = intel.transfer(wallet, claimed);
            require(claimOk, "IntelStaking: yield transfer failed");
        }
    }

    function _mintAllowance(address wallet) internal view returns (uint256) {
        StakerInfo storage s = stakers[wallet];
        uint256 epochUsed = (s.lastEpoch == currentEpoch) ? s.epochAllowanceUsed : 0;

        // k * sqrt(stakedIntel) — k is scaled by 1e18, stakedIntel in wei (1e18 per token)
        // sqrt returns result in same units as input; we want allowance in token units
        uint256 rawAllowance = (k * _sqrt(s.staked)) / 1e18;

        // Apply walletCap
        if (walletCap > 0 && rawAllowance > walletCap) {
            rawAllowance = walletCap;
        }
        // Apply globalCapRemaining
        if (globalEpochCap > 0 && rawAllowance > globalCapRemaining) {
            rawAllowance = globalCapRemaining;
        }
        // Subtract what's already been used this epoch
        if (epochUsed >= rawAllowance) return 0;
        return rawAllowance - epochUsed;
    }

    /// @dev Reset the staker's epoch allowance tracking if we're in a new epoch.
    function _refreshEpochAllowance(address wallet) internal {
        StakerInfo storage s = stakers[wallet];
        if (s.lastEpoch != currentEpoch) {
            s.epochAllowanceUsed = 0;
            s.lastEpoch = currentEpoch;
        }
    }

    function _canAdvanceEpoch() internal view returns (bool) {
        return block.timestamp >= epochStartTime + epochLength;
    }

    function _advanceEpochIfNeeded() internal {
        if (_canAdvanceEpoch()) {
            _advanceEpoch();
        }
    }

    function _advanceEpoch() internal {
        // Flush pending INTEL yield pool into accYieldPerShare
        if (pendingYieldPool > 0 && totalStaked > 0) {
            accYieldPerShare += (pendingYieldPool * PRECISION) / totalStaked;
            pendingYieldPool = 0;
        }
        // Flush pending ETH yield pool into accEthYieldPerShare
        if (pendingEthYieldPool > 0 && totalStaked > 0) {
            accEthYieldPerShare += (pendingEthYieldPool * PRECISION) / totalStaked;
            pendingEthYieldPool = 0;
        }

        epochSnapshots[currentEpoch] = EpochSnapshot({
            totalStaked: totalStaked,
            globalCapRemaining: globalCapRemaining,
            yieldPerShare: accYieldPerShare,
            ethYieldPerShare: accEthYieldPerShare,
            startTime: epochStartTime
        });

        currentEpoch++;
        epochStartTime = block.timestamp;
        globalCapRemaining = globalEpochCap; // reset cap for new epoch

        emit EpochAdvanced(currentEpoch, globalCapRemaining, totalStaked);
    }

    /// @notice Accept ETH via receive() — treated as ETH yield deposit.
    ///         Primary path is depositEthYield(); receive() handles any bare ETH sends.
    receive() external payable {
        if (msg.value > 0) {
            _handleEthYieldDeposit(msg.value);
            emit EthYieldDeposited(msg.sender, msg.value, currentEpoch);
        }
    }

    /// @dev Shared ETH yield deposit logic — updates accEthYieldPerShare or buffers to pool.
    function _handleEthYieldDeposit(uint256 amount) internal {
        if (totalStaked > 0) {
            accEthYieldPerShare += (amount * PRECISION) / totalStaked;
        } else {
            pendingEthYieldPool += amount;
        }
    }

    /// @dev Settle and transfer pending ETH yield for a staker. Returns amount transferred.
    function _settleEthYield(address wallet) internal returns (uint256 claimed) {
        StakerInfo storage s = stakers[wallet];
        if (s.staked == 0) return 0;
        uint256 accumulated = (s.staked * accEthYieldPerShare) / PRECISION;
        if (accumulated > s.ethYieldDebt) {
            claimed = accumulated - s.ethYieldDebt;
            s.ethYieldDebt = accumulated;
            (bool ok,) = wallet.call{value: claimed}("");
            require(ok, "IntelStaking: ETH yield transfer failed");
        }
    }

    /// @dev Integer square root (Babylonian method). Input and output in same units.
    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }
}
