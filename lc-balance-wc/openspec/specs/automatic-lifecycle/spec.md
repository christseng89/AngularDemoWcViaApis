# 自動 Lifecycle 規格

## Purpose

定義 Auto Expiry、Auto Close 與 Expiry Date Restoration 行為。

## Requirements

### Requirement: Auto Expiry

Auto Expiry job SHALL 對合資格的 ACTIVE Import LC 或 Export Confirmation 建立並 Release 等於目前 Confirmed Balance 的 system movement，使其 Expire。

#### Scenario: 合資格 Contract 到期

- **WHEN** Expiry sweep 找到已到期且合資格的 ACTIVE root contract
- **THEN** SHALL 建立 approved EXPIRE movement
- **AND** Confirmed Balance SHALL 成為零
- **AND** status SHALL 成為 EXPIRED

### Requirement: Expiry Eligibility

Root event tree 含有不合資格 open movement 時，Auto Expiry SHALL NOT 執行。

#### Scenario: 存在 Pending Amendment

- **WHEN** 其他條件已到期的 contract 仍有 pending movement
- **THEN** Expiry job SHALL 在該次 sweep 保持其不變

### Requirement: Auto Close

Auto Close job SHALL 在配置的 business-day grace period 後關閉合資格 EXPIRED contract。

#### Scenario: Expiry 後餘額為零

- **WHEN** 合資格 EXPIRED contract 的 Confirmed Balance 為零
- **THEN** Auto Close SHALL 將其轉為 CLOSED，且不建立 placeholder zero-value voucher

### Requirement: EXPIRED Contract 延長 Expiry Date

針對 EXPIRED contract 核准的 Expiry Date Amendment SHALL 反轉被引用 EXPIRE 的餘額效果，並按新 Expiry Date 恢復 contract。

#### Scenario: 新 Expiry Date 在未來

- **WHEN** Checker Release 新日期在未來的合資格 Expiry Extension
- **THEN** 已沖減金額 SHALL 恢復
- **AND** contract SHALL 成為 ACTIVE

## 來源追蹤

- `microservices/balance-component/src/server.ts`
- `microservices/balance-component/src/config.ts`
- `microservices/balance-component/src/domain/expiryEligibility.ts`
- `docs/obsidian-balance-kb-v3.2/02-Business-Rules/Auto Expiry and Auto Close.md`
- `docs/obsidian-balance-kb-v3.2/02-Business-Rules/Close Expire Reopen Rules.md`
