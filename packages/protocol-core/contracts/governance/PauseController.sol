// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPauseController} from "./IPauseController.sol";

/// @title PauseController
/// @notice Emergency pause coordination for the protocol suite.
///         Individual products register their pause-sensitive contracts here.
///         Pausing is governed by a multi-sig or governance contract.
contract PauseController is IPauseController {
    error Unauthorized();

    address public owner;
    bool public paused;

    mapping(address contractAddress => bool registered) public registeredContracts;
    address[] public contractList;

    event Paused(address indexed account);
    event Unpaused(address indexed account);
    event ContractRegistered(address indexed contractAddress);
    event ContractDeregistered(address indexed contractAddress);

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function registerContract(address contractAddress) external onlyOwner {
        if (!registeredContracts[contractAddress]) {
            registeredContracts[contractAddress] = true;
            contractList.push(contractAddress);
            emit ContractRegistered(contractAddress);
        }
    }

    function deregisterContract(address contractAddress) external onlyOwner {
        if (registeredContracts[contractAddress]) {
            registeredContracts[contractAddress] = false;
            // Remove from list (swap-and-pop for gas efficiency)
            uint256 len = contractList.length;
            for (uint256 i = 0; i < len; i++) {
                if (contractList[i] == contractAddress) {
                    contractList[i] = contractList[len - 1];
                    contractList.pop();
                    break;
                }
            }
            emit ContractDeregistered(contractAddress);
        }
    }

    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function getRegisteredContracts() external view returns (address[] memory) {
        return contractList;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }
}
