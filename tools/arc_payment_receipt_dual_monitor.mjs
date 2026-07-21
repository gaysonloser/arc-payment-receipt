#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdir } from "node:fs/promises";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_RPC = resolve(HERE, "../outputs/ArcPaymentReceipt_event_monitor_latest.json");
const DEFAULT_CIRCLE = resolve(HERE, "../outputs/ArcCircleContracts_event_history_latest.json");

function eventKey(event) {
  return `${(event.transaction_hash || "").toLowerCase()}:${event.log_index ?? ""}`;
}

export function buildDualSourceReport(rpc, circle) {
  const monitorCreatedAt = Date.parse(circle.monitor_created_at);
  if (!Number.isFinite(monitorCreatedAt)) throw new Error("Circle snapshot has invalid monitor_created_at");
  const rpcSnapshotAt = Date.parse(rpc.generated_at);
  const circleSnapshotAt = Date.parse(circle.generated_at);
  const sourceSnapshotTimestampsValid = Number.isFinite(rpcSnapshotAt) && Number.isFinite(circleSnapshotAt);
  const evidenceAt = sourceSnapshotTimestampsValid
    ? new Date(Math.min(rpcSnapshotAt, circleSnapshotAt)).toISOString()
    : null;

  const rpcBeforeMonitor = rpc.events.filter((event) => Date.parse(event.timestamp) < monitorCreatedAt);
  const rpcOverlap = rpc.events.filter((event) => Date.parse(event.timestamp) >= monitorCreatedAt);
  const circleEvents = circle.event_logs || [];
  const rpcKeys = new Set(rpcOverlap.map(eventKey));
  const circleKeys = new Set(circleEvents.map(eventKey));
  const unmatchedRpc = rpcOverlap.filter((event) => !circleKeys.has(eventKey(event)));
  const unmatchedCircle = circleEvents.filter((event) => !rpcKeys.has(eventKey(event)));

  const checks = {
    circle_subscription_active: circle.subscription_state === "Subscribed",
    contract_matches: rpc.contract.toLowerCase() === circle.contract_address.toLowerCase(),
    event_signature_matches: circle.event_signature === "PaymentReceived(bytes32,address,address,uint256,bytes32)",
    overlap_event_counts_match: rpcOverlap.length === circleEvents.length,
    overlap_events_match: unmatchedRpc.length === 0 && unmatchedCircle.length === 0,
    rpc_integrity_checks_pass: Object.values(rpc.checks).every(Boolean),
    source_snapshot_timestamps_valid: sourceSnapshotTimestampsValid
  };
  const aligned = Object.values(checks).every(Boolean);

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    evidence_at: evidenceAt,
    status: aligned ? "aligned_in_overlap_window" : "review_required",
    contract: rpc.contract,
    coverage: {
      rpc_from_block: rpc.range.from,
      rpc_to_block: rpc.range.to,
      rpc_snapshot_at: rpc.generated_at,
      circle_monitor_created_at: circle.monitor_created_at,
      circle_snapshot_at: circle.generated_at
    },
    counts: {
      rpc_total: rpc.events.length,
      rpc_before_circle_monitor: rpcBeforeMonitor.length,
      rpc_in_overlap_window: rpcOverlap.length,
      circle_in_overlap_window: circleEvents.length
    },
    checks,
    unmatched: { rpc: unmatchedRpc, circle: unmatchedCircle },
    historical_delta: {
      explained: rpcBeforeMonitor.length === rpc.events.length - rpcOverlap.length,
      reason: "Circle Event Monitor was created after the P1 event; pre-monitor backfill is not assumed."
    },
    notification_boundary: {
      webhook_active: Boolean(circle.webhook_active),
      mode: circle.webhook_active ? "history_and_notifications" : "manual_history_read_only"
    },
    wallet_signature: false,
    onchain_write: false,
    gas: "0"
  };
}

function renderMarkdown(report) {
  return [
    "# Arc PaymentReceipt Dual Source Monitor",
    "",
    `Generated: \`${report.generated_at}\``,
    `Evidence at: \`${report.evidence_at}\``,
    `Status: \`${report.status}\``,
    `Contract: \`${report.contract}\``,
    "",
    "## Coverage",
    "",
    `- RPC blocks: \`${report.coverage.rpc_from_block}\` to \`${report.coverage.rpc_to_block}\``,
    `- RPC snapshot: \`${report.coverage.rpc_snapshot_at}\``,
    `- Circle monitor created: \`${report.coverage.circle_monitor_created_at}\``,
    `- Circle snapshot: \`${report.coverage.circle_snapshot_at}\``,
    "",
    "## Counts",
    "",
    `- RPC total: \`${report.counts.rpc_total}\``,
    `- RPC before Circle monitor: \`${report.counts.rpc_before_circle_monitor}\``,
    `- RPC in overlap window: \`${report.counts.rpc_in_overlap_window}\``,
    `- Circle in overlap window: \`${report.counts.circle_in_overlap_window}\``,
    "",
    "## Checks",
    "",
    ...Object.entries(report.checks).map(([name, value]) => `- ${name}: \`${value}\``),
    "",
    `Historical delta explained: \`${report.historical_delta.explained}\``,
    `Notification mode: \`${report.notification_boundary.mode}\``,
    "",
    "This report is read-only. It does not create payments, signatures, webhooks, or chain writes.",
    ""
  ].join("\n");
}

function parseArgs(argv) {
  const options = { rpc: DEFAULT_RPC, circle: DEFAULT_CIRCLE, jsonOut: null, markdownOut: null };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index + 1];
    if (argv[index] === "--rpc") { options.rpc = resolve(value); index += 1; }
    else if (argv[index] === "--circle") { options.circle = resolve(value); index += 1; }
    else if (argv[index] === "--json-out") { options.jsonOut = resolve(value); index += 1; }
    else if (argv[index] === "--markdown-out") { options.markdownOut = resolve(value); index += 1; }
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const rpc = JSON.parse(await readFile(options.rpc, "utf8"));
  const circle = JSON.parse(await readFile(options.circle, "utf8"));
  const report = buildDualSourceReport(rpc, circle);
  if (options.jsonOut) {
    await mkdir(dirname(options.jsonOut), { recursive: true });
    await writeFile(options.jsonOut, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  if (options.markdownOut) {
    await mkdir(dirname(options.markdownOut), { recursive: true });
    await writeFile(options.markdownOut, renderMarkdown(report), "utf8");
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (typeof process !== "undefined" && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
