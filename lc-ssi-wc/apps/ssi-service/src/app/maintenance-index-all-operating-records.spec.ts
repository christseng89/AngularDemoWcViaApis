import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EntityRepository,
  type EntityRecord,
} from "./entity/entity.repository";
import {
  NostroRepository,
  type NostroRecord,
} from "./nostro/nostro.repository";
import { RmaRepository, type RmaRecord } from "./rma/rma.repository";
import { SqliteSsiRepository, type SsiRecord } from "./sqlite-ssi.repository";

const now = "2026-09-18T00:00:00.000Z";
const operatingStatuses = ["ACTIVE", "SUPPRESSED"];

describe("maintenance index ALL operating-record denominator", () => {
  const originalDatabasePath = process.env["SSI_DATABASE_PATH"];
  let temporaryDirectory = "";
  let repositories: Array<{ onModuleDestroy(): void }> = [];
  const track = <T extends { onModuleDestroy(): void }>(repository: T): T => {
    repositories.push(repository);
    return repository;
  };

  beforeEach(() => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), "maintenance-all-test-"));
    process.env["SSI_DATABASE_PATH"] = join(temporaryDirectory, "test.sqlite");
    repositories = [];
  });

  afterEach(() => {
    for (const repository of repositories) repository.onModuleDestroy();
    if (originalDatabasePath === undefined)
      delete process.env["SSI_DATABASE_PATH"];
    else process.env["SSI_DATABASE_PATH"] = originalDatabasePath;
    rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  it("pages and searches Entity ALL as ACTIVE plus SUPPRESSED only", () => {
    const repository = track(new EntityRepository());
    const base: EntityRecord = {
      id: "ENTITY-ACTIVE-MATCH",
      branchCode: "HK01",
      branchName: "MATCH ACTIVE",
      legalEntityCode: "LE-HK",
      legalEntityName: "Demo Legal Entity",
      countryCode: "HK",
      validFrom: "2026-01-01",
      validTo: "2027-12-31",
      maker: "maker.test",
      status: "ACTIVE",
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    for (const [status, id] of [
      ["ACTIVE", "ENTITY-ACTIVE-MATCH"],
      ["SUPPRESSED", "ENTITY-SUPPRESSED-MATCH"],
      ["DRAFT", "ENTITY-DRAFT-MATCH"],
      ["WIP", "ENTITY-WIP-MATCH"],
      ["PENDING_APPROVAL", "ENTITY-PENDING-MATCH"],
      ["APPROVED", "ENTITY-APPROVED-MATCH"],
      ["REVOKED", "ENTITY-REVOKED-MATCH"],
      ["SUPERSEDED", "ENTITY-SUPERSEDED-MATCH"],
    ] as const)
      repository.save({ ...base, id, status }, "CREATED", base.maker, "ENTITY");

    const first = repository.listPage({
      page: 1,
      pageSize: 1,
      search: "MATCH",
    });
    const second = repository.listPage({
      status: "ALL",
      page: 2,
      pageSize: 1,
      search: "MATCH",
    });
    expect(first).toMatchObject({
      totalItems: 2,
      totalPages: 2,
      hasNext: true,
    });
    expect(second).toMatchObject({
      totalItems: 2,
      totalPages: 2,
      hasPrevious: true,
      hasNext: false,
    });
    expect(
      [...first.items, ...second.items].map((row) => row.status).sort(),
    ).toEqual(operatingStatuses);
  });

  it("pages and searches Nostro ALL as ACTIVE plus SUPPRESSED only", () => {
    const repository = track(new NostroRepository());
    const base: NostroRecord = {
      id: "NOSTRO-ACTIVE-MATCH",
      ownLegalEntityId: "HK01",
      accountServicerBic: "DBSSSGSG",
      currency: "SGD",
      maskedAccountRef: "MATCH-***-001",
      purpose: "MATCH",
      priority: 1,
      validFrom: "2026-01-01",
      validTo: "2027-12-31",
      maker: "maker.test",
      status: "ACTIVE",
      version: 1,
      source: "SYNTHETIC_DEMO",
      createdAt: now,
      updatedAt: now,
    };
    for (const [status, id] of [
      ["ACTIVE", "NOSTRO-ACTIVE-MATCH"],
      ["SUPPRESSED", "NOSTRO-SUPPRESSED-MATCH"],
      ["DRAFT", "NOSTRO-DRAFT-MATCH"],
      ["REVOKED", "NOSTRO-REVOKED-MATCH"],
      ["SUPERSEDED", "NOSTRO-SUPERSEDED-MATCH"],
    ] as const)
      repository.save({ ...base, id, status }, "CREATED", base.maker, "NOSTRO");

    const page = repository.listPage({
      status: "ALL",
      page: 1,
      pageSize: 1,
      search: "MATCH",
    });
    expect(page).toMatchObject({ totalItems: 2, totalPages: 2, hasNext: true });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.status).toMatch(/^(ACTIVE|SUPPRESSED)$/);
  });

  it("groups RMA ALL by business identity and operating status only", () => {
    const repository = track(new RmaRepository());
    const base: RmaRecord = {
      id: "RMA-ACTIVE-FIN-MATCH",
      ownBic: "DEMOHKHH",
      counterpartyBic: "MATCHUS33",
      service: "FIN",
      direction: "OUTBOUND",
      messageTypes: ["MT320"],
      validFrom: "2026-01-01",
      validTo: "2027-12-31",
      maker: "maker.test",
      status: "ACTIVE",
      version: 1,
      source: "SYNTHETIC_DEMO",
      createdAt: now,
      updatedAt: now,
    };
    repository.save(base, "CREATED", base.maker, "RMA");
    repository.save(
      {
        ...base,
        id: "RMA-ACTIVE-FINPLUS-MATCH",
        service: "FINPLUS",
        messageTypes: ["pacs.009.001.08"],
      },
      "CREATED",
      base.maker,
      "RMA",
    );
    for (const status of [
      "SUPPRESSED",
      "DRAFT",
      "REVOKED",
      "SUPERSEDED",
    ] as const)
      repository.save(
        { ...base, id: `RMA-${status}-MATCH`, status },
        "CREATED",
        base.maker,
        "RMA",
      );

    const first = repository.listIndexPage({
      status: "ALL",
      page: 1,
      pageSize: 1,
      search: "MATCH",
    });
    const second = repository.listIndexPage({
      page: 2,
      pageSize: 1,
      search: "MATCH",
    });
    expect(first).toMatchObject({
      totalItems: 2,
      totalPages: 2,
      hasNext: true,
    });
    expect(second).toMatchObject({
      totalItems: 2,
      totalPages: 2,
      hasNext: false,
    });
    const items = [...first.items, ...second.items];
    expect(items.map((row) => row.status).sort()).toEqual(operatingStatuses);
    expect(items.find((row) => row.status === "ACTIVE")).toEqual(
      expect.objectContaining({
        service: "FIN / FINPLUS",
        messageTypes: ["MT320", "pacs.009.001.08"],
      }),
    );
  });

  it("scopes SSI ALL independently for OWN and COUNTERPARTY", () => {
    const repository = track(new SqliteSsiRepository());
    const base: SsiRecord = {
      id: "SSI-OWN-ACTIVE-MATCH",
      counterpartyId: "ANY",
      ownershipType: "OWN",
      ownerParty: "HK01",
      scope: "STANDING",
      maker: "maker.test",
      status: "ACTIVE",
      version: 1,
      route: {
        bookingEntity: "HK01",
        counterpartyBic: "ANY",
        accountWithBic: "DBSSSGSG",
        currency: "SGD",
        accountId: "MATCH-SSI",
      },
      createdAt: now,
      updatedAt: now,
    };
    for (const [ownershipType, counterpartyId] of [
      ["OWN", "ANY"],
      ["COUNTERPARTY", "MATCHUS33"],
    ] as const)
      for (const status of [
        "ACTIVE",
        "SUPPRESSED",
        "DRAFT",
        "REVOKED",
        "SUPERSEDED",
      ] as const)
        repository.save(
          {
            ...base,
            id: `SSI-${ownershipType}-${status}-MATCH`,
            ownershipType,
            counterpartyId,
            status,
            route: { ...base.route, counterpartyBic: counterpartyId },
          },
          "CREATED",
          base.maker,
        );

    for (const ownershipType of ["OWN", "COUNTERPARTY"] as const) {
      const first = repository.listPage({
        status: "ALL",
        ownershipType,
        page: 1,
        pageSize: 1,
        search: "MATCH",
      });
      const second = repository.listPage({
        ownershipType,
        page: 2,
        pageSize: 1,
        search: "MATCH",
      });
      expect(first).toMatchObject({
        totalItems: 2,
        totalPages: 2,
        hasNext: true,
      });
      expect(second).toMatchObject({
        totalItems: 2,
        totalPages: 2,
        hasPrevious: true,
        hasNext: false,
      });
      expect(
        [...first.items, ...second.items].map((row) => row.status).sort(),
      ).toEqual(operatingStatuses);
    }
  });
});
