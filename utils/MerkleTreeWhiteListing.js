const { ethers } = require("hardhat");
const { MerkleTree } = require("merkletreejs");

class MerkleTreeWhiteListing {
  constructor(whitelistAddresses = []) {
    this.whitelistAddresses = whitelistAddresses;
    this.merkleTree = this.calculateMerkleTree(whitelistAddresses);
  }

  /**
   * Get the Merkle root as a hex string
   * @returns {string} Merkle root with 0x prefix
   */
  getRoot() {
    if (this.whitelistAddresses.length === 0) {
      return "0x0000000000000000000000000000000000000000000000000000000000000000";
    }
    return "0x" + this.merkleTree.getRoot().toString("hex");
  }

  /**
   * Get Merkle proof for a specific address
   * @param {string} address - The address to get proof for
   * @returns {string[]} Array of proof hashes
   */
  getProof(address) {
    if (!ethers.isAddress(address)) {
      throw new Error("Invalid address format");
    }
    
    if (this.whitelistAddresses.length === 0) {
      return [];
    }

    // Convert address to checksum format to match contract behavior
    const checksumAddress = ethers.getAddress(address);
    
    const leaf = ethers.keccak256(ethers.solidityPacked(["address"], [checksumAddress]));
    const proof = this.merkleTree.getHexProof(leaf);
    
    return proof;
  }

  /**
   * Verify if an address is whitelisted
   * @param {string} address - The address to verify
   * @returns {boolean} True if address is whitelisted
   */
  isWhitelisted(address) {
    if (!ethers.isAddress(address)) {
      return false;
    }
    
    if (this.whitelistAddresses.length === 0) {
      return false;
    }

    const checksumAddress = ethers.getAddress(address);
    return this.whitelistAddresses.some(addr => 
      ethers.getAddress(addr) === checksumAddress
    );
  }

  /**
   * Add a single address to the whitelist
   * @param {string} address - Address to add
   */
  addWhitelistAddress(address) {
    if (!ethers.isAddress(address)) {
      throw new Error("Invalid address format");
    }
    
    const checksumAddress = ethers.getAddress(address);
    
    // Check if address already exists
    if (!this.isWhitelisted(checksumAddress)) {
      this.whitelistAddresses.push(checksumAddress);
      this.merkleTree = this.calculateMerkleTree(this.whitelistAddresses);
    }
  }

  /**
   * Add multiple addresses to the whitelist
   * @param {string[]} addresses - Array of addresses to add
   */
  addWhitelistAddresses(addresses) {
    const validAddresses = addresses.filter(addr => {
      if (!ethers.isAddress(addr)) {
        console.warn(`Invalid address skipped: ${addr}`);
        return false;
      }
      return true;
    });

    const checksumAddresses = validAddresses.map(addr => ethers.getAddress(addr));
    
    // Add only new addresses
    checksumAddresses.forEach(addr => {
      if (!this.isWhitelisted(addr)) {
        this.whitelistAddresses.push(addr);
      }
    });

    this.merkleTree = this.calculateMerkleTree(this.whitelistAddresses);
  }

  /**
   * Update the entire whitelist with new addresses
   * @param {string[]} addresses - New array of whitelisted addresses
   */
  updateWhitelistAddresses(addresses) {
    const validAddresses = addresses.filter(addr => {
      if (!ethers.isAddress(addr)) {
        console.warn(`Invalid address skipped: ${addr}`);
        return false;
      }
      return true;
    });

    this.whitelistAddresses = validAddresses.map(addr => ethers.getAddress(addr));
    this.merkleTree = this.calculateMerkleTree(this.whitelistAddresses);
  }

  /**
   * Remove an address from the whitelist
   * @param {string} address - Address to remove
   */
  removeWhitelistAddress(address) {
    if (!ethers.isAddress(address)) {
      throw new Error("Invalid address format");
    }
    
    const checksumAddress = ethers.getAddress(address);
    this.whitelistAddresses = this.whitelistAddresses.filter(addr => 
      ethers.getAddress(addr) !== checksumAddress
    );
    this.merkleTree = this.calculateMerkleTree(this.whitelistAddresses);
  }

  /**
   * Get all whitelisted addresses
   * @returns {string[]} Array of whitelisted addresses
   */
  getWhitelistAddresses() {
    return [...this.whitelistAddresses];
  }

  /**
   * Get the total number of whitelisted addresses
   * @returns {number} Count of whitelisted addresses
   */
  getWhitelistCount() {
    return this.whitelistAddresses.length;
  }

  /**
   * Calculate the Merkle tree from whitelist addresses
   * @param {string[]} whitelistAddresses - Array of addresses
   * @returns {MerkleTree} The calculated Merkle tree
   */
  calculateMerkleTree(whitelistAddresses) {
    if (whitelistAddresses.length === 0) {
      // Return empty tree for empty whitelist
      return new MerkleTree([], ethers.keccak256, { sortPairs: true });
    }

    // Create leaf nodes by hashing each address
    const leafNodes = whitelistAddresses.map(addr => {
      const checksumAddr = ethers.getAddress(addr);
      return ethers.keccak256(ethers.solidityPacked(["address"], [checksumAddr]));
    });

    // Create Merkle tree with sorted pairs for deterministic results
    const merkleTree = new MerkleTree(leafNodes, ethers.keccak256, {
      sortPairs: true,
    });

    return merkleTree;
  }

  /**
   * Export whitelist data as JSON
   * @returns {object} Object containing addresses, root, and metadata
   */
  exportData() {
    return {
      addresses: this.whitelistAddresses,
      root: this.getRoot(),
      count: this.getWhitelistCount(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Import whitelist data from JSON
   * @param {object} data - Data object with addresses array
   */
  importData(data) {
    if (data.addresses && Array.isArray(data.addresses)) {
      this.updateWhitelistAddresses(data.addresses);
    } else {
      throw new Error("Invalid data format - 'addresses' array required");
    }
  }

  /**
   * Generate proof data for contract interaction
   * @param {string} address - Address to generate proof for
   * @returns {object} Object with proof array and verification info
   */
  generateProofData(address) {
    const proof = this.getProof(address);
    const isWhitelisted = this.isWhitelisted(address);
    
    return {
      address: ethers.getAddress(address),
      proof: proof,
      isWhitelisted: isWhitelisted,
      root: this.getRoot()
    };
  }
}

module.exports = MerkleTreeWhiteListing;