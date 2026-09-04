## Context

Balance Component 已分離 routes、services、domain policies、stores 與 Angular strategies，但 Product Identities 與 Function Differences 仍分散各處。已接受的目標架構將 Balance Effects 正規化為 `TAKE_DOWN`、`REPAYMENT`、`EARMARK`、`RELEASE_EARMARK` 與 `CONSUME_EARMARK`。本 Change 定義 Product-specific Events 通往該 Core 的橋樑，且不將 untyped configuration 視為可執行規則。

## Goals and Non-Goals

目標：

- 將標準 Product Metadata 與標準 Balance Behavior 配置化。
- 讓 Product Exceptions 保持 typed、可測試及可替換。
- 讓未來 SBLC／LG 工作集中於 Product Policy、SWIFT 與 Acceptance Evidence。
- 增量遷移期間保存全部既有 LC 行為與歷史資料。

非目標：

- 在本 Change 實作 SBLC 或 LG。
- 以 Configuration 取代 Maker／Checker 或 Transaction Controls。
- 引入 General-purpose Rules Language。
- 一次性重寫所有 A／B Functions。

## Decisions

### 經驗證的 Product Definition

Versioned Schema 是 Category、Product／Instrument Identity、Display Metadata、Contract Field Schema、Natural Key、Tenor Routes、Functions、Simple Transitions、Registered Predicate References、Action Mappings、Posting-template References 與 Account Mapping Keys 的權威來源。載入採 Fail-fast 並產生可採取行動的診斷訊息。

### Typed Policy Registry

複雜 Cross-field Validation、Exposure Calculations、Parent／Child Behavior、Compound Release Side Effects、法律條件與 SWIFT Mappings 保持為 narrow interfaces 的 implementations。Configuration 可選取已登記 Implementation，但不得注入程式或繞過 Balance Core。

### Generic Balance Engine

Product Policies 將 Business Event 轉換為一個或多個正數 Amount 的 `BalanceAction`。Engine 負責共用 Calculation、Workflow、Audit、Idempotency、Persistence 與 Posting Gates。Accounting Templates 將標準 Actions 轉換為借貸平衡 Voucher Families；Product-specific Asset 或 Memo Boundaries 則保留為明確 Policies。

### 共用 Consumer Model

Angular 與 API Discovery 使用同一份 Product Definition 的 Generated 或 Runtime-validated Projection。Database 保存穩定 Product Identity 與既有 Movement Snapshots，不成為 Rule-definition Engine。

## 資料流

```text
Product Definition
  -> schema and reference validation
  -> Product Catalog / API discovery / Angular rendering

Business Event
  -> typed Product Policy
  -> BalanceAction[]
  -> Generic Balance Engine
  -> Account Mapping / Posting Template
  -> atomic persistence and audit
```

## 遷移與回復

1. 加入 Contracts 與 Validators，不改變 Active Routing。
2. 以 Characterization 固定既有 A／B Behavior。
3. 每次只在 Feature Flag 或 Registry Selection 後方適配一個低風險 Function。
4. 將 API、Balance、Voucher 與 Business Case 結果與 Baseline 比較。
5. 只有通過 Parity Gates 後才能啟用已遷移 Family。
6. 透過選回既有 Policy Adapter 回復；不得沖銷或重寫歷史 Movement Data。

任何 DB Change 都必須保存既有 Natural Keys 與 Snapshots，並包含 Forward／Reverse Compatibility Analysis。不支援的 Definitions 必須 Fail Closed。

## 安全與可靠性

- Configuration 必須納入 Source Control、Review 與 Schema Validation。
- 禁止任意 Expressions 與 Dynamic Code Loading。
- Server Validation 維持權威。
- Configuration Version 與 resolved Policy Identity 必須可供診斷觀察。
- Multi-leg Action 失敗時必須原子回滾。
- 寧可 Startup Failure，也不得提供部分有效的 Product Catalog。

## 風險與取捨

- Schema 可能演變成隱藏程式語言；必須限制為 Metadata 與 Registered References。
- Generic UI 可能模糊 Product Meaning；真正差異應允許 typed Presentation Policies。
- Incremental Adapters 會暫時增加結構；只有取得 Parity Evidence 後才能移除舊路徑。
- Generated Tests 可改善 Invariant Coverage，但不能認證 Trade Finance Semantics。

## 決策紀錄

- 採用：Configuration-driven Metadata 加 Typed Policies 與 Normalized Actions。
- 拒絕：繼續使用 Product／Function Switches，因為每個新 Product 都會擴大 Regression Surface。
- 拒絕：完全 Untyped Rules，因為會削弱 Compile-time Checks、Auditability 與 DB Integrity。
- 採用：具 Rollback Adapters 的 Incremental Migration，不採 Big-bang Rewrite。
