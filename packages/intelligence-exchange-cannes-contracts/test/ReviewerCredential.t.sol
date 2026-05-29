// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ReviewerCredential} from "../src/ReviewerCredential.sol";
import {ReviewerStakeManager} from "../src/ReviewerStakeManager.sol";
import {IntelToken} from "../src/IntelToken.sol";

contract ReviewerCredentialTest is Test {
    ReviewerCredential public credential;
    ReviewerStakeManager public stakeManager;
    IntelToken public intel;

    address owner = address(this);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address charlie = address(0xC4A711E);
    address operator = address(0x0FFFF);
    address treasury = address(0x1234567890123456789012345678901234567890);

    uint256 constant MIN_BOND = 500e18;

    function setUp() public {
        // Deploy INTEL token
        intel = new IntelToken("INTEL", "INTEL", owner, 1_000_000e18, 10_000_000e18);
        
        // Deploy ReviewerStakeManager
        stakeManager = new ReviewerStakeManager(address(intel), treasury);
        
        // Deploy ReviewerCredential
        credential = new ReviewerCredential(address(stakeManager));
        
        // Set operator
        credential.setOperator(operator, true);
        stakeManager.setOperator(operator, true);

        // Mint INTEL to alice and bob for bonding
        intel.mint(alice, 1000e18);
        intel.mint(bob, 1000e18);
        intel.mint(charlie, 1000e18);

        // Approve stake manager to spend INTEL
        vm.prank(alice);
        intel.approve(address(stakeManager), type(uint256).max);
        vm.prank(bob);
        intel.approve(address(stakeManager), type(uint256).max);
        vm.prank(charlie);
        intel.approve(address(stakeManager), type(uint256).max);
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    function test_constructor_ownerSet() public view {
        assertEq(credential.owner(), owner);
    }

    function test_constructor_reviewerStakeManagerSet() public view {
        assertEq(address(credential.reviewerStakeManager()), address(stakeManager));
    }

    function test_constructor_zeroStakeManager_reverts() public {
        vm.expectRevert(ReviewerCredential.ZeroAddress.selector);
        new ReviewerCredential(address(0));
    }

    // ─── mintInitialCredential ─────────────────────────────────────────────────

    function test_mintInitialCredential_mintsTierZero() public {
        // Register alice as reviewer
        vm.prank(alice);
        stakeManager.registerAsReviewer(MIN_BOND);

        // Mint credential
        vm.prank(operator);
        credential.mintInitialCredential(alice);

        assertEq(credential.currentTier(alice), 0);
        assertEq(credential.hasMinted(alice), true);
        assertEq(credential.balanceOf(alice, 0), 1);
    }

    function test_mintInitialCredential_emitsEvents() public {
        vm.prank(alice);
        stakeManager.registerAsReviewer(MIN_BOND);

        vm.expectEmit(true, true, true, true);
        emit ReviewerCredential.TransferSingle(operator, address(0), alice, 0, 1);
        
        vm.expectEmit(true, false, false, false);
        emit ReviewerCredential.CredentialMinted(alice, 0);

        vm.prank(operator);
        credential.mintInitialCredential(alice);
    }

    function test_mintInitialCredential_unauthorized_reverts() public {
        vm.prank(alice);
        stakeManager.registerAsReviewer(MIN_BOND);

        vm.prank(alice);
        vm.expectRevert(ReviewerCredential.Unauthorized.selector);
        credential.mintInitialCredential(alice);
    }

    function test_mintInitialCredential_alreadyMinted_reverts() public {
        vm.prank(alice);
        stakeManager.registerAsReviewer(MIN_BOND);

        vm.prank(operator);
        credential.mintInitialCredential(alice);

        vm.prank(operator);
        vm.expectRevert(ReviewerCredential.AlreadyMinted.selector);
        credential.mintInitialCredential(alice);
    }

    function test_mintInitialCredential_notEligible_reverts() public {
        // Alice hasn't registered as reviewer
        vm.prank(operator);
        vm.expectRevert(ReviewerCredential.NotEligible.selector);
        credential.mintInitialCredential(alice);
    }

    function test_mintInitialCredential_zeroAddress_reverts() public {
        vm.prank(operator);
        vm.expectRevert(ReviewerCredential.ZeroAddress.selector);
        credential.mintInitialCredential(address(0));
    }

    // ─── evaluateAndUpdateTier ────────────────────────────────────────────────

    function test_evaluateAndUpdateTier_upgradesToTier1() public {
        // Setup: register and mint credential
        vm.prank(alice);
        stakeManager.registerAsReviewer(MIN_BOND);
        vm.prank(operator);
        credential.mintInitialCredential(alice);

        // Simulate 10 reviews, 0 slashes
        _simulateReviews(alice, 10, 0);

        // Evaluate tier
        vm.prank(operator);
        credential.evaluateAndUpdateTier(alice, 0);

        assertEq(credential.currentTier(alice), 1);
        assertEq(credential.balanceOf(alice, 0), 0);
        assertEq(credential.balanceOf(alice, 1), 1);
    }

    function test_evaluateAndUpdateTier_upgradesToTier2() public {
        vm.prank(alice);
        stakeManager.registerAsReviewer(MIN_BOND);
        vm.prank(operator);
        credential.mintInitialCredential(alice);

        // Simulate 50 reviews, 2 slashes (4% rate < 8%)
        _simulateReviews(alice, 50, 2);

        vm.prank(operator);
        credential.evaluateAndUpdateTier(alice, 2);

        assertEq(credential.currentTier(alice), 2);
        assertEq(credential.balanceOf(alice, 0), 0);
        assertEq(credential.balanceOf(alice, 2), 1);
    }

    function test_evaluateAndUpdateTier_upgradesToTier3() public {
        vm.prank(alice);
        stakeManager.registerAsReviewer(MIN_BOND);
        vm.prank(operator);
        credential.mintInitialCredential(alice);

        // Simulate 200 reviews, 3 slashes (1.5% rate < 3%)
        _simulateReviews(alice, 200, 3);

        vm.prank(operator);
        credential.evaluateAndUpdateTier(alice, 3);

        assertEq(credential.currentTier(alice), 3);
        assertEq(credential.balanceOf(alice, 0), 0);
        assertEq(credential.balanceOf(alice, 3), 1);
    }

    function test_evaluateAndUpdateTier_downgradesOnHighSlashRate() public {
        // Start at Tier 1
        vm.prank(alice);
        stakeManager.registerAsReviewer(MIN_BOND);
        vm.prank(operator);
        credential.mintInitialCredential(alice);
        _simulateReviews(alice, 10, 0);
        vm.prank(operator);
        credential.evaluateAndUpdateTier(alice, 0);
        assertEq(credential.currentTier(alice), 1);

        // Add more reviews but high slash rate (20% > 15%)
        _simulateReviews(alice, 10, 2); // Total: 20 reviews, 2 slashes = 10% rate (still OK for Tier 1)
        
        // Make it worse: 20 reviews, 4 slashes = 20% rate (should drop to Tier 0)
        vm.prank(operator);
        credential.evaluateAndUpdateTier(alice, 4);

        assertEq(credential.currentTier(alice), 0);
    }

    function test_evaluateAndUpdateTier_noChangeIfTierSame() public {
        vm.prank(alice);
        stakeManager.registerAsReviewer(MIN_BOND);
        vm.prank(operator);
        credential.mintInitialCredential(alice);

        // No reviews yet, should stay at Tier 0
        vm.prank(operator);
        credential.evaluateAndUpdateTier(alice, 0);

        assertEq(credential.currentTier(alice), 0);
        assertEq(credential.balanceOf(alice, 0), 1);
    }

    function test_evaluateAndUpdateTier_emitsTierUpdatedEvent() public {
        vm.prank(alice);
        stakeManager.registerAsReviewer(MIN_BOND);
        vm.prank(operator);
        credential.mintInitialCredential(alice);

        _simulateReviews(alice, 10, 0);

        vm.expectEmit(true, false, false, false);
        emit ReviewerCredential.TierUpdated(alice, 0, 1);

        vm.prank(operator);
        credential.evaluateAndUpdateTier(alice, 0);
    }

    function test_evaluateAndUpdateTier_unauthorized_reverts() public {
        vm.prank(alice);
        stakeManager.registerAsReviewer(MIN_BOND);
        vm.prank(operator);
        credential.mintInitialCredential(alice);

        vm.prank(alice);
        vm.expectRevert(ReviewerCredential.Unauthorized.selector);
        credential.evaluateAndUpdateTier(alice, 0);
    }

    function test_evaluateAndUpdateTier_notCredentialed_reverts() public {
        vm.prank(operator);
        vm.expectRevert(ReviewerCredential.NotCredentialed.selector);
        credential.evaluateAndUpdateTier(alice, 0);
    }

    function test_evaluateAndUpdateTier_zeroAddress_reverts() public {
        vm.prank(operator);
        vm.expectRevert(ReviewerCredential.ZeroAddress.selector);
        credential.evaluateAndUpdateTier(address(0), 0);
    }

    // ─── getReviewerTier ───────────────────────────────────────────────────────

    function test_getReviewerTier_returnsCorrectTier() public {
        vm.prank(alice);
        stakeManager.registerAsReviewer(MIN_BOND);
        vm.prank(operator);
        credential.mintInitialCredential(alice);

        assertEq(credential.getReviewerTier(alice), 0);
    }

    function test_getReviewerTier_notCredentialed_reverts() public {
        vm.expectRevert(ReviewerCredential.NotCredentialed.selector);
        credential.getReviewerTier(alice);
    }

    // ─── meetsMinTier ──────────────────────────────────────────────────────────

    function test_meetsMinTier_trueWhenEqual() public {
        vm.prank(alice);
        stakeManager.registerAsReviewer(MIN_BOND);
        vm.prank(operator);
        credential.mintInitialCredential(alice);

        assertTrue(credential.meetsMinTier(alice, 0));
    }

    function test_meetsMinTier_trueWhenHigher() public {
        vm.prank(alice);
        stakeManager.registerAsReviewer(MIN_BOND);
        vm.prank(operator);
        credential.mintInitialCredential(alice);
        _simulateReviews(alice, 10, 0);
        vm.prank(operator);
        credential.evaluateAndUpdateTier(alice, 0);

        assertTrue(credential.meetsMinTier(alice, 0));
        assertTrue(credential.meetsMinTier(alice, 1));
    }

    function test_meetsMinTier_falseWhenLower() public {
        vm.prank(alice);
        stakeManager.registerAsReviewer(MIN_BOND);
        vm.prank(operator);
        credential.mintInitialCredential(alice);

        assertFalse(credential.meetsMinTier(alice, 1));
    }

    function test_meetsMinTier_falseWhenNotCredentialed() public view {
        assertFalse(credential.meetsMinTier(alice, 0));
    }

    // ─── Soulbound Transfer Restrictions ──────────────────────────────────────

    function test_safeTransferFrom_reverts() public {
        vm.prank(alice);
        stakeManager.registerAsReviewer(MIN_BOND);
        vm.prank(operator);
        credential.mintInitialCredential(alice);

        vm.prank(alice);
        vm.expectRevert(ReviewerCredential.SoulboundNonTransferable.selector);
        credential.safeTransferFrom(alice, bob, 0, 1, "");
    }

    function test_safeBatchTransferFrom_reverts() public {
        vm.prank(alice);
        stakeManager.registerAsReviewer(MIN_BOND);
        vm.prank(operator);
        credential.mintInitialCredential(alice);

        uint256[] memory ids = new uint256[](1);
        ids[0] = 0;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1;

        vm.prank(alice);
        vm.expectRevert(ReviewerCredential.SoulboundNonTransferable.selector);
        credential.safeBatchTransferFrom(alice, bob, ids, amounts, "");
    }

    // ─── Admin Functions ──────────────────────────────────────────────────────

    function test_setOperator_addsOperator() public {
        credential.setOperator(charlie, true);
        assertTrue(credential.operators(charlie));
    }

    function test_setOperator_removesOperator() public {
        credential.setOperator(charlie, true);
        credential.setOperator(charlie, false);
        assertFalse(credential.operators(charlie));
    }

    function test_setOperator_onlyOwner_reverts() public {
        vm.prank(alice);
        vm.expectRevert(ReviewerCredential.Unauthorized.selector);
        credential.setOperator(charlie, true);
    }

    function test_transferOwnership_setsPendingOwner() public {
        credential.transferOwnership(alice);
        assertEq(credential.pendingOwner(), alice);
        assertEq(credential.owner(), owner);
    }

    function test_acceptOwnership_completesTransfer() public {
        credential.transferOwnership(alice);
        vm.prank(alice);
        credential.acceptOwnership();
        assertEq(credential.owner(), alice);
        assertEq(credential.pendingOwner(), address(0));
    }

    // ─── ERC-1155 Interface ───────────────────────────────────────────────────

    function test_supportsInterface_erc165() public view {
        assertTrue(credential.supportsInterface(0x01ffc9a7));
    }

    function test_supportsInterface_erc1155() public view {
        assertTrue(credential.supportsInterface(0xd9b67a26));
    }

    function test_balanceOf_returnsCorrectBalance() public {
        vm.prank(alice);
        stakeManager.registerAsReviewer(MIN_BOND);
        vm.prank(operator);
        credential.mintInitialCredential(alice);

        assertEq(credential.balanceOf(alice, 0), 1);
        assertEq(credential.balanceOf(bob, 0), 0);
    }

    function test_uri_returnsEmptyString() public view {
        assertEq(credential.uri(0), "");
    }

    // ─── Helper Functions ─────────────────────────────────────────────────────

    function _simulateReviews(address reviewer, uint256 reviewCount, uint256 /*slashCount*/) internal {
        // Record reviews in ReviewerStakeManager
        for (uint256 i = 0; i < reviewCount; i++) {
            vm.prank(operator);
            stakeManager.recordReview(reviewer, 1e18); // 1 INTEL task value
        }
    }
}