import { BadRequestException } from "@nestjs/common";
import { MessageController } from "../../app/message.controller";
import { ReferenceSuggestionController } from "../../app/reference-suggestion.controller";
import { SampleController } from "../../app/sample.controller";
import { SsiController } from "../../app/ssi.controller";
import { SwiftDataImportController } from "../../app/imports/swift-data-import.controller";

describe("thin controller delegation coverage", () => {
  it("delegates message parsing, extraction, and generation without reshaping", () => {
    const parsed = { messageType: "MT202" };
    const service = {
      parse: jest.fn(() => parsed),
      extract: jest.fn(() => ({ roles: {} })),
      generate: jest.fn(() => "{1:F01...}"),
    };
    const controller = new MessageController(service as never);

    expect(controller.extract({ content: "message", format: "FIN_LIKE" })).toEqual({ roles: {} });
    expect(service.parse).toHaveBeenCalledWith("message", "FIN_LIKE");
    expect(service.extract).toHaveBeenCalledWith(parsed);
    const descriptor = {
      standardsRelease: "SR2026",
      messageType: "MT202",
      direction: "OUTGOING" as const,
      businessFunction: "FI_TRANSFER",
    };
    expect(controller.generate({ message: descriptor, roles: { DEBTOR_AGENT: "AAAAUS33" } })).toBe("{1:F01...}");
    expect(service.generate).toHaveBeenCalledWith(descriptor, { DEBTOR_AGENT: "AAAAUS33" });
  });

  it("delegates sample list, load, and controlled directory import", () => {
    const service = {
      list: jest.fn(() => ["sample.fin"]),
      load: jest.fn(() => "content"),
      importDirectory: jest.fn(() => ({ imported: 1 })),
    };
    const controller = new SampleController(service as never);

    expect(controller.list()).toEqual(["sample.fin"]);
    expect(controller.load("samples/sample.fin")).toBe("content");
    expect(controller.importDirectory()).toEqual({ imported: 1 });
    expect(service.load).toHaveBeenCalledWith("samples/sample.fin");
  });

  it("delegates SWIFT data import without altering its source identity", () => {
    const service = { import: jest.fn(() => ({ imported: 2 })) };
    const controller = new SwiftDataImportController(service as never);
    const request = { importType: "RMA", records: [{ id: "RMA-1" }] } as never;

    expect(controller.upload(request)).toEqual({ imported: 2 });
    expect(service.import).toHaveBeenCalledWith(request);
  });

  it.each([
    ["MT300", undefined, "TREASURY"],
    ["MT700", undefined, "TRADE_FINANCE"],
    ["MT202", "PAYMENT", "PAYMENT"],
  ])("builds deprecated suggestions with governed %s resolution mode", (messageType, suppliedMode, expectedMode) => {
    const service = {
      resolve: jest.fn(() => ({
        outcome: "RESOLVED",
        resolvedFields: [
          {
            tag: "57",
            sequence: "A",
            option: "A",
            officialRole: "ACCOUNT_WITH_INSTITUTION",
            officialFieldName: "Account With Institution",
            resolutionStatus: "RESOLVED",
            resolvedValue: "CITIUS33",
            provenance: { ruleId: "RULE-57A" },
          },
          { tag: "56", resolutionStatus: "NOT_REQUIRED", resolvedValue: null },
        ],
      })),
    };
    const controller = new ReferenceSuggestionController(service as never);
    const request = {
      standardsRelease: "SR2026",
      messageType,
      businessFunction: "TRANSFER",
      transactionReference: "TX-1",
      sourceSsiId: "SSI-1",
      ...(suppliedMode ? { resolutionMode: suppliedMode } : {}),
    } as never;

    const result = controller.suggest(request) as Record<string, unknown>;
    expect(service.resolve).toHaveBeenCalledWith(expect.objectContaining({ resolutionMode: expectedMode }));
    expect(result["deprecated"]).toBe(true);
    expect(result["fields"]).toEqual({ "57": "CITIUS33" });
    expect(result["suggestions"]).toEqual([
      expect.objectContaining({
        tag: "57",
        suggestedValue: "CITIUS33",
        provenance: expect.objectContaining({
          standardsRelease: "SR2026",
          transactionReference: "TX-1",
        }),
      }),
    ]);
  });

  it("delegates every SSI lifecycle and resolution endpoint", () => {
    const result = { ok: true };
    const service = {
      list: jest.fn(() => result),
      listPage: jest.fn(() => result),
      summary: jest.fn(() => result),
      counterpartyCoverage: jest.fn(() => result),
      listApplicability: jest.fn(() => result),
      create: jest.fn(() => result),
      update: jest.fn(() => result),
      replaceApplicability: jest.fn(() => result),
      revise: jest.fn(() => result),
      cancelRevision: jest.fn(() => result),
      suppress: jest.fn(() => result),
      revoke: jest.fn(() => result),
      confirm: jest.fn(() => result),
      clearingOptions: jest.fn(() => result),
      resolve: jest.fn(() => result),
      transition: jest.fn(() => result),
      audit: jest.fn(() => result),
    };
    const controller = new SsiController(service as never);
    const command = { maker: "maker" } as never;

    expect(controller.list({ status: "ACTIVE" })).toBe(result);
    expect(service.list).toHaveBeenCalledWith("ACTIVE");
    expect(controller.list({ page: "2", pageSize: "500", search: "Citi", sortBy: "counterpartyId", sortDirection: "DESC" })).toBe(result);
    expect(service.listPage).toHaveBeenCalledWith({
      page: 2,
      pageSize: 100,
      search: "Citi",
      sortBy: "counterpartyId",
      sortDirection: "DESC",
    });
    expect(controller.list({ status: "ACTIVE", ownershipType: "COUNTERPARTY", counterpartyId: "CP-1", page: "1", pageSize: "20", search: "", sortBy: "id", sortDirection: "ASC" })).toBe(result);
    expect(service.listPage).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 20,
      status: "ACTIVE",
      ownershipType: "COUNTERPARTY",
      counterpartyId: "CP-1",
      search: "",
      sortBy: "id",
      sortDirection: "ASC",
    });
    expect(controller.list({ ownershipType: "OWN" })).toBe(result);
    expect(service.listPage).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 20,
      ownershipType: "OWN",
    });
    for (const values of [
      ["bad", "20"],
      ["0", "20"],
      ["1", "bad"],
      ["1", "0"],
    ]) {
      expect(() => controller.list({ page: values[0], pageSize: values[1] }))
        .toThrow(BadRequestException);
    }

    expect(controller.summary()).toBe(result);
    expect(controller.counterpartyCoverage("ACTIVE")).toBe(result);
    expect(controller.applicability("SSI-1")).toBe(result);
    expect(controller.create(command)).toBe(result);
    expect(controller.update("SSI-1", command)).toBe(result);
    expect(controller.replaceApplicability("SSI-1", {} as never)).toBe(result);
    expect(controller.revise("SSI-1", { maker: "maker" })).toBe(result);
    expect(controller.cancelRevision("SSI-1", { actor: "maker" })).toBe(result);
    expect(controller.suppress("SSI-1", { maker: "maker", reason: "duplicate" })).toBe(result);
    expect(controller.revoke("SSI-1", { actor: "checker", reason: "retired" })).toBe(result);
    expect(controller.confirm({} as never)).toBe(result);
    expect(controller.clearingOptions({} as never)).toBe(result);
    expect(controller.resolve({} as never)).toBe(result);
    expect(controller.submit("SSI-1", { actor: "maker" })).toBe(result);
    expect(controller.approve("SSI-1", { actor: "checker" })).toBe(result);
    expect(controller.reject("SSI-1", { actor: "checker", reason: "incorrect" })).toBe(result);
    expect(controller.activate("SSI-1", { actor: "checker" })).toBe(result);
    expect(controller.audit()).toBe(result);
    expect(service.transition).toHaveBeenNthCalledWith(1, "SSI-1", "SUBMIT", "maker");
    expect(service.transition).toHaveBeenNthCalledWith(2, "SSI-1", "APPROVE", "checker");
    expect(service.transition).toHaveBeenNthCalledWith(3, "SSI-1", "REJECT", "checker", "incorrect");
    expect(service.transition).toHaveBeenNthCalledWith(4, "SSI-1", "ACTIVATE", "checker");
  });
});
