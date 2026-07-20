#!/usr/bin/env node

import { createServer } from "node:http";
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
