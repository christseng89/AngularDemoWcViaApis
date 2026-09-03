---
knowledge_id: EXPOSURE-RULE-007
title: "或有账务分录科目族查找——instrumentType 决定借/贷科目对；LC 与 Confirmation 需按 tenor 加后缀，SHGT 与 Acceptance/DPU 则不需要"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - exposure
  - confirmed
---

# EXPOSURE-RULE-007 — 或有账务分录科目族查找——instrumentType 决定借/贷科目对；LC 与 Confirmation 需按 tenor 加后缀，SHGT 与 Acceptance/DPU 则不需要

## 状态
CONFIRMED

## 业务规则
deriveContingentAccountEntry() 依据 instrumentType 查找对应的 AccountFamily：IPLC_LC/EPLC_LC → LC_FAMILY（按 tenor 加后缀，Folio 1），SHGT → SG_FAMILY（不加后缀，Folio 2），IPLC_ACCEPTANCE → IMPORT_ACCEPTANCE_FAMILY（不加后缀，Folio 3，影子备忘性质），EPLC_CONFIRMATION → CONFIRMATION_FAMILY（按 tenor 加后缀，Folio 4），EPLC_ACCEPTANCE → EXPORT_ACCEPTANCE_FAMILY（不加后缀，Folio 5，影子备忘性质），EPLC_EXAMINATION → EXAMINATION_FAMILY（内部 memo voucher，不加后缀）；3 种表内资产类 instrumentType 返回 null。LC/Confirmation 的 tenor 后缀使用 lcTenorLabel 或 confirmationTenorLabel。

## 触发条件
以 instrumentType 作为 switch 分支；科目族为 null 会使整个函数直接短路返回。

## 结果
解析出的科目族与 MOVEMENT_DIRECTION[movementType]（同样具备 null 安全性）结合，生成最终的借/贷分录，并按照该科目族自身的 tenorSuffix 设置附加 tenor 后缀。

## 示例
IPLC_LC/ISSUE/SIGHT → 借方"Customers' Liability under DC — Sight"，贷方"Documentary Credits Outstanding — Sight"。SHGT/ISSUE → 借方"Customers' Liability under Shipping Guarantees"，贷方"Shipping Guarantees Outstanding"（无 tenor 后缀，与父 LC 或有负债账本 Folio 2 的科目说明一致）。

## 验证说明
合并了风险敞口域基于代码的候选项与基于 ledger-html 文档的"LC 与 Confirmation 的或有分录对需加 tenor 后缀；SG 与 Acceptance 不需要"候选项——同一事实来自两种不同类型的证据，完全一致，没有冲突。直接阅读了完整的源文件。

## 来源证据

实现:
- `microservices/balance-component/src/domain/contingentAccountEntry.ts:41-99, 101-117, 119-151 (verified read in full)`

测试:
- `microservices/balance-component/test/unit/domain/contingentAccountEntry.test.ts:1-202`

## 相关知识
- [[Off-Balance-Sheet Exposure]]
- 或有账务分录（借/贷）生成
- LC 与 Confirmation 的或有分录对需加 tenor 后缀；SG 与 Acceptance 不需要（ledger-html Folio 说明，佐证性来源）
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
