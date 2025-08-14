// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @title EcoYield Staking Contract (Upgradeable)
 * @notice Handles $EYE token staking with LP token integration for score calculation
 * @dev Implements time-locked staking with multipliers and LP token balance tracking
 */
contract EcoYieldStaking is 
    Initializable, 
    OwnableUpgradeable, 
    ReentrancyGuardUpgradeable, 
    UUPSUpgradeable 
{
    using SafeERC20 for IERC20;
    using Math for uint256;

    // ============ STRUCTS ============

    struct StakeInfo {
        uint256 amount;           // Amount of $EYE staked
        uint256 lockPeriod;       // Lock period in seconds
        uint256 startTime;        // Stake start timestamp
        uint256 multiplier;       // Lock period multiplier (scaled by 1000)
        uint256 lastRewardTime;   // Last reward calculation time
        bool active;              // Whether stake is active
    }

    struct UserRewards {
        uint256 pendingRewards;   // Unclaimed rewards
        uint256 totalClaimed;     // Total rewards claimed
    }

    // ============ CONSTANTS ============

    uint256 public constant MIN_RATIO = 5;      // 5% minimum ratio (EYE Power / LP Tokens)
    uint256 public constant MAX_RATIO = 100;    // 100% maximum ratio
    uint256 public constant RATIO_PRECISION = 100;
    uint256 public constant MULTIPLIER_PRECISION = 1000;
    uint256 public constant SCORE_PRECISION = 1e18;
    uint256 public constant EMISSIONS_RATE = 10; // 10% of total allocation over 48 months
    uint256 public constant VESTING_PERIOD = 48 * 30 days; // 48 months

    // ============ STORAGE ============

    // Lock periods and their multipliers (multiplier * 1000 for precision)
    mapping(uint256 => uint256) public lockMultipliers;

    IERC20 public eyeToken;
    
    // LP Token registry - maps project ID to LP token contract
    mapping(uint256 => IERC20) public lpTokens;
    uint256 public projectCount;

    // User staking data
    mapping(address => StakeInfo[]) public userStakes;
    mapping(address => UserRewards) public userRewards;
    
    // Global staking metrics
    uint256 public totalStaked;
    uint256 public totalRewardPool;
    uint256 public lastDistributionTime;
    uint256 public emissionsStartTime;
    
    // Governance parameters
    uint256 public lpExponent;      // 0.55 * 1000
    uint256 public eyeExponent;     // 0.45 * 1000
    uint256 public rewardDistributionInterval; // Monthly distributions
    
    // Access control for premium project access
    mapping(address => uint256) public userStakeScores;
    mapping(uint256 => mapping(address => bool)) public projectWhitelist;

    // Emergency controls
    bool public emergencyPaused;
    mapping(address => bool) public authorizedCallers;

    // ============ EVENTS ============

    event Staked(address indexed user, uint256 amount, uint256 lockPeriod, uint256 multiplier);
    event Unstaked(address indexed user, uint256 stakeIndex, uint256 amount);
    event RewardsClaimed(address indexed user, uint256 amount);
    event RewardsDistributed(uint256 totalAmount, uint256 timestamp);
    event LPTokenRegistered(uint256 indexed projectId, address lpToken);
    event StakeScoreUpdated(address indexed user, uint256 newScore);
    event BuybackAdded(uint256 amount);
    event EmergencyPaused(bool paused);
    event AuthorizedCallerUpdated(address caller, bool authorized);
    event GovernanceParameterUpdated(string parameter, uint256 oldValue, uint256 newValue);

    // ============ MODIFIERS ============

    modifier notPaused() {
        require(!emergencyPaused, "Contract is paused");
        _;
    }

    modifier onlyAuthorized() {
        require(authorizedCallers[msg.sender] || msg.sender == owner(), "Not authorized");
        _;
    }

    // ============ INITIALIZER ============

    /**
     * @notice Initialize the staking contract
     * @param _eyeToken Address of the $EYE token contract
     */
    function initialize(address _eyeToken) external initializer {
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        eyeToken = IERC20(_eyeToken);
        
        // Initialize lock multipliers
        lockMultipliers[30 days] = 1000;    // 1x multiplier for 1 month
        lockMultipliers[90 days] = 1500;    // 1.5x multiplier for 3 months
        lockMultipliers[180 days] = 2500;   // 2.5x multiplier for 6 months
        lockMultipliers[365 days] = 4000;   // 4x multiplier for 12 months
        
        // Initialize governance parameters
        lpExponent = 550;      // 0.55 * 1000
        eyeExponent = 450;     // 0.45 * 1000
        rewardDistributionInterval = 30 days; // Monthly distributions
        
        emissionsStartTime = block.timestamp;
        lastDistributionTime = block.timestamp;
        
        // Set initial authorized caller
        authorizedCallers[msg.sender] = true;
    }

    // ============ EXTERNAL FUNCTIONS ============

    /**
     * @notice Stake $EYE tokens with specified lock period
     * @param amount Amount of $EYE tokens to stake
     * @param lockPeriod Lock period in seconds
     */
    function stake(uint256 amount, uint256 lockPeriod) external nonReentrant notPaused {
        require(amount > 0, "Amount must be greater than 0");
        require(lockMultipliers[lockPeriod] > 0, "Invalid lock period");

        eyeToken.safeTransferFrom(msg.sender, address(this), amount);

        userStakes[msg.sender].push(StakeInfo({
            amount: amount,
            lockPeriod: lockPeriod,
            startTime: block.timestamp,
            multiplier: lockMultipliers[lockPeriod],
            lastRewardTime: block.timestamp,
            active: true
        }));

        totalStaked += amount;
        _updateStakeScore(msg.sender);

        emit Staked(msg.sender, amount, lockPeriod, lockMultipliers[lockPeriod]);
    }

    /**
     * @notice Unstake tokens after lock period expires
     * @param stakeIndex Index of the stake to unstake
     */
    function unstake(uint256 stakeIndex) external nonReentrant notPaused {
        require(stakeIndex < userStakes[msg.sender].length, "Invalid stake index");
        
        StakeInfo storage stakeInfo = userStakes[msg.sender][stakeIndex];
        require(stakeInfo.active, "Stake not active");
        require(block.timestamp >= stakeInfo.startTime + stakeInfo.lockPeriod, "Lock period not expired");

        uint256 amount = stakeInfo.amount;
        stakeInfo.active = false;
        totalStaked -= amount;

        // Claim pending rewards before unstaking
        _claimPendingRewards(msg.sender, stakeIndex);

        eyeToken.safeTransfer(msg.sender, amount);
        _updateStakeScore(msg.sender);

        emit Unstaked(msg.sender, stakeIndex, amount);
    }

    /**
     * @notice Claim all pending rewards
     */
    function claimRewards() external nonReentrant notPaused {
        _claimAllPendingRewards(msg.sender);
        
        uint256 rewards = userRewards[msg.sender].pendingRewards;
        require(rewards > 0, "No rewards to claim");

        userRewards[msg.sender].pendingRewards = 0;
        userRewards[msg.sender].totalClaimed += rewards;

        eyeToken.safeTransfer(msg.sender, rewards);
        emit RewardsClaimed(msg.sender, rewards);
    }

    /**
     * @notice Add buyback tokens to reward pool (called by protocol)
     * @param amount Amount of $EYE tokens from buybacks
     */
    function addBuybackRewards(uint256 amount) external onlyAuthorized notPaused {
        eyeToken.safeTransferFrom(msg.sender, address(this), amount);
        totalRewardPool += amount;
        emit BuybackAdded(amount);
    }

    /**
     * @notice Register a new LP token for a project
     * @param projectId Unique project identifier
     * @param lpTokenAddress Address of the ERC-3643 LP token contract
     */
    function registerLPToken(uint256 projectId, address lpTokenAddress) external onlyOwner {
        require(lpTokenAddress != address(0), "Invalid LP token address");
        require(address(lpTokens[projectId]) == address(0), "Project already registered");
        
        lpTokens[projectId] = IERC20(lpTokenAddress);
        if (projectId >= projectCount) {
            projectCount = projectId + 1;
        }
        
        emit LPTokenRegistered(projectId, lpTokenAddress);
    }

    /**
     * @notice Distribute monthly rewards to all stakers
     */
    function distributeRewards() external onlyAuthorized notPaused {
        require(block.timestamp >= lastDistributionTime + rewardDistributionInterval, "Too early for distribution");
        
        uint256 emissionAmount = _calculateEmissionRewards();
        uint256 totalDistribution = emissionAmount;
        
        if (totalDistribution > 0) {
            _distributeRewardsProRata(totalDistribution);
            lastDistributionTime = block.timestamp;
            emit RewardsDistributed(totalDistribution, block.timestamp);
        }
    }

    // ============ GOVERNANCE FUNCTIONS ============

    /**
     * @notice Update lock period multiplier
     * @param lockPeriod Lock period in seconds
     * @param multiplier New multiplier (scaled by 1000)
     */
    function updateLockMultiplier(uint256 lockPeriod, uint256 multiplier) external onlyOwner {
        uint256 oldMultiplier = lockMultipliers[lockPeriod];
        lockMultipliers[lockPeriod] = multiplier;
        emit GovernanceParameterUpdated("lockMultiplier", oldMultiplier, multiplier);
    }

    /**
     * @notice Update scoring exponents for LP and EYE tokens
     * @param _lpExponent New LP exponent (scaled by 1000)
     * @param _eyeExponent New EYE exponent (scaled by 1000)
     */
    function updateExponents(uint256 _lpExponent, uint256 _eyeExponent) external onlyOwner {
        require(_lpExponent + _eyeExponent == 1000, "Exponents must sum to 1000");
        
        uint256 oldLpExponent = lpExponent;
        uint256 oldEyeExponent = eyeExponent;
        
        lpExponent = _lpExponent;
        eyeExponent = _eyeExponent;
        
        emit GovernanceParameterUpdated("lpExponent", oldLpExponent, _lpExponent);
        emit GovernanceParameterUpdated("eyeExponent", oldEyeExponent, _eyeExponent);
    }

    /**
     * @notice Update reward distribution interval
     * @param newInterval New distribution interval in seconds
     */
    function updateDistributionInterval(uint256 newInterval) external onlyOwner {
        require(newInterval > 0, "Invalid interval");
        uint256 oldInterval = rewardDistributionInterval;
        rewardDistributionInterval = newInterval;
        emit GovernanceParameterUpdated("distributionInterval", oldInterval, newInterval);
    }

    /**
     * @notice Set authorized caller for protocol functions
     * @param caller Address to authorize/deauthorize
     * @param authorized Whether the caller is authorized
     */
    function setAuthorizedCaller(address caller, bool authorized) external onlyOwner {
        authorizedCallers[caller] = authorized;
        emit AuthorizedCallerUpdated(caller, authorized);
    }

    /**
     * @notice Emergency pause/unpause the contract
     * @param paused Whether to pause the contract
     */
    function setEmergencyPause(bool paused) external onlyOwner {
        emergencyPaused = paused;
        emit EmergencyPaused(paused);
    }

    // ============ VIEW FUNCTIONS ============

    /**
     * @notice Get user's stake score based on LP tokens and EYE power
     * @param user Address of the user
     * @return score Calculated stake score
     */
    function getUserStakeScore(address user) external view returns (uint256 score) {
        return _calculateStakeScore(user);
    }

    /**
     * @notice Get user's total LP token balance across all projects
     * @param user Address of the user
     * @return totalLPBalance Total LP token balance
     */
    function getUserTotalLPBalance(address user) external view returns (uint256 totalLPBalance) {
        for (uint256 i = 0; i < projectCount; i++) {
            if (address(lpTokens[i]) != address(0)) {
                totalLPBalance += lpTokens[i].balanceOf(user);
            }
        }
    }

    /**
     * @notice Get user's total EYE power (staked amount * multipliers)
     * @param user Address of the user
     * @return totalEyePower Total EYE power
     */
    function getUserEyePower(address user) external view returns (uint256 totalEyePower) {
        StakeInfo[] memory stakes = userStakes[user];
        for (uint256 i = 0; i < stakes.length; i++) {
            if (stakes[i].active) {
                totalEyePower += (stakes[i].amount * stakes[i].multiplier) / MULTIPLIER_PRECISION;
            }
        }
    }

    /**
     * @notice Get user's pending rewards
     * @param user Address of the user
     * @return pendingRewards Total pending rewards
     */
    function getUserPendingRewards(address user) external view returns (uint256 pendingRewards) {
        return userRewards[user].pendingRewards;
    }

    /**
     * @notice Get number of active stakes for a user
     * @param user Address of the user
     * @return count Number of stakes
     */
    function getUserStakeCount(address user) external view returns (uint256 count) {
        return userStakes[user].length;
    }

    /**
     * @notice Check if user meets minimum ratio requirement
     * @param user Address of the user
     * @return eligible Whether user is eligible for rewards
     */
    function isUserEligible(address user) external view returns (bool eligible) {
        uint256 lpBalance = this.getUserTotalLPBalance(user);
        if (lpBalance == 0) return false;
        
        uint256 eyePower = this.getUserEyePower(user);
        uint256 ratio = (eyePower * RATIO_PRECISION) / lpBalance;
        
        return ratio >= MIN_RATIO;
    }

    // ============ INTERNAL FUNCTIONS ============

    /**
     * @notice Calculate user's stake score
     * @param user Address of the user
     * @return score Calculated stake score
     */
    function _calculateStakeScore(address user) internal view returns (uint256 score) {
        uint256 lpBalance = 0;
        for (uint256 i = 0; i < projectCount; i++) {
            if (address(lpTokens[i]) != address(0)) {
                lpBalance += lpTokens[i].balanceOf(user);
            }
        }
        
        if (lpBalance == 0) return 0;
        
        uint256 eyePower = 0;
        StakeInfo[] memory stakes = userStakes[user];
        for (uint256 i = 0; i < stakes.length; i++) {
            if (stakes[i].active) {
                eyePower += (stakes[i].amount * stakes[i].multiplier) / MULTIPLIER_PRECISION;
            }
        }
        
        // Check ratio requirements
        uint256 ratio = (eyePower * RATIO_PRECISION) / lpBalance;
        if (ratio < MIN_RATIO) return 0;
        
        // Cap EYE power at 100% of LP balance
        if (ratio > MAX_RATIO) {
            eyePower = lpBalance;
        }
        
        // Calculate score: LP^0.55 * EYE^0.45
        // Using approximation for fractional exponents
        uint256 lpComponent = _pow(lpBalance, lpExponent);
        uint256 eyeComponent = _pow(eyePower, eyeExponent);
        
        score = (lpComponent * eyeComponent) / SCORE_PRECISION;
    }

    /**
     * @notice Update user's stake score
     * @param user Address of the user
     */
    function _updateStakeScore(address user) internal {
        uint256 newScore = _calculateStakeScore(user);
        userStakeScores[user] = newScore;
        emit StakeScoreUpdated(user, newScore);
    }

    /**
     * @notice Claim pending rewards for a specific stake
     * @param user Address of the user
     * @param stakeIndex Index of the stake
     */
    function _claimPendingRewards(address user, uint256 stakeIndex) internal {
        // Implementation for individual stake reward calculation
        // This would calculate rewards based on time staked and user's score
    }

    /**
     * @notice Claim all pending rewards for a user
     * @param user Address of the user
     */
    function _claimAllPendingRewards(address user) internal {
        // Implementation for calculating all pending rewards
        // This would update userRewards[user].pendingRewards
    }

    /**
     * @notice Calculate emission rewards based on vesting schedule
     * @return emissionAmount Amount of tokens to emit
     */
    function _calculateEmissionRewards() internal view returns (uint256 emissionAmount) {
        uint256 timeElapsed = block.timestamp - emissionsStartTime;
        if (timeElapsed > VESTING_PERIOD) {
            return 0; // Emissions period ended
        }
        
        // Linear vesting calculation
        // This would calculate based on 10% of total allocation over 48 months
        return 0; // Placeholder - implement based on total token allocation
    }

    /**
     * @notice Distribute rewards pro-rata to all eligible stakers
     * @param totalAmount Total amount to distribute
     */
    function _distributeRewardsProRata(uint256 totalAmount) internal {
        // Implementation for pro-rata reward distribution
        // This would iterate through all users and distribute based on stake scores
    }

    /**
     * @notice Approximate power function for fractional exponents
     * @param base Base value
     * @param exp Exponent (scaled by 1000)
     * @return result Approximated result
     */
    function _pow(uint256 base, uint256 exp) internal pure returns (uint256 result) {
        // Simplified power approximation for fractional exponents
        // For production, use a proper mathematical library
        if (base == 0) return 0;
        if (exp == 1000) return base; // exp = 1
        
        // Approximate calculation for fractional powers
        // This is a placeholder - implement proper fractional power calculation
        return base; // Simplified for now
    }

    // ============ UPGRADE FUNCTIONS ============

    /**
     * @notice Authorize contract upgrades
     * @param newImplementation Address of new implementation
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    /**
     * @notice Get current implementation version
     * @return version Current version string
     */
    function getVersion() external pure returns (string memory version) {
        return "1.0.0";
    }
} 