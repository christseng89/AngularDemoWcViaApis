# 進口信用證交易規格

## Purpose

定義進口信用證、承兌與提貨擔保餘額的可觀察 A 系列交易行為，涵蓋 A1–A11 的開立、修改、到單、結算、承兌、提貨擔保、關閉及重新開啟流程。

## Requirements

### Requirement: A1 LC 開立

A1 SHALL 使用 Amount、Currency、Expiry Date、整數 Tolerance 與配置的 Import Tenor 建立進口 LC，並 SHALL 只在 Checker Release 後提供已核准 capacity。

#### Scenario: 開立 Lifecycle

- **WHEN** Maker Submit 有效 A1，並由不同 Checker Release
- **THEN** ISSUE movement SHALL 成為 APPROVED
- **AND** Confirmed 與 Tight Available SHALL 等於 Tolerance 調整後 ceiling

### Requirement: A2 LC Amendment

A2 SHALL 支援 Increase／Decrease 的 Amount、Tolerance Change 或兩者同時輸入，並 SHALL 另行支援不含 Tolerance 的 Expiry Date Amendment。

#### Scenario: 只修改 Expiry Date

- **WHEN** Maker 使用有效新日期 Submit A2 Expiry Date
- **THEN** Amount 與 Tolerance SHALL NOT 為必填
- **AND** pending movement SHALL NOT 改變 Available Balance

### Requirement: A3 到單

A3 SHALL 為符合資格且已 Release 的進口 LC 建立虛擬 LC UTILIZE Earmark，並 SHALL 將 LC 最終完成延後至 A4 或 A6。

#### Scenario: A3 Acknowledgement

- **WHEN** Checker Acknowledge 有效 A3
- **THEN** entry SHALL 顯示 EARMARKED
- **AND** LC UTILIZE movement SHALL 保持未完成，直到 Settlement 或 Acceptance

### Requirement: A3S 到單連同提貨擔保

A3S SHALL 原子贖回所選未結清 SG 並建立關聯 LC Arrival，同時防止重複使用 SG 已保留 capacity。

#### Scenario: SG 覆蓋單據金額

- **WHEN** Bill Amount 不超過所選 SG Amount
- **THEN** parent capacity 檢查 SHALL NOT 再次扣除已覆蓋金額

### Requirement: A4 Sight Settlement

A4 SHALL 只允許選取具有符合資格未結 A3／A3S Arrival 的 Sight LC，並 SHALL 將 Arrival Amount 作為 protected input 帶入。

#### Scenario: 完成 Sight Arrival

- **WHEN** 不同 Checker Release A4
- **THEN** 被引用的 LC UTILIZE movement SHALL 成為 APPROVED
- **AND** LC Confirmed Balance SHALL 按 protected Amount 減少

### Requirement: A6 承兌

A6 SHALL 只允許選取具有符合資格未結 Arrival 的 Usance LC，並 SHALL 在同一 Checker 動作中建立 Acceptance 及完成被引用的 LC Utilization。

#### Scenario: A6 複合 Release

- **WHEN** Checker Release A6
- **THEN** Acceptance CREATE 與被引用 LC UTILIZE SHALL 原子成為 APPROVED
- **AND** 兩組相關 vouchers SHALL 具有相同完成狀態

### Requirement: A7 承兌結算

A7 SHALL 只結算符合資格的未結清 Import Acceptance，並 SHALL 支援 Partial 或 Full Settlement，且不改變 parent LC balance。

#### Scenario: 全額結算

- **WHEN** Checker 對剩餘 Acceptance Amount Release Full A7
- **THEN** 該 Acceptance Confirmed Balance SHALL 成為零

### Requirement: A8 提貨擔保開立

A8 SHALL 要求 SG Number 作為新 SHGT natural key 的一部分，且 Amount 不得超過目前 parent Tight Available。

#### Scenario: SG 核准

- **WHEN** Checker Release 有效 A8
- **THEN** SG Confirmed Balance SHALL 增加
- **AND** parent LC off-balance exposure SHALL 繼續由 SG 保留

### Requirement: A9 提貨擔保贖回

A9 SHALL 全額贖回所選未結清 SG，並 SHALL 只在 Checker Release 成功時釋放 parent off-balance exposure。

#### Scenario: Redemption 已 Release

- **WHEN** Checker Release A9
- **THEN** SG Confirmed Balance SHALL 成為零
- **AND** 對應 parent LC capacity SHALL 恢復

### Requirement: A10 LC Close

A10 SHALL 只關閉不存在不合資格 open events 或相依未結清餘額的合資格進口 LC。

#### Scenario: 符合資格的 Close

- **WHEN** Checker 對符合資格 LC Release A10
- **THEN** 剩餘 LC Confirmed Balance SHALL 沖減至零
- **AND** contract status SHALL 成為 CLOSED

### Requirement: A11 LC Reopen

A11 SHALL 以 CLOSED 進口 LC 為目標，並 SHALL 從最後連續核准的 Close／Expire write-off chain 推導 restoration amount，而非由使用者輸入。

#### Scenario: Reopen 已關閉 LC

- **WHEN** Checker Release A11
- **THEN** 推導金額 SHALL 恢復
- **AND** status SHALL 依有效 Expiry Date 成為 ACTIVE 或 EXPIRED

## 來源追蹤

- `src/app/transaction-builder/balance-component.model.ts`
- `microservices/balance-component/src/service/`
- `docs/obsidian-balance-kb-v3.2/03-Balance-Flows/A-Import/`
- `backend/data/businessCases.js`
