import { ResolutionDefinitionOptionsService } from "../../../app/page-parameters/resolution-definition-options.service";

describe("ResolutionDefinitionOptionsService", () => {
  const coverage = { activeResolutionCurrencies: jest.fn(() => ["EUR", "USD"]) };
  const entities = { activeBookingEntities: jest.fn(() => [
    { value: "HK01", label: "HK01 — Hong Kong Branch" },
  ]) };
  const policy = { defaultFor: jest.fn(() => ({ currency: "USD", bookingEntity: "HK01" })) };

  it("reads controlled support and explicit valid defaults without runtime SSI candidates", () => {
    const source = new ResolutionDefinitionOptionsService(coverage as never, entities as never, policy as never);
    expect(source.payment("MT202", "2026-09-21")).toEqual({
      currencies: ["EUR", "USD"],
      bookingEntities: [{ value: "HK01", label: "HK01 — Hong Kong Branch" }],
      defaultCurrency: "USD",
      defaultBookingEntity: "HK01",
    });
    expect(coverage.activeResolutionCurrencies).toHaveBeenCalledWith("SR2026", "PAYMENT");
    expect(entities.activeBookingEntities).toHaveBeenCalledWith("2026-09-21");
  });

  it("omits a configured default when it is not in controlled options", () => {
    policy.defaultFor.mockReturnValueOnce({ currency: "JPY", bookingEntity: "ZZ99" });
    const source = new ResolutionDefinitionOptionsService(coverage as never, entities as never, policy as never);
    expect(source.payment("MT202", "2026-09-21")).toEqual({
      currencies: ["EUR", "USD"],
      bookingEntities: [{ value: "HK01", label: "HK01 — Hong Kong Branch" }],
    });
  });

  it("returns domain currencies with a valid configured default", () => {
    policy.defaultFor.mockReturnValueOnce({ currency: "EUR" });
    const source = new ResolutionDefinitionOptionsService(coverage as never, entities as never, policy as never);
    expect(source.currencies("TREASURY", "MT300")).toEqual({
      currencies: ["EUR", "USD"],
      defaultCurrency: "EUR",
    });
  });

  it("omits an absent or unsupported domain currency default", () => {
    policy.defaultFor
      .mockReturnValueOnce({ currency: "JPY" })
      .mockReturnValueOnce({ currency: "" });
    const source = new ResolutionDefinitionOptionsService(coverage as never, entities as never, policy as never);
    expect(source.currencies("TRADE_FINANCE", "MT700")).toEqual({
      currencies: ["EUR", "USD"],
    });
    expect(source.currencies("PAYMENT", "MT202")).toEqual({
      currencies: ["EUR", "USD"],
    });
  });
});
