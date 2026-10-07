# Make each brand-check run fast

## Context

A single-brand run (e.g. `.\check-brand.ps1 "בל אן ריקול"`) takes about 6.5s:

| Part | Time | Cause |
|---|---|---|
| `tsc` in the wrapper | ~1.3s | recompiles on every run, even when nothing changed |
| Building `BrandIndex` | ~4.7s | see below |
| The check itself | ~0.36s | cost of this particular query (repeats on every call, so not warm-up) |

Measured inside the index build (17,653 brands → 17,659 unique entries):
- **~2.5–3s**: `addToEntryIndex` dedups by scanning the whole bucket with `.some()` on every insert. There are 1.6M inserts and 246M elements scanned; n-gram buckets hold up to ~1,900 entries.
- **~980ms**: `TransliterationService.getLatinVariants`, a beam search (`generateVariants`) per Hebrew name.
- **~260ms**: `toPhoneticName`. Caching it isn't worth it: 10 MB to load in 116ms against 231ms to recompute.
- **~1s**: normalizing, key derivation, map inserts and GC. This part stays.

`response.json` changes a little per fetch: a few brands added, removed or edited. So a cache keyed by name needs only a handful of names recomputed after each fetch.

Target agreed with the user: about 1.5s end to end, results identical to today, and no background process.

## Changes

### 1. Make bucket dedup constant-time ([brand-index.ts](src/brand-duplicate/brand-index.ts) `addToEntryIndex`)

Replace the `.some(...)` scan with a check of the bucket's last element only (`matches[matches.length - 1] !== entry`). This is exactly equivalent:
- `entryKeys` guarantees one entry object per (code, normalizedText).
- All of an entry's inserts happen within a single `add()` call, so a repeat can only be the last element.

Add a short comment saying this. Leave `addToIndex` alone, since its buckets are tiny.

I already checked this with an in-memory patch: the build drops from ~4.6s to ~2.0s, with identical `checkBrand` output on six probe names.

### 2. On-disk cache of index transliteration variants (new `src/brand-duplicate/brand-variant-cache.ts`)

`BrandIndex` already takes a `transliterationService` constructor parameter, so `BrandIndex` itself doesn't change.

- `class CachedTransliterationService extends TransliterationService` overrides `getLatinVariants(value, budget, maxCost)`:
  - Only Hebrew-containing strings are cached, since only they run the beam search; Latin names go straight to `super`.
  - The key is `${budget}\u0000${maxCost}\u0000${value}`.
  - A hit returns the stored array. Consumers only read it (`brand-candidate-scorer.ts:123`).
  - A miss calls `super`, stores the result, and marks the cache dirty.
  - Every key used is recorded so unused ones can be pruned.
- `loadVariantCache(filePath)`:
  - Reads `{ version, fingerprint, variants }`.
  - A missing file, corrupt JSON or a fingerprint mismatch means starting with an empty cache. It never throws.
- Fingerprint: sha256 over the rules JSON plus every non-test `.js` file in the module's own `dist/brand-duplicate/` directory (found via `import.meta.url`). This means:
  - Editing `data/phonetic-transliteration-rules.json` (the curated pairs) invalidates the cache.
  - Any code change invalidates it, so the next run takes ~2s and the ones after it are fast again.
  - Export `RULES_PATH` from [brand-overrides.ts](src/brand-duplicate/brand-overrides.ts#L10) and reuse it, rather than duplicating the path.
- `save()`:
  - Writes only when dirty or when keys were pruned (a brand was deleted or edited).
  - Writes only the keys used in this build: to `<file>.tmp`, then renames it over the file, so a Ctrl+C mid-write can't corrupt the cache.
- Cache file: `cache/brand-variants.json` (~7 MB, ~50ms to load). Add `cache/` to [.gitignore](.gitignore).

Library and test code that calls `new BrandIndex(brands)` keeps the uncached service, so tests are unaffected.

### 3. Use the cache in the CLI ([brand-cli.ts](src/brand-duplicate/brand-cli.ts))

Load the cache, build `new BrandIndex(brands, variantCache)`, then save the cache, all before `buildMs` is taken, so it counts as build time. A failed save prints a one-line warning to stderr and the run continues.

### 4. Skip the compile when `dist/` is current ([check-brand.ps1](check-brand.ps1), [check_brand.py](check_brand.py))

Unless `-SkipBuild` is given, compile only when `dist/brand-duplicate/brand-cli.js` is missing, or when any `src/**/*.ts`, `tsconfig.json` or `package.json` is newer than it. Plain `tsc` rewrites every output, so `brand-cli.js` works as the build stamp.

### 5. Docs

[README.md](README.md) "Checking brand names" section:
- The wrapper now compiles only when the source has changed.
- Explain the variant cache: where it lives, that it updates itself when brands change, that a rules or code change rebuilds it, and that deleting `cache/` is always safe.

## Tests

- In [brand-duplicate-phase2.test.ts](src/brand-duplicate/__tests__/development/brand-duplicate-phase2.test.ts), or a new index test: a name with repeated bigrams (e.g. "aaaa"), and a brand whose label and translation normalize the same, each produce a single posting.
- New `__tests__/development/brand-variant-cache.test.ts`, using a temp directory:
  - An index built with the cache, cold and then warm, gives the same `checkBrand` results as one built without it, on a small Hebrew/Latin brand list.
  - A warm load computes nothing: no dirty flag, file not rewritten.
  - Removing a brand prunes its key on save.
  - A fingerprint mismatch or a corrupt file is ignored.

## Verification

1. Baseline before any change: run the CLI on `brand list.txt`, `brand list hebrew.txt` and `brand to check.txt` with `--out` into the scratchpad, and keep the CSVs.
2. After the changes: run `npm test`. It must be fully green.
3. Delete `cache/`, re-run the three lists (cold cache), then run them again (warm cache). Both sets of CSVs must be byte-identical to the baseline.
4. Timing: run `.\check-brand.ps1 "בל אן ריקול"` twice.
   - The second run should skip `tsc`, and its report should show about `build ~1.0s, check ~0.4s`.
   - Back up `response.json`, add one fake Hebrew brand, and run: only that name should be recomputed, and the cache rewritten. Then restore the backup.
   - Touch the rules JSON: the next run should be cold (~2s build).
