// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IdeaEscrow} from "../src/IdeaEscrow.sol";
import {IdentityGate} from "../src/IdentityGate.sol";
import {AgentIdentityRegistry} from "../src/AgentIdentityRegistry.sol";
import {AdvancedArcEscrow} from "../src/AdvancedArcEscrow.sol";

/// @title Deploy
/// @notice Deployment script for Intelligence Exchange Cannes 2026 contracts
/// @dev Supports local, testnet, and mainnet deployments
///
/// Environment Variables:
/// - PRIVATE_KEY: Deployer private key (required)
/// - ATTESTOR_ADDRESS: Optional override for attestor (defaults to deployer)
/// - PLATFORM_WALLET: Address to receive platform fees (required for AdvancedArcEscrow)
/// - DISPUTE_RESOLVER: Address authorized to resolve disputes (required for AdvancedArcEscrow)
/// - ARC_TESTNET: Set to "true" to deploy to Arc testnet with testnet USDC
///
/// Arc Testnet Configuration:
/// - RPC: https://rpc.testnet.arc.network
/// - Chain ID: 5042002
/// - USDC: 0x3600000000000000000000000000000000000000 (native gas token)
/// - Explorer: https://testnet.arcscan.app
contract Deploy is Script {
    // Arc Testnet USDC (also gas token)
    address public constant ARC_TESTNET_USDC = 0x3600000000000000000000000000000000000000;
    
    struct DeploymentResult {
        IdentityGate identityGate;
        AgentIdentityRegistry registry;
        IdeaEscrow ideaEscrow;
        AdvancedArcEscrow advancedEscrow;
        address deployer;
        address attestor;
        address platformWallet;
        address disputeResolver;
    }

    function run() external returns (DeploymentResult memory result) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        result.deployer = vm.addr(deployerPrivateKey);
        result.attestor = result.deployer;
        
        // Optional: Use configured attestor
        try vm.envAddress("ATTESTOR_ADDRESS") returns (address configuredAttestor) {
            result.attestor = configuredAttestor;
        } catch {
            console2.log("Using deployer as attestor:", result.deployer);
        }
        
        // Get or set platform wallet
        try vm.envAddress("PLATFORM_WALLET") returns (address configuredPlatform) {
            result.platformWallet = configuredPlatform;
        } catch {
            result.platformWallet = result.deployer;
            console2.log("Using deployer as platform wallet:", result.platformWallet);
        }
        
        // Get or set dispute resolver
        try vm.envAddress("DISPUTE_RESOLVER") returns (address configuredResolver) {
            result.disputeResolver = configuredResolver;
        } catch {
            result.disputeResolver = result.deployer;
            console2.log("Using deployer as dispute resolver:", result.disputeResolver);
        }
        
        // Detect chain
        uint256 chainId = block.chainid;
        console2.log("Deploying to chain ID:", chainId);
        
        bool isArcTestnet = (chainId == 5042002);
        bool isArcMainnet = (chainId == 360); // Arc mainnet chain ID
        
        if (isArcTestnet) {
            console2.log("=== ARC TESTNET DETECTED ===");
            console2.log("USDC Address:", ARC_TESTNET_USDC);
        } else if (isArcMainnet) {
            console2.log("=== ARC MAINNET DETECTED ===");
        }

        vm.startBroadcast(deployerPrivateKey);

        // Deploy core contracts
        result.identityGate = new IdentityGate(result.attestor);
        console2.log("IdentityGate deployed at:", address(result.identityGate));
        
        result.registry = new AgentIdentityRegistry(
            address(result.identityGate), 
            result.attestor
        );
        console2.log("AgentIdentityRegistry deployed at:", address(result.registry));
        
        // Deploy legacy IdeaEscrow (for backwards compatibility)
        result.ideaEscrow = new IdeaEscrow();
        console2.log("IdeaEscrow (legacy) deployed at:", address(result.ideaEscrow));
        
        // Deploy AdvancedArcEscrow (Prize 1 submission)
        result.advancedEscrow = new AdvancedArcEscrow(
            address(result.identityGate),
            result.platformWallet,
            result.disputeResolver
        );
        console2.log("AdvancedArcEscrow (Prize 1) deployed at:", address(result.advancedEscrow));

        vm.stopBroadcast();

        // Log deployment summary
        console2.log("\n=== DEPLOYMENT SUMMARY ===");
        console2.log("Chain ID:", chainId);
        console2.log("Deployer:", result.deployer);
        console2.log("Attestor:", result.attestor);
        console2.log("Platform Wallet:", result.platformWallet);
        console2.log("Dispute Resolver:", result.disputeResolver);
        console2.log("");
        console2.log("Contracts:");
        console2.log("  IdentityGate:", address(result.identityGate));
        console2.log("  AgentIdentityRegistry:", address(result.registry));
        console2.log("  IdeaEscrow (legacy):", address(result.ideaEscrow));
        console2.log("  AdvancedArcEscrow (Prize 1):", address(result.advancedEscrow));
        
        if (isArcTestnet) {
            console2.log("\n=== ARC TESTNET INTEGRATION ===");
            console2.log("USDC (native gas token):", ARC_TESTNET_USDC);
            console2.log("Explorer: https://testnet.arcscan.app");
            console2.log("Faucet: https://faucet.circle.com");
            console2.log("\nTo fund your wallet with test USDC:");
            console2.log("  1. Visit https://faucet.circle.com");
            console2.log("  2. Select 'Arc Testnet'");
            console2.log("  3. Request USDC and EURC");
            console2.log("  4. Use the AdvancedArcEscrow at:", address(result.advancedEscrow));
        }
        
        // Write deployment addresses to a file for easy reference
        _writeDeploymentJson(result, chainId);
        
        return result;
    }
    
    /// @notice Write deployment addresses to JSON file
    function _writeDeploymentJson(DeploymentResult memory result, uint256 chainId) internal {
        string memory json = string.concat(
            '{\n',
            '  "chainId": ', vm.toString(chainId), ',\n',
            '  "deployer": "', vm.toString(result.deployer), '",\n',
            '  "attestor": "', vm.toString(result.attestor), '",\n',
            '  "platformWallet": "', vm.toString(result.platformWallet), '",\n',
            '  "disputeResolver": "', vm.toString(result.disputeResolver), '",\n',
            '  "contracts": {\n',
            '    "IdentityGate": "', vm.toString(address(result.identityGate)), '",\n',
            '    "AgentIdentityRegistry": "', vm.toString(address(result.registry)), '",\n',
            '    "IdeaEscrow": "', vm.toString(address(result.ideaEscrow)), '",\n',
            '    "AdvancedArcEscrow": "', vm.toString(address(result.advancedEscrow)), '"\n',
            '  },\n',
            '  "arc": {\n',
            '    "usdc": "', vm.toString(ARC_TESTNET_USDC), '",\n',
            '    "explorer": "https://testnet.arcscan.app"\n',
            '  }\n',
            '}\n'
        );
        
        // Note: In production, you'd write this to a file
        // vm.writeFile(string.concat("deployments/", vm.toString(chainId), ".json"), json);
        console2.log("\nDeployment JSON:");
        console2.log(json);
    }
}
