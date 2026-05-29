// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IntelToken} from "../src/IntelToken.sol";
import {EpochRewardDistributor} from "../src/EpochRewardDistributor.sol";

contract EpochRewardDistributorTest is Test {
    EpochRewardDistributor public distributor;
    IntelToken public intel;

    address owner = address(this);
    address treasury = makeAddr("treasury");
    address operator = makeAddr("operator");
    address worker1 = makeAddr("worker1");
    address worker2 = makeAddr("worker2");
    address worker3 = makeAddr("worker3");
    address worker4 = makeAddr("worker4");
    address worker5 = makeAddr("worker5");
    address worker6 = makeAddr("worker6");
    address worker7 = makeAddr("worker7");
    address worker8 = makeAddr("worker8");
    address worker9 = makeAddr("worker9");
    address worker10 = makeAddr("worker10");

    uint256 constant REWARD_POOL = 10_000e18;
    uint256 constant TOP_PERCENTILE_BPS = 1000; // 10%
    uint256 constant MIN_AIU_THRESHOLD = 1;

    function setUp() public {
        intel = new IntelToken("Intelligence Exchange", "INTEL", owner, 1_000_000e18, 10_000_000e18);
        distributor = new EpochRewardDistributor(address(intel), treasury);

        // Fund treasury with INTEL
        intel.transfer(treasury, 100_000e18);

        // Approve distributor to spend from treasury
        vm.prank(treasury);
        intel.approve(address(distributor), type(uint256).max);

        // Set operator
        distributor.setOperator(operator, true);
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    function test_constructor_setsIntel() public view {
        assertEq(address(distributor.intel()), address(intel));
    }

    function test_constructor_setsTreasury() public view {
        assertEq(distributor.treasury(), treasury);
    }

    function test_constructor_setsDefaultRewardPool() public view {
        assertEq(distributor.epochRewardPool(), REWARD_POOL);
    }

    function test_constructor_setsDefaultTopPercentile() public view {
        assertEq(distributor.topPercentileBps(), TOP_PERCENTILE_BPS);
    }

    function test_constructor_setsDefaultMinAiuThreshold() public view {
        assertEq(distributor.minAiuThreshold(), MIN_AIU_THRESHOLD);
    }

    function test_constructor_setsCurrentEpochToOne() public view {
        assertEq(distributor.currentEpoch(), 1);
    }

    function test_constructor_zeroIntel_reverts() public {
        vm.expectRevert(EpochRewardDistributor.ZeroAddress.selector);
        new EpochRewardDistributor(address(0), treasury);
    }

    function test_constructor_zeroTreasury_reverts() public {
        vm.expectRevert(EpochRewardDistributor.ZeroAddress.selector);
        new EpochRewardDistributor(address(intel), address(0));
    }

    // ─── submitEpochScores ─────────────────────────────────────────────────────

    function test_submitEpochScores_valid() public {
        address[] memory workers = new address[](3);
        workers[0] = worker1;
        workers[1] = worker2;
        workers[2] = worker3;

        uint256[] memory aiuScores = new uint256[](3);
        aiuScores[0] = 100;
        aiuScores[1] = 80;
        aiuScores[2] = 60;

        vm.prank(operator);
        distributor.submitEpochScores(1, workers, aiuScores);

        (, , uint256 workerCount, uint256 topCount, ) = distributor.epochRewards(1);
        assertEq(workerCount, 3);
        assertEq(topCount, 1); // Minimum 1 even if 3 * 1000 / 10000 = 0
    }

    function test_submitEpochScores_emitsEvent() public {
        address[] memory workers = new address[](2);
        workers[0] = worker1;
        workers[1] = worker2;

        uint256[] memory aiuScores = new uint256[](2);
        aiuScores[0] = 100;
        aiuScores[1] = 50;

        vm.expectEmit(true, false, false, false);
        emit EpochRewardDistributor.EpochScoresSubmitted(1, 2, 0);
        vm.prank(operator);
        distributor.submitEpochScores(1, workers, aiuScores);
    }

    function test_submitEpochScores_arrayLengthMismatch_reverts() public {
        address[] memory workers = new address[](2);
        workers[0] = worker1;
        workers[1] = worker2;

        uint256[] memory aiuScores = new uint256[](3);
        aiuScores[0] = 100;
        aiuScores[1] = 50;
        aiuScores[2] = 25;

        vm.prank(operator);
        vm.expectRevert(EpochRewardDistributor.ArrayLengthMismatch.selector);
        distributor.submitEpochScores(1, workers, aiuScores);
    }

    function test_submitEpochScores_belowMinAiu_reverts() public {
        address[] memory workers = new address[](2);
        workers[0] = worker1;
        workers[1] = worker2;

        uint256[] memory aiuScores = new uint256[](2);
        aiuScores[0] = 100;
        aiuScores[1] = 0; // Below min threshold

        vm.prank(operator);
        vm.expectRevert(EpochRewardDistributor.BelowMinAiu.selector);
        distributor.submitEpochScores(1, workers, aiuScores);
    }

    function test_submitEpochScores_nonOperator_reverts() public {
        address[] memory workers = new address[](1);
        workers[0] = worker1;

        uint256[] memory aiuScores = new uint256[](1);
        aiuScores[0] = 100;

        vm.prank(worker1);
        vm.expectRevert(EpochRewardDistributor.Unauthorized.selector);
        distributor.submitEpochScores(1, workers, aiuScores);
    }

    // ─── distributeEpochRewards ────────────────────────────────────────────────

    function test_distributeEpochRewards_happyPath() public {
        // Submit scores for 10 workers (top 10% = 1 worker)
        address[] memory workers = new address[](10);
        uint256[] memory aiuScores = new uint256[](10);

        for (uint256 i = 0; i < 10; i++) {
            workers[i] = address(uint160(i + 1));
            aiuScores[i] = 100 - i * 10; // Descending: 100, 90, 80, ..., 10
        }

        vm.prank(operator);
        distributor.submitEpochScores(1, workers, aiuScores);

        // Distribute rewards
        vm.prank(operator);
        distributor.distributeEpochRewards(1);

        // Check that only top 1 worker got rewards
        (, , , , bool distributed) = distributor.epochRewards(1);
        assertTrue(distributed);

        // Workers need to claim rewards
        vm.prank(workers[0]);
        distributor.claimReward(1);

        // Top worker (worker1 with 100 AIU) should get full pool
        assertEq(intel.balanceOf(workers[0]), REWARD_POOL);

        // Other workers should get nothing
        for (uint256 i = 1; i < 10; i++) {
            assertEq(intel.balanceOf(workers[i]), 0);
        }
    }

    function test_distributeEpochRewards_proRataDistribution() public {
        // Submit scores for 20 workers (top 10% = 2 workers)
        address[] memory workers = new address[](20);
        uint256[] memory aiuScores = new uint256[](20);

        for (uint256 i = 0; i < 20; i++) {
            workers[i] = address(uint160(i + 1));
            aiuScores[i] = 100 - i * 5; // Descending: 100, 95, 90, ...
        }

        vm.prank(operator);
        distributor.submitEpochScores(1, workers, aiuScores);

        // Distribute rewards
        vm.prank(operator);
        distributor.distributeEpochRewards(1);

        // Top 2 workers: worker1 (100 AIU) and worker2 (95 AIU)
        // Total AIU = 195
        // worker1 reward = 10000 * 100 / 195 = 5128.205...
        // worker2 reward = 10000 * 95 / 195 = 4871.794...

        uint256 worker1Reward = (REWARD_POOL * 100) / 195;
        uint256 worker2Reward = (REWARD_POOL * 95) / 195;

        // Workers need to claim rewards
        vm.prank(workers[0]);
        distributor.claimReward(1);
        vm.prank(workers[1]);
        distributor.claimReward(1);

        assertEq(intel.balanceOf(workers[0]), worker1Reward);
        assertEq(intel.balanceOf(workers[1]), worker2Reward);
        // Allow for rounding errors in division
        assertLe(intel.balanceOf(workers[0]) + intel.balanceOf(workers[1]), REWARD_POOL);
        assertGe(intel.balanceOf(workers[0]) + intel.balanceOf(workers[1]), REWARD_POOL - 1e18); // Within 1 INTEL
    }

    function test_distributeEpochRewards_emitsEvent() public {
        address[] memory workers = new address[](5);
        workers[0] = worker1;
        workers[1] = worker2;
        workers[2] = worker3;
        workers[3] = worker4;
        workers[4] = worker5;

        uint256[] memory aiuScores = new uint256[](5);
        aiuScores[0] = 100;
        aiuScores[1] = 80;
        aiuScores[2] = 60;
        aiuScores[3] = 40;
        aiuScores[4] = 20;

        vm.prank(operator);
        distributor.submitEpochScores(1, workers, aiuScores);

        vm.expectEmit(true, false, false, false);
        emit EpochRewardDistributor.EpochRewardsDistributed(1, REWARD_POOL, 0);
        vm.prank(operator);
        distributor.distributeEpochRewards(1);
    }

    function test_distributeEpochRewards_alreadyDistributed_reverts() public {
        address[] memory workers = new address[](2);
        workers[0] = worker1;
        workers[1] = worker2;

        uint256[] memory aiuScores = new uint256[](2);
        aiuScores[0] = 100;
        aiuScores[1] = 50;

        vm.prank(operator);
        distributor.submitEpochScores(1, workers, aiuScores);

        vm.prank(operator);
        distributor.distributeEpochRewards(1);

        vm.prank(operator);
        vm.expectRevert(EpochRewardDistributor.EpochAlreadyDistributed.selector);
        distributor.distributeEpochRewards(1);
    }

    function test_distributeEpochRewards_scoresNotSubmitted_reverts() public {
        vm.prank(operator);
        vm.expectRevert(EpochRewardDistributor.ScoresNotSubmitted.selector);
        distributor.distributeEpochRewards(1);
    }

    function test_distributeEpochRewards_nonOperator_reverts() public {
        address[] memory workers = new address[](2);
        workers[0] = worker1;
        workers[1] = worker2;

        uint256[] memory aiuScores = new uint256[](2);
        aiuScores[0] = 100;
        aiuScores[1] = 50;

        vm.prank(operator);
        distributor.submitEpochScores(1, workers, aiuScores);

        vm.prank(worker1);
        vm.expectRevert(EpochRewardDistributor.Unauthorized.selector);
        distributor.distributeEpochRewards(1);
    }

    // ─── claimReward ───────────────────────────────────────────────────────────

    function test_claimReward_valid() public {
        address[] memory workers = new address[](10);
        uint256[] memory aiuScores = new uint256[](10);

        for (uint256 i = 0; i < 10; i++) {
            workers[i] = address(uint160(i + 1));
            aiuScores[i] = 100 - i * 10;
        }

        vm.prank(operator);
        distributor.submitEpochScores(1, workers, aiuScores);

        vm.prank(operator);
        distributor.distributeEpochRewards(1);

        // Claim reward for top worker
        uint256 balanceBefore = intel.balanceOf(workers[0]);
        vm.prank(workers[0]);
        distributor.claimReward(1);
        uint256 balanceAfter = intel.balanceOf(workers[0]);

        assertEq(balanceAfter - balanceBefore, REWARD_POOL);
    }

    function test_claimReward_emitsEvent() public {
        address[] memory workers = new address[](10);
        uint256[] memory aiuScores = new uint256[](10);

        for (uint256 i = 0; i < 10; i++) {
            workers[i] = address(uint160(i + 1));
            aiuScores[i] = 100 - i * 10;
        }

        vm.prank(operator);
        distributor.submitEpochScores(1, workers, aiuScores);

        vm.prank(operator);
        distributor.distributeEpochRewards(1);

        vm.expectEmit(true, true, false, true);
        emit EpochRewardDistributor.RewardClaimed(1, workers[0], REWARD_POOL);
        vm.prank(workers[0]);
        distributor.claimReward(1);
    }

    function test_claimReward_doubleClaim_reverts() public {
        address[] memory workers = new address[](10);
        uint256[] memory aiuScores = new uint256[](10);

        for (uint256 i = 0; i < 10; i++) {
            workers[i] = address(uint160(i + 1));
            aiuScores[i] = 100 - i * 10;
        }

        vm.prank(operator);
        distributor.submitEpochScores(1, workers, aiuScores);

        vm.prank(operator);
        distributor.distributeEpochRewards(1);

        vm.prank(workers[0]);
        distributor.claimReward(1);

        vm.prank(workers[0]);
        vm.expectRevert(EpochRewardDistributor.AlreadyClaimed.selector);
        distributor.claimReward(1);
    }

    function test_claimReward_nothingToClaim_reverts() public {
        address[] memory workers = new address[](10);
        uint256[] memory aiuScores = new uint256[](10);

        for (uint256 i = 0; i < 10; i++) {
            workers[i] = address(uint160(i + 1));
            aiuScores[i] = 100 - i * 10;
        }

        vm.prank(operator);
        distributor.submitEpochScores(1, workers, aiuScores);

        vm.prank(operator);
        distributor.distributeEpochRewards(1);

        // Non-top worker tries to claim
        vm.prank(workers[5]);
        vm.expectRevert(EpochRewardDistributor.NothingToClaim.selector);
        distributor.claimReward(1);
    }

    function test_claimReward_epochNotDistributed_reverts() public {
        address[] memory workers = new address[](2);
        workers[0] = worker1;
        workers[1] = worker2;

        uint256[] memory aiuScores = new uint256[](2);
        aiuScores[0] = 100;
        aiuScores[1] = 50;

        vm.prank(operator);
        distributor.submitEpochScores(1, workers, aiuScores);

        vm.prank(worker1);
        vm.expectRevert(EpochRewardDistributor.EpochNotDistributed.selector);
        distributor.claimReward(1);
    }

    // ─── Non-top worker gets nothing ───────────────────────────────────────────

    function test_nonTopWorkerGetsNothing() public {
        address[] memory workers = new address[](10);
        uint256[] memory aiuScores = new uint256[](10);

        for (uint256 i = 0; i < 10; i++) {
            workers[i] = address(uint160(i + 1));
            aiuScores[i] = 100 - i * 10;
        }

        vm.prank(operator);
        distributor.submitEpochScores(1, workers, aiuScores);

        vm.prank(operator);
        distributor.distributeEpochRewards(1);

        // Only top 1 worker (10% of 10) should have rewardEarned > 0
        for (uint256 i = 1; i < 10; i++) {
            vm.prank(workers[i]);
            vm.expectRevert(EpochRewardDistributor.NothingToClaim.selector);
            distributor.claimReward(1);
        }
    }

    // ─── depositRewardPool ─────────────────────────────────────────────────────

    function test_depositRewardPool_valid() public {
        uint256 depositAmount = 5_000e18;
        intel.transfer(worker1, depositAmount);

        uint256 balanceBefore = intel.balanceOf(address(distributor));
        vm.prank(worker1);
        intel.approve(address(distributor), depositAmount);
        vm.prank(worker1);
        distributor.depositRewardPool(depositAmount);
        uint256 balanceAfter = intel.balanceOf(address(distributor));

        assertEq(balanceAfter - balanceBefore, depositAmount);
    }

    function test_depositRewardPool_emitsEvent() public {
        uint256 depositAmount = 1_000e18;
        intel.transfer(worker1, depositAmount);

        vm.prank(worker1);
        intel.approve(address(distributor), depositAmount);

        uint256 newBalance = intel.balanceOf(address(distributor)) + depositAmount;
        vm.expectEmit(true, false, false, false);
        emit EpochRewardDistributor.RewardPoolDeposited(worker1, depositAmount, newBalance);
        vm.prank(worker1);
        distributor.depositRewardPool(depositAmount);
    }

    function test_depositRewardPool_zeroAmount_reverts() public {
        vm.prank(worker1);
        vm.expectRevert(EpochRewardDistributor.ZeroAmount.selector);
        distributor.depositRewardPool(0);
    }

    // ─── Admin Functions ───────────────────────────────────────────────────────

    function test_setEpochRewardPool() public {
        uint256 newPool = 20_000e18;
        distributor.setEpochRewardPool(newPool);
        assertEq(distributor.epochRewardPool(), newPool);
    }

    function test_setTopPercentileBps() public {
        uint256 newBps = 2000; // 20%
        distributor.setTopPercentileBps(newBps);
        assertEq(distributor.topPercentileBps(), newBps);
    }

    function test_setTopPercentileBps_exceedsBps_reverts() public {
        vm.expectRevert(EpochRewardDistributor.InvalidParam.selector);
        distributor.setTopPercentileBps(15_000);
    }

    function test_setMinAiuThreshold() public {
        uint256 newThreshold = 10;
        distributor.setMinAiuThreshold(newThreshold);
        assertEq(distributor.minAiuThreshold(), newThreshold);
    }

    function test_setTreasury() public {
        address newTreasury = makeAddr("newTreasury");
        distributor.setTreasury(newTreasury);
        assertEq(distributor.treasury(), newTreasury);
    }

    function test_setTreasury_zeroAddress_reverts() public {
        vm.expectRevert(EpochRewardDistributor.ZeroAddress.selector);
        distributor.setTreasury(address(0));
    }

    function test_setOperator() public {
        address newOperator = makeAddr("newOperator");
        distributor.setOperator(newOperator, true);
        assertTrue(distributor.operators(newOperator));
    }

    function test_setOperator_zeroAddress_reverts() public {
        vm.expectRevert(EpochRewardDistributor.ZeroAddress.selector);
        distributor.setOperator(address(0), true);
    }

    function test_advanceEpoch() public {
        uint256 epochBefore = distributor.currentEpoch();
        vm.prank(operator);
        distributor.advanceEpoch();
        uint256 epochAfter = distributor.currentEpoch();
        assertEq(epochAfter, epochBefore + 1);
    }

    function test_advanceEpoch_emitsEvent() public {
        vm.expectEmit(true, false, false, false);
        emit EpochRewardDistributor.EpochAdvanced(2);
        vm.prank(operator);
        distributor.advanceEpoch();
    }

    // ─── Ownable2Step ─────────────────────────────────────────────────────────

    function test_transferOwnership_setsPendingOwner() public {
        distributor.transferOwnership(worker1);
        assertEq(distributor.pendingOwner(), worker1);
    }

    function test_acceptOwnership_completesTransfer() public {
        distributor.transferOwnership(worker1);
        vm.prank(worker1);
        distributor.acceptOwnership();
        assertEq(distributor.owner(), worker1);
    }

    function test_acceptOwnership_nonNominee_reverts() public {
        distributor.transferOwnership(worker1);
        vm.prank(worker2);
        vm.expectRevert(EpochRewardDistributor.Unauthorized.selector);
        distributor.acceptOwnership();
    }
}