// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BuybackBurn} from "../src/BuybackBurn.sol";
import {IntelToken} from "../src/IntelToken.sol";
import {ISwapRouter} from "../src/interfaces/ISwapRouter.sol";
import {IWETH9} from "../src/interfaces/IUniswapV3.sol";

// Mock SwapRouter for testing
contract MockSwapRouter is ISwapRouter {
    uint256 public fixedIntelAmount;

    function setFixedIntelAmount(uint256 amount) external {
        fixedIntelAmount = amount;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut) {
        // Return fixed INTEL amount, enforcing amountOutMinimum to simulate Uniswap slippage protection
        amountOut = fixedIntelAmount;
        require(amountOut >= params.amountOutMinimum, "Too little received");
    }
}

// Mock WETH9 for testing
contract MockWETH9 is IWETH9 {
    mapping(address => uint256) public balanceOf;

    function deposit() external payable {
        balanceOf[msg.sender] += msg.value;
    }

    function withdraw(uint256 wad) external {
        require(balanceOf[msg.sender] >= wad, "Insufficient balance");
        balanceOf[msg.sender] -= wad;
        (bool success,) = msg.sender.call{value: wad}("");
        require(success, "Withdraw failed");
    }

    function transfer(address dst, uint256 wad) external returns (bool) {
        require(balanceOf[msg.sender] >= wad, "Insufficient balance");
        balanceOf[msg.sender] -= wad;
        balanceOf[dst] += wad;
        return true;
    }

    function approve(address guy, uint256 wad) external returns (bool) {
        return true;
    }
}

// Mock IntelPOLManager for testing
contract MockIntelPOLManager {
    uint256 public mockTWAP;

    function setMockTWAP(uint256 _twap) external {
        mockTWAP = _twap;
    }

    function pullTWAP() external view returns (uint256) {
        return mockTWAP;
    }
}

contract BuybackBurnTest is Test {
    BuybackBurn public buybackBurn;
    IntelToken public intel;
    MockIntelPOLManager public pol;
    MockSwapRouter public swapRouter;
    MockWETH9 public weth;

    address owner = address(this);
    address operator = makeAddr("operator");
    address treasury = makeAddr("treasury");
    address user = makeAddr("user");

    uint256 constant INITIAL_SUPPLY = 1_000_000e18;
    uint256 constant MAX_SUPPLY = 10_000_000e18;

    function setUp() public {
        // Deploy mock contracts
        weth = new MockWETH9();
        intel = new IntelToken("Intelligence Exchange", "INTEL", owner, INITIAL_SUPPLY, MAX_SUPPLY);
        swapRouter = new MockSwapRouter();

        // Deploy mock POL manager
        pol = new MockIntelPOLManager();
        pol.setMockTWAP(0.001e18); // 1 INTEL = 0.001 ETH (1000 INTEL = 1 ETH)

        // Deploy BuybackBurn
        buybackBurn = new BuybackBurn(
            address(intel),
            address(pol),
            address(swapRouter),
            address(weth),
            treasury
        );

        // Set up operator
        buybackBurn.setOperator(operator, true);

        // Set fixed swap amount for testing (1 ETH = 1000 INTEL) - use reasonable amount
        swapRouter.setFixedIntelAmount(990e18); // Slightly under expected to pass slippage check

        // Fund BuybackBurn with some INTEL for burning
        intel.transfer(address(buybackBurn), 10000e18);

        // Fund user with ETH for testing
        vm.deal(user, 100 ether);
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    function test_constructor_setsOwner() public view {
        assertEq(buybackBurn.owner(), owner);
    }

    function test_constructor_setsIntel() public view {
        assertEq(address(buybackBurn.intel()), address(intel));
    }

    function test_constructor_setsPol() public view {
        assertEq(address(buybackBurn.pol()), address(pol));
    }

    function test_constructor_setsSwapRouter() public view {
        assertEq(address(buybackBurn.swapRouter()), address(swapRouter));
    }

    function test_constructor_setsWeth() public view {
        assertEq(buybackBurn.weth(), address(weth));
    }

    function test_constructor_setsTreasury() public view {
        assertEq(buybackBurn.treasury(), treasury);
    }

    function test_constructor_defaultMaxSlippage() public view {
        assertEq(buybackBurn.maxSlippageBps(), 200); // 2%
    }

    function test_constructor_defaultMinBuybackEth() public view {
        assertEq(buybackBurn.minBuybackEth(), 0.1 ether);
    }

    // ─── depositEth ───────────────────────────────────────────────────────────

    function test_depositEth_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit BuybackBurn.EthDeposited(user, 1 ether);
        
        vm.prank(user);
        buybackBurn.depositEth{value: 1 ether}();
    }

    function test_depositEth_increasesBalance() public {
        uint256 preBalance = address(buybackBurn).balance;
        
        vm.prank(user);
        buybackBurn.depositEth{value: 1 ether}();
        
        assertEq(address(buybackBurn).balance, preBalance + 1 ether);
    }

    function test_depositEth_revertsOnZeroAmount() public {
        vm.prank(user);
        vm.expectRevert(BuybackBurn.ZeroAmount.selector);
        buybackBurn.depositEth{value: 0}();
    }

    // ─── executeBuyback ───────────────────────────────────────────────────────

    function test_executeBuyback_happyPath() public {
        // Deposit ETH
        vm.prank(user);
        buybackBurn.depositEth{value: 1 ether}();

        // Set max slippage very high for testing
        buybackBurn.setMaxSlippage(10000); // 100%

        uint256 preIntelSupply = intel.totalSupply();
        uint256 preContractBalance = address(buybackBurn).balance;

        // Execute buyback
        vm.prank(operator);
        buybackBurn.executeBuyback();

        // Check ETH was spent
        assertEq(address(buybackBurn).balance, preContractBalance - 1 ether);

        // Check INTEL was burned (mock returns 990e18)
        assertEq(intel.totalSupply(), preIntelSupply - 990e18);
    }

    function test_executeBuyback_revertsWhenBalanceBelowMin() public {
        // Deposit less than minimum
        vm.prank(user);
        buybackBurn.depositEth{value: 0.05 ether}();

        vm.prank(operator);
        vm.expectRevert();
        buybackBurn.executeBuyback();
    }

    function test_executeBuyback_revertsWhenZeroBalance() public {
        vm.prank(operator);
        vm.expectRevert();
        buybackBurn.executeBuyback();
    }

    function test_executeBuyback_ownerCanExecute() public {
        vm.prank(user);
        buybackBurn.depositEth{value: 1 ether}();

        // Set max slippage very high for testing
        buybackBurn.setMaxSlippage(10000); // 100%

        uint256 preIntelSupply = intel.totalSupply();

        // Owner can execute
        buybackBurn.executeBuyback();

        assertEq(intel.totalSupply(), preIntelSupply - 990e18);
    }

    function test_executeBuyback_unauthorizedReverts() public {
        vm.prank(user);
        buybackBurn.depositEth{value: 1 ether}();

        vm.prank(user);
        vm.expectRevert(BuybackBurn.Unauthorized.selector);
        buybackBurn.executeBuyback();
    }

    // ─── withdrawEth ──────────────────────────────────────────────────────────

    function test_withdrawEth_ownerCanWithdraw() public {
        vm.prank(user);
        buybackBurn.depositEth{value: 1 ether}();

        uint256 preBalance = address(buybackBurn).balance;
        address payable recipient = payable(makeAddr("recipient"));
        uint256 preRecipientBalance = recipient.balance;

        // Transfer ownership to recipient for testing
        buybackBurn.transferOwnership(recipient);
        vm.prank(recipient);
        buybackBurn.acceptOwnership();

        // Withdraw to recipient as the new owner
        vm.prank(recipient);
        buybackBurn.withdrawEth(0.5 ether);

        assertEq(address(buybackBurn).balance, preBalance - 0.5 ether);
        assertEq(recipient.balance, preRecipientBalance + 0.5 ether);

        // Transfer ownership back
        vm.prank(recipient);
        buybackBurn.transferOwnership(owner);
        vm.prank(owner);
        buybackBurn.acceptOwnership();
    }

    function test_withdrawEth_unauthorizedReverts() public {
        vm.prank(user);
        buybackBurn.depositEth{value: 1 ether}();

        vm.prank(user);
        vm.expectRevert(BuybackBurn.Unauthorized.selector);
        buybackBurn.withdrawEth(0.5 ether);
    }

    function test_withdrawEth_revertsOnZeroAmount() public {
        vm.expectRevert(BuybackBurn.ZeroAmount.selector);
        buybackBurn.withdrawEth(0);
    }

    function test_withdrawEth_revertsWhenInsufficientBalance() public {
        vm.expectRevert();
        buybackBurn.withdrawEth(1 ether);
    }

    // ─── Config Functions ─────────────────────────────────────────────────────

    function test_setMaxSlippage_ownerCanSet() public {
        buybackBurn.setMaxSlippage(300); // 3%
        assertEq(buybackBurn.maxSlippageBps(), 300);
    }

    function test_setMaxSlippage_unauthorizedReverts() public {
        vm.prank(user);
        vm.expectRevert(BuybackBurn.Unauthorized.selector);
        buybackBurn.setMaxSlippage(300);
    }

    function test_setMaxSlippage_revertsWhenAboveBps() public {
        vm.expectRevert(BuybackBurn.InvalidParam.selector);
        buybackBurn.setMaxSlippage(15000); // 150%
    }

    function test_setMinBuybackEth_ownerCanSet() public {
        buybackBurn.setMinBuybackEth(0.5 ether);
        assertEq(buybackBurn.minBuybackEth(), 0.5 ether);
    }

    function test_setMinBuybackEth_unauthorizedReverts() public {
        vm.prank(user);
        vm.expectRevert(BuybackBurn.Unauthorized.selector);
        buybackBurn.setMinBuybackEth(0.5 ether);
    }

    function test_setTreasury_ownerCanSet() public {
        address newTreasury = makeAddr("newTreasury");
        buybackBurn.setTreasury(newTreasury);
        assertEq(buybackBurn.treasury(), newTreasury);
    }

    function test_setTreasury_unauthorizedReverts() public {
        vm.prank(user);
        vm.expectRevert(BuybackBurn.Unauthorized.selector);
        buybackBurn.setTreasury(makeAddr("newTreasury"));
    }

    function test_setTreasury_revertsOnZeroAddress() public {
        vm.expectRevert(BuybackBurn.ZeroAddress.selector);
        buybackBurn.setTreasury(address(0));
    }

    function test_setOperator_ownerCanSet() public {
        address newOperator = makeAddr("newOperator");
        buybackBurn.setOperator(newOperator, true);
        assertTrue(buybackBurn.operators(newOperator));
    }

    function test_setOperator_canRevoke() public {
        buybackBurn.setOperator(operator, false);
        assertFalse(buybackBurn.operators(operator));
    }

    function test_setOperator_unauthorizedReverts() public {
        vm.prank(user);
        vm.expectRevert(BuybackBurn.Unauthorized.selector);
        buybackBurn.setOperator(makeAddr("newOperator"), true);
    }

    function test_setOperator_revertsOnZeroAddress() public {
        vm.expectRevert(BuybackBurn.ZeroAddress.selector);
        buybackBurn.setOperator(address(0), true);
    }

    // ─── Ownable2Step ─────────────────────────────────────────────────────────

    function test_transferOwnership_ownerCanTransfer() public {
        address newOwner = makeAddr("newOwner");
        buybackBurn.transferOwnership(newOwner);
        assertEq(buybackBurn.pendingOwner(), newOwner);
    }

    function test_transferOwnership_unauthorizedReverts() public {
        vm.prank(user);
        vm.expectRevert(BuybackBurn.Unauthorized.selector);
        buybackBurn.transferOwnership(makeAddr("newOwner"));
    }

    function test_transferOwnership_revertsOnZeroAddress() public {
        vm.expectRevert(BuybackBurn.ZeroAddress.selector);
        buybackBurn.transferOwnership(address(0));
    }

    function test_acceptOwnership_pendingOwnerCanAccept() public {
        address newOwner = makeAddr("newOwner");
        buybackBurn.transferOwnership(newOwner);
        
        vm.prank(newOwner);
        buybackBurn.acceptOwnership();
        
        assertEq(buybackBurn.owner(), newOwner);
        assertEq(buybackBurn.pendingOwner(), address(0));
    }

    function test_acceptOwnership_unauthorizedReverts() public {
        address newOwner = makeAddr("newOwner");
        buybackBurn.transferOwnership(newOwner);
        
        vm.prank(user);
        vm.expectRevert(BuybackBurn.Unauthorized.selector);
        buybackBurn.acceptOwnership();
    }

    // ─── Receive ETH ─────────────────────────────────────────────────────────

    function test_receive_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit BuybackBurn.EthDeposited(user, 1 ether);
        
        vm.prank(user);
        (bool success,) = address(buybackBurn).call{value: 1 ether}("");
        assertTrue(success);
    }

    function test_receive_increasesBalance() public {
        uint256 preBalance = address(buybackBurn).balance;
        
        vm.prank(user);
        (bool success,) = address(buybackBurn).call{value: 1 ether}("");
        assertTrue(success);
        
        assertEq(address(buybackBurn).balance, preBalance + 1 ether);
    }

    // ─── LP Mining Config Tests ───────────────────────────────────────────────

    function test_setLpMining_ownerCanSet() public {
        // setLpMining requires a contract address (code.length > 0); use intel (already deployed)
        address lpMiningAddr = address(intel);
        buybackBurn.setLpMining(lpMiningAddr, 2000);
        assertEq(buybackBurn.lpMiningAddress(), lpMiningAddr);
        assertEq(buybackBurn.lpMiningBps(), 2000);
    }

    function test_setLpMining_rejectsAbove30pct() public {
        address lpMiningAddr = address(0x1234);
        vm.expectRevert(BuybackBurn.InvalidParam.selector);
        buybackBurn.setLpMining(lpMiningAddr, 3001);
    }

    function test_setLpMining_requiresContract() public {
        vm.expectRevert(BuybackBurn.InvalidParam.selector);
        buybackBurn.setLpMining(address(0xDEAD), 2000);
    }

    function test_setLpMining_zeroAddressDisablesRouting() public {
        buybackBurn.setLpMining(address(0), 0);
        assertEq(buybackBurn.lpMiningAddress(), address(0));
        assertEq(buybackBurn.lpMiningBps(), 0);
    }

    // ─── Security Fix Tests ───────────────────────────────────────────────────

    function test_executeBuyback_slippageProtection_via_amountOutMinimum() public {
        vm.prank(user);
        buybackBurn.depositEth{value: 1 ether}();

        // Set max slippage to 1% (100 bps)
        buybackBurn.setMaxSlippage(100);

        // Mock swap router returns less than minimum expected
        // Expected: 1 ETH / 0.001e18 = 1000 INTEL, with 1% slippage = 990 INTEL min
        // Set router to return only 980 INTEL (below minimum)
        swapRouter.setFixedIntelAmount(980e18);

        vm.prank(operator);
        vm.expectRevert(); // Swap should revert due to insufficient amountOut
        buybackBurn.executeBuyback();
    }

    function test_setMinTwap_ownerCanSet() public {
        buybackBurn.setMinTwap(0.0005e18); // 0.0005 ETH per INTEL
        assertEq(buybackBurn.minTwap(), 0.0005e18);
    }

    function test_executeBuyback_revertsWhenTwapBelowMin() public {
        vm.prank(user);
        buybackBurn.depositEth{value: 1 ether}();

        // Set minimum TWAP
        buybackBurn.setMinTwap(0.002e18); // 0.002 ETH per INTEL

        // Set mock TWAP below minimum
        pol.setMockTWAP(0.001e18); // 0.001 ETH per INTEL

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(BuybackBurn.TwapTooLow.selector, uint256(0.001e18), uint256(0.002e18)));
        buybackBurn.executeBuyback();
    }

    function test_executeBuyback_succeedsWhenTwapAboveMin() public {
        vm.prank(user);
        buybackBurn.depositEth{value: 1 ether}();

        // Set minimum TWAP
        buybackBurn.setMinTwap(0.0005e18);

        // Set mock TWAP above minimum
        pol.setMockTWAP(0.001e18);

        // Set max slippage very high for testing
        buybackBurn.setMaxSlippage(10000);

        uint256 preIntelSupply = intel.totalSupply();

        vm.prank(operator);
        buybackBurn.executeBuyback();

        assertEq(intel.totalSupply(), preIntelSupply - 990e18);
    }
}