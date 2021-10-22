//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
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
        bool    isLending;
    }

    mapping(bytes16 => Offer) private _offers;

    mapping(address => FeeRate) private _tokenFeeRates;

    address payable public treasury;

    uint256 constant public  LIQUIDATION_PERIOD_IN_SECONDS = 2592000;

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

    function getSystemTokenFeeRates(address _token) external view returns (FeeRate memory) {
        return _tokenFeeRates[_token];
    }

    function setTokenFeeRates(
        address _token,
        uint256 _lenderFeeRate,
        uint256 _serviceFeeRate
    ) external override onlyOwner {
        if (_lenderFeeRate > 0) _tokenFeeRates[_token].lenderFeeRate = _lenderFeeRate;
        if (_serviceFeeRate > 0) _tokenFeeRates[_token].serviceFeeRate = _serviceFeeRate;
    }

    function getOffer(bytes16 _offerId) external view returns(Offer memory offer){
        return _offers[_offerId];
    }

    function createOffer721(
        bytes16 _offerId,
        address _collection,
        uint256 _tokenId,
        address _to,
        uint256 _borrowAmount,
        address _borrowToken,
        uint256 _borrowPeriod,
        uint256 _startApplyAt,
        uint256 _closeApplyAt
    )
        external
        override
        whenNotPaused
        nonReentrant
        onlyAmountGreaterThanZero(_borrowAmount)
        onlyBorrowPeriodGreaterThanZero(_borrowPeriod)
    {
        require(IERC721(_collection).getApproved(_tokenId) == address(this), "please approve NFT first");
        // Send NFT to this contract to escrow
        _nftSafeTransfer(msg.sender, address(this), _collection, _tokenId, 1, 721);
        _createOffer(_offerId, _collection, _tokenId, _to, _borrowAmount, _borrowToken, _borrowPeriod, _startApplyAt, _closeApplyAt, 1, 721);
    }

    function createOffer1155(        
        bytes16 _offerId,
        address _collection,
        uint256 _tokenId,
        address _to,
        uint256 _borrowAmount,
        address _borrowToken,
        uint256 _borrowPeriod,
        uint256 _startApplyAt,
        uint256 _closeApplyAt,
        uint256 _nftAmount
    ) external
        override
        whenNotPaused
        nonReentrant
        onlyAmountGreaterThanZero(_borrowAmount)
        onlyBorrowPeriodGreaterThanZero(_borrowPeriod)
    {
        require(IERC1155(_collection).isApprovedForAll(msg.sender, address(this)) == true, "please approve NFT first");
        // Send NFT to this contract to escrow
        _nftSafeTransfer(msg.sender, address(this), _collection, _tokenId, _nftAmount, 1155);
        _createOffer(_offerId, _collection, _tokenId, _to, _borrowAmount, _borrowToken, _borrowPeriod, _startApplyAt, _closeApplyAt, _nftAmount, 1155);
    }

    function _nftSafeTransfer(address _from, address _to, address _collection, uint256 _tokenId, uint256 _nftAmount, uint256 _nftType) internal {
        if (_nftType  == 1155) {
            IERC1155(_collection).safeTransferFrom(_from, _to, _tokenId, _nftAmount, "0x");
        } else if (_nftType == 721) {
            IERC721(_collection).transferFrom(_from, _to, _tokenId);
        }
    }

    function _createOffer(
        bytes16 _offerId,
        address _collection,
        uint256 _tokenId,
        address _to,
        uint256 _borrowAmount,
        address _borrowToken,
        uint256 _borrowPeriod,
        uint256 _startApplyAt,
        uint256 _closeApplyAt,
        uint256 _nftAmount,
        uint256 _nftType
    )
        internal
        whenNotPaused
        onlyAmountGreaterThanZero(_borrowAmount)
        onlyBorrowPeriodGreaterThanZero(_borrowPeriod)
    {
        // Validations
        if (_closeApplyAt != 0) require(_closeApplyAt >= block.timestamp, "invalid closed-apply time");

        require(_borrowToken != address(0), "invalid-payment-token");
        require(_tokenFeeRates[_borrowToken].lenderFeeRate != 0, "invalid-payment-token");
        require(_offers[_offerId].collection == address(0), "offer-existed");
        {
            (uint256 lenderFee, uint256 serviceFee) = quoteFees(_borrowAmount, _borrowToken, _borrowPeriod);
            require(lenderFee > 0, "required minimum lender fee");
            require(serviceFee> 0, "required minimum service fee");
        }

        // Init offer
        Offer storage offer = _offers[_offerId];

        // Set offer informations
        offer.owner = msg.sender;
        offer.borrowAmount = _borrowAmount;
        offer.borrowToken = _borrowToken;
        offer.to = _to;
        offer.collection = _collection;
        offer.tokenId = _tokenId;
        offer.startApplyAt = _startApplyAt;
        if (offer.startApplyAt == 0) offer.startApplyAt = block.timestamp;
        offer.closeApplyAt = _closeApplyAt;
        offer.borrowPeriod = _borrowPeriod;
        offer.lenderFeeRate = _tokenFeeRates[_borrowToken].lenderFeeRate;
        offer.serviceFeeRate = _tokenFeeRates[_borrowToken].serviceFeeRate;
        offer.nftType = _nftType;
        offer.nftAmount = _nftAmount;

        // Emit event
        emit OfferCreated(
            _offerId,
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

    function _offerHash(        
        bytes16 _offerId,
        address _collection,
        uint256 _tokenId,
        uint256 _borrowAmount,
        address _borrowToken,
        uint256 _borrowPeriod,
        uint256 _nftAmount
        ) public view returns(bytes32 _hash) {
        _hash = keccak256(abi.encode(
            _offerId,
            _collection, 
            _tokenId, 
            _borrowAmount,
            _borrowToken,
            _borrowPeriod,
            _tokenFeeRates[_borrowToken].lenderFeeRate,
            _tokenFeeRates[_borrowToken].serviceFeeRate,
            _nftAmount
        ));
    }

    // Lender call this function to accepted the offer immediatel
    // offerHash = encode(owner, offerId, collection, tokenId, borrowerAmount,borroweToken, to, startApplyAt, closeApplyAt, borrowPeriod, lenderFee, serviceFeeRate, nftType, nftAmount)
    function applyOffer(bytes16 _offerId, uint256 _borrowAmount, bytes32 _hash)
        external
        whenNotPaused
        override
        nonReentrant
    {
        Offer storage offer = _offers[_offerId];

        // Validations
        require(offer.borrowAmount == _borrowAmount, "offer borrow amount has changed");
        require(offer.isLending == false, "apply-non-open-offer");
        if (offer.closeApplyAt != 0) require(offer.closeApplyAt >= block.timestamp, "expired-order");

        bytes32 offerHash =_offerHash( 
            _offerId,
            offer.collection, 
            offer.tokenId, 
            offer.borrowAmount,
            offer.borrowToken,
            offer.borrowPeriod,
            offer.nftAmount
        );
        require(offerHash == _hash, "invalid-offer-hash");

        // Update offer informations
        offer.isLending = true;
        offer.lender = msg.sender;
        offer.startLendingAt = block.timestamp;

        // Calculate Fees
        (uint256 lenderFee, uint256 serviceFee, ) = quoteApplyAmounts(_offerId);
        uint256 borrowAmountAfterFee = offer.borrowAmount.sub(lenderFee).sub(serviceFee);

        // Send amount to borrower and fee to admin
        IERC20(offer.borrowToken).transferFrom(msg.sender, offer.to, borrowAmountAfterFee);
        IERC20(offer.borrowToken).transferFrom(msg.sender, treasury, serviceFee);

        // Update end times
        offer.liquidationAt = offer.startLendingAt.add(offer.borrowPeriod).add(LIQUIDATION_PERIOD_IN_SECONDS);

        emit OfferApplied(_offerId, offer.collection, offer.tokenId, msg.sender);
    }

    // Borrower pay
    function repay(bytes16 _offerId)
        external
        override
        nonReentrant
    {
        Offer storage offer = _offers[_offerId];

        // Validations
        require(offer.isLending == true, "repay-in-progress-offer-only");
        require(offer.startLendingAt.add(offer.borrowPeriod) >= block.timestamp, "overdue loan");
        require(offer.owner == msg.sender, "only owner can repay and get NFT");

        // Repay token to lender
        IERC20(offer.borrowToken).transferFrom(
            msg.sender,
            offer.lender,
            offer.borrowAmount
        );
        // Send NFT back to borrower
        _nftSafeTransfer(address(this), msg.sender, offer.collection, offer.tokenId, offer.nftAmount, offer.nftType);

        // clone amount value to emit
        uint256 borrowAmount = offer.borrowAmount;

        emit Repay(_offerId, offer.collection, offer.tokenId, msg.sender, borrowAmount);
    }

    function updateOffer(bytes16 _offerId, uint256 _borrowAmount, uint256 _borrowPeriod)
        external
        whenNotPaused
        override
    {
        Offer storage offer = _offers[_offerId];

        // Validations
        require(offer.owner == msg.sender, "only owner can update offer");
        require(offer.lender == address(0), "only update unapply offer");

        // Update offer if has changed?
        if (_borrowPeriod > 0) offer.borrowPeriod = _borrowPeriod;
        if (_borrowAmount > 0) offer.borrowAmount = _borrowAmount;

        (uint256 lenderFee, uint256 serviceFee) = quoteFees(offer.borrowAmount, offer.borrowToken, offer.borrowPeriod);

        // Validations
        require(lenderFee > 0, "required minimum lender fee");
        require(serviceFee> 0, "required minimum service fee");

        emit OfferUpdated(_offerId, offer.collection, offer.tokenId, offer.borrowAmount, offer.borrowPeriod);
    }

    function cancelOffer(bytes16 _offerId)
        external
        whenNotPaused
        override
    {
        Offer storage offer = _offers[_offerId];

        // Validations
        require(
            offer.owner == msg.sender,
            "only owner can cancel offer"
        );
        require(offer.lender == address(0), "only update unapply offer");

        // Send NFT back to borrower
        _nftSafeTransfer(address(this), msg.sender, offer.collection, offer.tokenId, offer.nftAmount, offer.nftType);

        emit OfferCancelled(_offerId, offer.collection, offer.tokenId);
    }

    //
    // @dev
    // Borrower can know how much they can receive before creating offer
    //
    function quoteFees(uint256 _borrowAmount, address _token, uint256 _lendingPeriod)
        public
        override
        view
        returns (uint256 lenderFee, uint256 serviceFee)
    {
        lenderFee = PawnShopLibrary.getFeeAmount(_borrowAmount, _tokenFeeRates[_token].lenderFeeRate, _lendingPeriod);
        serviceFee = PawnShopLibrary.getFeeAmount(_borrowAmount, _tokenFeeRates[_token].serviceFeeRate, _lendingPeriod);
    }

    // Borrower call this function to estimate how much fees need to paid to extendTimes
    function quoteExtendFees(bytes16 _offerId, uint256 _extendPeriod)
        public
        override
        view
        returns (uint256 lenderFee, uint256 serviceFee)
    {
        Offer memory offer = _offers[_offerId];
        (lenderFee, serviceFee) = quoteFees(offer.borrowAmount, offer.borrowToken, _extendPeriod);
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
        (lenderFee, serviceFee) = quoteFees(offer.borrowAmount, offer.borrowToken, offer.borrowPeriod);
        approvedAmount = offer.borrowAmount.sub(lenderFee);
    }

    // Borrower interest only and extend deadline
    function extendLendingTime(bytes16 _offerId, uint256 _extendPeriod)
        external
        override
        nonReentrant
        onlyBorrowPeriodGreaterThanZero(_extendPeriod)
    {
        Offer storage offer = _offers[_offerId];

        // Validations
        require(offer.owner == msg.sender, "only-owner-can-extend-lending-time");
        require(offer.isLending == true, "can only extend in progress offer");
        require(offer.startLendingAt.add(offer.borrowPeriod) >= block.timestamp, "lending-time-closed");

        // Update fees if has changed
        {
            uint256 lenderFeeRate = _tokenFeeRates[offer.borrowToken].lenderFeeRate;
            uint256 serviceFeeRate = _tokenFeeRates[offer.borrowToken].serviceFeeRate;
            if (lenderFeeRate != offer.lenderFeeRate) offer.lenderFeeRate = lenderFeeRate;
            if (serviceFeeRate != offer.serviceFeeRate) offer.serviceFeeRate = serviceFeeRate;
        }

        // Calculate Fees
        (uint256 lenderFee, uint256 serviceFee) = quoteFees(offer.borrowAmount, offer.borrowToken, _extendPeriod);
        require(lenderFee > 0, "required minimum lender fee");
        require(serviceFee > 0, "required minimum service fee");

        IERC20(offer.borrowToken).transferFrom(msg.sender, offer.lender, lenderFee);
        IERC20(offer.borrowToken).transferFrom(msg.sender, treasury, serviceFee);

        // Update end times
        offer.borrowPeriod = offer.borrowPeriod.add(_extendPeriod);
        offer.liquidationAt = offer.liquidationAt.add(_extendPeriod);

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
        Offer storage offer = _offers[_offerId];

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
