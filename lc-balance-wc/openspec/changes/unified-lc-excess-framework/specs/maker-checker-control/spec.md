## MODIFIED Requirements

### Requirement: 服務端權威重新驗證

Checker 完成交易前，服務 SHALL 重新讀取目前 movement、contract、相依餘額、Excess ledgers 與有效 policy，並對非 USD A8／A3／A3S／B3 使用 release time 最新 Approved／Effective／fresh Booking Rate 重新驗證 eligibility 與 allowance。

#### Scenario: Maker Submit 後 capacity 改變

- **WHEN** Maker Submit 與 Checker Release 之間的 capacity、allowance 或 Booking Rate 發生變化
- **THEN** Release SHALL 使用最新已提交 domain facts 與最新合格 rate
- **AND** movement 已不符合資格時 SHALL 原子失敗

#### Scenario: Release Rate Unavailable 或 Stale

- **WHEN** Checker 無法取得 Approved／Effective／fresh Booking Rate
- **THEN** Release SHALL 回傳 `FX_RATE_UNAVAILABLE` 或 `FX_RATE_STALE`
- **AND** movement 與 Pending Excess Reservation SHALL 維持 pending 不變

#### Scenario: Release 時仍符合資格

- **WHEN** 不同 Checker Release 且重新讀取的 facts 與 FX evidence 仍符合資格
- **THEN** 服務 SHALL 在單一 transaction 核准 movement、轉換 reservation 並保存 Checker snapshot

### Requirement: Fix Pending 限制

Fix Pending SHALL 只修改 function policy 允許的欄位。只有 pending A8、A3、A3S、B3 MAY 修改 monetary amount；其他 functions MUST 保持 identity、reference、currency、monetary 與 linked-movement fields protected。Amount Fix MUST 重跑 Maker FX／allowance gate 並原子替換 reservation。

#### Scenario: 修正 remarks

- **WHEN** Maker 編輯 function policy 允許修正的說明並保存 pending movement
- **THEN** 允許的欄位 SHALL 更新
- **AND** protected 欄位 SHALL 維持不變

#### Scenario: 嘗試修正 Protected 欄位

- **WHEN** Fix Pending request 嘗試改變 function policy 未允許的 identity、reference、currency、monetary 或 linked-movement 欄位
- **THEN** 服務 SHALL 拒絕該修改
- **AND** 原 pending movement 與 reservation SHALL 維持不變

#### Scenario: 四功能修正 Amount 成功

- **WHEN** Maker 修正 pending A8／A3／A3S／B3 Amount 且最新 FX／allowance 驗證成功
- **THEN** movement snapshot 與 Pending Excess Reservation SHALL 原子更新
- **AND** audit SHALL 保存 before／after 與新 FX evidence

#### Scenario: Amount Fix 的 FX 失敗

- **WHEN** Amount Fix 無法取得合格 rate
- **THEN** API SHALL 回傳 `FX_RATE_UNAVAILABLE` 或 `FX_RATE_STALE`
- **AND** 原 pending movement 與 reservation SHALL 完全不變

#### Scenario: 其他 Function 嘗試修正 Amount

- **WHEN** 非 A8／A3／A3S／B3 的 Fix Pending request 嘗試改變 monetary field
- **THEN** 服務 SHALL 拒絕該修改
- **AND** 原 pending movement SHALL 維持不變

## ADDED Requirements

### Requirement: Maker Excess Submit Atomicity

Maker Submit SHALL 在同一 transaction 寫入 movement、Pending Excess Reservation、policy／FX snapshots、idempotency response 與 audit；任何驗證或寫入失敗 MUST 全部回滾。

#### Scenario: FX validation fails before persistence

- **WHEN** Maker Submit 收到 `FX_RATE_UNAVAILABLE` 或 `FX_RATE_STALE`
- **THEN** Excess Limit Validation SHALL NOT 標示完成
- **AND** SHALL NOT 建立 pending movement、reservation 或 `FX_RATE_PENDING` state

#### Scenario: Reservation write fails

- **WHEN** movement insert 成功但 reservation insert 在 transaction 內失敗
- **THEN** movement insert SHALL 回滾
- **AND** idempotency replay SHALL NOT 回傳假成功
