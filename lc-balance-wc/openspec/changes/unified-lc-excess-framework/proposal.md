## Why

v11.15 FROZEN Business Input 要求 A8、A3、A3S 與 B3 在合約可用額度不足時，將交易拆成 Covered Amount 與 Excess Amount，並以同一 allowance owner 的累計 Approved Excess 執行限額控制。現行 OpenSpec、程式與測試採 hard-reject，且沒有 Excess ledger、FX Booking Rate freshness、正式增額 regularization、downstream eligibility 或完整 audit snapshot，因此 84 項 Gap Matrix 的 current conformance 為 FAIL。

2026-09-22 Requirement Gap Analysis Review 已 PASS，Reviewer 接受 84 項 Gap Matrix 與 C-01～C-07 作為本 Change 的輸入。其後 Business Decision 採用方案 1：非 USD 交易在 Maker Submit 時若無 Approved／Effective 且符合 Freshness Policy 的 Booking Rate，必須 fail closed；本期不引入 `FX_RATE_PENDING` transaction state。

## What Changes

- 以統一 Excess Policy 支援 A8、A3、A3S、B3 的 Covered／Excess split、allowance validation、pending reservation 與 Approved Excess cumulative ledger。
- 以 Import LC 與 Export Confirmation 為各自 allowance owner，防止 partial shipment、multiple presentation、downstream completion 或 A8→A3S 關聯流程重複使用已核准 excess。
- **BREAKING**：取代 A8、A3、A3S、B3 超過 Tight Available 即 hard-reject 的規則；只有 allowance 超限、FX gate 失敗或其他 domain validation 失敗才拒絕。
- 在 Maker Submit 與 Checker Release 分別重新估值；非 USD 必須使用 Currency Exchange 提供的 `BOOKING` rate 與 Approved／Effective／fresh metadata。
- Maker FX unavailable/stale 時回傳 `FX_RATE_UNAVAILABLE`／`FX_RATE_STALE`，不建立 transaction 或 reservation；Checker FX unavailable/stale 時禁止 Release，但保留既有 pending transaction／reservation。
- 將 Formal Increase regularization、Return Documents／A8 cancellation reversal 建模為不可變 adjustment events，不回寫原 Approved Excess decision。
- 將 Excess decision status、workflow status、accounting status、contract status 分離，並擴充 API、Inquiry、UI、Business Case Runner 與 regression evidence。
- 建立 Downstream Eligibility contract；Payment、Settlement、Honour、Acceptance、A3S capacity redemption 不得自動釋放 Approved Excess。

## Capabilities

### New Capabilities

- `excess-allowance-control`：Covered／Excess 計算、owner allowance、pending reservation、approved utilization、regularization 與 reversal。
- `currency-exchange-integration`：Booking Rate request／response、Approved／Effective、Freshness、Maker／Checker failure semantics 與 FX audit snapshot。
- `downstream-excess-eligibility`：Approved Excess 對 downstream 交易的 eligibility 與不可自動釋放規則。

### Modified Capabilities

- `import-lc-transactions`：A8、A3、A3S Excess 與 Return Documents／cancellation。
- `export-confirmation-transactions`：B3 Excess 與 Return Documents。
- `maker-checker-control`：Submit reservation、Release revaluation、四功能 Fix Pending 例外與 fail-closed atomicity。
- `earmark-linked-transactions`：A8→A3S anti-double-counting 與 SG capacity／legal liability 分離。
- `balance-calculation`：Covered／Excess 與 pending／approved excess aggregates。
- `contract-movement-model`：Excess／FX immutable events、status separation、idempotency contract。
- `http-api-and-inquiry`：typed errors、FX／Excess fields、history 與 eligibility response。
- `transaction-builder-ui`：Excess preview、block reason、FX result 與 Checker review evidence。
- `business-case-runner`：v11.15 positive、boundary、reject、revaluation、reversal與 regression cases。

## Scope

範圍包含 A8、A3、A3S、B3，Import LC／Export Confirmation owner-level allowance，Maker／Checker、Formal Increase、FX、Downstream Eligibility、Return／Cancellation、API、Data Model、UI、Audit 與 Regression。

## Non-Goals

- 不引入 `FX_RATE_PENDING` transaction state。
- 不把 `lc-payment-wc` 的 demo FX table 當作 production Currency Exchange source；本期會把它擴充為可供測試的虛擬 Currency Exchange adapter。
- 不改變 SG legal／contingent liability 的解除條件，也不以 Eligible SG Capacity redemption 取代 A9 或法律 lifecycle。
- 不在本 Proposal 實作程式、DB migration、OAS 或測試。
- 不擴充至 SBLC、LG 或 v11.15 未列的 transaction functions。

## Business Decision Record

### BD-01 — Maker FX Fail-Closed（已確認）

非 USD A8／A3／A3S／B3 的 Maker Submit 必須取得 Approved、Effective 且 fresh 的 Booking Rate。Rate 不存在、未 Approved／Effective 時回傳 `FX_RATE_UNAVAILABLE`；rate 超過 Max Staleness 時回傳 `FX_RATE_STALE`。兩者均代表 Excess Limit Validation 未完成，且不得建立 Pending Transaction 或 Pending Excess Reservation。

Checker Release 必須以當時最新可用 rate 重新估值；若 unavailable／stale，Release 不允許，但既有 Pending Transaction 與 Pending Excess Reservation 保留。本期沒有 FX pending workflow state。

### BD-02 — Virtual Booking Rate（已確認）

開發與 Regression 使用類似 `lc-payment-wc` 的虛擬 Currency Exchange service。其 quote 必須提供 `BUY_RATE`、`SELL_RATE` 與 `BOOKING_RATE`；若 source fixture 沒有獨立 Booking Rate 欄位，service 以 exact decimal 計算 `BOOKING_RATE = (BUY_RATE + SELL_RATE) / 2`。此衍生規則只適用於 non-production virtual service／regression fixture。Production 必須取得 provider-supplied BOOKING rate 及 Approved／Effective／Freshness evidence，且不得由 Buy／Sell midpoint 或其他 rate 推導／fallback；缺失時依 BD-01 fail closed。

## Migration and Rollback

- 以 additive tables／columns 與 backfill verification 導入 Excess／FX facts；既有歷史 movement 不得推測為 Approved Excess。
- Feature enablement 以 A8、A3、A3S、B3 policy gate 漸進啟用；啟用前保留現行 hard-reject adapter 作 rollback path。
- 一旦建立 Approved Excess events，不得藉 rollback 刪除或重寫；rollback 只能停止新 Excess Submit，既有 pending／approved records 仍須可查詢、處理或依法 reversal。
- `configuration-first-product-extension` 可提供 metadata／typed policy registry，但本 Change 不依賴其完成；若同時合併，本 Change 的 v11.15 typed policies 與 immutable core controls 優先。

## Impact and Review Gate

受影響層包含 Angular、Backend proxy、Balance microservice domain／service／store／schema、OAS、Business Cases、Obsidian 與 OpenSpec。此 Proposal 不等於 implementation approval；只有 Proposal、Design、Delta Specs、Tasks 與 traceability Review PASS 後才能開始 implementation。
