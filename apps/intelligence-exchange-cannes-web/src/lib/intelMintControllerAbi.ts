import { parseAbi } from 'viem';

export const intelMintControllerAbi = parseAbi([
  'function mintPrice() view returns (uint256)',
  'function quoteMint(uint256 intelAmount) view returns (uint256 cost)',
  'function executeMint(address to, uint256 intelAmount, uint256 maxPrice) payable',
  'function selfMint(uint256 intelAmount, uint256 maxPrice) payable',
  'function executeMintERC20(address to, uint256 intelAmount, address paymentToken, uint256 paymentAmount, uint256 maxPrice)',
  'function updateTWAP(uint256 newTWAP)',
  'function updateUtilization(uint256 pendingVolume, uint256 settledCapacity)',
  'function twap() view returns (uint256)',
  'function floorPrice() view returns (uint256)',
  'function premiumBps() view returns (uint256)',
  'function utilizationMultiplierBps() view returns (uint256)',
  'function polAddress() view returns (address)',
  'function treasuryAddress() view returns (address)',
  'event MintExecuted(address indexed to, uint256 intelMinted, uint256 pricePaid, uint256 polShare, uint256 stakerShare, uint256 treasuryShare, uint256 epoch)',
]);
