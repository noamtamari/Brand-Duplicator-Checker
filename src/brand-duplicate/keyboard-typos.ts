/**
 * Whether swapping one letter for another is a plausible typing slip. A typo hits a neighbouring
 * key; replacing a letter with one across the keyboard is a different word. סטפיל and סטייל differ
 * in one letter, but פ and י sit far apart, so the pair is two names rather than a misspelling.
 *
 * Letters that spell the same sound are also plausible, because they are how people misspell
 * rather than mistype: ט and ת, כ and ק, c and k.
 */

/** The three letter rows of a standard keyboard, by the Latin key they sit on. */
const QWERTY_ROWS = ["qwertyuiop", "asdfghjkl;", "zxcvbnm,."];

/** The Hebrew letter on each key of the standard Israeli layout (SI 1452). */
const HEBREW_BY_KEY: Readonly<Record<string, string>> = {
  e: "ק", r: "ר", t: "א", y: "ט", u: "ו", i: "ן", o: "ם", p: "פ",
  a: "ש", s: "ד", d: "ג", f: "כ", g: "ע", h: "י", j: "ח", k: "ל", l: "ך", ";": "ף",
  z: "ז", x: "ס", c: "ב", v: "ה", b: "נ", n: "מ", m: "צ", ",": "ת", ".": "ץ",
};

interface KeyPosition {
  row: number;
  column: number;
}

const positionByCharacter = new Map<string, KeyPosition>();
QWERTY_ROWS.forEach((keys, row) => {
  [...keys].forEach((key, column) => {
    positionByCharacter.set(key, { row, column });
    const hebrew = HEBREW_BY_KEY[key];
    if (hebrew) {
      positionByCharacter.set(hebrew, { row, column });
    }
  });
});

/**
 * Rows are staggered, so a key touches the two keys above it at its own column and one to the
 * right, and the two below it at its own column and one to the left: F touches R, T, C and V.
 */
function areNeighbours(first: KeyPosition, second: KeyPosition): boolean {
  if (first.row === second.row) {
    return Math.abs(first.column - second.column) === 1;
  }
  const [upper, lower] = first.row < second.row ? [first, second] : [second, first];
  if (lower.row - upper.row !== 1) {
    return false;
  }
  return lower.column === upper.column || lower.column === upper.column - 1;
}

/** Groups of letters that spell one sound, or a vowel carrier Hebrew may write or leave out. */
const SOUND_ALIKE_GROUPS: readonly string[] = [
  "טת", "כקך", "סש", "אעה", "בו", "חכך", "מם", "נן", "פף", "צץ",
  "ckq", "cs", "sz", "iy", "vw", "aeiouy",
];

function soundAlike(first: string, second: string): boolean {
  return SOUND_ALIKE_GROUPS.some((group) => group.includes(first) && group.includes(second));
}

export function isPlausibleSubstitution(first: string, second: string): boolean {
  if (first === second || soundAlike(first, second)) {
    return true;
  }
  const firstPosition = positionByCharacter.get(first);
  const secondPosition = positionByCharacter.get(second);
  // A character off the letter rows (a digit, a symbol) cannot be judged, so it is not penalized.
  if (!firstPosition || !secondPosition) {
    return true;
  }
  return areNeighbours(firstPosition, secondPosition);
}

/** The one pair of letters that differs between two equal-length strings, if exactly one does. */
export function singleSubstitution(first: string, second: string): [string, string] | undefined {
  if (first.length !== second.length) {
    return undefined;
  }
  let found: [string, string] | undefined;
  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) {
      if (found) {
        return undefined;
      }
      found = [first[index], second[index]];
    }
  }
  return found;
}
