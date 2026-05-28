// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title WorkReceipt1155
/// @notice Soulbound ERC-1155 receipts for accepted work milestones.
///         One token ID per accepted milestone, quantity always 1.
///         Non-transferable: reverts on transfer unless from == address(0) (mint).
///
/// Metadata stored on-chain per token:
///   - taskId        bytes32  — task identifier
///   - workerFingerprint bytes32 — agent fingerprint from AgentIdentityRegistry
///   - score         uint8   — acceptance score (0–100)
///   - acceptedAt    uint40  — unix timestamp of acceptance
///
/// Token IDs are sequential starting at 1.
contract WorkReceipt1155 {
    // ─── Errors ──────────────────────────────────────────────────────────────

    error Unauthorized();
    error ZeroAddress();
    error Soulbound();
    error InvalidScore(uint256 score);
    error AlreadyMinted(bytes32 taskId);

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
    event ReceiptMinted(
        uint256 indexed tokenId,
        address indexed worker,
        bytes32 indexed taskId,
        bytes32 workerFingerprint,
        uint8 score,
        uint256 acceptedAt
    );
    event OperatorSet(address indexed op, bool approved);
    event OwnershipTransferred(address indexed previous, address indexed next);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);

    // ─── Storage ──────────────────────────────────────────────────────────────

    struct Receipt {
        bytes32 taskId;
        bytes32 workerFingerprint;
        uint8   score;
        uint40  acceptedAt;
    }

    address public owner;
    address public pendingOwner;
    mapping(address => bool) public operators;

    string public baseURI; // e.g. "ipfs://Qm.../metadata/"

    uint256 public nextTokenId = 1;

    // ERC-1155 balances: tokenId → owner → balance (0 or 1 for soulbound)
    mapping(uint256 => mapping(address => uint256)) private _balances;

    // On-chain metadata per tokenId
    mapping(uint256 => Receipt) public receipts;

    // Soulbound owner per tokenId (needed since we don't track by address → ids)
    mapping(uint256 => address) public tokenOwner;

    // Prevent double-minting for the same task
    mapping(bytes32 => uint256) public taskToTokenId; // taskId → tokenId (0 if not minted)

    // ERC-1155 approval (kept for interface compliance; all transfers revert anyway)
    mapping(address => mapping(address => bool)) private _operatorApprovals;

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

    constructor(address _owner, string memory _baseURI) {
        if (_owner == address(0)) revert ZeroAddress();
        owner = _owner;
        baseURI = _baseURI;
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
    ///      Emits event for wallet compatibility without actually setting approval.
    function setApprovalForAll(address operator, bool approved) external {
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function isApprovedForAll(address /*account*/, address /*operator*/) external pure returns (bool) {
        return false;
    }

    /// @dev All transfers revert — soulbound.
    function safeTransferFrom(address, address, uint256, uint256, bytes calldata) external pure {
        revert Soulbound();
    }

    function safeBatchTransferFrom(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external pure
    {
        revert Soulbound();
    }

    function uri(uint256 id) external view returns (string memory) {
        return string(abi.encodePacked(baseURI, _uint256ToString(id)));
    }

    // ─── Mint ─────────────────────────────────────────────────────────────────

    /// @notice Mint one receipt for an accepted milestone.
    /// @param worker           Address receiving the soulbound receipt.
    /// @param taskId           Task identifier.
    /// @param workerFingerprint Agent fingerprint from AgentIdentityRegistry.
    /// @param score            Acceptance score (0–100).
    /// @return tokenId         The newly minted token ID.
    function mint(
        address worker,
        bytes32 taskId,
        bytes32 workerFingerprint,
        uint8 score
    ) external onlyOperator returns (uint256 tokenId) {
        if (worker == address(0)) revert ZeroAddress();
        if (score > 100) revert InvalidScore(score);
        if (taskToTokenId[taskId] != 0) revert AlreadyMinted(taskId);

        tokenId = nextTokenId++;
        uint40 acceptedAt = uint40(block.timestamp);

        receipts[tokenId] = Receipt({
            taskId: taskId,
            workerFingerprint: workerFingerprint,
            score: score,
            acceptedAt: acceptedAt
        });
        tokenOwner[tokenId] = worker;
        taskToTokenId[taskId] = tokenId;

        _balances[tokenId][worker] = 1;

        emit TransferSingle(msg.sender, address(0), worker, tokenId, 1);
        emit ReceiptMinted(tokenId, worker, taskId, workerFingerprint, score, acceptedAt);
    }

    // ─── View helpers ─────────────────────────────────────────────────────────

    function getReceipt(uint256 tokenId) external view returns (Receipt memory) {
        return receipts[tokenId];
    }

    function getReceiptByTask(bytes32 taskId) external view returns (uint256 tokenId, Receipt memory receipt) {
        tokenId = taskToTokenId[taskId];
        receipt = receipts[tokenId];
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setOperator(address op, bool approved) external onlyOwner {
        if (op == address(0)) revert ZeroAddress();
        operators[op] = approved;
        emit OperatorSet(op, approved);
    }

    function setBaseURI(string calldata _baseURI) external onlyOwner {
        baseURI = _baseURI;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert Unauthorized();
        address old = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(old, owner);
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _uint256ToString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
