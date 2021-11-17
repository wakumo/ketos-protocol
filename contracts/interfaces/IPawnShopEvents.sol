pragma solidity 0.8.9;

interface IPawnShopEvents {

    event OfferCreated(
        bytes16 indexed offerId,
        address collection,
        uint256 tokenId,
        address owner,
        address to,
        uint256 borrowAmount,
        address borrowToken,
        uint256 startApplyAt,
        uint256 closeApplyAt,
        uint256 borrowPeriod,
        uint256 nftType,
        uint256 nftAmount,
        uint256 lenderFeeRate,
        uint256 serviceFeeRate
    );

    event OfferApplied(
        bytes16 indexed offerId,
        address indexed collection,
        uint256 indexed tokenId,
        address lender
    );

    event Repay(
        bytes16 indexed offerId,
        address indexed collection,
        uint256 indexed tokenId,
        address repayer,
        uint256 borrowAmount
    );

    event OfferUpdated(
        bytes16 indexed offerId,
        address indexed collection,
        uint256 indexed tokenId,
        uint256 borrowAmount,
        uint256 borrowPeriod
    );

    event OfferCancelled(bytes16 indexed offerId, address indexed collection, uint256 indexed tokenId);

    event ExtendLendingTimeRequested(
        bytes16 indexed offerId,
        address indexed collection,
        uint256 indexed tokenId,
        uint256 lendingEndAt,
        uint256 lendingFeeAmount,
        uint256 serviceFeeAmount
    );

    event NFTClaim(
        bytes16 indexed offerId,
        address indexed collection,
        uint256 indexed tokenId,
        address taker
    );
}
