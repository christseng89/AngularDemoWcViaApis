---
knowledge_id: MOVEMENT-RULE-040
title: "B2 的方向取决于金额的正负号，而非一个独立的 movementType — 已通过实际业务案例测试数据端到端确认"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - movement
  - confirmed
---

# MOVEMENT-RULE-040 — B2 的方向取决于金额的正负号，而非一个独立的 movementType — 已通过实际业务案例测试数据端到端确认

## Status
CONFIRMED

## Business Rule
出口 LC 修改（B2）并不区分 AMEND_INCREASE/AMEND_DECREASE 两种 movementType——每一笔 B2 修改一律使用 movementType='AMEND'，金额为正表示增加、为负表示减少；当计算得出的 ceilingAmount 为负数时，会触发与 AMEND_DECREASE 类似的 Tight-Available 充足性校验。

## Conditions
instrumentType=EPLC_CONFIRMATION，movementType=AMEND

## Result
amount > 0 时，Confirmed Balance 增加相应金额；amount < 0 时，减少 |amount|，并对照 Tight Available 进行校验

## Example
export-case-10：AMEND +20,000 成功（Confirmed 从 100,000 变为 120,000）；在 Tight Available 为 120,000 的情况下 AMEND -130,000 被拒绝（409），Confirmed 维持在 120,000

## Verification Note
直接阅读了确切的案例数据；已确认金额/错误值。这是对上文已在领域/服务层面覆盖的同一规则，在业务案例层面所做的端到端确认；因其证据来自一次实际运行的端到端场景而非单元级代码，故单独保留为一条记录，但以交叉引用而非逐字重复的方式呈现。

## Source Evidence

Implementation:
- `backend/data/businessCases.js:2258-2315`

Tests:
- `backend/test/businessCases.test.js:80-83`

## Related Knowledge
- [[BalanceMovement]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
