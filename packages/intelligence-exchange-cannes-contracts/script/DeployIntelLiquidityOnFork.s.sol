// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IntelToken} from "../src/IntelToken.sol";

interface IUniswapV2Router02 {
    function factory() external pure returns (address);
    function WETH() external pure returns (address);
    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity);
}

interface IUniswapV2Factory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
}

/// @title DeployIntelLiquidityOnFork
/// @notice Deploys INTEL token and seeds a WETH/INTEL Uniswap V2 pool on an Ethereum mainnet fork.
contract DeployIntelLiquidityOnFork is Script {
    error PairNotCreated();

    // Uniswap V2 router on Ethereum mainnet.
    address internal constant UNISWAP_V2_ROUTER = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;
    uint256 internal constant DEFAULT_INITIAL_SUPPLY = 1_000_000_000 ether;

    function run() external returns (IntelToken token, address pair) {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(privateKey);

        uint256 tokenLiquidityAmount = vm.envOr("INTEL_LP_TOKEN_AMOUNT", uint256(10_000_000 ether));
        uint256 ethLiquidityAmount = vm.envOr("INTEL_LP_ETH_AMOUNT_WEI", uint256(100 ether));
        uint256 deadline = block.timestamp + 1 hours;

        IUniswapV2Router02 router = IUniswapV2Router02(UNISWAP_V2_ROUTER);

        vm.startBroadcast(privateKey);

        token = new IntelToken("Intelligence Token", "INTEL", deployer, DEFAULT_INITIAL_SUPPLY);
        token.approve(address(router), tokenLiquidityAmount);

        (uint256 tokenUsed, uint256 ethUsed, uint256 liquidityMinted) = router.addLiquidityETH{value: ethLiquidityAmount}(
            address(token),
            tokenLiquidityAmount,
            0,
            0,
            deployer,
            deadline
        );

        pair = IUniswapV2Factory(router.factory()).getPair(address(token), router.WETH());
        if (pair == address(0)) revert PairNotCreated();

        vm.stopBroadcast();

        console2.log("INTEL_TOKEN_ADDRESS=", address(token));
        console2.log("INTEL_WETH_PAIR_ADDRESS=", pair);
        console2.log("UNISWAP_V2_ROUTER_ADDRESS=", address(router));
        console2.log("WETH_ADDRESS=", router.WETH());
        console2.log("TOKEN_LIQUIDITY_USED=", tokenUsed);
        console2.log("ETH_LIQUIDITY_USED_WEI=", ethUsed);
        console2.log("LP_TOKENS_MINTED=", liquidityMinted);
    }
}
