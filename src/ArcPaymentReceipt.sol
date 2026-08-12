// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ArcPaymentReceipt
/// @notice Minimal native-USDC payment settlement with an onchain receipt index.
/// @dev Arc uses USDC as its native gas and value token. This demo is not production-audited.
contract ArcPaymentReceipt {
    struct Receipt {
        address payer;
        uint256 amount;
        bytes32 metadataHash;
        uint64 blockNumber;
    }

    error InvalidMerchant();
    error ZeroPayment();
    error OrderAlreadyPaid(bytes32 orderId);
    error SettlementFailed(address merchant);

    event PaymentReceived(
        bytes32 indexed orderId,
        address indexed payer,
        address indexed merchant,
        uint256 amount,
        bytes32 metadataHash
    );

    address payable public immutable merchant;
    mapping(bytes32 orderId => Receipt receipt) public receipts;

    constructor(address payable merchant_) {
        if (merchant_ == address(0)) revert InvalidMerchant();
        merchant = merchant_;
    }

    function pay(bytes32 orderId, bytes32 metadataHash) external payable {
        if (msg.value == 0) revert ZeroPayment();
        if (receipts[orderId].payer != address(0)) revert OrderAlreadyPaid(orderId);

        receipts[orderId] = Receipt({
            payer: msg.sender,
            amount: msg.value,
            metadataHash: metadataHash,
            blockNumber: uint64(block.number)
        });

        (bool settled,) = merchant.call{ value: msg.value }("");
        if (!settled) revert SettlementFailed(merchant);

        emit PaymentReceived(orderId, msg.sender, merchant, msg.value, metadataHash);
    }
}
