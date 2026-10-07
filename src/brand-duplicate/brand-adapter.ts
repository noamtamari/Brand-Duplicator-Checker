import type { Brand, BrandTranslation } from "./types.js";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readTranslations(value: unknown): BrandTranslation[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const translations = value.flatMap((item): BrandTranslation[] => {
    if (!isRecord(item) || typeof item.locale !== "string" || typeof item.value !== "string") {
      return [];
    }

    return [{ locale: item.locale, value: item.value }];
  });

  return translations.length > 0 ? translations : undefined;
}

function readBrand(value: unknown): Brand | undefined {
  if (!isRecord(value) || typeof value.code !== "string" || typeof value.label !== "string") {
    return undefined;
  }

  const translations = readTranslations(value.label_translations);
  return translations ? { code: value.code, label: value.label, translations } : { code: value.code, label: value.label };
}

export function parseBrandResponse(payload: unknown): Brand[] {
  if (!isRecord(payload) || !Array.isArray(payload.values_lists)) {
    return [];
  }

  return payload.values_lists.flatMap((valueList) => {
    if (!isRecord(valueList) || !Array.isArray(valueList.values)) {
      return [];
    }

    return valueList.values.flatMap((value) => {
      const brand = readBrand(value);
      return brand ? [brand] : [];
    });
  });
}