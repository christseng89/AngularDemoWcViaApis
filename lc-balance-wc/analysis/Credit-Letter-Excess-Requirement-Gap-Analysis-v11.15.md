# 信用證超押處理 Requirement Gap Analysis

## 1. 文件控制

| 項目 | 值 |
|---|---|
| 唯一業務基準 | `信用證超押處理業務需求_v11.15_Final_Business_Input.docx` |
| 基準狀態 | FROZEN / READY FOR OPENSPEC CHANGE PROPOSAL |
| 分析日期 | 2026-09-22 |
| 分析範圍 | Current OpenSpec、Microservice／Angular Source Code、Microservice／Channel OpenAPI、SQLite Data Model、Unit／UI／Business Case Tests |
| 本輪限制 | 只分析；未修改 Source Code 或 OpenSpec artifacts |
| Current Conformance 結果 | **FAIL — 現況不符合 v11.15** |
| Gap Analysis Review 狀態 | **PENDING — 等待 Reviewer 明確 PASS** |

本報告只以 v11.15 FROZEN Business Input 判定應然行為。Current OpenSpec、API、Code、Data Model 與 Tests 僅作為現況證據，不能覆蓋 v11.15。

## 2. 分類定義

| 分類 | 定義 |
|---|---|
| `ALIGNED` | 現況已完整實作且有足夠跨層證據支持 v11.15 要求。 |
| `REQUIRES_CHANGE` | 現況有可重用機制，但資料、語義、作用範圍或流程不足以符合 v11.15。 |
| `MISSING` | 現況沒有相應規格、模型、API、實作或測試。 |
| `CONFLICT` | 現況明文規格、實作或測試要求與 v11.15 相反。 |
| `NOT_PROVEN` | 可能部分存在，但目前證據不足以證明端到端符合；不得推定已完成。 |

## 3. Executive Summary

Current conformance 結論為 **FAIL**。目前系統是「超過 Tight Available 即拒絕」模型；v11.15 要求改為「Covered + Excess、Submit 成功、Pending Excess 立即佔額、超限 Block、Checker Reject-only」模型。這是核心狀態機、金額計算、持久化及 API 合約的替換，而不是局部欄位增補。本 Gap Analysis 文件本身仍為 `PENDING REVIEW`；只有 Reviewer 明確接受本報告後，才進入 OpenSpec Change Proposal。

主要阻斷如下：

1. Current OpenSpec 對 A3、A8、B3 明文要求超額 Submit 失敗，與 v11.15 直接衝突。
2. Angular 與 Microservice 都在 Submit 前／Submit 時拒絕 A3、A8、A3S、B3 超額；現有測試也固定此舊行為。
3. Data Model、API 與 Code 沒有 Excess Allowance、Pending／Approved／Total Committed Excess、Blocked 狀態、A8-linked attribution 或 FX Decision Snapshot。
4. Current A3S anti-double-counting 透過建立並 Release `SHGT PARTIAL_REDEEM/FULL_REDEEM` 來釋放 SG exposure；v11.15 明確要求 Eligible SG Capacity tracking 與 SG 法律／或有負債 lifecycle 分離，因此屬直接衝突。
5. 現有 Maker／Checker 四眼控制及 transaction boundary 可重用，但沒有 EXCESS_LIMIT_EXCEEDED 的 Reject-only Release gate。
6. 現有 Fix Pending 具備 transaction 與 A3S compound correction，但 Amount edit 是一般化能力，不是僅限 A8/A3/A3S/B3；也沒有 Excess atomic replace 與 retry idempotency contract。
7. Currency Exchange OUTBOX／INBOX、BOOKING rate、freshness、fallback policy、revaluation breach 與 audit snapshot 全部缺失。
8. Downstream eligibility 只判斷現有 source status／tenor／consumption，沒有 Excess within-limit／blocked 維度。

## 4. 現況證據摘要

### 4.1 Current OpenSpec

- A3 超過 Tight Available 必須拒絕：`openspec/specs/import-lc-transactions/spec.md:51-55`。
- A8 超過 Parent Tight Available 必須拒絕且不得建立 SHGT movement：`openspec/specs/import-lc-transactions/spec.md:119-133`。
- B3 超過 Confirmation Tight Available 必須拒絕且不得建立 earmark：`openspec/specs/export-confirmation-transactions/spec.md:39-53`。
- Fix Pending 保護 monetary fields：`openspec/specs/maker-checker-control/spec.md:54-68`。
- Current A3S 只規定 selected SG atomic redemption 與避免重複扣 capacity：`openspec/specs/import-lc-transactions/spec.md:57-70`、`openspec/specs/earmark-linked-transactions/spec.md:68-81`。
- Current balance sufficiency 要求超過 capacity 時拒絕：`openspec/specs/balance-calculation/spec.md:67-80`。

### 4.2 Source Code／Data Model／API

- Submit 在 sufficiency failure 時丟出 `InsufficientBalanceError`：`microservices/balance-component/src/service/balanceService.ts:674-691`。
- A3 hard-reject：`microservices/balance-component/src/domain/offBalanceExposure.ts:285-314`。
- A8 hard-reject：`microservices/balance-component/src/domain/offBalanceExposure.ts:93-112`。
- B3 hard-reject：`microservices/balance-component/src/domain/offBalanceExposure.ts:200-221`。
- UI 同樣阻止 A3/A3S/A8/B3 超額 Submit：`src/app/transaction-builder/submit-rules.ts:261-301`。
- A3S 由 UI 建立 SG `PARTIAL_REDEEM/FULL_REDEEM` 與 LC `UTILIZE` compound：`src/app/transaction-builder/maker-submit.service.ts:89-113`。
- SG redemption 直接減少 off-balance exposure：`microservices/balance-component/src/domain/offBalanceExposure.ts:59-79`。
- Current movement status 只有 PENDING／RELEASED／REJECTED／CANCELLED：`microservices/balance-component/src/types.ts:59`、`microservices/balance-component/src/db/schema.ts:53`、`analysis/balance-component-api.yaml:2671-2677`。
- `BalanceMovement` 沒有 Excess／FX 欄位：`microservices/balance-component/src/types.ts:154-226`；DB movement columns 同樣缺失：`microservices/balance-component/src/db/schema.ts:144-265`。
- `BalanceSnapshot` 只提供 current balance／exposure／present-docs earmark：`microservices/balance-component/src/types.ts:452-481`；API mirror：`analysis/balance-component-api.yaml:3391-3494`。
- Repository scope 內搜尋不到 `excess`、`EXCESS_LIMIT_EXCEEDED`、`bookingRate`、`rateTimestamp`、`maxStaleness`、Currency Exchange OUTBOX／INBOX 或 `fxRevaluation` 的有效實作／合約定義。

### 4.3 Tests

- Microservice hard-reject tests：`microservices/balance-component/test/unit/domain/offBalanceExposure.test.ts:82-170`、`:179-247`、`:249-311`。
- Angular hard-block tests：`src/app/transaction-builder/submit-rules.spec.ts:321-404`。
- Generic A3 Amount Fix Pending 與超額 edit rejection：`microservices/balance-component/test/unit/service/balanceService.test.ts:2678-2811`。
- A3S Fix Pending 目前重算 SG legal redemption leg：`microservices/balance-component/test/unit/service/balanceService.test.ts:3388-3500`。
- Maker／Checker separation tests：`microservices/balance-component/test/unit/domain/statusTransition.test.ts:4-47`。

針對性執行結果：Microservice 3 suites／53 tests PASS；Angular 2 suites／120 tests PASS。命令最終非零是因只跑局部 suites 未達專案 95% global coverage threshold，以及 Angular coverage report 檔案鎖定；不是測試失敗。

## 5. Detailed Alignment Matrix

### 5.1 Unified Excess Framework 與 A8／A3／A3S／B3

| ID | v11.15 Requirement | 分類 | Current Evidence | Gap／判定 |
|---|---|---|---|---|
| EX-01 | 四功能共用 Covered + Excess Model | `MISSING` | Current movements 只保存 `amount`／`ceilingAmount`（`types.ts:154-185`） | 無 coveredAmount、excessAmount 或共用 Excess domain policy。 |
| EX-02 | `Covered = MIN(Transaction Amount, Effective Capacity)` | `MISSING` | Current sufficiency 回傳 pass／fail，不回傳 split（`offBalanceExposure.ts:93-112,200-221,285-314`） | 需要新的 Decimal-based split calculation。 |
| EX-03 | `Current Excess = MAX(0, Amount - Effective Capacity)` | `MISSING` | 同上 | 沒有計算、持久化或 response field。 |
| EX-04 | A8 Amount 超過 Tight Available 仍 Submit，超出部分為 Excess | `CONFLICT` | OpenSpec 要求拒絕（`import-lc-transactions/spec.md:129-133`）；Code hard-reject（`offBalanceExposure.ts:93-112`） | 必須替換現行 A8 sufficiency outcome。 |
| EX-05 | A3 Amount 超過 Tight Available 仍 Submit，超出部分為 Excess | `CONFLICT` | OpenSpec 要求拒絕（`import-lc-transactions/spec.md:51-55`）；Code hard-reject（`offBalanceExposure.ts:285-314`） | 必須替換現行 A3 sufficiency outcome。 |
| EX-06 | A3S 可超過 Tight + Eligible SG Capacity 並形成新增 Excess | `CONFLICT` | UI 在 Amount 超過 Tight + SG Balance 時阻止 Submit（`submit-rules.ts:295-300`）；backend 最終仍走 UTILIZE hard-reject | v11.15 要接受並拆分 excess。 |
| EX-07 | B3 超過 Confirmed Tight Available 仍 Submit並形成 Excess | `CONFLICT` | OpenSpec 要求拒絕（`export-confirmation-transactions/spec.md:49-53`）；Code hard-reject（`offBalanceExposure.ts:200-221`） | 必須替換現行 B3 sufficiency outcome。 |
| EX-08 | 只有 Covered Amount 影響 formal LC／Confirmation／SG covered exposure | `REQUIRES_CHANGE` | Current movement 的完整 `ceilingAmount` 進入 balance／earmark（`balanceService.ts:700-729`） | 需要明確 covered movement effect；excess 必須獨立保存。 |
| EX-09 | Excess 不得令 formal balance 為負 | `REQUIRES_CHANGE` | Current 系統以拒絕確保不為負（`balance-calculation/spec.md:67-80`） | 不變量方向正確，但必須改成 split 而非拒絕。 |
| EX-10 | Pending／Approved Excess 不增加 Contractual Amount | `MISSING` | 無 Excess ledger／aggregate | 無法證明或執行。 |
| EX-11 | A8/A3/A3S/B3 Excess Amount 為 protected system value | `MISSING` | Angular model／API 無 excess field | 必須新增 response/display field，且 request 不得接受 caller override。 |

### 5.2 Allowance、Cumulative Commitment 與資料模型

| ID | v11.15 Requirement | 分類 | Current Evidence | Gap／判定 |
|---|---|---|---|---|
| ALW-01 | Contractual Maximum Amount 為 allowance percentage basis | `NOT_PROVEN` | Current有 tolerance ceiling，但沒有命名／API contract 對應 Excess contractual maximum | Proposal 必須明確引用現行 authoritative balance definition，避免另算一套。 |
| ALW-02 | Percentage Allowance = Contractual Amount × % | `MISSING` | 無 allowance config／formula | 新 domain calculation。 |
| ALW-03 | Effective Limit = MIN(Percentage Allowance, USD Equivalent Cap) | `MISSING` | 無 USD cap 或 FX converted cap | 新 domain／integration calculation。 |
| ALW-04 | Available Allowance = MAX(0, Limit − Total Committed Excess) | `MISSING` | 無 aggregate | 新 aggregate／query field。 |
| ALW-05 | Pending Excess Submit 後立即佔用 allowance | `MISSING` | 無 reservation entity／columns | 需 transactionally persist before response。 |
| ALW-06 | Approved Excess 為 LC／Confirmation-level cumulative utilization | `MISSING` | 現行 Present Docs earmark／SG exposure 是不同概念 | 不得把現有 earmark 欄位改名冒充 Excess。 |
| ALW-07 | A8/A3/A3S 共用 Import LC-level allowance；B3 使用 Confirmation-level allowance | `MISSING` | 無 owner scope／aggregate key | Data model 必須定義 allowance owner 與唯一性。 |
| ALW-08 | Partial Shipment／Multiple Presentations 不得循環重用 Approved Excess | `MISSING` | Current B3 approved earmark在 B4 consumption 後移除（`offBalanceExposure.ts:235-253`） | Present Docs earmark 可以完成；Approved Excess 則必須獨立持續存在。 |
| ALW-09 | Event 保存 Amount、Capacity Before、Covered、Excess、Excess Status | `MISSING` | `BalanceMovement`／DB／OAS 無這些欄位 | 需要 schema migration、types、store、OAS、snapshot。 |
| ALW-10 | 查詢提供 Pending／Approved／Total Committed Excess | `MISSING` | `BalanceSnapshot` 無相應欄位（`types.ts:452-481`） | Microservice／Channel API 與 UI 都需新增。 |

### 5.3 A8 → A3S Anti-double-counting 與 SG Lifecycle Boundary

| ID | v11.15 Requirement | 分類 | Current Evidence | Gap／判定 |
|---|---|---|---|---|
| SG-01 | A3S 必須選取特定有效 SG 且 Outstanding > 0 | `ALIGNED` | OpenSpec `import-lc-transactions/spec.md:57-70`；UI selection tests `submit-rules.spec.ts:275-320` | 現有 selection/eligibility 骨架可保留。信心 0.95。 |
| SG-02 | A3S Effective Capacity = Tight + selected Eligible SG Capacity Outstanding | `REQUIRES_CHANGE` | UI 使用 Tight + SG confirmed balance（`submit-rules.ts:295-299`）；backend 以 matched pending redemption 淨除 exposure（`offBalanceExposure.ts:41-68`） | 數學意圖接近，但正式欄位與獨立 capacity tracker 不存在。信心 0.90。 |
| SG-03 | A3S Bill Amount 必須覆蓋 required SG redemption | `ALIGNED` | Release 時重新驗證（`balanceService.ts:805-813`）；UI tests `submit-rules.spec.ts:310-320` | 可重用，但後續不能再等同 legal redemption。信心 0.95。 |
| SG-04 | A3S capacity redemption 與 SG legal／contingent liability discharge 分離 | `CONFLICT` | UI 建立真實 `SHGT PARTIAL_REDEEM/FULL_REDEEM`（`maker-submit.service.ts:89-113`）；Code 直接減少 off-balance exposure（`offBalanceExposure.ts:71-74`） | v11.15 明確禁止這種等同。屬高風險會計／法律語義衝突。 |
| SG-05 | 保存 `Eligible SG Capacity Outstanding` 獨立 tracking | `MISSING` | Contract、movement、snapshot、DB、OAS 均無此欄位 | 需獨立持久化語義，不得用 SG Confirmed Balance 代替。 |
| SG-06 | 保存 A8-linked Excess Attribution | `MISSING` | 無 attribution／linkage data structure | `businessEventId` 只能關聯同次 compound legs，不能表達 A8 excess origin／redemption allocation。 |
| SG-07 | A3S 只新增相對於當時 Effective Capacity 的淨 Excess | `MISSING` | 無 excess calculation／attribution | Current anti-double-subtract 只處理 formal capacity，不處理 allowance commitment。 |
| SG-08 | A3S capacity redemption、attribution、new excess 原子更新 | `REQUIRES_CHANGE` | Compound create 與 A3S Fix Pending 已使用 DB transaction（`balanceService.ts:1025-1037`） | Transaction boundary 可重用；資料與正確 SG lifecycle semantics 缺失。 |

### 5.4 Maker／Checker、Fix Pending、Delete Pending 與 Idempotency

| ID | v11.15 Requirement | 分類 | Current Evidence | Gap／判定 |
|---|---|---|---|---|
| MC-01 | Genuine four-eyes separation | `ALIGNED` | `statusTransition.ts:31-80`；tests `statusTransition.test.ts:16-26` | Release／Reject 已阻止同一 Maker。信心 0.99。 |
| MC-02 | Projected <= Limit：Submit succeeds，Current Excess → PENDING | `MISSING` | 無 projected total／excess state | 新 decision policy。 |
| MC-03 | Projected > Limit：Submit 仍成功並設 EXCESS_LIMIT_EXCEEDED／BLOCKED | `CONFLICT` | Current excess case在 Submit 前被 UI/API 拒絕 | 核心流程反向。 |
| MC-04 | Blocked transaction Checker Release／Approve 不允許；Reject 允許 | `MISSING` | `release()` 對所有 PENDING movement 走一般 release（`balanceService.ts:798-904`）；無 excess gate | 必須服務端權威 enforce，UI 只能 mirror。 |
| MC-05 | Reject 後 Pending Excess 繼續佔用 allowance | `MISSING` | 無 Pending Excess ledger；current aggregates多數排除 REJECTED | 需明確 excess lifecycle，不能依 movement status filter 推斷。 |
| MC-06 | A8 blocked 時不可 Issue；A3/A3S/B3 blocked 時不可進 downstream selection | `MISSING` | 無 blocked marker或 eligibility dimension | 需 query + command-time 雙層控制。 |
| MC-07 | Fix Pending Amount exception 僅限 A8/A3/A3S/B3 | `CONFLICT` | Current `EditMovementRequest.amount` mandatory（`balanceService.ts:121-148`）；generic edit重算所有 movement（`:1040-1074`） | 現有能力範圍過寬；Current OpenSpec 又宣稱 monetary protected，規格與 code 內部也有 drift。 |
| MC-08 | Fix Pending = old excess atomic replace，不能先釋放 old | `REQUIRES_CHANGE` | Current edit在一個 DB transaction（`balanceService.ts:1027-1037`），A3S compound correction亦原子 | 可重用 transaction pattern；沒有 excess reservation replace。 |
| MC-09 | A3S Fix Pending 重驗 SG eligibility/outstanding/attribution | `REQUIRES_CHANGE` | Current A3S compound edit重算 SG redeem；tests `balanceService.test.ts:3423-3500` | Eligibility骨架存在，但 attribution與capacity/legal split缺失。 |
| MC-10 | Delete Pending 精確釋放該 Event Pending Excess並保留 audit | `REQUIRES_CHANGE` | Delete audit 已存在（`balanceService.ts:923-965`） | Audit aligned；無 excess reservation可精確釋放。 |
| MC-11 | Single movement Submit retry不得重複 movement | `ALIGNED` | `(balanceContractId,eventSeq)` unique（`schema.ts:268-272`）；duplicate returns existing（`balanceService.ts:633-636`） | 對單一 movement、caller重用同一 eventSeq時成立。信心 0.95。 |
| MC-12 | Compound／double-click Submit exactly-once | `NOT_PROVEN` | `businessEventId`與 compound transaction存在，但 UI A3S用 `crypto.randomUUID()`及 `Date.now()` 產生新 identity（`maker-submit.service.ts:89-106`） | 重新發起而非 transport retry時可能產生新 identities；需明確 idempotency contract。 |
| MC-13 | Fix Pending retry只能 replace 一次 | `NOT_PROVEN` | Current每次 `editPending` 均可再次 edit同一 PENDING row並新增 audit（`balanceService.ts:975-1037`） | 無 request idempotency key／dedupe evidence。 |

### 5.5 Formal Increase、Return／Cancellation 與 History

| ID | v11.15 Requirement | 分類 | Current Evidence | Gap／判定 |
|---|---|---|---|---|
| FI-01 | Formal LC／Confirmation Amount Increase 存在 | `ALIGNED` | A2／B2 OpenSpec及 monetary amendment implementation已存在 | 可作為 formal increase source event。信心 0.95。 |
| FI-02 | Increase 後按最新 Contractual Amount 重算 allowance／effective limit | `MISSING` | 無 allowance／FX limit | 新 post-approval revaluation。 |
| FI-03 | Partial Increase 不足時 Block 不解除 | `MISSING` | 無 blocked state／projected total | 無法執行。 |
| FI-04 | Formal Increase 不 retroactively 改寫既有 Approved Excess history／attribution | `REQUIRES_CHANGE` | Current event snapshot不可變原則已存在（`contract-movement-model/spec.md:24-37`） | 歷史骨架可重用；Excess decision snapshot／attribution不存在。 |
| FI-05 | Rejected transaction 不自動復活，Maker 必須 Resubmit | `ALIGNED` | REJECTED 無 RELEASE transition，只能 EDIT 回 PENDING或 CANCEL（`statusTransition.ts:31-35`） | 流程骨架相符；仍需最新 Excess／FX revalidation。信心 0.95。 |
| FI-06 | 不做 Formal Increase 時 A3/A3S/B3 Return Documents；A8 cancel/delete/non-issuance精確 reverse | `REQUIRES_CHANGE` | Cancel/Delete Pending與audit存在；Return Documents專用 transaction／natural key未見完整 current OpenSpec | Excess精確 reversal與Return flow仍缺。 |
| FI-07 | Approved Excess 只能由 formal regularization 或可追溯 reversal／return／cancellation調整 | `MISSING` | 無 Approved Excess ledger／adjustment event | 需不可變 adjustment model，不能直接改 aggregate。 |

### 5.6 FX Booking Rate、Freshness 與 Revaluation

| ID | v11.15 Requirement | 分類 | Current Evidence | Gap／判定 |
|---|---|---|---|---|
| FX-01 | 非 USD 透過 Currency Exchange OUTBOX／INBOX 取得 USD→LC BOOKING conversion | `MISSING` | Source／OAS／OpenSpec 無 Currency Exchange integration | 全新 integration boundary。 |
| FX-02 | Request／Response 最低欄位與 correlation／idempotency | `MISSING` | 無 schema／table／API | 需 message schemas、outbox/inbox persistence及dedupe。 |
| FX-03 | 只使用 Approved／Effective rate與service `convertedAmount` | `MISSING` | 無 rate representation | 不得以 inverse rate自行推導。 |
| FX-04 | Maker Submit、Fix／Resubmit、Checker Release、Formal Increase 後各自 revalue | `MISSING` | 現有 release revalidation不含FX（`movementReleasePolicyService.ts:27-111`） | 新 decision-point orchestration。 |
| FX-05 | Checker Release 匯率導致超限時轉 BLOCKED／Reject-only | `MISSING` | 無 FX或blocked state | 新狀態轉換與audit。 |
| FX-06 | Rate unavailable／stale 時 fail-safe block Release | `MISSING` | 無 rate freshness policy consumption | 必須服務端權威控制。 |
| FX-07 | Max Staleness來自FX Policy，使用 rateTimestamp而非 receivedTimestamp | `MISSING` | 無 policy identifier／timestamps | 新 policy contract。 |
| FX-08 | Previous Business Day fallback須經授權並保存 policy id/version/reason | `MISSING` | 無 fallback model | 新 audit fields。 |
| FX-09 | FX Decision Snapshot完整保存 | `MISSING` | Current event snapshot沒有 rate／allowance fields | 新不可變 decision snapshot。 |
| FX-10 | Duplicate／out-of-order FX response不得改錯 decision | `MISSING` | 無 inbox／correlation processing | 需要 version／correlation／processed-state規則與測試。 |
| FX-11 | LC Currency=USD不需外部 conversion，可視 rate=1 | `MISSING` | 無 Excess FX decision path | 需明確 fast path及audit表示。 |

### 5.7 Downstream Eligibility

| ID | v11.15 Requirement | 分類 | Current Evidence | Gap／判定 |
|---|---|---|---|---|
| DS-01 | Within-limit Excess 不得令 transaction失去 downstream eligibility | `CONFLICT` | Current excess case根本無法 Submit；A3/A8/B3被拒絕 | 必須接受後才能判定 within-limit eligibility。 |
| DS-02 | Blocked A3/A3S不得被 A4/A6 選取；Blocked B3不得被 B4選取 | `MISSING` | Release policy只檢查 source acknowledged/released/consumed（`movementReleasePolicyService.ts:151-188`） | Query和command-time都需讀 excess decision。 |
| DS-03 | Blocked A8不得 Release／Issue SG | `MISSING` | SHGT PENDING可走一般 release；無 excess gate | 必須在 compound／single release兩條路同時 enforce。 |
| DS-04 | UI Lookup/Catalog與Backend Selection API使用相同規則 | `REQUIRES_CHANGE` | Current已有「query提示＋command-time重驗」原則（`http-api-and-inquiry/spec.md:38-50`） | Framework可重用；Excess/blocked policy尚未加入。 |
| DS-05 | Current A3/A3S/B3 source status／tenor／consumed checks | `ALIGNED` | `movementReleasePolicyService.ts:151-188`及其tests `movementReleasePolicyService.test.ts:112-140` | 這些既有條件應保留並與新 Excess eligibility合併。信心 0.98。 |
| DS-06 | Payment／Settlement／Honour／Acceptance／A3S redemption不自動釋放 Approved Excess | `MISSING` | 無 Approved Excess；Current Present Docs earmark在B4 consumption時會退出（`offBalanceExposure.ts:235-253`） | 必須建立與既有 earmark／legal movement分離的 cumulative ledger。 |

### 5.8 API／Data Model／Audit

| ID | v11.15 Requirement | 分類 | Current Evidence | Gap／判定 |
|---|---|---|---|---|
| DM-01 | Excess event／aggregate persistence | `MISSING` | `schema.ts:87-113,144-265` 無欄位／table | 建議 Proposal 評估獨立 ledger + immutable decision snapshots，而非只在movement加可變 aggregate。 |
| DM-02 | EXCESS_LIMIT_EXCEEDED／BLOCKED 技術與業務狀態分離 | `MISSING` | Movement status只有4值（`types.ts:59`） | Proposal需決定獨立 excess decision status，避免污染workflow status。 |
| DM-03 | Microservice OAS request／response | `MISSING` | `BalanceMovement`、`BalanceSnapshot`、Create/Edit schemas均無 Excess／FX（`balance-component-api.yaml:2841-3050,3150-3290,3391-3494`） | 需完整contract變更與error codes。 |
| DM-04 | Channel API mirror | `MISSING` | `ChannelBalanceSnapshot`／`ChannelTransaction`無 Excess／FX（`balance-component-channel-api.yaml:846-903`） | 需同步 facade contract。 |
| DM-05 | Stable error／decision code | `MISSING` | Current errors只有 insufficient／illegal transition等，無 EXCESS_LIMIT_EXCEEDED／RATE_UNAVAILABLE | Proposal需定義非錯誤Submit result與Release failure semantics。 |
| DM-06 | Audit可重建每次Limit／FX decision | `MISSING` | Current snapshots只含balance；無 allowance/rate/policy version | 必須不可變且與event identity關聯。 |

### 5.9 Regression Coverage

| ID | v11.15 Requirement | 分類 | Current Evidence | Gap／判定 |
|---|---|---|---|---|
| REG-01 | A8/A3/B3 normal／within allowance／exceeded | `CONFLICT` | Existing tests只接受within capacity，超過即expect error（`offBalanceExposure.test.ts:94-170,200-245,272-310`） | 舊expected結果必須由approved delta spec取代，不得直接改測試掩蓋衝突。 |
| REG-02 | A3S covered／exact boundary／incremental excess | `REQUIRES_CHANGE` | 有SG selection與current capacity tests；沒有Excess attribution | 新增三層結果驗證。 |
| REG-03 | Multi-event cumulative Pending + Approved across A8/A3/A3S/B3 | `MISSING` | 無共用Excess ledger tests | 必須cross-function parameterized tests。 |
| REG-04 | Submit overlimit succeeds；Release blocked；Reject-only | `MISSING` | Current tests固定Submit blocked | 新API／service／UI tests。 |
| REG-05 | Fix Pending atomic excess replace與retry exactly-once | `MISSING` | 現有只驗movement／SG redeem correction atomicity | 需old/new reservation與duplicate request tests。 |
| REG-06 | Delete Pending只釋放該event commitment | `MISSING` | 有delete audit tests，無Excess aggregate assertions | 新aggregate invariants。 |
| REG-07 | Formal／partial increase與revalidation | `MISSING` | 無Excess revalidation tests | 必測仍不足／剛好／超過邊界。 |
| REG-08 | Approved Excess不因downstream completion下降 | `MISSING` | Current tests反而驗證B3 earmark consumption | Excess ledger需獨立assert。 |
| REG-09 | A3S capacity tracking不得discharge SG liability | `CONFLICT` | Current A3S tests驗證真實 SG redeem movement及release（`balanceService.test.ts:3388-3500`） | 測試語義必須拆成capacity tracking與instrument lifecycle。 |
| REG-10 | FX appreciation/depreciation、unavailable、fallback、freshness boundary、out-of-order | `MISSING` | 無FX code／tests | v11.15 §24全部待新增。 |
| REG-11 | Maker Submit single-event idempotency | `ALIGNED` | unique index與existing-result path | 保留並擴充Excess reservation assertion。信心 0.95。 |
| REG-12 | Compound／Fix idempotency | `NOT_PROVEN` | 無request idempotency evidence | Proposal必須先定義key與response replay semantics。 |

## 6. Cross-layer Conflict Register

| Conflict | v11.15 | Current OpenSpec／Implementation | 嚴重度 |
|---|---|---|---|
| C-01 Submit semantics | Excess transaction Submit成功 | A3/A8/B3/A3S excess被拒絕 | Critical |
| C-02 A3S liability boundary | capacity tracking不得當成SG legal discharge | 真實建立並Release SG redemption movement | Critical |
| C-03 Checker rule | 超限只能Reject | 所有一般PENDING可Release，無excess gate | High |
| C-04 Formal balance effect | 只有Covered進formal balance | Current完整amount進movement／earmark或整筆拒絕 | High |
| C-05 Fix Pending scope | Amount exception僅四功能 | Generic Edit API／service可改多種movement amount | High |
| C-06 Approved Excess lifecycle | downstream completion不釋放 | 無Excess ledger；現有earmark／SG exposure會依downstream lifecycle消退 | High |
| C-07 Current OpenSpec truth | Change尚未建立 | Current specs仍規定舊hard-reject | Expected pre-proposal conflict，但必須先Review接受本報告後再建立delta specs |

## 7. NOT_PROVEN／Proposal 前必須明確化的設計問題

以下不是要求使用者重新決定已凍結的業務語義，而是 Proposal／Design 必須把 v11.15 留給技術規格定義的 contracts 明文化：

1. Excess Allowance %、Configured Maximum USD Equivalent Amount、FX Max Staleness、fallback policy 的 authoritative configuration source、versioning與effective-date model。
2. Import LC allowance owner與Export Confirmation allowance owner的stable identifier；是否需要獨立 `excess_account`／`excess_commitment` ledger。
3. `EXCESS_LIMIT_EXCEEDED` 是獨立 excess decision status、movement business status，或兩者；不得把workflow `PENDING/REJECTED/RELEASED`混為一談。
4. Formal Increase regularization調整既有 Approved Excess時的精確 allocation order與adjustment event identity。
5. Return Documents的function code、natural key、movement type、Maker／Checker與accounting boundary。
6. Maker Submit／compound Submit／Fix Pending 的idempotency key、request hash、same-key/different-payload行為及response replay contract。
7. FX asynchronous response在Maker/Checker decision point的等待、timeout、retry與out-of-order version rule。
8. `Eligible SG Capacity Outstanding`初始化、部分／全部capacity redemption、reversal與獨立SG legal lifecycle之間的同步不變量。

## 8. Review Gate

### 8.1 Current Conformance 與文件 Review 狀態

Current conformance：**FAIL**。

Gap Analysis document review：**PASS（2026-09-22，Reviewer 已接受 84 項 Gap Matrix 與 C-01～C-07）**。

Review PASS 不改變現況 conformance：仍存在多項 Critical／High `CONFLICT`，且 Excess／FX 核心 data model、API、domain policy與regression coverage均為 `MISSING`。現況不能被視為部分完成的 v11.15 實作；PASS 僅授權以本報告作為 OpenSpec Change Proposal input。

### 8.2 進入 OpenSpec Change Proposal 的最低 PASS 條件

1. BA／Reviewer 明確將本 Gap Analysis 標記為 Review PASS，並接受 C-01～C-07 conflict register 作為 Proposal input。
2. 確認 Current OpenSpec 的 hard-reject rules 將由正式 delta specs 取代，而不是保留為並存規則。
3. 接受 A3S current SG redemption implementation 與 v11.15 SG liability boundary衝突，Proposal／Design需設計獨立capacity tracker。
4. 確認第7節八項技術contract問題由 Proposal／Design 明確解決；若需要新的業務決策，必須在實作前取得authoritative confirmation。
5. 確認 Proposal scope至少包含：
   - `import-lc-transactions`
   - `export-confirmation-transactions`
   - `maker-checker-control`
   - `earmark-linked-transactions`
   - `balance-calculation`
   - `contract-movement-model`
   - `http-api-and-inquiry`
   - `transaction-builder-ui`
   - Currency Exchange integration（新 capability）
   - Excess ledger／audit／idempotency（新 capability，或明確歸入既有capability）
   - downstream eligibility／Return Documents（新或擴充 capability）
   - Business Case Runner／Regression baseline

Review PASS 前，不建立 Proposal、Design、Delta Specs 或 Tasks。

## 9. 建議的後續輸出（僅在 Review PASS 後）

1. `proposal.md`：問題、目標、範圍、breaking behavior、受影響capabilities。
2. `design.md`：Excess ledger、allowance aggregation、A3S capacity tracker、state separation、FX outbox/inbox、idempotency、transaction boundaries與migration strategy。
3. Delta specs：逐項用 SHALL／MUST + WHEN／THEN覆蓋正常、邊界、拒絕、retry、race與failure cases。
4. `tasks.md`：按Domain → DB → Service → API → Angular → Business Case Runner → docs → regression → strict validation排序。
