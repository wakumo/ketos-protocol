// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// import "hardhat/console.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TestERC20 is Context, ERC20, Ownable {
    // uint256 public totalSupply = 1000000000;

    // address public owner;

    constructor() public ERC20("Simple Token ERC20", "ST20") {
        _mint(_msgSender(), 10000 * (10**uint256(decimals())));
    }

    function mint(address _to, uint256 _amount) public payable onlyOwner {
        super._mint(_to, _amount);
    }

    receive() external payable {}

    fallback() external payable {}
}
