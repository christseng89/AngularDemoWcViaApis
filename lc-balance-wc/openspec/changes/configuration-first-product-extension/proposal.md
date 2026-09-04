## Why

目前新增 SBLC、LG 或其他 Balance 業務品種，可能需要同步修改 Product Identity、DB Constraints、Angular Catalogs、Eligibility、Lifecycle 與 Accounting switches。應建立經驗證的 Product Definition layer，使標準 Balance 行為由配置驅動，同時以 typed policies 保留真正的法律、帳務及 SWIFT 差異。

## What Changes

- 引入具有版本的 Product Definition Configuration Contract。
- 配置 Product Identity、Contract Fields、Natural Keys、Functions、簡單 Lifecycle Transitions、可重用 Eligibility Predicates、Normalized Balance Actions、Posting Templates 與 Account Mapping Routes。
- Angular 從同一份已驗證 Definition 渲染支援的 Product Functions，並透過 Generic API Contracts 提供。
- 複雜計算、Compound Side Effects、法律規則與 SWIFT Translation 保留在 typed Product Policy／Strategy interfaces 後方。
- 加入 Configuration Validation、Migration Controls、Generated Invariant Tests 與明確 Product Acceptance Tests。
- 將 Maker／Checker、Audit、Idempotency、Decimal Money、Posting Gate 與 Transaction Atomicity 保留為不可配置的 Balance Core controls。
- **BREAKING**（內部擴充點）：硬編碼 product unions 與 switches 將逐步由 typed identifiers 與 registries 取代。遷移期間既有外部 LC 行為必須保持 backward compatible。

## Capabilities

### New Capabilities

- `product-definition-configuration`：透過具版本且經驗證的 definitions 與 typed policy plug-ins，以最少 consumer-source 修改新增 Balance 業務品種。

### Modified Capabilities

- 無。既有 Import LC 與 Export Confirmed 行為已有 repository root `REGRESSION-BASELINE.md` 的日期化回歸證據；本 Change 的 task 1.1 將再把每個流程提升為可自動執行、failing-first 的 Characterization Tests。在明確 implementation change 修改前，既有行為必須保持不變。

## Impact

- 未來受影響範圍：Taxonomy Configuration、Angular Function Rendering、API Product Discovery、Contract Identity Persistence、Eligibility、Normalized Balance Actions、Accounting Templates、SWIFT Strategies 與 Test Generation。
- 遷移影響：既有 LC Functions 必須在新 contracts 後逐步適配；Big-bang Rewrite 不在範圍內。
- 資料影響：既有 identities 與歷史 movement／voucher snapshots 必須保持可讀；任何 persistence migration 均需明確 Compatibility 與 Rollback Path。
- Rollback：Parity Verification 通過前，Feature Flag 或 Adapter Selection 必須允許退回既有 LC policies。
- 非目標：本 change 不宣稱已實作 SBLC／LG、不在 configuration 中編碼任意 executable expressions，也不削弱 server-side controls。
