# 自然到期批次觸發 A10／B6：工程修改需求

> **✅ 業務／BA 已回覆並核定（2026-08-24）**：本文件是對
> `Natural-Expiry-Batch-Trigger-Operational-Decision-Request.md` 三題（寬限期怎麼算、容錯與帳號身份政策、
> GAP-09 現況）的工程實作回覆，業務／BA 審閱後核定「其餘沒問題，可以交給工程師動手了」，但把第 4 節
> 「Maker 與 Checker 必須使用不同帳號」的範圍**放大為全系統要求，不是只限自然到期批次**——上一版決策文件
> 曾建議這件事可以先限縮在批次觸發的範圍內單獨決定，這個限縮建議業務明確撤回，以本文件的核定為準。
> 完整的業務回覆原文、範圍變大後衍生的兩項工程提醒、以及測試腳本提醒，見文末「業務／BA 回覆記錄」一節。

## 1. 外部批次配置自然到期寬限期

自然到期寬限期由外部批次系統透過配置檔管理，支援 A10 與 B6 分別設定。

```json
{
  "naturalExpiry": {
    "importLC": {
      "enabled": true,
      "gracePeriodDays": 5,
      "dayType": "BUSINESS_DAY",
      "calendar": "TW"
    },
    "exportConfirmedLC": {
      "enabled": true,
      "gracePeriodDays": 3,
      "dayType": "BUSINESS_DAY",
      "calendar": "TW"
    },
    "makerAccount": "BATCH_MAKER",
    "checkerAccount": "BATCH_CHECKER",
    "technicalRetry": {
      "maxAttempts": 3,
      "retryIntervalsSeconds": [1, 3, 10]
    }
  }
}
```

說明：

* `gracePeriodDays`：自然到期後的寬限天數。
* `dayType`：支援 `CALENDAR_DAY` 或 `BUSINESS_DAY`。
* `calendar`：當使用 `BUSINESS_DAY` 時，指定適用的銀行營業日曆。
* A10 與 B6 可分別設定不同寬限期。
* 範例中的 `5` 天與 `3` 天僅為示意，實際數值依銀行配置。
* Balance Component 不增加寬限期欄位，也不自行計算寬限期。

## 2. 外部批次計算自然到期結案日期

外部批次依配置計算：

```text
Earliest Close Assessment Date
= LC Expiry Date + Grace Period
```

例如：

```text
LC Expiry Date：2026-08-24

Grace Period：5 個銀行營業日

計算：

2026-08-25 → 第 1 個營業日
2026-08-26 → 第 2 個營業日
2026-08-27 → 第 3 個營業日
2026-08-28 → 第 4 個營業日
2026-08-31 → 第 5 個營業日

最早可評估結案日期：2026-08-31
```

寬限期到期僅表示可以開始評估結案，不代表一定可以直接結案。

批次仍須確認：

```text
沒有在途或尚未登錄的有效提示

且

SG Balance = 0

且

Acceptance Balance = 0

且

沒有未結 Event
```

## 3. 正確處理 `expiredBefore` 查詢條件

現有查詢條件：

```ts
contract.expiryDate < expiredBefore
```

屬於 exclusive comparison。

例如：

```text
LC Expiry Date：2026-08-24
```

```text
expiredBefore = 2026-08-24

結果：不包含該筆 LC
```

```text
expiredBefore = 2026-08-25

結果：包含該筆 LC
```

因此，外部批次須正確計算 `expiredBefore`，避免漏掉符合結案條件的 Expiry Date。

若批次已依配置回推出：

```text
最晚符合條件的 Expiry Date = 2026-08-24
```

則應呼叫：

```http
GET /balance-contracts/close-eligible?expiredBefore=2026-08-25
```

不需要修改既有 API，但工程實作須注意 `<` 與 `<=` 的差異。

## 4. Maker 與 Checker 必須使用不同帳號

自然到期批次的 A10／B6 操作仍適用 Maker／Checker 分離原則。

```text
Maker Account：

BATCH_MAKER
```

```text
Checker Account：

BATCH_CHECKER
```

處理流程：

```text
BATCH_MAKER
    ↓
POST /balance-movements
    ↓
建立 A10／B6 Pending Movement
    ↓
BATCH_CHECKER
    ↓
POST /balance-movements/{movementId}/release
    ↓
完成 A10／B6 Close
```

系統須驗證：

```ts
if (createdBy === releasedBy) {
  throw new Error(
    'Maker and Checker must be different users'
  );
}
```

要求：

* Maker 與 Checker 不得使用相同帳號。
* 兩個帳號須具備各自獨立的操作權限。
* 不得共用帳號或憑證。
* `createdBy` 與 `releasedBy` 均須保留於交易紀錄。
* 不得只依靠前端或批次配置，後端 Release 時也必須驗證。

## 5. 區分技術重試與業務拒絕

### 5.1 技術性瞬時錯誤

以下錯誤可進行有限次數重試：

```text
ECONNRESET

ECONNREFUSED

Timeout

HTTP 502

HTTP 503

HTTP 504
```

配置範例：

```json
{
  "technicalRetry": {
    "maxAttempts": 3,
    "retryIntervalsSeconds": [1, 3, 10]
  }
}
```

注意：若 `maxAttempts` 定義為「總嘗試次數」，則表示：

```text
第一次呼叫

失敗

第二次呼叫

失敗

第三次呼叫

仍失敗

轉入告警／人工處理
```

工程文件應明確說明 `maxAttempts` 是總嘗試次數或額外重試次數，避免產生解讀差異。

另外，`POST /balance-movements` 發生 timeout 時，不應直接假設原請求沒有成功。重試前應先查證 Movement 是否已建立，或使用適當的 idempotency 機制，避免重複建立 Pending Movement。

### 5.2 `409` 業務拒絕

例如：

```text
SG Balance 尚未歸零

Acceptance Balance 尚未歸零

仍有未結 Event

合約在 Submit／Release 之間發生狀態變化
```

處理方式：

```text
收到 409
    ↓
記錄拒絕原因
    ↓
本輪不立即重試
    ↓
下一批次重新查詢及重新評估
```

若 Release 階段因合約狀態變化遭拒：

```text
取消原 Pending Close

重新取得最新合約狀態

重新判斷是否符合 Close Eligibility

符合後重新 Submit
```

`409` 不適用技術性短暫重試政策。

## 6. 保留自然到期批次稽核標記

建立 Movement 時，沿用現有欄位：

```json
{
  "triggeredByExpiry": true,
  "createdBy": "BATCH_MAKER"
}
```

核准時：

```json
{
  "releasedBy": "BATCH_CHECKER"
}
```

用途：

```text
辨識自然到期批次觸發

區分人工結案與批次結案

保留 Maker／Checker 操作紀錄

支援 Inquire Events 及稽核查詢
```

不需要新增：

```text
movementType

新的自然到期 Event

新的 ExpiryReleasePolicy schema
```

## 7. 修正不正確的程式註解

目前程式註解提及：

```text
ReleaseMovementRequest
```

但現行程式並無對應型別，容易誤導工程人員。

建議修改註解為：

```text
triggeredByExpiry is assigned when the movement is created.
The expiry-triggered audit flag is retained when the movement
is subsequently released.
```

此項為工程文件清理，不涉及業務決策。

## 工程修改範圍

| 項目                          | 外部批次系統 | Balance Component |
| --------------------------- | ------ | ----------------- |
| 寬限期配置                       | 修改     | 不修改               |
| 營業日／日曆日計算                   | 修改     | 不修改               |
| `expiredBefore` 截止日期計算      | 修改     | 不修改               |
| 技術錯誤重試                      | 修改     | 不修改               |
| `409` 業務拒絕處理                | 修改     | 不修改               |
| 使用不同 Maker／Checker 帳號       | 修改     | 配合驗證              |
| Release 時檢查 Maker ≠ Checker | 不適用    | 修改                |
| 使用 `triggeredByExpiry`      | 修改呼叫內容 | 沿用現有欄位            |
| 修正不正確程式註解                   | 不適用    | 修改                |

**結論：主要修改由外部批次系統負責；Balance Component 僅需補上 Maker／Checker 不得為同一帳號的後端驗證，並修正現有程式註解。**

> **2026-08-24 補充**：上表「Release 時檢查 Maker ≠ Checker」原本只涵蓋 `release()`；業務已核定
> `reject()` 比照辦理（見下方「業務／BA 回覆記錄」第 2 點），等於新增一列：
>
> | 項目 | 外部批次系統 | Balance Component |
> |---|---|---|
> | Reject 時檢查 Maker ≠ Checker | 不適用 | 修改 |
>
> 結論同步更新為：Balance Component 需要補上的後端驗證是 `release()` **與** `reject()` 兩條路徑，
> 不是只有 `release()` 一條。

---

## 業務／BA 回覆記錄（2026-08-24）

**業務回覆**：了解，記下來——**Maker ≠ Checker 是全系統要求，業務已核定**，不是只限自然到期批次；先前決策
文件裡「這件事可以先限縮在批次範圍內單獨處理」的建議不成立，撤回。

範圍變大之後，業務同時提醒工程師一併處理以下兩件事，避免只改了 `release()` 卻留下不一致：

1. **`domain/statusTransition.ts` 自己的 doc comment 現在跟業務決策矛盾了**——那句「Maker 和 Checker
   是否同一人，這個狀態機不強制，是銀行自己的政策」是舊的設計說明，業務核定後這句話已經不成立——系統
   現在**要**強制。這句註解需要跟著改，不然以後有人看程式碼還是會以為這是不強制的。
2. ~~**`reject()` 要不要一併適用**~~——**已回覆並核定（2026-08-24）：適用。** 業務回覆：「`reject()`
   是 Checker 的事，所以套用 Maker≠Checker」——`release()`（核准）跟 `reject()`（退回）都是 Checker 對
   Maker 建立的交易做的動作，屬於同一個 Checker 角色，Maker≠Checker 這條全系統規則同樣適用，不是只管
   `release()`。工程實作時 `reject()` 須比照 `release()` 補上同一條後端驗證
   （`if (createdBy === rejectedBy) throw ...`，欄位名稱依 `reject()` 實際簽章調整）。

另外因為範圍變成全系統，業務建議改完之後順手跑一次既有的 `import_lc_test.sh`／`export_lc_test.sh`，看
有沒有既有測試流程本來就用同一個帳號當 Maker 又當 Checker——如果有，這次改動會讓那些測試直接跑不過，
需要一併更新測試資料，不是只改一支程式就結束。這個提醒現在同時涵蓋 `release()` 跟 `reject()` 兩條路徑，
測試盤點時兩個都要查。

**BA 回覆**：其餘沒問題，可以交給工程師動手了；如果沒問題，請一併修正相關文檔。

---

*對應決策請求：`lc-balance/Natural-Expiry-Batch-Trigger-Operational-Decision-Request.md`（問題 A／B1／B2）。*
