import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Injectable, Optional } from "@nestjs/common";
import type {
  PageParameterLookupEnvelope,
  PageParameterSelectedRouteIdentity,
  ResolutionPageSettlementRoute,
} from "@ssi/contracts";
import { hashCanonical } from "./canonical-json";

interface Identity {
  readonly id: string;
  readonly version: number;
}

interface DemoBank {
  readonly bankServiceId: string;
  readonly bic: string;
  readonly bankName: string;
}

interface DemoSettlementRelationship {
  readonly accountReferenceTemplate: string;
  readonly sourceRecordId: string;
  readonly version: number;
}

interface DemoCoveRelationship extends DemoSettlementRelationship {
  readonly role:
    | "INSTRUCTING_REIMBURSEMENT_AGENT"
    | "INSTRUCTED_REIMBURSEMENT_AGENT"
    | "THIRD_REIMBURSEMENT_AGENT";
  readonly owner:
    "OWN_SSI_OR_ACCOUNT_MASTER" | "COUNTERPARTY_SSI" | "THIRD_PARTY_SSI";
  readonly institutionSide: "LOCAL" | "COUNTERPARTY";
  readonly mtTag: string;
  readonly mtOption: string;
  readonly mtOfficialDescription: string;
  readonly mxAgentElement: string;
  readonly mxAccountElement: string;
}

interface DemoRoute {
  readonly bankServiceId: string;
  readonly bic: string;
  readonly bankName: string;
  readonly bookingEntity: string;
  readonly currencies: readonly string[];
  readonly validFrom: string;
  readonly validTo: string;
  readonly ssi: Identity;
  readonly applicability: Identity;
  readonly nostro: Identity;
  readonly rma: Identity;
  readonly settlementRelationships: Readonly<
    Record<"INDA" | "INGA", DemoSettlementRelationship>
  >;
  readonly coveRelationships: readonly DemoCoveRelationship[];
}

interface DemoRouteFixture {
  readonly schemaVersion: "1.0";
  readonly fixtureVersion: string;
  readonly standardsRelease: "SR2026";
  readonly localBank: DemoBank;
  readonly routes: readonly DemoRoute[];
}

export interface Mt1SsiDemoRouteRepositoryOptions {
  readonly fixturePath?: string;
}

export interface Mt1SsiRouteLookupQuery {
  readonly definitionId: string;
  readonly definitionVersion: string;
  readonly fixtureBindingId: string;
  readonly scenarioId: string;
  readonly messageType: string;
  readonly sequence: string;
  readonly currency: string;
  readonly bookingEntity: string;
  readonly valueDate: string;
  readonly query?: string;
}

export interface Mt1SsiSettlementRouteQuery {
  readonly settlementContext: "INDA" | "INGA" | "COVE";
  readonly currency: string;
  readonly messageType: string;
}

@Injectable()
export class Mt1SsiDemoRouteRepository {
  private readonly fixture: DemoRouteFixture;
  private readonly snapshotId: string;

  constructor(@Optional() options?: Mt1SsiDemoRouteRepositoryOptions) {
    const path =
      options?.fixturePath ??
      join(process.cwd(), "parameters", "mt1-ssi-demo-routes.sr2026.json");
    const raw = readFileSync(path);
    this.fixture = JSON.parse(raw.toString("utf8")) as DemoRouteFixture;
    if (
      this.fixture.schemaVersion !== "1.0" ||
      this.fixture.standardsRelease !== "SR2026" ||
      !this.fixture.routes.length
    )
      throw new Error("MT1_SSI_DEMO_ROUTE_FIXTURE_INVALID");
    this.snapshotId = createHash("sha256").update(raw).digest("hex");
  }

  lookup(input: Mt1SsiRouteLookupQuery): PageParameterLookupEnvelope {
    const contextSha256 = this.contextSha256(input);
    const term = input.query?.trim().toUpperCase() ?? "";
    const routes = this.fixture.routes.filter(
      (route) =>
        route.bookingEntity === input.bookingEntity &&
        route.currencies.includes(input.currency) &&
        route.validFrom <= input.valueDate &&
        input.valueDate <= route.validTo &&
        (!term ||
          [route.bic, route.bankName].some((value) =>
            value.toUpperCase().includes(term),
          )),
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
    return {
      provider: "SSI_COUNTERPARTY",
      action: "SSI_COUNTERPARTY",
      eligibilitySnapshot: {
        snapshotId: this.snapshotId,
        contextSha256,
        snapshotIdentityMethod: "SHA256_CANONICAL_DEMO_FIXTURE_V1",
      },
      items,
      ...(!term && items.length === 1
        ? {
            defaultSelection: {
              valueField: "bankServiceId" as const,
              value: items[0]!.bankServiceId,
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
    if (snapshotId !== this.snapshotId) return false;
    return this.fixture.routes.some((route) => {
      const expected = {
        ssi: route.ssi,
        applicability: route.applicability,
        nostro: route.nostro,
        rma: route.rma,
      };
      return (
        identity.routeId === hashCanonical(expected) &&
        identity.ssi.id === route.ssi.id &&
        identity.ssi.version === route.ssi.version &&
        identity.applicability.id === route.applicability.id &&
        identity.applicability.version === route.applicability.version &&
        identity.nostro.id === route.nostro.id &&
        identity.nostro.version === route.nostro.version &&
        identity.rma.id === route.rma.id &&
        identity.rma.version === route.rma.version
      );
    });
  }

  settlementRoute(
    identity: PageParameterSelectedRouteIdentity,
    snapshotId: string,
    query: Mt1SsiSettlementRouteQuery,
  ): ResolutionPageSettlementRoute | undefined {
    if (!this.accepts(identity, snapshotId)) return undefined;
    const route = this.fixture.routes.find(
      ({ ssi }) =>
        ssi.id === identity.ssi.id && ssi.version === identity.ssi.version,
    );
    if (!route) return undefined;
    const detail =
      query.settlementContext === "COVE"
        ? this.coveDetail(route, query)
        : this.serialDetail(route, query);
    if (!detail || !detail.legs.length || !detail.projections.length)
      return undefined;
    return {
      routeBindingId: identity.routeId,
      counterparty: {
        bankServiceId: route.bankServiceId,
        bic: route.bic,
        name: route.bankName,
      },
      ssi: route.ssi,
      applicability: route.applicability,
      nostro: route.nostro,
      rma: route.rma,
      ...detail,
    };
  }

  private serialDetail(
    route: DemoRoute,
    query: Mt1SsiSettlementRouteQuery,
  ):
    | Pick<ResolutionPageSettlementRoute, "roles" | "legs" | "projections">
    | undefined {
    if (query.settlementContext === "COVE") return undefined;
    const relationship = route.settlementRelationships[query.settlementContext];
    if (!relationship) return undefined;
    const inda = query.settlementContext === "INDA";
    const local = this.fixture.localBank;
    const counterparty = this.bank(route);
    const owner = inda ? local : counterparty;
    const servicer = inda ? counterparty : local;
    const role = `${query.settlementContext}_SETTLEMENT_ACCOUNT_RELATIONSHIP`;
    const accountReference = this.accountReference(
      relationship.accountReferenceTemplate,
      query.currency,
    );
    const projection =
      query.messageType === "MT103"
        ? {
            kind: "SWIFT_MT_FIELD" as const,
            identifier: inda ? "53" : "54",
            option: "A",
            label: inda ? "Sender's Correspondent" : "Receiver's Correspondent",
          }
        : {
            kind: "ISO_20022_ELEMENT" as const,
            identifier: "SttlmMtd",
            label: "Settlement Method",
          };
    return {
      roles: [
        {
          role,
          owner: "COUNTERPARTY_SSI",
          recordId: route.ssi.id,
          version: route.ssi.version,
        },
      ],
      legs: [
        {
          order: 1,
          relationship: query.settlementContext,
          role,
          accountOwner: owner,
          accountServicer: servicer,
          accountReference,
          currency: query.currency,
          source: "MT1_SSI_DEMO_ROUTE_FIXTURE",
          sourceRecordId: relationship.sourceRecordId,
          version: relationship.version,
        },
      ],
      projections: [
        {
          ...projection,
          role,
          value: query.settlementContext,
          accountReference,
          sourceRecordId: relationship.sourceRecordId,
          version: relationship.version,
        },
      ],
    };
  }

  private coveDetail(
    route: DemoRoute,
    query: Mt1SsiSettlementRouteQuery,
  ):
    | Pick<ResolutionPageSettlementRoute, "roles" | "legs" | "projections">
    | undefined {
    if (!route.coveRelationships.length) return undefined;
    const local = this.fixture.localBank;
    const counterparty = this.bank(route);
    return {
      roles: route.coveRelationships.map((relationship) => ({
        role: relationship.role,
        owner: relationship.owner,
        recordId: relationship.sourceRecordId,
        version: relationship.version,
      })),
      legs: route.coveRelationships.map((relationship, index) => {
        const institution =
          relationship.institutionSide === "LOCAL" ? local : counterparty;
        return {
          order: index + 1,
          relationship: "COVE" as const,
          role: relationship.role,
          accountOwner: institution,
          accountServicer: institution,
          accountReference: this.accountReference(
            relationship.accountReferenceTemplate,
            query.currency,
          ),
          currency: query.currency,
          source: "MT1_SSI_DEMO_ROUTE_FIXTURE",
          sourceRecordId: relationship.sourceRecordId,
          version: relationship.version,
        };
      }),
      projections: route.coveRelationships.map((relationship) => ({
        ...(query.messageType === "MT103"
          ? {
              kind: "SWIFT_MT_FIELD" as const,
              identifier: relationship.mtTag,
              option: relationship.mtOption,
              label: relationship.mtOfficialDescription,
            }
          : {
              kind: "ISO_20022_ELEMENT" as const,
              identifier: `${relationship.mxAgentElement}/${relationship.mxAccountElement}`,
              label: relationship.role.replaceAll("_", " "),
            }),
        role: relationship.role,
        value:
          relationship.institutionSide === "LOCAL"
            ? local.bic
            : counterparty.bic,
        accountReference: this.accountReference(
          relationship.accountReferenceTemplate,
          query.currency,
        ),
        sourceRecordId: relationship.sourceRecordId,
        version: relationship.version,
      })),
    };
  }

  private bank(route: DemoRoute): DemoBank {
    return {
      bankServiceId: route.bankServiceId,
      bic: route.bic,
      bankName: route.bankName,
    };
  }

  private accountReference(template: string, currency: string): string {
    return template.replaceAll("{currency}", currency);
  }

  private identity(
    input: Mt1SsiRouteLookupQuery,
    route: DemoRoute,
    contextSha256: string,
  ): PageParameterSelectedRouteIdentity {
    const records = {
      ssi: route.ssi,
      applicability: route.applicability,
      nostro: route.nostro,
      rma: route.rma,
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

  private contextSha256(
    input: Pick<
      Mt1SsiRouteLookupQuery,
      | "scenarioId"
      | "messageType"
      | "sequence"
      | "currency"
      | "bookingEntity"
      | "valueDate"
      | "fixtureBindingId"
    >,
  ): string {
    return hashCanonical({
      scenarioId: input.scenarioId,
      messageType: input.messageType,
      sequence: input.sequence,
      currency: input.currency,
      bookingEntity: input.bookingEntity,
      valueDate: input.valueDate,
      fixtureBindingId: input.fixtureBindingId,
    });
  }
}
