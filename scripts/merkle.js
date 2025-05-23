const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');
const { ethers } = require('ethers');

// Define the whitelisted addresses
const addresses = [
  '0xfE98c32B4F998eAf7850E18FA6afBbD665C45E39',
  '0xCc5e4E757E151aDA1F62EC9C82EB65efB95ef86c', 
  '0x9E32B3e2C55bd16422cdE109C6591e2960E7ABcF'
];

// Generate leaves that match the contract's implementation
const leaves = addresses.map(addr => {
  // This matches abi.encode(addr) in Solidity
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(['address'], [addr]);
  // This matches keccak256(abi.encode(addr))
  const firstHash = keccak256(encoded);
  // This matches keccak256(bytes.concat(keccak256(abi.encode(addr))))
  return keccak256(firstHash);
});

// Create Merkle tree with sorted pairs
const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });

// Get the Merkle root
const root = tree.getHexRoot();
console.log('Merkle Root:', root);

// Generate proof for each address
addresses.forEach((addr, index) => {
  // Generate leaf the same way as above
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(['address'], [addr]);
  const firstHash = keccak256(encoded);
  const leaf = keccak256(firstHash);
  
  const proof = tree.getHexProof(leaf);
  console.log(`Proof for ${addr}:`, proof);
});