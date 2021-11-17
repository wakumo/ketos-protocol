pragma solidity 0.8.9;

interface IPawnShopOwnerActions {

    function setServiceFeeRates(address[] memory _tokens, uint256[] memory _fees) external;

    function setServiceFeeRate(address _token, uint256 _feeRate) external;

    function removeSupportedTokens(address[] memory _tokens) external;
}
