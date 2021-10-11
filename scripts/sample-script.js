// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");

async function main() {
  [treasury, borrower, lender, ...addrs] = await ethers.getSigners();

  const PawnShop = await hre.ethers.getContractFactory("PawnShop");
  const pawnShop = await PawnShop.deploy(treasury);

  await pawnShop.deployed();

  console.log("PawnShop deployed to:", pawnShop.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
