import { dirname, resolve } from "node:path";
import { basename } from "node:path";
import { existsSync } from "node:fs";
import { readdir, unlink, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { isSea } from "node:sea";
import dotenv from "dotenv";
import { loadBrandList, checkBrandList } from "./brand-review-service.js";
import { openBrandIndexCache } from "./brand-index-cache.js";
import { defaultOpenBrowser, loadReviewHtml, startBrandReviewServer } from "./brand-review-server.js";

const TIMING_FILE_PATTERN = /^brand-review-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.timing\.json$/u;

function getApplicationRoot(): string {
  if (isSea()) {
    return dirname(process.execPath);
  }

  const entryDirectory = dirname(process.argv[1]!);
  const candidates = [resolve(entryDirectory, "../.."), resolve(entryDirectory, "..")];
  return candidates.find((candidate) => existsSync(resolve(candidate, "brandList.txt"))) ?? candidates[0];
}

export async function runBrandReview(): Promise<void> {
  const runStartedAt = performance.now();
  const generatedAt = new Date();
  const rootDirectory = getApplicationRoot();
  dotenv.config({ path: resolve(rootDirectory, ".env"), quiet: true });

  const brandListStartedAt = performance.now();
  const names = await loadBrandList(resolve(rootDirectory, "brandList.txt"));
  const brandListLoadingMs = performance.now() - brandListStartedAt;
  if (names.length === 0) {
    throw new Error("brandList.txt contains no brand names.");
  }
  const cacheStartedAt = performance.now();
  const indexCache = await openBrandIndexCache(rootDirectory, "review");
  const cacheLoadingMs = performance.now() - cacheStartedAt;
  const batch = await checkBrandList(names.join("\n"), process.env.BRAND_API_TOKEN, undefined, indexCache);
  const htmlLoadingStartedAt = performance.now();
  const html = await loadReviewHtml(process.argv[1]!);
  const htmlLoadingMs = performance.now() - htmlLoadingStartedAt;
  let reviewSessionStartedAt = performance.now();
  let timingWritten = false;
  const writeTiming = async (outcome: "exported" | "closed", exportCreationMs: number | null): Promise<void> => {
    if (timingWritten) return;
    timingWritten = true;
    const timingPath = resolve(
      rootDirectory,
      `brand-review-${generatedAt.toISOString().replace(/[:.]/gu, "-")}.timing.json`,
    );
    const reviewSessionMs = performance.now() - reviewSessionStartedAt;
    const timing = {
      generatedAt: generatedAt.toISOString(),
      outcome,
      counts: { catalogueBrands: batch.catalogue.length, namesChecked: batch.items.length },
      timingsMs: {
        brandListLoading: {
          durationMs: brandListLoadingMs,
          description: "Time to read and parse brandList.txt.",
        },
        catalogueRetrievalAndParsing: {
          durationMs: batch.timingsMs.catalogueRetrievalAndParsing,
          description: "Time for the catalogue API request and parsing its response into brand records.",
        },
        indexConstruction: {
          durationMs: batch.timingsMs.indexConstruction,
          description: "Time to build the in-memory search index from the catalogue brands.",
        },
        indexCacheLoading: {
          durationMs: cacheLoadingMs,
          description: "Time to fingerprint the running code and load cached indexed transliterations.",
        },
        indexCacheHits: indexCache.hits,
        indexCacheSaving: {
          durationMs: batch.timingsMs.indexCacheSaving,
          description: "Time to persist indexed Hebrew transliterations for the next run.",
        },
        duplicateChecking: {
          durationMs: batch.timingsMs.duplicateChecking,
          description: "Sum of the time spent checking each input name for duplicates.",
        },
        resultFormatting: {
          durationMs: batch.timingsMs.resultFormatting,
          description: "Sum of the time spent shaping check results for the review interface.",
        },
        reviewUiLoading: {
          durationMs: htmlLoadingMs,
          description: "Time to load the review interface HTML into memory.",
        },
        reviewServerStartup: {
          durationMs: Math.max(0, reviewSessionStartedAt - serverStartupStartedAt),
          description: "Time to start the local review server and make it ready for the browser.",
        },
        reviewReady: {
          durationMs: reviewSessionStartedAt - runStartedAt,
          description: "Time from application initialization until the review server is ready, excluding executable startup.",
        },
        reviewSession: {
          durationMs: reviewSessionMs,
          description: "Time from opening the review page until export completes or the app closes.",
        },
        exportCreation: {
          durationMs: exportCreationMs,
          description: exportCreationMs === null
            ? "Not measured because the app closed without exporting."
            : "Time to create and write the selected brand and relation CSV files.",
        },
        total: {
          durationMs: performance.now() - runStartedAt,
          description: "Total elapsed time, including the browser review session, but excluding executable startup and timing-file writing.",
        },
      },
      note: "Total includes time spent reviewing in the browser; executable startup and timing-file writing are excluded.",
    };
    try {
      await writeFile(timingPath, `${JSON.stringify(timing, null, 2)}\n`, "utf8");
      const timingFiles = await readdir(rootDirectory);
      await Promise.all(
        timingFiles
          .filter((fileName) => fileName !== basename(timingPath) && TIMING_FILE_PATTERN.test(fileName))
          .map((fileName) => unlink(resolve(rootDirectory, fileName))),
      );
      process.stderr.write(`Wrote ${timingPath}\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Could not write timing file ${timingPath}: ${message}\n`);
    }
  };
  const serverStartupStartedAt = performance.now();
  const app = await startBrandReviewServer({
    rootDirectory,
    html,
    batch,
    openBrowser: defaultOpenBrowser,
    onExportComplete: async (exportCreationMs) => {
      await writeTiming("exported", exportCreationMs);
      process.exit(0);
    },
  });

  reviewSessionStartedAt = performance.now();
  process.stderr.write(`Brand review opened at ${app.url}\n`);
  let closing = false;
  const close = (): void => {
    if (closing) return;
    closing = true;
    void app.close()
      .then(() => writeTiming("closed", null))
      .finally(() => process.exit(0));
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}

const isMain = isSea() || ["brand-review-entry.js", "brand-review-dev.cjs"].includes(basename(process.argv[1] ?? ""));

if (isMain) {
  runBrandReview().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Brand review failed: ${message}\n`);
    process.exitCode = 1;
  });
}