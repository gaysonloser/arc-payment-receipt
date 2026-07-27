import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";

import {
  buildCircleWebhookPolicy,
  buildCircleWebhookReadiness,
  buildCircleWebhookRuntimePolicy,
  createCircleWebhookProcessor,
  verifyCircleWebhookSignature,
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

test("runtime policy remains disabled without all non-secret deployment controls", () => {
  const runtime = buildCircleWebhookRuntimePolicy({ CIRCLE_WEBHOOK_ENABLED: "true" });
  assert.equal(runtime.enabled, false);
  assert.deepEqual(runtime.blockers, ["durable_queue_declared_required", "verification_key_present_required"]);
});

test("processor verifies a signed notification and uses durable idempotency", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const rawBody = Buffer.from(JSON.stringify(notification));
  const signature = sign("sha256", rawBody, privateKey).toString("base64");
  const queued = [];
  const seen = new Set();
  const processor = createCircleWebhookProcessor({
    environment: {
      CIRCLE_WEBHOOK_ENABLED: "true",
      CIRCLE_WEBHOOK_DURABLE_QUEUE: "true",
      CIRCLE_WEBHOOK_PUBLIC_KEY_PEM: publicKey.export({ type: "spki", format: "pem" })
    },
    policy,
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }),
    durableQueue: { enqueue: async (entry) => queued.push(entry) },
    idempotencyStore: {
      has: async (key) => seen.has(key),
      put: async (key) => seen.add(key)
    }
  });

  assert.equal(verifyCircleWebhookSignature(rawBody, signature, publicKey.export({ type: "spki", format: "pem" })), true);
  const first = await processor({ rawBody, payload: notification, headers: { "x-circle-signature": signature } });
  assert.deepEqual(first, { accepted: true, status: 202, duplicate: false, idempotency_key: "circle-event-001" });
  assert.equal(queued.length, 1);
  assert.equal(queued[0].notification_type, "contracts.eventLog");

  const second = await processor({ rawBody, payload: notification, headers: { "x-circle-signature": signature } });
  assert.deepEqual(second, { accepted: true, status: 200, duplicate: true, idempotency_key: "circle-event-001" });
  assert.equal(queued.length, 1);
});

test("processor rejects unsigned traffic before parsing it as a supported event", async () => {
  const processor = createCircleWebhookProcessor({
    environment: {
      CIRCLE_WEBHOOK_ENABLED: "true",
      CIRCLE_WEBHOOK_DURABLE_QUEUE: "true",
      CIRCLE_WEBHOOK_PUBLIC_KEY_PEM: "not-a-real-key"
    },
    policy,
    publicKeyPem: "not-a-real-key",
    durableQueue: { enqueue: async () => assert.fail("must not enqueue") },
    idempotencyStore: { has: async () => false, put: async () => assert.fail("must not store") }
  });
  const result = await processor({ rawBody: Buffer.from("{}"), payload: notification, headers: {} });
  assert.deepEqual(result, { accepted: false, status: 401, error: "invalid_circle_signature" });
});
