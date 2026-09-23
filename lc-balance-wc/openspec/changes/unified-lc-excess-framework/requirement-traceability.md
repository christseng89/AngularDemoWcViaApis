# Requirement Traceability — FROZEN V2 Change Update

## Authority and Status

- Business authority：`信用證超押處理業務需求_v11.15_V4_BA_REVIEW_FIXED_V2.docx`（FROZEN）是本輪唯一業務基準，優先於所有衝突的歷史rows。
- Accepted analysis：`analysis/Credit-Letter-Excess-Requirement-Gap-Analysis-v11.15.md`（historical accepted input only；若與FROZEN V2衝突，以V2為準）
- Analysis Review：PASS（2026-09-22）；84 項 Gap Matrix 與 C-01～C-07 已接受
- Business Decisions：BD-01～BD-10保留並由V2精化；BD-11、所有A8／A9 change statements及A3S SG Redemption／SG Available Balance／Account Entries behavior為`OUT_OF_SCOPE`；BD-12只適用A3／A3S／B3；BD-13 Applicant Waiver、BD-14 B4 Export Authorization All-or-Nothing、BD-15 Dedicated `EXPORT_EXCESS_ASSET`。舊selected-capacity Excess basis與B3-only authorization contract為`SUPERSEDED`。
- Implementation status：**AUTHORIZED / RELEASE-CANDIDATE VALIDATION**。Renewed Change Approval已於2026-09-23 PASS；2026-09-24 Owner確認A4／A6／B4統一`ABSENT + Checker Approve`為approved bug correction，OpenSpec、code、OAS與tests SHALL同步。工作只在`OVERDRAWN`，不得影響`main`。
- Approval boundary：舊`change-approval-review-pack-v4.md`、`business-user-confirmation-currency-contract.md`及歷史approval／confirmation／evidence為non-normative archive。衝突時以FROZEN V2、approved Owner bug decisions及本矩陣為準。

## Historical Audit Mapping（Non-Normative）

The rows and task IDs in this section document prior work only. They MUST NOT serve as acceptance evidence or define behavior for this Change. All renewed acceptance is bound to Tasks 10.1–10.6 after Task 9.6 approval.

| Historical task IDs | Consolidated gate |
| --- | --- |
| 5.1、5.3–5.7 | 5.S2 API／OAS contract pack |
| 5.2 | 5.S1 completed HTTP vertical slice |
| 6.1–6.5 | 6.S1 Angular contract pack |
| 7.1–7.7、7.11–7.12 | 7.S1 minimal OVERDRAWN Business Case matrix |
| 7.8–7.10 | 7.S2 full regression gate |
| 8.1–8.4 | 8.S1 documentation／traceability gate |
| 8.4a–8.4d | 8.S2 ARM64 SonarQube gate |
| 8.5 | 8.S3 final review／archive gate |

## Historical Requirement-to-Delta Matrix（Non-Normative）

This matrix preserves the accepted 84-item analysis lineage. Its legacy task references are audit pointers only; in-scope implementation and acceptance SHALL use the Final Clarification Requirement Matrix and Tasks 10.1–10.5.

| Gap IDs                        | V4 concern                                                 | Delta capability／requirement                                                                                        | Design contract          | Planned task／evidence    |
| ------------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------- |
| EX-01, EX-02, EX-03, EX-04     | A3／A3S／B3 unified Excess scope                            | `excess-allowance-control / Unified Covered and Excess Split`; modified import／export transaction specs             | TC-02, Core Calculation  | 2.1–2.4; unit + API cases |
| EX-05, EX-06, EX-07            | Covered／Excess split and exact boundary                   | `excess-allowance-control / Unified Covered and Excess Split`; `balance-calculation / Currency Conversion Precision` | Core Calculation         | 2.2, 5.1                  |
| EX-08, EX-09                   | Pending reservation and function-specific approved conversion timing | `excess-allowance-control / Pending and Approved Excess Lifecycle`; `maker-checker-control / 服務端權威重新驗證` | Maker／Checker Data Flow | 3.1–3.3a, 3.6, 5.2        |
| EX-10, EX-11                   | Excess does not increase contract; immutable attribution   | `balance-calculation / Excess Aggregates Are Separate`; `contract-movement-model / Immutable Excess and FX Evidence` | API and Data Model       | 1.2–1.4, 5.3              |
| ALW-01, ALW-02, ALW-03         | Allowance percentage／maximum／owner                       | `excess-allowance-control / Owner-level Excess Allowance`; `Effective-dated Excess Policy`                           | TC-01, TC-02             | 1.1, 2.1, 3.1             |
| ALW-04, ALW-05                 | USD cap→owner provider conversion and owner-currency allowance equation | `excess-allowance-control / Owner-level Excess Allowance`; `balance-calculation / Allowance Reservation Sufficiency` | TC-07, Core Calculation | 2.2, 2.5–2.7, 3.2       |
| ALW-06, ALW-07, ALW-08         | Cumulative Approved Excess and no reuse                    | `Pending and Approved Excess Lifecycle`; `downstream-excess-eligibility / Downstream Completion Does Not Release`    | TC-02, TC-04             | 3.2–3.4, 3.6, 7.2, 7.12   |
| ALW-09, ALW-10                 | Exact-limit success and A3／A3S／B3 over-limit HTTP 409 zero-write rejection | `Owner-level Excess Allowance`; `Maker Excess Submit Atomicity`                                         | TC-03, Core Calculation  | 3.3a, 5.2, 7.1, 7.12     |
| SG-01～SG-08                    | Historical A3S capacity anti-double-counting lineage | superseded by V2 normalized Base Parent Tight + Current SG Redemption contract; main SG behavior out of scope | TC-08, Core Calculation  | Task 10.2 focused regression |
| MC-01, MC-02, MC-03            | Maker submit validation／reservation／atomicity            | `maker-checker-control / Maker Excess Submit Atomicity`                                                              | Maker Data Flow          | 3.1–3.3, 5.2              |
| MC-04, MC-05, MC-06            | Checker re-read／revalue／convert                          | modified `Service-authoritative Revalidation`; `currency-exchange-integration / Checker Release Revaluation`         | Checker Data Flow        | 3.4–3.6                   |
| MC-07, MC-08                   | Applicable Checker decision failure retains pending facts  | `Checker Release Revaluation` rejection scenario                                                                     | TC-07                    | 3.5, 3.6, 7.4, 7.12      |
| MC-09, MC-10                   | Fix amount only for B3 and pre-Acknowledge A3／A3S          | modified `maker-checker-control / Fix Pending Limits`; UI `Excess-specific Fix Pending`                              | TC-11; Fix, Delete, Reject | Task 10.2／10.4          |
| MC-11, MC-12, MC-13            | Reject retains／Delete releases／Resubmit identity／concurrency | `Pending and Approved Excess Lifecycle`; `Resubmit Identity and Reservation Replacement`                         | TC-03, Fix／Delete／Reject | 3.7, 3.8, 5.4, 7.12    |
| FI-01, FI-02, FI-03            | Existing A2／B2 unchanged; latest approved basis on Resubmit | `Formal Increase Guidance Without Cure Transaction`; `Minimum Required Increase Guidance`                          | TC-04                    | 3.9, 5.5, 7.5             |
| FI-04, FI-05                   | Immutable Approved Excess; no active allocation／cure capability | `contract-movement-model / Immutable Excess and FX Evidence`; negative cure contract; compatibility migration   | TC-04                    | 1.2a, 3.9                  |
| FI-06, FI-07                   | Scope-corrected by BD-07: no Return／partial cancellation adjustment; whole Delete Pending only | `Full Delete Pending Only`; `No Return Documents Command`                                           | TC-05, BD-07             | 2.4, 3.8, 3.10, 5.6       |
| FX-01, FX-02, FX-03            | USD→owner Booking purpose, provider convertedAmount, Approved／Effective | `currency-exchange-integration / Authoritative Booking Rate Contract`                                     | TC-07                    | 2.5a, 2.6a, 2.7           |
| FX-04, FX-05                   | Decision-point revaluation and snapshots                   | `Maker Submit FX Fail-Closed`; `Checker Release Revaluation`; immutable evidence                                     | TC-07                    | 3.2, 3.5, 3.6, 5.3, 7.12 |
| FX-06, FX-07                   | Freshness／unavailable typed outcomes                      | `Maker Submit FX Fail-Closed`                                                                                        | BD-01, TC-07             | 2.7, 7.4                  |
| FX-08, FX-09                   | Retry／timeout／out-of-order；per-attempt ID echo matching | `FX Retry and Out-of-order Safety`                                                                                   | TC-07                    | 2.8, 7.4                  |
| FX-10                          | USD par                                                    | `USD Par and Non-production Stub Boundary`                                                                           | TC-07                    | 2.6, 7.4                  |
| FX-11                          | FX／authorized PBD audit evidence                          | `Immutable Excess and FX Evidence`; `Production Provider-supplied Booking Rate Only`; API inquiry                    | BD-05, TC-07             | 1.4, 2.7, 5.3, 7.4        |
| DS-01, DS-02, DS-03            | Downstream source eligibility／command revalidation        | `downstream-excess-eligibility / Excess-aware Downstream Eligibility`                                                | Service Boundaries       | 4.6, 6.2                  |
| DS-04, DS-05, DS-06            | Completion preserves Approved Excess                       | `Downstream Completion Does Not Release Approved Excess`                                                             | TC-02, TC-08             | 4.6, 7.2                  |
| DM-01, DM-02                   | Excess account／append-only ledger                         | `Owner-level Excess Allowance`; `Immutable Excess and FX Evidence`                                                   | TC-02, Data Model        | 1.2–1.4                   |
| DM-03, DM-04                   | FX snapshot／configuration version                         | `Authoritative Booking Rate Contract`; `Effective-dated Excess Policy`                                               | TC-01, TC-07             | 1.1, 1.3, 2.5             |
| DM-05                          | A3S normalized self-leg anti-double-counting         | modified `Avoid Double Counting`; main SG processing out of scope                                      | TC-08                    | Task 10.2／10.5 focused regression |
| DM-06                          | Status separation                                          | modified `contract-movement-model / Status Separation`                                                               | TC-03                    | 1.2, 5.3                  |
| REG-01, REG-02, REG-03, REG-04 | A3／A3S／B3 covered／excess boundaries                      | `business-case-runner / Excess Regression Suite`                                                                     | Core Calculation         | focused Runner matrix     |
| REG-05, REG-06                 | Maker／all Checker decision-point FX fail-closed and revaluation | `Virtual Booking Rate Regression`; FX delta specs                                                               | BD-01, TC-07             | 2.6a, 3.6, 7.4, 7.12, 8.1 |
| REG-07                         | A3S normalized self-leg no double count             | `A3S Anti-double-counting Regression`                                                                                 | TC-08                    | Task 10.2／10.5    |
| REG-08                         | Downstream does not release                                | `Existing Lifecycle Regression`; downstream delta                                                                    | TC-02                    | 7.2                       |
| REG-09                         | Formal Increase guidance-only boundary                     | Minimum Required Increase／Resubmit scenarios and negative cure contract                                              | TC-04                    | 7.5                       |
| REG-10                         | Scope-corrected negative regression: no Return／partial cancellation; full Delete Pending only | negative command／API cases plus full reservation release                                           | TC-05, BD-07             | 7.6                       |
| REG-11                         | Concurrency／idempotency                                   | `Allowance Reservation Sufficiency`; modified movement idempotency                                                   | TC-06                    | 5.4, 7.7                  |
| REG-12                         | Full regression                                            | `business-case-runner / Existing Lifecycle Regression`                                                               | Migration／Rollback      | 7.8–7.10                  |

## Conflict Resolution Register

| Conflict                           | Resolution in this Change                                                                                                                                  | Evidence gate                                           |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| C-01 A3 hard-reject                | Modified A3 permits allowance-controlled Excess only when both policy values are greater than zero; BD-03 preserves legacy hard-reject when either is zero | A3 exact／over-limit plus zero-config legacy regression |
| C-02 scope-excluded transaction    | No resolution is created by this Change; current spec and `main` remain authoritative                                                                      | Git scope-cleanup review plus baseline regression       |
| C-03 B3 hard-reject                | Modified B3 permits allowance-controlled Excess only when both policy values are greater than zero; BD-03 preserves legacy hard-reject when either is zero | B3／B4 persistence plus zero-config legacy regression   |
| C-04 A3S SG Redemption coupling    | main SG Redemption／Available Balance／Account Entries不變；本Change只以normalized Base Parent Tight + Current SG Redemption計算split並淨除self legs | `4000 + 6000 / 10200` focused regression plus main baseline |
| C-05 Generic Fix Pending           | Amount exception limited to B3 and pre-Acknowledge A3／A3S                                                                                                  | API／UI protected-field tests                           |
| C-06 Approved Excess lifecycle     | Append-only owner ledger survives in-scope downstream completion                                                                                           | A4／A6／B4 regression                                   |
| C-07 Current OpenSpec truth        | Delta specs replace conflicting current requirements only after implementation and archive                                                                 | strict validation before and after archive              |
| C-08 V4 Return Documents wording   | BD-07 supersedes the unsupported “existing／new Return Documents” wording: no Return／partial cancellation capability; Delete Pending is whole-transaction only | negative API／event tests and full Delete Pending audit |
| C-09 Generic post-Acknowledge A3／A3S Fix | BD-10 prohibits Amount Fix／Resubmit whenever `acknowledgedAt != null` because Legal／Covered／Excess is locked; API rejects before policy／FX／writes | protected UI plus both-state HTTP 409／zero-write API regression |
| C-10 Export authorization timing | FROZEN V2 supersedes B3-only／B4-read-only：B3 locks split；B4 asset creation validates authorization and snapshots debtor | B3 absence + B4 authorization／atomic asset regression |

## Decision Traceability

| Decision                                                      | Proposal／Design                                                     | Delta Specs                                                                                                            | Regression                     |
| ------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| BD-01 Maker FX Fail-Closed, no `FX_RATE_PENDING`              | Proposal BD-01; Design TC-07                                         | `currency-exchange-integration`, `maker-checker-control`, `contract-movement-model`                                    | REG-05／REG-06; task 7.4       |
| BD-02 Virtual Booking Rate midpoint                           | Proposal BD-02; Design adapter assessment and production prohibition | `Virtual Booking Rate Derivation`; `Production Provider-supplied Booking Rate Only`; Runner production negative case   | task 2.6, 2.7, 7.4, 8.1        |
| BD-03 Zero Allowance Legacy Fallback（任一零值 = 不允許超押） | Proposal BD-03; Design TC-09                                         | `Zero Allowance Uses Legacy Sufficiency`; `Zero Allowance Skips Currency Exchange`; `Zero Allowance Legacy Regression` | task 0.3, 2.9, 3.11, 5.7, 7.11 |
| BD-04 A3S sequential guidance                                | Proposal BD-04; Design TC-10                                         | `A3S Sequential Alternative SG Guidance`; `A3S Sequential Resolution Guidance`                                       | task 6.5, 7.12                 |
| BD-05 Policy-controlled provider PBD Booking                 | Proposal BD-05; Design TC-01／TC-07                                  | `Effective-dated Excess Policy`; `Production Provider-supplied Booking Rate Only`; per-decision-point PBD regression | task 1.1a, 2.7, 3.6, 7.4       |
| BD-06 revised over-limit zero-write and Formal Increase boundary | Proposal BD-06; Design TC-03／TC-04                               | `Owner-level Excess Allowance`; `Maker Excess Submit Atomicity`; `Formal Increase Guidance Without Cure Transaction` | task 0.6, 3.3a, 3.7–3.9, 5.2, 6.4, 7.5, 7.12 |
| BD-07 Full Delete Pending Only／No Return Documents           | Proposal BD-07; Design TC-05                                         | `Full Delete Pending Only`; `No Return Documents Command`; negative import／export capability contracts               | task 0.5, 2.4, 3.8, 3.10, 4.5, 5.6, 7.6 |
| BD-08 Fix Pending Atomic Amount Replacement                  | Proposal BD-08; Design Fix／Delete／Reject                            | `Fix Pending 限制`; `Excess-specific Fix Pending`; approved `10200/200 → 10300/300` and `10100/100` examples          | task 0.5, 3.7, 6.3, 7.12 |
| BD-09 A3／A3S two-stage approval timing                      | Proposal BD-09; Design Checker Data Flow                             | `Pending and Approved Excess Lifecycle`; A3／A3S acknowledgement; Checker revaluation; downstream finalisation       | task 0.6, 3.6, 4.2–4.4, 4.6, 7.2, 7.3, 7.12 |
| BD-10 A3／A3S Post-Acknowledge Amount Fix Prohibited             | Proposal BD-10; Design TC-11                                         | `Fix Pending Limits`; `Excess-specific Fix Pending`; post-Acknowledge HTTP rejection and import lifecycle boundary   | Task 10.2、10.4、10.5 |
| BD-12 Runner-only Automatic A02／B02                          | Proposal BD-12; Design TC-12                                         | `business-case-runner / Runner-only Automatic Formal Increase Journey`                                                | backend Runner TDD + real-service A3／A3S／B3 trace |

## Final Clarification Requirement Matrix

Rows below are normative and supersede conflicting historical rows above. Scope-excluded transaction rows are intentionally absent.

| Requirement ID | Final business rule | Proposal／Design | Delta Specs | Planned task／evidence |
| --- | --- | --- | --- | --- |
| V2-A3S-01 | `Effective Capacity = normalized Base Parent Tight + Current SG Redemption`；Covered=min；Excess=max差額 | BD-04／08／09；TC-08 | import、earmark、balance、allowance | 10.2；`4000 + 6000 / 10200` TDD |
| V2-A3S-02 | main SG Redemption、SG Available Balance、Account Entries完全不變；self SG／LC UTILIZE legs各淨除一次 | Scope boundary；TC-08 | import、earmark、Runner | 10.1、10.2、10.5；main baseline + pending-leg case |
| V2-LOCK-01 | A3／A3S Acknowledge鎖定Legal／Covered／Excess；A3S另鎖定三個capacity inputs | BD-09；TC-08 | import、contract、Maker／Checker、HTTP | 10.2、10.4 |
| V2-LOCK-02 | A4／A6只重驗FX、allowance、eligibility，不因later Tight重新拆分；waiver gate由BD-17取代 | BD-09／17；Checker Flow | import、FX、downstream | 10.2、10.5 |
| V2-FIX-01 | A3／A3S Amount Fix只可在Acknowledge前；A3S Fix須重新normalize／重讀redemption | BD-08／10；TC-11 | Maker／Checker、HTTP、UI | 10.2、10.4 |
| V2-DM-01 | 每個A3／A3S／B3 event保存Legal／Covered／Excess與statuses；A3S加三個capacity inputs | Data Model Shape | contract-movement-model、HTTP | 10.2、10.4 |
| V2-CAP-01 | 只有Covered影響formal LC／Confirmation capacity；Excess不得增加、減少、恢復或重複扣減Tight | TC-17 | balance、import、export、Runner | 10.2、10.3、10.5；10,200／10,000／200 regression |
| V2-EXCEED-01 | A3／A3S／B3顯示四個Protected Exceed fields：Previous active outstanding Pending＋Approved（terminal allowance commitments及Fix self排除）、This=max差額、Total=Previous＋This、Maximum=`MIN(face excluding tolerance × allowance%, configured USD cap合規換算至transaction currency)`而非raw cap；Import LC Amount=`Issue + cumulative formal approved Increase - cumulative formal approved Decrease`，Pending／unapproved amendment不生效；任一配置為0則Maximum=0／no Excess；preview zero-write且Maker Submit權威重算 | TC-18（bug alignment；no new BD） | balance、allowance、HTTP／inquiry、UI | 10.4a；LC amount amendment-state／MIN operands／zero config／USD_PAR／non-USD BOOKING／stale-unavailable／Fix-self／concurrency matrix |
| V2-A6A7-01 | A6保存完整Legal Acceptance及locked attribution、不建立新capacity running balance；A7只減Legal outstanding且不重新allocation | BD-09；Checker Flow | downstream、Runner | 10.2、10.5 |
| V2-B5-01 | B5只settle Legal Outstanding，不auto-clear／merge Covered與Excess assets或減少Approved Excess | TC-15 | export、downstream、Runner | 10.3、10.5 |
| CU-IW-01 | `SUPERSEDED`：A4／A6不再要求Applicant Waiver `CONFIRMED`；正數Excess改用共同`ABSENT + Checker Approve`，Covered-only事件不得因LC aggregate顯示warning | BD-17；TC-13／19 | import、Maker／Checker、downstream、HTTP、UI | 10.2c／10.4c；A4／A6 ABSENT及B01=0／B02>0 TDD |
| CU-IW-02 | `SUPERSEDED`：未勾選共同Checker Approve時UI禁止Release並保留pending facts；服務端不得回傳`APPLICANT_WAIVER_REQUIRED` | BD-17；TC-13／19 | `http-api-and-inquiry`; `business-case-runner` | 10.2c、10.4c；common approval assertions |
| CU-IW-03 | `SUPERSEDED`：新Release不得保存waiver snapshot；legacy欄位／table只作歷史讀取及API相容 | Design TC-13 | `contract-movement-model`; `http-api-and-inquiry` | 10.2c；zero-new-snapshot TDD |
| CU-EA-01 | B4 asset creation時authorization只接受完整覆蓋；不足額視為無有效授權且不得partial split | BD-14；TC-14 | `export-confirmation-transactions`; `business-case-runner` | 10.3；200／100 negative |
| CU-EA-02 | B4系統驗reference、amount、owner currency；Checker人工確認scope／applicability／authenticity並提交`CONFIRMED`；Checker==Maker拒絕整個action，不得route to Recourse | BD-14；TC-14 | `maker-checker-control`; `http-api-and-inquiry` | 10.3；objective／manual／4-Eyes matrix |
| CU-EA-03 | 不得新增或假設external authorization lookup service | BD-14；TC-14／Service Boundaries | export、HTTP delta specs | 10.3；architecture negative proof |
| CU-EA-04 | 完整有效授權→完整Excess debtor=Issuing Bank；否則完整Excess debtor=Beneficiary／Recourse Party；B4 warning只依selected B3 event的This Exceed判斷，B01=0不顯示而B02>0顯示 | BD-14；TC-14 | export、downstream、inquiry、UI specs | 10.3、10.4；debtor attribution及B4 event-specific warning cases |
| CU-UI-01 | A4／A6／B4正數Excess使用完全相同的紅色This Exceed＋Checker Approve UI與ABSENT操作；未勾選不得Release | BD-17；TC-19 | transaction-builder-ui | 10.4c；shared component／parent gate TDD |
| CU-UI-02 | A4／A6不要求或保存Applicant Waiver；B4固定ABSENT authorization path且不顯示Submitted fields；backend compatibility保留 | BD-17；TC-13／19；BD-14 | import、transaction-builder-ui、HTTP、export | 10.2c／10.4c；A4／A6／B4 ABSENT regression |
| CU-AS-01 | Export Excess使用獨立`EXPORT_EXCESS_ASSET`；debtor只是attribution | BD-15；TC-15 | `accounting-mapping-and-vouchers`; export spec | 10.3 |
| CU-AS-02 | Sight Covered沿用`Due from Issuing Bank`，不得改名為泛稱 | BD-15；TC-15 | accounting、balance、inquiry specs | 10.3、10.4；mapping／voucher TDD |
| CU-AS-03 | Usance Covered沿用`Reimbursement Receivable`，不得改名為泛稱 | BD-15；TC-15 | accounting、balance、inquiry specs | 10.3、10.4；mapping／voucher TDD |
| CU-AS-04 | Covered Asset + Excess Asset = Legal Amount；10,000 + 200 = 10,200 | BD-15；TC-15 | accounting、balance、downstream、Runner specs | 10.3、10.4；Sight／Usance reconciliation |
| CU-AS-05 | B4原子建立兩腿；B5保持分離，不得merge／double-count／auto-clear | TC-15 | export、downstream、Runner specs | 10.3、10.4；atomic rollback + B5 regression |
| CU-RG-01 | mapping、vouchers、Runner、regression及traceability同步覆蓋FROZEN V2 | Impact／Review Gate | all affected delta specs | 10.2–10.6 |
| CU-GATE-01 | BA、4-Eyes、QA、strict validation及renewed Change Approval gate已完成；後續Owner-approved bug correction須同步OpenSpec、TDD與regression後才可封版 | FROZEN V2 Authority；Design precedence | Tasks 9.4–9.6、10.4c | Review reports + strict output + user approval |

## Out-of-Scope Historical Traceability

| Historical item | Status | Treatment |
| --- | --- | --- |
| EX-01～EX-04及REG-01～REG-04中的scope-excluded function部分 | `OUT_OF_SCOPE` | 不形成requirement；A3／A3S／B3部分仍有效 |
| C-02舊policy-enabled Excess resolution | `OUT_OF_SCOPE` | current spec及`main`保持權威 |
| BD-11 Covered／Excess attribution及Excess-first transfer | `OUT_OF_SCOPE` | 不形成technical contract；A3S只保留V2 normalized Covered／Excess calculation，main SG behavior不變 |
| Old selected existing Eligible SG Capacity as Excess basis | `SUPERSEDED` | 以V2 normalized Base Parent Tight + Current SG Redemption取代 |
| Old B3-only authorization／B4 read-only | `SUPERSEDED` | B3鎖定split；B4建立assets時完成authorization decision |
| `EXCESS_RECOURSE_ASSET` name | `SUPERSEDED` | canonical name為`EXPORT_EXCESS_ASSET` |
| Tasks 0–8中的相關implementation evidence | Historical only | 不得作為本Change acceptance evidence；implementation scope cleanup後以baseline regression驗證 |
| Runner中的相關automatic remediation | `OUT_OF_SCOPE` | Runner auto Increase只適用A3／A3S／B3 |

## Final Decision Traceability

| Decision | Proposal／Design | Delta Specs | Regression |
| --- | --- | --- | --- |
| V2 A3S normalized calculation and main boundary | Proposal scope／BD-04／08／09；Design TC-08 | import、earmark、balance、allowance、Runner | V2-A3S-01～02 |
| V2 Acknowledge locked split／no re-split | Proposal BD-09／10；Design Checker Flow／TC-11 | import、Maker／Checker、FX、downstream、HTTP／UI | V2-LOCK-01～02、V2-FIX-01 |
| V2 event invariant | Design API and Data Model Shape | contract-movement-model、HTTP | V2-DM-01 |
| BD-13 Applicant Waiver（`SUPERSEDED`） | Proposal BD-13；Design TC-13／19；BD-17 | import、Maker／Checker、downstream、HTTP、UI | CU-IW-01～03（superseded compatibility rows） |
| BD-14 Export Authorization All-or-Nothing | Proposal BD-14；Design TC-14 | export、Maker／Checker、downstream、HTTP、UI | CU-EA-01～04 |
| BD-15 Dedicated Export Excess Asset | Proposal BD-15；Design TC-15 | accounting、export、balance、downstream、HTTP、UI | CU-AS-01～05 |
| BD-16 Percentage allowance excludes Tolerance | Proposal BD-16；Design Core Calculation | balance-calculation、allowance、import | LC 10,000 + tolerance 10% + allowance 2%：11,200 PASS／11,201 zero-write reject |
| BD-17 Unified ABSENT Checker Excess Approval | Proposal BD-17；Design TC-13／19 | import、transaction-builder-ui | CU-UI-01～02；Task 10.2c／10.4c |
| BD-16 approval gate | Business user approval 2026-09-23 | OpenSpec strict 16／0；BA／4-Eyes／QA PASS | Task 10.2b complete |
| Four Protected Exceed fields bug alignment（no new BD） | Design TC-18 | allowance、HTTP／inquiry、UI | V2-EXCEED-01；Task 10.4a |
