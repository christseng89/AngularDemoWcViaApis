## ADDED Requirements

### Requirement: 具版本的 Product Definition

系統 SHALL 從 versioned schema 載入 Product Definitions，並 SHALL 在提供交易前拒絕 unknown versions、duplicate identifiers、invalid references 及 unsupported action mappings。

#### Scenario: 無效 Tenor Reference

- **WHEN** Product Function 引用其 Category 未宣告的 Tenor Key
- **THEN** Configuration Loading SHALL 失敗，並提供識別 Product 與 Reference 的診斷訊息

#### Scenario: 有效且完整的 Definition

- **WHEN** version、identifiers、references 與 action mappings 均符合 schema 及 registry
- **THEN** Configuration Loading SHALL 產生完整且不可變的 Product Catalog
- **AND** SHALL NOT 發佈部分解析的 Definition

### Requirement: 可配置的標準 Metadata

Product Definition SHALL 能宣告 Product Identity、Category、Labels、Display Order、Instrument Identity、Contract Fields、Natural-key Composition、Required／Optional／Protected Metadata、Tenor Routes 與 Standard Function Catalog，而不修改 consumer source。

#### Scenario: 新增標準 Product Family

- **WHEN** 有效 Definition 使用已支援 Field Types 與 Policies 新增 Product
- **THEN** Product Discovery 與 Angular Rendering SHALL 在已記載 Build／Restart lifecycle 後提供該 Product

#### Scenario: Natural Key Metadata 不完整

- **WHEN** Product Definition 宣告的 natural key 缺少必要 identity field 或引用未支援 field type
- **THEN** 該 Product SHALL NOT 出現在 Discovery 或 Angular Rendering
- **AND** Validation SHALL 指出不完整的 metadata path

### Requirement: 配置式標準行為

Product Definition SHALL 能引用已登記的 Lifecycle Transitions、Eligibility Predicates、Normalized Balance Actions、Posting Templates 與 Account Mapping Keys。

#### Scenario: 標準 Issue Action

- **WHEN** 配置的 Issue Function 映射至 `TAKE_DOWN`
- **THEN** Generic Balance Engine SHALL 套用其他 Products 共用的相同 typed action semantics
- **AND** SHALL 保持正數 Amount，Direction 由 Action 表達

#### Scenario: Compound Action 任一項無效

- **WHEN** 配置的 Business Event 解析出多個 actions，且其中一項不符合 registered action contract
- **THEN** 整組 event SHALL 被拒絕
- **AND** SHALL NOT 套用部分 balance 或 posting effect

### Requirement: Typed Policy 擴充

Configuration SHALL 只選取已登記的 typed Product Policy 與 SWIFT Strategy implementations，並 SHALL NOT 包含任意 executable business expressions。

#### Scenario: 未知 Policy

- **WHEN** Product Definition 指定未登記 Policy
- **THEN** Configuration Validation SHALL 在 Product 可用前失敗

#### Scenario: 已登記 Policy

- **WHEN** Definition 引用具相容 typed interface 與 version 的已登記 Product Policy／SWIFT Strategy
- **THEN** Registry SHALL 解析該 implementation
- **AND** Configuration SHALL NOT 包含或執行任意 expression body

### Requirement: 不可變 Core Controls

任何 Product Definition 或 Policy 均 SHALL NOT 繞過 Maker／Checker separation、Audit、Idempotency、Exact Decimal Money、Currency Rounding、Posting Gate、Server-authoritative Validation 或 Atomic Transaction Boundaries。

#### Scenario: Configuration 嘗試停用 Checker Control

- **WHEN** Configuration 包含不支援的 Control Override
- **THEN** Validation SHALL 拒絕該 Definition

#### Scenario: Policy 嘗試繞過 Core Control

- **WHEN** Product Policy 產生的 action 無法通過 Maker／Checker、idempotency、money 或 transaction-boundary invariant
- **THEN** Balance Core SHALL 拒絕整個 business action
- **AND** SHALL NOT 由 Product-specific code 降級該控制

### Requirement: 跨介面共用 Definition

Angular、API Discovery 與 Account Number Maintenance SHALL 使用同一份已驗證 Product Definition Model，不得各自維護 Product 或 Tenor 清單。

#### Scenario: Product Label 變更

- **WHEN** 權威 Definition 中的有效 Product Label 變更
- **THEN** 重新產生後所有 Consumer Metadata SHALL 使用相同 Label

#### Scenario: Consumer Projection Version 不一致

- **WHEN** Angular、API Discovery 或 Account Number Maintenance 使用的 projection 與目前 Definition Version 不一致
- **THEN** 相容性檢查 SHALL 拒絕 stale projection
- **AND** SHALL NOT 靜默顯示不同 Product 或 Tenor 清單

### Requirement: Backward-compatible Migration

新 Product 啟用前，既有 Import LC 與 Export Confirmed Functions SHALL 遷移至新 Contracts 後方，並以 Characterization Tests 證明沒有可觀察 Regression。

#### Scenario: 已遷移 A6 Compound Release

- **WHEN** A6 透過新 Product Policy Contract 路由
- **THEN** 其關聯 LC Utilization 與 Acceptance Approval SHALL 保持相同 Atomic Behavior 與 Voucher Status

#### Scenario: Parity Evidence 不一致

- **WHEN** 新 routing 的 API、Balance、Voucher 或 Business Case output 與既有 baseline 不一致
- **THEN** 該 Function SHALL NOT 啟用新 routing
- **AND** Policy Adapter Registry SHALL 保留可選回既有 implementation 的 rollback path

### Requirement: Product Acceptance 證據

Generated Schema Tests SHALL NOT 取代每個新 Product 明確的 Positive、Boundary、Rejection、Lifecycle、Accounting 與 Business Case Tests。

#### Scenario: SBLC Definition 已準備

- **WHEN** SBLC Definition 通過 Schema Validation 但缺少已核准 Business Scenarios
- **THEN** SBLC SHALL 在 Production Transaction Discovery 保持停用

#### Scenario: Product Acceptance Evidence 完整

- **WHEN** 新 Product 的 Positive、Boundary、Rejection、Lifecycle、Accounting 與 Business Case evidence 全部通過
- **THEN** Product 啟用決策 SHALL 引用該完整 evidence set
- **AND** Generated Schema Tests SHALL NOT 被當作唯一的 production acceptance 證據
