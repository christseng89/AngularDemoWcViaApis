# Account Mapping 配置規格

## Purpose

定義可配置的 GL Family 與 Tenor Sub-ledger 維護方式，同時不改變既有 mapping-row 持久化契約。

## Requirements

### Requirement: Canonical Taxonomy

Account Mapping JSON SHALL 是 Category、GL Family、顯示順序及允許 Tenor SL routes 的唯一 taxonomy 來源。

#### Scenario: Angular Preparation

- **WHEN** Taxonomy Configuration 變更並執行 application preparation
- **THEN** Angular taxonomy SHALL 從同一份已驗證 JSON 重新產生
- **AND** SHALL NOT 需要另一份獨立維護的 Tenor 清單

#### Scenario: Taxonomy 含未知或重複 Route

- **WHEN** Configuration 含有未知 family、未知 tenor 或重複 category-scoped route
- **THEN** Preparation SHALL 失敗並指出無效 reference
- **AND** SHALL NOT 產生部分有效的 Angular taxonomy

### Requirement: 五種 Category-scoped Tenor 身分

Import SHALL 配置 Sight、Seller's Usance 與 Buyer's Usance；Export Confirmed SHALL 將 Sight 與 Usance 配置為 category-scoped identities。

#### Scenario: 兩個 Category 均含 Sight

- **WHEN** 維護 Import Sight 與 Export Sight mappings
- **THEN** 兩者 SHALL 保持為不同 category-scoped mappings

#### Scenario: Category 間不得借用 Tenor Mapping

- **WHEN** Import 與 Export Confirmed 使用相同名稱的 Sight tenor
- **THEN** 任一 category 的 lookup SHALL NOT fallback 至另一 category 的 mapping row

### Requirement: 配置式 Balance Families

Taxonomy SHALL 提供 Import LC、Shipping Guarantee、Import Acceptance、Confirmed LC 與 Confirmed Acceptance balance families，且各自只包含配置的 Tenor routes。

#### Scenario: Import Acceptance

- **WHEN** 顯示 Import Acceptance family
- **THEN** SHALL 只提供 Seller's Usance 與 Buyer's Usance SL routes

#### Scenario: Import LC 與 Shipping Guarantee

- **WHEN** 顯示 Import LC 或 Shipping Guarantee family
- **THEN** SHALL 提供 Sight、Seller's Usance 與 Buyer's Usance 三個 configured SL routes

### Requirement: Family 維護原子性

Family Update SHALL 包含所有 configured SL 與 current version，並 SHALL 以一個單位全部成功或全部回滾。

#### Scenario: 一個 SL Version 過時

- **WHEN** 任一提交的 mapping version 與目前 DB row 衝突
- **THEN** 該 family 內所有 mappings SHALL NOT 發生部分更新

#### Scenario: 所有 SL Version 有效

- **WHEN** Family Update 提供完整 configured SL 集合及全部目前 versions
- **THEN** 該 family 的 mappings SHALL 在同一 transaction 全部保存

### Requirement: Configuration Reload

Reload SHALL 以 configuration defaults 原子覆寫全部 configured DB mappings，將 version 重設為 1，並將 actor 記錄為 `SYSTEM_CONFIG_RELOAD`。

#### Scenario: Reload 失敗

- **WHEN** 任一 configured mapping 無法寫入
- **THEN** 所有 Reload 修改 SHALL 回滾

#### Scenario: Reload 成功

- **WHEN** 使用者確認 Reload 且 configuration defaults 全部有效
- **THEN** configured mappings SHALL 全部立即覆寫為 defaults
- **AND** 每列 version SHALL 為 1 且 actor SHALL 為 `SYSTEM_CONFIG_RELOAD`

### Requirement: Cleanup 保留設定

Cleanup Database SHALL 保留已維護的 Account Mappings。

#### Scenario: 清理交易資料

- **WHEN** Business Case Cleanup 移除交易資料
- **THEN** Account Mapping rows SHALL 維持不變

#### Scenario: Cleanup 後讀取 Mapping

- **WHEN** Cleanup 完成後重新載入 Account Number Maintenance
- **THEN** SHALL 顯示 Cleanup 前已維護的 mapping values，而非隱含執行 Configuration Reload

### Requirement: 僅 Presentation Layer 組合 GL 與 SL

Account Number Maintenance SHALL 先呈現 Contingent Liability 與 Liability GL inputs，再呈現 configured Tenor SL inputs；保存前 SHALL 組合 GL 加 SL，且 SHALL NOT 要求修改 DB schema。

#### Scenario: 保存 Usance SL

- **WHEN** 使用者保存 GL 與 Usance SL
- **THEN** 既有 mapping row SHALL 儲存組合後 Account Number 與 Description

#### Scenario: GL 或 SL 缺少必要值

- **WHEN** 使用者嘗試保存缺少必要 GL 或 configured SL Account Number／Description 的 family
- **THEN** 維護請求 SHALL 被拒絕
- **AND** 既有 mapping rows SHALL 維持不變

## 來源追蹤

- `microservices/balance-component/config/balance-account-mappings.json`
- `microservices/balance-component/src/config/balanceAccountTaxonomy.ts`
- `microservices/balance-component/src/service/balanceAccountMappingService.ts`
- `docs/obsidian-balance-kb-v3.2/04-Exposure-Accounting/Balance Account Configuration.md`
