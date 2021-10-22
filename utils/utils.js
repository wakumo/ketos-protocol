const fs = require('fs')
const path = require('path')
const hre = require('hardhat')
const Web3 = require('web3')
const { network } = require('hardhat')
const ethers = hre.ethers

exports.convertInt = function (value) {
  return parseInt(value.toString())
}

exports.convertBig = function (value) {
  return ethers.BigNumber.from(BigInt(value).toString())
}
exports.address0 = '0x0000000000000000000000000000000000000000'

exports.randId = function () {
  var dt = new Date().getTime()
  var uuid = 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = (dt + Math.random() * 16) % 16 | 0
    dt = Math.floor(dt / 16)
    return (c == 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
  return '0x' + uuid
}

exports.offerHash = function (data) {
  let web3 = new Web3(ethers.provider)
  result = web3.eth.abi.encodeParameters(
    [
      'bytes16',
      'address',
      'uint256',
      'uint256',
      'address',
      'uint256',
      'uint256',
      'uint256',
      'uint256',
    ],
    [
      data.offerId,
      data.collection,
      data.tokenId,
      data.borrowAmount,
      data.borrowToken,
      data.borrowPeriod,
      data.lenderFeeRate,
      data.serviceFeeRate,
      data.nftAmount,
    ],
  )
  result = web3.utils.sha3(result)
  return result
}
