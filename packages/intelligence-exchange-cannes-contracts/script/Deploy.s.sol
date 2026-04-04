// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IdeaEscrow} from "../src/IdeaEscrow.sol";
import {AdvancedArcEscrow} from "../src/AdvancedArcEscrow.sol";
import {IdentityGate} from "../src/IdentityGate.sol";
import {AgentIdentityRegistry} from "../src/AgentIdentityRegistry.sol";

contract Deploy is Script {
    function run() external returns (IdentityGate identityGate, AgentIdentityRegistry registry, IdeaEscrow escrow, AdvancedArcEscrow advancedEscrow) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address attestor = vm.addr(deployerPrivateKey);

        try vm.envAddress("ATTESTOR_ADDRESS") returns (address configuredAttestor) {
            attestor = configuredAttestor;
        } catch {}
        
        address platformWallet = vm.envOr("PLATFORM_WALLET", attestor);
        address disputeResolver = vm.envOr("DISPUTE_RESOLVER", attestor);

        vm.startBroadcast(deployerPrivateKey);

        identityGate = new IdentityGate(attestor);
        registry = new AgentIdentityRegistry(address(identityGate), attestor);
        escrow = new IdeaEscrow();
        advancedEscrow = new AdvancedArcEscrow(address(identityGate), platformWallet, disputeResolver);

        vm.stopBroadcast();

        console2.log("=== ARC PRIZE 1 DEPLOYMENT ===");
        console2.log("Chain ID:", block.chainid);
        console2.log("IdentityGate:", address(identityGate));
        console2.log("AgentIdentityRegistry:", address(registry));
        console2.log("IdeaEscrow (legacy):", address(escrow));
        console2.log("AdvancedArcEscrow (Prize 1):", address(advancedEscrow));
        console2.log("Platform Wallet:", platformWallet);
        console2.log("Dispute Resolver:", disputeResolver);
        console2.log("Attestor:", attestor);
        
        if (block.chainid == 5042002) {
            console2.log("");
            console2.log("ARC TESTNET CONFIGURATION:");
            console2.log("USDC: 0x3600000000000000000000000000000000000000");
            console2.log("Explorer: https://testnet.arcscan.app");
            console2.log("Faucet: https://faucet.circle.com");
        }
    }
}
