# lc-ssi-wc：SSI Resolver 與第三方 FIN Validator 責任邊界 v1

**狀態：CONTROLLED — 使用者範圍裁定（2026-09-13）**  
**適用：MT2 + pacs.009、MT347，以及後續納入 lc-ssi-wc 的 SSI 報文族**

## 1. 核心裁定

`lc-ssi-wc` 是 **SSI Resolver 微服務**。它負責從受控配置與資料庫解析 SSI、Nostro、路由及 5x 欄位，並透過 API 提供頁面參數，由通用 UI 呈現與提交。

**FIN Validator 是第三方／外部下游服務。** 完整 FIN Message 的語法、依賴非 SSI 欄位的全報文 NVR、網路提交及 SWIFT 接受性驗證，不屬於 SSI Resolver 的產品責任。此第三方整合議題在 SSI Resolver 工作流中的狀態為 **`OUT_OF_SCOPE — CLOSED`**，不是 Deferred、Open 或 Block。

但**受支援 SSI Tag 直接相關的 NVR 仍屬 SSI Resolver Scope**。凡規則可由受控 SSI 配置、DB、API page parameters 與本服務負責的 Tag／role 完整判斷，必須由 SSI Resolver 防止錯誤並由 BA／QA 驗收，不得以「FIN Validator 是第三方」為由排除。因此：

- FIN Validator 尚未整合、不可用或尚未取得其執行證據，**不得將 SSI Resolver 標為 BLOCKED 或 FAIL**，也不得保留成 SSI 待辦。
- FIN Validator 的 TDD、integration contract 與 full-message authoritative evidence gate 應作為**獨立下游工作流**管理，不得混入 SSI Resolver 的結案 Gate；但相關 Tag NVR 的 SSI prevention／resolution evidence 仍是 SSI 結案 Gate。
- SSI 報告若沒有執行第三方驗證，應記為 `FIN_VALIDATION = NOT_EVALUATED / OUT_OF_SCOPE`，不可推論為 SSI 失敗，也不可宣稱 FIN 已通過。
- 未來若另案正式整合 FIN Validator，其結果只能作為獨立的下游驗證結果；除非另有正式變更裁定，不得回頭改寫 SSI Resolver 已完成的解析結果或結案狀態。
- 禁止 scope creeping：不得因 FIN Validator、依賴非 SSI 欄位的完整 FIN NVR、SWIFT Network 或第三方轉換器需求，擴張 MT2 + pacs.009 或 MT347 SSI Resolver 的交付範圍；同時也不得把既有相關 Tag NVR 錯誤移出範圍。

## 2. SSI Resolver 的責任

SSI Resolver 必須自行完成並留下證據：

1. 依 SWIFT MRG、受控 BA 裁定與 message-family Memory，判定哪些欄位與角色可由 SSI 推導。
2. 驗證所有受支援 SSI Tag 直接相關且可由 SSI 擁有資料完整判斷的 NVR，包括 option、存在性、必填、互斥、相依，以及所有參與欄位均屬 SSI/page-parameter contract 的跨 Tag 規則。
3. 依受控配置／DB 解析 eligible SSI、Nostro、accountReference、route、option、sequence／subsequence 與 settlement leg。
4. 對資料缺漏、歧義、無有效候選、不合法組合與相關 Tag NVR 違規 fail closed，且不得產生確認後的 resolution 或 payload。
5. 回傳可稽核的 chosen route、排除候選、provenance、snapshot identity、resolution token、rendering decision 與 reason code。
6. 維持唯一資料流：`TDD / Configuration / DB -> Domain / API -> Page parameter model -> Generic UI`。
7. UI 不得 hard-code MT 類型、5x 欄位、情境、polarity、fixture binding 或個案判斷；配置變更後可 Reload DB，不需修改 Angular 原始碼。

## 3. 第三方 FIN Validator 的責任

下列事項屬第三方 FIN Validator／上游完整報文驗證責任，不是 SSI Resolver 的結案阻斷：

- FIN Blocks 1–5 的完整組裝與語法驗證。
- 需要非 SSI 欄位或完整訊息上下文才能判斷的 NVR／usage rule；若規則只依賴受支援 SSI Tag 與 SSI page parameters，則仍在 SSI Scope。
- SWIFT Network、外部轉換器或其他第三方產品的提交與接受結果。
- 第三方 validator 的 availability、版本、憑證、連線與 authoritative evidence。

SSI Resolver 可以提供 validator 所需的 SSI 證據與 correlation metadata，但不得假裝自己已完成第三方驗證，也不得因第三方未執行而把 SSI 結果改為失敗。

## 4. NVR Scope 判定規則

每一條 NVR 必須按 dependency 判定，不得整批納入或整批排除：

- `IN_SCOPE_SSI_TAG_NVR`：所有判定輸入均由 SSI Resolver 擁有，或已由其 API/page-definition contract 明確提供。須有正向與負向測試、fail-closed 結果及 evidence。
- `OUT_OF_SCOPE_FULL_FIN_NVR`：至少一項必要判定輸入屬非 SSI FIN 欄位、完整 Blocks 1–5、網路／第三方狀態，SSI Resolver 無法完整判斷。第三方 integration 在本專案列 `OUT_OF_SCOPE — CLOSED`。
- 跨 Tag 不等於 out of scope；若涉及的 Tag 全部屬受支援 SSI Tag，仍為 `IN_SCOPE_SSI_TAG_NVR`。
- 若相關 Tag 是判斷受支援 SSI Tag NVR 的必要輸入，該相關 Tag 必須納入 API input／page-parameter contract。API 提供欄位定義、資料型別、合法 option、required／mutual-exclusion／dependency、rule key 與錯誤契約；Generic UI 只依參數呈現、收集並提交，禁止 hard-code。
- BIC 欄位由 API 明訂 `dataType = SWIFT_BIC`，並在同一參數定義中宣告 `lookup/action = BANK_SERVICE`。Generic UI 只有在收到此 metadata 時才顯示 **Bank Service** 按鈕；不得依欄位名稱、MT Tag 或 message type 猜測。選取結果以穩定的 `bankServiceId` 作 API 值，BIC 作顯示與格式／身分驗證資料。
- 只納入完成該 SSI Tag NVR 所需的最小相關 Tag 集合；不得藉此把完整 FIN Message 或不相關業務欄位帶入 SSI Resolver。
- BA 先依 MRG 列出規則依賴欄位，QA 再以 4-eyes 覆核；不得只因規則名稱是 NVR 就交給第三方。

## 5. Message-family 邊界

- **MT2 的 ISO 20022 目標是 pacs.009**；受控範圍為 MT202、MT202COV、MT205、MT205COV。
- **pacs.008 屬 MT1 工作流，不屬 MT2。**
- MT347 是 MT3／MT4／MT7 的內部工作流代號；其 SSI Resolution 為 `REFERENCE_ONLY`、`paymentExecutable=false`，且 **MT↔MX 不適用**。
- MT700／705／707／710／720／740／760 等已裁定不屬真正 SSI Settlement 的報文，不得重新納入 MT347 分母或結案 Gate。

## 6. SSI Resolver 結案 Gate

移除 FIN Validator 阻斷後，message family 只有在以下 **SSI 自身條件**全部成立時才可結案：

1. 受控 TDD 已由兩位 BA 依 4-eyes 原則對同一 SHA 簽認。
2. 所有 in-scope 正向、負向與邊界案例已執行並有結果；不得仍標 `NOT_EXECUTED`。
3. BA + QA 使用 UI 完成 UAT，且 API、頁面參數、UI 與 DB／fixture 證據可互相追溯。
4. 配置與 DB 資料足夠；修正配置後已 Reload DB 並證明結果可重現。
5. Build、type-check、lint、單元／整合／行為測試全部通過。
6. Test coverage > 95%，duplicated code < 1%。
7. 最新 SonarQube Quality Gate = OK，Blocker／Critical／Major = 0。
8. 最終 BA／QA 報告引用相同的 source/config/fixture/DB snapshot/TDD SHA，且未留 SSI-scope BLOCK。

第三方 FIN Validator 不在上述第 1–8 項內。在 SSI 報告中固定列為 `OUT_OF_SCOPE — CLOSED`；如需呈現執行狀態，可另註 `FIN_VALIDATION = NOT_EVALUATED`，但不得因此建立 SSI Open／Block。

## 7. 權威與衝突處理

- SWIFT 欄位與訊息語意：以對應 SR2026 MRG、message-family Memory 及受控 BA 裁定為準。
- SSI Resolver 產品責任與結案邊界：以本文件為準。
- FIN Validator 合約不得擴張 SSI Resolver 的責任，也不得把第三方缺證據轉成 SSI BLOCK。
- 發現衝突時先停止推論，交由 BA／QA（必要時 SD）明示裁定並版本化；不得靜默偏移。
- 2027／2028 等版次變化應由版本化 configuration、mapping、rule catalog 與 page-definition API 承接，遵守 OOD／OOP／SOLID／DRY，不得以 UI hard-code 修補。
- SOLID 落地：欄位 schema、lookup provider、validation rule 與 renderer 各自單一責任；新增 data type／lookup／rule 以註冊及組合方式擴充；Generic UI 依抽象 contract，不依賴特定 MT、Tag 或年度版本的具體判斷。
- 設計基本功是「同中求異、異中求同」：共同行為必須沉澱為共用 schema、validator、adapter、strategy、renderer、lookup provider 與 evidence framework；message family／年度／情境差異只留在版本化 configuration、mapping 與可替換 strategy。禁止複製 MT 專用頁面、流程或 validation code。
- 重複代碼不是事後整理事項：設計與 code review 必須先做共用性／變異點分析，並以 Sonar duplicated code `< 1%`、test coverage `> 95%` 作為不可豁免的結案 Gate。

## 8. 報告用標準語句

> SSI Resolver acceptance is evaluated only against the controlled SSI scope. Full FIN validation is a downstream third-party responsibility and is not an SSI closure gate. When no authoritative FIN Validator evidence is available, record `FIN_VALIDATION = NOT_EVALUATED / OUT_OF_SCOPE`; do not record SSI as blocked or failed for that reason.
