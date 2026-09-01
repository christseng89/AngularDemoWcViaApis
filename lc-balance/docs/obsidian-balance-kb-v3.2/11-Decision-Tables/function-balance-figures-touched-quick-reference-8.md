---
knowledge_id: function-balance-figures-touched-quick-reference-8
title: '功能 → 涉及的余额数字（快速参考，§8）'
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# 功能 → 涉及的余额数字（快速参考，§8）

| Function（功能）         | Confirmed/Available/Pending Earmark | Off-Balance Exposure（表外风险敞口）                                  | Tight Available Balance            | Present Docs Earmark P/A      | SG P/A                                        | Document Arrival P/A          |
| ------------------------ | ----------------------------------- | --------------------------------------------------------------------- | ---------------------------------- | ----------------------------- | --------------------------------------------- | ----------------------------- |
| A1 LC 开立               | 自身合约                            | —                                                                     | 自身合约                           | —                             | —                                             | —                             |
| A2 修改（增/减）         | 自身合约                            | —                                                                     | 自身合约                           | —                             | —                                             | —                             |
| A3 单据到达              | 自身合约                            | —                                                                     | 自身合约                           | —                             | —                                             | 自身移动记录                  |
| A3S 附提货担保的单据到达 | LC + SG 合约                        | LC（于 Submit 时触发反应）                                            | LC                                 | —                             | LC（于 Release 时拆分）                       | LC 自身的 UTILIZE             |
| A4 即期结算              | LC（仅于 Release 时）               | —                                                                     | —                                  | —                             | —                                             | LC 自身的 UTILIZE（最终确认） |
| A6 远期承兑              | LC（于 Release 时）+ Acceptance     | —                                                                     | —                                  | —                             | —                                             | LC 自身的 UTILIZE（最终确认） |
| A7 承兑结算              | 自身合约                            | null                                                                  | null                               | —                             | —                                             | —                             |
| A8 提货担保开立          | SG 自身合约                         | LC（于 Submit 时触发反应）                                            | LC                                 | —                             | LC（于 Release 时拆分）                       | —                             |
| A9 提货担保赎回          | SG 自身合约                         | LC（仅于 Release 时触发反应——独立事件；A3S 例外情形于 Submit 时触发） | LC                                 | —                             | LC（仅影响 Approved 分组，不影响 Pending 侧） | —                             |
| A10 LC 结清              | 自身合约（冲销至 0）                | —（仅当已为 0 时才符合资格）                                          | 自身合约                           | —                             | —（仅当已为 0 时才符合资格）                  | —                             |
| B1 保兑 LC               | 自身合约                            | null                                                                  | 自身合约                           | 不受影响                      | —                                             | —                             |
| B2 修改（增/减）         | 自身合约                            | null                                                                  | 自身合约                           | 不受影响                      | —                                             | —                             |
| B3 交单                  | 无影响（MEMO_ONLY）                 | null                                                                  | Confirmation（经由 Earmark）       | 自身合约，于 Release 时拆分   | —                                             | —                             |
| B4 兑付/承兑             | Confirmation + 新的资产/负债合约    | null                                                                  | Confirmation（消耗 Approved 分组） | Confirmation（Approved 减少） | —                                             | —                             |
| B5 结算                  | Acceptance only                     | null                                                                  | null                               | 不受影响                      | —                                             | —                             |
| B6 保兑 LC 结清          | 自身合约（冲销至 0）                | null                                                                  | 自身合约                           | —（仅当已为 0 时才符合资格）  | —                                             | —                             |

## Source Evidence

- `Balance-Figures-Calculation-Logic.txt lines 1308-1372 (§8 Quick-Reference)`

## Related Knowledge

- Balance Figures Calculation Logic + TF Balance Component Mapping Workbook
- [[Business-Rule-Index]]
