import { Inject, Injectable, Optional } from "@nestjs/common";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface PageParameterLookupDefaultPolicy {
  readonly policyId: string;
  readonly scope: "EXECUTABLE_SSI";
  readonly bookingEntity: string;
  readonly currencies: readonly string[];
  readonly defaultBankServiceId: string;
}

interface PageParameterLookupDefaultsFile {
  readonly schemaVersion: "1.0";
  readonly policies: readonly PageParameterLookupDefaultPolicy[];
}

export interface PageParameterLookupDefaultsSource {
  readonly path: string;
}

export const PAGE_PARAMETER_LOOKUP_DEFAULTS_SOURCE = Symbol(
  "PAGE_PARAMETER_LOOKUP_DEFAULTS_SOURCE",
);

const hasText = (value: unknown): value is string =>
  typeof value === "string" && Boolean(value.trim());

const DEFAULT_LOOKUP_SOURCE: PageParameterLookupDefaultsSource = Object.freeze({
  path: join(
    process.cwd(),
    "parameters",
    "page-parameter-lookup-defaults.sr2026.json",
  ),
});

@Injectable()
export class PageParameterLookupDefaultsService {
  private readonly policies: readonly PageParameterLookupDefaultPolicy[];

  constructor(
    @Optional()
    @Inject(PAGE_PARAMETER_LOOKUP_DEFAULTS_SOURCE)
    source: PageParameterLookupDefaultsSource = DEFAULT_LOOKUP_SOURCE,
  ) {
    this.policies = this.load(source.path);
  }

  find(input: {
    readonly scenarioId: string;
    readonly messageType: string;
    readonly sequence: string;
    readonly currency: string;
    readonly bookingEntity: string;
    readonly polarity: "POSITIVE" | "NEGATIVE" | "BOUNDARY";
    readonly expectedHttp: readonly number[];
  }): PageParameterLookupDefaultPolicy | undefined {
    if (input.polarity === "BOUNDARY") return undefined;
    const matches = this.policies.filter(
      (policy) =>
        policy.scope === "EXECUTABLE_SSI" &&
        policy.bookingEntity === input.bookingEntity &&
        policy.currencies.includes(input.currency),
    );
    if (matches.length > 1)
      throw new Error("PAGE_PARAMETER_LOOKUP_DEFAULT_NOT_UNIQUE");
    return matches[0];
  }

  private load(path: string): readonly PageParameterLookupDefaultPolicy[] {
    const parsed = JSON.parse(
      readFileSync(path, "utf8"),
    ) as PageParameterLookupDefaultsFile;
    if (parsed.schemaVersion !== "1.0" || !Array.isArray(parsed.policies))
      throw new Error("PAGE_PARAMETER_LOOKUP_DEFAULTS_INVALID");
    const keys = new Set<string>();
    for (const policy of parsed.policies) {
      if (
        !hasText(policy.policyId) ||
        policy.scope !== "EXECUTABLE_SSI" ||
        !hasText(policy.bookingEntity) ||
        !Array.isArray(policy.currencies) ||
        !policy.currencies.length ||
        !policy.currencies.every((currency: string) =>
          /^[A-Z]{3}$/.test(currency),
        ) ||
        new Set(policy.currencies).size !== policy.currencies.length ||
        !hasText(policy.defaultBankServiceId)
      )
        throw new Error("PAGE_PARAMETER_LOOKUP_DEFAULT_INVALID");
      for (const currency of policy.currencies) {
        const key = [policy.scope, policy.bookingEntity, currency].join("|");
        if (keys.has(key))
          throw new Error("PAGE_PARAMETER_LOOKUP_DEFAULT_NOT_UNIQUE");
        keys.add(key);
      }
    }
    return parsed.policies;
  }
}
