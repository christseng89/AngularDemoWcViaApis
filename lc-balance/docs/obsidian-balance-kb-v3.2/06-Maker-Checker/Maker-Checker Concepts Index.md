---
knowledge_id: Maker-Checker-Concepts-Index
title: "Maker-Checker 概念索引"
domain: Balance
category: Index
snapshot_date: 2026-08-22
tags:
  - balance
  - index
---

# Maker-Checker 概念索引

## 2026-08-30 现行 UI 契约

- [[Transaction Index Selection Contract|Transaction Index 交易选择契约]]
- [[tightavailablebalanceforwarning-getter|Tight LC Balance 警示与门控]]
- [[functionstrategy-registry-function-strategy-ts|FunctionStrategy 注册表]]

`06-Maker-Checker/` 目录下的每一篇笔记（共 51 篇），用于直接浏览此知识库区域。

- [[4-eyes-maker-checker-principle-applied-to-document-arrival-earmark-the|适用于 Document Arrival 先预留后终结生命周期的 4-eyes Maker/Checker 原则]]
- [[Maker Checker Lifecycle]]
- [[MakerPanelComponent]]
- [[MakerSubmitService]]
- [[a3s-compound-submit-with-auto-rollback|A3S 组合提交与自动回滚（Auto-Rollback）]]
- [[a3s-one-click-compound-release-sg-redemption-released-for-real-source-|A3S 一键组合释放：SG 赎回被真正释放，源 UTILIZE 仅被确认（acknowledge）]]
- [[a4-s-checker-visibility-gated-on-both-acknowledgedat-and-makersubmitte|A4 的 Checker 可见性同时受 acknowledgedAt 与 makerSubmittedAt 双重门控]]
- [[amount-field-lock-resolution-buildfields|Amount 字段锁定解析（buildFields）]]
- [[amount-field-locking-priority-chain-builder-fields-ts|Amount 字段锁定优先级链（builder-fields.ts）]]
- [[b2-direction-signed-amount-handling|B2 Direction / 带符号 Amount 处理]]
- [[checker-action-routing-by-compound-submission-shape|按组合提交（compound-submission）形态路由的 Checker 动作]]
- [[checker-independent-search-auto-resolve-by-candidate-count|Checker 独立搜索：按候选数量自动解析]]
- [[checker-queue-load-and-filter-pipeline-loadcheckerqueue|Checker Queue 加载与过滤流水线（loadCheckerQueue）]]
- [[checker-s-own-independent-search-auto-resolve-when-the-secondary-key-i|次要键未知时，Checker 自身独立搜索的自动解析]]
- [[checkeractioncontext-interface-segregation-boundary-for-checker-action|CheckerActionContext——Checker 动作的接口隔离（Interface Segregation）边界]]
- [[checkeractionsservice-checker-release-reject-cancel-api-orchestration|CheckerActionsService——Checker release/reject/cancel API 编排]]
- [[checkeractionsservice-release-dispatch-by-compound-submission-shape|CheckerActionsService.release() 按组合提交形态分发]]
- [[checkerid-derivation-from-createdby-2-checker-simplification|从 createdBy 推导 checkerId（双 Checker 简化模型）]]
- [[checkerpanelcomponent-checker-independent-search-pending-movement-queu|CheckerPanelComponent——Checker 独立搜索 + PENDING movement 队列]]
- [[checksagainsttightavailable-checksagainstplainavailable-getters|checksAgainstTightAvailable / checksAgainstPlainAvailable getters]]
- [[compound-business-events-span-multiple-balancemovement-legs-under-one-|组合业务事件在同一个 businessEventId 下横跨多个 BalanceMovement leg]]
- [[compound-submission-linked-legs|组合提交（Compound Submission）/ 关联 Leg]]
- [[compoundlegstate-compoundlegs|CompoundLegState（compoundLegs）]]
- [[createmovement-end-to-end-orchestration|createMovement()——端到端编排]]
- [[cross-session-linked-leg-resolution-via-businesseventid-referencedtran|通过 businessEventId / referencedTransactionId 实现跨会话关联 leg 解析]]
- [[currency-carry-and-protect-rule|Currency 携带与保护规则（Carry-and-Protect Rule）]]
- [[deletemakerpending-maker-ec-cancels-linked-legs-in-reverse-creation-or|deleteMakerPending()（Maker EC）按创建顺序的逆序取消关联 leg]]
- [[earmarking-vs-earmarked-checker-queue-filter-split|EARMARKING 与 EARMARKED 的 Checker Queue 过滤分流]]
- [[eligibility-rule-unification-eligibility-rule-ts|资格规则统一（Eligibility Rule Unification，eligibility-rule.ts）]]
- [[fixed-demo-maker-checker-identities-no-real-auth-modeled|固定演示用 Maker/Checker 身份，未建模真实身份验证]]
- [[functionstrategy-registry-function-strategy-ts|FunctionStrategy 注册表（function-strategy.ts）]]
- [[guardsecondaryaction-shared-shape-for-acknowledgearrival-submitbymaker|guardSecondaryAction()——acknowledgeArrival()/submitByMaker() 的共享形态]]
- [[ib-eb-number-terminology-by-side|按 Side 划分的 IB/EB Number 术语]]
- [[legal-transitions-table|LEGAL_TRANSITIONS 合法状态迁移映射表]]
- [[live-balance-sufficiency-warning-gating-per-keystroke|实时 Balance 充足性警告门控（按每次按键）]]
- [[maker-checker-4-eyes-movement-lifecycle|Maker/Checker（四眼原则）资金变动生命周期]]
- [[maker-checker-earmark-vs-release-separation-defersettlement|Maker/Checker 的 Earmark 与 Release 分离（deferSettlement）]]
- [[maker-submit-validation-guard-chain-validatesubmit|Maker Submit 校验守卫链（validateSubmit）]]
- [[makersubmitoutcome-discriminated-union|MakerSubmitOutcome 判别联合类型（discriminated union）]]
- [[movementaction-applystatustransition-state-machine|MovementAction / applyStatusTransition() 状态机]]
- [[movementstatus-state-machine-maker-checker-4-eyes-lifecycle|MovementStatus 状态机（四眼原则生命周期图示）]]
- [[movementsufficiencyoutcome-discriminated-union|MovementSufficiencyOutcome 判别联合类型（discriminated union）]]
- [[movementtypematchesfunction-resolvefunctionformovement-strategy-lookup|movementTypeMatchesFunction / resolveFunctionForMovement 策略查找（Strategy Lookup）]]
- [[movementtyperegistry-strategy-type-object-registry-for-movementtype-cl|movementTypeRegistry（用于 movementType 分类的 Strategy/Type-Object 注册表）]]
- [[named-business-function-catalog-a1-a10-import-b1-b6-export|具名业务功能目录（A1-A10 Import / B1-B6 Export）]]
- [[newcontractsufficiencyregistry-shgt-issue-eplc-examination-create-disp|newContractSufficiencyRegistry（SHGT:ISSUE / EPLC_EXAMINATION:CREATE 分发表）]]
- [[no-eligible-records-submit-lock-gate-haseligibletargetselected|"No Eligible Records" 提交锁定关卡（hasEligibleTargetSelected）]]
- [[per-function-checker-queue-scoping-via-movementtypematchesfunction|通过 movementTypeMatchesFunction 实现的按功能 Checker Queue 范围限定]]
- [[pure-function-extraction-pattern-function-policy-ts-builder-fields-ts-|纯函数抽取模式（Pure-Function Extraction Pattern，function-policy.ts / builder-fields.ts / submit-rules.ts）]]
- [[reject-uses-a-hardcoded-checkerid-not-derived-from-createdby-inconsist|reject() 使用硬编码的 checkerId，并非从 createdBy 推导——与 release() 不一致]]
- [[release-checker-approve-orchestration-including-b3-b4-consumption-and-|release()——Checker Approve 编排，包含 B3/B4 消费（consumption）与 A10/B6 Close 副作用]]
- [[resolveorcreatecontract-contract-resolution-creation-preamble|resolveOrCreateContract()——合约解析/创建前置流程]]
- [[snapshot-capture-pipeline-assemblesnapshot-capturerooteventsnapshot-ca|快照采集流水线（assembleSnapshot / captureRootEventSnapshot / captureSiblingSnapshots / captureSnapshotBundle / resolveSnapshotWriteTarget）]]
- [[tenor-type-days-carry-and-lock-a1-sight-normalization|Tenor Type/Days 携带与锁定 + A1 Sight 归一化（Normalization）]]
- [[tightavailablebalanceforwarning-getter|tightAvailableBalanceForWarning getter]]
- [[universal-amount-0-guard-with-close-exemption|通用 Amount > 0 守卫（含 CLOSE 例外）]]
