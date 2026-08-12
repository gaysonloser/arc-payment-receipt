import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import {
  A12_C15_TABS,
  A12_ERP_WORKSPACE_IDS,
  A12_CAUSAL_STAGES,
  A12_SEVEN_SCENARIO_IDS,
  createA12WorkbenchState,
  reduceA12Workbench,
  projectA12Workbench,
  a12WorkbenchRoute,
  parseA12WorkbenchRoute
} from "../current-mvp/web/fixture-engine.mjs";
import {
  A12_RUNTIME_ENTRY_CONTRACT,
  WORKSPACE_CONTRACT,
  workspaceFromHash,
  workspaceProjection
} from "../current-mvp/web/navigation-workspace.mjs";

const ROOT = join(import.meta.dirname, "..");
const PUBLIC_IMPORT_GRAPH = [
  "current-mvp/web/navigation-workspace.mjs",
  "current-mvp/web/fixture-engine.mjs",
  "current-mvp/web/c15-upstream-authority.mjs",
  "current-mvp/web/workbench/workbench-projection.mjs",
  "current-mvp/web/c15-contract.mjs",
  "current-mvp/web/settlement-case.mjs"
].map((path) => join(ROOT, path));

test("A12 workflow route is a distinct primary workspace route, not an inspector-only route", () => {
  const state = createA12WorkbenchState({ scenario: "customer_invoice_receipt" });
  state.selectedStage = "allocate";
  state.inspectorTab = "ERP";
  state.searchQuery = "northwind";
  const route = a12WorkbenchRoute(state);
  const parsed = parseA12WorkbenchRoute(route);
  assert.equal(parsed.workspace, "milestone-desk");
  assert.equal(parsed.scenario, "customer_invoice_receipt");
  assert.equal(parsed.stage, "allocate");
  assert.equal(parsed.tab, "ERP");
  assert.equal(parsed.searchQuery, "northwind");
  assert.match(route, /^#a12\/workbench\//);
  assert.equal(workspaceFromHash(route), null);
  assert.equal(A12_RUNTIME_ENTRY_CONTRACT.mount, "mountA12DeepWorkbench");
  assert.equal(A12_RUNTIME_ENTRY_CONTRACT.reducer, "reduceA12Workbench");
  assert.equal(A12_RUNTIME_ENTRY_CONTRACT.projector, "projectA12Workbench");
});

test("audit action and result values are display-safe and never stringify as [object Object]", () => {
  let state = createA12WorkbenchState({ scenario: "supplier_payable" });
  state = reduceA12Workbench(state, { type: "SET_STAGE", stage: "allocate" });
  const audit = projectA12Workbench(state).inspector.audit;
  assert.ok(audit.length > 0);
  for (const event of audit) {
    assert.equal(typeof event.action, "string");
    assert.equal(typeof event.result, "string");
    assert.notEqual(String(event.result), "[object Object]");
  }
});

test("public browser import graph does not expose internal governance selectors or hashes", async () => {
  const source = (await Promise.all(PUBLIC_IMPORT_GRAPH.map((path) => readFile(path, "utf8")))).join("\n");
  for (const forbidden of [
    "R7 frozen runtime",
    "R6 producer upstream",
    "A12_R7_PACKET_ID",
    "A12_R7_EXCHANGE_SHA256",
    "A12_R7_VERDICT_ARTIFACT_SHA256",
    "A12_R6_HANDOFF_ID",
    "A12_R6_C15_AUTHORITY_OBJECT_SHA256",
    "A12_R6_C15_AUTHORITY_FILE_SHA256",
    "A12_R6_PRODUCER_EVIDENCE_SHA256",
    "A12_R6_PRODUCER_RUNTIME_SHA256",
    "accepted_c15_packet",
    "pre_review_exchange",
    "producer_evidence_sha256",
    "producer_runtime_sha256",
    "C15_UPSTREAM_AUTHORITY_RAW_OBJECT",
    "unique exchange handoffs",
    "source_packet_index",
    "source_packet_sha256",
    "correction_packet_sha256",
    "packet_object_sha256",
    "exchange_sha256",
    "upstream_authority_object_sha256",
    "identity_bundle",
    "projection_fingerprint"
  ]) assert.equal(source.includes(forbidden), false, forbidden);
  assert.doesNotMatch(source, /["'](?:packet|exchange|handoff)[_-]?(?:id|sha256)?["']\s*:/i);
  assert.doesNotMatch(source, /data-a12-batch/);
  assert.doesNotMatch(source, /fixture-engine\.mjs\?rev=[^"\n]*(?:r[67]|runtime|packet|manifest|hash)/i);
});

test("canonical hash restoration preserves the selected ERP workspace", () => {
  let state = createA12WorkbenchState({ scenario: "supplier_payable" });
  state = reduceA12Workbench(state, { type: "SET_WORKSPACE", workspace: "general-ledger" });
  const nextRoute = parseA12WorkbenchRoute("#a12/workbench/payables/supplier_payable/source/Business?q=vendor");
  state = reduceA12Workbench(state, {
    type: "RESTORE_ROUTE",
    workspace: nextRoute.workspace,
    scenario: nextRoute.scenario,
    stage: nextRoute.stage,
    tab: nextRoute.tab,
    searchQuery: nextRoute.searchQuery
  });
  assert.equal(state.selectedWorkspace, "payables");
  assert.equal(parseA12WorkbenchRoute(a12WorkbenchRoute(state)).workspace, "payables");
});

test("six legacy workspace IA identifiers are present, distinct, and reachable", () => {
  const ids = ["milestone-desk", "payables", "receivables", "reconciliation", "general-ledger", "audit-trail"];
  assert.deepEqual(Object.keys(WORKSPACE_CONTRACT), ids);
  const projections = ids.map((id) => {
    assert.equal(workspaceFromHash(WORKSPACE_CONTRACT[id].hash), id);
    return workspaceProjection(id, { document: { noun: "Purchase Invoice", railStatus: "OPEN" }, result: { receiptState: "not evaluated" } });
  });
  assert.equal(new Set(projections.map(({ title }) => title)).size, ids.length);
});

test("six ERP workspaces drive distinct primary jobs and canonical routes", () => {
  assert.deepEqual(A12_ERP_WORKSPACE_IDS, ["milestone-desk", "payables", "receivables", "reconciliation", "general-ledger", "audit-trail"]);
  const jobs = [];
  for (const workspace of A12_ERP_WORKSPACE_IDS) {
    let state = createA12WorkbenchState({ scenario: "supplier_payable" });
    state = reduceA12Workbench(state, { type: "SET_WORKSPACE", workspace });
    const view = projectA12Workbench(state);
    assert.equal(view.workspace.id, workspace);
    assert.equal(parseA12WorkbenchRoute(a12WorkbenchRoute(state)).workspace, workspace);
    assert.match(view.canvas.headline, new RegExp(view.workspace.primaryJob.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    jobs.push(view.workspace.primaryJob);
  }
  assert.equal(new Set(jobs).size, A12_ERP_WORKSPACE_IDS.length);
});

test("fail-closed lifecycle/accounting/ERP truth remains local and unposted", () => {
  const state = createA12WorkbenchState({ scenario: A12_SEVEN_SCENARIO_IDS[0] });
  const view = projectA12Workbench(state);
  assert.equal(view.externalActions, 0);
  assert.equal(view.claims.liveArc, false);
  assert.equal(view.claims.liveErp, false);
  assert.equal(view.claims.settlementExecution, false);
  assert.equal(view.claims.erpPosting, false);
  assert.equal(view.claims.businessClose, false);
  assert.equal(view.claims.chainSuccessImpliesErpPosting, false);
  assert.equal(view.claims.chainSuccessImpliesBusinessClose, false);
  assert.equal(view.workbenchProjection.erp_consequence_allowed, false);
  assert.equal(view.workbenchProjection.business_close_state, "unavailable");
  assert.equal(view.workbenchProjection.business_close_state, "unavailable");
  assert.deepEqual(view.inspector.tabs, A12_C15_TABS);
  assert.ok(A12_CAUSAL_STAGES.some((stage) => stage.id === view.causalRail[0].id));
});
