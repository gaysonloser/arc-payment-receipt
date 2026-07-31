import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import {
  buildAccountingPreviewView,
  buildEnterpriseControlView,
  buildEnterpriseEnvelopeView,
  buildEnterpriseSettlementView,
  buildEvidenceFreshnessView,
  buildOpeningBalanceReadinessView,
  buildOpeningBalanceFixtureContractView,
  buildOpeningBalanceLineClassificationView,
  buildOpeningBalanceReviewPacket,
  buildOpeningBalanceFixtureValidationView,
  buildFinalDemoPlanView,
  buildFinalSubmissionReadinessView,
  buildReviewerEvidencePack,
  buildPublicBoundaryConsistencyView,
  buildPublicDisclosureAuditView,
  buildQualityReleaseEvidenceView,
  buildSettlementReadinessView,
  buildSettlementReviewPacket,
  buildSettlementEventContractView,
  buildSettlementEvidenceManifest,
  buildSettlementLedgerView,
  classifyEvidenceFreshness,
  createReceiptServer,
  verifySettlementEvidenceManifest
} from "./arc_payment_receipt_server.mjs";

const orderId = `0x${"12".repeat(32)}`;
const report = {
  generated_at: "2026-07-20T11:32:28.246Z",
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
  generated_at: "2026-07-20T11:42:28.246Z",
  status: "aligned_in_overlap_window",
  coverage: { circle_monitor_created_at: "2026-07-17T05:32:25.461447Z" },
  counts: { rpc_in_overlap_window: 1, circle_in_overlap_window: 1 },
  unmatched: { rpc: [], circle: [] }
};
const circleReport = {
  generated_at: "2026-07-20T11:52:28.246Z",
  subscription_state: "Subscribed",
  webhook_active: false,
  event_history_state: "No emitted events yet"
};
const manufacturingEvidence = {
  status: "chain_anchor_confirmed_quality_hold",
  state: "QUALITY_HOLD",
  chain_anchor: { transaction_hash: `0x${"56".repeat(32)}` },
  controls: { manufacture_completion_claimed: false }
};
const walletCapability = {
  status: "confirmed",
  wallet: { address: "0x75F2c230F2bd6874306EA586f198a7D2f6CC7Cc6", ending_nonce: 6 },
  actions: [{ type: "payment_receipt_canary", transaction_hash: `0x${"57".repeat(32)}` }],
  boundaries: { wallet_executor_exposed: false }
};
const manufacturingProgress = {
  status: "cross_system_manufacturing_quality_release_confirmed",
  erp: {
    quality_inspection: { docstatus: 1 },
    manufacture: { docstatus: 1 },
    inventory: { wip_qty: "0.000", finished_goods_qty: "25.000", finished_goods_valuation_rate: "20.00" },
    readback_generated_at: "2026-07-26T03:43:19.365Z",
    source_document_refs_public: false,
    source_fingerprint_public: false
  },
  chain: {
    current_state: "QUALITY_RELEASE",
    predecessor_state: "QUALITY_HOLD",
    registry: `0x${"58".repeat(20)}`,
    transaction_hash: `0x${"59".repeat(32)}`,
    block_number: 53732050,
    quality_release_anchored: true
  },
  boundaries: { chain_action_executed: true }
};
const w4DualSource = {
  status: "aligned_in_overlap_window",
  counts: { rpc_in_overlap_window: 1, circle_in_overlap_window: 1 },
  checks: { overlap_events_match: true },
  unmatched: { rpc: [], circle: [] }
};
const appKitBoundary = {
  status: "official_capability_reviewed_not_enabled_for_custom_contract_call",
  product_boundary: {
    custom_pay_calldata_supported: false,
    app_kit_enabled_in_runtime: false,
    chain_action_executed: false
  },
  public_safety: { allows_write: false }
};
const enterpriseReport = {
  generated_at: "2026-07-20T12:02:28.246Z",
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
    owner_boundary: {
      chain_fact_owner: "payment_receipt",
      canonical_schema_owner: "enterprise_finance_schema_owner",
      erp_accounting_owner: "enterprise_finance_schema_owner"
    },
    settlement_event: {
      integration_event_id: `arc:5042002:0x${"34".repeat(32)}:26`,
      rail: "Arc",
      chain_id: 5042002,
      tx_hash: `0x${"34".repeat(32)}`,
      log_index_or_payment_id: 26,
      finality_status: "finalized",
      asset: "ARC_TESTNET_NATIVE_USDC",
      amount_minor: null,
      asset_decimals: 18,
      fees_minor: null,
      minor_unit_resolution_candidate: {
        amount_minor_decimal_string: "10000000000000000",
        fees_minor_decimal_string: "2604985456999672"
      },
      confirmations: 1430,
      removed: false,
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
      controlled_test_wallets_only: true,
      independent_customer_claim: false,
      opaque_metadata_not_promoted_to_business_reference: true,
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
    loadManufacturing: async () => manufacturingEvidence,
    loadManufacturingProgressReport: async () => manufacturingProgress,
    loadWalletRecovery: async () => walletCapability,
    loadW4Dual: async () => w4DualSource,
    loadAppKit: async () => appKitBoundary,
    loadDeliverySurfaces: async () => ({
      schema_version: "1.0",
      product: "CATVERSE Twin-Ledger Enterprise Finance OS -- AOXPET Arc Lab",
      surfaces: { github: "engineering source", render: "running proof", circle_console: "contract and event proof", encode: "reviewer proof" },
      rules: { one_lifecycle_one_outcome: true, github_render_same_release: true }
    }),
    now: () => Date.parse("2026-07-20T13:02:28.246Z"),
    loadViewer: async () => "<!doctype html><title>viewer</title>",
    loadLogo: async () => Buffer.from("logo"),
    loadFavicon: async () => Buffer.from("favicon")
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.closeAllConnections();
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

test("serves a read-only health response", async () => {
  const response = await fetch(`${origin}/api/health`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
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
    evidence_freshness: {
      mode: "read-only_evidence_freshness",
      as_of: "2026-07-20T13:02:28.246Z",
      status: "fresh",
      review_required: false,
      thresholds_hours: { fresh_max: 6, aging_max: 24 },
      sources: {
        rpc: { status: "fresh", age_seconds: 5400, generated_at: report.generated_at },
        dual_source: { status: "fresh", age_seconds: 4800, generated_at: dualReport.generated_at },
        circle: { status: "fresh", age_seconds: 4200, generated_at: circleReport.generated_at },
        enterprise: { status: "fresh", age_seconds: 3600, generated_at: enterpriseReport.generated_at }
      },
      boundaries: {
        verifies_source_truth: false,
        authorizes_erp_posting: false
      }
    },
    settlement_readiness_status: "blocked_owner_contract",
    erp_draft_handoff_allowed: false,
    settlement_review_packet_status: "blocked",
    settlement_event_chain_fact_status: "valid",
    settlement_event_handoff_status: "blocked_owner_contract",
    generated_at: report.generated_at
  });
});

test("serves the sanitized delivery-surface authority map", async () => {
  const response = await fetch(`${origin}/api/v1/delivery-surfaces`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.rules.one_lifecycle_one_outcome, true);
  assert.equal(payload.surfaces.circle_console, "contract and event proof");
  assert.equal(payload.surfaces.encode, "reviewer proof");

  const head = await fetch(`${origin}/api/v1/delivery-surfaces`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");

  const post = await fetch(`${origin}/api/v1/delivery-surfaces`, { method: "POST" });
  assert.equal(post.status, 405);
});

test("serves the confirmed ERC-8004 identity record as a bounded read-only API", async () => {
  const response = await fetch(`${origin}/api/v1/agent-identity`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.status, "confirmed_read_only_identity_registration");
  assert.equal(payload.network.chain_id, 5042002);
  assert.equal(payload.identity.token_id, "851940");
  assert.equal(payload.identity.transaction_nonce, 14);
  assert.equal(payload.identity.balance_of_owner_at_latest_read, "1");
  assert.equal(payload.boundaries.wallet_connection, false);
  assert.equal(payload.boundaries.chain_transaction_enabled, false);
  assert.equal(payload.boundaries.identity_is_not_authorization, true);

  const head = await fetch(`${origin}/api/v1/agent-identity`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");

  const post = await fetch(`${origin}/api/v1/agent-identity`, { method: "POST" });
  assert.equal(post.status, 405);
});

test("fails closed for a recovery-only external bridge route", async () => {
  const response = await fetch(`${origin}/api/v1/external-route-intake-boundary`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.status, "external_route_recovery_only_not_accepted_for_new_intake");
  assert.equal(payload.observed_route.new_deposits_accepted, false);
  assert.equal(payload.observed_route.existing_deposit_recovery_only, true);
  assert.equal(payload.product_decision.accept_as_arc_chain_fact, false);
  assert.equal(payload.product_decision.accept_as_circle_or_erp_authority, false);
  assert.equal(payload.boundaries.wallet_connection_or_signature_performed, false);
  assert.equal(payload.boundaries.recovery_claim_requires_separate_exact_owner_review, true);

  const head = await fetch(`${origin}/api/v1/external-route-intake-boundary`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");

  const post = await fetch(`${origin}/api/v1/external-route-intake-boundary`, { method: "POST" });
  assert.equal(post.status, 405);
});

test("audits the bounded public documents without returning sensitive values", async () => {
  const response = await fetch(`${origin}/api/v1/public-disclosure-audit`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.mode, "read-only_public_disclosure_boundary_audit");
  assert.equal(payload.status, "bounded_public_documents_clear");
  assert.equal(payload.summary.document_count, 4);
  assert.equal(payload.summary.prohibited_value_findings, 0);
  assert.equal(payload.boundaries.returns_sensitive_values, false);
  assert.equal(payload.boundaries.proves_no_secret_exists_elsewhere, false);
  assert.match(payload.reviewed_documents[0].content_sha256, /^[0-9a-f]{64}$/);

  const head = await fetch(`${origin}/api/v1/public-disclosure-audit`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");

  const post = await fetch(`${origin}/api/v1/public-disclosure-audit`, { method: "POST" });
  assert.equal(post.status, 405);
});

test("fails closed on a potential disclosure without echoing its value", () => {
  const audit = buildPublicDisclosureAuditView({
    safe: { boundaries: { secret_exposed: false } },
    unsafe: { credential: "not-for-publication" }
  });
  assert.equal(audit.status, "review_required_fail_closed");
  assert.deepEqual(audit.findings, [{
    document: "unsafe",
    path: "$.credential",
    category: "sensitive_field_has_value"
  }]);
  assert.equal(JSON.stringify(audit).includes("not-for-publication"), false);
});

test("admits only a consistent set of public safety boundaries", async () => {
  const response = await fetch(`${origin}/api/v1/public-boundary-consistency`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.mode, "read-only_public_boundary_consistency_gate");
  assert.equal(payload.status, "public_boundaries_consistent");
  assert.equal(payload.failed_checks.length, 0);
  assert.equal(payload.decision.reviewer_read_only_admission, true);
  assert.equal(payload.decision.wallet_or_chain_action_authorized, false);

  const drifted = buildPublicBoundaryConsistencyView({
    agentIdentity: { boundaries: { wallet_connection: true, signer_or_key_present: false, chain_transaction_enabled: false } },
    externalRouteIntake: { boundaries: {}, product_decision: {} },
    deliverySurfaces: { rules: {} },
    publicTrace: { boundaries: {} }
  });
  assert.equal(drifted.status, "boundary_inconsistency_review_required");
  assert.equal(drifted.failed_checks.includes("identity_never_enables_a_wallet"), true);
});

test("assembles a content-addressed reviewer evidence pack without enabling a write path", async () => {
  const response = await fetch(`${origin}/api/v1/reviewer-evidence-pack`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.mode, "read-only_reviewer_evidence_pack");
  assert.match(payload.content_sha256, /^[0-9a-f]{64}$/);
  assert.equal(payload.boundaries.wallet_or_chain_action, false);
  assert.equal(payload.boundaries.creates_erp_document, false);
  assert.equal(payload.evidence.delivery.github_render_same_release_required, true);

  const repeated = buildReviewerEvidencePack({
    qualityHold: manufacturingEvidence,
    manufacturingProgress,
    wallet: walletCapability,
    appKit: appKitBoundary,
    agentIdentity: { boundaries: { wallet_connection: false, signer_or_key_present: false, chain_transaction_enabled: false } },
    externalRouteIntake: { boundaries: { wallet_connection_or_signature_performed: false, new_base_deposit_performed: false, arc_transaction_performed: false }, product_decision: { accept_as_new_funding_route: false, accept_as_arc_chain_fact: false, accept_as_circle_or_erp_authority: false, accept_as_payment_receipt_evidence: false } },
    deliverySurfaces: { rules: { github_render_same_release: true, one_lifecycle_one_outcome: true }, cross_surface_rules: { github_render_same_release_fingerprint: true }, surfaces: [] },
    publicTrace: { boundaries: { duplicate_facts_collapsed: true, preflight_or_local_test_counted: false, public_claims_limited_to_verifiable_outcomes: true, wallet_executor_exposed: false, erp_raw_payload_exposed: false } }
  });
  assert.match(repeated.content_sha256, /^[0-9a-f]{64}$/);
  assert.equal(repeated.boundaries.creates_circle_subscription, false);
});

test("keeps final-submission readiness explicit about incomplete materials", async () => {
  const response = await fetch(`${origin}/api/v1/final-submission-readiness`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.mode, "read-only_final_submission_readiness");
  assert.equal(payload.status, "final_submission_materials_incomplete");
  assert.equal(typeof payload.checks.public_read_only_mvp_available, "boolean");
  assert.equal(payload.checks.final_demo_video_available, false);
  assert.equal(payload.remaining_requirements.includes("final_pitch_deck_available"), true);
  assert.equal(payload.boundaries.is_not_a_hackathon_submission, true);
  assert.equal(payload.boundaries.wallet_or_chain_action, false);

  const ready = buildFinalSubmissionReadinessView({ status: "reviewer_pack_ready", evidence: { delivery: { github_render_same_release_required: true } } });
  assert.equal(ready.checks.public_read_only_mvp_available, true);
  assert.equal(ready.checks.github_and_render_release_evidence_available, true);

  const unavailable = buildFinalSubmissionReadinessView({ status: "reviewer_pack_review_required", evidence: { delivery: {} } });
  assert.equal(unavailable.checks.public_read_only_mvp_available, false);
  assert.equal(unavailable.remaining_requirements.includes("public_read_only_mvp_available"), true);
});

test("serves a bounded three-minute final demo plan without claiming a recording", async () => {
  const response = await fetch(`${origin}/api/v1/final-demo-plan`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.mode, "read-only_final_demo_plan");
  assert.equal(payload.duration_seconds, 180);
  assert.equal(payload.steps.length, 4);
  assert.equal(payload.boundaries.is_a_demo_outline_not_a_recorded_video, true);
  assert.equal(payload.boundaries.wallet_or_chain_action, false);
  const ready = buildFinalDemoPlanView({ status: "final_submission_materials_ready", remaining_requirements: [] });
  assert.equal(ready.status, "demo_plan_ready");
});

test("keeps C1 opening-balance preparation read-only until separate owner approval", async () => {
  const response = await fetch(`${origin}/api/v1/opening-balance-readiness`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.mode, "read-only_opening_balance_readiness_gate");
  assert.equal(payload.status, "ready_for_separate_owner_approval");
  assert.equal(payload.boundaries.writes_opening_balance, false);
  assert.equal(payload.required_owner_inputs.length, 2);
  assert.equal(buildOpeningBalanceReadinessView({ c0: { company_created: false } }).status, "c1_preconditions_incomplete");
});

test("rejects an absent opening-balance fixture and verifies an approved zero-difference fixture", async () => {
  const response = await fetch(`${origin}/api/v1/opening-balance-fixture-contract`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "fixture_rejected_fail_closed");
  const valid = buildOpeningBalanceFixtureContractView({ c0: { company_created: true, dedicated_service_identity_created: true } }, { approved: true, currency: "USD", write_requested: false, lines: [{ debit: 10, credit: 0 }, { debit: 0, credit: 10 }] });
  assert.equal(valid.status, "fixture_valid_for_separate_owner_review");
  assert.equal(valid.totals.difference, 0);
  assert.equal(valid.boundaries.erp_write_executed, false);
});

test("rejects incomplete C1 lines and accepts exactly one posting side per classified line", () => {
  assert.equal(buildOpeningBalanceLineClassificationView().status, "line_classification_rejected_fail_closed");
  const valid = buildOpeningBalanceLineClassificationView({ lines: [{ account_code: "1001", debit: 10, credit: 0 }, { account_code: "3001", debit: 0, credit: 10 }] });
  assert.equal(valid.status, "line_classification_valid_for_separate_owner_review");
  assert.equal(valid.invalid_lines.length, 0);
});

test("assembles a fail-closed C1 review packet with a deterministic content digest", async () => {
  const response = await fetch(`${origin}/api/v1/opening-balance-review-packet`);
  const packet = await response.json();
  assert.equal(packet.status, "blocked_fail_closed");
  assert.match(packet.packet_sha256, /^[0-9a-f]{64}$/);
  const ready = buildOpeningBalanceReviewPacket({ c0: { company_created: true, dedicated_service_identity_created: true, draft_only_role_assigned: true, api_credentials_generated: false, opening_balance_written: false, business_documents_created: 0 } }, { approved: true, currency: "USD", write_requested: false, lines: [{ account_code: "1001", debit: 10, credit: 0 }, { account_code: "3001", debit: 0, credit: 10 }] });
  assert.equal(ready.status, "ready_for_separate_owner_review");
  assert.equal(ready.boundaries.erp_write_executed, false);
});

test("validates an ephemeral C1 fixture without persisting it or authorizing a write", async () => {
  const fixture = {
    approved: true,
    currency: "USD",
    write_requested: false,
    lines: [
      { account_code: "1001", debit: 10, credit: 0 },
      { account_code: "3001", debit: 0, credit: 10 }
    ]
  };
  const response = await fetch(`${origin}/api/v1/opening-balance-fixture-validate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fixture })
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.mode, "read-only_opening_balance_fixture_validation");
  assert.equal(payload.accepted_for_separate_owner_review, true);
  assert.equal(payload.boundaries.fixture_persisted, false);
  assert.equal(payload.boundaries.erp_write_executed, false);
  assert.equal(buildOpeningBalanceFixtureValidationView({ c0: { company_created: true, dedicated_service_identity_created: true } }).accepted_for_separate_owner_review, false);
});

test("serves the Arc Lab E1 shell and sanitized topology", async () => {
  const page = await fetch(`${origin}/arc-lab`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /AOXPET Arc Lab Enterprise OS/);

  const reviewDeck = await fetch(`${origin}/arc-lab/review-deck`);
  assert.equal(reviewDeck.status, 200);
  assert.match(await reviewDeck.text(), /Arc Lab Review Deck/);

  const evidenceExplorer = await fetch(`${origin}/arc-lab/evidence-explorer`);
  assert.equal(evidenceExplorer.status, 200);
  assert.match(await evidenceExplorer.text(), /Arc Lab Evidence Explorer/);

  const provenanceLedger = await fetch(`${origin}/arc-lab/provenance-ledger`);
  assert.equal(provenanceLedger.status, 200);
  assert.match(await provenanceLedger.text(), /Arc Lab Provenance Ledger/);

  const reviewerChecklist = await fetch(`${origin}/arc-lab/reviewer-checklist`);
  assert.equal(reviewerChecklist.status, 200);
  assert.match(await reviewerChecklist.text(), /Arc Lab Reviewer Checklist/);

  const releaseWatch = await fetch(`${origin}/arc-lab/release-watch`);
  assert.equal(releaseWatch.status, 200);
  assert.match(await releaseWatch.text(), /Arc Lab Release Watch/);

  const controlTimeline = await fetch(`${origin}/arc-lab/control-timeline`);
  assert.equal(controlTimeline.status, 200);
  assert.match(await controlTimeline.text(), /Arc Lab Control Timeline/);

  const alias = await fetch(`${origin}/enterprise-os`);
  assert.equal(alias.status, 200);

  const health = await fetch(`${origin}/healthz`);
  assert.equal(health.status, 200);
  const healthJson = await health.json();
  assert.equal(healthJson.status, "ok");
  assert.equal(healthJson.standard_id, "CATVERSE_TWIN_LEDGER_RENDER_DUAL_SERVICE_V1");
  assert.equal(healthJson.service.name, "arc-payment-receipt");
  assert.equal(healthJson.product.company, "AOXPET Arc Lab");
  assert.equal(healthJson.e1_controls.read_only_shell, true);
  assert.equal(healthJson.execution_identity.wallet_label, "ARC");
  assert.equal(healthJson.execution_identity.chain_id, 5042002);

  const topology = await fetch(`${origin}/api/arc-lab-portfolio`);
  assert.equal(topology.status, 200);
  const topologyJson = await topology.json();
  assert.equal(topologyJson.service.create_second_arc_service, false);
  assert.equal(topologyJson.product.namespace, "ARC-LAB-*");
  assert.equal(topologyJson.product.payment_component_is_umbrella, false);
  assert.equal(topologyJson.e1_controls.erp_credential_present, false);
  assert.equal(topologyJson.e1_controls.erp_write_enabled, false);
  assert.equal(topologyJson.e1_controls.wallet_connection_enabled, false);
  assert.equal(topologyJson.e1_controls.chain_transaction_enabled, false);
  assert.equal(topologyJson.execution_identity.address, "0x75F2c230F2bd6874306EA586f198a7D2f6CC7Cc6");
  assert.equal(topologyJson.coverage_summary.result_units_completed, 23);
  assert.equal(topologyJson.erp_interaction_summary.c0.company_created, true);
  assert.equal(topologyJson.erp_interaction_summary.c0.api_credentials_generated, false);
  assert.equal(topologyJson.erp_interaction_summary.d09_treasury_reconciliation.postable, false);
});

test("serves sanitized AAL C0 and D09 ERP interaction mapping", async () => {
  const response = await fetch(`${origin}/api/v1/erp-interaction`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.product.company, "AOXPET Arc Lab");
  assert.equal(payload.c0.dedicated_service_identity_created, true);
  assert.equal(payload.c0.identity_value_public, false);
  assert.equal(payload.c0.business_documents_created, 0);
  assert.equal(payload.d09_treasury_reconciliation.status, "implemented_read_only_mapping_no_payment_expansion");
  assert.equal(payload.d09_treasury_reconciliation.new_arc_payment_executed, false);
  assert.equal(payload.d09_treasury_reconciliation.erp_document_created, false);
  assert.equal(payload.boundaries.raw_erp_payload_public, false);
  assert.equal(payload.boundaries.secret_or_api_key_public, false);
  assert.equal(JSON.stringify(payload).includes("@aoxpet.invalid"), false);

  const head = await fetch(`${origin}/api/v1/erp-interaction`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");

  const post = await fetch(`${origin}/api/v1/erp-interaction`, { method: "POST" });
  assert.equal(post.status, 405);
});

test("serves E1 evidence with GET and HEAD only", async () => {
  const evidence = await fetch(`${origin}/api/v1/evidence`);
  assert.equal(evidence.status, 200);
  const evidenceJson = await evidence.json();
  assert.equal(evidenceJson.status, "read_only_sanitized_e1_evidence");
  assert.equal(evidenceJson.checks.no_secret_or_credential_required, true);
  assert.equal(evidenceJson.checks.no_erp_write, true);
  assert.equal(evidenceJson.checks.no_wallet_or_chain_action, true);
  assert.equal(evidenceJson.checks.no_second_arc_service, true);
  assert.equal(evidenceJson.checks.payment_component_is_not_umbrella, true);
  assert.equal(evidenceJson.execution_identity.address, "0x75F2c230F2bd6874306EA586f198a7D2f6CC7Cc6");
  assert.equal(evidenceJson.legacy_payment_receipt.event_count, 2);
  assert.equal(JSON.stringify(evidenceJson).includes(["", "Users", ""].join("/")), false);
  assert.equal(JSON.stringify(evidenceJson).includes("api_key"), false);

  const head = await fetch(`${origin}/api/v1/topology`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");

  const put = await fetch(`${origin}/api/v1/evidence`, { method: "PUT" });
  assert.equal(put.status, 405);
  assert.equal((await put.json()).error, "method_not_allowed");
});

test("keeps the Circle webhook endpoint fail-closed without a configured durable receiver", async () => {
  const response = await fetch(`${origin}/api/v1/circle-webhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ notificationType: "contracts.eventLog" })
  });
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.accepted, false);
  assert.equal(body.error, "webhook_receiver_disabled");
  assert.deepEqual(body.blockers, [
    "receiver_enabled_required",
    "durable_queue_declared_required",
    "verification_key_present_required"
  ]);
});

test("serves manufacturing and wallet capability evidence as read-only APIs", async () => {
  const manufacturing = await fetch(`${origin}/api/v1/manufacturing-evidence`);
  assert.equal(manufacturing.status, 200);
  assert.equal((await manufacturing.json()).state, "QUALITY_HOLD");

  const progress = await fetch(`${origin}/api/v1/manufacturing-progress`);
  assert.equal(progress.status, 200);
  const progressJson = await progress.json();
  assert.equal(progressJson.status, "cross_system_manufacturing_quality_release_confirmed");
  assert.equal(progressJson.erp.quality_inspection.docstatus, 1);
  assert.equal(progressJson.erp.manufacture.docstatus, 1);
  assert.equal(progressJson.erp.inventory.wip_qty, "0.000");
  assert.equal(progressJson.erp.inventory.finished_goods_qty, "25.000");
  assert.equal(progressJson.erp.inventory.finished_goods_valuation_rate, "20.00");
  assert.equal(progressJson.erp.readback_generated_at, "2026-07-26T03:43:19.365Z");
  assert.equal(progressJson.erp.source_document_refs_public, false);
  assert.equal(progressJson.erp.source_fingerprint_public, false);
  assert.equal(progressJson.chain.current_state, "QUALITY_RELEASE");
  assert.equal(progressJson.chain.quality_release_anchored, true);
  assert.equal(progressJson.boundaries.chain_action_executed, true);

  const wallet = await fetch(`${origin}/api/v1/wallet-capability`);
  assert.equal(wallet.status, 200);
  const walletJson = await wallet.json();
  assert.equal(walletJson.wallet.ending_nonce, 6);
  assert.equal(walletJson.boundaries.wallet_executor_exposed, false);

  const head = await fetch(`${origin}/api/v1/wallet-capability`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");

  const write = await fetch(`${origin}/api/v1/manufacturing-evidence`, { method: "POST" });
  assert.equal(write.status, 405);

  const progressWrite = await fetch(`${origin}/api/v1/manufacturing-progress`, { method: "POST" });
  assert.equal(progressWrite.status, 405);
});

test("keeps QUALITY_RELEASE evidence separate from the historical Circle receipt monitor", async () => {
  const view = buildQualityReleaseEvidenceView(manufacturingProgress, w4DualSource);
  assert.equal(view.status, "rpc_confirmed_circle_registry_monitor_pending");
  assert.equal(view.chain_fact.state, "QUALITY_RELEASE");
  assert.equal(view.erp_authority.finished_goods_qty, "25.000");
  assert.equal(view.source_assurance.quality_release_registry_circle_monitor, "not_imported_or_subscribed");
  assert.equal(view.negative_controls.inventory_tokenization_claimed, false);

  const response = await fetch(`${origin}/api/v1/quality-release-evidence`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.status, "rpc_confirmed_circle_registry_monitor_pending");
  assert.equal(payload.negative_controls.erp_write_exposed, false);

  const write = await fetch(`${origin}/api/v1/quality-release-evidence`, { method: "POST" });
  assert.equal(write.status, 405);
});

test("serves W4 Circle and RPC alignment as read-only evidence", async () => {
  const response = await fetch(`${origin}/api/v1/w4-dual-source`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.status, "aligned_in_overlap_window");
  assert.equal(payload.checks.overlap_events_match, true);
  assert.deepEqual(payload.unmatched, { rpc: [], circle: [] });

  const head = await fetch(`${origin}/api/v1/w4-dual-source`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");

  const post = await fetch(`${origin}/api/v1/w4-dual-source`, { method: "POST" });
  assert.equal(post.status, 405);
});

test("serves a source-separated public delivery trail without counting local preparation", async () => {
  const response = await fetch(`${origin}/api/v1/public-trace-trail`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.status, "sanitized_read_only");
  assert.equal(payload.boundaries.duplicate_facts_collapsed, true);
  assert.equal(payload.boundaries.preflight_or_local_test_counted, false);
  assert.equal(payload.records.some((record) => record.id === "arc-chain-quality-release"), true);
  assert.equal(payload.records.some((record) => record.id === "erp-inventory-ledger"), true);
  assert.equal(payload.records.some((record) => record.id === "render-running-release"), true);

  const head = await fetch(`${origin}/api/v1/public-trace-trail`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");

  const post = await fetch(`${origin}/api/v1/public-trace-trail`, { method: "POST" });
  assert.equal(post.status, 405);
});

test("serves the App Kit compatibility boundary without claiming a custom call integration", async () => {
  const response = await fetch(`${origin}/api/v1/app-kit-boundary`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.status, "official_capability_reviewed_not_enabled_for_custom_contract_call");
  assert.equal(payload.product_boundary.custom_pay_calldata_supported, false);
  assert.equal(payload.product_boundary.app_kit_enabled_in_runtime, false);
  assert.equal(payload.product_boundary.chain_action_executed, false);
  assert.equal(payload.public_safety.allows_write, false);
  assert.equal(JSON.stringify(payload).includes("0x75F2c230F2bd6874306EA586f198a7D2f6CC7Cc6"), false);

  const head = await fetch(`${origin}/api/v1/app-kit-boundary`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");

  const post = await fetch(`${origin}/api/v1/app-kit-boundary`, { method: "POST" });
  assert.equal(post.status, 405);
});

test("classifies fresh, aging, stale, and invalid evidence", () => {
  const now = Date.parse("2026-07-20T13:02:28.246Z");
  assert.equal(classifyEvidenceFreshness("2026-07-20T12:02:28.246Z", now).status, "fresh");
  assert.equal(classifyEvidenceFreshness("2026-07-20T05:02:28.246Z", now).status, "aging");
  assert.equal(classifyEvidenceFreshness("2026-07-19T13:02:27.246Z", now).status, "stale");
  assert.equal(classifyEvidenceFreshness("not-a-timestamp", now).status, "invalid");
});

test("fails closed on future evidence outside the clock-skew tolerance", () => {
  const now = Date.parse("2026-07-20T13:02:28.246Z");
  const tolerated = classifyEvidenceFreshness("2026-07-20T13:06:28.246Z", now);
  const invalid = classifyEvidenceFreshness("2026-07-20T13:08:28.246Z", now);
  assert.equal(tolerated.status, "fresh");
  assert.equal(tolerated.age_seconds, 0);
  assert.equal(invalid.status, "invalid");
  assert.equal(invalid.age_seconds, null);
  assert.equal(invalid.reason, "future_timestamp_beyond_clock_skew_tolerance");
});

test("uses the older dual-source evidence time instead of its recompute time", () => {
  const now = Date.parse("2026-07-20T13:02:28.246Z");
  const freshness = buildEvidenceFreshnessView(
    report,
    {
      ...dualReport,
      generated_at: "2026-07-20T12:59:00.000Z",
      evidence_at: "2026-07-20T05:00:00.000Z"
    },
    circleReport,
    enterpriseReport,
    now
  );
  assert.equal(freshness.sources.dual_source.status, "aging");
  assert.equal(freshness.sources.dual_source.generated_at, "2026-07-20T05:00:00.000Z");
});

test("returns a four-source freshness gate that cannot authorize posting", async () => {
  const response = await fetch(`${origin}/api/evidence-freshness`);
  assert.equal(response.status, 200);
  const freshness = await response.json();
  assert.equal(freshness.status, "fresh");
  assert.equal(freshness.review_required, false);
  assert.deepEqual(Object.keys(freshness.sources), ["rpc", "dual_source", "circle", "enterprise"]);
  assert.equal(freshness.sources.enterprise.age_seconds, 3600);
  assert.equal(freshness.boundaries.verifies_source_truth, false);
  assert.equal(freshness.boundaries.authorizes_erp_posting, false);

  const stale = buildEvidenceFreshnessView(
    report,
    dualReport,
    circleReport,
    enterpriseReport,
    Date.parse("2026-07-22T13:02:28.246Z")
  );
  assert.equal(stale.status, "stale");
  assert.equal(stale.review_required, true);
});

test("returns a fail-closed settlement readiness gate", async () => {
  const response = await fetch(`${origin}/api/settlement-readiness`);
  assert.equal(response.status, 200);
  const readiness = await response.json();
  assert.equal(readiness.mode, "read-only_settlement_readiness_gate");
  assert.equal(readiness.status, "blocked_owner_contract");
  assert.equal(readiness.decision.settlement_controls_pass, true);
  assert.equal(readiness.decision.erp_preview_available, true);
  assert.equal(readiness.decision.erp_draft_handoff_allowed, false);
  assert.equal(readiness.decision.erp_posting_authorized, false);
  assert.equal(readiness.owner_contract.unresolved_fields, 6);
  assert.deepEqual(readiness.failed_checks, ["enterprise_owner_contract_complete"]);
  assert.deepEqual(readiness.blocking_reasons, [
    "ENTERPRISE_OWNER_CONTRACT_INCOMPLETE",
    "TESTNET_NON_POSTING_POLICY"
  ]);
  assert.equal(readiness.boundaries.erp_api_calls_executed, 0);
});

test("validates Arc chain facts while preserving owner-blocked canonical fields", async () => {
  const response = await fetch(`${origin}/api/settlement-event-contract`);
  assert.equal(response.status, 200);
  const contract = await response.json();
  assert.equal(contract.mode, "read-only_settlement_event_handoff_contract");
  assert.equal(contract.contract.canonical_schema_owner, "enterprise_finance_schema_owner");
  assert.equal(contract.chain_fact_contract.status, "valid");
  assert.deepEqual(contract.chain_fact_contract.failed_checks, []);
  assert.equal(contract.canonical_handoff.status, "blocked_owner_contract");
  assert.equal(contract.canonical_handoff.ready, false);
  assert.deepEqual(contract.canonical_handoff.missing_required_fields, ["amount_minor", "fees_minor"]);
  assert.equal(contract.canonical_handoff.owner_decisions_required.length, 6);
  assert.equal(contract.preserved_candidates.amount_minor_decimal_string, "10000000000000000");
  assert.equal(contract.preserved_candidates.promoted_to_canonical_fields, false);
  assert.equal(contract.hard_gates.status, "pass");
  assert.equal(contract.boundaries.contains_raw_erp_payload, false);
  assert.equal(JSON.stringify(contract).includes("erp_drafts"), false);
});

test("fails the handoff contract on malformed chain identity", () => {
  const malformed = structuredClone(enterpriseReport);
  malformed.settlement_event_candidate.settlement_event.tx_hash = "0x1234";
  malformed.settlement_event_candidate.settlement_event.payer = "not-an-address";
  const contract = buildSettlementEventContractView(malformed);
  assert.equal(contract.chain_fact_contract.status, "invalid");
  assert.equal(contract.canonical_handoff.status, "blocked_chain_fact_contract");
  assert.equal(contract.chain_fact_contract.failed_checks.includes("tx_hash_valid"), true);
  assert.equal(contract.chain_fact_contract.failed_checks.includes("payer_valid"), true);
  assert.equal(contract.canonical_handoff.ready, false);
});

test("fails the handoff contract on strategy or workflow drift", () => {
  const drifted = structuredClone(enterpriseReport);
  drifted.settlement_event_candidate.strategy_id = "PAYMENT_TO_LEDGER_V1";
  drifted.settlement_event_candidate.workflow_id = "UNREVIEWED_WORKFLOW";
  const contract = buildSettlementEventContractView(drifted);
  assert.equal(contract.chain_fact_contract.status, "invalid");
  assert.deepEqual(contract.chain_fact_contract.failed_checks.slice(0, 2), [
    "strategy_id_matches",
    "workflow_id_matches"
  ]);
  assert.equal(contract.canonical_handoff.status, "blocked_chain_fact_contract");
});

test("blocks stale evidence before owner-contract review", () => {
  const readiness = buildSettlementReadinessView(
    report,
    dualReport,
    circleReport,
    enterpriseReport,
    Date.parse("2026-07-22T13:02:28.246Z")
  );
  assert.equal(readiness.status, "blocked_evidence_refresh");
  assert.equal(readiness.checks.evidence_fresh, false);
  assert.equal(readiness.decision.erp_draft_handoff_allowed, false);
  assert.deepEqual(readiness.blocking_reasons, [
    "EVIDENCE_STALE",
    "ENTERPRISE_OWNER_CONTRACT_INCOMPLETE",
    "TESTNET_NON_POSTING_POLICY"
  ]);
});

test("blocks source-control failures even when evidence is fresh", () => {
  const unsafe = structuredClone(enterpriseReport);
  unsafe.settlement_event_candidate.controls.source_controls_pass = false;
  unsafe.settlement_event_candidate.controls.source_assurance_failed_checks = ["circle_event_payload_matches"];
  const readiness = buildSettlementReadinessView(
    report,
    dualReport,
    circleReport,
    unsafe,
    Date.parse("2026-07-20T13:02:28.246Z")
  );
  assert.equal(readiness.status, "blocked_control_failure");
  assert.equal(readiness.checks.source_assurance_passed, false);
  assert.equal(readiness.decision.settlement_controls_pass, false);
  assert.equal(readiness.blocking_reasons[0], "SETTLEMENT_CONTROL_FAILURE");
});

test("allows only non-posting handoff after every technical and owner check passes", () => {
  const complete = structuredClone(enterpriseReport);
  const envelope = complete.settlement_event_candidate.event_envelope_candidate;
  envelope.entity_ref = "TEST-ENTITY";
  envelope.business_unit_ref = "TEST-BU";
  envelope.business_reference_hash = `0x${"ab".repeat(32)}`;
  envelope.source_document_type = "sales_order_demo";
  envelope.source_document_ref = "SO-ARC-P2-0001";
  envelope.kingdee_object_type = "receipt_candidate";
  envelope.draft_id = "LOCAL-DRY-RUN";
  complete.unresolved_contract_fields = [];
  complete.settlement_event_candidate.unresolved_contract_fields = [];
  const readiness = buildSettlementReadinessView(
    report,
    dualReport,
    circleReport,
    complete,
    Date.parse("2026-07-20T13:02:28.246Z")
  );
  assert.equal(readiness.status, "ready_for_non_posting_review");
  assert.equal(readiness.failed_checks.length, 0);
  assert.equal(readiness.decision.erp_draft_handoff_allowed, true);
  assert.equal(readiness.decision.erp_posting_authorized, false);
  assert.deepEqual(readiness.blocking_reasons, ["TESTNET_NON_POSTING_POLICY"]);
});

test("returns a bounded settlement review packet without raw ERP payloads", async () => {
  const response = await fetch(`${origin}/api/settlement-review-packet`);
  assert.equal(response.status, 200);
  const packet = await response.json();
  assert.equal(packet.packet_version, "1.0");
  assert.equal(packet.mode, "read-only_non-posting_review_packet");
  assert.equal(packet.scope, "single_settlement_review");
  assert.equal(packet.identity.order_id, orderId);
  assert.equal(
    packet.identity.evidence_manifest_digest,
    buildSettlementEvidenceManifest(enterpriseReport).integrity.digest
  );
  assert.equal(packet.decision.review_status, "blocked");
  assert.equal(packet.decision.settlement_controls_pass, true);
  assert.equal(packet.decision.erp_draft_handoff_allowed, false);
  assert.equal(packet.decision.erp_posting_authorized, false);
  assert.equal(packet.evidence.manifest_verification_status, "valid");
  assert.equal(packet.owner_review.unresolved_fields.length, 6);
  assert.equal(packet.checklist.length, 7);
  assert.equal(packet.settlement_event_contract.chain_fact_status, "valid");
  assert.equal(packet.settlement_event_contract.canonical_handoff_status, "blocked_owner_contract");
  assert.deepEqual(packet.settlement_event_contract.missing_required_fields, ["amount_minor", "fees_minor"]);
  assert.equal(packet.boundaries.contains_raw_erp_payload, false);
  assert.equal(packet.boundaries.erp_api_calls_executed, 0);
  assert.equal(packet.boundaries.wallet_actions, 0);
  assert.equal(packet.boundaries.chain_writes, 0);
  assert.equal(JSON.stringify(packet).includes("erp_drafts"), false);
  assert.equal(JSON.stringify(packet).includes("receipt_candidate"), false);
  assert.equal(JSON.stringify(packet).includes("voucher"), false);
});

test("review packet remains blocked when evidence ages", () => {
  const packet = buildSettlementReviewPacket(
    report,
    dualReport,
    circleReport,
    enterpriseReport,
    Date.parse("2026-07-22T13:02:28.246Z")
  );
  assert.equal(packet.decision.review_status, "blocked");
  assert.equal(packet.decision.erp_draft_handoff_allowed, false);
  assert.equal(packet.evidence.freshness_status, "stale");
  assert.equal(packet.checklist.find((item) => item.id === "evidence_freshness").status, "review");
  assert.equal(packet.blocking_reasons.includes("EVIDENCE_STALE"), true);
});

test("review packet can become review-ready but never posting-authorized", () => {
  const complete = structuredClone(enterpriseReport);
  const envelope = complete.settlement_event_candidate.event_envelope_candidate;
  envelope.entity_ref = "TEST-ENTITY";
  envelope.business_unit_ref = "TEST-BU";
  envelope.business_reference_hash = `0x${"ab".repeat(32)}`;
  envelope.source_document_type = "sales_order_demo";
  envelope.source_document_ref = "SO-ARC-P2-0001";
  envelope.kingdee_object_type = "receipt_candidate";
  envelope.draft_id = "LOCAL-DRY-RUN";
  complete.settlement_event_candidate.settlement_event.amount_minor = "10000000000000000";
  complete.settlement_event_candidate.settlement_event.fees_minor = "2604985456999672";
  complete.unresolved_contract_fields = [];
  complete.settlement_event_candidate.unresolved_contract_fields = [];
  const packet = buildSettlementReviewPacket(
    report,
    dualReport,
    circleReport,
    complete,
    Date.parse("2026-07-20T13:02:28.246Z")
  );
  assert.equal(packet.decision.review_status, "ready_for_non_posting_review");
  assert.equal(packet.decision.erp_draft_handoff_allowed, true);
  assert.equal(packet.decision.erp_posting_authorized, false);
  assert.equal(packet.settlement_event_contract.canonical_ready, true);
  assert.equal(packet.accounting.postable, false);
  assert.deepEqual(packet.blocking_reasons, ["TESTNET_NON_POSTING_POLICY"]);
  assert.equal(packet.checklist.find((item) => item.id === "production_posting_authority").status, "blocked");
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
