import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Arc Lab viewer renders the cross-system manufacturing reconciliation", async () => {
  const viewer = await readFile(new URL("./arc_lab_enterprise_os_viewer.html", import.meta.url), "utf8");
  assert.match(viewer, /\/api\/v1\/cross-system-manufacturing-reconciliation/);
  assert.match(viewer, /\/api\/v1\/manufacturing-close-impact/);
  assert.match(viewer, /\/api\/v1\/manufacturing-finality-timeline/);
  assert.match(viewer, /\/api\/v1\/source-assurance-exceptions/);
  assert.match(viewer, /\/api\/v1\/production-boundary/);
  assert.match(viewer, /Close \/ FP&A impact/);
  assert.match(viewer, /Finality inspector/);
  assert.match(viewer, /Source assurance queue/);
  assert.match(viewer, /Production boundary/);
  assert.match(viewer, /Arc ↔ ERP reconciliation/);
  assert.match(viewer, /All control checks passed/);
});
