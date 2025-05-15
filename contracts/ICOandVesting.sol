// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol"; 
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "./interfaces/IEYE.sol"; 
/**
 * @title EYETokenICOAndVesting
 * @dev Smart contract for EYE token ICO with pre-sale, public sale, and linear vesting
 */
contract EYETokenICOAndVesting is 
    OwnableUpgradeable, 
    UUPSUpgradeable, 
    ReentrancyGuardUpgradeable,
    PausableUpgradeable 
{
    enum SalePhase {
        Inactive,
        PreSale,
        PublicSale,
        Ended
    }

    enum VestingType {
        None,
        PrivateSeed, // 6-month cliff, 18-month linear vesting
        TeamAdvisor  // 12-month cliff, 36-month linear vesting
    }

    struct SaleConfig {
        uint256 tokenPrice; // Price in USD with 18 decimals (e.g., $0.04 = 4 * 10^16)
        uint256 startTime;
        uint256 endTime;
        uint256 hardCap; // Maximum tokens to sell in this phase
        uint256 minPurchase; // Minimum purchase amount in USD
        uint256 maxPurchase; // Maximum purchase amount in USD per address
        uint256 tokensSold;
        bool manualClose; // Can be closed manually before endTime
    }

    struct VestingSchedule {
        uint256 totalAmount;      // Total amount of tokens to be vested
        uint256 cliffDuration;    // Cliff duration in seconds
        uint256 vestingDuration;  // Total vesting duration in seconds
        uint256 startTime;        // Start time of the vesting period
        uint256 released;         // Amount of tokens released so far
        VestingType vestingType;  // Type of vesting schedule
    }

    // Vesting constants
    uint256 private constant PRIVATE_SEED_CLIFF = 300 seconds;  // 5 minutes
    uint256 private constant PRIVATE_SEED_DURATION = 900 seconds; // 15 minutes
    uint256 private constant TEAM_ADVISOR_CLIFF = 300 seconds;  // 5 minutes
    uint256 private constant TEAM_ADVISOR_DURATION = 900 seconds; // 15 minutes

    // Sale phase configuration
    SalePhase public currentPhase;
    mapping(SalePhase => SaleConfig) public saleConfigs;
    
    // Token and funds
    IEYE public eyeToken;
    address public fundReceiverAddress; // Gnosis Safe wallet
    
    // Whitelist
    bytes32 public whitelistMerkleRoot;
    mapping(address => bool) public hasParticipatedInPreSale;
    mapping(address => uint256) public preSaleUsdSpent; // Tracks USD spent per user in pre-sale
    
    // Payment tokens
    IERC20 public usdcToken;
    
    // Price feeds
    AggregatorV3Interface public polUsdPriceFeed;
    AggregatorV3Interface public usdcUsdPriceFeed;
    
    // Vesting
    mapping(address => VestingSchedule) public vestingSchedules;
    
    // Events
    event PhaseChanged(SalePhase phase);
    event TokensPurchased(address indexed buyer, uint256 amount, string paymentMethod, uint256 paymentAmount);
    event WhitelistUpdated(bytes32 merkleRoot);
    event VestingScheduleCreated(address indexed beneficiary, uint256 amount, VestingType vestingType);
    event TokensReleased(address indexed beneficiary, uint256 amount);
    
    /**
     * @dev Disable initializers in the implementation contract
     */
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev Initialize the contract with the EYE token, fund receiver, and price feeds
     */
    function initialize(
        IEYE _eyeToken,
        address _fundReceiver,
        IERC20 _usdcToken,
        AggregatorV3Interface _polUsdPriceFeed,
        AggregatorV3Interface _usdcUsdPriceFeed
    ) public initializer {
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        __Pausable_init();
        
        eyeToken = _eyeToken;
        fundReceiverAddress = _fundReceiver;
        usdcToken = _usdcToken;
        polUsdPriceFeed = _polUsdPriceFeed;
        usdcUsdPriceFeed = _usdcUsdPriceFeed;
        
        // Setup initial sale phase
        currentPhase = SalePhase.Inactive;
        
        uint256 totalTokenSupply = 200_000_000 * 1e18; // 200M EYE tokens
        
        // Configure pre-sale
        saleConfigs[SalePhase.PreSale] = SaleConfig({
            tokenPrice: 4 * 10**16, // $0.04 with 18 decimals
            startTime: 0,
            endTime: 0,
            hardCap: (totalTokenSupply * 20) / 100, // 20% of supply
            minPurchase: 100 * 10**18, // $100 min purchase
            maxPurchase: 10000 * 10**18, // $10,000 max purchase
            tokensSold: 0,
            manualClose: true
        });
        
        // Configure public sale
        saleConfigs[SalePhase.PublicSale] = SaleConfig({
            tokenPrice: 6 * 10**16, // $0.06 with 18 decimals
            startTime: 0,
            endTime: 0,
            hardCap: (totalTokenSupply * 30) / 100, // 30% of supply
            minPurchase: 50 * 10**18, // $50 min purchase
            maxPurchase: 0, // No max for public sale
            tokensSold: 0,
            manualClose: true
        });
    }
    
    // ==================== Admin Functions ====================

    /**
     * @dev Set the whitelist Merkle root
     * @param _merkleRoot New Merkle root for whitelist verification
     */
    function setWhitelistMerkleRoot(bytes32 _merkleRoot) external onlyOwner {
        require(_merkleRoot != bytes32(0), "Invalid Merkle root");
        require(currentPhase != SalePhase.PublicSale && currentPhase != SalePhase.Ended, "Cannot update during public sale or after end");
        whitelistMerkleRoot = _merkleRoot;
        emit WhitelistUpdated(_merkleRoot);
    }
    
    /**
     * @dev Configure sale phase settings
     * @param phase Sale phase to configure
     * @param tokenPrice Price per token in USD (18 decimals)
     * @param duration Duration of the sale in seconds
     * @param hardCap Maximum tokens to sell
     * @param minPurchase Minimum purchase amount in USD (18 decimals)
     * @param maxPurchase Maximum purchase amount in USD (18 decimals)
     */
    function configureSalePhase(
        SalePhase phase,
        uint256 tokenPrice,
        uint256 duration,
        uint256 hardCap,
        uint256 minPurchase,
        uint256 maxPurchase
    ) external onlyOwner {
        require(phase == SalePhase.PreSale || phase == SalePhase.PublicSale, "Invalid phase");
        
        saleConfigs[phase].tokenPrice = tokenPrice;
        saleConfigs[phase].hardCap = hardCap;
        saleConfigs[phase].minPurchase = minPurchase;
        saleConfigs[phase].maxPurchase = maxPurchase;
        
        if (duration > 0 && saleConfigs[phase].startTime > 0) {
            saleConfigs[phase].endTime = saleConfigs[phase].startTime + duration;
        }
    }
    
    /**
     * @dev Start the pre-sale phase
     * @param startTime Start time for pre-sale
     * @param duration Duration in seconds for pre-sale
     */
    function startPreSale(uint256 startTime, uint256 duration) external onlyOwner {
        require(currentPhase == SalePhase.Inactive, "Sale already active");
        require(startTime >= block.timestamp, "Start time must be in future");
        require(duration > 0, "Duration must be positive");
        require(whitelistMerkleRoot != bytes32(0), "Whitelist not set");
        
        saleConfigs[SalePhase.PreSale].startTime = startTime;
        saleConfigs[SalePhase.PreSale].endTime = startTime + duration;
        
        currentPhase = SalePhase.PreSale;
        emit PhaseChanged(SalePhase.PreSale);
    }
    
    /**
     * @dev Start the public sale phase
     * @param startTime Start time for public sale
     * @param duration Duration in seconds for public sale
     */
    function startPublicSale(uint256 startTime, uint256 duration) external onlyOwner {
        require(currentPhase == SalePhase.Inactive, "Sale already active");
        require(saleConfigs[SalePhase.PreSale].endTime > 0, "Pre-sale not completed");
        require(block.timestamp >= saleConfigs[SalePhase.PreSale].endTime + 48 hours, "48-hour buffer required after pre-sale");
        require(startTime >= block.timestamp, "Start time must be in future");
        require(duration > 0, "Duration must be positive");
        
        saleConfigs[SalePhase.PublicSale].startTime = startTime;
        saleConfigs[SalePhase.PublicSale].endTime = startTime + duration;
        
        currentPhase = SalePhase.PublicSale;
        emit PhaseChanged(SalePhase.PublicSale);
    }
    
    /**
     * @dev End the current sale phase
     */
    function endCurrentPhase() public onlyOwner {
        require(currentPhase == SalePhase.PreSale || currentPhase == SalePhase.PublicSale, "No active sale phase");
        require(saleConfigs[currentPhase].manualClose, "Manual close not allowed");
        
        if (currentPhase == SalePhase.PublicSale) {
            currentPhase = SalePhase.Ended;
        } else {
            currentPhase = SalePhase.Inactive;
        }
        
        emit PhaseChanged(currentPhase);
    }
    
    /**
     * @dev Update fund receiver address (Gnosis Safe)
     */
    function setFundReceiver(address _newReceiver) external onlyOwner {
        require(_newReceiver != address(0), "Invalid address");
        fundReceiverAddress = _newReceiver;
    }
    
    /**
     * @dev Withdraw unsold tokens after sale ends
     */
    function withdrawUnsoldTokens(address _to) external onlyOwner {
        require(currentPhase == SalePhase.Ended, "Sale not ended");
        uint256 balance = eyeToken.balanceOf(address(this));
        require(balance > 0, "No tokens to withdraw");
        require(eyeToken.transfer(_to, balance), "Transfer failed");
    }
    
    /**
     * @dev Emergency pause/unpause
     */
    function togglePause() external onlyOwner {
        if (paused()) {
            _unpause();
        } else {
            _pause();
        }
    }
    
    /**
     * @dev Create a vesting schedule for a team member or advisor
     * @param beneficiary Address of the team member or advisor
     * @param amount Amount of tokens to vest
     */
    function createTeamAdvisorVesting(address beneficiary, uint256 amount) 
        external 
        onlyOwner 
    {
        require(beneficiary != address(0), "Invalid beneficiary address");
        require(amount > 0, "Amount must be greater than 0");
        
        createVestingScheduleWithType(beneficiary, amount, VestingType.TeamAdvisor);
    }
    
    /**
     * @dev Create a vesting schedule for private/seed sale participant
     * @param beneficiary Address of the participant
     * @param amount Amount of tokens to vest
     */
    function createPrivateSeedVesting(address beneficiary, uint256 amount) 
        external 
        onlyOwner 
    {
        require(beneficiary != address(0), "Invalid beneficiary address");
        require(amount > 0, "Amount must be greater than 0");
        
        createVestingScheduleWithType(beneficiary, amount, VestingType.PrivateSeed);
    }
    
    /**
     * @dev Admin function to register a fiat purchase (USD or EUR converted to USD)
     * @param buyer Buyer's address
     * @param usdAmount USD equivalent amount
     * @param currency Currency used ("USD" or "EUR")
     * @param merkleProof Merkle proof for whitelist verification (only for pre-sale)
     */
    function registerFiatPurchase(
        address buyer, 
        uint256 usdAmount,
        string calldata currency,
        bytes32[] calldata merkleProof
    ) 
        external 
        onlyOwner 
        nonReentrant 
    {
        require(usdAmount > 0, "Invalid USD amount");
        require(buyer != address(0), "Invalid buyer address");
        require(
            keccak256(abi.encodePacked(currency)) == keccak256(abi.encodePacked("USD")) ||
            keccak256(abi.encodePacked(currency)) == keccak256(abi.encodePacked("EUR")),
            "Unsupported currency"
        );
        
        validatePurchaseEligibilityForUser(buyer, merkleProof);
        
        uint256 tokenAmount = calculateTokenAmount(usdAmount);
        processPurchaseForUser(buyer, tokenAmount, usdAmount, currency);
    }
    
    // ==================== Public Functions ====================
    
    /**
     * @dev Purchase tokens with native currency (POL)
     * @param merkleProof Merkle proof for whitelist verification (only for pre-sale)
     */
    function buyTokensWithPOL(bytes32[] calldata merkleProof) 
        external 
        payable 
        nonReentrant 
        whenNotPaused 
    {
        require(msg.value > 0, "No POL sent");
        
        validatePurchaseEligibility(merkleProof);
        
        uint256 polValueInUsd = getPolValueInUsd(msg.value);
        uint256 tokenAmount = calculateTokenAmount(polValueInUsd);
        
        processPurchase(tokenAmount, polValueInUsd, "POL");
        
        (bool success, ) = payable(fundReceiverAddress).call{value: msg.value}("");
        require(success, "Transfer to fund receiver failed");
    }
    
    /**
     * @dev Purchase tokens with USDC
     * @param usdcAmount Amount of USDC to spend (6 decimals)
     * @param merkleProof Merkle proof for whitelist verification (only for pre-sale)
     */
    function buyTokensWithUSDC(uint256 usdcAmount, bytes32[] calldata merkleProof) 
        external 
        nonReentrant 
        whenNotPaused 
    {
        require(usdcAmount > 0, "No USDC sent");
        
        validatePurchaseEligibility(merkleProof);
        
        uint256 usdValue = getUsdcValueInUsd(usdcAmount);
        uint256 tokenAmount = calculateTokenAmount(usdValue);
        
        require(
            usdcToken.transferFrom(msg.sender, fundReceiverAddress, usdcAmount),
            "USDC transfer failed"
        );
        
        processPurchase(tokenAmount, usdValue, "USDC");
    }
    
    /**
     * @dev Claim vested tokens
     */
    function claimVestedTokens() external nonReentrant {
        VestingSchedule storage vestingSchedule = vestingSchedules[msg.sender];
        
        require(vestingSchedule.totalAmount > 0, "No vesting schedule found");
        
        uint256 releasable = calculateReleasableAmount(msg.sender);
        require(releasable > 0, "No tokens are due for release");
        
        vestingSchedule.released += releasable;
        
        require(eyeToken.transfer(msg.sender, releasable), "Token transfer failed");
        
        emit TokensReleased(msg.sender, releasable);
    }
    
    /**
     * @dev Get vesting details for a user
     */
    function getVestingDetails(address user) 
        external 
        view 
        returns (
            uint256 totalAmount,
            uint256 released,
            uint256 releasable,
            uint256 vestingStart,
            uint256 vestingEnd,
            uint256 cliffEnd,
            VestingType vestingType
        ) 
    {
        VestingSchedule memory schedule = vestingSchedules[user];
        
        return (
            schedule.totalAmount,
            schedule.released,
            calculateReleasableAmount(user),
            schedule.startTime,
            schedule.startTime + schedule.vestingDuration,
            schedule.startTime + schedule.cliffDuration,
            schedule.vestingType
        );
    }
    
    /**
     * @dev Get current sale phase details
     */
    function getCurrentSaleDetails() 
        external 
        view 
        returns (
            SalePhase phase,
            uint256 price,
            uint256 startTime,
            uint256 endTime,
            uint256 hardCap,
            uint256 tokensSold,
            uint256 remaining
        ) 
    {
        phase = currentPhase;
        
        if (phase == SalePhase.PreSale || phase == SalePhase.PublicSale) {
            SaleConfig memory config = saleConfigs[phase];
            price = config.tokenPrice;
            startTime = config.startTime;
            endTime = config.endTime;
            hardCap = config.hardCap;
            tokensSold = config.tokensSold;
            remaining = config.hardCap > config.tokensSold ? config.hardCap - config.tokensSold : 0;
        }
    }
    
    /**
     * @dev Check if an address is whitelisted
     */
    function isWhitelisted(address user, bytes32[] calldata merkleProof) public view returns (bool) {
        if (whitelistMerkleRoot == bytes32(0) || currentPhase != SalePhase.PreSale) return false;
        
        bytes32 leaf = keccak256(abi.encodePacked(user));
        return MerkleProof.verify(merkleProof, whitelistMerkleRoot, leaf);
    }
    
    // ==================== Internal Functions ====================
    
    /**
     * @dev Validate if a purchase is eligible based on current phase and whitelist
     */
    function validatePurchaseEligibility(bytes32[] calldata merkleProof) internal view {
        require(currentPhase == SalePhase.PreSale || currentPhase == SalePhase.PublicSale, "Sale not active");
        
        SaleConfig memory config = saleConfigs[currentPhase];
        
        require(block.timestamp >= config.startTime, "Sale not started");
        require(block.timestamp <= config.endTime || !config.manualClose, "Sale ended");
        
        if (currentPhase == SalePhase.PreSale) {
            require(isWhitelisted(msg.sender, merkleProof), "Not whitelisted for pre-sale");
        }
    }
    
    /**
     * @dev Validate if a purchase is eligible for a specific user (for fiat purchases)
     */
    function validatePurchaseEligibilityForUser(address user, bytes32[] calldata merkleProof) internal view {
        require(currentPhase == SalePhase.PreSale || currentPhase == SalePhase.PublicSale, "Sale not active");
        
        SaleConfig memory config = saleConfigs[currentPhase];
        
        require(block.timestamp >= config.startTime, "Sale not started");
        require(block.timestamp <= config.endTime || !config.manualClose, "Sale ended");
        
        if (currentPhase == SalePhase.PreSale) {
            require(isWhitelisted(user, merkleProof), "User not whitelisted for pre-sale");
        }
    }
    
    /**
     * @dev Process a token purchase for the sender
     */
    function processPurchase(
        uint256 tokenAmount, 
        uint256 usdValue, 
        string memory paymentMethod
    ) internal {
        processPurchaseForUser(msg.sender, tokenAmount, usdValue, paymentMethod);
    }
    
    /**
     * @dev Process a token purchase for a specific user
     */
    function processPurchaseForUser(
        address user,
        uint256 tokenAmount, 
        uint256 usdValue, 
        string memory paymentMethod
    ) internal {
        SaleConfig storage config = saleConfigs[currentPhase];
        
        require(usdValue >= config.minPurchase, "Purchase below minimum limit");
        if (currentPhase == SalePhase.PreSale && config.maxPurchase > 0) {
            preSaleUsdSpent[user] += usdValue;
            require(preSaleUsdSpent[user] <= config.maxPurchase, "Exceeds max purchase limit");
        }
        
        require(tokenAmount <= config.hardCap - config.tokensSold, "Not enough tokens left");
        require(eyeToken.balanceOf(address(this)) >= tokenAmount, "Insufficient token balance");
        
        config.tokensSold += tokenAmount;
        
        if (currentPhase == SalePhase.PreSale) {
            hasParticipatedInPreSale[user] = true;
            createVestingScheduleWithType(user, tokenAmount, VestingType.PrivateSeed);
        } else {
            require(eyeToken.transfer(user, tokenAmount), "Token transfer failed");
        }
        
        emit TokensPurchased(user, tokenAmount, paymentMethod, usdValue);
    }
    
    /**
     * @dev Create a vesting schedule for a user with specific vesting type
     */
    function createVestingScheduleWithType(
        address beneficiary, 
        uint256 amount, 
        VestingType vestingType
    ) internal {
        VestingSchedule storage schedule = vestingSchedules[beneficiary];
        
        uint256 cliffDuration;
        uint256 vestingDuration;
        
        if (vestingType == VestingType.PrivateSeed) {
            cliffDuration = PRIVATE_SEED_CLIFF;
            vestingDuration = PRIVATE_SEED_DURATION;
        } else if (vestingType == VestingType.TeamAdvisor) {
            cliffDuration = TEAM_ADVISOR_CLIFF;
            vestingDuration = TEAM_ADVISOR_DURATION;
        } else {
            revert("Invalid vesting type");
        }
        
        if (schedule.totalAmount > 0 && schedule.vestingType == vestingType) {
            schedule.totalAmount += amount;
        } else if (schedule.totalAmount > 0 && schedule.vestingType != vestingType) {
            revert("User already has a different vesting type");
        } else {
            vestingSchedules[beneficiary] = VestingSchedule({
                totalAmount: amount,
                cliffDuration: cliffDuration,
                vestingDuration: vestingDuration,
                startTime: schedule.totalAmount > 0 ? schedule.startTime : block.timestamp,
                released: 0,
                vestingType: vestingType
            });
        }
        
        emit VestingScheduleCreated(beneficiary, amount, vestingType);
    }
    
    /**
     * @dev Calculate the amount of tokens to be released for a beneficiary
     */
    function calculateReleasableAmount(address beneficiary) internal view returns (uint256) {
        VestingSchedule memory vestingSchedule = vestingSchedules[beneficiary];
        
        uint256 vested = calculateVestedAmount(vestingSchedule);
        return vested - vestingSchedule.released;
    }
    
    /**
     * @dev Calculate the total vested amount based on vesting schedule
     */
    function calculateVestedAmount(VestingSchedule memory vestingSchedule) internal view returns (uint256) {
        if (block.timestamp < vestingSchedule.startTime + vestingSchedule.cliffDuration) {
            return 0;
        } else if (block.timestamp >= vestingSchedule.startTime + vestingSchedule.vestingDuration) {
            return vestingSchedule.totalAmount;
        } else {
            uint256 timeFromStart = block.timestamp - vestingSchedule.startTime;
            uint256 vestedAmount = (vestingSchedule.totalAmount * timeFromStart) / vestingSchedule.vestingDuration;
            return vestedAmount;
        }
    }
    
    /**
     * @dev Calculate token amount based on USD value
     */
    function calculateTokenAmount(uint256 usdValue) internal view returns (uint256) {
        SaleConfig memory config = saleConfigs[currentPhase];
        return (usdValue * 10**18) / config.tokenPrice;
    }
    
    /**
     * @dev Get POL value in USD
     */
    function getPolValueInUsd(uint256 polAmount) internal view returns (uint256) {
        (, int256 price, , uint256 updatedAt, ) = polUsdPriceFeed.latestRoundData();
        require(price > 0, "Invalid POL/USD price");
        require(updatedAt >= block.timestamp - 1 hours, "Stale POL price feed");
        
        uint256 polPrice = uint256(price) * 10**10; // 8-decimal price to 18 decimals
        return (polAmount * polPrice) / 10**18;
    }
    
    /**
     * @dev Get USDC value in USD
     */
    function getUsdcValueInUsd(uint256 usdcAmount) internal view returns (uint256) {
        (, int256 price, , uint256 updatedAt, ) = usdcUsdPriceFeed.latestRoundData();
        require(price > 0, "Invalid USDC/USD price");
        require(updatedAt >= block.timestamp - 1 hours, "Stale USDC price feed");
        
        // USDC is 6 decimals, price is 8 decimals, result in 18 decimals
        return (usdcAmount * uint256(price) * 10**10) / 10**8;
    }
    
    /**
     * @dev Authorize contract upgrade
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}



    ////////Debug function \\\\\\\
//     // remove this functions before sending to team

//     function debugPriceFeed() external view returns (
//     int256 price,
//     uint256 updatedAt,
//     bool isStale,
//     bool isValid
// ) {
//     (, price, , updatedAt, ) = polUsdPriceFeed.latestRoundData();
//     isStale = updatedAt < block.timestamp - 1 hours;
//     isValid = price > 0;
//     return (price, updatedAt, isStale, isValid);
// }

// function debugWhitelist(bytes32[] calldata merkleProof) external view returns (
//     bool isWhitelistedResult,
//     bytes32 calculatedLeaf,
//     bytes32 currentRoot
// ) {
//     isWhitelistedResult = isWhitelisted(msg.sender, merkleProof);
//     calculatedLeaf = keccak256(abi.encodePacked(msg.sender));
//     currentRoot = whitelistMerkleRoot;
//     return (isWhitelistedResult, calculatedLeaf, currentRoot);
// } 

// function debugSaleState() external view returns (
//     SalePhase phase,
//     uint256 start,
//     uint256 end,
//     uint256 current,
//     bool started,
//     bool ended,
//     uint256 hardCap,
//     uint256 sold,
//     uint256 balance
// ) {
//     phase = currentPhase;
//     start = saleConfigs[phase].startTime;
//     end = saleConfigs[phase].endTime;
//     current = block.timestamp;
//     started = current >= start;
//     ended = current > end;
//     hardCap = saleConfigs[phase].hardCap;
//     sold = saleConfigs[phase].tokensSold;
//     balance = eyeToken.balanceOf(address(this));
//     return (phase, start, end, current, started, ended, hardCap, sold, balance);
// }

}