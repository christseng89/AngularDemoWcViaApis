## ADDED Requirements

### Requirement: Zero Allowance Regression

Runner SHALL對A3、A3S、B3覆蓋`(configuredMaximumUsd, allowancePercentage) = (0, 0)`、`(0, positive)`、`(positive, 0)`，證明任一零值代表不允許超押且不呼叫FX。

#### Scenario: Excess-enabled Functions With Zero Policy Value

- **WHEN** A3／A3S／B3在任一zero-config row超過既有capacity
- **THEN** SHALL驗證既有`INSUFFICIENT_AVAILABLE_BALANCE`及zero FX／Excess facts

### Requirement: Excess Regression Suite

Business Case Runner SHALL對A3、A3S、B3執行Covered-only、partial Excess、full Excess、exact-limit、over-limit zero-write rejection、Maker／Checker FX failure、revaluation、concurrency、eligible Fix／Resubmit、Formal Increase guidance、full Delete Pending及downstream lifecycle cases。A3與A3S SHALL覆蓋pre-Acknowledge eligible Fix及post-Acknowledge Amount Fix拒絕。

#### Scenario: Run All Excess Cases

- **WHEN** dependencies與deterministic Currency Exchange stub已就緒且選擇Run All
- **THEN** 每個case SHALL按隔離owner data執行
- **AND** 每一步 SHALL驗證movement、reservation、approved utilization、FX snapshot與error code

#### Scenario: Calculable Over-limit Submit Is Rejected

- **WHEN** A3／A3S／B3 projected total超過Effective Limit
- **THEN** SHALL驗證HTTP `409`／`EXCESS_LIMIT_EXCEEDED`及zero-write
- **AND** 完成A2／B2 Increase後 SHALL以fresh command重驗，而不是cure不存在的movement

#### Scenario: Covered-only Formal Capacity Movement

- **GIVEN** A3／A3S／B3 Legal Amount為`10,200`、Covered為`10,000`且Excess為`200`
- **WHEN** source及A4／A6／B4 downstream lifecycle完成
- **THEN** LC／Confirmation capacity movement／earmark／finalisation SHALL只使用Covered `10,000`
- **AND** Excess `200` SHALL只存在於Excess ledger／attribution，Tight不得低於零或被downstream重複扣減

#### Scenario: Runner-only Automatic Formal Increase

- **WHEN** 指定demo case收到A3／A3S／B3 `EXCESS_LIMIT_EXCEEDED`及`FINITE` guidance
- **THEN** 僅Runner MAY建立並Release A02／B02，再fresh Submit原交易
- **AND** 負Tight、其他error code或non-`FINITE` guidance SHALL NOT觸發此流程

### Requirement: A3S Anti-double-counting Regression

Runner SHALL驗證A3S以normalized Base Parent Tight加main Current SG Redemption Amount計算Effective Presentation Capacity，並淨除本筆self SG／LC UTILIZE legs各一次；本Change不建立或修改SG Redemption、SG Available Balance或legal lifecycle。

#### Scenario: Normalized A3S Concrete Case

- **GIVEN** Base Parent Tight為`4,000`、Current SG Redemption Amount為`6,000`且Arrival為`10,200`
- **WHEN** Maker Submit執行A3S，即使SG redemption leg仍為pending
- **THEN** Effective Presentation Capacity SHALL為`10,000`、Covered SHALL為`10,000`、Pending Excess SHALL為`200`且不得為`6,200`
- **AND** main entries SHALL保持SG `-6,000`、LC UTILIZE `-10,000`及parent net effect `-4,000`

#### Scenario: A3S Re-selection Re-normalizes Capacity

- **WHEN** Maker依提示re-select另一Eligible SG
- **THEN** Runner SHALL驗證Current SG Redemption Amount被重讀、Base Parent Tight被重新normalize且Covered／Excess完整重算
- **AND** 若仍超限才顯示新的Minimum Required Increase，且parent capacity與allowance均沒有double count

### Requirement: Unified ABSENT Checker Approval Regression

Runner SHALL對A4 Sight Payment、A6 Acceptance及B4驗證相同的ABSENT Checker approval操作。

#### Scenario: Positive Import Excess Uses ABSENT Approval

- **GIVEN** Legal Amount 10,200、Covered 10,000、Excess 200
- **WHEN** Checker尚未勾選共同`Checker Approve`
- **THEN** SHALL驗證UI不可Release且pending transaction／reservation保留
- **AND** 勾選後 SHALL在不提交Applicant Waiver資料下驗證final Release成功

#### Scenario: Covered-only Import Does Not Require Excess Approval

- **WHEN** referenced A3／A3S Excess為零
- **THEN** common Excess approval SHALL不是Release必要條件

#### Scenario: A6 and A7 Preserve Locked Attribution

- **GIVEN** A3／A3S locked Legal為`10,200`、Covered為`10,000`、Excess為`200`
- **WHEN** A6成功建立Legal Acceptance Outstanding後再執行A7 settlement
- **THEN** A6 SHALL保存Legal `10,200`及immutable Covered／Excess attribution，且不得建立新的capacity-control balance
- **AND** A7 SHALL只減少Legal Outstanding，不得重新allocation或減少Approved Excess

### Requirement: Export Authorization Regression

Runner SHALL驗證Export authorization全額有效或完整Recourse兩種結果，不得partial split或外部lookup。

#### Scenario: Full Valid Authorization

- **GIVEN** Excess為200且authorization reference存在、authorized amount為200、currency等於owner currency、Checker不同於Maker且validation result為`CONFIRMED`
- **WHEN** B4 Checker完成validation並建立assets
- **THEN** 完整200 debtor attribution SHALL為Issuing Bank

#### Scenario: Partial or Invalid Authorization

- **WHEN** authorized amount為100、currency錯誤、reference缺失或validation result不是`CONFIRMED`
- **THEN** 完整Excess 200 debtor attribution SHALL為Beneficiary／Recourse Party
- **AND** SHALL NOT建立100／100 split

#### Scenario: Maker Checker Conflict Does Not Route to Recourse

- **WHEN** B4 Checker等於Maker
- **THEN** Runner SHALL驗證`MAKER_CHECKER_CONFLICT`及zero finalisation writes
- **AND** SHALL NOT建立Recourse attribution作為fallback

### Requirement: Export Asset and Voucher Regression

Runner SHALL同步驗證`balance-account-mappings.json`、accounting vouchers、inquiry及B4／B5 lifecycle的Covered／Excess分離。

#### Scenario: Sight Asset Equals Legal Amount

- **GIVEN** Legal Amount 10,200、Covered 10,000、Excess 200
- **WHEN** Sight case完成
- **THEN** `Due from Issuing Bank` SHALL為10,000，`EXPORT_EXCESS_ASSET` SHALL為200
- **AND** Total Asset SHALL為10,200

#### Scenario: Usance Asset Equals Legal Amount

- **GIVEN** Legal Amount 10,200、Covered 10,000、Excess 200
- **WHEN** Usance case完成
- **THEN** `Reimbursement Receivable` SHALL為10,000，`EXPORT_EXCESS_ASSET` SHALL為200
- **AND** Total Asset SHALL為10,200，B5 SHALL保持兩腿分離

#### Scenario: B5 Settles Legal Outstanding Without Clearing Assets

- **WHEN** B5完成Usance legal settlement
- **THEN** SHALL驗證Legal Acceptance Outstanding依既有lifecycle減少
- **AND** `Reimbursement Receivable`與`EXPORT_EXCESS_ASSET`不得auto-clear、merge或減少Approved Excess

### Requirement: FX and Existing Lifecycle Regression

Runner SHALL對A3／A3S／B3驗證production provider-supplied BOOKING only、Approved／Effective／Freshness、authorized PBD、virtual-only midpoint、Maker zero-write及Checker retain-pending。A1–A11、B1–B7未被本Change明確修改的lifecycle、Maker／Checker、accounting、cleanup及inquiry suites SHALL保持通過。

#### Scenario: Production Must Not Derive Midpoint

- **WHEN** production adapter只有BUY／SELL而沒有provider BOOKING
- **THEN** SHALL驗證`FX_RATE_UNAVAILABLE`且不計算midpoint

#### Scenario: Applicant and Authorization Evidence Is Auditable

- **WHEN** waiver或authorization決定成功
- **THEN** Runner SHALL驗證validation result、Checker identity、server timestamp及適用reference facts可查詢且immutable

#### Scenario: No Return or Partial Cancellation Capability

- **WHEN** caller嘗試Return Documents、partial return／cancellation或Approved Excess reversal
- **THEN** SHALL驗證unsupported rejection及zero-write
- **AND** Delete Pending仍只接受整筆`PENDING`／`REJECTED` movement
