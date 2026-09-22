## ADDED Requirements

### Requirement: Excess Preview and Decision Evidence

當 resolved policy 的 `configuredMaximumUsd > 0` 且 `allowancePercentage > 0` 時，Transaction Builder SHALL 對 A8、A3、A3S、B3 顯示非權威 Covered／Excess preview、transaction currency 與 USD equivalent、policy version、FX timestamp／source、freshness 與 allowance result；服務端 response MUST 取代 preview 成為權威結果。任一配置值為零時，UI SHALL 顯示不允許超押並使用既有 capacity／sufficiency presentation，不得要求或顯示 FX／allowance／Excess decision evidence。

#### Scenario: Fresh Rate Preview

- **GIVEN** `configuredMaximumUsd > 0` 且 `allowancePercentage > 0`
- **WHEN** 使用者輸入非 USD amount 且取得 fresh preview
- **THEN** UI SHALL 顯示 rate timestamp、source、Covered／Excess 與 estimated remaining allowance
- **AND** SHALL 標示 submit 時服務端將重新驗證

#### Scenario: Maker FX Unavailable or Stale

- **GIVEN** `configuredMaximumUsd > 0` 且 `allowancePercentage > 0`
- **WHEN** Submit 回傳 `FX_RATE_UNAVAILABLE` 或 `FX_RATE_STALE`
- **THEN** UI SHALL 顯示明確 reason 與未建立 pending transaction 的結果
- **AND** SHALL NOT 顯示成功或 `FX_RATE_PENDING`

#### Scenario: Zero Allowance Legacy Presentation

- **GIVEN** `configuredMaximumUsd = 0` 或 `allowancePercentage = 0`
- **WHEN** 使用者建立 A8／A3／A3S／B3
- **THEN** UI SHALL 顯示該 owner 不允許超押及既有 available capacity
- **AND** SHALL NOT 顯示 Covered／Excess、FX、USD_PAR 或 allowance decision preview

### Requirement: Checker Excess Review

對 Excess-enabled movement，Checker review SHALL 並列 Maker snapshot 與 Checker revaluation，包括 rate、timestamp、USD equivalent、allowance effect 與差異；Release control MUST 在 FX／allowance gate 失敗時停用或顯示權威拒絕。對 BD-03 legacy route，Checker UI SHALL 使用既有 review presentation，不得要求 FX／allowance evidence。

#### Scenario: Release Revaluation Differs

- **GIVEN** `configuredMaximumUsd > 0` 且 `allowancePercentage > 0`
- **WHEN** Checker rate 與 Maker rate 不同但仍在 allowance 內
- **THEN** UI SHALL 顯示兩份 snapshots 與差異
- **AND** 成功 Release SHALL 顯示 Checker authoritative result

#### Scenario: Release Rate Failure

- **GIVEN** `configuredMaximumUsd > 0` 且 `allowancePercentage > 0`
- **WHEN** Release 回傳 FX unavailable／stale
- **THEN** UI SHALL 顯示 pending movement 與 reservation 仍保留
- **AND** SHALL 提供安全 retry 而不建立重複 movement

### Requirement: Excess-specific Fix Pending

只有 A8、A3、A3S、B3 pending forms SHALL 允許修改 Amount。對 Excess-enabled owner，UI MUST 顯示修改將重新執行 FX 與 allowance validation；對 BD-03 legacy route，UI SHALL 顯示將重新執行既有 sufficiency validation，且不得宣稱或觸發 FX／allowance validation。其他 functions 的 monetary field SHALL 保持 protected。

#### Scenario: Amount Fix Rejected by FX Gate

- **GIVEN** `configuredMaximumUsd > 0` 且 `allowancePercentage > 0`
- **WHEN** Fix Submit 回傳 FX unavailable／stale
- **THEN** UI SHALL 保留並重新載入原 pending movement 與 reservation
- **AND** SHALL NOT 顯示未保存 amount 為權威資料

#### Scenario: Zero Allowance Amount Fix Presentation

- **GIVEN** `configuredMaximumUsd = 0` 或 `allowancePercentage = 0`
- **WHEN** Maker 修改 pending A8／A3／A3S／B3 Amount
- **THEN** UI SHALL 顯示將套用既有 sufficiency validation
- **AND** SHALL NOT 顯示 FX／allowance revalidation 或 Excess reservation replacement

#### Scenario: Non-excess Function

- **WHEN** 使用者開啟非 A8／A3／A3S／B3 pending movement
- **THEN** Amount SHALL 維持 protected
