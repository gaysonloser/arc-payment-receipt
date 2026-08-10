import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";

import { verifyCurrentMvpBundle } from "./current_mvp_source_binding.mjs";
import {
  C15_WORKBENCH_CONTRACT,
  CURRENT_RELEASE_WORKBENCH_SCENARIOS,
  buildAuthorityObservation,
  buildTypedReadbacks,
  consumeCurrentReleaseProjection,
  projectCurrentReleaseWorkbench,
  validateCurrentReleaseProjection,
  validateTypedReadbacks
} from "../current-mvp/web/workbench/workbench-projection.mjs";
import {
  A12_C15_DAPP_OBJECT_IDS,
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

const zeroCounts = { bank_transaction: 0, close: 0, gl: 0, payment_entry: 0, payment_ledger: 0 };

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
  assert.equal(result.entry_count, 27);
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

test("browser measurement contract rejects overflow, focus loss and console errors", () => {
  assert.equal(a12BrowserMeasurementContract({ scrollWidth: 1000, clientWidth: 1000, focusInsideDrawer: true, keyboardNavigable: true, consoleErrors: [] }).valid, true);
  assert.equal(a12BrowserMeasurementContract({ scrollWidth: 1001, clientWidth: 1000, focusInsideDrawer: true, keyboardNavigable: true, consoleErrors: [] }).valid, false);
  assert.equal(a12BrowserMeasurementContract({ scrollWidth: 1000, clientWidth: 1000, focusInsideDrawer: false, keyboardNavigable: true, consoleErrors: [] }).valid, false);
  assert.equal(a12BrowserMeasurementContract({ scrollWidth: 1000, clientWidth: 1000, focusInsideDrawer: true, keyboardNavigable: true, consoleErrors: ["warning"] }).valid, false);
});

test("manifest freezes current five-surface status and verifier/test byte inputs", async () => {
  const manifest = JSON.parse(await readFile(OUTPUT_PATH, "utf8"));
  assert.deepEqual(Object.fromEntries(Object.entries(manifest.current_release_surface_status).map(([id, value]) => [id, value.status])), {
    github: "NOT_PUBLISHED",
    render: "NOT_PROVEN",
    encode: "NOT_PROVEN",
    circle_console: "NOT_PROVEN",
    arc_testnet: "NOT_PROVEN"
  });
  assert.equal(manifest.verification_inputs.filter((item) => item.role === "test").length, 2);
  assert.equal(manifest.verification_inputs.filter((item) => item.role === "verifier").length, 2);
  assert.equal(manifest.accepted_request.id, "programme-current-release-product-completion-sprint-14-owner-09-domain-bridge-negative-test-request-v1");
});
