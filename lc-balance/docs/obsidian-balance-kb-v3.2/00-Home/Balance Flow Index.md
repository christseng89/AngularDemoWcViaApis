---
knowledge_id: Balance-Flow-Index
title: 'Balance Flow Index'
domain: Balance
category: Index
snapshot_date: 2026-09-01
tags:
  - balance
  - index
---

# Balance Flow Index

v3.2 结构：按业务功能（Function）组织端到端业务流程，现行目录为进口 A1、A2、A3、A3S、A4、A6–A11（A5 已移除）与出口 B1–B7，并包含跨功能生命周期与技术专题笔记。每个功能文件夹下的主笔记给出完整流程分析，子笔记补充具体判定与规则。

**2026-08-26 更新：** F1 新增 A11（进口 LC Reopen）、B7（出口 Confirmed LC Reopen）两个具名功能，详见 [[A11-LC-Reopen]]、[[B7-Confirmed-LC-Reopen]]，以及 [[Freshness-Update-Log-2026-08-26]]。

需要按 API 端点或代码调用路径查找功能对照，见 [[Function-API Integration Map]]。

另见：[[Balance Derivation Rules]]、[[Maker Checker Lifecycle]]、[[Off-Balance-Sheet Exposure]]。

## A-Import（进口方向，11 个功能）

- **[[A1-LC-Issue|A1 — 进口信用状开立（LC Issue）]]**
- **[[A2-LC-Amendment|A2 — 进口信用证修改（LC Amendment）]]**
  - [[checkamenddecreasesufficiency|checkAmendDecreaseSufficiency()]]
  - [[checkdecreaseshapedsufficiency-per-instrumenttype-tight-available-bala|checkDecreaseShapedSufficiency() — 按 instrumentType 划分的 Tight Available Balance 推导]]
- **[[A3-Document-Arrival|A3 — 单据到单（Document Arrival）]]**
- **[[A3S-Document-Arrival-SG|A3S — 单据到单（含提货担保赎回）Document Arrival with Shipping Guarantee Redemption]]**
  - [[a3s-matched-businesseventid-sg-redemption-netting-ordering|A3S matched-businessEventId SG 赎回净额处理顺序]]
- **[[A4-Sight-Settlement|A4 — 即期结汇（Sight Settlement）功能分析]]**
  - [[a4-maker-submit-gate-is-sight-tenor-scoped-reflected-in-registry-step-|A4 的 Maker Submit 关卡仅限定于 Sight tenor 范围，体现在 registry 的 step 形态之中]]
  - [[a4-sight-only-maker-submit-gate|A4 仅限 Sight 的 Maker Submit 关卡]]
- **[[A6-Acceptance-Usance|A6 — 承兑／延期付款建立（Acceptance/Usance Create）]]**
  - [[acceptance-create-tenor-routing-decision|Acceptance CREATE 的 tenor 路由判定]]
  - [[checkacceptancetenorconsistency|checkAcceptanceTenorConsistency()]]
  - [[sight-vs-usance-tenor-flow-control|Sight 与 Usance 的 tenor 流程控制]]
- **[[A7-Acceptance-Settlement|A7 — 承兑结算（Acceptance Settlement）功能分析]]**
- **[[A8-SG-Issue|A8 — 提货担保开立（Shipping Guarantee Issue）]]**
- **[[A9-SG-Redemption|A9 — 提货担保赎回（Shipping Guarantee Redemption，仅限全额 Full Redeem）]]**
  - [[sg-redemption-amount-min-bill-amount-sg-outstanding|SG Redemption Amount = MIN(Bill Amount, SG Outstanding)]]
- **[[A10-LC-Close|A10 — 进口信用状结案（LC Close）]]**
- **[[A11-LC-Reopen|A11 — 进口信用状重开（LC Reopen）]]**

## B-Export（出口方向，7 个功能）

- **[[B1-Confirm-LC|B1 — 出口信用状保兑（Confirm LC）]]**
- **[[B2-Confirm-LC-Amendment|B2 — 保兑信用证修改（Confirm LC Amendment）]]**
- **[[B3-Present-Docs|B3 — 交单（Present Docs）]]**
  - [[b3-genuinely-releases-the-removed-acknowledge-only-design|B3 真正执行 RELEASE；被移除的仅 acknowledge() 设计]]
- **[[B4-Honour-Acceptance|B4 — 兑付／承兑（Honour/Acceptance）]]**
- **[[B5-Settlement-Reimbursement-Maturity|B5 — 结算（偿付／到期）Settlement — Reimbursement / Maturity]]**
- **[[B6-Confirmed-LC-Close|B6 — 保兑信用状结案（Confirmed LC Close）]]**
- **[[B7-Confirmed-LC-Reopen|B7 — 保兑信用状重开（Confirmed LC Reopen）]]**

## Cross-Function-Flows（跨功能流程）

生命周期总览笔记：

- [[Import-LC-Full-Lifecycle|进口信用状完整生命周期（Import LC Full Lifecycle）]]
- [[Export-Confirmed-LC-Full-Lifecycle|出口保兑信用状完整生命周期（Export Confirmed LC Full Lifecycle）]]

跨功能技术专题笔记：

- [[a10-b6-close-as-a-maker-checker-triggered-write-off-modelled-on-natura|A10/B6 Close 作为由 Maker/Checker 触发的核销，其建模参照自然到期（natural-expiry）会计处理]]
- [[a10-b6-close-submit-through-release-lifecycle|A10/B6 Close——从 Submit 到 Release 的生命周期]]
- [[a10-b6-close-write-off-lifecycle|A10 / B6 Close 核销生命周期]]
- [[a10-b6-close-write-off-pattern-import-case-8-9-10-11-12-export-case-8-|A10 / B6 Close 核销模式（import-case-8/9/10/11/12，export-case-8/9/11）]]
- [[a6-b4-b5-compound-linked-leg-release-pattern|A6 / B4 关联腿 release 与 B5 单腿结算对照]]
- [[b3-b4-compound-release-export-present-docs-honour-accept|B3 → B4 复合式 release（Export Present Docs → Honour/Accept）]]
- [[closeeligibilityinputs-closeeligibilityresult-evaluatecloseeligibility|CloseEligibilityInputs / CloseEligibilityResult / evaluateCloseEligibility()]]
- [[evaluatecontractcloseeligibility-private-service-method-3-call-sites|evaluateContractCloseEligibility()（私有服务方法，3 处调用点）]]
- [[listcloseeligiblecontracts-step-1-picker-hint-with-n-1-batch-fetch|listCloseEligibleContracts()——Step-1 picker 提示，采用 N+1 批量抓取（batch-fetch）]]
- [[release-s-close-specific-re-check-and-markclosed-side-effect|release() 针对 CLOSE 的专属重新检查与 markClosed() 副作用]]
- [[shgt-acceptance-asset-side-redemption-sufficiency-check|SHGT/Acceptance/资产侧（Asset-side）赎回充分性检查]]
