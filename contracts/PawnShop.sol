//SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
pragma experimental ABIEncoderV2;

// import "hardhat/console.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

import './interfaces/IPawnShop.sol';
import './libraries/PawnShopLibrary.sol';

contract PawnShop is IPawnShop, Ownable, Pausable, ReentrancyGuard {
    using SafeMath for uint256;

    struct FeeRate {
        uint256 lenderFeeRate;
        uint256 serviceFeeRate;
    }
    enum OfferState { OPEN, LENDING, CANCELED, REPAID, CLAIMED }
    struct Offer {
        address owner;
        address lender;
        uint256 borrowAmount;
        address borrowToken;
        address to;
        uint256 startApplyAt;
        uint256 closeApplyAt;
        uint256 borrowPeriod;
        uint256 startLendingAt;
        uint256 liquidationAt;
        uint256 lenderFeeRate;
        uint256 serviceFeeRate;
        uint256 nftType;
        uint256 nftAmount;
        address collection;
        uint256 tokenId;
        OfferState state;
    }

    mapping(bytes16 => Offer) private _offers;

    mapping(address => uint256) private _serviceFeeRates;

    mapping(address => bool) public supportTokens;

    address payable public treasury;

    uint256 constant public LIQUIDATION_PERIOD_IN_SECONDS = 2592000;
    address constant public ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    uint256 constant public MIN_LENDER_FEE_RATE = 60000; // 6 %
    uint256 constant public MAX_LENDER_FEE_RATE = 720000; // 72 %

    constructor(address payable _treasury) {
        treasury = _treasury;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
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
    * @dev functions affected by this modifier can only be invoked if the provided borrowPeriod input parameter
    * is not zero.
    **/
    modifier onlyBorrowPeriodGreaterThanZero(uint256 _borrowPeriod) {
        requireBorrowPeriodGreaterThanZero(_borrowPeriod);
        _;
    }

    function getServiceFeeRate(address _token) external view returns (uint256) {
        return _serviceFeeRates[_token];
    }

    function setServiceFeeRates(address[] memory _tokens, uint256[] memory _fees) external override onlyOwner {
        for (uint256 i = 0; i < _tokens.length; i++) {
            setServiceFeeRate(_tokens[i], _fees[i]);
        }
    }

    function addSupportToken(address _token) internal onlyOwner {
        supportTokens[_token] = true;
    }

    function removeSupportTokens(address[] memory _tokens) external override {
        for (uint256 i = 0; i < _tokens.length; i++) {
            supportTokens[_tokens[i]] = false;
        }
    }

    function setServiceFeeRate(address _token, uint256 _fee) public override onlyOwner {
        require(_fee < 1000000, "invalid_service_fee"); // 100%
        addSupportToken(_token);
        _serviceFeeRates[_token] = _fee;
    }

    function getOffer(bytes16 _offerId) external view returns(Offer memory offer){
        return _offers[_offerId];
    }

    function createOffer721(OfferCreateParam memory params)
        external
        override
        whenNotPaused
        nonReentrant
    {
        require(IERC721(params.collection).getApproved(params.tokenId) == address(this), "please approve NFT first");
        require(params.nftAmount == 1, "nft_amount_should_be_1");
        // Send NFT to this contract to escrow
        _nftSafeTransfer(msg.sender, address(this), params.collection, params.tokenId, params.nftAmount, 721);
        _createOffer(params, 721);
    }

    function createOffer1155(OfferCreateParam memory params)
        external
        override
        whenNotPaused
        nonReentrant
    {
        require(IERC1155(params.collection).isApprovedForAll(msg.sender, address(this)) == true, "please approve NFT first");
        // Send NFT to this contract to escrow
        _nftSafeTransfer(msg.sender, address(this), params.collection, params.tokenId, params.nftAmount, 1155);
        _createOffer(params, 1155);
    }

    function _nftSafeTransfer(address _from, address _to, address _collection, uint256 _tokenId, uint256 _nftAmount, uint256 _nftType) internal {
        if (_nftType  == 1155) {
            IERC1155(_collection).safeTransferFrom(_from, _to, _tokenId, _nftAmount, "0x");
        } else if (_nftType == 721) {
            IERC721(_collection).transferFrom(_from, _to, _tokenId);
        }
    }

    function _safeTransfer(address _token, address _from, address _to, uint256 _amount) internal {
        if (_token == ETH_ADDRESS) {
            payable(_to).transfer(_amount);
        } else {
            IERC20(_token).transferFrom(_from, _to, _amount);
        }
    }

    function _createOffer(
        OfferCreateParam memory params,
        uint256 _nftType
    )
        internal
        whenNotPaused
        onlyAmountGreaterThanZero(params.borrowAmount)
        onlyBorrowPeriodGreaterThanZero(params.borrowPeriod)
    {
        // Validations
        if (params.closeApplyAt != 0) require(params.closeApplyAt >= block.timestamp, "invalid closed-apply time");

        require(params.borrowToken != address(0), "invalid-payment-token");
        require(_offers[params.offerId].collection == address(0), "offer-existed");
        require(params.lenderFeeRate >= MIN_LENDER_FEE_RATE, "lt_min_lender_fee_RATE");
        require(params.lenderFeeRate <= MAX_LENDER_FEE_RATE, "gt_max_lender_fee_RATE");
        require(supportTokens[params.borrowToken] == true, "invalid_borrow_token");

        // Init offer
        Offer memory offer;
        offer.lenderFeeRate = params.lenderFeeRate;
        offer.serviceFeeRate = _serviceFeeRates[params.borrowToken];
        {
            (uint256 lenderFee, uint256 serviceFee) = quoteFees(params.borrowAmount, offer.lenderFeeRate, offer.serviceFeeRate, params.borrowPeriod);
            require(lenderFee > 0, "required minimum lender fee");
        }
        // Set offer informations
        offer.owner = msg.sender;
        offer.borrowAmount = params.borrowAmount;
        offer.borrowToken = params.borrowToken;
        offer.to = params.to;
        offer.collection = params.collection;
        offer.tokenId = params.tokenId;
        offer.startApplyAt = params.startApplyAt;
        if (offer.startApplyAt == 0) offer.startApplyAt = block.timestamp;
        offer.closeApplyAt = params.closeApplyAt;
        offer.borrowPeriod = params.borrowPeriod;
        offer.nftType = _nftType;
        offer.nftAmount = params.nftAmount;
        offer.state = OfferState.OPEN;

        _offers[params.offerId] = offer;
        // Emit event
        emit OfferCreated(
            params.offerId,
            offer.collection,
            offer.tokenId,
            msg.sender,
            offer.to,
            offer.borrowAmount,
            offer.borrowToken,
            offer.startApplyAt,
            offer.closeApplyAt,
            offer.borrowPeriod,
            offer.nftType,
            offer.nftAmount
        );
    }

    function getOfferHash(
        bytes16 _offerId,
        address _collection,
        uint256 _tokenId,
        uint256 _borrowAmount,
        address _borrowToken,
        uint256 _borrowPeriod,
        uint256 _nftAmount
    ) public view override returns (bytes32) {
        return PawnShopLibrary.offerHash(
            _offerId,
            _collection,
            _tokenId,
            _borrowAmount,
            _borrowToken,
            _borrowPeriod,
            _nftAmount
        );
    }

    // Lender call this function to accepted the offer immediatel
    function applyOffer(bytes16 _offerId, bytes32 _offerHash)
        external
        whenNotPaused
        override
        payable
        nonReentrant
    {
        Offer memory offer = _offers[_offerId];

        // Validations
        require(offer.state == OfferState.OPEN, "apply-non-open-offer");
        if (offer.closeApplyAt != 0) require(offer.closeApplyAt >= block.timestamp, "expired-order");
        // Check data integrity of the offer
        // Make sure the borrower does not change any information at applying time
        bytes32 offerHash = PawnShopLibrary.offerHash(
            _offerId,
            offer.collection,
            offer.tokenId,
            offer.borrowAmount,
            offer.borrowToken,
            offer.borrowPeriod,
            offer.nftAmount
        );
        require(offerHash == _offerHash, "offer informations has changed");

        // Update offer informations
        offer.lender = msg.sender;
        offer.startLendingAt = block.timestamp;

        // Calculate Fees
        (uint256 lenderFee, uint256 serviceFee, ) = quoteApplyAmounts(_offerId);
        uint256 borrowAmountAfterFee = offer.borrowAmount.sub(lenderFee).sub(serviceFee);
        if (offer.borrowToken == ETH_ADDRESS) require(msg.value >= (borrowAmountAfterFee.add(serviceFee)), "invalid-amount");

        if (serviceFee > 0) _safeTransfer(offer.borrowToken, msg.sender, treasury, serviceFee);
        _safeTransfer(offer.borrowToken, msg.sender, offer.to, borrowAmountAfterFee);

        // Update end times
        offer.liquidationAt = offer.startLendingAt.add(offer.borrowPeriod).add(LIQUIDATION_PERIOD_IN_SECONDS);
        offer.state = OfferState.LENDING;
        _offers[_offerId] = offer;
        emit OfferApplied(_offerId, offer.collection, offer.tokenId, msg.sender);
    }

    // Borrower pay
    function repay(bytes16 _offerId)
        external
        override
        payable
        nonReentrant
    {
        Offer memory offer = _offers[_offerId];

        // Validations
        require(offer.state == OfferState.LENDING, "repay-in-progress-offer-only");
        require(offer.startLendingAt.add(offer.borrowPeriod) >= block.timestamp, "overdue loan");
        require(offer.owner == msg.sender, "only owner can repay and get NFT");

        // Repay token to lender
        if (offer.borrowToken == ETH_ADDRESS) require(msg.value >= offer.borrowAmount, "invalid-amount");
        _safeTransfer(offer.borrowToken, msg.sender, offer.lender, offer.borrowAmount);

        // Send NFT back to borrower
        _nftSafeTransfer(address(this), msg.sender, offer.collection, offer.tokenId, offer.nftAmount, offer.nftType);

        // clone amount value to emit
        uint256 borrowAmount = offer.borrowAmount;
        offer.state = OfferState.REPAID;
        _offers[_offerId] = offer;
        emit Repay(_offerId, offer.collection, offer.tokenId, msg.sender, borrowAmount);
    }

    function updateOffer(bytes16 _offerId, uint256 _borrowAmount, uint256 _borrowPeriod, address _borrowToken)
        external
        whenNotPaused
        override
    {
        Offer memory offer = _offers[_offerId];

        // Validations
        require(offer.state == OfferState.OPEN, "only update unapply offer");
        require(offer.owner == msg.sender, "only owner can update offer");
        require(offer.lender == address(0), "only update unapply offer");
        require(supportTokens[_borrowToken] == true, "invalid_borrow_token");

        // Update offer if has changed?
        if (_borrowPeriod > 0) offer.borrowPeriod = _borrowPeriod;
        if (_borrowAmount > 0) offer.borrowAmount = _borrowAmount;
        if (_borrowToken != offer.borrowToken) {
            offer.borrowToken = _borrowToken;
            offer.serviceFeeRate = _serviceFeeRates[offer.borrowToken];
        }
        (uint256 lenderFee, uint256 serviceFee) = quoteFees(offer.borrowAmount, offer.lenderFeeRate, offer.serviceFeeRate, offer.borrowPeriod);

        // Validations
        require(lenderFee > 0, "required minimum lender fee");
        _offers[_offerId] = offer;
        emit OfferUpdated(_offerId, offer.collection, offer.tokenId, offer.borrowAmount, offer.borrowPeriod);
    }

    function cancelOffer(bytes16 _offerId)
        external
        whenNotPaused
        override
    {
        Offer memory offer = _offers[_offerId];

        // Validations
        require(
            offer.owner == msg.sender,
            "only owner can cancel offer"
        );
        require(offer.lender == address(0), "only update unapply offer");
        offer.state = OfferState.CANCELED;
        // Send NFT back to borrower
        _nftSafeTransfer(address(this), msg.sender, offer.collection, offer.tokenId, offer.nftAmount, offer.nftType);
        emit OfferCancelled(_offerId, offer.collection, offer.tokenId);
    }

    //
    // @dev
    // Borrower can know how much they can receive before creating offer
    //
    function quoteFees(uint256 _borrowAmount, uint256 _lenderFeeRate, uint256 _serviceFeeRate, uint256 _lendingPeriod)
        public
        override
        view
        returns (uint256 lenderFee, uint256 serviceFee)
    {
        lenderFee = PawnShopLibrary.getFeeAmount(_borrowAmount, _lenderFeeRate, _lendingPeriod);
        serviceFee = PawnShopLibrary.getFeeAmount(_borrowAmount, _serviceFeeRate, _lendingPeriod);
    }

    // Borrower call this function to estimate how much fees need to paid to extendTimes
    function quoteExtendFees(bytes16 _offerId, uint256 _extendPeriod)
        public
        override
        view
        returns (uint256 lenderFee, uint256 serviceFee)
    {
        Offer memory offer = _offers[_offerId];
        (lenderFee, serviceFee) = quoteFees(offer.borrowAmount, offer.lenderFeeRate, offer.serviceFeeRate, _extendPeriod);
    }

    //
    // @dev
    // approvedAmount: Token amount lender need to approved to take this offer
    //
    function quoteApplyAmounts(bytes16 _offerId)
        public
        override
        view
        returns (uint256 lenderFee, uint256 serviceFee, uint256 approvedAmount)
    {
        Offer memory offer = _offers[_offerId];
        (lenderFee, serviceFee) = quoteFees(offer.borrowAmount, offer.lenderFeeRate, offer.serviceFeeRate, offer.borrowPeriod);
        approvedAmount = offer.borrowAmount.sub(lenderFee);
    }

    // Borrower interest only and extend deadline
    function extendLendingTime(bytes16 _offerId, uint256 _extendPeriod)
        external
        override
        payable
        nonReentrant
        onlyBorrowPeriodGreaterThanZero(_extendPeriod)
    {
        Offer memory offer = _offers[_offerId];

        // Validations
        require(offer.owner == msg.sender, "only-owner-can-extend-lending-time");
        require(offer.state == OfferState.LENDING, "can only extend in progress offer");
        require(offer.startLendingAt.add(offer.borrowPeriod) >= block.timestamp, "lending-time-closed");

        // Calculate Fees
        (uint256 lenderFee, uint256 serviceFee) = quoteFees(offer.borrowAmount, offer.lenderFeeRate, offer.serviceFeeRate, _extendPeriod);
        require(lenderFee > 0, "required minimum lender fee");

        if (offer.borrowToken == ETH_ADDRESS) require(msg.value >= (lenderFee + serviceFee), "invalid-amount");
        if (serviceFee > 0) _safeTransfer(offer.borrowToken, msg.sender, treasury, serviceFee);
        _safeTransfer(offer.borrowToken, msg.sender, offer.lender, lenderFee);

        // Update end times
        offer.borrowPeriod = offer.borrowPeriod.add(_extendPeriod);
        offer.liquidationAt = offer.liquidationAt.add(_extendPeriod);

        _offers[_offerId] = offer;
        emit ExtendLendingTimeRequested(
            _offerId,
            offer.collection,
            offer.tokenId,
            offer.startLendingAt.add(offer.borrowPeriod),
            offer.liquidationAt,
            lenderFee,
            serviceFee
        );
    }

    /**
     *
     * In liquidation period, only lender can claim NFT
     * After liquidation period, anyone with fast hand can claim NFT
     *
     **/
    function claim(bytes16 _offerId)
        external
        override
        nonReentrant
    {
        Offer memory offer = _offers[_offerId];

        // Validations
        require(block.timestamp > offer.startLendingAt.add(offer.borrowPeriod), "can not claim in lending period");
        if (block.timestamp <= offer.liquidationAt)
            require(
                offer.lender == msg.sender,
            "only lender can claim NFT at this time"
            );
        require(
            (msg.sender == treasury) ||
            (msg.sender == offer.lender) ||
            (msg.sender == offer.owner),
            "invalid-address"
        );
        // Send NFT to taker
        _nftSafeTransfer(address(this), msg.sender, offer.collection, offer.tokenId, offer.nftAmount, offer.nftType);
        offer.state = OfferState.CLAIMED;
        _offers[_offerId] = offer;
        emit NFTClaim(_offerId, offer.collection, offer.tokenId, msg.sender);
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
    function requireBorrowPeriodGreaterThanZero(uint256 _borrowAmount) internal pure {
        require(_borrowAmount >= 1, "Borrow period number must be greater than or equal 0");
    }

    /**
     * @notice internal function to save on code size for the onlyAmountGreaterThanZero modifier
     **/
    function requireAmountGreaterThanOrEqualMinAmount(
        uint256 _min,
        uint256 _amount
    ) internal pure {
        require(_amount >= _min, "Min amount must be greatr than or equal expected amount");
    }

    function onERC1155Received(
        address operator,
        address from,
        uint256 id,
        uint256 value,
        bytes calldata data
    ) external returns (bytes4) {
        return bytes4(keccak256("onERC1155Received(address,address,uint256,uint256,bytes)"));
    }

    function onERC1155BatchReceived(
        address operator,
        address from,
        uint256[] calldata ids,
        uint256[] calldata values,
        bytes calldata data
    ) external returns (bytes4) {
        return bytes4(keccak256("onERC1155BatchReceived(address,address,uint256[],uint256[],bytes)"));
    }

}
