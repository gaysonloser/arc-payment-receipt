import assert from "node:assert/strict";
import { test } from "node:test";

import { buildCircleConsoleReceiptPolicy } from "./circle_contract_webhook_gate.mjs";
import {
  buildCircleConsoleReceiptReadinessView,
  createReceiptServer,
  CURRENT_POLICY_CREATED_EVENT,
  CURRENT_POLICY_SETTLEMENT_CONTRACT
} from "./arc_payment_receipt_server.mjs";

const CONTRACT = "0x094f69e6b760c48b6cf23f9af156c4511e8fa1e7";
const EVENT_SIGNATURE = "EvidenceAnchored(bytes32,bytes32,bytes32,bytes32,uint8)";
const EVENT_TOPIC = `0x${"cd".repeat(32)}`;
const EVENT_TX_HASH = `0x${"22".repeat(32)}`;
const EVENT_BLOCK_HASH = `0x${"11".repeat(32)}`;
const EVENT_BLOCK_HEIGHT = 56111686;
const EVENT_LOG_INDEX = 0;
const SUBSCRIPTION = "Subscription_evt_current_release";
const RELEASE_COMMIT = "d".repeat(40);
const NOW = Date.parse("2026-08-10T12:00:00.000Z");
const WEBHOOK_HISTORY_URL = "https://console.circle.com/contracts/current/subscriptions/current/events";
const EVENT_HISTORY_URL = "https://console.circle.com/contracts/current/event-history";

test("current server defaults bind Console evidence to PolicySettlementV1 and the deployed release", () => {
  const server = createReceiptServer({
    environment: { RENDER_GIT_COMMIT: RELEASE_COMMIT }
  });
  server.close();
  const currentPolicy = buildCircleConsoleReceiptPolicy({
    contractAddress: CURRENT_POLICY_SETTLEMENT_CONTRACT,
    eventSignature: CURRENT_POLICY_CREATED_EVENT,
    releaseCommit: RELEASE_COMMIT
  });
  const readiness = buildCircleConsoleReceiptReadinessView(currentPolicy);
  assert.equal(readiness.policy_binding.contract_address, CURRENT_POLICY_SETTLEMENT_CONTRACT);
  assert.equal(readiness.policy_binding.event_signature, CURRENT_POLICY_CREATED_EVENT);
  assert.equal(readiness.policy_binding.release_commit, RELEASE_COMMIT);
  assert.ok(readiness.blockers.includes("subscription_id_missing"));
  assert.ok(readiness.blockers.includes("trusted_readback_loader_not_configured"));
});

function policy() {
  return buildCircleConsoleReceiptPolicy({
    contractAddress: CONTRACT,
    eventSignature: EVENT_SIGNATURE,
    eventTopic: EVENT_TOPIC,
    expectedEventTxHash: EVENT_TX_HASH,
    expectedEventBlockHash: EVENT_BLOCK_HASH,
    expectedEventBlockHeight: EVENT_BLOCK_HEIGHT,
    expectedEventLogIndex: EVENT_LOG_INDEX,
    subscriptionId: SUBSCRIPTION,
    releaseCommit: RELEASE_COMMIT,
    webhookHistoryUrl: WEBHOOK_HISTORY_URL,
    eventHistoryUrl: EVENT_HISTORY_URL,
    requireReadHistory: true,
    now: () => NOW
  });
}

function currentReadback() {
  const currentHistoryBinding = {
    contract_address: CONTRACT,
    chain_id: 5042002,
    blockchain: "ARC-TESTNET",
    event_signature: EVENT_SIGNATURE,
    subscription_id: SUBSCRIPTION,
    release_commit: RELEASE_COMMIT
  };
  return {
    chain_id: 5042002,
    contract_address: CONTRACT,
    event_signature: EVENT_SIGNATURE,
    event_topic: EVENT_TOPIC,
    subscription: { id: SUBSCRIPTION, status: "active" },
    observed_at: new Date(NOW - 60_000).toISOString(),
    source: {
      kind: "circle_console_readback",
      authenticated: true,
      http_status: 200,
      url: `https://console.circle.com/contracts/${CONTRACT}/subscriptions/${SUBSCRIPTION}`,
      object_id: `console:contract:${CONTRACT}:subscription:${SUBSCRIPTION}`
    },
    release_commit: RELEASE_COMMIT,
    webhook_history: {
      kind: "circle_console_webhook_history",
      authenticated: true,
      http_status: 200,
      url: WEBHOOK_HISTORY_URL,
      entries: [{ id: "delivery-1", authenticated: true, received_at: new Date(NOW - 30_000).toISOString(), ...currentHistoryBinding }]
    },
    event_history: {
      kind: "circle_contract_event_history",
      authenticated: true,
      http_status: 200,
      url: EVENT_HISTORY_URL,
      entries: [{
        id: "event-1",
        authenticated: true,
        firstConfirmDate: new Date(NOW - 45_000).toISOString(),
        blockHash: EVENT_BLOCK_HASH,
        blockHeight: EVENT_BLOCK_HEIGHT,
        txHash: EVENT_TX_HASH,
        logIndex: String(EVENT_LOG_INDEX),
        topics: [EVENT_TOPIC],
        data: "0x",
        eventSignatureHash: EVENT_TOPIC,
        ...currentHistoryBinding
      }]
    }
  };
}

test("server production path rejects an injected legacy policy without both read-history sources", async (t) => {
  const legacyPolicy = buildCircleConsoleReceiptPolicy({
    contractAddress: CONTRACT,
    eventSignature: EVENT_SIGNATURE,
    eventTopic: EVENT_TOPIC,
    subscriptionId: SUBSCRIPTION,
    releaseCommit: RELEASE_COMMIT,
    requireReadHistory: false,
    now: () => NOW
  });
  const server = createReceiptServer({
    circleConsoleReceiptPolicy: legacyPolicy,
    loadCircleConsoleReadback: async () => ({ ...currentReadback(), webhook_history: undefined, event_history: undefined })
  });
  const serverBindError = await new Promise((resolve) => {
    server.once("error", resolve);
    server.listen(0, "127.0.0.1", () => resolve(null));
  });
  if (serverBindError) {
    server.close();
    if (serverBindError.code === "EPERM") {
      t.skip(`local loopback bind unavailable: ${serverBindError.code}`);
      return;
    }
    throw serverBindError;
  }
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const readinessResponse = await fetch(`${origin}/api/v1/circle-console-receipt-readiness`);
    const readiness = await readinessResponse.json();
    assert.equal(readiness.status, "not_ready_fail_closed");
    assert.ok(readiness.blockers.includes("webhook_history_source_missing"));
    assert.ok(readiness.blockers.includes("event_history_source_missing"));
    const receiptResponse = await fetch(`${origin}/api/v1/circle-console-receipt`);
    assert.equal(receiptResponse.status, 503);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("Circle Console readiness and receipt routes use only a trusted current server readback", async (t) => {
  const noLoader = buildCircleConsoleReceiptReadinessView(policy());
  assert.equal(noLoader.status, "not_ready_fail_closed");
  assert.ok(noLoader.blockers.includes("trusted_readback_loader_not_configured"));
  assert.equal(noLoader.boundaries.accepts_caller_supplied_receipt, false);

  let readback = currentReadback();
  const server = createReceiptServer({
    circleConsoleReceiptPolicy: policy(),
    loadCircleConsoleReadback: async () => structuredClone(readback)
  });
  const serverBindError = await new Promise((resolve) => {
    server.once("error", resolve);
    server.listen(0, "127.0.0.1", () => resolve(null));
  });
  if (serverBindError) {
    server.close();
    if (serverBindError.code === "EPERM") {
      t.skip(`local loopback bind unavailable: ${serverBindError.code}`);
      return;
    }
    throw serverBindError;
  }
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const readinessResponse = await fetch(`${origin}/api/v1/circle-console-receipt-readiness`);
    assert.equal(readinessResponse.status, 200);
    const readiness = await readinessResponse.json();
    assert.equal(readiness.status, "ready_for_trusted_circle_console_readback");
    assert.deepEqual(readiness.blockers, []);

    const receiptResponse = await fetch(`${origin}/api/v1/circle-console-receipt`);
    assert.equal(receiptResponse.status, 200);
    const receipt = await receiptResponse.json();
    assert.equal(receipt.accepted, true);
    assert.equal(receipt.receipt.release_commit, RELEASE_COMMIT);
    assert.equal(receipt.receipt.source.kind, "circle_console_readback");
    assert.equal(receipt.boundaries.persists_receipt, false);

    readback = { ...currentReadback(), historical: true };
    const historicalResponse = await fetch(`${origin}/api/v1/circle-console-receipt`);
    assert.equal(historicalResponse.status, 422);
    const historical = await historicalResponse.json();
    assert.equal(historical.accepted, false);
    assert.equal(historical.receipt, null);
    assert.ok(historical.errors.includes("historical_source"));

    const head = await fetch(`${origin}/api/v1/circle-console-receipt`, { method: "HEAD" });
    assert.equal(head.status, 422);
    assert.equal(await head.text(), "");

    const post = await fetch(`${origin}/api/v1/circle-console-receipt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(currentReadback())
    });
    assert.equal(post.status, 405);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
