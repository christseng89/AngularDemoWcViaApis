---
knowledge_id: get-balance-contracts-and-catalog-opt-in-query-flags
title: "GET /balance-contracts 与 /catalog——可选查询标志位"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# GET /balance-contracts 与 /catalog——可选查询标志位

| Flag（标志位） | Default（省略时的默认行为） | When true（设为 true 时的行为） | Applies to（适用对象） |
|---|---|---|---|
| includeAnyStatus（用于 GET /balance-contracts） | 对非 ACTIVE 状态的合约返回 404 | 按自然键解析出任意状态（例如 CLOSED）的合约 | 所有会创建交易的调用方都必须省略此参数；只有查询（Look Up）场景会传入 true |
| requireIssueReleased（用于 GET /balance-contracts/catalog） | 包含自身 ISSUE 仍为 PENDING 的合约 | 排除自身 ISSUE 尚未 RELEASED 的合约 | Maker 操作用的选择器；刻意不适用于纯查询场景或 B4 的交单搜索 |
| tenorFamily=SIGHT\|USANCE（用于 GET /balance-contracts/catalog） | 不做期限过滤 | 服务端对分页结果集过滤，使分页结果仅反映符合期限条件的子集 | 任何需要按期限筛选候选项的选择器；无效值会返回 400 |

## Source Evidence

- `src/routes/balanceContracts.ts:9-58`
- `test/unit/app.test.ts:2278-2414`

## Related Knowledge

- Express Routes + End-to-End API Behavior
- [[Business-Rule-Index]]
