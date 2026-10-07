import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { formatBrandReviewError, startBrandReviewServer } from "../../brand-review-server.js";
import type { BrandReviewBatch } from "../../brand-review-service.js";

const html = Buffer.from("<!doctype html><title>Review</title>");
const batch: BrandReviewBatch = {
  catalogue: [{ code: "b_41mp", label: "Existing" }],
  timingsMs: {
    catalogueRetrievalAndParsing: 0,
    indexConstruction: 0,
    indexCacheSaving: 0,
    duplicateChecking: 0,
    resultFormatting: 0,
  },
  items: [
    { id: 0, brand: "Approved", outcome: "ALLOW", candidates: [], selected: true, result: {
      input: "Approved", normalizedInput: "approved", decision: "ALLOW", confidence: 1, candidates: [],
    } },
    { id: 1, brand: "Needs review", outcome: "REVIEW", candidates: [
      { label: "Existing", code: "b_41mp", score: 0.82 },
    ], selected: false, result: {
      input: "Needs review", normalizedInput: "needs review", decision: "HUMAN_REVIEW", confidence: 0, candidates: [],
    } },
  ],
};

test("explains how to resolve Windows file-lock errors", () => {
  const error = Object.assign(new Error("resource busy"), {
    code: "EBUSY",
    syscall: "rename",
    path: "C:\\exports\\SP_brands_202610051549.csv",
  });
  assert.match(formatBrandReviewError(error), /SP_brands_202610051549\.csv.*Close it in Excel/u);
});

test("serves review results on loopback and validates export selections", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "brand-review-server-"));
  let completeExport!: () => void;
  const exportCompleted = new Promise<void>((resolve) => { completeExport = resolve; });
  const app = await startBrandReviewServer({
    rootDirectory: root,
    html,
    batch,
    onExportComplete: completeExport,
  });
  try {
    assert.match(app.url, /^http:\/\/127\.0\.0\.1:\d+\/$/u);
    const page = await fetch(app.url);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Review/u);

    const resultsResponse = await fetch(new URL("api/results", app.url));
    const results = await resultsResponse.json() as {
      requestToken: string;
      items: Array<{ selected: boolean; candidates: Array<{ label: string; code: string; score: number }> }>;
    };
    assert.deepEqual(results.items.map((item) => item.selected), [true, false]);
    assert.deepEqual(results.items[1].candidates, [
      { label: "Existing", code: "b_41mp", score: 0.82 },
    ]);

    const create = async (payload: unknown) => fetch(new URL("api/create", app.url), {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: new URL(app.url).origin },
      body: JSON.stringify(payload),
    });

    const badToken = await create({ requestToken: "bad", selectedIds: [0] });
    assert.equal(badToken.status, 403);
    const badSelection = await create({ requestToken: results.requestToken, selectedIds: [99] });
    assert.equal(badSelection.status, 400);

    const created = await create({ requestToken: results.requestToken, selectedIds: [1, 0] });
    assert.equal(created.status, 200);
    const output = await created.json() as { brandsFile: string; relationsFile: string; count: number };
    assert.equal(output.count, 2);
    assert.match(await readFile(path.join(root, output.brandsFile), "utf8"), /Approved/u);
    assert.match(await readFile(path.join(root, output.brandsFile), "utf8"), /Needs review/u);
    await exportCompleted;
    await assert.rejects(fetch(app.url));
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});