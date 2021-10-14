// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// import "hardhat/console.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TestERC1155 is Context, ERC1155, Ownable {
    // uint256 public totalSupply = 1000000000;

    // address public owner;

    constructor() ERC1155("baseURI") {}

    function mint(address to, uint256 tokenId, uint256 _amount) public payable onlyOwner {
        super._mint(to, tokenId, _amount, "0x");
    }

    function burn(address _account, uint256 _tokenId, uint256 _amount) public payable onlyOwner {
        super._burn(_account, _tokenId, _amount);
    }

    receive() external payable {}

    fallback() external payable {}
}
