---
knowledge_id: inquire-events-lc-selection-to-per-event-drill-down-facade-strategy-de
title: "Inquire Events——从选取 LC 到逐一钻取 Event（Facade/Strategy/Decorator/Adapter 流程）"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# Inquire Events——从选取 LC 到逐一钻取 Event（Facade/Strategy/Decorator/Adapter 流程）

从选取一个 side/LC，一路到查看某一历史 Event 的原始画面与 Balance Tabs，展示拆行规则与策略查找规则各自在哪个环节生效。

```mermaid
flowchart TD
  A[User selects side IMPORT/EXPORT] --> B[loadIndex: paginated LC Master Records Index]
  B --> C[User picks an LC row via selectLcFromIndex]
  C --> D[loadEvents: root movementsOf$ + each child childMovementsOf$]
  D --> E[toEventRows per movement]
  E -->|Sight UTILIZE, released| F[2 rows: create + finalize]
  E -->|everything else| G[1 row: primary]
  F --> H[Merge all rows, sort by eventTime]
  G --> H
  H --> I[events array, windowed by PagedListState]
  I --> J[User clicks a row: selectEvent]
  J --> K[functionFor: Strategy lookup]
  K -->|phase=finalize| L[payExistingUtilizeFunctionFor -> A4/B4]
  K -->|phase=primary/create| M[resolveFunctionForMovement -> A3 or registry match]
  L --> N[buildFields via BuilderFieldsContext]
  M --> N
  N --> O[toReadOnlyFields Decorator wraps fields]
  O --> P[Render original screen, read-only]
  J --> Q[Build up to 3 Balance Tabs LC/Acceptance/SG]
  Q --> R{ownSnapshot null?}
  R -->|yes, legacy data| S[GET balance-as-of, race-guarded]
  R -->|no| T[Use persisted eventSnapshot/finalizeEventSnapshot + sibling snapshots]
  S --> U[Render BalanceSnapshotBoxComponent per tab]
  T --> U
  P --> V[User clicks Account Entries]
  V --> W[openAccountEntries emitted to parent]
  W --> X[AccountEntriesDialogComponent shows Dr/Cr voucher or 'no entries' hint]
```

## Source Evidence

- `inquire-events.service.ts`
- `inquire-events.component.ts`
- `account-entries-dialog.component.ts`

## Related Knowledge

- Inquire Events + Look Up Current Balance (read-model)
- [[Business-Rule-Index]]
