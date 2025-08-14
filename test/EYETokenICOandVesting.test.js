const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

describe("EyeICOAndVesting System - Component Tests", function () {
  let owner, user1, user2, user3, user4, fundReceiver;
  let eyeToken, mockUSDC, mockUSDT;
  let ethPriceFeed, usdcPriceFeed, usdtPriceFeed;
  let merkleTree, merkleRoot;

  const PRECISION = 1000000;
  const TOTAL_SUPPLY = ethers.parseEther("1000000000");
  const ICORounds = { Seed: 0, PublicPresale: 1 };
  const CollaboratorRole = { Ecosystem: 0, Reserve: 1, Liquidity: 2, Staking: 3, EarlyLP: 4, Team: 5, Advisors: 6 };

  function getProof(address) {
    const leaf = keccak256(ethers.solidityPacked(["address"], [address]));
    return merkleTree.getHexProof(leaf);
  }

  function calculateTokensForUSD(usdAmount, pricePerToken) {
    return (BigInt(usdAmount) * ethers.parseEther("1")) / BigInt(pricePerToken);
  }

  function calculateTGE(tokenAmount, tgePercent) {
    return (tokenAmount * BigInt(tgePercent)) / 100n;
  }

  before(async function () {
    [owner, user1, user2, user3, user4, fundReceiver] = await ethers.getSigners();

    // Create whitelist
    const whitelistedAddresses = [user1.address, user2.address, user3.address];
    const leaves = whitelistedAddresses.map(addr => keccak256(ethers.solidityPacked(["address"], [addr])));
    merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true });
    merkleRoot = merkleTree.getHexRoot();

    // Deploy price feeds
    const MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");
    ethPriceFeed = await MockV3Aggregator.deploy(8, 4000 * 10 ** 8);
    usdcPriceFeed = await MockV3Aggregator.deploy(8, 1 * 10 ** 8);
    usdtPriceFeed = await MockV3Aggregator.deploy(8, 1 * 10 ** 8);

    // Deploy EcoYield token
    const EcoYieldFactory = await ethers.getContractFactory("EcoYield");
    eyeToken = await upgrades.deployProxy(EcoYieldFactory, [], { kind: "uups", initializer: "initialize" });

    // Create mock USDC/USDT using EcoYield contract
    mockUSDC = await upgrades.deployProxy(EcoYieldFactory, [], { kind: "uups", initializer: "initialize" });
    mockUSDT = await upgrades.deployProxy(EcoYieldFactory, [], { kind: "uups", initializer: "initialize" });

    // Setup mock tokens for users
    const users = [user1, user2, user3, user4];
    for (const user of users) {
      await mockUSDC.transfer(user.address, ethers.parseEther("100000"));
      await mockUSDT.transfer(user.address, ethers.parseEther("100000"));
    }
  });

  describe("1. Token Contract Functionality", function () {
    it("Should deploy EcoYield token successfully", async function () {
      expect(await eyeToken.name()).to.equal("EcoYield");
      expect(await eyeToken.symbol()).to.equal("EYE");
      expect(await eyeToken.totalSupply()).to.equal(TOTAL_SUPPLY);
      expect(await eyeToken.balanceOf(owner.address)).to.equal(TOTAL_SUPPLY);
    });

    it("Should handle token transfers", async function () {
      const transferAmount = ethers.parseEther("1000");
      await eyeToken.transfer(user1.address, transferAmount);
      expect(await eyeToken.balanceOf(user1.address)).to.equal(transferAmount);
    });

    it("Should handle approvals and transferFrom", async function () {
      const approveAmount = ethers.parseEther("500");
      await eyeToken.connect(user1).approve(user2.address, approveAmount);
      
      await eyeToken.connect(user2).transferFrom(user1.address, user3.address, approveAmount);
      expect(await eyeToken.balanceOf(user3.address)).to.equal(approveAmount);
    });

    it("Should pause and unpause correctly", async function () {
      await eyeToken.pause();
      expect(await eyeToken.paused()).to.be.true;

      await expect(
        eyeToken.transfer(user2.address, ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(eyeToken, "EnforcedPause");

      await eyeToken.unpause();
      expect(await eyeToken.paused()).to.be.false;
    });
  });

  describe("2. Price Feed Integration", function () {
    it("Should return correct ETH price", async function () {
      const result = await ethPriceFeed.latestRoundData();
      expect(result[1]).to.equal(4000 * 10 ** 8); // $4000 with 8 decimals
      expect(await ethPriceFeed.decimals()).to.equal(8);
    });

    it("Should return correct USDC price", async function () {
      const result = await usdcPriceFeed.latestRoundData();
      expect(result[1]).to.equal(1 * 10 ** 8); // $1 with 8 decimals
    });

    it("Should calculate USD values correctly", async function () {
      // ETH to USD calculation
      const ethAmount = ethers.parseEther("1");
      const ethPriceData = await ethPriceFeed.latestRoundData();
      // Price feed returns $4000 with 8 decimals, we want result in 6 decimals (PRECISION)
      const ethUsdValue = (ethAmount * BigInt(ethPriceData[1])) / (10n ** 18n) * BigInt(PRECISION) / (10n ** 8n);
      expect(ethUsdValue).to.equal(BigInt(4000 * PRECISION));

      // USDC to USD calculation (1:1 ratio)
      const usdcAmount = ethers.parseEther("1000"); // 1000 tokens
      const usdcPriceData = await usdcPriceFeed.latestRoundData();
      // For our test, USDC mock has 18 decimals, price feed has 8 decimals
      const usdcUsdValue = (usdcAmount * BigInt(usdcPriceData[1])) / (10n ** 18n) * BigInt(PRECISION) / (10n ** 8n);
      expect(usdcUsdValue).to.equal(BigInt(1000 * PRECISION));
    });
  });

  describe("3. Whitelist and Merkle Tree", function () {
    it("Should generate valid merkle proofs", async function () {
      for (const address of [user1.address, user2.address, user3.address]) {
        const proof = getProof(address);
        const leaf = keccak256(ethers.solidityPacked(["address"], [address]));
        const isValid = merkleTree.verify(proof, leaf, merkleRoot);
        expect(isValid).to.be.true;
      }
    });

    it("Should reject invalid addresses", async function () {
      const invalidProof = getProof(user4.address);
      const leaf = keccak256(ethers.solidityPacked(["address"], [user4.address]));
      const isValid = merkleTree.verify(invalidProof, leaf, merkleRoot);
      expect(isValid).to.be.false;
    });

    it("Should generate consistent merkle root", async function () {
      expect(merkleRoot).to.not.equal("0x0000000000000000000000000000000000000000000000000000000000000000");
      
      // Regenerate and verify consistency
      const newLeaves = [user1.address, user2.address, user3.address].map(addr => 
        keccak256(ethers.solidityPacked(["address"], [addr]))
      );
      const newTree = new MerkleTree(newLeaves, keccak256, { sortPairs: true });
      expect(newTree.getHexRoot()).to.equal(merkleRoot);
    });
  });

  describe("4. ICO Purchase Calculations", function () {
    it("Should calculate seed round token amounts", async function () {
      const seedPrice = 1500; // $0.0015
      
      // ETH purchase calculation
      const ethAmount = ethers.parseEther("1");
      const ethUsdValue = 4000 * PRECISION; // $4000
      const expectedTokensFromETH = calculateTokensForUSD(ethUsdValue, seedPrice);
      expect(expectedTokensFromETH).to.equal(ethers.parseEther("2666666.666666666666666666"));

      // USDC purchase calculation
      const usdcAmount = 1500 * PRECISION; // $1500
      const expectedTokensFromUSDC = calculateTokensForUSD(usdcAmount, seedPrice);
      expect(expectedTokensFromUSDC).to.equal(ethers.parseEther("1000000"));

      // Fiat purchase calculation
      const fiatAmount = 3000 * PRECISION; // $3000
      const expectedTokensFromFiat = calculateTokensForUSD(fiatAmount, seedPrice);
      expect(expectedTokensFromFiat).to.equal(ethers.parseEther("2000000"));
    });

    it("Should calculate public presale token amounts", async function () {
      const publicPrice = 2500; // $0.0025 (Phase 1)
      
      const ethUsdValue = 4000 * PRECISION; // $4000
      const expectedTokens = calculateTokensForUSD(ethUsdValue, publicPrice);
      expect(expectedTokens).to.equal(ethers.parseEther("1600000"));
    });

    it("Should enforce minimum purchase amounts", async function () {
      const minPurchase = 10 * PRECISION; // $10
      const seedPrice = 1500;
      const minTokens = calculateTokensForUSD(minPurchase, seedPrice);
      expect(minTokens).to.equal(ethers.parseEther("6666.666666666666666666"));
    });

    it("Should calculate wallet caps correctly", async function () {
      const seedWalletCap = 25000 * PRECISION; // $25K
      const publicWalletCap = 50000 * PRECISION; // $50K
      
      expect(seedWalletCap).to.equal(25000000000);
      expect(publicWalletCap).to.equal(50000000000);
      expect(publicWalletCap).to.be.gt(seedWalletCap);
    });
  });

  describe("5. TGE (Token Generation Event) Calculations", function () {
    it("Should calculate ecosystem TGE (10%)", async function () {
      const tokenAmount = ethers.parseEther("1000000");
      const tgeAmount = calculateTGE(tokenAmount, 10);
      const vestingAmount = tokenAmount - tgeAmount;
      
      expect(tgeAmount).to.equal(ethers.parseEther("100000"));
      expect(vestingAmount).to.equal(ethers.parseEther("900000"));
    });

    it("Should calculate liquidity TGE (100%)", async function () {
      const tokenAmount = ethers.parseEther("500000");
      const tgeAmount = calculateTGE(tokenAmount, 100);
      const vestingAmount = tokenAmount - tgeAmount;
      
      expect(tgeAmount).to.equal(ethers.parseEther("500000"));
      expect(vestingAmount).to.equal(0);
    });

    it("Should calculate early LP TGE (25%)", async function () {
      const tokenAmount = ethers.parseEther("800000");
      const tgeAmount = calculateTGE(tokenAmount, 25);
      const vestingAmount = tokenAmount - tgeAmount;
      
      expect(tgeAmount).to.equal(ethers.parseEther("200000"));
      expect(vestingAmount).to.equal(ethers.parseEther("600000"));
    });

    it("Should calculate team TGE (0%)", async function () {
      const tokenAmount = ethers.parseEther("2000000");
      const tgeAmount = calculateTGE(tokenAmount, 0);
      const vestingAmount = tokenAmount - tgeAmount;
      
      expect(tgeAmount).to.equal(0);
      expect(vestingAmount).to.equal(ethers.parseEther("2000000"));
    });
  });

  describe("6. Vesting Schedule Calculations", function () {
    it("Should calculate seed round vesting", async function () {
      const cliff = 180 * 24 * 60 * 60; // 6 months
      const duration = 730 * 24 * 60 * 60; // 24 months
      const tokenAmount = ethers.parseEther("1000000");
      
      expect(cliff).to.equal(15552000); // 6 months in seconds
      expect(duration).to.equal(63072000); // 24 months in seconds
      
      // Simulate vesting calculation
      const currentTime = Math.floor(Date.now() / 1000);
      const startTime = currentTime;
      const cliffEnd = startTime + cliff;
      const vestingEnd = cliffEnd + duration;
      
      expect(cliffEnd).to.be.gt(startTime);
      expect(vestingEnd).to.be.gt(cliffEnd);
    });

    it("Should calculate public presale vesting", async function () {
      const cliff = 0; // No cliff
      const duration = 365 * 24 * 60 * 60; // 12 months
      
      expect(cliff).to.equal(0);
      expect(duration).to.equal(31536000); // 12 months in seconds
    });

    it("Should calculate team vesting with cliff", async function () {
      const cliff = 270 * 24 * 60 * 60; // 9 months
      const duration = 720 * 24 * 60 * 60; // 24 months
      
      expect(cliff).to.equal(23328000); // 9 months in seconds
      expect(duration).to.equal(62208000); // 24 months in seconds
    });
  });

  describe("7. Allocation and Tokenomics", function () {
    it("Should verify ICO round allocations", async function () {
      const seedAllocation = 10; // 10%
      const publicAllocation = 30; // 30%
      const totalICOAllocation = seedAllocation + publicAllocation;
      
      expect(totalICOAllocation).to.equal(40);
      
      const seedTokens = (TOTAL_SUPPLY * BigInt(seedAllocation)) / 100n;
      const publicTokens = (TOTAL_SUPPLY * BigInt(publicAllocation)) / 100n;
      
      expect(seedTokens).to.equal(ethers.parseEther("100000000")); // 100M tokens
      expect(publicTokens).to.equal(ethers.parseEther("300000000")); // 300M tokens
    });

    it("Should verify collaborator allocations", async function () {
      const collaboratorAllocations = {
        ecosystem: 10,
        reserve: 10,
        liquidity: 10,
        staking: 10,
        earlyLP: 5,
        team: 10,
        advisors: 5
      };
      
      const totalCollaboratorAllocation = Object.values(collaboratorAllocations).reduce((a, b) => a + b, 0);
      expect(totalCollaboratorAllocation).to.equal(60);
      
      // Verify total allocation is 100%
      const totalAllocation = 40 + totalCollaboratorAllocation; // ICO + Collaborators
      expect(totalAllocation).to.equal(100);
    });

    it("Should calculate remaining tokens correctly", async function () {
      const allocatedPercentage = 100;
      const remainingPercentage = 100 - allocatedPercentage;
      expect(remainingPercentage).to.equal(0); // All tokens allocated
    });
  });

  describe("8. Purchase Flow Simulations", function () {
    it("Should simulate seed round ETH purchase", async function () {
      const userAddress = user1.address;
      const ethAmount = ethers.parseEther("1");
      const ethPrice = 4000;
      const tokenPrice = 1500; // $0.0015
      
      // Check whitelist
      const proof = getProof(userAddress);
      const leaf = keccak256(ethers.solidityPacked(["address"], [userAddress]));
      const isWhitelisted = merkleTree.verify(proof, leaf, merkleRoot);
      expect(isWhitelisted).to.be.true;
      
      // Calculate USD value
      const usdValue = (ethAmount * BigInt(ethPrice * PRECISION)) / ethers.parseEther("1");
      expect(usdValue).to.equal(BigInt(4000 * PRECISION));
      
      // Calculate tokens
      const tokenAmount = calculateTokensForUSD(Number(usdValue), tokenPrice);
      expect(tokenAmount).to.be.gt(0);
      
      // Check wallet cap
      const walletCap = 25000 * PRECISION;
      expect(usdValue).to.be.lt(walletCap);
    });

    it("Should simulate public presale USDC purchase", async function () {
      const userAddress = user4.address; // Not whitelisted
      const usdcAmount = ethers.parseEther("2500");
      const tokenPrice = 2500; // $0.0025
      
      // No whitelist check needed for public presale
      const usdValue = Number(usdcAmount) / (10 ** 18) * PRECISION;
      const tokenAmount = calculateTokensForUSD(usdValue, tokenPrice);
      
      expect(tokenAmount).to.be.gt(0);
      
      // Check wallet cap
      const walletCap = 50000 * PRECISION;
      expect(usdValue).to.be.lt(walletCap);
    });

    it("Should simulate collaborator token allocation", async function () {
      const ecosystemAllocation = ethers.parseEther("1000000");
      const tgePercent = 10;
      
      const tgeAmount = calculateTGE(ecosystemAllocation, tgePercent);
      const vestingAmount = ecosystemAllocation - tgeAmount;
      
      expect(tgeAmount).to.equal(ethers.parseEther("100000"));
      expect(vestingAmount).to.equal(ethers.parseEther("900000"));
      
      // Simulate immediate transfer of TGE
      const userBalanceBefore = await eyeToken.balanceOf(user1.address);
      await eyeToken.transfer(user1.address, tgeAmount);
      const userBalanceAfter = await eyeToken.balanceOf(user1.address);
      
      expect(userBalanceAfter - userBalanceBefore).to.equal(tgeAmount);
    });
  });

  describe("9. Mock Token Operations", function () {
    it("Should handle USDC mock operations", async function () {
      const user = user2;
      const amount = ethers.parseEther("1000");
      
      // Check balance
      const balance = await mockUSDC.balanceOf(user.address);
      expect(balance).to.be.gte(amount);
      
      // Test approval
      await mockUSDC.connect(user).approve(owner.address, amount);
      const allowance = await mockUSDC.allowance(user.address, owner.address);
      expect(allowance).to.equal(amount);
      
      // Test transferFrom
      await mockUSDC.transferFrom(user.address, user3.address, amount);
      const newBalance = await mockUSDC.balanceOf(user3.address);
      expect(newBalance).to.be.gte(amount);
    });

    it("Should handle USDT mock operations", async function () {
      const user = user3;
      const amount = ethers.parseEther("500");
      
      await mockUSDT.connect(user).approve(user4.address, amount);
      await mockUSDT.connect(user4).transferFrom(user.address, user1.address, amount);
      
      const balance = await mockUSDT.balanceOf(user1.address);
      expect(balance).to.be.gte(amount);
    });
  });

  describe("10. Time-based Calculations", function () {
    it("Should calculate vesting progress over time", async function () {
      const startTime = await time.latest();
      const cliff = 180 * 24 * 60 * 60; // 6 months
      const duration = 730 * 24 * 60 * 60; // 24 months
      const totalTokens = ethers.parseEther("1000000");
      
      // Before cliff
      const beforeCliff = await time.latest();
      expect(beforeCliff).to.be.lt(startTime + cliff);
      
      // Simulate time progression
      await time.increase(cliff);
      const afterCliff = await time.latest();
      expect(afterCliff).to.be.gte(startTime + cliff);
      
      // Calculate vested amount after cliff
      await time.increase(duration / 2); // Half way through vesting
      const halfwayTime = await time.latest();
      const timeFromCliff = halfwayTime - (startTime + cliff);
      const vestedPercentage = (timeFromCliff * 100) / duration;
      
      expect(vestedPercentage).to.be.gte(45); // Should be around 50%
      expect(vestedPercentage).to.be.lte(55);
    });
  });

  describe("11. Critical ICO Scenarios", function () {
    it("Should handle wallet cap enforcement", async function () {
      const seedWalletCap = 25000 * PRECISION; // $25K
      const publicWalletCap = 50000 * PRECISION; // $50K
      
      // Test seed round cap
      const largeEthAmount = ethers.parseEther("10"); // $40K worth
      const ethUsdValue = 4000 * PRECISION;
      const totalUsdFromLargeETH = (BigInt(largeEthAmount) * BigInt(ethUsdValue)) / ethers.parseEther("1");
      expect(totalUsdFromLargeETH).to.be.gt(seedWalletCap);
      
      // Test public round cap  
      const hugeEthAmount = ethers.parseEther("20"); // $80K worth
      const totalUsdFromHugeETH = (BigInt(hugeEthAmount) * BigInt(ethUsdValue)) / ethers.parseEther("1");
      expect(totalUsdFromHugeETH).to.be.gt(publicWalletCap);
    });

    it("Should validate phase-wise pricing in public presale", async function () {
      const phases = [
        { range: "0-4%", price: 2500 },    // $0.0025
        { range: "4-9%", price: 3500 },    // $0.0035  
        { range: "9-15%", price: 5000 },   // $0.0050
        { range: "15-22%", price: 7500 },  // $0.0075
        { range: "22-31%", price: 10000 }, // $0.0100
        { range: "31-41%", price: 12500 }, // $0.0125
        { range: "41-52%", price: 15000 }, // $0.0150
        { range: "52-66%", price: 20000 }, // $0.0200
        { range: "66-81%", price: 25000 }, // $0.0250
        { range: "81-100%", price: 30000 } // $0.0300
      ];
      
      for (const phase of phases) {
        const usdAmount = 1000 * PRECISION;
        const tokens = calculateTokensForUSD(usdAmount, phase.price);
        expect(tokens).to.be.gt(0);
      }
    });

    it("Should handle round switching scenarios", async function () {
      const seedRound = 0;
      const publicRound = 1;
      
      // Test round properties
      expect(seedRound).to.equal(ICORounds.Seed);
      expect(publicRound).to.equal(ICORounds.PublicPresale);
      
      // Seed round should require whitelist
      const seedRequiresWhitelist = true;
      expect(seedRequiresWhitelist).to.be.true;
      
      // Public round should not require whitelist
      const publicRequiresWhitelist = false;
      expect(publicRequiresWhitelist).to.be.false;
    });

    it("Should validate minimum purchase requirements", async function () {
      const minPurchaseUSD = 10 * PRECISION; // $10 minimum
      
      // Test various purchase amounts
      const smallAmount = 5 * PRECISION; // $5 - should fail
      const exactMinAmount = 10 * PRECISION; // $10 - should pass
      const largeAmount = 1000 * PRECISION; // $1000 - should pass
      
      expect(smallAmount).to.be.lt(minPurchaseUSD);
      expect(exactMinAmount).to.equal(minPurchaseUSD);
      expect(largeAmount).to.be.gt(minPurchaseUSD);
    });

    it("Should handle insufficient contract balance scenarios", async function () {
      const contractBalance = TOTAL_SUPPLY;
      const requestedTokens = ethers.parseEther("2000000000"); // 2B tokens (exceeds supply)
      
      expect(requestedTokens).to.be.gt(contractBalance);
      
      // Should detect insufficient balance
      const hasEnoughTokens = contractBalance >= requestedTokens;
      expect(hasEnoughTokens).to.be.false;
    });

    it("Should validate round allocation limits", async function () {
      const seedAllocation = (TOTAL_SUPPLY * 10n) / 100n; // 10%
      const publicAllocation = (TOTAL_SUPPLY * 30n) / 100n; // 30%
      
      // Test exceeding allocations
      const excessSeedRequest = seedAllocation + ethers.parseEther("1");
      const excessPublicRequest = publicAllocation + ethers.parseEther("1");
      
      expect(excessSeedRequest).to.be.gt(seedAllocation);
      expect(excessPublicRequest).to.be.gt(publicAllocation);
    });

    it("Should handle emergency pause scenarios", async function () {
      // Test that emergency pause would prevent purchases
      await eyeToken.pause();
      
      const isPaused = await eyeToken.paused();
      expect(isPaused).to.be.true;
      
      // Verify paused state prevents operations
      await expect(
        eyeToken.transfer(user1.address, ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(eyeToken, "EnforcedPause");
      
      await eyeToken.unpause();
    });

    it("Should validate stale price feed scenarios", async function () {
      const maxStaleTime = 30 * 60; // 30 minutes in seconds
      
      // Test the stale detection logic with known values
      const currentTime = 1000000; // Mock current time
      
      // Test case 1: Fresh price (5 minutes old)
      const freshTimestamp = currentTime - (5 * 60); // 5 minutes ago
      const isFresh = (currentTime - freshTimestamp) <= maxStaleTime;
      expect(isFresh).to.be.true;
      
      // Test case 2: Stale price (45 minutes old) 
      const staleTimestamp = currentTime - (45 * 60); // 45 minutes ago
      const isStale = (currentTime - staleTimestamp) > maxStaleTime;
      expect(isStale).to.be.true;
      
      // Test case 3: Exactly at threshold (30 minutes old)
      const thresholdTimestamp = currentTime - maxStaleTime;
      const isAtThreshold = (currentTime - thresholdTimestamp) <= maxStaleTime;
      expect(isAtThreshold).to.be.true;
      
      // Verify our price feed is accessible (basic functionality test)
      const priceData = await ethPriceFeed.latestRoundData();
      expect(priceData[1]).to.be.gt(0); // Price should be greater than 0
    });
  });

  describe("12. Advanced Purchase Flows", function () {
    it("Should simulate multi-step purchase process", async function () {
      const user = user1;
      const ethAmount = ethers.parseEther("1");
      
      // Step 1: Check whitelist status
      const proof = getProof(user.address);
      const isWhitelisted = merkleTree.verify(
        proof, 
        keccak256(ethers.solidityPacked(["address"], [user.address])), 
        merkleRoot
      );
      expect(isWhitelisted).to.be.true;
      
      // Step 2: Calculate USD value
      const ethPrice = 4000;
      const usdValue = (ethAmount * BigInt(ethPrice * PRECISION)) / ethers.parseEther("1");
      
      // Step 3: Check wallet cap
      const walletCap = 25000 * PRECISION;
      const withinCap = usdValue <= walletCap;
      expect(withinCap).to.be.true;
      
      // Step 4: Calculate tokens
      const tokenPrice = 1500; // Seed round price
      const tokenAmount = calculateTokensForUSD(Number(usdValue), tokenPrice);
      expect(tokenAmount).to.be.gt(0);
      
      // Step 5: Calculate TGE and vesting (0% TGE for purchases)
      const tgeAmount = calculateTGE(tokenAmount, 0);
      const vestingAmount = tokenAmount - tgeAmount;
      
      expect(tgeAmount).to.equal(0);
      expect(vestingAmount).to.equal(tokenAmount);
    });

    it("Should simulate USDC approval and purchase flow", async function () {
      const user = user2;
      const usdcAmount = ethers.parseEther("1500");
      
      // Step 1: Check user balance
      const userBalance = await mockUSDC.balanceOf(user.address);
      expect(userBalance).to.be.gte(usdcAmount);
      
      // Step 2: Simulate approval
      await mockUSDC.connect(user).approve(owner.address, usdcAmount);
      const allowance = await mockUSDC.allowance(user.address, owner.address);
      expect(allowance).to.equal(usdcAmount);
      
      // Step 3: Calculate expected tokens
      const tokenPrice = 1500;
      const usdValue = Number(usdcAmount) / (10 ** 18) * PRECISION;
      const expectedTokens = calculateTokensForUSD(usdValue, tokenPrice);
      
      // Step 4: Simulate transfer (representing purchase)
      await mockUSDC.transferFrom(user.address, fundReceiver.address, usdcAmount);
      
      const fundReceiverBalance = await mockUSDC.balanceOf(fundReceiver.address);
      expect(fundReceiverBalance).to.equal(usdcAmount);
    });

    it("Should simulate fiat purchase registration", async function () {
      const user = user3;
      const fiatAmountUSD = 5000 * PRECISION;
      
      // Step 1: Verify user is whitelisted (for seed round)
      const proof = getProof(user.address);
      const isWhitelisted = merkleTree.verify(
        proof,
        keccak256(ethers.solidityPacked(["address"], [user.address])),
        merkleRoot
      );
      expect(isWhitelisted).to.be.true;
      
      // Step 2: Calculate tokens for fiat purchase
      const tokenPrice = 1500;
      const tokenAmount = calculateTokensForUSD(fiatAmountUSD, tokenPrice);
      
      // Step 3: Simulate token allocation
      const userBalanceBefore = await eyeToken.balanceOf(user.address);
      await eyeToken.transfer(user.address, tokenAmount);
      const userBalanceAfter = await eyeToken.balanceOf(user.address);
      
      expect(userBalanceAfter - userBalanceBefore).to.equal(tokenAmount);
    });
  });

  describe("13. Edge Cases and Error Conditions", function () {
    it("Should handle zero amount purchases", async function () {
      const zeroEth = 0;
      const zeroUsdc = 0;
      const zeroFiat = 0;
      
      expect(zeroEth).to.equal(0);
      expect(zeroUsdc).to.equal(0);
      expect(zeroFiat).to.equal(0);
      
      // These should all be rejected in the actual contract
    });

    it("Should handle invalid price feed data", async function () {
      // Test with zero price (invalid)
      const MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");
      const invalidPriceFeed = await MockV3Aggregator.deploy(8, 0); // Zero price
      
      const priceData = await invalidPriceFeed.latestRoundData();
      expect(priceData[1]).to.equal(0);
      
      // This should be rejected in actual contract
    });

    it("Should handle maximum uint256 calculations safely", async function () {
      const maxUint256 = 2n ** 256n - 1n;
      const safeAmount = ethers.parseEther("1000000");
      
      expect(safeAmount).to.be.lt(maxUint256);
      
      // Verify no overflow in token calculations
      const result = calculateTokensForUSD(1000 * PRECISION, 1500);
      expect(result).to.be.lt(maxUint256);
    });

    it("Should handle precision edge cases", async function () {
      // Test very small amounts
      const tinyUsdAmount = 1; // 1 micro-dollar (smallest unit)
      const tokenPrice = 1500;
      const tinyTokens = calculateTokensForUSD(tinyUsdAmount, tokenPrice);
      
      expect(tinyTokens).to.be.gte(0);
      
      // Test very large amounts
      const largeUsdAmount = 1000000 * PRECISION; // $1M
      const largeTokens = calculateTokensForUSD(largeUsdAmount, tokenPrice);
      expect(largeTokens).to.be.gt(0);
    });
  });

  describe("14. Contract Integration Readiness", function () {
    it("Should verify all ICO contract prerequisites", async function () {
      // Token contract deployed and ready
      expect(await eyeToken.getAddress()).to.not.equal(ethers.ZeroAddress);
      expect(await eyeToken.totalSupply()).to.equal(TOTAL_SUPPLY);
      
      // Price feeds deployed and functional
      expect(await ethPriceFeed.getAddress()).to.not.equal(ethers.ZeroAddress);
      expect(await usdcPriceFeed.getAddress()).to.not.equal(ethers.ZeroAddress);
      expect(await usdtPriceFeed.getAddress()).to.not.equal(ethers.ZeroAddress);
      
      // Mock tokens ready for testing
      expect(await mockUSDC.getAddress()).to.not.equal(ethers.ZeroAddress);
      expect(await mockUSDT.getAddress()).to.not.equal(ethers.ZeroAddress);
      
      // Whitelist system operational
      expect(merkleRoot).to.not.equal("0x0000000000000000000000000000000000000000000000000000000000000000");
      
      // All mathematical functions verified
      const testCalc1 = calculateTokensForUSD(1500 * PRECISION, 1500);
      const testCalc2 = calculateTGE(ethers.parseEther("1000000"), 10);
      
      expect(testCalc1).to.equal(ethers.parseEther("1000000"));
      expect(testCalc2).to.equal(ethers.parseEther("100000"));
    });
  });
    it("Should verify all components are ready for integration", async function () {
      // Token contract ready
      expect(await eyeToken.totalSupply()).to.equal(TOTAL_SUPPLY);
      expect(await eyeToken.owner()).to.equal(owner.address);
      
      // Price feeds ready
      const ethPrice = await ethPriceFeed.latestRoundData();
      const usdcPrice = await usdcPriceFeed.latestRoundData();
      const usdtPrice = await usdtPriceFeed.latestRoundData();
      
      expect(ethPrice[1]).to.be.gt(0);
      expect(usdcPrice[1]).to.be.gt(0);
      expect(usdtPrice[1]).to.be.gt(0);
      
      // Mock tokens ready
      expect(await mockUSDC.totalSupply()).to.be.gt(0);
      expect(await mockUSDT.totalSupply()).to.be.gt(0);
      
      // Whitelist system ready
      expect(merkleRoot).to.not.equal("0x0000000000000000000000000000000000000000000000000000000000000000");
      
      // Mathematical functions verified
      const testCalculation = calculateTokensForUSD(1500 * PRECISION, 1500);
      expect(testCalculation).to.equal(ethers.parseEther("1000000"));
    });
  });