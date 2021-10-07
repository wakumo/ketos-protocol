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

  //
  // CREATE OFFER
  //
  it("should create offer success with valid amount", async function () {
    // create nft
    // approve NFT to pawnshop
    

    // expect getApproved NFt == pawnshop address
    // expect offers[collection][tokenid] correct all data
    // can check event ?
  });

  it("should raise error when creating offer success with non-approve nft", async function () {
  });

  it("should failed to create offer with invalid amount", async function () {
  });

  it("should failed to create offer with invalid _borrowCycleNo", async function () {
  });

  it("should failed to create offer with non-support currency", async function () {
  });

  it("should failed to create offer  with invalid end time", async function () {
  });
  
  //
  // APPLY OFFER
  //
  it("should failed to apply  offerwhich has updated amount", async function () {
  });

  it("should failed to apply non-open offer", async function () {
  });

  it("should failed to apply expired offer", async function () {
  });

  it("should failed to apply offer with not enough USDC", async function () {
    // IERC20(offer.params.paymentToken).transferFrom(msg.sender, offer.params.dest, borrowAmountAfterFee);
    // IERC20(offer.params.paymentToken).transferFrom(msg.sender, treasury, adminFee);
  });
  it("should apply success", async function () {
  });

  //
  // REPAY
  //
  it("can not repay an non in progress offer (liquidation period already)", async function () {
  });
  it("can not repay an expired offer (liquidation period already)", async function () {
  });
  it("can not repay an offer with insufficient USDC", async function () {
  });
  it("clear offer after repay successfully", async function () {
    // check clear
    // check borrower NFT balance
    // check lender USDC balance
  });

  //
  //
  // UPDATE OFFER
  //
  it("only borrower can update offer", async function () {
  });
  it("can only update un-apply offer", async function () {
  });
  it("should raise when updating invalid amount", async function () {
  });
  it("should update success", async function () {
    // check new amount
  });

  //
  //
  //
  // CANCEL OFFER
  //
  it("only borrower can cancel offer", async function () {
  });
  it("can only cancle open offer", async function () {
  });
  it("should cancel success", async function () {
    // check NFT back to borrower
    // check clear offer
  });

  //
  //
  //
  // EXTEND LENDING TIME OF FFER
  //
  it("should failed to extend with invalid cycle number", async function () {
  });
  it("only borrower can extend offer's lending time", async function () {
  });
  it("can not update expired offer", async function () {
  });
  it("can not update offer with insuficient USDC fees", async function () {
  });
  it("should update extending successfully", async function () {
    // Check new extend time
    // Check new ending lending time
    // Check new liquid time
    // Check new post-liquid time
    // check fee has been transfer yet
  });

  //
  //
  // CLAIM OFFER
  //
  it("can not claim an in-progress offer", async function () {
  });
  it("only lender can claim in liquidation time", async function () {
  });
  it("only lender, admin can claim after post-liquidation time", async function () {
  });
  it("should claim successfully", async function () {
    // Check NFT transfer to claimer
    // Clear offer data
    // Raise Event
  });

  //
  //
  // UPDATE SETTINGS
  //
  it("only admin can update setting", async function () {
  });
  it("update lender fee and service for USDC successfully", async function () {
  });
  it("update lender fee and service for USDC NO EFFECT previous same token offer", async function () {
  });
});
