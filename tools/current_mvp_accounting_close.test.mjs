import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createSettlementCase,
  settlementCaseReducer,
  validateSettlementCloseReadback
} from "../current-mvp/web/settlement-case.mjs";
import { A12_C15_ACCEPTED_SCENARIO_PROJECTION_MATRIX } from "../current-mvp/web/c15-contract.mjs";

const localReadback = (state, id, extra = {}) => ({
  id,
  name: `${id}:${state.caseId}`,
  company: state.companyId,
  source: "typed_local_erp_readback",
  local_fixture_only: true,
  live_erp: false,
  external_actions: 0,
  ...extra
});

const ledgerReady = () => {
  const state = createSettlementCase();
  state.erp.gl = { readback: { balanced: true } };
  state.erp.pled = { status: "OPEN" };
  state.erp.outstanding = { before: "1250000000", after: "0" };
  return state;
};

test("caller-forged periodStatus cannot close an Accounting Period", () => {
  const result = settlementCaseReducer(ledgerReady(), { type: "CLOSE_ACCOUNTING_PERIOD", periodStatus: "ended" });
  assert.equal(result.close.accountingPeriod, "OPEN");
  assert.equal(result.unresolvedReason, "ACCOUNTING_PERIOD_CALLER_STATUS_FORBIDDEN");
});

test("PCV, Accounting Period and business close require three typed readbacks", () => {
  let state = ledgerReady();
  const pcv = localReadback(state, "pcv_operational_close", {
    doctype: "Period Closing Voucher",
    docstatus: 1,
    status: "submitted",
    gl_balanced: true,
    payment_ledger_status: "OPEN",
    outstanding_before6: "1250000000",
    outstanding_after6: "0"
  });
  assert.equal(validateSettlementCloseReadback(pcv, { id: "pcv_operational_close", company: state.companyId, state }).valid, true);
  state = settlementCaseReducer(state, { type: "CLOSE_OPERATIONAL", readback: pcv });
  assert.equal(state.close.operational, "CLOSED");

  const period = localReadback(state, "accounting_period", {
    doctype: "Accounting Period",
    status: "ended",
    start_date: "2026-01-01",
    end_date: "2026-12-31",
    closed_documents: ["Sales Invoice", "Purchase Invoice", "Payment Entry"]
  });
  state = settlementCaseReducer(state, { type: "CLOSE_ACCOUNTING_PERIOD", readback: period });
  assert.equal(state.close.accountingPeriod, "CLOSED");

  const close = localReadback(state, "business_close", {
    status: "CLOSED",
    operational_readback_id: pcv.name,
    accounting_period_readback_id: period.name,
    payment_ledger_status: "OPEN",
    outstanding_after6: "0"
  });
  state = settlementCaseReducer(state, { type: "CLOSE_BUSINESS", readback: close });
  assert.equal(state.close.business, "CLOSED");
  assert.equal(state.close.businessReadback.external_actions, 0);
  assert.equal(state.close.businessReadback.live_erp, false);
});

test("mismatched company or outstanding readback fails closed", () => {
  const state = ledgerReady();
  const forged = localReadback(state, "pcv_operational_close", {
    company: "Other Company",
    doctype: "Period Closing Voucher",
    docstatus: 1,
    status: "submitted",
    gl_balanced: true,
    payment_ledger_status: "OPEN",
    outstanding_before6: "1250000000",
    outstanding_after6: "0"
  });
  const result = settlementCaseReducer(state, { type: "CLOSE_OPERATIONAL", readback: forged });
  assert.equal(result.close.operational, "OPEN");
  assert.equal(result.unresolvedReason, "TYPED_CLOSE_READBACK_REQUIRED:pcv_operational_close");
});

test("refund allocation requires explicit exchange rate and resolved difference", () => {
  for (const scenario of ["payment_refund_incoming", "receipt_refund_outgoing"]) {
    const fields = A12_C15_ACCEPTED_SCENARIO_PROJECTION_MATRIX[scenario].fields;
    assert.equal(fields.some((field) => field.field_id === "exchange_rate" && field.requiredness === "required"), true, scenario);
    assert.equal(fields.some((field) => field.field_id === "difference_amount6" && field.validator === "zero_or_named_company_difference_account"), true, scenario);
  }
  const state = createSettlementCase({ profileId: "receipt_refund" });
  const authority = { role: "operator", operatorId: "local-operator" };
  const missingRate = settlementCaseReducer(state, { type: "SET_ALLOCATION", allocation: { amount6: "250000000", authority, differenceAmount6: "0" } });
  assert.equal(missingRate.unresolvedReason, "REFUND_EXCHANGE_RATE_REQUIRED");
  const unresolvedDifference = settlementCaseReducer(state, { type: "SET_ALLOCATION", allocation: { amount6: "250000000", authority, exchangeRate: "1", differenceAmount6: "50" } });
  assert.equal(unresolvedDifference.unresolvedReason, "REFUND_DIFFERENCE_UNRESOLVED");
  const accepted = settlementCaseReducer(state, { type: "SET_ALLOCATION", allocation: { amount6: "250000000", authority, exchangeRate: "1", differenceAmount6: "0" } });
  assert.equal(accepted.allocation.exchangeRate, "1");
  assert.equal(accepted.allocation.differenceAmount6, "0");
});
