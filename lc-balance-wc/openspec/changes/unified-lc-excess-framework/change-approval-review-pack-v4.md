# OpenSpec 變更核准審查包——信用證超押 V4 BA 複核修正版

## 1. 審查狀態

- 分支：`OVERDRAWN`；本變更不修改 `main`。
- 業務基準：`信用證超押處理業務需求_v11.15_V4_BA_REVIEW_FIXED.docx`。由於 V4 的 Return 文字與現行產品不符，且 Fix Pending 需要明確的原子替換公式，因此以使用者已確認的 BD-07／BD-08 修正。
- 範圍：本 BD-07／BD-08 OpenSpec 修訂已於 2026-09-22 取得使用者 Change Approval PASS；受影響的 implementation 可在 `OVERDRAWN` 依核准 tasks 與 TDD 恢復進行，禁止在 `main` 進行。
- 需求追溯：已接受的 84／84 Gap Matrix 仍為追溯基礎，並由 V4 修訂及整合。
- 驗證：完成所有最終審查修正後，`openspec validate --all --strict --no-interactive` 必須為 `16 PASS / 0 FAIL`。
- 治理要求：核准前必須完成 BA 複核、獨立 4-Eyes 技術審查及獨立 QA 審查。

## 2. 核准決策

| 編號 | 已核准的契約 |
| --- | --- |
| BD-01 | 非 USD allowance owner 在 Maker Submit 時，必須取得 provider 提供、Approved／Effective／符合 Freshness 的 USD→owner `BOOKING` quote 及 `convertedAmount`。Rate 不存在時回傳 `FX_RATE_UNAVAILABLE`；stale 時回傳 `FX_RATE_STALE`；兩者在 Maker 均為 zero-write。Checker 失敗時拒絕 Release 並保留 pending facts。不引入 `FX_RATE_PENDING`。 |
| BD-02 | 僅 non-production 的虛擬 FX fixture 可以用精確十進位數計算 `BOOKING_RATE=(BUY_RATE+SELL_RATE)/2`。Production 不得推導 midpoint，亦不得用 Buy／Sell 代替。 |
| BD-03 | `configuredMaximumUsd=0 OR allowancePercentage=0` 表示不允許超押。系統沿用原有餘額充足性流程，不呼叫 FX、不寫入 Excess facts，並保留 `409 INSUFFICIENT_AVAILABLE_BALANCE`。 |
| BD-04 | A3S「同時顯示」為 **NO**。先引導使用者重新選擇 eligible SG，絕不自動選擇；重新選擇後仍不足，才顯示重新計算的 Minimum Required Increase 及既有 A2 引導。 |
| BD-05 | PBD fallback 僅在以下條件全部成立時為 **YES**：由 provider 提供 `BOOKING`、版本化 FX Policy 明確授權、Approved／Effective 且在 Max Staleness 內。必須保存 policy ID／version、reason、rate date 及 source；否則依 BD-01 fail closed。 |
| BD-06（2026-09-23修訂） | A8／A3／A3S／B3可計算的over-limit Maker Submit一律HTTP `409 EXCESS_LIMIT_EXCEEDED`且zero-write；不得建立blocked pending movement／reservation。Formal Increase僅提供error-response引導，完成A2／B2後須fresh Submit。 |
| BD-09 | A3／A3S Acknowledge後LC UTILIZE與Excess Reservation保持Pending；Sight A4／Usance A6 final Release再次重估成功後才轉Approved。A3S SG redemption／capacity／attribution只在Acknowledge原子執行一次。 |
| BD-07 | 不存在 Return Documents、部分退回、部分取消或 Approved Excess reversal 功能。Delete Pending 是唯一撤回方式：針對整筆 `PENDING|REJECTED` transaction，不接受 amount，並釋放整筆 Pending Excess Reservation；`APPROVED|RELEASED` 不適用。 |
| BD-08 | Fix Pending 在相同 pending identity 下原子替換整筆金額：目前 pending 總額 − 舊金額 + 新金額；目前 pending excess − 舊 reservation + 重新計算的新 reservation。任何失敗都必須保留全部舊 facts。 |

## 3. 明確技術契約

### 3.1 Allowance 公式與併發控制

```text
percentageAllowanceOwner = owner currency 的最新 Approved Contractual Maximum
                         × allowancePercentage
configuredMaximumOwner   = provider.convertedAmount(
    fromCurrency = USD,
    toCurrency   = ownerCurrency,
    amount       = configuredMaximumUsd,
    purpose      = BOOKING)
effectiveLimitOwner      = min(percentageAllowanceOwner, configuredMaximumOwner)
availableAllowanceOwner  = max(0,
    effectiveLimitOwner
  - approvedExcessOutstandingOwner
  - otherPendingReservationsOwner)
```

所有 allowance 比較與彙總均使用 owner currency（LC／Confirmation currency）、精確十進位數及該幣別核准的 minor-unit rounding。Balance 必須直接使用 provider 的 USD→owner `convertedAmount`，不得自行計算反向匯率。Fix／Resubmit／Checker 必須且只能排除或替換目前 movement 所保留的 reservation 一次。併發 Submit 必須以已提交的最新 facts 序列化，禁止 lost update，亦禁止兩個基於 stale facts 的 `WITHIN_ALLOWANCE` 結果；其後的 over-limit Submit須HTTP `409`且zero-write。USD owner 使用 `USD_PAR` 進行 identity conversion。

幣別不變量：`A8/A3/A3S.transactionCurrency == ImportLC.currency`；`B3.transactionCurrency == Confirmation.currency`。因此 Transaction Excess 已經是 owner currency，不存在第二段 FX 轉換。幣別不一致時，必須在查詢 Currency Exchange 及持久化之前拒絕；若要允許幣別不一致，必須另行取得 V4 範圍外的新 Business Decision。

### 3.2 狀態與 HTTP 分離

下列欄位互相獨立，禁止合併成單一 composite enum：

```text
workflowStatus     = PENDING | APPROVED | REJECTED | DELETED
accepted excessDecision = NOT_REQUIRED | WITHIN_ALLOWANCE
command error           = EXCESS_LIMIT_EXCEEDED  // HTTP 409, zero-write
releaseEligibility      = ELIGIBLE
```

其他條件均有效且可計算的over-limit Maker Submit必須回傳HTTP `409`／`EXCESS_LIMIT_EXCEEDED`，且不得保存movement、reservation、snapshot、ledger或idempotent success。此規則對A8／A3／A3S／B3一致。

### 3.3 Maker／Checker／Reject／Delete／Resubmit

- Maker FX／configuration／進入 domain 前的 validation 失敗：zero-write。
- Checker FX 或 allowance 驗證失敗：拒絕 Release，並保留 pending movement／reservation。
- Checker Reject：狀態轉為 `REJECTED`；保留 reservation 及 reject audit。
- Delete Pending 接受 `PENDING` 或 `REJECTED`，狀態轉為 `DELETED`，釋放 reservation，並保留 reject／deletion audit。
- Resubmit 保留原有 business-event／movement identity；適用時原子執行 `REJECTED → PENDING`，並替換而非重複建立 reservation。
- Fix／Resubmit既有accepted pending movement後若replacement over-limit，command拒絕且原movement／amount／reservation完整不變；初次over-limit Submit沒有identity可Resubmit。

### 3.3a 整筆 Delete Pending 與 Fix Pending 替換

- Active scope 不存在 `RETURN_DOCUMENTS`、return／cancellation amount、`RETURN_REVERSAL` 或 `CANCELLATION_REVERSAL` command／event。
- Delete Pending 不接受 amount；必須刪除整筆 `PENDING|REJECTED` transaction，並釋放其完整 Pending Excess Reservation。不得刪除 Approved／Released facts，亦不得減少 Approved Excess。
- Fix Pending 不是退回。完成全部重新驗證後，必須在同一 unit of work 套用 `currentPendingTotal - oldPendingAmount + newPendingAmount`；Excess-enabled 時，同步套用 `currentPendingExcess - oldPendingReservation + newRecalculatedReservation`。
- 核准案例：LC capacity 為 `10,000`；原 A3 到單金額為 `10,200`，Pending Excess 為 `200`。Fix 至 `10,300` 時，新 Pending Excess 為 `300`；Fix 至 `10,100` 時，新 Pending Excess 為 `100`。舊 `200` 必須且只能被替換一次，絕不能累加到新結果。
- FX／capacity／allowance／SG attribution／store／audit 任一步驟失敗時，原有 amount 及 reservation 必須保持不變。

### 3.4 Formal Increase 與 Minimum Required Increase

- 既有 A2／B2 transaction processing 不變。
- Resubmit／重新驗證只讀取最新經 Checker Release 的 Approved Contractual Maximum。
- 不得自動建立 A2／B2，不得提供 Excess Allocation／Cure command、`FORMAL_INCREASE_REGULARIZATION`、active allocation API，亦不得自動減少 Approved Excess。
- V4 草稿前的 allocation schema／data 僅為相容性／audit 而保留；active command／write enum、DTO、store API 及 aggregate cure 行為必須透過經審查的非破壞性 migration 移除或停用。只有確有需要時才保留 read-only legacy decoder。
- Minimum Required Increase 是以 owner currency minor unit 表示的最小非負 contractual increment；在其他 current-snapshot input 保持不變，且 retained reservation 僅被計入／替換一次的前提下，該增額必須能滿足同一套權威重新驗證 predicate。
- 若不存在有限增額可解決問題，回傳 `INCREASE_ALONE_CANNOT_RESOLVE`。適用時必須指出 FX contribution。超過 minimum 的增加額成為一般 contractual capacity。

### 3.5 A3S 順序式引導

- 當目前 SG 不足且存在 eligible alternative 時，pre-submit SG-resolution response 只回傳替代項目及重新選擇引導。
- 不得建立 movement／reservation，不得自動選擇 SG，亦不得顯示目前選擇下的 Minimum Required Increase。
- 重新選擇後，必須重新計算 Effective Presentation Capacity 及完整 Excess decision。
- 只有重新選擇後仍不足且Maker正式Submit，才套用標準HTTP `409` zero-write契約，並提供重新計算的Minimum Required Increase。
- 若所選 SG 無效／已耗盡且不存在 eligible alternative，必須直接拒絕，不得部分寫入 LC Arrival／capacity／reservation。

### 3.6 Production PBD Booking Rate

PBD quote只有在以下條件全部成立時，才能用於Maker Submit及每一適用Checker decision point（A8／B3 Release、A3／A3S Acknowledge、A4／A6 final Release）：

- 由 provider 提供，且 `ratePurpose=BOOKING`；
- 已生效的版本化 FX Policy 明確授權 fallback；
- 在 decision point 為 Approved 及 Effective；
- 符合 Freshness／Max Staleness；
- snapshot 包含 `fallbackPolicyId`、`fallbackPolicyVersion`、`fallbackReason`、`rateDate` 及 `rateSource`。

未授權、非 provider 提供、未 Approved、未 Effective 或 stale 的 PBD rate 必須 fail closed。Maker 不得寫入任何資料；Checker 保留 pending facts，且只記錄 command-attempt audit。Production 絕不得自行推導、反算、計算 midpoint 或使用其他 purpose 的 rate。

### 3.7 Four Protected Exceed Fields（Bug Alignment；No New BD）

| Protected field | Contract |
| --- | --- |
| Previous Exceed Amount | Active outstanding Pending＋Approved Excess commitments；排除allowance commitment已`RELEASED`／`REVERSED`／`DELETED`／`EXPIRED`者；Fix／Resubmit排除current movement舊reservation exactly once。Movement的downstream Release不得在沒有allowance release fact時自動減少Approved Excess。 |
| This Exceed Amount | `max(0, transactionAmount - effectivePresentationCapacity)`。 |
| Total Exceed Amount | `Previous Exceed Amount + This Exceed Amount`。 |
| Maximum Exceed Amount | `MIN(LC／Confirmation face amount excluding tolerance × allowancePercentage, configuredMaximumUsd以合規rate換算至transaction currency的金額)`；Import LC Amount=`Issue LC Amount + cumulative formal／Checker-approved Increase - cumulative formal／Checker-approved Decrease`，Pending／未核准amendment及Tolerance均不生效。這是最終MIN，不是raw converted cap。任一配置為0時Maximum=`0`／no Excess。Transaction currency必須等於owner currency；USD使用`USD_PAR`且zero provider call，non-USD只用provider-supplied Approved／Effective／Fresh `BOOKING`。 |

Preview API及UI均不可寫入movement、reservation、ledger、snapshot、audit-as-transaction fact或idempotent success。Rate unavailable／invalid回`FX_RATE_UNAVAILABLE`，stale回`FX_RATE_STALE`。Maker Submit永遠以最新committed facts及decision-point rate重新計算，禁止信任caller或stale preview。

## 4. 必要 Regression 證據

- A8／A3／A3S／B3：Covered-only、partial／full Excess、exact limit，以及一致的over-limit HTTP 409／zero-write。
- Checker Release denial、Reject-retain、`PENDING|REJECTED → DELETED` reservation release，以及沿用相同 identity 的 Resubmit reservation replacement。
- A8→A3S attribution transfer 與 anti-double-counting；SG legal liability 必須保持獨立。
- A3S 順序式重新選擇的 negative／positive 案例；不得同時顯示 Minimum Required Increase。
- Formal Increase 的 partial／sufficient／over-increase、no finite solution、FX contribution，以及證明沒有 active cure／allocation capability 的 negative case。
- Maker及各適用Checker decision point的Production FX／PBD matrix：精確USD→owner方向、configured USD amount、provider `convertedAmount`，禁止自行反算；涵蓋已授權PBD成功，以及未授權、非provider、未Approved、未Effective、stale等失敗案例；驗證精確audit evidence、Maker zero-write，以及各Checker-stage retain-pending command-attempt audit。
- BD-03三種configuration row × 四個function × Maker／各適用Checker decision point／Fix path，並驗證零FX呼叫及零Excess facts。
- Downstream A4／A6／B4／A9 不得自動釋放 Approved Excess。
- Return scope negative case：不存在 Return Documents／partial cancellation endpoint、UI action、candidate 或 active reversal event；Delete Pending 僅能整筆處理，並釋放完整 Pending Excess Reservation。
- Fix Pending replacement 案例涵蓋 `10200/200 → 10300/300`、`10200/200 → 10100/100`，以及失敗時保留舊 facts 的證據。
- Four Protected Exceed fields matrix：A3／A3S／B3 × covered-only／positive This／exact Maximum／one minor unit over；Previous只含active outstanding Pending＋Approved，terminal commitments排除，Fix self只排除一次；Total恆等於Previous＋This。
- Maximum operand matrix：face amount明確排除tolerance；percentage operand與compliant converted configured USD cap取MIN；不得顯示raw cap；任一配置為0時Maximum=0／no Excess且zero FX。
- LC Amount amendment-state matrix：Issue `10,000`＋formal approved Increase `2,500`−formal approved Decrease `300`=`12,200`；Pending Increase `1,000`、未核准Decrease及Tolerance不得改變LC Amount或Maximum percentage operand。
- Deterministic Fix case：other Pending `100`＋Approved `200`＋self `50`＋terminal `900`，replacement `10,500`／capacity `10,000`／Maximum `800`，必須得到Previous `300`、This `500`、Total `800`；`10,500.01`則Total `800.01`並zero-write reject。
- Preview／Submit matrix：preview完整zero-write；USD_PAR zero provider call；non-USD provider BOOKING Approved／Effective／Fresh positive case；unavailable／invalid與stale typed fail-closed；preview後commitment／capacity／policy／rate變更時Maker Submit必須重新計算並以權威response取代preview。
- 完整既有 lifecycle regression、TDD 證據及 SonarQube ARM64 Quality Gates。

## 5. SonarQube Release Gates

使用對應確切 commit SHA、乾淨的 `OVERDRAWN` worktree，以及經 ARM64 調整的 `lc-ssi-wc/qa/docker` 參考設定。證據必須綁定 commit SHA、project key、analysis ID、clean tree，以及三個 LCOV input 的最新 hash。

New Code：Issues `0`；Security Hotspots Reviewed `100%`；Coverage `>=92%`；Duplicated Lines `<=1%`；Maintainability Issues `0`；Medium Severity Issues `0`；Security Issues `0`。

Overall Code：Coverage `>=92%`；Duplicated Lines `<=3%`；High Severity Issues `0`；Maintainability Issues `<=20`；Medium Severity Issues `0`；Security Hotspots Reviewed `100%`；Security Issues `0`。

## 6. 核准檢查表

- [x] BA 確認本審查包符合唯一 V4 業務基準（PASS，2026-09-22）。
- [x] 獨立 4-Eyes reviewer 確認 proposal／design／delta specs／tasks／traceability 內部一致（PASS，P0=0／P1=0／P2=0，2026-09-22）。
- [x] 獨立 QA 確認已規劃所有 positive、boundary、negative 及 regression 案例（PASS，2026-09-22）。
- [x] 完成最終修正後，`openspec validate --all --strict --no-interactive` = `16 PASS / 0 FAIL`（PASS，2026-09-22）。
- [x] 歷史 V4 Change Approval 已取得 PASS（2026-09-22）。
- [x] BA 確認 BD-07／BD-08 scope correction 符合使用者確認的產品行為（PASS，2026-09-22）。
- [x] 獨立 4-Eyes reviewer 確認 proposal／design／delta specs／tasks／traceability 不含正向 Return／partial cancellation capability，且 Fix Pending 公式一致（PASS，P0=0／P1=0／P2=0，2026-09-22）。
- [x] 獨立 QA 確認 negative scope、整筆 Delete 及 atomic Fix 的 regression coverage 完整（PASS，2026-09-22）。
- [x] 完成 BD-07／BD-08 修正後，`openspec validate --all --strict --no-interactive` = `16 PASS / 0 FAIL`（PASS，2026-09-22）。
- [x] 使用者授予 BD-07／BD-08 修訂版 OpenSpec Change Approval PASS（PASS，2026-09-22）。
- [x] 受影響的 implementation 可在 `OVERDRAWN` 恢復進行；禁止在 `main` 進行（2026-09-22）。

## 7. 正式 OpenSpec 來源

本文件是單一核准入口。可執行的唯一事實來源仍為已同步的 `proposal.md`、`design.md`、`specs/` 下的 delta specs、`tasks.md` 及 `requirement-traceability.md`。任何不一致均視為審查失敗，必須在核准前解決。
