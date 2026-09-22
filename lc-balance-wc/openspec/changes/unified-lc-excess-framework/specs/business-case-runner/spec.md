## ADDED Requirements

### Requirement: Zero Allowance Legacy Regression

Runner SHALL 對 A8、A3、A3S、B3 分別覆蓋 `configuredMaximumUsd = 0`、`allowancePercentage = 0` 與任一為零的組合，並證明 within-capacity 維持原成功行為、over-capacity 維持原 `INSUFFICIENT_AVAILABLE_BALANCE` hard-reject，且 Currency Exchange／Excess persistence 均為 zero interaction／zero write。

#### Scenario: Four-function Legacy Matrix

- **WHEN** Runner 執行 A8／A3／A3S／B3 的 zero-cap 與 zero-percentage cases
- **THEN** 每一功能 SHALL 驗證原 success／reject boundary、既有 error code／message 與 Maker／Checker lifecycle
- **AND** SHALL 驗證沒有 FX lookup、reservation、Approved Excess 或 ledger event

### Requirement: v11.15 Excess Regression Suite

Business Case Runner SHALL 對 A8、A3、A3S、B3 執行 Covered-only、partial Excess、full Excess、exact-limit、over-limit、Maker／Checker FX failure、revaluation、concurrency、Fix、Formal Increase、Return／Cancellation 與 downstream lifecycle cases。

#### Scenario: Run All Excess Cases

- **WHEN** dependencies 與 deterministic Currency Exchange stub 已就緒且選擇 Run All
- **THEN** 每個 v11.15 case SHALL 按隔離的 owner data 執行
- **AND** 每一步 SHALL 驗證 movement、reservation、approved utilization、FX snapshot 與 error code

#### Scenario: Expected FX Failure

- **WHEN** case 配置 unavailable 或 stale Booking Rate
- **THEN** Runner SHALL 驗證精確 error type 與 zero-write／retain-pending semantics
- **AND** 收到非預期 success SHALL 記為失敗

### Requirement: A8 to A3S Anti-double-counting Regression

Runner SHALL 驗證 A8 Approved Excess attribution 經 A3S capacity transfer 後不會再次消耗 parent allowance，並 SHALL 分別驗證 partial、full、over-capacity 與 reversal。

#### Scenario: Partial Capacity Transfer

- **WHEN** A3S 使用 A8 Eligible SG Capacity 的一部分
- **THEN** Approved Excess aggregate SHALL 不增加相同 attributable amount
- **AND** SG legal balance SHALL 不因 capacity transfer 自動減少

#### Scenario: A3S Amount Exceeds SG Capacity

- **WHEN** A3S amount 大於 SG Eligible Capacity Outstanding
- **THEN** Runner SHALL 驗證只有差額建立新的 Covered／Excess decision
- **AND** SHALL 驗證無 double count

### Requirement: Existing Lifecycle Regression

引入 Excess framework 後，A1–A11、B1–B7 既有非 Excess lifecycle、Maker／Checker、accounting、cleanup 與 inquiry suites SHALL 維持通過，只有本 Change 明確修改的 hard-reject expectations MAY 更新。

#### Scenario: Existing Non-excess Cases

- **WHEN** 完整 regression suite 使用不產生 Excess 的資料執行
- **THEN** API、balance、voucher 與 UI outcomes SHALL 與核准 baseline 一致

#### Scenario: Old Hard-reject Assertions

- **WHEN** 舊 case 期待 A8／A3／A3S／B3 只因超過 Tight Available 被拒絕
- **THEN** case SHALL 改為依 allowance 與 FX 結果判定
- **AND** 其他 domain rejection SHALL 不被放寬

### Requirement: Virtual Booking Rate Regression

Runner SHALL 使用虛擬 Currency Exchange 驗證 explicit Booking Rate、由 Buy／Sell midpoint 衍生的 Booking Rate、missing side、stale、not Approved、not Effective 與 timeout cases。

#### Scenario: Derived Midpoint

- **WHEN** fixture 只有 exact-decimal Buy Rate 與 Sell Rate
- **THEN** Runner SHALL 驗證回傳 Booking Rate 精確等於兩者平均
- **AND** Maker 與 Checker USD equivalent SHALL 使用該 Booking Rate

#### Scenario: Incomplete Quote

- **WHEN** fixture 缺少必要 Buy 或 Sell 且沒有 explicit Booking Rate
- **THEN** Runner SHALL 驗證 `FX_RATE_UNAVAILABLE`
- **AND** SHALL 驗證 Maker zero-write 與 Checker retain-pending 的不同結果

#### Scenario: Production Must Not Derive Midpoint

- **WHEN** production-mode adapter fixture 只提供 Approved／Effective／fresh Buy Rate 與 Sell Rate，但沒有 provider Booking Rate
- **THEN** Runner SHALL 驗證系統未計算 `(BUY_RATE + SELL_RATE) / 2`
- **AND** Maker SHALL 回傳 `FX_RATE_UNAVAILABLE` 且不建立 transaction／reservation
- **AND** Checker SHALL 回傳 `FX_RATE_UNAVAILABLE` 且保留原 pending transaction／reservation
