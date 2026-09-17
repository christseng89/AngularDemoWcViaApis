import { readFileSync } from "node:fs";
import { join } from "node:path";

type GovernedStatus = "SSI_SUPPORTED" | "FIELD_PROFILE_PROVEN";

interface RmaScopeDocument {
  readonly schemaVersion: number;
  readonly standardsRelease: string;
  readonly baseProfiles: readonly {
    readonly messageType: string;
    readonly scopeStatus: GovernedStatus;
    readonly evidenceStatus: GovernedStatus;
  }[];
  readonly legacyConversions: readonly LegacyMessageTypeConversion[];
  readonly developmentReferenceGapSkips: readonly DevelopmentReferenceGapSkip[];
  readonly presentation: {
    readonly categories: readonly RmaMessageCategory[];
    readonly items: readonly RmaMessagePolicyItem[];
  };
}

export interface RmaMessageCategory {
  readonly categoryId: "SECURITY" | "TRADE_FINANCE" | "PAYMENT";
  readonly displayName: string;
  readonly displayOrder: number;
  readonly emptyStateText: string;
}

export interface RmaMessagePolicyItem {
  readonly messageType: string;
  readonly description: string;
  readonly categoryId: RmaMessageCategory["categoryId"];
  readonly directionApplicability: {
    readonly inbound: { readonly applicable: boolean };
    readonly outbound: { readonly applicable: boolean };
  };
}

interface PaymentMessageIndex {
  readonly items: readonly {
    readonly messageType?: string;
    readonly targetMessage?: string;
    readonly selectable?: boolean;
  }[];
}

interface SsiMappingManifest {
  readonly messageEvidence: readonly {
    readonly messageType: string;
    readonly status: string;
  }[];
}

interface ResolutionScenarioCatalogue {
  readonly scenarios: readonly {
    readonly messageType: string;
    readonly closureDisposition: string;
  }[];
}

interface SsiMappingCatalogue {
  readonly mappings: readonly {
    readonly messageType: string;
    readonly scopeStatus: string;
    readonly evidenceStatus: string;
  }[];
}

export interface LegacyMessageTypeConversion {
  readonly from: string;
  readonly to: string;
  readonly scope: string;
  readonly reason: string;
}

export interface DevelopmentReferenceGapSkip {
  readonly canonicalKey: string;
  readonly requiredSource: "SYNTHETIC_DEMO";
  readonly reason: string;
}

export class RmaMessageScopePolicy {
  public readonly supportedMessageTypes: readonly string[];
  public readonly categories: readonly RmaMessageCategory[];
  public readonly items: readonly RmaMessagePolicyItem[];
  public readonly legacyConversions: readonly LegacyMessageTypeConversion[];
  public readonly developmentReferenceGapSkips: readonly DevelopmentReferenceGapSkip[];

  constructor(input: {
    supportedMessageTypes: Iterable<string>;
    categories: readonly RmaMessageCategory[];
    items: readonly RmaMessagePolicyItem[];
    legacyConversions: readonly LegacyMessageTypeConversion[];
    developmentReferenceGapSkips: readonly DevelopmentReferenceGapSkip[];
  }) {
    this.supportedMessageTypes = Object.freeze(
      [...new Set(input.supportedMessageTypes)].sort(),
    );
    this.categories = Object.freeze(
      input.categories
        .map((category) => Object.freeze({ ...category }))
        .sort((left, right) => left.displayOrder - right.displayOrder),
    );
    this.items = Object.freeze(
      input.items
        .map((item) =>
          Object.freeze({
            ...item,
            directionApplicability: Object.freeze({
              inbound: Object.freeze({
                ...item.directionApplicability.inbound,
              }),
              outbound: Object.freeze({
                ...item.directionApplicability.outbound,
              }),
            }),
          }),
        )
        .sort((left, right) => left.messageType.localeCompare(right.messageType)),
    );
    this.legacyConversions = Object.freeze(
      input.legacyConversions.map((item) => Object.freeze({ ...item })),
    );
    this.developmentReferenceGapSkips = Object.freeze(
      input.developmentReferenceGapSkips.map((item) =>
        Object.freeze({ ...item }),
      ),
    );
    Object.freeze(this);
  }
}

/** Parameter-driven RMA scope shared by API, UI support endpoints and repair. */
export class RmaSupportedMessageTypeCatalogue {
  private readonly parametersDirectory: string;

  constructor(parametersDirectory: string) {
    this.parametersDirectory = parametersDirectory;
  }

  static fromWorkspace(
    workspace = process.cwd(),
  ): RmaSupportedMessageTypeCatalogue {
    return new RmaSupportedMessageTypeCatalogue(join(workspace, "parameters"));
  }

  loadPolicy(): RmaMessageScopePolicy {
    const scope = this.read<RmaScopeDocument>("rma-message-scope.sr2026.json");
    this.validateScope(scope);
    const supported = new Set(
      scope.baseProfiles
        .filter(
          (item) =>
            item.scopeStatus === "SSI_SUPPORTED" &&
            item.evidenceStatus === "FIELD_PROFILE_PROVEN",
        )
        .map((item) => item.messageType.trim())
        .filter(Boolean),
    );
    this.addPaymentMessages(supported);
    this.addGovernedFinMessages(supported);
    for (const conversion of scope.legacyConversions) {
      if (!supported.has(conversion.to) || supported.has(conversion.from)) {
        throw new Error(`INVALID_RMA_LEGACY_CONVERSION:${conversion.from}`);
      }
    }
    this.validatePresentation(scope, supported);
    return new RmaMessageScopePolicy({
      supportedMessageTypes: supported,
      categories: scope.presentation.categories,
      items: scope.presentation.items,
      legacyConversions: scope.legacyConversions,
      developmentReferenceGapSkips: scope.developmentReferenceGapSkips,
    });
  }

  load(): string[] {
    return [...this.loadPolicy().supportedMessageTypes];
  }

  private validateScope(scope: RmaScopeDocument): void {
    if (
      scope.schemaVersion !== 1 ||
      scope.standardsRelease !== "SR2026" ||
      !Array.isArray(scope.baseProfiles) ||
      !Array.isArray(scope.legacyConversions) ||
      !Array.isArray(scope.developmentReferenceGapSkips) ||
      !scope.presentation ||
      !Array.isArray(scope.presentation.categories) ||
      !Array.isArray(scope.presentation.items) ||
      !scope.developmentReferenceGapSkips.every(
        (item) =>
          /^([A-Z0-9]{11})\|([A-Z0-9]{11})\|(INBOUND|OUTBOUND)$/.test(
            item.canonicalKey,
          ) &&
          item.requiredSource === "SYNTHETIC_DEMO" &&
          item.reason.trim().length > 0,
      )
    ) {
      throw new Error("INVALID_RMA_MESSAGE_SCOPE_PARAMETER");
    }
  }

  private validatePresentation(
    scope: RmaScopeDocument,
    supported: ReadonlySet<string>,
  ): void {
    const categories = scope.presentation.categories;
    const items = scope.presentation.items;
    const categoryIds = categories.map(({ categoryId }) => categoryId);
    const expectedCategories = ["SECURITY", "TRADE_FINANCE", "PAYMENT"];
    const itemTypes = items.map(({ messageType }) => messageType.trim());
    if (
      categoryIds.join("|") !== expectedCategories.join("|") ||
      new Set(categoryIds).size !== categoryIds.length ||
      new Set(itemTypes).size !== itemTypes.length ||
      itemTypes.length !== supported.size ||
      itemTypes.some((messageType) => !supported.has(messageType)) ||
      [...supported].some((messageType) => !itemTypes.includes(messageType)) ||
      items.some(
        (item) =>
          !categoryIds.includes(item.categoryId) ||
          !item.description.trim() ||
          typeof item.directionApplicability?.inbound?.applicable !==
            "boolean" ||
          typeof item.directionApplicability?.outbound?.applicable !==
            "boolean",
      )
    ) {
      throw new Error("INVALID_RMA_MESSAGE_PRESENTATION_PARAMETER");
    }
  }

  private addPaymentMessages(supported: Set<string>): void {
    const index = this.read<PaymentMessageIndex>("payment-message-index.json");
    for (const item of index.items) {
      if (!item.selectable) continue;
      for (const value of [item.messageType, item.targetMessage]) {
        const messageType = value?.trim() ?? "";
        if (
          /^MT2\d{2}(?:COV)?$/.test(messageType) ||
          /^pacs\.009\./.test(messageType)
        ) {
          supported.add(messageType);
        }
      }
    }
  }

  private addGovernedFinMessages(supported: Set<string>): void {
    const manifest = this.read<SsiMappingManifest>(
      "ssi-mappings.sr2026.manifest.json",
    );
    const scenarios = this.read<ResolutionScenarioCatalogue>(
      "resolution-page-scenarios.sr2026.json",
    );
    const mappings = this.read<SsiMappingCatalogue>("ssi-mappings.sr2026.json");
    const scenariosInScope = new Set(
      scenarios.scenarios
        .filter((item) => item.closureDisposition === "IN_SCOPE_SSI_RESOLVER")
        .map((item) => item.messageType.trim().toUpperCase()),
    );
    const mappingsInScope = new Set(
      mappings.mappings
        .filter(
          (item) =>
            item.scopeStatus === "SSI_SUPPORTED" &&
            item.evidenceStatus === "FIELD_PROFILE_PROVEN",
        )
        .map((item) => item.messageType.trim().toUpperCase()),
    );
    for (const evidence of manifest.messageEvidence) {
      const messageType = evidence.messageType.trim().toUpperCase();
      if (
        /^MT[347]\d{2}(?:COV)?$/.test(messageType) &&
        evidence.status === "FIELD_PROFILE_PROVEN" &&
        scenariosInScope.has(messageType) &&
        mappingsInScope.has(messageType)
      ) {
        supported.add(messageType);
      }
    }
  }

  private read<T>(fileName: string): T {
    return JSON.parse(
      readFileSync(join(this.parametersDirectory, fileName), "utf8"),
    ) as T;
  }
}

export function loadRmaSupportedMessageTypes(
  workspace = process.cwd(),
): string[] {
  return RmaSupportedMessageTypeCatalogue.fromWorkspace(workspace).load();
}
