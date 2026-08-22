import { network } from "hardhat";

async function main() {
  const { viem } = await network.connect();

  const contract = await viem.deployContract(
    "ConsentManager"
  );

  console.log(
    "ConsentManager deployed to:",
    contract.address
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});