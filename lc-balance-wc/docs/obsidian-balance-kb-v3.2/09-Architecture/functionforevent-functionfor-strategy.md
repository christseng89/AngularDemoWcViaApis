---
knowledge_id: functionforevent-functionfor-strategy
title: "functionForEvent() / functionFor()（策略模式）"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# functionForEvent() / functionFor()（策略模式）

模块级函数，用于判定某个具体的 InquiredEvent 是由哪个具名业务功能（A1-A9/B1-B5）产生的。对于处于“finalize（终结）”阶段的行，它会调用 payExistingUtilizeFunctionFor(contract.instrumentType)（解析为 A4/B4 的终结身份），而不是使用通用查找逻辑（否则永远会解析为 A3，即该笔动账的原始创建者）。其余所有阶段一律使用 resolveFunctionForMovement(instrumentType, movementType)，这是一个注册表/策略表查找。InquireEventsService.functionFor() 与 LookUpPanelService.functionFor() 完全共用同一函数，两者均委托给这一实现，确保两个画面上的 Function 徽章永远不会出现不一致。

## Source Evidence

- `inquire-events.service.ts:465-468 functionFor()`
- `inquire-events.service.ts:56-63 functionForEvent()`
- `look-up-panel.service.ts:111-114 functionFor()`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
