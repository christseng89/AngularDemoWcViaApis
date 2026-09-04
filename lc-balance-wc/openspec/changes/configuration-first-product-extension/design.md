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

## Service Boundaries

- **Product Definition Provider** 擁有 versioned configuration 的讀取、schema validation、reference resolution 與 immutable catalog projection；它不執行交易、計算餘額或寫入 movement。
- **Typed Policy Registry** 只把經驗證的 policy／predicate／SWIFT strategy identifier 解析為 narrow interface implementation；它不得接受任意 expression、dynamic code 或直接存取 persistence。
- **Application／Transaction Service** 擁有 use-case orchestration、Maker／Checker、eligibility revalidation、idempotency 與 unit-of-work transaction boundary；UI 或 configuration 不得取代此邊界的權威檢查。
- **Generic Balance Engine** 只處理 `BalanceAction[]`、exact decimal calculation 與共用 invariants；它不認識 A1–A11、B1–B7 或未來產品的畫面流程。
- **Accounting／Account Mapping** 將已核准的標準 action 解析為 posting template、GL／SL mapping 與 balanced vouchers；不得反向改寫 contract 或 movement business state。
- **Angular／API Discovery Consumers** 只使用 Provider 發佈的 projection 進行顯示、欄位組裝與選擇提示；服務端仍須重新驗證所有 request。
- **Stores／Database** 保存 contract、movement、voucher snapshot、configuration version 與 resolved policy identity；Database 不承擔可執行 rules-engine 職責。

## OOP／OOD／SOLID 取捨

本 Change 採用 **Strategy + Registry + Adapter**：每個 product-specific policy 透過小型介面實作，Registry 只負責選擇，migration Adapter 則隔離既有 LC routing。這使 Application Service 與 Generic Balance Engine 依賴抽象而非產品實作（Dependency Inversion），讓新產品透過新增 definition 與必要 policy 擴充而非修改共用 engine（Open/Closed），並把 eligibility、balance calculation、posting 與 presentation 的責任分離（Single Responsibility／Interface Segregation）。所有 implementation 必須遵守相同輸入、原子性、金額與錯誤合約，確保可替換性（Liskov Substitution）。

拒絕 inheritance-per-product：它會把 lifecycle、accounting 與 UI 差異累積在大型產品階層，並使 cross-product invariant 難以集中驗證。也拒絕 Service Locator 或 untyped rule callbacks：前者隱藏依賴，後者允許 configuration 注入行為。代價是短期存在較多 narrow interfaces、registry entries 與 migration adapters；只有取得 parity evidence 後才可移除 legacy adapter。

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
3. 每次只在 Policy Adapter Registry Selection 後方適配一個低風險 Function。
4. 將 API、Balance、Voucher 與 Business Case 結果與 Baseline 比較。
5. 只有通過 Parity Gates 後才能啟用已遷移 Family。
6. 透過 Policy Adapter Registry 選回既有 Policy Adapter；不得沖銷或重寫歷史 Movement Data。

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
- 採用：透過 Policy Adapter Registry Selection 控制 Rollback Adapter 的 Incremental Migration，不採 Big-bang Rewrite。
