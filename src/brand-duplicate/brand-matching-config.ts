export interface BrandMatchingConfig {
  exactBlockThreshold: number;
  compactExactBlockThreshold: number;
  strongFuzzyBlockThreshold: number;
  reviewThreshold: number;
  maxCandidates: number;
  crossLanguageReservedSlots: number;
  candidatePoolSize: number;
  shortNameMaxLength: number;
  shortNameFuzzyBlockThreshold: number;
  strongFuzzyMinLength: number;
  transliterationExactBlockThreshold: number;
  crossLanguageCandidateThreshold: number;
  crossLanguageEvidenceThreshold: number;
  skeletonEvidenceMinimumLength: number;
}

export const DEFAULT_BRAND_MATCHING_CONFIG: BrandMatchingConfig = {
  exactBlockThreshold: 1,
  // Compact matching removes word boundaries, so it is surfaced but remains review-only by default.
  compactExactBlockThreshold: 1,
  // A one-edit, same-token typo in a sufficiently long name is strong enough to block.
  strongFuzzyBlockThreshold: 0.8,
  reviewThreshold: 0.75,
  maxCandidates: 5,
  // Slots held for the strongest cross-script candidates, so same-script neighbours that merely
  // look alike cannot push the other script's spelling of the same brand off the list. One slot
  // was not enough: a weak cross-script hit (MRD for מריל, ASKO for אסקדה) filled it and shut
  // out the right brand. Capped at one below maxCandidates so the top candidate is never evicted.
  crossLanguageReservedSlots: 2,
  // Score a bounded indexed pool, then return only the strongest final candidates.
  candidatePoolSize: 100,
  // Two- and three-character names have too little information for safe fuzzy blocking.
  shortNameMaxLength: 3,
  shortNameFuzzyBlockThreshold: 1.01,
  // Five-character one-edit matches remain review-only, as a single edit is less distinctive.
  strongFuzzyMinLength: 6,
  // Generated transliteration is deterministic but not a proof of identity in every language context.
  transliterationExactBlockThreshold: 0.98,
  crossLanguageCandidateThreshold: 0.55,
  // Below this, a lower-ranked cross-script pairing is a weak guess rather than evidence of a
  // shared name, so it does not by itself send the input to review.
  crossLanguageEvidenceThreshold: 0.72,
  // Short skeletons collide constantly once vowels are gone — "מוי"/"MY" and "ציקו"/"CK" both
  // reduce to two letters — so only longer names carry a usable consonant signature.
  skeletonEvidenceMinimumLength: 5,
};