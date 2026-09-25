import "reflect-metadata";
import { BadGatewayException, HttpException } from "@nestjs/common";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { NestFactory } from "@nestjs/core";
import { UpstreamApiInterceptor } from "../upstream-api.interceptor";

jest.mock("@nestjs/core", () => ({
  NestFactory: {
    create: jest.fn().mockResolvedValue({
      enableCors: jest.fn(),
      listen: jest.fn().mockResolvedValue(undefined),
    }),
  },
}));

type Controller = Record<string, (...args: unknown[]) => Promise<unknown>>;

const jsonResponse = (body: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  }) as unknown as Response;

describe("SSI BFF forwarding contract", () => {
  let controller: Controller;
  const originalFetch = global.fetch;

  beforeAll(async () => {
    await import("../main");
    const moduleType = (NestFactory.create as jest.Mock).mock.calls[0]?.[0];
    const [controllerType] = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      moduleType,
    ) as Array<new () => Controller>;
    controller = new controllerType();
  });

  beforeEach(() => {
    global.fetch = jest.fn();
    process.env["SSI_SERVICE_URL"] = "http://ssi.test";
    process.env["REFERENCE_SERVICE_URL"] = "http://reference.test";
    process.env["API_RETRY_MAX_RETRIES"] = "0";
  });

  afterAll(() => {
    global.fetch = originalFetch;
    delete process.env["SSI_SERVICE_URL"];
    delete process.env["REFERENCE_SERVICE_URL"];
    delete process.env["API_RETRY_MAX_RETRIES"];
  });

  it("summarises dashboard status without changing upstream records", async () => {
    const records = [
      { id: "1", status: "ACTIVE" },
      { id: "2", status: "PENDING_APPROVAL" },
      { id: "3", status: "REVOKED" },
    ];
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(records));

    await expect(controller["dashboard"]()).resolves.toEqual({
      counts: { total: 3, active: 1, pending: 1 },
      recent: records,
    });
  });

  it("gives Demo Reload a longer non-retryable upstream window", async () => {
    const intercept = jest
      .spyOn(UpstreamApiInterceptor.prototype, "intercept")
      .mockResolvedValue(jsonResponse({ code: "DEMO_DATA_RELOADED" }, 201));
    try {
      await controller["reloadDevelopmentData"]({
        authorizationToken: "token",
      });
      expect(intercept).toHaveBeenCalledWith(
        "http://ssi.test/api/settings/development-data/reload",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ authorizationToken: "token" }),
        }),
        120_000,
      );
      expect(intercept).toHaveBeenCalledTimes(1);
    } finally {
      intercept.mockRestore();
    }
  });

  it("allows the Payment SSI execute request to finish beyond the default ten-second BFF window", async () => {
    const intercept = jest
      .spyOn(UpstreamApiInterceptor.prototype, "intercept")
      .mockResolvedValue(jsonResponse({ outcome: "RESOLVED" }));
    try {
      const body = { scenarioId: "MT202-OP-DIRECT" };
      await controller["executeResolutionPage"](body);
      expect(intercept).toHaveBeenCalledWith(
        "http://ssi.test/api/v1/resolution-page-definitions/execute",
        expect.objectContaining({ method: "POST", body: JSON.stringify(body) }),
        30_000,
      );
    } finally {
      intercept.mockRestore();
    }
  });

  const proxyCases: Array<{
    name: string;
    method: string;
    args: unknown[];
    url: string;
    httpMethod?: string;
    body?: unknown;
  }> = [
    {
      name: "runtime settings",
      method: "runtimeSettings",
      args: [],
      url: "http://ssi.test/api/settings/runtime",
    },
    {
      name: "resolution currency inquiry",
      method: "resolutionCurrencyInquiry",
      args: ["2", "25", "PAYMENT", "ACTIVE", "USD", "currency", "desc"],
      url: "http://ssi.test/api/settings/resolution-currencies?page=2&pageSize=25&businessDomain=PAYMENT&status=ACTIVE&search=USD&sortBy=currency&sortDirection=desc",
    },
    {
      name: "resolution currency resync",
      method: "resyncResolutionCurrencies",
      args: [],
      url: "http://ssi.test/api/settings/resolution-currencies/resync",
      httpMethod: "POST",
    },
    {
      name: "development data reload",
      method: "reloadDevelopmentData",
      args: [{ authorizationToken: "token" }],
      url: "http://ssi.test/api/settings/development-data/reload",
      httpMethod: "POST",
      body: { authorizationToken: "token" },
    },
    {
      name: "development data export",
      method: "exportCurrentDatabase",
      args: [],
      url: "http://ssi.test/api/settings/development-data/export",
      httpMethod: "POST",
    },
    {
      name: "development data QA evidence",
      method: "developmentDataEvidence",
      args: [{ password: "entered" }],
      url: "http://ssi.test/api/settings/development-data/evidence",
      httpMethod: "POST",
      body: { password: "entered" },
    },
    {
      name: "development data reload authorization",
      method: "authorizeDevelopmentDataReload",
      args: [{ password: "entered" }],
      url: "http://ssi.test/api/settings/development-data/reload/authorize",
      httpMethod: "POST",
      body: { password: "entered" },
    },
    {
      name: "development data reload cancellation",
      method: "cancelDevelopmentDataReload",
      args: [{ authorizationToken: "token" }],
      url: "http://ssi.test/api/settings/development-data/reload/cancel",
      httpMethod: "POST",
      body: { authorizationToken: "token" },
    },
    {
      name: "settlement resolution",
      method: "resolveSettlement",
      args: [{ counterpartyBankServiceId: "BANK-SVC-CITIUS33" }],
      url: "http://ssi.test/api/settlements/resolve",
      httpMethod: "POST",
      body: { counterpartyBankServiceId: "BANK-SVC-CITIUS33" },
    },
    {
      name: "own-account settlement resolution",
      method: "resolveOwnAccountSettlement",
      args: [{ receiverBankServiceId: "BANK-SVC-CITIUS33" }],
      url: "http://ssi.test/api/own-account-settlements/resolve",
      httpMethod: "POST",
      body: { receiverBankServiceId: "BANK-SVC-CITIUS33" },
    },
    {
      name: "financial-institution direct debit resolution",
      method: "resolveFiDirectDebit",
      args: [{ debitInstitutionBankServiceId: "BANK-SVC-CITIUS33" }],
      url: "http://ssi.test/api/fi-direct-debits/resolve",
      httpMethod: "POST",
      body: { debitInstitutionBankServiceId: "BANK-SVC-CITIUS33" },
    },
    {
      name: "payment notification resolution",
      method: "resolvePaymentNotification",
      args: [{ orderingInstitutionBankServiceId: "BANK-SVC-CHASUS33" }],
      url: "http://ssi.test/api/payment-notifications/resolve",
      httpMethod: "POST",
      body: { orderingInstitutionBankServiceId: "BANK-SVC-CHASUS33" },
    },
    {
      name: "confirmed settlement",
      method: "confirmSettlement",
      args: ["resolution/a", { routeId: "R-1" }],
      url: "http://ssi.test/api/settlements/resolution%2Fa/confirm",
      httpMethod: "POST",
      body: { routeId: "R-1" },
    },
    {
      name: "SSI applicability",
      method: "applicability",
      args: ["ssi/a"],
      url: "http://ssi.test/api/ssis/applicability?ssiId=ssi%2Fa",
    },
    {
      name: "bank directory search",
      method: "banks",
      args: ["2", "10", "Citi & Co"],
      url: "http://reference.test/mock/banks?page=2&pageSize=10&query=Citi%20%26%20Co",
    },
    {
      name: "nostro lookup",
      method: "nostros",
      args: ["USD", "CITI/US"],
      url: "http://reference.test/mock/nostros?currency=USD&bankBic=CITI%2FUS",
    },
    {
      name: "message generation",
      method: "generate",
      args: [{ messageType: "MT202" }],
      url: "http://ssi.test/api/messages/generate",
      httpMethod: "POST",
      body: { messageType: "MT202" },
    },
    {
      name: "payment message index",
      method: "paymentMessageIndex",
      args: [],
      url: "http://ssi.test/api/settlements/message-index",
    },
    {
      name: "batch settlement resolution",
      method: "resolveSettlementBatch",
      args: [{ requests: [{ sourceMessageType: "MT203" }] }],
      url: "http://ssi.test/api/settlements/resolve-batch",
      httpMethod: "POST",
      body: { requests: [{ sourceMessageType: "MT203" }] },
    },
    {
      name: "settlement clearing options",
      method: "settlementClearingOptions",
      args: [{ currency: "USD" }],
      url: "http://ssi.test/api/settlements/clearing-options",
      httpMethod: "POST",
      body: { currency: "USD" },
    },
    {
      name: "outbound RMA check",
      method: "checkRma",
      args: [{ receiverBic: "CITIUS33", messageType: "pacs.009.001.08" }],
      url: "http://ssi.test/api/rma-authorisations/check",
      httpMethod: "POST",
      body: {
        receiverBic: "CITIUS33",
        messageType: "pacs.009.001.08",
      },
    },
    {
      name: "nostro resolution",
      method: "resolveNostro",
      args: [{ bookingEntity: "HK01", currency: "USD" }],
      url: "http://ssi.test/api/nostro-accounts/resolve",
      httpMethod: "POST",
      body: { bookingEntity: "HK01", currency: "USD" },
    },
    {
      name: "single Bank Service identity",
      method: "bank",
      args: ["CITI/US"],
      url: "http://reference.test/mock/banks/CITI%2FUS",
    },
    {
      name: "counterparty master",
      method: "counterparties",
      args: [],
      url: "http://reference.test/mock/counterparties",
    },
    {
      name: "booking branch master",
      method: "bookingBranches",
      args: [],
      url: "http://reference.test/mock/booking-branches",
    },
    {
      name: "clearing-system capability",
      method: "clearingSystems",
      args: ["USD", "US"],
      url: "http://reference.test/mock/clearing-systems?currency=USD&settlementCountry=US",
    },
    {
      name: "SSI list",
      method: "list",
      args: [],
      url: "http://ssi.test/api/ssis",
    },
    {
      name: "SSI creation",
      method: "create",
      args: [{ maker: "maker" }],
      url: "http://ssi.test/api/ssis",
      httpMethod: "POST",
      body: { maker: "maker" },
    },
    {
      name: "SSI update",
      method: "update",
      args: ["ssi/a", { maker: "maker" }],
      url: "http://ssi.test/api/ssis/ssi%2Fa",
      httpMethod: "PUT",
      body: { maker: "maker" },
    },
    {
      name: "SSI applicability replacement",
      method: "replaceApplicability",
      args: ["ssi/a", { actor: "ops", records: [] }],
      url: "http://ssi.test/api/ssis/ssi%2Fa/applicability",
      httpMethod: "PUT",
      body: { actor: "ops", records: [] },
    },
    {
      name: "SSI revision",
      method: "revise",
      args: ["ssi/a", { maker: "maker2" }],
      url: "http://ssi.test/api/ssis/ssi%2Fa/revise",
      httpMethod: "POST",
      body: { maker: "maker2" },
    },
    {
      name: "SSI revocation",
      method: "revoke",
      args: ["ssi/a", { actor: "checker", reason: "retired" }],
      url: "http://ssi.test/api/ssis/ssi%2Fa",
      httpMethod: "DELETE",
      body: { actor: "checker", reason: "retired" },
    },
    {
      name: "SSI transition",
      method: "transition",
      args: ["ssi/a", "APPROVE/NOW", { actor: "checker" }],
      url: "http://ssi.test/api/ssis/ssi%2Fa/APPROVE%2FNOW",
      httpMethod: "POST",
      body: { actor: "checker" },
    },
    {
      name: "legacy resolution preview",
      method: "resolve",
      args: [{ currency: "USD" }],
      url: "http://ssi.test/api/ssis/resolve",
      httpMethod: "POST",
      body: { currency: "USD" },
    },
    {
      name: "legacy clearing options",
      method: "clearingOptions",
      args: [{ currency: "USD" }],
      url: "http://ssi.test/api/ssis/resolve/clearing-options",
      httpMethod: "POST",
      body: { currency: "USD" },
    },
    {
      name: "legacy resolution confirmation",
      method: "confirmResolution",
      args: [{ attemptId: "attempt-1" }],
      url: "http://ssi.test/api/ssis/resolve/confirm",
      httpMethod: "POST",
      body: { attemptId: "attempt-1" },
    },
    {
      name: "deprecated FIN tag suggestion",
      method: "suggestFinTags",
      args: [{ messageType: "MT400" }],
      url: "http://ssi.test/api/reference/fin-tag-suggestions",
      httpMethod: "POST",
      body: { messageType: "MT400" },
    },
    {
      name: "FIN tag resolution",
      method: "resolveFinTags",
      args: [{ messageType: "MT400" }],
      url: "http://ssi.test/api/reference/fin-tag-resolutions",
      httpMethod: "POST",
      body: { messageType: "MT400" },
    },
    {
      name: "FIN resolution catalogue",
      method: "finResolutionCatalogue",
      args: ["SR2026/patch"],
      url: "http://ssi.test/api/reference/fin-resolution-catalogue?standardsRelease=SR2026%2Fpatch",
    },
    {
      name: "resolution page definition index",
      method: "resolutionPageDefinitionIndex",
      args: ["SR2026/patch"],
      url: "http://ssi.test/api/v1/resolution-page-definitions/index?standardsRelease=SR2026%2Fpatch",
    },
    {
      name: "resolution page definition",
      method: "resolutionPageDefinition",
      args: ["SR2026", "MT347", "MT300", "OUTGOING", "MT300-FX-B1", ""],
      url: "http://ssi.test/api/v1/resolution-page-definitions?standardsRelease=SR2026&messageFamily=MT347&messageType=MT300&direction=OUTGOING&businessScenarioId=MT300-FX-B1",
    },
    {
      name: "SSI counterparty lookup",
      method: "resolutionPageSsiCounterpartyLookup",
      args: [
        "MT300-001",
        "MT300",
        "B1",
        "USD",
        "HK01",
        "2026-09-13",
        "CITI & Co",
      ],
      url: "http://ssi.test/api/v1/resolution-page-definitions/lookups/ssi-counterparties?scenarioId=MT300-001&messageType=MT300&sequence=B1&currency=USD&bookingEntity=HK01&valueDate=2026-09-13&query=CITI+%26+Co",
    },
    {
      name: "own-account receiver lookup",
      method: "resolutionPageOwnAccountReceiverLookup",
      args: [
        "MT202-OP-BOOK",
        "MT202",
        "USD",
        "HK01",
        "2026-09-15",
        "CITI & Co",
      ],
      url: "http://ssi.test/api/v1/resolution-page-definitions/lookups/own-account-receivers?scenarioId=MT202-OP-BOOK&messageType=MT202&currency=USD&bookingEntity=HK01&valueDate=2026-09-15&query=CITI+%26+Co",
    },
    {
      name: "own-account Nostro lookup",
      method: "resolutionPageNostroAccountLookup",
      args: [
        {
          scenarioId: "MT202-OP-BOOK",
          messageType: "MT202",
          currency: "USD",
          bookingEntity: "HK01",
          valueDate: "2026-09-15",
          receiverBankServiceId: "BANK-SVC-CITIUS33",
          ownDebitAccountId: "NOSTRO-DEBIT-1",
          targetRole: "OWN_CREDIT_ACCOUNT",
          query: "USD account",
        },
      ],
      url: "http://ssi.test/api/v1/resolution-page-definitions/lookups/nostro-accounts?scenarioId=MT202-OP-BOOK&messageType=MT202&currency=USD&bookingEntity=HK01&valueDate=2026-09-15&receiverBankServiceId=BANK-SVC-CITIUS33&ownDebitAccountId=NOSTRO-DEBIT-1&targetRole=OWN_CREDIT_ACCOUNT&query=USD+account",
    },
    {
      name: "message extraction",
      method: "extract",
      args: [{ format: "FIN_LIKE" }],
      url: "http://ssi.test/api/messages/extract",
      httpMethod: "POST",
      body: { format: "FIN_LIKE" },
    },
    {
      name: "message samples",
      method: "samples",
      args: [],
      url: "http://ssi.test/api/messages/samples",
    },
    {
      name: "message sample load",
      method: "loadSample",
      args: ["folder/sample.fin"],
      url: "http://ssi.test/api/messages/samples/load?path=folder%2Fsample.fin",
    },
    {
      name: "message sample directory import",
      method: "importDirectory",
      args: [],
      url: "http://ssi.test/api/messages/samples/import-directory",
      httpMethod: "POST",
    },
    {
      name: "RMA list",
      method: "listRma",
      args: [],
      url: "http://ssi.test/api/rma-authorisations",
    },
    {
      name: "RMA exact pair state",
      method: "rmaPairState",
      args: ["DEMOHKHH", "CITIUS33"],
      url: "http://ssi.test/api/rma-authorisations/pair-state?ownBic=DEMOHKHH&counterpartyBic=CITIUS33",
    },
    {
      name: "RMA creation",
      method: "createRma",
      args: [{ ownBic: "DEMOHKHH" }],
      url: "http://ssi.test/api/rma-authorisations",
      httpMethod: "POST",
      body: { ownBic: "DEMOHKHH" },
    },
    {
      name: "RMA update",
      method: "updateRma",
      args: ["rma/a", { actor: "maker" }],
      url: "http://ssi.test/api/rma-authorisations/rma%2Fa",
      httpMethod: "PUT",
      body: { actor: "maker" },
    },
    {
      name: "RMA revision",
      method: "reviseRma",
      args: ["rma/a", { actor: "maker2" }],
      url: "http://ssi.test/api/rma-authorisations/rma%2Fa/revise",
      httpMethod: "POST",
      body: { actor: "maker2" },
    },
    {
      name: "RMA transition",
      method: "transitionRma",
      args: ["rma/a", "ACTIVATE/NOW", { actor: "checker" }],
      url: "http://ssi.test/api/rma-authorisations/rma%2Fa/ACTIVATE%2FNOW",
      httpMethod: "POST",
      body: { actor: "checker" },
    },
    {
      name: "RMA revocation",
      method: "revokeRma",
      args: ["rma/a", { actor: "checker" }],
      url: "http://ssi.test/api/rma-authorisations/rma%2Fa",
      httpMethod: "DELETE",
      body: { actor: "checker" },
    },
    {
      name: "Nostro list",
      method: "listNostro",
      args: [],
      url: "http://ssi.test/api/nostro-accounts",
    },
    {
      name: "entity list",
      method: "listEntities",
      args: [],
      url: "http://ssi.test/api/booking-branch-entities",
    },
    {
      name: "entity creation",
      method: "createEntity",
      args: [{ entityCode: "HK01" }],
      url: "http://ssi.test/api/booking-branch-entities",
      httpMethod: "POST",
      body: { entityCode: "HK01" },
    },
    {
      name: "entity update",
      method: "updateEntity",
      args: ["entity/a", { actor: "maker" }],
      url: "http://ssi.test/api/booking-branch-entities/entity%2Fa",
      httpMethod: "PUT",
      body: { actor: "maker" },
    },
    {
      name: "entity revision",
      method: "reviseEntity",
      args: ["entity/a", { actor: "maker2" }],
      url: "http://ssi.test/api/booking-branch-entities/entity%2Fa/revise",
      httpMethod: "POST",
      body: { actor: "maker2" },
    },
    {
      name: "entity transition",
      method: "transitionEntity",
      args: ["entity/a", "APPROVE/NOW", { actor: "checker" }],
      url: "http://ssi.test/api/booking-branch-entities/entity%2Fa/APPROVE%2FNOW",
      httpMethod: "POST",
      body: { actor: "checker" },
    },
    {
      name: "entity revocation",
      method: "revokeEntity",
      args: ["entity/a", { actor: "checker" }],
      url: "http://ssi.test/api/booking-branch-entities/entity%2Fa",
      httpMethod: "DELETE",
      body: { actor: "checker" },
    },
    {
      name: "Nostro creation",
      method: "createNostro",
      args: [{ currency: "USD" }],
      url: "http://ssi.test/api/nostro-accounts",
      httpMethod: "POST",
      body: { currency: "USD" },
    },
    {
      name: "Nostro update",
      method: "updateNostro",
      args: ["nostro/a", { actor: "maker" }],
      url: "http://ssi.test/api/nostro-accounts/nostro%2Fa",
      httpMethod: "PUT",
      body: { actor: "maker" },
    },
    {
      name: "Nostro revision",
      method: "reviseNostro",
      args: ["nostro/a", { actor: "maker2" }],
      url: "http://ssi.test/api/nostro-accounts/nostro%2Fa/revise",
      httpMethod: "POST",
      body: { actor: "maker2" },
    },
    {
      name: "Nostro transition",
      method: "transitionNostro",
      args: ["nostro/a", "ACTIVATE/NOW", { actor: "checker" }],
      url: "http://ssi.test/api/nostro-accounts/nostro%2Fa/ACTIVATE%2FNOW",
      httpMethod: "POST",
      body: { actor: "checker" },
    },
    {
      name: "Nostro revocation",
      method: "revokeNostro",
      args: ["nostro/a", { actor: "checker" }],
      url: "http://ssi.test/api/nostro-accounts/nostro%2Fa",
      httpMethod: "DELETE",
      body: { actor: "checker" },
    },
    {
      name: "SWIFT data import",
      method: "importSwiftData",
      args: [{ source: "upload" }],
      url: "http://ssi.test/api/swift-data/imports",
      httpMethod: "POST",
      body: { source: "upload" },
    },
    {
      name: "currency reference",
      method: "currencies",
      args: [],
      url: "http://reference.test/mock/currencies",
    },
    {
      name: "country reference",
      method: "countries",
      args: [],
      url: "http://reference.test/mock/countries",
    },
    {
      name: "customer search",
      method: "customers",
      args: ["2", "10", "Acme & Co"],
      url: "http://reference.test/mock/customers?page=2&pageSize=10&query=Acme%20%26%20Co",
    },
    {
      name: "account lookup",
      method: "account",
      args: ["account/a"],
      url: "http://reference.test/mock/accounts/account%2Fa",
    },
    {
      name: "AML case lookup",
      method: "aml",
      args: ["case/a"],
      url: "http://reference.test/mock/aml/screening-status/case%2Fa",
    },
    {
      name: "SSI audit",
      method: "audit",
      args: [],
      url: "http://ssi.test/api/ssis/audit/events",
    },
    {
      name: "audit retention health",
      method: "auditRetentionHealth",
      args: [],
      url: "http://ssi.test/api/health/audit-retention",
    },
  ];

  it.each(proxyCases)(
    "forwards $name with encoded identity and unchanged payload",
    async ({ method, args, url, httpMethod, body }) => {
      (global.fetch as jest.Mock).mockResolvedValue(jsonResponse({ ok: true }));

      await expect(controller[method](...args)).resolves.toEqual({ ok: true });
      expect(global.fetch).toHaveBeenCalledWith(
        url,
        expect.objectContaining({
          ...(httpMethod ? { method: httpMethod } : {}),
          headers: { "content-type": "application/json" },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
      );
    },
  );

  it("preserves an upstream HTTP failure contract", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({ code: "PROFILE_INCOMPLETE" }, 503),
    );

    await expect(controller["resolveSettlement"]({})).rejects.toMatchObject({
      status: 503,
      response: { code: "PROFILE_INCOMPLETE" },
    } satisfies Partial<HttpException>);
  });

  it("fails closed when an upstream service cannot be reached", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("connection lost"));

    await expect(controller["banks"]()).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it.each([
    [
      "resolutionCurrencyInquiry",
      [],
      "http://ssi.test/api/settings/resolution-currencies",
    ],
    [
      "list",
      [
        {
          status: "ACTIVE",
          ownershipType: "COUNTERPARTY",
          counterpartyId: "cp/a",
          page: "2",
          pageSize: "25",
          search: "Citi & Co",
          sortBy: "currency",
          sortDirection: "desc",
        },
      ],
      "http://ssi.test/api/ssis?status=ACTIVE&ownershipType=COUNTERPARTY&counterpartyId=cp%2Fa&page=2&pageSize=25&search=Citi+%26+Co&sortBy=currency&sortDirection=desc",
    ],
    [
      "counterpartyCoverage",
      [],
      "http://ssi.test/api/ssis/counterparty-coverage?status=ACTIVE",
    ],
    ["applicability", [], "http://ssi.test/api/ssis/applicability"],
    [
      "finResolutionCatalogue",
      [],
      "http://ssi.test/api/reference/fin-resolution-catalogue?standardsRelease=SR2026",
    ],
    [
      "resolutionPageDefinitionIndex",
      [],
      "http://ssi.test/api/v1/resolution-page-definitions/index?standardsRelease=SR2026",
    ],
    [
      "resolutionPageDefinitionIndex",
      ["SR2026", "PAYMENT"],
      "http://ssi.test/api/v1/resolution-page-definitions/index?standardsRelease=SR2026&businessDomain=PAYMENT",
    ],
    [
      "resolutionPageDefinition",
      [],
      "http://ssi.test/api/v1/resolution-page-definitions?standardsRelease=&messageFamily=&messageType=&direction=",
    ],
    [
      "resolutionPageDefinition",
      [
        "SR2026",
        "MT2",
        "MT202",
        "OUTGOING",
        "DIRECT",
        "swift.cbprplus.04",
        "PAYMENT",
      ],
      "http://ssi.test/api/v1/resolution-page-definitions?standardsRelease=SR2026&messageFamily=MT2&messageType=MT202&direction=OUTGOING&businessScenarioId=DIRECT&businessService=swift.cbprplus.04&businessDomain=PAYMENT",
    ],
    [
      "resolutionPageBankServiceLookup",
      [],
      "http://ssi.test/api/v1/resolution-page-definitions/lookups/bank-services?",
    ],
    [
      "resolutionPageBankServiceLookup",
      ["bank/a", "Citi & Co"],
      "http://ssi.test/api/v1/resolution-page-definitions/lookups/bank-services?bankServiceId=bank%2Fa&query=Citi+%26+Co",
    ],
    [
      "resolutionPageSsiCounterpartyLookup",
      [],
      "http://ssi.test/api/v1/resolution-page-definitions/lookups/ssi-counterparties?scenarioId=&messageType=&sequence=&currency=&bookingEntity=&valueDate=",
    ],
    [
      "resolutionPageOwnAccountReceiverLookup",
      [],
      "http://ssi.test/api/v1/resolution-page-definitions/lookups/own-account-receivers?scenarioId=&messageType=&currency=&bookingEntity=&valueDate=",
    ],
    [
      "resolutionPageNostroAccountLookup",
      [{}],
      "http://ssi.test/api/v1/resolution-page-definitions/lookups/nostro-accounts?scenarioId=&messageType=&currency=&bookingEntity=&valueDate=&receiverBankServiceId=&ownDebitAccountId=&targetRole=",
    ],
    [
      "finControlledFixtures",
      [],
      "http://ssi.test/api/reference/fin-controlled-fixtures?messageType=&currency=&bookingEntity=&valueDate=",
    ],
    [
      "finControlledFixtures",
      ["MT300", "B1", "USD", "HK01", "2026-09-21", "fixture/a"],
      "http://ssi.test/api/reference/fin-controlled-fixtures?messageType=MT300&currency=USD&bookingEntity=HK01&valueDate=2026-09-21&sequence=B1&bindingId=fixture%2Fa",
    ],
    [
      "clearingSystems",
      [],
      "http://reference.test/mock/clearing-systems?currency=&settlementCountry=",
    ],
    [
      "customers",
      [],
      "http://reference.test/mock/customers?page=1&pageSize=5&query=",
    ],
    ["nostros", [], "http://reference.test/mock/nostros?currency=&bankBic="],
  ])(
    "covers default and optional query behavior for %s",
    async (method, args, url) => {
      (global.fetch as jest.Mock).mockResolvedValue(jsonResponse({ ok: true }));

      await expect(controller[method](...args)).resolves.toEqual({ ok: true });
      expect(global.fetch).toHaveBeenLastCalledWith(
        url,
        expect.objectContaining({
          headers: { "content-type": "application/json" },
        }),
      );
    },
  );

  it("uses local service defaults when endpoint overrides are absent", async () => {
    delete process.env["SSI_SERVICE_URL"];
    delete process.env["REFERENCE_SERVICE_URL"];
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse({ ok: true }));

    await controller["runtimeSettings"]();
    await controller["currencies"]();

    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      "http://localhost:3101/api/settings/runtime",
      expect.any(Object),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "http://localhost:3102/mock/currencies",
      expect.any(Object),
    );
  });
});
