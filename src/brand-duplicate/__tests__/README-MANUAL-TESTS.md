# Manual Acceptance Test Suite

## How to execute

The executable version of this matrix is `brand-manual-acceptance.test.ts`.
Run it with:

```powershell
npm run test:brand-manual-acceptance
```

Typo and transliteration cases accept either `BLOCK` or the rollout-safe
`REVIEW`, but never `ALLOW`. The command is intentionally separate from the
core suite because this matrix is also used to expose candidate-recall and
calibration gaps.

For each row, submit the proposed brand exactly as written and verify:

1. the returned decision equals the expected result;
2. the expected candidate is present;
3. for `REVIEW`, the expected candidate is in the top five;
4. for `BLOCK`, the UI prevents creation;
5. for `ALLOW`, the UI permits creation;
6. the result includes a reason and preserves the original candidate code.

The cases below are derived from the supplied 17,653-record brand list.
Synthetic names are used only for negative controls.

## A. Deterministic normalization — expected `BLOCK`

| ID | Proposed brand | Expected candidate(s) | Coverage |
| --- | --- | --- | --- |
| B001 | `Versace` | `b_104 VERSACE`; `b_4680 Versace` | Case and existing duplicate codes |
| B002 | `VERSACE` | Same candidates as B001 | Exact label |
| B003 | `dunhill` | `b_2315 DUNHILL`; `b_1457 dunhill` | Case |
| B004 | `Dior` | `b_4463 DIOR`; `b_38 Dior` | Case and duplicate codes |
| B005 | `BVLGARI` | `b_1278 BVLGARI`; `b_1960 Bvlgari` | Case |
| B006 | `Roborock` | `b_6133mp Roborock`; `b_7391 ROBOROCK` | Existing duplicate codes |
| B007 | `TP-LINK` | `b_4744 TP LINK`; `b_9485mp Tp-link` | Hyphen and space |
| B008 | `TP LINK` | Same candidates as B007 | Separator normalization |
| B009 | `Theraband` | `b_5665mp Thera-Band`; `b_11113mp Theraband` | Hyphen |
| B010 | `Dream Baby` | `b_6109mp Dreambaby`; `b_10990mp Dream Baby` | Space |
| B011 | `CrankBrothers` | `b_12555mp Crank Brothers`; `b_12556mp CrankBrothers` | Space |
| B012 | `BabyBasic` | `b_12912mp babybasic`; `b_15029mp BABY BASIC` | Space and case |
| B013 | `LEVI'S` | `b_6308mp LEVIS`; `b_6625 LEVI'S` | Apostrophe |
| B014 | `HotWheels` | `b_8554mp Hot Wheels`; `b_7160 Hotwheels` | Space |
| B015 | `BODYGLIDE` | `b_11197mp Body Glide`; `b_12545mp BODYGLIDE` | Compound word |
| B016 | `My Office` | `b_10594mp MY OFFICE`; `b_7485 My-Office` | Case and hyphen |
| B017 | `STORZ & BICKEL` | `b_6111 STORZ&BICKEL`; `b_6243 STORZ & BICKEL` | Ampersand spacing |
| B018 | `Neutrogena` | `b_33 NEUTROGENA` | Trailing non-breaking space in source |
| B019 | `L'HOMME` | `b_5138 LHOMME`; `b_3956 l'homme`; `b_3903 L'HOMME` | Apostrophe and duplicate codes |
| B020 | `Polo` | `b_2051 POLO`; `b_89 POLO` | Exact duplicate codes |
| B021 | `Gucci` | `b_4480 GUCCI`; `b_72 GUCCI` | Exact duplicate codes |
| B022 | `Armani` | Existing `armani` records | Case and duplicate codes |
| B023 | `Emporio Armani` | Existing `EMPORIO ARMANI` and `Emporio Armani` records | Case and duplicate codes |
| B024 | `MIU MIU` | Existing `MIU MIU` / `miu miu` records | Case |
| B025 | `TEFAL` | Existing `Tefal` / `TEFAL` records | Case |

## B. Obvious spelling errors — expected `BLOCK`

These expectations assume the typo policy has been calibrated and approved for
automatic blocking. Before that approval, accept `REVIEW` as the temporary safe
result, but never `ALLOW`.

| ID | Proposed brand | Expected candidate | Coverage |
| --- | --- | --- | --- |
| B026 | `Addidas` | `b_3453 Adidas` | Extra character |
| B027 | `Adiddas` | `b_3453 Adidas` | Insertion/transposition |
| B028 | `Adidaas` | `b_3453 Adidas` | Repeated vowel |
| B029 | `Versacce` | `VERSACE` | Extra character |
| B030 | `Versac` | `VERSACE` | Missing character |
| B031 | `Dunhil` | `DUNHILL` | Missing character |
| B032 | `Givency` | `b_5 GIVENCHY` | Missing character |
| B033 | `Givenchyh` | `b_5 GIVENCHY` | Extra character |
| B034 | `Neutrogenna` | `b_33 NEUTROGENA` | Repeated character |
| B035 | `Niveaa` | `b_386 NIVEA` | Extra character |
| B036 | `Guci` | `GUCCI` | Missing character |
| B037 | `Diesl` | `b_1978 DIESEL` | Missing vowel |
| B038 | `Roborok` | `Roborock` | Missing character |
| B039 | `Therabandd` | `Theraband` / `Thera-Band` | Extra character |
| B040 | `L OREAL PARIS` | `b_1442 L'OREAL PARIS` | Apostrophe replaced by space |
| B041 | `LOREAL PARIS` | `b_1442 L'OREAL PARIS` | Apostrophe omitted |

## C. Hebrew/English transliteration — expected `BLOCK`

As with typo cases, use `REVIEW` during the initial uncalibrated rollout, but
never `ALLOW` when the expected candidate is found confidently.

| ID | Proposed brand | Expected candidate |
| --- | --- | --- |
| B042 | `אדידס` | `b_3453 Adidas` |
| B043 | `אדידאס` | `b_3453 Adidas` |
| B044 | `נייקי` | `b_3051 NIKE` |
| B045 | `שאנל` | `b_7 CHANEL` |
| B046 | `קנזו` | `b_237 Kenzo` |
| B047 | `דיזל` | `b_1978 DIESEL` |
| B048 | `בולגרי` | `b_1278 BVLGARI`; `b_1960 Bvlgari` |
| B049 | `גוצ'י` | `b_4480 GUCCI`; `b_72 GUCCI` |
| B050 | `גוצי` | Existing `GUCCI` records |
| B051 | `ורסאצ'ה` | Existing `VERSACE` records |
| B052 | `ורסאצה` | Existing `VERSACE` records |
| B053 | `ז'יבנשי` | `b_5 GIVENCHY` |
| B054 | `ארמני` | Existing `armani` records |
| B055 | `ניוואה` | `b_386 NIVEA` |
| B056 | `ניוטרוג'ינה` | `b_33 NEUTROGENA` |

## D. Ambiguous or related values — expected `REVIEW`

| ID | Proposed brand | Expected top-five candidate(s) | Why review is required |
| --- | --- | --- | --- |
| R001 | `L'Oreal` | `L'OREAL PARIS`; `L'OREAL MEN EXPERT`; `L'OREAL PROFESSIONNEL` | Parent/variant ambiguity |
| R002 | `DIOR HOMME INTENSE` | `DIOR HOMME`; `DIOR` | Product line versus brand |
| R003 | `KENZO HOMME` | `KENZO HOMME NIGHT`; `KENZO HOMME SPORT`; `Kenzo` | Several related variants |
| R004 | `ARMANI CODE INTENSE` | `ARMANI CODE`; `ARMANI CODE COLONIA`; `ARMANI CODE PROFUMO`; `ARMANI CODE LE PARFUM` | Several related variants |
| R005 | `GUCCI FLORA` | `GUCCI`; `GUCCI BLOOM`; `GUCCI BAMBO` | Parent/variant ambiguity |
| R006 | `POLO GREEN` | `POLO`; `POLO BLACK`; `POLO RED`; `POLO BLUE` | Color variant ambiguity |
| R007 | `VERSACE EROS` | `VERSACE`; `EROS`; `EROS FLAME`; `EROS ENERGY` | Brand and line both exist |
| R008 | `DIESEL ONLY THE BRAVE` | `DIESEL`; `ONLY THE BRAVE`; related variants | Brand and line both exist |
| R009 | `GIVENCHY GENTLEMAN` | `GIVENCHY`; `GENTLEMAN RESERVE PRIVE`; `GENTLEMAN SOCIETY` | Parent/variant ambiguity |
| R010 | `CHANEL COCO` | `CHANEL`; `COCO`; `COCO MADEMOISELLE`; `COCO NOIR` | Parent/variant ambiguity |
| R011 | `ADIDAS ORIGINALS` | `b_3453 Adidas` | Possible sub-brand |
| R012 | `NIKE SPORT` | `b_3051 NIKE` | Generic suffix |
| R013 | `NIVEA MEN` | `b_386 NIVEA` | Sub-brand or range |
| R014 | `PRADA MILANO` | `PRADA`; `PRADA SPORT` | Related label |
| R015 | `TOMMY HILFIGER KIDS` | `TOMMY HILFIGER`; `TOMMY` | Segment suffix |
| R016 | `CALVIN KLEIN JEANS` | `Calvin Klein`; secondarily `JEANS` | Sub-brand ambiguity |
| R017 | `FLOWER BY KENZO RED` | `FLOWER BY KENZO`; `FLOWER BY KENZO LE ROUGE` | Close variant |
| R018 | `BOSS BLACK` | `BOSS`; `HUGO BOSS`; `BOSS ORANGE` | Brand-family ambiguity |
| R019 | `AR` | `b_5411 A & R` | Short-name punctuation risk |
| R020 | `SKK` | `b_4733 SK` | Short-name edit-distance risk |

## E. Hard negatives — expected `ALLOW`

| ID | Proposed brand | Coverage |
| --- | --- | --- |
| A001 | `Orvexa` | New synthetic brand |
| A002 | `Quorali` | New synthetic brand |
| A003 | `Praxelia` | New synthetic brand |
| A004 | `Velnaro` | New synthetic brand |
| A005 | `Ombriva` | New synthetic brand |
| A006 | `Tervano` | New synthetic brand |
| A007 | `Zenvora` | Do not over-weight `ZEN` |
| A008 | `Velmora` | Weak phonetic resemblance only |
| A009 | `Lumetra` | Do not over-weight short substrings |
| A010 | `Praxelia Labs` | Unknown multi-word name |
| A011 | `Quorali Care` | Unknown plus generic suffix |
| A012 | `Orvexa Beauty` | Unknown plus generic suffix |
| A013 | `HQ` | Must not be confused with `HP` |
| A014 | `VersaFit` | Hard negative near `VERSACE` |
| A015 | `Zylora Labs` | New synthetic brand |
| A016 | `Novaquill` | New synthetic brand |

## F. Additional separator and Unicode cases — expected `BLOCK`

| ID | Proposed brand | Expected candidate |
| --- | --- | --- |
| B057 | `I HEALTH` | `iHealth` / `I-HEALTH` |
| B058 | `BOX SHOP` | `BoxShop` / `Box-Shop` |
| B059 | `QPLAY` | `Q Play` / `Qplay` |
| B060 | `KIT CAT` | `KitCat` / `KIT CAT` |
| B061 | `PET STAGES` | `Petstages` / `Pet Stages` |
| B062 | `AUDIO LINE` | `Audio Line` / `Audio-line` |
| B063 | `PROTECH` | `PRO TECH` / `PROTECH` |
| B064 | `TURTLE BEACH` | `TurtleBeach` / `Turtle Beach` |
| B065 | `MUC-OFF` | `Muc Off` / `Muc-Off` |
| B066 | `BUZZRACK` | `BUZZ RACK` / `buzzrack` |
| B067 | `KIDS ART` | `KidsArt` / `Kids Art` |
| B068 | `VITAFIZZ` | `VITA FIZZ` / `VitaFizz` |
| B069 | `קיטקט` | `קיט-קט` / `קיטקט` |
| B070 | `בי לייף` | `בי-לייף` / `בי לייף` |
| B071 | `מדי ליפס` | `מדיליפס` / `מדי-ליפס` |
| B072 | `טופ ג'ל` | `טופג׳ל` / `טופ ג'ל` |

## Pass criteria

- **Deterministic precision:** 100% of section A and F cases return `BLOCK`.
- **Duplicate safety:** no typo or transliteration case returns `ALLOW`.
- **Candidate recall:** the expected candidate appears in the top five for at
  least 95% of non-deterministic duplicate and review cases before pilot use.
- **False-block gate:** 0 of 16 hard negatives returns `BLOCK`.
- **Explainability:** every result has at least one stable reason code.
- **Degraded mode:** when the model is unavailable, uncertain cases return
  `REVIEW` and deterministic cases continue to work.

Record actual decision, returned candidates, top candidate, latency, reviewer
decision, and notes for every run. This table should later become an automated
acceptance fixture rather than remaining manual-only.

