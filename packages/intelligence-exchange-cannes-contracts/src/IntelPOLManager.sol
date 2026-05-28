// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IntelPOLManager
/// @notice Protocol-Owned Liquidity treasury for Intelligence Exchange.
///
/// Phase 1 (current): Holds ETH and INTEL from mint proceeds.
///           Owner (or timelock) can withdraw for manual liquidity operations.
///
/// Phase 2 (future):  deployToUniV3() is enabled via enablePhase2().
///           Deploys INTEL/WETH concentrated liquidity in a Uniswap V3 pool.
///           Stub is included so the interface is stable and callers can be
///           integrated now; the body reverts until Phase2 is enabled by owner.
///
/// Ownable2Step — same pattern as the rest of the codebase.
contract IntelPOLManager {
    // ─── Errors ──────────────────────────────────────────────────────────

    error Unauthorized();
    error ZeroAddress();
    error Phase2NotEnabled();
    error Phase2NotImplemented(); // stub: real UniV3 integration pending
    error ZeroAmount();
    error TransferFailed();
    error InsufficientBalance(uint256 available, uint256 requested);

    // ─── Events ───────────────────────────────────────────────────────────

    event EthReceived(address indexed sender, uint256 amount);
    event EthWithdrawn(address indexed to, uint256 amount);
    event IntelWithdrawn(address indexed to, uint256 amount);
    event Phase2Enabled();
    event UniV3Deployed(address indexed pool, uint256 intelAmount, uint256 ethAmount, int24 tickLower, int24 tickUpper);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ─── Storage ──────────────────────────────────────────────────────────

    address public owner;
    address public pendingOwner;

    /// @notice INTEL token held by this contract
    address public immutable intel;

    /// @notice Whether Uniswap V3 deployment is unlocked
    bool public phase2Enabled;

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

    constructor(address _owner, address _intel) {
        if (_owner == address(0)) revert ZeroAddress();
        if (_intel == address(0)) revert ZeroAddress();

        owner              = _owner;
        intel              = _intel;
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
        if (amount == 0)      revert ZeroAmount();

        uint256 bal = _intelBalance();
        if (amount > bal) revert InsufficientBalance(bal, amount);

        bool ok = _transferIntel(to, amount);
        if (!ok) revert TransferFailed();

        emit IntelWithdrawn(to, amount);
    }

    // ─── Owner: Phase 2 unlock ────────────────────────────────────────────

    /// @notice Enable on-chain Uniswap V3 liquidity deployment.
    ///         One-way switch — cannot be disabled once enabled.
    function enablePhase2() external onlyOwner {
        phase2Enabled = true;
        emit Phase2Enabled();
    }

    // ─── Uniswap V3 stub (Phase 2) ────────────────────────────────────────

    /// @notice Deploy INTEL + ETH as concentrated liquidity in a Uniswap V3 pool.
    ///         Phase 1: reverts. Phase 2: keeper calls this each epoch.
    ///
    /// @param pool        Uniswap V3 INTEL/WETH pool address
    /// @param intelAmount INTEL to deposit
    /// @param ethAmount   ETH to deposit (must be <= balance)
    /// @param tickLower   Lower tick (±20% around spot is recommended)
    /// @param tickUpper   Upper tick
    function deployToUniV3(
        address pool,
        uint256 intelAmount,
        uint256 ethAmount,
        int24 tickLower,
        int24 tickUpper
    ) external onlyOwner nonReentrant {
        if (!phase2Enabled) revert Phase2NotEnabled();
        if (pool == address(0)) revert ZeroAddress();

        uint256 ethBal   = address(this).balance;
        uint256 intelBal = _intelBalance();

        if (ethAmount > ethBal)    revert InsufficientBalance(ethBal, ethAmount);
        if (intelAmount > intelBal) revert InsufficientBalance(intelBal, intelAmount);

        // Phase 2 implementation: call INonfungiblePositionManager.mint()
        // with the pool's token0/token1 sorted correctly and WETH wrapping.
        //
        // Reference implementation:
        //   IPositionManager.MintParams memory params = IPositionManager.MintParams({
        //       token0: token0, token1: token1, fee: 3000,
        //       tickLower: tickLower, tickUpper: tickUpper,
        //       amount0Desired: ..., amount1Desired: ...,
        //       amount0Min: 0, amount1Min: 0,
        //       recipient: address(this), deadline: block.timestamp + 15 minutes
        //   });
        //   positionManager.mint{value: ethAmount}(params);
        //   emit UniV3Deployed(pool, intelAmount, ethAmount, tickLower, tickUpper);
        //
        // Stub reverts until real implementation replaces this block.
        // Prevents false UniV3Deployed events on-chain (audit finding P4-P5).
        revert Phase2NotImplemented();
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

    // ─── Receive ETH ─────────────────────────────────────────────────────

    receive() external payable {
        totalEthReceived += msg.value;
        emit EthReceived(msg.sender, msg.value);
    }
}
