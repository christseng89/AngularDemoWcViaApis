# 信用證超押帳務處理 — BA 一次性決策確認清單

> 文件狀態：**BA 決策確認輸入（非已批准 OpenSpec）**  
> 適用基準：`信用證超押處理業務需求_v11.15_V4_BA_REVIEW_FIXED` 及目前已批准 OpenSpec  
> 目的：一次確認 A3／A3S／A8／Usance A6／Usance A7／B3／Usance B4／Usance B5 的 Legal Amount、Covered Balance、Excess 與 Account Entries，確認後才修訂 OpenSpec 及實作。

## 1. 共用案例

以下所有問題均以同一案例回答：

```text
Legal Transaction Amount       = 10,200
Formal Available Capacity      = 10,000
Covered Amount                 = 10,000
Excess Amount                  =    200
```

本文件刻意分開三個概念：

```text
Legal Amount          對外法律責任、票據或付款金額
Covered Balance       正式 LC／Confirmation／Acceptance 等 Balance Component 金額
Excess                獨立 Excess reservation／ledger／attribution
```

## 2. 請 BA 先一次確認共用原則

請在每項填寫 `YES`／`NO`；如為 `NO`，請直接填入正確規則及金額。

| ID | 待確認共用原則 | 建議答案 | BA 確認／修正 |
|---|---|---:|---|
| G-01 | 「Only Covered Amount impacts formal Balance」是否只適用於 owner capacity-control balance（Import LC／Export Confirmation），而不直接等同 SG／Acceptance legal outstanding、payment或receivable？ | YES（BA建議） | |
| G-02 | `Legal Amount=10,200` 必須完整保留，不得因 Balance 只記 Covered 而改成 10,000。 | YES | |
| G-03 | `Excess=200` 不得再次進入 owner capacity-control balance；但SG／Acceptance legal outstanding及receivable是否仍須反映完整10,200，應由各功能明確定義，不得由單一amount自行推導。 | YES | |
| G-04 | Pending movement 的 Checker Release 前只建立 pending balance effect／earmark及 Pending Excess Reservation，不視為正式法律 posting。 | YES | |
| G-05 | Reject 保留原 pending movement及 reservation；whole Delete Pending 撤銷整筆 pending Covered effect並全額釋放 Pending Excess Reservation，不建立正式 legal-liability reversal。 | YES | |
| G-06 | A6／B4 將來源 presentation 轉成 Acceptance 時，只是把來源 pending earmark finalise／reclassify；不得重新開放已使用的 LC／Confirmation capacity。 | YES | |
| G-07 | A6／B4／A7／B5 完成後，Approved Excess 仍維持 200，不因 downstream completion 自動減少。 | YES（沿用 BD-07） | |
| G-08 | 法律付款／收款可為10,200；Covered 10,000與Excess 200在cash／legal accounting如何對帳、由哪個元件承接？ | **必填** | |
| G-09 | Balance inquiry、event snapshot、voucher display及 downstream API 必須同時可辨識 `legalAmount=10,200`、`coveredBalanceEffect=10,000`、`excess=200`，不得只靠一個 `amount` 推導三種語意。 | YES | |
| G-10 | 任一reverse／settlement須分別處理capacity Covered及完整legal amount：owner capacity只reverse 10,000；legal liability／receivable若原記10,200則reverse 10,200。 | YES | |
| G-11 | A7若允許Partial Settlement，Covered與Excess採何種allocation順序（pro-rata／Covered-first／Excess-first／指定attribution）？ | **必填** | |

## 3. Import LC 功能逐項確認

### 3.1 A8 — Shipping Guarantee Issue

建議合約：

```text
A8 Legal SG Amount                 10,200
Parent LC capacity consumption     10,000  (Covered)
SG legal/contingent liability      10,200
Pending Excess before Release         200
Approved Excess after Release         200
Parent LC Tight after Release           0
```

請 BA 確認：

| ID | 問題 | 建議答案 | BA 確認／修正 |
|---|---|---:|---|
| A8-01 | Parent LC capacity／Tight 只扣 Covered 10,000。 | YES | |
| A8-02 | SG 自身 legal face、SG confirmed balance及 SG contingent-liability entry 均為完整 10,200。 | YES | |
| A8-03 | Excess 200 不得使 Parent LC Tight 變成負數，也不得再加進 SG entry 第二次。 | YES | |
| A8-04 | Pending／Rejected A8 Delete Pending：撤銷 Covered capacity 10,000、釋放 Pending Excess 200；因 SG 尚未正式 Issue，不建立 `-10,200` legal reversal。 | YES | |
| A8-05 | Standalone A9 FULL_REDEEM／正式 SG 解除時：SG legal liability `-10,200`、Parent LC Covered capacity恢復 `+10,000`。 | YES | |
| A8-06 | A9 後 Approved Excess 200 是否仍保持不減？ | YES（現行 BD-07）；若 NO，須新增 Approved Excess reversal BD | |

### 3.2 A3 — Document Arrival

建議合約：

```text
Presentation Legal Amount          10,200
LC UTILIZE balance effect         -10,000
Pending Excess                       200
LC Balance after A3 Pending              0
```

| ID | 問題 | 建議答案 | BA 確認／修正 |
|---|---|---:|---|
| A3-01 | A3 movement保留 Legal Presentation 10,200，但 LC `ceiling/balanceEffect` 只為 Covered 10,000。 | YES | |
| A3-02 | A3 capacity effect確定為10,000；但LC internal memo／voucher應顯示Legal 10,200或Covered 10,000？ | **必填** | |
| A3-03 | A3 Acknowledge後 LC UTILIZE及 Pending Excess仍為 Pending，直到 A4（Sight）或 A6（Usance）final Release。 | YES（沿用 BD-09） | |
| A3-04 | A3 whole Delete Pending：LC pending effect由 `-10,000` 撤銷、Pending Excess `-200/release`；不得 credit LC 10,200。 | YES | |
| A3-05 | Fix Pending 10,200→10,300／10,100 時，重新計算 Covered／Excess並原子替換 balance effect與 reservation，不以差額累加。 | YES | |

### 3.3 A3S — Document Arrival with Shipping Guarantee

| ID | 問題 | 建議答案 | BA 確認／修正 |
|---|---|---:|---|
| A3S-01 | Legal Presentation仍為10,200；LC formal balance effect最多只為總 Covered 10,000。 | YES | |
| A3S-02 | Covered 10,000 可由 Selected Eligible SG Capacity與 residual Parent LC capacity組成，但同一金額不得同時扣 SG capacity及 Parent LC capacity兩次。 | YES | |
| A3S-03 | A8 已建立的 Excess attribution不得因 A3S capacity transfer再次增加 Approved Excess。 | YES | |
| A3S-04 | A3S Checker Acknowledge時，Selected SG capacity redemption、SG legal liability release及LC UTILIZE各自應記多少？請 BA 以数字列出。 | **必填** | SG Capacity：___；SG Legal：___；LC UTILIZE：___ |
| A3S-05 | A3S pre-Acknowledge whole Delete Pending應原子撤銷LC Covered effect、SG capacity reservation及Pending Excess；不得產生正式 SG legal reversal。 | YES | |
| A3S-06 | A3S post-Acknowledge Amount Fix仍禁止；Delete Pending是否仍依現行BD-07整筆處理，且不重開once-only facts？ | 請確認 | |

### 3.4 Usance A6 — Acceptance

建議合約：

```text
Source A3 Legal Presentation       10,200
Source A3 Covered                  10,000

A6 Legal Acceptance Amount         10,200
A6 Acceptance Formal Balance       10,000
Approved Excess                       200
```

| ID | 問題 | 建議答案 | BA 確認／修正 |
|---|---|---:|---|
| A6-01 | A6 Release將A3 pending Covered 10,000 finalise為Released LC UTILIZE；LC Confirmed／Available／Tight仍為0，不恢復可重用LC額度。 | YES | |
| A6-02 | Acceptance須保存Legal Amount 10,200；Acceptance legal outstanding／confirmed balance應為10,200或Covered 10,000？如另設capacity-control balance，請分別列值。 | **必填** | |
| A6-03 | A6 Account Entries：LC capacity conversion確定以Covered 10,000；Acceptance legal voucher應以10,200或10,000？ | **必填** | |
| A6-04 | 若需另有法律承兌voucher 10,200，是否由Balance Component保存／輸出？若是，如何與formal 10,000 entry區分？ | **必填** | |
| A6-05 | A6 Release後 Pending Excess 200原子轉Approved Excess 200，且不建立第二份Excess。 | YES | |
| A6-06 | A6 Release失敗（FX unavailable/stale等）保留A3、Acceptance及Excess pending facts，零部分posting。 | YES | |

### 3.5 Usance A7 — Acceptance Settlement

| ID | 問題 | 建議答案 | BA 確認／修正 |
|---|---|---:|---|
| A7-01 | A7 Legal Settlement／Payment Amount可為10,200。 | YES | |
| A7-02 | A7應同時如何settle Acceptance legal outstanding 10,200及Covered attribution 10,000？請列出兩個movement／entry。 | **必填** | |
| A7-03 | 額外200的cash／legal accounting由哪個元件及account承接？Balance Component是否只傳Legal Amount與Excess attribution？ | **必填** | |
| A7-04 | A7完成後Approved Excess仍為200，不自動reversal。 | YES（現行BD-07） | |

## 4. Export Confirmation 功能逐項確認

### 4.1 B3 — Present Documents

建議合約：

```text
Presentation Legal Amount          10,200
Present Docs formal earmark         10,000
Pending／Approved Excess               200
```

| ID | 問題 | 建議答案 | BA 確認／修正 |
|---|---|---:|---|
| B3-01 | B3保留Legal Presentation 10,200，但Present Docs earmark只占Covered 10,000。 | YES | |
| B3-02 | B3 owner capacity earmark確定為Covered 10,000；memo voucher應顯示Legal 10,200或Covered 10,000？ | **必填** | |
| B3-03 | B3 Checker Release將Pending Excess 200轉Approved Excess 200；Present Docs仍占Covered earmark直到B4 consume。 | YES | |
| B3-04 | Pending／Rejected whole Delete撤銷Covered earmark 10,000並釋放Pending Excess 200；Released B3不得Delete Pending。 | YES | |

### 4.2 Usance B4 — Issuing Bank Accept + linked legs

現行B4 Usance通常同一compound event包含：

```text
EPLC_CONFIRMATION / ACCEPT
EPLC_ACCEPTANCE / CREATE
EPLC_ACCEPTANCE_REIMB_RECEIVABLE / CREATE
```

請BA逐腿填寫應用Legal或Covered：

| B4 leg | Legal Amount | Formal Balance Effect 建議 | Account Entry建議 | BA確認／修正 |
|---|---:|---:|---|---|
| Confirmation ACCEPT | 10,200 | `-10,000` Covered | reverse/reduce 10,000 | |
| Export Acceptance CREATE | 10,200 | `+10,000` Covered | establish 10,000 | |
| Acceptance Reimbursement Receivable CREATE | 10,200 | **請BA決定10,000或10,200** | **必填** | |
| Approved Excess Attribution | 200 | 不進上述formal balances | 保持200 | |

另請確認：

| ID | 問題 | 建議答案 | BA 確認／修正 |
|---|---|---:|---|
| B4-01 | B4 consume B3時只移除B3 Covered earmark 10,000，不得重新開放或重複消耗Confirmation capacity。 | YES | |
| B4-02 | B4 compound Release三腿必須原子成功／失敗，禁止只建立Acceptance而未處理Confirmation或Receivable。 | YES | |
| B4-03 | B3的Approved Excess 200由B4沿用attribution，不新增第二份Excess。 | YES | |
| B4-04 | 法律承兌與Receivable若需完整10,200，如何與formal Covered balance 10,000並存？ | **必填** | |

### 4.3 Usance B5 — Export Acceptance Settlement

| ID | 問題 | 建議答案 | BA 確認／修正 |
|---|---|---:|---|
| B5-01 | B5 Legal Settlement Amount可為10,200。 | YES | |
| B5-02 | Export Acceptance formal balance只settle Covered 10,000並回到0。 | YES | |
| B5-03 | Reimbursement Receivable在B5是否同時settle？若否，由哪個function/event settle，金額為10,000或10,200？ | **必填** | |
| B5-04 | 額外Excess 200的cash／receivable accounting由哪個元件／account承接？ | **必填** | |
| B5-05 | B5完成後Approved Excess仍為200，不自動reversal。 | YES（現行BD-07） | |

## 5. Account Entry 一次性確認矩陣

請BA填入最终数字；`N/A`表示該功能無此entry。

| Function | Legal Amount | LC／Confirmation Entry | SG Entry | Acceptance Entry | Receivable／Asset Entry | Excess Ledger | Approved Excess after completion |
|---|---:|---:|---:|---:|---:|---:|---:|
| A8 Release | 10,200 | -10,000 capacity | +10,200 | N/A | N/A | +200 | 200 |
| A3 Pending/Acknowledge | 10,200 | -10,000 Covered | N/A | N/A | N/A | Pending +200 | 0 |
| A3S Acknowledge | 10,200 | ___ | ___ | N/A | N/A | ___ | ___ |
| A6 Release | 10,200 | -10,000 finalised | N/A | **___ legal / ___ capacity** | N/A | Pending→Approved 200 | 200 |
| A7 Settlement | 10,200 | N/A | N/A | **___ legal / ___ capacity** | ___ | no change | 200 |
| B3 Release | 10,200 | capacity earmark 10,000 | N/A | N/A | memo ___ | Pending→Approved 200 | 200 |
| B4 Usance Release | 10,200 | -10,000 capacity | N/A | **___ legal / ___ capacity** | **___ legal / ___ capacity** | no duplicate | 200 |
| B5 Settlement | 10,200 | N/A | N/A | **___ legal / ___ capacity** | ___ | no change | 200 |

## 6. 必须回答的 Business Decisions

BA可直接按以下格式回覆；全部回答後即可一次形成OpenSpec amendment input。

```text
BD-A — Global dual-amount model (G-01～G-10): YES / NO + corrections

BD-B — A8/A9:
Parent LC Covered = ___
SG legal liability = ___
A9 restores Parent capacity = ___
A9 changes Approved Excess? YES / NO

BD-C — A3/A3S:
A3 LC balance effect = ___
A3 account entry = ___
A3S SG capacity effect = ___
A3S SG legal liability effect = ___
A3S LC balance effect = ___

BD-D — A6/A7:
A6後 LC Confirmed / Available / Tight = ___ / ___ / ___
Acceptance Legal Amount = ___
Acceptance Legal Outstanding = ___
Acceptance Capacity-Control Balance（如适用） = ___
A6 LC capacity entry / Acceptance legal entry = ___ / ___
A7 legal settlement = ___
A7 legal outstanding settlement / covered attribution settlement = ___ / ___
A7 partial settlement allocation rule = ___
Excess 200 cash/accounting owner = ___

BD-E — B3/B4/B5:
B3 legal / earmark = ___ / ___
B4 Confirmation effect = ___
B4 Acceptance legal outstanding / capacity-control = ___ / ___
B4 Reimbursement Receivable legal / capacity-control = ___ / ___
B5 Acceptance legal settlement / covered attribution settlement = ___ / ___
B5 Receivable settlement function and amount = ___
Excess 200 cash/accounting owner = ___

BD-F — Approved Excess lifecycle:
A6/A7/B4/B5後是否維持Approved Excess 200? YES / NO
是否仍禁止partial return/cancellation與Approved Excess reversal? YES / NO
```

## 7. 批准邊界

在BA與Business Owner完成上述確認前：

- 不得把本文件內容當成已批准OpenSpec。
- 不得修改A6／A7／B4／B5的核心balance derivation或accounting contract。
- 現行BD-07仍有效：Approved Excess累計不減，本期沒有Approved Excess cancellation reversal。
- 確認完成後，先建立OpenSpec amendment、Delta Specs、Tasks及Requirement Traceability並完成Change Approval，才進入TDD implementation。
