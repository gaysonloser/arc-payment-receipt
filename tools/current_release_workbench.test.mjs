import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";

import { verifyCurrentMvpBundle } from "./current_mvp_source_binding.mjs";
import {
  C15_WORKBENCH_CONTRACT,
  CURRENT_RELEASE_WORKBENCH_SCENARIOS,
  CURRENT_ARC_VERIFIED_PROGRAMME_EVIDENCE,
  CURRENT_ERP_VERIFIED_READ_ONLY_EVIDENCE,
  buildAuthorityObservation,
  buildTypedReadbacks,
  consumeCurrentReleaseProjection,
  projectCurrentReleaseWorkbench,
  validateCurrentReleaseProjection,
  validateTypedReadbacks
} from "../current-mvp/web/workbench/workbench-projection.mjs";
import {
  A12_C15_DAPP_OBJECT_IDS,
  A12_LIFECYCLE_TRANSITION_TYPES,
  A12_C15_RECEIPT_FIELDS,
  A12_C15_SCENARIO_SCHEMA,
  A12_C15_TABS,
  A12_C15_VIEWPORT_ORACLE,
  A12_CAUSAL_STAGES,
  A12_SEVEN_SCENARIO_IDS,
  createA12WorkbenchState,
  projectA12Workbench,
  reduceA12Workbench,
  a12WorkbenchRoute,
  parseA12WorkbenchRoute
} from "../current-mvp/web/fixture-engine.mjs";
import { a12BrowserMeasurementContract, a12RuntimeLayoutMetrics, a12UiFilteredQueue } from "../current-mvp/web/navigation-workspace.mjs";
import {
  CURRENT_MVP_ROOT,
  OUTPUT_PATH,
  verifyCurrentReleaseWorkbenchManifest
} from "./build_current_release_workbench_manifest.mjs";
import {
  buildCanonicalArcReceipt,
  decodeRawArcReceipt,
  validateCanonicalArcReceipt
} from "../current-mvp/web/settlement-case.mjs";

const zeroCounts = { bank_transaction: 0, close: 0, gl: 0, payment_entry: 0, payment_ledger: 0 };

test("canonical Arc receipt decoder round-trips and fails closed on every raw/typed guard", () => {
  const caseBinding = {
    caseId: "case-001",
    companyId: "company-001",
    profileId: "customer_receipt_inbound",
    origin: "chain_observed",
    sourceDocument: "invoice-001",
    treasuryId: "treasury-001",
    policyId: `0x${"11".repeat(32)}`,
    transferId: `0x${"22".repeat(32)}`
  };
  const valid = buildCanonicalArcReceipt({
    policyContract: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    payer: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    recipient: "0xcccccccccccccccccccccccccccccccccccccccc",
    policyId: `0x${"11".repeat(32)}`,
    transferId: `0x${"22".repeat(32)}`,
    attestationDigest: `0x${"33".repeat(32)}`,
    attestationNonce: 7,
    amount6: 100,
    observedAt: "2026-08-10T12:00:00.000Z",
    validUntil: "2026-08-10T13:00:00.000Z",
    caseBinding
  });
  const decoded = decodeRawArcReceipt(valid);
  assert.deepEqual(decoded.map(({ variant, logIndex }) => ({ variant, logIndex })), [
    { variant: "ERC20_USDC", logIndex: 2 },
    { variant: "ARC_SYSTEM", logIndex: 5 },
    { variant: "SettlementExecuted", logIndex: 9 }
  ]);
  assert.equal(validateCanonicalArcReceipt(valid, { amount6: 100, caseBinding, now: "2026-08-10T12:30:00.000Z" }).valid, true);

  const rawMutations = [
    ["RAW_RECEIPT_NOT_SUCCESS", (receipt) => { receipt.status = 0; }],
    ["RAW_MALFORMED_LOG", (receipt) => { delete receipt.rawLogs[0].data; }],
    ["RAW_TRANSFER_LAYOUT", (receipt) => { receipt.rawLogs[0].topics.pop(); }],
    ["RAW_TRANSFER_EMITTER", (receipt) => { receipt.rawLogs[0].emitter = "0xdddddddddddddddddddddddddddddddddddddddd"; }],
    ["RAW_POLICY_LAYOUT", (receipt) => { receipt.rawLogs[2].topics.pop(); }]
  ];
  for (const [expected, mutate] of rawMutations) {
    const candidate = structuredClone(valid);
    mutate(candidate);
    assert.throws(() => decodeRawArcReceipt(candidate), new RegExp(expected), expected);
    const checked = validateCanonicalArcReceipt(candidate, { amount6: 100, caseBinding, now: "2026-08-10T12:30:00.000Z" });
    assert.equal(checked.valid, false, expected);
    const expectedCode = expected === "RAW_TRANSFER_EMITTER"
      ? "ARC_IDENTITY_PROVENANCE"
      : expected === "RAW_RECEIPT_NOT_SUCCESS"
        ? "ARC_RECEIPT_NOT_SUCCESS"
        : `ARC_${expected}`;
    assert.equal(checked.code, expectedCode, expected);
  }

  const typed = structuredClone(valid);
  delete typed.rawLogs;
  typed.logs = decoded;
  const typedMutations = [
    ["ARC_RECEIPT_IDENTITY", (receipt) => { receipt.transactionHash = "0x01"; }],
    ["ARC_CASE_BINDING", (receipt) => { receipt.caseBinding = { caseId: "wrong" }; }],
    ["ARC_LOG_CARDINALITY", (receipt) => { receipt.logs.pop(); }],
    ["ARC_LOG_ORDER", (receipt) => { receipt.logs[1].logIndex = 1; }],
    ["ARC_LOG_VARIANT", (receipt) => { receipt.logs[0].variant = "UNKNOWN"; }],
    ["ARC_IDENTITY_PROVENANCE", (receipt) => { receipt.logs[0].from = receipt.from.replace(/.$/, "1"); }],
    ["ARC_SYSTEM_UNIT", (receipt) => { receipt.logs[1].amount = 1n; }],
    ["ARC_GETTER_READBACK_MISMATCH", (receipt) => { receipt.getterReadback.amount6 = "101"; }],
    ["ARC_REORG_UNRESOLVED", (receipt) => { receipt.reorg = "reorg_detected"; }],
    ["ARC_REORG_STATE_INVALID", (receipt) => { receipt.reorg = "pending"; }]
  ];
  for (const [expected, mutate] of typedMutations) {
    const candidate = structuredClone(typed);
    mutate(candidate);
    const checked = validateCanonicalArcReceipt(candidate, { amount6: 100, caseBinding, now: "2026-08-10T12:30:00.000Z" });
    assert.equal(checked.valid, false, expected);
    assert.equal(checked.code, expected, expected);
  }
});

test("current release keeps the 23-file public entry and exposes the domain workbench entry", async () => {
  const base = await verifyCurrentMvpBundle();
  assert.equal(base.valid, false);
  assert.equal(base.entry_count, 23);
  assert.equal(base.release_id, "verified-milestone-close-mvp-publication-staging-rc1");
  assert.deepEqual(base.current_release_override_paths.map((item) => item.path).sort(), ["web/fixture-engine.mjs", "web/index.html", "web/navigation-workspace.mjs"]);
  assert.equal(base.issues.filter((issue) => issue.startsWith("historical_manifest_stale:")).length, 3);
  assert.equal(C15_WORKBENCH_CONTRACT.id, "verified-milestone-close-current-mvp-workbench-rc1");
  assert.equal(C15_WORKBENCH_CONTRACT.boundary.external_actions, 0);
});

test("full current-release workbench manifest binds every shipped file and rejects drift", async () => {
  const result = await verifyCurrentReleaseWorkbenchManifest();
  assert.equal(result.valid, true);
  assert.equal(result.entry_count, 28);
  assert.equal(result.issues.length, 0);
  const manifest = JSON.parse(await readFile(OUTPUT_PATH, "utf8"));
  assert.equal(manifest.stable_terminal_freeze, true);
  assert.equal(manifest.writer_idle, true);
  assert.equal(manifest.independent_audit.status, "PENDING");
  assert.equal(manifest.independent_audit.self_acceptance, false);
  assert.equal(OUTPUT_PATH.endsWith("current-release-workbench-manifest.json"), true);
  const temporary = await mkdtemp(join(tmpdir(), "arc-workbench-manifest-"));
  try {
    const candidate = join(temporary, "current-mvp");
    await cp(CURRENT_MVP_ROOT, candidate, { recursive: true });
    const adapter = join(candidate, "web/workbench/workbench-projection.mjs");
    await writeFile(adapter, `${await readFile(adapter, "utf8")}\n// mutation\n`, "utf8");
    const mutated = await verifyCurrentReleaseWorkbenchManifest({ root: candidate });
    assert.equal(mutated.valid, false);
    assert.equal(mutated.issues.some((issue) => issue.startsWith("sha256_mismatch:web/workbench/workbench-projection.mjs")), true);
    await writeFile(join(candidate, "web/workbench/unexpected.mjs"), "export default 1;\n", "utf8");
    const extra = await verifyCurrentReleaseWorkbenchManifest({ root: candidate });
    assert.equal(extra.issues.some((issue) => issue === "extra_file:web/workbench/unexpected.mjs"), true);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("published baseline manifest truth rejects stale commits and the old 14-path scope", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "arc-h186-manifest-"));
  try {
    const candidate = join(temporary, "current-mvp");
    await cp(CURRENT_MVP_ROOT, candidate, { recursive: true });
    const manifestPath = join(candidate, "current-release-workbench-manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.baseline_git_commit = "9795c442f4c80464c2d54639a638f02060265be1";
    manifest.current_release_surface_status.github.baseline_commit = "a63fbcee1b02fb7f6d73a95d928f4f9d5ec2a2c7";
    manifest.worktree_truth.publication_candidate_count = 14;
    manifest.worktree_truth.publication_candidate_state = "LOCALLY_COMMITTED_PENDING_REMOTE_MAIN_READBACK";
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    const result = await verifyCurrentReleaseWorkbenchManifest({ root: candidate });
    assert.equal(result.valid, false);
    assert.ok(result.issues.includes("h187_baseline_or_candidate_binding_invalid"));
    assert.ok(result.issues.includes("stale_publication_commit_truth"));
    assert.ok(result.issues.includes("worktree_candidate_scope_invalid"));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("H187 manifest binds the embedded ERP read-only projection and keeps surface readbacks unproven", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "arc-h187-manifest-"));
  try {
    const candidate = join(temporary, "current-mvp");
    await cp(CURRENT_MVP_ROOT, candidate, { recursive: true });
    const manifestPath = join(candidate, "current-release-workbench-manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.current_release_surface_status.erp.erp_readiness.live_erp = true;
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    const result = await verifyCurrentReleaseWorkbenchManifest({ root: candidate });
    assert.equal(result.valid, false);
    assert.equal(result.issues.includes("erp_readiness_binding_invalid"), true);
    manifest.current_release_surface_status.erp.erp_readiness.live_erp = false;
    manifest.current_release_surface_status.encode.readiness.status = "VERIFIED_READ_ONLY";
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    const promoted = await verifyCurrentReleaseWorkbenchManifest({ root: candidate });
    assert.equal(promoted.valid, false);
    assert.equal(promoted.issues.includes("surface_readiness_binding_invalid:encode"), true);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("all seven canonical scenarios produce typed Arc/ERP/Ledger/Business projections", () => {
  assert.equal(CURRENT_RELEASE_WORKBENCH_SCENARIOS.length, 7);
  for (const scenario of CURRENT_RELEASE_WORKBENCH_SCENARIOS) {
    const observation = buildAuthorityObservation(scenario);
    const projection = projectCurrentReleaseWorkbench({ scenario, ...observation });
    assert.equal(projection.status, "MATCHED", scenario);
    assert.equal(projection.erp_consequence_allowed, true, scenario);
    assert.equal(projection.live_arc, false, scenario);
    assert.equal(projection.live_erp, false, scenario);
    assert.equal(projection.external_actions, 0, scenario);
    assert.equal(projection.direct_erp_mutation, false, scenario);
    assert.equal(validateCurrentReleaseProjection(projection, { scenario }).valid, true, scenario);
    assert.equal(projection.profile.primary_action.length > 0, true, scenario);
    assert.equal(projection.consequence_preview.bundle_count, 1, scenario);
    assert.equal(projection.consequence_preview.payment_entry.docstatus, 0, scenario);
    assert.equal(projection.consequence_preview.payment_entry.direct_submit, false, scenario);
    assert.equal(projection.consequence_preview.bank_transaction.docstatus, 0, scenario);
    assert.equal(projection.business_close_state, "unavailable", scenario);
    const dapp = projection.dapp.objects;
    assert.equal(dapp.receipt_finality.applicability, "required", scenario);
    if (projection.origin === "chain_observed") {
      assert.equal(dapp.settlement_policy.applicability, "not_applicable", scenario);
      assert.equal(dapp.wallet_review.applicability, "not_applicable", scenario);
    }
    if (scenario === "receipt_refund_outgoing") {
      assert.equal(dapp.settlement_policy.applicability, "required");
      assert.equal(dapp.unsigned_command.applicability, "required");
      assert.equal(dapp.wallet_review.applicability, "required");
    }
  }
});

test("deep UI contract binds seven schemas, five inspectors, seven causal stages and 200% viewport metadata", async () => {
  const html = await readFile(join(CURRENT_MVP_ROOT, "web/index.html"), "utf8");
  const navigation = await readFile(join(CURRENT_MVP_ROOT, "web/navigation-workspace.mjs"), "utf8");
  assert.match(html, /mountA12DeepWorkbench/);
  assert.match(html, /prefers-reduced-motion: reduce/);
  assert.match(html, /min-height:\s*44px/);
  assert.match(navigation, /scrollWidth/);
  assert.match(navigation, /clientWidth/);
  assert.match(navigation, /SET_SEARCH_QUERY/);
  assert.match(navigation, /a12UiFilteredQueue/);
  for (const label of ["Work queue", "Match funds", "Post to ERP", "Ledger & close", "Evidence"]) {
    assert.match(navigation, new RegExp(`aria-label="\\$\\{a12UiEscape\\(label\\)\\}"`), `collapsed navigation keeps an accessible name for ${label}`);
  }
  assert.match(navigation, /\.a12-primary:disabled\{opacity:1;background:#c7d0dd;color:#3f4d5e;cursor:not-allowed\}/);
  assert.match(navigation, /\.a12-queue-list\{max-height:360px;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable\}/);
  assert.equal(A12_SEVEN_SCENARIO_IDS.length, 7);
  assert.equal(new Set(A12_SEVEN_SCENARIO_IDS).size, 7);
  assert.deepEqual(A12_C15_TABS, ["Business", "Arc", "ERP", "Ledger", "Audit"]);
  assert.equal(A12_C15_DAPP_OBJECT_IDS.includes("unsigned_command"), true);
  assert.equal(A12_C15_DAPP_OBJECT_IDS.includes("receipt_finality"), true);
  assert.equal(A12_CAUSAL_STAGES.length, 7);
  for (const scenario of A12_SEVEN_SCENARIO_IDS) assert.equal(A12_C15_SCENARIO_SCHEMA[scenario].fields.length > 0, true, scenario);
  assert.deepEqual(a12RuntimeLayoutMetrics(1440, 1024, 2), { viewport: "1440x1024", height: 1024, navigation: 208, queue: 300, inspector: 336, inspectorMode: "persistent", overflowX: "none", overflowY: "scrollable", textFloorPx: 16, zoomPercent: 200 });
  assert.deepEqual(a12RuntimeLayoutMetrics(1280, 800, 2).viewport, "1280x800");
  assert.deepEqual(a12RuntimeLayoutMetrics(1024, 768, 2).inspectorMode, "focus_trapped_drawer");
  assert.deepEqual(A12_C15_VIEWPORT_ORACLE["1024x768"].inspectorMode, "focus_trapped_drawer");
});

test("current inspector exposes verified Arc/ERP evidence without threshold or live-close claims", async () => {
  const state = createA12WorkbenchState();
  const view = projectA12Workbench(state);
  assert.equal(A12_C15_RECEIPT_FIELDS.includes("finality_threshold"), false);
  assert.equal(A12_C15_RECEIPT_FIELDS.includes("finality_state"), true);
  assert.deepEqual(view.inspector.arcVerifiedEvidence, CURRENT_ARC_VERIFIED_PROGRAMME_EVIDENCE);
  assert.deepEqual(view.inspector.erpVerifiedEvidence, CURRENT_ERP_VERIFIED_READ_ONLY_EVIDENCE);
  assert.equal(view.inspector.arcVerifiedEvidence.chain_id, 5042002);
  assert.equal(view.inspector.arcVerifiedEvidence.receipt_status, "0x1");
  assert.equal(view.inspector.arcVerifiedEvidence.claim_boundary.settlement_execution_claimed, false);
  assert.equal(view.inspector.erpVerifiedEvidence.company, "AOXPET Arc Lab");
  assert.equal(view.inspector.erpVerifiedEvidence.company_abbr, "AAL");
  assert.equal(view.inspector.erpVerifiedEvidence.payment_ledger.status, "not_proven");
  assert.equal(view.inspector.erpVerifiedEvidence.claim_boundary.business_close_claimed, false);
  assert.equal(view.claims.erpPosting, false);
  assert.equal(view.claims.businessClose, false);
  const navigation = await readFile(join(CURRENT_MVP_ROOT, "web/navigation-workspace.mjs"), "utf8");
  assert.match(navigation, /Verified Arc programme evidence/);
  assert.match(navigation, /Verified ERP evidence/);
  assert.match(navigation, /input\[data-a12-search\]\{min-height:44px!important;height:44px\}/);
  assert.doesNotMatch(navigation, /missing live readback/);
  assert.doesNotMatch(navigation, /policy getter · missing live readback/);
  assert.doesNotMatch(navigation, /<h3>Receipt \/ finality · \$\{a12UiEscape\(view\.claims\.liveArc/);
});

test("current narrative and compiler contract reject historical umbrella drift", async () => {
  const readme = await readFile(join(CURRENT_MVP_ROOT, "..", "README.md"), "utf8");
  const architecture = await readFile(join(CURRENT_MVP_ROOT, "..", "docs/ARCHITECTURE.md"), "utf8");
  const demo = await readFile(join(CURRENT_MVP_ROOT, "..", "docs/DEMO_SCRIPT.md"), "utf8");
  assert.match(readme, /^# Verified Milestone Close/m);
  assert.match(readme, /historical\/support/);
  assert.match(readme, /^## Current release materials$/m);
  assert.match(readme, /programme-final-20260810\/arc-enterprise-settlement-control-programme-final-3min\.mp4/);
  assert.match(readme, /programme-final-20260810\/Arc_Enterprise_Settlement_Programme_Deck_Current_V3\.pdf/);
  assert.match(readme, /^## Historical\/support verified evidence$/m);
  assert.match(readme, /H188 candidate instead carries a source-separated current-contract receipt/);
  assert.match(readme, /no active subscription ID and no trusted readback loader/);
  assert.match(architecture, /Verified Milestone Close/);
  assert.match(demo, /current product/);
  assert.doesNotMatch(readme.split("\n")[0], /^# Payment Receipt$/);
  const foundry = await readFile(join(CURRENT_MVP_ROOT, "..", "foundry.toml"), "utf8");
  assert.match(foundry, /solc_version\s*=\s*"0\.8\.24"/);
  assert.match(foundry, /current local reproducible strategy/i);
  assert.match(foundry, /not[\s\S]*source-identical/);
  const policyArtifact = JSON.parse(await readFile(join(CURRENT_MVP_ROOT, "..", "artifacts/PolicySettlementV1.sol/PolicySettlementV1.json"), "utf8"));
  assert.equal(policyArtifact.metadata?.compiler?.version, "0.8.24+commit.e11b9ed9");
  const sourcePaths = ["ArcPaymentReceipt.sol", "ArcReleaseDeliveryAttestation.sol", "ArcReleaseEvidenceAnchor.sol", "PolicySettlementV1.sol"];
  const sourceBytes = await Promise.all(sourcePaths.map((name) => readFile(join(CURRENT_MVP_ROOT, "..", "src", name), "utf8")));
  for (const source of sourceBytes) assert.match(source, /pragma solidity \^0\.8\.24;/);
  const packageJson = JSON.parse(await readFile(join(CURRENT_MVP_ROOT, "..", "package.json"), "utf8"));
  assert.match(packageJson.description, /Verified Milestone Close/);
  assert.match(packageJson.scripts.test, /--test-concurrency=1/);
});

test("missing final receipt is OPEN and has no ERP or ledger consequence", () => {
  const projection = projectCurrentReleaseWorkbench({ scenario: "supplier_payable" });
  assert.equal(projection.status, "OPEN");
  assert.equal(projection.erp_consequence_allowed, false);
  assert.deepEqual(projection.erp_consequence_counts, zeroCounts);
  assert.equal(projection.consequence_preview.bundle_count, 0);
  assert.match(projection.errors.join(" "), /ARC_RECEIPT_REQUIRED/);
});

test("stale, mismatched, reorged, replaced and TTL observations fail closed", () => {
  const observation = buildAuthorityObservation("customer_invoice_receipt");
  const cases = [
    { failure: "TTL_STALE" },
    { receipt: { ...observation.receipt, block_hash: "0x" + "99".repeat(32) }, erpReadback: observation.erpReadback },
    { receipt: { ...observation.receipt, reorg_state: "reorged" }, erpReadback: observation.erpReadback },
    { receipt: { ...observation.receipt, replacement_state: "replaced" }, erpReadback: observation.erpReadback }
  ];
  for (const input of cases) {
    const projection = projectCurrentReleaseWorkbench({ scenario: "customer_invoice_receipt", ...observation, ...input });
    assert.equal(projection.status, "OPEN");
    assert.equal(projection.erp_consequence_allowed, false);
    assert.deepEqual(projection.erp_consequence_counts, zeroCounts);
  }
});

test("ERP proposal/readback is a separate typed boundary", () => {
  const observation = buildAuthorityObservation("supplier_advance");
  const missing = projectCurrentReleaseWorkbench({ scenario: "supplier_advance", receipt: observation.receipt });
  assert.equal(missing.status, "OPEN");
  assert.match(missing.errors.join(" "), /ERP_READBACK_REQUIRED/);
  const changed = { ...observation.erpReadback, party_id: "wallet-address-is-not-an-erp-party" };
  const mismatch = projectCurrentReleaseWorkbench({ scenario: "supplier_advance", receipt: observation.receipt, erpReadback: changed });
  assert.equal(mismatch.status, "OPEN");
  assert.deepEqual(mismatch.erp_consequence_counts, zeroCounts);
  const callerFlag = projectCurrentReleaseWorkbench({ scenario: "supplier_advance", receipt: observation.receipt, erpReadback: { ...observation.erpReadback, matched: true } });
  assert.equal(callerFlag.status, "OPEN");
  assert.match(callerFlag.errors.join(" "), /ERP_READBACK_CALLER_OUTCOME_FORBIDDEN/);
});

test("same projection retry is DUPLICATE_NOOP and changed payload is a conflict", () => {
  const scenario = "employee_payable";
  const observation = buildAuthorityObservation(scenario);
  const projection = projectCurrentReleaseWorkbench({ scenario, ...observation });
  const ledger = new Map();
  assert.equal(consumeCurrentReleaseProjection(projection, ledger).state, "new");
  assert.equal(consumeCurrentReleaseProjection(projection, ledger).state, "DUPLICATE_NOOP");
  const changed = structuredClone(projection);
  changed.projection_fingerprint = "mutated-input-not-authority";
  assert.equal(consumeCurrentReleaseProjection(changed, ledger).state, "CONFLICT_REJECT");
});

test("authority origin is non-vacuous and typed readbacks are independently bound", () => {
  const expectedOrigins = { erp_initiated: 0, chain_observed: 0 };
  for (const scenario of CURRENT_RELEASE_WORKBENCH_SCENARIOS) {
    const authority = buildAuthorityObservation(scenario);
    const projection = projectCurrentReleaseWorkbench({ scenario, ...authority });
    assert.equal(projection.origin === "erp_initiated" || projection.origin === "chain_observed", true, scenario);
    expectedOrigins[projection.origin] += 1;
    assert.deepEqual(Object.keys(projection.typed_readbacks).sort(), ["accounting_period", "bank_transaction", "business_close", "gl", "invoice", "payment_entry", "payment_ledger", "pcv_operational_close"]);
    assert.equal(validateTypedReadbacks(projection.typed_readbacks, undefined, { matched: true }).valid, true, scenario);
    const forged = structuredClone(projection);
    forged.typed_readbacks.invoice.party_id = "wallet-address-not-erp-party";
    assert.equal(validateCurrentReleaseProjection(forged, { scenario }).valid, false, scenario);
  }
  assert.equal(expectedOrigins.erp_initiated > 0, true);
  assert.equal(expectedOrigins.chain_observed > 0, true);
});

test("active browser edge consumes the public domain projection and exposes origin", () => {
  const erpView = projectA12Workbench(createA12WorkbenchState({ scenario: "supplier_payable" }));
  const chainView = projectA12Workbench(createA12WorkbenchState({ scenario: "customer_invoice_receipt" }));
  assert.equal(erpView.workbenchProjection.origin, "erp_initiated");
  assert.equal(chainView.workbenchProjection.origin, "chain_observed");
  assert.equal(erpView.canvas.origin, "erp_initiated");
  assert.equal(chainView.canvas.origin, "chain_observed");
  assert.equal(Array.isArray(erpView.inspector.typedReadbacks), false);
  assert.equal(erpView.inspector.typedReadbacks.invoice.id, "invoice");
});

test("search query is canonical route state and arrow queue uses visible rows only", () => {
  let state = createA12WorkbenchState({ scenario: "supplier_payable" });
  state = reduceA12Workbench(state, { type: "SET_SEARCH_QUERY", query: "customer" });
  assert.equal(state.searchQuery, "customer");
  const route = a12WorkbenchRoute(state);
  assert.match(route, /[?]q=customer$/);
  assert.equal(parseA12WorkbenchRoute(route).searchQuery, "customer");
  const view = projectA12Workbench(state);
  const visible = a12UiFilteredQueue(view, state);
  assert.equal(visible.length > 0, true);
  assert.equal(visible.every((row) => `${row.id} ${row.label} ${row.party}`.toLowerCase().includes("customer")), true);
});

const lifecycleAuthority = { role: "finance_operator", operatorId: "finance-fixture" };
const logicalPaymentId = "logical:payment:fixture-001";
const canonicalEventKey = "5042002:0xaaa:2";

function applyLifecycleLateEntry(state = createA12WorkbenchState()) {
  return reduceA12Workbench(state, {
    type: "LATE_ENTRY",
    operationKey: "late-entry:fixture-001",
    logicalPaymentId,
    canonicalEventKey,
    reason: "Typed watcher observation arrived after the original accounting cut-off.",
    authority: { role: "watcher", operatorId: "watcher-fixture" },
    observation: { receiptStatus: 1, blockHash: "0xaaa", observedAt: "2026-08-12T01:00:00Z" }
  });
}

test("active A12 lifecycle records a typed late entry keyed by logical payment and canonical event", () => {
  assert.deepEqual(A12_LIFECYCLE_TRANSITION_TYPES, ["LATE_ENTRY", "REPLACEMENT_RESOLUTION", "REVOKE", "REVERSAL"]);
  const state = applyLifecycleLateEntry();
  const observationKey = `${logicalPaymentId}::${canonicalEventKey}`;
  assert.equal(state.lastLifecycleResult.state, "APPLIED");
  assert.equal(state.lifecycleObservations[observationKey].status, "late_entry_observed");
  assert.equal(state.lifecycleObservations[observationKey].observation.blockHash, "0xaaa");
  assert.equal(state.history.at(-1).payload.priorObservation, null);
  assert.equal(state.matcherState, "pending");
  assert.equal(state.externalActions, 0);
});

test("active A12 lifecycle resolves a reorg replacement without overwriting the prior observation", () => {
  const prior = applyLifecycleLateEntry();
  const replacementKey = "5042002:0xbbb:2";
  const state = reduceA12Workbench(prior, {
    type: "REPLACEMENT_RESOLUTION",
    operationKey: "replacement:fixture-001",
    logicalPaymentId,
    canonicalEventKey,
    replacementCanonicalEventKey: replacementKey,
    reason: "Original block was reorged; bind the canonical replacement receipt.",
    authority: lifecycleAuthority,
    replacementObservation: { receiptStatus: 1, blockHash: "0xbbb", observedAt: "2026-08-12T01:01:00Z", reorgState: "canonical" }
  });
  assert.equal(state.lastLifecycleResult.state, "APPLIED");
  assert.equal(state.lifecycleObservations[`${logicalPaymentId}::${canonicalEventKey}`].status, "replaced_after_reorg");
  assert.equal(state.lifecycleObservations[`${logicalPaymentId}::${replacementKey}`].status, "canonical_replacement");
  assert.equal(state.lifecycleOperations["replacement:fixture-001"].priorObservation.observation.blockHash, "0xaaa");
  assert.equal(state.history.length, 2);
});

test("active A12 lifecycle applies REVOKE and source-bound REVERSAL while preserving history", () => {
  const prior = applyLifecycleLateEntry();
  const revoked = reduceA12Workbench(prior, { type: "REVOKE", operationKey: "revoke:fixture-001", logicalPaymentId, canonicalEventKey, reason: "Reviewer withdrew the observation.", authority: { role: "reviewer", operatorId: "reviewer-fixture" } });
  assert.equal(revoked.lastLifecycleResult.state, "APPLIED");
  assert.equal(revoked.lifecycleObservations[`${logicalPaymentId}::${canonicalEventKey}`].status, "revoked");
  assert.equal(revoked.lifecycleOperations["revoke:fixture-001"].priorObservation.observation.blockHash, "0xaaa");
  const reversed = reduceA12Workbench(prior, { type: "REVERSAL", operationKey: "reversal:fixture-001", logicalPaymentId, canonicalEventKey, reason: "Reverse the local accounting consequence.", authority: lifecycleAuthority });
  assert.equal(reversed.lastLifecycleResult.state, "APPLIED");
  assert.equal(reversed.lifecycleObservations[`${logicalPaymentId}::${canonicalEventKey}`].status, "reversed");
  assert.equal(reversed.history.length, 2);
  const missing = reduceA12Workbench(createA12WorkbenchState(), { type: "REVERSAL", operationKey: "reversal:missing", logicalPaymentId, canonicalEventKey, reason: "No source exists.", authority: lifecycleAuthority });
  assert.equal(missing.lastLifecycleResult.reason, "REVERSAL_SOURCE_REQUIRED");
});

test("active A12 lifecycle treats an identical operation retry as a duplicate no-op", () => {
  const action = {
    type: "LATE_ENTRY", operationKey: "late-entry:retry", logicalPaymentId, canonicalEventKey,
    reason: "Late receipt readback.", authority: { role: "watcher", operatorId: "watcher-fixture" },
    observation: { receiptStatus: 1, blockHash: "0xaaa", observedAt: "2026-08-12T01:00:00Z" }
  };
  const applied = reduceA12Workbench(createA12WorkbenchState(), action);
  const duplicate = reduceA12Workbench(applied, structuredClone(action));
  assert.equal(duplicate.lastLifecycleResult.state, "DUPLICATE_NOOP");
  assert.equal(duplicate.revision, applied.revision);
  assert.equal(duplicate.history.length, applied.history.length);
  assert.deepEqual(duplicate.lifecycleOperations, applied.lifecycleOperations);
  assert.deepEqual(duplicate.lifecycleObservations, applied.lifecycleObservations);
});

test("active A12 lifecycle rejects a conflicting payload on the same operation key fail-closed", () => {
  const applied = applyLifecycleLateEntry();
  const conflict = reduceA12Workbench(applied, {
    type: "LATE_ENTRY",
    operationKey: "late-entry:fixture-001",
    logicalPaymentId,
    canonicalEventKey,
    reason: "Conflicting retry.",
    authority: { role: "watcher", operatorId: "watcher-fixture" },
    observation: { receiptStatus: 1, blockHash: "0xconflict" }
  });
  assert.equal(conflict.lastLifecycleResult.state, "CONFLICT_REJECT");
  assert.equal(conflict.lastLifecycleResult.reason, "IDEMPOTENCY_KEY_PAYLOAD_CONFLICT");
  assert.equal(conflict.revision, applied.revision);
  assert.equal(conflict.history.length, applied.history.length);
  assert.deepEqual(conflict.lifecycleOperations, applied.lifecycleOperations);
  assert.equal(conflict.matcherState, "pending");
});

test("active A12 lifecycle rejects malformed and empty late-entry evidence fail-closed", () => {
  const malformedKey = reduceA12Workbench(createA12WorkbenchState(), {
    type: "LATE_ENTRY", operationKey: "late-entry:malformed", logicalPaymentId,
    canonicalEventKey: "not-a-canonical-key", reason: "Malformed watcher input.",
    authority: { role: "watcher", operatorId: "watcher-fixture" }, observation: {}
  });
  assert.equal(malformedKey.lastLifecycleResult.state, "INVALID_REJECT");
  assert.equal(malformedKey.lastLifecycleResult.reason, "LIFECYCLE_TYPED_KEYS_INVALID");
  const emptyObservation = reduceA12Workbench(createA12WorkbenchState(), {
    type: "LATE_ENTRY", operationKey: "late-entry:empty", logicalPaymentId,
    canonicalEventKey, reason: "Empty watcher input.",
    authority: { role: "watcher", operatorId: "watcher-fixture" }, observation: {}
  });
  assert.equal(emptyObservation.lastLifecycleResult.state, "INVALID_REJECT");
  assert.equal(emptyObservation.lastLifecycleResult.reason, "LATE_ENTRY_OBSERVATION_RECEIPT_STATUS_REQUIRED");
});

test("active A12 lifecycle rejects a source-less revoke fail-closed", () => {
  const state = reduceA12Workbench(createA12WorkbenchState(), {
    type: "REVOKE", operationKey: "revoke:missing", logicalPaymentId, canonicalEventKey,
    reason: "No source observation exists.", authority: { role: "reviewer", operatorId: "reviewer-fixture" }
  });
  assert.equal(state.lastLifecycleResult.state, "INVALID_REJECT");
  assert.equal(state.lastLifecycleResult.reason, "REVOKE_SOURCE_REQUIRED");
  assert.equal(Object.keys(state.lifecycleObservations).length, 0);
});

test("browser measurement contract rejects overflow, focus loss and console errors", () => {
  assert.equal(a12BrowserMeasurementContract({ scrollWidth: 1000, clientWidth: 1000, focusInsideDrawer: true, keyboardNavigable: true, consoleErrors: [] }).valid, true);
  assert.equal(a12BrowserMeasurementContract({ scrollWidth: 1001, clientWidth: 1000, focusInsideDrawer: true, keyboardNavigable: true, consoleErrors: [] }).valid, false);
  assert.equal(a12BrowserMeasurementContract({ scrollWidth: 1000, clientWidth: 1000, focusInsideDrawer: false, keyboardNavigable: true, consoleErrors: [] }).valid, false);
  assert.equal(a12BrowserMeasurementContract({ scrollWidth: 1000, clientWidth: 1000, focusInsideDrawer: true, keyboardNavigable: true, consoleErrors: ["warning"] }).valid, false);
});

test("manifest freezes current five-surface status and verifier/test byte inputs", async () => {
  const manifest = JSON.parse(await readFile(OUTPUT_PATH, "utf8"));
  assert.deepEqual(Object.fromEntries(Object.entries(manifest.current_release_surface_status).map(([id, value]) => [id, value.status])), {
    github: "TRUE_RECEIPT",
    render: "TRUE_RECEIPT",
    deck: "TRUE_RECEIPT",
    video: "TRUE_RECEIPT",
    circle_console: "BLOCKED",
    encode: "UNPROVEN",
    final: "UNPROVEN",
    arc_testnet: "VERIFIED_CHAIN_RECEIPT_PENDING_PUBLICATION_BINDING",
    erp: "VERIFIED_READ_ONLY_CANDIDATE"
  });
  assert.deepEqual(manifest.current_release_surface_status.circle_console.blockers.sort(), ["subscription_id_missing", "webhook_history_source_missing", "event_history_source_missing", "trusted_readback_loader_not_configured"].sort());
  assert.equal(manifest.current_release_surface_status.circle_console.trusted_readback_contract.schema, "arc.circle-console-trusted-readback.v1");
  assert.equal(manifest.current_release_surface_status.circle_console.trusted_readback_contract.network, "ARC-TESTNET");
  assert.equal(manifest.current_release_surface_status.circle_console.trusted_readback_contract.chain_id, 5042002);
  assert.equal(manifest.current_release_surface_status.circle_console.trusted_readback_contract.loader.calls_external_api, false);
  assert.equal(manifest.current_release_surface_status.github.current_release_bound, false);
  assert.equal(manifest.current_release_surface_status.github.published_baseline_binding, true);
  assert.equal(manifest.current_release_surface_status.github.published_baseline_current_release_bound, true);
  assert.equal(manifest.current_release_surface_status.github.baseline_commit, "afce1f22c1f6b069d47b25106b71ab13f33d4670");
  assert.equal(manifest.current_release_surface_status.github.current_worktree_candidate_bound, false);
  assert.equal("candidate_binding" in manifest.current_release_surface_status.github, false);
  assert.equal("product_commit" in manifest.current_release_surface_status.github, false);
  assert.equal("receipt_observed_remote_main" in manifest.current_release_surface_status.github, false);
  assert.equal(manifest.current_release_surface_status.github.owner_gate_required, true);
  assert.equal(manifest.worktree_truth.publication_candidate_state, "H188_ARC_CURRENT_RECEIPT_CANDIDATE_AGAINST_PUBLISHED_BASELINE_PENDING_OWNER_GATE");
  assert.equal(manifest.worktree_truth.publication_candidate_count, 13);
  assert.equal(manifest.current_release_surface_status.render.baseline_commit, "afce1f22c1f6b069d47b25106b71ab13f33d4670");
  assert.equal("observed_commit" in manifest.current_release_surface_status.render, false);
  assert.equal(manifest.current_release_surface_status.render.current_release_bound, false);
  assert.equal(manifest.current_release_surface_status.render.published_baseline_binding, true);
  assert.equal(manifest.current_release_surface_status.render.published_baseline_current_release_bound, true);
  assert.equal(manifest.current_release_surface_status.render.current_worktree_candidate_bound, false);
  assert.equal(manifest.current_release_surface_status.erp.owner_live_readback_binding, true);
  assert.equal(manifest.current_release_surface_status.erp.current_worktree_candidate_bound, false);
  assert.equal(manifest.current_release_surface_status.erp.public_current_release_bound, false);
  assert.equal("candidate_binding" in manifest.current_release_surface_status.erp, false);
  assert.equal("public_remote_binding" in manifest.current_release_surface_status.erp, false);
  assert.equal(manifest.current_release_surface_status.erp.live_erp_mutation, false);
  assert.equal(manifest.current_release_surface_status.erp.erp_readiness.status, "VERIFIED_READ_ONLY_CANDIDATE");
  assert.equal(manifest.current_release_surface_status.erp.erp_readiness.valid, true);
  assert.equal(manifest.current_release_surface_status.erp.erp_readiness.live_erp, false);
  assert.equal(manifest.current_release_surface_status.erp.erp_readiness.public_current_release_bound, false);
  assert.equal(manifest.current_release_surface_status.erp.erp_readiness.business_close, "not_proven");
  for (const surface of ["encode", "final"]) {
    assert.equal(manifest.current_release_surface_status[surface].readiness.status, "UNPROVEN");
    assert.equal(manifest.current_release_surface_status[surface].readiness.current_release_bound, false);
  }
  assert.equal(manifest.current_release_surface_status.arc_testnet.readiness.status, "UNPROVEN");
  assert.equal(manifest.current_release_surface_status.arc_testnet.historical_lineage_only, false);
  assert.match(manifest.current_release_surface_status.arc_testnet.evidence_binding, /0x2f40/);
  assert.equal(manifest.baseline_git_commit, "afce1f22c1f6b069d47b25106b71ab13f33d4670");
  assert.equal(manifest.current_worktree_candidate_bound, false);
  assert.equal(manifest.worktree_truth.baseline_commit, "afce1f22c1f6b069d47b25106b71ab13f33d4670");
  assert.equal(manifest.worktree_truth.current_head, "1090a0f9b52b81d92fab1abf810b16f0e2a7b261");
  assert.equal(manifest.worktree_truth.tracked_modified_count, 20);
  assert.equal(manifest.worktree_truth.content_candidate_count, 13);
  assert.equal(manifest.worktree_truth.mode_only_non_candidate_count, 7);
  assert.equal(manifest.worktree_truth.self_excluded_manifest_path, "current-mvp/current-release-workbench-manifest.json");
  assert.equal(manifest.worktree_truth.publication_candidate_state, "H188_ARC_CURRENT_RECEIPT_CANDIDATE_AGAINST_PUBLISHED_BASELINE_PENDING_OWNER_GATE");
  assert.equal(manifest.worktree_truth.publication_candidate_count, 13);
  const selfExcludedManifest = manifest.worktree_truth.publication_candidate_paths.find((item) => item.path === "current-mvp/current-release-workbench-manifest.json");
  assert.equal(selfExcludedManifest.self_excluded, true);
  assert.equal(selfExcludedManifest.hash_excluded, true);
  assert.equal(manifest.worktree_truth.documentation_only_content_count, 0);
  assert.deepEqual(manifest.worktree_truth.publication_candidate_paths.filter((item) => item.documentation_only).map((item) => item.path), []);
  assert.deepEqual(manifest.worktree_truth.mode_only_non_candidate_paths.map((item) => item.path), [
    "outputs/ArcCircleContracts_event_history_latest.json",
    "outputs/ArcPaymentReceipt_dual_source_monitor_latest.json",
    "outputs/ArcPaymentReceipt_event_monitor_latest.json",
    "tools/arc_payment_receipt_dual_monitor.mjs",
    "tools/arc_payment_receipt_dual_monitor.test.mjs",
    "tools/arc_payment_receipt_monitor.mjs",
    "tools/arc_payment_receipt_viewer.html"
  ]);
  assert.equal(manifest.entries.some((item) => item.path === "current-release-final-assets-evidence.json"), true);
  assert.equal(manifest.verification_inputs.filter((item) => item.role === "test").length, 8);
  assert.equal(manifest.verification_inputs.filter((item) => item.role === "verifier").length, 4);
  assert.equal(manifest.verification_inputs.filter((item) => item.role === "runtime").length, 1);
  for (const path of [
    "tools/circle_contract_webhook_gate.mjs",
    "tools/circle_console_receipt.test.mjs",
    "tools/arc_payment_receipt_server.mjs",
    "tools/arc_payment_receipt_server.test.mjs",
    "tools/circle_console_server.test.mjs",
    "tools/current_mvp_erp_readiness.mjs",
    "tools/current_mvp_erp_readiness.test.mjs",
    "tools/current_mvp_accounting_close.test.mjs",
    "tools/current_mvp_fail_closed_lifecycle.test.mjs"
  ]) assert.equal(manifest.verification_inputs.some((item) => item.path === path), true, path);
  assert.equal(manifest.accepted_request.id, "programme-current-release-product-completion-sprint-14-owner-09-domain-bridge-negative-test-request-v1");
});
