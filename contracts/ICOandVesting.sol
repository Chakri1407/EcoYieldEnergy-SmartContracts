// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol"; 
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol"; 
// import "./interfaces/IEYE.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol"; 

contract EyeICOAndVesting is
    OwnableUpgradeable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable
{
    enum ICORounds {
        // PrivateSeed,
        PreSale 
        // PublicSale
    } 
    // enum Role {
    //     TeamMember,
    //     Advisor
    // }

    struct ICORoundDetails {
        uint8 allocationPercent;
        uint256 tokenPrice; // Price in USD with 6 decimals (e.g., $0.04 = 40000)
        uint256 TotalTokenAmount;
        uint256 availableTokenAmount;
        uint8 TGE; // TGE percentage (e.g., 5% = 5)
        uint256 cliff; // in Seconds
        uint256 duration; // in Seconds
        uint256 walletCap; // in USD with 6 decimals (e.g., $10,000 = 10000000000)
        bool isActive;
    }

    struct Vesting {
        uint256 totalTokenAmount; // Total tokens in vesting (excludes TGE)
        uint256 tokenTransferred;
        uint256 start;
        uint256 cliff;
        uint256 duration;
        address userAddress;
    }

    // struct CollaboratorVesting {
    //     uint256 totalTokenAmount;
    //     uint256 tokenAvailableForVesting;
    //     uint256 cliff;
    //     uint256 duration;
    // }

    // struct AddCollaboratorInput {
    //     uint256 amount;
    //     address userAddress;
    // }

    event TokensPurchased(
        address indexed purchaser,
        uint256 tokenAmount,
        uint256 tgeAmount,
        uint256 vestingId,
        string stablecoinType
    );
    // event CollaboratorAdded(
    //     address indexed userAddress,
    //     uint256 amount,
    //     uint256 vestingId
    // );
    event VestingAdded(
        uint256 indexed vestingId,
        address indexed userAddress,
        uint256 totalTokenAmount
    );
    event TokensClaimed(
        uint256 indexed vestingId,
        address indexed beneficiary,
        uint256 claimableAmount
    );
    event ICORoundChanged(ICORounds indexed round);
    event PresaleClosed();
    event TokensWithdrawn(address indexed receiver, uint256 amount);
    event RootForPresaleUpdated(bytes32 NewRoot);
    event WhitelistUserAdded(address indexed userAddress);
    
    event TGETokensTransferred(
    address indexed purchaser,
    uint256 tgeAmount,
    string stablecoinType
    );
    IERC20 public eyeToken;
    ICORounds public round;
    uint256 public vestingId;
    bytes32 public rootForPresale;
    address public fundReceiverAddress;
    address public usdcAddress;
    address public usdtAddress;
    AggregatorV3Interface public usdcPriceFeed;
    AggregatorV3Interface public usdtPriceFeed;
    
    // Fixed-size array to hold the details for each round
    ICORoundDetails[3] public icoRoundDetails;
//    CollaboratorVesting[2] public collaboratorVestings;
    mapping(uint256 => Vesting) public vestings;
    mapping(address => uint256) public userPurchases;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        IERC20 _eyeToken,
        address _fundReceiverAddress,
        address _usdcAddress,
        address _usdtAddress,
        address _usdcPriceFeed,
        address _usdtPriceFeed 
    ) public initializer {
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        uint TotalTokenSupply = 400000000 * 1e18;
        vestingId = 0;

        // Private/Seed Sale: 10% allocation, $0.04 price, 5% TGE, 6-month cliff, 18-month vesting, $10,000 wallet cap
        // icoRoundDetails[uint(ICORounds.PrivateSeed)] = ICORoundDetails(
        //     10,
        //     40000, // $0.04 with 6 decimals
        //     (TotalTokenSupply * 10) / 100,
        //     (TotalTokenSupply * 10) / 100,
        //     5, // 5% TGE
        //     300, // 5 minutes cliff for testing, should be 6 months (6 * 30 * 24 * 60 * 60)
        //     600, // 10 minutes vesting for testing, should be 18 months (18 * 30 * 24 * 60 * 60)
        //     10000 * 1e6, // $10,000 with 6 decimals
        //     true
        // );
        
        // Pre-Sale: 10% allocation, $0.04 price, 20% TGE, 6-month cliff, 18-month vesting, $10,000 wallet cap
        icoRoundDetails[uint(ICORounds.PreSale)] = ICORoundDetails(
            10,
            40000, // $0.04 with 6 decimals
            (TotalTokenSupply * 10) / 100,
            (TotalTokenSupply * 10) / 100, 
            20, // 20% TGE 
            300, // 5 minutes cliff for testing
            600, // 10 minutes vesting for testing
            10000 * 1e6, // $10,000 with 6 decimals
            true
        );
        
        // Public Sale: 15% allocation, $0.06 price, 100% TGE (no vesting), $20,000 wallet cap
        // icoRoundDetails[uint(ICORounds.PublicSale)] = ICORoundDetails(
        //     15,
        //     60000, // $0.06 with 6 decimals
        //     (TotalTokenSupply * 15) / 100,
        //     (TotalTokenSupply * 15) / 100,
        //     100, // 100% TGE (immediate release)
        //     0,
        //     0,
        //     20000 * 1e6, // $20,000 with 6 decimals
        //     false
        // );

        // Team & Advisors: No TGE, 12-month cliff, 36-month vesting
        // collaboratorVestings[uint(Role.TeamMember)] = CollaboratorVesting(
        //     (TotalTokenSupply * 10) / 100,
        //     (TotalTokenSupply * 10) / 100,
        //     12 * 30 * 24 * 60 * 60, // 12 months
        //     36 * 30 * 24 * 60 * 60  // 36 months
        // );
        // collaboratorVestings[uint(Role.Advisor)] = CollaboratorVesting(
        //     (TotalTokenSupply * 5) / 100,
        //     (TotalTokenSupply * 5) / 100,
        //     12 * 30 * 24 * 60 * 60, // 12 months
        //     36 * 30 * 24 * 60 * 60  // 36 months
        // );

        eyeToken = _eyeToken;
        round = ICORounds.PreSale;
        fundReceiverAddress = _fundReceiverAddress;
        usdcAddress = _usdcAddress;
        usdtAddress = _usdtAddress;
        usdcPriceFeed = AggregatorV3Interface(_usdcPriceFeed);
        usdtPriceFeed = AggregatorV3Interface(_usdtPriceFeed);
    }

    function buyTokensWithUSDC(
        uint256 _usdcAmount,
        bytes32[] memory proof
    ) external nonReentrant {
        require(_usdcAmount > 0, "buyTokensWithUSDC: No USDC amount specified");
        
        // Verify we're receiving USDC payment
        IERC20 usdc = IERC20(usdcAddress);
        require(
            usdc.allowance(msg.sender, address(this)) >= _usdcAmount,
            "buyTokensWithUSDC: Insufficient USDC allowance"
        );
        
        _buyTokens(usdcAddress, _usdcAmount, proof, "USDC");
    }

    function buyTokensWithUSDT(
        uint256 _usdtAmount,
        bytes32[] memory proof
    ) external nonReentrant {
        require(_usdtAmount > 0, "buyTokensWithUSDT: No USDT amount specified");
        
        // Verify we're receiving USDT payment
        IERC20 usdt = IERC20(usdtAddress);
        require(
            usdt.allowance(msg.sender, address(this)) >= _usdtAmount,
            "buyTokensWithUSDT: Insufficient USDT allowance"
        );
        
        _buyTokens(usdtAddress, _usdtAmount, proof, "USDT");
    }

    function _buyTokens(
        address _stablecoin,
        uint256 _stablecoinAmount,
        bytes32[] memory proof,
        string memory stablecoinType
    ) private {
        // Check if the round is active
        ICORoundDetails storage ICORoundDetail = icoRoundDetails[uint(round)];
        require(ICORoundDetail.isActive, "_buyTokens: Round is not active");
        
        // Check whitelist for pre-sale round
        if (round == ICORounds.PreSale) {
            require(
                addressIsWhiteListed(proof, msg.sender),
                "_buyTokens: Address is not whitelisted for pre-sale"
            );
        }
        
        // Calculate USD value of stablecoin
        uint256 usdValue = getUSDValue(_stablecoin, _stablecoinAmount);
        
        // Check wallet cap
        require(
            userPurchases[msg.sender] + usdValue <= ICORoundDetail.walletCap,
            "_buyTokens: Exceeds wallet cap"
        );
        
        // Calculate token amount
        uint256 tokenAmount = (usdValue * 1e18) / ICORoundDetail.tokenPrice;
        
        // Check if enough tokens available
        require(
            tokenAmount <= ICORoundDetail.availableTokenAmount &&
            eyeToken.balanceOf(address(this)) >= tokenAmount &&
            ICORoundDetail.availableTokenAmount != 0,
            "_buyTokens: Not enough tokens available in this round"
        );
        
        // Update available tokens
        ICORoundDetail.availableTokenAmount -= tokenAmount;
        
        // Update user purchases
        userPurchases[msg.sender] += usdValue;
        
        // Transfer stablecoins to fund receiver
        IERC20 stablecoin = IERC20(_stablecoin);
        require(
            stablecoin.transferFrom(msg.sender, fundReceiverAddress, _stablecoinAmount),
            "_buyTokens: Stablecoin transfer failed"
        );
        
        uint256 currentVestingId = 0;
        uint256 tgeAmount = 0;
        
        // Calculate TGE amount
        if (ICORoundDetail.TGE > 0) {
            tgeAmount = (tokenAmount * ICORoundDetail.TGE) / 100;
        }
        
        // Handle token distribution based on TGE percentage
        if (ICORoundDetail.TGE == 100) {
            // 100% TGE - immediate release (Public Sale)
            require(
                eyeToken.transfer(msg.sender, tokenAmount),
                "_buyTokens: Token transfer failed"
            );
        } else {
            // Create vesting for remaining tokens (after TGE)
            uint256 vestingAmount = tokenAmount - tgeAmount;
            if (vestingAmount > 0) {
                currentVestingId = addUserToVesting(
                    vestingAmount, // Only vesting amount, not total
                    ICORoundDetail.cliff,
                    ICORoundDetail.duration,
                    msg.sender
                );
            }
            
            // Transfer TGE amount immediately if applicable
            if (tgeAmount > 0) {
                require(
                    eyeToken.transfer(msg.sender, tgeAmount),
                    "_buyTokens: TGE token transfer failed"
                );
            emit TGETokensTransferred(msg.sender, tgeAmount, stablecoinType);
            }
        }
        
        emit TokensPurchased(
            msg.sender,
            tokenAmount,
            tgeAmount,
            currentVestingId,
            stablecoinType
        );
    }

    function claimTokens(uint256 _vestingId) external {
        Vesting storage vesting = vestings[_vestingId];
        require(
            vesting.userAddress != address(0),
            "claimTokens: Invalid vesting id"
        );
        require(
            vesting.userAddress == msg.sender,
            "claimTokens: Only vesting beneficiary can claim tokens"
        );

        uint256 claimableAmount = getClaimableTokenAmount(_vestingId);
        require(claimableAmount > 0, "claimTokens: No claimable amount");

        vesting.tokenTransferred += claimableAmount;
        require(
            eyeToken.transfer(msg.sender, claimableAmount),
            "claimTokens: Transfer failed"
        );
        
        emit TokensClaimed(_vestingId, msg.sender, claimableAmount);
    }

    // function addWhitelistUsers(address[] memory users) external onlyOwner {
    //     require(round == ICORounds.PreSale, "addWhitelistUsers: Only available during pre-sale");
        
    //     for (uint i = 0; i < users.length; i++) {
    //         require(
    //             users[i] != address(0),
    //             "addWhitelistUsers: Invalid user address"
    //         );
    //         emit WhitelistUserAdded(users[i]);
    //     }
    // }

    function setRootForPresale(bytes32 _rootForPresale) external onlyOwner {
        require(
            _rootForPresale != bytes32(0),
            "setRootForPresale: Invalid root"
        );
        rootForPresale = _rootForPresale;
        emit RootForPresaleUpdated(_rootForPresale);
    }

    function setICORound(ICORounds _round) external onlyOwner {
        round = _round; 
        icoRoundDetails[uint(round)].isActive = true;
        emit ICORoundChanged(_round);
    }

    function closePreSale() external onlyOwner {
        require(
            round == ICORounds.PreSale,
            "closePreSale: Current round is not pre-sale"
        );
        icoRoundDetails[uint(ICORounds.PreSale)].isActive = false;
        emit PresaleClosed();
    }

    function withdrawTokens(
        ICORounds _round,
        address userAddress,
        uint256 amount
    ) external onlyOwner {
        require(amount > 0, "withdrawTokens: Invalid token amount");
        require(
            icoRoundDetails[uint(_round)].availableTokenAmount >= amount,
            "withdrawTokens: Not enough tokens"
        ); 
        icoRoundDetails[uint(_round)].availableTokenAmount -= amount;
        require(
            eyeToken.balanceOf(address(this)) >= amount,
            "withdrawTokens: Insufficient token balance"
        );
        require(eyeToken.transfer(userAddress, amount), "withdrawTokens: Transfer failed");
        emit TokensWithdrawn(userAddress, amount);
    }

    // function addCollaborator(
    //     Role _role,
    //     AddCollaboratorInput[] memory collaborators
    // ) public onlyOwner {
    //     CollaboratorVesting storage collaboratorVesting = collaboratorVestings[
    //         uint(_role)
    //     ];

    //     for (uint i = 0; i < collaborators.length; ) {
    //         if (
    //             collaboratorVesting.tokenAvailableForVesting >= collaborators[i].amount &&
    //             collaborators[i].userAddress != address(0)
    //         ) {
    //             uint256 currentVestingId = addUserToVesting(
    //                 collaborators[i].amount,
    //                 collaboratorVesting.cliff,
    //                 collaboratorVesting.duration,
    //                 collaborators[i].userAddress
    //             );
    //             collaboratorVesting.tokenAvailableForVesting -= collaborators[i].amount;
    //             emit CollaboratorAdded(
    //                 collaborators[i].userAddress,
    //                 collaborators[i].amount,
    //                 currentVestingId
    //             );
    //         }
    //         unchecked {
    //             i++;
    //         }
    //     }
    // }

    function addressIsWhiteListed(
        bytes32[] memory proof,
        address _userAddress
    ) public view returns (bool) {
        return MerkleProof.verify(
            proof,
            rootForPresale,
            keccak256(abi.encodePacked(_userAddress))
        );
    }

    function getVestedTokenAmount(
        uint _vestingId
    ) public view returns (uint256 vestedTokenAmount) {
        Vesting memory vesting = vestings[_vestingId];
        require(
            vesting.userAddress != address(0),
            "getVestedTokenAmount: Invalid vesting id"
        );
        
        uint256 cliff = vesting.cliff + vesting.start;
        if (block.timestamp < cliff) {
            return 0;
        } else if (
            block.timestamp >= vesting.start + vesting.cliff + vesting.duration
        ) {
            return vesting.totalTokenAmount;
        } else {
            // Calculate how much has vested linearly
            uint256 timeFromCliff = block.timestamp - cliff;
            return (vesting.totalTokenAmount * timeFromCliff) / vesting.duration;
        }
    }

    function getClaimableTokenAmount(
        uint _vestingId
    ) public view returns (uint256 claimableTokenAmount) {
        Vesting memory vesting = vestings[_vestingId];
        uint256 vestedTokenAmount = getVestedTokenAmount(_vestingId);
        
        // Vested tokens till now - token transferred till now = current claimable amount
        return vestedTokenAmount > vesting.tokenTransferred ? 
               vestedTokenAmount - vesting.tokenTransferred : 0;
    }

    function getICORoundDetails() public view returns (ICORoundDetails memory) {
        return icoRoundDetails[uint(round)];
    }

    function getUserPurchaseAmount(address user) public view returns (uint256) {
        return userPurchases[user];
    }

    function getUSDValue(address stablecoin, uint256 amount) public view returns (uint256) {
        require(
            stablecoin == usdcAddress || stablecoin == usdtAddress,
            "getUSDValue: Invalid stablecoin address"
        );

        AggregatorV3Interface priceFeed = stablecoin == usdcAddress ? usdcPriceFeed : usdtPriceFeed;
        (
            , // roundId
            int256 price,
            , // startedAt
            uint256 updatedAt,
            // answeredInRound
        ) = priceFeed.latestRoundData();

        require(price > 0, "getUSDValue: Invalid price from price feed");
        require(block.timestamp - updatedAt <= 1 hours, "getUSDValue: Stale price data");

        // Chainlink price feeds return prices with 8 decimals (e.g., USDC/USD = 1.00 is 1e8)
        // Stablecoins (USDC, USDT) have 6 decimals
        // USD value = (amount * price) / (10^priceDecimals) normalized to 6 decimals
        uint256 priceDecimals = priceFeed.decimals(); // Typically 8 for USDC/USD, USDT/USD
        uint256 usdValue = (amount * uint256(price)) / (10 ** priceDecimals);
        
        // Adjust to 6 decimals to match tokenPrice and walletCap
        return usdValue;
    }

    function setPriceFeed(address stablecoin, address priceFeed) external onlyOwner {
        require(stablecoin == usdcAddress || stablecoin == usdtAddress, "setPriceFeed: Invalid stablecoin");
        require(priceFeed != address(0), "setPriceFeed: Invalid price feed");
        if (stablecoin == usdcAddress) {
            usdcPriceFeed = AggregatorV3Interface(priceFeed);
        } else {
            usdtPriceFeed = AggregatorV3Interface(priceFeed);
        }
    }

    function addUserToVesting(
        uint256 _tokenAmount,
        uint256 _cliff,
        uint256 _duration,
        address _userAddress
    ) private returns (uint256) {
        vestingId++;
        vestings[vestingId] = Vesting({
            totalTokenAmount: _tokenAmount,
            tokenTransferred: 0,
            start: block.timestamp,
            cliff: _cliff,
            duration: _duration,
            userAddress: _userAddress
        });
        emit VestingAdded(vestingId, _userAddress, _tokenAmount);
        return vestingId;
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}
}