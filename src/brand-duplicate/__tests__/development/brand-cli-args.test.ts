import assert from "node:assert/strict";
import test from "node:test";
import { parseBrandCliArgs } from "../../brand-cli-args.js";

test("reads brand names from positional arguments", () => {
  const args = parseBrandCliArgs(["Adidas", "Versace"]);

  assert.deepEqual(args.brands, ["Adidas", "Versace"]);
  assert.equal(args.inputPath, undefined);
  assert.equal(args.outBase, undefined);
  assert.equal(args.help, false);
});

test("returns empty defaults for no arguments", () => {
  assert.deepEqual(parseBrandCliArgs([]), { brands: [], help: false });
});

test("accepts long and short flag forms", () => {
  assert.equal(parseBrandCliArgs(["--input", "brands.txt"]).inputPath, "brands.txt");
  assert.equal(parseBrandCliArgs(["-i", "brands.txt"]).inputPath, "brands.txt");
  assert.equal(parseBrandCliArgs(["--out", "report"]).outBase, "report");
  assert.equal(parseBrandCliArgs(["-o", "report"]).outBase, "report");
  assert.equal(parseBrandCliArgs(["--help"]).help, true);
  assert.equal(parseBrandCliArgs(["-h"]).help, true);
});

test("normalises a report extension on --out to a shared base", () => {
  assert.equal(parseBrandCliArgs(["--out", "out/report.csv"]).outBase, "out/report");
  assert.equal(parseBrandCliArgs(["--out", "out/report.TXT"]).outBase, "out/report");
  assert.equal(parseBrandCliArgs(["--out", "out/report.2026"]).outBase, "out/report.2026");
});

test("mixes flags and brand names in any order", () => {
  const args = parseBrandCliArgs(["Adidas", "--out", "report", "Versace"]);

  assert.deepEqual(args.brands, ["Adidas", "Versace"]);
  assert.equal(args.outBase, "report");
});

test("treats everything after -- as a brand name", () => {
  const args = parseBrandCliArgs(["--", "--input", "-h"]);

  assert.deepEqual(args.brands, ["--input", "-h"]);
  assert.equal(args.inputPath, undefined);
  assert.equal(args.help, false);
});

test("rejects an unknown option", () => {
  assert.throws(() => parseBrandCliArgs(["--json"]), /Unknown option: --json/);
});

test("rejects a flag with no value", () => {
  assert.throws(() => parseBrandCliArgs(["--input"]), /--input needs a value\./);
  assert.throws(() => parseBrandCliArgs(["Adidas", "-o"]), /-o needs a value\./);
});
