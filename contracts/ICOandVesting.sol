// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title EYETokenSale
 * @dev A contract for EYE token ICO with direct USD and POL purchases using Chainlink price feeds
 */
contract EYETokenSale is 
    Initializable, 
    OwnableUpgradeable, 
    ReentrancyGuardUpgradeable, 
    PausableUpgradeable,
    UUPSUpgradeable 
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    // Token and pricing
    IERC20Upgradeable public eyeToken;
    uint256 public preSalePrice; // $0.04 per token in USD (4 cents)
    uint256 public publicSalePrice; // $0.06 per token in USD (6 cents)
    
    // Sale timelines
    uint256 public preSaleStartTime;
    uint256 public preSaleEndTime;
    uint256 public publicSaleStartTime;
    uint256 public publicSaleEndTime;
    
    // Caps
    uint256 public preSaleCap;
    uint256 public publicSaleCap;
    uint256 public totalTokensSold;
    uint256 public preSaleTokensSold;
    uint256 public publicSaleTokensSold;
    
    // Sale status
    enum SaleStatus { Inactive, PreSale, PublicSale, Ended }
    SaleStatus public currentSaleStatus;
    
    // Vesting parameters
    uint256 public constant VESTING_DURATION = 365 days; // 12 months
    uint256 public constant CLIFF_PERIOD = 90 days; // 3 months
    
    // Merkle tree for whitelisting
    bytes32 public merkleRoot;
    
    // Recipient address (Gnosis Safe)
    address public fundsRecipient;
    
    // Chainlink price feeds
    AggregatorV3Interface public polUsdPriceFeed;
    AggregatorV3Interface public eurUsdPriceFeed;
    
    // User purchase tracking
    struct Purchase {
        uint256 totalAmount;
        uint256 vestedAmount;
        uint256 claimedAmount;
        uint256 vestingStartTime;
    }
    
    mapping(address => Purchase) public purchases;
    
    // Events
    event TokensPurchased(address indexed buyer, uint256 amount, uint256 cost, string currency);
    event TokensClaimed(address indexed user, uint256 amount);
    event SaleStatusChanged(SaleStatus newStatus);
    event VestingScheduleCreated(address indexed beneficiary, uint256 amount);
    event MerkleRootSet(bytes32 merkleRoot);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    /**
     * @dev Initialize the contract
     */
    function initialize(
        address _eyeToken,
        address _polUsdPriceFeed,
        address _eurUsdPriceFeed,
        address _fundsRecipient
    ) public initializer {
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
        __Pausable_init();
        __UUPSUpgradeable_init();
        
        eyeToken = IERC20Upgradeable(_eyeToken);
        
        polUsdPriceFeed = AggregatorV3Interface(_polUsdPriceFeed);
        eurUsdPriceFeed = AggregatorV3Interface(_eurUsdPriceFeed);
        
        fundsRecipient = _fundsRecipient;
        
        // Set default values
        preSalePrice = 4 * 10**16; // $0.04 with 18 decimals
        publicSalePrice = 6 * 10**16; // $0.06 with 18 decimals
        currentSaleStatus = SaleStatus.Inactive;
    }

    /**
     * @dev Function to authorize upgrades, only callable by owner
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
    
    /**
     * @dev Set sale parameters
     */
    function setSaleParameters(
        uint256 _preSaleCap,
        uint256 _publicSaleCap,
        uint256 _preSaleDuration
    ) external onlyOwner {
        require(currentSaleStatus == SaleStatus.Inactive, "Sale already active");
        preSaleCap = _preSaleCap;
        publicSaleCap = _publicSaleCap;
        preSaleEndTime = preSaleStartTime + _preSaleDuration;
    }
    
    /**
     * @dev Start the pre-sale
     */
    function startPreSale() external onlyOwner {
        require(currentSaleStatus == SaleStatus.Inactive, "Sale not inactive");
        require(preSaleCap > 0, "Pre-sale cap not set");
        
        preSaleStartTime = block.timestamp;
        preSaleEndTime = preSaleStartTime + (3 days); // Default 3 days duration
        currentSaleStatus = SaleStatus.PreSale;
        
        emit SaleStatusChanged(SaleStatus.PreSale);
    }
    
    /**
     * @dev End the pre-sale and prepare for public sale
     */
    function endPreSale() external onlyOwner {
        require(currentSaleStatus == SaleStatus.PreSale, "Not in pre-sale");
        preSaleEndTime = block.timestamp;
        currentSaleStatus = SaleStatus.Inactive; // Wait for manual public sale start
        
        emit SaleStatusChanged(SaleStatus.Inactive);
    }
    
    /**
     * @dev Start the public sale
     */
    function startPublicSale() external onlyOwner {
        require(currentSaleStatus == SaleStatus.Inactive, "Sale not inactive");
        require(block.timestamp >= preSaleEndTime, "Pre-sale not ended");
        
        publicSaleStartTime = block.timestamp;
        publicSaleEndTime = publicSaleStartTime + (7 days); // Default 7 days for public sale
        currentSaleStatus = SaleStatus.PublicSale;
        
        emit SaleStatusChanged(SaleStatus.PublicSale);
    }
    
    /**
     * @dev End the sale completely
     */
    function endSale() external onlyOwner {
        require(currentSaleStatus != SaleStatus.Ended, "Sale already ended");
        if (currentSaleStatus == SaleStatus.PreSale) {
            preSaleEndTime = block.timestamp;
        } else if (currentSaleStatus == SaleStatus.PublicSale) {
            publicSaleEndTime = block.timestamp;
        }
        
        currentSaleStatus = SaleStatus.Ended;
        emit SaleStatusChanged(SaleStatus.Ended);
    }
    
    /**
     * @dev Set Merkle root for whitelisting
     */
    function setMerkleRoot(bytes32 _merkleRoot) external onlyOwner {
        merkleRoot = _merkleRoot;
        emit MerkleRootSet(_merkleRoot);
    }
    
    /**
     * @dev Verify if user is whitelisted using Merkle proof
     */
    function isWhitelisted(address user, bytes32[] calldata merkleProof) public view returns (bool) {
        bytes32 leaf = keccak256(abi.encodePacked(user));
        return MerkleProof.verify(merkleProof, merkleRoot, leaf);
    }
    
    /**
     * @dev Buy tokens with USD directly
     */
    function buyTokensWithUSD(uint256 usdAmount, bytes32[] calldata merkleProof) external payable nonReentrant whenNotPaused {
        // Validate input
        require(usdAmount > 0, "Invalid USD amount");
        
        // Check sale status and whitelist
        if (currentSaleStatus == SaleStatus.PreSale) {
            require(isWhitelisted(msg.sender, merkleProof), "Not whitelisted");
        } else {
            require(currentSaleStatus == SaleStatus.PublicSale, "Sale not active");
        }
        
        // Calculate token amount
        uint256 tokenAmount = calculateTokenAmount(usdAmount, true);
        
        // Process the purchase
        _processPurchase(msg.sender, tokenAmount, usdAmount, "USD");
        
        // Transfer USD to funds recipient (requires frontend/user approval)
        (bool success, ) = payable(fundsRecipient).call{value: msg.value}("");
        require(success, "Transfer to funds recipient failed");
    }
    
    /**
     * @dev Buy tokens with POL directly
     */
    function buyTokensWithPOL(uint256 polAmount, bytes32[] calldata merkleProof) external payable nonReentrant whenNotPaused {
        // Validate input
        require(polAmount > 0, "Invalid POL amount");
        
        // Check sale status and whitelist
        if (currentSaleStatus == SaleStatus.PreSale) {
            require(isWhitelisted(msg.sender, merkleProof), "Not whitelisted");
        } else {
            require(currentSaleStatus == SaleStatus.PublicSale, "Sale not active");
        }
        
        // Calculate token amount based on POL price
        uint256 tokenAmount = calculateTokenAmountForPOL(polAmount);
        
        // Process the purchase
        _processPurchase(msg.sender, tokenAmount, polAmount, "POL");
        
        // Transfer POL to funds recipient (requires frontend/user approval)
        (bool success, ) = payable(fundsRecipient).call{value: msg.value}("");
        require(success, "Transfer to funds recipient failed");
    }
    
    /**
     * @dev Process token purchase
     */
    function _processPurchase(address user, uint256 tokenAmount, uint256 paymentAmount, string memory currency) internal {
        uint256 currentCap;
        uint256 currentPrice;
        
        if (currentSaleStatus == SaleStatus.PreSale) {
            currentCap = preSaleCap;
            currentPrice = preSalePrice;
            require(preSaleTokensSold + tokenAmount <= preSaleCap, "Pre-sale cap reached");
            preSaleTokensSold += tokenAmount;
        } else {
            currentCap = publicSaleCap;
            currentPrice = publicSalePrice;
            require(publicSaleTokensSold + tokenAmount <= publicSaleCap, "Public sale cap reached");
            publicSaleTokensSold += tokenAmount;
        }
        
        totalTokensSold += tokenAmount;
        
        // Set up vesting schedule
        Purchase storage purchase = purchases[user];
        if (purchase.vestingStartTime == 0) {
            purchase.vestingStartTime = block.timestamp;
        }
        purchase.totalAmount += tokenAmount;
        purchase.vestedAmount += tokenAmount;
        
        emit TokensPurchased(user, tokenAmount, paymentAmount, currency);
        emit VestingScheduleCreated(user, tokenAmount);
    }
    
    /**
     * @dev Calculate token amount based on payment amount
     */
    function calculateTokenAmount(uint256 paymentAmount, bool isUSD) public view returns (uint256) {
        uint256 price = currentSaleStatus == SaleStatus.PreSale ? preSalePrice : publicSalePrice;
        
        // If not USD, assume 18 decimals
        if (!isUSD) {
            paymentAmount *= 10**12; // Adjust to 18 decimals
        }
        
        return paymentAmount / price;
    }
    
    /**
     * @dev Calculate token amount based on POL amount using Chainlink price feed
     */
    function calculateTokenAmountForPOL(uint256 polAmount) public view returns (uint256) {
        uint256 polPriceInUsd = getPolPriceInUsd();
        uint256 price = currentSaleStatus == SaleStatus.PreSale ? preSalePrice : publicSalePrice;
        
        // Calculate equivalent USD value
        uint256 usdValue = (polAmount * polPriceInUsd) / 10**18;
        
        // Calculate token amount
        return usdValue / price;
    }
    
    /**
     * @dev Get POL price in USD from Chainlink
     */
    function getPolPriceInUsd() public view returns (uint256) {
        (, int256 price, , , ) = polUsdPriceFeed.latestRoundData();
        uint8 decimals = polUsdPriceFeed.decimals();
        
        // Convert to 18 decimals
        return uint256(price) * 10**(18 - decimals);
    }
    
    /**
     * @dev Convert EUR to USD using Chainlink price feed
     */
    function convertEuroToUsd(uint256 eurAmount) public view returns (uint256) {
        (, int256 price, , , ) = eurUsdPriceFeed.latestRoundData();
        uint8 decimals = eurUsdPriceFeed.decimals();
        
        // Convert EUR to USD
        return (eurAmount * uint256(price)) / 10**decimals;
    }
    
    /**
     * @dev Claim vested tokens
     */
    function claimVestedTokens() external nonReentrant {
        Purchase storage purchase = purchases[msg.sender];
        
        require(purchase.vestedAmount > 0, "No tokens purchased");
        require(block.timestamp >= purchase.vestingStartTime + CLIFF_PERIOD, "Cliff period not over");
        
        uint256 vestedAmount = calculateVestedAmount(msg.sender);
        uint256 claimableAmount = vestedAmount - purchase.claimedAmount;
        
        require(claimableAmount > 0, "No tokens to claim");
        
        purchase.claimedAmount += claimableAmount;
        
        // Transfer tokens to the user
        eyeToken.safeTransfer(msg.sender, claimableAmount);
        
        emit TokensClaimed(msg.sender, claimableAmount);
    }
    
    /**
     * @dev Calculate vested tokens for a user
     */
    function calculateVestedAmount(address user) public view returns (uint256) {
        Purchase memory purchase = purchases[user];
        
        if (purchase.vestedAmount == 0) {
            return 0;
        }
        
        // Before cliff, nothing is vested
        if (block.timestamp < purchase.vestingStartTime + CLIFF_PERIOD) {
            return 0;
        }
        
        // After vesting period, everything is vested
        if (block.timestamp >= purchase.vestingStartTime + VESTING_DURATION) {
            return purchase.vestedAmount;
        }
        
        // During vesting period after cliff, tokens vest linearly
        uint256 timeFromCliff = block.timestamp - (purchase.vestingStartTime + CLIFF_PERIOD);
        uint256 vestingPeriod = VESTING_DURATION - CLIFF_PERIOD;
        
        return (purchase.vestedAmount * timeFromCliff) / vestingPeriod;
    }
    
    /**
     * @dev Get remaining claimable tokens for a user
     */
    function getClaimableTokens(address user) external view returns (uint256) {
        Purchase memory purchase = purchases[user];
        
        if (purchase.vestedAmount == 0) {
            return 0;
        }
        
        uint256 vestedAmount = calculateVestedAmount(user);
        return vestedAmount - purchase.claimedAmount;
    }
    
    /**
     * @dev Get vesting details for a user
     */
    function getVestingDetails(address user) external view returns (
        uint256 totalAmount,
        uint256 vestedAmount,
        uint256 claimedAmount,
        uint256 vestingStartTime,
        uint256 cliffEndTime,
        uint256 vestingEndTime,
        uint256 claimableNow
    ) {
        Purchase memory purchase = purchases[user];
        
        totalAmount = purchase.totalAmount;
        vestedAmount = purchase.vestedAmount;
        claimedAmount = purchase.claimedAmount;
        vestingStartTime = purchase.vestingStartTime;
        cliffEndTime = purchase.vestingStartTime + CLIFF_PERIOD;
        vestingEndTime = purchase.vestingStartTime + VESTING_DURATION;
        
        uint256 vestedSoFar = calculateVestedAmount(user);
        claimableNow = vestedSoFar - purchase.claimedAmount;
    }
    
    /**
     * @dev Get current sale status with more details
     */
    function getSaleStatus() external view returns (
        SaleStatus status,
        uint256 currentTime,
        uint256 startTime,
        uint256 endTime,
        uint256 currentPrice,
        uint256 tokensSold,
        uint256 cap
    ) {
        status = currentSaleStatus;
        currentTime = block.timestamp;
        
        if (status == SaleStatus.PreSale) {
            startTime = preSaleStartTime;
            endTime = preSaleEndTime;
            currentPrice = preSalePrice;
            tokensSold = preSaleTokensSold;
            cap = preSaleCap;
        } else if (status == SaleStatus.PublicSale) {
            startTime = publicSaleStartTime;
            endTime = publicSaleEndTime;
            currentPrice = publicSalePrice;
            tokensSold = publicSaleTokensSold;
            cap = publicSaleCap;
        }
    }
    
    /**
     * @dev Emergency pause sales
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @dev Resume sales after pause
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @dev Update price feeds
     */
    function updatePriceFeeds(
        address _polUsdPriceFeed, 
        address _eurUsdPriceFeed
    ) external onlyOwner {
        polUsdPriceFeed = AggregatorV3Interface(_polUsdPriceFeed);
        eurUsdPriceFeed = AggregatorV3Interface(_eurUsdPriceFeed);
    }
    
    /**
     * @dev Update funds recipient (Gnosis Safe address)
     */
    function updateFundsRecipient(address _fundsRecipient) external onlyOwner {
        fundsRecipient = _fundsRecipient;
    }
    
    /**
     * @dev Withdraw accumulated funds (only owner)
     */
    function withdrawFunds() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to withdraw");
        
        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "Transfer failed");
    }

    /**
     * @dev Recover any ERC20 tokens accidentally sent to the contract
     */
    function recoverTokens(address tokenAddress, uint256 amount) external onlyOwner {
        IERC20Upgradeable(tokenAddress).safeTransfer(owner(), amount);
    }

    /**
     * @dev Fallback function to receive direct transfers
     */
    receive() external payable {
        revert("Direct transfers not allowed");
    }
}