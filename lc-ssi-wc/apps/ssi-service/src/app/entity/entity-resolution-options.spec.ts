import { EntityRepository, type EntityRecord } from "./entity.repository";

describe("controlled Booking Entity resolution options", () => {
  const oldPath = process.env["SSI_DATABASE_PATH"];
  let repository: EntityRepository;
  beforeEach(() => {
    process.env["SSI_DATABASE_PATH"] = ":memory:";
    repository = new EntityRepository();
  });
  afterEach(() => {
    repository.onModuleDestroy();
    if (oldPath === undefined) delete process.env["SSI_DATABASE_PATH"];
    else process.env["SSI_DATABASE_PATH"] = oldPath;
  });

  it("reads only active effective Entity references without SSI", () => {
    const make = (id: string, branchCode: string, status: string, validTo: string): EntityRecord => ({
      id, branchCode, branchName: `${branchCode} Branch`,
      legalEntityCode: id, legalEntityName: id, countryCode: "HK",
      validFrom: "2026-01-01", validTo, maker: "maker", status,
      version: 1, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    });
    repository.save(make("E1", "HK01", "ACTIVE", "2027-01-01"), "APPROVE", "checker", "ENTITY");
    repository.save(make("E2", "US01", "INACTIVE", "2027-01-01"), "APPROVE", "checker", "ENTITY");
    repository.save(make("E3", "GB01", "ACTIVE", "2026-01-31"), "APPROVE", "checker", "ENTITY");
    expect(repository.activeBookingEntities("2026-09-15"))
      .toEqual([{ value: "HK01", label: "HK01 — HK01 Branch" }]);
  });
});
