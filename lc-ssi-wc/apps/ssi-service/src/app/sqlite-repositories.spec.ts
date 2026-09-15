import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGovernedRepository } from "./shared/sqlite-governed.repository";
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
    expect(repository.list()).toEqual([record]);
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
    expect(repository.list()).toEqual([record]);
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
    expect(repository.audit()).toHaveLength(3);
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
      expect.arrayContaining(["idx_rma_authorisation_scope_v2"]),
    );
    expect(repository.explainFindAuthorised(query).join(" ")).toContain(
      "idx_rma_authorisation_scope_v2",
    );
    repository.onModuleDestroy();
  });
});
