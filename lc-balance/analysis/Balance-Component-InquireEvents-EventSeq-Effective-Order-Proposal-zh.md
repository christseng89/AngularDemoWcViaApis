# Balance Component — Inquire Events 事件排序（Event Effective Order）業務建議與 BA 查證（2026-08-26）

> **文件性質**：本文件記錄業務（Business）針對 Inquire Events 事件顯示順序提出的建議，以及 BA 對照
> 實際程式碼所做的查證。這是**待工程部門評估可行性與影響範圍的需求輸入**，尚非最終拍板的實作決定
> （不同於 `standing-microservice-reference/Phase2-CalendarService-Options-for-BA-Decision-zh.md` 那種
> 已有明確 BA Decision 的文件）。請工程部門讀完查證段落後，針對「建議所需的變更範圍」給出評估意見。

## 1. 業務建議原文（逐字保留）

> 如果你的意思是 **Inquire Events 要反映「交易正式生效的先後順序」**，那麼**是的，應該以 Checker
> Release / Approval Time 為準**。
>
> 因為在你目前 Balance Component 的 Maker/Checker 原則下：
> * **Maker Submit** → PENDING，交易尚未正式生效
> * **Checker Release / Approve** → APPROVED，才正式影響 Balance
>
> 例如：
>
> | B3    | Maker Submit | Checker Approve | 生效順序 |
> | ----- | ------------ | --------------- | ---: |
> | EB001 | 10:00        | **10:30**       |    2 |
> | EB002 | 10:10        | **10:20**       |    1 |
>
> 因此如果 Inquire Events 的目的，是顯示**實際影響 Balance 的 Event 順序**，應該是：
>
> ```text
> 10:20  EB002  APPROVED
> 10:30  EB001  APPROVED
> ```
>
> 而不是按照 Maker Submit 順序。
>
> 但 **PENDING 尚未有 Checker Time**，所以我建議正式規則定義為：
>
> > **APPROVED/EARMARKED events are ordered by Checker Release/Approval Time, representing the
> > actual effective sequence of Balance changes. PENDING/EARMARKING events that have not yet been
> > released should use Maker Submit Time until a Checker Release/Approval Time becomes available.**
>
> 這也意味著 **Event Seq 最好代表「正式生效順序」的話，就應在 Checker Release 時決定；不要在 Maker
> Submit 時先固定一個不可改的 Event Seq。**
>
> 這一點對 B3 特別重要，因為 **Maker Submit sequence ≠ Balance effective sequence**。

## 2. BA 查證：目前程式碼的實際行為

依專案慣例（不盲目採信/否決業務主張，先對照真實程式碼查證），逐項核對如下。

### 2.1 Inquire Events（Angular）目前的排序邏輯——確實是 Maker Submit 時間，不是 Checker Release 時間

`src/app/transaction-builder/inquire-events.service.ts`：

```ts
// line 233
/** Every Event under the searched LC — root plus every child ledger's own movements — sorted by
    createdAt (true Event Date/Time), not the per-contract eventSeq. */
events: InquiredEvent[] = [];

// line 361 — loadEvents()
this.events = groups.flat().sort((a, b) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime());
```

`toEventRows()`（line 93-107）決定每個 Row 的 `eventTime`：

```ts
if (!isFinalizedSightUtilize) {
  return [{ movement, contract, eventTime: movement.createdAt, eventStatus: movement.status, phase: 'primary' }];
}
return [
  { movement, contract, eventTime: movement.createdAt, eventStatus: movement.status, phase: 'create' },
  { movement, contract, eventTime: movement.releasedAt as string, eventStatus: movement.status, phase: 'finalize' },
];
```

**查證結果**：目前絕大多數 Event（`phase: 'primary'`）的排序鍵是 `movement.createdAt`，也就是
**Maker Submit 時間**，跟業務描述的現況完全一致。只有一個既有的特例會用到 `releasedAt`：A4（Sight
Settlement，`payExistingUtilize`）finalize 一個既有 A3/A3S UTILIZE 時，會把該筆 movement 拆成
`create`（用 `createdAt`）＋`finalize`（用 `releasedAt`）兩列。但這是為了處理「同一筆 movement 被
第二個動作完成」的特殊情境而做的窄範圍設計，**並非**業務現在提出的「APPROVED 事件一律以 Checker
Release 時間排序」這種通則。

`LookUpPanelService`（`look-up-panel.service.ts` line 39、292-293）的跨合約合併時間軸也是同樣的
`eventTime`（非 `eventSeq`）排序邏輯，共用同一套 `toEventRows()`，因此本查證結論同樣適用於
LookUpPanelService 自己的 Event Timeline，不只 Inquire Events 一處。

### 2.2 `eventSeq` 的真正角色——確實在 Maker Submit 當下用戶端 `Date.now()` 生成，且不可變

業務推論「Event Seq 最好在 Checker Release 時才決定，不要在 Maker Submit 時先固定」，查證如下：

**用戶端（Angular）在 Maker Submit 當下生成 `eventSeq`**（`Date.now()`），共 6 處：

- `maker-panel.component.ts` line 172、426（表單初始 model）
- `maker-submit.service.ts` line 97、165、207、224、286（每一種 Submit 路徑各自生成）
- `submit-rules.ts` line 271：`eventSeq: model.eventSeq ?? Date.now()`（保底）

**送到後端後，`eventSeq` 是冪等鍵（idempotency key）的一部分，寫入後不再更動**：

- `src/db/schema.ts` line 259：`-- Design doc §8 — idempotency key: (balanceContractId, eventSeq).`
- `balanceMovementStore.ts` line 131：同一份 Design doc §8 冪等設計註解；`findByContractAndEventSeq()`
  （line 232-233）以 `(balance_contract_id, event_seq)` 查重。
- Checker 執行 `release()` 時**不會**重新指派或覆寫 `eventSeq`——它只更新 `status`/`releasedAt`
  （這點與先前本 session 已驗證過的 `release()`/`reason_code` COALESCE 修正屬同一支程式碼路徑，
  未見任何改寫 `eventSeq` 的邏輯）。

**查證結果**：業務的推論屬實。`eventSeq` 是 Maker Submit 當下用戶端產生、送出後即凍結的冪等鍵，
Checker Release 完全不會回頭調整它。

### 2.3 比 Inquire Events 顯示排序影響更廣——`eventSeq` 同時是餘額引擎自己的權威排序鍵

這是業務原始建議**沒有觸及、但 BA 認為工程部門必須一併評估**的範圍。`eventSeq` 不只是
Inquire Events 顯示用的排序鍵，它同時是 **Balance 計算本身**的權威時間序：

- `balanceService.ts` line 754：`listByContract()` 回傳結果依 `eventSeq` 排序，做為
  `confirmedBalance`/`availableBalance` 計算的疊代順序。
- `balanceService.ts` line 959-989（`asOfEventSeq`）：「查詢某一時點的 Balance Snapshot」功能，
  以 `movements.eventSeq <= asOfEventSeq` 過濾，也就是「時點」本身是用 `eventSeq` 定義的。
- `balanceService.ts` line 1256：Event Timeline 註解明講「eventSeq is already strictly increasing
  per contract, Design doc §8」，代表後端把 `eventSeq` 順序視同「真實時間順序」的既有假設。
- `domain/reopenRestoration.ts` line 29-30（`computeReopenRestoreAmount()`）：REOPEN 還原金額的計算
  也是先用 `eventSeq` 排序 `movements` 後才逐筆核算——這是 F1 這次 Session 才新增的邏輯，同樣沿用
  「`eventSeq` = 真實時間序」這個假設。

**查證結果**：如果只把「排序改為以 Checker Release 時間為準」這件事侷限在 Inquire Events 這個
UI 畫面（純顯示層修正），風險與工作量相對小，且不牽動冪等鍵設計。但業務提出的原則——
「Event Seq 最好代表正式生效順序，應在 Checker Release 時才決定」——如果要**同步套用到 Balance
計算引擎本身**（`confirmedBalance`/`availableBalance`/`asOfEventSeq`/REOPEN 還原金額），影響範圍
會擴大到 Design doc §8 的冪等鍵設計核心，屬於架構層級變更，需要工程部門審慎評估，**不建議在未經
評估前直接動手**。

### 2.4 用業務自己的例子回推目前系統的實際輸出

以業務範例驗證：EB001（Submit 10:00 / Approve 10:30）、EB002（Submit 10:10 / Approve 10:20）。

目前 Inquire Events（依 2.1 查證）會顯示：

```text
10:00  EB001  APPROVED   ← createdAt 10:00，排第一
10:10  EB002  APPROVED   ← createdAt 10:10，排第二
```

與業務期望的「反映生效順序」輸出（EB002 應排第一，因為 10:20 先 Approve）**確實不同**，業務的問題
描述與實際程式碼行為一致，不是誤解。

## 3. 業務正式建議規則（原文轉錄，供工程部門直接參照）

> **APPROVED/EARMARKED events are ordered by Checker Release/Approval Time, representing the
> actual effective sequence of Balance changes. PENDING/EARMARKING events that have not yet been
> released should use Maker Submit Time until a Checker Release/Approval Time becomes available.**

## 4. BA 交予工程部門的評估問題（待回覆，非最終決定）

1. **範圍界定**：本次變更是否僅限 Inquire Events（含 LookUpPanelService 共用的 Event Timeline）
   這個**顯示層**的排序邏輯（把排序鍵從 `movement.createdAt` 改成「已 Release 用
   `releasedAt`、否則用 `createdAt`」的混合鍵），還是要連同 §2.3 提到的 Balance 計算引擎本身
   （`confirmedBalance`/`availableBalance`/`asOfEventSeq`/REOPEN 還原金額）一併變更？兩者風險與
   工作量差異很大，請分別評估。
2. **冪等鍵是否需要調整**：若只做顯示層變更（選項 1），`eventSeq` 本身作為冪等鍵、於 Maker Submit
   當下生成、Release 不改寫的既有設計（Design doc §8）**不需要**跟著變更——只是 UI 排序改用另一個
   欄位（`releasedAt` 優先、`createdAt` 兜底），不影響資料庫層的唯一性/冪等保證。工程部門請確認
   此判斷是否正確。
3. **混合排序鍵的邊界情況**：同一批 Event 中，若部分已 Release（用 `releasedAt`）、部分仍
   PENDING（用 `createdAt`），兩者本質上是不同時間軸，混合排序時如何避免「PENDING 事件的
   `createdAt` 恰好落在已 Release 事件的 `releasedAt` 中間」造成的排序觀感問題？是否需要在 UI
   上額外標示「此排序含有尚未生效的 PENDING 項目，僅供參考」之類的提示？
4. **A4 既有特例是否需要調整**：目前 A4（Sight Settlement）已有 `create`/`finalize` 兩列拆分邏輯
   （`create` 用 `createdAt`、`finalize` 用 `releasedAt`），本次變更若上線，是否會與此既有特例的
   排序產生衝突或重複邏輯？建議工程部門一併檢視 `toEventRows()`。
5. **REJECT/CANCEL 事件如何排序**：業務規則只講到 APPROVED 與 PENDING 兩種狀態，若 Checker
   REJECT 或後續 CANCEL，該筆事件应該使用哪個時間戳排序？（現況：`releasedAt` 欄位在 REJECT 時也
   會被寫入，語意上是「第二動作的時間」，不限定於「核准」——這點在 `toEventRows()` 的既有註解裡
   已有說明，請工程部門確認業務規則是否也適用於 REJECT 情境。）

## 5. 目前狀態

```text
Status: Pending Engineering Feasibility Assessment
Scope proposed by Business: Inquire Events display ordering (APPROVED → Checker Release Time,
                             PENDING → Maker Submit Time as fallback)
Scope flagged by BA for engineering to also assess: Balance calculation engine's own eventSeq-based
                             ordering (confirmedBalance / availableBalance / asOfEventSeq / REOPEN
                             restoration) — same underlying assumption, not requested by Business yet
                             but shares the identical root cause.
Balance Component Change: Not yet started — awaiting engineering's scope/impact assessment (§4 above).
```

---

*本文件由 BA 依專案「先查證、後轉交工程」慣例撰寫，內容為新建文件（無既有文件可附加），日後若有
後續討論或工程部門回覆，請依專案 append-only 慣例以日期標注方式附加於本文件末端，不要覆寫以上
內容。*

---

## 6. 工程可行性評估（2026-08-26，逐項回覆 §4 的 5 個問題）

依專案慣例（不盲目採信/否決 BA 主張，逐項對照真實程式碼查證後才回覆）。**本節純屬分析與建議，未變更
任何程式碼**——仍待業務/BA 拍板後才會實作。

### 6.1 回覆問題 1（範圍界定）——明確建議：只做選項 1（顯示層），選項 2（引擎層）不建議現在做

除了 BA 已查證的 `listByContract()`（`balanceService.ts:754`，供 `confirmedBalance`/`availableBalance`
迭代）、`asOfEventSeq`（`balanceService.ts:986`）、`computeReopenRestoreAmount()`
（`domain/reopenRestoration.ts:29-30`）三處，我額外查證了 `domain/balanceDerivation.ts` 裡
`computeConfirmedBalance()`/`computeAvailableBalance()`/`computePendingDecreaseTotal()` 的實際實作：
三者都是單純的 `.reduce()` 加總（`signedAmount()` 用 `Map` 依 `movementId` 查找，不依賴陣列順序）——
**加總本身是順序無關的**，只要參與加總的集合（哪些是 RELEASED、哪些是 PENDING）不變，`eventSeq`
排序方式改變並不會改變 `confirmedBalance`/`availableBalance`/`pendingDecreaseTotal` 這幾個數字本身，
只會改變 `listByContract()` 回傳陣列的「顯示/疊代順序」。

真正**會**因為 `eventSeq` 定義改變而改變**數值結果**的，只有兩處：

1. **`asOfEventSeq`（時點快照，`balanceService.ts:981-992`）**——這是門檻比較（`m.eventSeq <= asOfEventSeq`），
   不只是相對順序，`eventSeq` 的**絕對值**本身就是「時點」的定義。目前語意是「這筆交易 Maker Submit
   當下，所有已存在的交易」；如果改成 Checker Release 時才決定 `eventSeq`，語意會變成「這筆交易
   Checker Approve 當下，所有已存在的交易」——這是兩個**不同的業務問題**，而且一筆還在 PENDING、
   根本沒有 Release Time 的交易，無法定義它自己的 `asOfEventSeq` 該是多少，需要重新設計。
2. **`computeReopenRestoreAmount()`（REOPEN 還原金額，`domain/reopenRestoration.ts:29-30`）**——這裡
   真的是「依 `eventSeq` 排序後，從最後一筆往前走，直到遇到非 EXPIRE/CLOSE 為止」，是貨真價實的
   順序相依邏輯。若 Submit 順序與 Release 順序不一致（業務範例本身就是這種情境），改變 `eventSeq`
   語意可能改變「最近一筆」的判定，進而改變還原金額——這是 F1 這次 Session 才新增的邏輯，還沒有
   通過長時間實戰驗證，改動風險評估難度較高。

**建議**：明確只做選項 1（顯示層），**不建議**現在把 §2.3 的引擎層也一併改——不是因為做不到，而是
「數值計算本身多數不受影響，真正受影響的兩處（`asOfEventSeq`、REOPEN 還原）語意都會質變，需要各自
重新設計，不是把同一個排序鍵套用過去就好」，投入產出比很低，且業務目前提出的原始需求（Inquire
Events 顯示順序）用選項 1 就能完全滿足。

### 6.2 回覆問題 2（冪等鍵是否需要調整）——確認：選項 1 完全不需要動冪等鍵設計

BA 自己的判斷正確，且經上述 6.1 查證後更確定：選項 1 只是把 Inquire Events／LookUpPanelService 這兩個
**純顯示層**服務裡 `toEventRows()`/`movementsOf$()` 回傳的 `eventTime` 欄位，從單純 `movement.createdAt`
改成「已 Release/Reject/Cancel 用對應的第二動作時間、否則用 `createdAt`」的混合鍵——`eventSeq` 本身
（Design doc §8 冪等鍵，`(balanceContractId, eventSeq)` DB UNIQUE constraint，Maker Submit 當下由
`Date.now()` 產生、Release 永不改寫）**完全不需要變更**，資料庫層的唯一性/冪等保證不受影響。

### 6.3 回覆問題 3（混合排序鍵邊界情況）——具體建議實作方式

建議排序鍵定義為 `event.releasedAt ?? event.createdAt`（見 6.5 對 `cancelledAt` 的補充，實際應為
`event.releasedAt ?? event.cancelledAt ?? event.createdAt`），並在 UI 上對「排序鍵取自 `createdAt`
（即仍是 PENDING/EARMARKING，尚未有第二動作時間）」的列，加一個視覺標示（例如既有 `.tb-status-badge`
系統已經用顏色/圖示區分 PENDING vs APPROVED，可以直接複用，不需要新元件）——這樣列表本身的排序已經
反映「已生效的事件」跟「尚未生效、僅供參考的事件」是兩條不同時間軸，不需要額外文字提示，跟現有
`displayStatus()`/`statusBadgeClass()` 的既有慣例一致。

### 6.4 回覆問題 4（A4 既有特例是否衝突）——確認：不衝突，A4 本身就是這個規則的既有先例

查證 `toEventRows()`（`inquire-events.service.ts:93-107`）：A4（Sight Settlement）finalize 既有 A3/A3S
UTILIZE 時，`'create'` 列用 `movement.createdAt`（原始 A3 Submit 時間），`'finalize'` 列用
`movement.releasedAt`（A4 Release 時間）——**這正是業務這次要求的通則「APPROVED 用 Release 時間」的
一個既有、範圍較窄的先例**，只是目前只套用在這一種特殊情境（一筆 movement 被兩個動作完成）。
**不會衝突**：套用新規則後，`'finalize'` 列的排序鍵本來就已經是 `releasedAt`，跟新規則算出來的值
完全一樣；`'create'` 列本來就該保持 `createdAt`（代表 A3 這個真實發生過的歷史事件本身，不該因為
A4 之後才 Release 就往後移），這點新規則也不會去動它——`toEventRows()` 這個函式**不需要修改**，
只有 `loadEvents()`/`LookUpPanelService` 呼叫端的排序邏輯（目前直接讀 `eventTime`）需要改成讀新的
混合鍵。反而是這個既有先例證明了「用 Release 時間排序」這個做法在這個 codebase 裡已經穩定運作過。

### 6.5 回覆問題 5（REJECT/CANCEL 排序基準）——確認 BA 判斷成立，但發現一個 BA 文件未提及的欄位

BA 原文件已指出 `releasedAt` 在 REJECT 時也會被寫入，語意是「第二動作時間」不限於核准，`toEventRows()`
自己的既有 doc comment 也這樣寫（"`releasedAt` is reused for any second-actor outcome
(release/reject/cancel)"）——查證 `statusTransition.ts`/`balanceMovementStore.ts` 的 `reject()` 呼叫
路徑確認屬實，這部分業務規則可以直接沿用到 REJECT。

**但發現一個 BA 文件沒提到的欄位**：Maker 自己的 EC/Cancel（`cancel()`）**不是**寫入 `releasedAt`，而是
寫入獨立的 `cancelledAt`/`cancelledBy`（`types.ts:221-222`；`CLAUDE.md` 決策日誌「Submit/EC/Approve
audit trail — `cancelledBy`/`cancelledAt` split out from `releasedBy`/`releasedAt`」條目——這是為了讓
Submit/EC/Approve 三件事各自獨立可查而刻意拆開的，`toEventRows()` 目前完全沒有讀取這個欄位）。
如果新排序規則要涵蓋「Maker 自己 EC 掉的 PENDING 交易」，混合鍵必須是
`releasedAt ?? cancelledAt ?? createdAt`，不能只看 `releasedAt`——否則一筆已經被 Maker EC 掉的交易，
排序鍵會錯誤地退回 `createdAt`（EC 動作本身的時間點反而沒被反映）。**建議把這一點一併納入選項 1 的
實作範圍**，不需要另外請示業務——這純粹是把 BA 自己講的「第二動作時間」原則正確套用到 EC 這個既有的
第二動作類型上，不是新增業務規則。

### 6.6 總結建議

| 問題 | 結論 |
|---|---|
| 範圍 | 只做選項 1（顯示層），選項 2（引擎層）不建議現在做——真正受影響的只有 `asOfEventSeq`/REOPEN 還原，且都需要各自重新設計語意，投入產出比低 |
| 冪等鍵 | 確認不需要調整 |
| 混合鍵邊界 | 排序鍵 = `releasedAt ?? cancelledAt ?? createdAt`；PENDING 列沿用既有 status badge 視覺區分，不需要額外文字提示 |
| A4 特例 | 不衝突，`toEventRows()` 本身不用改，只需改呼叫端的排序邏輯；A4 本身就是這個規則已驗證過的先例 |
| REJECT/CANCEL | REJECT 沿用 `releasedAt` 沒問題；**新發現**：CANCEL 要讀 `cancelledAt`（獨立欄位），BA 原文件未提及 |

實作範圍明確後，工作量很小：`inquire-events.service.ts`/`look-up-panel.service.ts` 各自的排序 `.sort()`
呼叫（`inquire-events.service.ts:361`、`look-up-panel.service.ts:312`）改成讀一個新的
`effectiveEventTime(event)` 共用函式（比照 `functionForEvent()`/`secondaryReferenceForEvent()` 既有
「兩個服務共用同一個 free function，避免各自實作出現分歧」的慣例），不動 `toEventRows()`／
`eventSeq`／冪等鍵／Balance 計算引擎。**仍待業務/BA 對這份評估拍板後才會動手實作，本次未寫任何
程式碼。**

---

## 7. 實作完成（2026-08-26，同日，使用者拍板選項 1 後實作）

依 §6 評估的方案 1（僅顯示層）實作，範圍比 §6.6 原本設想的還更小——**不需要**在兩個服務的
`.sort()` 呼叫端各自加一個新函式，因為 `look-up-panel.service.ts` 本來就是透過 `movementsOf$()`／
`childMovementsOf$()` 呼叫 `inquire-events.service.ts` 匯出的 `toEventRows()`，兩邊排序也都是直接讀
`InquiredEvent.eventTime`——只要在 `toEventRows()` 內部把 `'primary'` phase 的 `eventTime` 計算改成
`effectiveEventTime(movement) = movement.releasedAt ?? movement.cancelledAt ?? movement.createdAt`，
兩個服務的排序與顯示（TIME 欄位本身，不只是排序順序）就會**同時**改變，完全不需要碰兩個服務各自的
`.sort()` 呼叫或新增外部函式。`'create'`/`'finalize'`（A4 既有拆分）維持原樣，如 §6.4 所述。

**與 §6.5 的差異**：§6.5 原本建議 `releasedAt ?? cancelledAt ?? createdAt`，實作時確認欄位優先序
正確——`releasedAt`／`cancelledAt` 互斥（一筆 movement 不會同時有兩者），故先後順序寫成
`releasedAt ?? cancelledAt` 或反過來寫都不影響結果，這裡維持 §6.5 原建議的寫法。

**測試**（依專案 Standing Rule「every code change gets unit tests + a live functional pass」）：
- 新增 3 筆 `inquire-events.service.spec.ts` 測試：逐字重現業務原文的 EB001/EB002 範例
  （Submit 10:00/10:10、Approve 10:30/10:20，驗證排序輸出是 EB002 先、EB001 後）、還在 PENDING
  的事件仍用 `createdAt` 排序、Maker 自己 EC/Cancel 的事件改用 `cancelledAt` 排序（§6.5 發現的
  欄位）。Angular 全套測試 1171→**1174**，三套測試套件全綠（Angular 1174/1174、backend 38/38、
  微服務 585/585，微服務/backend 本來就不受影響，純 Angular 端改動）。
- **即時 API + 瀏覽器雙重驗證**：先用 `curl` 直接對微服務建了一個真實情境——同一張 LC 底下兩筆 SG
  Issue（SGORD01 先 Submit 後 Approve；SGORD02 後 Submit 但先 Approve，時間差刻意錯開重現業務範例的
  形狀），再到瀏覽器打開 Inquire Events 畫面實際檢視——**SGORD02 確實排在 SGORD01 之前**，跟修改前
  （會照 createdAt 排 SGORD01 在前）完全相反，親眼確認業務要的效果，不只是單元測試斷言。全程
  Console 無錯誤。

**未變更**：`eventSeq`、冪等鍵、Balance 計算引擎（`confirmedBalance`/`availableBalance`/
`asOfEventSeq`/REOPEN 還原金額）、`toEventRows()` 的 `'create'`/`'finalize'` 分支——完全符合 §6.1
的範圍界定建議。


## 8. BA Code Review（2026-08-26，複查 §7 實作）

依專案「不盲目採信，逐項對照真實程式碼複查」慣例，對 §7 宣稱完成的實作重新查證，結論：**主要業務情境
（業務原文 EB001/EB002 範例）的實作正確、測試到位、範圍控制得宜；但發現一個既有、非本次引入的資料
完整性問題，會影響本功能在一種複合情境下的正確性，建議一併處理或至少正式登記追蹤。**

### 8.1 複查通過的項目

- `effectiveEventTime()`（`inquire-events.service.ts` 新增函式）：`movement.releasedAt ?? movement.cancelledAt
  ?? movement.createdAt`，與 §7 描述完全一致；`toEventRows()` 只有 `'primary'` 分支改用它，`'create'`/
  `'finalize'` 分支維持原樣——逐行核對程式碼屬實。
- `LookUpPanelService`（`look-up-panel.service.ts:312`）確實只讀 `eventTime` 排序、透過共用的
  `movementsOf$()`/`toEventRows()`，因此不需另外改動——核對屬實，§7 宣稱「範圍比原本設想的還小」成立。
- 3 筆新測試（`inquire-events.service.spec.ts:199/225/237`）逐字重現業務 EB001/EB002 範例、PENDING 情境、
  `cancelledAt` 情境，斷言正確且對應到 `effectiveEventTime()` 的三個分支——測試本身有意義，不是形式測試。
- REJECT 沿用 `releasedAt`：核對 `balanceService.ts:2171`（`reject()` 呼叫 `updateStatus({status:
  'REJECTED', releasedAt: this.now(), ...})`）屬實。
- 冪等鍵/`eventSeq`/Balance 計算引擎（`confirmedBalance`/`availableBalance`/`asOfEventSeq`/REOPEN 還原）
  確實完全未被觸碰——核對 `balanceService.ts`/`domain/reopenRestoration.ts` 這幾處程式碼，本次改動範圍
  僅止於 Angular 前端兩個顯示層 Service，屬實。

### 8.2 發現的問題——「`releasedAt`／`cancelledAt` 互斥」這個前提不完全成立

§6.5／§7 都主張「`releasedAt`／`cancelledAt` 互斥（一筆 movement 不會同時有兩者）」，這句話對**最終落地
的 DB 資料**是對的，但推導過程掩蓋了一個既有的資料完整性副作用，值得記錄：

**查證**（`microservices/balance-component/src/domain/statusTransition.ts:27-28`）：

```ts
const LEGAL_TRANSITIONS: Record<MovementStatus, Partial<Record<MovementAction, MovementStatus>>> = {
  PENDING: { RELEASE: 'RELEASED', REJECT: 'REJECTED', CANCEL: 'CANCELLED', EDIT: 'PENDING' },
  REJECTED: { CANCEL: 'CANCELLED', EDIT: 'PENDING' },   // ← REJECTED 也能被 CANCEL
  ...
};
```

也就是說一筆先被 Checker REJECT（此時 `released_at` 已被寫入 REJECT 的時間）的交易，之後 Maker 還可以
對它執行 `cancel()`（EC）。查證 `cancel()` 本身（`balanceService.ts:2191-2202`）與
`balanceMovementStore.ts:updateStatus()`（line 442-460 的 SQL）：

```sql
UPDATE balance_movements
SET status = @status, released_by = @releasedBy, released_at = @releasedAt, ...
    cancelled_by = @cancelledBy, cancelled_at = @cancelledAt
WHERE movement_id = @movementId
```

`released_by`/`released_at` 這兩欄是**直接覆寫（plain overwrite），不是 COALESCE**（跟同一個函式裡
`reason_code`/`event_snapshot` 等欄位刻意用 `COALESCE(@param, column)` 保留舊值的寫法不同）。而
`cancel()` 呼叫 `updateStatus()` 時**沒有傳入** `releasedBy`/`releasedAt`，兩者依函式簽章預設綁定為
`null`（`releasedAt: params.releasedAt ?? null`）。

**結果**：REJECTED → CANCELLED 這個合法的既有狀態轉換，會把原本 REJECT 當下寫入的 `released_at`／
`released_by`（「這筆交易何時、被誰 Reject」的稽核紀錄）**覆寫成 `null`**，只留下新的 `cancelled_at`。
`updateStatus()` 自己對 `cancelledBy`/`cancelledAt` 欄位的既有註解寫著「a movement is only ever
transitioned once — status is terminal — so a plain write here...is safe」——這個假設**不成立**，因為
`statusTransition.ts` 自己的狀態機明確允許 REJECTED 之後再轉一次到 CANCELLED。

**對本次功能的實際影響**：一筆先 REJECT、後又被 EC/Cancel 掉的交易，Inquire Events 顯示的
`effectiveEventTime` 會落在 `cancelledAt`（因為 `releasedAt` 已被清空），也就是排序/顯示只反映
「最後一次 EC 的時間」，而「這筆交易何時被 Checker Reject」這個更早、原本應該獨立可查的稽核事實，
在這條路徑上會消失不見——跟 2026-08-20 那次「Submit/EC/Approve 三件事各自獨立可查」的稽核軌跡設計
初衷有落差。

**性質判斷**：這是一個**既有（pre-existing）**的資料完整性問題，不是本次 eventSeq 排序需求新引入的
臭蟲——`updateStatus()` 的這個覆寫行為在今天之前就存在。只是本次新功能（`effectiveEventTime()`）第一
次讓「`released_at` 曾經有值、之後又被清空」這件事，從單純的稽核欄位缺陷，變成會**實際影響排序/顯示
結果**的行為，才讓它變得值得現在处理，而不是繼續放著。三筆新測試都沒有涵蓋「先 REJECT 再 CANCEL」
這個複合情境，所以這個落差沒有被本次的單元測試或瀏覽器驗證抓到。

### 8.3 建議

1. **不阻擋本次上線**——主要業務情境（Submit/Approve 排序）已正確實作且驗證，這個問題是邊緣情境
   （先 Reject 又 EC 掉），發生機率低，也不影響資料正確性以外的任何既有功能。
2. **建議登記一張獨立的技術債/缺陷**（而非塞進本次 §7 的範圍），標題可用「`cancel()` 覆寫
   REJECTED 狀態既有的 `released_at`/`released_by`，遺失 Reject 稽核時間」，修法方向：
   `updateStatus()` 的 `released_by`/`released_at` 兩欄改成跟 `reason_code` 一樣的
   `COALESCE(@param, column)` 寫法（`cancel()` 從不傳這兩個值，COALESCE 後自然保留原值），
   同時補一筆「REJECTED 之後 CANCEL」的 store 層測試釘住這個修正。
3. 待該缺陷修好後，`effectiveEventTime()` 不需要任何改動——`releasedAt ?? cancelledAt ?? createdAt`
   這個 fallback 順序本身沒有問題，問題出在上游欄位被錯誤清空，不是本次排序邏輯設計錯誤。

### 8.4 次要觀察（非缺陷，僅記錄）

`inquire-events.service.ts` 的 `loadIndexRow()`（LC Index 頁「Last Event Date/Time」欄）也是讀
`e.eventTime`，因此本次改動後該欄位語意會一併從「最後一筆交易的 Submit 時間」變成「最後一筆交易的
生效（Release/Reject/Cancel）時間」——這是合理、甚至更正確的副作用，但 §7 的實作紀錄沒有提到這個
下游影響面，補記於此供之後查閱。
