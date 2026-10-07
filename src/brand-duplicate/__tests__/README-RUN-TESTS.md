# Running the tests

The tests are split into two folders. Every `npm run` command below builds first, so it works
straight after `npm install`.

| Folder | What it holds | Run it when |
| --- | --- | --- |
| [`production/`](production/) | Acceptance suites run against the full catalogue in `response.json`. They define the decisions the checker must give real users. | Before handing over a build, and after any change to matching, scoring or decision rules. |
| [`development/`](development/) | Unit tests for individual components, plus the precision suite used while tuning the cross-language rules. | While working on the code. |

## Run a whole group

| What | Command | Takes about |
| --- | --- | --- |
| Everything | `npm test` | 50 s |
| Production suites | `npm run test:production` | 35 s |
| Development suites | `npm run test:development` | 15 s |

## Production suites

| Suite | Checks | Command |
| --- | --- | --- |
| `brand-manual-acceptance.test.ts` | The manual acceptance matrix: exact and separator variants block, typos and transliterations are never allowed, ambiguous names go to review, and invented names and brand extensions are allowed. The matrix is written out in [production/README-MANUAL-TESTS.md](production/README-MANUAL-TESTS.md). | `npm run test:brand-manual-acceptance` |
| `brand-expected-allow.test.ts` | New names are allowed rather than held for review: invented names, a brand with words added, and a brand with one word swapped. | `npm run test:brand-allow` |
| `brand-expected-review.test.ts` | Near-duplicates are held for review, neither blocked nor allowed: typos too weak to block, a shorter form of a multi-word brand, and spellings of a brand in the other script that rest on a generated spelling. | `npm run test:brand-review` |
| `brand-translation-en-to-he.test.ts` | An English spelling of a Hebrew-only brand puts that brand in the top five and is not allowed. | `npm run test:brand-translation:en-he` |
| `brand-translation-he-to-en.test.ts` | A Hebrew spelling of an English brand puts that brand in the top five and is not allowed. | `npm run test:brand-translation:he-en` |

## Development suites

The precision suite has its own command. To run any other one, build and point `node --test` at
its compiled file:

```powershell
npm run build
node --test dist/brand-duplicate/__tests__/development/brand-cli.test.js
```

| Suite | Checks |
| --- | --- |
| `brand-translation-precision.test.ts` | Invented names stay allowed in both scripts, and hand-labelled same-brand pairs from `brand-evaluation.json` outrank different brands. Run with `npm run test:brand-translation:precision`. |
| `brand-duplicate.test.ts` | Normalization, exact matches, translations, null input, the response adapter, and the full dataset. |
| `brand-duplicate-phase2.test.ts` | Fuzzy matching, short names, related-name safety, candidate bounds, indexing and performance. |
| `brand-duplicate-phase3.test.ts` | Scripts, transliteration, aliases and cross-language safeguards. |
| `brand-partial-and-keyboard.test.ts` | Keyboard-plausible typos, and names that match a brand only in part. |
| `brand-overrides.test.ts` | Curated pairs from the data file and their exclusions, grapheme rules and acronyms. |
| `phonetic-matcher.test.ts` | Hebrew and Latin phonetic readings and the cross-script matcher's evidence rules. |
| `brand-cli.test.ts` | Human-readable formatting of a check result. |
| `brand-cli-args.test.ts` | Command-line argument parsing. |
| `brand-report.test.ts` | Report output: decision mapping, candidate trimming and escaping. |

## Adding or moving a test

Put a new `*.test.ts` file in the folder it belongs to; the group commands pick up every test file
in their folder, so `package.json` needs no change. Tests import source modules with
`../../<module>.js` and read `response.json` with `../../../../response.json`.

`tsc` does not delete compiled files whose source was moved or removed. After moving or deleting a
test file, delete `dist/brand-duplicate/__tests__/`, or the old compiled copy keeps running.
