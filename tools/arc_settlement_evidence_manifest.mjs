#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  DEFAULT_ENTERPRISE_EVIDENCE_PATH,
  buildSettlementEvidenceManifest,
  verifySettlementEvidenceManifest
} from "./arc_payment_receipt_server.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_MANIFEST_PATH = resolve(HERE, "../outputs/ArcPaymentReceipt_settlement_evidence_manifest_latest.json");

function parseArgs(argv) {
  const options = {
    enterpriseEvidencePath: DEFAULT_ENTERPRISE_EVIDENCE_PATH,
    outputPath: DEFAULT_MANIFEST_PATH,
    verifyPath: null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index + 1];
    if (argv[index] === "--enterprise-evidence") {
      options.enterpriseEvidencePath = resolve(value);
      index += 1;
    } else if (argv[index] === "--output") {
      options.outputPath = resolve(value);
      index += 1;
    } else if (argv[index] === "--verify") {
      options.verifyPath = resolve(value);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argv[index]}`);
    }
  }
  return options;
}

export async function exportSettlementEvidenceManifest(options = {}) {
  const enterpriseEvidencePath = options.enterpriseEvidencePath ?? DEFAULT_ENTERPRISE_EVIDENCE_PATH;
  const outputPath = options.outputPath ?? DEFAULT_MANIFEST_PATH;
  const bundle = JSON.parse(await readFile(enterpriseEvidencePath, "utf8"));
  const manifest = buildSettlementEvidenceManifest(bundle);
  const verification = verifySettlementEvidenceManifest(manifest);
  if (verification.status !== "valid") {
    throw new Error(`Generated manifest failed verification: ${verification.failed_checks.join(", ")}`);
  }
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { outputPath, manifest, verification };
}

export async function verifySettlementEvidenceManifestFile(path) {
  const manifest = JSON.parse(await readFile(path, "utf8"));
  return verifySettlementEvidenceManifest(manifest);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.verifyPath) {
    const verification = await verifySettlementEvidenceManifestFile(options.verifyPath);
    process.stdout.write(`${JSON.stringify(verification, null, 2)}\n`);
    if (verification.status !== "valid") process.exitCode = 1;
    return;
  }

  const result = await exportSettlementEvidenceManifest(options);
  process.stdout.write(`${JSON.stringify({
    status: result.verification.status,
    output: result.outputPath,
    digest: result.manifest.integrity.digest,
    scope: result.verification.scope
  }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
