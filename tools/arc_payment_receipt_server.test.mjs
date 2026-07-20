import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import {
  buildAccountingPreviewView,
  buildEnterpriseControlView,
  buildEnterpriseEnvelopeView,
  buildEnterpriseSettlementView,
  buildSettlementEvidenceManifest,
  buildSettlementLedgerView,
  createReceiptServer,
  verifySettlementEvidenceManifest
} from "./arc_payment_receipt_server.mjs";

const orderId = `0x${"12".repeat(32)}`;
const report = {
  generated_at: "2026-07-17T04:00:00.000Z",
  contract: "0x05fd366e0f1af3c5dcdcdc88ed8824bbf175e1df",
  range: { to: 52212852 },
  event_count: 2,
  checks: { unique_order_ids: true },
  events: [
    {
      order_id: `0x${"11".repeat(32)}`,
      transaction_hash: `0x${"33".repeat(32)}`,
      block_number: 52210442,
      timestamp: "2026-07-17T03:59:50.000Z",
      payer: "0x8aaa1fc761a8d7eb03323614f9ff7fb3218b8889",
      merchant: "0x8aaa1fc761a8d7eb03323614f9ff7fb3218b8889",
      amount_usdc: "0.01",
      transaction_status: 1,
      storage_matches_event: true
    },
    {
      order_id: orderId,
      transaction_hash: `0x${"34".repeat(32)}`,
      block_number: 52740216,
      timestamp: "2026-07-20T07:19:50.000Z",
      payer: "0x63cdbf1918133716c67b28390f5c5d9250b113da",
      merchant: "0x8aaa1fc761a8d7eb03323614f9ff7fb3218b8889",
      amount_usdc: "0.01",
      transaction_status: 1,
      storage_matches_event: true
    }
  ]
};
const dualReport = {
  status: "aligned_in_overlap_window",
  coverage: { circle_monitor_created_at: "2026-07-17T05:32:25.461447Z" },
  counts: { rpc_in_overlap_window: 1, circle_in_overlap_window: 1 },
  unmatched: { rpc: [], circle: [] }
};
const circleReport = {
  subscription_state: "Subscribed",
  webhook_active: false,
  event_history_state: "No emitted events yet"
};
const enterpriseReport = {
  generated_at: "2026-07-20T11:32:28.246Z",
  fact: {
    network: "Arc Testnet",
    chain_id: 5042002,
    contract: "0x05fd366e0f1af3c5dcdcdc88ed8824bbf175e1df",
    log_index: 26,
    block_number: 52740216,
    amount_display: "0.01",
    protocol_finality: { basis: "included_in_committed_arc_block" },
    source_integrity: {
      transaction_succeeded: true,
      storage_matches_event: true,
      contract_balance_zero: true
    }
  },
  settlement_event_candidate: {
    strategy_id: "ONCHAIN_ENTERPRISE_FINANCE_STACK_V1",
    workflow_id: "PAYMENT_TO_LEDGER_V1",
    schema_version: "0.1-candidate",
    schema_status: "candidate_blocked_pending_owner_contract",
    canonical_compliance_claim: false,
    settlement_event: {
      integration_event_id: `arc:5042002:0x${"34".repeat(32)}:26`,
      tx_hash: `0x${"34".repeat(32)}`,
      finality_status: "finalized",
      asset: "ARC_TESTNET_NATIVE_USDC",
      payer: "0x63cdbf1918133716c67b28390f5c5d9250b113da",
      payee: "0x8aaa1fc761a8d7eb03323614f9ff7fb3218b8889",
      receipt_id: orderId
    },
    event_envelope_candidate: {
      event_id: `arc:5042002:0x${"34".repeat(32)}:26`,
      event_type: "settlement.observed",
      schema_version: "0.1-candidate",
      occurred_at: "2026-07-20T07:19:50.000Z",
      entity_ref: null,
      business_unit_ref: null,
      source_system: "ArcPaymentReceipt",
      business_reference_hash: null,
      source_document_type: null,
      source_document_ref: null,
      metadata_binding: { binding_status: "unbound_opaque_hash" },
      evidence_mode: "circle_event_monitor_plus_arc_rpc_and_storage",
      evidence_id: `5042002:0x${"34".repeat(32)}:26`,
      source_fingerprint: "0b1da29fc0a20bc2663dfccd1632924bf6958d51bb086e5d239a29c0590729f1",
      privacy_classification: "synthetic_test_data",
      workflow_status: "matched_candidate",
      reason_code: "OK",
      idempotency_key: orderId,
      accounting_status: "proposal_created_local_dry_run",
      kingdee_object_type: null,
      draft_id: null,
      readback_status: "not_executed",
      policy_status: "test_only_non_posting",
      human_review_required: true,
      postable: false,
      exception_status: "none"
    },
    controls: {
      source_controls_pass: true,
      source_assurance_checks: { rpc_payload_verified: true, circle_event_payload_matches: true },
      source_assurance_failed_checks: [],
      accounting_recognition_claim: false
    }
  },
  source_assurance: {
    overlap_status: "aligned_in_overlap_window",
    overlap_rpc_events: 1,
    overlap_circle_events: 1
  },
  reconciliation: {
    status: "matched",
    reason_code: "OK",
    business_reference: "ARC-ERP-P2-0001",
    human_review_required: true
  },
  erp_drafts: {
    status: "draft_only",
    postable: false,
    human_review_required: true,
    accounting_policy: {
      mode: "test_only_non_posting",
      settlement_asset: "ARC_TESTNET_NATIVE_USDC",
      ledger_currency: "USD",
      conversion_method: "unit_parity_schema_preview",
      scope: "schema_preview_only"
    },
    receipt: {
      execution_mode: "dry_run",
      schema_status: "candidate_unvalidated_until_jingdouyun_sandbox",
      payload: {
        originNo: "ARC-5042002-34-26",
        entries: [{ billNo: "SO-ARC-P2-0001", billType: "sales_order_demo", nowCheck: "0.01" }]
      }
    },
    voucher: {
      execution_mode: "dry_run",
      schema_status: "candidate_unvalidated_until_jingdouyun_sandbox",
      payload: {
        linkId: `arc:5042002:0x${"34".repeat(32)}:26`,
        date: "2026-07-20",
        currency: "USD",
        summary: "Arc testnet settlement ARC-ERP-P2-0001",
        lines: [
          { accountCode: "1002", direction: "debit", amount: "0.01", customerCode: null },
          { accountCode: "1122", direction: "credit", amount: "0.01", customerCode: "TEST-PAYER-63CD" }
        ]
      }
    },
    controls: {
      debit_credit_balanced: true,
      no_approval_or_period_close_call: true,
      reconciliation_binding_pass: true,
      reconciliation_binding_checks: { order_id_matches_fact: true, human_review_required: true }
    }
  },
  unresolved_contract_fields: [
    { field: "amount_minor" },
    { field: "fees_minor" },
    { field: "business_reference_hash" },
    { field: "entity_ref_and_business_unit_ref" },
    { field: "source_document_type_and_ref" },
    { field: "kingdee_object_type" }
  ],
  control_boundary: { synthetic_data_only: true },
  summary: { erp_api_calls_executed: 0, wallet_actions: 0, chain_writes: 0 },
  scenarios: [
    {
      name: "matched",
      result: {
        status: "matched",
        reason_code: "OK",
        business_reference: "ARC-ERP-P2-0001",
        difference_minor: 0,
        human_review_required: true,
        erp_draft_allowed: true
      }
    },
    {
      name: "duplicate_event",
      result: {
        status: "exception",
        reason_code: "DUPLICATE_EVENT",
        business_reference: null,
        difference_minor: 0,
        human_review_required: true,
        erp_draft_allowed: false
      }
    },
    {
      name: "amount_mismatch",
      result: {
        status: "exception",
        reason_code: "AMOUNT_MISMATCH",
        business_reference: "ARC-ERP-P2-0001",
        difference_minor: -1,
        human_review_required: true,
        erp_draft_allowed: false
      }
    }
  ]
};

let server;
let origin;

before(async () => {
  server = createReceiptServer({
    loadReport: async () => report,
    loadDualReport: async () => dualReport,
    loadCircleReport: async () => circleReport,
    loadEnterpriseReport: async () => enterpriseReport,
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
    event_count: 2,
    latest_scanned_block: 52212852,
    dual_source_status: "aligned_in_overlap_window",
    circle_subscription_state: "Subscribed",
    webhook_active: false,
    enterprise_workflow_status: "matched",
    erp_postable: false,
    accounting_balanced: true,
    accounting_unresolved_fields: 6,
    enterprise_envelope_mapped_fields: 19,
    enterprise_envelope_required_fields: 26,
    enterprise_envelope_review_groups: 3,
    evidence_manifest_digest: buildSettlementEvidenceManifest(enterpriseReport).integrity.digest,
    generated_at: report.generated_at
  });
});

test("returns a curated enterprise settlement without exposing raw ERP payloads", async () => {
  const response = await fetch(`${origin}/api/enterprise-settlement`);
  assert.equal(response.status, 200);
  const settlement = await response.json();
  assert.equal(settlement.order_id, orderId);
  assert.equal(settlement.source_assurance.status, "passed");
  assert.equal(settlement.reconciliation.business_reference, "ARC-ERP-P2-0001");
  assert.equal(settlement.erp_candidate.status, "draft_only");
  assert.equal(settlement.erp_candidate.postable, false);
  assert.equal(settlement.boundaries.erp_api_calls_executed, 0);
  assert.equal("payload" in settlement.erp_candidate, false);

  const exact = await fetch(`${origin}/api/enterprise-settlements/${orderId}`);
  assert.equal(exact.status, 200);
  assert.equal((await exact.json()).settlement.finality_status, "finalized");

  const missing = await fetch(`${origin}/api/enterprise-settlements/0x${"00".repeat(32)}`);
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error, "enterprise_settlement_not_found");
});

test("builds an explicit read-only enterprise view", () => {
  const view = buildEnterpriseSettlementView(enterpriseReport);
  assert.equal(view.mode, "read-only_synthetic_erp");
  assert.deepEqual(view.source_assurance, {
    status: "passed",
    passed_checks: 2,
    total_checks: 2,
    failed_checks: [],
    overlap_status: "aligned_in_overlap_window",
    rpc_events: 1,
    circle_events: 1
  });
  assert.equal(view.erp_candidate.binding_status, "passed");
  assert.equal(view.boundaries.accounting_recognition_claim, false);
});

test("returns a balanced non-posting accounting preview without raw ERP payloads", async () => {
  const response = await fetch(`${origin}/api/accounting-preview`);
  assert.equal(response.status, 200);
  const preview = await response.json();
  assert.equal(preview.mode, "read-only_accounting_preview");
  assert.equal(preview.business_reference, "ARC-ERP-P2-0001");
  assert.equal(preview.journal.debit_minor, "1");
  assert.equal(preview.journal.credit_minor, "1");
  assert.equal(preview.journal.balanced, true);
  assert.equal(preview.controls.postable, false);
  assert.equal(preview.controls.erp_api_calls_executed, 0);
  assert.equal(preview.unresolved_fields.length, 6);
  assert.equal("payload" in preview.receipt_candidate, false);
  assert.equal("payload" in preview.journal, false);
});

test("audits the enterprise envelope without inventing owner fields", async () => {
  const response = await fetch(`${origin}/api/enterprise-envelope`);
  assert.equal(response.status, 200);
  const envelope = await response.json();
  assert.equal(envelope.mode, "read-only_enterprise_envelope_audit");
  assert.equal(envelope.strategy_id, "ONCHAIN_ENTERPRISE_FINANCE_STACK_V1");
  assert.equal(envelope.workflow_id, "PAYMENT_TO_LEDGER_V1");
  assert.equal(envelope.canonical_compliance_claim, false);
  assert.deepEqual(envelope.summary, {
    total_groups: 7,
    complete_groups: 4,
    review_groups: 3,
    mapped_fields: 19,
    required_fields: 26,
    unresolved_contract_fields: 6
  });
  assert.deepEqual(
    envelope.groups.find((group) => group.name === "enterprise_context").missing_fields,
    ["entity_ref", "business_unit_ref"]
  );
  assert.equal(envelope.identity.metadata_binding_status, "unbound_opaque_hash");
  assert.equal(envelope.controls.postable, false);
  assert.equal(envelope.controls.erp_api_calls_executed, 0);
  assert.equal("erp_drafts" in envelope, false);
});

test("keeps false control values mapped in envelope coverage", () => {
  const envelope = buildEnterpriseEnvelopeView(enterpriseReport);
  const control = envelope.groups.find((group) => group.name === "control");
  assert.equal(control.status, "complete");
  assert.deepEqual(control.missing_fields, []);
});

test("returns a deterministic unsigned settlement evidence manifest", async () => {
  const response = await fetch(`${origin}/api/evidence-manifest`);
  assert.equal(response.status, 200);
  const manifest = await response.json();
  assert.equal(manifest.mode, "read-only_unsigned_evidence_manifest");
  assert.equal(manifest.network.chain_id, 5042002);
  assert.equal(manifest.identity.order_id, orderId);
  assert.equal(manifest.settlement.finality_status, "finalized");
  assert.equal(manifest.enterprise_control.accounting_balanced, true);
  assert.equal(manifest.enterprise_control.postable, false);
  assert.equal(manifest.boundaries.erp_api_calls_executed, 0);
  assert.equal(manifest.integrity.algorithm, "sha256");
  assert.match(manifest.integrity.digest, /^[0-9a-f]{64}$/);
  assert.equal(manifest.integrity.signed, false);
  assert.equal(manifest.integrity.semantic, "content_digest_not_signature");
  assert.equal("erp_drafts" in manifest, false);
});

test("changes the evidence digest when an immutable settlement fact drifts", () => {
  const original = buildSettlementEvidenceManifest(enterpriseReport);
  const drifted = structuredClone(enterpriseReport);
  drifted.fact.amount_display = "0.02";
  const changed = buildSettlementEvidenceManifest(drifted);
  assert.notEqual(changed.integrity.digest, original.integrity.digest);
});

test("independently verifies an exported manifest as content integrity only", () => {
  const manifest = buildSettlementEvidenceManifest(enterpriseReport);
  const verification = verifySettlementEvidenceManifest(manifest);
  assert.equal(verification.status, "valid");
  assert.deepEqual(verification.failed_checks, []);
  assert.equal(verification.claimed_digest, verification.recomputed_digest);
  assert.equal(verification.boundaries.verifies_source_truth, false);
  assert.equal(verification.boundaries.verifies_signer_identity, false);
  assert.equal(verification.boundaries.is_attestation, false);
  assert.equal(verification.boundaries.is_accounting_record, false);
});

test("fails closed when exported manifest content is tampered", () => {
  const tampered = buildSettlementEvidenceManifest(enterpriseReport);
  tampered.settlement.amount_display = "0.02";
  const verification = verifySettlementEvidenceManifest(tampered);
  assert.equal(verification.status, "invalid");
  assert.deepEqual(verification.failed_checks, ["digest_matches_content"]);
  assert.notEqual(verification.claimed_digest, verification.recomputed_digest);
});

test("independently detects an unbalanced accounting candidate", () => {
  const unbalanced = structuredClone(enterpriseReport);
  unbalanced.erp_drafts.voucher.payload.lines[1].amount = "0.02";
  const preview = buildAccountingPreviewView(unbalanced);
  assert.equal(preview.journal.debit_minor, "1");
  assert.equal(preview.journal.credit_minor, "2");
  assert.equal(preview.journal.balanced, false);
});

test("rejects accounting amounts that exceed the preview precision", () => {
  const imprecise = structuredClone(enterpriseReport);
  imprecise.erp_drafts.voucher.payload.lines[0].amount = "0.001";
  assert.throws(
    () => buildAccountingPreviewView(imprecise),
    /Accounting amount exceeds precision/
  );
});

test("returns a fail-closed enterprise control matrix", async () => {
  const response = await fetch(`${origin}/api/enterprise-controls`);
  assert.equal(response.status, 200);
  const controls = await response.json();
  assert.deepEqual(controls.summary, {
    total_scenarios: 3,
    matched_paths: 1,
    blocked_exception_paths: 2,
    human_review_paths: 3,
    exception_draft_leakage: 0,
    fail_closed: true
  });
  assert.equal(controls.scenarios[1].reason_code, "DUPLICATE_EVENT");
  assert.equal("event_id" in controls.scenarios[1], false);
});

test("detects ERP draft leakage in exception paths", () => {
  const unsafe = structuredClone(enterpriseReport);
  unsafe.scenarios[1].result.erp_draft_allowed = true;
  const controls = buildEnterpriseControlView(unsafe);
  assert.equal(controls.summary.exception_draft_leakage, 1);
  assert.equal(controls.summary.fail_closed, false);
});

test("separates pre-monitor history from Circle/RPC overlap receipts", async () => {
  const response = await fetch(`${origin}/api/settlement-ledger`);
  assert.equal(response.status, 200);
  const ledger = await response.json();
  assert.deepEqual(ledger.summary, {
    total_receipts: 2,
    pre_monitor_receipts: 1,
    overlap_receipts: 1,
    circle_rpc_matched_receipts: 1,
    enterprise_evaluated_receipts: 1
  });
  assert.equal(ledger.receipts[0].source_status, "circle_backfill_not_expected");
  assert.equal(ledger.receipts[0].enterprise_status, "not_evaluated");
  assert.equal(ledger.receipts[1].source_status, "circle_rpc_matched");
  assert.equal(ledger.receipts[1].enterprise_status, "matched");
});

test("marks overlap receipts for review when sources diverge", () => {
  const divergent = structuredClone(dualReport);
  divergent.unmatched.rpc.push({ transaction_hash: `0x${"ff".repeat(32)}` });
  const ledger = buildSettlementLedgerView(report, divergent, enterpriseReport);
  assert.equal(ledger.receipts[1].source_status, "source_review_required");
  assert.equal(ledger.summary.circle_rpc_matched_receipts, 0);
});

test("returns evidence and exact receipts", async () => {
  const evidence = await fetch(`${origin}/api/evidence`);
  assert.equal(evidence.status, 200);
  assert.equal((await evidence.json()).event_count, 2);

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
