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
  canonicalProjectionPayloadDigest,
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
  A12_ORIGIN_ENTRY_CATALOG,
  A12_SEVEN_SCENARIO_IDS,
  a12BalanceSufficiency,
  a12MilestoneFlow,
  createA12TypedEvidence,
  createA12WorkbenchState,
  projectA12Workbench,
  reduceA12Workbench,
  a12WorkbenchRoute,
  parseA12WorkbenchRoute
} from "../current-mvp/web/fixture-engine.mjs";
import { a12BrowserMeasurementContract, a12MilestoneOutcomeFromKey, a12ReconciliationRows, a12RuntimeLayoutMetrics, a12UiFilteredQueue, a12UiMarkup, a12UiPublicReceiptValue, a12WorkspaceFocusTarget, a12WorkspacePrimaryMarkup } from "../current-mvp/web/navigation-workspace.mjs";
import {
  CONTENT_MANIFEST_SCHEMA,
  CURRENT_MVP_ROOT,
  OUTPUT_PATH,
  RENDER_STATUS,
  RENDER_SERVICE_ID,
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
  assert.equal(manifest.schema, CONTENT_MANIFEST_SCHEMA);
  assert.equal(manifest.release_binding.model, "content_addressed_external_receipt");
  assert.equal(manifest.release_binding.external_immutable_receipt_required, true);
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
    const manifestPath = join(candidate, "current-release-workbench-manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.base_release_id = "forged-base-release";
    manifest.base_manifest_sha256 = "0".repeat(64);
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    const wrongBase = await verifyCurrentReleaseWorkbenchManifest({ root: candidate });
    assert.equal(wrongBase.issues.includes("base_manifest_binding_invalid"), true);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("content manifest rejects embedded GitHub or Render self-receipts", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "arc-h186-manifest-"));
  try {
    const candidate = join(temporary, "current-mvp");
    await cp(CURRENT_MVP_ROOT, candidate, { recursive: true });
    const manifestPath = join(candidate, "current-release-workbench-manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.release_binding.github_commit = "a".repeat(40);
    manifest.release_binding.render_deployment_id = "dep-fabricated";
    manifest.delivery_surfaces.github.commit = "a".repeat(40);
    manifest.delivery_surfaces.render.deployment_id = "dep-fabricated";
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    const result = await verifyCurrentReleaseWorkbenchManifest({ root: candidate });
    assert.equal(result.valid, false);
    assert.ok(result.issues.includes("release_binding_contract_invalid"));
    assert.ok(result.issues.includes("github_receipt_boundary_invalid"));
    assert.ok(result.issues.includes("render_receipt_boundary_invalid"));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("current release manifest binds the embedded ERP read-only projection and keeps surface readbacks unproven", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "arc-h187-manifest-"));
  try {
    const candidate = join(temporary, "current-mvp");
    await cp(CURRENT_MVP_ROOT, candidate, { recursive: true });
    const manifestPath = join(candidate, "current-release-workbench-manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.delivery_surfaces.erp.erp_readiness.live_erp = true;
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    const result = await verifyCurrentReleaseWorkbenchManifest({ root: candidate });
    assert.equal(result.valid, false);
    assert.equal(result.issues.includes("erp_readiness_binding_invalid"), true);
    manifest.delivery_surfaces.erp.erp_readiness = JSON.parse(await readFile(OUTPUT_PATH, "utf8")).delivery_surfaces.erp.erp_readiness;
    manifest.delivery_surfaces.encode.readiness.status = "VERIFIED_READ_ONLY";
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    const promoted = await verifyCurrentReleaseWorkbenchManifest({ root: candidate });
    assert.equal(promoted.valid, false);
    assert.equal(promoted.issues.includes("surface_readiness_invalid:encode"), true);
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
  assert.deepEqual(a12RuntimeLayoutMetrics(1440, 1024, 2), { viewport: "1440x1024", height: 1024, navigation: 208, queue: 300, inspector: 0, inspectorMode: "drawer", overflowX: "none", overflowY: "scrollable", textFloorPx: 16, zoomPercent: 200 });
  assert.deepEqual(a12RuntimeLayoutMetrics(1280, 800, 2).viewport, "1280x800");
  assert.deepEqual(a12RuntimeLayoutMetrics(1024, 768, 2).inspectorMode, "focus_trapped_drawer");
  assert.deepEqual(A12_C15_VIEWPORT_ORACLE["1024x768"].inspectorMode, "focus_trapped_drawer");
});

test("UI correction keeps business focus visible while progressive disclosure and navigation remain observable", async () => {
  const navigation = await readFile(join(CURRENT_MVP_ROOT, "web/navigation-workspace.mjs"), "utf8");
  assert.match(navigation, /a12-object-summary/);
  assert.match(navigation, /status-recovery/);
  assert.match(navigation, /a12-disclosure.*consequence/);
  assert.match(navigation, /a12-rail-disclosure/);
  assert.match(navigation, /Actionable selection/);
  assert.match(navigation, /Read-only source/);
  assert.equal(a12RuntimeLayoutMetrics(1280, 800, 1).navigation, 208);
  assert.equal(a12RuntimeLayoutMetrics(1024, 768, 1).navigation, 176);
  let state = createA12WorkbenchState({ scenario: "supplier_payable" });
  const before = projectA12Workbench(state);
  state = reduceA12Workbench(state, { type: "SET_STAGE", stage: "allocate" });
  const after = projectA12Workbench(state);
  assert.equal(after.canvas.scenario, before.canvas.scenario);
  assert.equal(after.canvas.command.next_owner, before.canvas.command.next_owner);
  assert.match(state.lastNotice, /Main workspace changed to/);
  assert.match(state.lastNotice, /Completion is not implied/);
  state = reduceA12Workbench(state, { type: "RESTORE_ROUTE", scenario: "supplier_payable", stage: "source", tab: "Business" });
  assert.equal(state.lastNotice, "");
  assert.match(navigation, /button\[aria-current="page"\]/);
  assert.match(navigation, /\.a12-field input\{min-height:44px/);
  assert.match(navigation, /@media\(max-width:1600px\).*\.a12-object-summary\{grid-template-columns:repeat\(2/);
});

test("operational text floor wins over legacy compact declarations", async () => {
  const navigation = await readFile(join(CURRENT_MVP_ROOT, "web/navigation-workspace.mjs"), "utf8");
  const floorRule = ".a12-shell-status,.a12-state-pill,.a12-object-ref button,.a12-origin-entry-option small,.a12-live,.a12-bottom-action .a12-kicker,.a12-field-hint,.a12-disclosure>summary span,.a12-status-meta,.a12-receipt-field b,.a12-receipt-field span,.a12-object-row b,.a12-object-row span,.a12-object-row small,.a12-causal-stage strong,.a12-causal-stage span,.a12-causal-stage small{font-size:12px!important}";
  const floorIndex = navigation.lastIndexOf(floorRule);
  assert.notEqual(floorIndex, -1);
  for (const compactDeclaration of [".a12-shell-status{min-height:30px;gap:5px;padding:4px 7px;white-space:nowrap;font-size:11px}", ".a12-state-pill{display:inline-flex!important", ".a12-object-ref button{min-height:30px", ".a12-origin-entry-option small{overflow:hidden", ".a12-live{position:fixed"]) {
    assert.ok(floorIndex > navigation.lastIndexOf(compactDeclaration), `${compactDeclaration} must be overridden by the operational floor`);
  }
});

test("R1 UI correction keeps active navigation persistent, summaries readable, and route restore notice-free", async () => {
  const navigation = await readFile(join(CURRENT_MVP_ROOT, "web/navigation-workspace.mjs"), "utf8");
  const fixture = await readFile(join(CURRENT_MVP_ROOT, "web/fixture-engine.mjs"), "utf8");
  assert.match(navigation, /control\.setAttribute\("aria-current", active \? "page" : "false"\)/);
  assert.match(navigation, /a12-nav-list button\[aria-current="page"\]/);
  assert.match(navigation, /minmax\(560px,1fr\) 300px/);
  assert.match(navigation, /\.a12-app \.a12-field output\{min-height:44px!important\}/);
  assert.match(fixture, /state\.lastNotice = "";/);
  let state = createA12WorkbenchState({ scenario: "supplier_payable" });
  state = reduceA12Workbench(state, { type: "SET_STAGE", stage: "allocate" });
  assert.match(state.lastNotice, /Main workspace changed to/);
  state = reduceA12Workbench(state, { type: "RESTORE_ROUTE", scenario: "supplier_payable", stage: "source", tab: "Business" });
  assert.equal(state.selectedStage, "source");
  assert.equal(state.inspectorTab, "Business");
  assert.equal(state.lastNotice, "");
  assert.doesNotMatch(state.lastNotice, /Moved to Allocate/);
});

test("Milestone desk is an accounting document center with a single five-step decision path", async () => {
  const navigation = await readFile(join(CURRENT_MVP_ROOT, "web/navigation-workspace.mjs"), "utf8");
  const index = await readFile(join(CURRENT_MVP_ROOT, "web/index.html"), "utf8");
  const state = createA12WorkbenchState({ scenario: "supplier_payable" });
  const view = projectA12Workbench(state);
  const markup = a12WorkspacePrimaryMarkup(view, state, []);
  const fullMarkup = a12UiMarkup(view, state);
  const stepIds = [...markup.matchAll(/data-a12-milestone-step="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(stepIds, ["document", "reviewer", "arc-receipt", "erp-reconciliation", "gl-close"]);
  assert.match(markup, /data-testid="milestone-business-document"/);
  assert.match(markup, /Accounting document center/);
  assert.match(markup, /aria-label="Document to reviewer to Arc receipt to ERP reconciliation to GL close timeline"/);
  assert.match(markup, /USDC · Arc settlement summary/);
  for (const label of ["Counterparty", "Open item", "Principal", "Status", "Gayson guide", "next owner", "recovery"]) assert.match(markup, new RegExp(label));
  assert.equal((markup.match(/data-a12-milestone-outcome=/g) ?? []).length, 3);
  assert.match(markup, /<button type="button" class="a12-decision-row/);
  assert.match(markup, /data-testid="milestone-decision-states" role="radiogroup" aria-labelledby="milestone-decision-heading"/);
  assert.match(markup, /id="milestone-decision-heading"/);
  assert.equal((markup.match(/role="radio"/g) ?? []).length, 3);
  assert.equal((markup.match(/tabindex="0"/g) ?? []).length, 1);
  assert.equal((markup.match(/tabindex="-1"/g) ?? []).length, 2);
  assert.doesNotMatch(markup, /a12-command/);
  assert.doesNotMatch(fullMarkup, /class="a12-command"/);
  assert.equal((fullMarkup.match(/data-a12-primary/g) ?? []).length, 1);
  assert.match(fullMarkup, /data-current-workspace="milestone-desk"/);
  assert.match(navigation, /const commandMarkup = isMilestoneDesk \? ""/);
  assert.match(navigation, /const supportingMarkup = isMilestoneDesk \? fieldsMarkup/);
  assert.match(navigation, /grid-template-columns:minmax\(0,1\.55fr\) minmax\(320px,\.78fr\)/);
  assert.match(navigation, /\.a12-object-summary\{display:none\}/);
  assert.match(navigation, /\.a12-object-line\{display:grid;grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
  assert.match(navigation, /\.a12-workspace-guide\{display:none\}/);
  assert.match(navigation, /@media\(min-width:721px\)\{\.a12-app\[data-current-workspace="milestone-desk"\] \.a12-shell\{display:grid;grid-template-columns:minmax\(160px,1fr\) repeat\(3,max-content\)/);
  assert.match(navigation, /@media\(max-width:720px\)\{\.a12-app\[data-current-workspace="milestone-desk"\] \.a12-shell\{display:grid;grid-template-columns:1fr/);
  assert.match(navigation, /\.a12-shell-status:nth-child\(n\+5\)\{display:none\}/);
  assert.match(navigation, /\.a12-case-header h1\{font-family:Georgia,[^}]*font-size:26px/);
  assert.match(navigation, /\.a12-object-ref\{min-height:44px/);
  assert.match(navigation, /\.a12-canvas\{padding:16px 22px 92px\}/);
  assert.match(navigation, /\.a12-bottom-action\{position:fixed;[^}]*min-height:72px/);
  assert.match(navigation, /Final visual closeout:[\s\S]*?\.a12-canvas\{padding-bottom:92px\}[\s\S]*?\.a12-bottom-action\{min-height:72px/);
  assert.match(navigation, /@media\(max-width:1050px\)\{\.a12-app\[data-current-workspace="milestone-desk"\] \.a12-canvas\{padding-bottom:24px\}[^}]+\.a12-milestone-layout\{grid-template-columns:1fr\}[^}]+\.a12-bottom-action\{position:static;min-height:76px/);
  assert.match(navigation, /@media\(max-width:720px\)\{\.a12-app\[data-current-workspace="milestone-desk"\] \.a12-canvas\{padding-bottom:24px\}[^}]+\.a12-bottom-action\{position:static;min-height:88px/);
  assert.match(navigation, /\["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"\]/);
  assert.match(navigation, /SELECT_MILESTONE_OUTCOME/);
  assert.match(index, /navigation-workspace\.mjs\?rev=v3-2-a12-r4-milestone-document-center/);
  assert.equal(a12RuntimeLayoutMetrics(1440, 1024, 1).overflowX, "none");
  assert.equal(a12RuntimeLayoutMetrics(1024, 768, 2).inspectorMode, "focus_trapped_drawer");
});

test("mounted milestone journey advances through evidence, approvals and journal while exceptions stay open", () => {
  let state = createA12WorkbenchState({ scenario: "supplier_payable" });
  assert.equal(a12MilestoneFlow(state).step, "receipt_evaluation");
  assert.equal(state.milestoneErpProposal, false);
  assert.equal(state.milestoneJournalPreview, false);
  state = reduceA12Workbench(state, { type: "SELECT_MILESTONE_OUTCOME", outcome: "stale" });
  assert.equal(state.matcherState, "stale");
  assert.equal(a12MilestoneFlow(state).step, "recovery");
  assert.equal(state.milestoneErpProposal, false);
  assert.equal(state.milestoneJournalPreview, false);
  state = reduceA12Workbench(createA12WorkbenchState({ scenario: "supplier_payable" }), { type: "SELECT_MILESTONE_OUTCOME", outcome: "matched" });
  assert.equal(state.matcherState, "matched");
  assert.equal(state.evidence?.outcome, "matched");
  const mountedSteps = [];
  for (let index = 0; index < 5; index += 1) {
    const view = projectA12Workbench(state);
    const markup = a12UiMarkup(view, state);
    const flow = a12MilestoneFlow(state);
    mountedSteps.push(flow.step);
    assert.equal(flow.enabled, true);
    assert.match(markup, /data-a12-milestone-primary/);
    assert.match(markup, /data-testid="milestone-business-document"/);
    state = reduceA12Workbench(state, { type: "MILESTONE_PRIMARY_ACTION" });
  }
  assert.deepEqual(mountedSteps, ["reviewer_attestation", "payer_approval", "primary_action", "erp_proposal", "journal_preview"]);
  assert.equal(state.milestoneEvidenceReviewed, true);
  assert.equal(state.milestoneReviewerAttested, true);
  assert.equal(state.milestonePayerApproved, true);
  assert.equal(state.milestoneErpProposal, true);
  assert.equal(state.milestoneJournalPreview, true);
  assert.equal(a12MilestoneFlow(state).step, "complete");
  assert.match(state.lastNotice, /journal preview opened locally/i);
  assert.match(a12UiMarkup(projectA12Workbench(state), state), /Balanced journal preview available/);

  for (const matcherState of ["stale", "mismatch"]) {
    const exceptionState = { ...createA12WorkbenchState({ scenario: "supplier_payable" }), matcherState };
    const exceptionView = projectA12Workbench(exceptionState);
    const exceptionMarkup = a12UiMarkup(exceptionView, exceptionState);
    assert.match(exceptionMarkup, new RegExp(`data-a12-milestone-state="${matcherState}"`));
    assert.match(exceptionMarkup, /data-a12-milestone-payable>OPEN</);
    assert.match(exceptionMarkup, /Payable stays OPEN/);
    assert.equal(a12MilestoneFlow(exceptionState).step, "recovery");
  }
});

test("milestone radio keyboard navigation changes the real reducer state and roving tab stop", () => {
  const outcomes = ["matched", "stale", "mismatch"];
  assert.equal(a12MilestoneOutcomeFromKey(outcomes, "matched", "ArrowRight"), "stale");
  assert.equal(a12MilestoneOutcomeFromKey(outcomes, "stale", "ArrowDown"), "mismatch");
  assert.equal(a12MilestoneOutcomeFromKey(outcomes, "matched", "ArrowLeft"), "mismatch");
  assert.equal(a12MilestoneOutcomeFromKey(outcomes, "mismatch", "Home"), "matched");
  assert.equal(a12MilestoneOutcomeFromKey(outcomes, "matched", "End"), "mismatch");
  let state = createA12WorkbenchState({ scenario: "supplier_payable" });
  const selected = a12MilestoneOutcomeFromKey(outcomes, "matched", "ArrowRight");
  state = reduceA12Workbench(state, { type: "SELECT_MILESTONE_OUTCOME", outcome: selected });
  const markup = a12WorkspacePrimaryMarkup(projectA12Workbench(state), state, []);
  assert.equal(state.matcherState, "stale");
  assert.match(markup, /data-a12-milestone-outcome="stale"[^>]*tabindex="0"[^>]*aria-checked="true"/);
  assert.match(markup, /data-a12-milestone-outcome="matched"[^>]*tabindex="-1"[^>]*aria-checked="false"/);
});

test("mounted inspectors expose policy, provenance, failure and fee depth without widening claims", () => {
  let state = reduceA12Workbench(createA12WorkbenchState({ scenario: "supplier_payable" }), { type: "SELECT_MILESTONE_OUTCOME", outcome: "matched" });
  let view = projectA12Workbench(state);
  assert.equal(view.canvas.policy.allowance, "1250000000");
  assert.equal(view.canvas.policy.payer, "payer-registry-fixture");
  assert.equal(view.canvas.policy.recipient, "recipient-registry-fixture");
  assert.equal(view.canvas.policy.reviewer, "reviewer-jamie-fixture");
  assert.equal(view.canvas.policy.ttlMinutes, 15);
  assert.equal(Date.parse(view.canvas.policy.observedAt) <= Date.parse(view.canvas.policy.validUntil), true);
  assert.deepEqual(view.inspector.logs.map((record) => record.logIndex), [0, 1, 2]);
  assert.deepEqual(view.inspector.logs.map((record) => record.emitter), ["fixture:USDC", "fixture:ArcSystemTransfer", "fixture:PolicySettlementV1"]);
  assert.equal(BigInt(view.canvas.networkFee.maximum) >= BigInt(view.canvas.networkFee.effective), true);
  assert.equal(view.canvas.networkFee.principalUnit, "amount6");
  assert.equal(view.canvas.networkFee.unit, "native18");
  assert.equal(view.canvas.networkFee.principalIncludedInFee, false);
  assert.equal(BigInt(view.canvas.networkFee.principalBalanceAmount6) >= BigInt(view.canvas.amount6), true);
  assert.equal(BigInt(view.canvas.networkFee.gasBalanceNative18) >= BigInt(view.canvas.networkFee.maximum), true);
  assert.equal(view.canvas.networkFee.balanceSufficient, view.canvas.networkFee.principalBalanceSufficient && view.canvas.networkFee.gasBalanceSufficient);
  assert.deepEqual(a12BalanceSufficiency({ principalBalanceAmount6: "499", requiredPrincipalAmount6: "500", gasBalanceNative18: "300", maximumFeeNative18: "301" }), { principalBalanceSufficient: false, gasBalanceSufficient: false, balanceSufficient: false });
  state = { ...state, inspectorTab: "Arc" };
  let markup = a12UiMarkup(projectA12Workbench(state), state);
  const structuredReceiptIds = [
    "policy_event_expected_observed_status_source",
    "erc20_transfer_expected_observed_status_source",
    "arc_system_transfer_expected_observed_status_source",
    "getter_expected_observed_status_source"
  ];
  const structuredReceiptFields = projectA12Workbench(state).inspector.receiptFields.filter((field) => structuredReceiptIds.includes(field.fieldId));
  assert.equal(structuredReceiptFields.length, 4);
  for (const field of structuredReceiptFields) {
    const publicValue = a12UiPublicReceiptValue(field.value);
    for (const label of ["Expected:", "Observed:", "Status:", "Source:"]) assert.match(publicValue, new RegExp(label));
    assert.doesNotMatch(publicValue, /\[object Object\]/);
    assert.doesNotMatch(publicValue, /(?:r[0-9]+|runtime|packet|manifest|sha256|governance)/i);
    assert.match(markup, new RegExp(field.fieldId));
  }
  assert.doesNotMatch(markup, /\[object Object\]/);
  assert.doesNotMatch(markup, /r[0-9]+-independent-/i);
  for (const fact of ["amount6 cap / validUntil", "attestation nonce / replay guard", "payer / recipient / reviewer", "emitter", "logIndex", "block/log order is authoritative", "Wrong network · chainId 5042001 ≠ 5042002", "Final status 0"]) assert.match(markup, new RegExp(fact));
  assert.match(markup, /Status 1 \+ readback mismatch/);
  state = { ...state, inspectorTab: "Ledger" };
  markup = a12UiMarkup(projectA12Workbench(state), state);
  for (const fact of ["Estimated network fee", "0.00024 native18 USDC", "Maximum network fee", "0.00030 native18 USDC", "Effective fee", "0.00022 native18 USDC", "principal amount6 balance", "native18 gas balance", "units remain separate"]) assert.match(markup, new RegExp(fact));
  const stale = reduceA12Workbench(createA12WorkbenchState({ scenario: "supplier_payable" }), { type: "SELECT_MILESTONE_OUTCOME", outcome: "stale" });
  const staleView = projectA12Workbench(stale);
  assert.equal(staleView.canvas.firstFailure, "receipt_freshness.validUntil_or_ttl");
  assert.match(staleView.canvas.recovery, /Refresh validUntil \/ TTL evidence/);
  assert.equal(staleView.canvas.networkFee.effective, null);
  assert.equal(Date.parse(staleView.canvas.policy.observedAt) > Date.parse(staleView.canvas.policy.validUntil), true);
});

test("every mounted inspector scenario stays free of raw object coercion", () => {
  for (const scenario of A12_SEVEN_SCENARIO_IDS) {
    for (const inspectorTab of A12_C15_TABS) {
      const state = { ...createA12WorkbenchState({ scenario }), inspectorTab };
      assert.doesNotMatch(a12UiMarkup(projectA12Workbench(state), state), /\[object Object\]/, `${scenario}/${inspectorTab}`);
    }
  }
  assert.equal(a12UiPublicReceiptValue(1n), "1");
  assert.equal(
    a12UiPublicReceiptValue({ expected: { b: 2, a: 1 }, observed: null, status: "matched", source: "r11-independent-fixture" }),
    "Expected: { A: 1 · B: 2 } · Observed: Not provided · Status: matched · Source: Typed local source"
  );
  let deeplyNestedArray = "leaf";
  for (let depth = 0; depth < 15_000; depth += 1) deeplyNestedArray = [deeplyNestedArray];
  assert.equal(a12UiPublicReceiptValue(deeplyNestedArray), "Structured value");
});

test("six ERP routes mount distinct primary jobs and exact focus targets", () => {
  const expected = {
    "milestone-desk": "[data-testid=\"milestone-business-document\"]",
    payables: "#payables-worklist",
    receivables: "#receivables-worklist",
    reconciliation: "#reconciliation-workbench-root",
    "general-ledger": "#ledger-table",
    "audit-trail": "#audit-log"
  };
  for (const [workspace, focusTarget] of Object.entries(expected)) assert.equal(a12WorkspaceFocusTarget(workspace), focusTarget);
  let state = createA12WorkbenchState({ scenario: "supplier_payable" });
  state = reduceA12Workbench(state, { type: "SET_WORKSPACE", workspace: "reconciliation" });
  let markup = a12WorkspacePrimaryMarkup(projectA12Workbench(state), state, []);
  assert.match(markup, /id="reconciliation-workbench-root"/);
  assert.match(markup, /class="a12-reconciliation-scroll" role="region" aria-label="Scrollable locked document and receipt comparison" tabindex="0"/);
  assert.match(markup, /Locked document versus typed receipt comparison/);
  assert.equal((markup.match(/data-first-failure=/g) ?? []).length, 5);
  assert.match(markup, /First exact blocker/);
  let rows = a12ReconciliationRows(projectA12Workbench(state), state);
  assert.equal(rows.length, 5);
  assert.equal(rows[0].observed, "missing");
  assert.equal(rows[0].status, "blocking");
  assert.equal(rows[0].recoveryAction, "Open Arc evidence");
  assert.equal(rows[0].actionTab, "Arc");
  assert.equal(rows[0].actionable, true);
  assert.match(markup, /data-a12-reconciliation-action/);
  assert.match(markup, /data-a12-reconciliation-consequence/);
  assert.match(markup, /Receipt is not matched; ERP proposal stays held/);
  assert.match(markup, /data-a12-workspace="general-ledger" disabled aria-disabled="true">Review non-posting journal proposal/);
  state = createA12WorkbenchState({ scenario: "supplier_payable" });
  state = reduceA12Workbench(state, { type: "SELECT_MILESTONE_OUTCOME", outcome: "mismatch" });
  state = reduceA12Workbench(state, { type: "SET_WORKSPACE", workspace: "reconciliation" });
  rows = a12ReconciliationRows(projectA12Workbench(state), state);
  assert.equal(rows[0].field, "erc20_transfer.amount6");
  assert.equal(rows[0].locked, "500");
  assert.equal(rows[0].observed, "499");
  assert.equal(rows[0].status, "blocking");
  assert.equal(rows[0].recoveryAction, "Inspect erc20_transfer.amount6");
  state = createA12WorkbenchState({ scenario: "supplier_payable" });
  state = reduceA12Workbench(state, { type: "SELECT_MILESTONE_OUTCOME", outcome: "stale" });
  state = reduceA12Workbench(state, { type: "SET_WORKSPACE", workspace: "reconciliation" });
  rows = a12ReconciliationRows(projectA12Workbench(state), state);
  assert.equal(rows[0].field, "receipt_freshness");
  assert.match(rows[0].locked, /within TTL/);
  assert.match(rows[0].observed, /stale · confirmations 1/);
  assert.equal(rows[0].status, "blocking");
  assert.equal(rows[0].recoveryAction, "Refresh receipt TTL");
  state = createA12WorkbenchState({ scenario: "supplier_payable" });
  state = reduceA12Workbench(state, { type: "SELECT_MILESTONE_OUTCOME", outcome: "matched" });
  state = reduceA12Workbench(state, { type: "SET_WORKSPACE", workspace: "reconciliation" });
  markup = a12WorkspacePrimaryMarkup(projectA12Workbench(state), state, []);
  assert.match(markup, /data-matcher-state="matched"/);
  assert.match(markup, /Receipt matched; journal proposal may be reviewed/);
  assert.doesNotMatch(markup, /data-a12-workspace="general-ledger" disabled/);
  assert.match(markup, /Payment Entry/);
  assert.match(markup, /Bank Transaction/);
  assert.match(markup, /GL \/ PLED/);
  assert.match(markup, /Outstanding \/ close/);
  state = reduceA12Workbench(state, { type: "SET_WORKSPACE", workspace: "general-ledger" });
  markup = a12WorkspacePrimaryMarkup(projectA12Workbench(state), state, []);
  assert.match(markup, /id="ledger-table"/);
  assert.match(markup, /Balanced non-posting journal preview/);
  assert.match(markup, /Supplier payable settlement/);
  assert.match(markup, /Bank \/ treasury clearing/);
  assert.match(markup, /Non-posting boundary/);
});

test("workflow navigation changes the main decision surface, not only an inspector tab", () => {
  let state = createA12WorkbenchState({ scenario: "supplier_payable" });
  const before = projectA12Workbench(state);
  state = reduceA12Workbench(state, { type: "SET_WORKFLOW_ROUTE", route: "post" });
  const post = projectA12Workbench(state);
  assert.equal(post.canvas.route, "post");
  assert.notEqual(post.canvas.headline, before.canvas.headline);
  assert.equal(state.inspectorTab, "ERP");
  state = reduceA12Workbench(state, { type: "SET_WORKFLOW_ROUTE", route: "evidence" });
  const evidence = projectA12Workbench(state);
  assert.equal(evidence.canvas.route, "evidence");
  assert.match(evidence.canvas.headline, /evidence/i);
  assert.equal(state.inspectorTab, "Audit");
});

test("public Audit serialization is readable and redacts governance identifiers", async () => {
  const navigation = await readFile(join(CURRENT_MVP_ROOT, "web/navigation-workspace.mjs"), "utf8");
  assert.match(navigation, /a12UiPublicAuditValue/);
  assert.match(navigation, /Structured event \(internal details withheld\)/);
  assert.match(navigation, /Internal governance detail withheld/);
  assert.match(navigation, /Evidence provenance/);
  assert.doesNotMatch(navigation, /<h3>R7 frozen runtime · R6 producer upstream<\/h3>/);
  assert.doesNotMatch(navigation, /<code>active packet:/);
  assert.doesNotMatch(navigation, /R7 exchange sha256:/);
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
  assert.match(readme, /current `2524f0d` source carries a source-separated current-contract receipt/);
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

test("all seven public projections use a stable public identity and canonical typed-readback digest", () => {
  for (const scenario of CURRENT_RELEASE_WORKBENCH_SCENARIOS) {
    const observation = buildAuthorityObservation(scenario);
    const projection = projectCurrentReleaseWorkbench({ scenario, ...observation });
    const ledger = new Map();
    const first = consumeCurrentReleaseProjection(projection, ledger);
    const expectedKey = `${projection.release_id}:${scenario}:${projection.receipt.canonical_event_key}`;
    assert.equal(first.state, "new", scenario);
    assert.equal(first.key, expectedKey, scenario);
    const digest = canonicalProjectionPayloadDigest(projection, expectedKey);
    assert.equal(ledger.get(expectedKey), digest, scenario);
    assert.equal(consumeCurrentReleaseProjection(structuredClone(projection), ledger).state, "DUPLICATE_NOOP", scenario);

    const changed = structuredClone(projection);
    changed.typed_readbacks.invoice.party_id = `${changed.typed_readbacks.invoice.party_id}-mutated`;
    assert.notEqual(canonicalProjectionPayloadDigest(changed, expectedKey), digest, scenario);
    assert.equal(consumeCurrentReleaseProjection(changed, ledger).state, "CONFLICT_REJECT", scenario);
  }

  const missingKey = projectCurrentReleaseWorkbench({ scenario: "employee_payable", ...buildAuthorityObservation("employee_payable") });
  delete missingKey.receipt.canonical_event_key;
  assert.equal(consumeCurrentReleaseProjection(missingKey, new Map()).state, "OPEN");
  assert.equal(consumeCurrentReleaseProjection(missingKey, new Map()).error, "CANONICAL_EVENT_KEY_REQUIRED");
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

test("chain observed origin entry is operable, authority-bound, dependency-resetting, and route-stable", () => {
  const chainEntry = A12_ORIGIN_ENTRY_CATALOG.chain_observed;
  assert.equal(chainEntry.scenario, "customer_invoice_receipt");
  let state = createA12WorkbenchState({ scenario: "supplier_payable" });
  state = reduceA12Workbench(state, { type: "SET_STAGE", stage: "allocate" });
  state.fieldEdits = { source_purchase_invoice: "operator-value" };
  state.matcherState = "matched";
  state.evidence = { outcome: "matched" };
  state.completedStages = ["allocate"];
  state.walletReview = "prepared_owner_gate_closed";
  state.inspectorOpen = true;
  state.searchQuery = "supplier";
  state = reduceA12Workbench(state, { type: "SELECT_ORIGIN_ENTRY", origin: "chain_observed", scenario: chainEntry.scenario, authorityId: chainEntry.authorityId });
  assert.equal(state.selectedScenario, chainEntry.scenario);
  assert.equal(state.originEntry.origin, "chain_observed");
  assert.equal(state.fixture.origin, "chain_observed");
  assert.equal(state.selectedStage, "source");
  assert.equal(state.matcherState, "pending");
  assert.equal(state.evidence, null);
  assert.deepEqual(state.completedStages, []);
  assert.equal(state.walletReview, "not_prepared");
  assert.equal(state.inspectorOpen, false);
  assert.equal(state.searchQuery, "");
  assert.match(state.lastNotice, /Arc chain observed selected/);
  const route = a12WorkbenchRoute(state);
  assert.equal(parseA12WorkbenchRoute(route).origin, "chain_observed");
  const restored = reduceA12Workbench(createA12WorkbenchState(), { type: "RESTORE_ROUTE", ...parseA12WorkbenchRoute(route) });
  assert.equal(restored.originEntry.origin, "chain_observed");
  assert.equal(restored.lastNotice, "");
  const forgedRoute = parseA12WorkbenchRoute("#a12/workbench/milestone-desk/supplier_payable/not-an-accepted-origin/source/business");
  const rejectedRoute = reduceA12Workbench(createA12WorkbenchState(), { type: "RESTORE_ROUTE", ...forgedRoute });
  assert.equal(rejectedRoute.originEntry.origin, "erp_initiated");
  assert.match(rejectedRoute.lastNotice, /Route origin rejected fail-closed/);
  const forged = reduceA12Workbench(createA12WorkbenchState({ scenario: "supplier_payable" }), { type: "SELECT_ORIGIN_ENTRY", origin: "chain_observed", scenario: "supplier_payable", authorityId: "product-authority-supplier-payable-001" });
  assert.equal(forged.selectedScenario, "supplier_payable");
  assert.equal(forged.originEntry.origin, "erp_initiated");
  assert.match(forged.lastNotice, /rejected fail-closed/);
  assert.equal(forged.externalActions, 0);
  const markup = a12UiMarkup(projectA12Workbench(state), state);
  assert.match(markup, /data-a12-origin-classification/);
  assert.match(markup, /ERP initiated/);
  assert.match(markup, /Arc chain observed/);
  assert.match(markup, /data-a12-origin-entry="chain_observed"[^>]+aria-pressed="true"/);
  assert.match(markup, /data-a12-origin-entry="erp_initiated"[^>]+aria-pressed="false"/);
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

test("content manifest freezes product bytes while external receipts remain external", async () => {
  const manifest = JSON.parse(await readFile(OUTPUT_PATH, "utf8"));
  assert.equal(manifest.schema, CONTENT_MANIFEST_SCHEMA);
  assert.equal(manifest.release_binding.model, "content_addressed_external_receipt");
  assert.equal(manifest.release_binding.self_authenticating_commit, false);
  assert.equal(manifest.release_binding.github_commit, null);
  assert.equal(manifest.release_binding.render_deployment_id, null);
  assert.deepEqual(Object.fromEntries(Object.entries(manifest.delivery_surfaces).map(([id, value]) => [id, value.status])), {
    github: "EXTERNAL_IMMUTABLE_RECEIPT_REQUIRED",
    render: RENDER_STATUS,
    deck: "PUBLISHED_BASELINE_RECEIPT",
    video: "PUBLISHED_BASELINE_RECEIPT",
    circle_console: "BLOCKED",
    encode: "UNPROVEN",
    final: "UNPROVEN",
    arc_testnet: "VERIFIED_READ_ONLY_CHAIN_RECEIPT",
    erp: "VERIFIED_READ_ONLY_CANDIDATE"
  });
  assert.deepEqual(manifest.delivery_surfaces.circle_console.blockers.sort(), ["subscription_id_missing", "webhook_history_source_missing", "event_history_source_missing", "trusted_readback_loader_not_configured"].sort());
  assert.equal(manifest.delivery_surfaces.circle_console.trusted_readback_contract.chain_id, 5042002);
  assert.equal(manifest.delivery_surfaces.github.commit, null);
  assert.equal(manifest.delivery_surfaces.render.service_id, RENDER_SERVICE_ID);
  assert.equal(manifest.delivery_surfaces.render.deployment_id, null);
  assert.equal(manifest.delivery_surfaces.erp.owner_live_readback_binding, true);
  assert.equal(manifest.delivery_surfaces.erp.current_release_bound, false);
  assert.equal(manifest.delivery_surfaces.erp.live_erp_mutation, false);
  assert.equal(manifest.delivery_surfaces.erp.erp_readiness.status, "VERIFIED_READ_ONLY_CANDIDATE");
  assert.equal(manifest.delivery_surfaces.erp.erp_readiness.valid, true);
  assert.equal(manifest.delivery_surfaces.erp.erp_readiness.live_erp, false);
  assert.equal(manifest.delivery_surfaces.erp.erp_readiness.business_close, "not_proven");
  for (const surface of ["encode", "final"]) {
    assert.equal(manifest.delivery_surfaces[surface].readiness.status, "UNPROVEN");
    assert.equal(manifest.delivery_surfaces[surface].readiness.current_release_bound, false);
  }
  assert.match(manifest.delivery_surfaces.arc_testnet.evidence_binding, /PolicySettlementV1/);
  assert.equal(manifest.boundaries.external_actions, 0);
  assert.equal(manifest.boundaries.chain_success_implies_erp_posting, false);
  assert.equal(manifest.boundaries.chain_success_implies_business_close, false);
  assert.equal(manifest.entries.some((item) => item.path === "current-release-final-assets-evidence.json"), true);
  assert.equal(manifest.verification_inputs.filter((item) => item.role === "test").length, 12);
  assert.equal(manifest.verification_inputs.filter((item) => item.role === "verifier").length, 4);
  assert.equal(manifest.verification_inputs.filter((item) => item.role === "runtime").length, 2);
  for (const path of [
    "tools/circle_contract_webhook_gate.mjs",
    "tools/circle_contract_webhook_gate.test.mjs",
    "tools/circle_webhook_store.mjs",
    "tools/circle_webhook_store.test.mjs",
    "tools/circle_webhook_server.test.mjs",
    "tools/circle_console_receipt.test.mjs",
    "tools/arc_payment_receipt_server.mjs",
    "tools/arc_payment_receipt_server.test.mjs",
    "tools/circle_console_server.test.mjs",
    "tools/current_mvp_erp_readiness.mjs",
    "tools/current_mvp_erp_readiness.test.mjs",
    "tools/current_mvp_accounting_close.test.mjs",
    "tools/current_mvp_fail_closed_lifecycle.test.mjs"
  ]) assert.equal(manifest.verification_inputs.some((item) => item.path === path), true, path);
  assert.equal("accepted_request" in manifest, false);
  assert.equal("worktree_truth" in manifest, false);
  assert.equal("independent_audit" in manifest, false);
});
