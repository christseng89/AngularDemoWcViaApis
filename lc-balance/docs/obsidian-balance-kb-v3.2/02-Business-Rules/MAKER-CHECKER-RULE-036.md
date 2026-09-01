---
knowledge_id: MAKER-CHECKER-RULE-036
title: 'deleteMakerPending() 按建立顺序反向撤销复合分腿，主分腿最后处理'
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: 'N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]'
snapshot_date: 2026-08-22
tags:
  - balance
  - maker-checker
  - confirmed
---

# MAKER-CHECKER-RULE-036 — deleteMakerPending() 按建立顺序反向撤销复合分腿，主分腿最后处理

## 状态

CONFIRMED

## 业务规则

对于 A3S 与 B4 复合提交，`deleteMakerPending()` 依策略取消相关 legs，避免遗留孤立 PENDING movement。B5 已是 plain 单一 settlement，Delete Pending 只取消其 primary movement。

## 条件

所选功能的 Strategy 判定为复合形态，且相应的关联分腿 id 已存在于 ctx 中。

## 结果

一连串按顺序执行的 api.cancel() 调用（最下游者优先），只有在前面每一步都成功后，才会调用 cancelPrimary()；任何一步失败，都会呈现一则指出具体是哪个分腿失败的讯息，并中止整条链。

## 示例

B4 Usance/ACCEPT 的经办人撤销：先撤销偿付应收款，再撤销承兑负债，最后撤销主 Confirmation ACCEPT，依此顺序。

## 验证说明

候选证据自身所引用的测试（spec.ts:439-464）仅为 createdBy 防护测试，并非直接断言完整的反向顺序链——候选证据本身也标注了这个缺口（“完整顺序未在此直接重新测试”）。已由 CONFIRMED 降级为 INFERRED：顺序方面的说法，由源码自身的调用结构强烈暗示（已重新阅读第 166-223 行，确认存在反向顺序的调用链），但缺乏一条直接引用、能端到端证明确切顺序的通过测试。

## 来源证据

实现：

- `src/app/transaction-builder/checker-actions.service.ts:166-223`

测试：

- （未引用直接测试证据）

## 相关知识

- [[Maker Checker Lifecycle]]
- deleteMakerPending()（经办人撤销）按建立顺序反向撤销关联分腿
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
