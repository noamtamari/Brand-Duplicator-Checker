import { MAX_DISPLAYED_CANDIDATES, formatSingleLine } from "./brand-result-formatter.js";
import type { BrandCheckResult, BrandDecision } from "./types.js";

/**
 * What the person running the checker acts on. The engine's three-state decision collapses to two:
 * a BLOCK and a HUMAN_REVIEW both end with someone comparing the name against existing brands, so
 * the report shows them the same way and lets the candidate list carry the difference.
 */
export type BrandReportOutcome = "ALLOW" | "REVIEW";

export interface BrandReportCandidate {
  label: string;
  code: string;
}

export interface BrandReportRow {
  /** The name as it was given, before normalization. */
  brand: string;
  outcome: BrandReportOutcome;
  /** Existing brands to compare against. Always empty on ALLOW. */
  candidates: BrandReportCandidate[];
}

export interface BrandReportTiming {
  /** Catalogue retrieval/parsing plus in-memory index construction. */
  buildMs: number;
  /** Time spent checking names, summed over every name. Waiting for typed input is not included. */
  checkMs: number;
  /** Wall-clock time immediately before writing the text and CSV reports. */
  totalMs: number;
}

const CSV_HEADER = ["brand", "result", "candidates"];

export function toReportOutcome(decision: BrandDecision): BrandReportOutcome {
  switch (decision) {
    case "ALLOW":
      return "ALLOW";
    case "BLOCK":
    case "HUMAN_REVIEW":
      return "REVIEW";
    default: {
      // A new BrandDecision value must be mapped deliberately rather than defaulting to REVIEW.
      const unhandled: never = decision;
      throw new Error(`Unhandled brand decision: ${String(unhandled)}`);
    }
  }
}

export function toReportRow(result: BrandCheckResult): BrandReportRow {
  const outcome = toReportOutcome(result.decision);

  return {
    brand: formatSingleLine(result.input),
    outcome,
    // ALLOW means nothing came close enough to be worth comparing, so any weak near-misses the
    // scorer kept are noise here.
    candidates:
      outcome === "ALLOW"
        ? []
        : result.candidates.slice(0, MAX_DISPLAYED_CANDIDATES).map((candidate) => ({
            label: formatSingleLine(candidate.label),
            code: formatSingleLine(candidate.code),
          })),
  };
}

function formatTimestamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatRowBlock(row: BrandReportRow, index: number): string {
  const lines = [`[${index + 1}] ${row.brand}`, `    Result: ${row.outcome}`];

  if (row.outcome === "REVIEW") {
    lines.push("    Existing brands to compare:");
    lines.push(
      ...(row.candidates.length > 0
        ? row.candidates.map((candidate) => `      - ${candidate.label} (${candidate.code})`)
        : ["      (none)"]),
    );
  }

  return lines.join("\n");
}

/**
 * Rounded to what the reader can act on: a tenth of a second while the run is short enough to sit
 * and watch, whole seconds once it is not.
 */
function formatDuration(elapsedMs: number): string {
  const safeMs = Math.max(0, elapsedMs);
  const totalSeconds = Math.round(safeMs / 1000);

  if (totalSeconds < 60) {
    return `${(safeMs / 1000).toFixed(1)}s`;
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return hours > 0 ? `${hours}h ${minutes}m ${seconds}s` : `${minutes}m ${seconds}s`;
}

export function formatBrandReportText(
  rows: readonly BrandReportRow[],
  generatedAt: Date,
  /** How long the run took. Omitted when the caller did not measure it. */
  timing?: BrandReportTiming,
): string {
  const allowed = rows.filter((row) => row.outcome === "ALLOW").length;
  const tally = [`${rows.length} checked`, `${allowed} ALLOW`, `${rows.length - allowed} REVIEW`];

  if (timing !== undefined) {
    tally.push(
      `${formatDuration(timing.totalMs)} ` +
        `(build ${formatDuration(timing.buildMs)}, check ${formatDuration(timing.checkMs)})`,
    );
  }

  const sections = [
    [`Brand check results - ${formatTimestamp(generatedAt)}`, tally.join(" | ")].join("\n"),
    ...rows.map(formatRowBlock),
  ];

  return `${sections.join("\n\n")}\n`;
}

function escapeCsvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function formatCsvCandidates(row: BrandReportRow): string {
  return row.candidates.map((candidate) => `${candidate.label} (${candidate.code})`).join("; ");
}

export function formatBrandReportCsv(rows: readonly BrandReportRow[]): string {
  const lines = [
    CSV_HEADER.map(escapeCsvField).join(","),
    ...rows.map((row) =>
      [row.brand, row.outcome, formatCsvCandidates(row)].map(escapeCsvField).join(","),
    ),
  ];

  // Excel on Windows is the consumer, and it expects CRLF.
  return `${lines.join("\r\n")}\r\n`;
}
