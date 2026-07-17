import test from "node:test";
import assert from "node:assert/strict";

import {
  PAYMENT_TOPIC,
  decodePaymentLog,
  decodeReceiptResult
} from "./arc_payment_receipt_monitor.mjs";

const ORDER_ID = "0xf303bb994a26f19f83d892f9c3fe78e1d1a4577dd09c53f5000a50fd712b9c4e";
const ACCOUNT_WORD = "0000000000000000000000008aaa1fc761a8d7eb03323614f9ff7fb3218b8889";
const AMOUNT_WORD = "000000000000000000000000000000000000000000000000002386f26fc10000";
const METADATA_WORD = "dca5d41a65d6239330a315b3d3fa5b6d969c3c750201c55fac3c7f6d5fa10c46";
const BLOCK_WORD = BigInt(52210442).toString(16).padStart(64, "0");

test("decodes the real P1 PaymentReceived fixture", () => {
  const event = decodePaymentLog({
    topics: [PAYMENT_TOPIC, ORDER_ID, `0x${ACCOUNT_WORD}`, `0x${ACCOUNT_WORD}`],
    data: `0x${AMOUNT_WORD}${METADATA_WORD}`,
    transactionHash: "0x56b64a6a56209b2a82b170c6b1ea6ca5c8114d122488957f91b13cd40c00fdbf",
    blockNumber: "0x31cab0a",
    logIndex: "0x10"
  });

  assert.equal(event.order_id, ORDER_ID);
  assert.equal(event.payer, "0x8aaa1fc761a8d7eb03323614f9ff7fb3218b8889");
  assert.equal(event.merchant, event.payer);
  assert.equal(event.amount_wei, "10000000000000000");
  assert.equal(event.amount_usdc, "0.01");
  assert.equal(event.metadata_hash, `0x${METADATA_WORD}`);
  assert.equal(event.block_number, 52210442);
});

test("decodes the real P1 receipt storage fixture", () => {
  const receipt = decodeReceiptResult(`0x${ACCOUNT_WORD}${AMOUNT_WORD}${METADATA_WORD}${BLOCK_WORD}`);

  assert.equal(receipt.payer, "0x8aaa1fc761a8d7eb03323614f9ff7fb3218b8889");
  assert.equal(receipt.amount_wei, "10000000000000000");
  assert.equal(receipt.amount_usdc, "0.01");
  assert.equal(receipt.metadata_hash, `0x${METADATA_WORD}`);
  assert.equal(receipt.block_number, 52210442);
});
