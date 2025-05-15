const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("EYETokenDeployment", (m) => {
  // Parameters - ensure fundReceiver is a string address
  const fundReceiverAddress = "0xe8239aFA5Cc7Ec80d27713A60D2E50facbeA3BC0"; // Direct address string
  const fundReceiver = m.getParameter("fundReceiver", fundReceiverAddress);
  const polUsdPriceFeed = "0x001382149eBa3441043c1c66972b4772963f5D43";
  const usdcUsdPriceFeed = "0x1b8739bB4CdF0089d07097A9Ae5Bd274b29C6F16";

  // Deploy MockUSDC
  const mockUSDC = m.contract("MockUSDC");

  // Deploy EYE token - pass the gnosisSafe address to the constructor
  const gnosisSafeAddress = "0xe8239aFA5Cc7Ec80d27713A60D2E50facbeA3BC0"; // Same as fundReceiver
  const eyeToken = m.contract("EYE", [gnosisSafeAddress]);

  // Deploy EYETokenICOAndVesting as an upgradeable proxy
  const icoAndVesting = m.contract("EYETokenICOAndVesting", [], {
    after: [eyeToken, mockUSDC],
    initializer: {
      name: "initialize",
      args: [
        eyeToken,
        typeof fundReceiver === 'object' ? fundReceiver.address : fundReceiver,
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
  });

  // Transfer 200M EYE tokens to the ICO contract
  m.call(eyeToken, "transfer", [icoAndVesting, "200000000000000000000000000"], {
    from: typeof fundReceiver === 'object' ? fundReceiver.address : fundReceiver,
    after: [icoAndVesting],
  });

  return { eyeToken, mockUSDC, icoAndVesting };
});
