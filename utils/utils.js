const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { network } = require("hardhat");
const ethers = hre.ethers;

exports.convertInt = function (value) {
  return parseInt(value.toString());
};

exports.convertBig = function (value) {
  return ethers.BigNumber.from(BigInt(value).toString());
};
exports.address0 = "0x0000000000000000000000000000000000000000";

