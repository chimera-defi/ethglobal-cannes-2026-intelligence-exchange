// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract CannesMilestoneEscrow {
    address public immutable OWNER;
    address public immutable POSTER;
    uint256 public immutable TOTAL_BUDGET_USD;

    enum EscrowStatus {
        Pending,
        Funded,
        Closed
    }

    struct MilestoneReservation {
        address worker;
        uint256 budgetUsd;
        bool reserved;
        bool released;
        bool refunded;
    }

    EscrowStatus public escrowStatus;
    uint256 public fundedAmountWei;
    uint256 public reservedBudgetUsd;
    uint256 public settledBudgetUsd;

    mapping(bytes32 => MilestoneReservation) public milestoneReservations;

    event EscrowFunded(address indexed funder, uint256 amountWei, uint256 totalBudgetUsd);
    event MilestoneReserved(bytes32 indexed milestoneId, address indexed worker, uint256 budgetUsd);
    event MilestoneReleased(
        bytes32 indexed milestoneId, address indexed worker, uint256 amountWei, uint256 budgetUsd
    );
    event MilestoneRefunded(
        bytes32 indexed milestoneId, address indexed poster, uint256 amountWei, uint256 budgetUsd
    );
    event EscrowClosed(address indexed closedBy, uint256 remainingWei);

    constructor(address poster_, uint256 totalBudgetUsd_) {
        OWNER = msg.sender;
        POSTER = poster_;
        TOTAL_BUDGET_USD = totalBudgetUsd_;
        escrowStatus = EscrowStatus.Pending;
    }

    function fund() external payable {
        require(msg.sender == POSTER || msg.sender == OWNER, "not authorized funder");
        require(escrowStatus == EscrowStatus.Pending, "already funded");
        require(msg.value > 0, "value required");
        fundedAmountWei = msg.value;
        escrowStatus = EscrowStatus.Funded;
        emit EscrowFunded(msg.sender, msg.value, TOTAL_BUDGET_USD);
    }

    function reserveMilestone(bytes32 milestoneId, address worker, uint256 budgetUsd) external {
        require(msg.sender == POSTER || msg.sender == OWNER, "not authorized reserve");
        require(escrowStatus == EscrowStatus.Funded, "escrow not funded");
        require(worker != address(0), "worker required");
        require(budgetUsd > 0, "budget required");

        MilestoneReservation storage reservation = milestoneReservations[milestoneId];
        require(!reservation.reserved, "milestone already reserved");
        require(reservedBudgetUsd + budgetUsd <= TOTAL_BUDGET_USD, "budget exceeded");

        reservation.worker = worker;
        reservation.budgetUsd = budgetUsd;
        reservation.reserved = true;
        reservedBudgetUsd += budgetUsd;

        emit MilestoneReserved(milestoneId, worker, budgetUsd);
    }

    function releaseMilestone(bytes32 milestoneId) external {
        require(msg.sender == POSTER || msg.sender == OWNER, "not authorized release");
        require(escrowStatus == EscrowStatus.Funded, "escrow not releasable");

        MilestoneReservation storage reservation = milestoneReservations[milestoneId];
        require(reservation.reserved, "milestone not reserved");
        require(!reservation.released, "milestone already released");
        require(!reservation.refunded, "milestone already refunded");

        uint256 amountWei = _allocationWei(reservation.budgetUsd);
        reservation.released = true;
        settledBudgetUsd += reservation.budgetUsd;

        (bool ok,) = payable(reservation.worker).call{ value: amountWei }("");
        require(ok, "release failed");
        _closeIfFullySettled();
        emit MilestoneReleased(milestoneId, reservation.worker, amountWei, reservation.budgetUsd);
    }

    function refundMilestone(bytes32 milestoneId) external {
        require(msg.sender == POSTER || msg.sender == OWNER, "not authorized refund");
        require(escrowStatus == EscrowStatus.Funded, "escrow not refundable");

        MilestoneReservation storage reservation = milestoneReservations[milestoneId];
        require(reservation.reserved, "milestone not reserved");
        require(!reservation.released, "milestone already released");
        require(!reservation.refunded, "milestone already refunded");

        uint256 amountWei = _allocationWei(reservation.budgetUsd);
        reservation.refunded = true;
        settledBudgetUsd += reservation.budgetUsd;

        (bool ok,) = payable(POSTER).call{ value: amountWei }("");
        require(ok, "refund failed");
        _closeIfFullySettled();
        emit MilestoneRefunded(milestoneId, POSTER, amountWei, reservation.budgetUsd);
    }

    function closeEscrow() external {
        require(msg.sender == POSTER || msg.sender == OWNER, "not authorized close");
        require(escrowStatus == EscrowStatus.Funded, "escrow not closable");
        require(settledBudgetUsd == reservedBudgetUsd, "reserved budget still unsettled");

        uint256 remainingWei = address(this).balance;
        escrowStatus = EscrowStatus.Closed;

        if (remainingWei > 0) {
            (bool ok,) = payable(POSTER).call{ value: remainingWei }("");
            require(ok, "close refund failed");
        }

        emit EscrowClosed(msg.sender, remainingWei);
    }

    function getMilestone(bytes32 milestoneId) external view returns (MilestoneReservation memory) {
        return milestoneReservations[milestoneId];
    }

    function _allocationWei(uint256 budgetUsd) internal view returns (uint256) {
        uint256 allocated = (fundedAmountWei * budgetUsd) / TOTAL_BUDGET_USD;
        if (settledBudgetUsd + budgetUsd == reservedBudgetUsd) {
            return address(this).balance;
        }
        return allocated;
    }

    function _closeIfFullySettled() internal {
        if (settledBudgetUsd == TOTAL_BUDGET_USD) {
            escrowStatus = EscrowStatus.Closed;
        }
    }
}
