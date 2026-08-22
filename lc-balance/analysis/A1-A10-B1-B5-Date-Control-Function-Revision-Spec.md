# A1–A10 / B1–B5 功能修正規格 — LC Expiry Date / Acceptance Maturity Date Control 落地

**核准依據（2026-08-23 更新：GAP-15 已定案）**：本文件第一版曾誤寫「GAP-15 已通過」，第二/三版更正為
「GAP-15 未決，第 6 節維持草稿」。**2026-08-23 業務側已正式回覆 GAP-15**：LC/Confirmation 自然到期的
殘值釋放，不需要 Balance Component 新增 `movementType` 或事件，由外部系統批次判斷後直接呼叫既有的
A10/B6 Maker/Checker API 觸發（完整記錄見 `Natural-Expiry-Scope-Decision-Request.md`）。**因此本文件
現在整份（第 0–9 節，含原本掛在 GAP-15 上的第 6 節）都可以交付開發**——第 6 節內容已改寫為「為何原本
規劃的新事件類型最後確認不需要」的紀錄，不再是待核准草稿。`Balance Contract Integration Proposal.md`
與 `lc-balance/CLAUDE.md` 已同步更新。
**範疇**：A1–A10（Import，10 個功能全部列出，含明確標記「不受影響」的功能）、B1–B5（Export）。**不含
B6**——`closeEligibility.ts` 檔頭註解與審查文件第 4 節已確認 B6 與 A10 共用同一份資格判斷邏輯、且是
「Related Close Control」而非本次 Date-Control 修正的對象，不需另外開規格；本文件最後一節另有簡短說明。
**文件性質**：本文件把審查文件（分析/建議層級）翻譯成具體的欄位/驗證/UI 變更規格（工程落地層級）。凡是
標註「（審查文件 §N）」的內容直接引用自已核准文件；凡是標註「（本規格新增）」的內容是審查文件沒有明講、
為了讓 A1–A10/B1–B5 逐項可落地而補上的工程判斷，需要在下一輪覆核裡確認，不視為已核准。
**日期**：2026-08-22

## 版本說明

| 輪次 | 日期 | 覆核者 | 內容 |
|---|---|---|---|
| 第一版 | 2026-08-22 | — | 初稿，誤寫「GAP-15 已通過」，`ExpiryReleasePolicy` 誤放進 Phase 0 |
| 第二版 | 2026-08-22 | 外部覆核 | 發現核准依據不成立，更正開頭前提、第 6 節加隔離標記、修正 movementType 計數（15+3=18，非「第 16 個」） |
| 第三版 | 2026-08-22 | 外部覆核 | 發現 `ExpiryReleasePolicy` 仍留在「不依賴 GAP-15」的第 0 節、但只有第 6 節用到——已移至第 6 節，第 0 節只留 Phase 0–3 實際會用到的三個欄位；獨立複核確認全部四項問題（核准依據、隔離標記、movementType 計數、`ExpiryReleasePolicy` 範疇）已修正，9.7/10，無新發現 |
| 第四版（本版） | 2026-08-23 | 業務回覆落地 | GAP-15 業務側正式回覆：不需要 `LC_EXPIRE`/`CNF_EXPIRE`，由外部系統批次呼叫既有 A10/B6 API 觸發，兩次獨立呼叫（沿用既有 Maker/Checker 兩步驟形狀），Maker/Checker 身份分離比照 `statusTransition.ts` 既有設計、無新例外。第 6 節整節改寫為「已解決」紀錄，`ExpiryReleasePolicy`/`domain/expiryRelease.ts`/`LC_EXPIRE`/`CNF_EXPIRE`/`EXPIRY_RELEASE_NOT_ELIGIBLE` 全數確認不需要實作；movementType 新增數回歸為 1 個（僅 `AMEND_EXPIRY`，15+1=16）；全文件（第 0–9 節）現在都可交付開發 |

---

## 0. Phase 0 前置：Schema 變更（審查文件 §2、§6.1）

在任何 A1–A10/B1–B5 的功能修正之前，必須先完成的欄位新增（`microservices/balance-component/src/types.ts`
+ `src/db/migrations.ts`）——**僅限第 1–5、7–9 節實際會用到的欄位**。`ExpiryReleasePolicy` 原本規劃只
服務第 6 節（原④EXPIRY RESIDUAL RELEASE 草稿範疇），2026-08-22 曾從本節移到第 6 節；2026-08-23 GAP-15
定案後確認整個 `ExpiryReleasePolicy` 概念都不需要實作，詳見第 6 節：

```ts
// BalanceContract — IPLC_LC/EPLC_LC/EPLC_CONFIRMATION 適用；SHGT/Acceptance 不適用
expiryDate?: string | null;   // UCP 600 Art. 6(d)。（本規格新增判斷：見第 1 節，A1/B1 為必填，其餘情境選填/沿用）
issueDate?: string | null;

// BalanceMovement — A3/A3S/B3 適用
documentPresentationDate?: string | null;   // 提示日期，UCP 14(c) 判斷基準，Business Date 不是 Technical Timestamp
```

`maturityDate`（已存在但從未被讀取的孤兒欄位）不需要新增，只需要被第 2/3 節 A6/B4 那兩列的 Calculated
Maturity Date 邏輯，以及第 4 節 A7/B5 的 Early Settlement 判斷真正讀取——三者都屬於 Phase 0–3，不受
GAP-15 影響。

---

## 1. A1（LC Issue）／B1（Confirm LC）— 新增規則（本規格新增，審查文件未涵蓋 A1/B1）

審查文件的 Function 表格從 A2/B2 開始，沒有涵蓋 A1/B1——但 `expiryDate` 必須有個地方第一次被寫入，邏輯
上只能是 A1/B1（ISSUE，根合約建立當下），對稱於 OAS-GAP-16 CURRENCY DERIVATION「根創建時 currency 必填、
其餘情境省略/推導」的既有先例。

| 項目 | 修正內容 |
|---|---|
| `expiryDate` | **新增必填欄位**（400 若缺）——比照 `currency` 在根創建時必填的既有模式（`resolveOrCreateContract()` rule 3），這是唯一一次呼叫方可以/必須提供 `expiryDate` 的時機 |
| `issueDate` | 選填；省略時預設為 `createdAt` 當天日期（system-derived，不強制要求呼叫方另外輸入） |
| `dateControl`（`FUNCTION_STRATEGIES['A1']`／`['B1']`） | `'NONE'`——A1/B1 本身不被任何日期控制擋下，它是日期的**來源**，不是日期的**判斷對象** |
| UI 影響 | Angular `builder-fields.ts` 的 A1/B1 欄位群組新增 Expiry Date 輸入（必填）、Issue Date 輸入（選填，預設今天） |
| 驗證 | 新增規則：`expiryDate` 不得早於 `issueDate`（或早於今天，若 `issueDate` 省略）——伺服器端 `RequestValidationError` |

---

## 2. Import A2–A10（審查文件 §3，逐項落地）

| Function | LC Expiry Date 控制 | Acceptance Maturity Date 控制 | 具體修正規格 |
|---|---|---|---|
| **A2 LC Amendment** | YES（新曝險閘門） | 通常 NO | **新增 Amendment 子類型**：`AMEND_EXPIRY`（對應知識庫 `LC_AMD_TENOR`）——只改 `expiryDate`、不動 Balance/`ceilingAmount`，`movementTypeRegistry['AMEND_EXPIRY']` 走 `noCheck`（同 `AMEND_INCREASE` 待遇）。Angular `subChoice` 新增第三個 Direction 選項「Extend Expiry」，UI 只顯示新 Expiry Date 輸入，Amount 欄位鎖定/隱藏 |
| **A3 Document Arrival** | YES，看 `documentPresentationDate`（非系統操作日） | NO | `checkUtilizeSufficiency` 呼叫前新增一道檢查：`documentPresentationDate <= contract.expiryDate`，違反則 `RequestValidationError`，新 `reasonCode: 'PRESENTATION_AFTER_EXPIRY'`。Angular `builder-fields.ts` A3 群組新增 Document Presentation Date 輸入（必填，取代目前隱含使用 `createdAt` 的行為） |
| **A3S Document Arrival w/ SG** | 同 A3 | NO | 同 A3 的 `documentPresentationDate` 檢查；SG 贖回腿（`shgtRedeem.ts`）不受影響——維持既有「憑證返還」判斷，跟 Expiry 控制正交 |
| **A4 Sight Settlement** | **NO — 不因 Expired 而 Block** | N/A | **維持現狀，不修改**——`dateControl: 'NONE'`，顯式標記避免未來被共用 Policy 誤攔（審查文件 §7） |
| **A6 Acceptance (Usance)** | YES，看 underlying presentation | **CREATE — 新增 Calculated Maturity Date** | 新增：Maturity Date 預設為 `Calculated = Acceptance Date + tenorDays + Business Day Convention`（審查文件 §6.1），UI 唯讀顯示；勾選「手動調整」+ 填寫理由才可覆寫，覆寫值連同理由存進 `BalanceMovement`（新增 `maturityDateOverrideReason?: string \| null` 欄位）。Tenor 一致性檢查（`tenorRouting.ts`）維持不變，跟 Maturity Date 計算是兩件獨立的事 |
| **A7 Acceptance Settlement** | NO | **YES — Critical，新增 Early Settlement 分類/授權** | 見第 4 節獨立說明（A7/B5 共用同一套邏輯） |
| **A8 Shipping Gtee Issue** | YES — 強控制 | NO | **維持現狀，不修改**——`dateControl` 沿用既有 `NEW_EXPOSURE` 分類即可，SG Issue 檢查對象是父 LC 的 Tight Available Balance，不是 Expiry Date 本身；若要新增「父 LC 已過期不得再開新 SG」的檢查，屬於 Phase 2 才需要決定是否要做，本規格不預設 |
| **A9 Shipping Gtee Redemption** | **NO — 不應 Block** | NO | **維持現狀，不修改**——`dateControl: 'NONE'`，顯式標記 |
| **A10 LC Close** | **見第 5 節，維持 `NONE`** | YES — Outstanding Check（既有邏輯已滿足，不修改） | **維持現狀，不修改**——`dateControl: 'NONE'`，Close 與 Expiry 互相獨立（審查文件 §5），這是本次修正唯一明確「確認不動」的既有邏輯 |

---

## 3. Export B2–B5（審查文件 §4，逐項落地）

| Function | LC Expiry Date 控制 | Acceptance Maturity Date 控制 | 具體修正規格 |
|---|---|---|---|
| **B2 Confirm LC Amendment** | YES | 通常 NO | 同 A2——新增 `AMEND_EXPIRY` 分支（B2 現行走 `AMEND` + `subChoice.key: 'amendDirection'`，Expiry 延展新增為第三個方向選項，同樣不動 `ceilingAmount`） |
| **B3 Present Docs** | YES，看 `documentPresentationDate` | NO | 同 A3——`checkPresentDocsIssueSufficiency` 呼叫前新增 `documentPresentationDate <= contract.expiryDate` 檢查，`reasonCode: 'PRESENTATION_AFTER_EXPIRY'`。與既有 `presentDocsConsumedAt`（B3 真正 Release 後由 B4 消費）機制無衝突，Expiry 檢查接在既有機制之前，不重新設計 |
| **B4 Honour / Acceptance** | YES，不是簡單 Block | **CREATE / CONFIRM — 新增 Calculated Maturity Date** | 同 A6——Usance 分支（`movementType: 'ACCEPT'`）新增 Calculated Maturity Date 邏輯；Sight 分支（`movementType: 'HONOUR'`）不受影響（無 Acceptance 產生） |
| **B5 Settlement — Reimbursement/Maturity** | NO | **YES — Critical，新增 Early Settlement 分類/授權** | 見第 4 節（與 A7 共用同一套邏輯） |

---

## 4. A7／B5 共用：Early Settlement 分類/授權邏輯（審查文件 §6，Critical，本次唯一功能性硬缺口）

這是審查文件標記為 Critical 的唯一一項——`maturityDate` 存在但從未被 `checkRedeemSufficiency`（`domain/
shgtRedeem.ts`，A7/B5 共用的同一個函式）讀取，代表 Settlement 目前可以在到期前無條件送出，且**沒有任何
分類**（連「這是提早清償」這件事本身都沒有記錄下來）。

### 修正規格

```ts
// checkRedeemSufficiency() 呼叫前，新增分類判斷（不是新的 sufficiency 檢查，是新的分類/授權 gate）
if (settlementDate < contract.maturityDate) {
  if (!req.earlySettlementAuthorized) {
    throw new RequestValidationError(
      'Settlement before Maturity Date requires explicit authorization.',
      // 沿用 v1.17.0 已建立的 details.reasonCode 慣例（OAS-GAP-06）
    ); // reasonCode: 'SETTLEMENT_BEFORE_MATURITY_NOT_AUTHORIZED'
  }
  // 通過授權後，仍照原有 checkRedeemSufficiency() 走完整 Available Balance 檢查——
  // Maturity Date 不再是拒絕條件，只是分類標記
}
```

- **新欄位**：`BalanceMovementCreateRequest.earlySettlementAuthorized?: boolean`、
  `earlySettlementReason?: string | null`——Maker 送出時勾選 + 填理由；`BalanceMovement` 對應持久化
  這兩個欄位（Checker 核准時可見，同一個 UI 模式沿用第 2 節 A6/B4 的 Maturity Date 覆寫理由存證模式，
  審查文件 §6.1 已指出兩者應共用同一套「Maker 標記＋Checker 核准可見」UI，不要各自發明一套）。
- **新 `reasonCode`**：`SETTLEMENT_BEFORE_MATURITY_NOT_AUTHORIZED`，加入 OAS `ErrorDetails.reasonCode`
  枚舉（第 6 節有完整清單）。
- **不修改**：既有的 `checkRedeemSufficiency()` Available Balance 比對邏輯本身——這是分類/授權 gate，
  不是取代原本的餘額檢查。

---

## 5. A10／B6：確認不受影響（審查文件 §5，維持現狀）

A10（本規格範疇內）與 B6（本規格範疇外，但邏輯相同）的 `evaluateCloseEligibility()` 完全不檢查
Expiry Date——Close 是 Maker/Checker **主動、提前**觸發，資格條件只看「歸零 + 無 Open Events」，跟
Expiry Date **互相獨立、不互為先決條件**。本次修正**不改動** `closeEligibility.ts` 任何一行。

---

## 6. ✅ GAP-15 已解決（2026-08-23）：不需要 `LC_EXPIRE` / `CNF_EXPIRE`，沿用既有 A10/B6 API

> **本節內容已由第一/二版取代**：原本規劃的 `LC_EXPIRE`/`CNF_EXPIRE`（審查文件 §1，④EXPIRY RESIDUAL
> RELEASE CONTROL）**不需要實作**。業務回覆：LC/Confirmation 自然到期的殘值釋放，由**外部系統**依
> `expiryDate` + 自己的業務政策批次判斷，分別呼叫既有的 A10（Import）/B6（Export）Maker/Checker API
> （`POST /balance-movements` 建立 PENDING、`POST .../release` 核准，兩次獨立呼叫——本來就是既有的
> 兩步驟形狀，不需要新端點），跟人工在 UI 上操作走同一條路徑。Balance Component 不知道、也不需要知道
> 呼叫方是排程系統還是真人——這正是 `service/balanceService.ts` 本來就不知道呼叫方身份的既有設計
> 哲學。完整回覆記錄見 `Natural-Expiry-Scope-Decision-Request.md`。

**這代表**：`buildMovementTypeRegistry()` **不需要**新增 `LC_EXPIRE`/`CNF_EXPIRE`，`domain/
expiryRelease.ts`（獨立於 `closeEligibility.ts` 的資格判斷）**不需要**建立，`ExpiryReleasePolicy`
（floatDays/holidayCalendar/placeOfExpiryTimezone 等排程參數）**不需要**當作 Balance Component 自己的
設定 schema——排程/計日邏輯是外部系統自己的事，Balance Component 的 `evaluateCloseEligibility()`
（`closeEligibility.ts`）維持完全不變，本來就是給任何呼叫方用的通用檢查，不分是人還是排程系統呼叫。

> **⚠️ 常見誤解，實作前務必看清楚**：GAP-15 落地**不是**「在 `evaluateCloseEligibility()`／
> `closeEligibility.ts` 裡加一條『`expiryDate` 必須已過期』的條件判斷」。這樣加是**錯的**，會直接違反
> 已經確認的既有設計——`closeEligibility.ts` 檔頭自己講的「cancellation **before** expiry」，A10/B6
> Close 本來就允許在 LC **尚未過期**時提前結案（第 5 節），這條規則沒有被本次 GAP-15 決策改變。
> `expiryDate` 過期與否的判斷**只發生在 Balance Component 外部**（呼叫方自己決定何時觸發呼叫），
> Balance Component 收到 A10/B6 的 Submit/Release 呼叫時，一律只看 SG/Acceptance/Open Events 這三個
> 既有條件，完全不看 `expiryDate`。唯一要做的事是讓 `expiryDate` 這個**欄位**存在、可以被外部系統
> 讀取——是加欄位，不是加判斷式。

**批次觸發的 Maker/Checker 身份分離**：查證 `domain/statusTransition.ts` 既有設計——「Maker and
Checker being the same person is NOT enforced here... out of scope for this service's own state
machine」（2026-08-14 業務指示，已是既定設計）。批次觸發沒有引入新的例外，這是呼叫方（外部系統/銀行
權限政策）自己的責任，不是 Balance Component 的狀態機要管的事。

**Balance Component 因此需要的東西，全部已經涵蓋在第 0、5 節裡**：`expiryDate` 欄位（第 0 節，Phase
0–3，供外部系統讀取）+ `GET /balance-contracts/close-eligible` 查詢維持準確（已存在，見第 5 節）。
**沒有額外的第六節工程工作**——這一節保留只是為了記錄「為什麼原本規劃的新事件類型最後沒有做」，供未來
回頭查證用。

---

## 7. `FUNCTION_STRATEGIES` 擴充（審查文件 §7，本規格給出實際型別變更）

```ts
// function-strategy.ts — FunctionStrategy 介面新增第五個分類
export interface FunctionStrategy {
  code: string;
  movementDerivation: MovementDerivationStrategy;
  compoundSubmission: CompoundSubmissionStrategy;
  checkerRelease: CheckerReleaseStrategy;
  selectionFlow: SelectionFlowStrategy;
  dateControl: DateControlKind;   // 本規格新增
}

type DateControlKind =
  | 'NEW_EXPOSURE'           // A2/A8/B2
  | 'EXISTING_LIABILITY'     // A3/A3S/B3
  | 'MATURITY_SETTLEMENT'    // A7/B5（含第 4 節 Early Settlement 分類）
  | 'NONE';                  // A1/A4/A9/A10/B1/B4(Sight 分支)

// A6/B4(Usance 分支) 的 Calculated Maturity Date 邏輯不是獨立 dateControl 分類，
// 是 movementDerivation 底下的欄位自動帶入行為（同 amountAutoFilledFrom 既有模式）——
// 審查文件④EXPIRY RESIDUAL RELEASE 對應的 movementType 已於 GAP-15 定案後確認不需要實作（見第 6 節），
// 沒有對應的 dateControl 值，FUNCTION_STRATEGIES 裡不會出現
```

`dateControl: 'NONE'` 的顯式標記，比照審查文件 §7 引用的既有教訓（F-09 `eligibility-rule.ts` 合併時
A8 的 0-balance exclusion 被默默吃掉）——A1/A4/A9/A10/B1 必須顯式標成 `NONE`，不能靠「沒命中規則所以
放行」。

---

## 8. 新增 `reasonCode` 匯總（併入 OAS `ErrorDetails.reasonCode` 枚舉，延續 GAP-06 慣例）

| `reasonCode` | 觸發函式 | 對應 Function |
|---|---|---|
| `PRESENTATION_AFTER_EXPIRY` | A3/A3S 的 `checkUtilizeSufficiency` 前置檢查、B3 的 `checkPresentDocsIssueSufficiency` 前置檢查 | A3、A3S、B3 |
| `SETTLEMENT_BEFORE_MATURITY_NOT_AUTHORIZED` | A7/B5 共用的 `checkRedeemSufficiency` 前置分類 gate | A7、B5 |

（原本規劃的 `EXPIRY_RELEASE_NOT_ELIGIBLE` 已隨 GAP-15 定案移除——見第 6 節，不需要新的 eligibility
函式，`closeEligibility.ts` 既有的 reasonCode 已足夠。）

---

## 9. 本規格未涵蓋、需要另外確認的事

- **`AMEND_EXPIRY` 是否需要獨立 sufficiency 檢查**——本規格假設走 `noCheck`（延展 Expiry 不動 Balance），
  但若延展 Expiry 同時牽動 ECL/CCF 重新計算（知識庫 `LC_AMD_TENOR` 描述），這部分屬於 Payment/Charge
  Component 職責（範疇界線，`CLAUDE.md` 開頭），本規格不預設 Balance Component 自己要算。
- **A6/B4 Maturity Date 覆寫的 Checker 端 UI**——本規格只定義資料要存證，畫面上 Checker 端具體怎麼呈現
  覆寫理由，留給前端設計階段。
- **外部批次系統本身的排程/計日邏輯**（誰觸發、多久跑一次、失敗重試、`floatDays`/`holidayCalendar` 這
  類參數）——GAP-15 定案後確認完全是外部系統自己的職責，不屬於 Balance Component 的規格範圍，本文件
  不再涵蓋。

## B6 附註（範疇外，僅供交叉確認）

B6 不在本規格內，因為它與 A10 共用同一份 `evaluateCloseEligibility()`，第 5 節「不受影響」的結論對 B6
同樣成立，不需要另開一份規格重複同一件事。
