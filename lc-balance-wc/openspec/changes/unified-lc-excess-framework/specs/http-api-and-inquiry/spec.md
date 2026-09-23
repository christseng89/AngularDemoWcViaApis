## MODIFIED Requirements

### Requirement: 符合 OAS 的 HTTP Contract

Balance Component HTTP API SHALL只提供OpenAPI記載的shapes並回傳穩定structured errors。A3／A3S／B3 calculable over-limit MUST回傳HTTP`409`／`EXCESS_LIMIT_EXCEEDED`。另 MUST記載FX、idempotency、waiver、authorization、configuration及concurrency errors。

#### Scenario: 無效 Request

- **WHEN** 呼叫端 Submit 不符合 schema 或 domain rule 的 movement payload
- **THEN** API SHALL 回傳已記載的 non-success status 與 structured error body
- **AND** SHALL NOT 洩漏 SQL、stack trace、provider credential 或內部 filesystem path

#### Scenario: 有效 Request

- **WHEN** 呼叫端 Submit 符合目前 OAS 與 domain rules 的 request
- **THEN** API SHALL 回傳已記載的 success status 與 response shape

#### Scenario: FX Rate Unavailable

- **GIVEN** `configuredMaximumUsd > 0` 且 `allowancePercentage > 0`
- **WHEN** non-USD allowance owner 的 Maker Submit 無法完成 FX gate
- **THEN** API SHALL 回傳已記載的 non-success status、`FX_RATE_UNAVAILABLE` 與可診斷 fields
- **AND** SHALL NOT 洩漏 provider credential、stack trace 或內部 path

#### Scenario: Transaction Currency Does Not Match Owner

- **WHEN** A3／A3S request currency 不等於 Import LC currency，或 B3 request currency 不等於 Confirmation currency
- **THEN** API SHALL 回傳 documented validation error before FX lookup
- **AND** SHALL 維持 zero-write，且不得接受 caller-supplied conversion

#### Scenario: Zero Allowance Over-capacity Request

- **GIVEN** `configuredMaximumUsd = 0` 或 `allowancePercentage = 0`
- **WHEN** A3／A3S／B3 request 超過既有 authoritative capacity
- **THEN** API SHALL 回傳既有 `409 INSUFFICIENT_AVAILABLE_BALANCE` code 與 message
- **AND** SHALL NOT 回傳 `FX_RATE_UNAVAILABLE`、`FX_RATE_STALE` 或 `EXCESS_LIMIT_EXCEEDED`
- **AND** SHALL 維持 zero-write

#### Scenario: 有效 Excess Request

- **WHEN** request 符合 OAS 且服務端重新計算後在 allowance 內
- **THEN** API SHALL 回傳 movement、Covered／Excess、decision 與 snapshot identifiers
- **AND** SHALL NOT 信任 caller-provided authoritative calculation

#### Scenario: Calculable Excess Limit Exceeded

- **WHEN** Excess-enabled request 通過 FX／configuration／domain prerequisites 但 projected total 超過 Effective Limit
- **THEN** API SHALL 回傳 HTTP `409`、`EXCESS_LIMIT_EXCEEDED` 與 structured error fields，不得回傳 movement 或 reservation identifier
- **AND** response SHALL 包含 current-snapshot Minimum Required Increase 或 `INCREASE_ALONE_CANNOT_RESOLVE`，但 A3S pre-submit SG-resolution phase 除外
- **AND** SHALL 維持 zero-write，包括 movement、reservation、FX／decision snapshot、ledger event 與 idempotent success

#### Scenario: A3S Pre-submit Alternative SG Resolution

- **WHEN** A3S current SG 不足且存在其他 Eligible SG
- **THEN** API SHALL 在 Maker Submit persistence 前回傳 re-selection guidance 與 eligible alternatives，不得 auto-select
- **AND** SHALL NOT 建立 movement／reservation，亦 SHALL NOT 回傳目前選擇下的 Minimum Required Increase
- **AND** 使用者 re-select 後 SHALL 重新執行 authoritative calculation；若仍超限，正式 Submit SHALL 適用 HTTP `409`／zero-write contract並回傳新的 Minimum Required Increase

#### Scenario: A3／A3S Acknowledge Response Retains Pending

- **WHEN** A3／A3S Checker Acknowledge通過current-facts／policy／allowance／FX重驗
- **THEN** API SHALL回傳LC UTILIZE `PENDING`／EARMARKED與Pending Excess Reservation狀態，不得回傳Approved Excess conversion
- **AND** response SHALL回傳locked Legal／Covered／Excess snapshot；A3S另回傳Base Parent Tight、Current SG Redemption Amount及Effective Presentation Capacity

#### Scenario: A3／A3S Post-Acknowledge Amount Fix Is Rejected

- **GIVEN** A3或A3S `acknowledgedAt != null`且Legal／Covered／Excess snapshot已鎖定
- **WHEN** caller對該為`PENDING`／EARMARKED或`REJECTED`的A3／A3S提交Amount Fix／Resubmit
- **THEN** API SHALL在policy／FX／allowance之前回傳HTTP `409`／`ILLEGAL_STATE_TRANSITION`並不得呼叫FX
- **AND** response SHALL NOT宣稱replacement成功；movement、amount、reservation與locked snapshots SHALL維持不變，A3S main SG facts亦不得改變

#### Scenario: A4／A6 Final Release Response

- **WHEN** A4／A6 final Checker Release再次重驗成功
- **THEN** API SHALL回傳referenced LC UTILIZE finalised及Pending→Approved Excess原子轉換結果
- **AND** SHALL回傳Acknowledge locked split且證明未因later parent capacity重新拆分或重做main A3S SG side effects

#### Scenario: A4／A6 Final Release Failure Retains Pending

- **WHEN** A4／A6 final Checker Release因FX unavailable／stale、allowance breach或其他validation失敗
- **THEN** API SHALL回傳typed non-success result並顯示referenced LC UTILIZE與reservation仍Pending
- **AND** SHALL NOT回傳部分finalisation或Approved Excess conversion

### Requirement: 查詢包含關聯 Ledgers

Inquire Events SHALL 回傳 root contract 的相關 child-ledger events，包括 A3S、memo-only B3、Excess reservations／approved、full Delete Pending audit、FX snapshots與Legal／Covered／Excess calculation snapshots，並依 event date／time 加穩定 tie-breaker 排序。Over-limit Submit是zero-write command error，query不得虛構blocked movement、reservation或guidance fact；不得暴露不存在的 Return／partial cancellation 或 Formal Increase allocation／cure transaction。

#### Scenario: 含 A3S 的 Import LC

- **WHEN** 使用者查詢包含 A3S business event 的 Import LC
- **THEN** Event History SHALL可找到相關LC、main SG reference、normalized capacity snapshot與Excess decision facts

#### Scenario: 含 B3 的 Export Confirmation

- **WHEN** 使用者查詢包含 B3 Presentation 的 Export Confirmation
- **THEN** Event History SHALL 包含 memo-only B3、Excess facts 及 root-ledger context
- **AND** events SHALL 依 event date／time 與穩定 tie-breaker 排序

#### Scenario: 含 B3 Delete Pending Audit 的 Export Confirmation

- **WHEN** 使用者查詢曾整筆 Delete Pending 的 B3
- **THEN** history SHALL 包含原 pending B3、完整 reservation release 與 deletion audit
- **AND** SHALL NOT 顯示 Return Documents、partial amount 或 Approved Excess reversal

## ADDED Requirements

### Requirement: Excess Eligibility Query

API SHALL 提供 owner-level allowance／eligible source inquiry，回傳 snapshot time、policy version、approved utilization、pending reservation 與 candidate attribution；結果僅供提示，command time MUST 重驗。

#### Scenario: Four Protected Exceed Fields Preview

- **WHEN** caller 對 A3／A3S／B3 請求 Excess preview
- **THEN** API SHALL 回傳唯讀 `previousExceedAmount`、`thisExceedAmount`、`totalExceedAmount`、`maximumExceedAmount`及transaction currency
- **AND** `previousExceedAmount` SHALL只彙總active outstanding Pending＋Approved commitments，排除allowance commitment已`RELEASED`／`REVERSED`／`DELETED`／`EXPIRED`者；Fix／Resubmit另排除current movement reservation exactly once
- **AND** `thisExceedAmount = max(0, transactionAmount - effectivePresentationCapacity)`、`totalExceedAmount = previousExceedAmount + thisExceedAmount`
- **AND** `maximumExceedAmount = MIN(LC／Confirmation face amount excluding tolerance × allowancePercentage, configuredMaximumUsd以合規rate換算至transaction currency的金額)`，不得回傳raw converted USD cap作為Maximum
- **AND** Import `LC Amount = Issue LC Amount + cumulative formal／Checker-approved Increase - cumulative formal／Checker-approved Decrease`；Pending／未核准amendments及Tolerance SHALL不影響該operand
- **AND** preview SHALL zero-write，不得建立或修改movement、reservation、ledger、FX／decision snapshot、audit-as-transaction fact或idempotent success

#### Scenario: Zero Configuration Maximum Is Zero

- **GIVEN** `configuredMaximumUsd = 0` OR `allowancePercentage = 0`
- **WHEN** API回傳四個protected fields的configuration presentation
- **THEN** `maximumExceedAmount` SHALL為transaction currency的`0`
- **AND** SHALL表示no Excess capability，沿用legacy sufficiency且不得呼叫FX或啟動Excess validation

#### Scenario: Preview FX Is Fail-closed

- **WHEN** USD owner請求preview
- **THEN** API SHALL使用`USD_PAR`且provider call count為零
- **WHEN** non-USD owner請求preview
- **THEN** API SHALL只接受provider-supplied、Approved／Effective／Fresh的`BOOKING` quote
- **AND** unavailable／invalid SHALL回傳`FX_RATE_UNAVAILABLE`，stale SHALL回傳`FX_RATE_STALE`，並維持zero-write

#### Scenario: Maker Submit Does Not Trust Preview

- **GIVEN** caller曾取得任一preview或自行提交四個欄位值
- **WHEN** Maker Submit A3／A3S／B3
- **THEN** service SHALL從最新committed facts及decision-point合格rate重新計算四個欄位
- **AND** SHALL NOT把caller值或stale preview當作權威validation input

#### Scenario: Query 後 Rate 或 Allowance 改變

- **WHEN** UI 根據 inquiry 顯示可用 allowance，但 submit 時 facts 已變化
- **THEN** command SHALL 使用最新權威 facts 決定
- **AND** stale preview SHALL NOT 保證成功

#### Scenario: Empty Eligible Sources

- **WHEN** 查詢成功但沒有 downstream candidate
- **THEN** API SHALL 回傳成功空集合
- **AND** UI SHALL NOT 顯示為服務錯誤

### Requirement: ABSENT Import Approval and Export Authorization HTTP Contracts

A4／A6 final Release對legacy `applicantWaiverValidationResult`、`waiverReference`、`waiverDate`及`waiverEvidence`欄位僅保留向後相容；新Release SHALL按ABSENT處理，不要求或保存Applicant Waiver，亦不得因欄位缺失回傳`APPLICANT_WAIVER_REQUIRED`。B4 Checker asset-creation contract SHALL接受authorization claim與人工validation result並封存immutable decision snapshot；B3不得決定debtor attribution。系統不得提供或依賴外部authorization lookup endpoint。

#### Scenario: Positive Import Excess Has No Waiver Fields

- **WHEN** A4／A6 final Release引用正數Import Excess但沒有legacy waiver fields
- **THEN** API SHALL按ABSENT處理，並在其他Release gates通過時完成Release
- **AND** SHALL NOT建立Applicant Waiver snapshot

#### Scenario: Partial Export Authorization Is Not Accepted

- **GIVEN** Export Excess為200且`authorizedAmount`為100
- **WHEN** B4 Checker提交authorization validation以建立assets
- **THEN** response SHALL標示`authorizationAccepted = false`並將完整200 attribution至`BENEFICIARY_OR_RECOURSE_PARTY`
- **AND** response SHALL NOT回傳100／100 partial debtor split

### Requirement: Export Asset Inquiry Reconciles Legal Amount

Export inquiry SHALL分別回傳既有Covered Asset與`EXPORT_EXCESS_ASSET`，包括mapping identity、amount、currency、debtor attribution、authorization reference及business event。不得以泛稱`Issuing Bank Asset`取代`Due from Issuing Bank`或`Reimbursement Receivable`。

#### Scenario: Sight and Usance Asset Reconciliation

- **WHEN** Legal Amount為10,200、Covered為10,000、Excess為200
- **THEN** Sight inquiry SHALL顯示`Due from Issuing Bank = 10,000`及`EXPORT_EXCESS_ASSET = 200`
- **AND** Usance inquiry SHALL顯示`Reimbursement Receivable = 10,000`及`EXPORT_EXCESS_ASSET = 200`
- **AND** 每一case的兩腿總額 SHALL等於Legal Amount 10,200
