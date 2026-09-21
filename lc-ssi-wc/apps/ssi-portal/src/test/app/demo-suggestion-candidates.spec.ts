import {
  buildDemoSuggestionCandidates,
  DEMO_PARTY_ROUTING_AGENTS,
  DEMO_SETTLEMENT_MARKETS,
  DEMO_SUGGESTION_CURRENCIES,
} from "../../app/demo-suggestion-candidates";

const counterparties = Object.keys(DEMO_PARTY_ROUTING_AGENTS).filter(
  (bic) => bic !== "NSSIUSN1",
);
const noSsiCounterparties = ["NSSIGB2X"] as const;

describe("synthetic SSI suggestion candidate matrix", () => {
  it.each(
    DEMO_SUGGESTION_CURRENCIES.flatMap((currency) =>
      counterparties.map((counterpartyBic) => [currency, counterpartyBic] as const),
    ),
  )("provides three ranked eligible routes for %s/%s", (currency, counterpartyBic) => {
    const candidates = buildDemoSuggestionCandidates({
      messageType: "MT700",
      counterpartyBic,
      currency,
      bookingEntity: "HK01",
      valueDate: "2026-09-08",
      partyRouting: false,
    });
    expect(candidates).toHaveLength(3);
    expect(candidates.map((candidate) => candidate.priority)).toEqual([10, 20, 30]);
    expect(candidates[0]?.settlementMarket).toBe(DEMO_SETTLEMENT_MARKETS[currency]);
    expect(candidates.every((candidate) => candidate.demoData)).toBe(true);
  });

  it("covers the reported MT400 BARCGB22/GBP context and derives direct evidence", () => {
    const candidates = buildDemoSuggestionCandidates({
      messageType: "MT400",
      counterpartyBic: "BARCGB22",
      currency: "GBP",
      bookingEntity: "HK01",
      valueDate: "2026-09-08",
      partyRouting: false,
    });
    expect(candidates).toHaveLength(3);
    expect(candidates[0]?.settlementMarket).toBe("UK_STERLING");
    expect(candidates[2]).toMatchObject({
      accountRelationship: "DIRECT_ACCOUNT",
      directRelationshipEvidenceId: "SYN-DIRECT-BARCGB22-GBP-003",
    });
  });

  it("keeps MT760 party-routing candidates independent of currency", () => {
    const make = (currency: string) =>
      buildDemoSuggestionCandidates({
        messageType: "MT760",
        counterpartyBic: "BARCGB22",
        currency,
        bookingEntity: "HK01",
        valueDate: "2026-09-08",
        partyRouting: true,
      });
    expect(make("USD")).toEqual(make("CNY"));
    expect(make("USD")[0]?.settlementMarket).toBe("TRADE_PARTY_ROUTING");
  });

  it("fails closed for unsupported context", () => {
    const base = {
      messageType: "MT700",
      counterpartyBic: "BARCGB22",
      currency: "USD",
      bookingEntity: "HK01",
      valueDate: "2026-09-08",
      partyRouting: false,
    };
    expect(buildDemoSuggestionCandidates({ ...base, currency: "AUD" })).toEqual([]);
    expect(buildDemoSuggestionCandidates({ ...base, bookingEntity: "XX01" })).toEqual([]);
    expect(buildDemoSuggestionCandidates({ ...base, valueDate: "2028-01-01" })).toEqual([]);
  });

  it.each(
    DEMO_SUGGESTION_CURRENCIES.flatMap((currency) =>
      noSsiCounterparties.map((counterpartyBic) => [currency, counterpartyBic] as const),
    ),
  )("keeps Bank Directory eligible %s/%s at zero SSI coverage", (currency, counterpartyBic) => {
    expect(
      buildDemoSuggestionCandidates({
        messageType: "MT400",
        counterpartyBic,
        currency,
        bookingEntity: "HK01",
        valueDate: "2026-09-08",
        partyRouting: false,
      }),
    ).toEqual([]);
  });

  it.each(noSsiCounterparties)(
    "does not manufacture trade-routing coverage for %s",
    (counterpartyBic) => {
      expect(
        buildDemoSuggestionCandidates({
          messageType: "MT760",
          counterpartyBic,
          currency: "USD",
          bookingEntity: "HK01",
          valueDate: "2026-09-08",
          partyRouting: true,
        }),
      ).toEqual([]);
    },
  );

  it("limits Northstar demo SSI coverage to USD and GBP", () => {
    const resolve = (currency: string) =>
      buildDemoSuggestionCandidates({
        messageType: "MT300",
        counterpartyBic: "NSSIUSN1",
        currency,
        bookingEntity: "HK01",
        valueDate: "2026-09-08",
        partyRouting: false,
      });
    expect(resolve("USD")).toHaveLength(3);
    expect(resolve("GBP")).toHaveLength(3);
    expect(resolve("EUR")).toEqual([]);
  });
});
