---
knowledge_id: EXPOSURE-RULE-027
title: "contingentAccountEntry / contingent_account_entry 在异动创建时由服务端一次性推导并不可变地持久化，与调用方传入的传递型 accountEntries 字段完全并行且相互独立"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — 分析快照中没有 .git 历史记录，参见 [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - exposure
  - confirmed
---

# EXPOSURE-RULE-027 — contingentAccountEntry / contingent_account_entry 在异动创建时由服务端一次性推导并不可变地持久化，与调用方传入的传递型 accountEntries 字段完全并行且相互独立

## 状态
CONFIRMED

## 业务规则
或有账目分录的 Dr/Cr 配对，只在异动创建时依据（instrumentType、movementType、金额正负号、已解析合约的 tenorType）计算一次，随后随该异动一并不可变地持久化——即便日后重新读取，也从不会根据当前余额重新计算。这条数据流与调用方传入、服务并不解读的传递型 accountEntries 字段完全并行且相互独立。

## 条件
每一笔异动在创建时刻。

## 结果
对于 ON_BALANCE_ASSET 类工具与 EPLC_EXAMINATION（上文已独立确认），以及任何未识别的 movementType，结果为 null。一旦写入，drAccount/crAccount/currency/amount 对该笔异动而言永不改变。

## 示例
amount 永远是一个正数的十进制字符串（正负号/方向由 Dr 与 Cr 分别落在哪个科目来体现，而非用带符号的金额表示）——这与已独立验证过的 contingentAccountEntry.ts 代码（`.abs().toFixed()`）一致。

## 验证说明
合并了三条互有重叠的候选（api-specs 与 db-design-docs 两份近乎相同的文档来源陈述，加上已独立验证过的 contingentAccountEntry.ts 源代码头部注释与 `.abs()` 调用所提供的佐证）为一条。本轮重新验证的代码层面证据强有力地佐证了文档层面的主张——尽管本轮未直接重新通读所引用的两处 OAS/DB-design 具体行号范围，仍以高置信度保留为 CONFIRMED。

## 原始码证据

实现：
- `analysis/balance-component-api.yaml lines 210-231, 1298-1315, 1390-1397（本轮未独立重新通读）`
- `Balance-Component-DB-Design.txt §4.2.3, §6.2（本轮未独立重新通读）`
- `microservices/balance-component/src/domain/contingentAccountEntry.ts:1-9, 149（已核实：头部文档注释写明「一次性生成……不可变地持久化……从不重新计算」，且 `amount: signedAmount.abs().toFixed()` 佐证了「永远是正数绝对值」这一说法）`

测试：
- （未引用直接测试证据）

## 相关知识
- [[Off-Balance-Sheet Exposure]]
- 或有账目分录科目族查找规则（上文经代码验证的规则）
- 方向到 Dr/Cr 的正负号折叠规则（上文经代码验证的规则）
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
