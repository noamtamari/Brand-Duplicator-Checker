export interface BrandCliArgs {
  /** Brand names given as positional arguments. */
  brands: string[];
  /** A file holding one brand name per line. */
  inputPath?: string;
  /** Output path without an extension; the report is written as <outBase>.txt and <outBase>.csv. */
  outBase?: string;
  help: boolean;
}

export const BRAND_CLI_USAGE = [
  "Check proposed brand names against the existing catalogue.",
  "",
  "Usage:",
  '  .\\check-brand.ps1 "Brand name" ["Another brand" ...]',
  '  .\\check-brand.ps1 --input "brand list.txt"',
  "  npm run brand:check          (type one name per line, then Ctrl+Z, Enter)",
  "",
  "Options:",
  "  -i, --input <file>  read one brand name per line from <file>",
  "  -o, --out <path>    write reports to <path>.txt, <path>.csv and <path>.timing.json",
  "  -h, --help          show this message",
  "",
  "Each name is reported as ALLOW, or as REVIEW with the existing brands to compare against.",
  "",
  "Pass brand names through check-brand.ps1 rather than 'npm run brand:check -- ...'. On Windows",
  "npm rebuilds the command line through cmd.exe, which mangles quoted names and drops --out.",
].join("\n");

function requireValue(flag: string, value: string | undefined): string {
  if (value === undefined) {
    throw new Error(`${flag} needs a value.`);
  }

  return value;
}

/** Strips a report extension so --out report.csv and --out report name the same pair of files. */
function toOutBase(value: string): string {
  return value.replace(/\.(txt|csv)$/i, "");
}

export function parseBrandCliArgs(argv: readonly string[]): BrandCliArgs {
  const args: BrandCliArgs = { brands: [], help: false };
  let onlyPositionals = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string;

    if (onlyPositionals) {
      args.brands.push(arg);
      continue;
    }

    switch (arg) {
      // Everything after "--" is a brand name, so a brand called "--input" stays checkable.
      case "--":
        onlyPositionals = true;
        break;
      case "-h":
      case "--help":
        args.help = true;
        break;
      case "-i":
      case "--input":
        index += 1;
        args.inputPath = requireValue(arg, argv[index]);
        break;
      case "-o":
      case "--out":
        index += 1;
        args.outBase = toOutBase(requireValue(arg, argv[index]));
        break;
      default:
        if (arg.startsWith("-") && arg.length > 1) {
          throw new Error(`Unknown option: ${arg}`);
        }

        args.brands.push(arg);
    }
  }

  return args;
}
