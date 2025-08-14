const { ethers } = require('ethers');

// Configuration
const CONFIG = {
    ICO_CONTRACT_ADDRESS: "0x6D87b6173322530a4e9Eb9c37DDAEBB2D87518c7",
    OWNER_PRIVATE_KEY: "b03954d2133a114118c49f1c58f349dc704a57497053aae267a34190351425ff",
    TEST_PRIVATE_KEY: "99978e0345783b20e0293e7ed816b943c5fd7b49d0b7b7528d5f1ae9c23b8541",
    RPC_URL: "https://rpc-amoy.polygon.technology/",
    TEST_BUYER_ADDRESS: "0x742d35cc12c2c2cbc2d8d9f51c4e93b6b7d1b0a6",
    FIAT_AMOUNT_USD: ethers.parseUnits("50", 6),
};

// ICO Contract ABI
const ICO_ABI = [
    "function buyTokensWithFiat(address buyer, uint256 usdAmount) external",
    "function getSaleStats() external view returns (uint256 totalRaised, uint256 tokensSold, uint256 contractTokenBalance)",
    "function getUserPurchases(address user) external view returns (uint256)",
    "function getTokenPrice() external pure returns (uint256)",
    "function calculateTokenAmount(uint256 usdValue) external pure returns (uint256)",
    "function isWhitelisted(address user) external view returns (bool)",
    "function owner() external view returns (address)",
    "function whitelistEnabled() external view returns (bool)",
    "function getContractTokenBalance() external view returns (uint256)",
    "event TokensPurchasedWithFiat(address indexed buyer, uint256 tokenAmount, uint256 usdValue)"
];

class FiatPaymentTester {
    constructor() {
        this.provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
        this.wallet = new ethers.Wallet(CONFIG.OWNER_PRIVATE_KEY, this.provider);
        this.contract = new ethers.Contract(CONFIG.ICO_CONTRACT_ADDRESS, ICO_ABI, this.wallet);
        this.testBuyerAddress = ethers.getAddress(CONFIG.TEST_BUYER_ADDRESS.toLowerCase());
    }

    async init() {
        console.log("🚀 Initializing Fiat Payment Tester...");
        console.log(`📋 Contract Address: ${CONFIG.ICO_CONTRACT_ADDRESS}`);
        console.log(`👤 Wallet Address: ${this.wallet.address}`);
        console.log(`💰 Test Buyer: ${this.testBuyerAddress}`);
        console.log(`💵 Fiat Amount: $${ethers.formatUnits(CONFIG.FIAT_AMOUNT_USD, 6)}`);
        console.log("=".repeat(50));
    }

    async checkPreConditions() {
        console.log("🔍 Checking pre-conditions...");
        
        try {
            // Check ownership
            const owner = await this.contract.owner();
            console.log(`📝 Contract Owner: ${owner}`);
            console.log(`👤 Our Address: ${this.wallet.address}`);
            
            const isOwner = owner.toLowerCase() === this.wallet.address.toLowerCase();
            if (!isOwner) {
                throw new Error("❌ You are not the owner of this contract!");
            }
            console.log("✅ Owner check passed");

            // Check whitelist
            const whitelistEnabled = await this.contract.whitelistEnabled();
            console.log(`🔐 Whitelist Enabled: ${whitelistEnabled}`);
            
            if (whitelistEnabled) {
                const isWhitelisted = await this.contract.isWhitelisted(this.testBuyerAddress);
                console.log(`✅ Test Buyer Whitelisted: ${isWhitelisted}`);
                
                if (!isWhitelisted) {
                    console.log("⚠️  Warning: Test buyer is not whitelisted. Transaction may fail.");
                }
            }

            // Check contract balance
            const contractBalance = await this.contract.getContractTokenBalance();
            console.log(`💰 Contract Token Balance: ${ethers.formatEther(contractBalance)} tokens`);
            
            if (contractBalance === 0n) {
                throw new Error("❌ Contract has no tokens!");
            }

            // Check expected tokens
            const expectedTokens = await this.contract.calculateTokenAmount(CONFIG.FIAT_AMOUNT_USD);
            console.log(`🎯 Expected Tokens: ${ethers.formatEther(expectedTokens)} tokens`);
            
            if (expectedTokens > contractBalance) {
                throw new Error(`❌ Insufficient tokens in contract!`);
            }

            console.log("✅ All pre-conditions passed!");
            return true;

        } catch (error) {
            console.error("❌ Pre-condition check failed:", error.message);
            return false;
        }
    }

    async getInitialStats() {
        console.log("\n📊 Getting initial stats...");
        
        const stats = await this.contract.getSaleStats();
        const userPurchases = await this.contract.getUserPurchases(this.testBuyerAddress);
        const tokenPrice = await this.contract.getTokenPrice();

        const initialStats = {
            totalRaised: stats[0],
            tokensSold: stats[1],
            contractBalance: stats[2],
            userPurchases: userPurchases,
            tokenPrice: tokenPrice
        };

        console.log(`💰 Total Raised: $${ethers.formatUnits(initialStats.totalRaised, 6)}`);
        console.log(`🪙 Tokens Sold: ${ethers.formatEther(initialStats.tokensSold)}`);
        console.log(`💼 Contract Balance: ${ethers.formatEther(initialStats.contractBalance)} tokens`);
        console.log(`👤 User Purchases: $${ethers.formatUnits(initialStats.userPurchases, 6)}`);
        console.log(`💲 Token Price: $${ethers.formatUnits(initialStats.tokenPrice, 6)}`);

        return initialStats;
    }

    async executeFiatPayment() {
        console.log("\n💳 Executing fiat payment...");
        
        try {
            console.log(`📤 Calling buyTokensWithFiat(${this.testBuyerAddress}, ${CONFIG.FIAT_AMOUNT_USD})`);
            
            // Get current network fee data
            const feeData = await this.provider.getFeeData();
            console.log(`⛽ Network Max Fee: ${ethers.formatUnits(feeData.maxFeePerGas || 0n, "gwei")} gwei`);
            console.log(`⛽ Network Priority Fee: ${ethers.formatUnits(feeData.maxPriorityFeePerGas || 0n, "gwei")} gwei`);
            
            // Estimate gas
            const gasEstimate = await this.contract.buyTokensWithFiat.estimateGas(
                this.testBuyerAddress,
                CONFIG.FIAT_AMOUNT_USD
            );
            console.log(`⛽ Estimated Gas: ${gasEstimate.toString()}`);

            // Use much higher gas prices for Amoy (minimum 25 gwei required)
            const txOptions = {
                gasLimit: gasEstimate * 150n / 100n, // 50% buffer
                maxFeePerGas: ethers.parseUnits("100", "gwei"), // 100 gwei max fee
                maxPriorityFeePerGas: ethers.parseUnits("50", "gwei"), // 50 gwei priority (above 25 gwei minimum)
            };

            console.log(`⛽ Using Max Fee: ${ethers.formatUnits(txOptions.maxFeePerGas, "gwei")} gwei`);
            console.log(`⛽ Using Priority Fee: ${ethers.formatUnits(txOptions.maxPriorityFeePerGas, "gwei")} gwei`);

            // Execute transaction
            const tx = await this.contract.buyTokensWithFiat(
                this.testBuyerAddress,
                CONFIG.FIAT_AMOUNT_USD,
                txOptions
            );

            console.log(`📝 Transaction Hash: ${tx.hash}`);
            console.log(`🔗 View on PolygonScan: https://amoy.polygonscan.com/tx/${tx.hash}`);
            console.log("⏳ Waiting for confirmation...");

            const receipt = await tx.wait();
            console.log(`✅ Transaction confirmed in block: ${receipt.blockNumber}`);
            console.log(`⛽ Gas Used: ${receipt.gasUsed.toString()}`);
            
            // Calculate total cost
            const gasCost = receipt.gasUsed * (receipt.gasPrice || 0n);
            console.log(`💰 Gas Cost: ${ethers.formatEther(gasCost)} MATIC`);

            // Parse events
            const events = receipt.logs.map(log => {
                try {
                    return this.contract.interface.parseLog(log);
                } catch (e) {
                    return null;
                }
            }).filter(event => event !== null);

            if (events.length > 0) {
                console.log("\n📋 Events emitted:");
                events.forEach(event => {
                    if (event.name === "TokensPurchasedWithFiat") {
                        console.log(`🎉 TokensPurchasedWithFiat:`);
                        console.log(`   👤 Buyer: ${event.args[0]}`);
                        console.log(`   🪙 Token Amount: ${ethers.formatEther(event.args[1])}`);
                        console.log(`   💰 USD Value: $${ethers.formatUnits(event.args[2], 6)}`);
                    }
                });
            }

            return receipt;

        } catch (error) {
            console.error("❌ Fiat payment failed:", error.message);
            
            if (error.message.includes("gas price below minimum") || 
                error.message.includes("gas tip cap")) {
                console.log("\n💡 This is a gas price error. The script uses high gas prices, but the network might need even higher fees.");
                console.log("💡 Consider waiting a few minutes and trying again, or check network congestion.");
            }
            
            throw error;
        }
    }

    async getFinalStats(initialStats) {
        console.log("\n📊 Getting final stats...");
        
        const stats = await this.contract.getSaleStats();
        const userPurchases = await this.contract.getUserPurchases(this.testBuyerAddress);

        const finalStats = {
            totalRaised: stats[0],
            tokensSold: stats[1],
            contractBalance: stats[2],
            userPurchases: userPurchases
        };

        console.log("\n📈 COMPARISON:");
        console.log("=".repeat(40));
        console.log(`💰 Total Raised: $${ethers.formatUnits(initialStats.totalRaised, 6)} → $${ethers.formatUnits(finalStats.totalRaised, 6)}`);
        console.log(`🪙 Tokens Sold: ${ethers.formatEther(initialStats.tokensSold)} → ${ethers.formatEther(finalStats.tokensSold)}`);
        console.log(`💼 Contract Balance: ${ethers.formatEther(initialStats.contractBalance)} → ${ethers.formatEther(finalStats.contractBalance)}`);
        console.log(`👤 User Purchases: $${ethers.formatUnits(initialStats.userPurchases, 6)} → $${ethers.formatUnits(finalStats.userPurchases, 6)}`);

        // Calculate changes
        const raisedDiff = finalStats.totalRaised - initialStats.totalRaised;
        const tokensDiff = finalStats.tokensSold - initialStats.tokensSold;
        const balanceDiff = initialStats.contractBalance - finalStats.contractBalance;
        const userDiff = finalStats.userPurchases - initialStats.userPurchases;

        console.log("\n📊 CHANGES:");
        console.log("=".repeat(40));
        console.log(`💰 Raised Increased: $${ethers.formatUnits(raisedDiff, 6)}`);
        console.log(`🪙 Tokens Sold: ${ethers.formatEther(tokensDiff)}`);
        console.log(`💼 Contract Balance Decreased: ${ethers.formatEther(balanceDiff)}`);
        console.log(`👤 User Purchase Increased: $${ethers.formatUnits(userDiff, 6)}`);

        return finalStats;
    }

    async runFullTest() {
        try {
            await this.init();
            
            const preConditionsOk = await this.checkPreConditions();
            if (!preConditionsOk) {
                console.log("❌ Pre-conditions failed. Exiting...");
                return;
            }

            const initialStats = await this.getInitialStats();
            await this.executeFiatPayment();
            await this.getFinalStats(initialStats);

            console.log("\n🎉 FIAT PAYMENT TEST COMPLETED SUCCESSFULLY! 🎉");

        } catch (error) {
            console.error("\n💥 TEST FAILED:", error.message);
            
            // Provide helpful suggestions
            if (error.message.includes("gas")) {
                console.log("\n💡 SUGGESTIONS:");
                console.log("1. Wait a few minutes for network congestion to decrease");
                console.log("2. Try using a different RPC endpoint");
                console.log("3. Test with Remix instead (it handles gas automatically)");
            }
        }
    }
}

// Quick check function
async function quickCheck() {
    console.log("🔍 Quick contract check...");
    
    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
    const contract = new ethers.Contract(CONFIG.ICO_CONTRACT_ADDRESS, ICO_ABI, provider);
    
    try {
        const owner = await contract.owner();
        const stats = await contract.getSaleStats();
        const whitelistEnabled = await contract.whitelistEnabled();
        const feeData = await provider.getFeeData();
        
        console.log(`👤 Owner: ${owner}`);
        console.log(`💰 Total Raised: $${ethers.formatUnits(stats[0], 6)}`);
        console.log(`🪙 Tokens Sold: ${ethers.formatEther(stats[1])}`);
        console.log(`💼 Contract Balance: ${ethers.formatEther(stats[2])}`);
        console.log(`🔐 Whitelist Enabled: ${whitelistEnabled}`);
        console.log(`⛽ Current Network Fee: ${ethers.formatUnits(feeData.maxFeePerGas || 0n, "gwei")} gwei`);
        console.log(`⛽ Current Priority Fee: ${ethers.formatUnits(feeData.maxPriorityFeePerGas || 0n, "gwei")} gwei`);
        
    } catch (error) {
        console.error("❌ Quick check failed:", error.message);
    }
}

// Main execution
async function main() {
    const args = process.argv.slice(2);
    
    if (args.includes('--quick-check')) {
        await quickCheck();
        return;
    }
    
    const tester = new FiatPaymentTester();
    await tester.runFullTest();
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
} 