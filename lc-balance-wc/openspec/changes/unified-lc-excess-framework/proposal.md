## Final Change Update Authority（2026-09-23）

本proposal以FROZEN `信用證超押處理業務需求_v11.15_V4_BA_REVIEW_FIXED_V2.docx`及2026-09-24已確認BUG決策為修訂業務基準。A8與A9完全不在本Change範圍，沿用current spec及`main`既有行為；A3S SG Redemption、SG Available Balance及Account Entries亦沿用`main`，但Covered／Excess必須使用V2的normalized A3S sufficiency口徑；A4／A6／B4的正數Excess Checker操作統一以B4為標準，外部waiver／authorization claim預設`ABSENT`，勾選`Checker Approve`後可Release；Export authorization不支援partial split；Sight／Usance Covered Asset沿用`Due from Issuing Bank`／`Reimbursement Receivable`，Excess一律使用獨立`EXPORT_EXCESS_ASSET`。

凡本package較早文字涉及A8／A9、A8 Excess、BD-11 attribution transfer或以`selected existing Eligible SG Capacity`作為A3S Excess基礎，均為`OUT_OF_SCOPE` historical material，不再具有規範性。A3S SG Redemption的timing、ledger、legal effect及lifecycle完全沿用current spec／`main`；本Change只規範如何淨除本筆自身SG／LC UTILIZE legs並使用main產生的Current SG Redemption Amount計算Covered／Excess。

`change-approval-review-pack-v4.md`、`business-user-confirmation-currency-contract.md`及其他先前approval／confirmation／evidence文件僅為historical artifact，不是本次Change Approval入口；其「single approval entry」或既有PASS聲明及所有衝突口徑均由本proposal、`design.md`、本Change的delta specs、`tasks.md`及`requirement-traceability.md`取代。本次正式approval input僅為上述五類規劃文件。

## Why

`信用證超押處理業務需求_v11.15_V4_BA_REVIEW_FIXED_V2.docx` 已取代無`_V2`後綴版本並成為FROZEN唯一業務基準：A3、A3S與B3採Covered／Excess；A3S使用normalized Base Parent Tight + Current SG Redemption Amount；A3／A3S在Acknowledge鎖定Legal／Covered／Excess；Export Excess Asset統一命名為`EXPORT_EXCESS_ASSET`；A8與A9從本Change刪除。84項Gap Matrix保留為歷史分析輸入，衝突時以V2為準。

2026-09-22 Requirement Gap Analysis Review 已 PASS，Reviewer 接受 84 項 Gap Matrix 與 C-01～C-07 作為本 Change 的輸入。其後 Business Decision 採用方案 1：非 USD allowance owner 在 Maker Submit 時若無 Approved／Effective 且符合 Freshness Policy 的 USD→owner Booking quote 與 provider `convertedAmount`，必須 fail closed；本期不引入 `FX_RATE_PENDING` transaction state。其後確認 BD-03：若有效配置的超押允許金額或允許百分比任一為零，該 owner 不啟用 Excess Framework，A3／A3S／B3沿用變更前的Tight Available hard-reject邏輯。2026-09-22 再由業務確認 BD-07：現行產品沒有 Return Documents 或 partial return／cancellation；只有 Delete Pending，且 Delete Pending 必須移除整筆 `PENDING`／`REJECTED` transaction並釋放其全部適用pending facts。

## What Changes

- 以統一 Excess Policy 支援 A3、A3S、B3 的 Covered／Excess split、allowance validation、pending reservation 與 Approved Excess cumulative ledger；A8／A9不修改。
- 以 Import LC 與 Export Confirmation 為各自 allowance owner；A3S以`Base Parent Tight Available + Current SG Redemption Amount`計算Effective Capacity，並先淨除本筆自身SG redemption及LC UTILIZE legs，防止self-leg double counting。
- **BREAKING**：A3／A3S／B3在兩個policy限額均大於零時可使用Excess；projected total超限仍回傳`EXCESS_LIMIT_EXCEEDED`並fail-before-write。
- 在Maker Submit及每一適用Checker decision point分別重新估值：B3自身Checker Release；A3／A3S Checker Acknowledge；以及其後A4／A6 final Checker Release。
- A4／A6／B4引用正數Excess時，使用同一`ABSENT + Checker Approve`操作；未勾選時Release disabled，勾選後按既有FX、allowance、eligibility及Maker／Checker規則Release。
- A3／A3S LC UTILIZE、B3 earmark及A4／A6／B4 finalisation只以locked Covered Amount影響formal capacity；Excess只進Excess ledger／attribution，不得令Tight為負或再次扣減capacity。
- B4建立Export Asset時執行all-or-nothing authorization validation；不足額授權視為無有效授權，完整Excess歸Beneficiary／Recourse Party，不建立partial split、事後debtor conversion或外部lookup服務。
- Sight／Usance B4的Covered Asset沿用`Due from Issuing Bank`／`Reimbursement Receivable`，Excess另建`EXPORT_EXCESS_ASSET`，兩腿總額等於Legal Amount。
- Maker FX unavailable/stale 時回傳 `FX_RATE_UNAVAILABLE`／`FX_RATE_STALE`，不建立 transaction 或 reservation；Checker FX unavailable/stale 時禁止 Release，但保留既有 pending transaction／reservation。
- Formal Increase 只提供 Minimum Required Increase 指引並讀取既有 A2／B2 Checker-released Approved Contractual Maximum；不修改 A2／B2 processing、不新增 Cure／Allocation transaction，也不減少或改寫既有 Approved Excess history。
- 本期不新增 Return Documents、partial return、partial cancellation 或 Approved Excess reversal。Delete Pending 是唯一的撤回能力，只適用整筆 `PENDING`／`REJECTED` transaction，並原子全額釋放該 transaction 的 Pending Excess Reservation；Approved transaction／Approved Excess 不可 Delete、不可部分反轉。
- Reject 保留 Pending Excess Reservation；Delete Pending 才釋放。Maker Resubmit 必須沿用原 business event／pending identity 並原子替換 reservation，不得重複建立。
- A3S 採順序式引導：先要求使用者 re-select eligible SG、永不 auto-select；重算後仍不足才顯示新的 Minimum Required Increase 並引導既有 A2。
- 將 Excess decision status、workflow status、accounting status、contract status 分離，並擴充 API、Inquiry、UI、Business Case Runner 與 regression evidence。
- 建立 Downstream Eligibility contract；Payment、Settlement、Honour、Acceptance及A3S redemption完成不得自動釋放Approved Excess。

## Capabilities

### New Capabilities

- `excess-allowance-control`：Covered／Excess 計算、owner allowance、pending reservation、approved utilization、Minimum Required Increase guidance 與 full Delete Pending boundary。
- `currency-exchange-integration`：Booking Rate request／response、Approved／Effective、Freshness、Maker／Checker failure semantics 與 FX audit snapshot。
- `downstream-excess-eligibility`：Approved Excess 對 downstream 交易的 eligibility 與不可自動釋放規則。
- `accounting-mapping-and-vouchers`：既有Covered Asset mappings、dedicated Export Excess Asset、debtor attribution、atomic voucher reconciliation。

### Modified Capabilities

- `import-lc-transactions`：A3／A3S Excess、A3S normalized sufficiency、Acknowledge locked split、A4／A6 ABSENT Checker approval與no Return Documents。
- `export-confirmation-transactions`：B3 Excess locked split、B4 authorization validation、Covered／Excess Asset split與no Return。
- `maker-checker-control`：Submit reservation、Release revaluation、統一Checker Approve gate與fail-closed atomicity。
- `earmark-linked-transactions`：A3S淨除本筆自身SG redemption與LC UTILIZE legs；SG lifecycle沿用`main`。
- `balance-calculation`：Covered／Excess 與 pending／approved excess aggregates。
- `contract-movement-model`：Excess／FX immutable events、status separation、idempotency contract。
- `http-api-and-inquiry`：typed errors、FX／Excess fields、history 與 eligibility response。
- `transaction-builder-ui`：Excess preview、block reason、FX result 與 Checker review evidence。
- `business-case-runner`：V4 positive、boundary、reject、revaluation、full Delete Pending 與 regression cases。

## Scope

範圍包含A3／A3S／B3 owner-level allowance、A3S normalized Covered／Excess calculation及locked snapshot、A4／A6／B4統一ABSENT Checker approval、B4 Export authorization backend compatibility、dedicated Excess Asset、`balance-account-mappings.json`、accounting vouchers、Business Case Runner、API、Data Model、UI、Audit與Regression。Return Documents、partial authorization split、external authorization lookup、partial cancellation、Approved Excess reversal、A8、A9及既有A2／B2 processing明確不在修改範圍。

## Non-Goals

- 不引入 `FX_RATE_PENDING` transaction state。
- 不把 `lc-payment-wc` 的 demo FX table 當作 production Currency Exchange source；本期會把它擴充為可供測試的虛擬 Currency Exchange adapter。
- 不修改A8、A9、A3S SG Redemption、SG Available Balance更新、SG Account Entries、SG legal／contingent liability或capacity restoration lifecycle；全部沿用current spec／`main`。本Change僅消費main產生的Current SG Redemption Amount並normalize本筆self legs。
- 不在本 Proposal 實作程式、DB migration、OAS 或測試。
- 不擴充至 SBLC、LG 或 V4 未列的 transaction functions。
- 不新增 `FORMAL_INCREASE_REGULARIZATION`、Excess Allocation／Cure command 或 allocation ledger；不以 Formal Increase 回寫 Approved Excess。
- 不新增 `RETURN_DOCUMENTS` command、`RETURN_REVERSAL`／`CANCELLATION_REVERSAL` event、partial return／cancellation amount 或 Approved Excess reduction capability。

## Business Decision Record

### BD-01 — Maker FX Fail-Closed（已確認）

非 USD allowance owner 的 A3／A3S／B3 Maker Submit 必須取得 Approved、Effective 且 fresh 的 USD→owner Booking quote 與 provider `convertedAmount`。Rate 不存在、未 Approved／Effective 時回傳 `FX_RATE_UNAVAILABLE`；rate 超過 Max Staleness 時回傳 `FX_RATE_STALE`。兩者均代表 Excess Limit Validation 未完成，且不得建立 Pending Transaction 或 Pending Excess Reservation。

每一適用Checker decision point必須以當時最新可用rate重新估值；若unavailable／stale，該Acknowledge或Release不允許，但既有Pending Transaction與Pending Excess Reservation保留。本期沒有FX pending workflow state。

### BD-02 — Virtual Booking Rate（已確認）

開發與 Regression 使用類似 `lc-payment-wc` 的虛擬 Currency Exchange service。其 direct USD→owner quote 必須提供 `BUY_RATE`、`SELL_RATE` 與 `BOOKING_RATE`；若 source fixture 沒有獨立 Booking Rate 欄位，service 以 exact decimal 計算 `BOOKING_RATE = (BUY_RATE + SELL_RATE) / 2`，並依 target owner currency precision 回傳 `convertedAmount`。此衍生規則只適用於 non-production virtual service／regression fixture。Production 必須取得 provider-supplied BOOKING rate 及 Approved／Effective／Freshness evidence，且不得由 Buy／Sell midpoint、反向 quote 或其他 rate 推導。唯一允許的 production fallback 是 BD-05 明確授權且仍符合完整 controls 的 provider-supplied PBD `BOOKING`；其他缺失依 BD-01 fail closed。

### BD-03 — Zero Allowance Legacy Fallback（已確認）

若 resolved `ExcessPolicyConfig` 的 `configuredMaximumUsd = 0` 或 `allowancePercentage = 0`，其規範性業務語意是該 allowance owner **不允許任何超押**，並非 allowance 已啟用但耗盡。A3／A3S／B3 SHALL 使用變更前的既有 Tight Available／sufficiency 邏輯；只要 Amount 超過既有可用額度，即維持既有 `409 INSUFFICIENT_AVAILABLE_BALANCE` error code、message 與 zero-write 行為。

此路徑 SHALL NOT 呼叫 Currency Exchange、執行 Excess allowance validation、建立 FX snapshot、Pending Excess Reservation、Approved Excess 或其他 Excess ledger event，亦 SHALL NOT 回傳 `EXCESS_LIMIT_EXCEEDED`。這是明確的 legacy-routing configuration contract，不得把零值解釋為「啟用但 allowance 已耗盡」。

### BD-04 — A3S Sequential Guidance（已確認）

A3S 不同時顯示目前 SG 選擇下的 Minimum Required Increase。系統先提示可依main既有流程re-select Eligible SG，禁止自動選擇；使用者重新選擇後，以新的Current SG Redemption Amount與重新normalized A3S Base Parent Tight Available重算Effective Presentation Capacity。只有重算後仍不足時，才顯示新的Minimum Required Increase並引導既有A2。

### BD-05 — Previous Business Day Booking Rate Fallback（已確認）

PBD fallback 只允許 provider-supplied `BOOKING` rate，且具 `fallbackPolicyId`／`fallbackPolicyVersion` 的 effective-dated FX Policy 必須明確授權。Rate 必須為 Approved／Effective 並通過 Freshness／Max Staleness；系統保存 policy ID/version、fallback reason、rate date 與 rate source。任一條件不滿足即依 BD-01 fail closed。Balance Component 禁止自行推導、倒算、使用 midpoint 或未授權 stale rate。

### BD-06 — Over-limit Submit Fail-before-write and Formal Increase Boundary（2026-09-23 修訂）

Excess-enabled 且 limit 可計算但 projected total 超限時，Maker Submit SHALL 以 HTTP `409` 與 `EXCESS_LIMIT_EXCEEDED` 拒絕，並保持 zero-write：不得建立或修改 movement、Pending Excess Reservation、FX／decision snapshot、Excess ledger event、audit-as-transaction fact 或 idempotent success。此規則適用 A3、A3S、B3 的 initial Submit 及會令 replacement 超限的 Fix／Resubmit。先前核准的 HTTP `201`／`PENDING`／`LIMIT_EXCEEDED`／`BLOCKED` over-limit persistence contract 由本修訂明確取代。

Minimum Required Increase 僅可隨 rejected command response 作為 current-snapshot guidance，使用與正式重驗相同的 capacity、allowance、FX、rounding 與 committed-excess predicate；不自動建立或修改 A2／B2。無有限解時明示「increase alone cannot resolve」，FX 造成的 breach 必須被標示。使用者完成既有 A2／B2 Increase 後，必須重新 Submit 原業務輸入並以當時最新 Approved Contractual Maximum 完整驗證；系統不得保存一筆 blocked over-limit transaction 供日後 cure。Formal Increase 不新增 cure transaction、不減少 Approved Excess history。

### BD-07 — Full Delete Pending Only; No Return Documents（已確認）

現行產品沒有 Return Documents、partial return、partial cancellation 或 Approved Excess reversal。本期不得新增上述 command、API、UI、event type 或 ledger effect。唯一撤回能力是既有 Delete Pending：只接受整筆 `PENDING` 或 `REJECTED` A3／A3S／B3，將整筆 transaction 轉為 `DELETED`，並在同一transaction全額釋放該movement的Pending Excess Reservation，同時保留deletion audit。Delete Pending 不接受 amount，不得部分執行，且不得用於 `APPROVED`／`RELEASED` movement；Approved Excess 不因本期任何 return／cancellation／downstream 行為減少。

### BD-08 — Fix Pending Atomic Amount Replacement（已確認）

Fix Pending 是同一 pending identity 的整筆金額替換，不是 partial return。Pending transaction aggregate 使用 `Current Pending Total - Old Pending Transaction Amount + New Pending Transaction Amount`；對 Excess-enabled owner，Pending Excess aggregate 同步使用 `Current Pending Excess - Old Pending Excess Reservation + New Recalculated Pending Excess Reservation`。A3S replacement必須重新normalize A3S Base Parent Tight Available、重讀Current SG Redemption Amount並重算Effective Capacity／Covered／Excess。兩個 replacement 必須在完整 capacity、FX、allowance與main SG validation成功後於同一 transaction 生效；任一步驟失敗時不得先減舊值，原 pending movement、amount、reservation 與 audit-authoritative snapshot 完全不變。

規範性例：LC Amount／Effective Capacity = `10,000`，原 A3 到單 Amount = `10,200`，原 Pending Excess = `200`。Fix Pending 改為 `10,300` 時，新 Pending Excess = `300`（舊 `200` 被替換，不得累加成 `500`）；改為 `10,100` 時，新 Pending Excess = `100`（不得保留舊 `200`）。新 `300`／`100` 分別再依當時完整 allowance、FX 與 committed-excess facts 判定 decision。

### BD-16 — Percentage Allowance Uses Face Amount, Excluding Tolerance（2026-09-23 業務更正）

Import A3／A3S 的 Percentage Allowance SHALL以目前已核准 LC face amount（包含已完成 A2 對 face amount 的正式增減，但不包含 Amount Tolerance 所增加的 drawing capacity）乘以 allowance percentage。Tolerance 只參與 authoritative Covered capacity，不得擴大 Percentage Allowance base。Export B3 對應使用目前已核准 Confirmation face amount。例：LC Amount `10,000`、Tolerance `10%`、allowance `2%` 時，Covered capacity為 `11,000`，Percentage Allowance為 `200`；Arrival `11,200` 的Excess `200`可在其他上限亦容許時通過，Arrival `11,201` 的Excess `201` SHALL以`EXCESS_LIMIT_EXCEEDED` zero-write拒絕。

Import `LC Amount = Issue LC Amount + cumulative formal／Checker-approved Increase - cumulative formal／Checker-approved Decrease`，其中Increase／Decrease使用各自核准金額的非負magnitude。只有已完成Checker Release、已正式生效的A2 amount amendment可進入累計；`PENDING`、未核准、`REJECTED`或`DELETED` amendment均不得改變LC Amount。Tolerance、tolerance-only及expiry-only amendment亦不屬於LC Amount。

### BD-09 — A3／A3S Two-stage Approval Timing（已確認）

A3／A3S 沿用既有兩階段產品 lifecycle。Maker Submit 成功時建立 Pending Excess Reservation；Checker Acknowledge鎖定本次Legal Amount、Covered Amount、Excess Amount及calculation snapshot，LC UTILIZE movement仍為`PENDING`，Pending Excess Reservation不得在Acknowledge時轉為Approved Excess。A3S snapshot另保存normalized A3S Base Parent Tight Available、Current SG Redemption Amount及Effective Presentation Capacity。Sight A4或Usance A6 final Release只用locked split重估FX、Allowance及release eligibility；正數Excess以統一`ABSENT + Checker Approve`操作核准，不得因parent Tight或capacity變化重新拆分或改寫Covered／Excess。成功後才在同一transaction將Pending Excess Reservation轉為Approved Excess並finalise locked Covered Amount。

A3S SG Redemption、SG Available Balance及Account Entries完全依main執行；Acknowledge只鎖定其計算輸入與Covered／Excess snapshot，A4／A6不得重新執行capacity split。B3仍在自身Checker Release時轉Approved。

### BD-10 — A3／A3S Post-Acknowledge Amount Fix Prohibited（V2已確認）

A3及A3S只可在Checker Acknowledge前依BD-08對整筆pending Amount執行原子Fix replacement；一旦`acknowledgedAt != null`，Maker不得再Fix／Resubmit Amount。UI MUST將Amount保持protected；API MUST在policy／FX／allowance與write之前以HTTP`409`／`ILLEGAL_STATE_TRANSITION`拒絕post-Acknowledge Amount Fix／Resubmit，且不得修改movement、amount、Pending Excess Reservation、locked Legal／Covered／Excess及calculation snapshot。A3S另不得修改Base Parent Tight、Current SG Redemption Amount、Effective Capacity或main SG facts。BD-07整筆Delete Pending仍依其既有契約處理；remarks-only correction仍由既有function policy決定。

### BD-12 — Business Case Runner-only Automatic A02／B02（已確認）

僅Business Case Runner的指定demo驗證案例，在A3／A3S／B3收到HTTP `409 EXCESS_LIMIT_EXCEEDED`且guidance為`FINITE`時，依Minimum Required Increase自動建立並Release A02／B02，再fresh Submit。

### BD-13 — Applicant Waiver Before A4／A6 Release（SUPERSEDED）

本規則由BD-17的2026-09-24 BUG決策取代；A4／A6不再要求或保存Applicant Waiver `CONFIRMED`。

### BD-14 — Export Authorization All-or-Nothing（已確認）

Export authorization不做partial split。B4建立Sight／Usance資產時，只有reference存在、authorizedAmount大於或等於完整Excess、currency等於owner currency、Checker不同於Maker且人工validation result為`CONFIRMED`時，完整Excess debtor才可為Issuing Bank；authorization absent、partial、currency mismatch或not confirmed時，完整Excess debtor為Beneficiary／Recourse Party。`Checker == Maker` SHALL拒絕整個B4 Checker action並zero-write，不得降級為Recourse。不得新增外部authorization lookup service或事後debtor conversion。先前「B3為唯一authorization decision point、B4只讀snapshot」contract由FROZEN V2明確取代。

### BD-15 — Dedicated Export Excess Asset（已確認）

Sight Covered Asset沿用`Due from Issuing Bank`，Usance Covered Asset沿用`Reimbursement Receivable`；Excess一律另用`EXPORT_EXCESS_ASSET`，debtor只作attribution，即使debtor為Issuing Bank亦不得併回Covered Asset。Covered Asset + Excess Asset MUST等於Legal Amount。

### BD-17 — Unified Checker Excess Approval UI（2026-09-24 已確認）

所有正數Excess的A4／A6／B4 Checker畫面與操作 SHALL以B4為標準，使用完全相同的簡化流程：`Excess Review`、event-level `This Exceed Amount`、紅色`Checker Approve`、Checker ID、Release／Reject／Account Entries。三者外部waiver／authorization claim均預設`ABSENT`；未勾選時Release disabled，勾選後可依其他權威Release gates繼續。A4／A6不要求、不建立亦不保存Applicant Waiver confirmation／snapshot。B4固定以`claimStatus = ABSENT`及`authorizationValidationResult = NOT_CONFIRMED`送出，完整Excess debtor依BD-14歸屬`BENEFICIARY_OR_RECOURSE_PARTY`。既有B4 Submitted-authorization API／data model／backend validation contract保留，但不在本demo UI暴露。

### V2 Downstream Accounting Contract（已確認）

A6保存完整Legal Acceptance Amount與Acknowledge locked Covered／Excess attribution，不新增capacity-control running balance；A7只減少Legal Acceptance Outstanding，不採Covered-first、Excess-first或pro-rata重新配置，也不減少Approved Excess。B5同樣只處理Legal Acceptance Outstanding settlement，不得自動clear、merge或重新分類B4的Covered Asset／`EXPORT_EXCESS_ASSET`，亦不得減少Approved Excess。

## Migration and Rollback

- 以 additive tables／columns 與 backfill verification 導入 Excess／FX facts；既有歷史 movement 不得推測為 Approved Excess。
- 在implementation獲准後，`OVERDRAWN` branch SHALL移除所有僅因本Change而加入的scope-excluded transaction diffs；此清理不得藉機重新定義其行為，且須以current spec及`main` baseline regression證明沒有受本Change影響。A3／A3S／B3 policy gate獨立啟用。
- 一旦建立 Approved Excess events，不得藉 rollback 刪除、重寫或反轉；rollback 只能停止新 Excess Submit，既有 pending／approved records 仍須可查詢，Pending／Rejected 僅能依整筆 Delete Pending 處理。
- `configuration-first-product-extension` 可提供 metadata／typed policy registry，但本 Change 不依賴其完成；若同時合併，本 Change 的 V4 typed policies 與 immutable core controls 優先。

## Impact and Review Gate

受影響層包含Angular、Backend proxy、Balance microservice、OAS、`balance-account-mappings.json`、accounting vouchers、Business Case Runner與OpenSpec。2026-09-23 Final Change Update將先前scope-excluded transaction內容完全移出本Change；本次規劃文件必須重新完成BA、4-Eyes、QA、strict validation及Change Approval。新的Approval PASS前禁止implementation；工作仍只可在`OVERDRAWN`，禁止影響`main`。
