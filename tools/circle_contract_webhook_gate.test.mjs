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

const KEY_ID = "879dc113-5ca4-4ff7-a6b7-54652083fcf8";

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
  assert.ok(view.blockers.includes("receiver_enabled_required"));
  assert.ok(view.blockers.includes("store_path_required"));
  assert.ok(view.blockers.includes("verification_key_present_required"));
  assert.ok(view.blockers.includes("verification_key_id_required"));
  assert.equal(view.guarantees.endpoint_accepts_webhooks, false);
  assert.equal(view.guarantees.circle_subscription_created, false);
  assert.equal(view.guarantees.erp_write, false);
  assert.equal(view.guarantees.wallet_or_chain_action, false);
});

test("runtime policy remains disabled without all non-secret deployment controls", () => {
  const runtime = buildCircleWebhookRuntimePolicy({ CIRCLE_WEBHOOK_ENABLED: "true" });
  assert.equal(runtime.enabled, false);
  assert.deepEqual(runtime.blockers, ["durable_queue_declared_required", "store_path_required", "verification_key_present_required", "verification_key_id_required"]);
});

test("runtime readiness rejects a present but unparsable public key", () => {
  const runtime = buildCircleWebhookRuntimePolicy({
    CIRCLE_WEBHOOK_ENABLED: "true",
    CIRCLE_WEBHOOK_DURABLE_QUEUE: "true",
    CIRCLE_WEBHOOK_PUBLIC_KEY_PEM: "not-a-valid-public-key",
    CIRCLE_WEBHOOK_PUBLIC_KEY_ID: KEY_ID
  });
  assert.equal(runtime.enabled, false);
  assert.ok(runtime.blockers.includes("verification_key_invalid"));
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
      CIRCLE_WEBHOOK_PUBLIC_KEY_PEM: publicKey.export({ type: "spki", format: "pem" }),
      CIRCLE_WEBHOOK_PUBLIC_KEY_ID: KEY_ID
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
  const first = await processor({ rawBody, payload: notification, headers: { "x-circle-signature": signature, "x-circle-key-id": KEY_ID } });
  assert.deepEqual(first, { accepted: true, status: 202, duplicate: false, idempotency_key: "circle-event-001" });
  assert.equal(queued.length, 1);
  assert.equal(queued[0].notification_type, "contracts.eventLog");

  const second = await processor({ rawBody, payload: notification, headers: { "x-circle-signature": signature, "x-circle-key-id": KEY_ID } });
  assert.deepEqual(second, { accepted: true, status: 200, duplicate: true, idempotency_key: "circle-event-001" });
  assert.equal(queued.length, 1);
});

test("processor rejects unsigned traffic before parsing it as a supported event", async () => {
  const { publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  const processor = createCircleWebhookProcessor({
    environment: {
      CIRCLE_WEBHOOK_ENABLED: "true",
      CIRCLE_WEBHOOK_DURABLE_QUEUE: "true",
      CIRCLE_WEBHOOK_PUBLIC_KEY_PEM: publicKeyPem,
      CIRCLE_WEBHOOK_PUBLIC_KEY_ID: KEY_ID
    },
    policy,
    publicKeyPem,
    durableQueue: { enqueue: async () => assert.fail("must not enqueue") },
    idempotencyStore: { has: async () => false, put: async () => assert.fail("must not store") }
  });
  const result = await processor({ rawBody: Buffer.from("{}"), payload: notification, headers: { "x-circle-key-id": KEY_ID } });
  assert.deepEqual(result, { accepted: false, status: 401, error: "invalid_circle_signature" });
  const malformedBeforeVerification = await processor({ rawBody: Buffer.from("{"), headers: { "x-circle-key-id": KEY_ID } });
  assert.deepEqual(malformedBeforeVerification, { accepted: false, status: 401, error: "invalid_circle_signature" });
});

test("processor rejects missing or mismatched Circle key ids before signature verification", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const rawBody = Buffer.from(JSON.stringify(notification));
  const signature = sign("sha256", rawBody, privateKey).toString("base64");
  const processor = createCircleWebhookProcessor({
    environment: {
      CIRCLE_WEBHOOK_ENABLED: "true",
      CIRCLE_WEBHOOK_DURABLE_QUEUE: "true",
      CIRCLE_WEBHOOK_PUBLIC_KEY_PEM: publicKey.export({ type: "spki", format: "pem" }),
      CIRCLE_WEBHOOK_PUBLIC_KEY_ID: KEY_ID
    },
    policy,
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }),
    durableQueue: { enqueue: async () => assert.fail("must not enqueue") },
    idempotencyStore: { has: async () => false, put: async () => assert.fail("must not store") }
  });
  assert.deepEqual(
    await processor({ rawBody, payload: notification, headers: { "x-circle-signature": signature } }),
    { accepted: false, status: 401, error: "invalid_circle_key_id" }
  );
  assert.deepEqual(
    await processor({ rawBody, payload: notification, headers: { "x-circle-signature": signature, "x-circle-key-id": "11111111-1111-4111-8111-111111111111" } }),
    { accepted: false, status: 401, error: "invalid_circle_key_id" }
  );
});

test("typed current PolicyCreated notifications require Arc Testnet, topic, transaction and log fields", () => {
  const currentPolicy = buildCircleWebhookPolicy({
    enabled: true,
    durableQueueAvailable: true,
    contractAddress: "0xc7682649a1aa60d0f74825ad2b812ee062178047",
    eventSignature: "PolicyCreated(bytes32,address,address,address,uint256,bytes32,bytes32,uint64,uint64)",
    eventTopic: "0x18a40807aa0569234a6f9202ddaab5639334547426c0cb66915bb5e5779b53ec",
    requireTypedEvent: true
  });
  const typed = {
    notificationId: "circle-policy-001",
    notificationType: "contracts.eventLog",
    notification: {
      blockchain: "ARC-TESTNET",
      chainId: 5042002,
      contractAddress: currentPolicy.contractAddress,
      eventName: currentPolicy.eventSignature,
      txHash: `0x${"a".repeat(64)}`,
      blockHash: `0x${"b".repeat(64)}`,
      logIndex: 12,
      topics: [currentPolicy.eventTopic, `0x${"1".repeat(64)}`, `0x${"0".repeat(24)}${"2".repeat(40)}`, `0x${"0".repeat(24)}${"3".repeat(40)}`],
      data: `0x${"0".repeat(384)}`
    }
  };
  assert.equal(validateCircleContractNotification(typed, currentPolicy).accepted, true);
  const wrong = structuredClone(typed);
  wrong.notification.blockchain = "ETH-SEPOLIA";
  wrong.notification.topics[0] = `0x${"f".repeat(64)}`;
  wrong.notification.logIndex = -1;
  assert.deepEqual(validateCircleContractNotification(wrong, currentPolicy).errors, ["unexpected_blockchain", "invalid_log_index", "unexpected_event_topic"]);
  const wrongContract = structuredClone(typed);
  wrongContract.notification.contractAddress = "0x1111111111111111111111111111111111111111";
  assert.ok(validateCircleContractNotification(wrongContract, currentPolicy).errors.includes("unexpected_contract_address"));
  const badData = structuredClone(typed);
  badData.notification.data = "0x00";
  assert.ok(validateCircleContractNotification(badData, currentPolicy).errors.includes("invalid_event_data"));
  const badIndexed = structuredClone(typed);
  badIndexed.notification.topics[2] = `0x${"2".repeat(64)}`;
  assert.ok(validateCircleContractNotification(badIndexed, currentPolicy).errors.includes("invalid_indexed_address_topics"));
  const badReviewerWord = structuredClone(typed);
  badReviewerWord.notification.data = `0x${"2".repeat(64)}${"0".repeat(320)}`;
  assert.ok(validateCircleContractNotification(badReviewerWord, currentPolicy).errors.includes("invalid_reviewer_word"));
});
