## ADDED Requirements

### Requirement: Excess Aggregates Are Separate from Contractual Balance

Pending Excess Reservation 與 Approved Excess SHALL以allowance owner ledger推導，並 MUST NOT增加或減少LC／Confirmation Contractual Amount、Confirmed Balance或Tight Available。對A3／A3S／B3及其A4／A6／B4 downstream completion，只有locked Covered Amount可成為formal capacity movement／earmark／finalisation amount；Excess不得進入、重複扣減或恢復formal capacity。

#### Scenario: Excess Movement Reaches Its Approval Point

- **WHEN** Checker Release含Excess的B3，或A4／A6 final Release含Excess的A3／A3S
- **THEN** Approved Excess aggregate SHALL 以 owner currency 增加核准 Excess Amount
- **AND** root contractual amount SHALL 不因 Excess aggregate 增加

#### Scenario: Only Covered Reduces Formal Capacity

- **GIVEN** Legal Amount為`10,200`、Covered為`10,000`且Excess為`200`
- **WHEN** A3／A3S LC UTILIZE或B3 Confirmation earmark建立並由A4／A6／B4完成
- **THEN** formal LC／Confirmation capacity movement SHALL只為`-10,000` Covered
- **AND** Excess `200` SHALL只存在於Excess ledger／attribution，不得令Tight額外減少、變為負數或在downstream再次扣減

#### Scenario: A3／A3S Acknowledge Is Not Final Approval

- **WHEN** Checker Acknowledge含Excess的A3／A3S
- **THEN** Pending Excess aggregate與LC UTILIZE `PENDING`／EARMARKED狀態 SHALL保持
- **AND** Approved Excess aggregate SHALL NOT增加

#### Scenario: Downstream Completion

- **WHEN** 含 Approved Excess 的來源完成 Payment／Settlement／Honour／Acceptance
- **THEN** operational balances SHALL 依各自規則變化
- **AND** Approved Excess aggregate SHALL 維持不變

### Requirement: A3S Normalized Presentation Capacity

A3S Covered／Excess calculation SHALL使用`Effective Presentation Capacity = A3S Base Parent Tight Available + Current SG Redemption Amount`，其中Base Parent Tight已淨除本筆自身SG redemption leg與LC UTILIZE earmark／movement effect。`Covered = MIN(Arrival, Effective Presentation Capacity)`且`Excess = MAX(0, Arrival - Covered)`。此計算不得改變main既有SG Account Entries或SG Available Balance behavior。

#### Scenario: A3S Self Legs Are Counted Once

- **GIVEN** Base Parent Tight為`4,000`、Current SG Redemption為`6,000`及Arrival為`10,200`
- **WHEN** system計算A3S split
- **THEN** Effective Presentation Capacity SHALL為`10,000`、Covered SHALL為`10,000`且Excess SHALL為`200`
- **AND** main entries SHALL保持SG `-6,000`、LC UTILIZE `-10,000`及parent net effect `-4,000`

### Requirement: Allowance Reservation Sufficiency

`percentageAllowanceOwner = approvedAllowanceBaseOwner × allowancePercentage`。Import的`approvedAllowanceBaseOwner` SHALL為`Issue LC Amount + cumulative formal／Checker-approved Increase - cumulative formal／Checker-approved Decrease`，明確排除Amount Tolerance；只有已Release／正式生效的A2 amount amendments可進入累計，Pending／未核准／Rejected／Deleted、tolerance-only及expiry-only amendments均不得改變LC Amount。Decrease SHALL以核准非負magnitude扣除。Export則為目前Checker-released Confirmation face amount。Tolerance MAY增加Covered capacity，但MUST NOT增加percentage allowance base。`configuredMaximumOwner` SHALL 使用 Currency Exchange 對 `fromCurrency=USD`、`toCurrency=ownerCurrency`、`amount=configuredMaximumUsd`、`purpose=BOOKING` 回傳的 provider `convertedAmount`。`effectiveLimitOwner = min(percentageAllowanceOwner, configuredMaximumOwner)`，`availableAllowanceOwner = max(0, effectiveLimitOwner - approvedExcessOutstandingOwner - otherPendingReservationsOwner)`。檢查 Fix／Resubmit／Checker 的本 movement 時 SHALL 從 owner-currency pending aggregate 排除或替換自己的既有 reservation exactly once。

#### Scenario: Only Formal Approved Amount Amendments Change LC Amount

- **GIVEN** Issue LC Amount為`10,000`、已正式核准Increase為`2,000`與`500`、已正式核准Decrease為`300`
- **AND** 另有Pending Increase=`1,000`、未核准Decrease=`400`及Tolerance=`10%`
- **WHEN** 系統計算Import LC Amount及percentage allowance base
- **THEN** LC Amount SHALL為`12,200`（`10,000 + 2,000 + 500 - 300`）
- **AND** Pending／未核准amendments及Tolerance SHALL不改變該Amount

#### Scenario: Tolerance Does Not Enlarge Percentage Allowance

- **GIVEN** Import LC face amount為`10,000`、Amount Tolerance為`10%`、allowance percentage為`2%`，且configured USD cap不形成更低限制
- **THEN** authoritative Covered capacity SHALL為`11,000`，percentage allowance SHALL為`200`而非`220`
- **WHEN** Arrival為`11,200`
- **THEN** Covered SHALL為`11,000`、Excess SHALL為`200`且該percentage boundary SHALL通過
- **WHEN** Arrival為`11,201`
- **THEN** Excess SHALL為`201`且Maker Submit SHALL以`EXCESS_LIMIT_EXCEEDED`拒絕並保持zero-write

#### Scenario: Concurrent Maker Submits

- **WHEN** 兩筆 submissions 競爭同一 owner 剩餘 allowance，且合計會超限
- **THEN** transaction serialization／version check SHALL 對每筆依序使用已提交的 current facts，且 SHALL NOT lost-update 或讓兩筆都取得 `WITHIN_ALLOWANCE`
- **AND** 可容納者 MAY 為 `WITHIN_ALLOWANCE`；其後超限者 SHALL 回傳 `EXCESS_LIMIT_EXCEEDED` 並保持 zero-write，不得建立 pending movement／reservation

#### Scenario: Checker Revalidates Own Reservation

- **WHEN** Checker 對 existing pending movement 重新驗證
- **THEN** 系統 SHALL 從 other pending total 排除該 movement 自己的 reservation一次
- **AND** SHALL NOT double count 或 double release

### Requirement: Currency Conversion Precision

Configured Maximum USD cap 的 owner-currency equivalent SHALL 使用 provider USD→owner `convertedAmount`，並按 owner currency minor-unit precision `ROUND_HALF_UP`；Balance SHALL NOT 自行倒算 rate，JavaScript binary floating point MUST NOT 作為權威運算。

#### Scenario: Conversion Rounding Boundary

- **WHEN** provider conversion／contractual percentage 計算位於 owner-currency half-minor-unit 邊界
- **THEN** 系統 SHALL 依 owner currency minor unit `ROUND_HALF_UP`
- **AND** Maker／Checker snapshots SHALL 保存 rate 與 rounded result

#### Scenario: Zero Excess

- **WHEN** Covered Amount 等於 Transaction Amount
- **THEN** owner-currency Excess Amount SHALL 為零
- **AND** 系統 SHALL NOT 建立 non-zero reservation

### Requirement: Export Legal Amount Reconciliation

Export B4 SHALL以不同balance type記錄Covered Asset及Excess Asset，兩者總和 MUST等於Legal Amount。Sight Covered使用`Due from Issuing Bank`；Usance Covered使用`Reimbursement Receivable`；Excess使用`EXPORT_EXCESS_ASSET`。Debtor attribution不得改變balance type。

#### Scenario: Sight Reconciliation

- **GIVEN** Legal Amount 10,200、Covered 10,000、Excess 200
- **WHEN** Sight asset posting完成
- **THEN** `Due from Issuing Bank` SHALL為10,000，`EXPORT_EXCESS_ASSET` SHALL為200
- **AND** total asset SHALL為10,200

#### Scenario: Usance Reconciliation

- **GIVEN** Legal Amount 10,200、Covered 10,000、Excess 200
- **WHEN** Usance asset posting完成
- **THEN** `Reimbursement Receivable` SHALL為10,000，`EXPORT_EXCESS_ASSET` SHALL為200
- **AND** total asset SHALL為10,200
