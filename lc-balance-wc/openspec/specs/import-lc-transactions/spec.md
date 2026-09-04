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

#### Scenario: 重複 LC Number

- **WHEN** Maker 以已存在的 Import LC natural key Submit 新 A1
- **THEN** 服務 SHALL 拒絕重複建立
- **AND** SHALL NOT 產生第二筆 ISSUE balance effect

### Requirement: A2 LC Amendment

A2 SHALL 支援 Increase／Decrease 的 Amount、Tolerance Change 或兩者同時輸入，並 SHALL 另行支援不含 Tolerance 的 Expiry Date Amendment。

#### Scenario: 只修改 Expiry Date

- **WHEN** Maker 使用有效新日期 Submit A2 Expiry Date
- **THEN** Amount 與 Tolerance SHALL NOT 為必填
- **AND** pending movement SHALL NOT 改變 Available Balance

#### Scenario: Tolerance Decrease 低於零

- **WHEN** A2 Decrease 的 `toleranceChangePct` 大於 Current Tolerance
- **THEN** Angular 與 API SHALL 拒絕該 Amendment
- **AND** SHALL NOT 建立 Pending Movement

### Requirement: A3 到單

A3 SHALL 為符合資格且已 Release 的進口 LC 建立虛擬 LC UTILIZE Earmark，並 SHALL 將 LC 最終完成延後至 A4 或 A6。

#### Scenario: A3 Acknowledgement

- **WHEN** Checker Acknowledge 有效 A3
- **THEN** entry SHALL 顯示 EARMARKED
- **AND** LC UTILIZE movement SHALL 保持未完成，直到 Settlement 或 Acceptance

#### Scenario: 到單金額超過 Tight Available

- **WHEN** A3 Amount 超過服務端重新計算的 LC Tight Available
- **THEN** 服務 SHALL 拒絕 A3 Submit
- **AND** SHALL NOT 建立 LC UTILIZE Earmark

### Requirement: A3S 到單連同提貨擔保

A3S SHALL 原子贖回所選未結清 SG 並建立關聯 LC Arrival，同時防止重複使用 SG 已保留 capacity。

#### Scenario: SG 覆蓋單據金額

- **WHEN** Bill Amount 不超過所選 SG Amount
- **THEN** parent capacity 檢查 SHALL NOT 再次扣除已覆蓋金額

#### Scenario: 所選 SG 已無未結清餘額

- **WHEN** A3S 引用的 SG 已全額贖回或不再符合資格
- **THEN** 服務 SHALL 拒絕該 A3S
- **AND** LC Arrival 與 SG Redemption SHALL NOT 部分建立

### Requirement: A4 Sight Settlement

A4 SHALL 只允許選取具有符合資格未結 A3／A3S Arrival 的 Sight LC，並 SHALL 將 Arrival Amount 作為 protected input 帶入。

#### Scenario: 完成 Sight Arrival

- **WHEN** 不同 Checker Release A4
- **THEN** 被引用的 LC UTILIZE movement SHALL 成為 APPROVED
- **AND** LC Confirmed Balance SHALL 按 protected Amount 減少

#### Scenario: Usance LC 不可執行 A4

- **WHEN** 呼叫端嘗試用 A4 結算 Usance LC 的 Document Arrival
- **THEN** UI SHALL NOT 將該資料列為 A4 合資格選項
- **AND** 服務 SHALL 拒絕直接請求

### Requirement: A6 承兌

A6 SHALL 只允許選取具有符合資格未結 Arrival 的 Usance LC，並 SHALL 在同一 Checker 動作中建立 Acceptance 及完成被引用的 LC Utilization。

#### Scenario: A6 複合 Release

- **WHEN** Checker Release A6
- **THEN** Acceptance CREATE 與被引用 LC UTILIZE SHALL 原子成為 APPROVED
- **AND** 兩組相關 vouchers SHALL 具有相同完成狀態

#### Scenario: Sight LC 不可執行 A6

- **WHEN** 呼叫端嘗試對 Sight LC 建立 A6 Acceptance
- **THEN** UI SHALL NOT 將該 LC 列為 A6 合資格選項
- **AND** 服務 SHALL 拒絕直接請求

### Requirement: A7 承兌結算

A7 SHALL 只結算符合資格的未結清 Import Acceptance，並 SHALL 支援 Partial 或 Full Settlement，且不改變 parent LC balance。

#### Scenario: 全額結算

- **WHEN** Checker 對剩餘 Acceptance Amount Release Full A7
- **THEN** 該 Acceptance Confirmed Balance SHALL 成為零

#### Scenario: Settlement 超過未結清 Acceptance

- **WHEN** A7 Partial Settlement Amount 超過所選 Acceptance Available Balance
- **THEN** 服務 SHALL 拒絕 Submit 或 Release
- **AND** Parent LC Balance SHALL 維持不變

### Requirement: A8 提貨擔保開立

A8 SHALL 要求 SG Number 作為新 SHGT natural key 的一部分，且 Amount 不得超過目前 parent Tight Available。

#### Scenario: SG 核准

- **WHEN** Checker Release 有效 A8
- **THEN** SG Confirmed Balance SHALL 增加
- **AND** parent LC off-balance exposure SHALL 繼續由 SG 保留

#### Scenario: SG Amount 超過 Parent Tight Available

- **WHEN** A8 Amount 超過服務端重新計算的 Parent LC Tight Available
- **THEN** 服務 SHALL 拒絕 A8
- **AND** SHALL NOT 建立 SHGT Movement

### Requirement: A9 提貨擔保贖回

A9 SHALL 全額贖回所選未結清 SG，並 SHALL 只在 Checker Release 成功時釋放 parent off-balance exposure。

#### Scenario: Redemption 已 Release

- **WHEN** Checker Release A9
- **THEN** SG Confirmed Balance SHALL 成為零
- **AND** 對應 parent LC capacity SHALL 恢復

#### Scenario: SG 不符合 Redemption 資格

- **WHEN** A9 目標 SG 已無 Available Balance 或已有衝突的 Open Movement
- **THEN** UI SHALL NOT 將該 SG 列為可選
- **AND** 服務 SHALL 拒絕直接 Redemption 請求

### Requirement: A10 LC Close

A10 SHALL 只關閉不存在不合資格 open events 或相依未結清餘額的合資格進口 LC。

#### Scenario: 符合資格的 Close

- **WHEN** Checker 對符合資格 LC Release A10
- **THEN** 剩餘 LC Confirmed Balance SHALL 沖減至零
- **AND** contract status SHALL 成為 CLOSED

#### Scenario: 未結清相依交易阻止 Close

- **WHEN** Import LC 仍有不允許 Close 的 Open Event、Acceptance 或其他相依未結清餘額
- **THEN** A10 SHALL NOT 將該 LC 列為合資格
- **AND** 服務 SHALL 拒絕直接 Close

### Requirement: A11 LC Reopen

A11 SHALL 以 CLOSED 進口 LC 為目標，並 SHALL 從最後連續核准的 Close／Expire write-off chain 推導 restoration amount，而非由使用者輸入。

#### Scenario: Reopen 已關閉 LC

- **WHEN** Checker Release A11
- **THEN** 推導金額 SHALL 恢復
- **AND** status SHALL 依有效 Expiry Date 成為 ACTIVE 或 EXPIRED

#### Scenario: ACTIVE LC 不可 Reopen

- **WHEN** 呼叫端嘗試對 ACTIVE Import LC 執行 A11
- **THEN** UI SHALL NOT 將該 LC 列為 Reopen 合資格
- **AND** 服務 SHALL 拒絕該請求

## 來源追蹤

- `src/app/transaction-builder/balance-component.model.ts`
- `microservices/balance-component/src/service/`
- `docs/obsidian-balance-kb-v3.2/03-Balance-Flows/A-Import/`
- `backend/data/businessCases.js`
