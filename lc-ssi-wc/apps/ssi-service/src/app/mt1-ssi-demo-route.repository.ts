import { Injectable, Optional } from "@nestjs/common";
import type {
  PageParameterLookupEnvelope,
  PageParameterSelectedRouteIdentity,
  ResolutionPageSettlementRoute,
} from "@ssi/contracts";
import { hashCanonical } from "./canonical-json";
import {
  SqliteSsiRepository,
  type Mt1SsiCandidateRoute,
} from "./sqlite-ssi.repository";
import type { NostroRecord } from "./nostro/nostro.repository";
import { DatabaseSnapshotIdentityService } from "./database-snapshot-identity.service";
import { BankServiceDirectory } from "./bank-service-directory";

export interface Mt1SsiRouteLookupQuery {
  readonly definitionId: string;
  readonly definitionVersion: string;
  readonly fixtureBindingId: string;
  readonly scenarioId: string;
  readonly messageType: string;
  readonly resolutionMessageType?: string;
  readonly profileId: string;
  readonly businessService: string;
  readonly settlementContext: SettlementContext;
  readonly sequence: string;
  readonly currency: string;
  readonly bookingEntity: string;
  readonly valueDate: string;
  readonly query?: string;
}
type SettlementContext = "INDA" | "INGA" | "COVE";
export interface Mt1SsiSettlementRouteQuery {
  readonly settlementContext: SettlementContext;
  readonly currency: string;
  readonly messageType: string;
  readonly profileId: string;
  readonly evidenceFormats: readonly ("SWIFT_MT" | "ISO_20022")[];
}
interface DbRoute {
  readonly binding: Mt1SsiCandidateRoute;
  readonly nostro: NostroRecord;
  readonly bankServiceId: string;
  readonly bic: string;
  readonly bankName: string;
}

type SettlementParty = ResolutionPageSettlementRoute["counterparty"];
type SettlementRole = ResolutionPageSettlementRoute["roles"][number];
type SettlementLeg = ResolutionPageSettlementRoute["legs"][number];
type SettlementProjection =
  ResolutionPageSettlementRoute["projections"][number];

const settlementRole = (context: SettlementContext) =>
  context === "INGA"
    ? "INGA_SETTLEMENT_ACCOUNT_RELATIONSHIP"
    : "INDA_SETTLEMENT_ACCOUNT_RELATIONSHIP";

function settlementRoles(
  context: SettlementContext,
  ssi: { readonly id: string; readonly version: number },
  nostro: NostroRecord,
): SettlementRole[] {
  if (context === "COVE")
    return [
      {
        role: "INSTRUCTING_REIMBURSEMENT_AGENT",
        owner: "OWN_SSI_OR_ACCOUNT_MASTER",
        recordId: nostro.id,
        version: nostro.version,
      },
      {
        role: "INSTRUCTED_REIMBURSEMENT_AGENT",
        owner: "COUNTERPARTY_SSI",
        recordId: ssi.id,
        version: ssi.version,
      },
    ];
  const inga = context === "INGA";
  return [
    {
      role: settlementRole(context),
      owner: inga ? "COUNTERPARTY_SSI" : "OWN_SSI_OR_ACCOUNT_MASTER",
      recordId: inga ? ssi.id : nostro.id,
      version: inga ? ssi.version : nostro.version,
    },
  ];
}

function settlementLegs(
  query: Mt1SsiSettlementRouteQuery,
  ssi: { readonly id: string; readonly version: number },
  nostro: NostroRecord,
  local: SettlementParty,
  counterparty: SettlementParty,
  accountReference: string,
): SettlementLeg[] {
  if (query.settlementContext === "COVE")
    return [
      {
        order: 1,
        relationship: "COVE",
        role: "INSTRUCTING_REIMBURSEMENT_AGENT",
        accountOwner: local,
        accountServicer: counterparty,
        accountReference,
        currency: query.currency,
        source: "GOVERNED_DATABASE",
        sourceRecordId: nostro.id,
        version: nostro.version,
      },
      {
        order: 2,
        relationship: "COVE",
        role: "INSTRUCTED_REIMBURSEMENT_AGENT",
        accountOwner: counterparty,
        accountServicer: local,
        accountReference,
        currency: query.currency,
        source: "GOVERNED_DATABASE",
        sourceRecordId: ssi.id,
        version: ssi.version,
      },
    ];
  const inga = query.settlementContext === "INGA";
  return [
    {
      order: 1,
      relationship: query.settlementContext,
      role: settlementRole(query.settlementContext),
      accountOwner: inga ? counterparty : local,
      accountServicer: inga ? local : counterparty,
      accountReference,
      currency: query.currency,
      source: "GOVERNED_DATABASE",
      sourceRecordId: nostro.id,
      version: nostro.version,
    },
  ];
}

function swiftMtProjections(
  query: Mt1SsiSettlementRouteQuery,
  ssi: { readonly id: string; readonly version: number },
  nostro: NostroRecord,
  local: SettlementParty,
  counterparty: SettlementParty,
  accountReference: string,
): SettlementProjection[] {
  const serial = query.settlementContext !== "COVE";
  const tag = query.settlementContext === "INGA" ? "54" : "53";
  const projections: SettlementProjection[] = [
    {
      kind: "SWIFT_MT_FIELD",
      identifier: tag,
      option: "A",
      label:
        tag === "53" ? "Sender's Correspondent" : "Receiver's Correspondent",
      role: serial
        ? settlementRole(query.settlementContext)
        : "INSTRUCTING_REIMBURSEMENT_AGENT",
      value:
        serial && query.settlementContext === "INGA"
          ? local.bic
          : counterparty.bic,
      accountReference,
      sourceRecordId: nostro.id,
      version: nostro.version,
    },
  ];
  if (!serial)
    projections.push({
      kind: "SWIFT_MT_FIELD",
      identifier: "54",
      option: "A",
      label: "Receiver's Correspondent",
      role: "INSTRUCTED_REIMBURSEMENT_AGENT",
      value: local.bic,
      accountReference,
      sourceRecordId: ssi.id,
      version: ssi.version,
    });
  return projections;
}

function iso20022Projections(
  query: Mt1SsiSettlementRouteQuery,
  ssi: { readonly id: string; readonly version: number },
  nostro: NostroRecord,
  local: SettlementParty,
  counterparty: SettlementParty,
  accountReference: string,
): SettlementProjection[] {
  const method: SettlementProjection = {
    kind: "ISO_20022_ELEMENT",
    identifier: "SttlmMtd",
    label: "Settlement Method",
    role: "SETTLEMENT_METHOD",
    value: query.settlementContext,
    sourceRecordId: nostro.id,
    version: nostro.version,
  };
  if (query.settlementContext !== "COVE")
    return [
      method,
      {
        kind: "ISO_20022_ELEMENT",
        identifier: "SttlmAcct",
        label: "Settlement Account",
        role: settlementRole(query.settlementContext),
        value: accountReference,
        accountReference,
        sourceRecordId: nostro.id,
        version: nostro.version,
      },
    ];
  return [
    method,
    {
      kind: "ISO_20022_ELEMENT",
      identifier: "InstgRmbrsmntAgt",
      label: "Instructing Reimbursement Agent",
      role: "INSTRUCTING_REIMBURSEMENT_AGENT",
      value: counterparty.bic,
      sourceRecordId: nostro.id,
      version: nostro.version,
    },
    {
      kind: "ISO_20022_ELEMENT",
      identifier: "InstgRmbrsmntAgtAcct",
      label: "Instructing Reimbursement Agent Account",
      role: "INSTRUCTING_REIMBURSEMENT_AGENT",
      value: accountReference,
      accountReference,
      sourceRecordId: nostro.id,
      version: nostro.version,
    },
    {
      kind: "ISO_20022_ELEMENT",
      identifier: "InstdRmbrsmntAgt",
      label: "Instructed Reimbursement Agent",
      role: "INSTRUCTED_REIMBURSEMENT_AGENT",
      value: local.bic,
      sourceRecordId: ssi.id,
      version: ssi.version,
    },
    {
      kind: "ISO_20022_ELEMENT",
      identifier: "InstdRmbrsmntAgtAcct",
      label: "Instructed Reimbursement Agent Account",
      role: "INSTRUCTED_REIMBURSEMENT_AGENT",
      value: accountReference,
      accountReference,
      sourceRecordId: ssi.id,
      version: ssi.version,
    },
  ];
}

function settlementProjections(
  query: Mt1SsiSettlementRouteQuery,
  ssi: { readonly id: string; readonly version: number },
  nostro: NostroRecord,
  local: SettlementParty,
  counterparty: SettlementParty,
  accountReference: string,
): SettlementProjection[] {
  return query.evidenceFormats.flatMap((format) =>
    format === "SWIFT_MT"
      ? swiftMtProjections(
          query,
          ssi,
          nostro,
          local,
          counterparty,
          accountReference,
        )
      : iso20022Projections(
          query,
          ssi,
          nostro,
          local,
          counterparty,
          accountReference,
        ),
  );
}

@Injectable()
export class Mt1SsiDemoRouteRepository {
  private readonly ssi: SqliteSsiRepository;
  private readonly snapshots: DatabaseSnapshotIdentityService;
  private readonly directory: BankServiceDirectory;
  private readonly issuedSnapshots = new Set<string>();

  constructor(
    @Optional() ssi?: SqliteSsiRepository,
    @Optional() snapshots?: DatabaseSnapshotIdentityService,
    @Optional() directory?: BankServiceDirectory,
  ) {
    this.ssi =
      ssi && typeof ssi.findMt1CandidateBindings === "function"
        ? ssi
        : new SqliteSsiRepository();
    this.snapshots = snapshots ?? new DatabaseSnapshotIdentityService();
    this.directory = directory ?? new BankServiceDirectory();
  }

  lookup(input: Mt1SsiRouteLookupQuery): PageParameterLookupEnvelope {
    const snapshot = this.snapshots.current();
    this.issuedSnapshots.add(snapshot.sha256);
    const contextSha256 = this.contextSha256(input);
    const term = input.query?.trim().toUpperCase() ?? "";
    const routes = this.routes(input).filter(
      ({ bic, bankName }) =>
        !term ||
        [bic, bankName].some((value) => value.toUpperCase().includes(term)),
    );
    const items = routes.map((route) => ({
      provider: "SSI_COUNTERPARTY" as const,
      action: "SSI_COUNTERPARTY" as const,
      bankServiceId: route.bankServiceId,
      bic: route.bic,
      bankName: route.bankName,
      displayValue: `${route.bic} — ${route.bankName}`,
      selectedRouteIdentity: this.identity(input, route, contextSha256),
    }));
    const best = routes[0];
    const uniqueBest =
      best &&
      routes.filter(({ nostro }) => nostro.priority === best.nostro.priority)
        .length === 1;
    return {
      provider: "SSI_COUNTERPARTY",
      action: "SSI_COUNTERPARTY",
      eligibilitySnapshot: {
        snapshotId: snapshot.sha256,
        contextSha256,
        snapshotIdentityMethod: snapshot.method,
      },
      items,
      ...(!term && uniqueBest
        ? {
            defaultSelection: {
              valueField: "bankServiceId" as const,
              value: best.bankServiceId,
              reasonCode: "GOVERNED_PRIORITY_DEFAULT" as const,
              dependency: {
                fieldId: "context.currency" as const,
                value: input.currency,
              },
            },
          }
        : {}),
    };
  }

  accepts(
    identity: PageParameterSelectedRouteIdentity,
    snapshotId: string,
  ): boolean {
    if (!this.issuedSnapshots.has(snapshotId)) return false;
    const ssi = this.ssi.find(identity.ssi.id);
    const app = this.ssi
      .listApplicability(identity.ssi.id)
      .find(({ id }) => id === identity.applicability.id);
    const nostro = this.ssi.findMt1Nostro(identity.nostro.id);
    return Boolean(
      ssi?.version === identity.ssi.version &&
      ssi.status === "ACTIVE" &&
      app?.version === identity.applicability.version &&
      app.status === "ACTIVE" &&
      nostro?.version === identity.nostro.version &&
      nostro.status === "ACTIVE",
    );
  }

  settlementRoute(
    identity: PageParameterSelectedRouteIdentity,
    snapshotId: string,
    query: Mt1SsiSettlementRouteQuery,
  ): ResolutionPageSettlementRoute | undefined {
    if (!this.accepts(identity, snapshotId)) return undefined;
    const ssi = this.ssi.find(identity.ssi.id)!;
    const nostro = this.ssi.findMt1Nostro(identity.nostro.id)!;
    const bank = this.bank(nostro.accountServicerBic);
    const local = this.institution(
      process.env["OWN_BIC"]?.trim().toUpperCase() || "DEMOHKHH",
      "Local Bank",
    );
    const counterparty = this.institution(nostro.accountServicerBic, bank.name);
    const accountReference = nostro.accountReference ?? nostro.maskedAccountRef;
    return {
      routeBindingId: identity.routeId,
      counterparty: {
        bankServiceId: bank.bankServiceId,
        bic: nostro.accountServicerBic,
        name: bank.name,
      },
      ssi: identity.ssi,
      applicability: identity.applicability,
      nostro: identity.nostro,
      roles: settlementRoles(query.settlementContext, ssi, nostro),
      legs: settlementLegs(
        query,
        ssi,
        nostro,
        local,
        counterparty,
        accountReference,
      ),
      projections: settlementProjections(
        query,
        ssi,
        nostro,
        local,
        counterparty,
        accountReference,
      ),
    };
  }

  private routes(input: Mt1SsiRouteLookupQuery): DbRoute[] {
    const bindings = this.ssi.findMt1CandidateBindings(input);
    return bindings.map((binding) => {
      const bank = this.bank(binding.nostro.accountServicerBic);
      return {
        binding,
        nostro: binding.nostro,
        bankServiceId: bank.bankServiceId,
        bic: binding.nostro.accountServicerBic,
        bankName: bank.name,
      };
    });
  }

  private identity(
    input: Mt1SsiRouteLookupQuery,
    route: DbRoute,
    contextSha256: string,
  ): PageParameterSelectedRouteIdentity {
    const records = {
      ssi: { id: route.binding.ssi.id, version: route.binding.ssi.version },
      applicability: {
        id: route.binding.applicability.id,
        version: route.binding.applicability.version,
      },
      nostro: { id: route.nostro.id, version: route.nostro.version },
    };
    return {
      routeId: hashCanonical(records),
      definitionId: input.definitionId,
      definitionVersion: input.definitionVersion,
      fixtureBindingId: input.fixtureBindingId,
      contextSha256,
      ...records,
    };
  }
  private bank(bic: string): { bankServiceId: string; name: string } {
    const found = this.directory.search().find((record) => record.bic === bic);
    return found
      ? { bankServiceId: found.bankServiceId, name: found.name }
      : { bankServiceId: `BANK-SVC-${bic}`, name: bic };
  }
  private institution(bic: string, name: string) {
    return { bankServiceId: this.bank(bic).bankServiceId, bic, name };
  }
  private contextSha256(input: Mt1SsiRouteLookupQuery): string {
    return hashCanonical({
      scenarioId: input.scenarioId,
      messageType: input.messageType,
      profileId: input.profileId,
      businessService: input.businessService,
      settlementContext: input.settlementContext,
      sequence: input.sequence,
      currency: input.currency,
      bookingEntity: input.bookingEntity,
      valueDate: input.valueDate,
      fixtureBindingId: input.fixtureBindingId,
    });
  }
}
