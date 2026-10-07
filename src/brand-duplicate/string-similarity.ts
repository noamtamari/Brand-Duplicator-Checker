import type { SimilaritySignals } from "./types.js";

export interface SimilarityComparison extends SimilaritySignals {
  score: number;
}

/**
 * Scratch matrix reused across calls. Brand names are short, but the comparison runs on the order
 * of a thousand times per check, and allocating a fresh row-of-arrays each time dominated the
 * cross-language path. The buffer only ever grows, and every cell used is written before it is read.
 */
let distanceMatrix: Int32Array[] = [];

function ensureDistanceMatrix(rows: number, columns: number): Int32Array[] {
  if (distanceMatrix.length < rows || (distanceMatrix[0]?.length ?? 0) < columns) {
    const width = Math.max(columns, distanceMatrix[0]?.length ?? 0);
    const height = Math.max(rows, distanceMatrix.length);
    distanceMatrix = Array.from({ length: height }, () => new Int32Array(width));
  }
  return distanceMatrix;
}

function damerauLevenshteinDistance(first: string, second: string): number {
  const rows = first.length + 1;
  const columns = second.length + 1;
  const matrix = ensureDistanceMatrix(rows, columns);

  for (let row = 0; row < rows; row += 1) {
    matrix[row][0] = row;
  }
  for (let column = 0; column < columns; column += 1) {
    matrix[0][column] = column;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const substitutionCost = first[row - 1] === second[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + substitutionCost,
      );

      if (
        row > 1 &&
        column > 1 &&
        first[row - 1] === second[column - 2] &&
        first[row - 2] === second[column - 1]
      ) {
        matrix[row][column] = Math.min(matrix[row][column], matrix[row - 2][column - 2] + 1);
      }
    }
  }

  return matrix[first.length][second.length];
}

function characterNgrams(value: string): Set<string> {
  if (value.length < 2) {
    return value ? new Set([value]) : new Set();
  }

  const ngrams = new Set<string>();
  for (let index = 0; index < value.length - 1; index += 1) {
    ngrams.add(value.slice(index, index + 2));
  }
  return ngrams;
}

function characterNgramSimilarity(first: string, second: string): number {
  const firstNgrams = characterNgrams(first);
  const secondNgrams = characterNgrams(second);
  if (firstNgrams.size === 0 && secondNgrams.size === 0) {
    return 1;
  }
  if (firstNgrams.size === 0 || secondNgrams.size === 0) {
    return 0;
  }

  let intersectionSize = 0;
  for (const ngram of firstNgrams) {
    if (secondNgrams.has(ngram)) {
      intersectionSize += 1;
    }
  }

  return (2 * intersectionSize) / (firstNgrams.size + secondNgrams.size);
}

function tokenSimilarity(first: string, second: string): number {
  const firstTokens = new Set(first.split(" ").filter(Boolean));
  const secondTokens = new Set(second.split(" ").filter(Boolean));
  if (firstTokens.size === 0 && secondTokens.size === 0) {
    return 1;
  }
  if (firstTokens.size === 0 || secondTokens.size === 0) {
    return 0;
  }

  const bestSimilarity = (token: string, candidates: Set<string>): number => {
    let best = 0;
    for (const candidate of candidates) {
      const longestLength = Math.max(token.length, candidate.length);
      const similarity = longestLength === 0
        ? 1
        : 1 - damerauLevenshteinDistance(token, candidate) / longestLength;
      best = Math.max(best, similarity);
    }
    return best;
  };

  let firstToSecond = 0;
  for (const token of firstTokens) {
    firstToSecond += bestSimilarity(token, secondTokens);
  }
  let secondToFirst = 0;
  for (const token of secondTokens) {
    secondToFirst += bestSimilarity(token, firstTokens);
  }

  return (firstToSecond + secondToFirst) / (firstTokens.size + secondTokens.size);
}

function commonPrefixLength(first: string, second: string): number {
  const limit = Math.min(first.length, second.length);
  let index = 0;
  while (index < limit && first[index] === second[index]) {
    index += 1;
  }
  return index;
}

function isSingleAdjacentTransposition(first: string, second: string): boolean {
  if (first.length !== second.length || first === second) {
    return false;
  }

  let differenceIndex = 0;
  while (differenceIndex < first.length && first[differenceIndex] === second[differenceIndex]) {
    differenceIndex += 1;
  }
  if (differenceIndex >= first.length - 1) {
    return false;
  }

  return (
    first[differenceIndex] === second[differenceIndex + 1] &&
    first[differenceIndex + 1] === second[differenceIndex] &&
    first.slice(differenceIndex + 2) === second.slice(differenceIndex + 2)
  );
}

/**
 * Whether two words could be one word misspelled: identical, one edit apart, or two edits apart
 * when both are long enough to absorb that (KLEIN/KLINE).
 */
function isTypoLevelWord(first: string, second: string): boolean {
  if (first === second) {
    return true;
  }
  const distance = damerauLevenshteinDistance(first, second);
  return distance <= 1 || (distance === 2 && Math.min(first.length, second.length) >= 5);
}

/**
 * True when a proposed name matches only part of an existing one, so the two are different names
 * that share words rather than one name written two ways:
 *
 * - The proposed name adds words: NIVEA MEN against NIVEA, קלין לוג'יק against קלין. The catalogue
 *   lists such extensions as brands of their own (POLO RED, GUCCI BLOOM, אדידס קוסמטיקה). The added
 *   words may cost a space and one letter, which is a typo rather than a new word: "Nive a".
 * - Both have the same number of words and one word differs entirely from the word in its place:
 *   קליר דיאה against קליר דיי, בנפיט קוסמטיקס against רניו קוסמטיקס.
 *
 * A proposed name with fewer words than the existing one is not covered: L'OREAL against L'OREAL
 * PARIS may be the same brand written shorter.
 */
export function isPartialNameMatch(proposed: string, existing: string): boolean {
  const proposedWords = proposed.split(" ").filter(Boolean);
  const existingWords = existing.split(" ").filter(Boolean);
  if (proposedWords.length > existingWords.length) {
    const addedWords = proposedWords.length - existingWords.length;
    return damerauLevenshteinDistance(proposed, existing) > addedWords + 1;
  }
  if (proposedWords.length < 2 || proposedWords.length !== existingWords.length) {
    return false;
  }
  return proposedWords.some((word, index) => !isTypoLevelWord(word, existingWords[index]));
}

function hasTokenPrefix(first: string, second: string): boolean {
  const firstTokens = first.split(" ").filter(Boolean);
  const secondTokens = second.split(" ").filter(Boolean);
  if (firstTokens.length === secondTokens.length) {
    return false;
  }

  const shorter = firstTokens.length < secondTokens.length ? firstTokens : secondTokens;
  const longer = firstTokens.length < secondTokens.length ? secondTokens : firstTokens;
  return shorter.every((token, index) => token === longer[index]);
}

export class StringSimilarityService {
  compare(first: string, second: string): SimilarityComparison {
    const editDistance = damerauLevenshteinDistance(first, second);
    const longestLength = Math.max(first.length, second.length);
    const shortestLength = Math.min(first.length, second.length);
    const editSimilarity = longestLength === 0 ? 1 : 1 - editDistance / longestLength;
    const prefixLength = commonPrefixLength(first, second);
    const prefixConsistency = shortestLength === 0 ? 0 : prefixLength / shortestLength;
    const lengthSimilarity = longestLength === 0 ? 1 : 1 - (longestLength - shortestLength) / longestLength;
    const inputTokenCount = first.split(" ").filter(Boolean).length;
    const candidateTokenCount = second.split(" ").filter(Boolean).length;
    const isCharacterPrefix =
      first !== second && (first.startsWith(second) || second.startsWith(first));
    const isTokenPrefix = hasTokenPrefix(first, second);
    // Both of these walk the strings — tokenSimilarity runs an edit distance per token pair — and
    // both are reported as signals as well as weighed into the score, so they are computed once.
    const ngramSimilarity = characterNgramSimilarity(first, second);
    const tokenSimilarityScore = tokenSimilarity(first, second);
    const score =
      editSimilarity * 0.5 +
      ngramSimilarity * 0.3 +
      tokenSimilarityScore * 0.1 +
      lengthSimilarity * 0.05 +
      prefixConsistency * 0.05;

    return {
      score,
      inputLength: first.length,
      candidateLength: second.length,
      editDistance,
      editSimilarity,
      isTransposition: isSingleAdjacentTransposition(first, second),
      characterNgramSimilarity: ngramSimilarity,
      tokenSimilarity: tokenSimilarityScore,
      lengthDifference: longestLength - shortestLength,
      commonPrefixLength: prefixLength,
      prefixConsistency,
      inputTokenCount,
      candidateTokenCount,
      isPrefixVariant: isCharacterPrefix || isTokenPrefix,
      isCharacterPrefix,
      isTokenPrefix,
    };
  }
}