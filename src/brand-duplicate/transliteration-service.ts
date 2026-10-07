import { normalizeBrandName } from "./brand-normalizer.js";
import { getBrandOverrides, toOverrideKey } from "./brand-overrides.js";
import type { TransliterationVariant } from "./types.js";

/**
 * A romanization option and how unusual it is: 0 is the canonical reading, 1 a common
 * alternative, 2 a spelling that only shows up in borrowed brand names. Expansion keeps the
 * cheapest combinations, so exotic readings stay reachable without swamping the ordinary ones.
 */
type TransliterationOption = readonly [text: string, cost: number];

/**
 * A letter group read as one unit. `final` restricts it to the end of a word, where a Hebrew
 * ending stands for a Latin one: קליניק is CLINIQUE, but a medial יק is just two letters.
 */
type HebrewUnit = readonly [text: string, options: readonly TransliterationOption[], position?: "final"];

/** Digraphs and geresh forms, matched before single letters so the longest unit wins. */
const hebrewUnitOptions: readonly HebrewUnit[] = [
  ["ג'", [["j", 0], ["g", 1], ["dj", 2]]],
  ["צ'", [["ch", 0], ["tch", 2], ["cc", 2], ["c", 2]]],
  ["ז'", [["zh", 0], ["j", 0], ["g", 1], ["z", 1]]],
  // A geresh turns shin into a plain "s"; without it the letter reads "sh".
  ["ש'", [["s", 0]]],
  ["ת'", [["th", 0]]],
  // Foreign sounds Hebrew marks with a geresh, mostly in Arabic-origin names.
  ["ד'", [["d", 0], ["dh", 1], ["th", 1]]],
  ["ח'", [["kh", 0], ["ch", 0], ["h", 1]]],
  ["ע'", [["gh", 1], ["g", 1]]],
  // Borrowed-name endings: CLINIQUE/קליניק, EUPHORIA/אופוריה.
  ["יק", [["ik", 0], ["ic", 0], ["ique", 1], ["ick", 1]], "final"],
  ["יה", [["ia", 0], ["ya", 0], ["ie", 1], ["i", 1], ["iya", 2]], "final"],
  // Latin only writes ס as "c" before a vowel, so a word-final ס keeps its plain reading.
  ["ס", [["s", 0]], "final"],
  // A double yod is a diphthong or a consonantal y, which Latin writes as a pair of letters or as
  // the single vowel it sounds like: מייבלין/MAYBELLINE, בייבי/BABY, זייס/ZEISS.
  ["יי", [["y", 0], ["i", 0], ["ai", 0], ["ei", 0], ["a", 1], ["ay", 1], ["ey", 1], ["iy", 1], ["ee", 2]]],
  ["וו", [["v", 0], ["ve", 1], ["w", 2]]],
  // A word-initial alef+vav carries a rounded vowel that English spells several ways, none of
  // which the letters produce one at a time: אופוריה is "euphoria", not "avporia". Only the
  // readings the per-letter table cannot reach are listed; "av" and "aw" already fall out of
  // expanding א and ו separately, and repeating them here only widens the beam.
  ["או", [["o", 0], ["u", 0], ["eu", 0], ["ou", 1], ["au", 1]]],
  // Alef+yod opens a word with a front vowel: איריס/iris, אייס/ace.
  ["אי", [["i", 0], ["e", 0], ["ei", 1], ["ai", 1]]],
];

const hebrewCharacterOptions: Record<string, readonly TransliterationOption[]> = {
  א: [["a", 0], ["", 0], ["e", 2]],
  ב: [["b", 0], ["v", 1]],
  ג: [["g", 0]],
  ד: [["d", 0]],
  ה: [["h", 0], ["", 0], ["a", 1], ["e", 1]],
  // A single vav often carries a long vowel that Latin spells with two letters: מוי/MOOI, זום/zoom.
  ו: [["v", 0], ["o", 0], ["u", 0], ["ve", 1], ["w", 2], ["", 2], ["oo", 2], ["uu", 2]],
  ז: [["z", 0], ["s", 2]],
  ח: [["h", 0], ["ch", 1], ["kh", 1]],
  ט: [["t", 0]],
  י: [["i", 0], ["y", 0], ["", 0], ["e", 1], ["ie", 2], ["ee", 2]],
  כ: [["k", 0], ["kh", 1], ["ch", 2]],
  ך: [["k", 0], ["kh", 1], ["ch", 2]],
  ל: [["l", 0], ["el", 2]],
  מ: [["m", 0]],
  ם: [["m", 0]],
  נ: [["n", 0], ["en", 1]],
  ן: [["n", 0]],
  // Latin writes this sound "c" before a front vowel: CINEMA/סינמה, CELL/סל.
  ס: [["s", 0], ["c", 1]],
  ע: [["a", 0], ["", 0]],
  // Borrowed names often spell this sound "ph" (EUPHORIA, PHILIPS), which the single letter פ
  // must be able to reach or the Hebrew spelling can never line up with the Latin one.
  פ: [["p", 0], ["f", 1], ["ph", 0]],
  ף: [["p", 0], ["f", 1], ["ph", 0]],
  צ: [["ts", 0], ["tz", 0], ["c", 0], ["s", 2], ["cc", 2], ["ce", 2], ["z", 2]],
  ץ: [["ts", 0], ["tz", 0], ["c", 0], ["z", 2]],
  // Most borrowed names spell this sound "c": CLARINS/קלרינס, COLGATE/קולגייט.
  ק: [["k", 0], ["c", 1], ["q", 1], ["ck", 2]],
  ר: [["r", 0]],
  ש: [["sh", 0], ["ch", 2]],
  ת: [["t", 0], ["th", 1], ["s", 2]],
};

/** Widest intermediate frontier kept while expanding one name. */
const EXPANSION_BEAM = 512;
/**
 * Variants kept for an incoming name, where recall matters most. Sized so the doubled-vowel
 * readings of vav cannot push an established target out of range: at 96 they moved
 * גוצי/gucci to rank 86.
 */
const QUERY_VARIANT_BUDGET = 128;
/** Variants kept per indexed brand; index entries are the false-positive surface. */
export const INDEX_VARIANT_BUDGET = 24;
/**
 * Indexed brands keep only near-canonical spellings. Speculative readings belong on the query
 * side: storing them makes unrelated names collide (a Hebrew brand indexed under an invented
 * spelling starts matching Latin brands that merely resemble that spelling).
 */
export const INDEX_VARIANT_MAX_COST = 1;

const commonBrandRepresentations = new Map<string, string[]>([
  ["אדידס", ["adidas", "adids"]],
  ["אדידאס", ["adidas", "adidas"]],
  ["נייקי", ["nike", "nikey", "niki"]],
  ["לוריאל", ["loreal", "l'oreal"]],
  ["זיבנשי", ["givenchy", "givenchi", "zhivanshi"]],
  // Generated spellings only reach "niutrogn", too far from the Latin brand to score as a match.
  ["ניוטרוגינה", ["neutrogena"]],
  ["קמיל בלו nature", ["kamil blue nature"]],
]);

/**
 * The consonants of a romanized name, with vowels and doubled letters removed. Hebrew writes
 * consonants and long vowels but not short ones, so a Hebrew spelling and its Latin original
 * agree on consonants while their vowels differ: נטורל דיאט romanizes to "nturl diat", which
 * shares the skeleton "ntrldt" with "natural diet". Vav is dropped along with the vowels because
 * it serves as both.
 */
export function toConsonantSkeleton(value: string): string {
  return value
    .toLowerCase()
    // "ph" is one sound written with two letters. It, "f" and "p" are all spellings of the single
    // Hebrew letter פ, so all three fold together: otherwise EUPHORIA reduces to "fr" while its
    // Hebrew spelling reduces to "pr" and the two never line up.
    .replace(/ph/gu, "p")
    .replace(/f/gu, "p")
    // Latin spells the /k/ sound "c", "k" and "q", but Hebrew writes only ק, so a romanized
    // Hebrew spelling reaches for "k" while the brand is written with "c": CLARINS reduces to
    // "clrns" and קלרינס to "klrns". The same letter also carries "ch" in a borrowed name
    // (cacharel/קשרל), and "x" is a written-out /ks/ (XERJOFF/קסרגוף). Folding them all to "k"
    // is what lets the two spellings line up.
    .replace(/x/gu, "ks")
    .replace(/ch/gu, "k")
    .replace(/[cq]/gu, "k")
    .replace(/[aeiouwyv]/gu, "")
    // A trailing "h" only marks a vowel (Hebrew ה, English "-ah"), so it carries no consonant.
    .replace(/h(?![a-z])/gu, "")
    .replace(/(.)\1+/gu, "$1")
    .replace(/[^a-z0-9]/gu, "");
}

function normalizeVariants(values: Iterable<TransliterationVariant>): TransliterationVariant[] {
  const variantsByValue = new Map<string, TransliterationVariant>();
  for (const variant of values) {
    const normalizedValue = normalizeBrandName(variant.value);
    if (!normalizedValue) {
      continue;
    }
    const normalizedVariant = { ...variant, value: normalizedValue };
    const current = variantsByValue.get(normalizedValue);
    if (!current || normalizedVariant.confidence > current.confidence) {
      variantsByValue.set(normalizedValue, normalizedVariant);
    }
  }
  return [...variantsByValue.values()];
}

export class TransliterationService {
  transliterateHebrewToLatin(value: string | null | undefined): string[] {
    return this.getLatinVariants(value).map((variant) => variant.value);
  }

  getLatinVariants(
    value: string | null | undefined,
    budget: number = QUERY_VARIANT_BUDGET,
    maxCost: number = Number.POSITIVE_INFINITY,
  ): TransliterationVariant[] {
    if (typeof value !== "string" || !value) {
      return [];
    }

    if (!/[\u0590-\u05FF]/u.test(value)) {
      const normalizedValue = normalizeBrandName(value);
      return normalizedValue
        ? [{ value: normalizedValue, source: "ORIGINAL", confidence: 1 }]
        : [];
    }

    const normalized = toOverrideKey(value);
    const knownRepresentations = [
      ...(commonBrandRepresentations.get(normalized) ?? []),
      ...(getBrandOverrides().hebrewToLatin.get(normalized) ?? []),
    ];
    const generated = [...acronymVariants(value), ...this.generateVariants(value, budget, maxCost)];
    return normalizeVariants([
      ...knownRepresentations.map((variant) => ({
        value: variant,
        source: "CURATED" as const,
        confidence: 1,
      })),
      ...generated.map((variant) => ({
        value: variant.text,
        source: "GENERATED" as const,
        // Spellings built from unusual readings are much weaker evidence than canonical ones:
        // they exist to widen recall, so they must not outrank a plainly-spelled match.
        confidence: Math.max(0.2, 0.75 - 0.16 * variant.cost),
      })),
    ]).slice(0, budget);
  }

  toLatinVariants(value: string | null | undefined): string[] {
    if (typeof value !== "string" || !value.trim()) {
      return [];
    }

    return this.getLatinVariants(value).map((variant) => variant.value);
  }

  toComparableLatin(value: string): string {
    return normalizeBrandName(value).replace(/[']/gu, "");
  }

  /**
   * Expands a Hebrew name into candidate romanizations, cheapest first. Pruning by accumulated
   * cost rather than by string order keeps alternatives from every position alive, which a
   * lexicographic cut does not: it would keep only spellings sharing the first letter's reading.
   */
  private generateVariants(value: string, budget: number, maxCost: number): GeneratedVariant[] {
    // Geresh is written both as U+05F3 and as a plain apostrophe; normalize so units match once.
    const source = value.replace(/׳/gu, "'");
    let states = new Map<string, number>([["", 0]]);
    let index = 0;

    while (index < source.length) {
      const unit = hebrewUnitOptions.find(
        ([prefix, , position]) =>
          source.startsWith(prefix, index) &&
          (position !== "final" || isWordEnd(source, index + prefix.length)),
      );
      const options = unit ? unit[1] : hebrewCharacterOptions[source[index]];
      const advance = unit ? unit[0].length : 1;
      const expansions = options ?? ([[source[index], 0]] as const);

      const next = new Map<string, number>();
      for (const [prefix, prefixCost] of states) {
        for (const [text, cost] of expansions) {
          const candidateCost = prefixCost + cost;
          // Cost only accumulates, so a branch already over budget can never come back under it.
          // Dropping it here keeps indexing from expanding spellings it would discard at the end.
          if (candidateCost > maxCost) {
            continue;
          }
          const candidate = prefix + text;
          const existing = next.get(candidate);
          if (existing === undefined || candidateCost < existing) {
            next.set(candidate, candidateCost);
          }
        }
      }

      states = new Map(
        [...next.entries()].sort((first, second) => first[1] - second[1]).slice(0, EXPANSION_BEAM),
      );
      index += advance;
    }

    return [...states.entries()]
      .sort((first, second) => first[1] - second[1])
      .slice(0, budget)
      .map(([text, cost]) => ({ text, cost }));
  }
}

interface GeneratedVariant {
  text: string;
  cost: number;
}

/** True when a word ends at `index`: the string ends there or a space follows. */
function isWordEnd(value: string, index: number): boolean {
  return index >= value.length || value[index] === " ";
}

/** Most letter combinations tried for an acronym whose letter names are ambiguous (איי is A or I). */
const MAXIMUM_ACRONYM_READINGS = 8;

/**
 * A Latin acronym written out as Hebrew letter names reads back as its letters: סי קיי is CK.
 * Only names of two words or more are read this way, since a single word such as אל or סי is far
 * more often a word of its own than one spelled-out letter.
 */
function acronymVariants(value: string): GeneratedVariant[] {
  const words = normalizeBrandName(value).split(" ").filter(Boolean);
  if (words.length < 2) {
    return [];
  }
  const lettersByName = new Map<string, string[]>();
  for (const [letter, name] of getBrandOverrides().letterNames) {
    lettersByName.set(name, [...(lettersByName.get(name) ?? []), letter.toLowerCase()]);
  }

  let readings = [""];
  for (const word of words) {
    const letters = lettersByName.get(word);
    if (!letters) {
      return [];
    }
    readings = readings
      .flatMap((reading) => letters.map((letter) => reading + letter))
      .slice(0, MAXIMUM_ACRONYM_READINGS);
  }
  return readings.flatMap((reading) => [
    { text: reading, cost: 0 },
    { text: reading.split("").join(" "), cost: 1 },
  ]);
}