---
knowledge_id: InquireDeletePendingComponent
title: "InquireDeletePendingComponent（Delete Pending 查询视图）"
domain: Balance
category: Architecture
status: CONFIRMED
source_repository: Balance Component (lc-balance)
snapshot_date: 2026-08-31
tags:
  - balance
  - angular
  - architecture
  - delete-pending
---

# InquireDeletePendingComponent（Delete Pending 查询视图）

`InquireDeletePendingComponent` 是 standalone 纯视图组件。查询、分页、LC 选择、Audit 明细及只读原交易画面的状态与编排均由父层建立的 `InquireDeletePendingService` 负责，并通过 `@Input()` 注入。

组件只声明模板实际使用的 Angular、Formly 与共享 UI dependencies。模板没有图标节点，因此不依赖 `TbIconComponent`；此边界可避免 Angular `NG8113` 未使用 standalone import 警告，并保持 production build 干净。

本次变更不影响 HTTP endpoint、request/response schema 或错误契约，因此两份 OpenAPI 文件无需修改。

## Source Evidence

- `src/app/transaction-builder/inquire-delete-pending.component.ts`
- `src/app/transaction-builder/inquire-delete-pending.component.html`
- `src/app/transaction-builder/inquire-delete-pending.component.spec.ts`

## Verification

- Focused Jest suite: 4 tests passed
- TypeScript application type-check: passed
- Angular production build: passed; `NG8113` no longer emitted

## Related Knowledge

- [[transactionbuildercomponent-orchestration-shell]]
- [[inquireeventscomponent-view-layer-extraction]]
- [[Source-to-Knowledge-Map]]

