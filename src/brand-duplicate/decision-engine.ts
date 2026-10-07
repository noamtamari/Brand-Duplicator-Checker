import { DEFAULT_BRAND_MATCHING_CONFIG } from "./brand-matching-config.js";
import type {
  BrandCandidate,
  BrandCheckResult,
  BrandDecision,
  CrossLanguageSignals,
} from "./types.js";
import type { BrandMatchingConfig } from "./brand-matching-config.js";

export interface DecisionOutcome {
  decision: BrandDecision;
  confidence: number;
}

export class DecisionEngine {
  constructor(private readonly config: BrandMatchingConfig = DEFAULT_BRAND_MATCHING_CONFIG) {}

  decide(candidates: readonly BrandCandidate[]): DecisionOutcome {
    const exactCandidate = candidates.find((candidate) => candidate.matchType === "NORMALIZED_EXACT");
    if (exactCandidate && exactCandidate.score >= this.config.exactBlockThreshold) {
      return { decision: "BLOCK", confidence: exactCandidate.score };
    }

    const compactCandidate = candidates.find((candidate) => candidate.matchType === "COMPACT_EXACT");
    if (compactCandidate && compactCandidate.score >= this.config.compactExactBlockThreshold) {
      return { decision: "BLOCK", confidence: compactCandidate.score };
    }

    const transliterationCandidate = candidates.find(
      (candidate) =>
        candidate.matchType === "TRANSLITERATION_EXACT" &&
        candidate.crossLanguageSignals?.transliterationExact === true &&
        candidate.crossLanguageSignals.transliterationSource === "CURATED",
    );
    if (
      transliterationCandidate &&
      transliterationCandidate.score >= this.config.transliterationExactBlockThreshold
    ) {
      return { decision: "BLOCK", confidence: transliterationCandidate.score };
    }

    const aliasCandidate = candidates.find((candidate) => candidate.matchType === "APPROVED_ALIAS");
    if (aliasCandidate) {
      return { decision: "BLOCK", confidence: aliasCandidate.score };
    }

    // A candidate that matches only part of the input stays in the list for comparison but is not
    // evidence: קלין לוג'יק is not קלין, and טיימו ביוטי is not TYMO. Only whole-name matches can
    // hold a name back from here on.
    const wholeNameCandidates = candidates.filter(
      (candidate) => !candidate.partialMatch && !this.isUnconfirmedSpellingGuess(candidate),
    );
    const strongest = wholeNameCandidates[0];
    if (!strongest) {
      return { decision: "ALLOW", confidence: 1 };
    }

    if (this.isSafeStrongTypo(strongest)) {
      return { decision: "BLOCK", confidence: strongest.score };
    }

    // Scan every candidate, not just the strongest: the Hebrew spelling of a Latin name scores
    // below unrelated same-script neighbours, so "natural diet" ranked נטורל דיאט fourth. Weak
    // cross-language guesses are ignored wherever they rank, the strongest included: expanding a
    // name into the other script reaches some unrelated brand for almost any input (HQ reached
    // הקס at 0.60, Yeti סיטי at 0.61), and a guess that weak is not a reason to hold a name back.
    // A weak guess scoring at or above the review threshold still reviews through the score.
    const crossLanguageEvidence = wholeNameCandidates.find((candidate) => {
      const signals = candidate.crossLanguageSignals;
      return signals !== undefined && this.isConvincingTransliteration(signals);
    });
    if (
      strongest.matchType === "COMPACT_EXACT" ||
      strongest.matchType === "RELATED_NAME" ||
      crossLanguageEvidence !== undefined ||
      strongest.score >= this.config.reviewThreshold
    ) {
      return {
        decision: "HUMAN_REVIEW",
        confidence: Math.max(strongest.score, crossLanguageEvidence?.score ?? 0),
      };
    }

    return { decision: "ALLOW", confidence: 1 - strongest.score };
  }

  /**
   * A cross-script pairing resting on spelling alone, with neither the pronunciation nor the
   * consonants agreeing. Pronunciation is compared for every cross-script candidate, so a spelling
   * resemblance it does not confirm is one it rejected: סטפיל reads "stpl", one letter from STP,
   * but its L has nothing to pair with. When even the consonants differ, the resemblance is just
   * the vowel-dropping romanization landing near a shorter name.
   */
  private isUnconfirmedSpellingGuess(candidate: BrandCandidate): boolean {
    const signals = candidate.crossLanguageSignals;
    return (
      signals !== undefined &&
      !signals.transliterationExact &&
      signals.phoneticSimilarity === undefined &&
      signals.skeletonMatch !== true
    );
  }

  private isConvincingTransliteration(signals: CrossLanguageSignals): boolean {
    if (signals.transliterationExact) {
      return true;
    }
    // Matching consonants carry the evidence when the vowels cannot agree, but only once the
    // skeleton is long enough to be distinctive.
    if (
      signals.skeletonMatch === true &&
      (signals.skeleton?.length ?? 0) >= this.config.skeletonEvidenceMinimumLength
    ) {
      return true;
    }
    // Similarity alone is evidence only when pronunciation confirmed it. Two spellings that merely
    // look alike are what every invented name produces somewhere in a 17,653-brand catalogue:
    // נמברוסי reads "nmbrosi", 0.72 of the way to AMBROSIA. A spelling near-miss still reviews
    // when it scores at the review threshold, through the score itself.
    return (
      signals.phoneticSimilarity !== undefined &&
      signals.transliterationSimilarity >= this.config.crossLanguageEvidenceThreshold
    );
  }

  private isSafeStrongTypo(candidate: BrandCandidate): boolean {
    const signals = candidate.signals;
    if (!signals || candidate.matchType !== "HIGH_FUZZY") {
      return false;
    }
    const minLength = Math.min(signals.inputLength, signals.candidateLength);
    const blockThreshold = minLength <= this.config.shortNameMaxLength
      ? this.config.shortNameFuzzyBlockThreshold
      : this.config.strongFuzzyBlockThreshold;
    if (candidate.score < blockThreshold || signals.editDistance !== 1) {
      return false;
    }
    if (
      signals.inputTokenCount !== signals.candidateTokenCount ||
      signals.isPrefixVariant ||
      signals.inputTokenCount === 0
    ) {
      return false;
    }

    return (
      signals.inputLength > this.config.shortNameMaxLength &&
      signals.candidateLength > this.config.shortNameMaxLength &&
      Math.min(signals.inputLength, signals.candidateLength) >= this.config.strongFuzzyMinLength
    );
  }
}

export function applyDecision(
  input: string,
  normalizedInput: string,
  candidates: BrandCandidate[],
  decisionEngine: DecisionEngine,
): BrandCheckResult {
  const outcome = decisionEngine.decide(candidates);
  return {
    input,
    normalizedInput,
    decision: outcome.decision,
    confidence: outcome.confidence,
    candidates,
  };
}