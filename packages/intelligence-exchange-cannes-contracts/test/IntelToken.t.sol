// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IntelToken} from "../src/IntelToken.sol";

contract IntelTokenTest is Test {
    IntelToken public token;

    address owner   = address(this);
    address alice   = address(0xA11CE);
    address bob     = address(0xB0B);
    address charlie = address(0xC4A711E);
    address minter  = makeAddr("minter");

    uint256 constant MAX_SUPPLY     = 1_000_000e18;
    uint256 constant INITIAL_SUPPLY = 100_000e18;

    function setUp() public {
        token = new IntelToken("Intelligence Exchange", "INTEL", owner, INITIAL_SUPPLY, MAX_SUPPLY);
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    function test_constructor_name() public view {
        assertEq(token.name(), "Intelligence Exchange");
    }

    function test_constructor_symbol() public view {
        assertEq(token.symbol(), "INTEL");
    }

    function test_constructor_decimals() public view {
        assertEq(token.decimals(), 18);
    }

    function test_constructor_totalSupply() public view {
        assertEq(token.totalSupply(), INITIAL_SUPPLY);
    }

    function test_constructor_maxSupply() public view {
        assertEq(token.maxSupply(), MAX_SUPPLY);
    }

    function test_constructor_ownerBalance() public view {
        assertEq(token.balanceOf(owner), INITIAL_SUPPLY);
    }

    function test_constructor_owner() public view {
        assertEq(token.owner(), owner);
    }

    function test_constructor_zeroOwner_reverts() public {
        vm.expectRevert(IntelToken.ZeroAddress.selector);
        new IntelToken("T", "T", address(0), 0, MAX_SUPPLY);
    }

    function test_constructor_initialSupplyExceedsMax_reverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(IntelToken.MaxSupplyExceeded.selector, MAX_SUPPLY + 1, MAX_SUPPLY)
        );
        new IntelToken("T", "T", owner, MAX_SUPPLY + 1, MAX_SUPPLY);
    }

    function test_constructor_zeroMaxSupply_noCapEnforced() public {
        // maxSupply == 0 means uncapped
        IntelToken uncapped = new IntelToken("T", "T", owner, 0, 0);
        assertEq(uncapped.maxSupply(), 0);
    }

    // ─── ERC-20: transfer ─────────────────────────────────────────────────────

    function test_transfer_happyPath() public {
        token.transfer(alice, 1000e18);
        assertEq(token.balanceOf(alice), 1000e18);
        assertEq(token.balanceOf(owner), INITIAL_SUPPLY - 1000e18);
    }

    function test_transfer_emitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit IntelToken.Transfer(owner, alice, 500e18);
        token.transfer(alice, 500e18);
    }

    function test_transfer_toZeroAddress_reverts() public {
        vm.expectRevert(IntelToken.ZeroAddress.selector);
        token.transfer(address(0), 100e18);
    }

    function test_transfer_insufficientBalance_reverts() public {
        vm.expectRevert(IntelToken.InsufficientBalance.selector);
        token.transfer(alice, INITIAL_SUPPLY + 1);
    }

    function test_transfer_zeroAmount_succeeds() public {
        token.transfer(alice, 0);
        assertEq(token.balanceOf(alice), 0);
    }

    // ─── ERC-20: approve / transferFrom ───────────────────────────────────────

    function test_approve_setsAllowance() public {
        token.approve(alice, 500e18);
        assertEq(token.allowance(owner, alice), 500e18);
    }

    function test_approve_emitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit IntelToken.Approval(owner, alice, 500e18);
        token.approve(alice, 500e18);
    }

    function test_approve_zeroSpender_reverts() public {
        vm.expectRevert(IntelToken.ZeroAddress.selector);
        token.approve(address(0), 100e18);
    }

    function test_transferFrom_happyPath() public {
        token.approve(alice, 1000e18);
        vm.prank(alice);
        token.transferFrom(owner, bob, 600e18);
        assertEq(token.balanceOf(bob), 600e18);
        assertEq(token.allowance(owner, alice), 400e18);
    }

    function test_transferFrom_insufficientAllowance_reverts() public {
        token.approve(alice, 100e18);
        vm.prank(alice);
        vm.expectRevert(IntelToken.InsufficientAllowance.selector);
        token.transferFrom(owner, bob, 101e18);
    }

    function test_transferFrom_emitsTransferEvent() public {
        token.approve(alice, 500e18);
        vm.expectEmit(true, true, false, true);
        emit IntelToken.Transfer(owner, bob, 200e18);
        vm.prank(alice);
        token.transferFrom(owner, bob, 200e18);
    }

    // ─── Transfer: paused reverts ─────────────────────────────────────────────

    function test_transfer_whenPaused_reverts() public {
        token.transfer(alice, 1000e18);
        token.pause();
        vm.prank(alice);
        vm.expectRevert(IntelToken.ContractPaused.selector);
        token.transfer(bob, 100e18);
    }

    function test_transferFrom_whenPaused_reverts() public {
        token.approve(alice, 1000e18);
        token.pause();
        vm.prank(alice);
        vm.expectRevert(IntelToken.ContractPaused.selector);
        token.transferFrom(owner, bob, 100e18);
    }

    // ─── Mint ─────────────────────────────────────────────────────────────────

    function test_mint_happyPath() public {
        token.setMinter(minter);
        vm.prank(minter);
        token.mint(alice, 50_000e18);
        assertEq(token.balanceOf(alice), 50_000e18);
        assertEq(token.totalSupply(), INITIAL_SUPPLY + 50_000e18);
    }

    function test_mint_emitsMintedEvent() public {
        token.setMinter(minter);
        vm.expectEmit(true, false, false, true);
        emit IntelToken.Minted(alice, 1000e18);
        vm.prank(minter);
        token.mint(alice, 1000e18);
    }

    function test_mint_ownerCanMint() public {
        // owner also satisfies onlyMinter
        token.mint(alice, 1000e18);
        assertEq(token.balanceOf(alice), 1000e18);
    }

    function test_mint_nonMinter_reverts() public {
        vm.prank(alice);
        vm.expectRevert(IntelToken.Unauthorized.selector);
        token.mint(bob, 1000e18);
    }

    function test_mint_whenPaused_reverts() public {
        token.setMinter(minter);
        token.pause();
        vm.prank(minter);
        vm.expectRevert(IntelToken.ContractPaused.selector);
        token.mint(alice, 1000e18);
    }

    function test_mint_exceedsMaxSupply_reverts() public {
        token.setMinter(minter);
        uint256 remaining = MAX_SUPPLY - INITIAL_SUPPLY;
        vm.prank(minter);
        vm.expectRevert(
            abi.encodeWithSelector(IntelToken.MaxSupplyExceeded.selector, remaining + 1, remaining)
        );
        token.mint(alice, remaining + 1);
    }

    function test_mint_exactlyMaxSupply_succeeds() public {
        token.setMinter(minter);
        uint256 remaining = MAX_SUPPLY - INITIAL_SUPPLY;
        vm.prank(minter);
        token.mint(alice, remaining);
        assertEq(token.totalSupply(), MAX_SUPPLY);
    }

    function test_mint_zeroMaxSupply_noCapEnforced() public {
        IntelToken uncapped = new IntelToken("T", "T", owner, 0, 0);
        uncapped.mint(alice, type(uint256).max / 2);
        assertEq(uncapped.balanceOf(alice), type(uint256).max / 2);
    }

    // ─── Burn ─────────────────────────────────────────────────────────────────

    function test_burn_happyPath() public {
        token.burn(1000e18);
        assertEq(token.totalSupply(), INITIAL_SUPPLY - 1000e18);
        assertEq(token.balanceOf(owner), INITIAL_SUPPLY - 1000e18);
    }

    function test_burn_emitsBurnedEvent() public {
        vm.expectEmit(true, false, false, true);
        emit IntelToken.Burned(owner, 500e18);
        token.burn(500e18);
    }

    function test_burn_insufficientBalance_reverts() public {
        vm.prank(alice);
        vm.expectRevert(IntelToken.InsufficientBalance.selector);
        token.burn(1);
    }

    function test_burn_whenPaused_reverts() public {
        token.pause();
        vm.expectRevert(IntelToken.ContractPaused.selector);
        token.burn(100e18);
    }

    function test_burnFrom_happyPath() public {
        token.approve(alice, 500e18);
        vm.prank(alice);
        token.burnFrom(owner, 300e18);
        assertEq(token.totalSupply(), INITIAL_SUPPLY - 300e18);
        assertEq(token.allowance(owner, alice), 200e18);
    }

    function test_burnFrom_insufficientAllowance_reverts() public {
        token.approve(alice, 100e18);
        vm.prank(alice);
        vm.expectRevert(IntelToken.InsufficientAllowance.selector);
        token.burnFrom(owner, 101e18);
    }

    function test_burnFrom_whenPaused_reverts() public {
        token.approve(alice, 500e18);
        token.pause();
        vm.prank(alice);
        vm.expectRevert(IntelToken.ContractPaused.selector);
        token.burnFrom(owner, 100e18);
    }

    // ─── Pause / Unpause ─────────────────────────────────────────────────────

    function test_pause_setsFlag() public {
        token.pause();
        assertTrue(token.paused());
    }

    function test_pause_emitsEvent() public {
        vm.expectEmit(true, false, false, false);
        emit IntelToken.Paused(owner);
        token.pause();
    }

    function test_pause_onlyOwner_reverts() public {
        vm.prank(alice);
        vm.expectRevert(IntelToken.Unauthorized.selector);
        token.pause();
    }

    function test_unpause_clearsFlag() public {
        token.pause();
        token.unpause();
        assertFalse(token.paused());
    }

    function test_unpause_emitsEvent() public {
        token.pause();
        vm.expectEmit(true, false, false, false);
        emit IntelToken.Unpaused(owner);
        token.unpause();
    }

    function test_unpause_onlyOwner_reverts() public {
        token.pause();
        vm.prank(alice);
        vm.expectRevert(IntelToken.Unauthorized.selector);
        token.unpause();
    }

    function test_unpause_restoresTransfers() public {
        token.transfer(alice, 1000e18);
        token.pause();
        token.unpause();
        vm.prank(alice);
        token.transfer(bob, 500e18);
        assertEq(token.balanceOf(bob), 500e18);
    }

    function test_unpause_restoresMint() public {
        token.setMinter(minter);
        token.pause();
        token.unpause();
        vm.prank(minter);
        token.mint(alice, 100e18);
        assertEq(token.balanceOf(alice), 100e18);
    }

    // ─── setMinter ────────────────────────────────────────────────────────────

    function test_setMinter_setsMinter() public {
        token.setMinter(alice);
        assertEq(token.minter(), alice);
    }

    function test_setMinter_emitsEvent() public {
        vm.expectEmit(true, true, false, false);
        emit IntelToken.MinterSet(address(0), alice);
        token.setMinter(alice);
    }

    function test_setMinter_onlyOwner_reverts() public {
        vm.prank(alice);
        vm.expectRevert(IntelToken.Unauthorized.selector);
        token.setMinter(bob);
    }

    function test_setMinter_zeroAddress_revokesRole() public {
        token.setMinter(alice);
        token.setMinter(address(0));
        assertEq(token.minter(), address(0));
        // alice can no longer mint
        vm.prank(alice);
        vm.expectRevert(IntelToken.Unauthorized.selector);
        token.mint(bob, 1);
    }

    // ─── Ownable2Step ─────────────────────────────────────────────────────────

    function test_transferOwnership_setsPendingOwner() public {
        token.transferOwnership(alice);
        assertEq(token.pendingOwner(), alice);
        // owner unchanged
        assertEq(token.owner(), owner);
    }

    function test_transferOwnership_emitsStartedEvent() public {
        vm.expectEmit(true, true, false, false);
        emit IntelToken.OwnershipTransferStarted(owner, alice);
        token.transferOwnership(alice);
    }

    function test_transferOwnership_zeroAddress_reverts() public {
        vm.expectRevert(IntelToken.ZeroAddress.selector);
        token.transferOwnership(address(0));
    }

    function test_transferOwnership_nonOwner_reverts() public {
        vm.prank(alice);
        vm.expectRevert(IntelToken.Unauthorized.selector);
        token.transferOwnership(bob);
    }

    function test_acceptOwnership_completesTransfer() public {
        token.transferOwnership(alice);
        vm.prank(alice);
        token.acceptOwnership();
        assertEq(token.owner(), alice);
        assertEq(token.pendingOwner(), address(0));
    }

    function test_acceptOwnership_emitsTransferredEvent() public {
        token.transferOwnership(alice);
        vm.expectEmit(true, true, false, false);
        emit IntelToken.OwnershipTransferred(owner, alice);
        vm.prank(alice);
        token.acceptOwnership();
    }

    function test_acceptOwnership_nonNominee_reverts() public {
        token.transferOwnership(alice);
        vm.prank(bob);
        vm.expectRevert(IntelToken.Unauthorized.selector);
        token.acceptOwnership();
    }

    function test_acceptOwnership_newOwnerCanPause() public {
        token.transferOwnership(alice);
        vm.prank(alice);
        token.acceptOwnership();
        vm.prank(alice);
        token.pause();
        assertTrue(token.paused());
    }

    function test_acceptOwnership_oldOwnerLosesAccess() public {
        token.transferOwnership(alice);
        vm.prank(alice);
        token.acceptOwnership();
        // old owner can no longer call onlyOwner functions
        vm.expectRevert(IntelToken.Unauthorized.selector);
        token.pause();
    }

    // ─── Integration ──────────────────────────────────────────────────────────

    function test_integration_mintBurnCycle() public {
        token.setMinter(minter);
        vm.prank(minter);
        token.mint(alice, 10_000e18);
        assertEq(token.totalSupply(), INITIAL_SUPPLY + 10_000e18);

        vm.prank(alice);
        token.burn(5_000e18);
        assertEq(token.totalSupply(), INITIAL_SUPPLY + 5_000e18);
        assertEq(token.balanceOf(alice), 5_000e18);
    }

    function test_integration_pauseBlocksAllMutations() public {
        token.setMinter(minter);
        token.pause();

        // transfer blocked
        vm.expectRevert(IntelToken.ContractPaused.selector);
        token.transfer(alice, 100e18);

        // mint blocked
        vm.prank(minter);
        vm.expectRevert(IntelToken.ContractPaused.selector);
        token.mint(alice, 100e18);

        // burn blocked
        vm.expectRevert(IntelToken.ContractPaused.selector);
        token.burn(100e18);
    }

    function test_integration_fullOwnershipHandoff() public {
        // owner → alice, alice sets minter, minter mints
        token.transferOwnership(alice);
        vm.prank(alice);
        token.acceptOwnership();

        vm.prank(alice);
        token.setMinter(charlie);

        vm.prank(charlie);
        token.mint(bob, 1000e18);
        assertEq(token.balanceOf(bob), 1000e18);
    }
}
