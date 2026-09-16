export type DomainName = "ENTITY" | "NOSTRO" | "SSI" | "RMA";
export type IssueDisposition =
  "REPORT_ONLY" | "IGNORE_ON_LOAD" | "DRAFT_CAN_UPDATE" | "REVISION_REQUIRED";

export interface GovernedRecord {
  readonly id: string;
  readonly status: string;
  readonly version?: number;
  readonly updatedAt?: string;
  readonly validFrom?: string;
  readonly validTo?: string;
}

export interface EntityRecord extends GovernedRecord {
  readonly legalEntityCode: string;
  readonly branchCode: string;
  readonly countryCode: string;
}

export interface NostroRecord extends GovernedRecord {
  readonly ownLegalEntityId: string;
  readonly accountServicerBic: string;
  readonly currency: string;
  readonly purpose: string;
  readonly maskedAccountRef: string;
}

export interface SsiRoute {
  readonly counterpartyType?: string;
  readonly counterpartyBic?: string;
  readonly bookingEntity?: string;
  readonly currency?: string;
  readonly businessFunction?: string;
  readonly validFrom?: string;
  readonly validTo?: string;
}

export interface SsiRecord extends GovernedRecord {
  readonly ownershipType?: string;
  readonly ownerParty?: string;
  readonly publisherParty?: string;
  readonly counterpartyId: string;
  readonly scope: string;
  readonly route: SsiRoute;
  readonly applicability?: readonly {
    readonly status?: string;
    readonly validFrom?: string;
    readonly validTo?: string;
  }[];
}

export interface RmaRecord extends GovernedRecord {
  readonly ownBic: string;
  readonly counterpartyBic: string;
  readonly direction: string;
  readonly service: string;
  readonly messageTypes: readonly string[];
}

export interface GovernedReferenceSnapshot {
  readonly countries: readonly string[];
  readonly currencies: readonly string[];
  readonly bankBics: readonly string[];
  readonly supportedRmaMessageTypes: readonly string[];
  readonly legacyRmaMessageTypeConversions: readonly {
    readonly from: string;
    readonly to: string;
    readonly scope: string;
    readonly reason: string;
  }[];
  readonly parameterSnapshotId: string;
}

export interface GovernedDataSnapshot {
  readonly entities: readonly EntityRecord[];
  readonly nostros: readonly NostroRecord[];
  readonly ssis: readonly SsiRecord[];
  readonly rmas: readonly RmaRecord[];
  readonly reference: GovernedReferenceSnapshot;
}

export class RepairIssue {
  public readonly domain: DomainName;
  public readonly recordId: string;
  public readonly code: string;
  public readonly disposition: IssueDisposition;
  public readonly current?: unknown;
  public readonly proposed?: unknown;
  public readonly relatedRecordIds: readonly string[];

  constructor(input: {
    domain: DomainName;
    recordId: string;
    code: string;
    disposition: IssueDisposition;
    current?: unknown;
    proposed?: unknown;
    relatedRecordIds?: readonly string[];
  }) {
    this.domain = input.domain;
    this.recordId = input.recordId;
    this.code = input.code;
    this.disposition = input.disposition;
    this.current = input.current;
    this.proposed = input.proposed;
    this.relatedRecordIds = Object.freeze([...(input.relatedRecordIds ?? [])]);
    Object.freeze(this);
  }
}

export class MessageTypeConversion {
  public readonly from: string;
  public readonly to: string;
  public readonly occurrences: number;

  constructor(input: { from: string; to: string; occurrences: number }) {
    this.from = input.from;
    this.to = input.to;
    this.occurrences = input.occurrences;
    Object.freeze(this);
  }
}

export class RmaGroupRepairPlan {
  public readonly canonicalKey: string;
  public readonly segmentId: number;
  public readonly disposition: string;
  public readonly sourceRecordIds: readonly string[];
  public readonly retainedMessageTypes: readonly string[];
  public readonly removedMessageTypes: readonly string[];
  public readonly conversions: readonly MessageTypeConversion[];
  public readonly targetService?: string;

  constructor(input: {
    canonicalKey: string;
    segmentId: number;
    disposition: string;
    sourceRecordIds: readonly string[];
    retainedMessageTypes: readonly string[];
    removedMessageTypes: readonly string[];
    conversions?: readonly MessageTypeConversion[];
    targetService?: string;
  }) {
    this.canonicalKey = input.canonicalKey;
    this.segmentId = input.segmentId;
    this.disposition = input.disposition;
    this.sourceRecordIds = Object.freeze([...input.sourceRecordIds]);
    this.retainedMessageTypes = Object.freeze([...input.retainedMessageTypes]);
    this.removedMessageTypes = Object.freeze([...input.removedMessageTypes]);
    this.conversions = Object.freeze([...(input.conversions ?? [])]);
    this.targetService = input.targetService;
    Object.freeze(this);
  }
}

export class DomainRepairReport<TGroup = never> {
  public readonly domain: DomainName;
  public readonly recordCount: number;
  public readonly issues: readonly RepairIssue[];
  public readonly groups: readonly TGroup[];

  constructor(input: {
    domain: DomainName;
    recordCount: number;
    issues: readonly RepairIssue[];
    groups?: readonly TGroup[];
  }) {
    this.domain = input.domain;
    this.recordCount = input.recordCount;
    this.issues = Object.freeze([...input.issues]);
    this.groups = Object.freeze([...(input.groups ?? [])]);
    Object.freeze(this);
  }
}

export interface GovernedDomainReports {
  readonly ENTITY: DomainRepairReport;
  readonly NOSTRO: DomainRepairReport;
  readonly SSI: DomainRepairReport;
  readonly RMA: DomainRepairReport<RmaGroupRepairPlan>;
}

export class GovernedDataRepairReport {
  public readonly mode = "DRY_RUN_ZERO_WRITES" as const;
  public readonly generatedAt: string;
  public readonly parameterSnapshotId: string;
  public readonly domains: GovernedDomainReports;
  public readonly metrics = Object.freeze({ databaseWrites: 0 as const });

  constructor(input: {
    generatedAt: string;
    parameterSnapshotId: string;
    domains: GovernedDomainReports;
  }) {
    this.generatedAt = input.generatedAt;
    this.parameterSnapshotId = input.parameterSnapshotId;
    this.domains = Object.freeze(input.domains);
    Object.freeze(this);
  }
}

export interface GovernedDataRepository {
  loadSnapshot(): Promise<GovernedDataSnapshot>;
}

export interface RepairReportWriter {
  write(report: GovernedDataRepairReport): Promise<void>;
}
