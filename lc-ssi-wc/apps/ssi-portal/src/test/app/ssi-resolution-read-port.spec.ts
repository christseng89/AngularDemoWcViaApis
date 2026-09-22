import "@angular/compiler";
import { Injector, runInInjectionContext } from "@angular/core";
import {
  SSI_RESOLUTION_READ_PORT,
  SsiResolutionReadStore,
} from "../../app/ssi-resolution-read-port";

describe("SSI read projection port", () => {
  it("starts empty without constructing a Maintenance facade", () => {
    const store = new SsiResolutionReadStore();
    expect(store.settlementSsis()).toEqual([]);
    expect(store.counterparties()).toEqual([]);
  });

  it("publishes immutable narrow snapshots for Payment/FIN readers", () => {
    const store = new SsiResolutionReadStore();
    store.publishSettlementSsis([
      {
        status: "ACTIVE",
        counterpartyId: "BANK-1",
        counterpartyBic: "BANKHKHH",
        counterpartyType: "BANK",
        currency: "USD",
        messageTypes: "MT202",
        applicability: [],
      },
    ]);
    expect(store.settlementSsis()).toEqual([
      expect.objectContaining({ currency: "USD" }),
    ]);
    store.publishCounterparties([
      {
        counterpartyId: "CUST-1",
        partyType: "CUSTOMER",
        country: "HK",
        name: "Customer One",
      },
    ]);
    expect(store.counterparties()).toEqual([
      expect.objectContaining({ counterpartyId: "CUST-1" }),
    ]);
  });

  it("resolves the root read port factory to the shared store", () => {
    const store = new SsiResolutionReadStore();
    const injector = Injector.create({
      providers: [{ provide: SsiResolutionReadStore, useValue: store }],
    });
    const factory = (
      SSI_RESOLUTION_READ_PORT as unknown as {
        ɵprov: { factory: () => SsiResolutionReadStore };
      }
    ).ɵprov.factory;
    expect(runInInjectionContext(injector, factory)).toBe(store);
  });
});
