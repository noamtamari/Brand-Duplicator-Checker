import { normalizeBrandName } from "./brand-normalizer.js";
import type { BrandAliasMatch, BrandAliasResolver } from "./types.js";

export interface BrandAliasDefinition {
  code: string;
  label: string;
  aliases: readonly string[];
}

/** Stores only explicitly approved aliases; it does not infer or mutate relationships. */
export class InMemoryBrandAliasResolver implements BrandAliasResolver {
  private readonly aliases = new Map<string, BrandAliasMatch>();

  constructor(definitions: readonly BrandAliasDefinition[] = []) {
    for (const definition of definitions) {
      for (const alias of definition.aliases) {
        const normalizedAlias = normalizeBrandName(alias);
        if (normalizedAlias) {
          this.aliases.set(normalizedAlias, {
            code: definition.code,
            label: definition.label,
            alias,
          });
        }
      }
    }
  }

  find(name: string): BrandAliasMatch | undefined {
    return this.aliases.get(normalizeBrandName(name));
  }
}