pragma solidity ^0.8.0;

interface IPawnShopEvents {

    event OfferCreated(
        bytes16 indexed _offerId,
        address _collection,
        uint256 _tokenId,
        address _owner,
        address _to,
        uint256 _amount,
        address _borrowToken,
        uint256 _startApplyAt,
        uint256 _closeApplyAt,
        uint256 _borrowPeriod,
        uint256 _nftType,
        uint256 _nftAmount
    );

    event OfferApplied(
        bytes16 indexed _offerId,
        address indexed _collection,
        uint256 indexed _tokenId,
        address _lender
    );

    event Repay(
        bytes16 indexed _offerId,
        address indexed _collection,
        uint256 indexed _tokenId,
        address _repayer,
        uint256 _amount
    );

    event OfferUpdated(
        bytes16 indexed _offerId,
        address indexed _collection,
        uint256 indexed _tokenId,
        uint256 _amount,
        uint256 _lendingPeriod
    );

    event OfferCancelled(bytes16 indexed _offerId, address indexed _collection, uint256 indexed _tokenId);

    event ExtendLendingTimeRequested(
        bytes16 indexed _offerId,
        address indexed _collection,
        uint256 indexed _tokenId,
        uint256 _lendingEndAt,
        uint256 _liquidationAt,
        uint256 _lendingFeeAmount,
        uint256 _serviceFeeAmount
    );

    event NFTClaim(
        bytes16 indexed _offerId,
        address indexed _collection,
        uint256 indexed _tokenId,
        address _taker
    );
}
