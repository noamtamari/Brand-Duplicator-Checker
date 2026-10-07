import { normalizeBrandNameParts } from "./brand-normalizer.js";
import { BrandCandidateScorer, compareCandidates } from "./brand-candidate-scorer.js";
import type { BrandIndex, BrandIndexEntry } from "./brand-index.js";
import type { BrandCandidate } from "./types.js";

export interface CandidateGeneratorOptions {
  candidatePoolSize: number;
  maxCandidates: number;
}

interface RetrievedEntry {
  entry: BrandIndexEntry;
  retrievalScore: number;
}

export class CandidateGenerator {
  constructor(
    private readonly brandIndex: BrandIndex,
    private readonly scorer = new BrandCandidateScorer(),
    private readonly options: CandidateGeneratorOptions = {
      candidatePoolSize: 100,
      maxCandidates: 5,
    },
  ) {}

  generate(input: string | null | undefined): BrandCandidate[] {
    return this.generateAll(input).slice(0, this.options.maxCandidates);
  }

  generateAll(input: string | null | undefined): BrandCandidate[] {
    const { normalizedText, compactText } = normalizeBrandNameParts(input);
    if (!normalizedText) {
      return [];
    }

    const retrieved = new Map<string, RetrievedEntry>();
    const addEntries = (entries: readonly BrandIndexEntry[], weight: number): void => {
      for (const entry of entries) {
        const key = `${entry.brand.code}\u0000${entry.normalizedText}`;
        const current = retrieved.get(key);
        if (current) {
          current.retrievalScore += weight;
        } else {
          retrieved.set(key, { entry, retrievalScore: weight });
        }
      }
    };

    addEntries(this.brandIndex.findEntriesByNormalizedText(normalizedText), 1000);
    addEntries(this.brandIndex.findEntriesByCompactText(compactText), 900);
    addEntries(this.brandIndex.findEntriesByPrefix(compactText.slice(0, 2)), 5);
    addEntries(this.brandIndex.findEntriesByFirstCharacter(compactText[0] ?? ""), 2);

    const queryNgrams = new Set<string>();
    for (let index = 0; index < compactText.length - 1; index += 1) {
      queryNgrams.add(compactText.slice(index, index + 2));
    }
    for (const ngram of queryNgrams) {
      addEntries(this.brandIndex.findEntriesByNgram(ngram), 1);
    }

    const pool = [...retrieved.values()]
      .sort((first, second) => second.retrievalScore - first.retrievalScore)
      .slice(0, this.options.candidatePoolSize);
    const candidatesByCode = new Map<string, BrandCandidate>();
    for (const { entry } of pool) {
      const candidate = this.scorer.score(normalizedText, entry);
      const current = candidatesByCode.get(candidate.code);
      if (!current || candidate.score > current.score) {
        candidatesByCode.set(candidate.code, candidate);
      }
    }

    return [...candidatesByCode.values()]
      .sort(compareCandidates);
  }
}
