import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Arc Lab viewer renders the cross-system manufacturing reconciliation", async () => {
  const viewer = await readFile(new URL("./arc_lab_enterprise_os_viewer.html", import.meta.url), "utf8");
  assert.match(viewer, /\/api\/v1\/cross-system-manufacturing-reconciliation/);
  assert.match(viewer, /Arc ↔ ERP reconciliation/);
  assert.match(viewer, /All control checks passed/);
});
