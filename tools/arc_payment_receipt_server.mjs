#!/usr/bin/env node

import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  buildCircleWebhookPolicy,
  buildCircleWebhookReadiness,
  createCircleWebhookProcessor
} from "./circle_contract_webhook_gate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_EVIDENCE_PATH = resolve(HERE, "../outputs/ArcPaymentReceipt_event_monitor_latest.json");
export const DEFAULT_DUAL_EVIDENCE_PATH = resolve(HERE, "../outputs/ArcPaymentReceipt_dual_source_monitor_latest.json");
export const DEFAULT_CIRCLE_SNAPSHOT_PATH = resolve(HERE, "../outputs/ArcCircleContracts_event_history_latest.json");
export const DEFAULT_ENTERPRISE_EVIDENCE_PATH = resolve(HERE, "../outputs/ArcPaymentReceipt_enterprise_k0_latest.json");
export const DEFAULT_VIEWER_PATH = resolve(HERE, "arc_payment_receipt_viewer.html");
export const DEFAULT_ARC_LAB_VIEWER_PATH = resolve(HERE, "arc_lab_enterprise_os_viewer.html");
export const DEFAULT_ARC_LAB_PORTFOLIO_PATH = resolve(HERE, "../config/arc_lab_enterprise_os_e1_read_only_shell_v1.json");
export const DEFAULT_ARC_LAB_ERP_INTERACTION_PATH = resolve(HERE, "../config/arc_lab_erp_interaction_public_v1.json");
export const DEFAULT_MANUFACTURING_EVIDENCE_PATH = resolve(HERE, "../outputs/Arc_XERP_MFG_01_local_evidence.json");
export const DEFAULT_MANUFACTURING_PROGRESS_PATH = resolve(HERE, "../outputs/Arc_XERP_MFG_02_progress_public.json");
export const DEFAULT_WALLET_CAPABILITY_PATH = resolve(HERE, "../outputs/Arc_Wallet_Capability_Recovery_public.json");
export const DEFAULT_W4_DUAL_SOURCE_PATH = resolve(HERE, "../outputs/Arc_W4_dual_source_monitor_aligned_20260726.json");
export const DEFAULT_APP_KIT_BOUNDARY_PATH = resolve(HERE, "../outputs/Arc_App_Kit_Integration_Boundary_public.json");
export const DEFAULT_PUBLIC_TRACE_TRAIL_PATH = resolve(HERE, "../outputs/Arc_Public_Trace_Trail_v1.json");
export const DEFAULT_DELIVERY_SURFACES_PATH = resolve(HERE, "../config/public_delivery_surfaces_v1.json");
export const DEFAULT_LOGO_PATH = resolve(HERE, "../assets/payment-receipt-logo.png");
export const DEFAULT_FAVICON_PATH = resolve(HERE, "../assets/favicon.png");

async function loadJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "strict-transport-security": "max-age=31536000; includeSubDomains"
};

function normalizeEvmAddress(value) {
  return String(value ?? "").toLowerCase();
}

const CIRCLE_WEBHOOK_READINESS_POLICY = Object.freeze({
  enabled: false,
  durableQueueAvailable: false,
  chainId: 5042002,
  contractAddress: "0x094f69e6b760c48b6cf23f9af156c4511e8fa1e7",
  eventSignature: "EvidenceAnchored(bytes32,bytes32,bytes32,bytes32,uint8)"
});

export function buildCircleWebhookPublicView() {
  const readiness = buildCircleWebhookReadiness(buildCircleWebhookPolicy(CIRCLE_WEBHOOK_READINESS_POLICY));
  return {
    ...readiness,
    surface: "read_only_configuration_boundary",
    next_owner_action: "Provide a durable HTTPS queue and explicitly authorize Circle Console subscription creation.",
    guarantees: {
      endpoint_accepts_webhooks: false,
      circle_subscription_created: false,
      circle_resource_changed: false,
      erp_write: false,
      wallet_or_chain_action: false,
      secret_exposed: false
    }
  };
}

export function buildCrossSystemManufacturingReconciliation(qualityHold, progress) {
  const chain = progress?.chain ?? {};
  const erp = progress?.erp ?? {};
  const inventory = erp.inventory ?? {};
  const controls = qualityHold?.controls ?? {};
  const checks = {
    quality_hold_predecessor_matches: normalizeEvmAddress(qualityHold?.chain_anchor?.contract_address) === normalizeEvmAddress(chain.predecessor_registry),
    terminal_manufacture_anchor_present: chain.current_state === "MANUFACTURE_COMPLETED" && Boolean(chain.manufacture_completion_anchored),
    quality_release_predecessor_present: chain.predecessor_state === "QUALITY_RELEASE" && Boolean(chain.quality_release_anchored),
    erp_quality_inspection_submitted: erp.quality_inspection?.docstatus === 1 && erp.quality_inspection?.status === "Accepted",
    erp_manufacture_submitted: erp.manufacture?.docstatus === 1,
    erp_inventory_reconciled: inventory.wip_qty === "0.000" && inventory.finished_goods_qty === "25.000" && inventory.finished_goods_valuation_rate === "20.00" && inventory.finished_goods_stock_value === "500.00",
    inventory_cost_authority_preserved: controls.erp_is_inventory_cost_authority === true && progress?.boundaries?.erp_is_inventory_cost_authority === true,
    no_new_business_documents: progress?.boundaries?.new_business_documents === 0,
    no_inventory_tokenization_claim: controls.inventory_tokenization_claimed === false && progress?.boundaries?.inventory_tokenization_claimed === false
  };
  const failedChecks = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return {
    status: failedChecks.length === 0 ? "cross_system_manufacturing_reconciled" : "not_reconciled_fail_closed",
    evidence_id: "ARC-XERP-MFG-RECONCILIATION-V1",
    chain: {
      network: qualityHold?.chain_anchor?.network ?? progress?.network ?? null,
      chain_id: qualityHold?.chain_anchor?.chain_id ?? progress?.chain_id ?? null,
      quality_hold_registry: qualityHold?.chain_anchor?.contract_address ?? null,
      terminal_registry: chain.registry ?? null,
      terminal_transaction_hash: chain.transaction_hash ?? null,
      terminal_state: chain.current_state ?? null
    },
    erp: {
      quality_inspection_submitted: erp.quality_inspection?.docstatus === 1,
      manufacture_submitted: erp.manufacture?.docstatus === 1,
      wip_qty: inventory.wip_qty ?? null,
      finished_goods_qty: inventory.finished_goods_qty ?? null,
      finished_goods_valuation_rate: inventory.finished_goods_valuation_rate ?? null,
      finished_goods_stock_value: inventory.finished_goods_stock_value ?? null,
      stock_ledger_entry_count: inventory.stock_ledger_entry_count ?? null
    },
    checks,
    failed_checks: failedChecks,
    boundaries: {
      payment_claimed: false,
      inventory_tokenization_claimed: false,
      erp_cost_calculation_claimed: false,
      erp_write_exposed: false,
      wallet_or_chain_action: false,
      raw_erp_document_reference_exposed: false
    }
  };
}

export function buildManufacturingCloseImpactView(reconciliation, progress) {
  const inventory = progress?.erp?.inventory ?? {};
  const treatment = inventory.stock_account_treatment ?? {};
  const checks = {
    cross_system_reconciliation_passed: reconciliation?.status === "cross_system_manufacturing_reconciled",
    manufacture_terminal_state: reconciliation?.chain?.terminal_state === "MANUFACTURE_COMPLETED",
    submitted_erp_documents_confirmed: reconciliation?.erp?.quality_inspection_submitted === true && reconciliation?.erp?.manufacture_submitted === true,
    stock_ledger_present: Number(inventory.stock_ledger_entry_count) > 0,
    stock_value_reconciled: inventory.finished_goods_stock_value === "500.00",
    stock_account_treatment_confirmed: treatment.same_stock_account === true && treatment.net_gl_entries === 0,
    erp_cost_authority_preserved: progress?.boundaries?.erp_is_inventory_cost_authority === true,
    no_payment_or_period_close_execution: progress?.boundaries?.new_business_documents === 0
  };
  const failedChecks = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return {
    status: failedChecks.length === 0 ? "close_impact_read_only_reconciled" : "not_ready_fail_closed",
    evidence_id: "ARC-XERP-MFG-CLOSE-IMPACT-V1",
    close_impact: {
      inventory_position: {
        finished_goods_qty: inventory.finished_goods_qty ?? null,
        finished_goods_valuation_rate: inventory.finished_goods_valuation_rate ?? null,
        finished_goods_stock_value: inventory.finished_goods_stock_value ?? null,
        stock_ledger_entry_count: inventory.stock_ledger_entry_count ?? null
      },
      ledger_treatment: {
        same_stock_account: treatment.same_stock_account === true,
        net_gl_entries: treatment.net_gl_entries ?? null,
        explanation: treatment.explanation ?? null
      },
      reporting_boundary: "Read-only close/FP&A evidence. ERP remains the authority for valuation, SLE, GL, repost and period close."
    },
    checks,
    failed_checks: failedChecks,
    boundaries: {
      erp_period_closed: false,
      journal_entry_created: false,
      payment_claimed: false,
      inventory_tokenization_claimed: false,
      erp_cost_calculation_claimed: false,
      erp_write_exposed: false,
      wallet_or_chain_action: false,
      raw_erp_document_reference_exposed: false
    }
  };
}

export function buildManufacturingFinalityTimeline(qualityHold, progress, reconciliation) {
  const chain = progress?.chain ?? {};
  const erp = progress?.erp ?? {};
  const checks = {
    quality_hold_chain_fact_present: typeof qualityHold?.chain_anchor?.transaction_hash === "string",
    manufacture_completion_chain_fact_present: typeof chain.transaction_hash === "string" && chain.current_state === "MANUFACTURE_COMPLETED",
    state_transition_bound: chain.predecessor_state === "QUALITY_RELEASE" && chain.quality_release_anchored === true && chain.manufacture_completion_anchored === true,
    erp_result_reconciled: reconciliation?.status === "cross_system_manufacturing_reconciled",
    erp_cost_authority_preserved: progress?.boundaries?.erp_is_inventory_cost_authority === true
  };
  const failedChecks = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return {
    status: failedChecks.length === 0 ? "manufacturing_finality_timeline_reconciled" : "not_ready_fail_closed",
    evidence_id: "ARC-XERP-MFG-FINALITY-TIMELINE-V1",
    timeline: [
      { stage: "QUALITY_HOLD", source: "Arc Testnet", transaction_hash: qualityHold?.chain_anchor?.transaction_hash ?? null, registry: qualityHold?.chain_anchor?.contract_address ?? null, block_number: qualityHold?.chain_anchor?.block_number ?? null },
      { stage: "QUALITY_RELEASE", source: "Arc Testnet", transaction_hash: null, registry: chain.predecessor_registry ?? null, derived_from_terminal_predecessor: chain.predecessor_state === "QUALITY_RELEASE" && chain.quality_release_anchored === true },
      { stage: "MANUFACTURE_COMPLETED", source: "Arc Testnet", transaction_hash: chain.transaction_hash ?? null, registry: chain.registry ?? null, block_number: chain.block_number ?? null },
      { stage: "ERP_READBACK", source: "ERP authority", quality_inspection_submitted: erp.quality_inspection?.docstatus === 1, manufacture_submitted: erp.manufacture?.docstatus === 1, stock_ledger_entry_count: erp.inventory?.stock_ledger_entry_count ?? null }
    ],
    checks,
    failed_checks: failedChecks,
    boundaries: {
      quality_release_transaction_hash_disclosed: false,
      circle_subscription_created: false,
      erp_write_exposed: false,
      wallet_or_chain_action: false,
      inventory_tokenization_claimed: false
    }
  };
}

export function buildManufacturingReplayGuard(progress, reconciliation) {
  const chain = progress?.chain ?? {};
  const erp = progress?.erp ?? {};
  const checks = {
    terminal_chain_state_observed: chain.current_state === "MANUFACTURE_COMPLETED",
    completion_anchor_observed: chain.manufacture_completion_anchored === true && typeof chain.transaction_hash === "string",
    predecessor_bound: chain.predecessor_state === "QUALITY_RELEASE" && chain.quality_release_anchored === true,
    erp_result_reconciled: reconciliation?.status === "cross_system_manufacturing_reconciled",
    erp_cost_authority_preserved: progress?.boundaries?.erp_is_inventory_cost_authority === true
  };
  const failedChecks = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  const terminal = checks.terminal_chain_state_observed && checks.completion_anchor_observed;
  return {
    status: failedChecks.length === 0 ? "terminal_state_replay_blocked" : "state_guard_fail_closed",
    evidence_id: "ARC-XERP-MFG-REPLAY-GUARD-V1",
    decision: terminal ? "do_not_replay_prior_quality_release_or_manufacture_anchor" : "do_not_prepare_or_broadcast_a_chain_action",
    chain_fact: {
      network: progress?.network ?? null,
      chain_id: progress?.chain_id ?? null,
      current_state: chain.current_state ?? null,
      predecessor_state: chain.predecessor_state ?? null,
      registry: chain.registry ?? null,
      transaction_hash: chain.transaction_hash ?? null,
      block_number: chain.block_number ?? null
    },
    erp_authority: {
      quality_inspection_submitted: erp.quality_inspection?.docstatus === 1,
      manufacture_submitted: erp.manufacture?.docstatus === 1,
      finished_goods_qty: erp.inventory?.finished_goods_qty ?? null,
      valuation_rate: erp.inventory?.finished_goods_valuation_rate ?? null,
      inventory_cost_authority: "ERP SLE, valuation, repost, and GL"
    },
    checks,
    failed_checks: failedChecks,
    boundaries: {
      chain_action_requested: false,
      wallet_or_chain_action: false,
      erp_write_exposed: false,
      terminal_event_replayed: false,
      inventory_tokenization_claimed: false
    }
  };
}

export function buildSourceAssuranceExceptionQueue(reconciliation, qualityRelease, webhookReadiness) {
  const items = [];
  if (qualityRelease?.source_assurance?.quality_release_registry_circle_monitor !== "subscribed") {
    items.push({
      id: "CIRCLE_REGISTRY_MONITOR_PENDING",
      severity: "medium",
      source: "Circle Contracts",
      disposition: "human_action_required",
      detail: "The registry event is RPC-confirmed, but its Circle monitor has not been imported and subscribed."
    });
  }
  for (const blocker of webhookReadiness?.blockers ?? []) {
    items.push({
      id: `WEBHOOK_${String(blocker).toUpperCase()}`,
      severity: "high",
      source: "Circle webhook boundary",
      disposition: "fail_closed",
      detail: "No receiver or subscription is enabled by this public service."
    });
  }
  const checks = {
    chain_erp_reconciliation_passed: reconciliation?.status === "cross_system_manufacturing_reconciled",
    registry_monitor_pending_explicit: items.some((item) => item.id === "CIRCLE_REGISTRY_MONITOR_PENDING"),
    public_receiver_disabled: webhookReadiness?.guarantees?.endpoint_accepts_webhooks === false,
    no_erp_or_wallet_write: reconciliation?.boundaries?.erp_write_exposed === false && reconciliation?.boundaries?.wallet_or_chain_action === false
  };
  const failedChecks = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return {
    status: failedChecks.length === 0 ? "source_assurance_exceptions_visible" : "not_ready_fail_closed",
    evidence_id: "ARC-XERP-MFG-SOURCE-ASSURANCE-QUEUE-V1",
    open_exception_count: items.length,
    items,
    checks,
    failed_checks: failedChecks,
    boundaries: {
      auto_remediation: false,
      circle_resource_changed: false,
      erp_write_exposed: false,
      wallet_or_chain_action: false,
      secrets_exposed: false
    }
  };
}

export function buildProductionBoundaryView(wallet, appKit, exceptions) {
  const checks = {
    wallet_executor_not_exposed: wallet?.boundaries?.wallet_executor_exposed === false,
    custom_contract_call_not_enabled: appKit?.product_boundary?.custom_pay_calldata_supported === false,
    app_kit_runtime_not_enabled: appKit?.product_boundary?.app_kit_enabled_in_runtime === false,
    source_exceptions_visible: Number(exceptions?.open_exception_count) > 0,
    exception_auto_remediation_disabled: exceptions?.boundaries?.auto_remediation === false,
    erp_write_not_exposed: exceptions?.boundaries?.erp_write_exposed === false
  };
  const failedChecks = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return {
    status: failedChecks.length === 0 ? "production_boundary_enforced" : "not_ready_fail_closed",
    evidence_id: "ARC-PRODUCTION-BOUNDARY-V1",
    execution_mode: "read_only_public_surface",
    blocked_actions: ["wallet signing", "chain broadcast", "Circle subscription", "webhook receive", "ERP write", "App Kit custom contract call"],
    checks,
    failed_checks: failedChecks,
    boundaries: {
      production_deployed_claim: false,
      credential_present: false,
      wallet_or_chain_action: false,
      erp_write_exposed: false,
      circle_resource_changed: false
    }
  };
}

function json(response, status, body, method = "GET") {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...SECURITY_HEADERS
  });
  response.end(method === "HEAD" ? "" : `${JSON.stringify(body, null, 2)}\n`);
}

function text(response, status, body, contentType = "text/plain; charset=utf-8", method = "GET") {
  response.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store",
    "content-security-policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    ...SECURITY_HEADERS
  });
  response.end(method === "HEAD" ? "" : body);
}

async function readJsonBody(request, maxBytes = 64 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error("request_body_too_large");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const rawBody = Buffer.concat(chunks);
  try {
    return { rawBody, payload: JSON.parse(rawBody.toString("utf8")) };
  } catch {
    const error = new Error("invalid_json_body");
    error.statusCode = 400;
    throw error;
  }
}

function binary(response, status, body, contentType, method = "GET") {
  response.writeHead(status, {
    "content-type": contentType,
    "cache-control": "public, max-age=86400, immutable",
    ...SECURITY_HEADERS
  });
  response.end(method === "HEAD" ? "" : body);
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

export async function loadArcLabPortfolio(path = DEFAULT_ARC_LAB_PORTFOLIO_PATH) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function loadArcLabErpInteraction(path = DEFAULT_ARC_LAB_ERP_INTERACTION_PATH) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function loadManufacturingEvidence(path = DEFAULT_MANUFACTURING_EVIDENCE_PATH) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function loadManufacturingProgress(path = DEFAULT_MANUFACTURING_PROGRESS_PATH) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function loadWalletCapability(path = DEFAULT_WALLET_CAPABILITY_PATH) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function loadW4DualSource(path = DEFAULT_W4_DUAL_SOURCE_PATH) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function loadAppKitBoundary(path = DEFAULT_APP_KIT_BOUNDARY_PATH) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function loadPublicTraceTrail(path = DEFAULT_PUBLIC_TRACE_TRAIL_PATH) {
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
    dual_source: classifyEvidenceFreshness(dual.evidence_at ?? dual.generated_at, now),
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

export function buildQualityReleaseEvidenceView(progress, w4Dual) {
  const chain = progress.chain ?? {};
  const erp = progress.erp ?? {};
  const inventory = erp.inventory ?? {};
  const releaseConfirmed = chain.current_state === "QUALITY_RELEASE"
    && chain.quality_release_anchored === true
    && typeof chain.transaction_hash === "string"
    && typeof chain.registry === "string";
  const manufactureCompleted = chain.current_state === "MANUFACTURE_COMPLETED"
    && chain.quality_release_anchored === true
    && chain.manufacture_completion_anchored === true
    && typeof chain.transaction_hash === "string"
    && typeof chain.registry === "string";

  return {
    schema_version: "1.0",
    evidence_id: "ARC-XERP-MFG-02-QUALITY-RELEASE-PUBLIC",
    status: (releaseConfirmed || manufactureCompleted)
      ? "rpc_confirmed_circle_registry_monitor_pending"
      : "release_evidence_incomplete",
    chain_fact: {
      network: progress.network,
      chain_id: progress.chain_id,
      state: chain.current_state ?? null,
      predecessor_state: chain.predecessor_state ?? null,
      registry: chain.registry ?? null,
      transaction_hash: chain.transaction_hash ?? null,
      block_number: chain.block_number ?? null,
      zero_value_evidence_control: true
    },
    canonical_event: {
      event_type: manufactureCompleted ? "manufacturing_completed" : "manufacturing_quality_release",
      business_meaning: manufactureCompleted
        ? "Manufacture-completion evidence for an ERP-authoritative manufacturing result."
        : "Quality release evidence for an ERP-authoritative manufacturing result.",
      finality_status: (releaseConfirmed || manufactureCompleted) ? "rpc_confirmed" : "not_confirmed"
    },
    erp_authority: {
      quality_inspection_status: erp.quality_inspection?.status ?? null,
      quality_inspection_docstatus: erp.quality_inspection?.docstatus ?? null,
      manufacture_docstatus: erp.manufacture?.docstatus ?? null,
      wip_qty: inventory.wip_qty ?? null,
      finished_goods_qty: inventory.finished_goods_qty ?? null,
      finished_goods_valuation_rate: inventory.finished_goods_valuation_rate ?? null,
      stock_ledger_entry_count: inventory.stock_ledger_entry_count ?? null,
      inventory_cost_authority: "ERP SLE, valuation, repost, and GL"
    },
    source_assurance: {
      historical_receipt_circle_rpc_status: w4Dual.status,
      historical_receipt_overlap_events: w4Dual.counts?.circle_in_overlap_window ?? null,
      quality_release_registry_circle_monitor: "not_imported_or_subscribed",
      required_next_action: "CIRCLE-MFG-02-IMPORT-SUBSCRIBE requires exact action-time confirmation"
    },
    negative_controls: {
      payment_claimed: false,
      inventory_tokenization_claimed: false,
      erp_posting_claimed: false,
      erp_write_exposed: false,
      wallet_executor_exposed: false,
      secret_or_raw_payload_exposed: false
    }
  };
}

export function createReceiptServer(options = {}) {
  const loadReport = options.loadReport ?? (() => loadEvidence(options.evidencePath));
  const loadDualReport = options.loadDualReport ?? (() => loadDualEvidence(options.dualEvidencePath));
  const loadCircleReport = options.loadCircleReport ?? (() => loadCircleSnapshot(options.circleSnapshotPath));
  const loadEnterpriseReport = options.loadEnterpriseReport ?? (() => loadEnterpriseEvidence(options.enterpriseEvidencePath));
  const loadViewer = options.loadViewer ?? (() => readFile(options.viewerPath ?? DEFAULT_VIEWER_PATH, "utf8"));
  const loadArcLabViewer = options.loadArcLabViewer ?? (() => readFile(options.arcLabViewerPath ?? DEFAULT_ARC_LAB_VIEWER_PATH, "utf8"));
  const loadArcLab = options.loadArcLab ?? (() => loadArcLabPortfolio(options.arcLabPortfolioPath));
  const loadArcLabErp = options.loadArcLabErp ?? (() => loadArcLabErpInteraction(options.arcLabErpInteractionPath));
  const loadManufacturing = options.loadManufacturing ?? (() => loadManufacturingEvidence(options.manufacturingEvidencePath));
  const loadManufacturingProgressReport = options.loadManufacturingProgressReport ?? (() => loadManufacturingProgress(options.manufacturingProgressPath));
  const loadWalletRecovery = options.loadWalletRecovery ?? (() => loadWalletCapability(options.walletCapabilityPath));
  const loadW4Dual = options.loadW4Dual ?? (() => loadW4DualSource(options.w4DualSourcePath));
  const loadAppKit = options.loadAppKit ?? (() => loadAppKitBoundary(options.appKitBoundaryPath));
  const loadPublicTrace = options.loadPublicTrace ?? (() => loadPublicTraceTrail(options.publicTraceTrailPath));
  const loadDeliverySurfaces = options.loadDeliverySurfaces ?? (() => loadJson(options.deliverySurfacesPath ?? DEFAULT_DELIVERY_SURFACES_PATH));
  const loadLogo = options.loadLogo ?? (() => readFile(options.logoPath ?? DEFAULT_LOGO_PATH));
  const loadFavicon = options.loadFavicon ?? (() => readFile(options.faviconPath ?? DEFAULT_FAVICON_PATH));
  const circleWebhookProcessor = options.circleWebhookProcessor ?? createCircleWebhookProcessor({
    environment: options.environment ?? process.env,
    policy: { ...CIRCLE_WEBHOOK_READINESS_POLICY, enabled: true, durableQueueAvailable: true },
    durableQueue: options.circleWebhookDurableQueue,
    idempotencyStore: options.circleWebhookIdempotencyStore
  });
  const now = options.now ?? (() => Date.now());

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      if (request.method === "POST" && url.pathname === "/api/v1/circle-webhook") {
        const { rawBody, payload } = await readJsonBody(request);
        const result = await circleWebhookProcessor({ rawBody, payload, headers: request.headers });
        json(response, result.status, result, request.method);
        return;
      }
      if (!["GET", "HEAD"].includes(request.method)) {
        json(response, 405, { error: "method_not_allowed" }, request.method);
        return;
      }

      if (url.pathname === "/" || url.pathname === "/arc-payment-receipt") {
        text(response, 200, await loadViewer(), "text/html; charset=utf-8", request.method);
        return;
      }

      if (url.pathname === "/arc-lab" || url.pathname === "/enterprise-os") {
        text(response, 200, await loadArcLabViewer(), "text/html; charset=utf-8", request.method);
        return;
      }

      if (url.pathname === "/assets/payment-receipt-logo.png") {
        binary(response, 200, await loadLogo(), "image/png", request.method);
        return;
      }

      if (url.pathname === "/assets/favicon.png") {
        binary(response, 200, await loadFavicon(), "image/png", request.method);
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
        }, request.method);
        return;
      }

      if (url.pathname === "/healthz") {
        const [report, dual, circle, enterprise, arcLab] = await Promise.all([
          loadReport(),
          loadDualReport(),
          loadCircleReport(),
          loadEnterpriseReport(),
          loadArcLab()
        ]);
        json(response, 200, {
          status: "ok",
          mode: "read-only",
          service: arcLab.service,
          standard_id: arcLab.standard_id,
          product: arcLab.product,
          execution_identity: arcLab.execution_identity,
          legacy_payment_receipt: {
            contract: report.contract,
            event_count: report.event_count,
            latest_scanned_block: report.range.to,
            dual_source_status: dual.status,
            circle_subscription_state: circle.subscription_state,
            webhook_active: circle.webhook_active,
            evidence_manifest_digest: buildSettlementEvidenceManifest(enterprise).integrity.digest
          },
          e1_controls: arcLab.e1_controls,
          evidence_freshness: buildEvidenceFreshnessView(report, dual, circle, enterprise, now())
        }, request.method);
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

      if (url.pathname === "/api/arc-lab-portfolio" || url.pathname === "/api/v1/topology") {
        const [arcLab, erpInteraction] = await Promise.all([loadArcLab(), loadArcLabErp()]);
        json(response, 200, {
          ...arcLab,
          erp_interaction_summary: {
            status: erpInteraction.status,
            c0: erpInteraction.c0,
            d09_treasury_reconciliation: erpInteraction.d09_treasury_reconciliation,
            next_gates: erpInteraction.next_gates
          }
        }, request.method);
        return;
      }

      if (url.pathname === "/api/v1/erp-interaction") {
        json(response, 200, await loadArcLabErp(), request.method);
        return;
      }

      if (url.pathname === "/api/v1/manufacturing-evidence") {
        json(response, 200, await loadManufacturing(), request.method);
        return;
      }

      if (url.pathname === "/api/v1/manufacturing-progress") {
        json(response, 200, await loadManufacturingProgressReport(), request.method);
        return;
      }

      if (url.pathname === "/api/v1/quality-release-evidence") {
        const [progress, w4Dual] = await Promise.all([loadManufacturingProgressReport(), loadW4Dual()]);
        json(response, 200, buildQualityReleaseEvidenceView(progress, w4Dual), request.method);
        return;
      }

      if (url.pathname === "/api/v1/cross-system-manufacturing-reconciliation") {
        const [qualityHold, progress] = await Promise.all([loadManufacturing(), loadManufacturingProgressReport()]);
        json(response, 200, buildCrossSystemManufacturingReconciliation(qualityHold, progress), request.method);
        return;
      }

      if (url.pathname === "/api/v1/manufacturing-close-impact") {
        const [qualityHold, progress] = await Promise.all([loadManufacturing(), loadManufacturingProgressReport()]);
        const reconciliation = buildCrossSystemManufacturingReconciliation(qualityHold, progress);
        json(response, 200, buildManufacturingCloseImpactView(reconciliation, progress), request.method);
        return;
      }

      if (url.pathname === "/api/v1/manufacturing-finality-timeline") {
        const [qualityHold, progress] = await Promise.all([loadManufacturing(), loadManufacturingProgressReport()]);
        const reconciliation = buildCrossSystemManufacturingReconciliation(qualityHold, progress);
        json(response, 200, buildManufacturingFinalityTimeline(qualityHold, progress, reconciliation), request.method);
        return;
      }

      if (url.pathname === "/api/v1/manufacturing-replay-guard") {
        const [qualityHold, progress] = await Promise.all([loadManufacturing(), loadManufacturingProgressReport()]);
        const reconciliation = buildCrossSystemManufacturingReconciliation(qualityHold, progress);
        json(response, 200, buildManufacturingReplayGuard(progress, reconciliation), request.method);
        return;
      }

      if (url.pathname === "/api/v1/source-assurance-exceptions") {
        const [qualityHold, progress] = await Promise.all([loadManufacturing(), loadManufacturingProgressReport()]);
        const reconciliation = buildCrossSystemManufacturingReconciliation(qualityHold, progress);
        const qualityRelease = buildQualityReleaseEvidenceView(progress, await loadW4Dual());
        json(response, 200, buildSourceAssuranceExceptionQueue(reconciliation, qualityRelease, buildCircleWebhookPublicView()), request.method);
        return;
      }

      if (url.pathname === "/api/v1/production-boundary") {
        const [qualityHold, progress, wallet, appKit] = await Promise.all([loadManufacturing(), loadManufacturingProgressReport(), loadWalletRecovery(), loadAppKit()]);
        const reconciliation = buildCrossSystemManufacturingReconciliation(qualityHold, progress);
        const qualityRelease = buildQualityReleaseEvidenceView(progress, await loadW4Dual());
        const exceptions = buildSourceAssuranceExceptionQueue(reconciliation, qualityRelease, buildCircleWebhookPublicView());
        json(response, 200, buildProductionBoundaryView(wallet, appKit, exceptions), request.method);
        return;
      }

      if (url.pathname === "/api/v1/wallet-capability") {
        json(response, 200, await loadWalletRecovery(), request.method);
        return;
      }

      if (url.pathname === "/api/v1/w4-dual-source") {
        json(response, 200, await loadW4Dual(), request.method);
        return;
      }

      if (url.pathname === "/api/v1/app-kit-boundary") {
        json(response, 200, await loadAppKit(), request.method);
        return;
      }

      if (url.pathname === "/api/v1/public-trace-trail") {
        json(response, 200, await loadPublicTrace(), request.method);
        return;
      }

      if (url.pathname === "/api/v1/delivery-surfaces") {
        json(response, 200, await loadDeliverySurfaces(), request.method);
        return;
      }

      if (url.pathname === "/api/v1/circle-webhook-readiness") {
        json(response, 200, buildCircleWebhookPublicView(), request.method);
        return;
      }

      if (url.pathname === "/api/v1/evidence") {
        const [report, dual, circle, enterprise, arcLab] = await Promise.all([
          loadReport(),
          loadDualReport(),
          loadCircleReport(),
          loadEnterpriseReport(),
          loadArcLab()
        ]);
        json(response, 200, {
          status: "read_only_sanitized_e1_evidence",
          standard_id: arcLab.standard_id,
          service: arcLab.service,
          product: arcLab.product,
          execution_identity: arcLab.execution_identity,
          checks: {
            no_secret_or_credential_required: !arcLab.e1_controls.erp_credential_present,
            no_erp_write: !arcLab.e1_controls.erp_write_enabled,
            no_wallet_or_chain_action: !arcLab.e1_controls.wallet_connection_enabled && !arcLab.e1_controls.chain_transaction_enabled,
            no_second_arc_service: !arcLab.service.create_second_arc_service,
            payment_component_is_not_umbrella: arcLab.product.payment_component_is_umbrella === false,
            render_free_tier_only: arcLab.service.cost_policy.includes("free"),
            public_git_publication_excluded: !arcLab.e1_controls.git_publication_authorized_in_current_scope,
            render_deploy_executed: arcLab.e1_controls.render_deploy_executed_in_current_scope
          },
          legacy_payment_receipt: {
            contract: report.contract,
            event_count: report.event_count,
            dual_source_status: dual.status,
            circle_subscription_state: circle.subscription_state,
            evidence_manifest_digest: buildSettlementEvidenceManifest(enterprise).integrity.digest
          },
          coverage_summary: arcLab.coverage_summary,
          deployment_blocker_if_not_deployed: arcLab.deployment_blocker_if_not_deployed,
          rollback: arcLab.rollback
        }, request.method);
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
      const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
      json(response, status, { error: status === 500 ? "internal_error" : error.message });
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
    else if (argv[index] === "--arc-lab-portfolio") { options.arcLabPortfolioPath = resolve(value); index += 1; }
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
