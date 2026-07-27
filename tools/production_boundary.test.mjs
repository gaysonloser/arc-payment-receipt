import assert from "node:assert/strict";
import test from "node:test";

import { buildProductionBoundaryView } from "./arc_payment_receipt_server.mjs";

const wallet = { boundaries: { wallet_executor_exposed: false } };
const appKit = { product_boundary: { custom_pay_calldata_supported: false, app_kit_enabled_in_runtime: false } };
const exceptions = { open_exception_count: 3, boundaries: { auto_remediation: false, erp_write_exposed: false } };

test("enforces a default-deny production boundary", () => {
  const result = buildProductionBoundaryView(wallet, appKit, exceptions);
  assert.equal(result.status, "production_boundary_enforced");
  assert.equal(result.blocked_actions.length, 6);
  assert.equal(result.boundaries.wallet_or_chain_action, false);
});

test("fails closed if a signer becomes exposed", () => {
  const result = buildProductionBoundaryView({ boundaries: { wallet_executor_exposed: true } }, appKit, exceptions);
  assert.equal(result.status, "not_ready_fail_closed");
  assert.deepEqual(result.failed_checks, ["wallet_executor_not_exposed"]);
});
