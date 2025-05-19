const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("EYETokenDeployment", (m) => {
  const fundReceiverAddress = "0xe8239aFA5Cc7Ec80d27713A60D2E50facbeA3BC0";
  const polUsdPriceFeed = "0x001382149eBa3441043c1c66972b4772963f5D43";
  const usdcUsdPriceFeed = "0x1b8739bB4CdF0089d07097A9Ae5Bd274b29C6F16";

  // Deploy MockUSDC
  const mockUSDC = m.contract("MockUSDC", [], {
    id: "MockUSDC",
  });

  // Deploy EYE token
  const eyeToken = m.contract("EYE", [fundReceiverAddress], {
    id: "EYE",
  });

  // Deploy EYETokenICOAndVesting as an upgradeable proxy
  const icoAndVesting = m.contract("EYETokenICOAndVesting", [], {
    id: "EYETokenICOAndVesting",
    after: [eyeToken, mockUSDC],
    initializer: {
      name: "initialize",
      args: [
        eyeToken,
        fundReceiverAddress,
        mockUSDC,
        polUsdPriceFeed,
        usdcUsdPriceFeed,
      ],
    },
    upgradeable: true,
    proxy: {
      proxyContract: "OpenZeppelinTransparentProxy",
      upgradeable: "uups",
    },
    gasLimit: 5000000, // Increase gas limit for initialization
  });

  // Transfer 200M EYE tokens to the ICO contract
  m.call(eyeToken, "transfer", [icoAndVesting, "200000000000000000000000000"], {
    id: "EYE_transfer",
    from: fundReceiverAddress,
    after: [icoAndVesting],
  });

  // Verify initialization
  m.call(icoAndVesting, "eyeToken", [], {
    id: "verify_initialization",
    after: [icoAndVesting],
    executor: async ({ getContract, call }) => {
      try {
        const contract = await getContract("EYETokenICOAndVesting");
        const eyeTokenAddr = await call(contract, "eyeToken", []);
        const fundReceiver = await call(contract, "fundReceiverAddress", []);
        const currentPhase = await call(contract, "currentPhase", []);
        console.log("Post-deployment state:", {
          eyeToken: eyeTokenAddr,
          fundReceiver: fundReceiver,
          currentPhase: currentPhase.toString(),
        });
        if (eyeTokenAddr === "0x0000000000000000000000000000000000000000") {
          throw new Error("Initialization failed: eyeToken is zero address");
        }
      } catch (e) {
        console.error("Initialization verification failed:", e.message);
        throw e;
      }
    },
  });

  return { eyeToken, mockUSDC, icoAndVesting };
});