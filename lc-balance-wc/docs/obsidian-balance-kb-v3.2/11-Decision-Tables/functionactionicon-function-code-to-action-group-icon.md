---
knowledge_id: functionactionicon-function-code-to-action-group-icon
title: "functionActionIcon() ——功能代码到操作分组图标的映射"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# functionActionIcon() ——功能代码到操作分组图标的映射

| Group（分组） | Icon semantic（图标语义） | Function codes（功能代码） |
|---|---|---|
| issue | 建立新的余额/额度记录 | A1、A6、A8、B1 |
| amend | 调整既有余额 | A2、B2 |
| utilize | 交单/最终确认一次交单 | A3、A3S、A4、B3、B4 |
| redeem（默认兜底） | 结清既有风险敞口 | A7、A9、B5（以及任何未识别的代码） |
| cross | 彻底注销该 LC/Confirmation | A10、B6 |

## Source Evidence

- `balance-component.model.ts:562-588`
- `balance-component.model.spec.ts:781-809`

## Related Knowledge

- Angular Domain Model (balance-component.model.ts)
- [[Business-Rule-Index]]
