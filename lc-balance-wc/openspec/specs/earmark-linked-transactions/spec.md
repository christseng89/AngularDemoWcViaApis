# Earmark 與關聯交易規格

## Purpose

定義暫時 Capacity 保留及其轉換為已完成 Balance Movement 的行為，涵蓋 A3／A3S、Shipping Guarantee 與 B3／B4 關聯流程，避免虛帳遺失或同一 Exposure 重複扣減。

## Requirements

### Requirement: Earmark 可見性

即使虛帳不送至外部 Accounting System，系統仍 SHALL 持久化並顯示 EARMARKING／EARMARKED entries。

#### Scenario: B3 Submit 與 Release

- **WHEN** B3 Present Docs 已 Submit 並 Release
- **THEN** 其 internal memo voucher SHALL 保持可供審查
- **AND** SHALL NOT 暗示存在 downstream `accountEntries` payload

#### Scenario: A3 Submit 與 Acknowledge

- **WHEN** A3／A3S LC UTILIZE 已 Submit 或 Acknowledge
- **THEN** 其 EARMARKING／EARMARKED internal entries SHALL 在 Maker 與 Checker review 中可見

### Requirement: Memo-only Earmark 不沖銷

系統 SHALL NOT 只因消耗或完成 EARMARKED memo entry 而建立 accounting reversal。

#### Scenario: B4 消耗 B3

- **WHEN** B4 完成已 Release 的 B3 presentation
- **THEN** B3 SHALL 透過關聯流程標示為已消耗
- **AND** memo-only B3 entry SHALL NOT 產生獨立 reversal voucher

#### Scenario: A4 或 A6 完成 A3

- **WHEN** Settlement 或 Acceptance 完成已 acknowledge 的 A3 LC UTILIZE
- **THEN** 原 EARMARKED memo entry SHALL NOT 因完成而建立獨立 accounting reversal

### Requirement: A3 延後完成

A3 與 A3S 的 LC UTILIZE movements 在 acknowledgement 後 SHALL 保持 pending，並 SHALL 只依 LC tenor 由 A4 或 A6 完成。

#### Scenario: Usance 到單

- **WHEN** A6 選取已 acknowledge 的 Usance Document Arrival
- **THEN** 單次 Checker Release SHALL 原子完成被引用的 LC UTILIZE 並核准新的 Acceptance leg

#### Scenario: Tenor 不符合完成 Function

- **WHEN** Sight Arrival 嘗試由 A6 完成，或 Usance Arrival 嘗試由 A4 完成
- **THEN** UI SHALL NOT 將該 Arrival 列為合資格
- **AND** 服務 SHALL 拒絕直接請求

### Requirement: Shipping Guarantee Capacity

未結清 Shipping Guarantee SHALL 減少 parent LC Tight Available；standalone redemption SHALL 只在 Checker 完成時釋放該 exposure。

#### Scenario: Pending A9 Redemption

- **WHEN** A9 Redemption 已 Submit 但尚未 Release
- **THEN** parent off-balance exposure SHALL 保持保留

#### Scenario: A9 Redemption 已 Release

- **WHEN** 不同 Checker Release 合資格的 standalone A9
- **THEN** 對應 SG exposure SHALL 從 parent LC off-balance exposure 釋放

### Requirement: 避免重複計算

A3S 與 B4 provisional consumption 在檢查新 reducing movement 時 SHALL 淨除被引用的 earmark，避免同一 exposure 扣減兩次。

#### Scenario: SG 覆蓋 A3S Bill

- **WHEN** Arrival Amount 已由所選未結清 SG 覆蓋
- **THEN** 只有超過 SG reservation 的金額 SHALL 需要額外 parent capacity

#### Scenario: B4 消耗 Presentation

- **WHEN** B4 以已 Release B3 作為 provisional consumption 來源
- **THEN** sufficiency 檢查 SHALL 先淨除該 B3 已保留的 presentation exposure
- **AND** SHALL NOT 對同一金額重複扣減 Confirmation capacity

## 來源追蹤

- `microservices/balance-component/src/domain/offBalanceExposure.ts`
- `microservices/balance-component/src/service/movementReleaseSideEffectService.ts`
- `docs/obsidian-balance-kb-v3.2/02-Business-Rules/Earmark Rules.md`
- `docs/obsidian-balance-kb-v3.2/03-Balance-Flows/Cross-Function-Flows/Linked Transaction Flows.md`
