---
knowledge_id: Transaction-Index-Selection-Contract
title: 'Transaction Index 交易选择契约'
aliases:
  - '交易选择索引'
domain: Balance
category: Maker-Checker
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: '3917866'
snapshot_date: 2026-09-01
tags:
  - balance
  - transaction-index
  - selection
---

# Transaction Index 交易选择契约

Transaction Index 是选择完整业务身份的单一入口，不要求使用者先选 LC，再到另一清单猜测 Secondary Reference。清单固定每页 10 笔，并支持查询、排序与分页。

| 功能                                 | 一次选定的身份        | 金额栏位                        |
| ------------------------------------ | --------------------- | ------------------------------- |
| A3S                                  | LC Number + SG Number | SG Amount                       |
| A6                                   | LC Number + IB Number | IB Amount                       |
| B4                                   | LC Number + EB Number | EB Amount                       |
| A4、A7                               | LC Number + IB Number | presentation／acceptance amount |
| B5                                   | LC Number + EB Number | export bill amount              |
| A2、A3、A8、A10、A11、B2、B3、B6、B7 | LC Number             | Tight LC Balance                |

Secondary Reference 只在业务身份需要它时显示。选择一列即带入主参考、次参考与金额，避免 LC 与 IB／EB／SG 配错。

## UI 显示门控

尚未选择任何功能时，Maker、Checker 与 Lookup 面板全部隐藏。选定功能后，再根据 `FunctionStrategy` 组合适用的 picker、栏位、校验与 Checker 搜索条件。

## API 权威验证

Index 只显示候选交易，不能作为最终业务控制。Maker Submit/API create 会重新解析 contract、parent 与 referenced transaction；Checker Release 会根据最新状态再验证一次。

- A6：来源必须是同 LC、已 acknowledged、仍 PENDING 且尚未 Maker Submit 的 A3／A3S UTILIZE。
- B4：来源必须是同 Confirmation、已 RELEASED、未消耗且未被另一笔 pending B4 占用的 B3 Present Docs。
- A4：Maker Submit 时目标合约必须仍为 ACTIVE 且 tenor 为 SIGHT。
- 其他 derived function：目标必须仍处于该 function 允许的 lifecycle status；一般为 ACTIVE，Close／Reopen 使用各自的明确例外。
- parent logical contract 必须存在且仍为 ACTIVE；缺失或失效不得静默通过。

因此，即使直接调用 API 或 Index 载入后发生并发状态变化，错误状态交易也不会通过 Maker Submit 或 Checker Release。

## 来源证据

- `src/app/transaction-builder/catalog-picker.service.ts`
- `src/app/transaction-builder/maker-panel.component.ts`
- `src/app/transaction-builder/function-strategy.ts`
- `src/app/transaction-builder/transaction-builder.component.html`
- `docs/current-behavior.md`
- `microservices/balance-component/src/service/movementContractService.ts`
- `microservices/balance-component/src/service/movementReleasePolicyService.ts`

## 相关知识

- [[functionstrategy-registry-function-strategy-ts]]
- [[MakerPanelComponent]]
- [[A3S-Document-Arrival-SG]]
- [[A6-Acceptance-Usance]]
- [[B4-Honour-Acceptance]]
