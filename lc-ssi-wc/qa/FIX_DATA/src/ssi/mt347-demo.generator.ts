import {
  FrozenMt347DemoOracle,
  type Mt347BusinessStatus,
  type Mt347OracleGroup,
  type Mt347OracleVariant,
  type Mt347SideEffects,
} from "./oracle-contract.ts";

export class GeneratedMt347DemoContext {
  public readonly key: string;
  public readonly groupId: string;
  public readonly bindingId: string;
  public readonly templateId: string;
  public readonly businessStatus: Mt347BusinessStatus;
  public readonly currency: string;
  public readonly bookingEntity: string;
  public readonly counterpartyBic: string;
  public readonly direction: "OUTBOUND";
  public readonly validationOwner: string;
  public readonly reasonCode: string;
  public readonly resolverOutcome: string;
  public readonly demoHttpStatus: number | null;
  public readonly ssiLookup: string;
  public readonly routeCandidateExpected: boolean;
  public readonly ssiRouteCandidateKey: string | null;
  public readonly controlledStubIdentity: string;
  public readonly sourceType: string;
  public readonly sideEffects: Mt347SideEffects;

  constructor(group: Mt347OracleGroup, variant: Mt347OracleVariant) {
    this.key = variant.oracleContextKey;
    this.groupId = group.groupId;
    this.bindingId = group.bindingId;
    this.templateId = group.templateId;
    this.businessStatus = group.businessStatus;
    this.currency = variant.currency;
    this.bookingEntity = variant.bookingEntity;
    this.counterpartyBic = variant.counterpartyBic;
    this.direction = variant.direction;
    this.validationOwner = group.validationOwner;
    this.reasonCode = group.reasonCode;
    this.resolverOutcome = group.resolverOutcome;
    this.demoHttpStatus = group.expectedOutcome.demoHttpStatus;
    this.ssiLookup = group.ssiLookup;
    this.routeCandidateExpected = variant.routeCandidateExpected;
    this.ssiRouteCandidateKey = variant.ssiRouteCandidateKey;
    this.controlledStubIdentity = variant.controlledStubIdentity;
    this.sourceType = variant.sourceType;
    this.sideEffects = Object.freeze({ ...group.sideEffects });
    Object.freeze(this);
  }
}

export class GeneratedMt347DemoDataset {
  public readonly mode = "DRY_RUN_ZERO_WRITES" as const;
  public readonly databaseWrites = 0 as const;
  public readonly sourceDocumentId: string;
  public readonly groupCount: number;
  public readonly contexts: readonly GeneratedMt347DemoContext[];
  public readonly ssiOwnedContextCount: number;
  public readonly outOfScopeContextCount: number;

  constructor(
    sourceDocumentId: string,
    groupCount: number,
    contexts: readonly GeneratedMt347DemoContext[],
  ) {
    this.sourceDocumentId = sourceDocumentId;
    this.groupCount = groupCount;
    this.contexts = Object.freeze([...contexts]);
    this.ssiOwnedContextCount = contexts.filter(
      (row) => row.businessStatus === "BA_CONFIRMED",
    ).length;
    this.outOfScopeContextCount = contexts.filter(
      (row) => row.businessStatus === "OUT_OF_SCOPE_CLOSED",
    ).length;
    Object.freeze(this);
  }
}

export class Mt347DemoFixtureGenerator {
  generate(oracle: FrozenMt347DemoOracle): GeneratedMt347DemoDataset {
    const contexts: GeneratedMt347DemoContext[] = [];
    for (const group of oracle.groups) {
      this.assertGroup(group);
      for (const variant of group.variants) {
        contexts.push(new GeneratedMt347DemoContext(group, variant));
      }
    }
    this.assertUniqueKeys(contexts);
    return new GeneratedMt347DemoDataset(
      oracle.documentId,
      oracle.groups.length,
      contexts,
    );
  }

  private assertGroup(group: Mt347OracleGroup): void {
    if (
      group.variantCount !== group.variants.length ||
      group.oracleContextCount !== group.variants.length
    ) {
      throw new Error(`ORACLE_VARIANT_COUNT_MISMATCH:${group.groupId}`);
    }
    if (group.sideEffects.total !== 0) {
      throw new Error(`ORACLE_SIDE_EFFECTS_NOT_ZERO:${group.groupId}`);
    }
    if (
      group.businessStatus === "OUT_OF_SCOPE_CLOSED" &&
      (group.ssiLookup !== "NOT_PERFORMED" ||
        group.ssiRouteRowCount !== 0 ||
        group.ssiRouteCandidateCount !== 0)
    ) {
      throw new Error(`OOS_SSI_EXECUTION_NOT_ZERO:${group.groupId}`);
    }
  }

  private assertUniqueKeys(
    contexts: readonly GeneratedMt347DemoContext[],
  ): void {
    const keys = new Set(contexts.map((row) => row.key));
    if (keys.size !== contexts.length) {
      throw new Error("DUPLICATE_ORACLE_CONTEXT_KEY");
    }
  }
}
