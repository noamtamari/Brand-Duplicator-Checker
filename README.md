# Brand Duplicate Checker

Reusable duplicate checking for a **new** brand value. Every decision comes from deterministic matching rules: normalization, same-script similarity, Hebrew/Latin transliteration, and cross-script phonetic comparison. No language model is involved.

It does not scan the existing dataset for duplicate reports or modify or merge brands. The checker loads its brand catalogue from the Mirakl API when the CLI starts.

## Existing architecture

- `BrandNormalizer` creates conservative normalized and compact names.
- `BrandIndex` preprocesses labels/translations into exact, prefix, bigram, and Hebrew transliteration indexes.
- `CandidateGenerator` retrieves same-script candidates; `CrossLanguageCandidateGenerator` retrieves Hebrew/Latin candidates.
- `cross-script-phonetic-matcher.ts` compares a Hebrew name with a Latin one by how they sound. Hebrew letters keep every sound they can stand for, Latin names are read by English, French, Italian and German spelling rules, and a weighted alignment with explicit evidence rules decides whether the two are the same name. It works word by word for multi-word names.
- `BrandCandidateScorer` produces explainable deterministic similarity signals.
- `DecisionEngine` applies `BLOCK` / `REVIEW` / `ALLOW` rules.
- `BrandDuplicateChecker.checkBrand()` is the single, synchronous entry point.

The CLI fetches the current brand catalogue from Mirakl on every run and adapts it with `parseBrandResponse()` into the internal `Brand` model. The root `response.json` remains a local snapshot used by tests and offline development; the CLI does not overwrite it.

The flow is:

```text
input -> normalization -> exact/fuzzy/transliteration/phonetic candidates
      -> merged top-N shortlist -> DecisionEngine
```

## Transliteration rules file

`data/phonetic-transliteration-rules.json` holds hand-verified Hebrew/English spellings of the same
brand and the Hebrew names of Latin letters. `brand-overrides.ts` reads it once per process; edit
or replace the file to change the curated list, no code change needed.

- **Curated brand pairs** (gucci = גוצ׳י, acer = אייסר, …) are used in both directions. A curated
  exact transliteration is the only cross-script match that can `BLOCK`; everything generated stops at
  `REVIEW`. Spellings are matched with and without a geresh.
- **Generic words are excluded.** The file also carries a word lexicon — generic words (sport, paris,
  beauty), function words and single letters (the, and, u), and romanized Hebrew category words or
  placeholders (ילדים, מבוטל). Those would block unrelated names, so `EXCLUDED_OVERRIDES` in
  `brand-overrides.ts` keeps them out of the curated list; they are still found by the ordinary
  transliteration rules and land at `REVIEW`. Add a Latin spelling there to exclude a new entry.
- **Acronyms** are matched as spelled-out letter names: CK ↔ סי קיי, DKNY ↔ די קיי אן וואי. A Latin
  word counts as an acronym when it is two or three capital letters, or two to five letters with no
  vowel; a Hebrew name counts when every word is a letter name.

The grapheme tables in `transliteration-service.ts` (Hebrew → Latin) and
`latin-to-hebrew-transliteration.ts` (Latin → Hebrew) were extended from the same file's rules, with a
cost per reading so that unusual spellings stay reachable without crowding out the ordinary ones.

## Public API

```ts
import {
  BrandDuplicateChecker,
  BrandIndex,
  parseBrandResponse,
} from "./src/brand-duplicate/index.js";

const brands = parseBrandResponse(responseJson);
const checker = new BrandDuplicateChecker(new BrandIndex(brands));

const result = checker.checkBrand("אדידס");
```

The eventual creation flow can map `BLOCK` to stop, `REVIEW` to human confirmation, and `ALLOW` to continue. Creation-script integration is intentionally not redesigned here.

## Checking brand names

`check-brand.ps1` takes one or more proposed brand names and writes a report file. It rebuilds
only when TypeScript sources or build inputs are newer than the compiled output.

```powershell
.\check-brand.ps1 "Adidas" "Versace"
.\check-brand.ps1 --input "brand list.txt"
.\check-brand.ps1 "Adidas" --out results\october
```

Pass `-SkipBuild` to reuse the existing `dist/` output even when sources changed.

> Do not use `npm run brand:check -- "Some Brand"`. On Windows npm rebuilds the command line
> through `cmd.exe`, which turns `"Zyraphix Nova"` into `^Zyraphix^ Nova^` and drops `--out`
> altogether. `npm run brand:check` with no arguments is still fine for the interactive mode below.

### Input

Three ways to supply names, in this order of precedence:

1. **Arguments** — one name per argument, quoted if it contains spaces.
2. **`--input <file>`** — one name per line. Blank lines are ignored and a leading UTF-8 BOM is
   stripped, so a list saved from Notepad or Excel works unchanged.
3. **stdin** — used when neither is given. Type one name per line, finish with `Ctrl+Z` then
   `Enter`, or `Ctrl+C` to stop early. The report still covers everything checked before the stop.

### Output

Each run writes `<base>.txt`, `<base>.csv`, and `<base>.timing.json`. The default base is
`results/brand-check-<timestamp>`; `--out <path>` overrides it, and a `.txt` or `.csv` extension on
that path is ignored so all three files share one base. The result reports are UTF-8 with a BOM, so
Excel and Notepad render Hebrew labels correctly. The JSON timing file records exact durations in
milliseconds for catalogue retrieval/parsing, index construction, index cache loading/saving,
cache hits, input loading, input/interactive
wait and result formatting, duplicate checking, result report writing, and total runtime. The timing
file is written even when no names were supplied.

The report reduces the engine's three decisions to two, because a `BLOCK` and a `HUMAN_REVIEW` both
end with a person comparing names:

| Engine decision | Report result |
| --------------- | ------------- |
| `ALLOW`         | `ALLOW`       |
| `HUMAN_REVIEW`  | `REVIEW`      |
| `BLOCK`         | `REVIEW`      |

`ALLOW` rows carry no candidates. `REVIEW` rows list up to five existing brands as label and code
only — the scores, match types, and reasons stay on the terminal.

### Catalogue API

Every CLI run requires network access and a Mirakl bearer token. Paste the token into the
`BRAND_API_TOKEN` entry in the root `.env` file before running the checker:

```dotenv
BRAND_API_TOKEN=your-bearer-token
```

The CLI reads `.env` from the project root. A `BRAND_API_TOKEN` already set in the process
environment takes precedence. You can run the checker as usual:

```powershell
python check_brand.py "Adidas"
```

The token is sent as `Authorization: Bearer <token>`. Keep it in your shell or secret manager,
not in source control; `.env` is ignored by Git. If the token is missing or the API request fails,
the checker exits with an error instead of using the local snapshot.

## Brand Review Executable

The Windows review app reads one brand name per line from `brandList.txt` in its application
folder, fetches the live catalogue once, and opens a local browser page. `ALLOW` rows start selected;
`REVIEW` rows start unchecked. Review or change the selection, then choose **Create output**.

To build the standalone executable on Windows, install Node.js 24 or newer and the project
dependencies, then run:

```powershell
npm install
npm run brand:review:build
```

The result is `dist/BrandReview.exe`. Copy it to an application folder beside `brandList.txt` and
`.env`. The `.env` file must contain `BRAND_API_TOKEN=...`; the token is read only by the executable
and is never sent to the browser. The app requires network access to the Mirakl catalogue.

For development, use `npm run brand:review` from the project root. This opens the same review UI
without creating an executable.

Each run writes a timestamped `brand-review-<timestamp>.timing.json` beside the executable when you
finish exporting or close the review app. It records brand-list loading, catalogue retrieval/parsing,
index construction, duplicate checking, result formatting, review UI/server startup, browser review
time, export creation, time to review readiness, and total elapsed time. The total includes time spent reviewing in the browser.

Both the CLI and review app cache only the indexed Hebrew transliteration variants beside their
respective application roots (`.brand-index-cache-cli.json` and `.brand-index-cache-review.json`).
Each run still fetches the live catalogue and builds its index; incoming names are checked against
the live data. Cache entries are reused only when the running code and transliteration rules match,
and unused names are removed after a successful index build. Deleting a cache file forces a cold
build. The standalone executable has its own embedded code fingerprint, so copying a new EXE
invalidates its old cache automatically.

On successful creation, the app writes `SP_brands_<YYYYMMDDHHmm>.csv` and
`SP_brand_relations_<YYYYMMDDHHmm>.csv` in the application folder. Each checked name receives a
new `b_<number>mp` code above the highest matching code in the live catalogue. Only checked names
are exported. The app replaces all prior root CSVs whose names exactly match those two timestamped
patterns, including the checked-in sample files; unrelated files are preserved. An empty selection
does not change existing exports. Output files retain the observed sample headers and row layout.

The standalone build bundles Node.js and is Windows-only; unsigned builds may show a Windows
SmartScreen warning. The output CSV format should be validated with the Mirakl import workflow before
operational use because the provided examples have two-column headers and three-column data rows.

The text tally gives a quick summary, while the JSON timing file is the detailed diagnostic record:

- **catalogue retrieval and parsing** — API request and converting the response into brand records.
- **index construction** — building the in-memory search index.
- **index cache loading/saving and hits** — persistent indexed-transliteration cache overhead and reuse.
- **input loading** — reading a `--input` file; zero for positional arguments and stdin.
- **input and result formatting** — time spent consuming input and printing per-name results, less
  duplicate-check time. For interactive stdin, this includes time spent typing.
- **duplicate checking** — time spent checking names, summed over every name.
- **result report writing** — writing the text and CSV reports.
- **total** — wall-clock time from CLI startup through writing the text and CSV reports. It excludes
  compilation done by `check-brand.ps1` and writing the timing JSON itself.

The text tally's **build** is catalogue retrieval/parsing plus index construction, and **check** is
duplicate-check time. The CSV carries rows only, so it is unchanged.

```text
Brand check results - 2026-09-23 14:02
2 checked | 1 ALLOW | 1 REVIEW | 5.8s (build 5.0s, check 0.8s)

[1] Qwxzptlk
    Result: ALLOW

[2] Versace
    Result: REVIEW
    Existing brands to compare:
      - VERSACE (b_104)
      - Versace (b_4680)
```

```csv
"brand","result","candidates"
"Qwxzptlk","ALLOW",""
"Versace","REVIEW","VERSACE (b_104); Versace (b_4680)"
```

### Terminal

Every name still prints its full diagnostic summary — decision, confidence, per-candidate scores,
match types and reasons — on `stderr`. **Nothing is written to `stdout`**, so the command can be
redirected without duplicating the report into a pipe.

The command fetches the catalogue and builds the index once, so checking a batch in a single run
costs far less than one run per name.

The full manual scenario matrix is in [`docs/manual-tests/manual-brand-duplicate-test-cases.md`](docs/manual-tests/manual-brand-duplicate-test-cases.md), alongside the two directional Hebrew/English matrices.

## Evaluation dataset

`brand-evaluation.json` is a hand-labelled dataset of `SAME`, `DIFFERENT`, and `RELATED_BUT_DISTINCT` pairs drawn from real review output. The precision suite uses it to check candidate ranking (see below).

## Tests and commands

Install Node dependencies and run every suite:

```powershell
npm install --registry=https://registry.npmjs.org
npm test
```

The tests are split into two folders under `src/brand-duplicate/__tests__/`:

- `production/` holds the acceptance suites run against the full catalogue: the manual acceptance
  matrix, the names expected to be allowed, the names expected to be held for review, and both
  translation directions.
- `development/` holds the unit tests and the precision suite.

Run one group with `npm run test:production` or `npm run test:development`.
[README-RUN-TESTS.md](src/brand-duplicate/__tests__/README-RUN-TESTS.md) lists every suite with what
it checks and the command that runs it.

The development unit tests cover normalization, same-script scoring, transliteration, cross-language candidate generation, related-name safety, no-candidate behavior, the phonetic matcher's reading and evidence rules, command-line argument parsing, result formatting, and the report's decision mapping and CSV escaping. They also cover the curated pairs and their exclusions, the ported grapheme rules, acronyms, and the cross-script evidence rules (`brand-overrides.test.ts`).

### Cross-language suites

Three suites check Hebrew/English duplicate detection against the full dataset:

```powershell
npm run test:brand-translation:he-en      # production
npm run test:brand-translation:en-he      # production
npm run test:brand-translation:precision  # development
```

All three pass. The two directional suites assert that a duplicate is caught: the expected
brand is in the top five, and the decision is not `ALLOW`. `HUMAN_REVIEW` counts as caught,
since a pairing that rests on a generated spelling belongs in front of a person. Every input
is absent from the catalogue as written (one documented exception), and every expected code was
verified against `response.json`.

The precision suite guards the other side, which the directional suites cannot see:

- 80 invented names, 40 per script, must stay `ALLOW`.
- For each cross-script query in `brand-evaluation.json`, the brand labelled SAME must
  outrank every brand labelled DIFFERENT.

Most of the recall comes from comparing pronunciation rather than spelling. Hebrew writes what
it hears and leaves short vowels out, while a Latin brand keeps its origin's spelling, so
גרנייה/GARNIER (silent French r) and פאיו/PAYOT (silent t) share no spelling at all. The matcher
admits a pairing only when every consonant pairs with an equal or kindred one and, for short
names, no vowel contradicts either spelling. Measured over the suites, the 191 true
single-word pairs clear their thresholds by at least 0.024. The closest of 112 invented names
and negative controls stays 0.048 below its threshold.

Per-case status and calibration notes are in [docs/manual-tests/](docs/manual-tests/).

To only typecheck:

```powershell
npm run build
```

## Remaining production risks

The local Hebrew transliteration layer is lightweight and its thresholds have not been calibrated on a production-sized, human-reviewed dataset. Hebrew spelling ambiguity, product-line containment, and short names still send many names to `REVIEW`.

Four behaviours are worth knowing when reading results:

- **A name that matches only part of a brand is a new name.** A proposed name that adds words to a
  catalogued brand is allowed in either script — NIVEA MEN against NIVEA, קלין לוג'יק against קלין,
  טיימו ביוטי against TYMO — since the catalogue already lists extensions such as POLO RED and
  אדידס קוסמטיקה as brands of their own. So is a same-length name where one word differs entirely
  (קליר דיאה against קליר דיי). Such candidates still appear in the terminal output, after the
  whole-name matches. A shorter proposed name (L'Oreal against L'OREAL PARIS) still reviews, as does
  a name split differently but the same by sound (דאון טאון against DOWNTOWN).
- **A typo must be typeable.** A one-letter substitution counts as a typo only when the two keys
  are neighbours on the keyboard (Hebrew SI 1452 or QWERTY) or the letters spell one sound (ט/ת,
  כ/ק, c/k). סטפיל is not a typo of סטייל: פ and י are far apart. Added or dropped letters are not
  judged by the keyboard, since Hebrew writes and drops vowel letters freely (טריקוסי / טריקסי).
- **A weak cross-script guess does not hold a name back.** A candidate in the other script reviews
  only when the match is exact, shares a consonant skeleton of five or more letters, is confirmed by
  pronunciation, or scores at the 0.68 review threshold. HQ (הקס at 0.60) and Yeti (סיטי at 0.61)
  are therefore allowed.
- **Same-script lookalikes stay in review.** `Velmora` reaches Selmor at the review threshold, two
  edits apart. A cross-script spelling resemblance counts only when pronunciation or the consonants
  confirm it: סטפיל reads "stpl", one letter from STP, but its L has nothing to pair with.
- **The older spelling comparison has known false positives.** It compares romanizations by edit
  distance, so זילורה (an invented name) reaches SILVER at 0.69 by reading ו as "ve", although the
  phonetic matcher rejects that pairing.
