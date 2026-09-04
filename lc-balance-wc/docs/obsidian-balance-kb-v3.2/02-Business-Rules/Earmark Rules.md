---
title: "Earmark Rules"
type: rule
domain: exposure
status: verified
source_of_truth: source-code
source_revision: "1865d80"
verified_date: 2026-09-04
generated: true
aliases: []
tags: ["business-rules", "earmark"]
source_files:
  - "src/app/transaction-builder/balance-component.model.ts"
  - "src/app/transaction-builder/checker-actions.service.ts"
  - "microservices/balance-component/src/service/balanceService.ts"
  - "microservices/balance-component/src/store/balanceMovementStore.ts"
  - "microservices/balance-component/src/domain/offBalanceExposure.ts"
---

# Earmark Rules

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

## Earmark functions

`isEarmarkFunction()` 只對 Import 的 `IPLC_LC/UTILIZE`（A3、A3S）及 Export 的 `EPLC_EXAMINATION/CREATE`（B3）回傳 true。A4 finalize event 雖沿用 `IPLC_LC/UTILIZE`，但 `phase=finalize` 時明確不是 earmark。

| Side | Function | Maker 結果 | 該功能 Checker 動作 | Checker 後顯示 | 後續完成點 |
|---|---|---|---|---|---|
| Import | A3 Document Arrival | 建立 LC `UTILIZE`、status=PENDING，顯示 EARMARKING | `acknowledgeArrival()` 只寫 `acknowledgedBy/At`，不 Release | movement 仍 PENDING，但顯示 EARMARKED | Sight→A4；Usance→A6 |
| Import | A3S Document Arrival w/ Shipping Gtee | 同一 business event 建立 LC UTILIZE 與 SG full redemption | 重新檢查 Bill Amount ≥ SG Balance，釋放 SG redemption 並 acknowledge LC arrival | Document Arrival 顯示 EARMARKED | Sight→A4；Usance→A6 |
| Export | B3 Present Docs | 建立 `EPLC_EXAMINATION/CREATE` PENDING，顯示 EARMARKING | 標準 `release()`，B3 自己轉為 RELEASED | EARMARKED | B4 release 寫 `presentDocsConsumedAt` |

## Import finalize

### A4 Sight Settlement

A4 不建立第二筆 Document Arrival。Maker 對已 acknowledged、仍 PENDING 的 A3/A3S UTILIZE 呼叫 `submitByMaker()`，只寫入 `makerSubmittedBy/At`；Checker 再 Release 同一 movement，才把 LC Balance 從 Pending 轉成 Approved／Utilized。Inquire Events 將 create 與 finalize 分成兩行，finalize 行使用一般 PENDING／APPROVED，不再顯示 EARMARKING／EARMARKED。

### A6 Acceptance (Usance)

A6 建立新的 `IPLC_ACCEPTANCE/CREATE`，並以 `referencedTransactionId` 指向已 acknowledged 的 A3/A3S UTILIZE。建立 A6 時會把來源 arrival 標記為 Maker Submitted。Checker 的單一 Release 動作同時完成被引用的 Document Arrival 與新 Acceptance；Amount、Currency、Tenor 由來源交易帶入且受保護。

## Export consume

B3 Checker Release 後雖已 EARMARKED，仍占用 Present Docs earmark。B4 只能選取已 RELEASED、尚未 consumed 的 B3；B4 Release 才設定來源 B3 的 `presentDocsConsumedAt/By` 並解除該 earmark。

## Queue and accounting semantics

- 已 acknowledged 的 A3/A3S 不再出現在 A3/A3S Checker 或普通 Maker Queue；A4/A6 透過專屬 eligibility 使用它。
- Earmark 是容量控制與稽核狀態，不等於 downstream Accounting posting。
- Internal `contingentAccountEntry` 與外送 `accountEntries` 是不同欄位，必須分開說明。
