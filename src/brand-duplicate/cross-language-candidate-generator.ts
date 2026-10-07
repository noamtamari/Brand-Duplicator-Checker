import { BrandCandidateScorer, compareCandidates } from "./brand-candidate-scorer.js";
import {
  matchPhoneticNames,
  phoneticKeys,
  toPhoneticName,
  type PhoneticName,
} from "./cross-script-phonetic-matcher.js";
import { detectScript } from "./script-detection.js";
import { LatinToHebrewTransliterationService } from "./latin-to-hebrew-transliteration.js";
import { normalizeBrandNameParts } from "./brand-normalizer.js";
import { TransliterationService, toConsonantSkeleton } from "./transliteration-service.js";
import type { BrandIndex, BrandIndexEntry } from "./brand-index.js";
import type { BrandCandidate, BrandScript, TransliterationVariant } from "./types.js";

export interface CrossLanguageCandidateGeneratorOptions {
  maxCandidates: number;
  candidatePoolSize: number;
  minimumScore: number;
}

/**
 * How many generated Hebrew spellings take part in the ngram sweep. Each one scans a posting list
 * per ngram against the whole index, and the spellings are near-duplicates ordered cheapest-first,
 * so the sweep saturates quickly while its cost keeps growing.
 */
const HEBREW_FUZZY_RETRIEVAL_VARIANTS = 8;
/**
 * Longest generated spelling that takes part in the ngram sweep. A long spelling contributes more
 * ngrams, each pulling a longer posting list, and then costs more per comparison — while naming
 * the kind of brand the Hebrew index rarely holds.
 */
const HEBREW_FUZZY_RETRIEVAL_MAX_LENGTH = 10;
/**
 * How many generated Hebrew spellings each pooled brand is scored against. Every spelling costs a
 * full similarity comparison against every pooled brand, so this is the term that decides the
 * latency of a multi-word Latin name.
 *
 * Retrieval already pools a brand on any spelling that lands on it exactly, including ones well
 * down the list, so a cap here quietly discards brands the lookup above had already found:
 * Elegant/אלגנט is the 16th spelling, Aquilan/אקילן the 17th, Africa/אפריקה the 21st, and
 * Tresemme/טרזמה the 28th — a name whose doubled consonant and voiced "s" both cost a step.
 */
const HEBREW_SCORED_VARIANTS = 32;
/**
 * How similar a non-exact cross-script pairing must be to count. Below this, the pairing rests on
 * an invented spelling that merely resembles an unrelated brand: "Zenvora" reaches קנור (Knorr)
 * and "Orvexa" reaches כלורוקס (Clorox) at around 0.6, which is noise rather than a near-miss.
 */
const FUZZY_CROSS_LANGUAGE_MINIMUM_SIMILARITY = 0.72;
/**
 * How many consonants a shared skeleton needs before it can carry a pairing on its own. Tracks the
 * scorer's `SKELETON_SCORE_MINIMUM_LENGTH`: a skeleton the scorer will not lift must not be
 * admitted here either, and one it does lift must not then be discarded. Four is where a skeleton
 * stops naming a crowd — see that constant for the ambiguity measurements.
 */
const CREDIBLE_SKELETON_MINIMUM_LENGTH = 4;
/** Hebrew spellings shorter than this carry too few letters for a fuzzy match to mean anything. */
const SHORT_HEBREW_MAX_LENGTH = 7;
/** What a short Hebrew pairing needs instead: effectively an exact landing. */
const SHORT_HEBREW_MINIMUM_SIMILARITY = 0.95;
/**
 * How confident the generated Hebrew spelling must be for an exact landing to count. The cheapest
 * readings sit at 0.75 and each step of speculation costs 0.16.
 *
 * Measured against the catalogue: spellings that land on the brand they were meant to reach sit at
 * 0.59 — Materna/מטרנה, Remedia/רמדיה, Landwer/לנדוור, Clara/קלרה — while the one invented name
 * that reaches a real brand this way, Quorali/קרלי, sits at 0.43. The floor belongs in that gap.
 * At 0.7 it sat above the true landings and discarded all of them.
 *
 * Confidence carries this on its own. A length rule was measured alongside it and only cost true
 * landings — לייף and קלרה are four letters — without excluding anything the floor did not
 * already exclude.
 */
const EXACT_HEBREW_MINIMUM_CONFIDENCE = 0.5;
/**
 * Most brands the phonetic stage takes from its keys per check, before the spelling pool is added.
 * Short keys file many names, and one alignment costs a few microseconds, so this bounds latency
 * rather than recall.
 */
const PHONETIC_POOL_SIZE = 300;

export const DEFAULT_CROSS_LANGUAGE_OPTIONS: CrossLanguageCandidateGeneratorOptions = {
  maxCandidates: 5,
  candidatePoolSize: 100,
  minimumScore: 0.55,
};

export class CrossLanguageCandidateGenerator {
  constructor(
    private readonly brandIndex: BrandIndex,
    private readonly scorer = new BrandCandidateScorer(),
    private readonly transliterationService = new TransliterationService(),
    private readonly options: CrossLanguageCandidateGeneratorOptions = DEFAULT_CROSS_LANGUAGE_OPTIONS,
    private readonly latinToHebrewService = new LatinToHebrewTransliterationService(),
  ) {}

  generate(input: string | null | undefined): BrandCandidate[] {
    return this.generateAll(input).slice(0, this.options.maxCandidates);
  }

  generateAll(input: string | null | undefined): BrandCandidate[] {
    const inputValue = typeof input === "string" ? input : "";
    const inputScript = detectScript(inputValue);
    const inputVariants = this.transliterationService.getLatinVariants(inputValue);
    // A Latin input expands into Hebrew; a Hebrew one returns nothing here and keeps using the
    // Latin path above. The two directions are complementary, never both active for one input.
    const hebrewVariants = this.latinToHebrewService.getHebrewVariants(inputValue);
    if (inputVariants.length === 0 && hebrewVariants.length === 0) {
      return [];
    }

    const retrieved = new Map<string, { entry: BrandIndexEntry; score: number }>();
    for (const inputVariant of inputVariants) {
      const key = this.transliterationService.toComparableLatin(inputVariant.value);
      if (!key) {
        continue;
      }

      this.addEntries(retrieved, this.brandIndex.findEntriesByTransliteration(key), 1000);
      // A romanized Hebrew name agrees with its Latin original on consonants but essentially never
      // on the written vowels, so the exact key above cannot pair גרנייה ("grniih") with GARNIER.
      // The skeleton is where the two meet, and it is the signal scoring already trusts — without
      // this lookup a brand scoring would accept is never pooled, so it is never scored at all.
      this.addEntries(
        retrieved,
        this.brandIndex.findEntriesByTransliterationSkeleton(toConsonantSkeleton(key)),
        800,
      );
      this.addEntries(
        retrieved,
        this.brandIndex.findEntriesByTransliterationPrefix(key.slice(0, 2)),
        5,
      );
      const ngrams = new Set<string>();
      for (let index = 0; index < key.length - 1; index += 1) {
        ngrams.add(key.slice(index, index + 2));
      }
      for (const ngram of ngrams) {
        this.addEntries(retrieved, this.brandIndex.findEntriesByTransliterationNgram(ngram), 1);
      }
    }

    // The loop above can only find a Hebrew brand whose own indexed romanization happens to land
    // near the Latin input. Expanding the input into Hebrew instead lets it retrieve against the
    // native-script index, which is where a Hebrew brand is recorded exactly as it was written.
    for (const [variantIndex, hebrewVariant] of hebrewVariants.entries()) {
      const { normalizedText, compactText } = normalizeBrandNameParts(hebrewVariant.value);
      if (!normalizedText) {
        continue;
      }

      // Exact and compact lookups are single hash hits, so every generated spelling can afford
      // them, and they are what recovers a brand stored exactly as the input was expanded.
      this.addEntries(retrieved, this.brandIndex.findEntriesByNormalizedText(normalizedText), 1000);
      this.addEntries(retrieved, this.brandIndex.findEntriesByCompactText(compactText), 900);

      // Ngram retrieval scans a posting list per ngram, so running it for all 128 spellings of a
      // multi-word name walks a large fraction of the index many times over. The spellings are
      // ordered cheapest-first and near-duplicates of each other, so the fuzzy sweep is limited to
      // the most plausible few; the exact lookups above still cover the rest.
      // The sweep also scales with the spelling's length, and a long multi-word romanization is
      // both the most expensive to sweep and the least likely to name a Hebrew brand, which are
      // typically one or two short words. Its exact lookups above still run.
      if (
        variantIndex >= HEBREW_FUZZY_RETRIEVAL_VARIANTS ||
        compactText.length > HEBREW_FUZZY_RETRIEVAL_MAX_LENGTH
      ) {
        continue;
      }

      this.addEntries(retrieved, this.brandIndex.findEntriesByPrefix(compactText.slice(0, 2)), 5);
      const hebrewNgrams = new Set<string>();
      for (let index = 0; index < compactText.length - 1; index += 1) {
        hebrewNgrams.add(compactText.slice(index, index + 2));
      }
      for (const ngram of hebrewNgrams) {
        this.addEntries(retrieved, this.brandIndex.findEntriesByNgram(ngram), 1);
      }
    }

    // Scoring runs every pooled entry against every spelling, so the spelling list is capped here
    // too. The cheapest spellings are the ones a Hebrew writer would actually have used, and an
    // exact hit on a lower-ranked one is already reflected in its retrieval score.
    const scoredHebrewVariants = hebrewVariants.slice(0, HEBREW_SCORED_VARIANTS);
    const pool = [...retrieved.values()]
      .sort((first, second) => second.score - first.score)
      .slice(0, this.options.candidatePoolSize);
    const candidatesByCode = new Map<string, BrandCandidate>();
    for (const { entry } of pool) {
      if (!this.isCrossLanguagePair(inputScript, entry.script)) {
        continue;
      }
      const scored: BrandCandidate[] = [];
      for (const inputVariant of inputVariants) {
        scored.push(this.scorer.scoreCrossLanguage(inputValue, inputVariant, inputScript, entry));
      }
      // Scoring in Hebrew compares the input's generated spelling against the brand as it was
      // actually written, rather than against a romanization of it. For a Hebrew-only brand that
      // is the more faithful comparison, and it is the one that recovers exact hits like לייף.
      if (scoredHebrewVariants.length > 0) {
        scored.push(
          ...this.scorer.scoreHebrewExpansion(inputValue, scoredHebrewVariants, inputScript, entry),
        );
      }

      // Filter first, then keep the best: the strongest reading of a brand is not always a credible
      // one, and choosing it before filtering would throw away a credible reading behind it.
      for (const candidate of scored) {
        if (candidate.score < this.options.minimumScore) {
          continue;
        }
        if (!this.isCredibleCrossLanguageMatch(candidate)) {
          continue;
        }
        const current = candidatesByCode.get(candidate.code);
        if (!current || candidate.score > current.score) {
          candidatesByCode.set(candidate.code, candidate);
        }
      }
    }

    // Everything above compares spellings. Pronunciation is compared separately, over the brands
    // the spelling pool already holds plus those filed under the input's phonetic keys, because a
    // Hebrew name and its Latin original often share no spelling at all: גרנייה and GARNIER, פאיו
    // and PAYOT.
    const inputPhonetic = toPhoneticName(normalizeBrandNameParts(inputValue).normalizedText);
    for (const entry of this.phoneticEntries(inputPhonetic, inputScript, pool)) {
      const match = matchPhoneticNames(inputPhonetic, entry.phonetic);
      if (!match) {
        continue;
      }
      const candidate = this.scorer.scorePhonetic(inputScript, entry, match);
      if (candidate.score < this.options.minimumScore) {
        continue;
      }
      candidatesByCode.set(candidate.code, this.withPhoneticEvidence(candidatesByCode.get(candidate.code), candidate));
    }

    return [...candidatesByCode.values()]
      .sort(compareCandidates);
  }

  /**
   * The cross-script entries worth aligning by sound: those whose phonetic key matches the input's
   * outright, then those one consonant apart, then whatever the spelling pool found. Alignment is
   * a small dynamic program, so a few hundred of them cost milliseconds.
   */
  private phoneticEntries(
    name: PhoneticName,
    inputScript: BrandScript,
    pool: ReadonlyArray<{ entry: BrandIndexEntry }>,
  ): BrandIndexEntry[] {
    const keys = phoneticKeys(name);
    const selected = new Set<BrandIndexEntry>();
    const take = (entries: readonly BrandIndexEntry[]): void => {
      for (const entry of entries) {
        if (selected.size >= PHONETIC_POOL_SIZE) {
          return;
        }
        if (this.isCrossLanguagePair(inputScript, entry.script)) {
          selected.add(entry);
        }
      }
    };

    for (const key of keys.exact) {
      take(this.brandIndex.findEntriesByPhoneticKey(key));
    }
    for (const key of keys.exact) {
      take(this.brandIndex.findEntriesByPhoneticDeletion(key));
    }
    for (const key of keys.deletions) {
      take(this.brandIndex.findEntriesByPhoneticKey(key));
    }
    for (const { entry } of pool) {
      if (this.isCrossLanguagePair(inputScript, entry.script)) {
        selected.add(entry);
      }
    }
    return [...selected];
  }

  /**
   * Combines a phonetic candidate with the spelling-based candidate for the same brand. An exact
   * landing keeps its match type, since the spellings meeting is decisive evidence downstream, but
   * never scores below the pronunciation that confirms it: a speculative spelling of GUCCI scored
   * 0.88 and let Goccia outrank it. Otherwise the higher score wins, and a shared consonant
   * skeleton found by spelling is kept alongside the pronunciation that beat it.
   */
  private withPhoneticEvidence(
    current: BrandCandidate | undefined,
    phonetic: BrandCandidate,
  ): BrandCandidate {
    if (!current) {
      return phonetic;
    }
    if (current.matchType === "TRANSLITERATION_EXACT") {
      return phonetic.score > current.score ? { ...current, score: phonetic.score } : current;
    }
    if (current.score >= phonetic.score) {
      // The spelling scored higher, but pronunciation confirmed the same name, and a spelling
      // resemblance is only trusted once pronunciation backs it. Keep that confirmation, and with
      // it the match is a whole-name one even where the spellings split into words differently
      // (דאון טאון against DOWNTOWN).
      const confirmation = phonetic.crossLanguageSignals;
      if (!current.crossLanguageSignals || !confirmation || confirmation.phoneticRelation !== "SAME") {
        return current;
      }
      return {
        ...current,
        partialMatch: false,
        crossLanguageSignals: {
          ...current.crossLanguageSignals,
          phoneticSimilarity: confirmation.phoneticSimilarity,
          phoneticReading: confirmation.phoneticReading,
          phoneticRelation: confirmation.phoneticRelation,
        },
      };
    }
    const spelling = current.crossLanguageSignals;
    if (!spelling?.skeletonMatch || !phonetic.crossLanguageSignals) {
      return phonetic;
    }
    return {
      ...phonetic,
      crossLanguageSignals: {
        ...phonetic.crossLanguageSignals,
        skeletonMatch: spelling.skeletonMatch,
        skeleton: spelling.skeleton,
      },
    };
  }

  /**
   * Rejects cross-script pairings that only exist because an unlikely spelling was invented for
   * the input. Expanding a name into both scripts makes almost any short name reachable from some
   * spelling of almost any other, so the pairing has to be credible as well as close.
   *
   * An exact landing is credible on its own, since the generated spelling is the stored one. A
   * merely-similar landing is not: it is two guesses in a row, so it has to be clearly similar
   * rather than barely over the retrieval floor.
   */
  private isCredibleCrossLanguageMatch(candidate: BrandCandidate): boolean {
    const signals = candidate.crossLanguageSignals;
    if (!signals) {
      return true;
    }
    // These rules govern the Latin-to-Hebrew expansion only, which is the direction that invents a
    // spelling for the input. The romanized direction compares against spellings the index already
    // holds and is left exactly as it was.
    if (!/[֐-׿]/u.test(signals.transliterationVariant)) {
      return true;
    }

    if (signals.transliterationExact) {
      // An exact landing is only as good as the spelling that produced it and the name it landed
      // on. A Hebrew name has few letters and no written short vowels, so a speculative reading of
      // a Latin name can land on a real but unrelated brand; requiring both a non-speculative
      // reading and a name long enough to be distinctive is what separates the two.
      return signals.transliterationConfidence >= EXACT_HEBREW_MINIMUM_CONFIDENCE;
    }
    // A shared consonant skeleton stands in for raw similarity, but only once it is long enough to
    // be distinctive: three consonants collide constantly, which is how "Orvexa" reaches רוקסי
    // (Roxy) on "rks". This mirrors the length floor the decision engine applies to the same signal.
    if (
      signals.skeletonMatch &&
      (signals.skeleton?.length ?? 0) >= CREDIBLE_SKELETON_MINIMUM_LENGTH
    ) {
      return true;
    }
    // Hebrew writes no short vowels, so a Hebrew spelling is mostly consonants and a one-letter
    // difference in a short word still scores around 0.75 — "קורל" against "קורס", or "לומיטר"
    // against "לומייר". Those are different names, so a short Hebrew pairing must land exactly.
    const minimumSimilarity =
      signals.transliterationVariant.replace(/\s/gu, "").length < SHORT_HEBREW_MAX_LENGTH
        ? SHORT_HEBREW_MINIMUM_SIMILARITY
        : FUZZY_CROSS_LANGUAGE_MINIMUM_SIMILARITY;
    return signals.transliterationSimilarity >= minimumSimilarity;
  }

  private addEntries(
    retrieved: Map<string, { entry: BrandIndexEntry; score: number }>,
    entries: readonly BrandIndexEntry[],
    score: number,
  ): void {
    for (const entry of entries) {
      const key = `${entry.brand.code}\u0000${entry.normalizedText}`;
      const current = retrieved.get(key);
      if (current) {
        current.score += score;
      } else {
        retrieved.set(key, { entry, score });
      }
    }
  }

  private isCrossLanguagePair(inputScript: BrandScript, candidateScript: BrandScript): boolean {
    return (
      ((inputScript === "HEBREW" || inputScript === "MIXED") && candidateScript === "LATIN") ||
      (inputScript === "LATIN" && (candidateScript === "HEBREW" || candidateScript === "MIXED"))
    );
  }
}