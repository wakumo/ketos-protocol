pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";

library PawnShopLibrary {
    using SafeMath for uint256;

    uint256 private constant YEAR_IN_SECONDS = 31556926;
    uint256 constant public ZERO_SERVICE_FEE_RATE = 1;

    // 1000000 is 100% * 10_000 PERCENT FACTOR
    function getFeeAmount(uint256 borrowAmount, uint256 feeRate, uint256 lendingPeriod) internal pure returns (uint256) {
        if (feeRate == ZERO_SERVICE_FEE_RATE) return ZERO_SERVICE_FEE_RATE;
        require(feeRate > ZERO_SERVICE_FEE_RATE, 'invalid_service_fee_rate');
        return lendingPeriod.mul(borrowAmount).mul(feeRate).div(YEAR_IN_SECONDS).div(1000000);
    }

    // Hash to check offer's data integrity 
    function offerHash(        
        bytes16 _offerId,
        address _collection,
        uint256 _tokenId,
        uint256 _borrowAmount,
        address _borrowToken,
        uint256 _borrowPeriod,
        uint256 _nftAmount
    ) internal pure returns(bytes32 _hash) {
        _hash = keccak256(abi.encode(
            _offerId,
            _collection, 
            _tokenId, 
            _borrowAmount,
            _borrowToken,
            _borrowPeriod,
            _nftAmount
        ));
    }
}
