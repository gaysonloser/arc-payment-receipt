import { open, mkdir } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { tmpdir } from "node:os";

export const CIRCLE_WEBHOOK_STORE_SCHEMA = "arc.circle-webhook-jsonl.v1";

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function isPersistentCircleWebhookStorePath(value, { allowEphemeralForTests = false } = {}) {
  if (!nonEmpty(value) || !isAbsolute(value)) return false;
  const normalized = resolve(value);
  if (allowEphemeralForTests) return true;
  const temporaryRoot = resolve(tmpdir());
  return normalized !== temporaryRoot
    && !normalized.startsWith(`${temporaryRoot}/`)
    && normalized !== "/tmp"
    && !normalized.startsWith("/tmp/")
    && normalized !== "/private/tmp"
    && !normalized.startsWith("/private/tmp/")
    && normalized !== "/dev/null";
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function parseCompleteLines(buffer) {
  const text = buffer.toString("utf8");
  const lastNewline = text.lastIndexOf("\n");
  const completeText = lastNewline >= 0 ? text.slice(0, lastNewline + 1) : "";
  const tail = lastNewline >= 0 ? text.slice(lastNewline + 1) : text;
  const records = [];
  for (const line of completeText.split("\n")) {
    if (!line.trim()) continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      const error = new Error("circle_webhook_store_corrupt_record");
      error.code = "CIRCLE_WEBHOOK_STORE_CORRUPT_RECORD";
      throw error;
    }
    records.push(parsed);
  }
  return { records, tail, lastNewlineBytes: Buffer.byteLength(completeText) };
}

export class CircleWebhookJsonlStore {
  constructor(options = {}) {
    this.path = options.path;
    this.releaseBinding = clone(options.releaseBinding ?? null);
    this.allowEphemeralForTests = options.allowEphemeralForTests === true;
    this.records = new Map();
    this.handle = null;
    this.needsSeparator = false;
    this.queue = Promise.resolve();
  }

  async init() {
    if (!isPersistentCircleWebhookStorePath(this.path, { allowEphemeralForTests: this.allowEphemeralForTests })) {
      const error = new Error("circle_webhook_store_path_not_persistent");
      error.code = "CIRCLE_WEBHOOK_STORE_PATH_NOT_PERSISTENT";
      throw error;
    }
    await mkdir(dirname(this.path), { recursive: true });
    this.handle = await open(this.path, "a+");
    const { records, tail, lastNewlineBytes } = parseCompleteLines(await this.handle.readFile());
    if (tail.trim()) {
      try {
        const parsedTail = JSON.parse(tail);
        records.push(parsedTail);
        this.needsSeparator = true;
      } catch {
        // Circle can retry after a process crash while the final JSONL write was
        // incomplete. Drop only that partial tail; complete records remain durable.
        await this.handle.truncate(lastNewlineBytes);
        await this.handle.sync();
      }
    }
    for (const record of records) {
      if (record?.schema !== CIRCLE_WEBHOOK_STORE_SCHEMA || record?.record_type !== "claim") continue;
      if (!nonEmpty(record.notification_id) || !/^[0-9a-f]{64}$/i.test(String(record.fingerprint ?? ""))) continue;
      this.records.set(record.notification_id, {
        fingerprint: String(record.fingerprint).toLowerCase(),
        release_binding: clone(record.release_binding ?? this.releaseBinding),
        claimed_at: record.claimed_at ?? null
      });
    }
    return this;
  }

  #serialize(record) {
    return `${JSON.stringify(record)}\n`;
  }

  async #append(record) {
    if (!this.handle) throw new Error("circle_webhook_store_not_initialized");
    if (this.needsSeparator) {
      await this.handle.write("\n");
      this.needsSeparator = false;
    }
    await this.handle.write(this.#serialize(record));
    await this.handle.sync();
  }

  #serialized(task) {
    const result = this.queue.then(task, task);
    this.queue = result.catch(() => undefined);
    return result;
  }

  async claimAndEnqueue(entry, enqueue = async () => {}) {
    return this.#serialized(async () => {
      const notificationId = String(entry.notification_id ?? "");
      const fingerprint = String(entry.fingerprint ?? "").toLowerCase();
      const prior = this.records.get(notificationId);
      if (prior) {
        if (prior.fingerprint === fingerprint) {
          return { kind: "duplicate", notification_id: notificationId, fingerprint };
        }
        return { kind: "conflict", notification_id: notificationId, fingerprint, prior_fingerprint: prior.fingerprint };
      }
      const record = {
        schema: CIRCLE_WEBHOOK_STORE_SCHEMA,
        record_type: "claim",
        notification_id: notificationId,
        fingerprint,
        release_binding: clone(entry.release_binding ?? this.releaseBinding),
        event: clone(entry.event ?? null),
        claimed_at: entry.claimed_at ?? new Date().toISOString(),
        enqueued: true
      };
      await this.#append(record);
      this.records.set(notificationId, {
        fingerprint,
        release_binding: clone(record.release_binding),
        claimed_at: record.claimed_at
      });
      await enqueue(clone(record));
      return { kind: "accepted", notification_id: notificationId, fingerprint };
    });
  }

  async has(notificationId) {
    return this.records.has(String(notificationId ?? ""));
  }

  async put(notificationId, fingerprint = null) {
    const id = String(notificationId ?? "");
    if (this.records.has(id)) return;
    await this.claimAndEnqueue({
      notification_id: id,
      fingerprint: fingerprint ?? "0".repeat(64),
      event: null
    });
  }

  async close() {
    await this.queue;
    if (this.handle) {
      await this.handle.sync();
      await this.handle.close();
      this.handle = null;
    }
  }
}

export async function createCircleWebhookStore(options = {}) {
  const store = new CircleWebhookJsonlStore(options);
  return store.init();
}
