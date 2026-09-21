import { HttpException, UnprocessableEntityException } from "@nestjs/common";
import { FinControlledResolutionService } from "../../app/fin-controlled-resolution.service";

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
