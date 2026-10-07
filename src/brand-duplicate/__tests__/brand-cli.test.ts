import assert from "node:assert/strict";
import test from "node:test";
import { formatBrandCheckResult } from "../brand-result-formatter.js";
import type { BrandCheckResult } from "../types.js";

test("formats a detailed human-readable brand check summary", () => {
  const result: BrandCheckResult = {
    input: "Addidas",
    normalizedInput: "addidas",
    decision: "HUMAN_REVIEW",
    confidence: 0.876,
    candidates: [
      {
        code: "b_adidas",
        label: "Adidas",
        score: 0.91,
        reason: "Possible typo",
        matchType: "POSSIBLE_TYPO",
      },
    ],
  };

  const output = formatBrandCheckResult(result);

  assert.match(output, /Brand check/);
  assert.match(output, /Input: Addidas/);
  assert.match(output, /Normalized: addidas/);
  assert.match(output, /Decision: HUMAN_REVIEW/);
  assert.match(output, /Confidence: 88%/);
  assert.match(output, /1\. Adidas \(b_adidas\)/);
  assert.match(output, /Score: 91% \| Match: POSSIBLE_TYPO/);
});

test("limits candidates and handles missing optional result fields", () => {
  const result: BrandCheckResult = {
    input: "Unknown",
    normalizedInput: "unknown",
    decision: "ALLOW",
    confidence: 0,
    candidates: Array.from({ length: 6 }, (_, index) => ({
      code: `b_${index}`,
      label: `Brand ${index}`,
      score: index / 10,
      reason: "No strong match",
      matchType: "WEAK_SIMILARITY" as const,
    })),
  };

  const output = formatBrandCheckResult(result);

  assert.match(output, /Confidence: 0%/);
  assert.match(output, /5\. Brand 4 \(b_4\)/);
  assert.doesNotMatch(output, /Brand 5 \(b_5\)/);
});

test("shows when no candidates are available and does not mutate the result", () => {
  const result: BrandCheckResult = {
    input: "New Brand",
    normalizedInput: "new brand",
    decision: "ALLOW",
    confidence: 1,
    candidates: [],
  };
  const original = structuredClone(result);

  const output = formatBrandCheckResult(result);

  assert.match(output, /Candidates:\n    \(none\)/);
  assert.deepEqual(result, original);
});