import type { NormalizedBrandName } from "./types.js";

const apostrophePattern = /['\u2018\u2019\u201A\u201B\u2032\u2035`\u05F3]/gu;
const quotationMarkPattern = /[\u201C\u201D\u201E\u201F\u2033\u2036\u05F4]/gu;
const separatorPattern = /[-\u058A\u05BE\u2010-\u2015\u2212_\uFE58\uFE63\uFF0D]+/gu;
// "A & R" and "AR" are the same brand written two ways, so an ampersand joins tokens the same
// way a hyphen does rather than surviving into the compact form.
const ampersandPattern = /[&＆]+/gu;
const safePunctuationPattern = /[.,;:!?()\[\]{}\/\\]+/gu;
const whitespacePattern = /[\s\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]+/gu;
const invisibleFormattingPattern = /[\u061C\u200B\u200C\u200D\u200E\u200F\uFEFF]/gu;

export function normalizeBrandName(name: string | null | undefined): string {
  return normalizeBrandNameParts(name).normalizedText;
}

export function normalizeBrandNameParts(
  name: string | null | undefined,
): NormalizedBrandName {
  if (typeof name !== "string") {
    return { normalizedText: "", compactText: "" };
  }

  const normalizedText = name
    .normalize("NFKC")
    .replace(invisibleFormattingPattern, "")
    .replace(apostrophePattern, "'")
    .replace(quotationMarkPattern, '"')
    .replace(separatorPattern, " ")
    .replace(ampersandPattern, " ")
    .replace(safePunctuationPattern, " ")
    .replace(whitespacePattern, " ")
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .trim();

  return {
    normalizedText,
    compactText: normalizedText.replace(/\s+/gu, ""),
  };
}