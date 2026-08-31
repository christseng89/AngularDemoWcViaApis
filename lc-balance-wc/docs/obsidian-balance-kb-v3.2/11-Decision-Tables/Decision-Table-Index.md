---
knowledge_id: Decision-Table-Index
title: "决策表索引"
domain: Balance
category: Index
snapshot_date: 2026-08-22
tags:
  - balance
  - index
---

# 决策表索引

本仓库中共提取了 98 张决策表。

| 决策表 | 来源分组 |
|---|---|
| [[movement-direction-by-instrument-movementtype]] | `balance-core-domain` |
| [[legal-movementstatus-transitions-fromstatus-action-tostatus]] | `balance-core-domain` |
| [[checkacceptancetenorconsistency-outcome-by-parenttenortype-requestedte]] | `balance-core-domain` |
| [[tolerance-applicability-by-instrumenttype-movementtype]] | `tolerance-domain` |
| [[computeoffbalanceexposure-shgt-movement-inclusion-sign]] | `exposure-domain` |
| [[checkutilizesufficiency-two-tier-sufficiency-gate-v0-12-both-hard-erro]] | `exposure-domain` |
| [[present-docs-earmark-buckets-eplc-examination-b3-b4]] | `exposure-domain` |
| [[contingent-account-entry-families-by-instrumenttype-ledger-folio-1-5]] | `exposure-domain` |
| [[dr-cr-side-assignment-by-netdirection]] | `exposure-domain` |
| [[a10-b6-close-eligibility-conditions]] | `redemption-close-domain` |
| [[sufficiency-check-registry-shgt-acceptance-redemption-amend-decrease-a]] | `redemption-close-domain` |
| [[tight-available-balance-formula-per-instrumenttype-used-by-decrease-sh]] | `redemption-close-domain` |
| [[movementtyperegistry-creation-semantics-and-sufficiency-check-shape-by]] | `balance-service-orchestration` |
| [[assertvalidamount-allowed-sign-per-movementtype]] | `balance-service-orchestration` |
| [[newcontractsufficiencyregistry-creation-time-sufficiency-dispatch-key]] | `balance-service-orchestration` |
| [[resolvesnapshotwritetarget-release-s-snapshot-column-routing]] | `balance-service-orchestration` |
| [[a10-b6-close-three-defense-layers-sharing-evaluatecontractcloseeligibi]] | `balance-service-orchestration` |
| [[db-level-check-constraint-legal-values-enforced-since-migration-13-fre]] | `db-store-types` |
| [[currency-minor-units-server-side-amount-decimal-scale-table]] | `db-store-types` |
| [[errors-ts-typed-error-hierarchy]] | `db-store-types` |
| [[balancecontractstore-listcatalog-catalogfilter-fields-and-their-effect]] | `db-store-types` |
| [[migrations-1-13-summary]] | `db-store-types` |
| [[post-balance-movements-request-service-layer-rejection-gates]] | `routes-api-e2e` |
| [[balance-movements-action-endpoints-precondition-and-error-code-matrix]] | `routes-api-e2e` |
| [[get-balance-contracts-and-catalog-opt-in-query-flags]] | `routes-api-e2e` |
| [[http-error-code-catalog-errors-ts-exercised-end-to-end]] | `routes-api-e2e` |
| [[isearmarkfunction-truth-table]] | `angular-model` |
| [[displaystatus-statusbadgeclass-combined-resolution]] | `angular-model` |
| [[functionactionicon-function-code-to-action-group-icon]] | `angular-model` |
| [[contractstatusbadgeclass-contractstatuslabel-contractstatus-to-badge]] | `angular-model` |
| [[displaymovementtype-displaymovementamount-b2-eplc-confirmation-amend-d]] | `angular-model` |
| [[functionstrategy-flags-by-function-code-function-strategy-ts]] | `angular-function-catalog` |
| [[amount-field-lock-resolution-buildfields-priority-order-as-coded]] | `angular-function-catalog` |
| [[haseligibletargetselected-per-function-shape]] | `angular-function-catalog` |
| [[validatesubmit-guard-chain-in-evaluated-order]] | `angular-function-catalog` |
| [[checksagainsttightavailable-which-functions-movementtypes-show-the-tig]] | `angular-maker-flow` |
| [[checksagainstplainavailable-which-of-the-tight-tier-functions-also-has]] | `angular-maker-flow` |
| [[tightavailablebalanceforwarning-threshold-widening]] | `angular-maker-flow` |
| [[makersubmitservice-submit-dispatch-routing-checked-in-this-order-first]] | `angular-maker-flow` |
| [[compound-shape-secondary-fields-populated-on-success-vs-on-each-failur]] | `angular-maker-flow` |
| [[loadcheckerqueue-pending-candidate-inclusion-filter]] | `angular-checker-flow` |
| [[searchcheckerlc-searchcheckercandidatesbylconly-resolution-outcome]] | `angular-checker-flow` |
| [[checkeractionsservice-release-routing-by-function-shape]] | `angular-checker-flow` |
| [[resolvelinkedmovementid-resolvesettlesdocumentarrivalids-resolution-pa]] | `angular-checker-flow` |
| [[balance-tab-visibility-gating-lc-acceptance-sg]] | `angular-inquire-lookup` |
| [[row-split-and-eventtime-eventstatus-function-resolution-outcome-per-mo]] | `angular-inquire-lookup` |
| [[snapshot-impact-source-per-tab-given-the-selected-event-s-own-ledger-r]] | `angular-inquire-lookup` |
| [[payable-movement-step-2-eligibility-a4-a6-vs-b4]] | `angular-pickers-shell` |
| [[ischeckercompoundownsubmission-compound-routing-condition]] | `angular-pickers-shell` |
| [[checkeract-dispatch]] | `angular-pickers-shell` |
| [[catalogpickerservice-load-status-requireissuereleased-defaults]] | `angular-pickers-shell` |
| [[step-type-api-call-mapping-runcase-generic-executor]] | `business-case-registry` |
| [[ref-field-resolution-mechanics]] | `business-case-registry` |
| [[business-case-registry-all-23-cases-id-side-instrument-tenor-focus-ter]] | `business-case-registry` |
| [[a4-maker-submit-applicability-by-tenor-import-document-arrival-utilize]] | `business-case-registry` |
| [[currency-derivation-3-case-resolution]] | `api-specs` |
| [[microservice-error-code-reference]] | `api-specs` |
| [[channel-function-catalog-a1-a9-b1-b5]] | `api-specs` |
| [[balancemovement-persisted-snapshot-fields-applicability]] | `api-specs` |
| [[v1-15-0-provisional-netting-exceptions]] | `api-specs` |
| [[a10-b6-close-eligibility-criteria]] | `api-specs` |
| [[import-tenor-derivation-matrix-tenortype-undertaking-availability-fina]] | `design-docs-spec` |
| [[export-tenor-derivation-matrix-tenortype-availablewith-bankrole-honour]] | `design-docs-spec` |
| [[export-bank-role-contingent-asset-obligor-profile]] | `design-docs-spec` |
| [[discrepant-documents-outcome-branch-import-side]] | `design-docs-spec` |
| [[backdated-correction-treatment-by-period-state]] | `design-docs-spec` |
| [[netting-eligibility-ias-32-42-resolution-presentation-rule-net-if-elig]] | `design-docs-spec` |
| [[ledger-natural-class-balance-class-taxonomy-and-financial-statement-re]] | `design-docs-spec` |
| [[indicative-basel-ccf-by-exposure-type-with-ccf-source]] | `design-docs-spec` |
| [[movement-direction-sign-by-instrument-family-and-movementtype]] | `design-docs-figures-mapping` |
| [[tolerance-ceilingamount-conversion-applicability]] | `design-docs-figures-mapping` |
| [[submit-vs-approved-general-pattern-by-figure-and-movement-shape]] | `design-docs-figures-mapping` |
| [[off-balance-exposure-sg-reaction-timing-by-function]] | `design-docs-figures-mapping` |
| [[function-balance-figures-touched-quick-reference-8]] | `design-docs-figures-mapping` |
| [[tf-mapping-balance-taxonomy-contingent-and-memo-only-classes]] | `design-docs-figures-mapping` |
| [[tf-mapping-invariants-i1a-i22]] | `design-docs-figures-mapping` |
| [[tf-mapping-amount-basis-sign-contract-selected-codes]] | `design-docs-figures-mapping` |
| [[tf-mapping-tenor-classification-vs-accounting-driver]] | `design-docs-figures-mapping` |
| [[contractstatus-enum]] | `db-design-docs` |
| [[movementstatus-enum]] | `db-design-docs` |
| [[exposurenature-enum]] | `db-design-docs` |
| [[tenortype-enum]] | `db-design-docs` |
| [[instrumenttype-enum]] | `db-design-docs` |
| [[movementtype-registry-authoritative-source-balanceservice-buildmovemen]] | `db-design-docs` |
| [[index-reference-balance-contracts-and-balance-movements]] | `db-design-docs` |
| [[schema-migration-history-13-migrations]] | `db-design-docs` |
| [[db-optimization-recommendations-priority-and-fix-status-as-of-2026-08-]] | `db-design-docs` |
| [[what-can-be-fixed-on-sqlite-in-place-vs-what-requires-a-database-engin]] | `db-design-docs` |
| [[sg-redemption-path-a9-standalone-vs-a3s-document-matched-compound]] | `quality-remediation-history` |
| [[a10-b6-close-eligibility-gate-test-coverage-matrix-by-condition-and-si]] | `quality-remediation-history` |
| [[tenor-type-legality-by-side-decision-2-buyer-s-usance-scope]] | `quality-remediation-history` |
| [[bal-003-extraction-outcomes-job-reduction-vs-internal-dry-ing]] | `quality-remediation-history` |
| [[function-code-coverage-a1-a9-b1-b5-to-folio-and-contingent-gl-effect]] | `ledger-html` |
| [[folio-1-import-lc-contingent-liability-customers-liability-under-dc-do]] | `ledger-html` |
| [[folio-2-import-lc-shipping-guarantee-contingent-liability-not-tenor-su]] | `ledger-html` |
| [[folio-3-import-acceptance-contingent-liability-shadow-memo-only-exposu]] | `ledger-html` |
| [[folio-4-export-confirmed-lc-confirmation-contingent-liability-sight-us]] | `ledger-html` |
| [[folio-5-export-confirmed-lc-acceptance-contingent-liability-usance-onl]] | `ledger-html` |
