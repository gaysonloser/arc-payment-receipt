import assert from "node:assert/strict";
import test from "node:test";

import { buildSourceAssuranceExceptionQueue } from "./arc_payment_receipt_server.mjs";

const reconciliation = { status: "cross_system_manufacturing_reconciled", boundaries: { erp_write_exposed: false, wallet_or_chain_action: false } };
const qualityRelease = { source_assurance: { quality_release_registry_circle_monitor: "not_imported_or_subscribed" } };
const webhookReadiness = { blockers: ["receiver_disabled_by_default", "durable_queue_not_configured"], guarantees: { endpoint_accepts_webhooks: false } };

test("shows external source-assurance blockers without attempting remediation", () => {
  const result = buildSourceAssuranceExceptionQueue(reconciliation, qualityRelease, webhookReadiness);
  assert.equal(result.status, "source_assurance_exceptions_visible");
  assert.equal(result.open_exception_count, 3);
  assert.equal(result.boundaries.circle_resource_changed, false);
});

test("fails closed when the underlying chain to ERP reconciliation is absent", () => {
  const result = buildSourceAssuranceExceptionQueue({ ...reconciliation, status: "not_reconciled_fail_closed" }, qualityRelease, webhookReadiness);
  assert.equal(result.status, "not_ready_fail_closed");
  assert.deepEqual(result.failed_checks, ["chain_erp_reconciliation_passed"]);
});
