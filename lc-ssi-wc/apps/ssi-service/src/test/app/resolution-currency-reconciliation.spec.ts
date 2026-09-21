import {
  planResolutionCurrencyReconciliation,
  type ResolutionCurrencyCoverageRow,
} from "../../app/resolution-currency-reconciliation";

const row = (
  currency: string,
  status: "ACTIVE" | "INACTIVE" = "ACTIVE",
): ResolutionCurrencyCoverageRow => ({
  standardsRelease: "SR2026",
  businessDomain: "TREASURY",
  currency,
  status,
});

describe("Resolution Currency reconciliation", () => {
  it("approval inserts new pairs but never reactivates or deactivates existing coverage", () => {
    const result = planResolutionCurrencyReconciliation(
      [row("USD"), row("EUR", "INACTIVE")],
      [row("EUR"), row("GBP")],
      "APPROVAL_DISCOVERY",
    );
    expect(result).toEqual({
      insert: [row("GBP")],
      activate: [],
      inactivate: [],
      keep: [row("EUR", "INACTIVE"), row("USD")],
    });
  });

  it("manual Resync reconciles the complete coverage set", () => {
    const result = planResolutionCurrencyReconciliation(
      [row("USD"), row("EUR", "INACTIVE"), row("JPY")],
      [row("EUR"), row("GBP"), row("USD")],
      "FULL_RESYNC",
    );
    expect(result).toEqual({
      insert: [row("GBP")],
      activate: [row("EUR", "INACTIVE")],
      inactivate: [row("JPY")],
      keep: [row("USD")],
    });
  });

  it("does not rewrite unchanged rows on a repeated full Resync", () => {
    const result = planResolutionCurrencyReconciliation(
      [row("EUR"), row("USD")],
      [row("USD"), row("EUR")],
      "FULL_RESYNC",
    );
    expect(result).toEqual({
      insert: [],
      activate: [],
      inactivate: [],
      keep: [row("EUR"), row("USD")],
    });
  });
});
