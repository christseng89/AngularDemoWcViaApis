# Balance Component — Delete Pending 測試計畫（2026-08-27，v4）

> **文件性質**：本文件是針對 Delete Pending（A1–A11／B1–B7）的正式測試計畫。v1 經 BA 覆核給予 9/10，
> v2 依 BA 裁示修正 §0.1／§0.2／§2（A4/A6 前置狀態描述）／§3（Case 5 定案）／§6（Balance
> 預期值），BA 給予 9.5/10 並確認 §6.1 技術修正採用既有程式碼定義。v3 完成 §6.2 A2 AMEND_INCREASE／
> AMEND_DECREASE 精確拆分與 §1.1 Internal signed value／UI display value 分離原則，BA 給予 9.8/10。
>
> **品質標準：Review Score 必須達到 9.95/10 或以上才能正式進入 Test Execution。** 本版（v4）依 BA
> 「Final Review Instructions」新增 7 項強化：§6.3 A3S Atomic Failure Test（含正式 Defect 登記規則，
> 不得為了配合現有實作而修改 test expectation）、§2.1 每個 Function 的 Test Result Evidence 記錄
> 欄位、§5 Delete Pending Audit 的 deterministic ordering 驗證、新增 §5.1 Inquire Events Unique
> Event 驗證（依 Event ID/Event Seq identity，非 `SELECT DISTINCT *`）、新增 §6.5 Negative /
> Authorization Tests、§6.2 明確化 Before 值（非固定回 0）適用於全部案例、§6.4 強化為「保留＋排除」
> 雙重證明、新增 §0.3 正式 Test Governance Rule。v2/v3 已定案的設計（A2 精確公式、Internal/UI
> signed-value 分離、A3/A3S 六狀態矩陣）**保持不變，不重新修改**。
>
> **狀態：`BA APPROVED — PROCEED WITH FULL TEST EXECUTION`**（Final Review Score: 9.97/10，
> 達到 ≥9.95/10 品質門檻，正式核准進入執行階段）。尚未開始執行任何測試案例。

---

> **BA FINAL REVIEW — APPROVED (Score: 9.97/10)**
>
> This Delete Pending Test Plan has passed the required **9.95/10 quality threshold** and is
> approved for full test execution.
>
> Proceed with the test execution strictly according to the approved plan, covering **A1–A11 and
> B1–B7**, including the A3/A3S special-state matrix, lifecycle dependencies, Delete Pending
> audit, balance rollback, account-entry retention/exclusion, A3S atomic consistency and failure
> scenarios, negative/authorization tests, Inquire Events uniqueness, full regression, and
> SonarQube quality validation.
>
> **Do not change an approved Expected Result simply because the current implementation behaves
> differently. Any deviation must be recorded as a defect with the reproduction steps, expected
> result, actual result, and impact assessment.**
>
> All **18 applicable Functions must have complete Test Result Evidence**. Test execution is not
> considered complete until all required tests and regressions pass, all identified defects are
> resolved or formally dispositioned, and the final SonarQube/quality check is completed.

---

## 0. 範圍與 P0 裁示結果

### 0.1 範圍——BA 已確認

本次只做 **Delete Pending**，不含 Fix Pending 欄位編輯／原記錄重送。正式流程：

```text
Submit
→ PENDING
→ Reject
→ Delete Pending
→ 原記錄 CANCELLED
→ 同一 Function / 同一 Natural Key 重新建立新交易
→ PENDING
→ Approve / Release
```

### 0.2 P0——BA 裁示採用選項 A（附前提）

**正式規則（BA 用字）**：

> A4/A6 Reject resolves the outstanding settlement/acceptance decision and re-enables Delete
> Pending. Delete Pending cancels the current business attempt but must not erase the historical
> A3/A3S Checker acknowledgement or its audit trail.

具體要求：
- `acknowledgedAt` 永久保留，Delete Pending **不得**清除或改寫它。
- Audit 必須能完整追溯三個時間點：**Checker acknowledged → A4/A6 rejected → Maker deleted
  pending**（`delete_pending_audit` 本身不記錄 acknowledgedAt/reject 歷史，因此這條需要在測試中
  額外驗證：Cancel 後直接讀該筆 `balance_movements` 記錄，`acknowledgedAt` 欄位仍是原值，
  `status` 是 CANCELLED，而不是被覆寫或清空）。

§3 Case 5 依此裁示定案為 ✅ Success（見下方 §3 修正版）。

### 0.3 Test Governance Rule（正式規則，適用於本文件全部測試項目）

> **The specification defines the expected business behavior. If the actual implementation
> differs from the approved test expectation, record the deviation as a defect. Do not modify
> the test expectation merely to make the existing implementation pass.**

具體適用方式：任何一項測試（尤其是 §6.3 的 A3S Atomic Failure Test）若發現實作與本文件已定案的
Expected Result 不一致，正確做法是**登記為 Defect（含重現步驟、預期 vs 實際、影響範圍）並回報**，
**不是**把本文件的 Expected Result 改成配合現有行為——除非該不一致經 BA 重新裁示為「原預期本身
有誤」，才能回頭修改本文件，而且要留下裁示紀錄（同本文件既有的 v1→v2→v3 修正慣例）。

---

## 1. 測試分層策略（兩層，不混用）

| 層級 | 範圍 | 要求 | 執行方式 |
|---|---|---|---|
| **Unit Test** | `BalanceService.cancel()` 共用邏輯 | 可依 code path 挑代表性案例，不必 18 個全跑 | Jest（microservice + Angular） |
| **Business E2E（瀏覽器）** | A1–A11、B1–B7 | **每個適用 Function 至少跑一次完整生命週期**，不得因為共用程式碼而省略 | 真實三套服務 + 瀏覽器操作 |
| **Special State Matrix** | A3、A3S → A4／A6 | 六種特殊狀態全部測（§3） | curl + 瀏覽器 |
| **Lifecycle Dependency** | A3→A4、A3S→A4（Sight）／A3→A6、A3S→A6（Usance）／B3→B4→B5 | 4+1 條完整 Business Path | 瀏覽器 E2E |
| **Audit** | Delete Pending Audit | Inquire Events／Inquire Delete Pending 交叉驗證 | 瀏覽器 + curl |
| **Balance Rollback** | 代表性 Delete 案例 | Before→Submit→Delete→Balance 真的恢復，數值依 §6 的精確公式驗證 | curl（直接讀 balance snapshot） |
| **Regression** | 全套 | Angular + Backend + Microservice 三套件全綠 | `npm test` ×3 |

### 1.1 Pending Earmark Total——Internal signed value 對 UI display value，測試必須分開斷言（BA v2→v3 要求）

查證前端程式碼，`pendingEarmarkTotal` 這個欄位在這個 sub-project 裡實際上有**兩種顯示方式**，
測試不可以把兩者混為一談：

| 顯示位置 | 程式碼 | 顯示內容 | 範例（PENDING 扣減型，內部值 `-10000`） |
|---|---|---|---|
| **Internal / API**（`GET .../balance` 回應本身） | `balanceService.ts` 的 `assembleSnapshot()` | 帶正負號的 signed 字串，等於 `available − confirmed` | `"-10000"` |
| **UI — Balance Snapshot Box**（Look Up／Inquire Events 共用的 `BalanceSnapshotBoxComponent`） | `balance-snapshot-box.component.html:23`：`{{ snapshot.pendingEarmarkTotal }}` | **原樣輸出 API 的 signed 字串，不做任何格式化或去號** | 畫面顯示 `-10000` |
| **UI — LC Index 列的 Pending 提示**（僅 A4/A6 這類「原地finalize既有 movement」的 Function，`catalogPendingHint()`） | `maker-panel.component.ts:769-776`：`snap.pendingEarmarkTotal.replace('-', '')` 再丟進 `formatAmount()` | **去掉負號、加千分位，業務語意上的「占用金額」正數** | 畫面顯示 `— Pending: 10,000` |

因此本測試計畫的斷言一律拆成兩條，**兩者不可互相取代**：

1. **Internal movement impact = signed amount**——直接讀 `GET .../balance` 或 `GET .../balance-as-of`
   的 JSON 回應，`pendingEarmarkTotal` 欄位斷言為 §6.2 表格中「Pending Earmark」欄的 signed 數值
   （例如扣減型是負數 `-10000`，增加型是正數 `+8000`／`8000`）。
2. **UI Pending Earmark Total = business display amount**——瀏覽器 E2E 對 Balance Snapshot Box 的
   斷言，DOM 文字**應與步驟 1 讀到的 API signed 字串逐字相同**（因為這個元件本來就是原樣輸出，不做
   任何轉換）；而 A4/A6 LC Index 列上的 `— Pending: N` 提示是**另一個獨立元件的獨立斷言**，只驗證
   「去號後的正數金額 + 千分位格式」，不可拿它去反推或覆蓋步驟 1 的 signed 值斷言。

這樣即使未來任一顯示元件的正負號慣例改變，也不會出現「邏輯正確，但測試因 display sign 不同而
失敗」的假陽性/假陰性。

---

## 2. Function E2E 覆蓋矩陣（A1–A11 / B1–B7，每個都要跑）

每個 Function 的完整生命週期（本次範圍＝Delete Pending，不含欄位編輯）：

```text
Submit → PENDING → Checker Reject → 退回 Maker
       → Delete Pending → 原記錄 CANCELLED
       → 用同一個 Function 重新 Submit（同一組 Natural Key / Secondary Reference）
       → PENDING → Checker Release → APPROVED/EARMARKED
       → （若此 Function 是別的 Function 的前置依賴）確認下一個 Function 可以正常 pick up
```

| # | Function | Natural Key / 2ndary Ref | 前置依賴 | 備註 |
|---|---|---|---|---|
| 1 | A1 LC Issue | lcNumber | 無（root） | Delete Pending 會連帶 CANCEL 整個 contract（既有機制），驗證同一 lcNumber 可重新 Issue |
| 2 | A2 LC Amendment | sourceTransactionRef | 需先有 A1 已 Release | 驗證 Reject+Delete 後同一個 ref 可重複使用 |
| 3 | A3 Document Arrival（Sight） | ibNumber | 需先有 A1（Sight）已 Release | 見 §3 特殊狀態矩陣，此處只跑「未核准前」的基本生命週期 |
| 4 | A3S Document Arrival w/ SG（Sight） | ibNumber + 已存在 SG | 需先有 A1（Sight）已 Release ＋ A8 已 Release | 同上，複合腳（UTILIZE + SG Redemption）Delete Pending 要兩腳都清乾淨，見 §6 Atomic Consistency |
| 5 | A4 Sight Settlement | 沿用 A3 的記錄（同一筆 movement，非新建） | 需先有 A3（Sight）**Checker Acknowledge → EARMARKED（movement 仍是 PENDING，尚未 Release）** | 見 §3、§4 Business Path 1 |
| 6 | A6 Acceptance（Usance） | ibNumber（Acceptance 自己是新 contract） | 需先有 A3/A3S（Usance）**Checker Acknowledge → EARMARKED（movement 仍是 PENDING，等待 A6 最終決定）** | 見 §4 Business Path 3——**修正：前置條件不是「A3 已 Release」，A3 本身從不 Release，是 A4/A6 finalize 同一筆 movement** |
| 7 | A7 Acceptance Settlement | 沿用 A6 的 Acceptance | 需先有 A6 已 Release | |
| 8 | A8 Shipping Guarantee Issue | sgNumber | 需先有 A1 已 Release | 見 §6 Balance Rollback 案例 |
| 9 | A9 SG Redemption（standalone） | 無獨立 ref | 需先有 A8 已 Release | |
| 10 | A10 LC Close | 無獨立 ref | 需 SG/Acceptance 餘額歸零 | |
| 11 | A11 LC Reopen | 無獨立 ref | 需先有 A10 已 Release | |
| 12 | B1 Confirm LC Issue | lcNumber | 無（root） | 同 A1 |
| 13 | B2 LC Amendment | sourceTransactionRef | 需先有 B1 已 Release | 同 A2 |
| 14 | B3 Present Docs | ibNumber | 需先有 B1 已 Release | 見 §4 Business Path 5，需額外證明 Release 後不可 Cancel；**B3 不走 A3/A3S 的 acknowledge 兩階段模式，是它自己真正 Release**（既有 2026-08-18 設計，非本次新規則） |
| 15 | B4 Honour/Accept | 沿用 B3 的記錄（`referencedTransactionId`，非共用同一筆 movement——與 A3/A4 的「同一筆」不同） | 需先有 B3 已 Release | 見 §4 Business Path 5 |
| 16 | B5 Acceptance Settlement | 沿用 B4 的 Acceptance | 需先有 B4 已 Release | |
| 17 | B6 Confirm LC Close | 無獨立 ref | 需 Acceptance 餘額歸零 | |
| 18 | B7 Confirm LC Reopen | 無獨立 ref | 需先有 B6 已 Release | |

### 2.1 每個 Function 的 Test Result Evidence（強制記錄，不得只寫「Pass」）

18 個 Function 每一個都必須留下下列欄位的實際記錄，作為可覆核的證據，而不是單純一個
Pass/Fail 結論：

| 欄位 | 說明 |
|---|---|
| Function | A1–A11／B1–B7 代碼 |
| Test Data | 實際使用的 LC/IB/SG Number、金額、Currency 等測試資料（可直接複製重現） |
| Natural Key | 該筆交易的 Natural Key／2ndary Reference 實際值 |
| Submit Result | Maker Submit 的實際回應（movementId、status，或錯誤訊息） |
| Reject Result | Checker Reject 的實際回應 |
| Delete Result | Delete Pending 的實際回應（成功／409，含錯誤代碼） |
| Re-create Result | 用同一 Natural Key／2ndary Reference 重新 Submit 的實際回應 |
| Release Result | Checker Release 的實際回應 |
| Next Function Pickup Result | 若此 Function 是下一個 Function 的前置依賴，記錄下一個 Function 的 picker/Checker Queue 是否正確找到這筆記錄 |
| Pass/Fail | 結論，附上任何偏離 §2 表格「預期結果」的說明 |

這張表本身可以用一個共用的測試紀錄表（Markdown 表格或試算表）逐 Function 填寫，不需要為每個
Function 各寫一份獨立文件。

---

## 3. A3/A3S 特殊狀態矩陣（六種狀態，已依 §0.2 裁示定案）

| # | 情境 | 預期結果 | 額外驗證 |
|---|---|---|---|
| 1 | A3 Submit → 直接 Delete Pending（未核准） | ✅ Success | — |
| 2 | Submit → Checker Reject（未核准過）→ Delete Pending | ✅ Success | — |
| 3 | Submit → Checker Acknowledge（EARMARKED，仍 PENDING）→ Delete Pending | ❌ 409 | — |
| 4 | →（延續③）A4/A6 Maker Submit → Delete Pending | ❌ 409 | — |
| 5 | →（延續④）A4/A6 Checker **Reject** → Delete Pending | ✅ Success | Cancel 後直接讀該筆 movement：`acknowledgedAt` 保留原值不變、**`releasedBy`/`releasedAt` 等於 Reject 當下寫入的原值（Defect #3 修復驗證，見 §9）**、`cancelledBy`/`cancelledAt` 為本次 Cancel 寫入的新值、`status`=CANCELLED；`delete_pending_audit` 新增一筆 `statusBefore`=REJECTED 的記錄 |
| 6 | →（延續④）A4/A6 Checker **Release** → Delete Pending | ❌ 409（既有狀態機，RELEASED 本來就不能 Cancel，非本次新邏輯） | — |

---

## 4. Business Path Dependency（4 條 Sight/Usance 分流 + Export）

| Path | 路徑 | 驗證重點 |
|---|---|---|
| 1 | A3（Sight）→ A4 | A4 只認 Sight，Function/Status 顯示正確 |
| 2 | A3S（Sight，含 SG）→ A4 | 複合腳 Delete Pending 需兩腳（UTILIZE + SG Redemption）都清乾淨，見 §6 Atomic Consistency |
| 3 | A3（Usance）→ A6 | A6 只認 Usance，與 A4 路徑分開驗證 |
| 4 | A3S（Usance，含 SG）→ A6 | 同 2，但走 A6 |
| 5 | B3 → B4 → B5 | B3 Submit→Delete 成功／B3 Submit→Reject→Delete 成功／B3 Submit→Release 後 Delete 不允許／B4 可以正常 pick up 已 Release 的 B3／B5 可正常 settlement——證明 B3 是「正常 Release lifecycle」，不需要 A3/A3S 的 acknowledge 兩階段模式，作為對照組 |

---

## 5. Delete Pending Audit 驗證清單

每次代表性 Delete 測試都要確認：

- [ ] 原本的 PENDING 記錄，Delete Pending 後**不再出現**在 Inquire Events 的合併時間軸
- [ ] 同一筆記錄**出現**在 Inquire Delete Pending 的查詢結果
- [ ] Inquire Delete Pending 的 LC Catalog 找得到該 LC（且只出現一次，DISTINCT）
- [ ] 選取該 LC 後，看得到這筆 Deleted Event，欄位（Function／Reference／Delete Sequence／Deleted
      By／Delete DateTime／Previous Status）正確
- [ ] 同一個 Business Event 被 Delete Pending 多次（例如 Reject→Delete→重新 Submit→再 Delete），
      產生**多筆獨立** Audit Record，不互相覆蓋
- [ ] **Deterministic ordering**：Inquire Delete Pending 查詢結果的排序穩定，依
      `LC Number → Secondary Reference → Delete DateTime → Audit ID/Sequence` 排序，重複查詢
      同一組條件永遠得到相同順序（不是依 DB 實體儲存順序或未定義的排序）
- [ ] **三點稽核軌跡通用檢查（Defect #3 修復，見 §9）**：任何 Function 的 REJECTED → Delete
      Pending 路徑（不限 A4/A6），Cancel 後直接讀該筆 `balance_movements`：`released_by`/
      `released_at` 仍等於 Reject 當下寫入的原值（未被同一次 Cancel 的 `updateStatus()` 呼叫
      覆寫成 `null`），與 `acknowledgedAt`（若曾 Acknowledge 過）、`cancelledBy`/`cancelledAt`
      三點皆可獨立查得

**Delete Sequence 分組鍵**：BA 建議「以 Event ID / Natural Key + Delete Audit Sequence 控制，不要
單純靠 LC Number 遞增」——查證現有實作（`DeletePendingAuditStore.nextDeleteSeq()`）**已經是這樣做**：
分組鍵是 `(instrument_type, lc_number, ib_number, sg_number)` 自然鍵組合，不是單純 LC Number，
不同 secondary reference（不同 ibNumber/sgNumber）會各自獨立編號，不會混在一起。這點**已符合要求，
測試只需驗證既有行為，不需要新開發**——但仍要納入上面 deterministic ordering 這條新驗證。

### 5.1 Inquire Events — Unique Event 驗證（BA v3→v4 新增要求）

`INQUIRE EVENTS` 必須確保每個 DB Business Event **只顯示一次**。測試不可以只驗證畫面上「看起來
沒有重複」或依賴一個 `SELECT DISTINCT *` 式的粗略檢查，必須依真正的 identity 驗證：

- [ ] 針對合併時間軸（`toEventRows()`）回傳的每一列，比對其真正的 identity 鍵（`movementId` +
      `phase`，即 A4 自己的 `'create'`/`'finalize'` 兩列拆分邏輯所用的同一組鍵）——同一個
      `(movementId, phase)` 組合不得出現兩次。
- [ ] 已 Delete Pending（CANCELLED）的記錄，不因為 join 到 `delete_pending_audit`、
      `balance_movements` 的 status history，或任何 Audit 相關查詢而**重新出現**在 Inquire
      Events 的合併時間軸——CANCELLED 記錄只能出現在 Inquire Delete Pending，兩邊互斥。
  （對照 §3、§5 開頭已有的「不再出現在 Inquire Events」斷言，此處是從「唯一性」角度，而非
  「有無出現」角度，做交叉驗證，兩者不可互相取代。）
- [ ] 復現 S05 這類曾經發生過的重複列 bug 場景（REJECTED 的 A4 Sight UTILIZE 不應被
      `toEventRows()` 誤判為已 RELEASED 而拆成兩列）——本次 Delete Pending 測試不應改變這個既有
      修正，但要作為回歸測試的一部分重新驗證一次。

---

## 6. Balance / Account Entries Rollback 驗證清單

### 6.1 技術修正——BA 已確認（✅ 定案，不再需要裁示）

> **BA 最終裁示（逐字）**：「同意採用目前程式碼的既有定義：Maker Submit 後 Confirmed Balance
> 不變，但 Available Balance 可以立即反映 PENDING movement。此次 Delete Pending 測試不修改既有
> Balance Derivation 邏輯。」

以下為原始技術查證過程（保留作為裁示依據，不再是待確認事項）。BA 上一輪建議「Maker Submit 正式
Balance（Available）不變，只有 Pending Earmark 變動」。查證
`domain/balanceDerivation.ts` 的實際定義：

```ts
// Confirmed Balance = Σ RELEASED 動作（ceiling-level）
computeConfirmedBalance = movements.filter(status === 'RELEASED').sum(signedCeilingAmount)

// Available Balance = Confirmed Balance ± Σ PENDING 動作
computeAvailableBalance = confirmedBalance + movements.filter(status === 'PENDING').sum(signedCeilingAmount)
```

也就是說，這個系統裡「不隨 Submit 立即變動」的是 **Confirmed Balance**，但 **Available Balance
的定義本身就包含 Σ PENDING**——UTILIZE（A3）這類扣減型動作一旦 Maker Submit（狀態變 PENDING），
Available Balance 會**立即**反映扣減，不必等 Checker Release。`pendingEarmarkTotal`
（`GET .../balance` 回傳欄位）其實就是 `available − confirmed` 這個差額本身，不是另一個獨立於
Available 之外的數字。

這與這個 sub-project 既有決策日誌一致："Tight Available Balance now derives from Confirmed
Balance, not Available Balance" 這條決策之所以存在，正是因為 **Available 本來就會隨 PENDING
變動**，業務才特別要求 Tight Available 改用「更嚴格」的 Confirmed 為基礎——如果 Available 本身
不隨 PENDING 變動，就不需要另外定義 Tight Available 了。

**因此下表採用「Confirmed 不變、Available 立即變動」的版本**，與 BA 原提案「Available 也不變」不同
——這是可驗證的既有程式碼行為，不是本次要改的業務規則，若 BA 認為系統應該改成「Available 也要等
Release 才變動」，這會是一個範圍更大的既有邏輯變更，請另外裁示，不建議跟 Delete Pending 這次的
範圍混在一起。

### 6.2 各案例 Before / After 精確數值

依 `MOVEMENT_DIRECTION`（`balanceDerivation.ts`）：`AMEND_INCREASE: 1`（增加方向）、
`AMEND_DECREASE: -1`（減少方向）、`UTILIZE: -1`。Tight Available Balance 的「增加從嚴、占用從寬」
規則（既有決策日誌："Tight Available Balance now derives from Confirmed Balance, not Available
Balance"）：**PENDING 的增加型動作不會立即墊高 Tight Available（要等 Release）**；**PENDING 的
減少型動作會立即占用 Tight Available（`computePendingDecreaseTotal()` 立即計入）**。以下每個 Pending
Earmark 欄位皆為 §1.1 定義的 **Internal signed value**（等於 `available − confirmed`），UI 顯示方式
另見 §1.1，不在此表重複斷言。

| 案例 | Before | After Maker Submit（Delete 前） | After Delete Pending |
|---|---|---|---|
| **A2 AMEND_INCREASE**（PENDING，未 Release 前） | Confirmed=X, Available=X, Pending Earmark=0, Tight Available=X | Confirmed=X（不變，AMEND 尚未 Release）；**Available=X+金額**（`computeAvailableBalance` 立即計入 signed PENDING，方向 +1）；**Pending Earmark=+金額**；**Tight Available=X（不變）**——「增加從嚴」，PENDING 的增加型動作不計入 `computePendingDecreaseTotal()`，要等 Release 後 Confirmed 真的墊高才反映 | Confirmed=X, Available=X, Pending Earmark=0, Tight Available=X（全部恢復，與 Before 相同） |
| **A2 AMEND_DECREASE**（PENDING，未 Release 前） | Confirmed=X, Available=X, Pending Earmark=0, Tight Available=X | Confirmed=X（不變，AMEND 尚未 Release）；**Available=X−金額**（方向 −1）；**Pending Earmark=−金額**；**Tight Available=X−金額**——「占用從寬」，`computePendingDecreaseTotal()` 立即把這個 PENDING 減少型動作計入，與 A3 UTILIZE 同一機制 | Confirmed=X, Available=X, Pending Earmark=0, Tight Available=X（全部恢復，與 Before 相同） |
| A3 Document Arrival（UTILIZE，扣減型） | Available=X, Pending Earmark=0, Tight Available=X | Available=X−金額, Pending Earmark=−金額, Tight Available=X−金額（PENDING 扣減型立即占用，見 `computePendingDecreaseTotal`——與 A2 AMEND_DECREASE 同一機制、同一公式） | Available=X, Pending Earmark=0, Tight Available=X（全部恢復） |
| A8 SG Issue（PENDING，未 Release） | 無 SG；LC 自己的 Off-Balance Exposure=0 | SG 自己：Confirmed=0（未 Release）、Available=金額（Available 立即反映 PENDING ISSUE）；**LC 的 Off-Balance Exposure 立即增加**（`computeOffBalanceExposure()` 對 PENDING 的 ISSUE 動作也直接計入，不等 Release，見 offBalanceExposure.ts:62） | SG 記錄 CANCELLED；LC 的 Off-Balance Exposure 恢復 0；SG 自己的 Available 恢復 0 |
| A3S（複合腳，UTILIZE + SG PARTIAL/FULL_REDEEM） | LC Available=X, SG Available=Y | 兩腳都變動：LC Available=X−金額；SG Available 依 REDEEM 方向減少 | 兩腳都要恢復，見下方 Atomic Consistency |

**Delete Pending 驗證重點（本表全部案例：A2 AMEND_INCREASE／AMEND_DECREASE、A3、A8、A3S 皆適用，
v4 明確化）**：Cancel 前先斷言 Available／Pending Earmark／Tight Available（及 A8 的
Off-Balance Exposure）三／四者符合上表「After Maker Submit」欄；Cancel 後這些欄位必須**回到
Before 欄的原始值**，**不是固定回到 0**——因為 X／Y 本身就是 Delete Pending 前既有的 Confirmed
Balance／SG Available，是每次測試執行當下的實際基準值，不是寫死的常數。這一點在 A8（LC 自己的
Off-Balance Exposure 恢復 0 是因為 Before 本來就是 0，並非「規則就是恢復到 0」）與 A3S（LC/SG 各
自恢復到自己的 Before 值，兩者互不相同）都必須分別驗證，不可只驗 A2 就視為全部驗證完成。

### 6.3 A3S Atomic Consistency（BA 要求新增，兩腳必須同進退；v4 新增 Atomic Failure Test）

Delete Pending 一筆 A3S 的複合提交（LC UTILIZE leg + SG REDEMPTION leg，共用同一個
`businessEventId`）之後，必須驗證：

- [ ] 兩腳都是 CANCELLED，**不允許一腳 CANCELLED、一腳仍 PENDING**（這個系統的 Delete Pending
      API 本身是逐筆呼叫，兩腳需要各自呼叫一次 `cancel()`——測試要確認呼叫方確實對兩個
      movementId 都送出了 cancel，而不是只送一個）
- [ ] LC 自己的 Available/Pending Earmark 恢復
- [ ] SG 自己的 Off-Balance Exposure / Available 恢復
- [ ] `delete_pending_audit` 對這個 `businessEventId` 應有兩筆獨立 Audit Record（各自的
      `movement_id` 不同），但可以用 `businessEventId`/時間相近性追溯是同一個 Business Event

#### 6.3.1 Atomic Failure Test（Partial Failure / Atomicity，BA v3→v4 新增要求）

上面的驗證只涵蓋「兩腳都成功 Cancel」的正常路徑。既然 Delete Pending API 對兩腳是**各自獨立**
呼叫 `cancel()`（沒有共用 DB transaction 包住兩次呼叫），必須額外測試**刻意讓其中一腳失敗**的
情境，證明系統不會留下不一致狀態：

- [ ] 模擬第一腳（LC UTILIZE）Cancel 成功、第二腳（SG REDEMPTION）Cancel 失敗（例如：先
      Release 該 SG redemption movement 讓它變成不可 Cancel 的狀態，再觸發 A3S 的 Delete
      Pending；或直接對第二腳的 movementId 傳入一個會被拒絕的請求）——確認**不會**出現
      「LC 腳 CANCELLED、SG 腳仍 PENDING」這種混合狀態被視為「Delete 成功」回應給使用者。
- [ ] 反向情境：模擬第一腳失敗、第二腳從未被呼叫——確認同樣不會出現部分 Cancel 的殘留狀態。
- [ ] 若上述任一情境目前的實作**無法保證 atomic rollback**（例如：呼叫方在第一腳成功、第二腳
      失敗後，沒有把第一腳補償性地復原），**依 §0.3 Test Governance Rule 規則，不得修改本節
      Expected Result 去配合現有實作**——應正式登記為 **Atomicity / Transaction Consistency
      Defect**，記錄重現步驟、目前實際行為、與本節「兩腳必須同進退」的落差，回報後續是否修
      正（例如補一個 API 層級的補償性 rollback，或改成單一 transactional 端點）。

### 6.4 Account Entries——保留＋排除，雙重證明（v4 強化）

Delete Pending 的記錄本身，其 `contingentAccountEntry`/`accountEntries` 應保留在 CANCELLED
記錄上（append-only，供稽核回溯），但**不應**被任何 Balance 加總邏輯讀取（Confirmed/Available
只加總 RELEASED/PENDING，CANCELLED 天生排除，這是既有邏輯）。測試必須**同時**證明以下兩件事，
缺一不可——只驗證其中一項不算完成：

- [ ] **資料仍存在（Retention）**：Delete Pending 後直接 `GET` 該筆 CANCELLED movement，確認
      `contingentAccountEntry`/`accountEntries` 欄位仍然存在、內容與 Delete 前一致，沒有被清空
      或覆寫。
- [ ] **不再影響計算（Calculation Exclusion）**：Delete Pending 後重新讀取該 LC/SG 的
      `GET .../balance`，確認 Confirmed／Available／Pending Earmark／Tight Available／
      Off-Balance Exposure 等欄位**沒有**把這筆已 CANCELLED 記錄的金額算進去（對照 §6.2「After
      Delete Pending」欄的精確數值）。

### 6.5 Negative / Authorization Tests（BA v3→v4 新增要求）

至少涵蓋以下情境，每一項都必須驗證 server-side 有實際擋下（不是只靠 Angular UI 隱藏按鈕）：

- [ ] **非原 Maker 不得 Cancel**：以非 `createdBy` 的另一個使用者呼叫該筆 movement 的 Delete
      Pending，預期被拒絕（沿用既有 `MakerCheckerConflictError`／或等價的擁有權檢查——若目前
      `cancel()` 沒有這層檢查，依 §0.3 規則登記為 Defect，不要放寬本項的 Expected Result）。
- [ ] **Checker/Maker 角色權限正確**：Checker 角色帳號不應能執行 Maker 專屬的 Delete
      Pending／Fix Pending 類動作（本次範圍內即 Delete Pending 本身）。
- [ ] **已 RELEASED 的記錄無法 Delete**：對照 §3 Case 6，直接對一筆已 RELEASED 的 movement 呼叫
      `cancel()`，預期 409（既有狀態機行為，非本次新規則，但仍要在本次測試中重新確認）。
- [ ] **無效 movementId**：對一個不存在的 movementId 呼叫 Delete Pending，預期明確的 404／
      NOT_FOUND，不是 500 或未定義行為。
- [ ] **錯誤的 LC/2ndary Reference**：Inquire Delete Pending 用一個不存在或打錯的 LC Number／
      2ndary Reference 查詢，預期回傳「查無資料」而不是誤配到其他 LC 的記錄。
- [ ] **重複 Delete 同一筆已 CANCELLED 的 movement**：對同一個 movementId 再呼叫一次 Delete
      Pending，預期 409（狀態已是 CANCELLED，不是合法的來源狀態），且不應再新增一筆
      `delete_pending_audit` 記錄。
- [ ] **直接繞過 UI 呼叫 API**：本節每一項都必須用直接 `curl`/HTTP 呼叫微服務驗證，而不是只在
      Angular UI 上確認按鈕被 disable——UI 層的限制不能取代 server-side 的 business rule 保護。

---

## 7. Regression

三套件（Angular／backend／microservice）在每一輪程式碼修改後都要重跑一次，全綠才算完成，不只是本次
新增測試通過。

---

## 8. 執行順序（狀態：`BA APPROVED — PROCEED WITH FULL TEST EXECUTION`，Final Review Score 9.97/10）

**本文件已通過 ≥9.95/10 品質門檻，正式核准進入執行階段。下列順序已納入 §6.3.1／§6.5／§2.1／§5.1
等 v4 新增項目，可依此順序開始執行。**

1. ~~BA 裁示 §0.1／§0.2~~ ✅ 已完成。
2. ~~BA 確認 §6.1 的 Balance 技術修正~~ ✅ **已完成**：維持既有 Balance Derivation 定義（Confirmed
   只依 RELEASED、Available 立即反映 PENDING），不屬於本次 Delete Pending 修改範圍，§6.2 的
   AMEND_INCREASE／AMEND_DECREASE 斷言數值已依此定案。
3. Microservice special-state tests（§3 六種狀態，含 Case 5 的 acknowledgedAt 保留驗證）。
4. Audit + Balance invariant tests（§5、§5.1、§6，含 A2 AMEND_INCREASE／AMEND_DECREASE／A3／A8／
   A3S 全部案例的 Before 值恢復驗證、§6.3.1 A3S Atomic Failure Test、§6.4 保留＋排除雙重證明、
   §1.1 Internal signed value／UI display value 兩條斷言分開）。
5. §6.5 Negative / Authorization Tests（server-side 直接 curl 驗證，不依賴 UI 隱藏按鈕）。
6. 18 個 Function 的 Browser E2E（§2，依 §2.1 記錄完整 Test Result Evidence）。
7. 4+1 條 Business Lifecycle Path（§4）。
8. Inquire Events / Inquire Delete Pending 交叉驗證（§5、§5.1 已涵蓋，此處是瀏覽器上的最終確認）。
9. 三套件 Full Regression（§7）。
10. SonarQube / quality check。
11. 彙整以上結果——若過程中發現任何實作與本文件 Expected Result 不一致，依 §0.3 Test
    Governance Rule 登記 Defect，而不是回頭修改本文件配合實作。測試執行完成的認定標準：全部
    測試與 Regression 通過、所有登記的 Defect 都已解決或正式 disposition、SonarQube/quality
    check 完成——缺一不可，不是「跑完一輪」就算完成。

---

## 9. 執行中發現並修復的 Defect 記錄（依 §0.3 Test Governance Rule 登記）

### Defect #1 — Delete Pending 後 Natural Key / Secondary Reference 被永久鎖死，無法重新使用（✅ 已修復）

**回報情境**：`S01 A3 B01` Submit → PENDING → Delete Pending → CANCELLED 後，用同一個 IB Number
`B01` 重新 Submit，收到 `sourceTransactionRef "B01" is already used...`，違反 §0.1 流程圖「同一
Function/同一 Natural Key 重新建立新交易」的既定行為。

**根因（兩個獨立問題，同一次修復處理）**：
1. `createMovement()`（`balanceService.ts`）的 sourceTransactionRef 重複檢查比對**所有狀態**的
   既有 movement（含 CANCELLED），而非排除 CANCELLED——A2/A3/A3S/B2/B4 只要用到
   `sourceTransactionRef`（Amendment No./IB/EB Number）的 Function 都受影響，是共用邏輯的
   問題，不是 A3 專屬。
2. `cancel()` 對 A6（IPLC_ACCEPTANCE CREATE）/A8（SHGT ISSUE）/B3（EPLC_EXAMINATION CREATE）這類
   **建立新 Child Contract** 的 Function，從未把該 Child Contract 標記為 CANCELLED（原本的
   `markCancelled()` 呼叫只 scoped 給 A1/B1 的 root contract），導致同一組 IB/SG Number 永遠無法
   重新使用——與 sourceTransactionRef 是同一類「Delete Pending 後 Natural Key 被鎖死」問題，只是
   發生在 Child Contract 的 Natural Key 上，不是 Amendment No. 這類 Secondary Reference 上。

**修復**：
1. 重複檢查改為 `m.status !== 'CANCELLED'`——原 CANCELLED 記錄本身完全不變，仍可透過 Inquire
   Delete Pending 查到，只是不再計入「使用中」判斷。
2. `cancel()` 的 `markCancelled()` 觸發條件從「僅限 ROOT_INSTRUMENT_TYPES 的 ISSUE」，擴大為
   「任何 `isCreating`（ISSUE 或 CREATE）動作，且被取消的這筆是該 Contract 唯一存在過的
   movement」——「唯一 movement」這個條件同時涵蓋 root 與 child 兩種情況，比原本只靠
   `assertRootIssueReleased()` 的 root 專屬論證更通用、更安全（避免誤刪一個實際上還有其他
   movement 歷史的 Contract）。

**驗證**：
- Jest：`balanceService.test.ts` 新增／改寫 6 個測試（A3 B01 直接 Delete 重送、A3 B01
  Reject→Delete 重送、CANCELLED 原記錄保留驗證、非 CANCELLED 重複仍應擋下、A8 SG Number
  重送成功、有 sibling movement 時不得誤刪 Contract）；`microservices/balance-component/`
  全套 630/630 綠燈，四項覆蓋率皆 ≥95%。
- Live 驗證：對真實跑著的 dev microservice 直接 curl 兩條指定路徑
  （`Submit → Delete → Same B01 → Submit` ✅、`Submit → Reject → Delete → Same B01 → Submit`
  ✅），並額外驗證 A8 SG Number 重送 ✅；`GET .../movements` 確認原 CANCELLED 記錄
  （B01/B02）與新 PENDING 記錄同時存在，稽核軌跡完整無損。
- 尚未逐一對 A2/A6/B2/B3/B4 個別跑過 Live case（Test Plan §2 仍會在 18-Function E2E 階段逐一
  驗證 Re-create Result），但這次的兩處修復都是共用邏輯層級的修正，不是 A3/A8 專屬 patch。

### Defect #2 — A4 Maker Submit 後，Maker Queue 仍顯示 A3 的 EARMARKED，未切換到 A4 自己的 lifecycle（✅ 已修復）

**回報情境**：`S01 A3 B01` 已 Checker Acknowledge（EARMARKED）→ A4 Maker Submit（movement 仍是
PENDING，等待 A4 自己的 Checker 決定）。Maker Queue 的 Function 欄已正確顯示 A4（Defect 修復前一輪
已修好），但 **Status 欄仍顯示 EARMARKED**，與 Function 欄「已經是 A4」互相矛盾——正確應顯示
`A4 / PENDING`。

**根因**：`displayStatus()`/`statusBadgeClass()`（`balance-component.model.ts`）本來就有 `phase`
參數處理這個情境（`phase === 'finalize'` 時 `isEarmarkFunction()` 回傳 `false`，`InquireEventsService.
toEventRows()` 已經用同一個機制把已 Finalize 的 Sight Document Arrival 拆成 A4 自己的一列），但
`MakerQueueComponent` 的樣板從未傳入 `phase`，導致 `functionFor()` 已經把這列判定為 A4，
Status 卻仍套用 A3/A3S 的 EARMARKING/EARMARKED 用字。

**修復**：新增 `MakerQueueService.displayPhaseFor(row)`，與 `functionFor()` 共用同一個
`isFinalizing()`（`makerSubmittedAt` 已設定）判斷條件，回傳 `'finalize'`；樣板改傳這個值給
`displayStatus()`/`statusBadgeClass()`/`statusBadgeIcon()` 三個呼叫點。Delete Pending 按鈕的
enable/disable 邏輯（`isAlreadyAcknowledged()`）本身不受影響——它已經是用
`acknowledgedAt && status === 'PENDING'` 判斷，B01（PENDING）維持 disabled、B02
（REJECTED）維持 enabled，與這次修的 Status 顯示問題是兩件獨立的事，不需要一起改。

**A6/B4/B3 路徑查證結果（確認不受影響，非本次修復範圍）**：
- **A6（Acceptance, Usance）**：查證 `maker-submit.service.ts`，A6 是 `IPLC_ACCEPTANCE/CREATE`，
  不符合任何 compound-submission 分支，走 `submitPlain()`——**建立自己獨立的新 movement**，
  從不呼叫 `/maker-submit` 去動底層 A3 的 UTILIZE。因此 A6 送出後，底層 A3 UTILIZE 的
  `makerSubmittedAt` 永遠不會被設定，Maker Queue 上那一列仍正確顯示 `A3 / EARMARKED`
  （這本來就是對的——A6 是另一筆獨立交易，不是「原地 finalize」同一筆 movement）。
- **B4（Honour/Accept）**：`referencedTransactionId` 指向 B3，是**與 B3 完全分開的 movement**
  （不像 A3/A4 共用同一筆），`resolveFunctionForMovement('EPLC_CONFIRMATION', 'HONOUR'/'ACCEPT')`
  直接、無歧義地解析為 B4，`isEarmarkFunction()` 對這個 pair 本來就回傳 `false`——B4 自己的
  PENDING/REJECTED 從一開始就正確顯示，不受這次的問題影響。
- **B3（Present Docs）**：2026-08-18 起已改為真正 Release（非 acknowledge-only 設計），沒有
  A3/A4 這種「同一筆 movement 被兩個 Function 分兩階段處理」的 quirk。
- 結論：這次 Defect **只影響 Sight A3→A4 這一條路徑**（唯一「同一筆 movement 原地 finalize」的
  情境），A1(Usance)→A3→A6、B1→B3→B4 兩條路徑經查證本來就不受影響，不需要修改。

**驗證**：
- Jest：`maker-queue.service.spec.ts` 新增 3 個 `displayPhaseFor()` 測試（makerSubmittedAt 後
  回傳 `'finalize'`、僅 acknowledged 未 makerSubmit 時回傳 `null`、非 A4-eligible instrumentType
  回傳 `null`）；Angular 全套 1274/1274 綠燈，四項覆蓋率皆 ≥95%。
- Live 驗證：對真實 dev server 建立 B01（Acknowledge→A4 Maker Submit，停在 PENDING）與 B02
  （Acknowledge→A4 Maker Submit→Checker Reject）兩筆真實資料，瀏覽器 Maker Queue 畫面確認：
  B01 顯示 `A4 · Sight Settlement` / `PENDING`（黃底）、Delete Pending disabled；B02 顯示
  `A4 · Sight Settlement` / `REJECTED`（紅底）、Delete Pending enabled——與需求的 truth table
  完全一致，console 零錯誤。

### Defect #3 — `cancel()` 覆寫 REJECTED 狀態既有的 `released_at`/`released_by`，導致 §0.2 P0 要求的「三個時間點」稽核軌跡在 A4/A6 Reject → Delete Pending 這條路徑上遺失中間一點（BA 執行前程式碼審查發現，**已修復並驗證**，2026-08-27）

**發現方式**：非測試執行中發現，而是 BA 在 §8 執行順序開始前，針對本文件 §0.2 P0 規則
（「Audit 必須能完整追溯三個時間點：Checker acknowledged → A4/A6 rejected → Maker deleted
pending」）與 §3 Case 5 逐條對照真實程式碼時發現——**§3 Case 5 目前寫的驗證方式（只斷言
`acknowledgedAt` 保留）會通過，但這不代表三個時間點都保住了，因為「A4/A6 rejected」這個時間點
本身存放的欄位另有其事，且該欄位查證後會被清空。**

**根因**（`microservices/balance-component/src/store/balanceMovementStore.ts` `updateStatus()`）：

```sql
UPDATE balance_movements
SET status = @status, released_by = @releasedBy, released_at = @releasedAt, ...
WHERE movement_id = @movementId
```

`released_by`/`released_at` 這兩欄是**直接覆寫，不是 `COALESCE(@param, column)`**（跟同一段 SQL
裡 `reason_code`/`event_snapshot` 等欄位刻意用 COALESCE 保留舊值的寫法不同——`reason_code` 那條
COALESCE 本身就是 2026-08-26 一次修復的成果，見該欄位自己的 doc comment）。而 `reject()`
（`balanceService.ts:2317-2323`）呼叫 `updateStatus()` 時，`releasedBy`/`releasedAt` 就是
「誰在何時 Reject 了這筆交易」的實際存放位置：

```ts
this.movements.updateStatus({ movementId, status: 'REJECTED', releasedBy, releasedAt: this.now(), reasonCode, remarks });
```

`cancel()`（`balanceService.ts:2341` 起）呼叫 `updateStatus()` 時**沒有傳入**
`releasedBy`/`releasedAt`，兩者依函式簽章預設綁定為 `null`——因此 §3 Case 5 這條合法路徑
（REJECTED → Delete Pending → CANCELLED，`statusTransition.ts` 的 `REJECTED: { CANCEL:
'CANCELLED' }` 允許）執行後，這筆記錄原本記著的「Reject 是誰、何時做的」會被**直接覆寫成
`null`**，永久遺失，且沒有任何地方保留副本。

**與 §0.2 P0 規則的落差**：§0.2 原文要求的三個時間點——Checker acknowledged／A4-A6 rejected／
Maker deleted pending——查證後**只有頭尾兩點在資料庫裡有可靠來源**（`acknowledged_at` 從未被
`updateStatus()` 觸碰、`cancelled_at` 是 `cancel()` 自己寫入的新欄位），**中間那一點
（A4/A6 rejected 的時間與執行者）存放的 `released_at`/`released_by` 會被同一次 `cancel()`
呼叫清空**。§3 Case 5 目前的驗證步驟（「Cancel 後直接讀該筆 movement：`acknowledgedAt` 保留原值
不變、`status`=CANCELLED」）不會抓到這個問題，因為它根本沒有斷言 `released_at`/`released_by`——
照現在的寫法執行測試會顯示 ✅ Pass，但三點稽核軌跡實際上只保住了兩點。

**依 §0.3 Test Governance Rule 登記**：這是「已核准的 Expected Result（完整三點稽核追溯）」與
「目前實作行為（中間點被覆寫遺失）」的落差，依規則登記為 Defect，**不修改 §0.2/§3 的 Expected
Result 去配合現有行為**。

**建議修法**（範圍小、風險低，比照 `reason_code` 2026-08-26 那次修復的同一手法）：
`updateStatus()` 的 `released_by`/`released_at` 兩欄改成 `COALESCE(@releasedBy, released_by)`／
`COALESCE(@releasedAt, released_at)`——`cancel()` 從不傳這兩個參數，COALESCE 後自然保留 Reject
當下寫入的原值；`release()`/`reject()` 本身仍會照常寫入自己的值，不受影響。

**建議測試補強**：§3 Case 5 的「額外驗證」欄補上一條斷言——Cancel 後 `released_at`/`released_by`
應等於 Reject 當下寫入的原值，而不是只驗證 `acknowledgedAt`；並建議在 §5（Delete Pending Audit
驗證清單）補一條「REJECTED → Delete Pending 這條路徑，原 Reject 的時間/執行者在
`balance_movements` 本身仍可查」的通用檢查（不限 A4/A6，任何 Function 的 REJECTED → Delete
Pending 都適用同一段程式碼、同一個缺陷）。

**狀態**：**已修復**。`updateStatus()` 的 `released_by`/`released_at` 兩欄已依上述建議改成
`COALESCE(@releasedBy, released_by)`／`COALESCE(@releasedAt, released_at)`（`balanceMovementStore.ts`），
與既有 `reason_code` 的手法完全一致；SQL 與 params 綁定同步確認過沒有任何呼叫端曾經刻意傳
`releasedBy`/`releasedAt` 為 `null` 來清空這兩欄（`release()`/`reject()` 一律傳真值，`cancel()`
一律不傳），故此次修改不影響任兩者既有行為。

`typecheck` 過關；`balanceService.test.ts` 新增 2 個測試（`REJECTED -> Delete Pending 保留
released_by/released_at` 描述區塊）：(1) Acknowledge→A4 Maker Submit→Reject→Cancel 全路徑，驗證
`acknowledgedAt`／`releasedBy`+`releasedAt`（等於 Reject 當下寫入值）／`cancelledBy`+`cancelledAt`
三點全部獨立可查；(2) 從未 Acknowledge 過的一般 PENDING→Reject→Cancel 路徑，同樣驗證 `releasedBy`/
`releasedAt` 保留、`acknowledgedAt` 全程維持 `null`。微服務全套 667/667 綠燈，四項覆蓋率皆
≥95%（99.03%/95.21%/100%/99.68%）。另對真實執行中的 dev server（`:4100`）直接以 curl 重現
Acknowledge→Maker Submit→Reject→Cancel 完整流程，回應確認三點稽核（`acknowledgedBy`/`acknowledgedAt`、
`releasedBy`/`releasedAt`、`cancelledBy`/`cancelledAt`）在 Cancel 後全部仍為 Reject 當下寫入的原值，
非測試環境下的真實行為與單元測試一致。§3 Case 5 現在可以安全採用完整的三點斷言方式執行，不會再有
「假通過」風險。
