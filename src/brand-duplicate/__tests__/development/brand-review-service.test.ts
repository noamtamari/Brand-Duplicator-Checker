import assert from "node:assert/strict";
import test from "node:test";
import { checkBrandList, getReviewDisplayCandidates, parseBrandList } from "../../brand-review-service.js";
import type { BrandCheckResult } from "../../types.js";

const cataloguePayload = {
  values_lists: [{ values: [
    { code: "b_1mp", label: "Adidas" },
    { code: "b_3mp", label: "אדידס" },
  ] }],
};

test("parses UTF-8 lists with a BOM while preserving duplicate rows", () => {
  assert.deepEqual(parseBrandList("\uFEFF  Adidas \r\n\r\nאדידס\nAdidas\n "), [
    "Adidas",
    "אדידס",
    "Adidas",
  ]);
});

test("checks a batch against one fetched catalogue and defaults only ALLOW on", async () => {
  let fetchCount = 0;
  const fetchStub: typeof fetch = async () => {
    fetchCount += 1;
    return new Response(JSON.stringify(cataloguePayload), { status: 200 });
  };

  const batch = await checkBrandList("\uFEFFAdidas\nOrvexa\nAdidas", "token", fetchStub);

  assert.equal(fetchCount, 1);
  assert.deepEqual(batch.items.map((item) => item.id), [0, 1, 2]);
  assert.deepEqual(batch.items.map((item) => item.brand), ["Adidas", "Orvexa", "Adidas"]);
  assert.deepEqual(batch.items.map((item) => item.selected), batch.items.map((item) => item.outcome === "ALLOW"));
  assert.deepEqual(Object.keys(batch.timingsMs), [
    "catalogueRetrievalAndParsing",
    "indexConstruction",
    "indexCacheSaving",
    "duplicateChecking",
    "resultFormatting",
  ]);
  assert.ok(Object.values(batch.timingsMs).every((duration) => duration >= 0));
});

test("filters display candidates inclusively at the review display threshold only", () => {
  const result: BrandCheckResult = {
    input: "Example",
    normalizedInput: "example",
    decision: "HUMAN_REVIEW",
    confidence: 0.7,
    candidates: [],
    displayCandidates: [
      { code: "b_above", label: "Above", score: 0.8, reason: "test", matchType: "HIGH_FUZZY" },
      { code: "b_edge", label: "Edge", score: 0.75, reason: "test", matchType: "HIGH_FUZZY" },
      { code: "b_below", label: "Below", score: 0.749, reason: "test", matchType: "HIGH_FUZZY" },
    ],
  };

  assert.deepEqual(getReviewDisplayCandidates(result, "REVIEW").map((candidate) => candidate.code), [
    "b_above",
    "b_edge",
  ]);
  assert.deepEqual(getReviewDisplayCandidates(result, "ALLOW"), []);
});