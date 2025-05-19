const { ethers } = require("hardhat");

async function main() {
  // Contract addresses
  const eyeTokenAddress = "0x179e29C1aEd0ab31f718C38127BB3425B94E0c9a";
  const mockUSDCAddress = "0xa30b0b142d0d1563aB9fcae2f81f728F4bDb966E";
  const icoAndVestingAddress = "0xEFFe3206bA60C2da7e956a0adB63AFd4D97e051B";

  // Test address and Merkle proof
  const testAddress = "0xfE98c32B4F998eAf7850E18FA6afBbD665C45E39";
  const privateKey = "024ae33f34c72121e0a9a29d41d896bd2ed012c0a636115a478e6381693feeb5";
  const merkleProof = [
    "0x40bab2631d5b0712747f9031219a7d3f4578a7c2353648c3689eb372ac4c7c97",
    "0x2318bfca4fd1a33e2dd65b729e6ded38fd50cf6c74a5c1bc28a70d8bd500704c",
  ];
  const merkleRoot = "0x00b38484ea23e501a74be97409e696a205b6acfd7857c17e73d677b8ca8b0844";

  // Setup wallet
  const wallet = new ethers.Wallet(privateKey, ethers.provider);
  console.log(`Using wallet address: ${wallet.address}`);
  if (wallet.address.toLowerCase() !== testAddress.toLowerCase()) {
    throw new Error("Private key does not match test address");
  }

  // Get contract instances
  const eyeToken = await ethers.getContractAt("EYE", eyeTokenAddress);
  const mockUSDC = await ethers.getContractAt("MockUSDC", mockUSDCAddress);
  const icoAndVesting = await ethers.getContractAt("EYETokenICOAndVesting", icoAndVestingAddress);

  // Get contract owner
  const [owner] = await ethers.getSigners();
  console.log(`Contract owner address: ${owner.address}`);

  // Check contract initialization
  console.log("Checking contract initialization...");
  let isInitialized = false;
  try {
    const eyeTokenAddr = await icoAndVesting.eyeToken();
    const fundReceiver = await icoAndVesting.fundReceiverAddress();
    const currentPhase = await icoAndVesting.currentPhase();
    console.log("Contract State:", {
      eyeToken: eyeTokenAddr,
      fundReceiver: fundReceiver,
      currentPhase: currentPhase.toString(),
    });
    isInitialized = eyeTokenAddr !== "0x0000000000000000000000000000000000000000" && fundReceiver !== "0x0000000000000000000000000000000000000000";
  } catch (e) {
    console.error("Failed to read contract state:", e.message);
  }

  // Initialize contract if not initialized
  if (!isInitialized) {
    console.log("Contract not initialized. Attempting to initialize...");
    try {
      const tx = await icoAndVesting.connect(owner).initialize(
        eyeTokenAddress,
        "0xe8239aFA5Cc7Ec80d27713A60D2E50facbeA3BC0",
        mockUSDCAddress,
        "0x001382149eBa3441043c1c66972b4772963f5D43",
        "0x1b8739bB4CdF0089d07097A9Ae5Bd274b29C6F16"
      );
      await tx.wait();
      console.log("Contract initialized successfully");
    } catch (e) {
      console.error("Initialization failed:", e.message);
      if (e.data) {
        try {
          const iface = new ethers.utils.Interface([
            "function initialize(address,address,address,address,address)",
          ]);
          const decodedError = iface.parseError(e.data);
          console.error("Decoded revert reason:", decodedError);
        } catch (decodeError) {
          console.error("Failed to decode revert reason:", decodeError.message);
        }
      }
      throw new Error("Cannot proceed without initialized contract. Please redeploy or initialize manually.");
    }
  }

  // Check eyeToken balance
  console.log("Checking eyeToken balance...");
  try {
    const contractBalance = await eyeToken.balanceOf(icoAndVestingAddress);
    console.log(`Contract EYE balance: ${ethers.utils.formatEther(contractBalance)}`);
    if (contractBalance.isZero()) {
      console.warn("Contract has no EYE tokens. Purchases may fail.");
    }
  } catch (e) {
    console.error("Failed to read eyeToken balance:", e.message);
  }

  // Check sale status
  console.log("Checking sale status...");
  let saleStatus;
  try {
    saleStatus = await icoAndVesting.getFullContractStatus();
    console.log("Sale Status:", {
      phase: saleStatus.phase.toString(),
      isActive: saleStatus.isActive,
      hasStarted: saleStatus.hasStarted,
      hasEnded: saleStatus.hasEnded,
      currentTime: saleStatus.currentTime.toString(),
      phaseStartTime: saleStatus.phaseStartTime.toString(),
      phaseEndTime: saleStatus.phaseEndTime.toString(),
      isWhitelistSet: saleStatus.isWhitelistSet,
      contractTokenBalance: ethers.utils.formatEther(saleStatus.contractTokenBalance),
      isPaused: saleStatus.isPaused,
      fundReceiver: saleStatus.fundReceiver,
    });
  } catch (e) {
    console.error("Failed to get sale status:", e.message);
    console.warn("Proceeding with sale configuration...");
  }

  // Configure sale if not active
  if (!saleStatus || !saleStatus.isActive) {
    console.log("Sale is not active. Configuring pre-sale...");
    try {
      // Set whitelist Merkle root
      const tx1 = await icoAndVesting.connect(owner).setWhitelistMerkleRoot(merkleRoot);
      await tx1.wait();
      console.log(`Set Merkle root: ${merkleRoot}`);

      // Start pre-sale
      const startTime = Math.floor(Date.now() / 1000) + 60; // Start 1 minute from now
      const duration = 3600; // 1 hour
      const tx2 = await icoAndVesting.connect(owner).startPreSale(startTime, duration);
      await tx2.wait();
      console.log(`Started pre-sale: startTime=${startTime}, duration=${duration}`);
    } catch (e) {
      console.error("Failed to configure sale:", e.message);
      throw new Error("Cannot proceed without active sale");
    }
  }

  // Check whitelist status
  console.log("Checking whitelist status...");
  try {
    const whitelistStatus = await icoAndVesting.debugWhitelist(merkleProof);
    console.log("Whitelist Status:", {
      isWhitelisted: whitelistStatus.isWhitelistedResult,
      calculatedLeaf: whitelistStatus.calculatedLeaf,
      currentRoot: whitelistStatus.currentRoot,
    });
    if (!whitelistStatus.isWhitelistedResult) {
      console.warn("Address not whitelisted. Purchase may fail in pre-sale.");
    }
  } catch (e) {
    console.error("Failed to check whitelist:", e.message);
  }

  // Mint/transfer USDC to test address
  console.log(`Minting/transferring USDC to ${testAddress}...`);
  const usdcAmount = ethers.utils.parseUnits("1000", 6); // 1000 USDC (6 decimals)
  try {
    await mockUSDC.connect(owner).mint(testAddress, usdcAmount);
    console.log(`Minted ${ethers.utils.formatUnits(usdcAmount, 6)} USDC to ${testAddress}`);
  } catch (e) {
    console.warn("Mint failed, attempting transfer...");
    try {
      await mockUSDC.connect(owner).transfer(testAddress, usdcAmount);
      console.log(`Transferred ${ethers.utils.formatUnits(usdcAmount, 6)} USDC to ${testAddress}`);
    } catch (transferError) {
      console.error("USDC transfer failed:", transferError.message);
      throw new Error("Cannot proceed without USDC");
    }
  }

  // Approve USDC for ICO contract
  console.log(`Approving USDC for ICO contract...`);
  await mockUSDC.connect(wallet).approve(icoAndVestingAddress, usdcAmount);
  console.log(`Approved ${ethers.utils.formatUnits(usdcAmount, 6)} USDC for ICO contract`);

  // Check USDC balance
  const usdcBalance = await mockUSDC.balanceOf(testAddress);
  console.log(`USDC balance of ${testAddress}: ${ethers.utils.formatUnits(usdcBalance, 6)}`);

  // Buy tokens with POL
  console.log("Attempting to buy tokens with POL...");
  const polAmount = ethers.utils.parseEther("1"); // 1 POL
  try {
    const tx = await icoAndVesting
      .connect(wallet)
      .buyTokensWithPOL(merkleProof, { value: polAmount });
    const receipt = await tx.wait();
    console.log("Buy Tokens with POL successful:", {
      txHash: receipt.transactionHash,
      gasUsed: receipt.gasUsed.toString(),
    });

    // Check token balance
    const tokenBalance = await eyeToken.balanceOf(testAddress);
    console.log(`EYE token balance after POL purchase: ${ethers.utils.formatEther(tokenBalance)}`);
  } catch (e) {
    console.error("Buy Tokens with POL failed:", e.message);
    console.log("Trying emergencyBuyTokens...");
    try {
      const tx = await icoAndVesting
        .connect(wallet)
        .emergencyBuyTokens(merkleProof, { value: polAmount });
      const receipt = await tx.wait();
      console.log("Emergency Buy Tokens with POL successful:", {
        txHash: receipt.transactionHash,
        gasUsed: receipt.gasUsed.toString(),
      });
    } catch (emergencyError) {
      console.error("Emergency Buy Tokens with POL failed:", emergencyError.message);
    }
  }

  // Buy tokens with USDC
  console.log("Attempting to buy tokens with USDC...");
  const usdcPurchaseAmount = ethers.utils.parseUnits("100", 6); // 100 USDC
  try {
    const tx = await icoAndVesting
      .connect(wallet)
      .buyTokensWithUSDC(usdcPurchaseAmount, merkleProof);
    const receipt = await tx.wait();
    console.log("Buy Tokens with USDC successful:", {
      txHash: receipt.transactionHash,
      gasUsed: receipt.gasUsed.toString(),
    });

    // Check token balance
    const tokenBalance = await eyeToken.balanceOf(testAddress);
    console.log(`EYE token balance after USDC purchase: ${ethers.utils.formatEther(tokenBalance)}`);

    // Check vesting schedule
    const vestingDetails = await icoAndVesting.getVestingDetails(testAddress);
    console.log("Vesting Details:", {
      totalAmount: ethers.utils.formatEther(vestingDetails.totalAmount),
      released: ethers.utils.formatEther(vestingDetails.released),
      releasable: ethers.utils.formatEther(vestingDetails.releasable),
      vestingStart: vestingDetails.vestingStart.toString(),
      vestingEnd: vestingDetails.vestingEnd.toString(),
      cliffEnd: vestingDetails.cliffEnd.toString(),
      vestingType: vestingDetails.vestingType.toString(),
    });
  } catch (e) {
    console.error("Buy Tokens with USDC failed:", e.message);
  }

  // Check for stuck POL
  console.log("Checking for stuck POL in contract...");
  const contractBalance = await ethers.provider.getBalance(icoAndVestingAddress);
  console.log(`Contract POL balance: ${ethers.utils.formatEther(contractBalance)}`);

  if (contractBalance.gt(0)) {
    console.log(`Withdrawing stuck POL to ${owner.address}...`);
    try {
      const tx = await icoAndVesting.connect(owner).withdrawStuckPOL(owner.address);
      await tx.wait();
      console.log(`Withdrew ${ethers.utils.formatEther(contractBalance)} POL to ${owner.address}`);
    } catch (e) {
      console.error("Withdraw stuck POL failed:", e.message);
    }
  } else {
    console.log("No stuck POL to withdraw.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });