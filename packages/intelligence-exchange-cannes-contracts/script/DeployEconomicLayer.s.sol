// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {WorkerStakeManager} from "../src/WorkerStakeManager.sol";
import {ReviewerStakeManager} from "../src/ReviewerStakeManager.sol";
import {BuybackBurn} from "../src/BuybackBurn.sol";
import {DisputeResolution} from "../src/DisputeResolution.sol";
import {EpochRewardDistributor} from "../src/EpochRewardDistributor.sol";
import {CategoryRegistry} from "../src/CategoryRegistry.sol";
import {IntelToken} from "../src/IntelToken.sol";
import {IntelStaking} from "../src/IntelStaking.sol";
import {IntelPOLManager} from "../src/IntelPOLManager.sol";

/// @title DeployEconomicLayer
/// @notice Deployment script for Assay Protocol economic layer contracts
/// @dev Deploys WorkerStakeManager, ReviewerStakeManager, BuybackBurn, DisputeResolution, EpochRewardDistributor, CategoryRegistry
///
/// Environment Variables:
/// - PRIVATE_KEY: Deployer private key (required)
/// - SEPOLIA_RPC_URL: Sepolia RPC URL (required for Sepolia deployment)
/// - PLATFORM_WALLET: Treasury address (defaults to deployer if not set)
///
/// Existing contracts (read from deployments/ or hardcoded for Sepolia):
/// - IntelToken: INTEL token address
/// - IntelStaking: Staking contract address
/// - IntelPOLManager: POL manager address
/// - Treasury: Platform wallet/treasury address
///
/// Supported Chains:
/// - Sepolia testnet (11155111)
/// - Anvil local (31337)
contract DeployEconomicLayer is Script {
    // Uniswap V3 SwapRouter addresses
    address public constant SWAP_ROUTER_SEPOLIA = 0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E;
    
    // WETH9 addresses
    address public constant WETH9_SEPOLIA = 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14;

    struct DeploymentResult {
        WorkerStakeManager workerStakeManager;
        ReviewerStakeManager reviewerStakeManager;
        BuybackBurn buybackBurn;
        DisputeResolution disputeResolution;
        EpochRewardDistributor epochRewardDistributor;
        CategoryRegistry categoryRegistry;
        address deployer;
        address treasury;
        address intelToken;
        address intelStaking;
        address intelPOLManager;
    }

    function run() external returns (DeploymentResult memory result) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        result.deployer = vm.addr(deployerPrivateKey);
        
        // Resolve treasury address
        try vm.envAddress("PLATFORM_WALLET") returns (address a) {
            result.treasury = a;
        } catch {
            result.treasury = result.deployer;
            console2.log("PLATFORM_WALLET not set - using deployer as treasury");
        }

        // Chain detection
        uint256 chainId = block.chainid;
        console2.log("Deploying to chain ID:", chainId);
        if (chainId == 11155111) console2.log("=== SEPOLIA TESTNET ===");
        if (chainId == 31337) console2.log("=== ANVIL LOCAL ===");

        // Resolve existing contract addresses based on chain
        if (chainId == 11155111) {
            // TODO: Replace these with actual Sepolia deployment addresses
            revert("Sepolia deployment addresses not yet configured. Please update the script with actual Sepolia contract addresses.");
        } else if (chainId == 31337) {
            // Use local anvil addresses from existing deployment
            result.intelToken = 0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9;
            result.intelStaking = 0x5FC8d32690cc91D4c39d9d3abcBD16989F875707;
            result.intelPOLManager = 0xa513E6E4b8f2a923D98304ec87F64353C4D5C853;
            console2.log("Using local Anvil addresses from existing deployment");
        } else {
            revert("Unsupported chain ID");
        }

        // Resolve Uniswap addresses
        address swapRouter;
        address weth;
        if (chainId == 11155111) {
            swapRouter = SWAP_ROUTER_SEPOLIA;
            weth = WETH9_SEPOLIA;
        } else if (chainId == 31337) {
            // For local anvil, use deployer as placeholder
            swapRouter = result.deployer;
            weth = result.deployer;
        }

        vm.startBroadcast(deployerPrivateKey);

        // ── 1. WorkerStakeManager ──────────────────────────────────────────────
        result.workerStakeManager = new WorkerStakeManager(
            result.intelToken,
            result.treasury
        );
        console2.log("WorkerStakeManager:", address(result.workerStakeManager));

        // ── 2. ReviewerStakeManager ────────────────────────────────────────────
        result.reviewerStakeManager = new ReviewerStakeManager(
            result.intelToken,
            result.treasury
        );
        console2.log("ReviewerStakeManager:", address(result.reviewerStakeManager));

        // ── 3. BuybackBurn ─────────────────────────────────────────────────────
        result.buybackBurn = new BuybackBurn(
            result.intelToken,
            result.intelPOLManager,
            swapRouter,
            weth,
            result.treasury
        );
        console2.log("BuybackBurn:", address(result.buybackBurn));

        // ── 4. DisputeResolution ───────────────────────────────────────────────
        result.disputeResolution = new DisputeResolution(
            result.intelToken,
            payable(result.intelStaking),
            result.treasury
        );
        console2.log("DisputeResolution:", address(result.disputeResolution));

        // ── 5. EpochRewardDistributor ──────────────────────────────────────────
        result.epochRewardDistributor = new EpochRewardDistributor(
            result.intelToken,
            result.treasury
        );
        console2.log("EpochRewardDistributor:", address(result.epochRewardDistributor));

        // ── 6. CategoryRegistry ─────────────────────────────────────────────────
        result.categoryRegistry = new CategoryRegistry();
        console2.log("CategoryRegistry:", address(result.categoryRegistry));

        // ── Post-deployment wiring ──────────────────────────────────────────────
        
        // Set ReviewerStakeManager and WorkerStakeManager in DisputeResolution
        result.disputeResolution.setReviewerStakeManager(address(result.reviewerStakeManager));
        console2.log("DisputeResolution.setReviewerStakeManager");
        
        result.disputeResolution.setWorkerStakeManager(address(result.workerStakeManager));
        console2.log("DisputeResolution.setWorkerStakeManager");

        // Set deployer as operator for all contracts (for bootstrap)
        result.workerStakeManager.setOperator(result.deployer, true);
        console2.log("WorkerStakeManager.setOperator(deployer, true)");
        
        result.reviewerStakeManager.setOperator(result.deployer, true);
        console2.log("ReviewerStakeManager.setOperator(deployer, true)");
        
        result.buybackBurn.setOperator(result.deployer, true);
        console2.log("BuybackBurn.setOperator(deployer, true)");
        
        result.disputeResolution.setOperator(result.deployer, true);
        console2.log("DisputeResolution.setOperator(deployer, true)");
        
        result.epochRewardDistributor.setOperator(result.deployer, true);
        console2.log("EpochRewardDistributor.setOperator(deployer, true)");
        
        result.categoryRegistry.setOperator(result.deployer, true);
        console2.log("CategoryRegistry.setOperator(deployer, true)");

        vm.stopBroadcast();

        // ── Print deployment summary ─────────────────────────────────────────────
        console2.log("\n=== ECONOMIC LAYER DEPLOYMENT SUMMARY ===");
        console2.log("Chain ID:  ", chainId);
        console2.log("Deployer:  ", result.deployer);
        console2.log("Treasury:  ", result.treasury);
        console2.log("");
        console2.log("Existing Contracts:");
        console2.log("  IntelToken:       ", result.intelToken);
        console2.log("  IntelStaking:     ", result.intelStaking);
        console2.log("  IntelPOLManager:  ", result.intelPOLManager);
        console2.log("");
        console2.log("New Contracts:");
        console2.log("  WorkerStakeManager:        ", address(result.workerStakeManager));
        console2.log("  ReviewerStakeManager:      ", address(result.reviewerStakeManager));
        console2.log("  BuybackBurn:               ", address(result.buybackBurn));
        console2.log("  DisputeResolution:         ", address(result.disputeResolution));
        console2.log("  EpochRewardDistributor:    ", address(result.epochRewardDistributor));
        console2.log("  CategoryRegistry:          ", address(result.categoryRegistry));

        _writeDeploymentJson(result, chainId);

        return result;
    }

    function _writeDeploymentJson(DeploymentResult memory result, uint256 chainId) internal {
        string memory json = string.concat(
            '{\n',
            '  "chainId": ', vm.toString(chainId), ',\n',
            '  "deployer": "', vm.toString(result.deployer), '",\n',
            '  "treasury": "', vm.toString(result.treasury), '",\n',
            '  "existingContracts": {\n',
            '    "IntelToken": "', vm.toString(result.intelToken), '",\n',
            '    "IntelStaking": "', vm.toString(result.intelStaking), '",\n',
            '    "IntelPOLManager": "', vm.toString(result.intelPOLManager), '"\n',
            '  },\n',
            '  "contracts": {\n',
            '    "WorkerStakeManager": "', vm.toString(address(result.workerStakeManager)), '",\n',
            '    "ReviewerStakeManager": "', vm.toString(address(result.reviewerStakeManager)), '",\n',
            '    "BuybackBurn": "', vm.toString(address(result.buybackBurn)), '",\n',
            '    "DisputeResolution": "', vm.toString(address(result.disputeResolution)), '",\n',
            '    "EpochRewardDistributor": "', vm.toString(address(result.epochRewardDistributor)), '",\n',
            '    "CategoryRegistry": "', vm.toString(address(result.categoryRegistry)), '"\n',
            '  }\n',
            '}'
        );

        string memory fileName = string.concat("deployments/", vm.toString(chainId), "-economic-layer.json");
        vm.writeJson(json, fileName);
        console2.log("\nDeployment written to:", fileName);
    }
}