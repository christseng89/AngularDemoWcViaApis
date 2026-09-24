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
}

interface DemoRouteFixture {
  readonly schemaVersion: "1.0";
  readonly fixtureVersion: string;
  readonly standardsRelease: "SR2026";
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
    roles: ResolutionPageSettlementRoute["roles"],
  ): ResolutionPageSettlementRoute | undefined {
    if (!this.accepts(identity, snapshotId)) return undefined;
    const route = this.fixture.routes.find(
      ({ ssi }) =>
        ssi.id === identity.ssi.id && ssi.version === identity.ssi.version,
    );
    if (!route) return undefined;
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
      roles,
    };
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
