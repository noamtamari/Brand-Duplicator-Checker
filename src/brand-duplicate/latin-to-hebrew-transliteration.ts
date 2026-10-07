import { normalizeBrandName } from "./brand-normalizer.js";
import { getBrandOverrides, toOverrideKey } from "./brand-overrides.js";
import type { TransliterationVariant } from "./types.js";

/**
 * A Hebrew spelling option and how unusual it is: 0 is the reading a Hebrew writer would reach
 * for first, 1 a common alternative, 2 a spelling that only appears in borrowed brand names.
 */
type HebrewOption = readonly [text: string, cost: number];

/**
 * A Latin letter group read as one unit. `initial` and `final` restrict it to that end of the
 * word, where English spelling is silent: the k of KNOW, the b of CLIMB.
 */
type LatinUnit = readonly [text: string, options: readonly HebrewOption[], position?: "initial" | "final"];

/**
 * Latin units matched longest-first, so multi-letter sounds claim their letters before the
 * single-letter table sees them. Order within this list is the match order.
 *
 * The entries that matter for cross-script brand matching are the ones where English spelling and
 * Hebrew spelling disagree structurally rather than phonetically:
 *   - "ph" is one sound (פ), not פ+ה, so EUPHORIA must not generate a ה.
 *   - "eu"/"ou" open a word with the vowel carrier א plus ו: EUPHORIA -> אופוריה.
 *   - a trailing "ed" is a suffix Hebrew writes as a bare ד: SELECTED -> סלקטד.
 */
const latinUnitOptions: readonly LatinUnit[] = [
  // Four-letter units first. English writes these sounds with letters Hebrew has one sign for:
  // CULTURE -> קלצ'ר, PLEASURE -> פלז'ר, WEIGHT -> ווייט, DOUGH -> דו.
  ["ture", [["צ'ר", 0], ["טור", 1], ["טיור", 2]]],
  ["sure", [["ז'ר", 0], ["שור", 1]]],
  ["cian", [["שן", 0]]],
  ["eigh", [["יי", 0], ["י", 1]]],
  ["ough", [["ו", 0], ["אף", 1], ["אוף", 2]]],
  // Three-letter units next; "tch" would otherwise be split by "ch".
  ["tch", [["צ'", 0]]],
  ["dge", [["ג'", 0]]],
  ["igh", [["יי", 0], ["אי", 1]]],
  // An "al" before "w" carries the rounded vowel English spells "aw": ALWAYS is said "awl-ways"
  // and written אולוויז, where the "w" also doubles. Listed here so it wins over "aw" below.
  ["alw", [["אולוו", 1], ["אלוו", 1], ["לוו", 2]]],
  ["sch", [["ש", 0], ["סק", 1]]],
  ["eau", [["ו", 0], ["או", 1]]],
  // A silent final "e" lengthens the vowel before it instead of adding a letter of its own, and
  // Hebrew writes that long "i" as a double yod: LIFE -> לייף, not ליף. These must precede the
  // two-letter units below, since the list is scanned in order and "ie" would otherwise win.
  ["ife", [["ייף", 0], ["יף", 1]]],
  ["ike", [["ייק", 0], ["יק", 1]]],
  ["ine", [["יין", 0], ["ין", 1]]],
  ["ite", [["ייט", 0], ["יט", 1]]],
  ["ime", [["יים", 0], ["ים", 1]]],
  // The same silent "e" after an "a" or an "o": COLGATE -> קולגייט, CRAVE -> קרייב,
  // DOVE -> דאב. The vowel it lengthens is written, so the bare consonant reading stays available
  // one step up rather than being dropped.
  ["ate", [["ייט", 0], ["ט", 1], ["אט", 2]]],
  ["ave", [["ייב", 0], ["ב", 1], ["אב", 1], ["וו", 2]]],
  ["ove", [["וב", 0], ["אב", 0], ["ב", 1], ["וו", 2]]],
  ["ace", [["ייס", 0], ["ס", 1]]],
  // A "v" between two vowels doubles in Hebrew, which is how HAVANA reaches הוונה and LEVANTA
  // לוונטה. The single-vav reading stays one step up.
  ["av", [["וו", 0], ["ו", 1], ["או", 2]]],
  ["ev", [["וו", 0], ["ו", 1]]],
  ["ov", [["וו", 0], ["ו", 1]]],
  ["ch", [["צ'", 0], ["ש", 1], ["ח", 1], ["ק", 1]]],
  ["dj", [["ג'", 0], ["דז'", 2]]],
  ["kh", [["כ", 0], ["ח", 0]]],
  // Silent first letters: KNORR -> קנור is the exception that keeps the full reading one step up.
  ["kn", [["נ", 0], ["קנ", 1]], "initial"],
  ["wr", [["ר", 0], ["ור", 2]], "initial"],
  ["ps", [["ס", 0], ["פס", 0]], "initial"],
  ["rh", [["ר", 0]]],
  ["mb", [["מ", 0], ["מב", 1]], "final"],
  ["gn", [["נ", 0], ["ני", 1], ["גנ", 1]]],
  ["nk", [["נק", 0], ["נגק", 2]]],
  ["sh", [["ש", 0]]],
  // One sound, one letter: the "h" must not survive into the Hebrew spelling.
  ["ph", [["פ", 0]]],
  ["th", [["ת", 0], ["ט", 1]]],
  ["gh", [["ג", 0], ["", 1]]],
  ["wh", [["ו", 0], ["וו", 1]]],
  ["ck", [["ק", 0], ["ק", 0]]],
  // A "w" sound between vowels doubles, the same way "av"/"ev"/"ov" do above: QUAKER -> קוואקר,
  // where a single vav would read as the vowel "o" instead. Must precede the bare "qu" unit.
  ["qua", [["קווא", 0], ["קוא", 1], ["קו", 1], ["קווה", 2]]],
  ["qu", [["קו", 0], ["ק", 1]]],
  ["zh", [["ז'", 0]]],
  ["ts", [["צ", 0], ["טס", 1]]],
  ["tz", [["צ", 0]]],
  ["ng", [["נג", 0], ["נ", 1]]],
  // A doubled Latin consonant is one sound, and Hebrew writes it with one letter: TRESEMME ->
  // טרזמה, GILLETTE -> ג'ילט. Without these the expander emits מם/לל, which no brand is spelled
  // with. The doubled reading stays one step up for the names that do write both letters.
  ["mm", [["מ", 0], ["ממ", 2]]],
  ["ll", [["ל", 0], ["לל", 2]]],
  ["tt", [["ט", 0], ["טט", 2]]],
  ["ss", [["ס", 0], ["סס", 2]]],
  ["nn", [["נ", 0], ["ננ", 2]]],
  ["rr", [["ר", 0], ["רר", 2]]],
  ["ff", [["פ", 0], ["פפ", 2]]],
  ["pp", [["פ", 0], ["פפ", 2]]],
  ["bb", [["ב", 0], ["בב", 2]]],
  ["dd", [["ד", 0], ["דד", 2]]],
  ["gg", [["ג", 0], ["גג", 2]]],
  ["cc", [["ק", 0], ["ס", 1]]],
  ["oo", [["ו", 0], ["וו", 2]]],
  ["ee", [["י", 0], ["יי", 1]]],
  ["ea", [["י", 0], ["יא", 1], ["א", 2]]],
  ["ie", [["י", 0], ["יי", 1]]],
  ["ei", [["יי", 0], ["י", 1], ["אי", 2]]],
  ["ai", [["יי", 0], ["י", 1], ["אי", 2]]],
  ["ay", [["יי", 0], ["י", 1], ["אי", 2]]],
  ["ey", [["יי", 0], ["י", 1]]],
  ["oy", [["וי", 0], ["וי", 0]]],
  ["oi", [["וי", 0]]],
  ["au", [["ו", 0], ["או", 1]]],
  ["aw", [["ו", 0], ["או", 1]]],
  ["ou", [["ו", 0], ["או", 1], ["אוו", 2]]],
  ["ow", [["ו", 0], ["או", 1], ["אוו", 2]]],
  // A word-initial "eu" is carried by א, the same way Hebrew opens any vowel-initial word.
  ["eu", [["או", 0], ["יו", 1], ["ו", 1]]],
  ["ew", [["יו", 0], ["ו", 0]]],
  ["oa", [["ו", 0], ["או", 1]]],
  ["oe", [["ו", 0], ["או", 1], ["י", 2]]],
  ["ue", [["ו", 0], ["יו", 1], ["", 2]]],
  ["ui", [["ו", 0], ["וי", 1], ["י", 1]]],
];

const frontVowels = "eiy";

/**
 * English "c" and "g" are soft before a front vowel and hard elsewhere: CINEMA -> סינמה but
 * COLGATE -> קולגייט. The context-free table has to keep both readings cheap; looking one letter
 * ahead lets the likely reading lead and the other stay reachable.
 */
function contextualOptions(letter: string, next: string | undefined): readonly HebrewOption[] | undefined {
  const soft = next !== undefined && frontVowels.includes(next);
  if (letter === "c") {
    return soft
      ? [["ס", 0], ["ק", 1], ["צ'", 2], ["צ", 2]]
      : [["ק", 0], ["כ", 1], ["ס", 2]];
  }
  if (letter === "g") {
    return soft ? [["ג", 0], ["ג'", 1]] : [["ג", 0], ["ג'", 2]];
  }
  return undefined;
}

const latinCharacterOptions: Record<string, readonly HebrewOption[]> = {
  // Vowels are written in Hebrew only when they are long or word-initial, so every vowel keeps
  // an empty reading. That is what lets "selected" reach the vowel-less סלקטד.
  a: [["", 0], ["א", 0], ["ה", 1], ["ע", 2]],
  e: [["", 0], ["א", 1], ["י", 1], ["ה", 1], ["ע", 2]],
  i: [["י", 0], ["", 0], ["אי", 2]],
  o: [["ו", 0], ["", 1], ["או", 1]],
  u: [["ו", 0], ["", 1], ["או", 1]],
  y: [["י", 0], ["", 1], ["יי", 1]],
  b: [["ב", 0]],
  // English "c" is ק before a back vowel and ס before a front one; both stay cheap because the
  // expander has no reliable way to see which context it is in.
  c: [["ק", 0], ["ס", 0], ["כ", 1], ["צ", 2]],
  d: [["ד", 0]],
  f: [["פ", 0], ["ף", 1]],
  g: [["ג", 0], ["ג'", 1]],
  h: [["ה", 0], ["", 0], ["ח", 1]],
  j: [["ג'", 0], ["ז'", 1], ["י", 2]],
  k: [["ק", 0], ["כ", 1], ["ך", 2]],
  l: [["ל", 0]],
  m: [["מ", 0], ["ם", 1]],
  n: [["נ", 0], ["ן", 1]],
  p: [["פ", 0], ["ף", 2]],
  q: [["ק", 0]],
  r: [["ר", 0]],
  // An "s" between vowels is voiced in English and Hebrew writes that as ז: ISOSTAR -> איזוסטאר,
  // TRESEMME -> טרזמה. The expander cannot see the surrounding vowels, so the reading is one step
  // up rather than free — common enough in borrowed names to stay within reach of the budget.
  s: [["ס", 0], ["ש", 1], ["ז", 1]],
  t: [["ט", 0], ["ת", 1]],
  v: [["ו", 0], ["וו", 1], ["ב", 1]],
  w: [["ו", 0], ["וו", 1], ["ב", 2]],
  // Hebrew writes this as two letters. The second reading was "ks" — Latin text, which can never
  // match a Hebrew brand and cost half of every x-name's spellings; ק alone is the real alternative
  // (a final x reads "קס" but some names drop the ס sound).
  x: [["קס", 0], ["ק", 2]],
  z: [["ז", 0], ["ז'", 2]],
};

/**
 * Hebrew writes five letters differently at the end of a word. A generated spelling that puts the
 * medial form there would never match an indexed brand, so the final form is substituted back in.
 */
const finalFormByMedial: Record<string, string> = {
  כ: "ך",
  מ: "ם",
  נ: "ן",
  פ: "ף",
  צ: "ץ",
};

function applyFinalForms(value: string): string {
  return value
    .split(" ")
    .map((word) => {
      if (!word) {
        return word;
      }
      const last = word[word.length - 1];
      const final = finalFormByMedial[last];
      // A geresh belongs to the letter before it, so ג' must not be rewritten to ך'.
      return final ? `${word.slice(0, -1)}${final}` : word;
    })
    .join(" ");
}

/** Widest intermediate frontier kept while expanding one name. */
const EXPANSION_BEAM = 512;
/** Variants kept for an incoming Latin name, where recall matters most. */
const QUERY_VARIANT_BUDGET = 128;
/** Floor on each word's share of the budget, so a many-word name still expands each word usefully. */
const MINIMUM_PER_WORD_BUDGET = 12;

/**
 * English writes suffixes that Hebrew transcribes as a single letter or drops entirely. Applying
 * these before expansion keeps the beam from spending its width on the suffix's vowels.
 *
 * "selected" is the motivating case: the "-ed" is one ד, so the name must be expanded as
 * "select" + ד rather than as eight independent letters.
 */
const latinSuffixRules: ReadonlyArray<readonly [RegExp, string, number]> = [
  [/ed$/u, "ד", 0],
  [/es$/u, "ס", 1],
  [/er$/u, "ר", 0],
  [/or$/u, "ור", 0],
  [/le$/u, "ל", 0],
  [/tion$/u, "שן", 0],
  [/sion$/u, "שן", 0],
];

function splitSuffix(value: string): { stem: string; suffix: string; cost: number } | undefined {
  for (const [pattern, hebrew, cost] of latinSuffixRules) {
    if (pattern.test(value)) {
      const stem = value.replace(pattern, "");
      // A suffix rule that would consume most of the word says nothing useful about it.
      if (stem.length >= 3) {
        return { stem, suffix: hebrew, cost };
      }
    }
  }
  return undefined;
}

function normalizeVariants(values: Iterable<TransliterationVariant>): TransliterationVariant[] {
  const variantsByValue = new Map<string, TransliterationVariant>();
  for (const variant of values) {
    const normalizedValue = normalizeBrandName(variant.value);
    if (!normalizedValue) {
      continue;
    }
    const current = variantsByValue.get(normalizedValue);
    if (!current || variant.confidence > current.confidence) {
      variantsByValue.set(normalizedValue, { ...variant, value: normalizedValue });
    }
  }
  return [...variantsByValue.values()];
}

interface GeneratedVariant {
  text: string;
  cost: number;
}

/**
 * Expands a Latin brand name into the Hebrew spellings a person might plausibly have used when
 * entering the same brand. It mirrors {@link TransliterationService} in the other direction, so a
 * Latin input gets the same breadth of readings a Hebrew input already had.
 */
export class LatinToHebrewTransliterationService {
  getHebrewVariants(
    value: string | null | undefined,
    budget: number = QUERY_VARIANT_BUDGET,
    maxCost: number = Number.POSITIVE_INFINITY,
  ): TransliterationVariant[] {
    if (typeof value !== "string" || !value) {
      return [];
    }
    // Only a Latin name has anything to expand; a Hebrew one is already in the target script.
    if (!/[A-Za-z]/u.test(value) || /[֐-׿]/u.test(value)) {
      return [];
    }

    const normalized = normalizeBrandName(value);
    if (!normalized) {
      return [];
    }

    const curated = getBrandOverrides().latinToHebrew.get(toOverrideKey(value)) ?? [];
    const generated = this.generateVariants(normalized, budget, maxCost, acronymWordIndexes(value, normalized));
    return normalizeVariants([
      ...curated.map((spelling) => ({ value: spelling, source: "CURATED" as const, confidence: 1 })),
      ...generated.map((variant) => ({
        value: variant.text,
        source: "GENERATED" as const,
        // Mirrors the Hebrew-to-Latin confidence curve so scores from the two directions stay
        // comparable when both produce a candidate for the same brand.
        confidence: Math.max(0.2, 0.75 - 0.16 * variant.cost),
      })),
    ]).slice(0, budget);
  }

  private generateVariants(
    value: string,
    budget: number,
    maxCost: number,
    acronymWords: ReadonlySet<number> = new Set(),
  ): GeneratedVariant[] {
    // Each word is expanded on its own so one long word cannot consume the whole beam, and so a
    // suffix rule applies to the word that carries the suffix rather than to the whole name.
    const words = value.split(" ").filter(Boolean);
    if (words.length === 0) {
      return [];
    }

    // Combinations multiply across words, so an n-word name would otherwise spend the whole budget
    // on permutations that differ only in one word's vowels. Each word gets a share of the budget,
    // which keeps a multi-word name's spelling list roughly as long as a single word's.
    const perWordBudget = Math.max(
      MINIMUM_PER_WORD_BUDGET,
      Math.ceil(budget / Math.max(1, words.length)),
    );

    let combined: GeneratedVariant[] = [{ text: "", cost: 0 }];
    for (const [wordIndex, word] of words.entries()) {
      const wordVariants = acronymWords.has(wordIndex)
        ? [...acronymSpellings(word), ...this.expandWord(word, perWordBudget, maxCost)]
        : this.expandWord(word, perWordBudget, maxCost);
      if (wordVariants.length === 0) {
        continue;
      }

      const next = new Map<string, number>();
      for (const prefix of combined) {
        for (const wordVariant of wordVariants) {
          const cost = prefix.cost + wordVariant.cost;
          if (cost > maxCost) {
            continue;
          }
          const text = prefix.text ? `${prefix.text} ${wordVariant.text}` : wordVariant.text;
          const existing = next.get(text);
          if (existing === undefined || cost < existing) {
            next.set(text, cost);
          }
        }
      }
      combined = [...next.entries()]
        .sort((first, second) => first[1] - second[1])
        .slice(0, perWordBudget)
        .map(([text, cost]) => ({ text, cost }));
    }

    return combined
      .filter((variant) => variant.text.length > 0)
      .map((variant) => ({ text: applyFinalForms(variant.text), cost: variant.cost }));
  }

  private expandWord(word: string, budget: number, maxCost: number): GeneratedVariant[] {
    const suffix = splitSuffix(word);
    const source = suffix ? suffix.stem : word;
    const suffixText = suffix ? suffix.suffix : "";
    const suffixCost = suffix ? suffix.cost : 0;

    let states = new Map<string, number>([["", 0]]);
    let index = 0;

    while (index < source.length) {
      const unit = latinUnitOptions.find(
        ([prefix, , position]) =>
          source.startsWith(prefix, index) &&
          (position !== "initial" || index === 0) &&
          (position !== "final" || index + prefix.length === source.length),
      );
      const options = unit
        ? unit[1]
        : (contextualOptions(source[index], source[index + 1]) ?? latinCharacterOptions[source[index]]);
      const advance = unit ? unit[0].length : 1;
      // Hebrew cannot open a word with a bare vowel, so a vowel-initial name takes a carrying alef
      // that the context-free tables above never produce: ISOSTAR -> איזוסטאר, ALWAYS -> אולוויז.
      // Only the readings that actually start with the vowel letter are prefixed, so a reading that
      // already opens with alef (or drops the vowel) is left alone.
      const positioned =
        index === 0 && options && "aeiou".includes(source[0])
          ? this.withInitialAlef(options)
          : options;
      // An unmapped character (a digit, say) is carried through unchanged.
      const expansions = positioned ?? ([[source[index], 0]] as const);

      const next = new Map<string, number>();
      for (const [prefix, prefixCost] of states) {
        for (const [text, cost] of expansions) {
          const candidateCost = prefixCost + cost;
          // Cost only accumulates, so a branch already over budget can never come back under it.
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

    const results: GeneratedVariant[] = [];
    for (const [text, cost] of states) {
      const total = cost + suffixCost;
      if (total > maxCost) {
        continue;
      }
      // An all-vowel-dropped expansion can come back empty; it carries no signal.
      const full = text + suffixText;
      if (full) {
        results.push({ text: full, cost: total });
      }
    }

    return results.sort((first, second) => first.cost - second.cost).slice(0, budget);
  }

  /**
   * Adds the alef-carried reading of a word-initial vowel, keeping the originals so a name that is
   * written without it stays reachable. A reading that already opens with alef, or that drops the
   * vowel entirely, gains nothing and is passed through unchanged.
   */
  private withInitialAlef(options: readonly HebrewOption[]): readonly HebrewOption[] {
    // Cheapest cost per reading, so a carrying alef the table already lists at a higher cost is
    // lowered to what the rule itself charges rather than being left out as a duplicate.
    const costByText = new Map<string, number>();
    const keep = (text: string, cost: number): void => {
      const current = costByText.get(text);
      if (current === undefined || cost < current) {
        costByText.set(text, cost);
      }
    };

    for (const [text, cost] of options) {
      keep(text, cost);
    }
    for (const [text, cost] of options) {
      if (!text || text.startsWith("א")) {
        continue;
      }
      // One step of speculation above the reading it is built from, so a name genuinely written
      // without the alef still outranks it.
      keep(`א${text}`, cost + 1);
    }
    return [...costByText.entries()].map(([text, cost]) => [text, cost] as const);
  }
}

/**
 * Which words of a Latin name are acronyms, read letter by letter: written in capitals and at most
 * three letters long (HQ, CK), or without a vowel letter to be said with (DKNY, whose y is read as
 * a letter too). The raw input is needed because normalization lowercases it; when its words do not
 * line up with the normalized ones, no word is treated as an acronym.
 */
function acronymWordIndexes(raw: string, normalized: string): Set<number> {
  const rawWords = raw.normalize("NFKC").split(/[^A-Za-z0-9֐-׿']+/u).filter(Boolean);
  const words = normalized.split(" ").filter(Boolean);
  const indexes = new Set<number>();
  if (rawWords.length !== words.length) {
    return indexes;
  }
  rawWords.forEach((word, index) => {
    const letters = /^[A-Za-z]+$/u.test(word);
    const capitalised = letters && word.length >= 2 && word.length <= 3 && word === word.toUpperCase();
    const vowelless = letters && word.length >= 2 && word.length <= 5 && !/[aeiou]/iu.test(word);
    if (capitalised || vowelless) {
      indexes.add(index);
    }
  });
  return indexes;
}

/** An acronym spelled out in Hebrew letter names, with and without spaces: CK -> סי קיי, סיקיי. */
function acronymSpellings(word: string): GeneratedVariant[] {
  const letterNames = getBrandOverrides().letterNames;
  const names = word.toUpperCase().split("").map((letter) => letterNames.get(letter));
  if (names.some((name) => name === undefined)) {
    return [];
  }
  return [
    { text: names.join(" "), cost: 0 },
    { text: names.join(""), cost: 1 },
  ];
}

/**
 * The consonants of a Hebrew spelling, with the letters that double as vowels removed and final
 * forms folded back to their medial shape. Two Hebrew spellings of the same borrowed name differ
 * mainly in which vowels they chose to write, so comparing skeletons sees past that.
 */
export function toHebrewConsonantSkeleton(value: string): string {
  return value
    .replace(/[ך]/gu, "כ")
    .replace(/[ם]/gu, "מ")
    .replace(/[ן]/gu, "נ")
    .replace(/[ף]/gu, "פ")
    .replace(/[ץ]/gu, "צ")
    .replace(/[אויעה]/gu, "")
    .replace(/(.)\1+/gu, "$1")
    .replace(/[^א-ת]/gu, "");
}
