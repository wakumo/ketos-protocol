//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

// import "hardhat/console.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract PawnShop is Ownable, ReentrancyGuard {

    event OfferCreated(
        address indexed _collection,
        uint256 indexed _tokenId,
        address _owner,
        address _dest,
        uint256 _minAmount,
        uint256 _amount,
        address _paymentToken,
        uint256 _startAuctionAt
    );

    event OfferBid(
        address indexed _collection,
        uint256 indexed _tokenId,
        address _bidder,
        uint256 _bidAmount,
        address _paymentToken
    );

    event ExtendLendingTimeRequested(
        address indexed _collection,
        uint256 indexed _tokenId,
        uint256 _lendingEndAt,
        uint256 _liquidationAt,
        uint256 _serviceFeeAmount,
        uint256 _lendingFeeAmount
    );

    enum State {
        open,
        in_progress,
        completed,
        cancelled
    }

    struct OfferParams {
        address owner;
        address lender;
        uint256 borrowAmount;
        address paymentToken;
        address dest;
        uint256 startAuctionAt;
        uint256 endAuctionAt;
        uint256 borrowCycleNo;
        uint256 endLendingAt;
        uint256 liquidationAt;
        uint256 interestAmount;
        State status;
    }

    // System settings
    struct Setting {
        uint256 auctionPeriod;
        uint256 lendingPerCycle;
        uint256 liquidationPeriod;
        uint256 lenderFeeRate;
        uint256 serviceFeeRate;
    }

    struct Offer {
        OfferParams params;
        Setting setting;
    }

    /**
    * Make it private to avoid stack too deep errors
    * Struct over 15 fields can't return in getters
    *
    * Split getter function out to getOfferParams() and getOfferSetting()
    **/
    mapping(address => mapping(uint256 => Offer)) private offers;

    mapping(address => uint) public collections;

    address payable public treasury;

    Setting public setting;

    constructor(address payable _treasury) public {
        setting.auctionPeriod = 259200; // 3 days
        setting.lendingPerCycle = 604800; // 7 days for a cycle
        setting.liquidationPeriod = 2592000; // 30 days
        setting.lenderFeeRate = 10; // 10%
        setting.serviceFeeRate = 2; // 2%
        treasury = _treasury;
    }

    /**
    * @dev functions affected by this modifier can only be invoked if the provided _amount input parameter
    * is not zero.
        * @param _amount the amount provided
        **/
    modifier onlyAmountGreaterThanZero(uint256 _amount) {
        requireAmountGreaterThanZero(_amount);
        _;
    }

    /**
    * @dev functions affected by this modifier can only be invoked if the provided cycleNo input parameter
    * is not zero.
        **/
    modifier onlyCycleNoGreaterThanOne(uint256 _cycleNo) {
        requireCycleNoGreaterThanOne(_cycleNo);
        _;
    }

    /**
    * @dev functions affected by this modifier can only be invoked if the provided _min input parameter
    * is smaller than or equal _amount
    * @param _amount the amount provided
    **/
    modifier isValidMinAmount(uint256 _min, uint256 _amount) {
        requireAmountGreaterThanOrEqualMinAmount(_min, _amount);
        _;
    }

    /**
    * Allow or prevent NFT from a collection created offer
    * 
        * 1: allowed
    * 0: disallowance
    **/
    function setCollection(address _collection, uint auth) external onlyOwner {
        collections[_collection] = auth;
    }

    function getOfferParams(address _collection, uint256 _tokenId) external view returns (OfferParams memory) {
        return offers[_collection][_tokenId].params;
    }

    function getOfferSetting(address _collection, uint256 _tokenId) external view returns (Setting memory) {
        return offers[_collection][_tokenId].setting;
    }

    function setAuctionPeriod(uint256 _auctionPeriod) external onlyOwner {
        setting.auctionPeriod = _auctionPeriod;
    }

    function setLendingPerCycle(uint256 _lendingPerCycle) external onlyOwner {
        setting.lendingPerCycle = _lendingPerCycle;
    }

    function setLiquidationPeriod(uint256 _liquidationPeriod) external onlyOwner {
        setting.liquidationPeriod = _liquidationPeriod;
    }

    function setInterestRate(uint256 _lenderFeeRate, uint256 _serviceFeeRate) external onlyOwner {
        setting.lenderFeeRate = _lenderFeeRate;
        setting.serviceFeeRate = _serviceFeeRate;
    }

    function createOffer(address _collection, uint256 _tokenId, address _dest, uint256 _minAmount, uint256 _amount, address _paymentToken, uint256 _borrowCycleNo)
    external
    nonReentrant
    onlyAmountGreaterThanZero(_minAmount)
    onlyCycleNoGreaterThanOne(_borrowCycleNo)
    isValidMinAmount(_minAmount, _amount)
    {
        // Required collection belongs to whitelist
        require(collections[_collection] == 1, "invalid-collection");

        // Send NFT to this contract to escrow
        IERC721(_collection).transferFrom(msg.sender, address(this), _tokenId);

        // Init offer
        Offer memory offer;
        OfferParams memory params;

        params.owner = msg.sender;
        params.lender = address(0);
        params.minBorrowAmount = _minAmount;
        params.borrowAmount = _amount;
        params.paymentToken = _paymentToken;
        params.dest = _dest;
        params.bidder = address(0);
        params.borrowCycleNo = _borrowCycleNo;
        params.bestBid = 0;
        params.interestAmount = 0;
        params.startAuctionAt = block.timestamp;
        params.status = State.open;

        offer.setting = setting;
        offer.params = params;

        offers[_collection][_tokenId] = offer;

        emit OfferCreated(
            _collection,
            _tokenId,
            msg.sender,
            _dest,
            _minAmount,
            _amount,
            _paymentToken,
            params.startAuctionAt
        );
    }

    // Lender call this function to accepted the offer immediately
    function applyOffer(address _collection, uint256 _tokenId) external {
        Offer storage offer = offers[_collection][_tokenId];
        require(offer.params.status == State.open, "apply-non-open-offer");

        IERC20(offer.params.paymentToken).transferFrom(msg.sender, offer.params.dest, offer.params.borrowAmount);

        offer.params.status = State.in_progress;
        offer.params.lender = msg.sender;
        offer.params.endAuctionAt = offer.params.startAuctionAt + offer.setting.auctionPeriod;

        {
            uint256 lendingPeriod = offer.params.borrowCycleNo * offer.setting.lendingPerCycle;
            offer.params.endLendingAt = offer.params.endAuctionAt + lendingPeriod;
            uint256 interestRate = offer.setting.lenderFeeRate + offer.setting.serviceFeeRate;
            // TODO. seconds
            offer.params.interestAmount = (interestRate / 100) * offer.params.borrowAmount * (lendingPeriod / 365);
        }
    }

    // Lender can bid
    function bid(address _collection, uint256 _tokenId, uint256 bidAmount) external {
        Offer storage offer = offers[_collection][_tokenId];

        require(offer.params.status == State.open, "bid-non-open-offer-error");
        require(bidAmount >= offer.params.minBorrowAmount, "bid-amount-under-min-error");

        // Noone bid this offer yet!
        if (offer.params.bidder == address(0)) {
            IERC20(offer.params.paymentToken).transferFrom(msg.sender, address(this), bidAmount);
        } else {
            // Send last bid back to previous bidder
            IERC20(offer.params.paymentToken).transferFrom(address(this), offer.params.bidder, offer.params.bestBid);
            // Get current largest bid
            IERC20(offer.params.paymentToken).transferFrom(msg.sender, address(this), bidAmount);
            offer.params.bidder = msg.sender;
            offer.params.bestBid = bidAmount;

        }

        emit OfferBid(_collection, _tokenId, msg.sender, bidAmount, offer.params.paymentToken);
    }

    // Borrower pay all and interest
    function repay() external {
    }

    // Borrower interest only and extend deadline
    function extendLendingTime(address _collection, uint256 _tokenId, uint256 extCycleNo)
    external
    onlyCycleNoGreaterThanOne(extCycleNo)
    {
        Offer storage offer = offers[_collection][_tokenId];
        require(offer.params.owner == msg.sender, "only-owner-can-extend-lending-time");
        require(offer.params.endLendingAt <= block.timestamp, "lending-time-closed");

        uint256 extendInterestAmount = getExtendInterestAmount(_collection, _tokenId, extCycleNo);
        uint256 totalInterestAmount = extendInterestAmount + offer.params.interestAmount;

        uint256 serviceFeeAmount = (offer.setting.serviceFeeRate / 100) * totalInterestAmount;
        uint256 lenderFeeAmount = (offer.setting.lenderFeeRate / 100) * totalInterestAmount;
        if (serviceFeeAmount > 0) IERC20(offer.params.paymentToken).transferFrom(msg.sender, treasury, serviceFeeAmount);
        if (lenderFeeAmount > 0) IERC20(offer.params.paymentToken).transferFrom(msg.sender, offer.params.lender, lenderFeeAmount);

        offer.params.interestAmount = 0;
        offer.params.endLendingAt += extCycleNo * offer.setting.lendingPerCycle;
        offer.params.liquidationAt = offer.params.endLendingAt + offer.setting.liquidationPeriod;

        emit ExtendLendingTimeRequested(_collection, _tokenId, offer.params.endLendingAt, offer.params.liquidationAt, serviceFeeAmount, lenderFeeAmount);
    }

    // Lender can claim NFT if one time
    // Anyone can claim NFT if out of time
    function claim() external {

    }

    function getExtendInterestAmount(address _collection, uint256 _tokenId, uint256 extCycleNo) public returns (uint256) {
        Offer storage offer = offers[_collection][_tokenId];
        uint256 extendTime = extCycleNo * offer.setting.lendingPerCycle;
        // TODO: calculate with seconds
        uint256 interestAmount = (extendTime / 365) * offer.params.borrowAmount * ((offer.setting.serviceFeeRate + offer.setting.lenderFeeRate ) / 100);
        return interestAmount;
    }

    /**
    * @notice internal function to save on code size for the onlyAmountGreaterThanZero modifier
    **/
    function requireAmountGreaterThanZero(uint256 _amount) internal pure {
        require(_amount > 0, "Amount must be greater than 0");
    }

    /**
     * @notice internal function to save on code size for the onlyAmountGreaterThanZero modifier
     **/
    function requireCycleNoGreaterThanOne(uint256 _cycleNo) internal pure {
        require(_cycleNo > 1, "Cycle number must be greater than 1");
    }

    /**
    * @notice internal function to save on code size for the onlyAmountGreaterThanZero modifier
    **/
    function requireAmountGreaterThanOrEqualMinAmount(uint256 _min, uint256 _amount) internal pure {
        require(_amount >= _min, "Min amount must be greatr than or equal expected amount");
    }
}
