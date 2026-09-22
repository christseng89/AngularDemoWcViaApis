## MODIFIED Requirements

### Requirement: B3 提示單據

B3 SHALL 在合資格 Confirmation 下建立 `EPLC_EXAMINATION` memo-only Earmark，在 Maker 與 Checker 階段保持可見，並 SHALL NOT 直接減少 Confirmation Confirmed Balance。僅當 resolved policy 的 `configuredMaximumUsd > 0` 且 `allowancePercentage > 0` 時，Amount 超過 Confirmation Tight Available 的差額 SHALL 作為 Excess 驗證；任一配置值為零時 SHALL 使用變更前既有 sufficiency hard-reject。

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

#### Scenario: B3 Zero Allowance 超過 Tight Available

- **GIVEN** `configuredMaximumUsd = 0` 或 `allowancePercentage = 0`
- **WHEN** B3 Amount 超過 Confirmation Tight Available
- **THEN** 服務 SHALL 回傳既有 `409 INSUFFICIENT_AVAILABLE_BALANCE` code 與 message
- **AND** SHALL 維持 zero-write，且 SHALL NOT 呼叫 FX 或建立任何 Excess fact

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
