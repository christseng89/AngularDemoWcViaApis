import { BadRequestException } from "@nestjs/common";
import { FinControlledFixtureService } from "../../app/fin-controlled-fixture.service";
import type { SqliteSsiRepository } from "../../app/sqlite-ssi.repository";

const bindingId = "FIX-MT300-001@v1";
const ssi = {
  id: "ssi-1",
  fixtureFamily: "MT347-SR2026-SSI",
  fixtureBindingId: bindingId,
  status: "ACTIVE",
  version: 1,
  route: {
    bookingEntity: "HK01",
    currency: "USD",
    messageTypes: ["MT300"],
    businessFunction: "FX_CONFIRMATION",
    sequence: "B1",
    settlementLeg: "Amount Bought",
    counterpartyBic: "DEUTDEFF",
    roleValues: { DELIVERY_AGENT: "CITIUS33", RECEIVING_AGENT: "DEUTDEFF" },
    roleProvenance: {
      DELIVERY_AGENT: {
        owner: "SSI",
        sourceType: "CONTROLLED_ROUTE_PROFILE",
        sourceId: "BANK-SVC-CITIUS33",
      },
      RECEIVING_AGENT: {
        owner: "SSI",
        sourceType: "CONTROLLED_ROUTE_PROFILE",
        sourceId: "BANK-SVC-DEUTDEFF",
      },
    },
  },
};
const applicability = {
  id: "app-1",
  ssiId: "ssi-1",
  fixtureFamily: "MT347-SR2026-SSI",
  fixtureBindingId: bindingId,
  status: "ACTIVE",
  messageType: "MT300",
  sequence: "B1",
  settlementLeg: "Amount Bought",
  currency: "USD",
  validFrom: "2026-01-01",
  validTo: "2027-12-31",
  transactionRoleValues: { BENEFICIARY_INSTITUTION: "BARCGB22" },
  transactionRoleProvenance: {
    BENEFICIARY_INSTITUTION: {
      owner: "TRANSACTION_CONTEXT",
      sourceType: "IMMUTABLE_UPSTREAM_INSTRUCTION",
      sourceId: "TX-001",
    },
  },
};

const repository = {
  list: jest.fn(() => [ssi]),
  listApplicability: jest.fn(() => [applicability]),
} as unknown as SqliteSsiRepository;

describe("FinControlledFixtureService", () => {
  const service = new FinControlledFixtureService(repository);

  it("returns canonical DB candidates for the exact QA/UAT context", () => {
    const result = service.list({
      messageType: "MT300",
      sequence: "B1",
      currency: "USD",
      bookingEntity: "HK01",
      valueDate: "2026-09-12",
      bindingId,
    }) as {
      source: string;
      count: number;
      candidates: Array<Record<string, unknown>>;
    };

    expect(result.source).toBe("CANONICAL_DATABASE");
    expect(result.count).toBe(1);
    expect(result.candidates[0]).toMatchObject({
      bindingId,
      messageType: "MT300",
      sequence: "B1",
      roleValues: { DELIVERY_AGENT: "CITIUS33", RECEIVING_AGENT: "DEUTDEFF" },
      transactionRoleValues: { BENEFICIARY_INSTITUTION: "BARCGB22" },
      roleSources: {
        DELIVERY_AGENT: "CONTROLLED_ROUTE_PROFILE",
        RECEIVING_AGENT: "CONTROLLED_ROUTE_PROFILE",
        BENEFICIARY_INSTITUTION: "IMMUTABLE_UPSTREAM_INSTRUCTION",
      },
      roleEvidence: {
        DELIVERY_AGENT: expect.objectContaining({
          owner: "SSI",
          sourceRecordId: "BANK-SVC-CITIUS33",
        }),
        BENEFICIARY_INSTITUTION: expect.objectContaining({
          owner: "TRANSACTION_CONTEXT",
          ownerSide: "TRANSACTION_PARTY",
          sourceRecordId: "TX-001",
        }),
      },
    });
  });

  it("uses the database-filtered fixture query when the repository supports it", () => {
    const optimizedRepository = {
      findFinControlledFixtures: jest.fn(() => [{ ssi, applicability }]),
      list: jest.fn(() => {
        throw new Error("FULL_SSI_SCAN_NOT_ALLOWED");
      }),
      listApplicability: jest.fn(() => {
        throw new Error("FULL_APPLICABILITY_SCAN_NOT_ALLOWED");
      }),
    } as unknown as SqliteSsiRepository;
    const optimized = new FinControlledFixtureService(optimizedRepository);

    const result = optimized.list({
      messageType: "MT300",
      sequence: "B1",
      currency: "USD",
      bookingEntity: "HK01",
      valueDate: "2026-09-12",
      bindingId,
    });

    expect(result.count).toBe(1);
    expect(optimizedRepository.findFinControlledFixtures).toHaveBeenCalledWith({
      messageType: "MT300",
      sequence: "B1",
      currency: "USD",
      bookingEntity: "HK01",
      valueDate: "2026-09-12",
      bindingId,
    });
  });

  it("reads the Page Definition index catalogue without full SSI or applicability lists", () => {
    const optimizedRepository = {
      listFinControlledFixtureCatalogueRows: jest.fn(() => [
        { ssi, applicability },
      ]),
      list: jest.fn(() => {
        throw new Error("FULL_SSI_SCAN_NOT_ALLOWED");
      }),
      listApplicability: jest.fn(() => {
        throw new Error("FULL_APPLICABILITY_SCAN_NOT_ALLOWED");
      }),
    } as unknown as SqliteSsiRepository;

    const result = new FinControlledFixtureService(
      optimizedRepository,
    ).indexCatalogue();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ bindingId, currency: "USD" });
    expect(optimizedRepository.list).not.toHaveBeenCalled();
    expect(optimizedRepository.listApplicability).not.toHaveBeenCalled();
  });

  it("isolates historical fixtures when the versioned v1.1 graph is present", () => {
    const historical = { ...ssi, id: "ssi-historical" };
    const controlled = {
      ...ssi,
      id: "ssi-v1-1",
      fixtureVariantVersion: "MT347-DEMO-ORACLE-V1.1",
      datasetVersion: "MT347-DEMO-V1.1",
      usageScope: "QA_POSITIVE",
      operationalVisible: false,
    };
    const controlledNegative = {
      ...controlled,
      id: "ssi-v1-1-negative",
      usageScope: "QA_NEGATIVE",
    };
    const optimizedRepository = {
      findFinControlledFixtures: jest.fn(() => [
        { ssi: historical, applicability: { ...applicability, ssiId: historical.id } },
        { ssi: controlled, applicability: { ...applicability, ssiId: controlled.id } },
        {
          ssi: controlledNegative,
          applicability: { ...applicability, ssiId: controlledNegative.id },
        },
      ]),
    } as unknown as SqliteSsiRepository;

    const result = new FinControlledFixtureService(optimizedRepository).list({
      messageType: "MT300",
      sequence: "B1",
      currency: "USD",
      bookingEntity: "HK01",
      valueDate: "2026-09-12",
      bindingId,
    });

    expect(result.candidates.map((candidate) => candidate.id)).toEqual([
      "ssi-v1-1",
    ]);
  });

  it("does not return a fixture outside its effective date", () => {
    const result = service.list({
      messageType: "MT300",
      sequence: "B1",
      currency: "USD",
      bookingEntity: "HK01",
      valueDate: "2028-01-01",
    }) as { count: number };
    expect(result.count).toBe(0);
  });

  it("fails closed when the exact lookup context is incomplete", () => {
    expect(() =>
      service.list({
        messageType: "MT2",
        currency: "USD",
        bookingEntity: "HK01",
        valueDate: "2026-09-12",
      }),
    ).toThrow(BadRequestException);
  });
});
