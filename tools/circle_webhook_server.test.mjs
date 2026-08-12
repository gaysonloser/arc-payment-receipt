import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";

import { createReceiptServer } from "./arc_payment_receipt_server.mjs";

const CONTRACT = "0xc7682649a1aa60d0f74825ad2b812ee062178047";
const EVENT = "PolicyCreated(bytes32,address,address,address,uint256,bytes32,bytes32,uint64,uint64)";
const TOPIC = "0x18a40807aa0569234a6f9202ddaab5639334547426c0cb66915bb5e5779b53ec";
const KEY_ID = "879dc113-5ca4-4ff7-a6b7-54652083fcf8";

function payload(data = "0".repeat(384)) {
  return {
    notificationId: "circle-server-001",
    notificationType: "contracts.eventLog",
    notification: {
      blockchain: "ARC-TESTNET",
      chainId: 5042002,
      contractAddress: CONTRACT,
      eventName: EVENT,
      txHash: `0x${"a".repeat(64)}`,
      blockHash: `0x${"b".repeat(64)}`,
      logIndex: 12,
      topics: [TOPIC, `0x${"1".repeat(64)}`, `0x${"0".repeat(24)}${"2".repeat(40)}`, `0x${"0".repeat(24)}${"3".repeat(40)}`],
      data: `0x${data}`
    }
  };
}

test("configured endpoint verifies raw body, persists claims, and recovers idempotency", async (t) => {
  const root = await mkdtemp(resolve("test/.circle-webhook-server-"));
  const storePath = join(root, "claims.jsonl");
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const environment = {
    CIRCLE_WEBHOOK_ENABLED: "true",
    CIRCLE_WEBHOOK_STORE_PATH: storePath,
    CIRCLE_WEBHOOK_PUBLIC_KEY_PEM: publicKey.export({ type: "spki", format: "pem" }),
    CIRCLE_WEBHOOK_PUBLIC_KEY_ID: KEY_ID,
    CIRCLE_WEBHOOK_RELEASE_ID: "verified-milestone-close-current-mvp-workbench-rc1",
    CIRCLE_WEBHOOK_RELEASE_COMMIT: "2524f0de459e49c993a9d6d426663af51fa605fa",
    CIRCLE_WEBHOOK_RENDER_DEPLOYMENT_ID: "dep-d9ucvtdbedkc73a0lgn0",
    CIRCLE_WEBHOOK_MANIFEST_SHA256: "4bff506ab9215af0242f8205e91b3d125539494263ff671bc41bdf05f21791f5"
  };
  const server = createReceiptServer({ environment });
  try {
    await new Promise((resolveReady, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolveReady);
    });
  } catch (error) {
    if (error?.code === "EPERM" || error?.code === "EACCES") { t.skip(`local loopback bind unavailable: ${error.code}`); return; }
    throw error;
  }
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const raw = Buffer.from(JSON.stringify(payload()));
    const signature = sign("sha256", raw, privateKey).toString("base64");
    const first = await fetch(`${origin}/api/v1/circle-webhook`, { method: "POST", headers: { "content-type": "application/json", "x-circle-signature": signature, "x-circle-key-id": KEY_ID }, body: raw });
    assert.equal(first.status, 202, await first.text());
    const second = await fetch(`${origin}/api/v1/circle-webhook`, { method: "POST", headers: { "content-type": "application/json", "x-circle-signature": signature, "x-circle-key-id": KEY_ID }, body: raw });
    assert.equal(second.status, 200);
    assert.equal((await second.json()).duplicate, true);

    const conflictPayload = { ...payload(), version: "2" };
    const conflictRaw = Buffer.from(JSON.stringify(conflictPayload));
    const conflictSignature = sign("sha256", conflictRaw, privateKey).toString("base64");
    const conflict = await fetch(`${origin}/api/v1/circle-webhook`, { method: "POST", headers: { "content-type": "application/json", "x-circle-signature": conflictSignature, "x-circle-key-id": KEY_ID }, body: conflictRaw });
    assert.equal(conflict.status, 422);
    assert.equal((await conflict.json()).error, "notification_id_conflict");

    const invalidSignature = await fetch(`${origin}/api/v1/circle-webhook`, { method: "POST", headers: { "content-type": "application/json", "x-circle-signature": "bad", "x-circle-key-id": KEY_ID }, body: raw });
    assert.equal(invalidSignature.status, 401);

    const readiness = await fetch(`${origin}/api/v1/circle-webhook-readiness`);
    assert.equal(readiness.status, 200);
    const readinessBody = await readiness.json();
    assert.equal(readinessBody.status, "ready_for_circle_console_subscription");
    assert.equal(readinessBody.guarantees.endpoint_accepts_webhooks, true);

    const stored = await readFile(storePath, "utf8");
    assert.equal(stored.split("\n").filter(Boolean).length, 1);
    assert.equal(stored.includes("PRIVATE KEY"), false);
    assert.equal(stored.includes("x-circle-signature"), false);
  } finally {
    server.closeAllConnections();
    await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
    await rm(root, { recursive: true, force: true });
  }
});

test("configured readiness remains fail-closed when the store path is absent", async (t) => {
  const { publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const server = createReceiptServer({ environment: {
    CIRCLE_WEBHOOK_ENABLED: "true",
    CIRCLE_WEBHOOK_PUBLIC_KEY_PEM: publicKey.export({ type: "spki", format: "pem" }),
    CIRCLE_WEBHOOK_PUBLIC_KEY_ID: KEY_ID
  } });
  try {
    await new Promise((resolveReady, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolveReady);
    });
  } catch (error) {
    if (error?.code === "EPERM" || error?.code === "EACCES") { t.skip(`local loopback bind unavailable: ${error.code}`); return; }
    throw error;
  }
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const readiness = await fetch(`${origin}/api/v1/circle-webhook-readiness`);
    const body = await readiness.json();
    assert.equal(body.status, "not_ready_fail_closed");
    assert.ok(body.blockers.includes("store_path_required"));
  } finally {
    server.closeAllConnections();
    await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  }
});
