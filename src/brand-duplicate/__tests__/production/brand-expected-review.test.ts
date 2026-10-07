import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseBrandResponse } from "../../brand-adapter.js";
import { BrandDuplicateChecker } from "../../brand-duplicate-checker.js";
import { BrandIndex } from "../../brand-index.js";

/**
 * Names that must be held for review: close enough to a catalogued brand that a person should
 * compare the two, but not proven duplicates. A name here fails if it starts to block outright or
 * to be allowed.
 *
 * Every input is absent from the catalogue and from the other suites, and was HUMAN_REVIEW with the
 * brand it resembles among the top three candidates when the suite was written. The test accepts
 * the brand anywhere in the top five, under any of its codes. The inputs fall into four kinds:
 *
 * - Typos too weak to block. A one-letter slip blocks only between names of six letters or more
 *   where neither is the other with letters added at the end, so these review: a letter added or
 *   dropped at the end (Diorr, Hugo Bos), a letter added or dropped in a short name (Prda), two
 *   neighbouring letters swapped where the scorer rates the swap below a confident typo (Revlno;
 *   Logitehc blocks on LOGITECH, so it is not here), and a word replaced by one that sounds the same
 *   (Estee Lowder). In Hebrew, adding or dropping a vowel letter (קיקמן, דיטול) or writing a
 *   sound-alike letter (מטרנא, אלגנת) reviews as well.
 * - A shorter form of a catalogued multi-word brand (Calvin against Calvin Klein). Adding words to a
 *   brand makes a new name, but dropping them leaves one a person must compare.
 * - A Hebrew spelling of a Latin-labelled brand (קסיו against Casio). These rest on a generated
 *   spelling, which reviews rather than blocks; only a curated pair blocks, so לנובו, which blocks
 *   on Lenovo, is not here.
 * - A Latin spelling of a Hebrew-labelled brand (Bissli against ביסלי), likewise generated; Osem
 *   blocks on a curated pair. The last three, Kistrova, Quintrelo and Olay Fresh, were set aside
 *   from the allow suite because they sound like קסטרו, קונטרול and אלופרש.
 *
 * Some names that should review are allowed today and were left out, since this suite pins
 * behaviour that is right now: איב סן לורן against YVES SAINT LAURENT, מונבלאן against MONT BLANC,
 * הוגיס against האגיס and Yotvata against יטבתה. Those are recall gaps, not review cases.
 */
type ReviewCase = {
  id: string;
  input: string;
  /** The catalogued brand the input should be compared with, for the failure message. */
  brand: string;
  /** Every code the catalogue holds that brand under; any of them in the top five passes. */
  codes: readonly string[];
  reason: string;
};

/** [input, the catalogued brand it resembles, that brand's codes]. */
type CaseRow = readonly [string, string, ...string[]];

const responsePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../response.json");
const brands = parseBrandResponse(JSON.parse(await readFile(responsePath, "utf8")) as unknown);
const checker = new BrandDuplicateChecker(new BrandIndex(brands));

const latinTypos: readonly CaseRow[] = [
  // A letter added or dropped at the end.
  ["Diorr", "DIOR", "b_4463", "b_38"], ["Guccii", "GUCCI", "b_4480", "b_72"], ["Kenzzo", "Kenzo", "b_237"],
  ["Chanell", "CHANEL", "b_7"], ["Braunn", "BRAUN", "b_652"], ["Payott", "PAYOT", "b_11"],
  ["Lanvinn", "LANVIN", "b_177"], ["Rochass", "ROCHAS", "b_40"], ["Revlonn", "REVLON", "b_48"],
  ["Garnierr", "GARNIER", "b_3945"], ["Hugo Bos", "HUGO BOSS", "b_2094", "b_1970"],
  ["Estee Lauderr", "ESTEE LAUDER", "b_2"], ["Jimmy Cho", "JIMMY CHOO", "b_5067"],
  ["Morphy Richard", "MORPHY RICHARDS", "b_5189"],
  // A letter added or dropped in a name of five letters or fewer.
  ["Nikke", "NIKE", "b_3051"], ["Dioor", "DIOR", "b_4463", "b_38"], ["Pradda", "PRADA", "b_4465", "b_3762"],
  ["Prda", "PRADA", "b_4465", "b_3762"], ["Zipo", "ZIPPO", "b_5048"], ["Intx", "INTEX", "b_2974"],
  ["Chanl", "CHANEL", "b_7"],
  // Two neighbouring letters swapped.
  ["Revlno", "REVLON", "b_48"], ["Coahc", "COACH", "b_1903"], ["Clinqiue", "CLINIQUE", "b_1"],
  ["Lancoem", "LANCOME", "b_20"], ["Shisiedo", "SHISEIDO", "b_1973"], ["Samsugn", "SAMSUNG", "b_2246"],
  ["Remingotn", "REMINGTON", "b_5191"], ["Pedirgee", "PEDIGREE", "b_1150"], ["Neutorgena", "NEUTROGENA", "b_33"],
  ["Versaec", "VERSACE", "b_104", "b_4680"], ["Skechres", "SKECHERS", "b_7339mp"], ["Salomno", "Salomon", "b_6840mp"],
  ["Columiba", "Columbia", "b_5906mp"], ["Tom Frod", "TOM FORD", "b_2799", "b_4464"],
  // A word replaced by one that sounds the same.
  ["Estee Lowder", "ESTEE LAUDER", "b_2"], ["Hugo Boos", "HUGO BOSS", "b_2094", "b_1970"],
];

const hebrewTypos: readonly CaseRow[] = [
  // A letter added or dropped at the end.
  ["קולגייטט", "קולגייט", "b_642"], ["דטולל", "דטול", "b_4166"], ["אורביטט", "אורביט", "b_955"],
  ["קסטרוו", "קסטרו", "b_46"], ["ריבוקק", "ריבוק", "b_2258"], ["נרקיסס", "נרקיס", "b_134"],
  ["פפסיי", "פפסי", "b_1099"], ["סלקטדד", "סלקטד", "b_2071"], ["טרידנטט", "טרידנט", "b_1002"],
  ["ספרייטט", "ספרייט", "b_2630"], ["אדם גולדד", "אדם גולד", "b_3595"], ["הלתי פודד", "הלתי פוד", "b_1595"],
  ["מלודי פופ", "מלודי פופס", "b_1025"],
  // A vowel letter added or dropped.
  ["דיטול", "דטול", "b_4166"], ["אורבט", "אורביט", "b_955"], ["קיקמן", "קיקומן", "b_4996"],
  ["ליפטן", "ליפטון", "b_2002"], ["דרמקל", "דרמקול", "b_4491"], ["נרקס", "נרקיס", "b_134"],
  ["דומסטס", "דומסטוס", "b_5183"], ["וולטרין", "וולטרן", "b_3282"], ["שרמיין", "שרמין", "b_2126"],
  ["סויפר", "סוויפר", "b_4950"], ["קואקר", "קוואקר", "b_2139"], ["טיגר", "טייגר", "b_997"],
  // A letter replaced by one that spells the same sound.
  ["מטרנא", "מטרנה", "b_3516"], ["טריזא", "טריזה", "b_656"], ["אלגנת", "אלגנט", "b_1345"],
  ["מינולתה", "מינולטה", "b_2173"],
  // A consonant dropped, or two neighbouring letters swapped.
  ["סלקד", "סלקטד", "b_2071"], ["פבריז", "פאבריז", "b_1566"], ["שרמן", "שרמין", "b_2126"],
  ["פפס", "פפסי", "b_1099"], ["ריבקו", "ריבוק", "b_2258"],
];

const shorterForms: readonly CaseRow[] = [
  ["Calvin", "Calvin Klein", "b_1577"], ["Abercrombie", "Abercrombie & Fitch", "b_1638"],
  ["Ermenegildo", "Ermenegildo Zegna", "b_3928"], ["Gianfranco", "Gianfranco FERRE", "b_2703"],
  ["Salvatore", "Salvatore ferragamo", "b_2702"], ["Russell", "RUSSELL HOBBS", "b_5190"],
  ["Morphy", "MORPHY RICHARDS", "b_5189"], ["Bausch", "BAUSCH + LOMB", "b_1497"],
  ["Viktor", "VIKTOR & ROLF", "b_2166"], ["Rimmel", "RIMMEL LONDON", "b_2169"],
  ["Bobbi", "BOBBI BROWN", "b_2999"], ["Britney", "BRITNEY SPEARS", "b_2710"],
  ["Escentric", "Escentric Molecules", "b_2936"], ["Beverly", "BEVERLY HILLS", "b_2334"],
  ["Hypnotic", "HYPNOTIC POISON", "b_1219"], ["Kenneth", "Kenneth cole", "b_3271"],
  ["Carolina", "CAROLINA HERRERA", "b_6032", "b_340"], ["Johnnie", "JOHNNIE WALKER", "b_13850mp"],
  ["Drakkar", "DRAKKAR NOIR", "b_6148"], ["Victoria's", "VICTORIA'S SECRET", "b_1784"],
  ["פררו", "פררו רושה", "b_1393"], ["נשיונל", "נשיונל גאוגרפיק", "b_2130"],
  ["אופטימום", "אופטימום נוטרישן", "b_5320"], ["טווינלאב", "טווינלאב ספורטאים", "b_3106"],
  ["קרבטרי", "קרבטרי&אוולין", "b_2127"], ["פיוז", "פיוז טי", "b_2472"],
  ["אינטימיק", "אינטימיק פרש", "b_4096"], ["ריממבר", "ריממבר מי", "b_2262"],
  ["איסימיאקי", "איסימיאקי אסנט", "b_4675"], ["קולורסטי", "קולורסטי (צבעי שיער", "b_18"],
  ["גילקו", "גילקו פארם", "b_4492"], ["פרפרנס", "פרפרנס אומברה", "b_1720"],
  ["אובסשן", "אובסשן סיקרט", "b_5935"], ["פרווקטיב", "פרווקטיב אינטרלוד", "b_3880"],
  ["הנזה", "הנזה פלסט", "b_3191"],
];

const hebrewSpellingsOfLatinBrands: readonly CaseRow[] = [
  ["קסיו", "Casio", "b_6154mp"], ["פוסיל", "Fossil", "b_6467"], ["סייקו", "SEIKO", "b_11435mp"],
  ["לונג'ין", "LONGINES", "b_6640"], ["טיסו", "Tissot", "b_11469mp"], ["דייסון", "DYSON", "b_2944"],
  ["מולינקס", "Moulinex", "b_6101"], ["רוונטה", "ROWENTA", "b_9094mp"], ["דלונגי", "Delonghi", "b_5810mp"],
  ["סמג", "Smeg", "b_9065mp"], ["ברוויל", "Breville", "b_9062mp"], ["קיצ'נאייד", "KitchenAid", "b_5633mp"],
  ["סנהייזר", "SENNHEISER", "b_4449"], ["פוג'יפילם", "FUJIFILM", "b_407"], ["מטל", "Mattel", "b_6342mp"],
  ["צ'יקו", "Chicco", "b_6175mp"], ["סבמד", "sebamed", "b_10706mp"], ["נוקס", "NUXE", "b_4246"],
  ["אסנס", "Essence", "b_1947", "b_4532"], ["מאק", "MAC", "b_5217"], ["סמשבוקס", "smashbox", "b_5199"],
  ["מורוקן אויל", "MOROCCANOIL", "b_7354", "b_7244mp"], ["קרסטאז", "KERASTASE", "b_6593"],
  ["אולפלקס", "OLAPLEX", "b_6585"], ["פול מיטשל", "Paul Mitchell", "b_7468mp"],
  ["ג'ו מאלון", "Jo Malone", "b_6922mp"], ["דייוידוף", "DAVIDOFF", "b_1966"],
  ["נרסיסו רודריגז", "Narciso Rodriguez", "b_5062"], ["קרולינה הררה", "CAROLINA HERRERA", "b_6032", "b_340"],
  ["מארק ג'ייקובס", "MARC JACOBS", "b_3203"], ["סלבטורה פרגמו", "Salvatore ferragamo", "b_2702"],
];

const latinSpellingsOfHebrewBrands: readonly CaseRow[] = [
  ["Apropo", "אפרופו", "b_960"], ["Bissli", "ביסלי", "b_966"], ["Goldstar", "גולדסטאר", "b_1366"],
  ["Dubonim", "דובונים", "b_974"], ["Doritos", "דוריטוס", "b_2054"], ["Danone", "דנונה", "b_6137"],
  ["Hawaii", "הוואי", "b_377"], ["Tempo", "טמפו", "b_772"], ["Yoplait", "יופלה", "b_6155"],
  ["Kif Kef", "כיף כף", "b_1004"], ["Carmit", "כרמית", "b_3998"], ["Master Chef", "מאסטר שף", "b_1845"],
  ["Migdim", "מגדים", "b_3060"], ["Mey Eden", "מי עדן", "b_1092"], ["Milky", "מילקי", "b_6737"],
  ["Neviot", "נביעות", "b_1093"], ["Nicole", "ניקול", "b_860"], ["Ein Gedi", "עין גדי", "b_1045"],
  ["Pelephone", "פלאפון", "b_5589"], ["Pesek Zman", "פסק זמן", "b_1047"], ["Prigat", "פריגת", "b_1106"],
  ["Klik", "קליק", "b_1065"], ["Shokolit", "שוקולית", "b_3040"], ["Shamir", "שמיר", "b_2035"],
  ["Shkedia", "שקדיה", "b_2135"], ["Tapuchips", "תפוצ'יפס", "b_1075"],
  ["Kistrova", "קסטרו", "b_46"], ["Quintrelo", "קונטרול", "b_3594"], ["Olay Fresh", "אלופרש", "b_4910"],
];

function toCases(rows: readonly CaseRow[], describe: (brand: string) => string): Omit<ReviewCase, "id">[] {
  return rows.map(([input, brand, ...codes]) => ({ input, brand, codes, reason: describe(brand) }));
}

const reviewCases: ReviewCase[] = [
  ...toCases(latinTypos, (brand) => `a typo of ${brand}`),
  ...toCases(hebrewTypos, (brand) => `a typo of ${brand}`),
  ...toCases(shorterForms, (brand) => `a shorter form of ${brand}`),
  ...toCases(hebrewSpellingsOfLatinBrands, (brand) => `a Hebrew spelling of ${brand}`),
  ...toCases(latinSpellingsOfHebrewBrands, (brand) => `a Latin spelling of ${brand}`),
].map((entry, index) => ({ id: `RV${String(index + 1).padStart(3, "0")}`, ...entry }));

test("loads the complete review matrix", () => {
  assert.equal(brands.length, 17653);
  assert.equal(reviewCases.length, 166);
  assert.equal(new Set(reviewCases.map((entry) => entry.input)).size, 166);
});

for (const reviewCase of reviewCases) {
  test(`${reviewCase.id}: ${reviewCase.input} is held for review against ${reviewCase.brand}`, () => {
    const result = checker.checkBrand(reviewCase.input);
    const topFive = result.candidates.slice(0, 5);
    const described =
      topFive.map((candidate) => `${candidate.code} ${candidate.label} ${candidate.score.toFixed(3)}`).join(", ") ||
      "no candidates";

    assert.equal(
      result.decision,
      "HUMAN_REVIEW",
      `${reviewCase.id}: ${reviewCase.input} is ${reviewCase.reason} and must be held for review, got ${result.decision} via ${described}`,
    );
    assert.ok(
      topFive.some((candidate) => reviewCase.codes.includes(candidate.code)),
      `${reviewCase.id}: expected ${reviewCase.brand} (${reviewCase.codes.join(" or ")}) in the top five, got ${described}`,
    );
  });
}
