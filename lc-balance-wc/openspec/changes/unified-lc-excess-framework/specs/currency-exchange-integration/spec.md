## ADDED Requirements

### Requirement: Zero Allowance Skips Currency Exchange

當BD-03 legacy route生效時，A3／A3S／B3 SHALL NOT呼叫production或virtual Currency Exchange，亦 SHALL NOT建立`USD_PAR`或其他FX snapshot；FX availability／freshness不得影響該legacy command。

#### Scenario: Non-USD Legacy Route Has No Booking Lookup

- **GIVEN** allowance owner currency 非 USD
- **AND** `configuredMaximumUsd = 0` 或 `allowancePercentage = 0`
- **WHEN** Maker Submit 或 Checker action 執行
- **THEN** Currency Exchange request count SHALL 為零
- **AND** 結果 SHALL 僅由既有 sufficiency 與 Maker／Checker 規則決定

### Requirement: Authoritative Booking Rate Contract

非 USD allowance owner 的 Configured Maximum USD cap SHALL 透過 Currency Exchange request `fromCurrency=USD`、`toCurrency=ownerCurrency`、`amount=configuredMaximumUsd`、`purpose=BOOKING` 轉換。Allowance decision MUST 使用 provider 回傳的 owner-currency `convertedAmount`；response MUST 包含 currency pair／direction、requested amount、exact decimal rate、converted amount、rate ID／version、source、rate timestamp、Approved status、Effective interval、correlation ID 與 policy version。Balance SHALL NOT 以反向 rate 自行倒算。

#### Scenario: Approved Effective Fresh Rate

- **WHEN** response 與 request pair／purpose／correlation 相符，status 為 Approved、decision time 位於 Effective interval 且 age 未超過 Max Staleness
- **THEN** 系統 SHALL 使用 provider `convertedAmount` 作為 Configured Maximum 的 owner-currency cap
- **AND** SHALL snapshot 完整 rate evidence

#### Scenario: Rate 未 Approved 或未 Effective

- **WHEN** provider response 存在但未 Approved 或 decision time 不在 Effective interval
- **THEN** 系統 SHALL 視為 `FX_RATE_UNAVAILABLE`
- **AND** SHALL NOT 使用該 rate 驗證 allowance

### Requirement: Maker Submit FX Fail-Closed

僅當 resolved policy 的 `configuredMaximumUsd > 0` 且 `allowancePercentage > 0` 時，Maker Submit MUST 在建立任何 pending facts 前取得 Approved、Effective 且 fresh 的 Booking Rate。Rate missing、provider timeout／failure、pair 不符或未 Approved／Effective SHALL 回傳 `FX_RATE_UNAVAILABLE`；age 超過 Max Staleness SHALL 回傳 `FX_RATE_STALE`。任一配置值為零時 SHALL 改用 `Zero Allowance Skips Currency Exchange`。

#### Scenario: Maker Rate Unavailable

- **GIVEN** `configuredMaximumUsd > 0` 且 `allowancePercentage > 0`
- **WHEN** 非 USD Maker Submit 無法取得合格 Booking Rate
- **THEN** Maker Submit SHALL NOT 被允許，Excess Limit Validation SHALL NOT 完成
- **AND** Pending Transaction 與 Pending Excess Reservation SHALL NOT 建立

#### Scenario: Maker Rate Stale

- **GIVEN** `configuredMaximumUsd > 0` 且 `allowancePercentage > 0`
- **WHEN** 非 USD Maker Submit 取得的 Booking Rate 超過 Max Staleness
- **THEN** API SHALL 回傳 `FX_RATE_STALE`
- **AND** SHALL NOT 建立 transaction、reservation 或 FX pending state

### Requirement: Checker Release Revaluation

僅當resolved policy的`configuredMaximumUsd > 0`且`allowancePercentage > 0`時，B3及A3／A3S適用Checker decision point SHALL以當時最新合格USD→owner Booking quote重新取得configured cap的provider `convertedAmount`並重算owner-currency allowance，且 SHALL NOT只重用Maker quote。B3使用自身Checker Release；A3／A3S在Checker Acknowledge重估並鎖定Legal／Covered／Excess但保持reservation Pending；Sight A4或Usance A6 final Checker Release再重驗FX、allowance、waiver及eligibility後才可轉Approved，且不得依later parent capacity重新拆分locked amounts。任一配置值為零時 SHALL依BD-03使用既有Checker sufficiency flow。

#### Scenario: Release Rate 可用且仍在 Allowance 內

- **GIVEN** `configuredMaximumUsd > 0` 且 `allowancePercentage > 0`
- **WHEN** Checker 取得最新 Approved／Effective／fresh USD→owner provider `convertedAmount` 且 owner-currency Excess 未超限
- **THEN** B3 Release SHALL原子核准movement並轉換pending reservation；A3／A3S Acknowledge SHALL保持Pending並鎖定split，A4／A6 final Release SHALL再次重驗後按locked split轉換
- **AND** Checker FX snapshot SHALL 與 Maker snapshot 分別保存

#### Scenario: Release Rate Unavailable 或 Stale

- **GIVEN** `configuredMaximumUsd > 0` 且 `allowancePercentage > 0`
- **WHEN** Checker Acknowledge或final Release無法取得合格rate或rate已stale
- **THEN** 適用的Acknowledge或Release SHALL NOT被允許並回傳對應`FX_RATE_UNAVAILABLE`或`FX_RATE_STALE`
- **AND** Pending Transaction 與 Pending Excess Reservation SHALL 保留不變

### Requirement: FX Retry and Out-of-order Safety

FX lookup retry SHALL 使用相同 command correlation／idempotency identity。每一次實際 provider lookup SHALL 產生不同且不可為空的 `requestAttemptId`；provider MUST 原值回傳該 ID，Balance MUST 僅接受與目前 active attempt 完全相符的 response。不符合 active `requestAttemptId`、correlation、pair 或 purpose 的 late／out-of-order response MUST 被忽略。`providerRateVersion` 是 opaque audit evidence，MUST 保存且不可為空，但不得假設其可按數字或字串排序，也不得用它取代 active-attempt matching。本期 MUST NOT 建立 `FX_RATE_PENDING` state。

#### Scenario: Timeout 後 late response

- **WHEN** Maker command 已以 `FX_RATE_UNAVAILABLE` 結束後才收到 provider response
- **THEN** late response SHALL NOT 建立或修改 movement、reservation 或 allowance

#### Scenario: Provider Echoes a Non-active Attempt ID

- **WHEN** provider response 的 `requestAttemptId` 不等於目前 active lookup 的 ID，即使 correlation、pair、purpose 與 rate evidence 其他欄位皆有效
- **THEN** response SHALL 被忽略並以 `FX_RATE_UNAVAILABLE` 結束該 attempt
- **AND** `providerRateVersion` 的值或表面排序 SHALL NOT 使該 response 被接受

#### Scenario: Checker retry 成功

- **WHEN** pending movement 的後續 Checker retry 取得合格 rate
- **THEN** 系統 SHALL 重新讀取 current facts 並重新完成全套 release validation
- **AND** SHALL NOT 把先前失敗 attempt 視為已保留的 FX approval

### Requirement: Virtual Booking Rate Derivation

僅限 non-production virtual Currency Exchange／regression fixture SHALL 為每個 direct USD→owner quote 提供 exact-decimal `BUY_RATE` 與 `SELL_RATE`，並 MAY 在 fixture 未提供獨立 `BOOKING_RATE` 時，以 exact decimal 計算 `BOOKING_RATE = (BUY_RATE + SELL_RATE) / 2`，套用配置的 rate scale 與 rounding。Virtual provider SHALL 接收 `amount=configuredMaximumUsd`，直接回傳依 target owner currency minor-unit precision rounded once 的 `convertedAmount`；Balance MUST NOT 對 legacy owner→USD fixture 取倒數。此 midpoint 規則 MUST NOT 用於 production adapter。

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

Production Currency Exchange MUST 回傳 provider-supplied `BOOKING` rate 及其 Approved、Effective、Freshness evidence。Production Balance integration MUST NOT 從 Buy、Sell、mid-market、cached alternate-purpose 或其他 rate 推導、倒算或替代 Booking Rate。只有 FX Policy 明確授權時，MAY 使用 provider-supplied Previous Business Day `BOOKING` rate；該 rate 仍須 Approved／Effective 且通過 Freshness／Max Staleness，並保存 `fallbackPolicyId`、`fallbackPolicyVersion`、fallback reason、rate date 與 rate source。缺少任一必要 evidence MUST 依 BD-01 fail closed。

#### Scenario: Production Maker Has No Provider Booking Rate

- **GIVEN** `configuredMaximumUsd > 0` 且 `allowancePercentage > 0`
- **WHEN** 非 USD Maker Submit 的 production provider 未提供合格 Booking Rate，即使 Buy／Sell rates 可用
- **THEN** API SHALL 回傳 `FX_RATE_UNAVAILABLE`
- **AND** Excess Limit Validation SHALL NOT 完成
- **AND** Pending Transaction 與 Pending Excess Reservation SHALL NOT 建立

#### Scenario: Production Checker Has No Provider Booking Rate

- **GIVEN** `configuredMaximumUsd > 0` 且 `allowancePercentage > 0`
- **WHEN** 任一適用Checker decision point的production provider未提供合格Booking Rate，即使Buy／Sell rates可用
- **THEN** 適用的Acknowledge或Release SHALL NOT被允許並 SHALL回傳`FX_RATE_UNAVAILABLE`
- **AND** Pending Transaction 與 Pending Excess Reservation SHALL 保留不變

#### Scenario: Policy-authorized Previous Business Day Booking Rate

- **GIVEN** FX Policy 明確授權 PBD fallback
- **WHEN** provider 回傳 PBD `BOOKING` rate，且 rate 為 Approved／Effective 並通過 Max Staleness
- **THEN** Maker Submit、B3 Release、A3／A3S Acknowledge及A4／A6 final Release MAY各自在其decision point使用該provider rate完成revaluation
- **AND** snapshot SHALL 保存 `fallbackPolicyId`、`fallbackPolicyVersion`、fallback reason、rate date 與 rate source

#### Scenario: Unauthorized or Stale Previous Business Day Rate

- **WHEN** PBD `BOOKING` rate 未受 FX Policy 授權、非 provider-supplied、未 Approved／Effective 或超過 Max Staleness
- **THEN** Balance SHALL NOT 使用、推導或替代該 rate
- **AND** Maker SHALL依BD-01 zero-write；適用Checker Acknowledge或Release SHALL被拒絕並保留pending facts

### Requirement: USD Par and Non-production Stub Boundary

USD allowance owner SHALL 對 Configured Maximum 使用 exact identity conversion rate 1 與 internal `USD_PAR` evidence，不呼叫外部 provider。擴充後的 `lc-payment-wc` virtual Currency Exchange MAY 只透過明確標示的 test adapter 使用，且 MUST NOT 作為 production Approved／Effective／fresh evidence。

#### Scenario: USD Owner Cap

- **GIVEN** `configuredMaximumUsd > 0` 且 `allowancePercentage > 0`
- **WHEN** Import LC／Export Confirmation owner currency 為 USD
- **THEN** `configuredMaximumOwner` SHALL 等於 `configuredMaximumUsd` 並 snapshot `USD_PAR`

#### Scenario: Production 指向 demo endpoint

- **WHEN** production configuration 選擇 `lc-payment-wc` demo FX adapter
- **THEN** startup validation SHALL fail closed
- **AND** transaction endpoints SHALL NOT 提供部分可用服務
