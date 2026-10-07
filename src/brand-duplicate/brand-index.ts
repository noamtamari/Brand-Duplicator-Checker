import { normalizeBrandNameParts } from "./brand-normalizer.js";
import { phoneticKeys, toPhoneticName, type PhoneticName } from "./cross-script-phonetic-matcher.js";
import { detectScript } from "./script-detection.js";
import {
  INDEX_VARIANT_BUDGET,
  INDEX_VARIANT_MAX_COST,
  TransliterationService,
  toConsonantSkeleton,
} from "./transliteration-service.js";
import type { Brand, BrandScript, TransliterationVariant } from "./types.js";

export interface BrandIndexEntry {
  brand: Brand;
  normalizedText: string;
  compactText: string;
  script: BrandScript;
  transliterationVariants: TransliterationVariant[];
  /** How the name sounds, computed once here so a check never re-derives it per candidate. */
  phonetic: PhoneticName;
}

/**
 * Shortest skeleton that earns a posting list. This is a retrieval floor, deliberately below the
 * `skeletonEvidenceMinimumLength` the decision engine applies: retrieval only decides what gets
 * scored, and a pooled entry still has to pass scoring and the credibility gates to be admitted.
 * Setting it at the engine's floor instead drops real pairs whose skeleton is short but exact —
 * מריל/Merrell reduce to "mrl" and רבלון/REVLON to "rln", and neither was ever pooled.
 * Measured against the catalogue, three-letter buckets stay small: 25 postings at the worst
 * ("spr"), a median of 1, so the recall is not bought with a large sweep.
 */
const SKELETON_INDEX_MINIMUM_LENGTH = 3;

function brandNames(brand: Brand): string[] {
  return [brand.label, ...(brand.translations ?? []).map((translation) => translation.value)];
}

function characterNgrams(value: string): string[] {
  if (value.length < 2) {
    return value ? [value] : [];
  }

  const ngrams = new Set<string>();
  for (let index = 0; index < value.length - 1; index += 1) {
    ngrams.add(value.slice(index, index + 2));
  }
  return [...ngrams];
}

export class BrandIndex {
  private readonly normalizedTextIndex = new Map<string, Brand[]>();
  private readonly compactTextIndex = new Map<string, Brand[]>();
  private readonly normalizedEntryIndex = new Map<string, BrandIndexEntry[]>();
  private readonly compactEntryIndex = new Map<string, BrandIndexEntry[]>();
  private readonly prefixIndex = new Map<string, BrandIndexEntry[]>();
  private readonly firstCharacterIndex = new Map<string, BrandIndexEntry[]>();
  private readonly ngramIndex = new Map<string, BrandIndexEntry[]>();
  private readonly transliterationIndex = new Map<string, BrandIndexEntry[]>();
  private readonly transliterationPrefixIndex = new Map<string, BrandIndexEntry[]>();
  private readonly transliterationNgramIndex = new Map<string, BrandIndexEntry[]>();
  /**
   * Entries keyed by the consonant skeleton of their romanization. Hebrew writes no short vowels,
   * so a romanized Hebrew name and its Latin original agree on consonants and almost never on the
   * full string: גרנייה romanizes to "grniih", never to "garnier". Exact, prefix and ngram keys all
   * compare written letters, so none of them can pair the two — the skeleton is the only key on
   * which they meet, and scoring already treats a shared skeleton as evidence.
   */
  private readonly transliterationSkeletonIndex = new Map<string, BrandIndexEntry[]>();
  /**
   * Entries filed by the consonant classes of their pronunciation, which is where a Hebrew name
   * and its Latin original meet when neither the letters nor the romanization line up: GARNIER
   * read as French and גרנייה both file under "GRN". Deletion keys hold each long key with one
   * consonant removed, so a name that writes one consonant fewer still meets it.
   */
  private readonly phoneticKeyIndex = new Map<string, BrandIndexEntry[]>();
  private readonly phoneticDeletionIndex = new Map<string, BrandIndexEntry[]>();
  private readonly entryKeys = new Set<string>();

  constructor(
    brands: readonly Brand[] = [],
    private readonly transliterationService = new TransliterationService(),
  ) {
    for (const brand of brands) {
      this.add(brand);
    }
  }

  add(brand: Brand): void {
    for (const name of brandNames(brand)) {
      const { normalizedText, compactText } = normalizeBrandNameParts(name);
      if (!normalizedText) {
        continue;
      }

      this.addToIndex(this.normalizedTextIndex, normalizedText, brand);
      this.addToIndex(this.compactTextIndex, compactText, brand);

      const entryKey = `${brand.code}\u0000${normalizedText}`;
      if (this.entryKeys.has(entryKey)) {
        continue;
      }

      const script = detectScript(name);
      const transliterationVariants = this.transliterationService.getLatinVariants(
        name,
        INDEX_VARIANT_BUDGET,
        INDEX_VARIANT_MAX_COST,
      );
      const phonetic = toPhoneticName(normalizedText);
      const entry: BrandIndexEntry = {
        brand,
        normalizedText,
        compactText,
        script,
        transliterationVariants,
        phonetic,
      };
      this.entryKeys.add(entryKey);
      this.addToEntryIndex(this.normalizedEntryIndex, normalizedText, entry);
      this.addToEntryIndex(this.compactEntryIndex, compactText, entry);

      const keys = phoneticKeys(phonetic);
      for (const key of keys.exact) {
        this.addToEntryIndex(this.phoneticKeyIndex, key, entry);
      }
      for (const key of keys.deletions) {
        this.addToEntryIndex(this.phoneticDeletionIndex, key, entry);
      }

      const prefix = compactText.slice(0, 2);
      if (prefix) {
        this.addToEntryIndex(this.prefixIndex, prefix, entry);
        this.addToEntryIndex(this.firstCharacterIndex, prefix[0], entry);
      }
      for (const ngram of characterNgrams(compactText)) {
        this.addToEntryIndex(this.ngramIndex, ngram, entry);
      }

      for (const variant of transliterationVariants) {
        const transliterationKey = this.transliterationService.toComparableLatin(variant.value);
        if (!transliterationKey) {
          continue;
        }
        this.addToEntryIndex(this.transliterationIndex, transliterationKey, entry);
        this.addToEntryIndex(this.transliterationPrefixIndex, transliterationKey.slice(0, 2), entry);
        for (const ngram of characterNgrams(transliterationKey)) {
          this.addToEntryIndex(this.transliterationNgramIndex, ngram, entry);
        }
        // Skeletons shorter than the floor collide too often to be worth a posting list.
        const skeleton = toConsonantSkeleton(transliterationKey);
        if (skeleton.length >= SKELETON_INDEX_MINIMUM_LENGTH) {
          this.addToEntryIndex(this.transliterationSkeletonIndex, skeleton, entry);
        }
      }
    }
  }

  findByNormalizedText(normalizedText: string): Brand[] {
    return [...(this.normalizedTextIndex.get(normalizedText) ?? [])];
  }

  findByCompactText(compactText: string): Brand[] {
    return [...(this.compactTextIndex.get(compactText) ?? [])];
  }

  findEntriesByNormalizedText(normalizedText: string): BrandIndexEntry[] {
    return [...(this.normalizedEntryIndex.get(normalizedText) ?? [])];
  }

  findEntriesByCompactText(compactText: string): BrandIndexEntry[] {
    return [...(this.compactEntryIndex.get(compactText) ?? [])];
  }

  findEntriesByPrefix(prefix: string): BrandIndexEntry[] {
    return [...(this.prefixIndex.get(prefix) ?? [])];
  }

  findEntriesByFirstCharacter(firstCharacter: string): BrandIndexEntry[] {
    return [...(this.firstCharacterIndex.get(firstCharacter) ?? [])];
  }

  findEntriesByNgram(ngram: string): BrandIndexEntry[] {
    return [...(this.ngramIndex.get(ngram) ?? [])];
  }

  findEntriesByTransliteration(key: string): BrandIndexEntry[] {
    return [...(this.transliterationIndex.get(key) ?? [])];
  }

  findEntriesByTransliterationPrefix(prefix: string): BrandIndexEntry[] {
    return [...(this.transliterationPrefixIndex.get(prefix) ?? [])];
  }

  findEntriesByTransliterationNgram(ngram: string): BrandIndexEntry[] {
    return [...(this.transliterationNgramIndex.get(ngram) ?? [])];
  }

  /** Entries filed under a phonetic key. */
  findEntriesByPhoneticKey(key: string): readonly BrandIndexEntry[] {
    return this.phoneticKeyIndex.get(key) ?? [];
  }

  /** Entries with a key that becomes `key` once one of its consonants is removed. */
  findEntriesByPhoneticDeletion(key: string): readonly BrandIndexEntry[] {
    return this.phoneticDeletionIndex.get(key) ?? [];
  }

  findEntriesByTransliterationSkeleton(skeleton: string): BrandIndexEntry[] {
    if (skeleton.length < SKELETON_INDEX_MINIMUM_LENGTH) {
      return [];
    }
    return [...(this.transliterationSkeletonIndex.get(skeleton) ?? [])];
  }

  private addToIndex(index: Map<string, Brand[]>, key: string, brand: Brand): void {
    if (!key) {
      return;
    }

    const matches = index.get(key) ?? [];
    if (!matches.some((match) => match.code === brand.code)) {
      matches.push(brand);
      index.set(key, matches);
    }
  }

  private addToEntryIndex(
    index: Map<string, BrandIndexEntry[]>,
    key: string,
    entry: BrandIndexEntry,
  ): void {
    const matches = index.get(key) ?? [];
    // A single entry adds all of its keys before the next entry is processed.
    if (matches[matches.length - 1] !== entry) {
      matches.push(entry);
    }
    index.set(key, matches);
  }
}