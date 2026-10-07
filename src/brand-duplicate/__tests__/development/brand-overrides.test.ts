import assert from "node:assert/strict";
import test from "node:test";
import {
  BrandDuplicateChecker,
  BrandIndex,
  LatinToHebrewTransliterationService,
  TransliterationService,
} from "../../index.js";
import { EXCLUDED_OVERRIDES, buildBrandOverrides, getBrandOverrides } from "../../brand-overrides.js";

function createChecker(labels: string[]): BrandDuplicateChecker {
  return new BrandDuplicateChecker(
    new BrandIndex(labels.map((label, index) => ({ code: `b_${index}`, label }))),
  );
}

const hebrewToLatin = (value: string): string[] =>
  new TransliterationService().getLatinVariants(value).map((variant) => variant.value);
const latinToHebrew = (value: string): string[] =>
  new LatinToHebrewTransliterationService().getHebrewVariants(value).map((variant) => variant.value);

test("loads the curated brand spellings and the letter names from the data file", () => {
  const overrides = getBrandOverrides();

  assert.ok(overrides.excludedCount > 0);
  assert.deepEqual(overrides.hebrewToLatin.get("אייסר"), ["acer"]);
  assert.deepEqual(overrides.latinToHebrew.get("acer"), ["אייסר"]);
  // A geresh spelling is filed without it and stored in both forms.
  assert.deepEqual(overrides.latinToHebrew.get("gucci"), ["גוצ'י", "גוצי"]);
  assert.equal(overrides.letterNames.get("C"), "סי");
  assert.equal(overrides.letterNames.size, 26);
});

test("generic words and placeholders are not curated", () => {
  const overrides = getBrandOverrides();

  for (const latin of ["aher", "mevutal", "u", "care", "paris"]) {
    assert.ok(EXCLUDED_OVERRIDES.has(latin), latin);
    assert.equal(overrides.latinToHebrew.has(latin), false, latin);
  }
  // Real brands listed among the file's word lexicon stay curated.
  for (const latin of ["escada", "osem", "wissotzky", "moschino"]) {
    assert.ok(overrides.latinToHebrew.has(latin), latin);
  }
});

test("an override record with alternatives files every spelling both ways", () => {
  const overrides = buildBrandOverrides({
    existing_project_brand_overrides: [
      { latin: "bvlgari", hebrew: "בולגרי", latin_alternatives: ["bulgari"], hebrew_alternatives: ["בולגארי"] },
    ],
  });

  assert.deepEqual(overrides.hebrewToLatin.get("בולגארי"), ["bvlgari", "bulgari"]);
  assert.deepEqual(overrides.latinToHebrew.get("bulgari"), ["בולגרי", "בולגארי"]);
});

test("a curated pair blocks in both directions", () => {
  for (const [labels, input] of [
    [["אייסר"], "Acer"],
    [["ACER"], "אייסר"],
    [["אוויאן"], "Evian"],
    [["HUAWEI"], "וואווי"],
  ] as const) {
    const result = createChecker([...labels]).checkBrand(input);
    assert.equal(result.decision, "BLOCK", input);
    assert.equal(result.candidates[0]?.matchType, "TRANSLITERATION_EXACT", input);
  }
});

test("an excluded pair is still found but does not block", () => {
  const result = createChecker(["אחר"]).checkBrand("aher");

  assert.equal(result.decision, "HUMAN_REVIEW");
  assert.equal(result.candidates[0]?.label, "אחר");
});

test("Hebrew endings and letter groups read the way borrowed names spell them", () => {
  assert.ok(hebrewToLatin("קליניק").includes("clinique"));
  assert.ok(hebrewToLatin("מייבלין").includes("maybelline"));
  assert.ok(hebrewToLatin("קלרינס").includes("clarins"));
  // A final ס is never read as "c".
  assert.equal(hebrewToLatin("אדידס").some((variant) => variant.endsWith("c")), false);
});

test("English letter groups spell the sound Hebrew writes", () => {
  assert.ok(latinToHebrew("culture").includes("קלצ'ר"));
  assert.ok(latinToHebrew("bridge").includes("בריג'"));
  assert.ok(latinToHebrew("night").includes("נייט"));
  assert.ok(latinToHebrew("new").includes("ניו"));
  // Silent first and last letters.
  assert.equal(latinToHebrew("knorr")[0], "נור");
  assert.ok(latinToHebrew("climb").includes("קלים"));
});

test("a soft c leads with ס and a hard c with ק", () => {
  assert.ok(latinToHebrew("cinema")[0]?.startsWith("ס"));
  assert.ok(latinToHebrew("colgate")[0]?.startsWith("ק"));
});

test("acronyms match their Hebrew letter names in both directions", () => {
  assert.equal(latinToHebrew("CK")[0], "סי קיי");
  assert.ok(latinToHebrew("DKNY").includes("די קיי אן וואי"));
  assert.equal(hebrewToLatin("סי קיי")[0], "ck");
  // A lowercase word with vowels is a word, not an acronym.
  assert.equal(latinToHebrew("ace").includes("איי סי אי"), false);

  for (const [labels, input] of [
    [["סי קיי"], "CK"],
    [["CK"], "סי קיי"],
  ] as const) {
    const result = createChecker([...labels]).checkBrand(input);
    assert.equal(result.decision, "HUMAN_REVIEW", input);
    assert.equal(result.candidates[0]?.matchType, "TRANSLITERATION_EXACT", input);
  }
});

test("a weak cross-script guess below the review threshold does not hold a name back", () => {
  for (const [labels, input] of [
    [["הקס"], "HQ"],
    [["סיטי"], "Yeti"],
  ] as const) {
    assert.equal(createChecker([...labels]).checkBrand(input).decision, "ALLOW", input);
  }
});

test("a one-consonant word opening a longer brand is not a shorter form of it", () => {
  assert.equal(createChecker(["PAT MCGRATH LABS"]).checkBrand("פה").decision, "ALLOW");
  // Two consonants may be: DIOR written without HOMME.
  assert.equal(createChecker(["DIOR HOMME"]).checkBrand("דיאור").decision, "HUMAN_REVIEW");
});
