import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { openBrandIndexCache } from "../../brand-index-cache.js";
import { BrandIndex } from "../../brand-index.js";
import { BrandDuplicateChecker } from "../../brand-duplicate-checker.js";
import type { Brand } from "../../types.js";

const brands: Brand[] = [
  { code: "one", label: "אדידס", translations: [{ value: "אדידס", locale: "he" }] },
  { code: "two", label: "אדידאס" },
];

test("indexed transliterations survive a warm run, prune removed names, and invalidate on code changes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "brand-index-cache-"));
  const modulePath = path.join(root, "dist", "brand-duplicate", "brand-index.js");
  const cachePath = path.join(root, ".brand-index-cache-cli.json");
  try {
    await mkdir(path.dirname(modulePath), { recursive: true });
    await mkdir(path.join(root, "data"));
    await writeFile(modulePath, "version one");
    await writeFile(path.join(root, "data", "phonetic-transliteration-rules.json"), "{}");

    const cold = await openBrandIndexCache(root, "cli");
    const original = new BrandIndex(brands, cold.service);
    await cold.save();
    assert.equal(cold.hits, 0);

    const warm = await openBrandIndexCache(root, "cli");
    const rebuilt = new BrandIndex(brands, warm.service);
    await warm.save();
    assert.equal(warm.hits, 2);
    assert.deepEqual(rebuilt.findEntriesByTransliteration("adidas").map((entry) => entry.brand.code),
      original.findEntriesByTransliteration("adidas").map((entry) => entry.brand.code));
    assert.deepEqual(rebuilt.findEntriesByTransliterationNgram("ad").map((entry) => entry.brand.code),
      original.findEntriesByTransliterationNgram("ad").map((entry) => entry.brand.code));
    for (const query of ["אדידס", "Adidas", "אדידאס", "new brand"]) {
      assert.deepEqual(new BrandDuplicateChecker(rebuilt).checkBrand(query),
        new BrandDuplicateChecker(original).checkBrand(query));
    }

    const reduced = await openBrandIndexCache(root, "cli");
    new BrandIndex(brands.slice(0, 1), reduced.service);
    await reduced.save();
    const saved = JSON.parse(await readFile(cachePath, "utf8")) as { entries: [string, unknown][] };
    assert.deepEqual(saved.entries.map(([name]) => name), ["אדידס"]);

    await writeFile(modulePath, "version two");
    const changed = await openBrandIndexCache(root, "cli");
    new BrandIndex(brands, changed.service);
    assert.equal(changed.hits, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("malformed cached variants are recomputed rather than used", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "brand-index-cache-"));
  try {
    await mkdir(path.join(root, "dist", "brand-duplicate"), { recursive: true });
    await mkdir(path.join(root, "data"));
    await writeFile(path.join(root, "dist", "brand-duplicate", "brand-index.js"), "version");
    await writeFile(path.join(root, "data", "phonetic-transliteration-rules.json"), "{}");
    const cold = await openBrandIndexCache(root, "cli");
    new BrandIndex(brands, cold.service);
    await cold.save();
    const cachePath = path.join(root, ".brand-index-cache-cli.json");
    const saved = JSON.parse(await readFile(cachePath, "utf8")) as {
      entries: [string, unknown][];
      checksum: string;
    };
    saved.entries[0][1] = [{ value: "forged", source: "GENERATED", confidence: "invalid" }];
    saved.checksum = createHash("sha256").update(JSON.stringify(saved.entries)).digest("hex");
    await writeFile(cachePath, JSON.stringify(saved));
    const recovered = await openBrandIndexCache(root, "cli");
    new BrandIndex(brands, recovered.service);
    assert.equal(recovered.hits, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
