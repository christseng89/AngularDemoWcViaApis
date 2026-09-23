## MODIFIED Requirements

### Requirement: 服務端權威重新驗證

Checker 在每一適用decision point前，服務 SHALL重新讀取目前movement、contract、相依餘額與有效policy。僅對resolved policy兩個限額值均大於零之Excess-enabled A3／A3S／B3，服務 SHALL讀取owner-currency Excess ledgers，並對非USD owner使用decision time最新Approved／Effective／fresh USD→owner Booking quote重新驗證。B3 decision point為自身Checker Release；A3／A3S包含Checker Acknowledge及其後Sight A4／Usance A6 final Release。

#### Scenario: Maker Submit 後 capacity 改變

- **WHEN** Maker Submit與適用Checker decision point之間的capacity、allowance或Booking Rate發生變化
- **THEN** B3 Release、A3／A3S Acknowledge及A4／A6 final Release SHALL各自使用當時最新已提交domain facts與最新合格rate
- **AND** movement 已不符合資格時 SHALL 原子失敗

#### Scenario: Release Rate Unavailable 或 Stale

- **WHEN** Checker 無法取得 Approved／Effective／fresh Booking Rate
- **THEN** 適用的Acknowledge或Release SHALL回傳`FX_RATE_UNAVAILABLE`或`FX_RATE_STALE`
- **AND** movement 與 Pending Excess Reservation SHALL 維持 pending 不變

#### Scenario: Release 時仍符合資格

- **WHEN** 不同Checker Release B3且重新讀取的facts與FX evidence仍符合資格
- **THEN** 服務 SHALL 在單一 transaction 核准 movement、轉換 reservation 並保存 Checker snapshot

#### Scenario: A3／A3S Acknowledge 時仍符合資格

- **WHEN** 不同Checker Acknowledge A3／A3S且重新讀取的facts與FX evidence仍符合資格
- **THEN** 服務 SHALL保存Checker snapshot但LC UTILIZE與Pending Excess Reservation SHALL保持Pending
- **AND** SHALL鎖定Legal／Covered／Excess；對A3S另鎖定Base Parent Tight、Current SG Redemption Amount及Effective Presentation Capacity，且main SG處理維持不變

#### Scenario: A4／A6 Final Release 時仍符合資格

- **WHEN** 不同Checker以A4／A6 final Release再次重驗referenced A3／A3S且仍符合資格
- **THEN** 服務 SHALL以Acknowledge locked split在單一transaction finalise LC UTILIZE、轉換reservation並保存final Checker snapshot
- **AND** SHALL NOT依later parent capacity重新拆分Covered／Excess或再次執行main A3S SG side effects

#### Scenario: Revaluation Breach Cannot Be Released

- **WHEN** pending movement 在 Checker current-facts revaluation 時超過 Effective Limit
- **THEN** 適用的Checker Acknowledge或Release SHALL NOT被允許
- **AND** pending movement 與 Pending Excess Reservation SHALL 保留不變
- **AND** Checker MAY Reject，但 Reject SHALL NOT 釋放 reservation

#### Scenario: Zero Allowance Checker Decision

- **GIVEN** `configuredMaximumUsd = 0` 或 `allowancePercentage = 0`
- **WHEN** Checker執行B3 Release、A3／A3S Acknowledge或A4／A6 final Release
- **THEN** 服務 SHALL 依變更前既有 sufficiency 與 Maker／Checker 規則重新驗證
- **AND** SHALL NOT 呼叫 FX、要求 Booking Rate、轉換 reservation 或保存 Excess snapshot

### Requirement: Fix Pending 限制

Fix Pending SHALL只修改function policy允許的欄位。pending B3以及`acknowledgedAt = null`的A3／A3S MAY修改monetary amount；其Excess-enabled Amount Fix重跑Maker FX／allowance並原子替換reservation。A3S另 SHALL重新normalize Base Parent Tight、重讀Current SG Redemption Amount並重算Effective Capacity。post-Acknowledge A3／A3S Amount保持protected。

#### Scenario: 修正 remarks

- **WHEN** Maker 編輯 function policy 允許修正的說明並保存 pending movement
- **THEN** 允許的欄位 SHALL 更新
- **AND** protected 欄位 SHALL 維持不變

#### Scenario: 嘗試修正 Protected 欄位

- **WHEN** Fix Pending request 嘗試改變 function policy 未允許的 identity、reference、currency、monetary 或 linked-movement 欄位
- **THEN** 服務 SHALL 拒絕該修改
- **AND** 原 pending movement 與 reservation SHALL 維持不變

#### Scenario: Excess-enabled Amount Fix 成功

- **WHEN** Maker修正pending A3／B3或pre-Acknowledge pending A3S Amount且最新FX／allowance驗證成功
- **THEN** 系統 SHALL 以原 pending identity 原子扣除舊 Pending Transaction Amount、加入新 Pending Transaction Amount
- **AND** 對 Excess-enabled owner SHALL 原子扣除舊 Pending Excess Reservation、加入新計算的 Pending Excess Reservation
- **AND** audit SHALL 保存 before／after 與新 FX evidence

#### Scenario: A3／A3S Acknowledge 後禁止修正 Amount

- **GIVEN** A3或A3S `acknowledgedAt != null`且Legal／Covered／Excess split已鎖定
- **WHEN** Maker嘗試以Fix／Resubmit修改該為`PENDING`／EARMARKED或`REJECTED`的Amount
- **THEN** API SHALL 回傳 HTTP `409`／`ILLEGAL_STATE_TRANSITION`，且 SHALL NOT 執行 FX 或 allowance validation
- **AND** 原movement、amount、Pending Excess Reservation、FX／decision snapshot與locked facts SHALL完全不變；A3S main SG facts亦不得改變
- **AND** remarks-only correction MAY 依既有 function policy 處理，但 SHALL NOT 重新開放 monetary editing

#### Scenario: A3 Fix Pending Increase Replaces Old Excess

- **GIVEN** LC Amount／Effective Capacity 為 `10000`，原 A3 到單 Amount 為 `10200`，原 Pending Excess Reservation 為 `200`
- **WHEN** Fix Pending 將到單 Amount 改為 `10300`
- **THEN** 新計算 Pending Excess SHALL 為 `300`，舊 `200` SHALL 被排除 exactly once，不得累加為 `500`
- **AND** 新結果 SHALL 再依當時完整 allowance、FX 與 committed-excess facts決定；若超限 SHALL 拒絕 replacement並保持原 movement／reservation不變

#### Scenario: A3 Fix Pending Decrease Replaces Old Excess

- **GIVEN** LC Amount／Effective Capacity 為 `10000`，原 A3 到單 Amount 為 `10200`，原 Pending Excess Reservation 為 `200`
- **WHEN** Fix Pending 將到單 Amount 改為 `10100`
- **THEN** 新計算 Pending Excess SHALL 為 `100`，不得保留舊 `200`
- **AND** 新結果 SHALL 再依當時完整 allowance、FX 與 committed-excess facts決定；若超限 SHALL 拒絕 replacement並保持原 movement／reservation不變

#### Scenario: Amount Fix 的 FX 失敗

- **GIVEN** `configuredMaximumUsd > 0` 且 `allowancePercentage > 0`
- **WHEN** Amount Fix 無法取得合格 rate
- **THEN** API SHALL 回傳 `FX_RATE_UNAVAILABLE` 或 `FX_RATE_STALE`
- **AND** 原 pending movement 與 reservation SHALL 完全不變

#### Scenario: Replacement Validation or Persistence Fails

- **WHEN** Fix Pending 在 capacity、allowance、A3S normalization／main validation、store或audit任一步驟失敗
- **THEN** 系統 SHALL NOT 先扣除舊 Pending Amount 或舊 Pending Excess Reservation
- **AND** 原 pending movement、amount、reservation 與 authoritative snapshot SHALL 完全不變

#### Scenario: Zero Allowance Amount Fix

- **GIVEN** `configuredMaximumUsd = 0` 或 `allowancePercentage = 0`
- **WHEN** Maker 修正合資格 pending A3／B3或pre-Acknowledge pending A3S Amount
- **THEN** 服務 SHALL 重跑變更前既有 sufficiency gate
- **AND** SHALL NOT 呼叫 FX 或建立／替換 Excess reservation
- **AND** 若修正後 Amount 超過既有 capacity，SHALL 回傳既有 `409 INSUFFICIENT_AVAILABLE_BALANCE` code 與 message 並保持原 pending movement 不變

#### Scenario: 其他 Function 嘗試修正 Amount

- **WHEN** 非 A3／A3S／B3 的 Fix Pending request 嘗試改變 monetary field
- **THEN** 服務 SHALL 拒絕該修改
- **AND** 原 pending movement SHALL 維持不變

## ADDED Requirements

### Requirement: Maker Excess Submit Atomicity

Maker Submit SHALL 在同一 transaction 寫入 movement、Pending Excess Reservation、policy／FX snapshots、idempotency response 與 audit；任何驗證或寫入失敗 MUST 全部回滾。

#### Scenario: FX validation fails before persistence

- **WHEN** Maker Submit 收到 `FX_RATE_UNAVAILABLE` 或 `FX_RATE_STALE`
- **THEN** Excess Limit Validation SHALL NOT 標示完成
- **AND** SHALL NOT 建立 pending movement、reservation 或 `FX_RATE_PENDING` state

#### Scenario: Reservation write fails

- **WHEN** movement insert 成功但 reservation insert 在 transaction 內失敗
- **THEN** movement insert SHALL 回滾
- **AND** idempotency replay SHALL NOT 回傳假成功

#### Scenario: Calculable Over-limit Fails Before Write

- **WHEN** FX／configuration／domain prerequisites 均有效但 projected total 超過 Effective Limit
- **THEN** Maker Submit SHALL 回傳 HTTP `409`／`EXCESS_LIMIT_EXCEEDED`
- **AND** SHALL NOT 建立 movement、Pending Excess Reservation、snapshot、ledger event、audit-as-transaction fact 或 idempotent success

### Requirement: Resubmit Identity and Reservation Replacement

Maker Fix／Resubmit已存在的pending／rejected B3，以及`acknowledgedAt = null`的A3／A3S，SHALL沿用原identity並只在完整revalidation成功時原子替換Pending Excess Reservation。`acknowledgedAt != null`的A3／A3S Amount Fix／Resubmit MUST依BD-10拒絕。

#### Scenario: Resubmit Becomes Within Allowance

- **WHEN** 最新 facts使原已accepted後被`REJECTED`的movement通過完整revalidation
- **THEN** 原 movement identity SHALL 保持不變，workflow SHALL 原子由 `REJECTED` 轉回 `PENDING`
- **AND** 原 reservation SHALL 被新 snapshot 原子替換，decision SHALL 更新為 `WITHIN_ALLOWANCE`

#### Scenario: Resubmit Replacement Exceeds Limit

- **WHEN** 最新 facts 仍超過 Effective Limit
- **THEN** command SHALL 回傳 `EXCESS_LIMIT_EXCEEDED`，原 movement identity、workflow、amount、reservation 與 authoritative snapshots SHALL 完全不變
- **AND** Minimum Required Increase MAY 隨 error response更新，但不得持久化為成功 replacement

### Requirement: Common ABSENT Checker Approval Gate

A4／A6／B4引用正數Excess時，UI SHALL要求不同Checker勾選共同`Checker Approve`，外部claim預設`ABSENT`。A4／A6服務 SHALL NOT要求或保存Applicant Waiver；B4 ABSENT SHALL可在其他gates通過時Release並將完整Excess route至Recourse。未勾選時UI SHALL在任何final posting前禁止Release並保留全部pending facts。

#### Scenario: Checker Does Not Approve Excess

- **WHEN** A4／A6／B4引用正數Excess但Checker未勾選`Checker Approve`
- **THEN** UI SHALL禁止Release
- **AND** SHALL不finalise LC UTILIZE、不轉Approved Excess、不建立部分accounting side effect

### Requirement: B4 Export Authorization Objective and Manual Validation

對引用正數B3 Excess並建立資產的B4，系統 SHALL驗證authorization claim客觀條件：nonblank reference、authorizedAmount大於或等於完整locked Excess及authorizedCurrency等於owner currency；另以command authorization gate強制Checker不等於Maker。只有caller提交`SUBMITTED` claim且希望完整Excess debtor attribution為Issuing Bank時，Checker MUST人工確認scope、applicability及authenticity／business validity，並明確提交`authorizationValidationResult = CONFIRMED`。authorization `ABSENT`／partial／currency mismatch／not confirmed可在共同Checker Approve及其他gates通過後Release，完整route至Recourse；Checker等於Maker則拒絕整個B4 action，不得route。系統 SHALL不呼叫或新增外部authorization lookup service。

#### Scenario: Authorization Amount Is Below Full Excess

- **WHEN** authorizedAmount小於完整Excess Amount
- **THEN** 系統 SHALL視為無有效authorization且不得partial split
- **AND** 完整Excess SHALL歸屬Beneficiary／Recourse Party的獨立Excess Asset

#### Scenario: Checker Confirms Business Validity

- **WHEN** objective fields全部有效且不同Checker提交`CONFIRMED`
- **THEN** 系統 SHALL保存immutable authorization snapshot與Checker audit
- **AND** 完整Excess MAY歸屬Issuing Bank，但仍 MUST使用獨立Excess Asset balance type

#### Scenario: Maker Checker Conflict Rejects B4 Asset Creation

- **WHEN** B4 Checker與Maker為同一actor
- **THEN** 服務 SHALL回傳`MAKER_CHECKER_CONFLICT`並拒絕完整Checker action
- **AND** SHALL NOT建立Recourse attribution、authorization snapshot、Approved Excess或accounting side effect
