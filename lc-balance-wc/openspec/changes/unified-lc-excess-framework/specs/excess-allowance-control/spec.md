## ADDED Requirements

### Requirement: Zero Allowance Uses Legacy Sufficiency

若 resolved policy 的 `configuredMaximumUsd = 0` 或 `allowancePercentage = 0`，該 owner SHALL 被明確視為「不允許超押」。系統 SHALL 不啟用該 owner 的 Excess Framework，並 SHALL 對 A3、A3S、B3 使用變更前既有 Tight Available／sufficiency 邏輯。兩個配置值均嚴格大於零時才可供 A3／A3S／B3 進入 Covered／Excess 與 allowance validation。

#### Scenario: Zero Configured Maximum Within Existing Capacity

- **GIVEN** `configuredMaximumUsd = 0`
- **WHEN** A3／A3S／B3 Amount 未超過既有 authoritative capacity
- **THEN** 系統 SHALL 依原有 Maker／Checker 流程處理
- **AND** SHALL NOT 建立 FX snapshot、Excess decision、reservation 或 ledger event

#### Scenario: Zero Percentage Exceeds Existing Capacity

- **GIVEN** `allowancePercentage = 0`
- **WHEN** A3／A3S／B3 Amount 超過既有 Tight Available／sufficiency boundary
- **THEN** 系統 SHALL 維持既有 `409 INSUFFICIENT_AVAILABLE_BALANCE` code 與 message
- **AND** SHALL 維持 zero-write
- **AND** SHALL NOT 回傳 `EXCESS_LIMIT_EXCEEDED`

#### Scenario: Either Zero Disables Excess

- **WHEN** configured maximum 與 percentage 其中任一為零而另一值大於零
- **THEN** 整個 owner SHALL 使用 legacy sufficiency route
- **AND** 系統 MUST NOT 將其解釋為已啟用但可用 allowance 為零

### Requirement: Unified Covered and Excess Split

所有配置路徑均 SHALL 強制 `A3/A3S.transactionCurrency = ImportLC.currency`、`B3.transactionCurrency = Confirmation.currency`；此 invariant 在BD-03 legacy route之前驗證。對A3／A3S／B3，當resolved policy兩個限額值均大於零時，系統 SHALL以owner currency拆分Covered／Excess，且兩者總和 MUST等於交易金額。Excess Amount已是Proposed Excess Owner Amount，不得再做第二段FX。

#### Scenario: Transaction and Owner Currency Mismatch

- **WHEN** A3／A3S currency 不等於 Import LC currency，或 B3 currency 不等於 Confirmation currency
- **THEN** command SHALL 在 Currency Exchange lookup 與任何 persistence 前被拒絕
- **AND** SHALL NOT 推測 transaction-excess→owner conversion、倒算 rate 或建立 movement／reservation

#### Scenario: 交易部分由 Capacity 覆蓋

- **GIVEN** `configuredMaximumUsd > 0` 且 `allowancePercentage > 0`
- **WHEN** 交易金額為 120，authoritative covered capacity 為 100
- **THEN** Covered Amount SHALL 為 100，Excess Amount SHALL 為 20

#### Scenario: Capacity 為負數

- **GIVEN** `configuredMaximumUsd > 0` 且 `allowancePercentage > 0`
- **WHEN** raw covered capacity 小於零
- **THEN** sufficiency calculation SHALL 以零作 Covered Amount 下限
- **AND** 全部交易金額 SHALL 成為 Excess Amount

#### Scenario: A3S Uses Normalized Effective Presentation Capacity

- **GIVEN** A3S Base Parent Tight Available為`4,000`、Current SG Redemption Amount為`6,000`且Arrival為`10,200`
- **WHEN** 系統拆分A3S Covered／Excess
- **THEN** Effective Presentation Capacity SHALL為`10,000`、Covered SHALL為`10,000`且Excess SHALL為`200`
- **AND** self SG redemption與LC UTILIZE legs SHALL各淨除exactly once，無論其workflow leg當下是否pending

### Requirement: Owner-level Excess Allowance

僅當 resolved policy 的 `configuredMaximumUsd > 0` 且 `allowancePercentage > 0` 時，Import LC SHALL 作為其 A3、A3S 的唯一 allowance owner，Export Confirmation SHALL 作為其 B3 的唯一 allowance owner。系統 MUST在owner currency比較Percentage Allowance、provider轉換的Configured Maximum、Approved Excess、其他Pending Reservations與本次Proposed Excess。

四個Protected Exceed fields SHALL使用同一authoritative allowance facts：`Previous Exceed Amount`為active outstanding Pending＋Approved Excess commitments，排除allowance commitment已`RELEASED`／`REVERSED`／`DELETED`／`EXPIRED`者；Fix／Resubmit計算另排除current movement舊reservation exactly once。`This Exceed Amount = max(0, Transaction Amount - Effective Presentation Capacity)`；`Total Exceed Amount = Previous Exceed Amount + This Exceed Amount`；`Maximum Exceed Amount = MIN(LC／Confirmation face amount excluding tolerance × allowancePercentage, configuredMaximumUsd以合規rate換算至transaction currency的金額)`。Import `LC Amount = Issue LC Amount + cumulative formal／Checker-approved Increase - cumulative formal／Checker-approved Decrease`；Pending／未核准amendments及Tolerance不影響LC Amount。Maximum是最終MIN，不是raw converted USD cap。因transaction currency等於owner currency，禁止第二段FX。

#### Scenario: Pending Amendment Does Not Change Maximum

- **GIVEN** Issue LC Amount=`10,000`、formal approved Increase=`2,500`、formal approved Decrease=`300`，以及Pending Increase=`1,000`與Tolerance=`10%`
- **WHEN** 系統計算LC Amount operand
- **THEN** LC Amount SHALL為`12,200`，不得加入Pending `1,000`或Tolerance capacity
- **AND** Percentage operand SHALL只以`12,200 × allowancePercentage`計算

若`configuredMaximumUsd = 0` OR `allowancePercentage = 0`，`Maximum Exceed Amount` SHALL為transaction currency的`0`且代表no Excess capability；系統 SHALL依Zero Allowance requirement沿用legacy sufficiency，不呼叫FX且不啟動Excess validation。

#### Scenario: Active Outstanding Aggregate

- **GIVEN** allowance owner存在active Pending及active Approved Excess，另有已終止的`RELEASED`／`REVERSED`／`DELETED`／`EXPIRED`allowance commitments
- **WHEN** 系統計算`Previous Exceed Amount`
- **THEN** SHALL只加總active outstanding Pending＋Approved commitments
- **AND** SHALL排除上述terminal commitments；downstream movement status本身不得在沒有allowance commitment release事實時自動減少Approved Excess

#### Scenario: Fix Self Is Excluded Once

- **GIVEN** current pending movement已有Excess reservation並請求Fix／Resubmit preview或validation
- **WHEN** 系統計算Previous與replacement This
- **THEN** current movement舊reservation SHALL自Previous排除exactly once，其他active commitments維持計入
- **AND** 原reservation SHALL保持持久化，直到成功authoritative Submit在同一unit of work原子替換；preview或失敗Submit不得修改它

#### Scenario: Four-field Exact-limit Acceptance Example

- **GIVEN** USD owner有other active Pending=`100`、active Approved=`200`、current Fix舊reservation=`50`及terminal commitments=`900`
- **AND** replacement Transaction Amount=`10,500`、Effective Presentation Capacity=`10,000`、Effective Excess Limit=`800`
- **WHEN** 系統計算Fix preview或authoritative replacement
- **THEN** Previous SHALL為`300`（排除self `50`及terminal `900`）、This SHALL為`500`、Total SHALL為`800`且Maximum SHALL為`800`
- **AND** exact-limit result MAY通過其餘validation；若Transaction Amount為`10,500.01`，Total=`800.01` SHALL回`EXCESS_LIMIT_EXCEEDED`並zero-write

#### Scenario: Maximum Exceed Amount FX Boundary

- **GIVEN** 兩個configuration values均大於0
- **WHEN** owner currency為USD
- **THEN** configured maximum operand SHALL使用`USD_PAR`及zero provider calls計算，Maximum SHALL取它與face-excluding-tolerance percentage operand的MIN
- **WHEN** owner currency不是USD
- **THEN** configured maximum operand SHALL使用provider-supplied、Approved／Effective／Fresh `BOOKING` quote所得的transaction-currency equivalent，Maximum SHALL取它與face-excluding-tolerance percentage operand的MIN
- **AND** unavailable／invalid SHALL fail closed為`FX_RATE_UNAVAILABLE`，stale SHALL為`FX_RATE_STALE`

#### Scenario: Proposed Excess 在 Allowance 內

- **WHEN** Proposed Excess 加上 Approved 與其他 Pending 使用量不超過有效 configured maximum
- **THEN** Excess decision SHALL 為 `WITHIN_ALLOWANCE`
- **AND** Maker Submit SHALL 原子建立 movement 與 Pending Excess Reservation

#### Scenario: Proposed Excess 超過 Allowance

- **WHEN** Proposed Excess 加上 Approved 與其他 Pending 使用量超過有效 configured maximum
- **THEN** Maker Submit SHALL 回傳 HTTP `409` 與 `EXCESS_LIMIT_EXCEEDED`
- **AND** SHALL NOT 建立 movement、Pending Excess Reservation、FX／decision snapshot、ledger event 或 idempotent success
- **AND** Minimum Required Increase guidance MAY 隨 error response 回傳，但不得成為 transaction fact

### Requirement: Pending and Approved Excess Lifecycle

對 `configuredMaximumUsd > 0` 且 `allowancePercentage > 0` 的 Excess-enabled owner，Pending Excess Reservation SHALL僅在A3／A3S／B3 Maker Submit通過allowance gate時建立。B3在自身Checker Release成功時原子轉為Approved Excess。A3／A3S Acknowledge後reservation保持Pending，直至Sight A4或Usance A6 final Release在共同`ABSENT + Checker Approve`操作及其他權威gates通過後才轉Approved Excess；A4／A6不得要求或保存Applicant Waiver。Reject保留reservation；Delete Pending接受`PENDING`／`REJECTED`並釋放reservation。

#### Scenario: Checker Release 成功

- **WHEN** 不同 Checker 對 B3 以最新facts與allowance重新驗證且交易仍符合資格
- **THEN** Pending Excess Reservation SHALL 原子轉換為 Approved Excess
- **AND** 同一 Excess Amount SHALL NOT 同時存在於 pending 與 approved aggregate

#### Scenario: A3／A3S Acknowledge 保留 Pending

- **WHEN** 不同 Checker 成功 Acknowledge A3／A3S
- **THEN** LC UTILIZE movement SHALL 保持 `PENDING`／EARMARKED，Pending Excess Reservation SHALL 保持 Pending
- **AND** Sight A4 或 Usance A6 final Checker Release 成功時才 SHALL 原子轉換為 Approved Excess並 finalise referenced LC UTILIZE

#### Scenario: Pending Movement 被整筆刪除

- **WHEN** 合資格 pending A3／A3S／B3 被 Delete
- **THEN** 整筆 movement SHALL 轉為 `DELETED`，其 Pending Excess Reservation SHALL 在同一 transaction 全額釋放
- **AND** Delete request SHALL NOT 接受 amount 或部分釋放
- **AND** audit history SHALL 保留原 reservation 與 deletion facts

#### Scenario: Pending Movement 被 Reject

- **WHEN** Checker Reject 一筆已成功 Submit 的 pending movement
- **THEN** workflow SHALL 記錄 rejected fact
- **AND** Pending Excess Reservation SHALL 保留，不得釋放

#### Scenario: Maker Fix Resubmit Replaces Reservation

- **WHEN** Maker Fix／Resubmit 已存在的 pending／rejected A3／B3或pre-Acknowledge A3S
- **THEN** 系統 SHALL 重用原 business event 與 pending identity
- **AND** 只有完整 revalidation 在 allowance 內時才原子替換原 reservation，不得建立 duplicate movement 或 reservation
- **AND** 若 replacement 超限，SHALL 回傳 `EXCESS_LIMIT_EXCEEDED` 並保持原 movement／reservation不變

#### Scenario: Post-Acknowledge A3／A3S Does Not Replace Reservation

- **WHEN** Maker嘗試Fix／Resubmit任何`acknowledgedAt != null`且workflow為`PENDING`／EARMARKED或`REJECTED`的A3／A3S Amount
- **THEN** 系統 SHALL回傳HTTP `409`／`ILLEGAL_STATE_TRANSITION`
- **AND** SHALL NOT重算、釋放或替換Pending Excess Reservation或locked split；A3S normalized snapshot與main SG facts亦不得修改

### Requirement: Effective-dated Excess Policy

Allowance percentage、maximum USD amount、FX Max Staleness、fail-closed policy 與 PBD fallback authorization SHALL 由不可變、具版本且 effective-dated 的配置提供。PBD authorization MUST 具有實際 `fallbackPolicyId` 與 `fallbackPolicyVersion`；每個 accepted movement MUST snapshot resolved policy version，使用 PBD 時另 MUST snapshot fallback policy identity。

#### Scenario: 有效配置唯一

- **WHEN** decision time 只匹配一個完整 active policy version
- **THEN** 系統 SHALL 使用並 snapshot 該 version

#### Scenario: 配置缺失或重疊

- **WHEN** decision time 無有效 policy 或匹配多個互相重疊版本
- **THEN** 系統 SHALL fail closed
- **AND** SHALL NOT 建立 movement 或 reservation

### Requirement: Formal Increase Guidance Without Cure Transaction

本 Change SHALL NOT 修改既有 A2／B2 transaction processing，也 SHALL NOT 建立 Excess Allocation／Cure command、`FORMAL_INCREASE_REGULARIZATION` event 或 allocation rows。A3／A3S／B3 Resubmit／revalidation MAY只讀取既有A2／B2 lifecycle所產生的最新Checker-released Approved Contractual Maximum。Formal Increase SHALL NOT減少或改寫Approved Excess。

#### Scenario: Latest Approved Contractual Maximum Is Read on Fresh Submit

- **WHEN** 既有 A2／B2 流程已由 Checker Release 新的 Approved Contractual Maximum，且 Maker 再次提交先前因 over-limit 被拒絕的業務輸入
- **THEN** Excess revalidation SHALL 使用最新 Approved Contractual Maximum 重新計算
- **AND** 原 Approved Excess history／utilization SHALL 保持不變

#### Scenario: Partial Increase Remains Insufficient

- **WHEN** 最新 Approved Contractual Maximum 的增加仍不足以解決 breach
- **THEN** 新 Submit SHALL 再次回傳 `EXCESS_LIMIT_EXCEEDED` 並維持 zero-write
- **AND** MAY 回傳新的 current-snapshot guidance，但不得自動 cure

#### Scenario: Increase Exceeds Required Amount

- **WHEN** Approved Contractual Maximum 的增加大於 Minimum Required Increase
- **THEN** 超出部分 SHALL 成為普通 contractual capacity
- **AND** SHALL NOT 被配置為 Excess cure 或回寫既有 Approved Excess

### Requirement: Minimum Required Increase Guidance

對 Excess-enabled、limit 可計算且 over-limit 的 command，Minimum Required Increase SHALL 為 owner currency minor-unit 範圍內、使同一 authoritative revalidation predicate 成立的最小非負 contractual increment。初次 Submit 沒有 retained reservation；Fix／Resubmit 既有 pending movement 時，計算 SHALL 固定 current snapshot 的其他 capacity、allowance、provider Booking Rate、rounding 與 committed-excess inputs，並將該 movement retained reservation 排除／替換 exactly once，但超限 replacement 不得提交。此值只供 error-response 指引，SHALL NOT 自動建立、修改或提交 A2／B2。

#### Scenario: Finite Increase Resolves Breach

- **WHEN** 存在可由 contractual increase 單獨解決的有限值
- **THEN** response SHALL 回傳 Minimum Required Increase、snapshot time 與計算 evidence

#### Scenario: Increase Alone Cannot Resolve

- **WHEN** 同一正式 predicate 無法求得可由 increase 單獨解決的有限值
- **THEN** response SHALL 明示 `INCREASE_ALONE_CANNOT_RESOLVE`
- **AND** SHALL NOT 產生虛構或無限的 Minimum Required Increase

#### Scenario: FX Contributes to Breach

- **WHEN** Booking Rate revaluation 是 breach 的成因之一
- **THEN** guidance SHALL 明示 FX contribution 與使用的 immutable FX evidence

### Requirement: Full Delete Pending Only

本期 SHALL NOT提供A3／A3S／B3 Return Documents、`RETURN_REVERSAL`、`CANCELLATION_REVERSAL`或Approved Excess adjustment。唯一撤回操作是整筆Delete Pending：只接受`PENDING`／`REJECTED` movement identity，不接受amount；A3／A3S／B3全額釋放該movement的Pending Excess Reservation。`APPROVED`／`RELEASED` movement與Approved Excess SHALL NOT被Delete Pending修改。

#### Scenario: Partial Delete Is Rejected

- **WHEN** Delete Pending request 帶有 amount 或要求部分刪除／釋放
- **THEN** 系統 SHALL 拒絕 request
- **AND** 原 movement、reservation、FX snapshots 與 owner aggregates SHALL 維持不變

#### Scenario: Approved Movement Cannot Be Deleted

- **WHEN** caller 對 `APPROVED`／`RELEASED` A3／A3S／B3 執行 Delete Pending
- **THEN** 系統 SHALL 拒絕操作
- **AND** owner aggregates SHALL 維持不變
