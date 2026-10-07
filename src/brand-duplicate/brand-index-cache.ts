import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { getAsset, isSea } from "node:sea";
import { INDEX_VARIANT_BUDGET, INDEX_VARIANT_MAX_COST, TransliterationService } from "./transliteration-service.js";
import type { TransliterationVariant } from "./types.js";

interface CacheFile {
  version: 1;
  fingerprint: string;
  entries: [string, TransliterationVariant[]][];
  checksum: string;
}

function checksum(entries: CacheFile["entries"]): string {
  return createHash("sha256").update(JSON.stringify(entries)).digest("hex");
}

function validVariants(value: unknown): value is TransliterationVariant[] {
  return Array.isArray(value) && value.length <= INDEX_VARIANT_BUDGET && value.every(
    (variant: unknown) => typeof variant === "object" && variant !== null &&
      "value" in variant && typeof variant.value === "string" &&
      "source" in variant && ["CURATED", "GENERATED", "ORIGINAL"].includes(String(variant.source)) &&
      "confidence" in variant && typeof variant.confidence === "number" &&
      Number.isFinite(variant.confidence) && variant.confidence >= 0 && variant.confidence <= 1,
  );
}

function parseCache(contents: string, fingerprint: string): Map<string, TransliterationVariant[]> {
  const parsed: unknown = JSON.parse(contents);
  if (typeof parsed !== "object" || parsed === null ||
    !("version" in parsed) || parsed.version !== 1 ||
    !("fingerprint" in parsed) || parsed.fingerprint !== fingerprint ||
    !("entries" in parsed) || !Array.isArray(parsed.entries) ||
    !("checksum" in parsed) || parsed.checksum !== checksum(parsed.entries)) {
    throw new Error("incompatible cache header");
  }
  const entries = new Map<string, TransliterationVariant[]>();
  for (const item of parsed.entries) {
    if (!Array.isArray(item) || item.length !== 2 || typeof item[0] !== "string" ||
      !/[\u0590-\u05FF]/u.test(item[0]) || !validVariants(item[1]) || entries.has(item[0])) {
      throw new Error("invalid cache entry");
    }
    entries.set(item[0], item[1]);
  }
  return entries;
}

async function fingerprint(root: string, mode: "cli" | "review"): Promise<string> {
  if (isSea()) {
    return Buffer.from(getAsset("brand-index-fingerprint.txt")).toString("utf8");
  }
  const hash = createHash("sha256");
  const files = mode === "review" && path.extname(process.argv[1] ?? "") === ".cjs"
    ? [path.resolve(process.argv[1]!)]
    : (await readdir(path.join(root, "dist", "brand-duplicate")))
      .filter((name) => name.endsWith(".js"))
      .sort()
      .map((name) => path.join(root, "dist", "brand-duplicate", name));
  files.push(path.join(root, "data", "phonetic-transliteration-rules.json"));
  for (const file of files) {
    hash.update(await readFile(file));
  }
  return hash.digest("hex");
}

class CachedIndexTransliteration extends TransliterationService {
  readonly used = new Map<string, TransliterationVariant[]>();
  hits = 0;

  constructor(private readonly previous: ReadonlyMap<string, TransliterationVariant[]>) {
    super();
  }

  override getLatinVariants(
    value: string | null | undefined,
    budget?: number,
    maxCost?: number,
  ): TransliterationVariant[] {
    if (typeof value !== "string" || !/[\u0590-\u05FF]/u.test(value) ||
      budget !== INDEX_VARIANT_BUDGET || maxCost !== INDEX_VARIANT_MAX_COST) {
      return super.getLatinVariants(value, budget, maxCost);
    }
    const cached = this.used.get(value) ?? this.previous.get(value);
    if (cached) {
      this.hits += 1;
      this.used.set(value, cached);
      return cached;
    }
    const variants = super.getLatinVariants(value, budget, maxCost);
    this.used.set(value, variants);
    return variants;
  }
}

export interface BrandIndexCache {
  service: TransliterationService;
  save(): Promise<void>;
  readonly hits: number;
}

export async function openBrandIndexCache(root: string, mode: "cli" | "review"): Promise<BrandIndexCache> {
  const cachePath = path.join(root, `.brand-index-cache-${mode}.json`);
  const currentFingerprint = await fingerprint(root, mode);
  let previous = new Map<string, TransliterationVariant[]>();
  try {
    previous = parseCache(await readFile(cachePath, "utf8"), currentFingerprint);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      process.stderr.write(`Ignoring brand index cache ${cachePath}: ${String(error)}\n`);
    }
  }
  const service = new CachedIndexTransliteration(previous);
  return {
    service,
    get hits() { return service.hits; },
    async save() {
      if (service.used.size === 0 || (
        previous.size === service.used.size && [...service.used].every(([key]) => previous.has(key))
      )) return;
      const data: CacheFile = {
        version: 1,
        fingerprint: currentFingerprint,
        entries: [...service.used],
        checksum: checksum([...service.used]),
      };
      const temporary = `${cachePath}.${process.pid}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, `${JSON.stringify(data)}\n`, "utf8");
        await rename(temporary, cachePath);
      } catch (error) {
        process.stderr.write(`Could not save brand index cache ${cachePath}: ${String(error)}\n`);
        await rm(temporary, { force: true }).catch((cleanupError: unknown) => {
          process.stderr.write(`Could not remove temporary cache ${temporary}: ${String(cleanupError)}\n`);
        });
      }
    },
  };
}
