---
title: "ADR-001 Generic Balance Action Model"
type: architecture-decision
domain: architecture
status: accepted
source_of_truth: business-decision
source_revision: "1865d80"
verified_date: 2026-09-04
generated: true
aliases: []
tags: ["architecture", "adr", "balance-action", "product-extension"]
source_files:
  - "microservices/balance-component/src/types.ts"
  - "microservices/balance-component/src/service/balanceService.ts"
  - "microservices/balance-component/src/domain/balanceDerivation.ts"
  - "microservices/balance-component/src/domain/contingentAccountEntry.ts"
  - "src/app/transaction-builder/balance-component.model.ts"
---

# ADR-001 Generic Balance Action Model

> [!important] Source of truth
> 本 ADR 記錄已接受的 target architecture；目前程式尚未完全完成此重構。現行行為仍以 Source Code、測試及 OAS 為準。

## Context

LC、SBLC 與 LG 的合約欄位、法律事件、選擇條件及 SWIFT 流程不同，但對 Balance Control 的核心影響可正規化為少數動作：增額、減額及額度保留。若 Balance Engine 直接認識每一種產品與 Function，新增產品會迫使 type union、DB constraint、UI catalog、eligibility 與 accounting switch 同步修改。

## Decision

Balance Engine 的 target architecture 只處理以下 normalized actions：

- `TAKE_DOWN`：建立或增加 balance。
- `REPAYMENT`：減少或清償 balance。
- `EARMARK`：保留 capacity，但未完成最終 balance／accounting event。
- `RELEASE_EARMARK`：取消尚未被消耗的保留。
- `CONSUME_EARMARK`：把既有保留轉入其後真正的 TAKE_DOWN／REPAYMENT 流程。

Amount 一律為正值，方向由 action 表達，不以正負號暗示。LC、SBLC、LG Product Policy 負責把 ISSUE、AMENDMENT、CLAIM、DRAWING、EXPIRE、CLOSE 等 business event 映射成一個或多個 normalized actions。

| Business event | Normalized Balance action |
|---|---|
| Issue | TAKE_DOWN |
| Amendment Increase | TAKE_DOWN |
| Amendment Decrease | REPAYMENT |
| Claim／Drawing received | EARMARK |
| Claim approved／paid | CONSUME_EARMARK + REPAYMENT（依產品 liability direction） |
| Claim cancelled／rejected | RELEASE_EARMARK |
| Expire／Close | REPAYMENT remaining balance |
| Reopen | TAKE_DOWN restoration |

## Configuration-first product extension

新增 SBLC、LG 或其他業務品種採用 **configuration-driven metadata + typed Product Policy plug-in + Generic Balance Engine**。目標是把標準行為配置化，大幅縮小新增產品的 source-code change surface，但不把複雜法律、帳務或 SWIFT 規則變成無型別自由 expression。

| Product extension concern | Target mechanism | Expected change for a new product |
|---|---|---|
| Product／instrument identity | Typed product-definition configuration | Configuration only |
| Contract fields／natural key | Validated field schema | Mostly configuration; custom cross-field validation stays in policy |
| Transaction Function／lifecycle | Configured catalog and state transitions | Standard transitions by configuration; exceptional side effects in policy |
| Selection／eligibility | Reusable predicate registry referenced by configuration | Common predicates by configuration; product-specific eligibility in policy |
| Business Event → `BalanceAction[]` | Strongly typed action mapping | Standard TAKE_DOWN／REPAYMENT／EARMARK flows by configuration |
| Accounting／posting and Account Mapping key | Posting templates plus Account Mapping taxonomy | Normally configuration only |
| UI／API／DB／SWIFT／tests | Schema-driven UI and generic API; extensible persistence identity; strategy plug-ins | Shared framework remains unchanged; SWIFT and exceptional behavior may add a plug-in and explicit tests |

The configuration authority should cover category, product code, instrument identity, labels, display order, Tenor Type, natural-key composition, required／optional／protected field metadata, simple lifecycle transitions, reusable eligibility predicates, normalized action mappings, GL family, Tenor SL, Account Number／Description defaults and standard debit／credit posting templates. Angular should render the same validated schema rather than maintain a second product list.

The following controls remain typed code or immutable Balance Core behavior: complex exposure calculations, parent／child interactions, compound atomic release, exceptional earmark side effects, product-specific legal rules, SWIFT construction and cross-field validation, Maker／Checker, idempotency, audit, decimal rounding, posting gate and transaction integrity. Configuration selects a policy or strategy; it must not bypass these controls.

### One-time framework enablement

Before a future product can be added mostly by configuration, the platform must introduce a versioned Product Definition schema, generic contract-field and natural-key schema, configured function catalog and lifecycle state machine, reusable eligibility predicate registry, typed `BalanceAction[]` engine, posting templates, schema-driven Angular rendering, generic product／function API contracts, extensible persistence identity and configuration validation. Generated tests may cover schema invariants and standard actions, but product business acceptance tests remain mandatory.

After that enablement, a normal new product should require one Product Definition, Account Mapping configuration, an optional small Product Policy／SWIFT Strategy for genuine differences, and product acceptance tests. This is an architectural target, not a statement that current SBLC／LG support is configuration-only today.

## Responsibility boundary

Balance Core 共用 balance math、Maker／Checker、Pending／Rejected、audit、idempotency、snapshot、decimal money 與 posting gate。Product Policy 擁有合約欄位、selection／eligibility、parent-child relationship、business-event mapping、Account Mapping key、SWIFT strategy 與產品專屬 lifecycle。

`Business Event → Product Policy → BalanceAction[] → Generic Balance Engine → Account Mapping`

## Options considered

1. 繼續以產品／Function 硬編碼：短期直接，但每個新產品都擴大 switch、enum、migration 與 regression surface。
2. 將所有規則做成無型別自由設定：擴充快，但會犧牲編譯期檢查、DB integrity 與可稽核性。
3. 採 typed Product Policy + normalized Balance Action：保留型別與 audit，同時隔離產品差異。採用此方案。

## Consequences

- 新增 SBLC／LG 的 Balance 計算應是小改；主要工作集中在 selection eligibility、合約內容、event mapping 與 Account Mapping。
- 現有 LC Function 必須逐步改成 business-event adapter，不進行一次性重寫。
- DB／API 仍需辨識 product identity，但 Balance direction 不再由產品 switch 決定。
- Accounting 科目可以不同，TAKE_DOWN／REPAYMENT 的方向語意保持一致。

## Implementation guardrails

- 先以 characterization tests 固定現有 A／B Function 行為，再抽取 `BalanceAction` 與 `BalanceProductPolicy` contracts。
- Import LC／Export Confirmation 先接回新 contract 並維持 coverage gate，再增加 SBLC，最後增加 LG。
- Product Policy 不得繞過 Maker／Checker、audit、decimal money、posting gate 或 idempotency。
- 本 ADR 不代表 SBLC／LG 已實作，也不改變目前 source-backed lifecycle。
