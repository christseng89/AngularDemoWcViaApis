# Tolerance 與金額規格

## Purpose

定義精確金額解析、幣別小數位四捨五入及 LC Amendment Tolerance 行為，確保縮寫輸入、順序修改、Upper-limit Delta 與 Release 重新計算在 Angular 與 API 保持一致。

## Requirements

### Requirement: 精確十進位運算

系統 SHALL 使用十進位運算執行權威金額計算，並 SHALL 依幣別最小單位使用 ROUND_HALF_UP。

#### Scenario: 幣別專屬小數位

- **WHEN** 計算金額的小數位超過所選幣別支援範圍
- **THEN** 權威結果 SHALL 依該幣別配置的小數位統一四捨五入

#### Scenario: 十進位加總

- **WHEN** 多筆 movement amount 參與 balance 或 ceiling 計算
- **THEN** 中間值與最終值 SHALL 使用 exact decimal semantics
- **AND** SHALL NOT 以 binary floating-point 誤差改變權威結果

### Requirement: 金額縮寫輸入

Angular 金額欄位 SHALL 接受純數字及不分大小寫的 `h`、`k`、`m` 縮寫片段，其中 `h=100`、`k=1,000`、`m=1,000,000`；`t` SHALL NOT 被接受。

#### Scenario: 多個縮寫片段

- **WHEN** 使用者輸入 `3h2h`
- **THEN** Angular SHALL 將金額解析為 `500`

#### Scenario: 小數片段

- **WHEN** 使用者輸入 `1k.25`
- **THEN** Angular SHALL 將金額解析為 `1000.25`

### Requirement: 初始 Tolerance

A1 與 B1 SHALL 只接受非負整數百分比的 `tolerancePct`。

#### Scenario: 小數 Tolerance

- **WHEN** 使用者或 API 提交包含小數的初始 Tolerance
- **THEN** 驗證 SHALL 拒絕

#### Scenario: 零 Tolerance

- **WHEN** A1 或 B1 提交 `tolerancePct` 為整數 0
- **THEN** Angular 與 API SHALL 接受該 Tolerance 格式

### Requirement: Amendment Tolerance Change

A2 與 B2 SHALL 接受非負整數 `toleranceChangePct` 以及 Increase 或 Decrease direction；服務 SHALL 計算並保護 resulting `tolerancePct`。

#### Scenario: 連續增加

- **WHEN** 已核准 Tolerance 為 10%，再核准 Increase 5%
- **THEN** resulting Tolerance SHALL 為 15%

#### Scenario: 結果低於零

- **WHEN** Decrease change 大於 Current Tolerance
- **THEN** Angular 與 API SHALL 拒絕輸入

### Requirement: Amendment Upper-Limit Delta

金額 Amendment 的 movement effect SHALL 為 `round(newFace × (1 + resultingTolerance)) - round(currentFace × (1 + currentTolerance))`。

#### Scenario: 金額與 Tolerance 同時變更

- **WHEN** current face 為 1,000,000、Amendment Increase 為 100,000、resulting Tolerance 為 5%
- **THEN** new upper limit SHALL 以 `(1,000,000 + 100,000) × 1.05` 計算

#### Scenario: 只變更 Tolerance

- **WHEN** face amount 不變但 resulting Tolerance 改變
- **THEN** movement effect SHALL 等於新舊 rounded upper limits 的差額
- **AND** SHALL NOT 把 Tolerance Change 百分比直接當作金額

### Requirement: Release 重新計算

Amendment Release SHALL NOT 接受呼叫端提供的最終 Tolerance；服務 SHALL 根據已保存 change 與目前已核准 contract basis 重新計算，並拒絕 stale basis。

#### Scenario: Release 前 Contract 已變更

- **WHEN** 已核准 Tolerance basis 不再符合 Maker Submit basis
- **THEN** Release SHALL 拒絕且不套用過時結果

#### Scenario: Release Basis 未變更

- **WHEN** 不同 Checker Release Amendment，且已保存 change 與目前 approved contract basis 一致
- **THEN** 服務 SHALL 自行計算 resulting Tolerance 與 movement effect
- **AND** SHALL NOT 要求呼叫端傳入最終 `tolerancePct`

## 來源追蹤

- `microservices/balance-component/src/money.ts`
- `microservices/balance-component/src/domain/tolerance.ts`
- `src/app/transaction-builder/amount-shorthand.ts`
- `src/app/transaction-builder/formatted-amount-field.component.ts`
- `docs/obsidian-balance-kb-v3.2/05-Tolerance-FX/Tolerance and Money.md`
