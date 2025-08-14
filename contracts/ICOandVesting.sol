// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol"; 
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol"; 
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol"; 

contract EyeICOAndVesting is
    OwnableUpgradeable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable
{
    using Math for uint256;

    enum ICORounds {
        Seed,           // 10% - Fixed price $0.0015 - Whitelisted
        PublicPresale   // 30% - Phase-wise pricing - No whitelist
    } 

    enum CollaboratorRole {
        Ecosystem,      // 10%
        Reserve,        // 10%
        Liquidity,      // 10%
        Staking,        // 10%
        EarlyLP,        // 5%
        Team,           // 10%
        Advisors        // 5%
    }

    struct ICORoundDetails {
        uint8 allocationPercent;
        uint256 totalTokenAmount;
        uint256 tokensSold;
        uint8 TGE; // TGE percentage
        uint256 cliff; // in Seconds
        uint256 duration; // in Seconds
        uint256 walletCapUSD; // in USD with 6 decimals
        uint256 fixedPrice; // Fixed price in USD (6 decimals) - for Seed round
        bool isActive;
        bool requiresWhitelist; // New field - only Seed requires whitelist
    }

    struct CollaboratorDetails {
        uint8 allocationPercent;
        uint256 totalTokenAmount;
        uint256 tokensAllocated;
        uint8 TGE; // TGE percentage
        uint256 cliff; // in Seconds
        uint256 duration; // in Seconds
        bool cliffOffset; // Whether cliff starts after TGE
    }

    struct Vesting {
        uint256 totalTokenAmount; // Total tokens in vesting (excludes TGE)
        uint256 tokenTransferred;
        uint256 start;
        uint256 cliff;
        uint256 duration;
        address userAddress;
        bool isCollaborator;
        CollaboratorRole collaboratorRole;
    }

    // Events
    event TokensPurchasedWithETH(
        address indexed purchaser,
        uint256 ethAmount,
        uint256 tokenAmount,
        uint256 tgeAmount,
        uint256 vestingId,
        uint256 actualCostUSD,
        uint256 currentPrice,
        uint256 currentPhase
    );
    
    event TokensPurchasedWithStablecoin(
        address indexed purchaser,
        uint256 tokenAmount,
        uint256 tgeAmount,
        uint256 vestingId,
        string stablecoinType,
        uint256 actualCostUSD,
        uint256 currentPrice,
        uint256 currentPhase
    );
    
    event TokensPurchasedWithFiat(
        address indexed purchaser,
        uint256 tokenAmount,
        uint256 tgeAmount,
        uint256 vestingId,
        uint256 fiatAmountUSD,
        uint256 currentPrice,
        uint256 currentPhase
    );
    
    event CollaboratorAdded(
        address indexed userAddress,
        CollaboratorRole indexed role,
        uint256 tokenAmount,
        uint256 tgeAmount,
        uint256 vestingId
    );
    
    event VestingAdded(
        uint256 indexed vestingId,
        address indexed userAddress,
        uint256 totalTokenAmount,
        bool isCollaborator
    );
    
    event TokensClaimed(
        uint256 indexed vestingId,
        address indexed beneficiary,
        uint256 claimableAmount
    );
    
    event ICORoundChanged(ICORounds indexed oldRound, ICORounds indexed newRound);
    event RoundClosed(ICORounds indexed round);
    event TokensWithdrawn(address indexed receiver, uint256 amount, ICORounds round);
    event MerkleRootUpdated(bytes32 oldRoot, bytes32 newRoot);
    event TGETokensTransferred(address indexed purchaser, uint256 tgeAmount, string paymentType);
    event EmergencyWithdraw(address indexed token, address indexed to, uint256 amount);
    event AddressUpdated(string indexed addressType, address oldAddress, address newAddress);
    event PhaseChanged(uint256 indexed newPhase, uint256 newPrice, uint256 percentageSold);
    
    // Constants
    uint256 private constant PRECISION = 1e6; // 6 decimal precision for USD calculations
    uint256 private constant TOKEN_DECIMALS = 1e18; // 18 decimal precision for tokens
    uint256 private constant MAX_STALE_PERIOD = 30 minutes; // Maximum allowed price staleness
    uint256 private constant MIN_PURCHASE_USD = 10 * PRECISION; // Minimum $10 purchase

    // State variables
    IERC20 public eyeToken;
    ICORounds public currentRound;
    uint256 public vestingId;
    bytes32 public merkleRoot; // For Seed round whitelist verification
    address public fundReceiverAddress;
    address public usdcAddress;
    address public usdtAddress;
    AggregatorV3Interface public ethPriceFeed;
    AggregatorV3Interface public usdcPriceFeed;
    AggregatorV3Interface public usdtPriceFeed;
    
    mapping(ICORounds => ICORoundDetails) public icoRoundDetails;
    mapping(CollaboratorRole => CollaboratorDetails) public collaboratorDetails;
    mapping(uint256 => Vesting) public vestings;
    mapping(address => mapping(ICORounds => uint256)) public userPurchasesByRound;
    mapping(address => uint256) public totalUserPurchases;

    // Modifiers
    modifier validAddress(address _address) {
        require(_address != address(0), "Invalid address: zero address");
        _;
    }

    modifier validRound(ICORounds _round) {
        require(uint8(_round) <= uint8(ICORounds.PublicPresale), "Invalid round");
        _;
    }

    modifier validCollaboratorRole(CollaboratorRole _role) {
        require(uint8(_role) <= uint8(CollaboratorRole.Advisors), "Invalid collaborator role");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        IERC20 _eyeToken,
        address _fundReceiverAddress,
        address _usdcAddress,
        address _usdtAddress,
        address _ethPriceFeed,
        address _usdcPriceFeed,
        address _usdtPriceFeed 
    ) public initializer {
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        require(address(_eyeToken) != address(0), "Invalid eye token address");
        
        uint256 totalTokenSupply = 10000000000 * TOKEN_DECIMALS; // 10 billion tokens
        vestingId = 0;

        // Initialize ICO Rounds based on new tokenomics
        // Seed Round: 10% allocation - Fixed price $0.0015 - Whitelisted
        icoRoundDetails[ICORounds.Seed] = ICORoundDetails({
            allocationPercent: 10,
            totalTokenAmount: (totalTokenSupply * 10) / 100, // 10% = 1B tokens
            tokensSold: 0,
            TGE: 0, // 0% TGE 
            cliff: 180 days, // 6 months cliff
            duration: 730 days, // 24 months vesting
            walletCapUSD: 25000 * PRECISION, // $25K wallet cap for seed
            fixedPrice: 1500, // $0.0015 fixed price
            isActive: false,
            requiresWhitelist: true // Seed requires whitelist
        });
        
        // Public Presale: 30% allocation - Phase-wise pricing - No whitelist
        icoRoundDetails[ICORounds.PublicPresale] = ICORoundDetails({
            allocationPercent: 30,
            totalTokenAmount: (totalTokenSupply * 30) / 100, // 30% = 3B tokens
            tokensSold: 0,
            TGE: 0, // 0% TGE
            cliff: 0, // No cliff for public presale
            duration: 365 days, // 12 months vesting
            walletCapUSD: 50000 * PRECISION, // $50K wallet cap
            fixedPrice: 0, // Uses phase-wise pricing
            isActive: false,
            requiresWhitelist: false // Public presale - no whitelist
        });

        // Initialize Collaborator Details based on new tokenomics
        // Ecosystem: 10% allocation, 10% TGE, 0 cliff, 36-month vesting
        collaboratorDetails[CollaboratorRole.Ecosystem] = CollaboratorDetails({
            allocationPercent: 10,
            totalTokenAmount: (totalTokenSupply * 10) / 100,
            tokensAllocated: 0,
            TGE: 10, // 10% TGE
            cliff: 0, // 0 months cliff
            duration: 1080 days, // 36 months
            cliffOffset: false
        });

        // Reserve: 10% allocation, 0% TGE, 12-month cliff, 36-month vesting
        collaboratorDetails[CollaboratorRole.Reserve] = CollaboratorDetails({
            allocationPercent: 10,
            totalTokenAmount: (totalTokenSupply * 10) / 100,
            tokensAllocated: 0,
            TGE: 0, // 0% TGE
            cliff: 360 days, // 12 months cliff
            duration: 1080 days, // 36 months
            cliffOffset: true
        });

        // Liquidity: 10% allocation, 100% TGE, no cliff, no vesting
        collaboratorDetails[CollaboratorRole.Liquidity] = CollaboratorDetails({
            allocationPercent: 10,
            totalTokenAmount: (totalTokenSupply * 10) / 100,
            tokensAllocated: 0,
            TGE: 100, // 100% TGE
            cliff: 0,
            duration: 0,
            cliffOffset: false
        });

        // Staking: 10% allocation, 0% TGE, 0 cliff, 48-month vesting
        collaboratorDetails[CollaboratorRole.Staking] = CollaboratorDetails({
            allocationPercent: 10,
            totalTokenAmount: (totalTokenSupply * 10) / 100,
            tokensAllocated: 0,
            TGE: 0, // 0% TGE
            cliff: 0, // No cliff
            duration: 1440 days, // 48 months
            cliffOffset: false
        });

        // Early LP Rewards: 5% allocation, 25% TGE, 0 cliff, 12-month vesting
        collaboratorDetails[CollaboratorRole.EarlyLP] = CollaboratorDetails({
            allocationPercent: 5,
            totalTokenAmount: (totalTokenSupply * 5) / 100,
            tokensAllocated: 0,
            TGE: 25, // 25% TGE
            cliff: 0,
            duration: 360 days, // 12 months
            cliffOffset: false
        });

        // Team: 10% allocation, 0% TGE, 9-month cliff, 24-month vesting
        collaboratorDetails[CollaboratorRole.Team] = CollaboratorDetails({
            allocationPercent: 10,
            totalTokenAmount: (totalTokenSupply * 10) / 100,
            tokensAllocated: 0,
            TGE: 0, // 0% TGE
            cliff: 270 days, // 9 months
            duration: 720 days, // 24 months
            cliffOffset: true
        });

        // Advisors: 5% allocation, 0% TGE, 9-month cliff, 24-month vesting
        collaboratorDetails[CollaboratorRole.Advisors] = CollaboratorDetails({
            allocationPercent: 5,
            totalTokenAmount: (totalTokenSupply * 5) / 100,
            tokensAllocated: 0,
            TGE: 0, // 0% TGE
            cliff: 270 days, // 9 months
            duration: 720 days, // 24 months
            cliffOffset: true
        });

        eyeToken = _eyeToken;
        currentRound = ICORounds.Seed; // Start with Seed round
        fundReceiverAddress = _fundReceiverAddress;
        usdcAddress = _usdcAddress;
        usdtAddress = _usdtAddress;
        ethPriceFeed = AggregatorV3Interface(_ethPriceFeed);
        usdcPriceFeed = AggregatorV3Interface(_usdcPriceFeed);
        usdtPriceFeed = AggregatorV3Interface(_usdtPriceFeed);
    }

    // Get current token price based on round and phase
    function getCurrentTokenPrice() public view returns (uint256) {
        ICORoundDetails memory roundDetails = icoRoundDetails[currentRound];
        
        if (currentRound == ICORounds.Seed) {
            // Seed round has fixed price
            return roundDetails.fixedPrice; // $0.0015
        } else if (currentRound == ICORounds.PublicPresale) {
            // Public presale uses phase-wise pricing
            if (roundDetails.totalTokenAmount == 0) return 2500; // Default to phase 1 price
            
            uint256 percentageSold = (roundDetails.tokensSold * 100) / roundDetails.totalTokenAmount;
            
            // Phase-wise pricing for Public Presale (same as before)
            if (percentageSold < 4) {
                return 2500; // $0.0025 (Phase 1: 0-4%)
            } else if (percentageSold < 9) {
                return 3500; // $0.0035 (Phase 2: 4-9%)
            } else if (percentageSold < 15) {
                return 5000; // $0.0050 (Phase 3: 9-15%)
            } else if (percentageSold < 22) {
                return 7500; // $0.0075 (Phase 4: 15-22%)
            } else if (percentageSold < 31) {
                return 10000; // $0.0100 (Phase 5: 22-31%)
            } else if (percentageSold < 41) {
                return 12500; // $0.0125 (Phase 6: 31-41%)
            } else if (percentageSold < 52) {
                return 15000; // $0.0150 (Phase 7: 41-52%)
            } else if (percentageSold < 66) {
                return 20000; // $0.0200 (Phase 8: 52-66%)
            } else if (percentageSold < 81) {
                return 25000; // $0.0250 (Phase 9: 66-81%)
            } else {
                return 30000; // $0.0300 (Phase 10: 81-100%)
            }
        }
        
        return 0; // Invalid round
    }

    // Get current phase info (for frontend display)
    function getCurrentPhaseInfo() public view returns (
        uint256 currentPhase,
        uint256 currentPrice,
        uint256 percentageSold
    ) {
        ICORoundDetails memory roundDetails = icoRoundDetails[currentRound];
        currentPrice = getCurrentTokenPrice();
        
        if (currentRound == ICORounds.Seed) {
            // Seed round is single phase
            currentPhase = 1;
            if (roundDetails.totalTokenAmount > 0) {
                percentageSold = (roundDetails.tokensSold * 100) / roundDetails.totalTokenAmount;
            }
        } else if (currentRound == ICORounds.PublicPresale) {
            // Public presale has 10 phases
            if (roundDetails.totalTokenAmount == 0) {
                return (1, currentPrice, 0);
            }
            
            percentageSold = (roundDetails.tokensSold * 100) / roundDetails.totalTokenAmount;
            
            // Determine current phase based on percentage sold
            if (percentageSold < 4) {
                currentPhase = 1;
            } else if (percentageSold < 9) {
                currentPhase = 2;
            } else if (percentageSold < 15) {
                currentPhase = 3;
            } else if (percentageSold < 22) {
                currentPhase = 4;
            } else if (percentageSold < 31) {
                currentPhase = 5;
            } else if (percentageSold < 41) {
                currentPhase = 6;
            } else if (percentageSold < 52) {
                currentPhase = 7;
            } else if (percentageSold < 66) {
                currentPhase = 8;
            } else if (percentageSold < 81) {
                currentPhase = 9;
            } else {
                currentPhase = 10;
            }
        }
    }

    // Calculate tokens for USD
    function calculateTokensForUSD(uint256 usdAmount) public view returns (uint256) {
        require(usdAmount >= MIN_PURCHASE_USD, "Purchase amount too small");
        
        uint256 currentPrice = getCurrentTokenPrice();
        require(currentPrice > 0, "Invalid current price");
        
        return (usdAmount * TOKEN_DECIMALS) / currentPrice;
    }

    // Whitelist verification function (only for Seed round)
    function addressIsWhiteListed(
        bytes32[] memory proof,
        address _userAddress
    ) public view returns (bool) {
        if (merkleRoot == bytes32(0)) {
            return false; // No whitelist set
        }
        return MerkleProof.verify(
            proof,
            merkleRoot,
            keccak256(abi.encodePacked(_userAddress))
        );
    }

    // ETH Purchase Function (conditional Merkle proof based on round)
    function buyTokensWithETH(
        bytes32[] memory proof
    ) external payable whenNotPaused nonReentrant {
        require(msg.value > 0, "Invalid ETH amount");
        
        ICORoundDetails memory roundDetails = icoRoundDetails[currentRound];
        
        // Check whitelist only for Seed round
        if (roundDetails.requiresWhitelist) {
            require(
                addressIsWhiteListed(proof, msg.sender),
                "Address not whitelisted for seed round"
            );
        }
        
        uint256 usdValue = getETHValueInUSD(msg.value);
        uint256 currentPrice = getCurrentTokenPrice();
        (uint256 currentPhase,,) = getCurrentPhaseInfo();
        
        _buyTokens(usdValue, "ETH", currentPrice, currentPhase);
        
        // Transfer ETH to fund receiver
        (bool success, ) = payable(fundReceiverAddress).call{value: msg.value}("");
        require(success, "ETH transfer failed");
    }

    // USDC Purchase Function (conditional Merkle proof based on round)
    function buyTokensWithUSDC(
        uint256 _usdcAmount,
        bytes32[] memory proof
    ) external whenNotPaused nonReentrant {
        require(_usdcAmount > 0, "Invalid USDC amount");
        
        ICORoundDetails memory roundDetails = icoRoundDetails[currentRound];
        
        // Check whitelist only for Seed round
        if (roundDetails.requiresWhitelist) {
            require(
                addressIsWhiteListed(proof, msg.sender),
                "Address not whitelisted for seed round"
            );
        }
        
        IERC20 usdc = IERC20(usdcAddress);
        require(
            usdc.allowance(msg.sender, address(this)) >= _usdcAmount,
            "Insufficient USDC allowance"
        );
        
        _buyTokensWithStablecoin(usdcAddress, _usdcAmount, "USDC");
    }

    // USDT Purchase Function (conditional Merkle proof based on round)
    function buyTokensWithUSDT(
        uint256 _usdtAmount,
        bytes32[] memory proof
    ) external whenNotPaused nonReentrant {
        require(_usdtAmount > 0, "Invalid USDT amount");
        
        ICORoundDetails memory roundDetails = icoRoundDetails[currentRound];
        
        // Check whitelist only for Seed round
        if (roundDetails.requiresWhitelist) {
            require(
                addressIsWhiteListed(proof, msg.sender),
                "Address not whitelisted for seed round"
            );
        }
        
        IERC20 usdt = IERC20(usdtAddress);
        require(
            usdt.allowance(msg.sender, address(this)) >= _usdtAmount,
            "Insufficient USDT allowance"
        );
        
        _buyTokensWithStablecoin(usdtAddress, _usdtAmount, "USDT");
    }

    // Fiat Purchase Function (Owner only) - conditional whitelist check
    function buyTokensWithFiat(
        address _userAddress,
        uint256 _fiatAmountUSD,
        bytes32[] memory proof
    ) external onlyOwner validAddress(_userAddress) {
        require(_fiatAmountUSD >= MIN_PURCHASE_USD, "Purchase amount too small");
        
        ICORoundDetails memory roundDetails = icoRoundDetails[currentRound];
        
        // Check whitelist only for Seed round
        if (roundDetails.requiresWhitelist) {
            require(
                addressIsWhiteListed(proof, _userAddress),
                "Address not whitelisted for seed round"
            );
        }
        
        uint256 currentPrice = getCurrentTokenPrice();
        (uint256 currentPhase,,) = getCurrentPhaseInfo();
        
        ICORoundDetails storage roundDetailsStorage = icoRoundDetails[currentRound];
        require(roundDetailsStorage.isActive, "Round is not active");
        
        // Check wallet cap
        require(
            userPurchasesByRound[_userAddress][currentRound] + _fiatAmountUSD <= roundDetailsStorage.walletCapUSD,
            "Exceeds wallet cap for this round"
        );
        
        uint256 tokenAmount = calculateTokensForUSD(_fiatAmountUSD);
        
        // Check if enough tokens available in round
        require(
            tokenAmount <= (roundDetailsStorage.totalTokenAmount - roundDetailsStorage.tokensSold),
            "Not enough tokens available in round"
        );
        
        require(
            eyeToken.balanceOf(address(this)) >= tokenAmount,
            "Insufficient contract token balance"
        );
        
        // Update state
        roundDetailsStorage.tokensSold += tokenAmount;
        userPurchasesByRound[_userAddress][currentRound] += _fiatAmountUSD;
        totalUserPurchases[_userAddress] += _fiatAmountUSD;
        
        uint256 currentVestingId = 0;
        uint256 tgeAmount = 0;
        
        // Calculate TGE amount
        if (roundDetailsStorage.TGE > 0) {
            tgeAmount = (tokenAmount * roundDetailsStorage.TGE) / 100;
        }
        
        // Handle token distribution
        if (roundDetailsStorage.TGE == 100) {
            require(
                eyeToken.transfer(_userAddress, tokenAmount),
                "Token transfer failed"
            );
        } else {
            uint256 vestingAmount = tokenAmount - tgeAmount;
            if (vestingAmount > 0) {
                currentVestingId = _addUserToVesting(
                    vestingAmount,
                    roundDetailsStorage.cliff,
                    roundDetailsStorage.duration,
                    _userAddress,
                    false,
                    CollaboratorRole.Ecosystem // Default role for ICO participants
                );
            }
            
            if (tgeAmount > 0) {
                require(
                    eyeToken.transfer(_userAddress, tgeAmount),
                    "TGE token transfer failed"
                );
                emit TGETokensTransferred(_userAddress, tgeAmount, "FIAT");
            }
        }
        
        emit TokensPurchasedWithFiat(
            _userAddress,
            tokenAmount,
            tgeAmount,
            currentVestingId,
            _fiatAmountUSD,
            currentPrice,
            currentPhase
        );
    }

    function _buyTokensWithStablecoin(
        address _stablecoin,
        uint256 _stablecoinAmount,
        string memory stablecoinType
    ) private {
        uint256 usdValue = getUSDValue(_stablecoin, _stablecoinAmount);
        require(usdValue >= MIN_PURCHASE_USD, "Purchase amount too small");
        
        uint256 currentPrice = getCurrentTokenPrice();
        (uint256 currentPhase,,) = getCurrentPhaseInfo();
        
        _buyTokens(usdValue, stablecoinType, currentPrice, currentPhase);
        
        // Transfer stablecoins
        IERC20 stablecoin = IERC20(_stablecoin);
        require(
            stablecoin.transferFrom(msg.sender, fundReceiverAddress, _stablecoinAmount),
            "Stablecoin transfer failed"
        );
    }

    function _buyTokens(
        uint256 usdValue, 
        string memory paymentType, 
        uint256 currentPrice,
        uint256 currentPhase
    ) private {
        ICORoundDetails storage roundDetails = icoRoundDetails[currentRound];
        require(roundDetails.isActive, "Round is not active");
        
        // Check wallet cap
        require(
            userPurchasesByRound[msg.sender][currentRound] + usdValue <= roundDetails.walletCapUSD,
            "Exceeds wallet cap for this round"
        );
        
        uint256 tokenAmount = calculateTokensForUSD(usdValue);
        
        // Check if enough tokens available in round
        require(
            tokenAmount <= (roundDetails.totalTokenAmount - roundDetails.tokensSold),
            "Not enough tokens available in round"
        );
        
        require(
            eyeToken.balanceOf(address(this)) >= tokenAmount,
            "Insufficient contract token balance"
        );
        
        // Update state
        roundDetails.tokensSold += tokenAmount;
        userPurchasesByRound[msg.sender][currentRound] += usdValue;
        totalUserPurchases[msg.sender] += usdValue;
        
        uint256 currentVestingId = 0;
        uint256 tgeAmount = 0;
        
        // Calculate TGE amount
        if (roundDetails.TGE > 0) {
            tgeAmount = (tokenAmount * roundDetails.TGE) / 100;
        }
        
        // Handle token distribution
        if (roundDetails.TGE == 100) {
            require(
                eyeToken.transfer(msg.sender, tokenAmount),
                "Token transfer failed"
            );
        } else {
            uint256 vestingAmount = tokenAmount - tgeAmount;
            if (vestingAmount > 0) {
                currentVestingId = _addUserToVesting(
                    vestingAmount,
                    roundDetails.cliff,
                    roundDetails.duration,
                    msg.sender,
                    false,
                    CollaboratorRole.Ecosystem // Default role for ICO participants
                );
            }
            
            if (tgeAmount > 0) {
                require(
                    eyeToken.transfer(msg.sender, tgeAmount),
                    "TGE token transfer failed"
                );
                emit TGETokensTransferred(msg.sender, tgeAmount, paymentType);
            }
        }
        
        // Emit appropriate event based on payment type
        if (keccak256(abi.encodePacked(paymentType)) == keccak256(abi.encodePacked("ETH"))) {
            emit TokensPurchasedWithETH(
                msg.sender,
                msg.value,
                tokenAmount,
                tgeAmount,
                currentVestingId,
                usdValue,
                currentPrice,
                currentPhase
            );
        } else {
            emit TokensPurchasedWithStablecoin(
                msg.sender,
                tokenAmount,
                tgeAmount,
                currentVestingId,
                paymentType,
                usdValue,
                currentPrice,
                currentPhase
            );
        }
    }

    // Add Collaborator Function (updated with new roles)
    function addCollaborator(
        CollaboratorRole _role,
        address _userAddress,
        uint256 _tokenAmount
    ) external onlyOwner validAddress(_userAddress) validCollaboratorRole(_role) {
        CollaboratorDetails storage details = collaboratorDetails[_role];
        
        require(
            details.tokensAllocated + _tokenAmount <= details.totalTokenAmount,
            "Exceeds total allocation for this role"
        );
        
        require(
            eyeToken.balanceOf(address(this)) >= _tokenAmount,
            "Insufficient contract token balance"
        );
        
        // Update allocation
        details.tokensAllocated += _tokenAmount;
        
        uint256 tgeAmount = 0;
        uint256 vestingAmount = _tokenAmount;
        uint256 currentVestingId = 0;
        
        // Calculate TGE amount
        if (details.TGE > 0) {
            tgeAmount = (_tokenAmount * details.TGE) / 100;
            vestingAmount = _tokenAmount - tgeAmount;
        }
        
        // Handle token distribution
        if (details.TGE == 100) {
            require(
                eyeToken.transfer(_userAddress, _tokenAmount),
                "Token transfer failed"
            );
        } else {
            if (vestingAmount > 0) {
                currentVestingId = _addUserToVesting(
                    vestingAmount,
                    details.cliff,
                    details.duration,
                    _userAddress,
                    true,
                    _role
                );
            }
            
            if (tgeAmount > 0) {
                require(
                    eyeToken.transfer(_userAddress, tgeAmount),
                    "TGE token transfer failed"
                );
                emit TGETokensTransferred(_userAddress, tgeAmount, "COLLABORATOR");
            }
        }
        
        emit CollaboratorAdded(_userAddress, _role, _tokenAmount, tgeAmount, currentVestingId);
    }

    function claimTokens(uint256 _vestingId) external whenNotPaused nonReentrant {
        Vesting storage vesting = vestings[_vestingId];
        require(vesting.userAddress == msg.sender, "Not vesting beneficiary");

        uint256 claimableAmount = getClaimableTokenAmount(_vestingId);
        require(claimableAmount > 0, "No claimable tokens");

        // Update state before external call
        vesting.tokenTransferred += claimableAmount;
        
        require(
            eyeToken.transfer(msg.sender, claimableAmount),
            "Token transfer failed"
        );
        
        emit TokensClaimed(_vestingId, msg.sender, claimableAmount);
    }

    // View functions
    function getVestedTokenAmount(uint _vestingId) public view returns (uint256) {
        Vesting memory vesting = vestings[_vestingId];
        require(vesting.userAddress != address(0), "Invalid vesting id");
        
        uint256 cliffEnd = vesting.start + vesting.cliff;
        
        if (block.timestamp < cliffEnd) {
            return 0;
        } else if (block.timestamp >= vesting.start + vesting.cliff + vesting.duration) {
            return vesting.totalTokenAmount;
        } else {
            uint256 timeFromCliff = block.timestamp - cliffEnd;
            return (vesting.totalTokenAmount * timeFromCliff) / vesting.duration;
        }
    }

    function getClaimableTokenAmount(uint _vestingId) public view returns (uint256) {
        Vesting memory vesting = vestings[_vestingId];
        require(vesting.userAddress != address(0), "Invalid vesting id");
        
        uint256 vestedAmount = getVestedTokenAmount(_vestingId);
        return vestedAmount > vesting.tokenTransferred ? 
               vestedAmount - vesting.tokenTransferred : 0;
    }

    function getETHValueInUSD(uint256 ethAmount) public view returns (uint256) {
        (
            , // roundId
            int256 price,
            , // startedAt
            uint256 updatedAt,
            // answeredInRound
        ) = ethPriceFeed.latestRoundData();

        require(price > 0, "Invalid ETH price from feed");
        require(block.timestamp - updatedAt <= MAX_STALE_PERIOD, "Stale ETH price data");

        // Chainlink ETH/USD price feeds typically have 8 decimals
        // We want result in 6 decimals (PRECISION)
        uint256 priceDecimals = ethPriceFeed.decimals();
        uint256 usdValue = (ethAmount * uint256(price)) / (10 ** (priceDecimals + 18 - 6));
        
        return usdValue;
    }

    function getUSDValue(address stablecoin, uint256 amount) public view returns (uint256) {
        require(
            stablecoin == usdcAddress || stablecoin == usdtAddress,
            "Invalid stablecoin"
        );

        AggregatorV3Interface priceFeed = stablecoin == usdcAddress ? usdcPriceFeed : usdtPriceFeed;
        (
            , // roundId
            int256 price,
            , // startedAt
            uint256 updatedAt,
            // answeredInRound
        ) = priceFeed.latestRoundData();

        require(price > 0, "Invalid price from feed");
        require(block.timestamp - updatedAt <= MAX_STALE_PERIOD, "Stale price data");

        // Chainlink USD price feeds typically have 8 decimals
        // USDC/USDT have 6 decimals
        // We want result in 6 decimals (PRECISION)
        uint256 priceDecimals = priceFeed.decimals();
        uint256 usdValue = (amount * uint256(price)) / (10 ** priceDecimals);
        
        return usdValue;
    }

    function getICORoundDetails() public view returns (ICORoundDetails memory) {
        return icoRoundDetails[currentRound];
    }

    function getRoundDetails(ICORounds _round) public view validRound(_round) returns (ICORoundDetails memory) {
        return icoRoundDetails[_round];
    }

    function getCollaboratorDetails(CollaboratorRole _role) public view validCollaboratorRole(_role) returns (CollaboratorDetails memory) {
        return collaboratorDetails[_role];
    }

    function getUserPurchaseAmount(address user, ICORounds _round) public view returns (uint256) {
        return userPurchasesByRound[user][_round];
    }

    function getTotalUserPurchases(address user) public view returns (uint256) {
        return totalUserPurchases[user];
    }

    function getRemainingTokensInRound(ICORounds _round) public view validRound(_round) returns (uint256) {
        ICORoundDetails memory roundDetails = icoRoundDetails[_round];
        return roundDetails.totalTokenAmount - roundDetails.tokensSold;
    }

    function getRemainingCollaboratorTokens(CollaboratorRole _role) public view validCollaboratorRole(_role) returns (uint256) {
        CollaboratorDetails memory details = collaboratorDetails[_role];
        return details.totalTokenAmount - details.tokensAllocated;
    }

    function getContractTokenBalance() public view returns (uint256) {
        return eyeToken.balanceOf(address(this));
    }

    function getContractETHBalance() public view returns (uint256) {
        return address(this).balance;
    }

    function getVestingDetails(uint256 _vestingId) public view returns (
        uint256 totalTokenAmount,
        uint256 tokenTransferred,
        uint256 start,
        uint256 cliff,
        uint256 duration,
        address userAddress,
        bool isCollaborator,
        CollaboratorRole collaboratorRole
    ) {
        Vesting memory vesting = vestings[_vestingId];
        require(vesting.userAddress != address(0), "Invalid vesting id");
        
        return (
            vesting.totalTokenAmount,
            vesting.tokenTransferred,
            vesting.start,
            vesting.cliff,
            vesting.duration,
            vesting.userAddress,
            vesting.isCollaborator,
            vesting.collaboratorRole
        );
    }

    function getVestingAmounts(uint256 _vestingId) public view returns (
        uint256 claimableAmount,
        uint256 vestedAmount
    ) {
        require(vestings[_vestingId].userAddress != address(0), "Invalid vesting id");
        
        return (
            getClaimableTokenAmount(_vestingId),
            getVestedTokenAmount(_vestingId)
        );
    }

    // Check if current round requires whitelist
    function currentRoundRequiresWhitelist() public view returns (bool) {
        return icoRoundDetails[currentRound].requiresWhitelist;
    }

    // Admin functions
    function setMerkleRoot(bytes32 _merkleRoot) external onlyOwner {
        bytes32 oldRoot = merkleRoot;
        merkleRoot = _merkleRoot;
        emit MerkleRootUpdated(oldRoot, _merkleRoot);
    }

    function setICORound(ICORounds _round) external onlyOwner validRound(_round) {
        ICORounds oldRound = currentRound;
        
        // Deactivate current round
        if (icoRoundDetails[currentRound].isActive) {
            icoRoundDetails[currentRound].isActive = false;
        }
        
        currentRound = _round; 
        icoRoundDetails[currentRound].isActive = true;
        emit ICORoundChanged(oldRound, _round);
    }

    function closeCurrentRound() external onlyOwner {
        require(icoRoundDetails[currentRound].isActive, "Current round not active");
        icoRoundDetails[currentRound].isActive = false;
        emit RoundClosed(currentRound);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function withdrawTokens(
        ICORounds _round,
        address userAddress,
        uint256 amount
    ) external onlyOwner validAddress(userAddress) validRound(_round) {
        require(amount > 0, "Invalid amount");
        ICORoundDetails storage roundDetails = icoRoundDetails[_round];
        require(
            amount <= (roundDetails.totalTokenAmount - roundDetails.tokensSold),
            "Not enough tokens in round"
        ); 
        
        require(
            eyeToken.balanceOf(address(this)) >= amount,
            "Insufficient contract balance"
        );
        
        require(eyeToken.transfer(userAddress, amount), "Transfer failed");
        emit TokensWithdrawn(userAddress, amount, _round);
    }

    function withdrawCollaboratorTokens(
        CollaboratorRole _role,
        address userAddress,
        uint256 amount
    ) external onlyOwner validAddress(userAddress) validCollaboratorRole(_role) {
        require(amount > 0, "Invalid amount");
        CollaboratorDetails storage details = collaboratorDetails[_role];
        require(
            amount <= (details.totalTokenAmount - details.tokensAllocated),
            "Not enough tokens in collaborator pool"
        ); 
        
        require(
            eyeToken.balanceOf(address(this)) >= amount,
            "Insufficient contract balance"
        );
        
        require(eyeToken.transfer(userAddress, amount), "Transfer failed");
        emit TokensWithdrawn(userAddress, amount, ICORounds.Seed);
    }

    function emergencyWithdraw(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner validAddress(to) {
        require(amount > 0, "Invalid amount");
        
        if (token == address(0)) {
            // Withdraw ETH
            require(address(this).balance >= amount, "Insufficient ETH balance");
            payable(to).transfer(amount);
        } else {
            // Withdraw ERC20
            IERC20 tokenContract = IERC20(token);
            require(tokenContract.balanceOf(address(this)) >= amount, "Insufficient token balance");
            require(tokenContract.transfer(to, amount), "Token transfer failed");
        }
        
        emit EmergencyWithdraw(token, to, amount);
    }

    function updateFundReceiverAddress(address _newAddress) external onlyOwner validAddress(_newAddress) {
        address oldAddress = fundReceiverAddress;
        fundReceiverAddress = _newAddress;
        emit AddressUpdated("fundReceiver", oldAddress, _newAddress);
    }

    function setPriceFeed(
        string memory feedType,
        address priceFeed
    ) external onlyOwner validAddress(priceFeed) {
        require(
            keccak256(abi.encodePacked(feedType)) == keccak256(abi.encodePacked("ETH")) ||
            keccak256(abi.encodePacked(feedType)) == keccak256(abi.encodePacked("USDC")) ||
            keccak256(abi.encodePacked(feedType)) == keccak256(abi.encodePacked("USDT")),
            "Invalid feed type"
        );
        
        address oldFeed;
        if (keccak256(abi.encodePacked(feedType)) == keccak256(abi.encodePacked("ETH"))) {
            oldFeed = address(ethPriceFeed);
            ethPriceFeed = AggregatorV3Interface(priceFeed);
        } else if (keccak256(abi.encodePacked(feedType)) == keccak256(abi.encodePacked("USDC"))) {
            oldFeed = address(usdcPriceFeed);
            usdcPriceFeed = AggregatorV3Interface(priceFeed);
        } else {
            oldFeed = address(usdtPriceFeed);
            usdtPriceFeed = AggregatorV3Interface(priceFeed);
        }
        
        emit AddressUpdated(
            string(abi.encodePacked(feedType, "PriceFeed")), 
            oldFeed, 
            priceFeed
        );
    }

    function updateRoundDetails(
        ICORounds _round,
        uint8 _allocationPercent,
        uint256 _walletCapUSD,
        uint8 _TGE,
        uint256 _cliff,
        uint256 _duration,
        uint256 _fixedPrice,
        bool _requiresWhitelist
    ) external onlyOwner validRound(_round) {
        ICORoundDetails storage details = icoRoundDetails[_round];
        
        // Update allocation and recalculate total token amount
        if (_allocationPercent != details.allocationPercent) {
            uint256 totalSupply = 10000000000 * TOKEN_DECIMALS; // 10 billion tokens
            details.allocationPercent = _allocationPercent;
            details.totalTokenAmount = (totalSupply * _allocationPercent) / 100;
        }
        
        details.walletCapUSD = _walletCapUSD;
        details.TGE = _TGE;
        details.cliff = _cliff;
        details.duration = _duration;
        details.fixedPrice = _fixedPrice;
        details.requiresWhitelist = _requiresWhitelist;
    } 

    function updateCollaboratorDetails(
        CollaboratorRole _role,
        uint8 _allocationPercent,
        uint8 _TGE,
        uint256 _cliff,
        uint256 _duration,
        bool _cliffOffset
    ) external onlyOwner validCollaboratorRole(_role) {
        CollaboratorDetails storage details = collaboratorDetails[_role];
        
        // Update allocation and recalculate total token amount
        if (_allocationPercent != details.allocationPercent) {
            uint256 totalSupply = 10000000000 * TOKEN_DECIMALS; // 10 billion tokens
            details.allocationPercent = _allocationPercent;
            details.totalTokenAmount = (totalSupply * _allocationPercent) / 100;
        }
        
        details.TGE = _TGE;
        details.cliff = _cliff;
        details.duration = _duration;
        details.cliffOffset = _cliffOffset;
    }

    function _addUserToVesting(
        uint256 _tokenAmount,
        uint256 _cliff,
        uint256 _duration,
        address _userAddress,
        bool _isCollaborator,
        CollaboratorRole _collaboratorRole
    ) private returns (uint256) {
        vestingId++;
        vestings[vestingId] = Vesting({
            totalTokenAmount: _tokenAmount,
            tokenTransferred: 0,
            start: block.timestamp,
            cliff: _cliff,
            duration: _duration,
            userAddress: _userAddress,
            isCollaborator: _isCollaborator,
            collaboratorRole: _collaboratorRole
        });
        emit VestingAdded(vestingId, _userAddress, _tokenAmount, _isCollaborator);
        return vestingId;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // Allow contract to receive ETH
    receive() external payable {}
    
    fallback() external payable {}
}