import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { createReceiptServer } from "./arc_payment_receipt_server.mjs";

const orderId = `0x${"12".repeat(32)}`;
const report = {
  generated_at: "2026-07-17T04:00:00.000Z",
  contract: "0x05fd366e0f1af3c5dcdcdc88ed8824bbf175e1df",
  range: { to: 52212852 },
  event_count: 1,
  checks: { unique_order_ids: true },
  events: [{ order_id: orderId, transaction_hash: `0x${"34".repeat(32)}` }]
};
const dualReport = {
  status: "aligned_in_overlap_window",
  counts: { rpc_in_overlap_window: 0, circle_in_overlap_window: 0 }
};
const circleReport = {
  subscription_state: "Subscribed",
  webhook_active: false,
  event_history_state: "No emitted events yet"
};

let server;
let origin;

before(async () => {
  server = createReceiptServer({
    loadReport: async () => report,
    loadDualReport: async () => dualReport,
    loadCircleReport: async () => circleReport,
    loadViewer: async () => "<!doctype html><title>viewer</title>",
    loadLogo: async () => Buffer.from("logo"),
    loadFavicon: async () => Buffer.from("favicon")
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("serves a read-only health response", async () => {
  const response = await fetch(`${origin}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "ok",
    mode: "read-only",
    contract: report.contract,
    event_count: 1,
    latest_scanned_block: 52212852,
    dual_source_status: "aligned_in_overlap_window",
    circle_subscription_state: "Subscribed",
    webhook_active: false,
    generated_at: report.generated_at
  });
});

test("returns evidence and exact receipts", async () => {
  const evidence = await fetch(`${origin}/api/evidence`);
  assert.equal(evidence.status, 200);
  assert.equal((await evidence.json()).event_count, 1);

  const receipt = await fetch(`${origin}/api/receipts/${orderId}`);
  assert.equal(receipt.status, 200);
  assert.equal((await receipt.json()).receipt.order_id, orderId);

  const dual = await fetch(`${origin}/api/dual-source`);
  assert.equal(dual.status, 200);
  assert.equal((await dual.json()).status, "aligned_in_overlap_window");

  const circle = await fetch(`${origin}/api/circle-monitor`);
  assert.equal(circle.status, 200);
  assert.equal((await circle.json()).subscription_state, "Subscribed");
});

test("serves the app logo and favicon as immutable PNG assets", async () => {
  const logo = await fetch(`${origin}/assets/payment-receipt-logo.png`);
  assert.equal(logo.status, 200);
  assert.equal(logo.headers.get("content-type"), "image/png");
  assert.equal(logo.headers.get("cache-control"), "public, max-age=86400, immutable");
  assert.equal(Buffer.from(await logo.arrayBuffer()).toString(), "logo");

  const favicon = await fetch(`${origin}/assets/favicon.png`);
  assert.equal(favicon.status, 200);
  assert.equal(favicon.headers.get("content-type"), "image/png");
  assert.equal(Buffer.from(await favicon.arrayBuffer()).toString(), "favicon");
});

test("returns explicit errors without accepting writes", async () => {
  const missing = await fetch(`${origin}/api/receipts/0x${"00".repeat(32)}`);
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error, "receipt_not_found");

  const write = await fetch(`${origin}/api/evidence`, { method: "POST" });
  assert.equal(write.status, 405);
  assert.equal((await write.json()).error, "method_not_allowed");
});
