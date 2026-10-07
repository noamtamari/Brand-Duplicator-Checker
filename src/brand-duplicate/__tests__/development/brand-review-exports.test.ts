import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createBrandReviewExports,
  findHighestBrandCodeNumber,
  formatBrandExportTimestamp,
} from "../../brand-review-exports.js";
import type { Brand } from "../../types.js";

const catalogue: Brand[] = [
  { code: "b_15837mp", label: "Existing first" },
  { code: "b_9mp", label: "Existing low" },
  { code: "b_15839mp", label: "Existing maximum" },
  { code: "other", label: "Ignored format" },
];

test("uses the maximum supported code regardless of catalogue ordering", () => {
  assert.equal(findHighestBrandCodeNumber(catalogue), 15839n);
});

test("formats local timestamps to minute precision", () => {
  const date = new Date(2026, 9, 5, 7, 8, 59);
  assert.equal(formatBrandExportTimestamp(date), "202610050708");
});

test("writes selected brand/relation rows and removes only old timestamped exports", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "brand-review-"));
  try {
    await writeFile(path.join(root, "SP_brands_202610041607.csv"), "old brands", "utf8");
    await writeFile(path.join(root, "SP_brand_relations_202610041607.csv"), "old relations", "utf8");
    await writeFile(path.join(root, "SP_brands_notes.csv"), "keep", "utf8");
    await writeFile(path.join(root, "unrelated.csv"), "keep", "utf8");

    const output = await createBrandReviewExports(
      root,
      catalogue,
      [{ brand: "Monbento" }, { brand: "שם;מותג" }],
      new Date(2026, 9, 5, 7, 8, 59),
    );

    assert.deepEqual(output.codes, ["b_15840mp", "b_15841mp"]);
    assert.equal(path.basename(output.brandsPath), "SP_brands_202610050708.csv");
    assert.equal(path.basename(output.relationsPath), "SP_brand_relations_202610050708.csv");
    assert.equal(
      await readFile(output.brandsPath, "utf8"),
      'brand_number;brand_name \r\n;b_15840mp;Monbento\r\n;b_15841mp;"שם;מותג"\r\n',
    );
    assert.equal(
      await readFile(output.relationsPath, "utf8"),
      'brand_number;parent_number \r\n;b_15840mp;brand\r\n;b_15841mp;brand\r\n',
    );
    assert.deepEqual((await readdir(root)).sort(), [
      "SP_brand_relations_202610050708.csv",
      "SP_brands_202610050708.csv",
      "SP_brands_notes.csv",
      "unrelated.csv",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("empty selection or an unusable code counter leaves previous exports untouched", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "brand-review-"));
  try {
    const previous = path.join(root, "SP_brands_202610041607.csv");
    await writeFile(previous, "preserve", "utf8");

    await assert.rejects(createBrandReviewExports(root, catalogue, []), /Select at least one/);
    await assert.rejects(
      createBrandReviewExports(root, [{ code: "b_1", label: "Legacy" }], [{ brand: "New" }]),
      /no brand code matching/,
    );
    assert.equal(await readFile(previous, "utf8"), "preserve");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});