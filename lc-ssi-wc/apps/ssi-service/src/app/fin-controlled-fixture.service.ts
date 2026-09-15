import { BadRequestException, Injectable } from "@nestjs/common";
import {
  SqliteSsiRepository,
  type SsiApplicabilityRecord,
  type SsiRecord,
} from "./sqlite-ssi.repository";

const FIXTURE_FAMILY = "MT347-SR2026-SSI";

export interface FinControlledFixtureQuery {
  messageType: string;
  sequence?: string;
  currency: string;
  bookingEntity: string;
  valueDate: string;
  bindingId?: string;
  /** Candidate discovery may expand a canonical binding into its governed route group. */
  includeFixtureGroup?: boolean;
}

interface ControlledRoute {
  messageTypes?: readonly string[];
  businessFunction?: string;
  sequence?: string;
  settlementLeg?: string;
  currency?: string;
  bookingEntity?: string;
  counterpartyBic?: string;
  roleValues?: Readonly<Record<string, string>>;
  roleProvenance?: Readonly<Record<string, Record<string, string>>>;
  fixtureSet?: string;
  fixtureGroupId?: string;
}

interface ControlledSsi extends SsiRecord {
  fixtureFamily?: string;
  fixtureBindingId?: string;
  route: ControlledRoute & Record<string, string>;
}

interface ControlledApplicability extends SsiApplicabilityRecord {
  fixtureFamily?: string;
  fixtureBindingId?: string;
  messageType?: string;
  sequence?: string;
  settlementLeg?: string;
  currency?: string;
  transactionRoleValues?: Readonly<Record<string, string>>;
  transactionRoleProvenance?: Readonly<Record<string, Record<string, string>>>;
}

export interface FinControlledFixtureCandidate {
  id: string;
  version: number;
  bindingId: string;
  /** Canonical positive selection group; defaults to the exact legacy binding. */
  fixtureGroupId: string;
  messageType: string;
  businessFunction: string;
  sequence: string;
  settlementLeg: string;
  counterpartyBic: string;
  currency: string;
  bookingEntity: string;
  effectiveFrom: string;
  effectiveTo: string;
  priority: number;
  routeClass: "PRIMARY";
  demoData: true;
  sourceType: string;
  accountRelationship: "AUTHENTICATED_RECEIVING_ROUTE";
  roleValues: Readonly<Record<string, string>>;
  ssiRoleValues: Readonly<Record<string, string>>;
  transactionRoleValues: Readonly<Record<string, string>>;
  roleSources: Readonly<Record<string, string>>;
  roleEvidence: Readonly<Record<string, Record<string, string>>>;
  identity: {
    ssi: { id: string; version: number };
    applicability: { id: string; version: number };
  };
}

export interface FinControlledFixtureResult {
  fixtureFamily: string;
  source: "CANONICAL_DATABASE";
  query: FinControlledFixtureQuery;
  count: number;
  candidates: FinControlledFixtureCandidate[];
}

@Injectable()
export class FinControlledFixtureService {
  constructor(private readonly repository: SqliteSsiRepository) {}

  list(query: FinControlledFixtureQuery): FinControlledFixtureResult {
    this.validate(query);
    if (typeof this.repository.findFinControlledFixtures === "function") {
      const candidates = this.repository
        .findFinControlledFixtures(query)
        .map(({ ssi, applicability }) =>
          this.toCandidate(
            ssi as ControlledSsi,
            applicability as ControlledApplicability,
          ),
        )
        .sort((left, right) => left.bindingId.localeCompare(right.bindingId))
        .map((row, index) => ({ ...row, priority: (index + 1) * 10 }));
      return {
        fixtureFamily: FIXTURE_FAMILY,
        source: "CANONICAL_DATABASE",
        query,
        count: candidates.length,
        candidates,
      };
    }
    const applicability = this.repository
      .listApplicability()
      .map((row) => row as ControlledApplicability)
      .filter((row) => this.matchesApplicability(row, query));
    const applicabilityBySsi = new Map(
      applicability.map((row) => [row.ssiId, row]),
    );
    const candidates = this.repository
      .list()
      .map((row) => row as ControlledSsi)
      .filter((row) => this.matchesSsi(row, query, applicabilityBySsi))
      .map((row) => {
        const applicability = applicabilityBySsi.get(row.id);
        if (!applicability)
          throw new Error("CONTROLLED_FIXTURE_APPLICABILITY_MISSING");
        return this.toCandidate(row, applicability);
      })
      .sort((left, right) => left.bindingId.localeCompare(right.bindingId))
      .map((row, index) => ({ ...row, priority: (index + 1) * 10 }));
    return {
      fixtureFamily: FIXTURE_FAMILY,
      source: "CANONICAL_DATABASE",
      query,
      count: candidates.length,
      candidates,
    };
  }

  catalogue(): readonly FinControlledFixtureCandidate[] {
    const applicability = this.repository
      .listApplicability()
      .map((row) => row as ControlledApplicability)
      .filter(
        (row) =>
          row.fixtureFamily === FIXTURE_FAMILY && row.status === "ACTIVE",
      );
    const applicabilityBySsi = new Map(
      applicability.map((row) => [row.ssiId, row]),
    );
    return this.repository
      .list()
      .map((row) => row as ControlledSsi)
      .filter(
        (row) =>
          row.fixtureFamily === FIXTURE_FAMILY &&
          row.status === "ACTIVE" &&
          applicabilityBySsi.has(row.id),
      )
      .map((row) => this.toCandidate(row, applicabilityBySsi.get(row.id)!))
      .sort((left, right) => left.bindingId.localeCompare(right.bindingId));
  }

  private validate(query: FinControlledFixtureQuery): void {
    if (
      !/^MT[347]\d{2}$/.test(query.messageType) ||
      !query.currency?.trim() ||
      !query.bookingEntity?.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(query.valueDate)
    )
      throw new BadRequestException({
        code: "CONTROLLED_FIXTURE_CONTEXT_REQUIRED",
      });
  }

  private matchesApplicability(
    row: ControlledApplicability,
    query: FinControlledFixtureQuery,
  ): boolean {
    return (
      row.fixtureFamily === FIXTURE_FAMILY &&
      row.status === "ACTIVE" &&
      row.messageType === query.messageType &&
      (!query.sequence || row.sequence === query.sequence) &&
      row.currency === query.currency &&
      row.validFrom <= query.valueDate &&
      row.validTo >= query.valueDate &&
      (!query.bindingId || row.fixtureBindingId === query.bindingId)
    );
  }

  private matchesSsi(
    row: ControlledSsi,
    query: FinControlledFixtureQuery,
    applicabilityBySsi: ReadonlyMap<string, ControlledApplicability>,
  ): boolean {
    return (
      row.fixtureFamily === FIXTURE_FAMILY &&
      row.status === "ACTIVE" &&
      row.route.bookingEntity === query.bookingEntity &&
      row.route.currency === query.currency &&
      applicabilityBySsi.has(row.id) &&
      (!query.bindingId ||
        row.fixtureBindingId === query.bindingId ||
        (query.includeFixtureGroup === true &&
          row.route.fixtureGroupId === query.bindingId))
    );
  }

  private toCandidate(
    row: ControlledSsi,
    applicability: ControlledApplicability,
  ): FinControlledFixtureCandidate {
    const requiredText = (value: string | undefined, field: string): string => {
      if (!value?.trim())
        throw new Error(`CONTROLLED_FIXTURE_${field}_MISSING`);
      return value;
    };
    const bindingId = requiredText(row.fixtureBindingId, "BINDING_ID");
    const ssiRoles = row.route.roleValues ?? {};
    const transactionRoles = applicability.transactionRoleValues ?? {};
    const roles = { ...ssiRoles, ...transactionRoles };
    const provenance = {
      ...row.route.roleProvenance,
      ...applicability.transactionRoleProvenance,
    };
    const roleEvidence: Readonly<Record<string, Record<string, string>>> =
      Object.fromEntries(
        Object.entries(provenance).map(([role, evidence]) => [
          role,
          {
            ...evidence,
            ownerSide:
              evidence["owner"] === "TRANSACTION_CONTEXT"
                ? "TRANSACTION_PARTY"
                : this.ownerSide(role),
            ...(evidence["sourceId"]
              ? { sourceRecordId: evidence["sourceId"] }
              : {}),
            effectiveFrom: applicability.validFrom,
            effectiveTo: applicability.validTo,
          },
        ]),
      );
    const roleSources: Readonly<Record<string, string>> = Object.fromEntries(
      Object.entries(provenance).flatMap(([role, evidence]) =>
        evidence["sourceType"] ? [[role, evidence["sourceType"]]] : [],
      ),
    );
    return {
      id: row.id,
      version: row.version,
      bindingId,
      fixtureGroupId: row.route.fixtureGroupId ?? bindingId,
      messageType: requiredText(applicability.messageType, "MESSAGE_TYPE"),
      businessFunction: requiredText(
        row.route.businessFunction,
        "BUSINESS_FUNCTION",
      ),
      sequence: requiredText(row.route.sequence, "SEQUENCE"),
      settlementLeg: requiredText(row.route.settlementLeg, "SETTLEMENT_LEG"),
      counterpartyBic: requiredText(
        row.route.counterpartyBic,
        "COUNTERPARTY_BIC",
      ),
      currency: requiredText(row.route.currency, "CURRENCY"),
      bookingEntity: requiredText(row.route.bookingEntity, "BOOKING_ENTITY"),
      effectiveFrom: applicability.validFrom,
      effectiveTo: applicability.validTo,
      priority: 0,
      routeClass: "PRIMARY",
      demoData: true,
      sourceType: "SYNTHETIC_DEMO",
      accountRelationship: "AUTHENTICATED_RECEIVING_ROUTE",
      roleValues: roles,
      ssiRoleValues: ssiRoles,
      transactionRoleValues: transactionRoles,
      roleSources,
      roleEvidence,
      identity: {
        ssi: { id: row.id, version: row.version },
        applicability: {
          id: applicability.id,
          version: applicability.version,
        },
      },
    };
  }

  private ownerSide(role: string): "SENDER_SIDE" | "RECEIVER_SIDE" {
    return [
      "DELIVERY_AGENT",
      "SENDERS_CORRESPONDENT",
      "REIMBURSING_BANK",
    ].includes(role)
      ? "SENDER_SIDE"
      : "RECEIVER_SIDE";
  }
}
