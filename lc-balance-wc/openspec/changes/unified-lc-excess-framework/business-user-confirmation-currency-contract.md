# 信用證超押 — 幣別與 Booking Rate 業務確認書

## 1. 文件目的

本文件只用於向業務用戶確認「超押額度的比較幣別」及「Booking Rate 換算方向」。確認前不得開始相關 implementation，也不得由技術團隊自行推定跨幣別規則。

## 2. 參考業務文件

目前 Requirement Gap Analysis 與 OpenSpec 使用以下文件作為業務基準：

`信用證超押處理業務需求_v11.15_V4_BA_REVIEW_FIXED.docx`

檔名已與文件內正式 v11.15 V4 版本名稱統一，僅代表一份 sole-baseline 文件，不存在競爭版本。

V4 是業務提供的 Word 文件版本，不是開發團隊或 AI 自行建立的業務版本。本確認書不修改該 Word 文件。業務已確認 V4 正式取代先前 v2，成為唯一業務基準。

請業務用戶確認：

- [x] 同意上述 V4 Word 文件是本次 Change 的唯一業務基準（已確認）。
- [ ] 不同意；請提供正確的正式業務基準文件名稱／版本。

## 3. 待確認的幣別不變量

目前依 V4 §19.1–§19.3 的明文規定如下：

```text
A8 / A3 / A3S.transactionCurrency = Import LC.currency
B3.transactionCurrency            = Confirmation.currency
```

業務含義：

- A8、A3、A3S 的交易幣別必須等於所屬 Import LC 幣別。
- B3 的交易幣別必須等於所屬 Confirmation 幣別。
- Transaction／Presentation Excess 因此已經是 allowance owner currency。
- 不存在「Transaction Excess → Owner Currency」的第二段 FX 換算。
- 若 request 的交易幣別與 owner currency 不相同，系統在 FX lookup 及任何 persistence 前拒絕，保持 zero-write。

請業務用戶確認：

- [x] **YES** — 同意上述 transaction currency = owner currency invariant（V4 明文規定；隨 V4 sole-baseline 確認生效）。
- [ ] **NO** — 允許不同幣別；請另行定義第二段 FX 的方向、rate purpose、provider source、rounding、freshness 及 audit 規則。此選項構成 V4 以外的新 Business Decision。

## 4. Configured Maximum USD 的唯一 FX 換算

在 transaction currency = owner currency 的前提下，本期唯一需要的 FX 換算是：

```text
fromCurrency = USD
toCurrency   = Import LC / Confirmation currency
amount       = configuredMaximumUsd
ratePurpose  = BOOKING
```

Currency Exchange provider 必須直接回傳：

- `convertedAmount`，幣別為 owner currency；
- provider-supplied `BOOKING` rate；
- rate ID／version、source、timestamp；
- Approved／Effective／Freshness evidence；
- 如使用 PBD fallback，另含 `fallbackPolicyId`、`fallbackPolicyVersion`、fallback reason、rate date 與 source。

Balance Component 必須直接使用 provider `convertedAmount`，不得：

- 對 `EUR→USD` 等反向 quote 自行取倒數；
- 使用 BUY／SELL／mid-market 代替 production Booking Rate；
- 建立第二段 Transaction Excess→Owner Currency 換算；
- 使用未授權或 stale 的 PBD rate。

USD owner 不呼叫外部 provider，使用 `USD_PAR = 1`。

請業務用戶確認：

- [x] **YES** — 同意唯一 FX 為 provider `USD → owner currency` 的 Configured Maximum conversion（V4 明文規定；隨 V4 sole-baseline 確認生效）。
- [ ] **NO** — 請提供正式替代換算流程及 provider contract。

## 5. Allowance 計算幣別

所有 authoritative comparison 與 aggregate 均使用 owner currency：

```text
percentageAllowanceOwner
    = Approved Contractual Maximum Owner Amount × allowancePercentage

configuredMaximumOwner
    = provider.convertedAmount(
        USD → ownerCurrency,
        configuredMaximumUsd,
        BOOKING)

effectiveLimitOwner
    = MIN(percentageAllowanceOwner, configuredMaximumOwner)

availableAllowanceOwner
    = MAX(0,
        effectiveLimitOwner
      - approvedExcessOutstandingOwner
      - otherPendingReservationsOwner)
```

請業務用戶確認：

- [x] **YES** — 同意 Percentage Allowance、Configured Maximum、Approved Excess、Pending Reservation 及 Proposed Excess 全部在 owner currency 比較（V4 明文規定；隨 V4 sole-baseline 確認生效）。
- [ ] **NO** — 請提供正式替代幣別與計算公式。

## 6. 虛擬 Currency Exchange 的影響

目前 non-production `lc-payment-wc` 虛擬 FX fixtures 主要是舊方向，例如 `EUR→USD`、`GBP→USD`、`AUD→USD`。它們不能被 Balance Component 取倒數來滿足新 contract。

在用戶確認本文件後，implementation plan 會以 TDD 新增 task 2.6a：

- 新增 direct `USD→ownerCurrency` test fixtures；
- request amount 使用 `configuredMaximumUsd`；
- virtual provider 直接回傳 owner-currency `convertedAmount`；
- 依 target currency minor-unit precision 只 round 一次；
- 覆蓋 explicit Booking、non-production midpoint、missing side、stale、not Approved、not Effective、timeout；
- USD owner 使用 `USD_PAR` 且 provider call count = 0；
- 禁止 Balance 對舊 owner→USD fixture 做 inverse calculation。

此 midpoint derivation 仍只限 non-production virtual／regression fixture；Production 不得使用。

請業務用戶確認：

- [x] **YES** — 同意按上述方向調整 non-production virtual FX fixtures（落實 V4 provider USD→owner contract；production boundary 不變）。
- [ ] **NO** — 請提供指定的 non-production test provider contract。

## 7. 不受本確認影響的已核准規則

以下規則保持不變：

- Maker FX unavailable／stale：zero-write。
- Checker FX unavailable／stale：deny Release，保留 pending movement／reservation。
- 不新增 `FX_RATE_PENDING`。
- Production 不得使用 midpoint／BUY／SELL fallback。
- Policy-authorized PBD 只接受 provider-supplied BOOKING 並保存完整 audit evidence。
- A8／A3／A3S／B3 calculable over-limit Submit 一律回傳 HTTP `409 EXCESS_LIMIT_EXCEEDED` 並保持zero-write；不得建立blocked pending movement／reservation。
- A3／A3S Acknowledge後保持LC UTILIZE／Excess Reservation Pending，Sight A4／Usance A6 final Release才轉Approved；A3S SG redemption／capacity／attribution只在Acknowledge原子執行一次。
- Reject 保留 reservation；Delete Pending 釋放；Resubmit 使用同一 identity 並原子替換 reservation。
- A2／B2 processing 不修改；Formal Increase 不建立 cure／allocation transaction，也不減少 Approved Excess history。
- A3S 先引導 re-select Eligible SG，不自動選擇，也不與 current-selection Minimum Required Increase 同時顯示。
- `configuredMaximumUsd = 0 OR allowancePercentage = 0` 使用 BD-03 legacy sufficiency，代表不允許超押。

## 8. 業務用戶正式回覆範本

請回覆以下文字之一。

### 同意

```text
Business Confirmation: PASS

1. 信用證超押處理業務需求 V4 BA REVIEW FIXED Word 文件是本次唯一業務基準。
2. A8/A3/A3S transaction currency 必須等於 Import LC currency；B3 必須等於 Confirmation currency。
3. 唯一 FX conversion 為 Configured Maximum USD 由 provider 直接執行 USD→owner currency BOOKING conversion，Balance 使用 provider convertedAmount，不得 inverse。
4. 所有 allowance comparison／aggregate 使用 owner currency。
5. 同意按 task 2.6a 調整 non-production virtual FX fixtures；production midpoint 仍禁止。
```

### 不同意或需修訂

```text
Business Confirmation: REQUIRES_CHANGE

需修訂項目：
1. ...
2. ...
```

## 9. Gate

- **Business Confirmation：PASS** — 業務已確認 V4 取代先前版本並成為 sole baseline；上述四項為 V4 明文 contract 的狀態同步，不構成新增 Business Decision。
- 本確認書 PASS 前：不得開始相關 implementation。
- 如回覆 REQUIRES_CHANGE：先更新 Business Decision／OpenSpec，再重新執行 BA、4-Eyes、QA 與 strict validation。
- 本確認書 PASS 不等於 implementation 完成；後續仍須 TDD、Regression、SonarQube Quality Gates 與 Implementation Review。
