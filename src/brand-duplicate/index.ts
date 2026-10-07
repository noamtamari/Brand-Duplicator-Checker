export { parseBrandResponse } from "./brand-adapter.js";
export { InMemoryBrandAliasResolver } from "./brand-alias-resolver.js";
export { CandidateGenerator } from "./candidate-generator.js";
export { CrossLanguageCandidateGenerator } from "./cross-language-candidate-generator.js";
export { DecisionEngine } from "./decision-engine.js";
export { BrandDuplicateChecker } from "./brand-duplicate-checker.js";
export { BrandIndex } from "./brand-index.js";
export { DEFAULT_BRAND_MATCHING_CONFIG } from "./brand-matching-config.js";
export { BrandCandidateScorer } from "./brand-candidate-scorer.js";
export { normalizeBrandName, normalizeBrandNameParts } from "./brand-normalizer.js";
export { StringSimilarityService } from "./string-similarity.js";
export { detectScript } from "./script-detection.js";
export { TransliterationService } from "./transliteration-service.js";
export {
  LatinToHebrewTransliterationService,
  toHebrewConsonantSkeleton,
} from "./latin-to-hebrew-transliteration.js";
export type {
  BrandAliasMatch,
  BrandAliasResolver,
  Brand,
  BrandCandidate,
  BrandCheckResult,
  BrandDecision,
  BrandTranslation,
  NormalizedBrandName,
  SimilaritySignals,
  BrandScript,
  CrossLanguageSignals,
  TransliterationVariant,
  TransliterationVariantSource,
} from "./types.js";
export type { BrandMatchingConfig } from "./brand-matching-config.js";
export type { BrandIndexEntry } from "./brand-index.js";
export type { CandidateGeneratorOptions } from "./candidate-generator.js";
export type { CrossLanguageCandidateGeneratorOptions } from "./cross-language-candidate-generator.js";
export type { DecisionOutcome } from "./decision-engine.js";
export type { SimilarityComparison } from "./string-similarity.js";
export type { BrandAliasDefinition } from "./brand-alias-resolver.js";
export type { BrandDuplicateCheckerOptions } from "./brand-duplicate-checker.js";
