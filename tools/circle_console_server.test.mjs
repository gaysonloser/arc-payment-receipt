import assert from "node:assert/strict";
import { test } from "node:test";

import { buildCircleConsoleReceiptPolicy } from "./circle_contract_webhook_gate.mjs";
import {
  buildCircleConsoleReceiptReadinessView,
  createReceiptServer
} from "./arc_payment_receipt_server.mjs";

const CONTRACT = "0x094f69e6b760c48b6cf23f9af156c4511e8fa1e7";
const EVENT_SIGNATURE = "EvidenceAnchored(bytes32,bytes32,bytes32,bytes32,uint8)";
const EVENT_TOPIC = `0x${"cd".repeat(32)}`;
const SUBSCRIPTION = "Subscription_evt_current_release";
const RELEASE_COMMIT = "d".repeat(40);
const NOW = Date.parse("2026-08-10T12:00:00.000Z");

function policy() {
  return buildCircleConsoleReceiptPolicy({
    contractAddress: CONTRACT,
    eventSignature: EVENT_SIGNATURE,
    eventTopic: EVENT_TOPIC,
    subscriptionId: SUBSCRIPTION,
    releaseCommit: RELEASE_COMMIT,
    now: () => NOW
  });
}

function currentReadback() {
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
    release_commit: RELEASE_COMMIT
  };
}

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
