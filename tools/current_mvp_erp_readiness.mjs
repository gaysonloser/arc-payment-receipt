import { createHash } from "node:crypto";

export const ERP_EVIDENCE_LAYERS = Object.freeze([
  "local_fixture",
  "read_only_readiness",
  "erp_mutation_receipt",
  "posting_readback",
  "business_close_readback"
]);

const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : null;
const same = (left, right) => String(left ?? "") === String(right ?? "");
const amount = (value) => /^\d+$/.test(String(value ?? ""));
const positiveAmount = (value) => amount(value) && BigInt(String(value)) > 0n;
const unique = (values) => [...new Set(values.filter(Boolean))];
const TRUTH_CLASS = Object.freeze({
  read_only_readiness: "live_erp_readiness",
  erp_mutation_receipt: "live_erp_mutation_receipt",
  posting_readback: "live_erp_posting_readback",
  business_close_readback: "live_erp_business_close_readback"
});

const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};

export const erpEvidenceFingerprint = (value) => createHash("sha256").update(canonical(value)).digest("hex");

const releaseErrors = (release) => {
  const errors = [];
  if (!release?.release_id) errors.push("RELEASE_ID_REQUIRED");
  if (!COMMIT.test(String(release?.commit_sha ?? ""))) errors.push("RELEASE_COMMIT_REQUIRED");
  if (!SHA256.test(String(release?.manifest_sha256 ?? ""))) errors.push("RELEASE_MANIFEST_REQUIRED");
  return errors;
};

const liveEnvelopeErrors = (row, kind, release, company) => {
  const errors = [];
  if (!object(row)) return [`${kind.toUpperCase()}_REQUIRED`];
  if (row.kind !== kind) errors.push(`${kind.toUpperCase()}_KIND_INVALID`);
  if (row.local_fixture_only !== false || row.live_erp !== true || row.truth_class !== TRUTH_CLASS[kind]) errors.push(`${kind.toUpperCase()}_LIVE_TRUTH_REQUIRED`);
  if (row.external_actions !== 0) errors.push(`${kind.toUpperCase()}_VERIFIER_SIDE_EFFECT_FORBIDDEN`);
  if (!same(row.company, company)) errors.push(`${kind.toUpperCase()}_COMPANY_MISMATCH`);
  if (!same(row.release_id, release?.release_id) || !same(row.commit_sha, release?.commit_sha) || !same(row.manifest_sha256, release?.manifest_sha256)) errors.push(`${kind.toUpperCase()}_RELEASE_MISMATCH`);
  if (!row.observed_at) errors.push(`${kind.toUpperCase()}_OBSERVED_AT_REQUIRED`);
  return errors;
};

const postingErrors = (posting, mutation, release, company) => {
  const errors = liveEnvelopeErrors(posting, "posting_readback", release, company);
  if (errors.length) return errors;
  if (!mutation || posting.mutation_receipt_id !== mutation.id) errors.push("POSTING_MUTATION_RECEIPT_BINDING_REQUIRED");
  if (posting.payment_entry?.name !== mutation?.document_id || posting.payment_entry?.docstatus !== 1) errors.push("POSTING_PAYMENT_ENTRY_READBACK_INVALID");
  const gl = posting.gl;
  if (!SHA256.test(String(gl?.digest ?? "")) || gl?.balanced !== true || !positiveAmount(gl?.debit6) || !positiveAmount(gl?.credit6) || !same(gl?.debit6, gl?.credit6) || gl?.company !== company) errors.push("POSTING_GL_READBACK_INVALID");
  const pled = posting.payment_ledger;
  if (!SHA256.test(String(pled?.digest ?? "")) || pled?.company !== company || !pled?.voucher_id || !pled?.open_item_id || !amount(pled?.before6) || !amount(pled?.after6)) errors.push("POSTING_PLED_READBACK_INVALID");
  const open = posting.open_item;
  if (!open?.id || open.id !== pled?.open_item_id || !same(open.before6, pled?.before6) || !same(open.after6, pled?.after6) || !["OPEN", "CLOSED", "PARTIALLY_ALLOCATED"].includes(open?.status)) errors.push("POSTING_OPEN_ITEM_BINDING_INVALID");
  if (amount(pled?.before6) && amount(pled?.after6)) {
    const before = BigInt(String(pled.before6));
    const after = BigInt(String(pled.after6));
    const statusConsistent = before > 0n && after <= before
      && ((open?.status === "CLOSED" && after === 0n)
        || (open?.status === "PARTIALLY_ALLOCATED" && after > 0n && after < before)
        || (open?.status === "OPEN" && after === before));
    if (!statusConsistent) errors.push("POSTING_OPEN_ITEM_AMOUNT_OR_STATUS_INVALID");
  }
  return errors;
};

const businessErrors = (close, posting, release, company) => {
  const errors = liveEnvelopeErrors(close, "business_close_readback", release, company);
  if (errors.length) return errors;
  if (!posting || close.posting_readback_id !== posting.id) errors.push("BUSINESS_POSTING_READBACK_BINDING_REQUIRED");
  if (!same(close.gl_digest, posting?.gl?.digest)) errors.push("BUSINESS_GL_BINDING_INVALID");
  if (!same(close.pled_digest, posting?.payment_ledger?.digest)) errors.push("BUSINESS_PLED_BINDING_INVALID");
  if (!same(close.open_item_id, posting?.open_item?.id) || !same(close.open_item_status, posting?.open_item?.status)) errors.push("BUSINESS_OPEN_ITEM_BINDING_INVALID");
  const period = close.accounting_period;
  if (!period?.id || period.company !== company || period.status !== "ended" || !DATE.test(String(period.start_date ?? "")) || !DATE.test(String(period.end_date ?? "")) || period.start_date > period.end_date) errors.push("BUSINESS_ACCOUNTING_PERIOD_INVALID");
  const pcv = close.period_closing_voucher;
  if (!pcv?.id || pcv.company !== company || pcv.docstatus !== 1 || pcv.posting_readback_id !== posting?.id || pcv.gl_digest !== posting?.gl?.digest || pcv.pled_digest !== posting?.payment_ledger?.digest) errors.push("BUSINESS_PCV_BINDING_INVALID");
  if (close.status !== "CLOSED" || !close.confirmed_by?.operator_id || !["finance_owner", "controller"].includes(close.confirmed_by?.role)) errors.push("BUSINESS_CLOSE_CONFIRMATION_INVALID");
  return errors;
};

export function verifyCurrentMvpErpReadiness({ release, company, localFixture, readiness, mutationReceipt, postingReadback, businessCloseReadback } = {}) {
  const errors = releaseErrors(release);
  if (!company) errors.push("COMPANY_REQUIRED");
  const suppliedLive = [readiness, mutationReceipt, postingReadback, businessCloseReadback].filter(Boolean);
  const fixtureOnly = Boolean(localFixture) && suppliedLive.length === 0;
  if (fixtureOnly) {
    return {
      valid: errors.length === 0 && localFixture?.local_fixture_only === true && localFixture?.live_erp === false,
      status: "LOCAL_FIXTURE_ONLY",
      highest_verified_layer: "local_fixture",
      business_close_verified: false,
      local_fixture_is_live: false,
      external_actions: 0,
      missing: ["read_only_readiness", "erp_mutation_receipt", "posting_readback", "business_close_readback"],
      errors: localFixture?.local_fixture_only === true && localFixture?.live_erp === false ? errors : [...errors, "LOCAL_FIXTURE_BOUNDARY_INVALID"]
    };
  }
  if (!readiness) errors.push("READ_ONLY_READINESS_REQUIRED");
  else {
    errors.push(...liveEnvelopeErrors(readiness, "read_only_readiness", release, company));
    if (readiness.mode !== "read_only" || readiness.mutation_allowed !== false || readiness.company_readback !== company || !Array.isArray(readiness.doctypes) || !["Payment Entry", "Bank Transaction", "GL Entry", "Payment Ledger Entry", "Accounting Period", "Period Closing Voucher"].every((id) => readiness.doctypes.includes(id))) errors.push("READ_ONLY_READINESS_INVALID");
  }
  if (mutationReceipt) {
    errors.push(...liveEnvelopeErrors(mutationReceipt, "erp_mutation_receipt", release, company));
    if (!mutationReceipt.id || !mutationReceipt.document_id || mutationReceipt.doctype !== "Payment Entry" || !["create", "submit"].includes(mutationReceipt.action) || mutationReceipt.receipt_status !== "accepted" || !SHA256.test(String(mutationReceipt.request_fingerprint ?? ""))) errors.push("ERP_MUTATION_RECEIPT_INVALID");
  }
  if (postingReadback) errors.push(...postingErrors(postingReadback, mutationReceipt, release, company));
  if (businessCloseReadback) errors.push(...businessErrors(businessCloseReadback, postingReadback, release, company));
  if (businessCloseReadback && !postingReadback) errors.push("BUSINESS_CLOSE_WITHOUT_POSTING_FORBIDDEN");
  if (postingReadback && !mutationReceipt) errors.push("POSTING_WITHOUT_MUTATION_RECEIPT_FORBIDDEN");
  const clean = unique(errors);
  const layer = clean.length ? "none" : businessCloseReadback ? "business_close_readback" : postingReadback ? "posting_readback" : mutationReceipt ? "erp_mutation_receipt" : readiness ? "read_only_readiness" : "none";
  const status = clean.length ? "BLOCKED" : layer === "business_close_readback" ? "BUSINESS_CLOSE_VERIFIED" : layer === "posting_readback" ? "POSTING_READBACK_VERIFIED" : layer === "erp_mutation_receipt" ? "ERP_MUTATION_RECEIPT_VERIFIED" : "READ_ONLY_READY";
  const missing = ERP_EVIDENCE_LAYERS.slice(1).filter((id) => ({ read_only_readiness: readiness, erp_mutation_receipt: mutationReceipt, posting_readback: postingReadback, business_close_readback: businessCloseReadback })[id] == null);
  const result = { valid: clean.length === 0, status, highest_verified_layer: layer, business_close_verified: status === "BUSINESS_CLOSE_VERIFIED", local_fixture_is_live: false, external_actions: 0, missing, errors: clean };
  return { ...result, verification_fingerprint: erpEvidenceFingerprint({ release, company, status, layer, errors: clean }) };
}

/**
 * Bind the privacy-safe ERP projection embedded in the public workbench to the
 * read-only readiness contract.  The source facts are owner-live readbacks,
 * but the public candidate remains an unbound, non-posting projection: this
 * wrapper deliberately reports live_erp=false and public_current_release_bound
 * false so a manifest cannot promote the projection to a public ERP gate.
 */
export function verifyEmbeddedCurrentMvpErpProjection({ release, evidence } = {}) {
  const source = object(evidence);
  const sourceErrors = [];
  if (!source) sourceErrors.push("ERP_PROJECTION_REQUIRED");
  if (source?.evidence_class !== "verified_erp_read_only") sourceErrors.push("ERP_PROJECTION_CLASS_INVALID");
  if (source?.credentials_exposed !== false) sourceErrors.push("ERP_PROJECTION_CREDENTIAL_BOUNDARY_INVALID");
  if (source?.local_fixture_only !== false) sourceErrors.push("ERP_PROJECTION_FIXTURE_BOUNDARY_INVALID");
  if (source?.external_actions !== 0) sourceErrors.push("ERP_PROJECTION_EXTERNAL_ACTIONS_INVALID");
  if (!source?.company || !source?.company_abbr) sourceErrors.push("ERP_PROJECTION_COMPANY_REQUIRED");
  if (source?.business_close?.status !== "not_proven" || source?.accounting_period?.status !== "not_proven" || source?.period_closing_voucher?.status !== "not_proven") sourceErrors.push("ERP_PROJECTION_CLOSE_BOUNDARY_INVALID");
  if (source?.payment_ledger?.status !== "not_proven") sourceErrors.push("ERP_PROJECTION_PLED_BOUNDARY_INVALID");
  const readiness = source ? {
    kind: "read_only_readiness",
    company: source.company,
    release_id: release?.release_id,
    commit_sha: release?.commit_sha,
    manifest_sha256: release?.manifest_sha256,
    truth_class: TRUTH_CLASS.read_only_readiness,
    local_fixture_only: false,
    live_erp: true,
    external_actions: 0,
    observed_at: release?.observed_at ?? "2026-08-10T00:00:00.000Z",
    mode: "read_only",
    mutation_allowed: false,
    company_readback: source.company,
    doctypes: ["Payment Entry", "Bank Transaction", "GL Entry", "Payment Ledger Entry", "Accounting Period", "Period Closing Voucher"]
  } : null;
  const verified = sourceErrors.length ? { valid: false, status: "BLOCKED", errors: sourceErrors, business_close_verified: false, external_actions: 0 } : verifyCurrentMvpErpReadiness({ release, company: source.company, readiness });
  const errors = unique([...(verified.errors ?? []), ...sourceErrors]);
  const valid = errors.length === 0 && verified.valid === true && verified.status === "READ_ONLY_READY" && verified.business_close_verified === false;
  const result = {
    valid,
    status: valid ? "VERIFIED_READ_ONLY_CANDIDATE" : "UNPROVEN",
    readiness_status: verified.status,
    owner_live_readback_binding: valid,
    source_truth_live_erp: valid,
    live_erp: false,
    local_fixture_only: false,
    current_worktree_candidate_bound: false,
    public_current_release_bound: false,
    business_close: "not_proven",
    business_close_verified: false,
    external_actions: 0,
    missing: valid ? ["erp_mutation_receipt", "posting_readback", "business_close_readback"] : ["read_only_readiness"],
    errors,
    verification_fingerprint: erpEvidenceFingerprint({
      release,
      source: source ? {
        evidence_class: source.evidence_class,
        source_batch: source.source_batch,
        source_artifact_sha256: source.source_artifact_sha256,
        company: source.company,
        company_abbr: source.company_abbr,
        payment_ledger: source.payment_ledger,
        accounting_period: source.accounting_period,
        period_closing_voucher: source.period_closing_voucher,
        business_close: source.business_close,
        external_actions: source.external_actions
      } : null,
      status: valid ? "VERIFIED_READ_ONLY_CANDIDATE" : "UNPROVEN",
      business_close: "not_proven",
      public_current_release_bound: false,
      live_erp: false,
      errors
    })
  };
  return result;
}
