## 1. Characterization 與 Contracts

- [ ] 1.1 修改 Routing 前，為目前每個 A1–A11、B1–B7 可觀察流程加入 failing Characterization Tests。
- [ ] 1.2 定義具版本的 Product Definition 與 normalized `BalanceAction` TypeScript Contracts。
- [ ] 1.3 為重複及未知 identities 加入 Schema 與 Referential-integrity Validation Tests。

## 2. Product Catalog 與 Policies

- [ ] 2.1 在 narrow read-only interface 後方實作 Product Definition Provider。
- [ ] 2.2 實作已登記的 Eligibility-predicate、Product Policy 與 SWIFT Strategy interfaces。
- [ ] 2.3 在 Startup 拒絕任意 Expressions 與未知 Policy References。

## 3. Generic Engine 與 Accounting

- [ ] 3.1 實作 Normalized Action Calculation，以及 Exact Decimal 與 Currency Rounding Tests。
- [ ] 3.2 實作 Standard Posting-template Resolution 與 Balanced-voucher Invariant Tests。
- [ ] 3.3 證明 Configuration 無法覆寫 Maker／Checker、Audit、Idempotency 與 Compound Atomicity。

## 4. Interface Projections

- [ ] 4.1 加入 Generic API Product／Function Discovery，並以 Examples 與 Errors 更新 OAS。
- [ ] 4.2 從已驗證 Definition 產生 Angular Product、Function、Field 與 Tenor Metadata。
- [ ] 4.3 Account Number Maintenance 必須維持使用相同 Category／Family／Tenor Taxonomy。

## 5. LC 增量遷移

- [ ] 5.1 在 Policy Adapter Registry Selection 後方遷移一個 Import Function，並比較 API、Balance 與 Voucher Outputs。
- [ ] 5.2 遷移其餘 Import Functions，同時保存所有 Business Case Outcomes。
- [ ] 5.3 遷移 Export Confirmed Functions，包括 B3 Memo 與 B4 Compound Behavior。
- [ ] 5.4 只有完成 Parity 與 Rollback Verification 後才能從 Policy Adapter Registry 移除舊 Routing Path。

## 6. Product 啟用與驗證

- [ ] 6.1 在另一個已核准 Change 定義 SBLC Product Definition 與 Typed Policies。
- [ ] 6.2 為該 Product 加入 Positive、Boundary、Rejection、Lifecycle、Accounting 與 Business Case Coverage。
- [ ] 6.3 執行 Angular、Microservice、Backend Coverage Gates、Browser Acceptance、OAS Validation、Obsidian Regeneration 與 `openspec validate --all --strict --no-interactive`。
- [ ] 6.4 全部 tasks 與 implementation evidence 完成後，逐項確認 delta scenarios 已實作，執行 `openspec archive configuration-first-product-extension --yes`，再驗證 current specs 已同步、日期化 archive 保留完整 artifacts，且 strict validation 仍通過。
