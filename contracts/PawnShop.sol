//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

// import "hardhat/console.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract PawnShop is Ownable, ReentrancyGuard {
    using SafeMath for uint256;

    event OfferCreated(
        address indexed _collection,
        uint256 indexed _tokenId,
        address _owner,
        address _dest,
        uint256 _amount,
        address _paymentToken,
        uint256 _startTime,
        uint256 _endTime
    );

    event OfferApplied(
        address indexed _collection,
        uint256 indexed _tokenId,
        address _lender
    );

    event Repay(
        address indexed _collection,
        uint256 indexed _tokenId,
        address _repayer,
        uint256 _amount
    );

    event OfferUpdated(
        address indexed _collection,
        uint256 indexed _tokenId,
        uint256 _amount
    );

    event OfferCancelled(
        address indexed _collection,
        uint256 indexed _tokenId
    );

    event ExtendLendingTimeRequested(
        address indexed _collection,
        uint256 indexed _tokenId,
        uint256 _lendingEndAt,
        uint256 _liquidationAt,
        uint256 _lendingFeeAmount,
        uint256 _serviceFeeAmount
    );

    event NFTClaim(
        address indexed _collection,
        uint256 indexed _tokenId,
        address _taker
    );

    enum State {
        open,
        in_progress
    }

    struct OfferParams {
        address owner;
        address lender;
        uint256 borrowAmount;
        address paymentToken;
        address dest;
        uint256 startTime;
        uint256 endTime;
        uint256 borrowCycleNo;
        uint256 startLendingAt;
        uint256 endLendingAt;
        uint256 liquidationAt;
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

    address payable public treasury;

    uint256 private constant YEAR_IN_SECONDS = 31556926;

    Setting public setting;

    constructor(address payable _treasury) public {
        setting.auctionPeriod = 259200; // 3 days
        setting.lendingPerCycle = 604800; // 7 days for a cycle
        setting.liquidationPeriod = 2592000; // 30 days
        setting.lenderFeeRate = 100000; // 10%
        setting.serviceFeeRate = 20000; // 2%
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
    modifier onlyCycleNoGreaterThanZero(uint256 _cycleNo) {
        requireCycleNoGreaterThanZero(_cycleNo);
        _;
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

    function createOffer(address _collection, uint256 _tokenId, address _dest, uint256 _amount, address _paymentToken, uint256 _borrowCycleNo, uint256 _startTime, uint256 _endTime)
        external
        nonReentrant
        onlyAmountGreaterThanZero(_amount)
        onlyCycleNoGreaterThanZero(_borrowCycleNo)
    {
        // Validations
        if (_endTime != 0) require(_endTime >= block.timestamp, "invalid-end-time");
        require(IERC721(_collection).getApproved(_tokenId) == address(this), "please approve NFT first");

        // Send NFT to this contract to escrow
        IERC721(_collection).transferFrom(msg.sender, address(this), _tokenId);

        // Init offer
        Offer memory offer;
        OfferParams memory params;

        // Set offer informations
        params.owner = msg.sender;
        params.lender = address(0);
        params.borrowAmount = _amount;
        params.paymentToken = _paymentToken;
        params.dest = _dest;
        params.borrowCycleNo = _borrowCycleNo;
        if (_startTime == 0) params.startTime = block.timestamp;
        params.endTime = _endTime;
        params.startLendingAt = 0;
        params.status = State.open;
        offer.setting = setting;
        offer.params = params;
        offers[_collection][_tokenId] = offer;

        emit OfferCreated(
            _collection,
            _tokenId,
            msg.sender,
            _dest,
            _amount,
            _paymentToken,
            params.startTime,
            params.endTime
        );
    }

    // Lender call this function to accepted the offer immediately
    function applyOffer(address _collection, uint256 _tokenId, uint256 _amount)
        external
        nonReentrant
    {
        Offer storage offer = offers[_collection][_tokenId];

        // Validations
        require(offer.params.borrowAmount == _amount, "offer amount has changed");
        require(offer.params.status == State.open, "apply-non-open-offer");
        if (offer.params.endTime != 0) require(offer.params.endTime >= block.timestamp, "expired-order");

        // Update offer informations
        offer.params.status = State.in_progress;
        offer.params.lender = msg.sender;
        offer.params.startLendingAt = block.timestamp;

        // Calculate Fees
        uint256 lendingPeriod = offer.params.borrowCycleNo.mul(offer.setting.lendingPerCycle);
        uint256 interestFee = lendingPeriod.mul(offer.params.borrowAmount).mul(offer.setting.lenderFeeRate).div(YEAR_IN_SECONDS).div(1000000);
        uint256 adminFee = lendingPeriod.mul(offer.params.borrowAmount).mul(offer.setting.serviceFeeRate).div(YEAR_IN_SECONDS).div(1000000);
        uint256 borrowAmountAfterFee = offer.params.borrowAmount.sub(interestFee).sub(adminFee);

        // Send amount to borrower and fee to admin
        IERC20(offer.params.paymentToken).transferFrom(msg.sender, offer.params.dest, borrowAmountAfterFee);
        IERC20(offer.params.paymentToken).transferFrom(msg.sender, treasury, adminFee);

        // Update end times
        offer.params.endLendingAt = offer.params.startLendingAt.add(lendingPeriod);
        offer.params.liquidationAt = offer.params.endLendingAt.add(offer.setting.liquidationPeriod);

        emit OfferApplied(_collection, _tokenId, msg.sender);
    }

    // Borrower pay
    function repay(address _collection, uint256 _tokenId)
        external
        nonReentrant
    {
        Offer storage offer = offers[_collection][_tokenId];

        // Validations
        require(offer.params.status == State.in_progress, "repay-in-progress-offer-only");
        require(offer.params.endLendingAt >= block.timestamp, "overdue loan");
        require(offer.params.owner == msg.sender, "only owner can repay and get NFT");

        // Repay token to lender
        IERC20(offer.params.paymentToken).transferFrom(msg.sender, offer.params.lender, offer.params.borrowAmount);
        // Send NFT back to borrower
        IERC721(_collection).transferFrom(address(this), msg.sender, _tokenId);

        // Clear offer
        clearOffer(_collection, _tokenId);

        emit Repay(_collection, _tokenId, msg.sender, offer.params.borrowAmount);
    }

    function updateOffer(address _collection, uint256 _tokenId, uint256 _amount)
        external
        onlyAmountGreaterThanZero(_amount)
    {
        Offer storage offer = offers[_collection][_tokenId];

        // Validations
        require(offer.params.owner == msg.sender, "only owner can update offer");
        require(offer.params.lender == address(0), "only update unapply offer");

        // Update Offer
        offer.params.borrowAmount = _amount;

        emit OfferUpdated(_collection, _tokenId, offer.params.borrowAmount);
    }

    function cancelOffer(address _collection, uint256 _tokenId)
        external
    {
        Offer storage offer = offers[_collection][_tokenId];

        // Validations
        require(offer.params.owner == msg.sender, "only owner can cancel offer");
        require(offer.params.lender == address(0), "only update unapply offer");

        // Send NFT back to borrower
        IERC721(_collection).transferFrom(address(this), msg.sender, _tokenId);

        // Clear offer
        clearOffer(_collection, _tokenId);

        emit OfferCancelled(_collection, _tokenId);
    }

    // Borrower interest only and extend deadline
    function extendLendingTime(address _collection, uint256 _tokenId, uint256 extCycleNo)
        external
        nonReentrant
        onlyCycleNoGreaterThanZero(extCycleNo)
    {
        Offer storage offer = offers[_collection][_tokenId];

        // Validations
        require(offer.params.owner == msg.sender, "only-owner-can-extend-lending-time");
        require(offer.params.status == State.in_progress, "can only extend in progress offer");
        require(offer.params.endLendingAt >= block.timestamp, "lending-time-closed");

        // Calculate Fees
        uint256 lendingPeriod = extCycleNo.mul(offer.setting.lendingPerCycle);
        uint256 interestFee = lendingPeriod.mul(offer.params.borrowAmount).mul(offer.setting.lenderFeeRate).div(YEAR_IN_SECONDS).div(1000000);
        uint256 serviceFee = lendingPeriod.mul(offer.params.borrowAmount).mul(offer.setting.serviceFeeRate).div(YEAR_IN_SECONDS).div(1000000);

        // Send amount to borrower and fee to admin
        IERC20(offer.params.paymentToken).transferFrom(msg.sender, offer.params.lender, interestFee);
        IERC20(offer.params.paymentToken).transferFrom(msg.sender, treasury, serviceFee);

        // Update end times
        offer.params.endLendingAt = offer.params.endLendingAt.add(lendingPeriod);
        offer.params.liquidationAt = offer.params.endLendingAt.add(offer.setting.liquidationPeriod);

        emit ExtendLendingTimeRequested(_collection, _tokenId, offer.params.endLendingAt, offer.params.liquidationAt, interestFee, serviceFee);
    }

    /**
    *
    * In liquidation period, only lender can claim NFT
    * After liquidation period, anyone with fast hand can claim NFT
    *
    **/
    function claim(address _collection, uint256 _tokenId)
        external
        nonReentrant
    {
        Offer storage offer = offers[_collection][_tokenId];

        // Validations
        require(block.timestamp > offer.params.endLendingAt, "can not claim in lending period");
        if (block.timestamp <= offer.params.liquidationAt) require(offer.params.lender == msg.sender, "only lender can claim NFT at this time");

        // Send NFT to taker
        IERC721(_collection).transferFrom(address(this), msg.sender, _tokenId);

        // Clear offer
        clearOffer(_collection, _tokenId);

        emit NFTClaim(_collection, _tokenId, msg.sender);
    }

    /**
     * Clear to allow borrower can createOffer again
     **/
    function clearOffer(address _collection, uint256 _tokenId) internal {
        delete offers[_collection][_tokenId];
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
    function requireCycleNoGreaterThanZero(uint256 _cycleNo) internal pure {
        require(_cycleNo >= 1, "Cycle number must be greater than or equal 1");
    }

    /**
     * @notice internal function to save on code size for the onlyAmountGreaterThanZero modifier
     **/
    function requireAmountGreaterThanOrEqualMinAmount(uint256 _min, uint256 _amount) internal pure {
        require(_amount >= _min, "Min amount must be greatr than or equal expected amount");
    }
}
