const { expect } = require('chai')
const { ethers, network } = require('hardhat')
const utils = require('../utils/utils.js')

describe('ERC1155 PawnShop', function () {
  let treasury, borrower, lender, addrs
  let testERC20, testERC1155, erc1155PawnShop
  const tokenId = 1
  const amount = utils.convertBig(100 * 10 ** 6)
  const amountNFT = 1
  let data

  before(async function () {
    ;[treasury, borrower, lender, ...addrs] = await ethers.getSigners()
    const TestERC20 = await ethers.getContractFactory('TestERC20')
    testERC20 = await TestERC20.deploy()
    await testERC20.deployed() // testERC20.signer.address = treasury
    const TestERC1155 = await ethers.getContractFactory('TestERC1155')
    testERC1155 = await TestERC1155.deploy()
    await testERC1155.deployed()
    await testERC20.mint(lender.address, utils.convertBig(100 * 10 ** 18))
    await testERC20.mint(borrower.address, utils.convertBig(100 * 10 ** 18))
    // console.log(
    //   `balance treasury: ${utils.convertInt(
    //     await testERC20.balanceOf(treasury.address),
    //   )}`,
    // )
    // console.log(
    //   `balance lender: ${utils.convertInt(
    //     await testERC20.balanceOf(lender.address),
    //   )}`,
    // )
    // console.log(
    //   `balance borrower: ${utils.convertInt(
    //     await testERC20.balanceOf(borrower.address),
    //   )}`,
    // )
  })

  beforeEach(async function () {
    const ERC1155PawnShop = await ethers.getContractFactory('ERC1155PawnShop')
    erc1155PawnShop = await ERC1155PawnShop.deploy(treasury.address)
    await erc1155PawnShop.deployed()
    // set fee
    await erc1155PawnShop.setFee(testERC20.address, 100000, 20000) // 10% & 2%
    // let currentTime = utils.convertInt(await network.provider.send("evm_mine"));
    let currentTime = Math.round(Date.now() / 1000)
    data = {
      collection: testERC1155.address,
      tokenId: tokenId,
      dest: borrower.address,
      amount: amount,
      paymentToken: testERC20.address,
      borrowCycleNo: 1,
      startTime: currentTime,
      endTime: currentTime + 60 * 60 * 24 * 7, // 7 days after
    }
    // create nft & make approve for erc1155PawnShop
    await testERC1155.mint(borrower.address, tokenId, amountNFT)
    await testERC1155
      .connect(borrower)
      .setApprovalForAll(erc1155PawnShop.address, true)
  })

  afterEach(async function () {
    await testERC1155
      .burn(borrower.address, tokenId, amountNFT)
      .catch((err) => {})
  })

  //
  // CREATE OFFER
  //
  describe('Create offer', async function () {
    it('should create offer success with valid amount', async function () {
      // expect getApproved NFt == erc1155PawnShop address
      expect(
        await testERC1155.isApprovedForAll(
          borrower.address,
          erc1155PawnShop.address,
        ),
      ).to.eq(true)
      // create offer check event OfferCreated
      await expect(
        erc1155PawnShop
          .connect(borrower)
          .createOffer(
            data.collection,
            data.tokenId,
            data.dest,
            data.amount,
            data.paymentToken,
            data.borrowCycleNo,
            data.startTime,
            data.endTime,
          ),
      )
        .to.emit(erc1155PawnShop.connect(borrower), 'OfferCreated')
        .withArgs(
          data.collection,
          utils.convertBig(data.tokenId),
          borrower.address,
          data.dest,
          utils.convertBig(data.amount),
          data.paymentToken,
          utils.convertBig(data.startTime),
          utils.convertBig(data.endTime),
          utils.convertBig(604800),
        )
    })

    it('should raise error when creating offer with non-approve nft', async function () {
      // change approve to make it non approve
      await testERC1155
        .connect(borrower)
        .setApprovalForAll(erc1155PawnShop.address, false)
      await erc1155PawnShop
        .connect(borrower)
        .createOffer(
          data.collection,
          data.tokenId,
          data.dest,
          data.amount,
          data.paymentToken,
          data.borrowCycleNo,
          data.startTime,
          data.endTime,
        )
        .catch((err) => {
          expect(err.message).to.include('please approve NFT first')
        })
    })

    it('should failed to create offer with invalid amount', async function () {
      data.amount = 0
      await erc1155PawnShop
        .connect(borrower)
        .createOffer(
          data.collection,
          data.tokenId,
          data.dest,
          data.amount,
          data.paymentToken,
          data.borrowCycleNo,
          data.startTime,
          data.endTime,
        )
        .catch((err) => {
          expect(err.message).to.include('Amount must be greater than 0')
        })
    })

    it('should failed to create offer with small valid amount which leading fee is zero', async function () {
      data.amount = 100
      await erc1155PawnShop
        .connect(borrower)
        .createOffer(
          data.collection,
          data.tokenId,
          data.dest,
          data.amount,
          data.paymentToken,
          data.borrowCycleNo,
          data.startTime,
          data.endTime,
        )
        .catch((err) => {
          expect(err.message).to.include('required minimum lender fee')
        })
    })

    it('should failed to create offer with invalid _borrowCycleNo', async function () {
      data.borrowCycleNo = 0
      await erc1155PawnShop
        .connect(borrower)
        .createOffer(
          data.collection,
          data.tokenId,
          data.dest,
          data.amount,
          data.paymentToken,
          data.borrowCycleNo,
          data.startTime,
          data.endTime,
        )
        .catch((err) => {
          expect(err.message).to.include(
            'Cycle number must be greater than or equal 1',
          )
        })
    })

    it('should failed to create offer with non-support currency', async function () {
      data.paymentToken = borrower.address
      await erc1155PawnShop
        .connect(borrower)
        .createOffer(
          data.collection,
          data.tokenId,
          data.dest,
          data.amount,
          data.paymentToken,
          data.borrowCycleNo,
          data.startTime,
          data.endTime,
        )
        .catch((err) => {
          expect(err.message).to.include('invalid-payment-token')
        })
    })

    it('should failed to create offer with payment token is address 0', async function () {
      data.paymentToken = utils.address0
      await erc1155PawnShop
        .connect(borrower)
        .createOffer(
          data.collection,
          data.tokenId,
          data.dest,
          data.amount,
          data.paymentToken,
          data.borrowCycleNo,
          data.startTime,
          data.endTime,
        )
        .catch((err) => {
          expect(err.message).to.include('invalid-payment-token')
        })
    })

    it('should failed to create offer  with invalid end time', async function () {
      data.endTime = 0
      await erc1155PawnShop
        .connect(borrower)
        .createOffer(
          data.collection,
          data.tokenId,
          data.dest,
          data.amount,
          data.paymentToken,
          data.borrowCycleNo,
          data.startTime,
          data.endTime,
        )
        .catch((err) => {
          expect(err.message).to.include('invalid-end-time')
        })
    })
  })

  //
  // APPLY OFFER
  //
  describe('Apply offer', async function () {
    beforeEach(async function () {
      await erc1155PawnShop
        .connect(borrower)
        .createOffer(
          data.collection,
          data.tokenId,
          data.dest,
          data.amount,
          data.paymentToken,
          data.borrowCycleNo,
          data.startTime,
          data.endTime,
        )
    })
    afterEach(async function () {
      await erc1155PawnShop
        .connect(borrower)
        .cancelOffer(data.collection, data.tokenId)
        .catch((e) => {})
    })

    it('should failed to apply offer which has updated amount', async function () {
      // update change amount
      await erc1155PawnShop
        .connect(borrower)
        .updateOffer(data.collection, data.tokenId, data.amount * 2, 0)
      await erc1155PawnShop
        .connect(lender)
        .applyOffer(data.collection, data.tokenId, data.amount)
        .catch((err) => {
          expect(err.message).to.include('offer amount has changed')
        })
    })
    it('should failed to apply non-open offer', async function () {
      // apply offer to make it become in progress offer
      await testERC20.approve(erc1155PawnShop.address, data.amount)
      await erc1155PawnShop.applyOffer(
        data.collection,
        data.tokenId,
        data.amount,
      )
      await erc1155PawnShop
        .connect(lender)
        .applyOffer(data.collection, data.tokenId, data.amount)
        .catch((err) => {
          expect(err.message).to.include('apply-non-open-offer')
        })
    })
    it('should failed to apply expired offer', async function () {
      let newTokenId = tokenId + 1
      await testERC1155.mint(borrower.address, newTokenId, amountNFT)
      await testERC1155
        .connect(borrower)
        .setApprovalForAll(erc1155PawnShop.address, true)
      // create a expired offer
      await erc1155PawnShop
        .connect(borrower)
        .createOffer(
          data.collection,
          newTokenId,
          data.dest,
          data.amount,
          testERC20.address,
          data.borrowCycleNo,
          data.startTime,
          data.startTime + 1000,
        )
      // approve
      await testERC20
        .connect(lender)
        .approve(erc1155PawnShop.address, data.amount)
      // increase block timestamp
      await network.provider.send('evm_increaseTime', [10000])
      await erc1155PawnShop
        .connect(lender)
        .applyOffer(data.collection, data.tokenId, data.amount)
        .catch((err) => {
          expect(err.message).to.include('expired-order')
        })
      // currently NFT is belongs to pawnShop, so we have to burn it with pawnShop address
      await testERC1155.burn(erc1155PawnShop.address, newTokenId, amountNFT)
    })
    it('should failed to apply offer with not enough USDC', async function () {
      await testERC20
        .connect(lender)
        .approve(erc1155PawnShop.address, data.amount.sub(100))
      await erc1155PawnShop
        .connect(lender)
        .applyOffer(data.collection, data.tokenId, data.amount)
        .catch((err) => {
          expect(err.message).to.include('ERC20')
        })
    })

    it('should apply success', async function () {
      testERC20.connect(lender).approve(erc1155PawnShop.address, data.amount)
      await expect(
        erc1155PawnShop
          .connect(lender)
          .applyOffer(data.collection, data.tokenId, data.amount),
      )
        .to.emit(erc1155PawnShop, 'OfferApplied')
        .withArgs(
          data.collection,
          data.tokenId,
          erc1155PawnShop.connect(lender).signer.address,
        )
    })
  })

  //
  // REPAY
  //
  describe('Repay', async function () {
    beforeEach(async function () {
      const currentTime = utils.convertInt(await erc1155PawnShop.currentTime())
      await erc1155PawnShop
        .connect(borrower)
        .createOffer(
          data.collection,
          data.tokenId,
          data.dest,
          data.amount,
          data.paymentToken,
          data.borrowCycleNo,
          currentTime,
          currentTime + 60 * 60 * 24 * 7,
        )
    })

    it('can not repay an non in progress offer', async function () {
      await erc1155PawnShop
        .connect(borrower)
        .repay(data.collection, data.tokenId)
        .catch((err) => {
          expect(err.message).to.include('repay-in-progress-offer-only')
        })
    })

    it('can not repay an offer with insufficient USDC', async function () {
      await testERC20
        .connect(lender)
        .approve(erc1155PawnShop.address, data.amount)
      await erc1155PawnShop
        .connect(lender)
        .applyOffer(data.collection, data.tokenId, data.amount)
      await erc1155PawnShop
        .connect(borrower)
        .repay(data.collection, data.tokenId)
        .catch((err) => {
          expect(err.message).to.include('ERC20')
        })
    })

    it('can not repay an expired offer', async function () {
      await testERC20
        .connect(lender)
        .approve(erc1155PawnShop.address, data.amount)
      await erc1155PawnShop
        .connect(lender)
        .applyOffer(data.collection, data.tokenId, data.amount)
      // set timeblock stamp over time
      await network.provider.send('evm_setNextBlockTimestamp', [
        data.endTime + 60 * 60 * 24 * 7 + 100, // after 7 day
      ])

      await erc1155PawnShop
        .connect(borrower)
        .repay(data.collection, data.tokenId)
        .catch((err) => {
          expect(err.message).to.include('overdue loan')
        })
    })

    it('clear offer after repay successfully', async function () {
      // approve & apply success
      await testERC20
        .connect(lender)
        .approve(erc1155PawnShop.address, data.amount)
      await erc1155PawnShop
        .connect(lender)
        .applyOffer(data.collection, data.tokenId, data.amount)
      // balance of borrower & lender
      const balanceBorrower = await testERC20.balanceOf(borrower.address)
      const balanceLender = await testERC20.balanceOf(lender.address)
      // repay success
      await testERC20
        .connect(borrower)
        .approve(erc1155PawnShop.address, data.amount)
      await expect(
        erc1155PawnShop.connect(borrower).repay(data.collection, data.tokenId),
      )
        .to.emit(erc1155PawnShop.connect(borrower), 'Repay')
        .withArgs(
          data.collection,
          data.tokenId,
          erc1155PawnShop.connect(borrower).signer.address,
          data.amount,
        )
      // check clear
      const offer = await erc1155PawnShop.getOfferParams(
        data.collection,
        data.tokenId,
      )
      expect(offer.lender).to.eq(utils.address0)
      expect(utils.convertInt(offer.borrowAmount)).to.eq(0)
      // check borrower NFT balance
      expect(await testERC20.balanceOf(borrower.address)).to.eq(
        balanceBorrower.sub(data.amount),
      )
      // check lender USDC balance
      expect(await testERC20.balanceOf(lender.address)).to.eq(
        balanceLender.add(data.amount),
      )
    })
  })

  //
  //
  // UPDATE OFFER
  //
  describe('Update Offer', async function () {
    beforeEach(async function () {
      const currentTime = utils.convertInt(await erc1155PawnShop.currentTime())
      await erc1155PawnShop
        .connect(borrower)
        .createOffer(
          data.collection,
          data.tokenId,
          data.dest,
          data.amount,
          data.paymentToken,
          data.borrowCycleNo,
          currentTime,
          currentTime + 60 * 60 * 24 * 7,
        )
    })

    it('only borrower can update offer', async function () {
      await erc1155PawnShop
        .updateOffer(data.collection, data.tokenId, data.amount, 0)
        .catch((err) => {
          expect(err.message).to.include('only owner can update offer')
        })
    })

    it('can only update un-apply offer', async function () {
      await testERC20
        .connect(lender)
        .approve(erc1155PawnShop.address, data.amount)
      await erc1155PawnShop
        .connect(lender)
        .applyOffer(data.collection, data.tokenId, data.amount)
      await erc1155PawnShop
        .connect(borrower)
        .updateOffer(data.collection, data.tokenId, data.amount, 0)
        .catch((err) => {
          expect(err.message).to.include('only update unapply offer')
        })
    })

    it('should raise when updating invalid amount', async function () {
      await erc1155PawnShop
        .connect(borrower)
        .updateOffer(data.collection, data.tokenId, 0, 0)
        .catch((err) => {
          expect(err.message).to.include('Amount must be greater than 0')
        })
    })

    it('should update amount successfully and no change borrowCycleNo', async function () {
      await expect(
        erc1155PawnShop
          .connect(borrower)
          .updateOffer(data.collection, data.tokenId, data.amount * 2, 0),
      )
        .to.emit(erc1155PawnShop.connect(borrower), 'OfferUpdated')
        .withArgs(data.collection, data.tokenId, data.amount * 2, 604800)

      // check amount
      const offer = await erc1155PawnShop.getOfferParams(
        data.collection,
        data.tokenId,
      )
      expect(offer.borrowAmount).to.eq(utils.convertBig(data.amount * 2))
      expect(offer.borrowCycleNo).to.eq(1)
    })

    it('should update borrowCycleNo successfully and no change amount', async function () {
      await expect(
        erc1155PawnShop
          .connect(borrower)
          .updateOffer(data.collection, data.tokenId, 0, 2),
      )
        .to.emit(erc1155PawnShop.connect(borrower), 'OfferUpdated')
        .withArgs(data.collection, data.tokenId, data.amount, 604800 * 2)

      // check amount
      const offer = await erc1155PawnShop.getOfferParams(
        data.collection,
        data.tokenId,
      )
      expect(offer.borrowAmount).to.eq(utils.convertBig(data.amount))
      expect(offer.borrowCycleNo).to.eq(2)
    })

    it('should update borrowCycleNo successfully and no change amount', async function () {
      await expect(
        erc1155PawnShop
          .connect(borrower)
          .updateOffer(data.collection, data.tokenId, data.amount * 2, 2),
      )
        .to.emit(erc1155PawnShop.connect(borrower), 'OfferUpdated')
        .withArgs(data.collection, data.tokenId, data.amount * 2, 604800 * 2)

      // check amount
      const offer = await erc1155PawnShop.getOfferParams(
        data.collection,
        data.tokenId,
      )
      expect(offer.borrowAmount).to.eq(utils.convertBig(data.amount * 2))
      expect(offer.borrowCycleNo).to.eq(2)
    })
  })

  //
  //
  //
  // CANCEL OFFER
  //
  describe('Cancel offer', async function () {
    beforeEach(async function () {
      const currentTime = utils.convertInt(await erc1155PawnShop.currentTime())
      await erc1155PawnShop
        .connect(borrower)
        .createOffer(
          data.collection,
          data.tokenId,
          data.dest,
          data.amount,
          data.paymentToken,
          data.borrowCycleNo,
          currentTime,
          currentTime + 60 * 60 * 24 * 7,
        )
    })

    it('only borrower can cancel offer', async function () {
      await erc1155PawnShop
        .cancelOffer(data.collection, data.tokenId)
        .catch((err) => {
          expect(err.message).to.include('only owner can cancel offer')
        })
    })

    it('can only cancle open offer', async function () {
      // apply offer
      await testERC20
        .connect(lender)
        .approve(erc1155PawnShop.address, data.amount)
      await erc1155PawnShop
        .connect(lender)
        .applyOffer(data.collection, data.tokenId, data.amount)
      await erc1155PawnShop
        .connect(borrower)
        .cancelOffer(data.collection, data.tokenId)
        .catch((err) => {
          expect(err.message).to.include('only update unapply offer')
        })
    })

    it('should cancel success', async function () {
      // cancel success
      await expect(
        erc1155PawnShop
          .connect(borrower)
          .cancelOffer(data.collection, data.tokenId),
      )
        .to.emit(erc1155PawnShop.connect(borrower), 'OfferCancelled')
        .withArgs(data.collection, data.tokenId)
      // check NFT back to borrower
      expect(await testERC1155.balanceOf(borrower.address, data.tokenId)).to.gt(
        0,
      )
      // check clear offer
      const offer = await erc1155PawnShop.getOfferParams(
        data.collection,
        data.tokenId,
      )
      expect(offer.borrowAmount).to.eq(0)
    })
  })

  //
  //
  //
  // EXTEND LENDING TIME OFFER
  //
  describe('Extend lending time offer', async function () {
    beforeEach(async function () {
      const currentTime = utils.convertInt(await erc1155PawnShop.currentTime())
      await erc1155PawnShop
        .connect(borrower)
        .createOffer(
          data.collection,
          data.tokenId,
          data.dest,
          data.amount,
          data.paymentToken,
          data.borrowCycleNo,
          currentTime,
          currentTime + 60 * 60 * 24 * 7,
        )
      // apply offer
      await testERC20
        .connect(lender)
        .approve(erc1155PawnShop.address, data.amount)
      await erc1155PawnShop
        .connect(lender)
        .applyOffer(data.collection, data.tokenId, data.amount)
    })

    it('should failed to extend with invalid cycle number', async function () {
      await erc1155PawnShop
        .connect(borrower)
        .extendLendingTime(data.collection, data.tokenId, 0)
        .catch((err) => {
          expect(err.message).to.include(
            'Cycle number must be greater than or equal 1',
          )
        })
    })

    it("only borrower can extend offer's lending time", async function () {
      await erc1155PawnShop
        .extendLendingTime(data.collection, data.tokenId, 1)
        .catch((err) => {
          expect(err.message).to.include('only-owner-can-extend-lending-time')
        })
    })
    it('can not update expired offer', async function () {
      await network.provider.send('evm_increaseTime', [60 * 60 * 24 * 7 + 50])
      await erc1155PawnShop
        .connect(borrower)
        .extendLendingTime(data.collection, data.tokenId, 1)
        .catch((err) => {
          expect(err.message).to.include('lending-time-closed')
        })
    })

    it('can not update offer with insuficient USDC fees', async function () {
      await erc1155PawnShop
        .connect(borrower)
        .extendLendingTime(data.collection, data.tokenId, 1)
        .catch((err) => {
          expect(err.message).to.include('ERC20')
        })
    })

    it('should extend 100 USDC offer successfully 1 cycle', async function () {
      // extend success
      // Currently, we dont have get extend amount, so we'll test with approval gt necessary amount
      await testERC20
        .connect(borrower)
        .approve(erc1155PawnShop.address, data.amount)
      // get lending cycle time to calculate args emitted
      const offerSetting = await erc1155PawnShop.getOfferSetting(
        data.collection,
        data.tokenId,
      )
      const offerParams = await erc1155PawnShop.getOfferParams(
        data.collection,
        data.tokenId,
      )
      const fees = await erc1155PawnShop.getSystemTokenInterestRates(
        testERC20.address,
      )
      const extendCycle = 1
      const extendLendingPeriod = offerSetting.lendingPerCycle.mul(extendCycle)
      const liquidationPeriod = offerSetting.liquidationPeriod
      const newEndLendingAt = offerParams.endLendingAt.add(extendLendingPeriod)
      const YEAR_IN_SECONDS = 31556926
      const lenderFee = extendLendingPeriod
        .mul(offerParams.borrowAmount)
        .mul(fees.lenderFeeRate)
        .div(YEAR_IN_SECONDS)
        .div(1000000)
      const serviceFee = extendLendingPeriod
        .mul(offerParams.borrowAmount)
        .mul(fees.serviceFeeRate)
        .div(YEAR_IN_SECONDS)
        .div(1000000)
      const balanceTreasury = await testERC20.balanceOf(treasury.address)
      const balanceLender = await testERC20.balanceOf(lender.address)
      await expect(
        erc1155PawnShop
          .connect(borrower)
          .extendLendingTime(data.collection, data.tokenId, extendCycle),
      )
        .to.emit(
          erc1155PawnShop.connect(borrower),
          'ExtendLendingTimeRequested',
        )
        .withArgs(
          data.collection,
          data.tokenId,
          newEndLendingAt,
          newEndLendingAt.add(liquidationPeriod),
          lenderFee,
          serviceFee,
        )
      // check fee has been transfer yet
      expect(await testERC20.balanceOf(treasury.address)).to.eq(
        balanceTreasury.add(serviceFee),
      )
      expect(await testERC20.balanceOf(lender.address)).to.eq(
        balanceLender.add(lenderFee),
      )
      expect(await testERC20.balanceOf(treasury.address)).to.eq(
        balanceTreasury.add(38330),
      )
      expect(await testERC20.balanceOf(lender.address)).to.eq(
        balanceLender.add(191653),
      )
    })

    it('should apply new fees for next extendTime', async function () {
      // Change fees to 15% and 5%
      const newLenderFeeRate = 150_000
      const newServiceFeeRate = 50_000
      await erc1155PawnShop.setFee(
        testERC20.address,
        newLenderFeeRate,
        newServiceFeeRate,
      )

      await testERC20
        .connect(borrower)
        .approve(erc1155PawnShop.address, data.amount)
      // get lending cycle time to calculate args emitted
      const offerSetting = await erc1155PawnShop.getOfferSetting(
        data.collection,
        data.tokenId,
      )
      const offerParams = await erc1155PawnShop.getOfferParams(
        data.collection,
        data.tokenId,
      )
      const extendCycle = 1
      const extendLendingPeriod = offerSetting.lendingPerCycle.mul(extendCycle)
      const liquidationPeriod = offerSetting.liquidationPeriod
      const newEndLendingAt = offerParams.endLendingAt.add(extendLendingPeriod)
      const YEAR_IN_SECONDS = 31556926

      const lenderFee = extendLendingPeriod
        .mul(offerParams.borrowAmount)
        .mul(newLenderFeeRate)
        .div(YEAR_IN_SECONDS)
        .div(1000000)
      const serviceFee = extendLendingPeriod
        .mul(offerParams.borrowAmount)
        .mul(newServiceFeeRate)
        .div(YEAR_IN_SECONDS)
        .div(1000000)

      const balanceTreasury = await testERC20.balanceOf(treasury.address)
      const balanceLender = await testERC20.balanceOf(lender.address)
      await expect(
        erc1155PawnShop
          .connect(borrower)
          .extendLendingTime(data.collection, data.tokenId, extendCycle),
      )
        .to.emit(
          erc1155PawnShop.connect(borrower),
          'ExtendLendingTimeRequested',
        )
        .withArgs(
          data.collection,
          data.tokenId,
          newEndLendingAt,
          newEndLendingAt.add(liquidationPeriod),
          lenderFee,
          serviceFee,
        )

      // check fee has been transfer yet
      expect(await testERC20.balanceOf(treasury.address)).to.eq(
        balanceTreasury.add(serviceFee),
      )
      expect(await testERC20.balanceOf(lender.address)).to.eq(
        balanceLender.add(lenderFee),
      )
      const newOfferSetting = await erc1155PawnShop.getOfferSetting(
        data.collection,
        data.tokenId,
      )
      expect(newOfferSetting.lenderFeeRate).to.eq(newLenderFeeRate)
      expect(newOfferSetting.serviceFeeRate).to.eq(newServiceFeeRate)
    })
  })

  //
  //
  // CLAIM OFFER
  //
  describe('Claim offer', async function () {
    beforeEach(async function () {
      const currentTime = utils.convertInt(await erc1155PawnShop.currentTime())
      await erc1155PawnShop
        .connect(borrower)
        .createOffer(
          data.collection,
          data.tokenId,
          data.dest,
          data.amount,
          data.paymentToken,
          data.borrowCycleNo,
          currentTime,
          currentTime + 60 * 60 * 24 * 7,
        )
      // apply offer
      await testERC20
        .connect(lender)
        .approve(erc1155PawnShop.address, data.amount)
      await erc1155PawnShop
        .connect(lender)
        .applyOffer(data.collection, data.tokenId, data.amount)
    })
    it('can not claim an in-progress offer', async function () {
      await erc1155PawnShop
        .connect(lender)
        .claim(data.collection, data.tokenId)
        .catch((e) => {
          expect(e.message).to.include('can not claim in lending period')
        })
    })
    it('only lender can claim in liquidation time', async function () {
      const offer = await erc1155PawnShop.getOfferParams(
        data.collection,
        data.tokenId,
      )
      await network.provider.send('evm_setNextBlockTimestamp', [
        utils.convertInt(offer.endLendingAt.add(100)), // after 7 day
      ])
      await erc1155PawnShop.claim(data.collection, data.tokenId).catch((e) => {
        expect(e.message).to.include('only lender can claim NFT at this time')
      })
    })
    it('only lender can claim after ending time', async function () {
      const offer = await erc1155PawnShop.getOfferParams(
        data.collection,
        data.tokenId,
      )
      await network.provider.send('evm_setNextBlockTimestamp', [
        utils.convertInt(offer.endLendingAt.add(100)), // after 7 day
      ])
      await erc1155PawnShop
        .connect(treasury)
        .claim(data.collection, data.tokenId)
        .catch((e) => {
          expect(e.message).to.include('only lender can claim NFT at this time')
        })
      await expect(
        erc1155PawnShop.connect(lender).claim(data.collection, data.tokenId),
      )
        .to.emit(erc1155PawnShop, 'NFTClaim')
        .withArgs(data.collection, data.tokenId, lender.address)
    })
    it('no one except admin, lender, borrower can claim after preiod liquidition time', async function () {
      const offer = await erc1155PawnShop.getOfferParams(
        data.collection,
        data.tokenId,
      )
      await network.provider.send('evm_setNextBlockTimestamp', [
        utils.convertInt(offer.liquidationAt.add(100)), // after 7 day
      ])
      await erc1155PawnShop
        .connect(addrs[0])
        .claim(data.collection, data.tokenId)
        .catch((e) => {
          expect(e.message).to.include('invalid-address')
        })
    })
    it('borrower can claim successfully after preiod liquidtion time', async function () {
      const offer = await erc1155PawnShop.getOfferParams(
        data.collection,
        data.tokenId,
      )
      await network.provider.send('evm_setNextBlockTimestamp', [
        utils.convertInt(offer.liquidationAt.add(100)), // after 7 day
      ])
      await expect(
        erc1155PawnShop.connect(borrower).claim(data.collection, data.tokenId),
      )
        .to.emit(erc1155PawnShop, 'NFTClaim')
        .withArgs(data.collection, data.tokenId, borrower.address)

      //check owner NFT
      expect(await testERC1155.balanceOf(borrower.address, data.tokenId)).to.gt(
        0,
      )
    })
  })

  //
  //
  // UPDATE SETTINGS
  //

  describe('Update setting', async function () {
    it('only admin can update setting', async function () {
      await erc1155PawnShop
        .connect(lender)
        .setAuctionPeriod(100)
        .catch((e) => {
          expect(e.message).to.include('Ownable: caller is not the owner')
        })
      await erc1155PawnShop.setAuctionPeriod(100)
      const setting = await erc1155PawnShop.setting()
      expect(setting.auctionPeriod).to.eq(100)
    })
    it('update lender fee and service for USDC successfully', async function () {
      await erc1155PawnShop.setFee(testERC20.address, 11000, 2000)
      const fee = await erc1155PawnShop.getSystemTokenInterestRates(
        testERC20.address,
      )
      expect(fee.lenderFeeRate).to.eq(11000)
      expect(fee.serviceFeeRate).to.eq(2000)
    })
    it('update lender fee and service for USDC NO EFFECT previous same token offer', async function () {
      const currentTime = utils.convertInt(await erc1155PawnShop.currentTime())
      await erc1155PawnShop
        .connect(borrower)
        .createOffer(
          data.collection,
          data.tokenId,
          data.dest,
          data.amount,
          data.paymentToken,
          data.borrowCycleNo,
          currentTime,
          currentTime + 60 * 60 * 24 * 7,
        )
      await erc1155PawnShop.setFee(testERC20.address, 11000, 2000)
      const offerSetting = await erc1155PawnShop.getOfferSetting(
        data.collection,
        data.tokenId,
      )
      expect(offerSetting.lenderFeeRate).to.not.eq(11000)
      expect(offerSetting.serviceFeeRate).to.not.eq(2000)
    })
  })
})
