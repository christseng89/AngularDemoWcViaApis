import { ResolutionCurrencyCoveragePolicy } from "../../app/resolution-currency-policy";

describe("ResolutionCurrencyCoveragePolicy", () => {
  it("loads the pinned controlled SR2026 discovery date", () => {
    expect(new ResolutionCurrencyCoveragePolicy().asOfDate).toBe("2026-09-15");
  });

  it("provides explicit Payment defaults rather than deriving first SSI or Entity", () => {
    expect(new ResolutionCurrencyCoveragePolicy().defaultFor("PAYMENT", "MT202"))
      .toEqual({ currency: "USD", bookingEntity: "HK01" });
  });
});
