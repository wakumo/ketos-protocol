const { expect } = require('chai')
const { ethers, network } = require('hardhat')
const utils = require('../utils/utils.js')

describe('ERC1155 PawnShop', function () {
  let treasury, borrower, lender, addrs
  let testERC20, testERC1155, pawnShop
  const tokenId = 1
  const borrowAmount = utils.convertBig(100 * 10 ** 6)
  let data
  let offerId = utils.randId()
  let borrowPeriod = 60 * 60 * 24 * 7
  let nftAmount = 2
  let lenderFeeRate = 100000
  let serviceFeeRate = 20000
  let LIQUIDATION_PERIOD_IN_SECONDS
  const YEAR_IN_SECONDS = 31536000
  before(async function () {
    ;[treasury, borrower, lender, strange, ...addrs] = await ethers.getSigners()
    const TestERC1155 = await ethers.getContractFactory('TestERC1155')
    testERC1155 = await TestERC1155.deploy()
    await testERC1155.deployed()
  })

  beforeEach(async function () {
    const TestERC20 = await ethers.getContractFactory('TestERC20')
    testERC20 = await TestERC20.deploy()
    await testERC20.deployed() // testERC20.signer.address = treasury
    await testERC20.mint(lender.address, utils.convertBig(100 * 10 ** 18))
    await testERC20.mint(borrower.address, utils.convertBig(100 * 10 ** 18))
    const PawnShop = await ethers.getContractFactory('PawnShop')
    pawnShop = await PawnShop.deploy(treasury.address, treasury.address)
    await pawnShop.deployed()
    // set fee
    await pawnShop.setServiceFeeRate(testERC20.address, 20000) // 10% & 2%
    // let currentTime = utils.convertInt(await network.provider.send("evm_mine"));
    const currentTime = utils.convertInt(await testERC20.currentTime())
    data = {
      offerId: offerId,
      collection: testERC1155.address,
      tokenId: tokenId,
      to: borrower.address,
      borrowAmount: borrowAmount,
      borrowToken: testERC20.address,
      borrowPeriod: borrowPeriod, // 7 days
      startApplyAt: currentTime,
      closeApplyAt: currentTime + 60 * 60 * 24 * 7, // 7 days after
      lenderFeeRate: lenderFeeRate,
      serviceFeeRate: serviceFeeRate,
      nftAmount: nftAmount,
    }
    // create nft & make approve for pawnShop
    await testERC1155.mint(borrower.address, tokenId, nftAmount)
    await testERC1155
      .connect(borrower)
      .setApprovalForAll(pawnShop.address, true)
  })

  afterEach(async function () {
    await testERC1155
      .burn(borrower.address, tokenId, nftAmount)
      .catch((err) => {})
  })

  //
  // CREATE OFFER
  //
  describe('Create offer', async function () {
    it('should create offer success with valid borrowAmount', async function () {
      // expect getApproved NFt == pawnShop address
      expect(
        await testERC1155.isApprovedForAll(borrower.address, pawnShop.address),
      ).to.eq(true)
      // create offer check event OfferCreated
      await expect(
        pawnShop
          .connect(borrower)
          .createOffer1155([
            data.offerId,
            data.collection,
            data.tokenId,
            data.to,
            data.borrowAmount,
            data.borrowToken,
            data.borrowPeriod,
            data.startApplyAt,
            data.closeApplyAt,
            lenderFeeRate,
            data.nftAmount,
          ]),
      ).to.emit(pawnShop.connect(borrower), 'OfferCreated')
      offer = await pawnShop.getOffer(data.offerId)
      expect(offer.lenderFeeRate).to.eq(data.lenderFeeRate)
      expect(offer.nftType).to.eq(1155)
      expect(offer.state).to.eq(0)
      expect(offer.owner).to.eq(borrower.address)
      expect(offer.collection).to.eq(data.collection)
      expect(offer.tokenId).to.eq(data.tokenId)
    })

    it('should raise error when creating offer with non-approve nft', async function () {
      // change approve to make it non approve
      await testERC1155
        .connect(borrower)
        .setApprovalForAll(pawnShop.address, false)
      await pawnShop
        .connect(borrower)
        .createOffer1155([
          data.offerId,
          data.collection,
          data.tokenId,
          data.to,
          data.borrowAmount,
          data.borrowToken,
          data.borrowPeriod,
          data.startApplyAt,
          data.closeApplyAt,
          lenderFeeRate,
          data.nftAmount,
        ])
        .catch((err) => {
          expect(err.message).to.include('please approve NFT first')
        })
    })

    it('should failed to create offer with invalid borrowAmount', async function () {
      data.borrowAmount = 0
      await pawnShop
        .connect(borrower)
        .createOffer1155([
          data.offerId,
          data.collection,
          data.tokenId,
          data.to,
          data.borrowAmount,
          data.borrowToken,
          data.borrowPeriod,
          data.startApplyAt,
          data.closeApplyAt,
          lenderFeeRate,
          data.nftAmount,
        ])
        .catch((err) => {
          expect(err.message).to.include('Amount must be greater than 0')
        })
    })

    it('should failed to create offer with small valid borrowAmount which leading fee is zero', async function () {
      data.borrowAmount = 10
      await pawnShop
        .connect(borrower)
        .createOffer1155([
          data.offerId,
          data.collection,
          data.tokenId,
          data.to,
          data.borrowAmount,
          data.borrowToken,
          data.borrowPeriod,
          data.startApplyAt,
          data.closeApplyAt,
          lenderFeeRate,
          data.nftAmount,
        ])
        .catch((err) => {
          expect(err.message).to.include('required minimum lender fee')
        })
    })

    it('should failed to create offer with invalid borrowPeriod', async function () {
      data.borrowPeriod = 0
      await pawnShop
        .connect(borrower)
        .createOffer1155([
          data.offerId,
          data.collection,
          data.tokenId,
          data.to,
          data.borrowAmount,
          data.borrowToken,
          data.borrowPeriod,
          data.startApplyAt,
          data.closeApplyAt,
          lenderFeeRate,
          data.nftAmount,
        ])
        .catch((err) => {
          expect(err.message).to.include(
            'Borrow period number must be greater than or equal 0',
          )
        })
    })

    it('should failed to create offer with non-support currency', async function () {
      data.borrowToken = borrower.address
      await pawnShop
        .connect(borrower)
        .createOffer1155([
          data.offerId,
          data.collection,
          data.tokenId,
          data.to,
          data.borrowAmount,
          data.borrowToken,
          data.borrowPeriod,
          data.startApplyAt,
          data.closeApplyAt,
          lenderFeeRate,
          data.nftAmount,
        ])
        .catch((err) => {
          expect(err.message).to.include('invalid_borrow_token')
        })
    })

    it('should failed to create offer with payment token is address 0', async function () {
      data.borrowToken = utils.address0
      await pawnShop
        .connect(borrower)
        .createOffer1155([
          data.offerId,
          data.collection,
          data.tokenId,
          data.to,
          data.borrowAmount,
          data.borrowToken,
          data.borrowPeriod,
          data.startApplyAt,
          data.closeApplyAt,
          lenderFeeRate,
          data.nftAmount,
        ])
        .catch((err) => {
          expect(err.message).to.include('invalid-payment-token')
        })
    })

    it('should failed to create offer  with invalid end time', async function () {
      data.closeApplyAt = 0
      await pawnShop
        .connect(borrower)
        .createOffer1155([
          data.offerId,
          data.collection,
          data.tokenId,
          data.to,
          data.borrowAmount,
          data.borrowToken,
          data.borrowPeriod,
          data.startApplyAt,
          data.closeApplyAt,
          lenderFeeRate,
          data.nftAmount,
        ])
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
      await pawnShop
        .connect(borrower)
        .createOffer1155([
          data.offerId,
          data.collection,
          data.tokenId,
          data.to,
          data.borrowAmount,
          data.borrowToken,
          data.borrowPeriod,
          data.startApplyAt,
          data.closeApplyAt,
          lenderFeeRate,
          data.nftAmount,
        ])
    })
    afterEach(async function () {
      await pawnShop
        .connect(borrower)
        .cancelOffer(data.offerId)
        .catch((e) => {})
    })

    it('should failed to apply offer which has updated borrowAmount', async function () {
      oldOfferHash = await pawnShop.getOfferHash(data.offerId)
      // update change borrowAmount
      await pawnShop
        .connect(borrower)
        .updateOffer(data.offerId, data.borrowAmount * 2, 0, data.lenderFeeRate)
      await pawnShop
        .connect(lender)
        .applyOffer(data.offerId, oldOfferHash)
        .catch((err) => {
          expect(err.message).to.include('offer informations has changed')
        })
    })
    it('should failed to apply non-open offer', async function () {
      // apply offer to make it become in progress offer
      await testERC20.approve(pawnShop.address, data.borrowAmount)
      await pawnShop.applyOffer(
        data.offerId,
        await pawnShop.getOfferHash(data.offerId),
      )
      await pawnShop
        .connect(lender)
        .applyOffer(data.offerId, await pawnShop.getOfferHash(data.offerId))
        .catch((err) => {
          expect(err.message).to.include('apply-non-open-offer')
        })
    })
    it('should failed to apply expired offer', async function () {
      await network.provider.send('evm_setNextBlockTimestamp', [
        data.closeApplyAt + 100,
      ])
      await pawnShop
        .connect(lender)
        .applyOffer(data.offerId, await pawnShop.getOfferHash(data.offerId))
        .catch((err) => {
          expect(err.message).to.include('expired-order')
        })
    })
    it('should failed to apply offer with not enough USDC', async function () {
      await testERC20
        .connect(lender)
        .approve(pawnShop.address, data.borrowAmount.sub(100))
      await pawnShop
        .connect(lender)
        .applyOffer(data.offerId, await pawnShop.getOfferHash(data.offerId))
        .catch((err) => {
          expect(err.message).to.include('ERC20')
        })
    })

    it('should apply success', async function () {
      testERC20.connect(lender).approve(pawnShop.address, data.borrowAmount)
      await expect(
        pawnShop
          .connect(lender)
          .applyOffer(data.offerId, await pawnShop.getOfferHash(data.offerId)),
      )
        .to.emit(pawnShop, 'OfferApplied')
        .withArgs(
          data.offerId,
          data.collection,
          data.tokenId,
          pawnShop.connect(lender).signer.address,
        )
    })
  })

  //
  // REPAY
  //
  describe('Repay', async function () {
    beforeEach(async function () {
      const currentTime = utils.convertInt(await testERC20.currentTime())
      await pawnShop
        .connect(borrower)
        .createOffer1155([
          data.offerId,
          data.collection,
          data.tokenId,
          data.to,
          data.borrowAmount,
          data.borrowToken,
          data.borrowPeriod,
          currentTime,
          currentTime + 60 * 60 * 24 * 7,
          lenderFeeRate,
          data.nftAmount,
        ])
    })

    it('can not repay an non in progress offer', async function () {
      await pawnShop
        .connect(borrower)
        .repay(data.offerId)
        .catch((err) => {
          expect(err.message).to.include('repay-in-progress-offer-only')
        })
    })

    it('can not repay an offer with insufficient USDC', async function () {
      await testERC20
        .connect(lender)
        .approve(pawnShop.address, data.borrowAmount)
      await pawnShop
        .connect(lender)
        .applyOffer(data.offerId, await pawnShop.getOfferHash(data.offerId))
      await pawnShop
        .connect(borrower)
        .repay(data.offerId)
        .catch((err) => {
          expect(err.message).to.include('ERC20')
        })
    })

    it('can not repay an expired offer', async function () {
      await testERC20
        .connect(lender)
        .approve(pawnShop.address, data.borrowAmount)
      await pawnShop
        .connect(lender)
        .applyOffer(data.offerId, await pawnShop.getOfferHash(data.offerId))
      // set timeblock stamp over time
      await network.provider.send('evm_setNextBlockTimestamp', [
        data.closeApplyAt + 60 * 60 * 24 * 7 + 100, // after 7 day
      ])

      await pawnShop
        .connect(borrower)
        .repay(data.offerId)
        .catch((err) => {
          expect(err.message).to.include('overdue loan')
        })
    })

    it('Repay successfully', async function () {
      // approve & apply success
      await testERC20
        .connect(lender)
        .approve(pawnShop.address, data.borrowAmount)
      await pawnShop
        .connect(lender)
        .applyOffer(data.offerId, await pawnShop.getOfferHash(data.offerId))
      // balance of borrower & lender
      const balanceBorrower = await testERC20.balanceOf(borrower.address)
      const balanceLender = await testERC20.balanceOf(lender.address)
      // repay success
      await testERC20
        .connect(borrower)
        .approve(pawnShop.address, data.borrowAmount)
      await expect(pawnShop.connect(borrower).repay(data.offerId))
        .to.emit(pawnShop.connect(borrower), 'Repay')
        .withArgs(
          data.offerId,
          data.collection,
          data.tokenId,
          pawnShop.connect(borrower).signer.address,
          data.borrowAmount,
        )
    })
  })

  //
  //
  // UPDATE OFFER
  //
  describe('Update Offer', async function () {
    beforeEach(async function () {
      const currentTime = utils.convertInt(await testERC20.currentTime())
      await pawnShop
        .connect(borrower)
        .createOffer1155([
          data.offerId,
          data.collection,
          data.tokenId,
          data.to,
          data.borrowAmount,
          data.borrowToken,
          data.borrowPeriod,
          currentTime,
          currentTime + 60 * 60 * 24 * 7,
          lenderFeeRate,
          data.nftAmount,
        ])
    })

    it('only borrower can update offer', async function () {
      await pawnShop
        .updateOffer(data.offerId, data.borrowAmount, 0, testERC20.address)
        .catch((err) => {
          expect(err.message).to.include('only owner can update offer')
        })
    })

    it('can only update un-apply offer', async function () {
      await testERC20
        .connect(lender)
        .approve(pawnShop.address, data.borrowAmount)
      await pawnShop
        .connect(lender)
        .applyOffer(data.offerId, await pawnShop.getOfferHash(data.offerId))
      await pawnShop
        .connect(borrower)
        .updateOffer(data.offerId, data.borrowAmount, 0, testERC20.address)
        .catch((err) => {
          expect(err.message).to.include('only update unapply offer')
        })
    })

    it('should raise when updating invalid borrowAmount', async function () {
      await pawnShop
        .connect(borrower)
        .updateOffer(data.offerId, 0, 0, data.lenderFeeRate)
        .catch((err) => {
          expect(err.message).to.include('Amount must be greater than 0')
        })
    })

    it('should update borrowAmount successfully and no change borrowPeriod', async function () {
      let offer = await pawnShop.getOffer(data.offerId)
      temp = [...offer]
      temp[2] = offer.borrowAmount.mul(2) // borrowAmount
      newOfferHash = await pawnShop.getOfferHashOfferInfo(temp)
      await expect(
        pawnShop
          .connect(borrower)
          .updateOffer(
            data.offerId,
            data.borrowAmount * 2,
            0,
            data.lenderFeeRate,
          ),
      )
        .to.emit(pawnShop.connect(borrower), 'OfferUpdated')
        .withArgs(
          data.offerId,
          data.collection,
          data.tokenId,
          data.borrowAmount * 2,
          data.borrowPeriod,
          newOfferHash,
        )

      // check borrowAmount
      offer = await pawnShop.getOffer(data.offerId)
      expect(offer.borrowAmount).to.eq(utils.convertBig(data.borrowAmount * 2))
      expect(offer.borrowPeriod).to.eq(data.borrowPeriod)
    })

    it('should update borrowPeriod successfully and no change borrowAmount', async function () {
      let offer = await pawnShop.getOffer(data.offerId)
      temp = [...offer]
      temp[7] = offer.borrowPeriod.mul(2) // borrowPeriod
      newOfferHash = await pawnShop.getOfferHashOfferInfo(temp)
      await expect(
        pawnShop
          .connect(borrower)
          .updateOffer(
            data.offerId,
            0,
            data.borrowPeriod * 2,
            data.lenderFeeRate,
          ),
      )
        .to.emit(pawnShop.connect(borrower), 'OfferUpdated')
        .withArgs(
          data.offerId,
          data.collection,
          data.tokenId,
          data.borrowAmount,
          data.borrowPeriod * 2,
          newOfferHash,
        )

      // check borrowAmount
      offer = await pawnShop.getOffer(data.offerId)
      expect(offer.borrowAmount).to.eq(utils.convertBig(data.borrowAmount))
      expect(offer.borrowPeriod).to.eq(data.borrowPeriod * 2)
    })
  })

  //
  //
  //
  // CANCEL OFFER
  //
  describe('Cancel offer', async function () {
    beforeEach(async function () {
      const currentTime = utils.convertInt(await testERC20.currentTime())
      await pawnShop
        .connect(borrower)
        .createOffer1155([
          data.offerId,
          data.collection,
          data.tokenId,
          data.to,
          data.borrowAmount,
          data.borrowToken,
          data.borrowPeriod,
          currentTime,
          currentTime + 60 * 60 * 24 * 7,
          lenderFeeRate,
          data.nftAmount,
        ])
    })

    it('only borrower can cancel offer', async function () {
      await pawnShop.cancelOffer(data.offerId).catch((err) => {
        expect(err.message).to.include('only owner can cancel offer')
      })
    })

    it('can only cancle open offer', async function () {
      // apply offer
      await testERC20
        .connect(lender)
        .approve(pawnShop.address, data.borrowAmount)
      await pawnShop
        .connect(lender)
        .applyOffer(data.offerId, await pawnShop.getOfferHash(data.offerId))
      await pawnShop
        .connect(borrower)
        .cancelOffer(data.offerId)
        .catch((err) => {
          expect(err.message).to.include('only update unapply offer')
        })
    })

    it('should cancel success', async function () {
      // cancel success
      await expect(pawnShop.connect(borrower).cancelOffer(data.offerId))
        .to.emit(pawnShop.connect(borrower), 'OfferCancelled')
        .withArgs(data.offerId, data.collection, data.tokenId)
      // check NFT back to borrower
      expect(await testERC1155.balanceOf(borrower.address, data.tokenId)).to.gt(
        0,
      )
    })
  })

  //
  //
  //
  // EXTEND LENDING TIME OFFER
  //
  describe('Extend lending time offer', async function () {
    beforeEach(async function () {
      const currentTime = utils.convertInt(await testERC20.currentTime())
      await pawnShop
        .connect(borrower)
        .createOffer1155([
          data.offerId,
          data.collection,
          data.tokenId,
          data.to,
          data.borrowAmount,
          data.borrowToken,
          data.borrowPeriod,
          currentTime,
          currentTime + 60 * 60 * 24 * 7,
          lenderFeeRate,
          data.nftAmount,
        ])
      // apply offer
      await testERC20
        .connect(lender)
        .approve(pawnShop.address, data.borrowAmount)
      await pawnShop
        .connect(lender)
        .applyOffer(data.offerId, await pawnShop.getOfferHash(data.offerId))
    })

    it('should failed to extend with invalid borrow period', async function () {
      await pawnShop
        .connect(borrower)
        .extendLendingTime(data.offerId, 0)
        .catch((err) => {
          expect(err.message).to.include(
            'Borrow period number must be greater than or equal 0',
          )
        })
    })

    it("only borrower can extend offer's lending time", async function () {
      await pawnShop
        .extendLendingTime(data.offerId, data.borrowPeriod)
        .catch((err) => {
          expect(err.message).to.include('only-owner-can-extend-lending-time')
        })
    })
    it('can not update expired offer', async function () {
      await network.provider.send('evm_increaseTime', [60 * 60 * 24 * 7 + 50])
      await pawnShop
        .connect(borrower)
        .extendLendingTime(data.offerId, data.borrowPeriod)
        .catch((err) => {
          expect(err.message).to.include('lending-time-closed')
        })
    })

    it('can not update offer with insuficient USDC fees', async function () {
      await pawnShop
        .connect(borrower)
        .extendLendingTime(data.offerId, data.borrowPeriod)
        .catch((err) => {
          expect(err.message).to.include('ERC20')
        })
    })

    it('should extend 100 USDC offer successfully 7 day', async function () {
      // extend success
      // Currently, we dont have get extend borrowAmount, so we'll test with approval gt necessary borrowAmount
      await testERC20
        .connect(borrower)
        .approve(pawnShop.address, data.borrowAmount)
      // get lending cycle time to calculate args emitted
      const offer = await pawnShop.getOffer(data.offerId)
      const extendLendingPeriod = utils.convertBig(data.borrowPeriod)
      const lenderFee = extendLendingPeriod
        .mul(offer.borrowAmount)
        .mul(offer.lenderFeeRate)
        .div(YEAR_IN_SECONDS)
        .div(1000000)
      const serviceFee = extendLendingPeriod
        .mul(offer.borrowAmount)
        .mul(offer.serviceFeeRate)
        .div(YEAR_IN_SECONDS)
        .div(1000000)
      const balanceTreasury = await testERC20.balanceOf(treasury.address)
      const balanceLender = await testERC20.balanceOf(lender.address)
      await expect(
        pawnShop
          .connect(borrower)
          .extendLendingTime(data.offerId, extendLendingPeriod),
      )
        .to.emit(pawnShop.connect(borrower), 'ExtendLendingTimeRequested')
        .withArgs(
          data.offerId,
          data.collection,
          data.tokenId,
          offer.startLendingAt.add(offer.borrowPeriod).add(extendLendingPeriod),
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
        balanceTreasury.add(38356),
      )
      expect(await testERC20.balanceOf(lender.address)).to.eq(
        balanceLender.add(191780),
      )
    })

    it('shouldnt apply new fees for next extendTime', async function () {
      // Change fees to 15% and 5%
      const newLenderFeeRate = 150_000
      const newServiceFeeRate = 50_000
      await pawnShop.setServiceFeeRate(testERC20.address, newServiceFeeRate)

      await testERC20
        .connect(borrower)
        .approve(pawnShop.address, data.borrowAmount)
      // get lending cycle time to calculate args emitted
      const offer = await pawnShop.getOffer(data.offerId)
      const extendLendingPeriod = utils.convertBig(data.borrowPeriod)
      const lenderFee = extendLendingPeriod
        .mul(offer.borrowAmount)
        .mul(offer.lenderFeeRate)
        .div(YEAR_IN_SECONDS)
        .div(1000000)
      const serviceFee = extendLendingPeriod
        .mul(offer.borrowAmount)
        .mul(offer.serviceFeeRate)
        .div(YEAR_IN_SECONDS)
        .div(1000000)
      const balanceTreasury = await testERC20.balanceOf(treasury.address)
      const balanceLender = await testERC20.balanceOf(lender.address)
      await expect(
        pawnShop
          .connect(borrower)
          .extendLendingTime(data.offerId, extendLendingPeriod),
      )
        .to.emit(pawnShop.connect(borrower), 'ExtendLendingTimeRequested')
        .withArgs(
          data.offerId,
          data.collection,
          data.tokenId,
          offer.startLendingAt.add(offer.borrowPeriod).add(extendLendingPeriod),
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
      const newOfferSetting = await pawnShop.getOffer(data.offerId)
      expect(newOfferSetting.lenderFeeRate).to.eq(offer.lenderFeeRate)
      expect(newOfferSetting.serviceFeeRate).to.eq(offer.serviceFeeRate)
    })
  })

  //
  //
  // CLAIM OFFER
  //
  describe('Claim offer', async function () {
    beforeEach(async function () {
      const currentTime = utils.convertInt(await testERC20.currentTime())
      await pawnShop
        .connect(borrower)
        .createOffer1155([
          data.offerId,
          data.collection,
          data.tokenId,
          data.to,
          data.borrowAmount,
          data.borrowToken,
          data.borrowPeriod,
          currentTime,
          currentTime + 60 * 60 * 24 * 7,
          lenderFeeRate,
          data.nftAmount,
        ])
      // apply offer
      await testERC20
        .connect(lender)
        .approve(pawnShop.address, data.borrowAmount)
      await pawnShop
        .connect(lender)
        .applyOffer(data.offerId, await pawnShop.getOfferHash(data.offerId))
    })
    it('can not claim an in-progress offer', async function () {
      await pawnShop
        .connect(lender)
        .claim(data.offerId, lender.address)
        .catch((e) => {
          expect(e.message).to.include('can not claim in lending period')
        })
    })
    it('only lender can claim in liquidation time', async function () {
      const offer = await pawnShop.getOffer(data.offerId)
      await network.provider.send('evm_setNextBlockTimestamp', [
        utils.convertInt(offer.startLendingAt.add(offer.borrowPeriod).add(100)), // after 7 day
      ])
      await pawnShop.claim(data.offerId, lender.address).catch((e) => {
        expect(e.message).to.include('only lender can claim NFT at this time')
      })
    })
    it('only lender can claim after ending time', async function () {
      const offer = await pawnShop.getOffer(data.offerId)
      await network.provider.send('evm_setNextBlockTimestamp', [
        utils.convertInt(offer.startLendingAt.add(offer.borrowPeriod).add(100)), // after 7 day
      ])
      await pawnShop
        .connect(treasury)
        .claim(data.offerId, lender.address)
        .catch((e) => {
          expect(e.message).to.include('only lender can claim NFT at this time')
        })
      await expect(pawnShop.connect(lender).claim(data.offerId, lender.address))
        .to.emit(pawnShop, 'NFTClaim')
        .withArgs(data.offerId, data.collection, data.tokenId, lender.address)
    })
  })

  //
  //
  // UPDATE SETTINGS
  //

  describe('Update setting', async function () {
    it('only admin can update setting', async function () {
      const newServiceFee = 11001
      await pawnShop
        .connect(lender)
        .setServiceFeeRate(testERC20.address, newServiceFee)
        .catch((e) => {
          expect(e.message).to.include('Ownable: caller is not the owner')
        })
      await pawnShop.setServiceFeeRate(testERC20.address, newServiceFee)
      const fee = await pawnShop.getServiceFeeRate(testERC20.address)
      expect(fee).to.eq(newServiceFee)
    })
    it('update lender fee and service for USDC successfully', async function () {
      const newServiceFee = 1000
      await pawnShop.setServiceFeeRate(testERC20.address, newServiceFee)
      const fee = await pawnShop.getServiceFeeRate(testERC20.address)
      expect(fee).to.eq(newServiceFee)
    })
    it('update lender fee and service for USDC NO EFFECT previous same token offer', async function () {
      const currentTime = utils.convertInt(await testERC20.currentTime())
      await pawnShop
        .connect(borrower)
        .createOffer1155([
          data.offerId,
          data.collection,
          data.tokenId,
          data.to,
          data.borrowAmount,
          data.borrowToken,
          data.borrowPeriod,
          currentTime,
          currentTime + 60 * 60 * 24 * 7,
          lenderFeeRate,
          data.nftAmount,
        ])
      await pawnShop.setServiceFeeRate(testERC20.address, 2000)
      const offer = await pawnShop.getOffer(data.offerId)
      expect(offer.lenderFeeRate).to.not.eq(11000)
      expect(offer.serviceFeeRate).to.not.eq(2000)
    })
  })

  describe('Quote Fees', async function () {
    it('quoteFees', async function () {
      const borrowAmount = utils.convertBig(100 * 10 ** 6)
      const token = testERC20.address
      const lendingPeriod = 604800 // 7 days
      let lenderFee
      let serviceFee
      ;[lenderFee, serviceFee] = await pawnShop
        .connect(borrower)
        .quoteFees(borrowAmount, lenderFeeRate, serviceFeeRate, lendingPeriod)
      expect(lenderFee.toString()).to.eq('191780')
      expect(serviceFee.toString()).to.eq('38356')
    })

    it('quoteApplyAmounts', async function () {
      // Create Offer
      await pawnShop
        .connect(borrower)
        .createOffer1155([
          data.offerId,
          data.collection,
          data.tokenId,
          data.to,
          data.borrowAmount,
          data.borrowToken,
          data.borrowPeriod,
          data.startApplyAt,
          data.closeApplyAt,
          lenderFeeRate,
          data.nftAmount,
        ])
      let lenderFee
      let serviceFee
      let approvedAmount
      ;[lenderFee, serviceFee, approvedAmount] = await pawnShop
        .connect(borrower)
        .quoteApplyAmounts(data.offerId)

      // Approve testERC20
      await testERC20.connect(lender).approve(pawnShop.address, approvedAmount)
      // Apply Offer
      await pawnShop
        .connect(lender)
        .applyOffer(data.offerId, await pawnShop.getOfferHash(data.offerId))

      expect(lenderFee.toString()).to.eq('191780')
      expect(serviceFee.toString()).to.eq('38356')
      expect(approvedAmount.toString()).to.eq('99808220')
    })

    it('quoteExtendFees', async function () {
      // Create Offer
      await pawnShop
        .connect(borrower)
        .createOffer1155([
          data.offerId,
          data.collection,
          data.tokenId,
          data.to,
          data.borrowAmount,
          data.borrowToken,
          data.borrowPeriod,
          data.startApplyAt,
          data.closeApplyAt,
          lenderFeeRate,
          data.nftAmount,
        ])
      let lenderFee
      let serviceFee
      let extendPeriod = 1209600 // 2 weeks in seconds

      // Approve testERC20
      testERC20.connect(lender).approve(pawnShop.address, data.borrowAmount)

      // Apply Offer
      await pawnShop
        .connect(lender)
        .applyOffer(data.offerId, await pawnShop.getOfferHash(data.offerId))

      // Get estimate extend fees
      ;[lenderFee, serviceFee] = await pawnShop
        .connect(borrower)
        .quoteExtendFees(data.offerId, utils.convertBig(extendPeriod))
      await testERC20
        .connect(borrower)
        .approve(pawnShop.address, lenderFee.add(serviceFee))

      // Get balances
      const treasuryBalance = await testERC20.balanceOf(treasury.address)
      const lenderBalance = await testERC20.balanceOf(lender.address)

      await pawnShop
        .connect(borrower)
        .extendLendingTime(data.offerId, extendPeriod)
      expect(lenderFee.toString()).to.eq('383561')
      expect(serviceFee.toString()).to.eq('76712')
      expect(await testERC20.balanceOf(treasury.address)).to.eq(
        treasuryBalance.add(serviceFee),
      )
      expect(await testERC20.balanceOf(lender.address)).to.eq(
        lenderBalance.add(lenderFee),
      )
    })
  })
})
