pragma solidity ^0.8.0;

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

    function applyOffer(bytes16 _offerId, uint256 _amount, bytes32 _hash) external;

    function repay(bytes16 _offerId) external;

    function updateOffer(bytes16 _offerId, uint256 _amount, uint256 _borrowCycleNo) external;

    function cancelOffer(bytes16 _offerId) external;

    function extendLendingTime(bytes16 _offerId, uint256 extCycleNo) external;

    function claim(bytes16 _offerId) external;

    function quoteFees(uint256 _borrowAmount, address _token, uint256 _lendingPeriod) external view returns (uint256 lenderFee, uint256 serviceFee);

    function quoteExtendFees(bytes16 _offerId, uint256 _extCycleNo) external view returns (uint256 lenderFee, uint256 serviceFee);

    function quoteApplyAmounts(bytes16 _offerId) external view returns (uint256 lenderFee, uint256 serviceFee, uint256 approvedAmount);
}
