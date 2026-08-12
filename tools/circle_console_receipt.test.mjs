import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import test from "node:test";

import {
  buildCircleConsoleReceipt,
  buildCircleConsoleReceiptPolicy,
  buildCircleConsoleReceiptReadiness,
  buildCircleConsoleTrustedReadbackContract,
  CIRCLE_CONSOLE_RECEIPT_SCHEMA,
  CIRCLE_CONSOLE_SURFACE,
  CIRCLE_CONSOLE_WEBHOOK_HISTORY_KIND,
  CIRCLE_CONSOLE_EVENT_HISTORY_KIND,
  createCircleConsoleTrustedReadbackLoader,
  validateCircleConsoleReadHistory
} from "./circle_contract_webhook_gate.mjs";

const CURRENT_RELEASE_COMMIT = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
const NOW_MS = Date.parse("2026-08-10T12:00:00.000Z");

const contractAddress = "0x094f69e6b760c48b6cf23f9af156c4511e8fa1e7";
const eventSignature = "EvidenceAnchored(bytes32,bytes32,bytes32,bytes32,uint8)";
const eventTopic = `0x${"cd".repeat(32)}`;
const expectedTxHash = `0x${"22".repeat(32)}`;
const expectedBlockHash = `0x${"11".repeat(32)}`;
const expectedBlockHeight = 56111686;
const expectedLogIndex = 0;
const subscriptionId = "Subscription_evt_0xab12cd34";
const webhookHistoryUrl = "https://console.circle.com/contracts/current/subscriptions/current/events";
const eventHistoryUrl = "https://console.circle.com/contracts/current/event-history";

function buildPolicy() {
  return buildCircleConsoleReceiptPolicy({
    contractAddress,
    eventSignature,
    eventTopic,
    expectedEventTxHash: expectedTxHash,
    expectedEventBlockHash: expectedBlockHash,
    expectedEventBlockHeight: expectedBlockHeight,
    expectedEventLogIndex: expectedLogIndex,
    subscriptionId,
    releaseCommit: CURRENT_RELEASE_COMMIT,
    now: () => NOW_MS
  });
}

function validInput() {
  return {
    chain_id: 5042002,
    contract_address: contractAddress,
    event_signature: eventSignature,
    event_topic: eventTopic,
    subscription: { id: subscriptionId, status: "active" },
    observed_at: new Date(NOW_MS - 60_000).toISOString(),
    source: {
      kind: "circle_console_readback",
      authenticated: true,
      http_status: 200,
      url: `https://console.circle.com/contracts/${contractAddress}/subscriptions/${subscriptionId}`,
      object_id: `console:contract:${contractAddress}:subscription:${subscriptionId}`
    },
    release_commit: CURRENT_RELEASE_COMMIT
  };
}

function trustedPolicy() {
  return buildCircleConsoleReceiptPolicy({
    ...buildPolicy(),
    webhookHistoryUrl,
    eventHistoryUrl,
    requireReadHistory: true
  });
}

function trustedInput() {
  const currentHistoryBinding = {
    contract_address: contractAddress,
    chain_id: 5042002,
    blockchain: "ARC-TESTNET",
    event_signature: eventSignature,
    subscription_id: subscriptionId,
    release_commit: CURRENT_RELEASE_COMMIT
  };
  return {
    ...validInput(),
    webhook_history: {
      kind: CIRCLE_CONSOLE_WEBHOOK_HISTORY_KIND,
      authenticated: true,
      http_status: 200,
      url: webhookHistoryUrl,
      entries: [{
        id: "delivery-1",
        authenticated: true,
        received_at: new Date(NOW_MS - 30_000).toISOString(),
        ...currentHistoryBinding
      }]
    },
    event_history: {
      kind: CIRCLE_CONSOLE_EVENT_HISTORY_KIND,
      authenticated: true,
      http_status: 200,
      url: eventHistoryUrl,
      entries: [{
        id: "event-1",
        authenticated: true,
        firstConfirmDate: new Date(NOW_MS - 45_000).toISOString(),
        blockHash: expectedBlockHash,
        blockHeight: expectedBlockHeight,
        txHash: expectedTxHash,
        logIndex: String(expectedLogIndex),
        topics: [eventTopic],
        data: "0x",
        eventSignatureHash: eventTopic,
        ...currentHistoryBinding
      }]
    }
  };
}

test("produces a typed fail-closed receipt for a current authenticated Circle Console readback", () => {
  const result = buildCircleConsoleReceipt(validInput(), buildPolicy());
  assert.equal(result.accepted, true);
  assert.deepEqual(result.errors, []);
  const receipt = result.receipt;
  assert.equal(receipt.schema, CIRCLE_CONSOLE_RECEIPT_SCHEMA);
  assert.equal(receipt.surface, CIRCLE_CONSOLE_SURFACE);
  assert.equal(receipt.chain_id, 5042002);
  assert.equal(receipt.contract_address, contractAddress);
  assert.equal(receipt.event_signature, eventSignature);
  assert.equal(receipt.event_topic, eventTopic);
  assert.deepEqual(receipt.subscription, { id: subscriptionId, status: "active" });
  assert.equal(receipt.observed_at, new Date(NOW_MS - 60_000).toISOString());
  assert.equal(receipt.source.kind, "circle_console_readback");
  assert.equal(receipt.source.authenticated, true);
  assert.equal(receipt.source.http_status, 200);
  assert.equal(receipt.source.url, `https://console.circle.com/contracts/${contractAddress}/subscriptions/${subscriptionId}`);
  assert.equal(receipt.source.object_id, `console:contract:${contractAddress}:subscription:${subscriptionId}`);
  assert.equal(receipt.release_commit, CURRENT_RELEASE_COMMIT);
  assert.match(receipt.fingerprint_sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(receipt.boundaries, {
    surface_evidence_only: true,
    console_readback_current_authenticated: true,
    webhook_subscription_created: false,
    wallet_or_chain_write: false,
    erp_write: false
  });
});

test("is bound to the actual current release commit and rejects every other commit", () => {
  const bound = buildCircleConsoleReceipt(validInput(), buildPolicy());
  assert.equal(bound.receipt.release_commit, CURRENT_RELEASE_COMMIT);

  const staleRelease = validInput();
  staleRelease.release_commit = `1${"0".repeat(39)}`;
  const result = buildCircleConsoleReceipt(staleRelease, buildPolicy());
  assert.equal(result.accepted, false);
  assert.ok(result.errors.includes("release_commit_mismatch"));
  assert.equal(result.receipt, null);
});

test("fails closed before any policy is complete", () => {
  const readiness = buildCircleConsoleReceiptReadiness(buildCircleConsoleReceiptPolicy());
  assert.equal(readiness.status, "not_ready_fail_closed");
  assert.deepEqual(readiness.blockers, ["contract_address_invalid", "subscription_id_missing", "release_commit_missing_or_invalid"]);
  assert.equal(readiness.boundaries.surface_evidence_only, true);

  const ready = buildCircleConsoleReceiptReadiness(buildPolicy());
  assert.equal(ready.status, "ready_for_circle_console_receipt");
  assert.deepEqual(ready.blockers, []);
});

test("rejects a missing or empty readback", () => {
  const result = buildCircleConsoleReceipt({}, buildPolicy());
  assert.equal(result.accepted, false);
  assert.equal(result.receipt, null);
  for (const error of [
    "unexpected_chain_id",
    "invalid_contract_address",
    "unexpected_event_signature",
    "invalid_event_topic",
    "unexpected_subscription_id",
    "subscription_not_active",
    "invalid_observed_at",
    "invalid_release_commit",
    "missing_source_reference",
    "unexpected_source_kind",
    "unauthenticated_source"
  ]) {
    assert.ok(result.errors.includes(error), `expected ${error} in ${JSON.stringify(result.errors)}`);
  }
});

test("rejects mismatched chain, contract, event, subscription and release binding", () => {
  const mismatched = validInput();
  mismatched.chain_id = 8453;
  mismatched.contract_address = "0x1111111111111111111111111111111111111111";
  mismatched.event_signature = "PaymentReceived(bytes32,address,address,uint256,bytes32)";
  mismatched.event_topic = `0x${"12".repeat(32)}`;
  mismatched.subscription.id = "Subscription_other";
  mismatched.release_commit = `2${"0".repeat(39)}`;
  const result = buildCircleConsoleReceipt(mismatched, buildPolicy());
  assert.equal(result.accepted, false);
  assert.equal(result.receipt, null);
  assert.deepEqual(result.errors, [
    "unexpected_chain_id",
    "unexpected_contract_address",
    "unexpected_event_signature",
    "unexpected_event_topic",
    "unexpected_subscription_id",
    "release_commit_mismatch"
  ]);
});

test("rejects stale and future observation timestamps", () => {
  const stale = validInput();
  stale.observed_at = new Date(NOW_MS - 25 * 60 * 60 * 1000).toISOString();
  const staleResult = buildCircleConsoleReceipt(stale, buildPolicy());
  assert.equal(staleResult.accepted, false);
  assert.ok(staleResult.errors.includes("stale_observation"));

  const future = validInput();
  future.observed_at = new Date(NOW_MS + 10 * 60 * 1000).toISOString();
  const futureResult = buildCircleConsoleReceipt(future, buildPolicy());
  assert.equal(futureResult.accepted, false);
  assert.ok(futureResult.errors.includes("observed_at_in_future"));
});

test("never accepts historical or archived readbacks", () => {
  const flagged = validInput();
  flagged.historical = true;
  const flaggedResult = buildCircleConsoleReceipt(flagged, buildPolicy());
  assert.equal(flaggedResult.accepted, false);
  assert.ok(flaggedResult.errors.includes("historical_source"));

  const archivedSource = validInput();
  archivedSource.source.kind = "historical_readback";
  const archivedResult = buildCircleConsoleReceipt(archivedSource, buildPolicy());
  assert.equal(archivedResult.accepted, false);
  assert.ok(archivedResult.errors.includes("historical_source"));

  const archivedObject = validInput();
  archivedObject.source.object_id = "console:archive:2026-07-25:subscription:old";
  const archivedObjectResult = buildCircleConsoleReceipt(archivedObject, buildPolicy());
  assert.equal(archivedObjectResult.accepted, false);
  assert.ok(archivedObjectResult.errors.includes("historical_source"));
});

test("never accepts forbidden, sign-in-gated or unauthenticated sources", () => {
  const forbidden = validInput();
  forbidden.source.http_status = 403;
  const forbiddenResult = buildCircleConsoleReceipt(forbidden, buildPolicy());
  assert.equal(forbiddenResult.accepted, false);
  assert.ok(forbiddenResult.errors.includes("forbidden_source"));

  const signInRequired = validInput();
  signInRequired.source.http_status = 401;
  const signInResult = buildCircleConsoleReceipt(signInRequired, buildPolicy());
  assert.equal(signInResult.accepted, false);
  assert.ok(signInResult.errors.includes("sign_in_required"));

  const signInText = validInput();
  signInText.source.error = "sign-in required to view this subscription";
  const signInTextResult = buildCircleConsoleReceipt(signInText, buildPolicy());
  assert.equal(signInTextResult.accepted, false);
  assert.ok(signInTextResult.errors.includes("sign_in_required"));

  const unauthenticated = validInput();
  unauthenticated.source.authenticated = false;
  const unauthenticatedResult = buildCircleConsoleReceipt(unauthenticated, buildPolicy());
  assert.equal(unauthenticatedResult.accepted, false);
  assert.ok(unauthenticatedResult.errors.includes("unauthenticated_source"));
});

test("never accepts local fixtures or non-HTTPS sources", () => {
  const localhost = validInput();
  localhost.source.url = "http://localhost:3000/fixture-engine.mjs";
  const localhostResult = buildCircleConsoleReceipt(localhost, buildPolicy());
  assert.equal(localhostResult.accepted, false);
  assert.ok(localhostResult.errors.includes("local_fixture_source"));
  assert.ok(localhostResult.errors.includes("source_url_not_https"));

  const fileFixture = validInput();
  fileFixture.source.url = "file:///tmp/circle_console_fixture.json";
  const fileResult = buildCircleConsoleReceipt(fileFixture, buildPolicy());
  assert.equal(fileResult.accepted, false);
  assert.ok(fileResult.errors.includes("local_fixture_source"));

  const flaggedFixture = validInput();
  flaggedFixture.source.fixture = true;
  const flaggedResult = buildCircleConsoleReceipt(flaggedFixture, buildPolicy());
  assert.equal(flaggedResult.accepted, false);
  assert.ok(flaggedResult.errors.includes("local_fixture_source"));
});

test("rejects malformed or mismatched event topics", () => {
  const malformed = validInput();
  malformed.event_topic = "0x123";
  const malformedResult = buildCircleConsoleReceipt(malformed, buildPolicy());
  assert.equal(malformedResult.accepted, false);
  assert.ok(malformedResult.errors.includes("invalid_event_topic"));

  const mismatched = validInput();
  mismatched.event_topic = `0x${"ab".repeat(32)}`;
  const mismatchedResult = buildCircleConsoleReceipt(mismatched, buildPolicy());
  assert.equal(mismatchedResult.accepted, false);
  assert.ok(mismatchedResult.errors.includes("unexpected_event_topic"));
});

test("requires a subscription that is active and exactly the policy subscription", () => {
  const inactive = validInput();
  inactive.subscription.status = "paused";
  const inactiveResult = buildCircleConsoleReceipt(inactive, buildPolicy());
  assert.equal(inactiveResult.accepted, false);
  assert.ok(inactiveResult.errors.includes("subscription_not_active"));

  const unbound = validInput();
  unbound.subscription.id = "Subscription_unbound";
  const unboundResult = buildCircleConsoleReceipt(unbound, buildPolicy());
  assert.equal(unboundResult.accepted, false);
  assert.ok(unboundResult.errors.includes("unexpected_subscription_id"));
});

test("trusted readback contract binds Arc Testnet, subscription, release, and both read histories", async () => {
  const blocked = buildCircleConsoleTrustedReadbackContract({
    policy: buildCircleConsoleReceiptPolicy({ ...buildPolicy(), requireReadHistory: true })
  });
  assert.equal(blocked.status, "not_ready_fail_closed");
  assert.ok(blocked.blockers.includes("trusted_readback_loader_not_configured"));
  assert.ok(blocked.blockers.includes("webhook_history_source_missing"));
  assert.ok(blocked.blockers.includes("event_history_source_missing"));

  const policy = trustedPolicy();
  const contract = buildCircleConsoleTrustedReadbackContract({
    policy,
    webhookHistoryUrl,
    eventHistoryUrl,
    loadReadback: async () => trustedInput()
  });
  assert.equal(contract.status, "ready_for_trusted_circle_console_readback");
  assert.equal(contract.policy_binding.network, "ARC-TESTNET");
  assert.equal(contract.policy_binding.chain_id, 5042002);
  assert.equal(contract.policy_binding.contract_address, contractAddress);
  assert.equal(contract.policy_binding.subscription_id, subscriptionId);
  assert.equal(contract.read_history.webhook.kind, CIRCLE_CONSOLE_WEBHOOK_HISTORY_KIND);
  assert.equal(contract.read_history.event.kind, CIRCLE_CONSOLE_EVENT_HISTORY_KIND);
  assert.equal(contract.boundaries.external_actions, 0);

  const readback = trustedInput();
  assert.deepEqual(validateCircleConsoleReadHistory(readback, contract.policy), []);
  const loader = createCircleConsoleTrustedReadbackLoader({ contract, loadReadback: async () => structuredClone(readback) });
  assert.equal(typeof loader, "function");
  const loaded = await loader();
  const receipt = buildCircleConsoleReceipt(loaded, contract.policy);
  assert.equal(receipt.accepted, true);
  assert.equal(receipt.receipt.read_history.webhook.entry_count, 1);
  assert.equal(receipt.receipt.read_history.event.entry_count, 1);
});

test("trusted readback mutations fail closed at the loader boundary", async () => {
  const policy = trustedPolicy();
  const contract = buildCircleConsoleTrustedReadbackContract({
    policy,
    webhookHistoryUrl,
    eventHistoryUrl,
    loadReadback: async () => trustedInput()
  });
  const mutations = [
    ["webhook_history_kind", (value) => { value.webhook_history.kind = "circle_console_readback"; }],
    ["webhook_history_url", (value) => { value.webhook_history.url = "https://console.circle.com/other"; }],
    ["webhook_history_auth", (value) => { value.webhook_history.authenticated = false; }],
    ["event_history_status", (value) => { value.event_history.http_status = 403; }],
    ["event_history_entries", (value) => { value.event_history.entries = "not-an-array"; }],
    ["fixture_history", (value) => { value.event_history.fixture = true; }]
  ];
  for (const [id, mutate] of mutations) {
    const input = trustedInput();
    mutate(input);
    const errors = validateCircleConsoleReadHistory(input, policy);
    assert.ok(errors.length > 0, `${id} should fail closed`);
    assert.equal(buildCircleConsoleReceipt(input, policy).accepted, false, `${id} receipt must remain rejected`);
    const loader = createCircleConsoleTrustedReadbackLoader({ contract, loadReadback: async () => input });
    await assert.rejects(loader(), (error) => error.code === "trusted_readback_contract_invalid");
  }
});

test("trusted histories require current non-empty authenticated entries", () => {
  const policy = trustedPolicy();
  const empty = trustedInput();
  empty.webhook_history.entries = [];
  empty.event_history.entries = [];
  const emptyResult = buildCircleConsoleReceipt(empty, policy);
  assert.equal(emptyResult.accepted, false);
  assert.ok(emptyResult.errors.includes("webhook_history_entries_required"));
  assert.ok(emptyResult.errors.includes("event_history_entries_required"));

  const stale = trustedInput();
  stale.webhook_history.entries[0].received_at = new Date(NOW_MS - 25 * 60 * 60 * 1000).toISOString();
  stale.webhook_history.entries[0].release_commit = "1".repeat(40);
  const staleResult = buildCircleConsoleReceipt(stale, policy);
  assert.equal(staleResult.accepted, false);
  assert.ok(staleResult.errors.includes("webhook_history_entry_0_stale"));
  assert.ok(staleResult.errors.includes("webhook_history_entry_0_release_commit_mismatch"));

  const mismatch = trustedInput();
  mismatch.event_history.entries[0].contract_address = "0x1111111111111111111111111111111111111111";
  mismatch.event_history.entries[0].event_signature = "Other(bytes32)";
  mismatch.event_history.entries[0].subscription_id = "Subscription_old";
  const mismatchResult = buildCircleConsoleReceipt(mismatch, policy);
  assert.equal(mismatchResult.accepted, false);
  assert.ok(mismatchResult.errors.includes("event_history_entry_0_contract_mismatch"));
  assert.ok(mismatchResult.errors.includes("event_history_entry_0_event_signature_mismatch"));
  assert.ok(mismatchResult.errors.includes("event_history_entry_0_subscription_mismatch"));

  const unauthenticated = trustedInput();
  unauthenticated.webhook_history.entries[0].authenticated = false;
  const unauthenticatedResult = buildCircleConsoleReceipt(unauthenticated, policy);
  assert.equal(unauthenticatedResult.accepted, false);
  assert.ok(unauthenticatedResult.errors.includes("webhook_history_entry_0_authentication_required"));

  const base = trustedInput();
  base.webhook_history.entries[0].chain_id = 8453;
  base.webhook_history.entries[0].blockchain = "BASE";
  const baseResult = buildCircleConsoleReceipt(base, policy);
  assert.equal(baseResult.accepted, false);
  assert.ok(baseResult.errors.includes("webhook_history_entry_0_chain_id_mismatch"));
  assert.ok(baseResult.errors.includes("webhook_history_entry_0_blockchain_mismatch"));

  const wrongChain = trustedInput();
  wrongChain.event_history.entries[0].chain_id = 1;
  const wrongChainResult = buildCircleConsoleReceipt(wrongChain, policy);
  assert.equal(wrongChainResult.accepted, false);
  assert.ok(wrongChainResult.errors.includes("event_history_entry_0_chain_id_mismatch"));
});

test("event history requires the official event-log payload before accepting a readback", () => {
  const policy = trustedPolicy();
  const incomplete = trustedInput();
  delete incomplete.event_history.entries[0].txHash;
  incomplete.event_history.entries[0].topics = [];
  const result = buildCircleConsoleReceipt(incomplete, policy);
  assert.equal(result.accepted, false);
  assert.ok(result.errors.includes("event_history_entry_0_tx_hash_required"));
  assert.ok(result.errors.includes("event_history_entry_0_topics_required"));
  assert.equal(result.receipt, null);
});

test("event history must bind the exact policy topic and current Arc receipt identity", () => {
  for (const mutate of [
    (entry) => { entry.txHash = `0x${"aa".repeat(32)}`; },
    (entry) => { entry.blockHash = `0x${"bb".repeat(32)}`; },
    (entry) => { entry.blockHeight += 1; },
    (entry) => { entry.logIndex = "13"; },
    (entry) => { entry.topics[0] = `0x${"cc".repeat(32)}`; },
    (entry) => { entry.eventSignatureHash = `0x${"dd".repeat(32)}`; },
    (entry) => { entry.data = "0x1"; }
  ]) {
    const input = trustedInput();
    mutate(input.event_history.entries[0]);
    const result = buildCircleConsoleReceipt(input, trustedPolicy());
    assert.equal(result.accepted, false);
    assert.equal(result.receipt, null);
  }
});

test("primary Console sources require HTTPS 200 and never echo credentials", () => {
  for (const [label, sourceUrl] of [
    ["userinfo", `https://user:pass@console.circle.com/contracts/${contractAddress}/subscriptions/${subscriptionId}`],
    ["api_key", `https://console.circle.com/contracts/${contractAddress}/subscriptions/${subscriptionId}?api_key=secret-value`],
    ["fragment_api_key", `https://console.circle.com/contracts/${contractAddress}/subscriptions/${subscriptionId}#api_key=secret-value`],
    ["double_encoded_query_api_key", `https://console.circle.com/contracts/${contractAddress}/subscriptions/${subscriptionId}?%2561pi%255Fkey=secret-value`],
    ["double_encoded_fragment_token", `https://console.circle.com/contracts/${contractAddress}/subscriptions/${subscriptionId}#%2574oken=secret-value`]
  ]) {
    const input = validInput();
    input.source.url = sourceUrl;
    const result = buildCircleConsoleReceipt(input, buildPolicy());
    assert.equal(result.accepted, false, `${label} source must fail closed`);
    assert.ok(result.errors.includes("source_url_credentials_forbidden"));
    assert.equal(JSON.stringify(result).includes("secret-value"), false);
  }
  const unavailable = validInput();
  unavailable.source.http_status = 500;
  const unavailableResult = buildCircleConsoleReceipt(unavailable, buildPolicy());
  assert.equal(unavailableResult.accepted, false);
  assert.ok(unavailableResult.errors.includes("source_http_status_invalid"));
});
