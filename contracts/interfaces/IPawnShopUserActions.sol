pragma solidity ^0.8.9;

interface IPawnShopUserActions {

    function createOffer721(
        bytes16 _offerId,
        address _collection,
        uint256 _tokenId,
        address _to,
        uint256 _borrowAmount,
        address _borrowToken,
        uint256 _borrowPeriod,
        uint256 _startApplyAt,
        uint256 _closeApplyAt
    ) external;

    function createOffer1155(        
        bytes16 _offerId,
        address _collection,
        uint256 _tokenId,
        address _to,
        uint256 _borrowAmount,
        address _borrowToken,
        uint256 _borrowPeriod,
        uint256 _startApplyAt,
        uint256 _closeApplyAt,
        uint256 _nftAmount
    ) external;

    function getOfferHash(bytes16 _offerId, address _collection, uint256 _tokenId, uint256 _borrowAmount, address _borrowToken, uint256 _borrowPeriod, uint256 _nftAmount) external view returns(bytes32);

    function applyOffer(bytes16 _offerId, bytes32 _hash) external payable;

    function repay(bytes16 _offerId) external payable;

    function updateOffer(bytes16 _offerId, uint256 _amount, uint256 _borrowPeriod, address _borrowToken) external;

    function cancelOffer(bytes16 _offerId) external;

    function extendLendingTime(bytes16 _offerId, uint256 _borrowPeriod) external payable;

    function claim(bytes16 _offerId) external;

    function quoteFees(uint256 _borrowAmount, address _token, uint256 _lendingPeriod) external view returns (uint256 lenderFee, uint256 serviceFee);

    function quoteExtendFees(bytes16 _offerId, uint256 _borrowPeriod) external view returns (uint256 lenderFee, uint256 serviceFee);

    function quoteApplyAmounts(bytes16 _offerId) external view returns (uint256 lenderFee, uint256 serviceFee, uint256 approvedAmount);
}
