import type { SsiRow } from "../ssi-maintenance.types";
import type { SsiCounterpartyReference } from "./ssi-reference.types";

/** The read-only SSI fields currently required by Payment/FIN resolution. */
export interface SettlementSsiProjection {
  readonly status: string;
  readonly counterpartyId: string;
  readonly counterpartyBic: string;
  readonly counterpartyType: string;
  readonly currency: string;
  readonly messageTypes: string;
  readonly applicability: readonly {
    readonly status: string;
    readonly consumer: string;
    readonly product: string;
    readonly businessFunction: string;
    readonly paymentLeg: string;
    readonly direction: string;
  }[];
}

/** Customer identity fields currently required by Payment/FIN resolution. */
export interface ResolutionCounterpartyProjection {
  readonly counterpartyId: string;
  readonly partyType: "BANK" | "CUSTOMER";
  readonly country: string;
  readonly name: string;
  readonly beneficiaryAccountReference?: string;
  readonly address?: string;
}

export function projectSettlementSsis(
  rows: readonly SsiRow[],
): readonly SettlementSsiProjection[] {
  return rows.map((row) => ({
    status: row.status,
    counterpartyId: row.counterpartyId,
    counterpartyBic: row.route["counterpartyBic"] ?? "",
    counterpartyType: row.route["counterpartyType"] ?? "BANK",
    currency: row.route["currency"] ?? "",
    messageTypes: row.route["messageTypes"] ?? "",
    applicability: (row.applicability ?? []).map((item) => ({
      status: item.status,
      consumer: item.consumer,
      product: item.product,
      businessFunction: item.businessFunction,
      paymentLeg: item.paymentLeg,
      direction: item.direction,
    })),
  }));
}

export function projectResolutionCounterparties(
  counterparties: readonly SsiCounterpartyReference[],
): readonly ResolutionCounterpartyProjection[] {
  return counterparties.map((party) => ({
    counterpartyId: party.counterpartyId,
    partyType: party.partyType,
    country: party.country,
    name: party.name,
    ...(party.beneficiaryAccountReference
      ? { beneficiaryAccountReference: party.beneficiaryAccountReference }
      : {}),
    ...(party.address ? { address: party.address } : {}),
  }));
}
