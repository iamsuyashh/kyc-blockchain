const hre = require("hardhat");

async function main() {
  const KYC = await hre.ethers.getContractFactory("KYC");
  const kyc = await KYC.deploy();

  await kyc.waitForDeployment();

  const address = await kyc.getAddress();
  console.log("KYC Smart Contract deployed to:", address);
  
  // Create a config file for frontend to use
  const fs = require("fs");
  const contractsDir = __dirname + "/../../frontend/src/config";
  if (!fs.existsSync(contractsDir)) {
    fs.mkdirSync(contractsDir, { recursive: true });
  }

  const contractConfig = {
    address: address
  };

  fs.writeFileSync(
    contractsDir + "/contract-address.json",
    JSON.stringify(contractConfig, undefined, 2)
  );

  // Also copy the artifact (ABI) to the frontend
  const artifact = artifacts.readArtifactSync("KYC");
  fs.writeFileSync(
    contractsDir + "/KYC.json",
    JSON.stringify(artifact, null, 2)
  );

  console.log("Config and ABI copied to frontend!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
