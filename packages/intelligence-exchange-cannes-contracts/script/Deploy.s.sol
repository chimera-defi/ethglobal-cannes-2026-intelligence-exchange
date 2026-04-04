// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IdeaEscrow} from "../src/IdeaEscrow.sol";
import {IdentityGate} from "../src/IdentityGate.sol";
import {AgentIdentityRegistry} from "../src/AgentIdentityRegistry.sol";

contract Deploy is Script {
    function run() external returns (IdentityGate identityGate, AgentIdentityRegistry registry, IdeaEscrow escrow) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address attestor = vm.addr(deployerPrivateKey);

        try vm.envAddress("ATTESTOR_ADDRESS") returns (address configuredAttestor) {
            attestor = configuredAttestor;
        } catch {}

        vm.startBroadcast(deployerPrivateKey);

        identityGate = new IdentityGate(attestor);
        registry = new AgentIdentityRegistry(address(identityGate), attestor);
        escrow = new IdeaEscrow();

        vm.stopBroadcast();

        console2.log("IdentityGate:", address(identityGate));
        console2.log("AgentIdentityRegistry:", address(registry));
        console2.log("IdeaEscrow:", address(escrow));
        console2.log("Attestor:", attestor);
    }
}
