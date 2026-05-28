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
import {IntelTimelockController} from "../src/IntelTimelockController.sol";
import {IntelVesting} from "../src/IntelVesting.sol";
import {IntelPOLManager} from "../src/IntelPOLManager.sol";

/// @title Deploy
/// @notice Deployment script for Intelligence Exchange Cannes 2026 contracts
/// @dev Supports local, testnet, and mainnet deployments
///
/// Environment Variables:
/// - PRIVATE_KEY:         Deployer private key (required)
/// - ATTESTOR_ADDRESS:    Optional override for attestor (defaults to deployer)
/// - STAKER_YIELD_RECEIVER: Address to receive staker yield (defaults to deployer)
/// - PLATFORM_WALLET:     Address to receive platform fees / treasury (defaults to deployer)
/// - DISPUTE_RESOLVER:    Address authorized to resolve disputes (defaults to deployer)
/// - TEAM_WALLET:         Recipient of team vesting (defaults to deployer)
/// - GRANTS_MULTISIG:     Recipient of ecosystem grants tranche (defaults to deployer)
/// - TIMELOCK_DELAY:      TimelockController delay in seconds (default: 172800 = 48h)
///                        For testnets, set to 900 (15 min) or 7200 (2h)
///
/// Supported Chains:
/// - Ethereum Mainnet (1)
/// - Sepolia testnet (11155111)
/// - Base Mainnet (8453)
/// - Base Sepolia (84532)
/// - Anvil local (31337)
contract Deploy is Script {
    // Uniswap V3 NonfungiblePositionManager
    address public constant POSITION_MANAGER_MAINNET = 0xC36442b4a4522E871399CD717aBDD847Ab11FE88;
    address public constant POSITION_MANAGER_SEPOLIA = 0x1238536071E1c677A632429e3655c799b22cDA52;
    address public constant POSITION_MANAGER_BASE = 0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1;
    address public constant POSITION_MANAGER_BASE_SEPOLIA = 0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2;

    // WETH9
    address public constant WETH9_MAINNET = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address public constant WETH9_SEPOLIA = 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14;
    address public constant WETH9_BASE = 0x4200000000000000000000000000000000000006;
    address public constant WETH9_BASE_SEPOLIA = 0x4200000000000000000000000000000000000006;

    // USDC per chain (Circle canonical addresses)
    address public constant USDC_MAINNET      = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address public constant USDC_SEPOLIA      = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;
    address public constant USDC_BASE         = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address public constant USDC_BASE_SEPOLIA = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    // IntelToken defaults
    string  public constant INTEL_NAME          = "Intelligence Exchange Token";
    string  public constant INTEL_SYMBOL        = "INTEL";
    uint256 public constant INTEL_INITIAL_SUPPLY = 10_000_000e18; // 10 M initial mint
    uint256 public constant INTEL_MAX_SUPPLY     = 100_000_000e18; // 100 M cap

    // IntelStaking defaults
    uint256 public constant STAKING_EPOCH_LENGTH     = 7 days;
    uint256 public constant STAKING_COOLDOWN         = 3 days;
    uint256 public constant STAKING_K                = 1e18;
    uint256 public constant STAKING_WALLET_CAP       = 5_000_000e18;  // 5 M per wallet
    uint256 public constant STAKING_GLOBAL_EPOCH_CAP = 20_000_000e18; // 20 M per epoch

    // IntelMintController defaults
    uint256 public constant MINT_FLOOR_PRICE   = 0.001e18; // 0.001 ETH per INTEL
    uint256 public constant MINT_PREMIUM_BPS   = 500;      // 5% premium above TWAP
    uint256 public constant MINT_INITIAL_TWAP  = 0.001e18; // bootstrapped at floor

    // WorkReceipt1155 default metadata base URI (can be overridden via WORK_RECEIPT_BASE_URI env var)

    // ── Token distribution (from 10M initial mint) ──────────────────────
    // Total: 10M = 2M + 2M + 2M + 2M + 1M + 1M
    uint256 public constant DIST_TEAM        = 2_000_000e18; // Team - 4yr/1yr cliff vesting
    uint256 public constant DIST_TREASURY    = 2_000_000e18; // Treasury - held by timelock
    uint256 public constant DIST_POL         = 2_000_000e18; // POL bootstrap - held by POLManager
    uint256 public constant DIST_STAKING     = 2_000_000e18; // Staking rewards reserve
    uint256 public constant DIST_GRANTS      = 1_000_000e18; // Ecosystem grants multisig
    uint256 public constant DIST_AIRDROP     = 1_000_000e18; // Early adopter / airdrop

    // Vesting schedule - 4 years total, 1 year cliff
    uint256 public constant VEST_CLIFF_DELAY = 365 days;
    uint256 public constant VEST_DURATION    = 3 * 365 days; // 3yr linear after cliff

    // Default timelock delay: 48h mainnet / override for testnet
    uint256 public constant DEFAULT_TIMELOCK_DELAY = 48 hours;

    struct DeploymentResult {
        // Core infra
        IdentityGate identityGate;
        AgentIdentityRegistry registry;
        // Escrows
        IdeaEscrow ideaEscrow;
        AdvancedArcEscrow advancedEscrow;
        // Token stack
        IntelToken intelToken;
        IntelMintController mintController;
        IntelStaking staking;
        WorkReceipt1155 workReceipt;
        // Credibility / governance
        IntelTimelockController timelockController;
        IntelVesting teamVesting;
        IntelPOLManager polManager;
        // Addresses
        address deployer;
        address attestor;
        address stakerYieldReceiver;
        address platformWallet;
        address disputeResolver;
        address teamWallet;
        address grantsMultisig;
    }

    function run() external returns (DeploymentResult memory result) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        result.deployer = vm.addr(deployerPrivateKey);
        result.attestor = result.deployer;

        // ── Address resolution ───────────────────────────────────────────
        try vm.envAddress("ATTESTOR_ADDRESS") returns (address a) {
            result.attestor = a;
        } catch { console2.log("Attestor: deployer default"); }

        try vm.envAddress("STAKER_YIELD_RECEIVER") returns (address a) {
            result.stakerYieldReceiver = a;
        } catch {
            result.stakerYieldReceiver = result.deployer;
        }

        try vm.envAddress("PLATFORM_WALLET") returns (address a) {
            result.platformWallet = a;
        } catch {
            result.platformWallet = result.deployer;
        }

        try vm.envAddress("DISPUTE_RESOLVER") returns (address a) {
            result.disputeResolver = a;
        } catch {
            result.disputeResolver = result.deployer;
        }

        try vm.envAddress("TEAM_WALLET") returns (address a) {
            result.teamWallet = a;
        } catch {
            result.teamWallet = result.deployer;
            console2.log("TEAM_WALLET not set - using deployer as team wallet");
        }

        try vm.envAddress("GRANTS_MULTISIG") returns (address a) {
            result.grantsMultisig = a;
        } catch {
            result.grantsMultisig = result.deployer;
            console2.log("GRANTS_MULTISIG not set - using deployer as grants multisig");
        }

        uint256 timelockDelay = vm.envOr("TIMELOCK_DELAY", uint256(48 hours));
        console2.log("TIMELOCK_DELAY:", timelockDelay);

        // ── Chain detection & address resolution ─────────────────────────
        uint256 chainId    = block.chainid;
        bool isTestnet     = chainId == 11155111 /* Sepolia */ || chainId == 84532 /* Base Sepolia */;

        console2.log("Deploying to chain ID:", chainId);
        if (chainId == 1)        console2.log("=== ETHEREUM MAINNET ===");
        if (chainId == 11155111) console2.log("=== SEPOLIA TESTNET ===");
        if (chainId == 8453)     console2.log("=== BASE MAINNET ===");
        if (chainId == 84532)    console2.log("=== BASE SEPOLIA TESTNET ===");
        if (chainId == 31337)    console2.log("=== ANVIL LOCAL ===");
        if (isTestnet && timelockDelay == DEFAULT_TIMELOCK_DELAY) {
            // Suggest shorter delay for testnet
            console2.log("TIP: Set TIMELOCK_DELAY=900 for testnet demos (15 min)");
        }

        // Resolve chain-specific addresses (before broadcast)
        address positionManager;
        address weth9;
        address usdc;
        if (chainId == 1) {
            positionManager = POSITION_MANAGER_MAINNET;
            weth9 = WETH9_MAINNET;
            usdc = USDC_MAINNET;
        } else if (chainId == 11155111) {
            positionManager = POSITION_MANAGER_SEPOLIA;
            weth9 = WETH9_SEPOLIA;
            usdc = USDC_SEPOLIA;
        } else if (chainId == 8453) {
            positionManager = POSITION_MANAGER_BASE;
            weth9 = WETH9_BASE;
            usdc = USDC_BASE;
        } else if (chainId == 84532) {
            positionManager = POSITION_MANAGER_BASE_SEPOLIA;
            weth9 = WETH9_BASE_SEPOLIA;
            usdc = USDC_BASE_SEPOLIA;
        } else if (chainId == 31337) {
            // Anvil local: deployer acts as placeholder
            positionManager = result.deployer;
            weth9 = result.deployer;
            usdc = result.deployer; // placeholder — tests mock USDC
        } else {
            // Fallback: deployer as placeholder for unknown chains
            positionManager = result.deployer;
            weth9 = result.deployer;
            usdc = result.deployer;
        }

        vm.startBroadcast(deployerPrivateKey);

        // ── 1. IdentityGate ──────────────────────────────────────────────
        result.identityGate = new IdentityGate(result.attestor);
        console2.log("IdentityGate:", address(result.identityGate));

        // ── 2. AgentIdentityRegistry ─────────────────────────────────────
        result.registry = new AgentIdentityRegistry(
            address(result.identityGate),
            result.attestor
        );
        console2.log("AgentIdentityRegistry:", address(result.registry));

        // ── 3. IdeaEscrow (legacy) ───────────────────────────────────────
        result.ideaEscrow = new IdeaEscrow(result.stakerYieldReceiver, result.platformWallet);
        console2.log("IdeaEscrow (legacy):", address(result.ideaEscrow));

        // ── 4. AdvancedArcEscrow ─────────────────────────────────────────
        result.advancedEscrow = new AdvancedArcEscrow(
            usdc,
            address(result.identityGate),
            result.stakerYieldReceiver,
            result.platformWallet,
            result.disputeResolver
        );
        console2.log("AdvancedArcEscrow:", address(result.advancedEscrow));

        // ── 5. IntelToken ────────────────────────────────────────────────
        result.intelToken = new IntelToken(
            INTEL_NAME,
            INTEL_SYMBOL,
            result.deployer,   // deployer mints initial supply then routes it
            INTEL_INITIAL_SUPPLY,
            INTEL_MAX_SUPPLY
        );
        console2.log("IntelToken:", address(result.intelToken));

        // ── 6. IntelStaking ──────────────────────────────────────────────
        result.staking = new IntelStaking(
            address(result.intelToken),
            STAKING_EPOCH_LENGTH,
            STAKING_COOLDOWN,
            STAKING_K,
            STAKING_WALLET_CAP,
            STAKING_GLOBAL_EPOCH_CAP
        );
        console2.log("IntelStaking:", address(result.staking));

        // ── 7. IntelTimelockController ───────────────────────────────────
        address[] memory proposers = new address[](1);
        proposers[0] = result.deployer; // deployer is initial proposer; rotate to multisig later
        result.timelockController = new IntelTimelockController(
            result.deployer,   // admin (rotate to multisig post-deploy)
            timelockDelay,
            proposers
        );
        console2.log("IntelTimelockController:", address(result.timelockController));

        // ── 8. IntelPOLManager ───────────────────────────────────────────
        result.polManager = new IntelPOLManager(
            result.deployer,   // owner; rotate to timelock post-deploy
            address(result.intelToken),
            positionManager,
            weth9
        );
        console2.log("IntelPOLManager:", address(result.polManager));

        // ── 9. IntelMintController ───────────────────────────────────────
        // POL address is the polManager; mint proceeds flow there automatically.
        result.mintController = new IntelMintController(
            address(result.intelToken),
            address(result.staking),
            address(result.polManager),  // POL to IntelPOLManager
            result.platformWallet,       // treasury
            MINT_FLOOR_PRICE,
            MINT_PREMIUM_BPS,
            MINT_INITIAL_TWAP
        );
        console2.log("IntelMintController:", address(result.mintController));

        // ── 10. WorkReceipt1155 ──────────────────────────────────────────
        string memory baseUri = vm.envOr("WORK_RECEIPT_BASE_URI", string("https://api.iex.cannes/metadata/receipts/"));
        result.workReceipt = new WorkReceipt1155(
            result.deployer,
            baseUri
        );
        console2.log("WorkReceipt1155:", address(result.workReceipt));

        // ── 11. IntelVesting (team) ──────────────────────────────────────
        result.teamVesting = new IntelVesting(
            address(result.intelToken),
            result.teamWallet,
            address(result.timelockController), // treasury = timelock (revocation authority)
            block.timestamp,
            VEST_CLIFF_DELAY,
            VEST_DURATION,
            DIST_TEAM
        );
        console2.log("IntelVesting (team):", address(result.teamVesting));

        // ── 12. Post-deployment wiring ───────────────────────────────────

        // IntelToken: grant mint rights to IntelMintController.
        result.intelToken.setMinter(address(result.mintController));
        console2.log("IntelToken.minter to IntelMintController");

        // IntelStaking: whitelist IntelMintController as operator.
        result.staking.setOperator(address(result.mintController), true);
        console2.log("IntelStaking operator: IntelMintController whitelisted");

        // IntelMintController: whitelist deployer as bootstrap operator.
        //   Remove after a keeper / multisig operator is established.
        result.mintController.setOperator(result.deployer, true);
        console2.log("IntelMintController operator: deployer bootstrap-whitelisted");

        // WorkReceipt1155: attestor must be an operator to mint receipts on-chain.
        result.workReceipt.setOperator(result.attestor, true);
        console2.log("WorkReceipt1155 operator: attestor whitelisted");

        // ── 13. Token distribution ───────────────────────────────────────
        console2.log("\n--- Token distribution (from 10M initial supply) ---");

        // 2M to IntelVesting (team)
        result.intelToken.transfer(address(result.teamVesting), DIST_TEAM);
        console2.log("2M INTEL to IntelVesting (team)");

        // 2M to IntelTimelockController (treasury reserve)
        result.intelToken.transfer(address(result.timelockController), DIST_TREASURY);
        console2.log("2M INTEL to IntelTimelockController (treasury reserve)");

        // 2M to IntelPOLManager (POL bootstrap)
        result.intelToken.transfer(address(result.polManager), DIST_POL);
        console2.log("2M INTEL to IntelPOLManager (POL bootstrap)");

        // 2M to IntelStaking as INTEL yield deposit
        //   Approve first, then depositYield. This seeds the yield reserve.
        result.intelToken.approve(address(result.staking), DIST_STAKING);
        result.staking.depositYield(DIST_STAKING);
        console2.log("2M INTEL to IntelStaking.depositYield (staking rewards reserve)");

        // 1M to Grants multisig
        result.intelToken.transfer(result.grantsMultisig, DIST_GRANTS);
        console2.log("1M INTEL to Grants multisig:", result.grantsMultisig);

        // 1M to Deployer (early adopter / airdrop reserve)
        //   Already held by deployer - no transfer needed
        console2.log("1M INTEL to Deployer (airdrop reserve, already held)");

        vm.stopBroadcast();

        // ── Print deployment summary ─────────────────────────────────────
        console2.log("\n=== DEPLOYMENT SUMMARY ===");
        console2.log("Chain ID:     ", chainId);
        console2.log("Deployer:     ", result.deployer);
        console2.log("Attestor:     ", result.attestor);
        console2.log("Platform:     ", result.platformWallet);
        console2.log("Team wallet:  ", result.teamWallet);
        console2.log("Grants:       ", result.grantsMultisig);
        console2.log("Dispute:      ", result.disputeResolver);
        console2.log("");
        console2.log("Contracts:");
        console2.log("  IdentityGate:              ", address(result.identityGate));
        console2.log("  AgentIdentityRegistry:     ", address(result.registry));
        console2.log("  IdeaEscrow (legacy):       ", address(result.ideaEscrow));
        console2.log("  AdvancedArcEscrow:         ", address(result.advancedEscrow));
        console2.log("  IntelToken:                ", address(result.intelToken));
        console2.log("  IntelStaking:              ", address(result.staking));
        console2.log("  IntelTimelockController:   ", address(result.timelockController));
        console2.log("  IntelPOLManager:           ", address(result.polManager));
        console2.log("  IntelMintController:       ", address(result.mintController));
        console2.log("  WorkReceipt1155:           ", address(result.workReceipt));
        console2.log("  IntelVesting (team):       ", address(result.teamVesting));
        console2.log("");
        console2.log("Token distribution:");
        console2.log("  Team vesting (4yr/1yr cliff): 2,000,000 INTEL");
        console2.log("  Treasury timelock:            2,000,000 INTEL");
        console2.log("  POL bootstrap:                2,000,000 INTEL");
        console2.log("  Staking rewards:              2,000,000 INTEL");
        console2.log("  Ecosystem grants:             1,000,000 INTEL");
        console2.log("  Airdrop reserve:              1,000,000 INTEL");
        console2.log("  Remaining mintable:          90,000,000 INTEL (via IntelMintController)");

        _writeDeploymentJson(result, chainId);

        return result;
    }

    function _writeDeploymentJson(DeploymentResult memory result, uint256 chainId) internal {
        string memory json = string.concat(
            '{\n',
            '  "chainId": ', vm.toString(chainId), ',\n',
            '  "deployer": "', vm.toString(result.deployer), '",\n',
            '  "attestor": "', vm.toString(result.attestor), '",\n',
            '  "platformWallet": "', vm.toString(result.platformWallet), '",\n',
            '  "teamWallet": "', vm.toString(result.teamWallet), '",\n',
            '  "grantsMultisig": "', vm.toString(result.grantsMultisig), '",\n',
            '  "disputeResolver": "', vm.toString(result.disputeResolver), '",\n',
            '  "contracts": {\n',
            '    "IdentityGate": "', vm.toString(address(result.identityGate)), '",\n',
            '    "AgentIdentityRegistry": "', vm.toString(address(result.registry)), '",\n',
            '    "IdeaEscrow": "', vm.toString(address(result.ideaEscrow)), '",\n',
            '    "AdvancedArcEscrow": "', vm.toString(address(result.advancedEscrow)), '",\n',
            '    "IntelToken": "', vm.toString(address(result.intelToken)), '",\n',
            '    "IntelStaking": "', vm.toString(address(result.staking)), '",\n',
            '    "IntelTimelockController": "', vm.toString(address(result.timelockController)), '",\n',
            '    "IntelPOLManager": "', vm.toString(address(result.polManager)), '",\n',
            '    "IntelMintController": "', vm.toString(address(result.mintController)), '",\n',
            '    "WorkReceipt1155": "', vm.toString(address(result.workReceipt)), '",\n',
            '    "IntelVesting_team": "', vm.toString(address(result.teamVesting)), '"\n',
            '  },\n',
            '  "distribution": {\n',
            '    "team_vesting_intel": "2000000",\n',
            '    "treasury_timelock_intel": "2000000",\n',
            '    "pol_bootstrap_intel": "2000000",\n',
            '    "staking_rewards_intel": "2000000",\n',
            '    "grants_intel": "1000000",\n',
            '    "airdrop_intel": "1000000",\n',
            '    "mintable_remaining_intel": "90000000"\n',
            '  }\n',
            '}\n'
        );

        // Write to deployments/ directory (requires fs_permissions in foundry.toml)
        vm.writeFile(
            string.concat("deployments/", vm.toString(chainId), ".json"),
            json
        );
        console2.log("\nDeployment JSON written to: deployments/", vm.toString(chainId), ".json");
    }
}
