import type { BrandScript } from "./types.js";

const hebrewPattern = /[\u0590-\u05FF]/u;
const latinPattern = /[A-Za-z\u00C0-\u024F]/u;
const numberOrSymbolPattern = /[^\s]/u;

export function detectScript(value: string | null | undefined): BrandScript {
  if (typeof value !== "string" || value.trim() === "") {
    return "OTHER";
  }

  const hasHebrew = hebrewPattern.test(value);
  const hasLatin = latinPattern.test(value);
  if (hasHebrew && hasLatin) {
    return "MIXED";
  }
  if (hasHebrew) {
    return "HEBREW";
  }
  if (hasLatin) {
    return "LATIN";
  }
  return numberOrSymbolPattern.test(value) ? "NUMERIC_OR_SYMBOL" : "OTHER";
}