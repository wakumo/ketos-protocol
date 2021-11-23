//SPDX-License-Identifier: MIT
pragma solidity 0.8.9;
pragma experimental ABIEncoderV2;

import "./extensions/Ownable.sol";
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

    // EIP712 Domain Name value
    string constant private EIP712_DOMAIN_NAME = "PawnShop";

    // EIP712 Domain Version value
    string constant private EIP712_DOMAIN_VERSION = "1";

    // Hash of the EIP712 Domain Separator Schema
    /* solium-disable-next-line indentation */
    bytes32 constant private EIP712_DOMAIN_SEPARATOR_SCHEMA_HASH = keccak256(abi.encodePacked(
        "EIP712Domain(",
        "string name,",
        "string version,",
        "uint256 chainId,",
        "address verifyingContract",
        ")"
    ));

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
        uint256 lenderFeeRate;
        uint256 serviceFeeRate;
        uint256 nftType;
        uint256 nftAmount;
        address collection;
        uint256 tokenId;
        OfferState state;
    }

    // Hash of the EIP712 Domain Separator data
    bytes32 public EIP712_DOMAIN_HASH;

    // EIP191 header for EIP712 prefix
    bytes2 constant private EIP191_HEADER = 0x1901;

    // Hash of the EIP712 Offer struct
    /* solium-disable-next-line indentation */
    bytes32 constant private EIP712_OFFER_STRUCT_SCHEMA_HASH = keccak256(abi.encodePacked(
        "Offer(",
        "address owner,",
        "address lender,",
        "uint256 borrowAmount,",
        "address borrowToken,",
        "address to,",
        "uint256 startApplyAt,",
        "uint256 closeApplyAt",
        "uint256 borrowPeriod,",
        "uint256 startLendingAt,",
        "uint256 lenderFeeRate,",
        "uint256 serviceFeeRate,",
        "uint256 nftType,",
        "uint256 nftAmount,",
        "address collection,",
        "uint256 tokenId,",
        "OfferState state,",
        ")"
    ));

    mapping(bytes16 => Offer) private _offers;

    mapping(address => uint256) private _serviceFeeRates;

    mapping(address => bool) public supportedTokens;

    // Address will received service fee
    address payable public treasury;

    address constant private ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    uint256 constant private MIN_LENDER_FEE_RATE = 60000; // 6 %
    uint256 constant private MAX_LENDER_FEE_RATE = 720000; // 72 %
    uint256 constant private MAX_SERVICE_FEE_RATE = 280000; // 28 %

    constructor(address payable _treasury, address _multisigWallet) {

        treasury = _treasury;

        // Transfer ownership to multi-signature wallet
        _transferOwnership(_multisigWallet);

        /* solium-disable-next-line indentation */
        EIP712_DOMAIN_HASH = keccak256(abi.encode(
            EIP712_DOMAIN_SEPARATOR_SCHEMA_HASH,
            keccak256(bytes(EIP712_DOMAIN_NAME)),
            keccak256(bytes(EIP712_DOMAIN_VERSION)),
            block.chainid,
            address(this)
        ));
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

    function setServiceFeeRates(address[] memory _tokens, uint256[] memory _feeRates) external override onlyOwner {
        for (uint256 i = 0; i < _tokens.length; i++) {
            setServiceFeeRate(_tokens[i], _feeRates[i]);
        }
    }

    function _addSupportedToken(address _token) internal onlyOwner {
        supportedTokens[_token] = true;
    }

    function removeSupportedTokens(address[] memory _tokens) external override onlyOwner {
        for (uint256 i = 0; i < _tokens.length; i++) {
            supportedTokens[_tokens[i]] = false;
        }
    }

    function setServiceFeeRate(address _token, uint256 _feeRate) public override onlyOwner {
        require(_feeRate < MAX_SERVICE_FEE_RATE, "invalid_service_fee"); // 28%
        _addSupportedToken(_token);
        _serviceFeeRates[_token] = _feeRate;
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
        require(supportedTokens[params.borrowToken] == true, "invalid_borrow_token");
        require(params.borrowPeriod <= PawnShopLibrary.YEAR_IN_SECONDS, "over-max-extend-lending-time");

        // Init offer
        Offer memory offer;
        offer.lenderFeeRate = params.lenderFeeRate;
        offer.serviceFeeRate = _serviceFeeRates[params.borrowToken];
        {
            (uint256 lenderFee, uint256 serviceFee) = quoteFees(params.borrowAmount, offer.lenderFeeRate, offer.serviceFeeRate, params.borrowPeriod);
            require(lenderFee > 0, "required minimum lender fee");
            require(serviceFee >= 0, "invalid_service_fee");
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

        bytes32 offerHash = getOfferHashOfferInfo(offer);

        emit OfferCreated(params.offerId, offer.collection, offer.tokenId, msg.sender, offerHash);
    }


    /**
     * Returns the EIP712 hash of an offer.
     *
     * To check data integrity
     */
    function getOfferHash(bytes16 _offerId)
        public
        override
        view
        returns (bytes32)
    {
        Offer memory offer = _offers[_offerId];

        return getOfferHashOfferInfo(offer);
    }

    function getOfferHashOfferInfo(Offer memory _offer) public view returns (bytes32) {
        // compute the overall signed struct hash
        /* solium-disable-next-line indentation */
        bytes32 structHash = keccak256(abi.encode(
            EIP712_OFFER_STRUCT_SCHEMA_HASH,
            _offer
        ));

        // compute eip712 compliant hash
        /* solium-disable-next-line indentation */
        return keccak256(abi.encodePacked(
            EIP191_HEADER,
            EIP712_DOMAIN_HASH,
            structHash
        ));
    }

    // Lender call this function to accepted offer
    function applyOffer(bytes16 _offerId, bytes32 _offerHash)
        external
        whenNotPaused
        override
        payable
        nonReentrant
    {
        Offer storage offer = _offers[_offerId];

        // Validations
        require(offer.state == OfferState.OPEN, "apply-non-open-offer");
        if (offer.closeApplyAt != 0) require(offer.closeApplyAt >= block.timestamp, "expired-order");
        // Check data integrity of the offer
        // Make sure the borrower does not change any information at applying time
        bytes32 offerHash = getOfferHashOfferInfo(offer);
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
        offer.state = OfferState.LENDING;
        emit OfferApplied(_offerId, offer.collection, offer.tokenId, msg.sender);
    }

    // Borrower pay
    function repay(bytes16 _offerId)
        external
        override
        payable
        nonReentrant
    {
        Offer storage offer = _offers[_offerId];

        // Validations
        require(offer.state == OfferState.LENDING, "repay-in-progress-offer-only");
        require(offer.startLendingAt.add(offer.borrowPeriod) >= block.timestamp, "overdue loan");
        require(offer.owner == msg.sender, "only owner can repay and get NFT");

        // Repay token to lender
        if (offer.borrowToken == ETH_ADDRESS) require(msg.value >= offer.borrowAmount, "invalid-amount");
        _safeTransfer(offer.borrowToken, msg.sender, offer.lender, offer.borrowAmount);

        // Send NFT back to borrower
        _nftSafeTransfer(address(this), msg.sender, offer.collection, offer.tokenId, offer.nftAmount, offer.nftType);

        offer.state = OfferState.REPAID;
        emit Repay(_offerId, offer.collection, offer.tokenId, msg.sender, offer.borrowAmount);
    }

    // Borrower can update an offer that hasn't been applied yet
    function updateOffer(bytes16 _offerId, uint256 _borrowAmount, uint256 _borrowPeriod, uint256 _lenderFeeRate)
        external
        whenNotPaused
        override
    {
        Offer storage offer = _offers[_offerId];

        // Validations
        require(offer.state == OfferState.OPEN, "only update unapply offer");
        require(offer.owner == msg.sender, "only owner can update offer");
        require(offer.lender == address(0), "only update unapply offer");
        require(_lenderFeeRate >= MIN_LENDER_FEE_RATE, "lt_min_lender_fee_RATE");
        require(_lenderFeeRate <= MAX_LENDER_FEE_RATE, "gt_max_lender_fee_RATE");
        require(_borrowPeriod <= PawnShopLibrary.YEAR_IN_SECONDS, "exceeded borrow period");

        // Update offer if has changed?
        if (_borrowPeriod > 0) offer.borrowPeriod = _borrowPeriod;
        if (_borrowAmount > 0) offer.borrowAmount = _borrowAmount;
        offer.lenderFeeRate = _lenderFeeRate;

        (uint256 lenderFee, uint256 serviceFee) = quoteFees(offer.borrowAmount, offer.lenderFeeRate, offer.serviceFeeRate, offer.borrowPeriod);

        // Validations
        require(lenderFee > 0, "required minimum lender fee");
        require(serviceFee >= 0, "invalid_service_fee");
        bytes32 offerHash = getOfferHashOfferInfo(offer);
        emit OfferUpdated(_offerId, offer.collection, offer.tokenId, offer.borrowAmount, offer.borrowPeriod, offerHash);
    }

    // Borrower can cancel an offer that hasn't been applied to get nft back
    function cancelOffer(bytes16 _offerId)
        external
        whenNotPaused
        override
    {
        Offer storage offer = _offers[_offerId];

        // Validations
        require(offer.owner == msg.sender, "only owner can cancel offer");
        require(offer.lender == address(0), "only update unapply offer");
        require(offer.state == OfferState.OPEN, "can only cancel open offer");

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
        Offer storage offer = _offers[_offerId];
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
        Offer storage offer = _offers[_offerId];
        (lenderFee, serviceFee) = quoteFees(offer.borrowAmount, offer.lenderFeeRate, offer.serviceFeeRate, offer.borrowPeriod);
        approvedAmount = offer.borrowAmount.sub(lenderFee);
    }

    // Borrower interest only and extend deadline
    // The total loan period cannot exceed 1 year
    function extendLendingTime(bytes16 _offerId, uint256 _extendPeriod)
        external
        override
        payable
        nonReentrant
        onlyBorrowPeriodGreaterThanZero(_extendPeriod)
    {
        Offer storage offer = _offers[_offerId];

        // Validations
        require(offer.borrowPeriod.add(_extendPeriod) <= PawnShopLibrary.YEAR_IN_SECONDS, "over-max-extend-lending-time");
        require(offer.owner == msg.sender, "only-owner-can-extend-lending-time");
        require(offer.state == OfferState.LENDING, "can only extend in progress offer");
        require(offer.startLendingAt.add(offer.borrowPeriod) >= block.timestamp, "lending-time-closed");

        // Calculate Fees
        (uint256 lenderFee, uint256 serviceFee) = quoteFees(offer.borrowAmount, offer.lenderFeeRate, offer.serviceFeeRate, _extendPeriod);
        require(lenderFee > 0, "required minimum lender fee");
        require(serviceFee >= 0, "invalid_service_fee");

        if (offer.borrowToken == ETH_ADDRESS) require(msg.value >= (lenderFee + serviceFee), "invalid-amount");
        if (serviceFee > 0) _safeTransfer(offer.borrowToken, msg.sender, treasury, serviceFee);
        _safeTransfer(offer.borrowToken, msg.sender, offer.lender, lenderFee);

        // Update end times
        offer.borrowPeriod = offer.borrowPeriod.add(_extendPeriod);

        emit ExtendLendingTimeRequested(
            _offerId,
            offer.collection,
            offer.tokenId,
            offer.startLendingAt.add(offer.borrowPeriod),
            lenderFee,
            serviceFee
        );
    }

    // Lender can claim nft after the loan is past due
    // and the borrower has not yet repayed
    function claim(bytes16 _offerId)
        external
        override
        nonReentrant
    {
        Offer storage offer = _offers[_offerId];

        // Validations
        require(offer.state == OfferState.LENDING, "offer not lending");
        require(block.timestamp > offer.startLendingAt.add(offer.borrowPeriod), "can not claim in lending period");
        require(offer.lender == msg.sender, "only lender can claim NFT at this time");

        // Send NFT to taker
        _nftSafeTransfer(address(this), msg.sender, offer.collection, offer.tokenId, offer.nftAmount, offer.nftType);
        offer.state = OfferState.CLAIMED;
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
