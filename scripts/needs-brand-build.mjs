import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sources = [];

async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await collect(fullPath);
    } else if (entry.name.endsWith(".ts")) {
      sources.push(fullPath);
    }
  }
}

async function newerThan(source, output) {
  try {
    return (await stat(source)).mtimeMs > (await stat(output)).mtimeMs;
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
  }
}

await collect(path.join(root, "src"));
let needsBuild = await newerThan(path.join(root, "tsconfig.json"), path.join(root, "dist", "brand-duplicate", "brand-cli.js")) ||
  await newerThan(path.join(root, "package-lock.json"), path.join(root, "dist", "brand-duplicate", "brand-cli.js"));
for (const source of sources) {
  if (needsBuild) break;
  const relative = path.relative(path.join(root, "src"), source).replace(/\.ts$/u, "");
  for (const extension of [".js", ".d.ts"]) {
    if (await newerThan(source, path.join(root, "dist", `${relative}${extension}`))) {
      needsBuild = true;
      break;
    }
  }
}
process.stdout.write(needsBuild ? "build\n" : "skip\n");
