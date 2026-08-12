import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

import {
  CURRENT_MVP_MANIFEST_SHA256,
  CURRENT_MVP_BUNDLED_MANIFEST_PATH,
  CURRENT_MVP_RELEASE_ID,
  CURRENT_MVP_REPOSITORY_ROOT,
  CURRENT_RELEASE_WORKBENCH_MANIFEST_BASENAME,
  resolveCurrentMvpRequest,
  verifyCurrentMvpBundle
} from "./current_mvp_source_binding.mjs";
import { createReceiptServer } from "./arc_payment_receipt_server.mjs";

let server;
let origin;
let serverBindError;

test("resolves the current release manifest at the public product root without exposing the historical manifest", () => {
  const current = resolveCurrentMvpRequest(`/current-mvp/${CURRENT_RELEASE_WORKBENCH_MANIFEST_BASENAME}`);
  assert.equal(current.relative_path, CURRENT_RELEASE_WORKBENCH_MANIFEST_BASENAME);
  assert.equal(current.file_path, join(CURRENT_MVP_REPOSITORY_ROOT, CURRENT_RELEASE_WORKBENCH_MANIFEST_BASENAME));
  assert.equal(resolveCurrentMvpRequest("/current-mvp/mvp-publication-staging-rc1-manifest.json"), null);
});

before(async () => {
  server = createReceiptServer({
    loadViewer: async () => "<!doctype html><title>historical ArcPaymentReceipt viewer</title>"
  });
  await new Promise((resolve) => {
    server.once("error", (error) => { serverBindError = error; resolve(); });
    server.listen(0, "127.0.0.1", resolve);
  });
  if (!serverBindError) origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (serverBindError) return;
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("reports the historical 23-file manifest as stale after the deep workbench replacement", async () => {
  const result = await verifyCurrentMvpBundle();
  assert.equal(result.valid, false);
  assert.equal(result.release_id, CURRENT_MVP_RELEASE_ID);
  assert.equal(result.manifest_sha256, CURRENT_MVP_MANIFEST_SHA256);
  assert.equal(result.entry_count, 23);
  assert.equal(result.manifest_in_candidate, true);
  assert.equal(result.candidate_file_count, 24);
  assert.equal((await readFile(CURRENT_MVP_BUNDLED_MANIFEST_PATH)).length > 0, true);
  assert.deepEqual(result.current_release_override_paths.map((item) => item.path).sort(), ["web/fixture-engine.mjs", "web/index.html", "web/navigation-workspace.mjs"]);
  assert.equal(result.issues.filter((issue) => issue.startsWith("historical_manifest_stale:")).length, 3);
});

test("kills a changed bundle file and an extra destination file without touching the source staging root", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "arc-current-mvp-"));
  try {
    const candidateRoot = join(temporaryRoot, "current-mvp");
    await cp(CURRENT_MVP_REPOSITORY_ROOT, candidateRoot, { recursive: true });
    const immutableAssetPath = join(candidateRoot, "web/assets/icons/paperclip.svg");
    const original = await readFile(immutableAssetPath);
    await writeFile(immutableAssetPath, Buffer.concat([original, Buffer.from("\n")]))
    await writeFile(join(candidateRoot, "unexpected.txt"), "not in the 23-file bundle\n");
    const result = await verifyCurrentMvpBundle({ destinationRoot: candidateRoot });
    assert.equal(result.valid, false);
    assert.equal(result.issues.some((issue) => issue === "sha256_mismatch:web/assets/icons/paperclip.svg"), true);
    assert.equal(result.issues.some((issue) => issue === "bytes_mismatch:web/assets/icons/paperclip.svg"), true);
    assert.equal(result.issues.some((issue) => issue === "extra_destination:unexpected.txt"), true);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("serves current MVP routes without replacing the historical root and preserves health routes", async (t) => {
  if (serverBindError) {
    t.skip(`local loopback bind unavailable: ${serverBindError.code ?? serverBindError.message}`);
    return;
  }
  const root = await fetch(`${origin}/`);
  const rootBody = await root.text();
  assert.equal(root.status, 200);
  assert.match(rootBody, /historical ArcPaymentReceipt viewer/);

  const current = await fetch(`${origin}/current-mvp`);
  const currentBody = await current.text();
  assert.equal(current.status, 200);
  assert.match(currentBody, /Arc Enterprise · Settlement Workbench/);
  assert.notEqual(currentBody, rootBody);
  const contentSecurityPolicy = current.headers.get("content-security-policy");
  assert.match(contentSecurityPolicy, /object-src 'none'/);
  assert.match(contentSecurityPolicy, /frame-ancestors 'none'/);
  assert.match(contentSecurityPolicy, /form-action 'none'/);
  assert.equal(current.headers.get("x-frame-options"), "DENY");
  assert.equal(current.headers.get("x-content-type-options"), "nosniff");

  const deepLink = await fetch(`${origin}/current-mvp/reconciliation`);
  assert.equal(deepLink.status, 200);
  assert.equal(await deepLink.text(), currentBody);

  const asset = await fetch(`${origin}/current-mvp/assets/brand/arc-logo-navy-official.svg`);
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get("cache-control"), "public, max-age=3600");
  assert.equal(Buffer.from(await asset.arrayBuffer()).toString("utf8"), await readFile(join(CURRENT_MVP_REPOSITORY_ROOT, "web/assets/brand/arc-logo-navy-official.svg"), "utf8"));

  const missing = await fetch(`${origin}/current-mvp/assets/missing.svg`);
  assert.equal(missing.status, 404);
  const manifest = await fetch(`${origin}/current-mvp/mvp-publication-staging-rc1-manifest.json`);
  assert.equal(manifest.status, 404);
  const currentManifest = await fetch(`${origin}/current-mvp/${CURRENT_RELEASE_WORKBENCH_MANIFEST_BASENAME}`);
  assert.equal(currentManifest.status, 200);
  assert.match(currentManifest.headers.get("content-type"), /^application\/json/);
  assert.deepEqual(await currentManifest.json(), JSON.parse(await readFile(join(CURRENT_MVP_REPOSITORY_ROOT, CURRENT_RELEASE_WORKBENCH_MANIFEST_BASENAME), "utf8")));

  const health = await fetch(`${origin}/healthz`);
  const apiHealth = await fetch(`${origin}/api/health`);
  assert.equal(health.status, 200);
  assert.equal(apiHealth.status, 200);
  assert.equal((await health.json()).status, "ok");
  assert.equal((await apiHealth.json()).status, "ok");
});
