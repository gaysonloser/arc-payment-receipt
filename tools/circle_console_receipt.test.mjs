import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import test from "node:test";

import {
  buildCircleConsoleReceipt,
  buildCircleConsoleReceiptPolicy,
  buildCircleConsoleReceiptReadiness,
  CIRCLE_CONSOLE_RECEIPT_SCHEMA,
  CIRCLE_CONSOLE_SURFACE
} from "./circle_contract_webhook_gate.mjs";

const CURRENT_RELEASE_COMMIT = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
const NOW_MS = Date.parse("2026-08-10T12:00:00.000Z");

const contractAddress = "0x094f69e6b760c48b6cf23f9af156c4511e8fa1e7";
const eventSignature = "EvidenceAnchored(bytes32,bytes32,bytes32,bytes32,uint8)";
const eventTopic = `0x${"cd".repeat(32)}`;
const subscriptionId = "Subscription_evt_0xab12cd34";

function buildPolicy() {
  return buildCircleConsoleReceiptPolicy({
    contractAddress,
    eventSignature,
    eventTopic,
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
