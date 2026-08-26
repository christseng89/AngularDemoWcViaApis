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
