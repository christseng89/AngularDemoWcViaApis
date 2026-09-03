---
title: "OOP OOD SOLID"
type: architecture
domain: architecture
status: verified
source_of_truth: source-code
source_revision: "bad2f0c"
verified_date: 2026-09-03
generated: true
aliases: []
tags: ["architecture", "oop", "ood", "solid"]
source_files:
  - "microservices/balance-component/src/service/balanceService.ts"
  - "microservices/balance-component/src/service/unitOfWork.ts"
  - "microservices/balance-component/src/service/movementReleasePolicyService.ts"
  - "microservices/balance-component/src/service/movementReleaseSideEffectService.ts"
  - "microservices/balance-component/src/store/balanceMovementStore.ts"
  - "src/app/transaction-builder/function-strategy.ts"
  - "src/app/transaction-builder/balance-component.model.ts"
---

# OOP OOD SOLID

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

## OOP（Object-Oriented Programming）

本專案以 class／interface 封裝可替換行為與協作：Angular service、function strategy、store 與 BalanceService facade。Domain 計算優先保持 pure function；不是為了 OOP 而把所有規則包成 mutable object。

## OOD（Object-Oriented Design）

設計由責任與變化原因切分：catalog 宣告 function metadata，strategy 決定 UI 行為，route 處理 transport，service orchestration 管理 use case，domain policy 計算規則，store 隔離 persistence，unit of work 管理交易邊界。依賴方向由外向內，不讓 Angular 或 Express 細節污染 domain。

## SOLID mapping

| Principle | Source-backed application | Guardrail |
|---|---|---|
| SRP | release policy、release side effects、validation、snapshot、store 分開 | BalanceService 只作 facade／orchestration，不重新實作 policy |
| OCP | function catalog、strategy registry、direction options | 新 function 擴充 metadata／strategy／policy，不堆疊跨 component 條件 |
| LSP | strategy 與 store contracts 由 consumer 依同一介面使用 | replacement 必須保持 validation、status 與 error semantics |
| ISP | route、service、store、UI strategy 使用小而聚焦的 contract | 不建立包含所有交易能力的胖介面 |
| DIP | orchestration 依賴 service／store boundaries；domain 不依賴 UI／HTTP | composition root 注入 concrete dependencies |

## DRY without hiding domain meaning

DRY 不是把不同 lifecycle 強迫共用同一流程。A3 acknowledge、A4 finalize、A6 acceptance、B3 earmark、B4 consume 保持各自語意；共用的是 money、status transition、validation、persistence 與 rendering primitives。業務規則只在對應 canonical note 定義，本頁只說設計原則。

## Fix Pending lifecycle ownership

`BalanceService.editPending()` 負責 use-case orchestration：驗證 request、開啟 transaction、先寫 append-only audit，再委派 persistence。`BalanceMovementStore` 封裝 correction 的持久化 invariant：`STANDARD` 與 `REMARKS_ONLY` Fix Pending 都把可重新送審的 movement 恢復為 `PENDING`。Angular 只依 function strategy 控制可編輯欄位，不自行實作 `REJECTED → PENDING`。

這個責任切分維持 SRP／DIP，並避免 UI、route 與 service 各自硬寫狀態更新；新增 Fix Pending mode 時只需遵守相同 store contract 與 audit contract。
