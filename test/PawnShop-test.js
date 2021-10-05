const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Greeter", function () {
  it("Should return the new greeting once it's changed", async function () {
    [treasury, borrower, lender, ...addrs] = await ethers.getSigners();

    const PawnShop = await hre.ethers.getContractFactory("PawnShop");
    const pawnShop = await PawnShop.deploy(treasury.address);
    await pawnShop.deployed();

    expect(await pawnShop.treasury()).to.equal(treasury.address);

    const setting = await pawnShop.setting();

    expect(setting.auctionPeriod).to.equal(ethers.BigNumber.from('259200'));
  });
});
