// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {IdeaEscrow} from "../src/IdeaEscrow.sol";
import {AgentIdentityRegistry} from "../src/AgentIdentityRegistry.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract DeployCannes is Script {
    address constant ANVIL_ACCOUNT_0 = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
    address constant ANVIL_ACCOUNT_1 = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
    uint256 constant LOCAL_FAUCET_AMOUNT = 1_000_000e6;

    function run() external returns (IdeaEscrow escrow, AgentIdentityRegistry registry, MockUSDC usdc) {
        vm.startBroadcast();
        escrow = new IdeaEscrow();
        registry = new AgentIdentityRegistry(msg.sender);
        usdc = new MockUSDC();
        usdc.mint(msg.sender, LOCAL_FAUCET_AMOUNT);
        usdc.mint(ANVIL_ACCOUNT_0, LOCAL_FAUCET_AMOUNT);
        usdc.mint(ANVIL_ACCOUNT_1, LOCAL_FAUCET_AMOUNT);
        vm.stopBroadcast();
    }
}
