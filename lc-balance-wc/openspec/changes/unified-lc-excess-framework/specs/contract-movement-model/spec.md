## MODIFIED Requirements

### Requirement: Movement 冪等身分

系統 SHALL 以 command type、contract／owner context、actor context 與 `Idempotency-Key` 強制金融 command 冪等，並 SHALL 保存 canonical request hash。相同 key／相同 hash MUST replay 原 response；相同 key／不同 hash MUST 回傳 `IDEMPOTENCY_CONFLICT`。

#### Scenario: Event Seq 重複

- **WHEN** legacy-compatible request 使用相同 contract context 與 Event Seq 重送同一 canonical movement payload
- **THEN** 系統 SHALL 回傳既有結果或穩定 duplicate response
- **AND** SHALL NOT 重複套用任何 balance 或 Excess effect

#### Scenario: 不同 Contract Context 使用相同 Event Seq

- **WHEN** 兩個不同 logical contract contexts 收到相同 Event Seq
- **THEN** 冪等判定 SHALL 包含 contract context
- **AND** SHALL NOT 將其中一個 contract 的 movement 誤認為另一個

#### Scenario: 相同 Key 與 Payload 重送

- **WHEN** 使用相同 scope、key 與 canonical payload 再次送出 Maker／compound／Fix／Resubmit／Delete Pending command
- **THEN** 系統 SHALL 回傳既有 status 與 response body
- **AND** SHALL NOT 重複 movement、reservation、reservation release、deletion audit 或 balance effect

#### Scenario: 相同 Key 但 Payload 不同

- **WHEN** 相同 idempotency scope 與 key 搭配不同 canonical request hash
- **THEN** 系統 SHALL 回傳 `IDEMPOTENCY_CONFLICT`
- **AND** 原 command facts SHALL 維持不變

#### Scenario: 不同 Contract Context 使用相同 Key

- **WHEN** 兩個不同 owner contexts 收到相同 Idempotency-Key
- **THEN** 冪等判定 SHALL 包含 owner context
- **AND** SHALL NOT 將一個 owner 的 movement 誤認為另一個

### Requirement: 狀態分離

系統 SHALL 將 contract lifecycle、movement workflow、accounting payload、Excess decision、FX command result 與 audit history 維持為不同概念；本期 MUST NOT 增加 `FX_RATE_PENDING` workflow state。

#### Scenario: ACTIVE 合約上的 pending movement

- **WHEN** Maker 對 ACTIVE 合約送出不含 Excess 或已通過 Excess gate 的 movement
- **THEN** movement MAY 為 PENDING，而合約仍維持 ACTIVE

#### Scenario: ACTIVE Contract 上的 Pending Excess Movement

- **WHEN** Maker 對 ACTIVE contract 成功送出 allowance 內 Excess movement
- **THEN** movement MAY 為 PENDING，Excess Reservation SHALL 為 pending，而 contract SHALL 維持 ACTIVE

#### Scenario: Maker FX Gate 失敗

- **WHEN** Maker command 回傳 `FX_RATE_UNAVAILABLE` 或 `FX_RATE_STALE`
- **THEN** 該結果 SHALL NOT 被持久化成 movement workflow state
- **AND** SHALL NOT 建立 pending movement 或 reservation

#### Scenario: Workflow 完成不等於外部入帳完成

- **WHEN** movement workflow status 成為 APPROVED
- **THEN** accounting payload status、external posting evidence 與 Excess decision SHALL 依各自事實保存

## ADDED Requirements

### Requirement: Immutable Excess and FX Evidence

每個接受的A3／A3S／B3 Excess movement SHALL保存Legal Amount、Covered Amount、Excess Amount、workflow／Excess statuses、owner、policy version、Maker及所有適用Checker decision-point FX snapshots、decision inputs／outputs與attribution；A3S另 SHALL保存Base Parent Tight、Current SG Redemption Amount及Effective Presentation Capacity。後續rate、configuration、Formal Increase guidance或downstream lifecycle MUST NOT改寫歷史snapshot。

#### Scenario: Rate 後續變更

- **WHEN** provider 發布新 Booking Rate
- **THEN** 既有Maker及各Checker decision-point FX snapshots SHALL維持原歷史evidence

#### Scenario: Formal Increase Does Not Rewrite Excess

- **WHEN** 最新 Checker-released Approved Contractual Maximum 因既有 A2／B2 processing 增加
- **THEN** 系統 SHALL 保持原 Approved Excess event 與 utilization 不變
- **AND** SHALL NOT 建立 `FORMAL_INCREASE_REGULARIZATION`、allocation 或 cure event

### Requirement: Immutable Authorization Evidence and Legacy Waiver Compatibility

新A4／A6 Release SHALL以共同`ABSENT + Checker Approve`操作處理，且 SHALL NOT建立Applicant Waiver snapshot；既有waiver table／fields只供歷史資料讀取及API相容。每筆positive B3 Excess在B4 asset creation時 MUST保存authorization decision snapshot：`claimStatus`、validation result、Checker、timestamp及resolved debtor為必填；reference／amount／currency在`ABSENT`時為null，在`SUBMITTED`時保存實際submitted values（包括partial／invalid claim）。B3不得預先保存debtor decision。任何Fix／Resubmit不得覆寫已成功B4 snapshot。

#### Scenario: Legacy Waiver Evidence Changes After Release

- **WHEN** 歷史Applicant文件或外部reference在既有A4／A6 Release後改變
- **THEN** 原Release snapshot SHALL保持不可變
- **AND** inquiry SHALL顯示decision-time evidence而非重新查詢外部狀態

#### Scenario: Authorization Has No External Provider State

- **WHEN** Checker確認Export authorization
- **THEN** authoritative fact SHALL是本地snapshot與Checker assertion
- **AND** data model SHALL不包含外部authorization service request／response或pending lookup state

### Requirement: Export Asset Attribution Is Separate From Balance Type

Export asset movement SHALL分別保存`legalAmountOwner`、`coveredAssetAmountOwner`、`excessAssetAmountOwner`、`balanceType`、`debtor`及source Excess attribution。`debtor`不得改變`EXPORT_EXCESS_ASSET` balance type；三個amount MUST以exact decimal滿足Legal = Covered + Excess。

#### Scenario: Issuing Bank Is Excess Debtor

- **WHEN**完整authorization有效且Checker confirmed
- **THEN**Excess Asset debtor SHALL為`ISSUING_BANK`
- **AND**balanceType SHALL仍為`EXPORT_EXCESS_ASSET`，不得變成`Due from Issuing Bank`或`Reimbursement Receivable`
