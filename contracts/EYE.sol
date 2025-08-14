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
    
    // Track if initial minting has been done
    bool private _initialMinted;
    
    // Events
    event InitialTokensMinted(address admin, uint256 amount);
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    function initialize() public initializer {
        __ERC20_init("EcoYield", "EYE");
        __Ownable_init(msg.sender);
        __Pausable_init();
        __UUPSUpgradeable_init();
        
        // Mint all tokens to the admin (owner)
        _mintInitialTokens();
    }
    
    function _mintInitialTokens() internal {
        require(!_initialMinted, "Initial tokens have already been minted");
        
        // Mint all tokens to the owner (admin)
        _mint(owner(), TOTAL_SUPPLY);
        
        // Mark as minted to prevent future initial minting
        _initialMinted = true;
        
        emit InitialTokensMinted(owner(), TOTAL_SUPPLY);
    }
    
    // Function to check if initial tokens have been minted
    function isInitialMinted() external view returns (bool) {
        return _initialMinted;
    }
    
    // Function to get total supply constant
    function getTotalSupply() external pure returns (uint256) {
        return TOTAL_SUPPLY;
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