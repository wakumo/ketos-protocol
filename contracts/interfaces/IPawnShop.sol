pragma solidity ^0.8.0;

import './IPawnShopEvents.sol';
import './IPawnShopOwnerActions.sol';
import './IPawnShopUserActions.sol';

interface IPawnShop is IPawnShopEvents, IPawnShopOwnerActions, IPawnShopUserActions {
}
