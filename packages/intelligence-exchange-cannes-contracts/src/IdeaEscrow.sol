// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "forge-std/interfaces/IERC20.sol";

/// @title IdeaEscrow
/// @notice Holds USDC funds for ideas and releases them milestone by milestone.
///         Used with Arc stablecoin on the Arc network.
///
/// State machine per milestone:
///   funded → reserved → released
///                    → refunded
contract IdeaEscrow {
    // ─── Errors ──────────────────────────────────────────────────────────────

    error Unauthorized();
    error IdeaAlreadyFunded(bytes32 ideaId);
    error IdeaNotFunded(bytes32 ideaId);
    error InsufficientBalance(bytes32 ideaId, uint256 required, uint256 available);
    error MilestoneAlreadyReserved(bytes32 milestoneId);
    error MilestoneNotReserved(bytes32 milestoneId);
    error MilestoneAlreadySettled(bytes32 milestoneId);
    error ArrayLengthMismatch();
    error ZeroAmount();
    error TransferFailed();

    // ─── Events ───────────────────────────────────────────────────────────────

    event IdeaFunded(bytes32 indexed ideaId, address indexed poster, address token, uint256 amount);
    event MilestoneReserved(bytes32 indexed ideaId, bytes32 indexed milestoneId, uint256 amount);
    event MilestoneReleased(bytes32 indexed ideaId, bytes32 indexed milestoneId, address indexed worker, uint256 amount);
    event MilestoneRefunded(bytes32 indexed ideaId, bytes32 indexed milestoneId, address indexed poster, uint256 amount);

    // ─── Storage ──────────────────────────────────────────────────────────────

    struct IdeaFund {
        address poster;
        address token;
        uint256 totalFunded;
        uint256 available;
        bool exists;
    }

    enum MilestoneStatus { None, Reserved, Released, Refunded }

    struct MilestoneFund {
        uint256 amount;
        MilestoneStatus status;
    }

    mapping(bytes32 ideaId => IdeaFund) public ideas;
    mapping(bytes32 milestoneId => MilestoneFund) public milestones;
    // milestoneId → ideaId (for lookups)
    mapping(bytes32 milestoneId => bytes32) public milestoneIdea;

    // ─── Functions ────────────────────────────────────────────────────────────

    /// @notice Poster funds an idea by depositing tokens into escrow.
    /// @param ideaId  Unique identifier for the idea (keccak256 of idea data off-chain).
    /// @param token   ERC-20 token address (USDC on Arc).
    /// @param amount  Amount of tokens to deposit.
    function fundIdea(bytes32 ideaId, address token, uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        if (ideas[ideaId].exists) revert IdeaAlreadyFunded(ideaId);

        bool ok = IERC20(token).transferFrom(msg.sender, address(this), amount);
        if (!ok) revert TransferFailed();

        ideas[ideaId] = IdeaFund({
            poster: msg.sender,
            token: token,
            totalFunded: amount,
            available: amount,
            exists: true
        });

        emit IdeaFunded(ideaId, msg.sender, token, amount);
    }

    /// @notice Reserve funds for a specific milestone (called by broker on job creation).
    /// @dev Only the original poster can reserve milestones. In production, use a trusted
    ///      broker contract instead of msg.sender check for automation.
    function reserveMilestone(bytes32 ideaId, bytes32 milestoneId, uint256 amount) external {
        IdeaFund storage fund = ideas[ideaId];
        if (!fund.exists) revert IdeaNotFunded(ideaId);
        if (msg.sender != fund.poster) revert Unauthorized();
        if (amount == 0) revert ZeroAmount();
        if (fund.available < amount) revert InsufficientBalance(ideaId, amount, fund.available);
        if (milestones[milestoneId].status != MilestoneStatus.None) revert MilestoneAlreadyReserved(milestoneId);

        fund.available -= amount;
        milestones[milestoneId] = MilestoneFund({ amount: amount, status: MilestoneStatus.Reserved });
        milestoneIdea[milestoneId] = ideaId;

        emit MilestoneReserved(ideaId, milestoneId, amount);
    }

    /// @notice Reserve multiple milestones in one poster-approved transaction.
    function reserveMilestones(
        bytes32 ideaId,
        bytes32[] calldata milestoneIds,
        uint256[] calldata amounts
    ) external {
        IdeaFund storage fund = ideas[ideaId];
        if (!fund.exists) revert IdeaNotFunded(ideaId);
        if (msg.sender != fund.poster) revert Unauthorized();
        if (milestoneIds.length != amounts.length) revert ArrayLengthMismatch();

        uint256 totalRequired = 0;
        for (uint256 i = 0; i < milestoneIds.length; i++) {
            bytes32 milestoneId = milestoneIds[i];
            uint256 amount = amounts[i];
            if (amount == 0) revert ZeroAmount();
            if (milestones[milestoneId].status != MilestoneStatus.None) {
                revert MilestoneAlreadyReserved(milestoneId);
            }
            totalRequired += amount;
        }

        if (fund.available < totalRequired) revert InsufficientBalance(ideaId, totalRequired, fund.available);

        fund.available -= totalRequired;
        for (uint256 i = 0; i < milestoneIds.length; i++) {
            bytes32 milestoneId = milestoneIds[i];
            uint256 amount = amounts[i];
            milestones[milestoneId] = MilestoneFund({ amount: amount, status: MilestoneStatus.Reserved });
            milestoneIdea[milestoneId] = ideaId;

            emit MilestoneReserved(ideaId, milestoneId, amount);
        }
    }

    /// @notice Release reserved funds to a worker after accepted output.
    /// @dev Only the poster can call this (human approval gate).
    function releaseMilestone(bytes32 ideaId, bytes32 milestoneId, address worker) external {
        IdeaFund storage fund = ideas[ideaId];
        if (!fund.exists) revert IdeaNotFunded(ideaId);
        if (msg.sender != fund.poster) revert Unauthorized();

        MilestoneFund storage m = milestones[milestoneId];
        if (m.status != MilestoneStatus.Reserved) {
            if (m.status == MilestoneStatus.None) revert MilestoneNotReserved(milestoneId);
            revert MilestoneAlreadySettled(milestoneId);
        }

        uint256 amount = m.amount;
        m.status = MilestoneStatus.Released;

        bool ok = IERC20(fund.token).transfer(worker, amount);
        if (!ok) revert TransferFailed();

        emit MilestoneReleased(ideaId, milestoneId, worker, amount);
    }

    /// @notice Refund reserved funds back to the poster (on rejection or expiry).
    function refundMilestone(bytes32 ideaId, bytes32 milestoneId, address poster) external {
        IdeaFund storage fund = ideas[ideaId];
        if (!fund.exists) revert IdeaNotFunded(ideaId);
        if (msg.sender != fund.poster) revert Unauthorized();
        if (poster != fund.poster) revert Unauthorized();

        MilestoneFund storage m = milestones[milestoneId];
        if (m.status != MilestoneStatus.Reserved) {
            if (m.status == MilestoneStatus.None) revert MilestoneNotReserved(milestoneId);
            revert MilestoneAlreadySettled(milestoneId);
        }

        uint256 amount = m.amount;
        m.status = MilestoneStatus.Refunded;
        fund.available += amount;

        // Note: refund returns to escrow pool (available for re-reservation), not directly to poster.
        // To withdraw back to wallet, poster calls withdrawIdea() (future feature).

        emit MilestoneRefunded(ideaId, milestoneId, poster, amount);
    }

    // ─── View helpers ─────────────────────────────────────────────────────────

    function getIdeaBalance(bytes32 ideaId) external view returns (uint256 available, uint256 total) {
        IdeaFund storage fund = ideas[ideaId];
        return (fund.available, fund.totalFunded);
    }

    function getMilestoneStatus(bytes32 milestoneId) external view returns (MilestoneStatus) {
        return milestones[milestoneId].status;
    }
}
