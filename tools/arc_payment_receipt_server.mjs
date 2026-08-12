#!/usr/bin/env node

import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  buildCircleConsoleReceipt,
  buildCircleConsoleReceiptPolicy,
  buildCircleConsoleReceiptReadiness,
  buildCircleConsoleTrustedReadbackContract,
  buildCircleWebhookPolicy,
  buildCircleWebhookReadiness,
  buildCircleWebhookRuntimePolicy,
  DEFAULT_CIRCLE_WEBHOOK_RELEASE_BINDING,
  createCircleWebhookProcessor,
  createCircleConsoleTrustedReadbackLoader,
  isValidCircleWebhookPublicKey
} from "./circle_contract_webhook_gate.mjs";
import { createCircleWebhookStore } from "./circle_webhook_store.mjs";
import {
  currentMvpContentType,
  resolveCurrentMvpRequest
} from "./current_mvp_source_binding.mjs";
import { bindVerifiedEmbeddedErpProjectionToPublicRelease } from "./current_mvp_erp_readiness.mjs";
import { CURRENT_ERP_VERIFIED_READ_ONLY_EVIDENCE } from "../current-mvp/web/workbench/workbench-projection.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_EVIDENCE_PATH = resolve(HERE, "../outputs/ArcPaymentReceipt_event_monitor_latest.json");
export const DEFAULT_DUAL_EVIDENCE_PATH = resolve(HERE, "../outputs/ArcPaymentReceipt_dual_source_monitor_latest.json");
export const DEFAULT_CIRCLE_SNAPSHOT_PATH = resolve(HERE, "../outputs/ArcCircleContracts_event_history_latest.json");
export const DEFAULT_ENTERPRISE_EVIDENCE_PATH = resolve(HERE, "../outputs/ArcPaymentReceipt_enterprise_k0_latest.json");
export const DEFAULT_VIEWER_PATH = resolve(HERE, "arc_payment_receipt_viewer.html");
export const DEFAULT_ARC_LAB_VIEWER_PATH = resolve(HERE, "arc_lab_enterprise_os_viewer.html");
export const DEFAULT_ARC_LAB_REVIEW_DECK_PATH = resolve(HERE, "arc_lab_review_deck.html");
export const DEFAULT_ARC_LAB_EVIDENCE_EXPLORER_PATH = resolve(HERE, "arc_lab_evidence_explorer.html");
export const DEFAULT_ARC_LAB_PROVENANCE_LEDGER_PATH = resolve(HERE, "arc_lab_provenance_ledger.html");
export const DEFAULT_ARC_LAB_REVIEWER_CHECKLIST_PATH = resolve(HERE, "arc_lab_reviewer_checklist.html");
export const DEFAULT_ARC_LAB_RELEASE_WATCH_PATH = resolve(HERE, "arc_lab_release_watch.html");
export const DEFAULT_ARC_LAB_CONTROL_TIMELINE_PATH = resolve(HERE, "arc_lab_control_timeline.html");
export const DEFAULT_ARC_LAB_RELEASE_EVIDENCE_ANCHOR_PATH = resolve(HERE, "arc_lab_release_evidence_anchor.html");
export const DEFAULT_ARC_LAB_PORTFOLIO_PATH = resolve(HERE, "../config/arc_lab_enterprise_os_e1_read_only_shell_v1.json");
export const DEFAULT_ARC_LAB_ERP_INTERACTION_PATH = resolve(HERE, "../config/arc_lab_erp_interaction_public_v1.json");
export const DEFAULT_MANUFACTURING_EVIDENCE_PATH = resolve(HERE, "../outputs/Arc_XERP_MFG_01_local_evidence.json");
export const DEFAULT_MANUFACTURING_PROGRESS_PATH = resolve(HERE, "../outputs/Arc_XERP_MFG_02_progress_public.json");
export const DEFAULT_WALLET_CAPABILITY_PATH = resolve(HERE, "../outputs/Arc_Wallet_Capability_Recovery_public.json");
export const DEFAULT_W4_DUAL_SOURCE_PATH = resolve(HERE, "../outputs/Arc_W4_dual_source_monitor_aligned_20260726.json");
export const DEFAULT_APP_KIT_BOUNDARY_PATH = resolve(HERE, "../outputs/Arc_App_Kit_Integration_Boundary_public.json");
export const DEFAULT_PUBLIC_TRACE_TRAIL_PATH = resolve(HERE, "../outputs/Arc_Public_Trace_Trail_v1.json");
export const DEFAULT_DELIVERY_SURFACES_PATH = resolve(HERE, "../config/public_delivery_surfaces_v1.json");
export const DEFAULT_AGENT_IDENTITY_PATH = resolve(HERE, "../outputs/Arc_ERC8004_Agent_Identity_public.json");
export const DEFAULT_AGENT_REGISTRATION_PATH = resolve(HERE, "../agent-registration.json");
export const DEFAULT_AGENT_REGISTRATION_RECEIPT_PATH = resolve(HERE, "../outputs/Arc_ERC8004_Agent_Registration_Receipt_public.json");
export const DEFAULT_EXTERNAL_ROUTE_INTAKE_PATH = resolve(HERE, "../outputs/Arc_External_Route_Intake_Boundary_public.json");
export const DEFAULT_RELEASE_EVIDENCE_ANCHOR_PACKET_PATH = resolve(HERE, "../outputs/Arc_Lab_Release_Evidence_Anchor_20260731.json");
export const DEFAULT_RELEASE_DELIVERY_ATTESTATION_PATH = resolve(HERE, "../outputs/Arc_Lab_Release_Delivery_Attestation_20260731.json");
export const DEFAULT_ARC_LAB_RELEASE_DELIVERY_ATTESTATION_PATH = resolve(HERE, "arc_lab_release_delivery_attestation.html");
export const CURRENT_POLICY_SETTLEMENT_CONTRACT = "0xc7682649a1aa60d0f74825ad2b812ee062178047";
export const CURRENT_POLICY_CREATED_EVENT = "PolicyCreated(bytes32,address,address,address,uint256,bytes32,bytes32,uint64,uint64)";
export const DEFAULT_ARC_LAB_AGENT_REGISTRATION_RECEIPT_PATH = resolve(HERE, "arc_lab_agent_registration_receipt.html");
export const DEFAULT_LOGO_PATH = resolve(HERE, "../assets/payment-receipt-logo.png");
export const DEFAULT_FAVICON_PATH = resolve(HERE, "../assets/favicon.png");
export const DEFAULT_FINAL_ASSETS_EVIDENCE_PATH = resolve(HERE, "../current-mvp/current-release-final-assets-evidence.json");
export const DEFAULT_CURRENT_ARC_TESTNET_READBACK_PATH = resolve(HERE, "../outputs/Arc_Current_Release_PolicySettlementV1_Readback.json");
export const PUBLIC_POST_ROUTES = Object.freeze([
  "/api/v1/circle-webhook",
  "/api/v1/opening-balance-fixture-validate"
]);

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
  contractAddress: CURRENT_POLICY_SETTLEMENT_CONTRACT,
  eventSignature: CURRENT_POLICY_CREATED_EVENT,
  eventTopic: "0x18a40807aa0569234a6f9202ddaab5639334547426c0cb66915bb5e5779b53ec",
  blockchain: "ARC-TESTNET",
  requireTypedEvent: true
});

export function buildCircleWebhookPublicView(environment = {}, options = {}) {
  const runtime = buildCircleWebhookRuntimePolicy(environment);
  const readiness = buildCircleWebhookReadiness(buildCircleWebhookPolicy({
    ...CIRCLE_WEBHOOK_READINESS_POLICY,
    enabled: runtime.enabled,
    durableQueueAvailable: runtime.configured.store_path_persistent === true,
    storePathPersistent: runtime.configured.store_path_persistent,
    verificationKeyPresent: runtime.configured.verification_key_present
  }));
  const blockers = [...new Set([...runtime.blockers, ...readiness.blockers])];
  if (options.storeInitialized === false && runtime.configured.store_path_persistent === true) blockers.push("durable_store_initialization_failed");
  if (options.verificationKeyValid === false) blockers.push("verification_key_invalid");
  return {
    ...readiness,
    status: blockers.length ? "not_ready_fail_closed" : "ready_for_circle_console_subscription",
    blockers,
    surface: "read_only_configuration_boundary",
    next_owner_action: "Provide a persistent JSONL store, verification key and explicit Circle Console subscription authorization.",
    guarantees: {
      endpoint_accepts_webhooks: blockers.length === 0,
      circle_subscription_created: false,
      circle_resource_changed: false,
      erp_write: false,
      wallet_or_chain_action: false,
      secret_exposed: false
    }
  };
}

export function buildCircleConsoleReceiptReadinessView(policy, { trustedReadbackLoaderAvailable = false, trustedReadbackContract = null } = {}) {
  const validatorReadiness = buildCircleConsoleReceiptReadiness(policy ?? buildCircleConsoleReceiptPolicy());
  const contract = trustedReadbackContract;
  const blockers = contract ? [...contract.blockers] : [...validatorReadiness.blockers];
  if (!contract && !trustedReadbackLoaderAvailable) blockers.push("trusted_readback_loader_not_configured");
  return {
    schema: "arc.circle-console-receipt-readiness.v1",
    surface: "circle_console",
    status: contract ? contract.status : (blockers.length === 0 ? "ready_for_trusted_circle_console_readback" : "not_ready_fail_closed"),
    blockers,
    policy_binding: {
      chain_id: Number(policy?.chainId ?? 5042002),
      contract_address: policy?.contractAddress || null,
      event_signature: policy?.eventSignature || null,
      event_topic_required: Boolean(policy?.eventTopic),
      subscription_id_present: Boolean(policy?.subscriptionId),
      release_commit: policy?.releaseCommit || null
    },
    trusted_readback_contract: contract ? {
      schema: contract.schema,
      status: contract.status,
      blockers: contract.blockers,
      read_history: contract.read_history,
      loader: contract.loader
    } : null,
    boundaries: {
      read_only: true,
      accepts_caller_supplied_receipt: false,
      trusted_server_readback_required: true,
      historical_evidence_can_satisfy_current_release: false,
      creates_circle_resource: false,
      persists_receipt: false,
      wallet_or_chain_write: false,
      erp_write: false
    }
  };
}

export function buildCircleConsoleReceiptVerificationView(input, policy, readiness) {
  const effectiveReadiness = readiness ?? buildCircleConsoleReceiptReadinessView(policy);
  if (effectiveReadiness.status !== "ready_for_trusted_circle_console_readback") {
    return {
      accepted: false,
      errors: ["circle_console_receipt_verifier_not_ready", ...effectiveReadiness.blockers],
      receipt: null,
      readiness: effectiveReadiness,
      boundaries: effectiveReadiness.boundaries
    };
  }
  const verification = buildCircleConsoleReceipt(input, policy);
  return {
    ...verification,
    readiness: effectiveReadiness,
    boundaries: effectiveReadiness.boundaries
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
  const rawBody = await readRawBody(request, maxBytes);
  try {
    return { rawBody, payload: JSON.parse(rawBody.toString("utf8")) };
  } catch {
    const error = new Error("invalid_json_body");
    error.statusCode = 400;
    throw error;
  }
}

async function readRawBody(request, maxBytes = 64 * 1024) {
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
  return rawBody;
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

const DISCLOSURE_SENSITIVE_FIELD = /(?:^|[_-])(secret|private[_-]?key|mnemonic|seed|credential|cookie|api[_-]?key)(?:$|[_-])/i;
const DISCLOSURE_SENSITIVE_VALUE = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9_-]+\b/,
  /\bBearer\s+[A-Za-z0-9._~+\/-]+=*\b/i,
  /(?:^|[\s"'])\/(?:Users|home|var|private|tmp)\/[\S]+/
];

function disclosureValueIsEmpty(value) {
  return value === false || value === null || value === undefined || value === "";
}

function collectDisclosureFindings(value, document, path = "$", findings = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectDisclosureFindings(item, document, `${path}[${index}]`, findings));
    return findings;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      const itemPath = `${path}.${key}`;
      if (DISCLOSURE_SENSITIVE_FIELD.test(key) && !disclosureValueIsEmpty(item)) {
        findings.push({ document, path: itemPath, category: "sensitive_field_has_value" });
      }
      collectDisclosureFindings(item, document, itemPath, findings);
    }
    return findings;
  }
  if (typeof value === "string" && DISCLOSURE_SENSITIVE_VALUE.some((pattern) => pattern.test(value))) {
    findings.push({ document, path, category: "sensitive_value_pattern" });
  }
  return findings;
}

/**
 * Audits a bounded set of public JSON documents before they are offered as
 * reviewer-facing API surfaces.  It reports field locations only: potential
 * sensitive values are never echoed back into the response or logs.
 */
export function buildPublicDisclosureAuditView(documents) {
  const entries = Object.entries(documents ?? {});
  const findings = entries.flatMap(([name, document]) => collectDisclosureFindings(document, name));
  return {
    mode: "read-only_public_disclosure_boundary_audit",
    audit_id: "ARC-PUBLIC-DISCLOSURE-BOUNDARY-V1",
    status: findings.length === 0 ? "bounded_public_documents_clear" : "review_required_fail_closed",
    reviewed_documents: entries.map(([name, document]) => ({
      name,
      content_sha256: createHash("sha256").update(JSON.stringify(document)).digest("hex")
    })),
    findings,
    summary: {
      document_count: entries.length,
      prohibited_value_findings: findings.length,
      review_required: findings.length > 0
    },
    boundaries: {
      scans_only_the_listed_public_json_documents: true,
      returns_sensitive_values: false,
      proves_no_secret_exists_elsewhere: false,
      authorizes_wallet_or_chain_action: false,
      authorizes_erp_or_circle_action: false
    }
  };
}

/**
 * Checks whether independently published boundary documents still agree on
 * their safe, read-only operating posture.  Unlike the disclosure audit, this
 * validates declared controls rather than searching document values.
 */
export function buildPublicBoundaryConsistencyView({ agentIdentity, externalRouteIntake, deliverySurfaces, publicTrace }) {
  const identity = agentIdentity?.boundaries ?? {};
  const external = externalRouteIntake?.boundaries ?? {};
  const decision = externalRouteIntake?.product_decision ?? {};
  const rules = deliverySurfaces?.rules ?? {};
  const trace = publicTrace?.boundaries ?? {};
  const checks = {
    github_and_render_must_share_a_release: rules.github_render_same_release === true && rules.one_lifecycle_one_outcome === true,
    identity_never_enables_a_wallet: identity.wallet_connection === false && identity.signer_or_key_present === false && identity.chain_transaction_enabled === false,
    external_recovery_route_is_not_new_funding: decision.accept_as_new_funding_route === false && external.wallet_connection_or_signature_performed === false && external.new_base_deposit_performed === false && external.arc_transaction_performed === false,
    external_route_never_becomes_evidence_authority: decision.accept_as_arc_chain_fact === false && decision.accept_as_circle_or_erp_authority === false && decision.accept_as_payment_receipt_evidence === false,
    public_trail_excludes_unverified_activity: trace.duplicate_facts_collapsed === true && trace.preflight_or_local_test_counted === false && trace.public_claims_limited_to_verifiable_outcomes === true,
    public_trail_exposes_no_erp_or_wallet_executor: trace.wallet_executor_exposed === false && trace.erp_raw_payload_exposed === false
  };
  const failedChecks = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return {
    mode: "read-only_public_boundary_consistency_gate",
    gate_id: "ARC-PUBLIC-BOUNDARY-CONSISTENCY-V1",
    status: failedChecks.length === 0 ? "public_boundaries_consistent" : "boundary_inconsistency_review_required",
    checks,
    failed_checks: failedChecks,
    decision: {
      reviewer_read_only_admission: failedChecks.length === 0,
      wallet_or_chain_action_authorized: false,
      erp_or_circle_action_authorized: false
    },
    boundaries: {
      validates_declared_controls_only: true,
      verifies_external_provider_truth: false,
      replaces_action_time_owner_review: false
    }
  };
}

/**
 * Builds a content-addressed, reviewer-facing handoff from existing Arc,
 * ERP, and delivery-boundary readbacks. It is a navigation surface only and
 * never turns historical evidence into permission to write to any system.
 */
export function buildReviewerEvidencePack({ qualityHold, manufacturingProgress, wallet, appKit, agentIdentity, externalRouteIntake, deliverySurfaces, publicTrace }) {
  const deliveryList = Array.isArray(deliverySurfaces?.surfaces) ? deliverySurfaces.surfaces : [];
  const deliveryRoles = deliverySurfaces?.surfaces && !Array.isArray(deliverySurfaces.surfaces) ? deliverySurfaces.surfaces : {};
  const githubSurface = deliveryList.find((surface) => surface.id === "github");
  const renderSurface = deliveryList.find((surface) => surface.id === "render");
  const reconciliation = buildCrossSystemManufacturingReconciliation(qualityHold, manufacturingProgress);
  const qualityRelease = buildQualityReleaseEvidenceView(manufacturingProgress, { status: "historical_source_separated" });
  const exceptions = buildSourceAssuranceExceptionQueue(reconciliation, qualityRelease, buildCircleWebhookPublicView());
  const productionBoundary = buildProductionBoundaryView(wallet, appKit, exceptions);
  const boundaryConsistency = buildPublicBoundaryConsistencyView({ agentIdentity, externalRouteIntake, deliverySurfaces, publicTrace });
  const disclosure = buildPublicDisclosureAuditView({
    agent_identity: agentIdentity,
    external_route_intake: externalRouteIntake,
    delivery_surfaces: deliverySurfaces,
    public_trace: publicTrace
  });
  const checks = {
    manufacturing_evidence_reconciled: reconciliation.status === "cross_system_manufacturing_reconciled",
    public_boundaries_consistent: boundaryConsistency.decision.reviewer_read_only_admission === true,
    public_documents_clear: disclosure.status === "bounded_public_documents_clear",
    production_write_paths_disabled: productionBoundary.boundaries?.wallet_or_chain_action === false
      && productionBoundary.boundaries?.erp_write_exposed === false
      && productionBoundary.boundaries?.circle_resource_changed === false
  };
  const failedChecks = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  const payload = {
    mode: "read-only_reviewer_evidence_pack",
    pack_id: "ARC-AAL-REVIEWER-EVIDENCE-PACK-V1",
    status: failedChecks.length === 0 ? "reviewer_pack_ready" : "reviewer_pack_review_required",
    checks,
    failed_checks: failedChecks,
    evidence: {
      manufacturing: {
        status: reconciliation.status,
        terminal_state: reconciliation.chain.terminal_state,
        erp_quality_inspection_submitted: reconciliation.erp.quality_inspection_submitted,
        erp_manufacture_submitted: reconciliation.erp.manufacture_submitted,
        finished_goods_stock_value: reconciliation.erp.finished_goods_stock_value
      },
      delivery: {
        github: githubSurface?.url ?? (deliveryRoles.github ? "https://github.com/gaysonloser/arc-payment-receipt" : null),
        render: renderSurface?.url ?? (deliveryRoles.render ? "https://arc-payment-receipt.onrender.com/" : null),
        github_render_same_release_required: deliverySurfaces?.cross_surface_rules?.github_render_same_release_fingerprint === true
          || deliverySurfaces?.rules?.github_render_same_release === true
      },
      controls: {
        reviewer_read_only_admission: boundaryConsistency.decision.reviewer_read_only_admission,
        disclosure_review_required: disclosure.summary.review_required,
        unresolved_source_assurance_items: exceptions.open_exception_count ?? 0,
        production_write_authorized: false
      }
    },
    boundaries: {
      read_only: true,
      creates_erp_document: false,
      creates_circle_subscription: false,
      wallet_or_chain_action: false,
      content_digest_is_not_a_signature: true,
      historical_evidence_is_not_current_state_authorization: true
    }
  };
  return {
    ...payload,
    content_sha256: createHash("sha256").update(JSON.stringify(canonicalizeJson(payload))).digest("hex")
  };
}

/**
 * Makes the current hackathon handoff legible without claiming that missing
 * materials, a new chain action, or a submission itself have been completed.
 */
const FINAL_ASSET_EXPECTATIONS = Object.freeze({
  final_demo_video: { format: "mp4", name: "arc-enterprise-settlement-control-programme-final-3min.mp4" },
  final_deck_pdf: { format: "pdf", name: "Arc_Enterprise_Settlement_Programme_Deck_Current_V3.pdf" },
  final_deck_pptx: { format: "pptx", name: "Arc_Enterprise_Settlement_Programme_Deck_Current_V3.pptx" }
});

function isSha256(value) { return typeof value === "string" && /^[0-9a-f]{64}$/.test(value); }

export function validateFinalAssetsEvidence(evidence) {
  const errors = [];
  if (evidence?.schema !== "arc-erp.current-release-final-assets-evidence.v1") errors.push("schema_invalid");
  if (evidence?.source !== "public_github_release_readback") errors.push("source_not_public_release_readback");
  if (evidence?.release_id !== "verified-milestone-close-current-mvp-workbench-rc1") errors.push("release_id_invalid");
  if (evidence?.tag !== "programme-final-20260810") errors.push("tag_invalid");
  const releaseUrl = "https://github.com/gaysonloser/arc-payment-receipt/releases/tag/programme-final-20260810";
  if (evidence?.release_url !== releaseUrl) errors.push("release_url_invalid");
  if (!Array.isArray(evidence?.assets)) errors.push("assets_array_required");
  const byKind = new Map((evidence?.assets ?? []).map((asset) => [asset?.kind, asset]));
  for (const [kind, expected] of Object.entries(FINAL_ASSET_EXPECTATIONS)) {
    const asset = byKind.get(kind);
    if (!asset) { errors.push(`asset_missing:${kind}`); continue; }
    if (asset.format !== expected.format || asset.name !== expected.name) errors.push(`asset_identity_invalid:${kind}`);
    const expectedUrl = `https://github.com/gaysonloser/arc-payment-receipt/releases/download/programme-final-20260810/${expected.name}`;
    if (asset.url !== expectedUrl) errors.push(`asset_url_invalid:${kind}`);
    if (!isSha256(asset.sha256) || asset.github_digest !== `sha256:${asset.sha256}`) errors.push(`asset_hash_invalid:${kind}`);
    if (!Number.isSafeInteger(asset.bytes) || asset.bytes <= 0 || asset.http_status !== 200) errors.push(`asset_readback_invalid:${kind}`);
  }
  if (evidence?.final_submission_receipt !== null) errors.push("final_submission_receipt_must_remain_unproven");
  if (evidence?.external_actions !== 0 || evidence?.local_fixture_only !== false || evidence?.live_arc !== false || evidence?.live_erp !== false) errors.push("boundary_invalid");
  return { valid: errors.length === 0, errors, video: byKind.get("final_demo_video") ?? null, deckPdf: byKind.get("final_deck_pdf") ?? null, deckPptx: byKind.get("final_deck_pptx") ?? null };
}

export function buildFinalSubmissionReadinessView(reviewerEvidencePack, finalAssetsEvidence = null) {
  const finalAssets = validateFinalAssetsEvidence(finalAssetsEvidence);
  const checks = {
    public_read_only_mvp_available: reviewerEvidencePack?.status === "reviewer_pack_ready",
    github_and_render_release_evidence_available: reviewerEvidencePack?.evidence?.delivery?.github_render_same_release_required === true,
    final_assets_evidence_valid: finalAssets.valid,
    final_demo_video_available: finalAssets.valid && finalAssets.video !== null,
    final_pitch_deck_available: finalAssets.valid && finalAssets.deckPdf !== null && finalAssets.deckPptx !== null,
    final_submission_receipt_available: finalAssets.valid && finalAssetsEvidence?.final_submission_receipt !== null
  };
  const remainingRequirements = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  return {
    mode: "read-only_final_submission_readiness",
    checklist_id: "ARC-ENCODE-FINAL-SUBMISSION-READINESS-V1",
    status: remainingRequirements.length === 0 ? "final_submission_materials_ready" : "final_submission_materials_incomplete",
    checks,
    remaining_requirements: remainingRequirements,
    current_evidence: {
      reviewer_pack_status: reviewerEvidencePack?.status ?? "unavailable",
      github: reviewerEvidencePack?.evidence?.delivery?.github ?? null,
      render: reviewerEvidencePack?.evidence?.delivery?.render ?? null,
      reviewer_pack_content_sha256: reviewerEvidencePack?.content_sha256 ?? null,
      final_assets: finalAssets.valid ? {
        source: finalAssetsEvidence.source,
        tag: finalAssetsEvidence.tag,
        release_url: finalAssetsEvidence.release_url,
        assets: finalAssetsEvidence.assets
      } : null,
      final_assets_errors: finalAssets.errors
    },
    boundaries: {
      read_only: true,
      is_not_a_hackathon_submission: true,
      does_not_create_or_claim_a_new_arc_transaction: true,
      does_not_replace_final_judging_requirements: true,
      wallet_or_chain_action: false,
      erp_or_circle_action: false
    }
  };
}

// Current-release owner-gate readbacks are validated locally only.  These
// contracts never call Encode, an email provider or Arc RPC; absent,
// historical, fixture-backed or expired evidence remains UNPROVEN.
export const CURRENT_SURFACE_RELEASE_ID = "verified-milestone-close-current-mvp-workbench-rc1";
export const CURRENT_SURFACE_ARC_CHAIN_ID = 5042002;
export const CURRENT_SURFACE_ARC_NETWORK = "ARC-TESTNET";
export const CURRENT_POLICY_SETTLEMENT_DEPLOYED_CODE_SHA256 = "0ec144ba398f4557ee61d6585bc0ff9b83728ae235e5ebfcfb9e473624d52675";
export const CURRENT_POLICY_SETTLEMENT_DEPLOYED_CODE_BYTES = 6877;
const SURFACE_COMMIT_SHA = /^[0-9a-f]{40}$/;
const SURFACE_MANIFEST_SHA = /^[0-9a-f]{64}$/;
const SURFACE_TX_HASH = /^0x[0-9a-f]{64}$/;
const SURFACE_ADDRESS = /^0x[0-9a-f]{40}$/;
const SURFACE_POLICY_ID = /^0x[0-9a-f]{64}$/;
const SURFACE_ID = /^[A-Za-z0-9._:-]{1,160}$/;
const surfaceObject = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : null;
const surfaceSafeInteger = (value, { minimum = 0 } = {}) => Number.isSafeInteger(value) && value >= minimum;
const surfaceNumber = (value) => {
  if (typeof value === "number") return Number.isSafeInteger(value) ? value : null;
  if (typeof value === "string" && /^(?:0x[0-9a-f]+|[0-9]+)$/i.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
};
const surfaceStatusSuccess = (value) => value === 1 || value === "0x1" || value === "1";
const surfaceEqualAddress = (left, right) => String(left ?? "").toLowerCase() === String(right ?? "").toLowerCase();
const surfaceRequiredId = (value) => typeof value === "string" && SURFACE_ID.test(value);
const surfaceDate = (value) => {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
};
const SURFACE_CREDENTIAL_KEY = /^(?:api[_-]?key|apikey|token|secret|password|authorization|bearer|credential|private[_-]?key|access[_-]?key)$/i;
const SURFACE_CREDENTIAL_VALUE = /(?:^|[^a-z0-9])(?:api[_-]?key|apikey|token|secret|password|authorization|bearer|credential|private[_-]?key|access[_-]?key)(?:$|[^a-z0-9])/i;
const decodeSurfaceBounded = (value, maxRounds = 4) => {
  let current = String(value ?? "");
  for (let round = 0; round < maxRounds; round += 1) {
    let decoded;
    try { decoded = decodeURIComponent(current); } catch { return null; }
    if (decoded === current) return current;
    current = decoded;
  }
  return current;
};
const surfaceCredentialPartsForbidden = (part) => {
  const decoded = decodeSurfaceBounded(part);
  if (decoded === null) return true;
  for (const pair of decoded.replace(/^[?#]/, "").split(/[&;]/).filter(Boolean)) {
    const separator = pair.indexOf("=");
    const key = decodeSurfaceBounded(separator >= 0 ? pair.slice(0, separator) : pair);
    const value = decodeSurfaceBounded(separator >= 0 ? pair.slice(separator + 1) : "");
    if (key === null || value === null || SURFACE_CREDENTIAL_KEY.test(key) || SURFACE_CREDENTIAL_VALUE.test(value)) return true;
  }
  return false;
};
const safeSurfaceReadbackUrl = (value) => {
  if (typeof value !== "string" || value.length > 2048) return false;
  const decodedValue = decodeSurfaceBounded(value);
  if (decodedValue === null || decodedValue.length > 2048) return false;
  let url;
  try { url = new URL(decodedValue); } catch { return false; }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  const canonical = url.toString();
  if (surfaceCredentialPartsForbidden(url.search) || surfaceCredentialPartsForbidden(url.hash)) return false;
  const canonicalParts = `${new URL(canonical).search}${new URL(canonical).hash}`;
  return !surfaceCredentialPartsForbidden(canonicalParts);
};

function surfaceBaseErrors(input, now, kind, expectedRelease) {
  const errors = [];
  const value = surfaceObject(input);
  if (!value) return { value: null, errors: ["READBACK_REQUIRED"] };
  if (value.kind !== kind) errors.push("READBACK_KIND_INVALID");
  if (!surfaceObject(expectedRelease) || expectedRelease.release_id !== CURRENT_SURFACE_RELEASE_ID || !SURFACE_COMMIT_SHA.test(String(expectedRelease.commit_sha ?? "")) || !SURFACE_MANIFEST_SHA.test(String(expectedRelease.manifest_sha256 ?? ""))) errors.push("EXPECTED_RELEASE_REQUIRED");
  if (surfaceObject(expectedRelease) && (value.release_id !== expectedRelease.release_id || value.commit_sha !== expectedRelease.commit_sha || value.manifest_sha256 !== expectedRelease.manifest_sha256)) errors.push("RELEASE_BINDING_INVALID");
  if (value.authenticated !== true) errors.push("AUTHENTICATION_REQUIRED");
  if (value.historical === true || value.local_fixture_only === true || value.fixture === true || value.source === "fixture") errors.push("HISTORICAL_OR_FIXTURE_FORBIDDEN");
  if (value.verifier_external_actions !== undefined && value.verifier_external_actions !== 0) errors.push("VERIFIER_EXTERNAL_ACTIONS_FORBIDDEN");
  if (kind !== "final_late_email_send_receipt" && value.external_actions !== 0) errors.push("EXTERNAL_ACTIONS_FORBIDDEN");
  const observed = surfaceDate(value.observed_at);
  const expires = surfaceDate(value.expires_at);
  const nowMs = surfaceDate(now) ?? Date.now();
  if (observed === null) errors.push("OBSERVED_AT_REQUIRED");
  if (expires === null) errors.push("EXPIRES_AT_REQUIRED");
  if (observed !== null && observed > nowMs + 5 * 60 * 1000) errors.push("OBSERVED_AT_IN_FUTURE");
  if (observed !== null && nowMs - observed > 24 * 60 * 60 * 1000) errors.push("READBACK_EXPIRED");
  if (expires !== null && nowMs > expires) errors.push("READBACK_EXPIRED");
  if (observed !== null && expires !== null && expires < observed) errors.push("EXPIRY_BEFORE_OBSERVATION");
  return { value, errors };
}

function surfaceResult(kind, errors, fields = {}) {
  const clean = [...new Set(errors)];
  return { kind, valid: clean.length === 0, status: clean.length === 0 ? "VERIFIED_READ_ONLY" : "UNPROVEN", current_release_bound: clean.length === 0, verifier_external_actions: 0, external_actions: fields.evidence_action_count ?? 0, errors: clean, ...fields };
}

export function validateEncodeAuthenticatedReadback(input, { now = new Date().toISOString(), expectedRelease = null } = {}) {
  const { value, errors } = surfaceBaseErrors(input, now, "encode_authenticated_current_product_readback", expectedRelease);
  if (!value) return surfaceResult("encode_authenticated_current_product_readback", errors, { readback_url: null });
  if (!["submission_id", "encode_project_id", "checkpoint_id", "readback_id", "platform_receipt_id"].every((key) => surfaceRequiredId(String(value[key] ?? "")))) errors.push("ENCODE_RECEIPT_ID_BINDING_REQUIRED");
  if (!value.encode_project_id || !value.checkpoint_id) errors.push("ENCODE_CHECKPOINT_BINDING_REQUIRED");
  if (value.checkpoint_status !== "authenticated_current_product") errors.push("ENCODE_CHECKPOINT_STATUS_INVALID");
  if (value.platform_status !== "authenticated_current_product") errors.push("ENCODE_PLATFORM_STATUS_INVALID");
  const observed = surfaceDate(value.observed_at);
  const platformObserved = surfaceDate(value.platform_observed_at);
  if (platformObserved === null || observed === null || platformObserved !== observed) errors.push("ENCODE_PLATFORM_OBSERVED_AT_MISMATCH");
  const savedFields = surfaceObject(value.saved_product_fields);
  const savedLinks = surfaceObject(value.saved_links);
  const savedFieldsSha = savedFields?.sha256 ?? value.saved_product_fields_sha256;
  const savedFieldsCount = savedFields?.count ?? value.saved_product_fields_count;
  const savedLinksSha = savedLinks?.sha256 ?? value.saved_links_sha256;
  const savedLinksCount = savedLinks?.count ?? value.saved_links_count;
  if (!SURFACE_MANIFEST_SHA.test(String(savedFieldsSha ?? "")) || !surfaceSafeInteger(savedFieldsCount, { minimum: 1 })) errors.push("ENCODE_SAVED_PRODUCT_FIELDS_BINDING_REQUIRED");
  if (!SURFACE_MANIFEST_SHA.test(String(savedLinksSha ?? "")) || !surfaceSafeInteger(savedLinksCount, { minimum: 1 })) errors.push("ENCODE_SAVED_LINKS_BINDING_REQUIRED");
  if (!safeSurfaceReadbackUrl(value.readback_url)) errors.push("READBACK_URL_INVALID");
  if (value.http_status !== 200) errors.push("READBACK_HTTP_STATUS_INVALID");
  return surfaceResult(value.kind, errors, {
    submission_id: value.submission_id ?? null,
    encode_project_id: value.encode_project_id ?? null,
    checkpoint_id: value.checkpoint_id ?? null,
    readback_id: value.readback_id ?? null,
    platform_receipt_id: value.platform_receipt_id ?? null,
    platform_status: value.platform_status ?? null,
    platform_observed_at: value.platform_observed_at ?? null,
    saved_product_fields: { sha256: savedFieldsSha ?? null, count: savedFieldsCount ?? null },
    saved_links: { sha256: savedLinksSha ?? null, count: savedLinksCount ?? null },
    readback_url: value.readback_url ?? null
  });
}

const FINAL_TOP_LEVEL_FIELDS = new Set([
  "kind", "schema", "release_id", "commit_sha", "manifest_sha256", "authenticated", "observed_at", "expires_at",
  "verifier_external_actions", "external_actions", "historical", "local_fixture_only", "fixture", "source", "readback_url", "http_status",
  "recipient_ref", "owner_confirmation", "action_count", "send_action_performed", "subject_sha256", "body_sha256", "assets_sha256", "links_sha256",
  "send_receipt_id", "provider_message_id", "send_status", "sent_at", "delivery", "delivery_status", "delivery_receipt_id",
  "delivery_observed_at", "delivery_authenticated"
]);
const FINAL_DELIVERY_FIELDS = new Set(["status", "receipt_id", "observed_at", "authenticated", "provider_message_id"]);
const FINAL_FORBIDDEN_KEY = /(?:recipient|e[-_]?mail|identity|phone|customer|personal|contact|username|user[_-]?id|wallet|account|secret|token|password|api[_-]?key|bearer|authorization)/i;
const FINAL_EMAIL_VALUE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
function inspectFinalSafety(value, path = "", errors = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectFinalSafety(item, `${path}[${index}]`, errors));
    return errors;
  }
  if (!surfaceObject(value)) return errors;
  for (const [key, child] of Object.entries(value)) {
    const keyPath = path ? `${path}.${key}` : key;
    if (key !== "recipient_ref" && FINAL_FORBIDDEN_KEY.test(key)) errors.push("FINAL_PRIVACY_FIELD_FORBIDDEN");
    if (!path && !FINAL_TOP_LEVEL_FIELDS.has(key)) errors.push("FINAL_FIELD_NOT_ALLOWLISTED");
    if (path === "delivery" && !FINAL_DELIVERY_FIELDS.has(key)) errors.push("FINAL_DELIVERY_FIELD_NOT_ALLOWLISTED");
    if (key === "recipient_ref") {
      if (!surfaceRequiredId(String(child ?? ""))) errors.push("FINAL_RECIPIENT_REF_REQUIRED");
    } else if (typeof child === "string" && FINAL_EMAIL_VALUE.test(child)) {
      errors.push("FINAL_PRIVACY_VALUE_FORBIDDEN");
    }
    inspectFinalSafety(child, keyPath, errors);
  }
  return errors;
}

export function validateFinalLateEmailSendReceipt(input, { now = new Date().toISOString(), expectedRelease = null } = {}) {
  const { value, errors } = surfaceBaseErrors(input, now, "final_late_email_send_receipt", expectedRelease);
  if (!value) return surfaceResult("final_late_email_send_receipt", errors, { readback_url: null });
  inspectFinalSafety(value, "", errors);
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(String(value.recipient_ref ?? ""))) errors.push("FINAL_RECIPIENT_REF_REQUIRED");
  for (const field of ["subject_sha256", "body_sha256", "assets_sha256", "links_sha256"]) if (!SURFACE_MANIFEST_SHA.test(String(value[field] ?? ""))) errors.push(`FINAL_${field.toUpperCase()}_BINDING_REQUIRED`);
  if (value.owner_confirmation !== "GRANTED") errors.push("FINAL_OWNER_CONFIRMATION_REQUIRED");
  if (value.action_count !== 1 || value.send_action_performed !== true) errors.push("FINAL_SEND_ACTION_RECEIPT_REQUIRED");
  if (value.external_actions !== 1) errors.push("FINAL_EVIDENCE_ACTION_COUNT_INVALID");
  if (!value.send_receipt_id || !value.provider_message_id) errors.push("FINAL_SEND_RECEIPT_BINDING_REQUIRED");
  if (value.send_status !== "sent") errors.push("FINAL_SEND_STATUS_INVALID");
  const nowMs = surfaceDate(now) ?? Date.now();
  const observed = surfaceDate(value.observed_at);
  const expires = surfaceDate(value.expires_at);
  const sentAt = surfaceDate(value.sent_at);
  if (sentAt === null) errors.push("FINAL_SENT_AT_REQUIRED");
  else {
    if (sentAt > nowMs + 5 * 60 * 1000) errors.push("FINAL_SENT_AT_IN_FUTURE");
    if (observed !== null && observed < sentAt) errors.push("FINAL_OBSERVED_BEFORE_SENT");
    if (expires !== null && sentAt > expires) errors.push("FINAL_SENT_AT_AFTER_EXPIRY");
  }
  const delivery = surfaceObject(value.delivery);
  const deliveryStatus = delivery?.status ?? value.delivery_status;
  const deliveryReceiptId = delivery?.receipt_id ?? value.delivery_receipt_id;
  const deliveryAuthenticated = delivery?.authenticated ?? value.delivery_authenticated;
  const deliveryProviderMessageId = delivery?.provider_message_id;
  const deliveryObservedAt = surfaceDate(delivery?.observed_at ?? value.delivery_observed_at);
  if (deliveryStatus !== "accepted" || !surfaceRequiredId(String(deliveryReceiptId ?? "")) || deliveryAuthenticated !== true) errors.push("FINAL_DELIVERY_READBACK_REQUIRED");
  if (!surfaceRequiredId(String(deliveryProviderMessageId ?? ""))) errors.push("FINAL_DELIVERY_PROVIDER_MESSAGE_REQUIRED");
  else if (deliveryProviderMessageId !== value.provider_message_id) errors.push("FINAL_DELIVERY_PROVIDER_MESSAGE_MISMATCH");
  if (deliveryObservedAt === null) errors.push("FINAL_DELIVERY_OBSERVED_AT_REQUIRED");
  else {
    if (sentAt !== null && deliveryObservedAt < sentAt) errors.push("FINAL_DELIVERY_BEFORE_SENT");
    if (observed !== null && observed < deliveryObservedAt) errors.push("FINAL_OBSERVED_BEFORE_DELIVERY");
    if (deliveryObservedAt > nowMs + 5 * 60 * 1000) errors.push("FINAL_DELIVERY_IN_FUTURE");
    if (expires !== null && deliveryObservedAt > expires) errors.push("FINAL_DELIVERY_AFTER_EXPIRY");
  }
  if (!safeSurfaceReadbackUrl(value.readback_url)) errors.push("READBACK_URL_INVALID");
  if (value.http_status !== 200) errors.push("READBACK_HTTP_STATUS_INVALID");
  return surfaceResult(value.kind, errors, {
    evidence_action_count: value.action_count ?? 0,
    send_receipt_id: value.send_receipt_id ?? null,
    provider_message_id: value.provider_message_id ?? null,
    delivery_status: deliveryStatus ?? null,
    delivery_receipt_id: deliveryReceiptId ?? null,
    readback_url: value.readback_url ?? null
  });
}

function validateSurfaceReceiptEnvelope(receipt, prefix, expectedContractAddress) {
  const errors = [];
  if (!surfaceObject(receipt)) return [`${prefix}_RECEIPT_REQUIRED`];
  if (!SURFACE_TX_HASH.test(String(receipt.tx_hash ?? ""))) errors.push(`${prefix}_TX_HASH_REQUIRED`);
  if (!surfaceStatusSuccess(receipt.status)) errors.push(`${prefix}_STATUS_INVALID`);
  if (surfaceNumber(receipt.block_number) === null || surfaceNumber(receipt.block_number) <= 0) errors.push(`${prefix}_BLOCK_NUMBER_INVALID`);
  if (!SURFACE_TX_HASH.test(String(receipt.block_hash ?? ""))) errors.push(`${prefix}_BLOCK_HASH_INVALID`);
  if (!surfaceEqualAddress(receipt.contract_address, expectedContractAddress)) errors.push(`${prefix}_CONTRACT_ADDRESS_INVALID`);
  if (!['observed', 'finalized'].includes(receipt.finality_state)) errors.push(`${prefix}_FINALITY_REQUIRED`);
  return errors;
}

function policyFieldEqual(left, right, field) {
  if (["payer", "recipient", "reviewer"].includes(field)) return surfaceEqualAddress(left, right);
  return String(left ?? "") === String(right ?? "");
}
function policyFieldsValid(fields) {
  if (!surfaceObject(fields)) return false;
  const bytes32Fields = ["policy_id", "milestone_id", "policy_version"];
  const addressFields = ["payer", "recipient", "reviewer"];
  const uintFields = ["cap6", "policy_expiry", "max_attestation_ttl"];
  return bytes32Fields.every((field) => SURFACE_POLICY_ID.test(String(fields[field] ?? "")))
    && addressFields.every((field) => SURFACE_ADDRESS.test(String(fields[field] ?? "")))
    && uintFields.every((field) => surfaceSafeInteger(surfaceNumber(fields[field])));
}

export function validateArcTestnetCurrentReleaseReceipt(input, { now = new Date().toISOString(), expectedRelease = null } = {}) {
  const { value, errors } = surfaceBaseErrors(input, now, "arc_testnet_current_release_receipt", expectedRelease);
  if (!value) return surfaceResult("arc_testnet_current_release_receipt", errors, { readback_url: null });
  if (value.network !== CURRENT_SURFACE_ARC_NETWORK || value.blockchain !== CURRENT_SURFACE_ARC_NETWORK || value.chain_id !== CURRENT_SURFACE_ARC_CHAIN_ID) errors.push("ARC_NETWORK_BINDING_INVALID");
  if (!surfaceEqualAddress(value.contract_address, CURRENT_POLICY_SETTLEMENT_CONTRACT)) errors.push("ARC_CURRENT_CONTRACT_ADDRESS_REQUIRED");
  if (value.deployed_code_sha256 !== CURRENT_POLICY_SETTLEMENT_DEPLOYED_CODE_SHA256 || value.deployed_code_bytes !== CURRENT_POLICY_SETTLEMENT_DEPLOYED_CODE_BYTES) errors.push("ARC_DEPLOYED_CODE_BINDING_INVALID");
  const deployment = surfaceObject(value.deployment_receipt);
  const createPolicy = surfaceObject(value.create_policy_receipt);
  errors.push(...validateSurfaceReceiptEnvelope(deployment, "ARC_DEPLOYMENT", CURRENT_POLICY_SETTLEMENT_CONTRACT));
  errors.push(...validateSurfaceReceiptEnvelope(createPolicy, "ARC_CREATE_POLICY", CURRENT_POLICY_SETTLEMENT_CONTRACT));
  if (deployment && createPolicy && deployment.tx_hash === createPolicy.tx_hash) errors.push("ARC_RECEIPT_OPERATIONS_MUST_BE_DISTINCT");
  if (deployment && (deployment.deployed_code_sha256 !== CURRENT_POLICY_SETTLEMENT_DEPLOYED_CODE_SHA256 || deployment.deployed_code_bytes !== CURRENT_POLICY_SETTLEMENT_DEPLOYED_CODE_BYTES)) errors.push("ARC_DEPLOYMENT_CODE_BINDING_INVALID");
  const policyCreated = surfaceObject(value.policy_created);
  const getPolicy = surfaceObject(value.get_policy_readback);
  const policyArgs = surfaceObject(policyCreated?.args);
  const expectedPolicyFields = ["policy_id", "payer", "recipient", "reviewer", "cap6", "milestone_id", "policy_version", "policy_expiry", "max_attestation_ttl"];
  if (deployment && createPolicy && surfaceNumber(deployment.block_number) > surfaceNumber(createPolicy.block_number)) errors.push("ARC_DEPLOYMENT_MUST_PRECEDE_CREATE_POLICY");
  if (policyCreated?.status !== "verified" || policyCreated.event_signature !== CURRENT_POLICY_CREATED_EVENT || !surfaceEqualAddress(policyCreated.contract_address, CURRENT_POLICY_SETTLEMENT_CONTRACT) || !createPolicy || policyCreated.tx_hash !== createPolicy.tx_hash || surfaceNumber(policyCreated.block_number) !== surfaceNumber(createPolicy.block_number) || policyCreated.block_hash !== createPolicy.block_hash || !surfaceSafeInteger(surfaceNumber(policyCreated.log_index)) || !policyFieldsValid(policyArgs)) errors.push("ARC_POLICY_CREATED_READBACK_REQUIRED");
  if (policyCreated?.policy_id != null && policyCreated.policy_id !== policyArgs?.policy_id) errors.push("ARC_POLICY_CREATED_POLICY_ID_MISMATCH");
  const getPolicyArgs = surfaceObject(getPolicy?.args);
  const getPolicyResult = surfaceObject(getPolicy?.result);
  const getPolicyBlock = surfaceNumber(getPolicy?.block_number);
  const getPolicyCurrentBlock = surfaceNumber(getPolicy?.current_block_number);
  const createPolicyBlock = surfaceNumber(createPolicy?.block_number);
  if (getPolicy?.status !== "verified" || getPolicy.selector !== "getPolicy(bytes32)" || !surfaceEqualAddress(getPolicy.contract_address, CURRENT_POLICY_SETTLEMENT_CONTRACT) || getPolicy.readback_status !== "current" || !SURFACE_MANIFEST_SHA.test(String(getPolicy.readback_sha256 ?? "")) || !getPolicyArgs || getPolicyArgs.policy_id !== policyArgs?.policy_id || !policyFieldsValid(getPolicyResult) || !getPolicyResult || !expectedPolicyFields.every((field) => policyFieldEqual(getPolicyResult[field], policyArgs?.[field], field)) || getPolicyBlock === null || createPolicyBlock === null || getPolicyBlock < createPolicyBlock || !SURFACE_TX_HASH.test(String(getPolicy.block_hash ?? "")) || getPolicyCurrentBlock === null || getPolicyCurrentBlock < getPolicyBlock || (getPolicyBlock === createPolicyBlock && getPolicy.block_hash !== createPolicy?.block_hash)) errors.push("ARC_GET_POLICY_READBACK_REQUIRED");
  if (!safeSurfaceReadbackUrl(value.readback_url)) errors.push("READBACK_URL_INVALID");
  if (value.http_status !== 200) errors.push("READBACK_HTTP_STATUS_INVALID");
  return surfaceResult(value.kind, errors, {
    deployment_tx_hash: deployment?.tx_hash ?? null,
    create_policy_tx_hash: createPolicy?.tx_hash ?? null,
    contract_address: value.contract_address ?? null,
    deployed_code_sha256: value.deployed_code_sha256 ?? null,
    deployed_code_bytes: value.deployed_code_bytes ?? null,
    readback_url: value.readback_url ?? null
  });
}

export function buildCurrentReleaseSurfaceReadinessView({ encode = null, final = null, arc_testnet = null, circle_console = null, erp = null, expectedRelease = null, now = new Date().toISOString() } = {}) {
  return {
    release_id: CURRENT_SURFACE_RELEASE_ID,
    external_actions: 0,
    circle_console: circle_console ?? {
      valid: false,
      status: "BLOCKED",
      current_release_bound: false,
      errors: ["AUTHENTICATED_SUBSCRIPTION_READBACK_REQUIRED"],
      external_actions: 0
    },
    erp: erp ?? {
      valid: false,
      status: "UNPROVEN",
      current_release_bound: false,
      business_close_verified: false,
      errors: ["ERP_READBACK_REQUIRED"],
      external_actions: 0
    },
    encode: validateEncodeAuthenticatedReadback(encode, { now, expectedRelease }),
    final: validateFinalLateEmailSendReceipt(final, { now, expectedRelease }),
    arc_testnet: validateArcTestnetCurrentReleaseReceipt(arc_testnet, { now, expectedRelease }),
    boundaries: { no_api_calls: true, no_credentials: true, absent_or_historical_unproven: true, final_submission_receipt_proven: false }
  };
}

export function buildCurrentCircleConsoleSurface(verification = null) {
  const accepted = verification?.accepted === true && verification?.receipt != null;
  return {
    valid: accepted,
    status: accepted ? "VERIFIED_READ_ONLY" : "BLOCKED",
    current_release_bound: accepted,
    errors: accepted ? [] : [...new Set(verification?.errors ?? ["AUTHENTICATED_SUBSCRIPTION_READBACK_REQUIRED"])],
    external_actions: 0
  };
}

export function bindArcTestnetReadbackToRelease(readback, release) {
  return surfaceObject(readback) && surfaceObject(release)
    ? { ...readback, release_id: release.release_id, commit_sha: release.commit_sha, manifest_sha256: release.manifest_sha256 }
    : readback;
}

export function buildFinalDemoPlanView(readiness) {
  const steps = [
    { at_seconds: 0, focus: "scope", route: "/arc-lab", evidence: "read-only Arc enterprise control shell" },
    { at_seconds: 35, focus: "reviewer evidence", route: "/api/v1/reviewer-evidence-pack", evidence: "content-addressed reconciliation and boundary checks" },
    { at_seconds: 95, focus: "release proof", route: "/api/v1/final-submission-readiness", evidence: "matched GitHub and Render release evidence" },
    { at_seconds: 145, focus: "remaining work", route: "/api/v1/final-submission-readiness", evidence: "content-addressed video/deck assets are present; Final submission receipt remains unproven" }
  ];
  return {
    mode: "read-only_final_demo_plan",
    plan_id: "ARC-ENCODE-FINAL-DEMO-PLAN-V1",
    status: readiness?.status === "final_submission_materials_ready" ? "demo_plan_ready" : "demo_plan_ready_with_material_gaps",
    duration_seconds: 180,
    steps,
    source_readiness: {
      status: readiness?.status ?? "unavailable",
      remaining_requirements: readiness?.remaining_requirements ?? []
    },
    boundaries: {
      read_only: true,
      is_a_demo_outline_not_a_recorded_video: true,
      does_not_claim_final_submission_complete: true,
      wallet_or_chain_action: false,
      erp_or_circle_action: false
    }
  };
}

export function buildOpeningBalanceReadinessView(erpInteraction) {
  const c0 = erpInteraction?.c0 ?? {};
  const checks = {
    isolated_company_exists: c0.company_created === true,
    draft_only_identity_exists: c0.dedicated_service_identity_created === true && c0.draft_only_role_assigned === true,
    api_credential_absent: c0.api_credentials_generated === false,
    no_opening_balance_written: c0.opening_balance_written === false,
    no_business_document_written: c0.business_documents_created === 0
  };
  const failedChecks = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return { mode: "read-only_opening_balance_readiness_gate", gate_id: "ARC-AAL-C1-OPENING-BALANCE-V1", status: failedChecks.length ? "c1_preconditions_incomplete" : "ready_for_separate_owner_approval", checks, failed_checks: failedChecks, required_owner_inputs: ["approved opening-balance fixture", "zero-difference trial-balance review"], boundaries: { creates_erp_document: false, writes_opening_balance: false, authorizes_wallet_or_chain_action: false } };
}

export function buildOpeningBalanceFixtureContractView(erpInteraction, fixture = null) {
  const c0 = erpInteraction?.c0 ?? {};
  const lines = Array.isArray(fixture?.lines) ? fixture.lines : [];
  const debit = lines.reduce((sum, line) => sum + Number(line?.debit ?? 0), 0);
  const credit = lines.reduce((sum, line) => sum + Number(line?.credit ?? 0), 0);
  const checks = {
    isolated_company_precondition: c0.company_created === true && c0.dedicated_service_identity_created === true,
    approved_fixture_present: fixture?.approved === true,
    fixture_has_lines: lines.length > 0,
    currency_matches_aal_usd: fixture?.currency === "USD",
    debit_credit_zero_difference: Number.isFinite(debit) && Number.isFinite(credit) && debit === credit,
    no_write_requested: fixture?.write_requested === false
  };
  const failedChecks = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return { mode: "read-only_opening_balance_fixture_contract", contract_id: "ARC-AAL-C1-OPENING-BALANCE-FIXTURE-V1", status: failedChecks.length ? "fixture_rejected_fail_closed" : "fixture_valid_for_separate_owner_review", checks, failed_checks: failedChecks, totals: { debit, credit, difference: debit - credit }, boundaries: { fixture_is_not_an_erp_document: true, erp_write_executed: false, wallet_or_chain_action: false } };
}

export function buildOpeningBalanceLineClassificationView(fixture = null) {
  const lines = Array.isArray(fixture?.lines) ? fixture.lines : [];
  const invalidLines = lines.map((line, index) => {
    const debit = Number(line?.debit ?? 0); const credit = Number(line?.credit ?? 0);
    const valid = typeof line?.account_code === "string" && line.account_code.trim() !== "" && Number.isFinite(debit) && Number.isFinite(credit) && debit >= 0 && credit >= 0 && ((debit > 0) !== (credit > 0));
    return valid ? null : { index, reason: "account_code_and_exactly_one_positive_side_required" };
  }).filter(Boolean);
  return { mode: "read-only_opening_balance_line_classification", contract_id: "ARC-AAL-C1-OPENING-BALANCE-LINE-V1", status: lines.length > 0 && invalidLines.length === 0 ? "line_classification_valid_for_separate_owner_review" : "line_classification_rejected_fail_closed", line_count: lines.length, invalid_lines: invalidLines, boundaries: { fixture_is_not_an_erp_document: true, erp_write_executed: false } };
}

export function buildOpeningBalanceReviewPacket(erpInteraction, fixture = null) {
  const readiness = buildOpeningBalanceReadinessView(erpInteraction);
  const fixtureContract = buildOpeningBalanceFixtureContractView(erpInteraction, fixture);
  const lineClassification = buildOpeningBalanceLineClassificationView(fixture);
  const reviewReady = readiness.status === "ready_for_separate_owner_approval" && fixtureContract.status === "fixture_valid_for_separate_owner_review" && lineClassification.status === "line_classification_valid_for_separate_owner_review";
  const payload = { readiness, fixture_contract: fixtureContract, line_classification: lineClassification };
  return { mode: "read-only_opening_balance_review_packet", packet_id: "ARC-AAL-C1-OPENING-BALANCE-REVIEW-PACKET-V1", status: reviewReady ? "ready_for_separate_owner_review" : "blocked_fail_closed", review_ready: reviewReady, packet_sha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex"), ...payload, boundaries: { erp_write_executed: false, wallet_or_chain_action: false } };
}

export function buildOpeningBalanceFixtureValidationView(erpInteraction, fixture = null) {
  const packet = buildOpeningBalanceReviewPacket(erpInteraction, fixture);
  return {
    mode: "read-only_opening_balance_fixture_validation",
    validator_id: "ARC-AAL-C1-FIXTURE-VALIDATOR-V1",
    status: packet.status,
    accepted_for_separate_owner_review: packet.review_ready,
    packet,
    boundaries: {
      input_is_ephemeral: true,
      fixture_persisted: false,
      erp_write_executed: false,
      wallet_or_chain_action: false,
      owner_approval_bypassed: false
    }
  };
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
  const runtimeEnvironment = options.environment ?? process.env;
  const loadReport = options.loadReport ?? (() => loadEvidence(options.evidencePath));
  const loadDualReport = options.loadDualReport ?? (() => loadDualEvidence(options.dualEvidencePath));
  const loadCircleReport = options.loadCircleReport ?? (() => loadCircleSnapshot(options.circleSnapshotPath));
  const loadEnterpriseReport = options.loadEnterpriseReport ?? (() => loadEnterpriseEvidence(options.enterpriseEvidencePath));
  const loadViewer = options.loadViewer ?? (() => readFile(options.viewerPath ?? DEFAULT_VIEWER_PATH, "utf8"));
  const loadArcLabViewer = options.loadArcLabViewer ?? (() => readFile(options.arcLabViewerPath ?? DEFAULT_ARC_LAB_VIEWER_PATH, "utf8"));
  const loadArcLabReviewDeck = options.loadArcLabReviewDeck ?? (() => readFile(options.arcLabReviewDeckPath ?? DEFAULT_ARC_LAB_REVIEW_DECK_PATH, "utf8"));
  const loadArcLabEvidenceExplorer = options.loadArcLabEvidenceExplorer ?? (() => readFile(options.arcLabEvidenceExplorerPath ?? DEFAULT_ARC_LAB_EVIDENCE_EXPLORER_PATH, "utf8"));
  const loadArcLabProvenanceLedger = options.loadArcLabProvenanceLedger ?? (() => readFile(options.arcLabProvenanceLedgerPath ?? DEFAULT_ARC_LAB_PROVENANCE_LEDGER_PATH, "utf8"));
  const loadArcLabReviewerChecklist = options.loadArcLabReviewerChecklist ?? (() => readFile(options.arcLabReviewerChecklistPath ?? DEFAULT_ARC_LAB_REVIEWER_CHECKLIST_PATH, "utf8"));
  const loadArcLabReleaseWatch = options.loadArcLabReleaseWatch ?? (() => readFile(options.arcLabReleaseWatchPath ?? DEFAULT_ARC_LAB_RELEASE_WATCH_PATH, "utf8"));
  const loadArcLabControlTimeline = options.loadArcLabControlTimeline ?? (() => readFile(options.arcLabControlTimelinePath ?? DEFAULT_ARC_LAB_CONTROL_TIMELINE_PATH, "utf8"));
  const loadArcLabReleaseEvidenceAnchor = options.loadArcLabReleaseEvidenceAnchor ?? (() => readFile(options.arcLabReleaseEvidenceAnchorPath ?? DEFAULT_ARC_LAB_RELEASE_EVIDENCE_ANCHOR_PATH, "utf8"));
  const loadArcLabReleaseDeliveryAttestation = options.loadArcLabReleaseDeliveryAttestation ?? (() => readFile(options.arcLabReleaseDeliveryAttestationPath ?? DEFAULT_ARC_LAB_RELEASE_DELIVERY_ATTESTATION_PATH, "utf8"));
  const loadArcLabAgentRegistrationReceipt = options.loadArcLabAgentRegistrationReceipt ?? (() => readFile(options.arcLabAgentRegistrationReceiptPath ?? DEFAULT_ARC_LAB_AGENT_REGISTRATION_RECEIPT_PATH, "utf8"));
  const loadArcLab = options.loadArcLab ?? (() => loadArcLabPortfolio(options.arcLabPortfolioPath));
  const loadArcLabErp = options.loadArcLabErp ?? (() => loadArcLabErpInteraction(options.arcLabErpInteractionPath));
  const loadManufacturing = options.loadManufacturing ?? (() => loadManufacturingEvidence(options.manufacturingEvidencePath));
  const loadManufacturingProgressReport = options.loadManufacturingProgressReport ?? (() => loadManufacturingProgress(options.manufacturingProgressPath));
  const loadWalletRecovery = options.loadWalletRecovery ?? (() => loadWalletCapability(options.walletCapabilityPath));
  const loadW4Dual = options.loadW4Dual ?? (() => loadW4DualSource(options.w4DualSourcePath));
  const loadAppKit = options.loadAppKit ?? (() => loadAppKitBoundary(options.appKitBoundaryPath));
  const loadPublicTrace = options.loadPublicTrace ?? (() => loadPublicTraceTrail(options.publicTraceTrailPath));
  const loadDeliverySurfaces = options.loadDeliverySurfaces ?? (() => loadJson(options.deliverySurfacesPath ?? DEFAULT_DELIVERY_SURFACES_PATH));
  const loadAgentIdentity = options.loadAgentIdentity ?? (() => loadJson(options.agentIdentityPath ?? DEFAULT_AGENT_IDENTITY_PATH));
  const loadAgentRegistration = options.loadAgentRegistration ?? (() => loadJson(options.agentRegistrationPath ?? DEFAULT_AGENT_REGISTRATION_PATH));
  const loadAgentRegistrationReceipt = options.loadAgentRegistrationReceipt ?? (() => loadJson(options.agentRegistrationReceiptPath ?? DEFAULT_AGENT_REGISTRATION_RECEIPT_PATH));
  const loadExternalRouteIntake = options.loadExternalRouteIntake ?? (() => loadJson(options.externalRouteIntakePath ?? DEFAULT_EXTERNAL_ROUTE_INTAKE_PATH));
  const loadReleaseEvidenceAnchorPacket = options.loadReleaseEvidenceAnchorPacket ?? (() => loadJson(options.releaseEvidenceAnchorPacketPath ?? DEFAULT_RELEASE_EVIDENCE_ANCHOR_PACKET_PATH));
  const loadReleaseDeliveryAttestation = options.loadReleaseDeliveryAttestation ?? (() => loadJson(options.releaseDeliveryAttestationPath ?? DEFAULT_RELEASE_DELIVERY_ATTESTATION_PATH));
  const loadFinalAssetsEvidence = options.loadFinalAssetsEvidence ?? (() => loadJson(options.finalAssetsEvidencePath ?? DEFAULT_FINAL_ASSETS_EVIDENCE_PATH));
  const loadCurrentArcTestnetReadback = options.loadCurrentArcTestnetReadback ?? (() => loadJson(options.currentArcTestnetReadbackPath ?? DEFAULT_CURRENT_ARC_TESTNET_READBACK_PATH));
  const loadLogo = options.loadLogo ?? (() => readFile(options.logoPath ?? DEFAULT_LOGO_PATH));
  const loadFavicon = options.loadFavicon ?? (() => readFile(options.faviconPath ?? DEFAULT_FAVICON_PATH));
  const configuredCircleConsoleReceiptPolicy = options.circleConsoleReceiptPolicy ?? buildCircleConsoleReceiptPolicy({
    chainId: 5042002,
    contractAddress: options.circleConsoleContractAddress ?? runtimeEnvironment.CIRCLE_CONSOLE_CONTRACT_ADDRESS ?? CURRENT_POLICY_SETTLEMENT_CONTRACT,
    eventSignature: options.circleConsoleEventSignature ?? runtimeEnvironment.CIRCLE_CONSOLE_EVENT_SIGNATURE ?? CURRENT_POLICY_CREATED_EVENT,
    eventTopic: options.circleConsoleEventTopic ?? runtimeEnvironment.CIRCLE_CONSOLE_EVENT_TOPIC ?? "",
    expectedEventTxHash: options.circleConsoleExpectedEventTxHash ?? runtimeEnvironment.CIRCLE_CONSOLE_EXPECTED_EVENT_TX_HASH ?? "0x2f40fa6b8d464fd2b35a34612ee2e90dbb4121b3a2ddfad652505599b2ed4a9c",
    expectedEventBlockHash: options.circleConsoleExpectedEventBlockHash ?? runtimeEnvironment.CIRCLE_CONSOLE_EXPECTED_EVENT_BLOCK_HASH ?? "0x52df6ea5554d4ee8015d9917f4c26ada04eed38e58d0a841af632dc889fa160d",
    expectedEventBlockHeight: options.circleConsoleExpectedEventBlockHeight ?? runtimeEnvironment.CIRCLE_CONSOLE_EXPECTED_EVENT_BLOCK_HEIGHT ?? 56295297,
    expectedEventLogIndex: options.circleConsoleExpectedEventLogIndex ?? runtimeEnvironment.CIRCLE_CONSOLE_EXPECTED_EVENT_LOG_INDEX ?? 12,
    subscriptionId: options.circleConsoleSubscriptionId ?? runtimeEnvironment.CIRCLE_CONSOLE_SUBSCRIPTION_ID ?? "",
    releaseCommit: options.currentReleaseCommit ?? runtimeEnvironment.RENDER_GIT_COMMIT ?? runtimeEnvironment.CURRENT_RELEASE_COMMIT ?? "",
    webhookHistoryUrl: options.circleConsoleWebhookHistoryUrl ?? runtimeEnvironment.CIRCLE_CONSOLE_WEBHOOK_HISTORY_URL ?? "",
    eventHistoryUrl: options.circleConsoleEventHistoryUrl ?? runtimeEnvironment.CIRCLE_CONSOLE_EVENT_HISTORY_URL ?? "",
    requireReadHistory: true
  });
  const circleConsoleReceiptPolicy = {
    ...configuredCircleConsoleReceiptPolicy,
    requireReadHistory: true,
    webhookHistoryUrl: String(configuredCircleConsoleReceiptPolicy.webhookHistoryUrl || options.circleConsoleWebhookHistoryUrl || runtimeEnvironment.CIRCLE_CONSOLE_WEBHOOK_HISTORY_URL || ""),
    eventHistoryUrl: String(configuredCircleConsoleReceiptPolicy.eventHistoryUrl || options.circleConsoleEventHistoryUrl || runtimeEnvironment.CIRCLE_CONSOLE_EVENT_HISTORY_URL || "")
  };
  const loadCircleConsoleReadback = typeof options.loadCircleConsoleReadback === "function"
    ? options.loadCircleConsoleReadback
    : null;
  const trustedReadbackContract = options.trustedReadbackContract ?? buildCircleConsoleTrustedReadbackContract({
    policy: circleConsoleReceiptPolicy,
    webhookHistoryUrl: options.circleConsoleWebhookHistoryUrl ?? runtimeEnvironment.CIRCLE_CONSOLE_WEBHOOK_HISTORY_URL ?? circleConsoleReceiptPolicy.webhookHistoryUrl,
    eventHistoryUrl: options.circleConsoleEventHistoryUrl ?? runtimeEnvironment.CIRCLE_CONSOLE_EVENT_HISTORY_URL ?? circleConsoleReceiptPolicy.eventHistoryUrl,
    loadReadback: loadCircleConsoleReadback
  });
  const trustedReadbackLoader = createCircleConsoleTrustedReadbackLoader({
    contract: trustedReadbackContract,
    loadReadback: loadCircleConsoleReadback
  });
  const circleConsoleReceiptReadiness = () => buildCircleConsoleReceiptReadinessView(circleConsoleReceiptPolicy, {
    trustedReadbackLoaderAvailable: loadCircleConsoleReadback !== null,
    trustedReadbackContract
  });
  let circleWebhookStorePromise = null;
  const getCircleWebhookStore = async () => {
    if (options.circleWebhookStore) return options.circleWebhookStore;
    if (circleWebhookStorePromise) return circleWebhookStorePromise;
    const runtime = buildCircleWebhookRuntimePolicy(runtimeEnvironment);
    if (!runtime.enabled) return null;
    let publicKeyPem = runtimeEnvironment.CIRCLE_WEBHOOK_PUBLIC_KEY_PEM;
    if (!publicKeyPem && runtimeEnvironment.CIRCLE_WEBHOOK_PUBLIC_KEY_PATH) {
      publicKeyPem = await readFile(resolve(runtimeEnvironment.CIRCLE_WEBHOOK_PUBLIC_KEY_PATH), "utf8");
    }
    if (!isValidCircleWebhookPublicKey(publicKeyPem)) throw new Error("invalid_circle_webhook_public_key");
    circleWebhookStorePromise = createCircleWebhookStore({
      path: runtimeEnvironment.CIRCLE_WEBHOOK_STORE_PATH,
      releaseBinding: {
        ...DEFAULT_CIRCLE_WEBHOOK_RELEASE_BINDING,
        release_id: runtimeEnvironment.CIRCLE_WEBHOOK_RELEASE_ID || DEFAULT_CIRCLE_WEBHOOK_RELEASE_BINDING.release_id,
        commit_sha: runtimeEnvironment.CIRCLE_WEBHOOK_RELEASE_COMMIT || runtimeEnvironment.CURRENT_RELEASE_COMMIT || runtimeEnvironment.RENDER_GIT_COMMIT || DEFAULT_CIRCLE_WEBHOOK_RELEASE_BINDING.commit_sha,
        render_deployment_id: runtimeEnvironment.CIRCLE_WEBHOOK_RENDER_DEPLOYMENT_ID || DEFAULT_CIRCLE_WEBHOOK_RELEASE_BINDING.render_deployment_id,
        manifest_sha256: runtimeEnvironment.CIRCLE_WEBHOOK_MANIFEST_SHA256 || DEFAULT_CIRCLE_WEBHOOK_RELEASE_BINDING.manifest_sha256
      }
    }).then((store) => ({ store, publicKeyPem }));
    return circleWebhookStorePromise;
  };
  const circleWebhookProcessor = options.circleWebhookProcessor ?? createCircleWebhookProcessor({
    environment: runtimeEnvironment,
    policy: {
      ...CIRCLE_WEBHOOK_READINESS_POLICY,
      enabled: true,
      durableQueueAvailable: true,
      releaseBinding: {
        ...DEFAULT_CIRCLE_WEBHOOK_RELEASE_BINDING,
        release_id: runtimeEnvironment.CIRCLE_WEBHOOK_RELEASE_ID || DEFAULT_CIRCLE_WEBHOOK_RELEASE_BINDING.release_id,
        commit_sha: runtimeEnvironment.CIRCLE_WEBHOOK_RELEASE_COMMIT || runtimeEnvironment.CURRENT_RELEASE_COMMIT || runtimeEnvironment.RENDER_GIT_COMMIT || DEFAULT_CIRCLE_WEBHOOK_RELEASE_BINDING.commit_sha,
        render_deployment_id: runtimeEnvironment.CIRCLE_WEBHOOK_RENDER_DEPLOYMENT_ID || DEFAULT_CIRCLE_WEBHOOK_RELEASE_BINDING.render_deployment_id,
        manifest_sha256: runtimeEnvironment.CIRCLE_WEBHOOK_MANIFEST_SHA256 || DEFAULT_CIRCLE_WEBHOOK_RELEASE_BINDING.manifest_sha256
      }
    },
    publicKeyPem: runtimeEnvironment.CIRCLE_WEBHOOK_PUBLIC_KEY_PEM,
    expectedKeyId: runtimeEnvironment.CIRCLE_WEBHOOK_PUBLIC_KEY_ID,
    getPublicKeyPem: async () => (await getCircleWebhookStore())?.publicKeyPem ?? null,
    getDurableStore: async () => (await getCircleWebhookStore())?.store
  });
  const now = options.now ?? (() => Date.now());

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      if (url.pathname === "/.well-known/agent-registration.json") {
        if (!["GET", "HEAD"].includes(request.method)) {
          json(response, 405, { error: "method_not_allowed" }, request.method);
          return;
        }
        json(response, 200, await loadAgentRegistration(), request.method);
        return;
      }
      if (request.method === "POST" && url.pathname === PUBLIC_POST_ROUTES[0]) {
        const rawBody = await readRawBody(request);
        const result = await circleWebhookProcessor({ rawBody, headers: request.headers });
        json(response, result.status, result, request.method);
        return;
      }
      if (request.method === "POST" && url.pathname === PUBLIC_POST_ROUTES[1]) {
        const { payload } = await readJsonBody(request);
        const fixture = payload?.fixture ?? payload;
        if (fixture === null || typeof fixture !== "object" || Array.isArray(fixture)) {
          json(response, 400, { error: "fixture_object_required", boundaries: { fixture_persisted: false, erp_write_executed: false, wallet_or_chain_action: false } }, request.method);
          return;
        }
        json(response, 200, buildOpeningBalanceFixtureValidationView(await loadArcLabErp(), fixture), request.method);
        return;
      }
      if (!["GET", "HEAD"].includes(request.method)) {
        json(response, 405, { error: "method_not_allowed" }, request.method);
        return;
      }

      if (url.pathname === "/current-mvp" || url.pathname.startsWith("/current-mvp/")) {
        const currentMvpRequest = resolveCurrentMvpRequest(url.pathname);
        if (!currentMvpRequest) {
          json(response, 404, { error: "current_mvp_route_invalid" }, request.method);
          return;
        }
        try {
          const body = await readFile(currentMvpRequest.file_path);
          const isHtml = currentMvpRequest.file_path.endsWith(".html");
          const isModule = currentMvpRequest.file_path.endsWith(".mjs");
          response.writeHead(200, {
            "content-type": currentMvpContentType(currentMvpRequest.file_path),
            "cache-control": isHtml ? "no-store" : isModule ? "no-cache" : "public, max-age=3600",
            "content-security-policy": "default-src 'self'; connect-src 'none'; img-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
            ...SECURITY_HEADERS
          });
          response.end(request.method === "HEAD" ? "" : body);
        } catch (error) {
          if (error.code === "ENOENT") {
            json(response, 404, { error: "current_mvp_asset_not_found", path: currentMvpRequest.relative_path }, request.method);
          } else {
            throw error;
          }
        }
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

      if (url.pathname === "/arc-lab/review-deck") {
        text(response, 200, await loadArcLabReviewDeck(), "text/html; charset=utf-8", request.method);
        return;
      }

      if (url.pathname === "/arc-lab/evidence-explorer") {
        text(response, 200, await loadArcLabEvidenceExplorer(), "text/html; charset=utf-8", request.method);
        return;
      }

      if (url.pathname === "/arc-lab/provenance-ledger") {
        text(response, 200, await loadArcLabProvenanceLedger(), "text/html; charset=utf-8", request.method);
        return;
      }

      if (url.pathname === "/arc-lab/reviewer-checklist") {
        text(response, 200, await loadArcLabReviewerChecklist(), "text/html; charset=utf-8", request.method);
        return;
      }

      if (url.pathname === "/arc-lab/release-watch") {
        text(response, 200, await loadArcLabReleaseWatch(), "text/html; charset=utf-8", request.method);
        return;
      }

      if (url.pathname === "/arc-lab/control-timeline") {
        text(response, 200, await loadArcLabControlTimeline(), "text/html; charset=utf-8", request.method);
        return;
      }

      if (url.pathname === "/arc-lab/release-evidence-anchor") {
        text(response, 200, await loadArcLabReleaseEvidenceAnchor(), "text/html; charset=utf-8", request.method);
        return;
      }

      if (url.pathname === "/arc-lab/release-delivery-attestation") {
        text(response, 200, await loadArcLabReleaseDeliveryAttestation(), "text/html; charset=utf-8", request.method);
        return;
      }

      if (url.pathname === "/arc-lab/agent-registration-receipt") {
        text(response, 200, await loadArcLabAgentRegistrationReceipt(), "text/html; charset=utf-8", request.method);
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

      if (url.pathname === "/api/v1/opening-balance-readiness") {
        json(response, 200, buildOpeningBalanceReadinessView(await loadArcLabErp()), request.method);
        return;
      }

      if (url.pathname === "/api/v1/opening-balance-fixture-contract") {
        json(response, 200, buildOpeningBalanceFixtureContractView(await loadArcLabErp()), request.method);
        return;
      }
      if (url.pathname === "/api/v1/opening-balance-line-classification") {
        json(response, 200, buildOpeningBalanceLineClassificationView(), request.method); return;
      }
      if (url.pathname === "/api/v1/opening-balance-review-packet") {
        json(response, 200, buildOpeningBalanceReviewPacket(await loadArcLabErp()), request.method); return;
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

      if (url.pathname === "/api/v1/agent-identity") {
        json(response, 200, await loadAgentIdentity(), request.method);
        return;
      }

      if (url.pathname === "/api/v1/agent-registration-receipt") {
        json(response, 200, await loadAgentRegistrationReceipt(), request.method);
        return;
      }

      if (url.pathname === "/api/v1/external-route-intake-boundary") {
        json(response, 200, await loadExternalRouteIntake(), request.method);
        return;
      }

      if (url.pathname === "/api/v1/release-evidence-anchor") {
        json(response, 200, await loadReleaseEvidenceAnchorPacket(), request.method);
        return;
      }

      if (url.pathname === "/api/v1/release-delivery-attestation") {
        json(response, 200, await loadReleaseDeliveryAttestation(), request.method);
        return;
      }

      if (url.pathname === "/api/v1/public-disclosure-audit") {
        const [agentIdentity, externalRouteIntake, deliverySurfaces, publicTrace] = await Promise.all([
          loadAgentIdentity(),
          loadExternalRouteIntake(),
          loadDeliverySurfaces(),
          loadPublicTrace()
        ]);
        json(response, 200, buildPublicDisclosureAuditView({
          agent_identity: agentIdentity,
          external_route_intake: externalRouteIntake,
          delivery_surfaces: deliverySurfaces,
          public_trace_trail: publicTrace
        }), request.method);
        return;
      }

      if (url.pathname === "/api/v1/public-boundary-consistency") {
        const [agentIdentity, externalRouteIntake, deliverySurfaces, publicTrace] = await Promise.all([
          loadAgentIdentity(),
          loadExternalRouteIntake(),
          loadDeliverySurfaces(),
          loadPublicTrace()
        ]);
        json(response, 200, buildPublicBoundaryConsistencyView({
          agentIdentity,
          externalRouteIntake,
          deliverySurfaces,
          publicTrace
        }), request.method);
        return;
      }

      if (url.pathname === "/api/v1/reviewer-evidence-pack") {
        const [qualityHold, manufacturingProgress, wallet, appKit, agentIdentity, externalRouteIntake, deliverySurfaces, publicTrace] = await Promise.all([
          loadManufacturing(),
          loadManufacturingProgressReport(),
          loadWalletRecovery(),
          loadAppKit(),
          loadAgentIdentity(),
          loadExternalRouteIntake(),
          loadDeliverySurfaces(),
          loadPublicTrace()
        ]);
        json(response, 200, buildReviewerEvidencePack({ qualityHold, manufacturingProgress, wallet, appKit, agentIdentity, externalRouteIntake, deliverySurfaces, publicTrace }), request.method);
        return;
      }

      if (url.pathname === "/api/v1/final-submission-readiness") {
        const [qualityHold, manufacturingProgress, wallet, appKit, agentIdentity, externalRouteIntake, deliverySurfaces, publicTrace, finalAssetsEvidence] = await Promise.all([
          loadManufacturing(),
          loadManufacturingProgressReport(),
          loadWalletRecovery(),
          loadAppKit(),
          loadAgentIdentity(),
          loadExternalRouteIntake(),
          loadDeliverySurfaces(),
          loadPublicTrace(),
          loadFinalAssetsEvidence()
        ]);
        const reviewerEvidencePack = buildReviewerEvidencePack({ qualityHold, manufacturingProgress, wallet, appKit, agentIdentity, externalRouteIntake, deliverySurfaces, publicTrace });
        json(response, 200, buildFinalSubmissionReadinessView(reviewerEvidencePack, finalAssetsEvidence), request.method);
        return;
      }

      if (url.pathname === "/api/v1/current-release-surface-readiness") {
        const [arcTestnetReadback, manifestBytes] = await Promise.all([
          loadCurrentArcTestnetReadback(),
          readFile(resolve(HERE, "../current-mvp/current-release-workbench-manifest.json"))
        ]);
        const expectedRelease = {
          release_id: CURRENT_SURFACE_RELEASE_ID,
          commit_sha: options.currentReleaseCommit ?? runtimeEnvironment.RENDER_GIT_COMMIT ?? runtimeEnvironment.CURRENT_RELEASE_COMMIT ?? "",
          manifest_sha256: createHash("sha256").update(manifestBytes).digest("hex"),
          observed_at: new Date(now()).toISOString()
        };
        const circleConsole = circleConsoleReceiptReadiness();
        let circleVerification = buildCircleConsoleReceiptVerificationView(null, circleConsoleReceiptPolicy, circleConsole);
        if (circleConsole.status === "ready_for_trusted_circle_console_readback" && trustedReadbackLoader) {
          try {
            const circleReadback = await trustedReadbackLoader();
            circleVerification = buildCircleConsoleReceiptVerificationView(circleReadback, circleConsoleReceiptPolicy, circleConsole);
          } catch (error) {
            circleVerification = { accepted: false, errors: ["trusted_circle_console_readback_unavailable", ...(error?.errors ?? [])], receipt: null };
          }
        }
        const publishedErp = bindVerifiedEmbeddedErpProjectionToPublicRelease({ release: expectedRelease, evidence: CURRENT_ERP_VERIFIED_READ_ONLY_EVIDENCE });
        json(response, 200, buildCurrentReleaseSurfaceReadinessView({
          arc_testnet: bindArcTestnetReadbackToRelease(arcTestnetReadback, expectedRelease),
          circle_console: buildCurrentCircleConsoleSurface(circleVerification),
          erp: publishedErp,
          expectedRelease
        }), request.method);
        return;
      }

      if (url.pathname === "/api/v1/final-demo-plan") {
        const [qualityHold, manufacturingProgress, wallet, appKit, agentIdentity, externalRouteIntake, deliverySurfaces, publicTrace, finalAssetsEvidence] = await Promise.all([
          loadManufacturing(), loadManufacturingProgressReport(), loadWalletRecovery(), loadAppKit(), loadAgentIdentity(), loadExternalRouteIntake(), loadDeliverySurfaces(), loadPublicTrace(), loadFinalAssetsEvidence()
        ]);
        const reviewerEvidencePack = buildReviewerEvidencePack({ qualityHold, manufacturingProgress, wallet, appKit, agentIdentity, externalRouteIntake, deliverySurfaces, publicTrace });
        const readiness = buildFinalSubmissionReadinessView(reviewerEvidencePack, finalAssetsEvidence);
        json(response, 200, buildFinalDemoPlanView(readiness), request.method);
        return;
      }

      if (url.pathname === "/api/v1/circle-webhook-readiness") {
        let storeInitialized = null;
        let verificationKeyValid = null;
        if (buildCircleWebhookRuntimePolicy(runtimeEnvironment).enabled) {
          try {
            const initialized = await getCircleWebhookStore();
            storeInitialized = Boolean(initialized?.store);
            verificationKeyValid = isValidCircleWebhookPublicKey(initialized?.publicKeyPem);
          } catch {
            storeInitialized = false;
            verificationKeyValid = false;
          }
        }
        json(response, 200, buildCircleWebhookPublicView(runtimeEnvironment, { storeInitialized, verificationKeyValid }), request.method);
        return;
      }

      if (url.pathname === "/api/v1/circle-console-receipt-readiness") {
        json(response, 200, circleConsoleReceiptReadiness(), request.method);
        return;
      }

      if (url.pathname === "/api/v1/circle-console-receipt") {
        const readiness = circleConsoleReceiptReadiness();
        if (readiness.status !== "ready_for_trusted_circle_console_readback") {
          json(response, 503, buildCircleConsoleReceiptVerificationView(null, circleConsoleReceiptPolicy, readiness), request.method);
          return;
        }
        let readback;
        try {
          readback = await trustedReadbackLoader();
        } catch {
          json(response, 503, {
            accepted: false,
            errors: ["trusted_circle_console_readback_unavailable"],
            receipt: null,
            readiness,
            boundaries: readiness.boundaries
          }, request.method);
          return;
        }
        const verification = buildCircleConsoleReceiptVerificationView(readback, circleConsoleReceiptPolicy, readiness);
        json(response, verification.accepted ? 200 : 422, verification, request.method);
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
  server.on("close", () => {
    if (!options.circleWebhookStore && circleWebhookStorePromise) {
      void circleWebhookStorePromise.then(({ store }) => store.close()).catch(() => {});
    }
  });
  return server;
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
