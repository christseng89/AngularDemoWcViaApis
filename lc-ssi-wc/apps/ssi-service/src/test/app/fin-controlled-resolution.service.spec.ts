import { HttpException, UnprocessableEntityException } from "@nestjs/common";
import { FinControlledResolutionService } from "../../app/fin-controlled-resolution.service";
import { FinFieldResolutionService } from "../../app/fin-field-resolution.service";
import { MappingCatalogueService } from "../../app/mapping-catalogue.service";
import { FinFieldResolutionPolicy } from "../../app/fin-field-resolution.policy";
import { BankServiceDirectory } from "../../app/bank-service-directory";

const request = {
  messageType: "MT300",
  sequence: "B1",
  currency: "USD",
  bookingEntity: "HK01",
  valueDate: "2026-09-12",
  bindingId: "FIX-MT300-001@v1",
  transactionReference: "QA-MT300-001",
};
const candidate = {
  id: "ssi-1",
  bindingId: request.bindingId,
  businessFunction: "FX_CONFIRMATION",
  sequence: "B1",
  settlementLeg: "Amount Bought",
  counterpartyBic: "DEUTDEFF",
  roleValues: { DELIVERY_AGENT: "CITIUS33", RECEIVING_AGENT: "DEUTDEFF" },
  roleSources: { DELIVERY_AGENT: "SYNTHETIC_DEMO" },
  roleEvidence: {},
  identity: {
    ssi: { id: "ssi-1", version: 1 },
    applicability: { id: "app-1", version: 1 },
  },
};

describe("FinControlledResolutionService", () => {
  it("rebinds transaction-context 58A evidence to the Bank Service selected by the user", () => {
    const selected = {
      ...candidate,
      bindingId: "FIX-MT300-011@v1",
      sequence: "D",
      settlementLeg: "Split Settlement Details",
      roleValues: {
        DELIVERY_AGENT: "CITIUS33",
        RECEIVING_AGENT: "DEUTDEFF",
        BENEFICIARY_INSTITUTION: "BARCGB22",
      },
      roleSources: {
        DELIVERY_AGENT: "SYNTHETIC_DEMO",
        RECEIVING_AGENT: "SYNTHETIC_DEMO",
        BENEFICIARY_INSTITUTION: "BANK_SERVICE_ID",
      },
      roleEvidence: {
        DELIVERY_AGENT: {
          ownerSide: "SENDER_SIDE",
          sourceType: "SYNTHETIC_DEMO",
          sourceRecordId: "ssi-1",
          status: "ACTIVE",
          approvalStatus: "APPROVED",
          effectiveFrom: "2026-01-01",
          effectiveTo: "2027-01-01",
        },
        RECEIVING_AGENT: {
          ownerSide: "RECEIVER_SIDE",
          sourceType: "SYNTHETIC_DEMO",
          sourceRecordId: "ssi-1",
          status: "ACTIVE",
          approvalStatus: "APPROVED",
          effectiveFrom: "2026-01-01",
          effectiveTo: "2027-01-01",
        },
        BENEFICIARY_INSTITUTION: {
          ownerSide: "TRANSACTION_PARTY",
          sourceType: "BANK_SERVICE_ID",
          sourceRecordId: "BANK-SVC-BARCGB22",
          version: "1",
          status: "ACTIVE",
          approvalStatus: "APPROVED",
          effectiveFrom: "2026-01-01",
          effectiveTo: "2027-01-01",
        },
      },
    };
    const service = new FinControlledResolutionService(
      {
        list: jest.fn(() => ({
          fixtureFamily: "MT347-SR2026-SSI",
          source: "CANONICAL_DATABASE",
          count: 1,
          candidates: [selected],
        })),
      } as never,
      new FinFieldResolutionService(
        new MappingCatalogueService(),
        new FinFieldResolutionPolicy(),
      ),
      {
        current: jest.fn(() => ({
          sha256: "snapshot",
          method: "SQLITE_WAL_AWARE_LOGICAL_SNAPSHOT_V1",
        })),
      } as never,
      new BankServiceDirectory(),
    );

    const result = service.resolve({
      ...request,
      sequence: "D",
      bindingId: selected.bindingId,
      transactionReference: "QA-MT300-011-CITI",
      roleBankServiceIds: {
        BENEFICIARY_INSTITUTION: "BANK-SVC-CITIUS33",
      },
    }) as { resolvedFields: Array<Record<string, unknown>> };
    const beneficiary = result.resolvedFields.find(
      ({ tag }) => tag === "58",
    );

    expect(beneficiary).toMatchObject({
      resolvedValue: "CITIUS33",
      reasonCode: "PRESERVED_FROM_TRANSACTION_CONTEXT",
      provenance: {
        ownerSide: "TRANSACTION_PARTY",
        source: "BANK_SERVICE_ID",
        sourceRecordId: "BANK-SVC-CITIUS33",
        version: "1",
        accountRelationshipStatus: "NOT_EVALUATED",
      },
    });
    expect(beneficiary?.provenance).not.toHaveProperty("sourceSsiId");
    expect(beneficiary?.reasonCode).not.toBe("EXACT_ELIGIBLE_SSI");
  });

  it("resolves one exact DB fixture and emits snapshot evidence", () => {
    const resolve = jest.fn(() => ({ resolvedFields: [] }));
    const service = new FinControlledResolutionService(
      { list: jest.fn(() => ({ fixtureFamily: "MT347-SR2026-SSI", source: "CANONICAL_DATABASE", count: 1, candidates: [candidate] })) } as never,
      { resolve } as never,
      { current: jest.fn(() => ({ sha256: "snapshot", method: "SQLITE_WAL_AWARE_LOGICAL_SNAPSHOT_V1" })) } as never,
      { resolve: jest.fn(() => ({ bic: "CHASUS33" })) } as never,
    );
    expect(service.resolve({
      ...request,
      roleBankServiceIds: { RECEIVING_AGENT: "BANK-SVC-CHASUS33" },
    })).toMatchObject({
      payloadGenerated: true,
      snapshotHash: "snapshot",
      selectedFixture: { bindingId: request.bindingId, source: "CANONICAL_DATABASE" },
    });
    expect(resolve).toHaveBeenCalledWith(expect.objectContaining({
      roles: expect.objectContaining({ RECEIVING_AGENT: "CHASUS33" }),
    }));
  });

  it("renders Party Identifier and account reference separately from stable Bank Service IDs", () => {
    const resolve = jest.fn(() => ({ resolvedFields: [] }));
    const service = new FinControlledResolutionService(
      { list: jest.fn(() => ({ fixtureFamily: "MT347-SR2026-SSI", source: "CANONICAL_DATABASE", count: 1, candidates: [candidate] })) } as never,
      { resolve } as never,
      { current: jest.fn(() => ({ sha256: "snapshot", method: "SQLITE_WAL_AWARE_LOGICAL_SNAPSHOT_V1" })) } as never,
      { resolve: jest.fn((id: string) => ({ bic: id.endsWith("CITIUS33") ? "CITIUS33" : "BARCGB22" })) } as never,
    );

    service.resolve({
      ...request,
      roleBankServiceIds: {
        DELIVERY_AGENT: "BANK-SVC-CITIUS33",
        BENEFICIARY_BANK: "BANK-SVC-BARCGB22",
      },
      rolePartyIdentifiers: { DELIVERY_AGENT: "//FW021000021" },
      roleAccountReferences: { BENEFICIARY_BANK: "CREDITED-001" },
    });

    expect(resolve).toHaveBeenCalledWith(expect.objectContaining({
      roles: expect.objectContaining({
        DELIVERY_AGENT: "//FW021000021\nCITIUS33",
        BENEFICIARY_BANK: "/CREDITED-001\nBARCGB22",
      }),
    }));
  });

  it("returns Development 409 with remediation when data is missing", () => {
    process.env["SSI_RUNTIME_ENV"] = "development";
    const service = new FinControlledResolutionService(
      { list: jest.fn(() => ({ count: 0, candidates: [] })) } as never,
      {} as never,
      {} as never,
    );
    try {
      service.resolve(request);
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(409);
      expect((error as HttpException).getResponse()).toMatchObject({
        code: "INCORRECT_SSI_CONFIGURATION",
        payloadGenerated: false,
      });
    }
  });

  it("preserves fail-closed mandatory-role errors", () => {
    const service = new FinControlledResolutionService(
      { list: jest.fn(() => ({ fixtureFamily: "MT347-SR2026-SSI", source: "CANONICAL_DATABASE", count: 1, candidates: [candidate] })) } as never,
      { resolve: jest.fn(() => { throw new UnprocessableEntityException({ code: "MANDATORY_FIN_ROLE_UNAVAILABLE", payloadGenerated: false }); }) } as never,
      {} as never,
    );
    expect(() => service.resolve(request)).toThrow(UnprocessableEntityException);
  });

  it.each([
    ["MT416", "MESSAGE_TYPE_NOT_SUPPORTED"],
    ["MT785", "OUT_OF_SSI_SCOPE"],
  ])("rejects boundary message %s before DB lookup", (messageType, code) => {
    const list = jest.fn();
    const service = new FinControlledResolutionService(
      { list } as never,
      {} as never,
      {} as never,
    );
    try {
      service.resolve({ ...request, messageType });
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
        code,
        auditRecorded: true,
        payloadGenerated: false,
      });
      expect(list).not.toHaveBeenCalled();
    }
  });
});
