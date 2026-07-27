import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCircleWebhookPolicy,
  buildCircleWebhookReadiness,
  validateCircleContractNotification
} from "./circle_contract_webhook_gate.mjs";
import { buildCircleWebhookPublicView } from "./arc_payment_receipt_server.mjs";

const policy = buildCircleWebhookPolicy({
  enabled: true,
  durableQueueAvailable: true,
  contractAddress: "0x094f69e6b760c48b6cf23f9af156c4511e8fa1e7"
});

const notification = {
  notificationId: "circle-event-001",
  notificationType: "contracts.eventLog",
  notification: {
    chainId: 5042002,
    contractAddress: "0x094f69e6b760c48b6cf23f9af156c4511e8fa1e7",
    eventSignature: "EvidenceAnchored(bytes32,bytes32,bytes32,bytes32,uint8)",
    txHash: `0x${"ab".repeat(32)}`,
    logIndex: "0"
  }
};

test("accepts only the configured Arc registry event after durable readiness", () => {
  const result = validateCircleContractNotification(notification, policy);
  assert.equal(result.accepted, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.idempotency_key, "circle-event-001");
  assert.match(result.event_fingerprint, /^[0-9a-f]{64}$/);
  assert.equal(result.boundaries.chain_write, false);
});

test("fails closed until a durable queue is explicitly available", () => {
  const readiness = buildCircleWebhookReadiness(buildCircleWebhookPolicy({
    contractAddress: "0x094f69e6b760c48b6cf23f9af156c4511e8fa1e7"
  }));
  assert.equal(readiness.status, "not_ready_fail_closed");
  assert.deepEqual(readiness.blockers, ["receiver_disabled_by_default", "durable_queue_not_configured"]);
});

test("rejects a notification for another chain or event signature", () => {
  const unsafe = structuredClone(notification);
  unsafe.notification.chainId = 8453;
  unsafe.notification.eventSignature = "PaymentReceived(bytes32,address,address,uint256,bytes32)";
  const result = validateCircleContractNotification(unsafe, policy);
  assert.equal(result.accepted, false);
  assert.deepEqual(result.errors, ["unexpected_event_signature", "unexpected_chain_id"]);
});

test("exports a public fail-closed readiness boundary without enabling a receiver", () => {
  const view = buildCircleWebhookPublicView();
  assert.equal(view.status, "not_ready_fail_closed");
  assert.deepEqual(view.blockers, ["receiver_disabled_by_default", "durable_queue_not_configured"]);
  assert.equal(view.guarantees.endpoint_accepts_webhooks, false);
  assert.equal(view.guarantees.circle_subscription_created, false);
  assert.equal(view.guarantees.erp_write, false);
  assert.equal(view.guarantees.wallet_or_chain_action, false);
});
