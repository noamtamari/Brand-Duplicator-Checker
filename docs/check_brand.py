#!/usr/bin/env python3
"""Check proposed brand names against the existing catalogue.

Builds the project when sources have changed, then runs the brand checker.
Arguments go to node.exe as a list, never through cmd.exe, so quoted names such as
"Two Words" and flags such as --out arrive intact - the reason "npm run brand:check -- <args>"
cannot be used on Windows.

Examples:
    python check_brand.py "Adidas" "Versace"
    python check_brand.py --input "brand list.txt" --out results/october
    python check_brand.py -SkipBuild "Adidas"
"""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SKIP_BUILD_FLAGS = {"-SkipBuild", "-skipbuild", "--skip-build"}


def run(command: list[str]) -> int:
    process = subprocess.Popen(command, cwd=ROOT)
    while True:
        try:
            return process.wait()
        except KeyboardInterrupt:
            # Node received the same Ctrl+C and is writing its partial report; let it finish.
            continue


def main() -> int:
    args = sys.argv[1:]
    checker_args = [arg for arg in args if arg not in SKIP_BUILD_FLAGS]

    if len(checker_args) == len(args):
        probe = subprocess.run(
            ["node", str(ROOT / "scripts" / "needs-brand-build.mjs")],
            cwd=ROOT, capture_output=True, text=True,
        )
        if probe.returncode != 0:
            sys.stderr.write(probe.stderr)
            return probe.returncode
        if probe.stdout.strip() not in {"build", "skip"}:
            sys.stderr.write(f"Unexpected build check result: {probe.stdout!r}\n")
            return 1
        if probe.stdout.strip() == "build":
            tsc = ROOT / "node_modules" / "typescript" / "bin" / "tsc"
            status = run(["node", str(tsc), "-p", "tsconfig.json"])
            if status != 0:
                return status

    return run(["node", str(ROOT / "dist" / "brand-duplicate" / "brand-cli.js"), *checker_args])


if __name__ == "__main__":
    sys.exit(main())
