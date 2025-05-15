const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { StandardMerkleTree } = require("@openzeppelin/merkle-tree");

describe("EYETokenICOAndVesting", function () {
  let EYE, ICO, MockUSDC, PolPriceFeed, UsdcPriceFeed;
  let owner, fundReceiver, user1, user2, user3;
  let merkleTreeInstance, merkleRootHash;
  
  // Constants
  const TOTAL_SUPPLY = "1000000000000000000000000000"; // 1B EYE in wei
  const PRE_SALE_PRICE = "40000000000000000"; // 0.04 in wei
  const PUBLIC_SALE_PRICE = "60000000000000000"; // 0.06 in wei
  const POL_PRICE = 0.5 * 1e8; // $0.5 per POL (8 decimals)
  const USDC_PRICE = 1 * 1e8; // $1 per USDC (8 decimals)
  const TOKENS_FOR_ICO = "200000000000000000000000000"; // 200M EYE in wei
  
  before(async function() {
    // Get signers
    [owner, fundReceiver, user1, user2, user3] = await ethers.getSigners();
    
    try {
      // Whitelist addresses are now set up in the main scope

      // Deploy mock price feeds
      const MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");
      PolPriceFeed = await MockV3Aggregator.deploy(8, POL_PRICE);
      UsdcPriceFeed = await MockV3Aggregator.deploy(8, USDC_PRICE);
      
      // Deploy MockUSDC
      const MockUSDCContract = await ethers.getContractFactory("MockUSDC");
      MockUSDC = await MockUSDCContract.deploy();
      await MockUSDC.mint(user1.address, ethers.parseUnits("10000", 6)); // 10k USDC
      await MockUSDC.mint(user2.address, ethers.parseUnits("10000", 6));
      
      // Deploy EYE token
      const EYEToken = await ethers.getContractFactory("EYE");
      EYE = await EYEToken.deploy(fundReceiver.address);
      
      // Deploy ICO contract
      const ICOContract = await ethers.getContractFactory("EYETokenICOAndVesting");
      ICO = await upgrades.deployProxy(ICOContract, [
        await EYE.getAddress(),
        await fundReceiver.getAddress(),
        await MockUSDC.getAddress(),
        await PolPriceFeed.getAddress(),
        await UsdcPriceFeed.getAddress()
      ]);
      
      // Transfer tokens to ICO contract
      await EYE.connect(fundReceiver).transfer(await ICO.getAddress(), TOKENS_FOR_ICO);
      
      console.log("All contracts deployed and initialized successfully");
    } catch (error) {
      console.error("Error in before hook:", error);
      throw error;
    }
  });

  // Helper function to get future timestamp
  const getFutureTimestamp = async (secondsFromNow = 60) => {
    const block = await ethers.provider.getBlock('latest');
    return block.timestamp + BigInt(secondsFromNow);
  };
  
  // Helper function to get merkle proof for an address
  let getMerkleProof;
  
  // Initialize WhitelistMerkleTree after signers are set up
  before(async function() {
    // Whitelist data with test addresses
    const whitelistData = [
      { address: user1.address },
      { address: user2.address },
      { address: user3.address },
      { address: owner.address }
    ];
    
    // Create merkle tree
    const values = whitelistData.map(x => [x.address]);
    merkleTreeInstance = StandardMerkleTree.of(values, ["address"]);
    merkleRootHash = merkleTreeInstance.root;
    
    // Initialize the getMerkleProof function
    getMerkleProof = (address) => {
      const leafIndex = merkleTreeInstance.leafLookup([address]);
      if (leafIndex === -1) return [];
      return merkleTreeInstance.getProof(leafIndex);
    };
  });
  
  // Helper function to convert number to BigInt
  const toBigInt = (value) => {
    return typeof value === 'bigint' ? value : BigInt(value);
  };

  describe("Admin Functions", function () {
    before(async function() {
      // Set the merkle root in the contract
      await ICO.setWhitelistMerkleRoot(merkleRootHash);
    });
    
    beforeEach(async function () {
      // Ensure no active sale before each test
      try { await ICO.endCurrentPhase(); } catch {}
    });

    it("should set whitelist Merkle root", async function () {
      await ICO.setWhitelistMerkleRoot(merkleRootHash);
      expect(await ICO.whitelistMerkleRoot()).to.equal(merkleRootHash);
    });

    it("should configure sale phase", async function () {
      const newPrice = ethers.parseEther("0.05");
      const duration = 3600; // 1 hour
      const hardCap = ethers.parseEther("50000000"); // 50M
      const minPurchase = ethers.parseEther("50");
      const maxPurchase = ethers.parseEther("5000");

      await ICO.configureSalePhase(1, newPrice, duration, hardCap, minPurchase, maxPurchase); // PreSale
      const config = await ICO.saleConfigs(1);
      expect(config.tokenPrice).to.equal(newPrice);
      expect(config.hardCap).to.equal(hardCap);
      expect(config.minPurchase).to.equal(minPurchase);
      expect(config.maxPurchase).to.equal(maxPurchase);
    });

    it("should start pre-sale", async function () {
      const startTime = await getFutureTimestamp(60); // 1 minute from now
      const duration = 3600;
      
      // Configure sale phase first
      await ICO.configureSalePhase(
        1, // Pre-sale phase
        ethers.parseEther("0.04"), // Price
        duration,
        ethers.parseEther("50000000"), // Hard cap
        ethers.parseEther("100"), // Min purchase
        ethers.parseEther("10000") // Max purchase
      );
      
      await ICO.startPreSale(startTime, duration);
      expect(await ICO.currentPhase()).to.equal(1); // PreSale
      const config = await ICO.saleConfigs(1);
      expect(config.startTime).to.equal(toBigInt(startTime));
      expect(config.endTime).to.equal(toBigInt(startTime) + toBigInt(duration));
    });

    it("should start public sale after pre-sale", async function () {
      // First end any active sale
      try { await ICO.endCurrentPhase(); } catch {}
      
      // Configure pre-sale phase
      const block = await ethers.provider.getBlock('latest');
      const preSaleStart = block.timestamp + 60n; // 1 minute from now
      const preSaleDuration = 1800; // 30 minutes
      
      await ICO.configureSalePhase(
        1, // Pre-sale phase
        ethers.parseEther("0.04"), // Price
        preSaleDuration,
        ethers.parseEther("50000000"), // Hard cap
        ethers.parseEther("100"), // Min purchase
        ethers.parseEther("10000") // Max purchase
      );
      
      await ICO.startPreSale(preSaleStart, preSaleDuration);
      
      // Move time forward to after pre-sale ends
      await ethers.provider.send("evm_increaseTime", [Number(toBigInt(preSaleDuration)) + 1]);
      await ethers.provider.send("evm_mine", []);
      
      // Configure public sale phase
      const publicBlock = await ethers.provider.getBlock('latest');
      const publicSaleStart = publicBlock.timestamp + 1n;
      const publicSaleDuration = 3600; // 1 hour
      
      await ICO.configureSalePhase(
        2, // Public sale phase
        ethers.parseEther("0.05"), // Higher price
        publicSaleDuration,
        ethers.parseEther("100000000"), // Higher hard cap
        ethers.parseEther("100"), // Min purchase
        ethers.parseEther("50000") // Higher max purchase
      );
      
      // Start public sale
      await ICO.startPublicSale(publicSaleStart, publicSaleDuration);
      
      expect(await ICO.currentPhase()).to.equal(2); // PublicSale
      const config = await ICO.saleConfigs(2);
      expect(config.startTime).to.equal(publicSaleStart);
      expect(config.endTime).to.equal(publicSaleStart + toBigInt(publicSaleDuration));
    });

    it("should end current phase", async function () {
      // End any active sale first
      try { await ICO.endCurrentPhase(); } catch {}
      
      // Start a new sale
      await ICO.setWhitelistMerkleRoot(merkleRoot);
      const startTime = Math.floor(Date.now() / 1000) - 3600;
      await ICO.startPreSale(startTime, 3600);
      
      // End the sale
      await ICO.endCurrentPhase();
      expect(await ICO.currentPhase()).to.equal(0); // Inactive
    });

    it("should set fund receiver", async function () {
      const newReceiver = user3.address;
      await ICO.setFundReceiver(newReceiver);
      expect(await ICO.fundReceiverAddress()).to.equal(newReceiver);
    });

    it("should withdraw unsold tokens", async function () {
      await ICO.setWhitelistMerkleRoot(merkleRoot);
      await ICO.startPreSale(Math.floor(Date.now() / 1000) - 3600, 3600);
      await ICO.endCurrentPhase();
      await ICO.startPublicSale(Math.floor(Date.now() / 1000) - 3600, 3600);
      await ICO.endCurrentPhase();
      const balanceBefore = await EYE.balanceOf(owner.address);
      await ICO.withdrawUnsoldTokens(owner.address);
      const balanceAfter = await EYE.balanceOf(owner.address);
      expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther("200000000"));
    });

    it("should toggle pause", async function () {
      await ICO.togglePause();
      expect(await ICO.paused()).to.be.true;
      await ICO.togglePause();
      expect(await ICO.paused()).to.be.false;
    });

    it("should create vesting schedules", async function () {
      const amount = ethers.parseEther("10000");
      await ICO.createPrivateSeedVesting(user1.address, amount);
      const schedule = await ICO.vestingSchedules(user1.address);
      expect(schedule.totalAmount).to.equal(amount);
      expect(schedule.vestingType).to.equal(1); // PrivateSeed

      await ICO.createTeamAdvisorVesting(user2.address, amount);
      const schedule2 = await ICO.vestingSchedules(user2.address);
      expect(schedule2.totalAmount).to.equal(amount);
      expect(schedule2.vestingType).to.equal(2); // TeamAdvisor
    });
  });

  describe("User Functions", function () {
    beforeEach(async function () {
      // End any active sale first
      try { await ICO.endCurrentPhase(); } catch {}
      
      // Configure and start pre-sale
      await ICO.setWhitelistMerkleRoot(merkleRoot);
      
      // Configure sale phase first
      await ICO.configureSalePhase(
        1, // Pre-sale phase
        ethers.parseEther("0.04"), // Price
        7200, // Duration
        ethers.parseEther("50000000"), // Hard cap
        ethers.parseEther("100"), // Min purchase
        ethers.parseEther("10000") // Max purchase
      );
      
      const startTime = (await ethers.provider.getBlock('latest')).timestamp + 60n; // 1 minute from now
      const duration = 7200; // 2 hours duration
      
      // Configure sale phase first
      await ICO.configureSalePhase(
        1, // Pre-sale phase
        ethers.parseEther("0.04"), // Price
        duration,
        ethers.parseEther("50000000"), // Hard cap
        ethers.parseEther("100"), // Min purchase
        ethers.parseEther("10000") // Max purchase
      );
      
      await ICO.startPreSale(startTime, duration);
    });

    it("should buy tokens with POL", async function () {
      const polAmount = ethers.parseEther("100"); // 100 POL
      const usdValue = polAmount * BigInt(Math.floor(POL_PRICE)) / BigInt(1e8); // $50
      const tokenAmount = usdValue * ethers.parseEther("1") / BigInt(PRE_SALE_PRICE); // 1250 EYE
      const proof = getMerkleProof(user1.address);

      const fundReceiverBalanceBefore = await ethers.provider.getBalance(await fundReceiver.getAddress());
      await ICO.connect(user1).buyTokensWithPOL(proof, { value: polAmount });
      const fundReceiverBalanceAfter = await ethers.provider.getBalance(await fundReceiver.getAddress());

      expect(fundReceiverBalanceAfter - fundReceiverBalanceBefore).to.equal(polAmount);
      const schedule = await ICO.vestingSchedules(user1.address);
      expect(schedule.totalAmount).to.equal(tokenAmount);
    });

    it("should buy tokens with USDC", async function () {
      const usdcAmount = ethers.parseUnits("50", 6); // 50 USDC
      const usdValue = usdcAmount * BigInt(Math.floor(USDC_PRICE)) / BigInt(1e8); // $50
      const tokenAmount = usdValue * ethers.parseEther("1") / BigInt(PRE_SALE_PRICE); // 1250 EYE
      const proof = getMerkleProof(user1.address);

      await MockUSDC.connect(user1).approve(await ICO.getAddress(), usdcAmount);
      await ICO.connect(user1).buyTokensWithUSDC(usdcAmount, proof);

      const schedule = await ICO.vestingSchedules(user1.address);
      expect(schedule.totalAmount).to.equal(tokenAmount);
      expect(await MockUSDC.balanceOf(await fundReceiver.getAddress())).to.equal(usdcAmount);
    });

    it("should register fiat purchase", async function () {
      const usdAmount = ethers.parseEther("100"); // $100
      const tokenAmount = usdAmount * ethers.parseEther("1") / BigInt(PRE_SALE_PRICE); // 2500 EYE
      const proof = getMerkleProof(user1.address);

      await ICO.registerFiatPurchase(user1.address, usdAmount, "USD", proof);
      const schedule = await ICO.vestingSchedules(user1.address);
      expect(schedule.totalAmount).to.equal(tokenAmount);
    });

    it("should claim vested tokens", async function () {
      const usdAmount = ethers.parseEther("100"); // $100
      const tokenAmount = usdAmount * ethers.parseEther("1") / BigInt(PRE_SALE_PRICE); // 2500 EYE
      const proof = getMerkleProof(user1.address);

      await ICO.registerFiatPurchase(user1.address, usdAmount, "USD", proof);
      await ethers.provider.send("evm_increaseTime", [900]); // After vesting duration
      await ethers.provider.send("evm_mine", []);

      const balanceBefore = await EYE.balanceOf(user1.address);
      await ICO.connect(user1).claimVestedTokens();
      const balanceAfter = await EYE.balanceOf(user1.address);
      expect(balanceAfter - balanceBefore).to.equal(tokenAmount);
    });
  });

  describe("View Functions", function () {
    it("should get vesting details", async function () {
      const amount = ethers.parseEther("10000");
      // End any active sale first to avoid state conflicts
      try { await ICO.endCurrentPhase(); } catch {}
      
      // Create vesting with valid parameters
      const startTime = (await ethers.provider.getBlock('latest')).timestamp + 60;
      await ICO.createPrivateSeedVesting(
        user1.address,
        amount
      );
      
      const [total, released, releasable, start, end, cliff, type] = await ICO.getVestingDetails(user1.address);
      expect(total).to.equal(amount);
      expect(type).to.equal(1); // PrivateSeed
    });

    it("should get current sale details", async function () {
      // End any active sale first
      try { await ICO.endCurrentPhase(); } catch {}
      
      // Configure and start pre-sale
      await ICO.setWhitelistMerkleRoot(merkleRoot);
      const startTime = (await ethers.provider.getBlock('latest')).timestamp + 60n; // 1 minute from now
      const duration = 7200; // 2 hours duration
      
      // Configure sale phase first
      await ICO.configureSalePhase(
        1, // Pre-sale phase
        ethers.parseEther("0.04"), // Price
        duration,
        ethers.parseEther("50000000"), // Hard cap
        ethers.parseEther("100"), // Min purchase
        ethers.parseEther("10000") // Max purchase
      );
      
      await ICO.startPreSale(startTime, duration);
      
      const [phase, price, start, end, hardCap, sold, remaining] = await ICO.getCurrentSaleDetails();
      expect(phase).to.equal(1);
      expect(price).to.equal(ethers.parseEther("0.04")); // Default pre-sale price
      expect(hardCap).to.equal(ethers.parseEther("40000000")); // 20% of 200M
    });

    it("should check whitelist status", async function () {
      // End any active sale first
      try { await ICO.endCurrentPhase(); } catch {}
      
      await ICO.setWhitelistMerkleRoot(merkleRoot);
      
      // Get the proof for the user
      const proof = merkleTree.getProof(0); // Get proof for the first user
      
      // Convert proof to the format expected by the contract
      const formattedProof = proof.map(p => p.data);
      
      // Check whitelist status
      expect(await ICO.isWhitelisted(user1.address, formattedProof)).to.be.true;
      
      // Check non-whitelisted user
      const nonWhitelistedProof = [];
      expect(await ICO.isWhitelisted(user3.address, nonWhitelistedProof)).to.be.false;
    });
  });

  describe("Edge Cases", function () {
    beforeEach(async function () {
      // End any active sale first
      try { await ICO.endCurrentPhase(); } catch {}
      
      // Configure and start pre-sale
      await ICO.setWhitelistMerkleRoot(merkleRoot);
      const startTime = Math.floor(Date.now() / 1000) - 3600; // Started 1 hour ago
      const duration = 7200; // 2 hours duration
      
      // Configure sale phase first
      await ICO.configureSalePhase(
        1, // Pre-sale phase
        ethers.parseEther("0.04"), // Price
        duration,
        ethers.parseEther("50000000"), // Hard cap
        ethers.parseEther("100"), // Min purchase
        ethers.parseEther("10000") // Max purchase
      );
      
      await ICO.startPreSale(startTime, duration);
    });
    
    it("should revert if purchase below minimum", async function () {
      const polAmount = ethers.parseEther("10"); // ~$5, below $100 min
      const proof = getMerkleProof(user1.address);
      await expect(
        ICO.connect(user1).buyTokensWithPOL(proof, { value: polAmount })
      ).to.be.revertedWith("Purchase below minimum limit");
    });

    it("should revert if exceeds max purchase in pre-sale", async function () {
      const usdAmount = ethers.parseEther("20000"); // $20k, above $10k max
      const proof = getMerkleProof(user1.address);
      await expect(
        ICO.registerFiatPurchase(user1.address, usdAmount, "USD", proof)
      ).to.be.revertedWith("Exceeds max purchase limit");
    });

    it("should revert if not whitelisted in pre-sale", async function () {
      const polAmount = ethers.parseEther("100");
      const proof = []; // Empty proof for non-whitelisted user
      await expect(
        ICO.connect(user3).buyTokensWithPOL(proof, { value: polAmount })
      ).to.be.revertedWith("Not whitelisted for pre-sale");
    });

    it("should revert if sale not active", async function () {
      await ICO.endCurrentPhase();
      const polAmount = ethers.parseEther("100");
      const proof = getMerkleProof(user1.address);
      await expect(
        ICO.connect(user1).buyTokensWithPOL(proof, { value: polAmount })
      ).to.be.revertedWith("Sale not active");
    });
  });
});
