import type { BrandCandidate, BrandCheckResult } from "./types.js";

export const MAX_DISPLAYED_CANDIDATES = 5;

function formatPercentage(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function formatSingleLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ");
}

function formatCandidate(candidate: BrandCandidate, index: number): string {
  return [
    `  ${index + 1}. ${formatSingleLine(candidate.label)} (${formatSingleLine(candidate.code)})`,
    `     Score: ${formatPercentage(candidate.score)} | Match: ${candidate.matchType}`,
    `     Reason: ${formatSingleLine(candidate.reason)}`,
  ].join("\n");
}

export function formatBrandCheckResult(result: BrandCheckResult): string {
  const displayedCandidates = result.candidates
    .slice(0, MAX_DISPLAYED_CANDIDATES)
    .map(formatCandidate);

  const lines = [
    "Brand check",
    `  Input: ${formatSingleLine(result.input)}`,
    `  Normalized: ${formatSingleLine(result.normalizedInput)}`,
    `  Decision: ${result.decision}`,
    // On ALLOW the figure is headroom under the match threshold, not a probability: a small
    // number means the decision was close, so labelling it "confidence" would invert its meaning.
    result.decision === "ALLOW"
      ? `  Margin below a match: ${formatPercentage(result.confidence)}`
      : `  Confidence: ${formatPercentage(result.confidence)}`,
  ];

  if (result.decision === "HUMAN_REVIEW") {
    lines.push("  Action: a person must confirm or reject this name.");
  }

  lines.push("  Candidates:");
  lines.push(...(displayedCandidates.length > 0 ? displayedCandidates : ["    (none)"]));

  return `${lines.join("\n")}\n`;
}