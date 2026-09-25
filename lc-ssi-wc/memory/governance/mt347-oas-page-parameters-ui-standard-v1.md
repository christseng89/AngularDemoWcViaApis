# MT347 OAS → Page Parameters → Generic UI 標準 v1

**狀態：CONTROLLED — PENDING 4-EYES REVALIDATION**  
**生效日期：2026-09-15**  
**參考實作：MT3＋MT4＋MT7（MT347）SSI Resolution**  
**適用範圍：本專案目前及未來所有 SSI Resolution Message Family**

## 1. 目的與不可變原則

本標準把 MT347 已採用的參數驅動畫面方式固定為全產品共同模式。新增 MT2／pacs.009、MT1／pacs.008 或其他 MT／MX family 時，必須重用同一契約與共用元件，不得建立 message-specific UI。

唯一允許的資料流為：

`Controlled SWIFT SSI source + applicable approved ISO/CBPR+ source → Controlled OAS/Typed Contract + Controlled Parameters/DB → Domain Policy/API → API Page Definition → Generic UI → Execution API → Structured Result`

ISO 20022／CBPR+ Usage Guideline／mapping 只適用於已核准的 MT↔MX family。MT347 對 ISO／CBPR+／mapping 固定記 `N/A`＋原因，不得因採用本全產品標準而擴張出 MX／converter scope。

核心責任如下：

- OAS／typed contract 定義交換結構與能力。
- 受控 Parameters／DB 定義版本化業務內容與候選資料。
- Domain/API 裁定 applicable、required、default、eligibility、ranking、`IN_SCOPE_SSI_TAG_NVR` 與 SSI 結果。
- Page Definition 是 API 對特定 Message／Scenario 組合出的不可變畫面契約。
- UI 只 lossless render、收集、提交與顯示結果；UI 不作 SSI 業務判斷。

## 2. OAS 與 Page Definition 的必要內容

### 2.1 Definition identity

每份 Page Definition 必須提供：

- Page Definition 內的 `schemaVersion`、`definitionId`、`definitionVersion`；`contractSha256` 位於 definition envelope／index identity，並由 submission 回傳，不得內嵌自身造成 self-hash 歧義。
- `source.catalogueVersion`、source artifact／SHA；所有具有可執行 SSI Scenario execution contract 的 definition 必須提供 DB/config logical snapshot ID 與 identity method，包括 FIN reference-only definition。
- standards release、message family/type、business domain、direction、business function。
- display identity、profile identity、`paymentExecutable`，以及每個 Scenario 的 `execution.action`／`endpoint`／`method`／`expectedHttp`。SSI resolution 可執行性由 Scenario execution contract 與 Index `executable` projection 決定，不新增或猜測另一個 definition-level 旗標；`paymentExecutable` 與 SSI execution capability 不得混為一談。
- sequences、fields、scenarios、validation rules、evidence references。

UI 不得由 message code 的字首或文字內容推導 family、domain、category、profile 或 execution capability。

### 2.2 Field contract

每個 field 必須由 API Page Definition 明確提供：

- 穩定 `fieldId` 與 submission `path`。
- `label`、`control`、`dataType`。
- `required`、`readOnly`、`visibility`。
- `defaultValue`、`placeholder`、`helpText`（適用時）。
- `displayOrder`、`columnSpan`、`section`。
- allowed `options` 或 `optionSource`。
- constraints 與可重現的 constraint/rule ID。
- SWIFT 欄位適用時的 sequence、settlement leg、tag、option、official role。
- 需要選取受控資料時的完整 `lookup` metadata。

`control` 決定通用 UI control；`dataType` 決定 typed value、format 與 validation semantic。UI 不得因 `MT202`、`53A`、`58A` 等名稱選擇另一套畫面。

### 2.3 Scenario field policy

可重用 field presentation 與 Scenario 決策必須分離。每個 Scenario 對每個 field 必須提供下列 policy；只有 OAS 明訂且可由 validator 強制的 contract-wide default 才可省略逐項 policy：

- `applicability`: `APPLICABLE`／`NOT_APPLICABLE`。
- `inputOwnership`: `TRANSACTION_USER`／`SSI_DERIVED`／`SCENARIO_FIXED`。
- `visibility`: `USER_INPUT`／`HIDDEN_EVIDENCE`／`TEST_ONLY`。
- `processingPolicy`: `APPLY`／`IGNORE_AUDIT`。
- `required`、`readOnly`。

UI 只按 policy 顯示與提交。UI 不得自行判斷某個 Tag 在某個 Scenario 是否 mandatory、optional、derived 或 omitted。

## 3. Generic UI 的 renderer 規則

UI 必須以共用 registry／component 依 `control` 映射：

| OAS `control` | 通用呈現                                                       |
| ------------- | -------------------------------------------------------------- |
| `TEXT`        | typed text input                                               |
| `DATE`        | date input                                                     |
| `SELECT`      | governed select；若有 lookup metadata 則使用共用 lookup picker |
| `RADIO`       | governed radio group                                           |
| `CHECKBOX`    | boolean checkbox                                               |
| `HIDDEN`      | hidden evidence／companion value，不顯示人工輸入               |

額外規則：

1. 欄位順序、區段與 grid 由 `displayOrder`、`section`、`columnSpan` 決定；UI 不依 control 類型猜測寬度或位置。
2. OAS／Page Parameters 分別提供 `swiftTag`、`swiftOption` 與 official description metadata；Generic UI 只使用唯一共用 formatter 呈現 `SWIFT <Tag+Option> • <Official Tag Description>`。API 不預組另一份 display string，UI 不保存 tag description table。
3. 非 SWIFT resolution context（Currency、Booking Entity、Value Date、Counterparty 等）使用 OAS label，不虛構 SWIFT Tag。
4. `SCENARIO_FIXED`、`SSI_DERIVED`、`HIDDEN_EVIDENCE` 與 lookup companion values 不得轉成使用者輸入。
5. Required、read-only、help、empty、loading、error 與 invalid state 均由同一組通用元件呈現。

## 4. Lookup API 選擇標準

UI **不得只依 `dataType` 猜測 API**。例如多個欄位都可能是 `SWIFT_BIC`，但其資料來源可能分別為 SSI Counterparty、Bank Service 或其他受控 provider。

需要 lookup 的 field，OAS／Page Definition 必須提供：

- `provider` 與 `action`。
- same-origin `endpoint`。
- `valueField`、`displayField`、`validationField`。
- `targetRole`（適用時）。
- `dependsOnFieldIds`、`invalidatesFieldIds`、`selectionPolicy`。
- companion value mapping（例如 version）。
- button label、selected label、empty result code（適用時）。

Generic client 的唯一行為是：

1. 驗證 endpoint 是允許的 same-origin API。
2. 依 metadata 將 scenario/message/sequence、search term 與 declared dependency values 傳給 endpoint。
3. 驗證 response envelope 的 provider/action/value identity 與 request metadata 一致。
4. 原子寫入 stable ID 與 companion values。
5. Dependency 改變時，立即清除 metadata 指定的 downstream selected values，再重新 lookup。

### 4.1 Picker／Resolve 同一 eligibility identity

Picker lookup response 與 Resolve submission 必須由 OAS 要求並共享同一份 eligibility identity，至少包含：

- `definitionVersion`、`fixtureBindingId`。
- 完整 dependency context 的 canonical SHA-256。
- DB/config logical snapshot ID 與 snapshot identity method。
- selected candidate stable ID 與 version；適用時包含 selected SSI/applicability/Nostro identity/version。

Resolve API 必須重新驗證 identity、context、candidate 與 snapshot。任何 mismatch、stale version、候選失效或 snapshot 改變都必須 structured fail closed，不得產生 payload、confirmed resolution 或 repair side effect。UI 收到 stale/mismatch response 時只可清除已選 identity並依原 Page Definition metadata reload，不得自行重建候選或保留舊顯示值。

禁止：

- `if (dataType === 'SWIFT_BIC') call bank-service`。
- `if (messageType === 'MT202') call own-account API`。
- UI 根據候選排序自行取第一筆。
- API unavailable 時由 UI 製造 fallback candidate、BIC、account 或 default。

## 5. Default、候選與最佳路徑

1. Static/default input value 由 Scenario `inputValues` 或 field `defaultValue` 提供。
2. Lookup default 必須由 API response 的 `defaultSelection` 明示 stable ID、reason code、dependency identity 及 companion values。
3. UI 只有在 dependency identity 相符、candidate 仍存在且使用者尚未選擇時，才可套用該 default。
4. SSI eligibility、RMA、currency、booking entity、value date、priority/ranking 與唯一最佳路徑由 domain/API 決定。
5. 多個最佳候選相同排名時必須由 API fail closed；UI 不得自行任選一筆。

## 6. Index projection

Index 是 Page Definition 的輕量 projection，不是第二份 catalogue。

- 保留既有欄位、排序、搜尋、鍵盤與選取契約；新增欄位採加法式演進。
- `SSI GENERATED TAGS` 只投影實際由 SSI resolution 生成的 Tag／Option，不顯示完整 message profile 的所有欄位。
- `INPUT FIELDS` 只顯示人工輸入對應的精簡 Tag／Option，不顯示 Tag Description。
- Workbench 才顯示完整 Tag／Option＋Official Tag Description。
- Index 與 Workbench 必須從同一份 OAS／Page Definition metadata 投影。
- immutable runtime definition 可依 standards release／business domain/version/SHA 快取；Reload、版本或 snapshot 改變時必須失效。

## 7. Submission 與 structured result

UI submission 只包含：

- `definitionId`、`definitionVersion`。
- `scenarioId`、`fixtureBindingId`。
- `contractSha256`。
- 只包含 contract 授權的 `TRANSACTION_USER` values 與 lookup stable ID／companion identity，不使用顯示字串。

Client 不得建立或覆寫 `SCENARIO_FIXED`／`SSI_DERIVED` values；它們由 server 依已驗證的 Scenario／fixture merge。若相容性 contract 明確允許 client echo，server 必須要求 exact match，任何差異均 structured reject。

Execution endpoint／method／action／owner／expected HTTP 全由 Scenario execution contract 提供。UI 不自行選 resolver。

Result 必須以 OAS typed result 原樣提供並由通用元件呈現：

- outcome、reason code、payload/confirmation/repair side-effect flags。
- resolved/not-required/no-eligible field rows與 sequence/tag/option/role/value。
- selected SSI/applicability identity、provenance、rule/evidence IDs、request/response SHA 與 correlation ID。
- 適用 MT↔MX family 時，同一 confirmed canonical resolution 所產生的 MT 與 MX structured output；UI 不自行轉換 MT/MX。
- MT347 的 `FIN_REFERENCE_ONLY` 不等於不可執行：其 Scenario 可提供 `action=RESOLVE_SSI` 的 execution contract 且 Index `executable=true`，但 profile `paymentExecutable=false`，不執行付款、不產生 MT/MX payment payload、confirmed resolution 或 Repair Queue side effect；ISO/MT↔MX 部分明確記 `N/A`＋原因。

NVR scope 必須分流：Domain/API 只把 `IN_SCOPE_SSI_TAG_NVR` 納入 SSI execution Gate。`OUT_OF_SCOPE_FULL_FIN_NVR` 固定為 `OUT_OF_SCOPE — CLOSED`、`FIN_VALIDATION=NOT_EVALUATED`，不得形成 SSI failure、`OPEN`、`BLOCKED` 或 Browser UAT executable denominator；真正完整 FIN/network validation 只屬獨立下游 workflow。

## 8. 明確禁止的 UI 業務邏輯

Production Angular source 不得出現以下決策：

- 依 MT/MX code、Tag、option、Scenario ID、fixture ID 決定 field visibility、required 或 API。
- 保存 message description、official tag description、SSI role mapping 或 NVR table。
- 根據 BIC/account/test fixture 判斷 expected result。
- 根據 response 缺項自行補值或把 display value 當 stable/operational value。
- 為單一 Message 建專屬 template、component、CSS override、lookup flow 或 result parser。

如需新增能力，只可新增通用 typed control／lookup provider／result view capability，並以 synthetic contract 證明其他 family 可重用。

## 9. MT347 參考實作位置

以下檔案是標準的實作入口；引用其責任，不得複製規則：

- OAS：`openapi/swift-data-service.v1.json`。
- Typed contract：`libs/contracts/src/page-parameters.ts`。
- MT347 governed source：`apps/ssi-service/src/app/page-parameters/mapping-resolution-page-definition.source.ts`。
- OAS field policy：`apps/ssi-service/src/app/page-parameters/resolution-page-oas-field-policy.service.ts`。
- aggregation/index：`apps/ssi-service/src/app/page-parameters/resolution-page-aggregation.service.ts`。
- lookup/default：`apps/ssi-service/src/app/page-parameters/page-parameter-lookup.service.ts` 與 `page-parameter-lookup-defaults.service.ts`。
- generic mapper/form/client：`apps/ssi-portal/src/app/resolution-workbench/parameter-model.mapper.ts`、`generic-parameter-form.component.*`、`page-parameter.client.ts`。
- controlled Scenario/fixture：`parameters/resolution-page-scenarios.sr2026.json`、`parameters/resolution-page-fixtures.mt347.sr2026.json`。
- BA/QA basis：`memory/ssi/swift-mt347-v2.md` 與 `qa/mt347/` evidence。

## 10. TDD、architecture 與 BA/QA Gate

每次新 family 或 contract 變更至少必須通過：

1. Contract test：OAS schema 與 TypeScript contract 同步，required/enum/endpoint metadata 完整。
2. Definition test：field/policy/scenario/evidence 可追溯，且沒有 unauthorized duplicate truth。
3. Generic UI test：API definition → typed view model → rendered control/default → lookup request → execution request lossless。
4. Synthetic Open/Closed test：新增未知 message/tag/option 只改 contract/parameters，既有 Generic UI 可呈現與提交。
5. Hard-code scan：production UI 無 message/tag/scenario/BIC/account/fixture 業務分支。
6. Dependency/default test：變更上游欄位會清除 downstream identity；default 只由 API `defaultSelection` 驅動。
7. Index regression/performance：原欄位不消失且 SSI generated tags 正確。每個 release candidate 必須引用一份 versioned performance profile，明訂 cold（process/reload 後首請求）與 hot（同 immutable snapshot 後續請求）、每個 domain 的最少樣本數、p50/p95、最大 payload bytes、絕對 latency budget及相對前一 accepted baseline 的最大 regression tolerance。PASS 必須同時滿足絕對 budget與相對 tolerance；缺 profile、baseline、樣本或 percentile 一律 `NOT_EXECUTED`／`NOT_ACCEPTED`，不得只憑單次體感宣告改善。
8. API/UI result test：success、no eligible、ambiguity、`IN_SCOPE_SSI_TAG_NVR` failure、data-quality failure、candidate stale、snapshot/context mismatch 均 fail-safe/fail-closed，且驗證無錯誤 side effect與無 duplicate submission side effect。`OUT_OF_SCOPE_FULL_FIN_NVR` 只驗證其 CLOSED／NOT_EVALUATED disposition，不得加入 executable failure 分母。
9. Picker/Resolve consistency：以 unchanged context 完成 picker→resolve；再分別驗證 dependency invalidation、stale candidate、snapshot change、同 rank ambiguity及 reload，且 identity trace lossless。
10. BA＋QA Browser UAT：完整分母為所有 Scenario `execution.action=RESOLVE_SSI` 且 Index `executable=true` 的 `Message × Scenario × Currency × 每個 enabled Counterparty`；own-account Scenario 改用每個 enabled `Receiver Bank/account` 組合。Operational 正向、QA 負向及 Boundary 全數執行，保留 `PASS`／`FAIL`／`BLOCKED`／`NOT_EXECUTED`，並對同 code/OAS/definition/fixture/DB snapshot SHA 4-EYES 簽認。完整 FIN/network validator cases 不屬此分母。

任一 Gate 未通過時狀態為 `NOT_ACCEPTED`；不得以 UI 看似可操作或 unit test 單獨通過宣告完成。
