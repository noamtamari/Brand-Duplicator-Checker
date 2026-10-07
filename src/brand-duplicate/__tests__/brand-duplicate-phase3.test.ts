import assert from "node:assert/strict";
import test from "node:test";
import {
  BrandDuplicateChecker,
  BrandIndex,
  InMemoryBrandAliasResolver,
  StringSimilarityService,
  TransliterationService,
  detectScript,
} from "../index.js";

function createChecker(labels: string[], aliasResolver?: InMemoryBrandAliasResolver): BrandDuplicateChecker {
  return new BrandDuplicateChecker(
    new BrandIndex(labels.map((label, index) => ({ code: `b_${index}`, label }))),
    undefined,
    { aliasResolver },
  );
}

test("detects Hebrew, Latin, mixed, numeric, and empty scripts", () => {
  assert.equal(detectScript("אדידס"), "HEBREW");
  assert.equal(detectScript("ADIDAS"), "LATIN");
  assert.equal(detectScript("קמיל בלו NATURE"), "MIXED");
  assert.equal(detectScript("123-!"), "NUMERIC_OR_SYMBOL");
  assert.equal(detectScript(""), "OTHER");
});

test("generates bounded plausible Hebrew transliteration variants", () => {
  const service = new TransliterationService();

  assert.deepEqual(service.transliterateHebrewToLatin("אדידס").slice(0, 2), ["adidas", "adids"]);
  assert.ok(service.transliterateHebrewToLatin("אדידס").length <= 32);
  assert.ok(service.transliterateHebrewToLatin("נייקי").includes("nike"));
  assert.ok(service.transliterateHebrewToLatin("לוריאל").includes("loreal"));
  assert.ok(service.transliterateHebrewToLatin("ז'יבנשי").includes("givenchy"));
});

test("does not treat semantic translation as brand transliteration", () => {
  const checker = createChecker(["APPLE", "תפוח"]);
  const result = checker.checkBrand("תפוח");

  assert.equal(result.decision, "BLOCK");
  assert.equal(result.candidates[0]?.label, "תפוח");
  assert.equal(result.candidates[0]?.matchType, "NORMALIZED_EXACT");
  assert.equal(result.candidates.some((candidate) => candidate.label === "APPLE"), false);
});

test("blocks Hebrew-English transliteration exact matches", () => {
  const checker = createChecker(["ADIDAS", "NIKE", "L'OREAL", "GIVENCHY"]);

  for (const [input, expectedLabel] of [
    ["אדידס", "ADIDAS"],
    ["נייקי", "NIKE"],
    ["לוריאל", "L'OREAL"],
    ["ז'יבנשי", "GIVENCHY"],
  ]) {
    const result = checker.checkBrand(input);
    assert.equal(result.decision, "BLOCK", input);
    assert.equal(result.candidates[0]?.label, expectedLabel, input);
    assert.equal(result.candidates[0]?.matchType, "TRANSLITERATION_EXACT", input);
    assert.equal(result.candidates[0]?.crossLanguageSignals?.transliterationExact, true, input);
    assert.equal(result.candidates[0]?.score, 0.99, input);
  }
});

test("supports mixed Hebrew and Latin input", () => {
  const checker = createChecker(["KAMIL BLUE NATURE", "ADIDAS"]);
  const result = checker.checkBrand("קמיל בלו NATURE");

  assert.equal(result.decision, "BLOCK");
  assert.equal(result.candidates[0]?.label, "KAMIL BLUE NATURE");
  assert.equal(result.candidates[0]?.matchType, "TRANSLITERATION_EXACT");
});

test("returns cross-language fuzzy candidates for spelling variants", () => {
  const checker = createChecker(["ADIDAS"]);
  const result = checker.checkBrand("אדידאס");

  assert.equal(result.candidates[0]?.label, "ADIDAS");
  assert.ok(["TRANSLITERATION_EXACT", "TRANSLITERATION_FUZZY"].includes(result.candidates[0]?.matchType ?? ""));
  assert.ok(result.candidates[0]?.crossLanguageSignals);
  assert.notEqual(result.decision, "ALLOW");
});

test("does not auto-block an uncurated generated transliteration coincidence", () => {
  const checker = createChecker(["GD"]);
  const result = checker.checkBrand("גד");

  assert.equal(result.candidates[0]?.label, "GD");
  assert.equal(result.candidates[0]?.matchType, "TRANSLITERATION_EXACT");
  assert.equal(result.candidates[0]?.crossLanguageSignals?.transliterationSource, "GENERATED");
  assert.equal(result.decision, "HUMAN_REVIEW");
});

test("keeps cross-language related product lines at review", () => {
  const checker = createChecker(["DIOR", "KENZO"]);

  const dior = checker.checkBrand("דיאור הום");
  assert.equal(dior.decision, "ALLOW");
  assert.equal(dior.candidates[0]?.label, "DIOR");
  assert.equal(dior.candidates[0]?.matchType, "CROSS_LANGUAGE_POSSIBLE_MATCH");

  const kenzo = checker.checkBrand("קנזו הום");
  assert.equal(kenzo.decision, "ALLOW");
  assert.equal(kenzo.candidates[0]?.label, "KENZO");
  assert.equal(kenzo.candidates[0]?.matchType, "CROSS_LANGUAGE_POSSIBLE_MATCH");
});

test("supports reverse lookup from Latin input to a Hebrew existing label", () => {
  const checker = createChecker(["אדידס"]);
  const result = checker.checkBrand("ADIDAS");

  assert.equal(result.decision, "BLOCK");
  assert.equal(result.candidates[0]?.label, "אדידס");
  assert.equal(result.candidates[0]?.matchType, "TRANSLITERATION_EXACT");
});

test("approved aliases block deterministically", () => {
  const aliases = new InMemoryBrandAliasResolver([
    { code: "b_0", label: "ADIDAS", aliases: ["אדידאס"] },
  ]);
  const checker = createChecker(["ADIDAS"], aliases);
  const result = checker.checkBrand("אדידאס");

  assert.equal(result.decision, "BLOCK");
  assert.equal(result.candidates[0]?.matchType, "APPROVED_ALIAS");
});

test("the similarity service remains available alongside cross-language signals", () => {
  const comparison = new StringSimilarityService().compare("adidas", "adidas");
  assert.equal(comparison.score, 1);
  assert.equal(comparison.editDistance, 0);
});