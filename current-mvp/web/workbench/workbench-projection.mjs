/*
 * Current-release workbench dependency boundary.
 *
 * This module is deliberately a non-visual adapter: it binds the public MVP
 * candidate to the accepted C15 scenario contract and producer authority while
 * keeping Arc, ERP, ledger and business-close facts separate.  It never calls a
 * wallet, RPC, ERP endpoint or browser API.  The HTML/CSS entry remains owned by
 * the product/UI session; this file is the 09_Circle domain seam they consume.
 */
import {
  A12_C15_ACCEPTED_SCENARIO_PROJECTION_MATRIX,
  A12_C15_ACCEPTED_ACTION_STATE_MACHINE
} from "../c15-contract.mjs";
import {
  C15_UPSTREAM_AUTHORITY_PROFILE_IDS,
  getC15UpstreamAuthorityForScenario
} from "../c15-upstream-authority.mjs";

export const CURRENT_RELEASE_WORKBENCH_ID = "verified-milestone-close-current-mvp-workbench-rc1";
export const CURRENT_RELEASE_WORKBENCH_VERSION = "product-domain-bridge-v1";
export const CURRENT_RELEASE_WORKBENCH_SCENARIOS = Object.freeze([...C15_UPSTREAM_AUTHORITY_PROFILE_IDS]);
export const CURRENT_RELEASE_WORKBENCH_BOUNDARY = Object.freeze({
  evidence_level: "synthetic_local",
  live_arc: false,
  live_erp: false,
  chain_success_implies_erp_posting: false,
  chain_success_implies_business_close: false,
  external_actions: 0,
  direct_erp_mutation: false,
  wallet_or_chain_write: false
});

const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
};

// These are privacy-safe, programme-owned read-only facts. They are displayed
// as evidence classes only; neither object is a current-release live gate and
// neither implies settlement execution, ERP posting or business close.
export const CURRENT_ARC_VERIFIED_PROGRAMME_EVIDENCE = deepFreeze({
  evidence_class: "verified_programme_read_only",
  source_evidence_id: "policy-settlement-deployment-readback",
  chain_id: 5042002,
  chain_name: "Arc Testnet",
  contract_address: "0xc7682649a1aa60d0f74825ad2b812ee062178047",
  tx_hash: "0xbf3e6c73e9d481c375e66c6b280da271c6831e8143a1f1b241ecac62b343a27b",
  receipt_status: "0x1",
  block_number: 56126973,
  block_hash: "0x212dbfa6b4d9359e61ce0525a7a778f8cc338f3e676ca816446b73e1bbf67633",
  deployed_code_bytes: 6877,
  deployed_code_fingerprint: "0ec144ba398f4557ee61d6585bc0ff9b83728ae235e5ebfcfb9e473624d52675",
  token_getter: {
    selector: "0xfc0c546a",
    return_address: "0x3600000000000000000000000000000000000000"
  },
  readback_finality: "observed_confirmations_and_block_hash_reread",
  reorg_state: "no_reorg_observed_at_readback",
  deployment_log_semantics: "CREATE receipt has no PolicyCreated log; deployment and follow-on policy readback are separate evidence.",
  follow_on_policy_readback: {
    status: "verified_in_programme_evidence",
    events: ["PolicyCreated"],
    getter: "getPolicy(bytes32)",
    source_label: "verified programme deployment evidence",
    settlement_execution_claimed: false
  },
  claim_boundary: {
    current_release_binding: false,
    deployment_readback_only: true,
    settlement_execution_claimed: false,
    erp_posting_claimed: false,
    business_close_claimed: false,
    local_fixture_only: false,
    external_actions: 0
  }
});

export const CURRENT_ERP_VERIFIED_READ_ONLY_EVIDENCE = deepFreeze({
  evidence_class: "verified_erp_read_only",
  source_evidence_id: "supplier-payable-readback",
  source_evidence_class: "owner_verified_read_only",
  credentials_exposed: false,
  local_fixture_only: false,
  company: "AOXPET Arc Lab",
  company_abbr: "AAL",
  currency: "USD",
  purchase_invoice: {
    selector: "ACC-PINV-2026-00002",
    supplier: "ARC-LAB-SUP-CATVERSE-001",
    supplier_invoice: "PINV-2026-044",
    status: "Paid",
    gl: {
      creditors_account: "Creditors - AAL",
      creditors_side: "credit",
      creditors_amount: "1.00",
      stock_received_not_billed_account: "Stock Received But Not Billed - AAL",
      stock_received_not_billed_side: "debit",
      stock_received_not_billed_amount: "1.00",
      total_debit: "1.00",
      total_credit: "1.00",
      closing: "0"
    }
  },
  payment_entry: {
    selector: "ACC-PAY-2026-00009",
    status: "Submitted",
    payment_type: "Pay",
    posting_date: "2026-08-10",
    paid_amount: "1.00",
    invoice_outstanding: "0",
    allocated: "1.00",
    unallocated: "0",
    difference: "0",
    paid_from: "Arc Settlement Bank - AAL",
    paid_to: "Creditors - AAL",
    reference_no: "0x20a6af59824205cfe691c603012d11525defccac6fa1df945b08b9ceb44f6e10",
    clearance_date: "2026-08-10"
  },
  bank_transaction: {
    selector: "ACC-BTN-2026-00004",
    status: "Reconciled",
    direction: "Withdrawal",
    amount: "1.00",
    description_binding: "ACC-PAY-2026-00009"
  },
  payment_ledger: {
    status: "not_proven",
    selector: null,
    selector_redacted: true
  },
  mutation_receipt: { status: "not_provided" },
  posting_readback: { status: "read_only_source_statuses_only" },
  accounting_period: { status: "not_proven" },
  period_closing_voucher: { status: "not_proven" },
  business_close: { status: "not_proven" },
  cancelled_related_payment_entries: [
    { selector: "ACC-PAY-2026-00007", status: "Cancelled" },
    { selector: "ACC-PAY-2026-00008", status: "Cancelled" }
  ],
  payment_is_not_close: true,
  external_actions: 0,
  claim_boundary: {
    invoice_readback: true,
    submitted_payment_readback: true,
    reconciled_bank_readback: true,
    balanced_gl_readback: true,
    accounting_period_closed: false,
    pcv_or_business_close: false,
    business_close_claimed: false,
    erp_mutation_claimed: false
  }
});

const ZERO_COUNTS = Object.freeze({
  bank_transaction: 0,
  close: 0,
  gl: 0,
  payment_entry: 0,
  payment_ledger: 0
});

const REQUIRED_RECEIPT_FIELDS = Object.freeze([
  "chain_id", "tx_hash", "block_hash", "receipt_status", "from", "to",
  "nonce", "raw_calldata", "principal_amount6_raw",
  "canonical_event_key", "reorg_state", "replacement_state"
]);

const REQUIRED_READBACK_FIELDS = Object.freeze([
  "company", "party_id", "party_type", "currency", "source_hash",
  "voucher_id", "principal_amount6", "allocation_amount6",
  "outstanding_before6", "outstanding_after6", "unallocated_amount6",
  "gl_balanced", "docstatus", "direct_submit"
]);

export const CURRENT_RELEASE_TYPED_READBACK_IDS = Object.freeze([
  "invoice",
  "payment_entry",
  "bank_transaction",
  "gl",
  "payment_ledger",
  "accounting_period",
  "pcv_operational_close",
  "business_close"
]);

const clone = (value) => {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const object = (value) => value && typeof value === "object" ? value : null;
const same = (left, right) => String(left ?? "") === String(right ?? "");
const stable = (value) => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};
const SIMULATION_OBJECT_ID = "simulation";
const SIMULATION_SCHEMA = "arc-erp.product-construction.v3.2.c15.simulation.v1";

/*
 * The generated C15 matrix names the unsigned command envelope, while the
 * active product contract also needs a first-class, fail-closed simulation
 * state between policy/allowance checks and receipt observation.  Derive that
 * additive view here so the generated authority file stays source-owned.
 */
const scenarioContract = (scenario) => {
  const contract = A12_C15_ACCEPTED_SCENARIO_PROJECTION_MATRIX[scenario] ?? null;
  if (!contract) return null;
  const envelope = contract.dapp_objects?.unsigned_command ?? contract.dapp_objects?.unsigned_command_envelope;
  return {
    ...contract,
    dapp_objects: {
      ...contract.dapp_objects,
      [SIMULATION_OBJECT_ID]: {
        applicability: envelope?.applicability === "required" ? "required" : "not_applicable",
        runtime_state: envelope?.applicability === "required" ? "missing" : "not_applicable"
      }
    }
  };
};

function zeroCounts() {
  return { ...ZERO_COUNTS };
}

function dappForBlocked(scenario, authority) {
  const source = clone(authority?.projection_output?.dapp?.objects ?? {});
  const contract = scenarioContract(scenario);
  const simulationApplicability = contract?.dapp_objects?.[SIMULATION_OBJECT_ID]?.applicability ?? "required";
  source[SIMULATION_OBJECT_ID] = { applicability: simulationApplicability, runtime_state: simulationApplicability === "not_applicable" ? "not_applicable" : "missing" };
  const objects = {};
  for (const [id, value] of Object.entries(source)) {
    objects[id] = {
      applicability: value?.applicability ?? "not_applicable",
      runtime_state: value?.applicability === "not_applicable" ? "not_applicable" : "missing"
    };
  }
  return {
    applicability_enum: clone(authority?.projection_output?.dapp?.applicability_enum ?? ["required", "optional", "not_applicable"]),
    runtime_state_enum: clone(authority?.projection_output?.dapp?.runtime_state_enum ?? ["not_applicable", "missing", "loading", "ready", "observed", "projected", "matched", "stale", "mismatch", "reorged", "unavailable"]),
    objects
  };
}

function blocked(authority, scenario, errors, { receiptObserved = false } = {}) {
  const p = authority?.projection_output ?? {};
  return {
    schema: "arc-erp.product-construction.v3.2.c15.current-release-workbench.v1",
    release_id: CURRENT_RELEASE_WORKBENCH_ID,
    scenario,
    origin: authority?.origin ?? null,
    authority_origin: authority?.origin ?? null,
    status: "OPEN",
    open_state: "OPEN",
    errors: [...new Set(errors.filter(Boolean))],
    profile: { id: scenario, primary_action: scenarioContract(scenario)?.primary_action ?? null },
    dapp: dappForBlocked(scenario, authority),
    simulation: simulationBlocked(scenario, ["SIMULATION_NOT_EVALUATED"], scenarioContract(scenario)),
    typed_readbacks: buildBlockedTypedReadbacks(authority),
    receipt_observed: receiptObserved,
    receipt: receiptObserved ? clone(p.receipt ?? {}) : { status: "not_evaluated" },
    erp_consequence_allowed: false,
    erp_consequence_counts: zeroCounts(),
    consequence_preview: {
      status: "OPEN",
      bundle_count: 0,
      external_actions: 0,
      direct_erp_mutation: false,
      payment_entry: null,
      bank_transaction: null,
      gl: null,
      payment_ledger: null,
      outstanding: null
    },
    business_close_state: "unavailable",
    live_arc: false,
    live_erp: false,
    evidence_level: "synthetic_local",
    verified_programme_evidence: CURRENT_ARC_VERIFIED_PROGRAMME_EVIDENCE,
    verified_erp_evidence: CURRENT_ERP_VERIFIED_READ_ONLY_EVIDENCE,
    provenance: {
      authority_id: authority?.authority_id ?? null,
      authority_fingerprint: authority?.authority_fingerprint ?? null,
      evidence_level: "synthetic_local",
      local_fixture_only: true,
      external_actions: 0
    }
  };
}

const readbackMeta = (source, extra = {}) => ({
  ...extra,
  source,
  truth_class: "synthetic_local",
  evidence_level: "synthetic_local",
  local_fixture_only: true,
  live_erp: false,
  posted: false,
  external_actions: 0,
  direct_erp_mutation: false
});

function buildBlockedTypedReadbacks(authority) {
  const company = authority?.projection_output?.consequence_preview?.payment_entry?.company ?? null;
  return Object.fromEntries(CURRENT_RELEASE_TYPED_READBACK_IDS.map((id) => [id, readbackMeta(`not_evaluated:${id}`, {
    id,
    status: id === "accounting_period" || id.endsWith("close") ? "unavailable" : "not_evaluated",
    available: false,
    eligible: false,
    company
  })]));
}

/**
 * Build independent typed ERP and close readbacks from the frozen authority.
 * These are local fixture projections only; no caller-provided status or close
 * boolean is accepted as evidence.
 */
export function buildTypedReadbacks(authority) {
  const p = authority?.projection_output ?? {};
  const c = p.consequence_preview ?? {};
  const evidence = p.authority_evidence?.erp_readback ?? {};
  const pe = c.payment_entry ?? {};
  const bt = c.bank_transaction ?? {};
  const gl = c.gl ?? {};
  const pled = c.payment_ledger ?? {};
  const outstanding = c.outstanding ?? {};
  const common = {
    company: pe.company ?? evidence.company ?? null,
    party_id: pe.erp_party_id ?? null,
    party_type: pe.party_type ?? null,
    currency: pe.currency ?? evidence.currency ?? null,
    source_hash: pe.source_document_hash ?? evidence.source_hash ?? null,
    voucher_id: pe.source_voucher_no ?? gl.voucher_no ?? evidence.voucher_id ?? null
  };
  const invoice = readbackMeta("authority_evidence.erp_readback", {
    id: "invoice",
    doctype: evidence.voucher_type ?? pe.source_voucher_type ?? "Invoice",
    voucher_id: evidence.voucher_id ?? common.voucher_id,
    company: common.company,
    party_id: common.party_id,
    party_type: common.party_type,
    currency: common.currency,
    source_hash: evidence.source_hash ?? common.source_hash,
    source_lifecycle: evidence.source_lifecycle ?? "submitted_approved",
    docstatus: evidence.source_docstatus ?? 1,
    direct_submit: false,
    available: true,
    status: "submitted_approved"
  });
  const consequence = (id, source, value) => readbackMeta(source, {
    id,
    ...(clone(value ?? {})),
    available: true,
    status: value?.status ?? "typed_local_projection_only",
    readback_valid: value?.readback?.status === "readback_valid" || value?.status === "typed_local_projection_only" || value?.proposal_only === true
  });
  return {
    invoice,
    payment_entry: consequence("payment_entry", "authority.consequence_preview.payment_entry", pe),
    bank_transaction: consequence("bank_transaction", "authority.consequence_preview.bank_transaction", bt),
    gl: consequence("gl", "authority.consequence_preview.gl", gl),
    payment_ledger: consequence("payment_ledger", "authority.consequence_preview.payment_ledger", pled),
    accounting_period: readbackMeta("independent_erp_readback_required", {
      id: "accounting_period",
      company: common.company,
      available: false,
      status: "unavailable",
      eligible: false,
      start_date: null,
      end_date: null,
      closed_documents: null
    }),
    pcv_operational_close: readbackMeta("independent_erp_readback_required", {
      id: "pcv_operational_close",
      company: common.company,
      available: false,
      status: "unavailable",
      eligible: false,
      outstanding_before6: outstanding.before_amount6 ?? null,
      outstanding_after6: outstanding.after_amount6 ?? null
    }),
    business_close: readbackMeta("independent_erp_readback_required", {
      id: "business_close",
      company: common.company,
      available: false,
      status: "unavailable",
      eligible: false,
      inferred_from_chain: false
    })
  };
}

export function validateTypedReadbacks(readbacks, authority, { matched = true } = {}) {
  const errors = [];
  if (!readbacks || typeof readbacks !== "object") return { valid: false, errors: ["TYPED_READBACKS_REQUIRED"] };
  for (const id of CURRENT_RELEASE_TYPED_READBACK_IDS) {
    const row = readbacks[id];
    if (!row || row.id !== id) errors.push(`TYPED_READBACK_ID_REQUIRED:${id}`);
    if (row?.truth_class !== "synthetic_local" || row?.evidence_level !== "synthetic_local" || row?.local_fixture_only !== true) errors.push(`TYPED_READBACK_TRUTH_CLASS_INVALID:${id}`);
    if (row?.live_erp !== false || row?.posted !== false || row?.direct_erp_mutation !== false || row?.external_actions !== 0) errors.push(`TYPED_READBACK_SIDE_EFFECT:${id}`);
  }
  if (matched) {
    const invoice = readbacks.invoice;
    if (invoice?.source_lifecycle !== "submitted_approved" || invoice?.docstatus !== 1 || !invoice?.party_id || !invoice?.party_type) errors.push("INVOICE_TYPED_AUTHORITY_INVALID");
    for (const id of ["payment_entry", "bank_transaction", "gl", "payment_ledger"]) {
      if (readbacks[id]?.available !== true || readbacks[id]?.readback_valid !== true) errors.push(`ERP_TYPED_READBACK_INVALID:${id}`);
    }
  } else if (CURRENT_RELEASE_TYPED_READBACK_IDS.some((id) => readbacks[id]?.available === true)) {
    errors.push("OPEN_PROJECTION_TYPED_READBACK_MUST_BE_UNAVAILABLE");
  }
  return { valid: errors.length === 0, errors };
}

function expectedReadback(authority) {
  const c = authority?.projection_output?.consequence_preview ?? {};
  const pe = c.payment_entry ?? {};
  const gl = c.gl ?? {};
  const outstanding = c.outstanding ?? {};
  return {
    company: pe.company,
    party_id: pe.erp_party_id,
    party_type: pe.party_type,
    currency: pe.currency,
    source_hash: pe.source_document_hash ?? pe.source_fingerprint,
    voucher_id: pe.source_voucher_no ?? gl.voucher_no,
    principal_amount6: pe.principal_amount6,
    allocation_amount6: pe.allocated_amount6,
    outstanding_before6: outstanding.before_amount6,
    outstanding_after6: outstanding.after_amount6,
    unallocated_amount6: outstanding.unallocated_amount6,
    gl_balanced: gl.readback?.balanced === true || gl.readback?.status === "readback_valid",
    docstatus: pe.docstatus,
    direct_submit: pe.direct_submit
  };
}

function receiptIdentity(authority) {
  const receipt = authority?.projection_output?.receipt ?? {};
  return Object.fromEntries(REQUIRED_RECEIPT_FIELDS.map((field) => [field, receipt[field]]));
}

function receiptMatches(actual, expected) {
  const candidate = object(actual);
  if (!candidate) return { valid: false, code: "ARC_RECEIPT_REQUIRED" };
  const missing = REQUIRED_RECEIPT_FIELDS.filter((field) => candidate[field] === undefined || candidate[field] === null || candidate[field] === "");
  if (missing.length) return { valid: false, code: `ARC_RECEIPT_MISSING:${missing.join(",")}` };
  if (candidate.receipt_status !== 1) return { valid: false, code: "ARC_RECEIPT_STATUS_NOT_FINAL" };
  if (candidate.reorg_state !== "canonical" || candidate.replacement_state !== "none") return { valid: false, code: "ARC_RECEIPT_REORG_OR_REPLACEMENT" };
  const mismatches = REQUIRED_RECEIPT_FIELDS.filter((field) => !same(candidate[field], expected[field]));
  return mismatches.length ? { valid: false, code: `ARC_RECEIPT_IDENTITY_MISMATCH:${mismatches.join(",")}` } : { valid: true };
}

function readbackMatches(actual, expected) {
  const candidate = object(actual);
  if (!candidate) return { valid: false, code: "ERP_READBACK_REQUIRED" };
  const forbidden = ["matched", "posted", "live", "closed", "close_eligible", "business_close_state", "erp_consequence_allowed"];
  const forged = forbidden.filter((field) => Object.prototype.hasOwnProperty.call(candidate, field));
  if (forged.length) return { valid: false, code: `ERP_READBACK_CALLER_OUTCOME_FORBIDDEN:${forged.join(",")}` };
  const missing = REQUIRED_READBACK_FIELDS.filter((field) => candidate[field] === undefined || candidate[field] === null || candidate[field] === "");
  if (missing.length) return { valid: false, code: `ERP_READBACK_MISSING:${missing.join(",")}` };
  const mismatches = REQUIRED_READBACK_FIELDS.filter((field) => {
    if (field === "gl_balanced" || field === "direct_submit") return Boolean(candidate[field]) !== Boolean(expected[field]);
    return !same(candidate[field], expected[field]);
  });
  return mismatches.length ? { valid: false, code: `ERP_READBACK_MISMATCH:${mismatches.join(",")}` } : { valid: true };
}

const simulationAmount = (value) => {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) return null;
  try {
    return BigInt(text);
  } catch {
    return null;
  }
};

const simulationBlocked = (scenario, errors, contract) => ({
  schema: SIMULATION_SCHEMA,
  scenario,
  status: "BLOCKED",
  runtime_state: "unavailable",
  errors: [...new Set(errors.filter(Boolean))],
  policy: { status: "not_evaluated" },
  allowance: { status: "not_evaluated" },
  envelope: { status: "not_evaluated" },
  dapp_object: {
    id: SIMULATION_OBJECT_ID,
    applicability: contract?.dapp_objects?.[SIMULATION_OBJECT_ID]?.applicability ?? "required",
    runtime_state: "unavailable"
  },
  local_fixture_only: true,
  live_arc: false,
  live_erp: false,
  direct_erp_mutation: false,
  external_actions: 0
});

/**
 * Deterministic local preflight for policy, allowance and unsigned envelope.
 * It never signs, submits, calls RPC/ERP or promotes a receipt.  Missing or
 * inconsistent inputs remain BLOCKED with zero side effects.
 */
export function simulateCurrentReleaseWorkbench({ scenario, policy, allowance, envelope, now = "2026-08-06T00:00:00Z" } = {}) {
  const contract = scenarioContract(scenario);
  if (!contract) return simulationBlocked(scenario, ["SIMULATION_SCENARIO_REQUIRED"], null);
  const simulationSpec = contract.dapp_objects?.[SIMULATION_OBJECT_ID];
  if (simulationSpec?.applicability !== "required") {
    return {
      schema: SIMULATION_SCHEMA,
      scenario,
      status: "NOT_APPLICABLE",
      runtime_state: "not_applicable",
      errors: [],
      dapp_object: { id: SIMULATION_OBJECT_ID, ...simulationSpec },
      local_fixture_only: true,
      live_arc: false,
      live_erp: false,
      direct_erp_mutation: false,
      external_actions: 0
    };
  }
  const errors = [];
  const p = object(policy);
  const a = object(allowance);
  const e = object(envelope);
  if (!p) errors.push("SIMULATION_POLICY_REQUIRED");
  if (!a) errors.push("SIMULATION_ALLOWANCE_REQUIRED");
  if (!e) errors.push("SIMULATION_UNSIGNED_ENVELOPE_REQUIRED");
  const amount = simulationAmount(e?.amount6 ?? p?.amount6);
  const cap = simulationAmount(p?.cap_amount6 ?? p?.capAmount6);
  const allowanceAmount = simulationAmount(a?.amount6 ?? a?.allowance_amount6 ?? a?.value6);
  if (amount === null || amount <= 0n) errors.push("SIMULATION_AMOUNT_INVALID");
  if (cap === null || amount !== null && cap < amount) errors.push("SIMULATION_POLICY_CAP_INVALID");
  if (allowanceAmount === null || amount !== null && allowanceAmount < amount) errors.push("SIMULATION_ALLOWANCE_INSUFFICIENT");
  if (!p?.version) errors.push("SIMULATION_POLICY_VERSION_REQUIRED");
  const expiry = Date.parse(String(p?.expires_at ?? p?.expiry ?? ""));
  const nowMs = Date.parse(String(now));
  if (!Number.isFinite(expiry) || !Number.isFinite(nowMs) || expiry <= nowMs) errors.push("SIMULATION_POLICY_EXPIRED");
  if (!e?.scenario || e.scenario !== scenario) errors.push("SIMULATION_ENVELOPE_SCENARIO_MISMATCH");
  if (!e?.to || !e?.calldata) errors.push("SIMULATION_ENVELOPE_FIELDS_REQUIRED");
  if (e?.signed === true || e?.signature || e?.submitted === true) errors.push("SIMULATION_SIGNING_OR_SUBMIT_FORBIDDEN");
  if (e?.external_actions !== undefined && e.external_actions !== 0) errors.push("SIMULATION_EXTERNAL_ACTION_FORBIDDEN");
  const status = errors.length ? "BLOCKED" : "SIMULATED";
  return {
    schema: SIMULATION_SCHEMA,
    scenario,
    status,
    runtime_state: status === "SIMULATED" ? "projected" : "unavailable",
    errors,
    policy: { version: p?.version ?? null, cap_amount6: p?.cap_amount6 ?? p?.capAmount6 ?? null, expires_at: p?.expires_at ?? p?.expiry ?? null, nonce: p?.nonce ?? null },
    allowance: { amount6: a?.amount6 ?? a?.allowance_amount6 ?? a?.value6 ?? null, freshness: a?.freshness ?? null },
    envelope: { scenario: e?.scenario ?? null, amount6: e?.amount6 ?? null, to: e?.to ?? null, calldata: e?.calldata ?? null, signed: e?.signed === true, submitted: e?.submitted === true },
    dapp_object: { id: SIMULATION_OBJECT_ID, applicability: "required", runtime_state: status === "SIMULATED" ? "projected" : "unavailable" },
    local_fixture_only: true,
    live_arc: false,
    live_erp: false,
    direct_erp_mutation: false,
    external_actions: 0
  };
}

export function validateCurrentReleaseSimulation(simulation, { scenario } = {}) {
  const s = object(simulation);
  const errors = [];
  if (!s || s.schema !== SIMULATION_SCHEMA) errors.push("SIMULATION_SCHEMA_REQUIRED");
  if (s?.scenario !== (scenario ?? s?.scenario)) errors.push("SIMULATION_SCENARIO_MISMATCH");
  if (s?.local_fixture_only !== true || s?.live_arc !== false || s?.live_erp !== false) errors.push("SIMULATION_LIVE_CLAIM_FORBIDDEN");
  if (s?.direct_erp_mutation !== false || s?.external_actions !== 0) errors.push("SIMULATION_EXTERNAL_SIDE_EFFECT_FORBIDDEN");
  if (!["SIMULATED", "BLOCKED", "NOT_APPLICABLE"].includes(s?.status)) errors.push("SIMULATION_STATUS_INVALID");
  if (s?.status === "SIMULATED" && s?.runtime_state !== "projected") errors.push("SIMULATION_PROJECTED_STATE_REQUIRED");
  if (s?.status === "BLOCKED" && (!Array.isArray(s?.errors) || s.errors.length === 0)) errors.push("SIMULATION_BLOCK_REASON_REQUIRED");
  return { valid: errors.length === 0, errors };
}

function contractErrors(authority, scenario) {
  const errors = [];
  const contract = scenarioContract(scenario);
  if (!authority || !contract) return ["SCENARIO_AUTHORITY_MISSING"];
  if (authority.scenario !== scenario || authority.profile_id !== scenario) errors.push("SCENARIO_IDENTITY_MISMATCH");
  if (authority.primary_action !== contract.primary_action) errors.push("PRIMARY_ACTION_IDENTITY_MISMATCH");
  if (authority.origin !== "erp_initiated" && authority.origin !== "chain_observed") errors.push("ORIGIN_INVALID");
  const sourceHash = authority.projection_output?.consequence_preview?.payment_entry?.source_document_hash
    ?? authority.projection_output?.consequence_preview?.gl?.readback?.source_document_hash
    ?? authority.source_hash;
  if (!sourceHash) errors.push("SOURCE_HASH_REQUIRED");
  return errors;
}

/**
 * Build a deterministic observation tuple for tests or a trusted adapter.
 * The returned values are copied from the frozen authority record; callers
 * cannot promote a projection by supplying a status boolean.
 */
export function buildAuthorityObservation(scenario) {
  const authority = getC15UpstreamAuthorityForScenario(scenario);
  if (!authority) return null;
  return { receipt: receiptIdentity(authority), erpReadback: expectedReadback(authority) };
}

/**
 * Project one C15 scenario through the public release boundary. Missing or
 * altered receipt/readback facts remain OPEN with zero consequence.
 */
export function projectCurrentReleaseWorkbench({ scenario, receipt, erpReadback, failure = null, simulation = null } = {}) {
  const authority = getC15UpstreamAuthorityForScenario(scenario);
  const errors = contractErrors(authority, scenario);
  if (errors.length) return blocked(authority, scenario, errors);
  if (failure) return blocked(authority, scenario, [String(failure)]);
  const receiptResult = receiptMatches(receipt, receiptIdentity(authority));
  if (!receiptResult.valid) return blocked(authority, scenario, [receiptResult.code], { receiptObserved: Boolean(receipt) });
  const readbackResult = readbackMatches(erpReadback, expectedReadback(authority));
  if (!readbackResult.valid) return blocked(authority, scenario, [readbackResult.code], { receiptObserved: true });
  const projection = clone(authority.projection_output);
  projection.schema = "arc-erp.product-construction.v3.2.c15.current-release-workbench.v1";
  projection.release_id = CURRENT_RELEASE_WORKBENCH_ID;
  projection.source_authority_id = authority.authority_id;
  projection.origin = authority.origin;
  projection.authority_origin = authority.origin;
  projection.evidence_level = "synthetic_local";
  projection.local_fixture_only = true;
  projection.live_arc = false;
  projection.live_erp = false;
  projection.external_actions = 0;
  projection.direct_erp_mutation = false;
  projection.receipt_observed = true;
  projection.verified_programme_evidence = CURRENT_ARC_VERIFIED_PROGRAMME_EVIDENCE;
  projection.verified_erp_evidence = CURRENT_ERP_VERIFIED_READ_ONLY_EVIDENCE;
  projection.simulation = simulation ? clone(simulation) : simulateCurrentReleaseWorkbench({ scenario });
  projection.typed_readbacks = buildTypedReadbacks(authority);
  projection.dapp = clone(projection.dapp ?? {});
  projection.dapp.objects = { ...(projection.dapp.objects ?? {}), [SIMULATION_OBJECT_ID]: clone(projection.simulation.dapp_object) };
  projection.status = "MATCHED";
  projection.open_state = "MATCHED";
  return projection;
}

/**
 * Verify the public projection shape without trusting caller outcome flags.
 */
export function validateCurrentReleaseProjection(projection, { scenario } = {}) {
  const p = object(projection);
  const errors = [];
  const expectedScenario = scenario ?? p?.scenario;
  const authority = getC15UpstreamAuthorityForScenario(expectedScenario);
  if (!p || !authority) errors.push("PROJECTION_AUTHORITY_REQUIRED");
  if (p?.scenario !== expectedScenario) errors.push("PROJECTION_SCENARIO_MISMATCH");
  if (p?.source_authority_id !== authority?.authority_id) errors.push("PROJECTION_AUTHORITY_MISMATCH");
  if (p?.origin !== authority?.origin || !["erp_initiated", "chain_observed"].includes(p?.origin)) errors.push("PROJECTION_ORIGIN_ASSERTION_REQUIRED");
  if (p?.evidence_level !== "synthetic_local" || p?.live_arc !== false || p?.live_erp !== false) errors.push("LIVE_CLAIM_FORBIDDEN");
  if (p?.external_actions !== 0 || p?.direct_erp_mutation !== false) errors.push("EXTERNAL_SIDE_EFFECT_FORBIDDEN");
  if (p?.simulation && !validateCurrentReleaseSimulation(p.simulation, { scenario: expectedScenario }).valid) errors.push("SIMULATION_BOUNDARY_INVALID");
  const readbacks = validateTypedReadbacks(p?.typed_readbacks, authority, { matched: p?.status === "MATCHED" });
  if (!readbacks.valid) errors.push(...readbacks.errors);
  const expectedReadbacks = p?.status === "MATCHED" ? buildTypedReadbacks(authority) : buildBlockedTypedReadbacks(authority);
  if (stable(p?.typed_readbacks) !== stable(expectedReadbacks)) errors.push("TYPED_READBACK_AUTHORITY_DRIFT");
  if (!p?.profile || p.profile.primary_action !== scenarioContract(expectedScenario)?.primary_action) errors.push("PRIMARY_ACTION_ASSERTION_REQUIRED");
  if (p?.status === "MATCHED" && p?.erp_consequence_allowed !== true) errors.push("MATCHED_CONSEQUENCE_BOUNDARY");
  if (p?.status !== "MATCHED" && (p?.erp_consequence_allowed !== false || JSON.stringify(p?.erp_consequence_counts) !== JSON.stringify(ZERO_COUNTS))) errors.push("OPEN_ZERO_CONSEQUENCE_REQUIRED");
  return { valid: errors.length === 0, errors };
}

/**
 * Local-only idempotency seam used by the candidate and its tests. It models
 * the persisted ledger decision without writing a ledger or creating side
 * effects; a byte-equivalent retry is a duplicate no-op and a changed payload
 * is rejected.
 */
export function consumeCurrentReleaseProjection(projection, ledger = new Map()) {
  const p = object(projection);
  if (!p || p.status !== "MATCHED" || p.erp_consequence_allowed !== true) return { state: "OPEN", consequence_count: 0, error: "PROJECTION_NOT_CONSUMABLE" };
  const canonicalEventKey = p.receipt?.canonical_event_key;
  if (!canonicalEventKey) return { state: "OPEN", consequence_count: 0, error: "CANONICAL_EVENT_KEY_REQUIRED" };
  const key = `${p.scenario}:${canonicalEventKey}`;
  const fingerprint = stable({
    key,
    origin: p.origin,
    receipt: p.receipt,
    typed_readbacks: p.typed_readbacks,
    consequence_preview: p.consequence_preview,
    erp_consequence_counts: p.erp_consequence_counts,
    business_close_state: p.business_close_state
  });
  const prior = ledger.get(key);
  if (!prior) {
    ledger.set(key, fingerprint);
    return { state: "new", consequence_count: 1, key };
  }
  if (prior === fingerprint) return { state: "DUPLICATE_NOOP", consequence_count: 1, key };
  return { state: "CONFLICT_REJECT", consequence_count: 1, key, error: "IMMUTABLE_PAYLOAD_CONFLICT" };
}

export const C15_WORKBENCH_CONTRACT = Object.freeze({
  id: CURRENT_RELEASE_WORKBENCH_ID,
  version: CURRENT_RELEASE_WORKBENCH_VERSION,
  scenarios: CURRENT_RELEASE_WORKBENCH_SCENARIOS,
  required_receipt_fields: REQUIRED_RECEIPT_FIELDS,
  required_readback_fields: REQUIRED_READBACK_FIELDS,
  action_state_machine: A12_C15_ACCEPTED_ACTION_STATE_MACHINE,
  boundary: CURRENT_RELEASE_WORKBENCH_BOUNDARY,
  simulation_schema: SIMULATION_SCHEMA,
  dapp_object_ids: Object.freeze(Array.from(new Set(
    Object.values(A12_C15_ACCEPTED_SCENARIO_PROJECTION_MATRIX)
      .filter((value) => value?.dapp_objects)
      .flatMap((value) => Object.keys(value.dapp_objects).concat(SIMULATION_OBJECT_ID))
  )))
});
