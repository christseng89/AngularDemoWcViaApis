import {
  CanonicalBic,
  EntityCanonicalKey,
  NostroCanonicalKey,
  RmaCanonicalKey,
  SegmentationPolicy,
  SsiCanonicalKey,
  type CanonicalIdentity,
} from "./domain.ts";
import {
  DomainRepairReport,
  GovernedDataRepairReport,
  MessageTypeConversion,
  RepairIssue,
  RmaGroupRepairPlan,
  type DomainName,
  type EntityRecord,
  type GovernedDataRepository,
  type GovernedDataSnapshot,
  type GovernedRecord,
  type IssueDisposition,
  type NostroRecord,
  type RepairReportWriter,
  type RmaRecord,
  type SsiRecord,
} from "./repair-contracts.ts";

abstract class DomainRepairPolicy<
  TRecord extends GovernedRecord,
  TGroup = never,
> {
  public readonly domain: DomainName;

  protected constructor(domain: DomainName) {
    this.domain = domain;
  }

  abstract evaluate(
    records: readonly TRecord[],
    snapshot: GovernedDataSnapshot,
  ): DomainRepairReport<TGroup>;
}

class TextPolicy {
  upper(value: unknown): string {
    return String(value ?? "")
      .trim()
      .toUpperCase();
  }

  messageType(value: unknown): string {
    const normalized = String(value ?? "").trim();
    return /^MT/i.test(normalized)
      ? normalized.toUpperCase().replace(/\s+/g, "")
      : normalized.toLowerCase().replace(/\s+/g, "");
  }

  uniqueSorted(values: readonly string[]): string[] {
    return [...new Set(values.filter(Boolean))].sort();
  }
}

class DateRangePolicy {
  issues(domain: DomainName, record: GovernedRecord): RepairIssue[] {
    const validFrom = String(record.validFrom ?? "").trim();
    const validTo = String(record.validTo ?? "").trim();
    const format = /^\d{4}-\d{2}-\d{2}$/;

    if (!format.test(validFrom) || !format.test(validTo)) {
      return [
        new RepairIssue({
          domain,
          recordId: record.id,
          code: "INVALID_EFFECTIVE_DATE",
          disposition: "REPORT_ONLY",
          current: { validFrom, validTo },
        }),
      ];
    }

    if (validFrom > validTo) {
      return [
        new RepairIssue({
          domain,
          recordId: record.id,
          code: "INVALID_EFFECTIVE_PERIOD",
          disposition: "REPORT_ONLY",
          current: { validFrom, validTo },
        }),
      ];
    }

    return [];
  }
}

class LifecyclePolicy {
  private readonly operational = new Set([
    "ACTIVE",
    "APPROVED",
    "DRAFT",
    "WIP",
    "PENDING_APPROVAL",
  ]);

  private readonly openWorkflow = new Set(["DRAFT", "WIP", "PENDING_APPROVAL"]);

  private readonly textPolicy: TextPolicy;

  constructor(textPolicy: TextPolicy) {
    this.textPolicy = textPolicy;
  }

  isOperational(record: GovernedRecord): boolean {
    return this.operational.has(this.textPolicy.upper(record.status));
  }

  isActive(record: GovernedRecord): boolean {
    return this.textPolicy.upper(record.status) === "ACTIVE";
  }

  isOpenWorkflow(record: GovernedRecord): boolean {
    return this.openWorkflow.has(this.textPolicy.upper(record.status));
  }

  repairDisposition(record: GovernedRecord): IssueDisposition {
    return ["DRAFT", "WIP"].includes(this.textPolicy.upper(record.status))
      ? "DRAFT_CAN_UPDATE"
      : "REVISION_REQUIRED";
  }
}

class DuplicateOperationalPolicy<TRecord extends GovernedRecord> {
  private readonly domain: DomainName;
  private readonly lifecycle: LifecyclePolicy;

  constructor(domain: DomainName, lifecycle: LifecyclePolicy) {
    this.domain = domain;
    this.lifecycle = lifecycle;
  }

  issues(
    records: readonly TRecord[],
    identityOf: (record: TRecord) => CanonicalIdentity,
  ): RepairIssue[] {
    const groups = new Map<string, TRecord[]>();

    for (const record of records.filter((candidate) =>
      this.lifecycle.isOperational(candidate),
    )) {
      try {
        const key = identityOf(record).value;
        const members = groups.get(key) ?? [];
        members.push(record);
        groups.set(key, members);
      } catch {
        // Identity validation is reported by the owning domain policy.
      }
    }

    const issues: RepairIssue[] = [];
    for (const members of groups.values()) {
      if (members.length < 2) continue;
      const ids = members.map((record) => record.id);
      for (const record of members) {
        issues.push(
          new RepairIssue({
            domain: this.domain,
            recordId: record.id,
            code: "DUPLICATE_OPERATIONAL_INDEX",
            disposition: "REPORT_ONLY",
            relatedRecordIds: ids.filter((id) => id !== record.id),
          }),
        );
      }
    }
    return issues;
  }
}

class EntityRepairPolicy extends DomainRepairPolicy<EntityRecord> {
  private readonly text: TextPolicy;
  private readonly dates: DateRangePolicy;
  private readonly lifecycle: LifecyclePolicy;

  constructor(
    text: TextPolicy,
    dates: DateRangePolicy,
    lifecycle: LifecyclePolicy,
  ) {
    super("ENTITY");
    this.text = text;
    this.dates = dates;
    this.lifecycle = lifecycle;
  }

  evaluate(
    records: readonly EntityRecord[],
    snapshot: GovernedDataSnapshot,
  ): DomainRepairReport {
    const countries = new Set(
      snapshot.reference.countries.map((value) => this.text.upper(value)),
    );
    const issues: RepairIssue[] = [];

    for (const record of records) {
      issues.push(...this.dates.issues(this.domain, record));
      try {
        EntityCanonicalKey.from(record.legalEntityCode, record.branchCode);
      } catch (error) {
        issues.push(this.invalidIdentity(record, error));
      }
      if (!countries.has(this.text.upper(record.countryCode))) {
        issues.push(
          new RepairIssue({
            domain: this.domain,
            recordId: record.id,
            code: "UNKNOWN_COUNTRY",
            disposition: this.lifecycle.repairDisposition(record),
            current: record.countryCode,
          }),
        );
      }
    }

    const duplicates = new DuplicateOperationalPolicy<EntityRecord>(
      this.domain,
      this.lifecycle,
    );
    issues.push(
      ...duplicates.issues(records, (record) =>
        EntityCanonicalKey.from(record.legalEntityCode, record.branchCode),
      ),
    );

    return new DomainRepairReport({
      domain: this.domain,
      recordCount: records.length,
      issues,
    });
  }

  private invalidIdentity(record: EntityRecord, error: unknown): RepairIssue {
    return new RepairIssue({
      domain: this.domain,
      recordId: record.id,
      code: "INVALID_ENTITY_IDENTITY",
      disposition: "REPORT_ONLY",
      current: error instanceof Error ? error.message : String(error),
    });
  }
}

class NostroRepairPolicy extends DomainRepairPolicy<NostroRecord> {
  private readonly text: TextPolicy;
  private readonly dates: DateRangePolicy;
  private readonly lifecycle: LifecyclePolicy;

  constructor(
    text: TextPolicy,
    dates: DateRangePolicy,
    lifecycle: LifecyclePolicy,
  ) {
    super("NOSTRO");
    this.text = text;
    this.dates = dates;
    this.lifecycle = lifecycle;
  }

  evaluate(
    records: readonly NostroRecord[],
    snapshot: GovernedDataSnapshot,
  ): DomainRepairReport {
    const entities = new Set(
      snapshot.entities.map((record) =>
        this.text.upper(record.legalEntityCode),
      ),
    );
    const currencies = new Set(
      snapshot.reference.currencies.map((value) => this.text.upper(value)),
    );
    const issues: RepairIssue[] = [];

    for (const record of records) {
      issues.push(...this.dates.issues(this.domain, record));
      try {
        NostroCanonicalKey.from(record);
      } catch (error) {
        issues.push(
          new RepairIssue({
            domain: this.domain,
            recordId: record.id,
            code: "INVALID_NOSTRO_IDENTITY",
            disposition: "REPORT_ONLY",
            current: error instanceof Error ? error.message : String(error),
          }),
        );
      }
      if (!entities.has(this.text.upper(record.ownLegalEntityId))) {
        issues.push(
          new RepairIssue({
            domain: this.domain,
            recordId: record.id,
            code: "UNKNOWN_OWN_LEGAL_ENTITY",
            disposition: "REPORT_ONLY",
            current: record.ownLegalEntityId,
          }),
        );
      }
      if (!currencies.has(this.text.upper(record.currency))) {
        issues.push(
          new RepairIssue({
            domain: this.domain,
            recordId: record.id,
            code: "UNKNOWN_CURRENCY",
            disposition: "REPORT_ONLY",
            current: record.currency,
          }),
        );
      }
    }

    const duplicates = new DuplicateOperationalPolicy<NostroRecord>(
      this.domain,
      this.lifecycle,
    );
    issues.push(
      ...duplicates.issues(records, (record) =>
        NostroCanonicalKey.from(record),
      ),
    );

    return new DomainRepairReport({
      domain: this.domain,
      recordCount: records.length,
      issues,
    });
  }
}

class SsiRepairPolicy extends DomainRepairPolicy<SsiRecord> {
  private readonly text: TextPolicy;
  private readonly dates: DateRangePolicy;
  private readonly lifecycle: LifecyclePolicy;

  constructor(
    text: TextPolicy,
    dates: DateRangePolicy,
    lifecycle: LifecyclePolicy,
  ) {
    super("SSI");
    this.text = text;
    this.dates = dates;
    this.lifecycle = lifecycle;
  }

  evaluate(
    records: readonly SsiRecord[],
    snapshot: GovernedDataSnapshot,
  ): DomainRepairReport {
    const entities = new Set(
      snapshot.entities.map((record) =>
        this.text.upper(record.legalEntityCode),
      ),
    );
    const currencies = new Set(
      snapshot.reference.currencies.map((value) => this.text.upper(value)),
    );
    const banks = new Set(
      snapshot.reference.bankBics.map(
        (value) => CanonicalBic.from(value).value,
      ),
    );
    const issues: RepairIssue[] = [];

    for (const record of records) {
      const applicability = this.applicability(record);
      const effectiveRecord = {
        ...record,
        validFrom:
          record.route.validFrom ??
          record.validFrom ??
          applicability?.validFrom,
        validTo:
          record.route.validTo ?? record.validTo ?? applicability?.validTo,
      };
      issues.push(...this.dates.issues(this.domain, effectiveRecord));

      const effectiveBic = this.counterpartyBic(record, issues);
      if (!effectiveBic) continue;
      const counterpartyType = this.counterpartyType(record, effectiveBic);

      try {
        SsiCanonicalKey.from({
          ownershipType: record.ownershipType,
          ownerParty: record.ownerParty,
          publisherParty: record.publisherParty,
          counterpartyType,
          counterpartyBic: effectiveBic,
          scope: record.scope,
          currency: record.route.currency,
          businessFunction: record.route.businessFunction,
        });
      } catch (error) {
        issues.push(
          new RepairIssue({
            domain: this.domain,
            recordId: record.id,
            code: "INVALID_SSI_IDENTITY",
            disposition: "REPORT_ONLY",
            current: error instanceof Error ? error.message : String(error),
          }),
        );
      }

      if (
        counterpartyType === "BANK" &&
        !banks.has(CanonicalBic.from(effectiveBic).value)
      ) {
        issues.push(
          new RepairIssue({
            domain: this.domain,
            recordId: record.id,
            code: "UNKNOWN_COUNTERPARTY_BANK",
            disposition: "REPORT_ONLY",
            current: effectiveBic,
          }),
        );
      }
      if (!entities.has(this.text.upper(record.route.bookingEntity))) {
        issues.push(
          new RepairIssue({
            domain: this.domain,
            recordId: record.id,
            code: "UNKNOWN_BOOKING_ENTITY",
            disposition: "REPORT_ONLY",
            current: record.route.bookingEntity,
          }),
        );
      }
      if (!currencies.has(this.text.upper(record.route.currency))) {
        issues.push(
          new RepairIssue({
            domain: this.domain,
            recordId: record.id,
            code: "UNKNOWN_CURRENCY",
            disposition: "REPORT_ONLY",
            current: record.route.currency,
          }),
        );
      }
    }

    return new DomainRepairReport({
      domain: this.domain,
      recordCount: records.length,
      issues,
    });
  }

  private applicability(
    record: SsiRecord,
  ): { readonly validFrom?: string; readonly validTo?: string } | undefined {
    const candidates = record.applicability ?? [];
    return (
      candidates.find(
        (candidate) => this.text.upper(candidate.status) === "ACTIVE",
      ) ?? candidates[0]
    );
  }

  private counterpartyType(record: SsiRecord, effectiveBic: string): string {
    const explicit = this.text.upper(record.route.counterpartyType);
    if (explicit) return explicit;
    return effectiveBic === "ANY" ? "ANY_BANK" : "BANK";
  }

  private counterpartyBic(
    record: SsiRecord,
    issues: RepairIssue[],
  ): string | undefined {
    const current = this.text.upper(record.route.counterpartyBic);
    if (current === "ANY") return current;

    try {
      CanonicalBic.from(current);
      return current;
    } catch {
      const counterpartyId = this.text.upper(record.counterpartyId);
      const proposed = counterpartyId.startsWith("CP-")
        ? counterpartyId.slice(3)
        : "";
      let validProposal = false;
      try {
        CanonicalBic.from(proposed);
        validProposal = true;
      } catch {
        validProposal = false;
      }

      issues.push(
        new RepairIssue({
          domain: this.domain,
          recordId: record.id,
          code: current
            ? "COUNTERPARTY_BIC_INVALID"
            : "COUNTERPARTY_BIC_MISSING",
          disposition: validProposal
            ? this.lifecycle.repairDisposition(record)
            : "REPORT_ONLY",
          current,
          proposed: validProposal ? proposed : undefined,
        }),
      );
      return validProposal ? proposed : undefined;
    }
  }
}

class ConfiguredMessageTypeConversionPolicy {
  private readonly targets: ReadonlyMap<string, string>;
  private readonly configured: GovernedDataSnapshot["reference"]["legacyRmaMessageTypeConversions"];

  constructor(
    configured: GovernedDataSnapshot["reference"]["legacyRmaMessageTypeConversions"],
  ) {
    this.configured = configured;
    this.targets = new Map(configured.map(({ from, to }) => [from, to]));
  }

  convert(messageType: string): string {
    return this.targets.get(messageType) ?? messageType;
  }

  evidence(sourceTypes: readonly string[]): readonly MessageTypeConversion[] {
    return this.configured.flatMap(({ from, to }) => {
      const occurrences = sourceTypes.filter((value) => value === from).length;
      return occurrences > 0
        ? [new MessageTypeConversion({ from, to, occurrences })]
        : [];
    });
  }
}

class RmaRepairPolicy extends DomainRepairPolicy<
  RmaRecord,
  RmaGroupRepairPlan
> {
  private readonly text: TextPolicy;
  private readonly lifecycle: LifecyclePolicy;
  private readonly segmentation: SegmentationPolicy;

  constructor(
    text: TextPolicy,
    lifecycle: LifecyclePolicy,
    segmentation: SegmentationPolicy,
  ) {
    super("RMA");
    this.text = text;
    this.lifecycle = lifecycle;
    this.segmentation = segmentation;
  }

  evaluate(
    records: readonly RmaRecord[],
    snapshot: GovernedDataSnapshot,
  ): DomainRepairReport<RmaGroupRepairPlan> {
    const supported = new Set(
      snapshot.reference.supportedRmaMessageTypes.map((value) =>
        this.text.messageType(value),
      ),
    );
    const conversions = new ConfiguredMessageTypeConversionPolicy(
      snapshot.reference.legacyRmaMessageTypeConversions,
    );
    const banks = new Set(
      snapshot.reference.bankBics.map(
        (value) => CanonicalBic.from(value).value,
      ),
    );
    const grouped = new Map<
      string,
      { identity: RmaCanonicalKey; records: RmaRecord[] }
    >();
    const issues: RepairIssue[] = [];

    for (const record of records) {
      try {
        const identity = RmaCanonicalKey.from(
          record.ownBic,
          record.counterpartyBic,
          record.direction,
        );
        const [ownBic, counterpartyBic] = identity.value.split("|");
        for (const [field, bic] of [
          ["OWN", ownBic],
          ["COUNTERPARTY", counterpartyBic],
        ] as const) {
          if (bic && !banks.has(bic)) {
            issues.push(
              new RepairIssue({
                domain: this.domain,
                recordId: record.id,
                code: `UNKNOWN_${field}_BANK`,
                disposition: "REPORT_ONLY",
                current: bic,
              }),
            );
          }
        }
        const bucket = grouped.get(identity.value) ?? { identity, records: [] };
        bucket.records.push(record);
        grouped.set(identity.value, bucket);
      } catch (error) {
        issues.push(
          new RepairIssue({
            domain: this.domain,
            recordId: record.id,
            code: "INVALID_RMA_IDENTITY",
            disposition: "REPORT_ONLY",
            current: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    }

    const plans = [...grouped.values()]
      .map((group) =>
        this.planGroup(group.identity, group.records, supported, conversions),
      )
      .sort((left, right) =>
        left.canonicalKey.localeCompare(right.canonicalKey),
      );

    return new DomainRepairReport({
      domain: this.domain,
      recordCount: records.length,
      issues,
      groups: plans,
    });
  }

  private planGroup(
    identity: RmaCanonicalKey,
    records: readonly RmaRecord[],
    supported: ReadonlySet<string>,
    conversions: ConfiguredMessageTypeConversionPolicy,
  ): RmaGroupRepairPlan {
    const operational = records.filter((record) =>
      this.lifecycle.isOperational(record),
    );
    const openWorkflow = operational.filter((record) =>
      this.lifecycle.isOpenWorkflow(record),
    );
    const active = operational.filter((record) =>
      this.lifecycle.isActive(record),
    );
    const sourceTypes = operational.flatMap((record) =>
      record.messageTypes.map((value) => this.text.messageType(value)),
    );
    const conversionEvidence = conversions.evidence(sourceTypes);
    const allTypes = sourceTypes.map((value) => conversions.convert(value));
    const retained = this.text.uniqueSorted(
      allTypes.filter((value) => supported.has(value)),
    );
    const removed = this.text.uniqueSorted(
      allTypes.filter((value) => !supported.has(value)),
    );

    let disposition = "NO_CHANGE";
    if (openWorkflow.length > 0) disposition = "SKIP_OPEN_WORKFLOW";
    else if (active.length === 0) disposition = "SKIP_NO_ACTIVE_RECORD";
    else if (retained.length === 0) disposition = "MANUAL_SUPPRESSION_REVIEW";
    else if (
      active.length > 1 ||
      removed.length > 0 ||
      conversionEvidence.length > 0
    )
      disposition = "CREATE_GROUP_REVISION";

    return new RmaGroupRepairPlan({
      canonicalKey: identity.value,
      segmentId: this.segmentation.segmentOf(identity),
      disposition,
      sourceRecordIds: records.map((record) => record.id),
      retainedMessageTypes: retained,
      removedMessageTypes: removed,
      conversions: conversionEvidence,
      targetService:
        retained.length > 0 ? this.serviceFor(retained) : undefined,
    });
  }

  private serviceFor(messageTypes: readonly string[]): string {
    const hasFin = messageTypes.some((value) => value.startsWith("MT"));
    const hasFinplus = messageTypes.some((value) => !value.startsWith("MT"));
    if (hasFin && hasFinplus) return "FIN / FINPLUS";
    return hasFin ? "FIN" : "FINPLUS";
  }
}

export class GovernedDataRepairPlanner {
  private readonly repository: GovernedDataRepository;
  private readonly writer: RepairReportWriter;
  private readonly entityPolicy: EntityRepairPolicy;
  private readonly nostroPolicy: NostroRepairPolicy;
  private readonly ssiPolicy: SsiRepairPolicy;
  private readonly rmaPolicy: RmaRepairPolicy;

  private constructor(
    repository: GovernedDataRepository,
    writer: RepairReportWriter,
    entityPolicy: EntityRepairPolicy,
    nostroPolicy: NostroRepairPolicy,
    ssiPolicy: SsiRepairPolicy,
    rmaPolicy: RmaRepairPolicy,
  ) {
    this.repository = repository;
    this.writer = writer;
    this.entityPolicy = entityPolicy;
    this.nostroPolicy = nostroPolicy;
    this.ssiPolicy = ssiPolicy;
    this.rmaPolicy = rmaPolicy;
  }

  static standard(
    repository: GovernedDataRepository,
    writer: RepairReportWriter,
    segmentCount: number,
  ): GovernedDataRepairPlanner {
    const text = new TextPolicy();
    const dates = new DateRangePolicy();
    const lifecycle = new LifecyclePolicy(text);
    return new GovernedDataRepairPlanner(
      repository,
      writer,
      new EntityRepairPolicy(text, dates, lifecycle),
      new NostroRepairPolicy(text, dates, lifecycle),
      new SsiRepairPolicy(text, dates, lifecycle),
      new RmaRepairPolicy(
        text,
        lifecycle,
        new SegmentationPolicy(segmentCount),
      ),
    );
  }

  async execute(): Promise<GovernedDataRepairReport> {
    const snapshot = await this.repository.loadSnapshot();
    const report = new GovernedDataRepairReport({
      generatedAt: new Date().toISOString(),
      parameterSnapshotId: snapshot.reference.parameterSnapshotId,
      domains: {
        ENTITY: this.entityPolicy.evaluate(snapshot.entities, snapshot),
        NOSTRO: this.nostroPolicy.evaluate(snapshot.nostros, snapshot),
        SSI: this.ssiPolicy.evaluate(snapshot.ssis, snapshot),
        RMA: this.rmaPolicy.evaluate(snapshot.rmas, snapshot),
      },
    });
    await this.writer.write(report);
    return report;
  }
}

export class InMemoryGovernedDataRepository implements GovernedDataRepository {
  private readonly snapshot: GovernedDataSnapshot;

  constructor(snapshot: GovernedDataSnapshot) {
    this.snapshot = snapshot;
  }

  async loadSnapshot(): Promise<GovernedDataSnapshot> {
    return Promise.resolve(this.snapshot);
  }
}

export class InMemoryRepairReportWriter implements RepairReportWriter {
  public lastReport?: GovernedDataRepairReport;

  async write(report: GovernedDataRepairReport): Promise<void> {
    this.lastReport = report;
    return Promise.resolve();
  }
}
