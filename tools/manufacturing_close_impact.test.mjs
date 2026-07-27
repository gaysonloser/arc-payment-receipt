import assert from "node:assert/strict";
import test from "node:test";

import { buildManufacturingCloseImpactView } from "./arc_payment_receipt_server.mjs";

const reconciliation = {
  status: "cross_system_manufacturing_reconciled",
  chain: { terminal_state: "MANUFACTURE_COMPLETED" },
  erp: { quality_inspection_submitted: true, manufacture_submitted: true }
};

const progress = {
  erp: {
    inventory: {
      finished_goods_qty: "25.000",
      finished_goods_valuation_rate: "20.00",
      finished_goods_stock_value: "500.00",
      stock_ledger_entry_count: 5,
      stock_account_treatment: { same_stock_account: true, net_gl_entries: 0, explanation: "ERP valuation remains authoritative." }
    }
  },
  boundaries: { erp_is_inventory_cost_authority: true, new_business_documents: 0 }
};

test("builds a read-only close impact from reconciled manufacturing evidence", () => {
  const result = buildManufacturingCloseImpactView(reconciliation, progress);
  assert.equal(result.status, "close_impact_read_only_reconciled");
  assert.deepEqual(result.failed_checks, []);
  assert.equal(result.boundaries.erp_period_closed, false);
  assert.equal(result.close_impact.ledger_treatment.net_gl_entries, 0);
});

test("fails closed when stock-account treatment is not proven", () => {
  const broken = structuredClone(progress);
  broken.erp.inventory.stock_account_treatment.same_stock_account = false;
  const result = buildManufacturingCloseImpactView(reconciliation, broken);
  assert.equal(result.status, "not_ready_fail_closed");
  assert.deepEqual(result.failed_checks, ["stock_account_treatment_confirmed"]);
});
