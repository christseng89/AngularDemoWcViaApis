# Balance Component — 餘額數字計算與更新邏輯

> 2026-08-30 同步：現行功能範圍為 A1–A11／B1–B7（A5 保留不用）。Tight Available Balance
> 不得為負；A3S 上限為 Tight Available + selected SG outstanding。現行摘要見
> `../docs/current-behavior.md`。

**範圍**：Current Balance snapshot 上顯示的每一個餘額／預留額數字（Look Up Current Balance、Inquire
Events 的 Balance Tabs、以及每一筆持久化的 Event Snapshot）——五個核心數字 **Confirmed Balance**、
**Available Balance**、**Pending Earmark Total**、**Off-Balance Exposure**、**Tight Available
Balance**，加上三組預留額／子帳分解——**Present Docs Earmark（Pending／Approved）**、**SG（Pending／
Approved）**、**Document Arrival（Pending／Approved）**——以及每一個數字在 **Submit**（Maker，交易狀態
`PENDING`）跟 **Approved**（Checker Release，交易狀態 `RELEASED`）時分別如何更新，涵蓋全部十六個具名業務
功能，A1–A10（Import LC）跟 B1–B6（Export Confirmed LC）。A2 跟 B2 各自拆成獨立的 **Increase** 跟
**Decrease** 子表，因為兩個方向會讓每個數字往相反方向移動。

**權威來源**：`microservices/balance-component/src/domain/balanceDerivation.ts`、
`domain/offBalanceExposure.ts`、`domain/amendDecrease.ts`、`domain/tolerance.ts`，以及
`service/balanceService.ts` 自己的 `assembleSnapshot()`——每一個 snapshot 呈現面（即時的
`GET .../balance`、`createMovement()` 當下擷取的記憶體 snapshot、`release()` 時擷取的那份）都是走這一個
函式。下面每一條公式都是直接引用自這份程式碼，不是重新推導的。

**真正的 API 欄位 vs. 衍生分解——先讀這段再看下面的表格。** 這裡涵蓋的八個數字中，**六個是真正持久化的
`BalanceSnapshot` 欄位**（`confirmedBalance`、`availableBalance`、`pendingEarmarkTotal`、
`offBalanceExposure`、`tightAvailableBalance`，以及——僅限 `EPLC_CONFIRMATION`——
`presentDocsEarmarkPending`／`presentDocsEarmarkApproved`）。**「SG（Pending／Approved）」跟
「Document Arrival（Pending／Approved）」不是獨立的 API 欄位**——`types.ts` 裡完全沒有這樣的欄位。
它們是本文件自己對真正的 `offBalanceExposure` 數字、以及真正的 `pendingEarmarkTotal`／
`confirmedBalance` 數字所做的**衍生分解**，分別依交易狀態拆開，用跟真正欄位完全相同的公式算出來（只是
沒有加總在一起）。之所以列出來，是因為它們能回答「這個真正的數字裡，有多少是來自某一筆 Document
Arrival／Shipping Guarantee，而且目前是還在 Pending 還是已經 Approved」——這是合併後的系統欄位單獨
答不出來的問題，但每一個 A1–A9／B1–B5 的 Maker/Checker 畫面都明顯需要（例如 Event Timeline 自己的
EARMARKING／EARMARKED 狀態標籤，正是這個 Document Arrival Pending/Approved 分解、套用在某一筆特定交易
上的結果）。

---

> **公式變更，2026-08-20（business instruction）。** 數字 #5（**Tight Available Balance**）現在改成
> 從 **Confirmed Balance** 推導，不再是 Available Balance——「Tight Available Balance 應該用 Confirmed
> LC Balance 減其他金額, 因為 APPROVED 才可以動用」（只有真正 APPROVED／RELEASED 的金額才是真正可用的
> 額度）。因此一筆還在 PENDING 的**增額**交易（ISSUE／AMEND_INCREASE／B1／B2-Increase）在被 Approved
> 之前不會再拉高 Tight Available Balance——但一筆還在 PENDING 的**減額**交易（AMEND_DECREASE／
> UTILIZE／B2-Decrease 等）依然在 Submit 當下就立刻扣減，行為不變（「A2 B2 Decrease Submit 後，對
> Tight LC Balance 也是減項」——「占用從寬」，佔用提早計入；「增加從嚴」，增額延後計入）。見新增的
> **Pending Decrease Total** 這一列（#5a）跟下方重寫過的 §5 一般規則。同一輪也順便補上 B2 自己
> Decrease 方向（帶負號 `amount` 的 `AMEND`）原本缺漏的額度檢查——見 §4 自己的說明。下方 §6／§7 每一個
> per-function 表格都遵循這條更新後的規則；本次修訂只有純增額、單筆交易的表格（A1、A2-Increase、
> B1、B2-Increase）有逐一重新核對過——其餘每張表自己的「Tight Available Balance」列請照 §5 的一般規則
> 理解，不要假設每一張都逐行重新稽核過。

> **額度檢查基準，同一天，稍晚一輪（「A2 Decrease 輸入金額控制規則 B2 Decrease, A3 & B3 都適用」——
> 業務端 balance 專家審查後確認）。** `checkAmendDecreaseSufficiency`（A2 自己的 `AMEND_DECREASE` 跟
> B2 自己的 Decrease 方向，§4／§6.2）在 Tight Available Balance 剛引入時，比對的基準是**單純的
> Available Balance**——這是一個真實的漏洞：它會讓一筆 Decrease 把 LC／Confirmation 自己的額度上限縮到
> **低於**目前尚未歸零的表外曝險（用 U01 即時重現：Confirmed 100、SG Outstanding 10、單純 Available
> 100、Tight 90——一筆 95 的 Decrease 以前會通過，只留下 5 的真實額度，但 SG 還有 10 未歸零）。現在改成
> 比對 **Tight Available Balance**，算法跟 `assembleSnapshot()` 本來就在用的每個 instrumentType 對應
> 算法一致（`IPLC_LC`／`EPLC_LC` 用 SHGT 曝險，`EPLC_CONFIRMATION` 用 Present Docs Earmark）——這樣就
> 跟 A3／A3S 自己的 `checkUtilizeSufficiency`、B3 自己的 `checkPresentDocsIssueSufficiency` 一致了，
> 這兩個從上面那次公式變更開始就已經是用 Tight 為基準。**A8 自己的 `checkShgtIssueSufficiency`**（SG
> Issue 金額上限鎖定在母 LC 自己的額度，見下方 §6）**本來就**在這次修訂之前已經是用 Tight 為基準——
> 這次修訂只是把它自己表格的文字說明從誤植的「Available Balance」訂正過來，不是行為改變。

> **Off-Balance Exposure 基準，同一天，稍晚一輪（「SG 贖回提早放行」業務情境，接著是「A35 Refer to
> S02 G02 Tight Available Balance -8000???」）。** 數字 #4（**Off-Balance Exposure**）以前只要一筆
> `PARTIAL_REDEEM`／`FULL_REDEEM` 一經 Maker-Submitted（`PENDING`）就立刻淨額，跟真的
> `RELEASED` 一樣待遇——這是一個真實漏洞，跟上面 AMEND_DECREASE 那個對稱：一筆 standalone 的 A9 贖回
> 已經 Maker-Submitted 但 Checker 還沒核准，就可能讓**另一筆**不相關的 SG Issue（A8）或 Document
> Arrival（A3）通過，佔用了實際上根本還沒真正釋放的額度——如果 Checker 之後拒絕了那筆贖回，銀行就會
> 超過真實的 LC 額度，而且完全是因為系統自己在核准之前就先放行了額度。現在只有真正 **RELEASED** 才會
> 淨額（「增加從嚴，對 LC Balance 而言」）——**唯一的例外**是跟同一張 LC 上還在 PENDING 的
> 某筆 `UTILIZE` 共用 `businessEventId` 的贖回（A3S 自己的配對複合交易——見下方 A3S 自己的表格）：
> 這一種情況依然從 Submit 就開始淨額，因為兩腿一定是一起 Release（或失敗時一起自動回滾），所以不存在
> 跨交易外洩的風險，把它們當成一個重分類事件而不是獨立的「增額」來處理是安全的。A8 自己的表格（§6）
> 已訂正，不再宣稱一筆 standalone 贖回「立即反應」——它現在跟其他任何真正增加可用額度的動作一樣，只在
> Checker Release 時才反應。

> **Present Docs Earmark 基準，同一天，跟上面那條 Export 側的對應版本（「B4 U02 也有類似問題 Tight
> Available Balance -10000」）。** 數字 #6／#7（**Present Docs Earmark Pending／Approved**）以前
> 即使有一筆引用它（`referencedTransactionId`）的 B4 已經 Maker-Submitted、`PENDING`，還是會把一筆
> 已經 RELEASED 的 B3 交單全額計入——顯示成 `-10000` 而不是 `0`，即使 B4 自己消費掉這筆特定交單早就是
> 一旦 Submitted 就注定會發生、自我平衡的結論（不像另一個真正獨立的、之後才做的 Checker 決定）。現在
> 一筆還在 PENDING 的 B4，從它自己被 Submitted 的那一刻起，就會暫時性地把它引用的 B3 記錄從數字 #7
> 移出，不必等到 B4 被 Approved 才移出——跟上面 SG 那條筆記的處理方式相同，也一樣受
> 「增加從嚴，對 LC Balance 而言」這條規則約束：這種暫時性淨額**只**套用在 `assembleSnapshot()`
> （即時／持久化的餘額顯示）上；B3 自己新交單的額度檢查、跟 B2-Decrease 自己的額度檢查，兩者都依然
> 對著未淨額的嚴格數字檢查，所以一筆真正獨立的交易永遠不會受益於另一筆交易自己的暫時性淨額。詳見下方
> §7 的 B3／B4 自己的表格。

> **新增 A10／B6 Close，2026-08-21。** 新的 movementType，`CLOSE`（僅限 `IPLC_LC`／`EPLC_LC`／
> `EPLC_CONFIRMATION`），把剩餘的 Confirmed Balance 全部沖銷，並把這個 Logical Contract 退休
> （`ContractStatus.CLOSED`，設計之初就保留了這個狀態值，但之前從來沒有真正能到達過——見
> `domain/closeEligibility.ts`）。方向跟 AMEND_DECREASE／UTILIZE 一樣（`-1`——見更新過的 §3 表格），
> Submit 對 Approved 的一般行為模式也跟任何其他減額型交易一樣（§5 的一般規則），但有兩條這筆交易獨有的
> 規則：`amount` 在 Submit 時必須逐位元組等於當下的 Confirmed Balance（可以是零，絕不能是負數），資格
> 條件（尚未 Closed；SG 跟 Acceptance 的 Confirmed Balance 都恰好是 0；整棵事件樹裡沒有任何未結束的
> Event）在 Submit **跟 Approve 都會檢查一次**，因為這段期間資格有可能失效。見 §6／§7 結尾各自的
> A10／B6 表格。

> **A9 鎖定為 Full Redeem only，2026-08-21**（BA 確認，`TF_Balance_Component_Mapping-{en,zh}.xlsx`
> Rule #1——「SG discharge is instrument-based, not amount-based」）。A9 自己的 Amount 欄位現在被保護
> （disabled），直接帶入 SG 的 Available Balance——`PARTIAL_REDEEM` 已經不可能透過這個功能送出；A9
> 自己表格（§6）裡的 `ceilingAmount` 因此永遠是全額未歸零的數字。沒有任何公式改變——這只是
> reference-client（Angular）層面的範圍限制；A3S 自己配對、真正部分金額的贖回腿是完全獨立的一條程式
> 路徑，不受影響。詳見 A9 自己的段落。
>
> **後續補充（2026-08-24）**：上一句「reference-client only」的敘述已經過時——伺服器端現在也真的擋
> 了。standalone（無 `businessEventId`）的 SHGT `PARTIAL_REDEEM` 現在在 `service/balanceService.ts`
> 的 Maker Submit（`outstandingCapped` sufficiency check）跟 Checker Release 兩處都會被拒絕
> （`409`）；A3S 自己配對、帶 `businessEventId` 的部分贖回不受影響。詳見
> `Balance-Component-Business-Rule-Decisions-2026-08-21.md` 自己的 2026-08-24 狀態更新段落、
> `CLAUDE.md` 決策日誌對應條目、OAS v1.18.0 changelog。

## 1. 五個核心數字——精確公式

全部五個都是**在查詢當下，從一份 `BalanceContract` 的完整交易歷史即時算出來的**——沒有一個是直接存在
合約列上的。每一條公式加總的都是 `ceilingAmount`（絕不是原始的 `amount`）；`ceilingAmount` 本身怎麼算
見 §3。

| # | 數字 | 公式 | 適用範圍 |
|---|---|---|---|
| 1 | **Confirmed Balance** | Σ **RELEASED** 交易的 `ceilingAmount` × 方向（`MOVEMENT_DIRECTION` 表，§2） | 每個 instrumentType |
| 2 | **Available Balance** | Confirmed Balance ＋ Σ **PENDING** 交易的 `ceilingAmount` × 方向 | 每個 instrumentType |
| 3 | **Pending Earmark Total** | Available Balance − Confirmed Balance（也就是淨 PENDING 增減量，帶正負號） | 每個 instrumentType |
| 4 | **Off-Balance Exposure** | Σ（**PENDING**＋**RELEASED**）子項 SHGT `ISSUE` − Σ（**RELEASED**，加上跟同一張 LC 上還在 PENDING 的某筆 `UTILIZE` 共用 `businessEventId` 的任何 **PENDING** 贖回——僅限 A3S 自己配對的複合交易腿）子項 SHGT `PARTIAL_REDEEM`／`FULL_REDEEM` | **僅限** `IPLC_LC`／`EPLC_LC`——其他所有 instrumentType 都是 `null` |
| 5a | **Pending Decrease Total**（*新增，不是持久化欄位*） | Σ 同一份合約上 **PENDING** 交易的 `ceilingAmount`，只算那些 `MOVEMENT_DIRECTION` 帶正負號後貢獻為負的（絕不會跟同一份合約上的 PENDING 增額互相沖銷） | 每個 instrumentType，但只有 #5 會用到它 |
| 5 | **Tight Available Balance** | `IPLC_LC`／`EPLC_LC`：Confirmed − Pending Decrease Total − Off-Balance Exposure。`EPLC_CONFIRMATION`：Confirmed − Pending Decrease Total − （Present Docs Earmark Pending ＋ Approved 合計）。 | **僅限** `IPLC_LC`／`EPLC_LC`／`EPLC_CONFIRMATION`——其他所有 instrumentType 都是 `null` |

## 2. 三組預留額／子帳分解

| # | 數字 | 公式 | 是真正的欄位嗎？ | 適用範圍 |
|---|---|---|---|---|
| 6 | **Present Docs Earmark（Pending）** | Σ **PENDING**、尚未 `presentDocsConsumedAt` 的 `EPLC_EXAMINATION` `CREATE` `ceilingAmount`，排除任何已經被一筆還在 PENDING 的 B4 暫時性引用的記錄（僅供顯示；見上方 banner 說明——實務上永遠是 `0`，因為一筆 PENDING 的 B3 不可能被 B4 引用） | **是**——`presentDocsEarmarkPending` | 僅限 `EPLC_CONFIRMATION` |
| 7 | **Present Docs Earmark（Approved）** | Σ **RELEASED**、尚未 `presentDocsConsumedAt` 的 `EPLC_EXAMINATION` `CREATE` `ceilingAmount`，排除任何已經被一筆還在 PENDING 的 B4 暫時性引用的記錄（`derivePresentDocsProvisionallyConsumedIds()`——僅供顯示，發生在 `assembleSnapshot()`；B3 自己的、跟 B2-Decrease 自己的額度檢查都維持嚴格／未淨額） | **是**——`presentDocsEarmarkApproved` | 僅限 `EPLC_CONFIRMATION` |
| 8 | **SG（Pending）**（*衍生*） | Σ **PENDING** 子項 SHGT `ISSUE` `ceilingAmount` − Σ 跟同一張 LC 上還在 PENDING 的某筆 `UTILIZE` 共用 `businessEventId` 的 **PENDING** 子項 SHGT `PARTIAL_REDEEM`／`FULL_REDEEM` `ceilingAmount`（僅限 A3S 自己配對的複合交易腿——跟 #4 相同的例外；一筆 standalone／未配對的 PENDING 贖回在這裡也不會扣減，維持跟 #4 一致的「增加從嚴」規則） | 否——`offBalanceExposure` 的 PENDING 半部 | `IPLC_LC`／`EPLC_LC`（顯示在母 LC 上） |
| 9 | **SG（Approved）**（*衍生*） | Σ **RELEASED** 子項 SHGT `ISSUE` `ceilingAmount` − Σ **RELEASED** 子項 SHGT `PARTIAL_REDEEM`／`FULL_REDEEM` `ceilingAmount` | 否——`offBalanceExposure` 的 RELEASED 半部 | `IPLC_LC`／`EPLC_LC`（顯示在母 LC 上） |
| 10 | **Document Arrival（Pending）**（*衍生*） | 那一筆特定 Document Arrival `UTILIZE` 交易自己的 `ceilingAmount`，在它自己狀態還是 **PENDING** 時（UI 標籤：**EARMARKING**） | 否——那一筆交易自己對 `pendingEarmarkTotal` 的貢獻裡的 PENDING 那一半 | 僅限 `IPLC_LC`（Import 側；Export 的對應概念是上面的 Present Docs Earmark） |
| 11 | **Document Arrival（Approved）**（*衍生*） | 同一筆交易自己的 `ceilingAmount`，一旦透過 A4／A6 真正 **RELEASED**（UI 標籤：**EARMARKED**） | 否——到這個時候它已經併入 `confirmedBalance` 了；這一列追蹤的是*那一筆特定交易*自己的狀態，不是一個獨立的帳本 | 僅限 `IPLC_LC` |

**#8 ＋ #9 永遠加總等於 `offBalanceExposure`（#4）。** **#6 ＋ #7 永遠加總等於 `tightAvailableBalance`
（#5）在 `EPLC_CONFIRMATION` 時扣減的那個合併數字。** #10 跟 #11 都不能跟任何其他數字相加——它們描述
的是某一筆特定交易自己的生命週期，不是一個持續累加的總數。

## 3. 交易方向表（`MOVEMENT_DIRECTION`）

每一筆交易對 Confirmed／Available Balance 的貢獻，是它自己的 `ceilingAmount` 乘上一個固定的 **+1**
（增加餘額）或 **−1**（減少餘額），依 `movementType` 決定：

| Instrument 家族 | movementType | 方向 |
|---|---|---|
| `IPLC_LC` / `EPLC_LC` | `ISSUE` | **+1** |
| | `AMEND_INCREASE` | **+1** |
| | `AMEND_DECREASE` | **−1** |
| | `UTILIZE` | **−1** |
| `IPLC_ACCEPTANCE` / `EPLC_ACCEPTANCE` | `CREATE` | **+1** |
| | `PARTIAL_SETTLE` / `FULL_SETTLE` | **−1** |
| `SHGT` | `ISSUE` | **+1** |
| | `PARTIAL_REDEEM` / `FULL_REDEEM` | **−1** |
| `EPLC_CONFIRMATION` | `AMEND`（方向由 `amount` 的正負號決定，不只靠這張表） | **+1** |
| | `HONOUR` / `ACCEPT` | **−1** |
| `EPLC_DUE_FROM_ISSUING_BANK` / `EPLC_ACCEPTANCE_REIMB_RECEIVABLE` | `CREATE` | **+1** |
| | `REIMBURSE` / `RECLASSIFY_OUT` | **−1** |
| `EPLC_EXAMINATION`（B3） | `CREATE` | — 完全不貢獻 Confirmed／Available；見 B3 自己的段落 |
| `IPLC_LC` / `EPLC_LC` / `EPLC_CONFIRMATION` | `CLOSE`（A10／B6，2026-08-21 新增） | **−1** |

## 4. Tolerance／`ceilingAmount` 轉換

`ceilingAmount = amount × (1 + tolerancePct / 100)`——**只有**同時滿足以下兩個條件才套用：

- **instrumentType** 是 `IPLC_LC`、`EPLC_LC`、或 `EPLC_CONFIRMATION`（絕不是 SHGT／Acceptance——
  它們的金額永遠是自己的面額，業務端已確認），而且
- **movementType** 是 `ISSUE`、`AMEND_INCREASE`、`AMEND_DECREASE`、或 `AMEND`。

其他每一種 instrumentType／movementType 組合都是 `ceilingAmount = amount` 原封不動。這直接影響 A1／A2
（`IPLC_LC`）、B1／B2（`EPLC_CONFIRMATION`）——A3／A3S／A4／A6／A7／A8／A9／B3／B4／B5 永遠不套用
Tolerance，即使它們自己的合約剛好帶有 `tolerancePct` 值。

**2026-08-20 補上的漏洞（BA balance-check 審查）。** B2 沒有獨立的 `AMEND_INCREASE`／
`AMEND_DECREASE` movementType——只有一個 `AMEND`，方向靠 `amount` 的正負號決定（§2）——而它的
Decrease 方向**原本完全沒有額度檢查**（被歸類在真正不檢查的 ISSUE／AMEND_INCREASE／CREATE 那一群），
跟 A2 自己的 `AMEND_DECREASE`（由 `checkAmendDecreaseSufficiency` 檢查，§6.2）不一致。B2 自己的
Decrease（`AMEND` 帶負號的 `ceilingAmount`）現在會依大小跑同樣的下限檢查。

**基準收緊，同一天，稍晚一輪（「A2 Decrease... B2 Decrease, A3 & B3 都適用」）。**
`checkAmendDecreaseSufficiency` 本身的比對基準從單純的 Available Balance 改成 **Tight Available
Balance**——完整理由見本節上方第二則 banner 說明（一筆 Decrease 原本可能把 LC／Confirmation 自己的
額度上限縮到低於自己尚未歸零的表外曝險）。同樣套用在 A2 自己的 `AMEND_DECREASE` 跟 B2 自己的
Decrease 方向上——絕不能低於已經動用的部分，**也**絕不能低於尚未歸零的表外曝險（A2 是 SHGT，B2 是
Present Docs Earmark）。

## 5. Submit vs. Approved——一般規則（先讀這段再看各功能表格）

對**任何單一、非複合的交易**（一份合約、一列、沒有連動腿），把「同一筆」交易從 `PENDING` →
`RELEASED`，會有一個非常特定、不直覺的效果：

- **Confirmed Balance**——在 Submit 時不受影響（只有 RELEASED 才算數）；在 Approval 時依帶正負號的
  完整 `ceilingAmount` 移動。
- **Available Balance**——在 **Submit 當下就**依帶正負號的完整 `ceilingAmount` 移動（PENDING 本來就
  已經計入 Available）；**在 Approval 時停在同樣的總值**——這筆交易自己的貢獻只是從「Σ PENDING」這一
  項遷移到「Confirmed Balance」這一項，淨額不變。**單筆交易被 Release 時，Available Balance 真的不會
  改變**——只有它內部的組成改變。
- **Pending Earmark Total**（= Available − Confirmed）——在 Submit 時依帶正負號的 `ceilingAmount`
  移動；在 Approval 時回到 Submit 之前的值。
- **Tight Available Balance**（2026-08-20 公式，#5／#5a）——一筆**增額**型交易（ISSUE／
  AMEND_INCREASE／B1／B2-Increase）在 Submit 時對 Tight 沒有任何影響（Confirmed 還沒動），**只有在
  Approval 時**才會拉高，行為跟 Confirmed Balance 自己那一列一模一樣（「增加從嚴」）。一筆**減額**型
  交易（AMEND_DECREASE／UTILIZE／B2-Decrease 等）則透過 Pending Decrease Total **在 Submit 當下就
  立刻**拉低 Tight，然後一路維持在同樣拉低的值直到 Approval——這筆交易自己的貢獻從
  「Pending Decrease Total」遷移到「Confirmed」，淨額不變，跟 Available Balance 自己那一列同一種
  形狀（「占用從寬」）。Off-Balance Exposure／Present Docs Earmark 本來就從 Submit 開始就把自己的
  PENDING 貢獻算進去了（下面兩點）——Tight 這次改成以 Confirmed 為基準的變化，不影響這兩者自己的
  行為，只影響 LC／Confirmation *自己*的 pending 項目怎麼被計算。
- **Off-Balance Exposure／SG（Pending）／SG（Approved）**——兩個方向不對稱（這裡一樣套用
  「增加從嚴，占用從寬」）。**A8（ISSUE，增額）**：合併數字（#4）**在 Submit 時**反應，Release 時
  不會再反應第二次——但兩個拆開的半部（#8／#9）在 Release 時依然會在彼此之間真的搬動（Pending 減少，
  Approved 依同樣金額增加），總和維持不變。**A9（REDEEM，曝險的減額——也就是可用額度的增額）**：
  standalone 的情況下，合併數字完全不在 Submit 時反應——#4 跟它自己的 #8 半部都維持不變，直到真正
  Approved 那一刻，#4 才下降、#8→#9 才真的搬動；**唯一的例外**是 A3S 自己配對的複合交易腿（贖回跟一筆
  還在 PENDING 的 `UTILIZE` 共用 `businessEventId`），這種情況跟 A8 一樣在 Submit 就反應，因為兩腿
  一定是一起 Release 或一起回滾。見 A8／A9／A3S 自己的表格。
- **Present Docs Earmark（Pending）／（Approved）**——跟上面 SG 一樣「在兩個桶子之間搬動，合併總數
  不變」的形狀，但發生在 B3 自己的 Release 上（不是 Submit）——見 B3 自己的表格。
- **Document Arrival（Pending）／（Approved）**——單一筆交易自己的 Pending 金額，只有在 A4／A6 真正
  完成最終化那一刻才會完全搬到 Approved——絕不會在 A3／A3S 自己的 Submit 發生，也絕不會在 A3 自己的
  Checker「Approve」發生（只是確認動作，不是真正的 Release——見 A3 自己的表格）。這個確認動作本身自
  2026-08-20 起再次真正被持久化（「A3 A3S 交易 Approve 過後 不要再顯示」——`acknowledgedBy`／
  `acknowledgedAt`，恢復使用 B3 自己在 2026-08-18 改版前用過的同一條 `POST .../acknowledge` 路由，
  現在改成套用在 A3／A3S 的 `UTILIZE` 上）：Checker Queue（該合約上每一筆 PENDING 交易）現在會排除
  已經有 `acknowledgedAt` 的項目，所以一筆已經 Approve 過的 A3／A3S Document Arrival 不會再重複出現，
  不必等到 A4／A6 完成最終化才消失。同一天也統一套用到其他每一個功能（「純粹 APPROVE PENDING 交易,
  APPROVED 後該筆交易應該消失, 不能重複 APPROVED」）：一般的 Release／Reject（A2 等）原本就已經正確地
  把交易自己的 `status` 從 `PENDING` 移開，但 Checker Queue 已經抓好的清單從來沒有重新抓取過——現在
  每一次成功的 Checker 動作都會原地重新載入。

  **同一天新增了真正的 4-eyes 閘門**（「A4 選取 EARMARKED 的交易」／「PENDING 或 EARMARKING 狀態的
  交易不得出現在下一個交易中」）：A4／A6 自己的 picker（LC 層級的 Step-1 清單跟指定記錄的 Step-2
  清單都算）現在要求候選的 UTILIZE 必須已經是 EARMARKED（`acknowledgedAt` 已設定）——一筆還在
  EARMARKING（已 Maker-Submitted 但 Checker 還沒確認）的完全不會出現在那裡可選。`displayStatus()` 在
  `acknowledgedAt` 一被設定就顯示 EARMARKED，即使 `status` 本身還是 `PENDING`（真正的最終化依然是
  A4／A6 自己的工作）——這正是 picker 自己的資格檢查現在依據的東西。A4 的 Checker Search 也是同一套
  邏輯的鏡像：現在只顯示 EARMARKED 的 UTILIZE 候選（排除還在 EARMARKING 的），而 A3／A3S 自己的
  Checker Search 剛好相反——排除已經 EARMARKED 的，因為 A3／A3S 自己的 Checker 對它已經沒有事可做了。
  A4 自己的 picker 另外還會排除它自己已經 Maker-Submitted 過的 UTILIZE（`makerSubmittedAt` 已設定）
  ——A4 自己的 Maker 步驟對它也沒有事可做了。

**複合功能**（A3S、A6、B4、B5）**一次會動到不只一份合約的列**——下面各自的表格會逐腿明講。

---

## 6. Import LC 功能（A1–A10）

### A1 — LC Issue（`IPLC_LC` / `ISSUE`）

新建一份全新的 Logical Contract。沒有母合約，沒有連動腿。套用 Tolerance（§4）。

| 數字 | Submit 時（PENDING） | Approved 時（RELEASED） |
|---|---|---|
| Confirmed Balance | 不變 | **+= ceilingAmount** |
| Available Balance | **+= ceilingAmount** | 不變（已經反映過了） |
| Pending Earmark Total | **+= ceilingAmount** | 這筆交易的貢獻歸零 |
| Off-Balance Exposure | 不受影響（還沒有 SHGT 子項） | 不受影響 |
| Tight Available Balance | 不變（2026-08-20：現在追蹤 Confirmed，不是 Available——一筆還沒 Approved 的 ISSUE 還不是可用額度） | **+= ceilingAmount** |
| Present Docs Earmark（P/A） | N/A——Import 側 | N/A |
| SG（Pending／Approved） | N/A——這張 LC 底下還沒開過 SG | N/A |
| Document Arrival（Pending／Approved） | N/A——不是 `UTILIZE` | N/A |

### A2 — LC Amendment（`IPLC_LC` / `AMEND_INCREASE` 或 `AMEND_DECREASE`）

方向是明確選出來的（一個 `subChoice` 下拉選單），決定送出哪個 `movementType`——**不是**靠 `amount` 的
正負號。套用 Tolerance。Decrease 在 Submit 時額外會被檢查：它自己的 `ceilingAmount` 不能超過當下的
**Tight** Available Balance（2026-08-20，從單純的 Available Balance 改基準——見 §4 自己的
「基準收緊」說明）——絕不能低於已經動用的部分，也絕不能低於尚未歸零的表外（SHGT）曝險。

#### A2 — Increase（`AMEND_INCREASE`）

| 數字 | Submit 時（PENDING） | Approved 時（RELEASED） |
|---|---|---|
| Confirmed Balance | 不變 | **+= ceilingAmount** |
| Available Balance | **+= ceilingAmount** | 不變（已經反映過了） |
| Pending Earmark Total | **+= ceilingAmount** | 歸零 |
| Off-Balance Exposure | 不受影響 | 不受影響 |
| Tight Available Balance | 不變（2026-08-20：現在追蹤 Confirmed，不是 Available） | **+= ceilingAmount** |
| Present Docs Earmark（P/A） | N/A | N/A |
| SG（Pending／Approved） | 不受這筆交易影響 | 不受影響 |
| Document Arrival（Pending／Approved） | N/A | N/A |

#### A2 — Decrease（`AMEND_DECREASE`）

| 數字 | Submit 時（PENDING） | Approved 時（RELEASED） |
|---|---|---|
| Confirmed Balance | 不變 | **−= ceilingAmount** |
| Available Balance | **−= ceilingAmount** | 不變（已經反映過了） |
| Pending Earmark Total | **−= ceilingAmount** | 歸零 |
| Off-Balance Exposure | 不受影響 | 不受影響 |
| Tight Available Balance | **−= ceilingAmount** | 不變 |
| Present Docs Earmark（P/A） | N/A | N/A |
| SG（Pending／Approved） | 不受這筆交易影響 | 不受影響 |
| Document Arrival（Pending／Approved） | N/A | N/A |

### A3 — Document Arrival（`IPLC_LC` / `UTILIZE`，plain——沒有配對的 Shipping Guarantee）

**不套用 Tolerance。** Submit 時的額度檢查是兩層的 `checkUtilizeSufficiency()`（先比對 Available
Balance，再比對 Tight Available Balance）。

| 數字 | Submit 時（PENDING） | Checker 的「Approve」時（只是確認動作——status 依然停在 PENDING） |
|---|---|---|
| Confirmed Balance | 不變 | **不變——A3 自己的 Checker 動作從來不呼叫真正的 release endpoint** |
| Available Balance | **−= ceilingAmount** | 不變（Approve 不是真正的 Release） |
| Pending Earmark Total | **−= ceilingAmount** | 不變 |
| Off-Balance Exposure | 不受影響（plain A3，沒有 SG 配對） | 不受影響 |
| Tight Available Balance | **−= ceilingAmount** | 不變 |
| Present Docs Earmark（P/A） | N/A | N/A |
| SG（Pending／Approved） | 不受影響 | 不受影響 |
| **Document Arrival（Pending）** | **+= ceilingAmount**（EARMARKING） | **維持同樣的值——依然是 EARMARKING** |
| **Document Arrival（Approved）** | 0 | **維持 0——真正的最終化是 A4／A6 自己的工作，不是 A3 的 Approve** |

### A3S — Document Arrival w/ Shipping Gtee（`IPLC_LC` / `UTILIZE`，跟一筆尚未歸零的 SG 配對）

**一起建立兩筆交易**（共用一個 `businessEventId`）：LC 自己的 `UTILIZE`（`req`）**加上**配對的 SG
自己的 `FULL_REDEEM`／`PARTIAL_REDEEM`（金額 = MIN(到單金額, SG 自己的 Available Balance)），送出
順序是 SG 先。Checker Release 會真正釋放 SG 那一腿；LC 自己的 `UTILIZE` 依然停在 PENDING。

| 數字 | Submit 時（兩腿都 PENDING） | Checker Release 時（SG 腿真正 released；LC 腿依然 PENDING） |
|---|---|---|
| LC 的 Confirmed Balance | 不變 | **不變——跟 A3 相同的例外，LC 腿在這裡永遠不會被 release** |
| LC 的 Available Balance | **−= UTILIZE 的 ceilingAmount** | 不變 |
| SG 的 Confirmed Balance | 不變 | **−= 贖回的 ceilingAmount** |
| SG 的 Available Balance | **−= 贖回的 ceilingAmount** | 不變（已經反映過了） |
| LC 的 Off-Balance Exposure（合併） | **在 Submit 時就 −= 贖回的 ceilingAmount**（PENDING 的贖回立刻計入） | 不變——合併總數已經淨額過了 |
| **LC 的 SG（Pending）** | **−= 贖回的 ceilingAmount** | **回復（+= 加回去）**——移出 Pending |
| **LC 的 SG（Approved）** | 不受影響 | **−= 贖回的 ceilingAmount**——移入 Approved（RELEASED）桶 |
| LC 的 Tight Available Balance | **淨變動量 = （贖回的 ceilingAmount − UTILIZE 的 ceilingAmount）**——SG 自己保留的額度被釋放回來（透過上面的 Off-Balance Exposure 淨額，**+= 贖回的 ceilingAmount**），但 LC 自己的 UTILIZE 在同一次 Submit 同時把 Pending Decrease Total 全額佔用（**−= UTILIZE 自己的 ceilingAmount**）；因為贖回腿的上限被 MIN 鎖在 SG 自己的 Available Balance，永遠不可能超過 UTILIZE 自己的 ceilingAmount，所以**合併淨效果永遠是向下或持平，絕不會是純增額**——這一列以前的「增額」描述，其實只講了 Off-Balance Exposure 那一側單獨看的情況，不是合併後真正的數字。業務端已確認的即時範例（S02/G02，這次修復就是用這個業務訊息命名的）：LC 10,000／SG 8,000 已開／到單金額 10,000 → Tight 從 **2,000 移動到 0**，淨變動 **−2,000**，不是增額（「這交易SUBMIT 後 Pending Earmark Total = +8,000 (SG Balance) − 2,000 (LC Balance)」）。 | 不變——合併總數在 Submit 時已經淨額過了 |
| Present Docs Earmark（P/A） | N/A | N/A |
| **LC 的 Document Arrival（Pending）** | **+= UTILIZE 的 ceilingAmount**（EARMARKING） | **不變——依然是 EARMARKING**，之後由 A4／A6 完成最終化 |
| LC 的 Document Arrival（Approved） | 0 | 0 |

### A4 — Sight Settlement（不建立新交易——完成一筆既有的 A3／A3S `UTILIZE`）

**Maker Submit（`submitA4()`）只寫入 `makerSubmittedBy`／`makerSubmittedAt`**，寫在原本就已經
PENDING 的那筆交易上——沒有新交易，沒有任何餘額變動。緊接著的 Checker Release 才是那同一筆
`UTILIZE` 真正的最終化（門檻是必須先設定 `makerSubmittedAt`）。

| 數字 | Maker Submit 時（只是寫 metadata，status 依然是 PENDING） | Checker Release 時（RELEASED） |
|---|---|---|
| Confirmed Balance | 不變 | **−= UTILIZE 的 ceilingAmount** |
| Available Balance | 不變 | 不變（從最早 A3 的 Submit 就已經反映過了） |
| Pending Earmark Total | 不變 | 這筆交易的貢獻歸零 |
| Off-Balance Exposure | 不受影響（僅限 Sight，永遠不碰 SHGT） | 不受影響 |
| Tight Available Balance | 不變 | 不變 |
| Present Docs Earmark（P/A） | N/A | N/A |
| SG（Pending／Approved） | 不受影響 | 不受影響 |
| **Document Arrival（Pending）** | 不變，依然是 EARMARKING | **−= ceilingAmount——降到 0** |
| **Document Arrival（Approved）** | 0 | **+= ceilingAmount——這裡就是 EARMARKING 變成 EARMARKED 的地方** |

### A6 — Acceptance, Usance（`IPLC_ACCEPTANCE` / `CREATE`——複合式 Checker Release）

Maker Submit **只**建立新的 Acceptance 合約自己的 `CREATE`（PENDING）——來源 LC 自己的 `UTILIZE`
（來自 A3）是挑選出來的，不是重新送出。Checker Release 是複合式的：先釋放來源 Document Arrival，
再釋放新的 Acceptance `CREATE`。

| 數字 | Submit 時 | Checker Release 時 |
|---|---|---|
| LC 的 Confirmed Balance | 不變 | **−= 來源 UTILIZE 的 ceilingAmount** |
| LC 的 Available Balance | 不變（從 A3 自己的 Submit 就已經反映過了） | 不變 |
| Acceptance 的 Confirmed Balance | 不變 | **+= ceilingAmount** |
| Acceptance 的 Available Balance | **+= ceilingAmount** | 不變（已經反映過了） |
| Off-Balance Exposure（任一合約） | 不受影響——Acceptance 在 UTILIZE 當下就已經減少過 LC Balance，SHGT 式的重複計算不在範圍內 | 不受影響 |
| Tight Available Balance（LC） | 不受這個功能直接影響 | 不受影響 |
| Present Docs Earmark（P/A） | N/A | N/A |
| SG（Pending／Approved） | 不受影響 | 不受影響 |
| **LC 的 Document Arrival（Pending）** | 不變，依然是 EARMARKING（由更早的 A3／A3S 設定） | **−= ceilingAmount——降到 0** |
| **LC 的 Document Arrival（Approved）** | 0 | **+= ceilingAmount——EARMARKING 變成 EARMARKED** |

### A7 — Acceptance Settlement（`IPLC_ACCEPTANCE` / `FULL_SETTLE` 或 `PARTIAL_SETTLE`）

結清一筆既有的 Acceptance（到期日或之前）。**絕不碰母 LC 自己的 Balance。** 不套用 Tolerance。

| 數字 | Submit 時 | Approved 時 |
|---|---|---|
| Acceptance 的 Confirmed Balance | 不變 | **−= ceilingAmount** |
| Acceptance 的 Available Balance | **−= ceilingAmount** | 不變（已經反映過了） |
| Pending Earmark Total | **−= ceilingAmount** | 歸零 |
| Off-Balance Exposure／Tight Available | `null`（不是 `IPLC_LC`／`EPLC_LC`） | `null` |
| Present Docs Earmark（P/A） | N/A | N/A |
| SG（Pending／Approved） | N/A | N/A |
| Document Arrival（Pending／Approved） | N/A——這是 Acceptance 側，不是 LC 自己的 UTILIZE | N/A |

### A8 — Shipping Gtee Issue（`SHGT` / `ISSUE`）

金額上限鎖在母 LC 自己 Submit 當下的 **Tight** Available Balance（先淨額任何已經未歸零的 SG 曝險——
`checkShgtIssueSufficiency`，從最早的 2026-08-20 公式變更起就已經是 Tight 基準；這一行只是把之前誤植
的「Available Balance」文字訂正過來，行為本身沒變）。不套用 Tolerance。

| 數字 | Submit 時（PENDING） | Approved 時（RELEASED） |
|---|---|---|
| SG 的 Confirmed Balance | 不變 | **+= ceilingAmount** |
| SG 的 Available Balance | **+= ceilingAmount** | 不變（已經反映過了） |
| **母 LC 的 Off-Balance Exposure（合併）** | **+= ceilingAmount——立即反應** | **不變——合併總數不會再反應第二次** |
| **母 LC 的 SG（Pending）** | **+= ceilingAmount** | **這筆交易的貢獻歸零**——移出 Pending |
| **母 LC 的 SG（Approved）** | 0 | **+= ceilingAmount**——移入 Approved（RELEASED）桶 |
| 母 LC 的 Tight Available Balance | **−= ceilingAmount** | 不變 |
| 母 LC 的 Confirmed／Available Balance 本身 | 不受影響——A8 從不碰 LC 自己的合約列 | 不受影響 |
| Present Docs Earmark（P/A） | N/A | N/A |
| Document Arrival（Pending／Approved） | N/A | N/A |

這是唯一一個合併總數**在 Submit 時反應、Release 時再也不反應**的數字——但 Pending／Approved 拆開的
兩個桶子依然在 Release 時真的在彼此之間搬動，跟 B3 自己的 Present Docs Earmark 同一種形狀。

### A9 — Shipping Gtee Redemption（`SHGT` / `FULL_REDEEM`——已鎖定，`PARTIAL_REDEEM` 無法再透過這個
功能送出）

金額直接帶入 SG 自己當下的 Available Balance 並鎖住（disabled）——`FULL_REDEEM` 是唯一結果；已經沒有
辦法透過 A9 送出 Partial Redeem。

> **2026-08-21 鎖定（BA 確認——`TF_Balance_Component_Mapping-{en,zh}.xlsx` 自己的 Rule #1，
> 「SG discharge is instrument-based, not amount-based」：`SG_RELEASE` 永遠是全額，沒有殘餘）。**
> 以前 Amount 欄位是可編輯的，上限鎖在 Available Balance，`FULL_REDEEM` vs. `PARTIAL_REDEEM`
> 是依打進去的金額是否還等於它來推導——這讓 Maker 可以透過 A9 送出真正 standalone 的 Partial
> Redeem，違反 Mapping workbook 自己不可協商的規則。`builder-fields.ts` 自己的 Amount 欄位（跟
> `submit-rules.ts` 自己的防禦性複查）現在直接鎖死到 Available Balance，所以下面的 `ceilingAmount`
> 永遠是全額未歸零的數字——公式本身沒變，變的只是能不能送出不同的金額。**A3S 自己配對的 SG 贖回腿
> 不受影響**——那是完全獨立的一條程式路徑（`documentArrivalWithSg`），真正的上限是
> `MIN(到單金額, SG Available Balance)`，透過 `businessEventId` 綁定一筆真實的 Document
> Arrival，不是使用者自己打的金額；見上方 A3S 自己的表格，那裡依然可以合法地是 `PARTIAL_REDEEM`。
>
> **後續補充（2026-08-24）**：上面「reference-client only」的 UI 層限制，現在伺服器端也真的擋了——
> standalone（無 `businessEventId`）的 `PARTIAL_REDEEM` 在 Maker Submit 跟 Checker Release 兩處
> 都會被拒絕，詳見本文件開頭「A9 locked to Full Redeem only」banner 說明底下的後續補充。

> **2026-08-20 更新（見上方 banner 說明「Off-Balance Exposure basis」）。** 這張表現在涵蓋的是
> **standalone** 情況——一筆 A9 贖回送出時**沒有**共用一筆還在 PENDING 的 `UTILIZE` 自己的
> `businessEventId`（絕大多數 A9 送出都是這種情況；A9 自己從來不會建立複合配對——那只會透過 A3S
> 發生，已經在上面單獨涵蓋過）。那唯一的例外，見 A3S 自己的表格，它自己「Submit 時」那一欄真的會
> 立即反應。standalone 的 A9 現在完全不在 Submit 時反應——現在要等到真正的 Checker Release，跟其他
> 任何真正增加可用額度的動作一樣，這樣就補上了「Maker 送出贖回、Checker 還沒核准就先放行」的漏洞。

| 數字 | Submit 時（PENDING） | Approved 時（RELEASED） |
|---|---|---|
| SG 的 Confirmed Balance | 不變 | **−= ceilingAmount** |
| SG 的 Available Balance | **−= ceilingAmount** | 不變（已經反映過了） |
| **母 LC 的 Off-Balance Exposure（合併）** | **不變——不再於 Submit 時反應** | **−= ceilingAmount——改成在這裡反應** |
| **母 LC 的 SG（Pending）** | **不變**——一筆 standalone（未配對）的 PENDING 贖回在這裡也不再扣減，跟合併總數維持一致（§2 自己的 #8+#9=#4 不變量） | **不變** |
| **母 LC 的 SG（Approved）** | 不受影響 | **−= ceilingAmount**——移入 Approved（RELEASED）桶 |
| 母 LC 的 Tight Available Balance | **不變——不再於 Submit 時反應** | **+= ceilingAmount**（保留的額度真正釋放回來） |
| Present Docs Earmark（P/A） | N/A | N/A |
| Document Arrival（Pending／Approved） | N/A | N/A |

### A10 — Import LC Close（`IPLC_LC` / `EPLC_LC` / `CLOSE`）

2026-08-21 新增。僅限 root（`IPLC_LC`／`EPLC_LC`）——把剩餘的 Confirmed Balance 全部沖銷，Approved
之後把這份 Logical Contract 退休（`ContractStatus.CLOSED`）。`amount` 在 Submit 時必須逐位元組等於
當下的 Confirmed Balance（對一張已經全額動用的 LC 可以是 0，絕不能是負數）——永遠不是從別的地方
自動推導出來的。資格條件（尚未 Closed；SG 跟 Acceptance 的 Confirmed Balance 都恰好是 0；整棵事件樹
——root 加上每一個 SG／Acceptance／Examination 子項——裡沒有任何未結束的 Event）在 Submit **跟
Approve 都會檢查一次**，因為這段期間資格有可能失效（例如這段期間內對某個子帳本送出了新的
Event）——Checker Release 會直接失敗，不會悄悄重新推導出另一個沖銷金額。

| 數字 | Submit 時（PENDING） | Approved 時（RELEASED） |
|---|---|---|
| Confirmed Balance | 不變 | **−= ceilingAmount——恰好降到 0** |
| Available Balance | **−= ceilingAmount** | 不變（已經反映過了） |
| Pending Earmark Total | **−= ceilingAmount** | 歸零 |
| Off-Balance Exposure | 不受影響——Close 只有在它已經是 0 時才符合資格 | 不受影響 |
| Tight Available Balance | **−= ceilingAmount**（Pending Decrease Total，跟任何其他減額型交易一樣） | 不變（已經反映過了） |
| Present Docs Earmark（P/A） | N/A——Import 側 | N/A |
| SG（Pending／Approved） | N/A——Close 只有在未歸零的 SG 是 0 時才符合資格 | N/A |
| Document Arrival（Pending／Approved） | N/A——不是 `UTILIZE` | N/A |
| **合約狀態** | 不變，依然是 `ACTIVE` | **`ACTIVE` → `CLOSED`**（這次 Release 的副作用，不是一個數字） |

---

## 7. Export Confirmed LC 功能（B1–B6）

### B1 — Confirm LC（`EPLC_CONFIRMATION` / `ISSUE`）

建立保兌行自己的或有負債（CONF LIAB）。套用 Tolerance——機制跟 A1 完全相同，只是換了一個
instrumentType。

| 數字 | Submit 時（PENDING） | Approved 時（RELEASED） |
|---|---|---|
| Confirmed Balance | 不變 | **+= ceilingAmount** |
| Available Balance | **+= ceilingAmount** | 不變（已經反映過了） |
| Pending Earmark Total | **+= ceilingAmount** | 歸零 |
| Off-Balance Exposure | `null`（僅限 Import 側的數字） | `null` |
| Tight Available Balance | 不變（2026-08-20：現在追蹤 Confirmed，不是 Available） | **+= ceilingAmount** |
| Present Docs Earmark（Pending） | 不受影響（還沒有 B3 交單） | 不受影響 |
| Present Docs Earmark（Approved） | 不受影響 | 不受影響 |
| SG（Pending／Approved） | N/A——Export 側 | N/A |
| Document Arrival（Pending／Approved） | N/A——僅限 Import 側的概念 | N/A |

### B2 — Confirm LC Amendment（`EPLC_CONFIRMATION` / `AMEND`）

**沒有獨立的 `AMEND_INCREASE`／`AMEND_DECREASE` movementType**——UI 自己的方向選單設定送出的
`amount` 的**正負號**（正 = Increase，負 = Decrease）；線上請求永遠帶 `movementType: 'AMEND'`。
Tolerance 兩個方向都套用在（帶正負號的）金額上。

#### B2 — Increase

| 數字 | Submit 時（PENDING） | Approved 時（RELEASED） |
|---|---|---|
| Confirmed Balance | 不變 | **+= ceilingAmount** |
| Available Balance | **+= ceilingAmount** | 不變（已經反映過了） |
| Pending Earmark Total | **+= ceilingAmount** | 歸零 |
| Off-Balance Exposure | `null` | `null` |
| Tight Available Balance | 不變（2026-08-20：現在追蹤 Confirmed，不是 Available） | **+= ceilingAmount** |
| Present Docs Earmark（P/A） | 不受這筆交易影響 | 不受影響 |
| SG（Pending／Approved） | N/A | N/A |
| Document Arrival（Pending／Approved） | N/A | N/A |

#### B2 — Decrease

2026-08-20 補上的額度檢查漏洞——見 §4 自己的說明：這個方向現在跑跟 A2 自己 `AMEND_DECREASE`
一樣的下限檢查（`checkAmendDecreaseSufficiency`，依大小），以前完全沒有被檢查過——比對基準是
**Tight** Available Balance（Confirmed 減去還在 PENDING 的減額，再減去這份 Confirmation 自己的
Present Docs Earmark），不是單純的 Available Balance（見 §4 自己的「基準收緊」說明）。

| 數字 | Submit 時（PENDING） | Approved 時（RELEASED） |
|---|---|---|
| Confirmed Balance | 不變 | **−= ceilingAmount** |
| Available Balance | **−= ceilingAmount** | 不變（已經反映過了） |
| Pending Earmark Total | **−= ceilingAmount** | 歸零 |
| Off-Balance Exposure | `null` | `null` |
| Tight Available Balance | **−= ceilingAmount**（不受 2026-08-20 公式變更影響——一筆減額依然透過 Pending Decrease Total 從 Submit 就佔用 Tight） | 不變 |
| Present Docs Earmark（P/A） | 不受這筆交易影響 | 不受影響 |
| SG（Pending／Approved） | N/A | N/A |
| Document Arrival（Pending／Approved） | N/A | N/A |

### B3 — Present Docs（`EPLC_EXAMINATION` / `CREATE`，`MEMO_ONLY`）

**完全不貢獻母 Confirmation 自己的 Confirmed／Available Balance**——D3（「只有法律事件才會移動
餘額」）。真正重要的是母 Confirmation 上的 **Present Docs Earmark Pending／Approved** 這一組。
跟其他每一個功能不同，B3 有一個真正的**第三種生命週期狀態**——「Consumed」（`presentDocsConsumedAt`
被設定，由 B4 完成）——超越 Submit／Approved 之外。

| 數字（在**母 Confirmation**上） | Submit 時（這筆交單是 PENDING） | Checker Release 時（這筆交單是 RELEASED——自 2026-08-18 改版起，這是 B3 自己真正的最終化） | 之後，一旦被 B4 消費掉 |
|---|---|---|---|
| Confirmed／Available Balance | 不受影響——MEMO_ONLY | 不受影響 | 不受影響 |
| **Present Docs Earmark（Pending）** | **+= ceilingAmount** | **−= ceilingAmount**（移出 Pending） | — |
| **Present Docs Earmark（Approved）** | 不受影響 | **+= ceilingAmount**（移入 Approved） | **−= ceilingAmount**（終於移出） |
| Tight Available Balance | **−= ceilingAmount**（Pending 已經先扣過） | **不變**——B3 自己 Release 時，合併總數不變 | **+= ceilingAmount**（額度真正釋放） |
| Off-Balance Exposure | `null` | `null` | `null` |
| SG（Pending／Approved） | N/A | N/A | N/A |
| Document Arrival（Pending／Approved） | N/A——僅限 Import 側的概念；B3 是 Export 側的對應概念，上面已經涵蓋過 | N/A | N/A |

合併後的 Pending＋Approved 數字（真正卡住一筆新交單自己額度檢查的東西）只有在 Submit 或真正被 B4
消費時才會*真的*改變——絕不會在 B3 自己的 Release 時改變。**顯示出來**的 Approved 數字，從 B4 自己
Submit 那一刻起，如果有一筆還在 PENDING 的 B4 已經引用這一筆特定記錄，可能會額外顯示得比較低（見
banner 說明跟下方 B4 自己的表格）——僅供顯示，如果那筆 B4 之後被拒絕／取消，會自動回復，因為
`presentDocsConsumedAt` 在 B4 真正 Release 之前，什麼都還沒真的寫入。

### B4 — Honour / Acceptance（`EPLC_CONFIRMATION` / `HONOUR` 或 `ACCEPT`——複合式，依 tenor 路由）

挑選一筆已經 RELEASED 的 B3 記錄。**Sight（`HONOUR`）**：Submit 建立 2 筆連動交易（PENDING）——
Confirmation 自己的 `HONOUR`，**加上**一份新的 `EPLC_DUE_FROM_ISSUING_BANK` 合約自己的 `CREATE`。
**Usance（`ACCEPT`）**：Submit 建立 3 筆連動交易（PENDING）——Confirmation 自己的 `ACCEPT`，一份新
的 `EPLC_ACCEPTANCE` 合約自己的 `CREATE`，**加上**一份新的 `EPLC_ACCEPTANCE_REIMB_RECEIVABLE`
合約自己的 `CREATE`。Checker Release 是複合式的：先釋放主腿，再釋放該 tenor 需要的次腿，並**把挑選
的那筆 B3 記錄的 `presentDocsConsumedAt` 當成副作用一起標記**——不需要對 B3 自己另外呼叫一次
release（它早就已經 Released 過了）。

| 數字 | Submit 時（所有腿都 PENDING） | Checker Release 時 |
|---|---|---|
| Confirmation 的 Confirmed Balance | 不變 | **−= ceilingAmount**（HONOUR／ACCEPT，−1 方向） |
| Confirmation 的 Available Balance | **−= ceilingAmount** | 不變（已經反映過了） |
| `EPLC_DUE_FROM_ISSUING_BANK`（Sight）／`EPLC_ACCEPTANCE`（Usance）的 Confirmed Balance | 不變 | **+= ceilingAmount** |
| `EPLC_DUE_FROM_ISSUING_BANK`／`EPLC_ACCEPTANCE` 的 Available Balance | **+= ceilingAmount** | 不變（已經反映過了） |
| `EPLC_ACCEPTANCE_REIMB_RECEIVABLE` 的 Confirmed Balance（僅限 Usance） | 不變 | **+= ceilingAmount** |
| `EPLC_ACCEPTANCE_REIMB_RECEIVABLE` 的 Available Balance（僅限 Usance） | **+= ceilingAmount** | 不變（已經反映過了） |
| **Confirmation 的 Present Docs Earmark（Approved）** | **顯示成好像已經 −= B3 自己的 ceilingAmount**（暫時性，只在 `assembleSnapshot()` 顯示層，見上方 banner 說明——`presentDocsConsumedAt` 本身還沒真的寫入） | **−= B3 自己的 ceilingAmount**，這時是真的（`presentDocsConsumedAt` 已寫入；挑選的交單終於被消費） |
| Confirmation 的 Present Docs Earmark（Pending） | 不受影響——B3 自己的交單在被 B4 挑選之前早就已經 RELEASED 了 | 不受影響 |
| Confirmation 的 Tight Available Balance | **顯示成好像已經 += B3 自己的 ceilingAmount**（暫時性，同一套只在顯示層的機制——見下方即時驗證的範例） | **+= B3 自己的 ceilingAmount**，這時是真的（隨著 earmark 清除，額度真正釋放） |

即時驗證過（業務端回報「B4 U02 也有類似問題」，2026-08-20）：B1 Confirm 10,000 Usance（Approved）→
B3 Present Docs 10,000（Approved）→ B4 Acceptance 10,000（Submit，依然 PENDING）。修復前，這個時候
Confirmation 自己的 `GET .../balance` 讀出來是 `presentDocsEarmarkApproved: "10000"`、
`tightAvailableBalance: "-10000"`——是錯的，因為 B4 自己消費掉那筆特定交單早就是一旦 Submitted 就
注定會發生的結論。修復後，同一個查詢讀出來是 `presentDocsEarmarkApproved: "0"`、
`tightAvailableBalance: "0"`、`pendingEarmarkTotal: "-10000"`——而且之後真的送出一筆完全不相關的
新 B3 交單，依然正確地依未淨額、嚴格的 `-10000` 數字被拒絕（這個暫時性例外絕不會外洩到另一筆交單上）。
| Off-Balance Exposure | `null` | `null` |
| SG（Pending／Approved） | N/A | N/A |
| Document Arrival（Pending／Approved） | N/A——僅限 Import 側的概念 | N/A |

### B5 — Settlement — Reimbursement / Maturity（`EPLC_ACCEPTANCE` / `FULL_SETTLE` 或
`PARTIAL_SETTLE`——複合式，僅限 Usance 持有到期）

Maker Submit **一起建立 2 筆連動交易**（PENDING）：Acceptance 自己的 `FULL_SETTLE`／
`PARTIAL_SETTLE`（`req`）**先**建立，接著解析出對應的（早已存在、由 B4 建立的）
`EPLC_ACCEPTANCE_REIMB_RECEIVABLE` 合約，對它建立自己的 `REIMBURSE`。Checker Release 依同樣順序
釋放兩者。

| 數字 | Submit 時（兩腿都 PENDING） | Checker Release 時 |
|---|---|---|
| Acceptance 的 Confirmed Balance | 不變 | **−= ceilingAmount** |
| Acceptance 的 Available Balance | **−= ceilingAmount** | 不變（已經反映過了） |
| Reimbursement Receivable 的 Confirmed Balance | 不變 | **−= ceilingAmount** |
| Reimbursement Receivable 的 Available Balance | **−= ceilingAmount** | 不變（已經反映過了） |
| Off-Balance Exposure／Tight Available（任一合約） | `null`——兩個 instrumentType 都不是 `IPLC_LC`／`EPLC_LC`／`EPLC_CONFIRMATION` | `null` |
| Present Docs Earmark（P/A） | 不受影響——B5 從不碰 `EPLC_EXAMINATION` | 不受影響 |
| SG（Pending／Approved） | N/A | N/A |
| Document Arrival（Pending／Approved） | N/A | N/A |

Sight 結算（收取 `EPLC_DUE_FROM_ISSUING_BANK`）明確不在 Balance Component 自己的範圍內——B4 記錄了
那個資產，但這個 registry 裡沒有任何東西真的去結算它。

### B6 — Export Confirmed LC Close（`EPLC_CONFIRMATION` / `CLOSE`）

2026-08-21 新增。機制跟 A10（§6）一樣，只是換成 `EPLC_CONFIRMATION` 而不是 `IPLC_LC`／`EPLC_LC`——
資格條件淨額的是 Present Docs Earmark，不是 SG 曝險（Export 側沒有 SHGT 子項），但其餘完全相同：
尚未 Closed；Acceptance 的 Confirmed Balance 是 0；整棵事件樹裡沒有任何未結束的 Event（root 加上
每一個 Acceptance／Examination 子項——包括一筆已經 RELEASED 但還沒 `presentDocsConsumedAt` 的
`EPLC_EXAMINATION`，單純掃描 PENDING 會漏抓這種）。`amount` 在 Submit 時必須逐位元組等於當下的
Confirmed Balance（可以是 0，絕不能是負數）；資格條件跟金額完全吻合都會在 Approve 時再檢查一次。

| 數字 | Submit 時（PENDING） | Approved 時（RELEASED） |
|---|---|---|
| Confirmed Balance | 不變 | **−= ceilingAmount——恰好降到 0** |
| Available Balance | **−= ceilingAmount** | 不變（已經反映過了） |
| Pending Earmark Total | **−= ceilingAmount** | 歸零 |
| Off-Balance Exposure | `null`（僅限 Import 側的數字） | `null` |
| Tight Available Balance | **−= ceilingAmount**（Pending Decrease Total，跟任何其他減額型交易一樣） | 不變（已經反映過了） |
| Present Docs Earmark（P/A） | 不受影響——Close 只有在沒有未結束的 Present Docs 交單時才符合資格 | 不受影響 |
| SG（Pending／Approved） | N/A——Export 側 | N/A |
| Document Arrival（Pending／Approved） | N/A——僅限 Import 側的概念 | N/A |
| **合約狀態** | 不變，依然是 `ACTIVE` | **`ACTIVE` → `CLOSED`**（這次 Release 的副作用，不是一個數字） |

---

## 8. 快速對照——每個功能會動到哪些數字

| 功能 | Confirmed／Available／Pending Earmark | Off-Balance Exposure | Tight Available Balance | Present Docs Earmark P/A | SG P/A | Document Arrival P/A |
|---|---|---|---|---|---|---|
| A1 | 自己的合約 | — | 自己的合約 | — | — | — |
| A2（Inc/Dec） | 自己的合約 | — | 自己的合約 | — | — | — |
| A3 | 自己的合約 | — | 自己的合約 | — | — | **自己的交易** |
| A3S | LC ＋ SG 合約 | LC（Submit 時反應） | LC | — | **LC（Release 時拆分）** | **LC 自己的 UTILIZE** |
| A4 | LC（只在 Release 時） | — | — | — | — | **LC 自己的 UTILIZE（完成最終化）** |
| A6 | LC（Release 時）＋ Acceptance | — | — | — | — | **LC 自己的 UTILIZE（完成最終化）** |
| A7 | 自己的合約 | `null` | `null` | — | — | — |
| A8 | SG 自己的合約 | **LC（Submit 時反應）** | LC | — | **LC（Release 時拆分）** | — |
| A9 | SG 自己的合約 | **LC（只在 Release 時反應——僅限 standalone；A3S 自己配對的那一種例外，在 Submit 時就反應）** | LC | — | **LC（只有 Approved 桶有反應，Pending 桶不反應）** | — |
| A10 | 自己的合約（沖銷到 0） | —（只有在已經是 0 時才符合資格） | 自己的合約 | — | —（只有在已經是 0 時才符合資格） | — |
| B1 | 自己的合約 | `null` | 自己的合約 | 不受影響 | — | — |
| B2（Inc/Dec） | 自己的合約 | `null` | 自己的合約 | 不受影響 | — | — |
| B3 | 對 Confirmed／Available 是 `null` 效果（MEMO_ONLY） | `null` | Confirmation（透過 Earmark） | **自己的合約，Release 時拆分** | — | — |
| B4 | Confirmation ＋ 新的資產／負債合約 | `null` | Confirmation（Approved 桶被消費） | **Confirmation（Approved 下降）** | — | — |
| B5 | Acceptance ＋ Receivable | `null` | `null` | 不受影響 | — | — |
| B6 | 自己的合約（沖銷到 0） | `null` | 自己的合約 | —（只有在已經是 0 時才符合資格） | — | — |

---

*本文件由 `microservices/balance-component/src/domain/balanceDerivation.ts`、
`domain/offBalanceExposure.ts`、`domain/amendDecrease.ts`、`domain/tolerance.ts`、
`domain/closeEligibility.ts`、`service/balanceService.ts`，以及
`src/app/transaction-builder/balance-component.model.ts` 自己的 `IMPORT_FUNCTIONS`／
`EXPORT_FUNCTIONS` registry 產生。業務理由／歷史脈絡見 `lc-balance/CLAUDE.md` 自己的決策日誌。
本文件是 `Balance-Figures-Calculation-Logic.md`（英文原版）的繁體中文翻譯，2026-08-25 建立、代碼核對
過與現行程式碼一致；比照 `TF_Balance_Component_Spec-{en,zh}.docx` 等雙語文件的既有慣例，用 `-zh`
檔名後綴區分語言版本，欄位名稱／程式碼識別字維持原文，不做翻譯。*
