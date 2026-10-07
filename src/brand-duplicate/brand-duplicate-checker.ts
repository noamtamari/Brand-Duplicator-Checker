import { CandidateGenerator } from "./candidate-generator.js";
import { CrossLanguageCandidateGenerator } from "./cross-language-candidate-generator.js";
import { DEFAULT_BRAND_MATCHING_CONFIG } from "./brand-matching-config.js";
import { BrandIndex } from "./brand-index.js";
import { DecisionEngine } from "./decision-engine.js";
import { normalizeBrandNameParts } from "./brand-normalizer.js";
import { compareCandidates } from "./brand-candidate-scorer.js";
import type { BrandAliasResolver, BrandCandidate, BrandCheckResult } from "./types.js";
import type { BrandMatchingConfig } from "./brand-matching-config.js";

export interface BrandDuplicateCheckerOptions {
  aliasResolver?: BrandAliasResolver;
}

export class BrandDuplicateChecker {
  private readonly candidateGenerator: CandidateGenerator;
  private readonly crossLanguageCandidateGenerator: CrossLanguageCandidateGenerator;
  private readonly decisionEngine: DecisionEngine;
  private readonly maxCandidates: number;
  private readonly crossLanguageReservedSlots: number;
  private readonly aliasResolver?: BrandAliasResolver;

  constructor(
    brandIndex: BrandIndex,
    config: BrandMatchingConfig = DEFAULT_BRAND_MATCHING_CONFIG,
    options: BrandDuplicateCheckerOptions = {},
  ) {
    this.maxCandidates = config.maxCandidates;
    this.crossLanguageReservedSlots = config.crossLanguageReservedSlots;
    this.aliasResolver = options.aliasResolver;
    this.candidateGenerator = new CandidateGenerator(brandIndex, undefined, {
      candidatePoolSize: config.candidatePoolSize,
      maxCandidates: config.maxCandidates,
    });
    this.crossLanguageCandidateGenerator = new CrossLanguageCandidateGenerator(brandIndex, undefined, undefined, {
      maxCandidates: config.maxCandidates,
      candidatePoolSize: config.candidatePoolSize,
      minimumScore: config.crossLanguageCandidateThreshold,
    });
    this.decisionEngine = new DecisionEngine(config);
  }

  checkBrand(name: string | null | undefined): BrandCheckResult {
    const input = typeof name === "string" ? name : "";
    const { normalizedText } = normalizeBrandNameParts(name);
    const aliasCandidates = this.aliasCandidate(name);
    const sameScriptCandidates = this.candidateGenerator.generateAll(name);
    const crossLanguageCandidates = this.crossLanguageCandidateGenerator.generateAll(name);
    const candidates = this.mergeCandidates(
      aliasCandidates,
      sameScriptCandidates.slice(0, this.maxCandidates),
      crossLanguageCandidates.slice(0, this.maxCandidates),
    );
    const displayCandidates = this.mergeDisplayCandidates(
      aliasCandidates,
      sameScriptCandidates,
      crossLanguageCandidates,
    );
    const outcome = this.decisionEngine.decide(candidates);

    return {
      input,
      normalizedInput: normalizedText,
      decision: outcome.decision,
      confidence: outcome.confidence,
      displayCandidates,
      candidates,
    };
  }

  private mergeDisplayCandidates(...groups: BrandCandidate[][]): BrandCandidate[] {
    const candidatesByCode = new Map<string, BrandCandidate>();
    for (const group of groups) {
      for (const candidate of group) {
        const current = candidatesByCode.get(candidate.code);
        if (!current || candidate.score > current.score) {
          candidatesByCode.set(candidate.code, candidate);
        }
      }
    }
    return [...candidatesByCode.values()].sort(compareCandidates);
  }

  private mergeCandidates(...groups: BrandCandidate[][]): BrandCandidate[] {
    const candidatesByCode = new Map<string, BrandCandidate>();
    for (const group of groups) {
      for (const candidate of group) {
        const current = candidatesByCode.get(candidate.code);
        if (!current || candidate.score > current.score) {
          candidatesByCode.set(candidate.code, candidate);
        }
      }
    }
    const ranked = [...candidatesByCode.values()].sort(compareCandidates);
    return this.withCrossLanguageCandidates(ranked);
  }

  /**
   * Keeps the strongest cross-script readings of the name in the list. A Latin input can fill
   * every slot with Latin neighbours that merely look alike, pushing the Hebrew spelling of the
   * same brand just past the cut — it lands at position six for several real duplicates.
   *
   * The strongest cross-script candidates are guaranteed a place even when a weaker one is already
   * listed, since a single held slot let a coincidental hit (MRD for מריל) stand in for the real
   * brand. Each guaranteed candidate displaces the weakest one not itself guaranteed, and the list
   * stays in order: whole-name matches first, then by score. Every candidate here already passed the generator's credibility filter.
   */
  private withCrossLanguageCandidates(ranked: readonly BrandCandidate[]): BrandCandidate[] {
    const top = ranked.slice(0, this.maxCandidates);
    const reservedSlots = Math.min(this.crossLanguageReservedSlots, this.maxCandidates - 1);
    if (reservedSlots < 1) {
      return top;
    }

    const guaranteed = ranked
      .filter((candidate) => candidate.crossLanguageSignals)
      .slice(0, reservedSlots);
    const missing = guaranteed.filter((candidate) => !top.includes(candidate));
    if (missing.length === 0) {
      return top;
    }

    const kept = [...top];
    for (const candidate of missing) {
      let displaced = kept.length - 1;
      while (guaranteed.includes(kept[displaced])) {
        displaced -= 1;
      }
      kept.splice(displaced, 1, candidate);
    }
    return kept.sort(compareCandidates);
  }

  private aliasCandidate(name: string | null | undefined): BrandCandidate[] {
    if (!this.aliasResolver || typeof name !== "string") {
      return [];
    }
    const match = this.aliasResolver.find(name);
    return match
      ? [{
          code: match.code,
          label: match.label,
          score: 1,
          matchType: "APPROVED_ALIAS",
          reason: `Approved alias of ${match.label}: ${match.alias}`,
        }]
      : [];
  }
}