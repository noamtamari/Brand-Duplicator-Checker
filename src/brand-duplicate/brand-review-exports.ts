import { mkdir, mkdtemp, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Brand } from "./types.js";

export interface BrandReviewSelection {
  brand: string;
}

export interface BrandReviewExportResult {
  brandsPath: string;
  relationsPath: string;
  codes: string[];
}

const BRAND_EXPORT_PATTERN = /^SP_brands_\d{12}\.csv$/u;
const RELATION_EXPORT_PATTERN = /^SP_brand_relations_\d{12}\.csv$/u;

export function findHighestBrandCodeNumber(brands: readonly Brand[]): bigint | undefined {
  let highest: bigint | undefined;

  for (const brand of brands) {
    const match = /^b_(\d+)mp$/u.exec(brand.code);
    if (!match) {
      continue;
    }

    const number = BigInt(match[1]);
    if (highest === undefined || number > highest) {
      highest = number;
    }
  }

  return highest;
}

export function formatBrandExportTimestamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function escapeDelimitedField(value: string): string {
  if (!/[;"\r\n]/u.test(value)) {
    return value;
  }
  return `"${value.replace(/"/gu, '""')}"`;
}

function formatCsv(header: string, rows: readonly string[][]): string {
  return `${header}\r\n${rows.map((row) => `;${row.map(escapeDelimitedField).join(";")}`).join("\r\n")}\r\n`;
}

function allocateCodes(brands: readonly Brand[], count: number): string[] {
  const highest = findHighestBrandCodeNumber(brands);
  if (highest === undefined) {
    throw new Error("The live catalogue has no brand code matching b_<number>mp; exports were not changed.");
  }

  const occupied = new Set(brands.map((brand) => brand.code));
  const allocated: string[] = [];
  let next = highest + 1n;

  while (allocated.length < count) {
    const code = `b_${next}mp`;
    next += 1n;
    if (occupied.has(code)) {
      continue;
    }
    occupied.add(code);
    allocated.push(code);
  }

  return allocated;
}

async function restoreBackups(backupDirectory: string, rootDirectory: string): Promise<void> {
  for (const fileName of await readdir(backupDirectory)) {
    await rename(path.join(backupDirectory, fileName), path.join(rootDirectory, fileName));
  }
}

export async function createBrandReviewExports(
  rootDirectory: string,
  catalogue: readonly Brand[],
  selection: readonly BrandReviewSelection[],
  generatedAt = new Date(),
): Promise<BrandReviewExportResult> {
  if (selection.length === 0) {
    throw new Error("Select at least one ALLOW or REVIEW brand before creating output.");
  }

  const codes = allocateCodes(catalogue, selection.length);
  const timestamp = formatBrandExportTimestamp(generatedAt);
  const brandsName = `SP_brands_${timestamp}.csv`;
  const relationsName = `SP_brand_relations_${timestamp}.csv`;
  const brandsPath = path.join(rootDirectory, brandsName);
  const relationsPath = path.join(rootDirectory, relationsName);
  const brandsCsv = formatCsv(
    "brand_number;brand_name ",
    selection.map((item, index) => [codes[index], item.brand]),
  );
  const relationsCsv = formatCsv(
    "brand_number;parent_number ",
    codes.map((code) => [code, "brand"]),
  );

  const stagingDirectory = await mkdtemp(path.join(rootDirectory, ".brand-review-export-"));
  const backupDirectory = path.join(stagingDirectory, "previous");

  try {
    await writeFile(path.join(stagingDirectory, brandsName), brandsCsv, "utf8");
    await writeFile(path.join(stagingDirectory, relationsName), relationsCsv, "utf8");
    await mkdir(backupDirectory);
    const existing = await readdir(rootDirectory);
    const priorExports = existing.filter(
      (name) => BRAND_EXPORT_PATTERN.test(name) || RELATION_EXPORT_PATTERN.test(name),
    );

    for (const name of priorExports) {
      await rename(path.join(rootDirectory, name), path.join(backupDirectory, name));
    }

    try {
      await rename(path.join(stagingDirectory, brandsName), brandsPath);
      await rename(path.join(stagingDirectory, relationsName), relationsPath);
    } catch (error) {
      await rm(brandsPath, { force: true });
      await rm(relationsPath, { force: true });
      await restoreBackups(backupDirectory, rootDirectory);
      throw error;
    }
  } catch (error) {
    await restoreBackups(backupDirectory, rootDirectory).catch(() => undefined);
    throw error;
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true });
  }

  return { brandsPath, relationsPath, codes };
}
