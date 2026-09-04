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

### Requirement: 五種 Category-scoped Tenor 身分

Import SHALL 配置 Sight、Seller's Usance 與 Buyer's Usance；Export Confirmed SHALL 將 Sight 與 Usance 配置為 category-scoped identities。

#### Scenario: 兩個 Category 均含 Sight

- **WHEN** 維護 Import Sight 與 Export Sight mappings
- **THEN** 兩者 SHALL 保持為不同 category-scoped mappings

### Requirement: 配置式 Balance Families

Taxonomy SHALL 提供 Import LC、Shipping Guarantee、Import Acceptance、Confirmed LC 與 Confirmed Acceptance balance families，且各自只包含配置的 Tenor routes。

#### Scenario: Import Acceptance

- **WHEN** 顯示 Import Acceptance family
- **THEN** SHALL 只提供 Seller's Usance 與 Buyer's Usance SL routes

### Requirement: Family 維護原子性

Family Update SHALL 包含所有 configured SL 與 current version，並 SHALL 以一個單位全部成功或全部回滾。

#### Scenario: 一個 SL Version 過時

- **WHEN** 任一提交的 mapping version 與目前 DB row 衝突
- **THEN** 該 family 內所有 mappings SHALL NOT 發生部分更新

### Requirement: Configuration Reload

Reload SHALL 以 configuration defaults 原子覆寫全部 configured DB mappings，將 version 重設為 1，並將 actor 記錄為 `SYSTEM_CONFIG_RELOAD`。

#### Scenario: Reload 失敗

- **WHEN** 任一 configured mapping 無法寫入
- **THEN** 所有 Reload 修改 SHALL 回滾

### Requirement: Cleanup 保留設定

Cleanup Database SHALL 保留已維護的 Account Mappings。

#### Scenario: 清理交易資料

- **WHEN** Business Case Cleanup 移除交易資料
- **THEN** Account Mapping rows SHALL 維持不變

### Requirement: 僅 Presentation Layer 組合 GL 與 SL

Account Number Maintenance SHALL 先呈現 Contingent Liability 與 Liability GL inputs，再呈現 configured Tenor SL inputs；保存前 SHALL 組合 GL 加 SL，且 SHALL NOT 要求修改 DB schema。

#### Scenario: 保存 Usance SL

- **WHEN** 使用者保存 GL 與 Usance SL
- **THEN** 既有 mapping row SHALL 儲存組合後 Account Number 與 Description

## 來源追蹤

- `microservices/balance-component/config/balance-account-mappings.json`
- `microservices/balance-component/src/config/balanceAccountTaxonomy.ts`
- `microservices/balance-component/src/service/balanceAccountMappingService.ts`
- `docs/obsidian-balance-kb-v3.2/04-Exposure-Accounting/Balance Account Configuration.md`
