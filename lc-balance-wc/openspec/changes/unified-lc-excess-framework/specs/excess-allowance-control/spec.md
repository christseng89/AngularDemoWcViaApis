## ADDED Requirements

### Requirement: Unified Covered and Excess Split

系統 SHALL 對 A8、A3、A3S、B3 使用相同的精確十進位規則，把交易金額拆分為 `Covered Amount = min(Transaction Amount, non-negative authoritative covered capacity)` 與 `Excess Amount = Transaction Amount - Covered Amount`，且兩者總和 MUST 等於交易金額。

#### Scenario: 交易部分由 Capacity 覆蓋

- **WHEN** 交易金額為 120，authoritative covered capacity 為 100
- **THEN** Covered Amount SHALL 為 100，Excess Amount SHALL 為 20

#### Scenario: Capacity 為負數

- **WHEN** raw covered capacity 小於零
- **THEN** sufficiency calculation SHALL 以零作 Covered Amount 下限
- **AND** 全部交易金額 SHALL 成為 Excess Amount

### Requirement: Owner-level Excess Allowance

Import LC SHALL 作為其 A8、A3、A3S 的唯一 allowance owner；Export Confirmation SHALL 作為其 B3 的唯一 allowance owner。系統 MUST 以 Configured Maximum USD Equivalent、Approved Excess、其他 Pending Excess Reservations 與本次 Proposed Excess USD Equivalent 驗證可用 allowance。

#### Scenario: Proposed Excess 在 Allowance 內

- **WHEN** Proposed Excess 加上 Approved 與其他 Pending 使用量不超過有效 configured maximum
- **THEN** Excess decision SHALL 為 `WITHIN_ALLOWANCE`
- **AND** Maker Submit SHALL 原子建立 movement 與 Pending Excess Reservation

#### Scenario: Proposed Excess 超過 Allowance

- **WHEN** Proposed Excess 加上 Approved 與其他 Pending 使用量超過有效 configured maximum
- **THEN** API SHALL 回傳 `EXCESS_LIMIT_EXCEEDED`
- **AND** SHALL NOT 建立 movement 或 reservation

### Requirement: Pending and Approved Excess Lifecycle

Pending Excess Reservation SHALL 只在 Maker Submit 成功時建立，並 SHALL 在 Checker Release 成功時原子轉為 Approved Excess。Reject 或 Delete Pending MUST 釋放 reservation；downstream completion MUST NOT 釋放 Approved Excess。

#### Scenario: Checker Release 成功

- **WHEN** 不同 Checker 以最新 facts 重新驗證且交易仍在 allowance 內
- **THEN** Pending Excess Reservation SHALL 原子轉換為 Approved Excess
- **AND** 同一 Excess Amount SHALL NOT 同時存在於 pending 與 approved aggregate

#### Scenario: Pending Movement 被刪除

- **WHEN** 合資格 pending A8／A3／A3S／B3 被 Delete
- **THEN** 其 reservation SHALL 在同一 transaction 釋放
- **AND** audit history SHALL 保留原 reservation 與 deletion facts

### Requirement: Effective-dated Excess Policy

Allowance percentage、maximum USD amount、FX Max Staleness 與 fail-closed policy SHALL 由不可變、具版本且 effective-dated 的配置提供；每個 accepted movement MUST snapshot resolved policy version。

#### Scenario: 有效配置唯一

- **WHEN** decision time 只匹配一個完整 active policy version
- **THEN** 系統 SHALL 使用並 snapshot 該 version

#### Scenario: 配置缺失或重疊

- **WHEN** decision time 無有效 policy 或匹配多個互相重疊版本
- **THEN** 系統 SHALL fail closed
- **AND** SHALL NOT 建立 movement 或 reservation

### Requirement: Formal Increase Regularization

Formal Increase SHALL 以明確的 Approved Excess event references 與 allocation amounts 建立不可變 `FORMAL_INCREASE_REGULARIZATION` adjustment，並 SHALL NOT 推測 FIFO、LIFO 或 pro-rata order，也不得回寫原 decision snapshot。

#### Scenario: Explicit allocations 完整有效

- **WHEN** allocation items 均指向同一 owner 的 outstanding Approved Excess 且金額未超過各 event 可調整額
- **THEN** regularization event 與 allocation rows SHALL 原子寫入
- **AND** owner Approved Excess outstanding SHALL 依 allocation 減少

#### Scenario: Allocation 超過原 Attribution

- **WHEN** 任一 allocation 超過被引用 event 的 outstanding attributable excess
- **THEN** 整個 Formal Increase regularization SHALL 被拒絕
- **AND** SHALL NOT 部分調整其他 events

### Requirement: Traceable Return and Cancellation Adjustments

A3、A3S、B3 Return Documents 與 A8 cancel／delete／non-issuance SHALL 只以明確原 movement reference 與 returned／cancelled amount 追加 reversal event，並 MUST 依原 Covered／Excess attribution 精確調整，不得直接改 aggregate。

#### Scenario: Partial Return Documents

- **WHEN** Checker 核准對原 Approved Excess movement 的 partial Return Documents
- **THEN** 系統 SHALL 只反轉該 returned amount 可歸屬的 Excess
- **AND** 原 movement 與 FX snapshots SHALL 保持不可變

#### Scenario: Return 超過可反轉 Amount

- **WHEN** requested return 超過原 movement 尚未反轉的 attributable amount
- **THEN** 系統 SHALL 拒絕 Return Documents
- **AND** owner aggregates SHALL 維持不變

