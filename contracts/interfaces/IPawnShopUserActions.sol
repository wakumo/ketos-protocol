pragma solidity ^0.8.0;

interface IPawnShopUserActions {

    function createOffer(
        address _collection,
        uint256 _tokenId,
        address _dest,
        uint256 _amount,
        address _paymentToken,
        uint256 _borrowCycleNo,
        uint256 _startTime,
        uint256 _endTime
    ) external;

    function applyOffer(address _collection, uint256 _tokenId, uint256 _amount) external;

    function repay(address _collection, uint256 _tokenId) external;

    function updateOffer(address _collection, uint256 _tokenId, uint256 _amount) external;

    function cancelOffer(address _collection, uint256 _tokenId) external;

    function extendLendingTime(address _collection, uint256 _tokenId, uint256 extCycleNo) external;

    function claim(address _collection, uint256 _tokenId) external;

    function quoteFees(uint256 _borrowAmount, address _token, uint256 _lendingPeriod) external view returns (uint256 lenderFee, uint256 serviceFee);

    function quoteExtendFees(address _collection, uint256 _tokenId, uint256 _extCycleNo) external view returns (uint256 lenderFee, uint256 serviceFee);

    function quoteApplyAmounts(address _collection, uint256 _tokenId) external view returns (uint256 lenderFee, uint256 serviceFee, uint256 approvedAmount);
}
