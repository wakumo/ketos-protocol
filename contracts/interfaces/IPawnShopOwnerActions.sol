pragma solidity ^0.8.9;

interface IPawnShopOwnerActions {

    function setTokenFeeRates(
        address _token,
        uint256 _lenderFeeRate,
        uint256 _serviceFeeRate
    ) external;
}
