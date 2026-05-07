// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IAuthorization
/// @notice Pluggable authorization interface for role-based access control.
///         Products can swap implementations (World ID, ERC-8004, Helixa, etc.)
///         without changing settlement contracts.
interface IAuthorization {
    /// @notice Check if an account holds a specific role.
    /// @param account The address to check.
    /// @param role The role identifier (keccak256 hash of role name).
    /// @return True if the account is authorized for the role.
    function isAuthorized(address account, bytes32 role) external view returns (bool);

    /// @notice Grant a role to an account.
    /// @param account The address to authorize.
    /// @param role The role identifier.
    function grantRole(address account, bytes32 role) external;

    /// @notice Revoke a role from an account.
    /// @param account The address to deauthorize.
    /// @param role The role identifier.
    function revokeRole(address account, bytes32 role) external;
}
