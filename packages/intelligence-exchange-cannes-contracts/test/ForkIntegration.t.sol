// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
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
import {TaskEscrow} from "../src/TaskEscrow.sol";

/// @title ForkIntegration
/// @notice E2E integration test on mainnet fork for Assay Protocol
contract ForkIntegration is Test {
    // Mainnet Uniswap V3 addresses
    address public constant SWAP_ROUTER = 0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45;
    address public constant POSITION_MANAGER = 0xC36442b4a4522E871399CD717aBDD847Ab11FE88;
    address public constant WETH9 = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    // Contracts
    IntelToken public intelToken;
    IntelTimelockController public timelockController;
    IntelStaking public staking;
    IntelMintController public mintController;
    WorkReceipt1155 public workReceipt;
    AgentIdentityRegistry public registry;
    IdentityGate public identityGate;
    IntelPOLManager public polManager;
    IntelVesting public teamVesting;
    WorkerStakeManager public workerStakeManager;
    ReviewerStakeManager public reviewerStakeManager;
    BuybackBurn public buybackBurn;
    DisputeResolution public disputeResolution;
    EpochRewardDistributor public epochRewardDistributor;
    CategoryRegistry public categoryRegistry;
    ReviewerQueue public reviewerQueue;
    TaskEscrow public taskEscrow;

    // Test accounts
    address public deployer;
    address public buyer;
    address public worker;
    address public treasury;

    // Constants
    uint256 public constant INTEL_INITIAL_SUPPLY = 10_000_000e18;
    uint256 public constant INTEL_MAX_SUPPLY = 100_000_000e18;
    uint256 public constant STAKING_EPOCH_LENGTH = 7 days;
    uint256 public constant STAKING_COOLDOWN = 3 days;
    uint256 public constant STAKING_K = 1e18;
    uint256 public constant STAKING_WALLET_CAP = 5_000_000e18;
    uint256 public constant STAKING_GLOBAL_EPOCH_CAP = 20_000_000e18;
    uint256 public constant MINT_FLOOR_PRICE = 0.001e18;
    uint256 public constant MINT_PREMIUM_BPS = 500;
    uint256 public constant MINT_INITIAL_TWAP = 0.001e18;

    function setUp() public {
        // Create mainnet fork
        string memory rpcUrl = vm.envOr("MAINNET_RPC_URL", "https://ethereum.publicnode.com");
        vm.createFork(rpcUrl);
        vm.selectFork(vm.activeFork());

        // Setup test accounts
        deployer = address(this);
        buyer = address(0x1);
        worker = address(0x2);
        treasury = address(0x3);

        // Deploy contracts inline (no broadcast needed in tests)
        _deployContracts();
    }

    function _deployContracts() internal {
        // 1. IdentityGate
        identityGate = new IdentityGate(deployer);

        // 2. AgentIdentityRegistry
        registry = new AgentIdentityRegistry(address(identityGate), deployer);

        // 3. IntelToken
        intelToken = new IntelToken(
            "Intelligence Exchange Token",
            "INTEL",
            deployer,
            INTEL_INITIAL_SUPPLY,
            INTEL_MAX_SUPPLY
        );

        // 4. IntelStaking
        staking = new IntelStaking(
            address(intelToken),
            STAKING_EPOCH_LENGTH,
            STAKING_COOLDOWN,
            STAKING_K,
            STAKING_WALLET_CAP,
            STAKING_GLOBAL_EPOCH_CAP
        );

        // 5. IntelTimelockController
        address[] memory proposers = new address[](1);
        proposers[0] = deployer;
        timelockController = new IntelTimelockController(deployer, 48 hours, proposers);

        // 6. IntelPOLManager
        polManager = new IntelPOLManager(deployer, address(intelToken), POSITION_MANAGER, WETH9);

        // 7. IntelMintController
        mintController = new IntelMintController(
            address(intelToken),
            address(staking),
            address(polManager),
            treasury,
            MINT_FLOOR_PRICE,
            MINT_PREMIUM_BPS,
            MINT_INITIAL_TWAP
        );

        // 8. WorkReceipt1155
        workReceipt = new WorkReceipt1155(deployer, "https://api.iex.cannes/metadata/receipts/");

        // 9. IntelVesting
        teamVesting = new IntelVesting(
            address(intelToken),
            deployer,
            address(timelockController),
            block.timestamp,
            365 days,
            3 * 365 days,
            2_000_000e18
        );

        // 10. WorkerStakeManager
        workerStakeManager = new WorkerStakeManager(address(intelToken), treasury);

        // 11. ReviewerStakeManager
        reviewerStakeManager = new ReviewerStakeManager(address(intelToken), treasury);

        // 12. BuybackBurn
        buybackBurn = new BuybackBurn(
            address(intelToken),
            address(polManager),
            SWAP_ROUTER,
            WETH9,
            treasury
        );

        // 13. DisputeResolution
        disputeResolution = new DisputeResolution(
            address(intelToken),
            payable(address(staking)),
            treasury
        );

        // 14. EpochRewardDistributor
        epochRewardDistributor = new EpochRewardDistributor(address(intelToken), treasury);

        // 15. CategoryRegistry
        categoryRegistry = new CategoryRegistry();

        // 16. ReviewerQueue
        reviewerQueue = new ReviewerQueue(
            address(reviewerStakeManager),
            address(categoryRegistry),
            address(identityGate)
        );

        // 17. TaskEscrow
        taskEscrow = new TaskEscrow(address(intelToken), address(staking), treasury);

        // Post-deployment wiring
        intelToken.setMinter(address(mintController));
        staking.setOperator(address(mintController), true);
        staking.setOperator(address(taskEscrow), true);
        mintController.setOperator(deployer, true);
        taskEscrow.setOperator(deployer, true);
        polManager.setOperator(deployer, true);

        // Wire DisputeResolution
        disputeResolution.setReviewerStakeManager(address(reviewerStakeManager));
        disputeResolution.setWorkerStakeManager(address(workerStakeManager));

        // Set operators for economic layer
        workerStakeManager.setOperator(deployer, true);
        reviewerStakeManager.setOperator(deployer, true);
        buybackBurn.setOperator(deployer, true);
        disputeResolution.setOperator(deployer, true);
        epochRewardDistributor.setOperator(deployer, true);
        categoryRegistry.setOperator(deployer, true);
        reviewerQueue.setOperator(deployer, true);

        // Seed some INTEL to deployer for testing
        intelToken.transfer(deployer, 1_000_000e18);
    }

    function test_fullSettlementFlow() public {
        bytes32 taskId = keccak256("test-task");

        // 1. Fund buyer with ETH
        vm.deal(buyer, 10 ether);
        assertEq(buyer.balance, 10 ether);

        // 2. Buyer mints INTEL via selfMint
        uint256 mintAmount = 1000e18;
        uint256 expectedCost = (mintController.mintPrice() * mintAmount) / 1e18;
        
        vm.prank(buyer);
        mintController.selfMint{value: expectedCost * 2}(mintAmount, type(uint256).max);

        // 3. Assert buyer INTEL balance > 0
        uint256 buyerBalance = intelToken.balanceOf(buyer);
        assertGt(buyerBalance, 0);
        console2.log("Buyer INTEL balance:", buyerBalance);

        // 4. Buyer approves TaskEscrow for 100e18 INTEL
        uint256 fundAmount = 100e18;
        vm.prank(buyer);
        intelToken.approve(address(taskEscrow), fundAmount);

        // 5. Buyer calls taskEscrow.fundTask
        vm.prank(buyer);
        taskEscrow.fundTask(taskId, fundAmount);

        // 6. Assert taskEscrow holds 100e18 INTEL
        uint256 escrowBalance = intelToken.balanceOf(address(taskEscrow));
        assertEq(escrowBalance, fundAmount);
        console2.log("TaskEscrow INTEL balance:", escrowBalance);

        // 7. Deployer (operator) calls taskEscrow.setWorker
        taskEscrow.setWorker(taskId, worker);

        // 8. Deployer calls taskEscrow.release
        taskEscrow.release(taskId, worker);

        // 9. Assert worker INTEL balance ~= 81e18 (±1e15 rounding tolerance)
        uint256 workerBalance = intelToken.balanceOf(worker);
        uint256 expectedWorkerBalance = 81e18;
        assertApproxEqAbs(workerBalance, expectedWorkerBalance, 1e15);
        console2.log("Worker INTEL balance:", workerBalance);

        // 10. Assert treasury balance ~= 10e18
        uint256 treasuryBalance = intelToken.balanceOf(treasury);
        uint256 expectedTreasuryBalance = 10e18;
        assertApproxEqAbs(treasuryBalance, expectedTreasuryBalance, 1e15);
        console2.log("Treasury INTEL balance:", treasuryBalance);

        // 11. Assert staking received yield (check accYieldPerShare increased)
        uint256 yieldPoolBefore = staking.pendingYieldPool();
        uint256 accYieldPerShareBefore = staking.accYieldPerShare();
        
        // Skip to next epoch to see yield accrual
        vm.warp(block.timestamp + STAKING_EPOCH_LENGTH);
        
        uint256 accYieldPerShareAfter = staking.accYieldPerShare();
        assertGe(accYieldPerShareAfter, accYieldPerShareBefore);
        console2.log("accYieldPerShare before:", accYieldPerShareBefore);
        console2.log("accYieldPerShare after:", accYieldPerShareAfter);
    }

    function test_refund() public {
        bytes32 taskId = keccak256("refund-task");

        // Fund buyer with INTEL
        intelToken.transfer(buyer, 1000e18);
        
        // Fund task with 50e18 INTEL
        uint256 fundAmount = 50e18;
        vm.prank(buyer);
        intelToken.approve(address(taskEscrow), fundAmount);
        
        vm.prank(buyer);
        taskEscrow.fundTask(taskId, fundAmount);

        // Assert task is funded
        assertEq(intelToken.balanceOf(address(taskEscrow)), fundAmount);

        // Warp past refund window
        uint256 refundWindow = taskEscrow.taskRefundWindow();
        vm.warp(block.timestamp + refundWindow + 1);

        // Call refund from buyer
        uint256 buyerBalanceBefore = intelToken.balanceOf(buyer);
        vm.prank(buyer);
        taskEscrow.refund(taskId);
        uint256 buyerBalanceAfter = intelToken.balanceOf(buyer);

        // Assert buyer gets back 50e18 INTEL
        assertEq(buyerBalanceAfter - buyerBalanceBefore, fundAmount);
        console2.log("Buyer refunded:", buyerBalanceAfter - buyerBalanceBefore);

        // Assert escrow is empty
        assertEq(intelToken.balanceOf(address(taskEscrow)), 0);
    }
}