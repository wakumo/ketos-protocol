pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";

library PawnShopLibrary {
    using SafeMath for uint256;

    uint256 private constant YEAR_IN_SECONDS = 31556926;

    // 1000000 is 100% * 10_000 PERCENT FACTOR
    function getFeeAmount(uint256 borrowAmount, uint256 feeRate, uint256 lendingPeriod) internal pure returns (uint256) {
        require(feeRate > 0, 'invalid feeRate');
        return lendingPeriod.mul(borrowAmount).mul(feeRate).div(YEAR_IN_SECONDS).div(1000000);
    }
}
