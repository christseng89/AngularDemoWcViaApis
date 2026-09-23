## ADDED Requirements

### Requirement: Excess-aware Downstream Eligibility

Payment、Settlement、Honour與Acceptance SHALL讀取原movement、locked Covered／Excess attribution及workflow；A3S eligibility另讀取normalized capacity snapshot但不改變main SG behavior。UI query僅供提示，command time MUST重新驗證適用的FX、allowance、waiver及release eligibility。

#### Scenario: Eligible Excess Movement

- **WHEN** downstream command引用合資格B3，或A4／A6引用已Acknowledge且仍持有Pending Excess Reservation的A3／A3S
- **THEN** command MAY 依原業務 lifecycle 執行
- **AND** Approved Excess attribution SHALL 保持可追溯

#### Scenario: Pending 或不合資格來源

- **WHEN** downstream command引用未核准或amount不足的來源，但該來源不是供其matching A4／A6 finalisation使用的已Acknowledge／EARMARKED A3／A3S
- **THEN** 服務 SHALL 拒絕 command
- **AND** SHALL NOT 建立部分 downstream legs

### Requirement: Downstream Completion Does Not Release Approved Excess

Downstream Payment、Settlement、Honour、Acceptance或A3S selected capacity consumption MUST NOT減少owner Approved Excess utilization；Formal Increase亦 MUST NOT減少或改寫utilization。本期不存在Return／Cancellation reversal，Approved Excess SHALL保持累計占用。

#### Scenario: B4 consumes B3

- **WHEN** B4 成功消耗含 Approved Excess 的 B3 presentation
- **THEN** B3 operational earmark MAY 完成
- **AND** owner Approved Excess SHALL 維持不變

#### Scenario: A4 or A6 finalises Arrival Excess

- **WHEN** A4或A6在共同`ABSENT + Checker Approve`操作後，以最新policy／allowance／BOOKING rate成功完成A3／A3S
- **THEN** referenced LC UTILIZE SHALL按Acknowledge locked Covered finalise，Pending Excess Reservation SHALL原子轉為Approved Excess
- **AND** SHALL NOT依later parent capacity重新拆分或再次執行main A3S SG side effects；其後downstream completion不得減少Approved Excess

#### Scenario: A4 or A6 Has No Common Checker Approval

- **GIVEN** referenced A3／A3S有正數Pending Excess
- **WHEN** A4／A6 Checker未勾選共同`Checker Approve`
- **THEN** UI SHALL禁止final Release；服務端不以Applicant Waiver作為Release gate
- **AND** referenced movement、Pending Excess Reservation、locked split及main A3S SG facts SHALL保持不變

### Requirement: Export Downstream Asset Creation

B4引用已Release的B3時 SHALL在asset creation command驗證authorization並保存snapshot，以決定完整Excess debtor attribution，並在同一atomic event建立Covered Asset與`EXPORT_EXCESS_ASSET`。不足額、幣別不符、缺reference或未`CONFIRMED`的authorization SHALL視為無有效授權，完整Excess debtor為Beneficiary／Recourse Party；不得partial split、later conversion或外部lookup。

#### Scenario: B4 Creates Sight Asset Legs Atomically

- **GIVEN** Sight Legal Amount 10,200、Covered 10,000、Excess 200
- **WHEN** B4成功完成
- **THEN** `Due from Issuing Bank` 10,000與`EXPORT_EXCESS_ASSET` 200 SHALL在同一transaction建立
- **AND** 任一腿失敗時兩腿均不得commit

#### Scenario: B4 Creates Usance Asset Legs Atomically

- **GIVEN** Usance Legal Amount 10,200、Covered 10,000、Excess 200
- **WHEN** B4成功完成
- **THEN** `Reimbursement Receivable` 10,000與`EXPORT_EXCESS_ASSET` 200 SHALL在同一transaction建立
- **AND** B5 SHALL保持兩種balance type分離，不得合併或重複計入

### Requirement: Import Usance Legal Amount and Locked Attribution

A6 Acceptance SHALL保存完整Legal Acceptance Amount，並沿用A3／A3S Acknowledge鎖定的Covered／Excess attribution；本Change不得建立新的capacity-control running balance，也不得把Excess併入正式Covered balance。A7 SHALL只減少Legal Acceptance Outstanding，不得以Covered-first、Excess-first或pro-rata方式重新配置locked attribution，且不得減少Approved Excess。

#### Scenario: A6 Accepts Full Legal Amount Without Re-splitting

- **GIVEN** locked Legal Amount為`10,200`、Covered為`10,000`、Excess為`200`且共同`Checker Approve`已勾選
- **WHEN** A6 Checker Release成功
- **THEN** Legal Acceptance Outstanding SHALL為`10,200`並保存immutable Covered `10,000`／Excess `200` attribution
- **AND** SHALL NOT建立`10,200`的Covered Acceptance Balance或依later Tight重新拆分

#### Scenario: A7 Reduces Only Legal Outstanding

- **WHEN** A7完成Acceptance Settlement
- **THEN** Legal Acceptance Outstanding SHALL依settlement amount減少
- **AND** locked Covered／Excess attribution與Approved Excess SHALL保持不變，不得執行allocation order

### Requirement: Export B5 Settles Legal Outstanding Only

B5 SHALL只處理既有Legal Acceptance Outstanding settlement。B5不得自動clear、merge或重新分類B4建立的Covered Asset或`EXPORT_EXCESS_ASSET`，亦不得減少Approved Excess。

#### Scenario: B5 Does Not Auto-clear Export Assets

- **WHEN** B5完成Usance legal settlement
- **THEN** Legal Acceptance Outstanding MAY依既有lifecycle減少
- **AND** `Reimbursement Receivable`與`EXPORT_EXCESS_ASSET` SHALL保持各自balance type及attribution，直到另有核准的recovery／clearance contract

### Requirement: No Return Documents Command

Balance Component SHALL NOT 提供 `RETURN_DOCUMENTS`、partial return／cancellation 或 Approved Excess reversal command／candidate／event。本期唯一撤回能力是針對整筆 `PENDING`／`REJECTED` movement 的 Delete Pending；Approved movement 不是 Delete Pending candidate。

#### Scenario: Caller Attempts Return Documents

- **WHEN** caller 嘗試提交 Return Documents、partial return／cancellation 或 Approved Excess reversal
- **THEN** API SHALL 依已記載的 unsupported／schema validation contract 拒絕
- **AND** SHALL NOT 建立 movement、reservation release、main SG mutation、ledger event 或 idempotent success

#### Scenario: Full Delete Pending Is Not a Return

- **WHEN** Maker 對整筆 `PENDING`／`REJECTED` movement 執行 Delete Pending
- **THEN** 系統 SHALL 刪除整筆 pending transaction 並全額釋放其 Pending Excess Reservation
- **AND** request SHALL NOT 接受 amount 或部分執行
