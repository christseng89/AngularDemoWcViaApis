## MODIFIED Requirements

### Requirement: 符合 OAS 的 HTTP Contract

Balance Component HTTP API SHALL 只提供目前 OpenAPI contract 記載的 request／response shapes，並 SHALL 對被拒絕的業務動作回傳穩定 structured errors。Excess commands MUST 記載 `EXCESS_LIMIT_EXCEEDED`、`FX_RATE_UNAVAILABLE`、`FX_RATE_STALE`、`IDEMPOTENCY_CONFLICT` 與 configuration／concurrency errors。

#### Scenario: 無效 Request

- **WHEN** 呼叫端 Submit 不符合 schema 或 domain rule 的 movement payload
- **THEN** API SHALL 回傳已記載的 non-success status 與 structured error body
- **AND** SHALL NOT 洩漏 SQL、stack trace、provider credential 或內部 filesystem path

#### Scenario: 有效 Request

- **WHEN** 呼叫端 Submit 符合目前 OAS 與 domain rules 的 request
- **THEN** API SHALL 回傳已記載的 success status 與 response shape

#### Scenario: FX Rate Unavailable

- **WHEN** 非 USD Maker Submit 無法完成 FX gate
- **THEN** API SHALL 回傳已記載的 non-success status、`FX_RATE_UNAVAILABLE` 與可診斷 fields
- **AND** SHALL NOT 洩漏 provider credential、stack trace 或內部 path

#### Scenario: 有效 Excess Request

- **WHEN** request 符合 OAS 且服務端重新計算後在 allowance 內
- **THEN** API SHALL 回傳 movement、Covered／Excess、decision 與 snapshot identifiers
- **AND** SHALL NOT 信任 caller-provided authoritative calculation

### Requirement: 查詢包含關聯 Ledgers

Inquire Events SHALL 回傳 root contract 的相關 child-ledger events，包括 A3S、memo-only B3、Excess reservations／approved／adjustments、FX snapshots、SG capacity 與 Return Documents，並依 event date／time 加穩定 tie-breaker 排序。

#### Scenario: 含 A3S 的 Import LC

- **WHEN** 使用者查詢包含 A3S business event 的 Import LC
- **THEN** Event History SHALL 可找到相關 LC、Shipping Guarantee、SG capacity 與 Excess attribution legs

#### Scenario: 含 B3 的 Export Confirmation

- **WHEN** 使用者查詢包含 B3 Presentation 的 Export Confirmation
- **THEN** Event History SHALL 包含 memo-only B3、Excess facts 及 root-ledger context
- **AND** events SHALL 依 event date／time 與穩定 tie-breaker 排序

#### Scenario: 含 A8 到 A3S Attribution 的 Import LC

- **WHEN** 使用者查詢包含 A8 與 A3S 的 Import LC
- **THEN** Event History SHALL 顯示 SG legal ledger、Eligible SG Capacity 與 Excess attribution 的獨立關聯
- **AND** SHALL 可證明同一 amount 未被重複計算

#### Scenario: 含 B3 Return Documents 的 Export Confirmation

- **WHEN** 使用者查詢含 Approved Excess B3 及其 Return Documents
- **THEN** history SHALL 包含原 B3、FX evidence、return adjustment 與 owner aggregate effect
- **AND** 原 event SHALL 保持可查詢

## ADDED Requirements

### Requirement: Excess Eligibility Query

API SHALL 提供 owner-level allowance／eligible source inquiry，回傳 snapshot time、policy version、approved utilization、pending reservation 與 candidate attribution；結果僅供提示，command time MUST 重驗。

#### Scenario: Query 後 Rate 或 Allowance 改變

- **WHEN** UI 根據 inquiry 顯示可用 allowance，但 submit 時 facts 已變化
- **THEN** command SHALL 使用最新權威 facts 決定
- **AND** stale preview SHALL NOT 保證成功

#### Scenario: Empty Eligible Sources

- **WHEN** 查詢成功但沒有 downstream 或 Return Documents candidate
- **THEN** API SHALL 回傳成功空集合
- **AND** UI SHALL NOT 顯示為服務錯誤
