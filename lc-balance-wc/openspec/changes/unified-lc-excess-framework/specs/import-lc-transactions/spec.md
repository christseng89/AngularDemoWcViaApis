## MODIFIED Requirements

### Requirement: A3 到單

A3 SHALL 為符合資格且已 Release 的進口 LC 建立虛擬 LC UTILIZE Earmark，並 SHALL 將 LC 最終完成延後至 A4 或 A6。僅當 resolved policy 的 `configuredMaximumUsd > 0` 且 `allowancePercentage > 0` 時，Amount 超過 parent Tight Available 的差額 SHALL 作為 Excess 驗證；任一配置值為零時 SHALL 使用變更前既有 sufficiency hard-reject。

#### Scenario: A3 Acknowledgement

- **WHEN** Checker Acknowledge 具有 Covered 與已核准 Excess 的有效 A3
- **THEN** entry SHALL 顯示 EARMARKED 與 immutable Excess attribution
- **AND** LC UTILIZE movement SHALL 保持未完成，直到 Settlement 或 Acceptance

#### Scenario: 到單金額超過 Tight Available

- **WHEN** A3 Amount 超過服務端重新計算的 LC Tight Available，且 Excess USD Equivalent 在 owner allowance 內
- **THEN** Maker Submit SHALL 建立單一 A3 movement 與 Pending Excess Reservation
- **AND** SHALL NOT 因 Amount 單獨超過 Tight Available 而拒絕

#### Scenario: A3 Excess 超過 Allowance

- **WHEN** A3 revalued Excess 超過 owner available allowance
- **THEN** 服務 SHALL 回傳 `EXCESS_LIMIT_EXCEEDED`
- **AND** SHALL NOT 建立 LC UTILIZE Earmark 或 Excess Reservation

#### Scenario: A3 Zero Allowance 超過 Tight Available

- **GIVEN** `configuredMaximumUsd = 0` 或 `allowancePercentage = 0`
- **WHEN** A3 Amount 超過服務端重新計算的 LC Tight Available
- **THEN** 服務 SHALL 回傳既有 `409 INSUFFICIENT_AVAILABLE_BALANCE` code 與 message
- **AND** SHALL 維持 zero-write，且 SHALL NOT 呼叫 FX 或建立任何 Excess fact

### Requirement: A3S 到單連同提貨擔保

A3S SHALL 原子使用所選 SG 的 Eligible SG Capacity 並建立關聯 LC Arrival，同時 SHALL 防止 parent capacity 與 Approved Excess 重複計算；A3S capacity redemption SHALL NOT 自動解除 SG legal／contingent liability。只有在 resolved policy 的 `configuredMaximumUsd > 0` 且 `allowancePercentage > 0` 時，超過 Eligible SG Capacity 的未覆蓋差額 MAY 進入 Covered／Excess 驗證；任一配置值為零時，該差額 SHALL 使用變更前既有 parent sufficiency 邏輯。

#### Scenario: SG 覆蓋單據金額

- **WHEN** Bill Amount 不超過所選 SG Eligible Capacity Outstanding
- **THEN** parent capacity 與 allowance 檢查 SHALL NOT 再次扣除已由 A8 歸屬的同一 Covered／Excess amount
- **AND** SG legal balance SHALL 保持不變

#### Scenario: Bill 超過 SG Eligible Capacity

- **WHEN** A3S Bill 超過所選 SG Eligible Capacity Outstanding
- **THEN** 只有未由 SG capacity 覆蓋的差額 SHALL 依 parent capacity 再拆分 Covered／Excess
- **AND** 同一 amount SHALL NOT 產生第二次 Approved Excess utilization

#### Scenario: 所選 SG 已無未結清餘額

- **WHEN** A3S 引用的 SG 已無 Eligible Capacity Outstanding 或不再符合資格
- **THEN** 服務 SHALL 拒絕該 A3S
- **AND** LC Arrival、capacity redemption 與 Excess Reservation SHALL NOT 部分建立

#### Scenario: A3S Zero Allowance 的未覆蓋差額

- **GIVEN** `configuredMaximumUsd = 0` 或 `allowancePercentage = 0`
- **WHEN** A3S Bill 超過所選 SG Eligible Capacity Outstanding，且未覆蓋差額超過既有 parent capacity
- **THEN** 服務 SHALL 回傳既有 `409 INSUFFICIENT_AVAILABLE_BALANCE` code 與 message
- **AND** SHALL 維持 zero-write，且 SHALL NOT 呼叫 FX 或建立第二次 Excess attribution

### Requirement: A8 提貨擔保開立

A8 SHALL 要求 SG Number 作為新 SHGT natural key 的一部分。僅當 resolved policy 的 `configuredMaximumUsd > 0` 且 `allowancePercentage > 0` 時，Amount 超過目前 parent Tight Available 的差額 SHALL 作為 Excess 驗證；任一配置值為零時 SHALL 使用變更前既有 sufficiency hard-reject。Excess-enabled A8 的 Checker Release SHALL 初始化與 Approved SG Amount 相等、含 Covered／Excess attribution 的 Eligible SG Capacity Outstanding。

#### Scenario: SG 核准

- **WHEN** Checker Release allowance 內的有效 A8
- **THEN** SG Confirmed Balance SHALL 增加
- **AND** Eligible SG Capacity Outstanding SHALL 初始化為 Approved SG Amount
- **AND** parent LC Approved Excess SHALL 只增加核准的 Excess portion

#### Scenario: SG Amount 超過 Parent Tight Available

- **WHEN** A8 Amount 超過 parent Tight Available 且 revalued Excess 未超過 allowance
- **THEN** Maker Submit SHALL 建立 SHGT Movement 與 Pending Excess Reservation
- **AND** SHALL NOT 只因超過 Tight Available 而拒絕

#### Scenario: A8 Excess 超過 Allowance

- **WHEN** A8 Excess USD Equivalent 超過 owner available allowance
- **THEN** 服務 SHALL 回傳 `EXCESS_LIMIT_EXCEEDED`
- **AND** SHALL NOT 建立 SHGT Movement、Eligible SG Capacity 或 reservation

#### Scenario: A8 Zero Allowance 超過 Parent Tight Available

- **GIVEN** `configuredMaximumUsd = 0` 或 `allowancePercentage = 0`
- **WHEN** A8 Amount 超過 parent Tight Available
- **THEN** 服務 SHALL 回傳既有 `409 INSUFFICIENT_AVAILABLE_BALANCE` code 與 message
- **AND** SHALL 維持 zero-write，且 SHALL NOT 呼叫 FX 或建立任何 Excess fact

## ADDED Requirements

### Requirement: Import Return and A8 Cancellation

A3／A3S Return Documents 與 A8 cancel／delete／non-issuance SHALL 經 Maker／Checker，以明確 original movement reference 精確 reverse 未被先前 reversal 使用的 attribution；它們 SHALL NOT 改寫原 movement。

#### Scenario: A3S Partial Return

- **WHEN** Checker 核准 A3S 的 partial Return Documents
- **THEN** attributable Approved Excess SHALL 精確減少
- **AND** Eligible SG Capacity restoration SHALL 遵守原 allocation 與 SG current eligibility

#### Scenario: A8 Non-issuance Reversal

- **WHEN** Checker 核准未發出 A8 的 cancellation
- **THEN** A8 attributable Approved Excess 與 Eligible SG Capacity SHALL 原子 reverse
- **AND** 任何已被 A3S 使用的 amount SHALL NOT 被重複 reverse
