import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const RELEASE_ROOT = resolve(HERE, "..");
export const CURRENT_MVP_ROOT = join(RELEASE_ROOT, "current-mvp");
export const OUTPUT_PATH = join(CURRENT_MVP_ROOT, "current-release-workbench-manifest.json");
export const BASE_MANIFEST_PATH = join(CURRENT_MVP_ROOT, "mvp-publication-staging-rc1-manifest.json");
export const ACCEPTED_PACKET = Object.freeze({
  id: "programme-current-release-product-completion-sprint-14-owner-09-domain-bridge-negative-test-request-v1",
  packet_object_sha256: "70a29799ff77011278b3aafdc72e6bb59a5f2dccc12a55c19a250f4a356923c7",
  exchange_sha256: "37c1acfcd035ee56b39167b93a069e866b32010dadac84fe818c4c169d1e3c4a"
});
export const SOURCE_REQUEST = Object.freeze({
  id: "programme-current-release-product-completion-sprint-root-correction-request-v1",
  packet_object_sha256: "577762814fd25363649a6b50c0733a5aef9e354093778981a8d84abbee095e50",
  exchange_sha256: "6eea4843ef52f4035c3a6ad5a3bfa87530e1cd9bf1c83ef5696a3d4d7ac78a6f"
});

const WORKBENCH_ENTRIES = Object.freeze([
  ["web/c15-contract.mjs", "programme/verified-milestone-close/web/c15-contract.mjs"],
  ["web/c15-upstream-authority.mjs", "programme/verified-milestone-close/web/c15-upstream-authority.mjs"],
  ["web/settlement-case.mjs", "programme/verified-milestone-close/web/settlement-case.mjs"],
  ["web/workbench/workbench-projection.mjs", "release/arc-payment-receipt-public/current-mvp/web/workbench/workbench-projection.mjs"],
  ["current-release-final-assets-evidence.json", "release/arc-payment-receipt-public/current-mvp/current-release-final-assets-evidence.json"]
]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function entry(path, sourceReference) {
  const destination = join(CURRENT_MVP_ROOT, path);
  const bytes = await readFile(destination);
  const item = { path, bytes: bytes.length, sha256: sha256(bytes) };
  if (sourceReference) item.source_reference = sourceReference;
  if (sourceReference && sourceReference.startsWith("release/")) item.source_is_candidate = true;
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

export async function buildManifest() {
  const baseBytes = await readFile(BASE_MANIFEST_PATH);
  const base = JSON.parse(baseBytes.toString("utf8"));
  const historicalByPath = new Map(base.entries.map((item) => [item.path, item]));
  const baseEntries = [];
  for (const item of base.entries) {
    const current = await entry(item.path);
    const historical = historicalByPath.get(item.path);
    baseEntries.push({
      ...current,
      historical_sha256: historical.sha256,
      historical_bytes: historical.bytes,
      current_release_override: current.sha256 !== historical.sha256 || current.bytes !== historical.bytes
    });
  }
  const workbenchEntries = [];
  for (const [destination, source] of WORKBENCH_ENTRIES) workbenchEntries.push(await entry(destination, source));
  const verificationInputs = await Promise.all([
    supportInput("tools/current_release_workbench.test.mjs", "test"),
    supportInput("tools/build_current_release_workbench_manifest.mjs", "verifier"),
    supportInput("tools/current_mvp_source_binding.mjs", "verifier"),
    supportInput("tools/current_mvp_source_binding.test.mjs", "test"),
    supportInput("tools/circle_contract_webhook_gate.mjs", "verifier"),
    supportInput("tools/circle_console_receipt.test.mjs", "test"),
    supportInput("tools/arc_payment_receipt_server.mjs", "runtime"),
    supportInput("tools/circle_console_server.test.mjs", "test"),
    supportInput("tools/current_mvp_erp_readiness.mjs", "verifier"),
    supportInput("tools/current_mvp_erp_readiness.test.mjs", "test")
  ]);
  return {
    schema: "arc-erp.current-release-workbench-manifest.v1",
    release_id: "verified-milestone-close-current-mvp-workbench-rc1",
    base_release_id: base.spec_id,
    base_manifest_sha256: sha256(baseBytes),
    accepted_request: ACCEPTED_PACKET,
    source_request: SOURCE_REQUEST,
    external_actions: 0,
    live_arc: false,
    live_erp: false,
    html_css_write: false,
    direct_erp_mutation: false,
    stable_terminal_freeze: true,
    writer_idle: true,
    acceptance_state: "LOCAL_IMPLEMENTATION_AND_REPRODUCIBLE_TESTS_COMPLETE_FRESH_SOL_MEDIUM_AUDIT_PENDING",
    current_release_surface_status: {
      github: { status: "TRUE_RECEIPT_HISTORICAL", current_release_bound: false, candidate_binding: false, remote_main: "db52d69705579f249af77ab7d49ad6e2cd686a2f", note: "remote main predates H167/H168 candidate files; exact commit+push owner gate required", owner_gate_required: true, historical_lineage_only: true },
      render: { status: "TRUE_RECEIPT", current_release_bound: false, observed_commit: "be6d807637849b1c726f0ed32ac03638e0ccb111", note: "real receipt predates current public HEAD; current-release re-readback remains required", historical_lineage_only: true },
      deck: { status: "TRUE_RECEIPT", current_release_bound: true, tag: "programme-final-20260810", historical_lineage_only: false },
      video: { status: "TRUE_RECEIPT", current_release_bound: true, tag: "programme-final-20260810", historical_lineage_only: false },
      circle_console: { status: "BLOCKED", blockers: ["subscription_id_missing", "trusted_readback_loader_not_configured"], historical_lineage_only: false },
      encode: { status: "UNPROVEN", historical_lineage_only: true },
      final: { status: "UNPROVEN", historical_lineage_only: true },
      arc_testnet: { status: "UNPROVEN", evidence_binding: "no current-release-bound receipt in public candidate", historical_lineage_only: true },
      erp: { status: "UNPROVEN", evidence_binding: "read-only owner evidence is not embedded in public candidate", historical_lineage_only: true }
    },
    verification_inputs: verificationInputs,
    independent_audit: { model: "gpt-5.6-sol", reasoning_effort: "medium", read_only: true, independent: true, status: "PENDING", self_acceptance: false },
    entry_count: baseEntries.length + workbenchEntries.length,
    manifest_sha256_self_excluded: true,
    entries: [...baseEntries, ...workbenchEntries].sort((a, b) => a.path.localeCompare(b.path))
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
  if (manifest.manifest_sha256_self_excluded !== true) issues.push("manifest_self_exclusion_missing");
  if (manifest.external_actions !== 0 || manifest.live_arc !== false || manifest.live_erp !== false || manifest.html_css_write !== false || manifest.direct_erp_mutation !== false) issues.push("unsafe_boundary");
  if (manifest.stable_terminal_freeze !== true || manifest.writer_idle !== true || manifest.acceptance_state !== "LOCAL_IMPLEMENTATION_AND_REPRODUCIBLE_TESTS_COMPLETE_FRESH_SOL_MEDIUM_AUDIT_PENDING") issues.push("freeze_state_missing");
  if (manifest.independent_audit?.model !== "gpt-5.6-sol" || manifest.independent_audit?.reasoning_effort !== "medium" || manifest.independent_audit?.read_only !== true || manifest.independent_audit?.independent !== true || manifest.independent_audit?.status !== "PENDING" || manifest.independent_audit?.self_acceptance !== false) issues.push("audit_boundary_missing");
  if (JSON.stringify(manifest.accepted_request ?? null) !== JSON.stringify(ACCEPTED_PACKET)) issues.push("accepted_packet_binding_missing");
  if (JSON.stringify(manifest.source_request ?? null) !== JSON.stringify(SOURCE_REQUEST)) issues.push("source_request_lineage_missing");
  const expectedSurfaces = {
    github: "TRUE_RECEIPT_HISTORICAL",
    render: "TRUE_RECEIPT",
    deck: "TRUE_RECEIPT",
    video: "TRUE_RECEIPT",
    circle_console: "BLOCKED",
    encode: "UNPROVEN",
    final: "UNPROVEN",
    arc_testnet: "UNPROVEN",
    erp: "UNPROVEN"
  };
  for (const [surface, expectedStatus] of Object.entries(expectedSurfaces)) {
    const value = manifest.current_release_surface_status?.[surface];
    if (value?.status !== expectedStatus) issues.push(`current_surface_status_invalid:${surface}`);
  }
  const consoleBlockers = manifest.current_release_surface_status?.circle_console?.blockers ?? [];
  if (!consoleBlockers.includes("subscription_id_missing") || !consoleBlockers.includes("trusted_readback_loader_not_configured")) issues.push("circle_console_blockers_missing");
  if (manifest.current_release_surface_status?.final?.status === "TRUE_RECEIPT" || manifest.current_release_surface_status?.encode?.status === "TRUE_RECEIPT") issues.push("unproven_surface_promoted");
  const expectedInputs = [
    ["tools/current_release_workbench.test.mjs", "test"],
    ["tools/build_current_release_workbench_manifest.mjs", "verifier"],
    ["tools/current_mvp_source_binding.mjs", "verifier"],
    ["tools/current_mvp_source_binding.test.mjs", "test"],
    ["tools/circle_contract_webhook_gate.mjs", "verifier"],
    ["tools/circle_console_receipt.test.mjs", "test"],
    ["tools/arc_payment_receipt_server.mjs", "runtime"],
    ["tools/circle_console_server.test.mjs", "test"],
    ["tools/current_mvp_erp_readiness.mjs", "verifier"],
    ["tools/current_mvp_erp_readiness.test.mjs", "test"]
  ];
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
  const expected = [...expectedBase.entries.map((item) => item.path), ...WORKBENCH_ENTRIES.map(([path]) => path)].sort();
  const actualEntries = Array.isArray(manifest.entries) ? manifest.entries.map((item) => item.path).sort() : [];
  if (JSON.stringify(actualEntries) !== JSON.stringify(expected)) issues.push("entry_scope_or_order_mismatch");
  if (new Set(actualEntries).size !== actualEntries.length) issues.push("duplicate_manifest_path");
  for (const item of manifest.entries ?? []) {
    const path = String(item.path ?? "");
    const destination = join(root, path);
    try {
      const bytes = await readFile(destination);
      if (bytes.length !== item.bytes) issues.push(`bytes_mismatch:${path}`);
      if (sha256(bytes) !== item.sha256) issues.push(`sha256_mismatch:${path}`);
    } catch (error) {
      issues.push(`missing_file:${path}:${error.code ?? error.message}`);
    }
  }
  const actualFiles = (await listFiles(root)).filter((path) => !["current-release-workbench-manifest.json", "mvp-publication-staging-rc1-manifest.json"].includes(path)).sort();
  for (const extra of actualFiles.filter((path) => !expected.includes(path))) issues.push(`extra_file:${extra}`);
  for (const missing of expected.filter((path) => !actualFiles.includes(path))) issues.push(`missing_file:${missing}`);
  return { valid: issues.length === 0, issues, entry_count: actualEntries.length, manifest_sha256: sha256(manifestBytes) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const manifest = await buildManifest();
  await writeFile(OUTPUT_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const bytes = await readFile(OUTPUT_PATH);
  console.log(JSON.stringify({ path: relative(RELEASE_ROOT, OUTPUT_PATH), bytes: bytes.length, sha256: sha256(bytes), entry_count: manifest.entry_count }, null, 2));
}
