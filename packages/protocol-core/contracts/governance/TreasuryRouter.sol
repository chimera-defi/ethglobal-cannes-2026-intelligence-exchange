// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {IPauseController} from "./IPauseController.sol";

/// @title TreasuryRouter
/// @notice On-chain treasury policy router for protocol fee splits.
///         All products call this contract to route settlement fees consistently.
///
/// Default split (direct mint inflow):
///   50% Protocol-Owned Liquidity (POL)
///   45% Staker yield pool
///   5%  Treasury runway
///
/// Default split (accepted task settlement):
///   81% Worker payout
///   9%  Staker yield
///   10% Protocol treasury
contract TreasuryRouter {
    error Unauthorized();
    error InvalidSplit();

    struct Split {
        uint256 workerBps;
        uint256 stakerBps;
        uint256 treasuryBps;
    }

    address public owner;
    address public polWallet;       // Protocol-Owned Liquidity manager
    address public stakerYieldPool; // Staking yield distribution
    address public treasuryWallet;  // Operational treasury
    address public pauseController;

    // Default settlement split (task fees)
    Split public taskSplit = Split({ workerBps: 8100, stakerBps: 900, treasuryBps: 1000 });
    // Default mint inflow split
    Split public mintSplit = Split({ workerBps: 0, stakerBps: 4500, treasuryBps: 500 });
    // POL portion of mint inflow (remaining goes to staker + treasury)
    uint256 public polMintBps = 5000;

    event SplitUpdated(string splitType, uint256 workerBps, uint256 stakerBps, uint256 treasuryBps);
    event Routed(address indexed token, uint256 polAmount, uint256 stakerAmount, uint256 treasuryAmount);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier whenNotPaused() {
        if (pauseController != address(0) && IPauseController(pauseController).paused()) {
            revert Unauthorized();
        }
        _;
    }

    constructor(
        address _polWallet,
        address _stakerYieldPool,
        address _treasuryWallet,
        address _pauseController
    ) {
        owner = msg.sender;
        polWallet = _polWallet;
        stakerYieldPool = _stakerYieldPool;
        treasuryWallet = _treasuryWallet;
        pauseController = _pauseController;
    }

    /// @notice Route a token amount according to the mint inflow split.
    /// @param token The ERC-20 token to route.
    /// @param amount Total amount to route.
    function routeMintInflow(address token, uint256 amount) external whenNotPaused returns (bool) {
        uint256 polAmount = (amount * polMintBps) / 10000;
        uint256 remaining = amount - polAmount;

        uint256 stakerAmount = (remaining * mintSplit.stakerBps) / (mintSplit.stakerBps + mintSplit.treasuryBps);
        uint256 treasuryAmount = remaining - stakerAmount;

        if (polAmount > 0) _transfer(token, msg.sender, polWallet, polAmount);
        if (stakerAmount > 0) _transfer(token, msg.sender, stakerYieldPool, stakerAmount);
        if (treasuryAmount > 0) _transfer(token, msg.sender, treasuryWallet, treasuryAmount);

        emit Routed(token, polAmount, stakerAmount, treasuryAmount);
        return true;
    }

    /// @notice Calculate task settlement amounts without transferring.
    /// @param amount Total milestone amount.
    function calculateTaskSplit(uint256 amount) external view returns (uint256 workerAmount, uint256 stakerAmount, uint256 treasuryAmount) {
        uint256 fee = amount;
        workerAmount = (fee * taskSplit.workerBps) / 10000;
        stakerAmount = (fee * taskSplit.stakerBps) / 10000;
        treasuryAmount = fee - workerAmount - stakerAmount;
    }

    function setTaskSplit(uint256 workerBps, uint256 stakerBps, uint256 treasuryBps) external onlyOwner {
        if (workerBps + stakerBps + treasuryBps != 10000) revert InvalidSplit();
        taskSplit = Split({ workerBps: workerBps, stakerBps: stakerBps, treasuryBps: treasuryBps });
        emit SplitUpdated("task", workerBps, stakerBps, treasuryBps);
    }

    function setMintSplit(uint256 stakerBps, uint256 treasuryBps) external onlyOwner {
        if (stakerBps + treasuryBps != 10000) revert InvalidSplit();
        mintSplit = Split({ workerBps: 0, stakerBps: stakerBps, treasuryBps: treasuryBps });
        emit SplitUpdated("mint", 0, stakerBps, treasuryBps);
    }

    function setPolMintBps(uint256 _polMintBps) external onlyOwner {
        if (_polMintBps > 10000) revert InvalidSplit();
        polMintBps = _polMintBps;
    }

    function setWallets(address _pol, address _staker, address _treasury) external onlyOwner {
        polWallet = _pol;
        stakerYieldPool = _staker;
        treasuryWallet = _treasury;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function _transfer(address token, address from, address to, uint256 amount) internal {
        bool ok = IERC20(token).transferFrom(from, to, amount);
        if (!ok) revert InvalidSplit(); // reusing error code for transfer failure
    }
}
