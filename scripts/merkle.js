const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');
const { ethers } = require('ethers');

class WhitelistMerkleTree {
    constructor() {
        // Test addresses for pre-sale whitelist (replace with your Amoy testnet addresses)
        this.whitelistData = [
            { address: "0x59D1660C1F9C88aFCebBdbCb28Acd8110fB4ad25" },
            { address: "0xd5Fb84b05742cD4F639Cd7Ca3a5129af5476C3CE" },
            { address: "0xD3FC75239395989eafb6C0510c17fa92614e9A7a" }
        ];

        // Initialize Merkle Tree
        this.initializeMerkleTree();
    }

    initializeMerkleTree() {
        // Create leaves by hashing addresses (matches contract's keccak256(abi.encodePacked(user)))
        this.leaves = this.whitelistData.map(x => 
            ethers.solidityPackedKeccak256(["address"], [x.address])
        );

        // Create Merkle Tree with keccak256 and sortPairs enabled
        this.merkleTree = new MerkleTree(this.leaves, keccak256, { sortPairs: true });
        this.merkleRoot = this.merkleTree.getHexRoot();
    }

    getMerkleRoot() {
        console.log("\n=== Merkle Root for EYETokenSale Pre-Sale Whitelist ===");
        console.log("Merkle Root:", this.merkleRoot);
        return this.merkleRoot;
    }

    getSingleProof(addressIndex = 0) {
        console.log("\n=== Merkle Proof for Single Address ===");
        const claim = this.whitelistData[addressIndex];
        const leaf = ethers.solidityPackedKeccak256(["address"], [claim.address]);
        const proof = this.merkleTree.getHexProof(leaf);

        console.log("Address:", claim.address);
        console.log("Proof (formatted for Remix):");
        console.log(JSON.stringify(proof));

        return { address: claim.address, proof };
    }

    getAllProofs() {
        console.log("\n=== Merkle Proofs for All Whitelisted Addresses ===");
        const proofs = [];

        for (const claim of this.whitelistData) {
            const leaf = ethers.solidityPackedKeccak256(["address"], [claim.address]);
            const proof = this.merkleTree.getHexProof(leaf);
            proofs.push({ address: claim.address, proof });

            console.log("\nAddress:", claim.address);
            console.log("Proof (formatted for Remix):");
            console.log(JSON.stringify(proof));
        }

        return proofs;
    }

    printInstructions() {
        console.log("\n=== Instructions for Using Merkle Data in Remix ===");
        console.log("1. Run this script in VSCode to generate the Merkle root and proofs:");
        console.log("   - Install dependencies: npm install merkletreejs keccak256 ethers");
        console.log("   - Execute: node merkle.js");
        console.log("2. In Remix (connected to Polygon Amoy testnet):");
        console.log("   - Deploy EYETokenSale and call setMerkleRoot with the Merkle Root above.");
        console.log("   - Use the proof for a whitelisted address in buyTokensWithUSD or buyTokensWithPOL.");
        console.log("3. Replace whitelistData addresses with your own Amoy testnet addresses if needed.");
    }
}

// Run the script
const tester = new WhitelistMerkleTree();

// Get Merkle Root
tester.getMerkleRoot();

// Get proof for a single address
tester.getSingleProof();

// Get proofs for all addresses
tester.getAllProofs();

// Print instructions
tester.printInstructions();