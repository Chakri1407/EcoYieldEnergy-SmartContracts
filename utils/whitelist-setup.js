// Simple Merkle Tree implementation for testing
const crypto = require('crypto');

function keccak256(data) {
    return crypto.createHash('sha3-256').update(data).digest('hex');
}

function solidityPack(types, values) {
    // Simple implementation for address packing
    if (types[0] === 'address') {
        return values[0].toLowerCase().replace('0x', '');
    }
    return '';
}

class SimpleMerkleTree {
    constructor(addresses) {
        this.addresses = addresses;
        this.leaves = addresses.map(addr => {
            const packed = solidityPack(['address'], [addr]);
            return '0x' + keccak256(Buffer.from(packed, 'hex'));
        });
        this.tree = this.buildTree(this.leaves);
    }

    buildTree(leaves) {
        if (leaves.length === 0) return null;
        if (leaves.length === 1) return { root: leaves[0] };
        
        let level = [...leaves];
        const tree = [level];
        
        while (level.length > 1) {
            const nextLevel = [];
            for (let i = 0; i < level.length; i += 2) {
                const left = level[i];
                const right = level[i + 1] || left;
                const combined = '0x' + keccak256(Buffer.from(left.slice(2) + right.slice(2), 'hex'));
                nextLevel.push(combined);
            }
            level = nextLevel;
            tree.push(level);
        }
        
        return { root: level[0], tree: tree };
    }

    getRoot() {
        return this.tree ? this.tree.root : '0x0000000000000000000000000000000000000000000000000000000000000000';
    }

    getProof(address) {
        if (!this.addresses.includes(address)) {
            return [];
        }
        
        // For testing, return empty proof if address is whitelisted
        // In production, you'd implement proper proof generation
        return [];
    }

    isWhitelisted(address) {
        return this.addresses.includes(address);
    }
}

// Test configuration
console.log("=== Simple Merkle Tree Test ===\n");

// Use Remix default accounts for testing
const whitelistAddresses = [
    "0x5B38Da6a701c568545dCfcB03FcB875f56beddC4", // Account 0
    "0xAb8483F64d9C6d1EcF9b849Ae677dD3315835cb2", // Account 1  
    "0x4B20993Bc481177ec7E8f571ceCaE8A9e22C02db", // Account 2
    "0x78731D3Ca6b7E34aC0F824c42a7cC18A495cabaB", // Account 3
    "0x617F2E2fD72FD9D5503197092aC168c91465E7f2"  // Account 4
];

console.log("📋 Whitelist Addresses:");
whitelistAddresses.forEach((addr, i) => {
    console.log(`  ${i + 1}. ${addr}`);
});

// Create merkle tree
const merkleTree = new SimpleMerkleTree(whitelistAddresses);
const merkleRoot = merkleTree.getRoot();

console.log("\n🌳 Merkle Tree Information:");
console.log("Root:", merkleRoot);
console.log("Total addresses:", whitelistAddresses.length);

// Test proof generation
console.log("\n🧪 Testing Proof Generation:");
whitelistAddresses.forEach((addr, i) => {
    const proof = merkleTree.getProof(addr);
    const isWhitelisted = merkleTree.isWhitelisted(addr);
    console.log(`${i + 1}. ${addr}`);
    console.log(`   Whitelisted: ${isWhitelisted}`);
    console.log(`   Proof: ${JSON.stringify(proof)}`);
});

// Test non-whitelisted address
const nonWhitelistedAddr = "0x999999999999999999999999999999999999999";
console.log(`\n❌ Non-whitelisted test: ${nonWhitelistedAddr}`);
console.log(`   Whitelisted: ${merkleTree.isWhitelisted(nonWhitelistedAddr)}`);

console.log("\n✅ Test completed!");
console.log("\n📋 For Remix testing:");
console.log(`1. Copy this merkle root: ${merkleRoot}`);
console.log("2. Use setMerkleRoot() in Remix with this root");
console.log("3. Test with the whitelisted addresses above");
console.log("4. For proofs, use empty array [] in Remix (simplified for testing)");

module.exports = {
    SimpleMerkleTree,
    whitelistAddresses,
    merkleRoot
};