# LC Expiry Date / Acceptance Maturity Date 控制提案 — 審查與修訂

**審查對象**：LC Expiry Date 與 Acceptance Maturity Date 對 A2–A10 / B2–B6 的控制設計
**審查依據**：`lc-balance/CLAUDE.md` 決策日誌、`microservices/balance-component/src` 實際原始碼、`cs-tf-balance-knowhow` 知識庫（`rationale-en.md` §3.9/§7.7、§12 不變式 I4/I12、§14「Implementation checklist」；`impl-spec-en.md` §13「Deployment validation gates」/§14「Build sequence」——**兩份文件的章節編號各自獨立，同樣是「§14」但內容不同，第四輪外部覆核發現本文件第一版把 §12/§14 的內容誤標成 `impl-spec-en.md`，已於本版全數改為正確的 `rationale-en.md` 出處**）——`closeEligibility.ts` 檔頭註解本身就引用「cs-tf-balance-knowhow's rationale §3.9/§7.7」，所以這份知識庫是本提案理應對齊的同一份權威依據，不是外部引入的新標準
**審查日期**：2026-08-22

## 審查與版本歷程

| 輪次 | 內容 | 綜合評分 | 狀態 |
|---|---|---:|---|
| 第一輪 | 逐條核對原提案與現行原始碼，發現「Expiry 只擋新曝險、未觸發殘值釋放」為 Critical 缺口，並補上被遺漏的 B6 | — | 已交付 |
| 第二輪 | 依第二輪覆核意見（同一角色設定，9.3/10，要求三項修正後採用）逐項採納：**A7/B5 Maturity 改為可授權的 Early Settlement 例外而非硬性 Gate**、**`mail_float_grace` 改為可配置政策**、**Presentation Date 缺口優先級由 Medium 提升至 High**；另修正「第三種控制」與原提案既有③重號的編號錯誤（改為④），並補上 Export B6 的範疇界定說明 | 9.3 → 全數採納 | 已交付 |
| 第三輪 | 依第三輪覆核意見（9.7/10，**APPROVE WITH MINOR ENHANCEMENTS**）採納三項次要建議：**Phase Sequencing 依 Risk Priority 重排**（A7/B5 Maturity Control 提前到 Phase 1）、**Acceptance Maturity Date 正式定義為 Calculated（Base Date + Tenor + Business Day Convention），Maker 僅在被授權時可覆寫**、**`floatDays` 補上 Calendar/Business Days 區分與 `holidayCalendar`/`placeOfExpiryTimezone`**；並依覆核意見在文件開頭正式標註為「已核准的 Design Decision Basis」，附上最高層 Business Principle | 9.7 — APPROVE WITH MINOR ENHANCEMENTS | 已交付 |
| 第四輪 | 獨立於前三輪的**引用核實**（直接逐條比對 `cs-tf-balance-knowhow` 原始檔案，而非只核對程式碼宣稱），8.6/10，「可開發但分兩軌走」。發現兩項引用問題，**逐條重新核對原始檔案後**：**引用出處錯誤（真實）**——第 9 節/文件開頭把 `rationale-en.md` §14「Implementation checklist」（含「Must fix before go-live」清單，`LC_EXPIRE`/`CNF_EXPIRE` 確實列於其中）誤標成 `impl-spec-en.md` §14——`impl-spec-en.md` §14 其實是「Build sequence」，內容不同，兩份文件章節編號各自獨立；已修正出處，並補上 `impl-spec-en.md` §14 Phase 2 scope「expiry batch」作為第二份文件的獨立佐證。**I4/I12「被揉合改寫」的指控（不成立）**——直接重新對照 `rationale-en.md` §12 原文，本文件的 I4/I12 引用逐字相符，未被改寫；已於附錄四記錄核對過程與結論 | 8.6（其中「引用出處錯誤」項成立並已修正；「I4/I12 被改寫」項經重新核對不成立） | 已交付 |
| 第五輪（本版） | 第四輪覆核者自行重新核對 `rationale-en.md` 第 1557-1576 行、第 1663-1685 行後，**撤回自己上一輪「I4/I12 被揉合改寫」的指控**，確認附錄四的核對結果（引用逐字相符、未被改寫）成立，錯誤出在第四輪覆核只查了 `impl-spec-en.md` 自己的 I4/I12 與 §14，沒意識到兩份文件章節編號各自獨立。「引用出處標錯檔名」（`impl-spec-en.md` → `rationale-en.md`）維持認定為真實問題，已在第四版修正，本身不影響設計邏輯與程式碼層面宣稱的正確性。**最終結論：Phase 0–3 可交付開發，④EXPIRY RESIDUAL RELEASE 續與 GAP-15 掛鉤，文件本身可送出** | 9.5（出處標錯本身仍列入文件品質扣分，內容與設計邏輯全部確認無誤） | 本文件 |

各輪覆核的完整意見與計分保留在會議/對話紀錄中，不重複嵌入本文件正文（比照 `Balance Contract Integration Proposal.md` 自己的既有慣例：版本歷程只記重點，不把每輪覆核全文搬進來）。本文件末尾附錄二、附錄三、附錄四分別列出第二、第三、第四輪覆核逐點的採納/核實結果。

---

> ## ✅ 已核准並確認可送出（第三輪 9.7/10 APPROVE WITH MINOR ENHANCEMENTS → 第四輪引用核實 8.6/10 → 第五輪覆核者自行覆核後確認引用準確、定案 9.5/10）
>
> 本文件經三輪內部覆核（同一 CITF/Trade Finance Balance Solution Architect 角色設定）後核准，作為 **Balance Component Expiry / Maturity Date Control 的正式 Design Decision Basis**；第四輪為獨立於前三輪之外的**引用核實**（直接比對 `cs-tf-balance-knowhow` 原始檔案），修正了一處真實的引用出處錯誤（見附錄四）；第五輪由第四輪覆核者自行重新核對原始檔案後，撤回上一輪對 I4/I12 的錯誤指控，確認引用準確，設計邏輯與程式碼層面的宣稱始終未被推翻——**Phase 0–3（欄位補齊、A7/B5 Maturity Control、NEW EXPOSURE 控制、Amendment 子類型）可交付開發，④EXPIRY RESIDUAL RELEASE 維持與 GAP-15 決策掛鉤，文件本身可送出**。以下最高層 Business Principle 為本文件的結論濃縮，比照 CLAUDE.md 既有「建議寫進最高層 Business Rule」的慣例（見 `lc-payment-wc/CLAUDE.md`「Charge Component ↔ Payment Component boundary」段落同一寫法），可直接引用進未來的 Design Doc 或決策日誌：
>
> > **LC Expiry Date governs new contingent exposure and the eventual release of residual unused contingent liability, but does not automatically extinguish valid existing obligations. Acceptance Maturity Date governs the due lifecycle of an established Acceptance, while settlement before maturity must be explicitly classified and authorized rather than automatically rejected.**
>
> 中文對照：**LC Expiry Date 控制新曝險的產生，以及未動用殘值最終的釋放，但不自動消滅到期前已合法成立的既有義務；Acceptance Maturity Date 控制已成立 Acceptance 的到期生命週期，到期前的清償必須被明確分類並取得授權，而不是自動拒絕。**

## 0. 結論先講：框架方向對，第二輪覆核指出的三項修正已全數採納

原提案把 LC Expiry Date 和 Acceptance Maturity Date 拆成兩條獨立控制軸（「是否能產生新曝險」vs.「已存在的 Acceptance 何時到期」），並主張 **Expiry 不等於 Close、Maturity 不等於 Settlement**。這個方向是對的，也符合 UCP 600 Art. 14(c)（21 天提示期以裝運日起算、且不得晚於 Expiry）與 IAS 32.11 / IFRS 9 3.1.1（Acceptance 一旦成立即為表內負債，不因母證 Expiry 而消滅）的國際慣例，予以保留。

第一輪覆核核對 `cs-tf-balance-knowhow` 之後，找到一個會讓「或有負債永遠掛帳」的重大遺漏——這正是該知識庫「Defects to look for」checklist 上列的**最常見缺陷**：

> **"No expiry event" → Contingent stranded forever — commonest cause of an overstated off-BS book.**
> （`SKILL.md`「Defects to look for」表，`rationale-en.md` §3.9/§7.7）

第二輪覆核完全同意這個發現，並在三個地方要求收緊，本版已全數採納：

| # | 第二輪覆核要求 | 本版處理 |
|---|---|---|
| 1 | A7/B5 Maturity Control 要提升到 Critical，**但不能設計成硬性 Gate**——Trade Finance 存在 Early Settlement/Prepayment/Discount，必須是「先分類、再視是否授權」而非「一律拒絕」 | 新增第 6 節，補上 Early Settlement 例外的完整判斷邏輯 |
| 2 | `mail_float_grace` 概念正確，但**不可 hard-code**，必須是可配置的 bank/operational policy | 第 1.1 節新增，並比照本專案既有 `tolerancePct` 的「合約層可配置欄位」慣例 |
| 3 | Presentation Date 缺口優先級應從 Medium 升為 High | 第 0、第 3 節已調整 |

另外處理兩個編號/範疇問題：原提案第 5 節本來就有「①②③」三種 Date Control，第一輪覆核新增的「殘值釋放」控制誤標成「③」，與既有的③重號——本版改標為**④**；並依第二輪覆核建議，把 B6 明確標註為「Related Close Control」而非與 A2–A9/B2–B5 同類的「日期直接決定是否放行」型 Date Control，避免範疇混淆（見第 4 節）。

**優先級標記沿用 CLAUDE.md 角色慣例（Critical/High/Medium/Low）**，本版審查發現的優先級如下（依第二輪覆核意見調整後）：

| # | 發現 | 優先級 |
|---|---|---|
| 1 | Expiry 只控「新曝險」，未觸發「殘值釋放」——與 GAP-15 直接相關 | **Critical** |
| 2 | 提案假設 `expiryDate`/`maturityDate` 是已存在且被讀取的欄位，但 `expiryDate` 在現行 schema 裡根本不存在，`maturityDate` 存在但從未被任何領域邏輯讀取 | **Critical** |
| 3 | A7/B5 目前對 Maturity Date 完全沒有判斷，Settlement 可在到期前送出；且設計上不能做成一律拒絕的硬性 Gate | **Critical**（第二輪覆核提升） |
| 4 | B6（Export Confirmed LC Close）完全沒出現在最初提案的 Export 段落 | **High** |
| 5 | 最初提案「Expiry 使 LC 成為 Close Candidate」與現行 `closeEligibility.ts` 的實際資格條件不符 | **High** |
| 6 | Presentation/Received Date 目前在系統中不存在，A3/A6 的「不能只看 processing date」建議目前無欄位可落地 | **High**（第二輪覆核提升） |
| 7 | `mail_float_grace` 若設計成單一固定天數常數，會違反「不同到期地點/遞交管道/銀行政策各不相同」的業務事實 | **High** |
| 8 | A2/B2 目前的資料模型只有 Amount 導向的 AMEND_INCREASE/DECREASE，沒有「只改 Expiry Date、不動金額」的 Amendment 型態 | **Medium** |

---

## 1. Critical：Expiry 除了「擋新曝險」，還要「釋放殘值」——第四種 Date Control

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

對應到 `rationale-en.md` §12「Invariants to enforce in code, not in reporting」的不變式（原文逐字引用，非摘要改寫——第四輪外部覆核質疑這兩條被「揉合改寫」，經直接重新核對原始檔案確認並無此事，見附錄四）：

```text
I4  No undertaking may remain OUTSTANDING past expiry + presentation period + float
    without an explicit LC_EXPIRE / CNF_EXPIRE event.
I12 No contingent survives expiry_date + mail_float_grace without an explicit expiry event,
    and the trigger never adds Art. 14(c)'s 21 days (§3.9).
```

一個完整的 LC Expiry Date 控制設計，除了原提案已經講對的「①擋新曝險」之外，**還需要一種原提案完全沒有的控制型態**——原提案第 5 節的「三種 Date Control」（①NEW EXPOSURE／②EXISTING LIABILITY／③MATURITY-SETTLEMENT）不動，新增為第四種：

**④ EXPIRY RESIDUAL RELEASE CONTROL（原提案缺漏，本版新增）**

適用：一個**日期觸發（非 Maker/Checker 觸發）**的新事件，沿用知識庫命名為 `LC_EXPIRE`（Import）／`CNF_EXPIRE`（Export），**不落在 A2–A10 / B2–B6 這組 Maker/Checker Function 裡**，因為它的觸發方式本質上不同（排程/批次，不是人工送單）。

```text
LC Expiry Date + Mail Float Grace（不是 Expiry Date 當天——見第 1.1 節，這個 Grace 是政策參數，不是常數）
        ↓
是否有 PENDING 的 Document Arrival/Present Docs 事件（A3/A3S/B3）尚未終結？
        ↓ YES → 暫緩釋放，等該筆 Presentation 走完（可能是提前寄出、到期後才到）
        ↓ NO
釋放 Root Confirmed Balance 的殘值（等同 A10/B6 Close 寫掉的同一個數字，
但「資格條件」不同——見第 5 節）
        ↓
同時釋放：對應的 ECL 提列、額度佔用、未攤銷手續費（轉收益）、保證金
（後三項落在 Payment/Charge Component，本 Balance Component 只負責曝險本身）
```

**這一項不需要現在就實作**——立場與 `Natural-Expiry-Scope-Decision-Request.md` 一致：這是要業務/架構側先拍板「這是不是本合約該做的事」的問題，不是工程面自行判斷（第 9 節詳述）。

### 1.1 `mail_float_grace` 必須是可配置政策，不可寫成固定常數（第二輪覆核要求，本版新增）

第一輪版本只給了「要加 Grace Period」的概念，沒有講清楚這個 Grace 該怎麼落地——第二輪覆核指出的問題是對的：一個全域寫死的天數，禁不起真實業務情境（到期地點在海外、遞交管道是紙本快遞 vs. 電子交單、不同銀行的內部政策）。修正如下：

```typescript
// 不要這樣寫（第一輪版本隱含的寫法，第二輪覆核正確地擋下）
const MAIL_FLOAT_GRACE_DAYS = 7;  // ❌ 全域常數，無法反映業務差異

// 也不要只做到這一步（第二輪版本，第三輪覆核指出還不夠精確）
interface ExpiryReleasePolicy_v2 {
  floatDays: number;   // ⚠️ 3 是 3 個「日曆日」還是 3 個「銀行營業日」？未定義，未來仍會產生歧義
}

// 第三輪覆核要求：floatDays 需要明確計日基準（Calendar vs. Business Days）與所在地曆法/時區
interface ExpiryReleasePolicy {
  placeOfExpiry: string;                 // UCP Art. 6(d) — 到期地點，觸發基準是這裡的日期，不是開狀行自己的日期
  floatDays: number;                      // 銀行/分行/通路自訂，非全域固定值
  floatDayCountConvention: 'CALENDAR_DAYS' | 'BUSINESS_DAYS';  // 明確計日基準，消除「3 天」的歧義
  holidayCalendar?: string;               // BUSINESS_DAYS 時必填——對應到期地點的假日曆（銀行不營業日不計入）
  placeOfExpiryTimezone: string;          // 到期地點的時區——決定「當地日期」何時真正跨過 expiryDate
  deliveryChannel?: 'COURIER' | 'BANK_COUNTER' | 'ELECTRONIC';  // 不同遞交管道，合理 float 天數不同
  requiresOpenPresentationCheck: boolean; // 釋放前是否需先確認無 PENDING 的 A3/A3S/B3（沿用 closeEligibility.ts 的 hasOpenEvents 精神）
}

expiryReleaseDate = addFloat(expiryDate, policy.floatDays, policy.floatDayCountConvention, policy.holidayCalendar);
// 政策決定的 float，不是寫死的天數；BUSINESS_DAYS 時必須套用 holidayCalendar 才能正確算出實際釋放日
```

這個設計方向剛好呼應本專案自己既有的慣例——`tolerancePct`/`ceilingAmount`（CLAUDE.md「Tolerance conversion」段落，§6.2）本來就是「合約層可配置欄位」而不是寫死常數，`ExpiryReleasePolicy` 應該用同一種模式：**掛在合約（或銀行層級的政策表）上，不是程式碼裡的魔術數字**。若未來要落地，`floatDays` 這類欄位應該比照 `tolerancePct` 一樣進 `BalanceContract` schema（或獨立的政策設定表），不要寫進 `domain/` 的常數檔。`floatDayCountConvention`/`holidayCalendar`/`placeOfExpiryTimezone` 三個欄位屬於「enterprise-grade 才需要收斂」的精度需求（第三輪覆核用詞），Phase 0 若時間有限，至少要先把 `floatDayCountConvention` 這個 enum 定義出來——即使 v1 只支援 `CALENDAR_DAYS`，欄位存在也能避免日後有人誤讀「3」的單位。

---

## 2. 現況落差：提案討論的欄位，一個不存在、一個從未被讀取

原提案建議 Balance Component 至少要有 `LC Issue Date / LC Expiry Date / Document Presentation Date / Acceptance Date / Acceptance Maturity Date / Settlement Date` 六個業務日期，方向正確；但實際核對 `microservices/balance-component/src` 之後，現況是：

| 提案建議欄位 | 現況 | 依據 |
|---|---|---|
| `LC Expiry Date` | **完全不存在** —— `BalanceContract` 型別裡沒有任何 expiry 相關欄位 | `microservices/balance-component/src/types.ts` 全檔 grep 無 `expiryDate` |
| `Acceptance Maturity Date` | **存在，但是孤兒欄位**——只在 API request 型別接收、只被寫進 DB，**從未被任何 `domain/` 邏輯讀取或比對**；Angular 前端目前也沒有任何一個畫面（含 A6/B4 Acceptance 建立畫面）會送出這個值 | `service/balanceService.ts:146,1500`、`store/balanceContractStore.ts:57,138,159`；`src/app/transaction-builder` 全目錄 grep 無 `maturityDate` 命中 |
| `Document Presentation / Received Date` | **不存在** | `types.ts` 無對應欄位 |
| `LC Issue Date` / `Acceptance Date` / `Settlement Date` | **不存在**（`createdAt`/`eventSeq` 等系統時間戳記不等同業務日期） | 同上 |

**第二輪覆核把 Presentation Date 這一格的優先級由 Medium 提升為 High**，理由完全成立：沒有這個欄位，下面這個原提案自己舉的例子在系統裡**根本無法判斷**——

```text
Expiry Date = 30-Sep
Presentation = 29-Sep
Processing (createdAt) = 02-Oct
```

系統目前只看得到 `createdAt = 02-Oct`，沒有辦法還原「這筆 Presentation 其實在 29-Sep 就已經有效成立」這個事實。這也是本文件要正式立為架構不變式的原因（見下）。

**Business Date ≠ System Timestamp——建議列為 Balance Component 的架構不變式（第二輪覆核建議，本版採納）：**

```text
Business Date（業務事實，驅動 Control 判斷）
─────────────────────────────────────────
expiryDate
presentationDate
acceptanceDate
maturityDate
settlementDate

Technical Timestamp（系統事實，僅供稽核追蹤，不得用來做業務判斷）
─────────────────────────────────────────
createdAt / submittedAt / releasedAt / updatedAt
```

任何一條 Date Control 規則，判斷式裡出現的都必須是左欄，出現右欄視為設計缺陷（原提案已經用「02-Oct > 30-Sep 不能直接拒絕」這個例子點出這件事，本節把它提升為正式的架構規則，而不只是個案提醒）。

**建議把「補欄位」列為 A2–A10/B2–B6 控制邏輯之前的 Phase 0（見第 10 節），並沿用本專案既有的欄位命名慣例**：

```ts
// BalanceContract（IPLC_LC / EPLC_LC / EPLC_CONFIRMATION 適用；SHGT/Acceptance 不適用）
expiryDate?: string | null;
issueDate?: string | null;

// BalanceMovement（A3/A3S/B3 適用）
documentPresentationDate?: string | null;   // 提示日期，UCP 14(c) 判斷基準
```

---

## 3. Import LC：A2–A10（修訂版）

| Function | LC Expiry Date 控制 | Acceptance Maturity Date 控制 | 修訂建議 |
|---|---|---|---|
| **A2 LC Amendment** | **YES（新曝險閘門）** | 通常 NO | 現行 `AMEND_INCREASE`/`AMEND_DECREASE`（`domain/amendDecrease.ts`）是純金額導向，**沒有「只改 Expiry Date、不動金額」的 Amendment 型態**（知識庫 `LC_AMD_TENOR`：Expiry/tenor change｜none｜ECL+CCF bucket recalc, no amount move，目前無對應實作）。延展 Expiry 本身就是一筆正常的 Amendment，不是特殊授權流程，只是不動 Balance（見第 8 節） |
| **A3 Document Arrival** | **YES，但看 Presentation Date（High——不是系統操作日）** | NO | 判斷基準必須是 Business Date 不是 Technical Timestamp（第 2 節）。目前系統無 `documentPresentationDate` 欄位，**此規則目前無欄位可落地**，列為 Phase 0 前置工作 |
| **A3S Document Arrival w/ SG** | 同 A3，需考慮既存 SG | NO | SG 解除是「憑證返還」而非金額比對（`shgtRedeem.ts`、`Balance-Component-Business-Rule-Decisions-2026-08-21.md` 決策 1），跟 Expiry 控制彼此獨立 |
| **A4 Sight Settlement** | **NO — 不因 Expired 而 Block** | N/A | 符合現行系統精神（`release()` 只檢查 Sight 是否已 Maker Submit，完全沒有 Expiry 檢查） |
| **A6 Acceptance (Usance)** | YES，但需看 underlying presentation | **CREATE** | 「Maturity Date 於 Acceptance 建立時產生/確認」目前 UI 上完全沒有輸入點——`maturityDate` 只存在於 API/DB layer。落地時要決定：Maker 手動輸入，還是由既有的 `tenorDays` + Acceptance Date 系統自動推算 |
| **A7 Acceptance Settlement** | NO | **YES — Critical，見第 6 節** | 目前 `maturityDate` 存在卻從未被讀取，Settlement 可在 Maturity 之前送出，且**不能設計成到期前一律拒絕**——見第 6 節的 Early Settlement 例外 |
| **A8 Shipping Gtee Issue** | **YES — 強控制** | NO | 維持 |
| **A9 Shipping Gtee Redemption** | **NO — 不應 Block** | NO | 維持，與知識庫非負原則 #2（SG 解除是憑證導向）一致 |
| **A10 LC Close** | **見第 5 節，此欄修正** | **YES — Outstanding Check** | Acceptance Balance 必須為 0 這點正確；「Expiry 使 LC 成為 Close Candidate」與現行 `closeEligibility.ts` 不符，見第 5 節 |

---

## 4. Export Confirmed LC：B2–B6（修訂版）

> **範疇界定（第二輪覆核建議，本版採納）**：本節的**主要 Date-Control 範疇是 B2–B5**——這四個 Function 的 Expiry/Maturity 控制，跟 Import 側 A2–A9 一樣，是「日期直接決定是否放行」的即時判斷。**B6 屬於 Related Close Control**：它跟 Expiry Date 沒有直接的放行/擋單關係（見第 5 節），是「與 A10 同一類、需要被明確排除誤解」的功能，不是同一種意義下的 Date Control。維持把 B6 列在本文件內，因為它與 A10 共用同一份資格判斷邏輯，拆開討論反而增加理解負擔，且最初需求本來就明講 A2–A10/B2–B6 的完整範圍。

| Function | LC Expiry Date 控制 | Acceptance Maturity Date 控制 | 建議 |
|---|---|---|---|
| **B2 Confirm LC Amendment** | **YES** | 通常 NO | 同 A2。另提醒：`Balance-Component-Business-Rule-Decisions-2026-08-21.md` 決策 2 已定案「Export 側不接受 `BUYERS_USANCE`」，是另一條與 Expiry 控制正交的規則 |
| **B3 Present Docs** | YES，但看 Presentation Date（High） | NO | 同 A3。B3 已於既有決策改為「真正 Release」設計，`presentDocsConsumedAt` 追蹤是否已被 B4 消費——Expiry 控制要接在這個既有機制之後 |
| **B4 Honour / Acceptance** | YES，但不是簡單 Block | **CREATE / CONFIRM** | 同 A6，UI 未接 `maturityDate` 的落差同樣存在 |
| **B5 Settlement — Reimbursement / Maturity** | **NO** | **YES — Critical，見第 6 節** | 同 A7，Early Settlement 例外同樣適用 |
| **B6 Confirmed LC Close（Related Close Control）** | **見第 5 節** | **YES — Outstanding Check** | `closeEligibility.ts` 檔頭註解確認：**A10 與 B6 共用同一個 `evaluateCloseEligibility()` 函式**，資格條件完全相同（SG=0、Acceptance=0、無 Open Events），不需另外設計——這正是「Balance Component 只負責 Contingent Liability」範疇界線落地得很乾淨的一個例子 |

---

## 5. A10 / B6 Close 的資格條件修正：Expiry 不是 Close 的必要條件

原提案第 6 節把 A10 設計成「Eligibility Engine」，方向完全正確，而且**現行 `closeEligibility.ts` 已經就是照這個精神實作的**：

```ts
// microservices/balance-component/src/domain/closeEligibility.ts
export function evaluateCloseEligibility(inputs: CloseEligibilityInputs): CloseEligibilityResult {
  // 條件：alreadyClosed / sgConfirmedBalance / acceptanceConfirmedBalance / hasOpenEvents
  // —— 完全沒有檢查 Expiry Date
}
```

檔頭註解寫得很直接：這是「**cancellation before expiry**」——Close 存在的目的本來就是讓 Maker/Checker 在 Expiry **之前**主動提前結案。

**修正後的正確描述**：LC Expiry Date 與 A10/B6 Close **互相獨立、不互為先決條件**。Close 的唯一資格條件是「歸零 + 無 Open Events」，不論 LC 是否已過 Expiry Date 都可以送出；反過來，LC 過了 Expiry Date 也不會自動觸發 Close（現行系統沒有任何排程機制），殘值會繼續掛在帳上直到有人手動 Close，或未來實作了第 1 節提到的 `LC_EXPIRE` 事件。

**若未來實作 `LC_EXPIRE`／`CNF_EXPIRE`，其資格條件不能直接沿用 `closeEligibility.ts`**，因為兩者釋放範圍不同（第二輪覆核完全同意這個區分，評為 10/10）：

| | 觸發方式 | 資格條件 | 釋放範圍 |
|---|---|---|---|
| **A10 / B6 Close** | Maker/Checker 主動 | SG=0 **且** Acceptance=0 **且** 無 Open Events | 整筆合約全部結清 |
| **LC_EXPIRE / CNF_EXPIRE（未來）** | 日期觸發（排程） | 只看 Root 自身 Confirmed Balance 是否 > 0；**不要求** SG/Acceptance 先歸零 | 只釋放 Root 自己「未動用」的殘值——Acceptance 一旦成立（on-BS），到期後繼續走自己的 Maturity 週期，不受母證 Expiry 影響 |

建議另開獨立的 `domain/expiryRelease.ts`，不要塞進 `closeEligibility.ts`——兩者資格條件形狀本質不同，硬併在一起會重演本專案自己在 `Balance-Component-Business-Rule-Decisions-2026-08-21.md` 決策 1 才修過的錯誤（A9 誤用 `confirmedBalance` 而非 `availableBalance`）。

---

## 6. Critical：A7 / B5 Maturity Control 不應設計成硬性 Gate — Early Settlement 例外（第二輪覆核要求，本節新增）

第一輪版本只指出「A7/B5 對 Maturity Date 完全沒有判斷」是缺口，但沒有講清楚**該怎麼補**。第二輪覆核正確地指出：如果直接寫成

```text
Settlement Date < Maturity Date → REJECT
```

會跟真實 Trade Finance 業務衝突——Early Settlement、Prepayment、Discount / Early Liquidation、Maker/Checker 已授權的提前清償，都是到期日之前合法送出 Settlement 的正當情境。Maturity Date 應該是**分類點**，不是**一律擋下的硬性關卡**：

```text
Settlement Date >= Maturity Date
        ↓
   NORMAL MATURITY SETTLEMENT（沿用既有 sufficiency check 即可，本身不需要額外授權）
Settlement Date < Maturity Date
        ↓
   EARLY SETTLEMENT
        ↓
   是否已授權 Early Settlement？
        ├── YES → 走 authorized early settlement 路徑
        │         （仍要跑 Available/Tight Available 等既有 sufficiency check，
        │          只是 Maturity Date 不再是 Reject 條件）
        └── NO  → Reject，reasonCode: 'SETTLEMENT_BEFORE_MATURITY_NOT_AUTHORIZED'
```

**落地建議**：

- 這個「是否已授權」不應該是系統自動判斷，而是要有明確的授權來源——可以是 Maker 送出時的一個顯式欄位（例如 `earlySettlementAuthorized: boolean` + 授權理由/文件參照），由 Checker 在核准時一併確認；也可以是銀行層級的政策開關（某些 instrumentType/客戶等級預先核准 Early Settlement）。兩種都比「系統自己猜」更符合 Maker/Checker 4-eyes 的既有精神（CLAUDE.md「4 EYES」相關決策）。
- `reasonCode` 建議比照本專案既有慣例接進 `errors.ts`（`ApiError` 的 `details.reasonCode`，`Balance Contract Integration Proposal.md` OAS-GAP-06/GAP-04 段落已經是這個模式），不要用裸字串訊息。
- 這一格的優先級維持 **Critical**（第二輪覆核意見）——目前完全沒有 Maturity 判斷，代表 A7/B5 現在對「提早/正常」完全不分類，這比原本估計的落差更大：不只是「沒擋」，是「連分類都沒有」，稽核追蹤上也看不出哪些 Settlement 屬於提早清償。

### 6.1 Acceptance Maturity Date 的 Source of Truth：Calculated First，Maker Override 需授權（第三輪覆核要求，本版新增）

第 3 節 A6/B4 那一格原本把「Maturity Date 由 Maker 手動輸入，還是由 `tenorDays` + Acceptance Date 系統自動推算」列成一個待決策的開放選項。第三輪覆核指出這樣留白不夠——如果放任兩種方式並存、且沒有明確何者是主要依據，**同一個 tenor 很容易因為人工計算方式不同而算出不一致的 Maturity Date**（例如遇到假日該不該順延，不同 Maker 可能算法不同）。正式規則應該定義成：

```text
Calculated Maturity Date
      = Base Date（Acceptance Date，A6/B4 CREATE 當下）
      + Tenor（tenorDays，已存在於 BalanceContract）
      + Business Day Convention / Calendar Adjustment（比照第 1.1 節的 holidayCalendar，遇假日順延或提前，依銀行政策）

Maker 僅能在「已被授權」時覆寫 Calculated 值
      —— 例如信用狀本身載明的到期日與標準 tenor 推算結果不同，需要人工對齊單據文字
```

**Source of truth 是 Calculated 值，人工輸入是例外、不是常態**——這與第 1.1 節 `holidayCalendar` 的設計是同一組計日基礎設施，A6/B4 落地時應該直接複用，不要另外做一套。UI 落地建議：畫面預設顯示系統算出的 Calculated Maturity Date（唯讀），只有勾選「手動調整」且填寫理由後才能覆寫，覆寫值連同理由一併存證，供 Checker 核准時檢視——這與第 6 節 Early Settlement 授權需要「明確授權來源，而非系統自行推測」是同一個治理精神，兩者應該共用同一套「Maker 標記＋Checker 核准可見」的 UI 模式，不要各自發明一套。

---

## 7. 建議的實作架構：比照本專案既有 Strategy / Pure-Function Policy 慣例

建議比照 `function-strategy.ts` 的 `FUNCTION_STRATEGIES` 慣例，四種控制型態（含本版新增的第④種）各自對應一個純函式，每個 Function 條目新增欄位指向要套用哪一種：

```ts
type DateControlKind =
  | 'NEW_EXPOSURE'
  | 'EXISTING_LIABILITY'
  | 'MATURITY_SETTLEMENT'   // 內含第 6 節的 Early Settlement 分類/授權邏輯
  | 'EXPIRY_RESIDUAL_RELEASE'  // 不掛在任何 A/B Function 上，是獨立的排程觸發，僅列出以完整表達模型
  | 'NONE';

// 例：
FUNCTION_STRATEGIES['A2']  → dateControl: 'NEW_EXPOSURE'
FUNCTION_STRATEGIES['A3']  → dateControl: 'EXISTING_LIABILITY'
FUNCTION_STRATEGIES['A7']  → dateControl: 'MATURITY_SETTLEMENT'
FUNCTION_STRATEGIES['A9']  → dateControl: 'NONE'   // 明確標記「不受任一日期控制」，避免日後被誤加
FUNCTION_STRATEGIES['A10'] → dateControl: 'NONE'   // 見第 5 節：Close 不吃 Expiry
```

`dateControl: 'NONE'` 這個顯式標記很重要——本專案自己在 F-09（`eligibility-rule.ts` 三個 picker 合併時）就踩過「合併過程中不小心讓某個 Function 的既有例外被默認規則吃掉」的坑（A8 的 0-balance exclusion）。A4/A9/A10 這幾個「明確不受 Expiry 影響」的 Function，顯式標成 `NONE`，避免未來共用 Policy 加新規則時不小心把它們也一起攔住。

`mail_float_grace`（第 1.1 節）與 Early Settlement 授權（第 6 節）都應該是**這一層 Policy 的輸入參數**，不要下沉到個別 Function 的判斷式裡各寫一份。

---

## 8. 整合模型：完整 Date Control Lifecycle

把第 1、5、6 節串起來，完整模型如下（第二輪覆核提出的整合圖，依本文件既有用詞調整節點命名後採納）：

```text
                    LC / Confirmation
                           │
                     Expiry Date
                           │
          ┌────────────────┼────────────────────┐
          │                │                     │
          ▼                ▼                     ▼
    ① New Exposure   ② Existing Liability   ④ Expiry Residual
      Control            Processing            Release Control
          │                │                     │
     A2/A8/B2          A3/A3S/B3            LC_EXPIRE / CNF_EXPIRE
                                             （日期觸發，非 A/B Function，
                                              floatDays 為政策參數）
                           │
                           ▼
                      Acceptance
                           │
                     Maturity Date
                           │
               ┌───────────┴───────────┐
               ▼                       ▼
        Settlement >= Maturity   Settlement < Maturity
               │                       │
     ③ Normal Maturity          Early Settlement
        Settlement                    │
                              是否已授權？(Maker 標記 + Checker 核准 /
                                        銀行政策開關)
                                 ├── YES → Authorized 提前清償
                                 └── NO  → Reject
                                       reasonCode:
                            'SETTLEMENT_BEFORE_MATURITY_NOT_AUTHORIZED'
```

A10/B6 Close 刻意不畫進這張圖——如第 5 節所述，它與 Expiry Date 沒有直接關係，是獨立於這個 Date-driven 模型之外、由 Maker/Checker 主動觸發的另一條路徑，畫在同一張圖裡反而會暗示兩者有先後依賴，那正是最初版本被修正掉的錯誤。

---

## 9. 與 `Natural-Expiry-Scope-Decision-Request.md`（OAS-GAP-15）的關係

本專案目前有一份**尚未拿到答案**的決策請求，問的正是「LC/Confirmation 的自然到期是不是 Balance Component 該管的事」。這份文件的討論（尤其第 1、5、6、8 節）跟這份決策請求問的是同一件事，兩者應該併同討論，而不是各自獨立存在。

本文件立場是：不代替業務/架構側做決定，但**指出這個決策請求本身引用的權威依據（`cs-tf-balance-knowhow` §3.9/§7.7，同時也是 `closeEligibility.ts` A10/B6 設計時引用的同一份依據），已經對這個問題給出了明確立場**——`rationale-en.md` §14「Implementation checklist」把 `LC_EXPIRE`/`CNF_EXPIRE` 列在「**Must fix before go-live**」，不是「視情況而定」的選配項；`impl-spec-en.md` §14「Build sequence」的 Phase 2（Import）scope 欄位也把「expiry batch」列為 Import 建置範圍的一部分，兩份獨立文件方向一致（`impl-spec-en.md` §13「Deployment validation gates」的 G1–G14 沒有專門針對 `LC_EXPIRE`/`CNF_EXPIRE` 命名的部署 gate，這一點不影響上述結論——建置排程與部署 gate 是兩個不同層次的問題，前者已經明講要做，後者沒有專屬 gate 只代表這個事件目前沒有被獨立列為上線關卡，不代表它不屬於建置範圍）。這不等於 GAP-15 就該直接結案定調成「要做」——租戶拓撲、SLA、跟外部批次系統的分工都還沒釐清，是合理的、需要另外討論的落地考量——但「這件事在概念上屬不屬於 Balance Component 的職責範圍」這個較窄的問題，手上已有的同一份設計依據並不支持「完全是外部批次流程的職責、跟本合約無關」這個答案。

**建議**：把本文件（尤其第 1、5、6 節）作為 `Natural-Expiry-Scope-Decision-Request.md` 那次會議的討論素材之一併送出。

---

## 10. 建議分階段落地順序（依第三輪覆核意見，按 Risk Priority 重排）

第二輪版本把①NEW EXPOSURE 控制排在 Phase 1、A7/B5 Maturity Control 排在 Phase 2——但文件自己已經把 A7/B5 定義為 **Critical**（而 NEW EXPOSURE 控制底下的各 Function 並非全部同等 Critical，例如 A4/A9/A10 本來就是 `dateControl: 'NONE'`），Phase 排序與 Priority 標記因此有落差。第三輪覆核指出這一點，本版依風險優先級重排：

| 順序 | 項目 | 依賴 | 粗估工作量 |
|---|---|---|---|
| Phase 0 | `BalanceContract` 新增 `expiryDate`/`issueDate`，`BalanceMovement` 新增 `documentPresentationDate`（優先級隨第 2 節提升至 High）；`ExpiryReleasePolicy`（第 1.1 節，含 `floatDayCountConvention`/`holidayCalendar`/`placeOfExpiryTimezone`）與第 6.1 節的 Calculated Maturity Date 計日基礎設施一併設計，兩者共用同一套曆法/假日邏輯；DB migration | 無 | 小～中 |
| **Phase 1（原 Phase 2，提前）** | **A7/B5 的 Maturity Control + Early Settlement 分類/授權邏輯（第 6 節，Critical）**；A6/B4 UI 補上 Maturity Date 輸入點，落地第 6.1 節「Calculated First、Maker Override 需授權」規則 | Phase 0 | 中 |
| **Phase 2（原 Phase 1，順延）** | A2–A10/B2–B6 的①NEW EXPOSURE 控制 | Phase 0 | 中 |
| Phase 3 | A2/B2 新增「只改 Expiry、不動金額」的 Amendment 子類型（對應知識庫 `LC_AMD_TENOR`） | Phase 0、Phase 2 | 小～中 |
| — | 解決 GAP-15（自然到期範圍界定，含④EXPIRY RESIDUAL RELEASE 與 `mail_float_grace` 政策模型），若拍板要做才排入 | 與上述各 Phase 平行、不阻塞 | 待定 |

**理由**：A7/B5 目前不只是「沒有控制」，而是「連提早/正常都無法分類」，是本文件唯一被評為 Critical 的功能性落差（Presentation Date、`expiryDate` 兩項 Critical 屬於 Phase 0 的欄位前置工作，不是功能落差本身）；NEW EXPOSURE 控制雖然範圍較廣（A2/A8/B2 等），但其中多個 Function 本來就標記 `dateControl: 'NONE'`，真正需要落地的判斷邏輯反而比 A7/B5 單一但更關鍵的 Maturity 判斷更分散、風險密度更低，適合排在 Critical 項目之後。

---

## 附錄一：最初提案逐條覆核記錄

| 提案段落 | 覆核結果 |
|---|---|
| 開頭「Expiry ≠ Close；Maturity ≠ Settlement」 | ✅ 方向正確，保留 |
| Import A2–A10 表格 | 🟡 大致正確，A10 一格依第 5 節修正；A3/A6 邏輯正確但無欄位可落地 |
| Export B2–B5 | 🔴 遺漏 B6，已於第 4 節補上並加註範疇界定 |
| 「不要只存兩個 Date」 | ✅ 方向正確，第 2 節補上現況落差對照表 |
| 「兩個 Date 對 Balance 的真正作用」矩陣 | 🟡 正確但不完整——未納入 Root Confirmed Balance 同時是未來 Expiry 殘值釋放要動用的同一個數字 |
| 「三種 Date Control」 | 🟡 ①②③設計正確；缺④EXPIRY RESIDUAL RELEASE（第 1 節） |
| A10 Close Eligibility Engine | ✅ 設計精神正確，與現行 `closeEligibility.ts` 一致；「Expiry 使 LC 成為 Close Candidate」需修正（第 5 節） |
| 最後「最高層 Business Rule」文字 | ✅ 保留，建議逐字寫進未來的 Design Doc §N |

## 附錄二：第二輪覆核意見採納記錄

| 第二輪覆核意見 | 採納結果 |
|---|---|
| A7/B5 Maturity Control 提升為 Critical，且不應為硬性 Gate，需有 Early Settlement 例外 | ✅ 新增第 6 節，完整判斷邏輯 + 授權機制建議 |
| `mail_float_grace` 需為可配置政策，不可 hard-code | ✅ 新增第 1.1 節，`ExpiryReleasePolicy` 設計 + 對齊本專案 `tolerancePct` 既有慣例 |
| Presentation Date 缺口優先級由 Medium 升為 High | ✅ 第 0、第 2 節已調整 |
| 「第三種控制」措辭應統一改為「第四種」，避免與既有①②③重號 | ✅ 全文改為④EXPIRY RESIDUAL RELEASE CONTROL |
| Export B6 應標註「主要範疇是 A2–A10/B2–B5，B6 為 Related Close Control」 | ✅ 第 4 節新增範疇界定說明框 |
| Business Date ≠ System Timestamp 應列為架構不變式 | ✅ 第 2 節新增 |
| 整合 Date Control Lifecycle 圖 | ✅ 第 8 節採納，依本文件既有用詞調整後納入 |

## 附錄四：第四輪「引用核實」逐項覆核結果

第四輪覆核的方法是獨立於前三輪之外，直接逐條比對 `cs-tf-balance-knowhow` 的原始參考檔案（`rationale-en.md`、`impl-spec-en.md`），而不只是核對程式碼層面的宣稱。以下是本版重新核對後的結論，附核對方式，供後續任何人再次覆核時可直接重現：

| 覆核指控 | 重新核對方式 | 結論 |
|---|---|---|
| 程式碼層面宣稱（`expiryDate` 不存在、`maturityDate` 孤兒欄位、`closeEligibility.ts`/`evaluateCloseEligibility()`、Angular 無 `maturityDate` 輸入點） | 沿用第 2、5 節已列出的檔案/行號 | ✅ 全部屬實，覆核本身也確認無誤，不需修改 |
| `rationale-en.md` §3.9/§7.7 直接引用文字 | 覆核逐字比對原始檔案 | ✅ 屬實，覆核確認無誤 |
| `LC_AMD_TENOR` 事件定義 | 覆核逐字比對原始檔案 | ✅ 屬實，覆核確認無誤 |
| 「`impl-spec-en.md` §14「Implementation checklist」把 LC_EXPIRE/CNF_EXPIRE 列在 Must fix before go-live」——覆核指控這是編造，因為 `impl-spec-en.md` §14 實為「Build sequence」 | 本版重新直接 grep 兩份檔案的章節標題：`impl-spec-en.md` §13 = "Deployment validation gates"（G1–G14 全部列出，無 LC_EXPIRE 專屬 gate）、§14 = "Build sequence"；`rationale-en.md` §14 = "Implementation checklist"，內含「**Must fix before go-live**」標題，`- [ ] Add LC_EXPIRE / CNF_EXPIRE with presentation-period + float trigger (§3.9, §7.7)` 確實列於其下 | **覆核的指控成立，但方向需修正**：不是「這句話是編造的」，而是「這句話真實存在，只是出現在 `rationale-en.md`，不是 `impl-spec-en.md`」——本版已把出處改為正確檔案，並補上 `impl-spec-en.md` §14 Phase 2 scope 裡「expiry batch」一詞作為第二份文件的獨立佐證（該詞確實逐字存在，`impl-spec-en.md:1202`） |
| I4/I12 被「揉合改寫」，且與本文件同一節引用的 §3.9「21 天不可疊加」自相矛盾 | 本版重新直接 grep `rationale-en.md` §12「Invariants to enforce in code, not in reporting」的 I4/I12 原文（`rationale-en.md:1563-1564`、`1574-1575`） | **覆核的指控不成立**：原文逐字為「I4 No undertaking may remain OUTSTANDING past expiry + presentation period + float without an explicit LC_EXPIRE / CNF_EXPIRE event.」「I12 No contingent survives expiry_date + mail_float_grace without an explicit expiry event, and the trigger never adds Art. 14(c)'s 21 days (§3.9).」——與本文件第 1 節的引用逐字相符，並非改寫，也沒有跟 §3.9「不可疊加 21 天」矛盾（I12 本身就是在重申這件事，不是額外加項）。覆核所附的「原文」（"past `expiry_date + mail_float_grace` without an explicit expiry event"）與實際原始檔案不符，是覆核這一項自己的錯誤，本版維持原引用不變 |

**兩項指控合計：一項成立（已修正）、一項經重新核對後不成立（維持原狀，並在此記錄核對依據）**。這個結果本身也呼應第四輪覆核自己的結語——「講得越肯定、越需要回頭對照原始出處」——這次連覆核意見本身的一項具體指控，也是靠直接重新核對原始檔案才能判斷，不能單純因為覆核講得言之鑿鑿就照單全收。

**第五輪後續**：第四輪覆核者自行重新核對 `rationale-en.md` 第 1557-1576、1663-1685 行後，主動撤回「I4/I12 被揉合改寫」這項指控，確認錯誤出在自己上一輪只查了 `impl-spec-en.md` 自己的 I4/I12 與 §14「Build sequence」，沒意識到 `rationale-en.md`／`impl-spec-en.md` 是兩份章節編號各自獨立的檔案。本節結論維持不變：I4/I12 引用從第一版起就是準確的，唯一需要修正的是檔名出處，已於第四版修正。

## 附錄三：第三輪覆核意見採納記錄（9.7/10，APPROVE WITH MINOR ENHANCEMENTS）

| 第三輪覆核意見 | 採納結果 |
|---|---|
| Phase Sequencing 應依 Risk Priority 重排，A7/B5 Maturity Control（Critical）不應排在①NEW EXPOSURE 控制之後 | ✅ 第 10 節重排：A7/B5 提前為 Phase 1，NEW EXPOSURE 控制順延為 Phase 2，並附理由說明 |
| Acceptance Maturity Date 的 Source of Truth 需正式定義為 Calculated（Base Date + Tenor + Business Day Convention），Maker 僅能在被授權時覆寫 | ✅ 新增第 6.1 節，並與第 1.1 節共用同一套曆法/假日基礎設施 |
| `ExpiryReleasePolicy.floatDays` 需區分 Calendar Days / Business Days，並補上 `holidayCalendar`、`placeOfExpiryTimezone` | ✅ 第 1.1 節介面更新，新增 `floatDayCountConvention` enum 與兩個曆法/時區欄位 |
| 建議正式標註為已核准的 Design Decision Basis，並提出最高層 Business Principle | ✅ 文件開頭新增「已核准」區塊與雙語 Business Principle 陳述 |
