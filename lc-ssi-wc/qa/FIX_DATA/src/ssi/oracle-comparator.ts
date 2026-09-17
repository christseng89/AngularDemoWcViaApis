import type {
  Mt347BusinessStatus,
  Mt347SideEffects,
} from "./oracle-contract.ts";
import type { FrozenMt347DemoOracle } from "./oracle-contract.ts";

export interface Mt347GeneratedContextView {
  readonly key: string;
  readonly groupId: string;
  readonly bindingId: string;
  readonly templateId: string;
  readonly businessStatus: Mt347BusinessStatus;
  readonly currency: string;
  readonly bookingEntity: string;
  readonly counterpartyBic: string;
  readonly direction: "OUTBOUND";
  readonly validationOwner: string;
  readonly reasonCode: string;
  readonly resolverOutcome: string;
  readonly demoHttpStatus: number | null;
  readonly ssiLookup: string;
  readonly routeCandidateExpected: boolean;
  readonly ssiRouteCandidateKey: string | null;
  readonly controlledStubIdentity: string;
  readonly sourceType: string;
  readonly sideEffects: Mt347SideEffects;
}

export interface Mt347GeneratedDatasetView {
  readonly groupCount: number;
  readonly contexts: readonly Mt347GeneratedContextView[];
  readonly databaseWrites: number;
}

export class OracleMismatch {
  public readonly contextKey: string;
  public readonly field: string;
  public readonly expected: unknown;
  public readonly actual: unknown;

  constructor(input: {
    contextKey: string;
    field: string;
    expected: unknown;
    actual: unknown;
  }) {
    this.contextKey = input.contextKey;
    this.field = input.field;
    this.expected = input.expected;
    this.actual = input.actual;
    Object.freeze(this);
  }
}

export class Mt347OracleComparisonResult {
  public readonly passed: boolean;
  public readonly mismatchCount: number;
  public readonly mismatches: readonly OracleMismatch[];
  public readonly actual: Readonly<{
    totalGroups: number;
    totalOracleContexts: number;
    ssiOwnedOracleContexts: number;
    outOfScopeOracleContexts: number;
    databaseWrites: number;
  }>;

  constructor(
    mismatches: readonly OracleMismatch[],
    dataset: Mt347GeneratedDatasetView,
  ) {
    this.mismatches = Object.freeze([...mismatches]);
    this.mismatchCount = mismatches.length;
    this.passed = mismatches.length === 0;
    this.actual = Object.freeze({
      totalGroups: dataset.groupCount,
      totalOracleContexts: dataset.contexts.length,
      ssiOwnedOracleContexts: dataset.contexts.filter(
        (row) => row.businessStatus === "BA_CONFIRMED",
      ).length,
      outOfScopeOracleContexts: dataset.contexts.filter(
        (row) => row.businessStatus === "OUT_OF_SCOPE_CLOSED",
      ).length,
      databaseWrites: dataset.databaseWrites,
    });
    Object.freeze(this);
  }
}

export class Mt347OracleComparator {
  compare(
    oracle: FrozenMt347DemoOracle,
    dataset: Mt347GeneratedDatasetView,
  ): Mt347OracleComparisonResult {
    const mismatches: OracleMismatch[] = [];
    const actualByKey = new Map(
      dataset.contexts.map((context) => [context.key, context] as const),
    );
    const expectedKeys = new Set<string>();

    for (const group of oracle.groups) {
      for (const variant of group.variants) {
        const key = variant.oracleContextKey;
        expectedKeys.add(key);
        const actual = actualByKey.get(key);
        if (!actual) {
          mismatches.push(
            new OracleMismatch({
              contextKey: key,
              field: "$context",
              expected: "PRESENT",
              actual: "MISSING",
            }),
          );
          continue;
        }

        const expected = {
          groupId: group.groupId,
          bindingId: group.bindingId,
          templateId: group.templateId,
          businessStatus: group.businessStatus,
          currency: variant.currency,
          bookingEntity: variant.bookingEntity,
          counterpartyBic: variant.counterpartyBic,
          direction: variant.direction,
          validationOwner: group.validationOwner,
          reasonCode: group.reasonCode,
          resolverOutcome: group.resolverOutcome,
          demoHttpStatus: group.expectedOutcome.demoHttpStatus,
          ssiLookup: group.ssiLookup,
          routeCandidateExpected: variant.routeCandidateExpected,
          ssiRouteCandidateKey: variant.ssiRouteCandidateKey,
          controlledStubIdentity: variant.controlledStubIdentity,
          sourceType: variant.sourceType,
          sideEffects: group.sideEffects,
        } as const;
        this.compareFields(key, expected, actual, mismatches);
      }
    }

    for (const key of actualByKey.keys()) {
      if (!expectedKeys.has(key)) {
        mismatches.push(
          new OracleMismatch({
            contextKey: key,
            field: "$context",
            expected: "ABSENT",
            actual: "UNEXPECTED",
          }),
        );
      }
    }

    if (dataset.groupCount !== oracle.groups.length) {
      mismatches.push(
        new OracleMismatch({
          contextKey: "$dataset",
          field: "groupCount",
          expected: oracle.groups.length,
          actual: dataset.groupCount,
        }),
      );
    }
    if (dataset.databaseWrites !== 0) {
      mismatches.push(
        new OracleMismatch({
          contextKey: "$dataset",
          field: "databaseWrites",
          expected: 0,
          actual: dataset.databaseWrites,
        }),
      );
    }

    return new Mt347OracleComparisonResult(mismatches, dataset);
  }

  private compareFields(
    contextKey: string,
    expected: Readonly<Record<string, unknown>>,
    actual: Mt347GeneratedContextView,
    mismatches: OracleMismatch[],
  ): void {
    const actualRecord = actual as unknown as Readonly<Record<string, unknown>>;
    for (const [field, expectedValue] of Object.entries(expected)) {
      const actualValue = actualRecord[field];
      if (JSON.stringify(actualValue) !== JSON.stringify(expectedValue)) {
        mismatches.push(
          new OracleMismatch({
            contextKey,
            field,
            expected: expectedValue,
            actual: actualValue,
          }),
        );
      }
    }
  }
}
