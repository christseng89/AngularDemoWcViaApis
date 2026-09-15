import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
} from "@nestjs/common";
import type {
  PageParameterLookupEnvelope,
  PageParameterLookupResult,
  PageParameterBusinessDomain,
  PageParameterDirection,
  ResolutionPageDefinitionEnvelope,
  ResolutionPageDefinitionIndexEnvelope,
  ResolutionPageExecutionResult,
} from "@ssi/contracts";
import { ResolutionPageAggregationService } from "./resolution-page-aggregation.service";
import { PageParameterLookupService } from "./page-parameter-lookup.service";
import { ResolutionPageSubmissionAdapter } from "./resolution-page-submission.adapter";

@Controller("v1/resolution-page-definitions")
export class ResolutionPageDefinitionController {
  constructor(
    private readonly pages: ResolutionPageAggregationService,
    private readonly lookups: PageParameterLookupService,
    private readonly submissions: ResolutionPageSubmissionAdapter,
  ) {}

  @Get("lookups/bank-services")
  bankService(
    @Query("bankServiceId") bankServiceId = "",
    @Query("query") query = "",
  ): PageParameterLookupResult | PageParameterLookupEnvelope {
    return bankServiceId
      ? this.lookups.bankService(bankServiceId)
      : this.lookups.bankServices(query);
  }

  @Get("lookups/ssi-counterparties")
  ssiCounterparties(
    @Query("scenarioId") scenarioId = "",
    @Query("messageType") messageType = "",
    @Query("sequence") sequence = "",
    @Query("currency") currency = "",
    @Query("bookingEntity") bookingEntity = "",
    @Query("valueDate") valueDate = "",
    @Query("query") query = "",
  ): PageParameterLookupEnvelope {
    return this.lookups.ssiCounterparties({
      scenarioId,
      messageType,
      sequence,
      currency,
      bookingEntity,
      valueDate,
      query,
    });
  }

  @Get("lookups/own-account-receivers")
  ownAccountReceivers(
    @Query("scenarioId") scenarioId = "",
    @Query("messageType") messageType = "",
    @Query("currency") currency = "",
    @Query("bookingEntity") bookingEntity = "",
    @Query("valueDate") valueDate = "",
    @Query("query") query = "",
  ): PageParameterLookupEnvelope {
    return this.lookups.ownAccountReceivers({
      scenarioId,
      messageType,
      currency,
      bookingEntity,
      valueDate,
      query,
    });
  }

  @Get("lookups/nostro-accounts")
  nostroAccounts(
    @Query()
    lookup: Record<string, string | undefined>,
  ): PageParameterLookupEnvelope {
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
    return this.lookups.nostroAccounts({
      scenarioId,
      messageType,
      currency,
      bookingEntity,
      valueDate,
      receiverBankServiceId,
      ownDebitAccountId,
      targetRole,
      query,
    });
  }

  @Post("execute")
  @HttpCode(200)
  execute(@Body() body: unknown): ResolutionPageExecutionResult {
    return this.submissions.execute(body);
  }

  @Get("index")
  index(
    @Query("standardsRelease") standardsRelease = "SR2026",
    @Query("businessDomain")
    businessDomain = "" as "" | PageParameterBusinessDomain,
  ): ResolutionPageDefinitionIndexEnvelope {
    if (
      businessDomain &&
      !(["TREASURY", "TRADE_FINANCE", "PAYMENT"] as const).includes(
        businessDomain as PageParameterBusinessDomain,
      )
    )
      throw new BadRequestException({ code: "PAGE_BUSINESS_DOMAIN_INVALID" });
    return businessDomain
      ? this.pages.index(standardsRelease, businessDomain)
      : this.pages.index(standardsRelease);
  }

  @Get()
  get(
    @Query("standardsRelease") standardsRelease = "",
    @Query("messageFamily") messageFamily = "",
    @Query("messageType") messageType = "",
    @Query("direction") direction = "" as PageParameterDirection,
    @Query("businessScenarioId") businessScenarioId = "",
    @Query("businessService") businessService = "",
    @Query("businessDomain")
    businessDomain = "" as "" | PageParameterBusinessDomain,
  ): ResolutionPageDefinitionEnvelope {
    return this.pages.get({
      standardsRelease,
      messageFamily,
      messageType,
      direction,
      ...(businessScenarioId ? { businessScenarioId } : {}),
      ...(businessService ? { businessService } : {}),
      ...(businessDomain ? { businessDomain } : {}),
    });
  }
}
