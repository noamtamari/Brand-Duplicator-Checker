import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { BrandDuplicateChecker, BrandIndex } from "./index.js";
import { fetchBrandCatalogue } from "./brand-catalogue-loader.js";
import { toReportRow } from "./brand-report.js";
import { formatSingleLine } from "./brand-result-formatter.js";
import type { BrandIndexCache } from "./brand-index-cache.js";
import type { BrandReportOutcome } from "./brand-report.js";
import type { Brand, BrandCheckResult } from "./types.js";

export interface BrandReviewItem {
  id: number;
  brand: string;
  outcome: BrandReportOutcome;
  candidates: Array<{ label: string; code: string; score: number }>;
  selected: boolean;
  result: BrandCheckResult;
}

export const BRAND_REVIEW_DISPLAY_SCORE_THRESHOLD = 0.75;

export function getReviewDisplayCandidates(
  result: BrandCheckResult,
  outcome: BrandReportOutcome,
): Array<{ label: string; code: string; score: number }> {
  if (outcome === "ALLOW") {
    return [];
  }

  return (result.displayCandidates ?? result.candidates)
    .filter((candidate) => candidate.score >= BRAND_REVIEW_DISPLAY_SCORE_THRESHOLD)
    .map((candidate) => ({
      label: formatSingleLine(candidate.label),
      code: formatSingleLine(candidate.code),
      score: candidate.score,
    }));
}

export interface BrandReviewBatch {
  catalogue: Brand[];
  items: BrandReviewItem[];
  timingsMs: {
    catalogueRetrievalAndParsing: number;
    indexConstruction: number;
    indexCacheSaving: number;
    duplicateChecking: number;
    resultFormatting: number;
  };
}

export function parseBrandList(contents: string): string[] {
  return (contents.startsWith("\uFEFF") ? contents.slice(1) : contents)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export async function loadBrandList(filePath: string): Promise<string[]> {
  return parseBrandList(await readFile(filePath, "utf8"));
}

export async function checkBrandList(
  contents: string,
  token: string | undefined,
  fetchImplementation?: typeof fetch,
  indexCache?: BrandIndexCache,
): Promise<BrandReviewBatch> {
  const names = parseBrandList(contents);
  const catalogueStartedAt = performance.now();
  const catalogue = await fetchBrandCatalogue(token, fetchImplementation);
  const catalogueRetrievalAndParsing = performance.now() - catalogueStartedAt;
  const indexStartedAt = performance.now();
  const checker = new BrandDuplicateChecker(new BrandIndex(catalogue, indexCache?.service));
  const indexConstruction = performance.now() - indexStartedAt;
  const saveStartedAt = performance.now();
  await indexCache?.save();
  const indexCacheSaving = performance.now() - saveStartedAt;
  let duplicateChecking = 0;
  let resultFormatting = 0;
  const items = names.map((brand, id) => {
    const checkStartedAt = performance.now();
    const result = checker.checkBrand(brand);
    duplicateChecking += performance.now() - checkStartedAt;
    const formattingStartedAt = performance.now();
    const report = toReportRow(result);
    const candidates = getReviewDisplayCandidates(result, report.outcome);

    const item = {
      id,
      brand: report.brand,
      outcome: report.outcome,
      candidates,
      selected: report.outcome === "ALLOW",
      result,
    };
    resultFormatting += performance.now() - formattingStartedAt;
    return item;
  });

  return {
    catalogue,
    items,
    timingsMs: {
      catalogueRetrievalAndParsing,
      indexConstruction,
      indexCacheSaving,
      duplicateChecking,
      resultFormatting,
    },
  };
}