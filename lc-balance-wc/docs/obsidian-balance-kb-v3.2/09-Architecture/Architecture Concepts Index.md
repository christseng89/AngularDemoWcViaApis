---
knowledge_id: Architecture-Concepts-Index
title: '架构概念索引'
domain: Balance
category: Index
snapshot_date: 2026-08-22
tags:
  - balance
  - index
---

# 架构概念索引

## 2026-08-30 架构更新

- [[BalanceService Facade Architecture|BalanceService Façade／SOLID 架构]]
- [[business-case-runner-ui-single-run-vs-run-all-sequential-chain|Business Case Runner 顺序执行与保留种子]]
- [[Freshness-Update-Log-2026-08-30|2026-08-30 知识新鲜度更新]]

`09-Architecture/` 目录下的架构笔记，供直接浏览本知识库区块使用。

## 2026-08-31 Web Component 更新

- [[balance-component-web-component-phase-1|Balance Component Web Component Phase 1]]
- [[balance-component-web-component-phase-2|Balance Component Web Component Phase 2]]
- [[balance-component-web-component-phase-3|Balance Component Web Component Phase 3]]

- [[Balance Architecture]]
- [[CatalogPickerService]]
- [[DocumentArrivalHintsService]]
- [[IndexPickerComponent]]
- [[PagedListState]]
- [[PickerSelectionService]]
- [[a10-b6-close-eligibility-gate-and-write-off-flow|A10/B6 Close——资格判定关卡与核销流程]]
- [[a4-a6-payable-movement-selection-with-4-eyes-eligibility-gating|A4/A6 应付款项异动选择与四眼原则资格管控]]
- [[a9-lock-basis-wording-conflict-decision-memo-s-own-action-item-table-v|A9 锁定基础表述 CONFLICT——决策备忘录自身行动项表格 vs. 实际交付行为]]
- [[bal-003-god-component-closed-after-9-tracked-extraction-outcomes-acros|BAL-003 God Component——历经 9 次可追踪的抽取重构成果后结案]]
- [[catalogpickerservice-fetch-paginate-qualify-sequence|CatalogPickerService 的 fetch/分页/合格判定 时序]]
- [[checker-action-dispatch-and-compound-release-routing|Checker 动作派发与复合放行路由]]
- [[compound-checker-release-reject-routing|复合式 Checker 放行/拒绝路由]]
- [[createmovement-cognitive-complexity-persistent-worst-offender-survives|createMovement() 认知复杂度——持续居首的问题热点，历经一次重构仍未根除]]
- [[independent-checker-session-release-reject-guard-fix|独立 Checker 会话放行/拒绝守卫修复]]
- [[only-one-candidate-auto-pick-convention|唯一候选自动选取惯例]]
- [[rate-limiter-false-positive-artifact-when-business-cases-are-run-back-|Business Case 连续执行时出现的限流器误判假象]]
- [[regression-baseline-14-case-registry-100-pass-established-before-phase|回归测试基线——14 个用例的登记表，100% 通过，建于 Phase-1 OOD 重构之前]]
- [[sg-redemption-routing-a9-standalone-vs-a3s-document-matched|SG 赎回路由——A9 独立 vs. A3S 单据匹配]]
- [[sonarqube-quality-gate-sustained-pass-across-three-scans|SonarQube 质量门禁——连续三次扫描均保持 PASS]]
- [[strategy-pattern-in-name-only-the-14-function-registry-s-flag-bag-desi|徒有其名的 Strategy 模式——14 个功能登记表的“标志位大杂烩”设计（F-01）]]
- [[the-microservice-s-own-uncredited-god-method-f-02|该微服务自身未被点名的 God Method（F-02）]]
- [[themeservice-appcomponent-theme-toggle|ThemeService / AppComponent 主题切换]]
- [[transactionbuildercomponent-orchestration-shell|TransactionBuilderComponent（编排壳层）]]

## UI 组件

- [[BalanceSnapshotBoxComponent|余额快照展示组件，两画面共用]]
- [[InquireDeletePendingComponent|Delete Pending 查询视图组件]]
- [[accountentriesdialogcomponent-view-voucher|查看凭证对话框组件]]
- [[eventbalancetab-balance-tabs-lc-acceptance-sg|Event 余额标签页（LC/承兑/保函）]]
- [[inquireeventscomponent-view-layer-extraction|Inquire Events 纯视图层组件]]

## Business Case Runner（编排器）

- [[business-case-runner-ui-single-run-vs-run-all-sequential-chain|单次运行 vs 全部运行顺序链]]
- [[cors-allow-list-bal-103|后端 CORS 白名单配置]]
- [[createandrelease-step-pair-helper-bal-127|createAndRelease 步骤对折叠辅助函数]]
- [[declarative-business-case-registry-businesscases-js|声明式 Business Case 登记表]]
- [[export-case-1-5-legacy-vs-export-case-6-11-current-b3-b4-redesign-arch|出口案例新旧架构分野（B3/B4 重设计前后）]]
- [[orchestrator-hardening-rate-limiting-and-error-redaction-bal-118-bal-1|编排器限流与错误信息脱敏]]

## 步骤执行器 / Trace 追踪

- [[angular-tracestep-type-union-omits-makersubmit|TraceStep 联合类型遗漏 makerSubmit]]
- [[expected-error-step-styling-inversion|预期错误步骤的成功/失败样式反转]]
- [[generic-step-executor-trace-generation-runcase|通用步骤执行器生成执行轨迹]]
- [[release-shaped-step-types-dispatch-table-bal-124|release/makerSubmit 统一分派表]]
- [[runcase-generic-step-executor-dispatch|runCase 步骤类型分派流程图]]
- [[step-level-reference-resolution-mechanics|步骤层级三种引用解析机制]]

## Inquire Events 读模型

- [[derivelcamount-client-side-face-amount-mirror|客户端 Face Amount 镜像计算]]
- [[functionforevent-functionfor-strategy|functionForEvent 功能识别策略模式]]
- [[inquire-events-lc-selection-to-per-event-drill-down-facade-strategy-de|LC 选取到事件钻取全流程图]]
- [[inquiredevent-adapter|InquiredEvent 适配器模式]]
- [[inquireeventsservice-facade|InquireEventsService 外观模式服务]]
- [[lcindexrow-closingpending|LcIndexRow.closingPending 派生字段]]
- [[movementsof-childmovementsof-merged-timeline-construction|合并事件时间线构建函数]]
- [[ood-design-patterns-used-in-inquire-events-look-up-read-model|读模型中的四种 OOD 设计模式]]
- [[secondaryreferenceforevent-secondaryreferencefor|次要参考号推导函数]]
- [[toeventrows-create-finalize-row-split|toEventRows create/finalize 分行逻辑]]

## 杂项

- [[balanceservice-ts-movementtyperegistry-outstandingcapped-decreaseshape|movementTypeRegistry 充足性检查派发表]]
- [[balance-component-web-component-phase-4]] — Angular, React and Vue thin adapter boundary
