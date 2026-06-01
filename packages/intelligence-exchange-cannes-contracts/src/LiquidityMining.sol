// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @custom:security-contact security@iex.cannes

import {IntelToken} from "./IntelToken.sol";

/// @title LiquidityMining
/// @notice MasterChef-style LP mining gauge for INTEL token. Pure yield farming with no cooldown or epoch gating.
contract LiquidityMining {
    error Unauthorized();
    error ZeroAmount();
    error ZeroAddress();
    error InsufficientPool(uint256 requested, uint256 available);
    error NothingToClaim();
    error NoStake();

    event Staked(address indexed miner, uint256 amount, uint256 newTotal);
    event Unstaked(address indexed miner, uint256 amount);
    event RewardsClaimed(address indexed miner, uint256 amount);
    event RewardsDeposited(address indexed depositor, uint256 amount, uint256 newEndTime);
    event RewardRateUpdated(uint256 oldRate, uint256 newRate);
    event EmergencyWithdrawn(address indexed miner, uint256 amount);
    event OperatorSet(address indexed operator, bool approved);
    event OwnershipTransferStarted(address indexed previous, address indexed next);
    event OwnershipTransferred(address indexed previous, address indexed next);

    struct MinerInfo {
        uint256 staked;
        uint256 rewardDebt;
    }

    IntelToken public immutable intel;
    address public owner;
    address public pendingOwner;
    mapping(address => bool) public operators;

    uint256 public rewardRate;
    uint256 public pendingRewardRate;
    uint256 public rateChangeAvailableAt;
    uint256 public rewardEndTime;
    uint256 public accRewardPerShare;
    uint256 public lastUpdateTime;
    uint256 public totalStaked;
    uint256 public miningPool;

    mapping(address => MinerInfo) public miners;
    uint256 private constant PRECISION = 1e36;

    uint256 private _reentrancyStatus;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    modifier nonReentrant() {
        require(_reentrancyStatus != _ENTERED, "LiquidityMining: reentrant call");
        _reentrancyStatus = _ENTERED;
        _;
        _reentrancyStatus = _NOT_ENTERED;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyOperator() {
        if (!operators[msg.sender] && msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(address _intel) {
        if (_intel == address(0)) revert ZeroAddress();
        intel = IntelToken(_intel);
        owner = msg.sender;
        _reentrancyStatus = _NOT_ENTERED;
    }

    function stake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _updatePool();

        MinerInfo storage m = miners[msg.sender];
        _settleReward(msg.sender);
        m.staked += amount;
        totalStaked += amount;
        m.rewardDebt = (m.staked * accRewardPerShare) / PRECISION;

        bool stakeOk = intel.transferFrom(msg.sender, address(this), amount);
        require(stakeOk, "LiquidityMining: stake transferFrom failed");

        emit Staked(msg.sender, amount, m.staked);
    }

    function unstake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _updatePool();

        MinerInfo storage m = miners[msg.sender];
        if (m.staked < amount) revert NoStake();
        _settleReward(msg.sender);

        m.staked -= amount;
        totalStaked -= amount;
        m.rewardDebt = (m.staked * accRewardPerShare) / PRECISION;

        bool unstakeOk = intel.transfer(msg.sender, amount);
        require(unstakeOk, "LiquidityMining: unstake transfer failed");

        emit Unstaked(msg.sender, amount);
    }

    function claimRewards() external nonReentrant returns (uint256 claimed) {
        _updatePool();
        claimed = _settleReward(msg.sender);
        if (claimed == 0) revert NothingToClaim();
        emit RewardsClaimed(msg.sender, claimed);
    }

    function pendingReward(address wallet) external view returns (uint256) {
        MinerInfo storage m = miners[wallet];
        if (m.staked == 0) return 0;
        uint256 _accRewardPerShare = accRewardPerShare;
        if (block.timestamp > lastUpdateTime && totalStaked > 0) {
            uint256 elapsed = block.timestamp - lastUpdateTime;
            uint256 timeEnd = elapsed > rewardEndTime - lastUpdateTime ? rewardEndTime - lastUpdateTime : elapsed;
            _accRewardPerShare += (timeEnd * rewardRate * PRECISION) / totalStaked;
        }
        uint256 accumulated = (m.staked * _accRewardPerShare) / PRECISION;
        if (accumulated <= m.rewardDebt) return 0;
        return accumulated - m.rewardDebt;
    }

    function depositRewards(uint256 amount) external onlyOperator nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _updatePool();

        bool depositOk = intel.transferFrom(msg.sender, address(this), amount);
        require(depositOk, "LiquidityMining: depositRewards transferFrom failed");

        miningPool += amount;
        if (rewardRate > 0) {
            uint256 extension = amount / rewardRate;
            if (block.timestamp >= rewardEndTime) {
                rewardEndTime = block.timestamp + extension;
            } else {
                rewardEndTime += extension;
            }
        }

        emit RewardsDeposited(msg.sender, amount, rewardEndTime);
    }

    function setRewardRate(uint256 rate) external onlyOwner {
        _updatePool();
        
        if (rewardEndTime > 0 && block.timestamp < rewardEndTime) {
            // Active mining period - queue change with 2-day timelock
            pendingRewardRate = rate;
            rateChangeAvailableAt = block.timestamp + 2 days;
        } else {
            // Not active or ended - apply immediately
            require(rate > 0 || rewardEndTime == 0, 'rate cannot be zero during active period');
            uint256 oldRate = rewardRate;
            rewardRate = rate;
            emit RewardRateUpdated(oldRate, rate);
        }
    }

    function commitRewardRate() external onlyOwner {
        if (pendingRewardRate == 0) revert ZeroAmount();
        if (block.timestamp < rateChangeAvailableAt) revert Unauthorized();
        
        uint256 oldRate = rewardRate;
        rewardRate = pendingRewardRate;
        pendingRewardRate = 0;
        rateChangeAvailableAt = 0;
        
        emit RewardRateUpdated(oldRate, rewardRate);
    }

    function emergencyWithdraw() external nonReentrant {
        MinerInfo storage m = miners[msg.sender];
        if (m.staked == 0) revert NoStake();

        uint256 amount = m.staked;
        m.staked = 0;
        totalStaked -= amount;
        m.rewardDebt = 0;

        bool withdrawOk = intel.transfer(msg.sender, amount);
        require(withdrawOk, "LiquidityMining: emergencyWithdraw transfer failed");

        emit EmergencyWithdrawn(msg.sender, amount);
    }

    function setOperator(address op, bool approved) external onlyOwner {
        if (op == address(0)) revert ZeroAddress();
        operators[op] = approved;
        emit OperatorSet(op, approved);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert Unauthorized();
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = address(0);
    }

    function _updatePool() internal {
        if (block.timestamp <= lastUpdateTime) return;
        if (totalStaked == 0) {
            lastUpdateTime = block.timestamp;
            return;
        }

        uint256 elapsed = block.timestamp - lastUpdateTime;
        uint256 timeUntilEnd = 0;
        if (block.timestamp < rewardEndTime) {
            timeUntilEnd = rewardEndTime - lastUpdateTime;
        }
        uint256 rewardEnd = elapsed > timeUntilEnd ? timeUntilEnd : elapsed;
        if (rewardEnd == 0 || rewardRate == 0) {
            lastUpdateTime = block.timestamp;
            return;
        }

        uint256 rewards = rewardEnd * rewardRate;
        if (rewards > miningPool) {
            rewards = miningPool;
        }

        require(accRewardPerShare + (rewards * PRECISION) / totalStaked <= type(uint128).max, "accumulator overflow");
        accRewardPerShare += (rewards * PRECISION) / totalStaked;
        miningPool -= rewards;
        lastUpdateTime += rewardEnd;
    }

    function _settleReward(address wallet) internal returns (uint256 claimed) {
        MinerInfo storage m = miners[wallet];
        if (m.staked == 0) return 0;

        uint256 accumulated = (m.staked * accRewardPerShare) / PRECISION;
        if (accumulated > m.rewardDebt) {
            claimed = accumulated - m.rewardDebt;
            if (claimed > miningPool) {
                claimed = miningPool;
            }
            m.rewardDebt = accumulated;
            miningPool -= claimed;
            bool claimOk = intel.transfer(wallet, claimed);
            require(claimOk, "LiquidityMining: reward transfer failed");
        }
    }
}