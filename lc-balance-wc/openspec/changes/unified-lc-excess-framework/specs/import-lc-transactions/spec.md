## MODIFIED Requirements

### Requirement: A3 到單

A3 SHALL為符合資格且已Release的進口LC建立虛擬LC UTILIZE Earmark，並 SHALL將LC最終完成延後至A4或A6。LC UTILIZE amount SHALL等於Covered Amount而非Legal Amount；Excess只進Excess ledger／attribution，不得減少LC Tight。僅當resolved policy的`configuredMaximumUsd > 0`且`allowancePercentage > 0`時，Amount超過parent Tight Available的差額 SHALL作為Excess驗證；任一配置值為零時 SHALL使用變更前既有sufficiency hard-reject。

#### Scenario: A3 Acknowledgement

- **WHEN** Checker 以最新 facts／policy／allowance／合格 BOOKING quote 成功 Acknowledge 具有 Covered 與 Pending Excess 的有效 A3
- **THEN** entry SHALL 顯示 EARMARKED 與 immutable Excess attribution
- **AND** LC UTILIZE movement SHALL 保持 `PENDING`，Pending Excess Reservation亦保持Pending，直到 Sight A4 或 Usance A6 final Checker Release
- **AND** Legal Amount、Covered Amount、Excess Amount及calculation snapshot SHALL鎖定供A4／A6使用

#### Scenario: A3 Acknowledge 後禁止 Amount Fix

- **GIVEN** A3 `acknowledgedAt != null`且Acknowledge已鎖定Legal／Covered／Excess snapshot
- **WHEN** Maker嘗試Fix／Resubmit該A3 Amount
- **THEN** API SHALL在policy／FX／write前回傳HTTP `409`／`ILLEGAL_STATE_TRANSITION`且UI SHALL保護Amount
- **AND** movement、amount、Pending Excess Reservation與locked snapshot SHALL保持不變

#### Scenario: 到單金額超過 Tight Available

- **WHEN** A3 Amount 超過服務端重新計算的 LC Tight Available，且 owner-currency Excess Amount 在 owner allowance 內
- **THEN** Maker Submit SHALL 建立單一 A3 movement 與 Pending Excess Reservation
- **AND** SHALL NOT 因 Amount 單獨超過 Tight Available 而拒絕
- **AND** A3 LC UTILIZE earmark SHALL只等於Covered Amount，Excess SHALL NOT令LC Tight低於零

#### Scenario: A3 Excess 超過 Allowance

- **WHEN** A3 revalued Excess 超過 owner available allowance
- **THEN** Maker Submit SHALL 回傳 HTTP `409`／`EXCESS_LIMIT_EXCEEDED`
- **AND** SHALL NOT 建立 A3／LC UTILIZE movement、Pending Excess Reservation、snapshot 或 ledger event

#### Scenario: A3 Zero Allowance 超過 Tight Available

- **GIVEN** `configuredMaximumUsd = 0` 或 `allowancePercentage = 0`
- **WHEN** A3 Amount 超過服務端重新計算的 LC Tight Available
- **THEN** 服務 SHALL 回傳既有 `409 INSUFFICIENT_AVAILABLE_BALANCE` code 與 message
- **AND** SHALL 維持 zero-write，且 SHALL NOT 呼叫 FX 或建立任何 Excess fact

### Requirement: A3S 到單連同提貨擔保

A3S SG Redemption、SG Available Balance update與Account Entries SHALL完全沿用current spec／`main`。本Change只規範Covered／Excess：`A3S Base Parent Tight Available` SHALL將本筆A3S自身SG redemption leg及LC UTILIZE earmark／movement effect自parent Tight snapshot淨除；`Current SG Redemption Amount` SHALL取main實際贖回金額；`Effective Presentation Capacity = A3S Base Parent Tight Available + Current SG Redemption Amount`；`Covered = MIN(Arrival Amount, Effective Presentation Capacity)`；`Excess = MAX(0, Arrival Amount - Covered)`。Maker Submit在SG redemption leg仍為pending時亦 SHALL得到相同結果，不得重複扣減self-leg。

A3S Checker Acknowledge SHALL鎖定Legal Amount、Covered Amount、Excess Amount、A3S Base Parent Tight Available、Current SG Redemption Amount及Effective Presentation Capacity。LC UTILIZE仍為`PENDING`／EARMARKED且Excess Reservation仍為Pending。A4／A6 final Release SHALL以locked split重驗FX、allowance及release eligibility，並使用與B4相同的`ABSENT + Checker Approve`操作；不得要求Applicant Waiver，亦不得因後續parent Tight／capacity變化重新拆分Covered／Excess。

#### Scenario: A3S Acknowledge 後禁止 Amount Fix

- **GIVEN** A3S `acknowledgedAt != null`且Acknowledge已鎖定Legal／Covered／Excess與normalized capacity snapshot
- **WHEN** Maker嘗試Fix／Resubmit該A3S Amount
- **THEN** 服務與UI SHALL拒絕monetary Fix／Resubmit，不論LC UTILIZE為`PENDING`／EARMARKED或`REJECTED`
- **AND** SHALL保留原Amount、Pending Excess Reservation、locked snapshot與main SG facts不變

#### Scenario: SG 覆蓋單據金額

- **WHEN** Bill Amount不超過normalized Effective Presentation Capacity
- **THEN** Covered SHALL等於Bill Amount且Excess SHALL為0
- **AND** 本Change SHALL只驗證self-leg normalization及Covered／Excess，不改變main SG legal lifecycle

#### Scenario: Bill 超過 SG Eligible Capacity

- **WHEN** A3S Bill超過normalized Effective Presentation Capacity
- **THEN** Covered SHALL等於Effective Presentation Capacity，Excess SHALL等於Bill減Covered
- **AND** 同一self SG／LC UTILIZE leg SHALL NOT再次減少parent capacity或增加Excess

#### Scenario: Normalized A3S Concrete Regression

- **GIVEN** A3S Base Parent Tight Available為`4,000`、Current SG Redemption Amount為`6,000`且Arrival Amount為`10,200`
- **WHEN** Maker Submit計算Covered／Excess，即使SG redemption leg仍為pending
- **THEN** Effective Presentation Capacity SHALL為`10,000`、Covered SHALL為`10,000`、Pending Excess SHALL為`200`，不得為`6,200`
- **AND** main entries SHALL保持SG `-6,000`及LC UTILIZE `-10,000`，parent net capacity effect SHALL為`-4,000`

#### Scenario: 所選 SG 已無未結清餘額

- **WHEN** A3S 引用的 SG 已無 Eligible Capacity Outstanding 或不再符合資格，且沒有其他 Eligible SG
- **THEN** 服務 SHALL 拒絕該 A3S
- **AND** LC Arrival、main SG side effects與Excess Reservation SHALL NOT部分建立

#### Scenario: A3S Sequential Alternative SG Guidance

- **WHEN** 目前所選 SG 的 Effective Presentation Capacity 不足且另有 Eligible SG
- **THEN** response SHALL 先提示 Maker re-select Eligible SG，且 SHALL NOT 自動選擇
- **AND** SHALL NOT 同時顯示目前 SG 選擇下的 Minimum Required Increase
- **AND** 重新選擇後 SHALL重讀Current SG Redemption Amount、重新normalize Base Parent Tight並重算Effective Presentation Capacity；只有仍不足時才顯示新的Minimum Required Increase並引導既有A2

#### Scenario: A3S Zero Allowance 的未覆蓋差額

- **GIVEN** `configuredMaximumUsd = 0` 或 `allowancePercentage = 0`
- **WHEN** A3S Bill超過normalized Effective Presentation Capacity
- **THEN** 服務 SHALL 回傳既有 `409 INSUFFICIENT_AVAILABLE_BALANCE` code 與 message
- **AND** SHALL 維持 zero-write，且 SHALL NOT 呼叫 FX 或建立第二次 Excess utilization

#### Scenario: A3S Excess 超過 Allowance

- **GIVEN** `configuredMaximumUsd > 0`且`allowancePercentage > 0`，並已完成sequential SG resolution及normalized calculation
- **WHEN** A3S新增projected Excess仍超過owner available allowance
- **THEN** Maker Submit SHALL回傳HTTP `409`／`EXCESS_LIMIT_EXCEEDED`
- **AND** LC Arrival、main SG side effects、Pending Excess Reservation、snapshots、ledger與idempotent success SHALL全部zero-write

## ADDED Requirements

### Requirement: No Import Return Documents

本期 SHALL NOT新增A3／A3S Return Documents或Approved Excess adjustment。A3／A3S只有在整筆仍為`PENDING`／`REJECTED`時才可使用既有Delete Pending；Delete Pending不接受amount並全額釋放該movement的Pending Excess Reservation。

#### Scenario: Pre-Acknowledge A3S Pending Is Fully Deleted

- **WHEN** Maker Delete一筆尚未Acknowledge／pre-approval的`PENDING`／`REJECTED` A3S
- **THEN** 整筆 compound pending transaction 與 side effects SHALL 原子移除／回滾
- **AND** Pending Excess Reservation SHALL 全額釋放，不得部分刪除

#### Scenario: Acknowledged A3S Delete Preserves Main SG Facts

- **WHEN** A3S已Acknowledge且其A4／A6後續被Reject後依既有Delete Pending流程刪除仍Pending的LC UTILIZE
- **THEN** Delete SHALL全額釋放該LC UTILIZE的Pending Excess Reservation
- **AND** SHALL保留既有Acknowledge與main SG facts，不得藉本Change回轉SG side effects；SG legal lifecycle不在本Change範圍

### Requirement: Common ABSENT Checker Approval Before Import Excess Final Release

具有正數Excess的A3／A3S在Sight A4 Payment或Usance A6 Acceptance Checker Release前，UI MUST使用與B4相同的共同`Checker Approve`控制。外部waiver／authorization claim SHALL預設`ABSENT`；服務 MUST NOT要求`Applicant Waiver = CONFIRMED`、MUST NOT回傳`APPLICANT_WAIVER_REQUIRED`，且 MUST NOT為新Release建立Applicant Waiver snapshot。未勾選時UI SHALL禁止Release；勾選後服務仍須在command time驗證Checker與Maker分離並通過FX、allowance及release eligibility。

#### Scenario: A4 or A6 Release With ABSENT External Claim

- **GIVEN** referenced A3／A3S具有正數Pending Excess Reservation
- **WHEN** 不同Checker在共同Excess Review勾選`Checker Approve`，外部claim為`ABSENT`，並通過既有FX、allowance及lifecycle gates
- **THEN** A4／A6 Release MAY繼續，且 SHALL NOT建立Applicant Waiver snapshot
- **AND** SHALL finalise Acknowledge時鎖定的Covered Amount並將Pending Excess轉為Approved，且不得因later parent Tight重新拆分

#### Scenario: Legacy Applicant Waiver Fields Are Missing

- **WHEN** A4／A6引用正數Excess且legacy waiver validation fields缺失
- **THEN** 服務 SHALL按`ABSENT`處理並在其他Release gates通過時允許Release
- **AND** SHALL NOT以缺失waiver fields作為拒絕理由

#### Scenario: Covered-only A4 or A6 Does Not Require Excess Approval

- **WHEN** referenced A3／A3S的authoritative Excess Amount為0
- **THEN** common Excess approval gate SHALL不適用
- **AND** A4／A6 SHALL繼續使用既有Maker／Checker、FX及lifecycle規則
