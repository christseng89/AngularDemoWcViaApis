## MODIFIED Requirements

### Requirement: B3 提示單據

B3 SHALL 在合資格 Confirmation 下建立 `EPLC_EXAMINATION` memo-only Earmark，在 Maker 與 Checker 階段保持可見，並 SHALL NOT 直接減少 Confirmation Confirmed Balance。Amount 超過 Confirmation Tight Available 時，差額 SHALL 作為 Excess 驗證，而不是直接 hard-reject。

#### Scenario: Presentation 已 Release

- **WHEN** Checker Release 具有 Covered 與 Approved Excess attribution 的 B3
- **THEN** 其 Earmark SHALL 從 pending 分類轉為 approved 分類
- **AND** Excess Reservation SHALL 原子轉換為 Approved Excess

#### Scenario: Presentation 超過 Tight Available

- **WHEN** B3 Amount 超過 Confirmation Tight Available 且 revalued Excess 在 owner allowance 內
- **THEN** Maker Submit SHALL 建立 B3 Earmark 與 Pending Excess Reservation
- **AND** SHALL NOT 只因 Amount 超過 Tight Available 而拒絕

#### Scenario: B3 Excess 超過 Allowance

- **WHEN** B3 Excess USD Equivalent 超過 owner available allowance
- **THEN** 服務 SHALL 回傳 `EXCESS_LIMIT_EXCEEDED`
- **AND** SHALL NOT 建立 `EPLC_EXAMINATION` Earmark 或 reservation

## ADDED Requirements

### Requirement: Export Return Documents

B3 Return Documents SHALL 經 Maker／Checker，以 original B3 movement 與明確 amount 建立不可變 return／reversal facts；B4 consumption SHALL NOT 自動取代此 return。

#### Scenario: B3 Partial Return

- **WHEN** Checker 核准 B3 partial Return Documents
- **THEN** 只有 returned amount attributable Excess SHALL 從 owner utilization 調整
- **AND** 原 B3 與 FX snapshots SHALL 保持不可變

#### Scenario: B4 已完成不代表 Excess 已釋放

- **WHEN** B4 已消耗 B3 但沒有 Formal Increase 或 Return Documents
- **THEN** B3 Approved Excess SHALL 維持 owner cumulative utilization
