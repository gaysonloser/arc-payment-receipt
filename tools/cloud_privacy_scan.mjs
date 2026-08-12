import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const roots = ["README.md", "SECURITY.md", "config", "current-mvp/web", "docs", "outputs", "src", "test", "tools"];
const denied = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:mnemonic|seed phrase|recovery phrase)\s*[:=]/i,
  /\b(?:api[_ -]?secret|private[_ -]?key|session[_ -]?cookie)\s*[:=]\s*["'][^"']+/i,
  /\/Users\/[^/]+\//,
  new RegExp("SynologyDrive" + "-AI")
];

async function filesAt(target) {
  const info = await stat(target);
  if (info.isFile()) return [target];
  const entries = await readdir(target, { withFileTypes: true });
  const nested = await Promise.all(entries.filter((entry) => entry.name !== ".git").map((entry) => filesAt(path.join(target, entry.name))));
  return nested.flat();
}

const files = (await Promise.all(roots.map(filesAt))).flat().filter((file) => !/\.(?:png|jpg|jpeg|gif|pdf|mp4|m4a|aiff)$/i.test(file));
const failures = [];
for (const file of files) {
  const text = await readFile(file, "utf8");
  for (const pattern of denied) {
    if (pattern.test(text)) failures.push(`${file}: ${pattern}`);
  }
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`privacy scan passed for ${files.length} text files`);
