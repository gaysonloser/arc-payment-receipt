// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { ArcPaymentReceipt } from "../src/ArcPaymentReceipt.sol";

interface Vm {
    function deal(address account, uint256 newBalance) external;
    function expectRevert(bytes calldata revertData) external;
    function prank(address msgSender) external;
}

contract RevertingMerchant {
    receive() external payable {
        revert("reject payment");
    }
}

contract ArcPaymentReceiptTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address payable private constant MERCHANT = payable(address(0xBEEF));
    address private constant PAYER = address(0xA11CE);
    bytes32 private constant ORDER_ID = keccak256("arc-order-001");
    bytes32 private constant METADATA_HASH = keccak256("purpose=arc-payment-demo;v=1");

    ArcPaymentReceipt private receipt;

    function setUp() public {
        receipt = new ArcPaymentReceipt(MERCHANT);
        vm.deal(PAYER, 10 ether);
    }

    function testPayForwardsNativeUsdcAndStoresReceipt() public {
        uint256 amount = 0.01 ether;
        uint256 merchantBefore = MERCHANT.balance;

        vm.prank(PAYER);
        receipt.pay{ value: amount }(ORDER_ID, METADATA_HASH);

        (address payer, uint256 storedAmount, bytes32 metadataHash, uint64 blockNumber) =
            receipt.receipts(ORDER_ID);

        require(payer == PAYER, "payer mismatch");
        require(storedAmount == amount, "amount mismatch");
        require(metadataHash == METADATA_HASH, "metadata mismatch");
        require(blockNumber == block.number, "block mismatch");
        require(MERCHANT.balance == merchantBefore + amount, "merchant not paid");
        require(address(receipt).balance == 0, "contract retained funds");
    }

    function testDuplicateOrderRevertsWithoutMovingFunds() public {
        uint256 amount = 0.01 ether;

        vm.prank(PAYER);
        receipt.pay{ value: amount }(ORDER_ID, METADATA_HASH);
        uint256 merchantAfterFirstPayment = MERCHANT.balance;

        vm.expectRevert(
            abi.encodeWithSelector(ArcPaymentReceipt.OrderAlreadyPaid.selector, ORDER_ID)
        );
        vm.prank(PAYER);
        receipt.pay{ value: amount }(ORDER_ID, METADATA_HASH);

        require(MERCHANT.balance == merchantAfterFirstPayment, "duplicate moved funds");
    }

    function testZeroPaymentReverts() public {
        vm.expectRevert(abi.encodeWithSelector(ArcPaymentReceipt.ZeroPayment.selector));
        vm.prank(PAYER);
        receipt.pay(ORDER_ID, METADATA_HASH);
    }

    function testSettlementFailureRollsBackReceipt() public {
        RevertingMerchant rejectingMerchant = new RevertingMerchant();
        ArcPaymentReceipt rejectingReceipt =
            new ArcPaymentReceipt(payable(address(rejectingMerchant)));

        vm.expectRevert(
            abi.encodeWithSelector(
                ArcPaymentReceipt.SettlementFailed.selector, address(rejectingMerchant)
            )
        );
        vm.prank(PAYER);
        rejectingReceipt.pay{ value: 0.01 ether }(ORDER_ID, METADATA_HASH);

        (address payer,,,) = rejectingReceipt.receipts(ORDER_ID);
        require(payer == address(0), "failed payment left receipt");
        require(address(rejectingReceipt).balance == 0, "failed payment retained funds");
    }

    function testZeroMerchantReverts() public {
        vm.expectRevert(abi.encodeWithSelector(ArcPaymentReceipt.InvalidMerchant.selector));
        new ArcPaymentReceipt(payable(address(0)));
    }
}
