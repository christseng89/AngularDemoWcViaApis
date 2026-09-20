import { ResolutionDefinitionOptionsService } from "./resolution-definition-options.service";

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
});
