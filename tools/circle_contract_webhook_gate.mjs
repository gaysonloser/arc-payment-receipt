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

// ---- Circle Console current-release evidence lane ----
// A typed, fail-closed receipt for a current authenticated Circle Console
// contract import / event subscription readback. Nothing historical, forbidden,
// sign-in-gated, or sourced from a local fixture can ever produce a receipt.

export const CIRCLE_CONSOLE_RECEIPT_SCHEMA = "arc.circle-console-receipt.v1";
export const CIRCLE_CONSOLE_SURFACE = "circle_console";
export const CIRCLE_CONSOLE_SOURCE_KIND = "circle_console_readback";
export const CIRCLE_CONSOLE_SUBSCRIPTION_ACTIVE = "active";

const RELEASE_COMMIT = /^[0-9a-f]{40}$/i;
const EVENT_TOPIC = /^0x[0-9a-f]{64}$/i;
const DEFAULT_CONSOLE_RECEIPT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CONSOLE_RECEIPT_FUTURE_SKEW_MS = 5 * 60 * 1000;

function normalizeReleaseCommit(value) {
  return String(value ?? "").toLowerCase();
}

export function buildCircleConsoleReceiptPolicy(options = {}) {
  return {
    chainId: Number(options.chainId ?? 5042002),
    contractAddress: normalizeAddress(options.contractAddress),
    eventSignature: options.eventSignature ?? "EvidenceAnchored(bytes32,bytes32,bytes32,bytes32,uint8)",
    eventTopic: String(options.eventTopic ?? "").toLowerCase(),
    subscriptionId: String(options.subscriptionId ?? ""),
    releaseCommit: normalizeReleaseCommit(options.releaseCommit),
    maxObservedAgeMs: Number(options.maxObservedAgeMs ?? DEFAULT_CONSOLE_RECEIPT_MAX_AGE_MS),
    futureSkewMs: Number(options.futureSkewMs ?? DEFAULT_CONSOLE_RECEIPT_FUTURE_SKEW_MS),
    now: typeof options.now === "function" ? options.now : () => Date.now()
  };
}

export function buildCircleConsoleReceiptReadiness(policy) {
  const blockers = [];
  if (Number(policy?.chainId) !== 5042002) blockers.push("chain_id_not_arc_testnet");
  if (!ADDRESS.test(policy?.contractAddress ?? "")) blockers.push("contract_address_invalid");
  if (!hasNonEmptyString(policy?.eventSignature)) blockers.push("event_signature_missing");
  if (!hasNonEmptyString(policy?.subscriptionId)) blockers.push("subscription_id_missing");
  if (!RELEASE_COMMIT.test(policy?.releaseCommit ?? "")) blockers.push("release_commit_missing_or_invalid");
  return {
    status: blockers.length ? "not_ready_fail_closed" : "ready_for_circle_console_receipt",
    blockers,
    policy,
    boundaries: {
      surface_evidence_only: true,
      webhook_subscription_created: false,
      wallet_or_chain_write: false,
      erp_write: false
    }
  };
}

function sourceDenialReason(source) {
  const status = Number(source?.http_status ?? source?.httpStatus ?? 0);
  if (status === 403) return "forbidden_source";
  if (status === 401) return "sign_in_required";
  const haystack = [source?.kind, source?.url, source?.object_id ?? source?.objectId, source?.error, source?.status]
    .filter((value) => value != null)
    .join(" ")
    .toLowerCase();
  if (/\b403\b|forbidden/.test(haystack)) return "forbidden_source";
  if (/sign-?in|login required|unauthenticated|authentication required/.test(haystack)) return "sign_in_required";
  return null;
}

function isLocalFixtureSource(source) {
  if (source?.fixture === true) return true;
  const url = String(source?.url ?? "");
  if (/^file:/i.test(url)) return true;
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    // Not a parseable URL; string-level checks below still apply.
  }
  if (["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"].includes(host)) return true;
  const text = [url, source?.object_id ?? source?.objectId].filter(Boolean).join(" ").toLowerCase();
  return /\bfixture\b|fixture-engine|mock data|local-stub/.test(text);
}

function isHistoricalReadback(input, source) {
  if (input?.historical === true) return true;
  const kind = String(source?.kind ?? "");
  if (kind === "historical_readback" || kind === "console_archive_readback") return true;
  const text = [source?.url, source?.object_id ?? source?.objectId].filter(Boolean).join(" ").toLowerCase();
  return /\bhistorical\b|\barchive\b/.test(text);
}

export function buildCircleConsoleReceipt(input, policy = buildCircleConsoleReceiptPolicy()) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { accepted: false, errors: ["missing_input"], receipt: null };
  }
  const errors = [];
  const source = input.source ?? {};
  const subscription = input.subscription ?? {};
  const address = normalizeAddress(input.contract_address);
  const observedAt = Date.parse(String(input.observed_at ?? ""));
  const now = policy.now();
  const sourceUrl = String(source.url ?? "").trim();
  const sourceObjectId = String(source.object_id ?? source.objectId ?? "").trim();

  if (Number(input.chain_id) !== policy.chainId) errors.push("unexpected_chain_id");
  if (!ADDRESS.test(address)) errors.push("invalid_contract_address");
  else if (address !== policy.contractAddress) errors.push("unexpected_contract_address");
  if (String(input.event_signature ?? "") !== policy.eventSignature) errors.push("unexpected_event_signature");
  if (hasNonEmptyString(policy.eventTopic)) {
    const topic = String(input.event_topic ?? "").toLowerCase();
    if (!EVENT_TOPIC.test(topic)) errors.push("invalid_event_topic");
    else if (topic !== policy.eventTopic) errors.push("unexpected_event_topic");
  }
  if (String(subscription.id ?? "") !== policy.subscriptionId) errors.push("unexpected_subscription_id");
  if (String(subscription.status ?? "").toLowerCase() !== CIRCLE_CONSOLE_SUBSCRIPTION_ACTIVE) errors.push("subscription_not_active");
  if (!Number.isFinite(observedAt)) errors.push("invalid_observed_at");
  else {
    if (observedAt > now + policy.futureSkewMs) errors.push("observed_at_in_future");
    if (now - observedAt > policy.maxObservedAgeMs) errors.push("stale_observation");
  }
  const releaseCommit = normalizeReleaseCommit(input.release_commit);
  if (!RELEASE_COMMIT.test(releaseCommit)) errors.push("invalid_release_commit");
  else if (releaseCommit !== policy.releaseCommit) errors.push("release_commit_mismatch");
  if (!sourceUrl && !sourceObjectId) errors.push("missing_source_reference");
  if (sourceUrl && !sourceUrl.startsWith("https://")) errors.push("source_url_not_https");
  if (String(source.kind ?? "") !== CIRCLE_CONSOLE_SOURCE_KIND) errors.push("unexpected_source_kind");
  if (source.authenticated !== true) errors.push("unauthenticated_source");
  const denial = sourceDenialReason(source);
  if (denial) errors.push(denial);
  if (isLocalFixtureSource(source)) errors.push("local_fixture_source");
  if (isHistoricalReadback(input, source)) errors.push("historical_source");

  const accepted = errors.length === 0;
  return {
    accepted,
    errors,
    receipt: accepted
      ? buildTypedCircleConsoleReceipt(input, policy, { address, observedAt, sourceUrl, sourceObjectId })
      : null
  };
}

function buildTypedCircleConsoleReceipt(input, policy, resolved) {
  const source = input.source;
  const topic = hasNonEmptyString(policy.eventTopic) ? String(input.event_topic).toLowerCase() : null;
  const fingerprint = createHash("sha256").update(JSON.stringify({
    schema: CIRCLE_CONSOLE_RECEIPT_SCHEMA,
    chain_id: Number(input.chain_id),
    contract_address: resolved.address,
    event_signature: input.event_signature,
    event_topic: topic,
    subscription_id: input.subscription.id,
    observed_at: input.observed_at,
    release_commit: normalizeReleaseCommit(input.release_commit)
  })).digest("hex");
  return {
    schema: CIRCLE_CONSOLE_RECEIPT_SCHEMA,
    surface: CIRCLE_CONSOLE_SURFACE,
    chain_id: Number(input.chain_id),
    contract_address: resolved.address,
    event_signature: input.event_signature,
    event_topic: topic,
    subscription: {
      id: input.subscription.id,
      status: input.subscription.status
    },
    observed_at: input.observed_at,
    observed_at_ms: resolved.observedAt,
    source: {
      kind: source.kind,
      authenticated: source.authenticated === true,
      http_status: Number(source.http_status ?? source.httpStatus ?? 200),
      url: resolved.sourceUrl || null,
      object_id: resolved.sourceObjectId || null
    },
    release_commit: normalizeReleaseCommit(input.release_commit),
    fingerprint_sha256: fingerprint,
    boundaries: {
      surface_evidence_only: true,
      console_readback_current_authenticated: true,
      webhook_subscription_created: false,
      wallet_or_chain_write: false,
      erp_write: false
    }
  };
}
