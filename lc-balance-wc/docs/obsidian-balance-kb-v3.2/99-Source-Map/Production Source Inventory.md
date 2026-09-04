---
title: "Production Source Inventory"
type: source-map
domain: documentation
status: verified
source_of_truth: source-code
source_revision: "1865d80"
verified_date: 2026-09-04
generated: true
aliases: []
tags: ["source-map", "coverage"]
source_files:
  - "src/app/app.component.ts"
  - "src/app/app.config.ts"
  - "src/app/app.routes.ts"
  - "src/app/balance-account-maintenance/balance-account-maintenance-api.service.ts"
  - "src/app/balance-account-maintenance/balance-account-maintenance.component.ts"
  - "src/app/business-case-runner/balance-case-api.service.ts"
  - "src/app/business-case-runner/business-case-runner.component.ts"
  - "src/app/core/http-retry/http-retry.interceptor.ts"
  - "src/app/shared/feedback/api-error-presenter.ts"
  - "src/app/shared/feedback/feedback-message.component.ts"
  - "src/app/shared/feedback/ui-message.model.ts"
  - "src/app/shared-app.providers.ts"
  - "src/app/tb-icon.component.ts"
  - "src/app/theme.service.ts"
  - "src/app/transaction-builder/account-entries-dialog.component.ts"
  - "src/app/transaction-builder/amount-shorthand.ts"
  - "src/app/transaction-builder/api-error.ts"
  - "src/app/transaction-builder/balance-component-api.service.ts"
  - "src/app/transaction-builder/balance-component.model.ts"
  - "src/app/transaction-builder/balance-snapshot-box.component.ts"
  - "src/app/transaction-builder/builder-fields.ts"
  - "src/app/transaction-builder/catalog-picker.service.ts"
  - "src/app/transaction-builder/checker-actions.service.ts"
  - "src/app/transaction-builder/checker-eligibility-policy.ts"
  - "src/app/transaction-builder/checker-panel.component.ts"
  - "src/app/transaction-builder/contract-status-badge.component.ts"
  - "src/app/transaction-builder/document-arrival-hints.service.ts"
  - "src/app/transaction-builder/domestic-calendar.ts"
  - "src/app/transaction-builder/eligibility-rule.ts"
  - "src/app/transaction-builder/formatted-amount-field.component.ts"
  - "src/app/transaction-builder/function-policy.ts"
  - "src/app/transaction-builder/function-strategy.ts"
  - "src/app/transaction-builder/index-picker.component.ts"
  - "src/app/transaction-builder/inquire-delete-pending.component.ts"
  - "src/app/transaction-builder/inquire-delete-pending.service.ts"
  - "src/app/transaction-builder/inquire-events.component.ts"
  - "src/app/transaction-builder/inquire-events.service.ts"
  - "src/app/transaction-builder/lc-catalog-index.service.ts"
  - "src/app/transaction-builder/look-up-panel.service.ts"
  - "src/app/transaction-builder/maker-action-bar.component.ts"
  - "src/app/transaction-builder/maker-action-bar.policy.ts"
  - "src/app/transaction-builder/maker-balance-warning.policy.ts"
  - "src/app/transaction-builder/maker-balance-warnings.component.ts"
  - "src/app/transaction-builder/maker-panel.component.ts"
  - "src/app/transaction-builder/maker-queue.component.ts"
  - "src/app/transaction-builder/maker-queue.service.ts"
  - "src/app/transaction-builder/maker-result-panel.component.ts"
  - "src/app/transaction-builder/maker-submit.service.ts"
  - "src/app/transaction-builder/maker-workflow-notices.component.ts"
  - "src/app/transaction-builder/maker-workflow-state.ts"
  - "src/app/transaction-builder/monetary-amount.pipe.ts"
  - "src/app/transaction-builder/paged-list-state.ts"
  - "src/app/transaction-builder/picker-selection.service.ts"
  - "src/app/transaction-builder/protected-monetary-field.component.ts"
  - "src/app/transaction-builder/protected-transaction-identity.component.ts"
  - "src/app/transaction-builder/protected-transaction-identity.policy.ts"
  - "src/app/transaction-builder/submit-rules.ts"
  - "src/app/transaction-builder/tolerance-change.ts"
  - "src/app/transaction-builder/transaction-builder.component.ts"
  - "src/app/transaction-builder/transaction-pagination.component.ts"
  - "src/app/transaction-builder/transaction-search-field.component.ts"
  - "src/app/transaction-builder/transaction-status-badge.component.ts"
  - "src/app/web-component/balance-component-element.command.ts"
  - "src/app/web-component/balance-component-element.component.ts"
  - "src/app/web-component/balance-component-element.contract.ts"
  - "microservices/balance-component/src/app.ts"
  - "microservices/balance-component/src/config/balanceAccountTaxonomy.ts"
  - "microservices/balance-component/src/config.ts"
  - "microservices/balance-component/src/db/index.ts"
  - "microservices/balance-component/src/db/migrations.ts"
  - "microservices/balance-component/src/db/schema.ts"
  - "microservices/balance-component/src/domain/amendDecrease.ts"
  - "microservices/balance-component/src/domain/autoCloseGracePeriod.ts"
  - "microservices/balance-component/src/domain/balanceAccountMapping.ts"
  - "microservices/balance-component/src/domain/balanceDerivation.ts"
  - "microservices/balance-component/src/domain/closeEligibility.ts"
  - "microservices/balance-component/src/domain/contingentAccountEntry.ts"
  - "microservices/balance-component/src/domain/domesticCalendar.ts"
  - "microservices/balance-component/src/domain/expiryEligibility.ts"
  - "microservices/balance-component/src/domain/offBalanceExposure.ts"
  - "microservices/balance-component/src/domain/reopenRestoration.ts"
  - "microservices/balance-component/src/domain/shgtRedeem.ts"
  - "microservices/balance-component/src/domain/statusTransition.ts"
  - "microservices/balance-component/src/domain/tenorRouting.ts"
  - "microservices/balance-component/src/domain/tolerance.ts"
  - "microservices/balance-component/src/errors.ts"
  - "microservices/balance-component/src/money.ts"
  - "microservices/balance-component/src/routes/balanceAccountMappings.ts"
  - "microservices/balance-component/src/routes/balanceContracts.ts"
  - "microservices/balance-component/src/routes/balanceMovements.ts"
  - "microservices/balance-component/src/routes/deletePendingAudit.ts"
  - "microservices/balance-component/src/server.ts"
  - "microservices/balance-component/src/service/balanceAccountMappingService.ts"
  - "microservices/balance-component/src/service/balanceQueryService.ts"
  - "microservices/balance-component/src/service/balanceService.ts"
  - "microservices/balance-component/src/service/balanceSnapshotService.ts"
  - "microservices/balance-component/src/service/compoundMovementService.ts"
  - "microservices/balance-component/src/service/contractLifecycleEligibilityService.ts"
  - "microservices/balance-component/src/service/lifecycleSweepService.ts"
  - "microservices/balance-component/src/service/movementContractService.ts"
  - "microservices/balance-component/src/service/movementReleasePolicyService.ts"
  - "microservices/balance-component/src/service/movementReleaseSideEffectService.ts"
  - "microservices/balance-component/src/service/movementRequestValidator.ts"
  - "microservices/balance-component/src/service/movementSnapshotService.ts"
  - "microservices/balance-component/src/service/unitOfWork.ts"
  - "microservices/balance-component/src/store/balanceAccountMappingStore.ts"
  - "microservices/balance-component/src/store/balanceContractStore.ts"
  - "microservices/balance-component/src/store/balanceMovementStore.ts"
  - "microservices/balance-component/src/store/deletePendingAuditStore.ts"
  - "microservices/balance-component/src/store/fixPendingAuditStore.ts"
  - "microservices/balance-component/src/types.ts"
  - "microservices/balance-component/src/validation/requestSchema.ts"
  - "backend/data/businessCases.js"
  - "backend/server.js"
---

# Production Source Inventory

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

## Coverage boundary

此 inventory 包含 Angular、Balance microservice 與 Business Case backend 的 production `.ts`／`.js` modules；排除 specs／tests、generated files、coverage output、dependencies。每個 module 均列出 exported source symbols 並連至 canonical knowledge area。這是 Obsidian source-surface coverage 的分母，不可與 Jest executable branch coverage 混為一談。

| Production module | Area | Exported symbols | Canonical knowledge |
|---|---|---|---|
| `src/app/app.component.ts` | Angular | `AppComponent` | [[Architecture]] |
| `src/app/app.config.ts` | Angular | `appConfig` | [[Architecture]] |
| `src/app/app.routes.ts` | Angular | `routes` | [[Architecture]] |
| `src/app/balance-account-maintenance/balance-account-maintenance-api.service.ts` | Angular | `BalanceAccountIdentityDto`<br>`BalanceAccountMappingDto`<br>`BalanceAccountTenorDto`<br>`BalanceAccountFamilyDto`<br>`BalanceAccountCategoryDto`<br>`BalanceAccountMappingsResponse`<br>`BalanceAccountMaintenanceApiService` | [[Architecture]] |
| `src/app/balance-account-maintenance/balance-account-maintenance.component.ts` | Angular | `BalanceAccountMaintenanceComponent` | [[Architecture]] |
| `src/app/business-case-runner/balance-case-api.service.ts` | Angular | `BusinessCaseSummary`<br>`TraceStep`<br>`BusinessCaseRunResult`<br>`BusinessCaseRecoveryPolicy`<br>`BalanceCaseApiService` | [[Architecture]] |
| `src/app/business-case-runner/business-case-runner.component.ts` | Angular | `BusinessCaseRunnerComponent` | [[Architecture]] |
| `src/app/core/http-retry/http-retry.interceptor.ts` | Angular | `HttpRetryPolicy`<br>`HTTP_RETRY_POLICY`<br>`SKIP_SAFE_READ_RETRY`<br>`isTransientHttpError`<br>`safeReadRetryInterceptor` | [[Architecture]] |
| `src/app/shared/feedback/api-error-presenter.ts` | Angular | `ApiActionContext`<br>`presentValidationError`<br>`presentApiError` | [[Architecture]] |
| `src/app/shared/feedback/feedback-message.component.ts` | Angular | `FeedbackMessageComponent` | [[Architecture]] |
| `src/app/shared/feedback/ui-message.model.ts` | Angular | `UiMessageSeverity`<br>`UiMessage` | [[Architecture]] |
| `src/app/shared-app.providers.ts` | Angular | `sharedAppProviders` | [[Architecture]] |
| `src/app/tb-icon.component.ts` | Angular | `TbIconName`<br>`TbIconComponent` | [[Architecture]] |
| `src/app/theme.service.ts` | Angular | `ThemeMode`<br>`EffectiveTheme`<br>`ThemeService` | [[Architecture]] |
| `src/app/transaction-builder/account-entries-dialog.component.ts` | Angular | `AccountEntriesDialogComponent` | [[Import Functions MOC]] |
| `src/app/transaction-builder/amount-shorthand.ts` | Angular | `AMOUNT_SHORTHAND_ERROR`<br>`AmountShorthandResult`<br>`parseAmountShorthand` | [[Import Functions MOC]] |
| `src/app/transaction-builder/api-error.ts` | Angular | `describeApiError`<br>`notFoundMessage` | [[Import Functions MOC]] |
| `src/app/transaction-builder/balance-component-api.service.ts` | Angular | `NaturalKey`<br>`CreateMovementRequest`<br>`BalanceContract`<br>`CatalogPage`<br>`BalanceSnapshot`<br>`MovementWarning`<br>`ContingentAccountEntry`<br>`BalanceMovement`<br>`EditMovementRequest`<br>`BalanceComponentApiService`<br>`MyMovementsPage`<br>`DeletePendingAuditRow`<br>`DeletePendingAuditPage` | [[Import Functions MOC]] |
| `src/app/transaction-builder/balance-component.model.ts` | Angular | `InstrumentType`<br>`INSTRUMENT_TYPE_OPTIONS`<br>`MOVEMENT_TYPES_BY_INSTRUMENT`<br>`NATURAL_KEY_FIELDS_BY_INSTRUMENT`<br>`TOLERANCE_APPLICABLE_INSTRUMENT_TYPES`<br>`TOLERANCE_APPLICABLE_MOVEMENT_TYPES`<br>`CREATING_MOVEMENT_TYPES`<br>`HAS_PARENT`<br>`PARENT_INSTRUMENT_OPTIONS`<br>`isToleranceApplicable`<br>`defaultLcInstrumentTypeForSide`<br>`childInstrumentTypesOf`<br>`BALANCE_SNAPSHOT_LABEL`<br>`CURRENCY_DECIMALS`<br>`decimalPlacesForCurrency`<br>`CURRENCY_OPTIONS`<br>`amountExceedsCurrencyDecimals`<br>`groupThousands`<br>`formatCurrencyAmount`<br>`DECREASING_MOVEMENT_TYPES`<br>`SubChoice`<br>`TransactionFunction`<br>`tenorTypeLabel`<br>`IMPORT_FUNCTIONS`<br>`EXPORT_FUNCTIONS`<br>`isEarmarkFunction`<br>`displayStatus`<br>`functionActionIcon`<br>`statusBadgeIcon`<br>`isReversalMovement`<br>`isReopenMovement`<br>`systemMovementLabel`<br>`isBatchActor`<br>`statusBadgeClass`<br>`contractStatusBadgeClass`<br>`contractStatusLabel`<br>`displayMovementType`<br>`displayMovementAmount`<br>`accountingSetLabel`<br>`accountingSetStatusLabel`<br>`accountingSetStatusBadgeClass` | [[Import Functions MOC]] |
| `src/app/transaction-builder/balance-snapshot-box.component.ts` | Angular | `BalanceSnapshotImpact`<br>`PendingAmendmentDisplay`<br>`BalanceSnapshotBoxComponent` | [[Import Functions MOC]] |
| `src/app/transaction-builder/builder-fields.ts` | Angular | `BuilderFieldsContext`<br>`isFixPendingFieldEditable`<br>`isAmountFieldProtected`<br>`buildFields`<br>`toReadOnlyFields`<br>`reconstructOriginalModel` | [[Import Functions MOC]] |
| `src/app/transaction-builder/catalog-picker.service.ts` | Angular | `CatalogPickerService` | [[Import Functions MOC]] |
| `src/app/transaction-builder/checker-actions.service.ts` | Angular | `CheckerActionContext`<br>`CheckerActionOutcome`<br>`CheckerActionsService` | [[Import Functions MOC]] |
| `src/app/transaction-builder/checker-eligibility-policy.ts` | Angular | `isCheckerActionableMovement` | [[Import Functions MOC]] |
| `src/app/transaction-builder/checker-panel.component.ts` | Angular | `CheckerSyncSignal`<br>`CheckerPanelComponent` | [[Import Functions MOC]] |
| `src/app/transaction-builder/contract-status-badge.component.ts` | Angular | `ContractStatusBadgeComponent` | [[Import Functions MOC]] |
| `src/app/transaction-builder/document-arrival-hints.service.ts` | Angular | `DocumentArrivalHintsService` | [[Import Functions MOC]] |
| `src/app/transaction-builder/domestic-calendar.ts` | Angular | `isWeekend`<br>`knownHolidayName`<br>`domesticNonBusinessDayReason` | [[Import Functions MOC]] |
| `src/app/transaction-builder/eligibility-rule.ts` | Angular | `EligibilityIdLookup`<br>`EligibilityRule`<br>`applyEligibilityRule` | [[Import Functions MOC]] |
| `src/app/transaction-builder/formatted-amount-field.component.ts` | Angular | `FormattedAmountFieldComponent` | [[Import Functions MOC]] |
| `src/app/transaction-builder/function-policy.ts` | Angular | `BuilderModel`<br>`NaturalKeyFields`<br>`ContextRefState`<br>`isCreatingMovement`<br>`requiredNaturalKeyFields`<br>`ibNumberLabel`<br>`hasParent`<br>`parentOptions`<br>`carriedCurrency`<br>`usesTwoFieldSearch`<br>`toleranceApplicable`<br>`isReady`<br>`lcNumberFromParent`<br>`contextLcNumber`<br>`contextSecondaryRef`<br>`contextTenorType`<br>`checkerSecondaryField`<br>`checkerSecondaryLabel`<br>`parentTenorFamily` | [[Import Functions MOC]] |
| `src/app/transaction-builder/function-strategy.ts` | Angular | `MovementDerivationStrategy`<br>`SubmissionShape`<br>`CompoundSubmissionStrategy`<br>`CheckerReleaseStrategy`<br>`SelectionFlowStrategy`<br>`FixPendingEditableField`<br>`FixPendingMode`<br>`MakerResultSiblingKey`<br>`MakerResultDeletePendingStrategy`<br>`FunctionStrategy`<br>`functionSupportsFixPending`<br>`deriveFunctionStrategy`<br>`FUNCTION_STRATEGIES`<br>`movementTypeMatchesFunction`<br>`resolveFunctionForMovement`<br>`payExistingUtilizeFunctionFor` | [[Import Functions MOC]] |
| `src/app/transaction-builder/index-picker.component.ts` | Angular | `IndexPickerComponent` | [[Import Functions MOC]] |
| `src/app/transaction-builder/inquire-delete-pending.component.ts` | Angular | `InquireDeletePendingComponent` | [[Import Functions MOC]] |
| `src/app/transaction-builder/inquire-delete-pending.service.ts` | Angular | `secondaryReferenceForDeleteAudit`<br>`DeleteAuditView`<br>`InquireDeletePendingService` | [[Import Functions MOC]] |
| `src/app/transaction-builder/inquire-events.component.ts` | Angular | `InquireOpenAccountEntriesEvent`<br>`InquireEventsComponent` | [[Import Functions MOC]] |
| `src/app/transaction-builder/inquire-events.service.ts` | Angular | `InquiredEvent`<br>`functionForEvent`<br>`systemLabelForEvent`<br>`secondaryReferenceForEvent`<br>`primaryReferenceForEvent`<br>`toEventRows`<br>`mergeAccountingEventRows`<br>`movementsOf`<br>`childMovementsOf`<br>`LcIndexRow`<br>`computeLcIndexRow`<br>`EventBalanceTab`<br>`InquireEventsService` | [[Import Functions MOC]] |
| `src/app/transaction-builder/lc-catalog-index.service.ts` | Angular | `LcCatalogIndexService` | [[Import Functions MOC]] |
| `src/app/transaction-builder/look-up-panel.service.ts` | Angular | `LookUpPanelService` | [[Import Functions MOC]] |
| `src/app/transaction-builder/maker-action-bar.component.ts` | Angular | `MakerActionBarComponent` | [[Import Functions MOC]] |
| `src/app/transaction-builder/maker-action-bar.policy.ts` | Angular | `MakerActionBarState`<br>`MakerActionBarView`<br>`deriveMakerActionBarView` | [[Import Functions MOC]] |
| `src/app/transaction-builder/maker-balance-warning.policy.ts` | Angular | `MakerBalanceWarningState`<br>`deriveMakerBalanceWarnings` | [[Import Functions MOC]] |
| `src/app/transaction-builder/maker-balance-warnings.component.ts` | Angular | `MakerBalanceWarningsComponent` | [[Import Functions MOC]] |
| `src/app/transaction-builder/maker-panel.component.ts` | Angular | `MakerCheckerContext`<br>`CompoundLegState`<br>`MakerSyncRequest`<br>`MakerPanelComponent` | [[Import Functions MOC]] |
| `src/app/transaction-builder/maker-queue.component.ts` | Angular | `MakerQueueComponent` | [[Import Functions MOC]] |
| `src/app/transaction-builder/maker-queue.service.ts` | Angular | `MakerQueueRow`<br>`MakerQueueService` | [[Import Functions MOC]] |
| `src/app/transaction-builder/maker-result-panel.component.ts` | Angular | `MakerAccountEntriesRequest`<br>`MakerResultPanelComponent` | [[Import Functions MOC]] |
| `src/app/transaction-builder/maker-submit.service.ts` | Angular | `MakerSubmitContext`<br>`MakerSubmitSecondary`<br>`MakerSubmitOutcome`<br>`MakerSubmitService` | [[Import Functions MOC]] |
| `src/app/transaction-builder/maker-workflow-notices.component.ts` | Angular | `MakerWorkflowNoticesComponent` | [[Import Functions MOC]] |
| `src/app/transaction-builder/maker-workflow-state.ts` | Angular | `MakerWorkflowState`<br>`beginMakerSubmission`<br>`reduceMakerSubmitOutcome` | [[Import Functions MOC]] |
| `src/app/transaction-builder/monetary-amount.pipe.ts` | Angular | `MonetaryAmountPipe` | [[Import Functions MOC]] |
| `src/app/transaction-builder/paged-list-state.ts` | Angular | `PagedListState` | [[Import Functions MOC]] |
| `src/app/transaction-builder/picker-selection.service.ts` | Angular | `PayMovementSelectionOutcome`<br>`SettleableBalanceSelectionOutcome`<br>`PickerSelectionService` | [[Import Functions MOC]] |
| `src/app/transaction-builder/protected-monetary-field.component.ts` | Angular | `ProtectedMonetaryFieldComponent` | [[Import Functions MOC]] |
| `src/app/transaction-builder/protected-transaction-identity.component.ts` | Angular | `ProtectedTransactionIdentityComponent` | [[Import Functions MOC]] |
| `src/app/transaction-builder/protected-transaction-identity.policy.ts` | Angular | `ProtectedIdentityState`<br>`ProtectedIdentityItem`<br>`deriveProtectedIdentityItems` | [[Import Functions MOC]] |
| `src/app/transaction-builder/submit-rules.ts` | Angular | `SubmitRulesContext`<br>`SubmitValidation`<br>`validateSubmit`<br>`buildSubmitRequest`<br>`hasEligibleTargetSelected` | [[Import Functions MOC]] |
| `src/app/transaction-builder/tolerance-change.ts` | Angular | `AmendmentDirection`<br>`resultingTolerancePct`<br>`amendmentDirection` | [[Import Functions MOC]] |
| `src/app/transaction-builder/transaction-builder.component.ts` | Angular | `TransactionBuilderComponent` | [[Import Functions MOC]] |
| `src/app/transaction-builder/transaction-pagination.component.ts` | Angular | `TransactionPaginationComponent` | [[Import Functions MOC]] |
| `src/app/transaction-builder/transaction-search-field.component.ts` | Angular | `TransactionSearchFieldComponent` | [[Import Functions MOC]] |
| `src/app/transaction-builder/transaction-status-badge.component.ts` | Angular | `TransactionStatusPhase`<br>`TransactionStatusBadgeComponent` | [[Import Functions MOC]] |
| `src/app/web-component/balance-component-element.command.ts` | Angular | `BALANCE_COMPONENT_COMMAND_EVENT`<br>`BalanceComponentCommand`<br>`BalanceComponentCommandDetail` | [[Architecture]] |
| `src/app/web-component/balance-component-element.component.ts` | Angular | `BalanceComponentElementComponent` | [[Architecture]] |
| `src/app/web-component/balance-component-element.contract.ts` | Angular | `BALANCE_COMPONENT_CONTRACT_VERSION`<br>`BalanceComponentView`<br>`BalanceComponentTheme`<br>`BALANCE_COMPONENT_THEME_TOKENS`<br>`BalanceComponentConfig`<br>`NormalizedBalanceComponentConfig`<br>`BalanceReadyDetail`<br>`BalanceNavigationDetail`<br>`BalanceRefreshDetail`<br>`BalanceErrorDetail`<br>`BalanceComponentElement`<br>`BalanceComponentEventMap`<br>`normalizeBalanceComponentConfig`<br>`isBalanceComponentView`<br>`isBalanceComponentTheme` | [[Architecture]] |
| `microservices/balance-component/src/app.ts` | Microservice | `createApp` | [[API Reference]] |
| `microservices/balance-component/src/config/balanceAccountTaxonomy.ts` | Microservice | `BalanceAccountCategory`<br>`BalanceAccountFamily`<br>`BalanceAccountSeedMapping`<br>`BalanceAccountTaxonomyConfig`<br>`TenorBehavior`<br>`ResolvedBalanceAccountRoute`<br>`BalanceAccountTaxonomyReader`<br>`BalanceAccountTaxonomy`<br>`BALANCE_ACCOUNT_TAXONOMY` | [[Architecture]] |
| `microservices/balance-component/src/config.ts` | Microservice | `IntervalUnit`<br>`SweepInterval`<br>`toIntervalMs`<br>`EXPIRY_SWEEP_INTERVAL`<br>`MAIL_FLOAT_GRACE_DAYS`<br>`BATCH_MAKER_ACTOR`<br>`BATCH_CHECKER_ACTOR`<br>`AUTO_EXPIRY_ENABLED`<br>`AUTO_CLOSE_ENABLED`<br>`AUTO_CLOSE_REASON_CODE`<br>`AUTO_CLOSE_GRACE_PERIOD_BUSINESS_DAYS`<br>`BalanceAccountNumberConfig`<br>`loadBalanceAccountNumberConfig`<br>`BALANCE_ACCOUNT_NUMBER_CONFIG` | [[Architecture]] |
| `microservices/balance-component/src/db/index.ts` | Microservice | `createDb`<br>`Db` | [[Data Model]] |
| `microservices/balance-component/src/db/migrations.ts` | Microservice | `Migration`<br>`MIGRATIONS`<br>`runMigrations` | [[Data Model]] |
| `microservices/balance-component/src/db/schema.ts` | Microservice | `INSTRUMENT_TYPE_VALUES`<br>`CONTRACT_STATUS_VALUES`<br>`TENOR_TYPE_VALUES`<br>`MOVEMENT_STATUS_VALUES`<br>`EXPOSURE_NATURE_VALUES`<br>`MOVEMENT_TYPE_VALUES`<br>`SCHEMA_SQL` | [[Data Model]] |
| `microservices/balance-component/src/domain/amendDecrease.ts` | Microservice | `AmendDecreaseCheckResult`<br>`checkAmendDecreaseSufficiency` | [[Domain Model]] |
| `microservices/balance-component/src/domain/autoCloseGracePeriod.ts` | Microservice | `addBusinessDays`<br>`isPastAutoCloseGrace` | [[Domain Model]] |
| `microservices/balance-component/src/domain/balanceAccountMapping.ts` | Microservice | `BalanceAccountIdentity`<br>`BalanceAccountMapping`<br>`BalanceAccountNumberValidation`<br>`riskClassFor`<br>`mappingKeyFor` | [[Domain Model]] |
| `microservices/balance-component/src/domain/balanceDerivation.ts` | Microservice | `MOVEMENT_DIRECTION`<br>`TOLERANCE_APPLICABLE_MOVEMENT_TYPES`<br>`computeConfirmedBalance`<br>`computeAvailableBalance`<br>`computePendingDecreaseTotal`<br>`computeFaceAmount` | [[Domain Model]] |
| `microservices/balance-component/src/domain/closeEligibility.ts` | Microservice | `CloseEligibilityInputs`<br>`CloseEligibilityResult`<br>`evaluateCloseEligibility` | [[Domain Model]] |
| `microservices/balance-component/src/domain/contingentAccountEntry.ts` | Microservice | `ContingentAccountEntry`<br>`deriveContingentAccountEntry` | [[Domain Model]] |
| `microservices/balance-component/src/domain/domesticCalendar.ts` | Microservice | `isWeekend`<br>`knownHolidayName`<br>`domesticNonBusinessDayReason` | [[Domain Model]] |
| `microservices/balance-component/src/domain/expiryEligibility.ts` | Microservice | `ExpiryEligibilityInputs`<br>`ExpiryEligibilityResult`<br>`evaluateExpiryEligibility`<br>`isPastExpiryGrace` | [[Domain Model]] |
| `microservices/balance-component/src/domain/offBalanceExposure.ts` | Microservice | `computeOffBalanceExposure`<br>`ShgtIssueSufficiencyResult`<br>`checkShgtIssueSufficiency`<br>`derivePresentDocsProvisionallyConsumedIds`<br>`computePresentDocsEarmark`<br>`PresentDocsIssueSufficiencyResult`<br>`checkPresentDocsIssueSufficiency`<br>`computePresentDocsEarmarkPending`<br>`computePresentDocsEarmarkApproved`<br>`UtilizeSufficiencyResult`<br>`checkUtilizeSufficiency` | [[Domain Model]] |
| `microservices/balance-component/src/domain/reopenRestoration.ts` | Microservice | `computeReopenRestoreAmount` | [[Domain Model]] |
| `microservices/balance-component/src/domain/shgtRedeem.ts` | Microservice | `RedeemCheckResult`<br>`checkRedeemSufficiency` | [[Domain Model]] |
| `microservices/balance-component/src/domain/statusTransition.ts` | Microservice | `MovementAction`<br>`ApplyTransitionInput`<br>`assertMakerCheckerSeparation`<br>`applyStatusTransition` | [[Domain Model]] |
| `microservices/balance-component/src/domain/tenorRouting.ts` | Microservice | `AcceptanceTenorCheckResult`<br>`checkAcceptanceTenorConsistency` | [[Domain Model]] |
| `microservices/balance-component/src/domain/tolerance.ts` | Microservice | `computeCeilingAmount`<br>`MONETARY_AMENDMENT_TYPES`<br>`ToleranceChangeDirection`<br>`computeResultingTolerancePct`<br>`computeMonetaryAmendment` | [[Domain Model]] |
| `microservices/balance-component/src/errors.ts` | Microservice | `ApiError`<br>`RequestValidationError`<br>`InsufficientBalanceError`<br>`IllegalStateTransitionError`<br>`NotFoundError`<br>`NaturalKeyAlreadyExistsError`<br>`CurrencyMismatchError`<br>`MakerCheckerConflictError` | [[Architecture]] |
| `microservices/balance-component/src/money.ts` | Microservice | `MONETARY_AMOUNT_PATTERN`<br>`InvalidMonetaryAmountError`<br>`parseMonetaryAmount`<br>`formatMonetaryAmount`<br>`sumMonetaryAmounts`<br>`ZERO`<br>`CURRENCY_MINOR_UNITS`<br>`minorUnitsForCurrency`<br>`decimalPlaces`<br>`describeAmountScaleViolation` | [[Architecture]] |
| `microservices/balance-component/src/routes/balanceAccountMappings.ts` | Microservice | `balanceAccountMappingsRouter` | [[API Reference]] |
| `microservices/balance-component/src/routes/balanceContracts.ts` | Microservice | `balanceContractsRouter` | [[API Reference]] |
| `microservices/balance-component/src/routes/balanceMovements.ts` | Microservice | `balanceMovementsRouter` | [[API Reference]] |
| `microservices/balance-component/src/routes/deletePendingAudit.ts` | Microservice | `deletePendingAuditRouter` | [[API Reference]] |
| `microservices/balance-component/src/server.ts` | Microservice | module entrypoint／internal declarations | [[Architecture]] |
| `microservices/balance-component/src/service/balanceAccountMappingService.ts` | Microservice | `BalanceAccountMappingVersionConflictError`<br>`BalanceAccountMappingView`<br>`BalanceAccountFamilyView`<br>`BalanceAccountCategoryView`<br>`BalanceAccountMappingRepository`<br>`BalanceAccountMappingService` | [[Architecture]] |
| `microservices/balance-component/src/service/balanceQueryService.ts` | Microservice | `MakerMovementQuery`<br>`DeletePendingAuditQuery`<br>`BalanceQueryService` | [[Architecture]] |
| `microservices/balance-component/src/service/balanceService.ts` | Microservice | `CreateMovementRequest`<br>`CreateMovementResult`<br>`EditMovementRequest`<br>`BalanceServiceStores`<br>`createSqliteBalanceServiceStores`<br>`BalanceService` | [[Architecture]] |
| `microservices/balance-component/src/service/balanceSnapshotService.ts` | Microservice | `BalanceSnapshotService` | [[Architecture]] |
| `microservices/balance-component/src/service/compoundMovementService.ts` | Microservice | `CompoundMovementService` | [[Architecture]] |
| `microservices/balance-component/src/service/contractLifecycleEligibilityService.ts` | Microservice | `PrefetchedEventTree`<br>`ContractEventTree`<br>`ContractLifecycleEligibilityService` | [[Architecture]] |
| `microservices/balance-component/src/service/lifecycleSweepService.ts` | Microservice | `LifecycleCommandPort`<br>`SweepResult`<br>`LifecycleSweepService` | [[Architecture]] |
| `microservices/balance-component/src/service/movementContractService.ts` | Microservice | `NewContractPolicyPort`<br>`MovementContractService` | [[Architecture]] |
| `microservices/balance-component/src/service/movementReleasePolicyService.ts` | Microservice | `MovementReleasePolicyService` | [[Architecture]] |
| `microservices/balance-component/src/service/movementReleaseSideEffectService.ts` | Microservice | `ReleaseSideEffectCommandPort`<br>`MovementReleaseSideEffectService` | [[Architecture]] |
| `microservices/balance-component/src/service/movementRequestValidator.ts` | Microservice | `ROOT_INSTRUMENT_TYPES`<br>`NATURAL_KEY_FIELDS_BY_INSTRUMENT`<br>`SECONDARY_REF_REQUIRED_MOVEMENT_TYPES`<br>`TENOR_TYPE_REQUIRED_PAIRS`<br>`MovementValidationReader`<br>`MovementRequestValidator` | [[Architecture]] |
| `microservices/balance-component/src/service/movementSnapshotService.ts` | Microservice | `MovementSnapshotBundle`<br>`SnapshotWriteTarget`<br>`BalanceSnapshotReader`<br>`MovementSnapshotService` | [[Architecture]] |
| `microservices/balance-component/src/service/unitOfWork.ts` | Microservice | `UnitOfWork`<br>`SqliteUnitOfWork` | [[Architecture]] |
| `microservices/balance-component/src/store/balanceAccountMappingStore.ts` | Microservice | `BalanceAccountMappingStore` | [[Data Model]] |
| `microservices/balance-component/src/store/balanceContractStore.ts` | Microservice | `CatalogFilter`<br>`CatalogPage`<br>`BalanceContractStore` | [[Data Model]] |
| `microservices/balance-component/src/store/balanceMovementStore.ts` | Microservice | `BalanceMovementStore` | [[Data Model]] |
| `microservices/balance-component/src/store/deletePendingAuditStore.ts` | Microservice | `DeletePendingAuditStore` | [[Data Model]] |
| `microservices/balance-component/src/store/fixPendingAuditStore.ts` | Microservice | `FixPendingAuditStore` | [[Data Model]] |
| `microservices/balance-component/src/types.ts` | Microservice | `InstrumentType`<br>`ContractStatus`<br>`MovementStatus`<br>`ExposureNature`<br>`TenorType`<br>`NaturalKey`<br>`AccountEntry`<br>`ContingentAccountEntry`<br>`MovementWarning`<br>`BalanceContract`<br>`BalanceMovement`<br>`DeletePendingAuditRecord`<br>`DeletePendingAuditWithContract`<br>`FixPendingAuditRecord`<br>`BalanceSnapshot`<br>`ApiErrorBody` | [[Architecture]] |
| `microservices/balance-component/src/validation/requestSchema.ts` | Microservice | `createMovementRequestSchema`<br>`editMovementRequestSchema`<br>`firstValidationMessage` | [[Architecture]] |
| `backend/data/businessCases.js` | Backend | module entrypoint／internal declarations | [[Test Coverage and Business Cases]] |
| `backend/server.js` | Backend | module entrypoint／internal declarations | [[Architecture]] |

## Totals

- Production modules: 114
- Exported symbols indexed: 418
- Module traceability: 100%

對 internal implementation detail 的解釋由對應 canonical note 負責；本頁只維護完整 inventory，避免複製業務規則。
