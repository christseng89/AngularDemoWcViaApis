import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  revisionWipCutoffAt,
  revisionWipExpiresAt,
  SqliteGovernedRepository,
} from "./shared/sqlite-governed.repository";
import {
  SqliteSsiRepository,
  type SsiApplicabilityInput,
  type SsiRecord,
} from "./sqlite-ssi.repository";
import {
  NostroRepository,
  type NostroRecord,
} from "./nostro/nostro.repository";
import { RmaRepository, type RmaRecord } from "./rma/rma.repository";

interface TestRecord {
  id: string;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  value: string;
}

class TestGovernedRepository extends SqliteGovernedRepository<TestRecord> {
  constructor() {
    super("test_record", "test_record_audit");
  }
}

describe("SQLite governed repositories", () => {
  const originalDatabasePath = process.env["SSI_DATABASE_PATH"];
  let temporaryDirectory = "";

  beforeEach(() => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), "ssi-repository-test-"));
    process.env["SSI_DATABASE_PATH"] = join(temporaryDirectory, "test.sqlite");
  });

  it("defaults WIP TTL to 30 minutes and honors an explicit governed override", () => {
    const originalTtl = process.env["REVISION_WIP_TTL_MINUTES"];
    try {
      const now = new Date("2026-09-16T12:00:00.000Z");
      delete process.env["REVISION_WIP_TTL_MINUTES"];
      expect(revisionWipExpiresAt(now)).toBe("2026-09-16T12:30:00.000Z");
      expect(revisionWipCutoffAt(now)).toBe("2026-09-16T11:30:00.000Z");

      process.env["REVISION_WIP_TTL_MINUTES"] = "5";
      expect(revisionWipExpiresAt(now)).toBe("2026-09-16T12:05:00.000Z");
      expect(revisionWipCutoffAt(now)).toBe("2026-09-16T11:55:00.000Z");
    } finally {
      if (originalTtl === undefined)
        delete process.env["REVISION_WIP_TTL_MINUTES"];
      else process.env["REVISION_WIP_TTL_MINUTES"] = originalTtl;
    }
  });

  afterEach(() => {
    if (originalDatabasePath === undefined)
      delete process.env["SSI_DATABASE_PATH"];
    else process.env["SSI_DATABASE_PATH"] = originalDatabasePath;
    rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  it("persists, finds, lists and audits a generic governed record", () => {
    const repository = new TestGovernedRepository();
    const record: TestRecord = {
      id: "RECORD-1",
      status: "ACTIVE",
      version: 1,
      createdAt: "2026-09-11T00:00:00.000Z",
      updatedAt: "2026-09-11T00:00:00.000Z",
      value: "governed",
    };

    repository.save(record, "CREATED", "maker.test", "TEST_RECORD");

    expect(repository.find(record.id)).toEqual(record);
    expect(repository.find("MISSING")).toBeUndefined();
    expect(repository.list()).toEqual([
      { ...record, currentStatus: "EMPTY", hasOpenRevision: false },
    ]);
    expect(repository.list("ACTIVE")).toEqual([
      { ...record, currentStatus: "EMPTY", hasOpenRevision: false },
    ]);
    expect(repository.explainList().join(" ")).toContain(
      "idx_test_record_updated_at",
    );
    expect(repository.explainList("PENDING_APPROVAL").join(" ")).toContain(
      "idx_test_record_status_updated_at",
    );
    const pagePlan = repository.explainListPage("ACTIVE").join(" ");
    expect(pagePlan).toContain("idx_test_record_status_updated_id_v2");
    expect(pagePlan).not.toContain("TEMP B-TREE FOR LAST TERM OF ORDER BY");
    expect(repository.audit()).toEqual([
      expect.objectContaining({
        record_id: record.id,
        action: "CREATED",
        actor: "maker.test",
      }),
    ]);
    expect(repository.busyTimeoutMs()).toBe(5000);
    repository.onModuleDestroy();
  });

  it("projects the three observed RMA draft/source pairs onto grouped ACTIVE rows", () => {
    const repository = new RmaRepository();
    const now = "2026-09-18T00:00:00.000Z";
    const pairs = [
      {
        child: "fa137390-c1f8-458c-a839-cd6fdf168f3b",
        source: "59296df5-71d7-567c-9372-bf917c251ba2",
        counterpartyBic: "SMBCJPJT",
        direction: "OUTBOUND" as const,
        changeType: "REVISION" as const,
        expected: "DRAFTED",
      },
      {
        child: "b9b07dd1-755a-4a38-b84d-7b74b0c5076f",
        source: "ec7082e1-c348-5fca-a800-560c53856aff",
        counterpartyBic: "UBSWCHZH80A",
        direction: "INBOUND" as const,
        changeType: "SUPPRESSION" as const,
        expected: "SUPPRESSED",
      },
      {
        child: "e1cfec3e-5351-4cfe-ad6b-bb0af1adb9af",
        source: "63b42f79-537c-44e6-b877-194af77fe4e7",
        counterpartyBic: "SCBLHKHH",
        direction: "OUTBOUND" as const,
        changeType: "SUPPRESSION" as const,
        expected: "SUPPRESSED",
      },
    ] as const;

    for (const pair of pairs) {
      const source: RmaRecord = {
        id: pair.source,
        ownBic: "DEMOHKHH",
        counterpartyBic: pair.counterpartyBic,
        service: "FIN",
        direction: pair.direction,
        messageTypes: ["MT320"],
        validFrom: "2026-01-01",
        validTo: "2027-12-31",
        maker: "maker.source",
        status: "ACTIVE",
        version: 1,
        source: "SYNTHETIC_DEMO",
        createdAt: now,
        updatedAt: now,
      };
      repository.save(source, "CREATED", "maker.source", "RMA");
      repository.save(
        {
          ...source,
          id: pair.child,
          amendmentOfId: source.id,
          changeType: pair.changeType,
          status: "DRAFT",
          maker: "maker.revision",
          version: 2,
        },
        "DRAFTED",
        "maker.revision",
        "RMA",
      );
    }

    const rows = repository.listIndexPage({
      status: "ACTIVE",
      page: 1,
      pageSize: 10,
    }).items;
    for (const pair of pairs) {
      expect(rows.find((row) => row.id === pair.source)).toEqual(
        expect.objectContaining({
          currentStatus: pair.expected,
          hasOpenRevision: true,
          openRevisionId: pair.child,
          openRevisionStatus: "DRAFT",
          openRevisionChangeType: pair.changeType,
        }),
      );
    }
    repository.onModuleDestroy();
  });

  it("atomically reserves WIP, fails competing mutations closed, and releases the source", () => {
    const first = new RmaRepository();
    const competitor = new RmaRepository();
    const now = "2026-09-18T00:00:00.000Z";
    const source: RmaRecord = {
      id: "RMA-CONCURRENCY-SOURCE",
      ownBic: "DEMOHKHH",
      counterpartyBic: "UBSWCHZH80A",
      service: "FIN",
      direction: "OUTBOUND",
      messageTypes: ["MT320"],
      validFrom: "2026-01-01",
      validTo: "2027-12-31",
      maker: "maker.source",
      status: "ACTIVE",
      version: 1,
      source: "SYNTHETIC_DEMO",
      createdAt: now,
      updatedAt: now,
    };
    const wip: RmaRecord = {
      ...source,
      id: "RMA-WIP-1",
      amendmentOfId: source.id,
      changeType: "REVISION",
      status: "WIP",
      maker: "maker.one",
      revisionWipExpiresAt: "2099-01-01T00:00:00.000Z",
    };
    const suppression: RmaRecord = {
      ...source,
      id: "RMA-SUPPRESSION-2",
      amendmentOfId: source.id,
      changeType: "SUPPRESSION",
      status: "DRAFT",
      maker: "maker.two",
    };
    first.save(source, "CREATED", source.maker, "RMA");

    expect(first.saveRevisionWorkInProgress(wip, wip.maker, "RMA")).toBe(true);
    expect(
      competitor.saveRevisionWorkInProgress(
        suppression,
        suppression.maker,
        "RMA",
        "SUPPRESSION_DRAFT_CREATED",
      ),
    ).toBe(false);
    expect(first.listIndexPage({ status: "ACTIVE" }).items[0]).toEqual(
      expect.objectContaining({
        currentStatus: "IN_PROGRESS",
        openRevisionId: wip.id,
      }),
    );

    first.save(
      { ...wip, status: "REVOKED", revokeReason: "Maker closed editor" },
      "WIP_CANCELLED",
      wip.maker,
      "RMA",
    );
    expect(
      competitor.saveRevisionWorkInProgress(
        suppression,
        suppression.maker,
        "RMA",
        "SUPPRESSION_DRAFT_CREATED",
      ),
    ).toBe(true);
    expect(first.listIndexPage({ status: "ACTIVE" }).items[0]).toEqual(
      expect.objectContaining({
        currentStatus: "SUPPRESSED",
        openRevisionId: suppression.id,
      }),
    );
    first.onModuleDestroy();
    competitor.onModuleDestroy();
  });

  it("persists SSI records and atomically versions applicability replacements", () => {
    const repository = new SqliteSsiRepository();
    const record: SsiRecord = {
      id: "SSI-1",
      counterpartyId: "CP-BARCGB22",
      scope: "REUSABLE",
      maker: "maker.test",
      status: "ACTIVE",
      version: 1,
      route: { currency: "GBP", accountId: "NOSTRO-GBP-1" },
      createdAt: "2026-09-11T00:00:00.000Z",
      updatedAt: "2026-09-11T00:00:00.000Z",
    };
    const applicability: SsiApplicabilityInput = {
      consumer: "CENTRAL_PAYMENT",
      product: "CENTRAL_PAYMENT",
      businessFunction: "INTERBANK_TRANSFER",
      paymentLeg: "INTERBANK_SETTLEMENT",
      direction: "OUTBOUND",
      status: "ACTIVE",
      validFrom: "2026-01-01",
      validTo: "2027-12-31",
    };

    repository.save(record, "CREATED", "maker.test");
    const first = repository.replaceApplicability(
      record.id,
      [applicability],
      "maker.test",
    );
    const second = repository.replaceApplicability(
      record.id,
      [{ ...applicability, consumer: "TREASURY" }],
      "checker.test",
    );

    expect(repository.find(record.id)).toEqual(record);
    expect(repository.find("MISSING")).toBeUndefined();
    const unlockedRecord = {
      ...record,
      currentStatus: "EMPTY",
      hasOpenRevision: false,
    };
    expect(repository.list()).toEqual([unlockedRecord]);
    expect(repository.list("ACTIVE")).toEqual([unlockedRecord]);
    expect(
      repository.listPage({
        status: "ACTIVE",
        ownershipType: "COUNTERPARTY",
        page: 1,
        pageSize: 10,
        search: "GBP",
        sortBy: "CURRENCY",
        sortDirection: "ASC",
      }),
    ).toEqual({
      items: [unlockedRecord],
      page: 1,
      pageSize: 10,
      totalItems: 1,
      totalPages: 1,
      hasPrevious: false,
      hasNext: false,
      distinctCurrencyCount: 1,
    });
    expect(repository.summary()).toEqual({
      currentOwn: 0,
      pendingApproval: 0,
      active: 1,
      archived: 0,
    });
    repository.save(
      {
        ...record,
        id: "SSI-1-DRAFT",
        status: "DRAFT",
        version: 2,
        amendmentOfId: record.id,
      },
      "UPDATED",
      "maker.test",
    );
    expect(
      repository.listPage({
        status: "ACTIVE",
        page: 1,
        pageSize: 10,
      }).items,
    ).toEqual([
      expect.objectContaining({
        id: record.id,
        hasOpenRevision: true,
        openRevisionId: "SSI-1-DRAFT",
        openRevisionStatus: "DRAFT",
      }),
    ]);
    expect(repository.indexNames()).toEqual(
      expect.arrayContaining([
        "idx_ssi_updated_at",
        "idx_ssi_status_updated_at",
      ]),
    );
    expect(repository.explainList().join(" ")).toContain("idx_ssi_updated_at");
    expect(repository.explainList("PENDING_APPROVAL").join(" ")).toContain(
      "idx_ssi_status_updated_at",
    );
    expect(first).toEqual([
      expect.objectContaining({ id: "SSI-1:APPL:1", version: 1 }),
    ]);
    expect(second).toEqual([
      expect.objectContaining({
        id: "SSI-1:APPL:1",
        version: 2,
        consumer: "TREASURY",
      }),
    ]);
    expect(repository.listApplicability(record.id)).toEqual(second);
    expect(repository.listApplicability()).toEqual(second);
    expect(repository.audit()).toHaveLength(4);
    repository.onModuleDestroy();
  });

  it("atomically approves an SSI revision together with its draft applicability", () => {
    const repository = new SqliteSsiRepository();
    const source: SsiRecord = {
      id: "SSI-SOURCE",
      counterpartyId: "CP-ANY-HKD",
      scope: "STANDING",
      maker: "maker.original",
      status: "ACTIVE",
      version: 9,
      route: { ssiCode: "SSI-DEMO-030", currency: "HKD" },
      createdAt: "2026-09-17T00:00:00.000Z",
      updatedAt: "2026-09-17T00:00:00.000Z",
    };
    const pending: SsiRecord = {
      ...source,
      id: "SSI-PENDING",
      maker: "maker.datafix",
      status: "PENDING_APPROVAL",
      version: 11,
      amendmentOfId: source.id,
    };
    const draftApplicability: SsiApplicabilityInput = {
      consumer: "ANY",
      product: "ANY",
      businessFunction: "ANY",
      paymentLeg: "BANK_REIMBURSEMENT",
      direction: "OUTBOUND",
      status: "DRAFT",
      validFrom: "2026-01-01",
      validTo: "2027-12-31",
    };
    repository.save(source, "CREATED", source.maker);
    repository.save(pending, "SUBMIT", pending.maker);
    repository.replaceApplicability(
      pending.id,
      [draftApplicability],
      pending.maker,
    );

    expect(
      repository.approveWithApplicability(pending.id, pending.maker),
    ).toBeUndefined();
    expect(repository.find(pending.id)?.status).toBe("PENDING_APPROVAL");
    expect(repository.listApplicability(pending.id)[0]?.status).toBe("DRAFT");

    expect(
      repository.approveWithApplicability(pending.id, "checker.demo"),
    ).toMatchObject({
      id: pending.id,
      status: "ACTIVE",
      checker: "checker.demo",
      version: 12,
    });
    expect(repository.find(source.id)?.status).toBe("SUPERSEDED");
    expect(repository.listApplicability(pending.id)).toEqual([
      expect.objectContaining({
        ssiId: pending.id,
        status: "ACTIVE",
        version: 2,
      }),
    ]);
    expect(repository.audit()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ssi_id: pending.id,
          action: "APPLICABILITY_APPROVED",
          actor: "checker.demo",
        }),
        expect.objectContaining({
          ssi_id: pending.id,
          action: "APPROVE",
          actor: "checker.demo",
        }),
        expect.objectContaining({
          ssi_id: source.id,
          action: "SUPERSEDED",
          actor: "checker.demo",
        }),
      ]),
    );
    repository.onModuleDestroy();
  });

  it("orders the EFFECTIVE_PERIOD contract by the displayed validTo date", () => {
    const repository = new SqliteSsiRepository();
    const record = (
      id: string,
      validFrom: string,
      validTo: string,
    ): SsiRecord => ({
      id,
      counterpartyId: id,
      scope: "STANDING",
      maker: "maker.test",
      status: "ACTIVE",
      version: 1,
      route: { currency: "USD", validFrom, validTo },
      createdAt: "2026-09-11T00:00:00.000Z",
      updatedAt: "2026-09-11T00:00:00.000Z",
    });
    repository.save(
      record("EARLY-START-LATE-END", "2025-01-01", "2029-12-31"),
      "CREATED",
      "maker.test",
    );
    repository.save(
      record("LATE-START-EARLY-END", "2026-01-01", "2027-12-31"),
      "CREATED",
      "maker.test",
    );

    expect(
      repository
        .listPage({
          status: "ACTIVE",
          page: 1,
          pageSize: 10,
          sortBy: "EFFECTIVE_PERIOD",
          sortDirection: "ASC",
        })
        .items.map(({ id }) => id),
    ).toEqual(["LATE-START-EARLY-END", "EARLY-START-LATE-END"]);
    repository.onModuleDestroy();
  });

  it("inherits legacy revision applicability inside the approval transaction", () => {
    const repository = new SqliteSsiRepository();
    const source: SsiRecord = {
      id: "SSI-LEGACY-SOURCE",
      counterpartyId: "CP-LEGACY",
      scope: "STANDING",
      maker: "maker.original",
      status: "ACTIVE",
      version: 3,
      route: { ssiCode: "SSI-LEGACY", currency: "USD" },
      createdAt: "2026-09-17T00:00:00.000Z",
      updatedAt: "2026-09-17T00:00:00.000Z",
    };
    const pending: SsiRecord = {
      ...source,
      id: "SSI-LEGACY-PENDING",
      maker: "maker.revision",
      status: "PENDING_APPROVAL",
      version: 4,
      amendmentOfId: source.id,
    };
    repository.save(source, "CREATED", source.maker);
    repository.replaceApplicability(
      source.id,
      [
        {
          consumer: "ANY",
          product: "ANY",
          businessFunction: "ANY",
          paymentLeg: "INTERBANK_SETTLEMENT",
          direction: "OUTBOUND",
          status: "ACTIVE",
          validFrom: "2026-01-01",
          validTo: "2027-12-31",
        },
      ],
      source.maker,
    );
    repository.save(pending, "SUBMIT", pending.maker);
    expect(repository.listApplicability(pending.id)).toEqual([]);

    expect(
      repository.approveWithApplicability(pending.id, "checker.demo"),
    ).toMatchObject({ status: "ACTIVE", checker: "checker.demo" });
    expect(repository.listApplicability(pending.id)).toEqual([
      expect.objectContaining({
        id: `${pending.id}:APPL:1`,
        ssiId: pending.id,
        status: "ACTIVE",
      }),
    ]);
    repository.onModuleDestroy();
  });

  it("aggregates complete counterparty coverage independently of pagination", () => {
    const repository = new SqliteSsiRepository();
    const makeRecord = (
      id: string,
      counterpartyId: string,
      currency: string,
    ): SsiRecord => ({
      id,
      counterpartyId: `CP-${id}`,
      scope: "REUSABLE",
      maker: "maker.test",
      status: "ACTIVE",
      version: 1,
      ownershipType: "COUNTERPARTY",
      route: { counterpartyBic: counterpartyId, currency },
      createdAt: "2026-09-11T00:00:00.000Z",
      updatedAt: "2026-09-11T00:00:00.000Z",
    });
    repository.save(
      makeRecord("SSI-1", "BARCGB22", "GBP"),
      "CREATED",
      "maker.test",
    );
    repository.save(
      makeRecord("SSI-2", "BARCGB22", "EUR"),
      "CREATED",
      "maker.test",
    );
    repository.save(
      makeRecord("SSI-3", "DEUTDEFF", "EUR"),
      "CREATED",
      "maker.test",
    );

    expect(repository.counterpartyCoverage("ACTIVE")).toEqual([
      {
        counterpartyId: "BARCGB22",
        ssiCount: 2,
        currencyCount: 2,
        statuses: ["ACTIVE"],
        lastVerified: expect.any(String),
      },
      {
        counterpartyId: "DEUTDEFF",
        ssiCount: 1,
        currencyCount: 1,
        statuses: ["ACTIVE"],
        lastVerified: expect.any(String),
      },
    ]);
    repository.onModuleDestroy();
  });

  it("filters payment SSI candidates inside SQLite before parsing payloads", () => {
    const repository = new SqliteSsiRepository();
    const activeRoute: SsiRecord = {
      id: "SSI-MT2-EUR-1",
      counterpartyId: "CP-DEUTDEFF",
      scope: "STANDING",
      maker: "maker.test",
      status: "ACTIVE",
      version: 1,
      route: {
        sourceMessageTypes: "MT202,MT205",
        messageTypes: "pacs.009.001.08",
        businessService: "swift.cbprplus.04",
        routePurpose: "INTERBANK_TRANSFER",
        currency: "EUR",
        bookingEntity: "HK01",
        validFrom: "2026-01-01",
        validTo: "2027-12-31",
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    repository.save(activeRoute, "CREATED", "maker.test");
    repository.replaceApplicability(
      activeRoute.id,
      [
        {
          consumer: "CENTRAL_PAYMENT",
          product: "CENTRAL_PAYMENT",
          businessFunction: "INTERBANK_TRANSFER",
          paymentLeg: "INTERBANK_SETTLEMENT",
          direction: "OUTBOUND",
          status: "ACTIVE",
          validFrom: "2026-01-01",
          validTo: "2027-12-31",
        },
      ],
      "maker.test",
    );

    expect(
      repository.findPaymentCandidates({
        sourceMessageType: "MT202",
        messageType: "pacs.009.001.08",
        businessService: "swift.cbprplus.04",
        valueDate: "2026-09-15",
        currency: "EUR",
        bookingEntity: "HK01",
      }),
    ).toEqual([activeRoute]);
    expect(
      repository.findPaymentCandidates({
        sourceMessageType: "MT202COV",
        messageType: "pacs.009.001.08",
        businessService: "swift.cbprplus.cov.04",
        valueDate: "2026-09-15",
        currency: "EUR",
        bookingEntity: "HK01",
      }),
    ).toEqual([]);
    repository.onModuleDestroy();
  });

  it("separates FIN candidate-group discovery from exact route resolution", () => {
    const repository = new SqliteSsiRepository();
    const groupId = "FIX-MT400-001@v1";
    const makeSsi = (id: string, binding: string, bic: string): SsiRecord =>
      ({
        id,
        fixtureFamily: "MT347-SR2026-SSI",
        fixtureBindingId: binding,
        counterpartyId: `CP-${bic}`,
        scope: "STANDING",
        maker: "maker.test",
        status: "ACTIVE",
        version: 1,
        route: {
          fixtureGroupId: groupId,
          currency: "USD",
          bookingEntity: "HK01",
          counterpartyBic: bic,
        },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }) as SsiRecord;
    const records = [
      makeSsi("SSI-MT400-1", groupId, "DEUTDEFF"),
      makeSsi("SSI-MT400-2", `${groupId}::USD::BOFAUS3N`, "BOFAUS3N"),
    ];
    for (const record of records) {
      repository.save(record, "CREATED", "maker.test");
      repository.replaceApplicability(
        record.id,
        [
          {
            fixtureFamily: "MT347-SR2026-SSI",
            fixtureBindingId: (
              record as SsiRecord & { fixtureBindingId: string }
            ).fixtureBindingId,
            messageType: "MT400",
            sequence: "MESSAGE",
            currency: "USD",
            consumer: "TRADE_FINANCE",
            product: "COLLECTION",
            businessFunction: "COLLECTION_PAYMENT_DIRECT",
            paymentLeg: "MESSAGE",
            direction: "OUTBOUND",
            status: "ACTIVE",
            validFrom: "2026-01-01",
            validTo: "2027-12-31",
          } as unknown as SsiApplicabilityInput,
        ],
        "maker.test",
      );
    }

    const query = {
      messageType: "MT400",
      sequence: "MESSAGE",
      currency: "USD",
      bookingEntity: "HK01",
      valueDate: "2026-09-15",
      bindingId: groupId,
    };
    expect(repository.findFinControlledFixtures(query)).toHaveLength(1);
    expect(
      repository.findFinControlledFixtures({
        ...query,
        includeFixtureGroup: true,
      }),
    ).toHaveLength(2);
    repository.onModuleDestroy();
  });

  it("finds eligible Nostro accounts inside SQLite and isolates fixture families", () => {
    const repository = new NostroRepository();
    const makeRecord = (
      id: string,
      fixtureFamily: string,
      priority: number,
      fixtureBindingIds: string[] = ["FIXTURE-MT202-OP-DIRECT"],
    ): NostroRecord => ({
      id,
      fixtureFamily,
      fixtureBindingIds,
      usageGroup: "MT2",
      ownLegalEntityId: "HK01",
      allowedBookingEntities: ["HK01"],
      accountServicerBic: "CITIUS33",
      currency: "USD",
      maskedAccountRef: `DEMO-${id}`,
      purpose: "SETTLEMENT",
      priority,
      validFrom: "2026-01-01",
      validTo: "2027-12-31",
      maker: "maker.test",
      source: "SYNTHETIC_DEMO",
      status: "ACTIVE",
      version: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const operational = makeRecord("NOSTRO-OP", "MT2-UI-PARITY-V1", 10);
    const qaOnly = makeRecord("NOSTRO-QA", "MT2-NEGATIVE-QA", 1);
    const wrongBinding = makeRecord(
      "NOSTRO-WRONG-BINDING",
      "MT2-UI-PARITY-V1",
      1,
      ["FIXTURE-MT202-QA-C81"],
    );
    repository.save(operational, "CREATED", "maker.test", "NOSTRO");
    repository.save(qaOnly, "CREATED", "maker.test", "NOSTRO");
    repository.save(wrongBinding, "CREATED", "maker.test", "NOSTRO");

    const query = {
      ownLegalEntityId: "HK01",
      accountServicerBic: "CITIUS33",
      currency: "USD",
      purpose: "SETTLEMENT",
      at: "2026-09-15",
      fixtureFamily: "MT2-UI-PARITY-V1",
      usageGroup: "MT2",
      fixtureBindingId: "FIXTURE-MT202-OP-DIRECT",
    };
    expect(repository.findEligible(query)).toEqual([operational]);
    expect(repository.indexNames()).toEqual(
      expect.arrayContaining(["idx_nostro_eligibility_scope_v2"]),
    );
    expect(repository.explainFindEligible(query).join(" ")).toContain(
      "idx_nostro_eligibility_scope_v2",
    );
    repository.onModuleDestroy();
  });

  it("finds exact RMA authorisations inside SQLite without leaking QA fixtures", () => {
    const repository = new RmaRepository();
    const makeRecord = (
      id: string,
      fixtureFamily: string,
      messageTypes: string[],
      fixtureBindingIds: string[] = ["FIXTURE-MT202-OP-DIRECT"],
    ): RmaRecord => ({
      id,
      fixtureFamily,
      fixtureBindingIds,
      usageGroup: "MT2",
      ownBic: "DEMOHKHH",
      counterpartyBic: "CITIUS33",
      service: "FINPLUS",
      direction: "OUTBOUND",
      messageTypes,
      validFrom: "2026-01-01",
      validTo: "2027-12-31",
      maker: "maker.test",
      source: "SYNTHETIC_DEMO",
      status: "ACTIVE",
      version: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const operational = makeRecord("RMA-OP", "MT2-UI-PARITY-V1", [
      "pacs.009.001.08",
    ]);
    const wildcard = makeRecord("RMA-WILDCARD", "MT2-UI-PARITY-V1", ["*"]);
    const qaOnly = makeRecord("RMA-QA", "MT2-NEGATIVE-QA", ["pacs.009.001.08"]);
    const wrongBinding = makeRecord(
      "RMA-WRONG-BINDING",
      "MT2-UI-PARITY-V1",
      ["pacs.009.001.08"],
      ["FIXTURE-MT202-QA-C81"],
    );
    for (const record of [operational, wildcard, qaOnly, wrongBinding]) {
      repository.save(record, "CREATED", "maker.test", "RMA");
    }

    const query = {
      ownBic: "DEMOHKHHXXX",
      counterpartyBic: "CITIUS33XXX",
      service: "FINPLUS",
      direction: "OUTBOUND",
      messageType: "pacs.009.001.08",
      fixtureFamily: "MT2-UI-PARITY-V1",
      usageGroup: "MT2",
      fixtureBindingId: "FIXTURE-MT202-OP-DIRECT",
    };
    expect(repository.findAuthorised(query)).toEqual([operational]);
    expect(repository.indexNames()).toEqual(
      expect.arrayContaining(["idx_rma_authorisation_logical_scope_v3"]),
    );
    expect(repository.explainFindAuthorised(query).join(" ")).toContain(
      "idx_rma_authorisation_status_updated_id_v2",
    );
    repository.onModuleDestroy();
  });

  it("projects one RMA index per BIC pair and direction across FIN and FINPLUS", () => {
    const repository = new RmaRepository();
    const base: Omit<RmaRecord, "id" | "service" | "messageTypes"> = {
      ownBic: "DEMOHKHH",
      counterpartyBic: "CITIUS33",
      direction: "OUTBOUND",
      validFrom: "2026-01-01",
      validTo: "2027-12-31",
      maker: "maker.test",
      source: "SYNTHETIC_DEMO",
      status: "ACTIVE",
      version: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    repository.save(
      { ...base, id: "RMA-FIN", service: "FIN", messageTypes: ["MT202"] },
      "CREATED",
      "maker.test",
      "RMA",
    );
    repository.save(
      {
        ...base,
        id: "RMA-FINPLUS",
        service: "FINPLUS",
        messageTypes: ["pacs.009.001.08"],
      },
      "CREATED",
      "maker.test",
      "RMA",
    );

    expect(repository.listIndexPage({ status: "ACTIVE" })).toMatchObject({
      totalItems: 1,
      items: [
        {
          counterpartyBic: "CITIUS33",
          direction: "OUTBOUND",
          service: "FIN / FINPLUS",
          services: ["FIN", "FINPLUS"],
          messageTypes: ["MT202", "pacs.009.001.08"],
        },
      ],
    });
    repository.onModuleDestroy();
  });
});
