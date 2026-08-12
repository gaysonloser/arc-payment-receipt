import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createSettlementCase,
  settlementCaseReducer,
  validateSettlementCloseReadback
} from "../current-mvp/web/settlement-case.mjs";
import {
  A12_C15_ACCEPTED_SCENARIO_PROJECTION_MATRIX,
  A12_C15_ACCOUNTING_CLASSIFICATION_IDS,
  A12_C15_ACCOUNTING_PRESET_SCHEMA,
  buildA12C15AccountingJournalPreview
} from "../current-mvp/web/c15-contract.mjs";

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
  const missingRate = settlementCaseReducer(state, { type: "SET_ALLOCATION", allocation: { amount6: "250000000", authority, originalPrincipalAmount6: "250000000", priorRefundedAmount6: "0", differenceAmount6: "0" } });
  assert.equal(missingRate.unresolvedReason, "REFUND_EXCHANGE_RATE_REQUIRED");
  const unresolvedDifference = settlementCaseReducer(state, { type: "SET_ALLOCATION", allocation: { amount6: "250000000", authority, originalPrincipalAmount6: "250000000", priorRefundedAmount6: "0", exchangeRate: "1", differenceAmount6: "50" } });
  assert.equal(unresolvedDifference.unresolvedReason, "REFUND_DIFFERENCE_UNRESOLVED");
  const accepted = settlementCaseReducer(state, { type: "SET_ALLOCATION", allocation: { amount6: "250000000", authority, originalPrincipalAmount6: "250000000", priorRefundedAmount6: "0", exchangeRate: "1", differenceAmount6: "0" } });
  assert.equal(accepted.allocation.exchangeRate, "1");
  assert.equal(accepted.allocation.differenceAmount6, "0");
  const arithmeticMismatch = settlementCaseReducer(state, { type: "SET_ALLOCATION", allocation: { amount6: "250000000", authority, originalPrincipalAmount6: "250000000", priorRefundedAmount6: "0", exchangeRate: "1.1", differenceAmount6: "0" } });
  assert.equal(arithmeticMismatch.unresolvedReason, "REFUND_ARITHMETIC_MISMATCH");
});

test("ledger generation requires a separate typed GL/PLED readback", () => {
  const state = createSettlementCase();
  state.erp.submitGate = "OWNER_REVIEW_REQUIRED";
  state.erp.reconciliation = { status: "Reconciled" };
  state.erp.gl = { rows: [], totals: { balanced: true } };
  const missing = settlementCaseReducer(state, { type: "GENERATE_LEDGER" });
  assert.equal(missing.unresolvedReason, "LEDGER_INDEPENDENT_READBACK_REQUIRED");
  const accepted = settlementCaseReducer(state, { type: "GENERATE_LEDGER", readback: { source: "typed_local_erp_readback", local_fixture_only: true, live_erp: false, external_actions: 0, company: state.companyId, gl_balanced: true, payment_ledger_status: "OPEN" } });
  assert.equal(accepted.erp.gl.status, "Readback verified");
});

const typedAccountingFixtures = {
  payment_advance: {
    preset: "payment_advance",
    amount6: "1250000000",
    counterparty: { type: "Supplier", id: "supplier-1" },
    document: { type: "Purchase Order", id: "PO-2026-0731", counterpartyType: "Supplier" }
  },
  payment_corporate_payable: {
    preset: "payment_corporate_payable",
    amount6: "1250000000",
    counterparty: { type: "Supplier", id: "supplier-1" },
    document: { type: "Purchase Invoice", id: "PINV-2026-044", counterpartyType: "Supplier" }
  },
  payment_personal_payable: {
    preset: "payment_personal_payable",
    amount6: "250000000",
    counterparty: { type: "Employee", id: "employee-1" },
    document: { type: "Expense Claim", id: "EEXP-2026-019", counterpartyType: "Employee" }
  },
  payment_refund: {
    preset: "payment_refund",
    amount6: "250000000",
    counterparty: { type: "Supplier", id: "supplier-1" },
    originalDocument: { type: "Payment Entry", id: "PAY-AP-2026-1187", counterpartyType: "Supplier" },
    originalPrincipalAmount6: "750000000",
    refundedToDateAmount6: "250000000"
  },
  receipt_invoice_collection: {
    preset: "receipt",
    purpose: "invoice_collection",
    amount6: "1250000000",
    counterparty: { type: "Customer", id: "customer-1" },
    document: { type: "Sales Invoice", id: "SINV-2026-072", counterpartyType: "Customer" }
  },
  receipt_customer_advance: {
    preset: "receipt",
    purpose: "customer_advance",
    amount6: "500000000",
    counterparty: { type: "Customer", id: "customer-1" },
    advancePurpose: "Deposit for the next milestone"
  },
  receipt_refund: {
    preset: "receipt_refund",
    amount6: "250000000",
    counterparty: { type: "Customer", id: "customer-1" },
    originalDocument: { type: "Customer Receipt", id: "RCPT-2026-072", counterpartyType: "Customer" },
    originalPrincipalAmount6: "600000000",
    refundedToDateAmount6: "100000000"
  }
};

test("A12 C15 typed accounting schema covers six presets and seven classifications", () => {
  assert.deepEqual(A12_C15_ACCOUNTING_PRESET_SCHEMA.accounting_preset_ids, [
    "payment_advance",
    "payment_corporate_payable",
    "payment_personal_payable",
    "payment_refund",
    "receipt",
    "receipt_refund"
  ]);
  assert.deepEqual(A12_C15_ACCOUNTING_CLASSIFICATION_IDS, [
    "payment_advance",
    "payment_corporate_payable",
    "payment_personal_payable",
    "payment_refund",
    "receipt_invoice_collection",
    "receipt_customer_advance",
    "receipt_refund"
  ]);
  for (const presetId of A12_C15_ACCOUNTING_PRESET_SCHEMA.accounting_preset_ids) {
    const preset = A12_C15_ACCOUNTING_PRESET_SCHEMA.presets[presetId];
    assert.ok(preset.document_label, `${presetId} document label`);
    assert.ok(preset.open_item_effect, `${presetId} open item effect`);
    assert.ok(preset.reconciliation_state, `${presetId} reconciliation state`);
    assert.ok(preset.exception_semantics.fail_closed.length > 0, `${presetId} exception semantics`);
    assert.ok(preset.reversal_semantics, `${presetId} reversal semantics`);
    assert.equal(preset.journal.line_schema.amount_type, "amount6");
    assert.deepEqual(preset.journal.line_schema.direction_enum, ["Dr", "Cr"]);
    for (const field of preset.required_fields) {
      assert.equal(typeof field.field_id, "string");
      assert.equal(typeof field.type, "string");
      assert.equal(field.requiredness, "required");
    }
  }
});

test("each A12 C15 accounting classification renders a balanced Dr/Cr preview", () => {
  const cases = [
    ["payment_advance", typedAccountingFixtures.payment_advance],
    ["payment_corporate_payable", typedAccountingFixtures.payment_corporate_payable],
    ["payment_personal_payable", typedAccountingFixtures.payment_personal_payable],
    ["payment_refund", typedAccountingFixtures.payment_refund],
    ["receipt", typedAccountingFixtures.receipt_invoice_collection],
    ["receipt", typedAccountingFixtures.receipt_customer_advance],
    ["receipt_refund", typedAccountingFixtures.receipt_refund]
  ];
  assert.equal(cases.length, A12_C15_ACCOUNTING_CLASSIFICATION_IDS.length);
  for (const [preset, input] of cases) {
    const result = buildA12C15AccountingJournalPreview({ preset, ...input });
    assert.equal(result.ok, true, `${preset}:${input.purpose ?? "default"} should be renderable`);
    assert.equal(result.journal_preview.renderable, true);
    assert.equal(result.journal_preview.balanced, true);
    assert.equal(result.journal_preview.debit_total6, result.journal_preview.credit_total6);
    assert.equal(result.journal_preview.lines.length, 2);
    assert.deepEqual(result.journal_preview.lines.map((line) => line.direction), ["Dr", "Cr"]);
    assert.ok(result.document_label);
  }
});

test("customer receipt purpose is explicit for invoice collection versus customer advance", () => {
  const invoice = buildA12C15AccountingJournalPreview(typedAccountingFixtures.receipt_invoice_collection);
  const advance = buildA12C15AccountingJournalPreview(typedAccountingFixtures.receipt_customer_advance);
  assert.equal(invoice.ok, true);
  assert.equal(invoice.classification_id, "receipt_invoice_collection");
  assert.equal(invoice.open_item_effect, "CLOSE_MATCHED_CUSTOMER_AR_ONLY");
  assert.equal(advance.ok, true);
  assert.equal(advance.classification_id, "receipt_customer_advance");
  assert.equal(advance.open_item_effect, "CREATE_CUSTOMER_ADVANCE_OPEN_ITEM");
  assert.notEqual(invoice.journal_preview.lines[1].account, advance.journal_preview.lines[1].account);
  const missingPurpose = buildA12C15AccountingJournalPreview({ preset: "receipt", amount6: "1", counterparty: { type: "Customer", id: "customer-1" } });
  assert.equal(missingPurpose.error_code, "PURPOSE_REQUIRED");
});

test("refunds require an original document and stay within the remaining ceiling", () => {
  const missingOriginal = buildA12C15AccountingJournalPreview({
    preset: "receipt_refund",
    amount6: "250000000",
    counterparty: { type: "Customer", id: "customer-1" },
    originalPrincipalAmount6: "600000000",
    refundedToDateAmount6: "100000000"
  });
  assert.equal(missingOriginal.ok, false);
  assert.equal(missingOriginal.error_code, "ORIGINAL_DOCUMENT_REQUIRED");

  const overLimit = buildA12C15AccountingJournalPreview({
    ...typedAccountingFixtures.receipt_refund,
    amount6: "500000001"
  });
  assert.equal(overLimit.ok, false);
  assert.equal(overLimit.error_code, "REFUND_EXCEEDS_REMAINING_CEILING");
  assert.equal(overLimit.fail_closed, true);
});

test("counterparty and document incompatibility fails closed", () => {
  const result = buildA12C15AccountingJournalPreview({
    preset: "payment_corporate_payable",
    amount6: "1000000",
    counterparty: { type: "Customer", id: "customer-1" },
    document: { type: "Purchase Invoice", id: "PINV-2026-044", counterpartyType: "Supplier" }
  });
  assert.equal(result.ok, false);
  assert.equal(result.error_code, "COUNTERPARTY_DOCUMENT_INCOMPATIBLE");
  assert.equal(result.journal_preview, null);
});

test("journal preview exposes equal Dr and Cr totals without ERP mutation", () => {
  const result = buildA12C15AccountingJournalPreview(typedAccountingFixtures.payment_corporate_payable);
  assert.equal(result.ok, true);
  assert.equal(result.journal_preview.debit_total6, "1250000000");
  assert.equal(result.journal_preview.credit_total6, "1250000000");
  assert.equal(result.journal_preview.balanced, true);
  assert.equal(result.journal_preview.lines.every((line) => line.amount6 === "1250000000"), true);
});
