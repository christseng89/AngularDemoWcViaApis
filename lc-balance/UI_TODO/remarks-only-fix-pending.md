# Remarks-only Fix Pending

> 狀態：已實作。A4、A6、A7、A9、B4、B5 已接入 production code，並有前端、API 與 service regression tests。

## 背景

部分交易的 Amount、Currency、Reference、Movement Type 等業務欄位全部鎖定，因此目前沒有可安全修改的欄位，`fixPendingEnabled` 為 `false`。

建議加入 optional `Remarks`，讓 Maker 可以在不改變金額、餘額、會計分錄或交易識別資料的情況下，補充或修正 Pending／Rejected transaction 的說明。

## 適用範圍

已啟用 Remarks-only Fix Pending 的 Function：

- Import：A4、A6、A7、A9
- Export：B4、B5

A4、A6、A7、A9、B4、B5 均已採用 Remarks-only。A4 修改其所完成的 A3/A3S movement；其他 settlement／compound rows 只更新代表 movement 的 Remark，不重新計算或重建 linked movement。

## UI 行為

- 在原 Transaction Screen 加入 required `Remarks` textarea（Remarks-only Save 必須提供非空白且有變更的內容）。
- 欄位僅在該 Function 的 Fix Pending policy 允許時開放編輯。
- 正常 Submit 是否顯示 Remarks，由 Function configuration 決定。
- `Save Fix Pending` 至少需要 Remarks 有實際變更；空白且沒有其他變更時按鈕保持 disabled。
- Trim 前後空白；空字串不允許送出。
- 進入 Fix Pending、送出 Save 及收到成功回覆時清除舊的 Maker submit error，避免成功交易仍顯示先前的 `BAL-UI-UNEXPECTED`。
- 顯示最大長度、剩餘字數及 validation message。
- Cancel 必須還原原始 Remarks，不送出 API request。

## 建議配置

```ts
fixPending: {
  enabled: true,
  editableFields: ['remarks'],
  mode: 'REMARKS_ONLY',
}
```

不得只用 `fixPendingEnabled: true` 解鎖整個表單。

## API／Backend 前置條件

實作已同步完成：

- Angular 與 backend `EditMovementRequest` 加入 `remarks?: string | null`。
- `editMovementRequestSchema` allowlist 加入 `remarks` 及長度限制。
- `FixPendingEditableField` 與 Fix Pending patch builder 加入 `remarks`。
- movement update 與 `fix_pending_audit` 保留修改前後值。
- Remarks-only path 不得觸發 balance、accounting、contract field 或 sibling movement 重算。

## Acceptance Criteria

1. 適用 Function 的 Pending／Rejected row 顯示 `Fix Pending`。
2. Fix Pending 畫面只有 Remarks 可編輯，其他欄位均為 protected。
3. 修改 Remarks 後儲存，movement identity、amount、currency、status、event sequence 與 linked records 均不變。
4. Checker 可以看到更新後的 Remarks。
5. 每次修改都寫入 Fix Pending audit。
6. 未修改任何內容時不能送出。
7. 非 allowlist 欄位仍由 backend strict schema 拒絕。
8. A4／A6／B4／B5 的 downstream eligibility 與 balance/accounting 結果不受影響。

## Regression Tests

- 每個啟用 Function 的 UI field-lock test。
- Remarks changed／unchanged／cleared／over-limit cases。
- Pending 與 Rejected status cases。
- Cancel restores original value。
- Strict request schema rejects locked fields。
- Remarks-only edit does not alter balance、account entries、compound sibling movements。
- Maker Queue 與 in-session Fix Pending 兩個入口行為一致。
