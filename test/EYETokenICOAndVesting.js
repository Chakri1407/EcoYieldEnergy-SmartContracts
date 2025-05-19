const { expect } = require("chai");
const { ethers, upgrades, network } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

let eyeTokenAddress,
  mockUSDCAddress,
  polUsdPriceFeedAddress,
  usdcUsdPriceFeedAddress,
  fundReceiverAddress,
  icoAndVestingAddress; 

  
describe("EYETokenICOAndVesting Contract Tests", function () {
  let owner, user1, user2, user3, fundReceiver;
  let EYE, MockUSDC, EYETokenICOAndVesting;
  let eyeToken, mockUSDC, icoAndVesting;
  let polUsdPriceFeed, usdcUsdPriceFeed;
  let merkleTree;
  let whitelistedAddresses;

  const ONE_ETH = ethers.parseEther("1.0");
  const ONE_USDC = ethers.parseUnits("1.0", 6); // USDC uses 6 decimals
  const ONE_DAY = 86400;
  const PRIVATE_SEED_DURATION = 900; // Matches contract's PRIVATE_SEED_DURATION

  // Helper function to get merkle proof for an address
  function getProof(address) {
    const abiCoder = new ethers.AbiCoder();
    const encodedAddress = abiCoder.encode(["address"], [address]);
    const innerHash = ethers.keccak256(encodedAddress);
    const leaf = keccak256(innerHash); // Match contract's leaf generation
    return merkleTree.getHexProof(leaf);
  }

  before(async function () {
    // Get signers
    [owner, user1, user2, user3, fundReceiver] = await ethers.getSigners();

    console.log("Setting up test environment...");

    // Use addresses from merkle.js to match provided Merkle root
    whitelistedAddresses = [
      "0xfE98c32B4F998eAf7850E18FA6afBbD665C45E39",
      "0xCc5e4E757E151aDA1F62EC9C82EB65efB95ef86c",
      "0x9E32B3e2C55bd16422cdE109C6591e2960E7ABcF",
    ];

    // Create merkle tree for whitelist
    const leaves = whitelistedAddresses.map((addr) => {
      const abiCoder = new ethers.AbiCoder();
      const encodedAddress = abiCoder.encode(["address"], [addr]);
      const innerHash = ethers.keccak256(encodedAddress);
      return keccak256(innerHash); // Match contract's leaf generation
    });

    merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true });
    const rootHash = merkleTree.getRoot().toString("hex");
    merkleRoot = "0x" + rootHash;

    console.log("Generated Merkle Root:", merkleRoot);
    // Verify the Merkle root matches the provided one
    expect(merkleRoot).to.equal("0x00b38484ea23e501a74be97409e696a205b6acfd7857c17e73d677b8ca8b0844");

    // Deploy mock price feeds
    const MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");
    polUsdPriceFeed = await MockV3Aggregator.deploy(8, 4 * 10 ** 8); // $4 per POL with 8 decimals
    await polUsdPriceFeed.waitForDeployment(); // Ensure deployment completes
    polUsdPriceFeedAddress = await polUsdPriceFeed.getAddress();
    console.log("polUsdPriceFeed deployed at:", polUsdPriceFeedAddress);

    usdcUsdPriceFeed = await MockV3Aggregator.deploy(8, 1 * 10 ** 8); // $1 per USDC with 8 decimals
    await usdcUsdPriceFeed.waitForDeployment(); // Ensure deployment completes
    usdcUsdPriceFeedAddress = await usdcUsdPriceFeed.getAddress();
    console.log("usdcUsdPriceFeed deployed at:", usdcUsdPriceFeedAddress);

    // Deploy contracts
    const EYEFactory = await ethers.getContractFactory("EYE");
    eyeToken = await EYEFactory.deploy(fundReceiver.address);
    await eyeToken.waitForDeployment(); // Ensure deployment completes
    eyeTokenAddress = await eyeToken.getAddress();
    console.log("EYE deployed at:", eyeTokenAddress);

    const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
    mockUSDC = await MockUSDCFactory.deploy();
    await mockUSDC.waitForDeployment(); // Ensure deployment completes
    mockUSDCAddress = await mockUSDC.getAddress();
    console.log("MockUSDC deployed at:", mockUSDCAddress);

    // Validate fundReceiver address
    fundReceiverAddress = fundReceiver.address;
    console.log("fundReceiver address:", fundReceiverAddress);
    if (!fundReceiverAddress || fundReceiverAddress === ethers.ZeroAddress) {
      throw new Error("Invalid fundReceiver address");
    }

    // Deploy proxy manager and implementation
    const EYETokenICOAndVestingFactory = await ethers.getContractFactory("EYETokenICOAndVesting");
    try {
      icoAndVesting = await upgrades.deployProxy(
        EYETokenICOAndVestingFactory,
        [
          eyeTokenAddress,
          fundReceiverAddress,
          mockUSDCAddress,
          polUsdPriceFeedAddress,
          usdcUsdPriceFeedAddress,
        ],
        { kind: "uups", initializer: "initialize" }
      );
      await icoAndVesting.waitForDeployment(); // Ensure deployment completes
      icoAndVestingAddress = await icoAndVesting.getAddress();
      console.log("EYETokenICOAndVesting deployed at:", icoAndVestingAddress);
    } catch (error) {
      console.error("Error deploying EYETokenICOAndVesting:", error);
      throw error;
    }

    // Transfer EYE tokens to ICO contract
    try {
      console.log("Transferring 200M EYE tokens to ICO contract:", icoAndVestingAddress);
      await eyeToken.connect(fundReceiver).transfer(icoAndVestingAddress, ethers.parseEther("200000000")); // 200M tokens
      console.log("EYE token transfer successful");
    } catch (error) {
      console.error("Error transferring EYE tokens:", error);
      throw error;
    }

    // Mint USDC for test users
    try {
      console.log("Minting USDC for test users...");
      await mockUSDC.mint(user1.address, ethers.parseUnits("10000", 6)); // 10k USDC
      await mockUSDC.mint(user2.address, ethers.parseUnits("20000", 6)); // 20k USDC
      await mockUSDC.mint(user3.address, ethers.parseUnits("10000", 6)); // 10k USDC
      console.log("USDC minting successful");
    } catch (error) {
      console.error("Error minting USDC:", error);
      throw error;
    }

    // Set up whitelist
    try {
      console.log("Setting whitelist Merkle root:", merkleRoot);
      await icoAndVesting.setWhitelistMerkleRoot(merkleRoot);
      console.log("Whitelist Merkle root set successfully");
    } catch (error) {
      console.error("Error setting whitelist Merkle root:", error);
      throw error;
    }

    console.log("Test environment setup complete");

    it("Should have the correct token balance", async function () {
      const balance = await eyeToken.balanceOf(icoAndVestingAddress); 
      console.log("ICO Contract token balance:", ethers.formatEther(balance));
      expect(balance).to.equal(ethers.parseEther("200000000"));
    });
  });

  describe("Sale Configuration", function () {
    it("Should configure pre-sale phase correctly", async function () {
      console.log("Configuring pre-sale phase...");

      await icoAndVesting.configureSalePhase(
        1, // SalePhase.PreSale
        ethers.parseEther("0.04"), // $0.04 per token
        ONE_DAY * 7, // 7 days duration
        ethers.parseEther("50000000"), // 50M tokens
        ethers.parseEther("1"), // $1 min purchase
        ethers.parseEther("10000") // $10k max purchase
      );

      const preSaleConfig = await icoAndVesting.saleConfigs(1);
      expect(preSaleConfig.tokenPrice).to.equal(ethers.parseEther("0.04"));
      expect(preSaleConfig.hardCap).to.equal(ethers.parseEther("50000000"));

      console.log("Pre-sale configuration successful");
    });

    it("Should configure public sale phase correctly", async function () {
      console.log("Configuring public sale phase...");

      await icoAndVesting.configureSalePhase(
        2, // SalePhase.PublicSale
        ethers.parseEther("0.06"), // $0.06 per token
        ONE_DAY * 14, // 14 days duration
        ethers.parseEther("30000000"), // 30M tokens
        ethers.parseEther("1"), // $1 min purchase
        ethers.MaxUint256 // No max purchase limit
      );

      const publicSaleConfig = await icoAndVesting.saleConfigs(2);
      expect(publicSaleConfig.tokenPrice).to.equal(ethers.parseEther("0.06"));
      expect(publicSaleConfig.hardCap).to.equal(ethers.parseEther("30000000"));

      console.log("Public sale configuration successful");
    });
  });

  describe("Whitelist Functionality", function () {
    it("Should correctly identify whitelisted addresses", async function () {
      console.log("Verifying whitelist functionality...");

      const user1Proof = getProof(whitelistedAddresses[0]); // 0xfE98c32B...
      const user2Proof = getProof(whitelistedAddresses[1]); // 0xCc5e4E75...
      const user3Proof = getProof(user3.address);

      // User1 and User2 should be whitelisted
      expect(await icoAndVesting.isWhitelisted(whitelistedAddresses[0], user1Proof)).to.be.true;
      expect(await icoAndVesting.isWhitelisted(whitelistedAddresses[1], user2Proof)).to.be.true;

      // User3 should not be whitelisted
      expect(await icoAndVesting.isWhitelisted(user3.address, user3Proof)).to.be.false;

      console.log("Whitelist verification passed");
    });
  });

  describe("Pre-sale Phase", function () {
    it("Should start the pre-sale phase", async function () {
      console.log("Starting pre-sale phase...");

      const startTime = (await ethers.provider.getBlock("latest")).timestamp + 100;
      const duration = ONE_DAY * 7; // 7 days

      await icoAndVesting.startPreSale(startTime, duration);

      expect(await icoAndVesting.currentPhase()).to.equal(1); // SalePhase.PreSale

      const preSaleConfig = await icoAndVesting.saleConfigs(1);
      expect(preSaleConfig.startTime).to.equal(startTime);
      expect(preSaleConfig.endTime).to.equal(startTime + duration);

      console.log("Pre-sale started successfully");

      // Move time forward to start the pre-sale
      await time.increaseTo(startTime + 1);
      console.log("Moved time forward to pre-sale start");
    });

    it("Should allow whitelisted users to buy tokens with POL during pre-sale", async function () {
      console.log("Testing token purchase with POL in pre-sale...");

      const initialFundReceiverBalance = await ethers.provider.getBalance(fundReceiver.address);
      const user1Proof = getProof(whitelistedAddresses[0]);

      const amountToSend = ethers.parseEther("1"); // 1 POL

      // Calculate expected tokens (1 POL = $4, token price = $0.04)
      // So 1 POL should buy 4/0.04 = 100 tokens
      const expectedTokens = ethers.parseEther("100");

      // Impersonate whitelisted address for testing
await network.provider.request({
  method: "hardhat_impersonateAccount",
  params: [whitelistedAddresses[0]],
});
const whitelistedUser1 = await ethers.getSigner(whitelistedAddresses[0]);

// Fund the impersonated account with ETH
await owner.sendTransaction({
  to: whitelistedAddresses[0],
  value: ethers.parseEther("2"), // Send 2 ETH to cover gas and 1 POL purchase
});

const tx = await icoAndVesting.connect(whitelistedUser1).buyTokensWithPOL(user1Proof, {
  value: amountToSend,
});
      // Stop impersonating
      await network.provider.request({
        method: "hardhat_stopImpersonatingAccount",
        params: [whitelistedAddresses[0]],
      });

      // Check if purchase was successful
      const receipt = await tx.wait();
      const purchaseEvent = receipt.logs
        .map((log) => {
          try {
            return icoAndVesting.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((e) => e && e.name === "TokensPurchased");

      expect(purchaseEvent).to.not.be.undefined;
      expect(purchaseEvent.args.buyer).to.equal(whitelistedAddresses[0]);
      expect(purchaseEvent.args.paymentMethod).to.equal("POL");

      // Check if funds were transferred to fundReceiver
      const newFundReceiverBalance = await ethers.provider.getBalance(fundReceiver.address);
      expect(ethers.toBigInt(newFundReceiverBalance) - ethers.toBigInt(initialFundReceiverBalance)).to.equal(ethers.toBigInt(amountToSend));

      // Check vesting schedule (pre-sale tokens should be vested)
      const vestingDetails = await icoAndVesting.getVestingDetails(whitelistedAddresses[0]);
      expect(vestingDetails.totalAmount).to.equal(expectedTokens);
      expect(vestingDetails.vestingType).to.equal(1); // VestingType.PrivateSeed

      console.log("Pre-sale POL purchase successful");
    });

    it("Should allow whitelisted users to buy tokens with USDC during pre-sale", async function () {
      console.log("Testing token purchase with USDC in pre-sale...");

const user2Proof = getProof(whitelistedAddresses[1]);
const usdcAmount = ethers.parseUnits("200", 6); // 200 USDC

// Calculate expected tokens (200 USDC = $200, token price = $0.04)
// So 200 USDC should buy 200/0.04 = 5000 tokens
const expectedTokens = ethers.parseEther("5000");

// Impersonate whitelisted address for testing
await network.provider.request({
  method: "hardhat_impersonateAccount",
  params: [whitelistedAddresses[1]],
});
const whitelistedUser2 = await ethers.getSigner(whitelistedAddresses[1]);

// Fund the impersonated account with ETH
await owner.sendTransaction({
  to: whitelistedAddresses[1],
  value: ethers.parseEther("1"), // Send 1 ETH for gas
});

// Mint USDC to whitelisted address
await mockUSDC.mint(whitelistedAddresses[1], usdcAmount);

await mockUSDC.connect(whitelistedUser2).approve(icoAndVestingAddress, usdcAmount);
const tx = await icoAndVesting.connect(whitelistedUser2).buyTokensWithUSDC(usdcAmount, user2Proof); 
// Stop impersonating
      await network.provider.request({
        method: "hardhat_stopImpersonatingAccount",
        params: [whitelistedAddresses[1]],
      });

      // Check if purchase was successful
      const receipt = await tx.wait();
      const purchaseEvent = receipt.logs
        .map((log) => {
          try {
            return icoAndVesting.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((e) => e && e.name === "TokensPurchased");

      expect(purchaseEvent).to.not.be.undefined;
      expect(purchaseEvent.args.buyer).to.equal(whitelistedAddresses[1]);
      expect(purchaseEvent.args.paymentMethod).to.equal("USDC");

      // Check if USDC was transferred to fundReceiver
      const fundReceiverUsdcBalance = await mockUSDC.balanceOf(fundReceiver.address);
      expect(fundReceiverUsdcBalance).to.equal(usdcAmount);

      // Check vesting schedule (pre-sale tokens should be vested)
      const vestingDetails = await icoAndVesting.getVestingDetails(whitelistedAddresses[1]);
      expect(vestingDetails.totalAmount).to.equal(expectedTokens);
      expect(vestingDetails.vestingType).to.equal(1); // VestingType.PrivateSeed

      console.log("Pre-sale USDC purchase successful");
    });

    it("Should not allow non-whitelisted users to participate in pre-sale", async function () {
      console.log("Testing non-whitelisted user restriction...");

      const user3Proof = getProof(user3.address);

      await expect(
        icoAndVesting.connect(user3).buyTokensWithPOL(user3Proof, {
          value: ethers.parseEther("1"),
        })
      ).to.be.revertedWith("Not whitelisted for pre-sale");

      console.log("Non-whitelisted restriction working correctly");
    });

    it("Should respect purchase limits in pre-sale", async function () {
      console.log("Testing purchase limits...");

      // Pre-sale has max purchase limit of $10,000
      // User1 (whitelistedAddresses[0]) has already spent $4 (1 POL)
      // Try to buy with $10,000 more (should fail)

      const user1Proof = getProof(whitelistedAddresses[0]);
      const largePolAmount = ethers.parseEther("2500"); // 2500 POL = $10,000

      await network.provider.request({
  method: "hardhat_impersonateAccount",
  params: [whitelistedAddresses[0]],
});
const whitelistedUser1 = await ethers.getSigner(whitelistedAddresses[0]);

// Fund the impersonated account with ETH
await owner.sendTransaction({
  to: whitelistedAddresses[0],
  value: ethers.parseEther("2600"), // Send 2600 ETH to cover 2500 POL + gas
});

await expect(
  icoAndVesting.connect(whitelistedUser1).buyTokensWithPOL(user1Proof, {
    value: largePolAmount,
  })
).to.be.revertedWith("Exceeds max purchase limit");

      await network.provider.request({
        method: "hardhat_stopImpersonatingAccount",
        params: [whitelistedAddresses[0]],
      });

      console.log("Purchase limits enforced correctly");
    });

    it("Should allow admin to register a fiat purchase during pre-sale", async function () {
      console.log("Testing fiat purchase registration...");

      const user2Proof = getProof(whitelistedAddresses[1]);
      const usdAmount = ethers.parseEther("500"); // $500

      // Calculate expected tokens ($500 at $0.04 per token = 12,500 tokens)
      const expectedTokens = ethers.parseEther("12500");

      const tx = await icoAndVesting.registerFiatPurchase(whitelistedAddresses[1], usdAmount, "USD", user2Proof);

      // Check if purchase was registered successfully
      const receipt = await tx.wait();
      const purchaseEvent = receipt.logs
        .map((log) => {
          try {
            return icoAndVesting.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((e) => e && e.name === "TokensPurchased");

      expect(purchaseEvent).to.not.be.undefined;
      expect(purchaseEvent.args.buyer).to.equal(whitelistedAddresses[1]);
      expect(purchaseEvent.args.amount).to.equal(expectedTokens);

      const vestingDetails = await icoAndVesting.getVestingDetails(whitelistedAddresses[1]);
console.log("Vesting details for fiat purchase:", vestingDetails);
expect(vestingDetails.totalAmount).to.equal(expectedTotalTokens);
expect(vestingDetails.salePhase).to.equal(1); // SalePhase.PreSale
expect(vestingDetails.vestingType).to.equal(0); // VestingType.PrivateSeed 
    });

    it("Should end the pre-sale phase manually", async function () {
      console.log("Testing manual pre-sale closure...");

      await icoAndVesting.endCurrentPhase();

      expect(await icoAndVesting.currentPhase()).to.equal(0); // SalePhase.Inactive

      console.log("Pre-sale ended successfully");
    });
  });

  describe("Public Sale Phase", function () {
    it("Should start the public sale phase", async function () {
      console.log("Starting public sale phase...");

      const startTime = (await ethers.provider.getBlock("latest")).timestamp + 100;
      const duration = ONE_DAY * 14; // 14 days

      await icoAndVesting.startPublicSale(startTime, duration);

      expect(await icoAndVesting.currentPhase()).to.equal(2); // SalePhase.PublicSale

      const publicSaleConfig = await icoAndVesting.saleConfigs(2);
      expect(publicSaleConfig.startTime).to.equal(startTime);
      expect(publicSaleConfig.endTime).to.equal(startTime + duration);

      console.log("Public sale started successfully");

      // Move time forward to start the public sale
      await time.increaseTo(startTime + 1);
      console.log("Moved time forward to public sale start");
    });

    it("Should allow any user to buy tokens with POL during public sale", async function () {
      console.log("Testing token purchase with POL in public sale...");

      const initialFundReceiverBalance = await ethers.provider.getBalance(fundReceiver.address);
      const amountToSend = ethers.parseEther("2"); // 2 POL

      // Calculate expected tokens (2 POL = $8, token price = $0.06)
      // So 2 POL should buy 8/0.06 = 133.33 tokens
      const expectedTokens = ethers.parseEther("133.333333333333333333");

      // Even non-whitelisted user3 should be able to participate
      const tx = await icoAndVesting.connect(user3).buyTokensWithPOL([], {
        value: amountToSend,
      });

      // Check if purchase was successful
      const receipt = await tx.wait();
      const purchaseEvent = receipt.logs
        .map((log) => {
          try {
            return icoAndVesting.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((e) => e && e.name === "TokensPurchased");

      expect(purchaseEvent).to.not.be.undefined;
      expect(purchaseEvent.args.buyer).to.equal(user3.address);

      // Check if funds were transferred to fundReceiver
      const newFundReceiverBalance = await ethers.provider.getBalance(fundReceiver.address);
      expect(ethers.toBigInt(newFundReceiverBalance) - ethers.toBigInt(initialFundReceiverBalance)).to.equal(ethers.toBigInt(amountToSend));

      // Check if tokens were transferred directly (no vesting in public sale)
      const user3Balance = await eyeToken.balanceOf(user3.address);
      expect(user3Balance).to.be.gt(0);

      console.log("Public sale POL purchase successful");
    });

    it("Should allow any user to buy tokens with USDC during public sale", async function () {
      console.log("Testing token purchase with USDC in public sale...");

      const usdcAmount = ethers.parseUnits("300", 6); // 300 USDC

      await mockUSDC.connect(user3).approve(icoAndVestingAddress, usdcAmount);
const tx = await icoAndVesting.connect(user3).buyTokensWithUSDC(usdcAmount, []); 

      // Check if purchase was successful
      const receipt = await tx.wait();
      const purchaseEvent = receipt.logs
        .map((log) => {
          try {
            return icoAndVesting.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((e) => e && e.name === "Tokensconomic");

      expect(purchaseEvent).to.not.be.undefined;
      expect(purchaseEvent.args.buyer).to.equal(user3.address);

      console.log("Public sale USDC purchase successful");
    });

    it("Should end the public sale phase", async function () {
      console.log("Testing public sale closure...");

      await icoAndVesting.endCurrentPhase();

      expect(await icoAndVesting.currentPhase()).to.equal(3); // SalePhase.Ended

      console.log("Public sale ended successfully");
    });
  });

  describe("Vesting Functionality", function () {
    it("Should release vested tokens after cliff period for pre-sale participants", async function () {
      console.log("Testing vesting token release...");

      // Pre-sale participants have their tokens vested
      // Wait until after the cliff period (5 minutes in this test contract)
      // Then some tokens should be releasable

      const user1InitialBalance = await eyeToken.balanceOf(whitelistedAddresses[0]);
      console.log("User1 initial token balance:", ethers.formatEther(user1InitialBalance));

      // Move time forward to after cliff period
      const vestingDetails = await icoAndVesting.getVestingDetails(whitelistedAddresses[0]);
      await time.increaseTo(Number(vestingDetails.cliffEnd) + 1);
      console.log("Moved time forward to after cliff period");

      // Move time forward more to have some tokens vested
      await time.increase(PRIVATE_SEED_DURATION / 2);
      console.log("Moved time forward halfway through vesting period");

      // Impersonate whitelisted address for claiming
      await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [whitelistedAddresses[0]],
      });
      const whitelistedUser1 = await ethers.getSigner(whitelistedAddresses[0]);

      // Claim vested tokens
      await icoAndVesting.connect(whitelistedUser1).claimVestedTokens();

      // Stop impersonating
      await network.provider.request({
        method: "hardhat_stopImpersonatingAccount",
        params: [whitelistedAddresses[0]],
      });

      // Check new balance
      const user1NewBalance = await eyeToken.balanceOf(whitelistedAddresses[0]);
      console.log("User1 new token balance:", ethers.formatEther(user1NewBalance));

      // Should have received some tokens
      expect(user1NewBalance).to.be.gt(user1InitialBalance);

      console.log("Vesting token release successful");
    });

    it("Should release all vested tokens after vesting period", async function () {
      console.log("Testing full vesting completion...");

      // Move time forward to after full vesting period
      const vestingDetails = await icoAndVesting.getVestingDetails(whitelistedAddresses[0]);
      await time.increaseTo(Number(vestingDetails.vestingEnd) + 1);
      console.log("Moved time forward to after full vesting period");

      // Impersonate whitelisted address for claiming
      await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [whitelistedAddresses[0]],
      });
      const whitelistedUser1 = await ethers.getSigner(whitelistedAddresses[0]);

      // Claim vested tokens
      await icoAndVesting.connect(whitelistedUser1).claimVestedTokens();

      // Stop impersonating
      await network.provider.request({
        method: "hardhat_stopImpersonatingAccount",
        params: [whitelistedAddresses[0]],
      });

      // Check if user received all tokens
      const user1Balance = await eyeToken.balanceOf(whitelistedAddresses[0]);
      console.log("User1 final token balance:", ethers.formatEther(user1Balance));

      // User should have received all their tokens
      expect(user1Balance).to.equal(vestingDetails.totalAmount);

      console.log("Full vesting completion successful");
    });

    it("Should allow admin to create team/advisor vesting schedule", async function () {
      console.log("Testing team/advisor vesting creation...");

      const teamTokens = ethers.parseEther("1000000"); // 1M tokens

      const tx = await icoAndVesting.createTeamAdvisorVesting(user3.address, teamTokens);

      // Check if vesting schedule was created
      const receipt = await tx.wait();
      const vestingEvent = receipt.logs
        .map((log) => {
          try {
            return icoAndVesting.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((e) => e && e.name === "VestingScheduleCreated");

      expect(vestingEvent).to.not.be.undefined;
      expect(vestingEvent.args.beneficiary).to.equal(user3.address);
      expect(vestingEvent.args.amount).to.equal(teamTokens);
      expect(vestingEvent.args.vestingType).to.equal(2); // VestingType.TeamAdvisor

      // Check vesting details
      const vestingDetails = await icoAndVesting.getVestingDetails(user3.address);
      expect(vestingDetails.totalAmount).to.equal(teamTokens);
      expect(vestingDetails.vestingType).to.equal(2); // VestingType.TeamAdvisor
      expect(vestingDetails.cliffEnd).to.be.gt(vestingDetails.vestingStart); // Check cliff exists

      console.log("Team/advisor vesting creation successful");
    });
  });

  describe("Admin Functions", function () {
    it("Should withdraw unsold tokens after sale ends", async function () {
      console.log("Testing unsold token withdrawal...");

      const initialOwnerBalance = await eyeToken.balanceOf(owner.address);
const contractBalance = await eyeToken.balanceOf(icoAndVestingAddress);  

      console.log("Contract token balance before withdrawal:", ethers.formatEther(contractBalance));

      await icoAndVesting.withdrawUnsoldTokens(owner.address);

      const newOwnerBalance = await eyeToken.balanceOf(owner.address);
      const newContractBalance = await eyeToken.balanceOf(icoAndVesting.address);

      console.log("Contract token balance after withdrawal:", ethers.formatEther(newContractBalance));
      console.log("Owner received tokens:", ethers.formatEther(newOwnerBalance.sub(initialOwnerBalance)));

      // Contract should have 0 balance now
      expect(newContractBalance).to.equal(0);
      // Owner should have received all tokens
      expect(newOwnerBalance.sub(initialOwnerBalance)).to.equal(contractBalance);

      console.log("Unsold token withdrawal successful");
    });

    it("Should toggle pause functionality", async function () {
      console.log("Testing pause functionality...");

      // Initially not paused
      expect(await icoAndVesting.paused()).to.be.false;

      // Pause the contract
      await icoAndVesting.togglePause();
      expect(await icoAndVesting.paused()).to.be.true;

      // Unpause the contract
      await icoAndVesting.togglePause();
      expect(await icoAndVesting.paused()).to.be.false;

      console.log("Pause functionality working correctly");
    });
  });

  describe("Edge Cases and Error Handling", function () {
    // Start a new pre-sale phase for testing these cases
    beforeEach(async function () {
      // Reset to inactive phase if not already
      if ((await icoAndVesting.currentPhase()) !== 0) {
        try {
          await icoAndVesting.endCurrentPhase();
        } catch (e) {
          // Ignore errors, we just want to make sure we're in Inactive phase
        }
      }

      // Transfer more tokens to the contract since we withdrew them all
      await eyeToken.connect(fundReceiver).transfer(icoAndVestingAddress, ethers.parseEther("10000000")); // 10M tokens

      // Start a new pre-sale
      const startTime = (await ethers.provider.getBlock("latest")).timestamp + 100;
      const duration = ONE_DAY * 7; // 7 days

      try {
        await icoAndVesting.startPreSale(startTime, duration);
        await time.increaseTo(startTime + 1);
      } catch (e) {
        console.log("Error starting new pre-sale phase:", e.message);
      }
    });

    it("Should reject purchases below minimum limit", async function () {
      console.log("Testing minimum purchase limit...");

      const user1Proof = getProof(whitelistedAddresses[0]);
      const tinyAmount = ethers.parseEther("0.0001"); // Very small amount of POL

      await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [whitelistedAddresses[0]],
      });
      const whitelistedUser1 = await ethers.getSigner(whitelistedAddresses[0]);

      await expect(
        icoAndVesting.connect(whitelistedUser1).buyTokensWithPOL(user1Proof, {
          value: tinyAmount,
        })
      ).to.be.revertedWith("Purchase below minimum limit");

      await network.provider.request({
        method: "hardhat_stopImpersonatingAccount",
        params: [whitelistedAddresses[0]],
      });

      console.log("Minimum purchase limit enforced correctly");
    });

    it("Should reject transactions when hard cap is reached", async function () {
      console.log("Testing hard cap limit...");

      // First, update the hard cap to a very small amount
      await icoAndVesting.configureSalePhase(
        1, // SalePhase.PreSale
        ethers.parseEther("0.04"), // $0.04 per token
        ONE_DAY * 7, // 7 days duration
        ethers.parseEther("10"), // Only 10 tokens (very small hard cap)
        ethers.parseEther("1"), // $1 min purchase
        ethers.parseEther("10000") // $10k max purchase
      );

      const user1Proof = getProof(whitelistedAddresses[0]);
      const amount = ethers.parseEther("1"); // 1 POL = $4 = 100 tokens at $0.04 each

      await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [whitelistedAddresses[0]],
      });
      const whitelistedUser1 = await ethers.getSigner(whitelistedAddresses[0]);

      await expect(
        icoAndVesting.connect(whitelistedUser1).buyTokensWithPOL(user1Proof, {
          value: amount,
        })
      ).to.be.revertedWith("Not enough tokens left");

      await network.provider.request({
        method: "hardhat_stopImpersonatingAccount",
        params: [whitelistedAddresses[0]],
      });

      console.log("Hard cap limit enforced correctly");
    });
  });
}); 