---
title: "Linked Transaction Flows"
type: flow
domain: cross-function
status: verified
source_of_truth: source-code
source_revision: "c7e9884"
verified_date: 2026-09-03
generated: true
aliases: []
tags: ["flow"]
source_files:
  - "microservices/balance-component/src/service/compoundMovementService.ts"
  - "microservices/balance-component/src/service/movementReleaseSideEffectService.ts"
  - "src/app/transaction-builder/maker-submit.service.ts"
---

# Linked Transaction Flows

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

## Import

- A3 → A4：Sight Document Arrival 後由 A4 完成 settlement。
- A3 → A6：Usance Document Arrival 建立 Acceptance。
- A3S：Document Arrival 與 Shipping Guarantee redemption 以同一 business event 關聯。

## Export

- B3 → B4：Present Docs 先 EARMARKED，B4 Honour／Acceptance release 後消耗該 B3。
- B4 → B5：Usance Acceptance 後由 maturity／reimbursement settlement 完成。
