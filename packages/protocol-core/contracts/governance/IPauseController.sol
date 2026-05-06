// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IPauseController
/// @notice Interface for emergency pause coordination across protocol contracts.
interface IPauseController {
    function paused() external view returns (bool);
    function pause() external;
    function unpause() external;
}
