import assert from "node:assert/strict";
import { test } from "node:test";

import { verifyCurrentMvpErpReadiness, verifyEmbeddedCurrentMvpErpProjection, bindVerifiedEmbeddedErpProjectionToPublicRelease } from "./current_mvp_erp_readiness.mjs";
import { CURRENT_ERP_VERIFIED_READ_ONLY_EVIDENCE } from "../current-mvp/web/workbench/workbench-projection.mjs";

const sha = (digit) => digit.repeat(64);
const release = { release_id: "vmc-current-mvp-r1", commit_sha: "a".repeat(40), manifest_sha256: sha("b") };
const company = "Gayson Labs Pte Ltd";
const truthClass = { read_only_readiness: "live_erp_readiness", erp_mutation_receipt: "live_erp_mutation_receipt", posting_readback: "live_erp_posting_readback", business_close_readback: "live_erp_business_close_readback" };
const envelope = (kind) => ({ kind, company, release_id: release.release_id, commit_sha: release.commit_sha, manifest_sha256: release.manifest_sha256, truth_class: truthClass[kind], local_fixture_only: false, live_erp: true, external_actions: 0, observed_at: "2026-08-10T12:00:00Z" });
const readiness = { ...envelope("read_only_readiness"), mode: "read_only", mutation_allowed: false, company_readback: company, doctypes: ["Payment Entry", "Bank Transaction", "GL Entry", "Payment Ledger Entry", "Accounting Period", "Period Closing Voucher"] };
const mutationReceipt = { ...envelope("erp_mutation_receipt"), id: "erp-mutation:pe-001", doctype: "Payment Entry", action: "submit", document_id: "PE-2026-001", receipt_status: "accepted", request_fingerprint: sha("c") };
const postingReadback = {
  ...envelope("posting_readback"), id: "posting:pe-001", mutation_receipt_id: mutationReceipt.id,
  payment_entry: { name: mutationReceipt.document_id, docstatus: 1 },
  gl: { digest: sha("d"), company, balanced: true, debit6: "1250000000", credit6: "1250000000" },
  payment_ledger: { digest: sha("e"), company, voucher_id: mutationReceipt.document_id, open_item_id: "PINV-2026-044", before6: "1250000000", after6: "0" },
  open_item: { id: "PINV-2026-044", before6: "1250000000", after6: "0", status: "CLOSED" }
};
const businessCloseReadback = {
  ...envelope("business_close_readback"), id: "business-close:001", posting_readback_id: postingReadback.id,
  gl_digest: postingReadback.gl.digest, pled_digest: postingReadback.payment_ledger.digest,
  open_item_id: postingReadback.open_item.id, open_item_status: postingReadback.open_item.status,
  accounting_period: { id: "AP-2026", company, status: "ended", start_date: "2026-01-01", end_date: "2026-12-31" },
  period_closing_voucher: { id: "PCV-2026-001", company, docstatus: 1, posting_readback_id: postingReadback.id, gl_digest: postingReadback.gl.digest, pled_digest: postingReadback.payment_ledger.digest },
  status: "CLOSED", confirmed_by: { role: "controller", operator_id: "controller-001" }
};

test("local fixture is explicit and never promoted to live ERP", () => {
  const result = verifyCurrentMvpErpReadiness({ release, company, localFixture: { local_fixture_only: true, live_erp: false } });
  assert.equal(result.valid, true);
  assert.equal(result.status, "LOCAL_FIXTURE_ONLY");
  assert.equal(result.business_close_verified, false);
  assert.equal(result.local_fixture_is_live, false);
});

test("read-only readiness, mutation receipt and posting readback remain separate layers", () => {
  const ready = verifyCurrentMvpErpReadiness({ release, company, readiness });
  assert.equal(ready.status, "READ_ONLY_READY");
  assert.equal(ready.business_close_verified, false);
  assert.deepEqual(ready.missing, ["erp_mutation_receipt", "posting_readback", "business_close_readback"]);

  const mutated = verifyCurrentMvpErpReadiness({ release, company, readiness, mutationReceipt });
  assert.equal(mutated.status, "ERP_MUTATION_RECEIPT_VERIFIED");
  assert.equal(mutated.business_close_verified, false);

  const posted = verifyCurrentMvpErpReadiness({ release, company, readiness, mutationReceipt, postingReadback });
  assert.equal(posted.status, "POSTING_READBACK_VERIFIED");
  assert.equal(posted.business_close_verified, false);
});

test("complete company/commit/GL/PLED/open-item/period chain verifies business close", () => {
  const result = verifyCurrentMvpErpReadiness({ release, company, readiness, mutationReceipt, postingReadback, businessCloseReadback });
  assert.equal(result.valid, true);
  assert.equal(result.status, "BUSINESS_CLOSE_VERIFIED");
  assert.equal(result.highest_verified_layer, "business_close_readback");
  assert.equal(result.business_close_verified, true);
  assert.equal(result.external_actions, 0);
  assert.match(result.verification_fingerprint, /^[0-9a-f]{64}$/);
});

test("missing or cross-boundary evidence cannot claim business close", () => {
  const missingPosting = verifyCurrentMvpErpReadiness({ release, company, readiness, mutationReceipt, businessCloseReadback });
  assert.equal(missingPosting.status, "BLOCKED");
  assert.equal(missingPosting.business_close_verified, false);
  assert.equal(missingPosting.errors.includes("BUSINESS_CLOSE_WITHOUT_POSTING_FORBIDDEN"), true);

  const wrongCompanyPosting = { ...postingReadback, company: "Other Company" };
  const wrongCompany = verifyCurrentMvpErpReadiness({ release, company, readiness, mutationReceipt, postingReadback: wrongCompanyPosting, businessCloseReadback });
  assert.equal(wrongCompany.status, "BLOCKED");
  assert.equal(wrongCompany.errors.includes("POSTING_READBACK_COMPANY_MISMATCH"), true);

  const wrongCommit = { ...businessCloseReadback, commit_sha: "f".repeat(40) };
  const commitMismatch = verifyCurrentMvpErpReadiness({ release, company, readiness, mutationReceipt, postingReadback, businessCloseReadback: wrongCommit });
  assert.equal(commitMismatch.business_close_verified, false);
  assert.equal(commitMismatch.errors.includes("BUSINESS_CLOSE_READBACK_RELEASE_MISMATCH"), true);
});

test("GL, PLED, open-item, period and PCV mismatches each fail closed", () => {
  const mutations = [
    { ...businessCloseReadback, gl_digest: sha("1") },
    { ...businessCloseReadback, pled_digest: sha("2") },
    { ...businessCloseReadback, open_item_status: "OPEN" },
    { ...businessCloseReadback, accounting_period: { ...businessCloseReadback.accounting_period, status: "open" } },
    { ...businessCloseReadback, period_closing_voucher: { ...businessCloseReadback.period_closing_voucher, docstatus: 0 } }
  ];
  for (const candidate of mutations) {
    const result = verifyCurrentMvpErpReadiness({ release, company, readiness, mutationReceipt, postingReadback, businessCloseReadback: candidate });
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.business_close_verified, false);
    assert.equal(result.errors.length > 0, true);
  }
});

test("zero-value or directionally impossible posting evidence cannot close business", () => {
  const zeroGl = { ...postingReadback, gl: { ...postingReadback.gl, debit6: "0", credit6: "0" } };
  const zeroResult = verifyCurrentMvpErpReadiness({ release, company, readiness, mutationReceipt, postingReadback: zeroGl, businessCloseReadback });
  assert.equal(zeroResult.status, "BLOCKED");
  assert.equal(zeroResult.errors.includes("POSTING_GL_READBACK_INVALID"), true);

  const increasedOutstanding = {
    ...postingReadback,
    payment_ledger: { ...postingReadback.payment_ledger, after6: "1300000000" },
    open_item: { ...postingReadback.open_item, after6: "1300000000", status: "PARTIALLY_ALLOCATED" }
  };
  const directionResult = verifyCurrentMvpErpReadiness({ release, company, readiness, mutationReceipt, postingReadback: increasedOutstanding });
  assert.equal(directionResult.status, "BLOCKED");
  assert.equal(directionResult.errors.includes("POSTING_OPEN_ITEM_AMOUNT_OR_STATUS_INVALID"), true);

  const falseClosed = {
    ...postingReadback,
    payment_ledger: { ...postingReadback.payment_ledger, after6: "1" },
    open_item: { ...postingReadback.open_item, after6: "1", status: "CLOSED" }
  };
  const closeResult = verifyCurrentMvpErpReadiness({ release, company, readiness, mutationReceipt, postingReadback: falseClosed });
  assert.equal(closeResult.status, "BLOCKED");
  assert.equal(closeResult.errors.includes("POSTING_OPEN_ITEM_AMOUNT_OR_STATUS_INVALID"), true);
});

test("embedded H167 ERP projection requires exact paid invoice, submitted payment, reconciled bank and balanced GL facts", () => {
  const embeddedRelease = { release_id: "verified-milestone-close-current-mvp-workbench-rc1", commit_sha: "a".repeat(40), manifest_sha256: sha("b"), observed_at: "2026-08-12T12:00:00Z" };
  const accepted = verifyEmbeddedCurrentMvpErpProjection({ release: embeddedRelease, evidence: CURRENT_ERP_VERIFIED_READ_ONLY_EVIDENCE });
  assert.equal(accepted.valid, true);
  for (const field of ["purchase_invoice", "payment_entry", "bank_transaction"]) {
    const mutated = structuredClone(CURRENT_ERP_VERIFIED_READ_ONLY_EVIDENCE);
    delete mutated[field];
    const rejected = verifyEmbeddedCurrentMvpErpProjection({ release: embeddedRelease, evidence: mutated });
    assert.equal(rejected.valid, false, field);
  }
  const unbalanced = structuredClone(CURRENT_ERP_VERIFIED_READ_ONLY_EVIDENCE);
  unbalanced.purchase_invoice.gl.total_credit = "0.99";
  assert.equal(verifyEmbeddedCurrentMvpErpProjection({ release: embeddedRelease, evidence: unbalanced }).valid, false);
  const wrongSource = structuredClone(CURRENT_ERP_VERIFIED_READ_ONLY_EVIDENCE);
  wrongSource.source_artifact_sha256 = "a".repeat(64);
  const wrongSourceResult = bindVerifiedEmbeddedErpProjectionToPublicRelease({ release: embeddedRelease, evidence: wrongSource });
  assert.equal(wrongSourceResult.current_release_bound, false);
  assert.equal(wrongSourceResult.public_current_release_bound, false);
  const wrongBatch = structuredClone(CURRENT_ERP_VERIFIED_READ_ONLY_EVIDENCE);
  wrongBatch.source_batch = "HISTORICAL-ERP-EVIDENCE";
  const wrongBatchResult = bindVerifiedEmbeddedErpProjectionToPublicRelease({ release: embeddedRelease, evidence: wrongBatch });
  assert.equal(wrongBatchResult.current_release_bound, false);
  assert.equal(wrongBatchResult.public_current_release_bound, false);
  const wrongEnrichedSource = structuredClone(CURRENT_ERP_VERIFIED_READ_ONLY_EVIDENCE);
  wrongEnrichedSource.enriched_projection_source.packet_object_sha256 = "b".repeat(64);
  const wrongEnrichedSourceResult = bindVerifiedEmbeddedErpProjectionToPublicRelease({ release: embeddedRelease, evidence: wrongEnrichedSource });
  assert.equal(wrongEnrichedSourceResult.current_release_bound, false);
  assert.equal(wrongEnrichedSourceResult.public_current_release_bound, false);
  for (const mutate of [
    (value) => { value.purchase_invoice.selector = "ACC-PINV-FORGED"; },
    (value) => { value.purchase_invoice.supplier = "FORGED-SUPPLIER"; },
    (value) => { value.purchase_invoice.gl.creditors_account = "Forged Creditors"; },
    (value) => { value.payment_entry.selector = "ACC-PAY-FORGED"; },
    (value) => { value.payment_entry.paid_from = "Forged Bank"; },
    (value) => { value.bank_transaction.selector = "ACC-BTN-FORGED"; },
    (value) => { value.payment_is_not_close = false; },
    (value) => { value.claim_boundary.erp_mutation_claimed = true; },
    (value) => { value.mutation_receipt.status = "accepted"; },
    (value) => { value.posting_readback.status = "verified"; }
  ]) {
    const forged = structuredClone(CURRENT_ERP_VERIFIED_READ_ONLY_EVIDENCE);
    mutate(forged);
    const forgedResult = bindVerifiedEmbeddedErpProjectionToPublicRelease({ release: embeddedRelease, evidence: forged });
    assert.equal(forgedResult.current_release_bound, false);
    assert.equal(forgedResult.public_current_release_bound, false);
  }
  const publicBinding = bindVerifiedEmbeddedErpProjectionToPublicRelease({ release: embeddedRelease, evidence: CURRENT_ERP_VERIFIED_READ_ONLY_EVIDENCE });
  assert.equal(publicBinding.status, "VERIFIED_READ_ONLY");
  assert.equal(publicBinding.public_current_release_bound, true);
  assert.equal(publicBinding.business_close_verified, false);
});
