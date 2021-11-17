pragma solidity 0.8.9;

interface IPawnShopUserActions {

    struct OfferCreateParam{
        bytes16 offerId;
        address collection;
        uint256 tokenId;
        address to;
        uint256 borrowAmount;
        address borrowToken;
        uint256 borrowPeriod;
        uint256 startApplyAt;
        uint256 closeApplyAt;
        uint256 lenderFeeRate;
        uint256 nftAmount;
    }

    function createOffer721(OfferCreateParam memory params) external;

    function createOffer1155(OfferCreateParam memory params) external;

    function getOfferHash(bytes16 _offerId, address _collection, uint256 _tokenId, uint256 _borrowAmount, uint256 _lenderFeeRate, uint256 _serviceFeeRate, address _borrowToken, uint256 _borrowPeriod, uint256 _nftAmount) external view returns(bytes32);

    function applyOffer(bytes16 _offerId, bytes32 _hash) external payable;

    function repay(bytes16 _offerId) external payable;

    function updateOffer(bytes16 _offerId, uint256 _amount, uint256 _borrowPeriod, uint256 _lenderFeeRate) external;

    function cancelOffer(bytes16 _offerId) external;

    function extendLendingTime(bytes16 _offerId, uint256 _borrowPeriod) external payable;

    function claim(bytes16 _offerId) external;

    function quoteFees(uint256 _borrowAmount, uint256 _lenderFeeRate, uint256 _serviceFeeRate, uint256 _lendingPeriod) external view returns (uint256 lenderFee, uint256 serviceFee);

    function quoteExtendFees(bytes16 _offerId, uint256 _borrowPeriod) external view returns (uint256 lenderFee, uint256 serviceFee);

    function quoteApplyAmounts(bytes16 _offerId) external view returns (uint256 lenderFee, uint256 serviceFee, uint256 approvedAmount);
}
