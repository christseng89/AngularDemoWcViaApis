# lc-ssi-wc 全專案作業模式與交付治理 — 中文版 v2

**狀態：CONTROLLED**  
**文件版本：v2.8.24**
**生效日期：2026-09-18**
**適用範圍：MT1／pacs.008、MT2／pacs.009 plain/COV/ADV、MT3＋MT4＋MT7（MT347）及未來所有 Message Family**

**文件定位：本檔是整個 `lc-ssi-wc` 的持續維護（Living）作業治理基準。** 所有角色、工作分派、協作、4-EYES、API 參數驅動 UI、DB、QA、品質門檻與交付流程均以本檔為準；流程持續改善時必須修改 Git-tracked 本檔並由 Git 保存歷史，不得只留在口頭、聊天或單次報告中。Semantic version 若存在，只是可選的人類／release label，不是身分或每次修改 Gate。

## 1. 不可違反的總原則

1. 唯一允許的執行資料流為：`Controlled OAS / Typed Contract + Controlled Parameters / DB -> Domain Policy / API -> Page Parameter Model -> Generic UI`。
2. API 是頁面參數與 SSI 業務規則的唯一真實來源；Screen/UI 只負責通用渲染、資料輸入、提交與結果呈現。
3. UI 禁止 hard-code MT/MX 類型、sequence、5x tag、scenario、polarity、fixture、NVR 或個案判斷。
4. 新增 Message Family 原則上只新增或修改配置、DB seed、API page definition 與測試資料；不得為每一支 MT 複製一套畫面。
5. 必須遵守 OOD、OOP、SOLID、DRY、Single Source of Truth；共用規則以 typed contract、domain service、policy、adapter 和 reusable component 實作。
6. 資料不足時補齊受控配置與 fixture，再 Reload DB；不得用 UI hard-code 或測試 stub 掩蓋正式資料缺口。
7. QA 採「做一段、測一段」；每一段 Red -> Green -> Refactor 後才合併到下一段。
8. 發現 Block、來源矛盾、資料不足或無法產生證據時立即報告，不得等到最後才揭露。
9. 完整交付鏈固定為：`受控來源/Memory -> TDD -> Configuration/DB -> Domain/API -> Page Parameters -> Generic UI -> BA+QA UAT`；每一段都必須以 version、rule ID、fixture binding 與 SHA 可追溯。
10. TDD、API 與參數驅動 UI 均禁止個案 hard-code。TDD 的 expected oracle 可明確固定，但必須存於受控案例／fixture 並引用規則來源；不得把 expected value、BIC、account 或案例特例埋入 production code。
11. OOD／OOP／SOLID／DRY 是合併與驗收 Gate：違反 Single Responsibility、Open/Closed、Liskov Substitution、Interface Segregation、Dependency Inversion 或複製共用邏輯者，不得以「功能可動」宣告通過。
12. `lc-ssi-wc` 是 SSI Resolution 微服務，不是 MT/MX 報文建檔系統。Screen/UI 只可要求會改變 SSI 選路或治理判定的最小 resolution context；完整報文、NVR、Sequence、provenance 與測試 oracle 必須由受控 scenario fixture／Page Parameters 隱藏提供，不得轉嫁為 Operational 使用者輸入。Lookup companion、version 與其他可確定性衍生值必須自動帶入且不得列為人工輸入。
13. 任何實際呈現、由使用者提供且對應 SWIFT 欄位的 SSI 輸入，其 `swiftTag`、`swiftOption` 與 official description metadata 必須由受控 OAS／Page Parameters 提供；Generic UI 只以唯一共用 formatter 顯示 `SWIFT <Tag+Option> • <Official Tag Description>`。不得只顯示 tag、內部 field ID 或 role，也不得由 API 預組另一份 display string或在個別 UI template hard-code tag description。非 SWIFT resolution context 使用清楚的業務名稱。
14. 所有 Message Family 的 Index 採向後相容的加法式演進：新增 `INPUT FIELDS` 或其他欄位時必須保留既有欄位、排序、搜尋及可存取操作契約。Index 的 `INPUT FIELDS` 只顯示精簡 SWIFT Tag／Option，不顯示 Tag Description；進入 Resolution Workbench 後，可見人工 SWIFT SSI 輸入才依第 13 條顯示 Tag／Option 與官方說明。Index 與 Workbench 均由同一份受控 OAS／Page Parameters metadata 投影，不得各自維護第二份欄位清單。
15. 所有 Message Family 的 Counterparty Picker 與 Resolve SSI 必須共用同一個受控 eligibility contract、context identity 及資料快照。對相同 Message／Scenario／Currency／Booking Entity／Value Date，任何顯示為可選的 Counterparty 必須可由 Resolve SSI 接受並執行；不符合資格者必須在選取前排除或明確標示 unavailable 與 governed reason，不得先允許選取，再以 fixture／Bank Service／版本不一致拒絕。
16. 所有 Message Family 的 SSI scope、角色、Tag／Option、required／conditional／omission、eligibility、帳戶與路徑裁定，必須依 Message Family／Scenario 適用性參照適用版本的 SWIFT Message Reference Guide（MRG）、Network Validated Rules（NVR）、其他受控 SSI 來源，以及僅在已核准 MT↔MX scope 適用的 ISO 20022／CBPR+ Usage Guideline／mapping 文件；MT347 對 ISO 20022／CBPR+／mapping 記為 `N/A` 並附原因，不得新增 converter／pacs gate。只擷取會改變 SSI resolution 或治理判定的部分，並保存來源版本、檔名、頁碼／rule ID 與 SHA。不得因參照完整報文標準而把非 SSI 欄位、完整報文建檔、translation 或外部 FIN／network validation 擴入本微服務。SSI-scope 來源衝突、缺頁或無 authoritative evidence 時依 Source Register 與 NVR owner 規則標示 `OPEN`／`NOT_PROVEN`／`NOT_EXECUTED`；未執行的完整 FIN／network validator 固定標示 `OUT_OF_SCOPE — CLOSED` 與 `FIN_VALIDATION=NOT_EVALUATED`，不得成為 SSI `OPEN`／`BLOCKED`。
17. Counterparty SSI 與 Own SSI／Nostro／Account Master 必須維持獨立資料 ownership，但在 resolution 前必須由 API eligibility 組成不可拆分、版本鎖定的完整 settlement route。此規則適用 MT2、MT3、MT4、MT7 及後續 family；每個 Scenario 的受控 policy 必須宣告 Counterparty／Receiver SSI bank 與 Own Nostro account servicer 的關係為 `SAME`、`DIFFERENT` 或 `NOT_APPLICABLE`。Resolver 必須以該關係淘汰不合格候選並決定 53／54／56／57／58 disposition；UI 不得自行比較 BIC 或推導 Tag。第一段 discovery 以幣別、booking entity、value date、message／scenario 等 context 回傳所有完整 route candidates、唯一推薦候選及 opaque snapshot；只有完整 route 唯一時才可自動選取。多個 eligible debit／credit／57A 組合時，UI 必須讓使用者選擇整條 route，不得逐欄混搭，也不得由 backend 依 UUID、版本、建檔時間或資料列順序靜默任取。第二段 resolve 只接受 selected route identity、discovery snapshot 與交易／冪等識別，重新驗證後原子回傳 Counterparty SSI、Own Nostro、MT 與 MX 同源結果；snapshot stale 時 fail closed，不得改選其他 route。
18. 本規範對所有參與者具強制力，包括主代理、子代理、BA Maker／Checker、QA、API／Backend、UI、Data／DB、Security、Reviewer、臨時專家及後續新增組員。每位成員開始任何分析、修改、測試、掃描或簽核前，必須讀取本規範，核對 active Git-tracked repository path 與外部任務交接／review evidence 指定的 exact Git commit；exact base／candidate commit 不嵌入規範或 manifest。Manifest 僅可作非權威 locator／metadata；semantic version 若存在只是可選標籤。未核對、使用舊 commit、只依聊天摘要或與本規範衝突的成果，一律不得合併、不得標示 PASS，也不得作為 4-EYES 證據。
19. RMA 是針對 chosen route 的實際 Receiver、service/channel、direction、exact message profile 與有效日所作的授權 Gate，不是 SSI route、MT↔MX mapping、顯示格式或預設 transport 的選擇器。受控 Message Profile／Delivery Policy 先決定正常 transport；SSI／Nostro 再決定 executable route 與 `actualReceiverBic`；RMA 最後逐 route 驗證。對 MT2／pacs.009，正常 default 為 FINPLUS／MX `pacs.009.001.08`（Core `swift.cbprplus.04`、COV `swift.cbprplus.cov.04`）；FIN／MT 僅能在正式 contingency policy、明確 intent／reason、權限與 4-EYES 下使用。FIN 與 FINPLUS 同時授權時仍不得由 RMA 任意選擇或自動偏好 FIN；只有 FIN 授權時不得靜默降級，正常 MX resolution 必須 fail closed。`displayFormat`（MX 或 MT compatibility view）必須與 `executionTransport`（FINPLUS 或 FIN）分離；切換 compatibility view 不得重跑 SSI、改 route／RMA／Nostro 或 snapshot hash。
20. 工作組必須配置獨立 DBA／Database Performance Engineer，且資料量增加時 DBA review 為強制 Gate。Operational、QA API 與 Browser UI 必須使用同一版本化 seed、fixture binding、logical snapshot 與 eligibility projection；QA-only／negative／boundary 資料必須隔離，不得滲入 Operational Picker。每個啟用幣別至少提供三條完整、RMA-authorised、可 Resolve 的 SSI route，API 依受控排序回傳唯一最佳預設。高頻 eligibility／route discovery／Resolve 查詢必須由 DB 先完成 filter／join／sort，只把候選結果交給中台；禁止每次請求全表讀取 JSON 後在 application memory 篩選。DBA 必須保存 row count、index／query plan、冷熱延遲、p50／p95／max、payload、WAL／lock 與 reload 前後 snapshot 證據；QA 必須以相同 snapshot 驗證 API 候選、default、UI 顯示與 Resolve 結果完全一致。Git-tracked 資料、索引、SQL 或 seed 任一變更，都產生新 candidate commit 並使既有 DBA／QA 簽認失效；runtime snapshot 改變亦使簽認失效，兩者必須按同一 exact Git commit／snapshot 重測。
21. MT1／pacs.008 Customer Payment domain 必須明確區分 Customer Party Master、Payment Instruction Profile、transaction-scoped Customer Payment Instructions（CPI）、Bank SSI、Clearing／Network Reference、Routing／Settlement Policy 與 Executable Payment Instruction。Customer 提供付款意圖、party/account、amount/currency、purpose/remittance 及受控 routing constraint；Customer data 不得標為 Bank SSI，Customer UI 不得顯示 `SSI Count` 或 `governed SSI record`。Own／Counterparty SSI、Nostro／Vostro、reimbursement agents/accounts、RMA 與 settlement method 均由銀行受控來源／政策解析。原始 customer intent 必須 immutable 並保留 provenance；bank enrichment 不得靜默覆寫。MT103／pacs.008 先限 Phase 1，其他 MT1xx 必須逐 Message 另做 MRG／NVR ruling。Serial／Cover、chain topology 與 INDA／INGA／COVE／CLRG 是不同維度；未有 current SR2026／CBPR+／PMPG 精確證據及 BA OPEN 裁決前，不得推定 populate／omit、correlation、UETR copying 或合法組合，必須 fail closed。
22. **Page-by-page 是全產品強制設計模式與容量 Gate。** 所有可能隨正式資料成長的 Index／List／Picker／Checker／Audit API，前端必須傳送受控 `page`、`pageSize`、filter/search、stable sort（或 opaque continuation token）；Backend／BFF 必須驗證並完整轉送條件，由 DB／authoritative repository 完成 filter、sort、count 及該頁 selection，只回傳本頁 projection 與 `page`、`pageSize`、`totalItems`、`totalPages`、`hasPrevious`、`hasNext`（或等價 cursor metadata）。禁止下載全表後在 Browser／BFF／application memory 篩選、排序再 `slice` 的假分頁；禁止以壓縮或新增一般 Index 掩蓋 over-fetch／N+1。排序必須附唯一鍵形成穩定次序；search-specific index／FTS 必須以 Query Plan 與容量證據決定。Frontend 與 Backend 工程師必須提供可驗證的設計模式能力／認證或由指定 Architecture Reviewer 完成等價 competency assessment，並以 API contract test、BFF forwarding test、DB Query Plan、cold/hot latency、payload、Browser UAT 證明符合本條；未具能力證據或違反者不得合併、不得標示 PASS。
23. **所有 Index Title 必須支援受控 ORDER BY。** RMA、Entities、Nostro、SSI、Checker、Audit、MT1／MT2／MT3／MT4／MT7 及未來所有 Index 的每個可排序資料欄位標題，必須可由鍵盤與滑鼠切換 `ASC`／`DESC` 並以 `aria-sort` 呈現狀態；Frontend 必須將 sort field／direction 與 page/filter/search 一併送至 BFF，BFF 必須完整轉送，Backend 只能將經 OAS／typed contract 白名單核准的欄位映射為 DB `ORDER BY`，並追加 immutable unique key 確保跨頁穩定次序，禁止直接拼接任意使用者 SQL。Checker 與 Audit 必須沿用原交易 Index 的相同欄名、欄序、search 與 sort contract，只能追加 Maker／Checker 與各自 Datetime；技術事件內容放入單擊 View，不得用另一套簡化且不可排序的 Event table 取代原 Index。只排序 Browser 當前頁、下載全表後排序或不同頁使用不同 tie-breaker 均不得驗收。

## 2. 角色與任務分派

| 角色                      | 主要責任                                                                                                                              | 不得做的事                                                                                    | 交付物                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Product Owner／需求核准者 | 確認範圍、優先序、環境政策及資料修正授權                                                                                              | 不以口頭指示取代受控裁定                                                                      | 已確認需求／裁定                                                  |
| BA Maker                  | 完整閱讀 SWIFT MRG、CBPR+ UG、受控 Memory 與來源檔；提出 scope、role、mapping、NVR、例外及 OPEN；與 QA 共同執行 UI UAT 並判定業務結果 | 未讀權威來源即擴張範圍；把觀察當規範；只看 API 結果即簽 UI UAT                                | BA ruling、TDD 草稿、來源與 SHA 登錄、共同 UI UAT 簽認            |
| BA Checker                | 對 Git-tracked repository 內容的同一 exact Git commit，或非 Git 來源的同一受控 checksum，獨立重算與逐條覆核                           | 只看 Maker 摘要或沿用 Maker 結論                                                              | Checker report、同一受控身分簽認                                  |
| API／Backend Engineer     | 建立 versioned typed contract、page-definition endpoint、domain policy、DB/config adapter、fail-closed 行為                           | 將 Screen 行為寫死在 controller；依 MT code 單獨選 profile                                    | API、contract、unit/contract tests                                |
| UI Engineer               | 以 API Page Parameter Model 建立 Generic UI；處理 loading/error/evidence/accessibility                                                | 在 UI 寫 MT/tag/scenario switch；自行推導業務規則                                             | Reusable components、facade、mapper、UI tests                     |
| Data／DB Engineer         | 管理 canonical positive、isolated negative/boundary fixture、版本、logical snapshot、reload/rollback                                  | 直接改 DB 而不更新配置；以 masked value 代替正式帳號                                          | Seed/config、manifest、reload/rollback evidence                   |
| DBA／Database Performance Engineer | 依實際資料量設計與覆核 query、index、join、transaction、WAL／lock 與容量基準；證明 API／UI／QA 使用同一 logical snapshot，協助 QA 建立可重跑效能資料 | 以全表 application-side JSON 篩選取代 DB query；未量測即宣稱調優；讓 QA-only 資料進入 Operational eligibility | Query plan、index／容量建議、冷熱 p50／p95／max、snapshot parity evidence |
| QA Engineer               | 先寫 acceptance oracle；逐段執行 API、browser、DB、NVR、regression、architecture gates；與 BA 共同執行全部 UI UAT                     | 無真實證據即標 PASS；以 service mock 冒充 upstream validator；只有 QA 單方判定 SWIFT 業務語意 | Machine-readable results、原始 evidence、BA/QA 共同 UI UAT report |
| UI/UX Specialist          | 共用設計 token、Theme、錯誤／警告層級、響應式與可存取性                                                                               | 以顏色取代語意；為單一訊息複製 stylesheet                                                     | Shared stylesheet/design review                                   |
| Excel Specialist          | 保持公式、calcChain、cached value、字型、格式、recalculation 可驗證                                                                   | 把公式改成硬編碼結果；只驗 cached value                                                       | Workbook engine-recalc evidence                                   |
| Sonar／Quality Reviewer   | 獨立執行 build、lint、coverage、duplication、security 與 SonarQube                                                                    | 以舊 scan 或截圖宣告當前版本通過                                                              | Quality Gate evidence                                             |
| 整合負責人                | 劃分不重疊檔案、整合接線、處理衝突、跑全套驗收並彙整 BA/QA 結論                                                                       | 在子線尚未驗證時宣告完成                                                                      | Release candidate、最終報告                                       |

## 2.1 協調與協作／4-EYES 強制規範

### 工作分配

- 每一階段由整合負責人先拆成可獨立交付、檔案範圍不重疊的工作線，例如 API Contract、Backend Adapter、Generic UI、DB/Fixture、QA Gate、BA Review。
- 每一條工作線必須明確記錄：負責人、可修改目錄、禁止修改範圍、輸入版本／路徑、外部交接中的 base commit、預期輸出、測試命令、交接條件及風險。
- 所有 TDD 工程必須在獨立 Git branch 執行，建議同時使用獨立 worktree；禁止直接在共用 dirty working tree 實作 production code 或測試。
- TDD 開始前必須記錄 exact base HEAD、既有 dirty-file manifest，以及每一項既有變更的 owner；未能證明 ownership 的重疊 hunk 必須標為 `CONFLICT`，不得覆寫或撤銷。
- 每個 candidate 必須在外部交接提供 exact candidate Git commit、同 commit 4-EYES 證據及可恢復 patch；禁止把 commit 寫回受控文件形成自我參照，也禁止使用 `reset`、`checkout`、`stash`、`clean` 或等效操作影響他人工作。
- **Main 受流程保護**：禁止直接修改 Main 或直接在 Main commit。每一項受控變更，包括 code、governance document、API、DB migration、configuration、fixture 與 test，都必須經 Task Branch、適用測試與 4-EYES 後才可進入 Main；緊急變更必須使用 Hotfix Branch，仍不得直接修改 Main。
- 共用接線檔由整合負責人最後修改；只有在獨立 branch／worktree 的 candidate 通過驗證後，才可按受控整合流程合併。
- 受控整合順序固定為：Designer／QA 對同一 Git candidate commit 完成 4-EYES PASS 後，先檢查 Main 是否已改變。若 Main 已改變，必須 **rebase latest Main -> re-test -> 對新 commit 重新執行完整 4-EYES**；若 Main 未改變，才可 fast-forward Main。核心不變量是 Designer／QA 審查的 commit 必須與進入 Main 的 commit 完全相同，禁止「QA reviewed A, merged B」。之後依序完成 Main integration validation PASS、建立本機 Baseline／Release Tag、明確確認 Main sealing 完成；只有以上步驟全部完成，才可移除**本任務已合併**的 branch／worktree。禁止移除未合併、失敗、因調查而保留，或任何其他成員的 branch／worktree；全流程 local commit／no push。
- 工作完成時，交接內容至少包含 changed files、tests、coverage、known gaps、integration points；不得只回覆「完成」。
- QA 與 BA 在工程期間持續參與：規格問題找 BA；資料、oracle、evidence 問題找 QA；架構與接線衝突找整合負責人。

### 4-EYES

- SWIFT MRG／CBPR+ UG 分析、TDD、Memory、DB seed/fixture、最終 QA 報告與 release acceptance 均採 **Maker + Independent Checker**。
- Maker 與 Checker 必須是不同角色／不同執行人；Checker 不得只閱讀 Maker 摘要，必須回到相同的官方來源獨立覆核。
- **不得自行核准（no self-approval）**：同一人或同一代理即使重新執行，也不得同時擔任同一受控交付物的 Maker 與 Checker；程式作者亦不得擔任該變更的最終 QA／Sonar／Release Approver。
- 每一項受控規則、TDD、OAS／Page Parameter contract、DB seed/fixture、QA evidence 與 release decision 都必須明確記錄 Maker 與 Independent Checker；缺少任一角色即為 `NOT_ACCEPTED`。
- 對 repository 內容，兩人必須檢查外部交接指定的**同一個 exact Git candidate commit 與 repo path**；對非 Git 外部證據則使用其受控 identity／checksum。內容在任一方簽認後被修改，原簽認立即失效，必須針對新 candidate 重做。
- Maker 提交：來源登錄、規則／案例、計數、公式、OPEN、假設與證據。
- Checker 提交：獨立計數、來源頁碼查證、規則抽樣／全量核對、公式與 cached value/recalc 檢查、未證實項目清單及最終 verdict。
- 只有兩方均為 `PASS/CONFIRMED` 的項目才能進入正式實作或最終驗收；任何 `CORRECT`、`OPEN`、`NOT_PROVEN` 均不得被包裝成 PASS。
- 兩方意見不同時，由整合負責人建立差異矩陣，逐項列出雙方引用的「檔名＋SHA＋頁碼」、影響案例及建議；交 BA/Product Owner 裁定後另建新版本，不覆寫已簽版本。
- 4-EYES 不代表重複做完全相同的工作：Maker 負責產出，Checker 負責獨立挑戰與驗證；兩份證據互補且可追溯。
- 人力或並行容量不足不得豁免 4-EYES；整合負責人應保留 Checker／QA 容量，必要時暫停工程工作線，禁止以作者自測取代獨立覆核。

### 同步節點

1. Source Register 完成後：BA Maker/Checker 確認來源版本。
2. TDD 初稿完成後：對同一 exact Git candidate commit 完成 4-EYES，解除設計開工 Gate。
3. 每段 API/UI/DB 完成後：QA 立即測該段並回饋，不等全案完成。
4. DB Reload 後：QA 驗證 snapshot、正負向 fixture 與 MT family regression。
5. Release Candidate 形成後：BA 與 QA 對外部交接中的相同 exact Git candidate commit、DB snapshot、Sonar scan 與 evidence manifest 簽認。

## 3. 標準工作流程

1. **Intake**：確認 Message Family、方向、環境、來源、輸出與 Definition of Done。
2. **Source Register**：每份 MRG／UG／工作簿記錄檔名、SHA-256、版本、頁碼與用途。
3. **BA 分析**：區分 normative rule、BA ruling、QA invariant、product policy；列出 OPEN。
4. **TDD Maker**：建立正向、負向、邊界、NVR、資料品質、HTTP、UI、回歸與 evidence 案例。
5. **TDD Checker**：對外部交接中的同一 exact Git candidate commit 做獨立覆核；Maker/Checker 都簽認後才進入正式開發。
6. **Red**：先建立會失敗的 unit／contract／integration／browser test 或 machine oracle。
7. **Green**：以最小通用設計完成 API、page parameter、UI 與配置資料。
8. **Refactor**：移除重複與 hard-code，維持 OOD/OOP/SOLID 與共用原則。
9. **DB Reload**：配置有變更時清除受控開發資料，重新匯入完整 canonical＋negative fixture；驗證失敗須保留原資料或 rollback。
10. **Incremental QA**：每完成一段即測 API、UI、DB 與受影響 regression，不等全案完成。
11. **Full Acceptance**：BA 與 QA 共同以 UI 跑完全部可執行正向、負向及邊界交易，再完成 API、NVR、MT/MX、DB、SonarQube、Coverage 與回歸。
12. **BA/QA Final Sign-off**：以外部交接中的同一 exact Git candidate commit、DB logical snapshot 與 evidence manifest 簽認。

### 3.0.1 TDD 強制工程標準

- TDD 是所有 production code、bug fix、contract、DB rule、UI behavior 與 regression change 的強制標準，不是選用流程。
- 固定循環為 **Red -> Green -> Refactor**：先新增能重現需求或缺陷且確認會失敗的自動測試；再寫通過該測試的最小實作；最後移除重複、改善設計並保持所有測試為綠燈。
- Red evidence 必須保存失敗案例、預期、實際與失敗原因；未先觀察到預期失敗，不得宣稱完成 TDD。
- Green 後必須執行受影響的 unit、contract、integration、architecture 及 browser/UI tests；Refactor 後再跑相同範圍與專案標準 `npm run verify`。
- 不得先寫 production code 再補測試，不得刪除／放寬 assertion 來取得 PASS，也不得以手動 UI 操作取代可自動化的測試。
- 緊急修復若因事故處置必須先隔離風險，狀態仍為 `NOT_ACCEPTED`；補齊缺陷重現測試、Red/Green/Refactor evidence、回歸與 4-EYES 前不得進入 Release Candidate。
- TDD Red／Green／Refactor 必須在獨立 Git branch（建議獨立 worktree）完成。開始前在外部交接保存 base commit、dirty manifest／owner；完成時在外部交接保存 candidate commit、同 commit 4-EYES 與 rollback patch。不得把 exact commit 嵌回受控文件，也不得在共用 dirty working tree直接實作或以 `reset`／`checkout`／`stash`／`clean` 破壞或隱藏他人變更。

### 3.1 端到端工作配合與交接流程

| 階段           | 主責                    | 必要協作者／4-EYES                 | 輸入                                           | 出口條件與交付                                                                    |
| -------------- | ----------------------- | ---------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------- |
| 需求與範圍     | Product Owner、BA Maker | BA Checker                         | 需求、Message Family、環境政策                 | scope、排除項、OPEN、來源清單均有書面紀錄                                         |
| MRG／UG 分析   | BA Maker                | BA Checker 獨立覆核                | 官方文件、SHA、頁碼                            | 規則、role、option、NVR、mapping 對同一 SHA 完成 4-EYES                           |
| TDD            | BA Maker                | BA Checker、QA                     | Memory、MRG／UG、來源工作簿                    | 正向／負向／邊界、fixture、oracle、owner、evidence 齊全；repository 內容以同一 exact Git commit 簽認，非 Git 證據以同一 checksum 簽認 |
| 架構與契約     | API／Backend Engineer   | UI Engineer、QA、整合負責人        | 已簽 TDD、typed domain model                   | API Page Definition／Execution contract versioned；沒有 Screen-specific hard-code |
| 資料配置       | Data／DB Engineer       | BA、QA Checker                     | TDD fixture binding、canonical/negative config | seed、manifest、logical snapshot、reload/rollback 可重現                          |
| API 實作       | API／Backend Engineer   | QA 逐段驗證                        | contract、DB/config adapter、domain policy     | unit／contract／integration tests 通過；錯誤與 evidence 結構完整                  |
| Screen/UI 實作 | UI Engineer             | UI/UX、QA                          | API Page Definition                            | Generic UI lossless render；無 message/tag/scenario hard-code；browser tests 通過 |
| 增量驗收       | QA Engineer             | BA、工程                           | 每段可執行增量                                 | 做一段測一段；問題即時回到對應 owner，不累積到最後                                |
| 品質門檻       | Sonar Reviewer          | 工程、QA                           | 同一 release candidate SHA                     | build、lint、test、coverage、duplication、security、Sonar 全數符合門檻            |
| 最終驗收       | 整合負責人              | BA Maker/Checker、QA、各工程 owner | code/TDD/DB/evidence 的受控身分                | Browser UAT、API、DB、NVR、回歸通過；BA/QA 以相同 evidence manifest 簽認          |

交接不得只傳結論。每次外部交接至少包含：base／candidate Git commit、修改檔案、已執行測試、未執行項目、OPEN/BLOCKED、風險、下一位 owner 與可重跑命令；非 Git 證據另附其受控 identity／checksum。前一階段出口條件未滿足時，下一階段可以準備但不得宣告正式通過。

## 4. API 參數驅動 UI／Screen 設計要求

唯一設計鏈為：

`Controlled SWIFT SSI source + applicable approved ISO/CBPR+ source -> Controlled OAS/Typed Contract + Controlled Parameters/DB -> Domain Policy/API -> API Page Definition -> Generic UI -> Execution API -> Structured Result`

- **參數驅動是全專案強制架構與驗收 Gate，不是可選實作方式。** MT1／pacs.008、MT2／pacs.009、MT347 及未來 Message Family 必須共用此鏈路。
- **API 對了，頁面參數才會對；頁面參數對了，UI 才能正確呈現與提交。**
- API 同時提供「畫面如何顯示」與「交易如何執行」所需的受控參數，但業務判斷仍由 domain/API 負責，不能移到瀏覽器。
- UI 是 API contract 的通用 consumer，不是另一套規則引擎；畫面不得自行補齊、猜測或改寫 SSI 規則。
- 同一組 API Page Definition 必須能驅動 DEVELOPMENT、QA、UAT；環境差異只來自受控配置與資料，不來自 UI 分支。
- 新增或修改 Message Family 時，先修改 Memory/TDD、配置、DB 與 API contract，再由 Generic UI 自動呈現；若必須修改共用 UI 元件，須證明是新的通用 control capability，而非單一 MT 特例。

### 4.0 TDD -> API -> 參數驅動 UI 的 OOD/OOP/SOLID Gate

MT347 已實作且可供所有 Message Family 重用的完整 normative pattern，統一記錄於 [`memory/mt347-oas-page-parameters-ui-standard-v1.md`](mt347-oas-page-parameters-ui-standard-v1.md)。本節與該標準共同構成強制 Gate；如有衝突，以本作業治理文件的較嚴格規定為準。重點責任界線為：OAS／typed contract 定義 field/control/data type/lookup/execution/result 結構，受控 Parameters／DB 提供版本化業務內容，API 組合 Page Definition 並作所有 SSI 決策，Generic UI 只依 metadata render、lookup、submit 與 display。UI 不得只依 data type 猜測 API；API endpoint 必須由 field `lookup` 或 Scenario `execution` metadata 明示。

- **TDD**：以資料表、rule ID、source anchor、typed fixture binding、expected oracle 與 owner 描述行為；禁止要求 production code 針對 case ID 回傳特定答案。
- **Domain/API**：Controller 僅負責 transport；業務規則置於可測試的 domain policy/service；資料存取經 repository/adapter；變化點以 interface、strategy、registry、dependency injection 與版本化 typed contract 擴充。
- **Page Parameters**：只承載 API 已裁定的 page definition、allowed option、validation metadata、fixture binding 與 execution contract；不得成為第二套業務規則或暗藏 message-specific default。
- **Generic UI**：Component 依 control type 與 typed view model 組合；不得依 MT/MX code、5x tag、scenario ID、BIC、account 或 fixture ID 寫 `if/switch` 特例。
- **Open/Closed 驗證**：至少用 synthetic message/field/option 只改配置與 API response、不改既有 generic component，即可顯示、輸入、提交及呈現 evidence；否則 Gate `FAIL`。
- **DRY 驗證**：相同 validation、mapping、error、rendering decision 或 provenance 邏輯只能有一個權威實作；API、UI、test helper 不得各自複製一份規則。
- **全層級零重複原則**：DRY 不只適用於程式碼，也適用於 OAS、typed contract、Page Definition、Parameters、rule catalogue、DB seed、fixture、TDD、Memory 與 UI metadata。同一業務規則、欄位定義、allowed option、NVR、訊息說明或顯示 metadata 只能有一個權威來源；其他層只能以穩定 ID／reference／生成流程引用，不得 copy-and-maintain。
- **產物分層**：OAS／typed contract 定義結構與交換契約；受控 Parameters／rule catalogue 定義版本化業務內容；DB 是載入後的 runtime projection；Page Definition 是 API 組合結果；UI 是通用 renderer。下游產物必須可由上游權威來源確定性生成或引用，禁止形成可獨立漂移的第二份真相。
- **Scenario 去重**：若兩個 Scenario 的適用 NVR、輸入契約、處理路徑、預期結果與證據完全相同，必須合併；不得只因 fixture ID、案例名稱或來源列不同而複製。若保留多個 Scenario，TDD 與 API 必須能指出至少一項可驗證的業務差異。
- **重複 Gate**：QA 必須檢查跨 OAS／Parameters／DB／fixture／TDD／API／UI 的語意重複與漂移；只檢查 Sonar code duplication 不足以通過。發現無權威 reference 的 copy-and-maintain，即使功能可動也判定 `FAIL`。
- **依賴反轉**：Domain 不依賴 Angular、HTTP、SQLite 或特定 fixture；外部系統與資料庫透過 ports/adapters 接入，測試替身不得洩漏到 production decision。

### 4.1 API Page Definition 必須提供

- `definitionVersion`、message family/profile、direction、business scenario、BAH `BizSvc`。
- sequence/subsequence、settlement leg、field/tag、official role、label、control type、required/optional/conditional。
- allowed options、validation rule、reason code、polarity、fixture binding。
- execution endpoint/action/owner、payment executable flag、evidence requirement。
- error severity、HTTP status、錯誤說明與可執行 remediation。

### 4.2 UI 只允許

- 讀取 Page Definition，映射為 typed view model。
- 依 control type 通用渲染 TEXT／DATE／SELECT／RADIO／CHECKBOX／HIDDEN 等元件。
- 提交 `definitionVersion + scenarioId + fixtureBindingId + values`。
- 原樣呈現 structured result、rendering decision、provenance、evidence 與 remediation。
- 顯示可執行的項目；未支援且無配置資料的訊息不得出現在可選清單。
- 畫面寫「double-click」時必須真的支援；否則移除提示並提供可存取的單擊／鍵盤操作。

### 4.3 UI 禁止

- `if/switch(messageType)`、`if(tag==='53A')` 等業務分支。
- 在 stylesheet、template 或 component 內寫死 fixture、BIC、account、scenario 或錯誤文字。
- 用 `MsgDefIdr` 單獨判斷 plain/COV/ADV/STP profile。
- API 錯誤時自行生成替代 SSI 或自動選擇候選資料。

### 4.4 Settings 與 Runtime Environment

- 全系統只保留一個 Settings 頁面與一個主標題，入口置於「稽核與事件」之下，不得出現重複 Settings。
- Theme 提供 System／Light／Dark，偏好只存於瀏覽器；色彩須由共用 design token 與 stylesheet 控制。
- Runtime Environment 由伺服器/API 決定，UI 僅以單一清楚值顯示（例如 `DEVELOPMENT`），不得由瀏覽器切換，也不得同時顯示容易混淆的 `Development ON`／`DEMO ON`。
- Reload Test Data 只在 DEVELOPMENT／DEMO 環境提供；控制密碼只能由後端 `.env` 驗證，不得傳給 UI、寫入 source code、Memory 或報告；`.env.example` 僅可包含非正式範例。
- Reload UI 必須說明「清除受控開發資料並由目前配置重新匯入」、影響範圍、原子性與失敗 rollback 行為。

### 4.5 視覺、錯誤與互動品質

- Error／Warning／Information 使用共用語意元件與 stylesheet；嚴重程度以標題、圖示、文字與顏色共同呈現，不得只依賴顏色。
- `Incorrect SSI` 必須清楚說明原因、影響範圍、修正方式與 correlation/evidence ID；錯誤狀態不得同時顯示成功 Resolution。
- UI 必須符合鍵盤操作、focus、contrast、screen-reader label 與 responsive layout 要求。
- 畫面只有在功能真正支援時才可顯示 double-click 提示，且同時提供單擊或鍵盤選取方式。
- 不支援、Scenario `execution.action` 不是 `RESOLVE_SSI`、Index `executable=false`，或沒有相對應 DEVELOPMENT 配置的交易，不得出現在 SSI resolution 可執行清單；若業務要求保留可見性，必須與可執行清單分區並清楚標示不可執行原因。`FIN_REFERENCE_ONLY` 不等於不可執行：MT347 Scenario 可具有 `RESOLVE_SSI` execution contract，但 `paymentExecutable=false` 且不得產生 payment／MT↔MX side effect。

### 4.6 Stylesheet 與共用互動 Pattern 變更治理

- `lc-ssi-wc` 視為一個完整微服務與一套產品 UI；Index、Scenario、Resolver、SSI 維護、Settings、稽核、錯誤及管理畫面必須共享同一 design system、資訊密度、字體階層、控制元件、互動語言與 accessibility 基準，不得各頁自行形成風格。
- OOD／OOP／SOLID／DRY 同時適用於 UI：以 typed control、lookup provider、dialog、table、pagination、validation 與 presentation token 的抽象介面組合功能；新 message family 或頁面只能擴充／註冊能力，不得修改或複製既有元件來建立第二套行為。
- 新增或修改 stylesheet、design token、字體、字級、行高、間距、欄寬、控制高度、響應式 breakpoint、Modal／Drawer／Dropdown／Lookup 行為前，必須先取得 **BA 操作語意批准**及 **QA 回歸判準批准**；未批准不得合併或納入 Release Candidate。
- BA 負責確認資訊層級、必要輸入、操作流程、顯示／隱藏語意及與既有畫面的業務一致性；QA 負責針對同一 exact Git candidate commit 建立視覺、鍵盤、焦點、分頁、搜尋、選取、錯誤、響應式與回歸 Gate。
- 相同資料型別與 lookup provider 必須使用同一個共用 UI 元件及互動 Pattern。例如所有 `SWIFT_BIC + BANK_SERVICE` 欄位共用 Bank Service Popup、搜尋、表格及分頁；不得另建 inline list、假 Dropdown 或另一套頁碼邏輯。
- 新需求應優先擴充既有共用元件、typed metadata 與 design token。禁止以 page-specific stylesheet、deep selector、提高 specificity、`!important`、固定 zoom/scale 或複製元件方式掩蓋差異。
- Stylesheet 只控制呈現，不得決定 SSI role、NVR、required、visibility、scenario applicability 或 validation ownership；這些均由受控 API Page Definition metadata 提供。
- 每次視覺或互動變更須附變更前後證據、受影響共用元件清單、支援解析度與 100% 縮放結果；至少驗證 1920×1080 桌面、鍵盤操作、focus、contrast、loading/error/empty state 及既有 MT family 回歸。
- BA＋QA＋UI Engineer 必須對同一 exact Git candidate commit 與其對應 UI build 完成 4-EYES／共同簽認。任何 stylesheet 或共用元件再修改而產生新 commit，都使先前 UI UAT 簽認失效，必須重跑受影響案例。
- 緊急修正亦不得略過批准；可先隔離修補，但在 BA／QA 核准並對同一 exact Git candidate commit 重測前，狀態只能是 `NOT ACCEPTED`，不得宣告 PASS。

## 5. Profile 與 Mapping 治理

- MT1／MT2 的 MT<->MX 轉換必須以受控業務情境與 BAH `BizSvc` 選 profile；相同 `MsgDefIdr` 不代表相同 profile。
- MT2：pacs.009 plain／COV／ADV 分開；ADV 只作 routing guard／排除／非結算參考，不是 Payment Index 的第五個可執行 Message，不得誤作 plain/COV。
- MT1：pacs.008 plain／STP 分開；正式版本須以 Source Register 的 UG 為準。
- MT347 為 FIN `REFERENCE_ONLY`，可執行 SSI reference resolution，但 `paymentExecutable=false`，不得產生 MT/MX payment payload、confirmed resolution 或 Repair Queue side effect；MT3／4／7 不適用 MT<->MX，ISO／CBPR+／mapping 記 `N/A`＋原因，不得新增 pacs/converter gate。
- Mapping key 至少包含 `SR + Message + Direction + Sequence/Subsequence + Settlement Leg + Tag + Option + Official Role + Business Function/Profile`。

## 6. DB、配置與 Reload 規範

1. DEVELOPMENT、QA、UAT 使用同一套版本化 canonical positive 配置；負向資料使用另一組隔離配置。
2. canonical positive、negative、boundary、ranking fixture 必須有 manifest、版本、SHA、用途與預期結果。
3. 修改配置後可由 Settings 執行 Reload；Reload 會清除受控開發資料並完整重新匯入，採單一交易且失敗時保留原資料。
4. Reload 只允許 DEVELOPMENT／DEMO；控制密碼由 `.env` 取得，UI 與 source code 不得包含實際秘密；`.env.example` 只能放非正式範例值。
5. QA 與 Browser UAT 必須使用同一 fixture binding 與相同 logical snapshot。
6. SQLite 正式證據使用 WAL-aware logical snapshot；單獨主檔 SHA 不可冒充含 WAL 的 DB snapshot。
7. 正式報文帳號只可使用有效 `accountReference`；`maskedAccountRef` 僅供畫面顯示。
8. 選中資料的必要欄位為 NULL／空白、候選不唯一或 applicability 不明確時 fail closed，不得任意挑選。

### 6.1 Data／Configuration 缺陷分類與 Owner

- canonical positive 配置錯誤、必要資料缺漏、配置無法 Reload 或 QA／UAT snapshot 不一致，均屬產品交付缺陷；不得以「只是測試資料」結案。
- isolated negative fixture 的刻意錯誤若符合 TDD oracle，屬預期測試條件，不列產品缺陷；若污染 positive snapshot，仍屬缺陷。
- 每一問題必須標示單一 primary owner：`CODE`、`CONFIGURATION`、`DATA`、`ENVIRONMENT` 或 `UPSTREAM_VALIDATOR`，並可另列 supporting owner。
- 無論 primary owner 為何，API 都必須 fail closed：不得 crash、任意擇一、產生 payload、確認 resolution 或進入 Repair Queue。
- 缺陷分類必須附案例、fixture/config 版本、DB logical snapshot、API response 與預期行為；不能只靠口頭判斷。

## 7. HTTP 與錯誤呈現

| 狀況                                                              | HTTP／行為                                       |
| ----------------------------------------------------------------- | ------------------------------------------------ |
| Request syntax／shape 無效                                        | 400 Bad Request                                  |
| 語法正確但欄位、option、NVR 前置條件不可處理                      | 422 Unprocessable Entity                         |
| DEVELOPMENT／DEMO 的已知 SSI／DB 配置品質問題                     | 409 `INCORRECT_SSI_CONFIGURATION`                |
| 非 DEVELOPMENT／DEMO 的關鍵 DB 資料損壞、缺漏導致服務不能安全完成 | Structured 500，明確標示 Data Quality 與修復方式 |
| 服務過載、維護或暫時不可用                                        | 503 Service Unavailable；不得用來表示資料品質    |

所有 fail-closed 分支均不得產生 MT/MX payload、confirmed resolution 或 Repair Queue 副作用；錯誤畫面須清楚顯示原因、影響、修復方式與 correlation/evidence ID。已知 Incorrect SSI 不應顯示成功 Resolution。

## 8. QA 與驗收要求

- 每一功能段依序執行：unit -> contract -> integration -> browser positive/negative -> regression。
- Browser UAT 必須真的用瀏覽器執行所有可執行交易；static bundle inspection 不能替代行為證據。
- UI UAT 採 **BA + QA 共同執行與共同簽認**：BA 依 SWIFT MRG／CBPR+ UG／受控 Memory/TDD 判斷 role、option、NVR、omission、mapping 與業務預期；QA 操作瀏覽器、控制 fixture/snapshot、執行 assertion 並保存可重跑證據。
- BA 與 QA 必須針對相同 exact Git candidate commit、其對應 UI build、API definition version、fixture binding 及 DB logical snapshot 執行；任一身分改變，原 UAT 簽認失效。非 Git 外部證據仍以其受控 checksum 識別。
- 所有具正式 fixture 的可執行正向、負向及邊界交易都必須跑完；不得以抽樣、API-only、mock、static inspection 或先前版本證據取代 UI UAT。
- 每個失敗由 BA 與 QA 共同分類為 SWIFT rule、product policy、API contract、UI rendering、configuration/data、environment 或 upstream validator；意見不同依 4-EYES 差異矩陣裁定。
- UI UAT 報告由 BA 與 QA 共同撰寫，至少包含案例總數與分母、PASS/FAIL/BLOCKED/NOT_EXECUTED、原始 browser evidence、預期與實際、來源頁碼、修復／重測狀態及雙方簽認。
- UI UAT 必須保存 `API Page Definition -> Typed Page Parameter Model -> rendered control/value -> Execution API request` 的 lossless trace；至少用一個非既有 MT/tag 名稱的 synthetic contract 驗證擴充性。若新增訊息、field、option 或 scenario 必須修改個別 template/component 分支，即判參數驅動 Gate `FAIL`。
- QA 必須執行 hard-code 掃描與 architecture tests，檢查 production API/UI 中是否出現 case ID、fixture ID、測試 BIC/account、逐 MT/tag `if/switch`、重複規則或 UI 自行推導業務結果；發現任一未受控例外即 `FAIL`。
- 每個案例比較 chosen SSI code/version、Nostro ID/version、account reference、role/BIC、omission decision、profile identity 與 payload。
- JSON 證據先列完整 top-level＋`mx`＋`mt` key tree，再下結論。
- 自建 fixture 結果必須標示「待正式 fixture 確認」，不得直接報產品缺陷。
- 完整 FIN／MX／network validator 屬獨立下游 workflow；在 SSI 驗收中固定標示 `OUT_OF_SCOPE — CLOSED` 與 `FIN_VALIDATION=NOT_EVALUATED`，不得建立 SSI `OPEN`／`BLOCKED`。若獨立下游 workflow 宣告 validator PASS，則必須有真正 validator 證據；service mock 或本地 pre-check 不得冒充 PASS。
- 資料修改後先 Reload DB，再跑受影響案例與 MT1、MT2、MT347 交叉回歸。
- NVR、Usage Rule、SSI Data Quality、Profile、RMA、concurrency/stale/race、accessibility 都須納入。
- 測試報告分成「已驗證」與「待確認」，不得混寫；未執行一律 `NOT_EXECUTED`。

## 9. SonarQube 與品質門檻

- UI 與 Backend 工程師開發時應啟用 SonarQube IDE Extension（Connected Mode 優先），連接專案的 Quality Profile／規則集，在編寫與重構階段即時處理 issue。
- IDE Extension 的 server URL、token、憑證與個人設定不得提交到 Git；共享的是專案規則與必要的非秘密設定，不共享秘密。
- IDE 分析只作 shift-left 輔助，不能取代 CI／SonarQube Server 對完整 source、coverage 與同一 exact Git candidate commit 的正式掃描；IDE 顯示 clean 不等於 Quality Gate PASS。
- Build、TypeScript、lint、unit/integration/browser tests 全部通過。
- New Code Coverage **> 95%**；不得只滿足 Sonar 預設 80%。
- New Code Duplication **< 1%**；包含 production code 與測試支援程式，不得藉由 exclusions 隱藏重複。
- New Blocker／Critical／Major = 0，New Minor **< 20**；Security Hotspot 必須完成 review。
- `npm audit` Critical／High = 0；Moderate 必須逐筆完成風險判定、owner 與處置期限，不能用忽略或舊報告宣告通過。
- SonarQube 必須針對最新 source、最新 coverage report 與最新 commit/worktree 掃描；舊 scan 不構成證據。
- Build、test、coverage、SonarQube 與最終 QA 報告必須指向同一 exact Git candidate commit；任何程式或測試修改產生新 commit，先前 scan 即不再代表目前版本。
- 截圖僅為輔助；正式 Quality Gate evidence 必須保存 scan/project ID、branch、外部記錄的 exact Git candidate commit、分析時間、quality profile/gate 與原始 measures。
- 共用 contract、policy、mapper、presenter 優先；不得為提高 coverage 複製程式碼或寫無意義斷言。
- 本機 QA／Sonar 自動化只連線至 loopback SonarQube 時，`http://localhost:9000`（以及等價的 `127.0.0.1` loopback）可作為明確受控例外，不要求改成 HTTPS；此例外只限 repo-local QA 工具，不得延伸至產品 API、非 loopback host、共享測試環境或 production。對應 Sonar Low Security issue 必須保留可追溯的 reviewed／accepted disposition，不得藉此忽略其他 HTTP／TLS 告警。

## 10. Excel TDD 規範

- 工作簿字型統一 Times New Roman 11。
- Coverage Ledger 使用公式，不得把計算結果硬編碼取代公式。
- 公式、cached values、calcChain、calculation metadata 與 engine recalculation 分開驗證。
- `Expected = Actual` 及 `Difference = 0` 必須由獨立重算確認；cached value 正確不等於本次 Excel engine 已完成 recalculation。
- 若 Excel calculation 卡住，報告必須指出檔案、Sheet、Cell/Column、公式、CalculationState、影響與替代證據。
- Maker 與 Checker 最終必須對同一 workbook SHA-256 簽認。

## 11. QA 目錄與封存

- 正式結構使用 `qa/<message-family>/`，例如 `qa/mt1/`、`qa/mt2/`、`qa/mt347/`。
- `tdd/`、`reports/`、`test_cases/`、`uat/`、`fixtures/` 均置於各自 family 下，避免不同系列互相封存或覆蓋。
- 本機 workspace 內只保留最新版與正式 FINAL；DRAFT、被取代版本及舊 evidence 移至 `C:\Users\samfi\Downloads\outputs\lc-ssi-wc\docs\archive\<message-family>\...`。除非 Product Owner 另行明確授權，本機 governance、Proposal、Checker report 與 SHA evidence 不 commit、不 push 到 Git remote。
- 「最新版」對 active Git-tracked repository 文件由 repo path、外部交接指定的 exact Git commit、Git 歷史與 supersession 記錄共同判斷；semantic version 若存在只是可選的人類／release label。對非 Git 外部證據才使用其受控 checksum。不得只依檔案日期；尚未被新版取代且為現行 runner/config 的檔案不因名稱較舊而自動封存。
- `qa` 保留各 family 最新受控 TDD、FINAL 報告、現行 fixture/config、runner 及必要 evidence；DRAFT、superseded、舊 run 與 migration backup 送封存。
- 封存前後產生 archive manifest，記錄原路徑、新路徑、SHA-256、狀態、原因與日期；不得刪除稽核軌跡。
- `qa-archived` 必須位於 Git repository 外，不得被追蹤或提交；各 family 使用獨立子目錄，避免互相覆蓋。

## 12. Block 管理與進度回報

Block 一經發現立即回報，格式固定如下：

1. **問題**：具體錯誤，不寫模糊描述。
2. **位置**：檔案、Sheet、Row/Column/Cell、API endpoint、case ID 或程式行。
3. **影響**：阻擋哪些案例、資料、環境與交付物。
4. **已確認原因／尚待驗證假設**：兩者分開。
5. **可選對策**：最小修復、替代方案、風險與預估時間。
6. **需要誰裁定**：BA、QA、工程、資料或 Product Owner。

未完成不等於 Block。只有無法在既有授權與證據下繼續推進時才標 BLOCKED；其餘以 `IN_PROGRESS` 或 `NOT_EXECUTED` 表示。

進度更新必須固定列出：已完成、進行中、剩餘、FAIL、BLOCKED、NOT_EXECUTED、下一步與 owner；不得只回覆籠統百分比或時間。發現 BLOCKED 必須主動立即通報，不等待追問。已找到可執行修復路徑的規範／程式／資料缺陷應標 `FAIL/CORRECT`，不可為了方便一律標成 BLOCKED。

## 12.1 BA 裁定品質

- BA Maker／Checker 必須回到官方來源查證，不得僅根據摘要、既有報告或推測回覆。
- SWIFT 規則的引用格式固定為「檔名＋SHA-256＋頁碼／章節」；內部工作簿與 Memory 不得冒充官方規範。
- 無法證實的項目標為 `OPEN`／`NOT_PROVEN`，列明缺少的來源或裁定，不得包裝成 PASS。
- SWIFT FIN NVR、Usage Rule、產品 API validation、資料品質政策與 upstream validator 必須分開記錄 rule type、error code、owner 與 evidence source。
- BA 意見分歧時按 4-EYES 差異矩陣處理；Product Owner／指定 BA 裁定後另建受控版本並重新計算 SHA。

## 12.2 Message Family 規範放置原則

- 本檔只保存全專案通用治理；MT1／pacs.008、MT2／pacs.009、MT347 的 SWIFT 語意保存在各自 Memory/TDD，本檔以連結引用，避免複製成互相矛盾的規則。
- MT<->MX 只適用受控核准的 MT1、MT2 範圍；MT347 不得加入 converter／pacs acceptance gate。
- MT700 等非本專案 settlement SSI scope 的訊息不得自行擴張；任何 scope 變更必須先有 BA 來源分析、Product Owner 裁定與 TDD 4-EYES。

## 12.3 疑點／Block 專家協作與墨菲風險前移

> 墨菲定律的治理原則：可能失敗的環節終將在最不利時點暴露，因此必須在設計與開發早期主動找出、隔離並驗證，而不是等到 Final UAT 才處理。

- Intake、設計、每段開發及 release candidate 前都要做一次 pre-mortem：假設本次交付失敗，列出最可能原因、最嚴重後果、最早可偵測訊號、預防測試、rollback 與 owner。
- 所有 assumption、疑點、未取得來源、外部依賴與脆弱環節進入 Risk/Assumption Register；每項包含 likelihood、impact、可偵測性、觸發條件、deadline 與處置狀態。
- 風險處理順序以「高影響、難偵測、晚發現成本高」優先；先做 spike、contract test、failure injection、negative/boundary test 或最小 proof，不把高風險留到最後。
- 發生疑點、重複失敗、責任邊界不清、工具／格式問題或 BLOCK 時，整合負責人立即指派對應專家，例如 SWIFT BA、QA/NVR、Backend/API、UI/UX、DB、Excel、Security/Sonar 或 Solution Designer。
- 專家任務必須有明確問題、檔案／endpoint／case、允許修改範圍、輸入 SHA、預期證據、timebox 與回報節點；不得只要求「幫忙看看」。
- 專家先獨立找證據與可行方案，再與 BA／QA／工程 owner 對照；涉及規範、TDD、DB fixture 或 acceptance 的結論仍須 4-EYES，不因專家身份免除覆核。
- 專家必須輸出：root cause、已排除假設、方案比較、推薦方案、風險、測試、rollback、剩餘疑點及需要誰裁定。若只能 workaround，必須清楚標示，不得稱為 root fix。
- Block 期間不停止所有工作：明確列可並行的未受阻項目並繼續；只有依賴該 Block 的 Gate 保持 BLOCKED。
- Block 解決後立即執行原失敗案例、相鄰負向／邊界、受影響 family regression、跨 family regression 與 Quality Gate；沒有重測證據不得關閉。
- 每次 retrospective 將實際發生但原先未預見的風險回寫本檔、TDD template、architecture test 或 runbook，使相同問題下次能更早被自動偵測。

### 12.3.1 臨時專家增援與釋放

- 核心／原有組員之外，發現疑點、BLOCK、專業能力缺口或可安全並行的高風險工作時，整合負責人可**自動增派最多兩名臨時專家**，不必等待問題擴大。
- 同一時間最多保留兩名臨時專家；優先選擇能直接解除 critical path 的領域，例如 SWIFT BA、Backend/API、UI/UX、DB、QA/NVR、Excel、Sonar/Security 或 Solution Design。
- 兩名專家的任務、可修改檔案與決策責任必須互斥或清楚分界；不得同時修改同一檔案，也不得由同一人兼任同一交付物的 Maker 與 Independent Checker。
- 臨時專家只取得完成任務所需的最小範圍；不得藉由增援擴張需求、繞過 BA 裁定、4-EYES、QA Gate 或 source-of-truth。
- 每位臨時專家完成 root fix、測試、證據、rollback 說明與 owner handoff 後立即釋放；不得因「可能還會用到」長期占用。
- 釋放前由整合負責人確認：Block 已重測、成果已整合、未完成事項已有 owner、文件／Memory 已更新、沒有遺留未合併變更。
- 若兩名增援仍無法解除 Block，必須立即向 Product Owner／使用者回報瓶頸、已投入角色、缺少能力／權限／外部系統及可選對策；不得默默增加更多人或無限重試。

## 12.4 已確認工作要求登錄（2026-09-14）

以下要求是目前工作的受控執行基準；細部 SWIFT 語意仍以各 Message Family 的最新受控 Memory／TDD 與 Source Register 為準，不在本章複製第二份規則。

- **工作環境**：自 2026-09-16 起，所有專案修改、測試、掃描與產物都以 `C:\Users\samfi\Downloads\outputs\lc-ssi-wc` 為唯一主目錄；不得再使用 `legacy D-drive workspace` 或 OneDrive workspace。暫存檔、scanner intermediate、cache 與 transient report 一律放在 repo-local `tmp/`，且 `tmp/` 必須由 Git ignore。
- **工作編制**：每個 Message Family 至少配置兩位獨立 BA（Maker、Checker）及獨立 QA；所有受控結論適用 4-EYES，不得由作者自行核准。
- **MT2／pacs.009 範圍**：Payment Index 只包含四個可執行 Message：`MT202`、`MT202COV`、`MT205`、`MT205COV`；每個 Message 依 SWIFT MRG、CBPR+ pacs.009 UG 與 NVR 建立 Operational 及 QA Scenarios。四個 Message 不等於只有四個 Scenario；Scenario 只在輸入契約、處理路徑、validation 或 oracle 有可驗證差異時保留。
- **Scenario 分類與排序**：Operational 供 UAT 正向流程；QA 包含正向、負向與邊界驗證。排序鍵固定為 Operational／Valid=`0`、Invalid=`1`、Boundary=`2`，同類再依 Description 排序。
- **架構鏈**：所有新增或變更先修改受控 OAS／typed contract，再由 API 組合 Page／Screen Parameters，最後由 Generic UI 呈現；UI 不得以 MT、tag、scenario、fixture 或測試 BIC 硬編碼業務規則。
- **工程原則**：OOD、OOP、SOLID、DRY、Open/Closed、單一權威來源、共用 lookup／dialog／table／pagination／loading／error pattern 與 architecture hard-code test 均維持強制 Gate。
- **TDD 標準**：所有功能與缺陷修復強制遵循 Red -> Green -> Refactor；先有失敗測試／缺陷重現，才可修改 production code，完成後必須跑受影響測試、回歸與 `npm run verify`。
- **廢代碼清理**：每項變更在 Refactor 階段必須移除已失效、無引用或已被新實作取代的 production code、設定、feature flag、fixture 與測試輔助碼；刪除前須以引用搜尋、contract／migration／compatibility 檢查及受影響測試證明其確為 dead code。不得以清理名義刪除仍承擔 API 相容、資料遷移、rollback、evidence 或受控測試用途的內容；QA 與 Reviewer 必須把殘留 dead code 與誤刪回歸納入 Gate。
- **UI 行為**：必要人工輸入置於導出結果之前；每個 SSI 輸入清楚顯示 SWIFT tag／option，不顯示不必要的 provenance；不得產生重複 input。變更 Currency／Value Date 等解析條件時先清除失效的 Counterparty／SSI 選擇並顯示 loading spinner，直到重新載入完成。Resolve SSI 執行期間顯示 spinner 並防止重複提交；Cancel 返回該 Message 的 Scenario 選擇區。
- **SSI 最小輸入邊界**：UI 不是 MT2xx／pacs.009 或其他 MT/MX 的報文輸入器。只顯示直接影響 SSI resolution 的人工治理參數；`21`、`32A`、`119`、`121`、Sequence B、previous-message provenance、NVR fixture 與 expected oracle 等報文／測試上下文由 OAS／Page Parameters 以 `SCENARIO_FIXED`／hidden evidence 提供。Bank Service／Nostro lookup 所帶回的 stable ID、account version 等 companion values 必須原子填入、隱藏提交，Index 亦不得把它們列成使用者輸入。
- **SWIFT 輸入標示**：參照 MT347 的共用畫面語言，OAS／Page Parameters 分別提供 `swiftTag`、`swiftOption` 與 official description metadata；Generic UI 只使用唯一共用 formatter，以 `SWIFT <Tag+Option> • <Official Tag Description>` 顯示所有可見且可輸入的 SWIFT SSI 欄位，option 為多選時顯示受控 option 集合。API 不預組第二份 label，Angular template 不得逐 MT／tag 寫死。非 SWIFT 的 Currency、Booking Entity、Value Date、Counterparty 等 resolution context 不虛構 SWIFT tag。
- **Index 向後相容與顯示邊界**：所有 Message Family 的 `INPUT FIELDS` 是附加欄位，新增時不得刪除、取代或改寫原有 Index 欄位與互動契約。Index 僅顯示精簡 Tag／Option，不顯示 Tag Description；Workbench 的可見人工 SWIFT SSI 輸入則顯示 Tag／Option＋Official Tag Description。兩者必須由同一 OAS／Page Parameters metadata 確定性生成，QA 以欄位保留、順序、搜尋、選取、鍵盤操作及 metadata trace 作為回歸 Gate。
- **UI 一致性**：同一產品內相同性質流程必須沿用相同欄位順序、grid 擺放、label、預設值行為、action 位置以及 loading／empty／error state；差異只能由受控 OAS／Page Parameters metadata 經共用元件呈現，禁止為單一 Message 建立專屬 template、CSS override 或 hard-code。
- **測試資料即測試環境 UI 資料**：唯一允許的候選資料流為 `受控 SSI／Nostro／Account Master／RMA fixture -> DB／Repository -> API eligibility／route discovery -> Page Parameters -> Generic UI`。UI 在測試環境顯示及提交的 Bank、Counterparty、Nostro 與完整 route candidates 必須來自同一受控 DB snapshot；不得另建 UI mock、前端假資料、hard-code default 或第二份候選清單。資料缺失必須修復 seed／fixture 並 reload DB，再由 API 自然呈現。
- **資料與 Resolver**：每個受支援 Message／Scenario／Currency 必須有可選且能完成解析的正向 SSI Counterparty 資料；無 SSI coverage 的 directory entry 必須與有 SSI 的 Bank、Customer 清楚分區，不得誤導為可解析資料。DB 修復須可重現、可 rollback，並保護既有 MT2／pacs.009 受控 fixture。
- **測試候選、RMA 與自動最佳路徑**：每個受支援 Currency 在適用 Message／Scenario／Booking Entity／Value Date 下，至少提供三個彼此可辨識、ACTIVE、有效且 RMA-authorised 的正向完整 settlement route candidates；Bank Service、Counterparty SSI、Own SSI／Nostro／Account Master（適用時）及 RMA authorization 必須使用一致的 BIC、幣別、booking entity、message scope、方向、用途與有效期。系統依受控 eligibility、priority、route preference 與 specificity 標示唯一最佳完整 route；不得把 53／54／56／57／58 individual selector 暴露為一般人工輸入，也不得將不同 candidates 的角色混搭。完整 route 唯一時可自動選；多個完整 routes 時以單一 `routeBindingId` 供選取。最高 business rank 並列時必須回 `SSI_AMBIGUOUS` fail closed，不得用 ID、版本、建檔時間、資料列順序或 UI 預設掩蓋歧義。另須保留至少一個 RMA 未授權的 isolated negative fixture，證明未授權關係仍被拒絕且不污染 positive snapshot。
- **RMA 與 MT／MX transport 邊界**：RMA 可分別保存 FIN／MT 與 FINPLUS／MX 授權，但每筆授權必須以 `ownBic + actualReceiverBic + service + direction + exact authorised profile + effective date` 判定；Core 與 COV 必須以 `businessService` 分流，不得用自創 suffix、近似版本或其他 MT 類型互相借用。Message Profile／Delivery Policy 決定正常 transport，RMA 只淘汰未授權 route；未授權 candidate 不得成為 default。FIN 與 FINPLUS 都授權時，MT2 正常 default 仍是 FINPLUS／MX；FIN 只可由受控 contingency 流程另行確認，禁止自動 fallback。UI／OAS 必須分開表達 `displayFormat` 與 `executionTransport`；MT compatibility output 只是同一 confirmed canonical snapshot 的 renderer，不代表 FIN transmission 已獲授權，也不得引發第二次 SSI resolution。QA 必測 exact Receiver、Core/COV、`.08` 版本、direction、有效期、ACTIVE／maker-checker、雙通道 default、FIN-only fail-closed、compatibility view snapshot 不變及 transport 真正切換後重新確認。
- **Picker／Resolve 一致性**：Counterparty Picker eligibility endpoint 與 Resolve SSI execution 必須使用相同的 governed eligibility policy、完整 resolution context、fixture binding／definition version 及 DB logical snapshot identity。QA 必須證明每個 enabled candidate 在未改變 context 時均可提交；若候選在送出前失效，API 必須 fail closed 並回傳結構化 stale／unavailable reason，UI 重新載入候選。禁止出現只允許特定示範銀行成功、其他 enabled 候選因 `PAGE_BANK_SERVICE_FIXTURE_MISMATCH` 或等價內部資料漂移才在提交時失敗的行為。
- **Counterparty／Receiver、Own Nostro 與 route selection**：一般 Scenario 使用 `Counterparty Bank`；Own-account Scenario 直接使用 `Receiver Bank`，不得以 `Counterparty Bank (Receiver Bank)` 合併名稱混淆 MRG Receiver 角色。Counterparty SSI 負責 counterparty／account-with-institution routing roles；Own SSI／Nostro／Account Master 負責本行 debit、settlement 或 credit account，兩者不可互相冒充但必須在完整 route 中原子綁定。BOOK 的 53B debit 與 58A credit 為 own-account route evidence，57a 依適用 MRG rule 省略；CREDIT-57A 的 57A 為 counterparty route，53a debit 與 58A credit 為 own-account evidence。完整 route 唯一時 Resolver 可自動帶入；若存在多組 eligible account／57A 組合，UI 只選整條 `Settlement Route` candidate，不分別輸入帳號或 5x tag。只有交易明確要求 exact immutable account constraint 時才接受受控 account reference，不接受自由文字 Account Number。Transaction Reference、raw 32A、21／119／121、完整 provenance 與衍生 5x tags 均不得成為一般人工 routing input。
- **Index 效能與參數快照**：MT1／MT2／MT347 及未來 Message Family 必須共用同一個 OAS／Page Parameters 驅動的 Generic Index component 與輕量 index projection。服務可依 standards release／business domain 快取 immutable、具 version／SHA 身分的 runtime definition snapshot，避免每次導航重讀、重組及 hash 全 catalogue；不得以複製 Index 或 message-specific cache 實作提速。受控 OAS／Parameters／DB snapshot 版本變更、Reload 或服務重啟時必須明確失效；QA 須保存冷啟、熱快取延遲、payload 大小與跨 domain 一致性證據。
- **SSI 標準來源邊界**：每個 Message／Scenario 的 OAS、Page Parameters、TDD、DB fixture 與 expected oracle 必須依 family／scenario 適用性追溯至 SWIFT MRG、NVR、SSI 相關受控文件，以及只在已核准 MT↔MX scope 適用的 ISO 20022／CBPR+ UG／mapping；MT347 對後者記 `N/A`＋原因。BA 必須建立只含 SSI-relevant 規則的 source-to-decision matrix，QA 逐項驗證來源版本、頁碼／rule ID、SHA 與實際 resolver outcome；非 SSI 報文內容不得成為人工輸入或被宣稱已由本服務完成完整 message／network validation。
- **NVR 與 owner**：`IN_SCOPE_SSI_TAG_NVR` 與 `OUT_OF_SCOPE_FULL_FIN_NVR` 必須分流。前者屬本服務責任，須有受控來源與可重現 SSI evidence；缺證標示 `NOT_PROVEN`／`NOT_EXECUTED`，可阻擋 SSI release。後者固定為 `OUT_OF_SCOPE — CLOSED` 與 `FIN_VALIDATION=NOT_EVALUATED`，不得建立 SSI `OPEN`／`BLOCKED`，也不得阻擋 SSI release；真正 FIN／network validator 的執行與 PASS 只屬獨立下游 workflow，且不得以 service mock 或 local pre-check 冒充。
- **SWIFT release precedence**：相同規則或 artifact 優先採 SR2026；只有 SR2026 確實缺項且受控客戶／channel／第三方 MT↔MX converter profile 需要 legacy behavior 時，才可 fallback 至 SR2025。SR2026 若已明確 deprecated、禁止或改寫，2025 不得覆蓋；禁止跨 release 靜默拼接，evidence 必須記錄 release、檔名、SHA、converter version/profile 與 fallback 原因。
- **QA 與證據**：BA／QA 必須以 UI 逐一驗證所有可執行 Message × Scenario × Currency × SSI Counterparty，並與 TDD、SWIFT MRG／UG、NVR、DB snapshot 及 API contract 對照；失敗與未執行不得從分母移除或降級成 PASS。
- **品質門檻**：執行專案標準 `npm run verify`、本機 SonarQube 與依賴安全掃描；New Blocker／Critical／Major=0、New Minor<20、New Code Coverage>95%、New Code Duplication<1%、`npm audit` Critical／High=0。掃描、coverage、tests 與 acceptance evidence 必須指向相同 release candidate 身分。
- **後續範圍**：MT2／pacs.009 完成相同治理與驗收後，其他 Message Family 也沿用同一方法；不得因 family 不同降低 OAS、DB、4-EYES 或 QA Gate。

## 13. Definition of Done

只有同時滿足以下條件才能宣告完成：

- 受控來源、Memory、TDD 與 release candidate 身分可追溯。
- BA Maker 與 BA Checker 對外部交接中的同一 exact Git candidate commit 簽認。
- API -> Page Parameter -> Generic UI lossless trace 通過，UI hard-code gate 通過。
- 配置／DB seed、Reload、rollback、positive/negative/boundary fixture 通過。
- 所有可執行 API 與 Browser UAT 正向／負向交易完成；所有 `IN_SCOPE_SSI_TAG_NVR` 有受控來源與可重現 SSI evidence，缺證則 SSI release 為 `BLOCKED`。`OUT_OF_SCOPE_FULL_FIN_NVR` 固定 `OUT_OF_SCOPE — CLOSED`／`FIN_VALIDATION=NOT_EVALUATED`，不阻擋 SSI release；外部 validator 屬獨立下游 workflow。
- MT1、MT2、MT347 受影響範圍回歸通過。
- SonarQube、coverage、duplication、security、build、lint 全部符合門檻。
- QA 報告清楚區分 PASS／FAIL／BLOCKED／NOT_EXECUTED，且 BA／QA 最終簽認。

## 14. 必讀文件

- `docs/architecture/ADR-001-api-driven-ui.md`
- `memory/swift-mt1xx-pacs008-v2.md`
- `memory/swift-mt2xx-pacs009-v2.md`
- `memory/swift-mt347-v2.md`
- 各 Message Family 最新受控 TDD 與 Source Register

## 15. 持續改善與文件變更治理

本檔必須隨實際作業模式持續改善，不得建立彼此矛盾的臨時規範。下列任一事件發生時，必須評估並更新本檔：

- 新增 Message Family、角色、工具、環境、品質門檻或交付階段。
- 發現重複工作、交接遺漏、責任不清、延遲揭露 Block、hard-code、資料漂移或 evidence 不可重現。
- BA／QA／工程對 owner、規則、資料來源、HTTP、NVR、UI 行為或完成定義產生歧義。
- Retrospective、缺陷根因分析、Sonar／Coverage、Browser UAT 或 DB Reload 揭示流程缺口。

每次修改須遵守：

1. 說明變更原因、影響範圍、提出者、Reviewer 與生效日期。
2. 變更必須提交至隔離 branch 並產生新的 Git candidate commit；原有 4-EYES 簽認不得沿用。Semantic version／release label 可按發布需要選擇性更新，不是每次修改的必要步驟或 Gate。
3. 涉及 SWIFT 語意、TDD、DB fixture 或 release gate 時，須由 Maker + Independent Checker 重新確認。
4. 同步檢查 `CLAUDE.md`、ADR、各 family Memory/TDD 與 QA template 是否需要更新；以連結引用為主，避免複製出多套規則。
5. 舊版移至 repo 外 `qa-archived/governance/` 備查；Git repo 內只保留最新 CONTROLLED 版本。
6. 修改完成後，在文件的變更紀錄登錄日期、摘要、簽認狀態及可選的 semantic version／release label；exact Git commit 只留在外部交接／review evidence。

### 15.1 變更紀錄

| 版本    | 日期       | 變更摘要                                                                                                                                                                                                                                                                                | 4-EYES 狀態                                                                                            |
| ------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| v1      | 2026-09-13 | 建立全專案中文治理基準；納入角色、任務分派、協調協作、4-EYES、API 參數驅動 UI、DB、QA、品質門檻、端到端交接與持續改善治理                                                                                                                                                               | 待治理文件 Checker 對發布 SHA 簽認                                                                     |
| v1.1    | 2026-09-13 | 依對話回顧補入單一 Settings/runtime、UI 視覺與互動、Data/Configuration 缺陷分類、同 code SHA Quality Gate、進度/BLOCKED、QA archive manifest、BA 裁定品質與 Message Family 規範放置原則                                                                                                 | 本次修改後待 Checker 對新 SHA 簽認；v1 SHA 簽認不得沿用                                                |
| v2      | 2026-09-13 | 將 v1.1 的完整治理改善正式升版為 v2；檔名、文件版本與必讀入口同步，避免以 v1 檔名承載新版規範                                                                                                                                                                                           | 待治理文件 Checker 對 v2 發布 SHA 簽認                                                                 |
| v2.1    | 2026-09-13 | 明訂 TDD -> API -> 參數驅動 UI 為強制架構鏈；加入 OOD/OOP/SOLID/DRY、Open/Closed synthetic contract、hard-code scan 與 architecture test Gate；BA + QA 共同執行及簽認 UI UAT；品質門檻為 New Code Coverage >95%、Duplication <1%                                                        | 待治理文件 Checker 對更新後 v2 SHA 簽認；先前 v2 SHA 不得沿用                                          |
| v2.2    | 2026-09-13 | UI／Backend 開發納入 SonarQube IDE Extension／Connected Mode 作 shift-left 檢查；明訂秘密不得入 Git，且 IDE clean 不取代同 code SHA 的 Server Quality Gate                                                                                                                              | 待治理文件 Checker 對更新後 v2 SHA 簽認；先前 v2 SHA 不得沿用                                          |
| v2.3    | 2026-09-13 | 納入墨菲定律、pre-mortem、Risk/Assumption Register、疑點/BLOCK 即時指派領域專家、專家交付格式、可並行處理與 Block 關閉後完整重測                                                                                                                                                        | 待治理文件 Checker 對更新後 v2 SHA 簽認；先前 v2 SHA 不得沿用                                          |
| v2.4    | 2026-09-13 | 明訂核心組員之外可自動增派最多兩名臨時專家；限制並行人數、檔案與責任邊界，完成 root fix、驗證及交接後立即釋放                                                                                                                                                                           | 待治理文件 Checker 對更新後 v2 SHA 簽認；先前 v2 SHA 不得沿用                                          |
| v2.5    | 2026-09-13 | 新增 Stylesheet 與共用互動 Pattern 變更治理：任何樣式／互動修改須先經 BA 操作語意與 QA 回歸判準批准；同類 lookup 強制共用元件；禁止局部 CSS 覆蓋與複製 Pattern；BA＋QA＋UI 對同 build SHA 簽認                                                                                          | 待治理文件 Checker 對更新後 v2 SHA 簽認；先前 v2 SHA 不得沿用                                          |
| v2.6    | 2026-09-13 | 明訂 `lc-ssi-wc` 為單一微服務／單一產品 UI；所有功能畫面共用同一 design system 與互動語言，且 OOD／OOP／SOLID／DRY 同樣適用於 UI 元件、lookup、dialog、table、pagination 與樣式 token                                                                                                   | 待治理文件 Checker 對更新後 v2 SHA 簽認；先前 v2 SHA 不得沿用                                          |
| v2.7    | 2026-09-13 | 將零重複提升為全層級治理 Gate：OAS、typed contract、Page Definition、Parameters、rule catalogue、DB seed、fixture、TDD、Memory、API 與 UI metadata 均採單一權威來源／reference／確定性生成；相同行為 Scenario 必須合併                                                                  | 待治理文件 Checker 對更新後 v2 SHA 簽認；先前 SHA 不得沿用                                             |
| v2.8    | 2026-09-14 | 彙整本輪全部工作要求：強化 4-EYES 職責分離與禁止自行核准；登錄 D 槽／repo-local tmp、兩位 BA＋QA、MT2／pacs.009 四訊息與 Scenario 分類、OAS 驅動 UI、UI／DB／NVR／Evidence／Quality Gate；補入 Sonar Minor<20 與 npm audit Critical／High=0                                             | Maker 已更新；待 Independent Checker 對本版本 SHA 簽認，簽認前狀態為 NOT_ACCEPTED                      |
| v2.8.1  | 2026-09-14 | 依 Independent Checker 第一輪 CORRECT 修正：統一 OAS-first 資料流、明定 ADV 非第五個可執行 Message、統一 NVR 狀態並將適用的 authoritative NVR evidence 設為完整 release hard gate；要求 AGENTS 強制引用本文件版本與 SHA                                                                 | Maker 已修正；待 Independent Checker 對新 SHA 重驗，簽認前狀態為 NOT_ACCEPTED                          |
| v2.8.2  | 2026-09-14 | 將 TDD 明訂為所有功能、缺陷、contract、DB、UI 與 regression change 的強制工程標準；要求 Red -> Green -> Refactor、保存 Red evidence、禁止事後補測試／放寬 assertion，並納入 verify、回歸及 4-EYES Gate                                                                                  | Maker 已更新；v2.8.1 Checker PASS 因新 SHA 失效，待 Independent Checker 對 v2.8.2 重驗                 |
| v2.8.3  | 2026-09-14 | 新增廢代碼清理紀律：Refactor 階段必須移除失效、無引用或被取代內容；刪除前以引用、contract、migration、compatibility 與測試證明，並防止誤刪相容／rollback／evidence 用途                                                                                                                 | Maker 已更新；v2.8.2 Checker 狀態因新 SHA 失效，待 Independent Checker 對 v2.8.3 重驗                  |
| v2.8.4  | 2026-09-14 | 新增 SWIFT release precedence：SR2026 優先；僅在 SR2026 缺項且受控第三方 MT↔MX profile 需要時 fallback SR2025；SR2026 明確 deprecated／禁止／改寫不得被 2025 覆蓋，並強制記錄版本與 fallback evidence                                                                                   | Maker 已更新；先前 Checker 狀態因新 SHA 失效，待 Independent Checker 對 v2.8.4 重驗                    |
| v2.8.5  | 2026-09-15 | 新增產品級 UI 一致性工作規則：相同流程強制共用欄位順序、擺放、預設值、action 與狀態模式；差異僅可由 OAS／Page Parameters metadata 驅動，禁止 Message-specific template／CSS／hard-code                                                                                                  | Maker 已更新；先前 Checker 狀態因新 SHA 失效，待 Independent Checker 對 v2.8.5 重驗                    |
| v2.8.6  | 2026-09-15 | 明訂本產品是 SSI Resolution 微服務而非 MT/MX 報文建檔系統；UI／Index 僅呈現影響 SSI 選路的最小人工輸入，報文／NVR／Sequence／provenance 測試上下文由受控 fixture 隱藏提供，lookup companion／version 自動帶入且不得列為人工輸入                                                         | Maker 已更新；先前 Checker 狀態因新 SHA 失效，待 Independent Checker 對 v2.8.6 重驗                    |
| v2.8.7  | 2026-09-15 | 新增所有 Message Family 的 SWIFT SSI 可見輸入標示規則：由 OAS／Page Parameters 提供 `SWIFT Tag+Option • Official Tag Description`，Generic UI 通用呈現；同步修正文件生效日並採外部 manifest 記錄 SHA 與具名 4-EYES                                                                      | Maker `/root`；Independent Checker 待重驗；詳見 `memory/lc-ssi-wc-operating-model-zh-v2.manifest.json` |
| v2.8.8  | 2026-09-15 | 將 MT347 最終決議提升為全產品統一標準：Index `INPUT FIELDS` 採加法式向後相容、保留既有欄位且只顯示精簡 Tag／Option；Picker 與 Resolve SSI 共用 eligibility contract／context／snapshot，所有 enabled candidate 必須可執行                                                               | Maker `/root`；先前 Checker 簽認因新 SHA 失效，待 Independent Checker 對 v2.8.8 重驗                   |
| v2.8.9  | 2026-09-15 | 新增全產品 SSI 標準來源邊界：共同參照適用 SWIFT MRG、ISO 20022／CBPR+ UG／mapping、NVR 與 SSI 相關受控文件，只納入影響 SSI resolution／治理的規則並保存 source-to-decision trace，不擴張成完整報文或 network validator                                                                  | Maker `/root`；v2.8.8 BA／QA PASS 因正文 SHA 改變而失效，待 BA／QA 對 v2.8.9 同 SHA 重驗               |
| v2.8.10 | 2026-09-15 | 依 BA Checker CORRECT 修正來源適用性與 NVR boundary：ISO 20022／CBPR+／mapping 僅用於已核准 MT↔MX scope，MT347 記 N/A；`IN_SCOPE_SSI_TAG_NVR` 可阻擋 SSI release，`OUT_OF_SCOPE_FULL_FIN_NVR` 固定 CLOSED／NOT_EVALUATED 且僅屬獨立下游 workflow                                        | Maker `/root`；v2.8.9 QA PASS／BA CORRECT 已失效，待 BA／QA 對 v2.8.10 同 SHA 重驗                     |
| v2.8.11 | 2026-09-15 | 新增每幣別至少三個 RMA-authorised SSI 候選、自動唯一最佳路徑／ambiguity fail-closed、Counterparty／Receiver own-account 例外、CREDIT-57A conditional debit，以及 OAS/Page Parameters Generic Index immutable snapshot 效能規則                                                          | Maker `/root`；BA 已提出 CORRECT、QA 發現 eligibility snapshot RED，待修復後由 BA／QA 對同 SHA 重驗    |
| v2.8.12 | 2026-09-15 | 將 MT347 的 OAS → Page Parameters → Generic UI reference pattern 寫成全產品正式標準；明訂 metadata-directed lookup/execution、UI 零業務判斷、Scenario SSI execution contract 與 paymentExecutable 分離、SSI/full-FIN NVR 分流、MT347 ISO N/A、Receiver 命名及唯一 SWIFT label formatter | Maker `/root`；已依 BA／QA CORRECT 修正，待兩者對最終同 SHA 重驗                                       |
| v2.8.13 | 2026-09-15 | 明訂 MT2／MT3／MT4／MT7 與後續 family 的 Counterparty SSI 和 Own SSI／Nostro／Account Master 獨立 ownership、`SAME`／`DIFFERENT`／`NOT_APPLICABLE` servicer relationship 及完整 route 原子綁定；採 discovery snapshot＋route candidate＋resolve 兩段式契約，唯一候選才自動選，多候選選整條 route，stale／ambiguity fail closed | Maker `/root`；依 BA Maker 裁定及 Product Owner clarification 更新，待 Independent BA／QA 對新 SHA 重驗 |
| v2.8.14 | 2026-09-15 | 明訂受控測試資料即測試環境 UI 資料；SSI／Nostro／Account Master／RMA fixture 必須經 DB、API eligibility／route discovery 與 Page Parameters 投影至 Generic UI，禁止 UI mock、前端假資料、hard-code default 或第二份候選清單 | Maker `/root`；依 Product Owner clarification 更新，待 Independent BA／QA 對新 SHA 重驗              |
| v2.8.15 | 2026-09-15 | 明訂本規範對主代理、所有子代理、BA、QA、API、UI、Data、Security、Reviewer、臨時專家及後續組員均為強制 Gate；工作前必須核對版本與 Manifest SHA，舊 SHA／聊天摘要／衝突成果不得合併或簽核 | Maker `/root`；依 Product Owner clarification 更新，待 Independent BA／QA 對新 SHA 重驗              |
| v2.8.16 | 2026-09-15 | 依 BA 裁定明訂 RMA 僅為 actual Receiver／channel／direction／exact profile 的授權 Gate，不是 MT／MX 格式或 route 選擇器；MT2 正常預設為 FINPLUS／MX，FIN 僅限受控 contingency，並分離 display format 與 execution transport | Maker `/root`；BA Maker 已完成裁定，待 Independent BA／QA 對本版本 SHA 重驗 |
| v2.8.17 | 2026-09-15 | 依 Product Owner 指示，將 repo-local QA／Sonar 工具連線 loopback SonarQube 的 `http://localhost:9000` 設為窄範圍受控例外；產品 API、非 loopback、共享環境及 production 仍須遵守 TLS，且例外 issue 必須保留 reviewed／accepted trace | Maker `/root`；待 Independent Sonar／QA Checker 對本版本 SHA 重驗 |
| v2.8.18 | 2026-09-15 | 依 Product Owner 指示，工作組新增獨立 DBA／Database Performance Engineer；資料量增加時強制 DB-side filter／join／sort、query plan 與冷熱延遲證據，並要求 Operational、QA API、Browser UI 共用同一 seed／fixture／logical snapshot，隔離 QA-only 資料 | Maker `/root`；任何既有 DBA／QA／BA 簽認因新版本與 SHA 失效，待 Independent Checker 對 v2.8.18 同 SHA 重驗 |
| v2.8.19 | 2026-09-16 | 依 Product Owner 指示將唯一主目錄改為 `C:\Users\samfi\Downloads\outputs\lc-ssi-wc`，本機交付物不推送 remote；新增 MT1／pacs.008 CPI 與 Bank SSI 強制分域、Customer UI 禁止 SSI 語意、intent provenance、三軸拆分及 current-rule/OPEN fail-closed Gate | Maker `/root`；待 Independent BA／QA Checker 對 v2.8.19 同 SHA 重驗，簽認前為 NOT_ACCEPTED |
| v2.8.20 | 2026-09-16 | 依 Product Owner 指示將 Page-by-page 升格為全產品強制設計模式：Browser/BFF 禁止全量假分頁；API/DB 回傳本頁 projection 與 total metadata；Frontend/Backend 工程師須有設計模式認證或等價 competency assessment，並以 contract、Query Plan、latency、payload、Browser UAT 作為 Gate | Maker `/root`；任何先前治理簽認因新版本與 SHA 失效，待 Independent Architecture／DBA／QA Checker 對 v2.8.20 同 SHA 重驗 |
| v2.8.21 | 2026-09-16 | 依 Product Owner 指示，所有 Index Title 強制支援可存取 ASC/DESC；sort/page/filter/search 必須由 UI 經 BFF 傳至 Backend/DB 白名單 ORDER BY 並附唯一鍵穩定排序；Checker/Audit 沿用原交易 Index title/order/search/sort，只追加 Maker/Checker Datetime | Maker `/root`；v2.8.20 簽認因新 SHA 失效，待 Independent Architecture／DBA／QA Checker 對 v2.8.21 同 SHA 重驗 |
| v2.8.22 | 2026-09-18 | 依 Product Owner 指示新增 TDD Git 隔離治理：所有 TDD 在獨立 branch、建議獨立 worktree；開工前記錄 base HEAD 與 dirty manifest／owner；candidate 提供 exact SHA、同 SHA 4-EYES 與 rollback patch；禁止以 reset／checkout／stash／clean 影響他人 | Maker `/root`；先前簽認因正文 SHA 改變而失效，待 Independent QA／Governance Checker 對 v2.8.22 同 SHA 重驗 |
| v2.8.23 | 2026-09-18 | 治理身分一致性修正：同步正文 header、AGENTS／CLAUDE active references、MT1 v2 governance identity、manifest 與 canonical LF SHA sidecar chain；修復失效的受控文件連結，不改寫 frozen historical evidence | Governance Maker `/root/angular_lazy_defer_engineer`；待 Independent Governance／QA Checker 對 exact candidate SHA 重驗，未簽認前為 NOT_ACCEPTED |
| v2.8.24 | 2026-09-18 | 依 Product Owner 簡化治理：active Git-tracked repository 文件以 repo path＋外部 evidence 記錄的 exact Git commit 識別；semantic version 僅為可選標籤，manifest 非身分／角色／簽核權威，並移除手工 document／manifest SHA chain。Main 禁止直接修改／commit，所有受控變更經 Task Branch（緊急時 Hotfix Branch）、適用測試與 4-EYES。Exact base／candidate commit 僅放外部交接與 4-EYES evidence。流程固定為獨立 branch/worktree、explicit staging、local commit/no push；Designer／QA 對同一 commit PASS 後檢查 Main：Main 有變即 rebase、re-test 並對新 commit 重跑完整 4-EYES，未變才 fast-forward，確保 reviewed commit 就是進入 Main 的 commit；之後 Main integration PASS、local Baseline／Release Tag、明確 Main sealed，最後才 cleanup 本任務已合併 branch/worktree，且禁止移除未合併、失敗、調查保留或他人 branch/worktree | Governance Maker `/root/angular_lazy_defer_engineer`；待 Independent Governance／QA Checker 對同一外部 candidate commit 重驗，未簽認前為 NOT_ACCEPTED |
