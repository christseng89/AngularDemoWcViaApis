---
knowledge_id: a10-b6-close-eligibility-gate-test-coverage-matrix-by-condition-and-si
title: "A10/B6 关闭资格门禁——按条件与买卖方向划分的测试覆盖矩阵"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# A10/B6 关闭资格门禁——按条件与买卖方向划分的测试覆盖矩阵

| 门禁条件（domain/closeEligibility.ts） | 进口方向（A10）覆盖情况 | 出口方向（B6）覆盖情况 | 是否两侧均适用？ |
|---|---|---|---|
| 装船保函保兑余额必须 = 0 | import-case-11（反向用例，expectError: true）——SG 仍为 30,000 时返回 409 | 不适用——装船保函（SHGT）仅存在于进口方向，出口方向没有对应场景 | 否——仅限进口方向分支 |
| 承兑保兑余额必须 = 0 | import-case-12（反向用例）——承兑仍为 50,000 时返回 409 | export-case-11（反向用例）——承兑负债仍为 10,000 时返回 409 | 是——closeEligibility.ts 中的 acceptanceMovements 检查在两个根合约方向上均无条件执行 |
| 整棵事件树中不存在未结事件（含已 RELEASED 但尚未被消耗的 B3 交单） | 由 import-case-8/9/10 自身「完整生命周期走到终态」的设计隐含覆盖 | 由 export-case-8/9 自身「完整生命周期走到终态」的设计隐含覆盖 | 是 |
| 合约尚未处于 CLOSED | 本轮未单独做反向测试 | 本轮未单独做反向测试 | 是 |
| 核销金额必须与当前保兑余额精确相等 | import-case-8/9/10 正向路径——关闭操作将剩余余额精确核销为 0 | export-case-8/9 正向路径——关闭操作将剩余余额精确核销为 0 | 是 |

## 来源证据

- `Balance-Component-Import-Case-12-Verification-2026-08-22.md:1-58`
- `Balance-Component-Export-Case-11-Verification-2026-08-22.md:1-59`
- `Balance-Component-New-Test-Cases-Verification-2026-08-21.md:34-40`

## 相关知识

- Quality/Remediation History Docs
- [[Business-Rule-Index]]
