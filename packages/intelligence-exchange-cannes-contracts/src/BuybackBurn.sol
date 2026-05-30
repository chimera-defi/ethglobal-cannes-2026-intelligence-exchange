// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @custom:security-contact security@iex.cannes

import {IntelToken} from "./IntelToken.sol";
import {IntelPOLManager} from "./IntelPOLManager.sol";
import {ISwapRouter} from "./interfaces/ISwapRouter.sol";
import {IWETH9} from "./interfaces/IUniswapV3.sol";

interface ILiquidityMining {
    function depositRewards(uint256 amount) external;
}

/// @title BuybackBurn
/// @notice Protocol buyback and burn mechanism for INTEL token.
///
/// Takes ETH from the treasury, market-buys INTEL on the Uniswap V3 INTEL/WETH pool,
/// and burns the purchased INTEL. Creates direct link between protocol volume and
/// supply pressure. Inspired by Gensyn's BuyBack Vault model.
///
/// Access:
///   - executeBuyback: only whitelisted operators
///   - config: only owner (Ownable2Step — two-step transfer prevents key loss)
contract BuybackBurn {
    // ─── Errors ──────────────────────────────────────────────────────────────

    error Unauthorized();
    error ZeroAddress();
    error ZeroAmount();
    error InvalidParam();
    error SlippageExceeded(uint256 spot, uint256 twap, uint256 maxSlippageBps);
    error InsufficientEthBalance(uint256 available, uint256 required);
    error InsufficientIntelBalance(uint256 available, uint256 required);

    // ─── Events ───────────────────────────────────────────────────────────────

    event BuybackExecuted(uint256 ethSpent, uint256 intelBurned, uint256 intelToMining, uint256 twapAtExecution);
    event LpMiningUpdated(address indexed addr, uint256 bps);
    event EthDeposited(address indexed from, uint256 amount);
    event EthWithdrawn(address indexed to, uint256 amount);
    event ParamsUpdated(string param, uint256 oldValue, uint256 newValue);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event OperatorSet(address indexed op, bool approved);
    event OwnershipTransferStarted(address indexed previous, address indexed next);
    event OwnershipTransferred(address indexed previous, address indexed next);

    // ─── Constants ────────────────────────────────────────────────────────────

    uint256 public constant BPS = 10_000;
    uint24 public constant POOL_FEE = 3000; // 0.3%

    // ─── Storage ──────────────────────────────────────────────────────────────

    IntelToken public immutable intel;
    address public immutable pol;
    ISwapRouter public immutable swapRouter;
    address public immutable weth;

    address public owner;
    address public pendingOwner;
    address public treasury;
    mapping(address => bool) public operators;

    uint256 public maxSlippageBps; // default 200 (2%)
    uint256 public minBuybackEth;  // minimum ETH to trigger buyback, default 0.1 ETH
    address public lpMiningAddress; // receives lpMiningBps share of each buyback
    uint256 public lpMiningBps;     // default 2000 (20%)

    // ─── Reentrancy guard ─────────────────────────────────────────────────────

    uint256 private _reentrancyStatus;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED     = 2;

    modifier nonReentrant() {
        require(_reentrancyStatus != _ENTERED, "BuybackBurn: reentrant call");
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

    /// @notice Deploy BuybackBurn.
    /// @param _intel       INTEL token address (non-zero).
    /// @param _pol         IntelPOLManager address for TWAP reference (non-zero).
    /// @param _swapRouter  Uniswap V3 SwapRouter address (non-zero).
    /// @param _weth        WETH9 address (non-zero).
    /// @param _treasury    Treasury address (non-zero).
    constructor(
        address _intel,
        address _pol,
        address _swapRouter,
        address _weth,
        address _treasury
    ) {
        if (_intel == address(0)) revert ZeroAddress();
        if (_pol == address(0)) revert ZeroAddress();
        if (_swapRouter == address(0)) revert ZeroAddress();
        if (_weth == address(0)) revert ZeroAddress();
        if (_treasury == address(0)) revert ZeroAddress();

        intel = IntelToken(_intel);
        pol = _pol;
        swapRouter = ISwapRouter(_swapRouter);
        weth = _weth;
        treasury = _treasury;
        owner = msg.sender;
        maxSlippageBps = 200; // 2%
        minBuybackEth = 0.1 ether;
        _reentrancyStatus = _NOT_ENTERED;

        emit OwnershipTransferred(address(0), msg.sender);
    }

    // ─── Core Buyback Logic ───────────────────────────────────────────────────

    /// @notice Execute buyback: swap contract ETH balance for INTEL and burn it.
    ///         TWAP check: revert if spot deviates >maxSlippageBps from TWAP.
    /// @custom:access operator or owner
    function executeBuyback() external onlyOperator nonReentrant {
        uint256 ethBalance = address(this).balance;
        if (ethBalance < minBuybackEth) {
            revert InsufficientEthBalance(ethBalance, minBuybackEth);
        }
        if (ethBalance == 0) revert ZeroAmount();

        // Get current TWAP from POL manager
        uint256 twap = _getTWAP();
        if (twap == 0) revert ZeroAmount();

        // Wrap ETH to WETH
        IWETH9(weth).deposit{value: ethBalance}();

        // Approve swap router to spend WETH
        _approveToken(weth, address(swapRouter), ethBalance);

        // Determine token order for Uniswap
        bool intelIsToken0 = address(intel) < weth;
        (address tokenIn, address tokenOut) = intelIsToken0 ? (weth, address(intel)) : (address(intel), weth);

        // Calculate minimum INTEL output based on TWAP and max slippage
        uint256 minIntelOut = (ethBalance * 1e18) / twap;
        minIntelOut = (minIntelOut * (BPS - maxSlippageBps)) / BPS;

        // Execute swap
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            fee: POOL_FEE,
            recipient: address(this),
            deadline: block.timestamp + 900,
            amountIn: ethBalance,
            amountOutMinimum: minIntelOut,
            sqrtPriceLimitX96: 0
        });

        uint256 intelReceived = swapRouter.exactInputSingle(params);

        // Clear approvals
        _approveToken(weth, address(swapRouter), 0);

        // Verify slippage protection post-swap
        uint256 spotPrice = (ethBalance * 1e18) / intelReceived;
        if (_checkSlippageExceeded(spotPrice, twap, maxSlippageBps)) {
            revert SlippageExceeded(spotPrice, twap, maxSlippageBps);
        }

        // Route lpMiningBps share to LiquidityMining; burn the rest
        uint256 miningShare = 0;
        if (lpMiningAddress != address(0) && lpMiningBps > 0) {
            miningShare = (intelReceived * lpMiningBps) / BPS;
            if (miningShare > 0) {
                intel.approve(lpMiningAddress, miningShare);
                ILiquidityMining(lpMiningAddress).depositRewards(miningShare);
            }
        }
        _burnIntel(intelReceived - miningShare);

        emit BuybackExecuted(ethBalance, intelReceived - miningShare, miningShare, twap);
    }

    /// @notice Deposit ETH to fund the next buyback. Anyone can call.
    function depositEth() external payable {
        if (msg.value == 0) revert ZeroAmount();
        emit EthDeposited(msg.sender, msg.value);
    }

    /// @notice Emergency ETH withdrawal by owner.
    /// @custom:access owner
    function withdrawEth(uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (amount > address(this).balance) {
            revert InsufficientEthBalance(address(this).balance, amount);
        }

        (bool ok,) = owner.call{value: amount}("");
        require(ok, "BuybackBurn: ETH withdrawal failed");

        emit EthWithdrawn(owner, amount);
    }

    // ─── Admin / Config ───────────────────────────────────────────────────────

    /// @notice Set maximum slippage tolerance in basis points.
    /// @custom:access owner
    /// @param _maxSlippageBps New max slippage in BPS (e.g. 200 = 2%).
    function setMaxSlippage(uint256 _maxSlippageBps) external onlyOwner {
        if (_maxSlippageBps > BPS) revert InvalidParam();
        uint256 old = maxSlippageBps;
        maxSlippageBps = _maxSlippageBps;
        emit ParamsUpdated("maxSlippageBps", old, _maxSlippageBps);
    }

    /// @notice Set minimum ETH required to trigger buyback.
    /// @custom:access owner
    /// @param _minBuybackEth New minimum in ETH wei.
    function setMinBuybackEth(uint256 _minBuybackEth) external onlyOwner {
        uint256 old = minBuybackEth;
        minBuybackEth = _minBuybackEth;
        emit ParamsUpdated("minBuybackEth", old, _minBuybackEth);
    }

    /// @notice Set treasury address.
    /// @custom:access owner
    /// @param _treasury New treasury address (non-zero).
    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert ZeroAddress();
        address old = treasury;
        treasury = _treasury;
        emit TreasuryUpdated(old, _treasury);
    }

    /// @notice Set the LP mining address and share. Pass address(0) to disable LP mining routing.
    /// @custom:access owner
    /// @param _lpMiningAddress LiquidityMining contract address (0 to disable).
    /// @param _lpMiningBps     BPS of each buyback routed to LP mining (max 5000 = 50%).
    function setLpMining(address _lpMiningAddress, uint256 _lpMiningBps) external onlyOwner {
        if (_lpMiningBps > 3000) revert InvalidParam(); // 70% burn floor (Gensyn model)
        lpMiningAddress = _lpMiningAddress;
        lpMiningBps = _lpMiningBps;
        emit LpMiningUpdated(_lpMiningAddress, _lpMiningBps);
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

    // ─── Ownable2Step ─────────────────────────────────────────────────────────

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert Unauthorized();
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = address(0);
    }

    // ─── Internal Helpers ─────────────────────────────────────────────────────

    /// @notice Get current TWAP from IntelPOLManager.
    function _getTWAP() internal view returns (uint256) {
        (bool ok, bytes memory data) = pol.staticcall(abi.encodeWithSignature("pullTWAP()"));
        if (!ok || data.length < 32) revert ZeroAmount();
        return abi.decode(data, (uint256));
    }

    /// @notice Check if slippage is exceeded.
    /// @param spotPrice Current spot price (ETH per INTEL).
    /// @param twap      TWAP price (ETH per INTEL).
    /// @param maxBps    Maximum allowed deviation in BPS.
    /// @return True if slippage exceeded.
    function _checkSlippageExceeded(
        uint256 spotPrice,
        uint256 twap,
        uint256 maxBps
    ) internal pure returns (bool) {
        if (twap == 0) return false;
        uint256 deviation;
        if (spotPrice > twap) {
            deviation = ((spotPrice - twap) * BPS) / twap;
        } else {
            deviation = ((twap - spotPrice) * BPS) / twap;
        }
        return deviation > maxBps;
    }

    /// @notice Burn INTEL tokens held by this contract.
    function _burnIntel(uint256 amount) internal {
        uint256 balance = intel.balanceOf(address(this));
        if (balance < amount) revert InsufficientIntelBalance(balance, amount);

        intel.burn(amount);
    }

    /// @notice Approve token spender.
    function _approveToken(address token, address spender, uint256 amount) internal {
        (bool ok,) = token.call(abi.encodeWithSignature("approve(address,uint256)", spender, amount));
        require(ok, "BuybackBurn: approve failed");
    }

    // ─── Receive ETH ─────────────────────────────────────────────────────────

    receive() external payable {
        emit EthDeposited(msg.sender, msg.value);
    }
}