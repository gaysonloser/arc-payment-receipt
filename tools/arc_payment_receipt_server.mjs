#!/usr/bin/env node

import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_EVIDENCE_PATH = resolve(HERE, "../outputs/ArcPaymentReceipt_event_monitor_latest.json");
export const DEFAULT_DUAL_EVIDENCE_PATH = resolve(HERE, "../outputs/ArcPaymentReceipt_dual_source_monitor_latest.json");
export const DEFAULT_CIRCLE_SNAPSHOT_PATH = resolve(HERE, "../outputs/ArcCircleContracts_event_history_latest.json");
export const DEFAULT_ENTERPRISE_EVIDENCE_PATH = resolve(HERE, "../outputs/ArcPaymentReceipt_enterprise_k0_latest.json");
export const DEFAULT_VIEWER_PATH = resolve(HERE, "arc_payment_receipt_viewer.html");
export const DEFAULT_LOGO_PATH = resolve(HERE, "../assets/payment-receipt-logo.png");
export const DEFAULT_FAVICON_PATH = resolve(HERE, "../assets/favicon.png");

function json(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  response.end(`${JSON.stringify(body, null, 2)}\n`);
}

function text(response, status, body, contentType = "text/plain; charset=utf-8") {
  response.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'"
  });
  response.end(body);
}

function binary(response, status, body, contentType) {
  response.writeHead(status, {
    "content-type": contentType,
    "cache-control": "public, max-age=86400, immutable",
    "x-content-type-options": "nosniff"
  });
  response.end(body);
}

export async function loadEvidence(path = DEFAULT_EVIDENCE_PATH) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function loadDualEvidence(path = DEFAULT_DUAL_EVIDENCE_PATH) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function loadCircleSnapshot(path = DEFAULT_CIRCLE_SNAPSHOT_PATH) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function loadEnterpriseEvidence(path = DEFAULT_ENTERPRISE_EVIDENCE_PATH) {
  return JSON.parse(await readFile(path, "utf8"));
}

const FRESH_AFTER_MS = 6 * 60 * 60 * 1000;
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const FUTURE_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

export function classifyEvidenceFreshness(generatedAt, now = Date.now()) {
  const timestamp = Date.parse(generatedAt);
  if (!Number.isFinite(timestamp)) {
    return {
      status: "invalid",
      age_seconds: null,
      generated_at: generatedAt ?? null,
      reason: "invalid_timestamp"
    };
  }

  const rawAgeMs = Number(now) - timestamp;
  if (rawAgeMs < -FUTURE_SKEW_TOLERANCE_MS) {
    return {
      status: "invalid",
      age_seconds: null,
      generated_at: new Date(timestamp).toISOString(),
      reason: "future_timestamp_beyond_clock_skew_tolerance"
    };
  }
  const ageMs = Math.max(0, rawAgeMs);
  const status = ageMs <= FRESH_AFTER_MS ? "fresh" : ageMs <= STALE_AFTER_MS ? "aging" : "stale";
  return {
    status,
    age_seconds: Math.floor(ageMs / 1000),
    generated_at: new Date(timestamp).toISOString()
  };
}

export function buildEvidenceFreshnessView(report, dual, circle, enterprise, now = Date.now()) {
  const sources = {
    rpc: classifyEvidenceFreshness(report.generated_at, now),
    dual_source: classifyEvidenceFreshness(dual.generated_at, now),
    circle: classifyEvidenceFreshness(circle.generated_at, now),
    enterprise: classifyEvidenceFreshness(enterprise.generated_at, now)
  };
  const severity = { fresh: 0, aging: 1, stale: 2, invalid: 3 };
  const status = Object.values(sources).reduce(
    (worst, source) => severity[source.status] > severity[worst] ? source.status : worst,
    "fresh"
  );

  return {
    mode: "read-only_evidence_freshness",
    as_of: new Date(Number(now)).toISOString(),
    status,
    review_required: status !== "fresh",
    thresholds_hours: {
      fresh_max: FRESH_AFTER_MS / 3_600_000,
      aging_max: STALE_AFTER_MS / 3_600_000
    },
    sources,
    boundaries: {
      verifies_source_truth: false,
      authorizes_erp_posting: false
    }
  };
}

const SETTLEMENT_EVENT_CONTRACT = {
  contract_version: "1.0-read-only-snapshot",
  contract_source: "read-only_owner_strategy_snapshot",
  canonical_schema_owner: "enterprise_finance_schema_owner",
  strategy_id: "ONCHAIN_ENTERPRISE_FINANCE_STACK_V1",
  workflow_id: "PAYMENT_TO_LEDGER_V1",
  rail: "Arc",
  chain_id: 5042002,
  asset: "ARC_TESTNET_NATIVE_USDC",
  asset_decimals: 18,
  required_fields: [
    "integration_event_id",
    "rail",
    "chain_id",
    "tx_hash",
    "log_index_or_payment_id",
    "payer",
    "payee",
    "asset",
    "amount_minor",
    "asset_decimals",
    "fees_minor",
    "confirmations",
    "finality_status",
    "removed",
    "receipt_id"
  ]
};

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const DECIMAL_INTEGER_PATTERN = /^(0|[1-9][0-9]*)$/;

function isDecimalInteger(value) {
  return DECIMAL_INTEGER_PATTERN.test(String(value ?? ""));
}

export function buildSettlementEventContractView(bundle) {
  const candidate = bundle.settlement_event_candidate ?? {};
  const settlement = candidate.settlement_event ?? {};
  const envelope = candidate.event_envelope_candidate ?? {};
  const controls = candidate.controls ?? {};
  const unresolved = candidate.unresolved_contract_fields
    ?? bundle.unresolved_contract_fields
    ?? [];
  const unresolvedFields = unresolved.map((item) => item.field);
  const missingRequiredFields = SETTLEMENT_EVENT_CONTRACT.required_fields
    .filter((field) => !hasEnvelopeValue(settlement[field]));
  const logIndex = settlement.log_index_or_payment_id;
  const expectedEventId = Number.isInteger(logIndex)
    && HASH_PATTERN.test(settlement.tx_hash ?? "")
    ? `arc:${settlement.chain_id}:${settlement.tx_hash.toLowerCase()}:${logIndex}`
    : null;
  const amountCandidate = settlement.minor_unit_resolution_candidate?.amount_minor_decimal_string;
  const feeCandidate = settlement.minor_unit_resolution_candidate?.fees_minor_decimal_string;
  const chainChecks = {
    strategy_id_matches: candidate.strategy_id === SETTLEMENT_EVENT_CONTRACT.strategy_id,
    workflow_id_matches: candidate.workflow_id === SETTLEMENT_EVENT_CONTRACT.workflow_id,
    rail_matches: settlement.rail === SETTLEMENT_EVENT_CONTRACT.rail,
    chain_id_matches: settlement.chain_id === SETTLEMENT_EVENT_CONTRACT.chain_id,
    integration_event_id_matches: expectedEventId !== null
      && String(settlement.integration_event_id).toLowerCase() === expectedEventId,
    tx_hash_valid: HASH_PATTERN.test(settlement.tx_hash ?? ""),
    log_index_valid: Number.isInteger(logIndex) && logIndex >= 0,
    payer_valid: ADDRESS_PATTERN.test(settlement.payer ?? ""),
    payee_valid: ADDRESS_PATTERN.test(settlement.payee ?? ""),
    asset_matches: settlement.asset === SETTLEMENT_EVENT_CONTRACT.asset,
    asset_decimals_match: settlement.asset_decimals === SETTLEMENT_EVENT_CONTRACT.asset_decimals,
    amount_atomic_candidate_preserved: isDecimalInteger(amountCandidate),
    fee_atomic_candidate_preserved: isDecimalInteger(feeCandidate),
    confirmations_sufficient: Number.isInteger(settlement.confirmations) && settlement.confirmations >= 1,
    finality_finalized: settlement.finality_status === "finalized",
    event_not_removed: settlement.removed === false,
    receipt_id_valid: HASH_PATTERN.test(settlement.receipt_id ?? ""),
    source_controls_pass: controls.source_controls_pass === true
  };
  const failedChainChecks = Object.entries(chainChecks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  const hardGates = {
    no_accounting_recognition_claim: controls.accounting_recognition_claim === false,
    no_independent_customer_claim: controls.independent_customer_claim === false,
    opaque_metadata_not_promoted: controls.opaque_metadata_not_promoted_to_business_reference === true,
    controlled_test_data_only:
      bundle.control_boundary?.synthetic_data_only === true
      && controls.controlled_test_wallets_only === true,
    human_review_required: envelope.human_review_required === true,
    non_posting: envelope.postable === false,
    zero_erp_wallet_chain_writes:
      bundle.summary?.erp_api_calls_executed === 0
      && bundle.summary?.wallet_actions === 0
      && bundle.summary?.chain_writes === 0
  };
  const failedHardGates = Object.entries(hardGates)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  const chainFactValid = failedChainChecks.length === 0 && failedHardGates.length === 0;
  const envelopeAudit = buildEnterpriseEnvelopeView(bundle);
  const canonicalReady = chainFactValid
    && missingRequiredFields.length === 0
    && unresolvedFields.length === 0
    && envelopeAudit.summary.review_groups === 0
    && envelopeAudit.summary.unresolved_contract_fields === 0;
  const canonicalStatus = !chainFactValid
    ? "blocked_chain_fact_contract"
    : canonicalReady
      ? "ready_for_non_posting_review"
      : "blocked_owner_contract";

  return {
    mode: "read-only_settlement_event_handoff_contract",
    contract: {
      ...SETTLEMENT_EVENT_CONTRACT,
      authority_note: "This validator consumes an owner-approved schema snapshot; it does not own or amend the canonical enterprise contract."
    },
    identity: {
      strategy_id: candidate.strategy_id ?? null,
      workflow_id: candidate.workflow_id ?? null,
      integration_event_id: settlement.integration_event_id ?? null,
      receipt_id: settlement.receipt_id ?? null
    },
    chain_fact_contract: {
      status: chainFactValid ? "valid" : "invalid",
      checks: chainChecks,
      failed_checks: failedChainChecks
    },
    canonical_handoff: {
      status: canonicalStatus,
      ready: canonicalReady,
      missing_required_fields: missingRequiredFields,
      owner_decisions_required: unresolved.map(({ field, reason }) => ({
        field,
        reason: reason ?? "Enterprise schema-owner decision required"
      })),
      envelope_review_groups: envelopeAudit.summary.review_groups
    },
    preserved_candidates: {
      amount_minor_decimal_string: amountCandidate ?? null,
      fees_minor_decimal_string: feeCandidate ?? null,
      promoted_to_canonical_fields: false
    },
    hard_gates: {
      status: failedHardGates.length === 0 ? "pass" : "blocked",
      checks: hardGates,
      failed_checks: failedHardGates
    },
    boundaries: {
      contains_raw_erp_payload: false,
      canonical_compliance_claim: candidate.canonical_compliance_claim === true,
      accounting_recognition_claim: false,
      erp_api_calls_executed: bundle.summary?.erp_api_calls_executed ?? null,
      wallet_actions: bundle.summary?.wallet_actions ?? null,
      chain_writes: bundle.summary?.chain_writes ?? null
    }
  };
}

export function buildSettlementReadinessView(report, dual, circle, bundle, now = Date.now()) {
  const freshness = buildEvidenceFreshnessView(report, dual, circle, bundle, now);
  const enterprise = buildEnterpriseSettlementView(bundle);
  const accounting = buildAccountingPreviewView(bundle);
  const envelope = buildEnterpriseEnvelopeView(bundle);
  const controls = buildEnterpriseControlView(bundle);
  const checks = {
    finality_finalized: enterprise.settlement.finality_status === "finalized",
    source_assurance_passed: enterprise.source_assurance.status === "passed",
    reconciliation_matched: enterprise.reconciliation.status === "matched",
    accounting_balanced: accounting.journal.balanced === true,
    exceptions_fail_closed: controls.summary.fail_closed === true,
    evidence_fresh: freshness.status === "fresh",
    enterprise_owner_contract_complete:
      envelope.summary.review_groups === 0 && envelope.summary.unresolved_contract_fields === 0,
    test_only_non_posting_policy: accounting.policy.mode === "test_only_non_posting"
  };
  const settlementControlKeys = [
    "finality_finalized",
    "source_assurance_passed",
    "reconciliation_matched",
    "accounting_balanced",
    "exceptions_fail_closed"
  ];
  const settlementControlsPass = settlementControlKeys.every((key) => checks[key]);
  const failedChecks = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  const blockingReasons = [];
  if (!settlementControlsPass) blockingReasons.push("SETTLEMENT_CONTROL_FAILURE");
  if (!checks.evidence_fresh) blockingReasons.push(`EVIDENCE_${freshness.status.toUpperCase()}`);
  if (!checks.enterprise_owner_contract_complete) blockingReasons.push("ENTERPRISE_OWNER_CONTRACT_INCOMPLETE");
  blockingReasons.push("TESTNET_NON_POSTING_POLICY");

  let status = "ready_for_non_posting_review";
  if (!settlementControlsPass) status = "blocked_control_failure";
  else if (!checks.evidence_fresh) status = "blocked_evidence_refresh";
  else if (!checks.enterprise_owner_contract_complete) status = "blocked_owner_contract";

  const requiredActions = [];
  if (!settlementControlsPass) requiredActions.push("Resolve failed settlement controls before downstream review");
  if (!checks.evidence_fresh) requiredActions.push("Refresh and reconcile all four evidence sources");
  if (!checks.enterprise_owner_contract_complete) {
    requiredActions.push("Obtain enterprise data-owner approval for unresolved ERP fields");
  }
  requiredActions.push("Complete human accounting review; production posting remains out of scope");

  return {
    mode: "read-only_settlement_readiness_gate",
    as_of: freshness.as_of,
    status,
    strategy_id: enterprise.strategy_id,
    workflow_id: enterprise.workflow_id,
    order_id: enterprise.order_id,
    decision: {
      settlement_controls_pass: settlementControlsPass,
      erp_preview_available: enterprise.erp_candidate.status === "draft_only",
      erp_draft_handoff_allowed:
        status === "ready_for_non_posting_review" && checks.test_only_non_posting_policy,
      erp_posting_authorized: false,
      human_review_required: true
    },
    checks,
    failed_checks: failedChecks,
    blocking_reasons: blockingReasons,
    evidence: {
      status: freshness.status,
      review_required: freshness.review_required,
      source_count: Object.keys(freshness.sources).length
    },
    owner_contract: {
      review_groups: envelope.summary.review_groups,
      unresolved_fields: envelope.summary.unresolved_contract_fields
    },
    required_actions: requiredActions,
    boundaries: {
      synthetic_test_data: enterprise.boundaries.synthetic_test_data,
      accounting_recognition_claim: false,
      erp_api_calls_executed: enterprise.boundaries.erp_api_calls_executed,
      wallet_actions: enterprise.boundaries.wallet_actions,
      chain_writes: enterprise.boundaries.chain_writes
    }
  };
}

export function buildSettlementReviewPacket(report, dual, circle, bundle, now = Date.now()) {
  const readiness = buildSettlementReadinessView(report, dual, circle, bundle, now);
  const enterprise = buildEnterpriseSettlementView(bundle);
  const accounting = buildAccountingPreviewView(bundle);
  const envelope = buildEnterpriseEnvelopeView(bundle);
  const manifest = buildSettlementEvidenceManifest(bundle);
  const manifestVerification = verifySettlementEvidenceManifest(manifest);
  const settlementContract = buildSettlementEventContractView(bundle);
  const checklist = [
    {
      id: "manifest_content_integrity",
      status: manifestVerification.status === "valid" ? "pass" : "blocked",
      evidence: manifest.integrity.digest
    },
    {
      id: "settlement_controls",
      status: readiness.decision.settlement_controls_pass ? "pass" : "blocked",
      evidence: readiness.failed_checks.filter((check) => check !== "evidence_fresh" && check !== "enterprise_owner_contract_complete")
    },
    {
      id: "evidence_freshness",
      status: readiness.checks.evidence_fresh ? "pass" : "review",
      evidence: readiness.evidence.status
    },
    {
      id: "enterprise_owner_contract",
      status: readiness.checks.enterprise_owner_contract_complete ? "pass" : "review",
      evidence: `${readiness.owner_contract.unresolved_fields} unresolved fields`
    },
    {
      id: "settlement_event_handoff_contract",
      status: settlementContract.chain_fact_contract.status === "invalid"
        ? "blocked"
        : settlementContract.canonical_handoff.ready ? "pass" : "review",
      evidence: settlementContract.canonical_handoff.status
    },
    {
      id: "accounting_preview",
      status: accounting.journal.balanced ? "pass" : "blocked",
      evidence: `${accounting.journal.debit_total} debit / ${accounting.journal.credit_total} credit`
    },
    {
      id: "production_posting_authority",
      status: "blocked",
      evidence: "testnet_non_posting_policy"
    }
  ];
  const reviewReady = readiness.status === "ready_for_non_posting_review"
    && manifestVerification.status === "valid"
    && settlementContract.canonical_handoff.ready;

  return {
    packet_version: "1.0",
    mode: "read-only_non-posting_review_packet",
    scope: "single_settlement_review",
    as_of: readiness.as_of,
    identity: {
      strategy_id: readiness.strategy_id,
      workflow_id: readiness.workflow_id,
      order_id: readiness.order_id,
      event_id: enterprise.settlement.event_id,
      transaction_hash: enterprise.settlement.transaction_hash,
      evidence_manifest_digest: manifest.integrity.digest
    },
    decision: {
      review_status: reviewReady ? "ready_for_non_posting_review" : "blocked",
      settlement_controls_pass: readiness.decision.settlement_controls_pass,
      erp_preview_available: readiness.decision.erp_preview_available,
      erp_draft_handoff_allowed: reviewReady && readiness.decision.erp_draft_handoff_allowed,
      erp_posting_authorized: false,
      human_review_required: true
    },
    evidence: {
      manifest_verification_status: manifestVerification.status,
      freshness_status: readiness.evidence.status,
      source_count: readiness.evidence.source_count,
      finality_status: enterprise.settlement.finality_status,
      source_assurance_status: enterprise.source_assurance.status
    },
    accounting: {
      currency: accounting.journal.currency,
      debit_total: accounting.journal.debit_total,
      credit_total: accounting.journal.credit_total,
      balanced: accounting.journal.balanced,
      postable: false,
      accounting_recognition_claim: false
    },
    owner_review: {
      review_groups: envelope.summary.review_groups,
      unresolved_fields: envelope.unresolved_fields
    },
    settlement_event_contract: {
      chain_fact_status: settlementContract.chain_fact_contract.status,
      canonical_handoff_status: settlementContract.canonical_handoff.status,
      canonical_ready: settlementContract.canonical_handoff.ready,
      missing_required_fields: settlementContract.canonical_handoff.missing_required_fields,
      owner_decisions_required: settlementContract.canonical_handoff.owner_decisions_required,
      hard_gates_status: settlementContract.hard_gates.status
    },
    checklist,
    blocking_reasons: readiness.blocking_reasons,
    required_actions: readiness.required_actions,
    boundaries: {
      contains_raw_erp_payload: false,
      verifies_source_truth: false,
      is_attestation: false,
      is_accounting_record: false,
      erp_api_calls_executed: readiness.boundaries.erp_api_calls_executed,
      wallet_actions: readiness.boundaries.wallet_actions,
      chain_writes: readiness.boundaries.chain_writes
    }
  };
}

export function buildEnterpriseSettlementView(bundle) {
  const candidate = bundle.settlement_event_candidate;
  const settlement = candidate.settlement_event;
  const envelope = candidate.event_envelope_candidate;
  const sourceChecks = candidate.controls.source_assurance_checks ?? {};
  const passedSourceChecks = Object.values(sourceChecks).filter((passed) => passed === true).length;
  const drafts = bundle.erp_drafts;
  const bindingChecks = drafts?.controls?.reconciliation_binding_checks ?? {};
  const passedBindingChecks = Object.values(bindingChecks).filter((passed) => passed === true).length;

  return {
    generated_at: bundle.generated_at,
    mode: "read-only_synthetic_erp",
    strategy_id: candidate.strategy_id,
    workflow_id: candidate.workflow_id,
    order_id: settlement.receipt_id,
    settlement: {
      event_id: settlement.integration_event_id,
      transaction_hash: settlement.tx_hash,
      finality_status: settlement.finality_status,
      asset: settlement.asset,
      amount_display: bundle.fact.amount_display,
      payer: settlement.payer,
      payee: settlement.payee
    },
    source_assurance: {
      status: candidate.controls.source_controls_pass ? "passed" : "review",
      passed_checks: passedSourceChecks,
      total_checks: Object.keys(sourceChecks).length,
      failed_checks: candidate.controls.source_assurance_failed_checks,
      overlap_status: bundle.source_assurance.overlap_status,
      rpc_events: bundle.source_assurance.overlap_rpc_events,
      circle_events: bundle.source_assurance.overlap_circle_events
    },
    reconciliation: {
      status: bundle.reconciliation.status,
      reason_code: bundle.reconciliation.reason_code,
      business_reference: bundle.reconciliation.business_reference,
      human_review_required: bundle.reconciliation.human_review_required
    },
    erp_candidate: {
      status: drafts?.status ?? "blocked",
      postable: drafts?.postable === true,
      receipt_origin_no: drafts?.receipt?.payload?.originNo ?? null,
      voucher_link_id: drafts?.voucher?.payload?.linkId ?? null,
      binding_status: drafts?.controls?.reconciliation_binding_pass ? "passed" : "blocked",
      passed_binding_checks: passedBindingChecks,
      total_binding_checks: Object.keys(bindingChecks).length,
      execution_mode: drafts?.receipt?.execution_mode ?? "not_created"
    },
    boundaries: {
      synthetic_test_data: bundle.control_boundary.synthetic_data_only === true,
      erp_api_calls_executed: bundle.summary.erp_api_calls_executed,
      wallet_actions: bundle.summary.wallet_actions,
      chain_writes: bundle.summary.chain_writes,
      accounting_recognition_claim: candidate.controls.accounting_recognition_claim
    }
  };
}

export function canonicalizeJson(value) {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalizeJson(value[key])])
    );
  }
  return value;
}

export function buildSettlementEvidenceManifest(bundle) {
  const enterprise = buildEnterpriseSettlementView(bundle);
  const accounting = buildAccountingPreviewView(bundle);
  const envelope = buildEnterpriseEnvelopeView(bundle);
  const fact = bundle.fact;
  const payload = {
    manifest_version: "1.0",
    mode: "read-only_unsigned_evidence_manifest",
    scope: "single_settlement",
    generated_at: bundle.generated_at,
    network: {
      name: fact.network,
      chain_id: fact.chain_id,
      contract: fact.contract
    },
    identity: {
      event_id: enterprise.settlement.event_id,
      order_id: enterprise.order_id,
      transaction_hash: enterprise.settlement.transaction_hash,
      log_index: fact.log_index,
      block_number: fact.block_number,
      source_fingerprint_sha256: envelope.identity.source_fingerprint
    },
    settlement: {
      asset: enterprise.settlement.asset,
      amount_display: enterprise.settlement.amount_display,
      payer: enterprise.settlement.payer,
      payee: enterprise.settlement.payee,
      finality_status: enterprise.settlement.finality_status,
      finality_basis: fact.protocol_finality?.basis ?? null,
      transaction_succeeded: fact.source_integrity?.transaction_succeeded === true,
      storage_matches_event: fact.source_integrity?.storage_matches_event === true,
      contract_balance_zero: fact.source_integrity?.contract_balance_zero === true
    },
    source_assurance: enterprise.source_assurance,
    enterprise_control: {
      strategy_id: enterprise.strategy_id,
      workflow_id: enterprise.workflow_id,
      reconciliation_status: enterprise.reconciliation.status,
      reason_code: enterprise.reconciliation.reason_code,
      business_reference: enterprise.reconciliation.business_reference,
      erp_candidate_status: enterprise.erp_candidate.status,
      accounting_balanced: accounting.journal.balanced,
      human_review_required: enterprise.reconciliation.human_review_required,
      postable: enterprise.erp_candidate.postable,
      unresolved_owner_fields: envelope.summary.unresolved_contract_fields
    },
    boundaries: {
      synthetic_test_data: enterprise.boundaries.synthetic_test_data,
      erp_api_calls_executed: enterprise.boundaries.erp_api_calls_executed,
      wallet_actions: enterprise.boundaries.wallet_actions,
      chain_writes: enterprise.boundaries.chain_writes,
      accounting_recognition_claim: enterprise.boundaries.accounting_recognition_claim,
      canonical_compliance_claim: envelope.canonical_compliance_claim
    }
  };
  const canonical = JSON.stringify(canonicalizeJson(payload));
  const digest = createHash("sha256").update(canonical).digest("hex");

  return {
    ...payload,
    integrity: {
      algorithm: "sha256",
      canonicalization: "json-key-sort-v1",
      digest,
      signed: false,
      semantic: "content_digest_not_signature"
    }
  };
}

export function verifySettlementEvidenceManifest(manifest) {
  const { integrity, ...payload } = manifest ?? {};
  const canonical = JSON.stringify(canonicalizeJson(payload));
  const recomputedDigest = createHash("sha256").update(canonical).digest("hex");
  const checks = {
    manifest_version_supported: payload.manifest_version === "1.0",
    mode_is_read_only_unsigned: payload.mode === "read-only_unsigned_evidence_manifest",
    algorithm_is_sha256: integrity?.algorithm === "sha256",
    canonicalization_supported: integrity?.canonicalization === "json-key-sort-v1",
    digest_format_valid: /^[0-9a-f]{64}$/.test(integrity?.digest ?? ""),
    digest_matches_content: integrity?.digest === recomputedDigest,
    explicitly_unsigned: integrity?.signed === false,
    semantic_is_content_digest_only: integrity?.semantic === "content_digest_not_signature"
  };
  const failedChecks = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);

  return {
    verification_version: "1.0",
    status: failedChecks.length === 0 ? "valid" : "invalid",
    scope: "content_integrity_only",
    claimed_digest: integrity?.digest ?? null,
    recomputed_digest: recomputedDigest,
    checks,
    failed_checks: failedChecks,
    boundaries: {
      verifies_source_truth: false,
      verifies_signer_identity: false,
      is_attestation: false,
      is_accounting_record: false
    }
  };
}

function decimalToMinorUnits(value, decimals = 2) {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value));
  if (!match) throw new Error("Invalid accounting amount");
  const rawFraction = match[3] ?? "";
  if (rawFraction.length > decimals) throw new Error("Accounting amount exceeds precision");
  const fraction = rawFraction.padEnd(decimals, "0");
  const units = (BigInt(match[2]) * (10n ** BigInt(decimals))) + BigInt(fraction || "0");
  return match[1] ? -units : units;
}

function minorUnitsToDecimal(value, decimals = 2) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const scale = 10n ** BigInt(decimals);
  const whole = absolute / scale;
  const fraction = String(absolute % scale).padStart(decimals, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

export function buildAccountingPreviewView(bundle) {
  const drafts = bundle.erp_drafts;
  const policy = drafts.accounting_policy;
  const receipt = drafts.receipt;
  const voucher = drafts.voucher;
  const lines = voucher.payload.lines.map((line) => ({
    account_code: line.accountCode,
    direction: line.direction,
    amount: line.amount,
    customer_code: line.customerCode ?? null
  }));
  const debitMinor = lines
    .filter((line) => line.direction === "debit")
    .reduce((total, line) => total + decimalToMinorUnits(line.amount), 0n);
  const creditMinor = lines
    .filter((line) => line.direction === "credit")
    .reduce((total, line) => total + decimalToMinorUnits(line.amount), 0n);
  const controlBalanced = drafts.controls.debit_credit_balanced === true;
  const unresolved = bundle.unresolved_contract_fields
    ?? bundle.settlement_event_candidate?.unresolved_contract_fields
    ?? [];
  const receiptEntry = receipt.payload.entries?.[0] ?? {};

  return {
    generated_at: bundle.generated_at,
    mode: "read-only_accounting_preview",
    business_reference: bundle.reconciliation.business_reference,
    policy: {
      mode: policy.mode,
      scope: policy.scope,
      ledger_currency: policy.ledger_currency,
      settlement_asset: policy.settlement_asset,
      conversion_method: policy.conversion_method
    },
    receipt_candidate: {
      origin_no: receipt.payload.originNo,
      bill_no: receiptEntry.billNo ?? null,
      bill_type: receiptEntry.billType ?? null,
      amount: receiptEntry.nowCheck ?? null,
      execution_mode: receipt.execution_mode,
      schema_status: receipt.schema_status
    },
    journal: {
      link_id: voucher.payload.linkId,
      date: voucher.payload.date,
      currency: voucher.payload.currency,
      summary: voucher.payload.summary,
      lines,
      debit_minor: String(debitMinor),
      credit_minor: String(creditMinor),
      debit_total: minorUnitsToDecimal(debitMinor),
      credit_total: minorUnitsToDecimal(creditMinor),
      balanced: debitMinor === creditMinor && controlBalanced
    },
    unresolved_fields: unresolved.map((item) => item.field),
    controls: {
      postable: drafts.postable === true,
      human_review_required: drafts.human_review_required === true,
      erp_api_calls_executed: bundle.summary.erp_api_calls_executed,
      no_approval_or_period_close_call: drafts.controls.no_approval_or_period_close_call === true,
      synthetic_test_data: bundle.control_boundary.synthetic_data_only === true
    }
  };
}

const ENTERPRISE_ENVELOPE_GROUPS = {
  event_identity: ["event_id", "event_type", "schema_version", "occurred_at"],
  enterprise_context: ["entity_ref", "business_unit_ref", "source_system"],
  business_reference: ["business_reference_hash", "source_document_type", "source_document_ref"],
  evidence: ["evidence_mode", "evidence_id", "source_fingerprint", "privacy_classification"],
  workflow: ["workflow_id", "workflow_status", "reason_code", "idempotency_key"],
  accounting: ["accounting_status", "kingdee_object_type", "draft_id", "readback_status"],
  control: ["policy_status", "human_review_required", "postable", "exception_status"]
};

function hasEnvelopeValue(value) {
  return value !== null && value !== undefined && value !== "";
}

export function buildEnterpriseEnvelopeView(bundle) {
  const candidate = bundle.settlement_event_candidate;
  const sourceEnvelope = candidate.event_envelope_candidate ?? {};
  const envelope = { ...sourceEnvelope, workflow_id: candidate.workflow_id };
  const unresolved = candidate.unresolved_contract_fields
    ?? bundle.unresolved_contract_fields
    ?? [];
  const groups = Object.entries(ENTERPRISE_ENVELOPE_GROUPS).map(([name, fields]) => {
    const missingFields = fields.filter((field) => !hasEnvelopeValue(envelope[field]));
    return {
      name,
      mapped_fields: fields.length - missingFields.length,
      required_fields: fields.length,
      missing_fields: missingFields,
      status: missingFields.length === 0 ? "complete" : "review"
    };
  });
  const mappedFields = groups.reduce((total, group) => total + group.mapped_fields, 0);
  const requiredFields = groups.reduce((total, group) => total + group.required_fields, 0);
  const completeGroups = groups.filter((group) => group.status === "complete").length;

  return {
    generated_at: bundle.generated_at,
    mode: "read-only_enterprise_envelope_audit",
    strategy_id: candidate.strategy_id,
    workflow_id: candidate.workflow_id,
    schema_version: candidate.schema_version ?? envelope.schema_version,
    schema_status: candidate.schema_status ?? "candidate",
    canonical_compliance_claim: candidate.canonical_compliance_claim === true,
    summary: {
      total_groups: groups.length,
      complete_groups: completeGroups,
      review_groups: groups.length - completeGroups,
      mapped_fields: mappedFields,
      required_fields: requiredFields,
      unresolved_contract_fields: unresolved.length
    },
    identity: {
      event_id: envelope.event_id ?? null,
      event_type: envelope.event_type ?? null,
      source_system: envelope.source_system ?? null,
      source_fingerprint: envelope.source_fingerprint ?? null,
      metadata_binding_status: envelope.metadata_binding?.binding_status ?? "not_declared"
    },
    ownership: {
      arc_owned: ["native_usdc_settlement", "receipt", "circle_rpc_evidence", "finality"],
      enterprise_owner_required: ["entity_and_business_unit", "business_document_binding", "kingdee_object_and_posting"]
    },
    groups,
    unresolved_fields: unresolved.map(({ field, reason }) => ({ field, reason: reason ?? "Owner decision required" })),
    controls: {
      postable: envelope.postable === true,
      human_review_required: envelope.human_review_required === true,
      erp_api_calls_executed: bundle.summary.erp_api_calls_executed,
      wallet_actions: bundle.summary.wallet_actions,
      chain_writes: bundle.summary.chain_writes
    }
  };
}

export function buildEnterpriseControlView(bundle) {
  const scenarios = (bundle.scenarios ?? []).map(({ name, result }) => ({
    name,
    status: result.status,
    reason_code: result.reason_code,
    business_reference: result.business_reference,
    difference_minor: result.difference_minor,
    human_review_required: result.human_review_required === true,
    erp_draft_allowed: result.erp_draft_allowed === true
  }));
  const matched = scenarios.filter((scenario) => scenario.status === "matched");
  const exceptions = scenarios.filter((scenario) => scenario.status === "exception");
  const draftLeakage = exceptions.filter((scenario) => scenario.erp_draft_allowed);

  return {
    generated_at: bundle.generated_at,
    mode: "read-only_control_matrix",
    summary: {
      total_scenarios: scenarios.length,
      matched_paths: matched.length,
      blocked_exception_paths: exceptions.length,
      human_review_paths: scenarios.filter((scenario) => scenario.human_review_required).length,
      exception_draft_leakage: draftLeakage.length,
      fail_closed: exceptions.length > 0 && draftLeakage.length === 0
    },
    scenarios
  };
}

export function buildSettlementLedgerView(report, dual, enterpriseBundle) {
  const enterprise = buildEnterpriseSettlementView(enterpriseBundle);
  const monitorCreatedAt = Date.parse(dual.coverage.circle_monitor_created_at);
  const overlapAligned = dual.status === "aligned_in_overlap_window"
    && dual.unmatched.rpc.length === 0
    && dual.unmatched.circle.length === 0;
  const receipts = report.events.map((event, index) => {
    const occurredAt = Date.parse(event.timestamp);
    const preMonitor = occurredAt < monitorCreatedAt;
    const enterpriseEvaluated = event.order_id.toLowerCase() === enterprise.order_id.toLowerCase();
    return {
      sequence: `P${index + 1}`,
      order_id: event.order_id,
      transaction_hash: event.transaction_hash,
      block_number: event.block_number,
      timestamp: event.timestamp,
      payer: event.payer,
      merchant: event.merchant,
      amount_usdc: event.amount_usdc,
      transaction_succeeded: event.transaction_status === 1,
      storage_matches_event: event.storage_matches_event === true,
      coverage_window: preMonitor ? "rpc_pre_monitor" : "circle_rpc_overlap",
      source_status: preMonitor
        ? "circle_backfill_not_expected"
        : (overlapAligned ? "circle_rpc_matched" : "source_review_required"),
      enterprise_status: enterpriseEvaluated ? enterprise.reconciliation.status : "not_evaluated",
      erp_candidate_status: enterpriseEvaluated ? enterprise.erp_candidate.status : "not_created"
    };
  });

  return {
    generated_at: report.generated_at,
    mode: "read-only_settlement_ledger",
    monitor_created_at: dual.coverage.circle_monitor_created_at,
    summary: {
      total_receipts: receipts.length,
      pre_monitor_receipts: receipts.filter((receipt) => receipt.coverage_window === "rpc_pre_monitor").length,
      overlap_receipts: receipts.filter((receipt) => receipt.coverage_window === "circle_rpc_overlap").length,
      circle_rpc_matched_receipts: receipts.filter((receipt) => receipt.source_status === "circle_rpc_matched").length,
      enterprise_evaluated_receipts: receipts.filter((receipt) => receipt.enterprise_status !== "not_evaluated").length
    },
    receipts
  };
}

export function createReceiptServer(options = {}) {
  const loadReport = options.loadReport ?? (() => loadEvidence(options.evidencePath));
  const loadDualReport = options.loadDualReport ?? (() => loadDualEvidence(options.dualEvidencePath));
  const loadCircleReport = options.loadCircleReport ?? (() => loadCircleSnapshot(options.circleSnapshotPath));
  const loadEnterpriseReport = options.loadEnterpriseReport ?? (() => loadEnterpriseEvidence(options.enterpriseEvidencePath));
  const loadViewer = options.loadViewer ?? (() => readFile(options.viewerPath ?? DEFAULT_VIEWER_PATH, "utf8"));
  const loadLogo = options.loadLogo ?? (() => readFile(options.logoPath ?? DEFAULT_LOGO_PATH));
  const loadFavicon = options.loadFavicon ?? (() => readFile(options.faviconPath ?? DEFAULT_FAVICON_PATH));
  const now = options.now ?? (() => Date.now());

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      if (request.method !== "GET") {
        json(response, 405, { error: "method_not_allowed" });
        return;
      }

      if (url.pathname === "/" || url.pathname === "/arc-payment-receipt") {
        text(response, 200, await loadViewer(), "text/html; charset=utf-8");
        return;
      }

      if (url.pathname === "/assets/payment-receipt-logo.png") {
        binary(response, 200, await loadLogo(), "image/png");
        return;
      }

      if (url.pathname === "/assets/favicon.png") {
        binary(response, 200, await loadFavicon(), "image/png");
        return;
      }

      if (url.pathname === "/api/health") {
        const [report, dual, circle, enterprise] = await Promise.all([
          loadReport(),
          loadDualReport(),
          loadCircleReport(),
          loadEnterpriseReport()
        ]);
        const enterpriseView = buildEnterpriseSettlementView(enterprise);
        const accountingView = buildAccountingPreviewView(enterprise);
        const envelopeView = buildEnterpriseEnvelopeView(enterprise);
        const manifestView = buildSettlementEvidenceManifest(enterprise);
        const settlementContractView = buildSettlementEventContractView(enterprise);
        const freshnessView = buildEvidenceFreshnessView(report, dual, circle, enterprise, now());
        const readinessView = buildSettlementReadinessView(report, dual, circle, enterprise, now());
        const reviewPacket = buildSettlementReviewPacket(report, dual, circle, enterprise, now());
        json(response, 200, {
          status: "ok",
          mode: "read-only",
          contract: report.contract,
          event_count: report.event_count,
          latest_scanned_block: report.range.to,
          dual_source_status: dual.status,
          circle_subscription_state: circle.subscription_state,
          webhook_active: circle.webhook_active,
          enterprise_workflow_status: enterpriseView.reconciliation.status,
          erp_postable: enterpriseView.erp_candidate.postable,
          accounting_balanced: accountingView.journal.balanced,
          accounting_unresolved_fields: accountingView.unresolved_fields.length,
          enterprise_envelope_mapped_fields: envelopeView.summary.mapped_fields,
          enterprise_envelope_required_fields: envelopeView.summary.required_fields,
          enterprise_envelope_review_groups: envelopeView.summary.review_groups,
          evidence_manifest_digest: manifestView.integrity.digest,
          evidence_freshness: freshnessView,
          settlement_readiness_status: readinessView.status,
          erp_draft_handoff_allowed: readinessView.decision.erp_draft_handoff_allowed,
          settlement_review_packet_status: reviewPacket.decision.review_status,
          settlement_event_chain_fact_status: settlementContractView.chain_fact_contract.status,
          settlement_event_handoff_status: settlementContractView.canonical_handoff.status,
          generated_at: report.generated_at
        });
        return;
      }

      if (url.pathname === "/api/evidence") {
        json(response, 200, await loadReport());
        return;
      }

      if (url.pathname === "/api/dual-source") {
        json(response, 200, await loadDualReport());
        return;
      }

      if (url.pathname === "/api/circle-monitor") {
        json(response, 200, await loadCircleReport());
        return;
      }

      if (url.pathname === "/api/enterprise-settlement") {
        json(response, 200, buildEnterpriseSettlementView(await loadEnterpriseReport()));
        return;
      }

      if (url.pathname === "/api/accounting-preview") {
        json(response, 200, buildAccountingPreviewView(await loadEnterpriseReport()));
        return;
      }

      if (url.pathname === "/api/enterprise-envelope") {
        json(response, 200, buildEnterpriseEnvelopeView(await loadEnterpriseReport()));
        return;
      }

      if (url.pathname === "/api/evidence-manifest") {
        json(response, 200, buildSettlementEvidenceManifest(await loadEnterpriseReport()));
        return;
      }

      if (url.pathname === "/api/evidence-freshness") {
        const [report, dual, circle, enterprise] = await Promise.all([
          loadReport(),
          loadDualReport(),
          loadCircleReport(),
          loadEnterpriseReport()
        ]);
        json(response, 200, buildEvidenceFreshnessView(report, dual, circle, enterprise, now()));
        return;
      }

      if (url.pathname === "/api/settlement-readiness") {
        const [report, dual, circle, enterprise] = await Promise.all([
          loadReport(),
          loadDualReport(),
          loadCircleReport(),
          loadEnterpriseReport()
        ]);
        json(response, 200, buildSettlementReadinessView(report, dual, circle, enterprise, now()));
        return;
      }

      if (url.pathname === "/api/settlement-review-packet") {
        const [report, dual, circle, enterprise] = await Promise.all([
          loadReport(),
          loadDualReport(),
          loadCircleReport(),
          loadEnterpriseReport()
        ]);
        json(response, 200, buildSettlementReviewPacket(report, dual, circle, enterprise, now()));
        return;
      }

      if (url.pathname === "/api/settlement-event-contract") {
        json(response, 200, buildSettlementEventContractView(await loadEnterpriseReport()));
        return;
      }

      if (url.pathname === "/api/enterprise-controls") {
        json(response, 200, buildEnterpriseControlView(await loadEnterpriseReport()));
        return;
      }

      if (url.pathname === "/api/settlement-ledger") {
        const [report, dual, enterprise] = await Promise.all([
          loadReport(),
          loadDualReport(),
          loadEnterpriseReport()
        ]);
        json(response, 200, buildSettlementLedgerView(report, dual, enterprise));
        return;
      }

      const enterpriseMatch = url.pathname.match(/^\/api\/enterprise-settlements\/(0x[0-9a-fA-F]{64})$/);
      if (enterpriseMatch) {
        const enterpriseView = buildEnterpriseSettlementView(await loadEnterpriseReport());
        const orderId = enterpriseMatch[1].toLowerCase();
        if (enterpriseView.order_id.toLowerCase() !== orderId) {
          json(response, 404, { error: "enterprise_settlement_not_found", order_id: orderId });
          return;
        }
        json(response, 200, enterpriseView);
        return;
      }

      const match = url.pathname.match(/^\/api\/receipts\/(0x[0-9a-fA-F]{64})$/);
      if (match) {
        const report = await loadReport();
        const orderId = match[1].toLowerCase();
        const receipt = report.events.find((event) => event.order_id === orderId);
        if (!receipt) {
          json(response, 404, { error: "receipt_not_found", order_id: orderId });
          return;
        }
        json(response, 200, { contract: report.contract, checks: report.checks, receipt });
        return;
      }

      json(response, 404, { error: "not_found" });
    } catch (error) {
      json(response, 500, { error: "internal_error", message: error.message });
    }
  });
}

function parseArgs(argv) {
  const options = {
    host: process.env.HOST || "127.0.0.1",
    port: Number(process.env.PORT || 8774),
    evidencePath: DEFAULT_EVIDENCE_PATH,
    dualEvidencePath: DEFAULT_DUAL_EVIDENCE_PATH,
    circleSnapshotPath: DEFAULT_CIRCLE_SNAPSHOT_PATH,
    enterpriseEvidencePath: DEFAULT_ENTERPRISE_EVIDENCE_PATH
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index + 1];
    if (argv[index] === "--host") { options.host = value; index += 1; }
    else if (argv[index] === "--port") { options.port = Number(value); index += 1; }
    else if (argv[index] === "--evidence") { options.evidencePath = resolve(value); index += 1; }
    else if (argv[index] === "--dual-evidence") { options.dualEvidencePath = resolve(value); index += 1; }
    else if (argv[index] === "--circle-snapshot") { options.circleSnapshotPath = resolve(value); index += 1; }
    else if (argv[index] === "--enterprise-evidence") { options.enterpriseEvidencePath = resolve(value); index += 1; }
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
    throw new Error("Port must be an integer between 1 and 65535");
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const server = createReceiptServer(options);
  server.listen(options.port, options.host, () => {
    process.stdout.write(`Arc Payment Receipt API: http://${options.host}:${options.port}\n`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
