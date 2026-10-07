import { detectScript } from "./script-detection.js";
import { normalizeBrandNameParts } from "./brand-normalizer.js";
import type { PhoneticMatch } from "./cross-script-phonetic-matcher.js";
import { StringSimilarityService, isPartialNameMatch, type SimilarityComparison } from "./string-similarity.js";
import { isPlausibleSubstitution, singleSubstitution } from "./keyboard-typos.js";
import { TransliterationService, toConsonantSkeleton } from "./transliteration-service.js";
import { toHebrewConsonantSkeleton } from "./latin-to-hebrew-transliteration.js";
import type {
  BrandCandidate,
  BrandMatchType,
  BrandScript,
  CrossLanguageSignals,
  TransliterationVariant,
} from "./types.js";
import type { BrandIndexEntry } from "./brand-index.js";

/**
 * A shared consonant skeleton lifts a cross-script pair to just above the review threshold, never
 * into blocking range: it says the consonants agree, not that the names are the same.
 */
const SKELETON_FLOOR_SCORE = 0.78;
/**
 * Short skeletons collide constantly once vowels are gone — 39 brands in the live data reduce to
 * "pr" alone — so only a skeleton this long is distinctive enough to carry a score on its own.
 *
 * Measured over the catalogue, ambiguity (a skeleton shared by more than one brand) falls off a
 * cliff between three and four consonants: 82% of two-letter skeletons are ambiguous, 61% of
 * three-letter, but only 26% of four-letter ones, averaging 1.43 brands each. Four is where a
 * shared skeleton starts naming one brand rather than a crowd, and it is what lets ברברי reach
 * BURBERRY and קליניק reach CLINIQUE — both exact skeleton matches that length 5 discarded.
 * This sits one below the decision engine's `skeletonEvidenceMinimumLength` on purpose: lifting a
 * pair into review is a weaker act than treating the skeleton as evidence for blocking.
 */
const SKELETON_SCORE_MINIMUM_LENGTH = 4;
/**
 * The highest score a pairing confirmed by sound can reach: above same-script names that merely
 * look alike, below a curated exact transliteration at 0.99. Phonetic evidence never blocks.
 */
const PHONETIC_SCORE_SCALE = 0.95;
/** A pairing where one name adds words is a related name, like DIOR HOMME against דיאור. */
const PHONETIC_SUBSET_FACTOR = 0.85;
/** Similarity from which a same-name pairing by sound is reported as a fuzzy transliteration. */
const PHONETIC_FUZZY_MINIMUM_SIMILARITY = 0.9;

const orthographyNames: Readonly<Record<string, string>> = {
  EN: "English",
  FR: "French",
  IT: "Italian",
  DE: "German",
  LITERAL: "letter by letter",
};

/**
 * Candidate order wherever a list is cut: whole-name matches first, then by score. A multi-word
 * name finds many brands that share one of its words, and ranking those purely by score would push
 * a real whole-name match off the shortlist before the decision ever sees it.
 */
export function compareCandidates(first: BrandCandidate, second: BrandCandidate): number {
  return Number(first.partialMatch === true) - Number(second.partialMatch === true) || second.score - first.score;
}

export class BrandCandidateScorer {
  constructor(
    private readonly similarityService = new StringSimilarityService(),
    private readonly transliterationService = new TransliterationService(),
  ) {}

  score(input: string, entry: BrandIndexEntry): BrandCandidate {
    const inputParts = normalizeBrandNameParts(input);

    if (inputParts.normalizedText === entry.normalizedText) {
      return this.createCandidate(entry, 1, "NORMALIZED_EXACT", "Normalized exact match");
    }

    if (inputParts.compactText === entry.compactText) {
      return this.createCandidate(
        entry,
        0.97,
        "COMPACT_EXACT",
        "Compact normalized match; word boundaries differ",
      );
    }

    const inputText = inputParts.normalizedText;
    const compared = this.similarityService.compare(inputText, entry.normalizedText);
    const substitution =
      compared.editDistance === 1 && !compared.isTransposition
        ? singleSubstitution(inputText, entry.normalizedText)
        : undefined;
    const implausible = substitution !== undefined && !isPlausibleSubstitution(...substitution);
    const comparison: SimilarityComparison = implausible
      ? { ...compared, implausibleSubstitution: true }
      : compared;
    // A letter replaced by one from across the keyboard is a different name, not a slip, so it
    // counts as two edits rather than one and never classifies as a typo.
    const matchType: BrandMatchType = implausible ? "WEAK_SIMILARITY" : this.classifyFuzzyMatch(comparison);
    const baseScore = implausible
      ? compared.score - 0.5 / Math.max(compared.inputLength, compared.candidateLength)
      : compared.score;
    const score = comparison.isTokenPrefix ? Math.min(1, baseScore + 0.22) : baseScore;
    const candidate = this.createCandidate(
      entry,
      score,
      matchType,
      this.createReason(matchType, comparison),
      comparison,
    );
    if (isPartialNameMatch(inputText, entry.normalizedText)) {
      candidate.partialMatch = true;
    }
    return candidate;
  }

  scoreCrossLanguage(
    input: string,
    inputVariant: TransliterationVariant,
    inputScript: BrandScript,
    entry: BrandIndexEntry,
  ): BrandCandidate {
    const inputComparable = this.transliterationService.toComparableLatin(inputVariant.value);
    let bestCandidate: BrandCandidate | undefined;

    for (const candidateVariant of entry.transliterationVariants) {
      const candidateComparable = this.transliterationService.toComparableLatin(candidateVariant.value);
      if (!candidateComparable) {
        continue;
      }

      const comparison = this.similarityService.compare(inputComparable, candidateComparable);
      const exact = inputComparable === candidateComparable;
      // An exact match between two *generated* spellings is a weaker signal than one backed by a
      // curated mapping, so scale it by the weaker of the two variants' confidence. Curated and
      // original-script variants (confidence 1) keep the full 0.99.
      const variantConfidence = Math.min(inputVariant.confidence, candidateVariant.confidence);
      // Speculative spellings are discounted whether they land exactly or only close, so a
      // canonical reading always outranks an invented one that happens to collide.
      const inputSkeleton = toConsonantSkeleton(inputComparable);
      const skeletonMatch =
        inputSkeleton.length > 0 && inputSkeleton === toConsonantSkeleton(candidateComparable);
      const baseScore = exact
        ? 0.8 + 0.19 * variantConfidence
        : comparison.score * (0.7 + 0.3 * variantConfidence);
      // Hebrew leaves most vowels unwritten, so a borrowed name and its Hebrew spelling can share
      // every consonant while their vowels line up badly enough to sink the character score:
      // אופוריה romanizes to "oporih", which scores 0.32 against "euphoria" despite both reducing
      // to "fr". A distinctive shared skeleton is real evidence, so it lifts the pair into review
      // range rather than being recorded as a signal on a candidate that was already discarded.
      const score =
        !exact && skeletonMatch && inputSkeleton.length >= SKELETON_SCORE_MINIMUM_LENGTH
          ? Math.max(baseScore, SKELETON_FLOOR_SCORE * variantConfidence)
          : baseScore;
      const matchType: BrandMatchType = exact
        ? "TRANSLITERATION_EXACT"
        : comparison.score >= 0.72
          ? "TRANSLITERATION_FUZZY"
          : "CROSS_LANGUAGE_POSSIBLE_MATCH";
      const crossLanguageSignals: CrossLanguageSignals = {
        inputScript,
        candidateScript: entry.script,
        transliterationVariant: inputComparable,
        candidateTransliteration: candidateComparable,
        transliterationSimilarity: exact ? 1 : comparison.score,
        transliterationExact: exact,
        transliterationSource: this.getVariantSource(inputVariant, candidateVariant),
        transliterationConfidence: variantConfidence,
        skeletonMatch,
        skeleton: skeletonMatch ? inputSkeleton : undefined,
      };
      const candidate = this.createCandidate(
        entry,
        score,
        matchType,
        this.createCrossLanguageReason(matchType, inputScript, entry.script, inputComparable),
        comparison,
        crossLanguageSignals,
      );
      if (!exact && isPartialNameMatch(inputComparable, candidateComparable)) {
        candidate.partialMatch = true;
      }
      if (!bestCandidate || candidate.score > bestCandidate.score) {
        bestCandidate = candidate;
      }
    }

    return bestCandidate ?? this.createCandidate(
      entry,
      0,
      "CROSS_LANGUAGE_POSSIBLE_MATCH",
      "No comparable transliteration was generated",
    );
  }

  /**
   * Scores a Latin input against a Hebrew brand by comparing in Hebrew: the input's generated
   * Hebrew spellings against the brand's own normalized text. The romanized comparison in
   * {@link scoreCrossLanguage} can only match a brand whose indexed romanization happens to land
   * near the input, which misses brands whose Hebrew spelling is the only faithful record of them.
   *
   * Returns one candidate per spelling rather than the best one. The strongest spelling is often an
   * exact landing too speculative to trust, and the caller's credibility filter rejects it; picking
   * the best first then discarded the brand outright, even when a slightly weaker spelling was
   * credible. That is how Materna/מטרנה and Always/אולוויז fell out of the list.
   */
  scoreHebrewExpansion(
    input: string,
    hebrewVariants: readonly TransliterationVariant[],
    inputScript: BrandScript,
    entry: BrandIndexEntry,
  ): BrandCandidate[] {
    const candidateText = entry.normalizedText;
    const candidateSkeleton = toHebrewConsonantSkeleton(candidateText);
    const candidates: BrandCandidate[] = [];

    for (const hebrewVariant of hebrewVariants) {
      const variantText = hebrewVariant.value;
      const comparison = this.similarityService.compare(variantText, candidateText);
      const exact = variantText === candidateText;
      // A generated Hebrew spelling landing exactly on the stored one is strong evidence, but it
      // is still generated, so it is discounted by the variant's own confidence the same way the
      // romanized direction discounts its spellings. Both directions stay on one scale.
      const variantSkeleton = toHebrewConsonantSkeleton(variantText);
      const skeletonMatch = variantSkeleton.length > 0 && variantSkeleton === candidateSkeleton;
      const baseScore = exact
        ? 0.8 + 0.19 * hebrewVariant.confidence
        : comparison.score * (0.7 + 0.3 * hebrewVariant.confidence);
      // Same reasoning as the romanized direction: agreeing on every consonant is evidence even
      // when the written vowels differ, so it lifts the pair into review range.
      const score =
        !exact && skeletonMatch && variantSkeleton.length >= SKELETON_SCORE_MINIMUM_LENGTH
          ? Math.max(baseScore, SKELETON_FLOOR_SCORE * hebrewVariant.confidence)
          : baseScore;
      const matchType: BrandMatchType = exact
        ? "TRANSLITERATION_EXACT"
        : comparison.score >= 0.72
          ? "TRANSLITERATION_FUZZY"
          : "CROSS_LANGUAGE_POSSIBLE_MATCH";
      const crossLanguageSignals: CrossLanguageSignals = {
        inputScript,
        candidateScript: entry.script,
        transliterationVariant: variantText,
        candidateTransliteration: candidateText,
        transliterationSimilarity: exact ? 1 : comparison.score,
        transliterationExact: exact,
        transliterationSource: hebrewVariant.source,
        transliterationConfidence: hebrewVariant.confidence,
        skeletonMatch,
        // Reported romanized even though the comparison ran in Hebrew, so a consumer reading
        // `skeleton` sees one alphabet whichever direction produced the candidate. Transliterating
        // is far more expensive than the comparison itself, so it happens only on a real match.
        skeleton: skeletonMatch
          ? toConsonantSkeleton(
              this.transliterationService.getLatinVariants(variantText, 1)[0]?.value ?? "",
            )
          : undefined,
      };
      const candidate = this.createCandidate(
        entry,
        score,
        matchType,
        this.createCrossLanguageReason(matchType, inputScript, entry.script, variantText),
        comparison,
        crossLanguageSignals,
      );
      if (!exact && isPartialNameMatch(variantText, candidateText)) {
        candidate.partialMatch = true;
      }
      candidates.push(candidate);
    }

    return candidates;
  }

  /**
   * A candidate for a pairing confirmed by sound. It reuses the transliteration match types, so
   * every consumer treats it like any other cross-language candidate, and it is never exact: exact
   * means the spellings themselves land on each other, which downstream treats as decisive.
   */
  scorePhonetic(inputScript: BrandScript, entry: BrandIndexEntry, match: PhoneticMatch): BrandCandidate {
    const same = match.relation === "SAME";
    const score = PHONETIC_SCORE_SCALE * match.similarity * (same ? 1 : PHONETIC_SUBSET_FACTOR);
    const matchType: BrandMatchType =
      same && match.similarity >= PHONETIC_FUZZY_MINIMUM_SIMILARITY
        ? "TRANSLITERATION_FUZZY"
        : "CROSS_LANGUAGE_POSSIBLE_MATCH";
    const reading = orthographyNames[match.orthography] ?? match.orthography;
    // An input that adds words to a brand pronounced like one of them is a new name, the way
    // טיימו ביוטי is not TYMO; one that drops words may still be the same brand written shorter.
    const inputAddsWords = !same && match.longer === "INPUT";
    const reason = same
      ? `${inputScript} input is pronounced like the ${entry.script} brand name (${match.rendered}, read as ${reading})`
      : inputAddsWords
        ? `${inputScript} input adds words to a word pronounced like the ${entry.script} brand name`
        : `${inputScript} input shares a word pronounced like the ${entry.script} brand name and omits the others; it may be the same brand written shorter`;
    const candidate = this.createCandidate(entry, score, matchType, reason, undefined, {
      inputScript,
      candidateScript: entry.script,
      transliterationVariant: match.rendered,
      candidateTransliteration: entry.normalizedText,
      transliterationSimilarity: match.similarity,
      transliterationExact: false,
      transliterationSource: "GENERATED",
      transliterationConfidence: match.similarity,
      phoneticSimilarity: match.similarity,
      phoneticReading: match.orthography,
      phoneticRelation: match.relation,
    });
    if (inputAddsWords) {
      candidate.partialMatch = true;
    }
    return candidate;
  }

  private classifyFuzzyMatch(comparison: ReturnType<StringSimilarityService["compare"]>): BrandMatchType {
    if (comparison.isTokenPrefix) {
      return "RELATED_NAME";
    }
    if (comparison.editDistance <= 1 && comparison.inputTokenCount === comparison.candidateTokenCount) {
      return comparison.score >= 0.82 ? "HIGH_FUZZY" : "POSSIBLE_TYPO";
    }
    if (comparison.tokenSimilarity >= 0.5 && comparison.inputTokenCount === comparison.candidateTokenCount) {
      return "TOKEN_VARIANT";
    }
    return comparison.score >= 0.6 ? "POSSIBLE_TYPO" : "WEAK_SIMILARITY";
  }

  private createReason(
    matchType: BrandMatchType,
    comparison: ReturnType<StringSimilarityService["compare"]>,
  ): string {
    if (comparison.implausibleSubstitution) {
      return "One letter replaced by a letter far from it on the keyboard; not a likely typo";
    }
    if (matchType === "RELATED_NAME") {
      return "One normalized brand is a token prefix of the other; the added token may identify a distinct product line";
    }
    if (comparison.editDistance === 1) {
      if (comparison.isTransposition) {
        return "Adjacent character transposition compared with the existing normalized brand";
      }
      const operation = comparison.lengthDifference === 1 ? "insertion or deletion" : "character replacement";
      return `One-character ${operation} compared with the existing normalized brand`;
    }
    if (comparison.editDistance > 1 && comparison.editDistance <= 2) {
      return `${comparison.editDistance}-character edit distance with overlapping character and token signals`;
    }
    if (matchType === "TOKEN_VARIANT") {
      return "Shared tokens with a different token; the names may represent related values";
    }
    return "Moderate character similarity without a deterministic exact match";
  }

  private createCrossLanguageReason(
    matchType: BrandMatchType,
    inputScript: BrandScript,
    candidateScript: BrandScript,
    inputVariant: string,
  ): string {
    if (matchType === "TRANSLITERATION_EXACT") {
      return `${inputScript} input transliterates to the normalized ${candidateScript} brand name (${inputVariant})`;
    }
    if (matchType === "TRANSLITERATION_FUZZY") {
      return `Generated ${inputScript}-to-${candidateScript} transliteration is highly similar to the existing brand`;
    }
    return `Generated ${inputScript}-to-${candidateScript} transliteration is a possible match and requires review`;
  }

  private getVariantSource(
    inputVariant: TransliterationVariant,
    candidateVariant: TransliterationVariant,
  ): TransliterationVariant["source"] {
    if (inputVariant.source === "CURATED" || candidateVariant.source === "CURATED") {
      return "CURATED";
    }
    if (inputVariant.source === "GENERATED" || candidateVariant.source === "GENERATED") {
      return "GENERATED";
    }
    return "ORIGINAL";
  }

  private createCandidate(
    entry: BrandIndexEntry,
    score: number,
    matchType: BrandMatchType,
    reason: string,
    signals?: ReturnType<StringSimilarityService["compare"]>,
    crossLanguageSignals?: CrossLanguageSignals,
  ): BrandCandidate {
    const candidate: BrandCandidate = {
      code: entry.brand.code,
      label: entry.brand.label,
      score,
      matchType,
      reason,
    };
    if (signals) {
      candidate.signals = signals;
    }
    if (crossLanguageSignals) {
      candidate.crossLanguageSignals = crossLanguageSignals;
    }
    return candidate;
  }
}