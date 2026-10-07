import type { PhoneticSymbol } from "./phonetic-alphabet.js";

/**
 * How a Latin brand name is pronounced, read by the orthography of each language it might come
 * from. Hebrew spells what it hears, so the Hebrew side of a pairing can only be compared with the
 * sound of a Latin name, never its letters, and the sound depends on the origin language:
 *
 * - French: GARNIER ends in a silent r, PAYOT in a silent t, and cacharel says "ch" as ש.
 * - Italian: GUCCI says "cc" as צ', and CARRERA doubles an r Hebrew writes once.
 * - German: ZEISS says "ei" as יי, and LOEWE says both of its final vowels.
 * - Literal: many Hebrew spellings follow the letters rather than the sound, sounding out every
 *   vowel letter. COACH is written קואץ, with the "oa" as two vowels.
 */
export type Orthography = "EN" | "FR" | "IT" | "DE" | "LITERAL";

export interface LatinReading {
  orthography: Orthography;
  symbols: readonly PhoneticSymbol[];
  /** Added to the alignment cost: a reading guessed without evidence is weaker than one with it. */
  penalty: number;
}

/**
 * The penalty for reading a name by French, Italian or German rules when nothing in its spelling
 * points to that language. It only has to break ties: CLOUD read as French (silent d) otherwise
 * sounds exactly like קלואה, which is Chloé.
 */
const CUELESS_READING_PENALTY = 0.15;
/**
 * For the second-choice readings: letter-by-letter spelling, common but less faithful than a real
 * pronunciation, and the English diphthong reading of "ow"/"ou". Enough to lose a tie.
 */
const ALTERNATE_READING_PENALTY = 0.05;

const frenchCues =
  /[éèêëàâçôûîïù]|(?:eau|eaux|ier|iere|ière|ette|ique|ois|oise|ault|aux|eux|oux|ais|ait|elle)$/u;
const italianCues =
  /zz|gli|cch|cci|cce|sci|sce|ggi|gge|(?:ini|ino|ina|ello|ella|etti|etto|etta|ucci|acci|ozzi|azzi|one|oni|ese|elli)$/u;
const germanCues = /sch|tz|ß|ei|oe|ae|mann|berg|stein|dorf|haus|werk/u;

interface RuleContext {
  word: string;
  start: number;
  end: number;
}

interface Rule {
  letters: string;
  symbols: readonly PhoneticSymbol[];
  when?: (context: RuleContext) => boolean;
}

const isVowelLetter = (letter: string | undefined): boolean =>
  letter !== undefined && letter.length === 1 && "aeiouy".includes(letter);
const atStart = (context: RuleContext): boolean => context.start === 0;
const atEnd = (context: RuleContext): boolean => context.end === context.word.length;
const beforeVowel = (context: RuleContext): boolean => isVowelLetter(context.word[context.end]);
const afterConsonant = (context: RuleContext): boolean =>
  context.start > 0 && !isVowelLetter(context.word[context.start - 1]);
const beforeSoftVowel = (context: RuleContext): boolean => {
  const next = context.word[context.end];
  return next !== undefined && "eiy".includes(next);
};
const betweenVowels = (context: RuleContext): boolean =>
  isVowelLetter(context.word[context.start - 1]) && isVowelLetter(context.word[context.end]);

const rule = (
  letters: string,
  symbols: readonly PhoneticSymbol[],
  when?: (context: RuleContext) => boolean,
): Rule => ({ letters, symbols, when });

/** The default sound of each letter, consulted after a language's own rules. */
const baseRules: readonly Rule[] = [
  rule("x", ["K", "S"]),
  rule("a", ["a"]),
  rule("e", ["e"]),
  rule("i", ["i"]),
  rule("o", ["o"]),
  rule("u", ["u"]),
  rule("y", ["Y"], (context) => atStart(context) && beforeVowel(context)),
  rule("y", ["i"]),
  rule("b", ["B"]),
  rule("d", ["D"]),
  rule("f", ["P"]),
  rule("h", ["H"]),
  rule("k", ["K"]),
  rule("l", ["L"]),
  rule("m", ["M"]),
  rule("n", ["N"]),
  rule("p", ["P"]),
  rule("q", ["K"]),
  rule("r", ["R"]),
  rule("t", ["T"]),
  rule("v", ["V"]),
  rule("s", ["Z"], betweenVowels),
  rule("s", ["S"]),
  rule("z", ["Z"]),
  rule("c", ["S"], beforeSoftVowel),
  rule("c", ["K"]),
  rule("g", ["J"], beforeSoftVowel),
  rule("g", ["G"]),
  rule("j", ["J"]),
  rule("w", ["V"], beforeVowel),
  rule("w", []),
];

const englishRules: readonly Rule[] = [
  // A silent final e after a consonant: DOVE, GILLETTE, CONVERSE.
  rule("e", [], (context) => atEnd(context) && afterConsonant(context) && context.word.length > 2),
  rule("tch", ["CH"]),
  rule("sch", ["S", "K"]),
  // Before l or r, "ch" is the Greek k: CHLOE, CHROME.
  rule("chl", ["K", "L"]),
  rule("chr", ["K", "R"]),
  rule("ch", ["CH"]),
  rule("sh", ["SH"]),
  rule("ph", ["P"]),
  rule("th", ["T"]),
  rule("ck", ["K"]),
  rule("que", ["K"], atEnd),
  rule("qu", ["K", "V"]),
  // The u after g only keeps the g hard: GUESS, GUIDE, VOGUE.
  rule("gue", ["G"], atEnd),
  rule("gue", ["G", "e"]),
  rule("gui", ["G", "i"]),
  rule("gh", ["G"], atStart),
  rule("gh", []),
  rule("kn", ["N"], atStart),
  rule("wr", ["R"], atStart),
  rule("wh", ["V"]),
  rule("ee", ["i"]),
  rule("ea", ["i"]),
  rule("ie", ["i"]),
  rule("oo", ["u"]),
  rule("ou", ["u"]),
  rule("ew", ["u"]),
  rule("ue", ["u"]),
  rule("oa", ["o"]),
  rule("oe", ["o"]),
  rule("ai", ["ei"]),
  rule("ay", ["ei"]),
  rule("ei", ["ei"]),
  rule("ey", ["ei"]),
  rule("au", ["o"]),
  rule("aw", ["o"]),
  rule("ow", ["o"]),
  rule("oy", ["o", "i"]),
  rule("oi", ["o", "i"]),
  // An r-coloured vowel is a neutral schwa, which Hebrew leaves unwritten: BURBERRY → ברברי.
  rule("ur", ["e", "R"], (context) => !beforeVowel(context)),
  rule("ir", ["e", "R"], (context) => !beforeVowel(context)),
  rule("er", ["e", "R"], (context) => !beforeVowel(context)),
  // "al" before l, w, k or t is said "awl": ALWAYS → אולוויז.
  rule("al", ["o", "L"], (context) => "lwkt".includes(context.word[context.end] ?? "#")),
];

const frenchRules: readonly Rule[] = [
  rule("ier", ["i", "e"], atEnd),
  rule("er", ["e"], atEnd),
  rule("ez", ["e"], atEnd),
  rule("eaux", ["o"], atEnd),
  rule("eau", ["o"]),
  // Final e is mute, and so are most final consonants: PAYOT, HERMES.
  rule("e", [], atEnd),
  rule("t", [], atEnd),
  rule("d", [], atEnd),
  rule("s", [], atEnd),
  rule("x", [], atEnd),
  rule("z", [], atEnd),
  rule("p", [], atEnd),
  rule("ill", ["i", "Y"], (context) => context.start > 0),
  rule("ou", ["u"]),
  rule("au", ["o"]),
  rule("oi", ["V", "a"]),
  rule("ai", ["e"]),
  rule("ei", ["e"]),
  rule("eu", ["e"]),
  rule("ch", ["SH"]),
  rule("que", ["K"], atEnd),
  rule("qu", ["K"]),
  rule("gue", ["G"], atEnd),
  rule("gue", ["G", "e"]),
  rule("gui", ["G", "i"]),
  rule("gn", ["N", "Y"]),
  rule("ph", ["P"]),
  rule("th", ["T"]),
  rule("h", []),
  rule("c", ["S"], beforeSoftVowel),
  rule("g", ["ZH"], beforeSoftVowel),
  rule("j", ["ZH"]),
  rule("w", ["V"]),
];

const italianRules: readonly Rule[] = [
  rule("sch", ["S", "K"]),
  rule("sce", ["SH", "e"]),
  rule("sci", ["SH", "i"]),
  rule("gli", ["L", "Y", "i"]),
  rule("gn", ["N", "Y"]),
  rule("cch", ["K"]),
  rule("ch", ["K"]),
  rule("gh", ["G"]),
  // Before another vowel the i only softens the consonant: GOCCIA is "gocha", GIORGIO "jorjo".
  rule("scia", ["SH", "a"]),
  rule("scio", ["SH", "o"]),
  rule("sciu", ["SH", "u"]),
  rule("ccia", ["CH", "a"]),
  rule("ccio", ["CH", "o"]),
  rule("cciu", ["CH", "u"]),
  rule("ggia", ["J", "a"]),
  rule("ggio", ["J", "o"]),
  rule("ggiu", ["J", "u"]),
  rule("cia", ["CH", "a"]),
  rule("cio", ["CH", "o"]),
  rule("ciu", ["CH", "u"]),
  rule("gia", ["J", "a"]),
  rule("gio", ["J", "o"]),
  rule("giu", ["J", "u"]),
  rule("cc", ["CH"], beforeSoftVowel),
  rule("gg", ["J"], beforeSoftVowel),
  rule("c", ["CH"], beforeSoftVowel),
  rule("g", ["J"], beforeSoftVowel),
  rule("qu", ["K", "V"]),
  rule("ph", ["P"]),
  rule("th", ["T"]),
  rule("h", []),
  rule("zz", ["TS"]),
  rule("z", ["TS"]),
  rule("j", ["Y"]),
];

const germanRules: readonly Rule[] = [
  rule("tsch", ["CH"]),
  rule("sch", ["SH"]),
  rule("sp", ["SH", "P"], atStart),
  rule("st", ["SH", "T"], atStart),
  rule("tz", ["TS"]),
  rule("ch", ["H"]),
  rule("ck", ["K"]),
  rule("ph", ["P"]),
  rule("th", ["T"]),
  rule("qu", ["K", "V"]),
  rule("ei", ["ei"]),
  rule("ai", ["ei"]),
  rule("ey", ["ei"]),
  rule("ay", ["ei"]),
  rule("ie", ["i"]),
  rule("eu", ["o", "i"]),
  rule("au", ["a", "u"]),
  rule("z", ["TS"]),
  rule("w", ["V"]),
  rule("j", ["Y"]),
  rule("s", ["Z"], (context) => atStart(context) && beforeVowel(context)),
  // An h after a vowel only lengthens it.
  rule("h", [], (context) => context.start > 0 && isVowelLetter(context.word[context.start - 1])),
];

const literalRules: readonly Rule[] = [
  rule("ch", ["CH"]),
  rule("sh", ["SH"]),
  rule("ph", ["P"]),
  rule("th", ["T"]),
  rule("ck", ["K"]),
  rule("qu", ["K", "V"]),
  rule("tz", ["TS"]),
  rule("ts", ["TS"]),
  rule("s", ["S"]),
  rule("g", ["G"]),
  rule("w", ["V"]),
];

/**
 * English "ow" and "ou" are a single o in SNOW and SOUP but the diphthong au in DOWN and HOUSE,
 * and the spelling does not say which. Hebrew writes the diphthong as או after a consonant (דאון,
 * טאון, בראון), so the second sound gets a reading of its own rather than losing to the first.
 */
const englishDiphthongRules: readonly Rule[] = [rule("ow", ["a", "u"]), rule("ou", ["a", "u"])];

interface Reader {
  orthography: Orthography;
  rules: readonly Rule[];
  penalty: (word: string) => number;
}

const readers: readonly Reader[] = [
  { orthography: "EN", rules: [...englishRules, ...baseRules], penalty: () => 0 },
  {
    orthography: "EN",
    rules: [...englishDiphthongRules, ...englishRules, ...baseRules],
    penalty: () => ALTERNATE_READING_PENALTY,
  },
  {
    orthography: "FR",
    rules: [...frenchRules, ...baseRules],
    penalty: (word) => (frenchCues.test(word) ? 0 : CUELESS_READING_PENALTY),
  },
  {
    orthography: "IT",
    rules: [...italianRules, ...baseRules],
    penalty: (word) => (italianCues.test(word) ? 0 : CUELESS_READING_PENALTY),
  },
  {
    orthography: "DE",
    rules: [...germanRules, ...baseRules],
    penalty: (word) => (germanCues.test(word) ? 0 : CUELESS_READING_PENALTY),
  },
  { orthography: "LITERAL", rules: [...literalRules, ...baseRules], penalty: () => ALTERNATE_READING_PENALTY },
];

function readWord(word: string, rules: readonly Rule[]): PhoneticSymbol[] {
  const symbols: PhoneticSymbol[] = [];
  let index = 0;
  while (index < word.length) {
    const context = { word, start: index, end: index };
    const match = rules.find((candidate) => {
      if (!word.startsWith(candidate.letters, index)) {
        return false;
      }
      context.end = index + candidate.letters.length;
      return !candidate.when || candidate.when(context);
    });
    if (!match) {
      index += 1;
      continue;
    }
    symbols.push(...match.symbols);
    index += match.letters.length;
  }
  return collapseRepeats(symbols);
}

/** A doubled letter is one sound, and Hebrew writes it once: CARRERA → קררה, TOMMY → טומי. */
function collapseRepeats(symbols: readonly PhoneticSymbol[]): PhoneticSymbol[] {
  const collapsed: PhoneticSymbol[] = [];
  for (const symbol of symbols) {
    if (collapsed[collapsed.length - 1] !== symbol) {
      collapsed.push(symbol);
    }
  }
  return collapsed;
}

/**
 * Every distinct pronunciation of one Latin word. Readings that come out the same keep the
 * smallest penalty, so a name no rule set disagrees on costs nothing extra.
 */
export function toLatinReadings(word: string): LatinReading[] {
  const lowered = word.toLowerCase();
  const letters = lowered.normalize("NFD").replace(/[̀-ͯ]/gu, "").replace(/[^a-z]/gu, "");
  if (!letters) {
    return [];
  }

  const readings = new Map<string, LatinReading>();
  for (const reader of readers) {
    const symbols = readWord(letters, reader.rules);
    if (symbols.length === 0) {
      continue;
    }
    const key = symbols.join(" ");
    const penalty = reader.penalty(lowered);
    const current = readings.get(key);
    if (!current || penalty < current.penalty) {
      readings.set(key, { orthography: reader.orthography, symbols, penalty });
    }
  }
  return [...readings.values()];
}
