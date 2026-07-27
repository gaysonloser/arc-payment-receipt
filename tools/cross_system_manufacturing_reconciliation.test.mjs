import assert from "node:assert/strict";
import test from "node:test";

import { buildCrossSystemManufacturingReconciliation } from "./arc_payment_receipt_server.mjs";

const qualityHold = {
  chain_anchor: { network: "Arc Testnet", chain_id: 5042002, contract_address: "0xCBB00cb7541605A4E2E07B6000302Ee5445193dc" },
  controls: { erp_is_inventory_cost_authority: true, inventory_tokenization_claimed: false }
};

const progress = {
  network: "Arc Testnet",
  chain_id: 5042002,
  chain: {
    current_state: "MANUFACTURE_COMPLETED",
    predecessor_state: "QUALITY_RELEASE",
    predecessor_registry: "0xCBB00cb7541605A4E2E07B6000302Ee5445193dc",
    registry: "0x094f69e6b760c48b6cf23f9af156c4511e8fa1e7",
    transaction_hash: `0x${"ab".repeat(32)}`,
    quality_release_anchored: true,
    manufacture_completion_anchored: true
  },
  erp: {
    quality_inspection: { docstatus: 1, status: "Accepted" },
    manufacture: { docstatus: 1 },
    inventory: { wip_qty: "0.000", finished_goods_qty: "25.000", finished_goods_valuation_rate: "20.00", finished_goods_stock_value: "500.00", stock_ledger_entry_count: 5 }
  },
  boundaries: { new_business_documents: 0, erp_is_inventory_cost_authority: true, inventory_tokenization_claimed: false }
};

test("reconciles the linked Arc quality hold and ERP manufacture facts", () => {
  const result = buildCrossSystemManufacturingReconciliation(qualityHold, progress);
  assert.equal(result.status, "cross_system_manufacturing_reconciled");
  assert.deepEqual(result.failed_checks, []);
  assert.equal(result.boundaries.wallet_or_chain_action, false);
});

test("fails closed when the terminal chain predecessor is not the quality hold registry", () => {
  const broken = structuredClone(progress);
  broken.chain.predecessor_registry = "0x0000000000000000000000000000000000000000";
  const result = buildCrossSystemManufacturingReconciliation(qualityHold, broken);
  assert.equal(result.status, "not_reconciled_fail_closed");
  assert.deepEqual(result.failed_checks, ["quality_hold_predecessor_matches"]);
});
