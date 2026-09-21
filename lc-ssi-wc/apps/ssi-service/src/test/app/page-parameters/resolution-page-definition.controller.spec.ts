import type {
  ResolutionPageDefinitionEnvelope,
  ResolutionPageDefinitionIndexEnvelope,
} from "@ssi/contracts";
import { ResolutionPageDefinitionController } from "../../../app/page-parameters/resolution-page-definition.controller";
import type { ResolutionPageAggregationService } from "../../../app/page-parameters/resolution-page-aggregation.service";

describe("ResolutionPageDefinitionController", () => {
  const dependencies = () => ({
    lookups: {
      bankService: jest.fn(() => ({
        provider: "BANK_SERVICE",
        action: "BANK_SERVICE",
        bankServiceId: "BANK-SVC-CITIUS33",
        bic: "CITIUS33",
        displayValue: "CITIUS33",
      })),
      bankServices: jest.fn(() => ({
        provider: "BANK_SERVICE",
        action: "BANK_SERVICE",
        items: [],
      })),
      ssiCounterparties: jest.fn(() => ({
        provider: "SSI_COUNTERPARTY",
        action: "SSI_COUNTERPARTY",
        items: [],
      })),
      ownAccountReceivers: jest.fn(() => ({
        provider: "BANK_SERVICE",
        action: "OWN_ACCOUNT_RECEIVER",
        items: [],
      })),
      nostroAccounts: jest.fn(() => ({
        provider: "NOSTRO_ACCOUNT",
        action: "NOSTRO_ACCOUNT",
        items: [],
      })),
    },
    submissions: { execute: jest.fn(() => ({ outcome: "REFERENCE_ONLY" })) },
  });

  it("passes the complete governed SSI counterparty dependency context", () => {
    const pages = {
      get: jest.fn(),
      index: jest.fn(),
    } as unknown as ResolutionPageAggregationService;
    const { lookups, submissions } = dependencies();
    const controller = new ResolutionPageDefinitionController(
      pages,
      lookups as never,
      submissions as never,
    );
    expect(
      controller.ssiCounterparties(
        "MT300-001",
        "MT300",
        "B1",
        "USD",
        "HK01",
        "2026-09-13",
        "CITI",
      ),
    ).toMatchObject({ provider: "SSI_COUNTERPARTY" });
    expect(lookups.ssiCounterparties).toHaveBeenCalledWith({
      scenarioId: "MT300-001",
      messageType: "MT300",
      sequence: "B1",
      currency: "USD",
      bookingEntity: "HK01",
      valueDate: "2026-09-13",
      query: "CITI",
    });
  });

  it("passes governed own-account receiver and Nostro route context atomically", () => {
    const pages = {
      get: jest.fn(),
      index: jest.fn(),
    } as unknown as ResolutionPageAggregationService;
    const { lookups, submissions } = dependencies();
    const controller = new ResolutionPageDefinitionController(
      pages,
      lookups as never,
      submissions as never,
    );

    expect(
      controller.ownAccountReceivers(
        "MT202-OP-BOOK",
        "MT202",
        "USD",
        "HK01",
        "2026-09-15",
        "CITI",
      ),
    ).toMatchObject({ action: "OWN_ACCOUNT_RECEIVER" });
    expect(lookups.ownAccountReceivers).toHaveBeenCalledWith({
      scenarioId: "MT202-OP-BOOK",
      messageType: "MT202",
      currency: "USD",
      bookingEntity: "HK01",
      valueDate: "2026-09-15",
      query: "CITI",
    });

    const lookup = {
      scenarioId: "MT202-OP-BOOK",
      messageType: "MT202",
      currency: "USD",
      bookingEntity: "HK01",
      valueDate: "2026-09-15",
      receiverBankServiceId: "BANK-SVC-CITIUS33",
      ownDebitAccountId: "NOSTRO-DEBIT-1",
      targetRole: "OWN_CREDIT_ACCOUNT",
      query: "primary",
    };
    expect(controller.nostroAccounts(lookup)).toMatchObject({
      action: "NOSTRO_ACCOUNT",
    });
    expect(lookups.nostroAccounts).toHaveBeenCalledWith(lookup);

    controller.nostroAccounts({});
    expect(lookups.nostroAccounts).toHaveBeenLastCalledWith({
      scenarioId: "",
      messageType: "",
      currency: "",
      bookingEntity: "",
      valueDate: "",
      receiverBankServiceId: "",
      ownDebitAccountId: "",
      targetRole: "",
      query: "",
    });
  });

  it("passes the complete typed query to the aggregation boundary", () => {
    const envelope = {
      contract: {},
      contractSha256: "a".repeat(64),
    } as unknown as ResolutionPageDefinitionEnvelope;
    const pages = {
      get: jest.fn(() => envelope),
      index: jest.fn(),
    } as unknown as ResolutionPageAggregationService;
    const { lookups, submissions } = dependencies();
    const controller = new ResolutionPageDefinitionController(
      pages,
      lookups as never,
      submissions as never,
    );

    expect(
      controller.get(
        "SR2026",
        "MT347",
        "MT399",
        "OUTGOING",
        "SCN-SYNTHETIC",
        "",
      ),
    ).toBe(envelope);
    expect(pages.get).toHaveBeenCalledWith({
      standardsRelease: "SR2026",
      messageFamily: "MT347",
      messageType: "MT399",
      direction: "OUTGOING",
      businessScenarioId: "SCN-SYNTHETIC",
    });
  });

  it("returns the versioned index unchanged", () => {
    const index = {
      schemaVersion: "1.0",
      indexVersion: "b".repeat(64),
      items: [],
    } as ResolutionPageDefinitionIndexEnvelope;
    const pages = {
      get: jest.fn(),
      index: jest.fn(() => index),
    } as unknown as ResolutionPageAggregationService;
    const { lookups, submissions } = dependencies();
    const controller = new ResolutionPageDefinitionController(
      pages,
      lookups as never,
      submissions as never,
    );

    expect(controller.index("SR2026")).toBe(index);
    expect(pages.index).toHaveBeenCalledWith("SR2026");
  });

  it("passes an authoritative business-domain filter and rejects unknown domains", () => {
    const index = {
      schemaVersion: "1.0",
      indexVersion: "b".repeat(64),
      items: [],
    } as ResolutionPageDefinitionIndexEnvelope;
    const pages = {
      get: jest.fn(),
      index: jest.fn(() => index),
    } as unknown as ResolutionPageAggregationService;
    const { lookups, submissions } = dependencies();
    const controller = new ResolutionPageDefinitionController(
      pages,
      lookups as never,
      submissions as never,
    );

    expect(controller.index("SR2026", "TREASURY")).toBe(index);
    expect(pages.index).toHaveBeenCalledWith("SR2026", "TREASURY");
    expect(controller.index("SR2026", "PAYMENT" as never)).toBe(index);
    expect(pages.index).toHaveBeenCalledWith("SR2026", "PAYMENT");
    expect(() => controller.index("SR2026", "INVALID" as never)).toThrow();
  });

  it("provides both searchable and exact Bank Service lookup contracts", () => {
    const pages = {
      get: jest.fn(),
      index: jest.fn(),
    } as unknown as ResolutionPageAggregationService;
    const { lookups, submissions } = dependencies();
    const controller = new ResolutionPageDefinitionController(
      pages,
      lookups as never,
      submissions as never,
    );

    expect(controller.bankService("", "CITI")).toMatchObject({ items: [] });
    expect(lookups.bankServices).toHaveBeenCalledWith("CITI");
    expect(controller.bankService("BANK-SVC-CITIUS33", "")).toMatchObject({
      bic: "CITIUS33",
    });
    expect(lookups.bankService).toHaveBeenCalledWith("BANK-SVC-CITIUS33");
  });

  it("delegates execution to the server-side submission adapter", () => {
    const pages = {
      get: jest.fn(),
      index: jest.fn(),
    } as unknown as ResolutionPageAggregationService;
    const { lookups, submissions } = dependencies();
    const controller = new ResolutionPageDefinitionController(
      pages,
      lookups as never,
      submissions as never,
    );
    const body = {
      definitionId: "PAGE-X",
      definitionVersion: "v1",
      contractSha256: "a".repeat(64),
      scenarioId: "SCN-X",
      fixtureBindingId: "FIX-X",
      values: {},
    };

    expect(controller.execute(body)).toMatchObject({
      outcome: "REFERENCE_ONLY",
    });
    expect(submissions.execute).toHaveBeenCalledWith(body);
  });

  it("uses explicit empty defaults for every optional query", () => {
    const pages = {
      get: jest.fn(() => ({ contract: {}, contractSha256: "a".repeat(64) })),
      index: jest.fn(() => ({ schemaVersion: "1.0", indexVersion: "b".repeat(64), items: [] })),
    } as unknown as ResolutionPageAggregationService;
    const { lookups, submissions } = dependencies();
    const controller = new ResolutionPageDefinitionController(
      pages,
      lookups as never,
      submissions as never,
    );

    controller.bankService();
    expect(lookups.bankServices).toHaveBeenCalledWith("");
    controller.ssiCounterparties();
    expect(lookups.ssiCounterparties).toHaveBeenCalledWith({
      scenarioId: "",
      messageType: "",
      sequence: "",
      currency: "",
      bookingEntity: "",
      valueDate: "",
      query: "",
    });
    controller.ownAccountReceivers();
    expect(lookups.ownAccountReceivers).toHaveBeenCalledWith({
      scenarioId: "",
      messageType: "",
      currency: "",
      bookingEntity: "",
      valueDate: "",
      query: "",
    });
    controller.index();
    expect(pages.index).toHaveBeenCalledWith("SR2026");
    controller.get();
    expect(pages.get).toHaveBeenCalledWith({
      standardsRelease: "",
      messageFamily: "",
      messageType: "",
      direction: "",
    });
  });

  it("passes every optional definition discriminator when present", () => {
    const pages = { get: jest.fn(() => ({})), index: jest.fn() } as unknown as ResolutionPageAggregationService;
    const { lookups, submissions } = dependencies();
    const controller = new ResolutionPageDefinitionController(
      pages,
      lookups as never,
      submissions as never,
    );

    controller.get(
      "SR2026",
      "MT2",
      "MT202",
      "OUTGOING",
      "DIRECT",
      "swift.cbprplus.04",
      "PAYMENT",
    );
    expect(pages.get).toHaveBeenCalledWith({
      standardsRelease: "SR2026",
      messageFamily: "MT2",
      messageType: "MT202",
      direction: "OUTGOING",
      businessScenarioId: "DIRECT",
      businessService: "swift.cbprplus.04",
      businessDomain: "PAYMENT",
    });
  });
});
