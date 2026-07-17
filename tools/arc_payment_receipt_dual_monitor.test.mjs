import assert from "node:assert/strict";
import test from "node:test";

import { buildDualSourceReport } from "./arc_payment_receipt_dual_monitor.mjs";

const baseEvent = {
  transaction_hash: "0xabc",
  log_index: 1,
  timestamp: "2026-07-17T03:59:50.000Z"
};

const rpc = {
  contract: "0x05fd366E0F1Af3C5DCDCdC88ED8824bbf175E1Df",
  range: { from: 1, to: 2 },
  checks: { unique: true, storage: true },
  events: [baseEvent]
};

const circle = {
  generated_at: "2026-07-17T05:54:12Z",
  monitor_created_at: "2026-07-17T05:32:25Z",
  contract_address: rpc.contract.toLowerCase(),
  event_signature: "PaymentReceived(bytes32,address,address,uint256,bytes32)",
  subscription_state: "Subscribed",
  event_logs: [],
  webhook_active: false
};

test("aligns an empty overlap window while preserving the pre-monitor event", () => {
  const report = buildDualSourceReport(rpc, circle);
  assert.equal(report.status, "aligned_in_overlap_window");
  assert.equal(report.counts.rpc_total, 1);
  assert.equal(report.counts.rpc_before_circle_monitor, 1);
  assert.equal(report.counts.rpc_in_overlap_window, 0);
  assert.equal(report.notification_boundary.mode, "manual_history_read_only");
});

test("flags a new RPC event missing from Circle history", () => {
  const changedRpc = {
    ...rpc,
    events: [...rpc.events, { ...baseEvent, transaction_hash: "0xdef", timestamp: "2026-07-17T06:00:00Z" }]
  };
  const report = buildDualSourceReport(changedRpc, circle);
  assert.equal(report.status, "review_required");
  assert.equal(report.unmatched.rpc.length, 1);
  assert.equal(report.checks.overlap_event_counts_match, false);
});
