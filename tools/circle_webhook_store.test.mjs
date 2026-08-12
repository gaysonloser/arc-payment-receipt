import assert from "node:assert/strict";
import { appendFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { CircleWebhookJsonlStore, CIRCLE_WEBHOOK_STORE_SCHEMA } from "./circle_webhook_store.mjs";

async function makeStore() {
  const dir = await mkdtemp(join(tmpdir(), "circle-webhook-store-"));
  const path = join(dir, "claims.jsonl");
  const open = () => new CircleWebhookJsonlStore({
    path,
    allowEphemeralForTests: true,
    releaseBinding: { release_id: "release-current", commit_sha: "a".repeat(40) }
  });
  return { dir, path, open };
}

test("serializes concurrent claim+enqueue and preserves idempotency across restart", async () => {
  const fixture = await makeStore();
  const first = fixture.open();
  await first.init();
  const queued = [];
  const entry = { notification_id: "n-1", fingerprint: "a".repeat(64), event: { tx_hash: `0x${"1".repeat(64)}` } };
  const results = await Promise.all(Array.from({ length: 12 }, () => first.claimAndEnqueue(entry, async (record) => queued.push(record))));
  assert.equal(results.filter((result) => result.kind === "accepted").length, 1);
  assert.equal(results.filter((result) => result.kind === "duplicate").length, 11);
  assert.equal(queued.length, 1);
  await first.close();
  const persisted = await readFile(fixture.path, "utf8");
  assert.match(persisted, /release-current/);
  assert.equal(persisted.includes("PRIVATE KEY"), false);
  assert.equal(persisted.includes("x-circle-signature"), false);

  const restarted = fixture.open();
  await restarted.init();
  assert.deepEqual(await restarted.claimAndEnqueue(entry), { kind: "duplicate", notification_id: "n-1", fingerprint: "a".repeat(64) });
  assert.equal((await restarted.claimAndEnqueue({ ...entry, fingerprint: "b".repeat(64) })).kind, "conflict");
  await restarted.close();
  await rm(fixture.dir, { recursive: true, force: true });
});

test("drops only an incomplete JSONL tail during restart recovery", async () => {
  const fixture = await makeStore();
  const store = fixture.open();
  await store.init();
  await store.claimAndEnqueue({ notification_id: "n-2", fingerprint: "c".repeat(64), event: { tx_hash: `0x${"2".repeat(64)}` } });
  await store.close();
  await appendFile(fixture.path, `{"schema":"${CIRCLE_WEBHOOK_STORE_SCHEMA}","record_type":"claim","notification_id":"partial`);

  const recovered = fixture.open();
  await recovered.init();
  assert.equal((await recovered.claimAndEnqueue({ notification_id: "n-2", fingerprint: "c".repeat(64) })).kind, "duplicate");
  assert.equal((await recovered.claimAndEnqueue({ notification_id: "n-3", fingerprint: "d".repeat(64) })).kind, "accepted");
  await recovered.close();
  const content = await readFile(fixture.path, "utf8");
  assert.equal(content.includes('"notification_id":"partial'), false);
  assert.equal(content.trim().split("\n").length, 2);
  await rm(fixture.dir, { recursive: true, force: true });
});

test("rejects an unconfigured or non-persistent store path", async () => {
  const missing = new CircleWebhookJsonlStore({ path: "" });
  await assert.rejects(() => missing.init(), { code: "CIRCLE_WEBHOOK_STORE_PATH_NOT_PERSISTENT" });
  const temporary = new CircleWebhookJsonlStore({ path: join(tmpdir(), "circle-webhook-nonpersistent.jsonl") });
  await assert.rejects(() => temporary.init(), { code: "CIRCLE_WEBHOOK_STORE_PATH_NOT_PERSISTENT" });
});
