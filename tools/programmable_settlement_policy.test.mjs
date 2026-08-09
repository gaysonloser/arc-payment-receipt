import assert from "node:assert/strict";
import test from "node:test";
import { evaluateProgrammableSettlement } from "./programmable_settlement_policy.mjs";

const input = Object.freeze({
  chain_id: 5042002,
  asset: "USDC",
  amount_minor: 1250000,
  settlement_id: "PMH-QUALITY-001",
  payee_ref: "supplier-demo-01",
  quality_status: "accepted",
  evidence_anchor_status: "confirmed",
  human_approval: true,
  request_wallet_action: false,
  request_erp_write: false
});

test("a policy instruction is deterministic and unsigned", () => {
  const first = evaluateProgrammableSettlement(input);
  const second = evaluateProgrammableSettlement(input);
  assert.equal(first.status, "review_ready_unsigned_instruction");
  assert.equal(first.settlement_instruction.instruction_id, second.settlement_instruction.instruction_id);
  assert.deepEqual(first.boundaries, { wallet_action: false, chain_transaction: false, erp_write: false, custody: false });
});

test("quality, evidence and human approval are separate fail-closed conditions", () => {
  assert.equal(evaluateProgrammableSettlement({ ...input, quality_status: "pending" }).code, "QUALITY_NOT_ACCEPTED");
  assert.equal(evaluateProgrammableSettlement({ ...input, evidence_anchor_status: "pending" }).code, "EVIDENCE_ANCHOR_UNCONFIRMED");
  assert.equal(evaluateProgrammableSettlement({ ...input, human_approval: false }).code, "HUMAN_APPROVAL_REQUIRED");
});

test("the policy cannot become a transaction or ERP write path", () => {
  assert.equal(evaluateProgrammableSettlement({ ...input, request_wallet_action: true }).code, "WRITE_ACTION_OUT_OF_SCOPE");
  assert.equal(evaluateProgrammableSettlement({ ...input, request_erp_write: true }).code, "WRITE_ACTION_OUT_OF_SCOPE");
});
