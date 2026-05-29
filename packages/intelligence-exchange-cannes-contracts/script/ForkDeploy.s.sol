// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IntelToken} from "../src/IntelToken.sol";
import {IntelTimelockController} from "../src/IntelTimelockController.sol";
import {IntelStaking} from "../src/IntelStaking.sol";
import {IntelMintController} from "../src/IntelMintController.sol";
import {WorkReceipt1155} from "../src/WorkReceipt1155.sol";
import {AgentIdentityRegistry} from "../src/AgentIdentityRegistry.sol";
import {IdentityGate} from "../src/IdentityGate.sol";
import {IntelPOLManager} from "../src/IntelPOLManager.sol";
import {IntelVesting} from "../src/IntelVesting.sol";
import {WorkerStakeManager} from "../src/WorkerStakeManager.sol";
import {ReviewerStakeManager} from "../src/ReviewerStakeManager.sol";
import {BuybackBurn} from "../src/BuybackBurn.sol";
import {DisputeResolution} from "../src/DisputeResolution.sol";
import {EpochRewardDistributor} from "../src/EpochRewardDistributor.sol";
import {CategoryRegistry} from "../src/CategoryRegistry.sol";
import {ReviewerQueue} from "../src/ReviewerQueue.sol";
import {ReviewerCredential} from "../src/ReviewerCredential.sol";
import {TaskEscrow} from "../src/TaskEscrow.sol";
import {INonfungiblePositionManager, IUniswapV3Factory} from "../src/interfaces/IUniswapV3.sol";

/// @title ForkDeploy
/// @notice Deployment script for Assay Protocol mainnet fork demo
/// @dev Deploys full stack on mainnet fork using real Uniswap V3 addresses
contract ForkDeploy is Script {
    // Mainnet Uniswap V3 addresses
    address public constant SWAP_ROUTER = 0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45;
    address public constant POSITION_MANAGER = 0xC36442b4a4522E871399CD717aBDD847Ab11FE88;
    address public constant FACTORY = 0x1F98431c8aD98523631AE4a59f267346ea31F984;
    address public constant WETH9 = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    // IntelToken defaults
    string public constant INTEL_NAME = "Intelligence Exchange Token";
    string public constant INTEL_SYMBOL = "INTEL";
    uint256 public constant INTEL_INITIAL_SUPPLY = 10_000_000e18;
    uint256 public constant INTEL_MAX_SUPPLY = 100_000_000e18;

    // IntelStaking defaults
    uint256 public constant STAKING_EPOCH_LENGTH = 7 days;
    uint256 public constant STAKING_COOLDOWN = 3 days;
    uint256 public constant STAKING_K = 1e18;
    uint256 public constant STAKING_WALLET_CAP = 5_000_000e18;
    uint256 public constant STAKING_GLOBAL_EPOCH_CAP = 20_000_000e18;

    // IntelMintController defaults
    uint256 public constant MINT_FLOOR_PRICE = 0.001e18;
    uint256 public constant MINT_PREMIUM_BPS = 500;
    uint256 public constant MINT_INITIAL_TWAP = 0.001e18;

    // Vesting defaults
    uint256 public constant VEST_CLIFF_DELAY = 365 days;
    uint256 public constant VEST_DURATION = 3 * 365 days;

    struct DeploymentResult {
        IntelToken intelToken;
        IntelTimelockController timelockController;
        IntelStaking staking;
        IntelMintController mintController;
        WorkReceipt1155 workReceipt;
        AgentIdentityRegistry registry;
        IdentityGate identityGate;
        IntelPOLManager polManager;
        IntelVesting teamVesting;
        WorkerStakeManager workerStakeManager;
        ReviewerStakeManager reviewerStakeManager;
        BuybackBurn buybackBurn;
        DisputeResolution disputeResolution;
        EpochRewardDistributor epochRewardDistributor;
        CategoryRegistry categoryRegistry;
        ReviewerQueue reviewerQueue;
        ReviewerCredential reviewerCredential;
        TaskEscrow taskEscrow;
        address deployer;
    }

    function run() external returns (DeploymentResult memory result) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        result.deployer = vm.addr(deployerPrivateKey);

        uint256 chainId = block.chainid;
        console2.log("Deploying to chain ID:", chainId);
        if (chainId == 1) console2.log("=== ETHEREUM MAINNET FORK ===");
        if (chainId == 31337) console2.log("=== ANVIL LOCAL ===");

        vm.startBroadcast(deployerPrivateKey);

        // ── 1. IdentityGate ──────────────────────────────────────────────
        result.identityGate = new IdentityGate(result.deployer);
        console2.log("IdentityGate:", address(result.identityGate));

        // ── 2. AgentIdentityRegistry ─────────────────────────────────────
        result.registry = new AgentIdentityRegistry(
            address(result.identityGate),
            result.deployer
        );
        console2.log("AgentIdentityRegistry:", address(result.registry));

        // ── 3. IntelToken ────────────────────────────────────────────────
        result.intelToken = new IntelToken(
            INTEL_NAME,
            INTEL_SYMBOL,
            result.deployer,
            INTEL_INITIAL_SUPPLY,
            INTEL_MAX_SUPPLY
        );
        console2.log("IntelToken:", address(result.intelToken));

        // ── 4. IntelStaking ──────────────────────────────────────────────
        result.staking = new IntelStaking(
            address(result.intelToken),
            STAKING_EPOCH_LENGTH,
            STAKING_COOLDOWN,
            STAKING_K,
            STAKING_WALLET_CAP,
            STAKING_GLOBAL_EPOCH_CAP
        );
        console2.log("IntelStaking:", address(result.staking));

        // ── 5. IntelTimelockController ───────────────────────────────────
        address[] memory proposers = new address[](1);
        proposers[0] = result.deployer;
        result.timelockController = new IntelTimelockController(
            result.deployer,
            48 hours,
            proposers
        );
        console2.log("IntelTimelockController:", address(result.timelockController));

        // ── 6. IntelPOLManager ───────────────────────────────────────────
        result.polManager = new IntelPOLManager(
            result.deployer,
            address(result.intelToken),
            POSITION_MANAGER,
            WETH9
        );
        console2.log("IntelPOLManager:", address(result.polManager));

        // ── 7. IntelMintController ───────────────────────────────────────
        result.mintController = new IntelMintController(
            address(result.intelToken),
            address(result.staking),
            address(result.polManager),
            result.deployer,
            MINT_FLOOR_PRICE,
            MINT_PREMIUM_BPS,
            MINT_INITIAL_TWAP
        );
        console2.log("IntelMintController:", address(result.mintController));

        // ── 8. WorkReceipt1155 ──────────────────────────────────────────
        result.workReceipt = new WorkReceipt1155(
            result.deployer,
            "https://api.iex.cannes/metadata/receipts/"
        );
        console2.log("WorkReceipt1155:", address(result.workReceipt));

        // ── 9. IntelVesting (team) ──────────────────────────────────────
        result.teamVesting = new IntelVesting(
            address(result.intelToken),
            result.deployer,
            address(result.timelockController),
            block.timestamp,
            VEST_CLIFF_DELAY,
            VEST_DURATION,
            2_000_000e18
        );
        console2.log("IntelVesting (team):", address(result.teamVesting));

        // ── 10. WorkerStakeManager ──────────────────────────────────────
        result.workerStakeManager = new WorkerStakeManager(
            address(result.intelToken),
            result.deployer
        );
        console2.log("WorkerStakeManager:", address(result.workerStakeManager));

        // ── 11. ReviewerStakeManager ────────────────────────────────────
        result.reviewerStakeManager = new ReviewerStakeManager(
            address(result.intelToken),
            result.deployer
        );
        console2.log("ReviewerStakeManager:", address(result.reviewerStakeManager));

        // ── 12. BuybackBurn ─────────────────────────────────────────────
        result.buybackBurn = new BuybackBurn(
            address(result.intelToken),
            address(result.polManager),
            SWAP_ROUTER,
            WETH9,
            result.deployer
        );
        console2.log("BuybackBurn:", address(result.buybackBurn));

        // ── 13. DisputeResolution ───────────────────────────────────────
        result.disputeResolution = new DisputeResolution(
            address(result.intelToken),
            payable(address(result.staking)),
            result.deployer
        );
        console2.log("DisputeResolution:", address(result.disputeResolution));

        // ── 14. EpochRewardDistributor ──────────────────────────────────
        result.epochRewardDistributor = new EpochRewardDistributor(
            address(result.intelToken),
            result.deployer
        );
        console2.log("EpochRewardDistributor:", address(result.epochRewardDistributor));

        // ── 15. CategoryRegistry ─────────────────────────────────────────
        result.categoryRegistry = new CategoryRegistry();
        console2.log("CategoryRegistry:", address(result.categoryRegistry));

        // ── 16. ReviewerQueue ────────────────────────────────────────────
        result.reviewerQueue = new ReviewerQueue(
            address(result.reviewerStakeManager),
            address(result.categoryRegistry)
        );
        console2.log("ReviewerQueue:", address(result.reviewerQueue));

        // ── 17. ReviewerCredential ─────────────────────────────────────
        result.reviewerCredential = new ReviewerCredential(address(result.reviewerStakeManager));
        console2.log("ReviewerCredential:", address(result.reviewerCredential));

        // ── 18. TaskEscrow ───────────────────────────────────────────────
        result.taskEscrow = new TaskEscrow(
            address(result.intelToken),
            address(result.staking),
            result.deployer
        );
        console2.log("TaskEscrow:", address(result.taskEscrow));

        // ── Post-deployment wiring ───────────────────────────────────────

        // IntelToken: set minter to IntelMintController
        result.intelToken.setMinter(address(result.mintController));
        console2.log("IntelToken.setMinter(IntelMintController)");

        // IntelStaking: whitelist IntelMintController and TaskEscrow as operators
        result.staking.setOperator(address(result.mintController), true);
        console2.log("IntelStaking.setOperator(IntelMintController, true)");

        result.staking.setOperator(address(result.taskEscrow), true);
        console2.log("IntelStaking.setOperator(TaskEscrow, true)");

        // IntelMintController: whitelist deployer as operator
        result.mintController.setOperator(result.deployer, true);
        console2.log("IntelMintController.setOperator(deployer, true)");

        // TaskEscrow: whitelist deployer as operator
        result.taskEscrow.setOperator(result.deployer, true);
        console2.log("TaskEscrow.setOperator(deployer, true)");

        // IntelPOLManager: whitelist deployer as operator (not available - owner only)
        // result.polManager.setOperator(result.deployer, true);
        // console2.log("IntelPOLManager.setOperator(deployer, true)");

        // Wire DisputeResolution with stake managers
        result.disputeResolution.setReviewerStakeManager(address(result.reviewerStakeManager));
        console2.log("DisputeResolution.setReviewerStakeManager");

        result.disputeResolution.setWorkerStakeManager(address(result.workerStakeManager));
        console2.log("DisputeResolution.setWorkerStakeManager");

        // Set deployer as operator for economic layer contracts
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

        result.reviewerQueue.setOperator(result.deployer, true);
        console2.log("ReviewerQueue.setOperator(deployer, true)");

        result.reviewerCredential.setOperator(result.deployer, true);
        console2.log("ReviewerCredential.setOperator(deployer, true)");

        // ── Seed initial POL (2M INTEL to deployer) ─────────────────────
        uint256 polAmount = 2_000_000e18;
        result.intelToken.transfer(result.deployer, polAmount);
        console2.log("Transferred 2M INTEL to deployer for POL");

        // ── Create INTEL/WETH pool on Uniswap V3 ─────────────────────────
        // Use sqrtPriceX96 for approx 0.001 ETH per INTEL
        uint160 sqrtPriceX96 = 79228162514264337593543950336;
        
        INonfungiblePositionManager.MintParams memory params = INonfungiblePositionManager.MintParams({
            token0: address(result.intelToken),
            token1: WETH9,
            fee: 3000,
            tickLower: -887220,
            tickUpper: 887220,
            amount0Desired: polAmount,
            amount1Desired: 2000e18, // 2000 WETH for initial liquidity
            amount0Min: 0,
            amount1Min: 0,
            recipient: result.deployer,
            deadline: block.timestamp + 1 hours
        });

        // Approve Position Manager
        result.intelToken.approve(POSITION_MANAGER, polAmount);
        vm.deal(result.deployer, 2000e18);

        // Create INTEL/WETH pool via UniV3 Factory
        IUniswapV3Factory uniFactory = IUniswapV3Factory(FACTORY);
        address poolAddress = uniFactory.getPool(address(result.intelToken), WETH9, 3000);
        if (poolAddress == address(0)) {
            poolAddress = uniFactory.createPool(address(result.intelToken), WETH9, 3000);
            // Initialize pool price: initialize(sqrtPriceX96) — call via low-level since
            // IUniswapV3Pool is not imported here; sqrtPriceX96 ≈ 0.001 ETH per INTEL
            (bool ok,) = poolAddress.call(abi.encodeWithSignature("initialize(uint160)", sqrtPriceX96));
            if (ok) {
                console2.log("INTEL/WETH pool created and initialized:", poolAddress);
            } else {
                console2.log("Pool initialization failed (may need different price):", poolAddress);
            }
        } else {
            console2.log("INTEL/WETH pool already exists:", poolAddress);
        }

        // ── Set TWAP pool for IntelPOLManager ─────────────────────────────
        if (poolAddress != address(0)) {
            result.polManager.setTwapPool(poolAddress);
            console2.log("IntelPOLManager.setTwapPool:", poolAddress);
        }

        vm.stopBroadcast();

        // ── Print deployment summary ─────────────────────────────────────
        console2.log("\n=== FORK DEPLOYMENT SUMMARY ===");
        console2.log("Chain ID:  ", chainId);
        console2.log("Deployer:  ", result.deployer);
        console2.log("");
        console2.log("Contracts:");
        console2.log("  IntelToken:                ", address(result.intelToken));
        console2.log("  IntelTimelockController:   ", address(result.timelockController));
        console2.log("  IntelStaking:              ", address(result.staking));
        console2.log("  IntelMintController:       ", address(result.mintController));
        console2.log("  WorkReceipt1155:           ", address(result.workReceipt));
        console2.log("  AgentIdentityRegistry:     ", address(result.registry));
        console2.log("  IdentityGate:              ", address(result.identityGate));
        console2.log("  IntelPOLManager:           ", address(result.polManager));
        console2.log("  IntelVesting:              ", address(result.teamVesting));
        console2.log("  WorkerStakeManager:        ", address(result.workerStakeManager));
        console2.log("  ReviewerStakeManager:      ", address(result.reviewerStakeManager));
        console2.log("  BuybackBurn:               ", address(result.buybackBurn));
        console2.log("  DisputeResolution:         ", address(result.disputeResolution));
        console2.log("  EpochRewardDistributor:    ", address(result.epochRewardDistributor));
        console2.log("  CategoryRegistry:          ", address(result.categoryRegistry));
        console2.log("  ReviewerQueue:             ", address(result.reviewerQueue));
        console2.log("  ReviewerCredential:        ", address(result.reviewerCredential));
        console2.log("  TaskEscrow:                ", address(result.taskEscrow));

        _writeDeploymentJson(result, chainId);

        return result;
    }

    function _writeDeploymentJson(DeploymentResult memory result, uint256 chainId) internal {
        string memory json = string.concat(
            '{\n',
            '  "chainId": ', vm.toString(chainId), ',\n',
            '  "deployer": "', vm.toString(result.deployer), '",\n',
            '  "contracts": {\n',
            '    "IntelToken": "', vm.toString(address(result.intelToken)), '",\n',
            '    "IntelTimelockController": "', vm.toString(address(result.timelockController)), '",\n',
            '    "IntelStaking": "', vm.toString(address(result.staking)), '",\n',
            '    "IntelMintController": "', vm.toString(address(result.mintController)), '",\n',
            '    "WorkReceipt1155": "', vm.toString(address(result.workReceipt)), '",\n',
            '    "AgentIdentityRegistry": "', vm.toString(address(result.registry)), '",\n',
            '    "IdentityGate": "', vm.toString(address(result.identityGate)), '",\n',
            '    "IntelPOLManager": "', vm.toString(address(result.polManager)), '",\n',
            '    "IntelVesting": "', vm.toString(address(result.teamVesting)), '",\n',
            '    "WorkerStakeManager": "', vm.toString(address(result.workerStakeManager)), '",\n',
            '    "ReviewerStakeManager": "', vm.toString(address(result.reviewerStakeManager)), '",\n',
            '    "BuybackBurn": "', vm.toString(address(result.buybackBurn)), '",\n',
            '    "DisputeResolution": "', vm.toString(address(result.disputeResolution)), '",\n',
            '    "EpochRewardDistributor": "', vm.toString(address(result.epochRewardDistributor)), '",\n',
            '    "CategoryRegistry": "', vm.toString(address(result.categoryRegistry)), '",\n',
            '    "ReviewerQueue": "', vm.toString(address(result.reviewerQueue)), '",\n',
            '    "ReviewerCredential": "', vm.toString(address(result.reviewerCredential)), '",\n',
            '    "TaskEscrow": "', vm.toString(address(result.taskEscrow)), '"\n',
            '  }\n',
            '}'
        );

        string memory fileName = "deployments/fork-mainnet.json";
        vm.writeJson(json, fileName);
        console2.log("\nDeployment written to:", fileName);
    }
}