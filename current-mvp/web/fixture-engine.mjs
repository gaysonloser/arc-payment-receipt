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
  const scenario = Object.hasOwn(FIXTURES, seed) ? seed : "matched";
  const ready = Object.hasOwn(FIXTURES, seed);
  return { scenario, attested: ready, approved: ready, activePanel: "policy", failureCase: "wrong_network", accountingPreset: "payment_corporate_payable", receiptPurpose: "invoice_collection", sourceDocument: "PINV-2026-044", sourceTouched: false, refundAmount6: "250000000", counterpartyOverride: null };
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
