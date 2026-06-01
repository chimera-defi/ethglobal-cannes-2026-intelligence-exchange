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
        // updateTWAP() now rejects TWAP below 80% of floor (security fix P16A-3).
        // Deploy a controller where initialTWAP < floorPrice via constructor (bypasses validation)
        // to verify that mintPrice() still returns floor when TWAP < floor.
        IntelMintController c2 = new IntelMintController(
            address(intel), address(staking), pol, treasury,
            1e15, 0, 5e14 // floor=1e15, initialTWAP=5e14 (below floor, constructor bypass)
        );
        // price = max(5e14 * 1, 1e15) * 1x = 1e15 (floor dominates)
        assertEq(c2.mintPrice(), 1e15);
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
        // updateTWAP() now enforces max 50% deviation per update (P16A-3 fix).
        // 40% increase (1e16 → 1.4e16) is within the 50% limit.
        controller.updateTWAP(1.4e16);
        assertEq(controller.mintPrice(), 1.4e16);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function test_setFloorPrice() public {
        controller.setFloorPrice(5e16);
        // TWAP=1e16 with 0% premium → floor=5e16 dominates
        assertEq(controller.mintPrice(), 5e16);
    }

    function test_setRoutingAddresses_zero_reverts() public {
        vm.expectRevert(IntelMintController.ZeroAddress.selector);
        controller.proposeRoutingAddresses(address(0), treasury);
    }

    function test_proposeRoutingAddresses_timelock() public {
        address newPol = address(0x1234567890123456789012345678901234567890);
        controller.proposeRoutingAddresses(newPol, treasury);
        // Should not take effect immediately — polAddress is the constructor-set pol value
        assertNotEq(controller.polAddress(), newPol, "polAddress unchanged before timelock");
        // Fast-forward 48h and apply
        vm.warp(block.timestamp + 48 hours + 1);
        controller.applyRoutingAddresses();
        assertEq(controller.polAddress(), newPol, "polAddress updated after timelock");
    }

    function test_applyRoutingAddresses_before_timelock_reverts() public {
        address newPol = address(0x1234567890123456789012345678901234567890);
        controller.proposeRoutingAddresses(newPol, treasury);
        vm.expectRevert();
        controller.applyRoutingAddresses(); // too early
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

    // ─── Minting pause tests ──────────────────────────────────────────────────

    /// @dev selfMint reverts when mintPaused is true.
    function test_selfMint_reverts_when_minting_paused() public {
        _mintAndStakeAlice(10_000e18);

        uint256 mintAmount = staking.mintAllowance(alice) / 2;
        uint256 maxPrice   = controller.mintPrice();
        uint256 cost       = controller.quoteMint(mintAmount);

        controller.pauseMinting();
        assertTrue(controller.mintPaused(), "should be paused");

        vm.deal(alice, cost + 1 ether);
        vm.prank(alice);
        vm.expectRevert(IntelMintController.MintingPaused.selector);
        controller.selfMint{value: cost}(mintAmount, maxPrice);
    }

    /// @dev executeMint reverts when mintPaused is true.
    function test_executeMint_reverts_when_minting_paused() public {
        _mintAndStakeAlice(100e18);

        uint256 allowance = staking.mintAllowance(alice);
        uint256 mintAmt   = allowance / 2;
        uint256 price     = controller.mintPrice();
        uint256 cost      = (price * mintAmt) / 1e18;

        controller.pauseMinting();

        vm.deal(operator, cost + 1 ether);
        vm.prank(operator);
        vm.expectRevert(IntelMintController.MintingPaused.selector);
        controller.executeMint{value: cost}(alice, mintAmt, price);
    }

    /// @dev After unpauseMinting, selfMint succeeds again.
    function test_unpauseMinting_re_enables_mint() public {
        _mintAndStakeAlice(10_000e18);

        uint256 mintAmount = staking.mintAllowance(alice) / 2;
        uint256 maxPrice   = controller.mintPrice();
        uint256 cost       = controller.quoteMint(mintAmount);

        controller.pauseMinting();
        controller.unpauseMinting();
        assertFalse(controller.mintPaused(), "should be unpaused");

        vm.deal(alice, cost + 1 ether);
        vm.prank(alice);
        controller.selfMint{value: cost}(mintAmount, maxPrice);
        assertGt(intel.balanceOf(alice), 0, "mint should succeed after unpause");
    }

    /// @dev Only owner can call pauseMinting.
    function test_pauseMinting_only_owner() public {
        vm.prank(alice);
        vm.expectRevert(IntelMintController.Unauthorized.selector);
        controller.pauseMinting();
    }

    // ─── Epoch mint cap tests ─────────────────────────────────────────────────

    /// @dev Minting up to the epoch cap works; minting past it reverts.
    function test_epoch_mint_cap_enforced() public {
        // alice's staking allowance with 100e18 staked is ~1e10 (sqrt formula).
        // We set the epoch cap just above half allowance so we can test cap enforcement.
        _mintAndStakeAlice(100e18);
        uint256 allowance = staking.mintAllowance(alice);
        assertGt(allowance, 0, "alice needs allowance");

        // Set cap to 60% of allowance (so two 40%-of-allowance mints would exceed it)
        uint256 capAmount = (allowance * 60) / 100;
        controller.setEpochMintCap(0);          // disable first (cap was 500_000e18)
        controller.setEpochMintCap(capAmount);  // set to 60% of allowance

        uint256 price = controller.mintPrice();
        // First mint: 40% of allowance — within cap
        uint256 firstMint = (allowance * 40) / 100;
        uint256 cost1 = (price * firstMint) / 1e18 + 1;
        vm.deal(operator, 100 ether);
        vm.prank(operator);
        controller.executeMint{value: cost1}(alice, firstMint, price);
        assertEq(controller.epochMinted(), firstMint, "epochMinted should equal firstMint");

        // Second mint: another 40% of allowance — would push total past cap
        uint256 secondMint = (allowance * 40) / 100;
        uint256 cost2 = (price * secondMint) / 1e18 + 1;
        uint256 remaining = capAmount - firstMint;
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(IntelMintController.EpochMintCapExceeded.selector, secondMint, remaining)
        );
        controller.executeMint{value: cost2}(alice, secondMint, price);
    }

    /// @dev epochMinted resets when the staking epoch advances.
    function test_epoch_mint_cap_resets_on_new_epoch() public {
        _mintAndStakeAlice(100e18);
        uint256 allowance = staking.mintAllowance(alice);

        // Set cap to 90% of allowance so we can mint 80% twice after reset
        uint256 capAmount = (allowance * 90) / 100;
        controller.setEpochMintCap(0);
        controller.setEpochMintCap(capAmount);

        uint256 price = controller.mintPrice();
        uint256 mintAmt = (allowance * 80) / 100;
        uint256 cost = (price * mintAmt) / 1e18 + 1;

        vm.deal(operator, 100 ether);
        // Mint 80% of allowance in epoch 1
        vm.prank(operator);
        controller.executeMint{value: cost}(alice, mintAmt, price);
        assertEq(controller.epochMinted(), mintAmt, "epochMinted should equal mintAmt");

        // Advance staking epoch
        vm.warp(block.timestamp + 7 days + 1);
        staking.advanceEpoch();
        // Refresh TWAP after warp — P16B-M1 fix blocks minting with stale TWAP (> 2h old)
        controller.updateTWAP(INITIAL_TWAP);

        // Mint 80% again — allowance resets with new epoch in staking
        // so alice has full allowance again
        vm.prank(operator);
        controller.executeMint{value: cost}(alice, mintAmt, price);
        assertEq(controller.epochMinted(), mintAmt, "epochMinted should reset for new epoch");
    }

    /// @dev setEpochMintCap cannot decrease the cap.
    function test_setEpochMintCap_cannot_decrease() public {
        // Default cap is 500_000e18; try to set lower
        vm.expectRevert("CannotDecreaseCap");
        controller.setEpochMintCap(100_000e18);
    }

    /// @dev setEpochMintCap(0) disables the cap.
    function test_setEpochMintCap_zero_disables_cap() public {
        controller.setEpochMintCap(0);
        assertEq(controller.epochMintCap(), 0, "cap should be disabled");
    }

    /// @dev setEpochMintCap can be increased.
    function test_setEpochMintCap_can_increase() public {
        uint256 prev = controller.epochMintCap();
        controller.setEpochMintCap(prev + 1_000_000e18);
        assertEq(controller.epochMintCap(), prev + 1_000_000e18);
    }

    /// @dev Only owner can call setEpochMintCap.
    function test_setEpochMintCap_only_owner() public {
        vm.prank(alice);
        vm.expectRevert(IntelMintController.Unauthorized.selector);
        controller.setEpochMintCap(0);
    }

    // ─── TWAP pull tests ─────────────────────────────────────────────────────

    /// @dev pullTWAP updates twap from Uniswap V3 pool.
    function test_pullTWAP_updates_twap() public {
        MockUniswapV3Pool mockPool = new MockUniswapV3Pool();
        // Set tick cumulatives for 0 tick (price = 1e18, which is above floor)
        // For 0 tick over any period, price should be 1e18 (scaled)
        mockPool.setTickCumulatives(0, 0);

        controller.pullTWAP(address(mockPool), 1800, true);
        // For tick=0, price should be 1e18, not floor price
        assertEq(controller.twap(), 1e18);
    }

    /// @dev pullTWAP with positive tick increases price above floor.
    function test_pullTWAP_positive_tick() public {
        MockUniswapV3Pool mockPool = new MockUniswapV3Pool();
        // Set tick cumulatives for ~tick=1000 over 1800 seconds
        // tick = (tickCumulative1 - tickCumulative0) / twapPeriod
        // 1000 = (tickCumulative1 - 0) / 1800
        // tickCumulative1 = 1000 * 1800 = 1_800_000
        mockPool.setTickCumulatives(0, 1_800_000);

        uint256 floorBefore = controller.floorPrice();
        controller.pullTWAP(address(mockPool), 1800, true);
        assertGt(controller.twap(), floorBefore);
    }

    /// @dev pullTWAP enforces floor price deviation check.
    function test_pullTWAP_enforces_floor() public {
        MockUniswapV3Pool mockPool = new MockUniswapV3Pool();
        // Set tick cumulatives for very negative tick (price below 80% of floor)
        // This should revert with InvalidParam due to floor deviation check
        mockPool.setTickCumulatives(0, -180_000_000);

        vm.expectRevert(IntelMintController.InvalidParam.selector);
        controller.pullTWAP(address(mockPool), 1800, true);
    }

    /// @dev pullTWAP reverts with zero pool address.
    function test_pullTWAP_reverts_zero_pool() public {
        vm.expectRevert(IntelMintController.ZeroAddress.selector);
        controller.pullTWAP(address(0), 1800, true);
    }

    /// @dev pullTWAP reverts with short period (< 60 seconds).
    function test_pullTWAP_reverts_short_period() public {
        MockUniswapV3Pool mockPool = new MockUniswapV3Pool();
        mockPool.setTickCumulatives(0, 0);

        vm.expectRevert(IntelMintController.InvalidParam.selector);
        controller.pullTWAP(address(mockPool), 30, true);
    }

    // ─── Activity-based dynamic epoch cap tests ───────────────────────────────

    /// @dev updateEpochCapFromActivity with activity at target expects 1x cap.
    function test_updateEpochCapFromActivity_at_target() public {
        // Enable activity cap
        controller.setActivityCapEnabled(true);

        // Default target is 100e18, so settled volume of 100e18 should give 1x cap
        uint256 settledVolume = 100e18;
        uint256 expectedCap = 500_000e18; // BASE_EPOCH_CAP * 1x

        vm.prank(operator);
        controller.updateEpochCapFromActivity(settledVolume);

        assertEq(controller.epochMintCap(), expectedCap);
        assertEq(controller.lastSettledVolume(), settledVolume);
    }

    /// @dev updateEpochCapFromActivity below target expects floor-clamped cap.
    function test_updateEpochCapFromActivity_below_target() public {
        controller.setActivityCapEnabled(true);

        // Settled volume at 10% of target (10e18 vs 100e18 target)
        // Should be clamped to floor of 20% (2000 bps)
        uint256 settledVolume = 10e18;
        uint256 expectedCap = (500_000e18 * 2000) / 10000; // 20% of BASE_EPOCH_CAP = 100_000e18

        vm.prank(operator);
        controller.updateEpochCapFromActivity(settledVolume);

        assertEq(controller.epochMintCap(), expectedCap);
        assertEq(controller.lastSettledVolume(), settledVolume);
    }

    /// @dev updateEpochCapFromActivity above target expects ceiling-clamped cap.
    function test_updateEpochCapFromActivity_above_target() public {
        controller.setActivityCapEnabled(true);

        // Settled volume at 500% of target (500e18 vs 100e18 target)
        // Should be clamped to ceiling of 2x (20000 bps)
        uint256 settledVolume = 500e18;
        uint256 expectedCap = (500_000e18 * 20000) / 10000; // 2x of BASE_EPOCH_CAP = 1_000_000e18

        vm.prank(operator);
        controller.updateEpochCapFromActivity(settledVolume);

        assertEq(controller.epochMintCap(), expectedCap);
        assertEq(controller.lastSettledVolume(), settledVolume);
    }

    /// @dev updateEpochCapFromActivity reverts with feature disabled.
    function test_updateEpochCapFromActivity_reverts_when_disabled() public {
        // Feature is disabled by default
        uint256 settledVolume = 100e18;

        vm.prank(operator);
        vm.expectRevert(IntelMintController.FeatureDisabled.selector);
        controller.updateEpochCapFromActivity(settledVolume);
    }

    /// @dev Only operator can call updateEpochCapFromActivity.
    function test_updateEpochCapFromActivity_only_operator() public {
        controller.setActivityCapEnabled(true);

        vm.prank(alice);
        vm.expectRevert(IntelMintController.Unauthorized.selector);
        controller.updateEpochCapFromActivity(100e18);
    }

    /// @dev setTargetSettledVolume updates the target volume.
    function test_setTargetSettledVolume() public {
        uint256 newTarget = 200e18;
        controller.setTargetSettledVolume(newTarget);
        assertEq(controller.targetSettledVolumePerEpoch(), newTarget);
    }

    /// @dev setTargetSettledVolume reverts with zero.
    function test_setTargetSettledVolume_reverts_zero() public {
        vm.expectRevert(IntelMintController.ZeroAmount.selector);
        controller.setTargetSettledVolume(0);
    }

    /// @dev setTargetSettledVolume only owner.
    function test_setTargetSettledVolume_only_owner() public {
        vm.prank(alice);
        vm.expectRevert(IntelMintController.Unauthorized.selector);
        controller.setTargetSettledVolume(200e18);
    }

    /// @dev setActivityCapBounds updates floor and ceiling.
    function test_setActivityCapBounds() public {
        controller.setActivityCapBounds(1500, 15000); // 15% floor, 1.5x ceiling
        assertEq(controller.activityCapFloorBps(), 1500);
        assertEq(controller.activityCapCeilingBps(), 15000);
    }

    /// @dev setActivityCapBounds reverts when floor >= ceiling.
    function test_setActivityCapBounds_reverts_floor_ge_ceiling() public {
        vm.expectRevert(IntelMintController.InvalidParam.selector);
        controller.setActivityCapBounds(2000, 2000); // floor == ceiling
    }

    /// @dev setActivityCapBounds reverts when ceiling > 50000.
    function test_setActivityCapBounds_reverts_ceiling_too_high() public {
        vm.expectRevert(IntelMintController.InvalidParam.selector);
        controller.setActivityCapBounds(1000, 60000); // 6x > 5x max
    }

    /// @dev setActivityCapBounds only owner.
    function test_setActivityCapBounds_only_owner() public {
        vm.prank(alice);
        vm.expectRevert(IntelMintController.Unauthorized.selector);
        controller.setActivityCapBounds(1500, 15000);
    }

    /// @dev setActivityCapEnabled toggles the feature.
    function test_setActivityCapEnabled() public {
        assertFalse(controller.activityCapEnabled());
        controller.setActivityCapEnabled(true);
        assertTrue(controller.activityCapEnabled());
        controller.setActivityCapEnabled(false);
        assertFalse(controller.activityCapEnabled());
    }

    /// @dev setActivityCapEnabled only owner.
    function test_setActivityCapEnabled_only_owner() public {
        vm.prank(alice);
        vm.expectRevert(IntelMintController.Unauthorized.selector);
        controller.setActivityCapEnabled(true);
    }

    /// @dev When activity cap is disabled, existing setEpochMintCap still works.
    function test_setEpochMintCap_still_works_when_activity_disabled() public {
        // Activity cap is disabled by default
        uint256 newCap = 1_000_000e18;
        controller.setEpochMintCap(0); // disable first
        controller.setEpochMintCap(newCap);
        assertEq(controller.epochMintCap(), newCap);
    }

    // ─── Security Fix Tests ───────────────────────────────────────────────────

    function test_twapDeviationPauseEnabled_starts_true() public {
        assertTrue(controller.twapDeviationPauseEnabled());
    }

    function test_executeMint_reverts_when_twap_stale() public {
        _mintAndStakeAlice(100e18);

        uint256 mintAmount = staking.mintAllowance(alice) / 2;
        uint256 maxPrice = controller.mintPrice();
        uint256 cost = controller.quoteMint(mintAmount);

        // Advance time beyond TWAP_MAX_AGE (2 hours)
        vm.warp(block.timestamp + 2 hours + 1);

        vm.deal(operator, cost + 1 ether);
        vm.prank(operator);
        vm.expectRevert(IntelMintController.TwapStale.selector);
        controller.executeMint{value: cost}(alice, mintAmount, maxPrice);
    }

    function test_selfMint_reverts_when_twap_stale() public {
        _mintAndStakeAlice(10_000e18);

        uint256 mintAmount = staking.mintAllowance(alice) / 2;
        uint256 maxPrice = controller.mintPrice();
        uint256 cost = controller.quoteMint(mintAmount);

        // Advance time beyond TWAP_MAX_AGE (2 hours)
        vm.warp(block.timestamp + 2 hours + 1);

        vm.deal(alice, cost + 1 ether);
        vm.prank(alice);
        vm.expectRevert(IntelMintController.TwapStale.selector);
        controller.selfMint{value: cost}(mintAmount, maxPrice);
    }

    function test_updateTWAP_reverts_on_large_increase() public {
        uint256 currentTWAP = controller.twap();
        // Try to increase by 51% (above 50% max)
        uint256 newTWAP = (currentTWAP * 15100) / 10000;

        vm.expectRevert(IntelMintController.InvalidParam.selector);
        controller.updateTWAP(newTWAP);
    }

    function test_updateTWAP_reverts_on_large_decrease() public {
        uint256 currentTWAP = controller.twap();
        // Try to decrease by 51% (above 50% max)
        uint256 newTWAP = (currentTWAP * 4900) / 10000;

        vm.expectRevert(IntelMintController.InvalidParam.selector);
        controller.updateTWAP(newTWAP);
    }

    function test_updateTWAP_succeeds_within_50_percent() public {
        uint256 currentTWAP = controller.twap();
        // Increase by 49% (within 50% max)
        uint256 newTWAP = (currentTWAP * 14900) / 10000;

        controller.updateTWAP(newTWAP);
        assertEq(controller.twap(), newTWAP);
    }

    function test_updateTWAP_reverts_below_80_percent_floor() public {
        uint256 floorPrice = controller.floorPrice();
        // Try to set TWAP to 79% of floorPrice (below 80% minimum)
        uint256 newTWAP = (floorPrice * 7900) / 10000;

        vm.expectRevert(IntelMintController.InvalidParam.selector);
        controller.updateTWAP(newTWAP);
    }

    function test_updateTWAP_succeeds_above_80_percent_floor() public {
        // The 50% per-update deviation limit and the 80% floor minimum are independent checks.
        // To test the floor boundary, start with a TWAP already near floor by deploying
        // a controller with initialTWAP = floorPrice (constructor bypasses validation).
        IntelMintController c2 = new IntelMintController(
            address(intel), address(staking), pol, treasury,
            FLOOR_PRICE, 0, FLOOR_PRICE // initialTWAP == floorPrice
        );
        c2.setOperator(address(this), true);
        // 81% of floor: 1e15 * 8100/10000 = 8.1e14
        // Change from 1e15 to 8.1e14 = 19% reduction — within 50% deviation limit
        uint256 newTWAP = (FLOOR_PRICE * 8100) / 10000;
        c2.updateTWAP(newTWAP);
        assertEq(c2.twap(), newTWAP);
    }

    receive() external payable {}
}

/// @dev Mock Uniswap V3 Pool for TWAP testing
contract MockUniswapV3Pool {
    int56 public tickCumulative0;  // secondsAgo ago
    int56 public tickCumulative1;  // now

    function setTickCumulatives(int56 _t0, int56 _t1) external {
        tickCumulative0 = _t0;
        tickCumulative1 = _t1;
    }

    function observe(uint32[] calldata secondsAgos)
        external view
        returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s)
    {
        tickCumulatives = new int56[](2);
        tickCumulatives[0] = tickCumulative0;
        tickCumulatives[1] = tickCumulative1;
        secondsPerLiquidityCumulativeX128s = new uint160[](2);
    }

    function slot0() external pure returns (uint160,int24,uint16,uint16,uint16,uint8,bool) {
        return (0,0,0,0,0,0,true);
    }
}
