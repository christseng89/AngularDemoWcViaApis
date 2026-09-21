import { SsiResolutionReadStore } from "../../app/ssi-resolution-read-port";

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
});
