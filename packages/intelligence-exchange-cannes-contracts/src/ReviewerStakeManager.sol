// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @custom:security-contact security@iex.cannes

import {IntelToken} from "./IntelToken.sol";

/// @title ReviewerStakeManager
/// @notice Manages reviewer bonds, fee distribution, and slashing for the Assay Protocol.
///
/// Reviewers post INTEL bonds to become eligible for human review tasks.
/// They earn a share of treasury fees for submitted reviews and can be slashed
/// if a review is overturned by dispute. This makes the human acceptance gate
/// economically meaningful, not just identity-gated.
contract ReviewerStakeManager {
    // ─── Errors ──────────────────────────────────────────────────────────────

    error Unauthorized();
    error InsufficientBond();
    error ZeroAmount();
    error ZeroAddress();
    error CooldownActive(uint256 availableAt);
    error NoPendingUnstake();
    error InsufficientFeeBalance();
    error NotEligible();

    // ─── Events ───────────────────────────────────────────────────────────────

    event ReviewerRegistered(address indexed reviewer, uint256 bondAmount, uint256 totalBond);
    event ReviewerSlashed(address indexed reviewer, uint256 amount, uint256 remainingBond);
    event ReviewFeeRecorded(address indexed reviewer, uint256 feeAmount, uint256 totalEarned);
    event ReviewFeeClaimed(address indexed reviewer, uint256 amount);
    event UnstakeRequested(address indexed reviewer, uint256 amount, uint256 availableAt);
    event UnstakeFinalized(address indexed reviewer, uint256 amount);
    event BondUpdated(address indexed reviewer, uint256 oldBond, uint256 newBond);
    event OperatorSet(address indexed operator, bool approved);
    event OwnershipTransferStarted(address indexed previous, address indexed next);
    event OwnershipTransferred(address indexed previous, address indexed next);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event MinReviewerBondUpdated(uint256 oldMin, uint256 newMin);
    event ReviewerFeeShareUpdated(uint256 oldBps, uint256 newBps);
    event UnstakeCooldownUpdated(uint256 oldCooldown, uint256 newCooldown);

    // ─── Storage ──────────────────────────────────────────────────────────────

    IntelToken public immutable intel;
    
    uint256 public minReviewerBond; // default 500e18 INTEL
    mapping(address => uint256) public reviewerBond;
    mapping(address => bool) public eligibleReviewers;
    mapping(address => uint256) public reviewsSubmitted;
    mapping(address => uint256) public reviewFeeEarned;
    uint256 public reviewerFeeShareBps; // default 1000 (10% of treasury = 1% of total)
    uint256 public unstakeCooldown; // default 30 days
    mapping(address => uint256) public unstakeAvailableAt;
    mapping(address => uint256) public pendingUnstake;
    address public treasury;
    mapping(address => bool) public operators;

    address public owner;
    address public pendingOwner;

    // ─── Reentrancy guard ─────────────────────────────────────────────────────

    uint256 private _reentrancyStatus;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    modifier nonReentrant() {
        require(_reentrancyStatus != _ENTERED, "ReviewerStakeManager: reentrant call");
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

    /// @notice Deploy ReviewerStakeManager.
    /// @param _intel Address of the INTEL ERC-20 token.
    /// @param _treasury Address of the treasury contract.
    constructor(address _intel, address _treasury) {
        if (_intel == address(0)) revert ZeroAddress();
        if (_treasury == address(0)) revert ZeroAddress();
        
        intel = IntelToken(_intel);
        treasury = _treasury;
        owner = msg.sender;
        
        minReviewerBond = 500e18;
        reviewerFeeShareBps = 1000; // 10%
        unstakeCooldown = 30 days;
        
        _reentrancyStatus = _NOT_ENTERED;
    }

    // ─── Reviewer Registration ────────────────────────────────────────────────

    /// @notice Register as a reviewer by posting a bond.
    /// @dev Caller must have approved this contract to transfer INTEL.
    /// @param bondAmount INTEL amount to bond (in wei, 18 decimals).
    function registerAsReviewer(uint256 bondAmount) external nonReentrant {
        if (bondAmount == 0) revert ZeroAmount();
        
        uint256 oldBond = reviewerBond[msg.sender];
        
        // Transfer INTEL from caller to contract
        bool transferOk = intel.transferFrom(msg.sender, address(this), bondAmount);
        require(transferOk, "ReviewerStakeManager: bond transferFrom failed");
        
        reviewerBond[msg.sender] += bondAmount;
        
        // Update eligibility based on new bond amount
        if (reviewerBond[msg.sender] >= minReviewerBond) {
            eligibleReviewers[msg.sender] = true;
        } else {
            eligibleReviewers[msg.sender] = false;
        }
        
        emit ReviewerRegistered(msg.sender, bondAmount, reviewerBond[msg.sender]);
        emit BondUpdated(msg.sender, oldBond, reviewerBond[msg.sender]);
    }

    // ─── Unstaking ─────────────────────────────────────────────────────────────

    /// @notice Request to unstake bond amount. Begins cooldown period.
    /// @param amount INTEL amount to unstake.
    function requestUnstake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (reviewerBond[msg.sender] < amount) revert InsufficientBond();
        
        uint256 oldBond = reviewerBond[msg.sender];
        reviewerBond[msg.sender] -= amount;
        pendingUnstake[msg.sender] += amount;
        unstakeAvailableAt[msg.sender] = block.timestamp + unstakeCooldown;
        
        // Update eligibility if remaining bond falls below minimum
        if (reviewerBond[msg.sender] < minReviewerBond) {
            eligibleReviewers[msg.sender] = false;
        }
        
        emit UnstakeRequested(msg.sender, amount, unstakeAvailableAt[msg.sender]);
        emit BondUpdated(msg.sender, oldBond, reviewerBond[msg.sender]);
    }

    /// @notice Finalize unstake after cooldown period expires.
    function finalizeUnstake() external nonReentrant {
        if (pendingUnstake[msg.sender] == 0) revert NoPendingUnstake();
        if (block.timestamp < unstakeAvailableAt[msg.sender]) {
            revert CooldownActive(unstakeAvailableAt[msg.sender]);
        }
        
        uint256 amount = pendingUnstake[msg.sender];
        pendingUnstake[msg.sender] = 0;
        unstakeAvailableAt[msg.sender] = 0;
        
        bool transferOk = intel.transfer(msg.sender, amount);
        require(transferOk, "ReviewerStakeManager: unstake transfer failed");
        
        emit UnstakeFinalized(msg.sender, amount);
    }

    // ─── Fee Management ───────────────────────────────────────────────────────

    /// @notice Record a review and credit the reviewer with their fee share.
    /// @dev Called by broker on task acceptance. Mints reviewer fee share to reviewer's claimable balance.
    /// @custom:access operator only
    /// @param reviewer Address of the reviewer.
    /// @param taskValue Total task value in INTEL (used to calculate fee share).
    function recordReview(address reviewer, uint256 taskValue) external onlyOperator {
        if (reviewer == address(0)) revert ZeroAddress();
        if (!eligibleReviewers[reviewer]) revert NotEligible();
        if (taskValue == 0) revert ZeroAmount();
        
        uint256 feeAmount = (taskValue * reviewerFeeShareBps) / 10000;
        
        reviewsSubmitted[reviewer] += 1;
        reviewFeeEarned[reviewer] += feeAmount;
        
        emit ReviewFeeRecorded(reviewer, feeAmount, reviewFeeEarned[reviewer]);
    }

    /// @notice Claim accumulated review fees.
    function claimReviewFees() external nonReentrant {
        uint256 fees = reviewFeeEarned[msg.sender];
        if (fees == 0) revert ZeroAmount();
        if (intel.balanceOf(address(this)) < fees) revert InsufficientFeeBalance();
        
        reviewFeeEarned[msg.sender] = 0;
        
        bool transferOk = intel.transfer(msg.sender, fees);
        require(transferOk, "ReviewerStakeManager: fee claim transfer failed");
        
        emit ReviewFeeClaimed(msg.sender, fees);
    }

    /// @notice Deposit INTEL to fund fee payouts. Called by treasury.
    /// @custom:access operator only
    /// @param amount INTEL amount to deposit.
    function depositFees(uint256 amount) external onlyOperator {
        if (amount == 0) revert ZeroAmount();
        
        bool transferOk = intel.transferFrom(msg.sender, address(this), amount);
        require(transferOk, "ReviewerStakeManager: fee deposit transferFrom failed");
    }

    // ─── Slashing ─────────────────────────────────────────────────────────────

    /// @notice Slash a reviewer's bond for misconduct or overturned review.
    /// @dev Slashed amount is sent to treasury. Reviewer becomes ineligible if bond falls below minimum.
    /// @custom:access operator only
    /// @param reviewer Address of the reviewer to slash.
    /// @param amount INTEL amount to slash.
    function slash(address reviewer, uint256 amount) external onlyOperator {
        if (reviewer == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (reviewerBond[reviewer] < amount) revert InsufficientBond();
        
        uint256 oldBond = reviewerBond[reviewer];
        reviewerBond[reviewer] -= amount;
        
        // Update eligibility if remaining bond falls below minimum
        if (reviewerBond[reviewer] < minReviewerBond) {
            eligibleReviewers[reviewer] = false;
        }
        
        // Transfer slashed amount to treasury
        bool transferOk = intel.transfer(treasury, amount);
        require(transferOk, "ReviewerStakeManager: slash transfer failed");
        
        emit ReviewerSlashed(reviewer, amount, reviewerBond[reviewer]);
        emit BondUpdated(reviewer, oldBond, reviewerBond[reviewer]);
    }

    // ─── View Functions ───────────────────────────────────────────────────────

    /// @notice Check if a reviewer is eligible to review.
    /// @param reviewer Address to check.
    /// @return True if reviewer has sufficient bond.
    function isEligible(address reviewer) external view returns (bool) {
        return eligibleReviewers[reviewer];
    }

    // ─── Admin Functions ──────────────────────────────────────────────────────

    /// @notice Approve or revoke an operator address.
    /// @custom:access owner
    /// @param op Address to configure.
    /// @param approved True to grant operator rights, false to revoke.
    function setOperator(address op, bool approved) external onlyOwner {
        if (op == address(0)) revert ZeroAddress();
        operators[op] = approved;
        emit OperatorSet(op, approved);
    }

    /// @notice Update the treasury address.
    /// @custom:access owner
    /// @param newTreasury New treasury address.
    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        emit TreasuryUpdated(treasury, newTreasury);
        treasury = newTreasury;
    }

    /// @notice Update the minimum reviewer bond.
    /// @custom:access owner
    /// @param newMinBond New minimum bond in INTEL wei.
    function setMinReviewerBond(uint256 newMinBond) external onlyOwner {
        emit MinReviewerBondUpdated(minReviewerBond, newMinBond);
        minReviewerBond = newMinBond;
    }

    /// @notice Update the reviewer fee share basis points.
    /// @custom:access owner
    /// @param newFeeShareBps New fee share in basis points (100 = 1%).
    function setReviewerFeeShareBps(uint256 newFeeShareBps) external onlyOwner {
        emit ReviewerFeeShareUpdated(reviewerFeeShareBps, newFeeShareBps);
        reviewerFeeShareBps = newFeeShareBps;
    }

    /// @notice Update the unstake cooldown period.
    /// @custom:access owner
    /// @param newCooldown New cooldown in seconds.
    function setUnstakeCooldown(uint256 newCooldown) external onlyOwner {
        emit UnstakeCooldownUpdated(unstakeCooldown, newCooldown);
        unstakeCooldown = newCooldown;
    }

    /// @notice Begin ownership transfer. Nominee must call acceptOwnership().
    /// @custom:access owner
    /// @param newOwner Nominee address.
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    /// @notice Nominee accepts ownership to complete the two-step transfer.
    /// @custom:access pendingOwner
    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert Unauthorized();
        address previousOwner = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, owner);
    }
}