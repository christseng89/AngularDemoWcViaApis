---
knowledge_id: ood-design-patterns-used-in-inquire-events-look-up-read-model
title: "Inquire Events / Look Up 读模型中使用的 OOD 设计模式"
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

# Inquire Events / Look Up 读模型中使用的 OOD 设计模式

读模型层刻意应用了四种经典设计模式：Facade（外观模式，InquireEventsService/LookUpPanelService 将多次调用的编排逻辑隐藏在一个简洁的接口之后）、Decorator（装饰器模式，toReadOnlyFields() 包裹实时的 buildFields() 输出，强制使其在历史数据展示时变为只读）、Strategy（策略模式，resolveFunctionForMovement()/functionForEvent() 是一个注册表式的查找表，而不是一串条件链，使新功能可以直接注册而无需改动这段代码）、以及 Adapter（适配器模式，InquiredEvent 将一笔裸的 BalanceMovement 适配为携带合约上下文与事件语义字段，而原始动账本身并不具备这些信息）。这一点在项目自身的 CLAUDE.md 决策日志中有明确记载，也与实际读取到的代码结构相符。

## Source Evidence

- `CLAUDE.md 'Inquire Events added — Angular-only, OOD Design Patterns'`
- `inquire-events.service.ts:21-41,56-118,187-214`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
