import type { Consonant, PhoneticSymbol } from "./phonetic-alphabet.js";

/** One way of reading a Hebrew unit: one or two sounds, and how speculative the reading is. */
export interface HebrewReading {
  symbols: readonly PhoneticSymbol[];
  cost: number;
}

/**
 * A letter, or a letter pair that spells one sound, with every sound it can stand for.
 *
 * The expander in transliteration-service.ts writes out whole spellings and so has to cap how many
 * it tries; Isostar's correct spelling sat 138th of 512. Here each unit keeps its alternatives and
 * the aligner picks among them position by position, so nothing is enumerated and there is no cap.
 */
export interface HebrewUnit {
  text: string;
  readings: readonly HebrewReading[];
  /** א and ע: stand for any single vowel. */
  anyVowel: boolean;
  /** What reading the unit as an arbitrary vowel costs: nothing for א, something for ע. */
  anyVowelCost: number;
  /** What it costs when the Latin name has nothing for this unit. */
  unmatchedCost: number;
  /** Every reading is a strong consonant, so leaving the unit unmatched breaks coverage. */
  consonantal: boolean;
  /** The letter writes a vowel; leaving it unmatched is evidence against the pairing. */
  writtenVowel: boolean;
}

type Position = "initial" | "medial" | "final";

const consonant = (...symbols: Consonant[]): HebrewReading[] =>
  symbols.map((symbol) => ({ symbols: [symbol], cost: 0 }));

function consonantUnit(text: string, readings: readonly HebrewReading[]): HebrewUnit {
  return {
    text,
    readings,
    anyVowel: false,
    anyVowelCost: 0,
    unmatchedCost: 1,
    consonantal: true,
    writtenVowel: false,
  };
}

/** Letters whose only readings are consonants, with the sounds each stands for. */
const consonantLetters: Readonly<Record<string, readonly HebrewReading[]>> = {
  "ב": consonant("B", "V"),
  "ג": consonant("G"),
  "ד": consonant("D"),
  "ז": consonant("Z"),
  "ח": consonant("H"),
  "ט": consonant("T"),
  "ת": consonant("T"),
  // כ reads k with a dagesh and kh without one, and a loanword may mean either.
  "כ": [{ symbols: ["K"], cost: 0 }, { symbols: ["H"], cost: 0.2 }],
  "ך": [{ symbols: ["K"], cost: 0 }, { symbols: ["H"], cost: 0.2 }],
  "ל": consonant("L"),
  "מ": consonant("M"),
  "ם": consonant("M"),
  "נ": consonant("N"),
  "ן": consonant("N"),
  "ס": consonant("S"),
  "פ": consonant("P"),
  "ף": consonant("P"),
  "צ": consonant("TS"),
  "ץ": consonant("TS"),
  "ק": consonant("K"),
  "ר": consonant("R"),
  // Unpointed ש is both shin and sin.
  "ש": [{ symbols: ["SH"], cost: 0 }, { symbols: ["S"], cost: 0.1 }],
};

/** Letters marked with a geresh spell sounds Hebrew otherwise lacks. */
const gereshUnits: Readonly<Record<string, readonly HebrewReading[]>> = {
  "ג": [{ symbols: ["J"], cost: 0 }, { symbols: ["G"], cost: 0.1 }],
  "ז": [{ symbols: ["ZH"], cost: 0 }, { symbols: ["J"], cost: 0.2 }],
  "צ": [{ symbols: ["CH"], cost: 0 }, { symbols: ["TS"], cost: 0.2 }],
  "ץ": [{ symbols: ["CH"], cost: 0 }, { symbols: ["TS"], cost: 0.2 }],
  "ת": consonant("T"),
};

/** A letter that can write a vowel, with the readings it takes in its position. */
function vowelUnit(
  text: string,
  readings: readonly HebrewReading[],
  unmatchedCost: number,
  writtenVowel = true,
): HebrewUnit {
  return {
    text,
    readings,
    anyVowel: false,
    anyVowelCost: 0,
    unmatchedCost,
    consonantal: false,
    writtenVowel,
  };
}

function vavUnit(position: Position): HebrewUnit {
  if (position === "initial") {
    // A word cannot open with a vowel letter, so an initial ו is always the consonant.
    return consonantUnit("ו", consonant("V"));
  }
  return vowelUnit(
    "ו",
    [
      { symbols: ["o"], cost: 0 },
      { symbols: ["u"], cost: 0 },
      // A consonantal v inside a word is written וו, so a single ו read as v is a guess.
      { symbols: ["V"], cost: position === "final" ? 0.5 : 0.35 },
    ],
    0.5,
  );
}

function yodUnit(position: Position): HebrewUnit {
  if (position === "initial") {
    return vowelUnit(
      "י",
      [
        { symbols: ["Y"], cost: 0 },
        { symbols: ["i"], cost: 0.2 },
        { symbols: ["e"], cost: 0.3 },
      ],
      0.5,
      false,
    );
  }
  return vowelUnit(
    "י",
    [
      { symbols: ["i"], cost: 0 },
      { symbols: ["e"], cost: 0.12 },
      { symbols: ["ei"], cost: 0.12 },
      { symbols: ["Y"], cost: position === "final" ? 0.3 : 0.2 },
    ],
    0.4,
  );
}

function heUnit(position: Position): HebrewUnit {
  if (position === "final") {
    // A final ה in a loanword marks a final vowel: מטרנה, קררה, טרזמה.
    return vowelUnit("ה", [{ symbols: ["a"], cost: 0 }, { symbols: ["e"], cost: 0 }], 0.45);
  }
  return vowelUnit(
    "ה",
    [
      { symbols: ["H"], cost: 0 },
      { symbols: ["a"], cost: 0.3 },
      { symbols: ["e"], cost: 0.3 },
    ],
    position === "initial" ? 0.6 : 0.3,
    false,
  );
}

const vowelLetters = new Set(["ו", "י"]);

/**
 * א and ע carry a vowel without saying which.
 *
 * - Opening a word, the letter may only be the seat for a vowel that follows, so it is cheap to
 *   leave unmatched.
 * - Between two vowel letters it only marks the syllable break: דיאור is Di-or, with no third
 *   vowel.
 * - Anywhere else inside or at the end of a word it marks a vowel the writer chose to spell. That
 *   separates לואבה (LOEWE) from LOVE, which has no vowel there.
 *
 * ע is a guttural consonant in native words and a vowel seat in loanwords mostly at the start
 * (עלית for Elite). Reading it as a vowel inside a word therefore costs as much as the other
 * contradictions of loanword spelling, which a short name cannot absorb: טעמי is not TOMMY.
 */
function vowelCarrierUnit(text: string, position: Position, betweenVowelLetters: boolean): HebrewUnit {
  const guttural = text === "ע";
  if (betweenVowelLetters) {
    return {
      text,
      readings: [],
      anyVowel: true,
      anyVowelCost: guttural ? 0.3 : 0,
      unmatchedCost: 0.05,
      consonantal: false,
      writtenVowel: false,
    };
  }
  return {
    text,
    readings: [],
    anyVowel: true,
    anyVowelCost: guttural ? (position === "initial" ? 0.1 : 0.45) : 0,
    unmatchedCost: position === "initial" ? 0.2 : position === "medial" ? 0.25 : 0.45,
    consonantal: false,
    writtenVowel: position !== "initial",
  };
}

/** Normalizes a Hebrew word to bare letters, with every form of geresh written as an apostrophe. */
function cleanHebrewWord(word: string): string {
  return word
    .replace(/[׳`’‘]/gu, "'")
    .replace(/[֑-ׇ]/gu, "")
    .replace(/[^א-ת']/gu, "");
}

/**
 * Splits a Hebrew word into units, matching letter pairs before single letters so the longer unit
 * wins: וו is one consonant, and a final אה is one written vowel.
 */
export function toHebrewUnits(word: string): HebrewUnit[] {
  // A trailing geresh belongs to the letter before it, so it does not move where the word ends.
  const letters = cleanHebrewWord(word).replace(/^'+/u, "");
  const lastLetter = letters.replace(/'+$/u, "").length - 1;
  const units: HebrewUnit[] = [];
  let index = 0;

  while (index < letters.length) {
    const letter = letters[index];
    if (letter === "'") {
      index += 1;
      continue;
    }
    const pair = letters.slice(index, index + 2);
    const isFirst = units.length === 0;
    const pairIsLast = index + 1 === lastLetter;
    const position: Position = isFirst ? "initial" : index === lastLetter ? "final" : "medial";

    if (letters[index + 1] === "'" && gereshUnits[letter]) {
      units.push(consonantUnit(`${letter}'`, gereshUnits[letter]));
      index += 2;
      continue;
    }
    if (pair === "וו") {
      units.push(
        consonantUnit(
          "וו",
          isFirst
            ? // An initial וו can also be the consonant followed by its vowel: וולטרן is Voltaren.
              [
                { symbols: ["V"], cost: 0 },
                { symbols: ["V", "o"], cost: 0 },
                { symbols: ["V", "u"], cost: 0 },
              ]
            : consonant("V"),
        ),
      );
      index += 2;
      continue;
    }
    if (pair === "יי") {
      units.push(
        vowelUnit(
          "יי",
          [
            { symbols: ["ei"], cost: 0 },
            { symbols: ["i"], cost: 0 },
            { symbols: ["e"], cost: 0.1 },
            { symbols: ["Y"], cost: 0 },
          ],
          0.5,
        ),
      );
      index += 2;
      continue;
    }
    if (isFirst && pair === "או") {
      units.push(vowelUnit("או", [{ symbols: ["o"], cost: 0 }, { symbols: ["u"], cost: 0 }], 0.5));
      index += 2;
      continue;
    }
    if (isFirst && pair === "אי") {
      units.push(
        vowelUnit(
          "אי",
          [{ symbols: ["i"], cost: 0 }, { symbols: ["e"], cost: 0 }, { symbols: ["ei"], cost: 0 }],
          0.5,
        ),
      );
      index += 2;
      continue;
    }
    // A word-final אה writes one final vowel: קלואה is Chloé, not Chlo-a-e.
    if (!isFirst && pairIsLast && pair === "אה") {
      units.push(vowelUnit("אה", [{ symbols: ["a"], cost: 0 }, { symbols: ["e"], cost: 0 }], 0.45));
      index += 2;
      continue;
    }

    if (letter === "ו") {
      units.push(vavUnit(position));
    } else if (letter === "י") {
      units.push(yodUnit(position));
    } else if (letter === "ה") {
      units.push(heUnit(position));
    } else if (letter === "א" || letter === "ע") {
      const betweenVowelLetters =
        position === "medial" &&
        vowelLetters.has(letters[index - 1]) &&
        vowelLetters.has(letters[index + 1]);
      units.push(vowelCarrierUnit(letter, position, betweenVowelLetters));
    } else if (consonantLetters[letter]) {
      units.push(consonantUnit(letter, consonantLetters[letter]));
    }
    index += 1;
  }

  return units;
}
