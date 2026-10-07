import assert from "node:assert/strict";
import test from "node:test";
import {
  BrandDuplicateChecker,
  BrandIndex,
  InMemoryBrandAliasResolver,
  StringSimilarityService,
  TransliterationService,
  detectScript,
} from "../../index.js";


function createChecker(
  labels: string[],
  aliasResolver?: InMemoryBrandAliasResolver,
): BrandDuplicateChecker {
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

test("allows a name that extends a brand in the other script, and reviews a shorter one", () => {
  const checker = createChecker(["DIOR", "KENZO"]);

  const dior = checker.checkBrand("דיאור הום");
  assert.equal(dior.decision, "ALLOW");
  assert.equal(dior.candidates[0]?.label, "DIOR");
  assert.equal(dior.candidates[0]?.partialMatch, true);

  assert.equal(checker.checkBrand("קנזו הום").decision, "ALLOW");
  assert.equal(createChecker(["DIOR HOMME"]).checkBrand("דיאור").decision, "HUMAN_REVIEW");
});

test("supports reverse lookup from Latin input to a Hebrew existing label", () => {
  const checker = createChecker(["אדידס"]);
  const result = checker.checkBrand("ADIDAS");

  assert.equal(result.decision, "BLOCK");
  assert.equal(result.candidates[0]?.label, "אדידס");
  assert.equal(result.candidates[0]?.matchType, "TRANSLITERATION_EXACT");
});

test("approved aliases block", () => {
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

test("a single vav can stand for a doubled Latin vowel", () => {
  const checker = createChecker(["MOOI", "MY"]);

  const result = checker.checkBrand("מוי");

  assert.ok(
    result.candidates.some((candidate) => candidate.label === "MOOI"),
    `MOOI should be a candidate, got ${result.candidates.map((candidate) => candidate.label).join(", ")}`,
  );
});

test("matching consonants are evidence when Hebrew leaves the vowels unwritten", () => {
  // "נטורל דיאט" romanizes to "nturl diat": no letter mapping reaches "natural diet", but both
  // reduce to the consonants "ntrldt". The Hebrew spelling also ranks below the Latin neighbours.
  const checker = createChecker(["Natural glow", "NATURAL CODE", "Naturalle", "נטורל דיאט"]);

  const result = checker.checkBrand("natural diet");

  assert.equal(result.decision, "HUMAN_REVIEW");
  const crossLanguage = result.candidates.find(
    (candidate) => candidate.label === "נטורל דיאט",
  );
  assert.ok(crossLanguage, "the Hebrew spelling should be a candidate");
  assert.equal(crossLanguage?.crossLanguageSignals?.skeletonMatch, true);
  assert.equal(crossLanguage?.crossLanguageSignals?.skeleton, "ntrldt");
});

test("a short shared skeleton is not treated as evidence", () => {
  // "מוי" and "MY" both reduce to "m"; without a length floor every short name would match.
  const checker = createChecker(["MY"]);

  const result = checker.checkBrand("מוי");
  const candidate = result.candidates.find((entry) => entry.label === "MY");

  assert.ok(candidate);
  assert.ok((candidate?.crossLanguageSignals?.skeleton?.length ?? 0) < 5);
});

test("a Latin name finds the Hebrew spelling of the same brand", () => {
  // Romanizing the indexed Hebrew name only finds it when its own cheapest spelling happens to
  // land near the Latin input. Expanding the Latin input into Hebrew instead compares against the
  // brand as it was actually written, which is what these three reported misses had in common:
  // "selected" carries an "-ed" that Hebrew writes as a bare ד, "life" ends in a silent "e" that
  // lengthens the vowel into a double yod rather than adding a letter of its own, and "sh" in
  // "fresh" is the single letter ש.
  for (const [input, expectedLabel] of [
    ["selected", "סלקטד"],
    ["life", "לייף"],
    ["fresh", "פרש"],
  ]) {
    const checker = createChecker([expectedLabel, "Unrelated"]);
    const result = checker.checkBrand(input);
    const candidate = result.candidates.find((entry) => entry.label === expectedLabel);

    assert.ok(candidate, `${input} should surface ${expectedLabel}`);
    assert.equal(candidate?.matchType, "TRANSLITERATION_EXACT", input);
    assert.equal(candidate?.crossLanguageSignals?.transliterationExact, true, input);
  }
});

test("a Hebrew name finds the Latin brand it was borrowed from", () => {
  // אופוריה spells "euphoria": the "eu" is carried by alef+vav and the "ph" is the single letter
  // פ, so neither reading falls out of transliterating the letters one at a time.
  const checker = createChecker(["EUPHORIA", "Unrelated"]);

  const result = checker.checkBrand("אופוריה");
  const candidate = result.candidates.find((entry) => entry.label === "EUPHORIA");

  assert.ok(candidate, "אופוריה should surface EUPHORIA");
  assert.equal(result.decision, "HUMAN_REVIEW");
});

test("an invented name does not match an unrelated brand in the other script", () => {
  // Expanding into both scripts makes almost any short name reachable from some spelling of
  // almost any other, so a pairing has to be credible as well as close: "Zenvora" must not reach
  // קנור (Knorr), and "Quorali" must not reach קרלי (Carly) on a speculative spelling.
  //
  // "Tervano" was once listed here against טרוונו, but that pairing is not the same kind of
  // thing: טרוונו is a catalogued brand and "Tervano" spells it letter for letter, so surfacing
  // it for review is the correct answer rather than the failure this test guards against.
  for (const [input, unrelatedLabel] of [
    ["Zenvora", "קנור"],
    ["Quorali", "קורס"],
    ["Quorali", "קרלי"],
  ]) {
    const checker = createChecker([unrelatedLabel]);
    const result = checker.checkBrand(input);

    assert.equal(
      result.candidates.some((entry) => entry.label === unrelatedLabel),
      false,
      `${input} should not surface ${unrelatedLabel}`,
    );
  }
});
