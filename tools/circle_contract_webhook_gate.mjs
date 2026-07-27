import { createHash, verify } from "node:crypto";

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

function hasNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function buildCircleWebhookRuntimePolicy(environment = process.env) {
  const configured = {
    receiver_enabled: environment.CIRCLE_WEBHOOK_ENABLED === "true",
    durable_queue_declared: environment.CIRCLE_WEBHOOK_DURABLE_QUEUE === "true",
    verification_key_present: hasNonEmptyString(environment.CIRCLE_WEBHOOK_PUBLIC_KEY_PEM)
  };
  const blockers = Object.entries(configured)
    .filter(([, present]) => !present)
    .map(([name]) => `${name}_required`);
  return {
    enabled: blockers.length === 0,
    blockers,
    configured,
    boundaries: {
      requires_circle_console_subscription: true,
      requires_signature_verification: true,
      requires_durable_idempotency_store: true,
      creates_erp_documents: false,
      broadcasts_transactions: false
    }
  };
}

export function verifyCircleWebhookSignature(rawBody, signature, publicKeyPem) {
  if (!Buffer.isBuffer(rawBody) || !hasNonEmptyString(signature) || !hasNonEmptyString(publicKeyPem)) {
    return false;
  }
  try {
    return verify("sha256", rawBody, publicKeyPem, Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}

export function createCircleWebhookProcessor(options = {}) {
  const runtime = options.runtime ?? buildCircleWebhookRuntimePolicy(options.environment);
  const policy = buildCircleWebhookPolicy(options.policy);
  const durableQueue = options.durableQueue;
  const idempotencyStore = options.idempotencyStore;
  const publicKeyPem = options.publicKeyPem ?? options.environment?.CIRCLE_WEBHOOK_PUBLIC_KEY_PEM;

  return async ({ rawBody, headers, payload }) => {
    if (!runtime.enabled) {
      return { accepted: false, status: 503, error: "webhook_receiver_disabled", blockers: runtime.blockers };
    }
    if (!durableQueue?.enqueue || !idempotencyStore?.has || !idempotencyStore?.put) {
      return { accepted: false, status: 503, error: "durable_queue_or_idempotency_store_unavailable" };
    }
    const signature = headers?.["x-circle-signature"];
    if (!verifyCircleWebhookSignature(rawBody, signature, publicKeyPem)) {
      return { accepted: false, status: 401, error: "invalid_circle_signature" };
    }
    const validation = validateCircleContractNotification(payload, policy);
    if (!validation.accepted) {
      return { accepted: false, status: 422, error: "invalid_circle_notification", validation };
    }
    if (await idempotencyStore.has(validation.idempotency_key)) {
      return { accepted: true, status: 200, duplicate: true, idempotency_key: validation.idempotency_key };
    }
    await durableQueue.enqueue({
      idempotency_key: validation.idempotency_key,
      event_fingerprint: validation.event_fingerprint,
      notification_type: payload.notificationType,
      notification: payload.notification
    });
    await idempotencyStore.put(validation.idempotency_key);
    return { accepted: true, status: 202, duplicate: false, idempotency_key: validation.idempotency_key };
  };
}
