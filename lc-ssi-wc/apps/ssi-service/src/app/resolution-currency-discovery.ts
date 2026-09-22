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

const STANDARDS_RELEASE = "SR2026";
type SsiScope = Readonly<{ ssiId?: string }>;

/** Shared governed profile → current SSI/Applicability coverage rule. */
@Injectable()
export class ResolutionCurrencyCoverageDiscoveryService {
  constructor(
    private readonly financeDefinitions: MappingResolutionPageDefinitionSource,
    private readonly paymentDefinitions: PaymentResolutionPageDefinitionSource,
    private readonly repository: SqliteSsiRepository,
  ) {}

  discover(
    asOfDate: string,
    ssiId?: string,
  ): ResolutionCurrencyDiscoveryResult {
    this.assertValidAsOfDate(asOfDate);
    const scope: SsiScope = ssiId ? { ssiId } : {};
    const pairs = [
      ...this.discoverFinancePairs(asOfDate, scope),
      ...this.discoverPaymentPairs(asOfDate, scope),
    ];
    return {
      complete: true,
      asOfDate,
      pairs: this.uniqueValidatedPairs(pairs),
    };
  }

  private assertValidAsOfDate(asOfDate: string): void {
    const parsedDate = new Date(`${asOfDate}T00:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(asOfDate) ||
      !Number.isFinite(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== asOfDate
    )
      throw new Error("RESOLUTION_CURRENCY_INVALID_AS_OF_DATE");
  }

  private discoverFinancePairs(
    asOfDate: string,
    scope: SsiScope,
  ): DiscoveredCurrency[] {
    const pairs: DiscoveredCurrency[] = [];
    for (const profile of this.financeDefinitions.coverageProfiles(
      STANDARDS_RELEASE,
    )) {
      if (
        profile.businessDomain !== "TREASURY" &&
        profile.businessDomain !== "TRADE_FINANCE"
      )
        throw new Error("RESOLUTION_CURRENCY_UNSUPPORTED_DOMAIN");
      const currencies = this.repository.findResolutionCurrencyCoverage({
        consumer: profile.businessDomain,
        businessFunction: profile.businessFunction,
        messageType: profile.messageType,
        asOfDate,
        ...scope,
      });
      for (const currency of currencies)
        pairs.push({
          standardsRelease: STANDARDS_RELEASE,
          businessDomain: profile.businessDomain,
          currency,
        });
    }
    return pairs;
  }

  private discoverPaymentPairs(
    asOfDate: string,
    scope: SsiScope,
  ): DiscoveredCurrency[] {
    const pairs: DiscoveredCurrency[] = [];
    for (const profile of this.paymentDefinitions.coverageProfiles()) {
      const currencies = this.repository.findPaymentResolutionCurrencies({
        sourceMessageType: profile.messageType,
        messageType: "pacs.009.001.08",
        valueDate: asOfDate,
        ...scope,
      });
      for (const currency of currencies)
        pairs.push({
          standardsRelease: STANDARDS_RELEASE,
          businessDomain: "PAYMENT",
          currency,
        });
    }
    return pairs;
  }

  private uniqueValidatedPairs(
    pairs: readonly DiscoveredCurrency[],
  ): DiscoveredCurrency[] {
    const byKey = new Map<string, DiscoveredCurrency>();
    for (const pair of pairs) {
      if (!/^[A-Z]{3}$/.test(pair.currency))
        throw new Error("RESOLUTION_CURRENCY_INVALID_SOURCE_CURRENCY");
      byKey.set(`${pair.businessDomain}:${pair.currency}`, pair);
    }
    return [...byKey.values()].sort(
      (a, b) =>
        a.businessDomain.localeCompare(b.businessDomain) ||
        a.currency.localeCompare(b.currency),
    );
  }
}
