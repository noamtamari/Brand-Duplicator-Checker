import assert from "node:assert/strict";
import test from "node:test";
import {
  matchPhoneticNames,
  phoneticKeys,
  toPhoneticName,
} from "../../cross-script-phonetic-matcher.js";
import { toHebrewUnits } from "../../hebrew-phonetic-units.js";
import { toLatinReadings, type Orthography } from "../../latin-phonetic-readings.js";

function reading(word: string, orthography: Orthography): string | undefined {
  const match = toLatinReadings(word).find((entry) => entry.orthography === orthography);
  return match?.symbols.join(" ");
}

function hasReading(word: string, symbols: string): boolean {
  return toLatinReadings(word).some((entry) => entry.symbols.join(" ") === symbols);
}

function match(first: string, second: string) {
  return matchPhoneticNames(toPhoneticName(first), toPhoneticName(second));
}

test("French readings drop silent endings and say ch as sh", () => {
  assert.equal(reading("payot", "FR"), "P a i o");
  assert.equal(reading("garnier", "FR"), "G a R N i e");
  assert.equal(reading("cacharel", "FR"), "K a SH a R e L");
  // English reads CAUDALIE the same way, so the reading is kept once, under the cheaper label.
  assert.ok(hasReading("caudalie", "K o D a L i"));
});

test("English readings keep g and c hard at the end of a word and before a silent u", () => {
  assert.ok(hasReading("guess", "G e S"));
  assert.equal(reading("gac", "EN"), "G a K");
  assert.equal(reading("gillette", "EN"), "J i L e T");
});

test("German readings say both final vowels of LOEWE", () => {
  assert.equal(reading("loewe", "DE"), "L o e V e");
});

test("English ow is read both as o and as the diphthong Hebrew writes as או", () => {
  assert.ok(hasReading("down", "D o N"));
  assert.ok(hasReading("down", "D a u N"));
  assert.equal(match("דאון", "down")?.relation, "SAME");
});

test("a reading without spelling cues for its language costs a little more", () => {
  const french = (word: string) => toLatinReadings(word).find((entry) => entry.orthography === "FR");
  assert.equal(french("garnier")?.penalty, 0);
  assert.ok((french("cloud")?.penalty ?? 0) > 0);
});

test("Hebrew letter pairs that spell one sound become one unit", () => {
  assert.equal(toHebrewUnits("ג'ילט")[0]?.text, "ג'");
  assert.equal(toHebrewUnits("אוקלי")[0]?.text, "או");
  assert.equal(toHebrewUnits("קלואה").at(-1)?.text, "אה");
  assert.equal(toHebrewUnits("ניוואה")[2]?.text, "וו");
});

test("an alef between two vowel letters only marks the syllable break", () => {
  const alef = toHebrewUnits("דיאור")[2];
  assert.equal(alef?.text, "א");
  assert.equal(alef?.writtenVowel, false);
  assert.equal(toHebrewUnits("לואבה")[2]?.writtenVowel, true);
});

test("a single vav read as v costs more than a doubled one", () => {
  const single = toHebrewUnits("קונברס")[1]?.readings.find((option) => option.symbols[0] === "V");
  assert.ok(single && single.cost > 0);
  assert.equal(toHebrewUnits("סוויפר")[1]?.consonantal, true);
});

test("pairs a Hebrew spelling with the Latin brand it sounds like", () => {
  for (const [hebrew, latin] of [
    ["גרנייה", "garnier"],
    ["קליניק", "clinique"],
    ["פאיו", "payot"],
    ["קשרל", "cacharel"],
    ["זייס", "zeiss"],
    ["טומי", "tommy"],
    ["קונברס", "converse"],
    ["קסרגוף", "xerjoff"],
  ]) {
    assert.equal(match(hebrew, latin)?.relation, "SAME", `${hebrew} should sound like ${latin}`);
  }
});

test("pairs a Latin name with the Hebrew spelling it sounds like", () => {
  for (const [latin, hebrew] of [
    ["materna", "מטרנה"],
    ["isostar", "איזוסטאר"],
    ["always", "אולוויז"],
    ["tresemme", "טרזמה"],
  ]) {
    assert.equal(match(latin, hebrew)?.relation, "SAME", `${latin} should sound like ${hebrew}`);
  }
});

test("rejects pairings that need a consonant the other name lacks", () => {
  assert.equal(match("zenvora", "קנור"), undefined);
  assert.equal(match("quorali", "קורס"), undefined);
  // פ is p or f, never v.
  assert.equal(match("orvexa", "אורפיקס"), undefined);
});

test("rejects short pairings that contradict the vowels Hebrew writes", () => {
  // Hebrew writes an o with ו, so קרלי is not "Quorali".
  assert.equal(match("quorali", "קרלי"), undefined);
  // The final ה writes a vowel SILVER does not have.
  assert.equal(match("זילורה", "silver"), undefined);
  // A loanword's final vowel is written, so סיילור is not "Zylora".
  assert.equal(match("zylora", "סיילור"), undefined);
  // The alef in לואבה writes a vowel LOVE does not have.
  assert.equal(match("לואבה", "love"), undefined);
  assert.equal(match("לואבה", "loewe")?.relation, "SAME");
  // ע is not a free vowel the way א is.
  assert.equal(match("tommy", "טעמי"), undefined);
});

test("matches multi-word names word by word", () => {
  assert.equal(match("טומי הילפיגר", "tommy hilfiger")?.relation, "SAME");
  assert.equal(match("קלווין קליין", "calvin klein")?.relation, "SAME");
  assert.equal(match("דאון טאון", "downtown")?.relation, "SAME");
});

test("treats a name with extra words as a related name, not the same one", () => {
  assert.equal(match("דיאור הום", "dior")?.relation, "SUBSET");
  assert.equal(match("הילפיגר", "tommy hilfiger")?.relation, "SUBSET");
  assert.equal(match("טומי הילפיגר", "tomy")?.relation, "SUBSET");
});

test("files a Hebrew spelling and its Latin original under a shared phonetic key", () => {
  const hebrew = phoneticKeys(toPhoneticName("גרנייה"));
  const latin = phoneticKeys(toPhoneticName("garnier"));
  assert.ok(hebrew.exact.includes("GRN"));
  assert.ok(latin.exact.includes("GRN"));
  assert.ok(latin.deletions.includes("GRN"));
});
