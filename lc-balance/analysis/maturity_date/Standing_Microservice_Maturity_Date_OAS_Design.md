# Standing 基礎資料服務：Trade Finance 到期日計算 OAS 設計（v2.10.0）

> **文件與測試版本追蹤（第八輪 P2 建議）**
> API Contract Version: 2.10.0
> Design Document Revision: R19（對應第十九輪審閱）
> Semantic Test Suite: 136 cases（56 正向、80 反向）
> Git Commit / Release Tag: `<commit-or-tag，交付時由 CI／Release 流程填入>`
>
> 補上此區塊是為了避免「同樣都是 v2.x.0，但某份只有較舊測試數、另一份已更新」這類交付追溯落差——OAS 版本號只反映 API 合約本身是否變動，實際測試覆蓋度與文件內容須另外以此區塊追蹤。之後每次修訂（即使 OAS 版本號不變）都應更新 Design Document Revision 與 Semantic Test Suite 這兩行。

本文彙整 Standing Microservice（現有 Currency、Country、Holiday/Weekend by Country）擴充為可支援 Trade Finance 交易 Maturity Date 計算之架構決策、資料模型缺口，以及 OpenAPI 規格設計。對應之技術規格檔為 `standing-calendar-service.oas.yaml`（v2.10.0，已通過 `openapi-spec-validator` 之 OpenAPI 3.0.3 結構驗證：7 個 path、19 個 schema（第十三輪新增 `CountryCode`／`CurrencyCode`／`BicCode`，第十四輪再新增 `CalendarCode`；第十五、十六輪皆未新增 schema 元件，僅修改既有的 `CalendarReference`／`CalendarVersionRef`／`CalendarAssessment`）、122 處內部 `$ref` 全數可解析（已用程式逐層走訪 spec 物件計數，純文字搜尋因本文件與程式註解偶爾以「$ref」作英文詞組使用、以及一段示範 YAML 片段引用而多出雜訊，目前為 128）、0 筆失效參照、全部 34 個 response 皆已宣告 `X-Correlation-ID` 回應標頭；文中之 request/response 範例，以及正、反向測試案例，共 136 項（56 正向、80 反向），均已個別通過 `jsonschema.Draft4Validator` 驗證並實際執行確認全數通過，**第十六輪額外發現並修正 3 項既有測試（`AddBusinessDaysResponse` 之 leap-year／年度跨界正向案例）在新增 `CalendarVersionRef` 格式約束後意外回歸失敗，已修正該測試共用之 fixture 資料後重新確認全數通過**，驗證器自第七輪起啟用 `format_checker`、`format: date`／`date-time` 欄位之格式為實際驗證範圍，第八輪起 `requirements-dev.txt` 已明確聲明 `jsonschema[format-nongpl]`、腳本啟動時亦會 fail-fast 檢查格式檢查器是否確實可用，第十輪起相依套件版本下限已明確鎖定為 `jsonschema[format-nongpl]>=4.18,<5` 並新增 `referencing>=0.28.4` 為直接相依，`$ref` 解析已改用 `jsonschema`／`referencing` 官方公開之 `registry=` API（不再使用已棄用之 `RefResolver` 或未公開之 `_resolver=`），第十二輪起新增 `CURRENCY_NOT_FOUND`／`COUNTRY_NOT_FOUND` 錯誤碼並將五個 GET 端點之 404 回應 schema-narrow 至各自專屬 errorCode，`GET /countries/{code}` 之 `weekendDays` AE 範例由過時的 `["FRI","SAT"]` 修正為現行的 `["SAT","SUN"]`，第十三輪起 `weekendDays` 補上 `minItems`／`maxItems`／`uniqueItems`、`pathGroup` 補上 `minLength`／`maxLength`／`pattern`、`GET .../is-business-day` 之 422 與 `GET .../holidays` 新增之 400 均已 schema-narrow 至專屬 errorCode、`GET /countries/{code}` 新增四個必填治理欄位、新增 `CountryCode`／`CurrencyCode`／`BicCode` 格式元件、兩個計算端點的 request schema 補上 `additionalProperties: false`，第十四輪修正 `BicCode` pattern（原本會誤放行第 5–6 碼為數字的偽 BIC）、將 `defaultCountryCalendarCode` 由強制等於 `CountryCode` 鬆綁為獨立的 `CalendarCode` 元件（不再假設國家行事曆代碼必然等於兩位國碼），並修正附錄 A 之阿爾及利亞改制年份錯誤（應為 2009 年而非 2019 年）、補上逐國可追溯之來源引用結構、將以色列拆分為多個獨立範疇說明，**第十五輪將 `CalendarReference.code` 改為以 `oneOf` 依 `calendarType` 分支強制格式（COUNTRY／FINANCIAL_CENTER 用 `CountryCode`、INSTITUTION 用 `BicCode`），修正本文件自己在 v2.7.0 說明中對 OAS 3.0.3 表達能力的一項過度保守（其實可行卻誤判為不可行）主張；過程中另外自行發現並修正一項既存錯誤——`CalendarCodePath` 說明文字誤稱 CURRENCY_CLEARING 之代碼遵循 `CurrencyCode`（三碼幣別代碼）格式，實際上此類代碼是 `USD_FEDWIRE`／`EUR_TARGET2` 這類清算系統識別碼，與 `CalendarType` 元件自己的說明及既有範例矛盾，現已修正並在新增的 `oneOf` 中刻意不對 CURRENCY_CLEARING 分支施加錯誤格式；並修正附錄 A 之以色列 TASE 生效日／清算範疇描述錯誤、國家筆數計數錯誤、歷史 hardening notes 之時效性標註，以及查證欄位之核准狀態機，**第十六輪修正第十五輪新增之 `oneOf` 本身的一項自我矛盾——COUNTRY／FINANCIAL_CENTER 之 `code` 原本收緊為 `CountryCode`（兩位國碼），與本文件自己在第十四輪已確認「Country Calendar ID 不保證等於兩位國碼」的立場矛盾，已改用較寬鬆的 `CalendarCode`，CURRENCY_CLEARING 亦因此改為受 `CalendarCode` 格式約束（不再是完全不受限），並將同一套判別聯集延伸套用至 `CalendarVersionRef.code` 與 `CalendarAssessment.code` 以保持一致性**，**第十七輪確認第十六輪之修正全數正確落實、136/136 語意測試通過，未發現任何 P0／P1，本設計正式核准為 Approved Design Baseline（評分 9.9／10），另提出三項非阻擋性 P2／P3 建議（Approved Design Baseline 與 Production Readiness Approval 之範圍區分、附錄 A 正式核准流程之重申、Clean Baseline 與 Review History 文件拆分之再評估），皆屬文件澄清與強調，未變更 schema 或程式行為，故本輪 API Contract Version 維持 v2.10.0 不變，詳見 3.64～3.66 節；**第十八輪確認第十七輪之三項回應皆未影響 schema 與測試，並指出 3.63 節與第七節版本號分界點敘述中「未來進入 v1.0.0 對外發布」一詞易與目前已使用之 `v2.10.0` 版本號並列而誤讀為版本倒退，已改為不指定具體版本號之「首次正式對外發布」敘述，詳見 3.67 節，本輪同樣為純文件用詞修正，API Contract Version 維持 v2.10.0**；**第十九輪確認第十八輪之修正方向正確，並進一步指出 3.67 節之修正說明仍替尚未召開的產品／發布治理決策預先斷言「內部設計版本號與對外發布版本號完全獨立」這個具體立場，與本文件對待此類開放式產品政策問題（如 3.55 節）之一貫原則不一致，已改為同樣的開放式處理方式，詳見 3.68 節，本輪同樣純屬文件用詞收斂，API Contract Version 維持 v2.10.0**，驗證腳本 `validate_semantics.py` 隨附）。

v2.0.0／v2.1.0／v2.2.0／v2.3.0 分別依前四輪審閱意見修正 P0 缺口、把規則從 description 文字轉為真正的 JSON Schema 約束、處理不可抗力 fail-closed 與回應標頭一致性等問題（第四輪綜合評分 9.7／10，Approved Design Baseline）。v2.4.0 處理第五輪審閱意見：第五輪在已核准的 baseline 之上，指出五項 P1 與一項 P2——(1) `calculationWindowStartDate`／`calculationWindowEndDate` 定義為 `min`／`max(sourceDate, adjustedDate)` 對 `MODIFIED_FOLLOWING`／`MODIFIED_PRECEDING`／`NEAREST` 不成立，因為這些 convention 可能先往一個方向試探、最終改用另一方向的日期；(2) `CALENDAR_NOT_CONFIGURED` 同時以 404（GET 端點）與 422（POST 計算端點）兩種狀態碼出現，違反文件自己宣稱的「同一錯誤碼固定對應同一 HTTP 狀態」原則；(3) `skippedDates`／`CalendarAssessment` 中的 `FORCE_MAJEURE_EVENT` 無法區分「目前仍有效」與「已解除、僅留稽核紀錄」；(4) 共用 `X-Correlation-ID` header 元件未宣告 `required: true`；(5) `GET /currencies`、`GET /countries` 的成功回應仍缺 `required[]`，與文件宣稱的「五個查詢端點皆已補齊」不符；另有 P2——3.13 節引用的「16 筆／7 筆」required 錯誤數，因後續新增欄位已經過時。v2.4.0 逐項修正，方法論不變：能以 OpenAPI 3.0.3 schema 表達的規則轉為真正約束並附負向測試，無法宣告式表達者則明確標示為服務端強制（第五輪對 v2.4.0 之評分 9.8／10）。**v2.5.0 處理第六輪審閱意見**：第六輪重新審視 v2.4.0，指出 `CalendarAssessment` 的 `businessDay=true` 分支仍未禁止同時出現 `reasonCode`／`closureStatus`／`resolvedAt`／`manualReviewRequired=true`／`automaticAdjustmentAllowed=false`，導致「營業日」與「不可抗力休市」可以自相矛盾地同時通過 schema 驗證（P1），並指出第四節 Impact Report 說明與第七節測試分層表仍殘留第五輪修正前的舊文字（兩項 P2）——第六輪對 v2.4.0 之評分為 9.7／10，Conditionally Approved。v2.5.0 將 `CalendarAssessment` 由單一 `oneOf` 改為 `allOf` 兩組獨立 `oneOf`，補上第二組互斥規則，並額外落實審閱建議之非阻擋性選項——`resolvedAt` 與 `closureStatus=RESOLVED`／`CANCELLED` 之間的強制對應（同時套用於 `CalendarAssessment` 與 `skippedDates[]`），詳見 3.36、3.37 節。**第七輪審閱 v2.5.0，確認第六輪主要問題已完整修正，將本設計列為 Approved Design Baseline（評分 9.8／10），另指出驗證腳本尚未真正啟用 `format: date`／`date-time` 檢查（P1）及兩項文件用詞建議（P2），v2.5.0 版本號本身不變（規則層級無變動，僅驗證腳本與本文件文字更新），詳見 3.38 節。** 第八～十一輪（3.39～3.43 節）皆為驗證工具鏈與文件品質的收斂，未再變動 `standing-calendar-service.oas.yaml` 之 schema 本身，v2.5.0 版本號沿用四輪。**v2.6.0 處理第十二輪審閱意見**：第十二輪比對 OAS、驗證腳本與 UAE 官方資料後，指出兩項真正的業務／API 契約問題（P1）——(1) `GET /currencies/{code}`、`GET /countries/{code}` 的 404 回應共用 `ErrorResponse` schema，但 `errorCode` 列舉中沒有任何一個值同時符合「schema 合法」與「業務語意正確」，找不到專屬碼可用；(2) `GET /countries/{code}` 之 `weekendDays` 範例對 AE（阿拉伯聯合大公國）仍使用 2022 年之前已廢止的 `FRI`／`SAT`，UAE 聯邦公部門週末自 2022-01-01 起已改為 `SAT`／`SUN`——並指出第零節一項文件描述與 OAS 實際不一致的 P2（誤稱三個行事曆查詢端點皆有 422）。v2.6.0 新增 `CURRENCY_NOT_FOUND`／`COUNTRY_NOT_FOUND` 錯誤碼，並將五個相關 GET 端點之 404 回應以 `allOf`＋`enum` schema-narrow 至各自專屬碼（非僅補文字說明）；修正 AE 週末範例並補充版本化說明；修正第零節錯誤碼段落之實際 422 涵蓋範圍。詳見 3.44、3.45 節。**v2.7.0 處理第十三輪審閱意見**：第十三輪確認第十二輪之修正全數正確（78/78 語意測試通過、structural 驗證通過），另指出四項 P1 與四項 P2。P1：(1) `weekendDays` 缺少 `minItems`／`maxItems`／`uniqueItems`，空陣列、重複值、七天全選皆為 schema 合法；(2) `pathGroup` 未禁止空字串，服務端若只檢查欄位是否存在可能誤判為已有替代付款路徑；(3) `GET .../is-business-day` 之 422 未 narrow 至專屬 errorCode，與第十二輪已收斂的 404 契約不一致；(4) `GET .../holidays` 未限制查詢區間長度，呼叫端可要求任意長區間造成大量讀取與 timeout 風險。P2：(1) `GET /countries/{code}` 應補上治理欄位（生效日、版本、最後核准時間、來源權威）；(2) `CountryCode`／`CurrencyCode`／`BicCode` 應有格式限制，避免任意字串通過；(3) 核心 request schema 應考慮 `additionalProperties: false`，避免欄位拼字錯誤被靜默忽略；(4) `weekendDays` 說明文字誤將交叉引用指向 3.44 節，實際應為 3.45 節。v2.7.0 逐項修正：`weekendDays`／`pathGroup` 補上對應約束；`GET .../is-business-day` 422 與 `GET .../holidays` 新增之 400 均以 `allOf`＋`enum` schema-narrow；`GET /countries/{code}` 新增四個必填治理欄位；新增 `CountryCode`／`CurrencyCode`／`BicCode` 三個共用格式元件並套用於明確單一用途欄位（`CalendarReference.code` 等因與 `calendarType` 互為條件、OAS 3.0.3 無 `if`/`then` 而維持 SERVER-ENFORCED，明確標註）；兩個計算端點的 request schema 補上 `additionalProperties: false`；修正交叉引用錯字。日期區間上限本身（366 天）因涉及比較兩個查詢參數的實際值，OAS 3.0.3 仍無法宣告式表達，明確標示為 SERVER-ENFORCED，僅新增之 400 回應形狀本身為 schema 契約；審閱建議之分頁機制（`page`/`pageSize`/`nextPageToken`）本輪**未**實作，理由與新增 API surface 之取捨說明見第七節。詳見 3.46～3.52 節。**v2.8.0 處理第十四輪審閱意見**：第十四輪確認第十三輪之修正大部分正確落實，並肯定版本提升至 v2.7.0 之合理性，另指出附錄 A（第十三輪新增之 12 國週末查證附錄）的一項 P1（三個子項）與 schema 本身的兩項 P2。P1（附錄 A）：(1) 阿爾及利亞改制年份誤植為 2019 年，正確應為 2009 年；(2) 附錄之「查證依據」欄位過於概括（如「2026年資料確認未變」），不足以作為銀行級 Standing Data 之核准證據，應補上可追溯之 `sourceAuthority`／`sourceDocument`／`sourceUrl`／`verifiedAt`／`verifiedBy`／`calendarScope` 等結構化欄位；(3) 以色列不應簡化為單一 `weekendDays: ["FRI","SAT"]`，應依 COUNTRY／銀行／清算／證交所等不同範疇分開說明。P2：(1) `BicCode` 之 pattern 未強制第 5–6 碼（ISO 國碼區段）必須為英文字母，會誤放行 `"12345678"`、`"BANK12XX"` 等結構上不可能存在的偽 BIC；(2) `defaultCountryCalendarCode` 直接參照 `CountryCode`，隱含假設「國家行事曆代碼必然等於兩位國碼」這項未經確認的產品政策。v2.8.0 逐項修正：獨立查證 Algeria 改制年份（透過一篇 2010-08-14 之當代部落格文章「今天正好是 Algeria 由 Thursday-Friday 改為 Friday-Saturday 滿一年」的直接證據，確認正確年份為 2009 年，而非先前引用之 gulfnews.com 文章「最後更新於 2019 年 7 月」這個 CMS 重新發佈時間戳造成的誤導）；重寫附錄 A 為逐國結構化來源表；查證 Bank of Israel 與 Tel Aviv Stock Exchange（TASE）之實際營業日規則（發現 TASE 已於 2026 年初改為 Monday–Friday 交易週、星期五縮短交易、星期日不再交易，與國家整體週末制度方向相反，進一步印證第十四輪意見與既有 `COUNTRY`／`INSTITUTION`／`CURRENCY_CLEARING`／`FINANCIAL_CENTER` 分層設計的正確性）；修正 `BicCode` pattern 為 `^[A-Z0-9]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$`；新增 `CalendarCode` 元件並將 `defaultCountryCalendarCode` 改參照此元件。詳見 3.53～3.55 節與附錄 A。**v2.9.0 處理第十五輪審閱意見**：第十五輪確認 v2.8.0 之三項修正（BIC pattern、`defaultCountryCalendarCode`、Algeria 年份）全數正確，schema 驗證 120/120 通過，另指出兩項 P1 與三項 P2。P1：(1) 附錄 A 之以色列 TASE 說明有兩處事實錯誤——`2026-01-05` 實際上是星期一（新交易週制度生效日），並非「首次星期五交易」，首個實際星期五交易日應為 `2026-01-09`；且 `IL-CLEARING` 不應直接推定與 `IL-BANKING` 相同，TASE 交易日（Monday–Friday）與其清算安排（依國際託管機構官方文件，星期五之交易指示於次一個星期日撮合結算）實際不同，另外 ILS 大額即時清算系統 Zahav（Bank of Israel 官方 RTGS 系統）本身也是獨立於 TASE 清算之外的第三個範疇；(2) 本文件對「升級 OAS 3.1 即可解決哪些現存限制」之說明過於樂觀——部分限制（陣列存在性，如 `contains`）確實只需等 3.1；但跨兩個獨立 Parameter Object 的條件式格式驗證（`CalendarCodePath`）與涉及日期運算的門檻檢查（366 天區間），即使升級到完整對齊 JSON Schema 2020-12 的 3.1，仍然無法宣告式表達，這兩類限制與 OAS 版本無關，需要修正說明用詞；同時，`CalendarReference.code` 這一項原本被本文件自己誤判為必須等 3.1 才能解決，實際上現有 OAS 3.0.3 的 `oneOf` 已可直接解決，本輪已直接實作。P2：(1) 附錄 A 標題與內文寫「12 個一般國家」，但實際表格列出 13 國（含約旦研議中項目），計數與實際列數不一致；(2) OAS 檔案內 v2.7.0 hardening notes 區塊仍原樣保留已於 v2.8.0 修正之舊 `BicCode` pattern 與 `defaultCountryCalendarCode` 舊行為文字，若讀者只看該區塊可能誤以為仍是現況；(3) 附錄 A 的 `verifiedBy: Claude` 未區分「AI 輔助查證」與「人類正式核准」兩個不同層級的把關動作，銀行級 Standing Data 治理應有更明確的狀態機。v2.9.0 逐項修正：獨立查證 TASE 與 Bank of Israel Zahav 系統之實際排程（引用 Bank of Israel 官方 PDF 與國際託管機構 Clearstream 之官方市場文件），將以色列拆分為五個範疇（新增 `IL-ILS-ZAHAV`，並將原本推定的 `IL-CLEARING` 更正為以官方文件為據之獨立 `IL-TASE-CLEARING`）；改寫第七節之 OAS 3.1 能力說明段落，明確區分「3.1 真的能解決的」與「無論版本都需服務端／客製驗證器」兩類；實作 `CalendarReference.code` 之 `oneOf` 格式強制（COUNTRY／FINANCIAL_CENTER 用 `CountryCode`、INSTITUTION 用 `BicCode`），並在實作過程中自行發現並修正 `CalendarCodePath` 說明文字對 CURRENCY_CLEARING 代碼格式的既存錯誤描述；修正附錄 A 國家計數為 13；為 OAS 內 v2.7.0 hardening notes 補上時效性交叉標註（不重寫歷史文字本身）；將附錄 A 的查證揭露欄位擴充為 `researchAssistedBy`／`verifiedBy`／`approvedBy`／`approvedAt`／`approvalStatus`（`DRAFT`／`VERIFIED`／`APPROVED`／`SUPERSEDED`）狀態機，目前全數標記為 `DRAFT`。詳見 3.56～3.60 節與附錄 A。**v2.10.0 處理第十六輪審閱意見**：第十六輪確認 OAS 規格驗證與 129/129 語意測試通過、TASE 生效日／清算拆分、國家計數、治理欄位、OAS 3.1 說明、歷史版本註記等第十五輪修正皆已正確落實，但指出一項會阻斷合法使用情境的 P1，以及三項 P2。P1：`CalendarReference.code` 針對 COUNTRY／FINANCIAL_CENTER 收緊為 `CountryCode`（兩位國碼），與 `GET /countries/{code}` 之 `defaultCountryCalendarCode` 允許回傳 `"AE_FEDERAL"` 這類非兩位國碼格式的值互相矛盾——呼叫端若把 API 回傳的合法值原樣放入計算請求，會被同一份規格自己的另一處約束拒絕。P2：(1) `CalendarReference.code` 之說明文字仍提及 `CurrencyCode`，與 CURRENCY_CLEARING 之實際格式（結算系統識別碼）不符；(2) 文件仍將 `CalendarReference.code` 描述為完全服務端驗證，但實際上已是「部分 schema 驗證、部分服務端驗證」；(3) `CalendarVersionRef.code` 與 `CalendarAssessment.code` 應採用與 `CalendarReference.code` 相同的識別碼規則，避免 request、version evidence、assessment 三處回傳格式不一致；另外提出版本號考量：若 v2.8 已對外投入使用，新增更嚴格的 `oneOf` 可能屬於不相容變更，應評估升 major version。v2.10.0 逐項修正：將 `CalendarReference.code` 之 COUNTRY／FINANCIAL_CENTER 分支由 `CountryCode` 改為與 `defaultCountryCalendarCode` 一致的 `CalendarCode`，CURRENCY_CLEARING 因 `CalendarCode` 之寬鬆格式本來就涵蓋 `USD_FEDWIRE` 這類值而併入同一分支（不再完全不受限）；同一套判別聯集延伸套用至 `CalendarVersionRef.code` 與 `CalendarAssessment.code`（後者以獨立的第三組 `allOf` 成員新增，不干擾既有兩組規則，並重新驗證第六輪既有 5 項回歸測試）；更新 `CalendarCodePath` 之說明文字使其與新設計一致；於文件中誠實區分本次變更屬於「鬆綁」（COUNTRY／FINANCIAL_CENTER）或「新增限制」（CURRENCY_CLEARING、`CalendarVersionRef`、`CalendarAssessment`）兩種不同方向，並說明現階段仍屬設計審閱、尚無外部使用者，故沿用一貫的次版本號升級方式而非升 major version。過程中發現並修正 3 項既有測試因共用 fixture 資料而意外回歸失敗的問題。詳見 3.61～3.63 節。**第十七輪確認 v2.10.0 之修正完整且無新增 P0／P1，本設計正式核准為 Approved Design Baseline（9.9／10），並提出三項非阻擋性 P2／P3 建議：(1) 明確區分「Approved Design Baseline」（API 契約設計本身之核准）與「Production Readiness Approval」（服務層實作、跨服務整合、正式上線之核准）兩者範圍不同，已於第零節與第七節測試分層表前補上明確聲明；(2) 重申附錄 A 之 `approvalStatus` 狀態機（3.60 節）——目前全數為 `DRAFT`，正式上線前必須完成 `VERIFIED`／`APPROVED` 流程，已於附錄 A 開頭補上直接提醒；(3) 建議將本文件拆分為「Approved Clean Baseline」與「Review History / Decision Log」兩份文件，此與第十輪 P2 建議方向一致，評估後認為累積至十七輪、拆分價值持續上升，但一次性拆分 3.1～3.66 共 66 個小節之改版風險仍超出單一輪次應承擔範圍，故維持第零節既有折衷方案，正式列入第七節追蹤項目待後續評估執行時機。三項建議皆純屬文件澄清與強調，未變更 `standing-calendar-service.oas.yaml` 之 schema 或 `validate_semantics.py` 之驗證邏輯，API Contract Version 維持 v2.10.0，語意測試維持 136/136。詳見 3.64～3.66 節。** **第十八輪確認上述回應無誤，本設計維持 Approved Design Baseline（9.9／10），並指出一項非阻擋性 P2：3.63 節與第七節之版本號分界點說明中，「若本設計未來正式進入 v1.0.0 對外發布」一句，因本文件目前已使用到 `v2.10.0` 這個版本號，字面上容易被誤讀為版本號要倒退回 `v1.0.0`，而非原意「首次正式對外發布」這個事件——已將兩處相關文字改為不指定具體版本號之敘述，詳見 3.67 節，本輪同樣純屬用詞修正，未變更 schema 或測試。** **第十九輪確認第十八輪之修正方向正確，並提出一項非阻擋性 P3：3.67 節之修正說明段落雖已不指定具體版本號，但仍寫了「與……是兩套完全獨立的編號體系」，這句話替尚未召開的產品／發布治理決策預先斷言了一個具體立場，應比照 3.55 節之開放式處理原則（記錄問題、不代為決定）——已於 3.68 節改寫為不預設答案之版本，3.67 節原文字依歷史記錄原則保留不重寫，本輪同樣純屬文件用詞收斂，未變更 schema 或測試。**



**版本與審閱狀態小結（呼應第七輪 P2 建議，統一歷史記載避免同一輪次出現兩個分數；完整表格見第七節）：** v2.3.0（第四輪）9.7／10，Approved Design Baseline；v2.4.0（第五輪）9.8／10；v2.4.0 經第六輪重新審視後 9.7／10，Conditionally Approved；v2.5.0（第七輪）9.8／10、（第八輪）9.9／10、（第九輪）9.8／10、（第十輪）9.9／10、（第十一輪）9.9／10，皆為 Approved Design Baseline；v2.6.0（第十二輪）9.6／10，Conditionally Approved，修正後預期回到 9.9／10（第九輪之分數波動純屬驗證腳本內部實作細節，非 Trade Finance 業務設計本身的問題，第十輪起已修正並穩定在 9.9／10；第十二輪則是真正的業務語意缺口，見第七節表格與 3.41～3.45 節）；v2.7.0（第十三輪）9.6／10，Approved with Minor P1 Enhancements，修正四項 P1 後預期達 9.8／10（第十三輪本身未發現 P0，且明確確認第十二輪之修正正確，屬於在既有 Approved 基礎上進一步收斂邊界情況與治理欄位，見第七節表格與 3.46～3.52 節）；v2.8.0（第十四輪）9.7／10，Approved with One P1 Correction，修正附錄查證缺口與兩項 schema P2 後預期達 9.9／10，Approved Design Baseline（第十四輪之 P1 集中在附錄 A 之外部資料查證品質，非 schema 契約本身；schema 層級僅兩項非阻擋性 P2，見第七節表格與 3.53～3.55 節）；v2.9.0（第十五輪）9.8／10，Approved Design Baseline，另有兩項 P1（附錄 A 之以色列 TASE 事實錯誤、OAS 3.1 能力說明過度樂觀）與三項 P2（附錄國家計數、OAS 歷史說明時效性、`verifiedBy` 治理狀態機）待修正，修正後預期達 9.9／10（第十五輪本身未發現 P0，且明確確認 v2.8.0 之三項修正正確，`CalendarReference.code` 之 `oneOf` 修正額外把一項原本判給「等 3.1」的限制提前在 3.0.3 解決，見第七節表格與 3.56～3.60 節）；v2.10.0（第十六輪）9.7／10，Conditionally Approved，另有一項會阻斷合法使用情境的 P1（`CalendarReference.code` 對 COUNTRY／FINANCIAL_CENTER 之條件驗證過度限制，與 `defaultCountryCalendarCode` 之既有設計互相矛盾）與三項 P2（`CalendarReference.code` 說明文字殘留 `CurrencyCode`、服務端驗證範圍描述過時、`CalendarVersionRef`／`CalendarAssessment` 識別碼規則不一致，另含版本號考量），修正後預期達 9.9／10（第十六輪確認第十五輪所有修正皆正確落實，本輪之 P1 是第十五輪自己新增的 `oneOf` 內部矛盾，非全新缺陷；重新測試時額外發現並修正 3 項既有測試因共用 fixture 資料而回歸失敗，見第七節表格與 3.61～3.63 節）；v2.10.0（第十七輪）9.9／10，Approved Design Baseline，無未解決之 P0／P1，另有三項非阻擋性 P2／P3 建議（Approved Design Baseline 與 Production Readiness Approval 之範圍區分、附錄 A 正式核准流程重申、Clean Baseline／Review History 文件拆分之再評估），已全數以文件澄清方式回應，schema 與測試數不變，見第七節表格與 3.64～3.66 節；v2.10.0（第十八輪）9.9／10，Approved Design Baseline，無未解決之 P0／P1，另有一項非阻擋性 P2（版本號分界點敘述中「未來進入 v1.0.0」易誤讀為版本倒退），已修正為不指定具體版本號之敘述，schema 與測試數不變，見第七節表格與 3.67 節；v2.10.0（第十九輪）9.9／10，Approved Design Baseline，無未解決之 P0／P1，另有一項非阻擋性 P3（3.67 節之修正說明仍替未召開之產品／發布治理決策預先斷言「內部設計版本號與對外發布版本號完全獨立」之具體立場），已改為比照 3.55 節之開放式處理原則，schema 與測試數不變，見第七節表格與 3.68 節。

## 零、目前生效規則總覽（Approved Clean Baseline）

> **第十七輪 P2 澄清（3.64 節）：「Approved Design Baseline」核准的範圍，僅限於本文件與 `standing-calendar-service.oas.yaml` 所定義之 API 契約設計（schema 結構、欄位約束、錯誤碼、版本治理）本身內部一致、且已通過結構與語意層級的自動化驗證；不代表、也不等同於服務端實作、日期運算正確性、跨服務整合或正式上線（Production Readiness）已完成或已核准。後者需依第七節測試分層表所列之 Service／Gateway／Integration／UAT 四層測試逐一完成後，另行走完各自的核准流程。**

> 第十輪審閱建議（非阻擋性 P2）：本文件累積十輪審閱歷程後，section 三（3.12～3.42）的逐輪敘事雖有利稽核追溯，但混雜了「目前規則」與「歷史問題／已修正的舊行為」，可能降低正式 baseline 的可讀性，建議區分「Approved Clean Baseline」（現行規則）與「Review History / Changelog」（各輪問題、原因、分數）。考量到 section 三每一小節都附有具體 JSON 反例與程式驗證佐證，重新拆分為兩份文件有搬動既有內容、引入新錯誤的風險，因此本節改以**新增一份不含輪次歸屬的「目前生效規則」摘要**取代整份重寫：本節只描述 v2.5.0 目前實際生效的規則，不重複逐輪來龍去脈；完整理由、反例、負向測試與各輪分數，仍在 section 三（3.1～3.42）與第七節，作為 Review History／Changelog 保留，兩者互不取代。

**服務邊界：** Standing 只計算 calendar-adjusted date，不涉入 LC／Bill／Obligation／Balance／Settlement，也不判定正式 Overdue；`/business-days/adjust` 每次回應固定 `contractualDateChanged: false`（`enum: [false]`，非僅描述文字）。

**端點總覽（7 個）：**

| 方法與路徑 | 用途 |
| --- | --- |
| `POST /business-days/adjust` | 依行事曆規則調整單一日期至合格營業日 |
| `POST /business-days/add` | 從起算日往後加減 N 個營業日 |
| `GET /calendars/{calendarType}/{code}/is-business-day` | 查詢單一日期於單一行事曆是否為營業日 |
| `GET /calendars/{calendarType}/{code}/holidays` | 列出行事曆於指定區間之假日清單 |
| `GET /calendars/{calendarType}/{code}/completeness` | 查詢行事曆資料涵蓋前瞻範圍 |
| `GET /currencies/{code}` | 幣別主檔 |
| `GET /countries/{code}` | 國家主檔 |

**目前以 JSON Schema 實際強制（非僅 description 文字）的規則：**

`contractualDateChanged` 為 `enum: [false]`；兩個計算端點的回應 `required[]` 涵蓋所有恆定回傳欄位（含 `calendarVersions`、`calendarAssessments`、`adjustedDateAssessments`、`calculationWindowStartDate`／`EndDate`），且三者陣列皆有 `minItems: 1`；兩個計算端點之 request schema（`AdjustBusinessDayRequest`、`AddBusinessDaysRequest`）第十三輪起皆宣告 `additionalProperties: false`，未知欄位（如拼字錯誤的 `sourceData`）為 schema 不合法，不再被靜默忽略；`sourceDateType`／`calculationPurpose` 合法配對以 `oneOf` 強制；`calendarSnapshotId`／`asOfDateTime` 以 `not` 強制互斥；`CalendarReference.role` 為必填，`pathGroup`（第十三輪起）宣告 `minLength: 1`／`maxLength: 50`／`pattern: '^[A-Za-z0-9._-]+$'`，空字串或格式不符之值為 schema 不合法；`CalendarAssessment` 為 `allOf` 兩組獨立 `oneOf`——Group 1 規定 `businessDay=true` 不得同時帶 `reasonCode`／`closureStatus`／`resolvedAt`／`manualReviewRequired=true`／`automaticAdjustmentAllowed=false`，`businessDay=false` 須帶對應 `reasonCode`，`reasonCode=FORCE_MAJEURE_EVENT` 須同時帶 `manualReviewRequired=true` 與 `automaticAdjustmentAllowed=false`；Group 2 規定 `resolvedAt` 存在若且唯若 `closureStatus` 為 `RESOLVED`／`CANCELLED`（同一規則亦套用於 `skippedDates[]` 項目）；`ErrorResponse` 之 `correlationId`／`retryable` 為必填；`X-Correlation-ID` header 元件宣告 `required: true`；`GET /currencies/{code}`、`GET /countries/{code}` 成功回應皆有完整 `required[]`，`GET /countries/{code}` 第十三輪起另增 4 個必填治理欄位（`effectiveFrom`、`calendarVersion`、`lastApprovedAt`、`sourceAuthority`）；`weekendDays`（第十三輪起）宣告 `minItems: 1`／`maxItems: 3`／`uniqueItems: true`，空陣列、重複日、七天全選皆為 schema 不合法；`code` 欄位凡屬明確單一用途者（`GET /currencies/{code}` 與 `GET /countries/{code}` 之路徑參數與回應 `code`，以及 `GET /countries/{code}` 之 `defaultCountryCalendarCode`）第十三輪起皆改參照新增之 `CurrencyCode`（`^[A-Z]{3}$`）／`CountryCode`（`^[A-Z]{2}$`）共用元件，任意字串／小寫／長度錯誤皆為 schema 不合法；`CalendarReference.code`（第十五輪起）、`CalendarVersionRef.code`／`CalendarAssessment.code`（第十六輪起）皆以 `oneOf` 依同一物件內的 `calendarType` 分支強制格式——COUNTRY／FINANCIAL_CENTER／CURRENCY_CLEARING 三者（第十六輪起合併為同一分支）共用較寬鬆的 `CalendarCode`（`^[A-Z0-9._-]+$`，2–50 碼，與 `defaultCountryCalendarCode` 一致，不假設等於兩位國碼），INSTITUTION 分支則沿用 `BicCode`；`CalendarAssessment` 此規則以獨立的第三組 `allOf` 成員新增，不影響既有兩組 `oneOf`（詳見 3.61、3.62 節）；所有 `format: date`／`format: date-time` 欄位（`sourceDate`、`startDate`、`adjustedDate`、`resultDate`、`requiredDate`、`calculationWindowStartDate`／`EndDate`、`resolvedAt`、`asOfDateTime`、`lastApprovedAt` 等）皆由 `validate_semantics.py` 之 `FormatChecker()` 實際檢查行事曆有效性與 RFC 3339 格式，而非僅為文件宣告；三個行事曆查詢端點與 `GET /currencies/{code}`、`GET /countries/{code}` 之 404 回應，以及 `GET .../is-business-day` 之 422（第十三輪起）與 `GET .../holidays` 新增之 400（第十三輪新增），各自以 `allOf` + `properties.errorCode.enum` 疊加在共用 `ErrorResponse` schema 之上，schema-narrow 至該端點專屬的 `errorCode`，非僅 description 文字宣稱哪個端點該用哪個碼。

**明確標示為服務端／Gateway 強制、非 schema 強制之規則（OpenAPI 3.0.3 之 Draft-4 相容子集無法宣告式表達）：** `ANY_ELIGIBLE_OPEN` 要求 `calendars[]` 至少含一組完整 `pathGroup`（需要 `contains`，draft-06+），且同一 `pathGroup` 內不得重複出現同一行事曆（第十三輪補充說明，同樣需要陣列層級的存在性／唯一性檢查）；`calendarType=INSTITUTION` 之額外 scope 檢查（`security:` 無法依 request body 內容條件化）；陣列中任何一筆 `closureStatus=ACTIVE`（或省略）之 `FORCE_MAJEURE_EVENT` 即整體回應必須是錯誤（同樣需要 `contains`）；`calculationWindowStartDate ≤ calculationWindowEndDate`（需要比較同一物件內兩個欄位的值）；`resolvedAt` 不得晚於實際計算／查詢當下時間（需要與真實時鐘比較）；`GET .../holidays` 之 `to` 減 `from` 不得超過 366 天（第十三輪新增，需要比較兩個查詢參數的實際值，超過者由服務端回傳新增之 `400 INVALID_DATE_RANGE`，僅該回應之形狀為 schema 契約）；`CalendarCodePath`（第十三輪明確標註，第十六輪再次確認：因 `calendarType` 與 `code` 是 `GET /calendars/{calendarType}/{code}/...` 三個端點各自獨立的 Parameter Object，而非同一個 schema 物件的兩個 property，`oneOf`／`if`/`then` 皆只能約束單一 schema 物件內部的欄位，無法跨兩個獨立 Parameter Object 生效，此限制與 OAS／JSON Schema 版本無關，即使升級至 3.1 仍無法宣告式表達，故維持服務端驗證，詳見 3.56 節）；任何 HTTP 回應是否**實際**帶有 `X-Correlation-ID` header（schema 只能宣告，無法驗證執行期行為）。

**Fail-closed 政策：** 任一實際評估過的日期（含 `sourceDate`、`adjustedDate`／`resultDate`、`skippedDates[]`，以及 `MODIFIED_*`／`NEAREST` 試探但未採用之中間日期）帶有 `reasonCode=FORCE_MAJEURE_EVENT` 且 `closureStatus=ACTIVE`（或省略）者，`/business-days/adjust`、`/business-days/add` 回傳 `422 MANUAL_REVIEW_REQUIRED`，不得回傳 `200` 與已算出之日期。

**`calculationWindowStartDate`／`calculationWindowEndDate` 目前定義：** 本次計算實際評估過之所有日期（含中間跳過與試探但未採用者）之最小／最大值，供 Trade Finance 以 `[calculationWindowStartDate, calculationWindowEndDate]` 與行事曆異動日期範圍比對重疊，判斷 Impact Report 候選交易。

**錯誤碼（21 個，`errorCode` 恆定對應固定 HTTP 狀態；以下狀態碼與適用端點已用程式逐一比對全部 7 個端點之 `responses` 區塊描述確認，非憑印象列出——第十一輪曾誤稱「三個行事曆查詢端點另有各自的 422」，第十二輪已核實並修正）：** `INVALID_DATE_FORMAT`、`INVALID_DATE_RANGE`（400，第十三輪新增，僅 `GET .../holidays`，schema 已 narrow）、`INVALID_CALENDAR_REFERENCE`、`INVALID_COMBINATION_RULE`、`INVALID_DATE_PURPOSE_COMBINATION`、`MUTUALLY_EXCLUSIVE_CALENDAR_VERSION_INPUTS`（400，兩個計算端點）；`AUTHENTICATION_REQUIRED`（401，全部 7 個端點）；`INSUFFICIENT_CALENDAR_SCOPE`（403，兩個計算端點與三個行事曆查詢端點，`GET /currencies`、`GET /countries` 無此狀態碼）；`CALENDAR_NOT_FOUND`（404，僅三個行事曆查詢端點專用，schema 已 narrow）；`CURRENCY_NOT_FOUND`（404，僅 `GET /currencies/{code}`，第十二輪新增，schema 已 narrow）；`COUNTRY_NOT_FOUND`（404，僅 `GET /countries/{code}`，第十二輪新增，schema 已 narrow）；`CALENDAR_NOT_CONFIGURED`、`CALENDAR_VERSION_NOT_AVAILABLE`、`CALENDAR_VERSION_NOT_APPROVED`、`INCOMPLETE_PAYMENT_PATH_GROUP`、`INVALID_PAYMENT_PATH_GROUP`、`MANUAL_REVIEW_REQUIRED`（皆為 422，僅兩個計算端點）；`CALENDAR_YEAR_NOT_AVAILABLE`（422，兩個計算端點，以及 `GET .../is-business-day` 這一個行事曆查詢端點——語意為「行事曆存在但資料未涵蓋所查詢日期」，第十三輪起 `GET .../is-business-day` 之 422 已 schema-narrow 至此碼專用；`GET .../holidays` 與 `GET .../completeness` 目前**未定義** 422，見 3.48 節與第五節）；`CALENDAR_CONFLICT`（409，兩個計算端點，臨時休市與既有行事曆資料衝突）；`CALENDAR_DATA_STALE`、`CALENDAR_SERVICE_TIMEOUT`（503，兩個計算端點）。

**驗證與相依套件現況：** `standing-calendar-service.oas.yaml` v2.10.0，7 paths／19 schemas／34 responses／122 個 `$ref` 全數可解析（已用程式逐層走訪 spec 物件計數，而非文字比對 `$ref` 字串出現次數——本文件與程式註解中偶爾以「$ref」作英文詞組使用、或在說明文字中引用示範 YAML 片段，純文字搜尋會有雜訊，目前純文字搜尋為 128）；`validate_semantics.py` 136 項正／反向案例（56 正向、80 反向），已用公開 `registry=` API（非 `RefResolver`／`_resolver=`）解析 `$ref`，啟動時 fail-fast 檢查 `date`／`date-time` format checker 是否可用；`requirements-dev.txt` 宣告 `jsonschema[format-nongpl]>=4.18,<5`、`referencing>=0.28.4`，兩者下限已於全新 virtual environment（`jsonschema==4.18.0`、`referencing==0.28.4`）與目前核准版本各自完整執行過一次，136/136 通過、無 `DeprecationWarning`。UAT 矩陣 UAT-01～UAT-83（第十三輪新增 UAT-68～UAT-78、第十四輪新增 UAT-79～UAT-80、第十五輪新增 UAT-81、第十六輪新增 UAT-82～UAT-83，見第六節）。

## 一、架構可行性與服務邊界

**Trade Finance 端保留：** 依 Tenor Basis（AFTER_SIGHT、AFTER_BL_DATE、AFTER_ACCEPTANCE 等）與 UCP 600 Article 3 之 from/after 起算規則，算出 `sourceDate`（原始候選到期日）。此步驟需要 LC／Bill 本身的業務知識，Standing 不涉入。

**Standing 端接手：** 取得 `sourceDate` 後，依交易指定的行事曆判斷是否為非營業日，依 Business Day Convention 順延或提前，並處理多本行事曆合併規則。

**核心原則（寫入 OAS 服務層級說明，作為硬性規則）：**

> Standing 計算的是 calendar-adjusted date，不是 Trade Finance contractual maturity date；交易義務的成立、變更及到期判定，仍由 Trade Finance 負責。

Standing 明確**不可**：建立或修改 Obligation、修改 Contractual Maturity Date、更新 Balance、建立或修改 Settlement、判定正式 Overdue。`/business-days/adjust` 的每一次回應都固定回傳 `contractualDateChanged: false`，讓呼叫端與稽核人員不需要自行推論這件事。

## 二、Standing 需要新增的資料

現有「Currency、Country、Holiday/Weekend by Country」已是合併假日與週末的非營業日清單，這部分不是缺口。需要新增的是：

| 項目 | 說明 |
| --- | --- |
| 行事曆類型分層 | COUNTRY（國家公眾假日）、CURRENCY_CLEARING（幣別清算系統，如 USD_FEDWIRE、EUR_TARGET2，不必然等於發行國假日）、INSTITUTION（特定銀行／分行，需 BIC 識別）、FINANCIAL_CENTER（次國家層級）四種類型，各自維護自己的 Holiday+Weekend 清單。 |
| 行事曆版本與生效期間 | 每筆行事曆資料需有版本號、生效區間、來源／公告依據；支援歷史重算與「未來年度尚未載入」之明確狀態偵測。 |
| 資料完整度前瞻範圍 | 每個行事曆追蹤「已確認資料涵蓋至哪一年」。 |
| 臨時／緊急休市 | 與常態年度清單分開追蹤，需獨立稽核軌跡。 |
| 截止時間與時區 | 依金融中心／幣別維護 Cut-off Time 與 Time Zone。 |
| 機構識別碼 | INSTITUTION 層級所需之 BIC；另需標準 ISO 4217、ISO 3166 代碼。 |

刻意排除：日算基礎（Actual/365、30/360）——屬利息／費用計算需求，非到期日計算範疇。

## 三、OAS 設計（v2.10.0）

### 3.1 `POST /business-days/adjust` — 到期日順延計算

**請求欄位（`AdjustBusinessDayRequest`）：**

| 欄位 | 型態 | 必填 | 說明 |
| --- | --- | --- | --- |
| `sourceDate` | date | 是 | 待調整之來源日期 |
| `sourceDateType` | enum | 是 | `CONTRACTUAL_MATURITY_DATE`／`EXAMINATION_PERIOD_START`／`OTHER`，僅供稽核記錄 |
| `calculationPurpose` | enum | 是 | `OPERATIONAL_PAYMENT_DATE`／`EXAMINATION_DEADLINE`／`OTHER`；當 `sourceDateType=CONTRACTUAL_MATURITY_DATE` 時必須為 `OPERATIONAL_PAYMENT_DATE` |
| `currency` | string | 否 | ISO 4217，僅供上下文 |
| `calendars` | array | 是 | 每筆含 `calendarType`、`code`、`role`（**v2.1.0 起 schema 層級必填**，見 3.12 節）、`required`（布林，預設 true）、`pathGroup`（選填，見下） |
| `combinationRule` | enum | 是 | `ALL_REQUIRED_OPEN`／`ANY_ELIGIBLE_OPEN`（見 3.2 節語意說明） |
| `convention` | enum | 是 | `FOLLOWING`／`PRECEDING`／`MODIFIED_FOLLOWING`／`MODIFIED_PRECEDING`／`NEAREST` |
| `calendarSnapshotId` | string | 否 | 釘選特定已核准多行事曆快照；與 `asOfDateTime` 互斥 |
| `asOfDateTime` | date-time | 否 | 以指定時間點（含時區）已核准之行事曆狀態計算；與 `calendarSnapshotId` 互斥 |

**回應欄位（`AdjustBusinessDayResponse`）：** `calculationId`、回顯之 `sourceDate`／`sourceDateType`／`calculationPurpose`、`adjustedDate`、`wasAdjusted`、`adjustmentDays`、`contractualDateChanged`（**v2.1.0 起 `enum: [false]`**，見 3.12 節）、`combinationRuleApplied`、`conventionApplied`、`calendarSnapshotId`、**`calendarVersions[]`**（每本行事曆各自版本，取代單一 `calendarVersion` 字串）、**`calendarAssessments[]`**（sourceDate 之逐行事曆判定明細，含 `businessDay`、`reasonCode`、`reasonDescription`、`calendarVersion`）、**`adjustedDateAssessments[]`**（v2.1.0 新增，adjustedDate／落地日之逐行事曆判定明細，見 3.15 節）、`skippedDates[]`、`warnings[]`。**v2.1.0 起以上全部欄位皆列入 schema 之 `required[]`**（見 3.13 節）——`{}` 或缺漏任一欄位之回應，本身即為 schema 不合法。

### 3.2 合併規則的業務語意（P0-2 修正）

`UNION`／`INTERSECTION` 已改為業務語意明確的 `ALL_REQUIRED_OPEN`／`ANY_ELIGIBLE_OPEN`：

`ALL_REQUIRED_OPEN`：所有標記 `required=true` 的行事曆（以及每個 `pathGroup` 內部）都須開市，日期才視為可行——單一必經路徑（如單一付款銀行＋幣別清算）應使用此規則，為預設安全選項。

`ANY_ELIGIBLE_OPEN`：除了未分組、`required=true` 的行事曆仍須全數開市外，只要存在至少一組**完整**的 `pathGroup`（該組內所有行事曆皆開市）即視為可行。刻意不允許「任一銀行開市即成立」——`pathGroup` 機制確保成立的是一條完整、經產品政策核准之替代付款路徑，而非單一機構開市的巧合。

### 3.3 逐行事曆判定明細與多版本快照（P0-3、P0-4 修正）

回應不再只回傳單一合併後日期，而是同時回傳 `calendarAssessments[]`（例如：付款銀行 `businessDay=true`，USD 清算 `businessDay=false, reasonCode=PUBLIC_HOLIDAY`），使 Trade Finance 端能重建「付款地正常營業、僅幣別清算休市」這類法律與作業層面的區分。

版本追溯由單一 `calendarVersion` 字串，改為 `calendarSnapshotId`（多行事曆於某核准時點的組合快照，恆回傳）＋ `calendarVersions[]`（每本行事曆各自版本）。歷史重算可用 `calendarSnapshotId` 精確重現；若採時間點方式，改用 `asOfDateTime`（含時區）取代僅有日期的 `asOfDate`，避免同一天不同時段核准狀態的歧義。兩者互斥，皆為選填，省略則採用最新已核准快照。

### 3.4 Fail-closed 政策（P0-6 修正）

以下情境一律拒絕（非 2xx），不得以 `warnings` 放行後仍輸出日期：必要行事曆未設定（422 `CALENDAR_NOT_CONFIGURED`）；計算範圍跨入尚未載入之年度（422 `CALENDAR_YEAR_NOT_AVAILABLE`）；指定之快照／版本不存在（422 `CALENDAR_VERSION_NOT_AVAILABLE`）或未核准（422 `CALENDAR_VERSION_NOT_APPROVED`）；臨時休市與基礎行事曆資料衝突（409 `CALENDAR_CONFLICT`）；資料逾銀行政策之過期門檻（503 `CALENDAR_DATA_STALE`）。`warnings` 僅保留給不影響本次計算結果、單純提醒性質的觀察（如資料即將接近過期門檻但尚未逾期）。

### 3.5 合約日期保護（P0-5 修正）

`sourceDateType`／`calculationPurpose` 取代原先單一的 `adjustmentScope` 標記，並在服務層級文件中明列 Standing 不可執行之動作清單（見第一節）。回應固定回傳 `contractualDateChanged: false`，作為額外的顯式防呆——即使呼叫端邏輯有誤，回應本身也清楚宣告本次計算未變更任何合約日期。

### 3.6 `POST /business-days/add` 起算規則（P1-2 修正）

新增 `includeStartDate`（布林，預設 false：起算日若已是營業日，計數從次一營業日開始）與 `nonBusinessStartDateConvention`（列舉，預設 `FOLLOWING`：起算日若為非營業日，先依此規則調整後再開始計數）。`businessDays=0` 回傳依 `nonBusinessStartDateConvention` 調整後之起算日本身；負數天數表示往回計算。OAS 說明中特別註明：UCP 600 Art.14(b) 之銀行營業日，須使用負責審單之相關銀行行事曆，不得以 USD 清算行事曆或一般國家假日行事曆替代。

### 3.7 Business Day Convention 邊界情況（P1-3 修正）

已於 OAS 之 `BusinessDayConvention` schema description 中明列：`MODIFIED_FOLLOWING`／`MODIFIED_PRECEDING` 在回退方向仍找不到本月內可行日期時，回傳 409 `CALENDAR_CONFLICT` 而非默默跨月——此邊界情況須由政策例外處理，不設隱性預設；`NEAREST` 在前後距離相同時，固定 tie-break 為 `PRECEDING`（需要相反結果的呼叫端應直接指定 `PRECEDING`／`FOLLOWING`，不應仰賴 `NEAREST` 的預設行為）。是否可使用特定 Convention（例如 `PRECEDING` 是否會被視為變相縮短 Tenor）屬 Trade Finance 產品政策決定，非本服務判斷範圍。

### 3.8 HTTP 狀態碼與錯誤格式（P1-4 修正）

| 情境 | HTTP | 錯誤碼 |
| --- | ---: | --- |
| 日期格式錯誤 | 400 | `INVALID_DATE_FORMAT` |
| 行事曆參照格式錯誤 | 400 | `INVALID_CALENDAR_REFERENCE` |
| 合併規則不合法 | 400 | `INVALID_COMBINATION_RULE` |
| 行事曆未設定 | 422 | `CALENDAR_NOT_CONFIGURED` |
| 未載入所需年度 | 422 | `CALENDAR_YEAR_NOT_AVAILABLE` |
| 版本不存在 | 422 | `CALENDAR_VERSION_NOT_AVAILABLE` |
| 版本未核准 | 422 | `CALENDAR_VERSION_NOT_APPROVED` |
| 行事曆資料衝突 | 409 | `CALENDAR_CONFLICT` |
| 資料已過期 | 503 | `CALENDAR_DATA_STALE` |
| 上游服務逾時 | 503 | `CALENDAR_SERVICE_TIMEOUT` |

錯誤物件（`ErrorResponse`）新增 `calendarType`、`calendarCode`、`requiredDate`、`correlationId`、`retryable`（僅 `CALENDAR_SERVICE_TIMEOUT` 等暫時性錯誤為 true，資料性錯誤一律 false，明確告知呼叫端「可重試」或「須補資料／人工處理」）。

### 3.9 重試策略（P1-5）

本服務之計算端點為唯讀、不建立付款、不更新 Balance。遇 `ECONNRESET`／`ECONNREFUSED`／逾時，呼叫端可採最多 2 次額外重試（含 jitter 之遞增等待），總嘗試上限 3 次。**此重試策略僅適用於 Standing 之查詢／計算 API，不得沿用至 Trade Finance 自身的 `POST /settlements` 等具資金異動效果之端點**——後者仍須依既有 Baseline 第 15 節之 Idempotency Key 機制，先查原交易狀態、確認未產生資金移動後才依政策重試。

### 3.10 安全性與追蹤（P1-6）

`security` 採 OAuth2 Client Credentials（Gateway 層另加 mTLS，不在本文件建模範圍）；`INSTITUTION` 類型行事曆需額外 `standing.calendars.institution.read` scope，因機構層級休業資訊可能具商業敏感性。新增共用 Header 參數 `X-Correlation-ID`（未提供則伺服器端產生，並回寫於錯誤物件之 `correlationId`）與 `X-Consumer-System`（標示呼叫端系統名稱，供稽核與流量管控）。

### 3.11 完整 Request/Response 範例（P1-1）

已將既有 Baseline 第 7 節聖誕節案例直接寫入 OAS 之 `examples`（`sourceDate=2026-12-25`、付款銀行照常營業、USD 清算休市），並以 JSON Schema 個別驗證通過。結論正確重現：Contractual Maturity Date 維持 2026-12-25 不變，Operational Payment Date 順延至 2026-12-28，且 `calendarAssessments` 清楚顯示付款銀行 `businessDay=true`、USD 清算 `businessDay=false`。`/business-days/add` 亦附上 UCP Art.14(b) 五個銀行營業日之範例。詳見 YAML 檔內 `examples` 區塊。

### 3.12 P0-1：`contractualDateChanged` 改為 `enum: [false]`

v2.0.0 僅以 `description: Always false` 說明，schema 型態仍是任意 `boolean`，代表 `contractualDateChanged: true` 在 v2.0.0 底下是 schema-valid 的回應。v2.1.0 改為 `type: boolean, enum: [false]`。已用負向測試驗證：將範例回應之 `contractualDateChanged` 改為 `true` 後餵入 `Draft4Validator`，正確拋出 `True is not one of [False]`。

### 3.13 P0-2：回應 schema 補上 `required[]`

`AdjustBusinessDayResponse`、`AddBusinessDaysResponse` 過去完全沒有 `required[]`，代表 `{}` 或任意缺漏欄位的回應都是 schema-valid。v2.1.0 為兩個 response schema 都補上完整 `required[]`（涵蓋所有「文件宣稱恆會回傳」的欄位）。已用負向測試驗證：`{}` 分別拋出 `required property` 錯誤——**此數字會隨後續版本新增必填欄位而變動，第五輪審閱抓到這裡曾經過時（文件當時仍寫 16／7，但因中間輪次新增 `adjustedDateAssessments`、`calculationWindowStartDate`、`calculationWindowEndDate` 等欄位，實際已增加）；v2.4.0 時點以腳本實際執行結果為準，分別是 18 筆與 9 筆，往後如再新增必填欄位，數字仍會再變，請以 `python validate_semantics.py` 的即時輸出為準，不要以本文件寫死的數字為準**；刻意移除 `calendarVersions` 單一欄位亦正確被拒絕。`CalendarVersionRef`（`calendarType`／`code`／`version`）與 `CalendarAssessment`（`calendarType`／`code`／`date`／`businessDay`／`calendarVersion`，`businessDay=false` 時另以 `oneOf` 強制要求 `reasonCode`）兩個巢狀 schema 也一併補上 `required[]`（對應 P1-1）。

### 3.14 P0-3：`sourceDateType`／`calculationPurpose` 合法組合以 `oneOf` 強制

v2.0.0 僅在 description 說明「當 `sourceDateType=CONTRACTUAL_MATURITY_DATE` 時 `calculationPurpose` 必須為 `OPERATIONAL_PAYMENT_DATE`」，schema 上兩個欄位其實各自獨立列舉，任意組合（例如 `CONTRACTUAL_MATURITY_DATE` + `EXAMINATION_DEADLINE`）都合法。v2.1.0 在 `AdjustBusinessDayRequest` 加上 `oneOf`，明列三組唯一合法組合：`CONTRACTUAL_MATURITY_DATE`+`OPERATIONAL_PAYMENT_DATE`、`EXAMINATION_PERIOD_START`+`EXAMINATION_DEADLINE`、`OTHER`+`OTHER`；任何其他組合皆 schema-invalid，對應新錯誤碼 `INVALID_DATE_PURPOSE_COMBINATION`（400）。已用負向測試驗證非法組合被拒絕、三組合法組合分別通過。

### 3.15 P0-4：`calendarSnapshotId`／`asOfDateTime` 以 `not` 強制互斥

v2.0.0 僅在兩個欄位的 description 各自寫「與另一欄位互斥」，schema 上並無限制，兩者可同時提供。v2.1.0 在 `AdjustBusinessDayRequest`、`AddBusinessDaysRequest` 都加上 `not: {required: [calendarSnapshotId, asOfDateTime]}`，同時提供兩者即 schema-invalid，對應新錯誤碼 `MUTUALLY_EXCLUSIVE_CALENDAR_VERSION_INPUTS`（400）。已用負向測試驗證兩端點皆正確拒絕「同時提供」的請求，且「僅提供其中一個」仍合法。

另外新增 `adjustedDateAssessments[]`（回應欄位，見 3.13 節）：針對 `adjustedDate`（實際落地日）逐行事曆判定，讓呼叫端能確認落地日本身確實對所有行事曆皆為營業日，而不只是「停止順延」；`wasAdjusted=false` 時內容與 `calendarAssessments` 相同。

### 3.16 P0-5：`ANY_ELIGIBLE_OPEN` 須有完整 `pathGroup`——服務端強制，非 schema 強制（誠實揭露的技術限制）

這條規則本質上是「陣列型態欄位（`calendars[]`）內至少一筆項目具有某屬性（`pathGroup`）」的存在性約束，需要 JSON Schema `contains`（draft-06 以後才有）才能宣告式表達；OpenAPI 3.0.3 的 Schema Object 明確是「JSON Schema Draft-4 相容子集」，並不支援 `contains`，即使勉強寫入文件，`openapi-spec-validator`／一般 OAS 3.0 工具鏈也不會承認它是合法 Schema Object 關鍵字，`Draft4Validator` 更會直接忽略、不產生任何驗證效果——等於只是自欺欺人的假約束。因此 v2.1.0 誠實地將此規則標示為**服務端強制**：`combinationRule=ANY_ELIGIBLE_OPEN` 但 `calendars[]` 中無任一筆帶 `pathGroup` 者，服務應拒絕並回傳新錯誤碼 `INCOMPLETE_PAYMENT_PATH_GROUP`（422）；`pathGroup` 組合不構成產品政策核准之替代路徑者，回傳 `INVALID_PAYMENT_PATH_GROUP`（422）。此限制與因應方式已寫入 `CombinationRule` 之 schema description，並在 `/business-days/adjust`、`/business-days/add` 兩端點新增對應 422 說明。**後續建議：** 若團隊未來願意將本服務升級至 OpenAPI 3.1（完整對齊 JSON Schema 2020-12），`contains` 即可真正宣告式強制此規則（見第七節）。

### 3.17 P0-6：`INSTITUTION` 行事曆之額外 scope——Gateway 強制，非 `security:` 宣告強制

OpenAPI 的 `security:` 區塊只能宣告「呼叫此操作需要哪些 scope」，無法表達「視 request body 內容而定，有條件地需要額外 scope」這種規則，因此無法用純 OAS 語法把 `standing.calendars.institution.read` 與「`calendars[]` 含 `calendarType=INSTITUTION`」綁定。v2.1.0 的因應方式：(1) 在 `oauth2` securityScheme description 中以「MANDATORY GATEWAY/MIDDLEWARE RULE」段落明確、可稽核地寫下這條規則的精確定義與強制點（Gateway／應用層必須在進入計算邏輯之前完成檢查）；(2) 在 `/business-days/adjust`、`/business-days/add` 及三個 Calendars GET 端點都新增 `401`（缺 token／token 無效）與 `403`（scope 不足，`INSUFFICIENT_CALENDAR_SCOPE`）回應定義。這使合約至少精確描述了失敗模式（哪個錯誤碼、哪個 HTTP 狀態），即使強制執行的程式碼落在 Gateway／服務層而非 OpenAPI 文件本身。

### 3.18 P1-8：`ReasonCode` 細分，新增人工審查旗標

原本單一的 `AD_HOC_CLOSURE` 無法區分「這家銀行剛好休市」與「整個清算系統／支付網路出問題」，兩者對呼叫端的後續處理（是否需要升級、是否可自動排他行事曆）意義完全不同。v2.1.0 拆分為 `AD_HOC_BANK_CLOSURE`、`CLEARING_SYSTEM_CLOSURE`、`PAYMENT_NETWORK_OUTAGE`、`FORCE_MAJEURE_EVENT` 四種（`PUBLIC_HOLIDAY`／`WEEKEND` 不變）。`CalendarAssessment` 新增 `manualReviewRequired`（`FORCE_MAJEURE_EVENT` 等非常規休市時建議設為 true，提示人工確認後再依此落地日執行後續作業）與 `automaticAdjustmentAllowed`（產品政策是否允許此類休市直接觸發自動順延，與 `manualReviewRequired` 各自獨立）兩個旗標欄位。

### 3.19 P1-3／P1-4／P1-5／P1-6：一致性與可觀測性補強

`/business-days/add` 補上 `409 CALENDAR_CONFLICT`、`503 CALENDAR_DATA_STALE`／`CALENDAR_SERVICE_TIMEOUT`，與 `/business-days/adjust` 對齊，避免兩端點對同一錯誤碼給出不同 HTTP 狀態。`ErrorResponse` 之 `required[]` 新增 `correlationId`、`retryable`（P1-5），確保錯誤物件本身不會漏掉「可否重試」與「追蹤 ID」這兩項營運上必要的資訊。`X-Correlation-ID` 參數新增至全部五個 GET 端點（先前僅兩個 POST 端點有），並新增共用 `headers.CorrelationId` 元件，套用至所有端點之全部回應（含錯誤回應），使其真正成為請求-回應-錯誤三者間可追蹤的共同關聯欄位，而非只出現在請求端（P1-6）。`ErrorResponse.errorCode` description 中新增一段「HTTP 狀態一致性」說明：同一錯誤碼在不同端點固定對應相同 HTTP 狀態。

### 3.20 P1-7（本輪）：`includeStartDate`／`nonBusinessStartDateConvention` 具體範例

針對第二輪審閱指出「day zero」用語可能造成誤解，已在 `AddBusinessDaysRequest.includeStartDate` 與 `nonBusinessStartDateConvention` 的 description 中補上三組具體範例（起算日為營業日＋`includeStartDate=false`／`=true` 的計數差異；起算日為非營業日時二者的優先順序），取代抽象用語，見 YAML 內文。

### 3.21 P0（第三輪）：不可抗力真正 fail-closed，不再依賴不安全的預設值

第二輪修正把 `AD_HOC_CLOSURE` 拆分為四種細項並加上 `manualReviewRequired`／`automaticAdjustmentAllowed` 兩個旗標，但這兩個旗標各自預設 `false`／`true`——對 `FORCE_MAJEURE_EVENT` 這種情境而言，等於「預設不需要人工審查、預設可自動順延」，方向恰好相反。第三輪修正兩層：

**Schema 層：** `CalendarAssessment` 的 `oneOf` 由原本兩支（`businessDay=true` / `businessDay=false`）擴充為三支：`businessDay=true`；`businessDay=false` 搭配五種例行性 `reasonCode`（僅需 `reasonCode` 存在）；`businessDay=false` 搭配 `reasonCode=FORCE_MAJEURE_EVENT` 時，額外以 `enum:[true]`／`enum:[false]` **強制** `manualReviewRequired`／`automaticAdjustmentAllowed` 必須分別為 `true`／`false`——宣告 `FORCE_MAJEURE_EVENT` 卻未正確設定這兩個旗標，本身即為 schema 不合法。已用負向測試驗證：旗標缺漏、旗標值錯誤（`false`／`true`）兩種情形皆被拒絕；旗標正確（`true`／`false`）則通過。

**服務層 fail-closed：** 光有正確旗標仍不足夠——`/business-days/adjust`、`/business-days/add` 現在明確規定：只要 `sourceDate` 或 `adjustedDate`（`/add` 則為 `startDate` 或 `resultDate`）任一者的行事曆判定 `reasonCode=FORCE_MAJEURE_EVENT`，服務**不得**回傳 `200` 與已算出之日期，必須拒絕並回傳新錯誤碼 `422 MANUAL_REVIEW_REQUIRED`，將受影響之行事曆判定明細放入 `details`。也就是說：不可抗力永遠不會以一般成功回應的樣貌，直接流入自動化付款程序——這是本次審閱意見中最關鍵的一項修正，且採用審閱建議的「直接 fail-closed」而非僅退回候選日期的做法。

### 3.22 P1（第三輪）：證據陣列禁止為空（`minItems: 1`）

`calendarVersions`、`calendarAssessments`、`adjustedDateAssessments`（`AdjustBusinessDayResponse`）與 `calendarVersions`（`AddBusinessDaysResponse`）皆補上 `minItems: 1`。理由與請求端的 `calendars: {minItems: 1}` 對稱：既然每次請求至少帶入一本行事曆，成功的計算回應就不應該在證據陣列上顯示「查無任何行事曆資料」。已用負向測試驗證：四個陣列個別設為 `[]` 時皆被拒絕。

### 3.23 P1（第三輪）：`401` 回應補上專屬錯誤碼

前兩輪的 `401` 回應雖然已引用 `ErrorResponse`，但 `errorCode` 列舉值中沒有任何一個適合「缺少或無效的存取權杖」這個情境（`INSUFFICIENT_CALENDAR_SCOPE` 語意上專指「權杖有效但 scope 不足」，屬於 `403`）。新增 `AUTHENTICATION_REQUIRED`，所有端點的 `401` 回應說明統一改為「Missing or invalid access token (errorCode AUTHENTICATION_REQUIRED)」，使 API Gateway 產生 `401` 時，一定找得到 schema 合法的 `errorCode`。

### 3.24 P1（第三輪）：`X-Correlation-ID` 補齊至全部 30 個回應

第二輪只把回應標頭加在各端點的 `200` 回應（7 個），文件卻宣稱「套用至所有端點的全部回應」，兩者不一致。第三輪已系統性走訪全部 7 個端點、30 個回應物件，為原本缺漏的 23 個非 `200` 回應（`400`／`401`／`403`／`404`／`409`／`422`／`503`）逐一補上：

```yaml
headers:
  X-Correlation-ID: { $ref: '#/components/headers/CorrelationId' }
```

補齊後以程式重新走訪整份 YAML 確認：30 個回應物件、每一個都已宣告該標頭，且全部 100 處 `$ref`（含新增的標頭參照）皆可解析、0 筆失效參照。

### 3.25 測試腳本可攜性（第三輪 P1）

`validate_semantics.py` 已改為：(1) 以 `argparse` 接受選填的 YAML 路徑參數，未提供時預設為腳本同目錄下的 `standing-calendar-service.oas.yaml`，不再寫死 `/tmp/...` 絕對路徑；(2) 檔名統一為 `validate_semantics.py`（全小寫、底線分隔）；(3) 隨附 `requirements-dev.txt`（`PyYAML`、`jsonschema`、`openapi-spec-validator`），並在腳本頂部 docstring 中註明用法與相依套件；(4) 新增第三輪 10 項正／反向測試（不可抗力旗標、空證據陣列、新錯誤碼）。腳本 docstring 明確說明：`pathGroup` 完整性、`INSTITUTION` scope、`X-Correlation-ID` 於實際 HTTP 回應中確實送出這三類「服務端／Gateway 強制」規則，超出本腳本（純 JSON Schema 驗證）能力範圍，屬於下方測試分層建議中的 Service／Gateway／Integration 測試層職責。

> **勘誤（第四輪指出）：** 本節第三輪版本曾寫「全部案例合計 34 項」，但實際腳本當時僅 31 項（14 項 `expect_valid` ＋ 17 項 `expect_invalid`）——文件數字與可執行證據不一致，第四輪審閱以獨立計數的方式抓到這個落差。第四輪的修正方式不是把文件數字下修為 31，而是依審閱建議的三個方向真正補上 3 項測試（見 3.29 節），讓腳本案例數確實達到 34，與文件描述一致。這個處理原則本身也呼應前四輪審閱一貫強調的重點：文件的量化敘述必須是可驗證、可重現的事實，而不是約略描述。

### 3.26 P1（第四輪）：不可抗力 fail-closed 範圍擴大至整個計算區間

前一輪的 `MANUAL_REVIEW_REQUIRED` fail-closed 規則只檢查 `sourceDate` 與 `adjustedDate`（或 `/add` 的 `startDate`／`resultDate`）兩端，但這中間被跳過（`skippedDates`）的日期同樣可能命中 `FORCE_MAJEURE_EVENT`——例如 `sourceDate=2026-12-24`（一般假日）、`2026-12-25` 為不可抗力事件、`2026-12-26` 為週末、`adjustedDate=2026-12-28`，若只檢查頭尾兩端，`2026-12-25` 的不可抗力事件會被忽略。`/business-days/adjust`、`/business-days/add` 的 description 已改為明確規定：只要「本次計算實際評估到的任何日期」——`sourceDate`、`adjustedDate`（或 `startDate`／`resultDate`），以及所有原本會出現在 `skippedDates` 中的中間日期——命中 `FORCE_MAJEURE_EVENT`，即回傳 `422 MANUAL_REVIEW_REQUIRED`，不得回傳 200。對應 UAT-45。

### 3.27 P1（第四輪）：新增 `calculationWindowStartDate`／`calculationWindowEndDate`，支援更完整的 Impact Report 判斷

第三輪文件描述 Impact Report 流程為「撈出 `sourceDate` 落在新舊快照差異區間內的交易」，但這可能漏掉受影響交易：假設 Contractual Maturity Date（`sourceDate`）為 2026-12-24、原 Operational Payment Date（`adjustedDate`）為 2026-12-28，而行事曆異動發生在 2026-12-26——`sourceDate` 不在異動日期上，但實際計算路徑（`sourceDate` 到 `adjustedDate` 之間）確實涵蓋了 2026-12-26，這筆交易的計算結果理論上可能受影響，不應被排除在 Impact Report 之外。

因此 `AdjustBusinessDayResponse`、`AddBusinessDaysResponse` 兩者皆新增並列入 `required[]` 的欄位：`calculationWindowStartDate`（此處初始定義為 `min(sourceDate, adjustedDate)`，`/add` 則為 `min(startDate, resultDate)`；**此定義已於第五輪審閱指出對 `MODIFIED_*`／`NEAREST` 不成立，並於 3.31 節修正為涵蓋所有實際評估過的日期，以下僅保留作為本欄位初次引入時的歷史脈絡**）與 `calculationWindowEndDate`（恆為對應的 `max(...)`）。第四節「與既有 Trade Finance Baseline 之對應」已同步更新 Impact Report 判斷邏輯，改用「計算區間是否與行事曆異動區間重疊」而非「`sourceDate` 是否等於／落在異動日期」，見該節內容與 UAT-46（第四節內容已於 v2.5.0 同步改引 3.31 節之修正後定義）。

### 3.28 P1（第四輪）：`GET /currencies`、`GET /countries` 補上 `401`；`GET .../is-business-day` 補上 `404`

前三輪陸續為計算端點與行事曆查詢端點補上 `401`／`403`／`404`，但兩個純參考資料端點（`GET /currencies/{code}`、`GET /countries/{code}`）雖然同樣受 `security:` 全域 OAuth2 宣告約束，卻從未定義權杖缺漏或無效時的回應——實際 Gateway 行為與 OAS 文件不一致。已補上 `401`（`AUTHENTICATION_REQUIRED`，兩端點皆不涉及 `calendarType`，故不需要 `403 INSUFFICIENT_CALENDAR_SCOPE`）。另外，`GET .../is-business-day` 過去只定義 `200`／`401`／`403`／`422`，但本文件第五節的端點總覽表格從第二輪起就已描述其具備 `404`（行事曆本身未設定）——YAML 與文件不一致，第四輪已在 YAML 補上 `404`，並把它與既有的 `422`（行事曆存在但查無指定日期資料）做出明確語意區分，與 `GET .../holidays`、`GET .../completeness` 的既有語意一致。

### 3.29 P1（第四輪）：`includeStartDate` 改用「第幾個營業日」取代「day zero」框架

「day zero」的敘述方式本身邏輯不自洽：若 `includeStartDate=true` 與 `=false` 都把起算日視為 day 0，則兩種設定的計算結果理論上會相同，等於這個欄位沒有作用——但實際上它應該有作用。已改用「起算日算作第幾個營業日」的框架重新描述：`includeStartDate=false`（預設）——起算日不計入，從下一個營業日開始為第 1 個營業日；`includeStartDate=true`——若起算日本身即為營業日，則起算日本身即為第 1 個營業日。以起算日為週二、`businessDays=5` 為例：`=false` 時週三＝#1……週二（次週）＝#5，結果為次週二；`=true` 時起算日週二＝#1……週一（次週）＝#5，結果為次週一，比 `=false` 情境早一個營業日——與原本的意圖相符，只是敘述方式改為不含「day zero」的說法。對應新增 UAT-47、UAT-48、UAT-49。

### 3.30 驗證腳本補齊至 34 項（呼應 3.25 節勘誤）

依第四輪建議的三個方向，於 `validate_semantics.py` 新增 3 項測試，使總數從 31 項增至 34 項：(1) `skippedDates[]` 中出現 `FORCE_MAJEURE_EVENT`（正向案例，說明該陣列本身的 schema 允許記錄歷史性的不可抗力事件，實際 fail-closed 是由服務層依 3.26 節之規則在該日期仍屬計算區間內時觸發，而非由這個陣列的 schema 單獨把關）；(2) `adjustedDateAssessments[]` 項目缺少必填欄位 `calendarVersion`（負向案例，確保 `calendarAssessments`／`adjustedDateAssessments` 共用同一個 `CalendarAssessment` schema 不會被繞過）；(3) 完整填寫全部選填欄位的 `401` `ErrorResponse`（正向案例，確保 schema 不會因為選填欄位太多而意外變得過嚴）。已重新執行 `python validate_semantics.py`，34 項全數通過。

### 3.31 P1（第五輪）：`calculationWindow` 修正為涵蓋所有實際評估過的日期

第四輪新增的 `calculationWindowStartDate`／`calculationWindowEndDate` 原定義為恆等於 `min`／`max(sourceDate, adjustedDate)`。第五輪審閱以具體反例指出這對 `FOLLOWING`／`PRECEDING` 成立，但對 `MODIFIED_FOLLOWING`／`MODIFIED_PRECEDING`／`NEAREST` 不成立：例如 `sourceDate=2026-01-31` 搭配 `MODIFIED_FOLLOWING`，系統可能先往後試探 `2026-02-01`、`2026-02-02`，發現跨月後才改往回退至 `2026-01-30` 作為 `adjustedDate`——此時若 `calculationWindow` 只保存 `[2026-01-30, 2026-01-31]`，會漏掉曾經實際評估過的 `2026-02-01`、`2026-02-02`；若這兩天之後才有行事曆異動，Impact Report 仍會漏判。

修正後定義（YAML 已同步更新兩個回應 schema 的欄位說明）：`calculationWindowStartDate`／`calculationWindowEndDate` 恆為「本次計算實際評估過的所有日期」（`sourceDate`、`adjustedDate`，以及所有曾被試探但最終未採用的中間日期）之最小／最大值，而不僅是兩個端點日期的 min／max。對 `FOLLOWING`／`PRECEDING` 而言，這與原定義結果相同（因為這兩種 convention 只朝單一方向滾動，沒有「試探後放棄」的中間日期）；差異只出現在 `MODIFIED_*`／`NEAREST` 這幾種會雙向或跨界試探的 convention。對應新增 UAT-50、UAT-51。

### 3.32 P1（第五輪）：`CALENDAR_NOT_CONFIGURED` 拆分為兩個錯誤碼，修正狀態碼矛盾

第四輪為 `GET .../is-business-day` 補上 `404` 時，誤把該 404 的 `errorCode` 也寫成 `CALENDAR_NOT_CONFIGURED`——但這個代碼在 `ErrorResponse.errorCode` 的說明中已明確宣告「永遠對應 422」，於是同一份文件內部出現矛盾：GET 端點的 404 用它、POST 端點的 422 也用它。第五輪審閱採用其建議的**方案 B**（拆分為兩個錯誤碼，而非讓同一碼允許依操作類型對應不同狀態），理由是語意更清楚且不需要修改「同碼同狀態」這條既有原則：

- `CALENDAR_NOT_FOUND`（404，恆定）——`GET /calendars/{calendarType}/{code}/is-business-day`、`.../holidays`、`.../completeness` 三個查詢端點專用，語意為「指定的 calendarType／code 這個資源本身不存在」。
- `CALENDAR_NOT_CONFIGURED`（422，恆定，維持原意不變）——`/business-days/adjust`、`/business-days/add` 兩個計算端點專用，語意為「本次計算需要的某本行事曆尚未設定」。

兩者不再共用同一個碼，`ErrorResponse.errorCode` 的說明已同步更新，並已用負向測試驗證 `CALENDAR_NOT_FOUND` 是獨立、schema 合法的錯誤碼。對應新增 UAT-57、UAT-58。

### 3.33 P1（第五輪）：`ClosureStatus`——區分「仍有效」與「已解除」的不可抗力紀錄

第四輪新增的測試案例曾示範 `skippedDates[]` 可以記錄「已解除的歷史不可抗力事件」，但當時只靠 `reasonDescription` 的自然語言文字（例如「Resolved prior to this calculation」）表達「已解除」，沒有任何結構化欄位——這與第四輪自己在 3.26 節訂下的規則（任何命中 `FORCE_MAJEURE_EVENT` 的日期都必須 fail-closed）形成語意落差：如果無法用程式判斷某筆記錄是否「仍有效」，就無法可靠地實作 3.26 節的規則。

新增 `ClosureStatus` 列舉（`ACTIVE`／`RESOLVED`／`CANCELLED`），加到 `skippedDates[].closureStatus`（連同選填的 `resolvedAt`）與 `CalendarAssessment.closureStatus`／`resolvedAt`。省略此欄位時等同 `ACTIVE`。**（第七輪 P2 提醒：本節所述之「`resolvedAt` 為選填」僅反映 v2.4.0 引入當下的狀態；自 v2.5.0 起，`resolvedAt` 已依 3.37 節改為與 `closureStatus` 條件連動——`closureStatus=RESOLVED`／`CANCELLED` 時必填，省略或 `ACTIVE` 時不得出現，請以 3.37 節為準。）**3.26／3.16 節所述之 fail-closed 規則已明確修正為：只有 `reasonCode=FORCE_MAJEURE_EVENT` **且** `closureStatus=ACTIVE`（或省略）的日期才會觸發 `422 MANUAL_REVIEW_REQUIRED`；`RESOLVED`／`CANCELLED` 的紀錄可以合法出現在 `200` 回應中作為稽核紀錄。與 `pathGroup`／`INSTITUTION` scope 相同，這裡「一旦陣列中有任何一筆 ACTIVE 的不可抗力，整個回應就必須是錯誤」這個跨欄位規則同樣超出 OpenAPI 3.0.3 schema 的宣告式表達能力（需要 `contains`），因此明確標示為服務端強制，並在測試腳本中把「這個陣列形狀本身合法」與「服務實際上會擋下 ACTIVE 案例」兩件事分開說明，避免混淆。`CalendarAssessment` 既有的 `oneOf` 強制（`FORCE_MAJEURE_EVENT` 必須搭配 `manualReviewRequired=true`／`automaticAdjustmentAllowed=false`）維持不變、不受 `closureStatus` 影響——即使已解除，仍代表該日期在當時確實非營業日。對應新增 UAT-52、UAT-53。

### 3.34 P1（第五輪）：`X-Correlation-ID` header 元件補上 `required: true`

`components.headers.CorrelationId` 先前只有 `schema: {type: string}`，沒有宣告 OpenAPI Header Object 支援的 `required` 屬性。已補上 `required: true`，讓「本標頭必定出現」這句話從純文字說明，變成程式碼產生器／API linter 可以檢查的宣告式屬性。仍須說明：這只約束「規格文件宣告」層級，真正的「執行期每個 HTTP 回應是否確實帶有這個 header」仍屬於 Integration Test 的職責（對應 UAT-54），JSON Schema 驗證工具本身不會發送真實 HTTP 請求。

### 3.35 P1（第五輪）：`GET /currencies`、`GET /countries` 成功回應補上 `required[]`

文件先前宣稱「五個查詢端點均已補上 `required[]`」，但實際只有三個行事曆查詢端點做了，`GET /currencies/{code}`、`GET /countries/{code}` 的成功回應仍是任意屬性皆可省略的 schema。已補上：`GET /currencies/{code}` 要求 `code`／`name`／`minorUnitDecimals`（`defaultClearingCalendarCode` 因並非每個幣別都有清算行事曆，維持選填）；`GET /countries/{code}` 要求 `code`／`name`／`defaultCountryCalendarCode`／`weekendDays`。已用負向測試驗證兩者的 `{}` 皆被拒絕，且完整範例仍合法。對應新增 UAT-55、UAT-56。

### 3.36 P1（第六輪）：`CalendarAssessment` 禁止 `businessDay=true` 與不可抗力／休市欄位並存

第六輪審閱以具體反例指出：`CalendarAssessment.businessDay=true` 這個分支雖然要求「不可帶 `reasonCode`」，但 `oneOf` 的三個分支彼此互斥判斷只看 `businessDay` 與 `reasonCode` 的組合，並未同時排除 `closureStatus`／`resolvedAt`／`manualReviewRequired=true`／`automaticAdjustmentAllowed=false` 這幾個欄位——於是下列自相矛盾的物件仍可通過 schema 驗證：

```json
{
  "calendarType": "COUNTRY", "code": "AE", "date": "2026-12-25",
  "businessDay": true,
  "reasonCode": "FORCE_MAJEURE_EVENT",
  "manualReviewRequired": true,
  "automaticAdjustmentAllowed": false
}
```

此物件同時宣稱「該日為營業日」與「該日因不可抗力休市、須人工審查」，兩者邏輯上不可能同時成立。修正方式並非直接在原本的單一 `oneOf` 內疊加條件（三個分支彼此互斥，若在同一個 `oneOf` 內同時處理 businessDay 一致性與 closureStatus 一致性，兩組規則會互相干擾、難以獨立驗證），而是將 `CalendarAssessment` 由單一 `oneOf` 改為 `allOf` 底下兩組**互相獨立**的 `oneOf`：

- **Group 1（businessDay 一致性，沿用既有三分支語意，但收緊 `businessDay=true` 分支）**：`businessDay=true` 分支改用 `not: {anyOf: [...]}` 明確禁止同時出現 `reasonCode`、`closureStatus`、`resolvedAt`、`manualReviewRequired=true`、`automaticAdjustmentAllowed=false` 任何一項；`businessDay=false` 搭配一般假日／週末／臨時休市原因的分支，以及搭配 `FORCE_MAJEURE_EVENT` 且強制 `manualReviewRequired=true`／`automaticAdjustmentAllowed=false` 的分支維持不變。
- **Group 2（closureStatus 一致性，第六輪新增，見 3.37 節）**：與 businessDay 完全獨立判斷 `resolvedAt` 與 `closureStatus` 的對應關係。

兩組 `oneOf` 以 `allOf` 並列，任何 `CalendarAssessment` 物件必須同時滿足兩組規則，彼此不互相污染判斷邏輯。已新增 5 項測試（4 項負向：`businessDay=true` 分別搭配 `reasonCode=FORCE_MAJEURE_EVENT`、`manualReviewRequired=true`、`automaticAdjustmentAllowed=false`、`closureStatus=RESOLVED`+`resolvedAt` 皆應被拒絕；1 項正向：`businessDay=true` 且明確帶入與預設值相同的 `manualReviewRequired=false`／`automaticAdjustmentAllowed=true` 仍應合法，證明修正沒有矯枉過正）。對應新增 UAT-59。

### 3.37 P2（第六輪，選用建議，非阻擋性）：`resolvedAt` 與 `closureStatus` 之強制對應

第六輪審閱另外建議（明確標註「此項可列為 P2，不阻擋目前 baseline」）：`resolvedAt` 應在 `closureStatus=RESOLVED`／`CANCELLED` 時為必填，並在 `closureStatus=ACTIVE`（或省略）時禁止出現——3.33 節新增 `ClosureStatus` 列舉時，`resolvedAt` 僅為選填欄位，未強制其與 `closureStatus` 的對應關係，理論上可能出現「`closureStatus=RESOLVED` 但沒有 `resolvedAt`」或「`closureStatus=ACTIVE` 卻帶有 `resolvedAt`」這類不完整或矛盾的稽核紀錄。

雖標示為非阻擋，本輪仍一併落實：在 `CalendarAssessment`（3.36 節 Group 2）與 `skippedDates[]`（`AdjustBusinessDayResponse`、`AddBusinessDaysResponse` 兩者的陣列項目 schema）皆新增一組 `oneOf`：

```yaml
oneOf:
  - anyOf:
      - not: { required: [closureStatus] }
      - properties: { closureStatus: { enum: [ACTIVE] } }
    not:
      required: [resolvedAt]
  - properties:
      closureStatus: { enum: [RESOLVED, CANCELLED] }
    required: [closureStatus, resolvedAt]
```

即「`closureStatus` 省略或為 `ACTIVE` 時不得帶 `resolvedAt`」與「`closureStatus` 為 `RESOLVED`／`CANCELLED` 時必須帶 `resolvedAt`」兩者互斥、涵蓋所有情形。已新增 5 項測試（`CalendarAssessment` 2 項負向 + 1 項正向、`skippedDates[]` 2 項負向，正向案例沿用既有的完整範例）。對應新增 UAT-60。

### 3.38 P1（第七輪）：驗證腳本補上 `format: date`／`date-time` 之實際格式檢查

第七輪審閱指出：`validate_semantics.py` 先前以 `Draft4Validator(schema_of(...), resolver=resolver)` 建構驗證器，未傳入 `format_checker`——`jsonschema` 預設不會僅因 schema 寫了 `format: date`／`date-time` 就自動檢查格式，因此 `sourceDate: "2026-02-30"` 這類行事曆上不存在的日期，先前確實會被腳本判定為合法。這是本文件測試分層表長期以來的隱性落差：Schema tests 一列宣稱涵蓋「格式驗證」，但腳本實際上從未真正執行過格式檢查。

修正時發現一個需要誠實揭露的細節：審閱建議的寫法 `format_checker=Draft4Validator.FORMAT_CHECKER` **無法達成審閱者自己舉的反例**——`Draft4Validator.FORMAT_CHECKER` 只註冊了 Draft 4 規格本身定義的格式檢查器（`date-time`、`email`、`idn-email`、`ipv4`、`ipv6`、`regex`），並不包含 `date`；而本規格中 `sourceDate`／`startDate`／`adjustedDate`／`resultDate`／`requiredDate`／`calculationWindowStartDate`／`calculationWindowEndDate` 這些欄位全部使用 `format: date`（純日期、無時間），並非 `format: date-time`。若照字面採用 `Draft4Validator.FORMAT_CHECKER`，`sourceDate: "2026-02-30"` 仍會通過驗證，等於只解決了字面上的建議、沒有解決審閱者實際指出的問題。已改用通用的 `jsonschema.FormatChecker()`（額外註冊 `date`、`time`、`uuid`），並以程式直接驗證兩者差異後才採用，腳本中已附上對照說明（見 `validate_semantics.py` 檔案開頭的 round-7 註解）。

已新增 9 項測試（7 項負向：`sourceDate=2026-02-30`、`startDate=2026-13-01`、`adjustedDate=2026-04-31`、`resultDate=2027-02-29`（2027 非閏年）、`resolvedAt` 為無效時間戳、`asOfDateTime` 為無效時間戳、`ErrorResponse.requiredDate=2026-06-31`；2 項正向：`sourceDate=2026-02-28`、`ErrorResponse.requiredDate=2026-06-30`，證明合法日期不受影響），涵蓋審閱建議之 `sourceDate`／`startDate`／`adjustedDate`／`resultDate`／`resolvedAt`／`asOfDateTime`／`requiredDate` 七個欄位。驗證腳本總案例數由 50 項增至 59 項（24 正向、35 反向），既有 50 項全數重新執行確認未受影響（開啟格式檢查前後回歸測試皆通過）。對應新增 UAT-61。

本項修正僅涉及驗證腳本與本文件，`standing-calendar-service.oas.yaml` 之 schema 本身（`format: date`／`format: date-time` 宣告）並無變動，故版本號維持 v2.5.0 不變。

### 3.39 P1（第八輪）：`format: date-time` 檢查所需相依套件未明確保證，補上 fail-fast 檢查

第八輪審閱指出一個比 3.38 節本身更根本的交付風險：`jsonschema` 的 `date-time` 格式檢查器是**選用**（optional）的——原始碼以 `with suppress(ImportError): from rfc3339_validator import validate_rfc3339` 包裹整段註冊邏輯，若 `rfc3339_validator` 套件不存在，這段程式碼會被靜默略過，`FormatChecker().checkers` 裡根本不會出現 `"date-time"` 這個 key，`resolvedAt`／`asOfDateTime`／`lastApprovedAt` 等欄位會在**沒有任何錯誤或警告**的情況下完全不受檢查而全數放行。已用程式直接確認：`format: date` 因為是用 stdlib `date.fromisoformat()` 實作、沒有這層選用相依，不會有同樣的靜默失效風險；風險僅限於 `date-time`。而先前的 `requirements-dev.txt` 只寫 `jsonschema>=4.0`，未指定 extras，無法保證乾淨環境（CI、Docker image）會裝到 `rfc3339_validator`——即使開發者本機因為其他套件間接裝到而測試看似全過，也不代表 CI 環境同樣具備。

修正兩處：(1) `requirements-dev.txt` 改為 `jsonschema[format-nongpl]>=4.0`——採 `format-nongpl` 而非 `format`，是因為兩者差異僅在於 URI 格式檢查器選用 GPL 授權的 `rfc3987`（`format`）或非 GPL 的 `rfc3986-validator`＋`rfc3987-syntax`（`format-nongpl`），本規格完全沒有使用 `format: uri`／`email`／`hostname`，兩者在功能上對本專案沒有差異，選 `format-nongpl`純粹是為銀行專案預設維持相依套件授權乾淨，仍需配合公司第三方套件政策複核；(2) `validate_semantics.py` 在建立 `FormatChecker()` 後立即檢查 `{"date", "date-time"}` 是否都存在於 `FORMAT_CHECKER.checkers`，若有缺漏立即拋出 `RuntimeError` 並指出安裝方式，而不是讓驗證器悄悄放行後 CI 顯示綠燈、實際上格式檢查形同虛設。已於乾淨環境重新安裝 `requirements-dev.txt` 並執行全部測試確認 fail-fast 檢查本身不影響正常執行路徑。

### 3.40 P2（第八輪）：補強日期與時區邊界測試

第八輪審閱建議之邊界案例已全數補上：`resultDate=2028-02-29`（合法閏年，通過）與既有 `resultDate=2027-02-29`（非閏年，第七輪已覆蓋，拒絕）成對；`startDate=2026-12-31` 跨年至 `resultDate=2027-01-01`（合法跨年，通過）；`resolvedAt`／`asOfDateTime` 分別測試 RFC 3339 `Z`（UTC）後綴（合法，通過）與缺少時區資訊之裸時間字串（不合法，拒絕，因 RFC 3339 `date-time` 規定必須有時區偏移或 `Z`）。已新增 5 項正向／負向測試，驗證腳本總案例數由 59 項增至 64 項（28 正向、36 反向）。

其餘兩項審閱建議之邊界案例——`calculationWindowStartDate` 大於 `calculationWindowEndDate`、`resolvedAt` 晚於實際計算／查詢當下時間——經確認**均超出 OpenAPI 3.0.3 schema 之宣告式表達能力**：前者需要比較同一物件內兩個欄位的值（`if`/`then` 搭配日期比較，屬 draft-07 以後語法，且即使升級也仍需自訂比較邏輯，非單純 keyword 可達成）；後者需要與「當下真實時間」比較，靜態 JSON payload 驗證器本身沒有時鐘可供比對。兩者維持明確標示為 Service／Integration tests 職責（見第七節測試分層表），不在 `validate_semantics.py` 的驗證範圍內，避免文件宣稱一件 schema 做不到的事。

### 3.41 P2（第九輪，技術債）：`RefResolver` 遷移至 `referencing.Registry`

第九輪審閱指出 `validate_semantics.py` 使用的 `jsonschema.RefResolver` 自 `jsonschema 4.18.0` 起已標示為棄用，官方建議改用 `referencing` 套件之 `Registry`／`Resolver`，並提醒 `requirements-dev.txt` 目前對 `jsonschema` 版本沒有上限，日後 CI 自動裝到移除 `RefResolver` 的未來版本時腳本可能直接失效。已選擇審閱建議中「較佳方式」——直接遷移，而非僅暫時鎖定版本上限（鎖版本只是延後同一件遷移工作，遲早仍要做）。

遷移過程中發現一個容易踩坑之處，已用程式驗證後才定案：`Draft4Validator(schema, registry=registry)` **一律**把傳入的 `schema` 本身當作解析 `#/...` 相對參照的「根資源」（`jsonschema.validators` 原始碼中 `__attrs_post_init__` 呼叫 `registry.resolver_with_root(specification.create_resource(self.schema))`）。這代表若只是把整份 OAS spec 註冊進 `Registry`、然後把單一 component（例如 `CalendarAssessment`）的子 schema 直接交給 `Draft4Validator`，該子 schema 內的 `$ref`（例如 `#/components/schemas/CalendarType`）並不會相對於整份 OAS 文件解析，而是被誤當成要在子 schema 自己內部尋找 `/components/schemas/CalendarType` 這個路徑，因而拋出 `PointerToNowhere`——這與舊版 `RefResolver.from_schema(spec)` 的行為不同，若不注意會讓遷移後的腳本悄悄壞掉。

修正方式：建立一個綁定在整份 spec 上的 `Resolver`（`Registry().with_resource(uri="", resource=Resource.from_contents(spec, ...)).resolver()`），驗證具名 component 時先用該 `Resolver.lookup("#/components/schemas/<name>")` 取出內容與正確 scope 之下游 `Resolver`，再建立 `Draft4Validator(resolved.contents, _resolver=resolved.resolver, ...)`；驗證行內（inline）schema（如 `GET /currencies` 的回應 schema）則直接把同一個基準 `Resolver` 透過 `_resolver=` 傳入。兩種情形下 `$ref` 皆正確解析回整份 spec，行為與舊版 `RefResolver.from_schema(spec)` 完全一致——已用程式逐一比對確認。

遷移後以 `python -W error::DeprecationWarning validate_semantics.py` 重新執行，確認 64 項測試全數通過且未觸發任何棄用警告，`RefResolver` 已完全從程式碼中移除（僅保留於註解中說明遷移前後差異）。

**（第十輪更新：本節所述之 `_resolver=` 做法已被 3.42 節取代，僅保留於此作為遷移過程的歷史記錄；`requirements-dev.txt` 需要新增宣告一事，第十輪審閱也指出本節原先的判斷過於樂觀，見 3.42 節說明。）**

### 3.42 P1／P2（第十輪）：改用公開 `registry=` API，並明確鎖定相依套件版本下限

第十輪審閱指出 3.41 節的修正雖然移除了已棄用的 `RefResolver`，卻引入兩項新風險：(1) 程式改用 `_resolver=` 這個底線開頭、未公開文件化的 `jsonschema` 內部參數，未來版本升級時可能直接因 `TypeError: unexpected keyword argument '_resolver'` 而壞掉；(2) `requirements-dev.txt` 仍寫 `jsonschema[format-nongpl]>=4.0`，這個下限遠早於 `registry=` 公開 API 與目前遷移方式所倚賴的 `jsonschema 4.18.0`，乾淨環境、企業內部套件源、或其他套件透過 lock file 鎖住的舊版 `jsonschema` 都可能符合 `>=4.0` 但仍缺少所需功能。3.41 節原先寫「`requirements-dev.txt` 不需要另外新增宣告」，第十輪指出這個判斷過於樂觀——沒有下限就不算「保證」，即使 `referencing` 目前確實是 `jsonschema` 的必要相依。

兩項均已修正：(1) 改用審閱建議之公開 `registry=` API，做法是把整份 spec 註冊在一個固定的合成 URI（`SPEC_URI = "urn:standing:calendar-service:oas"`，純粹作為 registry 內部 key，從不會被實際解析為網路位置）之下，驗證任何 schema 時一律建構一個**絕對 URI** 的 `{"$ref": f"{SPEC_URI}#..."}` 交給 `Draft4Validator(schema, registry=registry, ...)`，而不是把子 schema dict 直接當作 root schema 交給它。這樣可以直接繞開 3.41 節發現的根本問題——`Draft4Validator` 一律把傳入的 `schema` 當作解析**裸**（fragment-only）`#/...` 參照的根資源，但**絕對 URI** 參照不受此規則影響，會直接透過 URI 找到 registry 裡登記的完整 spec，不論被丟進去的 root schema 本身是什麼——已用程式逐一比對具名 component 與行內 schema（`GET /currencies`、`GET /countries`）兩種情形，確認結果與舊版 `RefResolver.from_schema(spec)`、以及 3.41 節的 `_resolver=` 版本完全一致；(2) `requirements-dev.txt` 之 `jsonschema[format-nongpl]` 版本下限由 `>=4.0` 提高為 `>=4.18,<5`（`4.18` 是 `registry=` 公開 API 首次出現的版本；上限 `<5` 避免未來大版本破壞性變更未經檢視就自動安裝），並新增 `referencing>=0.28.4` 為明確直接相依（已用程式確認：`jsonschema 4.18.0` 本身的套件中繼資料就宣告 `Requires-Dist: referencing>=0.28.4`，且該版本的 `referencing/jsonschema.py` 原始碼中已包含 `DRAFT4`），而不是完全依賴 `jsonschema` 的 transitive dependency。

行內 schema 的驗證方式也一併調整：`GET /currencies`、`GET /countries` 的回應 schema 不再用 Python dict 直接從 `spec` 物件中取出（取出後的 dict 已經「脫離」了它在原始文件中的位置，無法據此組出絕對 `$ref`），而是改用 JSON Pointer 字串（例如 `"/paths/~1currencies~1{code}/get/responses/200/content/application~1json/schema"`，依 RFC 6901 規則將 `/` 逸出為 `~1`），並在腳本啟動時自動比對「JSON Pointer 解析出的內容」與「直接以 dict 逐層存取取出的內容」兩者是否為同一物件，確保未來若調整 YAML 結構、忘記同步更新這兩個 Pointer 字串，腳本會在啟動時就直接失敗，而不是悄悄驗證錯誤的節點。

已在乾淨的 Python virtual environment 中（無其他專案殘留套件）以 `pip install -r requirements-dev.txt` 重新安裝、確認裝到 `jsonschema 4.26.0`／`referencing 0.37.0`／`rfc3339-validator 0.1.4`，並以 `python -W error::DeprecationWarning validate_semantics.py` 重新執行，64 項測試全數通過、無棄用警告，`_resolver=` 與 `RefResolver` 均已從程式碼中完全移除，僅存在於 3.41／3.42 節與程式註解的歷史說明中。

### 3.43 P2（第十一輪，非阻擋）：最低支援版本矩陣驗證，新增第零節總覽

第十一輪確認第十輪之兩項問題（相依套件版本下限、私有 API）皆已關閉，無新增 P0／P1，並提出兩項非阻擋性 P2 建議：(1) CI 除了目前核准版本外，應額外對 `requirements-dev.txt` 宣告的最低支援版本（`jsonschema==4.18.0`、`referencing==0.28.4`）實際跑一次；(2) 累積十輪歷程後，section 三逐輪敘事混雜「現行規則」與「歷史問題」，建議區分 Approved Clean Baseline 與 Review History／Changelog。

第一項已直接執行驗證，而非只在文件中承諾：另外建立一個全新 virtual environment，明確安裝 `jsonschema[format-nongpl]==4.18.0`＋`referencing==0.28.4`（即 `requirements-dev.txt` 宣告的精確下限，而非該下限允許範圍內的任意版本），確認裝到的正是這兩個精確版本後，於此環境重新執行 `openapi-spec-validator`（結構驗證通過，v2.5.0／15 schemas）與 `python -W error::DeprecationWarning validate_semantics.py`（64 項測試全數通過、無棄用警告）。連同先前已驗證多次的目前核准版本（`jsonschema 4.26.0`／`referencing 0.37.0`），`requirements-dev.txt` 宣告的版本範圍兩端如今都有實測佐證，而不只是宣告下限但只測過上緣版本。

第二項考量到 section 三每一小節都附有具體 JSON 反例與程式驗證佐證，重新拆分為兩份文件有搬動既有內容、引入新錯誤的風險，因此改以新增「## 零、目前生效規則總覽」取代整份重寫——該節提供不含輪次歸屬的現行規則清單（端點、schema 強制規則、服務端強制規則、錯誤碼、fail-closed 政策、`calculationWindow` 定義、驗證與相依套件現況），讓只想知道「現在規則是什麼」的讀者不需要爬梳 3.1～3.42 節的逐輪歷史即可取得完整現況；section 三與第七節的逐輪敘事、反例與分數則完整保留，作為 Review History／Changelog，兩者互不取代、互相參照。

### 3.44 P1（第十二輪）：`GET /currencies/{code}`、`GET /countries/{code}` 之 404 缺少合法對應錯誤碼

第十二輪以具體反例指出：這兩個端點的 404 回應僅 `$ref` 共用的 `ErrorResponse` schema，而 `errorCode` 列舉中並無任何值同時滿足「schema 合法」與「業務語意正確」——`CALENDAR_NOT_FOUND` 雖是唯一現有的 404 碼，卻已在第五輪（3.32 節）明確保留給三個行事曆查詢端點專用，若 `GET /currencies/{code}` 的 404 使用它，會把「幣別不存在」誤描述成「行事曆不存在」；反過來若真的新增一筆 `{"errorCode": "CURRENCY_NOT_FOUND", ...}` 回應，則會直接被舊版 enum 拒絕。這是本引擎過去十一輪一直在抓的同一類問題（description 文字與 schema 實際約束不一致）第一次出現在「連 description 想講的東西 schema 都沒有對應值可用」這麼直接的形式。

修正：`ErrorResponse.errorCode` enum 新增 `CURRENCY_NOT_FOUND`（404，僅 `GET /currencies/{code}`）與 `COUNTRY_NOT_FOUND`（404，僅 `GET /countries/{code}`）。並且不只是新增列舉值、靠 description 文字宣稱「這個端點該用這個碼」——比照本次順便一併加強的三個行事曆查詢端點 404，全部五個 404 回應改用：

```yaml
schema:
  allOf:
    - $ref: '#/components/schemas/ErrorResponse'
    - properties:
        errorCode:
          enum: [CURRENCY_NOT_FOUND]   # 各端點填入各自專屬碼
```

即在共用 `ErrorResponse` schema 之上疊加一層該回應專屬的 `enum` 限制，使得「這個 404 用了錯誤端點的碼」本身就是 schema-invalid，而不只是文件描述不符。已新增 14 項測試：`GET /currencies/{code}` 404 使用 `CURRENCY_NOT_FOUND`（合法）、`CALENDAR_NOT_FOUND`／`COUNTRY_NOT_FOUND`（皆應拒絕）；`GET /countries/{code}` 404 使用 `COUNTRY_NOT_FOUND`（合法）、`CALENDAR_NOT_FOUND`／`CURRENCY_NOT_FOUND`（皆應拒絕）；三個行事曆查詢端點 404 使用 `CALENDAR_NOT_FOUND`（合法）、`CURRENCY_NOT_FOUND`（應拒絕）；以及確認兩個新碼本身是 `ErrorResponse` 元件上合法的 enum 值。`errorCode` 列舉由 18 個增至 20 個。對應新增 UAT-64、UAT-65。

### 3.45 P1（第十二輪）：`GET /countries/{code}` 之 UAE 週末範例已過時，並補充第零節之 422 描述更正

第十二輪指出 `GET /countries/{code}` 對 `weekendDays` 的範例值（以及 `validate_semantics.py` 對應的測試 fixture）皆使用 `["FRI", "SAT"]`，這是 UAE（阿拉伯聯合大公國）2022 年之前的聯邦公部門週末制度；UAE 官方自 2022-01-01 起已改為 `Saturday`／`Sunday` 週末、`Monday`–`Friday` 工作週。`weekendDays` 欄位的 `enum`（`MON`..`SUN`）本身早已允許 `SAT`／`SUN`，這不是 schema 表達能力的缺口，純粹是範例／測試資料本身寫錯、且已經過時沒有同步更新。已將 OAS 範例與 `validate_semantics.py` 之測試資料一併修正為 `["SAT", "SUN"]`，並在該欄位補上說明：本端點回傳的是「目前現行」的單一快照，不是版本化歷史；UAE 這類制度確實隨時間變動的國家，其**逐日**營業日判定（含歷史交易重算）本來就應透過 `calendarType=COUNTRY` 的行事曆端點（`/calendars/{calendarType}/{code}/is-business-day` 等，本身已支援 `calendarVersion`／`asOfDateTime` 版本化查詢）取得，而不是依賴 `GET /countries/{code}` 這個純參考性質、非版本化的靜態欄位——這與第二節「行事曆版本與生效期間」既有設計一致，本輪未新增任何新的 API 版本化機制，只是把既有機制與這個易誤用欄位的關聯明確寫清楚。對應新增 UAT-66（AE 目前週末制度為 SAT／SUN）、UAT-67（歷史交易重算應透過 COUNTRY 行事曆之 `calendarVersion`／`asOfDateTime`，而非 `GET /countries/{code}` 之靜態 `weekendDays`，取得當時有效的週末制度）。

另外，第十二輪指出第零節之錯誤碼段落誤稱「三個行事曆查詢端點另有各自的 422」——實際比對 OAS 後，僅 `GET .../is-business-day` 有 422（語意為「行事曆存在但資料未涵蓋所查詢日期」），`GET .../holidays` 與 `GET .../completeness` 目前皆**未定義** 422。第零節已據此修正。第十二輪同時建議「若產品需求認為 holidays 查詢區間超出已載入年度也應明確拒絕，應評估補上 `GET .../holidays` → 422 `CALENDAR_YEAR_NOT_AVAILABLE`，但這涉及 API 契約擴充，不應只改文件文字」——此為第七節後續建議事項，本輪不逕自新增未經確認的 API 行為，維持誠實揭露現況。（**注意**：這項第十二輪的遺留建議至今仍未實作，與 3.49 節第十三輪新增的 `GET .../holidays` 400 `INVALID_DATE_RANGE` 是兩件不同的事——前者是「查詢區間落在資料完整度涵蓋範圍之外」，後者是「查詢區間本身跨度過長」，兩者都可能發生在同一個 `from`/`to` 查詢上，不應混為一談，見 3.49 節。）

### 3.46 P1（第十三輪）：`weekendDays` 缺少 `minItems`／`maxItems`／`uniqueItems`

第十三輪指出 `GET /countries/{code}` 的 `weekendDays` 陣列只限制每個元素必須是 `MON`..`SUN` 之一，卻沒有限制陣列長度或唯一性，導致 `[]`（空陣列）、`["SAT", "SAT"]`（重複值）、甚至七天全選都是 schema 合法值——三者皆是明顯不合理的「週末」定義，卻都能通過既有 schema。修正為：

```yaml
weekendDays:
  type: array
  minItems: 1
  maxItems: 3
  uniqueItems: true
  items: { type: string, enum: [MON, TUE, WED, THU, FRI, SAT, SUN] }
```

`maxItems: 3` 採用審閱建議之上限，可涵蓋目前已知的真實案例：1 天（如尼泊爾僅星期六）、2 天（如沙烏地阿拉伯星期五、星期六，或本設計已建模之 AE 星期六、星期日）、3 天（如審閱意見所舉之沙迦政府星期五至星期日）。若未來出現超過 3 天的真實案例，屆時應重新評估上限，而非現在預先放寬到一個目前無真實案例佐證的更大數字。已新增 6 項語意測試：空陣列拒絕、重複值拒絕、七天全選拒絕（超過 `maxItems`）、非法值 `HOLIDAY` 拒絕、單日（`["SAT"]`）合法、三日不重複（`["FRI","SAT","SUN"]`）合法。對應新增 UAT-68～UAT-71。

### 3.47 P1（第十三輪）：`pathGroup` 未禁止空字串

`CalendarReference.pathGroup` 原本只宣告 `type: string`，`pathGroup: ""` 是 schema 合法值。第十三輪指出：若服務端的實作只檢查「這個欄位是否存在（is set）」而非「這個欄位是否為有意義的非空值」，一筆帶有 `pathGroup: ""` 的行事曆項目就可能被誤判為「已提供替代付款路徑」，讓 `ANY_ELIGIBLE_OPEN` 在沒有真正替代路徑的情況下被判定為滿足。修正為：

```yaml
pathGroup:
  type: string
  minLength: 1
  maxLength: 50
  pattern: '^[A-Za-z0-9._-]+$'
```

這只解決「值本身的形狀」——空字串、純空白、超長字串、含非法字元的字串現在都是 schema 不合法。審閱意見同時列出的三項更深層規則——(1) 每個 `pathGroup` 值都必須對應到一個完整、經產品政策核准的路徑、(2) 同一張行事曆不得在同一個 `pathGroup` 內重複出現、(3) `ANY_ELIGIBLE_OPEN` 時 `calendars[]` 中至少要有一個完整的 `pathGroup`——第三項本來就已在 3.16 節與 `CombinationRule` 說明中標示為 SERVER-ENFORCED（需要 `contains`，draft-06+）；第二項是本輪新發現、同樣需要陣列層級跨項目比對的規則，一併補充說明為 SERVER-ENFORCED；第一項（是否符合產品政策）本質上需要查詢外部的政策設定資料，不是單一 request/response payload 能自我驗證的規則，同樣只能是 SERVER-ENFORCED。已新增 4 項語意測試：空字串拒絕、含空白字元拒絕、超過 50 字元拒絕、合法值（`"route-1"`）通過。對應新增 UAT-72、UAT-73。

### 3.48 P1（第十三輪）：`GET .../is-business-day` 的 422 應收窄錯誤碼

第十三輪指出 `GET .../is-business-day` 的 422 回應（語意：「行事曆存在，但資料沒有涵蓋查詢日期」）仍只 `$ref` 共用的 `ErrorResponse` schema，未像第十二輪已收斂的 5 個 404 回應一樣 narrow 到專屬 `errorCode`，造成契約風格不一致。查證本文件既有的 `errorCode` 列舉後發現 `CALENDAR_YEAR_NOT_AVAILABLE` 已經存在，且其官方定義（見 `/business-days/adjust` 的 fail-closed 說明：「計算範圍延伸至行事曆尚未載入的年度／期間」）與這個 422 描述的情境完全相同，因此不需要另外新增審閱意見中提到的 `CALENDAR_DATE_NOT_COVERED` 這個新碼，直接重用既有碼即可：

```yaml
'422':
  content:
    application/json:
      schema:
        allOf:
          - $ref: '#/components/schemas/ErrorResponse'
          - properties:
              errorCode:
                enum: [CALENDAR_YEAR_NOT_AVAILABLE]
```

已新增 3 項語意測試：`CALENDAR_YEAR_NOT_AVAILABLE` 合法、`CALENDAR_NOT_CONFIGURED`（屬於計算端點的碼，非本端點）拒絕、`MANUAL_REVIEW_REQUIRED`（同樣屬於計算端點）拒絕。對應新增 UAT-74。

### 3.49 P1（第十三輪）：`GET .../holidays` 應限制查詢日期範圍

第十三輪指出 `GET .../holidays` 的 `from`／`to` 查詢參數沒有任何區間長度上限，呼叫端理論上可要求十年、五十年甚至更長的區間，可能造成大量資料庫讀取、巨大回應內容、API timeout，或 Impact Report 功能被誤用／濫用。新增區間上限規則：`to` 減 `from` 不得超過 366 天，超過者回傳新增之 `400 INVALID_DATE_RANGE`：

```yaml
'400':
  description: >
    Requested date range (`to` minus `from`) exceeds the documented
    maximum of 366 days (errorCode INVALID_DATE_RANGE).
  content:
    application/json:
      schema:
        allOf:
          - $ref: '#/components/schemas/ErrorResponse'
          - properties:
              errorCode:
                enum: [INVALID_DATE_RANGE]
```

**誠實揭露邊界**：366 天這個門檻本身——也就是「比較 `to` 與 `from` 兩個查詢參數的實際值、算出天數差、再與常數比較」——OpenAPI 3.0.3 的 Draft-4 相容子集完全無法宣告式表達（需要 `if`/`then` 搭配日期運算，draft-07+，或自訂 keyword），因此明確標示為 SERVER-ENFORCED；本次新增的 schema 契約只保證「回應本身的形狀」（`400` 加上 narrow 過的 `errorCode`），不保證「366 天」這個數字真的有被服務端檢查。這與本文件一貫的誠實揭露原則一致（見 3.16 節、`CombinationRule` 等處）。

審閱意見另提出「或提供 `page`／`pageSize`／`nextPageToken` 分頁機制」作為替代方案——本輪**刻意未採用**：分頁是比單純加上長度上限更大的 API 介面決策（新增查詢參數、回應結構、串接邏輯），不應在回應單一 P1 意見時順手夾帶進去；已將其列為第七節的後續評估項目，待有明確產品需求時再單獨設計審閱，而不是在本輪自行擴充 API 契約。另需注意，本項與第十二輪遺留的「holidays 查詢區間超出已載入年度」（3.45 節結尾）是兩個不同的問題（前者關心「這個查詢請求本身跨度是否合理」，後者關心「資料本身是否涵蓋這段期間」），本輪僅處理前者，後者仍待第七節後續評估。已新增 3 項語意測試：`INVALID_DATE_RANGE` 合法、`CALENDAR_NOT_FOUND`（屬於同一端點的 404，非這個新 400）拒絕、`ErrorResponse.errorCode=INVALID_DATE_RANGE` 本身是合法列舉值。對應新增 UAT-75。

### 3.50 P2（第十三輪）：參考資料治理欄位與代碼格式限制

**P2-1（治理欄位）**：`GET /countries/{code}` 目前只回傳「現在生效」的單一快照，審閱意見指出應補上治理中繼資料，讓呼叫端不需要另外查詢就能知道：這個值從何時生效、對應哪個版本、何時最後核准、來源是否為官方權威。新增 4 個必填欄位：

```json
{
  "weekendDays": ["SAT", "SUN"],
  "effectiveFrom": "2022-01-01",
  "calendarVersion": "AE-2022.01",
  "lastApprovedAt": "2026-08-01T10:00:00Z",
  "sourceAuthority": "UAE_GOVERNMENT"
}
```

`sourceAuthority` 刻意維持為 pattern 限制的自由字串（`^[A-Z][A-Z0-9_]{2,49}$`）而非封閉式 `enum`：本文件目前無法窮舉這個服務未來可能涵蓋之所有國家的「來源權威」完整清單，若現在杜撰一份 `enum` 反而是製造假的完整性保證，待產品／維運團隊定義出完整分類後再評估改為 `enum`，與本文件一貫「不假造無法驗證之列舉覆蓋率」的原則一致。這 4 個欄位是唯讀描述性中繼資料，並非新的歷史查詢機制——歷史重算仍應透過 COUNTRY 行事曆既有的 `calendarVersion`／`asOfDateTime` 機制，與 3.45 節結論一致。已新增 4 項語意測試（`effectiveFrom`／`calendarVersion`／`lastApprovedAt`／`sourceAuthority` 各自缺漏時拒絕）。對應新增 UAT-76。

**P2-2（代碼格式限制）**：`GET /currencies/{code}`、`GET /countries/{code}` 的路徑參數與回應 `code` 欄位過去僅宣告 `type: string`，可接受 `"ae"`（大小寫錯誤）、`"UAE123"`（長度錯誤）等明顯不合法的值。新增三個共用元件：

```yaml
CountryCode:
  type: string
  pattern: '^[A-Z]{2}$'

CurrencyCode:
  type: string
  pattern: '^[A-Z]{3}$'

BicCode:
  type: string
  pattern: '^[A-Z0-9]{8}([A-Z0-9]{3})?$'
```

`CountryCode`／`CurrencyCode` 已套用於 `GET /currencies/{code}`、`GET /countries/{code}` 兩端點明確屬於單一用途的欄位（路徑參數、回應 `code`、`defaultCountryCalendarCode`）。`BicCode` 定義後**沒有**套用到任何現有欄位：`CalendarReference.code`／`CalendarVersionRef.code`／`CalendarAssessment.code`／`CalendarCodePath` 這幾處的 `code` 欄位，其實際格式取決於同一物件內另一個欄位 `calendarType`（COUNTRY／FINANCIAL_CENTER 用國碼、CURRENCY_CLEARING 用幣別碼、INSTITUTION 用 BIC），這是一個「條件式格式」問題——OpenAPI 3.0.3 的 Draft-4 相容子集沒有 `if`/`then`（draft-07+ 才有），無法宣告「當 calendarType=X 時套用 pattern A，calendarType=Y 時套用 pattern B」，因此這幾處欄位維持一般字串，並在 `CalendarCodePath`、`CombinationRule` 附近的說明中明確標示為 SERVER-ENFORCED，呼叫端應依 `calendarType` 自行比對正確的元件格式。已新增 9 項語意測試（Country/Currency 兩端點各自的合法／不合法代碼案例，以及三個新元件的獨立正向／反向驗證）。對應新增 UAT-77。

### 3.51 P2（第十三輪）：核心 Request Schema 增加 `additionalProperties: false`

審閱意見指出：若呼叫端把 `sourceDate` 誤打成 `sourceData`，在目前的 schema 下這個多出來的欄位會被靜默忽略，`sourceDate` 本身仍會因 `required` 而觸發「缺少必要欄位」錯誤，但錯誤訊息不會直接點出「你是不是打錯字了」，除錯成本較高。已為 `AdjustBusinessDayRequest`、`AddBusinessDaysRequest` 兩個核心計算 request schema 加上 `additionalProperties: false`。採納審閱意見的保留建議：**未**套用在任何 response schema——服務端未來新增回應欄位、且客戶端尚未同步更新的情境下，`additionalProperties: false` 會讓客戶端的舊版反序列化邏輯（若客戶端自己也用同一份 schema 做驗證）錯誤地拒絕新回應，向前相容的代價大於防呆的效益，這個取捨方向與審閱意見「回應不一定需要限制」的建議一致。已新增 3 項語意測試：`sourceData`（`sourceDate` 誤植）拒絕、`startDatte`（`startDate` 誤植）拒絕、僅含既有合法欄位的請求仍正常通過。對應新增 UAT-78。

### 3.52 P2（第十三輪）：修正交叉引用錯字

`GET /countries/{code}` 的 `weekendDays` 說明文字提及「見設計文件 3.44 節」，但實際上 3.44 節的內容是 `CURRENCY_NOT_FOUND`／`COUNTRY_NOT_FOUND` 404 錯誤碼修正，`weekendDays` 版本化查詢的討論實際位於 3.45 節。已修正為「3.45」。此為單純文件內部交叉引用錯字修正，不涉及任何 schema 或行為變更，因此未新增對應測試。

### 3.53 P1（第十四輪）：附錄 A 之外部查證品質不足（年份錯誤、來源不可追溯、以色列過度簡化）

第十四輪確認第十三輪新增的「附錄 A：Friday／Saturday 週末國家名單之外部查證」用意正確，但實際內容有三項需要修正之處，皆已處理：

**(1) 阿爾及利亞改制年份誤植**：附錄原寫「2019 年 8 月」，正確應為「2009 年 8 月」。已重新獨立查證：先前引用的 gulfnews.com 文章頁面標示「Last updated: July 22, 2019」，這是新聞網站 CMS 重新發佈／改版時留下的更新時間戳，不是事件本身的發生時間，之前未區分這兩者導致誤植；重新查證後找到一篇發佈於 **2010-08-14** 的當代部落格文章，內文明確寫道「今天正好是 Algeria 將週末由 Thursday-Friday 改為 Friday-Saturday 滿一年」——這是比任何事後彙整報導都更接近事件當下的第一手時間佐證，可反推實際改制日期為 **2009 年 8 月中旬**。已更正附錄內容，並在來源說明中記下「gulfnews.com 的『2019』實際上是誤導性的更新時間戳，非事件年份」這個具體教訓，避免未來查證時重蹈覆轍。

**(2) 查證依據不可追溯**：附錄原本每國只有一句概括敘述（如「2026年資料確認未變」），未達銀行級 Standing Data 應有的可追溯標準。已將附錄改寫為逐國結構化表格，每筆記錄包含 `sourceAuthority`（來源權威名稱）、`sourceDocument`（文件／報導名稱）、`sourceUrl`（實際連結）、`sourceConfidence`（OFFICIAL／NEWS／SECONDARY 三級信心分類）、`effectiveFrom`（已知變更日期，查無確切日期者誠實標示「未查得確切日期，僅確認現況」而非杜撰）、`verifiedAt`（本次查證時間戳）、`verifiedBy`（查證執行者）、`calendarScope`（COUNTRY／BANKING／CLEARING／EXCHANGE 等範疇）。這個結構與第十三輪已新增的 `GET /countries/{code}` 治理欄位（`effectiveFrom`／`sourceAuthority`）精神一致，但附錄本身仍是文件層級的查證記錄，非 OAS schema 的一部分——**沒有**因此新增任何 YAML 欄位，因為目前僅 AE 一國實際建模於 OAS，其餘各國仍停留在文件層級的事實查證，尚未成為 API 契約的一部分。

**(3) 以色列過度簡化為單一列**：第十四輪指出以色列同時存在國家／政府工作日、銀行營業日、清算系統營業日、證交所交易日等可能互不相同的範疇，不應以單一 `weekendDays: ["FRI","SAT"]` 代表全部金融活動。查證後發現這個疑慮不僅成立，而且有一項重大且非常新的事實佐證：**Tel Aviv Stock Exchange（TASE）已於 2026 年初（生效日 2026-01-05）由原本的 Sunday–Thursday 交易週改為 Monday–Friday 交易週**——星期五為縮短交易日（下午 2 點收盤，銜接安息日），星期日則**不再是交易日**，方向與以色列「國家」層級週末（星期五、六）恰好相反。這是本輪查證意外發現、極具代表性的真實案例，直接證明「用一個國家層級的 `weekendDays` 代表所有金融活動」在以色列這個案例下會產生錯誤結論。已將附錄之以色列項目拆分為 `IL-COUNTRY`／`IL-BANKING`／`IL-CLEARING`／`IL-TASE` 四個獨立範疇分別記錄，並在附錄結論中明確指出：這個發現反過來印證了本 OAS 既有的 `COUNTRY`／`INSTITUTION`／`CURRENCY_CLEARING`／`FINANCIAL_CENTER` 四層行事曆分層設計是必要且正確的，不需要因此變更 schema 結構——需要修正的是附錄這份**外部參考文件**的呈現方式，而不是 OAS 本身的資料模型。

**第十五輪批註（本段文字保留為第十四輪當下之記錄，不回頭改寫，理由見 3.59 節）**：上述「四個獨立範疇」與 `IL-TASE` 生效日（2026-01-05）之描述，第十五輪查證後發現仍有不夠精確之處（`2026-01-05` 實際是星期一、非星期五；`IL-CLEARING` 不應推定與 `IL-BANKING` 相同），已在 3.57 節進一步修正為五個獨立範疇。本段所述之核心結論（以色列不應以單一範疇代表全部金融活動、TASE 之發現印證既有分層設計）並未改變，改變的只是範疇拆分的精確度與筆數。

以上三項修正後之完整附錄內容見文末「附錄 A」；因純屬文件事實查證修正，不涉及 schema 或程式行為變更，故無對應之 `validate_semantics.py` 測試或 UAT 項目。

### 3.54 P2（第十四輪）：`BicCode` 之 pattern 未強制國碼區段為英文字母

第十四輪指出第十三輪新增的 `BicCode` pattern（`^[A-Z0-9]{8}([A-Z0-9]{3})?$`）把全部 8 個核心字元都當作一般英數字元處理，會誤放行 `"12345678"`、`"BANK12XX"` 這類第 5–6 碼（依 SWIFT BIC 定義應為 ISO 3166-1 兩位英文字母國碼）實際上是數字的偽 BIC，這在結構上不可能是真實的 Business Identifier Code。已依 SWIFT 官方 BIC 結構修正為：

```yaml
BicCode:
  type: string
  pattern: '^[A-Z0-9]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$'
```

即：4 碼機構前綴（英數字）、2 碼國別碼（**限英文字母**）、2 碼地區碼（英數字）、選填 3 碼分行碼（英數字）。**誠實揭露邊界**：regex 只能確認第 5–6 碼「是兩個英文字母」，無法確認這兩個字母組成的是一個**真實存在**的 ISO 3166-1 國碼（例如 `"BOFAZZ2X"` 仍會通過此 pattern，但 `ZZ` 不是真實國碼）——驗證國碼是否真實存在，與本文件其他多處「regex 無法窮盡驗證真實世界事實」的缺口性質相同，仍為 SERVER-ENFORCED，已在 `BicCode` 自身的 description 中明確註記。新增 3 項語意測試：`"12345678"`（全數字）拒絕、`"BANK12XX"`（國碼區段為數字）拒絕、`"BANKGBXX"`（國碼區段為合法英文字母 GB）通過。對應新增 UAT-79。

### 3.55 P2（第十四輪）：`defaultCountryCalendarCode` 不應強制等於 `CountryCode`

第十四輪指出：第十三輪把 `defaultCountryCalendarCode` 直接參照 `CountryCode`（`^[A-Z]{2}$`），隱含假設「一個國家的預設 COUNTRY 行事曆代碼必然等於該國兩位 ISO 國碼」，但這只是尚未經產品政策確認的假設——未來可能需要 `AE_FEDERAL`、`MY_KEDAH`、`IL_BANKING` 這類不符合兩位國碼格式的行事曆識別碼。已新增獨立的 `CalendarCode` 元件並改用它：

```yaml
CalendarCode:
  type: string
  minLength: 2
  maxLength: 50
  pattern: '^[A-Z0-9._-]+$'
```

`defaultCountryCalendarCode` 現在參照 `CalendarCode` 而非 `CountryCode`——仍會拒絕小寫、空白、過短等明顯不合法的值，但不再強制長度恰為 2 碼。本文件**未**自行決定哪一種產品政策才是對的，而是誠實記錄這是一個待確認的開放問題：若日後產品面確認 Country Calendar ID 永遠等於 ISO 兩位國碼，屆時可再收緊回 `CountryCode`；若確認是獨立識別碼，目前的 `CalendarCode` 已可直接沿用，列入第七節後續追蹤項目。新增 3 項語意測試：`"AE_FEDERAL"`（非兩位國碼格式）合法、`"ae"`（小寫）仍拒絕、`"A"`（低於 `minLength: 2`）拒絕。對應新增 UAT-80。

### 3.56 P1（第十五輪）：`CalendarReference.code` 之條件式格式其實可在 OAS 3.0.3 內解決，v2.7.0 說明過度保守

第十五輪指出本文件對「升級 OAS 3.1 才能解決哪些限制」的說明過於樂觀籠統，其中一項具體反例是：本文件 v2.7.0 的 hardening notes（見該區塊）曾主張 `CalendarReference.code` 這個依 `calendarType` 而定的多型欄位，「OAS 3.0.3（無 `if`/`then`，draft-07+）無法表達為單一宣告式約束」，因此刻意維持為不受限的 `type: string`，並將整條規則列為 SERVER-ENFORCED。

審閱意見以具體 YAML 反例指出這個推論有漏洞：v2.7.0 的說法只證明了「單一 `pattern` 無法依 sibling 欄位的值而變化」（這確實需要 `if`/`then`），但沒有考慮到 `calendarType` 與 `code`其實是**同一個 schema 物件內的兩個屬性**，因此可以改用 `oneOf` 表達成一個「依 `calendarType` 值分流、各自套用不同 `code` 格式」的判別聯集（discriminated union）——這在 OAS 3.0.3（Draft-4 相容子集）已完全支援，不需要等 3.1。這與 `CalendarCodePath`（獨立的 path parameter，沒有同一個 schema 物件內的 sibling 可供 `oneOf` 分流）是本質不同的兩種情況，後者確實無論版本都無法宣告式表達，維持 SERVER-ENFORCED 不變。

已直接採用審閱意見之作法，將 `CalendarReference` 改為：

```yaml
CalendarReference:
  type: object
  required: [calendarType, code, role]
  oneOf:
    - properties:
        calendarType: { enum: [COUNTRY, FINANCIAL_CENTER] }
        code: { $ref: '#/components/schemas/CountryCode' }
    - properties:
        calendarType: { enum: [CURRENCY_CLEARING] }
        code: { type: string }   # 見 3.57 之修正說明，此分支刻意不套用 CurrencyCode
    - properties:
        calendarType: { enum: [INSTITUTION] }
        code: { $ref: '#/components/schemas/BicCode' }
  properties:
    calendarType: { $ref: '#/components/schemas/CalendarType' }
    code: { type: string }
    role: { $ref: '#/components/schemas/CalendarRole' }
    # ...（required／pathGroup 不變）
```

`calendarType` 的四個列舉值（`COUNTRY`／`FINANCIAL_CENTER`／`CURRENCY_CLEARING`／`INSTITUTION`）被三個 `oneOf` 分支完整、互斥地涵蓋，任何合法輸入恰好命中一個分支，不會有兩個分支同時通過或都不通過的模糊地帶——已用程式逐一驗證過 9 組正、反例（COUNTRY／FINANCIAL_CENTER 配 2 碼國碼合法、配 3 碼幣別碼或小寫皆拒絕，INSTITUTION 配合法 BIC 合法、配 2 碼國碼或第 5–6 碼為數字的偽 BIC 皆拒絕，COUNTRY 配 BIC 形狀之代碼因跨分支而拒絕），確認其行為與人工預期完全一致，才正式寫入。

**這是本文件自己的說明退步，不是新發現的 schema 漏洞**：`CalendarReference.code` 這個欄位一直以來在執行面就是不受 schema 限制的——v2.7.0 只是把「目前沒做」誤寫成「做不到」，v2.9.0 是把它真正做到，並同時修正 v2.7.0 那段過度保守的推論本身（見該區塊新增之第十五輪批註）。新增 9 項語意測試（4 項正向、5 項反向）。對應新增 UAT-81。

**額外自行發現並修正之既存錯誤（非本輪審閱意見）：** 在實作上述 `oneOf` 的過程中，逐一核對 `CalendarType` 四個列舉值各自對應的代碼格式時，發現 `CalendarCodePath`（第十三輪新增之說明文字）誤稱「CURRENCY_CLEARING 之代碼遵循 `CurrencyCode` 的 `^[A-Z]{3}$` 格式」——這與 `CalendarType` 元件自己的說明（「CURRENCY_CLEARING = 幣別的清算系統行事曆，例如 `USD_FEDWIRE`、`EUR_TARGET2`，可能不同於該幣別發行國的國家行事曆」）以及本檔案既有的所有實例資料（`/business-days/adjust`、`/business-days/add` 範例中的 `USD_FEDWIRE`；`GET /currencies/{code}` 之 `defaultClearingCalendarCode` 範例同樣是 `USD_FEDWIRE`）直接矛盾——CURRENCY_CLEARING 代碼指的是清算系統本身，不是三碼 ISO 4217 幣別代碼。若未發現並修正這個既存錯誤，新增的 `oneOf` 就會把 CURRENCY_CLEARING 分支錯誤地約束為 `CurrencyCode`，进而讓現有 5 處內嵌範例（皆使用 `USD_FEDWIRE`）全數 schema 不合法——已在正式寫入 `oneOf` 前，用實際驗證器對這 5 處範例逐一重跑確認才排除此風險。已修正 `CalendarCodePath` 之說明文字，並在新 `oneOf` 中刻意不對 CURRENCY_CLEARING 之 `code` 施加任何格式限制（保持與過去執行面行為一致的「無格式限制」，而非套用一個查證後確認錯誤的格式）。`CurrencyCode` 元件本身不受影響，在其原本正確使用的地方（如 `GET /currencies/{code}`）維持不變。

同時發現本檔案 5 處內嵌範例（`/business-days/adjust`、`/business-days/add` 之 request／response 範例）原本使用 `"BANK_AE"` 作為 INSTITUTION 型別之範例代碼——含底線、僅 7 碼，本來就不是合法的 BIC 形狀，只是恰好從未被任何 schema 約束檢查過，這次 `oneOf` 上線後會直接被新規則擋下。已全數改為本文件既有的 `BicCode` 元件自身範例值 `"BOFAAE2X"`，讓範例資料保持內部一致。

### 3.57 P1（第十五輪）：附錄 A 之以色列 TASE 生效日與清算範疇描述有誤

第十五輪以 TASE 官方公告連結指出附錄 A 對 `IL-TASE` 的兩處描述有事實錯誤：(1) 附錄原寫「2026-01-05：TASE 有史以來首次星期五交易」，但 2026-01-05 實際上是星期一——這天是新交易週制度（Monday–Friday）的**生效日**，不是「第一個星期五交易日」；(2) `IL-CLEARING` 原本以「Zahav 由 Bank of Israel 直接營運」為由，**推定**與 `IL-BANKING` 相同，但 TASE 交易日與其清算安排實際不同，且 Zahav（ILS RTGS 系統）本身也是一個獨立於 TASE 證券清算之外的第三個範疇。

已重新查證並更正：

- **日期計算**：以程式驗證 `2026-01-05` 之星期別，確認為星期一；新交易週制度下第一個實際的星期五交易日為 `2026-01-09`（同一週的星期五）。已將附錄之 `IL-TASE-TRADING` 一列的生效日改標為 `2026-01-05`（Monday–Friday 制度生效日），並在敘述中另外註明 `2026-01-09` 為首個星期五交易日，不再混用兩個日期。
- **`IL-CLEARING` 拆分為兩個獨立範疇**：透過國際託管機構 Clearstream 之官方市場結算說明文件查證，確認「星期五之交易指示於次一個星期日撮合結算」——也就是說 TASE 的證券清算流程確實會在星期日發生活動，即使星期日已不再是交易日；這與交易日（Monday–Friday）本身不同，因此改列為獨立的 `IL-TASE-CLEARING` 範疇（來源：Clearstream 官方市場文件，信心等級 OFFICIAL）。另外，透過 Bank of Israel 官方 PDF（`ZAHAV RTGS SYSTEM Business Days`）查證，Zahav（以色列 ILS 大額即時清算系統）的規則原文為「as a rule, the operating days of the RTGS system are Sunday through Friday」——常態營運日為星期日至星期五（六天制，不含星期六），一般營業日結束於當地時間 18:30，星期五及節日前夕之縮短營業日結束於 14:00。這個時間點（14:00）與 `IL-BANKING` 既有資料（Bank of Israel Markets Department，星期五結束於 13:15）並不完全相同——兩者雖同屬 Bank of Israel，但分屬不同部門／系統的公告，本文件誠實保留兩個不同的數值，不逕自合併或忽略其中之一。已新增獨立的 `IL-ILS-ZAHAV` 範疇（來源：Bank of Israel 官方 PDF，信心等級 OFFICIAL）。

以色列於附錄 A 中之範疇數量因此由 4 個增為 **5 個**：`IL-COUNTRY`、`IL-BANKING`、`IL-ILS-ZAHAV`、`IL-TASE-TRADING`、`IL-TASE-CLEARING`。修正後之完整表格見文末「附錄 A」。因純屬文件事實查證修正，不涉及 schema 或程式行為變更，故無對應之 `validate_semantics.py` 測試或 UAT 項目——與 3.53 節相同的性質。

### 3.58 P2（第十五輪）：附錄 A 國家計數與實際列數不一致

附錄 A 原本的標題與內文多處寫「12 個一般國家 + Israel 四個獨立範疇」，但實際表格列出的一般國家為 SA、BH、KW、QA、OM、JO、EG、DZ、IQ、BD、MV、PS、SY，共 **13 個**，而非 12 個（第十三輪最初查證時本來就是 13 國，非 14 國參考表扣除以色列後的 13 國；文字敘述的「12」是單純計數錯誤，未曾與實際表格逐行核對過）。已將本文件所有提及此計數之處（附錄 A 標題內文、結論段落之「其餘 12 國」）修正為「13 個一般國家」，並在附錄小結處註明總筆數為 13（一般國家）+ 5（以色列範疇，見 3.57 節）= 18 筆結構化紀錄。因純屬文件計數修正，不涉及 schema 或程式行為變更，無對應測試或 UAT 項目。

### 3.59 P2（第十五輪）：OAS 檔案內之歷史 hardening notes 未標註時效性，可能被誤讀為現況

第十五輪指出：`standing-calendar-service.oas.yaml` 的 `info.description` 內，v2.7.0（第十三輪）hardening notes 區塊仍原封不動地寫著已於 v2.8.0 修正之舊版 `BicCode` pattern（`^[A-Z0-9]{8}([A-Z0-9]{3})?$`）與已於 v2.8.0 修正之 `defaultCountryCalendarCode` 舊行為（直接參照 `CountryCode`）——這兩段文字在寫下的當下（v2.7.0／第十三輪）是正確的，但若開發人員只看這個區塊、沒有繼續往下讀到 v2.8.0 的 notes，可能誤以為這仍是目前規格的行為。

本文件既有原則（見第七節）是：每一輪的 hardening notes 是「當下那個時間點做了什麼」的歷史記錄，之後若被修正，**不會回頭改寫舊文字本身**（否則歷史記錄失真），而是在新一輪的 notes 中另外說明修正內容。第十五輪審閱指出的問題，本質上不是這個原則錯了，而是這個原則需要搭配一個機制：讓讀者在讀到舊文字的當下就知道「這段之後被修正過，請往下看」，而不是必須自己記得整份 changelog 的先後順序才能發現矛盾。

審閱意見建議的替代方案——把歷史修訂紀錄整段移出 `info.description`、另立獨立的 `CHANGELOG.md`——本輪**評估後未採用**：這是比單純加註更大的文件架構調整（v2.0.0 至今共 15 輪的 hardening notes 都要搬動），且會讓 `standing-calendar-service.oas.yaml` 本身失去「單一檔案內即可看到完整版本演進」的既有特性，改動範圍與風險超出本輪應處理的程度，故改採影響範圍小、不破壞既有歷史記錄的作法：在 v2.7.0 notes 區塊尾端、v2.8.0 標題之前，插入一段第十五輪批註，明確列出該區塊內哪幾點已被後續版本取代、指向修正之處，但不改動 v2.7.0 原文字本身一個字。此作法之取捨已誠實記錄於此，若日後 hardening notes 累積輪數更多、類似情況重複出現，`CHANGELOG.md` 分離仍是可考慮的後續方向，列入第七節追蹤項目。因純屬文件註記，不涉及 schema 或程式行為變更，無對應測試或 UAT 項目。

### 3.60 P2（第十五輪）：附錄 A 之 `verifiedBy` 應區分「AI 輔助查證」與正式核准

第十四輪已在附錄 A 加註「本查證由 Claude 協助完成，非人類 Data Steward 正式簽核」，但當時只用一個 `verifiedBy: Claude（AI 助理...）` 欄位承載這個揭露，沒有區分「誰做了初步研究」「誰複核確認」「誰正式核准」這三個銀行治理流程中通常各自獨立的角色。第十五輪指出，銀行級 Standing Data 的核准鏈路通常需要 Maker（初步驗證）與 Checker（正式核准）分離，單一欄位不足以表達這個狀態機。

已將附錄 A 表後之揭露欄位由單一 `verifiedBy` 擴充為：

```
researchAssistedBy: AI_ASSISTANT (Claude, 經網路搜尋工具查證)
verifiedBy: （未指派——尚待人類 Data Steward 執行 Maker 複核）
approvedBy: （未指派——尚待正式 Checker／Authorized Reviewer 核准）
approvedAt: （尚未發生）
approvalStatus: DRAFT
```

`approvalStatus` 採四態狀態機：`DRAFT`（AI 輔助研究完成，尚未經人類複核，本附錄目前全數列為此狀態）、`VERIFIED`（人類 Data Steward 已複核來源與內容，但尚未經正式核准）、`APPROVED`（已由 Authorized Reviewer 正式核准，可視為核准之 Standing Data）、`SUPERSEDED`（曾經核准，但已被更新的查證結果取代）。這個狀態機**僅存在於本設計文件的附錄層級**，不是 OAS schema 的一部分——因為附錄中的這些國家目前仍未建模進 `GET /countries/{code}` 的實際資料集（見附錄開頭之既有揭露），若日後真的要把這些國家納入正式資料集，`approvalStatus` 等治理欄位屆時應該轉化為 3.50 節已新增的 `sourceAuthority`／`effectiveFrom`／`calendarVersion`／`lastApprovedAt` 這組 schema 治理欄位的實際值，而不是在 schema 中另外重新發明一套欄位。因純屬文件揭露修正，不涉及 schema 或程式行為變更，無對應測試或 UAT 項目。

### 3.61 P1（第十六輪）：`CalendarReference.code` 針對 COUNTRY／FINANCIAL_CENTER 之條件驗證過度限制，與 `defaultCountryCalendarCode` 之既有設計互相矛盾

第十六輪指出，3.56 節（第十五輪）新增的 `oneOf` 把 COUNTRY／FINANCIAL_CENTER 分支的 `code` 收緊為 `CountryCode`（`^[A-Z]{2}$`，恰好兩位大寫國碼），但這與 3.55 節（第十四輪）**本文件自己已經確認的立場**直接矛盾——3.55 節的結論正是「國家行事曆代碼不保證等於兩位國碼」，因此才把 `defaultCountryCalendarCode` 從 `CountryCode` 鬆綁為新增的 `CalendarCode` 元件（`^[A-Z0-9._-]+$`，2–50 碼，可以是 `"AE_FEDERAL"`、`"MY_KEDAH"` 這類次國家層級或分支層級的識別碼）。

矛盾的具體後果：`GET /countries/{code}` 合法回傳 `defaultCountryCalendarCode: "AE_FEDERAL"`，若呼叫端原樣把這個值放進 `POST /business-days/adjust` 的 `calendars[].code`（`calendarType: COUNTRY`），會被 3.56 節新增的 `oneOf` 拒絕——因為 `"AE_FEDERAL"` 不是兩位國碼，不符合 `CountryCode` 格式。也就是說，同一份規格的兩個地方，一處說「這個值合法」，另一處說「這個值不合法」，這是本文件自己在第十五輪新增 `oneOf` 時引入的內部不一致，不是全新發現的缺口——3.55 節的決策從未被推翻，只是 3.56 節實作 `oneOf` 時沒有覆核與 3.55 節是否一致。

已直接採用審閱意見之修正方向：COUNTRY／FINANCIAL_CENTER 分支改參照與 `defaultCountryCalendarCode` 相同的 `CalendarCode` 元件，而非 `CountryCode`。同時，審閱意見進一步指出 `CalendarCode` 的寬鬆 pattern（`^[A-Z0-9._-]+$`）恰好也完整涵蓋 `USD_FEDWIRE`／`EUR_TARGET2` 這類清算系統識別碼的既有格式（大寫字母、數字、底線），因此 CURRENCY_CLEARING 分支不必再單獨保留為完全不受限的 `type: string`（3.56 節當時因尚未有一個「足夠寬鬆又不失真」的元件可用，才刻意不施加任何格式），可以直接併入同一個 `CalendarCode` 分支，一併獲得 `minLength: 2`／`maxLength: 50`／字元集限制這些基本防呆。修正後的 `oneOf` 由三分支簡化為兩分支：

```yaml
CalendarReference:
  type: object
  required: [calendarType, code, role]
  oneOf:
    - properties:
        calendarType: { enum: [COUNTRY, FINANCIAL_CENTER, CURRENCY_CLEARING] }
        code: { $ref: '#/components/schemas/CalendarCode' }
    - properties:
        calendarType: { enum: [INSTITUTION] }
        code: { $ref: '#/components/schemas/BicCode' }
  properties:
    calendarType: { $ref: '#/components/schemas/CalendarType' }
    code: { type: string }
    role: { $ref: '#/components/schemas/CalendarRole' }
    # ...（required／pathGroup 不變）
```

已用程式與 `validate_semantics.py` 逐一重新驗證審閱意見附上之 6 組案例（`COUNTRY`＋`AE_FEDERAL`→合法、`FINANCIAL_CENTER`＋`MY_KEDAH`→合法、`CURRENCY_CLEARING`＋`USD_FEDWIRE`→合法、`CURRENCY_CLEARING`＋空字串→不合法、`INSTITUTION`＋合法 BIC→合法、`INSTITUTION`＋`BANK_AE`→不合法），全數符合預期；另外新增 `COUNTRY`＋兩位國碼（`"AE"`）、`COUNTRY`＋小寫（`"ae"`）、`COUNTRY`＋單一字元（`"A"`，低於 `CalendarCode` 之 `minLength: 2`）、`INSTITUTION`＋合法但非 BIC 形狀之 8 碼字串（`"BANK12XX"`）共 4 組補充案例，合計新增 9 項語意測試取代 3.56 節原本的 9 項（COUNTRY／FINANCIAL_CENTER 之判斷邊界改變，原本的部分反例——如 `"USD"` 作為 COUNTRY 之不合法碼、`"BOFAAE2X"` 作為 COUNTRY 之不合法碼——在新設計下已不再是有效的反例，故整段重寫而非疊加，避免留下會通不過的舊測試）。對應新增 UAT-82。

同時修正 `CalendarCodePath` 之說明文字，使其與 `CalendarReference.code` 新設計保持一致（COUNTRY／FINANCIAL_CENTER／CURRENCY_CLEARING 對應 `CalendarCode`、INSTITUTION 對應 `BicCode`），並在文字尾端加註「第十六輪更正」段落，說明此欄位仍因跨兩個獨立 Parameter Object（詳見零節、3.56 節）而維持服務端驗證，此次修正僅同步更新其應遵循的格式描述，並未改變其驗證機制本身。

**這是第十五輪新增之 `oneOf` 自我引入的內部矛盾，不是全新缺陷**：3.55 節（第十四輪）的立場從第十四輪定案後從未改變，第十六輪修正的是第十五輪實作 `oneOf` 時未覆核既有立場所造成的落差。

### 3.62 P2（第十六輪）：`CalendarVersionRef.code` 與 `CalendarAssessment.code` 應與 `CalendarReference.code` 採用相同識別碼規則

第十六輪指出，`CalendarReference.code`（3.56、3.61 節）已有格式約束，但同樣代表「某個行事曆之代碼」的另外兩個欄位——`CalendarVersionRef.code`（出現於計算回應之 `calendarVersions[]`，記錄實際套用的行事曆版本快照）與 `CalendarAssessment.code`（出現於 `calendarAssessments[]`／`adjustedDateAssessments[]`，記錄逐行事曆的評估明細）——先前仍是完全不受限的 `type: string`，三處理應代表同一種資料（行事曆代碼）卻只有一處真正受格式約束，容易在 request、version evidence、assessment 三種情境下出現不一致的資料品質。

已將 3.61 節的判別聯集原樣套用至這兩個欄位：

```yaml
CalendarVersionRef:
  type: object
  required: [calendarType, code, version]
  oneOf:
    - properties:
        calendarType: { enum: [COUNTRY, FINANCIAL_CENTER, CURRENCY_CLEARING] }
        code: { $ref: '#/components/schemas/CalendarCode' }
    - properties:
        calendarType: { enum: [INSTITUTION] }
        code: { $ref: '#/components/schemas/BicCode' }
  properties:
    calendarType: { $ref: '#/components/schemas/CalendarType' }
    code: { type: string }
    version: { type: string }
```

`CalendarAssessment` 則不是新增獨立 schema，而是在既有 `allOf`（3.36／3.37 節已有的兩組 `oneOf`：Group 1 管 `businessDay`／`reasonCode` 一致性，Group 2 管 `closureStatus`／`resolvedAt` 一致性）之上，新增**第三組獨立的 `oneOf`** 作為新的 `allOf` 成員，內容與上方 `CalendarVersionRef` 之 `oneOf` 相同（依 `calendarType` 分流 `code` 格式）。三組 `oneOf` 分別約束不同的欄位組合，`allOf` 語意上要求三組同時成立，彼此不互相覆蓋。

**回歸測試**：新增第三組 `oneOf` 有可能與既有兩組規則交互出非預期結果，因此重新執行 3.36／3.37 節既有的全部 5 項回歸案例（`businessDay=true` 加 `reasonCode`不合法、`businessDay=false` 缺 `reasonCode`不合法、`FORCE_MAJEURE_EVENT` 缺旗標不合法、`resolvedAt` 與 `closureStatus` 不對應之兩種方向不合法），確認全數維持原本的通過／拒絕結果，新增的第三組規則未改變既有兩組的判定。另外新增 2 項正向、2 項反向案例驗證第三組本身（`CURRENCY_CLEARING`＋`USD_FEDWIRE`→合法、`INSTITUTION`＋`BANK_AE`→不合法，其餘欄位固定為既有回歸案例之基準值）。合計本節新增 6 項語意測試（`CalendarVersionRef` 2 項、`CalendarAssessment` 4 項，含重跑之既有回歸）。對應新增 UAT-83。

**重新測試過程中自行發現並修正之既存錯誤（非本輪審閱意見）**：套用上述約束後，完整重跑 `validate_semantics.py` 全部測試時，出現 3 項既有測試意外失敗（「格式完整的 `AddBusinessDaysResponse` 範例」、閏年案例、跨年案例），這 3 項測試共用同一個測試檔案內的 `add_resp_valid` fixture（約第 216–226 行），其中 `calendarVersions[]` 內嵌了 `{"calendarType": "INSTITUTION", "code": "BANK_AE", "version": "2026.12.10"}`——`"BANK_AE"` 這個值正是 3.56 節已經在 YAML 內嵌範例中修正過的同一個已知不合法 INSTITUTION 代碼，但當時 `CalendarVersionRef` 尚未受任何格式約束，這個測試檔案內獨立存在的 fixture 因此被漏掉，未一併修正。本輪為 `CalendarVersionRef.code` 加上格式約束後，這個沿用已久的 fixture 才第一次真正被驗證到，隨即曝露出來。已將該 fixture 內之 `"BANK_AE"` 改為與 YAML 內嵌範例一致的 `"BOFAAE2X"`，重新執行全部測試後確認 136/136 全數通過，不再有回歸。此案例顯示「新增約束後完整重跑全部既有測試（而非只跑新增測試）」這項既定流程紀律的必要性，若只驗證新增案例、未重跑既有套件，這 3 項回歸會被漏掉而不自知。

### 3.63 P2（第十六輪）：版本號考量——區分本輪變更中「鬆綁」與「新增限制」兩個方向，並說明維持次版本號升級之理由

第十六輪於審閱意見結尾提出版本號考量：若 v2.8（或更早）已對外投入使用，新增更嚴格的 `oneOf` 可能屬於不相容變更，應評估升 major version。這個提醒本身完全正確，但需要先誠實釐清本輪變更實際上包含兩個方向相反的子變更，不能籠統地只用「鬆綁」或「新增限制」單一詞彙概括：

**方向一（鬆綁，非破壞性）**：`CalendarReference.code` 之 COUNTRY／FINANCIAL_CENTER 分支，由 3.56 節（v2.9.0）誤收緊的 `CountryCode` 放寬回 3.61 節（v2.10.0）的 `CalendarCode`。這個方向只會讓**原本被 v2.9.0 拒絕、現在改為接受**的值變多（例如 `"AE_FEDERAL"`），不會有任何原本 v2.9.0 接受的值變成被拒絕——純粹擴大合法值集合，對任何已經符合 v2.9.0 的既有呼叫端而言必然相容。

**方向二（新增限制，屬於收緊）**：(a) `CalendarReference.code` 之 CURRENCY_CLEARING 分支，由完全不受限的 `type: string` 收緊為 `CalendarCode`（`minLength: 2`／`maxLength: 50`／字元集限制）；(b) `CalendarVersionRef.code`、`CalendarAssessment.code` 由完全不受限的 `type: string` 首次加上格式約束。這兩者確實是嚴格意義上的「收緊」——任何原本使用不符合 `CalendarCode`／`BicCode` 格式之值（例如空字串、小寫、含空白等此前從未被檢查過的畸形資料）的既有呼叫端／既有儲存資料，理論上會在這次變更後開始被拒絕。

依語意化版本（SemVer）之嚴格定義，方向二確實構成 API 合約的破壞性變更，若這是一個已經有外部消費者、正式對外發布的 API，審閱意見建議評估 major version 是正確的判斷。本輪維持次版本號（v2.9.0 → v2.10.0）而非升至 v3.0.0 的理由，與 3.51 節（第十三輪新增 `additionalProperties: false`）、3.55／3.56／3.61 節等歷次類似情況的既定立場一致：本專案目前仍處於**設計審閱／方案定案階段**（見文件開頭與歷次審閱意見之脈絡），尚未有正式對外發布版本、也沒有已上線之外部消費者需要相容性保證；在這個前提下，每一輪的目標是盡快把設計收斂到正確、內部一致的最終狀態，而非在設計階段就套用生產環境的相容性版本號規則。若本設計未來首次正式對外發布（即從目前的 pre-release 設計迭代轉為有外部消費者、需要承諾向後相容的正式合約——本文件不預先假設該次正式發布會使用哪一個版本號，刻意避免與目前純粹作為「設計迭代輪次計數」使用的 `v2.x.0` 序號並列、誤讀為版本倒退），**屆時應以該次正式核准之發布版本為新的相容性基準起點，其後任何再收緊既有欄位格式的變更，都應依 SemVer 規則評估 major version，而非沿用本文件目前這套「次版本號涵蓋所有設計期修正」的慣例**——這個分界點與適用規則已明確記錄於此，供日後轉換至正式發布階段時參照（**第十八輪 P2 修正**：本段原文字曾以 `v1.0.0` 具體指稱「首次正式發布版本」，與本文件目前已使用到 `v2.10.0` 的設計迭代版本號序列並列時，字面上讀起來像是版本號從 v2.10.0 倒退到 v1.0.0，容易造成誤解，已改為不指定具體版本號的敘述方式，詳見 3.67 節）。

### 3.64 P2（第十七輪，非阻擋）：明確區分「Approved Design Baseline」與「Production Readiness Approval」

第十七輪確認第十六輪之修正（`CalendarReference.code`／`CalendarVersionRef.code`／`CalendarAssessment.code` 一致性、版本號考量）皆已正確落實，136/136 語意測試通過，本設計本身升評為 9.9／10、Approved Design Baseline，同時提醒：本文件與 `validate_semantics.py` 136 項案例驗證的是 **OpenAPI schema 結構與資料語意**（欄位是否必填、格式是否合法、互斥規則是否成立），並不涵蓋 `FOLLOWING`／`MODIFIED_FOLLOWING`／`NEAREST` 等日期調整演算法的實際運算結果、多本行事曆合併判斷、Calendar snapshot 固定重算、不可抗力 fail-closed 的實際掃描邏輯、Trade Finance 端到端整合、重試與 timeout 行為等**服務層實作**是否正確——這些從第一輪起即持續列在第七節「後續建議」與測試分層表的 Service／Gateway／Integration／UAT 四層（見第七節之表格，目前狀態欄皆標示「待開發階段補上」），本文件從未宣稱這幾層已經完成，但審閱意見指出這個區分沒有被「Approved Design Baseline」這個核准狀態標籤本身清楚點出，容易被誤讀為「整個系統已可上線」。

已在第零節開頭與第七節之測試分層表前，各補上一句明確聲明：

> **「Approved Design Baseline」核准的範圍，僅限於本文件與 `standing-calendar-service.oas.yaml` 所定義之 API 契約設計（schema 結構、欄位約束、錯誤碼、版本治理）本身內部一致、且已通過結構與語意層級的自動化驗證；不代表、也不等同於服務端實作、日期運算正確性、跨服務整合或正式上線（Production Readiness）已完成或已核准。後者需依第七節測試分層表所列之 Service／Gateway／Integration／UAT 四層測試逐一完成後，另行走完各自的核准流程。**

因純屬文件用詞澄清，不涉及 schema 或程式行為變更，無對應測試或 UAT 項目。

### 3.65 P2（第十七輪，非阻擋）：重申附錄 A 之 Standing Data 正式核准流程

第十七輪重申 3.60 節已建立之 `approvalStatus` 狀態機（`DRAFT`／`VERIFIED`／`APPROVED`／`SUPERSEDED`）——附錄 A 目前全數國家／範疇皆標示 `DRAFT`，代表僅完成 AI 輔助之初步研究，尚未經人類 Data Steward 複核（`VERIFIED`）與正式 Authorized Reviewer 核准（`APPROVED`），因此**不得**直接作為正式銀行 Standing Data 使用；審閱意見進一步提醒，正式上線前必須實際走完 `DRAFT → VERIFIED → APPROVED` 這條路徑，並保留 `verifiedBy`／`approvedBy`／`approvedAt`／`sourceAuthority`／`calendarVersion`／`effectiveFrom` 等欄位作為稽核紀錄。

這與 3.60 節定案的狀態機定義完全一致，本輪未新增或變更任何欄位或狀態值——第十七輪的貢獻是把「附錄目前狀態＝尚不可用於正式資料」這個結論講得更直接，避免讀者誤以為「文件已載明治理欄位」等於「治理流程已經走完」。已在附錄 A 開頭既有揭露段落（見附錄開頭之「本附錄純屬外部事實查證記錄」聲明）之後，補上一句直接提醒：

> **附錄 A 所有列項目前 `approvalStatus` 皆為 `DRAFT`，在完成人類 Data Steward 複核（轉為 `VERIFIED`）與 Authorized Reviewer 正式核准（轉為 `APPROVED`）之前，不得作為正式銀行 Standing Data 匯入 `GET /countries/{code}` 等實際資料集。**

因純屬文件強調既有規則，不涉及 schema 或程式行為變更，無對應測試或 UAT 項目。

### 3.66 P3（第十七輪，非阻擋、評估後暫緩）：拆分「Approved Clean Baseline」與「Review History / Decision Log」兩份文件

第十七輪建議將本文件拆分為兩份：一份只保留最新架構、API 契約、業務規則與驗收條件的「Approved Clean Baseline」，另一份保留歷次問題、決策理由與版本演進的「Review History / Decision Log」，理由是目前單一文件累積十七輪審閱歷程後，對新加入的開發人員閱讀成本較高。

這個建議與第十輪 P2 建議（見第零節開頭之既有說明）方向完全一致，當時評估後**未採用完整拆分**，改採「新增不含輪次歸屬的第零節『目前生效規則總覽』作為精簡摘要，同時保留 section 三（3.1～3.63）與第七節作為完整 Review History／Changelog」這個折衷方案，理由是每一小節都附有具體 JSON 反例與程式驗證佐證，重新拆分為兩份實體文件有搬動既有內容、引入新錯誤的風險。

第十七輪重提此建議時，累積輪次已由第十輪的 9 輪增加到 17 輪，累積內容量與可讀性成本較當時更高，這個取捨的天平有持續往「值得拆分」的方向移動——但拆分為兩份實體文件仍然是一次性、影響全文件結構的大規模改版，涉及搬動 3.1～3.66 共 66 個小節、7 張表格與 1 個附錄，超出單一輪次審閱回應應承擔的變更範圍與風險（與 3.59 節評估 `CHANGELOG.md` 分離時的判斷邏輯一致）。本輪維持第零節既有折衷方案不變，並將此建議正式列入第七節追蹤項目：待後續輪次確認第零節摘要已無法滿足可讀性需求、且有餘裕承擔一次性大規模改版風險時，再正式執行拆分，而非本輪倉促拆分後才發現遺漏或引入新的不一致。因純屬文件結構評估、未拆分文件本身，不涉及 schema 或程式行為變更，無對應測試或 UAT 項目。

### 3.67 P2（第十八輪，非阻擋）：修正版本敘述中「未來進入 v1.0.0」易誤讀為版本倒退之用詞

第十八輪確認 v2.10.0 之 YAML、驗證腳本、相依套件宣告在本輪皆未變動（第十七輪的三項回應純屬文件澄清），136/136 語意測試與結構驗證維持不變，並指出 3.63 節與第七節item (10) 在說明「版本號分界點」時所用的文字存在一處敘述矛盾：這兩處都寫「若本設計未來正式進入 **v1.0.0** 對外發布……」，但本文件目前的 API Contract Version 已經是 **v2.10.0**——把「未來的首次正式發布版本」寫成具體的 `v1.0.0`，字面上會讓讀者誤以為版本號要從 `v2.10.0` 倒退到 `v1.0.0`，這不是本文件原本要表達的意思（原意是「首次正式對外發布、開始承諾向後相容」這個**事件**，不是某個特定版本號），但用詞確實會造成混淆。

已依審閱意見之方向修正：3.63 節與第七節 item (10) 中的「正式進入 v1.0.0 對外發布」，皆改為「首次正式對外發布」，不再指定具體版本號，並各自補上一句括號說明此為第十八輪之用詞修正、指向本節。修正後之完整語意為：

> 本設計目前的 `v2.x.0` 版本號序列，反映的是**設計審閱階段的迭代輪次**，與該設計未來正式對外發布後所採用的**產品／API 發布版本號**是兩套完全獨立的編號體系，兩者不假設有任何數字上的延續關係。首次正式對外發布、開始承諾向後相容性保證的那個時間點，才是 3.63 節所述「應改依 SemVer 規則評估 major version」規則生效的分界點；該次發布實際會採用哪一個版本號（是延續 `v2.x.0` 序列、重置為 `v1.0.0`、或採用完全不同的編號），屬於屆時由產品／發布治理流程另行決定的事項，不影響本節分界點規則本身的適用。

審閱意見另外提出的簡化寫法（`Internal Design Version` / `External Release Status` / `Compatibility Guarantee` 三個獨立欄位）**評估後未採用**：目前 3.63 節與第七節的敘述已經是完整的段落說明，改為三個獨立欄位需要在文件中新增一個結構化區塊、並回頭調整所有既往提及版本號規則之處的措辭一致性，屬於比單純修正一處易誤讀用詞更大幅度的文件結構調整，超出本輪應處理的範圍；若日後版本治理的複雜度持續提高（例如真的走到需要同時追蹤內部設計版本與對外發布版本兩條序號），三欄位式的結構化表達仍是可考慮的後續方向。

因純屬文件用詞修正，不涉及 schema 或程式行為變更，無對應測試或 UAT 項目。

### 3.68 P3（第十九輪，非阻擋）：3.67 節不應替尚未召開的產品／發布治理決策預先斷言具體立場

第十九輪確認第十八輪之修正（3.67 節，將「未來進入 v1.0.0 對外發布」改為不指定具體版本號之「首次正式對外發布」敘述）方向正確，且未影響 schema 或測試，本設計維持 Approved Design Baseline（9.9／10）。審閱意見進一步指出一項非阻擋性 P3：3.67 節的說明段落雖然不再指定具體版本號，但仍寫了「與……是**兩套完全獨立**的編號體系，兩者不假設有任何數字上的延續關係」——這句話看似中性，實際上已經替「內部設計版本號與對外發布版本號究竟要不要用同一套」這個屬於產品／發布治理團隊的決策，預先斷言了一個具體答案（「完全獨立」），如果日後產品團隊決定兩者其實要延續同一套序號，這句話就會與屆時的實際政策矛盾。

這個問題的性質與 3.55 節（第十四輪）處理「Country Calendar ID 是否永遠等於兩位國碼」的方式完全相同：本文件的角色是誠實記錄一個尚待確認的開放問題、說明它對本文件既有規則的影響，並列入第七節追蹤，而不是在沒有產品／治理團隊正式決定的情況下，替這類**產品政策層級**的問題預先下結論。3.67 節撰寫時，聚焦於修正「v1.0.0 易誤讀為版本倒退」這個字面用詞問題，但在說明過程中，順手多寫了「兩套完全獨立」這個其實尚未有人正式決定的具體立場，這是本文件自己在修正一個問題時，不小心引入了另一個同類型問題。

已將 3.67 節之說明段落改寫為不預設答案的版本：

> 本設計目前的 `v2.x.0` 版本號序列，反映的是**設計審閱階段的迭代輪次**。該設計未來正式對外發布後應採用的**產品／API 發布版本號**，究竟是延續同一套 `v2.x.0` 序列、或改採獨立於設計迭代輪次之外的另一套編號，本文件**不片面假設答案**——這屬於尚待產品／發布治理團隊視屆時實際情境正式決定之開放事項，性質與 3.55 節「Country Calendar ID 是否永遠等於兩位國碼」相同：本文件記錄開放問題與其對既有規則的影響，但不代為產品團隊做決定。無論屆時決定沿用或另立編號，可以確定的分界點是：**首次正式對外發布、開始承諾向後相容性保證**的那個時間點，才是 3.63 節所述「應改依 SemVer 規則評估 major version」規則生效的起點，這個分界點規則本身不因版本號最終編號方式而改變。

依既有之歷史記錄原則（3.59 節），3.67 節原文字本身不重寫，保留其作為第十八輪當下之修正記錄；本節之修正後文字，即為讀者查詢「版本號分界點」規則時應採用的最新、最終版本，第七節 item (10)／(12) 之交叉引用已一併指向本節。因純屬文件用詞之進一步收斂，不涉及 schema 或程式行為變更，無對應測試或 UAT 項目。

## 四、與既有 Trade Finance Baseline 之對應

`calendarSnapshotId`／`calendarVersions[]` 對應文件 Audit 資料群組之 Calendar Version 欄位；`calendarAssessments`／`adjustedDateAssessments` 搭配 `calendarSnapshotId` 可直接產生文件要求之「Calendar 更新應產生 Impact Report」；`contractualDateChanged: false` 對應並強化 `adjustmentScope=OPERATIONAL_PAYMENT_DATE_ONLY` 原先的保護意圖；錯誤代碼沿用並擴充第 16 節既有定義。

**Impact Report 職責釐清（P1-10，第四輪修正判斷邏輯）：** 「Calendar 更新後產生 Impact Report」涉及兩個系統，職責分工如下——Standing 負責提供產生報告所需的**原始資料**：`GET /calendars/{type}/{code}/holidays` 回傳異動前後之假日清單、`GET /calendars/{type}/{code}/completeness` 回傳資料涵蓋前瞻範圍、`calendarVersions[]`／`calendarSnapshotId` 提供版本對照基準；Standing **不**負責判斷「此次行事曆異動影響了哪些既有交易」——這是 Trade Finance 端的職責。

第三輪版本曾建議「撈出 `sourceDate` 落在新舊快照差異區間內的交易」，但第四輪審閱指出這會漏掉受影響交易：`sourceDate` 本身可能不在異動日期範圍內，但計算路徑（`sourceDate` 到 `adjustedDate` 之間，含所有 `skippedDates`）仍可能涵蓋異動日期。因此判斷邏輯修正為使用 3.27 節新增、並經 3.31 節（第五輪）修正定義之 `calculationWindowStartDate`／`calculationWindowEndDate`——計算區間為本次計算實際評估過之所有日期的最早與最晚日期，包括來源日、結果日、中間跳過日期，以及 `MODIFIED_*`／`NEAREST` 曾試探但未採用的日期，而非僅 `min`／`max(sourceDate, adjustedDate)` 兩個端點日期：**只要交易的計算區間與行事曆異動日期範圍有重疊，就應納入 Impact Report 候選清單**，而不是只比對 `sourceDate` 這一個時間點。實務流程為：Trade Finance 偵測到 Standing 發布新的 `calendarSnapshotId` → 撈出所有以舊 snapshot 計算過、且 `[calculationWindowStartDate, calculationWindowEndDate]` 與新舊快照差異區間有重疊的交易 → 逐筆重新呼叫 `/business-days/adjust`（帶入新 `calendarSnapshotId`）取得新結果 → 比對新舊 `adjustedDate` 是否不同，彙整成 Impact Report（見 UAT-46）。

## 五、查詢類端點總覽（GET，5 個端點）

第二輪審閱指出，YAML 中實際存在的 5 個查詢類端點在本文件先前版本的摘要中不夠顯著，容易讓 BA／QA／開發誤以為本服務只有兩個計算端點。以下補齊完整清單：

| 端點 | 用途 | 主要回應內容 | 錯誤情境 |
| --- | --- | --- | --- |
| `GET /calendars/{calendarType}/{code}/is-business-day` | 查詢單一日期在單一行事曆下是否為營業日 | `date`、`isBusinessDay`、`reasonCode`、`calendarVersion` | 404 `CALENDAR_NOT_FOUND`（第五輪由 `CALENDAR_NOT_CONFIGURED` 拆分而來，見 3.32 節；schema 已 narrow，見 3.44 節）；422 `CALENDAR_YEAR_NOT_AVAILABLE`（資料未涵蓋該日期；第十三輪起 schema 已 narrow 至此專屬碼，見 3.48 節）；403 `INSUFFICIENT_CALENDAR_SCOPE`（`INSTITUTION` 缺 scope） |
| `GET /calendars/{calendarType}/{code}/holidays` | 列出某行事曆在指定區間內的假日／非營業日清單，供 UI 顯示、Impact Report、缺口檢查使用 | `holidays[]`、`dataCompleteThrough`、`calendarVersion` | 404 `CALENDAR_NOT_FOUND`（schema 已 narrow）；400 `INVALID_DATE_RANGE`（第十三輪新增，查詢區間超過 366 天；366 天門檻本身為 SERVER-ENFORCED，見 3.49 節）；403 同上；**目前未定義 422**（第十二輪更正：先前版本誤稱本端點另有 422，見 3.45 節；若日後需要「查詢區間超出已載入年度即拒絕」，屬 API 契約擴充，列入第七節後續建議，與本次新增的 400 是兩個不同的問題） |
| `GET /calendars/{calendarType}/{code}/completeness` | 查詢該行事曆資料已核准涵蓋至何時 | `dataCompleteThrough`、`currentVersion`、`lastApprovedAt`、`lastApprovedBy` | 404 `CALENDAR_NOT_FOUND`（schema 已 narrow）；403 同上；**目前未定義 422**（同上，見 3.45 節） |
| `GET /currencies/{code}` | 幣別主檔（含預設清算行事曆代碼、Cut-off Time），成功回應要求 `code`／`name`／`minorUnitDecimals`（第五輪補上 `required[]`；`code` 與路徑參數第十三輪起改參照 `CurrencyCode` 元件（`^[A-Z]{3}$`），見 3.50 節） | `defaultClearingCalendarCode`、`cutOffTimes[]` | 404 `CURRENCY_NOT_FOUND`（第十二輪新增專屬碼並 schema-narrow，見 3.44 節；此前僅能借用語意不符的 `CALENDAR_NOT_FOUND`，或無合法碼可用）；401 `AUTHENTICATION_REQUIRED`（第四輪新增） |
| `GET /countries/{code}` | 國家主檔（含預設國家行事曆代碼、週末日定義、第十三輪新增之治理欄位），成功回應要求 `code`／`name`／`defaultCountryCalendarCode`／`weekendDays`／`effectiveFrom`／`calendarVersion`／`lastApprovedAt`／`sourceAuthority`（第五輪補上前四者 `required[]`，第十三輪新增後四者並列為必填，見 3.50 節；`weekendDays` 之 AE 範例已於第十二輪由過時的 `FRI`／`SAT` 修正為現行的 `SAT`／`SUN`，見 3.45 節；第十三輪起另加 `minItems`/`maxItems`/`uniqueItems`，見 3.46 節；`code` 第十三輪起改參照 `CountryCode` 元件（`^[A-Z]{2}$`），見 3.50 節；`defaultCountryCalendarCode` 第十三輪一度也改參照 `CountryCode`，第十四輪修正為獨立的 `CalendarCode` 元件（`^[A-Z0-9._-]+$`，2-50 字元），不再假設國家行事曆代碼必然等於兩位國碼，見 3.55 節） | `defaultCountryCalendarCode`、`weekendDays[]`、`effectiveFrom`、`calendarVersion`、`lastApprovedAt`、`sourceAuthority` | 404 `COUNTRY_NOT_FOUND`（第十二輪新增專屬碼並 schema-narrow，見 3.44 節）；401 `AUTHENTICATION_REQUIRED`（第四輪新增） |

五個查詢端點自 v2.1.0 起皆加上 `X-Correlation-ID` 請求參數與回應標頭（見 3.19 節，第五輪起該 header 元件並宣告 `required: true`，見 3.34 節）；三個行事曆查詢端點的 `404` 錯誤碼於第五輪由 `CALENDAR_NOT_CONFIGURED` 改為專屬的 `CALENDAR_NOT_FOUND`（見 3.32 節），第十二輪起額外以 `allOf`＋`enum` schema-narrow；`currencies`／`countries` 之成功回應 `required[]` 已於第五輪補齊（見 3.35 節），至此五個查詢端點的成功回應皆已具備完整必填欄位；`currencies`／`countries` 之 404 錯誤碼已於第十二輪由「無合法對應碼」修正為專屬的 `CURRENCY_NOT_FOUND`／`COUNTRY_NOT_FOUND`，同樣 schema-narrow（見 3.44 節）。`GET .../is-business-day` 的 422 已於第十三輪 schema-narrow 至 `CALENDAR_YEAR_NOT_AVAILABLE`；`GET .../holidays` 第十三輪新增 400 `INVALID_DATE_RANGE`；`GET .../holidays`、`GET .../completeness` 目前均未定義 422（第十二輪更正，見 3.45、3.48、3.49 節）。

## 六、UAT 測試矩陣（P1-7，含第二輪 UAT-21～UAT-40、第三輪 UAT-41～UAT-44、第四輪 UAT-45～UAT-49、第五輪 UAT-50～UAT-58、第六輪 UAT-59～UAT-60、第七輪 UAT-61、第八輪 UAT-62～UAT-63、第十二輪 UAT-64～UAT-67、第十三輪 UAT-68～UAT-78、第十四輪 UAT-79～UAT-80、第十五輪 UAT-81、第十六輪 UAT-82～UAT-83）

| 編號 | 測試情境 | 預期結果 |
| --- | --- | --- |
| UAT-01 | 一般營業日 | `adjustedDate = sourceDate` |
| UAT-02 | 國家公眾假日 | 依 convention 正確調整 |
| UAT-03 | 週末 | 順延或提前至合格營業日 |
| UAT-04 | 付款銀行營業、USD 清算休市 | Contractual Maturity Date 不變；Operational Payment Date 依 `ALL_REQUIRED_OPEN` 調整；`calendarAssessments` 正確標示兩者差異 |
| UAT-05 | 付款銀行休業、清算系統營業 | 依付款銀行行事曆調整 |
| UAT-06 | 多本必要行事曆，其一休市 | `ALL_REQUIRED_OPEN` 下判定為非營業日 |
| UAT-07 | `ANY_ELIGIBLE_OPEN`，僅單一機構開市但無完整 `pathGroup` | 不得判定為可行；須完整替代路徑齊備才成立 |
| UAT-08 | `MODIFIED_FOLLOWING` 跨月底且回退方向亦無可行日 | 回傳 409 `CALENDAR_CONFLICT`，不得默默跨月 |
| UAT-09 | 年底跨入下一年度 | 檢查下一年度行事曆是否完整 |
| UAT-10 | 下一年度尚未載入 | 回傳 422 `CALENDAR_YEAR_NOT_AVAILABLE`，不得預設為可營業 |
| UAT-11 | 新增臨時休市與既有假日衝突 | 回傳 409 `CALENDAR_CONFLICT` |
| UAT-12 | 歷史交易重算（指定 `calendarSnapshotId`） | 重現與原計算相同結果 |
| UAT-13 | 同日多次行事曆核准 | `asOfDateTime` 能區分不同時段之核准狀態 |
| UAT-14 | Standing 服務逾時 | 呼叫端最多額外重試 2 次（含 jitter） |
| UAT-15 | 多本行事曆版本不同 | `calendarVersions[]` 正確列出各自版本 |
| UAT-16 | 不可抗力事件休市 | 以 `FORCE_MAJEURE_EVENT` 標示且 `manualReviewRequired=true`，不得套用一般假日順延邏輯直接自動放行 |
| UAT-17 | 已核准之合約到期日 | 回應 `contractualDateChanged` 恆為 false |
| UAT-18 | `businessDays=0` | 依 `nonBusinessStartDateConvention` 定義回傳結果 |
| UAT-19 | `NEAREST` 前後距離相同 | 依既定 tie-break（`PRECEDING`）回傳結果 |
| UAT-20 | 未提供 `X-Correlation-ID` | 伺服器端產生並回寫於回應／錯誤物件之 `correlationId`，且出現在回應標頭 |
| UAT-21 | `contractualDateChanged: true` 之回應（模擬伺服器異常） | Schema 驗證即拒絕，不應到達呼叫端業務邏輯層 |
| UAT-22 | 回應缺漏 `calendarVersions` 等任一必填欄位 | Schema 驗證拒絕，視為服務異常而非「欄位剛好沒有資料」 |
| UAT-23 | `sourceDateType=CONTRACTUAL_MATURITY_DATE` 搭配 `calculationPurpose=EXAMINATION_DEADLINE` | 回傳 400 `INVALID_DATE_PURPOSE_COMBINATION` |
| UAT-24 | `sourceDateType=OTHER` 搭配 `calculationPurpose=OPERATIONAL_PAYMENT_DATE` | 回傳 400 `INVALID_DATE_PURPOSE_COMBINATION`（`OTHER` 僅能與 `OTHER` 配對） |
| UAT-25 | 同時提供 `calendarSnapshotId` 與 `asOfDateTime` | 回傳 400 `MUTUALLY_EXCLUSIVE_CALENDAR_VERSION_INPUTS` |
| UAT-26 | `/business-days/add` 同時提供 `calendarSnapshotId` 與 `asOfDateTime` | 同 UAT-25，兩端點行為一致 |
| UAT-27 | `combinationRule=ANY_ELIGIBLE_OPEN` 且 `calendars[]` 無任何 `pathGroup` | 回傳 422 `INCOMPLETE_PAYMENT_PATH_GROUP` |
| UAT-28 | `pathGroup` 內僅單一行事曆、且該行事曆非產品政策核准之獨立路徑 | 回傳 422 `INVALID_PAYMENT_PATH_GROUP` |
| UAT-29 | `calendars[]` 項目缺少 `role` | Schema 驗證拒絕（`role` 為必填） |
| UAT-30 | 請求含 `calendarType=INSTITUTION` 但 token 缺 `standing.calendars.institution.read` | 回傳 403 `INSUFFICIENT_CALENDAR_SCOPE` |
| UAT-31 | Token 缺 `standing.calendars.read`（基本 scope 都沒有） | 回傳 401 或 403，視 Gateway 判斷 token 是否有效 |
| UAT-32 | `GET .../is-business-day` 對 `calendarType=INSTITUTION` 之查詢，token 缺額外 scope | 回傳 403 `INSUFFICIENT_CALENDAR_SCOPE`（GET 端點與 POST 端點一致執行） |
| UAT-33 | 錯誤回應缺少 `retryable` 或 `correlationId` | Schema 驗證拒絕（兩者皆為必填） |
| UAT-34 | `/business-days/add` 觸發臨時休市衝突 | 回傳 409 `CALENDAR_CONFLICT`（與 `/business-days/adjust` 狀態碼一致） |
| UAT-35 | `/business-days/add` 因資料過期被拒 | 回傳 503 `CALENDAR_DATA_STALE`（與 `/business-days/adjust` 狀態碼一致） |
| UAT-36 | `CalendarAssessment.businessDay=false` 但缺少 `reasonCode` | Schema 驗證拒絕（`oneOf` 強制非營業日須帶 `reasonCode`） |
| UAT-37 | 回應缺少 `adjustedDateAssessments` | Schema 驗證拒絕（v2.1.0 起為必填欄位） |
| UAT-38 | `wasAdjusted=false`（sourceDate 本身即為營業日） | `adjustedDateAssessments` 內容應與 `calendarAssessments` 一致 |
| UAT-39 | `PAYMENT_NETWORK_OUTAGE` 事後解除、需重新計算 | 驗證 `automaticAdjustmentAllowed=false` 情境下系統不得自動覆寫先前結果，須走人工重算流程 |
| UAT-40 | Impact Report：新 `calendarSnapshotId` 發布後重算既有交易 | Trade Finance 端以新 snapshot 重呼叫 `/business-days/adjust`，比對新舊 `adjustedDate` 差異，彙整受影響交易清單（見第四節） |
| UAT-41 | `sourceDate` 或 `adjustedDate` 命中 `FORCE_MAJEURE_EVENT` | `/business-days/adjust` 回傳 422 `MANUAL_REVIEW_REQUIRED`，不得回傳 200 與已算出之日期 |
| UAT-42 | 回應宣稱 `FORCE_MAJEURE_EVENT` 但 `manualReviewRequired=false` 或 `automaticAdjustmentAllowed=true` | Schema 驗證拒絕（`oneOf` 強制正確旗標值） |
| UAT-43 | 成功回應之 `calendarVersions`／`calendarAssessments`／`adjustedDateAssessments` 為空陣列 | Schema 驗證拒絕（`minItems: 1`） |
| UAT-44 | 缺少或無效之存取權杖 | 回傳 401 `AUTHENTICATION_REQUIRED`；任何 4xx／5xx 回應皆應於標頭中帶有 `X-Correlation-ID`（HTTP 層測試，非本腳本涵蓋範圍） |
| UAT-45 | `FORCE_MAJEURE_EVENT` 出現在 `sourceDate`／`adjustedDate` 之間的中間日期（會被跳過、原本會列入 `skippedDates`） | `/business-days/adjust` 仍應回傳 422 `MANUAL_REVIEW_REQUIRED`，不得只檢查頭尾兩端而放行 |
| UAT-46 | `sourceDate` 不在行事曆異動日期範圍內，但 `calculationWindowStartDate`／`calculationWindowEndDate` 與異動範圍有重疊 | 該交易仍應出現在 Impact Report 候選清單中（見第四節） |
| UAT-47 | 起算日為週二（營業日）＋`businessDays=5`＋`includeStartDate=false` | 結果為次週二 |
| UAT-48 | 起算日為週二（營業日）＋`businessDays=5`＋`includeStartDate=true` | 結果為次週一（比 UAT-47 早一個營業日） |
| UAT-49 | 起算日為週六（非營業日）＋`businessDays=1`＋`FOLLOWING`，分別測試 `includeStartDate=true`／`false` | 兩種設定皆先由 `nonBusinessStartDateConvention` 將起算日調整至週一，再依 `includeStartDate` 計數，結果應分別驗證 |
| UAT-50 | `MODIFIED_FOLLOWING` 先往次月方向試探後跨月，改回退至前一營業日 | `calculationWindowStartDate`／`calculationWindowEndDate` 須涵蓋實際試探過的次月日期，不能只涵蓋 `sourceDate`／`adjustedDate` 兩端 |
| UAT-51 | `NEAREST` 同時檢查前後兩個方向、最終擇一 | `calculationWindow` 須涵蓋兩側實際評估過的日期 |
| UAT-52 | `FORCE_MAJEURE_EVENT` 且 `closureStatus=ACTIVE`（或省略） | `/business-days/adjust` 回傳 422 `MANUAL_REVIEW_REQUIRED` |
| UAT-53 | `FORCE_MAJEURE_EVENT` 且 `closureStatus=RESOLVED` 或 `CANCELLED` | 依產品政策決定是否允許回傳 200；`skippedDates`／`calendarAssessments` 中該筆紀錄之 schema 本身合法，不因歷史事件而阻擋回應格式 |
| UAT-54 | 任一成功或錯誤回應未於 HTTP 標頭實際帶有 `X-Correlation-ID` | Integration Test 應判定失敗（`required: true` 為文件宣告，實際送出與否需另立測試層驗證，見 3.34 節） |
| UAT-55 | `GET /currencies/{code}` 成功回應缺少 `code`／`name`／`minorUnitDecimals` 任一者 | Schema 驗證失敗 |
| UAT-56 | `GET /countries/{code}` 成功回應缺少 `weekendDays` | Schema 驗證失敗 |
| UAT-57 | 查詢不存在的 `calendarType`／`code` 組合 | 回傳 404 `CALENDAR_NOT_FOUND`（三個行事曆查詢端點） |
| UAT-58 | `/business-days/adjust`／`/business-days/add` 缺少計算所需之必要行事曆設定 | 回傳 422 `CALENDAR_NOT_CONFIGURED`，與 UAT-57 之 404 `CALENDAR_NOT_FOUND` 明確區分 |
| UAT-59 | `CalendarAssessment.businessDay=true` 同時帶有 `reasonCode=FORCE_MAJEURE_EVENT`／`manualReviewRequired=true`／`automaticAdjustmentAllowed=false`／`closureStatus`+`resolvedAt` 任一者 | Schema 驗證拒絕（3.36 節 `allOf`／`oneOf` 強制互斥） |
| UAT-60 | `CalendarAssessment` 或 `skippedDates[]` 項目之 `closureStatus=RESOLVED`／`CANCELLED` 卻缺少 `resolvedAt`，或 `closureStatus` 省略／`ACTIVE` 卻帶有 `resolvedAt` | Schema 驗證拒絕（3.37 節 `oneOf` 強制對應） |
| UAT-61 | 任一 `format: date`／`date-time` 欄位帶有行事曆上不存在的日期或無效時間戳（如 `sourceDate=2026-02-30`、`resultDate=2027-02-29`、`resolvedAt="not-a-valid-timestamp"`） | Schema 驗證拒絕（3.38 節，驗證器已啟用 `format_checker`） |
| UAT-62 | 閏年／跨年邊界日期（`resultDate=2028-02-29` 合法；`startDate=2026-12-31`→`resultDate=2027-01-01` 合法跨年） | Schema 驗證通過（3.40 節） |
| UAT-63 | `resolvedAt`／`asOfDateTime` 使用 RFC 3339 `Z`（UTC）後綴，或缺少時區資訊之裸時間字串 | 前者 Schema 驗證通過，後者拒絕（3.40 節） |
| UAT-64 | 查詢不存在的 Currency 代碼（`GET /currencies/{code}`） | 回傳 404 `CURRENCY_NOT_FOUND`；回傳 `CALENDAR_NOT_FOUND`／`COUNTRY_NOT_FOUND` 為 Schema 驗證拒絕（3.44 節） |
| UAT-65 | 查詢不存在的 Country 代碼（`GET /countries/{code}`） | 回傳 404 `COUNTRY_NOT_FOUND`；回傳 `CALENDAR_NOT_FOUND`／`CURRENCY_NOT_FOUND` 為 Schema 驗證拒絕（3.44 節） |
| UAT-66 | AE（UAE）Country Calendar 於 2022-01-01 之後，Saturday／Sunday 均應判定為非營業日（現行 `weekendDays=[SAT, SUN]`） | `GET /countries/AE` 回傳 `weekendDays: ["SAT", "SUN"]`；`enum` 本身早已允許此值，屬資料正確性修正而非 schema 表達力缺口（3.45 節） |
| UAT-67 | 對 2022-01-01 之前的 AE 歷史交易重新計算到期日（historical snapshot recalculation） | 應依交易當時實際有效之週末制度（Friday／Saturday）判斷，透過 COUNTRY 行事曆之 `calendarVersion`／`asOfDateTime` 機制取得歷史版本，而非 `GET /countries/{code}` 回傳之靜態現況 `weekendDays`（3.45 節；服務端邏輯，非本 OAS 現有 schema 可直接強制） |
| UAT-68 | `GET /countries/{code}` 回應之 `weekendDays` 為空陣列 `[]` | Schema 驗證拒絕（`minItems: 1`，3.46 節） |
| UAT-69 | `weekendDays` 含重複日（如 `["SAT", "SAT"]`） | Schema 驗證拒絕（`uniqueItems: true`，3.46 節） |
| UAT-70 | `weekendDays` 七天全選 | Schema 驗證拒絕（超過 `maxItems: 3`，3.46 節） |
| UAT-71 | `weekendDays` 含非法值（如 `"HOLIDAY"`） | Schema 驗證拒絕（`enum` 本已涵蓋，3.46 節確認負向案例） |
| UAT-72 | `CalendarReference.pathGroup` 為空字串 `""` | Schema 驗證拒絕（`minLength: 1`，3.47 節） |
| UAT-73 | `pathGroup` 含空白字元或超過 50 字元 | Schema 驗證拒絕（`pattern`／`maxLength`，3.47 節） |
| UAT-74 | `GET .../is-business-day` 422 回應使用非 `CALENDAR_YEAR_NOT_AVAILABLE` 之其他 errorCode（如 `MANUAL_REVIEW_REQUIRED`） | Schema 驗證拒絕（3.48 節，schema-narrow 至專屬碼） |
| UAT-75 | `GET .../holidays` 查詢區間 `to` 減 `from` 超過 366 天 | 應回傳 400 `INVALID_DATE_RANGE`（3.49 節；366 天門檻本身為 SERVER-ENFORCED，僅回應形狀為 schema 契約） |
| UAT-76 | `GET /countries/{code}` 回應缺少 `effectiveFrom`／`calendarVersion`／`lastApprovedAt`／`sourceAuthority` 任一者 | Schema 驗證拒絕（3.50 節，四者皆為新增必填欄位） |
| UAT-77 | `GET /currencies/{code}`／`GET /countries/{code}` 之 `code` 為小寫或長度錯誤（如 `"usd"`、`"UAE123"`） | Schema 驗證拒絕（`CurrencyCode`／`CountryCode` pattern，3.50 節） |
| UAT-78 | `AdjustBusinessDayRequest`／`AddBusinessDaysRequest` 帶有未知欄位（如拼字錯誤的 `sourceData`） | Schema 驗證拒絕（`additionalProperties: false`，3.51 節） |
| UAT-79 | `BicCode` 第 5–6 碼（國碼區段）為數字（如 `"BANK12XX"`、`"12345678"`） | Schema 驗證拒絕（`BicCode` pattern 已修正強制此區段為英文字母，3.54 節） |
| UAT-80 | `GET /countries/{code}` 之 `defaultCountryCalendarCode` 為非兩位國碼格式之識別碼（如 `"AE_FEDERAL"`） | Schema 驗證通過（已由 `CountryCode` 鬆綁為 `CalendarCode`，3.55 節；小寫、過短等仍拒絕） |
| UAT-81 | `CalendarReference` 之 `code` 與 `calendarType` 組合是否符合對應格式（如 COUNTRY 配 3 碼幣別碼、INSTITUTION 配 2 碼國碼、跨分支之 BIC 形狀代碼配 COUNTRY） | Schema 驗證依 `oneOf` 判別聯集拒絕不符組合、通過符合組合（3.56 節提出此判別聯集架構；**第十六輪更正：COUNTRY／FINANCIAL_CENTER 與 CURRENCY_CLEARING 三者實際使用之元件已改為 3.61 節之 `CalendarCode`，CURRENCY_CLEARING 不再是刻意不設格式限制，本列之「3 碼幣別碼」反例與判別依據請以 3.61 節之最新版本為準**） |
| UAT-82 | `CalendarReference` 之 COUNTRY／FINANCIAL_CENTER 分支帶有非兩位國碼之識別碼（如 `"AE_FEDERAL"`、`"MY_KEDAH"`），或 CURRENCY_CLEARING 分支帶有清算系統識別碼（如 `"USD_FEDWIRE"`） | Schema 驗證通過（3.61 節，COUNTRY／FINANCIAL_CENTER／CURRENCY_CLEARING 三者已統一改用寬鬆之 `CalendarCode`，與 `defaultCountryCalendarCode` 之既有設計一致）；空字串、單一字元、小寫等仍拒絕 |
| UAT-83 | `CalendarVersionRef.code`、`CalendarAssessment.code`（`calendarVersions[]`／`calendarAssessments[]`／`adjustedDateAssessments[]` 內） 與 `calendarType` 組合是否符合對應格式，以及既有 `CalendarAssessment` Group 1／Group 2 回歸案例是否受新增第三組 `oneOf` 影響 | Schema 驗證依與 UAT-82 相同之判別聯集規則拒絕不符組合、通過符合組合；既有 Group 1／Group 2 之 5 項回歸案例維持原判定結果不變（3.62 節） |

## 七、後續建議

下一步：(0) 待產品政策正式確認「Country Calendar ID 是否永遠等於 ISO 兩位國碼」（見 3.55 節）——若確認永遠相等，`defaultCountryCalendarCode` 可收緊回 `CountryCode`；若確認是獨立識別碼體系，目前的 `CalendarCode` 已可直接沿用，此為第十四輪 P2 遺留的開放決策，非本文件片面決定；(1) 將本 UAT 矩陣（含 UAT-21～83）與既有 Trade Finance Baseline 文件之 UAT 案例整併，並評估把本服務合約併入該文件作為附錄章節，使兩份文件維持單一事實來源；(2) 評估將本服務 OpenAPI 版本自 3.0.3 升級至 3.1（完整對齊 JSON Schema 2020-12）——**第十五輪修正說明（3.56 節）**：此項過去的敘述過於樂觀籠統，混雜了三種性質不同的限制，需分開看待：**（a）3.1 真的能解決的**——3.16 節之「`ANY_ELIGIBLE_OPEN` 時 `calendars[]` 至少需一筆 `pathGroup`」與 3.33 節之「`closureStatus=ACTIVE` 之不可抗力不得出現於陣列中」，本質是陣列存在性規則，`contains`（搭配 `not` 表達後者）確實只需等 3.1，不需服務端邏輯即可宣告式表達陣列形狀本身；**（b）已在本輪、不必等 3.1 就解決的**——`CalendarReference.code` 依 `calendarType` 之條件式格式（原本誤判為需要 3.1，見 3.56 節），因為 `calendarType`／`code` 是同一個 schema 物件內的兩個屬性，`oneOf` 在 OAS 3.0.3 即可表達，已直接實作，不再列入此處的「等 3.1」清單；**（c）無論版本都無法宣告式表達、必須服務端或客製驗證器處理的**——3.50 節之 `CalendarCodePath` 依 `calendarType` 條件式格式規則，因為這是**兩個獨立的 Parameter Object**（不是同一個 schema 物件內的兩個屬性），`oneOf`／`if`/`then` 都只能約束單一 schema 物件內的屬性，無法跨兩個獨立的 Parameter Object 判斷，這與 OAS／JSON Schema 版本無關；3.49 節之 366 天區間門檻同樣屬於此類——比較 `from`／`to` 兩個查詢參數的實際值、算出天數差，是日期**運算**而非結構性條件判斷，標準 JSON Schema（即使是 2020-12 全集）本身並未提供日期相減與數值門檻比較的內建關鍵字，`if`/`then` 能表達的是「某欄位等於某值時, 要求另一欄位符合某形狀」這類結構性條件，不是「兩個欄位的值相減後與常數比較」這類算術條件，因此即使升級到 3.1，這兩項規則仍然是 SERVER-ENFORCED，不會自動變成宣告式約束；3.47 節之「同一 `pathGroup` 不得重複同一行事曆」規則也屬於此類——這是「群組內任兩筆記錄的特定欄位組合是否重複」的跨項目成對比對，標準 JSON Schema 沒有「依某欄位分組、组內比對」的關鍵字，`contains` 只能斷言「陣列中存在（或不存在）符合某形狀的至少一筆」，無法表達「组內任兩筆彼此不可重複」，同樣與版本無關，維持 SERVER-ENFORCED。實際評估升級與否時，仍需先確認內部 API Gateway／程式碼產生器工具鏈是否已支援 OAS 3.1，且即使升級，(c) 類規則仍須服務端或客製驗證器補上，升級本身不是這幾項規則的完整解方；(3) 落實 3.17 節所述之 Gateway 層 `INSUFFICIENT_CALENDAR_SCOPE` 檢查、3.21／3.26／3.33 節所述之 `MANUAL_REVIEW_REQUIRED` fail-closed 邏輯（含中間日期掃描與 `closureStatus` 判斷）、3.27／3.31 節所述之 Impact Report 區間重疊查詢邏輯（含 `MODIFIED_*`／`NEAREST` 之完整試探日期集合）、3.36／3.37 節所述之 `CalendarAssessment`／`skippedDates[]` 一致性規則、3.40 節所述之 `calculationWindowStartDate`≤`calculationWindowEndDate` 與「`resolvedAt` 不得晚於實際計算時間」兩項跨欄位／跨時間規則、3.45 節所述之「歷史交易應依當時有效週末制度重算」邏輯（UAT-67，透過 COUNTRY 行事曆 `calendarVersion`／`asOfDateTime`）、3.49 節所述之 366 天區間上限、3.47 節所述之 `pathGroup` 重複檢查、3.50 節所述之 `CalendarCodePath` 條件式格式驗證，皆為實際程式碼；(4) 服務端實作完成後，將本文件第六節 UAT 矩陣逐一轉為自動化契約測試（contract test），與本次交付之 `validate_semantics.py` 正、反向 schema 驗證腳本（現為 136 項，56 正向、80 反向，含 3.38／3.40 節之 `format: date`／`date-time` 檢查與邊界案例、3.44 節新增之 Currency／Country 404 錯誤碼專用測試，3.46～3.51 節第十三輪新增之測試，3.54／3.55 節第十四輪新增之 `BicCode`／`defaultCountryCalendarCode` 測試，3.56 節第十五輪新增之 `CalendarReference.code` `oneOf` 測試，以及 3.61／3.62 節第十六輪修正、新增之 `CalendarReference.code`／`CalendarVersionRef.code`／`CalendarAssessment.code` 測試）並列執行，並確保 CI 安裝 `requirements-dev.txt` 時使用 `jsonschema[format-nongpl]`（見 3.39 節之 fail-fast 檢查），作為 CI 的一部分；(5) 若產品面確認需要對「`holidays` 查詢區間超出已載入年度」提供明確錯誤（而非目前的空陣列或既有 404），應另立需求評估新增 `GET .../holidays` → 422 `CALENDAR_YEAR_NOT_AVAILABLE`，此為 API 契約擴充，需經產品與本文件審閱流程正式核准後才可實作（3.45 節，第十二輪 P2 相關討論；與 3.49 節第十三輪新增的 400 `INVALID_DATE_RANGE` 是兩個不同的問題，不應合併處理）；(6) 若產品面確認 `GET .../holidays` 未來需要支援極長區間查詢（而非僅拒絕），應評估新增 `page`／`pageSize`／`nextPageToken` 分頁機制，此為第十三輪審閱意見提出之替代方案，本輪刻意未採用（見 3.49 節），屬於比單純加上區間上限更大的 API 介面決策，應待有明確產品需求時單獨設計審閱；(7) `GET /countries/{code}` 新增之 `sourceAuthority` 欄位目前為 pattern 限制的自由字串，待產品／維運團隊定義出完整的來源權威分類後，評估改為封閉式 `enum`（見 3.50 節）；(8)（**第十五輪列為待處理、第十六輪已完成，保留於此作稽核追溯**）`CalendarVersionRef.code` 與 `CalendarAssessment.code` 原本具有與 `CalendarReference.code`（3.56 節）相同的多型格式問題，第十五輪評估後刻意未一併處理，理由是 `CalendarAssessment` 已有兩組獨立的 `allOf`／`oneOf`（3.36／3.37 節），疊加第三組跨欄位規則有互相干擾風險，需在能完整重跑既有 5 項相關測試確認無回歸時再處理——第十六輪審閱意見主動提出此項一致性要求，已在同一輪完成：`CalendarVersionRef` 直接比照 3.56／3.61 節擴充，`CalendarAssessment` 以獨立的第三組 `allOf` 成員新增並完整重跑既有 5 項回歸案例確認無干擾，詳見 3.62 節；(9) 3.59 節提及之 `CHANGELOG.md` 分離方案，本輪評估後未採用，但列為後續累積更多輪次後可重新評估之選項；(10) 3.63 節提出之版本號分界點——本設計目前仍屬 pre-release 設計迭代階段，故收緊既有欄位格式（如本輪 CURRENCY_CLEARING、`CalendarVersionRef`、`CalendarAssessment` 三處）沿用次版本號；一旦本設計首次正式對外發布、有外部消費者需要相容性保證後，任何再收緊既有欄位格式的變更都應改依 SemVer 規則評估 major version，此分界點與轉換規則已列入追蹤，待正式發布時點到達時據以執行（**第十八輪 P2 修正**：本項原文字以 `v1.0.0` 具體指稱該次正式發布版本，與本文件目前 `v2.x.0` 之設計迭代版本序號並列易誤讀為版本倒退，已改為不指定具體版本號之敘述，詳見 3.67 節）；(11) 第十七輪提出之三項非阻擋性 P2／P3 建議中，前兩項（Approved Design Baseline 與 Production Readiness Approval 之範圍區分、附錄 A 正式核准流程重申）已於本輪以第零節與附錄 A 開頭之明確聲明方式完成，見 3.64、3.65 節；第三項（Clean Baseline／Review History 文件拆分）評估後維持第零節既有折衷方案不變、暫緩執行，正式列入本節追蹤，待後續輪次累積更多內容、且有餘裕承擔一次性大規模改版風險時再重新評估，見 3.66 節；(12) 第十八輪指出之版本敘述矛盾（`v1.0.0` 字面上易誤讀為相對於 `v2.10.0` 之版本倒退）已修正，詳見 3.67 節；(13) 第十九輪指出 3.67 節之修正說明本身仍替「內部設計版本號與對外發布版本號是否延續同一序列」這項尚未召開的產品／發布治理決策預先斷言「完全獨立」之具體立場，已改為與 3.55 節相同之開放式處理方式（記錄問題、不代為決定），詳見 3.68 節——關於版本號分界點之最新、最終規則說明，應以 3.68 節為準。

**版本與審閱狀態總表（呼應第七輪 P2 建議，統一記載避免同一輪次出現兩個分數）：**

| 規格版本 | 對應審閱輪次 | 該輪評分 | 核准狀態 |
| --- | --- | --- | --- |
| v2.3.0 | 第四輪 | 9.7／10 | Approved Design Baseline |
| v2.4.0 | 第五輪 | 9.8／10 | （後續由第六輪重新審視） |
| v2.4.0 | 第六輪（重新審視） | 9.7／10 | Conditionally Approved |
| v2.5.0 | 第七輪 | 9.8／10 | Approved Design Baseline |
| v2.5.0 | 第八輪 | 9.9／10 | Approved Design Baseline |
| v2.5.0 | 第九輪 | 9.8／10（`_resolver=` 私有 API 與相依套件下限兩項風險，第十輪指出並已修正） | Approved Design Baseline |
| v2.5.0 | 第十輪 | 9.9／10 | Approved Design Baseline |
| v2.5.0 | 第十一輪 | 9.9／10（無新增 P0／P1；兩項非阻擋 P2 已一併處理） | Approved Design Baseline |
| v2.6.0 | 第十二輪 | 9.6／10（兩項真正業務／API 契約層 P1，非驗證工具鏈問題；修正後預期回到 9.9／10） | Conditionally Approved |
| v2.7.0 | 第十三輪 | 9.6／10（四項邊界情況／治理性質 P1，無 P0；修正後預期達 9.8／10） | Approved with Minor P1 Enhancements |
| v2.8.0 | 第十四輪 | 9.7／10（一項 P1 集中於附錄 A 外部查證品質，非 schema 契約；兩項非阻擋性 P2；修正後預期達 9.9／10） | Approved with One P1 Correction |
| v2.9.0 | 第十五輪 | 9.8／10（兩項 P1：附錄 A 之以色列 TASE 事實錯誤、OAS 3.1 能力說明過度樂觀；三項 P2；修正後預期達 9.9／10） | Approved Design Baseline |
| v2.10.0 | 第十六輪 | 9.7／10（一項 P1：`CalendarReference.code` 對 COUNTRY／FINANCIAL_CENTER 過度限制，與 `defaultCountryCalendarCode` 矛盾，屬第十五輪新增 `oneOf` 自身之內部不一致；三項 P2；修正後預期達 9.9／10） | Conditionally Approved |
| v2.10.0 | 第十七輪 | 9.9／10（無未解決之 P0／P1；三項非阻擋性 P2／P3：Design Baseline 與 Production Readiness 範圍區分、附錄 A 正式核准流程重申、文件拆分之再評估，皆以文件澄清方式回應） | Approved Design Baseline |
| v2.10.0 | 第十八輪 | 9.9／10（無未解決之 P0／P1；一項非阻擋性 P2：版本號分界點敘述之「未來進入 v1.0.0」易誤讀為版本倒退，已修正用詞） | Approved Design Baseline |
| v2.10.0 | 第十九輪 | 9.9／10（無未解決之 P0／P1；一項非阻擋性 P3：3.67 節之修正說明仍替未召開之產品／發布治理決策預先斷言具體立場，已改為開放式處理） | Approved Design Baseline |

本節所列事項屬於 baseline 核准後的 implementation follow-up，不影響 v2.5.0 baseline 本身的核准狀態。第八～十一輪之修正（3.39～3.43 節與第零節）僅涉及 `requirements-dev.txt`、`validate_semantics.py` 與本文件，`standing-calendar-service.oas.yaml` 之 schema 本身未變動，版本號依 3.38 節相同理由維持 v2.5.0。**第十二輪則與第八～十一輪性質不同**：本輪（3.44／3.45 節）對 `standing-calendar-service.oas.yaml` 做了實質的 schema／API 契約變更——新增 `CURRENCY_NOT_FOUND`／`COUNTRY_NOT_FOUND` 兩個 `errorCode` enum 成員、對 5 個既有 404 回應施加 `allOf`＋`enum` 的逐端點收斂約束、修正 `GET /countries/{code}` 之 `weekendDays` 範例資料——因此版本號依語意化版本規則正確地由 v2.5.0 提升至 v2.6.0，而非沿用前四輪「僅工具鏈／文件」性質的版本凍結慣例。**第十三輪同樣涉及真正的 schema／API 契約變更**（3.46～3.52 節）：`weekendDays`／`pathGroup` 新增陣列與字串層級約束、新增一個 errorCode（`INVALID_DATE_RANGE`）並將其與既有的 `CALENDAR_YEAR_NOT_AVAILABLE` 分別 narrow 到兩個回應、`GET /countries/{code}` 新增 4 個必填欄位、新增 3 個共用格式元件、兩個計算端點新增 `additionalProperties: false`——因此版本號依語意化版本規則由 v2.6.0 提升至 v2.7.0，同屬真正的契約變更而非工具鏈／文件性質的修訂。**第十四輪則是混合性質**：其主要 P1（附錄 A 之外部查證品質）純屬文件層級修正，不涉及 `standing-calendar-service.oas.yaml` 本身；但兩項 P2（`BicCode` pattern 修正、`defaultCountryCalendarCode` 改參照新增的 `CalendarCode` 元件）確實變更了 schema 本身（見 3.54、3.55 節），因此版本號依語意化版本規則由 v2.7.0 提升至 v2.8.0，而非因為主要意見是文件性質就凍結版本號——版本號升降只跟隨 schema 是否實際變動，與該輪主要意見的性質無關，這與第八～十一輪「全部意見皆為文件／工具鏈性質，故版本號凍結」的情況不同。**第十五輪同樣是混合性質，但與第十四輪的比例相反**：兩項 P1 中，附錄 A 之以色列 TASE 修正（3.57 節）純屬文件層級；但 OAS 3.1 能力說明過度樂觀（3.56 節）這一項，其修正**不只是改文字**，而是直接在 `standing-calendar-service.oas.yaml` 中把 `CalendarReference.code` 改為 `oneOf` 判別聯集這個真正的 schema 契約變更，另外在實作過程中還自行發現並修正了 `CalendarCodePath` 說明文字的既存錯誤——因此版本號依語意化版本規則由 v2.8.0 提升至 v2.9.0，與第十四輪「文件層級主意見＋兩項獨立 P2 schema 變更」的結構相似，但這次主要的 P1 本身就直接牽動 schema。**第十六輪則是純粹的 schema 契約修正**（3.61／3.62 節）：`CalendarReference.code` 之判別聯集分支調整（COUNTRY／FINANCIAL_CENTER 改參照 `CalendarCode`、CURRENCY_CLEARING 併入同一分支）、`CalendarVersionRef`／`CalendarAssessment` 新增相同判別聯集，皆是對已核准之 v2.9.0 schema 的直接修改，無附錄或其他純文件層級意見；其中 COUNTRY／FINANCIAL_CENTER 分支之調整方向是鬆綁（相容），CURRENCY_CLEARING 與 `CalendarVersionRef`／`CalendarAssessment` 三處新增之格式約束方向是收緊（見 3.63 節之完整分析）——版本號依語意化版本規則由 v2.9.0 提升至 v2.10.0，並依 3.63 節之理由維持次版本號升級而非 major version。**第十七輪與第八～十一輪性質相同**：確認 v2.10.0 之修正完整、無新增 P0／P1，三項建議（3.64～3.66 節）皆屬文件澄清與強調，未變動 `standing-calendar-service.oas.yaml` 之 schema 本身，版本號依相同理由維持 v2.10.0 不變。**第十八輪同樣屬於此類**：指出的一項 P2（3.67 節之版本敘述用詞修正）純屬文件內部一致性用詞調整，未變動 schema 或測試，版本號依相同理由維持 v2.10.0 不變。**第十九輪亦同**：指出的一項 P3（3.68 節之開放式處理原則修正）同樣純屬文件用詞收斂，版本號依相同理由維持 v2.10.0 不變。

**建議測試分層（第三輪審閱建議）：** 目前僅 Schema 這一層有自動化腳本（`validate_semantics.py`）；其餘四層仍待落實，列為後續開發階段的測試計畫依據：

| 測試層 | 主要範圍 | 目前狀態 |
| --- | --- | --- |
| Schema tests | `required`／`enum`／`oneOf`／`allOf`／`not`／`minItems`／`maxItems`／`uniqueItems`／`minLength`／`maxLength`／`pattern`／`additionalProperties`／`format`（`date`／`date-time`，第七輪起實際啟用並附 fail-fast 相依檢查），第十二輪起另含 5 個 404 回應之逐端點 `errorCode` 收斂測試（UAT-64／65），第十三輪起另含 `weekendDays`／`pathGroup` 邊界值、`is-business-day` 422 與 `holidays` 400 之 errorCode 收斂、`GET /countries/{code}` 治理欄位必填性、代碼格式 pattern、`additionalProperties: false` 等測試（UAT-68～78），第十四輪起另含 `BicCode` 國碼區段字母限制、`defaultCountryCalendarCode` 鬆綁後之邊界測試（UAT-79～80），第十五輪起另含 `CalendarReference.code` 依 `calendarType` 之 `oneOf` 判別聯集測試（UAT-81），第十六輪起另含該判別聯集之修正版本測試，以及延伸至 `CalendarVersionRef.code`／`CalendarAssessment.code` 之對應測試與既有 `CalendarAssessment` 兩組回歸案例之重跑確認（UAT-82～83） | 已有 `validate_semantics.py`，136 項正／反向案例（56 正向、80 反向） |
| Service tests | `pathGroup` 完整性與政策核准、同一 `pathGroup` 內不得重複同一行事曆（3.47 節）、`calendarSnapshotId` 固定重算、日期演算法（Convention 邊界情況）、`calculationWindowStartDate`≤`EndDate`、`resolvedAt` 不得晚於實際計算時間（3.40 節）、`GET .../holidays` 366 天區間門檻之實際檢查（3.49 節）、`CalendarCodePath` 依 `calendarType` 條件式格式驗證（3.50／3.56／3.61 節，因跨兩個獨立 Parameter Object，即使升級 OAS 3.1 仍需此層測試）、`BicCode` 國碼區段是否為真實存在之 ISO 3166-1 代碼（3.54 節，regex 僅能驗證是英文字母，無法驗證真實存在性）、CURRENCY_CLEARING 代碼是否為真實存在之結算系統識別碼（3.61 節起已有 `CalendarCode` 之基本格式約束，但 regex 仍無法驗證是否為真實存在之結算系統） | 待開發階段補上單元測試 |
| Gateway tests | OAuth scope 條件判斷（`INSTITUTION`）、401／403 錯誤碼 | 待 Gateway 層程式碼完成後補上整合測試 |
| Integration tests | Standing 與 Trade Finance 之間實際 request／response 往返 | 待雙方端點皆可部署後執行 |
| UAT | Contractual／Operational Date 區分、Impact Report、不可抗力人工審查流程、Currency／Country 404 錯誤碼、AE 週末制度時效性、`weekendDays`／`pathGroup` 邊界情況、日期區間上限、參考資料治理欄位、BIC 格式與行事曆代碼識別體系、`CalendarReference.code`／`CalendarVersionRef.code`／`CalendarAssessment.code` 判別聯集一致性 | 本文件第六節已列出 UAT-01～83，待人工執行 |

## 附錄 A：Friday／Saturday 週末國家名單之外部查證（第十三輪新增、第十四輪修正、第十五輪再修正）

> 背景：審閱過程中提出一份「週末採用非 Saturday／Sunday 制度」的 14 國參考表（沙烏地阿拉伯、巴林、科威特、卡達、阿曼、約旦、埃及、阿爾及利亞、伊拉克、以色列、孟加拉、馬爾地夫、巴勒斯坦、敘利亞），用意與 3.45 節之 AE 案例相同：驗證此類「週末日定義」參考資料是否為目前（截至查證當下）實際生效之現況，避免重蹈 AE 範例曾經過時的錯誤。**本附錄純屬外部事實查證記錄，不代表這些國家／範疇目前已建模於本 OAS 或 `validate_semantics.py`——目前 OAS 唯一已建模的國別範例仍只有 AE。**
>
> **第十七輪 P2 重申（3.65 節）：附錄 A 所有列項目前 `approvalStatus` 皆為 `DRAFT`，在完成人類 Data Steward 複核（轉為 `VERIFIED`）與 Authorized Reviewer 正式核准（轉為 `APPROVED`）之前，不得作為正式銀行 Standing Data 匯入 `GET /countries/{code}` 等實際資料集。**
>
> **第十四輪修正說明**：第十三輪版本的本附錄有三項不足，已於該輪修正：(1) 阿爾及利亞改制年份誤植為 2019 年（正確為 2009 年）；(2) 「查證依據」欄位只有概括敘述、不可追溯，已改為逐筆結構化來源記錄；(3) 以色列不應以單一列代表所有金融活動範疇，已拆分為 `IL-COUNTRY`／`IL-BANKING`／`IL-CLEARING`／`IL-TASE` 四列。詳見設計文件 3.53 節之修正說明。
>
> **第十五輪再修正說明**：第十四輪版本仍有三項問題，已於本輪修正：(1) `IL-TASE` 之生效日描述錯誤（`2026-01-05` 是星期一而非星期五，見 3.57 節），已更正為「制度生效日」與「首個星期五交易日（`2026-01-09`）」分開標示；(2) `IL-CLEARING` 原本只是推定與 `IL-BANKING` 相同，經查證後拆分為依官方文件為據的 `IL-TASE-CLEARING`（TASE 證券清算）與新增的 `IL-ILS-ZAHAV`（Bank of Israel 官方 RTGS 系統）兩個獨立範疇，以色列因此由 4 個範疇增為 5 個；(3) 表格標題與結論之「12 個一般國家」為計數錯誤，實際為 13 個（見 3.58 節），已修正；同時將表後之查證揭露欄位由單一 `verifiedBy` 擴充為含 `researchAssistedBy`／`verifiedBy`／`approvedBy`／`approvedAt`／`approvalStatus` 之四態核准狀態機（見 3.60 節）。

**查證方法：** 逐一以網路搜尋比對官方或高可信度來源（各國政府公告、中央銀行規則手冊、主流財經媒體對制度變更的報導、國際託管機構之官方市場文件），確認「目前（查證當下）實際生效」的週末日安排，而非依賴訓練資料的既有印象——這正是 3.45 節 AE 案例揭示的風險（範例資料可能在制度變更後未同步更新）。每筆記錄之信心等級分三級：**OFFICIAL**（政府／中央銀行／國際託管機構等第一手或權威市場文件來源）、**NEWS**（信譽良好之媒體對官方行動的報導）、**SECONDARY**（彙整站／百科／個人部落格等二手來源，信心最低）。查無確切生效日期者，`effectiveFrom` 欄位誠實標示「未查得確切日期」，而非杜撰一個看似精確的數字。

**逐筆結構化查證記錄（13 個一般國家 + Israel 五個獨立範疇，共 18 筆，皆於同一時間點查證，查證揭露欄位見表後統一註記）：**

| 國家／地區 | 範疇代碼 | 現行安排 | 生效日（effectiveFrom） | 來源權威（sourceAuthority） | 來源文件（sourceDocument，含連結） | 信心等級 |
| --- | --- | --- | --- | --- | --- | --- |
| 沙烏地阿拉伯 | SA | 星期五、星期六 | 2013-06-29（王室詔令宣布，2013-06-23） | Saudi Council of Ministers（王室詔令） | [Saudi Arabia Changes Weekend to Friday-Saturday](https://www.crowell.com/en/insights/client-alerts/saudi-arabia-changes-weekend-to-friday-saturday-from-29-june-2013)；[Gulf Business 報導](https://gulfbusiness.com/en/2013/industry/saudi-officially-changes-weekend-to-friday-saturday/) | NEWS |
| 巴林 | BH | 星期五、星期六 | 未查得確切生效日期，僅確認現況 | 未查得具名主管機關之一手文件 | 僅有 HR／薪資彙整網站確認現況，未找到附帶日期之官方公告或新聞報導 | SECONDARY |
| 科威特 | KW | 星期五、星期六 | 內閣 2007-05-28 決議，2007-09-01 生效 | Kuwait Cabinet（經 Civil Service Commission 建議） | [Arab News 報導](https://www.arabnews.com/node/298933) | NEWS |
| 卡達 | QA | 星期五、星期六 | 2003-08-01 生效（公部門） | Qatar Cabinet 決議 | [Arab News 報導](https://www.arabnews.com/node/234601) | NEWS |
| 阿曼 | OM | 星期五、星期六 | 2013-05-01 生效 | Sultan Qaboos bin Said 王室詔令 | [Fox News／AP 報導](https://www.foxnews.com/world/oman-to-shift-weekend-to-friday-saturday-to-follow-most-gulf-partners) | NEWS |
| 約旦 | JO | 星期五、星期六（另見下方研議中事項） | 約 2000-01（確切日期未查得） | Jordanian Government 公告 | [Adventist Press Service／wfn.org 舊檔](https://archive.wfn.org/2000/01/msg00078.html)（低知名度媒體存檔，信心等級偏低） | NEWS（偏 SECONDARY） |
| 埃及 | EG | 星期五、星期六 | 未查得確切生效日期，僅確認現況 | 未查得具名主管機關之一手文件 | 僅有假日曆彙整網站確認現況 | SECONDARY |
| 阿爾及利亞 | DZ | 星期五、星期六 | **2009-08 中旬**（見下方更正說明） | Algerian Government 政府決議 | [vivalalgerie 部落格，2010-08-14 發文](https://vivalalgerie.wordpress.com/2010/08/14/the-universal-weekend-and-decision-making-in-algeria/)（發文當日原文：「今天正好是 Algeria 由 Thursday-Friday 改為 Friday-Saturday 滿一年」，故反推實際改制日為 2009-08 中旬） | SECONDARY（個人部落格，但為事件發生同期之當代第一手記錄，時間精確度高於一般事後彙整報導） |
| 伊拉克 | IQ | 星期五、星期六 | 約 2005-02（確切日期未查得） | Iraq 過渡政府（2005-01-30 選舉後） | [Al Jazeera 報導，2005-02-28](https://www.aljazeera.com/news/2005/2/28/iraqis-protest-having-saturday-off) | NEWS |
| 孟加拉 | BD | 星期五、星期六 | 約 2005-09 | Bangladesh Government 公告 | [People's Daily Online 報導，2005-09-06](http://en.people.cn/200509/06/eng20050906_206869.html) | NEWS |
| 馬爾地夫 | MV | 星期五、星期六 | 未查得確切生效日期，僅確認現況 | 未查得具名主管機關之一手文件 | 僅有假日曆彙整網站確認現況 | SECONDARY |
| 巴勒斯坦 | PS | 星期五、星期六 | 未查得確切生效日期，僅確認現況 | 未查得具名主管機關之一手文件 | 僅有假日曆彙整網站確認現況 | SECONDARY |
| 敘利亞 | SY | 星期五、星期六 | 未查得確切生效日期，僅確認現況 | 未查得具名主管機關之一手文件 | 僅有假日曆彙整網站確認現況 | SECONDARY |
| 以色列 | IL-COUNTRY | 星期六為完整休息日；星期五為縮短工時之半日工作日（非完整假日） | 無單一「改制」事件——以色列自 1948 年建國以來即依安息日（Shabbat）固定此制度，非制度變更 | 以色列勞動法（一般慣例） | 一般性常識／勞動法通例，無單一決議文件可引 | SECONDARY（脈絡性事實，非單一決議） |
| 以色列 | IL-BANKING | 星期五為半日營業（結束於當地時間 13:15），其餘規則同 IL-COUNTRY | 現行規則（Bank of Israel 逐年公告，本筆為 2026 年版本） | Bank of Israel（以色列中央銀行）Markets Department | [Bank of Israel Markets Department Business Days 2026（PDF）](https://www.boi.org.il/media/rcukpxgx/markets-department-business-days-for-2026.pdf) | OFFICIAL |
| 以色列 | IL-ILS-ZAHAV（第十五輪新增） | 常態營運日為星期日至星期一~星期五（原文：「as a rule, the operating days of the RTGS system are Sunday through Friday」，即六日制、不含星期六）；一般營業日結束於當地時間 18:30，星期五及節日前夕之縮短營業日結束於 14:00——此 14:00 收盤時間與 IL-BANKING 之 13:15 不同，兩者為 Bank of Israel 不同部門／系統之各自公告，本表誠實並列不逕自合併 | 現行規則（Bank of Israel 逐年公告，本筆為 2026 年版本） | Bank of Israel（以色列中央銀行）——Zahav（ILS RTGS 大額即時清算系統）之官方營運單位 | [ZAHAV RTGS SYSTEM Business Days during 2026（PDF）](https://www.boi.org.il/media/1x1a4n3r/zahav-holidays-2026-eng.pdf) | OFFICIAL |
| 以色列 | IL-TASE-TRADING（原 IL-TASE，第十五輪修正） | **Monday–Friday 交易週**（星期一至週四全日交易，星期五縮短交易、收盤時間約當地時間 13:34～14:00 視來源而定，銜接安息日；星期日**不再**是交易日）——與 IL-COUNTRY／IL-BANKING 之週末方向相反 | **2026-01-05**（新交易週制度**生效日**，本身是星期一——第十四輪版本誤稱此日為「首次星期五交易」，已更正；新制度下首個實際星期五交易日為 **2026-01-09**） | Tel Aviv Stock Exchange；Israel Ministry of Finance（Bezalel Smotrich 主導政策） | [Times of Israel 報導](https://www.timesofisrael.com/tel-aviv-stock-exchange-to-shift-to-monday-friday-trading-week-starting-2026/)（確認生效日為「Monday, January 5, 2026」）；[isra-tech 報導](https://www.isra-tech.net/tel-aviv-stock-exchange-moves-to-a-global-trading-week-monday-to-friday/)；[Bezeq Group 新聞稿](https://ir.bezeq.co.il/news-releases/news-release-details/update-tase-trading-days/)；[TradingHours.com 2026 時刻表](https://www.tradinghours.com/markets/tase)（交易時間 Mon-Thu 9:59-17:14、Fri 9:59-13:34，作交叉核對） | NEWS（多方媒體與時刻表彙整站交叉核對一致；TASE 官方頁面 `tase.co.il/en/content/knowledge_center/trading_vacation_schedule` 為 JS 動態頁面，本次查證工具無法直接擷取內文，僅列 URL 供人工複查） |
| 以色列 | IL-TASE-CLEARING（原 IL-CLEARING，第十五輪修正） | 證券清算與交易日**不完全相同**：星期五之交易指示於次一個星期日撮合結算（即清算流程本身會在星期日發生活動，即使星期日已非交易日）；現金指示可於星期五及節日前夕處理至當地時間中午 12:00；結算批次於 SD-1 當地時間 19:00 開始處理，Bank of Israel 帳務更新於 SD+1 上午 09:15 完成——第十四輪版本原本**推定**此範疇與 IL-BANKING 相同，經查證後確認並非如此，已改列為獨立範疇 | 現行規則（未查得單一制度生效日，本筆為現行清算流程說明） | Clearstream（國際中央證券存管機構，以色列市場官方結算流程說明文件之發布方） | [Clearstream：Settlement process – Israel](https://www.clearstream.com/clearstream-en/res-library/market-coverage/settlement-process-israel-1281448) | OFFICIAL（國際託管機構官方市場文件，非 TASE 自身頁面，但屬結算機制之權威一手說明） |

**查證揭露欄位（本表全數記錄共用，第十五輪由單一 `verifiedBy` 擴充為狀態機，見 3.60 節）：**

```
researchAssistedBy: AI_ASSISTANT (Claude，經網路搜尋工具查證)
verifiedBy: （未指派——尚待人類 Data Steward 執行 Maker 複核）
approvedBy: （未指派——尚待正式 Checker／Authorized Reviewer 核准）
approvedAt: （尚未發生）
approvalStatus: DRAFT
researchedAt: 2026-08-23T07:57:54Z
```

**這點需要明確揭露**：本附錄之查證是 AI 協助的網路搜尋整理，信心等級標記已反映來源本身的可信度，但 `approvalStatus` 目前全數為 `DRAFT`——尚未經人類 Data Steward 執行 Maker 複核（`verifiedBy` 待指派），更未經正式 Checker／Authorized Reviewer 核准（`approvedBy`／`approvedAt` 待指派）。若這些國家／範疇日後真的要納入 `GET /countries/{code}` 之正式資料集，應由人類依本附錄之來源線索重新走一次正式核准流程，把狀態機推進至 `VERIFIED`、再到 `APPROVED`，而非直接把本附錄視為已核准之 Standing Data。

**約旦（JO）之研議中事項（非本輪錯誤，但性質與 AE 案例高度相關，建議列入後續追蹤）：** 目前仍為星期五、星期六，但截至查證當下（2026 年上半年）政府正在研議變更、尚未定案——約旦文官委員會正評估將公部門週末延長為三天（含星期日），或改採壓縮四日工作週，目前仍在意見調查與方案評估階段，尚未實施。若日後這些國家陸續納入本服務之國別資料集，約旦應列為高關注項目——這與 AE 2022 年那次由研議到正式生效的過程性質相同，建議援引 3.45 節「歷史交易應依當時有效制度重算」的既有設計原則，及早規劃版本化資料結構。

**以色列多範疇拆分之結論（第十五輪更新：4 範疇 → 5 範疇）：** 上表 `IL-COUNTRY`／`IL-BANKING`／`IL-ILS-ZAHAV`／`IL-TASE-TRADING`／`IL-TASE-CLEARING` 五列清楚顯示，以色列不同金融範疇的營業日規則彼此不同、甚至方向相反（TASE 交易現在星期一至五、星期日不交易，與國家整體「星期五、六為週末」恰好相反；而 TASE 的清算流程又與其自身的交易日不完全相同，星期日仍有清算活動）。這**反過來印證**了本 OAS 既有的 `COUNTRY`／`INSTITUTION`／`CURRENCY_CLEARING`／`FINANCIAL_CENTER` 四層行事曆分層設計是必要且正確的，不需要因此變更 schema 結構本身——需要修正的是本附錄這份**外部參考文件**的呈現方式與精確度。若日後這些範疇要納入 OAS，`IL-TASE-TRADING`／`IL-TASE-CLEARING` 這類交易所層級的行事曆，在現有 `CalendarType` enum（`COUNTRY`／`CURRENCY_CLEARING`／`INSTITUTION`／`FINANCIAL_CENTER`）中沒有完全對應的類型，最接近的是 `FINANCIAL_CENTER`，但這是否語意上足夠準確、清算與交易兩個範疇是否需要各自獨立的 enum 值，應留待實際有需求時再行評估，本輪不在此自行擴充 `CalendarType` enum。

**結論：** 除上述以色列相關修正外，其餘 13 國之現行週末安排與原表一致，未發現需要修正之過時資料。本附錄之查證結果目前僅作為外部事實記錄留存（`approvalStatus: DRAFT`），若未來實際將這些國家納入 `GET /countries/{code}` 之資料集，應在該回應中一併填入本文件 3.50 節新增之 `effectiveFrom`／`calendarVersion`／`sourceAuthority` 等治理欄位，並比照 3.45 節之 AE 案例，在該筆資料的說明中引用實際查證來源，同時完成本附錄查證揭露欄位之 `DRAFT` → `VERIFIED` → `APPROVED` 正式流程。
