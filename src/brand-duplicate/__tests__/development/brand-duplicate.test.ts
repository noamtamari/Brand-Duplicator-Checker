import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseBrandResponse } from "../../brand-adapter.js";
import { BrandDuplicateChecker } from "../../brand-duplicate-checker.js";
import { BrandIndex } from "../../brand-index.js";
import { normalizeBrandName, normalizeBrandNameParts } from "../../brand-normalizer.js";
import type { Brand } from "../../types.js";

const brands: Brand[] = [
  { code: "b_adidas_1", label: "Adidas" },
  { code: "b_adidas_2", label: " adidas " },
  { code: "b_tp_link", label: "TP-LINK" },
  { code: "b_tommy", label: "Tommy Hilfiger" },
  { code: "b_loreal", label: "L'Oreal" },
  {
    code: "b_translated",
    label: "מותג",
    translations: [{ locale: "en", value: "Translated Brand" }],
  },
];

const checker = new BrandDuplicateChecker(new BrandIndex(brands));

test("normalizes case and surrounding whitespace", () => {
  assert.equal(normalizeBrandName(" Adidas "), "adidas");
  assert.equal(normalizeBrandName("ADIDAS"), "adidas");
});

test("collapses repeated whitespace", () => {
  assert.equal(normalizeBrandName("Tommy  Hilfiger"), "tommy hilfiger");
});

test("normalizes separators without removing word boundaries", () => {
  assert.equal(normalizeBrandName("TP LINK"), "tp link");
  assert.equal(normalizeBrandName("TP-LINK"), "tp link");
  assert.equal(normalizeBrandName("tp_link"), "tp link");
});

test("normalizes apostrophe variants and non-breaking spaces", () => {
  assert.equal(normalizeBrandName("L’Oreal"), "l\'oreal");
  assert.equal(normalizeBrandName("L`Oreal"), "l\'oreal");
  assert.equal(normalizeBrandName("A\u00A0B"), "a b");
  assert.equal(normalizeBrandName("A\u05F3B"), "a\'b");
});

test("uses Unicode compatibility normalization but preserves meaningful accents", () => {
  assert.equal(normalizeBrandName("ＦＯＯ"), "foo");
  assert.notEqual(normalizeBrandName("Cafe"), normalizeBrandName("Café"));
});

test("provides a conservative compact representation", () => {
  assert.deepEqual(normalizeBrandNameParts("TP-LINK"), {
    normalizedText: "tp link",
    compactText: "tplink",
  });
});

test("blocks every normalized exact match and returns all candidates", () => {
  const result = checker.checkBrand("  ADIDAS ");

  assert.equal(result.decision, "BLOCK");
  assert.equal(result.normalizedInput, "adidas");
  assert.equal(result.confidence, 1);
  assert.deepEqual(result.candidates, [
    {
      code: "b_adidas_1",
      label: "Adidas",
      score: 1,
      reason: "Normalized exact match",
      matchType: "NORMALIZED_EXACT",
    },
    {
      code: "b_adidas_2",
      label: " adidas ",
      score: 1,
      reason: "Normalized exact match",
      matchType: "NORMALIZED_EXACT",
    },
  ]);
});

test("blocks separator and apostrophe variants", () => {
  assert.equal(checker.checkBrand("tp_link").decision, "BLOCK");
  assert.equal(checker.checkBrand("L’Oreal").decision, "BLOCK");
});

test("indexes translations for exact same-language matches", () => {
  const result = checker.checkBrand(" translated brand ");

  assert.equal(result.decision, "BLOCK");
  assert.equal(result.candidates[0]?.code, "b_translated");
});

test("reviews a shorter form of a brand but allows an extension or an unrelated name", () => {
  // Adding words to a brand makes a new name; the catalogue lists extensions as brands of their own.
  assert.equal(checker.checkBrand("Adidas Originals").decision, "ALLOW");
  // Dropping words may be the same brand written shorter.
  assert.equal(checker.checkBrand("Tommy").decision, "HUMAN_REVIEW");
  assert.equal(checker.checkBrand("Café").decision, "ALLOW");
});

test("handles null-like input without indexing an empty brand", () => {
  assert.deepEqual(checker.checkBrand(null), {
    input: "",
    normalizedInput: "",
    decision: "ALLOW",
    confidence: 1,
    displayCandidates: [],
    candidates: [],
  });
  assert.equal(checker.checkBrand(undefined).decision, "ALLOW");
});

test("adapts the supplied response shape and ignores malformed values", () => {
  const parsed = parseBrandResponse({
    values_lists: [
      {
        values: [
          {
            code: "b_1",
            label: "Brand One",
            label_translations: [{ locale: "en", value: "Brand One" }, { locale: 7, value: "ignored" }],
          },
          { code: "b_invalid", label: 7 },
        ],
      },
    ],
  });

  assert.deepEqual(parsed, [
    {
      code: "b_1",
      label: "Brand One",
      translations: [{ locale: "en", value: "Brand One" }],
    },
  ]);
});

test("checks a known brand from the supplied 17,653-brand response", async () => {
  const responsePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../response.json");
  const response = JSON.parse(await readFile(responsePath, "utf8")) as unknown;
  const suppliedBrands = parseBrandResponse(response);
  const suppliedChecker = new BrandDuplicateChecker(new BrandIndex(suppliedBrands));
  const result = suppliedChecker.checkBrand("l’eau par kenzo");

  assert.equal(suppliedBrands.length, 17653);
  assert.equal(result.decision, "BLOCK");
  assert.equal(result.candidates[0]?.code, "b_3476");
});