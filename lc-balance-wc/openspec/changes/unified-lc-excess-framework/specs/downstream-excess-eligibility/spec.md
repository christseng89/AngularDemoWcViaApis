## ADDED Requirements

### Requirement: Excess-aware Downstream Eligibility

Payment、Settlement、Honour、Acceptance 與 A3S redemption eligibility SHALL 讀取原 movement、Covered／Excess attribution、workflow 與 linked capacity facts；UI query 僅供提示，command time MUST 重新驗證。

#### Scenario: Approved Excess Movement

- **WHEN** downstream command 引用含 Approved Excess 的合資格 A3／A3S／B3
- **THEN** command MAY 依原業務 lifecycle 執行
- **AND** Approved Excess attribution SHALL 保持可追溯

#### Scenario: Pending 或被反轉來源

- **WHEN** downstream command 引用未核准、已 return／cancel 或 amount 不足的來源
- **THEN** 服務 SHALL 拒絕 command
- **AND** SHALL NOT 建立部分 downstream legs

### Requirement: Downstream Completion Does Not Release Approved Excess

Downstream Payment、Settlement、Honour、Acceptance 或 A3S capacity redemption MUST NOT 自動減少 owner Approved Excess utilization；只有 Formal Increase regularization 或可追溯 Return／Cancellation reversal SHALL 調整。

#### Scenario: B4 consumes B3

- **WHEN** B4 成功消耗含 Approved Excess 的 B3 presentation
- **THEN** B3 operational earmark MAY 完成
- **AND** owner Approved Excess SHALL 維持不變

#### Scenario: A4 or A6 completes Arrival

- **WHEN** A4 或 A6 完成含 Approved Excess 的 A3／A3S
- **THEN** LC utilization lifecycle SHALL 正常完成
- **AND** owner Approved Excess SHALL 維持不變

### Requirement: Return Documents Command Boundary

`RETURN_DOCUMENTS` SHALL 以 direction、owner ID、original approved movement ID 與 client event ID 形成 typed identity，遵守 Maker／Checker、audit、idempotency 與原子性；它 SHALL NOT 自行宣稱外部 accounting 已完成。

#### Scenario: Valid Return Documents

- **WHEN** 不同 Checker 核准一筆合資格且未重複的 Return Documents
- **THEN** operational return 與 attributable Excess reversal SHALL 原子完成
- **AND** external accounting status SHALL 依獨立 evidence 保持分離

#### Scenario: Duplicate Return Event

- **WHEN** 相同 natural identity 與 request hash 被重送
- **THEN** API SHALL replay 原結果而不重複 reversal
- **AND** 不同 payload SHALL 回傳 `IDEMPOTENCY_CONFLICT`

