# 出口保兌交易規格

## Purpose

定義出口保兌信用證及相關餘額的可觀察 B 系列交易行為，涵蓋 B1–B7 的保兌、修改、提示單據、承兌／付款、到期結算、關閉及重新開啟流程。

## Requirements

### Requirement: B1 信用證保兌

B1 SHALL 使用 Amount、Currency、Expiry Date、整數 Tolerance 及配置的 Sight／Usance Export Tenor 建立 Export Confirmation。

#### Scenario: Confirmation 已 Release

- **WHEN** Maker Submit 有效 B1，並由不同 Checker Release
- **THEN** Confirmation Confirmed 與 Tight Available SHALL 等於 Tolerance 調整後 ceiling

#### Scenario: 重複 Confirmation natural key

- **WHEN** Maker 以已存在的 Export Confirmation natural key Submit 新 B1
- **THEN** 服務 SHALL 拒絕重複建立
- **AND** SHALL NOT 產生第二筆 ISSUE balance effect

### Requirement: B2 保兌信用證 Amendment

B2 SHALL 支援 Amount、Tolerance Change 或兩者同時輸入，並 SHALL 計算完整 current amount 的 upper-limit delta；也 SHALL 支援不含 Tolerance 的 Expiry Date Amendment。

#### Scenario: Decrease 超過 Tolerance

- **WHEN** B2 Tolerance Decrease 會產生負數 resulting Tolerance
- **THEN** Angular 與 API SHALL 拒絕

#### Scenario: Amount 與 Tolerance 同時修改

- **WHEN** Maker 在同一 B2 輸入 Amount Change 與整數 Tolerance Change
- **THEN** 服務 SHALL 以完整 current amount 計算 resulting ceiling
- **AND** Pending Amendment Balance Effect SHALL 等於 resulting ceiling 與目前已核准 ceiling 的差額

### Requirement: B3 提示單據

B3 SHALL 在合資格 Confirmation 下建立 `EPLC_EXAMINATION` memo-only Earmark，在 Maker 與 Checker 階段保持可見，並 SHALL NOT 直接減少 Confirmation Confirmed Balance。

#### Scenario: Presentation 已 Release

- **WHEN** Checker Release B3
- **THEN** 其 Earmark SHALL 從 pending 分類轉為 approved 分類
- **AND** total presentation earmark 與 Confirmation Tight Available SHALL 保持相同保留金額

#### Scenario: Presentation 超過 Tight Available

- **WHEN** B3 Amount 超過服務端重新計算的 Confirmation Tight Available
- **THEN** 服務 SHALL 拒絕 B3 Submit
- **AND** SHALL NOT 建立 `EPLC_EXAMINATION` Earmark

### Requirement: B4 Sight Honour

B4 SHALL 使用 Confirmation 的 Sight Tenor、消耗一筆已 Release B3，並在建立 Due-from-Issuing-Bank asset leg 時原子減少 Confirmation。

#### Scenario: Honour Release

- **WHEN** Checker Release Sight B4
- **THEN** Confirmation liability SHALL 減少
- **AND** 關聯 B3 SHALL 被消耗
- **AND** Due-from asset SHALL 原子增加

#### Scenario: Sight Honour 的 Tenor 或來源不合資格

- **WHEN** B4 Sight Honour 引用 Usance Confirmation 或未 Release／已消耗的 B3
- **THEN** UI SHALL NOT 將該來源列為合資格
- **AND** 服務 SHALL 原子拒絕直接請求，不得完成任何 balance leg

### Requirement: B4 Usance Acceptance

B4 SHALL 使用 Confirmation 的 Usance Tenor，並原子消耗 B3、減少 Confirmation、建立 Export Acceptance 與 Reimbursement Receivable。

#### Scenario: Acceptance Release

- **WHEN** Checker Release Usance B4
- **THEN** 所有必要 legs 與 B3 consumption SHALL 原子完成

#### Scenario: Usance Acceptance 的 Tenor 或來源不合資格

- **WHEN** B4 Usance Acceptance 引用 Sight Confirmation 或未 Release／已消耗的 B3
- **THEN** UI SHALL NOT 將該來源列為合資格
- **AND** 服務 SHALL 原子拒絕直接請求，不得建立部分 Acceptance 或 Receivable leg

### Requirement: B5 到期結算

B5 SHALL 全額結算符合資格的未結清 Export Acceptance，並 SHALL NOT 隱含結算獨立的 Reimbursement Receivable。

#### Scenario: Acceptance 已結算

- **WHEN** Checker Release B5
- **THEN** 所選 Export Acceptance Confirmed Balance SHALL 成為零
- **AND** 該 B5 movement SHALL NOT 改變 Confirmation 與 Reimbursement Receivable balances

#### Scenario: 沒有合資格未結清 Acceptance

- **WHEN** Export Acceptance 已全額結算、非 ACTIVE，或已有衝突的 open movement
- **THEN** UI SHALL NOT 將其列為 B5 合資格選項
- **AND** 服務 SHALL 拒絕直接 Settlement 請求

### Requirement: B6 保兌信用證 Close

B6 SHALL 只關閉沒有未結清 Acceptance、open event 或未消耗 B3 Presentation 的 Confirmation。

#### Scenario: 未消耗 B3 阻止 Close

- **WHEN** 其他條件合格的 Confirmation 仍有未消耗 Presentation
- **THEN** B6 SHALL NOT 將其列為合資格選項
- **AND** 服務 SHALL 拒絕直接 Close 嘗試

#### Scenario: 符合資格的 Confirmation Close

- **WHEN** Checker 對沒有未結 Acceptance、open event 或未消耗 B3 的 Confirmation Release B6
- **THEN** 剩餘 Confirmation Confirmed Balance SHALL 沖減至零
- **AND** contract status SHALL 成為 CLOSED

### Requirement: B7 保兌信用證 Reopen

B7 SHALL 以 CLOSED Confirmation 為目標，並 SHALL 使用服務端推導的 restoration amount。

#### Scenario: ACTIVE Confirmation

- **WHEN** 呼叫端嘗試對 ACTIVE Confirmation 執行 B7
- **THEN** 請求 SHALL 被拒絕

#### Scenario: Reopen 已關閉 Confirmation

- **WHEN** Checker 對 CLOSED Confirmation Release B7
- **THEN** 服務端推導的 restoration amount SHALL 恢復
- **AND** status SHALL 依有效 Expiry Date 成為 ACTIVE 或 EXPIRED

## 來源追蹤

- `src/app/transaction-builder/balance-component.model.ts`
- `microservices/balance-component/src/service/`
- `docs/obsidian-balance-kb-v3.2/03-Balance-Flows/B-Export/`
- `backend/data/businessCases.js`
