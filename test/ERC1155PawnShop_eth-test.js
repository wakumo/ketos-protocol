const { expect } = require('chai')
const { BigNumber } = require('ethers')
const { ethers, network } = require('hardhat')
const utils = require('../utils/utils.js')

describe('ERC1155 PawnShop ETH', function () {
  let treasury, borrower, lender, addrs
  let testERC20, testERC1155, pawnShop
  const tokenId = 1
  const borrowAmount = ethers.utils.parseEther('0.1')
  const wrongAmount = ethers.utils.parseEther('0.09')
  let data
  let offerId = utils.randId()
  let borrowPeriod = 60 * 60 * 24 * 7
  let lenderFeeRate = 100000
  let serviceFeeRate = 20000
  const YEAR_IN_SECONDS = 31556926
  let nftAmount = 2
  before(async function () {
    ;[treasury, borrower, lender, ...addrs] = await ethers.getSigners()
    const TestERC1155 = await ethers.getContractFactory('TestERC1155')
    testERC1155 = await TestERC1155.deploy()
    await testERC1155.deployed()
  })

  beforeEach(async function () {
    const PawnShop = await ethers.getContractFactory('PawnShop')
    pawnShop = await PawnShop.deploy(treasury.address)
    await pawnShop.deployed()
    // set fee
    await pawnShop.setServiceFeeRate(utils.eth, serviceFeeRate) // 10% & 2%
    // let currentTime = utils.convertInt(await network.provider.send("evm_mine"));
    const currentTime = utils.convertInt(await testERC1155.currentTime())
    data = {
      offerId: offerId,
      collection: testERC1155.address,
      tokenId: tokenId,
      to: borrower.address,
      borrowAmount: borrowAmount,
      borrowToken: utils.eth,
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

    it('should failed to apply offer with not enough ETH', async function () {
      await pawnShop
        .connect(lender)
        .applyOffer(data.offerId, await pawnShop.getOfferHash(data.offerId), {
          value: wrongAmount,
        })
        .catch((err) => {
          expect(err.message).to.include('invalid-amount')
        })
    })

    it('should apply success', async function () {
      await expect(
        pawnShop
          .connect(lender)
          .applyOffer(data.offerId, await pawnShop.getOfferHash(data.offerId), {
            value: data.borrowAmount,
          }),
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
      const currentTime = utils.convertInt(await testERC1155.currentTime())
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
      await pawnShop
        .connect(lender)
        .applyOffer(data.offerId, await pawnShop.getOfferHash(data.offerId), {
          value: data.borrowAmount,
        })
    })

    it('can not repay an offer with insufficient ETH', async function () {
      await pawnShop
        .connect(borrower)
        .repay(data.offerId, { value: wrongAmount })
        .catch((err) => {
          expect(err.message).to.include('invalid-amount')
        })
    })

    it('Repay successfully', async function () {
      // balance of borrower & lender
      const balanceBorrower = await borrower.getBalance()
      const balanceLender = await lender.getBalance()
      // repay success

      await expect(
        pawnShop
          .connect(borrower)
          .repay(data.offerId, { value: data.borrowAmount }),
      )
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
  //
  // EXTEND LENDING TIME OFFER
  //
  describe('Extend lending time offer', async function () {
    beforeEach(async function () {
      const currentTime = utils.convertInt(await testERC1155.currentTime())
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
      let quoteApply = await pawnShop.quoteApplyAmounts(data.offerId)
      await pawnShop
        .connect(lender)
        .applyOffer(data.offerId, await pawnShop.getOfferHash(data.offerId), {
          value: quoteApply.approvedAmount,
        })
    })

    it('can not update offer with insuficient ETH fees', async function () {
      await pawnShop
        .connect(borrower)
        .extendLendingTime(data.offerId, data.borrowPeriod)
        .catch((err) => {
          expect(err.message).to.include('invalid-amount')
        })
    })

    it('should extend 0.1 ETH offer successfully 7 day', async function () {
      // extend success
      const quoteExtend = await pawnShop.quoteExtendFees(
        data.offerId,
        data.borrowPeriod,
      )
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

      const balanceTreasury = await treasury.getBalance()
      const balanceLender = await lender.getBalance()
      await expect(
        pawnShop
          .connect(borrower)
          .extendLendingTime(data.offerId, extendLendingPeriod, {
            value: lenderFee.add(serviceFee),
          }),
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
      expect(await treasury.getBalance()).to.eq(balanceTreasury.add(serviceFee))
      expect(await lender.getBalance()).to.eq(balanceLender.add(lenderFee))
      expect(await treasury.getBalance()).to.eq(
        balanceTreasury.add(utils.convertBig('38330729678803')),
      )
      expect(await lender.getBalance()).to.eq(
        balanceLender.add(utils.convertBig('191653648394016')),
      )
    })

    it('shouldnt apply new fees for next extendTime', async function () {
      // Change fees to 15% and 5%
      const newLenderFeeRate = 150_000
      const newServiceFeeRate = 50_000
      await pawnShop.setServiceFeeRate(utils.eth, newServiceFeeRate)
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
      const balanceTreasury = await treasury.getBalance()
      const balanceLender = await lender.getBalance()
      await expect(
        pawnShop
          .connect(borrower)
          .extendLendingTime(data.offerId, extendLendingPeriod, {
            value: lenderFee.add(serviceFee),
          }),
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
      expect(await treasury.getBalance()).to.eq(balanceTreasury.add(serviceFee))
      expect(await lender.getBalance()).to.eq(balanceLender.add(lenderFee))
      const newOfferSetting = await pawnShop.getOffer(data.offerId)
      expect(newOfferSetting.lenderFeeRate).to.eq(offer.lenderFeeRate)
      expect(newOfferSetting.serviceFeeRate).to.eq(offer.serviceFeeRate)
    })
  })
})
