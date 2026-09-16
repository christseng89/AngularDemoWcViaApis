export { readonlyFormFields } from "./readonly-form-fields";

export interface SsiFormSource {
  readonly maker: string;
  readonly counterpartyId: string;
  readonly scope: string;
  readonly route: Readonly<Record<string, string>>;
  readonly ownerParty?: string;
  readonly publisherParty?: string;
}

export function ssiFormModel(
  row: SsiFormSource,
  ownershipType: "OWN" | "COUNTERPARTY",
): Record<string, unknown> {
  const isAnyApprovedBank = row.route["counterpartyBic"] === "ANY";
  return {
    maker: row.maker,
    counterpartyId: isAnyApprovedBank ? "ANY" : row.counterpartyId,
    scope: row.scope,
    ownershipType,
    ownerParty: row.ownerParty,
    publisherParty: row.publisherParty,
    route: {
      ...row.route,
      counterpartyType: isAnyApprovedBank
        ? "ANY_BANK"
        : (row.route["counterpartyType"] ?? "BANK"),
    },
  };
}
