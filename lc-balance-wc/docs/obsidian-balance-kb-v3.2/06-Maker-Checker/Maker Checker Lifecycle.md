---
title: "Maker Checker Lifecycle"
type: concept
domain: maker-checker
status: verified
source_of_truth: source-code
source_revision: "bad2f0c"
verified_date: 2026-09-03
generated: true
aliases: []
tags: ["maker-checker"]
source_files:
  - "microservices/balance-component/src/domain/statusTransition.ts"
  - "microservices/balance-component/src/service/movementReleasePolicyService.ts"
  - "microservices/balance-component/src/store/balanceMovementStore.ts"
  - "microservices/balance-component/src/validation/requestSchema.ts"
  - "src/app/transaction-builder/checker-actions.service.ts"
  - "src/app/transaction-builder/function-strategy.ts"
  - "src/app/transaction-builder/builder-fields.ts"
  - "src/app/transaction-builder/maker-panel.component.ts"
---

# Maker Checker Lifecycle

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

Maker 建立或修正 pending movement；Checker Release／Reject 前重新讀取並驗證。Maker 與 Checker identity 不得相同。Fix Pending 只修改允許修正的欄位，reference、currency 與受保護金額依 function policy 鎖定。Delete Pending 只處理尚未完成的 movement，並留下 audit。

## Fix Pending modes

Function strategy 將 Fix Pending 分為 `STANDARD` 與 `REMARKS_ONLY`。目前所有 A1–A11／B1–B7 catalog functions 都支援 Fix Pending，但可修改內容不同。

| Fix Pending mode | Functions | Maker 可修改內容 | Remarks 規則 |
|---|---|---|---|
| `REMARKS_ONLY` | `A4`、`A6`、`A7`、`A9`、`B4`、`B5` | 只能修改 Remarks；Amount、monetary、accounting、identity 與 linked-movement fields 保持不變 | 必填、trim 後不得為空、最多 500 字，而且必須和原 Remarks 不同 |
| `STANDARD` | `A1`、`A2`、`A3`、`A3S`、`A8`、`A10`、`A11`、`B1`、`B2`、`B3`、`B6`、`B7` | 依 function policy 開放 Amount、日期、Tolerance、Tenor 或 Reason Code；reference、currency 及 protected fields 鎖定 | Fix Pending 不要求輸入 Remarks；只傳送實際允許修改的 fields |

`A10`、`A11`、`B6`、`B7` 的 `Reason Code` 是 Close／Reopen 的 function-required business field，不等於 `REMARKS_ONLY` correction note；這四個 Functions 仍屬 `STANDARD`。

UI 對 `REMARKS_ONLY` 只顯示可編輯 Remarks，Save readiness 要求非空白且與原值不同。API 對任何帶有 `editMode=REMARKS_ONLY` 的 Fix Pending request 都再次驗證 Remarks 非空白；這是服務端防繞過控制，不只依賴 UI function mapping。

## Checker Reject and Maker Queue

所有由人工 Maker Submit、其後被 Checker Reject 的 catalog transaction 都必須回到原 `createdBy` Maker 的 Maker Queue，並以 `REJECTED` 顯示：

- Import：`A1`、`A2`、`A3`、`A3S`、`A4`、`A6`、`A7`、`A8`、`A9`、`A10`、`A11`
- Export：`B1`、`B2`、`B3`、`B4`、`B5`、`B6`、`B7`

Maker Queue 同時查詢 `PENDING` 與 `REJECTED`。Maker 可選擇 Fix Pending 或 Delete Pending；Fix Pending Save 是重新送審邊界，無論 `STANDARD` 或 `REMARKS_ONLY`，成功保存後 movement 都回到 `PENDING`，等待另一位 Checker 重新決定。`fix_pending_audit.status_before` 保留原來的 `REJECTED`，after snapshot 記錄修正後的 `PENDING`。

Compound Event（例如 A3S、B4）在 Maker Queue 合併為一行，操作仍按完整 Business Event 處理。Batch Auto Expire／Auto Close 使用 batch actors，不屬人工 Maker Queue 流程。

### Function-level result

```text
A4 / A6 / A7 / A9 / B4 / B5
  → Fix Pending = REMARKS_ONLY
  → Remarks required

All other registered A/B functions
  → Fix Pending = STANDARD
  → Remarks not required
```

Account Entries review 顯示 movement 已持久化的 voucher，不在 UI 重新計算。
