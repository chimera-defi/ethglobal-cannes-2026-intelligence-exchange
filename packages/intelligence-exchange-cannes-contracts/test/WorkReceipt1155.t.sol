// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {WorkReceipt1155} from "../src/WorkReceipt1155.sol";

contract WorkReceipt1155Test is Test {
    WorkReceipt1155 public receipt;

    address owner    = address(this);
    address alice    = address(0xA11CE);
    address bob      = address(0xB0B);
    address charlie  = address(0xC4A711E);
    address operator = address(0x0FFFF);

    string constant BASE_URI = "ipfs://QmTest/metadata/";

    bytes32 constant TASK_1 = keccak256("task-001");
    bytes32 constant TASK_2 = keccak256("task-002");
    bytes32 constant TASK_3 = keccak256("task-003");
    bytes32 constant FP_1   = keccak256("fingerprint-001");
    bytes32 constant FP_2   = keccak256("fingerprint-002");

    function setUp() public {
        receipt = new WorkReceipt1155(owner, BASE_URI);
        receipt.setOperator(operator, true);
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    function test_constructor_ownerSet() public view {
        assertEq(receipt.owner(), owner);
    }

    function test_constructor_baseURISet() public view {
        assertEq(receipt.baseURI(), BASE_URI);
    }

    function test_constructor_nextTokenIdStartsAtOne() public view {
        assertEq(receipt.nextTokenId(), 1);
    }

    function test_constructor_zeroOwner_reverts() public {
        vm.expectRevert(WorkReceipt1155.ZeroAddress.selector);
        new WorkReceipt1155(address(0), BASE_URI);
    }

    // ─── mint: happy path ─────────────────────────────────────────────────────

    function test_mint_returnsTokenId() public {
        vm.prank(operator);
        uint256 tokenId = receipt.mint(alice, TASK_1, FP_1, 85);
        assertEq(tokenId, 1);
    }

    function test_mint_incrementsNextTokenId() public {
        vm.prank(operator);
        receipt.mint(alice, TASK_1, FP_1, 85);
        assertEq(receipt.nextTokenId(), 2);
    }

    function test_mint_secondTokenIdIsTwo() public {
        vm.prank(operator);
        receipt.mint(alice, TASK_1, FP_1, 85);
        vm.prank(operator);
        uint256 id2 = receipt.mint(bob, TASK_2, FP_2, 90);
        assertEq(id2, 2);
    }

    function test_mint_setsReceiptData() public {
        vm.prank(operator);
        uint256 tokenId = receipt.mint(alice, TASK_1, FP_1, 75);

        WorkReceipt1155.Receipt memory r = receipt.getReceipt(tokenId);
        assertEq(r.taskId, TASK_1);
        assertEq(r.workerFingerprint, FP_1);
        assertEq(r.score, 75);
        assertGt(r.acceptedAt, 0);
    }

    function test_mint_setsTokenOwner() public {
        vm.prank(operator);
        uint256 tokenId = receipt.mint(alice, TASK_1, FP_1, 85);
        assertEq(receipt.tokenOwner(tokenId), alice);
    }

    function test_mint_setsBalance() public {
        vm.prank(operator);
        uint256 tokenId = receipt.mint(alice, TASK_1, FP_1, 85);
        assertEq(receipt.balanceOf(alice, tokenId), 1);
    }

    function test_mint_mapsTaskToTokenId() public {
        vm.prank(operator);
        uint256 tokenId = receipt.mint(alice, TASK_1, FP_1, 85);
        assertEq(receipt.taskToTokenId(TASK_1), tokenId);
    }

    function test_mint_emitsTransferSingleEvent() public {
        vm.expectEmit(true, true, true, true);
        emit WorkReceipt1155.TransferSingle(operator, address(0), alice, 1, 1);
        vm.prank(operator);
        receipt.mint(alice, TASK_1, FP_1, 85);
    }

    function test_mint_emitsReceiptMintedEvent() public {
        uint40 ts = uint40(block.timestamp);
        vm.expectEmit(true, true, true, true);
        emit WorkReceipt1155.ReceiptMinted(1, alice, TASK_1, FP_1, 85, ts);
        vm.prank(operator);
        receipt.mint(alice, TASK_1, FP_1, 85);
    }

    function test_mint_ownerCanAlsoMint() public {
        // owner satisfies onlyOperator
        uint256 tokenId = receipt.mint(alice, TASK_1, FP_1, 100);
        assertEq(tokenId, 1);
    }

    function test_mint_scoreZero_succeeds() public {
        vm.prank(operator);
        uint256 tokenId = receipt.mint(alice, TASK_1, FP_1, 0);
        WorkReceipt1155.Receipt memory r = receipt.getReceipt(tokenId);
        assertEq(r.score, 0);
    }

    function test_mint_scoreHundred_succeeds() public {
        vm.prank(operator);
        uint256 tokenId = receipt.mint(alice, TASK_1, FP_1, 100);
        WorkReceipt1155.Receipt memory r = receipt.getReceipt(tokenId);
        assertEq(r.score, 100);
    }

    // ─── mint: guards ─────────────────────────────────────────────────────────

    function test_mint_unauthorized_reverts() public {
        vm.prank(alice);
        vm.expectRevert(WorkReceipt1155.Unauthorized.selector);
        receipt.mint(bob, TASK_1, FP_1, 85);
    }

    function test_mint_alreadyMinted_reverts() public {
        vm.prank(operator);
        receipt.mint(alice, TASK_1, FP_1, 85);

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(WorkReceipt1155.AlreadyMinted.selector, TASK_1));
        receipt.mint(bob, TASK_1, FP_2, 90);
    }

    function test_mint_invalidScore_reverts() public {
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(WorkReceipt1155.InvalidScore.selector, 101));
        receipt.mint(alice, TASK_1, FP_1, 101);
    }

    function test_mint_zeroWorker_reverts() public {
        vm.prank(operator);
        vm.expectRevert(WorkReceipt1155.ZeroAddress.selector);
        receipt.mint(address(0), TASK_1, FP_1, 85);
    }

    // ─── Soulbound transfers ──────────────────────────────────────────────────

    function test_safeTransferFrom_reverts() public {
        vm.prank(operator);
        receipt.mint(alice, TASK_1, FP_1, 85);

        vm.prank(alice);
        vm.expectRevert(WorkReceipt1155.Soulbound.selector);
        receipt.safeTransferFrom(alice, bob, 1, 1, "");
    }

    function test_safeBatchTransferFrom_reverts() public {
        vm.prank(operator);
        receipt.mint(alice, TASK_1, FP_1, 85);

        uint256[] memory ids = new uint256[](1);
        ids[0] = 1;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1;

        vm.prank(alice);
        vm.expectRevert(WorkReceipt1155.Soulbound.selector);
        receipt.safeBatchTransferFrom(alice, bob, ids, amounts, "");
    }

    function test_setApprovalForAll_reverts() public {
        vm.prank(alice);
        vm.expectRevert(WorkReceipt1155.Soulbound.selector);
        receipt.setApprovalForAll(bob, true);
    }

    function test_isApprovedForAll_alwaysFalse() public view {
        assertFalse(receipt.isApprovedForAll(alice, bob));
    }

    // ─── balanceOf ────────────────────────────────────────────────────────────

    function test_balanceOf_oneAfterMint() public {
        vm.prank(operator);
        uint256 tokenId = receipt.mint(alice, TASK_1, FP_1, 85);
        assertEq(receipt.balanceOf(alice, tokenId), 1);
    }

    function test_balanceOf_zeroForNonOwner() public {
        vm.prank(operator);
        uint256 tokenId = receipt.mint(alice, TASK_1, FP_1, 85);
        assertEq(receipt.balanceOf(bob, tokenId), 0);
    }

    function test_balanceOf_zeroForUnmintedToken() public view {
        assertEq(receipt.balanceOf(alice, 999), 0);
    }

    // ─── balanceOfBatch ───────────────────────────────────────────────────────

    function test_balanceOfBatch_correct() public {
        vm.prank(operator);
        uint256 id1 = receipt.mint(alice, TASK_1, FP_1, 85);
        vm.prank(operator);
        uint256 id2 = receipt.mint(bob, TASK_2, FP_2, 90);

        address[] memory accounts = new address[](3);
        accounts[0] = alice;
        accounts[1] = bob;
        accounts[2] = charlie;

        uint256[] memory ids = new uint256[](3);
        ids[0] = id1;
        ids[1] = id2;
        ids[2] = id1;

        uint256[] memory balances = receipt.balanceOfBatch(accounts, ids);
        assertEq(balances[0], 1); // alice owns id1
        assertEq(balances[1], 1); // bob owns id2
        assertEq(balances[2], 0); // charlie doesn't own id1
    }

    function test_balanceOfBatch_lengthMismatch_reverts() public {
        address[] memory accounts = new address[](2);
        accounts[0] = alice;
        accounts[1] = bob;
        uint256[] memory ids = new uint256[](1);
        ids[0] = 1;

        vm.expectRevert("length mismatch");
        receipt.balanceOfBatch(accounts, ids);
    }

    // ─── getReceipt / getReceiptByTask ────────────────────────────────────────

    function test_getReceipt_returnsCorrectData() public {
        vm.prank(operator);
        uint256 tokenId = receipt.mint(alice, TASK_1, FP_1, 77);

        WorkReceipt1155.Receipt memory r = receipt.getReceipt(tokenId);
        assertEq(r.taskId, TASK_1);
        assertEq(r.workerFingerprint, FP_1);
        assertEq(r.score, 77);
    }

    function test_getReceiptByTask_returnsTokenIdAndData() public {
        vm.prank(operator);
        uint256 minted = receipt.mint(alice, TASK_1, FP_1, 77);

        (uint256 tokenId, WorkReceipt1155.Receipt memory r) = receipt.getReceiptByTask(TASK_1);
        assertEq(tokenId, minted);
        assertEq(r.taskId, TASK_1);
        assertEq(r.workerFingerprint, FP_1);
        assertEq(r.score, 77);
    }

    function test_getReceiptByTask_unmintedTask_returnsZero() public view {
        (uint256 tokenId, WorkReceipt1155.Receipt memory r) = receipt.getReceiptByTask(TASK_3);
        assertEq(tokenId, 0);
        assertEq(r.score, 0);
    }

    // ─── uri ──────────────────────────────────────────────────────────────────

    function test_uri_returnsBaseURIPlusId() public view {
        string memory expected = string(abi.encodePacked(BASE_URI, "1"));
        assertEq(receipt.uri(1), expected);
    }

    function test_uri_largeId() public view {
        string memory u = receipt.uri(12345);
        assertEq(u, string(abi.encodePacked(BASE_URI, "12345")));
    }

    function test_uri_zeroId() public view {
        string memory u = receipt.uri(0);
        assertEq(u, string(abi.encodePacked(BASE_URI, "0")));
    }

    // ─── setOperator ─────────────────────────────────────────────────────────

    function test_setOperator_addsOperator() public {
        receipt.setOperator(charlie, true);
        assertTrue(receipt.operators(charlie));
    }

    function test_setOperator_removesOperator() public {
        receipt.setOperator(charlie, true);
        receipt.setOperator(charlie, false);
        assertFalse(receipt.operators(charlie));
    }

    function test_setOperator_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit WorkReceipt1155.OperatorSet(charlie, true);
        receipt.setOperator(charlie, true);
    }

    function test_setOperator_onlyOwner_reverts() public {
        vm.prank(alice);
        vm.expectRevert(WorkReceipt1155.Unauthorized.selector);
        receipt.setOperator(charlie, true);
    }

    function test_setOperator_zeroAddress_reverts() public {
        vm.expectRevert(WorkReceipt1155.ZeroAddress.selector);
        receipt.setOperator(address(0), true);
    }

    function test_setOperator_revokedOperatorCannotMint() public {
        receipt.setOperator(charlie, true);
        receipt.setOperator(charlie, false);
        vm.prank(charlie);
        vm.expectRevert(WorkReceipt1155.Unauthorized.selector);
        receipt.mint(alice, TASK_1, FP_1, 85);
    }

    // ─── setBaseURI ───────────────────────────────────────────────────────────

    function test_setBaseURI_updatesURI() public {
        receipt.setBaseURI("ipfs://QmNew/");
        assertEq(receipt.baseURI(), "ipfs://QmNew/");
    }

    function test_setBaseURI_onlyOwner_reverts() public {
        vm.prank(alice);
        vm.expectRevert(WorkReceipt1155.Unauthorized.selector);
        receipt.setBaseURI("ipfs://QmNew/");
    }

    function test_setBaseURI_updatesUriOutput() public {
        receipt.setBaseURI("https://api.example.com/tokens/");
        assertEq(receipt.uri(42), "https://api.example.com/tokens/42");
    }

    // ─── Ownable2Step ─────────────────────────────────────────────────────────

    function test_transferOwnership_setsPendingOwner() public {
        receipt.transferOwnership(alice);
        assertEq(receipt.pendingOwner(), alice);
        // owner unchanged until accepted
        assertEq(receipt.owner(), owner);
    }

    function test_transferOwnership_emitsStartedEvent() public {
        vm.expectEmit(true, true, false, false);
        emit WorkReceipt1155.OwnershipTransferStarted(owner, alice);
        receipt.transferOwnership(alice);
    }

    function test_transferOwnership_zeroAddress_reverts() public {
        vm.expectRevert(WorkReceipt1155.ZeroAddress.selector);
        receipt.transferOwnership(address(0));
    }

    function test_transferOwnership_nonOwner_reverts() public {
        vm.prank(alice);
        vm.expectRevert(WorkReceipt1155.Unauthorized.selector);
        receipt.transferOwnership(bob);
    }

    function test_acceptOwnership_completesTransfer() public {
        receipt.transferOwnership(alice);
        vm.prank(alice);
        receipt.acceptOwnership();
        assertEq(receipt.owner(), alice);
        assertEq(receipt.pendingOwner(), address(0));
    }

    function test_acceptOwnership_emitsTransferredEvent() public {
        receipt.transferOwnership(alice);
        vm.expectEmit(true, true, false, false);
        emit WorkReceipt1155.OwnershipTransferred(owner, alice);
        vm.prank(alice);
        receipt.acceptOwnership();
    }

    function test_acceptOwnership_nonNominee_reverts() public {
        receipt.transferOwnership(alice);
        vm.prank(bob);
        vm.expectRevert(WorkReceipt1155.Unauthorized.selector);
        receipt.acceptOwnership();
    }

    function test_acceptOwnership_newOwnerCanSetOperator() public {
        receipt.transferOwnership(alice);
        vm.prank(alice);
        receipt.acceptOwnership();
        vm.prank(alice);
        receipt.setOperator(charlie, true);
        assertTrue(receipt.operators(charlie));
    }

    function test_acceptOwnership_oldOwnerLosesAccess() public {
        receipt.transferOwnership(alice);
        vm.prank(alice);
        receipt.acceptOwnership();
        vm.expectRevert(WorkReceipt1155.Unauthorized.selector);
        receipt.setBaseURI("blocked");
    }

    // ─── supportsInterface ────────────────────────────────────────────────────

    function test_supportsInterface_erc165() public view {
        assertTrue(receipt.supportsInterface(0x01ffc9a7));
    }

    function test_supportsInterface_erc1155() public view {
        assertTrue(receipt.supportsInterface(0xd9b67a26));
    }

    function test_supportsInterface_unknownId_returnsFalse() public view {
        assertFalse(receipt.supportsInterface(0xdeadbeef));
    }
}
