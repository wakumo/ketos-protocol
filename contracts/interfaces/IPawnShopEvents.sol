pragma solidity 0.8.9;

interface IPawnShopEvents {

    event OfferCreated(
        bytes16 indexed offerId,
        address collection,
        uint256 tokenId,
        address owner,
        bytes32 offerHash
    );

    event OfferApplied(
        bytes16 indexed offerId,
        address collection,
        uint256 tokenId,
        address lender
    );

    event Repay(
        bytes16 indexed offerId,
        address collection,
        uint256 tokenId,
        address repayer,
        uint256 borrowAmount
    );

    event OfferUpdated(
        bytes16 indexed offerId,
        address collection,
        uint256 tokenId,
        uint256 borrowAmount,
        uint256 borrowPeriod,
        bytes32 offerHash
    );

    event OfferCancelled(bytes16 indexed offerId, address collection, uint256 tokenId);

    event ExtendLendingTimeRequested(
        bytes16 indexed offerId,
        address collection,
        uint256 tokenId,
        uint256 lendingEndAt,
        uint256 lendingFeeAmount,
        uint256 serviceFeeAmount
    );

    event NFTClaim(
        bytes16 indexed offerId,
        address collection,
        uint256 tokenId,
        address taker
    );
}
