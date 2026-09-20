import { Injectable } from "@nestjs/common";
import { SqliteSsiRepository } from "../sqlite-ssi.repository";
import { EntityRepository } from "../entity/entity.repository";
import { ResolutionCurrencyCoveragePolicy } from "../resolution-currency-policy";

type Domain = "PAYMENT" | "TREASURY" | "TRADE_FINANCE";

/** Page-definition read port; never queries operational SSI eligibility. */
@Injectable()
export class ResolutionDefinitionOptionsService {
  constructor(
    private readonly coverage: SqliteSsiRepository,
    private readonly entities: EntityRepository,
    private readonly policy: ResolutionCurrencyCoveragePolicy,
  ) {}

  currencies(domain: Domain, messageType: string) {
    const currencies = this.coverage.activeResolutionCurrencies("SR2026", domain);
    const configured = this.policy.defaultFor(domain, messageType).currency;
    return {
      currencies,
      ...(configured && currencies.includes(configured) ? { defaultCurrency: configured } : {}),
    };
  }

  payment(messageType: string, asOfDate: string) {
    const currencies = this.coverage.activeResolutionCurrencies("SR2026", "PAYMENT");
    const bookingEntities = this.entities.activeBookingEntities(asOfDate);
    const configured = this.policy.defaultFor("PAYMENT", messageType);
    return {
      currencies,
      bookingEntities,
      ...(configured.currency && currencies.includes(configured.currency)
        ? { defaultCurrency: configured.currency } : {}),
      ...(configured.bookingEntity && bookingEntities.some(({ value }) => value === configured.bookingEntity)
        ? { defaultBookingEntity: configured.bookingEntity }
        : {}),
    };
  }
}
