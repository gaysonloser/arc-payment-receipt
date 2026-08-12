import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const HERE = dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);
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
const DOCUMENTATION_ONLY_PATHS = Object.freeze(["docs/ARCHITECTURE.md", "docs/INTERACTION_TRAIL.md"]);
const EXACT_COMMIT_CANDIDATE_PATHS = Object.freeze([
  "README.md",
  "artifacts/PolicySettlementV1.sol/PolicySettlementV1.json",
  "current-mvp/current-release-workbench-manifest.json",
  "current-mvp/web/fixture-engine.mjs",
  "current-mvp/web/navigation-workspace.mjs",
  "current-mvp/web/settlement-case.mjs",
  "docs/ARCHITECTURE.md",
  "docs/INTERACTION_TRAIL.md",
  "tools/arc_payment_receipt_server.mjs",
  "tools/build_current_release_workbench_manifest.mjs",
  "tools/current_mvp_accounting_close.test.mjs",
  "tools/current_mvp_fail_closed_lifecycle.test.mjs",
  "tools/current_mvp_source_binding.test.mjs",
  "tools/current_release_workbench.test.mjs"
]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function entry(path, sourceReference) {
  const destination = join(CURRENT_MVP_ROOT, path);
  const bytes = await readFile(destination);
  const fileStat = await stat(destination);
  const item = { path, bytes: bytes.length, sha256: sha256(bytes), mode: (fileStat.mode & 0o111) ? "100755" : "100644" };
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

async function git(args) {
  const result = await execFileAsync("git", args, { cwd: RELEASE_ROOT, encoding: "utf8" });
  return result.stdout;
}

async function worktreeTruth() {
  const [numstatOutput, rawOutput, statusOutput] = await Promise.all([
    git(["diff", "--numstat", "--"]),
    git(["diff", "--raw", "--no-renames", "--"]),
    git(["status", "--porcelain=v1", "--untracked-files=all", "--"])
  ]);
  const numstat = new Map();
  for (const line of numstatOutput.trim().split("\n").filter(Boolean)) {
    const [additions, deletions, ...pathParts] = line.split("\t");
    numstat.set(pathParts.join("\t"), { additions, deletions });
  }
  const modes = new Map();
  for (const line of rawOutput.trim().split("\n").filter(Boolean)) {
    const match = line.match(/^:(\d{6}) (\d{6}) [0-9a-f]+ [0-9a-f]+ [A-Z]\t(.+)$/);
    if (match) modes.set(match[3], { mode_head: match[1], mode_worktree: match[2] });
  }
  const modifiedPaths = [...numstat.keys()].filter((path) => !EXACT_COMMIT_CANDIDATE_PATHS.includes(path)).sort();
  const snapshots = [];
  for (const path of modifiedPaths) {
    const fileStat = await stat(join(RELEASE_ROOT, path));
    const mode = modes.get(path) ?? { mode_head: null, mode_worktree: (fileStat.mode & 0o111) ? "100755" : "100644" };
    const contentDelta = !(numstat.get(path).additions === "0" && numstat.get(path).deletions === "0");
    const snapshot = {
      path,
      mode_head: mode.mode_head,
      mode_worktree: mode.mode_worktree,
      mode_changed: mode.mode_head !== mode.mode_worktree,
      content_delta: contentDelta,
      excluded: !contentDelta
    };
    if (path === "current-mvp/current-release-workbench-manifest.json") {
      snapshot.self_excluded = true;
      snapshot.hash_excluded = true;
    } else {
      const bytes = await readFile(join(RELEASE_ROOT, path));
      snapshot.bytes = bytes.length;
      snapshot.sha256 = sha256(bytes);
    }
    snapshots.push(snapshot);
  }
  const untrackedPaths = statusOutput.split("\n").filter((line) => line.startsWith("?? ")).map((line) => line.slice(3)).filter(Boolean).sort();
  const publicationCandidatePaths = [];
  for (const path of EXACT_COMMIT_CANDIDATE_PATHS) {
    const item = { path, documentation_only: DOCUMENTATION_ONLY_PATHS.includes(path) };
    if (path === "current-mvp/current-release-workbench-manifest.json") {
      item.self_excluded = true;
      item.hash_excluded = true;
    } else {
      const bytes = await readFile(join(RELEASE_ROOT, path));
      item.bytes = bytes.length;
      item.sha256 = sha256(bytes);
    }
    publicationCandidatePaths.push(item);
  }
  return {
    tracked_modified_count: snapshots.length,
    content_candidate_count: snapshots.filter((item) => item.content_delta && !DOCUMENTATION_ONLY_PATHS.includes(item.path)).length,
    mode_only_non_candidate_count: snapshots.filter((item) => !item.content_delta).length,
    content_candidate_paths: snapshots.filter((item) => item.content_delta && !DOCUMENTATION_ONLY_PATHS.includes(item.path)),
    documentation_only_content_count: snapshots.filter((item) => item.content_delta && DOCUMENTATION_ONLY_PATHS.includes(item.path)).length,
    documentation_only_paths: snapshots.filter((item) => item.content_delta && DOCUMENTATION_ONLY_PATHS.includes(item.path)),
    mode_only_non_candidate_paths: snapshots.filter((item) => !item.content_delta),
    untracked_paths: untrackedPaths,
    publication_candidate_state: "LOCALLY_COMMITTED_PENDING_REMOTE_MAIN_READBACK",
    publication_candidate_count: publicationCandidatePaths.length,
    publication_candidate_paths: publicationCandidatePaths,
    untracked_policy: "must_be_empty_before_manifest_freeze",
    current_worktree_candidate_bound: false,
    self_excluded_manifest_path: "current-mvp/current-release-workbench-manifest.json",
    clean_worktree_rule: "The exact 14-path publication candidate is byte-bound independently of worktree dirtiness; the manifest self-excludes its own bytes to avoid a cycle. Outside that candidate, untracked paths must be empty and only the seven declared mode-only paths may remain."
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
    supportInput("tools/current_mvp_erp_readiness.test.mjs", "test"),
    supportInput("tools/current_mvp_accounting_close.test.mjs", "test"),
    supportInput("tools/current_mvp_fail_closed_lifecycle.test.mjs", "test")
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
    acceptance_state: "GITHUB_TRUE_RECEIPT_ACCEPTED_RELEASE_BINDING_CORRECTION_AUDIT_PENDING",
    current_release_surface_status: {
      github: { status: "TRUE_RECEIPT", current_release_bound: false, published_baseline_binding: true, published_baseline_current_release_bound: true, product_commit: "a63fbcee1b02fb7f6d73a95d928f4f9d5ec2a2c7", receipt_observed_remote_main: "a63fbcee1b02fb7f6d73a95d928f4f9d5ec2a2c7", receipt_parent: "dc239d696d9b6dea1fe8edec483e94fc72581dbd", receipt_tree: "51a9083f0954f1b064b37925c2926c38e6632af9", observed_main_tip: "9795c442f4c80464c2d54639a638f02060265be1", observed_main_parent: "a63fbcee1b02fb7f6d73a95d928f4f9d5ec2a2c7", observed_main_tip_semantics: "receipt_only_metadata_commit", current_worktree_candidate_bound: false, current_worktree_dirty: true, source_readback: "local_git_readback_only; live_remote_dns_unavailable", note: "This is a published baseline receipt only; the dirty local worktree candidate is not bound or published", owner_gate_required: true, historical_lineage_only: false },
      render: { status: "TRUE_RECEIPT", current_release_bound: false, published_baseline_binding: true, published_baseline_current_release_bound: true, observed_commit: "9795c442f4c80464c2d54639a638f02060265be1", comparison: { main_tip: "9795c442f4c80464c2d54639a638f02060265be1", render_commit: "9795c442f4c80464c2d54639a638f02060265be1", aligned: true }, current_worktree_candidate_bound: false, note: "This is a published baseline receipt only; the dirty local worktree candidate is not bound or deployed", owner_gate_required: true, historical_lineage_only: false },
      deck: { status: "TRUE_RECEIPT", current_release_bound: true, published_baseline_binding: true, tag: "programme-final-20260810", historical_lineage_only: false },
      video: { status: "TRUE_RECEIPT", current_release_bound: true, published_baseline_binding: true, tag: "programme-final-20260810", historical_lineage_only: false },
      circle_console: { status: "BLOCKED", blockers: ["subscription_id_missing", "trusted_readback_loader_not_configured"], historical_lineage_only: false },
      encode: { status: "UNPROVEN", historical_lineage_only: true },
      final: { status: "UNPROVEN", historical_lineage_only: true },
      arc_testnet: { status: "UNPROVEN", evidence_binding: "no current-release-bound receipt in public candidate", historical_lineage_only: true },
      erp: {
        status: "VERIFIED_READ_ONLY_CANDIDATE",
        evidence_binding: "privacy-safe H167 supplier-payable readback is embedded in web/workbench/workbench-projection.mjs: paid Purchase Invoice ACC-PINV-2026-00002, submitted Payment Entry ACC-PAY-2026-00009, reconciled Bank Transaction ACC-BTN-2026-00004 and balanced GL; Payment Ledger, Accounting Period, Period Closing Voucher and business close remain not_proven",
        owner_live_readback_binding: true,
        current_worktree_candidate_bound: false,
        public_current_release_bound: false,
        live_erp_mutation: false,
        historical_lineage_only: false
      }
    },
    worktree_truth: await worktreeTruth(),
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
  if (manifest.stable_terminal_freeze !== true || manifest.writer_idle !== true || manifest.acceptance_state !== "GITHUB_TRUE_RECEIPT_ACCEPTED_RELEASE_BINDING_CORRECTION_AUDIT_PENDING") issues.push("freeze_state_missing");
  if (manifest.independent_audit?.model !== "gpt-5.6-sol" || manifest.independent_audit?.reasoning_effort !== "medium" || manifest.independent_audit?.read_only !== true || manifest.independent_audit?.independent !== true || manifest.independent_audit?.status !== "PENDING" || manifest.independent_audit?.self_acceptance !== false) issues.push("audit_boundary_missing");
  if (JSON.stringify(manifest.accepted_request ?? null) !== JSON.stringify(ACCEPTED_PACKET)) issues.push("accepted_packet_binding_missing");
  if (JSON.stringify(manifest.source_request ?? null) !== JSON.stringify(SOURCE_REQUEST)) issues.push("source_request_lineage_missing");
  const expectedSurfaces = {
    github: "TRUE_RECEIPT",
    render: "TRUE_RECEIPT",
    deck: "TRUE_RECEIPT",
    video: "TRUE_RECEIPT",
    circle_console: "BLOCKED",
    encode: "UNPROVEN",
    final: "UNPROVEN",
    arc_testnet: "UNPROVEN",
    erp: "VERIFIED_READ_ONLY_CANDIDATE"
  };
  for (const [surface, expectedStatus] of Object.entries(expectedSurfaces)) {
    const value = manifest.current_release_surface_status?.[surface];
    if (value?.status !== expectedStatus) issues.push(`current_surface_status_invalid:${surface}`);
  }
  const consoleBlockers = manifest.current_release_surface_status?.circle_console?.blockers ?? [];
  if (!consoleBlockers.includes("subscription_id_missing") || !consoleBlockers.includes("trusted_readback_loader_not_configured")) issues.push("circle_console_blockers_missing");
  if (manifest.current_release_surface_status?.final?.status === "TRUE_RECEIPT" || manifest.current_release_surface_status?.encode?.status === "TRUE_RECEIPT") issues.push("unproven_surface_promoted");
  const githubSurface = manifest.current_release_surface_status?.github;
  const renderSurface = manifest.current_release_surface_status?.render;
  const erpSurface = manifest.current_release_surface_status?.erp;
  if (githubSurface?.current_release_bound !== false || githubSurface?.published_baseline_binding !== true || githubSurface?.published_baseline_current_release_bound !== true || githubSurface?.current_worktree_candidate_bound !== false || Object.hasOwn(githubSurface, "candidate_binding")) issues.push("github_candidate_binding_ambiguous");
  if (renderSurface?.current_release_bound !== false || renderSurface?.published_baseline_binding !== true || renderSurface?.published_baseline_current_release_bound !== true || renderSurface?.current_worktree_candidate_bound !== false) issues.push("render_candidate_binding_ambiguous");
  if (erpSurface?.current_worktree_candidate_bound !== false || erpSurface?.public_current_release_bound !== false || erpSurface?.owner_live_readback_binding !== true || Object.hasOwn(erpSurface, "candidate_binding") || Object.hasOwn(erpSurface, "public_remote_binding")) issues.push("erp_candidate_binding_ambiguous");
  const publicationCandidate = manifest.worktree_truth?.publication_candidate_paths ?? [];
  const selfExcludedCandidate = publicationCandidate.find((item) => item.path === "current-mvp/current-release-workbench-manifest.json");
  if (manifest.worktree_truth?.tracked_modified_count !== 7 || manifest.worktree_truth?.content_candidate_count !== 0 || manifest.worktree_truth?.mode_only_non_candidate_count !== 7 || manifest.worktree_truth?.documentation_only_content_count !== 0 || manifest.worktree_truth?.publication_candidate_state !== "LOCALLY_COMMITTED_PENDING_REMOTE_MAIN_READBACK" || manifest.worktree_truth?.publication_candidate_count !== 14 || publicationCandidate.map((item) => item.path).sort().join(",") !== EXACT_COMMIT_CANDIDATE_PATHS.slice().sort().join(",") || manifest.worktree_truth?.untracked_paths?.length !== 0 || manifest.worktree_truth?.current_worktree_candidate_bound !== false || manifest.worktree_truth?.self_excluded_manifest_path !== "current-mvp/current-release-workbench-manifest.json" || selfExcludedCandidate?.self_excluded !== true || selfExcludedCandidate?.hash_excluded !== true) issues.push("worktree_candidate_scope_invalid");
  for (const item of publicationCandidate) {
    if (item.self_excluded) continue;
    const bytes = await readFile(join(supportRoot, item.path));
    if (bytes.length !== item.bytes) issues.push(`publication_candidate_bytes_mismatch:${item.path}`);
    if (sha256(bytes) !== item.sha256) issues.push(`publication_candidate_sha256_mismatch:${item.path}`);
  }
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
    ["tools/current_mvp_erp_readiness.test.mjs", "test"],
    ["tools/current_mvp_accounting_close.test.mjs", "test"],
    ["tools/current_mvp_fail_closed_lifecycle.test.mjs", "test"]
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
      const fileStat = await stat(destination);
      const mode = (fileStat.mode & 0o111) ? "100755" : "100644";
      if (item.mode !== mode) issues.push(`mode_mismatch:${path}`);
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
