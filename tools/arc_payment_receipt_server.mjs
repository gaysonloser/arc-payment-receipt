#!/usr/bin/env node

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_EVIDENCE_PATH = resolve(HERE, "../outputs/ArcPaymentReceipt_event_monitor_latest.json");
export const DEFAULT_DUAL_EVIDENCE_PATH = resolve(HERE, "../outputs/ArcPaymentReceipt_dual_source_monitor_latest.json");
export const DEFAULT_CIRCLE_SNAPSHOT_PATH = resolve(HERE, "../outputs/ArcCircleContracts_event_history_latest.json");
export const DEFAULT_VIEWER_PATH = resolve(HERE, "arc_payment_receipt_viewer.html");

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

export async function loadEvidence(path = DEFAULT_EVIDENCE_PATH) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function loadDualEvidence(path = DEFAULT_DUAL_EVIDENCE_PATH) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function loadCircleSnapshot(path = DEFAULT_CIRCLE_SNAPSHOT_PATH) {
  return JSON.parse(await readFile(path, "utf8"));
}

export function createReceiptServer(options = {}) {
  const loadReport = options.loadReport ?? (() => loadEvidence(options.evidencePath));
  const loadDualReport = options.loadDualReport ?? (() => loadDualEvidence(options.dualEvidencePath));
  const loadCircleReport = options.loadCircleReport ?? (() => loadCircleSnapshot(options.circleSnapshotPath));
  const loadViewer = options.loadViewer ?? (() => readFile(options.viewerPath ?? DEFAULT_VIEWER_PATH, "utf8"));

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

      if (url.pathname === "/api/health") {
        const [report, dual, circle] = await Promise.all([loadReport(), loadDualReport(), loadCircleReport()]);
        json(response, 200, {
          status: "ok",
          mode: "read-only",
          contract: report.contract,
          event_count: report.event_count,
          latest_scanned_block: report.range.to,
          dual_source_status: dual.status,
          circle_subscription_state: circle.subscription_state,
          webhook_active: circle.webhook_active,
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
    circleSnapshotPath: DEFAULT_CIRCLE_SNAPSHOT_PATH
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index + 1];
    if (argv[index] === "--host") { options.host = value; index += 1; }
    else if (argv[index] === "--port") { options.port = Number(value); index += 1; }
    else if (argv[index] === "--evidence") { options.evidencePath = resolve(value); index += 1; }
    else if (argv[index] === "--dual-evidence") { options.dualEvidencePath = resolve(value); index += 1; }
    else if (argv[index] === "--circle-snapshot") { options.circleSnapshotPath = resolve(value); index += 1; }
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
