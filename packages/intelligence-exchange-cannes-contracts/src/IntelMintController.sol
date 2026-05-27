// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IntelToken} from "./IntelToken.sol";
import {IntelStaking} from "./IntelStaking.sol";

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
///   - executeMint: only whitelisted operators
///   - price updates: only operators or owner
///   - config: only owner
contract IntelMintController {
    // ─── Errors ──────────────────────────────────────────────────────────────

    error Unauthorized();
    error ZeroAddress();
    error ZeroAmount();
    error PriceTooLow(uint256 paid, uint256 required);
    error AllowanceInsufficient(address wallet, uint256 requested, uint256 remaining);
    error MaxSupplyExceeded();
    error SlippageExceeded(uint256 price, uint256 maxPrice);
    error InvalidUtilization();
    error InvalidSplit();

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
    event OwnershipTransferred(address indexed previous, address indexed next);
    event RoutingAddressesUpdated(address pol, address treasury);

    // ─── Storage ──────────────────────────────────────────────────────────────

    IntelToken public immutable intel;
    IntelStaking public immutable staking;

    address public owner;
    mapping(address => bool) public operators;

    // Routing addresses (receive ETH/USDC/INTEL depending on payment token)
    address public polAddress;      // POL: 50% of mint proceeds
    address public treasuryAddress; // Treasury: 5% of mint proceeds

    // Price parameters (all in payment token units — treated as ETH wei for simplicity)
    uint256 public twap;            // TWAP price of INTEL in payment token units (per 1e18 INTEL)
    uint256 public twapUpdatedAt;
    uint256 public floorPrice;      // Minimum price regardless of TWAP
    uint256 public premiumBps;      // Premium in BPS above TWAP (e.g. 500 = 5%)

    // Utilization: set by operator after each epoch settlement
    // multiplierBps: 10000 = 1x, 15000 = 1.5x, etc.
    uint256 public utilizationMultiplierBps; // default 10000 (1x)
    uint256 public pendingTaskVolume;
    uint256 public settledCapacity;

    uint256 public constant BPS = 10_000;
    // Routing splits in BPS (must sum to BPS)
    uint256 public constant POL_BPS     = 5_000; // 50%
    uint256 public constant STAKER_BPS  = 4_500; // 45%
    uint256 public constant TREASURY_BPS =  500; // 5%

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
    }

    // ─── Price View ───────────────────────────────────────────────────────────

    /// @notice Current mint price per 1e18 INTEL in payment units.
    /// @dev mintPrice = max(TWAP * (1 + premium), floorPrice) * utilizationMultiplier
    function mintPrice() public view returns (uint256) {
        uint256 twapWithPremium = (twap * (BPS + premiumBps)) / BPS;
        uint256 base = twapWithPremium > floorPrice ? twapWithPremium : floorPrice;
        return (base * utilizationMultiplierBps) / BPS;
    }

    /// @notice Cost in payment units to mint `intelAmount` (in wei, i.e. 18 decimals).
    function quoteMint(uint256 intelAmount) external view returns (uint256 cost) {
        cost = (mintPrice() * intelAmount) / 1e18;
    }

    // ─── Mint ─────────────────────────────────────────────────────────────────

    /// @notice Execute a mint on behalf of `to`. Caller must be a whitelisted operator.
    ///         Payment is denominated in ETH (msg.value). Excess is refunded.
    ///
    /// @param to           Recipient of minted INTEL.
    /// @param intelAmount  Amount of INTEL to mint (in wei / 1e18 units).
    /// @param maxPrice     Caller's slippage guard — reverts if mintPrice() > maxPrice.
    function executeMint(address to, uint256 intelAmount, uint256 maxPrice) external payable onlyOperator {
        if (to == address(0)) revert ZeroAddress();
        if (intelAmount == 0) revert ZeroAmount();

        uint256 price = mintPrice();
        if (price > maxPrice) revert SlippageExceeded(price, maxPrice);

        uint256 required = (price * intelAmount) / 1e18;
        if (msg.value < required) revert PriceTooLow(msg.value, required);

        // Check and consume staking allowance
        uint256 allowanceLeft = staking.mintAllowance(to);
        if (intelAmount > allowanceLeft) {
            revert AllowanceInsufficient(to, intelAmount, allowanceLeft);
        }
        staking.consumeAllowance(to, intelAmount);

        // Mint INTEL to recipient
        intel.mint(to, intelAmount);

        // Route proceeds (use required, refund excess)
        uint256 proceeds = required;
        uint256 polShare      = (proceeds * POL_BPS) / BPS;
        uint256 stakerShare   = (proceeds * STAKER_BPS) / BPS;
        uint256 treasuryShare = proceeds - polShare - stakerShare; // remainder = 5%

        _sendEth(polAddress, polShare);
        _sendEth(treasuryAddress, treasuryShare);

        // Staker share: deposit into IntelStaking yield pool
        // We convert ETH to INTEL equivalent isn't feasible without a swap;
        // instead, forward ETH to a dedicated yield-buffer address for off-chain conversion,
        // OR if staker yield is paid in ETH, send directly. Here we forward to staking contract
        // as ETH (staking contract must handle it), keeping architecture simple.
        // In a full implementation this would trigger a swap → INTEL → depositYield().
        // For this spec slice, we send ETH to the staking contract's designated receiver.
        _sendEth(address(staking), stakerShare);

        // Refund excess ETH
        uint256 excess = msg.value - required;
        if (excess > 0) {
            _sendEth(msg.sender, excess);
        }

        emit MintExecuted(
            to,
            intelAmount,
            proceeds,
            polShare,
            stakerShare,
            treasuryShare,
            staking.epoch()
        );
    }

    /// @notice Alternative: operator mints with INTEL payment (proceeds in INTEL).
    ///         Proceeds routed in INTEL: 50% POL, 45% staking yield, 5% treasury.
    ///
    /// @param to           Recipient.
    /// @param intelAmount  INTEL to mint.
    /// @param paymentToken ERC-20 payment token. Payment pulled from `to` via transferFrom.
    /// @param paymentAmount Exact payment amount in paymentToken units. Must equal quoteMint.
    function executeMintERC20(
        address to,
        uint256 intelAmount,
        address paymentToken,
        uint256 paymentAmount,
        uint256 maxPrice
    ) external onlyOperator {
        if (to == address(0)) revert ZeroAddress();
        if (intelAmount == 0) revert ZeroAmount();
        if (paymentToken == address(0)) revert ZeroAddress();

        uint256 price = mintPrice();
        if (price > maxPrice) revert SlippageExceeded(price, maxPrice);

        uint256 required = (price * intelAmount) / 1e18;
        if (paymentAmount < required) revert PriceTooLow(paymentAmount, required);

        // Check and consume staking allowance
        uint256 allowanceLeft = staking.mintAllowance(to);
        if (intelAmount > allowanceLeft) {
            revert AllowanceInsufficient(to, intelAmount, allowanceLeft);
        }
        staking.consumeAllowance(to, intelAmount);

        // Pull payment from `to`
        _transferFrom(paymentToken, to, address(this), required);

        // Mint INTEL to recipient
        intel.mint(to, intelAmount);

        // Route proceeds in paymentToken
        uint256 polShare      = (required * POL_BPS) / BPS;
        uint256 stakerShare   = (required * STAKER_BPS) / BPS;
        uint256 treasuryShare = required - polShare - stakerShare;

        _transfer(paymentToken, polAddress, polShare);
        _transfer(paymentToken, treasuryAddress, treasuryShare);
        // Staker share goes to staking contract
        _transfer(paymentToken, address(staking), stakerShare);

        emit MintExecuted(
            to,
            intelAmount,
            required,
            polShare,
            stakerShare,
            treasuryShare,
            staking.epoch()
        );
    }

    // ─── Oracle / Operator Updates ────────────────────────────────────────────

    /// @notice Update TWAP. Called by operator after each oracle observation.
    function updateTWAP(uint256 newTWAP) external onlyOperator {
        if (newTWAP == 0) revert ZeroAmount();
        twap = newTWAP;
        twapUpdatedAt = block.timestamp;
        emit TWAPUpdated(newTWAP, block.timestamp);
    }

    /// @notice Update utilization metrics and recalculate multiplier.
    /// @param _pendingVolume  Pending task count or budget volume (raw units).
    /// @param _settledCapacity Settled task capacity this epoch (same units).
    ///
    /// utilizationMultiplierBps = pendingVolume * BPS / settledCapacity
    /// Clamped to [BPS, 3*BPS] i.e. [1x, 3x] to prevent runaway pricing.
    function updateUtilization(uint256 _pendingVolume, uint256 _settledCapacity) external onlyOperator {
        pendingTaskVolume = _pendingVolume;
        settledCapacity = _settledCapacity;

        uint256 multiplier;
        if (_settledCapacity == 0 || _pendingVolume == 0) {
            multiplier = BPS; // 1x when no data
        } else {
            multiplier = (_pendingVolume * BPS) / _settledCapacity;
            // Clamp between 1x and 3x
            if (multiplier < BPS) multiplier = BPS;
            if (multiplier > 3 * BPS) multiplier = 3 * BPS;
        }

        utilizationMultiplierBps = multiplier;
        emit UtilizationUpdated(_pendingVolume, _settledCapacity, multiplier);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setFloorPrice(uint256 _floorPrice) external onlyOwner {
        floorPrice = _floorPrice;
        emit FloorPriceSet(_floorPrice);
    }

    function setPremium(uint256 _premiumBps) external onlyOwner {
        premiumBps = _premiumBps;
        emit PremiumSet(_premiumBps);
    }

    function setOperator(address op, bool approved) external onlyOwner {
        if (op == address(0)) revert ZeroAddress();
        operators[op] = approved;
        emit OperatorSet(op, approved);
    }

    function setRoutingAddresses(address _pol, address _treasury) external onlyOwner {
        if (_pol == address(0) || _treasury == address(0)) revert ZeroAddress();
        polAddress = _pol;
        treasuryAddress = _treasury;
        emit RoutingAddressesUpdated(_pol, _treasury);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ─── Internal helpers ─────────────────────────────────────────────────────

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
