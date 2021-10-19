pragma solidity ^0.8.0;

interface IPawnShopOwnerActions {

    function setTokenFeeRates(
        address _token,
        uint256 _lenderFeeRate,
        uint256 _serviceFeeRate
    ) external;
}
