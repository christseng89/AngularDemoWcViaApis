# LC Expiry Date / Acceptance Maturity Date 控制提案 — 審查與修訂

**審查對象**：使用者提供的「A2–A10 / B2–B6 LC Expiry Date 與 Acceptance Maturity Date 控制」提案（原文見文末附錄）
**審查依據**：`lc-balance/CLAUDE.md` 決策日誌、`microservices/balance-component/src` 實際原始碼、`cs-tf-balance-knowhow` 知識庫（`rationale-en.md` §3.9/§7.7、`impl-spec-en.md` 不變式 I4/I12）——`closeEligibility.ts` 本身的檔頭註解就明講 A10/B6 的設計是「Modelled on cs-tf-balance-knowhow's rationale §3.9/§7.7」，所以這份知識庫就是本提案理應對齊的同一份權威依據，不是外部引入的新標準
**審查日期**：2026-08-22

---

## 0. 結論先講：框架方向對，但有一個會讓「或有負債永遠掛帳」的重大遺漏

原提案把 LC Expiry Date 和 Acceptance Maturity Date 拆成兩條獨立控制軸（「是否能產生新曝險」vs.「已存在的 Acceptance 何時到期」），並主張 **Expiry 不等於 Close、Maturity 不等於 Settlement**。這個方向是對的，也符合 UCP 600 Art. 14(c)（21 天提示期以裝運日起算、且不得晚於 Expiry）與 IAS 32.11 / IFRS 9 3.1.1（Acceptance 一旦成立即為表內負債，不因母證 Expiry 而消滅）的國際慣例，值得保留。

但逐條核對 `cs-tf-balance-knowhow` 之後，發現原提案遺漏了 Expiry Date 在 Trade Finance 會計上**更核心**的一個功能，而且這個遺漏剛好就是該知識庫「Defects to look for」checklist 上列的**最常見缺陷**：

> **"No expiry event" → Contingent stranded forever — commonest cause of an overstated off-BS book.**
> （`SKILL.md`「Defects to look for」表，`rationale-en.md` §3.9/§7.7）

原提案只把 LC Expiry Date 定義成「擋新交易的閘門」，完全沒有處理「LC 到期後，尚未動用的殘值（Residual/Undrawn Balance）該怎麼從表外帳除列」這件事——而這正是本專案自己的 `Natural-Expiry-Scope-Decision-Request.md`（OAS-GAP-15）目前還卡著、尚未有定論的那個問題。以下逐節說明，並給出修訂後的決策表。

**優先級標記沿用 CLAUDE.md 角色慣例（Critical/High/Medium/Low）**，本文件審查發現的優先級如下：

| # | 發現 | 優先級 |
|---|---|---|
| 1 | Expiry 只控「新曝險」，未觸發「殘值釋放」——與 GAP-15 直接相關 | **Critical** |
| 2 | 提案假設 `LC Expiry Date`/`Acceptance Maturity Date` 是已存在的欄位並被各 Function 讀取，但 `expiryDate` 在現行 schema 裡根本不存在，`maturityDate` 存在但從未被任何領域邏輯讀取 | **Critical** |
| 3 | B6（Export Confirmed LC Close）完全沒出現在原提案的 Export 段落 | **High** |
| 4 | A10 的「Expiry 使 LC 成為 Close Candidate」與現行 `closeEligibility.ts` 的實際資格條件不符 | **High** |
| 5 | A2/B2 目前的資料模型只有 Amount 導向的 AMEND_INCREASE/DECREASE，沒有「只改 Expiry Date、不動金額」的 Amendment 型態 | **Medium** |
| 6 | Presentation/Received Date 等「業務日期」目前在系統中同樣不存在，A3/A6 的「不能只看 processing date」建議目前無欄位可落地 | **Medium** |

---

## 1. 重大缺口：Expiry 除了「擋新曝險」，還要「釋放殘值」——這是 A2–A10 提案裡完全沒寫到的第三種控制

`cs-tf-balance-knowhow`（`rationale-en.md` §3.9，Import；§7.7，Export/Confirmation）把 Expiry 對 Balance 的作用寫得很明確，且跟金額直接相關：

> **§3.9 Expiry, cancellation and final utilisation**
> "Unutilised contingent must be released, or it sits on the off-BS book indefinitely — the most common source of an overstated off-BS book."
>
> ```text
> Dr  Documentary Credits Outstanding — [Tenor]              50,000
>     Cr  Customers' Liability under DC — [Tenor]                  50,000
> ```
>
> "Trigger on `expiry_date + mail_float_grace`... Releasing on the expiry date itself is wrong — a complying presentation made at the counters of the nominated bank on the last day can reach the issuing bank weeks later, and the bank is still bound."
>
> "**Do not add 21 days here.** ... The 21 days runs from shipment and is capped by expiry — it is never additive to it."

Export/Confirmation 側（§7.7）是同一個問題、同一個修正：「Trigger on `expiry_date + mail_float_grace` at the **place of expiry**」。

對應到 `impl-spec-en.md` 的不變式：

```text
I4  No undertaking may remain OUTSTANDING past expiry + presentation period + float
    without an explicit LC_EXPIRE / CNF_EXPIRE event.
I12 No contingent survives expiry_date + mail_float_grace without an explicit expiry event,
    and the trigger never adds Art. 14(c)'s 21 days (§3.9).
```

換句話說，一個完整的 LC Expiry Date 控制設計，除了原提案已經講對的「①擋新曝險」之外，**還需要第三種控制型態**（原提案第 5 節的「三種 Date Control」少了一種）：

**③ EXPIRY RESIDUAL RELEASE CONTROL（原提案缺漏，本次新增）**

適用：一個**日期觸發（非 Maker/Checker 觸發）**的新事件——姑且沿用知識庫命名為 `LC_EXPIRE`（Import）／`CNF_EXPIRE`（Export），**不落在 A2–A10 / B2–B6 這組 Maker/Checker Function 裡**，因為它的觸發方式本質上不同（排程/批次，不是人工送單）。

```text
LC Expiry Date + Mail Float Grace（不是 Expiry Date 當天）
        ↓
是否有 PENDING 的 Document Arrival/Present Docs 事件（A3/A3S/B3）尚未終結？
        ↓ YES → 暫緩釋放，等該筆 Presentation 走完（可能是提前寄出、到期後才到）
        ↓ NO
釋放 Root Confirmed Balance 的殘值（等同 A10/B6 Close 寫掉的同一個數字，
但「資格條件」不同——見第 6 節）
        ↓
同時釋放：對應的 ECL 提列、額度佔用、未攤銷手續費（轉收益）、保證金
（後三項落在 Payment/Charge Component，本 Balance Component 只負責曝險本身）
```

**這一項不需要現在就實作**——本文件的立場跟 `Natural-Expiry-Scope-Decision-Request.md` 一致：這是要業務/架構側先拍板「這是不是本合約該做的事」的問題，不是工程面自行判斷。但既然原提案的標題就是「LC Expiry Date 控制」，**若審查通過的版本完全不提這一塊，之後有人拿著這份文件去回答 GAP-15，會得出「Expiry 只是閘門、跟殘值無關」的錯誤結論**——這正是知識庫標注為最常見的缺陷模式。第 8 節會說明這對 GAP-15 決策的具體影響。

---

## 2. 現況落差：提案討論的兩個欄位，一個不存在、一個從未被讀取

原提案的第 3 節建議 Balance Component 至少要有 `LC Issue Date / LC Expiry Date / Document Presentation Date / Acceptance Date / Acceptance Maturity Date / Settlement Date` 六個業務日期，方向正確；但實際核對 `microservices/balance-component/src` 之後，現況是：

| 提案建議欄位 | 現況 | 依據 |
|---|---|---|
| `LC Expiry Date` | **完全不存在** —— `BalanceContract` 型別裡沒有任何 expiry 相關欄位 | `microservices/balance-component/src/types.ts` 全檔 grep 無 `expiryDate` |
| `Acceptance Maturity Date` | **存在，但是孤兒欄位**——只在 API request 型別接收、只被寫進 DB，**從未被任何 `domain/` 邏輯讀取或比對**；Angular 前端目前也沒有任何一個畫面（含 A6/B4 Acceptance 建立畫面）會送出這個值 | `service/balanceService.ts:146,1500`、`store/balanceContractStore.ts:57,138,159`；`src/app/transaction-builder` 全目錄 grep 無 `maturityDate` 命中 |
| `Document Presentation / Received Date` | **不存在** | 同上，`types.ts` 無對應欄位 |
| `LC Issue Date` / `Acceptance Date` / `Settlement Date` | **不存在**（`createdAt`/`eventSeq` 等系統時間戳記不等同業務日期） | 同上 |

這代表：**原提案裡「A7 Maturity Date 控制 Due/Matured」「A6 Acceptance 建立時產生/確認 Maturity Date」這些描述，目前都只是目標狀態（to-be），不是現況（as-is）的落差分析**。這不影響提案的業務邏輯本身，但審查結論必須明講這一點，否則工程側可能誤以為只要調整判斷式即可、實際上要先補 schema。

**建議把「補欄位」列為 A2–A10/B2–B6 控制邏輯之前的 Phase 0（見第 9 節），並沿用本專案既有的欄位命名慣例**（`camelCase`、`?: string | null`、DB 對應 `snake_case`，比照 `maturityDate`/`maturity_date` 的既有寫法）：

```ts
// BalanceContract（IPLC_LC / EPLC_LC / EPLC_CONFIRMATION 適用；SHGT/Acceptance 不適用）
expiryDate?: string | null;
issueDate?: string | null;

// BalanceMovement（A3/A3S/B3 適用）
documentPresentationDate?: string | null;   // 提示日期，UCP 14(c) 判斷基準
```

---

## 3. Import LC：A2–A10（修訂版）

沿用原提案的三欄式結構，但把每一格的判斷依據換成「目前欄位不存在，此為目標設計」的明確語氣，並修正 A10 那一格（見第 6 節）。

| Function | LC Expiry Date 控制 | Acceptance Maturity Date 控制 | 修訂建議 |
|---|---|---|---|
| **A2 LC Amendment** | **YES（新曝險閘門）** | 通常 NO | 原提案結論維持，但要補一個現況落差：現行 `AMEND_INCREASE`/`AMEND_DECREASE` 是純金額導向（`domain/amendDecrease.ts`），系統裡**沒有「只改 Expiry Date、不動金額」的 Amendment 型態**——知識庫的 `LC_AMD_TENOR`（"Expiry / tenor change｜none｜ECL + CCF bucket recalc (no amount move)"）目前無對應實作。若要落地「Expired LC 不可一般 Amendment，但可以延展 Expiry」，**延展本身就必須先有這個新的 Amendment 子類型**，不是「另外授權處理」的特殊流程——延展 Expiry Date 在 UCP 慣例下就是一筆正常的 Amendment，只是不動 Balance |
| **A3 Document Arrival** | **YES，但看 Presentation Date，不是系統操作日** | NO | 原提案的核心判斷（不能因為 `02-Oct > 30-Sep` 就直接拒絕）完全正確，且與 §3.9「Releasing on the expiry date itself is wrong」同一邏輯。**修正**：目前系統沒有 `documentPresentationDate` 欄位，這條規則目前**無欄位可落地**——第 2 節已列為 Phase 0 前置工作 |
| **A3S Document Arrival w/ SG** | YES，但需考慮既存 SG | NO | 同 A3，另需注意 SG 的解除是「憑證返還」而非金額比對（`shgtRedeem.ts`、`cs-tf-balance-knowhow` 非負原則 #2）——這件事已經是本專案既有的定案規則（`Balance-Component-Business-Rule-Decisions-2026-08-21.md` 決策 1），跟 Expiry 控制彼此獨立，不要混在同一個判斷式裡 |
| **A4 Sight Settlement** | **NO — 不因 Expired 而 Block** | N/A | 原提案結論正確且符合現行系統精神（`release()` 只檢查 Sight 是否已 Maker Submit，見 CLAUDE.md「A4 redesigned twice」段落，完全沒有 Expiry 檢查） |
| **A6 Acceptance (Usance)** | YES，但需看 underlying presentation | **CREATE** | 原提案結論方向正確，但「Maturity Date 於 Acceptance 建立時產生/確認」目前**在 UI 上完全沒有輸入點**——`maturityDate` 只存在於 API/DB layer。落地時要決定：Maturity Date 由 Maker 手動輸入，還是由 `tenorDays` + Acceptance Date 系統自動推算（`tenorDays` 欄位已存在，`types.ts`，只是目前沒人用它算 Maturity） |
| **A7 Acceptance Settlement** | NO | **YES — 核心控制，目前完全未實作** | 原提案結論正確，但這是本提案裡**唯一一個「不需要新增欄位就能討論、但完全沒有對應邏輯」的格子**——`maturityDate` 存在卻從未被讀取，代表 A7 目前對「是否已到期」沒有任何判斷，Settlement 可以在 Maturity 之前送出。這格的優先級應該高於表中大多數其他格 |
| **A8 Shipping Gtee Issue** | **YES — 強控制** | NO | 原提案結論維持 |
| **A9 Shipping Gtee Redemption** | **NO — 不應 Block** | NO | 原提案結論維持，且與知識庫非負原則 #2（SG 解除是憑證導向、不是金額導向）一致 |
| **A10 LC Close** | **見第 6 節，此欄修正** | **YES — Outstanding Check** | Acceptance Balance 必須為 0 這點正確；但「Expiry 使 LC 成為 Close Candidate」這句話與現行 `closeEligibility.ts` 的實際行為不符，見第 6 節完整說明 |

---

## 4. Export Confirmed LC：B2–B6（修訂版，補上原提案遺漏的 B6）

原提案第 2 節的標題與內文都只寫到 B2–B5，完全沒有涵蓋 B6（Export Confirmed LC Close）。查證 `src/app/transaction-builder/function-strategy.ts:159` 與 `balance-component.model.ts:492`，**B6 在系統裡已經是正式存在、且已實作的 Function**（`FUNCTION_STRATEGIES['B6']`），是 A10 在 Export 側的對稱功能。原提案既然標題明講「A2–A10 / B2–B6」，這格必須補上：

| Function | LC Expiry Date 控制 | Acceptance Maturity Date 控制 | 建議 |
|---|---|---|---|
| **B2 Confirm LC Amendment** | **YES** | 通常 NO | 同 A2，另補一提：`Balance-Component-Business-Rule-Decisions-2026-08-21.md` 決策 2 已定案「Export 側不接受 `BUYERS_USANCE`」，這是跟 Expiry 控制正交的另一條規則，B2 落地時兩者都要顧到 |
| **B3 Present Docs** | YES，但看 Presentation Date | NO | 同 A3。另需注意 B3 已於 2026-08-21 改為「真正 Release」設計（見 CLAUDE.md「B3 redesigned to genuinely RELEASE」），`presentDocsConsumedAt` 欄位追蹤「是否已被 B4 消費」——Expiry 控制要接在這個既有機制之後，不要重造一套 |
| **B4 Honour / Acceptance** | YES，但不是簡單 Block | **CREATE / CONFIRM** | 同 A6，UI 未接 `maturityDate` 的落差同樣存在 |
| **B5 Settlement — Reimbursement / Maturity** | **NO** | **YES — 核心控制，目前完全未實作** | 同 A7 |
| **B6 Confirmed LC Close（原提案遺漏，本次補上）** | **見第 6 節** | **YES — Outstanding Check** | 查證 `closeEligibility.ts` 檔頭註解：**A10 與 B6 目前共用同一個 `evaluateCloseEligibility()` 函式**，兩者資格條件完全相同（SG Balance = 0、Acceptance Balance = 0、無 Open Events），不需要為 B6 另外設計一套規則——這件事本身就是「Balance Component 只負責 Contingent Liability」這條範疇界線（CLAUDE.md 開頭）落地得很乾淨的一個例子，維持現狀即可 |

---

## 5. A10 / B6 Close 的資格條件修正：Expiry 不是 Close 的必要條件（原提案這格需要改寫）

原提案第 6 節把 A10 設計成「Eligibility Engine」，方向完全正確，而且**現行 `closeEligibility.ts` 已經就是照這個精神實作的**（不是提案在講一個尚未存在的設計，這格是少數「現況已經對齊目標」的例子）。但原提案表格裡 A10 那一列寫「LC Expiry Date — YES — Eligibility」，暗示「LC 要先 Expired 才有資格 Close」，這點跟現行程式碼**不一致**，需要修正：

```ts
// microservices/balance-component/src/domain/closeEligibility.ts
export function evaluateCloseEligibility(inputs: CloseEligibilityInputs): CloseEligibilityResult {
  // 條件：alreadyClosed / sgConfirmedBalance / acceptanceConfirmedBalance / hasOpenEvents
  // —— 完全沒有檢查 Expiry Date
}
```

檔頭註解寫得很直接：這是「**cancellation before expiry**」——Close 存在的目的本來就是讓 Maker/Checker 在 Expiry **之前**主動提前結案，不是等 Expiry 到了才能按。原提案自己在開頭也寫「Expiry 不等於 Close」，但表格裡的措辭又暗示兩者有先後關係，前後不一致。

**修正後的正確描述**：

> LC Expiry Date 與 A10/B6 Close **互相獨立、不互為先決條件**。Close 的唯一資格條件是「歸零 + 無 Open Events」，不論 LC 是否已過 Expiry Date 都可以送出（只要條件滿足）；反過來，LC 過了 Expiry Date 也不會自動觸發 Close（現行系統沒有任何排程機制），殘值會繼續掛在帳上直到有人手動 Close，或未來真的實作了第 1 節提到的 `LC_EXPIRE` 事件。

這也是為什麼第 1 節要特別把「Expiry 殘值釋放」單獨拉出來當第三種控制型態——**如果只靠 A10/B6 Close 這個 Maker/Checker 觸發的機制，一筆沒人記得去按 Close 的過期 LC，殘值會永遠留在表外帳上**，這正是 `cs-tf-balance-knowhow` checklist 上「No expiry event → Contingent stranded forever」那一條在講的情境，而且是本專案自己的程式碼目前完全暴露在這個風險下（沒有 `expiryDate` 欄位、沒有排程、Close 純靠人工）。

另外要注意：**若未來真的實作 `LC_EXPIRE`／`CNF_EXPIRE`，它的資格條件不能直接沿用 `closeEligibility.ts` 現成的函式**，因為兩者釋放的東西範圍不同：

| | 觸發方式 | 資格條件 | 釋放範圍 |
|---|---|---|---|
| **A10 / B6 Close** | Maker/Checker 主動 | SG=0 **且** Acceptance=0 **且** 無 Open Events | 整筆合約全部結清 |
| **LC_EXPIRE / CNF_EXPIRE（未來，若拍板要做）** | 日期觸發（排程） | 只看 Root 自身的 Confirmed Balance 是否 > 0；**不要求** SG/Acceptance 先歸零 | 只釋放 Root 自己「未動用」的殘值——Acceptance 一旦已經成立（on-BS），到期後繼續走自己的 Maturity 週期，不受母證 Expiry 影響（這正是原提案「Maturity 不等於 Settlement」那句話的另一半：Expiry 也不等於「連帶結清 Acceptance」） |

這點如果之後要正式設計 `LC_EXPIRE`，建議另開一個獨立的 `domain/expiryRelease.ts`，不要塞進 `closeEligibility.ts`——兩者資格條件形狀本質不同，硬併在一起會重演本專案自己在 `Balance-Component-Business-Rule-Decisions-2026-08-21.md` 決策 1 裡才修過的錯誤（A9 誤用 `confirmedBalance` 而非 `availableBalance` 導致邏輯錯誤）。

---

## 6. 建議的實作架構：比照本專案既有的 Strategy / Pure-Function Policy 慣例

原提案第 5 節「不要每個 Function 自己亂寫 `if expiryDate...`，而應由 Balance Component 提供共用 Policy」這個方向完全正確，而且剛好呼應本專案自己在 `desiger-comments.md` F-01 已經做過的重構（11 個分散的 boolean flag 收斂進 `function-strategy.ts` 的 `FUNCTION_STRATEGIES`）。建議落地時**不要另開一套新的規則語言**，直接比照現有慣例：

- 新增一個 `dateControlPolicy.ts`（前端）/ 對應的 domain 檢查（後端），輸出型態比照 `function-policy.ts`/`submit-rules.ts`/`eligibility-rule.ts` 已經在用的「輸入 context → 回傳 patch/result，不直接改 model」模式（CLAUDE.md「BAL-003 9th extraction」段落）。
- 三種控制型態（原提案的①②，加上本文件第 1 節補的③）各自對應一個純函式，`FUNCTION_STRATEGIES` 每個 Function 條目新增一個欄位指向要套用哪一種：

```ts
type DateControlKind = 'NEW_EXPOSURE' | 'EXISTING_LIABILITY' | 'MATURITY_SETTLEMENT' | 'NONE';

// 例：
FUNCTION_STRATEGIES['A2']  → dateControl: 'NEW_EXPOSURE'
FUNCTION_STRATEGIES['A3']  → dateControl: 'EXISTING_LIABILITY'
FUNCTION_STRATEGIES['A7']  → dateControl: 'MATURITY_SETTLEMENT'
FUNCTION_STRATEGIES['A9']  → dateControl: 'NONE'   // 明確標記「不受任一日期控制」，避免日後被誤加
FUNCTION_STRATEGIES['A10'] → dateControl: 'NONE'   // 見第 6 節：Close 不吃 Expiry
```

`dateControl: 'NONE'` 這個顯式標記很重要——本專案自己在 F-09（`eligibility-rule.ts` 三個 picker 合併時）就踩過「合併過程中不小心讓某個 Function 的既有例外被默認規則吃掉」的坑（A8 的 0-balance exclusion）。同樣道理，A4/A9/A10 這幾個「明確不受 Expiry 影響」的 Function，與其讓它們在共用 Policy 裡「沒有命中任何規則所以放行」，不如顯式標成 `NONE`，避免未來有人在共用 Policy 裡加新規則時，不小心把它們也一起攔住了。

---

## 7. 與 `Natural-Expiry-Scope-Decision-Request.md`（OAS-GAP-15）的關係

本專案目前有一份**尚未拿到答案**的決策請求，問的正是「LC/Confirmation 的自然到期是不是 Balance Component 該管的事」。原提案雖然標題叫「LC Expiry Date 控制」，但通篇沒有引用或呼應這份決策請求——這是一個治理面的落差：**兩份文件在討論同一件事，卻互相不知道對方存在**。

本文件的立場是：不代替業務/架構側做決定，但**指出這個決策請求本身引用的權威依據（`cs-tf-balance-knowhow` §3.9/§7.7，同時也是 `closeEligibility.ts` A10/B6 設計時引用的同一份依據），已經對這個問題給出了明確立場**——`impl-spec-en.md` §14「Implementation checklist」把 `LC_EXPIRE`/`CNF_EXPIRE` 列在「**Must fix before go-live**」，不是「視情況而定」的選配項。這不等於 GAP-15 就該直接結案定調成「要做」——本專案的租戶拓撲、SLA、跟外部批次系統的分工都還沒釐清，那些是合理的、需要另外討論的落地考量——但至少「這件事在概念上屬不屬於 Balance Component 的職責範圍」這個較窄的問題，手上已有的同一份設計依據並不支持「完全是外部批次流程的職責、跟本合約無關」這個答案。

**建議**：把本文件（尤其是第 1 節、第 6 節）作為 `Natural-Expiry-Scope-Decision-Request.md` 那次會議的討論素材之一併送出，讓業務/架構側在回答 GAP-15 時，看到的是「兩軸控制模型已經確定要做」和「殘值釋放要不要做、做的話排多前面」兩個分開但相關的問題，而不是把整個 Expiry Date 提案打包成單一個「要或不要」的決定。

---

## 8. 建議分階段落地順序

比照本專案 `Balance Contract Integration Proposal.md`「建議落地順序」表的既有格式：

| 順序 | 項目 | 依賴 | 粗估工作量 |
|---|---|---|---|
| Phase 0 | `BalanceContract` 新增 `expiryDate`/`issueDate`，`BalanceMovement` 新增 `documentPresentationDate`；DB migration（`src/db/migrations.ts`） | 無 | 小～中 |
| Phase 1 | A2–A10/B2–B6 的①NEW EXPOSURE 控制（原提案已講清楚，落差最小） | Phase 0 | 中 |
| Phase 2 | A6/B4 UI 補上 Maturity Date 輸入點（手動或依 `tenorDays` 自動推算）；A7/B5 補上②EXISTING LIABILITY / MATURITY-SETTLEMENT 判斷（目前完全未實作，優先級應提高） | Phase 0 | 中 |
| Phase 3 | A2/B2 新增「只改 Expiry、不動金額」的 Amendment 子類型（對應知識庫 `LC_AMD_TENOR`） | Phase 0、Phase 1 | 小～中 |
| — | 解決 GAP-15（自然到期範圍界定），若拍板要做才排入 | 與上述各 Phase 平行、不阻塞 | 待定（本文件第 1、6 節已提供評估素材） |

---

## 附錄：原提案逐條覆核記錄

| 原提案段落 | 覆核結果 |
|---|---|
| 開頭「Expiry ≠ Close；Maturity ≠ Settlement」 | ✅ 方向正確，保留 |
| §1 Import A2–A10 表格 | 🟡 大致正確，A10 一格需依第 6 節修正；A3/A6 的「不能因為 processing date 就拒絕」邏輯完全正確但目前無欄位可落地（第 2 節） |
| §2 Export B2–B5 | 🔴 遺漏 B6，已於第 4 節補上 |
| §3「不要只存兩個 Date」 | ✅ 方向正確，第 2 節補上現況落差對照表 |
| §4「兩個 Date 對 Balance 的真正作用」矩陣 | 🟡 正確但不完整——沒有納入「Root Confirmed Balance 同時也是未來 Expiry 殘值釋放要動用的同一個數字」這一層關聯（第 1、6 節） |
| §5「三種 Date Control」 | 🟡 ①②設計正確且與本專案既有 Strategy pattern 相容（第 7 節）；缺③EXPIRY RESIDUAL RELEASE（第 1 節新增） |
| §6 A10 Close Eligibility Engine | ✅ 設計精神完全正確，且與現行 `closeEligibility.ts` 一致；表格裡「Expiry 使 LC 成為 Close Candidate」這句需修正（第 6 節） |
| 最後「最高層 Business Rule」文字 | ✅ 保留，是本文件認為整份提案裡寫得最精準的一段，建議逐字寫進未來的 Design Doc §N |
