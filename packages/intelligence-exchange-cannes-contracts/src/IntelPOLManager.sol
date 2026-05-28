// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {INonfungiblePositionManager, IWETH9} from "./interfaces/IUniswapV3.sol";

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

    // ─── Events ───────────────────────────────────────────────────────────

    event EthReceived(address indexed sender, uint256 amount);
    event EthWithdrawn(address indexed to, uint256 amount);
    event IntelWithdrawn(address indexed to, uint256 amount);
    event UniV3Deployed(address indexed pool, uint256 intelAmount, uint256 ethAmount, int24 tickLower, int24 tickUpper, uint256 tokenId, uint128 liquidity);
    event FeesCollected(uint256 amount0, uint256 amount1);
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
    function withdrawIntel(address to, uint256 amount) external onlyOwner {
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
    function collectFees() external onlyOwner returns (uint256 amount0, uint256 amount1) {
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

    // ─── Receive ETH ─────────────────────────────────────────────────────

    receive() external payable {
        totalEthReceived += msg.value;
        emit EthReceived(msg.sender, msg.value);
    }
}
