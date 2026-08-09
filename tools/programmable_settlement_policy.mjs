import { createHash } from "node:crypto";

const ARC_TESTNET_CHAIN_ID = 5042002;

function fail(code, detail) {
  return {
    status: "blocked_fail_closed",
    code,
    detail,
    settlement_instruction: null,
    boundaries: { wallet_action: false, chain_transaction: false, erp_write: false, custody: false }
  };
}

// A review-only programme delta. It deliberately cannot prepare calldata,
// connect a wallet, broadcast a transaction, retain funds, or write ERP.
export function evaluateProgrammableSettlement(input) {
  if (!input || typeof input !== "object") return fail("INVALID_INPUT", "A policy input object is required.");
  if (input.chain_id !== ARC_TESTNET_CHAIN_ID) return fail("NETWORK_NOT_ARC_TESTNET", "Only the Arc Testnet policy profile is supported.");
  if (input.asset !== "USDC") return fail("ASSET_NOT_USDC", "The policy is defined for a USDC settlement instruction.");
  if (!Number.isSafeInteger(input.amount_minor) || input.amount_minor <= 0) return fail("INVALID_AMOUNT", "amount_minor must be a positive integer.");
  if (!input.settlement_id || !input.payee_ref) return fail("MISSING_SETTLEMENT_REFERENCE", "A settlement and payee reference are required.");
  if (input.quality_status !== "accepted") return fail("QUALITY_NOT_ACCEPTED", "Quality acceptance is a required predecessor condition.");
  if (input.evidence_anchor_status !== "confirmed") return fail("EVIDENCE_ANCHOR_UNCONFIRMED", "The evidence anchor must be confirmed before review.");
  if (input.human_approval !== true) return fail("HUMAN_APPROVAL_REQUIRED", "This policy never auto-approves a payment.");
  if (input.request_wallet_action === true || input.request_erp_write === true) return fail("WRITE_ACTION_OUT_OF_SCOPE", "The preview cannot request a wallet action or ERP write.");

  const canonical = JSON.stringify({
    settlement_id: input.settlement_id,
    payee_ref: input.payee_ref,
    asset: input.asset,
    amount_minor: input.amount_minor,
    chain_id: input.chain_id,
    quality_status: input.quality_status,
    evidence_anchor_status: input.evidence_anchor_status
  });
  const instruction_id = createHash("sha256").update(canonical).digest("hex");
  return {
    status: "review_ready_unsigned_instruction",
    code: "ALL_CONDITIONS_MET",
    settlement_instruction: {
      instruction_id,
      settlement_id: input.settlement_id,
      payee_ref: input.payee_ref,
      asset: "USDC",
      amount_minor: input.amount_minor,
      chain_id: ARC_TESTNET_CHAIN_ID,
      predecessors: ["quality_accepted", "evidence_anchor_confirmed", "human_approval"],
      action: "prepare_exact_wallet_review_only"
    },
    boundaries: { wallet_action: false, chain_transaction: false, erp_write: false, custody: false }
  };
}
