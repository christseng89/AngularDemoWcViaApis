# Balance Component — Maker/Checker 交易處理流程新增需求：Fix Pending／Delete Pending（2026-08-26）

> **文件性質**：業務提出的新交易流程需求，經 BA 對照真實程式碼查證後轉交工程部門評估／實作。查證結果
> ：流程圖本身邏輯一致、與既有 Reject 不刪除交易的既有行為相符；但其中兩個環節（Fix Pending、Maker
> 事後可查看/處理 PENDING／REJECTED 交易）目前**完全沒有實作**，不是「調整既有功能」，而是**全新
> 功能**，請工程部門評估時列入正確的工作量估計，不要當成小改動處理。

## 1. 業務需求原文（逐字保留）

> **Maker / Checker 交易處理流程**
>
> 交易流程應遵循以下規則：
>
> 1. Maker Submit → PENDING
>    * Maker 提交交易後，交易狀態變為 PENDING。
> 2. 交易處於 PENDING 狀態時，可以進行以下處理：
>    * Fix Pending — Maker 修改／修正交易內容後重新提交。
>    * Delete Pending — Maker 刪除／取消該筆 Pending 交易。
>    * Approve / Release — Checker 核准交易，使交易正式生效。
>    * Reject — Checker 拒絕交易，並將交易退回 Maker 處理。
> 3. Checker Reject 後
>    * 交易退回 Maker。
>    * Maker 可以選擇：
>       * Fix Pending → 修正 → Resubmit，再次進入 Checker Approval 流程；或
>       * Delete Pending，取消／刪除該筆交易。
>
> ```text
> Maker Submit
>      │
>      ▼
>    PENDING
>      │
>      ├── Maker → Fix Pending → Resubmit ─────┐
>      │                                       │
>      ├── Maker → Delete Pending → END        │
>      │                                       │
>      ├── Checker → Approve / Release → APPROVED
>      │
>      └── Checker → Reject
>                        │
>                        ▼
>                    退回 Maker
>                        │
>                 ┌──────┴──────┐
>                 ▼             ▼
>            Fix Pending    Delete Pending
>                 │             │
>              Resubmit         END
>                 │
>                 └────→ PENDING → Checker
> ```
>
> **重要 Business Rule**：Checker Reject 不代表交易已取消或刪除。被 Reject 的交易必須退回 Maker，並
> 保留讓 Maker 選擇 Fix Pending 後重新提交，或 Delete Pending 的處理方式。

## 2. BA 查證：目前系統的實際行為（逐項核對，區分「已具備」與「完全未實作」）

依專案慣例，逐一對照真實程式碼，不假設流程圖描述的行為已經存在。結論：**流程圖右半邊（Reject 之後
的 Fix/Delete）在後端狀態機層面已有預留設計，但完全沒有被實際使用；Fix Pending 這個動作從頭到尾不
存在；Maker 事後查看/處理自己 PENDING 或 REJECTED 交易的畫面也不存在。**

### 2.1 已具備、且符合業務規則的部分

- **Maker Submit → PENDING**：`POST /balance-movements`（`routes/balanceMovements.ts:11`）→
  `service.createMovement()`，狀態一律從 `PENDING` 開始，符合。
- **Approve / Release**：`POST /balance-movements/:movementId/release`（同檔案 line 24-28）→
  `service.release()`，`PENDING → RELEASED`，符合。
- **Reject 不代表刪除**（業務特別強調的規則）：`POST /balance-movements/:movementId/reject`
  （line 49-53）→ `service.reject()` → `balanceMovementStore.updateStatus({status: 'REJECTED',
  releasedAt: this.now(), ...})`——是一般 SQL `UPDATE`，**不是 `DELETE`**，交易記錄完整保留在
  `balance_movements` 表裡，只有 `status` 欄位變成 `REJECTED`。**核對屬實**：目前系統本來就沒有把
  Reject 做成刪除，業務這條規則跟現況一致，不需要改動。
- **PENDING → Delete Pending（Maker 自行取消）**：`POST /balance-movements/:movementId/cancel`
  （line 56-61）→ `service.cancel()`，`PENDING → CANCELLED`。同樣是 `UPDATE`，不是實體刪除
  （`cancelledAt`/`cancelledBy` 寫入，記錄保留，供稽核）。**Angular 端**：`maker-panel.component.html:
  802-810` 的「Delete Pending (EC)」按鈕，`*ngIf="submitResult?.status === 'PENDING'"`——**但這裡有
  一個重要限制，見 2.3**。
- **多腿（Compound）交易的 Delete Pending 已處理連動**：`checker-actions.service.ts:161-222`
  （`deleteMakerPending()`）——A3S／B3／B4-Usance／B5 這類「一次提交會產生多筆關聯 movement」的
  功能，EC 時會依「反向於建立順序」依序把關聯的次要／資產分錄也一併 Cancel 掉，避免只刪主分錄、
  留下孤兒分錄。這是既有、已驗證過的邏輯，之後設計 Fix Pending／Reject 後 Delete Pending 時應該
  重用同一套連動判斷，而不是重新設計一次。

### 2.2 完全未實作的部分——「Fix Pending」這個動作，目前系統從頭到尾不存在

這是本次查證最重要的發現。業務流程圖裡的「Fix Pending → Resubmit」在目前系統裡**沒有任何形式的
實作**，證據如下：

1. **後端 API 沒有編輯／修改既有 movement 的路由**——`routes/balanceMovements.ts` 全部路由只有：
   `POST /balance-movements`（新建）、`.../release`、`.../reject`、`.../cancel`、`.../acknowledge`、
   `.../maker-submit`（這是 A4 專用的「finalize 既有 A3/A3S UTILIZE」動作，跟「修改內容後重新提交」
   完全是兩回事）——**沒有 `PUT`/`PATCH`，也沒有任何「edit」/「resubmit」字樣的路由**。
2. **狀態機裡雖然預留了 `EDIT` 動作，但從未被呼叫**——`domain/statusTransition.ts:27-28` 當時的
   `LEGAL_TRANSITIONS` 表格裡，`PENDING`/`REJECTED` 兩個來源狀態都有一個 `EDIT` 分支，但全庫搜尋
   `action: 'EDIT'` 的呼叫點，**結果是零**——這個分支從建立以來就沒有被任何 service 方法用過，是死
   程式碼／預留骨架，不是「已經做了一半」。（後續實作，Fix Pending 已定案為原地修正同一筆記錄，見
   `Balance-Component-FixPending-DeletePending-Proposal-zh.md`。）
3. **Angular 端沒有任何「編輯後重新送出」的 UI**——`maker-panel.component.ts`／`.html` 全文搜尋
   「Fix Pending」「edit」「resubmit」相關字樣，沒有對應的按鈕或表單邏輯。目前 Maker 若要修正一筆
   PENDING 或 REJECTED 交易，只能：先用 Delete Pending／Cancel 整筆作廢，再重新從空白表單開始填寫
   一次全新的交易——**沒有「帶入原內容，只改需要修正的欄位」這種體驗**。

#### 2.2.1 附帶澄清：`ContractStatus` 與 `MovementStatus` 是兩個完全獨立的 enum

`ContractStatus`（LC/Confirmed LC 合約本身的版號狀態）與 `MovementStatus`（單筆交易分錄的狀態）是兩個
完全獨立的 enum，不要混為一談。`ContractStatus` 有一個保留但從未被任何業務功能觸發的
`SUPERSEDED`／`markSuperseded()`（合約版本置換用），與本次業務要的 Fix Pending 無關。Fix Pending
最終定案的做法，是直接原地修正 PENDING／REJECTED 記錄本身（同一筆 `movementId`／`eventSeq`，狀態
回到 PENDING），修正前內容另存到獨立的稽核表，詳見
`Balance-Component-FixPending-DeletePending-Proposal-zh.md`。

### 2.3 完全未實作的部分——Maker 事後查看／處理自己 PENDING／REJECTED 交易的畫面不存在

業務流程圖假設「Checker Reject 後，交易退回 Maker，Maker 可以選擇 Fix Pending 或 Delete Pending」——
這句話隱含一個前提：**Maker 之後某個時間點，要能夠找到那筆被退回的交易並對它採取行動**。查證目前
系統，這個前提**不成立**：

- `deleteMakerPending()`（`transaction-builder.component.ts:481-488`）的按鈕只在
  `this.makerContext.submitResult?.movementId` 存在，且 `submitResult.status === 'PENDING'`
  時才會出現／生效——`submitResult` 是 Maker 提交當下、**同一個瀏覽器分頁的記憶體內狀態**，一旦
  換分頁、換人登入、或隔天再開啟系統，這個物件就不存在了。
- 全專案搜尋（`maker-panel.component.ts`／`.html`、`checker-panel.component.ts`／`.html`）
  **沒有任何「My Pending」「My Rejected」「Maker Queue」這類的清單畫面**——跟既有的「Checker
  Queue」（`checker-panel.component.ts`，Checker 用來找待審交易的清單）不對稱：Checker 有專屬清單
  可以隨時回來處理，Maker 沒有對應的清單可以回來處理自己被退回的交易。
- 目前 Maker 唯一能「看到」自己 PENDING／REJECTED 交易的地方是 Inquire Events（唯讀查詢畫面，
  `inquire-events.service.ts`／`.component.html`）——但這個畫面刻意設計成唯讀（`toReadOnlyFields()`），
  **完全沒有任何操作按鈕**，看得到、動不了。

**結論**：即使 Fix Pending 這個動作本身做出來了，沒有這個「Maker 自己的待處理清單」畫面，Maker 實務上
也無法在 Checker Reject 之後、离開当下畫面之后，回頭找到那筆交易去執行 Fix/Delete——這是本次需求要
真正落地、缺一不可的第三塊拼圖，建議一併排入工程部門的評估範圍，而不是只評估「Fix Pending 這個動作
本身」。

### 2.4 附帶發現：Reject 目前不會連動處理多腿交易的關聯分錄（設計問題，供工程部門評估）

`checker-actions.service.ts:151-159`（`reject()`）只對**主分錄**呼叫 `/reject`，**不像**
`deleteMakerPending()`（2.1 已述）那樣，會依序連動處理 A3S／B3／B4-Usance／B5 這類複合功能的關聯
次要／資產分錄。也就是說，一筆複合交易被 Reject 之後，主分錄變成 REJECTED，但它的關聯分錄可能還停留
在原本的狀態（多半仍是 PENDING，視建立順序而定）——如果之後 Maker 對這筆被 Reject 的主分錄執行
Delete Pending，是否也需要比照 `deleteMakerPending()` 既有的連動邏輯，一併清理關聯分錄？這是一個
既有、非本次業務需求引入的設計缺口，但因為直接關係到「Reject 之後的 Delete Pending 該怎麼做」，
建議工程部門評估本次需求時一併納入考量，不要只處理單腿交易的情境。

## 3. 業務規則正式定義（原文轉錄）

> Checker Reject 不代表交易已取消或刪除。被 Reject 的交易必須退回 Maker，並保留讓 Maker 選擇
> Fix Pending 後重新提交，或 Delete Pending 的處理方式。

## 4. BA 交予工程部門的評估問題

1. **Maker 待處理清單（新畫面，前提工作）**：是否新增一個「My Pending / My Rejected」清單畫面（比照
   既有 Checker Queue 的設計），讓 Maker 能在任何時間點找回自己名下 PENDING／REJECTED 狀態的交易？
   若不做這塊，Fix Pending／Reject 後 Delete Pending 在跨 session／跨天的實務情境下無法真正使用。
2. **Fix Pending 的實作方式**：最終定案（見
   `Balance-Component-FixPending-DeletePending-Proposal-zh.md`）為直接原地修正 PENDING/REJECTED
   記錄本身——同一筆 `movementId`／`eventSeq`（不牴觸 Design doc §8 的冪等鍵設計，因為身份完全不變），
   狀態回到 PENDING；修正前的內容另外存到獨立的稽核表，不與現行記錄混在一起。
3. **Fix Pending 可修改的欄位範圍**：業務原文沒有界定「修正」的範圍是全部欄位，還是僅限特定欄位
   （例如金額、幣別、到期日）。請工程部門會同業務界定，這會直接影響表單設計與驗證邏輯的複雜度。
4. **REJECTED 之後的 Delete Pending — UI 開放範圍**：後端 `/cancel` 本身已經允許
   `REJECTED → CANCELLED`（`statusTransition.ts:28`），純粹是前端 `maker-panel.component.html:804`
   的 `*ngIf="submitResult?.status === 'PENDING'"` 把這個既有能力擋住了。待第 1 點的待處理清單畫面
   做出來後，這裡預期只需要把 `*ngIf` 條件放寬成 `'PENDING' || 'REJECTED'`，工作量很小——但仍要
   確認 A4（2.1 已知的既有特例：A4 沒有自己的可刪除 movement）在 REJECTED 情境下是否也要比照排除。
5. **複合功能（A3S／B3／B4-Usance／B5）的 Reject 連動範圍**：見 2.4——是否要讓 Reject 也比照
   `deleteMakerPending()` 既有邏輯，連動處理關聯分錄？或是保持 Reject 只動主分錄、把連動處理
   延後到 Maker 真正執行 Delete Pending 的那一刻？兩種設計各有取捨，請工程部門評估後提出建議方案。

## 5. 目前狀態

```text
Status: Requirement Registered — Pending Engineering Scoping (NOT a small UI tweak)
Confirmed already correct today: Submit→PENDING, Release, Reject (does not delete the record),
                                  Delete Pending while still PENDING in the same Maker session
                                  (including multi-leg cascade for A3S/B3/B4-Usance/B5).
Confirmed NOT implemented at all: Fix Pending (edit + resubmit) — no API, no UI, no wired EDIT
                                   logic anywhere (state machine has the enum value reserved
                                   but never used). Maker's own persistent Pending/Rejected
                                   queue/inbox — no such screen exists; today's Delete Pending only
                                   works within the same browser session right after Submit.
Flagged for engineering's own scoping: whether Reject should cascade to linked legs the way Cancel
                                   already does, for A3S/B3/B4-Usance/B5.
Balance Component Change: Not yet started — awaiting engineering's scope/effort estimate against
                           §4 above.
```

---

*本文件由 BA 依專案「先查證、後轉交工程」慣例撰寫，內容為新建文件。日後若有後續討論或工程部門回覆，
請依專案 append-only 慣例以日期標注方式附加於本文件末端，不要覆寫以上內容。*

*工程部門對本文件 §4 的評估回覆，另立獨立文件
`Balance-Component-FixPending-DeletePending-Proposal-zh.md`（同目錄），不附加於本文件——依使用者
2026-08-27 明確指示，本次採「獨立建議書」慣例，而非本文件原述的 append-only 慣例。*
