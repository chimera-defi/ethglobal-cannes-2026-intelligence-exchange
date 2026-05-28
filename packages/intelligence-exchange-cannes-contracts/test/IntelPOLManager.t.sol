// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {IntelPOLManager} from "../src/IntelPOLManager.sol";
import {IntelToken} from "../src/IntelToken.sol";
import {INonfungiblePositionManager} from "../src/interfaces/IUniswapV3.sol";

contract IntelPOLManagerTest is Test {
    IntelToken token;
    IntelPOLManager pol;
    MockWETH9 mockWeth;
    MockPositionManager mockPositionManager;

    address owner = makeAddr("owner");
    address alice = makeAddr("alice");

    uint256 constant INTEL_SEED = 2_000_000e18;

    function setUp() public {
        token = new IntelToken(
            "Intelligence Exchange Token",
            "INTEL",
            address(this),
            10_000_000e18,
            100_000_000e18
        );

        mockWeth = new MockWETH9();
        mockPositionManager = new MockPositionManager();

        pol = new IntelPOLManager(owner, address(token), address(mockPositionManager), address(mockWeth));

        // Seed POL with INTEL
        token.transfer(address(pol), INTEL_SEED);

        // Seed POL with ETH
        vm.deal(address(pol), 10 ether);
    }

    // ─── Constructor ──────────────────────────────────────────────────────

    function test_constructor_params() public view {
        assertEq(pol.owner(), owner);
        assertEq(pol.intel(), address(token));
        assertEq(pol.positionManager(), address(mockPositionManager));
        assertEq(pol.weth(), address(mockWeth));
        assertEq(pol.positionTokenId(), 0);
        assertEq(pol.pendingOwner(), address(0));
    }

    function test_constructor_revert_zero_owner() public {
        vm.expectRevert(IntelPOLManager.ZeroAddress.selector);
        new IntelPOLManager(address(0), address(token), address(mockPositionManager), address(mockWeth));
    }

    function test_constructor_revert_zero_intel() public {
        vm.expectRevert(IntelPOLManager.ZeroAddress.selector);
        new IntelPOLManager(owner, address(0), address(mockPositionManager), address(mockWeth));
    }

    function test_constructor_revert_zero_positionManager() public {
        vm.expectRevert(IntelPOLManager.ZeroAddress.selector);
        new IntelPOLManager(owner, address(token), address(0), address(mockWeth));
    }

    function test_constructor_revert_zero_weth() public {
        vm.expectRevert(IntelPOLManager.ZeroAddress.selector);
        new IntelPOLManager(owner, address(token), address(mockPositionManager), address(0));
    }

    // ─── receive ETH ──────────────────────────────────────────────────────

    function test_receive_eth_updates_total() public {
        uint256 before = pol.totalEthReceived();
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        (bool ok,) = address(pol).call{value: 1 ether}("");
        assertTrue(ok);
        assertEq(pol.totalEthReceived(), before + 1 ether);
    }

    function test_receive_eth_emits_event() public {
        vm.deal(alice, 0.5 ether);
        vm.expectEmit(true, false, false, true);
        emit IntelPOLManager.EthReceived(alice, 0.5 ether);
        vm.prank(alice);
        (bool ok,) = address(pol).call{value: 0.5 ether}("");
        assertTrue(ok);
    }

    // ─── ethBalance / intelBalance views ─────────────────────────────────

    function test_eth_balance() public view {
        assertEq(pol.ethBalance(), 10 ether);
    }

    function test_intel_balance() public view {
        assertEq(pol.intelBalance(), INTEL_SEED);
    }

    // ─── withdrawEth ──────────────────────────────────────────────────────

    function test_withdrawEth_by_owner() public {
        uint256 before = alice.balance;
        vm.prank(owner);
        pol.withdrawEth(alice, 1 ether);
        assertEq(alice.balance, before + 1 ether);
        assertEq(pol.ethBalance(), 9 ether);
    }

    function test_withdrawEth_emits_event() public {
        vm.expectEmit(true, false, false, true);
        emit IntelPOLManager.EthWithdrawn(alice, 1 ether);
        vm.prank(owner);
        pol.withdrawEth(alice, 1 ether);
    }

    function test_withdrawEth_reverts_not_owner() public {
        vm.prank(alice);
        vm.expectRevert(IntelPOLManager.Unauthorized.selector);
        pol.withdrawEth(alice, 1 ether);
    }

    function test_withdrawEth_reverts_insufficient() public {
        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(IntelPOLManager.InsufficientBalance.selector, 10 ether, 11 ether)
        );
        pol.withdrawEth(alice, 11 ether);
    }

    function test_withdrawEth_reverts_zero_to() public {
        vm.prank(owner);
        vm.expectRevert(IntelPOLManager.ZeroAddress.selector);
        pol.withdrawEth(address(0), 1 ether);
    }

    // ─── withdrawIntel ────────────────────────────────────────────────────

    function test_withdrawIntel_by_owner() public {
        uint256 before = token.balanceOf(alice);
        vm.prank(owner);
        pol.withdrawIntel(alice, 1_000e18);
        assertEq(token.balanceOf(alice), before + 1_000e18);
        assertEq(pol.intelBalance(), INTEL_SEED - 1_000e18);
    }

    function test_withdrawIntel_emits_event() public {
        vm.expectEmit(true, false, false, true);
        emit IntelPOLManager.IntelWithdrawn(alice, 1_000e18);
        vm.prank(owner);
        pol.withdrawIntel(alice, 1_000e18);
    }

    function test_withdrawIntel_reverts_not_owner() public {
        vm.prank(alice);
        vm.expectRevert(IntelPOLManager.Unauthorized.selector);
        pol.withdrawIntel(alice, 1_000e18);
    }

    function test_withdrawIntel_reverts_insufficient() public {
        uint256 bal = pol.intelBalance();
        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(IntelPOLManager.InsufficientBalance.selector, bal, bal + 1)
        );
        pol.withdrawIntel(alice, bal + 1);
    }

    function test_withdrawIntel_reverts_zero_to() public {
        vm.prank(owner);
        vm.expectRevert(IntelPOLManager.ZeroAddress.selector);
        pol.withdrawIntel(address(0), 1_000e18);
    }

    function test_withdrawIntel_reverts_zero_amount() public {
        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(IntelPOLManager.InsufficientBalance.selector, INTEL_SEED, 0)
        );
        pol.withdrawIntel(alice, 0);
    }

    // ─── deployToUniV3 ────────────────────────────────────────────────────

    function test_deployToUniV3_mints_new_position() public {
        address fakePool = makeAddr("pool");
        vm.prank(owner);
        pol.deployToUniV3(fakePool, 1_000e18, 1 ether, -60, 60);
        assertGt(pol.positionTokenId(), 0);
    }

    function test_deployToUniV3_increases_existing_position() public {
        address fakePool = makeAddr("pool");
        vm.prank(owner);
        pol.deployToUniV3(fakePool, 1_000e18, 1 ether, -60, 60);
        uint256 firstTokenId = pol.positionTokenId();

        vm.prank(owner);
        pol.deployToUniV3(fakePool, 500e18, 0.5 ether, -60, 60);
        assertEq(pol.positionTokenId(), firstTokenId);
    }

    function test_deployToUniV3_wraps_eth_to_weth() public {
        address fakePool = makeAddr("pool");
        vm.prank(owner);
        pol.deployToUniV3(fakePool, 1_000e18, 1 ether, -60, 60);
        assertGt(mockWeth.balanceOf(address(pol)), 0);
    }

    function test_deployToUniV3_reverts_zero_pool() public {
        vm.prank(owner);
        vm.expectRevert(IntelPOLManager.ZeroAddress.selector);
        pol.deployToUniV3(address(0), 1_000e18, 1 ether, -60, 60);
    }

    function test_deployToUniV3_reverts_insufficient_eth() public {
        address fakePool = makeAddr("pool");
        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(IntelPOLManager.InsufficientBalance.selector, 10 ether, 100 ether)
        );
        pol.deployToUniV3(fakePool, 1_000e18, 100 ether, -60, 60);
    }

    function test_deployToUniV3_reverts_insufficient_intel() public {
        address fakePool = makeAddr("pool");
        uint256 tooMuch = INTEL_SEED + 1;
        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(IntelPOLManager.InsufficientBalance.selector, INTEL_SEED, tooMuch)
        );
        pol.deployToUniV3(fakePool, tooMuch, 1 ether, -60, 60);
    }

    function test_deployToUniV3_reverts_not_owner() public {
        address fakePool = makeAddr("pool");
        vm.prank(alice);
        vm.expectRevert(IntelPOLManager.Unauthorized.selector);
        pol.deployToUniV3(fakePool, 1_000e18, 1 ether, -60, 60);
    }

    // ─── collectFees ──────────────────────────────────────────────────────

    function test_collectFees_by_owner() public {
        address fakePool = makeAddr("pool");
        vm.prank(owner);
        pol.deployToUniV3(fakePool, 1_000e18, 1 ether, -60, 60);

        vm.prank(owner);
        (uint256 amount0, uint256 amount1) = pol.collectFees();
        assertGt(amount0, 0);
        assertGt(amount1, 0);
    }

    function test_collectFees_reverts_no_position() public {
        vm.prank(owner);
        vm.expectRevert(IntelPOLManager.NoPosition.selector);
        pol.collectFees();
    }

    function test_collectFees_reverts_not_owner() public {
        address fakePool = makeAddr("pool");
        vm.prank(owner);
        pol.deployToUniV3(fakePool, 1_000e18, 1 ether, -60, 60);

        vm.prank(alice);
        vm.expectRevert(IntelPOLManager.Unauthorized.selector);
        pol.collectFees();
    }

    // ─── Ownable2Step ─────────────────────────────────────────────────────

    function test_transferOwnership_two_step() public {
        vm.prank(owner);
        pol.transferOwnership(alice);

        assertEq(pol.owner(),        owner, "Owner unchanged until accept");
        assertEq(pol.pendingOwner(), alice, "alice is pending owner");

        vm.prank(alice);
        pol.acceptOwnership();

        assertEq(pol.owner(),        alice,      "alice is now owner");
        assertEq(pol.pendingOwner(), address(0), "pending cleared");
    }

    function test_transferOwnership_only_nominee_can_accept() public {
        vm.prank(owner);
        pol.transferOwnership(alice);

        vm.expectRevert(IntelPOLManager.Unauthorized.selector);
        pol.acceptOwnership(); // not the nominee (caller is address(this))
    }

    function test_transferOwnership_reverts_not_owner() public {
        vm.prank(alice);
        vm.expectRevert(IntelPOLManager.Unauthorized.selector);
        pol.transferOwnership(alice);
    }

    function test_transferOwnership_reverts_zero_address() public {
        vm.prank(owner);
        vm.expectRevert(IntelPOLManager.ZeroAddress.selector);
        pol.transferOwnership(address(0));
    }

    // ─── Reentrancy (smoke) ───────────────────────────────────────────────

    function test_withdrawEth_cannot_reenter() public {
        // Deploy a malicious receiver that tries to re-enter withdrawEth
        MaliciousReceiver mal = new MaliciousReceiver(pol);
        vm.deal(address(pol), 2 ether);

        // Give mal control so it can call withdrawEth
        vm.prank(owner);
        pol.transferOwnership(address(mal));
        vm.prank(address(mal));
        pol.acceptOwnership();

        // Attempt re-entrant withdrawal.
        // The inner re-entrant call hits the reentrancy guard and reverts.
        // That revert propagates through the ETH send (ok=false) so the outer
        // withdrawEth throws TransferFailed — proving the guard works end-to-end.
        vm.expectRevert(IntelPOLManager.TransferFailed.selector);
        mal.attack();
    }
}

/// @dev Mock WETH9 contract for testing
contract MockWETH9 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function deposit() external payable {
        balanceOf[msg.sender] += msg.value;
    }

    function withdraw(uint256 wad) external {
        require(balanceOf[msg.sender] >= wad);
        balanceOf[msg.sender] -= wad;
        (bool ok,) = msg.sender.call{value: wad}("");
        require(ok);
    }

    function transfer(address dst, uint256 wad) external returns (bool) {
        balanceOf[msg.sender] -= wad;
        balanceOf[dst] += wad;
        return true;
    }

    function approve(address guy, uint256 wad) external returns (bool) {
        allowance[msg.sender][guy] = wad;
        return true;
    }

    receive() external payable {
        balanceOf[msg.sender] += msg.value;
    }
}

/// @dev Mock Uniswap V3 Position Manager for testing
contract MockPositionManager {
    uint256 public nextTokenId = 1;
    uint256 public lastTokenId;

    function mint(INonfungiblePositionManager.MintParams calldata p)
        external payable
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)
    {
        tokenId = nextTokenId++;
        lastTokenId = tokenId;
        liquidity = 1e18;
        amount0 = p.amount0Desired;
        amount1 = p.amount1Desired;
    }

    function increaseLiquidity(INonfungiblePositionManager.IncreaseLiquidityParams calldata p)
        external payable
        returns (uint128 liquidity, uint256 amount0, uint256 amount1)
    {
        liquidity = 1e17;
        amount0 = p.amount0Desired;
        amount1 = p.amount1Desired;
    }

    function collect(INonfungiblePositionManager.CollectParams calldata p)
        external payable
        returns (uint256 amount0, uint256 amount1)
    {
        amount0 = 1e18;
        amount1 = 1e18;
    }

    function WETH9() external view returns (address) {
        return address(0);
    }

    function factory() external view returns (address) {
        return address(0);
    }

    function positions(uint256) external pure returns (
        uint96,address,address,address,uint24,int24,int24,uint128,uint256,uint256,uint128,uint128
    ) {
        return (0,address(0),address(0),address(0),0,0,0,1e18,0,0,0,0);
    }
}

/// @dev Malicious receiver that tries to re-enter withdrawEth on receive
contract MaliciousReceiver {
    IntelPOLManager public pol;
    bool public attacking;

    constructor(IntelPOLManager _pol) {
        pol = _pol;
    }

    function attack() external {
        attacking = true;
        pol.withdrawEth(address(this), 1 ether);
    }

    receive() external payable {
        if (attacking) {
            attacking = false;
            pol.withdrawEth(address(this), 1 ether); // re-enter
        }
    }
}
