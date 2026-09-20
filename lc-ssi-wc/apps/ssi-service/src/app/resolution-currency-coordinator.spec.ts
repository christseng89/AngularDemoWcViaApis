import { ResolutionCurrencyCoverageCoordinator } from "./resolution-currency-coordinator";

describe("ResolutionCurrencyCoverageCoordinator", () => {
  const pairs = [{ standardsRelease: "SR2026", businessDomain: "PAYMENT", currency: "USD" }];
  const repository = {
    bootstrapResolutionCurrencyCoverage: jest.fn((discover: () => unknown) => discover()),
    resyncResolutionCurrencyCoverage: jest.fn((discover: () => unknown) => {
      discover(); return { inserted: 1, activated: 0, inactivated: 0 };
    }),
    insertApprovedResolutionCurrencies: jest.fn(() => ({ inserted: 1, activated: 0, inactivated: 0 })),
    resolutionCurrencyInquiry: jest.fn(() => []),
  };
  const discovery = { discover: jest.fn(() => ({ complete: true, pairs })) };
  const policy = { asOfDate: "2026-09-15" };
  beforeEach(() => jest.clearAllMocks());

  it("uses the same governed discovery for bootstrap and manual resync", () => {
    const coordinator = new ResolutionCurrencyCoverageCoordinator(
      repository as never, discovery as never, policy as never,
    );
    coordinator.onModuleInit();
    coordinator.resync();
    expect(discovery.discover).toHaveBeenNthCalledWith(1, "2026-09-15");
    expect(discovery.discover).toHaveBeenNthCalledWith(2, "2026-09-15");
    expect(repository.bootstrapResolutionCurrencyCoverage).toHaveBeenCalledTimes(1);
    expect(repository.resyncResolutionCurrencyCoverage).toHaveBeenCalledTimes(1);
  });

  it("scopes approval discovery to exactly the newly approved SSI", () => {
    const coordinator = new ResolutionCurrencyCoverageCoordinator(
      repository as never, discovery as never, policy as never,
    );
    coordinator.discoverApproved("SSI-1");
    expect(discovery.discover).toHaveBeenCalledWith("2026-09-15", "SSI-1");
    expect(repository.insertApprovedResolutionCurrencies).toHaveBeenCalledWith(pairs, "2026-09-15");
  });

  it("invalidates Index and Definition only after committed coverage changes", () => {
    const aggregate = { invalidate: jest.fn() };
    const coordinator = new ResolutionCurrencyCoverageCoordinator(
      repository as never, discovery as never, policy as never, aggregate as never,
    );
    const pending = coordinator.discoverApproved("SSI-1");
    expect(aggregate.invalidate).not.toHaveBeenCalled();
    coordinator.invalidateAfterCommit(pending);
    expect(aggregate.invalidate).toHaveBeenCalledTimes(1);
    repository.resyncResolutionCurrencyCoverage.mockReturnValueOnce({ inserted: 0, activated: 0, inactivated: 0 });
    coordinator.resync();
    expect(aggregate.invalidate).toHaveBeenCalledTimes(1);
    coordinator.resync();
    expect(aggregate.invalidate).toHaveBeenCalledTimes(2);
  });
});
