import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getAsset, isSea } from "node:sea";
import { normalizeBrandName } from "./brand-normalizer.js";

/**
 * Hand-verified Hebrew/Latin spellings of the same brand, and the Hebrew names of Latin letters,
 * read from data/phonetic-transliteration-rules.json. The file is kept as delivered so it can be
 * edited and replaced; everything the matcher needs is derived from it here.
 */
function loadRulesFile(): RulesFile {
  const contents = isSea()
    ? Buffer.from(getAsset("phonetic-transliteration-rules.json")).toString("utf8")
    : readFileSync(fileURLToPath(new URL("../../data/phonetic-transliteration-rules.json", import.meta.url)), "utf8");
  return JSON.parse(contents) as RulesFile;
}

interface OverrideRecord {
  latin: string;
  hebrew: string;
  latin_alternatives?: string[];
  hebrew_alternatives?: string[];
}

interface RulesFile {
  existing_project_brand_overrides?: OverrideRecord[];
  english_to_hebrew?: { latin_letter_names_for_acronyms?: Record<string, string> };
}

/**
 * Entries that must not act as curated brand spellings, keyed by their Latin form. A curated pair
 * blocks outright, which is right for a brand name and wrong for these:
 *
 * - generic words that many unrelated brands contain or are called (paris, sport, beauty);
 * - function words and single letters, whose Hebrew spelling stands for several words (או is both
 *   "o" and "or", סי is "c" and "sea");
 * - romanized Hebrew category words and catalogue placeholders (ילדים, מבוטל, הוצאה), which name a
 *   kind of product or a data-entry state rather than a brand.
 *
 * The file lists these after its brand names as a word lexicon. Real brands inside that lexicon
 * (Escada, Osem, Wissotzky, Elite, ...) are deliberately not listed here, so they stay curated.
 */
export const EXCLUDED_OVERRIDES: ReadonlySet<string> = new Set([
  // Generic words from the brand section.
  "baby", "beauty", "care", "hello", "kids", "life", "life time", "lifetime", "london", "new york",
  "paris", "pro", "sport",
  // Function words and letters.
  "and", "bi", "by", "c", "del", "dr", "for", "go", "in", "le", "lee", "n", "nu", "o", "on", "shel",
  "so", "t", "the", "u",
  // Generic English words.
  "active", "aqua", "aroma", "art", "bar", "be life", "ben", "big", "bio", "black", "blue", "cafe",
  "cat", "chocolate", "city", "clean", "clear", "color", "cool", "cosmetics", "cream", "dry",
  "easy", "energy", "essence", "eve", "first", "flex", "flower", "food", "formula", "free", "fresh",
  "garden", "gel", "glow", "gold", "green", "guard", "hair", "home", "hot", "intense", "israel",
  "israeli", "jerusalem", "lady", "light", "line", "love", "mark", "market", "max", "medical", "men",
  "mini", "miss", "mister", "moon", "mousse", "multi", "natural", "night", "perfect", "pharm",
  "pharma", "pink", "plaster", "plus", "pop", "pure", "red", "rose", "sense", "silver", "skin",
  "soft", "spa", "speed", "star", "style", "sun", "super", "sweet", "tea", "tel aviv", "time", "top",
  "touch", "true", "vit", "vita", "vitamin", "water", "white", "cellular", "gourmet", "waffle",
  // Romanized Hebrew category words and placeholders.
  "aher", "avizarim", "beit", "etz", "garbayim", "garbei", "hotsa'a", "hotsaat", "kef", "kishutei",
  "kria", "laor", "madrikhei", "makbil", "mamtakim", "mara", "mevutal", "mishkafayim", "mutsrei",
  "niyar", "rekah", "rihut", "rishonim", "sabon", "shemen", "sukariyot", "tahtonei", "tinokot",
  "tiv'i", "tiyulim", "tsa'atsuei", "tsipornaim", "ugiyot", "yekev", "yeladim", "yevu", "zayit",
]);

/**
 * The key a curated spelling is filed and looked up under. Apostrophes and geresh are dropped, so
 * גוצ׳י and גוצי, or L'OREAL and LOREAL, reach the same entry.
 */
export function toOverrideKey(value: string): string {
  return normalizeBrandName(value).replace(/'/gu, "");
}

/** A stored spelling in the form the index holds, plus its geresh-free form when it has one. */
function storedForms(value: string): string[] {
  const normalized = normalizeBrandName(value);
  if (!normalized) {
    return [];
  }
  const bare = normalized.replace(/'/gu, "");
  return bare === normalized ? [normalized] : [normalized, bare];
}

export interface BrandOverrides {
  /** Hebrew spelling (as an override key) to the Latin spellings of the same brand. */
  hebrewToLatin: ReadonlyMap<string, readonly string[]>;
  /** Latin spelling (as an override key) to the Hebrew spellings of the same brand. */
  latinToHebrew: ReadonlyMap<string, readonly string[]>;
  /** Uppercase Latin letter to how Hebrew writes its name: C -> סי. */
  letterNames: ReadonlyMap<string, string>;
  /** How many file entries were skipped as generic. */
  excludedCount: number;
}

function add(map: Map<string, string[]>, key: string, values: readonly string[]): void {
  if (!key) {
    return;
  }
  const current = map.get(key) ?? [];
  for (const value of values) {
    if (value && !current.includes(value)) {
      current.push(value);
    }
  }
  map.set(key, current);
}

export function buildBrandOverrides(rules: RulesFile): BrandOverrides {
  const hebrewToLatin = new Map<string, string[]>();
  const latinToHebrew = new Map<string, string[]>();
  let excludedCount = 0;

  for (const record of rules.existing_project_brand_overrides ?? []) {
    const latinSpellings = [record.latin, ...(record.latin_alternatives ?? [])];
    if (latinSpellings.some((latin) => EXCLUDED_OVERRIDES.has(normalizeBrandName(latin)))) {
      excludedCount += 1;
      continue;
    }
    const hebrewSpellings = [record.hebrew, ...(record.hebrew_alternatives ?? [])];
    const latinValues = latinSpellings.flatMap(storedForms);
    const hebrewValues = hebrewSpellings.flatMap(storedForms);
    for (const hebrew of hebrewSpellings) {
      add(hebrewToLatin, toOverrideKey(hebrew), latinValues);
    }
    for (const latin of latinSpellings) {
      add(latinToHebrew, toOverrideKey(latin), hebrewValues);
    }
  }

  const letterNames = new Map<string, string>();
  for (const [letter, name] of Object.entries(rules.english_to_hebrew?.latin_letter_names_for_acronyms ?? {})) {
    // Only the plain letters; keys such as Z_UK or H_ALT are regional alternatives.
    if (/^[A-Z]$/u.test(letter)) {
      letterNames.set(letter, normalizeBrandName(name));
    }
  }

  return { hebrewToLatin, latinToHebrew, letterNames, excludedCount };
}

let cached: BrandOverrides | undefined;

/** The overrides from the data file, read once per process. */
export function getBrandOverrides(): BrandOverrides {
  cached ??= buildBrandOverrides(loadRulesFile());
  return cached;
}
