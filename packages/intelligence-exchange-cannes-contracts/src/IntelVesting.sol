// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IntelVesting
/// @notice Linear vesting with cliff for INTEL token allocations.
///
/// A beneficiary receives 0 tokens before `cliff`, then a linear ramp
/// from `cliff` to `cliff + duration`.  The treasury (set at construction)
/// may revoke unvested tokens before the cliff ends; after the cliff
/// vesting is irrevocable.
///
/// No external dependencies — hand-rolled to match the codebase style.
contract IntelVesting {
    // ─── Errors ──────────────────────────────────────────────────────────

    error Unauthorized();
    error ZeroAddress();
    error InvalidDuration(); // duration must be > 0
    error CliffNotReached();
    error AlreadyRevoked();
    error RevocationLockedAfterCliff();
    error NothingToRelease();
    error TransferFailed();

    // ─── Events ───────────────────────────────────────────────────────────

    event Released(address indexed beneficiary, uint256 amount);
    event Revoked(address indexed treasury, uint256 unvestedAmount);

    // ─── Immutables ───────────────────────────────────────────────────────

    /// @notice INTEL token contract
    address public immutable token;

    /// @notice Recipient of vested tokens
    address public immutable beneficiary;

    /// @notice Address that receives unvested tokens on revocation
    address public immutable treasury;

    /// @notice Unix timestamp at which vesting begins (cliff point)
    uint256 public immutable cliff;

    /// @notice Seconds of linear vesting after cliff
    uint256 public immutable duration;

    /// @notice Total INTEL allocated to this schedule
    uint256 public immutable totalAllocation;

    // ─── Storage ──────────────────────────────────────────────────────────

    /// @notice Tokens already released to beneficiary
    uint256 public released;

    /// @notice Whether this schedule has been revoked
    bool public revoked;

    // ─── Constructor ──────────────────────────────────────────────────────

    /// @param _token       INTEL token address
    /// @param _beneficiary Recipient of vested tokens
    /// @param _treasury    Receives unvested tokens on revocation
    /// @param _start       Unix timestamp vesting starts (must be <= cliff)
    /// @param _cliffDelay  Seconds from _start until cliff (0 = no cliff)
    /// @param _duration    Seconds of linear vesting after cliff
    /// @param _allocation  Total INTEL to vest (contract must be funded externally)
    constructor(
        address _token,
        address _beneficiary,
        address _treasury,
        uint256 _start,
        uint256 _cliffDelay,
        uint256 _duration,
        uint256 _allocation
    ) {
        if (_token == address(0))       revert ZeroAddress();
        if (_beneficiary == address(0)) revert ZeroAddress();
        if (_treasury == address(0))    revert ZeroAddress();
        if (_duration == 0)             revert InvalidDuration();

        token           = _token;
        beneficiary     = _beneficiary;
        treasury        = _treasury;
        cliff           = _start + _cliffDelay;
        duration        = _duration;
        totalAllocation = _allocation;
    }

    // ─── Views ────────────────────────────────────────────────────────────

    /// @notice Amount vested at `timestamp` (ignoring already released).
    function vestedAmount(uint256 timestamp) public view returns (uint256) {
        if (revoked) {
            // After revocation no more tokens vest
            return released; // only what was already released is "vested"
        }
        if (timestamp < cliff) {
            return 0;
        }
        uint256 elapsed = timestamp - cliff;
        if (elapsed >= duration) {
            return totalAllocation;
        }
        return (totalAllocation * elapsed) / duration;
    }

    /// @notice Tokens releasable right now.
    function releasable() public view returns (uint256) {
        uint256 vested = vestedAmount(block.timestamp);
        return vested > released ? vested - released : 0;
    }

    // ─── Mutative ─────────────────────────────────────────────────────────

    /// @notice Release all currently releasable tokens to beneficiary.
    ///         Anyone may call this (no access restriction — permissionless release).
    function release() external {
        uint256 amount = releasable();
        if (amount == 0) revert NothingToRelease();

        released += amount;

        // Transfer INTEL to beneficiary
        bool ok = _transfer(token, beneficiary, amount);
        if (!ok) revert TransferFailed();

        emit Released(beneficiary, amount);
    }

    /// @notice Revoke the vesting schedule — only callable by treasury and
    ///         only before the cliff. Unvested tokens are returned to treasury.
    ///
    ///         After the cliff the schedule is irrevocable by design — beneficiaries
    ///         can rely on tokens being delivered once vesting begins.
    function revoke() external {
        if (msg.sender != treasury) revert Unauthorized();
        if (revoked)                revert AlreadyRevoked();
        if (block.timestamp >= cliff) revert RevocationLockedAfterCliff();

        revoked = true;

        // Return all unvested tokens to treasury (released tokens stay with beneficiary)
        uint256 remaining = _tokenBalance(token, address(this));
        if (remaining > 0) {
            bool ok = _transfer(token, treasury, remaining);
            if (!ok) revert TransferFailed();
        }

        emit Revoked(treasury, remaining);
    }

    // ─── Internal helpers ─────────────────────────────────────────────────

    function _transfer(address tok, address to, uint256 amount) internal returns (bool) {
        (bool success, bytes memory data) = tok.call(
            abi.encodeWithSignature("transfer(address,uint256)", to, amount)
        );
        return success && (data.length == 0 || abi.decode(data, (bool)));
    }

    function _tokenBalance(address tok, address account) internal view returns (uint256) {
        (bool success, bytes memory data) = tok.staticcall(
            abi.encodeWithSignature("balanceOf(address)", account)
        );
        if (!success || data.length < 32) return 0;
        return abi.decode(data, (uint256));
    }
}
