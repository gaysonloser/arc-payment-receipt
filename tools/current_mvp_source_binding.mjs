import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

export const CURRENT_MVP_RELEASE_ID = "verified-milestone-close-mvp-publication-staging-rc1";
export const CURRENT_MVP_ROUTE_PREFIX = "/current-mvp";
export const CURRENT_MVP_MANIFEST_SHA256 = "7206ad886aaca6ffc8367653530216e3c29ae74d268239c5465a9891fe41ce3d";
export const CURRENT_MVP_MANIFEST_PATH = resolve(
  HERE,
  "../../../programme/verified-milestone-close/artifacts/mvp-publication-staging-rc1-manifest.json"
);
export const CURRENT_MVP_REPOSITORY_ROOT = resolve(HERE, "../current-mvp");
export const CURRENT_MVP_WEB_ROOT = resolve(CURRENT_MVP_REPOSITORY_ROOT, "web");
export const CURRENT_MVP_BUNDLED_MANIFEST_PATH = resolve(CURRENT_MVP_REPOSITORY_ROOT, "mvp-publication-staging-rc1-manifest.json");
export const CURRENT_MVP_MANIFEST_BASENAME = "mvp-publication-staging-rc1-manifest.json";

const MIME_TYPES = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png"
});

function isInside(root, candidate) {
  const rootPath = resolve(root);
  const candidatePath = resolve(candidate);
  return candidatePath === rootPath || candidatePath.startsWith(`${rootPath}${sep}`);
}

async function listFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(current, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(root, path));
    else if (entry.isFile()) files.push(relative(root, path).split(sep).join("/"));
  }
  return files.sort();
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function resolveCurrentMvpRequest(pathname) {
  if (pathname !== CURRENT_MVP_ROUTE_PREFIX && !pathname.startsWith(`${CURRENT_MVP_ROUTE_PREFIX}/`)) return null;
  const suffix = pathname.slice(CURRENT_MVP_ROUTE_PREFIX.length).replace(/^\/+/, "");
  if (suffix === CURRENT_MVP_MANIFEST_BASENAME) return null;
  const hasExtension = /\.[A-Za-z0-9]+$/.test(suffix);
  const relativePath = suffix === "" || !hasExtension ? "index.html" : suffix;
  if (relativePath.split("/").some((segment) => segment === ".." || segment === "." || segment === "")) return null;
  const filePath = resolve(CURRENT_MVP_WEB_ROOT, relativePath);
  if (!isInside(CURRENT_MVP_WEB_ROOT, filePath)) return null;
  return {
    route: pathname,
    relative_path: `web/${relativePath}`,
    file_path: filePath,
    document_fallback: relativePath === "index.html" && (suffix === "" || !hasExtension)
  };
}

export function currentMvpContentType(path) {
  const extension = path.slice(path.lastIndexOf(".")).toLowerCase();
  return MIME_TYPES[extension] ?? "application/octet-stream";
}

export async function verifyCurrentMvpBundle({
  manifestPath = CURRENT_MVP_MANIFEST_PATH,
  destinationRoot = CURRENT_MVP_REPOSITORY_ROOT
} = {}) {
  const issues = [];
  let manifest;
  let manifestBytes;
  let bundledManifestBytes;
  try {
    manifestBytes = await readFile(manifestPath);
    manifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch (error) {
    return { valid: false, release_id: CURRENT_MVP_RELEASE_ID, manifest_sha256: null, entry_count: 0, issues: [`manifest_unreadable:${error.code ?? error.message}`] };
  }
  const manifestSha = sha256(manifestBytes);
  if (manifestSha !== CURRENT_MVP_MANIFEST_SHA256) issues.push("manifest_sha256_mismatch");
  try {
    bundledManifestBytes = await readFile(resolve(destinationRoot, CURRENT_MVP_MANIFEST_BASENAME));
    if (sha256(bundledManifestBytes) !== CURRENT_MVP_MANIFEST_SHA256 || !bundledManifestBytes.equals(manifestBytes)) {
      issues.push("bundled_manifest_sha256_or_bytes_mismatch");
    }
  } catch (error) {
    issues.push(`bundled_manifest_unreadable:${error.code ?? error.message}`);
  }
  if (manifest.spec_id !== CURRENT_MVP_RELEASE_ID) issues.push("release_id_mismatch");
  if (!Array.isArray(manifest.entries) || manifest.entries.length !== 23) issues.push("entry_count_must_be_23");

  const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
  for (const entry of entries) {
    const path = String(entry.path ?? "");
    if (!path.startsWith("web/") || path.includes("..")) {
      issues.push(`invalid_manifest_path:${path}`);
      continue;
    }
    const destination = resolve(destinationRoot, path.split("/").slice(0, 1).join(""), path.slice("web/".length));
    if (!isInside(destinationRoot, destination)) {
      issues.push(`destination_outside_root:${path}`);
      continue;
    }
    try {
      const bytes = await readFile(destination);
      const actualSha = sha256(bytes);
      if (bytes.length !== entry.bytes) issues.push(`bytes_mismatch:${path}`);
      if (actualSha !== entry.sha256) issues.push(`sha256_mismatch:${path}`);
    } catch (error) {
      issues.push(`missing_destination:${path}:${error.code ?? error.message}`);
    }
  }
  try {
    const actual = await listFiles(destinationRoot);
    const expected = [...entries.map((entry) => entry.path), CURRENT_MVP_MANIFEST_BASENAME].sort();
    for (const extra of actual.filter((path) => !expected.includes(path))) issues.push(`extra_destination:${extra}`);
    for (const missing of expected.filter((path) => !actual.includes(path))) issues.push(`missing_destination:${missing}`);
  } catch (error) {
    issues.push(`destination_unreadable:${error.code ?? error.message}`);
  }
  return {
    valid: issues.length === 0,
    release_id: manifest.spec_id ?? null,
    manifest_sha256: manifestSha,
    entry_count: entries.length,
    manifest_in_candidate: bundledManifestBytes !== undefined,
    candidate_file_count: entries.length + 1,
    destination_root: destinationRoot,
    issues
  };
}

export { sha256 };
