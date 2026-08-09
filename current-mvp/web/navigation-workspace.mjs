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
      ["Attestation", state.attested ? "Recorded fixture" : "Awaiting review", "assets/icons/circle-check.svg"],
      ["Circle USDC / Arc", result.receiptState === "not evaluated" ? "Not evaluated" : result.receiptState, "assets/brand/usdc-token-official.svg"],
      ["ERP decision", doc.railStatus, "assets/icons/scale-balanced.svg"],
      ["GL proposal", accounting.journal.status.replaceAll("_", " "), "assets/icons/book-open.svg"]
    ];
    return `<section class="workspace-product-shell workspace-compact-shell workspace-${id}" aria-label="${WORKSPACE_CONTRACT[id].area} working context">
      <div class="workspace-compact-guide"><img src="assets/gayson-receipt-assistant-reference.png" alt="Gayson task assistant"><div><span class="eyebrow">Gayson · task guide</span><b>${workspaceGuide.title}</b><p>${workspaceGuide.copy}</p>${button("Focus current task", `data-workspace-focus="${workspaceGuide.target}"`)}</div></div>
      <div class="workspace-compact-object"><img src="assets/icons/${documentIcon(doc)}" alt=""><div><span class="eyebrow">Active document</span><b>${accounting.profile.documentNumber} · ${doc.noun}</b><small>${accounting.profile.counterpartyClass} · ${doc.amount} · ${doc.payer} → ${doc.recipient}</small></div><span class="state-chip ${result.receiptState === "matched" ? "good" : result.receiptState === "not evaluated" ? "" : "warn"}">${result.receiptState === "not evaluated" ? "Not evaluated" : result.receiptLabel}</span></div>
      <div class="workspace-compact-rail" aria-label="Document, attestation, Circle USDC / Arc receipt, ERP decision and general-ledger proposal">${compactNodes.map(([label,value,icon],index) => `<div class="compact-node compact-node-${index}">${index===2?'<span class="compact-receipt-brand"><img src="assets/brand/usdc-token-official.svg" alt="Official Circle USDC"><img src="assets/brand/arc-logo-navy-official.svg" alt="Official Arc"></span>':`<img src="${icon}" alt="">`}<span>${label}</span><b>${index===2?`${value} · Arc Testnet 5042002`:value}</b></div>`).join("")}</div>
    </section>`;
  }
  const focusId = !state.attested || !state.approved ? "primary-action" : WORKSPACE_CONTRACT[id].focusId;
  const isException = result.key === "stale" || result.key === "mismatch";
  const accepted = result.receiptState === "matched";
  const guidance = !state.attested
    ? "Reviewer attestation is the first local condition. It is distinct from payer approval and does not release funds."
    : !state.approved
      ? `Reviewer evidence is recorded. Review the separate exact ${doc.amount} approval fixture next.`
      : doc.guidance.replace(/^Gayson:\s*/, "");
  const task = {
    payables: "Classify an outgoing item, inspect its original relationship, then send the selected document to the matcher.",
    receivables: "Classify an incoming customer item with its purpose and original-document rule before reconciliation.",
    reconciliation: "Compare the locked document to the typed logical payment and isolate the first exact failing field.",
    "general-ledger": "Review the balanced, document-aware journal proposal and retain its non-postable boundary.",
    "audit-trail": "Trace the causal decision history and inspect the evidence or recovery attached to each state transition."
  }[id] ?? "Work the selected milestone document.";
  const gAction = !state.attested ? "Record reviewer attestation" : !state.approved ? "Review approval decision" : isException ? (result.key === "stale" ? "Inspect freshness recovery" : "Inspect receipt mismatch") : id === "reconciliation" ? "Inspect comparison fields" : "Locate current task";
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
      <div class="rail-node attestation-node"><img src="assets/icons/circle-check.svg" alt=""><span>Attestation</span><b>${state.attested ? "Recorded fixture" : "Awaiting review"}</b></div>
      <div class="rail-link" aria-hidden="true"></div>
      <div class="rail-node receipt-node"><span class="rail-brand"><img src="assets/brand/usdc-token-official.svg" alt="Official Circle USDC"><img src="assets/brand/arc-logo-navy-official.svg" alt="Official Arc"></span><span>Typed receipt</span><b>Arc Testnet · 5042002</b></div>
      <div class="rail-link" aria-hidden="true"></div>
      <div class="rail-node erp-node"><img src="assets/icons/scale-balanced.svg" alt=""><span>ERP decision</span><b>${doc.railStatus}</b></div>
      <div class="rail-link" aria-hidden="true"></div>
      <div class="rail-node journal-node"><img src="assets/icons/book-open.svg" alt=""><span>GL proposal</span><b>${accounting.journal.status.replaceAll("_", " ")}</b></div>
    </div>
  </section>`;
}

export function canvasMarkup(id, { accounting, document: doc, result, view, state }) {
  const isSelected = (profile, purpose) => state.accountingPreset === profile && (!purpose || state.receiptPurpose === purpose);
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
    const pendingControl = state.attested
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
    const lifecycle = [["Condition", state.attested ? "complete" : "current"], ["Receipt", result.receiptState === "matched" ? "complete" : pending ? "current" : "blocked"], ["ERP decision", result.receiptState === "matched" ? "complete" : pending ? "current" : "blocked"], ["Readback", result.receiptState === "matched" ? "complete" : pending ? "current" : "blocked"]];
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
      ["09:28", "Reviewer", state.attested ? "Attested" : "Pending", "Evidence condition", "evidence"],
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

export function createWorkspaceController({ state, current, render, openDrawer, openAuditDetail, closeDrawers, $, $$ }) {
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
      const inspector = `<aside class="worklist-inspector ${result.receiptState === "matched" ? "ready" : "blocked"}" aria-label="Selected ${outgoing ? "outgoing" : "incoming"} document inspector"><div><span class="eyebrow">Selected ${outgoing ? "outgoing" : "incoming"} inspector</span><b>${accounting.profile.documentNumber} · ${doc.noun}</b><p>${outgoing ? `${doc.payer} → ${doc.recipient}` : `Customer → treasury: ${doc.payer} → ${doc.recipient}`} · amount6 ${doc.amount6}</p></div><dl><div><dt>Original / source</dt><dd>${doc.source}</dd></div><div><dt>${outgoing ? "Matcher / open item" : "Purpose / open item"}</dt><dd>${outgoing ? result.receiptState : doc.purpose} · ${doc.railStatus}</dd></div><div><dt>${outgoing ? "Exception" : "Refund / original rule"}</dt><dd>${outgoing ? accounting.exception : accounting.profile.requiresOriginal ? "Original receipt and refundable ceiling required" : "Purpose is bound to the selected customer object"}</dd></div></dl>${button(outgoing ? "Inspect outgoing source" : "Inspect customer source", 'data-workspace-action="source"')}${button(outgoing ? "Inspect local exception" : "Inspect purpose recovery", `data-workspace-action="${result.key === "stale" ? "evidence" : "accounting"}"`)}</aside>`;
      canvas.insertAdjacentHTML("beforeend", inspector.replace("</aside>", `${outgoing ? button("Open selected journal", 'data-workspace-action="journal" data-testid="selected-profile-journal" aria-label="Open selected profile journal"') : ""}</aside>`));
      if (!outgoing && accounting.profile.id === "receipt_refund") {
        const direction = canvas.querySelector(".worklist-inspector p");
        if (direction) direction.textContent = `Treasury → customer: ${doc.payer} → ${doc.recipient} · amount6 ${doc.amount6}`;
      }
    }
    if (id === "general-ledger" || id === "audit-trail") {
      const { accounting, document: doc, result, view } = current();
      const auditCausalBreak = result.key === "stale"
        ? "validUntil / TTL"
        : result.key === "mismatch"
          ? "receipt readback identity"
          : result.receiptState === "not evaluated"
            ? state.attested ? "separate payer approval" : "reviewer attestation"
            : "none";
      const detail = id === "general-ledger"
        ? `<aside class="worklist-inspector ledger-inspector" aria-label="Journal posting boundary"><b>Posting boundary · ${accounting.journal.status}</b><p>${accounting.journal.postingBoundary}</p><dl><div><dt>amount6 / source</dt><dd>${doc.amount6} · ${doc.source}</dd></div><div><dt>Native18 fee</dt><dd>${accounting.journal.fee.amount} · ${accounting.journal.fee.status}</dd></div><div><dt>Matcher gate</dt><dd>${result.receiptState} · ${doc.openItem}</dd></div></dl>${button("Open journal detail", 'data-workspace-action="journal"')}</aside>`
        : `<aside class="worklist-inspector audit-inspector" aria-label="Causation recovery inspector"><b>First causal break · ${auditCausalBreak}</b><p>${result.key === "matched" ? "All five local decision stages agree; review the non-postable boundary." : accounting.exception}</p><dl><div><dt>Receipt correlation</dt><dd>${view.receipt.records.length} records → 1 logical payment</dd></div><div><dt>Open-item effect</dt><dd>${doc.openItem}</dd></div></dl>${button("Inspect recovery event", 'data-audit-event="reconciliation"')}</aside>`;
      canvas.insertAdjacentHTML("beforeend", detail);
      if (id === "audit-trail" && result.receiptState === "not evaluated") {
        const auditInspector = canvas.querySelector(".audit-inspector");
        const values = auditInspector?.querySelectorAll("dd");
        if (auditInspector) auditInspector.querySelector("b").textContent = `First causal break · ${state.attested ? "separate payer approval" : "reviewer attestation"}`;
        if (values?.[0]) values[0].textContent = "No observed receipt → expected 3-record matcher layout";
      }
    }
  };
  const focus = (id) => requestAnimationFrame(() => {
    const target = $(WORKSPACE_CONTRACT[id].focusId);
    target?.setAttribute("tabindex", target.tabIndex < 0 ? "-1" : String(target.tabIndex));
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    target?.focus({ preventScroll: true });
  });
  const activate = (id, { writeHash = true, announceError = false } = {}) => {
    const resolved = WORKSPACE_CONTRACT[id] ? id : "milestone-desk";
    const spec = WORKSPACE_CONTRACT[resolved];
    host.setAttribute("aria-busy", "true");
    setNavigationBusy(true);
    state.workspace = resolved;
    if (spec.activityPanel) state.activityPanel = spec.activityPanel;
    closeDrawers();
    render();
    sync();
    if (writeHash && location.hash !== spec.hash) location.hash = spec.hash;
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
      state.accountingPreset = control.dataset.selectProfile;
      state.counterpartyOverride = null;
      state.receiptPurpose = control.dataset.receiptPurpose ?? state.receiptPurpose;
      state.sourceDocument = ({
        payment_advance: "PO-2026-0731",
        payment_corporate_payable: "PINV-2026-044",
        payment_personal_payable: "EEXP-2026-019",
        payment_refund: "PAY-AP-2026-1187",
        receipt: state.receiptPurpose === "customer_advance" ? "CADV-2026-012" : "SINV-2026-072",
        receipt_refund: "RCPT-2026-072"
      })[state.accountingPreset];
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
  window.addEventListener("hashchange", () => {
    const resolved = workspaceFromHash(location.hash);
    activate(resolved ?? "milestone-desk", { writeHash: !resolved, announceError: !resolved });
  });
  window.addEventListener("verified-local-workspace-route", (event) => {
    const requested = event.detail?.id;
    if (WORKSPACE_CONTRACT[requested]) activate(requested);
  });
  const initial = workspaceFromHash(location.hash);
  activate(initial ?? "milestone-desk", { writeHash: false, announceError: Boolean(location.hash) && !initial });
  return { activate, sync };
}
