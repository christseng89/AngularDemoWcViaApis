## ADDED Requirements

### Requirement: Excess Aggregates Are Separate from Contractual Balance

Pending Excess Reservation 與 Approved Excess SHALL 以 allowance owner ledger 推導，並 MUST NOT 增加 LC／Confirmation Contractual Amount、Confirmed Balance 或 Tight Available。

#### Scenario: Excess Movement Released

- **WHEN** Checker Release 含 Excess 的 A8／A3／A3S／B3
- **THEN** Approved Excess aggregate SHALL 增加核准 Excess USD Equivalent
- **AND** root contractual amount SHALL 不因 Excess aggregate 增加

#### Scenario: Downstream Completion

- **WHEN** 含 Approved Excess 的來源完成 Payment／Settlement／Honour／Acceptance
- **THEN** operational balances SHALL 依各自規則變化
- **AND** Approved Excess aggregate SHALL 維持不變

### Requirement: Allowance Reservation Sufficiency

Owner available allowance SHALL 等於 configured maximum 減 Approved Excess outstanding 再減其他 Pending Reservations；檢查本 movement 時 SHALL 排除自己的既有 reservation exactly once。

#### Scenario: Concurrent Maker Submits

- **WHEN** 兩筆 submissions 競爭同一 owner 剩餘 allowance，且合計會超限
- **THEN** transaction serialization／version check SHALL 最多允許可容納的 submission 成功
- **AND** SHALL NOT overbook allowance

#### Scenario: Checker Revalidates Own Reservation

- **WHEN** Checker 對 existing pending movement 重新驗證
- **THEN** 系統 SHALL 從 other pending total 排除該 movement 自己的 reservation一次
- **AND** SHALL NOT double count 或 double release

### Requirement: Currency Conversion Precision

Excess USD Equivalent SHALL 使用 exact decimal Booking Rate 並按規定 USD precision `ROUND_HALF_UP`；JavaScript binary floating point MUST NOT 作為權威運算。

#### Scenario: Conversion Rounding Boundary

- **WHEN** unrounded USD equivalent 位於半分邊界
- **THEN** 系統 SHALL 依 USD minor unit `ROUND_HALF_UP`
- **AND** Maker／Checker snapshots SHALL 保存 rate 與 rounded result

#### Scenario: Zero Excess

- **WHEN** Covered Amount 等於 Transaction Amount
- **THEN** Excess USD Equivalent SHALL 為零
- **AND** 系統 SHALL NOT 建立 non-zero reservation

