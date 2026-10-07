import { alignPhonetically, type PhoneticAlignment } from "./phonetic-aligner.js";
import { renderSymbols, retrievalClass } from "./phonetic-alphabet.js";
import { toHebrewUnits, type HebrewUnit } from "./hebrew-phonetic-units.js";
import { toLatinReadings, type LatinReading, type Orthography } from "./latin-phonetic-readings.js";

/**
 * Decides whether a Hebrew name and a Latin name are the same name, by how they sound.
 *
 * Alignment only measures distance; this module decides what distance is evidence. Expanding
 * names into both scripts makes almost any short name reachable from some reading of almost any
 * other, so a pairing must be covered as well as close:
 *
 * - Every consonant on both sides must pair with an equal or kindred consonant. "Zenvora" cannot
 *   reach קנור (Knorr), whose first consonant it lacks.
 * - A short name must not lean on vowels either spelling contradicts. "Quorali" reaches קרלי
 *   (Carly) only by leaving an o unwritten, זילורה reaches SILVER only by writing a final vowel
 *   SILVER does not have, and "Zylora" reaches סיילור only by leaving its final vowel unwritten.
 * - Shorter names need higher similarity, since each difference is a larger share of the name.
 */
export interface PhoneticToken {
  text: string;
  hebrew?: readonly HebrewUnit[];
  latin?: readonly LatinReading[];
}

export interface PhoneticName {
  tokens: readonly PhoneticToken[];
}

/** SAME when every word pairs up; SUBSET when one name adds words the other lacks. */
export type PhoneticRelation = "SAME" | "SUBSET";

export interface PhoneticMatch {
  similarity: number;
  relation: PhoneticRelation;
  orthography: Orthography;
  /** The Latin reading that matched, rendered for a candidate's reason. */
  rendered: string;
  /** For a SUBSET match, which name carries the extra words. */
  longer?: "INPUT" | "CANDIDATE";
}

/** Names with this many strong consonants or fewer are short: every sound in them matters. */
const SHORT_NAME_MAX_CONSONANTS = 3;
/**
 * A matched word must carry at least this many consonants to vouch for a multi-word name on its
 * own, unless it opens the longer name. הילפיגר reaches TOMMY HILFIGER through its distinctive
 * second word, while טומי alone must not tie טומי הילפיגר to every brand called TOMY.
 */
const SUBSET_MINIMUM_CONSONANTS = 4;
/**
 * What a matched word needs even when it opens the longer name. A single consonant says nothing
 * about identity: פה matched the "Pat" of PAT MCGRATH LABS. DIOR against דיאור הום, a real product
 * line, has two.
 */
const SUBSET_OPENING_MINIMUM_CONSONANTS = 2;
/** Most readings to file a Hebrew word under; each ambiguous letter doubles them. */
const MAXIMUM_HEBREW_KEYS = 8;
/** Shortest key worth indexing with one consonant deleted. */
const DELETION_KEY_MINIMUM_LENGTH = 4;

/**
 * The similarity a covered alignment needs, by how many consonants the name has.
 *
 * Measured over the 191 true pairs in the translation suites against the 112 invented names and
 * negative controls:
 *
 * - Four or more consonants: true pairs bottom out at 0.870 (דנלופ/Dunlop), and the closest
 *   invented name reaches 0.772 (זילורה/SILVER). 0.82 sits at the middle of that gap.
 * - Two or three consonants: no invented name gets past the coverage and vowel rules to be
 *   measured at all, so those rules, not this threshold, keep short names precise. True pairs
 *   bottom out at 0.904 (קואץ/COACH) and 0.894 (Crave/קרייב), and the thresholds leave each of
 *   them at least 0.02 of margin.
 */
function minimumSimilarity(consonants: number): number {
  if (consonants <= 2) {
    return 0.88;
  }
  if (consonants === 3) {
    return 0.87;
  }
  return 0.82;
}

/** Whether an alignment is evidence the two names are the same name. */
export function admitsPhoneticAlignment(alignment: PhoneticAlignment): boolean {
  if (alignment.latinConsonants === 0) {
    return false;
  }
  if (
    alignment.unmatchedLatinConsonants +
      alignment.unmatchedHebrewConsonants +
      alignment.mismatchedConsonants >
    0
  ) {
    return false;
  }
  if (alignment.latinConsonants <= SHORT_NAME_MAX_CONSONANTS) {
    if (alignment.nearSubstitutions > 1) {
      return false;
    }
    if (
      alignment.unwrittenStrongVowels + alignment.unmatchedWrittenVowels > 0 ||
      alignment.unwrittenFinalVowel
    ) {
      return false;
    }
  }
  return alignment.similarity >= minimumSimilarity(alignment.latinConsonants);
}

const hebrewPattern = /[א-ת]/u;
const latinPattern = /[a-zà-ÿ]/iu;

function toPhoneticToken(text: string): PhoneticToken {
  const hasHebrew = hebrewPattern.test(text);
  const hasLatin = latinPattern.test(text);
  if (hasHebrew && !hasLatin) {
    return { text, hebrew: toHebrewUnits(text) };
  }
  if (hasLatin && !hasHebrew) {
    return { text, latin: toLatinReadings(text) };
  }
  return { text };
}

/** The phonetic form of a normalized brand name, one entry per word. */
export function toPhoneticName(normalizedText: string): PhoneticName {
  return {
    tokens: normalizedText.split(" ").filter(Boolean).map(toPhoneticToken),
  };
}

interface TokenMatch {
  similarity: number;
  consonants: number;
  orthography: Orthography;
  rendered: string;
}

function matchHebrewToLatin(
  units: readonly HebrewUnit[],
  readings: readonly LatinReading[],
): TokenMatch | undefined {
  let best: TokenMatch | undefined;
  for (const latinReading of readings) {
    const alignment = alignPhonetically(units, latinReading.symbols, latinReading.penalty);
    if (!admitsPhoneticAlignment(alignment)) {
      continue;
    }
    if (!best || alignment.similarity > best.similarity) {
      best = {
        similarity: alignment.similarity,
        consonants: alignment.latinConsonants,
        orthography: latinReading.orthography,
        rendered: renderSymbols(latinReading.symbols),
      };
    }
  }
  return best;
}

function matchTokens(first: PhoneticToken, second: PhoneticToken): TokenMatch | undefined {
  if (first.hebrew && second.latin) {
    return matchHebrewToLatin(first.hebrew, second.latin);
  }
  if (first.latin && second.hebrew) {
    return matchHebrewToLatin(second.hebrew, first.latin);
  }
  // Words in the same script, or digits, pair only when written identically; fuzzy same-script
  // matching is the other generator's job.
  if (first.text === second.text) {
    return { similarity: 1, consonants: first.text.length, orthography: "LITERAL", rendered: first.text };
  }
  return undefined;
}

function isSingleScript(name: PhoneticName, script: "hebrew" | "latin"): boolean {
  return name.tokens.every((token) => token[script] !== undefined);
}

/**
 * Matches the two names written as one word each, for names split differently on either side:
 * דאון טאון against DOWNTOWN.
 */
function matchJoined(input: PhoneticName, candidate: PhoneticName): TokenMatch | undefined {
  const joined = (name: PhoneticName): string => name.tokens.map((token) => token.text).join("");
  if (isSingleScript(input, "hebrew") && isSingleScript(candidate, "latin")) {
    return matchHebrewToLatin(toHebrewUnits(joined(input)), toLatinReadings(joined(candidate)));
  }
  if (isSingleScript(input, "latin") && isSingleScript(candidate, "hebrew")) {
    return matchHebrewToLatin(toHebrewUnits(joined(candidate)), toLatinReadings(joined(input)));
  }
  return undefined;
}

/**
 * Compares two names word by word, pairing each word with its best counterpart, and classifies
 * what is left over. Returns nothing when the names are not the same name or one's extension.
 */
export function matchPhoneticNames(input: PhoneticName, candidate: PhoneticName): PhoneticMatch | undefined {
  const inputTokens = input.tokens;
  const candidateTokens = candidate.tokens;
  if (inputTokens.length === 0 || candidateTokens.length === 0) {
    return undefined;
  }

  const pairs: Array<{ inputIndex: number; candidateIndex: number; match: TokenMatch }> = [];
  inputTokens.forEach((inputToken, inputIndex) => {
    candidateTokens.forEach((candidateToken, candidateIndex) => {
      const match = matchTokens(inputToken, candidateToken);
      if (match) {
        pairs.push({ inputIndex, candidateIndex, match });
      }
    });
  });
  pairs.sort((first, second) => second.match.similarity - first.match.similarity);

  // Greedy pairing is exact enough for brand names of a handful of words.
  const pairedInput = new Map<number, number>();
  const pairedCandidate = new Set<number>();
  const chosenPairs: typeof pairs = [];
  for (const pair of pairs) {
    if (pairedInput.has(pair.inputIndex) || pairedCandidate.has(pair.candidateIndex)) {
      continue;
    }
    pairedInput.set(pair.inputIndex, pair.candidateIndex);
    pairedCandidate.add(pair.candidateIndex);
    chosenPairs.push(pair);
  }
  // Reported in the brand's own word order, whatever order the pairing found them in.
  const chosen = chosenPairs
    .sort((first, second) => first.candidateIndex - second.candidateIndex)
    .map((pair) => pair.match);

  const joined =
    inputTokens.length > 1 || candidateTokens.length > 1 ? matchJoined(input, candidate) : undefined;
  const allInput = pairedInput.size === inputTokens.length;
  const allCandidate = pairedCandidate.size === candidateTokens.length;

  if (allInput && allCandidate && chosen.length > 0) {
    const tokenwise = summarize(chosen);
    return joined && joined.similarity > tokenwise.similarity
      ? { ...describe(joined), relation: "SAME" }
      : { ...tokenwise, relation: "SAME" };
  }
  if (joined) {
    return { ...describe(joined), relation: "SAME" };
  }
  if (chosen.length === 0 || (!allInput && !allCandidate)) {
    return undefined;
  }

  // One name is the other plus extra words, like a product line of the same brand.
  const shorterIsInput = allInput;
  const pairedLongerIndexes = shorterIsInput
    ? [...pairedInput.values()]
    : [...pairedInput.keys()];
  const opensLongerName = pairedLongerIndexes.every((index) => index < chosen.length);
  const consonants = chosen.reduce((sum, match) => sum + match.consonants, 0);
  if (!opensLongerName && consonants < SUBSET_MINIMUM_CONSONANTS) {
    return undefined;
  }
  if (consonants < SUBSET_OPENING_MINIMUM_CONSONANTS) {
    return undefined;
  }
  return { ...summarize(chosen), relation: "SUBSET", longer: shorterIsInput ? "CANDIDATE" : "INPUT" };
}

function describe(match: TokenMatch): Omit<PhoneticMatch, "relation"> {
  return { similarity: match.similarity, orthography: match.orthography, rendered: match.rendered };
}

/** Combines word matches, weighting each by how many consonants it carries. */
function summarize(matches: readonly TokenMatch[]): Omit<PhoneticMatch, "relation"> {
  let weightedSimilarity = 0;
  let totalWeight = 0;
  let strongest = matches[0];
  for (const match of matches) {
    const weight = Math.max(1, match.consonants);
    weightedSimilarity += match.similarity * weight;
    totalWeight += weight;
    if (match.consonants > strongest.consonants) {
      strongest = match;
    }
  }
  return {
    similarity: weightedSimilarity / totalWeight,
    orthography: strongest.orthography,
    rendered: matches.map((match) => match.rendered).join(" "),
  };
}

function latinTokenKeys(readings: readonly LatinReading[]): string[] {
  const keys = new Set<string>();
  for (const latinReading of readings) {
    keys.add(latinReading.symbols.map(retrievalClass).filter(Boolean).join(""));
  }
  return [...keys];
}

/**
 * Every retrieval key a Hebrew word can reduce to. Most letters file under a single class; ו can be
 * a vowel or v, and כ a k or a silent-ish kh, so each of those doubles the keys, up to a cap.
 */
function hebrewTokenKeys(units: readonly HebrewUnit[]): string[] {
  let keys = new Set<string>([""]);
  for (const unit of units) {
    const fragments = new Set<string>();
    for (const option of unit.readings) {
      fragments.add(option.symbols.map(retrievalClass).filter(Boolean).join(""));
    }
    if (fragments.size === 0 || !unit.consonantal) {
      fragments.add("");
    }
    const next = new Set<string>();
    for (const key of keys) {
      for (const fragment of fragments) {
        if (next.size < MAXIMUM_HEBREW_KEYS) {
          next.add(key + fragment);
        }
      }
    }
    keys = next;
  }
  return [...keys];
}

function tokenKeys(token: PhoneticToken): string[] {
  if (token.hebrew) {
    return hebrewTokenKeys(token.hebrew);
  }
  if (token.latin) {
    return latinTokenKeys(token.latin);
  }
  return [];
}

export interface PhoneticKeys {
  /** Consonant-class keys for each word, and for the whole name when it has several words. */
  exact: string[];
  /** Each long key with one consonant removed, so a name one consonant apart still meets it. */
  deletions: string[];
}

export function phoneticKeys(name: PhoneticName): PhoneticKeys {
  const exact = new Set<string>();
  const perToken = name.tokens.map(tokenKeys);
  for (const keys of perToken) {
    for (const key of keys) {
      if (key) {
        exact.add(key);
      }
    }
  }
  if (perToken.length > 1) {
    let combined = [""];
    for (const keys of perToken) {
      const options = keys.length > 0 ? keys : [""];
      combined = combined.flatMap((prefix) => options.map((key) => prefix + key)).slice(0, MAXIMUM_HEBREW_KEYS);
    }
    for (const key of combined) {
      if (key) {
        exact.add(key);
      }
    }
  }

  const deletions = new Set<string>();
  for (const key of exact) {
    if (key.length < DELETION_KEY_MINIMUM_LENGTH) {
      continue;
    }
    for (let index = 0; index < key.length; index += 1) {
      deletions.add(key.slice(0, index) + key.slice(index + 1));
    }
  }
  return { exact: [...exact], deletions: [...deletions] };
}
