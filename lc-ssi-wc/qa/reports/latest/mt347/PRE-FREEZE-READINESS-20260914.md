# MT3／MT4／MT7 預封版檢查（2026-09-14）

## 結論

**HOLD — 不可宣稱已封版或已通過 MT347 驗收。** 本報告只評估 MT3／MT4／MT7 的本次預封版。MT2／pacs.009 scenarios 留待下一輪用相同方法獨立審核；本輪 MT2 檢查僅是避免回歸破壞的保護門檻。

檢查對象是 `master`、HEAD `cb459cfaa33c778e8fb0d06548e77e4de0c9c708` 的**未提交工作樹**，不是可重現的 release commit。工作樹含多項既有修改與未追蹤檔案；沒有建立 tag、commit 或部署。

## 目前檢查結果

| 門檻                              | 結果        | 證據／說明                                                                                                                               |
| --------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| CI unit/integration               | PASS        | `npm run verify`：8/8 test projects；Portal 35 suites、304 tests，Service 51 suites、748 tests；6/8 使用 Nx cache                        |
| Lint                              | PASS        | `npm run lint`                                                                                                                           |
| Typecheck                         | PASS        | `npm run typecheck`：8/8 projects；0/8 cache hit                                                                                         |
| Build                             | PASS        | `npm run verify`：5/5 projects；5/5 使用已由目前輸入驗證的 Nx cache                                                                      |
| MT347 v6 audit unit               | PASS        | `node --test scripts/mt347-v6-qa/*.test.mjs`：12/12                                                                                      |
| MT347 v6 acceptance audit         | **BLOCKED** | `scripts/mt347-v6-qa/output/current.json`：2 PASS、1 FAIL、2 NOT_EXECUTED；`acceptanceClaim=false`                                       |
| SonarQube scan                    | PASS        | Quality Gate `OK`；analysis `AaCeh844BMerP1wRaGEt`；worktree digest `6587f9c71cd3e8988a99fb3ec305788f48182ac83721979704b38de3c1d9432f`   |
| Dependency audit                  | **FAIL**    | `npm audit --audit-level=high`：19 vulnerabilities，含 10 high、9 moderate                                                               |
| MT2 browser smoke protection      | PASS        | `npm run qa:mt2:ui`：4 message types、4 scenario codes、28 Bank Service responses                                                        |
| MT2 v15.3 data-quality protection | **FAIL**    | `npm run qa:mt2:v153:data-quality`：預期 HTTP 409，實際 HTTP 200；見 `qa/reports/latest/mt2/MT2XX_v15.3_browser_DATA_QUALITY_409_20260912.json` |

### SonarQube 實掃細節

掃描包含 `apps`、`libs`、MT2/MT347 QA scripts；這是共用 repository 的品質門檻，**不是 MT2／pacs.009 scenario 審核**。Sonar 9.9.8、Scanner 8.0.1；當次 coverage 從完整 CI 測試後的 LCOV 匯入。

- Quality Gate：`OK`；new reliability rating `1`（A）、new security rating `1`（A）、new maintainability rating `1`（A）。本次 Gate 未配置 new coverage condition，因此不得將 Gate `OK` 解讀為 overall coverage 已達 80%。
- Overall coverage `79.5%`；Portal Jest lines `84.65%`（2202/2601）；new duplication `0.0%`；overall duplication `0.8%`。
- Open bugs `0`、vulnerabilities `0`、new code smells `0`；open Blocker `0`、Critical `17`、Major `28`、Minor `62`。原兩個 MT347 Page Parameters regex precedence bugs 已修復並由 Service 51 suites／748 tests 驗證。
- 原 2026-09-12 Joint BA/QA 報告所載 Sonar `OK`、Critical/Major `0/0` 和 coverage `83.7%` 屬**舊 analysis**，不可用來代表本次工作樹。
- Scanner 綁定的是未提交工作樹 digest；正式 release commit 完成後，必須重跑並綁定該 commit identity。

### MT347 acceptance audit 阻擋

- TDD v6 workbook/control ledger PASS：362 cases，152 positive、208 negative、2 boundary。
- ADR-001 architecture gate FAIL：Angular runtime 掃到 196 個 message/scenario-specific 判斷，和 API-driven UI 原則不一致；不能把靜態掃描的結果改標為 PASS。
- API → Page Model → UI runtime pass-through trace 尚未提交；`NOT_EXECUTED`。
- 42 筆 upstream full-FIN validator 實際執行證據尚未提交；`NOT_EXECUTED`。2026-09-12 Joint BA/QA 報告基於 TDD v5 記載 41 筆；目前 TDD v6 audit 是 42 筆，兩者不可混用，須以受控 v6 ledger 核對差異。
- `MT2_PACS009_REGRESSION_MANIFEST` 的 audit PASS 只代表 manifest 格式有效，其狀態仍是 `PLANNED_NOT_EXECUTED`，**不是** MT2／pacs.009 regression PASS。

### MT2 保護回歸的解讀

一般 MT2 browser smoke PASS，但 Data Quality 409 case 實際命中 `SSI-UAT-GEN-02`，回傳 `RESOLVED`/HTTP 200。可能是 fixture／資料狀態與測試前提不符，也可能是 fail-closed 行為缺陷；目前證據不足以擇一，不能直接改測試預期、覆寫 seed 或稱為通過。先保留失敗報告，核對 request、canonical seed/snapshot、corrupt scope 和路由判斷，再重測。不得為修 MT347 破壞既有 MT2／pacs.009 資料。

## 文檔核對

- `docs/architecture/ADR-001-api-driven-ui.md`：OAS/Configuration → API → Page Parameters → Generic UI 原則清楚；目前 architecture audit 未達成。
- `docs/architecture/ADR-002-scenario-display-order.md`：Valid 0、Invalid 1、Boundary 2 及同 rank 依 description 排序的規則清楚。
- `openapi/swift-data-service.v1.json` 的 `x-resolution-page-field-policy`：MT400 58A/B/D、MT742/MT754 58A/D、MT754 53A/B/D 為受控 transaction input，適用 scenario IDs 有明列。
- 新增 `qa/user_guide/MT347-OPERATIONAL-53X-58X-INPUT-GUIDE.md`：只說明 MT3／MT4／MT7 Operational 的 53X／58X 額外輸入與使用步驟；Prettier check PASS。
- `qa/reports/latest/mt347/CHANGE-REQUEST-MT347-UI-SEQUENCE-COVERAGE-20260913.md` 與 `JOINT-BA-QA-MT347-FINAL-REPORT-20260912.md` 仍引用 TDD v5、169/41 owner split，屬歷史受控證據；目前 v6 audit 為 168/42。正式封版前需由 BA/QA 發布 v6 一致的更新報告，不應直接改寫歷史結論。

## 解除 HOLD 所需

1. 修復並重跑 MT347 architecture、runtime trace、42 筆 upstream validator 證據與受控案例 ledger；取得 BA/QA 對 TDD v6、SWIFT MRG 的共同簽核。
2. Sonar Quality Gate 已轉為 `OK`，但 overall coverage `79.5%` 仍低於內部 80% 目標，且尚有 17 Critical／28 Major code smells；需依封版標準處置或取得明確 waiver，並以 release commit 身分重掃。
3. 評估並處置 10 high dependency advisories；不得直接使用 `npm audit fix --force` 造成 Nx 降版或未受控的 breaking change。
4. 釐清並修復 MT2 Data Quality 409 保護回歸後重跑；再獨立安排 MT2／pacs.009 scenarios 的同方法審核。
5. 將待封版內容整理為受控、可重現的 commit，固定 OAS、TDD v6、fixtures、seed 與 DB snapshot 的 hashes；確認 rollback 路徑，再執行完整 `npm run verify`、Sonar、BA/QA UAT。

**本次只完成預封版檢查與用戶說明；未進行封版動作。**
