## ADDED Requirements

### Requirement: Excess Preview and Decision Evidence

Transaction Builder SHALL 對 A8、A3、A3S、B3 顯示非權威 Covered／Excess preview、transaction currency 與 USD equivalent、policy version、FX timestamp／source、freshness 與 allowance result；服務端 response MUST 取代 preview 成為權威結果。

#### Scenario: Fresh Rate Preview

- **WHEN** 使用者輸入非 USD amount 且取得 fresh preview
- **THEN** UI SHALL 顯示 rate timestamp、source、Covered／Excess 與 estimated remaining allowance
- **AND** SHALL 標示 submit 時服務端將重新驗證

#### Scenario: Maker FX Unavailable or Stale

- **WHEN** Submit 回傳 `FX_RATE_UNAVAILABLE` 或 `FX_RATE_STALE`
- **THEN** UI SHALL 顯示明確 reason 與未建立 pending transaction 的結果
- **AND** SHALL NOT 顯示成功或 `FX_RATE_PENDING`

### Requirement: Checker Excess Review

Checker review SHALL 並列 Maker snapshot 與 Checker revaluation，包括 rate、timestamp、USD equivalent、allowance effect 與差異；Release control MUST 在 FX／allowance gate 失敗時停用或顯示權威拒絕。

#### Scenario: Release Revaluation Differs

- **WHEN** Checker rate 與 Maker rate 不同但仍在 allowance 內
- **THEN** UI SHALL 顯示兩份 snapshots 與差異
- **AND** 成功 Release SHALL 顯示 Checker authoritative result

#### Scenario: Release Rate Failure

- **WHEN** Release 回傳 FX unavailable／stale
- **THEN** UI SHALL 顯示 pending movement 與 reservation 仍保留
- **AND** SHALL 提供安全 retry 而不建立重複 movement

### Requirement: Excess-specific Fix Pending

只有 A8、A3、A3S、B3 pending forms SHALL 允許修改 Amount，並 MUST 顯示修改將重新執行 FX 與 allowance validation；其他 functions 的 monetary field SHALL 保持 protected。

#### Scenario: Amount Fix Rejected by FX Gate

- **WHEN** Fix Submit 回傳 FX unavailable／stale
- **THEN** UI SHALL 保留並重新載入原 pending movement 與 reservation
- **AND** SHALL NOT 顯示未保存 amount 為權威資料

#### Scenario: Non-excess Function

- **WHEN** 使用者開啟非 A8／A3／A3S／B3 pending movement
- **THEN** Amount SHALL 維持 protected

