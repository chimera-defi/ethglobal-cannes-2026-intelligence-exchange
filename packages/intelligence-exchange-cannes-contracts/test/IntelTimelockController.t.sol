// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {IntelTimelockController} from "../src/IntelTimelockController.sol";

/// @dev Simple target contract for timelock tests
contract TimelockTarget {
    uint256 public value;
    event ValueSet(uint256 newValue);

    function setValue(uint256 v) external {
        value = v;
        emit ValueSet(v);
    }

    function failAlways() external pure {
        revert("always fails");
    }
}

contract IntelTimelockControllerTest is Test {
    IntelTimelockController timelock;
    TimelockTarget target;

    address admin    = makeAddr("admin");
    address proposer = makeAddr("proposer");
    address executor = makeAddr("executor");

    uint256 constant DELAY = 2 days;

    function setUp() public {
        address[] memory proposers = new address[](1);
        proposers[0] = proposer;

        timelock = new IntelTimelockController(admin, DELAY, proposers);
        target   = new TimelockTarget();
    }

    // ─── Constructor ──────────────────────────────────────────────────────

    function test_constructor_stores_params() public view {
        assertEq(timelock.admin(),         admin);
        assertEq(timelock.delay(),         DELAY);
        assertTrue(timelock.isProposer(proposer));
        assertFalse(timelock.isProposer(executor));
    }

    function test_constructor_revert_zero_admin() public {
        address[] memory p = new address[](0);
        vm.expectRevert(IntelTimelockController.ZeroAddress.selector);
        new IntelTimelockController(address(0), DELAY, p);
    }

    function test_constructor_revert_zero_delay() public {
        address[] memory p = new address[](0);
        vm.expectRevert(IntelTimelockController.ZeroDelay.selector);
        new IntelTimelockController(admin, 0, p);
    }

    function test_constructor_revert_delay_too_short() public {
        address[] memory p = new address[](0);
        vm.expectRevert(
            abi.encodeWithSelector(IntelTimelockController.DelayTooShort.selector, 60, 15 minutes)
        );
        new IntelTimelockController(admin, 60, p); // 60s < 15 min
    }

    // ─── hashOperation ─────────────────────────────────────────────────────

    function test_hash_includes_chainid() public {
        bytes memory data  = abi.encodeCall(TimelockTarget.setValue, (42));
        bytes32 salt       = bytes32(0);
        bytes32 id1        = timelock.hashOperation(address(target), 0, data, salt);

        // On a different chain ID the hash should differ
        vm.chainId(999);
        bytes32 id2 = timelock.hashOperation(address(target), 0, data, salt);
        assertTrue(id1 != id2, "Hash must differ across chains");
    }

    function test_hash_deterministic() public view {
        bytes memory data = abi.encodeCall(TimelockTarget.setValue, (1));
        bytes32 id1 = timelock.hashOperation(address(target), 0, data, bytes32(0));
        bytes32 id2 = timelock.hashOperation(address(target), 0, data, bytes32(0));
        assertEq(id1, id2);
    }

    // ─── queue ────────────────────────────────────────────────────────────

    function _prepareOp(uint256 val) internal view returns (
        address _target, uint256 _value, bytes memory _data, bytes32 _salt, bytes32 _id
    ) {
        _target = address(target);
        _value  = 0;
        _data   = abi.encodeCall(TimelockTarget.setValue, (val));
        _salt   = bytes32(uint256(val)); // unique salt per val
        _id     = timelock.hashOperation(_target, _value, _data, _salt);
    }

    function test_queue_by_proposer() public {
        (address t, uint256 v, bytes memory d, bytes32 s, bytes32 id) = _prepareOp(42);

        vm.prank(proposer);
        bytes32 returned = timelock.queue(t, v, d, s);

        assertEq(returned, id);
        assertTrue(timelock.isQueued(id));
        assertFalse(timelock.isReady(id));
        assertFalse(timelock.isExecuted(id));
    }

    function test_queue_by_admin() public {
        (, , bytes memory d, bytes32 s, bytes32 id) = _prepareOp(1);
        vm.prank(admin);
        timelock.queue(address(target), 0, d, s);
        assertTrue(timelock.isQueued(id));
    }

    function test_queue_reverts_for_non_proposer() public {
        (, , bytes memory d, bytes32 s,) = _prepareOp(2);
        vm.prank(executor);
        vm.expectRevert(IntelTimelockController.Unauthorized.selector);
        timelock.queue(address(target), 0, d, s);
    }

    function test_queue_reverts_duplicate() public {
        (, , bytes memory d, bytes32 s, bytes32 id) = _prepareOp(3);
        vm.prank(proposer);
        timelock.queue(address(target), 0, d, s);

        vm.prank(proposer);
        vm.expectRevert(
            abi.encodeWithSelector(IntelTimelockController.OperationAlreadyQueued.selector, id)
        );
        timelock.queue(address(target), 0, d, s);
    }

    // ─── cancel ───────────────────────────────────────────────────────────

    function test_cancel_by_proposer() public {
        (, , bytes memory d, bytes32 s, bytes32 id) = _prepareOp(4);
        vm.prank(proposer);
        timelock.queue(address(target), 0, d, s);

        vm.prank(proposer);
        timelock.cancel(id);
        assertFalse(timelock.isQueued(id));
    }

    function test_cancel_by_admin() public {
        (, , bytes memory d, bytes32 s, bytes32 id) = _prepareOp(5);
        vm.prank(proposer);
        timelock.queue(address(target), 0, d, s);

        vm.prank(admin);
        timelock.cancel(id);
        assertFalse(timelock.isQueued(id));
    }

    function test_cancel_reverts_not_queued() public {
        bytes32 fakeId = keccak256("not queued");
        vm.prank(proposer);
        vm.expectRevert(
            abi.encodeWithSelector(IntelTimelockController.OperationNotQueued.selector, fakeId)
        );
        timelock.cancel(fakeId);
    }

    function test_cancel_reverts_non_proposer() public {
        (, , bytes memory d, bytes32 s, bytes32 id) = _prepareOp(6);
        vm.prank(proposer);
        timelock.queue(address(target), 0, d, s);

        vm.prank(executor);
        vm.expectRevert(IntelTimelockController.Unauthorized.selector);
        timelock.cancel(id);
    }

    // ─── execute ──────────────────────────────────────────────────────────

    function test_execute_after_delay() public {
        (, , bytes memory d, bytes32 s, bytes32 id) = _prepareOp(99);
        vm.prank(proposer);
        timelock.queue(address(target), 0, d, s);

        vm.warp(block.timestamp + DELAY);
        vm.prank(executor);
        timelock.execute(address(target), 0, d, s);

        assertEq(target.value(), 99);
        assertTrue(timelock.isExecuted(id));
        assertFalse(timelock.isQueued(id));
    }

    function test_execute_reverts_not_ready() public {
        (, , bytes memory d, bytes32 s, bytes32 id) = _prepareOp(100);
        vm.prank(proposer);
        timelock.queue(address(target), 0, d, s);

        uint256 readyAt = block.timestamp + DELAY;
        vm.warp(readyAt - 1); // one second before ready
        vm.expectRevert(
            abi.encodeWithSelector(
                IntelTimelockController.OperationNotReady.selector, id, readyAt, readyAt - 1
            )
        );
        timelock.execute(address(target), 0, d, s);
    }

    function test_execute_reverts_not_queued() public {
        (, , bytes memory d, bytes32 s,) = _prepareOp(101);
        // Never queued
        bytes32 id = timelock.hashOperation(address(target), 0, d, s);
        vm.expectRevert(
            abi.encodeWithSelector(IntelTimelockController.OperationNotQueued.selector, id)
        );
        timelock.execute(address(target), 0, d, s);
    }

    function test_execute_reverts_expired() public {
        (, , bytes memory d, bytes32 s, bytes32 id) = _prepareOp(102);
        vm.prank(proposer);
        timelock.queue(address(target), 0, d, s);

        uint256 readyAt = block.timestamp + DELAY;
        vm.warp(readyAt + 14 days + 1); // past GRACE_PERIOD

        vm.expectRevert(
            abi.encodeWithSelector(
                IntelTimelockController.OperationExpired.selector,
                id,
                readyAt + 14 days,
                readyAt + 14 days + 1
            )
        );
        timelock.execute(address(target), 0, d, s);
    }

    function test_execute_reverts_failing_call() public {
        bytes memory d = abi.encodeCall(TimelockTarget.failAlways, ());
        bytes32 s      = bytes32(uint256(999));
        bytes32 id     = timelock.hashOperation(address(target), 0, d, s);

        vm.prank(proposer);
        timelock.queue(address(target), 0, d, s);

        vm.warp(block.timestamp + DELAY);
        vm.expectRevert(
            abi.encodeWithSelector(IntelTimelockController.ExecutionFailed.selector, id)
        );
        timelock.execute(address(target), 0, d, s);
    }

    function test_execute_is_permissionless() public {
        (, , bytes memory d, bytes32 s,) = _prepareOp(200);
        vm.prank(proposer);
        timelock.queue(address(target), 0, d, s);

        vm.warp(block.timestamp + DELAY);

        address random = makeAddr("random");
        vm.prank(random);
        timelock.execute(address(target), 0, d, s); // anyone can execute
        assertEq(target.value(), 200);
    }

    // ─── Self-governed parameter changes ──────────────────────────────────

    function test_setDelay_via_timelock() public {
        uint256 newDelay = 7 days;
        bytes memory d   = abi.encodeCall(IntelTimelockController.setDelay, (newDelay));
        bytes32 s        = bytes32(uint256(1111));

        vm.prank(proposer);
        timelock.queue(address(timelock), 0, d, s);
        vm.warp(block.timestamp + DELAY);
        timelock.execute(address(timelock), 0, d, s);

        assertEq(timelock.delay(), newDelay);
    }

    function test_setDelay_direct_reverts() public {
        vm.expectRevert(IntelTimelockController.Unauthorized.selector);
        timelock.setDelay(7 days);
    }

    function test_setProposer_via_timelock() public {
        address newProp = makeAddr("newProp");
        bytes memory d  = abi.encodeCall(IntelTimelockController.setProposer, (newProp, true));
        bytes32 s       = bytes32(uint256(2222));

        vm.prank(proposer);
        timelock.queue(address(timelock), 0, d, s);
        vm.warp(block.timestamp + DELAY);
        timelock.execute(address(timelock), 0, d, s);

        assertTrue(timelock.isProposer(newProp));
    }

    function test_setAdmin_via_timelock() public {
        address newAdmin = makeAddr("newAdmin");
        bytes memory d   = abi.encodeCall(IntelTimelockController.setAdmin, (newAdmin));
        bytes32 s        = bytes32(uint256(3333));

        vm.prank(proposer);
        timelock.queue(address(timelock), 0, d, s);
        vm.warp(block.timestamp + DELAY);
        timelock.execute(address(timelock), 0, d, s);

        assertEq(timelock.admin(), newAdmin);
    }

    // ─── adminCancel ─────────────────────────────────────────────────────

    function test_adminCancel_works() public {
        (, , bytes memory d, bytes32 s, bytes32 id) = _prepareOp(300);
        vm.prank(proposer);
        timelock.queue(address(target), 0, d, s);

        vm.prank(admin);
        timelock.adminCancel(id);
        assertFalse(timelock.isQueued(id));
    }

    function test_adminCancel_reverts_not_admin() public {
        (, , bytes memory d, bytes32 s, bytes32 id) = _prepareOp(301);
        vm.prank(proposer);
        timelock.queue(address(target), 0, d, s);

        vm.prank(proposer);
        vm.expectRevert(IntelTimelockController.Unauthorized.selector);
        timelock.adminCancel(id);
    }

    // ─── ETH forwarding ───────────────────────────────────────────────────

    function test_execute_forwards_eth() public {
        // Target: we send ETH to target's receive function via a value call
        // Simple test: send ETH to a known receiver
        address receiver = makeAddr("receiver");
        vm.deal(address(timelock), 1 ether);

        bytes memory d = ""; // empty call to receiver
        bytes32 s      = bytes32(uint256(9999));

        vm.prank(proposer);
        timelock.queue(receiver, 0.5 ether, d, s);

        vm.warp(block.timestamp + DELAY);
        timelock.execute{value: 0.5 ether}(receiver, 0.5 ether, d, s);
        assertEq(receiver.balance, 0.5 ether);
    }

    // ─── isReady / isQueued / isExecuted state machine ────────────────────

    function test_state_machine_full_lifecycle() public {
        (, , bytes memory d, bytes32 s, bytes32 id) = _prepareOp(400);

        // initial state
        assertFalse(timelock.isQueued(id));
        assertFalse(timelock.isReady(id));
        assertFalse(timelock.isExecuted(id));

        // after queue
        vm.prank(proposer);
        timelock.queue(address(target), 0, d, s);
        assertTrue(timelock.isQueued(id));
        assertFalse(timelock.isReady(id));
        assertFalse(timelock.isExecuted(id));

        // after delay elapses
        vm.warp(block.timestamp + DELAY);
        assertTrue(timelock.isQueued(id));
        assertTrue(timelock.isReady(id));
        assertFalse(timelock.isExecuted(id));

        // after execute
        timelock.execute(address(target), 0, d, s);
        assertFalse(timelock.isQueued(id));
        assertFalse(timelock.isReady(id));
        assertTrue(timelock.isExecuted(id));
    }
}
