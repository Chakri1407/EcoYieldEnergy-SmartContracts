// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.20;

// import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
// import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
// import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
// import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
// import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
// import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
// import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
// import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

// /**
//  * @title EcoYield Staking Contract
//  * @dev Allows users to stake EYE tokens in different vaults and earn USDC rewards
//  * with APY boosts based on NFT ownership and lock periods
//  */
// contract EcoYieldStaking is 
//     Initializable, 
//     OwnableUpgradeable, 
//     PausableUpgradeable, 
//     ReentrancyGuardUpgradeable,
//     UUPSUpgradeable 
// {
//     using SafeERC20Upgradeable for IERC20Upgradeable;

//     // Structs
//     struct StakingVault {
//         uint256 id;
//         string name;
//         uint256 lockPeriod; // Duration in seconds
//         uint256 baseAPY;    // Basis points (e.g., 800 = 8%)
//         uint256 totalStaked;
//         bool active;
//     }
    
//     struct UserStake {
//         uint256 amount;
//         uint256 startTime;
//         uint256 endLockTime;
//         uint256 lastRewardCalculationTime;
//         uint256 pendingRewards;
//         bool unstaked;
//         bool autoRestake;   // Flag to indicate if stake should be automatically restaked
//     }
    
//     struct NFTBoostTier {
//         string name;
//         uint256 boostAmount; // Basis points (e.g., 200 = 2%)
//     }

//     // State variables
//     IERC20Upgradeable public eyeToken;    // EYE token
//     IERC20Upgradeable public rewardToken; // USDC token for rewards
//     IERC721Upgradeable public boostNFT;   // NFT used for APY boosts
    
//     mapping(uint256 => StakingVault) public vaults;
//     uint256 public vaultCount;
    
//     mapping(uint256 => mapping(address => UserStake[])) public userStakes; // vaultId => user => stakes
//     mapping(uint256 => uint256) public nftBoosts; // NFT ID => boost amount (in basis points)
    
//     // NFT tier mapping
//     mapping(uint256 => NFTBoostTier) public nftTiers; // Tier ID => Tier details
//     mapping(uint256 => uint256) public nftTierMap;    // NFT ID => Tier ID

//     // Reward distribution settings
//     uint256 public rewardDistributionFrequency; // Default: Quarterly (in seconds)
//     uint256 public lastRewardDistribution;      // Timestamp of the last reward distribution
//     address public adminMultisig;               // DAO multisig for fund injection
    
//     // Events
//     event Staked(address indexed user, uint256 vaultId, uint256 amount, uint256 lockEndTime);
//     event Unstaked(address indexed user, uint256 vaultId, uint256 stakeIndex, uint256 amount);
//     event RewardsClaimed(address indexed user, uint256 vaultId, uint256 stakeIndex, uint256 amount);
//     event RewardsInjected(uint256 totalRewardAmount);
//     event VaultCreated(uint256 vaultId, string name, uint256 lockPeriod, uint256 baseAPY);
//     event VaultUpdated(uint256 vaultId, uint256 baseAPY, bool active);
//     event NFTBoostSet(uint256 nftId, uint256 tierId, uint256 boostAmount);
//     event NFTTierCreated(uint256 tierId, string name, uint256 boostAmount);
//     event Restaked(address indexed user, uint256 vaultId, uint256 stakeIndex, uint256 amount, uint256 newLockEndTime);

//     /// @custom:oz-upgrades-unsafe-allow constructor
//     constructor() {
//         _disableInitializers();
//     }

//     /**
//      * @dev Initialize the contract with initial values
//      */
//     function initialize(
//         address _eyeToken,
//         address _rewardToken,
//         address _boostNFT,
//         address _adminMultisig
//     ) public initializer {
//         __Ownable_init(msg.sender);
//         __Pausable_init();
//         __ReentrancyGuard_init();
//         __UUPSUpgradeable_init();
        
//         eyeToken = IERC20Upgradeable(_eyeToken);
//         rewardToken = IERC20Upgradeable(_rewardToken);
//         boostNFT = IERC721Upgradeable(_boostNFT);
//         adminMultisig = _adminMultisig;
        
//         // Default to quarterly rewards (approximately 90 days)
//         rewardDistributionFrequency = 90 days;
//         lastRewardDistribution = block.timestamp;
        
//         // Create default NFT tiers
//         _createNFTTier(1, "Common", 0);      // No bonus
//         _createNFTTier(2, "Rare", 100);      // +1% APY
//         _createNFTTier(3, "Legendary", 500); // +5% APY
//         _createNFTTier(4, "Guardian", 200);  // +2% APY
//         _createNFTTier(5, "Genesis", 400);   // +4% APY
        
//         // Create initial vaults
//         _createVault("3-Month Vault", 90 days, 800);  // 8% APY
//         _createVault("6-Month Vault", 180 days, 1200); // 12% APY
//         _createVault("12-Month Vault", 365 days, 1500); // 15% APY
//     }
    
//     /**
//      * @dev Required for UUPS upgradeable contracts
//      */
//     function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

//     /**
//      * @dev Create a new staking vault
//      */
//     function createVault(
//         string memory _name,
//         uint256 _lockPeriod,
//         uint256 _baseAPY
//     ) external onlyOwner {
//         _createVault(_name, _lockPeriod, _baseAPY);
//     }
    
//     /**
//      * @dev Internal function to create a new vault
//      */
//     function _createVault(
//         string memory _name,
//         uint256 _lockPeriod,
//         uint256 _baseAPY
//     ) internal {
//         uint256 newVaultId = vaultCount;
//         vaults[newVaultId] = StakingVault({
//             id: newVaultId,
//             name: _name,
//             lockPeriod: _lockPeriod,
//             baseAPY: _baseAPY,
//             totalStaked: 0,
//             active: true
//         });
        
//         vaultCount++;
//         emit VaultCreated(newVaultId, _name, _lockPeriod, _baseAPY);
//     }

//     /**
//      * @dev Update an existing vault's parameters
//      */
//     function updateVault(
//         uint256 _vaultId,
//         uint256 _baseAPY,
//         bool _active
//     ) external onlyOwner {
//         require(_vaultId < vaultCount, "Invalid vault ID");
        
//         StakingVault storage vault = vaults[_vaultId];
//         vault.baseAPY = _baseAPY;
//         vault.active = _active;
        
//         emit VaultUpdated(_vaultId, _baseAPY, _active);
//     }

//     /**
//      * @dev Create a new NFT tier
//      */
//     function createNFTTier(
//         uint256 _tierId,
//         string memory _name,
//         uint256 _boostAmount
//     ) external onlyOwner {
//         _createNFTTier(_tierId, _name, _boostAmount);
//     }
    
//     /**
//      * @dev Internal function to create NFT tier
//      */
//     function _createNFTTier(
//         uint256 _tierId,
//         string memory _name,
//         uint256 _boostAmount
//     ) internal {
//         nftTiers[_tierId] = NFTBoostTier({
//             name: _name,
//             boostAmount: _boostAmount
//         });
        
//         emit NFTTierCreated(_tierId, _name, _boostAmount);
//     }

//     /**
//      * @dev Set NFT boost tier and boost amount for a specific NFT ID
//      */
//     function setNFTBoost(
//         uint256 _nftId,
//         uint256 _tierId,
//         uint256 _boostAmount
//     ) external onlyOwner {
//         require(nftTiers[_tierId].boostAmount > 0 || _tierId == 1, "Invalid tier ID");
        
//         nftTierMap[_nftId] = _tierId;
//         nftBoosts[_nftId] = _boostAmount;
        
//         emit NFTBoostSet(_nftId, _tierId, _boostAmount);
//     }
    
//     /**
//      * @dev Batch set NFT boosts for multiple NFTs with the same tier and boost
//      */
//     function batchSetNFTBoosts(
//         uint256[] calldata _nftIds,
//         uint256 _tierId,
//         uint256 _boostAmount
//     ) external onlyOwner {
//         require(nftTiers[_tierId].boostAmount > 0 || _tierId == 1, "Invalid tier ID");
        
//         for (uint256 i = 0; i < _nftIds.length; i++) {
//             nftTierMap[_nftIds[i]] = _tierId;
//             nftBoosts[_nftIds[i]] = _boostAmount;
//             emit NFTBoostSet(_nftIds[i], _tierId, _boostAmount);
//         }
//     }

//     /**
//      * @dev Get the highest NFT boost for a user
//      */
//     function getUserBoost(address _user) public view returns (uint256) {
//         uint256 highestBoost = 0;
//         uint256 highestTier = 0;
        
//         // This is a simplified implementation that doesn't scale well
//         // In production, you would need a more efficient way to determine owned NFTs
//         uint256 checkLimit = 1000; // Arbitrary limit for safety
        
//         for (uint256 i = 0; i < checkLimit; i++) {
//             try boostNFT.ownerOf(i) returns (address owner) {
//                 if (owner == _user) {
//                     uint256 currentTier = nftTierMap[i];
//                     uint256 boost = nftBoosts[i];
                    
//                     // Check if this tier is higher than what we've seen
//                     if (currentTier > highestTier) {
//                         highestTier = currentTier;
//                         highestBoost = boost;
//                     } 
//                     // If same tier, take the highest boost
//                     else if (currentTier == highestTier && boost > highestBoost) {
//                         highestBoost = boost;
//                     }
//                 }
//             } catch {
//                 // Skip non-existent NFTs
//             }
//         }
        
//         return highestBoost;
//     }

//     /**
//      * @dev Stake EYE tokens in a specific vault
//      */
//     function stake(uint256 _vaultId, uint256 _amount) external nonReentrant whenNotPaused {
//         return _stake(msg.sender, _vaultId, _amount, false);
//     }

//     /**
//      * @dev Stake EYE tokens with auto-restaking enabled
//      */
//     function stakeWithAutoRestake(uint256 _vaultId, uint256 _amount) external nonReentrant whenNotPaused {
//         return _stake(msg.sender, _vaultId, _amount, true);
//     }
    
//     /**
//      * @dev Internal function to handle staking logic
//      */
//     function _stake(address _user, uint256 _vaultId, uint256 _amount, bool _autoRestake) internal {
//         require(_vaultId < vaultCount, "Invalid vault ID");
//         require(_amount > 0, "Cannot stake zero amount");
//         require(vaults[_vaultId].active, "Vault not active");
        
//         StakingVault storage vault = vaults[_vaultId];
        
//         // Calculate lock end time
//         uint256 lockEndTime = block.timestamp + vault.lockPeriod;
        
//         // Transfer tokens from user to contract
//         eyeToken.safeTransferFrom(_user, address(this), _amount);
        
//         // Create stake record
//         userStakes[_vaultId][_user].push(UserStake({
//             amount: _amount,
//             startTime: block.timestamp,
//             endLockTime: lockEndTime,
//             lastRewardCalculationTime: block.timestamp,
//             pendingRewards: 0,
//             unstaked: false,
//             autoRestake: _autoRestake
//         }));
        
//         // Update vault total
//         vault.totalStaked += _amount;
        
//         emit Staked(_user, _vaultId, _amount, lockEndTime);
//     }

//     /**
//      * @dev Unstake EYE tokens after lock period ends
//      */
//     function unstake(uint256 _vaultId, uint256 _stakeIndex) external nonReentrant {
//         require(_vaultId < vaultCount, "Invalid vault ID");
        
//         UserStake[] storage userStakeList = userStakes[_vaultId][msg.sender];
//         require(_stakeIndex < userStakeList.length, "Invalid stake index");
        
//         UserStake storage userStake = userStakeList[_stakeIndex];
//         require(!userStake.unstaked, "Already unstaked");
//         require(block.timestamp >= userStake.endLockTime, "Lock period not ended");
        
//         // Check if auto-restake is enabled
//         if (userStake.autoRestake) {
//             return _restake(_vaultId, _stakeIndex);
//         }
        
//         // Calculate any pending rewards before unstaking
//         _calculateRewards(_vaultId, msg.sender, _stakeIndex);
        
//         // Mark as unstaked and update vault total
//         userStake.unstaked = true;
//         vaults[_vaultId].totalStaked -= userStake.amount;
        
//         // Transfer tokens back to user
//         eyeToken.safeTransfer(msg.sender, userStake.amount);
        
//         emit Unstaked(msg.sender, _vaultId, _stakeIndex, userStake.amount);
//     }

//     /**
//      * @dev Set auto-restake flag for an existing stake
//      */
//     function setAutoRestake(uint256 _vaultId, uint256 _stakeIndex, bool _autoRestake) external nonReentrant {
//         require(_vaultId < vaultCount, "Invalid vault ID");
        
//         UserStake[] storage userStakeList = userStakes[_vaultId][msg.sender];
//         require(_stakeIndex < userStakeList.length, "Invalid stake index");
        
//         UserStake storage userStake = userStakeList[_stakeIndex];
//         require(!userStake.unstaked, "Already unstaked");
        
//         // Update auto-restake flag
//         userStake.autoRestake = _autoRestake;
//     }
    
//     /**
//      * @dev Manually restake tokens from an existing stake that has completed its lock period
//      */
//     function restake(uint256 _vaultId, uint256 _stakeIndex) external nonReentrant {
//         require(_vaultId < vaultCount, "Invalid vault ID");
        
//         UserStake[] storage userStakeList = userStakes[_vaultId][msg.sender];
//         require(_stakeIndex < userStakeList.length, "Invalid stake index");
        
//         UserStake storage userStake = userStakeList[_stakeIndex];
//         require(!userStake.unstaked, "Already unstaked");
//         require(block.timestamp >= userStake.endLockTime, "Lock period not ended");
        
//         _restake(_vaultId, _stakeIndex);
//     }
    
//     /**
//      * @dev Internal function to handle restaking logic
//      */
//     function _restake(uint256 _vaultId, uint256 _stakeIndex) internal {
//         UserStake storage userStake = userStakes[_vaultId][msg.sender][_stakeIndex];
//         StakingVault storage vault = vaults[_vaultId];
        
//         // Calculate rewards up to this point
//         _calculateRewards(_vaultId, msg.sender, _stakeIndex);
        
//         // Get the amount to restake
//         uint256 amountToRestake = userStake.amount;
        
//         // Mark current stake as unstaked
//         userStake.unstaked = true;
        
//         // Create new stake with same parameters
//         uint256 newLockEndTime = block.timestamp + vault.lockPeriod;
        
//         // Create a new stake record with the same amount
//         userStakes[_vaultId][msg.sender].push(UserStake({
//             amount: amountToRestake,
//             startTime: block.timestamp,
//             endLockTime: newLockEndTime,
//             lastRewardCalculationTime: block.timestamp,
//             pendingRewards: 0,
//             unstaked: false,
//             autoRestake: userStake.autoRestake // Maintain the same auto-restake setting
//         }));
        
//         emit Restaked(msg.sender, _vaultId, _stakeIndex, amountToRestake, newLockEndTime);
//     }

//     /**
//      * @dev Claim pending rewards
//      */
//     function claimRewards(uint256 _vaultId, uint256 _stakeIndex) external nonReentrant {
//         require(_vaultId < vaultCount, "Invalid vault ID");
        
//         UserStake[] storage userStakeList = userStakes[_vaultId][msg.sender];
//         require(_stakeIndex < userStakeList.length, "Invalid stake index");
        
//         UserStake storage userStake = userStakeList[_stakeIndex];
//         require(!userStake.unstaked || block.timestamp >= userStake.endLockTime, "Cannot claim before lock ends");
        
//         // Calculate any pending rewards
//         _calculateRewards(_vaultId, msg.sender, _stakeIndex);
        
//         uint256 rewardAmount = userStake.pendingRewards;
//         require(rewardAmount > 0, "No rewards to claim");
        
//         // Reset pending rewards
//         userStake.pendingRewards = 0;
//         userStake.lastRewardCalculationTime = block.timestamp;
        
//         // Transfer rewards to user
//         rewardToken.safeTransfer(msg.sender, rewardAmount);
        
//         emit RewardsClaimed(msg.sender, _vaultId, _stakeIndex, rewardAmount);
//     }

//     /**
//      * @dev Internal function to calculate rewards for a stake
//      */
//     function _calculateRewards(uint256 _vaultId, address _user, uint256 _stakeIndex) internal {
//         UserStake storage userStake = userStakes[_vaultId][_user][_stakeIndex];
        
//         // Skip if already unstaked or no time passed
//         if (userStake.unstaked || userStake.lastRewardCalculationTime >= block.timestamp) {
//             return;
//         }
        
//         // Get APY with boost
//         uint256 effectiveAPY = _getEffectiveAPY(_vaultId, _user);
        
//         // Calculate time period for rewards (in seconds)
//         uint256 startTime = userStake.lastRewardCalculationTime;
//         uint256 endTime = block.timestamp;
        
//         // Cap end time to lock end time if unstaking after lock period
//         if (userStake.unstaked && endTime > userStake.endLockTime) {
//             endTime = userStake.endLockTime;
//         }
        
//         uint256 stakeDuration = endTime - startTime;
        
//         // Calculate rewards: principal * (APY/100) * (stakeDuration / secondsInYear)
//         uint256 yearInSeconds = 365 days;
//         uint256 rewardAmount = (userStake.amount * effectiveAPY * stakeDuration) / (10000 * yearInSeconds);
        
//         // Add to pending rewards
//         userStake.pendingRewards += rewardAmount;
//         userStake.lastRewardCalculationTime = block.timestamp;
//     }

//     /**
//      * @dev Calculate rewards for early unstake (applies reduced APY)
//      */
//     function _calculateEarlyUnstakeRewards(uint256 _vaultId, address _user, uint256 _stakeIndex) internal {
//         UserStake storage userStake = userStakes[_vaultId][_user][_stakeIndex];
//         StakingVault storage vault = vaults[_vaultId];
        
//         // Calculate actual staking duration
//         uint256 actualDuration = block.timestamp - userStake.startTime;
        
//         // Find the appropriate reduced APY based on actual duration
//         uint256 reducedAPY;
        
//         // This is a simple implementation - in production you might want more granular steps
//         // Example: If staked in 6-month vault but only stayed for 3 months, use 3-month vault APY
//         if (actualDuration >= 365 days) {
//             reducedAPY = 1500; // 15% APY for 12+ months
//         } else if (actualDuration >= 180 days) {
//             reducedAPY = 1200; // 12% APY for 6+ months
//         } else if (actualDuration >= 90 days) {
//             reducedAPY = 800;  // 8% APY for 3+ months
//         } else {
//             reducedAPY = 500;  // 5% APY for less than 3 months
//         }
        
//         // Still apply NFT boost
//         uint256 nftBoost = getUserBoost(_user);
//         uint256 effectiveAPY = reducedAPY + nftBoost;
        
//         // Calculate rewards using the reduced APY
//         uint256 yearInSeconds = 365 days;
//         uint256 rewardAmount = (userStake.amount * effectiveAPY * actualDuration) / (10000 * yearInSeconds);
        
//         // Add to pending rewards
//         userStake.pendingRewards += rewardAmount;
//         userStake.lastRewardCalculationTime = block.timestamp;
//     }

//     /**
//      * @dev Get effective APY with NFT boost applied
//      */
//     function _getEffectiveAPY(uint256 _vaultId, address _user) internal view returns (uint256) {
//         uint256 baseAPY = vaults[_vaultId].baseAPY;
//         uint256 nftBoost = getUserBoost(_user);
        
//         return baseAPY + nftBoost;
//     }

//     /**
//      * @dev Inject rewards from admin multi-sig (quarterly distribution)
//      */
//     function injectRewards(uint256 _amount) external nonReentrant {
//         require(msg.sender == adminMultisig || msg.sender == owner(), "Only admin can inject rewards");
//         require(_amount > 0, "Amount must be greater than 0");
        
//         // Transfer USDC from admin to contract
//         rewardToken.safeTransferFrom(msg.sender, address(this), _amount);
        
//         // Update last distribution time
//         lastRewardDistribution = block.timestamp;
        
//         emit RewardsInjected(_amount);
//     }

//     /**
//      * @dev Update admin multi-sig address
//      */
//     function setAdminMultisig(address _newAdmin) external onlyOwner {
//         require(_newAdmin != address(0), "Invalid address");
//         adminMultisig = _newAdmin;
//     }

//     /**
//      * @dev Update reward distribution frequency
//      */
//     function setRewardDistributionFrequency(uint256 _frequency) external onlyOwner {
//         rewardDistributionFrequency = _frequency;
//     }

//     /**
//      * @dev Get total number of stakes for a user in a vault
//      */
//     function getUserStakeCount(uint256 _vaultId, address _user) external view returns (uint256) {
//         return userStakes[_vaultId][_user].length;
//     }

//     /**
//      * @dev Get effective APY for user in a specific vault
//      */
//     function getEffectiveAPY(uint256 _vaultId, address _user) external view returns (uint256) {
//         return _getEffectiveAPY(_vaultId, _user);
//     }

//     /**
//      * @dev Pause contract in emergency
//      */
//     function pause() external onlyOwner {
//         _pause();
//     }

//     /**
//      * @dev Unpause contract
//      */
//     function unpause() external onlyOwner {
//         _unpause();
//     }

//     /**
//      * @dev Emergency withdraw any stuck ERC20 tokens (only owner)
//      */
//     function emergencyWithdraw(address _token, uint256 _amount) external onlyOwner {
//         IERC20Upgradeable(_token).safeTransfer(owner(), _amount);
//     }
// }
