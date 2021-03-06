// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

// import "hardhat/console.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TestERC721 is Context, ERC721, Ownable {
    // uint256 public totalSupply = 1000000000;

    // address public owner;

    constructor() ERC721("Simple Token ERC721", "ERC721") {}

    function mint(address to, uint256 tokenId) public payable onlyOwner {
        super._safeMint(to, tokenId, "0x");
    }

    function burn(uint256 _tokenId) public payable {
        super._burn(_tokenId);
    }

    // Function for test
    function currentTime() public view returns (uint256) {
        return block.timestamp;
    }

    receive() external payable {}

    fallback() external payable {}
}
