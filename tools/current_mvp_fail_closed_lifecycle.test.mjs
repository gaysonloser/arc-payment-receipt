import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createSettlementCase,
  projectSettlementCase,
  settlementCaseReducer
} from "../current-mvp/web/settlement-case.mjs";

const typedEvidence = (state, tier) => ({
  tier,
  observationId: `observation:${state.caseId}:${tier}`,
  source: "typed_server_evidence",
  roles: { reviewer: "reviewer-fixture", payer: "payer-fixture", distinct: true },
  serverEvidence: {
    source: "typed_server_evidence",
    authorityRef: `local-server-evidence:${state.caseId}`,
    caseId: state.caseId,
    companyId: state.companyId,
    treasuryId: state.treasuryId,
    observationId: `observation:${state.caseId}:${tier}`,
    tier,
    roles: { reviewer: "reviewer-fixture", payer: "payer-fixture", distinct: true }
  }
});

const operator = { role: "reviewer", operatorId: "reviewer-fixture" };

test("weak evidence and unconfirmed Tier C are named fail-closed states", () => {
  const initial = createSettlementCase();
  const weak = settlementCaseReducer(initial, { type: "SET_EVIDENCE", evidence: { tier: "D" } });
  assert.equal(weak.matcherState, "weak_evidence");
  assert.equal(weak.outcome, "weak_evidence");
  assert.equal(projectSettlementCase(weak).result.key, "weak_evidence");
  assert.match(projectSettlementCase(weak).document.openItem, /OPEN/);

  const tierC = settlementCaseReducer(initial, { type: "SET_EVIDENCE", evidence: typedEvidence(initial, "C") });
  assert.equal(tierC.matcherState, "tier_c_unconfirmed");
  assert.equal(tierC.outcome, "tier_c_unconfirmed");
  assert.equal(projectSettlementCase(tierC).result.key, "tier_c_unconfirmed");
  assert.equal(tierC.erp.paymentEntry, null);
  assert.equal(tierC.close.business, "OPEN");

  const confirmed = settlementCaseReducer(tierC, { type: "CONFIRM_TIER_C", confirmation: { operatorId: "reviewer-fixture", role: "reviewer", reason: "Reviewed typed Tier C source.", confirmedAt: "2026-08-10T12:00:00Z" } });
  assert.equal(confirmed.matcherState, "not_evaluated");
  assert.equal(confirmed.originObservation.tierCConfirmed, true);
});

test("REVOKE is idempotent and preserves history plus the open item", () => {
  const initial = createSettlementCase();
  const openItem = projectSettlementCase(initial).document.openItem;
  const applied = settlementCaseReducer(initial, { type: "REVOKE", operationKey: "revoke:case:001", reason: "Reviewer withdrew local evidence.", authority: operator });
  assert.equal(applied.lastLifecycleResult.state, "APPLIED");
  assert.equal(applied.lifecycleOperations["revoke:case:001"].openItem, openItem);
  assert.equal(applied.close.business, "OPEN");
  const historyLength = applied.caseHistory.length;
  const duplicate = settlementCaseReducer(applied, { type: "REVOKE", operationKey: "revoke:case:001", reason: "Retry.", authority: operator });
  assert.equal(duplicate.lastLifecycleResult.state, "DUPLICATE_NOOP");
  assert.equal(duplicate.caseHistory.length, historyLength);
  assert.deepEqual(duplicate.lifecycleOperations, applied.lifecycleOperations);
});

test("REVERSAL is source-bound, idempotent and conflicts fail closed", () => {
  const empty = createSettlementCase();
  const missing = settlementCaseReducer(empty, { type: "REVERSAL", operationKey: "reverse:logical:001", reason: "Correct accounting mapping.", authority: { role: "finance_operator", operatorId: "finance-fixture" } });
  assert.equal(missing.unresolvedReason, "REVERSAL_SOURCE_REQUIRED");

  const source = createSettlementCase();
  source.matcherState = "matched";
  source.outcome = "matched";
  source.receipt.logicalPaymentId = `logical:${source.caseId}:${source.policy.transferId}`;
  const action = { type: "REVERSAL", operationKey: "reverse:logical:001", reason: "Correct accounting mapping.", authority: { role: "finance_operator", operatorId: "finance-fixture" } };
  const applied = settlementCaseReducer(source, action);
  assert.equal(applied.lastLifecycleResult.state, "APPLIED");
  assert.equal(applied.lifecycleOperations[action.operationKey].priorLogicalPaymentId, source.receipt.logicalPaymentId);
  assert.equal(applied.receipt.logicalPaymentId, null);
  const historyLength = applied.caseHistory.length;
  const duplicate = settlementCaseReducer(applied, action);
  assert.equal(duplicate.lastLifecycleResult.state, "DUPLICATE_NOOP");
  assert.equal(duplicate.caseHistory.length, historyLength);
  const conflict = settlementCaseReducer(applied, { ...action, type: "REVOKE" });
  assert.equal(conflict.lastLifecycleResult.state, "CONFLICT_REJECT");
  assert.equal(conflict.unresolvedReason, "IDEMPOTENCY_KEY_CONFLICT");
  assert.equal(conflict.caseHistory.length, historyLength);
});
