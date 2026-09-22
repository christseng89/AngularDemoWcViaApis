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

- **WHEN** 使用相同 scope、key 與 canonical payload 再次送出 Maker／compound／Fix／regularization／return command
- **THEN** 系統 SHALL 回傳既有 status 與 response body
- **AND** SHALL NOT 重複 movement、reservation、adjustment 或 balance effect

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

每個接受的 Excess movement SHALL 保存 Covered／Excess、owner、policy version、Maker／Checker FX snapshots、decision inputs／outputs 與 attribution；後續 rate、configuration、regularization 或 downstream lifecycle MUST NOT 改寫歷史 snapshot。

#### Scenario: Rate 後續變更

- **WHEN** provider 發布新 Booking Rate
- **THEN** 既有 Maker／Checker FX snapshots SHALL 維持原歷史 evidence

#### Scenario: Formal Increase Regularizes Excess

- **WHEN** Formal Increase 調整既有 Approved Excess
- **THEN** 系統 SHALL 追加 adjustment 與 allocation events
- **AND** 原 Approved Excess event SHALL 保持不可變
