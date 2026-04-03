// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script } from "forge-std/Script.sol";
import { CannesAgentIdentityRegistry } from "../src/CannesAgentIdentityRegistry.sol";
import { CannesMilestoneEscrow } from "../src/CannesMilestoneEscrow.sol";

contract DeployCannes is Script {
    function run()
        external
        returns (CannesAgentIdentityRegistry registry, CannesMilestoneEscrow escrow)
    {
        address poster =
            vm.envOr("POSTER_ADDRESS", address(0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1));
        uint256 totalBudgetUsd = vm.envOr("TOTAL_BUDGET_USD", uint256(400));

        vm.startBroadcast();
        registry = new CannesAgentIdentityRegistry();
        escrow = new CannesMilestoneEscrow(poster, totalBudgetUsd);
        vm.stopBroadcast();
    }
}
