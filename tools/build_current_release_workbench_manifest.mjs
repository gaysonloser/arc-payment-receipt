import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { CURRENT_ERP_VERIFIED_READ_ONLY_EVIDENCE } from "../current-mvp/web/workbench/workbench-projection.mjs";
import { verifyEmbeddedCurrentMvpErpProjection } from "./current_mvp_erp_readiness.mjs";
import { buildCurrentReleaseSurfaceReadinessView } from "./arc_payment_receipt_server.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);
export const RELEASE_ROOT = resolve(HERE, "..");
export const CURRENT_MVP_ROOT = join(RELEASE_ROOT, "current-mvp");
export const OUTPUT_PATH = join(CURRENT_MVP_ROOT, "current-release-workbench-manifest.json");
export const BASE_MANIFEST_PATH = join(CURRENT_MVP_ROOT, "mvp-publication-staging-rc1-manifest.json");
export const ACCEPTED_PACKET = Object.freeze({
  id: "programme-current-release-h199-h198-pass-consume-render-owner-gate-v1",
  packet_object_sha256: "a4a7f1a900e7e56b594d7965e9f2f718eabbd09cb641678cf670afbdc03af9ed",
  exchange_sha256: "15e8325141ca719607687b4a3482a8e75ab73d6fc520eebc5ecd0f4cb5daec30"
});
export const SOURCE_REQUEST = Object.freeze({
  id: "programme-current-release-h198-h197-selector-transition-truth-correction-fresh-sol-medium-audit-v1",
  packet_object_sha256: "294abd691d6e20c60915349f5f7b2b38c9d4545c730e06815816d2d326eb9748",
  exchange_sha256: "0677465352fcaaafc4b356d7f9f4202528eb5a37bf0ac2fdcc9074c8db2698d0"
});

const WORKBENCH_ENTRIES = Object.freeze([
  ["web/c15-contract.mjs", "programme/verified-milestone-close/web/c15-contract.mjs"],
  ["web/c15-upstream-authority.mjs", "programme/verified-milestone-close/web/c15-upstream-authority.mjs"],
  ["web/settlement-case.mjs", "programme/verified-milestone-close/web/settlement-case.mjs"],
  ["web/workbench/workbench-projection.mjs", "release/arc-payment-receipt-public/current-mvp/web/workbench/workbench-projection.mjs"],
  ["current-release-final-assets-evidence.json", "release/arc-payment-receipt-public/current-mvp/current-release-final-assets-evidence.json"]
]);
const DOCUMENTATION_ONLY_PATHS = Object.freeze(["docs/ARCHITECTURE.md", "docs/INTERACTION_TRAIL.md"]);
export const CURRENT_RELEASE_COMMIT = "4f26c6aa410547f16e82f134054c1398589540f8";
export const RENDER_CURRENT_DEPLOYED_COMMIT = "83becbb58bb88be12cabf129af784db79747e958";
export const RENDER_SERVICE_ID = "srv-d9cumml8nd3s73c9nehg";
export const RENDER_SERVICE_URL = "https://arc-payment-receipt.onrender.com/";
export const RENDER_CURRENT_DEPLOYMENT_ID = "dep-d9u4lcflk1mc73fi8o0g";
export const RENDER_CURRENT_DEPLOYMENT_URL = `https://dashboard.render.com/web/${RENDER_SERVICE_ID}/deploys/${RENDER_CURRENT_DEPLOYMENT_ID}`;
export const RENDER_STATUS = "EXISTING_DEPLOYMENT_TRUE_RECEIPT_CURRENT_CANDIDATE_NOT_DEPLOYED";
export const ACCEPTANCE_STATE = "H199_H198_PASS_CONSUMED_RENDER_OWNER_GATE_NOT_GRANTED_CURRENT_PRODUCT_CORRECTION_PENDING";
export const PUBLICATION_CANDIDATE_STATE = "H199_CURRENT_PRODUCT_CORRECTION_CANDIDATE_AGAINST_PUBLISHED_4F26C6A_RENDER_NOT_DEPLOYED";
const SELF_EXCLUDED_MANIFEST_PATH = "current-mvp/current-release-workbench-manifest.json";
const CURRENT_WORKTREE_SCOPE = Object.freeze({ trackedModified: 13, contentCandidates: 7, modeOnly: 7 });

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
  const [numstatOutput, rawOutput, statusOutput, baselineCommit, currentHead] = await Promise.all([
    git(["diff", CURRENT_RELEASE_COMMIT, "--numstat", "--"]),
    git(["diff", CURRENT_RELEASE_COMMIT, "--raw", "--no-renames", "--"]),
    git(["status", "--porcelain=v1", "--untracked-files=all", "--"]),
    Promise.resolve(`${CURRENT_RELEASE_COMMIT}\n`),
    git(["rev-parse", "HEAD"])
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
  const modifiedPaths = [...numstat.keys()].sort();
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
    if (path === SELF_EXCLUDED_MANIFEST_PATH) {
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
  const allowedUntracked = new Set(["outputs/Arc_Current_Release_PolicySettlementV1_Readback.json", "tools/current_mvp_engineering_support.test.mjs"]);
  const untrackedCandidates = [];
  for (const path of untrackedPaths.filter((path) => allowedUntracked.has(path))) {
    const bytes = await readFile(join(RELEASE_ROOT, path));
    untrackedCandidates.push({ path, mode_head: null, mode_worktree: "100644", mode_changed: false, content_delta: true, excluded: false, untracked: true, bytes: bytes.length, sha256: sha256(bytes) });
  }
  const undeclaredUntrackedPaths = untrackedPaths.filter((path) => !allowedUntracked.has(path));
  const contentCandidates = [...snapshots.filter((item) => item.content_delta), ...untrackedCandidates].sort((a, b) => a.path.localeCompare(b.path));
  const publicationCandidatePaths = contentCandidates.map((item) => ({
    ...item,
    documentation_only: DOCUMENTATION_ONLY_PATHS.includes(item.path)
  }));
  const baseline = baselineCommit.trim();
  return {
    baseline_commit: baseline,
    current_head: currentHead.trim(),
    tracked_modified_count: snapshots.length,
    content_candidate_count: contentCandidates.length,
    mode_only_non_candidate_count: snapshots.filter((item) => !item.content_delta).length,
    content_candidate_paths: contentCandidates,
    documentation_only_content_count: contentCandidates.filter((item) => DOCUMENTATION_ONLY_PATHS.includes(item.path)).length,
    documentation_only_paths: contentCandidates.filter((item) => DOCUMENTATION_ONLY_PATHS.includes(item.path)),
    mode_only_non_candidate_paths: snapshots.filter((item) => !item.content_delta),
    untracked_paths: undeclaredUntrackedPaths,
    publication_candidate_state: PUBLICATION_CANDIDATE_STATE,
    publication_candidate_count: publicationCandidatePaths.length,
    publication_candidate_paths: publicationCandidatePaths,
    untracked_policy: "must_be_empty_before_manifest_freeze",
    current_worktree_candidate_bound: false,
    self_excluded_manifest_path: "current-mvp/current-release-workbench-manifest.json",
    clean_worktree_rule: "The current public release is immutable published main@4f26c6a: every content-changing path after that release is a local product correction candidate; the manifest self-excludes its own bytes; only seven pre-existing mode-only paths are excluded; all other untracked paths are forbidden."
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
    supportInput("tools/arc_payment_receipt_server.test.mjs", "test"),
    supportInput("tools/circle_console_server.test.mjs", "test"),
    supportInput("tools/current_mvp_erp_readiness.mjs", "verifier"),
    supportInput("tools/current_mvp_erp_readiness.test.mjs", "test"),
    supportInput("tools/current_mvp_accounting_close.test.mjs", "test"),
    supportInput("tools/current_mvp_fail_closed_lifecycle.test.mjs", "test")
  ]);
  const worktree = await worktreeTruth();
  const erpRelease = {
    release_id: "verified-milestone-close-current-mvp-workbench-rc1",
    commit_sha: worktree.baseline_commit,
    manifest_sha256: sha256(baseBytes)
  };
  const erpReadiness = verifyEmbeddedCurrentMvpErpProjection({ release: erpRelease, evidence: CURRENT_ERP_VERIFIED_READ_ONLY_EVIDENCE });
  const surfaceReadiness = buildCurrentReleaseSurfaceReadinessView({ now: "2026-08-12T00:00:00.000Z" });
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
    acceptance_state: ACCEPTANCE_STATE,
    baseline_git_commit: worktree.baseline_commit,
    current_worktree_candidate_bound: false,
    current_release_surface_status: {
      github: { status: "TRUE_RECEIPT", current_release_bound: true, branch: "main", commit: CURRENT_RELEASE_COMMIT, remote_main: CURRENT_RELEASE_COMMIT, current_worktree_candidate_bound: false, current_worktree_dirty: worktree.content_candidate_count > 0, source_readback: "remote_main_4f26c6a_verified", note: "GitHub main@4f26c6a is the current public release; local product correction candidates remain unbound", owner_gate_required: false, historical_lineage_only: false },
      render: { status: RENDER_STATUS, current_release_bound: false, service_id: RENDER_SERVICE_ID, service_url: RENDER_SERVICE_URL, deployed_commit: RENDER_CURRENT_DEPLOYED_COMMIT, deployment_id: RENDER_CURRENT_DEPLOYMENT_ID, deployment_url: RENDER_CURRENT_DEPLOYMENT_URL, immutable_deploy_entity: true, current_worktree_candidate_bound: false, source_readback: "render_deployment_83becbb_live; 4f26c6a_candidate_not_deployed", note: "Render still serves immutable 83becbb; GitHub main@4f26c6a and the newer local correction are not deployed", candidate: { required_commit: CURRENT_RELEASE_COMMIT, status: "NOT_DEPLOYED", current_release_bound: false, owner_gate: "NOT_GRANTED", owner_gate_required: true }, owner_gate_required: true, historical_lineage_only: false },
      deck: { status: "TRUE_RECEIPT", current_release_bound: true, published_baseline_binding: true, tag: "programme-final-20260810", historical_lineage_only: false },
      video: { status: "TRUE_RECEIPT", current_release_bound: true, published_baseline_binding: true, tag: "programme-final-20260810", historical_lineage_only: false },
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
        },
        historical_lineage_only: false
      },
      encode: { status: "UNPROVEN", readiness: surfaceReadiness.encode, historical_lineage_only: true },
      final: { status: "UNPROVEN", readiness: surfaceReadiness.final, historical_lineage_only: true },
      arc_testnet: { status: "VERIFIED_CHAIN_RECEIPT_PENDING_PUBLICATION_BINDING", readiness: surfaceReadiness.arc_testnet, evidence_binding: "official Arc RPC proves deployment 0xbf3e...a27b and current-contract createPolicy/PolicyCreated/getPolicy 0x2f40...4a9c; dynamic public release binding remains pending until Render deploys the accepted product correction", historical_lineage_only: false },
      erp: {
        status: "VERIFIED_READ_ONLY_CANDIDATE",
        evidence_binding: "privacy-safe H167 supplier-payable readback is embedded in web/workbench/workbench-projection.mjs: paid Purchase Invoice ACC-PINV-2026-00002, submitted Payment Entry ACC-PAY-2026-00009, reconciled Bank Transaction ACC-BTN-2026-00004 and balanced GL; Payment Ledger, Accounting Period, Period Closing Voucher and business close remain not_proven",
        owner_live_readback_binding: true,
        current_worktree_candidate_bound: false,
        public_current_release_bound: false,
        live_erp_mutation: false,
        erp_readiness: erpReadiness,
        business_close: "not_proven",
        historical_lineage_only: false
      }
    },
    worktree_truth: worktree,
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
  if (manifest.stable_terminal_freeze !== true || manifest.writer_idle !== true || manifest.acceptance_state !== ACCEPTANCE_STATE) issues.push("freeze_state_missing");
  if (manifest.baseline_git_commit !== CURRENT_RELEASE_COMMIT || manifest.current_worktree_candidate_bound !== false) issues.push("current_release_baseline_or_candidate_binding_invalid");
  if (JSON.stringify(manifest).includes("a63fbcee1b02fb7f6d73a95d928f4f9d5ec2a2c7") || JSON.stringify(manifest).includes("9795c442f4c80464c2d54639a638f02060265be1")) issues.push("stale_publication_commit_truth");
  if (manifest.independent_audit?.model !== "gpt-5.6-sol" || manifest.independent_audit?.reasoning_effort !== "medium" || manifest.independent_audit?.read_only !== true || manifest.independent_audit?.independent !== true || manifest.independent_audit?.status !== "PENDING" || manifest.independent_audit?.self_acceptance !== false) issues.push("audit_boundary_missing");
  if (JSON.stringify(manifest.accepted_request ?? null) !== JSON.stringify(ACCEPTED_PACKET)) issues.push("accepted_packet_binding_missing");
  if (JSON.stringify(manifest.source_request ?? null) !== JSON.stringify(SOURCE_REQUEST)) issues.push("source_request_lineage_missing");
  const expectedSurfaces = {
    github: "TRUE_RECEIPT",
    render: RENDER_STATUS,
    deck: "TRUE_RECEIPT",
    video: "TRUE_RECEIPT",
    circle_console: "BLOCKED",
    encode: "UNPROVEN",
    final: "UNPROVEN",
    arc_testnet: "VERIFIED_CHAIN_RECEIPT_PENDING_PUBLICATION_BINDING",
    erp: "VERIFIED_READ_ONLY_CANDIDATE"
  };
  for (const [surface, expectedStatus] of Object.entries(expectedSurfaces)) {
    const value = manifest.current_release_surface_status?.[surface];
    if (value?.status !== expectedStatus) issues.push(`current_surface_status_invalid:${surface}`);
  }
  const consoleBlockers = manifest.current_release_surface_status?.circle_console?.blockers ?? [];
  if (!["subscription_id_missing", "webhook_history_source_missing", "event_history_source_missing", "trusted_readback_loader_not_configured"].every((blocker) => consoleBlockers.includes(blocker))) issues.push("circle_console_blockers_missing");
  const trustedConsole = manifest.current_release_surface_status?.circle_console?.trusted_readback_contract;
  if (trustedConsole?.schema !== "arc.circle-console-trusted-readback.v1" || trustedConsole?.status !== "not_ready_fail_closed" || trustedConsole?.network !== "ARC-TESTNET" || trustedConsole?.chain_id !== 5042002 || trustedConsole?.contract_address !== "0xc7682649a1aa60d0f74825ad2b812ee062178047" || trustedConsole?.event_signature !== "PolicyCreated(bytes32,address,address,address,uint256,bytes32,bytes32,uint64,uint64)" || trustedConsole?.loader?.injected_only !== true || trustedConsole?.loader?.calls_external_api !== false || trustedConsole?.loader?.creates_subscription !== false || trustedConsole?.webhook_history?.kind !== "circle_console_webhook_history" || trustedConsole?.event_history?.kind !== "circle_contract_event_history") issues.push("circle_console_trusted_readback_contract_invalid");
  if (manifest.current_release_surface_status?.final?.status === "TRUE_RECEIPT" || manifest.current_release_surface_status?.encode?.status === "TRUE_RECEIPT") issues.push("unproven_surface_promoted");
  const githubSurface = manifest.current_release_surface_status?.github;
  const renderSurface = manifest.current_release_surface_status?.render;
  const erpSurface = manifest.current_release_surface_status?.erp;
  if (githubSurface?.current_release_bound !== true || githubSurface?.branch !== "main" || githubSurface?.commit !== CURRENT_RELEASE_COMMIT || githubSurface?.remote_main !== CURRENT_RELEASE_COMMIT || githubSurface?.source_readback !== "remote_main_4f26c6a_verified" || githubSurface?.owner_gate_required !== false || githubSurface?.current_worktree_candidate_bound !== false || Object.hasOwn(githubSurface, "candidate_binding")) issues.push("github_current_release_binding_invalid");
  if (renderSurface?.current_release_bound !== false || renderSurface?.service_id !== RENDER_SERVICE_ID || renderSurface?.deployed_commit !== RENDER_CURRENT_DEPLOYED_COMMIT || renderSurface?.deployment_id !== RENDER_CURRENT_DEPLOYMENT_ID || renderSurface?.deployment_url !== RENDER_CURRENT_DEPLOYMENT_URL || renderSurface?.immutable_deploy_entity !== true || renderSurface?.source_readback !== "render_deployment_83becbb_live; 4f26c6a_candidate_not_deployed" || renderSurface?.owner_gate_required !== true || renderSurface?.current_worktree_candidate_bound !== false || renderSurface?.candidate?.required_commit !== CURRENT_RELEASE_COMMIT || renderSurface?.candidate?.status !== "NOT_DEPLOYED" || renderSurface?.candidate?.current_release_bound !== false || renderSurface?.candidate?.owner_gate !== "NOT_GRANTED" || renderSurface?.candidate?.owner_gate_required !== true) issues.push("render_deployment_truth_invalid");
  if (erpSurface?.current_worktree_candidate_bound !== false || erpSurface?.public_current_release_bound !== false || erpSurface?.owner_live_readback_binding !== true || erpSurface?.live_erp_mutation !== false || erpSurface?.business_close !== "not_proven" || Object.hasOwn(erpSurface, "candidate_binding") || Object.hasOwn(erpSurface, "public_remote_binding")) issues.push("erp_candidate_binding_ambiguous");
  const surfaceReadiness = buildCurrentReleaseSurfaceReadinessView({ now: "2026-08-12T00:00:00.000Z" });
  for (const surface of ["encode", "final"]) {
    const actual = manifest.current_release_surface_status?.[surface]?.readiness;
    const expected = surfaceReadiness[surface];
    if (actual?.status !== "UNPROVEN" || actual?.valid !== false || actual?.current_release_bound !== false || JSON.stringify(actual?.errors) !== JSON.stringify(expected.errors) || actual?.external_actions !== 0) issues.push(`surface_readiness_binding_invalid:${surface}`);
  }
  const publicationCandidate = manifest.worktree_truth?.publication_candidate_paths ?? [];
  const selfExcludedCandidate = publicationCandidate.find((item) => item.path === "current-mvp/current-release-workbench-manifest.json");
  const actualTruth = await worktreeTruth();
  const actualCandidatePaths = actualTruth.publication_candidate_paths.map((item) => item.path).sort().join(",");
  if (manifest.worktree_truth?.baseline_commit !== CURRENT_RELEASE_COMMIT || manifest.worktree_truth?.current_head !== actualTruth.current_head || manifest.worktree_truth?.tracked_modified_count !== actualTruth.tracked_modified_count || manifest.worktree_truth?.tracked_modified_count !== CURRENT_WORKTREE_SCOPE.trackedModified || manifest.worktree_truth?.content_candidate_count !== actualTruth.content_candidate_count || manifest.worktree_truth?.content_candidate_count !== CURRENT_WORKTREE_SCOPE.contentCandidates || manifest.worktree_truth?.mode_only_non_candidate_count !== actualTruth.mode_only_non_candidate_count || manifest.worktree_truth?.mode_only_non_candidate_count !== CURRENT_WORKTREE_SCOPE.modeOnly || manifest.worktree_truth?.documentation_only_content_count !== actualTruth.documentation_only_content_count || manifest.worktree_truth?.publication_candidate_state !== PUBLICATION_CANDIDATE_STATE || manifest.worktree_truth?.publication_candidate_count !== actualTruth.publication_candidate_count || manifest.worktree_truth?.publication_candidate_count !== CURRENT_WORKTREE_SCOPE.contentCandidates || publicationCandidate.map((item) => item.path).sort().join(",") !== actualCandidatePaths || manifest.worktree_truth?.untracked_paths?.length !== 0 || manifest.worktree_truth?.current_worktree_candidate_bound !== false || manifest.worktree_truth?.self_excluded_manifest_path !== "current-mvp/current-release-workbench-manifest.json" || selfExcludedCandidate?.self_excluded !== true || selfExcludedCandidate?.hash_excluded !== true) issues.push("worktree_candidate_scope_invalid");
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
    ["tools/arc_payment_receipt_server.test.mjs", "test"],
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
  const expectedBaseBytes = await readFile(join(root, "mvp-publication-staging-rc1-manifest.json"));
  const expectedErpReadiness = verifyEmbeddedCurrentMvpErpProjection({
    release: { release_id: manifest.release_id, commit_sha: CURRENT_RELEASE_COMMIT, manifest_sha256: sha256(expectedBaseBytes) },
    evidence: CURRENT_ERP_VERIFIED_READ_ONLY_EVIDENCE
  });
  const actualErpReadiness = manifest.current_release_surface_status?.erp?.erp_readiness;
  if (actualErpReadiness?.valid !== expectedErpReadiness.valid || actualErpReadiness?.status !== expectedErpReadiness.status || actualErpReadiness?.readiness_status !== expectedErpReadiness.readiness_status || actualErpReadiness?.live_erp !== false || actualErpReadiness?.public_current_release_bound !== false || actualErpReadiness?.business_close !== "not_proven" || actualErpReadiness?.external_actions !== 0 || actualErpReadiness?.verification_fingerprint !== expectedErpReadiness.verification_fingerprint) issues.push("erp_readiness_binding_invalid");
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
