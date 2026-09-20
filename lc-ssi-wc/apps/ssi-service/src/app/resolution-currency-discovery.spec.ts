import { ResolutionCurrencyCoverageDiscoveryService } from "./resolution-currency-discovery";

describe("ResolutionCurrencyCoverageDiscoveryService", () => {
  const financeProfiles = {
    coverageProfiles: jest.fn(() => [
      { businessDomain: "TREASURY", messageType: "MT300", businessFunction: "FX" },
      { businessDomain: "TRADE_FINANCE", messageType: "MT400", businessFunction: "LC" },
    ]),
  };
  const paymentProfiles = {
    coverageProfiles: jest.fn(() => [
      { messageType: "MT202", businessService: "swift.cbprplus.02" },
    ]),
  };
  const repository = {
    findResolutionCurrencyCoverage: jest.fn((query: { consumer: string }) =>
      query.consumer === "TREASURY" ? ["USD", "EUR"] : ["EUR"],
    ),
    findPaymentResolutionCurrencies: jest.fn(() => ["USD"]),
  };

  beforeEach(() => jest.clearAllMocks());

  it("uses governed profiles and one typed rule for complete and single-SSI discovery", () => {
    const discovery = new ResolutionCurrencyCoverageDiscoveryService(
      financeProfiles as never,
      paymentProfiles as never,
      repository as never,
    );
    const result = discovery.discover("2026-09-20", "SSI-1");
    expect(result.complete).toBe(true);
    expect(result.pairs).toEqual([
      { standardsRelease: "SR2026", businessDomain: "PAYMENT", currency: "USD" },
      { standardsRelease: "SR2026", businessDomain: "TRADE_FINANCE", currency: "EUR" },
      { standardsRelease: "SR2026", businessDomain: "TREASURY", currency: "EUR" },
      { standardsRelease: "SR2026", businessDomain: "TREASURY", currency: "USD" },
    ]);
    expect(repository.findResolutionCurrencyCoverage).toHaveBeenCalledWith(
      expect.objectContaining({ consumer: "TREASURY", ssiId: "SSI-1" }),
    );
    expect(repository.findPaymentResolutionCurrencies).toHaveBeenCalledWith(
      expect.objectContaining({ sourceMessageType: "MT202", ssiId: "SSI-1" }),
    );
  });

  it("fails the whole discovery rather than returning partial coverage", () => {
    repository.findResolutionCurrencyCoverage.mockImplementationOnce(() => {
      throw new Error("DB_UNAVAILABLE");
    });
    const discovery = new ResolutionCurrencyCoverageDiscoveryService(
      financeProfiles as never,
      paymentProfiles as never,
      repository as never,
    );
    expect(() => discovery.discover("2026-09-20")).toThrow("DB_UNAVAILABLE");
  });

  it("rejects a syntactically valid but impossible as-of date", () => {
    const discovery = new ResolutionCurrencyCoverageDiscoveryService(
      financeProfiles as never, paymentProfiles as never, repository as never,
    );
    expect(() => discovery.discover("2026-02-30")).toThrow("RESOLUTION_CURRENCY_INVALID_AS_OF_DATE");
  });
});
