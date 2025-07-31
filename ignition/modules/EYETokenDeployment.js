const { ethers, upgrades } = require("hardhat");
require("dotenv").config();

async function main() {
  console.log("🚀 Starting EyeICOAndVesting deployment...");

  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log("📋 Deploying with account:", deployer.address);
  
  const balance = await deployer.provider.getBalance(deployer.address);
  console.log("💰 Account balance:", ethers.formatEther(balance), "ETH");

  // Contract addresses - Update these for your network
  const EYE_TOKEN_ADDRESS = process.env.EYE_TOKEN_ADDRESS;
  const FUND_RECEIVER_ADDRESS = process.env.FUND_RECEIVER_ADDRESS || deployer.address;
  
  // Polygon Amoy testnet addresses (update if needed)
  const USDC_ADDRESS = process.env.USDC_ADDRESS || "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582"; // USDC on Amoy
  const USDT_ADDRESS = process.env.USDT_ADDRESS || "0xf08A2A4c5b09bcF1D5cc97A6c6ac8e95E8A54f01"; // USDT on Amoy
  const USDC_PRICE_FEED = process.env.USDC_PRICE_FEED || "0x1b8739bB4CdF0089d07097A9Ae5Bd274b29C6F16"; // USDC/USD on Amoy
  const USDT_PRICE_FEED = process.env.USDT_PRICE_FEED || "0x92C09849638959196E976289418e5973CC96d645"; // USDT/USD on Amoy

  // Validation
  if (!EYE_TOKEN_ADDRESS || EYE_TOKEN_ADDRESS === "0x...") {
    throw new Error("❌ EYE_TOKEN_ADDRESS must be set in .env file");
  }

  console.log("\n📋 Configuration:");
  console.log("EYE Token Address:", EYE_TOKEN_ADDRESS);
  console.log("Fund Receiver Address:", FUND_RECEIVER_ADDRESS);
  console.log("USDC Address:", USDC_ADDRESS);
  console.log("USDT Address:", USDT_ADDRESS);
  console.log("USDC Price Feed:", USDC_PRICE_FEED);
  console.log("USDT Price Feed:", USDT_PRICE_FEED);

  try {
    // Deploy the upgradeable contract
    console.log("\n🔨 Deploying EyeICOAndVesting contract...");
    
    const EyeICOAndVesting = await ethers.getContractFactory("EyeICOAndVesting");
    
    const contract = await upgrades.deployProxy(
      EyeICOAndVesting,
      [
        EYE_TOKEN_ADDRESS,
        FUND_RECEIVER_ADDRESS,
        USDC_ADDRESS,  
        USDT_ADDRESS,
        USDC_PRICE_FEED,
        USDT_PRICE_FEED
      ],
      { 
        initializer: "initialize",
        kind: "uups"
      }
    );

    await contract.waitForDeployment();
    const contractAddress = await contract.getAddress();

    console.log("\n✅ Deployment Successful!");
    console.log("📍 Proxy Address:", contractAddress);
    console.log("📍 Implementation Address:", await upgrades.erc1967.getImplementationAddress(contractAddress));
    console.log("📍 Admin Address:", await upgrades.erc1967.getAdminAddress(contractAddress));

    // Verify contract state
    console.log("\n🔍 Verifying contract state...");
    
    const currentRound = await contract.round();
    const roundDetails = await contract.getICORoundDetails();
    const eyeTokenAddress = await contract.eyeToken();
    const fundReceiver = await contract.fundReceiverAddress();
    
    console.log("Current ICO Round:", currentRound); // Should be 0 (PreSale)
    console.log("Round Active:", roundDetails.isActive);
    console.log("Token Price (USD with 6 decimals):", roundDetails.tokenPrice.toString());
    console.log("Total Token Amount:", ethers.formatEther(roundDetails.TotalTokenAmount));
    console.log("Available Token Amount:", ethers.formatEther(roundDetails.availableTokenAmount));
    console.log("TGE Percentage:", roundDetails.TGE);
    console.log("Wallet Cap (USD with 6 decimals):", roundDetails.walletCap.toString());
    console.log("EYE Token Address in Contract:", eyeTokenAddress);
    console.log("Fund Receiver in Contract:", fundReceiver);

    // Check if contract has EYE tokens
    const EyeToken = await ethers.getContractAt("IERC20", EYE_TOKEN_ADDRESS);
    const contractTokenBalance = await EyeToken.balanceOf(contractAddress);
    console.log("Contract EYE Token Balance:", ethers.formatEther(contractTokenBalance));
    
    if (contractTokenBalance < roundDetails.TotalTokenAmount) {
      console.log("⚠️  WARNING: Contract doesn't have enough EYE tokens for the ICO!");
      console.log("   Required:", ethers.formatEther(roundDetails.TotalTokenAmount));
      console.log("   Current:", ethers.formatEther(contractTokenBalance));
      console.log("   Please transfer EYE tokens to the contract address");
    }

    // Save deployment info to file
    const deploymentInfo = {
      network: (await ethers.provider.getNetwork()).name,
      chainId: Number((await ethers.provider.getNetwork()).chainId),
      contractAddress: contractAddress,
      implementationAddress: await upgrades.erc1967.getImplementationAddress(contractAddress),
      adminAddress: await upgrades.erc1967.getAdminAddress(contractAddress),
      deployer: deployer.address,
      blockNumber: await ethers.provider.getBlockNumber(),
      timestamp: new Date().toISOString(),
      gasUsed: "N/A", // Will be filled by transaction receipt
      configuration: {
        eyeToken: EYE_TOKEN_ADDRESS,
        fundReceiver: FUND_RECEIVER_ADDRESS,
        usdc: USDC_ADDRESS,
        usdt: USDT_ADDRESS,
        usdcPriceFeed: USDC_PRICE_FEED,
        usdtPriceFeed: USDT_PRICE_FEED
      },
      contractState: {
        currentRound: Number(currentRound),
        roundActive: roundDetails.isActive,
        tokenPrice: roundDetails.tokenPrice.toString(),
        totalTokenAmount: roundDetails.TotalTokenAmount.toString(),
        availableTokenAmount: roundDetails.availableTokenAmount.toString(),
        tgePercentage: roundDetails.TGE,
        walletCap: roundDetails.walletCap.toString(),
        cliff: roundDetails.cliff.toString(),
        duration: roundDetails.duration.toString()
      }
    };

    console.log("\n💾 Deployment Info:");
    console.log(JSON.stringify(deploymentInfo, null, 2));

    // Additional setup suggestions
    console.log("\n📝 Next Steps:");
    console.log("1. Transfer EYE tokens to contract:", contractAddress);
    console.log("2. Set Merkle root for presale whitelist using setRootForPresale()");
    console.log("3. Verify contract on block explorer");
    console.log("4. Test the contract functions on testnet");

    return {
      contractAddress,
      deploymentInfo
    };

  } catch (error) {
    console.error("❌ Deployment failed:", error);
    throw error;
  }
}

// Execute deployment
if (require.main === module) {
  main()
    .then(({ contractAddress, deploymentInfo }) => {
      console.log(`\n🎉 Deployment completed successfully!`);
      console.log(`📍 Contract Address: ${contractAddress}`);
      console.log(`🔗 You can interact with your contract at: ${contractAddress}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Deployment failed:", error);
      process.exit(1);
    });
}

module.exports = main;