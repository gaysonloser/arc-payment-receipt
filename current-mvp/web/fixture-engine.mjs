import { buildCanonicalArcReceipt, createSettlementCase, projectSettlementCase, rankCandidates, settlementCaseReducer } from "./settlement-case.mjs?rev=v3-a12-c15-readonly";
import { A12_C15_ACCEPTED_ACTION_STATE_MACHINE, A12_C15_ACCEPTED_SCENARIO_PROJECTION_MATRIX } from "./c15-contract.mjs?rev=v3-2-a12-r1-exact-c15";
import {
  C15_UPSTREAM_AUTHORITY_RAW_OBJECT,
  C15_UPSTREAM_AUTHORITY_OBJECT,
  C15_UPSTREAM_AUTHORITY_OBJECT_SHA256,
  C15_UPSTREAM_AUTHORITY_FILE_SHA256,
  C15_UPSTREAM_AUTHORITY_HANDOFF_ID,
  C15_UPSTREAM_AUTHORITY_RECORDS,
  getC15UpstreamAuthority
} from "./c15-upstream-authority.mjs?rev=v3-2-a12-r6-c15-producer-public-authority";
import {
  buildAuthorityObservation,
  projectCurrentReleaseWorkbench,
  simulateCurrentReleaseWorkbench,
  CURRENT_ARC_VERIFIED_PROGRAMME_EVIDENCE,
  CURRENT_ERP_VERIFIED_READ_ONLY_EVIDENCE
} from "./workbench/workbench-projection.mjs?rev=v3-2-a12-simulation-r1";

const common = {
  policyId: "VMC-2026-1187",
  payable: "AP-2026-1187",
  amount: "1,250.00 USDC",
  amount6: "1250000000",
  contractor: "Pixel & Pine Studio",
  milestone: "Contractor website handover",
  hash: "0x8f7a…e92b",
  receipt: "fixture-arc-5b6f…2a82",
  block: "fixture block 52,210,442"
};

const timelines = {
  matched: [
    ["complete", "Evidence dossier submitted", "Handover package and locked evidence hash are present."],
    ["complete", "Reviewer attestation", "Jamie Lee marked the evidence current and within the local TTL."],
    ["circle", "Circle USDC / Arc receipt evaluated", "Typed policy, ERC-20 and system log fixture matches the locked record."],
    ["ready", "ERPNext reconciliation proposal", "Payable AP-2026-1187 is eligible for a close proposal."],
    ["ready", "General ledger proposal", "Prepared only as a local balanced-journal preview."]
  ],
  stale: [
    ["complete", "Evidence dossier submitted", "Handover package and locked evidence hash are present."],
    ["warning", "Reviewer attestation", "The local attestation fixture is past its freshness boundary."],
    ["blocked", "Circle USDC / Arc receipt evaluation", "Receipt cannot justify a close while the evidence condition is stale."],
    ["blocked", "ERPNext reconciliation proposal", "Payable stays OPEN; create an exception review instead."],
    ["blocked", "General ledger proposal", "No journal proposal is created for an unverified condition."]
  ],
  mismatch: [
    ["complete", "Evidence dossier submitted", "Handover package and locked evidence hash are present."],
    ["complete", "Reviewer attestation", "The evidence condition is fresh in this fixture."],
    ["warning", "Circle USDC / Arc receipt evaluated", "Receipt status or typed log identity differs from the locked policy."],
    ["blocked", "ERPNext reconciliation proposal", "Payable stays OPEN; prepare a reversal review instead."],
    ["blocked", "General ledger proposal", "No journal proposal is created for a mismatched receipt."]
  ]
};

export const FIXTURES = {
  matched: {
    key: "matched", label: "Matched", kind: "success", result: "Receipt matched — close proposal ready",
    assistant: "No blocking field remains in this local fixture: the evidence, reviewer condition and receipt readback agree. Review the approval decision; this desk only prepares a close proposal.",
    payable: "settled_reconciled", payableLabel: "CLOSE PROPOSAL", proposal: "close + GL proposal", exception: "None — local reconciliation proposal is ready.",
    journal: ["Dr Accounts Payable · 1,250.00 USDC", "Cr USDC clearing · 1,250.00 USDC"],
    receiptState: "matched", receiptLabel: "Verified local fixture", receiptDetail: "status: 1 · PolicySettled → Transfer → SystemTransfer", readback: "payer: company-treasury-fixture · recipient: supplier-pixel-fixture · amount6: 1250000000",
    logs: ["policyId: fixture-verified-milestone-01", "status: 1", "transaction.from: company-treasury-fixture", "logs: PolicySettled → Transfer → SystemTransfer", "readback: amount6=1250000000 · recipient=supplier-pixel-fixture", "matcher: accepted · logicalPaymentId unique"],
    sideEffect: "none", sideEffectDetail: "No wallet request, transfer or ERP posting.", timeline: timelines.matched
  },
  stale: {
    key: "stale", label: "Stale attestation", kind: "warning", result: "Attestation expired — close rejected",
    assistant: "First blocking field: validUntil / TTL. The reviewer condition is stale, so keep the payable open and request a current evidence review before evaluating a receipt.",
    payable: "payable_open", payableLabel: "OPEN", proposal: "exception proposal", exception: "Exception proposal: refresh reviewer attestation.",
    journal: ["No posting proposed", "Reason: evidence freshness condition failed"],
    receiptState: "rejected", receiptLabel: "Not eligible", receiptDetail: "receipt evaluation blocked before acceptance", readback: "attestation TTL expired · no settlement classification",
    logs: ["policyId: fixture-verified-milestone-01", "attestation: expired at fixture timestamp", "receipt: not accepted", "readback: no settlement classification", "matcher: rejected · no side effect"],
    sideEffect: "none", sideEffectDetail: "No wallet request, transfer or ERP posting.", timeline: timelines.stale
  },
  mismatch: {
    key: "mismatch", label: "Receipt mismatch", kind: "warning", result: "Receipt mismatch — close rejected",
    assistant: "First blocking field: receipt readback identity. The receipt does not agree with the locked amount, identity or ordering rule, so keep the payable open and review a reversal path.",
    payable: "payable_open", payableLabel: "OPEN", proposal: "reversal proposal", exception: "Reversal proposal: resolve receipt identity mismatch.",
    journal: ["No posting proposed", "Reason: receipt/readback did not match the locked policy"],
    receiptState: "rejected", receiptLabel: "Rejected", receiptDetail: "status/log identity mismatch", readback: "policy hash mismatch · logical payment not closed",
    logs: ["policyId: fixture-verified-milestone-01", "status: 0 or unexpected log identity", "readback: mismatch against locked hash", "matcher: rejected · logical payment not closed", "side effect: none"],
    sideEffect: "none", sideEffectDetail: "No wallet request, transfer or ERP posting.", timeline: timelines.mismatch
  }
};

export function createFixtureState(seed = "") {
  // Outcome seeds are deliberately restricted to the Node test harness. A browser
  // URL/query string must never manufacture attested/approved or a receipt result.
  const inTestHarness = typeof window === "undefined" && typeof process !== "undefined";
  const seeded = inTestHarness && Object.hasOwn(FIXTURES, seed);
  const scenario = seeded ? seed : "matched";
  return { scenario, scenarioMode: seeded ? "outcome_fixture" : "control_sequence", attested: seeded, approved: seeded, activePanel: "policy", failureCase: "wrong_network", accountingPreset: "payment_corporate_payable", receiptPurpose: "invoice_collection", sourceDocument: "PINV-2026-044", sourceTouched: false, refundAmount6: "250000000", counterpartyOverride: null, auditEvent: "document", selectedReceiptRecord: null };
}

// Scenario controls are explicit local outcome fixtures. They drive the complete
// product consequence for rehearsal, but never imply a wallet request, broadcast,
// settlement or ERP mutation.
export function applyScenarioFixture(state, scenario) {
  if (!Object.hasOwn(FIXTURES, scenario)) return false;
  state.scenario = scenario;
  state.scenarioMode = "outcome_fixture";
  state.attested = true;
  state.approved = true;
  state.activePanel = "policy";
  state.failureCase = "wrong_network";
  state.auditEvent = "document";
  state.selectedReceiptRecord = null;
  return true;
}

export function evaluateFixture(state) {
  const selected = FIXTURES[state.scenario] ?? FIXTURES.matched;
  if (!state.attested || !state.approved) {
    return {
      ...selected,
      key: "pending", label: "Pending control sequence", kind: "pending", result: "Awaiting separated review and approval",
      assistant: state.attested ? "First blocking field: separate payer approval. Reviewer attestation is recorded; simulate the payer's exact USDC approval before reviewing a decision." : "First blocking field: reviewer attestation. Start with the independent reviewer control; it is not a payer approval.",
      payable: "payable_open", payableLabel: "OPEN", proposal: "none", receiptState: "not evaluated", receiptLabel: "Pending control sequence",
      receiptDetail: "No receipt decision is available before both local controls.", readback: "No external chain request", exception: "No exception yet — control sequence incomplete.",
      logs: ["policyId: fixture-verified-milestone-01", "receipt: not evaluated", "readback: no external chain request"],
      journal: ["No posting proposed", "Reason: reviewer and payer controls are incomplete"], sideEffect: "none", sideEffectDetail: "No wallet request, transfer or ERP posting.",
      timeline: [
        ["complete", "Evidence dossier submitted", "Handover package and locked evidence hash are present."],
        [state.attested ? "complete" : "pending", "Reviewer attestation", state.attested ? "Reviewer fixture recorded; payer approval remains separate." : "Awaiting the independent reviewer fixture."],
        ["pending", "Circle USDC / Arc receipt evaluation", "No typed receipt or readback is evaluated before both local controls."],
        ["blocked", "ERPNext reconciliation proposal", "Original open item remains open until matcher evaluation."],
        ["blocked", "General ledger proposal", "No balanced journal proposal is created before matcher evaluation."]
      ]
    };
  }
  return selected;
}

export function journalPreview(state) {
  const result = evaluateFixture(state);
  return { payable: result.payable, lines: result.journal, sideEffect: result.sideEffect, sideEffectDetail: result.sideEffectDetail, exception: result.exception };
}

export const FAILURE_FIXTURE_OPTIONS = {
  wrong_network: "Wrong network",
  policy_blocklist: "Policy / blocklist",
  rpc_drop: "RPC reject / drop",
  pending: "Pending",
  status_0: "Final status 0",
  readback_mismatch: "Status 1 + mismatch"
};

const failureFixtures = {
  wrong_network: { label: "Wrong network", observed: "chainId 5042001", rule: "Reject: canonical Arc Testnet chainId is 5042002.", recovery: "Switch only to the configured Arc Testnet fixture, then re-run preflight.", payable: "payable_open" },
  policy_blocklist: { label: "Policy / blocklist preflight", observed: "recipient rejected before execution", rule: "Reject before any receipt evaluation.", recovery: "Resolve the policy or blocklist condition; do not simulate a receipt.", payable: "payable_open" },
  rpc_drop: { label: "RPC reject / drop", observed: "no final receipt available", rule: "Pending or dropped is not a settlement result.", recovery: "Keep payable open; inspect retry/recovery only after a fresh owner review.", payable: "payable_open" },
  pending: { label: "Pending / unconfirmed", observed: "transaction hash fixture only", rule: "A hash is not finality and never closes a payable.", recovery: "Wait for final status and readback; do not create a journal proposal.", payable: "payable_open" },
  status_0: { label: "Final status: 0", observed: "receipt status 0", rule: "Final transaction failure; do not classify as settlement.", recovery: "Create an exception review and retain payable open.", payable: "payable_open" },
  readback_mismatch: { label: "Status 1 + readback mismatch", observed: "status 1 but locked policy/readback differs", rule: "Finality is separate from business reconciliation.", recovery: "Create a reversal review; do not close the payable.", payable: "payable_open" }
};

export const ACCOUNTING_PRESETS = {
  payment_advance: { label: "Payment · advance", counterpartyClass: "Supplier", counterparty: "Pixel & Pine Studio", purpose: "prepayment", documentNumber: "PAY-ADV-2026-031", source: "PO-2026-0731", openItem: "Create Supplier advance; supplier AP stays open.", debit: "Supplier advances", credit: "USDC settlement clearing", refundableAmount6: "1250000000", requiresOriginal: false },
  payment_corporate_payable: { label: "Payment · corporate payable", counterpartyClass: "Supplier", counterparty: "Pixel & Pine Studio", purpose: "trade payable", documentNumber: "PAY-AP-2026-1187", source: "PINV-2026-044", openItem: "Close the referenced supplier AP only after a matched receipt/readback.", debit: "Accounts payable — suppliers", credit: "USDC settlement clearing", refundableAmount6: "1250000000", requiresOriginal: false },
  payment_personal_payable: { label: "Payment · personal payable", counterpartyClass: "Employee", counterparty: "Jamie Lee", purpose: "reimbursement", documentNumber: "PAY-EMP-2026-019", source: "EEXP-2026-019", openItem: "Close the referenced employee payable only after a matched receipt/readback.", debit: "Accounts payable — employees", credit: "USDC settlement clearing", refundableAmount6: "1250000000", requiresOriginal: false },
  payment_refund: { label: "Payment refund", counterpartyClass: "Supplier", counterparty: "Pixel & Pine Studio", purpose: "returned prior payment", documentNumber: "PREF-2026-006", source: "PAY-AP-2026-1187", openItem: "Restore the original payment’s advance/payable recovery; never create an independent close.", debit: "USDC settlement clearing", credit: "Original payment recovery account", refundableAmount6: "750000000", requiresOriginal: true },
  receipt: { label: "Receipt", counterpartyClass: "Customer", counterparty: "Northwind Studio", purpose: "invoice_collection", documentNumber: "RCPT-2026-072", source: "SINV-2026-072", openItem: "Close customer AR after a matched receipt/readback.", debit: "USDC settlement clearing", credit: "Accounts receivable — customers", refundableAmount6: "1250000000", requiresOriginal: false },
  receipt_refund: { label: "Receipt refund", counterpartyClass: "Customer", counterparty: "Northwind Studio", purpose: "returned prior receipt", documentNumber: "RREF-2026-009", source: "RCPT-2026-072", openItem: "Restore the original customer AR/advance; never create an independent close.", debit: "Original receipt AR / customer-advance account", credit: "USDC settlement clearing", refundableAmount6: "600000000", requiresOriginal: true }
};

// Presentation labels never define accounting truth. The reducer resolves the customer-advance
// receipt below into its own identity, which makes all seven document profiles addressable.
export const ACCOUNTING_PROFILE_IDS = Object.freeze([
  "payment_advance",
  "payment_corporate_payable",
  "payment_personal_payable",
  "payment_refund",
  "receipt_invoice_collection",
  "receipt_customer_advance",
  "receipt_refund"
]);

export function selectedAccountingProfileId(state) {
  if (state.accountingPreset === "receipt") {
    return state.receiptPurpose === "customer_advance"
      ? "receipt_customer_advance"
      : "receipt_invoice_collection";
  }
  return state.accountingPreset;
}

const refundOriginalRules = Object.freeze({
  payment_refund: {
    Supplier: ["PAY-AP-2026-1187", "PAY-ADV-2026-031"],
    Employee: ["PAY-EMP-2026-019"]
  },
  receipt_refund: { Customer: ["RCPT-2026-072", "RCPT-ADV-2026-012"] }
});

function refundCounterparty(profile, selectedClass) {
  if (profile.label !== "Payment refund" || selectedClass !== "Employee") return { counterparty: profile.counterparty, source: profile.source, recovery: "Original payment recovery account" };
  return { counterparty: "Jamie Lee", source: "PAY-EMP-2026-019", recovery: "Original employee-payment recovery account" };
}

function formatUsdc(amount6) {
  if (!/^\d+$/.test(String(amount6))) return `invalid amount6 (${amount6})`;
  const digits = String(amount6).padStart(7, "0");
  const whole = digits.slice(0, -6).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fractional = digits.slice(-6, -4);
  return `${whole}.${fractional} USDC`;
}

function typedReceiptRecords(document, result) {
  const accepted = result.receiptState === "matched";
  const stale = result.key === "stale";
  const mismatch = result.key === "mismatch";
  const lifecycle = accepted ? "matched" : stale ? "blocked_before_receipt" : mismatch ? "readback_mismatch" : "awaiting_controls";
  const issue = stale
    ? { field: "validUntil / TTL", expected: "current attestation fixture", observed: "expired fixture", recovery: "Refresh reviewer attestation, then re-run the local matcher." }
    : mismatch
      ? { field: "recipient / locked readback", expected: document.recipient, observed: "recipient-mismatch-fixture", recovery: "Inspect the typed receipt and reconcile the locked identity before a reversal review." }
      : !accepted
        ? { field: "reviewer + payer controls", expected: "two completed local controls", observed: "control sequence incomplete", recovery: "Record reviewer attestation and separately review the payer approval fixture." }
        : null;
  const records = [
    {
      id: "policy-event",
      type: "Policy event",
      object: "PolicySettled",
      icon: "file-contract",
      emitter: "policy-fixture",
      block: "52,210,442",
      logIndex: "8",
      fields: [["policyVersion", "VMC-1.0"], ["attestationDigest", "locked-dossier-fixture"], ["amount6", document.amount6], ["payer", document.payer], ["recipient", document.recipient]],
      status: lifecycle,
      issue: stale ? issue : null
    },
    {
      id: "erc20-transfer",
      type: "Circle USDC Transfer",
      object: "Transfer(address,address,uint256)",
      icon: "usdc",
      emitter: "usdc-fixture",
      block: "52,210,442",
      logIndex: "9",
      fields: [["from", document.payer], ["to", mismatch ? "recipient-mismatch-fixture" : document.recipient], ["amount6", document.amount6], ["transaction.from", document.payer]],
      status: lifecycle,
      issue: mismatch ? issue : null
    },
    {
      id: "arc-system-transfer",
      type: "Arc system transfer",
      object: "SystemTransfer",
      icon: "arc",
      emitter: "arc-system-fixture",
      block: "52,210,442",
      logIndex: "10",
      fields: [["chainId", "5042002"], ["logicalPaymentId", common.receipt], ["from", document.payer], ["to", document.recipient], ["amount6", document.amount6]],
      status: lifecycle,
      issue: null
    }
  ];
  const observedRecords = result.receiptState === "not evaluated"
    ? records.map((record) => ({
        ...record,
        object: "Not evaluated — expected record shape",
        emitter: "No observed emitter",
        block: "—",
        logIndex: "—",
        fields: record.fields.map(([name, value]) => [`expected ${name}`, value])
      }))
    : records;
  return {
    lifecycle,
    records: observedRecords,
    issue,
    correlation: result.receiptState === "not evaluated"
      ? "No receipt is observed yet. Three ordered typed records are the expected matcher layout after both local controls complete."
      : "Policy event + ERC-20 Transfer + Arc system Transfer are three ordered records for one logical payment, never three payments."
  };
}

function journalProjection(profile, document, result, errors, amount6, gas) {
  const matched = result.receiptState === "matched" && errors.length === 0;
  const principal = formatUsdc(amount6);
  const pendingReason = errors.length ? errors.join(" ") : result.key === "stale" ? "Attestation freshness is stale." : result.key === "mismatch" ? "Receipt/readback identity differs from the locked record." : "Reviewer and payer controls are incomplete.";
  return {
    status: matched ? "proposal_ready" : "not_postable",
    source: document.source || "Original document required",
    rows: matched ? [
      { account: profile.debit, object: document.source || profile.documentNumber, debit: principal, credit: "—", kind: "principal" },
      { account: profile.credit, object: profile.documentNumber, debit: "—", credit: principal, kind: "principal" }
    ] : [
      { account: "No principal posting", object: pendingReason, debit: "—", credit: "—", kind: "exception" }
    ],
    totals: matched ? { debit: principal, credit: principal, balanced: true } : { debit: "—", credit: "—", balanced: false },
    fee: { account: "Network fee expense (separate)", amount: gas, status: matched ? "local fee proposal only" : "not available before an accepted fixture" },
    recovery: matched ? "Review the local reconciliation proposal; this desk never posts it." : "Keep the original open item unchanged and follow the named exception recovery before proposing a journal.",
    postingBoundary: "Preview only — no ERP write, wallet request, broadcast or transaction."
  };
}

function documentAwareState(profile, state, result, valid, selectedClass, party) {
  const matched = result.receiptState === "matched" && valid;
  const isRefund = profile.requiresOriginal;
  const amount6 = isRefund ? String(state.refundAmount6 ?? "0") : common.amount6;
  const amount = formatUsdc(amount6);
  const receiptAdvance = profile.label === "Receipt" && state.receiptPurpose === "customer_advance";
  const effectivePurpose = receiptAdvance ? "customer advance" : profile.purpose;
  const noun = profile.label === "Payment · advance" ? "Supplier advance" : profile.label === "Payment · corporate payable" ? "Supplier payable" : profile.label === "Payment · personal payable" ? "Employee payable" : profile.label === "Payment refund" ? "Payment refund recovery" : profile.label === "Receipt refund" ? "Receipt refund recovery" : receiptAdvance ? "Customer advance" : "Customer receivable";
  const source = profile.label === "Payment refund" && selectedClass === "Employee" && (!state.sourceDocument || state.sourceDocument === profile.source) ? party.source : state.sourceDocument || party.source;
  const company = "company-treasury-fixture";
  const customer = "customer-northwind-fixture";
  const counterpartyFixture = selectedClass === "Employee" ? "employee-jamie-fixture" : selectedClass === "Customer" ? customer : "supplier-pixel-fixture";
  const isIncomingReceipt = profile.label === "Receipt";
  const payer = isIncomingReceipt ? customer : company;
  const recipient = isIncomingReceipt ? company : counterpartyFixture;
  let railStatus = "OPEN";
  let proposal = "no business close proposal";
  let openItem = "Original open item remains unchanged.";
  let guidance = "Gayson: keep the business item open until the local matcher accepts the full receipt/readback fixture.";
  let accountingStage = ["blocked", "ERPNext reconciliation proposal", "Original open item remains open; resolve the local evidence condition first."];
  let ledgerStage = ["blocked", "General ledger proposal", "No balanced journal proposal is created before the matcher gate."];

  if (matched && profile.label === "Payment · advance") {
    railStatus = "ADVANCE PROPOSAL";
    proposal = "supplier advance proposal";
    openItem = "Create a supplier advance; the referenced supplier AP stays open.";
    guidance = "Gayson: receipt evidence matches. This is a supplier advance, so propose the advance but do not close supplier AP.";
    accountingStage = ["ready", "Supplier advance proposal", "Create a local supplier-advance proposal; supplier AP is deliberately not closed."];
    ledgerStage = ["ready", "Advance journal proposal", "Preview Dr Supplier advances / Cr USDC settlement clearing only."];
  } else if (matched && profile.label === "Payment · corporate payable") {
    railStatus = "CLOSE PROPOSAL";
    proposal = "supplier AP close proposal";
    openItem = "Close supplier AP for the referenced invoice only after the matched readback.";
    guidance = "Gayson: supplier invoice evidence matches. Review the supplier AP close proposal; no payment is sent from this desk.";
    accountingStage = ["ready", "Supplier payable close proposal", "Referenced supplier AP is eligible for a local close proposal."];
    ledgerStage = ["ready", "Supplier payable journal proposal", "Preview Dr Accounts payable — suppliers / Cr USDC settlement clearing."];
  } else if (matched && profile.label === "Payment · personal payable") {
    railStatus = "CLOSE PROPOSAL";
    proposal = "employee payable close proposal";
    openItem = "Close employee payable for the referenced expense claim only after the matched readback.";
    guidance = "Gayson: the employee expense claim matches. Review the employee-payable close proposal; no wallet or ERP posting occurs here.";
    accountingStage = ["ready", "Employee payable close proposal", "Referenced employee expense claim is eligible for a local close proposal."];
    ledgerStage = ["ready", "Employee payable journal proposal", "Preview Dr Accounts payable — employees / Cr USDC settlement clearing."];
  } else if (matched && profile.label === "Receipt" && receiptAdvance) {
    railStatus = "ADVANCE PROPOSAL";
    proposal = "customer advance proposal";
    openItem = "Create a customer advance; do not close customer AR.";
    guidance = "Gayson: customer funds match the fixture. This purpose creates a customer advance, not a customer-AR close.";
    accountingStage = ["ready", "Customer advance proposal", "Create a local customer-advance proposal; customer AR remains unchanged."];
    ledgerStage = ["ready", "Customer advance journal proposal", "Preview Dr USDC settlement clearing / Cr Customer advances."];
  } else if (matched && profile.label === "Receipt") {
    railStatus = "CLOSE PROPOSAL";
    proposal = "customer AR close proposal";
    openItem = "Close customer AR for the referenced invoice only after the matched readback.";
    guidance = "Gayson: customer invoice receipt matches. Review the customer-AR close proposal; this desk never posts the entry.";
    accountingStage = ["ready", "Customer receivable close proposal", "Referenced customer invoice is eligible for a local close proposal."];
    ledgerStage = ["ready", "Customer receivable journal proposal", "Preview Dr USDC settlement clearing / Cr Accounts receivable — customers."];
  } else if (matched && isRefund) {
    railStatus = "RECOVERY PROPOSAL";
    proposal = `${profile.label === "Payment refund" ? "payment" : "receipt"} refund recovery proposal`;
    openItem = `Restore the referenced original ${profile.label === "Payment refund" ? "payment" : "receipt"} open item; do not create an independent close.`;
    guidance = `Gayson: the refund fixture matches. Propose recovery against ${source}; the original business item is restored rather than normally closed.`;
    accountingStage = ["ready", `${profile.label === "Payment refund" ? "Payment" : "Receipt"} refund recovery proposal`, `Reference ${source}; restore its remaining refundable/open-item state.`];
    ledgerStage = ["ready", "Refund recovery journal proposal", `Preview the balanced recovery journal; do not create an independent payable or receivable close.`];
  } else if (!valid) {
    guidance = `Gayson: document classification is blocked. ${valid ? "" : "Correct the selected party, original document or refund amount before any matcher-based proposal."}`;
  } else if (!state.attested) {
    guidance = `Gayson: ${noun} remains OPEN. Record the independent reviewer attestation first; it is not the payer approval and no receipt has been evaluated.`;
  } else if (!state.approved) {
    guidance = `Gayson: reviewer attestation is recorded for ${noun}. Review the separate exact local payer approval next; receipt/readback remains unevaluated and the open item stays OPEN.`;
  } else if (result.key === "stale") {
    guidance = `Gayson: ${noun} remains open because the attestation TTL is stale. Refresh the evidence condition before any proposal.`;
  } else if (result.key === "mismatch") {
    guidance = `Gayson: ${noun} remains open because the receipt/readback does not match the locked record. Review the reversal path.`;
  }

  const reviewerTimeline = !state.attested
    ? ["pending", "Reviewer attestation", "Awaiting the independent reviewer fixture; payer approval remains unavailable."]
    : result.key === "stale"
      ? ["warning", "Reviewer attestation", "The local attestation fixture is past its freshness boundary."]
      : ["complete", "Reviewer attestation", "Independent reviewer fixture is distinct from payer approval."];
  const receiptTimeline = result.receiptState === "not evaluated"
    ? ["pending", "Circle USDC / Arc receipt evaluation", "No typed receipt/readback is evaluated before both local controls complete."]
    : result.key === "mismatch"
      ? ["warning", "Circle USDC / Arc receipt evaluated", "Typed receipt/readback differs from the locked document condition."]
      : result.key === "stale"
        ? ["blocked", "Circle USDC / Arc receipt evaluation", "Receipt cannot justify a proposal while the evidence condition is stale."]
        : ["circle", "Circle USDC / Arc receipt evaluated", "Typed policy, ERC-20 and system log fixture is evaluated against the locked document."];
  const timeline = [
    ["complete", `${profile.label} document prepared`, `${profile.documentNumber} · ${selectedClass} ${party.counterparty} · source ${source || "required"}.`],
    reviewerTimeline,
    receiptTimeline,
    accountingStage,
    ledgerStage
  ];

  const guideTarget = !valid ? 0 : !state.attested || !state.approved ? 1 : result.key === "stale" ? 1 : result.key === "mismatch" ? 2 : 3;
  const guideAction = !valid ? "Fix document classification" : !state.attested ? "Record reviewer attestation" : !state.approved ? "Review separate payer approval" : result.key === "stale" ? "Inspect freshness / validUntil" : result.key === "mismatch" ? "Inspect receipt/readback mismatch" : isRefund ? "Review recovery against original" : "Review local approval decision";

  return {
    noun, source, purpose: effectivePurpose, railStatus, proposal, openItem, guidance, guideTarget, guideAction, timeline,
    title: `${profile.label} · ${profile.documentNumber}`,
    identity: `${selectedClass} · ${party.counterparty}`,
    documentLabel: `${profile.documentNumber} · ${noun}`,
    tray: { document: profile.documentNumber, counterparty: `${selectedClass} · ${party.counterparty}`, openItem: noun, amount },
    amount6, amount, payer, recipient,
    receiptDetail: result.receiptState === "matched" ? `status: 1 · PolicySettled → Transfer → SystemTransfer · amount6: ${amount6}` : result.receiptDetail,
    readback: result.receiptState === "matched" ? `payer: ${payer} · recipient: ${recipient} · amount6: ${amount6}` : `${result.readback} · expected payer: ${payer} · recipient: ${recipient} · amount6: ${amount6}`,
    closeAllowed: matched && !isRefund && profile.label !== "Payment · advance" && !receiptAdvance
  };
}

export function accountingDecision(state) {
  const baseProfile = ACCOUNTING_PRESETS[state.accountingPreset] ?? ACCOUNTING_PRESETS.payment_corporate_payable;
  // A customer advance is a different accounting document, not merely a receipt purpose label.
  // Keep its number, source object, open-item rule and journal accounts bound together so the
  // toolbar, receipt, reconciliation and journal do not inherit invoice-collection identity.
  const profile = baseProfile.label === "Receipt" && state.receiptPurpose === "customer_advance"
    ? {
        ...baseProfile,
        purpose: "customer advance",
        documentNumber: "RCPT-ADV-2026-012",
        source: "CADV-2026-012",
        openItem: "Create a customer advance after a matched receipt/readback; customer AR stays open.",
        debit: "USDC settlement clearing",
        credit: "Customer advances"
      }
    : baseProfile;
  const purpose = profile.label === "Receipt" && state.receiptPurpose === "customer_advance" ? "customer advance" : profile.label === "Receipt" ? "invoice collection" : profile.purpose;
  const profileId = selectedAccountingProfileId(state);
  const isPaymentRefund = profile.label === "Payment refund";
  const permittedClasses = isPaymentRefund ? ["Supplier", "Employee"] : [profile.counterpartyClass];
  const selectedClass = state.counterpartyOverride || profile.counterpartyClass;
  const party = refundCounterparty(profile, selectedClass);
  const credit = profile.label === "Receipt" && purpose === "customer advance" ? "Customer advances" : isPaymentRefund ? party.recovery : profile.credit;
  const amount6 = state.accountingPreset.includes("refund") ? String(state.refundAmount6 ?? "0") : common.amount6;
  const errors = [];
  if (state.counterpartyOverride && !permittedClasses.includes(state.counterpartyOverride)) errors.push(`Counterparty class must be ${permittedClasses.join(" or ")}.`);
  if (profile.requiresOriginal && !state.sourceDocument) errors.push("Original-document reference is required for a refund.");
  const permittedOriginals = refundOriginalRules[profileId]?.[selectedClass] ?? [];
  // A profile switch supplies a compatible fixture source. An operator's source edit is
  // validated immediately; this avoids treating the previous profile's default as an edit.
  if (profile.requiresOriginal && state.sourceTouched && state.sourceDocument && !permittedOriginals.includes(state.sourceDocument)) errors.push(`Original-document reference is incompatible with ${selectedClass} ${profile.label.toLowerCase()}.`);
  const integerAmount = /^\d+$/.test(amount6) ? BigInt(amount6) : null;
  if (profile.requiresOriginal && integerAmount === null) errors.push("Refund amount6 must be a whole-number fixture value.");
  if (profile.requiresOriginal && integerAmount !== null && integerAmount <= 0n) errors.push("Refund amount6 must be greater than zero.");
  if (profile.requiresOriginal && integerAmount !== null && integerAmount > BigInt(profile.refundableAmount6)) errors.push("Refund exceeds the remaining refundable balance.");
  const result = evaluateFixture(state);
  const matched = result.receiptState === "matched";
  const valid = errors.length === 0;
  const isRefund = profile.requiresOriginal;
  const closeAllowed = matched && valid && !isRefund;
  const advanceProposal = profile.label === "Payment · advance" ? "supplier advance proposal ready" : profile.label === "Receipt" && purpose === "customer advance" ? "customer advance proposal ready" : null;
  const receiptAdvanceEffect = profile.label === "Receipt" && purpose === "customer advance" ? "Create customer advance after a matched receipt/readback; do not close customer AR." : profile.openItem;
  const effect = !valid ? "Document blocked; original open item unchanged." : !matched ? "Original open item unchanged until matcher success." : isRefund ? "Refund reconciliation proposal restores the referenced original item." : receiptAdvanceEffect;
  const document = documentAwareState(profile, state, result, valid, selectedClass, party);
  const gas = `0.00022 native18 USDC only after matched fixture; separate expense proposal, never principal ${formatUsdc(amount6)} or refund amount`;
  return {
    profile: { ...profile, id: profileId, counterpartyClass: selectedClass, counterparty: party.counterparty, purpose, credit, amount6 },
    matcher: matched ? "matched receipt/readback fixture" : `${result.label} — no business close`,
    reconciliation: document.proposal,
    openItemEffect: effect,
    exception: valid ? result.exception : errors.join(" "),
    errors,
    balancedJournal: { debit: profile.debit, credit, amount6, balanced: true },
    journal: journalProjection({ ...profile, credit }, document, result, errors, amount6, gas),
    gas,
    document
  };
}

export function operationalView(state) {
  const result = evaluateFixture(state);
  const accounting = accountingDecision(state);
  const document = accounting.document;
  const failure = failureFixtures[state.failureCase ?? "wrong_network"];
  const final = result.receiptState === "matched" ? "final status 1 fixture" : result.receiptState === "rejected" ? "final status rejected fixture" : "not evaluated";
  const receipt = typedReceiptRecords(document, result);
  return {
    policy: [
      ["policyVersion", "VMC-1.0"], ["amount6 cap", document.amount6], ["validUntil / TTL", result.key === "stale" ? "expired fixture" : "2026-08-02T10:00:00Z / 15 min"],
      ["attestationNonce", "42 · replay guard required"], ["payer", document.payer], ["recipient", document.recipient], ["reviewer", "reviewer-jamie-fixture"]
    ],
    firstBlockingField: result.key === "stale" ? "validUntil / TTL" : result.key === "mismatch" ? "receipt readback identity" : !state.attested ? "reviewer attestation" : !state.approved ? "separate payer approval" : "none — all local conditions agree",
    lifecycle: [
      ["Condition", `locked dossier hash and ${document.amount6} amount6 cap`], ["Attestation", state.attested ? "reviewer fixture recorded" : "awaiting independent reviewer fixture"], ["Payer approval", state.approved ? `exact ${document.amount} local approval simulated` : "awaiting separate payer control"], ["Preflight", `network, cap, ${document.recipient} and policy checks`], ["Owner wallet review", "boundary only — no signature request"], ["Submitted / pending", "fixture state only — never settlement success"], ["Final status", final], ["Readback", document.readback], ["Business decision", document.closeAllowed ? `${document.noun}: local close proposal only` : `${document.noun}: ${document.railStatus.toLowerCase()} — no autonomous close`]
    ],
    fee: [
      ["principal", `${document.amount} · amount6 = ${document.amount6}`], ["estimated network fee", "0.00024 native18 USDC · estimate, not quote"], ["maximum network fee", "0.00030 native18 USDC · capped local budget"], ["effective fee after final fixture", result.receiptState === "matched" ? "0.00022 native18 USDC" : "not available without an accepted final fixture"], ["balance rule", "principal + capped native18 gas must be sufficient; gas is not added to principal"]
    ],
    provenance: [
      ["Policy event", `PolicySettled · emitter policy-fixture · block 52,210,442 · logIndex 8 · amount6 ${document.amount6}`], ["ERC-20 Transfer", `USDC fixture · from ${document.payer} · to ${document.recipient} · amount6 ${document.amount6} · logIndex 9`], ["Arc system Transfer", `system fixture · ${document.payer} → ${document.recipient} · same logical payment · logIndex 10`], ["Matcher rule", "block/log order, not timestamp; three correlated records = one logical payment"]
    ],
    receipt,
    failure: { ...failure, openItem: document.noun },
    architecture: [
      ["Minimum necessary", "Custom milestone policy + same-chain Arc USDC ERC-20 transfer + receipt/readback matcher."], ["Network boundary", "Arc Testnet · chain ID 5042002 · deterministic local fixture · no wallet/RPC request."], ["Deliberate non-selections", "No App Kit, Gateway, CCTP, bridge, swap, unified balance, paymaster, autonomous wallet or cross-chain route."], ["Asset model", "USDC amount6 and native18 gas are two interfaces to the same Arc USDC asset; never mix or double-count."], ["Business boundary", "Blockchain finality is technical evidence; ERP close remains a separate matcher-gated business decision."]
    ]
  };
}

export { common };

/*
 * V3.2-A12 deep settlement workbench.
 *
 * This layer is deliberately a projection and fixture engine.  It consumes the
 * frozen C15 SettlementCase interface above but does not add a wallet, RPC or
 * ERP client.  Every value below is labelled as L0 local fixture data so a
 * receipt-shaped object can never be mistaken for live Arc evidence.
 */
export const A12_HISTORICAL_BATCH_ID = "V3.2-A12-DEEP-SETTLEMENT-WORKBENCH-AND-A01H-SEALED-REPLAY-CORRECTION";
export const A12_R7_BATCH_ID = "V3.2-A12-R7-READ-ONLY-TEST-FREEZE-MANIFEST-MACHINE-ALLOWLIST-AND-CANONICAL-RUNTIME-ANCHOR-CLOSURE";
export const A12_R7_PACKET_ID = "arc-erp-product-construction-v3-2-a12-r6-sol-medium-revise-r7-correction-v1";
export const A12_R7_EXCHANGE_SHA256 = "5697aa7c67213b1c05f80ffe3561f136e97b97b982adaee0ccc62467c445829e";
export const A12_R7_VERDICT_ARTIFACT_SHA256 = "23e4c6d40afd7b906298b8d2f791b9918786bc14ce482886ac05e2e372b7d6ed";
export const A12_BATCH_ID = A12_R7_BATCH_ID;
export const A12_CORRECTION_BATCH_ID = A12_R7_BATCH_ID;
export const A12_EVIDENCE_LEVEL = "L0_LOCAL_FIXTURE";
/* R7 is the only active local runtime/freeze anchor. R6 is retained solely as
 * the accepted producer upstream input; R1-R5/A01H are historical values. */
export const A12_R6_HANDOFF_ID = "arc-erp-product-construction-v3-2-c15-r6-producer-public-authority-root-accepted-a12-r6-v1";
export const A12_R6_EXCHANGE_SHA256 = "049db0e7e02520713d36a4d1d4c235e4e6262aad558b6f108142b2d14d206450";
export const A12_R6_C15_AUTHORITY_OBJECT_SHA256 = "503586c7774820eabda1f12282d6b6511cf64b57f3a00e80ca743122f3314232";
export const A12_R6_C15_AUTHORITY_FILE_SHA256 = "35169551a29cc9f6c17bfeebb8554363ba5b5bf60c49b4b5c51210bca271b249";
export const A12_R6_PRODUCER_EVIDENCE_SHA256 = "56801bcc6a3e2e296384907a50336c521b93d0ea4a9861a122ad7e35057a3604";
export const A12_R6_PRODUCER_RUNTIME_SHA256 = "1571f9d2da76ea2d208c21f1b6672c57fc789284e47e42a70496f99809eefd04";
export const A12_R6_PUBLIC_PROJECTION_SHA256 = "92998ff18d6bc46d4ba37059561ee32d4b95025efa7b1067e8dbca3eab735819";
export const A12_R5_PRE_REVIEW_EXCHANGE_SHA256 = "d3a202a246954ec44c9af6a116e85acf1d7fab40c05ad2a6f778e23caf13c5ff";
export const A12_R5_ACCEPTED_C15_PACKET_OBJECT_SHA256 = "5d16399b4cff1d08f5a7bc61fc914b038e190ae5390ebc37c247c17a8984ac47";
export const A12_R5_CORRECTION_PACKET_OBJECT_SHA256 = "ce224ce6b1b1f952f5df3dc721b8f839a9fbb185b2fe1b939b27296c7db44b2b";
export const A12_R5_SCENARIO_PROJECTION_SHA256 = "b587a6d29d654a0b71fea1452bcd5258e7e4aa471d61805e9612c64b9c6c0dff";
export const A12_R5_FULL_SCENARIO_PROJECTION_SHA256 = "4cd52166f76e398e6e264e6e458e2f3c2caaf531fa55d713b538c5fe1a40d581";
export const A12_R5_C15_AUTHORITY_OBJECT_SHA256 = "e3475290f091beca4dab62689201e8c0fca8006dae07464da3626002f03677bd";
export const A12_R5_C15_AUTHORITY_HANDOFF_ID = "arc-erp-product-construction-v3-2-c15-r20-upstream-authority-provenance-a12-r5-v1";
export const A12_C15_INTERFACE_BINDING = Object.freeze({
  packet: A12_R7_PACKET_ID,
  exchangeSha256: A12_R7_EXCHANGE_SHA256,
  packetObjectSha256: A12_R7_VERDICT_ARTIFACT_SHA256,
  interfacePath: "projects/2026-07_Arc_Chain/programme/verified-milestone-close/arc_erp_bridge/scenario_projection.py",
  interfaceSha256: A12_R6_PUBLIC_PROJECTION_SHA256,
  machineContractSha256: A12_R6_PRODUCER_RUNTIME_SHA256,
  r7ExchangeSha256: A12_R7_EXCHANGE_SHA256,
  r7VerdictArtifactSha256: A12_R7_VERDICT_ARTIFACT_SHA256,
  consumedUpstreamExchangeSha256: A12_R6_EXCHANGE_SHA256,
  upstreamAuthorityObjectSha256: A12_R6_C15_AUTHORITY_OBJECT_SHA256,
  upstreamAuthorityFileSha256: A12_R6_C15_AUTHORITY_FILE_SHA256,
  upstreamAuthorityHandoffId: A12_R6_HANDOFF_ID,
  producerEvidenceSha256: A12_R6_PRODUCER_EVIDENCE_SHA256,
  producerRuntimeSha256: A12_R6_PRODUCER_RUNTIME_SHA256,
  readOnlyUpstreamAuthority: true,
  readOnly: true
});

export const A12_WORKSPACE_LAYOUT = Object.freeze({
  desktop: { viewport: "1440x1024", navigation: 208, queue: 300, inspector: 336, inspectorMode: "persistent" },
  compact: { viewport: "1280x800", navigation: 208, queue: 280, inspector: 320, inspectorMode: "persistent" },
  narrow: { viewport: "1024x768", navigation: 176, queue: 248, inspector: 0, inspectorMode: "drawer" }
});

export const A12_CAUSAL_STAGES = Object.freeze([
  { id: "source", label: "Source", verb: "Select source", boundary: "read_only" },
  { id: "classify", label: "Classify", verb: "Confirm classification", boundary: "local_confirmation_only" },
  { id: "allocate", label: "Allocate", verb: "Confirm allocation", boundary: "local_projection_only" },
  { id: "authorize", label: "Authorize", verb: "Prepare authorization", boundary: "unsigned_envelope_only" },
  { id: "settle", label: "Settle", verb: "Observe settlement", boundary: "separate_owner_wallet_gate_or_read_only_observation" },
  { id: "post", label: "Post", verb: "Prepare ERP posting", boundary: "erp_draft_proposal_only_until_separate_owner_gate" },
  { id: "close", label: "Close", verb: "Review close", boundary: "read_only_close_preflight" }
]);

const A12_OUTGOING_DAPP = Object.freeze({
  treasury_session: "ready",
  settlement_policy: "missing",
  unsigned_command_envelope: "missing",
  simulation: "missing",
  wallet_review: "missing",
  receipt_finality: "missing",
  accounting_consequence: "projected"
});
const A12_INCOMING_DAPP = Object.freeze({
  treasury_session: "ready",
  settlement_policy: "not_applicable",
  unsigned_command_envelope: "not_applicable",
  simulation: "not_applicable",
  wallet_review: "not_applicable",
  receipt_finality: "observed",
  accounting_consequence: "projected"
});
const A12_REFUND_INCOMING_DAPP = Object.freeze({
  treasury_session: "ready",
  settlement_policy: "not_applicable",
  unsigned_command_envelope: "not_applicable",
  simulation: "not_applicable",
  wallet_review: "not_applicable",
  receipt_finality: "observed",
  accounting_consequence: "projected"
});
const A12_REFUND_OUTGOING_DAPP = Object.freeze({
  treasury_session: "ready",
  settlement_policy: "missing",
  unsigned_command_envelope: "missing",
  simulation: "missing",
  wallet_review: "missing",
  receipt_finality: "missing",
  accounting_consequence: "projected"
});

/*
 * The C15 producer object is the only authority source for active A12 cases.
 * This index is a read-only view over the generated exchange handoff; it is
 * intentionally created before presentation profiles so profile labels cannot
 * become a second authority store.
 */
const A12_UPSTREAM_RECORD_BY_SCENARIO = Object.freeze(Object.fromEntries(
  C15_UPSTREAM_AUTHORITY_RECORDS.map((record) => [record.scenario, record])
));
const a12UpstreamRecordForScenario = (scenario) => A12_UPSTREAM_RECORD_BY_SCENARIO[scenario] ?? null;
const a12UpstreamProjectionFieldsForScenario = (scenario) => a12UpstreamRecordForScenario(scenario)?.projection_output?.fields ?? {};
const a12UpstreamReceiptProjectionForScenario = (scenario) => a12UpstreamRecordForScenario(scenario)?.receipt_authority?.projection ?? null;
const a12UpstreamAmountDisplay = (record) => {
  const display = record?.receipt_authority?.projection?.principal_amount6_display;
  return display === undefined ? formatUsdc(String(record?.amount6 ?? "")) : `${display} USDC`;
};

const field = (fieldId, label, type = "text") => Object.freeze({ fieldId, label, type });
const A12_PROFILE_PRESENTATION_DEFINITIONS = {
  supplier_payable: {
    id: "supplier_payable", label: "Supplier payable", direction: "outgoing", party: "Supplier", primaryAction: "review_supplier_payment", legacyProfileId: "payment_corporate_payable", sourceDocument: "PINV-2026-044", documentNumber: "PAY-AP-2026-1187", amount6: "1250000000", amount: "1,250.00 USDC", openItem: "Accounts payable stays OPEN until matched receipt and ERP readback.", dappObjects: A12_OUTGOING_DAPP,
    fields: [field("supplier", "Supplier"), field("source_purchase_invoice", "Purchase invoice"), field("due_date", "Due date", "date"), field("outstanding_before_amount6", "Outstanding before", "amount6"), field("payment_terms", "Payment terms"), field("allocation_amount6", "Allocation", "amount6"), field("treasury_wallet", "Treasury wallet", "address"), field("recipient_registry", "Recipient registry"), field("recipient_wallet", "Recipient wallet", "address"), field("policy_cap_amount6", "Policy cap", "amount6"), field("policy_version", "Policy version"), field("policy_expiry", "Policy expiry", "date"), field("allowance_amount6", "Allowance", "amount6"), field("outstanding_after_amount6", "Outstanding after", "amount6")]
  },
  supplier_advance: {
    id: "supplier_advance", label: "Supplier advance", direction: "outgoing", party: "Supplier", primaryAction: "review_supplier_advance", legacyProfileId: "payment_advance", sourceDocument: "PO-2026-0731", documentNumber: "PAY-ADV-2026-031", amount6: "1250000000", amount: "1,250.00 USDC", openItem: "Advance remains unallocated; invoice close is prohibited.", dappObjects: A12_OUTGOING_DAPP,
    fields: [field("supplier", "Supplier"), field("purchase_order_or_request", "Purchase order / request"), field("advance_purpose", "Advance purpose"), field("advance_amount6", "Advance amount", "amount6"), field("unallocated_amount6", "Unallocated amount", "amount6"), field("advance_account", "Advance account"), field("recipient_wallet", "Recipient wallet", "address"), field("policy_cap_amount6", "Policy cap", "amount6"), field("allowance_amount6", "Allowance", "amount6"), field("invoice_close_prohibited_ack", "Invoice close prohibited")]
  },
  employee_payable: {
    id: "employee_payable", label: "Employee payable", direction: "outgoing", party: "Employee", primaryAction: "review_reimbursement", legacyProfileId: "payment_personal_payable", sourceDocument: "EEXP-2026-019", documentNumber: "PAY-EMP-2026-019", amount6: "1250000000", amount: "1,250.00 USDC", openItem: "Employee reimbursement remains OPEN until category and receipt controls agree.", dappObjects: A12_OUTGOING_DAPP,
    fields: [field("employee", "Employee"), field("source_expense_claim", "Expense claim"), field("reimbursement_category", "Reimbursement category"), field("reimbursement_amount6", "Reimbursement amount", "amount6"), field("employee_wallet", "Employee wallet", "address"), field("employee_wallet_registry_interval", "Wallet registry interval"), field("policy_cap_amount6", "Policy cap", "amount6"), field("allowance_amount6", "Allowance", "amount6")]
  },
  customer_invoice_receipt: {
    id: "customer_invoice_receipt", label: "Customer invoice receipt", direction: "incoming", party: "Customer", primaryAction: "match_customer_receipt", legacyProfileId: "receipt_invoice_collection", sourceDocument: "SINV-2026-072", documentNumber: "RCPT-2026-072", amount6: "1250000000", amount: "1,250.00 USDC", openItem: "Customer receivable remains OPEN until receipt identity and invoice allocation agree.", dappObjects: A12_INCOMING_DAPP,
    fields: [field("observed_arc_receipt", "Observed Arc receipt"), field("customer", "Customer"), field("payer_registry", "Payer registry"), field("source_sales_invoice", "Sales invoice"), field("amount_received6", "Amount received", "amount6"), field("observed_sender", "Observed sender", "address"), field("treasury_recipient", "Treasury recipient", "address"), field("receipt_finality_state", "Receipt finality"), field("outstanding_before_amount6", "Outstanding before", "amount6"), field("allocation_amount6", "Allocation", "amount6"), field("canonical_event_key", "Canonical event key")]
  },
  customer_advance: {
    id: "customer_advance", label: "Customer advance", direction: "incoming", party: "Customer", primaryAction: "classify_customer_advance", legacyProfileId: "receipt_customer_advance", sourceDocument: "CADV-2026-012", documentNumber: "RCPT-ADV-2026-012", amount6: "1250000000", amount: "1,250.00 USDC", openItem: "Customer advance liability remains OPEN; customer AR must not be closed.", dappObjects: A12_INCOMING_DAPP,
    fields: [field("observed_arc_receipt", "Observed Arc receipt"), field("customer", "Customer"), field("payer_registry", "Payer registry"), field("amount_received6", "Amount received", "amount6"), field("observed_sender", "Observed sender", "address"), field("canonical_event_key", "Canonical event key"), field("receipt_finality_state", "Receipt finality"), field("sales_order_or_reference", "Sales order / reference"), field("advance_purpose", "Advance purpose"), field("liability_account", "Liability account"), field("unallocated_amount6", "Unallocated amount", "amount6")]
  },
  payment_refund_incoming: {
    id: "payment_refund_incoming", label: "Payment refund incoming", direction: "incoming", party: "Supplier / employee", primaryAction: "verify_incoming_refund", legacyProfileId: "payment_refund", sourceDocument: "PAY-AP-2026-1187", documentNumber: "PREF-IN-2026-006", amount6: "250000000", amount: "250.00 USDC", openItem: "Refund recovery remains OPEN until original identity, ceiling and sender equality agree.", dappObjects: A12_REFUND_INCOMING_DAPP,
    fields: [field("original_outgoing_transaction", "Original outgoing transaction"), field("original_payee_current_sender", "Original payee / current sender"), field("original_voucher", "Original voucher"), field("original_principal_amount6", "Original principal", "amount6"), field("original_event_key", "Original event key"), field("refunded_to_date_amount6", "Refunded to date", "amount6"), field("incoming_refund_transaction", "Incoming refund transaction"), field("refund_event_key", "Refund event key"), field("sender_equality_state", "Sender equality"), field("receipt_finality_state", "Receipt finality"), field("refund_amount6", "Refund amount", "amount6"), field("refund_posting_mode", "Refund posting mode"), field("resolved_recovery_account", "Recovery account"), field("remaining_refund_ceiling_amount6", "Remaining refund ceiling", "amount6")]
  },
  receipt_refund_outgoing: {
    id: "receipt_refund_outgoing", label: "Receipt refund outgoing", direction: "outgoing", party: "Customer", primaryAction: "review_receipt_refund", legacyProfileId: "receipt_refund", sourceDocument: "RCPT-2026-072", documentNumber: "RREF-2026-009", amount6: "250000000", amount: "250.00 USDC", openItem: "Refund obligation remains OPEN until original receipt, recipient equality and ceiling agree.", dappObjects: A12_REFUND_OUTGOING_DAPP,
    fields: [field("original_incoming_transaction", "Original incoming transaction"), field("original_payer", "Original payer"), field("original_voucher", "Original voucher"), field("original_principal_amount6", "Original principal", "amount6"), field("original_event_key", "Original event key"), field("refund_obligation_amount6", "Refund obligation", "amount6"), field("approved_refund_amount6", "Approved refund", "amount6"), field("refunded_to_date_amount6", "Refunded to date", "amount6"), field("exact_recipient_wallet", "Exact recipient wallet", "address"), field("recipient_equality_state", "Recipient equality"), field("policy_id", "Policy ID"), field("allowance_amount6", "Allowance", "amount6"), field("refund_posting_mode", "Refund posting mode"), field("resolved_refund_debit_account", "Refund debit account"), field("remaining_refund_ceiling_amount6", "Remaining refund ceiling", "amount6")]
  },
  unresolved_incoming_outgoing: {
    id: "unresolved_incoming_outgoing", label: "Unresolved incoming / outgoing", direction: "unresolved", party: "Unknown counterparty", primaryAction: "assign_or_keep_unresolved", legacyProfileId: "payment_corporate_payable", sourceDocument: "CHAIN-OBS-2026-090", documentNumber: "UNRES-2026-090", amount6: "1250000000", amount: "1,250.00 USDC", openItem: "No business consequence is available until direction, party and evidence gaps are resolved.", dappObjects: { treasury_session: "ready", settlement_policy: "optional", unsigned_command_envelope: "not_applicable", simulation: "not_applicable", wallet_review: "not_applicable", receipt_finality: "observed", accounting_consequence: "not_applicable" },
    fields: [field("observed_transaction", "Observed transaction"), field("observed_direction", "Observed direction"), field("company_treasury_registry", "Company treasury registry"), field("canonical_event_key", "Canonical event key"), field("observed_from", "Observed from", "address"), field("observed_to", "Observed to", "address"), field("token_address", "Token address", "address"), field("observed_amount6", "Observed amount", "amount6"), field("receipt_finality_reorg_state", "Finality / reorg"), field("candidate_parties", "Candidate parties"), field("evidence_gaps", "Evidence gaps"), field("case_owner", "Case owner"), field("reason_code", "Reason code")]
  }
};
const A12_PROFILE_DEFINITIONS = Object.freeze(Object.fromEntries(Object.entries(A12_PROFILE_PRESENTATION_DEFINITIONS).map(([scenario, profile]) => {
  const upstream = a12UpstreamRecordForScenario(scenario);
  const direction = upstream?.direction === "outbound" ? "outgoing" : upstream?.direction === "inbound" ? "incoming" : "unresolved";
  return [scenario, Object.freeze({
    ...profile,
    direction,
    party: upstream?.party ?? profile.party,
    primaryAction: upstream?.primary_action ?? profile.primaryAction,
    sourceDocument: upstream?.source_document ?? profile.sourceDocument,
    documentNumber: upstream?.payment_id ?? profile.documentNumber,
    amount6: upstream ? String(upstream.amount6) : profile.amount6,
    amount: upstream ? a12UpstreamAmountDisplay(upstream) : profile.amount
  })];
})));
export const A12_SCENARIO_PROFILES = Object.freeze(A12_PROFILE_DEFINITIONS);
// The accepted C15 matrix owns the active scenario universe. Presentation
// profiles below provide local labels/fixture values only and cannot redefine
// runtime schema metadata or omit the unresolved holding case.
export const A12_SCENARIO_IDS = Object.freeze(Object.keys(A12_C15_ACCEPTED_SCENARIO_PROJECTION_MATRIX).filter((key) => !["field_contract", "dapp_object_contract"].includes(key)));
export const A12_MATCHER_STATES = Object.freeze(["pending", "matched", "stale", "mismatch", "reorg", "duplicate"]);
export const A12_REQUIRED_UI_STATES = Object.freeze(["not_applicable", "matched", "stale", "mismatch", "loading", "empty", "permission", "offline", "partial_success", "owner_rejected", "reverted", "final", "reorg"]);
export const A12_DAPP_OBJECT_IDS = Object.freeze(["treasury_session", "settlement_policy", "unsigned_command_envelope", "simulation", "wallet_review", "receipt_finality", "accounting_consequence"]);
export const A12_RECEIPT_PROJECTION_FIELDS = Object.freeze([
  "rpc_provenance", "observation_timestamp", "chain_id", "token_address", "token_decimals", "tx_hash", "from", "to", "nonce", "target", "method", "raw_calldata", "receipt_status", "block_number", "block_hash", "confirmations", "finality_threshold", "principal_amount6_raw", "principal_amount6_display", "gas_used", "effective_gas_price", "actual_fee_native18_raw", "actual_fee_native18_display", "replacement_state", "reorg_state", "canonical_event_key", "policy_event_expected_observed_status_source", "erc20_transfer_expected_observed_status_source", "arc_system_transfer_expected_observed_status_source", "getter_expected_observed_status_source"
]);

const A12_VALUE = Object.freeze({
  supplier: "Pixel & Pine Studio", employee: "Jamie Lee", customer: "Northwind Studio", unknown: "Unknown — assignment required", treasuryWallet: "company-treasury-fixture", recipientWallet: "recipient-registry-fixture", payerWallet: "payer-registry-fixture", chainId: "5042002", token: "USDC"
});
/* Historical A01H replay only. It is not consulted by the active C15
 * authority, receipt projection, comparator or typed evidence validator. */
const A12_LEGACY_REPLAY_VALUE = Object.freeze({
  policyId: "0x" + "11".repeat(32), transferId: "0x" + "22".repeat(32), txHash: "0x" + "55".repeat(32), blockHash: "0x" + "ab".repeat(32), canonicalEventKey: "5042002:0x" + "55".repeat(32) + ":settlement-executed"
});
const A12_PROFILE_VALUE = (profile, fieldId) => {
  const upstreamFields = a12UpstreamProjectionFieldsForScenario(profile.id);
  if (Object.hasOwn(upstreamFields, fieldId)) return upstreamFields[fieldId];
  const values = {
    supplier: A12_VALUE.supplier, employee: A12_VALUE.employee, customer: A12_VALUE.customer,
    source_purchase_invoice: "PINV-2026-044", purchase_order_or_request: "PO-2026-0731", source_expense_claim: "EEXP-2026-019", source_sales_invoice: "SINV-2026-072",
    due_date: "2026-08-12", payment_terms: "Net 30", advance_purpose: "Prepayment against purchase order", advance_amount6: "1250000000", unallocated_amount6: "1250000000", advance_account: "Supplier advances",
    outstanding_before_amount6: "1250000000", allocation_amount6: profile.amount6, outstanding_after_amount6: "0", reimbursement_category: "Software services", reimbursement_amount6: profile.amount6,
    treasury_wallet: A12_VALUE.treasuryWallet, recipient_wallet: A12_VALUE.recipientWallet, employee_wallet: A12_VALUE.payerWallet, recipient_registry: "registry:recipient-v3", payer_registry: "registry:payer-v3", employee_wallet_registry_interval: "2026-08-01 → 2026-08-31",
    policy_cap_amount6: profile.amount6, allowance_amount6: profile.amount6, policy_version: "VMC-1.0", policy_expiry: "2026-08-06T04:00:00+08:00", invoice_close_prohibited_ack: true,
    observed_arc_receipt: "Observed receipt fixture", amount_received6: profile.amount6, observed_sender: A12_VALUE.payerWallet, treasury_recipient: A12_VALUE.treasuryWallet, receipt_finality_state: "status_1 + getter readback required", canonical_event_key: "Awaiting typed source value",
    sales_order_or_reference: "Awaiting typed source value", liability_account: "Awaiting typed source value", original_outgoing_transaction: "Awaiting typed source value", original_payee_current_sender: "Awaiting typed source value", original_voucher: "Awaiting typed source value", original_principal_amount6: "Awaiting typed source value", original_event_key: "Awaiting typed source value", refunded_to_date_amount6: "Awaiting typed source value", incoming_refund_transaction: "Awaiting typed source value", refund_event_key: "Awaiting typed source value", sender_equality_state: "Awaiting typed source value", refund_amount6: profile.amount6, refund_posting_mode: "Awaiting typed source value", resolved_recovery_account: "Awaiting typed source value", remaining_refund_ceiling_amount6: profile.amount6,
    original_incoming_transaction: "Awaiting typed source value", original_payer: "Awaiting typed source value", refund_obligation_amount6: profile.amount6, approved_refund_amount6: profile.amount6, exact_recipient_wallet: "Awaiting typed source value", recipient_equality_state: "Awaiting typed source value", policy_id: "Awaiting typed source value", resolved_refund_debit_account: "Awaiting typed source value",
    observed_transaction: "Awaiting typed source value", observed_direction: "Awaiting typed source value", company_treasury_registry: "Awaiting typed source value", observed_from: "Awaiting typed source value", observed_to: "Awaiting typed source value", token_address: "Awaiting typed source value", observed_amount6: profile.amount6, receipt_finality_reorg_state: "Awaiting typed source value", candidate_parties: "Awaiting typed source value", evidence_gaps: "Awaiting typed source value", case_owner: "Awaiting typed source value", reason_code: "Awaiting typed source value"
  };
  return values[fieldId] ?? "Awaiting typed source value";
};

const a12Clone = (value) => typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
const a12DeepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) a12DeepFreeze(child);
  return value;
};
const a12Normalize = (value) => {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(a12Normalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, a12Normalize(value[key])]));
  return value;
};
export const a12CanonicalJson = (value) => JSON.stringify(a12Normalize(value));

function a12StateLabel(matcherState) {
  return matcherState === "pending" ? "Not evaluated" : matcherState === "matched" ? "Matched" : matcherState === "stale" ? "Stale" : matcherState === "mismatch" ? "Mismatch" : matcherState === "reorg" ? "Reorg unresolved" : "Duplicate rejected";
}
function a12StateTone(matcherState) {
  return matcherState === "matched" ? "success" : matcherState === "pending" ? "neutral" : "danger";
}
function a12Observed(matcherState) {
  return matcherState !== "pending";
}
function a12ReceiptStatus(matcherState) {
  if (matcherState === "pending") return "not_observed";
  if (matcherState === "matched") return "1";
  if (matcherState === "stale") return "1_but_stale_evidence";
  if (matcherState === "reorg") return "1_reorg_unresolved";
  if (matcherState === "duplicate") return "1_duplicate_event";
  return "1_identity_mismatch";
}
function a12FinalityState(matcherState) {
  if (matcherState === "matched") return "final";
  if (matcherState === "stale") return "observed";
  if (matcherState === "reorg") return "reverted";
  if (matcherState === "mismatch" || matcherState === "duplicate") return "rejected";
  return "observed";
}
function a12StateBoundary(matcherState) {
  const common = { accountingConsequence: "not_posted", businessClose: "OPEN", liveArc: false, liveErp: false };
  if (matcherState === "matched") return { ...common, accountingConsequence: "projected_not_posted", recovery: "Prepare ERP draft and require separate typed readback; technical match is not ERP posting." };
  if (matcherState === "stale") return { ...common, recovery: "Refresh evidence TTL, retain the original open item and re-run the matcher." };
  if (matcherState === "mismatch") return { ...common, recovery: "Inspect receipt identity and ordered logs; retain OPEN and prepare a named recovery." };
  if (matcherState === "reorg") return { ...common, recovery: "Resolve the replacement observation before any accounting consequence." };
  if (matcherState === "duplicate") return { ...common, recovery: "Deduplicate by canonical event key; one logical payment and no second consequence." };
  return { ...common, recovery: "Select typed source evidence; no receipt decision or accounting consequence is available." };
}
function a12FieldProjection(profile, matcherState) {
  // Field metadata is copied from the exact accepted C15 schema. The
  // presentation profile supplies values only; it is never a second contract.
  const contractFields = A12_C15_SCENARIO_SCHEMA[profile.id]?.fields ?? [];
  return contractFields.map((definition) => ({
    fieldId: definition.field_id,
    label: definition.field_id.replaceAll("_", " "),
    type: definition.type,
    source: definition.source,
    editability: definition.editability,
    requiredness: definition.requiredness,
    validator: definition.validator,
    reset_dependencies: definition.reset_dependencies,
    value: A12_PROFILE_VALUE(profile, definition.field_id),
    observedAt: matcherState === "pending" ? null : "2026-08-06T01:00:00+08:00",
    fingerprint: `fixture-field-${definition.field_id}-a12`,
    truthClass: matcherState === "pending" ? "not_evaluated" : "local_observation",
    editable: ["editable", "confirm", "select"].includes(definition.editability)
  }));
}
function a12ReceiptProjection(profile, matcherState, caseId = null, origin = null) {
  const observed = a12Observed(matcherState);
  const source = observed ? "C15 upstream receipt authority · local fixture" : "C15 upstream receipt authority · expected layout only";
  if (observed) {
    const authority = a12CanonicalReceiptAuthority({ profile, outcome: matcherState, caseId, scenario: profile.id, origin, authorityId: a12AuthorityForScenario(profile.id)?.authority_id });
    return A12_RECEIPT_PROJECTION_FIELDS.map((fieldId) => ({
      fieldId,
      value: authority.projection[fieldId],
      source,
      truthClass: "upstream_local_observation",
      observedAt: authority.projection.observation_timestamp,
      fingerprint: `fixture-receipt-${fieldId}-a12`
    }));
  }
  const upstream = a12UpstreamReceiptProjectionForScenario(profile.id);
  return A12_RECEIPT_PROJECTION_FIELDS.map((fieldId) => ({
    fieldId,
    value: ["finality_threshold", "token_decimals"].includes(fieldId) ? upstream?.[fieldId] ?? "expected_layout_only" : "not_observed",
    source,
    truthClass: "not_evaluated",
    observedAt: null,
    fingerprint: `fixture-receipt-${fieldId}-a12`
  }));
}
function a12ReceiptRecords(profile, matcherState) {
  if (matcherState === "pending") return [];
  const authority = a12CanonicalReceiptAuthority({ profile, outcome: matcherState, scenario: profile.id, authorityId: a12AuthorityForScenario(profile.id)?.authority_id });
  return authority.records.map((record) => ({
    ...record,
    recordId: `c15-${record.type}-${record.sequence}`,
    emitter: record.source,
    logIndex: record.order,
    role: record.type
  }));
}
function a12DappObjects(profile, matcherState, receiptProjection, boundary) {
  return A12_DAPP_OBJECT_IDS.map((id) => {
    const state = profile.dappObjects[id];
    const descriptions = {
      treasury_session: "Configured treasury identity; no signing request is created.",
      settlement_policy: state === "not_applicable" ? "Not applicable to an inbound observation." : state === "optional" ? "Optional until direction and case owner are resolved." : "Policy version, cap and expiry are required before authorization.",
      unsigned_command_envelope: state === "not_applicable" ? "Not applicable: this case does not prepare an outbound command." : "Unsigned preview only; no calldata is submitted.",
      simulation: state === "not_applicable" ? "Not applicable: inbound or unresolved observation has no outbound simulation." : matcherState === "matched" ? "Local policy / allowance / unsigned envelope simulation projected; no transaction is signed or submitted." : "Simulation is blocked until policy, allowance and unsigned envelope fields are present.",
      wallet_review: state === "not_applicable" ? "Not applicable: no local wallet action is in scope." : "Review boundary only; owner gate is separate and closed.",
      receipt_finality: state === "missing" ? "No observed receipt; expected fields are rendered as not evaluated." : `Typed fixture status ${a12ReceiptStatus(matcherState)} with ${matcherState === "matched" ? "confirmed" : "recovery required"} finality.`,
      accounting_consequence: state === "not_applicable" ? "No accounting consequence can be inferred." : boundary.accountingConsequence === "projected_not_posted" ? "Balanced ERP/GL projection only; post and close remain separate." : "Open-item projection; no ERP posting or business close."
    };
    return { objectId: id, label: id.replaceAll("_", " "), state, status: state === "missing" ? "missing_required_input" : state, description: descriptions[id], mutationBoundary: id === "wallet_review" ? "owner_gate_closed" : id === "accounting_consequence" ? "erp_draft_only" : id === "simulation" ? "simulation_only_no_sign_or_submit" : "read_only" };
  });
}
function a12CausalRail(profile, matcherState, selectedStage) {
  const completedUntil = matcherState === "matched" ? 4 : matcherState === "pending" ? 1 : 3;
  return A12_CAUSAL_STAGES.map((stage, index) => ({ ...stage, sequence: index + 1, status: index < completedUntil ? "complete" : index === completedUntil ? "active" : "blocked", selected: stage.id === selectedStage, stopCondition: stage.id === "settle" && matcherState !== "matched" ? "Do not infer settlement success from local fixture." : stage.id === "post" ? "Require separate ERP owner gate and typed readback." : stage.id === "close" ? "Chain success never implies ERP posting or business close." : "Proceed only with typed case evidence." }));
}
function a12ActionObjects(profile, matcherState) {
  const primary = profile.primaryAction;
  return [
    { action_id: "source.inspect_source", scenario: profile.id, stage: "source", label: "Inspect source", role: "operator", preconditions: ["case selected"], mutation_boundary: "read_only", consequence: "none", next_state: "source_inspected", stop_condition: "source identity missing", recovery: "assign a source case", next_owner: "operator" },
    { action_id: "classify.confirm_classification", scenario: profile.id, stage: "classify", label: "Confirm classification", role: "operator", preconditions: ["source evidence present"], mutation_boundary: "local_confirmation_only", consequence: "local projection", next_state: "classification_projected", stop_condition: "direction or party unresolved", recovery: "keep unresolved", next_owner: "operator" },
    { action_id: "allocate.confirm_allocation", scenario: profile.id, stage: "allocate", label: "Confirm allocation", role: "operator", preconditions: ["source and amount6 present"], mutation_boundary: "local_projection_only", consequence: "allocation projection", next_state: "allocation_projected", stop_condition: "amount6 exceeds ceiling", recovery: "retain open remainder", next_owner: "operator" },
    { action_id: "authorize.prepare_authorization", scenario: profile.id, stage: "authorize", label: "Prepare authorization", role: "operator", preconditions: ["policy and allowance present"], mutation_boundary: "unsigned_envelope_only", consequence: "unsigned command envelope", next_state: "authorization_ready_for_review", stop_condition: "policy missing or expired", recovery: "refresh policy", next_owner: "owner" },
    { action_id: "settle.observe_settlement", scenario: profile.id, stage: "settle", label: "Observe settlement", role: "observer", preconditions: ["receipt observation available"], mutation_boundary: "separate_owner_wallet_gate_or_read_only_observation", consequence: "typed receipt projection", next_state: matcherState === "matched" ? "receipt_matched" : "receipt_held", stop_condition: "status, identity, finality or reorg unresolved", recovery: "retain OPEN and re-read typed evidence", next_owner: "09_Circle_or_owner" },
    { action_id: "post.prepare_erp_posting", scenario: profile.id, stage: "post", label: "Prepare ERP posting", role: "operator", preconditions: ["matched receipt and allocation"], mutation_boundary: "erp_draft_proposal_only_until_separate_owner_gate", consequence: "Payment Entry / Bank Transaction draft", next_state: "erp_draft", stop_condition: "typed ERP readback missing", recovery: "keep draft non-postable", next_owner: "09_Circle_or_owner" },
    { action_id: "close.review_close", scenario: profile.id, stage: "close", label: "Review close", role: "reviewer", preconditions: ["ERP readback, GL/PLED and period controls"], mutation_boundary: "read_only_close_preflight", consequence: "close preflight only", next_state: "close_review", stop_condition: "any control remains OPEN", recovery: "retain business item OPEN", next_owner: "reviewer" },
    { action_id: `${primary}.primary`, scenario: profile.id, stage: "source", label: primary, role: "operator", preconditions: ["profile-specific fields complete"], mutation_boundary: "no_external_mutation", consequence: "local next-step request", next_state: "review_requested", stop_condition: "any required field unresolved", recovery: "inspect missing field", next_owner: "operator" }
  ];
}

function createA12ProjectionFixture({ scenario = "supplier_payable", matcherState = "pending", selectedStage = "work-queue", origin } = {}) {
  const profile = A12_PROFILE_DEFINITIONS[scenario] ?? A12_PROFILE_DEFINITIONS.supplier_payable;
  const authority = a12AuthorityForScenario(profile.id);
  const normalizedState = A12_MATCHER_STATES.includes(matcherState) ? matcherState : "pending";
  const boundary = a12StateBoundary(normalizedState);
  if (!authority && profile.id === "unresolved_incoming_outgoing") {
    const unresolvedCaseId = "A12-R6-UNRESOLVED-HOLD-001";
    return a12DeepFreeze({
      batchId: A12_BATCH_ID, evidenceLevel: A12_EVIDENCE_LEVEL, localOnly: true, liveArc: false, liveErp: false, externalActions: 0,
      scenario: profile.id, legacyProfileId: profile.legacyProfileId, caseId: unresolvedCaseId, origin: "unresolved", authorityId: null,
      authorityEnvelopeSha256: A12_AUTHORITY_ENVELOPE_SHA256, packetObjectSha256: A12_R6_C15_AUTHORITY_OBJECT_SHA256, scenarioProjectionSha256: A12_R6_PRODUCER_RUNTIME_SHA256, upstreamAuthorityObjectSha256: C15_UPSTREAM_AUTHORITY_OBJECT_SHA256,
      matcherState: "pending", matcherLabel: "Not evaluated", matcherTone: "neutral", selectedStage, profile: a12Clone(profile), fields: a12FieldProjection(profile, "pending"), dappObjects: a12DappObjects(profile, "pending", null, boundary), receiptProjection: null, receiptRecords: [], causalRail: a12CausalRail(profile, "pending", selectedStage), actionObjects: a12ActionObjects(profile, "pending"), boundary,
      source: { documentNumber: profile.documentNumber, sourceDocument: profile.sourceDocument, party: profile.party, direction: "unresolved", amount6: profile.amount6, amount: profile.amount, openItem: profile.openItem, truthClass: "unresolved_no_upstream_authority" },
      accounting: { status: "not_available", paymentEntry: "Not prepared", bankTransaction: "Not prepared", ledger: "Not available", outstanding: "OPEN", businessClose: "OPEN", principal: { amount6: profile.amount6, display: profile.amount, unit: "amount6", status: "unresolved" }, networkFee: { amount: "Not observed", unit: "native18", status: "separate" } },
      inspector: { activeTab: "Business", tabs: ["Business", "Arc", "ERP", "Ledger", "Audit"], claims: { observedReceipt: "not evaluated", erpPosting: "not posted", businessClose: "OPEN" } },
      localClaims: { isLiveArcGate: false, isLiveErpGate: false, chainSuccessImpliesErpPosting: false, chainSuccessImpliesBusinessClose: false, fixtureCanSatisfyLiveGate: false },
      replay: { a01h: "historical_only", upstream: "r6_no_authority_unresolved", sourceInterfaceReadOnly: true }
    });
  }
  if (!authority) throw new Error(`A12_R7_ACTIVE_PRODUCER_SCENARIO_UNAVAILABLE:${profile.id}`);
  const resolvedOrigin = authority.origin;
  const caseId = authority.case_id;
  const receiptProjection = a12ReceiptProjection(profile, normalizedState, caseId, resolvedOrigin);
  const records = a12ReceiptRecords(profile, normalizedState);
  const state = {
    batchId: A12_BATCH_ID, evidenceLevel: A12_EVIDENCE_LEVEL, localOnly: true, liveArc: false, liveErp: false, externalActions: 0,
    scenario: profile.id, legacyProfileId: profile.legacyProfileId, caseId, origin: resolvedOrigin, authorityId: authority.authority_id, authorityEnvelopeSha256: A12_AUTHORITY_ENVELOPE_SHA256, packetObjectSha256: A12_R6_C15_AUTHORITY_OBJECT_SHA256, scenarioProjectionSha256: A12_R6_PRODUCER_RUNTIME_SHA256, upstreamAuthorityObjectSha256: C15_UPSTREAM_AUTHORITY_OBJECT_SHA256, upstreamAuthorityFileSha256: C15_UPSTREAM_AUTHORITY_FILE_SHA256, producerEvidenceSha256: A12_R6_PRODUCER_EVIDENCE_SHA256, matcherState: normalizedState, matcherLabel: a12StateLabel(normalizedState), matcherTone: a12StateTone(normalizedState), selectedStage, profile: a12Clone(profile), fields: a12FieldProjection(profile, normalizedState), dappObjects: a12DappObjects(profile, normalizedState, receiptProjection, boundary), receiptProjection, receiptRecords: records, causalRail: a12CausalRail(profile, normalizedState, selectedStage), actionObjects: a12ActionObjects(profile, normalizedState), boundary,
    source: { documentNumber: profile.documentNumber, sourceDocument: profile.sourceDocument, party: profile.party, direction: profile.direction, amount6: profile.amount6, amount: profile.amount, openItem: profile.openItem, truthClass: "local_fixture" },
    accounting: { status: boundary.accountingConsequence, paymentEntry: normalizedState === "matched" ? "Draft / typed readback required" : "Not prepared", bankTransaction: normalizedState === "matched" ? "Draft / reconciliation required" : "Not prepared", ledger: normalizedState === "matched" ? "Projected balanced GL / PLED" : "Not available", outstanding: normalizedState === "matched" ? "Before → after projection; remains owner-controlled" : "OPEN", businessClose: boundary.businessClose, principal: { amount6: profile.amount6, display: profile.amount, unit: "amount6", status: "separate" }, networkFee: { amount: normalizedState === "pending" ? "Not observed" : "0.00022 native18", unit: "native18", status: "separate" } },
    inspector: { activeTab: "Business", tabs: ["Business", "Arc", "ERP", "Ledger", "Audit"], claims: { observedReceipt: normalizedState === "pending" ? "not evaluated" : "local typed receipt fixture", erpPosting: "not posted", businessClose: "OPEN" } },
    localClaims: { isLiveArcGate: false, isLiveErpGate: false, chainSuccessImpliesErpPosting: false, chainSuccessImpliesBusinessClose: false, fixtureCanSatisfyLiveGate: false },
    replay: { a01h: "historical_only", upstream: "r6_accepted_read_only", sourceInterfaceReadOnly: true }
  };
  return a12DeepFreeze(state);
}

const A12_REPLAY_CASE = Object.freeze({ caseId: "A12-A01H-SEALED-REPLAY-001", companyId: "Gayson Labs Pte Ltd", treasuryId: "company-treasury-fixture", profileId: "payment_corporate_payable", origin: "erp_initiated", sourceDocument: "PINV-2026-044", amount6: "1250000000" });
function a12ReplayEvidence(state, tier = "A") {
  const observationId = `a12-replay-observation-${state.revision + 1}`;
  return { tier, observationId, source: "typed_server_evidence", roles: { reviewer: "reviewer-a12-replay", payer: "payer-a12-replay", distinct: true }, serverEvidence: { source: "typed_server_evidence", authorityRef: `a12-local-server-evidence:${state.caseId}`, caseId: state.caseId, companyId: state.companyId, treasuryId: state.treasuryId, observationId, tier, roles: { reviewer: "reviewer-a12-replay", payer: "payer-a12-replay", distinct: true } } };
}
function a12ReplayInitial() { return createSettlementCase(A12_REPLAY_CASE); }
function a12ReplayActionLog() {
  const initial = a12ReplayInitial();
  const actions = [
    { type: "SET_SEARCH", party: "Pixel & Pine Studio", document: "PINV-2026-044" },
    { type: "RANK_CANDIDATES" },
    { type: "SELECT_CANDIDATE", candidateId: "payment_corporate_payable-source-001" },
    { type: "SET_EVIDENCE", evidence: a12ReplayEvidence(initial, "A") },
    { type: "SET_ALLOCATION", allocation: { amount6: A12_REPLAY_CASE.amount6, originalReference: A12_REPLAY_CASE.sourceDocument, authority: { role: "operator", operatorId: "operator-a12-replay" } } },
    { type: "RECORD_REVIEWER_ATTESTATION", attestation: { reviewerId: "reviewer-a12-replay", reason: "sealed replay correction fixture", at: "2026-08-06T01:00:00+08:00" } },
    { type: "REVIEW_PAYER_APPROVAL", approval: { payerId: "payer-a12-replay", amount6: A12_REPLAY_CASE.amount6, at: "2026-08-06T01:01:00+08:00" } }
  ];
  let state = initial;
  for (const action of actions) state = settlementCaseReducer(state, action);
  const receipt = buildCanonicalArcReceipt({ policyContract: "0x1000000000000000000000000000000000000001", payer: "0x2000000000000000000000000000000000000002", recipient: "0x3000000000000000000000000000000000000003", policyId: state.policy.policyId, transferId: state.policy.transferId, attestationDigest: state.policy.attestationDigest, attestationNonce: state.policy.attestationNonce, amount6: A12_REPLAY_CASE.amount6, transactionHash: A12_LEGACY_REPLAY_VALUE.txHash, observedAt: "2026-08-10T12:00:00.000Z", validUntil: "2026-08-10T13:00:00.000Z", caseBinding: { caseId: state.caseId, companyId: state.companyId, profileId: state.profileId, origin: state.origin, sourceDocument: A12_REPLAY_CASE.sourceDocument, treasuryId: state.treasuryId, policyId: state.policy.policyId, transferId: state.policy.transferId } });
  actions.push({ type: "READ_ARC_RECEIPT", now: "2026-08-10T12:30:00.000Z", receipt, evidence: a12ReplayEvidence(state, "A") });
  return actions;
}
function a12ReplayApply(actions) {
  let state = a12ReplayInitial();
  const history = [];
  for (const action of actions) {
    state = settlementCaseReducer(state, action);
    if (state.outcome === "blocked") throw new Error(`A12_A01H_REPLAY_BLOCKED:${state.unresolvedReason}`);
    history.push({ type: action.type, revision: state.revision, matcherState: state.matcherState });
  }
  if (state.matcherState !== "matched" || state.outcome !== "matched" || state.receipt?.logicalPaymentId !== `logical:${state.caseId}:${state.policy.transferId}`) throw new Error("A12_A01H_REPLAY_NOT_MATCHED");
  return { state, history };
}
export function replaySealedA01H(actions = a12ReplayActionLog()) {
  const expected = a12ReplayActionLog();
  if (a12CanonicalJson(actions) !== a12CanonicalJson(expected)) throw new Error("A12_A01H_REPLAY_DRIFT: sealed action log is mutated, reordered or duplicated");
  const replay = a12ReplayApply(actions);
  const payload = { batchId: A12_BATCH_ID, correction: "sealed_a01h_replay", case: A12_REPLAY_CASE, actionTypes: replay.history.map((item) => item.type), history: replay.history, matcherState: replay.state.matcherState, logicalPaymentId: replay.state.receipt.logicalPaymentId, receiptIdentity: { transactionHash: replay.state.receipt.transactionHash, receiptKey: replay.state.receipt.receiptKey, eventKey: replay.state.receipt.eventKey, blockHash: replay.state.receipt.blockHash }, liveArc: false, liveErp: false, externalActions: 0 };
  return a12DeepFreeze({ ...payload, actionLog: actions, finalState: replay.state, canonicalPayload: payload });
}
export function buildA01HSealedReplayCorrection() {
  const first = replaySealedA01H();
  const second = replaySealedA01H(a12Clone(first.actionLog));
  const digest = a12CanonicalJson({ canonicalPayload: first.canonicalPayload, actionLog: first.actionLog });
  return a12DeepFreeze({ batchId: A12_BATCH_ID, status: "sealed_local_replay_correction", replayVersion: "a01h-correction-v1", deterministic: digest === a12CanonicalJson({ canonicalPayload: second.canonicalPayload, actionLog: second.actionLog }), replayDigestInput: digest, actionCount: first.actionLog.length, actionTypes: first.canonicalPayload.actionTypes, actionLog: first.actionLog, matcherState: first.canonicalPayload.matcherState, logicalPaymentId: first.canonicalPayload.logicalPaymentId, finalState: first.finalState, liveArc: false, liveErp: false, externalActions: 0 });
}

/*
 * A12 construction delta: the C15 interface is projected into a real operator
 * workbench model.  The earlier fixture helpers above remain available for the
 * historical MVP tests; this model is the only source consumed by the A12 UI.
 * It intentionally uses the exact C15 field/action/object vocabulary and keeps
 * local fixture truth separate from live Arc/ERP gates.
 */
export const A12_SEVEN_SCENARIO_IDS = Object.freeze([
  "supplier_payable",
  "supplier_advance",
  "employee_payable",
  "customer_invoice_receipt",
  "customer_advance",
  "payment_refund_incoming",
  "receipt_refund_outgoing"
]);

export const A12_C15_DAPP_OBJECT_IDS = Object.freeze([
  ...Object.keys(A12_C15_ACCEPTED_SCENARIO_PROJECTION_MATRIX.supplier_payable.dapp_objects),
  "simulation"
]);

export const A12_C15_RECEIPT_FIELDS = Object.freeze([
  "rpc_provenance", "observation_timestamp", "chain_id", "token_address", "token_decimals",
  "tx_hash", "from", "to", "nonce", "target", "method", "receipt_status", "block_number",
  "block_hash", "confirmations", "finality_state", "principal_amount6_raw",
  "principal_amount6_display", "gas_used", "effective_gas_price", "actual_fee_native18_raw",
  "actual_fee_native18_display", "replacement_state", "reorg_state", "canonical_event_key",
  "policy_event_expected_observed_status_source", "erc20_transfer_expected_observed_status_source",
  "arc_system_transfer_expected_observed_status_source", "getter_expected_observed_status_source"
]);

export const A12_C15_VIEWPORT_ORACLE = Object.freeze({
  "1440x1024": { navigation: 208, queue: 300, inspector: 336, tolerance: 16, inspectorMode: "persistent" },
  "1280x800": { navigation: 208, queue: 280, inspector: 320, tolerance: 16, inspectorMode: "persistent" },
  "1024x768": { navigation: 176, queue: 248, inspector: 0, tolerance: 16, inspectorMode: "focus_trapped_drawer" }
});

export const A12_C15_ACTION_STATE_MACHINE = Object.freeze({
  ...A12_C15_ACCEPTED_ACTION_STATE_MACHINE
});

export const A12_C15_TABS = Object.freeze(["Business", "Arc", "ERP", "Ledger", "Audit"]);
const A12_C15_STAGE_TABS = Object.freeze({ source: "Business", classify: "Business", allocate: "Business", authorize: "Arc", settle: "Arc", post: "ERP", close: "Ledger" });
const A12_C15_STAGE_IDS = Object.freeze(A12_CAUSAL_STAGES.map((stage) => stage.id));
const A12_C15_PROVENANCE_SOURCE = Object.freeze({
  erp: "ERPNext projection",
  arc: "Arc receipt fixture",
  policy: "Policy getter fixture",
  wallet: "Treasury registry fixture",
  operator: "Operator confirmation"
});

function a12Humanize(fieldId) {
  return fieldId.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export const A12_C15_SCENARIO_SCHEMA = Object.freeze(Object.fromEntries(
  Object.entries(A12_C15_ACCEPTED_SCENARIO_PROJECTION_MATRIX)
    .filter(([key]) => !["field_contract", "dapp_object_contract"].includes(key))
    .map(([key, contract]) => {
      const envelope = contract.dapp_objects?.unsigned_command ?? contract.dapp_objects?.unsigned_command_envelope;
      return [key, {
        ...contract,
        dapp_objects: {
          ...contract.dapp_objects,
          simulation: {
            applicability: envelope?.applicability === "required" ? "required" : "not_applicable",
            runtime_state: envelope?.applicability === "required" ? "missing" : "not_applicable"
          }
        }
      }];
    })
));
const a12PrimaryActionFor = (scenario) => {
  const actionId = A12_C15_SCENARIO_SCHEMA[scenario]?.primary_action;
  return A12_C15_ACTION_STATE_MACHINE.scenario_primary_actions[actionId] ?? null;
};

function a12FixtureFields(profile, matcherState, overrides = {}) {
  const fields = a12FieldProjection(profile, matcherState);
  return A12_C15_SCENARIO_SCHEMA[profile.id].fields.map((contractField) => {
    const observed = fields.find((field) => field.fieldId === contractField.field_id);
    return { ...contractField, label: a12Humanize(contractField.field_id), value: overrides[contractField.field_id] ?? observed?.value ?? A12_PROFILE_VALUE(profile, contractField.field_id), truthClass: overrides[contractField.field_id] ? "operator_confirmation" : matcherState === "pending" ? "missing" : observed?.truthClass ?? "local_observation", observedAt: observed?.observedAt ?? null, fingerprint: observed?.fingerprint ?? `fixture-field-${contractField.field_id}-a12` };
  });
}

function a12CanonicalReplayPayload(state) {
  const profile = A12_PROFILE_DEFINITIONS[state.selectedScenario] ?? A12_PROFILE_DEFINITIONS.supplier_payable;
  const authority = a12AuthorityForScenario(profile.id);
  const receipt = a12UpstreamReceiptProjectionForScenario(profile.id);
  const policy = receipt?.policy_event_expected_observed_status_source?.expected ?? {};
  return {
    schema: "arc-erp.product-construction.v3.2.a01h.sealed-replay.v2",
    batch_id: A12_BATCH_ID,
    source_interface: A12_C15_INTERFACE_BINDING.interfacePath,
    source_interface_read_only: true,
    case: {
      case_id: authority.case_id,
      scenario: profile.id,
      origin: authority.origin,
      source_document: profile.sourceDocument,
      amount6: profile.amount6
    },
    evidence_binding: {
      case_id: authority.case_id,
      scenario: profile.id,
      source_document: profile.sourceDocument,
      canonical_event_key: receipt?.canonical_event_key ?? "not_observed",
      logical_payment_id: `local-logical:${authority.case_id}:${policy.transfer_id ?? "not_observed"}`,
      evidence_level: A12_EVIDENCE_LEVEL
    },
    action_log: (state.history ?? []).map((event) => ({ seq: event.seq, type: event.type, scenario: event.scenario, stage: event.stage, payload: event.payload })),
    final_boundary: {
      matcher_state: state.matcherState,
      wallet_review: state.walletReview,
      erp_posting: "not_posted",
      business_close: "OPEN"
    },
    live_arc: false,
    live_erp: false,
    external_actions: 0
  };
}

/* SHA-256 is kept in the browser module so the sealed replay has a real digest
 * without importing Node's crypto or allowing a network dependency. */
const A12_SHA256_K = Object.freeze([
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
]);
const a12Ror = (value, shift) => (value >>> shift) | (value << (32 - shift));
export function a12Sha256(value) {
  const bytes = new TextEncoder().encode(typeof value === "string" ? value : a12CanonicalJson(value));
  const bitLength = BigInt(bytes.length) * 8n;
  const blockLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(blockLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(blockLength - 8, Number((bitLength >> 32n) & 0xffffffffn));
  view.setUint32(blockLength - 4, Number(bitLength & 0xffffffffn));
  let hash = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  for (let offset = 0; offset < padded.length; offset += 64) {
    const words = new Uint32Array(64);
    for (let i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = a12Ror(words[i - 15], 7) ^ a12Ror(words[i - 15], 18) ^ (words[i - 15] >>> 3);
      const s1 = a12Ror(words[i - 2], 17) ^ a12Ror(words[i - 2], 19) ^ (words[i - 2] >>> 10);
      words[i] = (words[i - 16] + s0 + words[i - 7] + s1) >>> 0;
    }
    let [a,b,c,d,e,f,g,h] = hash;
    for (let i = 0; i < 64; i++) {
      const S1 = a12Ror(e, 6) ^ a12Ror(e, 11) ^ a12Ror(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + A12_SHA256_K[i] + words[i]) >>> 0;
      const S0 = a12Ror(a, 2) ^ a12Ror(a, 13) ^ a12Ror(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      [h,g,f,e,d,c,b,a] = [g,f,e,(d + temp1) >>> 0,c,b,a,(temp1 + temp2) >>> 0];
    }
    hash = hash.map((value, index) => (value + [a,b,c,d,e,f,g,h][index]) >>> 0);
  }
  return hash.map((value) => value.toString(16).padStart(8, "0")).join("");
}

export function verifyA12C15UpstreamAuthorityObject() {
  const { object_sha256: declared, ...body } = C15_UPSTREAM_AUTHORITY_RAW_OBJECT;
  if (declared !== C15_UPSTREAM_AUTHORITY_OBJECT_SHA256 || a12Sha256(body) !== declared) return { ok: false, reason: "C15_R7_CONSUMED_R6_OBJECT_HASH_INVALID" };
  if (C15_UPSTREAM_AUTHORITY_RAW_OBJECT.schema !== "arc-erp.product-construction.v3.2.c15.producer-public-authority.v1" || C15_UPSTREAM_AUTHORITY_RAW_OBJECT.object_id !== "arc-erp-product-construction-v3-2-c15-r6-producer-public-projection-authority-v1" || C15_UPSTREAM_AUTHORITY_HANDOFF_ID !== A12_R6_HANDOFF_ID) return { ok: false, reason: "C15_R7_CONSUMED_R6_OBJECT_IDENTITY_INVALID" };
  if (C15_UPSTREAM_AUTHORITY_RAW_OBJECT.producer !== "09_Circle" || C15_UPSTREAM_AUTHORITY_RAW_OBJECT.consumer !== "Root" || C15_UPSTREAM_AUTHORITY_RAW_OBJECT.external_actions !== 0 || C15_UPSTREAM_AUTHORITY_RAW_OBJECT.local_fixture_only !== true || C15_UPSTREAM_AUTHORITY_RAW_OBJECT.live_arc !== false || C15_UPSTREAM_AUTHORITY_RAW_OBJECT.live_erp !== false || C15_UPSTREAM_AUTHORITY_RAW_OBJECT.chain_success_implies_erp_posting !== false || C15_UPSTREAM_AUTHORITY_RAW_OBJECT.chain_success_implies_business_close !== false) return { ok: false, reason: "C15_R7_CONSUMED_R6_BOUNDARY_INVALID" };
  if (C15_UPSTREAM_AUTHORITY_RECORDS.length !== 7 || C15_UPSTREAM_AUTHORITY_RAW_OBJECT.profiles?.length !== 7) return { ok: false, reason: "C15_R7_CONSUMED_R6_RECORD_COUNT_INVALID" };
  for (const record of C15_UPSTREAM_AUTHORITY_RECORDS) {
    if (!record.authority_id || !record.case_id || !record.scenario || record.profile_id !== record.scenario || !record.origin || record.receipt_authority?.authority_id !== record.authority_id || record.receipt_authority?.case_id !== record.case_id || record.receipt_authority?.scenario !== record.scenario || record.receipt_authority?.profile_id !== record.profile_id || record.receipt_authority?.origin !== record.origin) return { ok: false, reason: `C15_UPSTREAM_AUTHORITY_RECORD_IDENTITY_INVALID:${record.authority_id ?? "unknown"}` };
  }
  return { ok: true, object_sha256: declared, handoff_id: C15_UPSTREAM_AUTHORITY_HANDOFF_ID, record_count: C15_UPSTREAM_AUTHORITY_RECORDS.length, producer: C15_UPSTREAM_AUTHORITY_OBJECT.producer, consumer: C15_UPSTREAM_AUTHORITY_OBJECT.consumer, external_actions: 0 };
}

export function sealA01HReplay(state) {
  const payload = a12CanonicalReplayPayload(state);
  const canonical = a12CanonicalJson(payload);
  return a12DeepFreeze({
    schema: "arc-erp.product-construction.v3.2.a01h.sealed-replay-receipt.v2",
    version: "a01h-sealed-replay-v2",
    canonical_payload: payload,
    canonical_json: canonical,
    sha256: a12Sha256(canonical),
    deterministic: true,
    evidence_bound: payload.evidence_binding.case_id === payload.case.case_id && payload.evidence_binding.scenario === payload.case.scenario,
    source_interface_read_only: true,
    local_fixture_only: true,
    live_arc: false,
    live_erp: false,
    external_actions: 0
  });
}

export function verifyA01HReplaySeal(sealed) {
  const payload = sealed?.canonical_payload;
  if (!sealed || !payload || sealed.schema !== "arc-erp.product-construction.v3.2.a01h.sealed-replay-receipt.v2") return { ok: false, reason: "A01H_SEAL_SCHEMA_MISSING" };
  if (sealed.canonical_json !== a12CanonicalJson(payload)) return { ok: false, reason: "A01H_SEAL_CANONICAL_BYTES_DRIFT" };
  if (sealed.sha256 !== a12Sha256(sealed.canonical_json)) return { ok: false, reason: "A01H_SEAL_HASH_DRIFT" };
  if (payload.evidence_binding.case_id !== payload.case.case_id || payload.evidence_binding.scenario !== payload.case.scenario) return { ok: false, reason: "A01H_SEAL_EVIDENCE_UNBOUND" };
  if (payload.external_actions !== 0 || payload.live_arc !== false || payload.live_erp !== false) return { ok: false, reason: "A01H_SEAL_EXTERNAL_BOUNDARY" };
  const seqs = payload.action_log.map((event) => event.seq);
  if (seqs.some((seq, index) => seq !== index + 1)) return { ok: false, reason: "A01H_SEAL_ACTION_ORDER_DRIFT" };
  return { ok: true, sha256: sealed.sha256, deterministic: sealed.deterministic === true, evidenceBound: sealed.evidence_bound === true, externalActions: 0 };
}

export const A12_TYPED_EVIDENCE_OUTCOMES = Object.freeze(["matched", "stale", "mismatch", "reorg", "duplicate"]);

const A12_TYPED_EVIDENCE_SCHEMA = "arc-erp.product-construction.v3.2.a12.typed-evidence-fixture.v1";
const A12_TYPED_EVIDENCE_SOURCE = "Arc receipt fixture";
const A12_TYPED_EVIDENCE_RPC_PROVENANCE = "local_typed_receipt_fixture";
const A12_TYPED_RECORD_TYPES = Object.freeze(["policy_event", "erc20_transfer", "arc_system_transfer"]);
const A12_TYPED_FAILURE_STATUSES = Object.freeze(["matched", "stale", "mismatch", "reorg", "duplicate"]);
export const A12_LIFECYCLE_TRANSITION_TYPES = Object.freeze(["LATE_ENTRY", "REPLACEMENT_RESOLUTION", "REVOKE", "REVERSAL"]);

const a12ResetDependentState = (state, scenario) => {
  state.selectedScenario = scenario;
  state.selectedStage = "source";
  state.inspectorTab = "Business";
  state.inspectorOpen = false;
  state.fieldEdits = {};
  state.matcherState = "pending";
  state.evidence = null;
  state.walletReview = "not_prepared";
  state.simulation = { schema: "arc-erp.product-construction.v3.2.c15.simulation.v1", status: "NOT_EVALUATED", runtime_state: "missing", errors: ["SIMULATION_NOT_RUN"], local_fixture_only: true, live_arc: false, live_erp: false, direct_erp_mutation: false, external_actions: 0 };
  state.completedStages = [];
  state.lastAction = null;
  state.history = [];
  state.lifecycleOperations = {};
  state.lifecycleObservations = {};
  state.lastLifecycleResult = null;
  state.revision = 0;
  state.sealedReplay = null;
  return state;
};

function a12TypedStatusFor(outcome) {
  return outcome === "matched" ? "matched" : outcome;
}

/*
 * R5 authority boundary.  C15 owns the typed authority object.  A12 keeps
 * only read-only references and binding metadata; it never creates an
 * authority seed, case identity, receipt projection or receipt truth.
 */
export const A12_AUTHORITY_INPUTS = Object.freeze({
  accepted_c15_packet: Object.freeze({
    id: A12_C15_INTERFACE_BINDING.packet,
    packet_object_sha256: A12_R7_VERDICT_ARTIFACT_SHA256,
    hash_algorithm: "sha256(raw Sol verdict artifact bytes; read-only pointer)"
  }),
  pre_review_exchange: Object.freeze({
    path: "projects/2026-07_Arc_Chain/shared/arc_circle_exchange_v1.json",
    bytes_sha256: A12_R7_EXCHANGE_SHA256,
    append_only: true,
    consumer_read_only: true
  }),
  scenario_projection: Object.freeze({
    scope: "accepted C15 runtime scenario projection matrix without field_contract/dapp_object_contract",
    runtime_sha256: A12_R6_PRODUCER_RUNTIME_SHA256,
    full_matrix_sha256: A12_R6_PUBLIC_PROJECTION_SHA256
  }),
  c15_interface: Object.freeze({
    path: A12_C15_INTERFACE_BINDING.interfacePath,
    sha256: A12_C15_INTERFACE_BINDING.interfaceSha256,
    machine_contract_sha256: A12_C15_INTERFACE_BINDING.machineContractSha256,
    read_only: true
  }),
  upstream_c15_authority: Object.freeze({
    handoff_id: C15_UPSTREAM_AUTHORITY_HANDOFF_ID,
    object_sha256: C15_UPSTREAM_AUTHORITY_OBJECT_SHA256,
    object_path: "projects/2026-07_Arc_Chain/programme/verified-milestone-close/artifacts/v3-c15/c15-r6-producer-public-authority.json",
    producer: C15_UPSTREAM_AUTHORITY_OBJECT.producer,
    consumer: C15_UPSTREAM_AUTHORITY_OBJECT.consumer,
    status: C15_UPSTREAM_AUTHORITY_OBJECT.status,
    record_count: C15_UPSTREAM_AUTHORITY_RECORDS.length,
    read_only_for_a12: true,
    root_acceptance_required: true,
    file_sha256: A12_R6_C15_AUTHORITY_FILE_SHA256,
    producer_evidence_sha256: A12_R6_PRODUCER_EVIDENCE_SHA256,
    producer_runtime_sha256: A12_R6_PRODUCER_RUNTIME_SHA256,
    handoff_id: A12_R6_HANDOFF_ID
  }),
  historical_namespaces: Object.freeze({
    R3: Object.freeze({ status: "historical_only", active: false }),
    R4: Object.freeze({ status: "historical_only", active: false }),
    R5: Object.freeze({ status: "historical_only", active: false }),
    R6: Object.freeze({ status: "historical_upstream_input", active: false, handoff_id: A12_R6_HANDOFF_ID, exchange_sha256: A12_R6_EXCHANGE_SHA256 }),
    A01H: Object.freeze({ status: "historical_only", active: false })
  }),
  historical_r4_verdict_packet: Object.freeze({
    id: "arc-erp-product-construction-v3-2-a12-r4-sol-medium-revise-r5-correction-v1",
    packet_object_sha256: A12_R5_CORRECTION_PACKET_OBJECT_SHA256,
    status: "revise",
    only_next_batch: A12_CORRECTION_BATCH_ID
  })
});

const A12_AUTHORITY_BY_ID = Object.freeze(Object.fromEntries(C15_UPSTREAM_AUTHORITY_RECORDS.map((record) => [record.authority_id, record])));

const A12_AUTHORITY_BINDING_METADATA = Object.freeze(Object.fromEntries(C15_UPSTREAM_AUTHORITY_RECORDS.map((record) => [record.authority_id, Object.freeze({
  authority_id: record.authority_id,
  case_id: record.case_id,
  scenario: record.scenario,
  profile_id: record.profile_id,
  origin: record.origin,
  authority_fingerprint: record.authority_fingerprint,
  projection_output_sha256: a12Sha256(record.projection_output),
  receipt_authority_sha256: a12Sha256(record.receipt_authority)
})])));

const A12_AUTHORITY_ENVELOPE_BODY = a12DeepFreeze({
  schema: "arc-erp.product-construction.v3.2.a12.c15-upstream-authority-binding.v2",
  batch_id: A12_CORRECTION_BATCH_ID,
  authority_source: {
    schema: C15_UPSTREAM_AUTHORITY_OBJECT.schema,
    object_id: C15_UPSTREAM_AUTHORITY_OBJECT.object_id,
    object_sha256: C15_UPSTREAM_AUTHORITY_OBJECT_SHA256,
    producer: C15_UPSTREAM_AUTHORITY_OBJECT.producer,
    consumer: C15_UPSTREAM_AUTHORITY_OBJECT.consumer,
    read_only: true
  },
  allowlisted_authority_ids: Object.keys(A12_AUTHORITY_BY_ID),
  consumed_inputs: A12_AUTHORITY_INPUTS,
  bindings: A12_AUTHORITY_BINDING_METADATA
});

export const A12_AUTHORITY_ENVELOPE_SHA256 = a12Sha256(A12_AUTHORITY_ENVELOPE_BODY);
export const A12_AUTHORITY_ID_ALLOWLIST = Object.freeze(Object.keys(A12_AUTHORITY_BY_ID));
export const A12_ACCEPTED_C15_AUTHORITY_ENVELOPE = a12DeepFreeze({
  ...a12Clone(A12_AUTHORITY_ENVELOPE_BODY),
  authority_envelope_sha256: A12_AUTHORITY_ENVELOPE_SHA256
});

export function getA12AcceptedAuthority(authorityId) {
  return getC15UpstreamAuthority(authorityId) ?? null;
}

function a12AuthorityForScenario(scenario, authorityId = null) {
  const authority = a12UpstreamRecordForScenario(scenario);
  if (!authority || (authorityId !== null && authorityId !== authority.authority_id)) return null;
  return authority;
}

function a12ResolveAcceptedAuthority({ authorityId, caseId, scenario, profileId, origin } = {}) {
  const authority = typeof authorityId === "string" ? getA12AcceptedAuthority(authorityId) : null;
  if (!authority) return { ok: false, reason: "A12_AUTHORITY_UNKNOWN" };
  const bindings = { case_id: caseId, scenario, profile_id: profileId, origin };
  for (const [fieldId, actual] of Object.entries(bindings)) {
    if (actual !== authority[fieldId]) return { ok: false, reason: `A12_AUTHORITY_BINDING_MISMATCH:${fieldId}` };
  }
  return { ok: true, authority };
}

function a12CanonicalPartyAddresses(profile) {
  const authority = a12AuthorityForScenario(profile.id);
  const projection = authority?.receipt_authority?.projection;
  return { from: projection?.from, to: projection?.to };
}

function a12CanonicalCaseAuthority({ profile, caseId, scenario, origin, authorityId }) {
  const authority = a12AuthorityForScenario(scenario, authorityId);
  if (!authority || authority.profile_id !== profile.id) throw new Error("A12_AUTHORITY_BINDING_UNAVAILABLE");
  if ((caseId !== null && caseId !== undefined && caseId !== authority.case_id) || (origin !== null && origin !== undefined && origin !== authority.origin)) throw new Error("A12_UPSTREAM_AUTHORITY_IDENTITY_MISMATCH");
  const receipt = authority.receipt_authority.projection;
  const policy = receipt.policy_event_expected_observed_status_source?.expected ?? {};
  return {
    authority_id: authority.authority_id,
    case_id: authority.case_id,
    scenario: authority.scenario,
    profile_id: authority.profile_id,
    origin: authority.origin,
    direction: authority.direction,
    party: authority.party,
    source_document: authority.source_document,
    document_number: authority.payment_id,
    amount6: authority.amount6,
    amount: `${receipt.principal_amount6_display} USDC`,
    primary_action: authority.primary_action,
    chain_id: receipt.chain_id,
    token_address: receipt.token_address,
    token_decimals: receipt.token_decimals,
    policy_id: policy.policy_id,
    transfer_id: policy.transfer_id,
    canonical_event_key: receipt.canonical_event_key
  };
}

function a12CanonicalReceiptAuthority({ profile, outcome, caseId, scenario, origin, authorityId }) {
  const authority = a12AuthorityForScenario(scenario, authorityId);
  if (!authority || authority.profile_id !== profile.id) throw new Error("A12_AUTHORITY_BINDING_UNAVAILABLE");
  if ((caseId !== null && caseId !== undefined && caseId !== authority.case_id) || (origin !== null && origin !== undefined && origin !== authority.origin)) throw new Error("A12_UPSTREAM_AUTHORITY_IDENTITY_MISMATCH");
  const context = a12CanonicalCaseAuthority({ profile, caseId, scenario, origin, authorityId: authority.authority_id });
  const upstreamProjection = a12UpstreamReceiptProjectionForScenario(scenario);
  if (!upstreamProjection) throw new Error("C15_UPSTREAM_RECEIPT_AUTHORITY_UNAVAILABLE");
  const projection = a12Clone(upstreamProjection);
  const eventSpecs = [
    ["policy_event_expected_observed_status_source", "policy_event", 2],
    ["erc20_transfer_expected_observed_status_source", "erc20_transfer", 0],
    ["arc_system_transfer_expected_observed_status_source", "arc_system_transfer", 1]
  ];
  const controlledStatus = a12TypedStatusFor(outcome);
  for (const [fieldId] of eventSpecs) {
    const source = projection[fieldId];
    if (source && outcome !== "matched") source.status = controlledStatus;
  }
  if (projection.getter_expected_observed_status_source && outcome !== "matched") projection.getter_expected_observed_status_source.status = controlledStatus;
  if (outcome === "stale") {
    projection.confirmations = Math.max(0, Number(projection.finality_threshold) - 1);
  } else if (outcome === "reorg") {
    projection.reorg_state = "reorg_detected";
    projection.replacement_state = "replacement_pending";
  } else if (outcome === "duplicate") {
    projection.replacement_state = "duplicate_rejected";
  } else if (outcome === "mismatch") {
    const transfer = projection.erc20_transfer_expected_observed_status_source;
    const expectedAmount = transfer?.expected?.amount6;
    const forgedAmount = typeof expectedAmount === "number" ? Math.max(0, expectedAmount - 1) : typeof expectedAmount === "string" && /^\d+$/.test(expectedAmount) ? String(Math.max(0, Number(expectedAmount) - 1)) : "mismatch";
    if (transfer?.observed) transfer.observed.amount6 = forgedAmount;
  }
  const projectionRecords = Object.fromEntries(eventSpecs.map(([fieldId, type, order]) => [type, projection[fieldId]]));
  const records = eventSpecs.map(([fieldId, type, order], index) => {
    const typed = projection[fieldId];
    return {
      sequence: index + 1,
      type,
      status: typed?.status,
      source: typed?.source,
      case_id: context.case_id,
      scenario: context.scenario,
      profile_id: context.profile_id,
      transfer_id: context.transfer_id,
      event_name: typed?.event_name,
      amount6: typed?.expected?.amount6,
      from: typed?.expected?.from,
      to: typed?.expected?.to,
      order: typed?.order ?? order,
      expected: typed?.expected,
      observed: typed?.observed
    };
  });
  const getterSource = projection.getter_expected_observed_status_source;
  const getter = {
    case_id: context.case_id,
    scenario: context.scenario,
    profile_id: context.profile_id,
    transfer_id: context.transfer_id,
    event_name: "SettlementGetter",
    amount6: getterSource?.expected?.cap6 ?? context.amount6,
    from: getterSource?.expected?.payer ?? context.receipt_from,
    to: getterSource?.expected?.recipient ?? context.receipt_to,
    order: 3,
    status: getterSource?.status,
    source: getterSource?.source,
    expected: getterSource?.expected,
    observed: getterSource?.observed
  };
  return {
    context,
    projection,
    records,
    getter,
    finality: {
      receipt_status: projection.receipt_status,
      confirmations: projection.confirmations,
      finality_threshold: projection.finality_threshold,
      reorg_state: projection.reorg_state,
      replacement_state: projection.replacement_state
    },
    duplicate_canonical_event: outcome === "duplicate"
  };
}

function a12TypedExpectedObservedStatusSource({ expected, observed, status, order, eventName }) {
  return { expected, observed, status, source: A12_TYPED_EVIDENCE_SOURCE, order, event_name: eventName };
}

function a12TypedReceiptProjection(profile, outcome, caseId, scenario, origin) {
  return a12CanonicalReceiptAuthority({ profile, outcome, caseId, scenario, origin, authorityId: a12AuthorityForScenario(scenario)?.authority_id }).projection;
}

export function createA12TypedEvidence(input, outcome = "matched") {
  const state = input ?? createA12WorkbenchState();
  if (!A12_TYPED_EVIDENCE_OUTCOMES.includes(outcome)) throw new Error(`A12_TYPED_EVIDENCE_OUTCOME_INVALID:${outcome}`);
  const scenario = state.selectedScenario;
  const profile = A12_PROFILE_DEFINITIONS[scenario] ?? A12_PROFILE_DEFINITIONS.supplier_payable;
  const acceptedAuthority = a12AuthorityForScenario(scenario);
  if (!acceptedAuthority) throw new Error(`A12_AUTHORITY_SCENARIO_UNAVAILABLE:${scenario}`);
  const authority = a12CanonicalReceiptAuthority({ profile, outcome, scenario, authorityId: acceptedAuthority.authority_id });
  return a12DeepFreeze({
    schema: A12_TYPED_EVIDENCE_SCHEMA,
    evidence_level: A12_EVIDENCE_LEVEL,
    local_fixture_only: true,
    external_actions: 0,
    authority_id: acceptedAuthority.authority_id,
    packet_object_sha256: A12_R6_C15_AUTHORITY_OBJECT_SHA256,
    scenario_projection_sha256: A12_R6_PRODUCER_RUNTIME_SHA256,
    upstream_authority_object_sha256: C15_UPSTREAM_AUTHORITY_OBJECT_SHA256,
    authority_envelope_sha256: A12_AUTHORITY_ENVELOPE_SHA256,
    authority_input_hashes: {
      packet_object_sha256: A12_R6_C15_AUTHORITY_OBJECT_SHA256,
      scenario_projection_sha256: A12_R6_PRODUCER_RUNTIME_SHA256,
      pre_review_exchange_sha256: A12_R6_EXCHANGE_SHA256,
      upstream_authority_object_sha256: C15_UPSTREAM_AUTHORITY_OBJECT_SHA256,
      authority_envelope_sha256: A12_AUTHORITY_ENVELOPE_SHA256
    },
    case_id: acceptedAuthority.case_id,
    scenario,
    profile_id: authority.context.profile_id,
    origin: authority.context.origin,
    direction: authority.context.direction,
    source_document: authority.context.source_document,
    document_number: authority.context.document_number,
    principal_amount6: authority.context.amount6,
    canonical_event_key: authority.context.canonical_event_key,
    transfer_id: authority.context.transfer_id,
    outcome,
    duplicate_canonical_event: authority.duplicate_canonical_event,
    ordered_records: authority.records,
    getter: authority.getter,
    receipt_projection: authority.projection,
    finality: authority.finality
  });
}

const a12TypedSourcesValid = (source) => source === A12_TYPED_EVIDENCE_SOURCE || source === A12_TYPED_EVIDENCE_RPC_PROVENANCE;
const a12TypedObjectsEqual = (left, right) => a12CanonicalJson(left) === a12CanonicalJson(right);
const a12ReceiptStatusIsOne = (value) => value === 1 || value === "1";

export function validateA12C15TypedEvidence(state, evidence) {
  if (!evidence || evidence.schema !== A12_TYPED_EVIDENCE_SCHEMA) return { ok: false, reason: "TYPED_EVIDENCE_SCHEMA_REQUIRED" };
  if (evidence.local_fixture_only !== true || evidence.evidence_level !== A12_EVIDENCE_LEVEL || evidence.external_actions !== 0) return { ok: false, reason: "TYPED_EVIDENCE_EXTERNAL_BOUNDARY" };
  const profile = A12_PROFILE_DEFINITIONS[state?.selectedScenario];
  const schema = A12_C15_SCENARIO_SCHEMA[state?.selectedScenario];
  const fixture = state?.fixture;
  if (!profile || !schema || !fixture || typeof fixture.caseId !== "string" || fixture.scenario !== state.selectedScenario) return { ok: false, reason: "TYPED_EVIDENCE_CURRENT_CASE_INVALID" };
  if (fixture.scenario !== state.selectedScenario || fixture.profile?.id !== profile.id || fixture.profile?.sourceDocument !== profile.sourceDocument || fixture.profile?.amount6 !== profile.amount6) return { ok: false, reason: "TYPED_EVIDENCE_CURRENT_PROFILE_INVALID" };
  if (!A12_TYPED_EVIDENCE_OUTCOMES.includes(evidence.outcome)) return { ok: false, reason: "TYPED_EVIDENCE_OUTCOME_REQUIRED" };
  const upstreamVerification = verifyA12C15UpstreamAuthorityObject();
  if (!upstreamVerification.ok) return { ok: false, reason: upstreamVerification.reason };
  const authorityCandidate = getA12AcceptedAuthority(evidence.authority_id);
  if (!authorityCandidate) return { ok: false, reason: "A12_AUTHORITY_UNKNOWN" };
  const { authority_envelope_sha256: declaredEnvelopeHash, ...authorityEnvelopeBody } = A12_ACCEPTED_C15_AUTHORITY_ENVELOPE;
  if (declaredEnvelopeHash !== A12_AUTHORITY_ENVELOPE_SHA256 || a12Sha256(authorityEnvelopeBody) !== declaredEnvelopeHash) return { ok: false, reason: "A12_AUTHORITY_ENVELOPE_HASH_INVALID" };
  const expectedHashes = {
    packet_object_sha256: A12_R6_C15_AUTHORITY_OBJECT_SHA256,
    scenario_projection_sha256: A12_R6_PRODUCER_RUNTIME_SHA256,
    upstream_authority_object_sha256: C15_UPSTREAM_AUTHORITY_OBJECT_SHA256,
    authority_envelope_sha256: A12_AUTHORITY_ENVELOPE_SHA256
  };
  for (const [fieldId, expected] of Object.entries(expectedHashes)) {
    if (evidence[fieldId] !== expected) return { ok: false, reason: `A12_AUTHORITY_HASH_INVALID:${fieldId}` };
  }
  const expectedInputHashes = {
    packet_object_sha256: A12_R6_C15_AUTHORITY_OBJECT_SHA256,
    scenario_projection_sha256: A12_R6_PRODUCER_RUNTIME_SHA256,
    pre_review_exchange_sha256: A12_R6_EXCHANGE_SHA256,
    upstream_authority_object_sha256: C15_UPSTREAM_AUTHORITY_OBJECT_SHA256,
    authority_envelope_sha256: A12_AUTHORITY_ENVELOPE_SHA256
  };
  if (!a12TypedObjectsEqual(evidence.authority_input_hashes, expectedInputHashes)) return { ok: false, reason: "A12_AUTHORITY_INPUT_HASHES_INVALID" };
  const authorityResolution = a12ResolveAcceptedAuthority({ authorityId: evidence.authority_id, caseId: evidence.case_id, scenario: evidence.scenario, profileId: evidence.profile_id, origin: evidence.origin });
  if (!authorityResolution.ok) return { ok: false, reason: authorityResolution.reason };
  const authority = authorityResolution.authority;
  const stateAuthority = a12AuthorityForScenario(state.selectedScenario);
  if (!stateAuthority || stateAuthority.authority_id !== authority.authority_id) return { ok: false, reason: "A12_AUTHORITY_STATE_SCENARIO_INVALID" };
  const fixtureBindings = { authority_id: fixture.authorityId, case_id: fixture.caseId, scenario: fixture.scenario, profile_id: fixture.profile?.id, origin: fixture.origin };
  for (const [fieldId, expected] of Object.entries({ authority_id: authority.authority_id, case_id: authority.case_id, scenario: authority.scenario, profile_id: authority.profile_id, origin: authority.origin })) {
    if (fixtureBindings[fieldId] !== expected) return { ok: false, reason: `A12_AUTHORITY_STATE_FIXTURE_BINDING:${fieldId}` };
  }
  const expectedAuthority = a12CanonicalReceiptAuthority({ profile, outcome: evidence.outcome, scenario: state.selectedScenario, authorityId: authority.authority_id });
  const contextAuthority = expectedAuthority.context;
  const contextBindings = {
    authority_id: contextAuthority.authority_id,
    case_id: contextAuthority.case_id,
    scenario: contextAuthority.scenario,
    profile_id: contextAuthority.profile_id,
    origin: contextAuthority.origin,
    direction: contextAuthority.direction,
    source_document: contextAuthority.source_document,
    document_number: contextAuthority.document_number,
    principal_amount6: contextAuthority.amount6,
    canonical_event_key: contextAuthority.canonical_event_key,
    transfer_id: contextAuthority.transfer_id
  };
  for (const [fieldId, expected] of Object.entries(contextBindings)) {
    if (!a12TypedObjectsEqual(evidence[fieldId], expected)) return { ok: false, reason: `TYPED_EVIDENCE_CASE_PROFILE_BINDING:${fieldId}` };
  }
  const projection = evidence.receipt_projection;
  if (!projection || typeof projection !== "object" || A12_RECEIPT_PROJECTION_FIELDS.some((fieldId) => !(fieldId in projection))) return { ok: false, reason: "TYPED_EVIDENCE_RECEIPT_FIELDS_REQUIRED" };
  const expectedProjection = expectedAuthority.projection;
  for (const fieldId of A12_RECEIPT_PROJECTION_FIELDS) {
    if (!a12TypedObjectsEqual(projection[fieldId], expectedProjection[fieldId])) return { ok: false, reason: `TYPED_EVIDENCE_RECEIPT_CANONICAL_BINDING:${fieldId}` };
  }
  if (!a12ReceiptStatusIsOne(projection.receipt_status) || !a12ReceiptStatusIsOne(evidence.finality?.receipt_status)) return { ok: false, reason: "TYPED_EVIDENCE_PROVENANCE_OR_STATUS_INVALID" };
  if (!a12TypedObjectsEqual(evidence.finality, expectedAuthority.finality)) return { ok: false, reason: "TYPED_EVIDENCE_FINALITY_CANONICAL_BINDING" };
  const records = evidence.ordered_records;
  if (!Array.isArray(records) || records.length !== expectedAuthority.records.length || records.some((record, index) => !a12TypedObjectsEqual(record, expectedAuthority.records[index]))) return { ok: false, reason: "TYPED_EVIDENCE_ORDER_CROSS_BINDING" };
  const projectionRecords = [projection.policy_event_expected_observed_status_source, projection.erc20_transfer_expected_observed_status_source, projection.arc_system_transfer_expected_observed_status_source];
  const expectedProjectionRecords = [expectedProjection.policy_event_expected_observed_status_source, expectedProjection.erc20_transfer_expected_observed_status_source, expectedProjection.arc_system_transfer_expected_observed_status_source];
  if (projectionRecords.some((record, index) => !a12TypedObjectsEqual(record, expectedProjectionRecords[index]))) return { ok: false, reason: "TYPED_EVIDENCE_EVENT_CANONICAL_BINDING" };
  const getter = evidence.getter;
  const getterProjection = projection.getter_expected_observed_status_source;
  if (!a12TypedObjectsEqual(getter, expectedAuthority.getter) || !a12TypedObjectsEqual(getterProjection, expectedProjection.getter_expected_observed_status_source)) return { ok: false, reason: "TYPED_EVIDENCE_GETTER_CANONICAL_BINDING" };
  if (evidence.duplicate_canonical_event !== expectedAuthority.duplicate_canonical_event) return { ok: false, reason: "TYPED_EVIDENCE_DUPLICATE_CANONICAL_BINDING" };
  const getterMatched = getter.status === "matched" && a12TypedObjectsEqual(getter.expected, getter.observed);
  const logsMatched = projectionRecords.every((record) => record.status === "matched" && a12TypedObjectsEqual(record.expected, record.observed));
  if (evidence.outcome === "matched") {
    if (!getterMatched || !logsMatched || projection.confirmations < projection.finality_threshold || evidence.duplicate_canonical_event === true) return { ok: false, reason: "TYPED_EVIDENCE_MATCH_VALIDATORS_FAIL_CLOSED" };
  } else if (evidence.outcome === "stale") {
    if (projection.confirmations >= projection.finality_threshold || projection.reorg_state !== "canonical") return { ok: false, reason: "TYPED_EVIDENCE_STALE_FINALITY_INVALID" };
  } else if (evidence.outcome === "mismatch") {
    if (logsMatched && getterMatched) return { ok: false, reason: "TYPED_EVIDENCE_MISMATCH_NOT_EXPLICIT" };
  } else if (evidence.outcome === "reorg") {
    if (projection.reorg_state !== "reorg_detected") return { ok: false, reason: "TYPED_EVIDENCE_REORG_NOT_EXPLICIT" };
  } else if (evidence.outcome === "duplicate" && evidence.duplicate_canonical_event !== true) {
    return { ok: false, reason: "TYPED_EVIDENCE_DUPLICATE_NOT_EXPLICIT" };
  }
  return { ok: true, fail_closed: evidence.outcome !== "matched", outcome: evidence.outcome };
}

function a12Concrete(value) {
  return value !== undefined && value !== null && value !== "" && !["Awaiting typed source value", "expected_layout_only", "not_observed"].includes(value);
}

function a12Amount6(value) {
  if (typeof value === "bigint") return value >= 0n ? value : null;
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) return null;
  try {
    return BigInt(text);
  } catch {
    return null;
  }
}

function a12EqualityConfirmed(value) {
  return value === true || ["equal", "matched", "confirmed", "equality_confirmed"].includes(String(value ?? "").trim().toLowerCase());
}

function a12FrozenPreconditionFacts(state, action, schema) {
  const profile = A12_PROFILE_DEFINITIONS[state.selectedScenario];
  const values = Object.fromEntries(schema.fields.map((field) => [field.field_id, state.fieldEdits[field.field_id] ?? A12_PROFILE_VALUE(profile, field.field_id)]));
  const requiredFieldsValid = schema.fields.filter((field) => field.requiredness === "required").every((field) => a12Concrete(values[field.field_id]));
  const evidenceValidation = state.evidence ? validateA12C15TypedEvidence(state, state.evidence) : { ok: false, reason: "TYPED_EVIDENCE_REQUIRED" };
  const matchedEvidence = state.matcherState === "matched" && state.evidence?.outcome === "matched" && evidenceValidation.ok;
  const normalAmount = a12Amount6(values.allocation_amount6 ?? values.advance_amount6 ?? values.reimbursement_amount6 ?? values.amount_received6 ?? values.refund_obligation_amount6);
  const normalCeiling = a12Amount6(values.outstanding_before_amount6 ?? values.unallocated_amount6);
  const refundAmount = a12Amount6(values.refund_amount6 ?? values.approved_refund_amount6);
  const refundCeiling = a12Amount6(values.remaining_refund_ceiling_amount6);
  const amountWithinOpenItem = state.selectedScenario === "payment_refund_incoming" || state.selectedScenario === "receipt_refund_outgoing"
    ? refundAmount !== null && refundAmount > 0n && refundCeiling !== null && refundAmount <= refundCeiling
    : normalAmount !== null && normalAmount > 0n && (normalCeiling === null || normalAmount <= normalCeiling);
  const approvedRefund = a12Amount6(values.approved_refund_amount6);
  const refundObligation = a12Amount6(values.refund_obligation_amount6);
  const allowance = a12Amount6(values.allowance_amount6);
  const policyCap = a12Amount6(values.policy_cap_amount6);
  const policyAndAllowanceValid = !schema.fields.some((field) => ["policy_cap_amount6", "allowance_amount6"].includes(field.field_id)) || (policyCap !== null && allowance !== null && normalAmount !== null && policyCap >= normalAmount && allowance >= normalAmount);
  const refundApproved = state.selectedScenario !== "receipt_refund_outgoing" || (approvedRefund !== null && approvedRefund > 0n && refundObligation !== null && approvedRefund <= refundObligation && refundCeiling !== null && approvedRefund <= refundCeiling && (allowance === null || allowance >= approvedRefund));
  const withinCeiling = (state.selectedScenario === "payment_refund_incoming" || state.selectedScenario === "receipt_refund_outgoing") && amountWithinOpenItem;
  const facts = {
    case_selected: A12_SCENARIO_IDS.includes(state.selectedScenario),
    source_valid: requiredFieldsValid,
    company_resolved: requiredFieldsValid,
    direction_resolved: state.selectedScenario !== "unresolved_incoming_outgoing",
    profile_resolved: state.selectedScenario !== "unresolved_incoming_outgoing",
    voucher_eligible: requiredFieldsValid,
    amount_within_open_item_or_refund_ceiling: amountWithinOpenItem,
    allocation_frozen: requiredFieldsValid,
    policy_and_allowance_valid_or_not_applicable: policyAndAllowanceValid && requiredFieldsValid,
    owner_gate_for_write_or_existing_chain_observation: matchedEvidence,
    final_matched_receipt_or_erp_origin_precondition: matchedEvidence,
    final_receipt: matchedEvidence,
    single_customer: a12Concrete(values.customer),
    invoice_eligible: a12Concrete(values.source_sales_invoice),
    allocation_valid: requiredFieldsValid,
    advance_account_unique: a12Concrete(values.advance_account ?? values.liability_account),
    original_outgoing_bound: a12Concrete(values.original_outgoing_transaction),
    refund_final: matchedEvidence,
    sender_equal: a12EqualityConfirmed(values.sender_equality_state),
    mode_and_accounts_unique: a12Concrete(values.refund_posting_mode ?? values.resolved_recovery_account ?? values.resolved_refund_debit_account),
    within_ceiling: withinCeiling,
    original_incoming_bound: a12Concrete(values.original_incoming_transaction),
    refund_approved: refundApproved,
    recipient_equal: a12EqualityConfirmed(values.recipient_equality_state),
    observation_structurally_valid: requiredFieldsValid,
    reason_code_present: a12Concrete(values.reason_code),
    supplier_payable_fields_valid: requiredFieldsValid,
    supplier_advance_fields_valid: requiredFieldsValid,
    no_invoice_close_acknowledged: values.invoice_close_prohibited_ack === true,
    expense_claim_submitted: a12Concrete(values.source_expense_claim),
    employee_registry_effective: a12Concrete(values.employee_wallet_registry_interval),
    policy_cap_and_allowance_valid: policyAndAllowanceValid
  };
  return { missing: action.preconditions.filter((precondition) => facts[precondition] !== true), facts };
}

function a12ActionGuard(state) {
  const schema = A12_C15_SCENARIO_SCHEMA[state.selectedScenario];
  const action = a12PrimaryActionFor(state.selectedScenario);
  if (!schema || !action || action.scenario !== state.selectedScenario || schema.primary_action !== action.action_id) return { enabled: false, reason: "No exact C15 primary action is registered for this route." };
  if (state.selectedScenario === "unresolved_incoming_outgoing") {
    const unresolvedPreconditions = a12FrozenPreconditionFacts(state, action, schema);
    if (unresolvedPreconditions.missing.length) return { enabled: false, reason: `Controlled unresolved action prerequisites missing: ${unresolvedPreconditions.missing.join(", ")}.` };
    return { enabled: true, reason: "Controlled local assignment only; ERP, ledger, wallet, chain and business-close gates remain closed." };
  }
  if (!state.evidence) return { enabled: false, reason: "Typed receipt evidence is required before this action can be prepared." };
  const evidenceValidation = validateA12C15TypedEvidence(state, state.evidence);
  if (!evidenceValidation.ok) return { enabled: false, reason: `Typed C15 validators failed closed: ${evidenceValidation.reason}.` };
  if (state.matcherState !== "matched" || state.evidence.outcome !== "matched") return { enabled: false, reason: `Evidence state is ${state.matcherState}; stop: ${action.stop_condition}.` };
  const preconditions = a12FrozenPreconditionFacts(state, action, schema);
  if (preconditions.missing.length) return { enabled: false, reason: `Frozen C15 preconditions missing: ${preconditions.missing.join(", ")}.` };
  return { enabled: true, reason: "All accepted local prerequisites and typed evidence checks pass; external mutation remains closed." };
}

/**
 * Run the explicit local simulation step.  The adapter owns the validation
 * contract; A12 only supplies operator-visible policy/allowance/envelope
 * fields and preserves the no-sign/no-submit boundary.
 */
export function simulateA12Workbench(state, input = {}) {
  const scenario = state?.selectedScenario;
  const schema = A12_C15_SCENARIO_SCHEMA[scenario];
  if (!schema) return simulateCurrentReleaseWorkbench({ scenario });
  const profile = A12_PROFILE_DEFINITIONS[scenario];
  const values = Object.fromEntries(schema.fields.map((field) => [field.field_id, state?.fieldEdits?.[field.field_id] ?? A12_PROFILE_VALUE(profile, field.field_id)]));
  const amount6 = input.envelope?.amount6 ?? values.allocation_amount6 ?? values.advance_amount6 ?? values.reimbursement_amount6 ?? values.amount_received6 ?? values.refund_amount6 ?? values.approved_refund_amount6;
  const policy = input.policy ?? (input.policy === null ? null : {
    version: values.policy_version ?? values.policy_id ?? null,
    cap_amount6: values.policy_cap_amount6 ?? values.refund_obligation_amount6 ?? null,
    expires_at: values.policy_expiry ?? null,
    nonce: values.policy_nonce ?? null
  });
  const allowance = input.allowance ?? (input.allowance === null ? null : { amount6: values.allowance_amount6 ?? null, freshness: "local fixture" });
  const envelope = input.envelope ?? (input.envelope === null ? null : {
    scenario,
    amount6,
    to: values.recipient_wallet ?? values.exact_recipient_wallet ?? null,
    calldata: values.raw_calldata ?? "0xlocal-unsigned-envelope",
    signed: false,
    submitted: false,
    external_actions: 0
  });
  return simulateCurrentReleaseWorkbench({ scenario, policy, allowance, envelope, now: input.now ?? "2026-08-06T00:00:00Z" });
}

export function createA12WorkbenchState({ scenario = "supplier_payable" } = {}) {
  const selected = A12_SCENARIO_IDS.includes(scenario) ? scenario : "supplier_payable";
  const fixture = createA12ProjectionFixture({ scenario: selected, matcherState: "pending", selectedStage: "source" });
  const state = {
    batchId: A12_BATCH_ID,
    schema: "arc-erp.product-construction.v3.2.a12.workbench-state.v2",
    selectedScenario: selected,
    selectedStage: "source",
    inspectorTab: "Business",
    inspectorOpen: false,
    queueFilter: "all",
    searchQuery: "",
    fieldEdits: {},
    matcherState: "pending",
    evidence: null,
    walletReview: "not_prepared",
    simulation: { schema: "arc-erp.product-construction.v3.2.c15.simulation.v1", status: "NOT_EVALUATED", runtime_state: "missing", errors: ["SIMULATION_NOT_RUN"], local_fixture_only: true, live_arc: false, live_erp: false, direct_erp_mutation: false, external_actions: 0 },
    completedStages: [],
    lastAction: null,
    revision: 0,
    history: [],
    lifecycleOperations: {},
    lifecycleObservations: {},
    lastLifecycleResult: null,
    lastNotice: "",
    fixture,
    externalActions: 0,
    localFixtureOnly: true,
    route: { workspace: "settlement-workbench", scenario: selected, stage: "source", tab: "Business", searchQuery: "" },
    sealedReplay: null
  };
  // A01H remains historical-only.  Active R6 state never seals or renders it.
  state.sealedReplay = null;
  return state;
}

function a12WithProjection(next) {
  next.fixture = createA12ProjectionFixture({ scenario: next.selectedScenario, matcherState: next.matcherState, selectedStage: next.selectedStage });
  next.route = { workspace: "settlement-workbench", scenario: next.selectedScenario, stage: next.selectedStage, tab: next.inspectorTab, searchQuery: next.searchQuery ?? "" };
  next.sealedReplay = null;
  return next;
}

function a12LifecycleInput(action) {
  const payload = action?.payload && typeof action.payload === "object" && !Array.isArray(action.payload) ? action.payload : {};
  const type = action.type === "REORG_REPLACEMENT" ? "REPLACEMENT_RESOLUTION" : action.type;
  const operationKey = String(action.operationKey ?? payload.operationKey ?? payload.operation_key ?? "").trim();
  const logicalPaymentId = String(action.logicalPaymentId ?? payload.logicalPaymentId ?? payload.logical_payment_id ?? "").trim();
  const canonicalEventKey = String(action.canonicalEventKey ?? payload.canonicalEventKey ?? payload.canonical_event_key ?? "").trim();
  const replacementCanonicalEventKey = String(action.replacementCanonicalEventKey ?? payload.replacementCanonicalEventKey ?? payload.replacement_canonical_event_key ?? "").trim();
  const reason = String(action.reason ?? payload.reason ?? "").trim();
  const authority = a12Clone(action.authority ?? payload.authority ?? null);
  const observation = a12Clone(action.observation ?? payload.observation ?? null);
  const replacementObservation = a12Clone(action.replacementObservation ?? payload.replacementObservation ?? payload.replacement_observation ?? null);
  return {
    type,
    operationKey,
    logicalPaymentId,
    canonicalEventKey,
    replacementCanonicalEventKey,
    reason,
    authority,
    observation,
    replacementObservation
  };
}

const A12_LOGICAL_PAYMENT_ID_PATTERN = /^logical:payment:[A-Za-z0-9._:-]+$/;
const A12_CANONICAL_EVENT_KEY_PATTERN = /^[1-9][0-9]*:0x[0-9a-fA-F]+:[0-9]+$/;

function a12LifecycleObservationValidation(observation, { replacement = false } = {}) {
  if (!observation || typeof observation !== "object" || Array.isArray(observation)) return "OBSERVATION_OBJECT_REQUIRED";
  if (![0, 1].includes(observation.receiptStatus)) return "OBSERVATION_RECEIPT_STATUS_REQUIRED";
  if (!/^0x[0-9a-fA-F]+$/.test(String(observation.blockHash ?? ""))) return "OBSERVATION_BLOCK_HASH_REQUIRED";
  const observedAt = String(observation.observedAt ?? "");
  if (!observedAt || !Number.isFinite(Date.parse(observedAt))) return "OBSERVATION_TIMESTAMP_REQUIRED";
  if (replacement && observation.reorgState !== "canonical") return "REPLACEMENT_CANONICAL_STATE_REQUIRED";
  return null;
}

function a12LifecycleValidation(operation, state) {
  if (!A12_LIFECYCLE_TRANSITION_TYPES.includes(operation.type)) return "LIFECYCLE_OPERATION_TYPE_REQUIRED";
  if (!operation.operationKey || !operation.logicalPaymentId || !operation.canonicalEventKey) return "LIFECYCLE_TYPED_KEYS_REQUIRED";
  if (!A12_LOGICAL_PAYMENT_ID_PATTERN.test(operation.logicalPaymentId) || !A12_CANONICAL_EVENT_KEY_PATTERN.test(operation.canonicalEventKey)) return "LIFECYCLE_TYPED_KEYS_INVALID";
  if (!operation.reason || !operation.authority?.operatorId || !["reviewer", "finance_operator", "watcher"].includes(operation.authority.role)) return "LIFECYCLE_OPERATION_AUTHORITY_REQUIRED";
  if (operation.type === "LATE_ENTRY") {
    const observationError = a12LifecycleObservationValidation(operation.observation);
    if (observationError) return `LATE_ENTRY_${observationError}`;
  }
  if (operation.type === "REPLACEMENT_RESOLUTION") {
    if (!A12_CANONICAL_EVENT_KEY_PATTERN.test(operation.replacementCanonicalEventKey) || operation.replacementCanonicalEventKey === operation.canonicalEventKey) return "REPLACEMENT_CANONICAL_EVENT_REQUIRED";
    const observationError = a12LifecycleObservationValidation(operation.replacementObservation, { replacement: true });
    if (observationError) return `REPLACEMENT_${observationError}`;
  }
  const observationKey = `${operation.logicalPaymentId}::${operation.canonicalEventKey}`;
  if (["REPLACEMENT_RESOLUTION", "REVOKE", "REVERSAL"].includes(operation.type) && !state.lifecycleObservations?.[observationKey]) return `${operation.type}_SOURCE_REQUIRED`;
  return null;
}

function a12InvalidateLifecycleConsequences(state) {
  state.matcherState = "pending";
  state.evidence = null;
  state.walletReview = "not_prepared";
  state.completedStages = [];
  state.lastAction = null;
  state.selectedStage = "source";
  state.inspectorTab = "Business";
  state.inspectorOpen = false;
}

function a12ReduceLifecycleTransition(state, action) {
  const operation = a12LifecycleInput(action);
  const priorOperation = state.lifecycleOperations?.[operation.operationKey];
  const payloadFingerprint = a12CanonicalJson(operation);
  if (priorOperation) {
    if (priorOperation.type === operation.type && priorOperation.payloadFingerprint === payloadFingerprint) {
      state.lastLifecycleResult = { state: "DUPLICATE_NOOP", operationKey: operation.operationKey, type: operation.type };
      state.lastNotice = `Duplicate ${operation.type} retry ignored; prior observation and history are unchanged.`;
      return a12WithProjection(state);
    }
    a12InvalidateLifecycleConsequences(state);
    state.lastLifecycleResult = { state: "CONFLICT_REJECT", operationKey: operation.operationKey, existingType: priorOperation.type, requestedType: operation.type, reason: "IDEMPOTENCY_KEY_PAYLOAD_CONFLICT" };
    state.lastNotice = `Lifecycle conflict rejected fail-closed for operation key ${operation.operationKey}.`;
    return a12WithProjection(state);
  }
  const validationError = a12LifecycleValidation(operation, state);
  if (validationError) {
    a12InvalidateLifecycleConsequences(state);
    state.lastLifecycleResult = { state: "INVALID_REJECT", operationKey: operation.operationKey || null, type: operation.type, reason: validationError };
    state.lastNotice = `Lifecycle transition rejected fail-closed: ${validationError}.`;
    return a12WithProjection(state);
  }
  const observationKey = `${operation.logicalPaymentId}::${operation.canonicalEventKey}`;
  const priorObservation = a12Clone(state.lifecycleObservations?.[observationKey] ?? null);
  if (operation.type === "LATE_ENTRY" && priorObservation && !a12TypedObjectsEqual(priorObservation.observation, operation.observation)) {
    a12InvalidateLifecycleConsequences(state);
    state.lastLifecycleResult = { state: "CONFLICT_REJECT", operationKey: operation.operationKey, type: operation.type, reason: "CANONICAL_EVENT_PAYLOAD_CONFLICT", observationKey };
    state.lastNotice = `Late-entry conflict rejected fail-closed for canonical event ${operation.canonicalEventKey}.`;
    return a12WithProjection(state);
  }
  a12InvalidateLifecycleConsequences(state);
  const revision = state.revision + 1;
  const entry = { ...operation, payloadFingerprint, observationKey, priorObservation, revision };
  state.lifecycleOperations = { ...(state.lifecycleOperations ?? {}), [operation.operationKey]: entry };
  state.lifecycleObservations = { ...(state.lifecycleObservations ?? {}) };
  if (operation.type === "LATE_ENTRY") {
    state.lifecycleObservations[observationKey] = { logicalPaymentId: operation.logicalPaymentId, canonicalEventKey: operation.canonicalEventKey, status: "late_entry_observed", observation: operation.observation, operationKey: operation.operationKey, revision };
  } else if (operation.type === "REPLACEMENT_RESOLUTION") {
    const replacementKey = `${operation.logicalPaymentId}::${operation.replacementCanonicalEventKey}`;
    if (state.lifecycleObservations[replacementKey]) {
      state.lastLifecycleResult = { state: "CONFLICT_REJECT", operationKey: operation.operationKey, type: operation.type, reason: "REPLACEMENT_EVENT_ALREADY_OBSERVED", observationKey: replacementKey };
      state.lastNotice = `Replacement conflict rejected fail-closed for canonical event ${operation.replacementCanonicalEventKey}.`;
      delete state.lifecycleOperations[operation.operationKey];
      return a12WithProjection(state);
    }
    state.lifecycleObservations[observationKey] = { ...priorObservation, status: "replaced_after_reorg", replacedByCanonicalEventKey: operation.replacementCanonicalEventKey, operationKey: operation.operationKey, revision };
    state.lifecycleObservations[replacementKey] = { logicalPaymentId: operation.logicalPaymentId, canonicalEventKey: operation.replacementCanonicalEventKey, status: "canonical_replacement", replacesCanonicalEventKey: operation.canonicalEventKey, observation: operation.replacementObservation, operationKey: operation.operationKey, revision };
    entry.replacementObservationKey = replacementKey;
  } else {
    state.lifecycleObservations[observationKey] = { ...(priorObservation ?? { logicalPaymentId: operation.logicalPaymentId, canonicalEventKey: operation.canonicalEventKey, observation: null }), status: operation.type === "REVOKE" ? "revoked" : "reversed", operationKey: operation.operationKey, revision };
  }
  state.revision = revision;
  state.history.push({ seq: state.history.length + 1, type: operation.type, scenario: state.selectedScenario, stage: state.selectedStage, payload: a12Clone(entry) });
  state.lastLifecycleResult = { state: "APPLIED", operationKey: operation.operationKey, type: operation.type, observationKey, replacementObservationKey: entry.replacementObservationKey ?? null };
  state.lastNotice = `${operation.type} recorded locally; prior observations remain in lifecycle history and every downstream consequence is invalidated.`;
  return a12WithProjection(state);
}

export function reduceA12Workbench(input, action = {}) {
  const state = a12Clone(input ?? createA12WorkbenchState());
  const type = action.type ?? "UNKNOWN";
  const next = (payload = {}) => {
    state.revision += 1;
    state.history.push({ seq: state.history.length + 1, type, scenario: state.selectedScenario, stage: state.selectedStage, payload: a12Clone(payload) });
    return a12WithProjection(state);
  };
  if (A12_LIFECYCLE_TRANSITION_TYPES.includes(type) || type === "REORG_REPLACEMENT") return a12ReduceLifecycleTransition(state, action);
  if (type === "SELECT_SCENARIO" && A12_SCENARIO_IDS.includes(action.scenario)) {
    a12ResetDependentState(state, action.scenario);
    state.lastNotice = "Dependencies reset: source, policy, wallet review, typed evidence, completed stages and receipt projections are re-evaluated for the selected scenario.";
    return next({ scenario: action.scenario, reset_dependencies: true });
  }
  if (type === "SET_STAGE" && A12_C15_STAGE_IDS.includes(action.stage)) {
    state.selectedStage = action.stage;
    state.inspectorTab = A12_C15_STAGE_TABS[action.stage];
    const stageLabel = A12_CAUSAL_STAGES.find((stage) => stage.id === action.stage)?.label ?? action.stage;
    state.lastNotice = `Moved to ${stageLabel}. Stage navigation changes the review focus only; completion is not implied.`;
    return next({ stage: action.stage, inspector_tab: state.inspectorTab, completion: "not_implied_by_navigation" });
  }
  if (type === "SET_INSPECTOR_TAB" && A12_C15_TABS.includes(action.tab)) {
    state.inspectorTab = action.tab;
    state.inspectorOpen = true;
    return next({ tab: action.tab });
  }
  if (type === "OPEN_INSPECTOR") { state.inspectorOpen = true; return next({ open: true }); }
  if (type === "CLOSE_INSPECTOR") { state.inspectorOpen = false; return next({ open: false }); }
  if (type === "QUEUE_MOVE") {
    const ids = A12_SCENARIO_IDS;
    const index = Math.max(0, ids.indexOf(state.selectedScenario));
    const nextIndex = action.direction === "up" ? Math.max(0, index - 1) : Math.min(ids.length - 1, index + 1);
    a12ResetDependentState(state, ids[nextIndex]);
    state.lastNotice = "Queue movement reset all dependent state for the newly selected case.";
    return next({ direction: action.direction, scenario: state.selectedScenario, reset_dependencies: true });
  }
  if (type === "SET_QUEUE_FILTER" && ["all", "incoming", "outgoing", "exceptions"].includes(action.filter)) {
    state.queueFilter = action.filter;
    return next({ filter: action.filter });
  }
  if (type === "SET_SEARCH_QUERY") {
    state.searchQuery = String(action.query ?? "").trim().toLowerCase();
    return next({ search_query: state.searchQuery });
  }
  if (type === "SET_MATCHER_STATE") {
    state.lastNotice = "Direct matcher outcome switching is unavailable; submit bound typed evidence instead.";
    return next({ action_blocked: true, reason: "TYPED_EVIDENCE_REQUIRED", external_actions: 0 });
  }
  if (type === "EDIT_FIELD") {
    const fieldSpec = A12_C15_SCENARIO_SCHEMA[state.selectedScenario]?.fields.find((field) => field.field_id === action.fieldId);
    if (!fieldSpec || fieldSpec.editability === "read_only") {
      state.lastNotice = `Field ${String(action.fieldId)} is read-only in the accepted C15 projection.`;
      return state;
    }
    state.fieldEdits[action.fieldId] = action.value;
    return next({ field_id: action.fieldId, value: state.fieldEdits[action.fieldId], source: "Operator confirmation" });
  }
  if (type === "RUN_SIMULATION") {
    const simulation = simulateA12Workbench(state, action.input ?? {});
    state.simulation = a12Clone(simulation);
    state.lastNotice = simulation.status === "SIMULATED"
      ? "Local simulation projected: policy, allowance and unsigned envelope agree; no signature or submission exists."
      : simulation.status === "NOT_APPLICABLE"
        ? "Simulation is not applicable to this inbound or unresolved case."
        : `Simulation blocked fail-closed: ${simulation.errors.join(", ")}.`;
    return next({ simulation_status: simulation.status, simulation_errors: simulation.errors, external_actions: 0 });
  }
  if (type === "EVALUATE_TYPED_EVIDENCE") {
    const validation = validateA12C15TypedEvidence(state, action.evidence);
    if (!validation.ok) {
      state.evidence = null;
      state.matcherState = "pending";
      state.walletReview = "not_prepared";
      state.lastAction = null;
      state.completedStages = [];
      state.selectedStage = "source";
      state.inspectorTab = "Business";
      state.inspectorOpen = false;
      state.lastNotice = `Typed evidence rejected fail-closed: ${validation.reason}.`;
      return next({ evidence_rejected: true, reason: validation.reason, external_actions: 0 });
    }
    state.evidence = a12Clone(action.evidence);
    state.matcherState = action.evidence.outcome;
    state.walletReview = "not_prepared";
    state.lastAction = null;
    state.completedStages = [];
    state.lastNotice = `Typed local evidence evaluated as ${action.evidence.outcome}; no wallet, chain, ERP or close mutation is available.`;
    return next({ evidence_outcome: action.evidence.outcome, evidence_bound: true, external_actions: 0 });
  }
  if (type === "PRIMARY_ACTION") {
    const actionMeta = a12PrimaryActionFor(state.selectedScenario);
    const guard = a12ActionGuard(state);
    if (!actionMeta || !guard.enabled) {
      state.lastNotice = `Action blocked fail-closed: ${guard.reason}`;
      return next({ action_blocked: true, action_id: actionMeta?.action_id ?? null, reason: guard.reason, external_actions: 0 });
    }
    state.lastAction = actionMeta.action_id;
    state.completedStages = [...new Set([...(state.completedStages ?? []), actionMeta.stage])];
    state.lastNotice = actionMeta.mutation_boundary === "local_assignment_only"
      ? `Controlled local action recorded: ${actionMeta.label}. Boundary: local assignment only; unresolved remains held and no ERP, ledger, wallet, chain or business-close mutation is available.`
      : `Local command prepared: ${actionMeta.label}. Boundary: ${actionMeta.mutation_boundary}; next owner: ${actionMeta.next_owner}. No wallet, chain, ERP or business-close mutation is available.`;
    state.walletReview = actionMeta.mutation_boundary.includes("wallet") ? "prepared_owner_gate_closed" : "not_applicable_or_local_only";
    return next({ action_id: actionMeta.action_id, mutation_boundary: actionMeta.mutation_boundary, external_actions: 0 });
  }
  if (type === "RESTORE_ROUTE" && A12_SCENARIO_IDS.includes(action.scenario)) {
    const scenarioChanged = action.scenario !== state.selectedScenario;
    if (scenarioChanged) a12ResetDependentState(state, action.scenario);
    state.selectedStage = A12_C15_STAGE_IDS.includes(action.stage) ? action.stage : "source";
    state.inspectorTab = A12_C15_TABS.includes(action.tab) ? action.tab : "Business";
    state.searchQuery = String(action.searchQuery ?? "").trim().toLowerCase();
    state.inspectorOpen = state.inspectorTab !== "Business";
    // Restoring a URL is a fresh projection, not a replay of a previous stage toast.
    state.lastNotice = "";
    return next({ scenario: state.selectedScenario, stage: state.selectedStage, tab: state.inspectorTab, route_restore: true, reset_dependencies: scenarioChanged });
  }
  if (type === "REPLAY_SEALED") {
    state.lastNotice = "Historical-only A01H replay is isolated; active R7 uses the accepted producer public projection only.";
    return next({ action_blocked: true, reason: "A01H_HISTORICAL_ONLY", upstream_handoff: A12_R6_HANDOFF_ID });
  }
  state.lastNotice = `Ignored untyped interaction: ${String(type)}.`;
  return state;
}

export function a12WorkbenchRoute(state) {
  const query = String(state.searchQuery ?? "").trim().toLowerCase();
  return `#a12/workbench/${encodeURIComponent(state.selectedScenario)}/${encodeURIComponent(state.selectedStage)}/${encodeURIComponent(state.inspectorTab.toLowerCase())}${query ? `?q=${encodeURIComponent(query)}` : ""}`;
}

export function parseA12WorkbenchRoute(hash = "") {
  const match = hash.match(/^#a12\/workbench\/([^/]+)\/([^/]+)\/([^/?]+)(?:\?q=([^#]*))?$/);
  if (!match) return null;
  const scenario = decodeURIComponent(match[1]);
  const stage = decodeURIComponent(match[2]);
  const rawTab = decodeURIComponent(match[3]);
  const searchQuery = match[4] ? decodeURIComponent(match[4]) : "";
  const tab = A12_C15_TABS.find((candidate) => candidate.toLowerCase() === rawTab.toLowerCase()) ?? "Business";
  return { scenario: A12_SCENARIO_IDS.includes(scenario) ? scenario : "supplier_payable", stage: A12_C15_STAGE_IDS.includes(stage) ? stage : "source", tab, searchQuery };
}

export function a12ViewportMode(width) {
  if (width <= 1050) return "1024x768";
  if (width <= 1310) return "1280x800";
  return "1440x1024";
}

export function projectA12Workbench(state) {
  const profile = A12_PROFILE_DEFINITIONS[state.selectedScenario] ?? A12_PROFILE_DEFINITIONS.supplier_payable;
  const schema = A12_C15_SCENARIO_SCHEMA[profile.id];
  const action = a12PrimaryActionFor(profile.id);
  const evidenceValidation = state.evidence ? validateA12C15TypedEvidence(state, state.evidence) : null;
  const evidenceIntegrityInvalid = Boolean(state.evidence && !evidenceValidation?.ok);
  const effectiveMatcherState = evidenceIntegrityInvalid ? "pending" : state.matcherState;
  const effectiveWalletReview = evidenceIntegrityInvalid ? "not_prepared" : state.walletReview;
  const effectiveCompletedStages = evidenceIntegrityInvalid ? [] : (state.completedStages ?? []);
  const fixture = createA12ProjectionFixture({ scenario: profile.id, matcherState: effectiveMatcherState, selectedStage: state.selectedStage });
  const fieldValues = a12FixtureFields(profile, effectiveMatcherState, state.fieldEdits);
  const guard = a12ActionGuard(state);
  const authority = a12AuthorityForScenario(profile.id);
  const domainObservation = effectiveMatcherState === "matched" ? buildAuthorityObservation(profile.id) : null;
  const workbenchProjection = projectCurrentReleaseWorkbench({
    scenario: profile.id,
    ...(domainObservation ?? {}),
    failure: effectiveMatcherState === "matched" ? null : "FINAL_RECEIPT_REQUIRED"
  });
  const authorityProjection = authority?.receipt_authority?.projection ?? {};
  const policyExpected = authorityProjection.policy_event_expected_observed_status_source?.expected ?? {};
  const transferId = policyExpected.transfer_id ?? "not_observed";
  const policyId = policyExpected.policy_id ?? "not_observed";
  const policyNonce = policyExpected.nonce ?? authorityProjection.getter_expected_observed_status_source?.expected?.policy_nonce ?? "not_observed";
  const receiptProjection = Object.fromEntries((fixture.receiptProjection ?? []).map((item) => [item.fieldId, item.value]));
  const receiptFields = A12_C15_RECEIPT_FIELDS.map((fieldId) => {
    const current = receiptProjection[fieldId];
    const value = fieldId === "finality_state" ? a12FinalityState(effectiveMatcherState) : current;
    return { fieldId, value: value ?? "expected_layout_only", source: fieldId === "finality_state" ? "typed current state model" : current && current !== "not_observed" ? A12_C15_PROVENANCE_SOURCE.arc : "Arc receipt fixture", truthClass: value && value !== "not_observed" ? "local_observation" : "missing", fingerprint: `fixture-receipt-${fieldId}-a12` };
  });
  const objectRows = A12_C15_DAPP_OBJECT_IDS.map((objectId) => {
    const spec = schema.dapp_objects[objectId];
    const stateValue = spec.runtime_state;
    const runtime = objectId === "wallet_review" && effectiveWalletReview !== "not_prepared" ? effectiveWalletReview : stateValue;
    return { objectId, applicability: spec.applicability, runtimeState: runtime, source: objectId === "settlement_policy" ? A12_C15_PROVENANCE_SOURCE.policy : objectId === "treasury_session" ? A12_C15_PROVENANCE_SOURCE.wallet : objectId === "accounting_consequence" ? A12_C15_PROVENANCE_SOURCE.erp : A12_C15_PROVENANCE_SOURCE.arc, mutationBoundary: objectId === "wallet_review" ? "owner_gate_closed" : objectId === "accounting_consequence" ? "erp_draft_only" : "read_only" };
  });
  const consequences = {
    paymentEntry: effectiveMatcherState === "matched" ? "draft / readback required" : "held until matched receipt",
    bankTransaction: effectiveMatcherState === "matched" ? "draft / reconciliation required" : "held until Payment Entry evidence",
    glPled: effectiveMatcherState === "matched" ? "projected balanced / not posted" : "not projected",
    outstanding: effectiveMatcherState === "matched" ? "before → after projection / owner controlled" : "OPEN",
    close: "chain-final ≠ ERP-submitted ≠ operationally-reconciled ≠ books-closed"
  };
  const firstFailure = profile.direction === "outgoing" ? "settlement_policy" : profile.direction === "unresolved" ? "evidence_gaps" : "receipt_finality_state";
  return {
    batchId: A12_BATCH_ID,
    evidenceLevel: A12_EVIDENCE_LEVEL,
    localFixtureOnly: true,
    externalActions: 0,
    shell: { environment: "LOCAL FIXTURE", chain: "Arc Testnet · chainId 5042002", company: "Gayson Labs Pte Ltd", treasury: A12_VALUE.treasuryWallet, erpFreshness: "local projection · not live", watcherLag: "not observed", outbox: "0 external commands", role: action.role },
    queue: A12_SCENARIO_IDS.map((id) => { const row = A12_PROFILE_DEFINITIONS[id]; const rowAction = a12PrimaryActionFor(id); return { id, label: row.label, direction: row.direction, party: row.party, principal: row.amount, age: "local fixture", evidenceTier: A12_EVIDENCE_LEVEL, exception: effectiveMatcherState === "pending" ? "control required" : a12StateLabel(effectiveMatcherState), nextOwner: rowAction.next_owner, selected: id === profile.id }; }),
    unresolved: { id: "unresolved_incoming_outgoing", label: A12_PROFILE_DEFINITIONS.unresolved_incoming_outgoing.label, reason: A12_PROFILE_DEFINITIONS.unresolved_incoming_outgoing.openItem, selectable: true },
    canvas: { headline: action.label, scenario: profile.label, matcherState: effectiveMatcherState, scenarioState: a12StateLabel(effectiveMatcherState), scenarioTone: a12StateTone(effectiveMatcherState), caseId: fixture.caseId, sourceDocument: profile.sourceDocument, counterparty: profile.party, principal: profile.amount, source: "C15 typed scenario projection · local fixture", origin: workbenchProjection.origin ?? authority?.origin ?? null, authorityOrigin: workbenchProjection.authority_origin ?? authority?.origin ?? null, domainStatus: workbenchProjection.status, fields: fieldValues, firstFailure, recovery: action.recovery, command: { ...action, consequence: action.consequence, stopCondition: action.stop_condition, nextOwner: action.next_owner, enabled: guard.enabled, disabledReason: guard.enabled ? null : guard.reason }, consequences, policy: { policyId, version: "C15 upstream policy projection", allowance: profile.amount6, expiry: "C15 upstream fixture · local only", nonce: policyNonce } },
    inspector: { tabs: A12_C15_TABS, activeTab: state.inspectorTab, objects: objectRows, receiptFields, logs: fixture.receiptRecords, typedReadbacks: workbenchProjection.typed_readbacks, arcVerifiedEvidence: CURRENT_ARC_VERIFIED_PROGRAMME_EVIDENCE, erpVerifiedEvidence: CURRENT_ERP_VERIFIED_READ_ONLY_EVIDENCE, getter: { expected: `case:${fixture.caseId} · transfer:${transferId}`, observed: effectiveMatcherState === "pending" ? "missing" : `case:${fixture.caseId} · transfer:${transferId}`, status: effectiveMatcherState === "matched" ? "matched" : "missing", source: A12_C15_PROVENANCE_SOURCE.arc }, consequences, audit: (state.history ?? []).map((event) => ({ time: `local revision ${event.seq}`, actor: "local operator", object: event.type, revision: event.seq, action: event.type, result: event.payload, correlationId: `a12:${fixture.caseId}:${event.seq}` })) },
    causalRail: A12_CAUSAL_STAGES.map((stage, index) => ({ ...stage, status: stage.id === state.selectedStage ? "current" : effectiveCompletedStages.includes(stage.id) ? "verified" : "prerequisite", timestamp: effectiveCompletedStages.includes(stage.id) ? "local guarded action" : null, nextOwner: index === 4 ? "wallet owner or watcher" : index >= 5 ? "ERP/finance owner gate" : "operator" })),
    replay: state.sealedReplay,
    oracle: A12_C15_VIEWPORT_ORACLE,
    workbenchProjection,
    verifiedProgrammeEvidence: CURRENT_ARC_VERIFIED_PROGRAMME_EVIDENCE,
    verifiedErpEvidence: CURRENT_ERP_VERIFIED_READ_ONLY_EVIDENCE,
    claims: { liveArc: false, liveErp: false, arcDeploymentReadback: "verified_programme_read_only", erpReadback: "verified_read_only", settlementExecution: false, erpPosting: false, businessClose: false, chainSuccessImpliesErpPosting: false, chainSuccessImpliesBusinessClose: false }
  };
}
