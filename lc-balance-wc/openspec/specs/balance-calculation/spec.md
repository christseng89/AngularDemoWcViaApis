# 餘額計算規格

## Purpose

定義權威的 Confirmed、Available、Pending 與 Tight Balance 推導方式。

## Requirements

### Requirement: Confirmed Balance

系統 SHALL 將所有 RELEASED movement 的 signed ceiling amount 加總為 Confirmed Balance。

#### Scenario: Pending Increase

- **WHEN** Increase movement 為 PENDING
- **THEN** SHALL NOT 增加 Confirmed Balance

### Requirement: Available Balance

系統 SHALL 以 Confirmed Balance 加上 signed PENDING movements 推導 Available Balance，但排除 `AMEND_EXPIRY_DATE`。

#### Scenario: Pending Expiry Date Amendment

- **WHEN** Expiry Date Amendment 為 PENDING
- **THEN** Available Balance SHALL 維持不變

### Requirement: Pending Earmark Total

系統 SHALL 以 Available Balance 減 Confirmed Balance 計算 Pending Earmark Total，顯示結果 SHALL 可為正數或負數。

#### Scenario: Pending Decrease

- **WHEN** Pending Decrease 使 Available 低於 Confirmed
- **THEN** Pending Earmark Total SHALL 為負數

### Requirement: Tight Available Balance

進口 LC 及相關 ledgers 的 Tight Available SHALL 等於 Confirmed 減 pending decreases，再減未結清 Shipping Guarantee exposure。出口保兌的 Tight Available SHALL 等於 Confirmed 減 pending decreases，再減 Present Docs earmark。

#### Scenario: Pending Increase 不建立 Tight Capacity

- **WHEN** Increase 已 Submit 但尚未 Release
- **THEN** Available MAY 增加
- **AND** Tight Available SHALL NOT 將該 Pending Increase 計入可用已核准 capacity

### Requirement: Sufficiency 下限

即使診斷畫面顯示負數 raw intermediate，Sufficiency 檢查 SHALL 將低於零的可用 Tight capacity 視為零。

#### Scenario: Decrease 超過 Capacity

- **WHEN** 擬議 reducing movement 超過可用 Tight capacity
- **THEN** 服務 SHALL 在持久化或完成前依適用階段拒絕

## 來源追蹤

- `microservices/balance-component/src/domain/balanceDerivation.ts`
- `microservices/balance-component/src/domain/offBalanceExposure.ts`
- `docs/obsidian-balance-kb-v3.2/03-Balance-Flows/Cross-Function-Flows/Transaction Balance Calculation Matrix.md`
