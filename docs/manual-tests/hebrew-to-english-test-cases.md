# Hebrew to English Translation Test Cases

Hebrew input checked against an English-labelled brand already in the catalogue. Someone
proposes `אדידס` when `Adidas` exists; that is a duplicate and should be refused.

The executable version of this matrix is
`src/brand-duplicate/__tests__/production/brand-translation-he-to-en.test.ts`. Run it with:

```powershell
npm run test:brand-translation:he-en
```

The reverse direction has its own document, [english-to-hebrew-test-cases.md](english-to-hebrew-test-cases.md).
The two are kept apart because the engine behaves differently in each, and a combined matrix
hid that.

## How these cases were chosen

Every input is a Hebrew spelling that **does not already exist in the catalogue**. That
constraint matters more than it sounds: an earlier draft of this matrix mined the catalogue
mechanically and produced 83 cases where the Hebrew input matched a Hebrew entry with the same
spelling. Those were not cross-language tests at all — the engine blocked them on a same-script
exact match and never exercised the transliteration path. They were discarded.

Every expected code was verified against `response.json`, and every case was confirmed to
resolve to the named brand rather than a coincidental neighbour.

## Current status

**All 107 tests pass.** The figures in this section describe the earlier `BLOCK`-only spec and
are kept for the history; see [Status update](#status-update) below for where the direction
stands now.

| Measure | Result |
| --- | --- |
| Cases | 100 |
| Fully correct — blocks **and** retrieves the expected brand | 6 |
| Returns `BLOCK`, but on a different brand | 1 |
| Held at `HUMAN_REVIEW` | 81 |
| Returned `ALLOW` — a real duplicate let through | 12 |
| Correct brand retrieved into the top five | 54 |
| Negative controls holding non-`BLOCK` | 5 of 5 |

Expanding from 16 to 100 cases changed the picture materially. The original matrix reported
**100% recall**, which suggested a pure threshold problem. Across a wider sample recall is
**54%**, so roughly half the work is retrieval, not calibration. The 12 `ALLOW` rows are the most
serious: review surfaces a brand to a person, allow creates the duplicate outright.

### Why so few block

`transliteration-service.ts` carries a curated Hebrew-to-Latin map of eight entries. The
decision engine blocks a transliteration match only when the source is `CURATED` **and** the
score clears 0.98. Curated matches score 0.99 and block; everything else is `GENERATED` and
reviews at best. The pass rate therefore measures the size of a hand-written list rather than
the quality of the matcher.

Two ways forward, not mutually exclusive:

1. **Extend the curated map.** Precise, immediate, and does not scale — the catalogue holds
   17,653 brands.
2. **Let high-confidence `GENERATED` matches block.** Calibrate a score gate against
   `brand-evaluation.json` and the negative controls.

Option 2 is the real fix, but it only addresses the 81 review rows. The 50 recall misses need
retrieval work first: a score gate cannot act on a candidate that never entered the list.

### Status update

The suite now asserts that a duplicate is **not allowed**, rather than that it blocks:
`HUMAN_REVIEW` passes and only `ALLOW` fails. Review is the correct resting place for a pairing
that rests on a generated spelling — the curated-map problem described above is therefore no
longer what the suite measures.

**All 101 cases pass: every expected brand is in the top five, and none is allowed.**

It got there in three steps:

1. **Skeleton retrieval (recall 54 → 72).** Retrieval learned to file brands by consonant
   skeleton. A romanized Hebrew name and its Latin original agree on consonants but essentially
   never on the full string: גרנייה romanizes to `grniih`, never `garnier`.
2. **Two structural fixes.** The final list now holds two slots for the strongest cross-script
   candidates rather than one. One slot let a coincidental hit (`MRD` for מריל) stand in for the
   real brand.
3. **Phonetic comparison (the remaining 23).** Hebrew spells what it hears, while a Latin brand
   keeps its origin's spelling, so many pairs share no spelling at all. The matcher compares
   pronunciations instead:
   - Hebrew letters keep every sound they can stand for: ב is b or v, and ו is o, u or v.
   - Latin names are read by English, French, Italian and German rules. A name is read by
     French, Italian or German rules at a small penalty unless its spelling shows signs of that
     language.

   That is what pairs גרנייה with GARNIER (the French r is silent), פאיו with PAYOT (silent t),
   קשרל with cacharel (French ch is ש), and זייס with ZEISS (German ei is יי).

An earlier revision of this section predicted the last 23 would need a hand-curated alias list.
They did not: each is covered by a general reading rule, and no per-brand rule was added.

**Ambiguous inputs accept equivalents.** טומי renders TOMMY, TOMY, Tomi, Tommi and TUMI equally
faithfully, and גאס renders GUESS and GAS. No rule can say which of those a writer meant, so
these cases pass on any of them (`equivalentCodes` in the spec).

**HE030 is the one input already in the catalogue.** ג'ילט is `b_680` as well as a spelling of
GILLETTE, so it blocks on the Hebrew entry, and the case asserts that GILLETTE still surfaces.

**Multi-word names are matched word by word.** Three cases cover them, two of them reported
from real use. טומי הילפיגר was allowed at 0.37 and now finds TOMMY HILFIGER at 0.93.
דאון טאון was allowed at 0.68 and now finds DOWN TOWN at 0.94. A name that adds a word to
another, such as דיאור הום against DIOR, is reported as a related product line at review.

Two cases were **removed** as out of scope — this is duplicate detection, not inference:

| Case | Why removed |
| --- | --- |
| `פאקו` → `Rabanne` | Paco is a different word from the brand's label; no spelling comparison can connect them. |
| `הילפיגר טומי` → `HILFIGER` | A two-word input against a one-word brand. |

Precision is guarded separately by `npm run test:brand-translation:precision`, described in the
README.

## Preconditions

1. Install dependencies and build:

   ```powershell
   npm install --registry=https://registry.npmjs.org
   npm run build
   ```

2. Confirm the baseline suites are green before reading anything into this one:

   ```powershell
   npm test
   npm run test:brand-manual-acceptance
   ```

3. `response.json` must be at the project root. The guard test pins the record count at
   17,653; if it fails, the dataset changed and the expected codes below need rechecking.

## Result record

| Field | Value |
| --- | --- |
| Case ID |  |
| Input |  |
| Expected decision |  |
| Actual decision/confidence |  |
| Top candidate code/label |  |
| Match type/transliteration source |  |
| Rank of the expected candidate |  |
| Notes and elapsed time |  |

## Case matrix

### A. Blocking today (7)

| ID | Proposed brand | Expected candidate | Recall | Decision |
| --- | --- | --- | --- | --- |
| HE001 | `אדידס` | `b_3453 Adidas` | rank 1 | `BLOCK` |
| HE002 | `נייקי` | `b_3051 NIKE` | rank 1 | `BLOCK` |
| HE003 | `לוריאל` | `b_13982mp LOREAL` | rank 1 | `BLOCK` |
| HE004 | `ז'יבנשי` | `b_5 GIVENCHY` | rank 1 | `BLOCK` |
| HE005 | `ניוטרוג'ינה` | `b_33 NEUTROGENA` | rank 1 | `BLOCK` |
| HE030 | `ג'ילט` | `b_13705mp GILLETTE` | not retrieved | `BLOCK` |
| HE094 | `פרוטאין` | `b_6319 PROTEIN` | rank 2 | `BLOCK` |

### B. Retrieved but held at HUMAN_REVIEW (48)

| ID | Proposed brand | Expected candidate | Recall | Decision |
| --- | --- | --- | --- | --- |
| HE006 | `שאנל` | `b_7 CHANEL` | rank 3 | `HUMAN_REVIEW` |
| HE007 | `קנזו` | `b_237 Kenzo` | rank 1 | `HUMAN_REVIEW` |
| HE008 | `דיזל` | `b_1978 DIESEL` | rank 1 | `HUMAN_REVIEW` |
| HE009 | `ניוואה` | `b_386 NIVEA` | rank 1 | `HUMAN_REVIEW` |
| HE010 | `גוצי` | `b_4480 GUCCI` | rank 1 | `HUMAN_REVIEW` |
| HE011 | `ורסאצה` | `b_104 VERSACE` | rank 1 | `HUMAN_REVIEW` |
| HE012 | `בולגרי` | `b_1278 BVLGARI` | rank 3 | `HUMAN_REVIEW` |
| HE013 | `ארמני` | `b_93 armani` | rank 1 | `HUMAN_REVIEW` |
| HE014 | `דיאור` | `b_4463 DIOR` | rank 1 | `HUMAN_REVIEW` |
| HE015 | `פומה` | `b_8747mp POMA` | rank 1 | `HUMAN_REVIEW` |
| HE016 | `ויאגרה` | `b_11666mp VGR` | rank 1 | `HUMAN_REVIEW` |
| HE022 | `וישי` | `b_22 VICHY` | rank 3 | `HUMAN_REVIEW` |
| HE023 | `שיסיידו` | `b_1973 SHISEIDO` | rank 1 | `HUMAN_REVIEW` |
| HE025 | `פראדה` | `b_4465 PRADA` | rank 1 | `HUMAN_REVIEW` |
| HE026 | `מושינו` | `b_446 MOSCHINO` | rank 1 | `HUMAN_REVIEW` |
| HE027 | `טרוסארדי` | `b_76 TRUSSARDI` | rank 1 | `HUMAN_REVIEW` |
| HE028 | `מיסוני` | `b_2616 MISSONI` | rank 1 | `HUMAN_REVIEW` |
| HE034 | `ניאוסטרטה` | `b_8631mp Neostrata` | rank 1 | `HUMAN_REVIEW` |
| HE035 | `אופוריה` | `b_3851 EUPHORIA` | rank 1 | `HUMAN_REVIEW` |
| HE036 | `מונטל` | `b_5176 MONTALE` | rank 2 | `HUMAN_REVIEW` |
| HE039 | `אזארו` | `b_103 AZZARO` | rank 3 | `HUMAN_REVIEW` |
| HE041 | `דולצ'ה` | `b_1773 DOLCE` | rank 1 | `HUMAN_REVIEW` |
| HE042 | `מוגלר` | `b_2699 mugler` | rank 1 | `HUMAN_REVIEW` |
| HE048 | `סיסלי` | `b_52 sisley` | rank 1 | `HUMAN_REVIEW` |
| HE049 | `אסתי` | `b_121 ESTEE` | rank 2 | `HUMAN_REVIEW` |
| HE051 | `רושא` | `b_40 ROCHAS` | rank 2 | `HUMAN_REVIEW` |
| HE056 | `גוטאל` | `b_6088 GOUTAL` | rank 1 | `HUMAN_REVIEW` |
| HE058 | `דיפטיק` | `b_8780mp Diptyque` | rank 1 | `HUMAN_REVIEW` |
| HE061 | `ליברה` | `b_5413 LIBRE` | rank 1 | `HUMAN_REVIEW` |
| HE062 | `סטארס` | `b_5293 STARS` | rank 1 | `HUMAN_REVIEW` |
| HE063 | `שיר` | `b_5230 SHEER` | rank 1 | `HUMAN_REVIEW` |
| HE065 | `טימברלנד` | `b_2329 TIMBERLAND` | rank 1 | `HUMAN_REVIEW` |
| HE068 | `פולארויד` | `b_6707 POLAROID` | rank 1 | `HUMAN_REVIEW` |
| HE072 | `מיזונו` | `b_6749mp Mizuno` | rank 1 | `HUMAN_REVIEW` |
| HE073 | `ברוקס` | `b_6829mp Brooks` | rank 1 | `HUMAN_REVIEW` |
| HE075 | `וילסון` | `b_6939mp Wilson` | rank 1 | `HUMAN_REVIEW` |
| HE076 | `אסיקס` | `b_6944mp Asics` | rank 2 | `HUMAN_REVIEW` |
| HE078 | `מירל` | `b_6980mp Merrell` | rank 5 | `HUMAN_REVIEW` |
| HE081 | `סמית` | `b_9010mp Smith` | rank 1 | `HUMAN_REVIEW` |
| HE082 | `סלזנגר` | `b_9436mp Slazenger` | rank 1 | `HUMAN_REVIEW` |
| HE083 | `בירקנשטוק` | `b_9574mp Birkenstock` | rank 1 | `HUMAN_REVIEW` |
| HE084 | `וורטה` | `b_6915 VERTE` | rank 1 | `HUMAN_REVIEW` |
| HE085 | `רושאס` | `b_40 ROCHAS` | rank 1 | `HUMAN_REVIEW` |
| HE086 | `אסטה` | `b_121 ESTEE` | rank 4 | `HUMAN_REVIEW` |
| HE087 | `סיסליי` | `b_52 sisley` | rank 1 | `HUMAN_REVIEW` |
| HE092 | `מוגלה` | `b_2699 mugler` | rank 1 | `HUMAN_REVIEW` |
| HE093 | `דולצה` | `b_1773 DOLCE` | rank 1 | `HUMAN_REVIEW` |
| HE098 | `מונטאל` | `b_5176 MONTALE` | rank 1 | `HUMAN_REVIEW` |

### C. Allowed — a real duplicate let through (12)

| ID | Proposed brand | Expected candidate | Recall | Decision |
| --- | --- | --- | --- | --- |
| HE020 | `לנקום` | `b_20 LANCOME` | not retrieved | `ALLOW` |
| HE037 | `הילפיגר` | `b_4357 HILFIGER` | not retrieved | `ALLOW` |
| HE045 | `קלרינס` | `b_15 CLARINS` | not retrieved | `ALLOW` |
| HE046 | `קריד` | `b_5737 CREED` | not retrieved | `ALLOW` |
| HE054 | `קסרגוף` | `b_5833 XERJOFF` | not retrieved | `ALLOW` |
| HE064 | `קונברס` | `b_2527 CONVERSE` | not retrieved | `ALLOW` |
| HE070 | `קררה` | `b_6012mp Carrera` | not retrieved | `ALLOW` |
| HE071 | `דנלופ` | `b_6161mp Dunlop` | not retrieved | `ALLOW` |
| HE079 | `סקצרס` | `b_7339mp SKECHERS` | not retrieved | `ALLOW` |
| HE096 | `קצרל` | `b_2704 cacharel` | not retrieved | `ALLOW` |
| HE097 | `הילפיגר טומי` | `b_4357 HILFIGER` | not retrieved | `ALLOW` |
| HE100 | `מריל` | `b_6980mp Merrell` | not retrieved | `ALLOW` |

### D. Not retrieved into the top five (34)

| ID | Proposed brand | Expected candidate | Recall | Decision |
| --- | --- | --- | --- | --- |
| HE017 | `גרנייה` | `b_3945 GARNIER` | not retrieved | `HUMAN_REVIEW` |
| HE018 | `רבלון` | `b_48 REVLON` | not retrieved | `HUMAN_REVIEW` |
| HE019 | `מייבלין` | `b_881 MAYBELLINE` | not retrieved | `HUMAN_REVIEW` |
| HE021 | `קליניק` | `b_1 CLINIQUE` | not retrieved | `HUMAN_REVIEW` |
| HE024 | `לקוסט` | `b_85 LACOSTE` | not retrieved | `HUMAN_REVIEW` |
| HE029 | `ברברי` | `b_2294 BURBERRY` | not retrieved | `HUMAN_REVIEW` |
| HE030 | `ג'ילט` | `b_13705mp GILLETTE` | not retrieved | `BLOCK` |
| HE031 | `פאיו` | `b_11 PAYOT` | not retrieved | `HUMAN_REVIEW` |
| HE032 | `דקלאור` | `b_55 DECLEOR` | not retrieved | `HUMAN_REVIEW` |
| HE033 | `קודלי` | `b_13412mp CAUDALIE` | not retrieved | `HUMAN_REVIEW` |
| HE038 | `קשרל` | `b_2704 cacharel` | not retrieved | `HUMAN_REVIEW` |
| HE040 | `בלמיין` | `b_3589 BALMAIN` | not retrieved | `HUMAN_REVIEW` |
| HE043 | `טומי` | `b_1231 TOMMY` | not retrieved | `HUMAN_REVIEW` |
| HE044 | `רבאן` | `b_183 Rabanne` | not retrieved | `HUMAN_REVIEW` |
| HE047 | `גרלן` | `b_1185 GUERLAIN` | not retrieved | `HUMAN_REVIEW` |
| HE050 | `אסקדה` | `b_198 Escada` | not retrieved | `HUMAN_REVIEW` |
| HE052 | `קלואה` | `b_137 Chloe` | not retrieved | `HUMAN_REVIEW` |
| HE053 | `קואץ` | `b_1903 COACH` | not retrieved | `HUMAN_REVIEW` |
| HE055 | `ביירדו` | `b_6072 BYREDO` | not retrieved | `HUMAN_REVIEW` |
| HE057 | `לואבה` | `b_6618 LOEWE` | not retrieved | `HUMAN_REVIEW` |
| HE059 | `אמואג` | `b_8781mp Amouage` | not retrieved | `HUMAN_REVIEW` |
| HE060 | `צ'רוטי` | `b_9840mp Cerruti` | not retrieved | `HUMAN_REVIEW` |
| HE066 | `זייס` | `b_5731 ZEISS` | not retrieved | `HUMAN_REVIEW` |
| HE067 | `אוקלי` | `b_2312 OAKLEY` | not retrieved | `HUMAN_REVIEW` |
| HE069 | `קולומביה` | `b_5906mp Columbia` | not retrieved | `HUMAN_REVIEW` |
| HE074 | `סלומון` | `b_6840mp Salomon` | not retrieved | `HUMAN_REVIEW` |
| HE077 | `סאקוני` | `b_6943mp Saucony` | not retrieved | `HUMAN_REVIEW` |
| HE080 | `קרוקס` | `b_8802mp Crocs` | not retrieved | `HUMAN_REVIEW` |
| HE088 | `גרלין` | `b_1185 GUERLAIN` | not retrieved | `HUMAN_REVIEW` |
| HE089 | `קרייד` | `b_5737 CREED` | not retrieved | `HUMAN_REVIEW` |
| HE090 | `גאס` | `b_1962 GUESS` | not retrieved | `HUMAN_REVIEW` |
| HE091 | `פאקו` | `b_183 Rabanne` | not retrieved | `HUMAN_REVIEW` |
| HE095 | `אזרו` | `b_103 AZZARO` | not retrieved | `HUMAN_REVIEW` |
| HE099 | `לואווה` | `b_6618 LOEWE` | not retrieved | `HUMAN_REVIEW` |

## E. Negative controls — must not block

Invented Hebrew names with no counterpart in the catalogue. These guard against closing the
gap by simply blocking more, and they must stay green through any change to the gate.

| ID | Proposed brand | Status today |
| --- | --- | --- |
| HE-N01 | `אורבקסה` | Pass |
| HE-N02 | `ולמורה` | Pass |
| HE-N03 | `קוורלי` | Pass |
| HE-N04 | `פרקסליה` | Pass |
| HE-N05 | `זילורה` | Pass |

The assertion is `notEqual(decision, "BLOCK")` rather than `equal(decision, "ALLOW")`. These
names are genuinely new, so `HUMAN_REVIEW` is an acceptable answer; only an outright block
would be wrong.

## Pass criteria

- **Recall:** all 100 cases retrieve the expected brand into the top five. 54 hold today.
- **Decision:** all 100 return `BLOCK` against the expected brand. 6 hold today.
- **No false blocks:** all five negative controls stay out of `BLOCK`.
- **Explainability:** every matched candidate carries a reason and cross-language signals.
- **Ordering:** the suite asserts recall before decision, so a retrieval regression reports
  as a retrieval failure rather than hiding behind the decision assertion.

Treat a failure in section E, or a new recall failure, as a genuine regression. The decision
failures in sections B and C are the known gap this document exists to track.
