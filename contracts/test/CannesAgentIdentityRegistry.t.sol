// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { CannesAgentIdentityRegistry } from "../src/CannesAgentIdentityRegistry.sol";

contract CannesAgentIdentityRegistryTest is Test {
    CannesAgentIdentityRegistry internal registry;
    address internal owner = vm.addr(1);

    function setUp() public {
        registry = new CannesAgentIdentityRegistry();
    }

    function testRegisterAgent() public {
        vm.prank(owner);
        uint256 agentId = registry.register("data:application/json;base64,eyJmb28iOiJiYXIifQ==");
        assertEq(agentId, 1);
        CannesAgentIdentityRegistry.AgentRecord memory record = registry.getAgent(agentId);
        assertEq(record.owner, owner);
        assertEq(record.agentURI, "data:application/json;base64,eyJmb28iOiJiYXIifQ==");
    }
}
