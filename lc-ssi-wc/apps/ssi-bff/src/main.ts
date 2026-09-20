import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import {
  BadGatewayException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpException,
  Module,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { UpstreamApiInterceptor } from "./upstream-api.interceptor";

const serviceUrl = () =>
  process.env["SSI_SERVICE_URL"] ?? "http://localhost:3101";
const referenceUrl = () =>
  process.env["REFERENCE_SERVICE_URL"] ?? "http://localhost:3102";
const upstreamApiInterceptor = new UpstreamApiInterceptor();
const DEMO_RELOAD_TIMEOUT_MS = 120_000;
const PAYMENT_RESOLUTION_TIMEOUT_MS = 30_000;
async function forward(
  baseUrl: string,
  path: string,
  init?: RequestInit,
  timeoutOverrideMs?: number,
): Promise<unknown> {
  try {
    const response = await upstreamApiInterceptor.intercept(
      `${baseUrl}/${path}`,
      {
        ...init,
        headers: {
          "content-type": "application/json",
          ...init?.headers,
        },
      },
      timeoutOverrideMs,
    );
    const value = (await response.json()) as unknown;
    if (!response.ok)
      throw new HttpException(
        value as string | Record<string, unknown>,
        response.status,
      );
    return value;
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new BadGatewayException("Upstream service is unavailable");
  }
}
const forwardSsi = (path: string, init?: RequestInit, timeoutOverrideMs?: number) =>
  forward(`${serviceUrl()}/api`, path, init, timeoutOverrideMs);
const forwardReference = (path: string) =>
  forward(`${referenceUrl()}/mock`, path);

function listQuery(parameters: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters))
    if (value !== undefined && value !== "") query.set(key, value);
  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
}

@Controller("api")
class BffController {
  @Get("settings/runtime") runtimeSettings(): Promise<unknown> {
    return forwardSsi("settings/runtime");
  }
  @Get("settings/resolution-currencies") resolutionCurrencyInquiry(
    @Query("page") page = "",
    @Query("pageSize") pageSize = "",
    @Query("businessDomain") businessDomain = "",
    @Query("status") status = "",
    @Query("search") search = "",
    @Query("sortBy") sortBy = "",
    @Query("sortDirection") sortDirection = "",
  ): Promise<unknown> {
    return forwardSsi(`settings/resolution-currencies${listQuery({
      page, pageSize, businessDomain, status, search, sortBy, sortDirection,
    })}`);
  }
  @Post("settings/resolution-currencies/resync") resyncResolutionCurrencies(): Promise<unknown> {
    return forwardSsi("settings/resolution-currencies/resync", { method: "POST" });
  }
  @Post("settings/development-data/reload") reloadDevelopmentData(
    @Body() body: unknown,
  ): Promise<unknown> {
    return forwardSsi("settings/development-data/reload", {
      method: "POST",
      body: JSON.stringify(body),
    }, DEMO_RELOAD_TIMEOUT_MS);
  }
  @Get("dashboard") async dashboard(): Promise<unknown> {
    const ssis = (await forwardSsi("ssis")) as Array<{ status: string }>;
    return {
      counts: {
        total: ssis.length,
        active: ssis.filter((x) => x.status === "ACTIVE").length,
        pending: ssis.filter((x) => x.status === "PENDING_APPROVAL").length,
      },
      recent: ssis.slice(0, 8),
    };
  }
  @Get("ssis") list(
    @Query("status") status = "",
    @Query("ownershipType") ownershipType = "",
    @Query("counterpartyId") counterpartyId = "",
    @Query("page") page = "",
    @Query("pageSize") pageSize = "",
    @Query("search") search = "",
    @Query("sortBy") sortBy = "",
    @Query("sortDirection") sortDirection = "",
  ): Promise<unknown> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries({
      status,
      ownershipType,
      counterpartyId,
      page,
      pageSize,
      search,
      sortBy,
      sortDirection,
    })) {
      if (value) query.set(key, value);
    }
    return forwardSsi(`ssis${query.size ? `?${query.toString()}` : ""}`);
  }
  @Get("ssis/summary") ssiSummary(): Promise<unknown> {
    return forwardSsi("ssis/summary");
  }
  @Get("ssis/counterparty-coverage") counterpartyCoverage(
    @Query("status") status = "ACTIVE",
  ): Promise<unknown> {
    return forwardSsi(
      `ssis/counterparty-coverage?status=${encodeURIComponent(status)}`,
    );
  }
  @Get("ssi-applicability") applicability(
    @Query("ssiId") ssiId = "",
  ): Promise<unknown> {
    const query = ssiId ? `?ssiId=${encodeURIComponent(ssiId)}` : "";
    return forwardSsi(`ssis/applicability${query}`);
  }
  @Post("ssis") create(@Body() body: unknown): Promise<unknown> {
    return forwardSsi("ssis", { method: "POST", body: JSON.stringify(body) });
  }
  @Put("ssis/:id") update(
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    return forwardSsi(`ssis/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }
  @Put("ssis/:id/applicability") replaceApplicability(
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    return forwardSsi(`ssis/${encodeURIComponent(id)}/applicability`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }
  @Post("ssis/:id/revise") revise(
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    return forwardSsi(`ssis/${encodeURIComponent(id)}/revise`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
  @Delete("ssis/:id") revoke(
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    return forwardSsi(`ssis/${encodeURIComponent(id)}`, {
      method: "DELETE",
      body: JSON.stringify(body),
    });
  }
  @Post("ssis/:id/:action") transition(
    @Param("id") id: string,
    @Param("action") action: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    return forwardSsi(
      `ssis/${encodeURIComponent(id)}/${encodeURIComponent(action)}`,
      { method: "POST", body: JSON.stringify(body) },
    );
  }
  @Post("resolve") resolve(@Body() body: unknown): Promise<unknown> {
    return forwardSsi("ssis/resolve", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
  @Post("resolve/clearing-options") clearingOptions(
    @Body() body: unknown,
  ): Promise<unknown> {
    return forwardSsi("ssis/resolve/clearing-options", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
  @Post("resolve/confirm") confirmResolution(
    @Body() body: unknown,
  ): Promise<unknown> {
    return forwardSsi("ssis/resolve/confirm", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
  @Post("settlements/resolve")
  @HttpCode(200)
  resolveSettlement(@Body() body: unknown): Promise<unknown> {
    return forwardSsi("settlements/resolve", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
  @Post("own-account-settlements/resolve")
  @HttpCode(200)
  resolveOwnAccountSettlement(@Body() body: unknown): Promise<unknown> {
    return forwardSsi("own-account-settlements/resolve", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
  @Post("fi-direct-debits/resolve")
  @HttpCode(200)
  resolveFiDirectDebit(@Body() body: unknown): Promise<unknown> {
    return forwardSsi("fi-direct-debits/resolve", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
  @Post("payment-notifications/resolve")
  @HttpCode(200)
  resolvePaymentNotification(@Body() body: unknown): Promise<unknown> {
    return forwardSsi("payment-notifications/resolve", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
  @Get("settlements/message-index") paymentMessageIndex(): Promise<unknown> {
    return forwardSsi("settlements/message-index");
  }
  @Post("settlements/resolve-batch") resolveSettlementBatch(
    @Body() body: unknown,
  ): Promise<unknown> {
    return forwardSsi("settlements/resolve-batch", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
  @Post("settlements/clearing-options") settlementClearingOptions(
    @Body() body: unknown,
  ): Promise<unknown> {
    return forwardSsi("settlements/clearing-options", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
  @Post("settlements/:resolutionId/confirm") confirmSettlement(
    @Param("resolutionId") resolutionId: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    return forwardSsi(
      `settlements/${encodeURIComponent(resolutionId)}/confirm`,
      { method: "POST", body: JSON.stringify(body) },
    );
  }
  @Header("Deprecation", "true")
  @Header(
    "Link",
    '</api/reference/fin-tag-resolutions>; rel="successor-version"',
  )
  @Post("reference/fin-tag-suggestions")
  suggestFinTags(@Body() body: unknown): Promise<unknown> {
    return forwardSsi("reference/fin-tag-suggestions", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
  @Post("reference/fin-tag-resolutions") resolveFinTags(
    @Body() body: unknown,
  ): Promise<unknown> {
    return forwardSsi("reference/fin-tag-resolutions", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
  @Get("reference/fin-resolution-catalogue") finResolutionCatalogue(
    @Query("standardsRelease") standardsRelease = "SR2026",
  ): Promise<unknown> {
    return forwardSsi(
      `reference/fin-resolution-catalogue?standardsRelease=${encodeURIComponent(standardsRelease)}`,
    );
  }
  @Get("v1/resolution-page-definitions/index") resolutionPageDefinitionIndex(
    @Query("standardsRelease") standardsRelease = "SR2026",
    @Query("businessDomain") businessDomain = "",
  ): Promise<unknown> {
    const parameters = new URLSearchParams({ standardsRelease });
    if (businessDomain) parameters.set("businessDomain", businessDomain);
    return forwardSsi(
      `v1/resolution-page-definitions/index?${parameters.toString()}`,
    );
  }
  @Get("v1/resolution-page-definitions") resolutionPageDefinition(
    @Query("standardsRelease") standardsRelease = "",
    @Query("messageFamily") messageFamily = "",
    @Query("messageType") messageType = "",
    @Query("direction") direction = "",
    @Query("businessScenarioId") businessScenarioId = "",
    @Query("businessService") businessService = "",
    @Query("businessDomain") businessDomain = "",
  ): Promise<unknown> {
    const parameters = new URLSearchParams({
      standardsRelease,
      messageFamily,
      messageType,
      direction,
    });
    if (businessScenarioId)
      parameters.set("businessScenarioId", businessScenarioId);
    if (businessService) parameters.set("businessService", businessService);
    if (businessDomain) parameters.set("businessDomain", businessDomain);
    return forwardSsi(
      `v1/resolution-page-definitions?${parameters.toString()}`,
    );
  }
  @Get("v1/resolution-page-definitions/lookups/bank-services")
  resolutionPageBankServiceLookup(
    @Query("bankServiceId") bankServiceId = "",
    @Query("query") query = "",
  ): Promise<unknown> {
    const parameters = new URLSearchParams();
    if (bankServiceId) parameters.set("bankServiceId", bankServiceId);
    if (query) parameters.set("query", query);
    return forwardSsi(
      `v1/resolution-page-definitions/lookups/bank-services?${parameters.toString()}`,
    );
  }
  @Get("v1/resolution-page-definitions/lookups/ssi-counterparties")
  resolutionPageSsiCounterpartyLookup(
    @Query("scenarioId") scenarioId = "",
    @Query("messageType") messageType = "",
    @Query("sequence") sequence = "",
    @Query("currency") currency = "",
    @Query("bookingEntity") bookingEntity = "",
    @Query("valueDate") valueDate = "",
    @Query("query") query = "",
  ): Promise<unknown> {
    const parameters = new URLSearchParams({
      scenarioId,
      messageType,
      sequence,
      currency,
      bookingEntity,
      valueDate,
    });
    if (query) parameters.set("query", query);
    return forwardSsi(
      `v1/resolution-page-definitions/lookups/ssi-counterparties?${parameters.toString()}`,
    );
  }
  @Get("v1/resolution-page-definitions/lookups/own-account-receivers")
  resolutionPageOwnAccountReceiverLookup(
    @Query("scenarioId") scenarioId = "",
    @Query("messageType") messageType = "",
    @Query("currency") currency = "",
    @Query("bookingEntity") bookingEntity = "",
    @Query("valueDate") valueDate = "",
    @Query("query") query = "",
  ): Promise<unknown> {
    const parameters = new URLSearchParams({
      scenarioId,
      messageType,
      currency,
      bookingEntity,
      valueDate,
    });
    if (query) parameters.set("query", query);
    return forwardSsi(
      `v1/resolution-page-definitions/lookups/own-account-receivers?${parameters.toString()}`,
    );
  }
  @Get("v1/resolution-page-definitions/lookups/nostro-accounts")
  resolutionPageNostroAccountLookup(
    @Query()
    lookup: Record<string, string | undefined>,
  ): Promise<unknown> {
    const {
      scenarioId = "",
      messageType = "",
      currency = "",
      bookingEntity = "",
      valueDate = "",
      receiverBankServiceId = "",
      ownDebitAccountId = "",
      targetRole = "",
      query = "",
    } = lookup;
    const parameters = new URLSearchParams({
      scenarioId,
      messageType,
      currency,
      bookingEntity,
      valueDate,
      receiverBankServiceId,
      ownDebitAccountId,
      targetRole,
    });
    if (query) parameters.set("query", query);
    return forwardSsi(
      `v1/resolution-page-definitions/lookups/nostro-accounts?${parameters.toString()}`,
    );
  }
  @HttpCode(200)
  @Post("v1/resolution-page-definitions/execute")
  executeResolutionPage(@Body() body: unknown): Promise<unknown> {
    return forwardSsi("v1/resolution-page-definitions/execute", {
      method: "POST",
      body: JSON.stringify(body),
    }, PAYMENT_RESOLUTION_TIMEOUT_MS);
  }
  @Get("reference/fin-controlled-fixtures") finControlledFixtures(
    @Query("messageType") messageType = "",
    @Query("sequence") sequence = "",
    @Query("currency") currency = "",
    @Query("bookingEntity") bookingEntity = "",
    @Query("valueDate") valueDate = "",
    @Query("bindingId") bindingId = "",
  ): Promise<unknown> {
    const parameters = new URLSearchParams({
      messageType,
      currency,
      bookingEntity,
      valueDate,
    });
    if (sequence) parameters.set("sequence", sequence);
    if (bindingId) parameters.set("bindingId", bindingId);
    return forwardSsi(
      `reference/fin-controlled-fixtures?${parameters.toString()}`,
    );
  }
  @HttpCode(200)
  @Post("reference/fin-controlled-resolutions")
  resolveControlledFinTags(@Body() body: unknown): Promise<unknown> {
    return forwardSsi("reference/fin-controlled-resolutions", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
  @Post("messages/extract") extract(@Body() body: unknown): Promise<unknown> {
    return forwardSsi("messages/extract", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
  @Post("messages/generate") generate(@Body() body: unknown): Promise<unknown> {
    return forwardSsi("messages/generate", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
  @Get("messages/samples") samples(): Promise<unknown> {
    return forwardSsi("messages/samples");
  }
  @Get("messages/samples/load") loadSample(
    @Query("path") path: string,
  ): Promise<unknown> {
    return forwardSsi(`messages/samples/load?path=${encodeURIComponent(path)}`);
  }
  @Post("messages/samples/import-directory")
  importDirectory(): Promise<unknown> {
    return forwardSsi("messages/samples/import-directory", { method: "POST" });
  }
  @Get("rma-authorisations") listRma(
    @Query("status") status?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("search") search?: string,
  ): Promise<unknown> {
    return forwardSsi(
      `rma-authorisations${listQuery({ status, page, pageSize, search })}`,
    );
  }
  @Get("rma-authorisations/message-types") rmaMessageTypes(): Promise<unknown> {
    return forwardSsi("rma-authorisations/message-types");
  }
  @Get("rma-authorisations/message-type-policy")
  rmaMessageTypePolicy(): Promise<unknown> {
    return forwardSsi("rma-authorisations/message-type-policy");
  }
  @Get("rma-authorisations/pair-state")
  rmaPairState(
    @Query("ownBic") ownBic: string,
    @Query("counterpartyBic") counterpartyBic: string,
  ): Promise<unknown> {
    const query = new URLSearchParams({ ownBic, counterpartyBic });
    return forwardSsi(`rma-authorisations/pair-state?${query.toString()}`);
  }
  @Post("rma-authorisations/check") checkRma(
    @Body() body: unknown,
  ): Promise<unknown> {
    return forwardSsi("rma-authorisations/check", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
  @Post("rma-authorisations") createRma(
    @Body() body: unknown,
  ): Promise<unknown> {
    return forwardSsi("rma-authorisations", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
  @Put("rma-authorisations/:id") updateRma(
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    return forwardSsi(`rma-authorisations/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }
  @Post("rma-authorisations/:id/revise") reviseRma(
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    return forwardSsi(`rma-authorisations/${encodeURIComponent(id)}/revise`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
  @Post("rma-authorisations/:id/:action") transitionRma(
    @Param("id") id: string,
    @Param("action") action: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    return forwardSsi(
      `rma-authorisations/${encodeURIComponent(id)}/${encodeURIComponent(action)}`,
      { method: "POST", body: JSON.stringify(body) },
    );
  }
  @Delete("rma-authorisations/:id") revokeRma(
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    return forwardSsi(`rma-authorisations/${encodeURIComponent(id)}`, {
      method: "DELETE",
      body: JSON.stringify(body),
    });
  }
  @Get("rma-authorisations/audit/events") auditRma(): Promise<unknown> {
    return forwardSsi("rma-authorisations/audit/events");
  }
  @Get("nostro-accounts") listNostro(
    @Query("status") status?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("search") search?: string,
  ): Promise<unknown> {
    return forwardSsi(
      `nostro-accounts${listQuery({ status, page, pageSize, search })}`,
    );
  }
  @Get("nostro-accounts/audit/events") auditNostro(): Promise<unknown> {
    return forwardSsi("nostro-accounts/audit/events");
  }
  @Get("booking-branch-entities") listEntities(
    @Query("status") status?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("search") search?: string,
  ): Promise<unknown> {
    return forwardSsi(
      `booking-branch-entities${listQuery({ status, page, pageSize, search })}`,
    );
  }
  @Get("booking-branch-entities/audit/events")
  auditEntities(): Promise<unknown> {
    return forwardSsi("booking-branch-entities/audit/events");
  }
  @Post("booking-branch-entities") createEntity(
    @Body() body: unknown,
  ): Promise<unknown> {
    return forwardSsi("booking-branch-entities", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
  @Put("booking-branch-entities/:id") updateEntity(
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    return forwardSsi(`booking-branch-entities/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }
  @Post("booking-branch-entities/:id/revise") reviseEntity(
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    return forwardSsi(
      `booking-branch-entities/${encodeURIComponent(id)}/revise`,
      { method: "POST", body: JSON.stringify(body) },
    );
  }
  @Post("booking-branch-entities/:id/:action") transitionEntity(
    @Param("id") id: string,
    @Param("action") action: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    return forwardSsi(
      `booking-branch-entities/${encodeURIComponent(id)}/${encodeURIComponent(action)}`,
      { method: "POST", body: JSON.stringify(body) },
    );
  }
  @Delete("booking-branch-entities/:id") revokeEntity(
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    return forwardSsi(`booking-branch-entities/${encodeURIComponent(id)}`, {
      method: "DELETE",
      body: JSON.stringify(body),
    });
  }
  @Post("nostro-accounts/resolve") resolveNostro(
    @Body() body: unknown,
  ): Promise<unknown> {
    return forwardSsi("nostro-accounts/resolve", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
  @Post("nostro-accounts") createNostro(
    @Body() body: unknown,
  ): Promise<unknown> {
    return forwardSsi("nostro-accounts", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
  @Put("nostro-accounts/:id") updateNostro(
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    return forwardSsi(`nostro-accounts/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }
  @Post("nostro-accounts/:id/revise") reviseNostro(
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    return forwardSsi(`nostro-accounts/${encodeURIComponent(id)}/revise`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
  @Post("nostro-accounts/:id/:action") transitionNostro(
    @Param("id") id: string,
    @Param("action") action: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    return forwardSsi(
      `nostro-accounts/${encodeURIComponent(id)}/${encodeURIComponent(action)}`,
      { method: "POST", body: JSON.stringify(body) },
    );
  }
  @Delete("nostro-accounts/:id") revokeNostro(
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    return forwardSsi(`nostro-accounts/${encodeURIComponent(id)}`, {
      method: "DELETE",
      body: JSON.stringify(body),
    });
  }
  @Post("swift-data/imports") importSwiftData(
    @Body() body: unknown,
  ): Promise<unknown> {
    return forwardSsi("swift-data/imports", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
  @Get("reference/currencies") currencies(): Promise<unknown> {
    return forwardReference("currencies");
  }
  @Get("reference/countries") countries(): Promise<unknown> {
    return forwardReference("countries");
  }
  @Get("reference/booking-branches") bookingBranches(): Promise<unknown> {
    return forwardReference("booking-branches");
  }
  @Get("reference/clearing-systems") clearingSystems(
    @Query("currency") currency = "",
    @Query("settlementCountry") settlementCountry = "",
  ): Promise<unknown> {
    return forwardReference(
      `clearing-systems?currency=${encodeURIComponent(currency)}&settlementCountry=${encodeURIComponent(settlementCountry)}`,
    );
  }
  @Get("reference/banks") banks(
    @Query("page") page = "1",
    @Query("pageSize") pageSize = "5",
    @Query("query") query = "",
  ): Promise<unknown> {
    return forwardReference(
      `banks?page=${encodeURIComponent(page)}&pageSize=${encodeURIComponent(pageSize)}&query=${encodeURIComponent(query)}`,
    );
  }
  @Get("reference/banks/:bic") bank(
    @Param("bic") bic: string,
  ): Promise<unknown> {
    return forwardReference(`banks/${encodeURIComponent(bic)}`);
  }
  @Get("reference/counterparties") counterparties(): Promise<unknown> {
    return forwardReference("counterparties");
  }
  @Get("reference/customers") customers(
    @Query("page") page = "1",
    @Query("pageSize") pageSize = "5",
    @Query("query") query = "",
  ): Promise<unknown> {
    return forwardReference(
      `customers?page=${encodeURIComponent(page)}&pageSize=${encodeURIComponent(pageSize)}&query=${encodeURIComponent(query)}`,
    );
  }
  @Get("reference/accounts/:id") account(
    @Param("id") id: string,
  ): Promise<unknown> {
    return forwardReference(`accounts/${encodeURIComponent(id)}`);
  }
  @Get("reference/nostros") nostros(
    @Query("currency") currency = "",
    @Query("bankBic") bankBic = "",
  ): Promise<unknown> {
    return forwardReference(
      `nostros?currency=${encodeURIComponent(currency)}&bankBic=${encodeURIComponent(bankBic)}`,
    );
  }
  @Get("reference/aml/:caseId") aml(
    @Param("caseId") caseId: string,
  ): Promise<unknown> {
    return forwardReference(
      `aml/screening-status/${encodeURIComponent(caseId)}`,
    );
  }
  @Get("audit") audit(): Promise<unknown> {
    return forwardSsi("ssis/audit/events");
  }
  @Get("health/audit-retention") auditRetentionHealth(): Promise<unknown> {
    return forwardSsi("health/audit-retention");
  }
}

@Module({ controllers: [BffController] })
class BffModule {}
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(BffModule);
  app.enableCors();
  await app.listen(Number(process.env["SSI_BFF_PORT"] ?? 3100));
}
void bootstrap();
import "dotenv/config";
