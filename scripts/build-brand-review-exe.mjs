import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { inject } from "postject";
import { createHash } from "node:crypto";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDirectory = path.join(projectRoot, "dist");
const bundlePath = path.join(distDirectory, "brand-review.cjs");
const configPath = path.join(distDirectory, "brand-review-sea-config.json");
const blobPath = path.join(distDirectory, "brand-review-sea.blob");
const executablePath = path.join(distDirectory, "BrandReview.exe");
const htmlPath = path.join(projectRoot, "assets", "brand-review.html");
const rulesPath = path.join(projectRoot, "data", "phonetic-transliteration-rules.json");
const fingerprintPath = path.join(distDirectory, "brand-index-fingerprint.txt");

if (process.platform !== "win32") {
  throw new Error("Build the standalone BrandReview.exe on Windows with Node.js 24 or newer.");
}
if (Number(process.versions.node.split(".")[0]) < 24) {
  throw new Error("Node.js 24 or newer is required to build the standalone executable.");
}

await mkdir(distDirectory, { recursive: true });
await build({
  entryPoints: [path.join(projectRoot, "src", "brand-duplicate", "brand-review-entry.ts")],
  outfile: bundlePath,
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  packages: "bundle",
  sourcemap: false,
  define: {
    "import.meta.url": JSON.stringify(pathToFileURL(path.join(projectRoot, "src", "brand-duplicate", "brand-overrides.ts")).href),
  },
});
const hash = createHash("sha256");
hash.update(await readFile(bundlePath));
hash.update(await readFile(rulesPath));
await writeFile(fingerprintPath, hash.digest("hex"), "utf8");

const seaConfig = {
  main: bundlePath,
  output: blobPath,
  disableExperimentalSEAWarning: true,
  useSnapshot: false,
  useCodeCache: false,
  assets: {
    "brand-review.html": htmlPath,
    "phonetic-transliteration-rules.json": rulesPath,
    "brand-index-fingerprint.txt": fingerprintPath,
  },
};
await writeFile(configPath, `${JSON.stringify(seaConfig, null, 2)}\n`, "utf8");

const seaBuild = spawnSync(process.execPath, ["--experimental-sea-config", configPath], {
  cwd: projectRoot,
  stdio: "inherit",
});
if (seaBuild.error) throw seaBuild.error;
if (seaBuild.status !== 0) throw new Error(`Node SEA generation failed (${seaBuild.status}).`);

await copyFile(process.execPath, executablePath);
await inject(executablePath, "NODE_SEA_BLOB", await readFile(blobPath), {
  sentinelFuse: "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
});
await rm(configPath, { force: true });
await rm(blobPath, { force: true });
process.stdout.write(`Created ${executablePath}\n`);