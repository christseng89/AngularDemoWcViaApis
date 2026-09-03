---
title: "Accounting and Exposure"
type: concept
domain: accounting
status: verified
source_of_truth: source-code
source_revision: "c7e9884"
verified_date: 2026-09-03
generated: true
aliases: []
tags: ["accounting", "exposure"]
source_files:
  - "microservices/balance-component/src/domain/contingentAccountEntry.ts"
  - "microservices/balance-component/src/domain/offBalanceExposure.ts"
  - "microservices/balance-component/src/service/balanceService.ts"
---

# Accounting and Exposure

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

## 兩種 entry 不可混用

- `contingentAccountEntry`：Balance Component 在 movement 建立時推導並持久化的單組 internal voucher，供 UI 與稽核。
- `accountEntries`：外部／下游 Accounting payload。

當 `exposureNature=MEMO`，service 強制 `accountEntries=null`。這不代表 internal `contingentAccountEntry` 必須為 null。逐交易的 Dr／Cr、compound legs 與 posting boundary 見 [[Transaction Accounting Matrix]]。

## Earmarked entries

EARMARKED 是虛帳／容量占用；後續真實交易不需沖銷這些虛帳，除非該 movement 自身的 domain rule 明確產生 reversal。
