import { Injectable } from "@nestjs/common";
import { MappingResolutionPageDefinitionSource } from "./page-parameters/mapping-resolution-page-definition.source";
import { PaymentResolutionPageDefinitionSource } from "./page-parameters/payment-resolution-page-definition.source";
import { SqliteSsiRepository } from "./sqlite-ssi.repository";
import type { DiscoveredCurrency } from "./resolution-currency-store";

export interface ResolutionCurrencyDiscoveryResult {
  readonly complete: true;
  readonly asOfDate: string;
  readonly pairs: readonly DiscoveredCurrency[];
}

/** Shared governed profile → current SSI/Applicability coverage rule. */
@Injectable()
export class ResolutionCurrencyCoverageDiscoveryService {
  constructor(
    private readonly financeDefinitions: MappingResolutionPageDefinitionSource,
    private readonly paymentDefinitions: PaymentResolutionPageDefinitionSource,
    private readonly repository: SqliteSsiRepository,
  ) {}

  discover(asOfDate: string, ssiId?: string): ResolutionCurrencyDiscoveryResult {
    const parsedDate = new Date(`${asOfDate}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate) ||
      !Number.isFinite(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== asOfDate)
      throw new Error("RESOLUTION_CURRENCY_INVALID_AS_OF_DATE");
    const standardsRelease = "SR2026";
    const pairs: DiscoveredCurrency[] = [];
    for (const profile of this.financeDefinitions.coverageProfiles(standardsRelease)) {
      if (profile.businessDomain !== "TREASURY" && profile.businessDomain !== "TRADE_FINANCE")
        throw new Error("RESOLUTION_CURRENCY_UNSUPPORTED_DOMAIN");
      const currencies = this.repository.findResolutionCurrencyCoverage({
        consumer: profile.businessDomain,
        businessFunction: profile.businessFunction,
        messageType: profile.messageType,
        asOfDate,
        ...(ssiId ? { ssiId } : {}),
      });
      for (const currency of currencies)
        pairs.push({ standardsRelease, businessDomain: profile.businessDomain, currency });
    }
    for (const profile of this.paymentDefinitions.coverageProfiles()) {
      const currencies = this.repository.findPaymentResolutionCurrencies({
        sourceMessageType: profile.messageType,
        messageType: "pacs.009.001.08",
        businessService: profile.businessService,
        valueDate: asOfDate,
        ...(ssiId ? { ssiId } : {}),
      });
      for (const currency of currencies) {
        pairs.push({ standardsRelease, businessDomain: "PAYMENT", currency });
      }
    }
    const byKey = new Map<string, DiscoveredCurrency>();
    for (const pair of pairs) {
      if (!/^[A-Z]{3}$/.test(pair.currency))
        throw new Error("RESOLUTION_CURRENCY_INVALID_SOURCE_CURRENCY");
      byKey.set(`${pair.businessDomain}:${pair.currency}`, pair);
    }
    return {
      complete: true,
      asOfDate,
      pairs: [...byKey.values()].sort((a, b) =>
        a.businessDomain.localeCompare(b.businessDomain) || a.currency.localeCompare(b.currency),
      ),
    };
  }
}
