const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const utils = require("../utils/utils.js");

describe("Greeter", function () {
  let treasury, borrower, lender, addrs;
  let simpleToken, simpleERC721, pawnShop; // treasur
  const tokenId = 1;
  const amount = 100;
  let data;
  before(async function () {
    [treasury, borrower, lender, ...addrs] = await ethers.getSigners();
    const SimpleToken = await ethers.getContractFactory("SimpleTokenERC20");
    simpleToken = await SimpleToken.deploy();
    await simpleToken.deployed(); // simpleToken.signer.address = treasury
    const SimpleERC721 = await ethers.getContractFactory("SimpleERC721");
    simpleERC721 = await SimpleERC721.deploy();
    await simpleERC721.deployed();
    await simpleToken.mint(lender.address, utils.convertBig(100 * 10 ** 18));
    await simpleToken.mint(borrower.address, utils.convertBig(100 * 10 ** 18));
    console.log(
      `balance treasury: ${utils.convertInt(
        await simpleToken.balanceOf(treasury.address)
      )}`
    );
    console.log(
      `balance lender: ${utils.convertInt(
        await simpleToken.balanceOf(lender.address)
      )}`
    );
    console.log(
      `balance borrower: ${utils.convertInt(
        await simpleToken.balanceOf(borrower.address)
      )}`
    );
  });
  beforeEach(async function () {
    const PawnShop = await ethers.getContractFactory("PawnShop");
    pawnShop = await PawnShop.deploy(treasury.address);
    await pawnShop.deployed();
    // set fee
    await pawnShop.setFee(simpleToken.address, 100000, 20000); // 10% & 2%
    // let currentTime = utils.convertInt(await network.provider.send("evm_mine"));
    let currentTime = Math.round(Date.now() / 1000);
    data = {
      collection: simpleERC721.address,
      tokenId: tokenId,
      dest: borrower.address,
      amount: amount,
      paymentToken: simpleToken.address,
      borrowCycleNo: 1,
      startTime: currentTime,
      endTime: currentTime + 60 * 60 * 24 * 7, // 7 days after
    };
    // create nft & make approve for pawnshop
    await simpleERC721.mint(borrower.address, tokenId);
    await simpleERC721.connect(borrower).approve(pawnShop.address, tokenId);
  });

  afterEach(async function () {
    await simpleERC721.burn(tokenId).catch((err) => {});
  });

  it("Should return the new greeting once it's changed", async function () {
    expect(await pawnShop.treasury()).to.equal(treasury.address);

    const setting = await pawnShop.setting();

    expect(setting.auctionPeriod).to.equal(ethers.BigNumber.from("259200"));
  });

  //
  // CREATE OFFER
  //
  describe("Create offer", async function () {
    it("should create offer success with valid amount", async function () {
      // expect getApproved NFt == pawnshop address
      expect(await simpleERC721.getApproved(tokenId)).to.eq(pawnShop.address);
      // create offer check event OfferCreated
      await expect(
        pawnShop
          .connect(borrower)
          .createOffer(
            data.collection,
            data.tokenId,
            data.dest,
            data.amount,
            data.paymentToken,
            data.borrowCycleNo,
            data.startTime,
            data.endTime
          )
      )
        .to.emit(pawnShop.connect(borrower), "OfferCreated")
        .withArgs(
          data.collection,
          utils.convertBig(data.tokenId),
          borrower.address,
          data.dest,
          utils.convertBig(data.amount),
          data.paymentToken,
          utils.convertBig(data.startTime),
          utils.convertBig(data.endTime)
        );
    });

    it("should raise error when creating offer success with non-approve nft", async function () {
      // change approve to make it non approve
      await simpleERC721.connect(borrower).approve(treasury.address, tokenId);
      await pawnShop
        .connect(borrower)
        .createOffer(
          data.collection,
          data.tokenId,
          data.dest,
          data.amount,
          data.paymentToken,
          data.borrowCycleNo,
          data.startTime,
          data.endTime
        )
        .catch((err) => {
          expect(err.message).to.include("please approve NFT first");
        });
    });

    it("should failed to create offer with invalid amount", async function () {
      data.amount = 0;
      await pawnShop
        .connect(borrower)
        .createOffer(
          data.collection,
          data.tokenId,
          data.dest,
          data.amount,
          data.paymentToken,
          data.borrowCycleNo,
          data.startTime,
          data.endTime
        )
        .catch((err) => {
          expect(err.message).to.include("Amount must be greater than 0");
        });
    });

    it("should failed to create offer with invalid _borrowCycleNo", async function () {
      data.borrowCycleNo = 0;
      await pawnShop
        .connect(borrower)
        .createOffer(
          data.collection,
          data.tokenId,
          data.dest,
          data.amount,
          data.paymentToken,
          data.borrowCycleNo,
          data.startTime,
          data.endTime
        )
        .catch((err) => {
          expect(err.message).to.include(
            "Cycle number must be greater than or equal 1"
          );
        });
    });

    it("should failed to create offer with non-support currency", async function () {
      data.paymentToken = borrower.address;
      await pawnShop
        .connect(borrower)
        .createOffer(
          data.collection,
          data.tokenId,
          data.dest,
          data.amount,
          data.paymentToken,
          data.borrowCycleNo,
          data.startTime,
          data.endTime
        )
        .catch((err) => {
          expect(err.message).to.include("invalid-payment-token");
        });
    });

    it("should failed to create offer with payment token is address 0", async function () {
      data.paymentToken = utils.address0;
      await pawnShop
        .connect(borrower)
        .createOffer(
          data.collection,
          data.tokenId,
          data.dest,
          data.amount,
          data.paymentToken,
          data.borrowCycleNo,
          data.startTime,
          data.endTime
        )
        .catch((err) => {
          expect(err.message).to.include("invalid-payment-token");
        });
    });

    it("should failed to create offer  with invalid end time", async function () {
      data.endTime = 0;
      await pawnShop
        .connect(borrower)
        .createOffer(
          data.collection,
          data.tokenId,
          data.dest,
          data.amount,
          data.paymentToken,
          data.borrowCycleNo,
          data.startTime,
          data.endTime
        )
        .catch((err) => {
          expect(err.message).to.include("invalid-end-time");
        });
    });
  });

  //
  // APPLY OFFER
  //
  describe("Apply offer", async function () {
    beforeEach(async function () {
      await pawnShop
        .connect(borrower)
        .createOffer(
          data.collection,
          data.tokenId,
          data.dest,
          data.amount,
          data.paymentToken,
          data.borrowCycleNo,
          data.startTime,
          data.endTime
        );
    });
    afterEach(async function () {
      await pawnShop
        .connect(borrower)
        .cancelOffer(data.collection, data.tokenId)
        .catch((e) => {});
    });

    it("should failed to apply offer which has updated amount", async function () {
      // update change amount
      await pawnShop
        .connect(borrower)
        .updateOffer(data.collection, data.tokenId, data.amount * 2);
      await pawnShop
        .connect(lender)
        .applyOffer(data.collection, data.tokenId, data.amount)
        .catch((err) => {
          expect(err.message).to.include("offer amount has changed");
        });
    });
    it("should failed to apply non-open offer", async function () {
      // apply offer to make it become in progress offer
      await simpleToken.approve(pawnShop.address, data.amount);
      await pawnShop.applyOffer(data.collection, data.tokenId, data.amount);
      await pawnShop
        .connect(lender)
        .applyOffer(data.collection, data.tokenId, data.amount)
        .catch((err) => {
          expect(err.message).to.include("apply-non-open-offer");
        });
    });
    it("should failed to apply expired offer", async function () {
      let newTokenId = tokenId + 1;
      await simpleERC721.mint(borrower.address, newTokenId);
      await simpleERC721
        .connect(borrower)
        .approve(pawnShop.address, newTokenId);
      // create a expired offer
      await pawnShop
        .connect(borrower)
        .createOffer(
          data.collection,
          newTokenId,
          data.dest,
          data.amount,
          simpleToken.address,
          data.borrowCycleNo,
          data.startTime,
          data.startTime + 1000
        );
      // approve
      await simpleToken.connect(lender).approve(pawnShop.address, data.amount);
      // increase block timestamp
      await network.provider.send("evm_increaseTime", [10000]);
      await pawnShop
        .connect(lender)
        .applyOffer(data.collection, data.tokenId, data.amount)
        .catch((err) => {
          expect(err.message).to.include("expired-order");
        });
      await simpleERC721.burn(newTokenId);
    });
    it("should failed to apply offer with not enough USDC", async function () {
      await simpleToken
        .connect(lender)
        .approve(pawnShop.address, data.amount - 10);
      await pawnShop
        .connect(lender)
        .applyOffer(data.collection, data.tokenId, data.amount)
        .catch((err) => {
          expect(err.message).to.include("ERC20");
        });
    });

    it("should apply success", async function () {
      simpleToken.connect(lender).approve(pawnShop.address, data.amount);
      await expect(
        pawnShop
          .connect(lender)
          .applyOffer(data.collection, data.tokenId, data.amount)
      )
        .to.emit(pawnShop, "OfferApplied")
        .withArgs(
          data.collection,
          data.tokenId,
          pawnShop.connect(lender).signer.address
        );
    });
  });

  //
  // REPAY
  //
  describe("Repay", async function () {
    beforeEach(async function () {
      const currentTime = utils.convertInt(await pawnShop.currentTime());
      await pawnShop
        .connect(borrower)
        .createOffer(
          data.collection,
          data.tokenId,
          data.dest,
          data.amount,
          data.paymentToken,
          data.borrowCycleNo,
          currentTime,
          currentTime + 60 * 60 * 24 * 7
        );
    });

    it("can not repay an non in progress offer", async function () {
      await pawnShop
        .connect(borrower)
        .repay(data.collection, data.tokenId)
        .catch((err) => {
          expect(err.message).to.include("repay-in-progress-offer-only");
        });
    });

    it("can not repay an offer with insufficient USDC", async function () {
      await simpleToken.connect(lender).approve(pawnShop.address, data.amount);
      await pawnShop
        .connect(lender)
        .applyOffer(data.collection, data.tokenId, data.amount);
      await pawnShop
        .connect(borrower)
        .repay(data.collection, data.tokenId)
        .catch((err) => {
          expect(err.message).to.include("ERC20");
        });
    });

    it("can not repay an expired offer", async function () {
      await simpleToken.connect(lender).approve(pawnShop.address, data.amount);
      await pawnShop
        .connect(lender)
        .applyOffer(data.collection, data.tokenId, data.amount);
      // set timeblock stamp over time
      await network.provider.send("evm_setNextBlockTimestamp", [
        data.endTime + 60 * 60 * 24 * 7 + 100, // after 7 day
      ]);

      await pawnShop
        .connect(borrower)
        .repay(data.collection, data.tokenId)
        .catch((err) => {
          expect(err.message).to.include("overdue loan");
        });
    });

    it("clear offer after repay successfully", async function () {
      // approve & apply success
      await simpleToken.connect(lender).approve(pawnShop.address, data.amount);
      await pawnShop
        .connect(lender)
        .applyOffer(data.collection, data.tokenId, data.amount);
      // balance of borrower & lender
      const balanceBorrower = await simpleToken.balanceOf(borrower.address);
      const balanceLender = await simpleToken.balanceOf(lender.address);
      // repay success
      await simpleToken
        .connect(borrower)
        .approve(pawnShop.address, data.amount);
      await expect(
        pawnShop.connect(borrower).repay(data.collection, data.tokenId)
      )
        .to.emit(pawnShop.connect(borrower), "Repay")
        .withArgs(
          data.collection,
          data.tokenId,
          pawnShop.connect(borrower).signer.address,
          data.amount
        );
      // check clear
      const offer = await pawnShop.getOfferParams(
        data.collection,
        data.tokenId
      );
      expect(offer.lender).to.eq(utils.address0);
      expect(utils.convertInt(offer.borrowAmount)).to.eq(0);
      // check borrower NFT balance
      expect(await simpleToken.balanceOf(borrower.address)).to.eq(
        balanceBorrower.sub(100)
      );
      // check lender USDC balance
      expect(await simpleToken.balanceOf(lender.address)).to.eq(
        balanceLender.add(100)
      );
    });
  });

  //
  //
  // UPDATE OFFER
  //
  describe("Update Offer", async function () {
    beforeEach(async function () {
      const currentTime = utils.convertInt(await pawnShop.currentTime());
      await pawnShop
        .connect(borrower)
        .createOffer(
          data.collection,
          data.tokenId,
          data.dest,
          data.amount,
          data.paymentToken,
          data.borrowCycleNo,
          currentTime,
          currentTime + 60 * 60 * 24 * 7
        );
    });

    it("only borrower can update offer", async function () {
      await pawnShop
        .updateOffer(data.collection, data.tokenId, data.amount)
        .catch((err) => {
          expect(err.message).to.include("only owner can update offer");
        });
    });

    it("can only update un-apply offer", async function () {
      await simpleToken.connect(lender).approve(pawnShop.address, data.amount);
      await pawnShop
        .connect(lender)
        .applyOffer(data.collection, data.tokenId, data.amount);
      await pawnShop
        .connect(borrower)
        .updateOffer(data.collection, data.tokenId, data.amount)
        .catch((err) => {
          expect(err.message).to.include("only update unapply offer");
        });
    });

    it("should raise when updating invalid amount", async function () {
      await pawnShop
        .connect(borrower)
        .updateOffer(data.collection, data.tokenId, 0)
        .catch((err) => {
          expect(err.message).to.include("Amount must be greater than 0");
        });
    });

    it("should update success", async function () {
      await expect(
        pawnShop
          .connect(borrower)
          .updateOffer(data.collection, data.tokenId, data.amount * 2)
      )
        .to.emit(pawnShop.connect(borrower), "OfferUpdated")
        .withArgs(data.collection, data.tokenId, data.amount * 2);

      // check amount
      const offer = await pawnShop.getOfferParams(
        data.collection,
        data.tokenId
      );
      expect(offer.borrowAmount).to.eq(utils.convertBig(data.amount * 2));
    });
  });

  //
  //
  //
  // CANCEL OFFER
  //
  describe("Cancel offer", async function () {
    beforeEach(async function () {
      const currentTime = utils.convertInt(await pawnShop.currentTime());
      await pawnShop
        .connect(borrower)
        .createOffer(
          data.collection,
          data.tokenId,
          data.dest,
          data.amount,
          data.paymentToken,
          data.borrowCycleNo,
          currentTime,
          currentTime + 60 * 60 * 24 * 7
        );
    });

    it("only borrower can cancel offer", async function () {
      await pawnShop.cancelOffer(data.collection, data.tokenId).catch((err) => {
        expect(err.message).to.include("only owner can cancel offer");
      });
    });

    it("can only cancle open offer", async function () {
      // apply offer
      await simpleToken.connect(lender).approve(pawnShop.address, data.amount);
      await pawnShop
        .connect(lender)
        .applyOffer(data.collection, data.tokenId, data.amount);
      await pawnShop
        .connect(borrower)
        .cancelOffer(data.collection, data.tokenId)
        .catch((err) => {
          expect(err.message).to.include("only update unapply offer");
        });
    });

    it("should cancel success", async function () {
      // cancel success
      await expect(
        pawnShop.connect(borrower).cancelOffer(data.collection, data.tokenId)
      )
        .to.emit(pawnShop.connect(borrower), "OfferCancelled")
        .withArgs(data.collection, data.tokenId);
      // check NFT back to borrower
      expect(await simpleERC721.ownerOf(data.tokenId)).to.eq(borrower.address);
      // check clear offer
      const offer = await pawnShop.getOfferParams(
        data.collection,
        data.tokenId
      );
      expect(offer.borrowAmount).to.eq(0);
    });
  });

  //
  //
  //
  // EXTEND LENDING TIME OFFER
  //
  describe("Extend lending time offer", async function () {
    beforeEach(async function () {
      const currentTime = utils.convertInt(await pawnShop.currentTime());
      await pawnShop
        .connect(borrower)
        .createOffer(
          data.collection,
          data.tokenId,
          data.dest,
          data.amount,
          data.paymentToken,
          data.borrowCycleNo,
          currentTime,
          currentTime + 60 * 60 * 24 * 7
        );
      // apply offer
      await simpleToken.connect(lender).approve(pawnShop.address, data.amount);
      await pawnShop
        .connect(lender)
        .applyOffer(data.collection, data.tokenId, data.amount);
    });

    it("should failed to extend with invalid cycle number", async function () {
      await pawnShop
        .connect(borrower)
        .extendLendingTime(data.collection, data.tokenId, 0)
        .catch((err) => {
          expect(err.message).to.include(
            "Cycle number must be greater than or equal 1"
          );
        });
    });

    it("only borrower can extend offer's lending time", async function () {
      await pawnShop
        .extendLendingTime(data.collection, data.tokenId, 1)
        .catch((err) => {
          expect(err.message).to.include("only-owner-can-extend-lending-time");
        });
    });
    it("can not update expired offer", async function () {
      await network.provider.send("evm_increaseTime", [60 * 60 * 24 * 7 + 50]);
      await pawnShop
        .connect(borrower)
        .extendLendingTime(data.collection, data.tokenId, 1)
        .catch((err) => {
          expect(err.message).to.include("lending-time-closed");
        });
    });

    it("can not update offer with insuficient USDC fees", async function () {
      await pawnShop
        .connect(borrower)
        .extendLendingTime(data.collection, data.tokenId, 1)
        .catch((err) => {
          expect(err.message).to.include("ERC20");
        });
    });

    it("should update extending successfully 1 cycle", async function () {
      // extend success
      // Currently, we dont have get extend amount, so we'll test with approval gt necessary amount
      await simpleToken
        .connect(borrower)
        .approve(pawnShop.address, data.amount);
      // get lending cycle time to calculate args emitted
      const offerSetting = await pawnShop.getOfferSetting(
        data.collection,
        data.tokenId
      );
      const offerParams = await pawnShop.getOfferParams(
        data.collection,
        data.tokenId
      );
      const extendCycle = 1;
      const extendLendingPeriod = offerSetting.lendingPerCycle.mul(extendCycle);
      const liquidationPeriod = offerSetting.liquidationPeriod;
      const newEndLendingAt = offerParams.endLendingAt.add(extendLendingPeriod);
      const YEAR_IN_SECONDS = 31556926;
      const interestFee = extendLendingPeriod
        .mul(offerSetting.lenderFeeRate)
        .div(YEAR_IN_SECONDS)
        .div(1000000);
      const serviceFee = extendLendingPeriod
        .mul(offerParams.borrowAmount)
        .mul(offerSetting.serviceFeeRate)
        .div(YEAR_IN_SECONDS)
        .div(1000000);

      const balanceTreasury = await simpleToken.balanceOf(treasury.address);
      const balanceLender = await simpleToken.balanceOf(lender.address);
      await expect(
        pawnShop
          .connect(borrower)
          .extendLendingTime(data.collection, data.tokenId, extendCycle)
      )
        .to.emit(pawnShop.connect(borrower), "ExtendLendingTimeRequested")
        .withArgs(
          data.collection,
          data.tokenId,
          newEndLendingAt,
          newEndLendingAt.add(liquidationPeriod),
          interestFee,
          serviceFee
        );
      // check fee has been transfer yet
      expect(await simpleToken.balanceOf(treasury.address)).to.eq(
        balanceTreasury.add(serviceFee)
      );
      expect(await simpleToken.balanceOf(lender.address)).to.eq(
        balanceLender.add(interestFee)
      );
    });
  });

  //
  //
  // CLAIM OFFER
  //
  describe("Claim offer", async function () {
    beforeEach(async function () {
      const currentTime = utils.convertInt(await pawnShop.currentTime());
      await pawnShop
        .connect(borrower)
        .createOffer(
          data.collection,
          data.tokenId,
          data.dest,
          data.amount,
          data.paymentToken,
          data.borrowCycleNo,
          currentTime,
          currentTime + 60 * 60 * 24 * 7
        );
      // apply offer
      await simpleToken.connect(lender).approve(pawnShop.address, data.amount);
      await pawnShop
        .connect(lender)
        .applyOffer(data.collection, data.tokenId, data.amount);
    });
    it("can not claim an in-progress offer", async function () {
      await pawnShop
        .connect(lender)
        .claim(data.collection, data.tokenId)
        .catch((e) => {
          expect(e.message).to.include("can not claim in lending period");
        });
    });
    it("only lender can claim in liquidation time", async function () {
      const offer = await pawnShop.getOfferParams(
        data.collection,
        data.tokenId
      );
      await network.provider.send("evm_setNextBlockTimestamp", [
        utils.convertInt(offer.endLendingAt.add(100)), // after 7 day
      ]);
      await pawnShop.claim(data.collection, data.tokenId).catch((e) => {
        expect(e.message).to.include("only lender can claim NFT at this time");
      });
    });
    it("only lender can claim after ending time", async function () {
      const offer = await pawnShop.getOfferParams(
        data.collection,
        data.tokenId
      );
      await network.provider.send("evm_setNextBlockTimestamp", [
        utils.convertInt(offer.endLendingAt.add(100)), // after 7 day
      ]);
      await pawnShop
        .connect(treasury)
        .claim(data.collection, data.tokenId)
        .catch((e) => {
          expect(e.message).to.include(
            "only lender can claim NFT at this time"
          );
        });
      await expect(
        pawnShop.connect(lender).claim(data.collection, data.tokenId)
      )
        .to.emit(pawnShop, "NFTClaim")
        .withArgs(data.collection, data.tokenId, lender.address);
    });
    it("no one except admin, lender, borrower can claim after preiod liquidition time", async function () {
      const offer = await pawnShop.getOfferParams(
        data.collection,
        data.tokenId
      );
      await network.provider.send("evm_setNextBlockTimestamp", [
        utils.convertInt(offer.liquidationAt.add(100)), // after 7 day
      ]);
      await pawnShop
        .connect(addrs[0])
        .claim(data.collection, data.tokenId)
        .catch((e) => {
          expect(e.message).to.include("invalid-address");
        });
    });
    it("borrower can claim successfully after preiod liquidtion time", async function () {
      const offer = await pawnShop.getOfferParams(
        data.collection,
        data.tokenId
      );
      await network.provider.send("evm_setNextBlockTimestamp", [
        utils.convertInt(offer.liquidationAt.add(100)), // after 7 day
      ]);
      await expect(
        pawnShop.connect(borrower).claim(data.collection, data.tokenId)
      )
        .to.emit(pawnShop, "NFTClaim")
        .withArgs(data.collection, data.tokenId, borrower.address);

      //check owner NFT
      expect(await simpleERC721.ownerOf(data.tokenId)).to.eq(borrower.address);
    });
  });

  //
  //
  // UPDATE SETTINGS
  //

  describe("Update setting", async function () {
    it("only admin can update setting", async function () {
      await pawnShop
        .connect(lender)
        .setAuctionPeriod(100)
        .catch((e) => {
          expect(e.message).to.include("Ownable: caller is not the owner");
        });
      await pawnShop.setAuctionPeriod(100);
      const setting = await pawnShop.setting();
      expect(setting.auctionPeriod).to.eq(100);
    });
    it("update lender fee and service for USDC successfully", async function () {
      await pawnShop.setFee(simpleToken.address, 11000, 2000);
      const fee = await pawnShop.getFee(simpleToken.address);
      expect(fee.lenderFeeRate).to.eq(11000);
      expect(fee.serviceFeeRate).to.eq(2000);
    });
    it("update lender fee and service for USDC NO EFFECT previous same token offer", async function () {
      const currentTime = utils.convertInt(await pawnShop.currentTime());
      await pawnShop
        .connect(borrower)
        .createOffer(
          data.collection,
          data.tokenId,
          data.dest,
          data.amount,
          data.paymentToken,
          data.borrowCycleNo,
          currentTime,
          currentTime + 60 * 60 * 24 * 7
        );
      await pawnShop.setFee(simpleToken.address, 11000, 2000);
      const offerSetting = await pawnShop.getOfferSetting(
        data.collection,
        data.tokenId
      );
      expect(offerSetting.lenderFeeRate).to.not.eq(11000);
      expect(offerSetting.serviceFeeRate).to.not.eq(2000);
    });
  });
});
