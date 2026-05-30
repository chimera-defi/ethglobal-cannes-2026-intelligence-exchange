// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IntelToken} from "../src/IntelToken.sol";

/// @title IntelTokenFuzzTest
/// @notice Comprehensive fuzz testing for IntelToken contract
/// @dev Tests critical functions with randomized inputs to find edge cases
contract IntelTokenFuzzTest is Test {
    IntelToken public token;

    address owner = address(this);
    address minter = makeAddr("minter");

    uint256 constant MAX_SUPPLY = 1_000_000_000e18; // 1 billion tokens
    uint256 constant INITIAL_SUPPLY = 0; // Start with 0 for fuzz testing

    function setUp() public {
        token = new IntelToken("Intelligence Exchange", "INTEL", owner, INITIAL_SUPPLY, MAX_SUPPLY);
        token.setMinter(minter);
    }

    // ─── Fuzz: Transfer Operations ─────────────────────────────────────────────

    /// @notice Fuzz test for transfer function with random amounts
    /// @param amount Random transfer amount (bounded)
    function testFuzz_transfer(uint256 amount) public {
        // Mint tokens to owner first
        token.mint(owner, MAX_SUPPLY / 2);

        // Bound amount to prevent overflow
        amount = bound(amount, 1, token.balanceOf(owner));

        address recipient = makeAddr("recipient");

        uint256 ownerBalanceBefore = token.balanceOf(owner);
        uint256 recipientBalanceBefore = token.balanceOf(recipient);

        token.transfer(recipient, amount);

        assertEq(token.balanceOf(owner), ownerBalanceBefore - amount);
        assertEq(token.balanceOf(recipient), recipientBalanceBefore + amount);
    }

    // ─── Fuzz: Mint Operations ─────────────────────────────────────────────────

    /// @notice Fuzz test for mint function with random amounts
    /// @param amount Random mint amount (bounded)
    function testFuzz_mint(uint256 amount) public {
        amount = bound(amount, 1, MAX_SUPPLY);

        uint256 totalSupplyBefore = token.totalSupply();
        uint256 minterBalanceBefore = token.balanceOf(minter);

        vm.prank(minter);
        token.mint(minter, amount);

        assertEq(token.totalSupply(), totalSupplyBefore + amount);
        assertEq(token.balanceOf(minter), minterBalanceBefore + amount);
        assertLe(token.totalSupply(), MAX_SUPPLY);
    }

    /// @notice Fuzz test that mint cannot exceed max supply
    function testFuzz_mintCannotExceedMaxSupply() public {
        // Mint up to max supply
        vm.prank(minter);
        token.mint(minter, MAX_SUPPLY);

        // Try to mint more - should fail
        vm.prank(minter);
        vm.expectRevert();
        token.mint(minter, 1);
    }

    // ─── Fuzz: Burn Operations ─────────────────────────────────────────────────

    /// @notice Fuzz test for burn function with random amounts
    /// @param amount Random burn amount (bounded)
    function testFuzz_burn(uint256 amount) public {
        // Mint tokens to owner first
        uint256 mintAmount = MAX_SUPPLY / 2;
        token.mint(owner, mintAmount);

        amount = bound(amount, 1, token.balanceOf(owner));

        uint256 totalSupplyBefore = token.totalSupply();
        uint256 ownerBalanceBefore = token.balanceOf(owner);

        token.burn(amount);

        assertEq(token.totalSupply(), totalSupplyBefore - amount);
        assertEq(token.balanceOf(owner), ownerBalanceBefore - amount);
    }

    /// @notice Fuzz test that burn cannot exceed balance
    /// @param amount Random burn amount (bounded)
    function testFuzz_burnCannotExceedBalance(uint256 amount) public {
        // Mint tokens to owner first
        token.mint(owner, MAX_SUPPLY / 2);

        amount = bound(amount, token.balanceOf(owner) + 1, MAX_SUPPLY);

        vm.expectRevert();
        token.burn(amount);
    }

    // ─── Fuzz: Approval Operations ─────────────────────────────────────────────

    /// @notice Fuzz test for approve function with random amounts
    /// @param amount Random approval amount
    function testFuzz_approve(uint256 amount) public {
        address spender = makeAddr("spender");

        token.approve(spender, amount);

        assertEq(token.allowance(owner, spender), amount);
    }

    // ─── Fuzz: Edge Cases ──────────────────────────────────────────────────────

    /// @notice Fuzz test for zero address transfers
    function testFuzz_transferToZeroAddress() public {
        token.mint(owner, MAX_SUPPLY / 2);

        vm.expectRevert();
        token.transfer(address(0), 100);
    }

    /// @notice Fuzz test for transfers exceeding balance
    function testFuzz_transferExceedingBalance() public {
        token.mint(owner, MAX_SUPPLY / 2);

        address recipient = makeAddr("recipient");

        vm.expectRevert();
        token.transfer(recipient, MAX_SUPPLY);
    }

    // ─── Fuzz: Pause Functionality ─────────────────────────────────────────────

    /// @notice Fuzz test that transfers fail when paused
    function testFuzz_transferWhenPaused() public {
        token.mint(owner, MAX_SUPPLY / 2);

        address recipient = makeAddr("recipient");

        token.pause();

        vm.expectRevert();
        token.transfer(recipient, 100);
    }

    /// @notice Fuzz test that mint fails when paused
    function testFuzz_mintWhenPaused() public {
        token.pause();

        vm.prank(minter);
        vm.expectRevert();
        token.mint(minter, 100);
    }
}