// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CategoryRegistry} from "../src/CategoryRegistry.sol";

contract CategoryRegistryTest is Test {
    CategoryRegistry public registry;
    
    address owner = address(this);
    address operator = address(0x0F);
    address agent = address(0xA1);
    address agent2 = address(0xA2);

    function setUp() public {
        registry = new CategoryRegistry();
        registry.setOperator(operator, true);
    }

    // ─── Constructor ───────────────────────────────────────────────────────────

    function test_constructor_initializes_categories() public {
        // Check initial weights sum to 10000
        uint256 totalWeight;
        for (uint256 i = 0; i < 6; i++) {
            (, uint256 weight,,,, bool active) = registry.categories(i);
            totalWeight += weight;
            assertTrue(active); // All categories start active
        }
        assertEq(totalWeight, 10000);
    }

    function test_constructor_initial_weights() public {
        (, uint256 codeWeight,,,,) = registry.categories(0); // Code
        (, uint256 designWeight,,,,) = registry.categories(1); // Design
        (, uint256 researchWeight,,,,) = registry.categories(2); // Research
        (, uint256 auditWeight,,,,) = registry.categories(3); // Audit
        (, uint256 dataWeight,,,,) = registry.categories(4); // Data
        (, uint256 generalWeight,,,,) = registry.categories(5); // General

        assertEq(codeWeight, 3500);
        assertEq(designWeight, 1500);
        assertEq(researchWeight, 2000);
        assertEq(auditWeight, 2000);
        assertEq(dataWeight, 500);
        assertEq(generalWeight, 500);
    }

    // ─── recordCategoryCompletion ───────────────────────────────────────────────

    function test_recordCategoryCompletion_basic() public {
        vm.prank(operator);
        registry.recordCategoryCompletion(agent, 0, 100);

        assertEq(registry.agentCategoryAiu(agent, 0), 100);
        assertEq(registry.agentCategoryJobs(agent, 0), 1);
        assertEq(registry.agentPrimaryCategory(agent), 0);

        (,,, uint256 totalAiu,,) = registry.categories(0);
        assertEq(totalAiu, 100);
    }

    function test_recordCategoryCompletion_multiple_completions() public {
        vm.prank(operator);
        registry.recordCategoryCompletion(agent, 0, 100);
        
        vm.prank(operator);
        registry.recordCategoryCompletion(agent, 0, 50);

        assertEq(registry.agentCategoryAiu(agent, 0), 150);
        assertEq(registry.agentCategoryJobs(agent, 0), 2);
    }

    function test_recordCategoryCompletion_updates_primary_category() public {
        vm.prank(operator);
        registry.recordCategoryCompletion(agent, 0, 100); // Code

        assertEq(registry.agentPrimaryCategory(agent), 0);

        vm.prank(operator);
        registry.recordCategoryCompletion(agent, 1, 150); // Design - higher AIU

        assertEq(registry.agentPrimaryCategory(agent), 1);
    }

    function test_recordCategoryCompletion_invalid_category() public {
        vm.prank(operator);
        vm.expectRevert(CategoryRegistry.InvalidCategory.selector);
        registry.recordCategoryCompletion(agent, 6, 100);
    }

    function test_recordCategoryCompletion_zero_aiu() public {
        vm.prank(operator);
        vm.expectRevert(CategoryRegistry.ZeroAmount.selector);
        registry.recordCategoryCompletion(agent, 0, 0);
    }

    function test_recordCategoryCompletion_inactive_category() public {
        registry.setActive(0, false);

        vm.prank(operator);
        vm.expectRevert(CategoryRegistry.CategoryInactive.selector);
        registry.recordCategoryCompletion(agent, 0, 100);
    }

    function test_recordCategoryCompletion_unauthorized() public {
        vm.prank(agent);
        vm.expectRevert(CategoryRegistry.Unauthorized.selector);
        registry.recordCategoryCompletion(agent, 0, 100);
    }

    // ─── updateEpochVolume ─────────────────────────────────────────────────────

    function test_updateEpochVolume_basic() public {
        vm.prank(operator);
        registry.updateEpochVolume(0, 1000);

        (,,,, uint256 volume,) = registry.categories(0);
        assertEq(volume, 1000);
    }

    function test_updateEpochVolume_invalid_category() public {
        vm.prank(operator);
        vm.expectRevert(CategoryRegistry.InvalidCategory.selector);
        registry.updateEpochVolume(6, 1000);
    }

    function test_updateEpochVolume_unauthorized() public {
        vm.prank(agent);
        vm.expectRevert(CategoryRegistry.Unauthorized.selector);
        registry.updateEpochVolume(0, 1000);
    }

    // ─── setCategoryWeight ─────────────────────────────────────────────────────

    function test_setCategoryWeight_basic() public {
        uint256 oldWeight;
        (, oldWeight,,,,) = registry.categories(0);

        registry.setCategoryWeight(0, 4000);

        (, uint256 newWeight,,,,) = registry.categories(0);
        assertEq(newWeight, 4000);
        assertEq(oldWeight, 3500);
    }

    function test_setCategoryWeight_rebalances_others() public {
        // Set Code (index 0) from 3500 to 4000
        // Remaining weight should be 6000, down from 6500
        // Other 5 categories should be scaled proportionally
        
        registry.setCategoryWeight(0, 4000);

        uint256 totalWeight;
        for (uint256 i = 0; i < 6; i++) {
            (, uint256 weight,,,,) = registry.categories(i);
            totalWeight += weight;
        }
        
        // Total should still be 10000
        assertEq(totalWeight, 10000);
    }

    function test_setCategoryWeight_invalid_category() public {
        vm.expectRevert(CategoryRegistry.InvalidCategory.selector);
        registry.setCategoryWeight(6, 1000);
    }

    function test_setCategoryWeight_zero_weight() public {
        vm.expectRevert(CategoryRegistry.ZeroAmount.selector);
        registry.setCategoryWeight(0, 0);
    }

    function test_setCategoryWeight_unauthorized() public {
        vm.prank(agent);
        vm.expectRevert(CategoryRegistry.Unauthorized.selector);
        registry.setCategoryWeight(0, 4000);
    }

    // ─── getAgentCategoryProfile ────────────────────────────────────────────────

    function test_getAgentCategoryProfile_basic() public {
        vm.prank(operator);
        registry.recordCategoryCompletion(agent, 0, 100);
        vm.prank(operator);
        registry.recordCategoryCompletion(agent, 1, 50);

        (uint256[6] memory aiuScores, uint256[6] memory jobCounts, uint256 primary) = 
            registry.getAgentCategoryProfile(agent);

        assertEq(aiuScores[0], 100);
        assertEq(aiuScores[1], 50);
        assertEq(aiuScores[2], 0);
        assertEq(aiuScores[3], 0);
        assertEq(aiuScores[4], 0);
        assertEq(aiuScores[5], 0);

        assertEq(jobCounts[0], 1);
        assertEq(jobCounts[1], 1);
        assertEq(jobCounts[2], 0);
        assertEq(jobCounts[3], 0);
        assertEq(jobCounts[4], 0);
        assertEq(jobCounts[5], 0);

        assertEq(primary, 0); // Code has highest AIU
    }

    function test_getAgentCategoryProfile_new_agent() public {
        (uint256[6] memory aiuScores, uint256[6] memory jobCounts, uint256 primary) = 
            registry.getAgentCategoryProfile(agent);

        for (uint256 i = 0; i < 6; i++) {
            assertEq(aiuScores[i], 0);
            assertEq(jobCounts[i], 0);
        }
        assertEq(primary, 0); // Default to first category
    }

    // ─── setActive ─────────────────────────────────────────────────────────────

    function test_setActive_deactivate() public {
        registry.setActive(0, false);

        (,,,,, bool active) = registry.categories(0);
        assertFalse(active);
    }

    function test_setActivate_activate() public {
        registry.setActive(0, false);
        registry.setActive(0, true);

        (,,,,, bool active) = registry.categories(0);
        assertTrue(active);
    }

    function test_setActive_invalid_category() public {
        vm.expectRevert(CategoryRegistry.InvalidCategory.selector);
        registry.setActive(6, false);
    }

    function test_setActive_unauthorized() public {
        vm.prank(agent);
        vm.expectRevert(CategoryRegistry.Unauthorized.selector);
        registry.setActive(0, false);
    }

    // ─── setOperator ───────────────────────────────────────────────────────────

    function test_setOperator_grant() public {
        address newOperator = address(0x123);
        registry.setOperator(newOperator, true);

        assertTrue(registry.operators(newOperator));
    }

    function test_setOperator_revoke() public {
        registry.setOperator(operator, false);

        assertFalse(registry.operators(operator));
    }

    function test_setOperator_zero_address() public {
        vm.expectRevert(CategoryRegistry.ZeroAddress.selector);
        registry.setOperator(address(0), true);
    }

    function test_setOperator_unauthorized() public {
        vm.prank(agent);
        vm.expectRevert(CategoryRegistry.Unauthorized.selector);
        registry.setOperator(address(0x123), true);
    }

    // ─── Ownership Transfer ────────────────────────────────────────────────────

    function test_transferOwnership() public {
        address newOwner = address(0x456);
        registry.transferOwnership(newOwner);

        vm.prank(newOwner);
        registry.acceptOwnership();

        assertEq(registry.owner(), newOwner);
    }

    function test_transferOwnership_zero_address() public {
        vm.expectRevert(CategoryRegistry.ZeroAddress.selector);
        registry.transferOwnership(address(0));
    }

    function test_acceptOwnership_unauthorized() public {
        registry.transferOwnership(address(0x789));

        vm.prank(agent);
        vm.expectRevert(CategoryRegistry.Unauthorized.selector);
        registry.acceptOwnership();
    }

    // ─── Integration Tests ─────────────────────────────────────────────────────

    function test_full_workflow() public {
        // Agent completes tasks in multiple categories
        vm.prank(operator);
        registry.recordCategoryCompletion(agent, 0, 100); // Code
        vm.prank(operator);
        registry.recordCategoryCompletion(agent, 1, 75);  // Design
        vm.prank(operator);
        registry.recordCategoryCompletion(agent, 0, 50);  // Code again

        // Update epoch volume
        vm.prank(operator);
        registry.updateEpochVolume(0, 1000);

        // Check profile
        (uint256[6] memory aiuScores, uint256[6] memory jobCounts, uint256 primary) = 
            registry.getAgentCategoryProfile(agent);

        assertEq(aiuScores[0], 150); // Code total
        assertEq(aiuScores[1], 75);  // Design total
        assertEq(jobCounts[0], 2);
        assertEq(jobCounts[1], 1);
        assertEq(primary, 0); // Code is primary

        // Adjust weights
        registry.setCategoryWeight(0, 4000);

        // Verify total still 10000
        uint256 totalWeight;
        for (uint256 i = 0; i < 6; i++) {
            (, uint256 weight,,,,) = registry.categories(i);
            totalWeight += weight;
        }
        assertEq(totalWeight, 10000);
    }
}