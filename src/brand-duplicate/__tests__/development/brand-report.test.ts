import assert from "node:assert/strict";
import test from "node:test";
import {
  formatBrandReportCsv,
  formatBrandReportText,
  toReportOutcome,
  toReportRow,
} from "../../brand-report.js";
import type { BrandCheckResult } from "../../types.js";

const GENERATED_AT = new Date(2026, 8, 23, 14, 2);

function makeResult(overrides: Partial<BrandCheckResult> = {}): BrandCheckResult {
  return {
    input: "Addidas",
    normalizedInput: "addidas",
    decision: "HUMAN_REVIEW",
    confidence: 0.88,
    candidates: [
      {
        code: "b_3453",
        label: "Adidas",
        score: 0.91,
        reason: "Possible typo",
        matchType: "POSSIBLE_TYPO",
      },
    ],
    ...overrides,
  };
}

test("collapses the three engine decisions to two report outcomes", () => {
  assert.equal(toReportOutcome("ALLOW"), "ALLOW");
  assert.equal(toReportOutcome("BLOCK"), "REVIEW");
  assert.equal(toReportOutcome("HUMAN_REVIEW"), "REVIEW");
});

test("a REVIEW row keeps only the candidate label and code", () => {
  const row = toReportRow(makeResult());

  assert.equal(row.brand, "Addidas");
  assert.equal(row.outcome, "REVIEW");
  assert.deepEqual(row.candidates, [{ label: "Adidas", code: "b_3453" }]);
});

test("an ALLOW row drops weak near-misses", () => {
  const row = toReportRow(makeResult({ decision: "ALLOW", confidence: 0.4 }));

  assert.equal(row.outcome, "ALLOW");
  assert.deepEqual(row.candidates, []);
});

test("caps the candidate list at five", () => {
  const row = toReportRow(
    makeResult({
      decision: "BLOCK",
      candidates: Array.from({ length: 8 }, (_, index) => ({
        code: `b_${index}`,
        label: `Brand ${index}`,
        score: 0.9,
        reason: "Close match",
        matchType: "HIGH_FUZZY" as const,
      })),
    }),
  );

  assert.equal(row.candidates.length, 5);
  assert.equal(row.candidates[4]?.code, "b_4");
});

test("flattens labels that contain line breaks", () => {
  const row = toReportRow(
    makeResult({
      input: "Two\nLines",
      candidates: [
        {
          code: "b_1",
          label: "Brand\r\nName",
          score: 0.9,
          reason: "Close match",
          matchType: "HIGH_FUZZY",
        },
      ],
    }),
  );

  assert.equal(row.brand, "Two Lines");
  assert.equal(row.candidates[0]?.label, "Brand Name");
});

test("does not mutate the checked result", () => {
  const result = makeResult();
  const original = structuredClone(result);

  toReportRow(result);

  assert.deepEqual(result, original);
});

test("writes a readable report with a tally and no scoring detail", () => {
  const rows = [
    toReportRow(makeResult()),
    toReportRow(makeResult({ input: "Zyraphix", decision: "ALLOW", candidates: [] })),
  ];

  const output = formatBrandReportText(rows, GENERATED_AT);

  assert.match(output, /Brand check results - 2026-09-23 14:02/);
  assert.match(output, /2 checked \| 1 ALLOW \| 1 REVIEW/);
  assert.match(output, /\[1\] Addidas\n {4}Result: REVIEW/);
  assert.match(output, /Existing brands to compare:\n {6}- Adidas \(b_3453\)/);
  assert.match(output, /\[2\] Zyraphix\n {4}Result: ALLOW/);
  assert.doesNotMatch(output, /POSSIBLE_TYPO|91%|Possible typo/);
});

test("shows REVIEW with no candidates rather than an empty section", () => {
  const rows = [toReportRow(makeResult({ candidates: [] }))];

  assert.match(formatBrandReportText(rows, GENERATED_AT), /Existing brands to compare:\n {6}\(none\)/);
});

test("quotes every CSV field and escapes embedded quotes", () => {
  const rows = [
    toReportRow(
      makeResult({
        input: 'Ben & Jerry"s, Ltd',
        candidates: [
          {
            code: "b_77",
            label: 'Ben & Jerry"s',
            score: 0.9,
            reason: "Close match",
            matchType: "HIGH_FUZZY",
          },
          {
            code: "b_78",
            label: "Ben and Jerrys",
            score: 0.8,
            reason: "Close match",
            matchType: "HIGH_FUZZY",
          },
        ],
      }),
    ),
    toReportRow(makeResult({ input: "Zyraphix", decision: "ALLOW", candidates: [] })),
  ];

  const lines = formatBrandReportCsv(rows).split("\r\n");

  assert.equal(lines[0], '"brand","result","candidates"');
  assert.equal(
    lines[1],
    '"Ben & Jerry""s, Ltd","REVIEW","Ben & Jerry""s (b_77); Ben and Jerrys (b_78)"',
  );
  assert.equal(lines[2], '"Zyraphix","ALLOW",""');
  assert.equal(lines[3], "");
});

test("carries Hebrew labels through both formats", () => {
  const rows = [
    toReportRow(
      makeResult({
        input: "אדידס",
        candidates: [
          {
            code: "b_3453",
            label: "אדידס",
            score: 0.95,
            reason: "Transliteration",
            matchType: "TRANSLITERATION_EXACT",
          },
        ],
      }),
    ),
  ];

  assert.match(formatBrandReportText(rows, GENERATED_AT), /- אדידס \(b_3453\)/);
  assert.match(formatBrandReportCsv(rows), /"אדידס","REVIEW","אדידס \(b_3453\)"/);
});

test("adds the run duration, split into build and check time, when it was measured", () => {
  const rows = [toReportRow(makeResult())];

  assert.match(
    formatBrandReportText(rows, GENERATED_AT, { buildMs: 8_000, checkMs: 380, totalMs: 8_400 }),
    /1 checked \| 0 ALLOW \| 1 REVIEW \| 8\.4s \(build 8\.0s, check 0\.4s\)\n/,
  );
});

test("leaves the tally line alone when no duration was measured", () => {
  const output = formatBrandReportText([toReportRow(makeResult())], GENERATED_AT);

  assert.match(output, /1 checked \| 0 ALLOW \| 1 REVIEW\n/);
});

test("switches from tenths to whole seconds once the run passes a minute", () => {
  const rows = [toReportRow(makeResult())];
  const duration = (totalMs: number): string =>
    formatBrandReportText(rows, GENERATED_AT, { buildMs: 0, checkMs: 0, totalMs })
      .split("\n")[1]
      ?.split(" | ")[3]
      ?.split(" (")[0] ?? "";

  assert.equal(duration(0), "0.0s");
  assert.equal(duration(1_500), "1.5s");
  assert.equal(duration(59_400), "59.4s");
  assert.equal(duration(60_000), "1m 0s");
  assert.equal(duration(154_000), "2m 34s");
  assert.equal(duration(3_903_000), "1h 5m 3s");
});

test("reports a duration of zero rather than a negative one", () => {
  const rows = [toReportRow(makeResult())];

  assert.match(
    formatBrandReportText(rows, GENERATED_AT, { buildMs: -5, checkMs: -5, totalMs: -5 }),
    /REVIEW \| 0\.0s \(build 0\.0s, check 0\.0s\)/,
  );
});
