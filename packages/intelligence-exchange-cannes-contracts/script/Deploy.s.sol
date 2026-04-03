// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {IdeaEscrow} from "../src/IdeaEscrow.sol";
import {AgentIdentityRegistry} from "../src/AgentIdentityRegistry.sol";

contract DeployCannes is Script {
    function run() external returns (IdeaEscrow escrow, AgentIdentityRegistry registry) {
        vm.startBroadcast();
        escrow = new IdeaEscrow();
        registry = new AgentIdentityRegistry(msg.sender);
        vm.stopBroadcast();
    }
}
