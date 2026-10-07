export interface BrandTranslation {
  locale: string;
  value: string;
}

export interface Brand {
  code: string;
  label: string;
  translations?: BrandTranslation[];
}

export interface NormalizedBrandName {
  normalizedText: string;
  compactText: string;
}

/** HUMAN_REVIEW means nothing automatic could settle the name, so a person must decide. */
export type BrandDecision = "BLOCK" | "HUMAN_REVIEW" | "ALLOW";

export type BrandScript =
  | "HEBREW"
  | "LATIN"
  | "MIXED"
  | "NUMERIC_OR_SYMBOL"
  | "OTHER";

export type TransliterationVariantSource = "CURATED" | "GENERATED" | "ORIGINAL";

export interface TransliterationVariant {
  value: string;
  source: TransliterationVariantSource;
  confidence: number;
}

export type BrandMatchType =
  | "NORMALIZED_EXACT"
  | "COMPACT_EXACT"
  | "HIGH_FUZZY"
  | "POSSIBLE_TYPO"
  | "TOKEN_VARIANT"
  | "RELATED_NAME"
  | "WEAK_SIMILARITY"
  | "TRANSLITERATION_EXACT"
  | "TRANSLITERATION_FUZZY"
  | "CROSS_LANGUAGE_POSSIBLE_MATCH"
  | "APPROVED_ALIAS";

export interface SimilaritySignals {
  inputLength: number;
  candidateLength: number;
  editDistance: number;
  editSimilarity: number;
  isTransposition: boolean;
  characterNgramSimilarity: number;
  tokenSimilarity: number;
  lengthDifference: number;
  commonPrefixLength: number;
  prefixConsistency: number;
  inputTokenCount: number;
  candidateTokenCount: number;
  isPrefixVariant: boolean;
  isCharacterPrefix: boolean;
  isTokenPrefix: boolean;
  /**
   * The names differ by one replaced letter, and the two letters are neither keyboard neighbours
   * nor spellings of one sound, so the difference is not a typo.
   */
  implausibleSubstitution?: boolean;
}

export interface CrossLanguageSignals {
  inputScript: BrandScript;
  candidateScript: BrandScript;
  transliterationVariant: string;
  candidateTransliteration: string;
  transliterationSimilarity: number;
  transliterationExact: boolean;
  transliterationSource: TransliterationVariantSource;
  transliterationConfidence: number;
  /**
   * Both names reduce to the same consonants. Hebrew leaves short vowels unwritten, so this
   * catches pairs whose letters cannot line up, such as "nturl diat" and "natural diet".
   */
  skeletonMatch?: boolean;
  /** The shared consonant skeleton; its length says how much signal the match carries. */
  skeleton?: string;
  /**
   * How closely the two names' pronunciations align, when the pairing was confirmed by sound.
   * Only set for pairings that passed the phonetic evidence rules.
   */
  phoneticSimilarity?: number;
  /** The orthography the Latin name was read by: EN, FR, IT, DE or LITERAL. */
  phoneticReading?: string;
  /** SAME when every word pairs up; SUBSET when one name adds words the other lacks. */
  phoneticRelation?: "SAME" | "SUBSET";
}

export interface BrandCandidate {
  code: string;
  label: string;
  score: number;
  reason: string;
  matchType: BrandMatchType;
  signals?: SimilaritySignals;
  crossLanguageSignals?: CrossLanguageSignals;
  /**
   * Only part of the input matched: the input adds words this candidate lacks, or one of its words
   * differs entirely from the candidate's word in that place. Shown for comparison, but not a
   * reason to hold the name for review.
   */
  partialMatch?: boolean;
}

export interface BrandAliasMatch {
  code: string;
  label: string;
  alias: string;
}

export interface BrandAliasResolver {
  find(name: string): BrandAliasMatch | undefined;
}

export interface BrandCheckResult {
  input: string;
  normalizedInput: string;
  decision: BrandDecision;
  confidence: number;
  /** Full ranked candidates for review display; decisions use the capped `candidates` shortlist. */
  displayCandidates?: BrandCandidate[];
  candidates: BrandCandidate[];
}