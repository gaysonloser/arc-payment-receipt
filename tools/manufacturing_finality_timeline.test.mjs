import assert from "node:assert/strict";
import test from "node:test";

import { buildManufacturingFinalityTimeline } from "./arc_payment_receipt_server.mjs";

const qualityHold = { chain_anchor: { transaction_hash: `0x${"01".repeat(32)}`, contract_address: "0x1111111111111111111111111111111111111111", block_number: 1 } };
const progress = { chain: { current_state: "MANUFACTURE_COMPLETED", predecessor_state: "QUALITY_RELEASE", predecessor_registry: "0x1111111111111111111111111111111111111111", registry: "0x2222222222222222222222222222222222222222", transaction_hash: `0x${"02".repeat(32)}`, block_number: 2, quality_release_anchored: true, manufacture_completion_anchored: true }, erp: { quality_inspection: { docstatus: 1 }, manufacture: { docstatus: 1 }, inventory: { stock_ledger_entry_count: 5 } }, boundaries: { erp_is_inventory_cost_authority: true } };
const reconciliation = { status: "cross_system_manufacturing_reconciled" };

test("builds an ordered finality timeline without inventing a release transaction", () => {
  const result = buildManufacturingFinalityTimeline(qualityHold, progress, reconciliation);
  assert.equal(result.status, "manufacturing_finality_timeline_reconciled");
  assert.equal(result.timeline[1].transaction_hash, null);
  assert.equal(result.boundaries.wallet_or_chain_action, false);
});

test("fails closed when the terminal state transition is missing", () => {
  const broken = structuredClone(progress);
  broken.chain.predecessor_state = "QUALITY_HOLD";
  const result = buildManufacturingFinalityTimeline(qualityHold, broken, reconciliation);
  assert.equal(result.status, "not_ready_fail_closed");
  assert.deepEqual(result.failed_checks, ["state_transition_bound"]);
});
