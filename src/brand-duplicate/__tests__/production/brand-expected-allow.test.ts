import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseBrandResponse } from "../../brand-adapter.js";
import { BrandDuplicateChecker } from "../../brand-duplicate-checker.js";
import { BrandIndex } from "../../brand-index.js";

/**
 * Names that are new brands and must be allowed. The translation suites measure whether a real
 * duplicate is caught; this one measures the other side, that a name which is not a duplicate is
 * let through rather than held for review.
 *
 * Every input is absent from the catalogue and was ALLOW when the suite was written. They fall into
 * three kinds:
 *
 * - Invented names in either script, with no catalogued brand that sounds like them.
 * - Names that add words to a catalogued brand, in its own script or the other one (NIVEA MEN
 *   against NIVEA, גרמין ספורט against GARMIN). Adding words makes a new name; a shorter form of a
 *   brand still reviews, so Lipton Ice was left out because the catalogue holds ליפטון אייס טי.
 * - Names with as many words as a catalogued brand, one of them replaced by an unrelated word
 *   (Hugo Park against HUGO BOSS).
 *
 * As in the precision suite, a name that sounds like a catalogued brand was discarded rather than
 * kept, since flagging it is correct: Kistrova reviews on קסטרו, Quintrelo on קונטרול and Olay
 * Fresh on אלופרש. Names that pair only once a leading vowel is dropped were discarded too:
 * Emzavir on מזור, Amvroza on מורז, Hezmora on זמורה, Evian Sport on בון ספורט. The Latin-to-Hebrew
 * rules keep the reading without its alef on purpose, so whether those should review is a policy
 * question this suite does not settle.
 */
type AllowCase = {
  id: string;
  input: string;
  /** Why the name is new, for the failure message. */
  reason: string;
};

const responsePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../response.json");
const brands = parseBrandResponse(JSON.parse(await readFile(responsePath, "utf8")) as unknown);
const checker = new BrandDuplicateChecker(new BrandIndex(brands));

const inventedLatinNames: readonly string[] = [
  "Tolvessa", "Merquila", "Zantrevo", "Presquin", "Hamzeta", "Jevrolin", "Movelqa", "Nuvesko",
  "Pexarin", "Rezvanti", "Skorvela", "Tavrisko", "Ulvanesq", "Vorquena", "Wimbrelo", "Yastrevo",
  "Zuvrinta", "Brastique", "Clovenza", "Elvisqua", "Faskorin", "Glintova", "Istravel", "Jolquina",
  "Kavrenzo", "Lomquesta", "Marvelqo", "Nerbastio", "Olvrenza", "Pazmirel", "Rimbasque", "Selvquaro",
  "Tronzelia", "Umbrasko", "Vexmorin", "Wolvanza", "Xantrevi", "Yelmorqa", "Zestrovik", "Arkavelle",
  "Brizmolta", "Cravenzo", "Dolquesta", "Esvrinka", "Frolvesta", "Gazmirel", "Hovrenka", "Ilzvarta",
  "Jastrovel", "Korvinqa",
];

const inventedHebrewNames: readonly string[] = [
  "זורקמלי", "פלנטרוזי", "גרבונלי", "מסטרלוקי", "קנזברוני", "דולברסקי", "טרפלוזי", "שמרלבוני",
  "ברוקלזי", "חלמסטרי", "ונזבורי", "קלמרוסטי", "פרגלוזי", "סמברלוקי", "נגרבולי", "תלברזמי",
  "לוזמברקי", "גוסטרבלי", "ירבלוזי", "מקלזברי", "צורבלזי", "דרפלומי", "כלזמרוטי", "בנדרוסקי",
  "פרמזולקי", "טולברזי", "שגרולבי", "חזמבורלי", "רוקזמלי", "נזפלורי", "קסבלורי", "גמלזורקי",
  "ולמבורזי", "סזרקולי", "פוזברלי", "דמלזורקי", "קרפוזלי", "טמזורלקי", "בלגזורי", "מוזקרבלי",
  "לפזרבוקי", "זנברוקלי", "שלמבוזרי", "גזלפורי", "תמקרולזי", "ברוזמלקי", "כפלזורי", "יזמברולי",
  "חסקרבולי", "פטרוזמלי",
];

/** [input, the catalogued brand it extends], both in the same script. */
const sameScriptExtensions: ReadonlyArray<readonly [string, string]> = [
  ["Garmin Marine", "GARMIN"], ["Logitech Gaming", "LOGITECH"], ["Samsung Kitchen", "SAMSUNG"],
  ["Remington Barber", "REMINGTON"], ["Braun Kids", "BRAUN"], ["Kenwood Chef", "KENWOOD"],
  ["Jabra Office", "JABRA"], ["Contigo Kids", "CONTIGO"], ["Whiskas Junior", "WHISKAS"],
  ["Pedigree Puppy", "PEDIGREE"], ["Powerade Zero", "POWERADE"], ["Zippo Outdoor", "ZIPPO"],
  ["Twistshake Baby", "TWISTSHAKE"], ["Sistema Lunch", "SISTEMA"], ["Intex Pools", "INTEX"],
  ["Juvena Skin", "JUVENA"], ["Payot Paris", "PAYOT"], ["Furla Donna", "FURLA"],
  ["Bobbi Brown Studio", "BOBBI BROWN"], ["Tom Ford Beauty", "TOM FORD"], ["Kiehl's Men", "KIEHL'S"],
  ["Yardley Gold", "YARDLEY"], ["Lanvin Studio", "LANVIN"], ["Beurer Medical", "Beurer"],
  ["Glamglow Pro", "GLAMGLOW"], ["Mooncup Teen", "mooncup"], ["Plantronics Voice", "PLANTRONICS"],
  ["Truvia Baking", "truvia"], ["Nanobebe Go", "NANOBEBE"], ["Tonymoly Kids", "TONYMOLY"],
  ["Embryolisse Men", "EMBRYOLISSE"], ["Nutramigen Plus", "NUTRAMIGEN"], ["Soflens Daily", "Soflens"],
  ["במבה גדולה", "במבה"], ["מילקה לבן", "מילקה"], ["ספרייט זירו", "ספרייט"],
  ["פאבריז בית", "פאבריז"], ["סקוטקס מטבח", "סקוטקס"], ["דומסטוס חזק", "דומסטוס"],
  ["קיקומן שף", "קיקומן"], ["ליפטון קר", "ליפטון"], ["קנור שף", "קנור"],
  ["פנטן לילה", "פנטן"], ["דטול ידיים", "דטול"], ["פיניש מקס", "פיניש"],
  ["סנסודיין לבן", "סנסודיין"], ["טרידנט מנטה", "טרידנט"], ["קסטרו קידס", "קסטרו"],
  ["סוויפר בית", "סוויפר"], ["לנור סגול", "לנור"], ["קולגייט ילדים", "קולגייט"],
  ["טייד פלוס", "טייד"], ["אורביט ילדים", "אורביט"], ["מטרנה פלוס", "מטרנה"],
  ["וולטרן ספורט", "וולטרן"],
];

/** [input, the catalogued brand it extends], with the brand written in the other script. */
const crossScriptExtensions: ReadonlyArray<readonly [string, string]> = [
  ["גרמין ספורט", "GARMIN"], ["לוג'יטק גיימינג", "LOGITECH"], ["רמינגטון ברבר", "REMINGTON"],
  ["קנווד שף", "KENWOOD"], ["ג'אברה משרד", "JABRA"], ["ויסקאס גורים", "WHISKAS"],
  ["פדיגרי גורים", "PEDIGREE"], ["אוויאן ספורט", "EVIAN"], ["זיפו שטח", "ZIPPO"],
  ["סיסטמה צהריים", "SISTEMA"],
  ["Bamba Max", "במבה"], ["Milka Bianca", "מילקה"], ["Febreze Home", "פאבריז"],
  ["Domestos Power", "דומסטוס"], ["Kikkoman Chef", "קיקומן"], ["Charmin Soft", "שרמין"],
  ["Knorr Chef", "קנור"], ["Sensodyne White", "סנסודיין"], ["Trident Mint", "טרידנט"],
  ["Castro Kids", "קסטרו"],
];

/** [input, the catalogued brand it shares all but one word with]. */
const swappedWordNames: ReadonlyArray<readonly [string, string]> = [
  ["Hugo Park", "HUGO BOSS"], ["Tom Garden", "TOM FORD"], ["Max Harbor", "MAX FACTOR"],
  ["Banana Castle", "BANANA REPUBLIC"], ["Bobbi Green", "BOBBI BROWN"], ["Monster Garden", "MONSTER ENERGY"],
  ["Rimmel Oslo", "RIMMEL LONDON"], ["Beverly Gardens", "BEVERLY HILLS"], ["Juicy Garden", "JUICY COUTURE"],
  ["Ted Morgan", "TED LAPIDUS"], ["Elie Marbo", "ELIE SAAB"], ["Jimmy Lantern", "JIMMY CHOO"],
  ["Shawn Rivers", "SHAWN MENDES"], ["Laura Bellini", "LAURA BIAGIOTTI"], ["Ariana Stone", "ARIANA GRANDE"],
  ["סימפלי גרדן", "סימפלי קליניק"], ["נטורל מורנינג", "נטורל דיאט"], ["הלתי סטאר", "הלתי פוד"],
  ["גוד מורנינג", "גוד סנס"], ["תה פריז", "תה לונדון"], ["אדם קופר", "אדם גולד"],
  ["מגיק רויאל", "מגי'ק ריטאצ'"], ["סלים ג'ונגל", "סלים דרינק"], ["פרש מאונטן", "פרש וונס"],
  ["מלודי סטאר", "מלודי פופס"],
];

const allowCases: AllowCase[] = [
  ...inventedLatinNames.map((input) => ({ input, reason: "an invented name" })),
  ...inventedHebrewNames.map((input) => ({ input, reason: "an invented name" })),
  ...sameScriptExtensions.map(([input, brand]) => ({ input, reason: `adds words to ${brand}` })),
  ...crossScriptExtensions.map(([input, brand]) => ({ input, reason: `adds words to ${brand}` })),
  ...swappedWordNames.map(([input, brand]) => ({ input, reason: `replaces a word of ${brand}` })),
].map((entry, index) => ({ id: `AL${String(index + 1).padStart(3, "0")}`, ...entry }));

test("loads the complete allow matrix", () => {
  assert.equal(brands.length, 17653);
  assert.equal(allowCases.length, 200);
  assert.equal(new Set(allowCases.map((entry) => entry.input)).size, 200);
});

for (const allowCase of allowCases) {
  test(`${allowCase.id}: ${allowCase.input} is a new name and is allowed`, () => {
    const result = checker.checkBrand(allowCase.input);
    assert.equal(
      result.decision,
      "ALLOW",
      `${allowCase.id}: ${allowCase.input} ${allowCase.reason} and must be allowed, got ${result.decision} via ${
        result.candidates.slice(0, 3).map((candidate) => `${candidate.label} ${candidate.score.toFixed(3)}`).join(", ")
      }`,
    );
  });
}
