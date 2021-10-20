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

exports.randId = function (){
    var dt = new Date().getTime();
    var uuid = 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = (dt + Math.random()*16)%16 | 0;
        dt = Math.floor(dt/16);
        return (c=='x' ? r :(r&0x3|0x8)).toString(16);
    });
    return '0x' + uuid;
}