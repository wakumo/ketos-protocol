pragma solidity ^0.8.0;

interface IPawnShopOwnerActions {

    function setAuctionPeriod(uint256 _auctionPeriod) external;

    function setLendingPerCycle(uint256 _lendingPerCycle) external;

    function setLiquidationPeriod(uint256 _liquidationPeriod) external;

    function setFee(address _token, uint256 _lenderFeeRate, uint256 _serviceFeeRate) external;
}
