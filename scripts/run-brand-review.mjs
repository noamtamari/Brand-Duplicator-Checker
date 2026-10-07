import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundlePath = path.join(projectRoot, "dist", "brand-review-dev.cjs");

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

const result = spawnSync(process.execPath, [bundlePath], { cwd: projectRoot, stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;