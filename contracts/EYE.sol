// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract EcoYield is 
    Initializable, 
    ERC20Upgradeable, 
    OwnableUpgradeable, 
    PausableUpgradeable, 
    UUPSUpgradeable 
{
    // Total supply: 1 billion tokens
    uint256 private constant TOTAL_SUPPLY = 1_000_000_000 * 10**18;
    
    // Allocation addresses
    address public preSeedWallet;
    address public seedWallet;
    address public publicWallet;
    address public communityWallet;
    address public treasuryWallet;
    address public liquidityWallet;
    address public stakingWallet;
    address public earlyLPRewardsWallet;
    address public teamWallet;
    address public advisorsWallet;
    

    
    // Track if allocation has been done
    bool private _allocated;
    
    // Events
    event AllocationWalletsSet(
        address preSeed,
        address seed,
        address public_,
        address community,
        address treasury,
        address liquidity,
        address staking,
        address earlyLPRewards,
        address team,
        address advisors
    );
    
    event TokensAllocated();
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    function initialize(
        address _preSeedWallet,
        address _seedWallet,
        address _publicWallet,
        address _communityWallet,
        address _treasuryWallet,
        address _liquidityWallet,
        address _stakingWallet,
        address _earlyLPRewardsWallet,
        address _teamWallet,
        address _advisorsWallet
    ) public initializer {
        __ERC20_init("EcoYield", "EYE");
        __Ownable_init(msg.sender);
        __Pausable_init();
        __UUPSUpgradeable_init();
        
        // Set allocation wallets
        setAllocationWallets(
            _preSeedWallet,
            _seedWallet,
            _publicWallet,
            _communityWallet,
            _treasuryWallet,
            _liquidityWallet,
            _stakingWallet,
            _earlyLPRewardsWallet,
            _teamWallet,
            _advisorsWallet
        );
        
        // Allocate tokens (only once during deployment)
        _allocateTokens();
    }
    
    function setAllocationWallets(
        address _preSeedWallet,
        address _seedWallet,
        address _publicWallet,
        address _communityWallet,
        address _treasuryWallet,
        address _liquidityWallet,
        address _stakingWallet,
        address _earlyLPRewardsWallet,
        address _teamWallet,
        address _advisorsWallet
    ) public onlyOwner {
        require(_preSeedWallet != address(0), "PreSeed wallet cannot be zero address");
        require(_seedWallet != address(0), "Seed wallet cannot be zero address");
        require(_publicWallet != address(0), "Public wallet cannot be zero address");
        require(_communityWallet != address(0), "Community wallet cannot be zero address");
        require(_treasuryWallet != address(0), "Treasury wallet cannot be zero address");
        require(_liquidityWallet != address(0), "Liquidity wallet cannot be zero address");
        require(_stakingWallet != address(0), "Staking wallet cannot be zero address");
        require(_earlyLPRewardsWallet != address(0), "Early LP rewards wallet cannot be zero address");
        require(_teamWallet != address(0), "Team wallet cannot be zero address");
        require(_advisorsWallet != address(0), "Advisors wallet cannot be zero address");
        
        preSeedWallet = _preSeedWallet;
        seedWallet = _seedWallet;
        publicWallet = _publicWallet;
        communityWallet = _communityWallet;
        treasuryWallet = _treasuryWallet;
        liquidityWallet = _liquidityWallet;
        stakingWallet = _stakingWallet;
        earlyLPRewardsWallet = _earlyLPRewardsWallet;
        teamWallet = _teamWallet;
        advisorsWallet = _advisorsWallet;
        
        emit AllocationWalletsSet(
            _preSeedWallet,
            _seedWallet,
            _publicWallet,
            _communityWallet,
            _treasuryWallet,
            _liquidityWallet,
            _stakingWallet,
            _earlyLPRewardsWallet,
            _teamWallet,
            _advisorsWallet
        );
    }
    
    function _allocateTokens() internal {
        require(!_allocated, "Tokens have already been allocated");
        
        // Calculate allocation amounts with hardcoded values
        uint256 preSeedAmount = (TOTAL_SUPPLY * 500) / 10000;        // 5.00%
        uint256 seedAmount = (TOTAL_SUPPLY * 1250) / 10000;          // 12.50%
        uint256 publicAmount = (TOTAL_SUPPLY * 500) / 10000;         // 5.00%
        uint256 communityAmount = (TOTAL_SUPPLY * 1500) / 10000;     // 15.00%
        uint256 treasuryAmount = (TOTAL_SUPPLY * 2250) / 10000;      // 22.50%
        uint256 liquidityAmount = (TOTAL_SUPPLY * 1000) / 10000;     // 10.00%
        uint256 stakingAmount = (TOTAL_SUPPLY * 1000) / 10000;       // 10.00%
        uint256 earlyLPRewardsAmount = (TOTAL_SUPPLY * 500) / 10000; // 5.00%
        uint256 teamAmount = (TOTAL_SUPPLY * 1000) / 10000;          // 10.00%
        uint256 advisorsAmount = (TOTAL_SUPPLY * 500) / 10000;       // 5.00%
        
        // Mint tokens to allocation wallets
        _mint(preSeedWallet, preSeedAmount);
        _mint(seedWallet, seedAmount);
        _mint(publicWallet, publicAmount);
        _mint(communityWallet, communityAmount);
        _mint(treasuryWallet, treasuryAmount);
        _mint(liquidityWallet, liquidityAmount);
        _mint(stakingWallet, stakingAmount);
        _mint(earlyLPRewardsWallet, earlyLPRewardsAmount);
        _mint(teamWallet, teamAmount);
        _mint(advisorsWallet, advisorsAmount);
        
        // Mark as allocated to prevent future allocations
        _allocated = true;
        
        emit TokensAllocated();
    }
    
    // Function to check if tokens have been allocated
    function isAllocated() external view returns (bool) {
        return _allocated;
    }
    
    // Function to get allocation amounts
    function getAllocationAmounts() external pure returns (
        uint256 preSeedAmount,
        uint256 seedAmount,
        uint256 publicAmount,
        uint256 communityAmount,
        uint256 treasuryAmount,
        uint256 liquidityAmount,
        uint256 stakingAmount,
        uint256 earlyLPRewardsAmount,
        uint256 teamAmount,
        uint256 advisorsAmount
    ) {
        preSeedAmount = (TOTAL_SUPPLY * 500) / 10000;        // 5.00%
        seedAmount = (TOTAL_SUPPLY * 1250) / 10000;          // 12.50%
        publicAmount = (TOTAL_SUPPLY * 500) / 10000;         // 5.00%
        communityAmount = (TOTAL_SUPPLY * 1500) / 10000;     // 15.00%
        treasuryAmount = (TOTAL_SUPPLY * 2250) / 10000;      // 22.50%
        liquidityAmount = (TOTAL_SUPPLY * 1000) / 10000;     // 10.00%
        stakingAmount = (TOTAL_SUPPLY * 1000) / 10000;       // 10.00%
        earlyLPRewardsAmount = (TOTAL_SUPPLY * 500) / 10000; // 5.00%
        teamAmount = (TOTAL_SUPPLY * 1000) / 10000;          // 10.00%
        advisorsAmount = (TOTAL_SUPPLY * 500) / 10000;       // 5.00%
    }
    
    // Pausable functions
    function pause() public onlyOwner {
        _pause();
    }
    
    function unpause() public onlyOwner {
        _unpause();
    }
    
    function _update(
        address from,
        address to,
        uint256 value
    ) internal override whenNotPaused {
        super._update(from, to, value);
    }
    
    // UUPS upgrade authorization
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
    
    // Function to get current version (useful for upgrades)
    function version() public pure returns (string memory) {
        return "1.0.0";
    }
} 