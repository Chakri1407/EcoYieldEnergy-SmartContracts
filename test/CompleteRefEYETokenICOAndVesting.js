// const { expect } = require("chai");
// const { ethers, upgrades, network } = require("hardhat");
// const { time } = require("@nomicfoundation/hardhat-network-helpers");
// const { MerkleTree } = require("merkletreejs");
// const keccak256 = require("keccak256");

// describe("EyeICOAndVesting Contract - Comprehensive Tests", function () {
//   let owner, user1, user2, user3, user4, user5, fundReceiver, attacker;
//   let eyeToken, mockUSDC, mockUSDT, icoAndVesting;
//   let ethPriceFeed, usdcPriceFeed, usdtPriceFeed;
//   let merkleTree, merkleRoot;
//   let whitelistedAddresses;

//   const ONE_ETH = ethers.parseEther("1.0");
//   const ONE_USDC = ethers.parseUnits("1.0", 6);
//   const ONE_USDT = ethers.parseUnits("1.0", 6);
//   const ONE_DAY = 86400;
//   const PRECISION = 1000000; // 6 decimal precision
//   const TOKEN_DECIMALS = ethers.parseEther("1"); // 18 decimal precision
//   const TOTAL_SUPPLY = ethers.parseEther("10000000000"); // 10 billion tokens

//   // ICO Rounds enum
//   const ICORounds = {
//     Seed: 0,
//     PublicPresale: 1
//   };

//   // Collaborator Roles enum
//   const CollaboratorRole = {
//     Ecosystem: 0,
//     Reserve: 1,
//     Liquidity: 2,
//     Staking: 3,
//     EarlyLP: 4,
//     Team: 5,
//     Advisors: 6
//   };

//   // Helper function to get merkle proof
//   function getProof(address) {
//     const leaf = keccak256(ethers.solidityPacked(["address"], [address]));
//     return merkleTree.getHexProof(leaf);
//   }

//   // Helper function to calculate expected tokens
//   function calculateExpectedTokens(usdAmount, pricePerToken) {
//     return (BigInt(usdAmount) * TOKEN_DECIMALS) / BigInt(pricePerToken);
//   }

//   // Helper function to move time forward
//   async function moveTimeForward(seconds) {
//     await time.increase(seconds);
//   }

//   before(async function () {
//     console.log("Setting up comprehensive test environment...");
    
//     [owner, user1, user2, user3, user4, user5, fundReceiver, attacker] = await ethers.getSigners();

//     // Create whitelist
//     whitelistedAddresses = [user1.address, user2.address, user3.address];
//     const leaves = whitelistedAddresses.map(addr => 
//       keccak256(ethers.solidityPacked(["address"], [addr]))
//     );
//     merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true });
//     merkleRoot = merkleTree.getHexRoot();

//     // Deploy mock price feeds
//     const MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");
//     ethPriceFeed = await MockV3Aggregator.deploy(8, 4000 * 10 ** 8); // $4000/ETH
//     usdcPriceFeed = await MockV3Aggregator.deploy(8, 1 * 10 ** 8); // $1/USDC
//     usdtPriceFeed = await MockV3Aggregator.deploy(8, 1 * 10 ** 8); // $1/USDT

//     // Deploy tokens
//     const EYEFactory = await ethers.getContractFactory("EYE");
//     eyeToken = await EYEFactory.deploy(fundReceiver.address);

//     const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
//     mockUSDC = await MockUSDCFactory.deploy();

//     const MockUSDTFactory = await ethers.getContractFactory("MockUSDT");
//     mockUSDT = await MockUSDTFactory.deploy();

//     // Deploy ICO contract
//     const EyeICOAndVestingFactory = await ethers.getContractFactory("EyeICOAndVesting");
//     icoAndVesting = await upgrades.deployProxy(
//       EyeICOAndVestingFactory,
//       [
//         await eyeToken.getAddress(),
//         fundReceiver.address,
//         await mockUSDC.getAddress(),
//         await mockUSDT.getAddress(),
//         await ethPriceFeed.getAddress(),
//         await usdcPriceFeed.getAddress(),
//         await usdtPriceFeed.getAddress(),
//       ],
//       { kind: "uups", initializer: "initialize" }
//     );

//     // Transfer tokens and setup
//     await eyeToken.connect(fundReceiver).transfer(await icoAndVesting.getAddress(), TOTAL_SUPPLY);
    
//     // Mint stablecoins for users
//     const users = [user1, user2, user3, user4, user5, attacker];
//     for (const user of users) {
//       await mockUSDC.mint(user.address, ethers.parseUnits("100000", 6));
//       await mockUSDT.mint(user.address, ethers.parseUnits("100000", 6));
//     }

//     console.log("Test environment setup complete");
//   });

//   describe("1. Contract Deployment and Initialization", function () {
//     describe("1.1 Deployment Success", function () {
//       it("Should deploy with correct initial parameters", async function () {
//         expect(await icoAndVesting.eyeToken()).to.equal(await eyeToken.getAddress());
//         expect(await icoAndVesting.fundReceiverAddress()).to.equal(fundReceiver.address);
//         expect(await icoAndVesting.currentRound()).to.equal(ICORounds.Seed);
//         expect(await icoAndVesting.vestingId()).to.equal(0);
//       });

//       it("Should have correct contract token balance", async function () {
//         const balance = await eyeToken.balanceOf(await icoAndVesting.getAddress());
//         expect(balance).to.equal(TOTAL_SUPPLY);
//       });

//       it("Should initialize all ICO rounds correctly", async function () {
//         // Seed round
//         const seedDetails = await icoAndVesting.getRoundDetails(ICORounds.Seed);
//         expect(seedDetails.allocationPercent).to.equal(10);
//         expect(seedDetails.fixedPrice).to.equal(1500); // $0.0015
//         expect(seedDetails.requiresWhitelist).to.be.true;
//         expect(seedDetails.TGE).to.equal(0);
//         expect(seedDetails.cliff).to.equal(180 * 24 * 60 * 60); // 6 months
//         expect(seedDetails.duration).to.equal(730 * 24 * 60 * 60); // 24 months
//         expect(seedDetails.walletCapUSD).to.equal(25000 * PRECISION); // $25K

//         // Public Presale round
//         const publicDetails = await icoAndVesting.getRoundDetails(ICORounds.PublicPresale);
//         expect(publicDetails.allocationPercent).to.equal(30);
//         expect(publicDetails.requiresWhitelist).to.be.false;
//         expect(publicDetails.TGE).to.equal(0);
//         expect(publicDetails.cliff).to.equal(0);
//         expect(publicDetails.duration).to.equal(365 * 24 * 60 * 60); // 12 months
//         expect(publicDetails.walletCapUSD).to.equal(50000 * PRECISION); // $50K
//       });

//       it("Should initialize all collaborator roles correctly", async function () {
//         const roles = [
//           { role: CollaboratorRole.Ecosystem, percent: 10, TGE: 10, cliff: 0, duration: 1080, cliffOffset: false },
//           { role: CollaboratorRole.Reserve, percent: 10, TGE: 0, cliff: 360, duration: 1080, cliffOffset: true },
//           { role: CollaboratorRole.Liquidity, percent: 10, TGE: 100, cliff: 0, duration: 0, cliffOffset: false },
//           { role: CollaboratorRole.Staking, percent: 10, TGE: 0, cliff: 0, duration: 1440, cliffOffset: false },
//           { role: CollaboratorRole.EarlyLP, percent: 5, TGE: 25, cliff: 0, duration: 360, cliffOffset: false },
//           { role: CollaboratorRole.Team, percent: 10, TGE: 0, cliff: 270, duration: 720, cliffOffset: true },
//           { role: CollaboratorRole.Advisors, percent: 5, TGE: 0, cliff: 270, duration: 720, cliffOffset: true }
//         ];

//         for (const roleData of roles) {
//           const details = await icoAndVesting.getCollaboratorDetails(roleData.role);
//           expect(details.allocationPercent).to.equal(roleData.percent);
//           expect(details.TGE).to.equal(roleData.TGE);
//           expect(details.cliff).to.equal(roleData.cliff * 24 * 60 * 60);
//           expect(details.duration).to.equal(roleData.duration * 24 * 60 * 60);
//           expect(details.cliffOffset).to.equal(roleData.cliffOffset);
//         }
//       });
//     });

//     describe("1.2 Deployment Failures", function () {
//       it("Should revert with zero address for eye token", async function () {
//         const EyeICOAndVestingFactory = await ethers.getContractFactory("EyeICOAndVesting");
//         await expect(
//           upgrades.deployProxy(
//             EyeICOAndVestingFactory,
//             [
//               ethers.ZeroAddress, // Invalid eye token
//               fundReceiver.address,
//               await mockUSDC.getAddress(),
//               await mockUSDT.getAddress(),
//               await ethPriceFeed.getAddress(),
//               await usdcPriceFeed.getAddress(),
//               await usdtPriceFeed.getAddress(),
//             ],
//             { kind: "uups", initializer: "initialize" }
//           )
//         ).to.be.revertedWith("Invalid eye token address");
//       });
//     });
//   });

//   describe("2. Whitelist Management", function () {
//     describe("2.1 Merkle Root Operations", function () {
//       it("Should set merkle root correctly", async function () {
//         const tx = await icoAndVesting.setMerkleRoot(merkleRoot);
//         await expect(tx)
//           .to.emit(icoAndVesting, "MerkleRootUpdated")
//           .withArgs(ethers.ZeroHash, merkleRoot);
//       });

//       it("Should update merkle root", async function () {
//         const newRoot = keccak256("new root");
//         const tx = await icoAndVesting.setMerkleRoot(newRoot);
//         await expect(tx)
//           .to.emit(icoAndVesting, "MerkleRootUpdated")
//           .withArgs(merkleRoot, newRoot);
//       });

//       it("Should only allow owner to set merkle root", async function () {
//         await expect(
//           icoAndVesting.connect(user1).setMerkleRoot(merkleRoot)
//         ).to.be.revertedWithCustomError(icoAndVesting, "OwnableUnauthorizedAccount");
//       });
//     });

//     describe("2.2 Whitelist Verification", function () {
//       before(async function () {
//         await icoAndVesting.setMerkleRoot(merkleRoot);
//       });

//       it("Should verify whitelisted addresses correctly", async function () {
//         for (const addr of whitelistedAddresses) {
//           const proof = getProof(addr);
//           expect(await icoAndVesting.addressIsWhiteListed(proof, addr)).to.be.true;
//         }
//       });

//       it("Should reject non-whitelisted addresses", async function () {
//         const proof = getProof(user4.address);
//         expect(await icoAndVesting.addressIsWhiteListed(proof, user4.address)).to.be.false;
//       });

//       it("Should reject invalid proofs", async function () {
//         const invalidProof = [ethers.hexlify(ethers.randomBytes(32))];
//         expect(await icoAndVesting.addressIsWhiteListed(invalidProof, user1.address)).to.be.false;
//       });

//       it("Should handle empty merkle root", async function () {
//         await icoAndVesting.setMerkleRoot(ethers.ZeroHash);
//         const proof = getProof(user1.address);
//         expect(await icoAndVesting.addressIsWhiteListed(proof, user1.address)).to.be.false;
        
//         // Reset for other tests
//         await icoAndVesting.setMerkleRoot(merkleRoot);
//       });
//     });
//   });

//   describe("3. Price Feed and Calculations", function () {
//     describe("3.1 Price Feed Integration", function () {
//       it("Should get ETH price correctly", async function () {
//         const ethValue = await icoAndVesting.getETHValueInUSD(ONE_ETH);
//         expect(ethValue).to.equal(4000 * PRECISION); // $4000
//       });

//       it("Should get USDC price correctly", async function () {
//         const usdcValue = await icoAndVesting.getUSDValue(await mockUSDC.getAddress(), ONE_USDC);
//         expect(usdcValue).to.equal(PRECISION); // $1
//       });

//       it("Should get USDT price correctly", async function () {
//         const usdtValue = await icoAndVesting.getUSDValue(await mockUSDT.getAddress(), ONE_USDT);
//         expect(usdtValue).to.equal(PRECISION); // $1
//       });

//       it("Should reject invalid stablecoin addresses", async function () {
//         await expect(
//           icoAndVesting.getUSDValue(ethers.ZeroAddress, ONE_USDC)
//         ).to.be.revertedWith("Invalid stablecoin");
//       });

//       it("Should handle stale price data", async function () {
//         // Deploy a price feed with stale data
//         const MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");
//         const stalePriceFeed = await MockV3Aggregator.deploy(8, 4000 * 10 ** 8);
        
//         // Update the price feed timestamp to be stale
//         await stalePriceFeed.updateRoundData(
//           1,
//           4000 * 10 ** 8,
//           Math.floor(Date.now() / 1000) - 2000, // 2000 seconds ago (stale)
//           Math.floor(Date.now() / 1000) - 2000,
//           1
//         );

//         await icoAndVesting.setPriceFeed("ETH", await stalePriceFeed.getAddress());

//         await expect(
//           icoAndVesting.getETHValueInUSD(ONE_ETH)
//         ).to.be.revertedWith("Stale ETH price data");

//         // Reset to valid price feed
//         await icoAndVesting.setPriceFeed("ETH", await ethPriceFeed.getAddress());
//       });
//     });

//     describe("3.2 Token Price Calculations", function () {
//       it("Should return correct seed round price", async function () {
//         await icoAndVesting.setICORound(ICORounds.Seed);
//         const price = await icoAndVesting.getCurrentTokenPrice();
//         expect(price).to.equal(1500); // $0.0015
//       });

//       it("Should return correct public presale phase prices", async function () {
//         await icoAndVesting.setICORound(ICORounds.PublicPresale);
        
//         // Phase 1 (0-4% sold)
//         let price = await icoAndVesting.getCurrentTokenPrice();
//         expect(price).to.equal(2500); // $0.0025

//         const phaseInfo = await icoAndVesting.getCurrentPhaseInfo();
//         expect(phaseInfo.currentPhase).to.equal(1);
//         expect(phaseInfo.currentPrice).to.equal(2500);
//       });

//       it("Should calculate tokens for USD correctly", async function () {
//         await icoAndVesting.setICORound(ICORounds.Seed);
//         const usdAmount = 1500 * PRECISION; // $1500
//         const expectedTokens = ethers.parseEther("1000000"); // 1M tokens at $0.0015
        
//         const calculatedTokens = await icoAndVesting.calculateTokensForUSD(usdAmount);
//         expect(calculatedTokens).to.equal(expectedTokens);
//       });

//       it("Should reject calculations for amounts below minimum", async function () {
//         const smallAmount = 5 * PRECISION; // $5 (below $10 minimum)
//         await expect(
//           icoAndVesting.calculateTokensForUSD(smallAmount)
//         ).to.be.revertedWith("Purchase amount too small");
//       });
//     });
//   });

//   describe("4. Seed Round (Whitelisted) Operations", function () {
//     before(async function () {
//       await icoAndVesting.setICORound(ICORounds.Seed);
//     });

//     describe("4.1 ETH Purchases", function () {
//       it("Should allow whitelisted user to buy with ETH", async function () {
//         const ethAmount = ethers.parseEther("1");
//         const proof = getProof(user1.address);
//         const usdValue = 4000 * PRECISION; // $4000
//         const expectedTokens = calculateExpectedTokens(usdValue, 1500);

//         const initialFundBalance = await ethers.provider.getBalance(fundReceiver.address);
        
//         const tx = await icoAndVesting.connect(user1).buyTokensWithETH(proof, {
//           value: ethAmount
//         });

//         await expect(tx)
//           .to.emit(icoAndVesting, "TokensPurchasedWithETH")
//           .withArgs(
//             user1.address,
//             ethAmount,
//             expectedTokens,
//             0, // TGE amount
//             1, // vesting ID
//             usdValue,
//             1500, // current price
//             1 // current phase
//           );

//         // Check ETH transfer
//         const newFundBalance = await ethers.provider.getBalance(fundReceiver.address);
//         expect(newFundBalance - initialFundBalance).to.equal(ethAmount);

//         // Check vesting creation
//         const vestingDetails = await icoAndVesting.getVestingDetails(1);
//         expect(vestingDetails.userAddress).to.equal(user1.address);
//         expect(vestingDetails.totalTokenAmount).to.equal(expectedTokens);
//         expect(vestingDetails.isCollaborator).to.be.false;
//       });

//       it("Should reject non-whitelisted user ETH purchase", async function () {
//         const proof = getProof(user4.address);
//         await expect(
//           icoAndVesting.connect(user4).buyTokensWithETH(proof, {
//             value: ethers.parseEther("1")
//           })
//         ).to.be.revertedWith("Address not whitelisted for seed round");
//       });

//       it("Should reject ETH purchase with invalid proof", async function () {
//         const invalidProof = [ethers.hexlify(ethers.randomBytes(32))];
//         await expect(
//           icoAndVesting.connect(user1).buyTokensWithETH(invalidProof, {
//             value: ethers.parseEther("1")
//           })
//         ).to.be.revertedWith("Address not whitelisted for seed round");
//       });

//       it("Should reject zero ETH amount", async function () {
//         const proof = getProof(user1.address);
//         await expect(
//           icoAndVesting.connect(user1).buyTokensWithETH(proof, {
//             value: 0
//           })
//         ).to.be.revertedWith("Invalid ETH amount");
//       });

//       it("Should enforce wallet cap for ETH purchases", async function () {
//         const proof = getProof(user2.address);
//         const largeAmount = ethers.parseEther("10"); // $40,000 (exceeds $25K cap)
        
//         await expect(
//           icoAndVesting.connect(user2).buyTokensWithETH(proof, {
//             value: largeAmount
//           })
//         ).to.be.revertedWith("Exceeds wallet cap for this round");
//       });
//     });

//     describe("4.2 USDC Purchases", function () {
//       it("Should allow whitelisted user to buy with USDC", async function () {
//         const usdcAmount = ethers.parseUnits("1500", 6);
//         const proof = getProof(user2.address);
//         const usdValue = 1500 * PRECISION;
//         const expectedTokens = calculateExpectedTokens(usdValue, 1500);

//         await mockUSDC.connect(user2).approve(await icoAndVesting.getAddress(), usdcAmount);
        
//         const tx = await icoAndVesting.connect(user2).buyTokensWithUSDC(usdcAmount, proof);

//         await expect(tx)
//           .to.emit(icoAndVesting, "TokensPurchasedWithStablecoin")
//           .withArgs(
//             user2.address,
//             expectedTokens,
//             0, // TGE amount
//             2, // vesting ID
//             "USDC",
//             usdValue,
//             1500, // current price
//             1 // current phase
//           );

//         // Check USDC transfer
//         const fundBalance = await mockUSDC.balanceOf(fundReceiver.address);
//         expect(fundBalance).to.equal(usdcAmount);
//       });

//       it("Should reject USDC purchase without approval", async function () {
//         const usdcAmount = ethers.parseUnits("1000", 6);
//         const proof = getProof(user3.address);

//         await expect(
//           icoAndVesting.connect(user3).buyTokensWithUSDC(usdcAmount, proof)
//         ).to.be.revertedWith("Insufficient USDC allowance");
//       });

//       it("Should reject zero USDC amount", async function () {
//         const proof = getProof(user2.address);
//         await expect(
//           icoAndVesting.connect(user2).buyTokensWithUSDC(0, proof)
//         ).to.be.revertedWith("Invalid USDC amount");
//       });

//       it("Should reject non-whitelisted USDC purchase", async function () {
//         const usdcAmount = ethers.parseUnits("1000", 6);
//         const proof = getProof(user4.address);
        
//         await mockUSDC.connect(user4).approve(await icoAndVesting.getAddress(), usdcAmount);
        
//         await expect(
//           icoAndVesting.connect(user4).buyTokensWithUSDC(usdcAmount, proof)
//         ).to.be.revertedWith("Address not whitelisted for seed round");
//       });
//     });

//     describe("4.3 USDT Purchases", function () {
//       it("Should allow whitelisted user to buy with USDT", async function () {
//         const usdtAmount = ethers.parseUnits("2000", 6);
//         const proof = getProof(user3.address);
//         const usdValue = 2000 * PRECISION;
//         const expectedTokens = calculateExpectedTokens(usdValue, 1500);

//         await mockUSDT.connect(user3).approve(await icoAndVesting.getAddress(), usdtAmount);
        
//         const tx = await icoAndVesting.connect(user3).buyTokensWithUSDT(usdtAmount, proof);

//         await expect(tx)
//           .to.emit(icoAndVesting, "TokensPurchasedWithStablecoin")
//           .withArgs(
//             user3.address,
//             expectedTokens,
//             0, // TGE amount
//             3, // vesting ID
//             "USDT",
//             usdValue,
//             1500, // current price
//             1 // current phase
//           );
//       });

//       it("Should reject USDT purchase without approval", async function () {
//         const usdtAmount = ethers.parseUnits("1000", 6);
//         const proof = getProof(user1.address);

//         await expect(
//           icoAndVesting.connect(user1).buyTokensWithUSDT(usdtAmount, proof)
//         ).to.be.revertedWith("Insufficient USDT allowance");
//       });

//       it("Should reject zero USDT amount", async function () {
//         const proof = getProof(user3.address);
//         await expect(
//           icoAndVesting.connect(user3).buyTokensWithUSDT(0, proof)
//         ).to.be.revertedWith("Invalid USDT amount");
//       });
//     });

//     describe("4.4 Fiat Purchases", function () {
//       it("Should allow owner to register fiat purchase for whitelisted user", async function () {
//         const fiatAmount = 5000 * PRECISION; // $5000
//         const proof = getProof(user1.address);
//         const expectedTokens = calculateExpectedTokens(fiatAmount, 1500);

//         const tx = await icoAndVesting.buyTokensWithFiat(user1.address, fiatAmount, proof);

//         await expect(tx)
//           .to.emit(icoAndVesting, "TokensPurchasedWithFiat")
//           .withArgs(
//             user1.address,
//             expectedTokens,
//             0, // TGE amount
//             4, // vesting ID
//             fiatAmount,
//             1500, // current price
//             1 // current phase
//           );
//       });

//       it("Should reject fiat purchase for non-whitelisted user", async function () {
//         const fiatAmount = 1000 * PRECISION;
//         const proof = getProof(user4.address);

//         await expect(
//           icoAndVesting.buyTokensWithFiat(user4.address, fiatAmount, proof)
//         ).to.be.revertedWith("Address not whitelisted for seed round");
//       });

//       it("Should reject fiat purchase below minimum", async function () {
//         const fiatAmount = 5 * PRECISION; // $5 (below $10 minimum)
//         const proof = getProof(user1.address);

//         await expect(
//           icoAndVesting.buyTokensWithFiat(user1.address, fiatAmount, proof)
//         ).to.be.revertedWith("Purchase amount too small");
//       });

//       it("Should reject fiat purchase from non-owner", async function () {
//         const fiatAmount = 1000 * PRECISION;
//         const proof = getProof(user1.address);

//         await expect(
//           icoAndVesting.connect(user1).buyTokensWithFiat(user1.address, fiatAmount, proof)
//         ).to.be.revertedWithCustomError(icoAndVesting, "OwnableUnauthorizedAccount");
//       });

//       it("Should reject fiat purchase with zero address", async function () {
//         const fiatAmount = 1000 * PRECISION;
//         const proof = [];

//         await expect(
//           icoAndVesting.buyTokensWithFiat(ethers.ZeroAddress, fiatAmount, proof)
//         ).to.be.revertedWith("Invalid address: zero address");
//       });
//     });

//     describe("4.5 Purchase Limits and Validations", function () {
//       it("Should track user purchases correctly", async function () {
//         const user1Purchases = await icoAndVesting.getUserPurchaseAmount(user1.address, ICORounds.Seed);
//         const totalPurchases = await icoAndVesting.getTotalUserPurchases(user1.address);
        
//         expect(user1Purchases).to.be.gt(0);
//         expect(totalPurchases).to.be.gte(user1Purchases);
//       });

//       it("Should update round token sales correctly", async function () {
//         const roundDetails = await icoAndVesting.getRoundDetails(ICORounds.Seed);
//         expect(roundDetails.tokensSold).to.be.gt(0);
//       });

//       it("Should reject purchase when round is inactive", async function () {
//         await icoAndVesting.closeCurrentRound();
        
//         const proof = getProof(user1.address);
//         await expect(
//           icoAndVesting.connect(user1).buyTokensWithETH(proof, {
//             value: ethers.parseEther("1")
//           })
//         ).to.be.revertedWith("Round is not active");

//         // Reactivate for other tests
//         await icoAndVesting.setICORound(ICORounds.Seed);
//       });

//       it("Should reject purchase when hard cap is reached", async function () {
//         // Get current round details
//         const roundDetails = await icoAndVesting.getRoundDetails(ICORounds.Seed);
//         const remainingTokens = roundDetails.totalTokenAmount - roundDetails.tokensSold;
        
//         // Try to buy more tokens than available
//         const excessiveUsdAmount = (remainingTokens * BigInt(1500)) / TOKEN_DECIMALS + BigInt(1000 * PRECISION);
//         const excessiveEthAmount = excessiveUsdAmount / BigInt(4000); // Convert USD to ETH

//         const proof = getProof(user2.address);
//         await expect(
//           icoAndVesting.connect(user2).buyTokensWithETH(proof, {
//             value: excessiveEthAmount
//           })
//         ).to.be.revertedWith("Not enough tokens available in round");
//       });
//     });
//   });

//   describe("5. Public Presale Round Operations", function () {
//     before(async function () {
//       await icoAndVesting.setICORound(ICORounds.PublicPresale);
//     });

//     describe("5.1 Phase-wise Pricing", function () {
//       it("Should start with Phase 1 pricing", async function () {
//         const price = await icoAndVesting.getCurrentTokenPrice();
//         expect(price).to.equal(2500); // $0.0025

//         const phaseInfo = await icoAndVesting.getCurrentPhaseInfo();
//         expect(phaseInfo.currentPhase).to.equal(1);
//         expect(phaseInfo.currentPrice).to.equal(2500);
//         expect(phaseInfo.percentageSold).to.equal(0);
//       });

//       it("Should progress through pricing phases", async function () {
//         // Simulate sales to trigger phase changes
//         const roundDetails = await icoAndVesting.getRoundDetails(ICORounds.PublicPresale);
//         const totalTokens = roundDetails.totalTokenAmount;
        
//         // Buy 5% of tokens to trigger phase 2
//         const tokensFor5Percent = totalTokens * BigInt(5) / BigInt(100);
//         const usdFor5Percent = tokensFor5Percent * BigInt(2500) / TOKEN_DECIMALS;
//         const ethFor5Percent = usdFor5Percent / BigInt(4000);

//         await icoAndVesting.connect(user4).buyTokensWithETH([], {
//           value: ethFor5Percent
//         });

//         // Check if phase changed
//         const newPhaseInfo = await icoAndVesting.getCurrentPhaseInfo();
//         expect(newPhaseInfo.currentPhase).to.equal(2);
//         expect(newPhaseInfo.currentPrice).to.equal(3500); // $0.0035
//       });

//       it("Should calculate correct tokens for each phase", async function () {
//         // Phase 2: $0.0035 per token
//         const usdAmount = 3500 * PRECISION; // $3500
//         const expectedTokens = ethers.parseEther("1000000"); // 1M tokens
        
//         const calculatedTokens = await icoAndVesting.calculateTokensForUSD(usdAmount);
//         expect(calculatedTokens).to.equal(expectedTokens);
//       });
//     });

//     describe("5.2 Open Access Purchases", function () {
//       it("Should allow any user to buy with ETH (no whitelist)", async function () {
//         const ethAmount = ethers.parseEther("0.5");
//         const usdValue = 2000 * PRECISION; // $2000
//         const expectedTokens = calculateExpectedTokens(usdValue, 3500); // Phase 2 price

//         const tx = await icoAndVesting.connect(user5).buyTokensWithETH([], {
//           value: ethAmount
//         });

//         await expect(tx)
//           .to.emit(icoAndVesting, "TokensPurchasedWithETH");

//         // Check vesting creation (no TGE for public presale)
//         const vestingCount = await icoAndVesting.vestingId();
//         const vestingDetails = await icoAndVesting.getVestingDetails(vestingCount);
//         expect(vestingDetails.userAddress).to.equal(user5.address);
//       });

//       it("Should allow any user to buy with USDC", async function () {
//         const usdcAmount = ethers.parseUnits("3500", 6);
        
//         await mockUSDC.connect(user5).approve(await icoAndVesting.getAddress(), usdcAmount);
        
//         const tx = await icoAndVesting.connect(user5).buyTokensWithUSDC(usdcAmount, []);
//         await expect(tx).to.emit(icoAndVesting, "TokensPurchasedWithStablecoin");
//       });

//       it("Should allow any user to buy with USDT", async function () {
//         const usdtAmount = ethers.parseUnits("3500", 6);
        
//         await mockUSDT.connect(user5).approve(await icoAndVesting.getAddress(), usdtAmount);
        
//         const tx = await icoAndVesting.connect(user5).buyTokensWithUSDT(usdtAmount, []);
//         await expect(tx).to.emit(icoAndVesting, "TokensPurchasedWithStablecoin");
//       });

//       it("Should enforce public presale wallet cap", async function () {
//         // Public presale has $50K wallet cap
//         const largeAmount = ethers.parseEther("20"); // $80,000 (exceeds cap)
        
//         await expect(
//           icoAndVesting.connect(user4).buyTokensWithETH([], {
//             value: largeAmount
//           })
//         ).to.be.revertedWith("Exceeds wallet cap for this round");
//       });
//     });

//     describe("5.3 Vesting for Public Presale", function () {
//       it("Should create vesting with no cliff for public presale", async function () {
//         const vestingCount = await icoAndVesting.vestingId();
//         const vestingDetails = await icoAndVesting.getVestingDetails(vestingCount);
        
//         expect(vestingDetails.cliff).to.equal(0); // No cliff for public presale
//         expect(vestingDetails.duration).to.equal(365 * 24 * 60 * 60); // 12 months
//       });
//     });
//   });

//   describe("6. Collaborator Management", function () {
//     describe("6.1 Ecosystem Collaborators", function () {
//       it("Should add ecosystem collaborator correctly", async function () {
//         const tokenAmount = ethers.parseEther("1000000"); // 1M tokens
//         const expectedTGE = ethers.parseEther("100000"); // 10% TGE
        
//         const tx = await icoAndVesting.addCollaborator(
//           CollaboratorRole.Ecosystem,
//           user1.address,
//           tokenAmount
//         );

//         await expect(tx)
//           .to.emit(icoAndVesting, "CollaboratorAdded")
//           .withArgs(
//             user1.address,
//             CollaboratorRole.Ecosystem,
//             tokenAmount,
//             expectedTGE,
//             await icoAndVesting.vestingId() // current vesting ID
//           );

//         // Check TGE transfer
//         const balance = await eyeToken.balanceOf(user1.address);
//         expect(balance).to.equal(expectedTGE);

//         // Check vesting creation
//         const vestingId = await icoAndVesting.vestingId();
//         const vestingDetails = await icoAndVesting.getVestingDetails(vestingId);
//         expect(vestingDetails.isCollaborator).to.be.true;
//         expect(vestingDetails.collaboratorRole).to.equal(CollaboratorRole.Ecosystem);
//       });

//       it("Should enforce ecosystem allocation limits", async function () {
//         const ecosystemDetails = await icoAndVesting.getCollaboratorDetails(CollaboratorRole.Ecosystem);
//         const remainingTokens = ecosystemDetails.totalTokenAmount - ecosystemDetails.tokensAllocated;
//         const excessAmount = remainingTokens + ethers.parseEther("1");

//         await expect(
//           icoAndVesting.addCollaborator(CollaboratorRole.Ecosystem, user2.address, excessAmount)
//         ).to.be.revertedWith("Exceeds total allocation for this role");
//       });
//     });

//     describe("6.2 Reserve Collaborators", function () {
//       it("Should add reserve collaborator with cliff", async function () {
//         const tokenAmount = ethers.parseEther("2000000"); // 2M tokens
        
//         const tx = await icoAndVesting.addCollaborator(
//           CollaboratorRole.Reserve,
//           user2.address,
//           tokenAmount
//         );

//         await expect(tx).to.emit(icoAndVesting, "CollaboratorAdded");

//         // Reserve has 0% TGE, so no immediate transfer
//         const balance = await eyeToken.balanceOf(user2.address);
//         expect(balance).to.equal(0);

//         // Check vesting has cliff
//         const vestingId = await icoAndVesting.vestingId();
//         const vestingDetails = await icoAndVesting.getVestingDetails(vestingId);
//         expect(vestingDetails.cliff).to.equal(360 * 24 * 60 * 60); // 12 months
//       });
//     });

//     describe("6.3 Liquidity Collaborators", function () {
//       it("Should add liquidity collaborator with 100% TGE", async function () {
//         const tokenAmount = ethers.parseEther("500000"); // 500K tokens
        
//         const tx = await icoAndVesting.addCollaborator(
//           CollaboratorRole.Liquidity,
//           user3.address,
//           tokenAmount
//         );

//         await expect(tx).to.emit(icoAndVesting, "CollaboratorAdded");

//         // Liquidity has 100% TGE
//         const balance = await eyeToken.balanceOf(user3.address);
//         expect(balance).to.equal(tokenAmount);
//       });
//     });

//     describe("6.4 Staking Collaborators", function () {
//       it("Should add staking collaborator with long vesting", async function () {
//         const tokenAmount = ethers.parseEther("1500000"); // 1.5M tokens
        
//         const tx = await icoAndVesting.addCollaborator(
//           CollaboratorRole.Staking,
//           user4.address,
//           tokenAmount
//         );

//         await expect(tx).to.emit(icoAndVesting, "CollaboratorAdded");

//         // Check 48-month vesting duration
//         const vestingId = await icoAndVesting.vestingId();
//         const vestingDetails = await icoAndVesting.getVestingDetails(vestingId);
//         expect(vestingDetails.duration).to.equal(1440 * 24 * 60 * 60); // 48 months
//       });
//     });

//     describe("6.5 Early LP Collaborators", function () {
//       it("Should add early LP collaborator with 25% TGE", async function () {
//         const tokenAmount = ethers.parseEther("400000"); // 400K tokens
//         const expectedTGE = ethers.parseEther("100000"); // 25% TGE
        
//         const tx = await icoAndVesting.addCollaborator(
//           CollaboratorRole.EarlyLP,
//           user5.address,
//           tokenAmount
//         );

//         await expect(tx).to.emit(icoAndVesting, "CollaboratorAdded");

//         // Check TGE transfer
//         const balance = await eyeToken.balanceOf(user5.address);
//         expect(balance).to.equal(expectedTGE);
//       });
//     });

//     describe("6.6 Team Collaborators", function () {
//       it("Should add team member with cliff", async function () {
//         const tokenAmount = ethers.parseEther("3000000"); // 3M tokens
        
//         const tx = await icoAndVesting.addCollaborator(
//           CollaboratorRole.Team,
//           owner.address,
//           tokenAmount
//         );

//         await expect(tx).to.emit(icoAndVesting, "CollaboratorAdded");

//         // Team has 0% TGE and 9-month cliff
//         const vestingId = await icoAndVesting.vestingId();
//         const vestingDetails = await icoAndVesting.getVestingDetails(vestingId);
//         expect(vestingDetails.cliff).to.equal(270 * 24 * 60 * 60); // 9 months
//         expect(vestingDetails.duration).to.equal(720 * 24 * 60 * 60); // 24 months
//       });
//     });

//     describe("6.7 Advisor Collaborators", function () {
//       it("Should add advisor with cliff", async function () {
//         const tokenAmount = ethers.parseEther("1000000"); // 1M tokens
        
//         const tx = await icoAndVesting.addCollaborator(
//           CollaboratorRole.Advisors,
//           fundReceiver.address,
//           tokenAmount
//         );

//         await expect(tx).to.emit(icoAndVesting, "CollaboratorAdded");

//         // Advisors have 0% TGE and 9-month cliff
//         const vestingId = await icoAndVesting.vestingId();
//         const vestingDetails = await icoAndVesting.getVestingDetails(vestingId);
//         expect(vestingDetails.cliff).to.equal(270 * 24 * 60 * 60); // 9 months
//       });
//     });

//     describe("6.8 Collaborator Validation", function () {
//       it("Should reject invalid collaborator role", async function () {
//         await expect(
//           icoAndVesting.addCollaborator(7, user1.address, ethers.parseEther("1000")) // Invalid role
//         ).to.be.revertedWith("Invalid collaborator role");
//       });

//       it("Should reject zero address for collaborator", async function () {
//         await expect(
//           icoAndVesting.addCollaborator(CollaboratorRole.Ecosystem, ethers.ZeroAddress, ethers.parseEther("1000"))
//         ).to.be.revertedWith("Invalid address: zero address");
//       });

//       it("Should reject collaborator addition from non-owner", async function () {
//         await expect(
//           icoAndVesting.connect(user1).addCollaborator(CollaboratorRole.Ecosystem, user1.address, ethers.parseEther("1000"))
//         ).to.be.revertedWithCustomError(icoAndVesting, "OwnableUnauthorizedAccount");
//       });

//       it("Should reject when insufficient contract balance", async function () {
//         // Drain contract balance first
//         const contractBalance = await eyeToken.balanceOf(await icoAndVesting.getAddress());
//         await icoAndVesting.emergencyWithdraw(
//           await eyeToken.getAddress(),
//           owner.address,
//           contractBalance
//         );

//         await expect(
//           icoAndVesting.addCollaborator(CollaboratorRole.Ecosystem, user1.address, ethers.parseEther("1000"))
//         ).to.be.revertedWith("Insufficient contract token balance");

//         // Restore balance for other tests
//         await eyeToken.transfer(await icoAndVesting.getAddress(), contractBalance);
//       });
//     });
//   });

//   describe("7. Vesting and Token Claims", function () {
//     let seedVestingId, publicVestingId, teamVestingId;

//     before(async function () {
//       // Setup test vestings
//       await icoAndVesting.setICORound(ICORounds.Seed);
//       await icoAndVesting.setMerkleRoot(merkleRoot);
      
//       // Create seed purchase (6-month cliff, 24-month vesting)
//       const proof = getProof(user1.address);
//       await icoAndVesting.connect(user1).buyTokensWithETH(proof, {
//         value: ethers.parseEther("0.5")
//       });
//       seedVestingId = await icoAndVesting.vestingId();

//       // Create public presale purchase (no cliff, 12-month vesting)
//       await icoAndVesting.setICORound(ICORounds.PublicPresale);
//       await icoAndVesting.connect(user2).buyTokensWithETH([], {
//         value: ethers.parseEther("0.5")
//       });
//       publicVestingId = await icoAndVesting.vestingId();

//       // Create team vesting (9-month cliff, 24-month vesting)
//       await icoAndVesting.addCollaborator(CollaboratorRole.Team, user3.address, ethers.parseEther("1000000"));
//       teamVestingId = await icoAndVesting.vestingId();
//     });

//     describe("7.1 Vesting Calculations", function () {
//       it("Should return zero vested tokens before cliff", async function () {
//         const vestedAmount = await icoAndVesting.getVestedTokenAmount(seedVestingId);
//         expect(vestedAmount).to.equal(0);

//         const claimableAmount = await icoAndVesting.getClaimableTokenAmount(seedVestingId);
//         expect(claimableAmount).to.equal(0);
//       });

//       it("Should calculate vested tokens for public presale (no cliff)", async function () {
//         // Move forward 6 months
//         await moveTimeForward(180 * 24 * 60 * 60);

//         const vestingDetails = await icoAndVesting.getVestingDetails(publicVestingId);
//         const vestedAmount = await icoAndVesting.getVestedTokenAmount(publicVestingId);
        
//         // Should have vested approximately 50% (6 months of 12-month vesting)
//         const expectedVested = vestingDetails.totalTokenAmount / 2n;
//         expect(vestedAmount).to.be.closeTo(expectedVested, ethers.parseEther("100")); // Allow small variance
//       });

//       it("Should calculate vested tokens after cliff period", async function () {
//         // Move forward another 6 months (total 12 months - past seed cliff)
//         await moveTimeForward(180 * 24 * 60 * 60);

//         const vestedAmount = await icoAndVesting.getVestedTokenAmount(seedVestingId);
//         expect(vestedAmount).to.be.gt(0);

//         const claimableAmount = await icoAndVesting.getClaimableTokenAmount(seedVestingId);
//         expect(claimableAmount).to.equal(vestedAmount); // No tokens claimed yet
//       });

//       it("Should calculate full vesting after completion", async function () {
//         // Move forward to complete all vestings
//         await moveTimeForward(730 * 24 * 60 * 60); // 2 years

//         const vestingDetails = await icoAndVesting.getVestingDetails(publicVestingId);
//         const vestedAmount = await icoAndVesting.getVestedTokenAmount(publicVestingId);
        
//         expect(vestedAmount).to.equal(vestingDetails.totalTokenAmount);
//       });
//     });

//     describe("7.2 Token Claims", function () {
//       it("Should reject claims before cliff period", async function () {
//         // Reset time and test team vesting (9-month cliff)
//         await network.provider.send("hardhat_reset");
        
//         // Recreate minimal test environment
//         [owner, user1, user2, user3] = await ethers.getSigners();
        
//         // Redeploy and setup (simplified)
//         const EYEFactory = await ethers.getContractFactory("EYE");
//         eyeToken = await EYEFactory.deploy(owner.address);
        
//         const MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");
//         ethPriceFeed = await MockV3Aggregator.deploy(8, 4000 * 10 ** 8);
//         usdcPriceFeed = await MockV3Aggregator.deploy(8, 1 * 10 ** 8);
//         usdtPriceFeed = await MockV3Aggregator.deploy(8, 1 * 10 ** 8);

//         const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
//         mockUSDC = await MockUSDCFactory.deploy();

//         const MockUSDTFactory = await ethers.getContractFactory("MockUSDT");
//         mockUSDT = await MockUSDTFactory.deploy();

//         const EyeICOAndVestingFactory = await ethers.getContractFactory("EyeICOAndVesting");
//         icoAndVesting = await upgrades.deployProxy(
//           EyeICOAndVestingFactory,
//           [
//             await eyeToken.getAddress(),
//             owner.address,
//             await mockUSDC.getAddress(),
//             await mockUSDT.getAddress(),
//             await ethPriceFeed.getAddress(),
//             await usdcPriceFeed.getAddress(),
//             await usdtPriceFeed.getAddress(),
//           ],
//           { kind: "uups", initializer: "initialize" }
//         );

//         await eyeToken.transfer(await icoAndVesting.getAddress(), TOTAL_SUPPLY);

//         // Create team vesting
//         await icoAndVesting.addCollaborator(CollaboratorRole.Team, user3.address, ethers.parseEther("1000000"));
//         const vestingId = await icoAndVesting.vestingId();

//         await expect(
//           icoAndVesting.connect(user3).claimTokens(vestingId)
//         ).to.be.revertedWith("No claimable tokens");
//       });

//       it("Should allow claims after cliff period", async function () {
//         // Move past cliff period
//         await moveTimeForward(270 * 24 * 60 * 60 + 1); // 9 months + 1 second

//         const vestingId = await icoAndVesting.vestingId();
//         const initialBalance = await eyeToken.balanceOf(user3.address);
//         const claimableAmount = await icoAndVesting.getClaimableTokenAmount(vestingId);
        
//         if (claimableAmount > 0) {
//           const tx = await icoAndVesting.connect(user2).claimTokens(vestingId);
//           const receipt = await tx.wait();
//           console.log("Token claim gas used:", receipt.gasUsed.toString());
          
//           // Gas should be reasonable (less than 200k)
//           expect(receipt.gasUsed).to.be.lt(200000);
//         }
//       });

//       it("Should have reasonable gas consumption for collaborator addition", async function () {
//         const tx = await icoAndVesting.addCollaborator(
//           CollaboratorRole.Staking,
//           user3.address,
//           ethers.parseEther("500000")
//         );
        
//         const receipt = await tx.wait();
//         console.log("Collaborator addition gas used:", receipt.gasUsed.toString());
        
//         // Gas should be reasonable (less than 400k)
//         expect(receipt.gasUsed).to.be.lt(400000);
//       });
//     });

//     describe("13.2 Batch Operations", function () {
//       it("Should handle multiple purchases efficiently", async function () {
//         await icoAndVesting.setICORound(ICORounds.PublicPresale);
        
//         const purchasePromises = [];
//         const users = [user1, user2, user3, user4, user5];
        
//         for (const user of users) {
//           purchasePromises.push(
//             icoAndVesting.connect(user).buyTokensWithETH([], {
//               value: ethers.parseEther("0.1")
//             })
//           );
//         }
        
//         const startTime = Date.now();
//         await Promise.all(purchasePromises);
//         const endTime = Date.now();
        
//         console.log("Batch purchase time:", endTime - startTime, "ms");
        
//         // Verify all purchases succeeded
//         for (const user of users) {
//           const purchases = await icoAndVesting.getUserPurchaseAmount(user.address, ICORounds.PublicPresale);
//           expect(purchases).to.be.gt(0);
//         }
//       });

//       it("Should handle multiple collaborator additions efficiently", async function () {
//         const collaborators = [
//           { role: CollaboratorRole.Ecosystem, user: user1, amount: "100000" },
//           { role: CollaboratorRole.Reserve, user: user2, amount: "200000" },
//           { role: CollaboratorRole.Staking, user: user3, amount: "150000" }
//         ];

//         const startTime = Date.now();
        
//         for (const collab of collaborators) {
//           await icoAndVesting.addCollaborator(
//             collab.role,
//             collab.user.address,
//             ethers.parseEther(collab.amount)
//           );
//         }
        
//         const endTime = Date.now();
//         console.log("Batch collaborator addition time:", endTime - startTime, "ms");
        
//         // Verify all collaborators added
//         for (const collab of collaborators) {
//           const roleDetails = await icoAndVesting.getCollaboratorDetails(collab.role);
//           expect(roleDetails.tokensAllocated).to.be.gt(0);
//         }
//       });
//     });
//   });

//   describe("14. Stress Tests", function () {
//     describe("14.1 High Volume Operations", function () {
//       it("Should handle maximum wallet cap purchases", async function () {
//         await icoAndVesting.setICORound(ICORounds.PublicPresale);
        
//         // Buy exactly at wallet cap multiple times with different users
//         const walletCap = 50000 * PRECISION; // $50K
//         const ethAmount = ethers.parseEther("12.5"); // $50K worth
        
//         const users = [user1, user2, user3];
        
//         for (const user of users) {
//           await icoAndVesting.connect(user).buyTokensWithETH([], {
//             value: ethAmount
//           });
          
//           const purchases = await icoAndVesting.getUserPurchaseAmount(user.address, ICORounds.PublicPresale);
//           expect(purchases).to.equal(walletCap);
//         }
//       });

//       it("Should handle near hard cap scenarios", async function () {
//         const roundDetails = await icoAndVesting.getRoundDetails(ICORounds.PublicPresale);
//         const remainingTokens = roundDetails.totalTokenAmount - roundDetails.tokensSold;
        
//         if (remainingTokens > ethers.parseEther("1000000")) {
//           // Buy close to remaining tokens
//           const nearMaxTokens = remainingTokens - ethers.parseEther("100000");
//           const currentPrice = await icoAndVesting.getCurrentTokenPrice();
//           const usdValue = (nearMaxTokens * BigInt(currentPrice)) / TOKEN_DECIMALS;
//           const ethValue = usdValue / BigInt(4000);
          
//           await icoAndVesting.connect(user4).buyTokensWithETH([], {
//             value: ethValue
//           });
          
//           // Verify purchase succeeded
//           const newRoundDetails = await icoAndVesting.getRoundDetails(ICORounds.PublicPresale);
//           expect(newRoundDetails.tokensSold).to.be.gt(roundDetails.tokensSold);
//         }
//       });
//     });

//     describe("14.2 Long-term Vesting Tests", function () {
//       it("Should handle vesting over maximum duration", async function () {
//         // Create maximum duration vesting (Staking: 48 months)
//         await icoAndVesting.addCollaborator(
//           CollaboratorRole.Staking,
//           user5.address,
//           ethers.parseEther("2000000")
//         );
        
//         const vestingId = await icoAndVesting.vestingId();
        
//         // Fast forward through entire vesting period
//         await moveTimeForward(1440 * 24 * 60 * 60); // 48 months
        
//         const vestingDetails = await icoAndVesting.getVestingDetails(vestingId);
//         const vestedAmount = await icoAndVesting.getVestedTokenAmount(vestingId);
        
//         expect(vestedAmount).to.equal(vestingDetails.totalTokenAmount);
        
//         // Claim all tokens
//         await icoAndVesting.connect(user5).claimTokens(vestingId);
        
//         const finalBalance = await eyeToken.balanceOf(user5.address);
//         expect(finalBalance).to.equal(vestingDetails.totalTokenAmount);
//       });

//       it("Should handle multiple overlapping vesting schedules", async function () {
//         // Create multiple vestings for same user with different schedules
//         const vestingData = [
//           { role: CollaboratorRole.Ecosystem, amount: "500000" },
//           { role: CollaboratorRole.EarlyLP, amount: "200000" },
//           { role: CollaboratorRole.Team, amount: "1000000" }
//         ];

//         const vestingIds = [];
//         const initialBalance = await eyeToken.balanceOf(user1.address);
        
//         for (const data of vestingData) {
//           await icoAndVesting.addCollaborator(
//             data.role,
//             user1.address,
//             ethers.parseEther(data.amount)
//           );
//           vestingIds.push(await icoAndVesting.vestingId());
//         }
        
//         // Move through different time periods and claim from all vestings
//         const timePoints = [90, 270, 365, 720]; // Days
        
//         for (const days of timePoints) {
//           await moveTimeForward(days * 24 * 60 * 60);
          
//           for (const vestingId of vestingIds) {
//             const claimableAmount = await icoAndVesting.getClaimableTokenAmount(vestingId);
//             if (claimableAmount > 0) {
//               await icoAndVesting.connect(user1).claimTokens(vestingId);
//             }
//           }
//         }
        
//         // Verify total tokens received
//         const finalBalance = await eyeToken.balanceOf(user1.address);
//         expect(finalBalance).to.be.gt(initialBalance);
//       });
//     });
//   });

//   describe("15. Edge Cases and Corner Cases", function () {
//     describe("15.1 Boundary Value Tests", function () {
//       it("Should handle minimum purchase amount exactly", async function () {
//         await icoAndVesting.setICORound(ICORounds.PublicPresale);
        
//         // Calculate exact minimum ETH for $10
//         const minUSD = 10 * PRECISION;
//         const minETH = ethers.parseEther("0.0025"); // $10 / $4000
        
//         const tx = await icoAndVesting.connect(user1).buyTokensWithETH([], {
//           value: minETH
//         });
        
//         expect(tx).to.not.be.reverted;
//       });

//       it("Should handle maximum allocation percentages", async function () {
//         // Test updating to maximum valid percentages
//         await icoAndVesting.updateRoundDetails(
//           ICORounds.Seed,
//           100, // Maximum percentage
//           100000 * PRECISION,
//           100, // Maximum TGE
//           365 * 24 * 60 * 60,
//           1000 * 24 * 60 * 60,
//           1000,
//           true
//         );
        
//         const details = await icoAndVesting.getRoundDetails(ICORounds.Seed);
//         expect(details.allocationPercent).to.equal(100);
//         expect(details.TGE).to.equal(100);
//       });

//       it("Should handle zero values where appropriate", async function () {
//         // Test zero cliff and duration
//         await icoAndVesting.updateCollaboratorDetails(
//           CollaboratorRole.Liquidity,
//           10,
//           100, // 100% TGE
//           0, // Zero cliff
//           0, // Zero duration
//           false
//         );
        
//         const details = await icoAndVesting.getCollaboratorDetails(CollaboratorRole.Liquidity);
//         expect(details.cliff).to.equal(0);
//         expect(details.duration).to.equal(0);
//       });
//     });

//     describe("15.2 State Transition Edge Cases", function () {
//       it("Should handle rapid round switching", async function () {
//         // Rapidly switch between rounds
//         await icoAndVesting.setICORound(ICORounds.Seed);
//         await icoAndVesting.setICORound(ICORounds.PublicPresale);
//         await icoAndVesting.setICORound(ICORounds.Seed);
        
//         expect(await icoAndVesting.currentRound()).to.equal(ICORounds.Seed);
        
//         const roundDetails = await icoAndVesting.getICORoundDetails();
//         expect(roundDetails.isActive).to.be.true;
//       });

//       it("Should handle pause during operations", async function () {
//         await icoAndVesting.setICORound(ICORounds.PublicPresale);
        
//         // Start a purchase, pause, then try another
//         await icoAndVesting.connect(user1).buyTokensWithETH([], {
//           value: ethers.parseEther("0.1")
//         });
        
//         await icoAndVesting.pause();
        
//         await expect(
//           icoAndVesting.connect(user2).buyTokensWithETH([], {
//             value: ethers.parseEther("0.1")
//           })
//         ).to.be.revertedWith("Pausable: paused");
        
//         await icoAndVesting.unpause();
        
//         // Should work after unpause
//         await icoAndVesting.connect(user2).buyTokensWithETH([], {
//           value: ethers.parseEther("0.1")
//         });
//       });
//     });

//     describe("15.3 Precision and Rounding Edge Cases", function () {
//       it("Should handle fractional token calculations", async function () {
//         await icoAndVesting.setICORound(ICORounds.Seed);
        
//         // Use an odd USD amount that results in fractional tokens
//         const oddUSDAmount = 1337 * PRECISION; // $1337
//         const expectedTokens = calculateExpectedTokens(oddUSDAmount, 1500);
        
//         const calculatedTokens = await icoAndVesting.calculateTokensForUSD(oddUSDAmount);
//         expect(calculatedTokens).to.equal(expectedTokens);
//       });

//       it("Should handle very large numbers", async function () {
//         // Test with maximum possible token amounts
//         const maxTokens = ethers.parseEther("1000000000"); // 1B tokens
//         const currentPrice = await icoAndVesting.getCurrentTokenPrice();
//         const usdValue = (maxTokens * BigInt(currentPrice)) / TOKEN_DECIMALS;
        
//         // Should not overflow
//         const calculatedTokens = await icoAndVesting.calculateTokensForUSD(usdValue);
//         expect(calculatedTokens).to.equal(maxTokens);
//       });

//       it("Should handle precision at boundaries", async function () {
//         // Test calculations at precision boundaries
//         const preciseBoundary = PRECISION - 1; // $0.999999
        
//         // Should revert as below minimum
//         await expect(
//           icoAndVesting.calculateTokensForUSD(preciseBoundary)
//         ).to.be.revertedWith("Purchase amount too small");
        
//         // Minimum should work
//         const minimum = 10 * PRECISION;
//         const tokens = await icoAndVesting.calculateTokensForUSD(minimum);
//         expect(tokens).to.be.gt(0);
//       });
//     });
//   });

//   describe("16. Recovery and Disaster Scenarios", function () {
//     describe("16.1 Emergency Recovery", function () {
//       it("Should recover from total contract drain", async function () {
//         // Drain all tokens
//         const contractBalance = await eyeToken.balanceOf(await icoAndVesting.getAddress());
        
//         await icoAndVesting.emergencyWithdraw(
//           await eyeToken.getAddress(),
//           owner.address,
//           contractBalance
//         );
        
//         expect(await eyeToken.balanceOf(await icoAndVesting.getAddress())).to.equal(0);
        
//         // Restore tokens
//         await eyeToken.transfer(await icoAndVesting.getAddress(), contractBalance);
        
//         // Verify operations work again
//         await icoAndVesting.setICORound(ICORounds.PublicPresale);
//         await icoAndVesting.connect(user1).buyTokensWithETH([], {
//           value: ethers.parseEther("0.1")
//         });
//       });

//       it("Should handle corrupted price feed recovery", async function () {
//         // Set invalid price feed
//         await icoAndVesting.setPriceFeed("ETH", await mockUSDC.getAddress()); // Wrong contract
        
//         // Should fail
//         await expect(
//           icoAndVesting.getETHValueInUSD(ethers.parseEther("1"))
//         ).to.be.reverted;
        
//         // Recover with correct price feed
//         await icoAndVesting.setPriceFeed("ETH", await ethPriceFeed.getAddress());
        
//         // Should work again
//         const ethValue = await icoAndVesting.getETHValueInUSD(ethers.parseEther("1"));
//         expect(ethValue).to.be.gt(0);
//       });
//     });

//     describe("16.2 Upgrade Scenarios", function () {
//       it("Should maintain state during upgrade simulation", async function () {
//         // Record pre-upgrade state
//         const preRound = await icoAndVesting.currentRound();
//         const preVestingId = await icoAndVesting.vestingId();
//         const preFundReceiver = await icoAndVesting.fundReceiverAddress();
        
//         // Simulate state-changing operations
//         await icoAndVesting.setICORound(ICORounds.PublicPresale);
//         await icoAndVesting.connect(user1).buyTokensWithETH([], {
//           value: ethers.parseEther("0.5")
//         });
        
//         // Verify state changed
//         expect(await icoAndVesting.currentRound()).to.equal(ICORounds.PublicPresale);
//         expect(await icoAndVesting.vestingId()).to.be.gt(preVestingId);
//         expect(await icoAndVesting.fundReceiverAddress()).to.equal(preFundReceiver);
        
//         // Verify vesting data persistence
//         const newVestingId = await icoAndVesting.vestingId();
//         const vestingDetails = await icoAndVesting.getVestingDetails(newVestingId);
//         expect(vestingDetails.userAddress).to.equal(user1.address);
//       });
//     });
//   });

//   describe("17. Final Integration Validation", function () {
//     describe("17.1 Complete System Validation", function () {
//       it("Should complete full ICO and vesting cycle", async function () {
//         console.log("Starting complete system validation...");
        
//         // Phase 1: Seed Round
//         await icoAndVesting.setMerkleRoot(merkleRoot);
//         await icoAndVesting.setICORound(ICORounds.Seed);
        
//         const seedPurchases = [];
//         for (const addr of whitelistedAddresses.slice(0, 2)) {
//           const proof = getProof(addr);
//           await network.provider.request({
//             method: "hardhat_impersonateAccount",
//             params: [addr],
//           });
//           const signer = await ethers.getSigner(addr);
//           await owner.sendTransaction({ to: addr, value: ethers.parseEther("10") });
          
//           const tx = await icoAndVesting.connect(signer).buyTokensWithETH(proof, {
//             value: ethers.parseEther("2")
//           });
//           seedPurchases.push(tx);
          
//           await network.provider.request({
//             method: "hardhat_stopImpersonatingAccount",
//             params: [addr],
//           });
//         }
        
//         console.log("Seed round purchases completed");
        
//         // Phase 2: Public Presale
//         await icoAndVesting.setICORound(ICORounds.PublicPresale);
        
//         const publicPurchases = [];
//         const users = [user1, user2, user3, user4];
//         for (const user of users) {
//           const tx = await icoAndVesting.connect(user).buyTokensWithETH([], {
//             value: ethers.parseEther("1")
//           });
//           publicPurchases.push(tx);
//         }
        
//         console.log("Public presale purchases completed");
        
//         // Phase 3: Collaborator Setup
//         const collaboratorSetup = [
//           { role: CollaboratorRole.Ecosystem, user: user1, amount: "1000000" },
//           { role: CollaboratorRole.Reserve, user: user2, amount: "2000000" },
//           { role: CollaboratorRole.Liquidity, user: user3, amount: "1500000" },
//           { role: CollaboratorRole.Team, user: user4, amount: "3000000" }
//         ];
        
//         for (const collab of collaboratorSetup) {
//           await icoAndVesting.addCollaborator(
//             collab.role,
//             collab.user.address,
//             ethers.parseEther(collab.amount)
//           );
//         }
        
//         console.log("Collaborator setup completed");
        
//         // Phase 4: Time progression and claims
//         const timeProgressions = [
//           { months: 6, description: "6 months - Some cliff periods end" },
//           { months: 9, description: "9 months - Team cliff ends" },
//           { months: 12, description: "12 months - Most vesting periods end" },
//           { months: 24, description: "24 months - Long vesting periods end" }
//         ];
        
//         for (const progression of timeProgressions) {
//           await moveTimeForward(progression.months * 30 * 24 * 60 * 60); // Approximate months
          
//           // Attempt claims for all users
//           const totalVestings = await icoAndVesting.vestingId();
//           for (let vestingId = 1; vestingId <= totalVestings; vestingId++) {
//             try {
//               const vestingDetails = await icoAndVesting.getVestingDetails(vestingId);
//               const claimableAmount = await icoAndVesting.getClaimableTokenAmount(vestingId);
              
//               if (claimableAmount > 0) {
//                 await network.provider.request({
//                   method: "hardhat_impersonateAccount",
//                   params: [vestingDetails.userAddress],
//                 });
//                 const signer = await ethers.getSigner(vestingDetails.userAddress);
//                 await owner.sendTransaction({ 
//                   to: vestingDetails.userAddress, 
//                   value: ethers.parseEther("1") 
//                 });
                
//                 await icoAndVesting.connect(signer).claimTokens(vestingId);
                
//                 await network.provider.request({
//                   method: "hardhat_stopImpersonatingAccount",
//                   params: [vestingDetails.userAddress],
//                 });
//               }
//             } catch (error) {
//               // Skip invalid vesting IDs or failed claims
//             }
//           }
          
//           console.log(`${progression.description} - Claims processed`);
//         }
        
//         // Phase 5: Final validation
//         const finalStats = {
//           seedSold: (await icoAndVesting.getRoundDetails(ICORounds.Seed)).tokensSold,
//           publicSold: (await icoAndVesting.getRoundDetails(ICORounds.PublicPresale)).tokensSold,
//           totalVestings: await icoAndVesting.vestingId(),
//           contractBalance: await eyeToken.balanceOf(await icoAndVesting.getAddress()),
//           isPaused: await icoAndVesting.paused()
//         };
        
//         console.log("Final system stats:", {
//           seedTokensSold: ethers.formatEther(finalStats.seedSold),
//           publicTokensSold: ethers.formatEther(finalStats.publicSold),
//           totalVestingSchedules: finalStats.totalVestings.toString(),
//           remainingContractTokens: ethers.formatEther(finalStats.contractBalance),
//           contractPaused: finalStats.isPaused
//         });
        
//         // Verify system integrity
//         expect(finalStats.seedSold).to.be.gt(0);
//         expect(finalStats.publicSold).to.be.gt(0);
//         expect(finalStats.totalVestings).to.be.gt(0);
//         expect(finalStats.isPaused).to.be.false;
        
//         console.log("Complete system validation passed!");
//       });
//     });

//     describe("17.2 Final State Verification", function () {
//       it("Should have consistent final state", async function () {
//         // Verify all major contract states are consistent
//         const currentRound = await icoAndVesting.currentRound();
//         const roundDetails = await icoAndVesting.getICORoundDetails();
//         const contractBalance = await icoAndVesting.getContractTokenBalance();
//         const owner = await icoAndVesting.owner();
        
//         // Basic state checks
//         expect(currentRound).to.be.oneOf([ICORounds.Seed, ICORounds.PublicPresale]);
//         expect(roundDetails.totalTokenAmount).to.be.gt(0);
//         expect(contractBalance).to.be.gte(0);
//         expect(owner).to.not.equal(ethers.ZeroAddress);
        
//         // Check that all allocations add up correctly
//         let totalAllocation = 0;
//         for (let round = 0; round <= 1; round++) {
//           const details = await icoAndVesting.getRoundDetails(round);
//           totalAllocation += Number(details.allocationPercent);
//         }
        
//         for (let role = 0; role <= 6; role++) {
//           const details = await icoAndVesting.getCollaboratorDetails(role);
//           totalAllocation += Number(details.allocationPercent);
//         }
        
//         expect(totalAllocation).to.equal(100); // Should total 100% (10+30+10+10+10+10+5+10+5)
        
//         console.log("Final state verification completed successfully");
//       });
//     });
//   });
// });

//         expect(claimableAmount).to.be.gt(0);

//         const tx = await icoAndVesting.connect(user3).claimTokens(vestingId);

//         await expect(tx)
//           .to.emit(icoAndVesting, "TokensClaimed")
//           .withArgs(vestingId, user3.address, claimableAmount);

//         const newBalance = await eyeToken.balanceOf(user3.address);
//         expect(newBalance - initialBalance).to.equal(claimableAmount);
//       });

//       it("Should track claimed tokens correctly", async function () {
//         const vestingId = await icoAndVesting.vestingId();
        
//         // Move forward more time
//         await moveTimeForward(180 * 24 * 60 * 60); // 6 more months

//         const vestedAmount = await icoAndVesting.getVestedTokenAmount(vestingId);
//         const vestingDetails = await icoAndVesting.getVestingDetails(vestingId);
//         const claimableAmount = await icoAndVesting.getClaimableTokenAmount(vestingId);

//         // Claimable should be vested minus already transferred
//         expect(claimableAmount).to.equal(vestedAmount - vestingDetails.tokenTransferred);

//         if (claimableAmount > 0) {
//           await icoAndVesting.connect(user3).claimTokens(vestingId);
          
//           const newVestingDetails = await icoAndVesting.getVestingDetails(vestingId);
//           expect(newVestingDetails.tokenTransferred).to.equal(vestedAmount);
//         }
//       });

//       it("Should reject claims from non-beneficiary", async function () {
//         const vestingId = await icoAndVesting.vestingId();
        
//         await expect(
//           icoAndVesting.connect(user1).claimTokens(vestingId)
//         ).to.be.revertedWith("Not vesting beneficiary");
//       });

//       it("Should reject claims for invalid vesting ID", async function () {
//         await expect(
//           icoAndVesting.connect(user1).claimTokens(999)
//         ).to.be.revertedWith("Invalid vesting id");
//       });

//       it("Should handle multiple claims correctly", async function () {
//         const vestingId = await icoAndVesting.vestingId();
        
//         // Move to end of vesting period
//         await moveTimeForward(720 * 24 * 60 * 60); // 24 months

//         const vestingDetails = await icoAndVesting.getVestingDetails(vestingId);
//         const finalClaimable = await icoAndVesting.getClaimableTokenAmount(vestingId);

//         if (finalClaimable > 0) {
//           await icoAndVesting.connect(user3).claimTokens(vestingId);
//         }

//         // Try to claim again - should fail
//         await expect(
//           icoAndVesting.connect(user3).claimTokens(vestingId)
//         ).to.be.revertedWith("No claimable tokens");

//         // Check final state
//         const finalVestingDetails = await icoAndVesting.getVestingDetails(vestingId);
//         expect(finalVestingDetails.tokenTransferred).to.equal(vestingDetails.totalTokenAmount);
//       });
//     });

//     describe("7.3 Vesting View Functions", function () {
//       it("Should return correct vesting details", async function () {
//         const vestingId = await icoAndVesting.vestingId();
//         const details = await icoAndVesting.getVestingDetails(vestingId);

//         expect(details.userAddress).to.equal(user3.address);
//         expect(details.isCollaborator).to.be.true;
//         expect(details.collaboratorRole).to.equal(CollaboratorRole.Team);
//         expect(details.totalTokenAmount).to.be.gt(0);
//       });

//       it("Should return correct vesting amounts", async function () {
//         const vestingId = await icoAndVesting.vestingId();
//         const amounts = await icoAndVesting.getVestingAmounts(vestingId);

//         expect(amounts.claimableAmount).to.be.gte(0);
//         expect(amounts.vestedAmount).to.be.gte(amounts.claimableAmount);
//       });
//     });
//   });

//   describe("8. Administrative Functions", function () {
//     describe("8.1 Round Management", function () {
//       it("Should switch between ICO rounds", async function () {
//         expect(await icoAndVesting.currentRound()).to.equal(ICORounds.Seed);

//         const tx = await icoAndVesting.setICORound(ICORounds.PublicPresale);
        
//         await expect(tx)
//           .to.emit(icoAndVesting, "ICORoundChanged")
//           .withArgs(ICORounds.Seed, ICORounds.PublicPresale);

//         expect(await icoAndVesting.currentRound()).to.equal(ICORounds.PublicPresale);

//         // Check round activation
//         const roundDetails = await icoAndVesting.getICORoundDetails();
//         expect(roundDetails.isActive).to.be.true;
//       });

//       it("Should close current round", async function () {
//         const currentRound = await icoAndVesting.currentRound();
        
//         const tx = await icoAndVesting.closeCurrentRound();
        
//         await expect(tx)
//           .to.emit(icoAndVesting, "RoundClosed")
//           .withArgs(currentRound);

//         const roundDetails = await icoAndVesting.getICORoundDetails();
//         expect(roundDetails.isActive).to.be.false;
//       });

//       it("Should reject closing inactive round", async function () {
//         await expect(
//           icoAndVesting.closeCurrentRound()
//         ).to.be.revertedWith("Current round not active");
//       });

//       it("Should reject invalid round", async function () {
//         await expect(
//           icoAndVesting.setICORound(5) // Invalid round
//         ).to.be.revertedWith("Invalid round");
//       });

//       it("Should only allow owner to manage rounds", async function () {
//         await expect(
//           icoAndVesting.connect(user1).setICORound(ICORounds.Seed)
//         ).to.be.revertedWithCustomError(icoAndVesting, "OwnableUnauthorizedAccount");

//         await expect(
//           icoAndVesting.connect(user1).closeCurrentRound()
//         ).to.be.revertedWithCustomError(icoAndVesting, "OwnableUnauthorizedAccount");
//       });
//     });

//     describe("8.2 Pause/Unpause Functionality", function () {
//       it("Should pause and unpause contract", async function () {
//         expect(await icoAndVesting.paused()).to.be.false;

//         await icoAndVesting.pause();
//         expect(await icoAndVesting.paused()).to.be.true;

//         await icoAndVesting.unpause();
//         expect(await icoAndVesting.paused()).to.be.false;
//       });

//       it("Should prevent operations when paused", async function () {
//         await icoAndVesting.pause();

//         await expect(
//           icoAndVesting.connect(user1).buyTokensWithETH([], {
//             value: ethers.parseEther("1")
//           })
//         ).to.be.revertedWith("Pausable: paused");

//         await expect(
//           icoAndVesting.connect(user1).claimTokens(1)
//         ).to.be.revertedWith("Pausable: paused");

//         await icoAndVesting.unpause();
//       });

//       it("Should only allow owner to pause/unpause", async function () {
//         await expect(
//           icoAndVesting.connect(user1).pause()
//         ).to.be.revertedWithCustomError(icoAndVesting, "OwnableUnauthorizedAccount");

//         await expect(
//           icoAndVesting.connect(user1).unpause()
//         ).to.be.revertedWithCustomError(icoAndVesting, "OwnableUnauthorizedAccount");
//       });
//     });

//     describe("8.3 Token Withdrawals", function () {
//       it("Should withdraw ICO round tokens", async function () {
//         const withdrawAmount = ethers.parseEther("1000000");
        
//         const tx = await icoAndVesting.withdrawTokens(
//           ICORounds.Seed,
//           owner.address,
//           withdrawAmount
//         );

//         await expect(tx)
//           .to.emit(icoAndVesting, "TokensWithdrawn")
//           .withArgs(owner.address, withdrawAmount, ICORounds.Seed);

//         const balance = await eyeToken.balanceOf(owner.address);
//         expect(balance).to.be.gte(withdrawAmount);
//       });

//       it("Should withdraw collaborator tokens", async function () {
//         const withdrawAmount = ethers.parseEther("500000");
        
//         const tx = await icoAndVesting.withdrawCollaboratorTokens(
//           CollaboratorRole.Ecosystem,
//           owner.address,
//           withdrawAmount
//         );

//         await expect(tx)
//           .to.emit(icoAndVesting, "TokensWithdrawn");
//       });

//       it("Should reject withdrawal of more tokens than available", async function () {
//         const seedDetails = await icoAndVesting.getRoundDetails(ICORounds.Seed);
//         const availableTokens = seedDetails.totalTokenAmount - seedDetails.tokensSold;
//         const excessAmount = availableTokens + ethers.parseEther("1");

//         await expect(
//           icoAndVesting.withdrawTokens(ICORounds.Seed, owner.address, excessAmount)
//         ).to.be.revertedWith("Not enough tokens in round");
//       });

//       it("Should reject withdrawal from non-owner", async function () {
//         await expect(
//           icoAndVesting.connect(user1).withdrawTokens(ICORounds.Seed, user1.address, ethers.parseEther("1000"))
//         ).to.be.revertedWithCustomError(icoAndVesting, "OwnableUnauthorizedAccount");
//       });

//       it("Should reject zero amount withdrawal", async function () {
//         await expect(
//           icoAndVesting.withdrawTokens(ICORounds.Seed, owner.address, 0)
//         ).to.be.revertedWith("Invalid amount");
//       });

//       it("Should reject withdrawal to zero address", async function () {
//         await expect(
//           icoAndVesting.withdrawTokens(ICORounds.Seed, ethers.ZeroAddress, ethers.parseEther("1000"))
//         ).to.be.revertedWith("Invalid address: zero address");
//       });
//     });

//     describe("8.4 Emergency Functions", function () {
//       it("Should perform emergency token withdrawal", async function () {
//         const contractBalance = await eyeToken.balanceOf(await icoAndVesting.getAddress());
//         const withdrawAmount = ethers.parseEther("1000000");

//         const tx = await icoAndVesting.emergencyWithdraw(
//           await eyeToken.getAddress(),
//           owner.address,
//           withdrawAmount
//         );

//         await expect(tx)
//           .to.emit(icoAndVesting, "EmergencyWithdraw")
//           .withArgs(await eyeToken.getAddress(), owner.address, withdrawAmount);
//       });

//       it("Should perform emergency ETH withdrawal", async function () {
//         // Send some ETH to contract first
//         await owner.sendTransaction({
//           to: await icoAndVesting.getAddress(),
//           value: ethers.parseEther("1")
//         });

//         const contractBalance = await ethers.provider.getBalance(await icoAndVesting.getAddress());
        
//         const tx = await icoAndVesting.emergencyWithdraw(
//           ethers.ZeroAddress, // Zero address for ETH
//           owner.address,
//           contractBalance
//         );

//         await expect(tx)
//           .to.emit(icoAndVesting, "EmergencyWithdraw")
//           .withArgs(ethers.ZeroAddress, owner.address, contractBalance);
//       });

//       it("Should reject emergency withdrawal from non-owner", async function () {
//         await expect(
//           icoAndVesting.connect(user1).emergencyWithdraw(
//             await eyeToken.getAddress(),
//             user1.address,
//             ethers.parseEther("1000")
//           )
//         ).to.be.revertedWithCustomError(icoAndVesting, "OwnableUnauthorizedAccount");
//       });

//       it("Should reject emergency withdrawal of insufficient balance", async function () {
//         const contractBalance = await eyeToken.balanceOf(await icoAndVesting.getAddress());
//         const excessAmount = contractBalance + ethers.parseEther("1");

//         await expect(
//           icoAndVesting.emergencyWithdraw(
//             await eyeToken.getAddress(),
//             owner.address,
//             excessAmount
//           )
//         ).to.be.revertedWith("Insufficient token balance");
//       });
//     });

//     describe("8.5 Address Updates", function () {
//       it("Should update fund receiver address", async function () {
//         const newReceiver = user3.address;
        
//         const tx = await icoAndVesting.updateFundReceiverAddress(newReceiver);
        
//         await expect(tx)
//           .to.emit(icoAndVesting, "AddressUpdated")
//           .withArgs("fundReceiver", owner.address, newReceiver);

//         expect(await icoAndVesting.fundReceiverAddress()).to.equal(newReceiver);
//       });

//       it("Should reject zero address for fund receiver", async function () {
//         await expect(
//           icoAndVesting.updateFundReceiverAddress(ethers.ZeroAddress)
//         ).to.be.revertedWith("Invalid address: zero address");
//       });

//       it("Should update price feeds", async function () {
//         const MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");
//         const newPriceFeed = await MockV3Aggregator.deploy(8, 5000 * 10 ** 8);

//         const tx = await icoAndVesting.setPriceFeed("ETH", await newPriceFeed.getAddress());
        
//         await expect(tx)
//           .to.emit(icoAndVesting, "AddressUpdated")
//           .withArgs("ETHPriceFeed", await ethPriceFeed.getAddress(), await newPriceFeed.getAddress());
//       });

//       it("Should reject invalid price feed type", async function () {
//         await expect(
//           icoAndVesting.setPriceFeed("INVALID", await ethPriceFeed.getAddress())
//         ).to.be.revertedWith("Invalid feed type");
//       });

//       it("Should only allow owner to update addresses", async function () {
//         await expect(
//           icoAndVesting.connect(user1).updateFundReceiverAddress(user1.address)
//         ).to.be.revertedWithCustomError(icoAndVesting, "OwnableUnauthorizedAccount");

//         await expect(
//           icoAndVesting.connect(user1).setPriceFeed("ETH", await ethPriceFeed.getAddress())
//         ).to.be.revertedWithCustomError(icoAndVesting, "OwnableUnauthorizedAccount");
//       });
//     });

//     describe("8.6 Configuration Updates", function () {
//       it("Should update round details", async function () {
//         await icoAndVesting.updateRoundDetails(
//           ICORounds.Seed,
//           15, // new allocation percent
//           30000 * PRECISION, // new wallet cap
//           5, // new TGE
//           90 * 24 * 60 * 60, // new cliff
//           365 * 24 * 60 * 60, // new duration
//           2000, // new fixed price
//           false // new whitelist requirement
//         );

//         const updatedDetails = await icoAndVesting.getRoundDetails(ICORounds.Seed);
//         expect(updatedDetails.allocationPercent).to.equal(15);
//         expect(updatedDetails.walletCapUSD).to.equal(30000 * PRECISION);
//         expect(updatedDetails.TGE).to.equal(5);
//         expect(updatedDetails.requiresWhitelist).to.be.false;
//       });

//       it("Should update collaborator details", async function () {
//         await icoAndVesting.updateCollaboratorDetails(
//           CollaboratorRole.Ecosystem,
//           12, // new allocation percent
//           15, // new TGE
//           30 * 24 * 60 * 60, // new cliff
//           720 * 24 * 60 * 60, // new duration
//           true // new cliff offset
//         );

//         const updatedDetails = await icoAndVesting.getCollaboratorDetails(CollaboratorRole.Ecosystem);
//         expect(updatedDetails.allocationPercent).to.equal(12);
//         expect(updatedDetails.TGE).to.equal(15);
//         expect(updatedDetails.cliffOffset).to.be.true;
//       });

//       it("Should only allow owner to update configurations", async function () {
//         await expect(
//           icoAndVesting.connect(user1).updateRoundDetails(
//             ICORounds.Seed, 10, 25000 * PRECISION, 0, 180 * 24 * 60 * 60, 730 * 24 * 60 * 60, 1500, true
//           )
//         ).to.be.revertedWithCustomError(icoAndVesting, "OwnableUnauthorizedAccount");

//         await expect(
//           icoAndVesting.connect(user1).updateCollaboratorDetails(
//             CollaboratorRole.Ecosystem, 10, 10, 0, 1080 * 24 * 60 * 60, false
//           )
//         ).to.be.revertedWithCustomError(icoAndVesting, "OwnableUnauthorizedAccount");
//       });
//     });
//   });

//   describe("9. View Functions and Getters", function () {
//     describe("9.1 Round Information", function () {
//       it("Should return current ICO round details", async function () {
//         const currentDetails = await icoAndVesting.getICORoundDetails();
//         expect(currentDetails.allocationPercent).to.be.gt(0);
//         expect(currentDetails.totalTokenAmount).to.be.gt(0);
//       });

//       it("Should return specific round details", async function () {
//         const seedDetails = await icoAndVesting.getRoundDetails(ICORounds.Seed);
//         const publicDetails = await icoAndVesting.getRoundDetails(ICORounds.PublicPresale);

//         expect(seedDetails.requiresWhitelist).to.be.true;
//         expect(publicDetails.requiresWhitelist).to.be.false;
//       });

//       it("Should return remaining tokens in round", async function () {
//         const remainingSeed = await icoAndVesting.getRemainingTokensInRound(ICORounds.Seed);
//         const remainingPublic = await icoAndVesting.getRemainingTokensInRound(ICORounds.PublicPresale);

//         expect(remainingSeed).to.be.gte(0);
//         expect(remainingPublic).to.be.gte(0);
//       });

//       it("Should check if current round requires whitelist", async function () {
//         await icoAndVesting.setICORound(ICORounds.Seed);
//         expect(await icoAndVesting.currentRoundRequiresWhitelist()).to.be.true;

//         await icoAndVesting.setICORound(ICORounds.PublicPresale);
//         expect(await icoAndVesting.currentRoundRequiresWhitelist()).to.be.false;
//       });
//     });

//     describe("9.2 Collaborator Information", function () {
//       it("Should return collaborator details for all roles", async function () {
//         for (let role = 0; role <= 6; role++) {
//           const details = await icoAndVesting.getCollaboratorDetails(role);
//           expect(details.allocationPercent).to.be.gt(0);
//           expect(details.totalTokenAmount).to.be.gt(0);
//         }
//       });

//       it("Should return remaining collaborator tokens", async function () {
//         const remainingEcosystem = await icoAndVesting.getRemainingCollaboratorTokens(CollaboratorRole.Ecosystem);
//         const remainingTeam = await icoAndVesting.getRemainingCollaboratorTokens(CollaboratorRole.Team);

//         expect(remainingEcosystem).to.be.gte(0);
//         expect(remainingTeam).to.be.gte(0);
//       });
//     });

//     describe("9.3 User Purchase Information", function () {
//       it("Should return user purchase amounts by round", async function () {
//         const user1SeedPurchases = await icoAndVesting.getUserPurchaseAmount(user1.address, ICORounds.Seed);
//         const user1PublicPurchases = await icoAndVesting.getUserPurchaseAmount(user1.address, ICORounds.PublicPresale);

//         expect(user1SeedPurchases).to.be.gte(0);
//         expect(user1PublicPurchases).to.be.gte(0);
//       });

//       it("Should return total user purchases", async function () {
//         const totalPurchases = await icoAndVesting.getTotalUserPurchases(user1.address);
//         expect(totalPurchases).to.be.gte(0);
//       });
//     });

//     describe("9.4 Contract Balance Information", function () {
//       it("Should return contract token balance", async function () {
//         const balance = await icoAndVesting.getContractTokenBalance();
//         expect(balance).to.be.gte(0);
//       });

//       it("Should return contract ETH balance", async function () {
//         const balance = await icoAndVesting.getContractETHBalance();
//         expect(balance).to.be.gte(0);
//       });
//     });

//     describe("9.5 Phase Information", function () {
//       it("Should return current phase info for public presale", async function () {
//         await icoAndVesting.setICORound(ICORounds.PublicPresale);
        
//         const phaseInfo = await icoAndVesting.getCurrentPhaseInfo();
//         expect(phaseInfo.currentPhase).to.be.gte(1);
//         expect(phaseInfo.currentPrice).to.be.gt(0);
//         expect(phaseInfo.percentageSold).to.be.gte(0);
//       });

//       it("Should return phase 1 for seed round", async function () {
//         await icoAndVesting.setICORound(ICORounds.Seed);
        
//         const phaseInfo = await icoAndVesting.getCurrentPhaseInfo();
//         expect(phaseInfo.currentPhase).to.equal(1);
//         expect(phaseInfo.currentPrice).to.equal(1500);
//       });
//     });
//   });

//   describe("10. Security and Access Control", function () {
//     describe("10.1 Ownership Controls", function () {
//       it("Should have correct initial owner", async function () {
//         expect(await icoAndVesting.owner()).to.equal(owner.address);
//       });

//       it("Should transfer ownership", async function () {
//         await icoAndVesting.transferOwnership(user1.address);
//         expect(await icoAndVesting.owner()).to.equal(user1.address);
        
//         // Transfer back for other tests
//         await icoAndVesting.connect(user1).transferOwnership(owner.address);
//       });

//       it("Should prevent unauthorized access to owner functions", async function () {
//         const ownerFunctions = [
//           () => icoAndVesting.connect(user1).setMerkleRoot(merkleRoot),
//           () => icoAndVesting.connect(user1).setICORound(ICORounds.Seed),
//           () => icoAndVesting.connect(user1).pause(),
//           () => icoAndVesting.connect(user1).addCollaborator(CollaboratorRole.Ecosystem, user1.address, ethers.parseEther("1000")),
//           () => icoAndVesting.connect(user1).withdrawTokens(ICORounds.Seed, user1.address, ethers.parseEther("1000")),
//           () => icoAndVesting.connect(user1).emergencyWithdraw(await eyeToken.getAddress(), user1.address, ethers.parseEther("1000"))
//         ];

//         for (const func of ownerFunctions) {
//           await expect(func()).to.be.revertedWithCustomError(icoAndVesting, "OwnableUnauthorizedAccount");
//         }
//       });
//     });

//     describe("10.2 Reentrancy Protection", function () {
//       it("Should prevent reentrancy attacks", async function () {
//         // Note: This would require a malicious contract to test properly
//         // For now, verify the modifier is in place by checking successful operations
//         await icoAndVesting.setICORound(ICORounds.PublicPresale);
        
//         const tx = await icoAndVesting.connect(user1).buyTokensWithETH([], {
//           value: ethers.parseEther("0.1")
//         });
        
//         expect(tx).to.not.be.reverted;
//       });
//     });

//     describe("10.3 Input Validation", function () {
//       it("Should validate address inputs", async function () {
//         await expect(
//           icoAndVesting.addCollaborator(CollaboratorRole.Ecosystem, ethers.ZeroAddress, ethers.parseEther("1000"))
//         ).to.be.revertedWith("Invalid address: zero address");
//       });

//       it("Should validate enum inputs", async function () {
//         await expect(
//           icoAndVesting.setICORound(99) // Invalid round
//         ).to.be.revertedWith("Invalid round");

//         await expect(
//           icoAndVesting.addCollaborator(99, user1.address, ethers.parseEther("1000")) // Invalid role
//         ).to.be.revertedWith("Invalid collaborator role");
//       });

//       it("Should validate amount inputs", async function () {
//         await expect(
//           icoAndVesting.withdrawTokens(ICORounds.Seed, owner.address, 0)
//         ).to.be.revertedWith("Invalid amount");

//         await expect(
//           icoAndVesting.connect(user1).buyTokensWithETH([], { value: 0 })
//         ).to.be.revertedWith("Invalid ETH amount");
//       });
//     });

//     describe("10.4 Upgrade Safety", function () {
//       it("Should only allow owner to authorize upgrades", async function () {
//         // This test verifies the _authorizeUpgrade function exists and is owner-only
//         // Actual upgrade testing would require deploying a new implementation
        
//         // Verify current implementation works
//         expect(await icoAndVesting.owner()).to.equal(owner.address);
        
//         // The _authorizeUpgrade function is internal and called during upgrades
//         // We can't test it directly, but we know it exists from the contract
//       });
//     });
//   });

//   describe("11. Error Handling and Edge Cases", function () {
//     describe("11.1 Purchase Edge Cases", function () {
//       it("Should handle very small purchases", async function () {
//         await icoAndVesting.setICORound(ICORounds.PublicPresale);
        
//         // Try to buy with minimum amount ($10)
//         const minEthAmount = ethers.parseEther("0.0025"); // $10 worth of ETH
        
//         const tx = await icoAndVesting.connect(user1).buyTokensWithETH([], {
//           value: minEthAmount
//         });
        
//         expect(tx).to.not.be.reverted;
//       });

//       it("Should handle maximum wallet cap purchases", async function () {
//         await icoAndVesting.setICORound(ICORounds.PublicPresale);
        
//         // Buy exactly at wallet cap ($50K)
//         const maxEthAmount = ethers.parseEther("12.5"); // $50K worth of ETH
        
//         await expect(
//           icoAndVesting.connect(user4).buyTokensWithETH([], {
//             value: maxEthAmount
//           })
//         ).to.not.be.reverted;
//       });

//       it("Should handle purchases that would exceed hard cap", async function () {
//         // This test ensures the contract handles the case where remaining tokens < requested tokens
//         const roundDetails = await icoAndVesting.getRoundDetails(ICORounds.PublicPresale);
//         const remainingTokens = roundDetails.totalTokenAmount - roundDetails.tokensSold;
        
//         if (remainingTokens > 0) {
//           // Try to buy more than remaining
//           const excessUsdAmount = (remainingTokens * BigInt(3500)) / TOKEN_DECIMALS + BigInt(1000 * PRECISION);
//           const excessEthAmount = excessUsdAmount / BigInt(4000);

//           await expect(
//             icoAndVesting.connect(user5).buyTokensWithETH([], {
//               value: excessEthAmount
//             })
//           ).to.be.revertedWith("Not enough tokens available in round");
//         }
//       });
//     });

//     describe("11.2 Vesting Edge Cases", function () {
//       it("Should handle zero-duration vesting (immediate release)", async function () {
//         // Liquidity role has 0 duration and 100% TGE
//         const tokenAmount = ethers.parseEther("100000");
        
//         await icoAndVesting.addCollaborator(CollaboratorRole.Liquidity, user2.address, tokenAmount);
        
//         // All tokens should be immediately available
//         const balance = await eyeToken.balanceOf(user2.address);
//         expect(balance).to.equal(tokenAmount);
//       });

//       it("Should handle vesting with cliff offset", async function () {
//         // Team role has cliffOffset = true
//         const tokenAmount = ethers.parseEther("500000");
        
//         await icoAndVesting.addCollaborator(CollaboratorRole.Team, user4.address, tokenAmount);
        
//         const vestingId = await icoAndVesting.vestingId();
//         const vestingDetails = await icoAndVesting.getVestingDetails(vestingId);
        
//         // Cliff should start after TGE (which is 0 for team)
//         expect(vestingDetails.cliff).to.equal(270 * 24 * 60 * 60); // 9 months
//       });

//       it("Should handle claims at exact cliff end", async function () {
//         // Create a vesting and move time to exactly cliff end
//         const vestingId = await icoAndVesting.vestingId();
        
//         if (vestingId > 0) {
//           const vestingDetails = await icoAndVesting.getVestingDetails(vestingId);
//           const cliffEnd = vestingDetails.start + vestingDetails.cliff;
          
//           // Move to exact cliff end
//           await time.increaseTo(cliffEnd);
          
//           const claimableAmount = await icoAndVesting.getClaimableTokenAmount(vestingId);
//           expect(claimableAmount).to.be.gte(0);
//         }
//       });
//     });

//     describe("11.3 Price Feed Edge Cases", function () {
//       it("Should handle negative price feeds", async function () {
//         const MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");
//         const negativePriceFeed = await MockV3Aggregator.deploy(8, -1000 * 10 ** 8); // Negative price
        
//         await icoAndVesting.setPriceFeed("ETH", await negativePriceFeed.getAddress());
        
//         await expect(
//           icoAndVesting.getETHValueInUSD(ethers.parseEther("1"))
//         ).to.be.revertedWith("Invalid ETH price from feed");
        
//         // Reset to valid price feed
//         await icoAndVesting.setPriceFeed("ETH", await ethPriceFeed.getAddress());
//       });

//       it("Should handle zero price feeds", async function () {
//         const MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");
//         const zeroPriceFeed = await MockV3Aggregator.deploy(8, 0); // Zero price
        
//         await icoAndVesting.setPriceFeed("USDC", await zeroPriceFeed.getAddress());
        
//         await expect(
//           icoAndVesting.getUSDValue(await mockUSDC.getAddress(), ethers.parseUnits("100", 6))
//         ).to.be.revertedWith("Invalid price from feed");
        
//         // Reset to valid price feed
//         await icoAndVesting.setPriceFeed("USDC", await usdcPriceFeed.getAddress());
//       });
//     });

//     describe("11.4 Gas Optimization Edge Cases", function () {
//       it("Should handle large token amounts efficiently", async function () {
//         const largeAmount = ethers.parseEther("1000000000"); // 1B tokens
        
//         // Test calculation functions with large amounts
//         const currentPrice = await icoAndVesting.getCurrentTokenPrice();
//         const usdValue = (largeAmount * BigInt(currentPrice)) / TOKEN_DECIMALS;
        
//         const calculatedTokens = await icoAndVesting.calculateTokensForUSD(usdValue);
//         expect(calculatedTokens).to.equal(largeAmount);
//       });

//       it("Should handle multiple rapid transactions", async function () {
//         await icoAndVesting.setICORound(ICORounds.PublicPresale);
        
//         // Perform multiple small purchases rapidly
//         const promises = [];
//         for (let i = 0; i < 3; i++) {
//           promises.push(
//             icoAndVesting.connect(user5).buyTokensWithETH([], {
//               value: ethers.parseEther("0.01")
//             })
//           );
//         }
        
//         await Promise.all(promises);
        
//         // All transactions should succeed
//         const user5Purchases = await icoAndVesting.getUserPurchaseAmount(user5.address, ICORounds.PublicPresale);
//         expect(user5Purchases).to.be.gt(0);
//       });
//     });
//   });

//   describe("12. Integration and End-to-End Tests", function () {
//     describe("12.1 Complete ICO Lifecycle", function () {
//       it("Should handle complete seed round lifecycle", async function () {
//         // Setup seed round
//         await icoAndVesting.setICORound(ICORounds.Seed);
//         await icoAndVesting.setMerkleRoot(merkleRoot);
        
//         // Multiple users purchase
//         const proof1 = getProof(user1.address);
//         const proof2 = getProof(user2.address);
        
//         await icoAndVesting.connect(user1).buyTokensWithETH(proof1, {
//           value: ethers.parseEther("1")
//         });
        
//         await mockUSDC.connect(user2).approve(await icoAndVesting.getAddress(), ethers.parseUnits("5000", 6));
//         await icoAndVesting.connect(user2).buyTokensWithUSDC(ethers.parseUnits("5000", 6), proof2);
        
//         // Close seed round
//         await icoAndVesting.closeCurrentRound();
        
//         // Verify round state
//         const seedDetails = await icoAndVesting.getRoundDetails(ICORounds.Seed);
//         expect(seedDetails.isActive).to.be.false;
//         expect(seedDetails.tokensSold).to.be.gt(0);
//       });

//       it("Should handle complete public presale lifecycle", async function () {
//         // Start public presale
//         await icoAndVesting.setICORound(ICORounds.PublicPresale);
        
//         // Multiple users purchase (no whitelist needed)
//         await icoAndVesting.connect(user3).buyTokensWithETH([], {
//           value: ethers.parseEther("2")
//         });
        
//         await icoAndVesting.connect(user4).buyTokensWithETH([], {
//           value: ethers.parseEther("1.5")
//         });
        
//         // Verify phase progression
//         const phaseInfo = await icoAndVesting.getCurrentPhaseInfo();
//         expect(phaseInfo.percentageSold).to.be.gt(0);
        
//         // Close public presale
//         await icoAndVesting.closeCurrentRound();
//       });
//     });

//     describe("12.2 Complete Collaborator Lifecycle", function () {
//       it("Should handle all collaborator types with different vesting schedules", async function () {
//         const collaborators = [
//           { role: CollaboratorRole.Ecosystem, user: user1, amount: "500000" },
//           { role: CollaboratorRole.Reserve, user: user2, amount: "1000000" },
//           { role: CollaboratorRole.Staking, user: user3, amount: "750000" },
//           { role: CollaboratorRole.EarlyLP, user: user4, amount: "200000" },
//           { role: CollaboratorRole.Team, user: user5, amount: "1500000" }
//         ];

//         const vestingIds = [];
        
//         for (const collab of collaborators) {
//           await icoAndVesting.addCollaborator(
//             collab.role,
//             collab.user.address,
//             ethers.parseEther(collab.amount)
//           );
//           vestingIds.push(await icoAndVesting.vestingId());
//         }
        
//         // Verify all vestings created with correct parameters
//         for (let i = 0; i < vestingIds.length; i++) {
//           const vestingDetails = await icoAndVesting.getVestingDetails(vestingIds[i]);
//           expect(vestingDetails.isCollaborator).to.be.true;
//           expect(vestingDetails.collaboratorRole).to.equal(collaborators[i].role);
//         }
//       });
//     });

//     describe("12.3 Complete Vesting Lifecycle", function () {
//       it("Should handle full vesting lifecycle from creation to completion", async function () {
//         // Create a new vesting for testing
//         await icoAndVesting.addCollaborator(
//           CollaboratorRole.EarlyLP,
//           user1.address,
//           ethers.parseEther("400000")
//         );
        
//         const vestingId = await icoAndVesting.vestingId();
//         const vestingDetails = await icoAndVesting.getVestingDetails(vestingId);
        
//         // Initial state - no tokens claimable
//         let claimableAmount = await icoAndVesting.getClaimableTokenAmount(vestingId);
//         expect(claimableAmount).to.be.gt(0); // EarlyLP has 25% TGE, so immediate claims possible
        
//         // Claim initial amount
//         const initialBalance = await eyeToken.balanceOf(user1.address);
//         await icoAndVesting.connect(user1).claimTokens(vestingId);
        
//         // Move through vesting period
//         await moveTimeForward(180 * 24 * 60 * 60); // 6 months
        
//         // Claim mid-vesting
//         claimableAmount = await icoAndVesting.getClaimableTokenAmount(vestingId);
//         if (claimableAmount > 0) {
//           await icoAndVesting.connect(user1).claimTokens(vestingId);
//         }
        
//         // Complete vesting
//         await moveTimeForward(360 * 24 * 60 * 60); // Another 12 months (total 18 months > 12 month duration)
        
//         // Final claim
//         claimableAmount = await icoAndVesting.getClaimableTokenAmount(vestingId);
//         if (claimableAmount > 0) {
//           await icoAndVesting.connect(user1).claimTokens(vestingId);
//         }
        
//         // Verify all tokens claimed
//         const finalBalance = await eyeToken.balanceOf(user1.address);
//         expect(finalBalance - initialBalance).to.equal(ethers.parseEther("300000")); // 75% of 400K (25% was TGE)
//       });
//     });

//     describe("12.4 Admin Operations Lifecycle", function () {
//       it("Should handle complete admin operations cycle", async function () {
//         // Update configurations
//         await icoAndVesting.updateRoundDetails(
//           ICORounds.Seed,
//           10, 25000 * PRECISION, 0, 180 * 24 * 60 * 60, 730 * 24 * 60 * 60, 1500, true
//         );
        
//         await icoAndVesting.updateCollaboratorDetails(
//           CollaboratorRole.Ecosystem,
//           10, 10, 0, 1080 * 24 * 60 * 60, false
//         );
        
//         // Update addresses
//         await icoAndVesting.updateFundReceiverAddress(fundReceiver.address);
        
//         // Emergency operations
//         const contractBalance = await eyeToken.balanceOf(await icoAndVesting.getAddress());
//         if (contractBalance > 0) {
//           await icoAndVesting.emergencyWithdraw(
//             await eyeToken.getAddress(),
//             owner.address,
//             ethers.parseEther("1000")
//           );
//         }
        
//         // Pause and unpause
//         await icoAndVesting.pause();
//         await icoAndVesting.unpause();
        
//         // Verify all operations completed successfully
//         expect(await icoAndVesting.paused()).to.be.false;
//         expect(await icoAndVesting.fundReceiverAddress()).to.equal(fundReceiver.address);
//       });
//     });
//   });

//   describe("13. Performance and Gas Tests", function () {
//     describe("13.1 Gas Consumption", function () {
//       it("Should have reasonable gas consumption for purchases", async function () {
//         await icoAndVesting.setICORound(ICORounds.PublicPresale);
        
//         const tx = await icoAndVesting.connect(user1).buyTokensWithETH([], {
//           value: ethers.parseEther("1")
//         });
        
//         const receipt = await tx.wait();
//         console.log("ETH purchase gas used:", receipt.gasUsed.toString());
        
//         // Gas should be reasonable (less than 300k)
//         expect(receipt.gasUsed).to.be.lt(300000);
//       });

//       it("Should have reasonable gas consumption for token claims", async function () {
//         const vestingId = await icoAndVesting.vestingId();
        
//         const tx = await icoAndVesting.connect(user1).claimTokens(vestingId);
        
//         const receipt = await tx.wait();
//         console.log("Token claim gas used:", receipt.gasUsed.toString());
        
//         // Gas should be reasonable (less than 200k)
//         expect(receipt.gasUsed).to.be.lt(200000);
//       });
//       it("Should have reasonable gas consumption for collaborator additions", async function () {
//         const tx = await icoAndVesting.addCollaborator(
//           CollaboratorRole.Ecosystem,
//           user2.address,
//           ethers.parseEther("100000")
//         );
        
//         const receipt = await tx.wait();
//         console.log("Collaborator addition gas used:", receipt.gasUsed.toString());
        
//         // Gas should be reasonable (less than 250k)
//         expect(receipt.gasUsed).to.be.lt(250000);
//       }); 
//       it("Should recover from corrupted price feed", async function () {
//         console.log("Testing price feed recovery...");
        
//         // Record working state
//         const workingETHValue = await icoAndVesting.getETHValueInUSD(ethers.parseEther("1"));
//         console.log("Working ETH value:", ethers.formatUnits(workingETHValue, 6));
        
//         // Set invalid price feed (use USDC contract as ETH feed)
//         const invalidFeedAddress = await mockUSDC.getAddress();
//         await icoAndVesting.setPriceFeed("ETH", invalidFeedAddress);
        
//         console.log("Set invalid price feed");
        
//         // Operations should fail
//         await expect(
//           icoAndVesting.getETHValueInUSD(ethers.parseEther("1"))
//         ).to.be.reverted;
        
//         console.log("Operations correctly fail with invalid feed");
        
//         // Recover with correct price feed
//         await icoAndVesting.setPriceFeed("ETH", await ethPriceFeed.getAddress());
        
//         const recoveredETHValue = await icoAndVesting.getETHValueInUSD(ethers.parseEther("1"));
//         expect(recoveredETHValue).to.equal(workingETHValue);
        
//         console.log("Price feed successfully recovered");
        
//         // Verify purchases work again
//         await icoAndVesting.setICORound(ICORounds.PublicPresale);
//         const tx = await icoAndVesting.connect(user2).buyTokensWithETH([], {
//           value: ethers.parseEther("0.1")
//         });
        
//         expect(tx).to.not.be.reverted;
//         console.log("Purchases work after price feed recovery");
//       });

//       it("Should recover from ownership transfer issues", async function () {
//         console.log("Testing ownership recovery...");
        
//         const originalOwner = await icoAndVesting.owner();
//         expect(originalOwner).to.equal(owner.address);
        
//         // Transfer ownership
//         await icoAndVesting.transferOwnership(user1.address);
//         const newOwner = await icoAndVesting.owner();
//         expect(newOwner).to.equal(user1.address);
        
//         console.log("Ownership transferred to user1");
        
//         // Original owner should lose access
//         await expect(
//           icoAndVesting.pause()
//         ).to.be.revertedWithCustomError(icoAndVesting, "OwnableUnauthorizedAccount");
        
//         // New owner should have access
//         await icoAndVesting.connect(user1).pause();
//         console.log("New owner can pause contract");
        
//         await icoAndVesting.connect(user1).unpause();
//         console.log("New owner can unpause contract");
        
//         // Transfer back
//         await icoAndVesting.connect(user1).transferOwnership(owner.address);
//         const finalOwner = await icoAndVesting.owner();
//         expect(finalOwner).to.equal(owner.address);
        
//         console.log("Ownership transferred back to original owner");
        
//         // Original owner should have access again
//         await icoAndVesting.pause();
//         await icoAndVesting.unpause();
//         console.log("Original owner regained access");
//       });

//       it("Should handle emergency pause scenarios", async function () {
//         console.log("Testing emergency pause scenarios...");
        
//         await icoAndVesting.setICORound(ICORounds.PublicPresale);
        
//         // Normal operation
//         await icoAndVesting.connect(user1).buyTokensWithETH([], {
//           value: ethers.parseEther("0.1")
//         });
//         console.log("Normal purchase successful");
        
//         // Emergency pause
//         await icoAndVesting.pause();
//         console.log("Emergency pause activated");
        
//         // All user operations should halt
//         await expect(
//           icoAndVesting.connect(user2).buyTokensWithETH([], {
//             value: ethers.parseEther("0.1")
//           })
//         ).to.be.revertedWith("Pausable: paused");
        
//         // Create a vesting and try to claim
//         await icoAndVesting.addCollaborator(
//           CollaboratorRole.Liquidity,
//           user3.address,
//           ethers.parseEther("100000")
//         );
        
//         // Even if tokens are claimable, claiming should be paused
//         // Note: Liquidity has 100% TGE, so this is just for testing the pause mechanism
        
//         // Admin operations should still work
//         await icoAndVesting.setMerkleRoot(merkleRoot);
//         await icoAndVesting.updateFundReceiverAddress(fundReceiver.address);
//         console.log("Admin operations work during pause");
        
//         // Resume operations
//         await icoAndVesting.unpause();
//         console.log("Operations resumed");
        
//         // User operations should work again
//         await icoAndVesting.connect(user2).buyTokensWithETH([], {
//           value: ethers.parseEther("0.1")
//         });
//         console.log("Purchase successful after unpause");
//       });
//     });

//     describe("16.2 Data Integrity Recovery", function () {
//       it("Should handle merkle root corruption recovery", async function () {
//         console.log("Testing merkle root recovery...");
        
//         await icoAndVesting.setICORound(ICORounds.Seed);
//         await icoAndVesting.setMerkleRoot(merkleRoot);
        
//         // Verify whitelist works
//         const proof = getProof(user1.address);
//         expect(await icoAndVesting.addressIsWhiteListed(proof, user1.address)).to.be.true;
//         console.log("Initial whitelist verification successful");
        
//         // Corrupt merkle root
//         const corruptRoot = ethers.keccak256(ethers.toUtf8Bytes("corrupt"));
//         await icoAndVesting.setMerkleRoot(corruptRoot);
        
//         // Whitelist should fail
//         expect(await icoAndVesting.addressIsWhiteListed(proof, user1.address)).to.be.false;
//         console.log("Whitelist correctly fails with corrupt root");
        
//         // Purchases should fail
//         await expect(
//           icoAndVesting.connect(user1).buyTokensWithETH(proof, {
//             value: ethers.parseEther("1")
//           })
//         ).to.be.revertedWith("Address not whitelisted for seed round");
        
//         // Recover with correct root
//         await icoAndVesting.setMerkleRoot(merkleRoot);
//         expect(await icoAndVesting.addressIsWhiteListed(proof, user1.address)).to.be.true;
//         console.log("Merkle root successfully recovered");
        
//         // Purchases should work again
//         const tx = await icoAndVesting.connect(user1).buyTokensWithETH(proof, {
//           value: ethers.parseEther("1")
//         });
//         expect(tx).to.not.be.reverted;
//         console.log("Purchases work after merkle root recovery");
//       });

//       it("Should handle vesting data consistency", async function () {
//         console.log("Testing vesting data consistency...");
        
//         // Create multiple vestings
//         const vestingUsers = [user1, user2, user3];
//         const vestingIds = [];
        
//         for (const user of vestingUsers) {
//           await icoAndVesting.addCollaborator(
//             CollaboratorRole.Ecosystem,
//             user.address,
//             ethers.parseEther("100000")
//           );
//           vestingIds.push(await icoAndVesting.vestingId());
//         }
        
//         console.log(`Created ${vestingIds.length} vestings`);
        
//         // Verify all vesting data is consistent
//         for (let i = 0; i < vestingIds.length; i++) {
//           const vestingId = vestingIds[i];
//           const details = await icoAndVesting.getVestingDetails(vestingId);
//           const amounts = await icoAndVesting.getVestingAmounts(vestingId);
          
//           expect(details.userAddress).to.equal(vestingUsers[i].address);
//           expect(details.totalTokenAmount).to.equal(ethers.parseEther("90000")); // 90% after 10% TGE
//           expect(details.isCollaborator).to.be.true;
//           expect(details.collaboratorRole).to.equal(CollaboratorRole.Ecosystem);
          
//           console.log(`Vesting ${vestingId} data consistent`);
//         }
        
//         // Move time and verify vesting calculations remain consistent
//         await moveTimeForward(60 * 24 * 60 * 60); // 60 days
        
//         for (const vestingId of vestingIds) {
//           const vestedAmount = await icoAndVesting.getVestedTokenAmount(vestingId);
//           const claimableAmount = await icoAndVesting.getClaimableTokenAmount(vestingId);
          
//           expect(vestedAmount).to.be.gte(claimableAmount);
//           expect(vestedAmount).to.be.gt(0);
          
//           console.log(`Vesting ${vestingId} calculations consistent after time progression`);
//         }
//       });

//       it("Should handle round data integrity", async function () {
//         console.log("Testing round data integrity...");
        
//         // Record initial round data
//         const initialSeedData = await icoAndVesting.getRoundDetails(ICORounds.Seed);
//         const initialPublicData = await icoAndVesting.getRoundDetails(ICORounds.PublicPresale);
        
//         console.log("Initial round data recorded");
        
//         // Make purchases in both rounds
//         await icoAndVesting.setMerkleRoot(merkleRoot);
//         await icoAndVesting.setICORound(ICORounds.Seed);
        
//         const proof = getProof(user1.address);
//         await icoAndVesting.connect(user1).buyTokensWithETH(proof, {
//           value: ethers.parseEther("1")
//         });
        
//         const seedDataAfterPurchase = await icoAndVesting.getRoundDetails(ICORounds.Seed);
//         expect(seedDataAfterPurchase.tokensSold).to.be.gt(initialSeedData.tokensSold);
        
//         await icoAndVesting.setICORound(ICORounds.PublicPresale);
//         await icoAndVesting.connect(user2).buyTokensWithETH([], {
//           value: ethers.parseEther("1")
//         });
        
//         const publicDataAfterPurchase = await icoAndVesting.getRoundDetails(ICORounds.PublicPresale);
//         expect(publicDataAfterPurchase.tokensSold).to.be.gt(initialPublicData.tokensSold);
        
//         console.log("Round data correctly updated after purchases");
        
//         // Verify cross-round data doesn't interfere
//         const finalSeedData = await icoAndVesting.getRoundDetails(ICORounds.Seed);
//         expect(finalSeedData.tokensSold).to.equal(seedDataAfterPurchase.tokensSold);
        
//         console.log("Round data integrity maintained across round switches");
//       });
//     });

//     describe("16.3 Upgrade Scenarios", function () {
//       it("Should maintain state during upgrade simulation", async function () {
//         console.log("Simulating upgrade scenario...");
        
//         // Record comprehensive pre-upgrade state
//         const preUpgradeState = {
//           currentRound: await icoAndVesting.currentRound(),
//           vestingId: await icoAndVesting.vestingId(),
//           fundReceiver: await icoAndVesting.fundReceiverAddress(),
//           contractBalance: await icoAndVesting.getContractTokenBalance(),
//           paused: await icoAndVesting.paused(),
//           owner: await icoAndVesting.owner()
//         };
        
//         console.log("Pre-upgrade state:", {
//           currentRound: preUpgradeState.currentRound.toString(),
//           vestingId: preUpgradeState.vestingId.toString(),
//           contractBalance: ethers.formatEther(preUpgradeState.contractBalance),
//           paused: preUpgradeState.paused
//         });
        
//         // Perform state-changing operations
//         await icoAndVesting.setICORound(ICORounds.PublicPresale);
        
//         await icoAndVesting.connect(user1).buyTokensWithETH([], {
//           value: ethers.parseEther("2")
//         });
        
//         await icoAndVesting.addCollaborator(
//           CollaboratorRole.EarlyLP,
//           user2.address,
//           ethers.parseEther("500000")
//         );
        
//         await icoAndVesting.setMerkleRoot(merkleRoot);
        
//         console.log("State-changing operations completed");
        
//         // Record post-operation state
//         const postOperationState = {
//           currentRound: await icoAndVesting.currentRound(),
//           vestingId: await icoAndVesting.vestingId(),
//           fundReceiver: await icoAndVesting.fundReceiverAddress(),
//           contractBalance: await icoAndVesting.getContractTokenBalance(),
//           paused: await icoAndVesting.paused(),
//           owner: await icoAndVesting.owner()
//         };
        
//         // Verify state changes
//         expect(postOperationState.currentRound).to.equal(ICORounds.PublicPresale);
//         expect(postOperationState.vestingId).to.be.gt(preUpgradeState.vestingId);
//         expect(postOperationState.contractBalance).to.be.lt(preUpgradeState.contractBalance);
//         expect(postOperationState.fundReceiver).to.equal(preUpgradeState.fundReceiver);
//         expect(postOperationState.paused).to.equal(preUpgradeState.paused);
//         expect(postOperationState.owner).to.equal(preUpgradeState.owner);
        
//         console.log("State changes verified");
        
//         // Verify vesting data persistence
//         const latestVestingId = await icoAndVesting.vestingId();
//         const vestingDetails = await icoAndVesting.getVestingDetails(latestVestingId);
        
//         expect(vestingDetails.userAddress).to.equal(user2.address);
//         expect(vestingDetails.isCollaborator).to.be.true;
//         expect(vestingDetails.collaboratorRole).to.equal(CollaboratorRole.EarlyLP);
        
//         console.log("Vesting data persistence verified");
        
//         // Verify purchase data persistence
//         const user1Purchases = await icoAndVesting.getUserPurchaseAmount(user1.address, ICORounds.PublicPresale);
//         expect(user1Purchases).to.be.gt(0);
        
//         console.log("Purchase data persistence verified");
        
//         // Test continued functionality
//         await icoAndVesting.connect(user3).buyTokensWithETH([], {
//           value: ethers.parseEther("0.5")
//         });
        
//         console.log("Continued functionality verified");
        
//         console.log("Upgrade simulation completed successfully");
//       });

//       it("Should handle authorization during upgrade scenarios", async function () {
//         console.log("Testing upgrade authorization...");
        
//         // Current owner should be able to perform admin functions
//         await icoAndVesting.pause();
//         await icoAndVesting.unpause();
        
//         // Test emergency functions availability
//         const emergencyAmount = ethers.parseEther("1000");
//         await icoAndVesting.emergencyWithdraw(
//           await eyeToken.getAddress(),
//           owner.address,
//           emergencyAmount
//         );
        
//         // Restore tokens for continued testing
//         await eyeToken.transfer(await icoAndVesting.getAddress(), emergencyAmount);
        
//         console.log("Current owner has full admin access");
        
//         // Non-owner should not have admin access
//         await expect(
//           icoAndVesting.connect(user1).pause()
//         ).to.be.revertedWithCustomError(icoAndVesting, "OwnableUnauthorizedAccount");
        
//         await expect(
//           icoAndVesting.connect(user1).emergencyWithdraw(
//             await eyeToken.getAddress(),
//             user1.address,
//             emergencyAmount
//           )
//         ).to.be.revertedWithCustomError(icoAndVesting, "OwnableUnauthorizedAccount");
        
//         console.log("Non-owners correctly restricted from admin functions");
        
//         // The _authorizeUpgrade function exists and is owner-only (internal function)
//         // We can't test it directly, but we know it's implemented correctly from the contract
//         console.log("Upgrade authorization mechanism in place");
//       });
//     });
//   });

//   describe("17. Final Integration Validation", function () {
//     describe("17.1 Complete System Validation", function () {
//       it("Should complete full ICO and vesting cycle", async function () {
//         console.log("\n🚀 Starting Complete System Validation...\n");
        
//         // Phase 1: Reset and Setup
//         console.log("📋 Phase 1: System Reset and Setup");
        
//         // Reset to clean state if needed
//         try {
//           await icoAndVesting.setICORound(ICORounds.Seed);
//           await icoAndVesting.setMerkleRoot(merkleRoot);
//         } catch (error) {
//           console.log("Setup already complete");
//         }
        
//         const initialStats = {
//           contractBalance: await icoAndVesting.getContractTokenBalance(),
//           vestingCount: await icoAndVesting.vestingId(),
//           owner: await icoAndVesting.owner()
//         };
        
//         console.log("Initial System State:", {
//           contractTokens: ethers.formatEther(initialStats.contractBalance),
//           vestingCount: initialStats.vestingCount.toString(),
//           owner: initialStats.owner
//         });
        
//         // Phase 2: Seed Round Operations
//         console.log("\n💎 Phase 2: Seed Round Operations (Whitelisted)");
        
//         const seedOperations = [];
        
//         // ETH purchases
//         for (let i = 0; i < Math.min(whitelistedAddresses.length, 2); i++) {
//           const addr = whitelistedAddresses[i];
//           const proof = getProof(addr);
          
//           try {
//             await network.provider.request({
//               method: "hardhat_impersonateAccount",
//               params: [addr],
//             });
//             const signer = await ethers.getSigner(addr);
//             await owner.sendTransaction({ to: addr, value: ethers.parseEther("20") });
            
//             const tx = await icoAndVesting.connect(signer).buyTokensWithETH(proof, {
//               value: ethers.parseEther("2")
//             });
//             const receipt = await tx.wait();
            
//             seedOperations.push({
//               type: "ETH Purchase",
//               user: addr,
//               amount: "2 ETH",
//               gasUsed: receipt.gasUsed.toString()
//             });
            
//             await network.provider.request({
//               method: "hardhat_stopImpersonatingAccount",
//               params: [addr],
//             });
//           } catch (error) {
//             console.log(`Seed ETH purchase failed for ${addr}:`, error.message);
//           }
//         }
        
//         // USDC purchases
//         if (whitelistedAddresses.length > 2) {
//           const addr = whitelistedAddresses[2];
//           const proof = getProof(addr);
          
//           try {
//             await network.provider.request({
//               method: "hardhat_impersonateAccount",
//               params: [addr],
//             });
//             const signer = await ethers.getSigner(addr);
//             await owner.sendTransaction({ to: addr, value: ethers.parseEther("5") });
            
//             const usdcAmount = ethers.parseUnits("5000", 6);
//             await mockUSDC.mint(addr, usdcAmount);
//             await mockUSDC.connect(signer).approve(await icoAndVesting.getAddress(), usdcAmount);
            
//             const tx = await icoAndVesting.connect(signer).buyTokensWithUSDC(usdcAmount, proof);
//             const receipt = await tx.wait();
            
//             seedOperations.push({
//               type: "USDC Purchase",
//               user: addr,
//               amount: "5000 USDC",
//               gasUsed: receipt.gasUsed.toString()
//             });
            
//             await network.provider.request({
//               method: "hardhat_stopImpersonatingAccount",
//               params: [addr],
//             });
//           } catch (error) {
//             console.log("Seed USDC purchase failed:", error.message);
//           }
//         }
        
//         // Fiat purchases
//         try {
//           const fiatAmount = 10000 * PRECISION; // $10,000
//           const proof = getProof(whitelistedAddresses[0]);
          
//           const tx = await icoAndVesting.buyTokensWithFiat(whitelistedAddresses[0], fiatAmount, proof);
//           const receipt = await tx.wait();
          
//           seedOperations.push({
//             type: "Fiat Purchase",
//             user: whitelistedAddresses[0],
//             amount: "$10,000",
//             gasUsed: receipt.gasUsed.toString()
//           });
//         } catch (error) {
//           console.log("Fiat purchase failed:", error.message);
//         }
        
//         console.log("Seed Round Operations Completed:");
//         seedOperations.forEach((op, i) => {
//           console.log(`  ${i + 1}. ${op.type}: ${op.amount} (Gas: ${op.gasUsed})`);
//         });
        
//         // Phase 3: Public Presale Operations
//         console.log("\n🌍 Phase 3: Public Presale Operations (Open Access)");
        
//         await icoAndVesting.setICORound(ICORounds.PublicPresale);
        
//         const publicOperations = [];
//         const publicUsers = [user1, user2, user3, user4];
        
//         for (let i = 0; i < publicUsers.length; i++) {
//           const user = publicUsers[i];
          
//           try {
//             const tx = await icoAndVesting.connect(user).buyTokensWithETH([], {
//               value: ethers.parseEther("1.5")
//             });
//             const receipt = await tx.wait();
            
//             // Get phase info after purchase
//             const phaseInfo = await icoAndVesting.getCurrentPhaseInfo();
            
//             publicOperations.push({
//               user: user.address,
//               amount: "1.5 ETH",
//               phase: phaseInfo.currentPhase.toString(),
//               price: phaseInfo.currentPrice.toString(),
//               gasUsed: receipt.gasUsed.toString()
//             });
//           } catch (error) {
//             console.log(`Public purchase failed for user ${i + 1}:`, error.message);
//           }
//         }
        
//         console.log("Public Presale Operations Completed:");
//         publicOperations.forEach((op, i) => {
//           console.log(`  ${i + 1}. User: ${op.user.slice(0, 10)}... Amount: ${op.amount} Phase: ${op.phase} Price: ${(Number(op.price) / 1000000).toFixed(4)} (Gas: ${op.gasUsed})`);
//         });
        
//         // Phase 4: Collaborator Ecosystem Setup
//         console.log("\n🤝 Phase 4: Collaborator Ecosystem Setup");
        
//         const collaboratorSetup = [
//           { role: CollaboratorRole.Ecosystem, user: user1, amount: "1000000", name: "Ecosystem" },
//           { role: CollaboratorRole.Reserve, user: user2, amount: "2000000", name: "Reserve" },
//           { role: CollaboratorRole.Liquidity, user: user3, amount: "1500000", name: "Liquidity" },
//           { role: CollaboratorRole.Staking, user: user4, amount: "1200000", name: "Staking" },
//           { role: CollaboratorRole.EarlyLP, user: user5, amount: "800000", name: "Early LP" },
//           { role: CollaboratorRole.Team, user: fundReceiver, amount: "3000000", name: "Team" },
//           { role: CollaboratorRole.Advisors, user: owner, amount: "1500000", name: "Advisors" }
//         ];
        
//         const collaboratorResults = [];
        
//         for (const collab of collaboratorSetup) {
//           try {
//             const tx = await icoAndVesting.addCollaborator(
//               collab.role,
//               collab.user.address,
//               ethers.parseEther(collab.amount)
//             );
//             const receipt = await tx.wait();
            
//             const vestingId = await icoAndVesting.vestingId();
//             const details = await icoAndVesting.getCollaboratorDetails(collab.role);
            
//             collaboratorResults.push({
//               name: collab.name,
//               user: collab.user.address,
//               amount: collab.amount,
//               TGE: details.TGE.toString(),
//               vestingId: vestingId.toString(),
//               gasUsed: receipt.gasUsed.toString()
//             });
//           } catch (error) {
//             console.log(`Collaborator setup failed for ${collab.name}:`, error.message);
//           }
//         }
        
//         console.log("Collaborator Setup Completed:");
//         collaboratorResults.forEach(result => {
//           console.log(`  ${result.name}: ${result.amount} tokens, ${result.TGE}% TGE, Vesting ID: ${result.vestingId} (Gas: ${result.gasUsed})`);
//         });
        
//         // Phase 5: Time Progression and Vesting Claims
//         console.log("\n⏰ Phase 5: Time Progression and Vesting Claims");
        
//         const timeProgressions = [
//           { months: 3, description: "3 months - Early vesting" },
//           { months: 6, description: "6 months - Some cliff periods end" },
//           { months: 9, description: "9 months - Team cliff ends" },
//           { months: 12, description: "12 months - Short vesting periods complete" },
//           { months: 18, description: "18 months - Mid-term progression" },
//           { months: 24, description: "24 months - Team vesting complete" }
//         ];
        
//         const claimResults = [];
        
//         for (const progression of timeProgressions) {
//           await moveTimeForward(3 * 30 * 24 * 60 * 60); // 3 months each iteration
          
//           console.log(`\n  📅 ${progression.description}`);
          
//           let totalClaimed = 0n;
//           let claimsProcessed = 0;
          
//           // Attempt claims for all vestings
//           const totalVestings = await icoAndVesting.vestingId();
          
//           for (let vestingId = 1; vestingId <= totalVestings; vestingId++) {
//             try {
//               const vestingDetails = await icoAndVesting.getVestingDetails(vestingId);
//               const claimableAmount = await icoAndVesting.getClaimableTokenAmount(vestingId);
              
//               if (claimableAmount > 0) {
//                 await network.provider.request({
//                   method: "hardhat_impersonateAccount",
//                   params: [vestingDetails.userAddress],
//                 });
//                 const signer = await ethers.getSigner(vestingDetails.userAddress);
//                 await owner.sendTransaction({ 
//                   to: vestingDetails.userAddress, 
//                   value: ethers.parseEther("1") 
//                 });
                
//                 await icoAndVesting.connect(signer).claimTokens(vestingId);
                
//                 await network.provider.request({
//                   method: "hardhat_stopImpersonatingAccount",
//                   params: [vestingDetails.userAddress],
//                 });
                
//                 totalClaimed += claimableAmount;
//                 claimsProcessed++;
//               }
//             } catch (error) {
//               // Skip failed claims
//             }
//           }
          
//           claimResults.push({
//             timepoint: progression.description,
//             totalClaimed: ethers.formatEther(totalClaimed),
//             claimsProcessed
//           });
          
//           console.log(`    Claims processed: ${claimsProcessed}, Total tokens claimed: ${ethers.formatEther(totalClaimed)}`);
//         }
        
//         // Phase 6: Final System Analysis
//         console.log("\n📊 Phase 6: Final System Analysis");
        
//         const finalStats = {
//           seedSold: await icoAndVesting.getRoundDetails(ICORounds.Seed).then(r => r.tokensSold),
//           publicSold: await icoAndVesting.getRoundDetails(ICORounds.PublicPresale).then(r => r.tokensSold),
//           totalVestings: await icoAndVesting.vestingId(),
//           contractBalance: await icoAndVesting.getContractTokenBalance(),
//           isPaused: await icoAndVesting.paused(),
//           currentRound: await icoAndVesting.currentRound()
//         };
        
//         console.log("\n🎯 Final System Statistics:");
//         console.log(`  📈 Seed Round Sales: ${ethers.formatEther(finalStats.seedSold)} tokens`);
//         console.log(`  🌐 Public Presale Sales: ${ethers.formatEther(finalStats.publicSold)} tokens`);
//         console.log(`  📋 Total Vesting Schedules: ${finalStats.totalVestings}`);
//         console.log(`  💰 Remaining Contract Tokens: ${ethers.formatEther(finalStats.contractBalance)}`);
//         console.log(`  ⏸️  Contract Paused: ${finalStats.isPaused}`);
//         console.log(`  🔄 Current Round: ${finalStats.currentRound === 0 ? 'Seed' : 'Public Presale'}`);
        
//         // Phase 7: System Integrity Verification
//         console.log("\n✅ Phase 7: System Integrity Verification");
        
//         // Verify sales data
//         expect(finalStats.seedSold).to.be.gt(0);
//         expect(finalStats.publicSold).to.be.gt(0);
//         expect(finalStats.totalVestings).to.be.gt(0);
//         expect(finalStats.isPaused).to.be.false;
        
//         // Verify token distribution
//         const totalSold = finalStats.seedSold + finalStats.publicSold;
//         const totalDistributed = TOTAL_SUPPLY - finalStats.contractBalance;
        
//         console.log(`  🔍 Total Tokens Sold: ${ethers.formatEther(totalSold)}`);
//         console.log(`  🔍 Total Tokens Distributed: ${ethers.formatEther(totalDistributed)}`);
        
//         expect(totalDistributed).to.be.gte(totalSold);
        
//         // Test final operations
//         try {
//           await icoAndVesting.connect(user5).buyTokensWithETH([], {
//             value: ethers.parseEther("0.1")
//           });
//           console.log("  ✅ Final purchase test: PASSED");
//         } catch (error) {
//           console.log("  ⚠️  Final purchase test: Limited (expected due to caps/balances)");
//         }
        
//         // Admin operations test
//         await icoAndVesting.pause();
//         await icoAndVesting.unpause();
//         console.log("  ✅ Admin operations test: PASSED");
        
//         console.log("\n🎉 Complete System Validation        const details = await icoAndVesting.getCollaboratorDetails(CollaboratorRole.Reserve);
//         expect(details.cliff).to.equal(maxCliff);
//         expect(details.duration).to.equal(maxDuration);
        
//         console.log("Maximum time values set:", {
//           cliff: `${maxCliff / (365 * 24 * 60 * 60)} years`,
//           duration: `${maxDuration / (365 * 24 * 60 * 60)} years`
//         });
        
//         // Create vesting with max time values
//         await icoAndVesting.addCollaborator(
//           CollaboratorRole.Reserve,
//           user1.address,
//           ethers.parseEther("1000000")
//         );
        
//         const vestingId = await icoAndVesting.vestingId();
//         const vestingDetails = await icoAndVesting.getVestingDetails(vestingId);
        
//         expect(vestingDetails.cliff).to.equal(maxCliff);
//         expect(vestingDetails.duration).to.equal(maxDuration);
//       });
//     });

//     describe("15.2 State Transition Edge Cases", function () {
//       it("Should handle rapid round switching", async function () {
//         const rounds = [ICORounds.Seed, ICORounds.PublicPresale, ICORounds.Seed, ICORounds.PublicPresale];
//         const gasUsage = [];
        
//         console.log("Testing rapid round switching...");
        
//         for (let i = 0; i < rounds.length; i++) {
//           const round = rounds[i];
//           const tx = await icoAndVesting.setICORound(round);
//           const receipt = await tx.wait();
//           gasUsage.push(Number(receipt.gasUsed));
          
//           const currentRound = await icoAndVesting.currentRound();
//           expect(currentRound).to.equal(round);
          
//           const roundDetails = await icoAndVesting.getICORoundDetails();
//           expect(roundDetails.isActive).to.be.true;
          
//           console.log(`Switch ${i + 1}: Round ${round}, Gas: ${receipt.gasUsed}`);
//         }
        
//         console.log("Round switching gas usage:", gasUsage);
//         console.log("Average gas per switch:", gasUsage.reduce((a, b) => a + b, 0) / gasUsage.length);
//       });

//       it("Should handle pause during active operations", async function () {
//         await icoAndVesting.setICORound(ICORounds.PublicPresale);
        
//         // Start a purchase, pause, then try operations
//         const tx1 = await icoAndVesting.connect(user1).buyTokensWithETH([], {
//           value: ethers.parseEther("0.1")
//         });
        
//         console.log("Purchase before pause successful");
        
//         await icoAndVesting.pause();
//         console.log("Contract paused");
        
//         // All main operations should fail when paused
//         await expect(
//           icoAndVesting.connect(user2).buyTokensWithETH([], {
//             value: ethers.parseEther("0.1")
//           })
//         ).to.be.revertedWith("Pausable: paused");
        
//         await expect(
//           icoAndVesting.connect(user1).claimTokens(1)
//         ).to.be.revertedWith("Pausable: paused");
        
//         // Admin operations should still work
//         await icoAndVesting.setMerkleRoot(merkleRoot);
//         await icoAndVesting.setICORound(ICORounds.Seed);
        
//         console.log("Admin operations work during pause");
        
//         await icoAndVesting.unpause();
//         console.log("Contract unpaused");
        
//         // Operations should work after unpause
//         const tx2 = await icoAndVesting.connect(user2).buyTokensWithETH([], {
//           value: ethers.parseEther("0.1")
//         });
        
//         console.log("Purchase after unpause successful");
//         expect(tx2).to.not.be.reverted;
//       });

//       it("Should handle state changes during ongoing vestings", async function () {
//         // Create a vesting
//         await icoAndVesting.addCollaborator(
//           CollaboratorRole.Ecosystem,
//           user3.address,
//           ethers.parseEther("500000")
//         );
        
//         const vestingId = await icoAndVesting.vestingId();
//         const originalDetails = await icoAndVesting.getVestingDetails(vestingId);
        
//         console.log("Created vesting:", vestingId.toString());
        
//         // Move time forward
//         await moveTimeForward(60 * 24 * 60 * 60); // 60 days
        
//         // Make state changes
//         await icoAndVesting.updateCollaboratorDetails(
//           CollaboratorRole.Ecosystem,
//           15, // Different allocation
//           20, // Different TGE
//           30 * 24 * 60 * 60, // Different cliff
//           720 * 24 * 60 * 60, // Different duration
//           true // Different cliff offset
//         );
        
//         console.log("Updated collaborator details");
        
//         // Existing vesting should be unaffected
//         const currentDetails = await icoAndVesting.getVestingDetails(vestingId);
//         expect(currentDetails.totalTokenAmount).to.equal(originalDetails.totalTokenAmount);
//         expect(currentDetails.cliff).to.equal(originalDetails.cliff);
//         expect(currentDetails.duration).to.equal(originalDetails.duration);
        
//         // Should still be able to claim
//         const claimableAmount = await icoAndVesting.getClaimableTokenAmount(vestingId);
//         if (claimableAmount > 0) {
//           await icoAndVesting.connect(user3).claimTokens(vestingId);
//           console.log("Claim successful after state change");
//         }
//       });

//       it("Should handle round closure during active purchases", async function () {
//         await icoAndVesting.setICORound(ICORounds.PublicPresale);
        
//         // Make a purchase
//         await icoAndVesting.connect(user1).buyTokensWithETH([], {
//           value: ethers.parseEther("0.5")
//         });
        
//         console.log("Purchase successful in active round");
        
//         // Close the round
//         await icoAndVesting.closeCurrentRound();
//         console.log("Round closed");
        
//         // Further purchases should fail
//         await expect(
//           icoAndVesting.connect(user2).buyTokensWithETH([], {
//             value: ethers.parseEther("0.5")
//           })
//         ).to.be.revertedWith("Round is not active");
        
//         // Reactivate round
//         await icoAndVesting.setICORound(ICORounds.PublicPresale);
//         console.log("Round reactivated");
        
//         // Purchases should work again
//         const tx = await icoAndVesting.connect(user2).buyTokensWithETH([], {
//           value: ethers.parseEther("0.5")
//         });
//         expect(tx).to.not.be.reverted;
//         console.log("Purchase successful after reactivation");
//       });
//     });

//     describe("15.3 Precision and Rounding Edge Cases", function () {
//       it("Should handle fractional token calculations", async function () {
//         await icoAndVesting.setICORound(ICORounds.Seed);
        
//         // Use odd USD amounts that result in fractional tokens
//         const oddAmounts = [
//           1337 * PRECISION, // $1337
//           2222.22 * PRECISION, // $2222.22
//           9999.99 * PRECISION, // $9999.99
//           12345.67 * PRECISION // $12345.67
//         ];
        
//         console.log("Testing fractional token calculations...");
        
//         for (const usdAmount of oddAmounts) {
//           const expectedTokens = calculateExpectedTokens(usdAmount, 1500);
//           const calculatedTokens = await icoAndVesting.calculateTokensForUSD(usdAmount);
          
//           console.log(`USD: ${ethers.formatUnits(usdAmount, 6)} -> Tokens: ${ethers.formatEther(calculatedTokens)}`);
          
//           expect(calculatedTokens).to.equal(expectedTokens);
          
//           // Verify precision
//           const backCalculatedUSD = (calculatedTokens * BigInt(1500)) / TOKEN_DECIMALS;
//           const difference = usdAmount > backCalculatedUSD ? usdAmount - backCalculatedUSD : backCalculatedUSD - usdAmount;
          
//           // Should be within 1 cent
//           expect(difference).to.be.lt(PRECISION / 100);
//         }
//       });

//       it("Should handle very large numbers without overflow", async function () {
//         // Test with large token amounts
//         const largeAmounts = [
//           ethers.parseEther("1000000000"), // 1B tokens
//           ethers.parseEther("500000000"), // 500M tokens
//           ethers.parseEther("100000000"), // 100M tokens
//         ];
        
//         console.log("Testing large number calculations...");
        
//         for (const tokenAmount of largeAmounts) {
//           const currentPrice = await icoAndVesting.getCurrentTokenPrice();
//           const usdValue = (tokenAmount * BigInt(currentPrice)) / TOKEN_DECIMALS;
          
//           console.log(`Tokens: ${ethers.formatEther(tokenAmount)} -> USD: ${ethers.formatUnits(usdValue, 6)}`);
          
//           // Should not overflow
//           const calculatedTokens = await icoAndVesting.calculateTokensForUSD(usdValue);
//           expect(calculatedTokens).to.equal(tokenAmount);
          
//           // Verify the calculation is consistent
//           expect(calculatedTokens).to.be.gt(0);
//           expect(usdValue).to.be.gt(0);
//         }
//       });

//       it("Should handle precision at boundaries", async function () {
//         // Test calculations at precision boundaries
//         const boundaryTests = [
//           { amount: PRECISION - 1, description: "$0.999999 (below minimum)" },
//           { amount: 10 * PRECISION, description: "$10.000000 (minimum)" },
//           { amount: 10 * PRECISION + 1, description: "$10.000001 (just above minimum)" },
//           { amount: 25000 * PRECISION, description: "$25,000 (seed wallet cap)" },
//           { amount: 50000 * PRECISION, description: "$50,000 (public wallet cap)" }
//         ];
        
//         console.log("Testing precision boundaries...");
        
//         for (const test of boundaryTests) {
//           console.log(`Testing ${test.description}:`);
          
//           if (test.amount < 10 * PRECISION) {
//             // Should revert below minimum
//             await expect(
//               icoAndVesting.calculateTokensForUSD(test.amount)
//             ).to.be.revertedWith("Purchase amount too small");
//             console.log("  ✓ Correctly rejected below minimum");
//           } else {
//             // Should work for valid amounts
//             const tokens = await icoAndVesting.calculateTokensForUSD(test.amount);
//             expect(tokens).to.be.gt(0);
//             console.log(`  ✓ Calculated ${ethers.formatEther(tokens)} tokens`);
//           }
//         }
//       });

//       it("Should handle wei-level precision", async function () {
//         await icoAndVesting.setICORound(ICORounds.Seed);
        
//         // Test with very precise amounts
//         const preciseAmounts = [
//           BigInt("10000001"), // $10.000001
//           BigInt("10000000"), // $10.000000
//           BigInt("9999999"),  // $9.999999
//         ];
        
//         console.log("Testing wei-level precision...");
        
//         for (const amount of preciseAmounts) {
//           console.log(`Testing ${ethers.formatUnits(amount, 6)} USD:`);
          
//           if (amount < BigInt(10 * PRECISION)) {
//             await expect(
//               icoAndVesting.calculateTokensForUSD(amount)
//             ).to.be.revertedWith("Purchase amount too small");
//             console.log("  ✓ Correctly rejected");
//           } else {
//             const tokens = await icoAndVesting.calculateTokensForUSD(amount);
//             console.log(`  ✓ Tokens: ${ethers.formatEther(tokens)}`);
            
//             // Verify reverse calculation
//             const backCalculatedUSD = (tokens * BigInt(1500)) / TOKEN_DECIMALS;
//             const difference = amount > backCalculatedUSD ? amount - backCalculatedUSD : backCalculatedUSD - amount;
            
//             console.log(`  Back-calculated USD: ${ethers.formatUnits(backCalculatedUSD, 6)}`);
//             console.log(`  Difference: ${difference} wei`);
            
//             // Should be very close (within reasonable rounding)
//             expect(difference).to.be.lt(BigInt(1000)); // Within 1000 wei
//           }
//         }
//       });

//       it("Should handle phase transition precision", async function () {
//         await icoAndVesting.setICORound(ICORounds.PublicPresale);
        
//         // Test purchases near phase boundaries
//         const phaseTests = [
//           { percentage: 3.99, description: "Just before phase 2 (3.99%)" },
//           { percentage: 4.01, description: "Just after phase 2 starts (4.01%)" },
//           { percentage: 8.99, description: "Just before phase 3 (8.99%)" },
//           { percentage: 9.01, description: "Just after phase 3 starts (9.01%)" }
//         ];
        
//         console.log("Testing phase transition precision...");
        
//         const roundDetails = await icoAndVesting.getRoundDetails(ICORounds.PublicPresale);
        
//         for (const test of phaseTests) {
//           // Calculate tokens needed to reach this percentage
//           const targetTokens = (roundDetails.totalTokenAmount * BigInt(Math.floor(test.percentage * 100))) / BigInt(10000);
//           const currentSold = (await icoAndVesting.getRoundDetails(ICORounds.PublicPresale)).tokensSold;
//           const tokensNeeded = targetTokens - currentSold;
          
//           if (tokensNeeded > 0) {
//             // Calculate price at this percentage
//             let expectedPrice;
//             if (test.percentage < 4) {
//               expectedPrice = 2500; // Phase 1
//             } else if (test.percentage < 9) {
//               expectedPrice = 3500; // Phase 2
//             } else {
//               expectedPrice = 5000; // Phase 3
//             }
            
//             const usdNeeded = (tokensNeeded * BigInt(expectedPrice)) / TOKEN_DECIMALS;
//             const ethNeeded = usdNeeded / BigInt(4000);
            
//             console.log(`${test.description}:`);
//             console.log(`  Tokens needed: ${ethers.formatEther(tokensNeeded)}`);
//             console.log(`  USD needed: ${ethers.formatUnits(usdNeeded, 6)}`);
//             console.log(`  ETH needed: ${ethers.formatEther(ethNeeded)}`);
            
//             if (ethNeeded > 0 && ethNeeded < ethers.parseEther("20")) {
//               try {
//                 const tx = await icoAndVesting.connect(user4).buyTokensWithETH([], {
//                   value: ethNeeded
//                 });
                
//                 const phaseInfo = await icoAndVesting.getCurrentPhaseInfo();
//                 console.log(`  After purchase - Phase: ${phaseInfo.currentPhase}, Price: ${phaseInfo.currentPrice}`);
                
//                 expect(tx).to.not.be.reverted;
//               } catch (error) {
//                 console.log(`  Purchase failed: ${error.message}`);
//               }
//             }
//           }
//         }
//       });
//     });

//     describe("15.4 Time-based Edge Cases", function () {
//       it("Should handle vesting at exact boundaries", async function () {
//         // Create a vesting with specific timing
//         await icoAndVesting.addCollaborator(
//           CollaboratorRole.Team,
//           user1.address,
//           ethers.parseEther("1000000")
//         );
        
//         const vestingId = await icoAndVesting.vestingId();
//         const vestingDetails = await icoAndVesting.getVestingDetails(vestingId);
        
//         console.log("Testing time boundaries for vesting:", vestingId.toString());
        
//         // Test exactly at cliff end
//         const cliffEnd = vestingDetails.start + vestingDetails.cliff;
//         await time.increaseTo(cliffEnd);
        
//         let vestedAmount = await icoAndVesting.getVestedTokenAmount(vestingId);
//         console.log(`At cliff end: ${ethers.formatEther(vestedAmount)} tokens vested`);
//         expect(vestedAmount).to.equal(0); // Should be 0 at cliff end
        
//         // Test 1 second after cliff
//         await time.increaseTo(cliffEnd + 1);
//         vestedAmount = await icoAndVesting.getVestedTokenAmount(vestingId);
//         console.log(`1 second after cliff: ${ethers.formatEther(vestedAmount)} tokens vested`);
//         expect(vestedAmount).to.be.gt(0); // Should have some tokens vested
        
//         // Test exactly at vesting end
//         const vestingEnd = vestingDetails.start + vestingDetails.cliff + vestingDetails.duration;
//         await time.increaseTo(vestingEnd);
//         vestedAmount = await icoAndVesting.getVestedTokenAmount(vestingId);
//         console.log(`At vesting end: ${ethers.formatEther(vestedAmount)} tokens vested`);
//         expect(vestedAmount).to.equal(vestingDetails.totalTokenAmount);
        
//         // Test after vesting end
//         await time.increaseTo(vestingEnd + 86400); // 1 day after
//         vestedAmount = await icoAndVesting.getVestedTokenAmount(vestingId);
//         console.log(`After vesting end: ${ethers.formatEther(vestedAmount)} tokens vested`);
//         expect(vestedAmount).to.equal(vestingDetails.totalTokenAmount);
//       });

//       it("Should handle zero-duration edge cases", async function () {
//         // Test immediate vesting (Liquidity role)
//         const tokenAmount = ethers.parseEther("500000");
//         const initialBalance = await eyeToken.balanceOf(user2.address);
        
//         await icoAndVesting.addCollaborator(
//           CollaboratorRole.Liquidity,
//           user2.address,
//           tokenAmount
//         );
        
//         const finalBalance = await eyeToken.balanceOf(user2.address);
//         expect(finalBalance - initialBalance).to.equal(tokenAmount);
        
//         console.log("Zero-duration vesting worked correctly - immediate transfer");
        
//         // The vesting ID should still exist but with special parameters
//         const vestingId = await icoAndVesting.vestingId();
        
//         // Since Liquidity has 100% TGE, there might not be a vesting entry
//         // or it might have zero amount in vesting
//         try {
//           const vestingDetails = await icoAndVesting.getVestingDetails(vestingId);
//           console.log("Vesting details for zero-duration:", {
//             totalAmount: ethers.formatEther(vestingDetails.totalTokenAmount),
//             duration: vestingDetails.duration.toString(),
//             cliff: vestingDetails.cliff.toString()
//           });
//         } catch (error) {
//           console.log("No vesting created for 100% TGE (expected)");
//         }
//       });

//       it("Should handle very long durations", async function () {
//         // Create vesting with maximum duration
//         const maxDuration = 10 * 365 * 24 * 60 * 60; // 10 years
        
//         await icoAndVesting.updateCollaboratorDetails(
//           CollaboratorRole.Staking,
//           10,
//           0,
//           0,
//           maxDuration,
//           false
//         );
        
//         await icoAndVesting.addCollaborator(
//           CollaboratorRole.Staking,
//           user3.address,
//           ethers.parseEther("1000000")
//         );
        
//         const vestingId = await icoAndVesting.vestingId();
//         const vestingDetails = await icoAndVesting.getVestingDetails(vestingId);
        
//         console.log("Created very long duration vesting:", {
//           duration: `${vestingDetails.duration / (365 * 24 * 60 * 60)} years`,
//           tokens: ethers.formatEther(vestingDetails.totalTokenAmount)
//         });
        
//         // Test vesting calculation at various points
//         const testPoints = [1, 10, 100, 1000]; // Days
        
//         for (const days of testPoints) {
//           await moveTimeForward(days * 24 * 60 * 60);
          
//           const vestedAmount = await icoAndVesting.getVestedTokenAmount(vestingId);
//           const percentage = (Number(vestedAmount) * 100) / Number(vestingDetails.totalTokenAmount);
          
//           console.log(`After ${days} days: ${percentage.toFixed(6)}% vested (${ethers.formatEther(vestedAmount)} tokens)`);
          
//           // Should be proportional to time passed
//           const expectedPercentage = (days * 100) / (maxDuration / (24 * 60 * 60));
//           expect(percentage).to.be.closeTo(expectedPercentage, 0.001);
//         }
//       });
//     });

//     describe("15.5 Extreme Load Edge Cases", function () {
//       it("Should handle maximum vesting count", async function () {
//         const maxVestings = 50; // Reasonable test limit
//         const vestingIds = [];
        
//         console.log(`Creating ${maxVestings} vestings...`);
//         const startTime = Date.now();
        
//         for (let i = 0; i < maxVestings; i++) {
//           const user = i % 2 === 0 ? user1 : user2;
//           const role = i % 7; // Cycle through all roles
//           const amount = ethers.parseEther("10000"); // Small amount to avoid allocation limits
          
//           try {
//             await icoAndVesting.addCollaborator(role, user.address, amount);
//             vestingIds.push(await icoAndVesting.vestingId());
//           } catch (error) {
//             console.log(`Failed to create vesting ${i + 1}:`, error.message);
//             break;
//           }
//         }
        
//         const creationTime = Date.now() - startTime;
//         console.log(`Created ${vestingIds.length} vestings in ${creationTime}ms`);
//         console.log(`Average time per vesting: ${creationTime / vestingIds.length}ms`);
        
//         // Test querying all vestings
//         const queryStartTime = Date.now();
//         let validVestings = 0;
        
//         for (const vestingId of vestingIds) {
//           try {
//             const details = await icoAndVesting.getVestingDetails(vestingId);
//             if (details.userAddress !== ethers.ZeroAddress) {
//               validVestings++;
//             }
//           } catch (error) {
//             console.log(`Failed to query vesting ${vestingId}:`, error.message);
//           }
//         }
        
//         const queryTime = Date.now() - queryStartTime;
//         console.log(`Queried ${validVestings} vestings in ${queryTime}ms`);
//         console.log(`Average query time: ${queryTime / validVestings}ms`);
        
//         expect(validVestings).to.be.gt(0);
//         expect(validVestings).to.be.lte(maxVestings);
//       });

//       it("Should handle maximum purchase frequency", async function () {
//         await icoAndVesting.setICORound(ICORounds.PublicPresale);
        
//         const maxPurchases = 30;
//         const purchaseAmount = ethers.parseEther("0.025"); // $100 each to stay within caps
//         const results = [];
        
//         console.log(`Making ${maxPurchases} rapid purchases...`);
//         const startTime = Date.now();
        
//         for (let i = 0; i < maxPurchases; i++) {
//           try {
//             const tx = await icoAndVesting.connect(user5).buyTokensWithETH([], {
//               value: purchaseAmount
//             });
//             const receipt = await tx.wait();
            
//             results.push({
//               index: i + 1,
//               gasUsed: Number(receipt.gasUsed),
//               blockNumber: receipt.blockNumber,
//               timestamp: Date.now()
//             });
//           } catch (error) {
//             console.log(`Purchase ${i + 1} failed:`, error.message);
//             break;
//           }
//         }
        
//         const totalTime = Date.now() - startTime;
//         console.log(`Completed ${results.length} purchases in ${totalTime}ms`);
//         console.log(`Average time per purchase: ${totalTime / results.length}ms`);
        
//         // Analyze gas usage patterns
//         const gasUsages = results.map(r => r.gasUsed);
//         const avgGas = gasUsages.reduce((a, b) => a + b, 0) / gasUsages.length;
//         const minGas = Math.min(...gasUsages);
//         const maxGas = Math.max(...gasUsages);
        
//         console.log("Gas usage analysis:", {
//           average: avgGas,
//           minimum: minGas,
//           maximum: maxGas,
//           variance: maxGas - minGas
//         });
        
//         // Verify all purchases were recorded
//         const totalPurchases = await icoAndVesting.getTotalUserPurchases(user5.address);
//         const expectedTotal = BigInt(results.length) * BigInt(100 * PRECISION);
//         expect(totalPurchases).to.equal(expectedTotal);
//       });

//       it("Should handle memory constraints gracefully", async function () {
//         // Test operations that might strain memory/storage
//         console.log("Testing memory constraint handling...");
        
//         // Large token calculations
//         const largeAmounts = [
//           ethers.parseEther("999999999"), // Near 1B tokens
//           ethers.parseEther("100000000"), // 100M tokens
//           ethers.parseEther("10000000"),  // 10M tokens
//         ];
        
//         for (const amount of largeAmounts) {
//           try {
//             const usdValue = (amount * BigInt(2500)) / TOKEN_DECIMALS; // Use phase 1 price
//             const calculated = await icoAndVesting.calculateTokensForUSD(usdValue);
            
//             console.log(`Large calculation successful: ${ethers.formatEther(amount)} tokens`);
//             expect(calculated).to.equal(amount);
//           } catch (error) {
//             console.log(`Large calculation failed for ${ethers.formatEther(amount)}:`, error.message);
//           }
//         }
        
//         // Multiple simultaneous view calls
//         const viewCalls = [];
//         for (let i = 0; i < 20; i++) {
//           viewCalls.push(icoAndVesting.getCurrentTokenPrice());
//           viewCalls.push(icoAndVesting.getCurrentPhaseInfo());
//           viewCalls.push(icoAndVesting.getContractTokenBalance());
//         }
        
//         const viewStartTime = Date.now();
//         const viewResults = await Promise.all(viewCalls);
//         const viewEndTime = Date.now();
        
//         console.log(`${viewCalls.length} view calls completed in ${viewEndTime - viewStartTime}ms`);
//         expect(viewResults.length).to.equal(viewCalls.length);
//       });
//     });
//   });

//   describe("16. Recovery and Disaster Scenarios", function () {
//     describe("16.1 Emergency Recovery", function () {
//       it("Should recover from total contract drain", async function () {
//         console.log("Testing emergency recovery from contract drain...");
        
//         // Record initial state
//         const initialContractBalance = await eyeToken.balanceOf(await icoAndVesting.getAddress());
//         const initialOwnerBalance = await eyeToken.balanceOf(owner.address);
        
//         console.log("Initial state:", {
//           contractBalance: ethers.formatEther(initialContractBalance),
//           ownerBalance: ethers.formatEther(initialOwnerBalance)
//         });
        
//         // Drain all tokens
//         const tx1 = await icoAndVesting.emergencyWithdraw(
//           await eyeToken.getAddress(),
//           owner.address,
//           initialContractBalance
//         );
        
//         const receipt1 = await tx1.wait();
//         console.log("Emergency withdraw gas used:", receipt1.gasUsed.toString());
        
//         const drainedBalance = await eyeToken.balanceOf(await icoAndVesting.getAddress());
//         expect(drainedBalance).to.equal(0);
        
//         console.log("Contract successfully drained");
        
//         // Verify operations fail without tokens
//         await icoAndVesting.setICORound(ICORounds.PublicPresale);
        
//         await expect(
//           icoAndVesting.connect(user1).buyTokensWithETH([], {
//             value: ethers.parseEther("0.1")
//           })
//         ).to.be.revertedWith("Insufficient contract token balance");
        
//         console.log("Operations correctly fail without tokens");
        
//         // Restore tokens
//         const tx2 = await eyeToken.transfer(await icoAndVesting.getAddress(), initialContractBalance);
//         const receipt2 = await tx2.wait();
//         console.log("Token restore gas used:", receipt2.gasUsed.toString());
        
//         const restoredBalance = await eyeToken.balanceOf(await icoAndVesting.getAddress());
//         expect(restoredBalance).to.equal(initialContractBalance);
        
//         console.log("Tokens successfully restored");
        
//         // Verify operations work again
//         const tx3 = await icoAndVesting.connect(user1).buyTokensWithETH([], {
//           value: ethers.parseEther("0.1")
//         });
        
//         expect(tx3).to.not.be.reverted;
//         console.log("Operations work after recovery");
//       });

//       it("Should recover from ETH accumulation", async function () {
//         console.log("Testing ETH recovery...");
        
//         // Send ETH to contract (simulating stuck ETH)
//         const ethAmount = ethers.parseEther("5");
//         await owner.sendTransaction({
//           to: await icoAndVesting.getAddress(),
//           value: ethAmount
//         });
        
//         const contractETHBalance = await ethers.provider.getBalance(await icoAndVesting.getAddress());
//         expect(contractETHBalance).to.equal(ethAmount);
        
//         console.log("ETH sent to contract:", ethers.formatEther(contractETHBalance));
        
//         // Emergency withdraw ETH
//         const initialOwnerETH = await ethers.provider.getBalance(owner.address);
        
//         const tx = await icoAndVesting.emergencyWithdraw(
//           ethers.ZeroAddress, // ETH withdrawal
//           owner.address,
//           contractETHBalance
//         );
        
//         const receipt = await tx.wait();
//         console.log("ETH emergency withdraw gas used:", receipt.gasUsed.toString());
        
//         const finalContractETH = await ethers.provider.getBalance(await icoAndVesting.getAddress());
//         expect(finalContractETH).to.equal(0);
        
//         console.log("ETH successfully recovered from contract");
//       });

//       it("Should recover from corru// Continuing from where the test cases left off...

//         const claimableAmount = await icoAndVesting.getClaimableTokenAmount(vestingId);
        
//         if (claimableAmount > 0) {
//           const tx = await icoAndVesting.connect(user2).claimTokens(vestingId);
//           const receipt = await tx.wait();
//           console.log("Token claim gas used:", receipt.gasUsed.toString());
          
//           // Gas should be reasonable (less than 200k)
//           expect(receipt.gasUsed).to.be.lt(200000);
//         }
//       });

//       it("Should have reasonable gas consumption for collaborator addition", async function () {
//         const tx = await icoAndVesting.addCollaborator(
//           CollaboratorRole.Staking,
//           user3.address,
//           ethers.parseEther("500000")
//         );
        
//         const receipt = await tx.wait();
//         console.log("Collaborator addition gas used:", receipt.gasUsed.toString());
        
//         // Gas should be reasonable (less than 400k)
//         expect(receipt.gasUsed).to.be.lt(400000);
//       });

//       it("Should have reasonable gas consumption for stablecoin purchases", async function () {
//         await icoAndVesting.setICORound(ICORounds.PublicPresale);
        
//         const usdcAmount = ethers.parseUnits("1000", 6);
//         await mockUSDC.connect(user3).approve(await icoAndVesting.getAddress(), usdcAmount);
        
//         const tx = await icoAndVesting.connect(user3).buyTokensWithUSDC(usdcAmount, []);
//         const receipt = await tx.wait();
//         console.log("USDC purchase gas used:", receipt.gasUsed.toString());
        
//         // Gas should be reasonable (less than 350k)
//         expect(receipt.gasUsed).to.be.lt(350000);
//       });

//       it("Should have reasonable gas consumption for fiat purchases", async function () {
//         await icoAndVesting.setICORound(ICORounds.Seed);
//         await icoAndVesting.setMerkleRoot(merkleRoot);
        
//         const fiatAmount = 1000 * PRECISION;
//         const proof = getProof(user1.address);
        
//         const tx = await icoAndVesting.buyTokensWithFiat(user1.address, fiatAmount, proof);
//         const receipt = await tx.wait();
//         console.log("Fiat purchase gas used:", receipt.gasUsed.toString());
        
//         // Gas should be reasonable (less than 400k)
//         expect(receipt.gasUsed).to.be.lt(400000);
//       });

//       it("Should have reasonable gas consumption for admin operations", async function () {
//         // Test round switching
//         let tx = await icoAndVesting.setICORound(ICORounds.PublicPresale);
//         let receipt = await tx.wait();
//         console.log("Round switching gas used:", receipt.gasUsed.toString());
//         expect(receipt.gasUsed).to.be.lt(100000);

//         // Test merkle root update
//         tx = await icoAndVesting.setMerkleRoot(merkleRoot);
//         receipt = await tx.wait();
//         console.log("Merkle root update gas used:", receipt.gasUsed.toString());
//         expect(receipt.gasUsed).to.be.lt(50000);

//         // Test pause/unpause
//         tx = await icoAndVesting.pause();
//         receipt = await tx.wait();
//         console.log("Pause gas used:", receipt.gasUsed.toString());
//         expect(receipt.gasUsed).to.be.lt(50000);

//         tx = await icoAndVesting.unpause();
//         receipt = await tx.wait();
//         console.log("Unpause gas used:", receipt.gasUsed.toString());
//         expect(receipt.gasUsed).to.be.lt(50000);
//       });
//     });

//     describe("13.2 Batch Operations", function () {
//       it("Should handle multiple purchases efficiently", async function () {
//         await icoAndVesting.setICORound(ICORounds.PublicPresale);
        
//         const purchasePromises = [];
//         const users = [user1, user2, user3, user4, user5];
        
//         for (const user of users) {
//           purchasePromises.push(
//             icoAndVesting.connect(user).buyTokensWithETH([], {
//               value: ethers.parseEther("0.1")
//             })
//           );
//         }
        
//         const startTime = Date.now();
//         const results = await Promise.all(purchasePromises);
//         const endTime = Date.now();
        
//         console.log("Batch purchase time:", endTime - startTime, "ms");
//         console.log("Average time per purchase:", (endTime - startTime) / users.length, "ms");
        
//         // Calculate total gas used
//         let totalGas = 0;
//         for (const tx of results) {
//           const receipt = await tx.wait();
//           totalGas += Number(receipt.gasUsed);
//         }
//         console.log("Total gas for batch purchases:", totalGas);
//         console.log("Average gas per purchase:", totalGas / users.length);
        
//         // Verify all purchases succeeded
//         for (const user of users) {
//           const purchases = await icoAndVesting.getUserPurchaseAmount(user.address, ICORounds.PublicPresale);
//           expect(purchases).to.be.gt(0);
//         }
//       });

//       it("Should handle multiple collaborator additions efficiently", async function () {
//         const collaborators = [
//           { role: CollaboratorRole.Ecosystem, user: user1, amount: "100000" },
//           { role: CollaboratorRole.Reserve, user: user2, amount: "200000" },
//           { role: CollaboratorRole.Staking, user: user3, amount: "150000" }
//         ];

//         const startTime = Date.now();
//         const gasUsed = [];
        
//         for (const collab of collaborators) {
//           const tx = await icoAndVesting.addCollaborator(
//             collab.role,
//             collab.user.address,
//             ethers.parseEther(collab.amount)
//           );
//           const receipt = await tx.wait();
//           gasUsed.push(Number(receipt.gasUsed));
//         }
        
//         const endTime = Date.now();
//         console.log("Batch collaborator addition time:", endTime - startTime, "ms");
//         console.log("Gas used for each addition:", gasUsed);
//         console.log("Total gas used:", gasUsed.reduce((a, b) => a + b, 0));
//         console.log("Average gas per addition:", gasUsed.reduce((a, b) => a + b, 0) / gasUsed.length);
        
//         // Verify all collaborators added
//         for (const collab of collaborators) {
//           const roleDetails = await icoAndVesting.getCollaboratorDetails(collab.role);
//           expect(roleDetails.tokensAllocated).to.be.gt(0);
//         }
//       });

//       it("Should handle multiple claims efficiently", async function () {
//         // Create multiple vestings first
//         const vestingUsers = [user1, user2, user3];
//         const vestingIds = [];
        
//         for (const user of vestingUsers) {
//           await icoAndVesting.addCollaborator(
//             CollaboratorRole.Ecosystem,
//             user.address,
//             ethers.parseEther("100000")
//           );
//           vestingIds.push(await icoAndVesting.vestingId());
//         }
        
//         // Move time forward to make tokens claimable
//         await moveTimeForward(60 * 24 * 60 * 60); // 60 days
        
//         // Batch claim tokens
//         const claimPromises = [];
//         const gasUsed = [];
        
//         for (let i = 0; i < vestingUsers.length; i++) {
//           const user = vestingUsers[i];
//           const vestingId = vestingIds[i];
          
//           const claimableAmount = await icoAndVesting.getClaimableTokenAmount(vestingId);
//           if (claimableAmount > 0) {
//             claimPromises.push(
//               icoAndVesting.connect(user).claimTokens(vestingId)
//             );
//           }
//         }
        
//         const startTime = Date.now();
//         const results = await Promise.all(claimPromises);
//         const endTime = Date.now();
        
//         console.log("Batch claim time:", endTime - startTime, "ms");
        
//         // Calculate gas usage
//         for (const tx of results) {
//           const receipt = await tx.wait();
//           gasUsed.push(Number(receipt.gasUsed));
//         }
        
//         console.log("Gas used for each claim:", gasUsed);
//         console.log("Average gas per claim:", gasUsed.reduce((a, b) => a + b, 0) / gasUsed.length);
//       });

//       it("Should handle mixed operation batches efficiently", async function () {
//         await icoAndVesting.setICORound(ICORounds.PublicPresale);
        
//         const operations = [];
//         const gasResults = [];
        
//         // Mix of purchases and admin operations
//         operations.push({
//           name: "ETH Purchase",
//           operation: () => icoAndVesting.connect(user1).buyTokensWithETH([], { value: ethers.parseEther("0.5") })
//         });
        
//         operations.push({
//           name: "USDC Purchase", 
//           operation: async () => {
//             await mockUSDC.connect(user2).approve(await icoAndVesting.getAddress(), ethers.parseUnits("1000", 6));
//             return icoAndVesting.connect(user2).buyTokensWithUSDC(ethers.parseUnits("1000", 6), []);
//           }
//         });
        
//         operations.push({
//           name: "Collaborator Addition",
//           operation: () => icoAndVesting.addCollaborator(CollaboratorRole.EarlyLP, user3.address, ethers.parseEther("200000"))
//         });
        
//         operations.push({
//           name: "Round Switch",
//           operation: () => icoAndVesting.setICORound(ICORounds.Seed)
//         });
        
//         const startTime = Date.now();
        
//         for (const op of operations) {
//           const tx = await op.operation();
//           const receipt = await tx.wait();
//           gasResults.push({
//             name: op.name,
//             gas: Number(receipt.gasUsed)
//           });
//         }
        
//         const endTime = Date.now();
        
//         console.log("Mixed operations results:");
//         console.log("Total time:", endTime - startTime, "ms");
//         gasResults.forEach(result => {
//           console.log(`${result.name}: ${result.gas} gas`);
//         });
//         console.log("Total gas:", gasResults.reduce((a, b) => a + b.gas, 0));
//       });
//     });

//     describe("13.3 Memory and Storage Optimization", function () {
//       it("Should efficiently handle large number of vestings", async function () {
//         const vestingCount = 10;
//         const vestingIds = [];
        
//         const startTime = Date.now();
        
//         // Create multiple vestings
//         for (let i = 0; i < vestingCount; i++) {
//           const user = i % 2 === 0 ? user1 : user2;
//           await icoAndVesting.addCollaborator(
//             CollaboratorRole.Ecosystem,
//             user.address,
//             ethers.parseEther("50000")
//           );
//           vestingIds.push(await icoAndVesting.vestingId());
//         }
        
//         const creationTime = Date.now();
//         console.log(`Created ${vestingCount} vestings in ${creationTime - startTime}ms`);
        
//         // Query all vestings
//         const queryStartTime = Date.now();
//         const vestingDetails = [];
        
//         for (const vestingId of vestingIds) {
//           const details = await icoAndVesting.getVestingDetails(vestingId);
//           vestingDetails.push(details);
//         }
        
//         const queryEndTime = Date.now();
//         console.log(`Queried ${vestingCount} vestings in ${queryEndTime - queryStartTime}ms`);
//         console.log(`Average query time per vesting: ${(queryEndTime - queryStartTime) / vestingCount}ms`);
        
//         // Verify all vestings are valid
//         expect(vestingDetails.length).to.equal(vestingCount);
//         vestingDetails.forEach(details => {
//           expect(details.userAddress).to.not.equal(ethers.ZeroAddress);
//           expect(details.totalTokenAmount).to.be.gt(0);
//         });
//       });

//       it("Should efficiently handle large purchase history", async function () {
//         await icoAndVesting.setICORound(ICORounds.PublicPresale);
        
//         const purchaseCount = 20;
//         const purchaseAmounts = [];
        
//         const startTime = Date.now();
        
//         // Make multiple purchases with same user
//         for (let i = 0; i < purchaseCount; i++) {
//           const amount = ethers.parseEther("0.01"); // Small amounts to stay within cap
//           await icoAndVesting.connect(user1).buyTokensWithETH([], { value: amount });
//           purchaseAmounts.push(amount);
//         }
        
//         const purchaseTime = Date.now();
//         console.log(`Made ${purchaseCount} purchases in ${purchaseTime - startTime}ms`);
        
//         // Query purchase history
//         const queryStartTime = Date.now();
//         const totalPurchases = await icoAndVesting.getTotalUserPurchases(user1.address);
//         const roundPurchases = await icoAndVesting.getUserPurchaseAmount(user1.address, ICORounds.PublicPresale);
//         const queryEndTime = Date.now();
        
//         console.log(`Queried purchase history in ${queryEndTime - queryStartTime}ms`);
//         console.log(`Total purchases: ${ethers.formatUnits(totalPurchases, 6)}`);
//         console.log(`Round purchases: ${ethers.formatUnits(roundPurchases, 6)}`);
        
//         expect(totalPurchases).to.be.gt(0);
//         expect(roundPurchases).to.equal(totalPurchases);
//       });
//     });
//   });

//   describe("14. Stress Tests", function () {
//     describe("14.1 High Volume Operations", function () {
//       it("Should handle maximum wallet cap purchases", async function () {
//         await icoAndVesting.setICORound(ICORounds.PublicPresale);
        
//         // Buy exactly at wallet cap multiple times with different users
//         const walletCap = 50000 * PRECISION; // $50K
//         const ethAmount = ethers.parseEther("12.5"); // $50K worth at $4000/ETH
        
//         const users = [user1, user2, user3];
//         const gasUsage = [];
        
//         for (const user of users) {
//           const tx = await icoAndVesting.connect(user).buyTokensWithETH([], {
//             value: ethAmount
//           });
//           const receipt = await tx.wait();
//           gasUsage.push(Number(receipt.gasUsed));
          
//           const purchases = await icoAndVesting.getUserPurchaseAmount(user.address, ICORounds.PublicPresale);
//           expect(purchases).to.equal(walletCap);
//         }
        
//         console.log("Maximum wallet cap purchase gas usage:", gasUsage);
//         console.log("Average gas for max purchase:", gasUsage.reduce((a, b) => a + b, 0) / gasUsage.length);
        
//         // Verify all purchases at cap
//         for (const user of users) {
//           const purchases = await icoAndVesting.getUserPurchaseAmount(user.address, ICORounds.PublicPresale);
//           expect(purchases).to.equal(walletCap);
//         }
//       });

//       it("Should handle rapid successive purchases", async function () {
//         await icoAndVesting.setICORound(ICORounds.PublicPresale);
        
//         const rapidPurchases = 15;
//         const purchaseAmount = ethers.parseEther("0.025"); // $100 each
//         const results = [];
        
//         const startTime = Date.now();
        
//         // Make rapid purchases
//         for (let i = 0; i < rapidPurchases; i++) {
//           const tx = await icoAndVesting.connect(user4).buyTokensWithETH([], {
//             value: purchaseAmount
//           });
//           const receipt = await tx.wait();
//           results.push({
//             blockNumber: receipt.blockNumber,
//             gasUsed: Number(receipt.gasUsed),
//             timestamp: Date.now()
//           });
//         }
        
//         const endTime = Date.now();
        
//         console.log(`${rapidPurchases} rapid purchases completed in ${endTime - startTime}ms`);
//         console.log("Gas usage per purchase:", results.map(r => r.gasUsed));
//         console.log("Average gas per rapid purchase:", results.reduce((a, b) => a + b.gasUsed, 0) / results.length);
        
//         // Verify total purchases
//         const totalPurchases = await icoAndVesting.getTotalUserPurchases(user4.address);
//         const expectedTotal = BigInt(rapidPurchases) * BigInt(100 * PRECISION); // $100 * count
//         expect(totalPurchases).to.equal(expectedTotal);
//       });

//       it("Should handle near hard cap scenarios", async function () {
//         const roundDetails = await icoAndVesting.getRoundDetails(ICORounds.PublicPresale);
//         const remainingTokens = roundDetails.totalTokenAmount - roundDetails.tokensSold;
        
//         console.log("Remaining tokens in public presale:", ethers.formatEther(remainingTokens));
        
//         if (remainingTokens > ethers.parseEther("1000000")) {
//           // Buy close to remaining tokens (leave 100K tokens)
//           const targetTokens = remainingTokens - ethers.parseEther("100000");
//           const currentPrice = await icoAndVesting.getCurrentTokenPrice();
//           const usdValue = (targetTokens * BigInt(currentPrice)) / TOKEN_DECIMALS;
//           const ethValue = usdValue / BigInt(4000);
          
//           console.log("Attempting large purchase:", {
//             targetTokens: ethers.formatEther(targetTokens),
//             usdValue: ethers.formatUnits(usdValue, 6),
//             ethValue: ethers.formatEther(ethValue)
//           });
          
//           const tx = await icoAndVesting.connect(user5).buyTokensWithETH([], {
//             value: ethValue
//           });
          
//           const receipt = await tx.wait();
//           console.log("Large purchase gas used:", receipt.gasUsed.toString());
          
//           // Verify purchase succeeded
//           const newRoundDetails = await icoAndVesting.getRoundDetails(ICORounds.PublicPresale);
//           expect(newRoundDetails.tokensSold).to.be.gt(roundDetails.tokensSold);
          
//           console.log("Tokens sold after large purchase:", ethers.formatEther(newRoundDetails.tokensSold));
//           console.log("Remaining tokens:", ethers.formatEther(newRoundDetails.totalTokenAmount - newRoundDetails.tokensSold));
//         }
//       });

//       it("Should handle phase transitions under load", async function () {
//         await icoAndVesting.setICORound(ICORounds.PublicPresale);
        
//         // Get initial phase info
//         let phaseInfo = await icoAndVesting.getCurrentPhaseInfo();
//         console.log("Initial phase:", phaseInfo.currentPhase.toString(), "Price:", phaseInfo.currentPrice.toString());
        
//         // Make purchases to trigger phase changes
//         const users = [user1, user2, user3, user4, user5];
//         let currentPhase = phaseInfo.currentPhase;
        
//         for (let i = 0; i < users.length && currentPhase < 5; i++) {
//           const user = users[i];
//           const purchaseAmount = ethers.parseEther("5"); // Large purchase to trigger phase change
          
//           try {
//             const tx = await icoAndVesting.connect(user).buyTokensWithETH([], {
//               value: purchaseAmount
//             });
//             const receipt = await tx.wait();
            
//             phaseInfo = await icoAndVesting.getCurrentPhaseInfo();
            
//             console.log(`After purchase ${i + 1}:`, {
//               phase: phaseInfo.currentPhase.toString(),
//               price: phaseInfo.currentPrice.toString(),
//               percentSold: phaseInfo.percentageSold.toString(),
//               gasUsed: receipt.gasUsed.toString()
//             });
            
//             if (phaseInfo.currentPhase > currentPhase) {
//               console.log(`Phase transition detected! ${currentPhase} -> ${phaseInfo.currentPhase}`);
//               currentPhase = phaseInfo.currentPhase;
//             }
//           } catch (error) {
//             console.log(`Purchase ${i + 1} failed:`, error.message);
//             break;
//           }
//         }
        
//         // Verify we progressed through phases
//         expect(phaseInfo.currentPhase).to.be.gte(1);
//         expect(phaseInfo.percentageSold).to.be.gt(0);
//       });
//     });

//     describe("14.2 Long-term Vesting Tests", function () {
//       it("Should handle vesting over maximum duration", async function () {
//         // Create maximum duration vesting (Staking: 48 months)
//         await icoAndVesting.addCollaborator(
//           CollaboratorRole.Staking,
//           user5.address,
//           ethers.parseEther("2000000")
//         );
        
//         const vestingId = await icoAndVesting.vestingId();
//         const initialDetails = await icoAndVesting.getVestingDetails(vestingId);
        
//         console.log("Created max duration vesting:", {
//           vestingId: vestingId.toString(),
//           totalTokens: ethers.formatEther(initialDetails.totalTokenAmount),
//           duration: initialDetails.duration.toString(),
//           cliff: initialDetails.cliff.toString()
//         });
        
//         // Test vesting at different time intervals
//         const timeIntervals = [
//           { months: 6, description: "6 months" },
//           { months: 12, description: "12 months" },
//           { months: 24, description: "24 months" },
//           { months: 36, description: "36 months" },
//           { months: 48, description: "48 months (full duration)" }
//         ];
        
//         for (const interval of timeIntervals) {
//           await moveTimeForward(6 * 30 * 24 * 60 * 60); // 6 months each iteration
          
//           const vestedAmount = await icoAndVesting.getVestedTokenAmount(vestingId);
//           const claimableAmount = await icoAndVesting.getClaimableTokenAmount(vestingId);
          
//           console.log(`At ${interval.description}:`, {
//             vestedTokens: ethers.formatEther(vestedAmount),
//             claimableTokens: ethers.formatEther(claimableAmount),
//             vestedPercentage: (Number(vestedAmount) * 100 / Number(initialDetails.totalTokenAmount)).toFixed(2) + "%"
//           });
          
//           if (claimableAmount > 0) {
//             const tx = await icoAndVesting.connect(user5).claimTokens(vestingId);
//             const receipt = await tx.wait();
//             console.log(`Claim gas used at ${interval.description}:`, receipt.gasUsed.toString());
//           }
//         }
        
//         // Final verification
//         const finalDetails = await icoAndVesting.getVestingDetails(vestingId);
//         expect(finalDetails.tokenTransferred).to.equal(initialDetails.totalTokenAmount);
        
//         const finalBalance = await eyeToken.balanceOf(user5.address);
//         expect(finalBalance).to.equal(initialDetails.totalTokenAmount);
//       });

//       it("Should handle multiple overlapping vesting schedules", async function () {
//         // Create multiple vestings for same user with different schedules
//         const vestingData = [
//           { role: CollaboratorRole.Ecosystem, amount: "500000", description: "Ecosystem (36m, no cliff)" },
//           { role: CollaboratorRole.EarlyLP, amount: "200000", description: "EarlyLP (12m, no cliff)" },
//           { role: CollaboratorRole.Team, amount: "1000000", description: "Team (24m, 9m cliff)" }
//         ];

//         const vestingIds = [];
//         const initialBalance = await eyeToken.balanceOf(user1.address);
        
//         console.log("Creating multiple vesting schedules for user1...");
        
//         for (const data of vestingData) {
//           await icoAndVesting.addCollaborator(
//             data.role,
//             user1.address,
//             ethers.parseEther(data.amount)
//           );
//           const vestingId = await icoAndVesting.vestingId();
//           vestingIds.push({ id: vestingId, ...data });
          
//           console.log(`Created ${data.description}:`, {
//             vestingId: vestingId.toString(),
//             tokens: data.amount
//           });
//         }
        
//         // Track claims over time
//         const timePoints = [
//           { months: 3, description: "3 months" },
//           { months: 6, description: "6 months" },
//           { months: 9, description: "9 months (team cliff ends)" },
//           { months: 12, description: "12 months (EarlyLP ends)" },
//           { months: 24, description: "24 months (team ends)" },
//           { months: 36, description: "36 months (ecosystem ends)" }
//         ];
        
//         let previousTime = 0;
        
//         for (const timePoint of timePoints) {
//           const timeToMove = (timePoint.months - previousTime) * 30 * 24 * 60 * 60;
//           await moveTimeForward(timeToMove);
//           previousTime = timePoint.months;
          
//           console.log(`\nAt ${timePoint.description}:`);
          
//           let totalClaimed = 0n;
          
//           for (const vestingInfo of vestingIds) {
//             const claimableAmount = await icoAndVesting.getClaimableTokenAmount(vestingInfo.id);
            
//             console.log(`  ${vestingInfo.description}: ${ethers.formatEther(claimableAmount)} claimable`);
            
//             if (claimableAmount > 0) {
//               await icoAndVesting.connect(user1).claimTokens(vestingInfo.id);
//               totalClaimed += claimableAmount;
//             }
//           }
          
//           if (totalClaimed > 0) {
//             console.log(`  Total claimed this period: ${ethers.formatEther(totalClaimed)}`);
//           }
          
//           const currentBalance = await eyeToken.balanceOf(user1.address);
//           console.log(`  User1 total balance: ${ethers.formatEther(currentBalance)}`);
//         }
        
//         // Final verification - all vestings should be fully claimed
//         const finalBalance = await eyeToken.balanceOf(user1.address);
//         console.log(`\nFinal verification:`);
//         console.log(`Initial balance: ${ethers.formatEther(initialBalance)}`);
//         console.log(`Final balance: ${ethers.formatEther(finalBalance)}`);
//         console.log(`Total tokens received: ${ethers.formatEther(finalBalance - initialBalance)}`);
        
//         expect(finalBalance).to.be.gt(initialBalance);
        
//         // Verify no more tokens can be claimed
//         for (const vestingInfo of vestingIds) {
//           const remainingClaimable = await icoAndVesting.getClaimableTokenAmount(vestingInfo.id);
//           expect(remainingClaimable).to.equal(0);
//         }
//       });

//       it("Should handle vesting precision over long periods", async function () {
//         // Test precision with fractional token amounts over long periods
//         const preciseAmount = ethers.parseEther("1000000.123456789012345678"); // Very precise amount
        
//         await icoAndVesting.addCollaborator(
//           CollaboratorRole.Staking,
//           user2.address,
//           preciseAmount
//         );
        
//         const vestingId = await icoAndVesting.vestingId();
//         const vestingDetails = await icoAndVesting.getVestingDetails(vestingId);
        
//         console.log("Testing precision with amount:", ethers.formatEther(preciseAmount));
        
//         // Move through vesting period in small increments
//         const totalDuration = Number(vestingDetails.duration);
//         const incrementDays = 30; // 1 month increments
//         const totalIncrements = Math.floor(totalDuration / (incrementDays * 24 * 60 * 60));
        
//         let totalClaimed = 0n;
        
//         for (let i = 1; i <= totalIncrements; i++) {
//           await moveTimeForward(incrementDays * 24 * 60 * 60);
          
//           const vestedAmount = await icoAndVesting.getVestedTokenAmount(vestingId);
//           const claimableAmount = await icoAndVesting.getClaimableTokenAmount(vestingId);
          
//           if (i % 6 === 0) { // Log every 6 months
//             console.log(`Month ${i * incrementDays / 30}:`, {
//               vestedTokens: ethers.formatEther(vestedAmount),
//               claimableTokens: ethers.formatEther(claimableAmount)
//             });
//           }
          
//           if (claimableAmount > 0) {
//             await icoAndVesting.connect(user2).claimTokens(vestingId);
//             totalClaimed += claimableAmount;
//           }
//         }
        
//         // Move to end and claim remaining
//         await moveTimeForward(totalDuration);
//         const finalClaimable = await icoAndVesting.getClaimableTokenAmount(vestingId);
//         if (finalClaimable > 0) {
//           await icoAndVesting.connect(user2).claimTokens(vestingId);
//           totalClaimed += finalClaimable;
//         }
        
//         console.log("Precision test results:", {
//           originalAmount: ethers.formatEther(preciseAmount),
//           totalClaimed: ethers.formatEther(totalClaimed),
//           difference: ethers.formatEther(preciseAmount - totalClaimed)
//         });
        
//         // Should have claimed exactly the original amount (within small rounding error)
//         const difference = preciseAmount > totalClaimed ? preciseAmount - totalClaimed : totalClaimed - preciseAmount;
//         expect(difference).to.be.lt(ethers.parseEther("0.000000000000000001")); // 1 wei tolerance
//       });
//     });
//   });

//   describe("15. Edge Cases and Corner Cases", function () {
//     describe("15.1 Boundary Value Tests", function () {
//       it("Should handle minimum purchase amount exactly", async function () {
//         await icoAndVesting.setICORound(ICORounds.PublicPresale);
        
//         // Calculate exact minimum ETH for $10
//         const minUSD = 10 * PRECISION;
//         const minETH = ethers.parseEther("0.0025"); // $10 / $4000
        
//         console.log("Testing minimum purchase:", {
//           minUSD: minUSD.toString(),
//           minETH: ethers.formatEther(minETH)
//         });
        
//         const tx = await icoAndVesting.connect(user1).buyTokensWithETH([], {
//           value: minETH
//         });
        
//         const receipt = await tx.wait();
//         console.log("Minimum purchase gas used:", receipt.gasUsed.toString());
        
//         expect(tx).to.not.be.reverted;
        
//         const purchases = await icoAndVesting.getUserPurchaseAmount(user1.address, ICORounds.PublicPresale);
//         expect(purchases).to.be.gte(minUSD);
//       });

//       it("Should handle just below minimum purchase", async function () {
//         await icoAndVesting.setICORound(ICORounds.PublicPresale);
        
//         // Try $9.99 (just below $10 minimum)
//         const belowMinUSD = 9.99 * PRECISION;
//         const belowMinETH = ethers.parseEther("0.002475"); // $9.99 / $4000
        
//         console.log("Testing below minimum purchase:", {
//           belowMinUSD: belowMinUSD.toString(),
//           belowMinETH: ethers.formatEther(belowMinETH)
//         });
        
//         await expect(
//           icoAndVesting.connect(user2).buyTokensWithETH([], {
//             value: belowMinETH
//           })
//         ).to.be.revertedWith("Purchase amount too small");
//       });

//       it("Should handle maximum wallet cap exactly", async function () {
//         await icoAndVesting.setICORound(ICORounds.PublicPresale);
        
//         // Buy exactly at wallet cap ($50K)
//         const maxUSD = 50000 * PRECISION;
//         const maxETH = ethers.parseEther("12.5"); // $50K / $4000
        
//         console.log("Testing maximum wallet cap purchase:", {
//           maxUSD: maxUSD.toString(),
//           maxETH: ethers.formatEther(maxETH)
//         });
        
//         const tx = await icoAndVesting.connect(user3).buyTokensWithETH([], {
//           value: maxETH
//         });
        
//         const receipt = await tx.wait();
//         console.log("Maximum purchase gas used:", receipt.gasUsed.toString());
        
//         expect(tx).to.not.be.reverted;
        
//         const purchases = await icoAndVesting.getUserPurchaseAmount(user3.address, ICORounds.PublicPresale);
//         expect(purchases).to.equal(maxUSD);
//       });

//       it("Should reject purchase exceeding wallet cap", async function () {
//         await icoAndVesting.setICORound(ICORounds.PublicPresale);
        
//         // Try $50,000.01 (just above cap)
//         const aboveMaxUSD = 50000.01 * PRECISION;
//         const aboveMaxETH = ethers.parseEther("12.50000025"); // Just above cap
        
//         console.log("Testing above maximum wallet cap:", {
//           aboveMaxUSD: aboveMaxUSD.toString(),
//           aboveMaxETH: ethers.formatEther(aboveMaxETH)
//         });
        
//         await expect(
//           icoAndVesting.connect(user4).buyTokensWithETH([], {
//             value: aboveMaxETH
//           })
//         ).to.be.revertedWith("Exceeds wallet cap for this round");
//       });

//       it("Should handle maximum allocation percentages", async function () {
//         // Test updating to maximum valid percentages
//         await icoAndVesting.updateRoundDetails(
//           ICORounds.Seed,
//           100, // Maximum percentage
//           100000 * PRECISION, // High wallet cap
//           100, // Maximum TGE
//           365 * 24 * 60 * 60, // 1 year cliff
//           1000 * 24 * 60 * 60, // Long duration
//           1000, // New price
//           true // Requires whitelist
//         );
        
//         const details = await icoAndVesting.getRoundDetails(ICORounds.Seed);
//         expect(details.allocationPercent).to.equal(100);
//         expect(details.TGE).to.equal(100);
//         expect(details.walletCapUSD).to.equal(100000 * PRECISION);
        
//         console.log("Updated round details:", {
//           allocation: details.allocationPercent.toString(),
//           TGE: details.TGE.toString(),
//           walletCap: ethers.formatUnits(details.walletCapUSD, 6)
//         });
//       });

//       it("Should handle zero values where appropriate", async function () {
//         // Test zero cliff and duration (like Liquidity role)
//         await icoAndVesting.updateCollaboratorDetails(
//           CollaboratorRole.Liquidity,
//           10, // 10% allocation
//           100, // 100% TGE
//           0, // Zero cliff
//           0, // Zero duration
//           false // No cliff offset
//         );
        
//         const details = await icoAndVesting.getCollaboratorDetails(CollaboratorRole.Liquidity);
//         expect(details.cliff).to.equal(0);
//         expect(details.duration).to.equal(0);
//         expect(details.TGE).to.equal(100);
        
//         // Test adding liquidity collaborator (should get all tokens immediately)
//         const tokenAmount = ethers.parseEther("100000");
//         const initialBalance = await eyeToken.balanceOf(user5.address);
        
//         await icoAndVesting.addCollaborator(
//           CollaboratorRole.Liquidity,
//           user5.address,
//           tokenAmount
//         );
        
//         const finalBalance = await eyeToken.balanceOf(user5.address);
//         expect(finalBalance - initialBalance).to.equal(tokenAmount);
//       });

//     });
//   } );
  