import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseBrandResponse } from "../../brand-adapter.js";
import { BrandDuplicateChecker } from "../../brand-duplicate-checker.js";
import { BrandIndex } from "../../brand-index.js";
import { CandidateGenerator } from "../../candidate-generator.js";
import { DEFAULT_BRAND_MATCHING_CONFIG } from "../../brand-matching-config.js";
import { StringSimilarityService } from "../../string-similarity.js";
import type { Brand } from "../../types.js";

function createChecker(labels: string[], config = DEFAULT_BRAND_MATCHING_CONFIG): BrandDuplicateChecker {
  return new BrandDuplicateChecker(
    new BrandIndex(labels.map((label, index) => ({ code: `b_${index}`, label }))),
    config,
  );
}

function strongestCandidate(checker: BrandDuplicateChecker, input: string) {
  const result = checker.checkBrand(input);
  const candidate = result.candidates[0];
  assert.ok(candidate, `Expected a candidate for ${input}`);
  return { result, candidate };
}

test("combines edit, n-gram, token, length, and prefix signals", () => {
  const comparison = new StringSimilarityService().compare("addidas", "adidas");

  assert.equal(comparison.editDistance, 1);
  assert.ok(comparison.editSimilarity > 0.8);
  assert.ok(comparison.characterNgramSimilarity > 0.8);
  assert.ok(comparison.tokenSimilarity > 0.8);
  assert.equal(comparison.lengthDifference, 1);
  assert.equal(comparison.isPrefixVariant, false);
  assert.ok(comparison.score > 0.8);
});

test("detects one missing, extra, and replaced character as typo candidates", () => {
  const checker = createChecker(["ADIDAS"]);

  for (const input of ["ADIDA", "ADDIDAS", "ADIDAZ"]) {
    const { candidate } = strongestCandidate(checker, input);
    assert.equal(candidate.label, "ADIDAS");
    assert.ok(candidate.signals?.editDistance === 1);
    assert.ok(candidate.score > 0.8);
    assert.ok(["HIGH_FUZZY", "POSSIBLE_TYPO"].includes(candidate.matchType));
  }
});

test("detects transposed and repeated characters", () => {
  const checker = createChecker(["ADIDAS", "LACOSTE"]);

  const transposed = strongestCandidate(checker, "AIDdas");
  assert.equal(transposed.candidate.label, "ADIDAS");
  assert.equal(transposed.candidate.signals?.editDistance, 1);
  assert.equal(transposed.result.decision, "HUMAN_REVIEW");

  const repeated = strongestCandidate(checker, "LACCOSTE");
  assert.equal(repeated.candidate.label, "LACOSTE");
  assert.equal(repeated.candidate.signals?.editDistance, 1);
  assert.equal(repeated.result.decision, "BLOCK");
});

test("keeps formatting changes deterministic and does not spend fuzzy budget", () => {
  const checker = createChecker(["TP LINK", "L'Oreal"]);

  const spacing = checker.checkBrand("TP  LINK");
  assert.equal(spacing.decision, "BLOCK");
  assert.equal(spacing.candidates[0]?.matchType, "NORMALIZED_EXACT");

  const punctuation = checker.checkBrand("L’Oreal");
  assert.equal(punctuation.decision, "BLOCK");
  assert.equal(punctuation.candidates[0]?.matchType, "NORMALIZED_EXACT");
});

test("returns review for a one-token typo that is not long enough to block safely", () => {
  const { result, candidate } = strongestCandidate(createChecker(["ADIDAS"]), "Adida");

  assert.equal(result.decision, "HUMAN_REVIEW");
  assert.equal(candidate.matchType, "HIGH_FUZZY");
  assert.equal(candidate.signals?.editDistance, 1);
});

test("blocks a sufficiently distinctive one-edit typo", () => {
  const { result, candidate } = strongestCandidate(createChecker(["ADIDAS"]), "Addidas");

  assert.equal(result.decision, "BLOCK");
  assert.equal(candidate.matchType, "HIGH_FUZZY");
  assert.equal(candidate.signals?.editDistance, 1);
  assert.match(candidate.reason, /One-character/);
});

test("returns a strong candidate for Advill without treating fuzzy similarity as certainty", () => {
  const { result, candidate } = strongestCandidate(createChecker(["ADVIL"]), "Advill");

  assert.equal(result.decision, "HUMAN_REVIEW");
  assert.equal(candidate.label, "ADVIL");
  assert.equal(candidate.matchType, "HIGH_FUZZY");
  assert.ok(candidate.score > 0.8);
});

test("classifies token-prefix names as related, and allows a name that extends a brand", () => {
  const checker = createChecker(["DIOR", "KENZO"]);

  const dior = strongestCandidate(checker, "Dior Homme");
  assert.equal(dior.result.decision, "ALLOW");
  assert.equal(dior.candidate.label, "DIOR");
  assert.equal(dior.candidate.matchType, "RELATED_NAME");
  assert.equal(dior.candidate.partialMatch, true);
  assert.match(dior.candidate.reason, /token prefix/);

  const kenzo = strongestCandidate(checker, "Kenzo Jeu d Amour");
  assert.equal(kenzo.result.decision, "ALLOW");
  assert.equal(kenzo.candidate.label, "KENZO");
  assert.equal(kenzo.candidate.matchType, "RELATED_NAME");

  // The other way round, the proposed name may be the brand written shorter.
  assert.equal(createChecker(["DIOR HOMME"]).checkBrand("Dior").decision, "HUMAN_REVIEW");
});

test("does not block different brands with similar prefixes or important tokens", () => {
  const checker = createChecker(["DIOR", "DIOR HOMME", "KENZO", "POLO", "POLO BLUE"]);

  // Each shares a word with a brand and differs entirely in the other: a different name.
  assert.equal(checker.checkBrand("Dior Sport").decision, "ALLOW");
  assert.equal(checker.checkBrand("Kenzo Homme").decision, "ALLOW");
  assert.equal(checker.checkBrand("Polo Red").decision, "ALLOW");
  assert.equal(checker.checkBrand("Diorian").decision, "ALLOW");
  // A typo in one word of a multi-word brand is still the same name.
  assert.notEqual(checker.checkBrand("Polo Bleu").decision, "ALLOW");
});

test("applies stricter fuzzy policy to short names", () => {
  const checker = createChecker(["BE", "NF", "HP", "SK", "AQ"]);

  for (const input of ["BF", "NE", "HQ", "SL", "AR"]) {
    const result = checker.checkBrand(input);
    assert.notEqual(result.decision, "BLOCK");
  }
  assert.equal(checker.checkBrand("BE").decision, "BLOCK");
});

test("limits results to the configured strongest candidates", () => {
  const config = { ...DEFAULT_BRAND_MATCHING_CONFIG, maxCandidates: 2 };
  const result = createChecker(
    ["ADIDAS", "ADIDAS PRO", "ADIDAS ORIGINALS", "ADIDAS SPORT", "ADVIL", "ADIOS"],
    config,
  ).checkBrand("ADIDA");

  assert.equal(result.candidates.length, 2);
  assert.ok(result.candidates[0].score >= result.candidates[1].score);
  assert.ok((result.displayCandidates?.length ?? 0) > result.candidates.length);
  assert.equal(result.decision, "HUMAN_REVIEW");
});

test("preserves all brands sharing a normalized value", () => {
  const checker = createChecker(["VERSACE", "Versace", "VERSACE"]);
  const result = checker.checkBrand("versace");

  assert.equal(result.decision, "BLOCK");
  assert.deepEqual(result.candidates.map((candidate) => candidate.code), ["b_0", "b_1", "b_2"]);
});

test("generates candidates from indexed retrieval rather than requiring a full scan API", () => {
  const index = new BrandIndex([
    { code: "b_adidas", label: "ADIDAS" },
    { code: "b_advil", label: "ADVIL" },
    { code: "b_unrelated", label: "ZEPHYR" },
  ]);
  const candidates = new CandidateGenerator(index).generate("Addidas");

  assert.equal(candidates[0]?.label, "ADIDAS");
  assert.ok(candidates.length <= DEFAULT_BRAND_MATCHING_CONFIG.maxCandidates);
});

test("keeps repeated checks practical against the supplied dataset", async () => {
  const responsePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../response.json");
  const response = JSON.parse(await readFile(responsePath, "utf8")) as unknown;
  const brands = parseBrandResponse(response);
  const checker = new BrandDuplicateChecker(new BrandIndex(brands));
  const start = performance.now();
  const result = checker.checkBrand("l’eau par kenzo");
  const elapsedMilliseconds = performance.now() - start;

  assert.equal(result.decision, "BLOCK");
  assert.ok(elapsedMilliseconds < 1000, `Expected an indexed check under 1s, got ${elapsedMilliseconds}ms`);
});

test("retains the public result contract for an unrelated name", () => {
  const result = createChecker(["ADIDAS"]).checkBrand("ORANGE");

  assert.equal(result.input, "ORANGE");
  assert.equal(result.normalizedInput, "orange");
  assert.equal(result.decision, "ALLOW");
  assert.ok(result.confidence > 0);
  assert.ok(result.candidates.every((candidate) => candidate.code && candidate.label && candidate.reason));
});