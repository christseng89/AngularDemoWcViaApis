import { BadRequestException } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { NostroApplicationService } from "../../../app/nostro/nostro-application.service";
import type { RmaApplicationService } from "../../../app/rma/rma-application.service";
import type { SsiApplicationService } from "../../../app/ssi-application.service";
import type { EntityApplicationService } from "../../../app/entity/entity-application.service";
import {
  SwiftDataImportService,
  type ImportRequest,
} from "../../../app/imports/swift-data-import.service";

const record = { maker: "operator" };

const request = (overrides: Partial<ImportRequest> = {}): ImportRequest => ({
  dataType: "SSI",
  fileName: "ssi.json",
  idempotencyKey: "import-1",
  records: [record],
  ...overrides,
});

const harness = () => {
  const ssi = {
    validate: jest.fn(),
    create: jest.fn(() => ({ id: "SSI-1" })),
  };
  const rma = {
    validateCommand: jest.fn(),
    create: jest.fn(() => ({ id: "RMA-1" })),
  };
  const nostro = {
    validateCommand: jest.fn(),
    create: jest.fn(() => ({ id: "NOSTRO-1" })),
  };
  const entity = {
    validateCommand: jest.fn(),
    create: jest.fn(() => ({ id: "ENTITY-1" })),
  };
  return {
    subject: new SwiftDataImportService(
      ssi as unknown as SsiApplicationService,
      rma as unknown as RmaApplicationService,
      nostro as unknown as NostroApplicationService,
      entity as unknown as EntityApplicationService,
    ),
    ssi,
    rma,
    nostro,
    entity,
  };
};

describe("SwiftDataImportService", () => {
  it.each([
    { fileName: "ssi.csv" },
    { idempotencyKey: "" },
    { records: [] },
    { records: Array.from({ length: 501 }, () => record) },
    { dataType: "OTHER" },
  ])("rejects invalid import envelope %#", (override) => {
    expect(() => harness().subject.import(request(override as never))).toThrow(
      BadRequestException,
    );
  });

  it("rejects a mismatched checksum before importing records", () => {
    const { subject, ssi } = harness();
    expect(() => subject.import(request({ checksum: "deadbeef" }))).toThrow(
      "CHECKSUM_MISMATCH",
    );
    expect(ssi.create).not.toHaveBeenCalled();
  });

  it("creates SSI records and returns the canonical checksum", () => {
    const { subject, ssi } = harness();
    const checksum = createHash("sha256")
      .update(JSON.stringify([record]))
      .digest("hex");
    const result = subject.import(request({ checksum })) as Record<
      string,
      unknown
    >;
    expect(ssi.create).toHaveBeenCalledWith(record);
    expect(result).toMatchObject({
      dataType: "SSI",
      checksum,
      total: 1,
      accepted: 1,
      rejected: 0,
      dryRun: false,
      results: [{ row: 1, status: "DRAFT_CREATED", id: "SSI-1" }],
    });
  });

  it.each([
    ["RMA", "RMA-1"],
    ["NOSTRO", "NOSTRO-1"],
    ["ENTITY", "ENTITY-1"],
  ] as const)(
    "dispatches %s creation to its application service",
    (dataType, id) => {
      const context = harness();
      const result = context.subject.import(
        request({ dataType, idempotencyKey: `create-${dataType}` }),
      ) as Record<string, unknown>;
      expect(result).toMatchObject({
        results: [{ row: 1, status: "DRAFT_CREATED", id }],
      });
    },
  );

  it.each(["SSI", "RMA", "NOSTRO", "ENTITY"] as const)(
    "validates %s dry runs without creating records",
    (dataType) => {
      const context = harness();
      const result = context.subject.import(
        request({ dataType, dryRun: true, idempotencyKey: `dry-${dataType}` }),
      );
      expect(result).toMatchObject({
        dryRun: true,
        accepted: 1,
        rejected: 0,
        results: [{ row: 1, status: "VALIDATED" }],
        executionTelemetry: {
          databaseWriteAttempts: 0,
          nostroLookupAttempts: 0,
        },
      });
      expect(context.ssi.create).not.toHaveBeenCalled();
      expect(context.rma.create).not.toHaveBeenCalled();
      expect(context.nostro.create).not.toHaveBeenCalled();
      expect(context.entity.create).not.toHaveBeenCalled();
    },
  );

  it("reports authoritative write-attempt telemetry for a non-dry import", () => {
    const { subject } = harness();
    expect(subject.import(request())).toMatchObject({
      executionTelemetry: {
        databaseWriteAttempts: 1,
        nostroLookupAttempts: 0,
      },
    });
  });

  it("reports validation failures and non-Error throws per row", () => {
    const context = harness();
    context.ssi.validate
      .mockImplementationOnce(() => {
        throw new Error("INVALID_SSI");
      })
      .mockImplementationOnce(() => {
        throw "unexpected";
      });
    const result = context.subject.import(
      request({
        dryRun: true,
        idempotencyKey: "rejections",
        records: [record, record],
      }),
    );
    expect(result).toMatchObject({
      accepted: 0,
      rejected: 2,
      results: [
        { row: 1, status: "REJECTED", code: "INVALID_SSI" },
        { row: 2, status: "REJECTED", code: "UNKNOWN_ERROR" },
      ],
    });
  });

  it("returns a completed non-dry-run response idempotently", () => {
    const { subject, ssi } = harness();
    const first = subject.import(request());
    const second = subject.import(request({ records: [{ changed: true }] }));
    expect(second).toBe(first);
    expect(ssi.create).toHaveBeenCalledTimes(1);
  });

  it("does not cache dry-run responses", () => {
    const { subject, ssi } = harness();
    subject.import(request({ dryRun: true }));
    subject.import(request({ dryRun: true }));
    expect(ssi.validate).toHaveBeenCalledTimes(2);
  });

  it("uses the controlled MT347 profile only for dry-run validation", () => {
    const previous = process.env["SSI_RUNTIME_ENV"];
    process.env["SSI_RUNTIME_ENV"] = "demo";
    try {
      const context = harness();
      const controlled = {
        counterpartyId: "MT347-CHASUS33",
        fixtureFamily: "MT347-SR2026-SSI",
        fixtureVariantVersion: "MT347-DEMO-ORACLE-V1.1",
        maker: "maker.mt347",
        operationalVisible: false,
        paymentExecutable: false,
        scope: "STANDING",
        usageScope: "QA_POSITIVE",
        route: {
          bookingEntity: "HK01",
          counterpartyBic: "CHASUS33",
          currency: "USD",
          importValidationProfile: "MT347_DEMO_FIN_REFERENCE_ONLY_V1",
          oracleBusinessStatus: "BA_CONFIRMED",
          oracleContextKey: "MT300-001::USD::CHASUS33::HK01::OUTBOUND",
          oracleReasonCode: "REFERENCE_ROUTE_VALID",
          paymentExecutable: "false",
          profileKind: "FIN_REFERENCE_ONLY",
          settlementModel: "FIN_REFERENCE_ONLY",
        },
      };
      const result = context.subject.import(
        request({ dryRun: true, records: [controlled] }),
      );
      expect(result).toMatchObject({ accepted: 1, rejected: 0 });
      expect(context.ssi.validate).not.toHaveBeenCalled();
      expect(context.ssi.create).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env["SSI_RUNTIME_ENV"];
      else process.env["SSI_RUNTIME_ENV"] = previous;
    }
  });
});
