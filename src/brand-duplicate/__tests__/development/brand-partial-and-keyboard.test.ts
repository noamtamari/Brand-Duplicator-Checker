import assert from "node:assert/strict";
import test from "node:test";
import { BrandDuplicateChecker, BrandIndex } from "../../index.js";
import { isPlausibleSubstitution } from "../../keyboard-typos.js";
import { isPartialNameMatch } from "../../string-similarity.js";

function createChecker(labels: string[]): BrandDuplicateChecker {
  return new BrandDuplicateChecker(
    new BrandIndex(labels.map((label, index) => ({ code: `b_${index}`, label }))),
  );
}

const decide = (labels: string[], input: string) => createChecker(labels).checkBrand(input).decision;

test("a substitution is a plausible typo only between neighbouring keys or sound-alike letters", () => {
  // Neighbours on the Hebrew layout: ר and א share a row, ן sits above ל.
  assert.equal(isPlausibleSubstitution("ר", "א"), true);
  assert.equal(isPlausibleSubstitution("ן", "ל"), true);
  // Far apart: פ is top right, י in the middle row; ק is top left, ס bottom left.
  assert.equal(isPlausibleSubstitution("פ", "י"), false);
  assert.equal(isPlausibleSubstitution("ק", "ס"), false);
  // Different keys, same sound.
  assert.equal(isPlausibleSubstitution("ט", "ת"), true);
  assert.equal(isPlausibleSubstitution("c", "k"), true);
  // Latin keys follow the same layout.
  assert.equal(isPlausibleSubstitution("r", "t"), true);
  assert.equal(isPlausibleSubstitution("p", "t"), false);
});

test("a letter replaced from across the keyboard is a different name, not a typo", () => {
  const result = createChecker(["סטייל"]).checkBrand("סטפיל");
  assert.equal(result.decision, "ALLOW");
  assert.equal(result.candidates[0]?.matchType, "WEAK_SIMILARITY");
  assert.equal(result.candidates[0]?.signals?.implausibleSubstitution, true);

  assert.equal(decide(["סנופי"], "קנופי"), "ALLOW");
});

test("a neighbouring key, a sound-alike letter or an added letter is still a typo", () => {
  // ך sits next to ל.
  assert.equal(decide(["סטייל"], "סטייך"), "HUMAN_REVIEW");
  assert.equal(decide(["טומי"], "תומי"), "HUMAN_REVIEW");
  // Insertions are not judged by the keyboard: Hebrew writes and drops vowel letters freely.
  assert.equal(decide(["טריקסי"], "טריקוסי"), "HUMAN_REVIEW");
});

test("a name that only adds words to a brand, or swaps one word entirely, matches only part of it", () => {
  assert.equal(isPartialNameMatch("nivea men", "nivea"), true);
  assert.equal(isPartialNameMatch("קלין לוג'יק", "קלין"), true);
  assert.equal(isPartialNameMatch("קליר דיאה", "קליר דיי"), true);
  // A typo in one word keeps the whole name; two edits are a typo once the word is long enough.
  assert.equal(isPartialNameMatch("estee laudr", "estee lauder"), false);
  assert.equal(isPartialNameMatch("calvin kline", "calvin klein"), false);
  // A space plus a letter is a typo too, not an added word.
  assert.equal(isPartialNameMatch("dream babyy", "dreambaby"), false);
  // Fewer words may be the brand written shorter.
  assert.equal(isPartialNameMatch("loreal", "loreal paris"), false);
});

test("a name that extends a brand is allowed in either script", () => {
  assert.equal(decide(["NIVEA"], "Nivea Men"), "ALLOW");
  assert.equal(decide(["קלין"], "קלין לוג'יק"), "ALLOW");
  assert.equal(decide(["קולור"], "קולור וואו"), "ALLOW");
  assert.equal(decide(["TYMO"], "טיימו ביוטי"), "ALLOW");
  assert.equal(decide(["Arctic"], "ארקטיק פוקס"), "ALLOW");
});

test("a same-length name sharing only some words is allowed", () => {
  assert.equal(decide(["קליר דיי"], "קליר דיאה"), "ALLOW");
  assert.equal(decide(["רניו קוסמטיקס"], "בנפיט קוסמטיקס"), "ALLOW");
  assert.notEqual(decide(["ESTEE LAUDER"], "Estee Laudr"), "ALLOW");
});

test("a whole-name match across word boundaries still reviews", () => {
  // Written as one word on one side and two on the other, but the same name by sound.
  assert.equal(decide(["DOWNTOWN"], "דאון טאון"), "HUMAN_REVIEW");
  assert.notEqual(decide(["DREAMBABY"], "Dream Baby"), "ALLOW");
});

test("a cross-script spelling resemblance that pronunciation rejects does not review", () => {
  // "stpl" is one letter from STP, but the L has nothing to pair with.
  assert.equal(decide(["STP"], "סטפיל"), "ALLOW");
  assert.equal(decide(["B:Lab"], "הוב לאבס"), "ALLOW");
});
