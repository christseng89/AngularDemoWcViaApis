import { BadRequestException, Injectable, Optional } from "@nestjs/common";
import {
  SqliteSsiRepository,
  type SsiApplicabilityRecord,
  type SsiRecord,
} from "../sqlite-ssi.repository";
import { BankServiceDirectory } from "../bank-service-directory";
import { PageParameterLookupDefaultsService } from "./page-parameter-lookup-defaults.service";
import { NostroApplicationService } from "../nostro/nostro-application.service";
import { RmaApplicationService } from "../rma/rma-application.service";
import { DatabaseSnapshotIdentityService } from "../database-snapshot-identity.service";

const PAYMENT_MESSAGES = new Set(["MT202", "MT202COV", "MT205", "MT205COV"]);
const PAYMENT_CRITERIA = {
  consumer: "CENTRAL_PAYMENT",
  product: "CENTRAL_PAYMENT",
  businessFunction: "INTERBANK_TRANSFER",
  paymentLeg: "INTERBANK_SETTLEMENT",
  direction: "OUTBOUND",
} as const;

const hasToken = (text: string | undefined, token: string): boolean =>
  (text ?? "").split(",").some((value) => value.trim() === token);

const effective = (from: string, to: string, date: string): boolean =>
  from <= date && date <= to;

const applicable = (row: SsiApplicabilityRecord, date: string): boolean =>
  row.status === "ACTIVE" &&
  effective(row.validFrom, row.validTo, date) &&
  Object.entries(PAYMENT_CRITERIA).every(
    ([key, expected]) =>
      row[key as keyof typeof PAYMENT_CRITERIA] === expected ||
      row[key as keyof typeof PAYMENT_CRITERIA] === "ANY",
  );

export interface PaymentApplicabilityQuery {
  readonly messageType: string;
  readonly valueDate: string;
  readonly currency?: string;
  readonly bookingEntity?: string;
  readonly fixtureBindingId?: string;
}

export interface PaymentAtomicRouteCandidate {
  readonly ssi: SsiRecord;
  readonly applicability: SsiApplicabilityRecord;
  readonly nostro: {
    readonly id: string;
    readonly version: number;
    readonly accountServicerBic: string;
  };
  readonly rma: { readonly id: string; readonly version: number };
  readonly snapshot: { readonly sha256: string; readonly method: string };
}

@Injectable()
export class PaymentGovernedApplicabilityService {
  constructor(
    private readonly repository: SqliteSsiRepository,
    @Optional() private readonly defaults?: PageParameterLookupDefaultsService,
    @Optional() private readonly directory?: BankServiceDirectory,
    @Optional() private readonly nostros?: NostroApplicationService,
    @Optional() private readonly rma?: RmaApplicationService,
    @Optional() private readonly snapshots?: DatabaseSnapshotIdentityService,
  ) {}

  atomicCandidates(
    query: PaymentApplicabilityQuery,
  ): readonly PaymentAtomicRouteCandidate[] {
    if (
      !this.nostros ||
      !this.rma ||
      !this.snapshots ||
      typeof this.repository.findPaymentCandidateBindings !== "function"
    )
      return [];
    const snapshot = this.snapshots.current();
    const businessService = query.messageType.endsWith("COV")
      ? "swift.cbprplus.cov.04"
      : "swift.cbprplus.04";
    const bindings = this.repository.findPaymentCandidateBindings({
      sourceMessageType: query.messageType,
      messageType: "pacs.009.001.08",
      valueDate: query.valueDate,
      ...(query.currency ? { currency: query.currency } : {}),
      ...(query.bookingEntity ? { bookingEntity: query.bookingEntity } : {}),
      ...(query.fixtureBindingId
        ? { fixtureBindingId: query.fixtureBindingId }
        : {}),
    });
    const candidates = bindings.flatMap(({ ssi, applicability }) => {
      const route = ssi.route;
      const configuredOwnBic = process.env["OWN_BIC"]?.trim().toUpperCase() ?? "";
      const routeSenderBic = route["senderBic"]?.trim().toUpperCase() ?? "";
      const canonicalBic = (bic: string): string =>
        bic.length === 8 ? `${bic}XXX` : bic;
      if (
        configuredOwnBic &&
        routeSenderBic &&
        canonicalBic(configuredOwnBic) !== canonicalBic(routeSenderBic)
      ) {
        throw new BadRequestException("OWN_BIC_ROUTE_MISMATCH");
      }
      const nostro = this.nostros!.resolve({
        ...(query.bookingEntity
          ? { ownLegalEntityId: query.bookingEntity }
          : {}),
        accountReference: route["accountId"] ?? "",
        accountServicerBic: route["accountWithBic"] ?? "",
        currency: query.currency ?? "",
        purpose: "SETTLEMENT",
        at: query.valueDate,
        ...(ssi.fixtureFamily ? { fixtureFamily: ssi.fixtureFamily } : {}),
        ...(query.fixtureBindingId
          ? { fixtureBindingId: query.fixtureBindingId }
          : {}),
      }) as Record<string, unknown>;
      const rma = this.rma!.check({
        ownBic: configuredOwnBic || routeSenderBic,
        counterpartyBic:
          route["actualReceiverBic"] ?? route["accountWithBic"] ?? "",
        service: route["messagingService"] ?? businessService,
        direction: "OUTBOUND",
        messageType:
          (route["messagingService"] ?? businessService) === "FINPLUS" ||
          businessService.startsWith("swift.cbprplus")
            ? "pacs.009.001.08"
            : query.messageType,
        at: query.valueDate,
        operationalOnly: true,
      }) as unknown as Record<string, unknown>;
      const accountServicerBic = nostro["accountServicerBic"];
      return nostro["decision"] === "RESOLVED" &&
        typeof nostro["nostroId"] === "string" &&
        typeof nostro["nostroVersion"] === "number" &&
        rma["authorised"] === true &&
        typeof rma["rmaId"] === "string" &&
        typeof rma["rmaVersion"] === "number"
        ? [
            {
              ssi,
              applicability,
              nostro: {
                id: nostro["nostroId"],
                version: nostro["nostroVersion"],
                accountServicerBic:
                  typeof accountServicerBic === "string"
                    ? accountServicerBic
                    : "",
              },
              rma: { id: rma["rmaId"], version: rma["rmaVersion"] },
              snapshot,
            },
          ]
        : [];
    });
    const after = this.snapshots.current();
    return after.sha256 === snapshot.sha256 ? candidates : [];
  }

  candidates(query: PaymentApplicabilityQuery): readonly SsiRecord[] {
    if (!PAYMENT_MESSAGES.has(query.messageType)) return [];
    if (typeof this.repository.findPaymentCandidates === "function")
      return this.repository.findPaymentCandidates({
        sourceMessageType: query.messageType,
        messageType: "pacs.009.001.08",
        valueDate: query.valueDate,
        ...(query.currency ? { currency: query.currency } : {}),
        ...(query.bookingEntity ? { bookingEntity: query.bookingEntity } : {}),
        ...(query.fixtureBindingId
          ? { fixtureBindingId: query.fixtureBindingId }
          : {}),
      });
    const eligibleSsiIds = new Set(
      this.repository
        .listApplicability()
        .filter((row) => applicable(row, query.valueDate))
        .map(({ ssiId }) => ssiId),
    );
    return this.repository.list().filter((row) => {
      const route = row.route;
      return (
        row.status === "ACTIVE" &&
        eligibleSsiIds.has(row.id) &&
        hasToken(route["sourceMessageTypes"], query.messageType) &&
        hasToken(route["messageTypes"], "pacs.009.001.08") &&
        Boolean(route["currency"]?.trim()) &&
        Boolean(route["bookingEntity"]?.trim()) &&
        effective(
          route["validFrom"] ?? "",
          route["validTo"] ?? "",
          query.valueDate,
        ) &&
        (!query.currency || route["currency"] === query.currency) &&
        (!query.bookingEntity || route["bookingEntity"] === query.bookingEntity)
      );
    });
  }

  options(
    messageType: string,
    valueDate: string,
  ): {
    readonly currencies: readonly string[];
    readonly bookingEntities: readonly string[];
    readonly defaultCurrency?: string;
    readonly defaultBookingEntity?: string;
  } {
    const candidates = this.candidates({ messageType, valueDate });
    const governedDefault = candidates.find(({ route }) => {
      const policy = this.defaults?.find({
        scenarioId: "PAGE_DEFAULT",
        messageType,
        sequence: "A",
        currency: route["currency"]!,
        bookingEntity: route["bookingEntity"]!,
        polarity: "POSITIVE",
        expectedHttp: [200],
      });
      if (!policy || !this.directory) return false;
      return (
        this.directory.resolve(policy.defaultBankServiceId).bic ===
        route["counterpartyBic"]
      );
    });
    return {
      currencies: [
        ...new Set(candidates.map(({ route }) => route["currency"]!)),
      ].sort((left, right) => left.localeCompare(right)),
      bookingEntities: [
        ...new Set(candidates.map(({ route }) => route["bookingEntity"]!)),
      ].sort((left, right) => left.localeCompare(right)),
      ...(governedDefault
        ? {
            defaultCurrency: governedDefault.route["currency"],
            defaultBookingEntity: governedDefault.route["bookingEntity"],
          }
        : {}),
    };
  }
}
