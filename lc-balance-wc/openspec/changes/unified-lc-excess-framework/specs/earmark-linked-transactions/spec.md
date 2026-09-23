## MODIFIED Requirements

### Requirement: 避免重複計算

A3S與B4 provisional consumption在檢查新reducing movement時 SHALL淨除被引用的operational earmark。A3S MUST由parent Tight snapshot淨除本筆自身SG redemption leg及LC UTILIZE earmark／movement effect，再加回main實際產生的Current SG Redemption Amount，以避免同一exposure重複影響parent capacity。本Change不修改SG Redemption、SG Available Balance或SG legal lifecycle。

#### Scenario: SG 覆蓋 A3S Bill

- **WHEN** Arrival Amount由normalized Base Parent Tight加Current SG Redemption Amount完全覆蓋
- **THEN** Effective Presentation Capacity SHALL只包含每個self-leg一次
- **AND** parent capacity與owner allowance SHALL NOT對同一amount再次扣減

#### Scenario: A3S Exceeds Existing SG Capacity

- **WHEN** Arrival Amount大於normalized Effective Presentation Capacity
- **THEN** Covered SHALL為Effective Presentation Capacity，只有剩餘差額 SHALL為Excess
- **AND** Base Parent Tight、Current SG Redemption Amount與Effective Presentation Capacity SHALL可分別追蹤

#### Scenario: A3S Pending Self-leg Does Not Inflate Excess

- **GIVEN** Base Parent Tight為`4,000`、Current SG Redemption Amount為`6,000`且Arrival為`10,200`
- **WHEN** SG redemption及LC UTILIZE self-legs仍為pending
- **THEN** Effective Presentation Capacity SHALL為`10,000`且Excess SHALL為`200`
- **AND** implementation SHALL NOT以含self-leg影響的raw Tight計算出`6,200` Excess

#### Scenario: B4 消耗 Presentation

- **WHEN** B4以已Release B3作為provisional consumption來源
- **THEN** sufficiency檢查 SHALL先淨除該B3 operational earmark
- **AND** SHALL NOT釋放或重建B3 Approved Excess
