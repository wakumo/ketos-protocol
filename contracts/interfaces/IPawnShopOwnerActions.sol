pragma solidity ^0.8.9;

interface IPawnShopOwnerActions {

    function setServiceFeeRates(address[] memory _tokens, uint256[] memory _fees) external;

    function setServiceFeeRate(address _token, uint256 _fee) external;

    function removeSupportTokens(address[] memory _tokens) external;
}
