---
title: "Transaction Balance Calculation Matrix"
type: reference
domain: balance
status: verified
source_of_truth: source-code
source_revision: "bad2f0c"
verified_date: 2026-09-03
generated: true
aliases: []
tags: ["balance", "transaction-matrix"]
source_files:
  - "microservices/balance-component/src/domain/balanceDerivation.ts"
  - "microservices/balance-component/src/domain/tolerance.ts"
  - "microservices/balance-component/src/domain/offBalanceExposure.ts"
  - "microservices/balance-component/src/service/balanceSnapshotService.ts"
  - "microservices/balance-component/src/domain/reopenRestoration.ts"
---

# Transaction Balance Calculation Matrix

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

## Canonical formulas

Let `signed(m) = ceilingAmount × direction`; fixed directions are Increase／Issue／Create／Reopen = +1 and Decrease／Utilize／Honour／Accept／Settle／Redeem／Close／Expire = −1. REVERSAL and an EXPIRED Expiry Extension use the opposite sign of the referenced movement.

| Figure | Source formula |
|---|---|
| Confirmed Balance (C) | `Σ signed(RELEASED movements)` |
| Available Balance (A) | `C + Σ signed(PENDING movements except AMEND_EXPIRY_DATE)` |
| Pending Earmark Total | `A − C`；可能為正或負 |
| Pending Decrease Total (D) | `Σ abs(signed(PENDING)) where signed < 0`；pending increases 不可抵銷 |
| IPLC／EPLC Tight Available | `C − D − SHGT Off-Balance Exposure` |
| Confirmation Tight Available | `C − D − Present Docs Earmark` |
| Face Amount | RELEASED `ISSUE／AMEND_INCREASE／AMEND_DECREASE／AMEND` 的 face amount；UTILIZE 不改 face |

Snapshot 顯示可以出現負的 raw Tight intermediate；sufficiency checks 將可用容量下限視為 0。所有 balance 使用 `ceilingAmount`，金額依 currency minor units ROUND_HALF_UP。

## Tolerance basis

Issue upper limit = `faceAmount × (1 + tolerancePct / 100)`。Monetary Amendment 不是把 tolerance 單獨乘在本次輸入 amount：

1. `oldUpper = round(currentFace × (1 + currentTolerance))`
2. `newFace = currentFace ± amendmentAmount`
3. `newUpper = round(newFace × (1 + resultingTolerance))`
4. Actual balance delta = `newUpper − oldUpper`

## Import transactions

| Function | Maker／PENDING effect | Checker／completed effect | Other balance rules |
|---|---|---|---|
| A1 | ISSUE +ceiling：A、Pending Earmark 增加；C 尚未增加，因此 pending increase 不增加 Tight | Release 後 C、A、Tight 增加 ceiling | Face 建立；tolerance 適用 |
| A2 Increase | A 增加；C／Tight 不先增加 | C 增加 upper-limit delta，Tight 同步增加 | Face／resulting tolerance 只在 Release 成為有效 basis |
| A2 Decrease | A 減少、D 增加、Tight 立即減少 | C 減少 upper-limit delta；D 清除，Tight 保持已承諾後水位 | Submit／Release 都檢查 capacity；Face 同步減少 |
| A2 Expiry Date | PENDING AMEND_EXPIRY_DATE 被 Available 排除，balance 不先恢復 | ACTIVE amendment只改日期；EXPIRED extension以原 EXPIRE 反向值恢復 C | 不接受 tolerance |
| A3 | PENDING UTILIZE：A 減少、D 增加、Tight 減少；acknowledge 不改 status／數值 | A4／A6 finalize 時 C 減少、D 清除；Tight 保持使用後水位 | Face 不變；另受 SHGT exposure 限制 |
| A3S | LC UTILIZE 使 A／Tight 減；matched SG redemption 使 SG A 減，並在同一 business event 從 parent exposure 淨除 | SG redemption Release；LC arrival由 A4／A6 finalize | Parent 新增占用為 Bill Amount 超過已保留 SG 的增量，避免 double-count |
| A4 | 不建立新 movement；Maker Submit只標記來源 A3/A3S UTILIZE | Release 同一 UTILIZE：C 減少，Pending 轉 Approved | Sight only |
| A6 | 新 Acceptance CREATE PENDING：Acceptance A 增加；來源 LC UTILIZE仍為 Pending | 一次 Release使 LC C 減少、Acceptance C 增加 | Amount／currency／tenor取來源 arrival |
| A7 | Settlement PENDING：所選 Acceptance A 減少、D 增加 | Acceptance C 減少；Full 到 0，Partial 留餘額 | 不改 parent LC C |
| A8 | SHGT ISSUE PENDING：SHGT A 增加；parent off-balance exposure立即增加，parent Tight 減少 | SHGT C 增加；parent exposure／Tight維持占用後水位 | Requested amount ≤ parent Tight |
| A9 | SHGT redemption PENDING：SHGT A 減少；standalone pending redemption尚不釋放 parent exposure | Release後 SHGT C 減少、parent exposure下降、parent Tight回升 | Full Redeem only |
| A10 | CLOSE PENDING：A、D、Tight以 current C 減至關閉水位 | C 歸零並 CLOSED | amount=current Confirmed；0 合法 |
| A11 | REOPEN PENDING：A依 restoration amount增加 | Release後 C／A恢復，status依 expiry date為 ACTIVE 或 EXPIRED | restore=最後連續 RELEASED EXPIRE／CLOSE ceiling總和 |

## Export transactions

| Function | Maker／PENDING effect | Checker／completed effect | Other balance rules |
|---|---|---|---|
| B1 | Confirmation ISSUE +ceiling：A增加；C／Tight尚不使用 pending increase | Release後 Confirmation C、A、Tight增加 | Face與tolerance建立 |
| B2 Increase／Decrease | Increase只增A；Decrease減A、增D、立即減Tight | Release後 C套用 newUpper−oldUpper delta | B2 AMEND以 signed amount表達方向；Expiry Date同A2 |
| B3 | EPLC_EXAMINATION CREATE；parent Present Docs Earmark Pending增加，parent Tight立即減少 | B3 Release把 earmark從 Pending bucket移至 Approved bucket；combined earmark／Tight不變 | 不直接減 Confirmation C |
| B4 Sight | Confirmation HONOUR PENDING使D增加；引用的B3先 provisionally從earmark移除，避免雙扣；Due-from asset A增加 | Release後 Confirmation C減少、B3 consumed；Due-from asset C增加 | Present Docs earmark歸零與HONOUR實際減項同一事件 |
| B4 Usance | Confirmation ACCEPT PENDING減A／增D；Acceptance及Reimbursement Receivable CREATE增加各自A；B3 provisional consume | Release後 Confirmation C減、Acceptance／Receivable C增、B3 consumed | compound three-leg event |
| B5 | EPLC_ACCEPTANCE FULL_SETTLE PENDING使其A減少 | Acceptance C減至0 | 不結算 Reimbursement Receivable；不改 Confirmation |
| B6 | CLOSE PENDING以 current Confirmation C形成負向 commitment | Release後 C歸零並 CLOSED | 須無 Acceptance／open／unconsumed B3 |
| B7 | REOPEN PENDING依 restoration amount增加A | Release後 C恢復 | restore chain算法同A11 |

## Automatic lifecycle

- Auto EXPIRE：建立 `−current Confirmed`，Release 後 C 歸零並 EXPIRED；未結 SG／Acceptance可存在，但 event tree 不得有 open events。
- Auto CLOSE：對已 EXPIRED contract 使用當時 C；通常為0，Release只完成 CLOSED 狀態。
- Expiry Extension：PENDING 不加入 A；Release 才反轉被引用 EXPIRE 的 signed amount。
