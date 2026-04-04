// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IdentityGate} from "../src/IdentityGate.sol";

contract IdentityGateTest is Test {
    IdentityGate public gate;

    address attestor = address(0xA11CE);
    address account = address(0xB0B);

    function setUp() public {
        gate = new IdentityGate(attestor);
    }

    function test_attestorCanSetVerifiedRole() public {
        vm.prank(attestor);
        gate.setVerified(account, gate.WORKER_ROLE(), true);

        assertTrue(gate.isVerified(account, gate.WORKER_ROLE()));
    }

    function test_ownerCanSetVerifiedRole() public {
        gate.setVerified(account, gate.POSTER_ROLE(), true);

        assertTrue(gate.isVerified(account, gate.POSTER_ROLE()));
    }

    function test_setVerified_revert_unauthorized() public {
        bytes32 reviewerRole = gate.REVIEWER_ROLE();

        vm.prank(address(0xBAD));
        vm.expectRevert(IdentityGate.Unauthorized.selector);
        gate.setVerified(account, reviewerRole, true);
    }

    function test_ownerCanRotateAttestor() public {
        address nextAttestor = address(0xCAFE);

        gate.setAttestor(nextAttestor);

        assertEq(gate.attestor(), nextAttestor);
    }
}
