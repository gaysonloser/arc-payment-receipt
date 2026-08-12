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
export const CIRCLE_CONSOLE_TRUSTED_READBACK_SCHEMA = "arc.circle-console-trusted-readback.v1";
export const CIRCLE_CONSOLE_SURFACE = "circle_console";
export const CIRCLE_CONSOLE_SOURCE_KIND = "circle_console_readback";
export const CIRCLE_CONSOLE_WEBHOOK_HISTORY_KIND = "circle_console_webhook_history";
export const CIRCLE_CONSOLE_EVENT_HISTORY_KIND = "circle_contract_event_history";
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
    eventSignature: options.eventSignature ?? "PolicyCreated(bytes32,address,address,address,uint256,bytes32,bytes32,uint64,uint64)",
    eventTopic: String(options.eventTopic ?? "").toLowerCase(),
    expectedEvent: {
      txHash: String(options.expectedEventTxHash ?? options.expectedEvent?.txHash ?? "").toLowerCase(),
      blockHash: String(options.expectedEventBlockHash ?? options.expectedEvent?.blockHash ?? "").toLowerCase(),
      blockHeight: Number(options.expectedEventBlockHeight ?? options.expectedEvent?.blockHeight ?? -1),
      logIndex: Number(options.expectedEventLogIndex ?? options.expectedEvent?.logIndex ?? -1)
    },
    subscriptionId: String(options.subscriptionId ?? ""),
    releaseCommit: normalizeReleaseCommit(options.releaseCommit),
    webhookHistoryUrl: String(options.webhookHistoryUrl ?? ""),
    eventHistoryUrl: String(options.eventHistoryUrl ?? ""),
    requireReadHistory: options.requireReadHistory === true,
    maxObservedAgeMs: Number(options.maxObservedAgeMs ?? DEFAULT_CONSOLE_RECEIPT_MAX_AGE_MS),
    futureSkewMs: Number(options.futureSkewMs ?? DEFAULT_CONSOLE_RECEIPT_FUTURE_SKEW_MS),
    now: typeof options.now === "function" ? options.now : () => Date.now()
  };
}

function safeHistoryUrl(value) {
  const text = String(value ?? "").trim();
  if (!text || !text.startsWith("https://")) return null;
  const credentialKey = /^(?:token|api[_-]?key|apikey|secret|authorization|bearer|credential|password|private[_-]?key|access[_-]?key)$/i;
  const credentialValue = /(?:token|api[_-]?key|apikey|secret|authorization|bearer|credential|password|private[_-]?key|access[_-]?key)/i;
  const decodeBounded = (input) => {
    let current = String(input ?? "");
    for (let round = 0; round < 4; round += 1) {
      let decoded;
      try { decoded = decodeURIComponent(current); } catch { return null; }
      if (decoded === current) return current;
      current = decoded;
    }
    return current;
  };
  const decodedText = decodeBounded(text);
  if (!decodedText) return null;
  try {
    const url = new URL(decodedText);
    if (url.username || url.password) return null;
    const inspectParts = [url.search.slice(1), url.hash.slice(1)].filter(Boolean);
    for (const part of inspectParts) {
      const decodedPart = decodeBounded(part);
      if (!decodedPart) return null;
      for (const pair of decodedPart.split(/[&;]/).filter(Boolean)) {
        const separator = pair.indexOf("=");
        const key = decodeBounded(separator >= 0 ? pair.slice(0, separator) : pair) ?? "";
        const rawValue = separator >= 0 ? pair.slice(separator + 1) : "";
        const parameterValue = decodeBounded(rawValue) ?? "";
        if (credentialKey.test(key) || credentialValue.test(parameterValue)) return null;
      }
      if (credentialValue.test(decodedPart) && !decodedPart.includes("=")) return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function historyBinding(policy, kind, url) {
  return {
    kind,
    url: safeHistoryUrl(url),
    http_status: 200,
    authenticated: true,
    entries_are_read_only: true
  };
}

export function buildCircleConsoleTrustedReadbackContract(options = {}) {
  const basePolicy = options.policy ?? buildCircleConsoleReceiptPolicy({
    ...options,
    requireReadHistory: options.requireReadHistory ?? true
  });
  const policy = {
    ...basePolicy,
    requireReadHistory: true,
    webhookHistoryUrl: String(options.webhookHistoryUrl ?? basePolicy.webhookHistoryUrl ?? ""),
    eventHistoryUrl: String(options.eventHistoryUrl ?? basePolicy.eventHistoryUrl ?? "")
  };
  const base = buildCircleConsoleReceiptReadiness(policy);
  const blockers = [...base.blockers];
  const webhookHistoryUrl = safeHistoryUrl(options.webhookHistoryUrl ?? policy.webhookHistoryUrl);
  const eventHistoryUrl = safeHistoryUrl(options.eventHistoryUrl ?? policy.eventHistoryUrl);
  const loaderConfigured = options.loaderConfigured === true || typeof options.loadReadback === "function";
  if (policy.requireReadHistory === true && !webhookHistoryUrl) blockers.push("webhook_history_source_missing");
  if (policy.requireReadHistory === true && !eventHistoryUrl) blockers.push("event_history_source_missing");
  if (!loaderConfigured) blockers.push("trusted_readback_loader_not_configured");
  const contract = {
    schema: CIRCLE_CONSOLE_TRUSTED_READBACK_SCHEMA,
    status: blockers.length === 0 ? "ready_for_trusted_circle_console_readback" : "not_ready_fail_closed",
    blockers,
    policy_binding: {
      network: "ARC-TESTNET",
      chain_id: Number(policy.chainId),
      contract_address: policy.contractAddress || null,
      event_signature: policy.eventSignature || null,
      event_topic: policy.eventTopic || null,
      subscription_id: policy.subscriptionId || null,
      release_commit: policy.releaseCommit || null
    },
    read_history: {
      webhook: historyBinding(policy, CIRCLE_CONSOLE_WEBHOOK_HISTORY_KIND, webhookHistoryUrl),
      event: historyBinding(policy, CIRCLE_CONSOLE_EVENT_HISTORY_KIND, eventHistoryUrl)
    },
    loader: { configured: loaderConfigured, injected_only: true, calls_external_api: false },
    boundaries: {
      read_only: true,
      accepts_caller_supplied_receipt: false,
      creates_circle_subscription: false,
      wallet_or_chain_write: false,
      erp_write: false,
      external_actions: 0,
      local_fixture_satisfies_gate: false,
      historical_readback_satisfies_gate: false
    }
  };
  return { ...contract, policy };
}

function validateHistorySource(value, expectedKind, expectedUrl, prefix) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return [`${prefix}_missing`];
  if (String(value.kind ?? "") !== expectedKind) errors.push(`${prefix}_kind_mismatch`);
  if (value.authenticated !== true) errors.push(`${prefix}_authentication_required`);
  if (Number(value.http_status ?? value.httpStatus ?? 0) !== 200) errors.push(`${prefix}_http_status_invalid`);
  if (String(value.url ?? "") !== expectedUrl) errors.push(`${prefix}_url_mismatch`);
  if (!Array.isArray(value.entries)) errors.push(`${prefix}_entries_invalid`);
  else if (value.entries.length === 0) errors.push(`${prefix}_entries_required`);
  if (value.fixture === true || value.historical === true || /fixture|historical|archive/i.test(String(value.kind ?? ""))) {
    errors.push(`${prefix}_historical_or_fixture`);
  }
  return errors;
}

function historyEntryValue(entry, ...keys) {
  for (const key of keys) {
    if (entry?.[key] != null) return entry[key];
  }
  return null;
}

function validateEventHistoryPayload(entry, label, policy) {
  const errors = [];
  const blockHash = historyEntryValue(entry, "block_hash", "blockHash");
  if (!HASH.test(String(blockHash ?? ""))) errors.push(`${label}_block_hash_required`);
  const blockHeight = Number(historyEntryValue(entry, "block_height", "blockHeight"));
  if (!Number.isSafeInteger(blockHeight) || blockHeight < 0) errors.push(`${label}_block_height_required`);
  const txHash = historyEntryValue(entry, "tx_hash", "txHash");
  if (!HASH.test(String(txHash ?? ""))) errors.push(`${label}_tx_hash_required`);
  const logIndex = Number(historyEntryValue(entry, "log_index", "logIndex"));
  if (!Number.isSafeInteger(logIndex) || logIndex < 0) errors.push(`${label}_log_index_required`);
  const topics = historyEntryValue(entry, "topics");
  if (!Array.isArray(topics) || topics.length === 0 || topics.some((topic) => !EVENT_TOPIC.test(String(topic ?? "")))) {
    errors.push(`${label}_topics_required`);
  }
  const data = String(historyEntryValue(entry, "data") ?? "");
  if (!/^0x(?:[0-9a-f]{2})*$/i.test(data)) errors.push(`${label}_data_required`);
  const eventSignatureHash = historyEntryValue(entry, "event_signature_hash", "eventSignatureHash");
  if (!HASH.test(String(eventSignatureHash ?? ""))) errors.push(`${label}_event_signature_hash_required`);
  const topic0 = Array.isArray(topics) ? String(topics[0] ?? "").toLowerCase() : "";
  const signatureHash = String(eventSignatureHash ?? "").toLowerCase();
  if (topic0 && topic0 !== policy.eventTopic) errors.push(`${label}_topic0_mismatch`);
  if (signatureHash && signatureHash !== policy.eventTopic) errors.push(`${label}_event_signature_hash_mismatch`);
  const expected = policy.expectedEvent ?? {};
  if (expected.txHash && String(txHash ?? "").toLowerCase() !== expected.txHash) errors.push(`${label}_tx_hash_mismatch`);
  if (expected.blockHash && String(blockHash ?? "").toLowerCase() !== expected.blockHash) errors.push(`${label}_block_hash_mismatch`);
  if (Number.isSafeInteger(expected.blockHeight) && expected.blockHeight >= 0 && blockHeight !== expected.blockHeight) errors.push(`${label}_block_height_mismatch`);
  if (Number.isSafeInteger(expected.logIndex) && expected.logIndex >= 0 && logIndex !== expected.logIndex) errors.push(`${label}_log_index_mismatch`);
  return errors;
}

function validateHistoryEntries(value, policy, prefix) {
  if (!Array.isArray(value?.entries) || value.entries.length === 0) return [];
  const errors = [];
  const now = policy.now();
  value.entries.forEach((entry, index) => {
    const label = `${prefix}_entry_${index}`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      errors.push(`${label}_invalid`);
      return;
    }
    const timestamp = historyEntryValue(entry, "observed_at", "observedAt", "received_at", "receivedAt", "firstConfirmDate", "timestamp");
    const observedAt = Date.parse(String(timestamp ?? ""));
    if (!Number.isFinite(observedAt)) errors.push(`${label}_timestamp_invalid`);
    else {
      if (observedAt > now + policy.futureSkewMs) errors.push(`${label}_in_future`);
      if (now - observedAt > policy.maxObservedAgeMs) errors.push(`${label}_stale`);
    }
    const id = historyEntryValue(entry, "id", "entry_id", "entryId", "event_id", "eventId");
    if (!hasNonEmptyString(String(id ?? ""))) errors.push(`${label}_id_required`);
    if (entry.authenticated !== true) errors.push(`${label}_authentication_required`);
    const contractAddress = normalizeAddress(historyEntryValue(entry, "contract_address", "contractAddress"));
    if (contractAddress !== policy.contractAddress) errors.push(`${label}_contract_mismatch`);
    const chainId = Number(historyEntryValue(entry, "chain_id", "chainId"));
    if (chainId !== policy.chainId) errors.push(`${label}_chain_id_mismatch`);
    const blockchain = String(historyEntryValue(entry, "blockchain", "network") ?? "");
    if (blockchain !== "ARC-TESTNET") errors.push(`${label}_blockchain_mismatch`);
    const eventSignature = String(historyEntryValue(entry, "event_signature", "eventSignature") ?? "");
    if (eventSignature !== policy.eventSignature) errors.push(`${label}_event_signature_mismatch`);
    const subscriptionId = String(historyEntryValue(entry, "subscription_id", "subscriptionId") ?? entry.subscription?.id ?? "");
    if (subscriptionId !== policy.subscriptionId) errors.push(`${label}_subscription_mismatch`);
    const releaseCommit = normalizeReleaseCommit(historyEntryValue(entry, "release_commit", "releaseCommit"));
    if (releaseCommit !== policy.releaseCommit) errors.push(`${label}_release_commit_mismatch`);
    if (prefix === "event_history") errors.push(...validateEventHistoryPayload(entry, label, policy));
    if (entry.fixture === true || entry.historical === true || entry.archive === true || /fixture|historical|archive/i.test(JSON.stringify(entry))) {
      errors.push(`${label}_historical_or_fixture`);
    }
  });
  return errors;
}

export function validateCircleConsoleReadHistory(input, policy) {
  if (policy?.requireReadHistory !== true) return [];
  const webhookUrl = safeHistoryUrl(policy.webhookHistoryUrl);
  const eventUrl = safeHistoryUrl(policy.eventHistoryUrl);
  const errors = [];
  errors.push(...validateHistorySource(input?.webhook_history, CIRCLE_CONSOLE_WEBHOOK_HISTORY_KIND, webhookUrl, "webhook_history"));
  errors.push(...validateHistorySource(input?.event_history, CIRCLE_CONSOLE_EVENT_HISTORY_KIND, eventUrl, "event_history"));
  errors.push(...validateHistoryEntries(input?.webhook_history, policy, "webhook_history"));
  errors.push(...validateHistoryEntries(input?.event_history, policy, "event_history"));
  return errors;
}

export function createCircleConsoleTrustedReadbackLoader({ contract, loadReadback } = {}) {
  if (!contract || contract.status !== "ready_for_trusted_circle_console_readback" || typeof loadReadback !== "function") return null;
  return async () => {
    const readback = await loadReadback();
    const errors = validateCircleConsoleReadHistory(readback, contract.policy);
    if (errors.length) {
      const error = new Error("trusted_readback_contract_invalid");
      error.code = "trusted_readback_contract_invalid";
      error.errors = errors;
      throw error;
    }
    return readback;
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
  if (sourceUrl && !safeHistoryUrl(sourceUrl)) errors.push("source_url_credentials_forbidden");
  if (Number(source.http_status ?? source.httpStatus ?? 0) !== 200) errors.push("source_http_status_invalid");
  if (String(source.kind ?? "") !== CIRCLE_CONSOLE_SOURCE_KIND) errors.push("unexpected_source_kind");
  if (source.authenticated !== true) errors.push("unauthenticated_source");
  const denial = sourceDenialReason(source);
  if (denial) errors.push(denial);
  if (isLocalFixtureSource(source)) errors.push("local_fixture_source");
  if (isHistoricalReadback(input, source)) errors.push("historical_source");
  errors.push(...validateCircleConsoleReadHistory(input, policy));

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
    read_history: policy.requireReadHistory === true ? {
      webhook: {
        kind: CIRCLE_CONSOLE_WEBHOOK_HISTORY_KIND,
        url: input.webhook_history.url,
        http_status: 200,
        authenticated: true,
        entry_count: input.webhook_history.entries.length
      },
      event: {
        kind: CIRCLE_CONSOLE_EVENT_HISTORY_KIND,
        url: input.event_history.url,
        http_status: 200,
        authenticated: true,
        entry_count: input.event_history.entries.length
      }
    } : null,
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
