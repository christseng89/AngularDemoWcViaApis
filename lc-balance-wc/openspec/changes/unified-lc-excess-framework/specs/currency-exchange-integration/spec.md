## ADDED Requirements

### Requirement: Authoritative Booking Rate Contract

非 USD A8、A3、A3S、B3 的 Excess USD Equivalent SHALL 使用 Currency Exchange 回傳的 `BOOKING` rate；response MUST 包含 currency pair、exact decimal rate、converted amount、rate ID／version、source、rate timestamp、Approved status、Effective interval、correlation ID 與 policy version。

#### Scenario: Approved Effective Fresh Rate

- **WHEN** response 與 request pair／purpose／correlation 相符，status 為 Approved、decision time 位於 Effective interval 且 age 未超過 Max Staleness
- **THEN** 系統 SHALL 使用該 rate 計算 USD Equivalent
- **AND** SHALL snapshot 完整 rate evidence

#### Scenario: Rate 未 Approved 或未 Effective

- **WHEN** provider response 存在但未 Approved 或 decision time 不在 Effective interval
- **THEN** 系統 SHALL 視為 `FX_RATE_UNAVAILABLE`
- **AND** SHALL NOT 使用該 rate 驗證 allowance

### Requirement: Maker Submit FX Fail-Closed

Maker Submit MUST 在建立任何 pending facts 前取得 Approved、Effective 且 fresh 的 Booking Rate。Rate missing、provider timeout／failure、pair 不符或未 Approved／Effective SHALL 回傳 `FX_RATE_UNAVAILABLE`；age 超過 Max Staleness SHALL 回傳 `FX_RATE_STALE`。

#### Scenario: Maker Rate Unavailable

- **WHEN** 非 USD Maker Submit 無法取得合格 Booking Rate
- **THEN** Maker Submit SHALL NOT 被允許，Excess Limit Validation SHALL NOT 完成
- **AND** Pending Transaction 與 Pending Excess Reservation SHALL NOT 建立

#### Scenario: Maker Rate Stale

- **WHEN** 非 USD Maker Submit 取得的 Booking Rate 超過 Max Staleness
- **THEN** API SHALL 回傳 `FX_RATE_STALE`
- **AND** SHALL NOT 建立 transaction、reservation 或 FX pending state

### Requirement: Checker Release Revaluation

Checker Release SHALL 以 release decision time 的最新合格 Booking Rate 重新計算 Excess USD Equivalent 與 allowance，且 SHALL NOT 只重用 Maker rate。

#### Scenario: Release Rate 可用且仍在 Allowance 內

- **WHEN** Checker 取得最新 Approved／Effective／fresh rate 且 revalued excess 未超限
- **THEN** Release SHALL 原子核准 movement 並轉換 pending reservation
- **AND** Checker FX snapshot SHALL 與 Maker snapshot 分別保存

#### Scenario: Release Rate Unavailable 或 Stale

- **WHEN** Checker Release 無法取得合格 rate 或 rate 已 stale
- **THEN** Release SHALL NOT 被允許並回傳對應 `FX_RATE_UNAVAILABLE` 或 `FX_RATE_STALE`
- **AND** Pending Transaction 與 Pending Excess Reservation SHALL 保留不變

### Requirement: FX Retry and Out-of-order Safety

FX lookup retry SHALL 使用相同 command correlation／idempotency identity；不符合 active correlation、pair、purpose 或 provider version 的 late／out-of-order response MUST 被忽略，且本期 MUST NOT 建立 `FX_RATE_PENDING` state。

#### Scenario: Timeout 後 late response

- **WHEN** Maker command 已以 `FX_RATE_UNAVAILABLE` 結束後才收到 provider response
- **THEN** late response SHALL NOT 建立或修改 movement、reservation 或 allowance

#### Scenario: Checker retry 成功

- **WHEN** pending movement 的後續 Checker retry 取得合格 rate
- **THEN** 系統 SHALL 重新讀取 current facts 並重新完成全套 release validation
- **AND** SHALL NOT 把先前失敗 attempt 視為已保留的 FX approval

### Requirement: Virtual Booking Rate Derivation

僅限 non-production virtual Currency Exchange／regression fixture SHALL 為每個 quote 提供 exact-decimal `BUY_RATE` 與 `SELL_RATE`，並 MAY 在 fixture 未提供獨立 `BOOKING_RATE` 時，以 exact decimal 計算 `BOOKING_RATE = (BUY_RATE + SELL_RATE) / 2`，套用配置的 rate scale 與 rounding。此 midpoint 規則 MUST NOT 用於 production adapter。

#### Scenario: Booking Rate Missing from Fixture

- **WHEN** virtual quote 的 Buy Rate 為 31.20、Sell Rate 為 31.40 且沒有 Booking Rate
- **THEN** service SHALL 回傳 Booking Rate 31.30
- **AND** response SHALL 標示 rate 為 `DERIVED_MID`

#### Scenario: Buy or Sell Rate Missing

- **WHEN** virtual quote 未提供 Buy Rate 或 Sell Rate，且也沒有有效 Booking Rate
- **THEN** service SHALL 回傳 unavailable result
- **AND** Balance command SHALL 依 decision point 套用 `FX_RATE_UNAVAILABLE` zero-write 或 retain-pending semantics

#### Scenario: Explicit Booking Rate Exists

- **WHEN** fixture 明確提供 Booking Rate
- **THEN** virtual service SHALL 回傳該 exact value
- **AND** SHALL NOT 以 derived midpoint 覆寫它

#### Scenario: Production Booking Rate Missing but Buy and Sell Exist

- **WHEN** production provider response 含 Buy Rate 與 Sell Rate，但缺少 provider-supplied Booking Rate
- **THEN** production adapter MUST NOT 計算 midpoint、fallback 或合成 Booking Rate
- **AND** response SHALL 被視為 `FX_RATE_UNAVAILABLE`

### Requirement: Production Provider-supplied Booking Rate Only

Production Currency Exchange MUST 回傳 provider-supplied `BOOKING` rate 及其 Approved、Effective、Freshness evidence。Production Balance integration MUST NOT 從 Buy、Sell、mid-market、cached alternate-purpose 或其他 rate 推導或 fallback Booking Rate；缺少任一必要 Booking evidence MUST 依 BD-01 fail closed。

#### Scenario: Production Maker Has No Provider Booking Rate

- **WHEN** 非 USD Maker Submit 的 production provider 未提供合格 Booking Rate，即使 Buy／Sell rates 可用
- **THEN** API SHALL 回傳 `FX_RATE_UNAVAILABLE`
- **AND** Excess Limit Validation SHALL NOT 完成
- **AND** Pending Transaction 與 Pending Excess Reservation SHALL NOT 建立

#### Scenario: Production Checker Has No Provider Booking Rate

- **WHEN** Checker Release 的 production provider 未提供合格 Booking Rate，即使 Buy／Sell rates 可用
- **THEN** Release SHALL NOT 被允許並 SHALL 回傳 `FX_RATE_UNAVAILABLE`
- **AND** Pending Transaction 與 Pending Excess Reservation SHALL 保留不變

### Requirement: USD Par and Non-production Stub Boundary

USD transaction SHALL 使用 exact rate 1 與 internal `USD_PAR` evidence，不呼叫外部 provider。擴充後的 `lc-payment-wc` virtual Currency Exchange MAY 只透過明確標示的 test adapter 使用，且 MUST NOT 作為 production Approved／Effective／fresh evidence。

#### Scenario: USD Excess

- **WHEN** A8／A3／A3S／B3 transaction currency 為 USD
- **THEN** USD Equivalent SHALL 等於 Excess Amount 並 snapshot `USD_PAR`

#### Scenario: Production 指向 demo endpoint

- **WHEN** production configuration 選擇 `lc-payment-wc` demo FX adapter
- **THEN** startup validation SHALL fail closed
- **AND** transaction endpoints SHALL NOT 提供部分可用服務
