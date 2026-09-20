import { Injectable, Optional, type OnModuleInit } from "@nestjs/common";
import { ResolutionCurrencyCoverageDiscoveryService } from "./resolution-currency-discovery";
import { ResolutionCurrencyCoveragePolicy } from "./resolution-currency-policy";
import { SqliteSsiRepository } from "./sqlite-ssi.repository";
import type { ResolutionCurrencyApplyResult } from "./resolution-currency-store";
import { ResolutionPageAggregationService } from "./page-parameters/resolution-page-aggregation.service";

/** Application boundary; discovery is always completed before reconciliation. */
@Injectable()
export class ResolutionCurrencyCoverageCoordinator implements OnModuleInit {
  constructor(
    private readonly repository: SqliteSsiRepository,
    private readonly discovery: ResolutionCurrencyCoverageDiscoveryService,
    private readonly policy: ResolutionCurrencyCoveragePolicy,
    @Optional() private readonly definitions?: ResolutionPageAggregationService,
  ) {}

  onModuleInit(): void {
    this.repository.bootstrapResolutionCurrencyCoverage(
      () => this.discovery.discover(this.policy.asOfDate).pairs,
      this.policy.asOfDate,
    );
  }

  inquiry(request: Parameters<SqliteSsiRepository["resolutionCurrencyInquiryPage"]>[1]) {
    return this.repository.resolutionCurrencyInquiryPage("SR2026", request);
  }

  resync() {
    const result = this.repository.resyncResolutionCurrencyCoverage(
      () => this.discovery.discover(this.policy.asOfDate).pairs,
      this.policy.asOfDate,
    );
    this.invalidateAfterCommit(result);
    return result;
  }

  /** Invoked inside the existing SSI approval SQLite transaction. */
  discoverApproved(ssiId: string): ResolutionCurrencyApplyResult {
    const pairs = this.discovery.discover(this.policy.asOfDate, ssiId).pairs;
    return this.repository.insertApprovedResolutionCurrencies(pairs, this.policy.asOfDate);
  }

  invalidateAfterCommit(result: ResolutionCurrencyApplyResult): void {
    if (result.inserted || result.activated || result.inactivated)
      this.definitions?.invalidate();
  }

  onReloadCommitted(): void {
    this.definitions?.invalidate();
  }
}
