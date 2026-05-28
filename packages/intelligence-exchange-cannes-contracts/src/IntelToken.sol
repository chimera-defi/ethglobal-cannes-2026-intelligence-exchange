// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IntelToken
/// @notice Minimal ERC-20 with max supply, burn, emergency pause, and a dedicated minter role.
///
/// Roles:
///   owner   — pause/unpause, transferOwnership (two-step), setMinter
///   minter  — mint up to maxSupply (set to IntelMintController after deployment)
///
/// Separating minter from owner means the mint controller can be rotated or upgraded
/// without surrendering the emergency-pause key to an external contract.
contract IntelToken {
    // ─── Errors ──────────────────────────────────────────────────────────────

    error Unauthorized();
    error ZeroAddress();
    error InsufficientBalance();
    error InsufficientAllowance();
    error MaxSupplyExceeded(uint256 requested, uint256 remaining);
    error ContractPaused();

    // ─── Events ───────────────────────────────────────────────────────────────

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event MinterSet(address indexed previousMinter, address indexed newMinter);
    event Minted(address indexed to, uint256 amount);
    event Burned(address indexed from, uint256 amount);
    event Paused(address indexed account);
    event Unpaused(address indexed account);

    // ─── Storage ──────────────────────────────────────────────────────────────

    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    uint256 public maxSupply;

    address public owner;
    address public pendingOwner;  // Ownable2Step — must accept before ownership transfers
    address public minter;        // Dedicated mint role — set to IntelMintController

    bool public paused;

    mapping(address account => uint256) public balanceOf;
    mapping(address account => mapping(address spender => uint256)) public allowance;

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyMinter() {
        if (msg.sender != minter && msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert ContractPaused();
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(
        string memory tokenName,
        string memory tokenSymbol,
        address initialOwner,
        uint256 initialSupply,
        uint256 _maxSupply
    ) {
        if (initialOwner == address(0)) revert ZeroAddress();
        if (_maxSupply > 0 && initialSupply > _maxSupply) revert MaxSupplyExceeded(initialSupply, _maxSupply);
        name = tokenName;
        symbol = tokenSymbol;
        owner = initialOwner;
        maxSupply = _maxSupply;
        emit OwnershipTransferred(address(0), initialOwner);
        _mint(initialOwner, initialSupply);
    }

    // ─── ERC-20 ───────────────────────────────────────────────────────────────

    function transfer(address to, uint256 amount) external whenNotPaused returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        _approve(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external whenNotPaused returns (bool) {
        uint256 currentAllowance = allowance[from][msg.sender];
        if (currentAllowance < amount) revert InsufficientAllowance();
        unchecked {
            _approve(from, msg.sender, currentAllowance - amount);
        }
        _transfer(from, to, amount);
        return true;
    }

    // ─── Mint / Burn ──────────────────────────────────────────────────────────

    /// @notice Mint `amount` INTEL to `to`. Callable by `minter` or `owner`.
    ///         Set `minter` to IntelMintController via setMinter() after deployment.
    function mint(address to, uint256 amount) external onlyMinter whenNotPaused {
        if (maxSupply > 0 && totalSupply + amount > maxSupply) {
            revert MaxSupplyExceeded(amount, maxSupply - totalSupply);
        }
        _mint(to, amount);
        emit Minted(to, amount);
    }

    function burn(uint256 amount) external whenNotPaused {
        _burn(msg.sender, amount);
    }

    function burnFrom(address from, uint256 amount) external whenNotPaused {
        uint256 currentAllowance = allowance[from][msg.sender];
        if (currentAllowance < amount) revert InsufficientAllowance();
        unchecked {
            _approve(from, msg.sender, currentAllowance - amount);
        }
        _burn(from, amount);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    /// @notice Set the minter role. Pass address(0) to revoke.
    ///         Should be called with IntelMintController's address right after deployment.
    function setMinter(address _minter) external onlyOwner {
        emit MinterSet(minter, _minter);
        minter = _minter;
    }

    // ─── Ownable2Step ─────────────────────────────────────────────────────────

    /// @notice Begin ownership transfer. New owner must call acceptOwnership().
    ///         Two-step prevents irrecoverable loss from typo or wrong address.
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    /// @notice Nominee accepts ownership. Completes the two-step transfer.
    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert Unauthorized();
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = address(0);
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _transfer(address from, address to, uint256 amount) internal {
        if (to == address(0)) revert ZeroAddress();
        uint256 fromBalance = balanceOf[from];
        if (fromBalance < amount) revert InsufficientBalance();
        unchecked {
            balanceOf[from] = fromBalance - amount;
        }
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }

    function _approve(address tokenOwner, address spender, uint256 amount) internal {
        if (spender == address(0)) revert ZeroAddress();
        allowance[tokenOwner][spender] = amount;
        emit Approval(tokenOwner, spender, amount);
    }

    function _mint(address to, uint256 amount) internal {
        if (to == address(0)) revert ZeroAddress();
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function _burn(address from, uint256 amount) internal {
        if (from == address(0)) revert ZeroAddress();
        uint256 fromBalance = balanceOf[from];
        if (fromBalance < amount) revert InsufficientBalance();
        unchecked {
            balanceOf[from] = fromBalance - amount;
        }
        totalSupply -= amount;
        emit Transfer(from, address(0), amount);
        emit Burned(from, amount);
    }
}
