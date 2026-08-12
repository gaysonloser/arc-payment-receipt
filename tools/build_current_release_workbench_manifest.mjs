import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { CURRENT_ERP_VERIFIED_READ_ONLY_EVIDENCE } from "../current-mvp/web/workbench/workbench-projection.mjs";
import { verifyEmbeddedCurrentMvpErpProjection } from "./current_mvp_erp_readiness.mjs";
import { buildCurrentReleaseSurfaceReadinessView } from "./arc_payment_receipt_server.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const RELEASE_ROOT = resolve(HERE, "..");
export const CURRENT_MVP_ROOT = join(RELEASE_ROOT, "current-mvp");
export const OUTPUT_PATH = join(CURRENT_MVP_ROOT, "current-release-workbench-manifest.json");
export const BASE_MANIFEST_PATH = join(CURRENT_MVP_ROOT, "mvp-publication-staging-rc1-manifest.json");
export const CONTENT_MANIFEST_SCHEMA = "arc-erp.current-release-content-manifest.v2";
export const RELEASE_ID = "verified-milestone-close-current-mvp-workbench-rc1";
export const ERP_EVIDENCE_BASE_COMMIT = "efd137cb253db9351fef671ea4a3df0aafe66597";
export const RENDER_SERVICE_ID = "srv-d9cumml8nd3s73c9nehg";
export const RENDER_SERVICE_URL = "https://arc-payment-receipt.onrender.com/";
export const RENDER_STATUS = "EXTERNAL_IMMUTABLE_RECEIPT_REQUIRED";

const WORKBENCH_ENTRIES = Object.freeze([
  ["web/c15-contract.mjs", "programme/verified-milestone-close/web/c15-contract.mjs"],
  ["web/c15-upstream-authority.mjs", "programme/verified-milestone-close/web/c15-upstream-authority.mjs"],
  ["web/settlement-case.mjs", "programme/verified-milestone-close/web/settlement-case.mjs"],
  ["web/workbench/workbench-projection.mjs", "release/arc-payment-receipt-public/current-mvp/web/workbench/workbench-projection.mjs"],
  ["current-release-final-assets-evidence.json", "release/arc-payment-receipt-public/current-mvp/current-release-final-assets-evidence.json"]
]);

const VERIFICATION_INPUTS = Object.freeze([
  ["tools/current_release_workbench.test.mjs", "test"],
  ["tools/current_mvp_engineering_support.test.mjs", "test"],
  ["tools/build_current_release_workbench_manifest.mjs", "verifier"],
  ["tools/current_mvp_source_binding.mjs", "verifier"],
  ["tools/current_mvp_source_binding.test.mjs", "test"],
  ["tools/circle_contract_webhook_gate.mjs", "verifier"],
  ["tools/circle_contract_webhook_gate.test.mjs", "test"],
  ["tools/circle_webhook_store.mjs", "runtime"],
  ["tools/circle_webhook_store.test.mjs", "test"],
  ["tools/circle_webhook_server.test.mjs", "test"],
  ["tools/circle_console_receipt.test.mjs", "test"],
  ["tools/arc_payment_receipt_server.mjs", "runtime"],
  ["tools/arc_payment_receipt_server.test.mjs", "test"],
  ["tools/circle_console_server.test.mjs", "test"],
  ["tools/current_mvp_erp_readiness.mjs", "verifier"],
  ["tools/current_mvp_erp_readiness.test.mjs", "test"],
  ["tools/current_mvp_accounting_close.test.mjs", "test"],
  ["tools/current_mvp_fail_closed_lifecycle.test.mjs", "test"]
]);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};

async function entry(path, sourceReference) {
  const destination = join(CURRENT_MVP_ROOT, path);
  const bytes = await readFile(destination);
  const fileStat = await stat(destination);
  const item = { path, bytes: bytes.length, sha256: sha256(bytes), mode: (fileStat.mode & 0o111) ? "100755" : "100644" };
  if (sourceReference) item.source_reference = sourceReference;
  if (sourceReference?.startsWith("release/")) item.source_is_candidate = true;
  return item;
}

async function supportInput(path, role) {
  const bytes = await readFile(join(RELEASE_ROOT, path));
  return { path, role, bytes: bytes.length, sha256: sha256(bytes) };
}

async function listFiles(root, current = root) {
  const files = [];
  for (const item of await readdir(current, { withFileTypes: true })) {
    const path = join(current, item.name);
    if (item.isDirectory()) files.push(...await listFiles(root, path));
    else if (item.isFile()) files.push(relative(root, path).split(sep).join("/"));
  }
  return files.sort();
}

function releaseBinding(contentIdentitySha256) {
  return {
    model: "content_addressed_external_receipt",
    content_identity_sha256: contentIdentitySha256,
    self_authenticating_commit: false,
    github_commit: null,
    render_deployment_id: null,
    render_deployed_commit: null,
    external_immutable_receipt_required: true,
    receipt_owner: "workspace delivery control",
    rule: "GitHub commit and Render deployment are verified from external immutable receipts; embedding a future commit in its own content manifest is forbidden."
  };
}

function deliverySurfaces({ erpReadiness, surfaceReadiness }) {
  return {
    github: { status: "EXTERNAL_IMMUTABLE_RECEIPT_REQUIRED", current_release_bound: false, branch: "main", commit: null, receipt_location: "external", external_actions: 0 },
    render: { status: RENDER_STATUS, current_release_bound: false, service_id: RENDER_SERVICE_ID, service_url: RENDER_SERVICE_URL, deployment_id: null, deployed_commit: null, receipt_location: "external", external_actions: 0 },
    deck: { status: "PUBLISHED_BASELINE_RECEIPT", tag: "programme-final-20260810", historical_lineage_only: false },
    video: { status: "PUBLISHED_BASELINE_RECEIPT", tag: "programme-final-20260810", historical_lineage_only: false },
    circle_console: {
      status: "BLOCKED",
      blockers: ["subscription_id_missing", "webhook_history_source_missing", "event_history_source_missing", "trusted_readback_loader_not_configured"],
      trusted_readback_contract: {
        schema: "arc.circle-console-trusted-readback.v1",
        status: "not_ready_fail_closed",
        network: "ARC-TESTNET",
        chain_id: 5042002,
        contract_address: "0xc7682649a1aa60d0f74825ad2b812ee062178047",
        event_signature: "PolicyCreated(bytes32,address,address,address,uint256,bytes32,bytes32,uint64,uint64)",
        subscription_id_required: true,
        release_commit_required: true,
        webhook_history: { kind: "circle_console_webhook_history", url_required: true, http_status: 200, authenticated: true },
        event_history: { kind: "circle_contract_event_history", url_required: true, http_status: 200, authenticated: true },
        loader: { injected_only: true, calls_external_api: false, creates_subscription: false }
      }
    },
    encode: { status: "UNPROVEN", readiness: surfaceReadiness.encode },
    final: { status: "UNPROVEN", readiness: surfaceReadiness.final },
    arc_testnet: {
      status: "VERIFIED_READ_ONLY_CHAIN_RECEIPT",
      readiness: surfaceReadiness.arc_testnet,
      evidence_binding: "Official Arc RPC proves the PolicySettlementV1 deployment and current-contract createPolicy/PolicyCreated/getPolicy readback; this does not prove settlement execution, ERP posting or business close."
    },
    erp: {
      status: "VERIFIED_READ_ONLY_CANDIDATE",
      owner_live_readback_binding: true,
      current_release_bound: false,
      live_erp_mutation: false,
      erp_readiness: erpReadiness,
      business_close: "not_proven"
    }
  };
}

export async function buildManifest() {
  const baseBytes = await readFile(BASE_MANIFEST_PATH);
  const base = JSON.parse(baseBytes.toString("utf8"));
  const historicalByPath = new Map(base.entries.map((item) => [item.path, item]));
  const baseEntries = [];
  for (const item of base.entries) {
    const current = await entry(item.path);
    const historical = historicalByPath.get(item.path);
    baseEntries.push({ ...current, historical_sha256: historical.sha256, historical_bytes: historical.bytes, current_release_override: current.sha256 !== historical.sha256 || current.bytes !== historical.bytes });
  }
  const workbenchEntries = [];
  for (const [destination, source] of WORKBENCH_ENTRIES) workbenchEntries.push(await entry(destination, source));
  const entries = [...baseEntries, ...workbenchEntries].sort((a, b) => a.path.localeCompare(b.path));
  const contentIdentitySha256 = sha256(Buffer.from(canonical(entries.map(({ path, bytes, sha256: digest, mode }) => ({ path, bytes, sha256: digest, mode })))));
  const verificationInputs = await Promise.all(VERIFICATION_INPUTS.map(([path, role]) => supportInput(path, role)));
  const erpReadiness = verifyEmbeddedCurrentMvpErpProjection({
    release: { release_id: RELEASE_ID, commit_sha: ERP_EVIDENCE_BASE_COMMIT, manifest_sha256: sha256(baseBytes) },
    evidence: CURRENT_ERP_VERIFIED_READ_ONLY_EVIDENCE
  });
  const surfaceReadiness = buildCurrentReleaseSurfaceReadinessView({ now: "2026-08-12T00:00:00.000Z" });
  return {
    schema: CONTENT_MANIFEST_SCHEMA,
    release_id: RELEASE_ID,
    base_release_id: base.spec_id,
    base_manifest_sha256: sha256(baseBytes),
    content_identity_sha256: contentIdentitySha256,
    manifest_sha256_self_excluded: true,
    release_binding: releaseBinding(contentIdentitySha256),
    boundaries: { external_actions: 0, local_fixture_is_live_arc: false, local_fixture_is_live_erp: false, direct_erp_mutation: false, chain_success_implies_erp_posting: false, chain_success_implies_business_close: false },
    delivery_surfaces: deliverySurfaces({ erpReadiness, surfaceReadiness }),
    verification_inputs: verificationInputs,
    entry_count: entries.length,
    entries
  };
}

export async function verifyCurrentReleaseWorkbenchManifest({
  root = CURRENT_MVP_ROOT,
  manifestPath = join(root, "current-release-workbench-manifest.json"),
  supportRoot = RELEASE_ROOT
} = {}) {
  const issues = [];
  let manifest;
  let manifestBytes;
  try {
    manifestBytes = await readFile(manifestPath);
    manifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch (error) {
    return { valid: false, issues: [`manifest_unreadable:${error.code ?? error.message}`] };
  }
  if (manifest.schema !== CONTENT_MANIFEST_SCHEMA || manifest.release_id !== RELEASE_ID) issues.push("manifest_identity_invalid");
  if (manifest.manifest_sha256_self_excluded !== true) issues.push("manifest_self_exclusion_missing");
  const boundaries = manifest.boundaries ?? {};
  if (boundaries.external_actions !== 0 || boundaries.local_fixture_is_live_arc !== false || boundaries.local_fixture_is_live_erp !== false || boundaries.direct_erp_mutation !== false || boundaries.chain_success_implies_erp_posting !== false || boundaries.chain_success_implies_business_close !== false) issues.push("unsafe_boundary");
  const binding = manifest.release_binding ?? {};
  if (binding.model !== "content_addressed_external_receipt" || binding.content_identity_sha256 !== manifest.content_identity_sha256 || binding.self_authenticating_commit !== false || binding.github_commit !== null || binding.render_deployment_id !== null || binding.render_deployed_commit !== null || binding.external_immutable_receipt_required !== true) issues.push("release_binding_contract_invalid");
  const serialized = JSON.stringify(manifest);
  if (/"(?:accepted_request|source_request|worktree_truth|independent_audit|packet_id|exchange_sha256|owner_gate)"/.test(serialized)) issues.push("internal_governance_metadata_exposed");
  const surfaces = manifest.delivery_surfaces ?? {};
  if (surfaces.github?.status !== "EXTERNAL_IMMUTABLE_RECEIPT_REQUIRED" || surfaces.github?.commit !== null || surfaces.github?.current_release_bound !== false || surfaces.github?.external_actions !== 0) issues.push("github_receipt_boundary_invalid");
  if (surfaces.render?.status !== RENDER_STATUS || surfaces.render?.service_id !== RENDER_SERVICE_ID || surfaces.render?.deployment_id !== null || surfaces.render?.deployed_commit !== null || surfaces.render?.current_release_bound !== false || surfaces.render?.external_actions !== 0) issues.push("render_receipt_boundary_invalid");
  if (surfaces.circle_console?.status !== "BLOCKED" || surfaces.encode?.status !== "UNPROVEN" || surfaces.final?.status !== "UNPROVEN" || surfaces.arc_testnet?.status !== "VERIFIED_READ_ONLY_CHAIN_RECEIPT" || surfaces.erp?.status !== "VERIFIED_READ_ONLY_CANDIDATE") issues.push("surface_status_invalid");
  if (surfaces.erp?.live_erp_mutation !== false || surfaces.erp?.business_close !== "not_proven" || surfaces.erp?.current_release_bound !== false) issues.push("erp_boundary_invalid");
  for (const surface of ["encode", "final"]) {
    if (surfaces[surface]?.readiness?.status !== "UNPROVEN" || surfaces[surface]?.readiness?.current_release_bound !== false || surfaces[surface]?.readiness?.external_actions !== 0) issues.push(`surface_readiness_invalid:${surface}`);
  }
  const expectedInputs = VERIFICATION_INPUTS;
  if (!Array.isArray(manifest.verification_inputs) || manifest.verification_inputs.length !== expectedInputs.length) issues.push("verification_inputs_missing");
  for (const [path, role] of expectedInputs) {
    const item = manifest.verification_inputs?.find((candidate) => candidate.path === path && candidate.role === role);
    if (!item) { issues.push(`verification_input_missing:${path}`); continue; }
    try {
      const bytes = await readFile(join(supportRoot, path));
      if (bytes.length !== item.bytes) issues.push(`verification_input_bytes_mismatch:${path}`);
      if (sha256(bytes) !== item.sha256) issues.push(`verification_input_sha256_mismatch:${path}`);
    } catch (error) {
      issues.push(`verification_input_unreadable:${path}:${error.code ?? error.message}`);
    }
  }
  const expectedBase = JSON.parse((await readFile(join(root, "mvp-publication-staging-rc1-manifest.json"))).toString("utf8"));
  const expectedBaseBytes = await readFile(join(root, "mvp-publication-staging-rc1-manifest.json"));
  if (manifest.base_release_id !== expectedBase.spec_id || manifest.base_manifest_sha256 !== sha256(expectedBaseBytes)) issues.push("base_manifest_binding_invalid");
  const expectedErpReadiness = verifyEmbeddedCurrentMvpErpProjection({ release: { release_id: RELEASE_ID, commit_sha: ERP_EVIDENCE_BASE_COMMIT, manifest_sha256: sha256(expectedBaseBytes) }, evidence: CURRENT_ERP_VERIFIED_READ_ONLY_EVIDENCE });
  const actualErpReadiness = surfaces.erp?.erp_readiness;
  if (actualErpReadiness?.valid !== expectedErpReadiness.valid || actualErpReadiness?.status !== expectedErpReadiness.status || actualErpReadiness?.business_close !== "not_proven" || actualErpReadiness?.live_erp !== false || actualErpReadiness?.external_actions !== 0 || actualErpReadiness?.verification_fingerprint !== expectedErpReadiness.verification_fingerprint) issues.push("erp_readiness_binding_invalid");
  const expectedPaths = [...expectedBase.entries.map((item) => item.path), ...WORKBENCH_ENTRIES.map(([path]) => path)].sort();
  const actualEntries = Array.isArray(manifest.entries) ? manifest.entries : [];
  const actualPaths = actualEntries.map((item) => item.path).sort();
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths) || new Set(actualPaths).size !== actualPaths.length || manifest.entry_count !== actualEntries.length) issues.push("entry_scope_or_order_mismatch");
  for (const item of actualEntries) {
    const destination = join(root, String(item.path ?? ""));
    try {
      const bytes = await readFile(destination);
      if (bytes.length !== item.bytes) issues.push(`bytes_mismatch:${item.path}`);
      if (sha256(bytes) !== item.sha256) issues.push(`sha256_mismatch:${item.path}`);
      const fileStat = await stat(destination);
      if (item.mode !== ((fileStat.mode & 0o111) ? "100755" : "100644")) issues.push(`mode_mismatch:${item.path}`);
    } catch (error) {
      issues.push(`missing_file:${item.path}:${error.code ?? error.message}`);
    }
  }
  const identity = sha256(Buffer.from(canonical(actualEntries.map(({ path, bytes, sha256: digest, mode }) => ({ path, bytes, sha256: digest, mode })))))
  if (manifest.content_identity_sha256 !== identity) issues.push("content_identity_mismatch");
  const actualFiles = (await listFiles(root)).filter((path) => !["current-release-workbench-manifest.json", "mvp-publication-staging-rc1-manifest.json"].includes(path)).sort();
  for (const extra of actualFiles.filter((path) => !expectedPaths.includes(path))) issues.push(`extra_file:${extra}`);
  for (const missing of expectedPaths.filter((path) => !actualFiles.includes(path))) issues.push(`missing_file:${missing}`);
  return { valid: issues.length === 0, issues, entry_count: actualEntries.length, content_identity_sha256: manifest.content_identity_sha256, manifest_sha256: sha256(manifestBytes) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const manifest = await buildManifest();
  await writeFile(OUTPUT_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const result = await verifyCurrentReleaseWorkbenchManifest();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.valid) process.exitCode = 1;
}
