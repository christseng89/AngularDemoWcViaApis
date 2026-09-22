## MODIFIED Requirements

### Requirement: Shipping Guarantee Capacity

未結清 Shipping Guarantee SHALL 減少 parent LC Tight Available；A8 approval SHALL 另行初始化 `Eligible SG Capacity Outstanding`。A3S capacity redemption、standalone A9 legal redemption 與 SG contingent-liability release MUST 是獨立 lifecycle facts。

#### Scenario: A3S 部分使用 Eligible SG Capacity

- **WHEN** A3S 使用所選 SG 的部分 Eligible Capacity
- **THEN** Eligible SG Capacity Outstanding SHALL 減少相同 amount
- **AND** SHGT legal balance 與 contingent liability SHALL NOT 因此自動減少

#### Scenario: Pending A9 Redemption

- **WHEN** A9 Redemption 已 Submit 但尚未 Release
- **THEN** parent off-balance exposure SHALL 保持保留
- **AND** A3S capacity facts SHALL 不被推定為 legal redemption

#### Scenario: A9 Redemption 已 Release

- **WHEN** 不同 Checker Release 合資格的 standalone A9
- **THEN** 對應 SG legal exposure SHALL 依既有 lifecycle 釋放
- **AND** Approved Excess SHALL NOT 因 A9 自動釋放

### Requirement: 避免重複計算

A3S 與 B4 provisional consumption 在檢查新 reducing movement 時 SHALL 淨除被引用的 operational earmark。A3S MUST 同時轉移所選 A8 SG capacity 的 Covered／Excess attribution，使同一 exposure 不得再次扣減 parent capacity 或 owner allowance。

#### Scenario: SG 覆蓋 A3S Bill

- **WHEN** Arrival Amount 已由所選 SG Eligible Capacity 覆蓋
- **THEN** 該 allocation SHALL 從 SG capacity 轉移至 A3S
- **AND** parent capacity 與 Approved Excess SHALL NOT 對同一 amount 再扣減

#### Scenario: A3S 超過 SG Capacity

- **WHEN** Arrival Amount 大於所選 SG Eligible Capacity Outstanding
- **THEN** 只有差額 SHALL 接受新的 parent Covered／Excess split
- **AND** SG allocation 與差額 SHALL 可分別追蹤

#### Scenario: B4 消耗 Presentation

- **WHEN** B4 以已 Release B3 作為 provisional consumption 來源
- **THEN** sufficiency 檢查 SHALL 先淨除該 B3 operational earmark
- **AND** SHALL NOT 釋放或重建 B3 Approved Excess

