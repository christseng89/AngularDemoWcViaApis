import { SsiApplicationService } from "./ssi-application.service";
import type { SqliteSsiRepository, SsiRecord } from "./sqlite-ssi.repository";
import type { RmaApplicationService } from "./rma/rma-application.service";
import type { NostroApplicationService } from "./nostro/nostro-application.service";
import { PaymentMessageIndexService } from "./payment-message-index.service";

const base = (id: string, route: Record<string, string>): SsiRecord => ({
  id,
  counterpartyId: id,
  scope: "STANDING",
  maker: "maker.demo",
  status: "ACTIVE",
  version: 1,
  route,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-09-08T00:00:00Z",
});

describe("SSI ownership index projection", () => {
  it("returns explicit, mutually exclusive OWN and COUNTERPARTY ownership", () => {
    const records = [
      base("OWN-USD", {
        counterpartyBic: "ANY",
        bookingEntity: "HK01",
        currency: "USD",
      }),
      base("CP-BARC", { counterpartyBic: "BARCGB22", currency: "GBP" }),
    ];
    const repository = {
      list: () => records,
      listApplicability: () => [],
    } as unknown as SqliteSsiRepository;
    const service = new SsiApplicationService(
      repository,
      {} as RmaApplicationService,
      {} as NostroApplicationService,
      new PaymentMessageIndexService(),
    );

    const result = service.list();
    expect(
      result.map(({ id, ownershipType, ownerParty, publisherParty }) => ({
        id,
        ownershipType,
        ownerParty,
        publisherParty,
      })),
    ).toEqual([
      {
        id: "OWN-USD",
        ownershipType: "OWN",
        ownerParty: "HK01",
        publisherParty: "HK01",
      },
      {
        id: "CP-BARC",
        ownershipType: "COUNTERPARTY",
        ownerParty: "BARCGB22",
        publisherParty: "BARCGB22",
      },
    ]);
    expect(result.filter((row) => row.ownershipType === "OWN")).toHaveLength(1);
    expect(
      result.filter((row) => row.ownershipType === "COUNTERPARTY"),
    ).toHaveLength(1);
  });
});
