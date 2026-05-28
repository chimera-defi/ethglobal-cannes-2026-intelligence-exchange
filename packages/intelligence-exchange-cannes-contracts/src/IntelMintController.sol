// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @custom:security-contact security@iex.cannes

import {IntelToken} from "./IntelToken.sol";
import {IntelStaking} from "./IntelStaking.sol";
import {IUniswapV3Pool} from "./interfaces/IUniswapV3.sol";

/// @title IntelMintController
/// @notice Anti-reflexivity mint pricing with direct inflow routing.
///
/// Mint price formula:
///   mintPrice = max(TWAP * (1 + premium), floorPrice) * utilizationMultiplier
///
/// utilizationMultiplier = pendingTaskVolume / settledCapacity  (fed by oracle/operator)
/// When demand surges → utilization rises → mint gets more expensive → brakes reflexive loop.
///
/// Direct mint inflow routing (per spec):
///   50% → POL address   (protocol-owned liquidity)
///   45% → staker yield  (deposited into IntelStaking)
///    5% → treasury
///
/// Access:
///   - executeMint: only whitelisted operators (B2B / programmatic)
///   - selfMint:    any wallet with sufficient staking allowance (end-user)
///   - price updates: only operators or owner
///   - config: only owner (Ownable2Step — two-step transfer prevents key loss)
contract IntelMintController {
    // ─── Errors ──────────────────────────────────────────────────────────────

    error Unauthorized();
    error ZeroAddress();
    error ZeroAmount();
    error InvalidParam();
    error PriceTooLow(uint256 paid, uint256 required);
    error AllowanceInsufficient(address wallet, uint256 requested, uint256 remaining);
    error SlippageExceeded(uint256 price, uint256 maxPrice);
    error MintingPaused();
    error EpochMintCapExceeded(uint256 requested, uint256 remaining);

    // ─── Events ───────────────────────────────────────────────────────────────

    event MintExecuted(
        address indexed to,
        uint256 intelMinted,
        uint256 pricePaid,
        uint256 polShare,
        uint256 stakerShare,
        uint256 treasuryShare,
        uint256 epoch
    );
    event TWAPUpdated(uint256 newTWAP, uint256 updatedAt);
    event UtilizationUpdated(uint256 pendingVolume, uint256 settledCapacity, uint256 multiplierBps);
    event FloorPriceSet(uint256 floorPrice);
    event PremiumSet(uint256 premiumBps);
    event OperatorSet(address indexed op, bool approved);
    event OwnershipTransferStarted(address indexed previous, address indexed next);
    event OwnershipTransferred(address indexed previous, address indexed next);
    event RoutingAddressesUpdated(address pol, address treasury);
    event MintPaused(address indexed by);
    event MintUnpaused(address indexed by);
    event EpochMintCapChanged(uint256 oldCap, uint256 newCap);

    // ─── Storage ──────────────────────────────────────────────────────────────

    IntelToken public immutable intel;
    IntelStaking public immutable staking;

    address public owner;
    address public pendingOwner;       // Ownable2Step — nominee must call acceptOwnership()
    mapping(address => bool) public operators;

    // Routing addresses (receive ETH/USDC/INTEL depending on payment token)
    address public polAddress;         // POL: 50% of mint proceeds
    address public treasuryAddress;    // Treasury: 5% of mint proceeds

    // Price parameters (all in payment token units — treated as ETH wei for simplicity)
    uint256 public twap;               // TWAP price of INTEL in payment token units (per 1e18 INTEL)
    uint256 public twapUpdatedAt;
    uint256 public floorPrice;         // Minimum price regardless of TWAP
    uint256 public premiumBps;         // Premium in BPS above TWAP (e.g. 500 = 5%)

    // Utilization: set by operator after each epoch settlement
    // multiplierBps: 10000 = 1x, 15000 = 1.5x, etc.
    uint256 public utilizationMultiplierBps;
    uint256 public pendingTaskVolume;
    uint256 public settledCapacity;

    uint256 public constant BPS          = 10_000;
    uint256 public constant POL_BPS      = 5_000; // 50%
    uint256 public constant STAKER_BPS   = 4_500; // 45%
    uint256 public constant TREASURY_BPS =   500; // 5%

    // ─── Circuit breaker + per-epoch global mint cap (appended to storage) ───

    /// @notice Whether minting is paused. Set by owner in emergencies.
    bool public mintPaused;

    /// @notice Maximum INTEL mintable globally per epoch. 0 = no cap.
    /// @dev    Initialised to 500_000e18 (500k INTEL per epoch) as a conservative
    ///         bootstrap value. Can only be increased (or set to 0) by owner.
    uint256 public epochMintCap;

    /// @notice INTEL minted in the current epoch (reset each epoch automatically).
    uint256 public epochMinted;

    /// @notice The staking epoch number when epochMinted was last reset.
    uint256 public lastCapEpoch;

    // ─── Reentrancy guard ─────────────────────────────────────────────────────

    uint256 private _reentrancyStatus;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED     = 2;

    modifier nonReentrant() {
        require(_reentrancyStatus != _ENTERED, "IntelMintController: reentrant call");
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

    /// @notice Deploy IntelMintController.
    /// @param _intel           INTEL token address (non-zero).
    /// @param _staking         IntelStaking address (non-zero).
    /// @param _polAddress      POL treasury address — receives 50% of mint proceeds.
    /// @param _treasuryAddress Treasury address — receives 5% of mint proceeds.
    /// @param _floorPrice      Minimum mint price in payment units per 1e18 INTEL.
    /// @param _premiumBps      Premium in BPS on top of TWAP (e.g. 500 = 5%).
    /// @param _initialTWAP     Initial TWAP in payment units per 1e18 INTEL.
    constructor(
        address _intel,
        address _staking,
        address _polAddress,
        address _treasuryAddress,
        uint256 _floorPrice,
        uint256 _premiumBps,
        uint256 _initialTWAP
    ) {
        if (_intel == address(0)) revert ZeroAddress();
        if (_staking == address(0)) revert ZeroAddress();
        if (_polAddress == address(0)) revert ZeroAddress();
        if (_treasuryAddress == address(0)) revert ZeroAddress();

        intel = IntelToken(_intel);
        staking = IntelStaking(payable(_staking));
        owner = msg.sender;
        polAddress = _polAddress;
        treasuryAddress = _treasuryAddress;
        floorPrice = _floorPrice;
        premiumBps = _premiumBps;
        twap = _initialTWAP;
        twapUpdatedAt = block.timestamp;
        utilizationMultiplierBps = BPS; // default 1x
        _reentrancyStatus = _NOT_ENTERED;
        // Conservative bootstrap cap — 500k INTEL per epoch.
        // Owner can raise this at any time via setEpochMintCap().
        epochMintCap = 500_000e18;
        lastCapEpoch = staking.epoch();
    }

    // ─── Price View ───────────────────────────────────────────────────────────

    /// @notice Current mint price per 1e18 INTEL in payment units.
    /// @dev    mintPrice = max(TWAP * (1 + premium), floorPrice) * utilizationMultiplier
    /// @return Current mint price in payment token wei per 1e18 INTEL.
    function mintPrice() public view returns (uint256) {
        uint256 twapWithPremium = (twap * (BPS + premiumBps)) / BPS;
        uint256 base = twapWithPremium > floorPrice ? twapWithPremium : floorPrice;
        return (base * utilizationMultiplierBps) / BPS;
    }

    /// @notice Cost in payment units to mint `intelAmount` (in wei, i.e. 18 decimals).
    /// @param  intelAmount INTEL to mint in wei.
    /// @return cost        ETH cost in wei.
    function quoteMint(uint256 intelAmount) external view returns (uint256 cost) {
        cost = (mintPrice() * intelAmount) / 1e18;
    }

    // ─── Mint (ETH path) ──────────────────────────────────────────────────────

    /// @notice Operator-gated mint on behalf of `to`.
    ///         Payment in ETH (msg.value). Excess refunded.
    /// @custom:access operator or owner
    /// @param to           Recipient of minted INTEL (must hold staking allowance).
    /// @param intelAmount  Amount of INTEL to mint (1e18 units).
    /// @param maxPrice     Slippage guard — reverts if mintPrice() > maxPrice.
    function executeMint(address to, uint256 intelAmount, uint256 maxPrice)
        external payable onlyOperator nonReentrant
    {
        if (to == address(0)) revert ZeroAddress();
        if (intelAmount == 0) revert ZeroAmount();
        _doMint(to, intelAmount, maxPrice);
    }

    /// @notice Self-mint: any wallet with sufficient staking allowance.
    ///         No operator whitelist required. Payment in ETH. Excess refunded.
    /// @param intelAmount  Amount of INTEL to mint (1e18 units).
    /// @param maxPrice     Slippage guard — reverts if mintPrice() > maxPrice.
    function selfMint(uint256 intelAmount, uint256 maxPrice)
        external payable nonReentrant
    {
        if (intelAmount == 0) revert ZeroAmount();
        _doMint(msg.sender, intelAmount, maxPrice);
    }

    /// @notice Alternative: operator mints with ERC-20 payment token.
    ///         Proceeds routed in paymentToken.
    ///         Staker share goes to POL address for later swap to INTEL and depositYield().
    /// @custom:access operator or owner
    /// @param to            Recipient.
    /// @param intelAmount   INTEL to mint (1e18 units).
    /// @param paymentToken  ERC-20 used for payment. Pulled from `to` via transferFrom.
    /// @param paymentAmount Exact amount in paymentToken units (must be >= quoteMint).
    /// @param maxPrice      Slippage guard.
    function executeMintERC20(
        address to,
        uint256 intelAmount,
        address paymentToken,
        uint256 paymentAmount,
        uint256 maxPrice
    ) external onlyOperator nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (intelAmount == 0) revert ZeroAmount();
        if (paymentToken == address(0)) revert ZeroAddress();
        if (mintPaused) revert MintingPaused();

        uint256 price = mintPrice();
        if (price > maxPrice) revert SlippageExceeded(price, maxPrice);

        uint256 required = (price * intelAmount) / 1e18;
        if (paymentAmount < required) revert PriceTooLow(paymentAmount, required);

        uint256 allowanceLeft = staking.mintAllowance(to);
        if (intelAmount > allowanceLeft) {
            revert AllowanceInsufficient(to, intelAmount, allowanceLeft);
        }
        staking.consumeAllowance(to, intelAmount);

        // Enforce per-epoch global mint cap
        _checkAndUpdateEpochMinted(intelAmount);

        _transferFrom(paymentToken, to, address(this), required);
        intel.mint(to, intelAmount);

        uint256 polShare      = (required * POL_BPS)      / BPS;
        uint256 stakerShare   = (required * STAKER_BPS)   / BPS;
        uint256 treasuryShare = required - polShare - stakerShare;

        _transfer(paymentToken, polAddress, polShare);
        _transfer(paymentToken, treasuryAddress, treasuryShare);
        // Staker share → POL address for later swap to INTEL and depositYield()
        _transfer(paymentToken, polAddress, stakerShare);

        emit MintExecuted(to, intelAmount, required, polShare, stakerShare, treasuryShare, staking.epoch());
    }

    // ─── Oracle / Operator Updates ────────────────────────────────────────────

    /// @notice Update TWAP. Called by operator after each oracle observation.
    ///         Bootstrap method for before pool exists.
    ///         Manual fallback override — use pullTWAP() for automated oracle updates.
    /// @custom:access operator or owner
    /// @param  newTWAP New TWAP value in payment units per 1e18 INTEL (must be > 0).
    function updateTWAP(uint256 newTWAP) external onlyOperator {
        if (newTWAP == 0) revert ZeroAmount();
        twap = newTWAP;
        twapUpdatedAt = block.timestamp;
        emit TWAPUpdated(newTWAP, block.timestamp);
    }

    /// @notice Pull TWAP from a Uniswap V3 pool and update the stored twap.
    ///         Operator-gated — automated oracle update from Uniswap V3 pool.
    /// @param  pool        IUniswapV3Pool address (INTEL/WETH 0.3% pool)
    /// @param  twapPeriod  Observation window in seconds (recommended: 1800 = 30 min)
    /// @param  intelIsToken0  True if INTEL address < WETH address on this pool
    function pullTWAP(address pool, uint32 twapPeriod, bool intelIsToken0) external onlyOperator {
        if (pool == address(0)) revert ZeroAddress();
        if (twapPeriod < 60) revert InvalidParam();

        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = twapPeriod;
        secondsAgos[1] = 0;

        (int56[] memory tickCumulatives,) = IUniswapV3Pool(pool).observe(secondsAgos);

        // Average tick over the window
        int56 delta = tickCumulatives[1] - tickCumulatives[0];
        int24 avgTick = int24(delta / int56(int32(twapPeriod)));

        // Convert tick to price (ETH per 1e18 INTEL, scaled to 1e18)
        uint256 price = _tickToPrice(avgTick, intelIsToken0);

        // Enforce floor — never drop below floorPrice
        if (price < floorPrice) price = floorPrice;

        twap = price;
        twapUpdatedAt = block.timestamp;
        emit TWAPUpdated(price, block.timestamp);
    }

    /// @dev Convert Uniswap V3 tick to ETH-per-INTEL price scaled to 1e18.
    ///      Uses the identity: sqrtPrice = 1.0001^(tick/2)
    ///      price = sqrtPrice^2 = 1.0001^tick
    function _tickToPrice(int24 tick, bool intelIsToken0) internal pure returns (uint256 price) {
        // For tick = 0, price is exactly 1e18 (1.0001^0 = 1)
        if (tick == 0) return 1e18;

        bool negative = tick < 0;
        uint256 absTick = uint256(int256(negative ? -int256(int24(tick)) : int256(int24(tick))));

        // sqrtRatio starts at 1.0 in Q128.128 format (= 2^128)
        uint256 ratio = 0x100000000000000000000000000000000;

        // Uniswap V3 precomputed magic numbers (from TickMath.sol)
        if (absTick & 0x1  != 0) ratio = (ratio * 0xfffcb933bd6fad37aa2d162d1a594001) >> 128;
        if (absTick & 0x2  != 0) ratio = (ratio * 0xfff97272373d413259a46990580e213a) >> 128;
        if (absTick & 0x4  != 0) ratio = (ratio * 0xfff2e50f5f656932ef12357cf3c7fdcc) >> 128;
        if (absTick & 0x8  != 0) ratio = (ratio * 0xffe5caca7e10e4e61c3624eaa0941cd0) >> 128;
        if (absTick & 0x10 != 0) ratio = (ratio * 0xffcb9843d60f6159c9db58835c926644) >> 128;
        if (absTick & 0x20 != 0) ratio = (ratio * 0xff973b41fa98c081472e6896dfb254c0) >> 128;
        if (absTick & 0x40 != 0) ratio = (ratio * 0xff2ea16466c96a3843ec78b326b52861) >> 128;
        if (absTick & 0x80 != 0) ratio = (ratio * 0xfe5dee046a99a2a811c461f1969c3053) >> 128;
        if (absTick & 0x100 != 0) ratio = (ratio * 0xfcbe86c7900a88aedcffc83b479aa3a4) >> 128;
        if (absTick & 0x200 != 0) ratio = (ratio * 0xf987a7253ac413176f2b074cf7815e54) >> 128;
        if (absTick & 0x400 != 0) ratio = (ratio * 0xf3392b0822b70005940c7a398e4b70f3) >> 128;
        if (absTick & 0x800 != 0) ratio = (ratio * 0xe7159475a2c29b7443b29c7fa6e889d9) >> 128;
        if (absTick & 0x1000 != 0) ratio = (ratio * 0xd097f3bdfd2022b8845ad8f792aa5825) >> 128;
        if (absTick & 0x2000 != 0) ratio = (ratio * 0xa9f746462d870fdf8a65dc1f90e061e5) >> 128;
        if (absTick & 0x4000 != 0) ratio = (ratio * 0x70d869a156d2a1b890bb3df62baf32f7) >> 128;
        if (absTick & 0x8000 != 0) ratio = (ratio * 0x31be135f97d08fd981231505542fcfa6) >> 128;
        if (absTick & 0x10000 != 0) ratio = (ratio * 0x9aa508b5b7a84e1c677de54f3e99bc9) >> 128;
        if (absTick & 0x20000 != 0) ratio = (ratio * 0x5d6af8dedb81196699c329225ee604) >> 128;
        if (absTick & 0x40000 != 0) ratio = (ratio * 0x2216e584f5fa1ea926041bedfe98) >> 128;
        if (absTick & 0x80000 != 0) ratio = (ratio * 0x48a170391f7dc42444e8fa2) >> 128;

        if (!negative) ratio = type(uint256).max / ratio;

        // sqrtRatioX96 is ratio shifted right by 32 bits
        uint160 sqrtRatioX96 = uint160((ratio >> 32) + (ratio % (1 << 32) == 0 ? 0 : 1));

        // price = sqrtRatioX96^2 / 2^192, scaled to 1e18
        uint256 sq = uint256(sqrtRatioX96) * uint256(sqrtRatioX96);
        price = ((sq >> 128) * 1e18) >> 64;

        // If INTEL is token1, price is INTEL-per-ETH, so invert to ETH-per-INTEL
        if (!intelIsToken0) {
            price = (1e18 * 1e18) / price;
        }
    }

    /// @notice Update utilization metrics and recalculate multiplier.
    ///
    /// utilizationMultiplierBps = pendingVolume * BPS / settledCapacity
    /// Clamped to [1x, 3x] to prevent runaway pricing.
    /// @custom:access operator or owner
    /// @param _pendingVolume   Pending task volume in INTEL units.
    /// @param _settledCapacity Settled task capacity in INTEL units.
    function updateUtilization(uint256 _pendingVolume, uint256 _settledCapacity) external onlyOperator {
        pendingTaskVolume = _pendingVolume;
        settledCapacity = _settledCapacity;

        uint256 multiplier;
        if (_settledCapacity == 0 || _pendingVolume == 0) {
            multiplier = BPS;
        } else {
            multiplier = (_pendingVolume * BPS) / _settledCapacity;
            if (multiplier < BPS) multiplier = BPS;
            if (multiplier > 3 * BPS) multiplier = 3 * BPS;
        }

        utilizationMultiplierBps = multiplier;
        emit UtilizationUpdated(_pendingVolume, _settledCapacity, multiplier);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    /// @notice Set the floor price for minting.
    /// @custom:access owner
    /// @param  _floorPrice New floor price in payment units per 1e18 INTEL.
    function setFloorPrice(uint256 _floorPrice) external onlyOwner {
        floorPrice = _floorPrice;
        emit FloorPriceSet(_floorPrice);
    }

    /// @notice Set the TWAP premium.
    /// @custom:access owner
    /// @param  _premiumBps New premium in BPS (e.g. 500 = 5%).
    function setPremium(uint256 _premiumBps) external onlyOwner {
        premiumBps = _premiumBps;
        emit PremiumSet(_premiumBps);
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

    /// @notice Update the POL and treasury routing addresses.
    /// @custom:access owner
    /// @param _pol      New POL address (non-zero).
    /// @param _treasury New treasury address (non-zero).
    function setRoutingAddresses(address _pol, address _treasury) external onlyOwner {
        if (_pol == address(0) || _treasury == address(0)) revert ZeroAddress();
        polAddress = _pol;
        treasuryAddress = _treasury;
        emit RoutingAddressesUpdated(_pol, _treasury);
    }

    /// @notice Pause all minting operations. Emergency circuit breaker.
    /// @custom:access owner
    function pauseMinting() external onlyOwner {
        mintPaused = true;
        emit MintPaused(msg.sender);
    }

    /// @notice Unpause minting operations.
    /// @custom:access owner
    function unpauseMinting() external onlyOwner {
        mintPaused = false;
        emit MintUnpaused(msg.sender);
    }

    /// @notice Set the per-epoch global mint cap.
    /// @custom:access owner
    /// @dev    Cap can only be increased (set to 0 to disable).
    ///         Prevents owner from cutting off existing epoch budgets mid-flight.
    /// @param  newCap New cap in INTEL wei per epoch. 0 = no cap.
    function setEpochMintCap(uint256 newCap) external onlyOwner {
        require(newCap == 0 || newCap >= epochMintCap, "CannotDecreaseCap");
        emit EpochMintCapChanged(epochMintCap, newCap);
        epochMintCap = newCap;
    }

    // ─── Ownable2Step ─────────────────────────────────────────────────────────

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

    /// @notice Recover ETH accidentally sent to this contract.
    /// @custom:access owner
    /// @param  to Recipient address (non-zero).
    function sweepETH(address to) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        uint256 bal = address(this).balance;
        if (bal == 0) revert ZeroAmount();
        _sendEth(to, bal);
    }

    // ─── Internal helpers ─────────────────────────────────────────────────────

    /// @dev Shared ETH-path mint logic used by both executeMint and selfMint.
    ///      Caller is responsible for the zero-checks on `to` and `intelAmount`
    ///      and for any access-control modifiers.
    function _doMint(address to, uint256 intelAmount, uint256 maxPrice) internal {
        if (mintPaused) revert MintingPaused();

        uint256 price = mintPrice();
        if (price > maxPrice) revert SlippageExceeded(price, maxPrice);

        uint256 required = (price * intelAmount) / 1e18;
        if (msg.value < required) revert PriceTooLow(msg.value, required);

        uint256 allowanceLeft = staking.mintAllowance(to);
        if (intelAmount > allowanceLeft) {
            revert AllowanceInsufficient(to, intelAmount, allowanceLeft);
        }
        staking.consumeAllowance(to, intelAmount);

        // Enforce per-epoch global mint cap (reset when epoch advances)
        _checkAndUpdateEpochMinted(intelAmount);

        intel.mint(to, intelAmount);

        uint256 polShare      = (required * POL_BPS)      / BPS;
        uint256 stakerShare   = (required * STAKER_BPS)   / BPS;
        uint256 treasuryShare = required - polShare - stakerShare;

        _sendEth(polAddress, polShare);
        _sendEth(treasuryAddress, treasuryShare);
        staking.depositEthYield{value: stakerShare}();

        uint256 excess = msg.value - required;
        if (excess > 0) _sendEth(msg.sender, excess);

        emit MintExecuted(to, intelAmount, required, polShare, stakerShare, treasuryShare, staking.epoch());
    }

    /// @dev Check and update the epoch-level mint cap. Resets counter when the staking epoch advances.
    function _checkAndUpdateEpochMinted(uint256 intelAmount) internal {
        uint256 currentEpoch = staking.epoch();
        if (currentEpoch > lastCapEpoch) {
            epochMinted = 0;
            lastCapEpoch = currentEpoch;
        }
        if (epochMintCap > 0 && epochMinted + intelAmount > epochMintCap) {
            revert EpochMintCapExceeded(intelAmount, epochMintCap - epochMinted);
        }
        epochMinted += intelAmount;
    }

    function _sendEth(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok,) = to.call{value: amount}("");
        require(ok, "IntelMintController: ETH transfer failed");
    }

    function _transferFrom(address token, address from, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSignature("transferFrom(address,address,uint256)", from, to, amount)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "IntelMintController: transferFrom failed");
    }

    function _transfer(address token, address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSignature("transfer(address,uint256)", to, amount)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "IntelMintController: transfer failed");
    }

    receive() external payable {}
}
