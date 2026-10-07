import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(projectRoot, "dist", "brand-review-tests");
const testDirectory = path.join(projectRoot, "src", "brand-duplicate", "__tests__", "development");
const testNames = [
  "brand-review-service.test",
  "brand-review-exports.test",
  "brand-review-server.test",
  "brand-overrides.test",
];

await build({
  entryPoints: testNames.map((name) => path.join(testDirectory, `${name}.ts`)),
  outdir: outputDirectory,
  entryNames: "[name]",
  outExtension: { ".js": ".cjs" },
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  packages: "bundle",
  define: {
    "import.meta.url": JSON.stringify(pathToFileURL(path.join(projectRoot, "src", "brand-duplicate", "brand-overrides.ts")).href),
  },
});

const result = spawnSync(
  process.execPath,
  ["--test", ...testNames.map((name) => path.join(outputDirectory, `${name}.cjs`))],
  { cwd: projectRoot, stdio: "inherit" },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;