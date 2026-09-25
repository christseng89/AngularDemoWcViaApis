import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR, ModuleRef } from "@nestjs/core";
import { SsiController } from "./ssi.controller";
import { SsiApplicationService } from "./ssi-application.service";
import { SqliteSsiRepository } from "./sqlite-ssi.repository";
import { MessageController } from "./message.controller";
import { MessageMappingService } from "./message-mapping.service";
import { SampleController } from "./sample.controller";
import { SampleImportService } from "./sample-import.service";
import { RmaController } from "./rma/rma.controller";
import { RmaApplicationService } from "./rma/rma-application.service";
import { RmaRepository } from "./rma/rma.repository";
import { NostroController } from "./nostro/nostro.controller";
import { NostroApplicationService } from "./nostro/nostro-application.service";
import { NostroRepository } from "./nostro/nostro.repository";
import { SwiftDataImportController } from "./imports/swift-data-import.controller";
import { SwiftDataImportService } from "./imports/swift-data-import.service";
import { Mt347DemoImportValidationProfile } from "./imports/mt347-demo-import-validation.profile";
import { EntityController } from "./entity/entity.controller";
import { EntityApplicationService } from "./entity/entity-application.service";
import { EntityRepository } from "./entity/entity.repository";
import { ReferenceSuggestionController } from "./reference-suggestion.controller";
import { SettlementController } from "./settlement.controller";
import { MappingCatalogueService } from "./mapping-catalogue.service";
import { FinFieldResolutionController } from "./fin-field-resolution.controller";
import { FinFieldResolutionService } from "./fin-field-resolution.service";
import { FinFieldResolutionPolicy } from "./fin-field-resolution.policy";
import { BatchResolutionService } from "./batch-resolution.service";
import { PaymentMessageIndexService } from "./payment-message-index.service";
import { BankServiceDirectory } from "./bank-service-directory";
import { MessageDomainResolutionService } from "./message-domain-resolution.service";
import { MessageDomainResolutionController } from "./message-domain-resolution.controller";
import { CounterpartySsiResolutionService } from "./counterparty-ssi-resolution.service";
import { AuditRetentionController } from "./audit-retention/audit-retention.controller";
import { AuditRetentionPolicy } from "./audit-retention/audit-retention.policy";
import { AuditRetentionRepository } from "./audit-retention/audit-retention.repository";
import { AuditRetentionService } from "./audit-retention/audit-retention.service";
import { DatabaseSnapshotIdentityService } from "./database-snapshot-identity.service";
import { SsiDataQualityService } from "./ssi-data-quality.service";
import { RuntimeSettingsController } from "./runtime-settings.controller";
import { DevelopmentDataReloadService } from "./development-data-reload.service";
import {
  DatabaseMutationCoordinator,
  DatabaseMutationInterceptor,
} from "./database-mutation-coordinator";
import { FinControlledFixtureService } from "./fin-controlled-fixture.service";
import { FinControlledResolutionService } from "./fin-controlled-resolution.service";
import { MappingResolutionPageDefinitionSource } from "./page-parameters/mapping-resolution-page-definition.source";
import { PaymentResolutionPageDefinitionSource } from "./page-parameters/payment-resolution-page-definition.source";
import { Mt1SsiResolutionPageDefinitionSource } from "./page-parameters/mt1-ssi-resolution-page-definition.source";
import { Mt1SsiProfileRegistry } from "./mt1-ssi-profile.registry";
import { Mt1SsiResolutionPageSubmissionAdapter } from "./page-parameters/mt1-ssi-resolution-page-submission.adapter";
import { Mt1SsiDemoRouteRepository } from "./mt1-ssi-demo-route.repository";
import { PaymentGovernedApplicabilityService } from "./page-parameters/payment-governed-applicability.service";
import { CompositeResolutionPageDefinitionSource } from "./page-parameters/composite-resolution-page-definition.source";
import { PageParameterEnvironmentPolicy } from "./page-parameters/page-parameter-environment.policy";
import { ResolutionPageAggregationService } from "./page-parameters/resolution-page-aggregation.service";
import { ResolutionPageDefinitionController } from "./page-parameters/resolution-page-definition.controller";
import { RESOLUTION_PAGE_DEFINITION_SOURCE } from "./page-parameters/resolution-page-definition.source";
import { PageParameterLookupService } from "./page-parameters/page-parameter-lookup.service";
import { ResolutionPageSubmissionAdapter } from "./page-parameters/resolution-page-submission.adapter";
import {
  PAYMENT_SETTLEMENT_RESOLUTION_PORT,
  PaymentResolutionPageSubmissionAdapter,
} from "./page-parameters/payment-resolution-page-submission.adapter";
import { ResolutionPageScenarioCatalogueService } from "./page-parameters/resolution-page-scenario-catalogue.service";
import { ResolutionPageOasFieldPolicyService } from "./page-parameters/resolution-page-oas-field-policy.service";
import { ResolutionPageFixtureManifestService } from "./page-parameters/resolution-page-fixture-manifest.service";
import { ResolutionPageCrossTagValidator } from "./page-parameters/resolution-page-cross-tag.validator";
import { IndexPaginationPolicy } from "./index-pagination.policy";
import { ResolutionCurrencyCoveragePolicy } from "./resolution-currency-policy";
import { ResolutionCurrencyCoverageDiscoveryService } from "./resolution-currency-discovery";
import { ResolutionCurrencyCoverageCoordinator } from "./resolution-currency-coordinator";
import { ResolutionCurrencyInquiryPolicy } from "./resolution-currency-inquiry.policy";
import { ResolutionDefinitionOptionsService } from "./page-parameters/resolution-definition-options.service";
import { PageParameterLookupDefaultsService } from "./page-parameters/page-parameter-lookup-defaults.service";
import {
  PAGE_PARAMETER_BUSINESS_CALENDAR,
  PAGE_PARAMETER_BUSINESS_DAYS_PORT,
  PAGE_PARAMETER_CLOCK,
  PageParameterBusinessDatePolicy,
  SystemPageParameterClock,
  WeekdayBusinessCalendar,
  WeekdayBusinessDaysPort,
} from "./page-parameters/page-parameter-business-date.policy";

@Module({
  controllers: [
    SsiController,
    SettlementController,
    MessageDomainResolutionController,
    ReferenceSuggestionController,
    FinFieldResolutionController,
    MessageController,
    SampleController,
    RmaController,
    NostroController,
    EntityController,
    SwiftDataImportController,
    AuditRetentionController,
    RuntimeSettingsController,
    ResolutionPageDefinitionController,
  ],
  providers: [
    SsiApplicationService,
    SqliteSsiRepository,
    ResolutionCurrencyCoveragePolicy,
    ResolutionCurrencyCoverageDiscoveryService,
    ResolutionCurrencyCoverageCoordinator,
    ResolutionCurrencyInquiryPolicy,
    ResolutionDefinitionOptionsService,
    MessageMappingService,
    SampleImportService,
    RmaApplicationService,
    RmaRepository,
    NostroApplicationService,
    NostroRepository,
    EntityApplicationService,
    EntityRepository,
    SwiftDataImportService,
    Mt347DemoImportValidationProfile,
    MappingCatalogueService,
    FinFieldResolutionPolicy,
    FinFieldResolutionService,
    BatchResolutionService,
    PaymentMessageIndexService,
    BankServiceDirectory,
    MessageDomainResolutionService,
    CounterpartySsiResolutionService,
    DatabaseSnapshotIdentityService,
    SsiDataQualityService,
    {
      provide: PAYMENT_SETTLEMENT_RESOLUTION_PORT,
      useFactory: (moduleRef: ModuleRef) => ({
        resolve: (request: Parameters<SettlementController["resolve"]>[0]) =>
          moduleRef
            .get(SettlementController, { strict: false })
            .resolve(request),
      }),
      inject: [ModuleRef],
    },
    PaymentResolutionPageSubmissionAdapter,
    DevelopmentDataReloadService,
    DatabaseMutationCoordinator,
    {
      provide: APP_INTERCEPTOR,
      useClass: DatabaseMutationInterceptor,
    },
    FinControlledFixtureService,
    FinControlledResolutionService,
    MappingResolutionPageDefinitionSource,
    PaymentResolutionPageDefinitionSource,
    Mt1SsiProfileRegistry,
    Mt1SsiResolutionPageDefinitionSource,
    Mt1SsiResolutionPageSubmissionAdapter,
    Mt1SsiDemoRouteRepository,
    PaymentGovernedApplicabilityService,
    {
      provide: RESOLUTION_PAGE_DEFINITION_SOURCE,
      useFactory: (
        mapping: MappingResolutionPageDefinitionSource,
        payment: PaymentResolutionPageDefinitionSource,
        mt1: Mt1SsiResolutionPageDefinitionSource,
      ) => new CompositeResolutionPageDefinitionSource([mapping, payment, mt1]),
      inject: [
        MappingResolutionPageDefinitionSource,
        PaymentResolutionPageDefinitionSource,
        Mt1SsiResolutionPageDefinitionSource,
      ],
    },
    PageParameterEnvironmentPolicy,
    ResolutionPageAggregationService,
    PageParameterLookupService,
    PageParameterLookupDefaultsService,
    ResolutionPageSubmissionAdapter,
    ResolutionPageScenarioCatalogueService,
    ResolutionPageOasFieldPolicyService,
    ResolutionPageFixtureManifestService,
    ResolutionPageCrossTagValidator,
    SystemPageParameterClock,
    { provide: PAGE_PARAMETER_CLOCK, useExisting: SystemPageParameterClock },
    WeekdayBusinessCalendar,
    {
      provide: PAGE_PARAMETER_BUSINESS_CALENDAR,
      useExisting: WeekdayBusinessCalendar,
    },
    WeekdayBusinessDaysPort,
    {
      provide: PAGE_PARAMETER_BUSINESS_DAYS_PORT,
      useExisting: WeekdayBusinessDaysPort,
    },
    PageParameterBusinessDatePolicy,
    IndexPaginationPolicy,
    {
      provide: AuditRetentionPolicy,
      useFactory: () => AuditRetentionPolicy.fromEnvironment(),
    },
    AuditRetentionRepository,
    AuditRetentionService,
  ],
})
export class AppModule {}
