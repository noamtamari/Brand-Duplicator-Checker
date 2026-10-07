/**
 * The alphabet the cross-script matcher compares names in, and what each difference costs.
 *
 * Hebrew writes a brand's pronunciation and leaves short vowels out, while a Latin brand keeps the
 * spelling of its origin language, so the two rarely agree letter by letter: GARNIER ends in a
 * silent r that גרנייה never writes, and cacharel spells with "ch" the sound קשרל writes as ש.
 * Both scripts are therefore mapped onto one set of sound classes and compared there.
 *
 * Every cost the matcher uses lives in this file.
 */
export type Consonant =
  | "P" | "B" | "V" | "T" | "D" | "K" | "G" | "J" | "ZH" | "Z"
  | "S" | "SH" | "CH" | "TS" | "H" | "L" | "M" | "N" | "R" | "Y";
export type Vowel = "a" | "e" | "i" | "o" | "u" | "ei";
export type PhoneticSymbol = Consonant | Vowel;

const vowels: ReadonlySet<string> = new Set(["a", "e", "i", "o", "u", "ei"]);

export function isVowel(symbol: PhoneticSymbol): symbol is Vowel {
  return vowels.has(symbol);
}

/**
 * Consonants that are often silent or glide into the next vowel. Leaving one unwritten costs no
 * more than leaving out a vowel, and does not count against consonant coverage.
 */
const weakConsonants: ReadonlySet<string> = new Set(["H", "Y"]);

export function isStrongConsonant(symbol: PhoneticSymbol): boolean {
  return !isVowel(symbol) && !weakConsonants.has(symbol);
}

/**
 * Consonant pairs that are the same sound in one script or the other, and what confusing them
 * costs. A pair not listed here is a mismatch.
 *
 * - B/V: ב is either.
 * - S/Z: an s between vowels is voiced (ISOSTAR → איזוסטאר).
 * - G/J/ZH: ג without its geresh is routinely written for j (קסרגוף for XERJOFF).
 * - TS/CH: צ without its geresh stands for ch (קצרל for cacharel).
 * - SH/S: ש is either letter.
 * - K/H: כ reads both ways.
 *
 * Plain voicing pairs are deliberately absent. p/v, b/p, g/k and t/d sit in distinct Hebrew
 * letters that a writer does not confuse, and admitting them let invented names reach real brands:
 * "Orvexa" reached אורפיקס, and "Varnessa" reached פרנסה, each only by reading פ as v.
 */
const nearConsonantCosts: ReadonlyMap<string, number> = new Map([
  ["B|V", 0.2],
  ["S|Z", 0.2],
  ["G|J", 0.2],
  ["J|ZH", 0.2],
  ["G|ZH", 0.3],
  ["Z|ZH", 0.3],
  ["CH|TS", 0.2],
  ["S|TS", 0.35],
  ["TS|Z", 0.3],
  ["CH|SH", 0.3],
  ["S|SH", 0.3],
  ["H|K", 0.3],
]);

/** A consonant pair with no kinship at all. */
export const CONSONANT_MISMATCH_COST = 1;
/** A consonant set against a vowel is never a reading of either. */
const CONSONANT_VOWEL_COST = 1.2;

function pairKey(first: string, second: string): string {
  return first < second ? `${first}|${second}` : `${second}|${first}`;
}

/** What it costs to read one symbol as the other. */
export function substitutionCost(first: PhoneticSymbol, second: PhoneticSymbol): number {
  if (first === second) {
    return 0;
  }
  const firstIsVowel = isVowel(first);
  const secondIsVowel = isVowel(second);
  if (firstIsVowel && secondIsVowel) {
    return vowelSubstitutionCost(first, second);
  }
  // A consonantal y and the vowel i are the same sound on either side of a syllable break.
  if ((first === "Y" && second === "i") || (first === "i" && second === "Y")) {
    return 0.1;
  }
  if (!firstIsVowel && !secondIsVowel) {
    return nearConsonantCosts.get(pairKey(first, second)) ?? CONSONANT_MISMATCH_COST;
  }
  return CONSONANT_VOWEL_COST;
}

function vowelSubstitutionCost(first: Vowel, second: Vowel): number {
  const pair = pairKey(first, second);
  // ו writes both o and u, and an English "o" is often said u.
  if (pair === "o|u") {
    return 0.05;
  }
  // i, e and the diphthong ei trade places constantly between the two spellings: יי writes both
  // "ai" and "ei", and a final י writes an unstressed e.
  if (pair === "e|i" || pair === "e|ei" || pair === "ei|i") {
    return 0.12;
  }
  return 0.35;
}

/**
 * What a Latin sound costs when the Hebrew spelling wrote nothing for it.
 *
 * Hebrew routinely leaves a and e unwritten (מטרנה for Materna), usually writes i, and almost
 * always writes o and u with ו. An unwritten o or u is therefore evidence against the pairing, not
 * just a gap. A strong consonant left unwritten costs as much as a wrong one.
 */
export function unwrittenLatinCost(symbol: PhoneticSymbol): number {
  switch (symbol) {
    case "a":
    case "e":
      return 0.1;
    case "i":
    case "ei":
      return 0.3;
    case "o":
    case "u":
      return 0.6;
    case "H":
    case "Y":
      return 0.3;
    default:
      return CONSONANT_MISMATCH_COST;
  }
}

/** Latin o and u: Hebrew writes these, so leaving one out counts against a short name. */
export function isStrongVowel(symbol: PhoneticSymbol): boolean {
  return symbol === "o" || symbol === "u";
}

/**
 * Added when the unwritten sound is a word's final vowel. A loanword's final vowel is written
 * (מטרנה, קררה, טומי, אסקדה), so a Hebrew word ending on a consonant where the Latin name ends on
 * a vowel is a different name: "Zylora" is not סיילור.
 */
export const UNWRITTEN_FINAL_VOWEL_EXTRA = 0.35;

/**
 * The class a consonant is filed under for retrieval. Retrieval only has to put the right brand in
 * the pool, where alignment scores it properly, so it folds every pair a Hebrew spelling can
 * confuse into one class, and drops H and Y, which either spelling may leave silent.
 */
export function retrievalClass(symbol: PhoneticSymbol): string | undefined {
  switch (symbol) {
    case "B":
    case "V":
      return "B";
    case "S":
    case "Z":
    case "TS":
    case "SH":
    case "CH":
      return "S";
    case "G":
    case "J":
    case "ZH":
      return "G";
    case "H":
    case "Y":
      return undefined;
    default:
      return isVowel(symbol) ? undefined : symbol;
  }
}

/** A readable, lowercase rendering of a reading, for candidate reasons. */
export function renderSymbols(symbols: readonly PhoneticSymbol[]): string {
  return symbols.map((symbol) => symbol.toLowerCase()).join("");
}
