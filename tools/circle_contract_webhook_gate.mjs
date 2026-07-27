import { createHash } from "node:crypto";

const ADDRESS = /^0x[0-9a-f]{40}$/i;
const HASH = /^0x[0-9a-f]{64}$/i;

function normalizeAddress(value) {
  return String(value ?? "").toLowerCase();
}

export function buildCircleWebhookPolicy(options = {}) {
  return {
    enabled: options.enabled === true,
    durableQueueAvailable: options.durableQueueAvailable === true,
    chainId: Number(options.chainId ?? 5042002),
    contractAddress: normalizeAddress(options.contractAddress),
    eventSignature: options.eventSignature ?? "EvidenceAnchored(bytes32,bytes32,bytes32,bytes32,uint8)",
    notificationType: "contracts.eventLog"
  };
}

export function validateCircleContractNotification(payload, policy) {
  const errors = [];
  const notification = payload?.notification ?? {};
  if (!policy.enabled) errors.push("receiver_disabled");
  if (!policy.durableQueueAvailable) errors.push("durable_queue_required");
  if (payload?.notificationType !== policy.notificationType) errors.push("unexpected_notification_type");
  if (!String(payload?.notificationId ?? "")) errors.push("notification_id_required");
  if (normalizeAddress(notification.contractAddress) !== policy.contractAddress || !ADDRESS.test(notification.contractAddress ?? "")) {
    errors.push("unexpected_contract_address");
  }
  if (String(notification.eventSignature ?? "") !== policy.eventSignature) errors.push("unexpected_event_signature");
  if (!HASH.test(notification.txHash ?? "")) errors.push("invalid_transaction_hash");
  if (!Number.isInteger(Number(notification.chainId)) || Number(notification.chainId) !== policy.chainId) {
    errors.push("unexpected_chain_id");
  }
  return {
    accepted: errors.length === 0,
    errors,
    idempotency_key: payload?.notificationId ?? null,
    event_fingerprint: HASH.test(notification.txHash ?? "")
      ? createHash("sha256").update(`${normalizeAddress(notification.contractAddress)}:${notification.txHash}:${notification.logIndex ?? ""}`).digest("hex")
      : null,
    boundaries: {
      chain_write: false,
      erp_write: false,
      payment_authorized: false,
      requires_durable_queue_before_enablement: true
    }
  };
}

export function buildCircleWebhookReadiness(policy) {
  const blockers = [];
  if (!policy.enabled) blockers.push("receiver_disabled_by_default");
  if (!policy.durableQueueAvailable) blockers.push("durable_queue_not_configured");
  if (!ADDRESS.test(policy.contractAddress)) blockers.push("contract_address_invalid");
  return {
    status: blockers.length ? "not_ready_fail_closed" : "ready_for_circle_console_subscription",
    blockers,
    policy,
    boundaries: {
      accepts_notifications: blockers.length === 0,
      verifies_notification_signature: "required_at_runtime",
      creates_circle_subscription: false,
      broadcasts_transactions: false,
      creates_erp_documents: false
    }
  };
}
