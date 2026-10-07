# Manual Brand Duplicate Test Cases

This matrix is for exercising the interactive command:

```powershell
npm run brand:check
```

Enter one label per line. Each non-empty line returns one JSON object. Record the complete response, especially `decision`, `confidence`, the top candidate's `code`, `label`, `matchType`, `reason`.

## Preconditions

1. Install Node dependencies and build the project:

   ```powershell
   npm install --registry=https://registry.npmjs.org
   npm run build
   ```

2. Run the deterministic regression suite:

   ```powershell
   npm test
   ```

3. To end an interactive PowerShell session, press `Ctrl+Z`, then `Enter`. To test several labels without an interactive session:

   ```powershell
   "ADIDAS`nאדידס`nAdidas Originals`nORANGE" | npm run brand:check
   ```

## Result record

| Field | Value |
| --- | --- |
| Case ID |  |
| Input |  |
| Expected decision |  |
| Actual decision/confidence |  |
| Top candidate code/label |  |
| Match type/reason |  |
| Notes and elapsed time |  |

## A. Interactive and exact matching

These cases can be entered directly in the terminal.

| ID | Input | Expected result | Inspect |
| --- | --- | --- | --- |
| A01 | `ADIDAS` | `BLOCK`, normalized exact | Candidate label/code and `NORMALIZED_EXACT` |
| A02 | ` Adidas ` | Same as A01 | Outer whitespace is removed |
| A03 | `Tommy  Hilfiger` | `BLOCK` if the normalized label exists | Repeated whitespace collapses |
| A04 | `TP-LINK`, `TP_LINK`, `TP LINK` | `BLOCK` for each equivalent form | Word boundary remains; inspect normalized input |
| A05 | `L’Oreal`, `L\`Oreal`, `L'OREAL` | `BLOCK` when the corresponding label exists | Apostrophe normalization |
| A06 | `ＦＯＯ` | Match the normalized ASCII form only if it exists | Unicode compatibility normalization |
| A07 | `Cafe` and `Café` | Must not be treated as normalized exact solely because they look similar | Meaningful accents remain distinct |
| A08 | `ORANGE` | Usually `ALLOW` if no useful candidate exists | Empty candidates |
| A09 | blank line and whitespace-only line | No output line | Confirm the next input still works |
| A10 | several labels in one session | One JSON response per non-empty input | Persistent session and clean EOF |
| A11 | `l’eau par kenzo` | `BLOCK`, candidate code `b_3476` in the supplied dataset | Full-dataset exact/normalized evidence |

## B. Typos, fuzzy matches, and related names

These cases should be checked against the returned candidate evidence. `REVIEW` is intentional for ambiguous names. A name that only adds words to a brand, or shares only some of its words, is a new name and is allowed.

| ID | Input | Expected result | Inspect |
| --- | --- | --- | --- |
| B01 | One-character deletion from `ADIDAS` | Strong Adidas candidate; long one-edit typo may `BLOCK` | Edit distance, similarity, and `matchType` |
| B02 | One-character insertion into `ADIDAS` | Strong candidate; verify the decision is not an unrelated false block | Candidate score and reason |
| B03 | `AIDdas` | Prefer `REVIEW` for a transposition ambiguity | `isTransposition` signal |
| B04 | `LACCOSTE` | Strong `LACOSTE` candidate; verify long-name typo policy | `HIGH_FUZZY` or equivalent evidence |
| B05 | `Advill` | `REVIEW`, not automatic certainty | Short/borderline name policy |
| B06 | `BF` and `BE` | Never automatic `BLOCK` from one short edit alone | Candidate count and confidence |
| B07 | A multi-edit alteration of `ADIDAS` | `REVIEW` or `ALLOW`, not an unsupported exact block | `POSSIBLE_TYPO`/`WEAK_SIMILARITY` |
| B08 | `Adidas Originals` | `ALLOW`: an extension of Adidas is a new name | `RELATED_NAME` candidate marked `partialMatch` |
| B09 | `Polo Green` against `Polo Blue` / `Polo Red` | `ALLOW`: one word differs entirely | `partialMatch` on each Polo candidate |
| B10 | `Dior` against `DIOR HOMME` | `REVIEW`: a shorter form may be the same brand | Related-name evidence |
| B11 | `Dior Homme` against `DIOR` | `ALLOW`, not `REVIEW` | Extension of a catalogued brand |
| B11a | `סטפיל` against `סטייל` | `ALLOW`: פ and י are not neighbouring keys | `implausibleSubstitution` signal |
| B11b | `סטייך` against `סטייל` | `REVIEW`: ך sits next to ל | One-edit typo evidence |
| B12 | `Diorian` | No false `BLOCK` for `DIOR` solely from a shared prefix | Candidate ranking and similarity signals |
| B13 | `NIVEA` and `NIKE` | No false `BLOCK` solely from visual similarity | Top candidate and decision reason |

## C. Translations, scripts, and transliteration

| ID | Input | Expected result | Inspect |
| --- | --- | --- | --- |
| C01 | An indexed English translation of a Hebrew label | `BLOCK` | Translation candidate and code |
| C02 | `אדידס` | `BLOCK` when Adidas is indexed; usually transliteration evidence | `TRANSLITERATION_EXACT` and source |
| C03 | `נייקי` | `BLOCK` when Nike is indexed | Curated transliteration evidence |
| C04 | `לוריאל` | `BLOCK` when L’Oreal is indexed | Apostrophe and curated transliteration |
| C05 | `ז'יבנשי` | `BLOCK` when Givenchy is indexed | Hebrew punctuation and transliteration |
| C06 | Latin spelling for a Hebrew-only indexed label | `BLOCK` only when transliteration evidence is exact and authoritative | Candidate script fields |
| C07 | `קמיל בלו NATURE` | `BLOCK` if it maps to the indexed mixed-language brand | Mixed-script candidate evidence |
| C08 | `אדידאס` | Candidate should not disappear; expect `BLOCK` only if evidence is authoritative, otherwise `REVIEW` | Fuzzy transliteration and conservative decision |
| C09 | `גד` against `GD` | Prefer `REVIEW`, not automatic block from a generated coincidence | `GENERATED` transliteration source |
| C10 | `דיאור הום` | `REVIEW` against `DIOR` | Cross-language related-name behavior |
| C11 | `קנזו הום` | `REVIEW` against `KENZO` | Cross-language product-line safety |
| C12 | Hebrew word meaning “apple” against `APPLE` | No match solely from semantic meaning | No semantic translation inference |
| C13 | Hebrew-only, Latin-only, mixed-script, numeric/symbol input | Appropriate script-specific candidates or no candidates | `inputScript` and `candidateScript` |

## D. Aliases and deterministic precedence

These cases are best exercised with the configured alias resolver or a focused TypeScript test fixture. The terminal can verify the resulting behavior once the alias is present in configuration.

| ID | Setup/input | Expected result | Inspect |
| --- | --- | --- | --- |
| D01 | Configured approved alias for `ADIDAS` | `BLOCK`, `APPROVED_ALIAS` | Alias reason and canonical label |
| D02 | Case, spacing, punctuation variants of that alias | Same approved alias result | Alias normalization |
| D03 | Unconfigured alias-like spelling | Normal fuzzy/cross-language policy only | No implicit alias authority |

## E. Data, bounds, and operational behavior

| ID | Action | Expected result | Inspect |
| --- | --- | --- | --- |
| E01 | Start the CLI with the supplied `response.json` | Dataset loads and index builds once | No repeated parse/index work per label |
| E02 | Enter exact, typo, Hebrew, mixed-script, related, and unrelated labels | Each returns within an acceptable local time | Decision, top candidate, and elapsed time |
| E03 | Inspect every result's candidate list | Candidate count never exceeds configured maximum | Stable score ordering and code-level deduplication |
| E04 | Provide malformed data through a focused adapter fixture | Invalid records are ignored; valid records remain | `parseBrandResponse` behavior |
| E05 | Include duplicate labels/translations under different codes | Matching codes are retained and merged correctly | Candidate codes and deduplication |
| E06 | Press `Ctrl+C` during an idle session | Process exits cleanly | Clean shutdown |
| E07 | End input with `Ctrl+Z`, then `Enter` | Process exits cleanly | No extra output or error |
| E08 | Pipe four lines including one blank line | Exactly three JSON output lines | Blank-line filtering and machine-readable stdout |

## Existing automated coverage

The closest automated regression suites are:

- `src/brand-duplicate/__tests__/development/brand-duplicate.test.ts`: normalization, exact matches, translations, null input, adapter behavior, and the supplied full dataset.
- `src/brand-duplicate/__tests__/development/brand-duplicate-phase2.test.ts`: fuzzy behavior, short names, related-name safety, candidate bounds, indexing, and performance.
- `src/brand-duplicate/__tests__/development/brand-duplicate-phase3.test.ts`: scripts, transliteration, aliases, and cross-language safeguards.
- `src/brand-duplicate/__tests__/production/brand-translation-he-to-en.test.ts`: Hebrew input against English-labelled brands. Intentionally failing; see [hebrew-to-english-test-cases.md](hebrew-to-english-test-cases.md).
- `src/brand-duplicate/__tests__/production/brand-translation-en-to-he.test.ts`: English input against Hebrew-only labels. Intentionally failing; see [english-to-hebrew-test-cases.md](english-to-hebrew-test-cases.md).

Section C of this document is a breadth-first pass over both cross-language directions. The
two documents above go deeper on one direction each, with measured per-case status, and are
the better starting point for work on the transliteration gate.

The terminal matrix is intentionally broader than the interactive CLI. Alias and threshold cases require injected fixtures and should not be judged from a brand label alone.