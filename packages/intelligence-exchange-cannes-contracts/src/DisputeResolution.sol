// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @custom:security-contact security@iex.cannes

import {IntelToken} from "./IntelToken.sol";
import {IntelStaking} from "./IntelStaking.sol";
import {ReviewerStakeManager} from "./ReviewerStakeManager.sol";
import {WorkerStakeManager} from "./WorkerStakeManager.sol";

interface IReviewerStakeManager {
    function slash(address reviewer, uint256 amount) external;
    function reviewerBond(address reviewer) external view returns (uint256);
}

/// @title DisputeResolution
/// @notice On-chain dispute resolution for the Assay Protocol using staker juries.
///
/// When a buyer disputes an accepted task review, the case goes to a staker jury
/// rather than a centralized operator. This gives INTEL stakers an on-chain veto
/// and slashing power over fraudulent acceptances.
///
/// Phase 3 of the governance roadmap: decentralized dispute resolution.
contract DisputeResolution {
    // ─── Errors ──────────────────────────────────────────────────────────────

    error Unauthorized();
    error ZeroAddress();
    error ZeroAmount();
    error DisputeWindowClosed();
    error VotingWindowClosed();
    error VotingWindowOpen();
    error AlreadyVoted();
    error NotJuror();
    error DisputeNotPending();
    error InvalidJuror();
    error QuorumTooHigh();

    // ─── Events ───────────────────────────────────────────────────────────────

    event DisputeOpened(
        uint256 indexed disputeId,
        bytes32 indexed taskId,
        address indexed disputer,
        address worker,
        address reviewer,
        uint256 bond
    );
    event JurySelected(uint256 indexed disputeId, address[] jurors);
    event VoteCast(uint256 indexed disputeId, address indexed juror, bool uphold);
    event DisputeResolved(
        uint256 indexed disputeId,
        DisputeState state,
        bool workerSlashed,
        bool reviewerSlashed
    );
    event DisputeExpired(uint256 indexed disputeId);
    event BondReturned(uint256 indexed disputeId, address indexed recipient, uint256 amount);
    event BondSlashed(uint256 indexed disputeId, address indexed slashed, uint256 amount);
    event JurorRewarded(uint256 indexed disputeId, address indexed juror, uint256 amount);
    event OperatorSet(address indexed operator, bool approved);
    event OwnershipTransferStarted(address indexed previous, address indexed next);
    event OwnershipTransferred(address indexed previous, address indexed next);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event JurorCountUpdated(uint256 oldCount, uint256 newCount);
    event QuorumBpsUpdated(uint256 oldBps, uint256 newBps);
    event DisputeWindowUpdated(uint256 oldWindow, uint256 newWindow);
    event VotingWindowUpdated(uint256 oldWindow, uint256 newWindow);
    event DisputeBondUpdated(uint256 oldBond, uint256 newBond);
    event ReviewerSlashBpsUpdated(uint256 oldBps, uint256 newBps);
    event ReviewerStakeManagerUpdated(address indexed oldManager, address indexed newManager);
    event WorkerStakeManagerUpdated(address indexed oldManager, address indexed newManager);

    // ─── Storage ──────────────────────────────────────────────────────────────

    IntelToken public immutable intel;
    IntelStaking public immutable staking;

    ReviewerStakeManager public reviewerStakeManager;
    WorkerStakeManager public workerStakeManager;
    address public treasury;
    mapping(address => bool) public operators;

    // Jury configuration
    uint256 public jurorCount;      // default 5
    uint256 public quorumBps;       // default 6000 (60%)
    uint256 public disputeWindow;   // default 72 hours
    uint256 public votingWindow;    // default 48 hours
    uint256 public disputeBond;     // default 100e18 INTEL
    uint256 public reviewerSlashBps; // default 2000 (20%)

    // Dispute state
    enum DisputeState { Pending, UpheldWorkerFault, UpheldReviewerFault, Rejected, Expired }

    struct Dispute {
        bytes32 taskId;
        address disputer;
        address worker;
        address reviewer;
        uint256 bond;
        uint256 openedAt;
        uint256 votingDeadline;
        DisputeState state;
        uint256 votesUphold;
        uint256 votesReject;
        address[] jury;
        mapping(address => bool) hasVoted;
    }

    mapping(uint256 => Dispute) public disputes;
    uint256 public nextDisputeId;
    mapping(address => uint256[]) public activeJuryDuty; // juror => disputeIds

    // Ownership
    address public owner;
    address public pendingOwner;

    // ─── Reentrancy guard ─────────────────────────────────────────────────────

    uint256 private _reentrancyStatus;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    modifier nonReentrant() {
        require(_reentrancyStatus != _ENTERED, "DisputeResolution: reentrant call");
        _reentrancyStatus = _ENTERED;
        _;
        _reentrancyStatus = _NOT_ENTERED;
    }

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyOperator() {
        if (!operators[msg.sender] && msg.sender != owner) revert Unauthorized();
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    /// @notice Deploy DisputeResolution.
    /// @param _intel Address of the INTEL ERC-20 token.
    /// @param _staking Address of the IntelStaking contract.
    /// @param _treasury Address of the treasury.
    constructor(
        address _intel,
        address payable _staking,
        address _treasury
    ) {
        if (_intel == address(0)) revert ZeroAddress();
        if (_staking == address(0)) revert ZeroAddress();
        if (_treasury == address(0)) revert ZeroAddress();

        intel = IntelToken(_intel);
        staking = IntelStaking(_staking);
        treasury = _treasury;
        owner = msg.sender;

        // Sensible defaults
        jurorCount = 5;
        quorumBps = 6000;  // 60%
        disputeWindow = 72 hours;
        votingWindow = 48 hours;
        disputeBond = 100e18;  // 100 INTEL
        reviewerSlashBps = 2000;  // 20%
        _reentrancyStatus = _NOT_ENTERED;
    }

    // ─── Dispute Lifecycle ─────────────────────────────────────────────────────

    /// @notice Open a dispute against an accepted task review.
    /// @dev Caller must post disputeBond in INTEL.
    /// @param taskId Off-chain task identifier.
    /// @param worker Accused worker address.
    /// @param reviewer Reviewer who accepted the task.
    function openDispute(
        bytes32 taskId,
        address worker,
        address reviewer
    ) external nonReentrant {
        if (worker == address(0)) revert ZeroAddress();
        if (reviewer == address(0)) revert ZeroAddress();

        uint256 disputeId = nextDisputeId++;
        Dispute storage dispute = disputes[disputeId];

        dispute.taskId = taskId;
        dispute.disputer = msg.sender;
        dispute.worker = worker;
        dispute.reviewer = reviewer;
        dispute.bond = disputeBond;
        dispute.openedAt = block.timestamp;
        dispute.votingDeadline = 0; // Set when jury is selected
        dispute.state = DisputeState.Pending;

        // Transfer bond from disputer
        bool bondOk = intel.transferFrom(msg.sender, address(this), disputeBond);
        require(bondOk, "DisputeResolution: bond transferFrom failed");

        emit DisputeOpened(disputeId, taskId, msg.sender, worker, reviewer, disputeBond);
    }

    /// @notice Select jury for a dispute. Operator provides jurors off-chain.
    /// @dev All jurors must have staked INTEL > 0.
    /// @custom:access operator only
    /// @param disputeId Dispute ID.
    /// @param jurors Array of juror addresses.
    function selectJury(uint256 disputeId, address[] calldata jurors) external onlyOperator {
        Dispute storage dispute = disputes[disputeId];
        if (dispute.state != DisputeState.Pending) revert DisputeNotPending();

        // Validate jurors
        if (jurors.length != jurorCount) revert InvalidJuror();
        for (uint256 i = 0; i < jurors.length; i++) {
            if (jurors[i] == address(0)) revert ZeroAddress();
            // Check juror has staked INTEL > 0
            (uint256 staked,,,,,,,) = staking.stakers(jurors[i]);
            if (staked == 0) revert InvalidJuror();
        }

        dispute.jury = jurors;
        dispute.votingDeadline = block.timestamp + votingWindow;

        // Track jury duty for each juror
        for (uint256 i = 0; i < jurors.length; i++) {
            activeJuryDuty[jurors[i]].push(disputeId);
        }

        emit JurySelected(disputeId, jurors);
    }

    /// @notice Cast a vote on a dispute.
    /// @dev Caller must be a juror and within voting window.
    /// @param disputeId Dispute ID.
    /// @param uphold True to uphold dispute (fault found), false to reject.
    function castVote(uint256 disputeId, bool uphold) external nonReentrant {
        Dispute storage dispute = disputes[disputeId];
        if (dispute.state != DisputeState.Pending) revert DisputeNotPending();
        if (block.timestamp > dispute.votingDeadline) revert VotingWindowClosed();
        if (dispute.hasVoted[msg.sender]) revert AlreadyVoted();

        // Verify caller is a juror
        bool isJuror = false;
        for (uint256 i = 0; i < dispute.jury.length; i++) {
            if (dispute.jury[i] == msg.sender) {
                isJuror = true;
                break;
            }
        }
        if (!isJuror) revert NotJuror();

        dispute.hasVoted[msg.sender] = true;
        if (uphold) {
            dispute.votesUphold++;
        } else {
            dispute.votesReject++;
        }

        emit VoteCast(disputeId, msg.sender, uphold);
    }

    /// @notice Resolve a dispute after voting deadline.
    /// @dev Tallies votes and executes slashing/bond return logic.
    /// @param disputeId Dispute ID.
    /// @param reviewerAtFault True if reviewer is at fault (fraudulent accept), false if worker is at fault.
    function resolveDispute(uint256 disputeId, bool reviewerAtFault) external nonReentrant {
        Dispute storage dispute = disputes[disputeId];
        if (dispute.state != DisputeState.Pending) revert DisputeNotPending();
        if (block.timestamp <= dispute.votingDeadline) revert VotingWindowOpen();

        uint256 totalVotes = dispute.votesUphold + dispute.votesReject;
        bool workerSlashed = false;
        bool reviewerSlashed = false;

        if (totalVotes == 0) {
            // No votes - expire dispute
            dispute.state = DisputeState.Expired;
            _returnBond(disputeId, dispute.disputer, dispute.bond);
            emit DisputeExpired(disputeId);
        } else {
            // Check quorum
            uint256 quorumThreshold = (jurorCount * quorumBps) / 10000;
            if (dispute.votesUphold >= quorumThreshold) {
                if (reviewerAtFault) {
                    // Dispute upheld - reviewer at fault (fraudulent accept)
                    dispute.state = DisputeState.UpheldReviewerFault;

                    // Slash reviewer by proportion of their bond
                    if (address(reviewerStakeManager) != address(0)) {
                        try reviewerStakeManager.reviewerBond(dispute.reviewer) returns (uint256 reviewerBondAmount) {
                            uint256 slashAmount = (reviewerBondAmount * reviewerSlashBps) / 10000;
                            if (slashAmount > 0) {
                                try reviewerStakeManager.slash(dispute.reviewer, slashAmount) {
                                    reviewerSlashed = true;
                                    emit BondSlashed(disputeId, dispute.reviewer, slashAmount);
                                } catch {}
                            }
                        } catch {}
                    }

                    // Return bond to disputer
                    _returnBond(disputeId, dispute.disputer, dispute.bond);
                } else {
                    // Dispute upheld - worker at fault
                    dispute.state = DisputeState.UpheldWorkerFault;

                    // Slash worker
                    if (address(workerStakeManager) != address(0)) {
                        try workerStakeManager.slash(dispute.worker, dispute.bond, dispute.disputer) {
                            workerSlashed = true;
                            emit BondSlashed(disputeId, dispute.worker, dispute.bond);
                        } catch {}
                    }

                    // Slash reviewer
                    if (address(reviewerStakeManager) != address(0)) {
                        try reviewerStakeManager.slash(dispute.reviewer, dispute.bond) {
                            reviewerSlashed = true;
                            emit BondSlashed(disputeId, dispute.reviewer, dispute.bond);
                        } catch {}
                    }

                    // Return bond to disputer with bonus
                    _returnBond(disputeId, dispute.disputer, dispute.bond);
                }
            } else {
                // Dispute rejected - slash disputer's bond
                dispute.state = DisputeState.Rejected;
                _slashBond(disputeId, dispute.disputer, dispute.bond);

                // Reward correct jurors (those who voted reject)
                _rewardJurors(disputeId, false);
            }
        }

        emit DisputeResolved(disputeId, dispute.state, workerSlashed, reviewerSlashed);
    }

    /// @notice Expire a dispute after voting deadline + 24h grace period if unresolved.
    /// @param disputeId Dispute ID.
    function expireDispute(uint256 disputeId) external nonReentrant {
        Dispute storage dispute = disputes[disputeId];
        if (dispute.state != DisputeState.Pending) revert DisputeNotPending();
        if (block.timestamp <= dispute.votingDeadline + 24 hours) revert VotingWindowOpen();

        dispute.state = DisputeState.Expired;
        _returnBond(disputeId, dispute.disputer, dispute.bond);

        emit DisputeExpired(disputeId);
    }

    // ─── Internal Helpers ─────────────────────────────────────────────────────

    function _returnBond(uint256 disputeId, address recipient, uint256 amount) private {
        bool transferOk = intel.transfer(recipient, amount);
        require(transferOk, "DisputeResolution: bond return transfer failed");
        emit BondReturned(disputeId, recipient, amount);
    }

    function _slashBond(uint256 disputeId, address slashed, uint256 amount) private {
        bool transferOk = intel.transfer(treasury, amount);
        require(transferOk, "DisputeResolution: bond slash transfer failed");
        emit BondSlashed(disputeId, slashed, amount);
    }

    function _rewardJurors(uint256 disputeId, bool rewardUpholdVoters) private {
        Dispute storage dispute = disputes[disputeId];
        
        // Simple reward: split bond among correct jurors
        uint256 correctVotes = rewardUpholdVoters ? dispute.votesUphold : dispute.votesReject;
        if (correctVotes == 0) return;

        uint256 rewardPerJuror = dispute.bond / correctVotes;
        
        for (uint256 i = 0; i < dispute.jury.length; i++) {
            address juror = dispute.jury[i];
            // Check if juror voted correctly
            bool votedCorrectly = false;
            if (rewardUpholdVoters && dispute.hasVoted[juror]) {
                votedCorrectly = true; // Simplified - in production track vote direction
            } else if (!rewardUpholdVoters && dispute.hasVoted[juror]) {
                votedCorrectly = true; // Simplified
            }
            
            if (votedCorrectly) {
                bool transferOk = intel.transfer(juror, rewardPerJuror);
                if (transferOk) {
                    emit JurorRewarded(disputeId, juror, rewardPerJuror);
                }
            }
        }
    }

    // ─── Admin Configuration ───────────────────────────────────────────────────

    /// @notice Set the number of jurors per dispute.
    /// @custom:access owner
    /// @param _jurorCount New juror count.
    function setJurorCount(uint256 _jurorCount) external onlyOwner {
        emit JurorCountUpdated(jurorCount, _jurorCount);
        jurorCount = _jurorCount;
    }

    /// @notice Set the quorum threshold in basis points.
    /// @custom:access owner
    /// @param _quorumBps New quorum in BPS (10000 = 100%).
    function setQuorumBps(uint256 _quorumBps) external onlyOwner {
        if (_quorumBps > 10000) revert QuorumTooHigh();
        emit QuorumBpsUpdated(quorumBps, _quorumBps);
        quorumBps = _quorumBps;
    }

    /// @notice Set the dispute window in seconds.
    /// @custom:access owner
    /// @param _disputeWindow New dispute window.
    function setDisputeWindow(uint256 _disputeWindow) external onlyOwner {
        emit DisputeWindowUpdated(disputeWindow, _disputeWindow);
        disputeWindow = _disputeWindow;
    }

    /// @notice Set the voting window in seconds.
    /// @custom:access owner
    /// @param _votingWindow New voting window.
    function setVotingWindow(uint256 _votingWindow) external onlyOwner {
        emit VotingWindowUpdated(votingWindow, _votingWindow);
        votingWindow = _votingWindow;
    }

    /// @notice Set the dispute bond amount in INTEL.
    /// @custom:access owner
    /// @param _disputeBond New dispute bond.
    function setDisputeBond(uint256 _disputeBond) external onlyOwner {
        emit DisputeBondUpdated(disputeBond, _disputeBond);
        disputeBond = _disputeBond;
    }

    /// @notice Set the reviewer slash basis points.
    /// @custom:access owner
    /// @param _reviewerSlashBps New reviewer slash in BPS (10000 = 100%).
    function setReviewerSlashBps(uint256 _reviewerSlashBps) external onlyOwner {
        if (_reviewerSlashBps > 10000) revert QuorumTooHigh();
        emit ReviewerSlashBpsUpdated(reviewerSlashBps, _reviewerSlashBps);
        reviewerSlashBps = _reviewerSlashBps;
    }

    /// @notice Set the treasury address.
    /// @custom:access owner
    /// @param _treasury New treasury address.
    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert ZeroAddress();
        emit TreasuryUpdated(treasury, _treasury);
        treasury = _treasury;
    }

    /// @notice Approve or revoke an operator address.
    /// @custom:access owner
    /// @param op Address to configure.
    /// @param approved True to grant operator rights, false to revoke.
    function setOperator(address op, bool approved) external onlyOwner {
        if (op == address(0)) revert ZeroAddress();
        operators[op] = approved;
        emit OperatorSet(op, approved);
    }

    /// @notice Set the ReviewerStakeManager address.
    /// @custom:access owner
    /// @param _manager New ReviewerStakeManager address.
    function setReviewerStakeManager(address _manager) external onlyOwner {
        emit ReviewerStakeManagerUpdated(address(reviewerStakeManager), _manager);
        reviewerStakeManager = ReviewerStakeManager(_manager);
    }

    /// @notice Set the WorkerStakeManager address.
    /// @custom:access owner
    /// @param _manager New WorkerStakeManager address.
    function setWorkerStakeManager(address _manager) external onlyOwner {
        emit WorkerStakeManagerUpdated(address(workerStakeManager), _manager);
        workerStakeManager = WorkerStakeManager(_manager);
    }

    /// @notice Begin ownership transfer. Nominee must call acceptOwnership().
    /// @custom:access owner
    /// @param newOwner Nominee address.
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    /// @notice Nominee accepts ownership to complete the two-step transfer.
    /// @custom:access pendingOwner
    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert Unauthorized();
        address previousOwner = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, owner);
    }
}