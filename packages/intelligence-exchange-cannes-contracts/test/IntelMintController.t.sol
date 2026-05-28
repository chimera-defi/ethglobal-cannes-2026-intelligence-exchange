// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IntelToken} from "../src/IntelToken.sol";
import {IntelStaking} from "../src/IntelStaking.sol";
import {IntelMintController} from "../src/IntelMintController.sol";

contract IntelMintControllerTest is Test {
    IntelToken public intel;
    IntelStaking public staking;
    IntelMintController public controller;

    address owner       = address(this);
    address alice       = address(0xA11CE);
    address pol         = address(0x1111);
    address treasury    = address(0x2222);
    address operator    = address(0x0FFFF);

    uint256 constant MAX_SUPPLY  = 1_000_000e18;
    uint256 constant EPOCH       = 7 days;
    uint256 constant COOL        = 3 days;
    uint256 constant K           = 1e18;
    uint256 constant WALLET_CAP  = 10_000e18;
    uint256 constant GLOBAL_CAP  = 100_000e18;

    // Price: 1 INTEL = 0.01 ETH → 1e16 wei per 1e18 INTEL
    uint256 constant INITIAL_TWAP = 1e16;
    uint256 constant FLOOR_PRICE  = 1e15; // 0.001 ETH — below TWAP
    uint256 constant PREMIUM_BPS  = 0;    // 0% premium initially

    function setUp() public {
        intel = new IntelToken("INTEL", "INTEL", owner, 0, MAX_SUPPLY);
        staking = new IntelStaking(
            address(intel),
            EPOCH, COOL, K, WALLET_CAP, GLOBAL_CAP
        );
        controller = new IntelMintController(
            address(intel),
            address(staking),
            pol,
            treasury,
            FLOOR_PRICE,
            PREMIUM_BPS,
            INITIAL_TWAP
        );

        // Wire up: staking allows controller to consumeAllowance
        staking.setOperator(address(controller), true);

        // Grant IntelMintController the minter role (not full ownership).
        // This is the correct production wiring: owner retains pause key,
        // minter can mint. Use setMinter() not transferOwnership().
        intel.setMinter(address(controller));

        // Fund alice for staking
        vm.deal(alice, 100 ether);

        // Grant controller operator for external calls in some tests
        controller.setOperator(operator, true);
    }

    function _stakeAlice(uint256 amount) internal {
        // Mint intel directly to alice by re-granting owner temporarily
        // In tests we use a separate approach: controller mints to alice first
        // Since controller owns IntelToken, only it can mint. We'll use a helper.

        // Temporarily: transfer ownership back to test, mint, return
        vm.prank(address(controller));
        // controller doesn't have this function exposed; we need intel owner
        // Solution: keep a separate "testMint" approach
        // Actually IntelToken owner is controller now, so we call from controller's perspective
        // but controller has no pass-through mint. Let's use a deal-style approach with
        // forge's deal cheatcode doesn't work for custom tokens.

        // Workaround: controller itself exposes no mint-for-test.
        // Use vm.store to set balance? No — use a simpler approach:
        // set intel owner to a mintAuthority address we control.
        revert("use _mintAndStakeAlice");
    }

    function _mintAndStakeAlice(uint256 stakeAmount) internal {
        // Mint as minter (IntelMintController has the minter role, not ownership).
        // IntelToken.mint is onlyMinter; controller is the minter.
        vm.prank(address(controller));
        intel.mint(alice, stakeAmount);

        vm.prank(alice);
        intel.approve(address(staking), stakeAmount);

        vm.prank(alice);
        staking.stake(stakeAmount);
    }

    // ─── Price ────────────────────────────────────────────────────────────────

    function test_mintPrice_floor_when_twap_below() public {
        // TWAP=1e15 < floorPrice=1e15 — actually equal. Let's set TWAP below floor.
        controller.updateTWAP(5e14); // below floor
        // price = max(5e14 * 1, 1e15) * 1x = 1e15
        assertEq(controller.mintPrice(), 1e15);
    }

    function test_mintPrice_twap_with_premium() public {
        // TWAP=1e16, premium=1000 bps (10%)
        controller.setPremium(1000);
        // price = max(1e16 * 1.1, 1e15) * 1x = 1.1e16
        assertEq(controller.mintPrice(), 1.1e16);
    }

    function test_mintPrice_utilization_multiplier() public {
        // Set utilization 2x
        controller.updateUtilization(200, 100); // 200/100 = 2x
        // price = max(1e16, 1e15) * 2 = 2e16
        assertEq(controller.mintPrice(), 2e16);
    }

    function test_mintPrice_anti_reflexivity_high_demand() public {
        // High demand: 300/100 = 3x (clamped to max 3x)
        controller.updateUtilization(1000, 100); // 1000/100 = 10x → clamped to 3x
        assertEq(controller.mintPrice(), 3e16);
    }

    function test_mintPrice_one_x_when_no_utilization_data() public {
        controller.updateUtilization(0, 0); // no data → 1x
        assertEq(controller.mintPrice(), INITIAL_TWAP); // 1x of TWAP
    }

    function test_quoteMint() public {
        // mintPrice = 1e16 per 1e18 INTEL
        // Minting 2e18 INTEL costs 2 * 1e16 = 2e16 wei
        uint256 cost = controller.quoteMint(2e18);
        assertEq(cost, 2e16);
    }

    // ─── Happy path: executeMint ───────────────────────────────────────────────

    function test_executeMint_happy_path() public {
        _mintAndStakeAlice(100e18);

        uint256 allowance = staking.mintAllowance(alice);
        assertGt(allowance, 0);

        uint256 mintAmt = allowance / 2;
        uint256 price = controller.mintPrice();
        uint256 cost = (price * mintAmt) / 1e18;

        // Give operator sufficient ETH (operator sends the ETH, mints to alice)
        vm.deal(operator, cost + 1 ether);

        uint256 polBefore = pol.balance;
        uint256 treasuryBefore = treasury.balance;

        vm.prank(operator);
        controller.executeMint{value: cost}(alice, mintAmt, price);

        // Alice received INTEL
        assertEq(intel.balanceOf(alice), mintAmt);

        // Routing: 50% POL, 5% treasury, 45% staking contract
        uint256 polShare      = (cost * 5000) / 10000;
        uint256 treasuryShare = (cost * 500) / 10000;
        uint256 stakerShare   = cost - polShare - treasuryShare;

        assertEq(pol.balance - polBefore, polShare);
        assertEq(treasury.balance - treasuryBefore, treasuryShare);
        assertEq(address(staking).balance, stakerShare);
    }

    function test_executeMint_refunds_excess_eth() public {
        _mintAndStakeAlice(100e18);

        uint256 allowance = staking.mintAllowance(alice);
        uint256 mintAmt = allowance / 2;
        uint256 price = controller.mintPrice();
        uint256 cost = (price * mintAmt) / 1e18;

        vm.deal(operator, cost + 1 ether);
        uint256 balBefore = operator.balance;

        vm.prank(operator);
        controller.executeMint{value: cost + 1 ether}(alice, mintAmt, price);

        // Operator gets back 1 ether excess
        assertEq(operator.balance, balBefore - cost);
    }

    // ─── Allowance guard ──────────────────────────────────────────────────────

    function test_executeMint_reverts_if_allowance_exceeded() public {
        _mintAndStakeAlice(100e18);

        uint256 allowance = staking.mintAllowance(alice);
        uint256 tooBig = allowance + 1;
        uint256 price = controller.mintPrice();
        uint256 cost = (price * tooBig) / 1e18;

        vm.deal(operator, cost + 1 ether);

        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                IntelMintController.AllowanceInsufficient.selector,
                alice,
                tooBig,
                allowance
            )
        );
        controller.executeMint{value: cost + 1 ether}(alice, tooBig, price + 1);
    }

    function test_executeMint_reverts_on_slippage() public {
        _mintAndStakeAlice(100e18);
        uint256 allowance = staking.mintAllowance(alice);
        uint256 mintAmt = allowance / 2;
        uint256 price = controller.mintPrice();

        // Set maxPrice below current price
        vm.deal(operator, 10 ether);
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(IntelMintController.SlippageExceeded.selector, price, price - 1)
        );
        controller.executeMint{value: 10 ether}(alice, mintAmt, price - 1);
    }

    function test_executeMint_reverts_if_underpaid() public {
        _mintAndStakeAlice(100e18);
        uint256 allowance = staking.mintAllowance(alice);
        uint256 mintAmt = allowance / 2;
        uint256 price = controller.mintPrice();
        uint256 cost = (price * mintAmt) / 1e18;

        vm.deal(operator, cost + 1 ether);
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(IntelMintController.PriceTooLow.selector, cost - 1, cost)
        );
        controller.executeMint{value: cost - 1}(alice, mintAmt, price);
    }

    function test_executeMint_reverts_if_not_operator() public {
        _mintAndStakeAlice(100e18);
        uint256 allowance = staking.mintAllowance(alice);
        uint256 mintAmt = allowance / 2;
        uint256 price = controller.mintPrice();
        uint256 cost = (price * mintAmt) / 1e18;

        vm.deal(alice, cost + 1 ether);
        vm.prank(alice);
        vm.expectRevert(IntelMintController.Unauthorized.selector);
        controller.executeMint{value: cost}(alice, mintAmt, price);
    }

    // ─── Anti-reflexivity: high utilization → higher price ────────────────────

    function test_anti_reflexivity_high_utilization_costs_more() public {
        _mintAndStakeAlice(100e18);

        uint256 mintAmt = 1e8; // small amount
        uint256 priceNormal = controller.mintPrice(); // 1x
        uint256 costNormal = (priceNormal * mintAmt) / 1e18;

        // Now simulate demand surge
        controller.updateUtilization(300, 100); // 3x utilization
        uint256 priceHigh = controller.mintPrice();
        uint256 costHigh = (priceHigh * mintAmt) / 1e18;

        assertEq(priceHigh, 3 * priceNormal);
        assertEq(costHigh, 3 * costNormal);
    }

    function test_utilization_clamped_at_3x() public {
        controller.updateUtilization(999_999, 1); // absurdly high demand
        uint256 price = controller.mintPrice();
        // Should clamp at 3x
        assertEq(price, 3 * INITIAL_TWAP);
    }

    function test_utilization_clamped_at_1x_minimum() public {
        controller.updateUtilization(50, 100); // 0.5x → clamped to 1x
        uint256 price = controller.mintPrice();
        assertEq(price, INITIAL_TWAP);
    }

    // ─── Edge cases ───────────────────────────────────────────────────────────

    function test_executeMint_zero_amount_reverts() public {
        vm.deal(operator, 2 ether);
        vm.prank(operator);
        vm.expectRevert(IntelMintController.ZeroAmount.selector);
        controller.executeMint{value: 1 ether}(alice, 0, type(uint256).max);
    }

    function test_executeMint_zero_address_reverts() public {
        vm.deal(operator, 2 ether);
        vm.prank(operator);
        vm.expectRevert(IntelMintController.ZeroAddress.selector);
        controller.executeMint{value: 1 ether}(address(0), 1e18, type(uint256).max);
    }

    function test_executeMint_no_allowance_reverts() public {
        // Alice has no stake → no allowance
        uint256 price = controller.mintPrice();
        uint256 cost = (price * 1e10) / 1e18;
        vm.deal(operator, cost + 1 ether);

        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(IntelMintController.AllowanceInsufficient.selector, alice, 1e10, 0)
        );
        controller.executeMint{value: cost + 1 ether}(alice, 1e10, price);
    }

    // ─── TWAP update ──────────────────────────────────────────────────────────

    function test_updateTWAP_only_operator() public {
        vm.prank(alice);
        vm.expectRevert(IntelMintController.Unauthorized.selector);
        controller.updateTWAP(1e17);
    }

    function test_updateTWAP_zero_reverts() public {
        vm.expectRevert(IntelMintController.ZeroAmount.selector);
        controller.updateTWAP(0);
    }

    function test_updateTWAP_updates_price() public {
        controller.updateTWAP(2e16); // double the price
        assertEq(controller.mintPrice(), 2e16);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function test_setFloorPrice() public {
        controller.setFloorPrice(5e16);
        // TWAP=1e16 with 0% premium → floor=5e16 dominates
        assertEq(controller.mintPrice(), 5e16);
    }

    function test_setRoutingAddresses_zero_reverts() public {
        vm.expectRevert(IntelMintController.ZeroAddress.selector);
        controller.setRoutingAddresses(address(0), treasury);
    }

    // Ownable2Step: transferOwnership starts the process, acceptOwnership completes it.
    function test_transferOwnership_two_step() public {
        controller.transferOwnership(alice);
        assertEq(controller.owner(), address(this), "owner unchanged until accept");
        assertEq(controller.pendingOwner(), alice, "alice is pending owner");

        vm.prank(alice);
        controller.acceptOwnership();
        assertEq(controller.owner(), alice, "alice is now owner");
        assertEq(controller.pendingOwner(), address(0), "pending cleared");
    }

    function test_transferOwnership_only_nominee_can_accept() public {
        controller.transferOwnership(alice);
        vm.expectRevert(IntelMintController.Unauthorized.selector);
        controller.acceptOwnership(); // called by owner (this), not alice
    }

    function test_transferOwnership_zero_reverts() public {
        vm.expectRevert(IntelMintController.ZeroAddress.selector);
        controller.transferOwnership(address(0));
    }

    // ─── selfMint ─────────────────────────────────────────────────────────────

    /// @dev selfMint: any staker with allowance can mint for themselves (no operator whitelist).
    function test_selfMint_success() public {
        _mintAndStakeAlice(10_000e18);

        // Resolve allowance + price before any prank/expectRevert (Forge gotcha: inline external
        // calls in argument position consume the prank context before the real call fires)
        uint256 mintAmount = staking.mintAllowance(alice) / 2;
        assertGt(mintAmount, 0, "alice needs non-zero allowance");
        uint256 maxPrice = controller.mintPrice();
        uint256 cost = controller.quoteMint(mintAmount);

        uint256 aliceIntelBefore = intel.balanceOf(alice);
        uint256 stakingEthBefore = address(staking).balance;

        vm.prank(alice);
        controller.selfMint{value: cost}(mintAmount, maxPrice);

        assertEq(intel.balanceOf(alice) - aliceIntelBefore, mintAmount, "selfMint: wrong INTEL minted");
        assertGt(address(staking).balance - stakingEthBefore, 0, "selfMint: staker ETH yield not deposited");
    }

    /// @dev selfMint reverts when caller has no staking allowance (not staked).
    function test_selfMint_reverts_no_allowance() public {
        // Resolve price before prank so inline arg eval doesn't consume the prank
        uint256 maxPrice = controller.mintPrice();
        uint256 mintAmount = 1e9; // tiny — less than any possible allowance for 0-stake
        uint256 cost = controller.quoteMint(mintAmount) + 1; // +1 to avoid 0-cost edge case

        // Alice has not staked — allowance = 0 → must revert
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert(); // AllowanceInsufficient
        controller.selfMint{value: cost}(mintAmount, maxPrice);
    }

    /// @dev selfMint excess ETH is refunded to the caller.
    function test_selfMint_refunds_excess() public {
        _mintAndStakeAlice(10_000e18);

        uint256 mintAmount = staking.mintAllowance(alice) / 2;
        uint256 maxPrice = controller.mintPrice();
        uint256 cost = controller.quoteMint(mintAmount);
        uint256 overpay = cost + 0.5 ether;

        uint256 ethBefore = alice.balance;

        vm.prank(alice);
        controller.selfMint{value: overpay}(mintAmount, maxPrice);

        uint256 ethSpent = ethBefore - alice.balance;
        assertApproxEqAbs(ethSpent, cost, 1e9, "selfMint: excess not refunded");
    }

    // ─── sweepETH ─────────────────────────────────────────────────────────────

    /// @dev sweepETH recovers ETH directly sent to the controller.
    function test_sweepETH_recovers_trapped_eth() public {
        // Directly send ETH to controller (simulating accidental send)
        vm.deal(address(controller), 1 ether);
        assertEq(address(controller).balance, 1 ether);

        uint256 ownerEthBefore = address(this).balance;
        controller.sweepETH(address(this));

        assertEq(address(controller).balance, 0, "sweepETH: ETH not swept");
        assertEq(address(this).balance - ownerEthBefore, 1 ether, "sweepETH: owner not paid");
    }

    /// @dev sweepETH reverts for non-owner.
    function test_sweepETH_unauthorized() public {
        vm.deal(address(controller), 1 ether);
        vm.prank(alice);
        vm.expectRevert(IntelMintController.Unauthorized.selector);
        controller.sweepETH(alice);
    }

    receive() external payable {}
}
