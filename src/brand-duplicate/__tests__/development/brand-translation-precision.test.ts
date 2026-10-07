import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseBrandResponse } from "../../brand-adapter.js";
import { BrandDuplicateChecker } from "../../brand-duplicate-checker.js";
import { BrandIndex } from "../../brand-index.js";

/**
 * Precision guards for the cross-language path, which the two translation suites cannot give:
 * they measure whether a real duplicate is caught, never whether a new name is wrongly flagged.
 *
 * Every invented name below is absent from the catalogue, was ALLOW when the suite was written,
 * and has no near-homophone in the other script. Names that failed any of those checks were
 * discarded rather than kept as negatives: "Zelmora" reviews on the Latin brand Selmor and
 * "Calvora" sounds like קולור, and a name that sounds like a catalogued brand is not a false
 * positive when it is flagged. The invented names must stay ALLOW in both directions. The
 * negative controls in the translation suites only forbid BLOCK for Hebrew input, which a
 * phonetic match can never produce, so they cannot see a phonetic false positive.
 *
 * The ranking checks come from brand-evaluation.json, whose rows were labelled by hand:
 * for every query whose SAME brand is in the other script, that brand must outrank each
 * candidate labelled DIFFERENT. That includes Hebrew product lines of the same brand, such as
 * שאנל 18 against CHANEL, which outranked the brand itself until pronunciation was compared.
 */
type EvaluationRow = {
  query: string;
  candidate: string;
  category: "SAME" | "DIFFERENT" | "RELATED_BUT_DISTINCT";
  candidateCode: string;
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const brands = parseBrandResponse(JSON.parse(await readFile(path.join(root, "response.json"), "utf8")) as unknown);
const checker = new BrandDuplicateChecker(new BrandIndex(brands));
const evaluationRows = JSON.parse(
  await readFile(path.join(root, "brand-evaluation.json"), "utf8"),
) as EvaluationRow[];

const inventedLatinNames: readonly string[] = [
  "Delmique", "Fentaro", "Nexolia", "Quelmara", "Ulmeda", "Varnessa", "Wexolia", "Zanquile",
  "Brentova", "Drevanta", "Frexia", "Ivolan", "Lervoti", "Norvessa", "Plivanto", "Rostevia",
  "Trelvosa", "Xyvora", "Zorbaxa", "Exovela", "Flamorvi", "Hovelta", "Iskarvo", "Kasmevo",
  "Lostarvi", "Ostravi", "Pelmora", "Ruvanta", "Sorvelle", "Blomarta", "Dulvenko", "Vuxemo",
  "Pyrlanta", "Oxibrel", "Ubrexil", "Fizmarti", "Gortenza", "Imbresta", "Kaltrevo", "Luzvenia",
];

const inventedHebrewNames: readonly string[] = [
  "זורבלין", "קמטרוס", "גלפורן", "ברזמיה", "חרמולי", "וסטרינו", "מינורבי", "לטרוזי",
  "נסקורי", "פורדלין", "כרמוזי", "שפלורן", "דמסקלי", "קורבנטי", "לפרנזי", "יורבלט",
  "זלקורי", "נפטורי", "בורסמלי", "דרוסקלי", "מרבולזי", "זרפלין", "טבלורין", "פסקולט",
  "חמברין", "נולסקי", "קרמפלי", "זוסטרלי", "טפרוני", "סגלבורן", "פרזמולי", "ברטוליק",
  "קוסמברי", "לדרוזי", "שקורבלי", "נמברוסי", "חטפורין", "זבלורסי", "פלמסקי", "קנדרוזי",
];

const isHebrew = (value: string): boolean => /[֐-׿]/u.test(value);
const isCrossScript = (row: EvaluationRow): boolean => isHebrew(row.query) !== isHebrew(row.candidate);
const crossScriptQueries = [
  ...new Set(
    evaluationRows.filter((row) => row.category === "SAME" && isCrossScript(row)).map((row) => row.query),
  ),
];

test("loads the complete precision matrix", () => {
  assert.equal(brands.length, 17653);
  assert.equal(inventedLatinNames.length, 40);
  assert.equal(inventedHebrewNames.length, 40);
  assert.equal(new Set([...inventedLatinNames, ...inventedHebrewNames]).size, 80);
  assert.equal(crossScriptQueries.length, 14);
});

for (const name of [...inventedLatinNames, ...inventedHebrewNames]) {
  test(`${name} is an invented name and is allowed`, () => {
    const result = checker.checkBrand(name);
    assert.equal(
      result.decision,
      "ALLOW",
      `${name}: an invented name must be allowed, got ${result.decision} via ${
        result.candidates.slice(0, 3).map((candidate) => `${candidate.label} ${candidate.score.toFixed(3)}`).join(", ")
      }`,
    );
  });
}

for (const query of crossScriptQueries) {
  test(`${query}: the same brand outranks every different one`, () => {
    const result = checker.checkBrand(query);
    const position = (code: string): number => {
      const index = result.candidates.findIndex((candidate) => candidate.code === code);
      return index === -1 ? Number.POSITIVE_INFINITY : index;
    };
    const rows = evaluationRows.filter((row) => row.query === query);
    const sameRows = rows.filter((row) => row.category === "SAME" && isCrossScript(row));
    const samePosition = Math.min(...sameRows.map((row) => position(row.candidateCode)));
    const listed = result.candidates.map((candidate) => candidate.label).join(", ");

    assert.ok(
      Number.isFinite(samePosition),
      `${query}: expected ${sameRows.map((row) => row.candidate).join(" or ")} among the candidates, got ${listed}`,
    );
    for (const row of rows.filter((entry) => entry.category === "DIFFERENT")) {
      assert.ok(
        position(row.candidateCode) > samePosition,
        `${query}: ${row.candidate} is labelled DIFFERENT but outranks the same brand, got ${listed}`,
      );
    }
  });
}
