---
knowledge_id: sonarqube-quality-gate-sustained-pass-across-three-scans
title: "SonarQube 质量门禁——连续三次扫描持续 PASS"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# SonarQube 质量门禁——连续三次扫描持续 PASS

三次带日期记录的 SonarQube 扫描（2026-08-17 初次 FAIL→当日转为 PASS、2026-08-17 最终版、2026-08-20 完整重扫）追踪了代码库从 7,981 行到 11,574 行有效代码（ncloc）的变化。三次扫描均以质量门禁 PASS 收尾，Bugs=0、Vulnerabilities=0、未审阅的安全热点（Security Hotspots）=0，Reliability/Security/Maintainability 三项评级均为 A。代码异味（Code smells）从 35 增至 56（+21），但增幅相对于 45% 的代码量增长而言属于次线性（主要是认知复杂度与嵌套三元表达式计数，反映了从 BAL-003 God Component 拆分中迁移过来的逻辑）。尽管代码量在增长，重复率仍从 6.4% 改善至 4.7%。

## Source Evidence

- `Sonar-Scan-Report.md:1-53`
- `SonarQube-report2.md:1-38`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]

## 2026-08-29 更新 —— 真正的第四次 SonarQube 掃描（2026-08-26）：Quality Gate 一度 FAILED，修復後重新掃描 PASSED；`release()`/`validateSubmit()` 拆解

CONFIRMED（已對照 `docs/history/implementation-log.md` 決策日誌與現行原始碼逐一核實）：本文既有的「連續三次掃描持續 PASS」記錄止於 2026-08-20；2026-08-26 進行了第四次真實掃描（非人工複核），這一次 Quality Gate 一度 **FAILED**——New Duplicated Lines Density 5.15%（門檻 3%），根因是 `backend/data/businessCases.js` 登記表自身的增長（2,532 行新增行中 2,057 行重複，佔 81%）疊加新增的 `domesticCalendar.ts`/`domestic-calendar.ts` 一對檔案。修復方式：在 `sonar-project.properties` 新增 `sonar.cpd.exclusions=backend/data/businessCases.js`（引用 BAL-127——此檔案的重複是已披露的設計取捨，非缺陷），重新掃描後 Quality Gate 轉為 **PASSED**，New Code Density 降至 0.96%、專案整體 2.1%。已對照現行 `sonar-project.properties:25` 核實該排除規則仍然存在。

同一輪掃描也拆解了兩個最嚴重的認知複雜度（Cognitive Complexity）發現，純粹搬移程式碼、行為零變化：
- `microservices/balance-component/src/service/balanceService.ts` 的 `release()`（原複雜度 93，全庫最高）拆成 `assertReleaseSubmitGuards()` / `assertReleaseEligibility()` / `applyReleaseSideEffects()` / `applyAmendExpiryDateReleaseSideEffect()` 四個私有方法——已對照現行原始碼核實這四個方法仍存在（`balanceService.ts:2031,2034,2099-2100,2111,2183,2279`）。
- `src/app/transaction-builder/submit-rules.ts` 的 `validateSubmit()`（原複雜度 60）拆成 `validateMandatoryFields()` / `validateNaturalKeyFields()` / `validateFunctionSpecificRules()` 三個函式——已對照現行原始碼核實仍存在（`submit-rules.ts:63,124,157,241-247`）。
- `builder-fields.ts` 的 `buildFields()` 內一段 6 層巢狀的 Amount 標籤三元運算式抽出為 `amountFieldLabel()`（同時關閉 5 個 `S3358` 發現）——已對照現行原始碼核實仍存在（`builder-fields.ts:169,262`）。
- `maker-panel.component.ts` 的 `afterResolved()`/`refreshSelectedContractSnapshot()` 兩組重複的 if/else-if 分支（`S1871`）合併為單一布林守衛。
- 7 個 `Web:AvoidCommentedOutCodeCheck` 誤判透過 SonarQube API 直接標記 `WONTFIX`。

**未完全解決、已披露的取捨**：`release()`/`validateSubmit()` 拆解後，各自產生一個低於 15、一個仍高於 15 的子函式（29/19 與 21/26），總認知複雜度與 SQALE 技術債分鐘數均下降（1,672→1,651；651min→445min），但 `S3776` 發現「筆數」反而從 17 上升到 19（一個 93 複雜度發現變成兩個較小的發現，而非歸零）。決策記錄明確表示「不再進一步拆分」——每個剩餘片段已是一個內聚的關注點（同一個 movementType 守衛群組），純粹為了迎合行數指標而拆分屬於「為拆分而拆分」，與 BAL-003 God Component 收尾時已經拒絕的立場一致。這與 [[Knowledge-Gaps#GAP-073|GAP-073]] 提出的「是否計劃對 createMovement()/builder-fields.ts/inquire-events.service.ts 進一步拆分」問題直接相關——**本次掃描並未觸及 `createMovement()` 本身或 `inquire-events.service.ts` 的複雜度**，僅 `builder-fields.ts` 得到上述局部（三元運算式抽出）處理；GAP-073 的問題應視為仍然 OPEN，而非本次更新已解決。

驗證：三套測試套件全綠（Angular 1171/1171、backend 38/38、microservice 585/585，覆蓋率無退步），另有一次真實瀏覽器走查（A1 Issue→Release、A8 SG Issue→Release、A9 SG Full Redeem→Release、A10 LC Close→Release）確認 `release()`/`submit-rules.ts`/`builder-fields.ts` 重構後行為與重構前完全一致，Console 無錯誤。

### 證據來源（本次更新）
- `docs/history/implementation-log.md:2456-2488`
- `sonar-project.properties:25`
- `microservices/balance-component/src/service/balanceService.ts:2031,2034,2099-2100,2111,2183,2279`
- `src/app/transaction-builder/submit-rules.ts:63,124,157,241-247`
- `src/app/transaction-builder/builder-fields.ts:169,262`
