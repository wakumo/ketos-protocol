pragma solidity ^0.8.0;

interface IPawnShopEvents {

    event OfferCreated(
        address indexed _collection,
        uint256 indexed _tokenId,
        address _owner,
        address _dest,
        uint256 _amount,
        address _paymentToken,
        uint256 _startTime,
        uint256 _endTime
    );

    event OfferApplied(
        address indexed _collection,
        uint256 indexed _tokenId,
        address _lender
    );

    event Repay(
        address indexed _collection,
        uint256 indexed _tokenId,
        address _repayer,
        uint256 _amount
    );

    event OfferUpdated(
        address indexed _collection,
        uint256 indexed _tokenId,
        uint256 _amount
    );

    event OfferCancelled(address indexed _collection, uint256 indexed _tokenId);

    event ExtendLendingTimeRequested(
        address indexed _collection,
        uint256 indexed _tokenId,
        uint256 _lendingEndAt,
        uint256 _liquidationAt,
        uint256 _lendingFeeAmount,
        uint256 _serviceFeeAmount
    );

    event NFTClaim(
        address indexed _collection,
        uint256 indexed _tokenId,
        address _taker
    );
}
