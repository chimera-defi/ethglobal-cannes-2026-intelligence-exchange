// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IdeaEscrow} from "../src/IdeaEscrow.sol";
import {IdentityGate} from "../src/IdentityGate.sol";
import {AgentIdentityRegistry} from "../src/AgentIdentityRegistry.sol";
import {AdvancedArcEscrow} from "../src/AdvancedArcEscrow.sol";
import {IntelToken} from "../src/IntelToken.sol";
import {IntelMintController} from "../src/IntelMintController.sol";
import {IntelStaking} from "../src/IntelStaking.sol";
import {WorkReceipt1155} from "../src/WorkReceipt1155.sol";

/// @title Deploy
/// @notice Deployment script for Intelligence Exchange Cannes 2026 contracts
/// @dev Supports local, testnet, and mainnet deployments
///
/// Environment Variables:
/// - PRIVATE_KEY: Deployer private key (required)
/// - ATTESTOR_ADDRESS: Optional override for attestor (defaults to deployer)
/// - STAKER_YIELD_RECEIVER: Address to receive staker yield (defaults to deployer)
/// - PLATFORM_WALLET: Address to receive platform fees (defaults to deployer)
/// - DISPUTE_RESOLVER: Address authorized to resolve disputes (defaults to deployer)
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

    // IntelToken defaults
    string  public constant INTEL_NAME          = "Intelligence Exchange Token";
    string  public constant INTEL_SYMBOL        = "INTEL";
    uint256 public constant INTEL_INITIAL_SUPPLY = 10_000_000e18; // 10 M
    uint256 public constant INTEL_MAX_SUPPLY     = 100_000_000e18; // 100 M cap

    // IntelStaking defaults
    uint256 public constant STAKING_EPOCH_LENGTH   = 7 days;
    uint256 public constant STAKING_COOLDOWN       = 3 days;
    uint256 public constant STAKING_K              = 1e18;
    uint256 public constant STAKING_WALLET_CAP     = 5_000_000e18; // 5 M per wallet
    uint256 public constant STAKING_GLOBAL_EPOCH_CAP = 20_000_000e18; // 20 M per epoch

    // IntelMintController defaults
    uint256 public constant MINT_FLOOR_PRICE   = 0.001e18; // 0.001 payment units per INTEL
    uint256 public constant MINT_PREMIUM_BPS   = 500;      // 5% premium above TWAP
    uint256 public constant MINT_INITIAL_TWAP  = 0.001e18; // bootstrapped at floor

    // WorkReceipt1155 default metadata base URI
    string  public constant WORK_RECEIPT_BASE_URI = "https://api.iex.cannes/metadata/receipts/";

    struct DeploymentResult {
        IdentityGate identityGate;
        AgentIdentityRegistry registry;
        IdeaEscrow ideaEscrow;
        AdvancedArcEscrow advancedEscrow;
        IntelToken intelToken;
        IntelMintController mintController;
        IntelStaking staking;
        WorkReceipt1155 workReceipt;
        address deployer;
        address attestor;
        address stakerYieldReceiver;
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

        // Get or set staker yield receiver
        try vm.envAddress("STAKER_YIELD_RECEIVER") returns (address configuredStaker) {
            result.stakerYieldReceiver = configuredStaker;
        } catch {
            result.stakerYieldReceiver = result.deployer;
            console2.log("Using deployer as staker yield receiver:", result.stakerYieldReceiver);
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

        // ── 1. IdentityGate ──────────────────────────────────────────────────
        result.identityGate = new IdentityGate(result.attestor);
        console2.log("IdentityGate deployed at:", address(result.identityGate));

        // ── 2. AgentIdentityRegistry ─────────────────────────────────────────
        result.registry = new AgentIdentityRegistry(
            address(result.identityGate),
            result.attestor
        );
        console2.log("AgentIdentityRegistry deployed at:", address(result.registry));

        // ── 3. IdeaEscrow (legacy, backwards-compat) ─────────────────────────
        result.ideaEscrow = new IdeaEscrow(result.stakerYieldReceiver, result.platformWallet);
        console2.log("IdeaEscrow (legacy) deployed at:", address(result.ideaEscrow));

        // ── 4. AdvancedArcEscrow (Prize 1 — Arc native USDC escrow) ──────────
        result.advancedEscrow = new AdvancedArcEscrow(
            address(result.identityGate),
            result.stakerYieldReceiver,
            result.platformWallet,
            result.disputeResolver
        );
        console2.log("AdvancedArcEscrow (Prize 1) deployed at:", address(result.advancedEscrow));

        // ── 5. IntelToken ────────────────────────────────────────────────────
        result.intelToken = new IntelToken(
            INTEL_NAME,
            INTEL_SYMBOL,
            result.deployer,   // initialOwner: deployer mints to itself, transfers later
            INTEL_INITIAL_SUPPLY,
            INTEL_MAX_SUPPLY
        );
        console2.log("IntelToken deployed at:", address(result.intelToken));

        // ── 6. IntelStaking ──────────────────────────────────────────────────
        result.staking = new IntelStaking(
            address(result.intelToken),
            STAKING_EPOCH_LENGTH,
            STAKING_COOLDOWN,
            STAKING_K,
            STAKING_WALLET_CAP,
            STAKING_GLOBAL_EPOCH_CAP
        );
        console2.log("IntelStaking deployed at:", address(result.staking));

        // ── 7. IntelMintController ───────────────────────────────────────────
        result.mintController = new IntelMintController(
            address(result.intelToken),
            address(result.staking),
            result.platformWallet,  // POL address (protocol-owned liquidity)
            result.platformWallet,  // treasury address (same wallet, can be split later)
            MINT_FLOOR_PRICE,
            MINT_PREMIUM_BPS,
            MINT_INITIAL_TWAP
        );
        console2.log("IntelMintController deployed at:", address(result.mintController));

        // ── 8. WorkReceipt1155 ───────────────────────────────────────────────
        result.workReceipt = new WorkReceipt1155(
            result.deployer,
            WORK_RECEIPT_BASE_URI
        );
        console2.log("WorkReceipt1155 deployed at:", address(result.workReceipt));

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
        console2.log("  IntelToken:", address(result.intelToken));
        console2.log("  IntelStaking:", address(result.staking));
        console2.log("  IntelMintController:", address(result.mintController));
        console2.log("  WorkReceipt1155:", address(result.workReceipt));

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
            '    "AdvancedArcEscrow": "', vm.toString(address(result.advancedEscrow)), '",\n',
            '    "IntelToken": "', vm.toString(address(result.intelToken)), '",\n',
            '    "IntelStaking": "', vm.toString(address(result.staking)), '",\n',
            '    "IntelMintController": "', vm.toString(address(result.mintController)), '",\n',
            '    "WorkReceipt1155": "', vm.toString(address(result.workReceipt)), '"\n',
            '  },\n',
            '  "arc": {\n',
            '    "usdc": "', vm.toString(ARC_TESTNET_USDC), '",\n',
            '    "explorer": "https://testnet.arcscan.app"\n',
            '  }\n',
            '}\n'
        );

        // Uncomment to write addresses file after deployment:
        // vm.writeFile(string.concat("deployments/", vm.toString(chainId), ".json"), json);
        console2.log("\nDeployment JSON:");
        console2.log(json);
    }
}
