import {
  CONSONANT_MISMATCH_COST,
  UNWRITTEN_FINAL_VOWEL_EXTRA,
  isStrongConsonant,
  isStrongVowel,
  isVowel,
  substitutionCost,
  unwrittenLatinCost,
  type PhoneticSymbol,
} from "./phonetic-alphabet.js";
import type { HebrewUnit } from "./hebrew-phonetic-units.js";

/** The best alignment of a Hebrew spelling against one Latin pronunciation. */
export interface PhoneticAlignment {
  /** 1 for a perfect alignment, falling toward 0 as the differences add up. */
  similarity: number;
  cost: number;
  /** Strong consonants in the Latin reading: how much the pairing has to go on. */
  latinConsonants: number;
  /** Latin consonants the Hebrew spelling never wrote. */
  unmatchedLatinConsonants: number;
  /** Hebrew consonants with no counterpart in the Latin name. */
  unmatchedHebrewConsonants: number;
  /** Consonants set against each other with no phonetic kinship. */
  mismatchedConsonants: number;
  /** Consonants read through a near pair (ב as v, ג as j) rather than matching outright. */
  nearSubstitutions: number;
  /** Latin o or u the Hebrew spelling left out, which Hebrew almost never does. */
  unwrittenStrongVowels: number;
  /** The Latin name ends on a vowel the Hebrew spelling did not write. */
  unwrittenFinalVowel: boolean;
  /** Vowels the Hebrew spelling wrote that the Latin name does not have. */
  unmatchedWrittenVowels: number;
}

/**
 * How much a vowel counts toward a name's length when normalizing the cost. Consonants carry a
 * Hebrew spelling, so they dominate; vowels still count, or a short name's vowel mismatches would
 * vanish into its one or two consonants.
 */
const VOWEL_WEIGHT = 0.3;

const SKIP_LATIN = 1;
const SKIP_UNIT = 2;
const ALIGN = 3;
/** Marks an alignment of an א/ע against a vowel, which uses no reading. */
const ANY_VOWEL = -1;

/**
 * Aligns Hebrew units against a Latin reading with a weighted edit distance. Each unit may take
 * any of its readings, match nothing, or leave a Latin sound unmatched, and the cheapest path wins.
 * `penalty` is added once, for readings chosen without evidence.
 */
export function alignPhonetically(
  units: readonly HebrewUnit[],
  latin: readonly PhoneticSymbol[],
  penalty = 0,
): PhoneticAlignment {
  const rows = units.length + 1;
  const columns = latin.length + 1;
  const cost = new Float64Array(rows * columns).fill(Number.POSITIVE_INFINITY);
  const step = new Int8Array(rows * columns);
  const reading = new Int8Array(rows * columns);
  const width = new Int8Array(rows * columns);
  cost[0] = 0;

  const relax = (row: number, column: number, value: number, kind: number, choice: number, used: number): void => {
    const cell = row * columns + column;
    if (value < cost[cell]) {
      cost[cell] = value;
      step[cell] = kind;
      reading[cell] = choice;
      width[cell] = used;
    }
  };

  // Cells are visited in row-major order and relaxed with a strict comparison, so on equal cost an
  // alignment (reached from the earlier cell) wins over leaving something unmatched.
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const here = cost[row * columns + column];
      if (here === Number.POSITIVE_INFINITY) {
        continue;
      }
      if (row < units.length) {
        const unit = units[row];
        if (unit.anyVowel && column < latin.length && isVowel(latin[column])) {
          relax(row + 1, column + 1, here + unit.anyVowelCost, ALIGN, ANY_VOWEL, 1);
        }
        unit.readings.forEach((option, index) => {
          const used = option.symbols.length;
          if (column + used > latin.length) {
            return;
          }
          let value = here + option.cost;
          for (let offset = 0; offset < used; offset += 1) {
            value += substitutionCost(option.symbols[offset], latin[column + offset]);
          }
          relax(row + 1, column + used, value, ALIGN, index, used);
        });
        relax(row + 1, column, here + unit.unmatchedCost, SKIP_UNIT, 0, 0);
      }
      if (column < latin.length) {
        const symbol = latin[column];
        const finalVowel = column === latin.length - 1 && isVowel(symbol);
        const unwritten = unwrittenLatinCost(symbol) + (finalVowel ? UNWRITTEN_FINAL_VOWEL_EXTRA : 0);
        relax(row, column + 1, here + unwritten, SKIP_LATIN, 0, 1);
      }
    }
  }

  const alignment: PhoneticAlignment = {
    similarity: 0,
    cost: cost[rows * columns - 1],
    latinConsonants: latin.filter(isStrongConsonant).length,
    unmatchedLatinConsonants: 0,
    unmatchedHebrewConsonants: 0,
    mismatchedConsonants: 0,
    nearSubstitutions: 0,
    unwrittenStrongVowels: 0,
    unwrittenFinalVowel: false,
    unmatchedWrittenVowels: 0,
  };

  const tally = (hebrew: PhoneticSymbol, latinSymbol: PhoneticSymbol): void => {
    if (hebrew === latinSymbol) {
      return;
    }
    const hebrewConsonant = !isVowel(hebrew);
    const latinConsonant = !isVowel(latinSymbol);
    if (!hebrewConsonant && !latinConsonant) {
      return;
    }
    const value = substitutionCost(hebrew, latinSymbol);
    if (hebrewConsonant && latinConsonant) {
      if (value >= CONSONANT_MISMATCH_COST) {
        alignment.mismatchedConsonants += 1;
      } else {
        alignment.nearSubstitutions += 1;
      }
    } else if (value >= CONSONANT_MISMATCH_COST) {
      alignment.mismatchedConsonants += 1;
    }
  };

  let row = units.length;
  let column = latin.length;
  while (row > 0 || column > 0) {
    const cell = row * columns + column;
    const kind = step[cell];
    if (kind === SKIP_LATIN) {
      const symbol = latin[column - 1];
      if (isStrongConsonant(symbol)) {
        alignment.unmatchedLatinConsonants += 1;
      } else if (isStrongVowel(symbol)) {
        alignment.unwrittenStrongVowels += 1;
      }
      if (column === latin.length && isVowel(symbol)) {
        alignment.unwrittenFinalVowel = true;
      }
      column -= 1;
    } else if (kind === SKIP_UNIT) {
      const unit = units[row - 1];
      if (unit.consonantal) {
        alignment.unmatchedHebrewConsonants += 1;
      }
      if (unit.writtenVowel) {
        alignment.unmatchedWrittenVowels += 1;
      }
      row -= 1;
    } else if (kind === ALIGN) {
      const used = width[cell];
      const choice = reading[cell];
      if (choice !== ANY_VOWEL) {
        const symbols = units[row - 1].readings[choice].symbols;
        for (let offset = 0; offset < used; offset += 1) {
          tally(symbols[offset], latin[column - used + offset]);
        }
      }
      row -= 1;
      column -= used;
    } else {
      break;
    }
  }

  const hebrewConsonants = units.filter((unit) => unit.consonantal).length;
  const latinVowels = latin.filter(isVowel).length;
  const length = Math.max(1, Math.max(alignment.latinConsonants, hebrewConsonants) + VOWEL_WEIGHT * latinVowels);
  alignment.similarity = Math.min(1, Math.max(0, 1 - (alignment.cost + penalty) / length));
  return alignment;
}
