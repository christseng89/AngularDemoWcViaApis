---
knowledge_id: inquireeventsservice-facade
title: "InquireEventsService（外观模式）"
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

# InquireEventsService（外观模式）

可注入服务，未设置 providedIn（状态按实例区分，通过组件级作用域的 provider 提供）。负责 LC Master Records Index 的浏览（loadIndex/searchIndex/分页）、单一 LC 的合并 Events 时间线（search/loadEvents，通过 PagedListState 在客户端做窗口化）、以及逐一 Event 的钻取（selectEvent，透过 buildFields()+toReadOnlyFields() 重建原始只读画面并填充 Balance Tabs）。范围界定：root 永远是 IPLC_LC 或 EPLC_CONFIRMATION；子项来自 childInstrumentTypesOf()。不引入任何新的 HTTP 端点——完全复用 Transaction Processing 已有的全部调用。

## Source Evidence

- `inquire-events.service.ts:187-214 class doc comment + @Injectable()`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]

## 2026-08-26 更新——selectEvent() 的只读画面重建，从手写对象升级为编译期强制的完整映射表

背景缺陷（reviewer-reported 2026-08-26）：`selectEvent()` 原先通过一段手写的对象字面量重建 Original Transaction Screen 的只读画面，其中遗漏了 A1/B1 保存的 `expiryDate`——这是唯一一个只读画面上仍显示空占位符、而非 Issue 时实际保存值的字段。最初的修复只是给这段手写对象补上 `expiryDate: contract.expiryDate ?? undefined` 一行。

但复核者随即指出这是系统性风险，不是一次性遗漏：手写对象字面量本身无法防止"以后再新增一个 `BuilderModel` 字段却忘记在这里补映射"的同类问题再次发生。于是引入了 `reconstructOriginalModel(movement, contract)`（定义于 `builder-fields.ts:271`）：一张类型为 `{ [K in keyof Required<BuilderModel>]: ... }` 的穷尽式映射表，为 `BuilderModel` 的每一个字段都显式声明它到底是从 movement 的哪个属性、还是 contract 的哪个属性还原回来的。这张表的类型签名意味着——**以后往 `BuilderModel` 新增一个字段而忘记在这里补映射，会直接是一个 TypeScript 编译错误，而不再是一个只有跑到那个画面才会发现的静默运行时缺口**。`selectEvent()` 现在只是调用这个函数（`inquire-events.service.ts:497`），不再自己手写重建逻辑。

这是一个值得记录的架构模式，而不只是一次 Bug 修复：把"某个手写列表必须和另一处的类型定义保持同步"这种此前只能靠人工 review 或运气发现的隐性契约，转换成了编译器可以强制检查的显性契约。同一 codebase 里可比较的一个先例是 `movementTypeRegistry`（Strategy/Type-Object 模式，见 [[movementtyperegistry-strategy-type-object-registry-for-movementtype-cl]]）——两者思路一致（用一张穷尽的表取代分散/手写的逻辑），但消除的风险不同：前者消除的是分支重复，这里消除的是"新增字段忘记同步"这一类遗漏。

验证方式：端到端走查了 A1-A11/B1-B7 每一个功能自己的 Original Transaction Screen（Maker Submit -> Checker Release -> Inquire Events），不只是单元测试；`inquire-events.service.spec.ts` 新增了 `expiryDate` 的回归用例（保存过的日期能正确显示；未保存的日期保持 `undefined`，不是 `null`）。

### 证据来源（本次更新）
- `src/app/transaction-builder/builder-fields.ts:271`（`reconstructOriginalModel()` 定义）
- `src/app/transaction-builder/inquire-events.service.ts:493-497`（`selectEvent()` 调用该函数）
