## MODIFIED Requirements

### Requirement: B3 提示單據

B3 SHALL在合資格Confirmation下建立`EPLC_EXAMINATION` memo-only Earmark，在Maker與Checker階段保持可見，並 SHALL NOT直接減少Confirmation Confirmed Balance。Earmark capacity amount SHALL等於Covered Amount而非Legal Amount；Excess只進Excess ledger／attribution，不得減少Confirmation Tight。僅當resolved policy的`configuredMaximumUsd > 0`且`allowancePercentage > 0`時，Amount超過Confirmation Tight Available的差額 SHALL作為Excess驗證；任一配置值為零時 SHALL使用變更前既有sufficiency hard-reject。

#### Scenario: Presentation 已 Release

- **WHEN** Checker Release 具有 Covered 與 Approved Excess attribution 的 B3
- **THEN** 其 Earmark SHALL 從 pending 分類轉為 approved 分類
- **AND** Excess Reservation SHALL 原子轉換為 Approved Excess

#### Scenario: Presentation 超過 Tight Available

- **WHEN** B3 Amount 超過 Confirmation Tight Available 且 revalued Excess 在 owner allowance 內
- **THEN** Maker Submit SHALL 建立 B3 Earmark 與 Pending Excess Reservation
- **AND** SHALL NOT 只因 Amount 超過 Tight Available 而拒絕
- **AND** B3 Earmark capacity amount SHALL只等於Covered，Excess SHALL NOT令Confirmation Tight低於零

#### Scenario: B3 Excess 超過 Allowance

- **WHEN** B3 owner-currency Excess Amount 超過 owner available allowance
- **THEN** Maker Submit SHALL 回傳 HTTP `409`／`EXCESS_LIMIT_EXCEEDED`
- **AND** SHALL NOT 建立 `EPLC_EXAMINATION` Earmark、Pending Excess Reservation、snapshot 或 ledger event

#### Scenario: B3 Zero Allowance 超過 Tight Available

- **GIVEN** `configuredMaximumUsd = 0` 或 `allowancePercentage = 0`
- **WHEN** B3 Amount 超過 Confirmation Tight Available
- **THEN** 服務 SHALL 回傳既有 `409 INSUFFICIENT_AVAILABLE_BALANCE` code 與 message
- **AND** SHALL 維持 zero-write，且 SHALL NOT 呼叫 FX 或建立任何 Excess fact

## ADDED Requirements

### Requirement: No Export Return Documents

本期 SHALL NOT 新增 B3 Return Documents、partial return／cancellation 或 Approved Excess reversal。B3 只有在整筆仍為 `PENDING`／`REJECTED` 時才可使用既有 Delete Pending；已 Release B3 的 Approved Excess 維持累計占用。

#### Scenario: B3 Pending Is Fully Deleted

- **WHEN** Maker Delete 一筆 `PENDING`／`REJECTED` B3
- **THEN** 整筆 B3 SHALL 轉為 `DELETED` 並全額釋放其 Pending Excess Reservation
- **AND** request SHALL NOT 接受部分 amount

#### Scenario: B4 已完成不代表 Excess 已釋放

- **WHEN** B4 已消耗已 Release B3
- **THEN** B3 Approved Excess SHALL 維持 owner cumulative utilization
- **AND** 後續 Formal Increase 亦 SHALL NOT 自動減少或改寫該 utilization

### Requirement: Export Excess Authorization Is All-or-Nothing

對正數B3 Excess，系統 SHALL NOT將同一Excess按Issuing Bank授權金額拆成Issuing Bank與Recourse兩部分。B4 Checker在建立Covered／Excess assets時為唯一authorization decision point並保存immutable snapshot；B3只鎖定Legal／Covered／Excess，不決定debtor。當`authorizedAmount >= locked Excess Amount`、`authorizedCurrency = owner currency`、nonblank `authorizationReference`且由不同B4 Checker明確提交`authorizationValidationResult = CONFIRMED`時，完整Excess debtor attribution SHALL為Issuing Bank。authorization absent、不足額、幣別不符或未CONFIRMED時，完整Excess SHALL視為無有效授權，debtor attribution SHALL為Beneficiary／Recourse Party。`Checker == Maker`不是Recourse routing條件，而是整個B4 Checker action的`MAKER_CHECKER_CONFLICT`：zero asset writes。系統不得假設或新增外部authorization lookup service。

#### Scenario: Full Authorization Is Confirmed

- **GIVEN** B3 Excess Amount為200 owner currency
- **WHEN** B4建立assets時authorizationReference存在、authorizedAmount大於或等於200、authorizedCurrency等於owner currency，且不同Checker人工確認scope、applicability、authenticity／business validity並提交`CONFIRMED`
- **THEN** 完整Excess 200 SHALL取得`debtor = ISSUING_BANK` attribution
- **AND** 系統 SHALL snapshot reference、amount、currency、validation result、Checker與確認時間

#### Scenario: Partial Authorization Is Not Split

- **GIVEN** B3 Excess Amount為200且authorizedAmount為100
- **WHEN** B4 Checker執行authorization validation
- **THEN** authorization SHALL視為對該Excess無效，且不得建立Issuing Bank Asset 100／Recourse Asset 100的拆分
- **AND** 完整Excess 200 SHALL使用Excess Asset並標記`debtor = BENEFICIARY_OR_RECOURSE_PARTY`

#### Scenario: Objective Authorization Claim Is Invalid

- **WHEN** caller主張Issuing Bank authorization但reference缺失、authorizedAmount不足或currency不等於owner currency
- **THEN** 系統 SHALL不得接受Issuing Bank debtor attribution
- **AND** 完整Excess SHALL使用Recourse debtor，且不得透過外部lookup補足、推測或覆寫validation結果

#### Scenario: Maker Checker Conflict Rejects Entire B4 Decision

- **WHEN** B4 Checker與Maker為同一人
- **THEN** 系統 SHALL回傳`MAKER_CHECKER_CONFLICT`並禁止asset creation
- **AND** B3、Approved Excess、authorization decision snapshot及accounting facts SHALL保持不變

#### Scenario: B3 Cannot Pre-decide B4 Authorization

- **WHEN** B3 Checker Release正數Excess
- **THEN** B3 SHALL只鎖定Legal／Covered／Excess並轉換Approved Excess
- **AND** authorization input、manual validation、resolved debtor及snapshot SHALL留待B4 asset creation決定

### Requirement: Export Excess Uses Dedicated Excess Asset

B4建立Export資產時 SHALL只finalise／consume來源B3的locked Covered capacity amount，並保持Covered Asset與Excess Asset為不同balance type。Sight Covered部分 SHALL沿用既有`Due from Issuing Bank`；Usance Covered部分 SHALL沿用既有`Reimbursement Receivable`。完整Excess部分 SHALL建立獨立balance type（design canonical name：`EXPORT_EXCESS_ASSET`）；即使debtor attribution為Issuing Bank，Excess亦不得併回Covered Asset或再次扣減Confirmation capacity。Covered Asset與Excess Asset總和 MUST等於Legal Amount。

#### Scenario: Sight B4 Asset Split

- **GIVEN** Legal Amount 10,200、Covered 10,000、Excess 200
- **WHEN** Sight B4成功Honour並建立資產
- **THEN** `Due from Issuing Bank` SHALL為10,000，`EXPORT_EXCESS_ASSET` SHALL為200
- **AND** Total Asset SHALL為10,200，且兩腿共享同一business event與immutable attribution

#### Scenario: Usance B4 Asset Split

- **GIVEN** Legal Amount 10,200、Covered 10,000、Excess 200
- **WHEN** Usance B4成功Accept並建立資產
- **THEN** `Reimbursement Receivable` SHALL為10,000，`EXPORT_EXCESS_ASSET` SHALL為200
- **AND** Total Asset SHALL為10,200，且不得將現有balance type改名為泛稱`Issuing Bank Asset`

#### Scenario: B4 Compound Posting Is Atomic

- **WHEN** Covered Asset、Excess Asset、authorization attribution或accounting mapping任一validation／persistence失敗
- **THEN** B4 SHALL不得留下任何部分asset leg、voucher或consumption fact
- **AND** B3 operational earmark與Approved Excess SHALL保持原狀

#### Scenario: B5 Preserves Asset Separation

- **WHEN** Usance B5完成既有Acceptance Settlement
- **THEN** B5 SHALL不得把`EXPORT_EXCESS_ASSET`合併、改名或重複計入`Reimbursement Receivable`
- **AND** Excess Asset recovery／clearance在未另行批准前 SHALL保持獨立且不減少Approved Excess
