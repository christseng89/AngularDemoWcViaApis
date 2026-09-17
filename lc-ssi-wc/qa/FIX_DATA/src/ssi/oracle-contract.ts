export type Mt347BusinessStatus =
  | "BA_CONFIRMED"
  | "OUT_OF_SCOPE_CLOSED";

export interface Mt347SideEffects {
  readonly databaseWrites: number;
  readonly liveServiceCalls: number;
  readonly fixtureMutations: number;
  readonly payloadsGenerated: number;
  readonly confirmedResolutionsCreated: number;
  readonly repairQueueItemsCreated: number;
  readonly auditEventsCreated: number;
  readonly total: number;
}

export interface Mt347ExpectedOutcome {
  readonly disposition: string;
  readonly resolverExecution: string;
  readonly resolverOutcome: string;
  readonly finValidation: string;
  readonly demoHttpStatus: number | null;
  readonly expectedStatusOrError: string;
  readonly expectedOutput: string;
  readonly payloadGenerated: boolean;
}

export interface Mt347OracleVariant {
  readonly variantKey: string;
  readonly oracleContextKey: string;
  readonly fixtureGroupId: string;
  readonly currency: string;
  readonly bookingEntity: string;
  readonly counterpartyBic: string;
  readonly counterpartyBankServiceId: string;
  readonly direction: "OUTBOUND";
  readonly directionPolicy: "DEMO_POLICY_V1";
  readonly routeCandidateExpected: boolean;
  readonly ssiRouteCandidateKey: string | null;
  readonly controlledStubIdentity: string;
  readonly sourceType: string;
}

export interface Mt347OracleGroup {
  readonly groupId: string;
  readonly bindingId: string;
  readonly messageType: string;
  readonly templateId: string;
  readonly businessStatus: Mt347BusinessStatus;
  readonly direction: "OUTBOUND";
  readonly directionPolicy: "DEMO_POLICY_V1";
  readonly validationOwner: string;
  readonly lookupContract: Readonly<Record<string, unknown>>;
  readonly evidenceSource: Readonly<Record<string, unknown>>;
  readonly expectedOutcome: Mt347ExpectedOutcome;
  readonly reasonCode: string;
  readonly ssiLookup: string;
  readonly ssiRouteRowCount: number;
  readonly ssiRouteCandidateCount: number;
  readonly oracleContextCount: number;
  readonly variantCount: number;
  readonly variants: readonly Mt347OracleVariant[];
  readonly controlledStubIdentity: string;
  readonly sourceType: string;
  readonly sideEffects: Mt347SideEffects;
  readonly resolverOutcome: string;
}

export interface Mt347OracleReconciliation {
  readonly expected: Readonly<Record<string, number>>;
  readonly actual: Readonly<Record<string, number>>;
  readonly assertions: Readonly<Record<string, boolean>>;
  readonly allChecksPass: boolean;
}

export interface Mt347DemoOracleDocument {
  readonly schemaVersion: "1.1.0";
  readonly documentId: "MT347-DEMO-CLOSURE-V1.1";
  readonly groups: readonly Mt347OracleGroup[];
  readonly reconciliation: Mt347OracleReconciliation;
}

export class FrozenMt347DemoOracle {
  public readonly schemaVersion: "1.1.0";
  public readonly documentId: "MT347-DEMO-CLOSURE-V1.1";
  public readonly groups: readonly Mt347OracleGroup[];
  public readonly reconciliation: Mt347OracleReconciliation;

  constructor(document: Mt347DemoOracleDocument) {
    this.schemaVersion = document.schemaVersion;
    this.documentId = document.documentId;
    this.groups = Object.freeze([...document.groups]);
    this.reconciliation = Object.freeze(document.reconciliation);
    Object.freeze(this);
  }
}
