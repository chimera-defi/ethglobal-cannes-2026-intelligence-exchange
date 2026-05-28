import { parseAbi } from 'viem';

export const intelTokenAbi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function totalSupply() view returns (uint256)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
]);

export const intelStakingAbi = parseAbi([
  'function stake(uint256 amount)',
  'function requestUnstake(uint256 amount)',
  'function unstake()',
  'function claimYield() returns (uint256 claimed)',
  'function pendingYield(address wallet) view returns (uint256)',
  'function mintAllowance(address wallet) view returns (uint256)',
  'function totalStaked() view returns (uint256)',
  'function currentEpoch() view returns (uint256)',
  'function epochLength() view returns (uint256)',
  'function cooldown() view returns (uint256)',
  'function stakers(address) view returns (uint256 staked, uint256 stakedAt, uint256 pendingUnstake, uint256 unstakeAvailableAt, uint256 yieldDebt, uint256 epochAllowanceUsed, uint256 lastEpoch)',
  'event Staked(address indexed staker, uint256 amount, uint256 newTotal, uint256 epoch)',
  'event UnstakeRequested(address indexed staker, uint256 amount, uint256 availableAt)',
  'event Unstaked(address indexed staker, uint256 amount)',
  'event YieldClaimed(address indexed staker, uint256 amount, uint256 epoch)',
]);
