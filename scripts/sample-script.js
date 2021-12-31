// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require('hardhat')

async function main() {
  [treasury, ...addrs] = await ethers.getSigners()

  const PawnShop = await hre.ethers.getContractFactory('PawnShop')
  const pawnShop = await PawnShop.deploy(treasury.address, treasury.address)

  console.log("=======================================================")
  console.log("====...................DEPLOYING.......................")
  console.log("====...................................................")
  console.log("=======================================================")
  await pawnShop.deployed()
  console.log("RECEIPT")
  console.log(await pawnShop.deployTransaction.wait())
  console.log("DEPLOYED!")
  console.log('PawnShop deployed to:', pawnShop.address)

  console.log("\n\n=======================================================")
  console.log("====...................SET SERVICE RATE................")
  console.log("====...................................................")
  console.log("=======================================================")
  await pawnShop.setServiceFeeRates(
    [
      '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
    ],
    [0],
  )
  console.log("SET!")

  // check service fee rate
  console.log("\n\nRECHECK service fee rate")
  console.log(`Service fee ETH: ${await pawnShop.getServiceFeeRate('0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE')}`)
  console.log(`ETH supported: ${await pawnShop.supportedTokens('0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE')}`)

  console.log("\nFINISH!!!")
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
