import { buildCanonicalArcReceipt, buildSettlementRoute, parseSettlementRoute, settlementCaseReducer } from "./settlement-case.mjs?rev=v3-a01f-frozen-operator-arc-erp-browser-truth";
import { A12_BATCH_ID, A12_CORRECTION_BATCH_ID, A12_C15_TABS, A12_SCENARIO_IDS, A12_C15_VIEWPORT_ORACLE, A12_ERP_WORKSPACE_IDS, A12_ORIGIN_ENTRY_CATALOG, A12_ORIGIN_ENTRY_IDS, A12_ORIGIN_LABELS, verifyA12C15UpstreamAuthorityObject, createA12WorkbenchState, reduceA12Workbench, projectA12Workbench, a12WorkbenchRoute, parseA12WorkbenchRoute } from "./fixture-engine.mjs?rev=current-release-workbench";

export { A12_BATCH_ID };

// One active A12 runtime owner. The older workspace exports below are kept
// solely for pre-A12 regression compatibility and are not mounted by the page.
export const A12_RUNTIME_ENTRY_CONTRACT = Object.freeze({
  batchId: A12_BATCH_ID,
  correctionBatchId: A12_CORRECTION_BATCH_ID,
  mount: "mountA12DeepWorkbench",
  reducer: "reduceA12Workbench",
  projector: "projectA12Workbench",
  localFixtureOnly: true,
  externalActions: 0
});

export const WORKSPACE_CONTRACT = Object.freeze({
  "milestone-desk": { area: "Milestone desk", hash: "#workspace=milestone-desk", focusId: "doc-title", activityPanel: "history" },
  payables: { area: "Payables", hash: "#workspace=payables", focusId: "workspace-heading" },
  receivables: { area: "Receivables", hash: "#workspace=receivables", focusId: "workspace-heading" },
  reconciliation: { area: "Reconciliation", hash: "#workspace=reconciliation", focusId: "reconciliation-workbench-root", activityPanel: "linked" },
  "general-ledger": { area: "General ledger", hash: "#workspace=general-ledger", focusId: "workspace-heading" },
  "audit-trail": { area: "Audit trail", hash: "#workspace=audit-trail", focusId: "workspace-heading", activityPanel: "audit" }
});

export function workspaceFromHash(hash = "") {
  return Object.keys(WORKSPACE_CONTRACT).find((id) => WORKSPACE_CONTRACT[id].hash === hash) ?? null;
}

export function workspaceProjection(id, { document, result }) {
  const noun = document?.noun ?? "Document";
  const state = document?.railStatus ?? "OPEN";
  const receipt = result?.receiptState ?? "not evaluated";
  const content = {
    "milestone-desk": ["Milestone desk", `${noun} · ${state}. Work the active close decision and its next local control.`],
    payables: ["Payables · outgoing worklist", `Locate an outgoing supplier, employee or refund item. The selected document remains ${noun} · ${state} until an explicit row selection.`],
    receivables: ["Receivables · incoming worklist", "Classify customer collection, advance or refund with an explicit purpose and original-document relationship."],
    reconciliation: ["Reconciliation · comparison workbench", `Matcher status: ${receipt}. Compare locked document facts to one typed logical payment and follow its exact recovery.`],
    "general-ledger": ["General ledger · local proposal", `Inspect the balanced, non-postable journal for this ${noun}; no ERP posting, wallet or broadcast is available.`],
    "audit-trail": ["Audit trail · causation and recovery", "Trace document, attestation, receipt, reconciliation and journal decisions in order; inspect the object behind any event."]
  };
  const [title, detail] = content[id] ?? content["milestone-desk"];
  return { title, detail };
}

export const WORK_QUEUE_STAGES = Object.freeze([
  ["work-queue", "Work queue", "Select the source document and party."],
  ["match-funds", "Match funds", "Compare policy, receipt and readback."],
  ["post-erp", "Post to ERP", "Prepare a controlled Payment Entry / Bank Transaction."],
  ["ledger-close", "Ledger / close", "Read GL/PLED and apply the separate close boundary."],
  ["evidence", "Evidence", "Keep the causal record and recovery path inspectable."]
]);

const localTypedEvidence = (state, tier = "A") => ({
  tier,
  observationId: `dom-${state.caseId}-${state.revision + 1}`,
  source: "typed_server_evidence",
  roles: { reviewer: "reviewer-fixture", payer: "payer-fixture", distinct: true },
  serverEvidence: { source: "typed_server_evidence", authorityRef: `local-server-evidence:${state.caseId}`, caseId: state.caseId, companyId: state.companyId, treasuryId: state.treasuryId, observationId: `dom-${state.caseId}-${state.revision + 1}`, tier, roles: { reviewer: "reviewer-fixture", payer: "payer-fixture", distinct: true } }
});
const localReceiptFor = (state) => {
  const amount6 = state.allocation.allocatedAmount6;
  const incoming = state.profileId.startsWith("receipt_") && state.profileId !== "receipt_refund" || state.profileId === "payment_refund";
  const payer = incoming ? "0x2000000000000000000000000000000000000002" : "0x3000000000000000000000000000000000000003";
  const recipient = incoming ? "0x3000000000000000000000000000000000000003" : "0x2000000000000000000000000000000000000002";
  return buildCanonicalArcReceipt({ policyContract: "0x1000000000000000000000000000000000000001", payer, recipient, policyId: state.policy.policyId, transferId: state.policy.transferId, attestationDigest: state.policy.attestationDigest, attestationNonce: state.policy.attestationNonce, amount6, transactionHash: "0x" + "55".repeat(32), observedAt: "2026-08-10T12:00:00.000Z", validUntil: "2026-08-10T13:00:00.000Z", caseBinding: { caseId: state.caseId, companyId: state.companyId, profileId: state.profileId, origin: state.origin, sourceDocument: state.candidate?.document ?? state.allocation.originalReference, treasuryId: state.treasuryId, policyId: state.policy.policyId, transferId: state.policy.transferId } });
};

export function taskLoop({ accounting, document: doc, result }) {
  const matchStatus = result.receiptState === "matched" ? "matched" : result.receiptState === "rejected" ? "blocked" : "not-evaluated";
  const matchLabel = matchStatus === "matched" ? "Funds matched" : matchStatus === "blocked" ? "Funds blocked" : "Awaiting controls";
  const erpStatus = result.receiptState === "matched" ? "proposal-ready" : "hold";
  const closeStatus = doc.closeAllowed ? "close-proposal" : "open";
  const statuses = ["selected", matchStatus, erpStatus, closeStatus, "traceable"];
  const labels = [
    ["Source selected", `${accounting.profile.documentNumber} · ${doc.source || "original required"}`],
    [matchLabel, result.receiptState === "matched" ? "Typed receipt and readback agree." : doc.openItem],
    [erpStatus === "proposal-ready" ? "ERP draft ready" : "Hold before ERP", accounting.journal.postingBoundary || "Matcher gate remains open."],
    [closeStatus === "close-proposal" ? "Close proposal" : "Ledger / close held", doc.railStatus],
    ["Receipt + readback", result.receiptState === "matched" ? "3 records → 1 logical payment" : result.exception]
  ];
  const actions = ["rank", "select-candidate", "prepare-erp", "review-close", "open-evidence"];
  const actionLabels = ["Rank source candidates", "Select exact candidate", "Prepare Payment Entry draft", "Review close boundary", "Open evidence trail"];
  const extra = `<div class="task-loop-actions">${button("Attach server evidence", `data-workflow-action="attach-evidence" aria-label="Attach typed server evidence for ${accounting.profile.documentNumber}"`)}${button("Read typed Arc receipt", `data-workflow-action="read-receipt" aria-label="Read typed Arc receipt for ${accounting.profile.documentNumber}"`)}${button("Confirm Tier C authority", `data-workflow-action="tier-c" aria-label="Confirm Tier C authority for ${accounting.profile.documentNumber}"`)}${button("Verify ERP readback", `data-workflow-action="submit-erp" aria-label="Verify ERP readback for ${accounting.profile.documentNumber}"`)}${button("Reconcile Bank Transaction", `data-workflow-action="reconcile-bank" aria-label="Reconcile Bank Transaction for ${accounting.profile.documentNumber}"`)}${button("Generate GL / PLED", `data-workflow-action="generate-ledger" aria-label="Generate ledger for ${accounting.profile.documentNumber}"`)}${button("Close operational control", `data-workflow-action="close-operational" aria-label="Close operational control for ${accounting.profile.documentNumber}"`)}${button("Close accounting period", `data-workflow-action="close-period" aria-label="Close accounting period for ${accounting.profile.documentNumber}"`)}${button("Close business item", `data-workflow-action="close-business" aria-label="Close business item for ${accounting.profile.documentNumber}"`)}</div>`;
  return `<section class="workspace-task-loop" aria-label="Work queue to funds match to ERP draft to ledger close to evidence"><div class="task-loop-heading"><span class="eyebrow">Task loop</span><b>Work queue → match funds → post to ERP → ledger / close → evidence</b><small>One document, one shared SettlementCase, no direct ERP or wallet side effects.</small></div><ol>${WORK_QUEUE_STAGES.map(([id, title], index) => `<li data-workflow-stage="${id}" data-stage-status="${statuses[index]}"><span class="task-loop-index">${index + 1}</span><div><b>${title}</b><small>${labels[index][0]} · ${labels[index][1]}</small>${button(actionLabels[index], `data-workflow-action="${actions[index]}" aria-label="${actionLabels[index]} for ${accounting.profile.documentNumber}"`)}${index===1?button("Set typed allocation", `data-workflow-action="allocate" aria-label="Set typed allocation for ${accounting.profile.documentNumber}"`):""}</div></li>`).join("")}</ol>${extra}</section>`;
}

const button = (label, attributes = "") => `<button type="button" ${attributes}>${label}</button>`;
const table = (id, headers, body) => `<div class="workspace-table-wrap"><table class="workspace-table" id="${id}" tabindex="-1"><thead><tr>${headers.map((label) => `<th>${label}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div>`;
const stateChip = (label, variant = "") => `<span class="state-chip ${variant}">${label}</span>`;

const outgoingRows = [
  { id: "payment_advance", title: "Supplier advance", no: "PAY-ADV-2026-031", party: "Supplier", source: "PO-2026-0731", amount: "1,250.00 USDC", readiness: "AP stays open" },
  { id: "payment_corporate_payable", title: "Corporate payable", no: "PAY-AP-2026-1187", party: "Supplier", source: "PINV-2026-044", amount: "1,250.00 USDC", readiness: "Matcher-gated" },
  { id: "payment_personal_payable", title: "Employee payable", no: "PAY-EMP-2026-019", party: "Employee", source: "EEXP-2026-019", amount: "1,250.00 USDC", readiness: "Matcher-gated" },
  { id: "payment_refund", title: "Payment refund", no: "PREF-2026-006", party: "Supplier / Employee", source: "PAY-AP-2026-1187", amount: "250.00 USDC", readiness: "Original + ceiling" }
];
const incomingRows = [
  { id: "receipt", purpose: "invoice_collection", title: "Invoice collection", no: "RCPT-2026-072", party: "Customer", source: "SINV-2026-072", amount: "1,250.00 USDC", readiness: "Customer AR" },
  { id: "receipt", purpose: "customer_advance", title: "Customer advance", no: "RCPT-ADV-2026-012", party: "Customer", source: "CADV-2026-012", amount: "1,250.00 USDC", readiness: "Customer advance" },
  { id: "receipt_refund", purpose: "invoice_collection", title: "Receipt refund", no: "RREF-2026-009", party: "Customer", source: "RCPT-2026-072", amount: "250.00 USDC", readiness: "Original + ceiling" }
];

function recoveryBlock(document, accounting, result, actionName, label) {
  return `<aside class="workspace-recovery" aria-label="Recovery route"><div><span class="eyebrow">Open-item consequence</span><b>${document.openItem}</b><p>${accounting.exception}</p></div>${button(label, `data-workspace-action="${actionName}"`)}</aside>`;
}

function documentIcon(document) {
  if (/Receipt/.test(document.noun)) return "receipt.svg";
  if (/refund/i.test(document.noun)) return "money-bill-transfer.svg";
  if (/Employee/.test(document.noun)) return "users.svg";
  return "file-invoice-dollar.svg";
}

export function workspaceProductShell(id, { accounting, document: doc, result, state }) {
  if (id !== "milestone-desk") {
    // Reconciliation owns the flagship task frame. Its document truth stays in the shared header;
    // its proof objects and Gayson assistant live beside the comparison, not in a repeated hero.
    if (id === "reconciliation") return "";
    const workspaceGuide = {
      payables: { target: "payables-worklist", title: "Select the outgoing open item", copy: "Start with the row that owns the supplier, employee or refund obligation. Its source relationship and matcher gate decide the next local action." },
      receivables: { target: "receivables-worklist", title: "Classify the incoming customer object", copy: "Choose invoice collection, customer advance or receipt refund before comparing the customer-to-treasury receipt direction." },
      reconciliation: { target: "match-workbench", title: result.key === "stale" ? "Locate the TTL comparison" : result.key === "mismatch" ? "Locate the readback mismatch" : "Compare the locked receipt fields", copy: result.key === "stale" ? "Freshness is the blocking field. Keep the business item open and use the exact TTL recovery." : result.key === "mismatch" ? "The typed receipt differs from the locked document. Use the mismatched row and linked receipt record to recover." : "The comparison grid is the task canvas. A fixture selection is not an accepted matcher outcome." },
      "general-ledger": { target: "ledger-table", title: accounting.journal.status === "proposal_ready" ? "Inspect the balanced local proposal" : "Inspect the non-postable journal boundary", copy: "The account rows, source object and separate native fee are the decision surface. Nothing posts to ERP from this local workspace." },
      "audit-trail": { target: "audit-log", title: result.key === "stale" ? "Trace freshness recovery" : result.key === "mismatch" ? "Trace the receipt mismatch cause" : "Trace the decision causation", copy: "Follow the selected event to its linked object and recovery; do not treat a generic reviewer state as the cause for every workspace." }
    }[id];
    const compactNodes = [
      ["Document", accounting.profile.documentNumber, `assets/icons/${documentIcon(doc)}`],
      ["Attestation", state.settlementCase?.reviewerAttested ? "Recorded fixture" : "Awaiting review", "assets/icons/circle-check.svg"],
      ["Circle USDC / Arc", result.receiptState === "not evaluated" ? "Not evaluated" : result.receiptState, "assets/brand/usdc-token-official.svg"],
      ["ERP decision", doc.railStatus, "assets/icons/scale-balanced.svg"],
      ["GL proposal", accounting.journal.status.replaceAll("_", " "), "assets/icons/book-open.svg"]
    ];
    return `<section class="workspace-product-shell workspace-compact-shell workspace-${id}" aria-label="${WORKSPACE_CONTRACT[id].area} working context">
      <div class="workspace-compact-guide"><img src="assets/gayson-receipt-assistant-reference.png" alt="Gayson task assistant"><div><span class="eyebrow">Gayson · task guide</span><b>${workspaceGuide.title}</b><p>${workspaceGuide.copy}</p>${button("Focus current task", `data-workspace-focus="${workspaceGuide.target}"`)}</div></div>
      <div class="workspace-compact-object"><img src="assets/icons/${documentIcon(doc)}" alt=""><div><span class="eyebrow">Active document</span><b>${accounting.profile.documentNumber} · ${doc.noun}</b><small>${accounting.profile.counterpartyClass} · ${doc.amount} · ${doc.payer} → ${doc.recipient}</small></div><span class="state-chip ${result.receiptState === "matched" ? "good" : result.receiptState === "not evaluated" ? "" : "warn"}">${result.receiptState === "not evaluated" ? "Not evaluated" : result.receiptLabel}</span></div>
      <div class="workspace-compact-rail" aria-label="Document, attestation, Circle USDC / Arc receipt, ERP decision and general-ledger proposal">${compactNodes.map(([label,value,icon],index) => `<div class="compact-node compact-node-${index}">${index===2?'<span class="compact-receipt-brand"><img src="assets/brand/usdc-token-official.svg" alt="Official Circle USDC"><img src="assets/brand/arc-logo-navy-official.svg" alt="Official Arc"></span>':`<img src="${icon}" alt="">`}<span>${label}</span><b>${index===2?(result.receiptState === "not evaluated" ? "Not evaluated · Arc Testnet proof pending" : `${value} · Arc Testnet 5042002`):value}</b></div>`).join("")}</div>
      ${taskLoop({ accounting, document: doc, result })}
    </section>`;
  }
  const focusId = !state.settlementCase?.reviewerAttested || !state.settlementCase?.payerApproved ? "primary-action" : WORKSPACE_CONTRACT[id].focusId;
  const isException = result.key === "stale" || result.key === "mismatch";
  const accepted = result.receiptState === "matched";
  const guidance = !state.settlementCase?.reviewerAttested
    ? "Reviewer attestation is the first local condition. It is distinct from payer approval and does not release funds."
    : !state.settlementCase?.payerApproved
      ? `Reviewer evidence is recorded. Review the separate exact ${doc.amount} approval fixture next.`
      : doc.guidance.replace(/^Gayson:\s*/, "");
  const task = {
    payables: "Classify an outgoing item, inspect its original relationship, then send the selected document to the matcher.",
    receivables: "Classify an incoming customer item with its purpose and original-document rule before reconciliation.",
    reconciliation: "Compare the locked document to the typed logical payment and isolate the first exact failing field.",
    "general-ledger": "Review the balanced, document-aware journal proposal and retain its non-postable boundary.",
    "audit-trail": "Trace the causal decision history and inspect the evidence or recovery attached to each state transition."
  }[id] ?? "Work the selected milestone document.";
  const gAction = !state.settlementCase?.reviewerAttested ? "Record reviewer attestation" : !state.settlementCase?.payerApproved ? "Review approval decision" : isException ? (result.key === "stale" ? "Inspect freshness recovery" : "Inspect receipt mismatch") : id === "reconciliation" ? "Inspect comparison fields" : "Locate current task";
  const decision = accepted ? doc.proposal : accounting.exception;
  return `<section class="workspace-product-shell workspace-${id}" aria-label="${WORKSPACE_CONTRACT[id].area} workspace context">
    <div class="workspace-taskbar">
      <div class="workspace-gayson-scene">
        <img src="assets/gayson-receipt-assistant-reference.png" alt="Gayson task assistant">
        <div class="workspace-gayson-copy"><span class="eyebrow">Gayson · current task</span><b>${guidance}</b><p>${task}</p>${button(gAction, `data-workspace-focus="${focusId}"`)}</div>
      </div>
      <div class="workspace-decision-object">
        <div class="workspace-document-ref"><img src="assets/icons/${documentIcon(doc)}" alt=""><div><span class="eyebrow">Active document</span><b>${accounting.profile.documentNumber} · ${doc.noun}</b><small>${accounting.profile.counterpartyClass} · ${accounting.profile.counterparty} · source ${doc.source}</small></div></div>
        <div class="workspace-decision-state"><span class="state-chip ${isException ? "warn" : accepted ? "good" : ""}">${result.receiptLabel}</span><b>${doc.railStatus}</b><small>${decision}</small></div>
      </div>
    </div>
    <div class="workspace-causal-rail" aria-label="Document to business-decision causal rail">
      <div class="rail-node document-node"><img src="assets/icons/${documentIcon(doc)}" alt=""><span>Document</span><b>${accounting.profile.documentNumber}</b></div>
      <div class="rail-link" aria-hidden="true"></div>
      <div class="rail-node attestation-node"><img src="assets/icons/circle-check.svg" alt=""><span>Attestation</span><b>${state.settlementCase?.reviewerAttested ? "Recorded fixture" : "Awaiting review"}</b></div>
      <div class="rail-link" aria-hidden="true"></div>
      <div class="rail-node receipt-node"><span class="rail-brand"><img src="assets/brand/usdc-token-official.svg" alt="Official Circle USDC"><img src="assets/brand/arc-logo-navy-official.svg" alt="Official Arc"></span><span>Typed receipt</span><b>${result.receiptState === "not evaluated" ? "Not evaluated · no Arc receipt" : "Arc Testnet · 5042002"}</b></div>
      <div class="rail-link" aria-hidden="true"></div>
      <div class="rail-node erp-node"><img src="assets/icons/scale-balanced.svg" alt=""><span>ERP decision</span><b>${doc.railStatus}</b></div>
      <div class="rail-link" aria-hidden="true"></div>
      <div class="rail-node journal-node"><img src="assets/icons/book-open.svg" alt=""><span>GL proposal</span><b>${accounting.journal.status.replaceAll("_", " ")}</b></div>
    </div>
  </section>`;
}

export function canvasMarkup(id, { accounting, document: doc, result, view, state }) {
  const canonicalProfile = (profile, purpose) => profile === "receipt" ? (purpose === "customer_advance" ? "receipt_customer_advance" : "receipt_invoice_collection") : profile;
  const isSelected = (profile, purpose) => state.settlementCase?.profileId === canonicalProfile(profile, purpose) && (!purpose || state.receiptPurpose === purpose);
  const validation = accounting.errors.length ? `<p class="workspace-validation" role="alert"><b>Classification needs repair:</b> ${accounting.errors.join(" ")}</p>` : "";
  if (id === "payables") {
    const rows = outgoingRows.map((row) => `<tr class="${isSelected(row.id) ? "selected-row" : ""}"><td><b>${row.title}</b><small>${row.no}</small></td><td>${row.party}</td><td>${button(row.source, 'class="object-link" data-workspace-action="source"')}</td><td>${row.amount}</td><td>${stateChip(row.readiness)}</td><td>${button(isSelected(row.id) ? "Selected" : "Select", `data-select-profile="${row.id}" ${isSelected(row.id) ? "disabled" : ""}`)}</td></tr>`).join("");
    const empty = outgoingRows.some((row) => isSelected(row.id)) ? "" : '<div class="workspace-empty-state"><b>No outgoing item is selected.</b><span>The active document is not compatible with this outgoing worklist. Select a supplier, employee or refund fixture to change it explicitly.</span></div>';
    return `<section class="workspace-canvas-head"><div><span class="eyebrow">Outgoing open-item work</span><h2 id="workspace-heading" tabindex="-1">Payables worklist</h2><p>Choose an outgoing supplier, employee or refund fixture. A row selection is an explicit document change, not navigation side effect.</p></div>${button("Edit selected classification", 'data-workspace-action="accounting"')}</section>${empty}${table("payables-worklist", ["Document", "Counterparty", "Original", "Amount", "Open-item / readiness", ""], rows)}${validation}<div class="workspace-object-line"><b>Active direction</b><span>${doc.payer} → ${doc.recipient}</span><span>amount6 ${doc.amount6}</span>${button("Send to reconciliation", 'data-workspace-route="reconciliation"')}</div>${recoveryBlock(doc, accounting, result, "accounting", "Inspect selected profile")}`;
  }
  if (id === "receivables") {
    const rows = incomingRows.map((row) => `<tr class="${isSelected(row.id, row.purpose) ? "selected-row" : ""}"><td><b>${row.title}</b><small>${row.no}</small></td><td>${row.party}</td><td>${button(row.source, 'class="object-link" data-workspace-action="source"')}</td><td>${row.amount}</td><td>${stateChip(row.readiness)}</td><td>${button(isSelected(row.id, row.purpose) ? "Selected" : "Select", `data-select-profile="${row.id}" data-receipt-purpose="${row.purpose}" ${isSelected(row.id, row.purpose) ? "disabled" : ""}`)}</td></tr>`).join("");
    const empty = incomingRows.some((row) => isSelected(row.id, row.purpose)) ? "" : '<div class="workspace-empty-state"><b>No incoming item is selected.</b><span>The active document is not compatible with this receivables worklist. Select a customer collection, advance or refund fixture explicitly.</span></div>';
    return `<section class="workspace-canvas-head"><div><span class="eyebrow">Incoming open-item work</span><h2 id="workspace-heading" tabindex="-1">Receivables worklist</h2><p>Classify an incoming customer collection, advance or refund. Purpose and original-document rules remain visible rather than inheriting payable language.</p></div>${button("Edit selected classification", 'data-workspace-action="accounting"')}</section>${empty}${table("receivables-worklist", ["Received document", "Customer", "Purpose / original", "Amount", "Open-item", ""], rows)}${validation}<div class="workspace-object-line"><b>Active direction</b><span>${doc.payer} → ${doc.recipient}</span><span>${doc.noun} remains ${doc.railStatus}</span>${button("Send to reconciliation", 'data-workspace-route="reconciliation"')}</div>${recoveryBlock(doc, accounting, result, "accounting", "Inspect purpose and source")}`;
  }
  if (id === "reconciliation") {
    const pending = result.receiptState === "not evaluated";
    // Pending is a control sequence, not a generic error. Once the reviewer fixture
    // is present, the separately scoped payer-approval control becomes the next task.
    const pendingControl = state.settlementCase?.reviewerAttested
      ? { field: "separate payer approval", action: "Review separate payer approval", detail: "Reviewer attestation is recorded; review the exact local payer-approval fixture before evaluating any receipt." }
      : { field: "reviewer attestation", action: "Record reviewer attestation", detail: "Record the independent reviewer attestation before any payer approval or receipt evaluation." };
    const erc20 = view.receipt.records.find((item) => item.id === "erc20-transfer");
    const field = (name) => erc20?.fields.find(([key]) => key === name)?.[1] ?? "not present";
    // This is the Reconciliation operational rail: exactly five locked/readback fields.
    // Lifecycle and control detail remain available in the proof column and side sheets.
    const comparisons = [
      ["amount6", doc.amount6, pending ? "Not evaluated — awaiting local controls" : field("amount6")],
      ["payer", doc.payer, pending ? "Not evaluated — awaiting local controls" : field("from")],
      ["recipient", doc.recipient, pending ? "Not evaluated — awaiting local controls" : field("to")],
      ["policy version / nonce", "PolicySettled / nonce 42", pending ? "Not evaluated — no policy event" : result.key === "stale" ? "expired validUntil fixture / nonce 42" : "PolicySettled / nonce 42"],
      ["original document", doc.source, pending ? "Not evaluated — no linked receipt" : accounting.journal.source]
    ];
    const firstFailure = pending ? pendingControl.field : result.key === "stale" ? "policy version / nonce" : result.key === "mismatch" ? "recipient" : "none — no failed field";
    const rows = comparisons.map(([fact, locked, observed]) => {
      const match = !pending && String(locked) === String(observed);
      const decision = pending ? "not evaluated" : match ? "match" : result.key === "stale" ? "refresh TTL" : "review mismatch";
      const selected = !pending && fact === firstFailure;
      const id = `reconciliation-row-${fact.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}`;
      const action = fact === "amount6" ? "Compare amount" : fact === "payer" ? "Open payer" : fact === "recipient" ? "Open recipient" : fact === "policy version / nonce" ? "Open policy controls" : "Open original document";
      const actionTarget = fact === "policy version / nonce" ? "evidence" : fact === "original document" ? "source" : "receipt";
      return `<tr id="${id}" class="${pending ? "pending-row" : match ? "match-row" : "mismatch-row"}${selected ? " selected-failure" : ""}" tabindex="${selected ? "0" : "-1"}" aria-label="${selected ? `First failed field: ${fact}` : `${fact} comparison`}"><td><b>${fact}</b><small>${locked}</small></td><td>${observed}</td><td>${stateChip(decision, pending ? "" : match ? "good" : "warn")}</td><td>${button(action, `data-workspace-action="${actionTarget}"`)}</td></tr>`;
    }).join("");
    const firstFailureLabel = firstFailure ?? "none — all local fields agree";
    const consequence = result.receiptState === "matched"
      ? `<b>ERP consequence · local reconciliation proposal</b><p>${doc.openItem} Balanced journal preview is available; no ERP posting occurs.</p>${button("Inspect balanced journal", 'data-workspace-action="journal"')}`
      : pending
        ? `<b>ERP consequence · original open item unchanged</b><p>Receipt/readback has not been evaluated. ${pendingControl.detail} No mismatch, reversal or close proposal exists yet.</p>${button(pendingControl.action, 'data-workspace-focus="primary-action"')}`
        : `<b>ERP consequence · original open item unchanged</b><p>${accounting.exception}</p>${button(result.key === "stale" ? "Open TTL recovery" : "Inspect mismatch recovery", `data-workspace-action="${result.key === "stale" ? "evidence" : "receipt"}"`)}`;
    const lifecycle = [["Condition", state.settlementCase?.reviewerAttested ? "complete" : "current"], ["Receipt", result.receiptState === "matched" ? "complete" : pending ? "current" : "blocked"], ["ERP decision", result.receiptState === "matched" ? "complete" : pending ? "current" : "blocked"], ["Readback", result.receiptState === "matched" ? "complete" : pending ? "current" : "blocked"]];
    const firstFailureId = firstFailure ? `reconciliation-row-${firstFailure.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}` : "primary-action";
    const assistantAction = result.receiptState === "matched"
      ? "Review the local approval decision"
      : result.key === "stale"
        ? "Refresh validUntil / TTL"
        : result.key === "mismatch"
          ? "Inspect recipient mismatch"
          : pendingControl.action;
    const assistantFocus = result.key === "stale" || result.key === "mismatch" ? "match-workbench" : "primary-action";
    return [
      taskLoop({ accounting, document: doc, result }),
      '<section class="reconciliation-flagship" aria-label="Reconciliation flagship workbench">',
      '<div class="reconciliation-primary">',
      '<section class="workspace-canvas-head"><div><span class="eyebrow">Locked document vs receipt readback</span><h2 id="workspace-heading" tabindex="-1">Reconciliation workbench</h2><p>Compare one locked accounting document with one typed logical payment. The first failed row owns recovery; no hash-only or pending state can close the business item.</p></div></section>',
      table("match-workbench", ["Locked document", "Typed receipt / readback", "Result", "Row action"], rows),
      `<aside class="erp-consequence ${result.receiptState === "matched" ? "matched" : "exception"}">${consequence}</aside>`,
      '</div>',
      '<aside class="reconciliation-proof" aria-label="Circle USDC, Arc receipt and current decision proof">',
      '<section class="proof-asset"><div><img src="assets/brand/usdc-token-official.svg" alt="Official Circle USDC"><img src="assets/brand/arc-logo-navy-official.svg" alt="Official Arc"></div><b>Circle USDC · Arc Testnet</b><span>chain ID 5042002 · local fixture only</span></section>',
      `<section class="proof-receipt"><span class="eyebrow">Receipt readback</span><b>${view.receipt.records.length} records · one logical payment</b><p>${doc.receiptDetail}</p>${button("Inspect typed receipt", 'data-workspace-action="receipt"')}</section>`,
      `<section class="proof-lifecycle"><span class="eyebrow">Arc lifecycle</span>${lifecycle.map(([label, status]) => `<div class="life-${status}"><i></i><b>${label}</b><span>${status === "complete" ? "recorded" : status === "current" ? "current local control" : "recovery required"}</span></div>`).join("")}</section>`,
      `<section class="proof-gayson"><img src="assets/gayson-receipt-assistant-reference.png" alt="Gayson task assistant"><div><span class="eyebrow">Gayson · current blocker</span><b>${assistantAction}</b><p>First field: ${firstFailure}</p>${button("Focus first decision", `data-workspace-focus="${assistantFocus}"`)}</div></section>`,
      '</aside></section>'
    ].join("");
  }
  if (id === "general-ledger") {
    const journalRows = accounting.journal.rows.map((row) => `<tr><td><b>${row.account}</b></td><td>${button(row.object, 'class="object-link" data-workspace-action="source"')}</td><td class="num">${row.debit}</td><td class="num">${row.credit}</td><td>${button("Inspect", 'data-workspace-action="journal"')}</td></tr>`).join("");
    return `<section class="workspace-canvas-head"><div><span class="eyebrow">Document-aware accounting proposal</span><h2 id="workspace-heading" tabindex="-1">General ledger canvas</h2><p>Review a balanced, local journal by document type × counterparty × purpose. The proposal stays explicitly non-postable.</p></div>${button("Edit GL profile", 'data-workspace-action="accounting"')}</section><div class="ledger-profile"><b>${accounting.profile.label}</b><span>${accounting.profile.counterpartyClass}</span><span>${accounting.profile.purpose}</span><span>Source: ${doc.source}</span></div>${table("ledger-table", ["Account", "Object / source", "Debit", "Credit", ""], `${journalRows}<tr class="ledger-total"><td colspan="2">Balanced local proposal: ${accounting.journal.totals.balanced ? "yes" : "no"}</td><td class="num">${accounting.journal.totals.debit}</td><td class="num">${accounting.journal.totals.credit}</td><td></td></tr>`)}<div class="workspace-object-line"><b>Native18 fee stays separate</b><span>${accounting.journal.fee.amount} · ${accounting.journal.fee.status}</span><span>Reconciliation: ${doc.proposal}</span>${button("Open journal detail", 'data-workspace-action="journal"')}</div>${recoveryBlock(doc, accounting, result, "journal", "Review non-postable exception")}`;
  }
  if (id === "audit-trail") {
    const events = [
      ["09:12", "Document", "Prepared", `No decision → ${doc.railStatus}`, "source"],
      ["09:28", "Reviewer", state.settlementCase?.reviewerAttested ? "Attested" : "Pending", "Evidence condition", "evidence"],
      ["09:31", "Receipt", result.receiptState, doc.receiptDetail, "receipt"],
      ["09:34", "Reconciliation", doc.proposal, accounting.exception, "evidence"],
      ["09:35", "Journal", accounting.journal.status, accounting.journal.recovery, "journal"]
    ];
    const filter = state.auditFilter ?? "All";
    const filtered = events.filter(([, object, event]) => filter === "All" || object === filter || (filter === "Policy" && object === "Reviewer") || (filter === "Recovery" && (object === "Reconciliation" || /recovery|reversal|open/i.test(event))));
    const rows = filtered.map(([time, object, event, detail, actionName]) => `<tr><td>${time}</td><td><b>${object}</b></td><td>${event}</td><td>${detail}</td><td>${button("Inspect", `data-audit-event="${object.toLowerCase()}" data-workspace-action="${actionName}"`)}</td></tr>`).join("") || '<tr><td colspan="5">No local audit events match this filter.</td></tr>';
    const filters = ["All", "Document", "Receipt", "Policy", "Recovery"].map((name) => `<button data-audit-filter="${name}" aria-pressed="${String(filter === name)}">${name}</button>`).join("");
    return `<section class="workspace-canvas-head"><div><span class="eyebrow">Causation and recovery history</span><h2 id="workspace-heading" tabindex="-1">Audit trail</h2><p>Trace who changed which linked object, before and after the decision. Each event opens its own linked-object and recovery detail, rather than a generic evidence dump.</p></div>${button("Open reconciliation event", 'data-audit-event="reconciliation"')}</section><div class="audit-filters" aria-label="Audit object filters">${filters}</div>${table("audit-log", ["Time", "Object", "Event", "Before / after", ""], rows)}<aside class="workspace-recovery" aria-label="Recovery route"><div><span class="eyebrow">Open-item consequence</span><b>${doc.openItem}</b><p>${accounting.exception}</p></div>${button("Inspect recovery event", 'data-audit-event="reconciliation"')}</aside>`;
  }
  return "";
}

export function createWorkspaceController({ state, current, render, openDrawer, openAuditDetail, closeDrawers, $, $$, dispatch }) {
  const style = document.createElement("style");
  style.textContent = `.workspace-canvas{display:none;margin:0 0 18px}.workspace-canvas.active{display:block}.workspace-product-shell{margin:0 0 18px;border-bottom:1px solid #dcd5c8}.workspace-taskbar{display:grid;grid-template-columns:minmax(300px,1.2fr) minmax(300px,1fr);gap:18px;padding:0 0 15px}.workspace-gayson-scene{display:grid;grid-template-columns:112px minmax(0,1fr);gap:12px;align-items:center;padding:8px 0;border-right:1px solid #e0d9cc}.workspace-gayson-scene>img{width:112px;height:126px;object-fit:contain;object-position:center;mix-blend-mode:multiply}.workspace-gayson-copy b{display:block;margin:3px 0 4px;color:#2e6047;font-size:14px;line-height:1.35}.workspace-gayson-copy p{margin:0 0 8px;color:#60655e;font-size:12px;line-height:1.45}.workspace-gayson-copy button{padding:6px 0;border:0;background:none;color:#2a6590;font:800 11px inherit;cursor:pointer}.workspace-decision-object{display:grid;grid-template-rows:auto 1fr;gap:12px;padding:9px 0 9px 17px}.workspace-document-ref{display:flex;gap:10px;align-items:center}.workspace-document-ref>img{width:33px;height:33px;padding:7px;border:1px solid #d8d1c2;border-radius:5px;background:#fffdf8}.workspace-document-ref b{display:block;margin-top:2px;font-size:13px}.workspace-document-ref small{display:block;margin-top:3px;color:#676c64;font-size:11px}.workspace-decision-state{display:grid;grid-template-columns:auto minmax(0,1fr);gap:5px 9px;align-items:start;padding:9px 0;border-top:1px solid #e8e1d6}.workspace-decision-state b{font-size:12px}.workspace-decision-state small{grid-column:2;color:#6a625b;font-size:11px;line-height:1.35}.workspace-causal-rail{display:grid;grid-template-columns:minmax(80px,1fr) 18px minmax(80px,1fr) 18px minmax(100px,1.15fr) 18px minmax(80px,1fr) 18px minmax(80px,1fr);align-items:center;gap:0;padding:10px 0 15px}.rail-node{min-width:0;padding:0 7px;border-left:3px solid #d6d0c4}.rail-node>img{width:22px;height:22px;object-fit:contain}.rail-node span{display:block;margin-top:4px;color:#73766f;font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase}.rail-node b{display:block;overflow:hidden;margin-top:2px;color:#303631;font-size:11px;text-overflow:ellipsis;white-space:nowrap}.rail-node.document-node{border-color:#6091b7}.rail-node.attestation-node{border-color:#4e9a6b}.rail-node.receipt-node{border-color:#2575c2}.rail-node.erp-node{border-color:#c4843e}.rail-node.journal-node{border-color:#81608d}.rail-link{height:2px;background:#d7d0c4}.rail-brand{display:flex!important;gap:4px;align-items:center;margin:0!important}.rail-brand img:first-child{width:23px;height:23px}.rail-brand img:last-child{width:43px;height:auto}.workspace-canvas-head{display:flex;justify-content:space-between;gap:18px;align-items:start;padding:8px 0 13px;border-bottom:1px solid #ded8cd}.workspace-canvas-head h2{margin:3px 0;font:700 21px/1.15 Georgia,serif}.workspace-canvas-head h2:focus-visible,#doc-title:focus-visible{outline:2px solid rgba(24,119,206,.72);outline-offset:4px;border-radius:3px}.workspace-canvas-head p{max-width:720px;margin:4px 0;color:#666b63;font-size:12px}.workspace-canvas button,.workspace-context button{cursor:pointer}.workspace-canvas-head button,.workspace-recovery button,.workspace-object-line button{padding:8px 10px;border:1px solid #d4ccbd;border-radius:5px;background:#fffdf8;color:#2e6047;font:700 11px inherit}.workspace-table-wrap{overflow:auto}.workspace-table{width:100%;border-collapse:collapse;font-size:12px}.workspace-table th{padding:10px 8px;border-bottom:1px solid #d7d0c3;color:#73776f;font-size:10px;letter-spacing:.06em;text-align:left;text-transform:uppercase}.workspace-table td{padding:12px 8px;border-bottom:1px solid #ece7dd;vertical-align:middle}.workspace-table td small{display:block;margin-top:3px;color:#777c74;font-size:10px}.workspace-table .num{text-align:right;font-variant-numeric:tabular-nums}.workspace-table tr.selected-row{background:#f2f8f1}.workspace-table tr.mismatch-row{background:#fff6f2}.workspace-table tr.match-row{background:#f5fbf7}.workspace-table button{border:0;background:none;color:#2b6597;font:700 11px inherit;text-align:left}.workspace-table button[data-select-profile]{padding:6px 8px;border:1px solid #d6cebf;border-radius:5px;background:#fffdf8;color:#355f48}.workspace-table button:disabled{opacity:.55;cursor:default}.state-chip{display:inline-block;padding:3px 5px;border-radius:4px;background:#edf2ea;color:#3f6d4b;font-size:10px;font-weight:800}.state-chip.warn{background:#fff0eb;color:#9a4c39}.state-chip.good{background:#edf7f0;color:#34704c}.workspace-empty-state,.workspace-validation{display:flex;gap:9px;align-items:center;margin:12px 0;padding:10px 12px;border-left:3px solid #80736a;background:#f6f1e9;color:#625b54;font-size:12px}.workspace-empty-state span{color:#69645c}.workspace-validation{border-color:#ad5545;background:#fff1ed;color:#82463a}.workspace-recovery{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:14px;padding:11px 12px;border-left:3px solid #bc712f;background:#fff9f0;font-size:12px}.workspace-recovery div{flex:1;min-width:300px}.workspace-recovery b{display:block;color:#754a2c}.workspace-recovery p{margin:3px 0 0;color:#5e625b}.workspace-object-line,.ledger-profile{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:12px;padding:10px 0;border-bottom:1px solid #e7e0d5;font-size:12px}.workspace-object-line span,.ledger-profile span{padding-left:10px;border-left:1px solid #ddd5c8}.record-correlation{margin:12px 0;padding:10px 12px;border-left:3px solid #3171a9;background:#f3f8fd;font-size:12px}.record-correlation b{margin-right:12px}.record-pill{display:inline-block;margin:4px 5px 0 0;padding:3px 6px;border:1px solid #b7d1e8;border-radius:12px;color:#285879;font-size:10px;font-weight:700}.record-correlation small{display:block;margin-top:6px;color:#607584}.ledger-total td{border-top:2px solid #cfc6b6;font-weight:800}.audit-filters{display:flex;gap:7px;margin:12px 0}.audit-filters button{border:1px solid #d7d0c4;background:#fffdf8;border-radius:4px;padding:5px 8px;font:700 10px inherit;color:#59615a}.audit-filters button[aria-pressed="true"]{background:#eaf4ec;border-color:#92b39a;color:#2f6944}@media(max-width:760px){.workspace-taskbar{grid-template-columns:1fr}.workspace-gayson-scene{border-right:0;border-bottom:1px solid #e0d9cc}.workspace-decision-object{padding-left:0}.workspace-causal-rail{grid-template-columns:1fr;gap:7px}.rail-link{width:2px;height:11px;margin-left:17px}.workspace-canvas-head{flex-direction:column}.workspace-canvas-head button{width:100%}.workspace-recovery div{min-width:0}.workspace-object-line,.ledger-profile{align-items:flex-start;flex-direction:column}.workspace-object-line span,.ledger-profile span{padding-left:0;border-left:0}}`;
  style.textContent += `
    .workspace-compact-shell{display:grid;grid-template-columns:minmax(230px,.72fr) minmax(260px,1fr);gap:14px;padding:0 0 12px}.workspace-compact-guide{display:grid;grid-template-columns:64px minmax(0,1fr);gap:9px;align-items:center;min-width:0;padding:7px 10px 7px 0;border-right:1px solid #e0d9cc}.workspace-compact-guide>img{width:64px;height:72px;object-fit:contain;mix-blend-mode:multiply}.workspace-compact-guide b{display:block;margin:2px 0;color:#2e6047;font-size:13px;line-height:1.3}.workspace-compact-guide p{margin:3px 0;color:#60655e;font-size:11px;line-height:1.35}.workspace-compact-guide button{padding:4px 0;border:0;background:none;color:#2a6590;font:800 11px inherit}.workspace-compact-object{display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:9px;align-items:center;padding:8px 0}.workspace-compact-object>img{width:32px;height:32px;padding:6px;border:1px solid #d8d1c2;border-radius:5px;background:#fffdf8}.workspace-compact-object b{display:block;font-size:12px}.workspace-compact-object small{display:block;overflow:hidden;margin-top:3px;color:#676c64;font-size:10px;text-overflow:ellipsis;white-space:nowrap}.workspace-compact-rail{grid-column:1/-1;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;align-items:center;padding:8px 0;border-top:1px solid #e8e1d6}.workspace-compact-rail>div{display:grid;grid-template-columns:22px minmax(0,1fr);column-gap:6px;align-items:center;min-width:0;padding-left:9px;border-left:3px solid #d6d0c4}.workspace-compact-rail>div:nth-of-type(2){border-color:#4e9a6b}.workspace-compact-rail>div:nth-of-type(3){border-color:#2575c2}.workspace-compact-rail>div:nth-of-type(4){border-color:#c4843e}.workspace-compact-rail>div:nth-of-type(5){border-color:#81608d}.workspace-compact-rail>div>img{grid-row:1/3;width:20px;height:20px;object-fit:contain}.workspace-compact-rail>div span{overflow:hidden;color:#73766f;font-size:9px;font-weight:800;letter-spacing:.04em;text-overflow:ellipsis;text-transform:uppercase;white-space:nowrap}.workspace-compact-rail>div b{overflow:hidden;color:#303631;font-size:11px;text-overflow:ellipsis;white-space:nowrap}.compact-receipt-brand{display:flex!important;grid-row:1/3;gap:3px;align-items:center;overflow:visible!important}.compact-receipt-brand img:first-child{width:20px;height:20px}.compact-receipt-brand img:last-child{width:31px;height:auto}.workspace-canvas{padding-bottom:112px}.workspace-canvas-head h2{font-size:22px}.workspace-table{font-size:13px}.workspace-table th{font-size:10px}.workspace-table td{padding:13px 8px}.workspace-table td small{font-size:11px}.workspace-canvas-head:focus-within{border-color:#92b39a}.workspace-table-wrap{max-width:100%;overscroll-behavior:contain}.workspace-canvas .workspace-recovery{margin-bottom:14px}@media(max-width:1180px){.workspace-compact-shell{grid-template-columns:1fr}.workspace-compact-rail{grid-column:auto}.workspace-compact-guide{border-right:0;border-bottom:1px solid #e0d9cc}.workspace-table-wrap{border-right:1px solid #e8e1d6}}@media(max-width:760px){.workspace-compact-shell{display:block}.workspace-compact-guide{grid-template-columns:56px minmax(0,1fr)}.workspace-compact-guide>img{width:56px;height:62px}.workspace-compact-object{margin-top:8px}.workspace-compact-rail{grid-template-columns:1fr;gap:7px}.workspace-canvas{padding-bottom:180px}}
  `;
  // Specialized workspaces keep the shared document/brand context above their own task, but
  // compress it deliberately so a worklist, comparison, journal or causation canvas is already
  // visible in the first desktop scan rather than beginning below a repeated hero treatment.
  style.textContent += `.app.workspace-specialized .workspace-context{margin-bottom:8px;padding:7px 0 8px}.app.workspace-specialized .workspace-context b{font-size:13px}.app.workspace-specialized .workspace-context p{margin-top:2px;font-size:10px;line-height:1.3}.app.workspace-specialized .workspace-compact-shell{gap:10px;margin-bottom:10px;padding-bottom:8px}.app.workspace-specialized .workspace-compact-guide{grid-template-columns:54px minmax(0,1fr);gap:8px;padding:4px 8px 4px 0}.app.workspace-specialized .workspace-compact-guide>img{width:54px;height:58px}.app.workspace-specialized .workspace-compact-guide b{font-size:12px}.app.workspace-specialized .workspace-compact-guide p{display:-webkit-box;overflow:hidden;font-size:10px;line-height:1.25;-webkit-box-orient:vertical;-webkit-line-clamp:2}.app.workspace-specialized .workspace-compact-object{padding:5px 0}.app.workspace-specialized .workspace-compact-rail{padding:6px 0}.app.workspace-specialized .workspace-canvas-head{padding-top:5px}.app.workspace-specialized .workspace-canvas-head h2{font-size:20px}`;
  style.textContent += `.app{grid-template-columns:216px minmax(620px,1fr) 396px;padding-bottom:104px}.header{height:152px;min-height:152px;padding:8px 24px;overflow:hidden}.header .toolbar{min-height:28px}.header .document-identity{grid-template-columns:42px minmax(0,1fr) auto;gap:10px;margin-top:7px}.header .doc-icon{width:38px;height:38px;padding:8px}.header .document-identity h1{font-size:22px}.header .field-strip{margin-top:7px}.sidebar{padding:18px 15px}.main{padding:24px}.action-bar{min-height:88px;padding:10px 24px}.app.workspace-specialized #workspace-context{display:none}.app.workspace-specialized .workspace-canvas{padding-bottom:104px}.app.workspace-specialized .workspace-canvas.active{display:block}.reconciliation-flagship{display:grid;grid-template-columns:minmax(0,760px) minmax(320px,396px);gap:20px;align-items:start}.reconciliation-primary{min-width:0}.reconciliation-flagship .workspace-canvas-head{padding:0 0 13px}.reconciliation-flagship .workspace-canvas-head h2{font-size:24px}.reconciliation-flagship .workspace-canvas-head p{max-width:700px;font-size:14px;line-height:1.45}.reconciliation-flagship .workspace-table{font-size:14px}.reconciliation-flagship .workspace-table th{font-size:12px}.reconciliation-flagship .workspace-table td{height:52px;padding:10px 12px}.reconciliation-flagship .workspace-table td small{font-size:12px}.reconciliation-flagship .workspace-table td:last-child button{padding:7px 9px;border:1px solid #cbd8e4;border-radius:6px;background:#fff;color:#24618e}.reconciliation-proof{display:grid;gap:12px;min-width:0}.reconciliation-proof>section{padding:14px;border:1px solid #ddd6c9;border-radius:7px;background:#fffdf8}.proof-asset{display:grid;gap:7px}.proof-asset>div{display:flex;gap:10px;align-items:center}.proof-asset img:first-child{width:34px;height:34px}.proof-asset img:last-child{width:58px;height:auto}.proof-asset b{font-size:15px}.proof-asset span,.proof-receipt p{color:#61675f;font-size:13px}.proof-receipt b{display:block;margin:4px 0;font-size:14px}.proof-receipt p{margin:5px 0 10px}.proof-receipt button,.proof-gayson button{padding:7px 0;border:0;background:none;color:#24618e;font:800 12px inherit}.proof-lifecycle{display:grid;gap:0}.proof-lifecycle>div{display:grid;grid-template-columns:14px minmax(70px,1fr) minmax(0,1.2fr);gap:8px;align-items:center;padding:9px 0;border-bottom:1px solid #ece6db;font-size:12px}.proof-lifecycle>div:last-child{border-bottom:0}.proof-lifecycle i{width:10px;height:10px;border-radius:50%;background:#b1aaa0}.proof-lifecycle .life-complete i{background:#2b744d}.proof-lifecycle .life-current i{background:#2575c2}.proof-lifecycle .life-blocked i{background:#805169}.proof-lifecycle span{color:#6d726a}.proof-gayson{display:grid;grid-template-columns:112px minmax(0,1fr);gap:10px;align-items:center;min-height:112px;border-color:#cbd8d0!important;background:#f4f8f2!important}.proof-gayson img{width:105px;height:105px;object-fit:contain;mix-blend-mode:multiply}.proof-gayson b{display:block;margin:3px 0;color:#285e43;font-size:14px;line-height:1.25}.proof-gayson p{margin:3px 0;color:#59665e;font-size:12px}.erp-consequence{margin-top:16px;padding:16px;border-left:4px solid #b97833;background:#fff8ef;font-size:14px}.erp-consequence.matched{border-color:#2b744d;background:#f1f8f2}.erp-consequence b{display:block;font-size:15px}.erp-consequence p{margin:5px 0 10px;line-height:1.4}.erp-consequence button{padding:8px 10px;border:1px solid #c8d2c7;border-radius:6px;background:#fff;color:#285e43;font:750 12px inherit}@media(max-width:1180px){.reconciliation-flagship{grid-template-columns:1fr}.reconciliation-proof{grid-template-columns:1fr 1fr}.proof-gayson{grid-column:1/-1}.app{grid-template-columns:190px minmax(0,1fr)}}@media(max-width:760px){.app.workspace-specialized #workspace-context{display:flex}.reconciliation-proof{grid-template-columns:1fr}.proof-gayson{grid-column:auto}.action-bar{position:static;min-height:88px}.app{padding-bottom:0}}`;
  // Root blueprint V3R1: short-height safety, compact proof rail and non-form-like focus.
  style.textContent += `
    .header{overflow:visible!important}
    .header .field-strip{align-items:start}.header .field-strip>*{min-width:0}
    .header .field-strip b,.header .field-strip span{overflow:visible;text-overflow:clip;white-space:normal}
    .reconciliation-flagship:focus{outline:none}.reconciliation-flagship:focus-visible{outline:0}
    .reconciliation-flagship .workspace-canvas-head h2:focus{outline:0}
    .reconciliation-flagship .selected-failure{outline:2px solid #805169;outline-offset:-2px}
    .reconciliation-flagship .workspace-table td:nth-child(5){display:none}
    .reconciliation-proof>section{border-width:0 0 1px;border-radius:0;background:transparent;padding:10px 0}
    .proof-asset{order:0}.proof-receipt{order:1}.proof-gayson{order:2}.proof-lifecycle{order:3}
    .proof-gayson{min-height:112px;padding:8px!important}.proof-gayson img{height:96px;width:96px}
    .proof-lifecycle>div{padding:6px 0}.proof-receipt p{margin:3px 0 6px}
    #evidence-tabs{display:flex;flex-wrap:wrap;gap:6px;overflow:visible}#evidence-tabs button{min-width:max-content}
    #evidence-drawer{grid-template-rows:auto auto minmax(0,1fr) auto}
    #evidence-drawer #evidence-content{padding-bottom:24px}
    #evidence-drawer .drawer-section{min-height:auto;scroll-margin-bottom:96px}
    #evidence-drawer .exception-surface,#evidence-drawer .drawer-object-link{scroll-margin-bottom:96px}
    #evidence-drawer .drawer-footer{position:static;min-height:72px;margin:0;padding:12px 21px;background:#fffdf8;border-top:1px solid #ded8cd}
    .worklist-inspector{display:grid;grid-template-columns:minmax(0,1fr) minmax(260px,.8fr) auto auto;gap:14px;align-items:start;margin-top:16px;padding:14px 0;border-top:2px solid #d8d1c3;border-bottom:1px solid #d8d1c3;background:#fffdf8;font-size:14px}.worklist-inspector>*{min-width:0;max-width:100%}.worklist-inspector b{display:block;margin:3px 0;overflow-wrap:anywhere}.worklist-inspector p{margin:4px 0;color:#576158;overflow-wrap:anywhere}.worklist-inspector dl{margin:0}.worklist-inspector dl div{padding:4px 0;border-bottom:1px solid #eee7dc}.worklist-inspector dt{color:#6b7168;font-size:12px}.worklist-inspector dd{margin:2px 0;font-weight:700;overflow-wrap:anywhere}.worklist-inspector button{align-self:center;padding:8px 10px;border:1px solid #cbd8d0;border-radius:5px;background:#fff;color:#285e43;font:700 12px inherit;white-space:normal}@media(max-width:1240px){.worklist-inspector{grid-template-columns:minmax(0,1fr)}.worklist-inspector button{justify-self:start}}
    #header-status[data-fixture="matched"]{background:#e8f5eb;color:#27643f;border-color:#79a883}#header-status[data-fixture="stale"]{background:#fff4df;color:#80551c;border-color:#d6a34c}#header-status[data-fixture="mismatch"]{background:#fff0ef;color:#9d403b;border-color:#c97872}
    @media(max-height:900px){.action-bar{position:static!important}.app{padding-bottom:0!important}.workspace-canvas{padding-bottom:16px!important}.reconciliation-proof{gap:4px}.reconciliation-flagship .workspace-canvas-head p{margin:2px 0;font-size:13px}.erp-consequence{margin-top:10px;padding:12px}.reconciliation-flagship .workspace-table td{height:46px;padding:7px 10px}.reconciliation-flagship .workspace-table td small{font-size:11px}}
  `;
  style.textContent += `
    /* Workspace navigation focuses a task landmark, not an editable-looking title field. */
    .workspace-canvas-head h2:focus-visible,#doc-title:focus-visible{outline:0!important;box-shadow:none!important;border-left:3px solid #2a6590;padding-left:9px}
    .workspace-canvas-head h2:focus{outline:0!important;box-shadow:none!important}
  `;
  style.textContent += `
    .workspace-task-loop{margin:0 0 14px;padding:10px 0 12px;border-bottom:1px solid #ded8cd}
    .task-loop-heading{display:grid;gap:2px;margin-bottom:8px}
    .task-loop-heading b{font-size:13px;color:#2f4035}
    .task-loop-heading small{color:#697169;font-size:11px}
    .workspace-task-loop ol{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px;margin:0;padding:0;list-style:none}
    .workspace-task-loop li{display:grid;grid-template-columns:22px minmax(0,1fr);gap:6px;min-width:0;padding:7px 7px;border-left:3px solid #c7c1b6;background:#faf8f3}
    .workspace-task-loop li[data-stage-status="matched"],.workspace-task-loop li[data-stage-status="proposal-ready"],.workspace-task-loop li[data-stage-status="close-proposal"]{border-color:#4b9463;background:#f1f8f2}
    .workspace-task-loop li[data-stage-status="blocked"],.workspace-task-loop li[data-stage-status="hold"],.workspace-task-loop li[data-stage-status="open"]{border-color:#c07b45;background:#fff8ef}
    .task-loop-index{display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:#e5e0d6;color:#525950;font-size:10px;font-weight:800}
    .workspace-task-loop li[data-stage-status="matched"] .task-loop-index,.workspace-task-loop li[data-stage-status="proposal-ready"] .task-loop-index,.workspace-task-loop li[data-stage-status="close-proposal"] .task-loop-index{background:#4b9463;color:#fff}
    .workspace-task-loop b{display:block;font-size:11px;color:#303a32}
    .workspace-task-loop small{display:block;margin-top:2px;overflow-wrap:anywhere;color:#687068;font-size:10px;line-height:1.3}
    .app.workspace-specialized .workspace-canvas{padding-bottom:140px!important}
    .app.workspace-specialized .workspace-general-ledger .workspace-recovery,.app.workspace-specialized .workspace-general-ledger .workspace-object-line{margin-bottom:24px}
    @media(max-width:760px){.workspace-task-loop ol{grid-template-columns:1fr}.workspace-task-loop li{grid-template-columns:24px minmax(0,1fr)}.app.workspace-specialized .workspace-canvas{padding-bottom:180px!important}}
  `;
  style.textContent += ".a12-app .a12-field input,.a12-app .a12-field select,.a12-app .a12-field textarea{min-height:44px!important}.a12-app .a12-field output{min-height:44px!important}@media(min-width:1311px){.a12-workbench{grid-template-columns:260px minmax(560px,1fr) 300px}}@media(max-width:1310px) and (min-width:721px){.a12-workbench{grid-template-columns:260px minmax(0,1fr) 300px}}";
  style.textContent += '.a12-nav-list button[aria-current="page"]{background:var(--a12-selected);color:var(--a12-focus);box-shadow:inset 3px 0 0 var(--a12-focus)}';
  document.head.append(style);
  const enrichDrawerEvidence = () => requestAnimationFrame(() => {
    const evidence = $("evidence-drawer");
    const content = $("evidence-content");
    if (evidence && !evidence.hidden && content && !$("policy-quality-groups")) {
      content.insertAdjacentHTML("beforeend", `<section id="policy-quality-groups" class="drawer-section policy-quality-groups"><div class="drawer-section-head"><h3>Policy controls and recovery</h3><small>Typed local fixture</small></div><div class="field-row"><span>policyVersion / amount6 cap</span><b>VMC-1.0 · 1250000000</b></div><div class="field-row"><span>validUntil / nonce / replay guard</span><b>Fresh attestation required · nonce 42</b></div><div class="field-row"><span>Roles and capability boundary</span><b>Reviewer distinct from payer; no wallet, RPC or ERP write</b></div><div class="exception-surface"><b>Named recovery: refresh validUntil / TTL</b><p>Retain the linked original open item, obtain a current local attestation fixture, then re-run the matcher.</p></div><button class="drawer-object-link" data-workspace-action="source">Open linked original document</button></section>`);
    }
    if (evidence && !evidence.hidden && !$("evidence-local-footer")) evidence.insertAdjacentHTML("beforeend", `<footer id="evidence-local-footer" class="drawer-footer"><p>Local control review only — no signature, broadcast, settlement or ERP posting.</p><button data-workspace-action="receipt">Inspect typed receipt</button><button data-close>Back</button></footer>`);
    const receipt = $("receipt-drawer");
    const selector = receipt?.querySelector(".receipt-selector");
    if (receipt && !receipt.hidden && selector) {
      const receiptResult = current().result;
      receipt.dataset.lifecycle = receiptResult.receiptState;
      if (receiptResult.receiptState === "not evaluated") {
        const status = receipt.querySelector(".drawer-status");
        const sectionNote = receipt.querySelector(".drawer-section-head small");
        if (status) { status.classList.remove("warning", "good"); status.querySelector("b").textContent = "Receipt not evaluated"; status.querySelector("span").textContent = "No observed receipt. The listed fields are expected matcher layout only."; }
        if (sectionNote) sectionNote.textContent = "Expected typed layout — no observed receipt";
      }
      if (receiptResult.key === "mismatch" && !$("shared-logical-payment-note")) selector.insertAdjacentHTML("beforebegin", `<div id="shared-logical-payment-note" class="drawer-status warning"><b>Shared logical-payment readback failure</b><span>The three ordered records describe one payment; this failure is not three independent failures.</span></div>`);
    }
  });
  document.addEventListener("click", (event) => {
    if (event.target.closest('[data-workspace-action="evidence"], [data-workspace-action="receipt"], [data-panel]')) enrichDrawerEvidence();
  });
  new MutationObserver(enrichDrawerEvidence).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden"] });
  const host = document.createElement("section");
  host.id = "workspace-context";
  host.className = "workspace-context";
  host.setAttribute("role", "status");
  host.setAttribute("aria-live", "polite");
  document.querySelector(".main").prepend(host);
  const canvas = document.createElement("section");
  canvas.id = "workspace-canvas";
  canvas.className = "workspace-canvas";
  canvas.setAttribute("aria-live", "polite");
  host.after(canvas);
  const desk = document.querySelector(".desk-grid");
  const activity = document.querySelector(".activity");

  const setCurrent = (id) => $$("#nav button").forEach((control) => {
    const active = control.dataset.area === WORKSPACE_CONTRACT[id].area;
    control.toggleAttribute("aria-current", active);
    if (active) control.setAttribute("aria-current", "page");
  });
  const setNavigationBusy = (busy) => $$("#nav button").forEach((control) => {
    control.disabled = busy;
    control.setAttribute("aria-busy", String(busy));
  });
  const sync = () => {
    const id = state.workspace ?? "milestone-desk";
    const projection = workspaceProjection(id, current());
    const resultState = current().result;
    const headerStatus = $("header-status");
    if (headerStatus) headerStatus.dataset.fixture = resultState.key;
    setCurrent(id);
    host.innerHTML = `<div><span class="eyebrow">ERP workspace</span><b>${projection.title}</b><p>${projection.detail}</p></div>${id === "milestone-desk" ? "" : '<button id="workspace-return" type="button">Return to Milestone desk</button>'}`;
    $("workspace-return")?.addEventListener("click", () => activate("milestone-desk"));
    const milestone = id === "milestone-desk";
    document.querySelector(".app")?.classList.toggle("workspace-specialized", !milestone);
    desk.hidden = !milestone;
    activity.hidden = !milestone;
    canvas.classList.toggle("active", !milestone);
    canvas.hidden = milestone;
    if (!milestone) canvas.innerHTML = workspaceProductShell(id, { ...current(), state }) + canvasMarkup(id, { ...current(), state });
    if (id === "reconciliation") {
      // The renderer keeps the five semantic row actions. Remove the retired generic cell
      // before focus is assigned so the workbench root is the actual navigation destination.
      const workbench = canvas.querySelector(".reconciliation-flagship");
      if (workbench) workbench.id = "reconciliation-workbench-root";
      canvas.querySelectorAll("#match-workbench tbody tr").forEach((row) => {
        if (row.children.length > 4) row.lastElementChild?.remove();
      });
      if (current().result.receiptState === "not evaluated") {
        const receiptHeading = canvas.querySelector(".proof-receipt b");
        const receiptAction = canvas.querySelector(".proof-receipt button");
        if (receiptHeading) receiptHeading.textContent = "No receipt evaluated · 3 expected typed records";
        if (receiptAction) receiptAction.textContent = "Review expected receipt layout";
      }
    }
    if (id === "payables" || id === "receivables") {
      const { accounting, document: doc, result } = current();
      const outgoing = id === "payables";
      const outgoingProfiles = ["payment_advance", "payment_corporate_payable", "payment_personal_payable", "payment_refund"];
      const incomingProfiles = ["receipt_invoice_collection", "receipt_customer_advance", "receipt_refund"];
      const selectedForRoute = (outgoing ? outgoingProfiles : incomingProfiles).includes(state.settlementCase?.profileId);
      if (selectedForRoute) {
        const inspector = `<aside class="worklist-inspector ${result.receiptState === "matched" ? "ready" : "blocked"}" aria-label="Selected ${outgoing ? "outgoing" : "incoming"} document inspector"><div><span class="eyebrow">Selected ${outgoing ? "outgoing" : "incoming"} inspector</span><b>${accounting.profile.documentNumber} · ${doc.noun}</b><p>${outgoing ? `${doc.payer} → ${doc.recipient}` : `Customer → treasury: ${doc.payer} → ${doc.recipient}`} · amount6 ${doc.amount6}</p></div><dl><div><dt>Original / source</dt><dd>${doc.source}</dd></div><div><dt>${outgoing ? "Matcher / open item" : "Purpose / open item"}</dt><dd>${outgoing ? result.receiptState : doc.purpose} · ${doc.railStatus}</dd></div><div><dt>${outgoing ? "Exception" : "Refund / original rule"}</dt><dd>${outgoing ? accounting.exception : accounting.profile.requiresOriginal ? "Original receipt and refundable ceiling required" : "Purpose is bound to the selected customer object"}</dd></div></dl>${button(outgoing ? "Inspect outgoing source" : "Inspect customer source", 'data-workspace-action="source"')}${button(outgoing ? "Inspect local exception" : "Inspect purpose recovery", `data-workspace-action="${result.key === "stale" ? "evidence" : "accounting"}"`)}</aside>`;
        canvas.insertAdjacentHTML("beforeend", inspector.replace("</aside>", `${outgoing ? button("Open selected journal", 'data-workspace-action="journal" data-testid="selected-profile-journal" aria-label="Open selected profile journal"') : ""}</aside>`));
        if (!outgoing && accounting.profile.id === "receipt_refund") {
          const direction = canvas.querySelector(".worklist-inspector p");
          if (direction) direction.textContent = `Treasury → customer: ${doc.payer} → ${doc.recipient} · amount6 ${doc.amount6}`;
        }
      }
    }
    if (id === "general-ledger" || id === "audit-trail") {
      const { accounting, document: doc, result, view } = current();
      const auditCausalBreak = result.key === "stale"
        ? "validUntil / TTL"
        : result.key === "mismatch"
          ? "receipt readback identity"
          : result.receiptState === "not evaluated"
            ? state.settlementCase?.reviewerAttested ? "separate payer approval" : "reviewer attestation"
            : "none";
      const detail = id === "general-ledger"
        ? `<aside class="worklist-inspector ledger-inspector" aria-label="Journal posting boundary"><b>Posting boundary · ${accounting.journal.status}</b><p>${accounting.journal.postingBoundary}</p><dl><div><dt>amount6 / source</dt><dd>${doc.amount6} · ${doc.source}</dd></div><div><dt>Native18 fee</dt><dd>${accounting.journal.fee.amount} · ${accounting.journal.fee.status}</dd></div><div><dt>Matcher gate</dt><dd>${result.receiptState} · ${doc.openItem}</dd></div></dl>${button("Open journal detail", 'data-workspace-action="journal"')}</aside>`
        : `<aside class="worklist-inspector audit-inspector" aria-label="Causation recovery inspector"><b>First causal break · ${auditCausalBreak}</b><p>${result.key === "matched" ? "All five local decision stages agree; review the non-postable boundary." : accounting.exception}</p><dl><div><dt>Receipt correlation</dt><dd>${view.receipt.records.length} records → 1 logical payment</dd></div><div><dt>Open-item effect</dt><dd>${doc.openItem}</dd></div></dl>${button("Inspect recovery event", 'data-audit-event="reconciliation"')}</aside>`;
      canvas.insertAdjacentHTML("beforeend", detail);
      if (id === "audit-trail" && result.receiptState === "not evaluated") {
        const auditInspector = canvas.querySelector(".audit-inspector");
        const values = auditInspector?.querySelectorAll("dd");
        if (auditInspector) auditInspector.querySelector("b").textContent = `First causal break · ${state.settlementCase?.reviewerAttested ? "separate payer approval" : "reviewer attestation"}`;
        if (values?.[0]) values[0].textContent = "No observed receipt → expected 3-record matcher layout";
      }
    }
  };
  const focus = (id) => requestAnimationFrame(() => {
    const target = $(WORKSPACE_CONTRACT[id].focusId);
    target?.setAttribute("tabindex", target.tabIndex < 0 ? "-1" : String(target.tabIndex));
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    [document.querySelector(".main"), document.querySelector(".workspace-canvas"), ...$$('.workspace-table-wrap')].forEach((node) => node?.scrollTo?.({ top: 0, left: 0, behavior: "instant" }));
    target?.focus({ preventScroll: true });
  });
  const activate = (id, { writeHash = true, announceError = false } = {}) => {
    const resolved = WORKSPACE_CONTRACT[id] ? id : "milestone-desk";
    const spec = WORKSPACE_CONTRACT[resolved];
    host.setAttribute("aria-busy", "true");
    setNavigationBusy(true);
    state.workspace = resolved;
    dispatch?.({ type: "SET_ROUTE", workspace: resolved, stage: state.settlementCase?.route?.stage ?? "work-queue", view: state.settlementCase?.route?.view ?? "document" });
    if (spec.activityPanel) state.activityPanel = spec.activityPanel;
    closeDrawers();
    render();
    sync();
    if (writeHash) {
      const nextHash = buildSettlementRoute(state.settlementCase);
      if (location.hash !== nextHash) history.pushState({}, "", nextHash);
    }
    requestAnimationFrame(() => {
      focus(resolved);
      host.removeAttribute("aria-busy");
      setNavigationBusy(false);
      if (announceError) host.querySelector("p").textContent = "Unknown workspace route recovered to Milestone desk. " + host.querySelector("p").textContent;
    });
  };
  $$("#nav button").forEach((control) => control.addEventListener("click", () => {
    const id = Object.keys(WORKSPACE_CONTRACT).find((key) => WORKSPACE_CONTRACT[key].area === control.dataset.area);
    activate(id);
  }));
  canvas.addEventListener("click", (event) => {
    const control = event.target.closest("button");
    if (!control) return;
    if (control.dataset.workspaceRoute) return activate(control.dataset.workspaceRoute);
    if (control.dataset.workflowAction) {
      const action = control.dataset.workflowAction;
      const active = state.settlementCase;
      if (action === "rank") {
        dispatch?.({ type: "SET_SEARCH", party: current().accounting.profile.counterparty, document: current().accounting.profile.documentNumber });
        dispatch?.({ type: "RANK_CANDIDATES" });
      } else if (action === "select-candidate") {
        if (!active?.candidates?.length) dispatch?.({ type: "RANK_CANDIDATES" });
        const candidateId = state.settlementCase?.candidates?.[0]?.id;
        if (candidateId) dispatch?.({ type: "SELECT_CANDIDATE", candidateId });
      } else if (action === "allocate") {
        dispatch?.({ type: "SET_ALLOCATION", allocation: { amount6: state.settlementCase?.allocation?.requestedAmount6 ?? "1250000000", authority: { role: "operator", operatorId: "local-operator" }, originalReference: state.settlementCase?.allocation?.originalReference ?? null, exchangeRate: state.settlementCase?.profileId?.endsWith("refund") ? "1" : null, differenceAmount6: "0" } });
      } else if (action === "prepare-erp") {
        dispatch?.({ type: "PREPARE_ERP_PROPOSAL" });
      } else if (action === "attach-evidence") {
        // Production receives a typed server observation; the normal DOM never accepts
        // a caller boolean or a pre-computed matched outcome. Tier C remains explicit.
        dispatch?.({ type: "SET_EVIDENCE", evidence: localTypedEvidence(state.settlementCase, "C") });
      } else if (action === "tier-c") {
        if (state.settlementCase?.evidenceTier !== "C") dispatch?.({ type: "SET_EVIDENCE", evidence: localTypedEvidence(state.settlementCase, "C") });
        dispatch?.({ type: "CONFIRM_TIER_C", confirmation: { operatorId: "reviewer-fixture", role: "reviewer", reason: "Local operator reviewed Tier C source authority.", confirmedAt: new Date().toISOString() } });
      } else if (action === "read-receipt") {
        const activeNow = state.settlementCase;
        dispatch?.({ type: "READ_ARC_RECEIPT", now: "2026-08-10T12:30:00.000Z", receipt: localReceiptFor(activeNow), evidence: localTypedEvidence(activeNow, activeNow?.evidenceTier || "A") });
      } else if (action === "submit-erp") {
        dispatch?.({ type: "SUBMIT_ERP_REVIEW", gate: "submit", readback: { status: "readback", amount6: state.settlementCase?.allocation?.allocatedAmount6, diff: "none", typed: true } });
      } else if (action === "reconcile-bank") {
        dispatch?.({ type: "RECONCILE_BANK" });
      } else if (action === "generate-ledger") {
        dispatch?.({ type: "GENERATE_LEDGER" });
      } else if (action === "close-operational") {
        dispatch?.({ type: "CLOSE_OPERATIONAL", readback: { id: "pcv_operational_close", doctype: "Period Closing Voucher", name: `PCV-${active.caseId}`, company: active.companyId, source: "typed_local_erp_readback", local_fixture_only: true, live_erp: false, external_actions: 0, docstatus: 1, status: "submitted", gl_balanced: active.erp?.gl?.readback?.balanced === true, payment_ledger_status: active.erp?.pled?.status, outstanding_before6: active.erp?.outstanding?.before, outstanding_after6: active.erp?.outstanding?.after } });
      } else if (action === "close-period") {
        dispatch?.({ type: "CLOSE_ACCOUNTING_PERIOD", readback: { id: "accounting_period", doctype: "Accounting Period", name: `AP-${active.caseId}`, company: active.companyId, source: "typed_local_erp_readback", local_fixture_only: true, live_erp: false, external_actions: 0, status: "ended", start_date: "2026-01-01", end_date: "2026-12-31", closed_documents: ["Sales Invoice", "Purchase Invoice", "Payment Entry"] } });
      } else if (action === "close-business") {
        dispatch?.({ type: "CLOSE_BUSINESS", readback: { id: "business_close", name: `BUSINESS-CLOSE-${active.caseId}`, company: active.companyId, source: "typed_local_erp_readback", local_fixture_only: true, live_erp: false, external_actions: 0, status: "CLOSED", operational_readback_id: active.close?.operationalReadback?.name, accounting_period_readback_id: active.close?.accountingPeriodReadback?.name, payment_ledger_status: active.erp?.pled?.status, outstanding_after6: active.erp?.outstanding?.after } });
      } else if (action === "review-close") {
        dispatch?.({ type: "SET_ROUTE", workspace: state.workspace, stage: "ledger-close", view: "close" });
      } else if (action === "open-evidence") {
        openDrawer("evidence-drawer");
      }
      render();
      sync();
      focus(state.workspace ?? "milestone-desk");
      return;
    }
    if (control.dataset.auditFilter) {
      state.auditFilter = control.dataset.auditFilter;
      sync();
      focus("audit-trail");
      return;
    }
    if (control.dataset.auditEvent) {
      openAuditDetail?.(control.dataset.auditEvent);
      return;
    }
    if (control.dataset.workspaceFocus) {
      const requested = $(control.dataset.workspaceFocus);
      const target = control.dataset.workspaceFocus === "match-workbench"
        ? requested?.querySelector(".selected-failure") ?? requested
        : requested;
      target?.focus();
      target?.scrollIntoView({ block: "center" });
      return;
    }
    if (control.dataset.selectProfile) {
      const profileId = control.dataset.selectProfile === "receipt" ? (control.dataset.receiptPurpose === "customer_advance" ? "receipt_customer_advance" : "receipt_invoice_collection") : control.dataset.selectProfile;
      dispatch?.({ type: "SELECT_PROFILE", profileId });
      dispatch?.({ type: "RESET_DEPENDENTS" });
      
      state.counterpartyOverride = null;
      state.receiptPurpose = control.dataset.receiptPurpose ?? state.receiptPurpose;
      state.activePanel = "policy";
      state.failureCase = "wrong_network";
      state.auditEvent = "document";
      state.selectedReceiptRecord = null;
      state.sourceTouched = false;
      state.sourceDocument = ({
        payment_advance: "PO-2026-0731",
        payment_corporate_payable: "PINV-2026-044",
        payment_personal_payable: "EEXP-2026-019",
        payment_refund: "PAY-AP-2026-1187",
        receipt: state.receiptPurpose === "customer_advance" ? "CADV-2026-012" : "SINV-2026-072",
        receipt_refund: "RCPT-2026-072"
      })[state.settlementCase?.profileId];
      render();
      sync();
      focus(state.workspace ?? "milestone-desk");
      return;
    }
    const drawerMap = { accounting: "accounting-drawer", receipt: "receipt-drawer", journal: "journal-drawer", evidence: "evidence-drawer", source: "accounting-drawer" };
    const drawer = drawerMap[control.dataset.workspaceAction];
    if (drawer) {
      openDrawer(drawer);
      if (control.dataset.workspaceAction === "source") requestAnimationFrame(() => $("source-document")?.focus());
    }
  });
  const applyRoute = () => {
    const route = parseSettlementRoute(location.hash);
    if (route.profileId && route.profileId !== state.settlementCase?.profileId) dispatch?.({ type: "SELECT_PROFILE", profileId: route.profileId });
    if (route.origin !== state.settlementCase?.origin) dispatch?.({ type: "SET_ORIGIN", origin: route.origin });
    dispatch?.({ type: "SET_ROUTE", workspace: route.workspace, caseId: route.caseId, stage: route.stage, view: route.view });
    activate(WORKSPACE_CONTRACT[route.workspace] ? route.workspace : "milestone-desk", { writeHash: false, announceError: !WORKSPACE_CONTRACT[route.workspace] });
  };
  window.addEventListener("hashchange", () => {
    if (location.hash.includes("profile=") || location.hash.includes("stage=") || location.hash.includes("view=")) applyRoute();
    else { const resolved = workspaceFromHash(location.hash); activate(resolved ?? "milestone-desk", { writeHash: !resolved, announceError: !resolved }); }
  });
  window.addEventListener("verified-local-workspace-route", (event) => {
    const requested = event.detail?.id;
    if (WORKSPACE_CONTRACT[requested]) activate(requested);
  });
  const initial = location.hash.includes("profile=") ? parseSettlementRoute(location.hash).workspace : workspaceFromHash(location.hash);
  if (location.hash.includes("profile=")) applyRoute();
  else activate(initial ?? "milestone-desk", { writeHash: false, announceError: Boolean(location.hash) && !initial });
  return { activate, sync };
}

/* -------------------------------------------------------------------------
 * A12 runtime surface
 * -------------------------------------------------------------------------
 * The legacy controller above remains available to the existing MVP tests and
 * compatibility routes. A12 has one active mount below and consumes the exact
 * C15 reducer/projection; no second A12 renderer or reducer is exposed.
 */
const A12_UI_ICONS = Object.freeze({
  "milestone-desk": "calendar-check.svg",
  payables: "file-invoice-dollar.svg",
  receivables: "circle-dollar-to-slot.svg",
  reconciliation: "scale-balanced.svg",
  "general-ledger": "book-open.svg",
  "audit-trail": "chart-line.svg",
  queue: "calendar-check.svg",
  classify: "scale-balanced.svg",
  post: "file-invoice-dollar.svg",
  close: "book-open.svg",
  evidence: "chart-line.svg"
});
const A12_UI_STAGE_IDS = Object.freeze(["source", "classify", "allocate", "authorize", "settle", "post", "close"]);
const a12UiClone = (value) => typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));

function a12UiEscape(value) {
  return String(value ?? "—").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function a12UiSlug(value) { return String(value ?? "").toLowerCase().replaceAll(/[^a-z0-9]+/g, "-"); }
function a12UiLabel(value) { return String(value ?? "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function a12UiState(value) { return String(value ?? "missing").replaceAll("_", " "); }
function a12UiIcon(name) { return `assets/icons/${A12_UI_ICONS[name] ?? "circle-check.svg"}`; }
function a12UiSource(value) {
  const text = String(value ?? "");
  return /(?:A12|C15|R[0-9]+|runtime|packet|producer|governance|handoff|manifest|sha|exchange)/i.test(text) ? "Typed local source" : text || "Typed local source";
}

const A12_PUBLIC_AUDIT_KEYS = new Set(["label", "name", "type", "objectId", "status", "state", "reason", "source", "truthClass", "value", "stage", "action"]);
const A12_INTERNAL_AUDIT_TOKEN = /(?:^|[._-])(?:r[0-9]+|packet|runtime|producer|exchange|sha(?:256)?|artifact|handoff|manifest|commit|governance|internal)(?:$|[._:-])/i;
const A12_PUBLIC_RECEIPT_ROOT_KEYS = Object.freeze(["expected", "observed", "status", "source"]);

function a12UiPublicAuditValue(value) {
  if (value === null || value === undefined || value === "") return "Not provided";
  if (Array.isArray(value)) return value.map(a12UiPublicAuditValue).join(", ");
  if (typeof value === "object") {
    const visible = Object.entries(value)
      .filter(([key]) => A12_PUBLIC_AUDIT_KEYS.has(key) && !A12_INTERNAL_AUDIT_TOKEN.test(key))
      .map(([key, item]) => `${a12UiLabel(key)}: ${a12UiPublicAuditValue(item)}`);
    return visible.length ? visible.join(" · ") : "Structured event (internal details withheld)";
  }
  const text = String(value);
  return A12_INTERNAL_AUDIT_TOKEN.test(text) ? "Internal governance detail withheld" : text;
}

function a12UiPublicAuditEvent(event = {}) {
  const actor = String(event.actor ?? "Operator").toLowerCase() === "system" ? "Control service" : String(event.actor ?? "Operator");
  return {
    time: a12UiPublicAuditValue(event.time),
    actor: a12UiPublicAuditValue(actor),
    object: a12UiPublicAuditValue(event.object),
    action: a12UiPublicAuditValue(event.action),
    result: a12UiPublicAuditValue(event.result)
  };
}

function a12UiPublicStructuredValue(value, depth = 0) {
  if (value === null || value === undefined || value === "") return "Not provided";
  if (typeof value === "bigint") return String(value);
  if (depth >= 5 && (Array.isArray(value) || typeof value === "object")) return "Structured value";
  if (Array.isArray(value)) return value.map((item) => a12UiPublicStructuredValue(item, depth + 1)).join(", ");
  if (typeof value === "object") {
    const visible = Object.entries(value)
      .filter(([key]) => !A12_INTERNAL_AUDIT_TOKEN.test(key))
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, item]) => `${a12UiLabel(key)}: ${a12UiPublicStructuredValue(item, depth + 1)}`);
    return visible.length ? `{ ${visible.join(" · ")} }` : "Structured value (internal details withheld)";
  }
  const text = String(value);
  return A12_INTERNAL_AUDIT_TOKEN.test(text) ? "Internal governance detail withheld" : text;
}

export function a12UiPublicReceiptValue(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return a12UiPublicStructuredValue(value);
  const visible = A12_PUBLIC_RECEIPT_ROOT_KEYS
    .filter((key) => Object.hasOwn(value, key))
    .map((key) => `${a12UiLabel(key)}: ${key === "source" ? a12UiSource(value[key]) : a12UiPublicStructuredValue(value[key])}`);
  return visible.length ? visible.join(" · ") : a12UiPublicStructuredValue(value);
}

function a12UiStyles() {
  if (document.getElementById("a12-workbench-styles")) return;
  const style = document.createElement("style");
  style.id = "a12-workbench-styles";
  style.textContent = `
    .a12-root{min-height:100vh;margin:0;padding:0!important;background:#f4f6f8;color:#172033;font:14px/1.45 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .a12-app{--a12-l0:#f4f6f8;--a12-l1:#fff;--a12-l2:#eef4ff;--a12-l3:#fff;--a12-text:#172033;--a12-muted:#526071;--a12-border:#cdd5df;--a12-selected:#dce9ff;--a12-focus:#145dcc;--a12-success:#147d64;--a12-warning:#9a6700;--a12-danger:#b42318;--a12-stale:#8a5a00;display:grid;grid-template-columns:208px minmax(0,1fr);grid-template-rows:auto 1fr;min-height:100vh;background:var(--a12-l0);color:var(--a12-text)}
    .a12-app *{box-sizing:border-box}.a12-app button,.a12-app input,.a12-app select,.a12-app textarea{font:inherit}.a12-app button{cursor:pointer}.a12-app input,.a12-app select,.a12-app textarea{min-height:44px}.a12-queue-tools input[data-a12-search]{min-height:44px!important;height:44px}.a12-app button:focus-visible,.a12-app input:focus-visible,.a12-app [tabindex]:focus-visible{outline:3px solid var(--a12-focus);outline-offset:2px}
    .a12-nav{grid-row:1/3;display:flex;min-width:0;flex-direction:column;padding:22px 16px;background:#fff;border-right:1px solid var(--a12-border)}
    .a12-brand{display:flex;align-items:center;gap:12px;margin:0 6px 30px}.a12-brand img{width:56px;height:56px;object-fit:contain;border-radius:12px}.a12-brand b{display:block;font-size:18px;letter-spacing:.02em}.a12-brand span{display:block;margin-top:3px;color:var(--a12-muted);font-size:12px;line-height:1.25}.a12-nav-label{margin:0 10px 8px;color:var(--a12-muted);font-size:10px;font-weight:800;letter-spacing:.11em;text-transform:uppercase}.a12-nav-list{display:grid;gap:5px}.a12-nav-list button{display:flex;min-height:48px;align-items:center;gap:11px;padding:10px 12px;border:0;border-radius:8px;background:transparent;color:var(--a12-muted);text-align:left;font-weight:750}.a12-nav-list button:hover{background:var(--a12-l2);color:var(--a12-text)}.a12-nav-list button[aria-current="true"]{background:var(--a12-selected);color:var(--a12-focus);box-shadow:inset 3px 0 0 var(--a12-focus)}.a12-nav-list img{width:20px;height:20px;flex:none}.a12-nav-boundary{margin-top:auto;padding:13px 12px;border:1px solid var(--a12-border);border-radius:8px;background:var(--a12-l0);color:var(--a12-muted);font-size:11px}.a12-nav-boundary b{display:block;margin-bottom:3px;color:var(--a12-success);font-size:12px}.a12-nav-boundary small{display:block;line-height:1.45}
    .a12-shell{grid-column:2;display:flex;min-width:0;flex-wrap:wrap;align-items:center;gap:8px 14px;padding:10px 22px;border-bottom:1px solid var(--a12-border);background:#fff}.a12-shell-title{margin-right:auto;font-size:13px;font-weight:850;letter-spacing:.04em}.a12-shell-status{display:flex;min-height:36px;align-items:center;gap:7px;padding:7px 10px;border:1px solid var(--a12-border);border-radius:7px;background:var(--a12-l0);color:var(--a12-muted);font-size:12px}.a12-shell-status b{color:var(--a12-text);font-weight:800}.a12-dot{width:8px;height:8px;border-radius:50%;background:var(--a12-success);box-shadow:0 0 0 3px #d7eee7}.a12-dot.neutral{background:var(--a12-warning);box-shadow:0 0 0 3px #f5e9c9}
    .a12-main{grid-column:2;min-width:0;padding:18px 22px 30px}.a12-breadcrumb{display:flex;min-height:36px;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;color:var(--a12-muted);font-size:12px}.a12-breadcrumb b{color:var(--a12-text)}.a12-breadcrumb button{min-height:44px;padding:8px 12px;border:1px solid var(--a12-border);border-radius:6px;background:var(--a12-l1);color:var(--a12-text);font-weight:750}.a12-workbench{display:grid;grid-template-columns:300px minmax(0,1fr) 336px;min-width:0;align-items:start;border:1px solid var(--a12-border);background:var(--a12-l1);box-shadow:0 4px 16px rgba(23,32,51,.05)}
    .a12-queue{min-width:0;min-height:calc(100vh - 130px);padding:16px;border-right:1px solid var(--a12-border);background:var(--a12-l0)}.a12-panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:12px}.a12-panel-head h2{margin:0;font-size:16px;line-height:1.3}.a12-panel-head p{margin:3px 0 0;color:var(--a12-muted);font-size:11px}.a12-count{padding:3px 6px;border-radius:999px;background:var(--a12-selected);color:var(--a12-focus);font-size:10px;font-weight:850}.a12-queue-tools{display:grid;gap:8px;margin-bottom:12px}.a12-queue-tools input{width:100%;min-height:44px;padding:9px 10px;border:1px solid var(--a12-border);border-radius:6px;background:#fff;color:var(--a12-text)}.a12-filter-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px}.a12-filter-row button{min-height:44px;padding:5px 4px;border:1px solid var(--a12-border);border-radius:5px;background:#fff;color:var(--a12-muted);font-size:10px;font-weight:800}.a12-filter-row button[aria-pressed="true"]{border-color:var(--a12-focus);background:var(--a12-selected);color:var(--a12-focus)}.a12-queue-list{display:grid;gap:5px;margin:0;padding:0;list-style:none}.a12-queue-row{display:grid;grid-template-columns:24px minmax(0,1fr);gap:8px;width:100%;min-height:70px;padding:9px;border:1px solid transparent;border-radius:7px;background:transparent;color:var(--a12-text);text-align:left}.a12-queue-row:hover{border-color:var(--a12-border);background:#fff}.a12-queue-row[aria-selected="true"]{border-color:var(--a12-focus);background:var(--a12-selected);box-shadow:inset 3px 0 0 var(--a12-focus)}.a12-direction{display:grid;width:22px;height:22px;place-items:center;border:1px solid var(--a12-border);border-radius:5px;background:#fff;color:var(--a12-focus);font-size:10px;font-weight:900}.a12-direction.in{color:var(--a12-success)}.a12-queue-row b{display:block;overflow:hidden;font-size:12px;text-overflow:ellipsis;white-space:nowrap}.a12-queue-row small{display:block;margin-top:3px;overflow:hidden;color:var(--a12-muted);font-size:10px;text-overflow:ellipsis;white-space:nowrap}.a12-queue-meta{display:flex;justify-content:space-between;gap:6px;margin-top:6px;color:var(--a12-muted);font-size:10px}.a12-queue-meta strong{color:var(--a12-text);font-size:11px;font-variant-numeric:tabular-nums}.a12-unresolved{margin-top:12px;padding:10px;border-left:3px solid var(--a12-warning);background:#fff9e9;color:var(--a12-muted);font-size:11px}.a12-unresolved b{display:block;color:var(--a12-text);font-size:12px}
    .a12-canvas{min-width:0;padding:20px 22px;background:var(--a12-l1)}.a12-case-header{min-width:0;padding-bottom:16px;border-bottom:1px solid var(--a12-border)}.a12-case-header h1{min-width:0;margin:5px 0 3px;overflow-wrap:anywhere;font-size:24px;line-height:1.32;font-weight:700}.a12-kicker{color:var(--a12-muted);font-size:11px;font-weight:850;letter-spacing:.08em;text-transform:uppercase}.a12-case-copy{margin:0;color:var(--a12-muted);font-size:12px}.a12-object-line{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}.a12-object-ref{display:inline-flex;min-height:44px;align-items:center;gap:5px;padding:7px 9px;border:1px solid var(--a12-border);border-radius:6px;background:var(--a12-l0);color:var(--a12-text);font-size:11px;text-align:left}.a12-object-ref span{color:var(--a12-muted)}.a12-object-ref b{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px}.a12-object-ref button{min-height:30px;padding:3px 6px;border:1px solid var(--a12-border);border-radius:4px;background:#fff;color:var(--a12-focus);font-size:10px;font-weight:800}.a12-command{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;min-width:0;margin:16px 0;padding:14px;border:1px solid var(--a12-border);border-left:4px solid var(--a12-warning);background:var(--a12-l0)}.a12-command>div{min-width:0}.a12-command h2{min-width:0;margin:0;overflow-wrap:anywhere;font-size:14px}.a12-command p{margin:4px 0 0;overflow-wrap:anywhere;color:var(--a12-muted);font-size:12px}.a12-command small{display:block;margin-top:7px;overflow-wrap:anywhere;color:var(--a12-muted);font-size:11px}.a12-command-actions{display:flex;min-width:0;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:8px}.a12-command-actions>button{max-width:100%;white-space:normal}.a12-primary{min-height:44px;padding:10px 13px;border:0;border-radius:6px;background:var(--a12-focus);color:#fff;font-weight:850}.a12-primary:hover{background:#0d4ca8}.a12-primary:disabled{opacity:1;background:#c7d0dd;color:#3f4d5e;cursor:not-allowed}.a12-primary:disabled small{color:#526071}.a12-secondary{min-height:44px;padding:9px 11px;border:1px solid var(--a12-border);border-radius:6px;background:#fff;color:var(--a12-text);font-weight:750}.a12-inline-action{min-height:44px;padding:8px 10px;border:0;background:none;color:var(--a12-focus);font-weight:800}.a12-section{margin-top:18px}.a12-section h2{margin:0 0 9px;font-size:16px}.a12-section-intro{margin:-4px 0 10px;color:var(--a12-muted);font-size:11px}.a12-field-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.a12-field{min-width:0;padding:10px;border:1px solid var(--a12-border);border-radius:6px;background:#fff}.a12-field dt{color:var(--a12-muted);font-size:10px;font-weight:800}.a12-field dd{margin:4px 0 0}.a12-field output,.a12-field input{display:block;width:100%;min-height:32px;overflow:hidden;padding:4px 0;border:0;background:transparent;color:var(--a12-text);font-size:12px;font-weight:750;text-overflow:ellipsis;white-space:nowrap}.a12-field input{min-height:44px;padding:8px 7px;border:1px solid var(--a12-border);border-radius:4px}.a12-field small{display:block;margin-top:5px;color:var(--a12-muted);font-size:10px;line-height:1.3}.a12-field[data-truth-class="missing"]{border-left:3px solid var(--a12-warning)}.a12-field[data-editability="editable"]{background:#fbfdff}.a12-consequence-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.a12-consequence{min-width:0;padding:11px;border:1px solid var(--a12-border);background:var(--a12-l0)}.a12-consequence b{display:block;font-size:12px}.a12-consequence span{display:block;margin-top:4px;color:var(--a12-muted);font-size:11px}.a12-boundary{margin-top:10px;padding:10px;border-left:3px solid var(--a12-danger);background:#fff5f4;color:var(--a12-danger);font-size:11px}.a12-boundary b{display:block;color:var(--a12-text);font-size:12px}
    .a12-causal{display:grid;grid-template-columns:repeat(7,minmax(72px,1fr));gap:5px;overflow:auto;padding-bottom:4px}.a12-causal-stage{position:relative;min-width:80px;min-height:82px;padding:9px 8px;border:1px solid var(--a12-border);border-top:3px solid #b9c2cc;border-radius:6px;background:#fff;color:var(--a12-text);text-align:left}.a12-causal-stage:hover{border-color:var(--a12-focus)}.a12-causal-stage[data-status="verified"]{border-top-color:var(--a12-success);background:#f5fbf8}.a12-causal-stage[data-status="current"]{border-top-color:var(--a12-focus);background:var(--a12-selected);box-shadow:var(--a12-l2-shadow, inset 3px 0 0 var(--a12-focus))}.a12-causal-stage[data-status="prerequisite"]{background:var(--a12-l0);color:var(--a12-muted)}.a12-causal-stage strong{display:block;font-size:11px}.a12-causal-stage span{display:block;margin-top:5px;color:var(--a12-muted);font-size:10px;line-height:1.3}.a12-causal-stage small{display:block;margin-top:6px;color:var(--a12-muted);font-size:9px}
    .a12-object-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:14px}.a12-object-summary>div{min-width:0;padding:10px 11px;border:1px solid var(--a12-border);border-radius:7px;background:#f8fafc}.a12-object-summary span{display:block;color:var(--a12-muted);font-size:11px;font-weight:750}.a12-object-summary b{display:block;margin-top:4px;overflow:hidden;font-size:13px;text-overflow:ellipsis;white-space:nowrap}.a12-state-pill{display:inline-flex!important;width:max-content;max-width:100%;align-items:center;padding:3px 8px;border-radius:999px;font-size:11px!important;white-space:normal!important}.a12-state-pill.tone-success{background:#dff4eb;color:#126b56}.a12-state-pill.tone-warning{background:#fff1c7;color:#7a5100}.a12-state-pill.tone-danger{background:#fde4e1;color:#9d2118}.a12-state-pill.tone-neutral{background:#e8edf3;color:#455366}.a12-field dt{font-size:12px}.a12-field-hint{float:right;margin-left:8px;color:var(--a12-muted);font-size:10px;font-weight:700;letter-spacing:0;text-transform:none}.a12-field-hint.is-actionable{color:var(--a12-focus)}.a12-field-hint.is-readonly{color:var(--a12-muted)}.a12-field small{font-size:11px}.a12-field[data-truth-class="missing"] output{color:var(--a12-warning)}.a12-disclosure{margin-top:18px;border:1px solid var(--a12-border);border-radius:8px;background:#fff}.a12-disclosure>summary{display:flex;min-height:48px;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;cursor:pointer;color:var(--a12-text);font-size:15px;font-weight:850;list-style:none}.a12-disclosure>summary::-webkit-details-marker{display:none}.a12-disclosure>summary span{margin-left:auto;color:var(--a12-muted);font-size:11px;font-weight:650}.a12-disclosure>summary::after{content:"Show";color:var(--a12-focus);font-size:12px}.a12-disclosure[open]>summary::after{content:"Hide"}.a12-disclosure-body{padding:0 14px 14px}.a12-disclosure-body>.a12-section:first-child{margin-top:4px}.a12-rail-disclosure{border-left:3px solid var(--a12-focus)}.a12-rail-disclosure>summary{background:#f5f8ff}.a12-status-strip{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;margin-top:14px;padding:12px 14px;border:1px solid var(--a12-border);border-left:4px solid var(--a12-focus);border-radius:7px;background:#f8fafc}.a12-status-strip h2{margin:0;font-size:14px}.a12-status-strip p{margin:3px 0 0;color:var(--a12-muted);font-size:12px}.a12-status-meta{text-align:right;color:var(--a12-muted);font-size:11px}.a12-status-meta b{display:block;color:var(--a12-text);font-size:12px}.a12-status-strip.tone-success{border-left-color:var(--a12-success);background:#f3fbf7}.a12-status-strip.tone-warning{border-left-color:var(--a12-warning);background:#fffaf0}.a12-status-strip.tone-danger{border-left-color:var(--a12-danger);background:#fff6f5}.a12-causal-stage[data-status="blocked"]{border-top-color:var(--a12-danger);background:#fff5f4;color:var(--a12-danger)}
    .a12-inspector{min-width:0;min-height:calc(100vh - 130px);padding:16px;border-left:1px solid var(--a12-border);background:var(--a12-l0)}.a12-inspector-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.a12-inspector-head h2{margin:0;font-size:16px}.a12-inspector-head p{margin:4px 0 0;color:var(--a12-muted);font-size:11px}.a12-inspector-close{display:none;min-width:44px;min-height:44px;border:1px solid var(--a12-border);border-radius:6px;background:#fff;color:var(--a12-text);font-size:20px}.a12-tabs{display:flex;gap:4px;overflow:auto;margin:14px -2px 12px;padding-bottom:3px}.a12-tabs button{min-width:44px;min-height:44px;padding:7px 8px;border:1px solid var(--a12-border);border-radius:5px;background:#fff;color:var(--a12-muted);font-size:10px;font-weight:850;white-space:nowrap}.a12-tabs button[aria-selected="true"]{border-color:var(--a12-focus);background:var(--a12-selected);color:var(--a12-focus)}.a12-inspector-section{margin-top:14px;padding-top:12px;border-top:1px solid var(--a12-border)}.a12-inspector-section:first-child{margin-top:0;padding-top:0;border-top:0}.a12-inspector-section h3{margin:0 0 8px;font-size:13px}.a12-inspector-note{padding:9px;border-left:3px solid var(--a12-warning);background:#fff9e9;color:var(--a12-muted);font-size:11px}.a12-object-list{display:grid;gap:6px}.a12-object-row{min-width:0;padding:9px;border:1px solid var(--a12-border);border-radius:6px;background:#fff}.a12-object-row[data-boundary="owner_gate_closed"]{border-left:3px solid var(--a12-warning)}.a12-object-row b{display:block;font-size:11px}.a12-object-row span{display:block;margin-top:3px;color:var(--a12-muted);font-size:10px;line-height:1.35}.a12-object-row small{display:block;margin-top:5px;color:var(--a12-muted);font-size:9px}.a12-provenance{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:8px 0;border-bottom:1px solid #e5eaf0;font-size:10px}.a12-provenance:last-child{border-bottom:0}.a12-provenance b{overflow-wrap:anywhere;font-size:11px}.a12-provenance span{color:var(--a12-muted);text-align:right}.a12-receipt-grid{display:grid;gap:5px;max-height:420px;overflow:auto}.a12-receipt-field{padding:7px;border:1px solid #e5eaf0;background:#fff}.a12-receipt-field b{display:block;overflow-wrap:anywhere;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px}.a12-receipt-field span{display:block;margin-top:3px;color:var(--a12-muted);font-size:9px}.a12-receipt-field[data-truth="missing"]{border-left:3px solid var(--a12-warning)}.a12-table-wrap{overflow:auto}.a12-table{width:100%;border-collapse:collapse;font-size:10px}.a12-table th{padding:7px;border-bottom:1px solid var(--a12-border);color:var(--a12-muted);text-align:left;font-size:9px;text-transform:uppercase}.a12-table td{padding:8px 7px;border-bottom:1px solid #e5eaf0;vertical-align:top}.a12-table td:last-child{text-align:right;font-variant-numeric:tabular-nums}.a12-replay{padding:10px;border:1px solid #b7d5c9;border-radius:6px;background:#f5fbf8}.a12-replay b{display:block;color:var(--a12-success);font-size:12px}.a12-replay code{display:block;margin-top:5px;overflow-wrap:anywhere;color:var(--a12-text);font-size:10px}.a12-outcomes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;margin-top:8px}.a12-outcomes button{min-height:44px;padding:5px;border:1px solid var(--a12-border);border-radius:5px;background:#fff;color:var(--a12-muted);font-size:10px;font-weight:800}.a12-outcomes button[aria-pressed="true"]{border-color:var(--a12-focus);background:var(--a12-selected);color:var(--a12-focus)}.a12-live{position:fixed;right:18px;bottom:18px;z-index:40;max-width:420px;padding:10px 12px;border:1px solid var(--a12-border);border-radius:6px;background:#172033;color:#fff;font-size:11px;box-shadow:0 8px 24px rgba(23,32,51,.18)}
    .a12-bottom-action{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;align-items:center;margin-top:20px;padding:14px 16px;border:1px solid var(--a12-border);border-top:3px solid var(--a12-focus);border-radius:8px;background:#f8fafc}.a12-bottom-action strong{display:block;font-size:15px}.a12-bottom-action p{margin:3px 0 0;color:var(--a12-muted);font-size:12px}.a12-bottom-action .a12-kicker{font-size:10px}.a12-fields-disclosure{margin-top:16px}.a12-fields-disclosure>summary{background:#fbfdff}
    @media(max-width:1600px){.a12-command{grid-template-columns:minmax(0,1fr)}.a12-command-actions{justify-content:flex-start}.a12-object-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:1310px){.a12-app{grid-template-columns:208px minmax(0,1fr)}.a12-brand{justify-content:flex-start;margin-left:6px;margin-right:6px}.a12-brand>div,.a12-nav-label,.a12-nav-list button span,.a12-nav-boundary small{display:block}.a12-nav{padding-left:16px;padding-right:16px}.a12-nav-list button{justify-content:flex-start;padding:10px 12px}.a12-shell,.a12-main{grid-column:2}.a12-workbench{grid-template-columns:280px minmax(0,1fr) 320px}.a12-object-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:1050px){.a12-app{grid-template-columns:176px minmax(0,1fr)}.a12-workbench{grid-template-columns:248px minmax(0,1fr)}.a12-inspector{position:fixed;z-index:35;top:0;right:0;bottom:0;width:min(420px,calc(100vw - 176px));overflow:auto;border-left:1px solid var(--a12-border);box-shadow:-12px 0 30px rgba(23,32,51,.18);transform:translateX(105%);transition:transform .18s ease}.a12-inspector.is-open{transform:none}.a12-inspector-close{display:block}.a12-inspector-open{display:inline-flex!important}.a12-command{grid-template-columns:1fr}.a12-command-actions{justify-content:flex-start}.a12-causal{grid-template-columns:repeat(7,100px)}}
    @media(min-width:1051px){.a12-inspector-open{display:none!important}}
    @media(max-width:720px){.a12-app{display:block}.a12-nav{display:block;min-height:auto;padding:10px;border-right:0;border-bottom:1px solid var(--a12-border)}.a12-brand{justify-content:flex-start;margin:0 4px 9px}.a12-brand>div{display:block}.a12-nav-label,.a12-nav-boundary{display:none}.a12-nav-list{display:grid;grid-template-columns:repeat(5,minmax(0,1fr))}.a12-nav-list button{justify-content:center;min-height:44px}.a12-nav-list button span{display:none}.a12-shell,.a12-main{padding-left:12px;padding-right:12px}.a12-workbench{display:block}.a12-queue{min-height:0;border-right:0;border-bottom:1px solid var(--a12-border)}.a12-queue-list{max-height:360px;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable}.a12-canvas{padding:16px}.a12-field-grid,.a12-consequence-grid{grid-template-columns:1fr}.a12-command-actions{display:grid;grid-template-columns:1fr}.a12-primary,.a12-secondary{width:100%}.a12-inspector{width:min(390px,100vw)}.a12-object-line{display:grid}.a12-object-ref{width:100%}.a12-object-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.a12-disclosure>summary{align-items:flex-start;flex-wrap:wrap}.a12-disclosure>summary span{width:100%;margin-left:0}.a12-status-strip{grid-template-columns:1fr}.a12-status-meta{text-align:left}}
    /* R1 correction: the rendered page-state selector, readable desktop center, and 44px field target win after legacy rules. */
    .a12-nav-list button[aria-current="page"]{background:var(--a12-selected);color:var(--a12-focus);box-shadow:inset 3px 0 0 var(--a12-focus)}
    .a12-field output,.a12-field input{min-height:44px!important}
    .a12-origin-entry{min-width:0;margin:14px 0 0;padding:12px;border:1px solid var(--a12-border);border-radius:8px;background:#fbfaf5}
    .a12-origin-entry legend{padding:0 5px;color:var(--a12-text);font-size:12px;font-weight:850}
    .a12-origin-entry-note{margin:0 0 9px;color:var(--a12-muted);font-size:11px;line-height:1.4}
    .a12-origin-entry-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
    .a12-origin-entry-option{display:grid;min-width:0;min-height:54px;gap:3px;padding:9px 10px;border:1px solid var(--a12-border);border-radius:7px;background:#fff;color:var(--a12-text);text-align:left}
    .a12-origin-entry-option:hover,.a12-origin-entry-option:focus-visible{border-color:var(--a12-focus)}
    .a12-origin-entry-option.is-active{border-color:var(--a12-focus);background:var(--a12-selected);box-shadow:inset 3px 0 0 var(--a12-focus)}
    .a12-origin-entry-option span{font-size:12px;font-weight:850}
    .a12-origin-entry-option small{overflow:hidden;color:var(--a12-muted);font-size:10px;text-overflow:ellipsis;white-space:nowrap}
    .a12-origin-entry-bound{margin-top:9px;padding:8px 9px;border-left:3px solid var(--a12-focus);background:#f2f8f4;color:var(--a12-muted);font-size:11px}
    .a12-origin-entry-bound b{color:var(--a12-text)}
    @media(min-width:1311px){.a12-workbench{grid-template-columns:260px minmax(560px,1fr) 300px}}
    @media(max-width:1310px) and (min-width:721px){.a12-workbench{grid-template-columns:260px minmax(0,1fr) 300px}}
    /* 200% zoom preserves the same keyboard/action order; no fixed footer covers content. */
    @media(prefers-reduced-motion:reduce){.a12-inspector{transition:none}.a12-app *{scroll-behavior:auto!important}}
    /* Operations-desk IA: the decision canvas owns desktop width; evidence is a deliberate drawer. */
    @media(min-width:1051px){.a12-workbench{grid-template-columns:260px minmax(0,1fr)}.a12-inspector{position:fixed;z-index:35;top:0;right:0;bottom:0;width:min(460px,calc(100vw - 208px));overflow:auto;border-left:1px solid var(--a12-border);box-shadow:-12px 0 30px rgba(23,32,51,.18);transform:translateX(105%);transition:transform .18s ease}.a12-inspector.is-open{transform:none}.a12-inspector-close{display:block}.a12-inspector-open{display:inline-flex!important}}
    /* Current-release workspace modules: one primary job per ERP workspace, warm operations-desk hierarchy, 12px operational text floor. */
    .a12-app{--a12-l0:#f4f0e8;--a12-l1:#fffdf8;--a12-l2:#edf3ee;--a12-selected:#e4efe8;--a12-focus:#185c48;--a12-warning:#a46d12;--a12-border:#d5cfc3;color:#242823}
    .a12-workspace-primary{margin:16px 0;padding:16px;border:1px solid var(--a12-border);border-left:4px solid var(--a12-focus);background:#fffdf8}
    .a12-workspace-guide{display:grid;grid-template-columns:64px minmax(0,1fr);gap:14px;align-items:center;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--a12-border)}
    .a12-workspace-guide img{width:64px;height:64px;object-fit:contain}.a12-workspace-guide h2{margin:2px 0 4px;font-size:18px}.a12-workspace-guide p{margin:0;color:var(--a12-muted);font-size:13px}
    .a12-workspace-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.a12-workspace-card{padding:12px;border:1px solid var(--a12-border);background:#fff}.a12-workspace-card b{display:block;font-size:13px}.a12-workspace-card span,.a12-workspace-card small{display:block;margin-top:4px;color:var(--a12-muted);font-size:12px;line-height:1.4}
    .a12-workspace-table{width:100%;border-collapse:collapse;font-size:12px}.a12-workspace-table th,.a12-workspace-table td{padding:9px 8px;border-bottom:1px solid var(--a12-border);text-align:left;vertical-align:top}.a12-workspace-table th{color:var(--a12-muted);font-size:12px}.a12-workspace-table tr[data-selected="true"]{background:var(--a12-selected)}
    .a12-app[data-current-workspace="milestone-desk"] .a12-workbench{grid-template-columns:minmax(0,1fr)}.a12-app[data-current-workspace="milestone-desk"] .a12-queue{display:none}.a12-app[data-current-workspace="milestone-desk"] .a12-canvas{padding:16px 22px 92px}
    @media(min-width:721px){.a12-app[data-current-workspace="milestone-desk"] .a12-shell{display:grid;grid-template-columns:minmax(160px,1fr) repeat(3,max-content);min-height:48px;padding:6px 16px}}.a12-app[data-current-workspace="milestone-desk"] .a12-shell-status:nth-child(n+5){display:none}.a12-app[data-current-workspace="milestone-desk"] .a12-shell-status{min-height:30px;padding:4px 7px}
    .a12-app[data-current-workspace="milestone-desk"] .a12-case-header h1{font-family:Georgia,"Times New Roman",serif;font-size:26px;font-weight:650}.a12-app[data-current-workspace="milestone-desk"] .a12-case-copy{margin-top:3px}.a12-app[data-current-workspace="milestone-desk"] .a12-object-summary{display:none}.a12-app[data-current-workspace="milestone-desk"] .a12-object-line{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px}.a12-app[data-current-workspace="milestone-desk"] .a12-object-ref{min-height:44px;padding:5px 7px;overflow:hidden}.a12-app[data-current-workspace="milestone-desk"] .a12-object-ref b{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .a12-milestone-layout{display:grid;grid-template-columns:minmax(0,1.8fr) minmax(300px,.8fr);gap:18px}.a12-milestone-timeline{display:grid;gap:10px}.a12-milestone-step{position:relative;display:grid;grid-template-columns:38px minmax(0,1fr);gap:12px;padding:14px;border:1px solid var(--a12-border);border-radius:8px;background:#fff}.a12-milestone-step:before{content:"";position:absolute;left:32px;top:-11px;width:2px;height:11px;background:var(--a12-border)}.a12-milestone-step:first-child:before{display:none}.a12-milestone-step img{width:30px;height:30px;object-fit:contain}.a12-milestone-step b{display:block;font-size:14px}.a12-milestone-step span{display:block;margin-top:3px;color:var(--a12-muted);font-size:12px}.a12-milestone-step[data-state="verified"]{border-color:#9bbdaa}.a12-milestone-step[data-state="current"]{border-color:#6fa5db;box-shadow:inset 3px 0 0 #2b78cc}.a12-milestone-step[data-state="held"]{border-color:#d7aa5e;box-shadow:inset 3px 0 0 #c7851c}
    .a12-milestone-summary{display:grid;align-content:start;gap:12px}.a12-summary-panel{padding:14px;border:1px solid var(--a12-border);border-radius:8px;background:#fff}.a12-summary-panel h3{margin:0 0 10px;font-size:14px}.a12-summary-token{display:grid;grid-template-columns:42px minmax(0,1fr);gap:10px;align-items:center;padding-bottom:10px;border-bottom:1px solid var(--a12-border)}.a12-summary-token img{width:38px;height:38px}.a12-summary-token b{display:block;font-size:19px}.a12-summary-token span{color:var(--a12-muted);font-size:12px}.a12-summary-pairs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.a12-summary-pairs>div{padding:10px 8px;border-bottom:1px solid var(--a12-border)}.a12-summary-pairs span{display:block;color:var(--a12-muted);font-size:12px}.a12-summary-pairs b{display:block;margin-top:3px;font-size:13px}.a12-decision-row{padding:10px;border:1px solid var(--a12-border);border-radius:6px}.a12-decision-row+ .a12-decision-row{margin-top:7px}.a12-decision-row b{display:block;font-size:13px}.a12-decision-row span{display:block;margin-top:3px;color:var(--a12-muted);font-size:12px}.a12-decision-row[data-state="current"]{border-color:var(--a12-focus);background:#f2f8f4}
    .a12-milestone-document{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:10px;align-items:center;margin:0 0 10px;padding:9px 12px;border:1px solid #b9c9d7;border-radius:8px;background:#f7fbff}.a12-milestone-document-icon{display:grid;width:44px;height:44px;place-items:center;border-radius:8px;background:#e2eefb}.a12-milestone-document-icon img{width:26px;height:26px}.a12-milestone-document-copy h3{margin:1px 0 2px;font-family:Georgia,"Times New Roman",serif;font-size:18px;font-weight:650}.a12-milestone-document-copy p{margin:0;color:var(--a12-muted);font-size:12px}.a12-milestone-document-copy p b{color:var(--a12-text)}.a12-summary-brands{display:flex;align-items:center;gap:5px}.a12-summary-brands img{width:30px!important;height:30px!important}.a12-milestone-guide-note{margin-top:2px;padding:11px 13px;border-left:3px solid #287553;background:#f1faf5;color:var(--a12-muted);font-size:12px}.a12-milestone-guide-note b{display:block;margin-bottom:3px;color:#1d5c43;font-size:13px}.a12-milestone-step{min-height:78px}.a12-milestone-step[data-a12-milestone-step="document"]{border-left:4px solid #287553}.a12-milestone-step[data-a12-milestone-step="gl-close"]{border-left:4px solid var(--a12-warning)}
    .a12-app[data-current-workspace="milestone-desk"] .a12-milestone-layout{grid-template-columns:minmax(0,1.55fr) minmax(320px,.78fr);align-items:start}.a12-app[data-current-workspace="milestone-desk"] .a12-workspace-primary{margin-top:8px;padding:10px 12px}.a12-app[data-current-workspace="milestone-desk"] .a12-workspace-guide{display:none}.a12-app[data-current-workspace="milestone-desk"] .a12-milestone-summary{position:sticky;top:16px}.a12-app[data-current-workspace="milestone-desk"] .a12-milestone-supporting-detail{margin-top:16px}.a12-app[data-current-workspace="milestone-desk"] .a12-milestone-supporting-detail>summary{background:#fffdf8}
    .a12-app[data-current-workspace="milestone-desk"] .a12-bottom-action{position:fixed;z-index:20;left:208px;right:0;bottom:0;min-height:72px;margin:0;padding:10px 24px;border-top:1px solid var(--a12-border);background:rgba(255,253,248,.97);box-shadow:0 -8px 22px rgba(43,48,42,.08)}.a12-app[data-current-workspace="milestone-desk"] .a12-bottom-action .a12-primary{min-width:280px;background:#287553}
    .a12-app[data-current-workspace="milestone-desk"] .a12-live{right:24px;bottom:88px}
    .a12-nav-label,.a12-queue-row small,.a12-queue-meta,.a12-filter-row button,.a12-unresolved,.a12-kicker,.a12-case-copy,.a12-object-ref,.a12-object-ref b,.a12-command small,.a12-section-intro,.a12-field small,.a12-consequence span,.a12-boundary,.a12-causal-stage strong,.a12-causal-stage span,.a12-causal-stage small,.a12-inspector-head p,.a12-tabs button,.a12-inspector-note,.a12-object-row b,.a12-object-row span,.a12-object-row small,.a12-provenance,.a12-provenance b,.a12-receipt-field b,.a12-receipt-field span,.a12-table,.a12-table th{font-size:12px}
    @media(max-width:1050px){.a12-milestone-layout{grid-template-columns:1fr}.a12-app[data-current-workspace="milestone-desk"] .a12-object-line{grid-template-columns:repeat(3,minmax(0,1fr))}.a12-app[data-current-workspace="milestone-desk"] .a12-bottom-action{left:176px}}
    @media(max-width:900px){.a12-workspace-grid{grid-template-columns:1fr}.a12-workspace-guide{grid-template-columns:52px minmax(0,1fr)}.a12-workspace-guide img{width:52px;height:52px}}
    @media(max-width:720px){.a12-app[data-current-workspace="milestone-desk"] .a12-shell{display:grid;grid-template-columns:1fr;gap:6px;padding:8px 12px}.a12-app[data-current-workspace="milestone-desk"] .a12-shell-status{min-width:0;white-space:normal}.a12-app[data-current-workspace="milestone-desk"] .a12-bottom-action{left:0}.a12-summary-pairs{grid-template-columns:1fr}.a12-app[data-current-workspace="milestone-desk"] .a12-object-line{grid-template-columns:1fr 1fr}}
    .a12-source-disclosure{margin-top:12px;border-left:3px solid #7b8d84}.a12-source-disclosure>summary{min-height:44px;font-size:13px}.a12-source-disclosure .a12-origin-entry{margin-top:0;border:0;border-radius:0;background:transparent}.a12-source-disclosure .a12-disclosure-body{padding:0}.a12-milestone-step[data-state="warning"]{border-color:#c98926;box-shadow:inset 3px 0 0 #a46d12;background:#fff9ec}.a12-milestone-step[data-state="blocked"]{border-color:#d7b5ad;box-shadow:inset 3px 0 0 #b42318;background:#fff6f4}.a12-decision-row[data-state="held"]{background:#fffdf8;color:#526071}.a12-decision-row.is-selected{box-shadow:inset 3px 0 0 var(--a12-focus)}.a12-summary-token small{display:block;margin-top:3px;color:var(--a12-muted);font-size:12px}.a12-milestone-document[data-a12-milestone-state="stale"],.a12-milestone-document[data-a12-milestone-state="mismatch"]{border-color:#d5b27a;background:#fffaf0}
    @media(max-width:560px){.a12-origin-entry-options{grid-template-columns:1fr}}
    /* Final visual closeout: keep the global context on one compact row, reserve a real brand column, and keep the fixed action bar out of the milestone evidence rail. */
    @media(min-width:1311px){.a12-shell{display:grid;grid-template-columns:minmax(112px,1fr) repeat(6,max-content);gap:6px 8px;min-height:48px;padding:6px 16px}.a12-shell-title{min-width:0;margin-right:0;white-space:nowrap}.a12-shell-status{min-height:30px;gap:5px;padding:4px 7px;white-space:nowrap;font-size:11px}}
    @media(min-width:1311px) and (max-width:1450px){.a12-shell{grid-template-columns:minmax(104px,1fr) repeat(6,max-content);gap:5px 6px;padding-left:12px;padding-right:12px}.a12-shell-status{padding-left:5px;padding-right:5px;font-size:10px}}
    .a12-summary-token{grid-template-columns:minmax(68px,auto) minmax(0,1fr);gap:12px}.a12-summary-token>div{min-width:0}.a12-summary-brands{display:grid;grid-template-columns:repeat(2,30px);gap:6px;min-width:66px;align-items:center}.a12-summary-brands img{width:30px!important;height:30px!important;flex:none}.a12-summary-token b{min-width:0;overflow-wrap:anywhere;font-size:18px;line-height:1.15}.a12-summary-token small{overflow-wrap:anywhere}
    .a12-app[data-current-workspace="milestone-desk"] .a12-canvas{padding-bottom:92px}.a12-app[data-current-workspace="milestone-desk"] .a12-milestone-summary{position:relative;top:auto;padding-bottom:8px}.a12-app[data-current-workspace="milestone-desk"] .a12-milestone-layout{gap:14px}.a12-app[data-current-workspace="milestone-desk"] .a12-milestone-step{min-height:70px;padding:10px 12px}.a12-app[data-current-workspace="milestone-desk"] .a12-milestone-summary .a12-summary-panel{padding:11px 12px}.a12-app[data-current-workspace="milestone-desk"] .a12-milestone-summary .a12-summary-panel h3{margin-bottom:7px}.a12-app[data-current-workspace="milestone-desk"] .a12-summary-pairs>div{padding:7px 6px}.a12-app[data-current-workspace="milestone-desk"] .a12-decision-row{padding:7px 8px}.a12-app[data-current-workspace="milestone-desk"] .a12-decision-row+.a12-decision-row{margin-top:5px}.a12-app[data-current-workspace="milestone-desk"] .a12-bottom-action{min-height:72px;padding:10px 22px}
    @media(max-width:1050px){.a12-app[data-current-workspace="milestone-desk"] .a12-canvas{padding-bottom:24px}.a12-app[data-current-workspace="milestone-desk"] .a12-milestone-layout{grid-template-columns:1fr}.a12-app[data-current-workspace="milestone-desk"] .a12-bottom-action{position:static;min-height:76px;padding:9px 16px}.a12-app[data-current-workspace="milestone-desk"] .a12-live{right:18px;bottom:18px}}
    @media(max-width:720px){.a12-app[data-current-workspace="milestone-desk"] .a12-canvas{padding-bottom:24px}.a12-app[data-current-workspace="milestone-desk"] .a12-bottom-action{position:static;min-height:88px;padding:10px 12px}}
    .a12-decision-row{display:block;width:100%;background:#fff;text-align:left;color:inherit;cursor:pointer}.a12-decision-row[data-state="current"],.a12-decision-row[aria-checked="true"]{border-color:var(--a12-focus);background:#f2f8f4}.a12-decision-row:focus-visible{outline:3px solid rgba(40,117,83,.32);outline-offset:2px}
  `;
  document.head.append(style);
}

export function a12UiFilteredQueue(view, state) {
  const query = String(state.searchQuery ?? "").trim().toLowerCase();
  return view.queue.filter((row) => {
    const filterMatch = state.queueFilter === "all" || row.direction === state.queueFilter || (state.queueFilter === "exceptions" && state.matcherState !== "pending");
    const queryMatch = !query || [row.id, row.label, row.party, row.principal, row.nextOwner].some((value) => String(value ?? "").toLowerCase().includes(query));
    return filterMatch && queryMatch;
  });
}

export function a12MilestoneOutcomeFromKey(outcomes, currentOutcome, key) {
  if (!Array.isArray(outcomes) || outcomes.length === 0 || !["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(key)) return null;
  const currentIndex = Math.max(0, outcomes.indexOf(currentOutcome));
  const nextIndex = key === "Home" ? 0 : key === "End" ? outcomes.length - 1 : ["ArrowRight", "ArrowDown"].includes(key) ? (currentIndex + 1) % outcomes.length : (currentIndex - 1 + outcomes.length) % outcomes.length;
  return outcomes[nextIndex];
}

export function a12WorkspaceFocusTarget(workspaceId) {
  return ({
    "milestone-desk": "[data-testid=\"milestone-business-document\"]",
    payables: "#payables-worklist",
    receivables: "#receivables-worklist",
    reconciliation: "#reconciliation-workbench-root",
    "general-ledger": "#ledger-table",
    "audit-trail": "#audit-log"
  })[workspaceId] ?? "#a12-task-heading";
}

const a12ReconciliationValue = (value) => value === undefined || value === null ? "missing" : typeof value === "object" ? JSON.stringify(value) : String(value);

export function a12ReconciliationRows(view, state) {
  if (!state?.evidence) {
    return view.inspector.receiptFields.slice(0, 5).map((field, index) => ({ field: field.fieldId, locked: a12ReconciliationValue(field.value), observed: "missing", status: index === 0 ? "blocking" : "held", source: a12UiSource(field.source) }));
  }
  const rows = [];
  for (const record of state.evidence.ordered_records ?? []) {
    for (const field of Object.keys(record.expected ?? {})) {
      const locked = a12ReconciliationValue(record.expected?.[field]);
      const observed = a12ReconciliationValue(record.observed?.[field]);
      rows.push({ field: `${record.type}.${field}`, locked, observed, status: locked === observed ? "matched" : "blocking", source: record.source });
    }
  }
  if (state.matcherState === "stale") {
    rows.unshift({ field: "receipt_freshness", locked: `within TTL · confirmations ≥ ${state.evidence.finality?.finality_threshold ?? "required"}`, observed: `stale · confirmations ${state.evidence.finality?.confirmations ?? "missing"}`, status: "blocking", source: "typed finality observation" });
  }
  rows.sort((left, right) => Number(right.status === "blocking") - Number(left.status === "blocking"));
  return rows.slice(0, 5);
}

export function a12BrowserMeasurementContract({ scrollWidth, clientWidth, focusInsideDrawer, keyboardNavigable, consoleErrors = [] } = {}) {
  const overflowFree = Number.isFinite(Number(scrollWidth)) && Number.isFinite(Number(clientWidth)) && Number(scrollWidth) <= Number(clientWidth);
  return {
    valid: overflowFree && focusInsideDrawer === true && keyboardNavigable === true && Array.isArray(consoleErrors) && consoleErrors.length === 0,
    overflowFree,
    focusInsideDrawer: focusInsideDrawer === true,
    keyboardNavigable: keyboardNavigable === true,
    consoleErrors: Array.isArray(consoleErrors) ? [...consoleErrors] : ["console_errors_not_array"]
  };
}

function a12UiFieldMarkup(field) {
  const control = field.editability === "editable"
    ? `<input data-a12-edit="${a12UiEscape(field.field_id)}" aria-label="${a12UiEscape(field.label)}" value="${a12UiEscape(field.value)}">`
    : field.editability === "select"
      ? `<button class="a12-secondary" type="button" data-a12-edit-select="${a12UiEscape(field.field_id)}" aria-label="Select ${a12UiEscape(field.label)}">${a12UiEscape(field.value)}</button>`
      : `<output>${a12UiEscape(field.value)}</output>`;
  const actionable = field.editability === "editable" || field.editability === "select";
  const hint = actionable ? (field.editability === "select" ? "Actionable selection" : "Actionable input") : "Read-only source";
  return `<div class="a12-field" data-field-id="${a12UiEscape(field.field_id)}" data-source="${a12UiEscape(field.source)}" data-editability="${a12UiEscape(field.editability)}" data-requiredness="${a12UiEscape(field.requiredness)}" data-truth-class="${a12UiEscape(field.truthClass)}"><dt>${a12UiEscape(field.label)}<span class="a12-field-hint ${actionable ? "is-actionable" : "is-readonly"}">${hint}</span></dt><dd>${control}</dd><small>Typed ${actionable ? "operator input" : "read-only source"} · ${a12UiEscape(field.truthClass)}</small></div>`;
}

function a12UiObjectMarkup(object) {
  return `<div class="a12-object-row" data-object-id="${a12UiEscape(object.objectId)}" data-applicability="${a12UiEscape(object.applicability)}" data-runtime-state="${a12UiEscape(object.runtimeState)}" data-boundary="${a12UiEscape(object.mutationBoundary)}"><b>${a12UiLabel(object.objectId)} · ${a12UiState(object.runtimeState)}</b><span>Applicability: ${a12UiState(object.applicability)} · source: ${a12UiEscape(a12UiSource(object.source))}</span><small>Mutation boundary: ${a12UiEscape(object.mutationBoundary)}</small></div>`;
}

function a12UiInspectorMarkup(view, state) {
  const tab = state.inspectorTab;
  if (tab === "Business") {
    return `<section class="a12-inspector-section"><h3>Business object</h3><div class="a12-object-list"><div class="a12-object-row"><b>${a12UiEscape(view.canvas.scenario)}</b><span>${a12UiEscape(view.canvas.counterparty)} · ${a12UiEscape(view.canvas.principal)}</span><small>Source: ${a12UiEscape(view.canvas.source)} · case ${a12UiEscape(view.canvas.caseId)}</small></div><div class="a12-object-row"><b>First blocking fact · ${a12UiEscape(view.canvas.firstFailure)}</b><span>${a12UiEscape(view.canvas.recovery)}</span><small>Truth class: local fixture / no live business close</small></div></div></section><section class="a12-inspector-section"><h3>Field provenance</h3>${view.canvas.fields.slice(0, 8).map((field) => `<div class="a12-provenance"><b>${a12UiEscape(field.label)}</b><span>Typed source · ${a12UiEscape(field.truthClass)}</span></div>`).join("")}</section>`;
  }
  if (tab === "Arc") {
    const evidence = view.inspector.arcVerifiedEvidence ?? view.verifiedProgrammeEvidence;
    const policy = { ...view.canvas.policy, expiry: `${view.canvas.policy.validUntil} · TTL ${view.canvas.policy.ttlMinutes} min` };
    return `<section class="a12-inspector-section"><h3>dApp objects</h3><div class="a12-object-list">${view.inspector.objects.filter((object) => ["treasury_session", "settlement_policy", "unsigned_command", "wallet_review", "receipt_finality"].includes(object.objectId)).map(a12UiObjectMarkup).join("")}</div></section><section class="a12-inspector-section"><h3>PolicySettlementV1 · programme readback</h3><div class="a12-receipt-grid"><div class="a12-receipt-field"><b>policyId / version</b><span>${a12UiEscape(policy.policyId)} · ${a12UiEscape(policy.version)}</span></div><div class="a12-receipt-field"><b>amount6 cap / validUntil</b><span>${a12UiEscape(policy.allowance)} · ${a12UiEscape(policy.expiry)}</span></div><div class="a12-receipt-field"><b>attestation nonce / replay guard</b><span>${a12UiEscape(policy.nonce)} · exact nonce required</span></div><div class="a12-receipt-field"><b>payer / recipient / reviewer</b><span>${a12UiEscape(policy.payer)} · ${a12UiEscape(policy.recipient)} · ${a12UiEscape(policy.reviewer)}</span></div></div></section><section class="a12-inspector-section"><h3>Verified Arc programme evidence · read-only</h3><div class="a12-inspector-note">Arc deployment and token() readback are independently verified programme facts. They do not claim current-release settlement execution, ERP posting or business close. Historical fixture finality thresholds are not a current gate.</div><div class="a12-receipt-grid"><div class="a12-receipt-field"><b>chain_id / contract_address</b><span>${a12UiEscape(evidence.chain_id)} · ${a12UiEscape(evidence.contract_address)}</span></div><div class="a12-receipt-field"><b>tx_hash / receipt_status</b><span>${a12UiEscape(evidence.tx_hash)} · ${a12UiEscape(evidence.receipt_status)}</span></div><div class="a12-receipt-field"><b>block_number / block_hash</b><span>${a12UiEscape(evidence.block_number)} · ${a12UiEscape(evidence.block_hash)}</span></div><div class="a12-receipt-field"><b>token() getter</b><span>${a12UiEscape(evidence.token_getter.selector)} → ${a12UiEscape(evidence.token_getter.return_address)}</span></div><div class="a12-receipt-field"><b>claim boundary</b><span>deployment_readback_only · settlement_execution=false · erp_posting=false · business_close=false</span></div></div></section><section class="a12-inspector-section"><h3>Receipt / finality · local fixture plus verified programme evidence</h3><div class="a12-inspector-note">Expected and observed values stay separate. Current scenario receipts remain local fixture data; no arbitrary confirmation count is used as a current decision gate.</div><div class="a12-receipt-grid">${view.inspector.receiptFields.map((field) => `<div class="a12-receipt-field" data-truth="${a12UiEscape(field.truthClass)}"><b>${a12UiEscape(field.fieldId)}</b><span>${a12UiEscape(a12UiPublicReceiptValue(field.value))} · ${a12UiEscape(a12UiSource(field.source))} · ${a12UiEscape(field.truthClass)}</span></div>`).join("")}</div></section><section class="a12-inspector-section"><h3>Ordered evidence records</h3><div class="a12-object-list">${(view.inspector.logs.length ? view.inspector.logs : [{ type: "Policy / ERC-20 / Arc system records", status: "missing", recordId: "no_observed_receipt", emitter: "missing", logIndex: "missing", amount6: "missing" }]).map((record) => `<div class="a12-object-row"><b>${a12UiEscape(record.type)} · ${a12UiEscape(record.status)}</b><span>emitter ${a12UiEscape(record.emitter ?? record.source ?? "missing")} · logIndex ${a12UiEscape(record.logIndex ?? record.order ?? "missing")} · record ${a12UiEscape(record.recordId ?? "missing")}</span><small>from ${a12UiEscape(record.from ?? record.observed?.from ?? "n/a")} · to ${a12UiEscape(record.to ?? record.observed?.to ?? "n/a")} · amount6/native18 ${a12UiEscape(record.amount6 ?? record.observed?.amount6 ?? record.observed?.amount_native18 ?? "missing")} · block/log order is authoritative</small></div>`).join("")}</div></section><section class="a12-inspector-section"><h3>Fail-closed recovery examples</h3><div class="a12-object-list"><div class="a12-object-row"><b>Wrong network · chainId 5042001 ≠ 5042002</b><span>Reject before receipt evaluation; keep payable OPEN.</span></div><div class="a12-object-row"><b>Policy / blocklist</b><span>Reject before execution; resolve the named policy control.</span></div><div class="a12-object-row"><b>RPC drop / pending</b><span>No final receipt means no settlement result.</span></div><div class="a12-object-row"><b>Final status 0</b><span>Transaction failed; do not classify or close.</span></div><div class="a12-object-row"><b>Status 1 + readback mismatch</b><span>Finality is not business reconciliation; route to recovery.</span></div></div></section>`;
  }
  if (tab === "ERP") {
    const evidence = view.inspector.erpVerifiedEvidence ?? view.verifiedErpEvidence;
    return `<section class="a12-inspector-section"><h3>Verified ERP evidence · read-only</h3><div class="a12-inspector-note">These are privacy-safe owner readbacks. Invoice, submitted payment, reconciled bank transaction and balanced GL are distinct facts; none proves Accounting Period, PCV or business close.</div><div class="a12-receipt-grid"><div class="a12-receipt-field"><b>Purchase Invoice</b><span>${a12UiEscape(evidence.purchase_invoice.selector)} · ${a12UiEscape(evidence.purchase_invoice.supplier)} · ${a12UiEscape(evidence.purchase_invoice.status)}</span></div><div class="a12-receipt-field"><b>Payment Entry</b><span>${a12UiEscape(evidence.payment_entry.selector)} · ${a12UiEscape(evidence.payment_entry.status)} · Pay ${a12UiEscape(evidence.payment_entry.paid_amount)} USD · allocated ${a12UiEscape(evidence.payment_entry.allocated)} · unallocated ${a12UiEscape(evidence.payment_entry.unallocated)}</span></div><div class="a12-receipt-field"><b>Bank Transaction</b><span>${a12UiEscape(evidence.bank_transaction.selector)} · ${a12UiEscape(evidence.bank_transaction.status)} · ${a12UiEscape(evidence.bank_transaction.direction)} ${a12UiEscape(evidence.bank_transaction.amount)} USD</span></div><div class="a12-receipt-field"><b>GL</b><span>debit ${a12UiEscape(evidence.purchase_invoice.gl.total_debit)} = credit ${a12UiEscape(evidence.purchase_invoice.gl.total_credit)} USD · closing ${a12UiEscape(evidence.purchase_invoice.gl.closing)}</span></div><div class="a12-receipt-field"><b>Payment Ledger / close boundary</b><span>Payment Ledger ${a12UiEscape(evidence.payment_ledger.status)} · Accounting Period ${a12UiEscape(evidence.accounting_period.status)} · business close ${a12UiEscape(evidence.business_close.status)} · payment_is_not_close=true</span></div><div class="a12-receipt-field"><b>Historical cancelled entries</b><span>${evidence.cancelled_related_payment_entries.map((row) => `${a12UiEscape(row.selector)} ${a12UiEscape(row.status)}`).join(" · ")}</span></div></div></section><section class="a12-inspector-section"><h3>Projected consequence boundary</h3><div class="a12-object-list">${a12UiObjectMarkup(view.inspector.objects.find((object) => object.objectId === "accounting_consequence"))}</div><div class="a12-boundary"><b>ERP mutation boundary</b>Read-only evidence only; no Frappe mutation, Payment Entry submit, GL write or business-close action is available.</div></section>`;
  }
  if (tab === "Ledger") {
    const fee = view.canvas.networkFee;
    return `<section class="a12-inspector-section"><h3>Ledger / close controls</h3><div class="a12-object-list"><div class="a12-object-row"><b>Principal · ${a12UiEscape(view.canvas.principal)}</b><span>${a12UiEscape(fee.principalUnit)} ${a12UiEscape(view.canvas.amount6)} is separate from ${a12UiEscape(fee.unit)} gas</span><small>Source: typed local fixture</small></div><div class="a12-object-row"><b>Estimated network fee</b><span>${a12UiEscape(fee.estimateDisplay)} · raw ${a12UiEscape(fee.estimate)} · estimate, not quote</span></div><div class="a12-object-row"><b>Maximum network fee</b><span>${a12UiEscape(fee.maximumDisplay)} · raw ${a12UiEscape(fee.maximum)} · capped local budget</span></div><div class="a12-object-row"><b>Effective fee after accepted final fixture</b><span>${a12UiEscape(fee.effectiveDisplay)}${fee.effective ? ` · raw ${a12UiEscape(fee.effective)}` : ""}</span></div><div class="a12-object-row"><b>Balance rule</b><span>principal amount6 balance ${a12UiEscape(fee.principalBalanceAmount6)} ≥ principal ${a12UiEscape(view.canvas.amount6)}: ${String(fee.principalBalanceSufficient)}; native18 gas balance ${a12UiEscape(fee.gasBalanceNative18)} ≥ max fee ${a12UiEscape(fee.maximum)}: ${String(fee.gasBalanceSufficient)}; units remain separate</span><small>Business close remains OPEN</small></div></div></section><section class="a12-inspector-section"><h3>Three close levels</h3><div class="a12-object-list"><div class="a12-object-row"><b>Chain-final</b><span>technical receipt status only</span></div><div class="a12-object-row"><b>Operationally reconciled</b><span>requires ERP readback and matcher evidence</span></div><div class="a12-object-row"><b>Books closed</b><span>requires GL/PLED/outstanding/period controls and separate owner gate</span></div></div></section>`;
  }
  const upstreamCheck = verifyA12C15UpstreamAuthorityObject();
  const auditEvents = view.inspector.audit.length ? view.inspector.audit : [{ time: "initial", actor: "system", object: { label: "Settlement case", status: "opened" }, action: "case opened", result: "read-only local fixture" }];
  return `<section class="a12-inspector-section"><h3>Causation table</h3><div class="a12-table-wrap"><table class="a12-table" id="a12-audit-table"><thead><tr><th>Time</th><th>Actor / object</th><th>Action / result</th></tr></thead><tbody>${auditEvents.map((event) => { const safe = a12UiPublicAuditEvent(event); return `<tr><td>${a12UiEscape(safe.time)}</td><td>${a12UiEscape(safe.actor)}<br>${a12UiEscape(safe.object)}</td><td>${a12UiEscape(safe.action)}<br>${a12UiEscape(safe.result)}</td></tr>`; }).join("")}</tbody></table></div></section><section class="a12-inspector-section"><h3>Evidence provenance</h3><div class="a12-replay"><b>${upstreamCheck.ok ? "Typed producer authority verified" : "Typed authority verification failed closed"}</b><p class="a12-inspector-note">Public view shows the business event, status and recovery only. Internal packet, runtime, producer, handoff and digest identifiers are withheld.</p><small>Read-only adapter · local fixture only · external actions: 0 · live Arc settlement, ERP posting and business close are not claimed.</small></div></section>`;
}

function a12SetDrawerTabbability(inspector, closed) {
  if (!inspector) return;
  inspector.toggleAttribute("inert", closed);
  inspector.setAttribute("aria-hidden", String(closed));
  if (!closed) return;
  for (const node of inspector.querySelectorAll("button,input,select,textarea,[tabindex]")) node.setAttribute("tabindex", "-1");
}

export function a12WorkspacePrimaryMarkup(view, state, queue) {
  const workspace = view.workspace ?? { id: "milestone-desk", title: "Milestone desk", detail: "Work the current settlement decision.", primaryJob: view.canvas.headline };
  const milestoneState = view.canvas.matcherState;
  const statusLabel = view.canvas.matcherState === "matched" ? "Matched" : view.canvas.matcherState === "stale" ? "Stale" : view.canvas.matcherState === "mismatch" ? "Mismatch" : "Pending controls";
  const guide = `<div class="a12-workspace-guide"><img src="assets/gayson-receipt-assistant-reference.png" alt="Gayson task assistant"><div><span class="a12-kicker">Gayson · ${a12UiEscape(workspace.title)}</span><h2>${a12UiEscape(workspace.primaryJob)}</h2><p>${a12UiEscape(workspace.detail)}</p></div></div>`;
  let body = "";
  if (workspace.id === "payables" || workspace.id === "receivables") {
    const rows = queue.filter((row) => row.direction === (workspace.id === "payables" ? "outgoing" : "incoming"));
    body = `<table class="a12-workspace-table" id="${workspace.id === "payables" ? "payables-worklist" : "receivables-worklist"}" tabindex="-1" aria-label="${a12UiEscape(workspace.title)} worklist"><thead><tr><th>Case</th><th>Party</th><th>Principal</th><th>Next control</th></tr></thead><tbody>${rows.map((row) => `<tr data-selected="${String(row.selected)}"><td><b>${a12UiEscape(row.label)}</b><br><small>${a12UiEscape(row.id)}</small></td><td>${a12UiEscape(row.party)}</td><td>${a12UiEscape(row.principal)}</td><td>${a12UiEscape(row.nextOwner)}</td></tr>`).join("")}</tbody></table>`;
  } else if (workspace.id === "reconciliation") {
    const comparisonRows = a12ReconciliationRows(view, state);
    body = `<div id="reconciliation-workbench-root" tabindex="-1"><table class="a12-workspace-table" aria-label="Locked document versus typed receipt comparison"><thead><tr><th>Field</th><th>Locked</th><th>Readback</th><th>Status / source</th></tr></thead><tbody>${comparisonRows.map((field) => `<tr data-first-failure="${String(field.status === "blocking")}" data-selected="${String(field.status === "blocking")}"><td><b>${a12UiEscape(field.field)}</b></td><td>${a12UiEscape(field.locked)}</td><td>${a12UiEscape(field.observed)}</td><td>${a12UiEscape(field.status)}<br><small>${a12UiEscape(field.source)}</small></td></tr>`).join("")}</tbody></table><div class="a12-boundary"><b>First exact blocker</b>${a12UiEscape(comparisonRows.find((row) => row.status === "blocking")?.field ?? "none")} · ${a12UiEscape(view.canvas.recovery)}</div></div>`;
  } else if (workspace.id === "general-ledger") {
    const evidence = view.verifiedErpEvidence;
    const total = a12UiEscape(evidence.purchase_invoice.gl.total_debit);
    body = `<div id="ledger-table" tabindex="-1"><table class="a12-workspace-table" aria-label="Balanced non-posting journal preview"><thead><tr><th>Journal row</th><th>Debit</th><th>Credit</th><th>Evidence</th></tr></thead><tbody><tr><td><b>Supplier payable settlement</b></td><td>${total}</td><td>0.00</td><td>${a12UiEscape(evidence.payment_entry.selector)} · ${a12UiEscape(evidence.payment_entry.status)}</td></tr><tr><td><b>Bank / treasury clearing</b></td><td>0.00</td><td>${total}</td><td>${a12UiEscape(evidence.bank_transaction.selector)} · ${a12UiEscape(evidence.bank_transaction.status)}</td></tr><tr><td><b>Totals</b></td><td>${total}</td><td>${a12UiEscape(evidence.purchase_invoice.gl.total_credit)}</td><td>Balanced read-only proposal</td></tr></tbody></table><div class="a12-boundary"><b>Non-posting boundary</b>${a12UiEscape(view.inspector.consequences.glPled)} · ${a12UiEscape(view.inspector.consequences.close)} · business close remains OPEN.</div></div>`;
  } else if (workspace.id === "audit-trail") {
    const events = view.inspector.audit.length ? view.inspector.audit : [{ time: "initial", actor: "Control service", object: "Settlement case", action: "case opened", result: "read-only local fixture" }];
    body = `<table class="a12-workspace-table" id="audit-log" tabindex="-1" aria-label="Business causation trail"><thead><tr><th>Time</th><th>Actor / object</th><th>Action / result</th></tr></thead><tbody>${events.map((event) => { const safe = a12UiPublicAuditEvent(event); return `<tr><td>${a12UiEscape(safe.time)}</td><td>${a12UiEscape(safe.actor)}<br>${a12UiEscape(safe.object)}</td><td>${a12UiEscape(safe.action)}<br>${a12UiEscape(safe.result)}</td></tr>`; }).join("")}</tbody></table>`;
  } else {
    const milestoneState = view.canvas.matcherState;
    const activeOutcome = ["matched", "stale", "mismatch"].includes(milestoneState) ? milestoneState : "matched";
    const flow = view.canvas.milestoneFlow ?? { step: "primary_action", label: "Review approval decision", enabled: false, reason: "Typed controls required", nextOwner: "operator" };
    const reviewerState = view.canvas.milestoneReviewerAttested ? "verified" : view.canvas.milestoneEvidenceReviewed ? "current" : "held";
    const receiptState = milestoneState === "matched" ? "verified" : ["stale", "mismatch", "reorg", "duplicate"].includes(milestoneState) ? "warning" : view.canvas.milestoneEvidenceReviewed ? "current" : "held";
    const erpState = view.canvas.milestoneErpProposal ? "verified" : milestoneState === "matched" && view.canvas.milestonePayerApproved ? "current" : "blocked";
    const journalState = view.canvas.milestoneJournalPreview ? "verified" : view.canvas.milestoneErpProposal ? "current" : "blocked";
    const steps = [
      ["document", "file-invoice-dollar.svg", "Evidence dossier · Website Handover", `${view.canvas.sourceDocument} · ${view.canvas.contract} · ${view.canvas.counterparty}`, "verified"],
      ["reviewer", "circle-check.svg", "Reviewer attestation", view.canvas.milestoneReviewerAttested ? "Attestation recorded for the local dossier." : "Record the independent reviewer observation.", reviewerState],
      ["arc-receipt", "receipt.svg", "Arc receipt · policy readback", milestoneState === "matched" ? "Typed receipt matches amount, identity and ordered records." : milestoneState === "pending" ? (view.canvas.milestoneEvidenceReviewed ? "Bound evidence reviewed; outcome remains pending until typed evaluation." : "Review the bound receipt fixture before the local controls.") : `${statusLabel} receipt state · recovery required before payable consequence.`, receiptState],
      ["erp-reconciliation", "scale-balanced.svg", "ERP reconciliation · Payment Entry / Bank", view.canvas.milestoneErpProposal ? "Read-only proposal prepared; posting remains a separate owner gate." : `${view.inspector.consequences.paymentEntry}; ${view.inspector.consequences.bankTransaction}`, erpState],
      ["gl-close", "book-open.svg", "General ledger proposal", view.canvas.milestoneJournalPreview ? "Balanced journal preview available; books remain open." : `${view.inspector.consequences.glPled}; business close remains false.`, journalState]
    ];
  body = `<article class="a12-milestone-document" data-testid="milestone-business-document" data-a12-milestone-state="${a12UiEscape(milestoneState)}" aria-label="Business accounting document"><div class="a12-milestone-document-icon"><img src="assets/icons/file-invoice-dollar.svg" alt=""></div><div class="a12-milestone-document-copy"><span class="a12-kicker">Accounting document center</span><h3>Evidence dossier</h3><p><b>${a12UiEscape(view.canvas.counterparty)}</b> · local accounting fixture · payable remains OPEN</p></div><span class="a12-state-pill tone-${a12UiEscape(view.canvas.scenarioTone)}" data-testid="milestone-document-status" aria-label="Document Status">${a12UiEscape(statusLabel)}</span></article><div class="a12-milestone-layout" data-testid="milestone-decision-layout"><div class="a12-milestone-timeline" aria-label="Document to reviewer to Arc receipt to ERP reconciliation to GL close timeline">${steps.map(([stepId,icon,title,detail,status]) => `<div class="a12-milestone-step" data-a12-milestone-step="${stepId}" data-state="${status}"><img src="assets/icons/${icon}" alt=""><div><b>${a12UiEscape(title)}</b><span>${a12UiEscape(detail)}</span></div></div>`).join("")}<div class="a12-milestone-guide-note" data-testid="milestone-gayson-guide"><b>Gayson guide</b><span>${a12UiEscape(flow.reason)} · next owner: ${a12UiEscape(flow.nextOwner)}. Keep the payable open until the next typed control is verified; this local fixture never implies a live post or close.</span></div></div><aside class="a12-milestone-summary" aria-label="Settlement summary, receipt snapshot and decision states"><section class="a12-summary-panel" data-testid="milestone-settlement-summary"><h3>USDC · Arc settlement summary</h3><div class="a12-summary-token"><span class="a12-summary-brands"><img src="assets/brand/usdc-token-official.svg" alt="Official Circle USDC"><img src="assets/brand/arc-logo-navy-official.svg" alt="Official Arc"></span><div><span>Principal</span><b>${a12UiEscape(view.canvas.principal)}</b><small>amount6 ${a12UiEscape(view.canvas.amount6)}</small></div></div><div class="a12-summary-pairs"><div><span>Counterparty</span><b>${a12UiEscape(view.canvas.counterparty)}</b></div><div><span>Open item</span><b>${a12UiEscape(view.canvas.payable)}</b></div><div><span>Source</span><b>${a12UiEscape(view.canvas.sourceDocument)}</b></div><div><span>Network</span><b>${a12UiEscape(view.canvas.network)}</b></div><div><span>Receipt</span><b>${a12UiEscape(statusLabel)}</b></div><div><span>Payable consequence</span><b data-a12-milestone-payable>${a12UiEscape(view.inspector.consequences.outstanding)}</b></div></div></section><section class="a12-summary-panel a12-receipt-snapshot" data-testid="milestone-receipt-snapshot"><h3>Receipt snapshot</h3><p>${a12UiEscape(milestoneState === "matched" ? "Matched local typed receipt" : milestoneState === "pending" ? "Awaiting bound typed receipt evaluation" : `${statusLabel} local receipt`)}</p><span>PolicySettlementV1 · read-only evidence · no chain action</span></section><section class="a12-summary-panel" data-testid="milestone-decision-states" role="radiogroup" aria-labelledby="milestone-decision-heading"><h3 id="milestone-decision-heading">Decision states · recovery</h3><button type="button" class="a12-decision-row${milestoneState === "matched" ? " is-selected" : ""}" data-a12-milestone-outcome="matched" role="radio" tabindex="${milestoneState === "matched" || !["matched","stale","mismatch"].includes(milestoneState) ? "0" : "-1"}" aria-checked="${String(milestoneState === "matched")}" aria-label="Evaluate matched receipt state"><b>Matched</b><span>${milestoneState === "matched" ? "Receipt agrees with the locked document." : "Evaluate the bound typed receipt before approvals."}</span></button><button type="button" class="a12-decision-row${milestoneState === "stale" ? " is-selected" : ""}" data-a12-milestone-outcome="stale" role="radio" tabindex="${milestoneState === "stale" ? "0" : "-1"}" aria-checked="${String(milestoneState === "stale")}" aria-label="Evaluate stale receipt state"><b>Stale</b><span>Payable stays OPEN · reviewer refreshes the evidence TTL.</span></button><button type="button" class="a12-decision-row${milestoneState === "mismatch" ? " is-selected" : ""}" data-a12-milestone-outcome="mismatch" role="radio" tabindex="${milestoneState === "mismatch" ? "0" : "-1"}" aria-checked="${String(milestoneState === "mismatch")}" aria-label="Evaluate mismatched receipt state"><b>Mismatch</b><span>Payable stays OPEN · reconciliation inspects the exact receipt identity.</span></button></section></aside></div>`;
  }
  return `<section class="a12-workspace-primary" data-a12-workspace-primary="${a12UiEscape(workspace.id)}" aria-label="${a12UiEscape(workspace.title)} primary workspace">${guide}${body}</section>`;
}

export function a12UiMarkup(view, state) {
  const queue = a12UiFilteredQueue(view, state);
  const drawerOpen = state.inspectorOpen === true;
  const drawerClosed = !drawerOpen;
  const backgroundInert = drawerOpen ? " inert" : "";
  const inspectorRole = drawerOpen ? ' role="dialog" aria-modal="true" aria-labelledby="a12-inspector-heading" data-a12-modal="true"' : "";
  const metrics = a12RuntimeLayoutMetrics(globalThis.innerWidth ?? 1440, globalThis.innerHeight ?? 768, globalThis.__A12_ZOOM ?? 1);
  const commandLayout = a12CommandRegionLayout(globalThis.innerWidth ?? 1440, globalThis.__A12_ZOOM ?? 1);
  const navItems = A12_ERP_WORKSPACE_IDS.map((id) => [id, WORKSPACE_CONTRACT[id]?.area ?? a12UiLabel(id)]);
  const isMilestoneDesk = view.workspace.id === "milestone-desk";
  const milestonePrimary = isMilestoneDesk ? (view.canvas.milestoneFlow ?? { label: "Review approval decision", enabled: false, reason: "Typed controls required", nextOwner: "operator" }) : null;
  const primaryReason = milestonePrimary ? milestonePrimary.reason : (view.canvas.command.enabled ? view.canvas.command.mutation_boundary : view.canvas.command.disabledReason);
  const originEntryMarkup = `<details class="a12-disclosure a12-source-disclosure" data-a12-disclosure="source"><summary>Source &amp; accounting <span>origin and classification</span></summary><div class="a12-disclosure-body"><fieldset class="a12-origin-entry" data-a12-origin-classification aria-label="Observed transfer classification"><legend>Transfer origin · accepted authority</legend><p class="a12-origin-entry-note">Choose a bound product entry. Origin is read-only from the accepted authority; choosing an entry resets dependent state.</p><div class="a12-origin-entry-options">${A12_ORIGIN_ENTRY_IDS.map((origin) => { const entry = A12_ORIGIN_ENTRY_CATALOG[origin]; const active = view.originEntry?.origin === origin; return `<button type="button" class="a12-origin-entry-option${active ? " is-active" : ""}" data-a12-origin-entry="${a12UiEscape(origin)}" data-a12-origin-scenario="${a12UiEscape(entry?.scenario ?? "")}" data-a12-origin-authority="${a12UiEscape(entry?.authorityId ?? "")}" aria-pressed="${String(active)}"><span>${a12UiEscape(A12_ORIGIN_LABELS[origin])}</span><small>${a12UiEscape(entry?.scenario ?? "accepted authority unavailable")}</small></button>`; }).join("")}</div><div class="a12-origin-entry-bound" data-a12-origin-bound><b>Bound:</b> ${a12UiEscape(view.originEntry?.label ?? "Unknown origin")} · ${a12UiEscape(view.originEntry?.scenario ?? "no accepted scenario")}</div></fieldset></div></details>`;
  const commandMarkup = isMilestoneDesk ? "" : `<section class="a12-command" data-landmark="stage-command-bar" data-command-layout="${commandLayout.mode}" data-command-text-width="${commandLayout.estimatedTextWidthPx}" data-command-overlap-risk="${String(commandLayout.overlapRisk)}" aria-label="Stage-aware command bar"><div><h2>First blocking fact · ${a12UiEscape(view.canvas.command.enabled ? view.canvas.firstFailure : view.canvas.command.disabledReason)}</h2><p>${a12UiEscape(view.canvas.recovery)}</p><small>Consequence: ${a12UiEscape(view.canvas.command.mutation_boundary)} · next owner: ${a12UiEscape(view.canvas.command.next_owner)} · no external mutation</small></div><div class="a12-command-actions"><button type="button" class="a12-primary" data-a12-primary ${view.canvas.command.enabled ? "" : "disabled aria-disabled=\"true\" title=\"" + a12UiEscape(view.canvas.command.disabledReason) + "\""}>${a12UiEscape(view.canvas.command.label)}<small>${a12UiEscape(view.canvas.command.enabled ? view.canvas.command.mutation_boundary : view.canvas.command.disabledReason)}</small></button><button type="button" class="a12-secondary" data-a12-open-inspector aria-controls="a12-evidence-inspector" aria-expanded="${String(state.inspectorOpen)}">Inspect ${a12UiEscape(view.inspector.activeTab)} evidence</button></div></section>`;
  const statusMarkup = isMilestoneDesk ? "" : `<div class="a12-status-strip tone-${a12UiEscape(view.canvas.scenarioTone)}" data-landmark="status-recovery"><div><h2>Current state · ${a12UiEscape(view.canvas.scenarioState)}</h2><p>${a12UiEscape(view.canvas.recovery)}</p></div><div class="a12-status-meta"><span>Next owner</span><b>${a12UiEscape(view.canvas.command.next_owner)}</b></div></div>`;
  const fieldsMarkup = `<details class="a12-disclosure a12-fields-disclosure${isMilestoneDesk ? " a12-milestone-supporting-detail" : ""}" data-a12-disclosure="fields"><summary id="a12-fields-heading">${isMilestoneDesk ? "Typed field review" : "Typed decision fields"} <span>source, editability and truth class</span></summary><div class="a12-disclosure-body"><p class="a12-section-intro">Required keys come from the accepted read-only scenario projection. Expand only when the next decision requires a field-level review.</p><dl class="a12-field-grid">${view.canvas.fields.map(a12UiFieldMarkup).join("")}</dl></div></details>`;
  const consequenceMarkup = `<details class="a12-disclosure" data-a12-disclosure="consequence"><summary id="a12-consequence-heading">Accounting consequence preview <span>read-only boundary</span></summary><div class="a12-disclosure-body"><p class="a12-section-intro">A chain observation is one input to accounting; it is not an ERP post or business close.</p><div class="a12-consequence-grid"><div class="a12-consequence"><b>Payment Entry</b><span>${a12UiEscape(view.inspector.consequences.paymentEntry)}</span></div><div class="a12-consequence"><b>Bank Transaction</b><span>${a12UiEscape(view.inspector.consequences.bankTransaction)}</span></div><div class="a12-consequence"><b>GL / PLED</b><span>${a12UiEscape(view.inspector.consequences.glPled)}</span></div><div class="a12-consequence"><b>Outstanding</b><span>${a12UiEscape(view.inspector.consequences.outstanding)}</span></div></div><div class="a12-boundary"><b>Close boundaries stay separate</b>${a12UiEscape(view.inspector.consequences.close)}</div></div></details>`;
  const causalMarkup = `<details class="a12-disclosure a12-rail-disclosure" data-a12-disclosure="causal"${state.selectedStage !== "source" ? " open" : ""}><summary id="a12-causal-heading">Causal timeline <span>7 guarded stages · navigation does not complete work</span></summary><div class="a12-disclosure-body"><ol class="a12-causal" data-landmark="causal-rail" aria-label="Seven-stage causal rail">${view.causalRail.map((stage, index) => `<li><button type="button" class="a12-causal-stage" id="workflow-step-${index}" data-a12-stage="${a12UiEscape(stage.id)}" data-status="${a12UiEscape(stage.status)}" aria-current="${stage.status === "current" ? "step" : "false"}"><strong>${index + 1}. ${a12UiEscape(stage.label)}</strong><span>${a12UiEscape(stage.verb)}</span><small>${a12UiEscape(stage.status)} · ${a12UiEscape(stage.nextOwner)}</small></button></li>`).join("")}</ol></div></details>`;
  const supportingMarkup = isMilestoneDesk ? fieldsMarkup : `${fieldsMarkup}${consequenceMarkup}${causalMarkup}`;
  return `<div class="a12-app" data-current-workspace="${a12UiEscape(view.workspace.id)}" data-evidence-level="${a12UiEscape(view.evidenceLevel)}" data-runtime-viewport="${metrics.viewport}" data-navigation-width="${metrics.navigation}" data-queue-width="${metrics.queue}" data-inspector-width="${metrics.inspector}" data-inspector-mode="${metrics.inspectorMode}" data-overflow-x="${metrics.overflowX}" data-overflow-y="${metrics.overflowY}" data-text-floor-px="${metrics.textFloorPx}" data-zoom-percent="${metrics.zoomPercent}">
    <aside class="a12-nav"${backgroundInert} aria-label="ERP settlement workspace navigation"><div class="a12-brand"><img src="assets/gayson-lion-brand-reference.png" alt="Gayson"><div><b>Gayson</b><span>Settlement control</span></div></div><p class="a12-nav-label">ERP workspaces</p><nav class="a12-nav-list">${navItems.map(([id,label]) => `<button type="button" data-a12-workspace="${a12UiEscape(id)}" aria-label="${a12UiEscape(label)}" aria-current="${String((state.selectedWorkspace ?? "milestone-desk") === id)}"><img src="${a12UiIcon(id)}" alt=""><span>${a12UiEscape(label)}</span></button>`).join("")}</nav><div class="a12-nav-boundary"><b>LOCAL FIXTURE</b><small>No wallet, RPC, ERP, deploy, publish or Encode action.</small></div></aside>
    <header class="a12-shell"${backgroundInert} data-landmark="global-control-shell" aria-label="Global control shell"><span class="a12-shell-title">Settlement workbench</span><span class="a12-shell-status"><i class="a12-dot neutral"></i><b>Environment</b> Local fixture</span><span class="a12-shell-status"><b>Arc</b> Testnet · chainId 5042002</span><span class="a12-shell-status"><b>Company</b> Gayson Labs Pte Ltd</span><span class="a12-shell-status"><b>Treasury</b> ${a12UiEscape(view.shell.treasury)}</span><span class="a12-shell-status"><b>ERP</b> ${a12UiEscape(view.shell.erpFreshness)}</span><span class="a12-shell-status"><b>Role</b> ${a12UiEscape(view.shell.role)}</span></header>
    <main class="a12-main"><div class="a12-breadcrumb"${backgroundInert}><span>${a12UiEscape(view.workspace.title)} / <b>${a12UiEscape(view.canvas.scenario)}</b> / ${a12UiEscape(view.canvas.sourceDocument)}</span><button type="button" class="a12-inspector-open" data-a12-open-inspector aria-controls="a12-evidence-inspector" aria-expanded="${String(state.inspectorOpen)}">Open evidence inspector</button></div><div class="a12-workbench">
      <section class="a12-queue"${backgroundInert} data-landmark="case-queue" aria-labelledby="a12-queue-heading"><div class="a12-panel-head"><div><h2 id="a12-queue-heading">Case queue</h2><p>Direction, party, principal, evidence and next owner.</p></div><span class="a12-count">${queue.length}/${A12_SCENARIO_IDS.length}</span></div><div class="a12-queue-tools"><input type="search" aria-label="Search settlement cases" placeholder="Search party or source" data-a12-search value="${a12UiEscape(state.searchQuery ?? "")}"><div class="a12-filter-row">${["all", "incoming", "outgoing", "exceptions"].map((filter) => `<button type="button" data-a12-filter="${filter}" aria-pressed="${String(state.queueFilter === filter)}">${a12UiLabel(filter)}</button>`).join("")}</div></div><div class="a12-queue-list" role="listbox" aria-label="Settlement cases">${queue.map((row) => `<button type="button" class="a12-queue-row" data-a12-scenario="${a12UiEscape(row.id)}" role="option" aria-selected="${String(row.selected)}"><span class="a12-direction ${row.direction === "incoming" ? "in" : row.direction === "outgoing" ? "out" : "unresolved"}">${row.direction === "incoming" ? "IN" : row.direction === "outgoing" ? "OUT" : "?"}</span><span><b>${a12UiEscape(row.label)}</b><small>${a12UiEscape(row.party)} · ${a12UiEscape(row.id)}</small><span class="a12-queue-meta"><strong>${a12UiEscape(row.principal)}</strong><span>${a12UiEscape(row.nextOwner)}</span></span></span></button>`).join("")}</div><div class="a12-unresolved"><b>Unresolved is selectable</b>${a12UiEscape(view.unresolved.reason)}<br><small>Selection resets every dependent field, evidence and downstream state.</small></div></section>
      <section class="a12-canvas"${backgroundInert} data-landmark="decision-canvas" id="a12-decision-canvas" aria-labelledby="a12-task-heading"><div class="a12-case-header"><span class="a12-kicker">${isMilestoneDesk ? "Website Handover · Milestone Close" : `${a12UiEscape(view.canvas.scenario)} · ${a12UiEscape(view.canvas.counterparty)}`}</span><h1 id="a12-task-heading" tabindex="-1">${a12UiEscape(view.canvas.headline)}</h1><p class="a12-case-copy">${isMilestoneDesk ? "One accounting document from dossier through receipt evaluation and ERP proposal. Local fixture values are not live evidence." : "One decision canvas for source, typed fields, consequence and next owner. Local fixture values are not live evidence."}</p><div class="a12-object-line"><button type="button" class="a12-object-ref" data-a12-object="case"><span>Case</span><b>${a12UiEscape(view.canvas.caseId)}</b></button><button type="button" class="a12-object-ref" data-a12-object="source"><span>Source</span><b>${a12UiEscape(view.canvas.sourceDocument)}</b></button>${isMilestoneDesk ? `<button type="button" class="a12-object-ref" data-a12-object="contract"><span>Contract</span><b>${a12UiEscape(view.canvas.contract)}</b></button><button type="button" class="a12-object-ref" data-a12-object="payable"><span>Payable</span><b>${a12UiEscape(view.canvas.payable)}</b></button>` : ""}<button type="button" class="a12-object-ref" data-a12-object="origin"><span>Authority origin</span><b>${a12UiEscape(view.canvas.origin ?? "unknown")}</b></button><button type="button" class="a12-object-ref" data-a12-object="principal"><span>Principal</span><b>${a12UiEscape(view.canvas.principal)}</b></button></div><div class="a12-object-summary" aria-label="Settlement summary"><div><span>Counterparty</span><b>${a12UiEscape(view.canvas.counterparty)}</b></div><div><span>Open item</span><b>${a12UiEscape(isMilestoneDesk ? view.canvas.payable : view.canvas.sourceDocument)}</b></div><div><span>${isMilestoneDesk ? "Principal" : "Amount"}</span><b>${a12UiEscape(view.canvas.principal)}</b></div><div><span>${isMilestoneDesk ? "Status" : "Current state"}</span><b class="a12-state-pill tone-${a12UiEscape(view.canvas.scenarioTone)}">${a12UiEscape(isMilestoneDesk && view.canvas.matcherState === "matched" ? "Matched" : isMilestoneDesk && view.canvas.matcherState === "stale" ? "Stale" : isMilestoneDesk && view.canvas.matcherState === "mismatch" ? "Mismatch" : view.canvas.scenarioState)}</b></div></div>${originEntryMarkup}</div>
        ${a12WorkspacePrimaryMarkup(view, state, queue)}
        ${commandMarkup}
        ${statusMarkup}
        ${supportingMarkup}
        <section class="a12-bottom-action" data-landmark="bottom-action-bar" aria-label="Decision next step"><div><span class="a12-kicker">Next step</span><strong>${a12UiEscape(milestonePrimary?.label ?? view.canvas.command.label)}</strong><p>${a12UiEscape(primaryReason)} · owner: ${a12UiEscape(milestonePrimary?.nextOwner ?? view.canvas.command.next_owner)}</p></div><button type="button" class="a12-primary" data-a12-primary${isMilestoneDesk ? " data-a12-milestone-primary" : ""} ${((milestonePrimary?.enabled ?? view.canvas.command.enabled) ? "" : "disabled aria-disabled=\"true\" title=\"" + a12UiEscape(primaryReason) + "\"")}>${a12UiEscape(milestonePrimary?.label ?? view.canvas.command.label)}</button></section>
        <div class="a12-section"><button type="button" class="a12-inline-action" id="open-gayson-evidence" data-a12-open-inspector aria-controls="a12-evidence-inspector">Open current evidence inspector →</button><div id="a12-live-region" class="a12-live" role="status" aria-live="polite">${a12UiEscape(state.lastNotice || "Local fixture loaded; no live Arc or ERP gate is claimed.")}</div></div>
      </section>
      <aside class="a12-inspector ${state.inspectorOpen ? "is-open" : ""}"${inspectorRole}${drawerClosed ? " inert" : ""} data-landmark="evidence-inspector" id="a12-evidence-inspector" tabindex="-1" aria-label="Evidence and consequence inspector" aria-hidden="${String(drawerClosed)}"><div class="a12-inspector-head"><div><h2 id="a12-inspector-heading">Evidence inspector</h2><p>Business → Arc → ERP → Ledger → Audit objects.</p></div><button type="button" class="a12-inspector-close" data-a12-close-inspector aria-label="Close evidence inspector">×</button></div><div class="a12-tabs" role="tablist" aria-label="Inspector tabs">${A12_C15_TABS.map((tab) => `<button type="button" role="tab" data-a12-tab="${a12UiEscape(tab)}" aria-selected="${String(state.inspectorTab === tab)}">${a12UiEscape(tab)}</button>`).join("")}</div>${a12UiInspectorMarkup(view, state)}</aside>
    </div></main>
  </div>`;
}

export function a12RuntimeLayoutMetrics(width, height, zoom = 1) {
  const viewport = width <= 1050 ? "1024x768" : width <= 1310 ? "1280x800" : "1440x1024";
  const oracle = A12_C15_VIEWPORT_ORACLE[viewport];
  return {
    viewport,
    height,
    navigation: oracle.navigation,
    queue: oracle.queue,
    inspector: 0,
    inspectorMode: viewport === "1024x768" ? "focus_trapped_drawer" : "drawer",
    overflowX: "none",
    overflowY: "scrollable",
    textFloorPx: 16,
    zoomPercent: Math.round(Number(zoom) * 100)
  };
}

export function a12CommandRegionLayout(width, zoom = 1) {
  const viewportWidth = Math.max(320, Number(width) || 1440);
  const mode = viewportWidth <= 1600 ? "stacked" : "inline";
  const metrics = a12RuntimeLayoutMetrics(viewportWidth, 768, zoom);
  const navigation = viewportWidth <= 720 ? 0 : metrics.navigation;
  const queue = viewportWidth <= 720 ? 0 : metrics.queue;
  const inspector = viewportWidth <= 1050 ? 0 : metrics.inspector;
  const mainGutter = viewportWidth <= 720 ? 24 : 40;
  const canvasPadding = viewportWidth <= 720 ? 32 : 44;
  const commandChrome = 32;
  const commandInnerWidthPx = Math.max(0, Math.floor(viewportWidth - navigation - queue - inspector - mainGutter - canvasPadding - commandChrome - 2));
  const estimatedTextWidthPx = mode === "stacked" ? commandInnerWidthPx : Math.max(0, commandInnerWidthPx - 320);
  return {
    mode,
    viewportWidth,
    zoomPercent: Math.round(Number(zoom) * 100),
    commandInnerWidthPx,
    estimatedTextWidthPx,
    actionsWrap: true,
    titleWrap: "anywhere",
    overlapRisk: estimatedTextWidthPx < 240
  };
}

export function mountA12DeepWorkbench(root = null, { initialHash = globalThis.location?.hash ?? "" } = {}) {
  const host = root?.nodeType ? root : document.querySelector(".app");
  if (!host) return null;
  a12UiStyles();
  host.className = "a12-root";
  let state = createA12WorkbenchState();
  const route = parseA12WorkbenchRoute(initialHash);
  if (route) state = reduceA12Workbench(state, { type: "RESTORE_ROUTE", workspace: route.workspace, scenario: route.scenario, origin: route.origin, stage: route.stage, tab: route.tab, searchQuery: route.searchQuery });
  const focusAfterRender = (selector) => requestAnimationFrame(() => {
    const node = selector ? document.querySelector(selector) : document.querySelector(`[data-a12-scenario="${state.selectedScenario}"]`);
    node?.focus({ preventScroll: true });
  });
  const render = (focusSelector = null, updateRoute = true) => {
    const view = projectA12Workbench(state);
    host.innerHTML = a12UiMarkup(view, state);
    host.querySelectorAll("[data-a12-workspace]").forEach((control) => {
      const active = (state.selectedWorkspace ?? "milestone-desk") === control.dataset.a12Workspace;
      control.setAttribute("aria-current", active ? "page" : "false");
    });
    a12SetDrawerTabbability(host.querySelector("#a12-evidence-inspector"), !state.inspectorOpen);
    if (updateRoute && globalThis.history && globalThis.location) {
      const nextHash = a12WorkbenchRoute(state);
      if (globalThis.location.hash !== nextHash) globalThis.history.replaceState({}, "", nextHash);
    }
    focusAfterRender(focusSelector);
  };
  const act = (action, focusSelector = null) => {
    state = reduceA12Workbench(state, action);
    render(focusSelector);
  };
  host.addEventListener("click", (event) => {
    const target = event.target.closest("[data-a12-workspace],[data-a12-scenario],[data-a12-stage],[data-a12-tab],[data-a12-filter],[data-a12-primary],[data-a12-milestone-primary],[data-a12-milestone-outcome],[data-a12-open-inspector],[data-a12-close-inspector],[data-a12-object],[data-a12-edit-select],[data-a12-origin-entry]");
    if (!target || !host.contains(target)) return;
    if (target.dataset.a12Workspace) return act({ type: "SET_WORKSPACE", workspace: target.dataset.a12Workspace }, a12WorkspaceFocusTarget(target.dataset.a12Workspace));
    if (target.dataset.a12Scenario) return act({ type: "SELECT_SCENARIO", scenario: target.dataset.a12Scenario }, `[data-a12-scenario="${target.dataset.a12Scenario}"]`);
    if (target.dataset.a12OriginEntry) return act({ type: "SELECT_ORIGIN_ENTRY", origin: target.dataset.a12OriginEntry, scenario: target.dataset.a12OriginScenario, authorityId: target.dataset.a12OriginAuthority }, "#a12-task-heading");
    if (target.dataset.a12Stage) return act({ type: "SET_STAGE", stage: target.dataset.a12Stage }, `#workflow-step-${A12_UI_STAGE_IDS.indexOf(target.dataset.a12Stage)}`);
    if (target.dataset.a12Tab) return act({ type: "SET_INSPECTOR_TAB", tab: target.dataset.a12Tab }, `[data-a12-tab="${target.dataset.a12Tab}"]`);
    if (target.dataset.a12Filter) return act({ type: "SET_QUEUE_FILTER", filter: target.dataset.a12Filter });
    if (target.dataset.a12MilestoneOutcome) return act({ type: "SELECT_MILESTONE_OUTCOME", outcome: target.dataset.a12MilestoneOutcome }, `[data-a12-milestone-outcome="${target.dataset.a12MilestoneOutcome}"]`);
    if (target.hasAttribute("data-a12-milestone-primary")) return act({ type: "MILESTONE_PRIMARY_ACTION" }, "[data-a12-milestone-primary]");
    if (target.hasAttribute("data-a12-primary")) return act({ type: "PRIMARY_ACTION" }, "[data-a12-primary]");
    if (target.hasAttribute("data-a12-open-inspector")) return act({ type: "OPEN_INSPECTOR" }, "#a12-evidence-inspector");
    if (target.hasAttribute("data-a12-close-inspector")) return act({ type: "CLOSE_INSPECTOR" }, "[data-a12-open-inspector]");
    if (target.dataset.a12EditSelect) return act({ type: "EDIT_FIELD", fieldId: target.dataset.a12EditSelect, value: "operator-selected-candidate" }, `[data-a12-edit-select="${target.dataset.a12EditSelect}"]`);
    if (target.dataset.a12Object) { state = reduceA12Workbench(state, { type: "OPEN_INSPECTOR" }); state = reduceA12Workbench(state, { type: "SET_INSPECTOR_TAB", tab: target.dataset.a12Object === "principal" ? "Ledger" : target.dataset.a12Object === "source" ? "Business" : "Arc" }); return render("#a12-evidence-inspector"); }
  });
  host.addEventListener("change", (event) => {
    const target = event.target.closest("[data-a12-edit]");
    if (target) act({ type: "EDIT_FIELD", fieldId: target.dataset.a12Edit, value: target.value }, `[data-a12-edit="${target.dataset.a12Edit}"]`);
  });
  host.addEventListener("input", (event) => {
    const search = event.target.closest("[data-a12-search]");
    if (!search) return;
    act({ type: "SET_SEARCH_QUERY", query: search.value });
  });
  host.addEventListener("keydown", (event) => {
    const outcome = event.target.closest?.("[data-a12-milestone-outcome]");
    if (outcome && ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const radios = [...host.querySelectorAll("[data-a12-milestone-outcome]")];
      const nextOutcome = a12MilestoneOutcomeFromKey(radios.map((radio) => radio.dataset.a12MilestoneOutcome), outcome.dataset.a12MilestoneOutcome, event.key);
      const next = radios.find((radio) => radio.dataset.a12MilestoneOutcome === nextOutcome);
      act({ type: "SELECT_MILESTONE_OUTCOME", outcome: next.dataset.a12MilestoneOutcome }, `[data-a12-milestone-outcome="${next.dataset.a12MilestoneOutcome}"]`);
      return;
    }
    if (event.key === "Tab" && state.inspectorOpen) {
      const inspector = host.querySelector("#a12-evidence-inspector");
      const focusable = [...(inspector?.querySelectorAll("button,input,select,textarea,[tabindex]:not([tabindex='-1'])") ?? [])].filter((node) => !node.disabled && node.tabIndex >= 0 && node.getAttribute("aria-hidden") !== "true" && !node.hasAttribute("inert"));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeFocusable = focusable.includes(document.activeElement);
      if (first && last && (event.shiftKey ? document.activeElement === first || !activeFocusable : document.activeElement === last || !activeFocusable)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
    }
    const row = event.target.closest("[data-a12-scenario]");
    if (row && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      const filtered = a12UiFilteredQueue(projectA12Workbench(state), state);
      const index = filtered.findIndex((item) => item.id === row.dataset.a12Scenario);
      const nextIndex = event.key === "ArrowDown" ? Math.min(filtered.length - 1, index + 1) : Math.max(0, index - 1);
      if (filtered[nextIndex]) act({ type: "SELECT_SCENARIO", scenario: filtered[nextIndex].id }, `[data-a12-scenario="${filtered[nextIndex].id}"]`);
    }
    if (event.key === "Escape" && state.inspectorOpen) act({ type: "CLOSE_INSPECTOR" }, "[data-a12-open-inspector]");
  });
  globalThis.addEventListener("hashchange", () => {
    const nextRoute = parseA12WorkbenchRoute(globalThis.location.hash);
    if (!nextRoute) return;
    state = reduceA12Workbench(state, { type: "RESTORE_ROUTE", workspace: nextRoute.workspace, scenario: nextRoute.scenario, origin: nextRoute.origin, stage: nextRoute.stage, tab: nextRoute.tab, searchQuery: nextRoute.searchQuery });
    render(null, false);
  });
  render(null, true);
  return { getState: () => a12UiClone(state), render, act, verifyReplay: () => verifyA12C15UpstreamAuthorityObject() };
}
