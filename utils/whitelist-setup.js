        const { ethers } = require("hardhat");
const MerkleTreeWhiteListing = require("./MerkleTreeWhiteListing");
require("dotenv").config();

async function main() {
  console.log("🚀 Starting Whitelist Setup...\n");

  // Get signer
  const [deployer] = await ethers.getSigners();
  console.log("Using account:", deployer.address);

  // Contract address (update this with your deployed contract address)
  const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "0x..."; // Replace with your deployed contract address
  
  if (CONTRACT_ADDRESS === "0x...") {
    console.error("❌ Please set CONTRACT_ADDRESS in your .env file or update the script");
    return;
  }

  try {
    // Connect to deployed contract
    const EyeICOAndVesting = await ethers.getContractFactory("EyeICOAndVesting");
    const contract = EyeICOAndVesting.attach(CONTRACT_ADDRESS);
    
    console.log("📋 Connected to contract at:", CONTRACT_ADDRESS);

    // Example whitelist addresses (replace with actual addresses)
    const whitelistAddresses = [
      "0x1234567890123456789012345678901234567890",
      "0xAbCdEfABcdEfabcdEfABCdefABcdEfABcdEfABCd",
      "0x742d35Cc6634C0532925a3b8D238D53Cd2C77fEf",
      deployer.address, // Add deployer for testing
      // Add more addresses as needed
    ];

    console.log("👥 Setting up whitelist with", whitelistAddresses.length, "addresses:");
    whitelistAddresses.forEach((addr, index) => {
      console.log(`  ${index + 1}. ${addr}`);
    });

    // Create Merkle tree
    console.log("\n🌳 Creating Merkle tree...");
    const merkleWhitelist = new MerkleTreeWhiteListing(whitelistAddresses);
    
    // Get root
    const merkleRoot = merkleWhitelist.getRoot();
    console.log("📋 Merkle Root:", merkleRoot);

    // Set root in contract
    console.log("\n📝 Setting Merkle root in contract...");
    const setRootTx = await contract.setRootForPresale(merkleRoot);
    console.log("⏳ Transaction hash:", setRootTx.hash);
    
    await setRootTx.wait();
    console.log("✅ Merkle root set successfully!");

    // Verify root was set correctly
    const contractRoot = await contract.rootForPresale();
    console.log("🔍 Contract root:", contractRoot);
    console.log("✅ Root verification:", contractRoot === merkleRoot ? "PASSED" : "FAILED");

    // Test proof generation for each address
    console.log("\n🧪 Testing proof generation:");
    for (let i = 0; i < whitelistAddresses.length; i++) {
      const address = whitelistAddresses[i];
      const proofData = merkleWhitelist.generateProofData(address);
      
      console.log(`\n👤 Address ${i + 1}: ${address}`);
      console.log("   Whitelisted:", proofData.isWhitelisted);
      console.log("   Proof length:", proofData.proof.length);
      console.log("   Proof:", JSON.stringify(proofData.proof, null, 2));

      // Verify proof against contract
      const isValid = await contract.addressIsWhiteListed(proofData.proof, address);
      console.log("   Contract verification:", isValid ? "✅ VALID" : "❌ INVALID");
    }

    // Test with a non-whitelisted address
    console.log("\n🚫 Testing non-whitelisted address:");
    const nonWhitelistedAddress = "0x999999999999999999999999999999999999999";
    const nonWhitelistedProof = merkleWhitelist.getProof(nonWhitelistedAddress);
    const isNonWhitelistedValid = await contract.addressIsWhiteListed(nonWhitelistedProof, nonWhitelistedAddress);
    console.log("   Address:", nonWhitelistedAddress);
    console.log("   Contract verification:", isNonWhitelistedValid ? "❌ UNEXPECTEDLY VALID" : "✅ CORRECTLY INVALID");

    // Export whitelist data for future use
    const whitelistData = merkleWhitelist.exportData();
    console.log("\n💾 Whitelist data exported:");
    console.log(JSON.stringify(whitelistData, null, 2));

    // Display purchase function examples
    console.log("\n📖 Example usage for buying tokens:");
    console.log("```javascript");
    console.log("// For a whitelisted address:");
    const exampleAddress = whitelistAddresses[0];
    const exampleProof = merkleWhitelist.getProof(exampleAddress);
    console.log(`const proof = ${JSON.stringify(exampleProof)};`);
    console.log(`await contract.buyTokensWithUSDC(usdcAmount, proof);`);
    console.log("```");

    console.log("\n✅ Whitelist setup completed successfully!");
    
    return {
      merkleRoot,
      whitelistAddresses,
      contractAddress: CONTRACT_ADDRESS,
      whitelistData
    };

  } catch (error) {
    console.error("❌ Whitelist setup failed:", error);
    throw error;
  }
}

// Helper function to add new addresses to existing whitelist
async function addToWhitelist(newAddresses, contractAddress) {
  console.log("🔄 Adding new addresses to whitelist...");
  
  const [deployer] = await ethers.getSigners();
  const EyeICOAndVesting = await ethers.getContractFactory("EyeICOAndVesting");
  const contract = EyeICOAndVesting.attach(contractAddress);

  // Get current whitelist (you'd need to store this somewhere)
  // For now, we'll create a new whitelist with the new addresses
  const merkleWhitelist = new MerkleTreeWhiteListing(newAddresses);
  
  const newRoot = merkleWhitelist.getRoot();
  console.log("📋 New Merkle Root:", newRoot);

  const setRootTx = await contract.setRootForPresale(newRoot);
  await setRootTx.wait();
  
  console.log("✅ Whitelist updated successfully!");
  return newRoot;
}

// Helper function to simulate token purchase
async function simulatePurchase(contractAddress, userAddress, usdcAmount) {
  console.log(`\n💰 Simulating token purchase for ${userAddress}...`);
  
  const [deployer] = await ethers.getSigners();
  const EyeICOAndVesting = await ethers.getContractFactory("EyeICOAndVesting");
  const contract = EyeICOAndVesting.attach(contractAddress);

  // This would require the user to have USDC and approve the contract
  // For testing, you'd need to:
  // 1. Get USDC tokens
  // 2. Approve the contract to spend USDC
  // 3. Call buyTokensWithUSDC with proof

  console.log("⚠️  To complete purchase, user needs to:");
  console.log("   1. Have USDC tokens");
  console.log("   2. Approve contract to spend USDC");
  console.log("   3. Call buyTokensWithUSDC with valid proof");
}

// Execute if run directly
if (require.main === module) {
  main()
    .then((result) => {
      console.log("\n🎉 Script completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Script failed:", error);
      process.exit(1);
    });
}

module.exports = { main, addToWhitelist, simulatePurchase };