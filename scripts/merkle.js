// C:\CN-Pro\SoluLab\Projects\EcoYieldEnergy\scripts\merkle.js
const { StandardMerkleTree } = require("@openzeppelin/merkle-tree");
const { ethers } = require("ethers");

class WhitelistMerkleTree {
    constructor() {
        this.whitelistData = [
            { address: "0x59D1660C1F9C88aFCebBdbCb28Acd8110fB4ad25" },
            { address: "0xd5Fb84b05742cD4F639Cd7Ca3a5129af5476C3CE" },
            { address: "0xD3FC75239395989eafb6C0510c17fa92614e9A7a" },
            { address: "0x6E72A2549768351EA0589dC47800AA3a33AB52A0" } // Replace with your Amoy testnet MetaMask address
        ];

        this.initializeMerkleTree();
    }

    initializeMerkleTree() {
        const values = this.whitelistData.map(x => [x.address]);
        this.merkleTree = StandardMerkleTree.of(values, ["address"]);
        this.merkleRoot = this.merkleTree.root;
    }

    getMerkleRoot() {
        console.log("\n=== Merkle Root for EYETokenICOAndVesting Pre-Sale Whitelist ===");
        console.log("Merkle Root:", this.merkleRoot);
        return this.merkleRoot;
    }

    getSingleProof(addressIndex = 0) {
        console.log("\n=== Merkle Proof for Single Address ===");
        if (addressIndex >= this.whitelistData.length) {
            throw new Error(`Invalid addressIndex: ${addressIndex}. Must be less than ${this.whitelistData.length}.`);
        }
        const claim = this.whitelistData[addressIndex];
        const leafIndex = this.merkleTree.leafLookup([claim.address]);
        const proof = this.merkleTree.getProof(leafIndex);

        console.log("Address:", claim.address);
        console.log("Proof (formatted for Remix):");
        console.log(JSON.stringify(proof));

        return { address: claim.address, proof };
    }

    getAllProofs() {
        console.log("\n=== Merkle Proofs for All Whitelisted Addresses ===");
        const proofs = [];

        for (const claim of this.whitelistData) {
            const leafIndex = this.merkleTree.leafLookup([claim.address]);
            const proof = this.merkleTree.getProof(leafIndex);
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
        console.log("   - Install dependencies: npm install @openzeppelin/merkle-tree ethers");
        console.log("   - Execute: node scripts/merkle.js");
        console.log("2. In Remix (connected to Polygon Amoy testnet):");
        console.log("   - Deploy EYETokenICOAndVesting and call setWhitelistMerkleRoot with the Merkle Root above.");
        console.log("   - Use the proof for a whitelisted address in buyTokensWithPOL, buyTokensWithUSDC, or registerFiatPurchase.");
        console.log("3. Update whitelistData with your Amoy testnet addresses if needed.");
        console.log("4. Ensure addresses match your MetaMask accounts funded with Amoy POL/USDC.");
    }
}

const tester = new WhitelistMerkleTree();
tester.getMerkleRoot();
tester.getSingleProof(3); // Tests your MetaMask address (index 3)
tester.getAllProofs();
tester.printInstructions();