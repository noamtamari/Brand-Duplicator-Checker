import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { performance } from "node:perf_hooks";
import dotenv from "dotenv";
import {
  BrandDuplicateChecker,
  BrandIndex,
} from "./index.js";
import { fetchBrandCatalogue } from "./brand-catalogue-loader.js";
import { BRAND_CLI_USAGE, parseBrandCliArgs } from "./brand-cli-args.js";
import { formatBrandCheckResult } from "./brand-result-formatter.js";
import { openBrandIndexCache } from "./brand-index-cache.js";
import { formatBrandReportCsv, formatBrandReportText, toReportRow } from "./brand-report.js";
import type { BrandReportRow } from "./brand-report.js";

/**
 * Both reports are written with a BOM. Windows tools that predate UTF-8 defaults - Excel,
 * Notepad, PowerShell's Get-Content - otherwise read them in the system codepage and turn the
 * catalogue's Hebrew labels into mojibake.
 */
const UTF8_BOM = "\uFEFF";

interface BrandRunTiming {
  catalogueRetrievalAndParsingMs: number;
  indexConstructionMs: number;
  indexCacheLoadingMs: number;
  indexCacheSavingMs: number;
  indexCacheHits: number;
  inputLoadingMs: number;
  inputAndResultFormattingMs: number;
  duplicateCheckingMs: number;
}

function stripBom(value: string): string {
  return value.startsWith(UTF8_BOM) ? value.slice(1) : value;
}

function toLines(contents: string): string[] {
  return stripBom(contents)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function defaultOutBase(projectRoot: string, generatedAt: Date): string {
  const stamp = generatedAt.toISOString().slice(0, 19).replace(/[:]/g, "-");
  return path.join(projectRoot, "results", `brand-check-${stamp}`);
}

async function writeReport(
  outBase: string,
  rows: readonly BrandReportRow[],
  brandCount: number,
  generatedAt: Date,
  timing: BrandRunTiming,
  runStartedAt: number,
): Promise<void> {
  const textPath = `${outBase}.txt`;
  const csvPath = `${outBase}.csv`;
  const timingPath = `${outBase}.timing.json`;

  const reportWriteStartedAt = performance.now();
  await mkdir(path.dirname(outBase), { recursive: true });
  if (rows.length > 0) {
    await writeFile(
      textPath,
      `${UTF8_BOM}${formatBrandReportText(rows, generatedAt, {
        buildMs: timing.catalogueRetrievalAndParsingMs + timing.indexConstructionMs,
        checkMs: timing.duplicateCheckingMs,
        totalMs: performance.now() - runStartedAt,
      })}`,
      "utf8",
    );
    await writeFile(csvPath, `${UTF8_BOM}${formatBrandReportCsv(rows)}`, "utf8");
  }
  const resultReportWritingMs = performance.now() - reportWriteStartedAt;
  const totalMs = performance.now() - runStartedAt;

  await writeFile(
    timingPath,
    `${JSON.stringify(
      {
        generatedAt: generatedAt.toISOString(),
        counts: { catalogueBrands: brandCount, namesChecked: rows.length },
        timingsMs: {
          catalogueRetrievalAndParsing: timing.catalogueRetrievalAndParsingMs,
          indexConstruction: timing.indexConstructionMs,
          indexCacheLoading: timing.indexCacheLoadingMs,
          indexCacheSaving: timing.indexCacheSavingMs,
          indexCacheHits: timing.indexCacheHits,
          inputLoading: timing.inputLoadingMs,
          inputAndResultFormatting: timing.inputAndResultFormattingMs,
          duplicateChecking: timing.duplicateCheckingMs,
          resultReportWriting: resultReportWritingMs,
          total: totalMs,
        },
        note: "Total includes the text and CSV result reports, but excludes writing this timing file.",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  if (rows.length > 0) {
    process.stderr.write(`\nWrote ${path.resolve(textPath)}\n`);
    process.stderr.write(`Wrote ${path.resolve(csvPath)}\n`);
  } else {
    process.stderr.write("No brand names were given, so no result report was written.\n");
  }
  process.stderr.write(`Wrote ${path.resolve(timingPath)}\n`);
}

async function main(): Promise<void> {
  const runStartedAt = performance.now();
  // Parsed before the 3.7 MB catalogue is loaded so --help and a bad flag answer immediately.
  const args = parseBrandCliArgs(process.argv.slice(2));

  if (args.help) {
    process.stderr.write(`${BRAND_CLI_USAGE}\n`);
    return;
  }

  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  dotenv.config({ path: path.join(projectRoot, ".env"), quiet: true });
  const catalogueStartedAt = performance.now();
  const brands = await fetchBrandCatalogue(process.env.BRAND_API_TOKEN);
  const catalogueRetrievalAndParsingMs = performance.now() - catalogueStartedAt;

  // Arguments win over --input, and stdin is the fallback that keeps the interactive session.
  let names: Iterable<string> | AsyncIterable<string> = args.brands;
  let input: ReturnType<typeof createInterface> | undefined;
  let inputLoadingMs = 0;

  if (args.brands.length === 0) {
    if (args.inputPath) {
      const inputStartedAt = performance.now();
      names = toLines(await readFile(path.resolve(args.inputPath), "utf8"));
      inputLoadingMs = performance.now() - inputStartedAt;
    } else {
      input = createInterface({ input: process.stdin, crlfDelay: Infinity });
      names = input;
    }
  }

  const cacheStartedAt = performance.now();
  const indexCache = await openBrandIndexCache(projectRoot, "cli");
  const indexCacheLoadingMs = performance.now() - cacheStartedAt;
  const indexStartedAt = performance.now();
  const checker = new BrandDuplicateChecker(new BrandIndex(brands, indexCache.service));
  const indexConstructionMs = performance.now() - indexStartedAt;
  const cacheSaveStartedAt = performance.now();
  await indexCache.save();
  const indexCacheSavingMs = performance.now() - cacheSaveStartedAt;
  let checkMs = 0;
  const rows: BrandReportRow[] = [];
  const generatedAt = new Date();
  let closed = false;
  let interrupted = false;

  const close = (): void => {
    if (closed) {
      return;
    }
    closed = true;
    input?.close();
  };

  const handleInterrupt = (): void => {
    // Closing the readline interface ends the stdin loop; the flag ends the argument and file
    // loops, which have nothing to close.
    interrupted = true;
    close();
  };

  process.once("SIGINT", handleInterrupt);
  process.once("SIGTERM", handleInterrupt);

  const checkingLoopStartedAt = performance.now();
  try {
    for await (const name of names) {
      if (interrupted) {
        break;
      }

      if (name.trim().length === 0) {
        continue;
      }

      // Timed per name rather than across the loop, so time spent waiting for typed input in the
      // interactive mode does not count as checking.
      const checkStartedAt = performance.now();
      const result = checker.checkBrand(name);
      checkMs += performance.now() - checkStartedAt;
      // The per-brand detail goes to stderr; stdout stays empty so the command can be redirected
      // without the report file being duplicated into the pipe.
      process.stderr.write(formatBrandCheckResult(result));
      rows.push(toReportRow(result));
    }
  } finally {
    close();
    process.off("SIGINT", handleInterrupt);
    process.off("SIGTERM", handleInterrupt);
  }
  const checkingLoopMs = performance.now() - checkingLoopStartedAt;

  // Outside the loop's finally, so a Ctrl+C part way through a long batch still keeps its report.
  await writeReport(
    args.outBase ?? defaultOutBase(projectRoot, generatedAt),
    rows,
    brands.length,
    generatedAt,
    {
      catalogueRetrievalAndParsingMs,
      indexConstructionMs,
      indexCacheLoadingMs,
      indexCacheSavingMs,
      indexCacheHits: indexCache.hits,
      inputLoadingMs,
      inputAndResultFormattingMs: Math.max(0, checkingLoopMs - checkMs),
      duplicateCheckingMs: checkMs,
    },
    runStartedAt,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Brand checker failed: ${message}\n`);
  process.exitCode = 1;
});
