// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @custom:security-contact security@iex.cannes

import {ReviewerStakeManager} from "./ReviewerStakeManager.sol";

/// @title ReviewerCredential
/// @notice Soulbound ERC-1155 tier credential for Assay Protocol reviewers.
///
/// Tiers (tokenId):
///   - 0: Bonded    — reviewer posted bond in ReviewerStakeManager
///   - 1: Apprentice — 10+ reviews, slash rate < 15%
///   - 2: Verified  — 50+ reviews, slash rate < 8%
///   - 3: Expert    — 200+ reviews, slash rate < 3%
///
/// Each reviewer holds exactly one active tier token. Upgrades burn old and mint new atomically.
/// Non-transferable: reverts on all transfer attempts.
contract ReviewerCredential {
    // ─── Errors ──────────────────────────────────────────────────────────────

    error Unauthorized();
    error ZeroAddress();
    error AlreadyMinted();
    error NotCredentialed();
    error NotEligible();
    error SoulboundNonTransferable();

    // ─── Events ───────────────────────────────────────────────────────────────

    // ERC-1155 standard events
    event TransferSingle(
        address indexed operator,
        address indexed from,
        address indexed to,
        uint256 id,
        uint256 value
    );
    event TransferBatch(
        address indexed operator,
        address indexed from,
        address indexed to,
        uint256[] ids,
        uint256[] values
    );
    event ApprovalForAll(address indexed account, address indexed operator, bool approved);
    event URI(string value, uint256 indexed id);

    // Domain-specific
    event CredentialMinted(address indexed reviewer, uint256 tier);
    event TierUpdated(address indexed reviewer, uint256 oldTier, uint256 newTier);
    event OperatorSet(address indexed operator, bool approved);
    event OwnershipTransferStarted(address indexed previous, address indexed next);
    event OwnershipTransferred(address indexed previous, address indexed next);

    // ─── Constants ────────────────────────────────────────────────────────────

    uint256 public constant TIER_1_MIN_REVIEWS = 10;
    uint256 public constant TIER_2_MIN_REVIEWS = 50;
    uint256 public constant TIER_3_MIN_REVIEWS = 200;
    uint256 public constant TIER_1_MAX_SLASH_BPS = 1500; // 15%
    uint256 public constant TIER_2_MAX_SLASH_BPS = 800;  // 8%
    uint256 public constant TIER_3_MAX_SLASH_BPS = 300;  // 3%
    uint256 public constant TIER_GRACE_PERIOD = 7 days;  // Grace period before tier downgrade

    // ─── Storage ──────────────────────────────────────────────────────────────

    ReviewerStakeManager public immutable reviewerStakeManager;

    address public owner;
    address public pendingOwner;
    mapping(address => bool) public operators;

    // Tier tracking
    mapping(address => uint256) public currentTier;       // reviewer -> active tier (0-3)
    mapping(address => bool) public hasMinted;           // reviewer -> has initial credential
    mapping(address => uint256) public slashCount;       // reviewer -> slash count (for rate calculation)
    mapping(address => uint256) public tierProbationaryUntil; // reviewer -> timestamp when probation ends

    // ERC-1155 balances: tokenId -> owner -> balance (0 or 1 for soulbound)
    mapping(uint256 => mapping(address => uint256)) private _balances;

    // ERC-1155 approval (kept for interface compliance; all transfers revert anyway)
    mapping(address => mapping(address => bool)) private _operatorApprovals;

    // ─── Reentrancy guard ─────────────────────────────────────────────────────

    uint256 private _reentrancyStatus;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    modifier nonReentrant() {
        require(_reentrancyStatus != _ENTERED, "ReviewerCredential: reentrant call");
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

    /// @notice Deploy ReviewerCredential.
    /// @param _reviewerStakeManager Address of the ReviewerStakeManager contract.
    constructor(address _reviewerStakeManager) {
        if (_reviewerStakeManager == address(0)) revert ZeroAddress();
        reviewerStakeManager = ReviewerStakeManager(_reviewerStakeManager);
        owner = msg.sender;
        _reentrancyStatus = _NOT_ENTERED;
    }

    // ─── ERC-1155 Interface ───────────────────────────────────────────────────

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x01ffc9a7 // ERC-165
            || interfaceId == 0xd9b67a26; // ERC-1155
    }

    function balanceOf(address account, uint256 id) external view returns (uint256) {
        return _balances[id][account];
    }

    function balanceOfBatch(address[] calldata accounts, uint256[] calldata ids)
        external view returns (uint256[] memory batchBalances)
    {
        require(accounts.length == ids.length, "length mismatch");
        batchBalances = new uint256[](accounts.length);
        for (uint256 i = 0; i < accounts.length; i++) {
            batchBalances[i] = _balances[ids[i]][accounts[i]];
        }
    }

    /// @dev Approval is a no-op since transfers are blocked, but kept for interface compliance.
    function setApprovalForAll(address operator, bool approved) external {
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function isApprovedForAll(address /*account*/, address /*operator*/) external pure returns (bool) {
        return false;
    }

    /// @dev All transfers revert — soulbound (except mint/burn which use internal functions).
    function safeTransferFrom(address, address, uint256, uint256, bytes calldata) external pure {
        revert SoulboundNonTransferable();
    }

    function safeBatchTransferFrom(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external pure
    {
        revert SoulboundNonTransferable();
    }

    function uri(uint256 /*id*/) external pure returns (string memory) {
        return ""; // No metadata URI for tier credentials
    }

    // ─── Credential Management ─────────────────────────────────────────────────

    /// @notice Mint initial credential for a reviewer (Tier 0: Bonded).
    /// @dev Caller must be operator. Reviewer must be eligible in ReviewerStakeManager.
    /// @param reviewer Address to mint credential for.
    function mintInitialCredential(address reviewer) external onlyOperator nonReentrant {
        if (reviewer == address(0)) revert ZeroAddress();
        if (hasMinted[reviewer]) revert AlreadyMinted();
        if (!reviewerStakeManager.isEligible(reviewer)) revert NotEligible();

        hasMinted[reviewer] = true;
        currentTier[reviewer] = 0;
        slashCount[reviewer] = 0; // Initialize slash count

        _balances[0][reviewer] = 1;

        emit TransferSingle(msg.sender, address(0), reviewer, 0, 1);
        emit CredentialMinted(reviewer, 0);
    }

    /// @notice Evaluate and update reviewer tier based on performance.
    /// @dev Caller must be operator. Computes slash rate and determines highest qualifying tier.
    ///      Implements 7-day grace period for tier downgrades.
    /// @param reviewer Address to evaluate.
    /// @param newSlashCount Total slash count for the reviewer.
    function evaluateAndUpdateTier(address reviewer, uint256 newSlashCount) external onlyOperator nonReentrant {
        if (reviewer == address(0)) revert ZeroAddress();
        if (!hasMinted[reviewer]) revert NotCredentialed();

        // Update slash count
        slashCount[reviewer] = newSlashCount;

        uint256 reviewsSubmitted = reviewerStakeManager.reviewsSubmitted(reviewer);
        uint256 newTier = _computeTier(reviewsSubmitted, newSlashCount);
        uint256 oldTier = currentTier[reviewer];

        if (newTier != oldTier) {
            if (newTier < oldTier) {
                // Downgrade: check grace period
                if (tierProbationaryUntil[reviewer] == 0) {
                    // Start 7-day probation instead of immediate downgrade
                    tierProbationaryUntil[reviewer] = block.timestamp + TIER_GRACE_PERIOD;
                    return; // do not downgrade yet
                } else if (block.timestamp < tierProbationaryUntil[reviewer]) {
                    return; // still in grace period
                }
                // Grace period expired — apply downgrade
                delete tierProbationaryUntil[reviewer];
                _updateTier(reviewer, oldTier, newTier);
            } else {
                // Upgrade or same tier — clear any probation
                delete tierProbationaryUntil[reviewer];
                _updateTier(reviewer, oldTier, newTier);
            }
        }
    }

    /// @notice Internal function to update tier (burn old, mint new).
    /// @param reviewer Address to update tier for.
    /// @param oldTier Current tier to burn.
    /// @param newTier New tier to mint.
    function _updateTier(address reviewer, uint256 oldTier, uint256 newTier) internal {
        // Burn old tier
        _balances[oldTier][reviewer] = 0;
        emit TransferSingle(address(this), reviewer, address(0), oldTier, 1);

        // Mint new tier
        currentTier[reviewer] = newTier;
        _balances[newTier][reviewer] = 1;
        emit TransferSingle(address(this), address(0), reviewer, newTier, 1);

        emit TierUpdated(reviewer, oldTier, newTier);
    }

    /// @notice Compute the highest qualifying tier based on reviews and slash rate.
    /// @param reviewsSubmitted Number of reviews submitted.
    /// @param totalSlashCount Number of slashes.
    /// @return Highest qualifying tier (0-3).
    function _computeTier(uint256 reviewsSubmitted, uint256 totalSlashCount) internal pure returns (uint256) {
        if (reviewsSubmitted == 0) return 0; // Tier 0: Bonded

        uint256 slashRateBps = reviewsSubmitted > 0 
            ? (totalSlashCount * 10000) / reviewsSubmitted 
            : 0;

        // Check from highest to lowest
        if (reviewsSubmitted >= TIER_3_MIN_REVIEWS && slashRateBps <= TIER_3_MAX_SLASH_BPS) {
            return 3; // Expert
        }
        if (reviewsSubmitted >= TIER_2_MIN_REVIEWS && slashRateBps <= TIER_2_MAX_SLASH_BPS) {
            return 2; // Verified
        }
        if (reviewsSubmitted >= TIER_1_MIN_REVIEWS && slashRateBps <= TIER_1_MAX_SLASH_BPS) {
            return 1; // Apprentice
        }

        return 0; // Bonded (didn't qualify for higher tier)
    }

    // ─── View Functions ───────────────────────────────────────────────────────

    /// @notice Get the current tier of a reviewer.
    /// @param reviewer Address to query.
    /// @return Current tier (0-3).
    function getReviewerTier(address reviewer) external view returns (uint256) {
        if (!hasMinted[reviewer]) revert NotCredentialed();
        return currentTier[reviewer];
    }

    /// @notice Check if a reviewer meets the minimum tier requirement.
    /// @param reviewer Address to check.
    /// @param minTier Minimum tier required (0-3).
    /// @return True if reviewer's tier >= minTier.
    function meetsMinTier(address reviewer, uint256 minTier) external view returns (bool) {
        if (!hasMinted[reviewer]) return false;
        return currentTier[reviewer] >= minTier;
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