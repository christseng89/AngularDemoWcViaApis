"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const ssi_controller_1 = require("./ssi.controller");
const ssi_application_service_1 = require("./ssi-application.service");
const sqlite_ssi_repository_1 = require("./sqlite-ssi.repository");
const message_controller_1 = require("./message.controller");
const message_mapping_service_1 = require("./message-mapping.service");
const sample_controller_1 = require("./sample.controller");
const sample_import_service_1 = require("./sample-import.service");
const rma_controller_1 = require("./rma/rma.controller");
const rma_application_service_1 = require("./rma/rma-application.service");
const rma_repository_1 = require("./rma/rma.repository");
const nostro_controller_1 = require("./nostro/nostro.controller");
const nostro_application_service_1 = require("./nostro/nostro-application.service");
const nostro_repository_1 = require("./nostro/nostro.repository");
const swift_data_import_controller_1 = require("./imports/swift-data-import.controller");
const swift_data_import_service_1 = require("./imports/swift-data-import.service");
const entity_controller_1 = require("./entity/entity.controller");
const entity_application_service_1 = require("./entity/entity-application.service");
const entity_repository_1 = require("./entity/entity.repository");
const reference_suggestion_controller_1 = require("./reference-suggestion.controller");
const settlement_controller_1 = require("./settlement.controller");
const mapping_catalogue_service_1 = require("./mapping-catalogue.service");
const fin_field_resolution_controller_1 = require("./fin-field-resolution.controller");
const fin_field_resolution_service_1 = require("./fin-field-resolution.service");
const fin_field_resolution_policy_1 = require("./fin-field-resolution.policy");
const batch_resolution_service_1 = require("./batch-resolution.service");
const payment_message_index_service_1 = require("./payment-message-index.service");
const bank_service_directory_1 = require("./bank-service-directory");
const message_domain_resolution_service_1 = require("./message-domain-resolution.service");
const message_domain_resolution_controller_1 = require("./message-domain-resolution.controller");
const counterparty_ssi_resolution_service_1 = require("./counterparty-ssi-resolution.service");
const audit_retention_controller_1 = require("./audit-retention/audit-retention.controller");
const audit_retention_policy_1 = require("./audit-retention/audit-retention.policy");
const audit_retention_repository_1 = require("./audit-retention/audit-retention.repository");
const audit_retention_service_1 = require("./audit-retention/audit-retention.service");
const database_snapshot_identity_service_1 = require("./database-snapshot-identity.service");
const ssi_data_quality_service_1 = require("./ssi-data-quality.service");
const runtime_settings_controller_1 = require("./runtime-settings.controller");
const development_data_reload_service_1 = require("./development-data-reload.service");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = tslib_1.__decorate([
    (0, common_1.Module)({
        controllers: [
            ssi_controller_1.SsiController,
            settlement_controller_1.SettlementController,
            message_domain_resolution_controller_1.MessageDomainResolutionController,
            reference_suggestion_controller_1.ReferenceSuggestionController,
            fin_field_resolution_controller_1.FinFieldResolutionController,
            message_controller_1.MessageController,
            sample_controller_1.SampleController,
            rma_controller_1.RmaController,
            nostro_controller_1.NostroController,
            entity_controller_1.EntityController,
            swift_data_import_controller_1.SwiftDataImportController,
            audit_retention_controller_1.AuditRetentionController,
            runtime_settings_controller_1.RuntimeSettingsController,
        ],
        providers: [
            ssi_application_service_1.SsiApplicationService,
            sqlite_ssi_repository_1.SqliteSsiRepository,
            message_mapping_service_1.MessageMappingService,
            sample_import_service_1.SampleImportService,
            rma_application_service_1.RmaApplicationService,
            rma_repository_1.RmaRepository,
            nostro_application_service_1.NostroApplicationService,
            nostro_repository_1.NostroRepository,
            entity_application_service_1.EntityApplicationService,
            entity_repository_1.EntityRepository,
            swift_data_import_service_1.SwiftDataImportService,
            mapping_catalogue_service_1.MappingCatalogueService,
            fin_field_resolution_policy_1.FinFieldResolutionPolicy,
            fin_field_resolution_service_1.FinFieldResolutionService,
            batch_resolution_service_1.BatchResolutionService,
            payment_message_index_service_1.PaymentMessageIndexService,
            bank_service_directory_1.BankServiceDirectory,
            message_domain_resolution_service_1.MessageDomainResolutionService,
            counterparty_ssi_resolution_service_1.CounterpartySsiResolutionService,
            database_snapshot_identity_service_1.DatabaseSnapshotIdentityService,
            ssi_data_quality_service_1.SsiDataQualityService,
            development_data_reload_service_1.DevelopmentDataReloadService,
            { provide: audit_retention_policy_1.AuditRetentionPolicy, useFactory: () => audit_retention_policy_1.AuditRetentionPolicy.fromEnvironment() },
            audit_retention_repository_1.AuditRetentionRepository,
            audit_retention_service_1.AuditRetentionService,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map