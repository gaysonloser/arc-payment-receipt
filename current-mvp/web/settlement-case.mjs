/*
 * V3 SettlementCase is the browser-safe product reducer. It deliberately has
 * no scenario/outcome action: receipt and ERP state can only be advanced by a
 * typed business action carrying its evidence. The Node test harness may use
 * the canonical receipt builder below, but the normal product starts pending.
 */
export const SETTLEMENT_PROFILES = Object.freeze({
  payment_advance: { id: "payment_advance", label: "Supplier advance", direction: "treasury_to_supplier", counterparty: "Supplier", sourceRequired: false, refund: false },
  payment_corporate_payable: { id: "payment_corporate_payable", label: "Supplier payable", direction: "treasury_to_supplier", counterparty: "Supplier", sourceRequired: true, refund: false },
  payment_personal_payable: { id: "payment_personal_payable", label: "Employee payable", direction: "treasury_to_employee", counterparty: "Employee", sourceRequired: true, refund: false },
  payment_refund: { id: "payment_refund", label: "Payment refund", direction: "supplier_or_employee_to_treasury", counterparty: "Supplier|Employee", sourceRequired: true, refund: true },
  receipt_invoice_collection: { id: "receipt_invoice_collection", label: "Customer invoice receipt", direction: "customer_to_treasury", counterparty: "Customer", sourceRequired: true, refund: false },
  receipt_customer_advance: { id: "receipt_customer_advance", label: "Customer advance", direction: "customer_to_treasury", counterparty: "Customer", sourceRequired: false, refund: false },
  receipt_refund: { id: "receipt_refund", label: "Receipt refund", direction: "treasury_to_customer", counterparty: "Customer", sourceRequired: true, refund: true }
});

export const SETTLEMENT_STAGES = Object.freeze(["work-queue", "match-funds", "post-erp", "ledger-close", "evidence", "settings"]);
export function buildSettlementRoute(caseState = {}) {
  const route = caseState.route ?? {};
  const params = new URLSearchParams({
    workspace: route.workspace ?? "milestone-desk",
    case: caseState.caseId ?? "VMC-CASE-LOCAL-001",
    profile: caseState.profileId ?? "payment_corporate_payable",
    origin: caseState.origin ?? "erp_initiated",
    stage: route.stage ?? caseState.stage ?? "work-queue",
    view: route.view ?? "document"
  });
  return `#${params.toString()}`;
}

export function parseSettlementRoute(hash = "") {
  const raw = String(hash).replace(/^#/, "");
  const params = new URLSearchParams(raw);
  const workspace = params.get("workspace") || "milestone-desk";
  const profileId = params.get("profile") || "payment_corporate_payable";
  return {
    workspace,
    caseId: params.get("case") || "VMC-CASE-LOCAL-001",
    profileId: SETTLEMENT_PROFILES[profileId] ? profileId : "payment_corporate_payable",
    origin: params.get("origin") === "chain_observed" ? "chain_observed" : "erp_initiated",
    stage: SETTLEMENT_STAGES.includes(params.get("stage")) ? params.get("stage") : "work-queue",
    view: params.get("view") || "document"
  };
}
export const SETTLEMENT_ACTIONS = Object.freeze([
  "SELECT_PROFILE", "SET_ORIGIN", "SET_SEARCH", "RANK_CANDIDATES", "SELECT_CANDIDATE",
  "SET_ALLOCATION", "RECORD_REVIEWER_ATTESTATION", "REVIEW_PAYER_APPROVAL", "CONFIRM_TIER_C",
  "READ_ARC_RECEIPT", "PREPARE_ERP_PROPOSAL", "SUBMIT_ERP_REVIEW", "RECONCILE_BANK",
  "GENERATE_LEDGER", "CLOSE_OPERATIONAL", "CLOSE_ACCOUNTING_PERIOD", "CLOSE_BUSINESS",
  "REVOKE", "REVERSAL", "RECOVER", "REVISE", "SET_ROUTE", "SET_EVIDENCE", "RESET_DEPENDENTS"
]);

const clone = (value) => structuredClone(value);
const emptyReceipt = () => ({ status: "not_evaluated", records: [], logicalPaymentId: null, finality: "unknown", reorg: "unknown", getterReadback: null, caseBinding: null });
const emptyErp = () => ({ paymentEntry: null, bankTransaction: null, reconciliation: null, gl: null, pled: null, outstanding: null, readback: null, createGate: "MATCHER_REQUIRED", submitGate: "NOT_READY", diff: null });
const invalidateDownstream = (state, reason = "Upstream case facts changed; downstream evidence and ERP projections were invalidated.") => ({
  ...state,
  receipt: emptyReceipt(),
  erp: emptyErp(),
  matcherState: "not_evaluated",
  outcome: "not_evaluated",
  close: { ...state.close, business: "OPEN", operational: "OPEN", accountingPeriod: "OPEN", periodClosingVoucher: "NOT_APPLICABLE" },
  unresolvedReason: reason,
  recovery: "Re-run candidate, typed evidence and receipt readback from the changed source facts; no downstream object remains valid.",
  caseHistory: [...(state.caseHistory ?? []), { type: "DOWNSTREAM_INVALIDATED", reason, revision: state.revision + 1 }]
});
const typedServerEvidence = (evidence, state) => {
  const server = evidence?.serverEvidence;
  const roles = server?.roles;
  return Boolean(server && server.caseId === state.caseId && server.companyId === state.companyId && server.treasuryId === state.treasuryId && server.source === "typed_server_evidence" && server.authorityRef && roles?.reviewer && roles?.payer && roles.reviewer !== roles.payer && roles.distinct === true && server.tier === evidence.tier && server.observationId === evidence.observationId);
};
const failure = (state, code, recovery, matcherState = state.matcherState ?? "not_evaluated") => ({
  ...state,
  revision: state.revision + 1,
  outcome: "blocked",
  matcherState,
  unresolvedReason: code,
  recovery,
  erp: { ...state.erp, createGate: "MATCHER_REQUIRED", submitGate: "NOT_READY" },
  close: { ...state.close, business: "OPEN", operational: "OPEN" }
});

const typedLocalReadback = (readback, id, company) => Boolean(
  readback && readback.id === id && readback.company === company &&
  readback.source === "typed_local_erp_readback" && readback.local_fixture_only === true &&
  readback.live_erp === false && readback.external_actions === 0
);

export function validateSettlementCloseReadback(readback, { id, company, state } = {}) {
  if (!typedLocalReadback(readback, id, company)) return { valid: false, code: `TYPED_CLOSE_READBACK_REQUIRED:${id}` };
  if (id === "accounting_period") {
    const valid = readback.doctype === "Accounting Period" && readback.status === "ended" &&
      /^\d{4}-\d{2}-\d{2}$/.test(String(readback.start_date ?? "")) &&
      /^\d{4}-\d{2}-\d{2}$/.test(String(readback.end_date ?? "")) &&
      String(readback.start_date) <= String(readback.end_date) &&
      Array.isArray(readback.closed_documents) && readback.closed_documents.length > 0;
    return { valid, code: valid ? null : "ACCOUNTING_PERIOD_READBACK_INVALID" };
  }
  if (id === "pcv_operational_close") {
    const valid = readback.doctype === "Period Closing Voucher" && readback.docstatus === 1 &&
      readback.status === "submitted" && readback.gl_balanced === true &&
      readback.payment_ledger_status === "OPEN" &&
      String(readback.outstanding_before6 ?? "") === String(state?.erp?.outstanding?.before ?? "") &&
      String(readback.outstanding_after6 ?? "") === String(state?.erp?.outstanding?.after ?? "");
    return { valid, code: valid ? null : "PCV_OPERATIONAL_CLOSE_READBACK_INVALID" };
  }
  if (id === "business_close") {
    const valid = readback.status === "CLOSED" && readback.operational_readback_id === state?.close?.operationalReadback?.name &&
      readback.accounting_period_readback_id === state?.close?.accountingPeriodReadback?.name &&
      readback.payment_ledger_status === "OPEN" &&
      String(readback.outstanding_after6 ?? "") === String(state?.erp?.outstanding?.after ?? "");
    return { valid, code: valid ? null : "BUSINESS_CLOSE_READBACK_INVALID" };
  }
  return { valid: false, code: `TYPED_CLOSE_READBACK_UNKNOWN:${id}` };
}

export function createSettlementCase(seed = {}) {
  const profileId = SETTLEMENT_PROFILES[seed.profileId] ? seed.profileId : "payment_corporate_payable";
  const route = seed.route ?? { workspace: "milestone-desk", stage: "work-queue", view: "document" };
  const refundProfile = SETTLEMENT_PROFILES[profileId].refund === true;
  const defaultAmount6 = refundProfile ? "250000000" : "1250000000";
  return {
    caseId: seed.caseId ?? "VMC-CASE-LOCAL-001",
    companyId: seed.companyId ?? "Gayson Labs Pte Ltd",
    treasuryId: seed.treasuryId ?? "company-treasury-fixture",
    policy: { policyId: seed.policyId ?? "0x" + "11".repeat(32), transferId: seed.transferId ?? "0x" + "22".repeat(32), attestationDigest: seed.attestationDigest ?? "0x" + "33".repeat(32), attestationNonce: "42", version: "VMC-1.0" },
    stage: SETTLEMENT_STAGES.includes(seed.stage) ? seed.stage : "work-queue",
    origin: seed.origin === "chain_observed" ? "chain_observed" : "erp_initiated",
    profileId,
    evidenceTier: "D",
    matcherState: "not_evaluated",
    route: { workspace: route.workspace ?? "milestone-desk", stage: route.stage ?? "work-queue", view: route.view ?? "document" },
    originObservation: null,
    search: { party: "", document: "" },
    candidates: [],
    candidate: null,
    allocation: { requestedAmount6: defaultAmount6, allocatedAmount6: "0", remainingAmount6: defaultAmount6, ceilingAmount6: refundProfile ? defaultAmount6 : null, originalReference: refundProfile ? (profileId === "payment_refund" ? "PAY-AP-2026-1187" : "RCPT-2026-072") : null },
    reviewerAttested: false,
    payerApproved: false,
    receipt: emptyReceipt(),
    erp: emptyErp(),
    close: { business: "OPEN", operational: "OPEN", accountingPeriod: "OPEN", periodClosingVoucher: "NOT_APPLICABLE" },
    lifecycleOperations: {},
    lastLifecycleResult: null,
    outcome: "not_evaluated",
    unresolvedReason: "Evidence tier D requires a typed observation before allocation.",
    recovery: "Select a source case, attach typed server evidence, then run the raw receipt matcher; no ERP object or close can be inferred.",
    caseHistory: [{ type: "CASE_CREATED", caseId: seed.caseId ?? "VMC-CASE-LOCAL-001", revision: 0 }],
    revision: 0
  };
}

const V3_PROFILE_DOCUMENTS = Object.freeze({
  payment_advance: { label: "Payment · advance", number: "PAY-ADV-2026-031", source: "PO-2026-0731", party: "Pixel & Pine Studio", partyId: "supplier-pixel-fixture", noun: "Supplier advance", debit: "Supplier advances", credit: "USDC settlement clearing", purpose: "prepayment" },
  payment_corporate_payable: { label: "Payment · corporate payable", number: "PAY-AP-2026-1187", source: "PINV-2026-044", party: "Pixel & Pine Studio", partyId: "supplier-pixel-fixture", noun: "Supplier payable", debit: "Accounts payable — suppliers", credit: "USDC settlement clearing", purpose: "trade payable" },
  payment_personal_payable: { label: "Payment · personal payable", number: "PAY-EMP-2026-019", source: "EEXP-2026-019", party: "Jamie Lee", partyId: "employee-jamie-fixture", noun: "Employee payable", debit: "Accounts payable — employees", credit: "USDC settlement clearing", purpose: "reimbursement" },
  payment_refund: { label: "Payment refund", number: "PREF-2026-006", source: "PAY-AP-2026-1187", party: "Pixel & Pine Studio", partyId: "supplier-pixel-fixture", noun: "Payment refund recovery", debit: "USDC settlement clearing", credit: "Original payment recovery account", purpose: "returned prior payment" },
  receipt_invoice_collection: { label: "Receipt · invoice collection", number: "RCPT-2026-072", source: "SINV-2026-072", party: "Northwind Studio", partyId: "customer-northwind-fixture", noun: "Customer receivable", debit: "USDC settlement clearing", credit: "Accounts receivable — customers", purpose: "invoice collection" },
  receipt_customer_advance: { label: "Receipt · customer advance", number: "RCPT-ADV-2026-012", source: "CADV-2026-012", party: "Northwind Studio", partyId: "customer-northwind-fixture", noun: "Customer advance", debit: "USDC settlement clearing", credit: "Customer advances", purpose: "customer advance" },
  receipt_refund: { label: "Receipt refund", number: "RREF-2026-009", source: "RCPT-2026-072", party: "Northwind Studio", partyId: "customer-northwind-fixture", noun: "Receipt refund recovery", debit: "Original receipt AR / customer-advance account", credit: "USDC settlement clearing", purpose: "returned prior receipt" }
});
const V3_PROFILE_SOURCE = Object.freeze(Object.fromEntries(Object.entries(V3_PROFILE_DOCUMENTS).map(([id, value]) => [id, value.source])));
const v3FormatAmount = (amount6) => { const s = String(amount6 ?? "0").padStart(7, "0"); return `${s.slice(0, -6).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${s.slice(-6, -4)} USDC`; };

export function projectSettlementCase(caseState) {
  const c = caseState ?? createSettlementCase();
  const profile = V3_PROFILE_DOCUMENTS[c.profileId] ?? V3_PROFILE_DOCUMENTS.payment_corporate_payable;
  const p = SETTLEMENT_PROFILES[c.profileId] ?? SETTLEMENT_PROFILES.payment_corporate_payable;
  const amount6 = c.allocation?.allocatedAmount6 && c.allocation.allocatedAmount6 !== "0" ? c.allocation.allocatedAmount6 : c.allocation?.requestedAmount6 ?? "1250000000";
  const amount = v3FormatAmount(amount6);
  // A receipt refund is an outbound recovery from treasury to the customer;
  // only original receipts (not their refunds) are inbound cash.
  const incoming = (c.profileId.startsWith("receipt") && c.profileId !== "receipt_refund") || c.profileId === "payment_refund";
  const refund = p.refund;
  const payer = incoming ? profile.partyId : "company-treasury-fixture";
  const recipient = incoming ? "company-treasury-fixture" : profile.partyId;
  const key = c.matcherState === "matched" ? "matched" : c.matcherState === "stale" ? "stale" : c.matcherState === "mismatch" ? "mismatch" : c.matcherState === "weak_evidence" ? "weak_evidence" : c.matcherState === "tier_c_unconfirmed" ? "tier_c_unconfirmed" : "pending";
  const evaluated = key !== "pending";
  const label = key === "matched" ? "Matched" : key === "stale" ? "Stale attestation" : key === "mismatch" ? "Receipt mismatch" : key === "weak_evidence" ? "Weak evidence" : key === "tier_c_unconfirmed" ? "Tier C unconfirmed" : "Not evaluated";
  const openItem = key === "matched" && !refund && c.profileId !== "payment_advance" && c.profileId !== "receipt_customer_advance" ? `${profile.noun} close proposal eligible after readback.` : refund ? `Original ${profile.source} remains OPEN; refund recovery only.` : `${profile.noun} remains OPEN until a typed matcher result.`;
  const proposal = key === "matched" ? refund ? `${profile.label} recovery proposal` : c.profileId === "payment_advance" || c.profileId === "receipt_customer_advance" ? `${profile.label} proposal` : `${profile.label} close proposal` : "No Payment Entry proposal";
  const exception = key === "stale" ? "validUntil / TTL is stale; refresh evidence and retain the open item." : key === "mismatch" ? "Receipt/readback identity or ordered log evidence mismatches the locked case; prepare recovery." : key === "weak_evidence" ? "Evidence tier D or incomplete provenance cannot authorize matching; retain OPEN." : key === "tier_c_unconfirmed" ? "Tier C evidence requires named reviewer confirmation before matching; retain OPEN." : !evaluated ? c.unresolvedReason : "No exception; local proposal remains non-postable.";
  const guidance = key === "matched" ? refund ? `Review recovery against original ${profile.source}; this is not a new close.` : `Review ${profile.label} local proposal; Arc finality does not post ERP.` : key === "stale" ? "Refresh validUntil / TTL before re-running the matcher." : key === "mismatch" ? "Inspect receipt/readback identity and preserve the original open item." : key === "weak_evidence" ? "Attach stronger typed evidence; caller assertions cannot promote this case." : key === "tier_c_unconfirmed" ? "Record a named Tier C reviewer confirmation with reason and timestamp." : "Select a typed source candidate and attach evidence; no receipt or ERP outcome is assumed.";
  const journalReady = key === "matched" && c.erp?.gl?.totals?.balanced === true;
  const journal = journalReady ? { status: "proposal_ready", source: profile.source, rows: [{ account: profile.debit, object: profile.source, debit: amount, credit: "—", kind: "principal" }, { account: profile.credit, object: profile.number, debit: "—", credit: amount, kind: "principal" }], totals: { debit: amount, credit: amount, amount6, balanced: true }, fee: { account: "Network fee expense (separate)", amount: "estimate only · native18", status: "separate from principal" }, recovery: "Local proposal only; no ERP mutation.", postingBoundary: "Preview/readback required — no ERP post from this desk." } : { status: "not_postable", source: profile.source, rows: [{ account: "No principal posting", object: exception, debit: "—", credit: "—", kind: "exception" }], totals: { debit: "—", credit: "—", amount6: "0", balanced: false }, fee: { account: "Network fee expense (separate)", amount: "not available", status: "native18 only" }, recovery: exception, postingBoundary: "Matcher, Payment Entry readback and close checks are incomplete." };
  const document = { noun: profile.noun, title: `${profile.label} · ${profile.number}`, identity: `${p.counterparty} · ${profile.party}`, source: profile.source, amount6, amount, payer, recipient, purpose: profile.purpose, railStatus: key === "matched" ? (refund ? "RECOVERY PROPOSAL" : "PROPOSAL REVIEW") : "OPEN", proposal, openItem, guidance, guideTarget: key === "stale" ? 1 : key === "mismatch" ? 2 : key === "matched" ? 3 : 0, guideAction: key === "matched" ? (refund ? "Review recovery against original" : "Review local ERP proposal") : key === "stale" ? "Inspect freshness / validUntil" : key === "mismatch" ? "Inspect receipt/readback mismatch" : "Inspect source evidence", tray: { document: profile.number, counterparty: `${p.counterparty} · ${profile.party}`, openItem: profile.noun, amount }, receiptDetail: evaluated ? `${key === "matched" ? "status: 1" : "receipt held"} · typed receipt/readback is ${key}` : "No observed receipt or readback.", readback: evaluated ? `${payer} → ${recipient} · amount6 ${amount6}` : "No chain request; expected readback is not evidence.", closeAllowed: key === "matched" && !refund && c.profileId !== "payment_advance" && c.profileId !== "receipt_customer_advance" };
  const result = { key, label, kind: key === "matched" ? "success" : key === "pending" ? "pending" : "warning", result: key === "matched" ? "Typed receipt matched — ERP proposal review" : `${label} — close held`, receiptState: key === "matched" ? "matched" : key === "pending" ? "not evaluated" : "rejected", receiptLabel: evaluated ? label : "Not evaluated", receiptDetail: document.receiptDetail, readback: document.readback, exception, sideEffect: "none", sideEffectDetail: "No wallet, broadcast, ERP post or close mutation." };
  const accounting = { profile: { id: c.profileId, label: profile.label, documentNumber: profile.number, counterpartyClass: p.counterparty, counterparty: profile.party, purpose: profile.purpose, requiresOriginal: refund, refundableAmount6: refund ? (c.allocation?.ceilingAmount6 ?? "0") : "1250000000", amount6 }, matcher: result.receiptState === "matched" ? "matched" : `${label} — no business close`, reconciliation: proposal, openItemEffect: openItem, exception, errors: [], balancedJournal: { debit: profile.debit, credit: profile.credit, amount6, balanced: journalReady }, journal, gas: "estimate/max native18 separate from principal", document };
  let receiptRecords = [];
  if (evaluated) {
    receiptRecords = c.receipt?.records ?? [];
    if (!receiptRecords.length) receiptRecords = (c.receipt?.logs ?? []).map((log) => ({
      id: log.variant === "ERC20_USDC" ? "erc20-transfer" : log.variant === "ARC_SYSTEM" ? "arc-system-transfer" : "policy-event",
      type: log.variant === "ERC20_USDC" ? "ERC20 Transfer" : log.variant === "ARC_SYSTEM" ? "Arc system Transfer" : "SettlementExecuted",
      object: log.variant === "ERC20_USDC" ? "Circle USDC" : log.variant === "ARC_SYSTEM" ? "Arc Testnet" : "Policy contract",
      block: c.receipt?.blockHash ?? "typed block readback",
      logIndex: log.logIndex,
      emitter: log.emitter,
      status: "matched",
      fields: [["from", log.from ?? log.payer], ["to", log.to ?? log.recipient], ["amount", String(log.amount ?? "")], ["unit", log.variant === "ARC_SYSTEM" ? "native18" : "amount6"]]
    }));
  }
  const timeline = [
    ["Document prepared", `${profile.label} · ${profile.number}`, `${profile.noun} is locked with ${profile.source || "no original reference"}.`],
    ["Reviewer attestation", c.reviewerAttested ? "Recorded local attestation" : "Awaiting reviewer attestation", "Reviewer and payer controls remain separate."],
    ["Typed Arc receipt", result.receiptState === "matched" ? "Readback matched" : result.receiptState === "not evaluated" ? "Not evaluated" : `${label} held`, document.receiptDetail],
    ["ERP reconciliation", c.erp?.paymentEntry ? "Payment Entry proposal / readback" : "No ERP object", proposal],
    ["Ledger and close", document.closeAllowed ? "Close proposal eligible" : "Open item remains OPEN", journal.postingBoundary]
  ];
  const view = { policy: [["policyVersion", "VMC-1.0"], ["amount6 cap", amount6], ["validUntil / TTL", key === "stale" ? "expired / refresh required" : "typed evidence required"], ["attestationNonce / replay", "typed nonce; duplicate rejected"], ["roles", "reviewer ≠ payer; no caller tier promotion"], ["origin", c.origin]], lifecycle: [["Condition", "locked case and amount6 cap"], ["Attestation", c.reviewerAttested ? "recorded" : "pending"], ["Payer approval", c.payerApproved ? "reviewed separately" : "pending separately"], ["Receipt", result.receiptState], ["ERP", c.erp?.paymentEntry ? "typed proposal/readback" : "not prepared"], ["Business close", document.closeAllowed ? "proposal only" : "OPEN"]], receipt: { lifecycle: key, records: receiptRecords, correlation: evaluated ? "Three typed records → one logical payment" : "No observed receipt; expected layout only" }, failure: { label: "Local recovery", rule: exception, observed: exception, recovery: c.recovery, openItem: profile.noun }, architecture: [["Network", "Arc Testnet · chainId 5042002"], ["Boundary", "technical finality ≠ ERP business close"], ["Minimum necessary", "same-chain USDC receipt/readback; no bridge/swap/wallet"]] };
  return { accounting, document: { ...document, timeline }, result, view, state: c };
}


export function rankCandidates({ profileId, origin = "erp_initiated", party = "", document = "" } = {}) {
  const profile = SETTLEMENT_PROFILES[profileId];
  if (!profile) return [];
  const query = `${party} ${document}`.trim().toLowerCase();
  const source = [{ id: `${profileId}-source-001`, party: profile.counterparty, document: V3_PROFILE_SOURCE[profileId] || (profile.sourceRequired ? "source-document-required" : "advance-or-bank-reference"), score: query ? (query.includes(profile.counterparty.split("|")[0].toLowerCase()) ? 100 : 40) : 0 }];
  return source.map((entry) => ({ ...entry, profileId, origin, amount6: profile.refund ? "250000000" : "1250000000", currency: "USDC", direction: profile.direction, evidenceRequired: profile.sourceRequired ? "A|B|C" : "A|B|C", reason: entry.score >= 100 ? "party, document and company identity agree" : "candidate requires explicit operator confirmation" }));
}

export function settlementCaseReducer(input, action) {
  const state = clone(input);
  if (!action || !SETTLEMENT_ACTIONS.includes(action.type)) return failure(state, "UNKNOWN_ACTION", "Use one of the typed SettlementCase actions.");
  if (action.type === "SELECT_PROFILE") {
    if (!SETTLEMENT_PROFILES[action.profileId]) return failure(state, "PROFILE_UNKNOWN", "Choose one of the seven canonical profiles.");
    const next = createSettlementCase({ caseId: state.caseId, companyId: state.companyId, treasuryId: state.treasuryId, profileId: action.profileId, origin: state.origin, route: state.route });
    return { ...next, policy: clone(state.policy), revision: state.revision + 1, caseHistory: [...(state.caseHistory ?? []), { type: "PROFILE_SELECTED", from: state.profileId, to: action.profileId, revision: state.revision + 1 }] };
  }
  if (action.type === "SET_ORIGIN") {
    if (!["erp_initiated", "chain_observed"].includes(action.origin)) return failure(state, "ORIGIN_UNKNOWN", "Choose ERP initiated or chain observed.");
    const next = createSettlementCase({ caseId: state.caseId, companyId: state.companyId, treasuryId: state.treasuryId, profileId: state.profileId, origin: action.origin, route: state.route });
    return { ...next, policy: clone(state.policy), revision: state.revision + 1, caseHistory: [...(state.caseHistory ?? []), { type: "ORIGIN_SELECTED", from: state.origin, to: action.origin, revision: state.revision + 1 }] };
  }
  if (action.type === "SET_ROUTE") {
    const workspace = String(action.workspace ?? "milestone-desk");
    const stage = SETTLEMENT_STAGES.includes(action.stage) ? action.stage : state.stage;
    const view = String(action.view ?? state.route?.view ?? "document");
    const caseId = String(action.caseId ?? state.caseId);
    const next = { ...state, caseId, route: { workspace, stage, view }, stage, revision: state.revision + 1 };
    return caseId !== state.caseId ? invalidateDownstream(next, "Route restored a different case; receipt and ERP consequences were invalidated.") : next;
  }
  if (action.type === "SET_EVIDENCE") {
    const evidence = action.evidence;
    if (evidence?.tier === "D") return { ...failure(state, "WEAK_EVIDENCE", "Tier D remains unresolved and cannot be allocated or posted.", "weak_evidence"), outcome: "weak_evidence" };
    if (Object.prototype.hasOwnProperty.call(evidence ?? {}, "rolesVerified")) return failure(state, "EVIDENCE_RECORD_INVALID", "Caller-provided role booleans are not evidence; attach the typed server record.");
    if (!evidence || !["A", "B", "C"].includes(evidence.tier) || !evidence.observationId || !evidence.source || !evidence.roles || typeof evidence.roles !== "object" || !evidence.roles.reviewer || !evidence.roles.payer || evidence.roles.distinct !== true || !typedServerEvidence(evidence, state)) return failure(state, "EVIDENCE_SERVER_AUTHORITY_REQUIRED", "Attach server-derived case/company/role evidence; caller booleans and self-reported Tier C authority cannot promote a case.");
    const next = invalidateDownstream({ ...state, evidenceTier: evidence.tier, originObservation: clone(evidence), unresolvedReason: evidence.tier === "C" ? "Tier C requires explicit operator confirmation before ERP proposal." : "Typed server evidence attached; candidate and receipt still require matching.", revision: state.revision + 1 }, "Evidence changed; receipt, ERP and close projections were invalidated.");
    return evidence.tier === "C" ? { ...next, matcherState: "tier_c_unconfirmed", outcome: "tier_c_unconfirmed", unresolvedReason: "TIER_C_UNCONFIRMED" } : next;
  }
  if (action.type === "RESET_DEPENDENTS") return invalidateDownstream({ ...state, candidates: [], candidate: null, allocation: { ...state.allocation, allocatedAmount6: "0" }, revision: state.revision + 1 }, "Dependent evidence reset; source facts remain the only case authority.");
  if (action.type === "SET_SEARCH") return invalidateDownstream({ ...state, search: { party: String(action.party ?? ""), document: String(action.document ?? "") }, stage: "work-queue", route: { ...state.route, stage: "work-queue", view: "search" }, revision: state.revision + 1 }, "Search changed; candidate, receipt and ERP projections were invalidated.");
  if (action.type === "RANK_CANDIDATES") return { ...state, candidates: rankCandidates({ profileId: state.profileId, ...state.search }), stage: "match-funds", revision: state.revision + 1, caseHistory: [...(state.caseHistory ?? []), { type: "CANDIDATES_RANKED", revision: state.revision + 1 }] };
  if (action.type === "SELECT_CANDIDATE") {
    const candidate = state.candidates.find((entry) => entry.id === action.candidateId);
    if (!candidate) return failure(state, "CANDIDATE_UNKNOWN", "Rank candidates again and select an exact returned candidate.");
    if (candidate.profileId !== state.profileId || candidate.origin !== state.origin) return failure(state, "CANDIDATE_IDENTITY_MISMATCH", "Candidate profile and origin must match the active case.");
    return invalidateDownstream({ ...state, candidate, stage: "match-funds", route: { ...state.route, stage: "match-funds", view: "candidate" }, unresolvedReason: "Candidate selected; typed server evidence still required.", revision: state.revision + 1, caseHistory: [...(state.caseHistory ?? []), { type: "CANDIDATE_SELECTED", candidateId: candidate.id, revision: state.revision + 1 }] }, "Candidate changed; receipt and ERP projections were invalidated.");
  }
  if (action.type === "SET_ALLOCATION") {
    const allocation = action.allocation;
    if (!allocation || typeof allocation !== "object" || Object.prototype.hasOwnProperty.call(action, "amount6") || !allocation.authority || allocation.authority.role !== "operator" || !allocation.authority.operatorId) return failure(state, "ALLOCATION_AUTHORITY_INVALID", "Allocation must be a typed object with a named operator authority; caller scalar values are rejected.");
    const amount = String(allocation.amount6 ?? "");
    if (!/^\d+$/.test(amount) || BigInt(amount) <= 0n) return failure(state, "ALLOCATION_INVALID", "Allocation must be a positive amount6 integer.");
    if (BigInt(amount) > BigInt(state.allocation.requestedAmount6)) return failure(state, "ALLOCATION_OVERPAY", "Allocation cannot exceed the requested amount6; retain the open remainder.");
    if (state.profileId.endsWith("refund") && (!state.allocation.ceilingAmount6 || BigInt(amount) > BigInt(state.allocation.ceilingAmount6))) return failure(state, "REFUND_OVER_CEILING", "Reduce the refund to the remaining refundable ceiling and retain the original reference.");
    const exchangeRate = String(allocation.exchangeRate ?? "");
    const differenceAmount6 = String(allocation.differenceAmount6 ?? "");
    if (SETTLEMENT_PROFILES[state.profileId].refund && (!/^\d+(?:\.\d+)?$/.test(exchangeRate) || Number(exchangeRate) <= 0)) return failure(state, "REFUND_EXCHANGE_RATE_REQUIRED", "Refund allocation requires an explicit positive exchange rate; no implicit 1:1 rate is accepted.");
    if (SETTLEMENT_PROFILES[state.profileId].refund && (!/^-?\d+$/.test(differenceAmount6) || (differenceAmount6 !== "0" && !allocation.differenceAccount))) return failure(state, "REFUND_DIFFERENCE_UNRESOLVED", "Refund difference must be an explicit amount6; any non-zero difference requires a named company account.");
    return invalidateDownstream({ ...state, allocation: { ...state.allocation, allocatedAmount6: amount, remainingAmount6: String(BigInt(state.allocation.requestedAmount6) - BigInt(amount)), originalReference: allocation.originalReference ?? state.allocation.originalReference, exchangeRate: SETTLEMENT_PROFILES[state.profileId].refund ? exchangeRate : null, differenceAmount6: SETTLEMENT_PROFILES[state.profileId].refund ? differenceAmount6 : "0", differenceAccount: allocation.differenceAccount ?? null }, stage: "match-funds", route: { ...state.route, stage: "match-funds", view: "allocation" }, revision: state.revision + 1, caseHistory: [...(state.caseHistory ?? []), { type: "ALLOCATION_SET", amount6: amount, revision: state.revision + 1 }] }, "Allocation changed; raw receipt and ERP projections were invalidated.");
  }
  if (action.type === "RECORD_REVIEWER_ATTESTATION") return { ...state, reviewerAttested: true, revision: state.revision + 1 };
  if (action.type === "REVIEW_PAYER_APPROVAL") return state.reviewerAttested ? { ...state, payerApproved: true, revision: state.revision + 1 } : failure(state, "REVIEWER_REQUIRED", "Record reviewer attestation before payer approval.");
  if (action.type === "CONFIRM_TIER_C") return state.evidenceTier === "C" && action.confirmation?.operatorId && action.confirmation?.role === "reviewer" && action.confirmation?.reason && action.confirmation?.confirmedAt ? { ...state, originObservation: { ...state.originObservation, tierCConfirmed: true, confirmation: clone(action.confirmation) }, matcherState: "not_evaluated", outcome: "not_evaluated", unresolvedReason: "Tier C operator confirmation recorded; receipt still required.", revision: state.revision + 1 } : failure(state, "TIER_C_CONFIRMATION_REQUIRED", "Tier C needs a named reviewer confirmation, reason and timestamp; caller booleans are not accepted.", "tier_c_unconfirmed");
  if (action.type === "READ_ARC_RECEIPT") {
    const amount6 = state.allocation.allocatedAmount6 && state.allocation.allocatedAmount6 !== "0" ? state.allocation.allocatedAmount6 : "0";
    if (amount6 === "0") return failure(state, "ZERO_ALLOCATION_FORBIDDEN", "Set a positive typed allocation before reading a receipt or creating accounting objects.");
    if (!state.reviewerAttested || !state.payerApproved) return failure(state, "CONTROL_SEQUENCE_INCOMPLETE", "Record reviewer attestation and separate payer approval before receipt readback.");
    const receiptCheck = validateCanonicalArcReceipt(action.receipt, { amount6, caseBinding: { caseId: state.caseId, companyId: state.companyId, profileId: state.profileId, origin: state.origin, sourceDocument: state.candidate?.document ?? state.allocation.originalReference, treasuryId: state.treasuryId, policyId: state.policy.policyId, transferId: state.policy.transferId } });
    if (!receiptCheck.valid) return failure(state, receiptCheck.code, receiptCheck.recovery, receiptCheck.code === "ARC_RECEIPT_STALE" ? "stale" : "mismatch");
    const evidence = action.evidence;
    if (!evidence || !["A", "B", "C"].includes(evidence.tier) || !evidence.observationId || !evidence.source || !evidence.roles || evidence.roles.distinct !== true || Object.prototype.hasOwnProperty.call(evidence, "rolesVerified") || !typedServerEvidence(evidence, state) || (evidence.tier === "C" && !state.originObservation?.tierCConfirmed)) return failure(state, "EVIDENCE_PROVENANCE_REQUIRED", "Attach typed server reviewer/payer roles and any required Tier C confirmation before matching.");
    const logicalPaymentId = `logical:${state.caseId}:${state.policy.transferId}`;
    return { ...state, receipt: { ...clone(action.receipt), logicalPaymentId, caseBinding: { caseId: state.caseId, companyId: state.companyId, profileId: state.profileId, origin: state.origin, sourceDocument: state.candidate?.document ?? state.allocation.originalReference, treasuryId: state.treasuryId, policyId: state.policy.policyId, transferId: state.policy.transferId } }, stage: "post-erp", route: { ...state.route, stage: "post-erp", view: "receipt" }, evidenceTier: evidence.tier, originObservation: { ...clone(evidence), ...(state.originObservation?.tierCConfirmed ? { tierCConfirmed: true, confirmation: clone(state.originObservation.confirmation) } : {}) }, matcherState: "matched", outcome: "matched", unresolvedReason: "", recovery: "Typed receipt matched; ERP remains a separate draft/readback gate.", caseHistory: [...(state.caseHistory ?? []), { type: "RECEIPT_MATCHED", logicalPaymentId, revision: state.revision + 1 }], revision: state.revision + 1 };
  }
  if (action.type === "PREPARE_ERP_PROPOSAL") {
    if (state.matcherState !== "matched" || !state.receipt?.logicalPaymentId || !state.candidate || !state.reviewerAttested || !state.payerApproved || state.evidenceTier === "D" || (state.evidenceTier === "C" && !state.originObservation?.tierCConfirmed)) return failure(state, "ERP_EVIDENCE_INSUFFICIENT", "No Payment Entry, Bank Transaction or close proposal until a typed matched receipt, candidate and evidence provenance are present.");
    const paymentEntry = { doctype: "Payment Entry", name: `PE-${state.caseId}`, status: "Draft", source: state.candidate.document, amount6: state.allocation.allocatedAmount6, readback: { status: "pending", source: "typed ERP readback required" }, diff: { status: "pending", fields: ["amount6", "party", "source", "company", "currency"] } };
    const amount6 = state.allocation.allocatedAmount6;
    const bankTransaction = { doctype: "Bank Transaction", name: `BT-${state.caseId}`, direction: state.profileId.startsWith("receipt") ? "inbound" : "outbound", status: "Draft", reconciliation: "REVIEW_REQUIRED", amount6 };
    const gl = { rows: [{ account: "Settlement principal", side: "debit", amount6 }, { account: "USDC settlement clearing", side: "credit", amount6 }], totals: { debit6: amount6, credit6: amount6, balanced: true }, fee: { unit: "native18", amount: "0", separate: true } };
    return { ...state, stage: "post-erp", route: { ...state.route, stage: "post-erp", view: "erp-proposal" }, erp: { ...state.erp, paymentEntry, bankTransaction, reconciliation: { status: "Draft", readback: { status: "pending", source: "typed Bank Transaction readback required" } }, gl, pled: { status: "OPEN", amount6 }, outstanding: { before: state.allocation.requestedAmount6, after: state.allocation.remainingAmount6, status: "OPEN" }, createGate: "READY_FOR_LOCAL_REVIEW", submitGate: "REVIEW_REQUIRED", diff: { status: "pending", fields: ["amount6", "direction", "source", "company"] } }, recovery: "Review typed Payment Entry and Bank Transaction readback; no submit or close is implied.", caseHistory: [...(state.caseHistory ?? []), { type: "ERP_DRAFT_CREATED", paymentEntry: paymentEntry.name, revision: state.revision + 1 }], revision: state.revision + 1 };
  }
  if (action.type === "SUBMIT_ERP_REVIEW") {
    if (!state.erp.paymentEntry || action.gate !== "submit" || !action.readback || action.readback.status !== "readback" || String(action.readback.amount6) !== String(state.allocation.allocatedAmount6) || action.readback.diff !== "none" || action.readback.typed !== true) return failure(state, state.erp.paymentEntry ? "ERP_READBACK_DIFF" : "ERP_OBJECT_REQUIRED", "Read back the typed Payment Entry and Bank Transaction, resolve every diff and keep the open item unchanged until then.");
    return { ...state, erp: { ...state.erp, submitGate: "OWNER_REVIEW_REQUIRED", readback: clone(action.readback), diff: { status: "none", fields: [] }, paymentEntry: { ...state.erp.paymentEntry, readback: clone(action.readback), status: "Readback verified" }, reconciliation: { ...state.erp.reconciliation, status: "Reconciled" }, bankTransaction: { ...state.erp.bankTransaction, reconciliation: "RECONCILED", status: "Readback verified" } }, stage: "ledger-close", route: { ...state.route, stage: "ledger-close", view: "close" }, caseHistory: [...(state.caseHistory ?? []), { type: "ERP_READBACK_VERIFIED", revision: state.revision + 1 }], revision: state.revision + 1 };
  }
  if (action.type === "RECONCILE_BANK") {
    if (!state.erp.paymentEntry || !state.erp.bankTransaction || state.erp.submitGate === "NOT_READY") return failure(state, "BANK_RECONCILIATION_REQUIRED", "Create and read back the typed Payment Entry before Bank Transaction reconciliation.");
    return { ...state, erp: { ...state.erp, reconciliation: { status: "Reconciled", readback: { status: "typed", amount6: state.allocation.allocatedAmount6 } }, bankTransaction: { ...state.erp.bankTransaction, status: "Reconciled", reconciliation: "RECONCILED" } }, revision: state.revision + 1 };
  }
  if (action.type === "GENERATE_LEDGER") {
    if (state.erp.submitGate !== "OWNER_REVIEW_REQUIRED" || state.erp.reconciliation?.status !== "Reconciled") return failure(state, "LEDGER_READBACK_REQUIRED", "Verify ERP readback and Bank Transaction reconciliation before generating GL/PLED/outstanding.");
    return { ...state, erp: { ...state.erp, pled: { status: "OPEN", amount6: state.allocation.allocatedAmount6, source: state.candidate?.document }, outstanding: { before: state.allocation.requestedAmount6, after: state.allocation.remainingAmount6, status: "OPEN" }, gl: { ...state.erp.gl, status: "Generated", readback: { typed: true, balanced: true } } }, stage: "ledger-close", route: { ...state.route, stage: "ledger-close", view: "ledger" }, revision: state.revision + 1 };
  }
  if (action.type === "CLOSE_OPERATIONAL") {
    if (state.erp.gl?.readback?.balanced !== true) return failure(state, "OPERATIONAL_CLOSE_READBACK_REQUIRED", "Generate and read back a balanced GL/PLED projection before operational close.");
    const check = validateSettlementCloseReadback(action.readback, { id: "pcv_operational_close", company: state.companyId, state });
    if (!check.valid) return failure(state, check.code, "Operational close requires a typed Period Closing Voucher readback bound to company, GL, PLED and outstanding amounts.");
    return { ...state, close: { ...state.close, operational: "CLOSED", periodClosingVoucher: "READBACK_VERIFIED", operationalReadback: clone(action.readback) }, revision: state.revision + 1 };
  }
  if (action.type === "CLOSE_ACCOUNTING_PERIOD") {
    if (Object.prototype.hasOwnProperty.call(action, "periodStatus")) return failure(state, "ACCOUNTING_PERIOD_CALLER_STATUS_FORBIDDEN", "Caller-provided periodStatus is not evidence; attach the typed Accounting Period readback.");
    const check = validateSettlementCloseReadback(action.readback, { id: "accounting_period", company: state.companyId, state });
    if (!check.valid) return failure(state, check.code, "Accounting Period remains OPEN until a typed ended-period readback is present.");
    return { ...state, close: { ...state.close, accountingPeriod: "CLOSED", accountingPeriodReadback: clone(action.readback) }, revision: state.revision + 1 };
  }
  if (action.type === "CLOSE_BUSINESS") {
    if (state.close.operational !== "CLOSED" || state.close.accountingPeriod !== "CLOSED" || state.erp.pled?.status !== "OPEN") return failure(state, "BUSINESS_CLOSE_BOUNDARY", "Business close requires the operational and accounting-period controls plus an OPEN PLED/outstanding readback; technical receipt match alone is insufficient.");
    const check = validateSettlementCloseReadback(action.readback, { id: "business_close", company: state.companyId, state });
    if (!check.valid) return failure(state, check.code, "Business close requires an independent typed readback bound to the accepted PCV, Accounting Period and remaining PLED/outstanding state.");
    return { ...state, close: { ...state.close, business: "CLOSED", businessReadback: clone(action.readback) }, revision: state.revision + 1 };
  }
  if (action.type === "REVOKE" || action.type === "REVERSAL") {
    const operationKey = String(action.operationKey ?? "").trim();
    const authority = action.authority;
    if (!operationKey || !action.reason || !authority?.operatorId || !["reviewer", "finance_operator"].includes(authority.role)) return failure(state, "LIFECYCLE_OPERATION_AUTHORITY_REQUIRED", "REVOKE/REVERSAL requires a stable operation key, reason and named reviewer or finance operator.");
    const prior = state.lifecycleOperations?.[operationKey];
    if (prior) {
      if (prior.type !== action.type) return { ...state, outcome: "blocked", unresolvedReason: "IDEMPOTENCY_KEY_CONFLICT", lastLifecycleResult: { state: "CONFLICT_REJECT", operationKey, existingType: prior.type, requestedType: action.type } };
      return { ...state, lastLifecycleResult: { state: "DUPLICATE_NOOP", operationKey, type: action.type } };
    }
    if (action.type === "REVERSAL" && !state.receipt?.logicalPaymentId && !state.erp?.paymentEntry) return failure(state, "REVERSAL_SOURCE_REQUIRED", "A reversal must bind an existing logical payment or ERP Payment Entry; retain the open item.");
    const priorOpenItem = projectSettlementCase(state).document.openItem;
    const priorLogicalPaymentId = state.receipt?.logicalPaymentId ?? null;
    const next = invalidateDownstream({ ...state, revision: state.revision + 1 }, `${action.type} ${operationKey} retained the original open item and invalidated downstream consequences.`);
    const entry = { type: action.type, operationKey, reason: String(action.reason), operatorId: authority.operatorId, priorLogicalPaymentId, openItem: priorOpenItem, revision: next.revision };
    return { ...next, matcherState: "not_evaluated", outcome: action.type === "REVOKE" ? "revoked" : "reversal_recorded", lifecycleOperations: { ...(state.lifecycleOperations ?? {}), [operationKey]: entry }, lastLifecycleResult: { state: "APPLIED", operationKey, type: action.type }, caseHistory: [...next.caseHistory, entry] };
  }
  if (action.type === "RECOVER") return { ...invalidateDownstream({ ...state, matcherState: action.matcherState === "stale" || action.matcherState === "mismatch" ? action.matcherState : "not_evaluated", outcome: action.matcherState === "stale" || action.matcherState === "mismatch" ? action.matcherState : "not_evaluated", revision: state.revision + 1 }, String(action.reason ?? "Named recovery retained the open item.")), recovery: String(action.recovery ?? "Refresh the typed source and re-run the matcher; no accounting close is inferred.") };
  if (action.type === "REVISE") return { ...state, stage: "evidence", outcome: "revision_required", revision: state.revision + 1, recovery: String(action.reason ?? "Review the linked evidence and revise the case.") };
  return state;
}

export function validateCanonicalArcReceipt(receipt, { amount6, caseBinding } = {}) {
  if (!receipt || receipt.chainId !== 5042002 || receipt.status !== 1) return { valid: false, code: "ARC_RECEIPT_NOT_SUCCESS", recovery: "Retain OPEN; require Arc status 1 and a typed getter readback." };
  let logs;
  try { logs = receipt.rawLogs ? decodeRawArcReceipt(receipt) : receipt.logs; }
  catch (error) {
    const rawCode = String(error?.message ?? "RAW_RECEIPT_INVALID");
    const code = rawCode === "RAW_TRANSFER_EMITTER" ? "ARC_IDENTITY_PROVENANCE" : rawCode === "RAW_RECEIPT_NOT_SUCCESS" ? "ARC_RECEIPT_NOT_SUCCESS" : `ARC_${rawCode}`;
    return { valid: false, code, recovery: "Retain OPEN; raw Arc topics/data failed the typed decoder and must be re-read from the same receipt." };
  }
  const bytes32 = (value) => typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
  if (!bytes32(receipt.transactionHash) || !bytes32(receipt.blockHash) || receipt.receiptKey !== `${receipt.chainId}:${receipt.transactionHash}` || receipt.eventKey !== `${receipt.receiptKey}:settlement-executed`) return { valid: false, code: "ARC_RECEIPT_IDENTITY", recovery: "Retain OPEN; receipt, block and event identity must be typed and internally consistent." };
  if (caseBinding) {
    const actual = receipt.caseBinding;
    const fields = ["caseId", "companyId", "profileId", "origin", "sourceDocument", "treasuryId", "policyId", "transferId"];
    if (!actual || fields.some((field) => String(actual[field] ?? "") !== String(caseBinding[field] ?? ""))) return { valid: false, code: "ARC_CASE_BINDING", recovery: "Retain OPEN; bind receipt to the exact case, company, profile, source, treasury and policy identity." };
  }
  if (!Array.isArray(logs) || logs.length !== 3) return { valid: false, code: "ARC_LOG_CARDINALITY", recovery: "Retain OPEN; require exactly ERC20, Arc-system and SettlementExecuted records." };
  if (!logs.every((log, index) => Number.isInteger(Number(log.logIndex)) && (index === 0 || Number(log.logIndex) > Number(logs[index - 1].logIndex)))) return { valid: false, code: "ARC_LOG_ORDER", recovery: "Retain OPEN; inspect the strictly increasing typed log ordering before matching." };
  const variants = logs.map((log) => log.variant).join(",");
  const legalOrders = new Set(["ERC20_USDC,ARC_SYSTEM,SettlementExecuted", "ARC_SYSTEM,ERC20_USDC,SettlementExecuted"]);
  if (!legalOrders.has(variants)) return { valid: false, code: "ARC_LOG_VARIANT", recovery: "Retain OPEN; only the two canonical partial orders are accepted." };
  const erc20 = logs.find((log) => log.variant === "ERC20_USDC");
  const system = logs.find((log) => log.variant === "ARC_SYSTEM");
  const policy = logs.find((log) => log.variant === "SettlementExecuted");
  if (erc20.emitter !== "0x3600000000000000000000000000000000000000" || erc20.token !== "USDC" || system.emitter !== "0xfffffffffffffffffffffffffffffffffffffffe" || system.asset !== "ARC_NATIVE" || policy.emitter !== receipt.to || policy.token !== "0x3600000000000000000000000000000000000000" || receipt.from !== erc20.from || receipt.receiptKey !== `${receipt.chainId}:${receipt.transactionHash}` || !bytes32(receipt.transactionHash) || !bytes32(receipt.blockHash) || receipt.eventKey !== `${receipt.receiptKey}:settlement-executed` || policy.eventKey !== receipt.eventKey || !bytes32(policy.policyId) || !bytes32(policy.transferId) || !bytes32(policy.attestationDigest) || !Number.isInteger(Number(policy.attestationNonce)) || erc20.to !== policy.recipient || system.to !== policy.recipient || erc20.from !== policy.payer || system.from !== policy.payer || policy.payer !== receipt.from) return { valid: false, code: "ARC_IDENTITY_PROVENANCE", recovery: "Retain OPEN; require frozen emitters, token/asset identity, transaction.from, receipt/block/event identity and policy/transfer provenance." };
  const principal = BigInt(amount6 ?? policy.amount ?? 0);
  if (BigInt(policy.amount) !== principal || BigInt(erc20.amount) !== principal || BigInt(system.amount) !== principal * 1_000_000_000_000n) return { valid: false, code: "ARC_SYSTEM_UNIT", recovery: "Retain OPEN; native18 Arc-system value must equal amount6 × 10^12 and remain separate from principal." };
  if (receipt.finality !== "status_1_and_getter_readback_required" || receipt.getterReadback == null || receipt.getterReadback.policyId !== policy.policyId || receipt.getterReadback.transferId !== policy.transferId || receipt.getterReadback.payer !== policy.payer || receipt.getterReadback.recipient !== policy.recipient || String(receipt.getterReadback.amount6) !== String(principal) || String(receipt.getterReadback.attestationNonce) !== String(policy.attestationNonce) || receipt.getterReadback.attestationDigest !== policy.attestationDigest) return { valid: false, code: "ARC_GETTER_READBACK_MISMATCH", recovery: "Retain OPEN; exact getter fields must equal the typed SettlementExecuted record." };
  if (receipt.reorg === "reorg_detected") return { valid: false, code: "ARC_REORG_UNRESOLVED", recovery: "Retain OPEN; resolve the reorg observation before accounting consequence." };
  if (!["reorg_replaces_one_observation_before_accounting_consequence", "confirmed_no_reorg"].includes(receipt.reorg)) return { valid: false, code: "ARC_REORG_STATE_INVALID", recovery: "Retain OPEN; record a typed reorg state before accounting consequence." };
  if (receipt.reorg === "reorg_replaces_one_observation_before_accounting_consequence") return { valid: false, code: "ARC_REORG_UNRESOLVED", recovery: "Retain OPEN; resolve the reorg observation before accounting consequence." };
  return { valid: true, code: "ARC_RECEIPT_VALID" };
}

// Browser-safe raw topic/data decoder. This is intentionally kept in the same
// canonical module as the SettlementCase boundary so normal DOM actions never
// accept a caller-provided semantic `matched` boolean or pre-decoded answer.
const RAW_TOPICS = Object.freeze({
  settlementExecuted: "f2ae771024ececa5c2545bb82960fa3188b5eebc59274ea14b9569ec56886e4e",
  transfer: "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
});
const rawHex = (value) => String(value ?? "").replace(/^0x/, "").toLowerCase();
const rawWord = (data, index = 0) => `0x${rawHex(data).slice(index * 64, (index + 1) * 64)}`;
const rawAddressWord = (data, index = 0) => `0x${rawHex(data).slice(index * 64 + 24, (index + 1) * 64)}`;
const rawTopicAddress = (topic) => `0x${rawHex(topic).slice(-40)}`;
export function decodeRawArcReceipt(receipt) {
  if (!receipt || receipt.chainId !== 5042002 || receipt.status !== 1 || !Array.isArray(receipt.rawLogs)) throw new Error("RAW_RECEIPT_NOT_SUCCESS");
  return receipt.rawLogs.map((log) => {
    if (!Number.isInteger(Number(log.logIndex)) || !Array.isArray(log.topics) || typeof log.data !== "string") throw new Error("RAW_MALFORMED_LOG");
    const topic0 = rawHex(log.topics[0]);
    if (topic0 === RAW_TOPICS.transfer) {
      if (log.topics.length !== 3 || rawHex(log.data).length !== 64) throw new Error("RAW_TRANSFER_LAYOUT");
      const variant = String(log.emitter).toLowerCase() === "0x3600000000000000000000000000000000000000" ? "ERC20_USDC" : String(log.emitter).toLowerCase() === "0xfffffffffffffffffffffffffffffffffffffffe" ? "ARC_SYSTEM" : "UNKNOWN_TRANSFER";
      if (variant === "UNKNOWN_TRANSFER") throw new Error("RAW_TRANSFER_EMITTER");
      return { variant, logIndex: Number(log.logIndex), emitter: String(log.emitter).toLowerCase(), token: variant === "ERC20_USDC" ? "USDC" : undefined, asset: variant === "ARC_SYSTEM" ? "ARC_NATIVE" : undefined, from: rawTopicAddress(log.topics[1]), to: rawTopicAddress(log.topics[2]), amount: BigInt(rawWord(log.data)) };
    }
    if (topic0 !== RAW_TOPICS.settlementExecuted || log.topics.length !== 4 || rawHex(log.data).length !== 64 * 5) throw new Error("RAW_POLICY_LAYOUT");
    return { variant: "SettlementExecuted", eventKey: `${receipt.chainId}:${receipt.transactionHash}:settlement-executed`, logIndex: Number(log.logIndex), emitter: String(log.emitter).toLowerCase(), transferId: rawWord(log.topics[1]), policyId: rawWord(log.topics[2]), token: rawTopicAddress(log.topics[3]), payer: rawAddressWord(log.data, 0), recipient: rawAddressWord(log.data, 1), amount: BigInt(rawWord(log.data, 2)), attestationDigest: rawWord(log.data, 3), attestationNonce: BigInt(rawWord(log.data, 4)) };
  });
}

export function buildCanonicalArcReceipt({ policyContract, payer, recipient, policyId, transferId, attestationDigest, attestationNonce, amount6, transactionHash, chainId = 5042002, status = 1, caseBinding = null } = {}) {
  const n = BigInt(amount6 ?? 0);
  const tx = transactionHash ?? "0x" + "44".repeat(32);
  const padAddress = (address) => `0x${"0".repeat(24)}${String(address ?? "").replace(/^0x/, "").slice(-40)}`;
  const padWord = (value) => {
    const text = String(value ?? "0");
    const normalized = text.startsWith("0x") ? text.slice(2) : /^\d+$/.test(text) ? BigInt(text).toString(16) : text;
    return `0x${normalized.padStart(64, "0")}`;
  };
  const policyTopic = "0xf2ae771024ececa5c2545bb82960fa3188b5eebc59274ea14b9569ec56886e4e";
  const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const policyData = [padAddress(payer), padAddress(recipient), padWord(n.toString()), padWord(attestationDigest), padWord(BigInt(attestationNonce ?? 0).toString())].map((v) => v.replace(/^0x/, "")).join("");
  const transferData = padWord(n.toString());
  const rawLogs = [
    { emitter: "0x3600000000000000000000000000000000000000", topics: [transferTopic, padAddress(payer), padAddress(recipient)], data: transferData, logIndex: 2 },
    { emitter: "0xfffffffffffffffffffffffffffffffffffffffe", topics: [transferTopic, padAddress(payer), padAddress(recipient)], data: padWord((n * 1_000_000_000_000n).toString()), logIndex: 5 },
    { emitter: policyContract, topics: [policyTopic, padWord(transferId), padWord(policyId), padAddress("0x3600000000000000000000000000000000000000")], data: policyData, logIndex: 9 }
  ];
  return {
    chainId, status, from: payer, to: policyContract, transactionHash: tx,
    receiptKey: `${chainId}:${tx}`,
    blockHash: "0x" + "ab".repeat(32),
    eventKey: `${chainId}:${tx}:settlement-executed`,
    logs: [
      { variant: "ERC20_USDC", token: "USDC", emitter: "0x3600000000000000000000000000000000000000", from: payer, to: recipient, amount: n, logIndex: 2 },
      { variant: "ARC_SYSTEM", asset: "ARC_NATIVE", emitter: "0xfffffffffffffffffffffffffffffffffffffffe", from: payer, to: recipient, amount: n * 1_000_000_000_000n, logIndex: 5 },
      { variant: "SettlementExecuted", eventKey: `${chainId}:${tx}:settlement-executed`, emitter: policyContract, transferId, policyId, payer, recipient, amount: n, attestationDigest, attestationNonce: BigInt(attestationNonce ?? 0), logIndex: 9 }
    ],
    rawLogs,
    finality: "status_1_and_getter_readback_required",
    reorg: "confirmed_no_reorg",
    getterReadback: { policyId, transferId, payer, recipient, amount6: n.toString(), attestationDigest, attestationNonce: BigInt(attestationNonce ?? 0).toString() },
    caseBinding
  };
}
