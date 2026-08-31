---
knowledge_id: TOLERANCE-RULE-012
title: "Export Confirmation 的 confirmed_amount 独立于所依附 LC 自身的金额（UCP 600 Art. 10(b)）"
domain: Balance
category: Business Rule
status: INFERRED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - tolerance
  - inferred
---

# TOLERANCE-RULE-012 — Export Confirmation 的 confirmed_amount 独立于所依附 LC 自身的金额（UCP 600 Art. 10(b)）

## Status
INFERRED

## Business Rule
设计文档原则：保兑行可以只是通知 LC 修改，而不随之扩大自身的保兑范围，因此 confirmed_amount 与其所依附的 lc_amount 确实可能出现分歧；保兑相关的 contingent 应仅以 confirmed_amount 为准来驱动，绝不能假定其与 LC 金额同步变动。

## Conditions
开证行修改 LC 金额，而保兑行仅通知该修改、并未随之扩大自身保兑范围。

## Result
设计意图：confirmed_amount 维持原值不变；lc_amount 反映新金额；保兑相关的 contingent 仅追踪 confirmed_amount。

## Example
LC 修改 +20,000 至 120,000，保兑未随之扩大：lc_amount = 120,000，保兑相关 contingent 仍维持在 100,000。

## Verification Note
已从候选条目原本的 CONFIRMED 降级为 INFERRED。证据仅来自设计文档——已对代码库进行搜索，确认 types.ts 或领域层中完全不存在明确的 'confirmed_amount'/'lc_amount' 字段配对；文档所用的 'confirmed_amount' 一词在代码中完全没有出现。真正能支持此原则的底层架构事实是：EPLC_LC 与 EPLC_CONFIRMATION 被建模为两个结构上彼此独立的 BalanceContract 行，各自拥有独立的 amount/ceilingAmount（依据 tolerance.ts 文档注释中"EPLC_LC 仅供参考"的说明），这使得该原则显得合理、与实现相容，但没有任何测试或代码路径专门针对本规则所描述的"修改已通知但保兑未扩大"这一场景进行验证——因此评为 INFERRED 而非 UNCLEAR（因为这一独立合约架构确实提供了实质支持）。

## Source Evidence

Implementation:
- `converted/TF_Contingent_Liability_Lifecycle-en.txt:1281-1282 (verified content matches)`

Tests:
- (no direct test evidence cited)

## Related Knowledge
- [[Tolerance Processing]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
