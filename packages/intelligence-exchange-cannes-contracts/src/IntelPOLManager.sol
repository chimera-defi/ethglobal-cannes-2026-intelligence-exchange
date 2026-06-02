// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {INonfungiblePositionManager, IWETH9, IUniswapV3Pool} from "./interfaces/IUniswapV3.sol";

/// @title IntelPOLManager
/// @notice Protocol-Owned Liquidity treasury for Intelligence Exchange.
///         Deploys INTEL/WETH concentrated liquidity in a Uniswap V3 pool.
///         Ownable2Step — same pattern as the rest of the codebase.
contract IntelPOLManager {
    // ─── Errors ──────────────────────────────────────────────────────────

    error Unauthorized();
    error ZeroAddress();
    error TransferFailed();
    error InsufficientBalance(uint256 available, uint256 requested);
    error NoPosition();
    error InvalidParam();

    // ─── Events ───────────────────────────────────────────────────────────

    event EthReceived(address indexed sender, uint256 amount);
    event EthWithdrawn(address indexed to, uint256 amount);
    event IntelWithdrawn(address indexed to, uint256 amount);
    event UniV3Deployed(address indexed pool, uint256 intelAmount, uint256 ethAmount, int24 tickLower, int24 tickUpper, uint256 tokenId, uint128 liquidity);
    event FeesCollected(uint256 amount0, uint256 amount1);
    event TwapPoolUpdated(address indexed oldPool, address indexed newPool);
    event TwapWindowUpdated(uint32 oldWindow, uint32 newWindow);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ─── Storage ──────────────────────────────────────────────────────────

    address public owner;
    address public pendingOwner;

    /// @notice INTEL token held by this contract
    address public immutable intel;

    /// @notice Uniswap V3 NonfungiblePositionManager address
    address public immutable positionManager;

    /// @notice WETH9 address
    address public immutable weth;

    /// @notice Uniswap V3 pool fee tier (0.3%)
    uint24 public constant POOL_FEE = 3000;

    /// @notice NFT token ID for the Uniswap V3 position
    uint256 public positionTokenId;

    /// @notice Uniswap V3 pool address for TWAP observations
    address public twapPool;

    /// @notice TWAP observation window in seconds (default 1800 = 30 min)
    uint32 public twapWindow;

    /// @notice Tracks total ETH received (informational — ETH balance is source of truth)
    uint256 public totalEthReceived;

    // ─── Reentrancy guard ─────────────────────────────────────────────────

    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED     = 2;
    uint256 private _reentrancyStatus;

    modifier nonReentrant() {
        require(_reentrancyStatus != _ENTERED, "ReentrancyGuard: reentrant call");
        _reentrancyStatus = _ENTERED;
        _;
        _reentrancyStatus = _NOT_ENTERED;
    }

    // ─── Ownable2Step ─────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────

    constructor(address _owner, address _intel, address _positionManager, address _weth) {
        if (_owner == address(0)) revert ZeroAddress();
        if (_intel == address(0)) revert ZeroAddress();
        if (_positionManager == address(0)) revert ZeroAddress();
        if (_weth == address(0)) revert ZeroAddress();

        owner              = _owner;
        intel              = _intel;
        positionManager    = _positionManager;
        weth               = _weth;
        twapWindow         = 3600; // 1 hour default (increased from 30 min for stronger manipulation resistance)
        _reentrancyStatus  = _NOT_ENTERED;

        emit OwnershipTransferred(address(0), _owner);
    }

    // ─── Owner: ETH withdrawals ───────────────────────────────────────────

    /// @notice Withdraw ETH to `to` (manual liquidity deployment).
    function withdrawEth(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount > address(this).balance)
            revert InsufficientBalance(address(this).balance, amount);

        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit EthWithdrawn(to, amount);
    }

    // ─── Owner: INTEL withdrawals ─────────────────────────────────────────

    /// @notice Withdraw INTEL tokens to `to` (manual liquidity deployment).
    function withdrawIntel(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();

        uint256 bal = _intelBalance();
        if (amount == 0 || amount > bal) revert InsufficientBalance(bal, amount);

        bool ok = _transferIntel(to, amount);
        if (!ok) revert TransferFailed();

        emit IntelWithdrawn(to, amount);
    }

    // ─── Uniswap V3 integration ────────────────────────────────────────

    /// @notice Deploy INTEL + ETH as concentrated liquidity in a Uniswap V3 pool.
    ///         Mints new position or increases existing position liquidity.
    ///
    /// @param pool        Uniswap V3 INTEL/WETH pool address
    /// @param intelAmount INTEL to deposit (must be <= intelBalance())
    /// @param ethAmount   ETH to wrap+deposit (must be <= ethBalance())
    /// @param tickLower   Lower tick (±20% around spot is recommended)
    /// @param tickUpper   Upper tick
    function deployToUniV3(
        address pool,
        uint256 intelAmount,
        uint256 ethAmount,
        int24 tickLower,
        int24 tickUpper
    ) external onlyOwner nonReentrant {
        // 1. Validate inputs
        if (pool == address(0)) revert ZeroAddress();
        if (intelAmount == 0 || ethAmount == 0) revert InsufficientBalance(0, 1);
        if (intelAmount > _intelBalance()) revert InsufficientBalance(_intelBalance(), intelAmount);
        if (ethAmount > address(this).balance) revert InsufficientBalance(address(this).balance, ethAmount);

        // 2. Wrap ETH to WETH
        IWETH9(weth).deposit{value: ethAmount}();

        // 3. Sort token0/token1 the way Uniswap expects (ascending address order)
        bool intelIsToken0 = intel < weth;
        (address token0, address token1) = intelIsToken0
            ? (intel, weth)
            : (weth, intel);
        (uint256 amount0, uint256 amount1) = intelIsToken0
            ? (intelAmount, ethAmount)
            : (ethAmount, intelAmount);

        // 4. Approve position manager to spend both tokens
        _approveToken(intel, positionManager, intelAmount);
        _approveToken(weth, positionManager, ethAmount);

        uint256 tokenId;
        uint128 liquidity;
        uint256 used0;
        uint256 used1;

        // 5. If no position exists yet, mint a new one; otherwise increase existing
        if (positionTokenId == 0) {
            INonfungiblePositionManager.MintParams memory params = INonfungiblePositionManager.MintParams({
                token0: token0,
                token1: token1,
                fee: POOL_FEE,
                tickLower: tickLower,
                tickUpper: tickUpper,
                amount0Desired: amount0,
                amount1Desired: amount1,
                amount0Min: 0,
                amount1Min: 0,
                recipient: address(this),
                deadline: block.timestamp + 900
            });
            (tokenId, liquidity, used0, used1) = INonfungiblePositionManager(positionManager).mint(params);
            positionTokenId = tokenId;
        } else {
            INonfungiblePositionManager.IncreaseLiquidityParams memory params = INonfungiblePositionManager.IncreaseLiquidityParams({
                tokenId: positionTokenId,
                amount0Desired: amount0,
                amount1Desired: amount1,
                amount0Min: 0,
                amount1Min: 0,
                deadline: block.timestamp + 900
            });
            (liquidity, used0, used1) = INonfungiblePositionManager(positionManager).increaseLiquidity(params);
            tokenId = positionTokenId;
        }

        // 6. Refund unused WETH back to ETH (unwrap excess)
        uint256 unusedWeth = intelIsToken0 ? (ethAmount - used1) : (ethAmount - used0);
        if (unusedWeth > 0) {
            IWETH9(weth).withdraw(unusedWeth);
        }

        // 7. Clear approvals (security hygiene)
        _approveToken(intel, positionManager, 0);
        _approveToken(weth, positionManager, 0);

        emit UniV3Deployed(pool, intelAmount, ethAmount, tickLower, tickUpper, tokenId, liquidity);
    }

    /// @notice Collect accumulated trading fees from the Uniswap V3 position.
    /// @return amount0 Amount of token0 collected
    /// @return amount1 Amount of token1 collected
    function collectFees() external onlyOwner nonReentrant returns (uint256 amount0, uint256 amount1) {
        if (positionTokenId == 0) revert NoPosition();

        INonfungiblePositionManager.CollectParams memory params = INonfungiblePositionManager.CollectParams({
            tokenId: positionTokenId,
            recipient: address(this),
            amount0Max: type(uint128).max,
            amount1Max: type(uint128).max
        });

        (amount0, amount1) = INonfungiblePositionManager(positionManager).collect(params);
        emit FeesCollected(amount0, amount1);
    }

    // ─── TWAP Configuration ─────────────────────────────────────────────────

    /// @notice Set the Uniswap V3 pool address for TWAP observations.
    /// @custom:access owner
    function setTwapPool(address _twapPool) external onlyOwner {
        if (_twapPool == address(0)) revert ZeroAddress();
        address old = twapPool;
        twapPool = _twapPool;
        emit TwapPoolUpdated(old, _twapPool);
    }

    /// @notice Set the TWAP observation window in seconds.
    /// @custom:access owner
    function setTwapWindow(uint32 _twapWindow) external onlyOwner {
        if (_twapWindow < 1800) revert InvalidParam(); // minimum 30 minutes for manipulation resistance
        uint32 old = twapWindow;
        twapWindow = _twapWindow;
        emit TwapWindowUpdated(old, _twapWindow);
    }

    /// @notice Pull current TWAP from the configured Uniswap V3 pool.
    ///         Returns the time-weighted average price as ETH per 1e18 INTEL.
    /// @return twapPrice The current TWAP price (scaled to 1e18)
    function pullTWAP() external view returns (uint256 twapPrice) {
        if (twapPool == address(0)) revert ZeroAddress();

        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = twapWindow;
        secondsAgos[1] = 0;

        (int56[] memory tickCumulatives,) = IUniswapV3Pool(twapPool).observe(secondsAgos);

        // Average tick over the window
        int56 delta = tickCumulatives[1] - tickCumulatives[0];
        int24 avgTick = int24(delta / int56(int32(twapWindow)));

        // Determine token order
        bool intelIsToken0 = intel < weth;

        // Convert tick to price (ETH per 1e18 INTEL, scaled to 1e18)
        twapPrice = _tickToPrice(avgTick, intelIsToken0);
    }

    // ─── Views ────────────────────────────────────────────────────────────

    /// @notice Current ETH balance held by this contract.
    function ethBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Current INTEL balance held by this contract.
    function intelBalance() external view returns (uint256) {
        return _intelBalance();
    }

    // ─── Ownable2Step ─────────────────────────────────────────────────────

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert Unauthorized();
        address old = owner;
        owner        = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(old, owner);
    }

    // ─── Internal helpers ─────────────────────────────────────────────────

    function _intelBalance() internal view returns (uint256) {
        (bool ok, bytes memory data) = intel.staticcall(
            abi.encodeWithSignature("balanceOf(address)", address(this))
        );
        if (!ok || data.length < 32) return 0;
        return abi.decode(data, (uint256));
    }

    function _transferIntel(address to, uint256 amount) internal returns (bool) {
        (bool ok, bytes memory data) = intel.call(
            abi.encodeWithSignature("transfer(address,uint256)", to, amount)
        );
        return ok && (data.length == 0 || abi.decode(data, (bool)));
    }

    function _approveToken(address token, address spender, uint256 amount) internal {
        (bool ok,) = token.call(abi.encodeWithSignature('approve(address,uint256)', spender, amount));
        if (!ok) revert TransferFailed();
    }

    /// @notice Convert tick to price (ETH per 1e18 INTEL, scaled to 1e18).
    function _tickToPrice(int24 tick, bool intelIsToken0) internal pure returns (uint256) {
        uint160 sqrtPriceX96 = _getSqrtRatioAtTick(tick);
        uint256 priceX96 = uint256(sqrtPriceX96) * uint256(sqrtPriceX96);
        priceX96 = priceX96 >> 96;

        if (intelIsToken0) {
            // INTEL is token0, price is INTEL per WETH, need to invert
            return (1e18 << 96) / priceX96;
        } else {
            // INTEL is token1, price is WETH per INTEL
            return (priceX96 * 1e18) >> 96;
        }
    }

    /// @notice Calculate sqrt(1.0001^tick) * 2^96.
    function _getSqrtRatioAtTick(int24 tick) internal pure returns (uint160) {
        uint256 absTick = tick < 0 ? uint256(-int256(tick)) : uint256(int256(tick));

        uint256 ratio = absTick & 0x1 != 0 ? 0xfffcb933bd6fad37aa2d162d1a594001 : 0x100000000000000000000000000000000;
        if (absTick & 0x2 != 0) ratio = (ratio * 0xfff97272373d413259a46990580e213a) >> 128;
        if (absTick & 0x4 != 0) ratio = (ratio * 0xfff2e50f5f656932ef12357cf3c7fdcc) >> 128;
        if (absTick & 0x8 != 0) ratio = (ratio * 0xffe5caca7e10e4e61c3624eaa0941cd0) >> 128;
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

        if (tick > 0) ratio = type(uint256).max / ratio;

        return uint160((ratio >> 32) + (ratio % (1 << 32) == 0 ? 0 : 1));
    }

    // ─── Receive ETH ─────────────────────────────────────────────────────

    receive() external payable {
        totalEthReceived += msg.value;
        emit EthReceived(msg.sender, msg.value);
    }
}
