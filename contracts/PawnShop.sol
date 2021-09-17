//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

// import "hardhat/console.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract PawnShop is Ownable, ReentrancyGuard {

  enum States {
    open, // Lender can apply
    applying, // Lender applied
    in_progress, // Borrower accepted application
    completed,
    cancelled
  }

  /**
   * @dev functions affected by this modifier can only be invoked if the provided _amount input parameter
   * is not zero.
   * @param _amount the amount provided
   **/
  modifier onlyAmountGreaterThanZero(uint256 _amount) {
    requireAmountGreaterThanZeroInternal(_amount);
    _;
  }

  /**
   * @dev functions affected by this modifier can only be invoked if the provided _min input parameter
   * is smaller than or equal _amount
   * @param _amount the amount provided
   **/
  modifier isValidMinAmount(uint256 _min, uint256 _amount) {
    requireAmountGreaterThanOrEqualMinAmount(_min, _amount);
    _;
  }

  function createOffer(address _collectionAddress, uint256 _tokenId, address _dest, uint256 _minAmount, uint256 _amount, address _paymentToken, uint32  _borrowCycleNo)
  external
  nonReentrant
  onlyAmountGreaterThanZero(_minAmount)
  isValidMinAmount(_minAmount, _amount)
  {

  }

  // Lender can apply
  function apply() {

  }

  // Lender can bid
  function bid() {

  }

  // Borrower pay all and interest
  function pay() {

  }

  // Borrower interest only and extend deadline
  function extend() {

  }

  // Lender can claim NFT if one time
  // Anyone can claim NFT if out of time
  function claim() {

  }

  /**
   * @notice internal function to save on code size for the onlyAmountGreaterThanZero modifier
   **/
  function requireAmountGreaterThanZeroInternal(uint256 _amount) internal pure {
    require(_amount > 0, "Amount must be greater than 0");
  }

  /**
   * @notice internal function to save on code size for the onlyAmountGreaterThanZero modifier
   **/
  function requireAmountGreaterThanOrEqualMinAmount(uint256 _min, uint256 _amount) internal pure {
    require(_amount >= _min, "Min amount must be greatr than or equal expected amount");
  }
}
