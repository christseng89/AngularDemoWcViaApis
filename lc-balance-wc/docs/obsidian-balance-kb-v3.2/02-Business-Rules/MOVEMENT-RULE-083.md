---
knowledge_id: MOVEMENT-RULE-083
title: "A7 Step 1（LC Index）新增 Acceptance 餘額資格閘門——只有名下存在未結 IPLC_ACCEPTANCE 的 Usance LC 才會出現"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-26
tags:
  - balance
  - movement
  - confirmed
---

# MOVEMENT-RULE-083 — A7 Step 1（LC Index）新增 Acceptance 餘額資格閘門——只有名下存在未結 IPLC_ACCEPTANCE 的 Usance LC 才會出現

## Status
CONFIRMED

## Business Rule
使用者於 2026-08-25 回報「A07 交易選擇是 LC number 有 Acceptance balance 再顯示 2ndary ref」：在此之前，A7（Acceptance Settlement）的 Parent LC 選取器（「LC Index」，Step 1）唯一的資格信號是 `catalogTenorFilter: 'USANCE'`——凡 Usance LC 一律列出，無論其名下是否真的存在尚有未結餘額的 `IPLC_ACCEPTANCE` 子合約；Maker 必須先選定該 LC、進入 Step 2（IB Index）後，才會事後發現「0 candidates」的死路。修正方式與 A3S/A9 自身既有的 SG 餘額資格閘門完全同構（[[EXPOSURE-RULE-014]]）：`balance-component.model.ts` 的 A7 條目新增 `requiresEligibleParentAcceptance: true`；`DocumentArrivalHintsService` 將原本 A3S/A9 專用的 `loadSgBalanceEligibility()` 泛化為以 `childInstrumentType` 參數化的 `loadChildBalanceEligibility()`，並新增 `parentAcceptanceEligible` hint-set 與其自身的 `loadParentAcceptanceEligibility()` 包裝方法（`childInstrumentType: 'IPLC_ACCEPTANCE'`）；`maker-panel.component.ts` 的 `resolveParentEligibilityRule()` 新增一個 `requiresEligibleParentAcceptance` 分支，且該分支在原有「`catalogTenorFilter === 'USANCE'` 即無條件放行」的通用兜底分支**之前**被檢查——否則通用分支會先命中，新增的資格閘門永遠不會生效。B5（同樣 `catalogTenorFilter: 'USANCE'`）刻意未套用此欄位，仍走 `usesSettleableBalanceIndex`/EB Index 的獨立資格路徑，不受影響。

本質上，這是一條 Angular UI 側（Maker 選取器）的資格過濾規則，不涉及微服務層的任何驗證變更——即便繞過此 UI 直接呼叫 `POST /balance-movements`，微服務本身對 `IPLC_ACCEPTANCE`/`FULL_SETTLE`/`PARTIAL_SETTLE` 的 `checkRedeemSufficiency()` 充足性檢查（[[checkredeemsufficiency]]）從未因此改變。

## Conditions
selectedFunction.code === 'A7'（`requiresEligibleParentAcceptance === true`），Step 1 LC Index 候選清單渲染時。

## Result
`resolveParentEligibilityRule()` 回傳 `{ kind: 'hintSet', ids: documentArrivalHints.parentAcceptanceEligible }`；`filteredParentCatalog` 據此排除掉名下沒有任何即時可用餘額非零 `IPLC_ACCEPTANCE` 子合約的 Usance LC——即使其 tenorType 本身符合 Usance。`parentAcceptanceEligible` 由 `loadParentAcceptanceEligibility()` 針對 Step 1 每一個候選 LC，逐一以 `catalog('IPLC_ACCEPTANCE', 'ACTIVE', ..., lcNumber)` 查詢其子合約，再對每個子合約呼叫 `getSnapshot()`，只要其中任一筆 `availableBalance !== '0'` 即視為合格。

## Example
LC-A007 為 Usance LC，其下由 A6 建立的兩筆 `IPLC_ACCEPTANCE`，一筆已 A7 全額結清（Available Balance = 0），另一筆仍有 15,000 未結——LC-A007 仍會出現在 A7 的 Step 1 候選清單中。另一張 Usance LC-A008 名下所有 `IPLC_ACCEPTANCE` 皆已結清為零，或根本尚未經 A6 建立任何 Acceptance——LC-A008 不再出現在 A7 的 Step 1 候選清單中（修正前會出現，選入後於 Step 2 呈現 0 candidates）。

## Verification Note
已直接閱讀 `balance-component.model.ts` 第 268-269、397-399 行（`requiresEligibleParentAcceptance` 欄位定義與 A7 條目本身）、`document-arrival-hints.service.ts` 第 41-42、181-215 行（`parentAcceptanceEligible`、`loadParentAcceptanceEligibility()`、泛化後的 `loadChildBalanceEligibility()`）、`maker-panel.component.ts` 第 687-693、719-733 行（`loadParent()` 內的 hint 觸發、`resolveParentEligibilityRule()` 內新分支相對於既有 `catalogTenorFilter === 'USANCE'` 兜底分支的檢查順序）。並核對對應的單元測試（`maker-panel.component.spec.ts` 第 726-838 行），涵蓋：有資格的 LC 出現、無資格的 LC（子合約存在但餘額為零／不存在子合約）被排除、hint 尚在載入時的訊息抑制。B5 未套用此欄位一節已核對 `balance-component.model.ts` 第 544 行附近的 B5 條目，確認其不含 `requiresEligibleParentAcceptance`。CONFIRMED。

## Source Evidence

實現:
- `src/app/transaction-builder/balance-component.model.ts:268-269,397-399`
- `src/app/transaction-builder/document-arrival-hints.service.ts:41-42,181-215`
- `src/app/transaction-builder/maker-panel.component.ts:687-693,719-733`

測試:
- `src/app/transaction-builder/maker-panel.component.spec.ts:726-838`

## Related Knowledge
- [[EXPOSURE-RULE-014]] —— A3S/A9 自身既有的 LC 層級 SG 餘額資格提示，本規則的同構原型
- [[A7-Acceptance-Settlement]]
- [[checkredeemsufficiency]] —— 微服務層 `checkRedeemSufficiency()` 從未因本規則變更，本規則純屬 Angular UI 側資格過濾
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
