# 決策文件：Import（A6）／Export（B4）Calculated Maturity Date — Tenor Basis、Contractual／Operational 日期分離、AFTER_SIGHT 進出口分流

**版本**：v33（回應第三輪業務覆核指出的兩處新舊敘述不一致）：第三輪覆核肯定 v32 已正確納入 UI 顯示需求並區分預估／正式日期（三份文件均評 9.4～9.8 分），但指出兩處舊敘述未同步更新：(1) UI 文件「三層顯示與驗算控制標準」Layer 1 那一列，沿用了 v32 新增 Estimated 概念之前的舊講法「`PENDING_BASE_DATE` 時...不能顯示一個可能是錯的日期」，字面上與同一份文件後面新增的「`PENDING_BASE_DATE` 期間可以顯示 Estimated 日期」互相矛盾——本版修正 UI 文件該列文字，改成依「有沒有可用的 Estimated Base Date」分兩種情況；(2) UI 文件「建議資料模型」與「這個答案會決定什麼」仍殘留「若問題一選 (b)」的假設性描述，但問題一已經業務核定選 (a)，這些殘留描述容易被誤讀成 (b) 仍是待決選項——本版移除／標註為「業務已不採納，僅供對照」。另外依審查建議新增一份 Estimated／Confirmed／Calculated／Override／Effective 欄位對照表（UI 文件），統一日期欄位命名與業務意義，並把 `effectiveOperationalPaymentDate` 的計算式明確加上 `maturityDateStatus = APPROVED` 前提；「決策狀態總表」的「業務已核定標示的實際確認層級」一列，Go-Live Blocker 由「否」改列為「是」——正式對外簽核（一頁摘要確認記錄）若上線前仍未完成，屬於真正的上線阻礙，不只是文件用詞問題。**v32 摘要**：第二輪覆核肯定 v31 整體方向（三份文件均評 9.6～9.7 分），但指出兩項需要釐清的地方，本版逐一回應：(1) 【狀態釐清】v31 多處把 4.4 節的內容標示為「業務已核定」，但一頁業務確認摘要底部的「確認記錄」表格（確認人／確認日期）目前仍是空白——本版在「查證依據標示慣例」新增說明，把「業務已核定」明確定義為「使用者在本文件協作過程中以業務／BA 決策角色明確表達同意」，與一頁摘要「確認記錄」所代表的、由實際 TF Business／Ops 具名的正式書面／口頭簽核，是兩個不同層級；後者截至本版仍待完成，一旦取得應回填一頁摘要的確認記錄，讓標示真正達到正式簽核層級。(2) 【技術釐清】補充 Estimated（試算）日期與 `PENDING_BASE_DATE` 狀態如何並存而不矛盾：4.4 節新增「Estimated 與正式生效日期的欄位區分」，明確 `PENDING_BASE_DATE` 只禁止產生**正式生效**的 Contractual／Operational Maturity Date，不禁止產生**僅供顯示**的 Estimated 值，並給出資料模型建議（Estimated／Confirmed 欄位分開宣告，不得共用）與前後對照範例，同時明確禁止 Estimated 值供 Settlement、報表、逾期判斷或客戶正式通知使用。已同步更新 `Maturity-Date-UI-Display-Override-Decision-Request.md`（v15）。**v31 摘要**：業務覆核確認 v30 整體方向正確，但指出一項重要業務概念需要修正並已採納——**`fixedMaturityDate` 不是 Base Date**，不應套用跟 Acceptance Date／`sightDate`／`blDate`／`invoiceDate`／`shipmentDate` 相同的修正機制：Base Date 是計算 Contractual Maturity Date 用的輸入，修正走 Base Date Correction、觸發 `computeSourceDate()` 重算；`fixedMaturityDate` 本身就是條款直接指定的合約到期日，修正須走正式 LC Amendment／Contractual Date Correction，不呼叫 `computeSourceDate()`，但同樣要送 Standing 重算 Operational Payment Date——本版新增分類表與兩條分開的流程圖，並刪除 v30 原本「`fixedMaturityDate` 比照辦理」的講法。另外業務已正式核定「已 `APPROVED` 後修正 Base Date」的六項規則（獨立 Correction Event、核准前舊值繼續有效、不得撥回 `PENDING_*`、Checker 核准後新值才生效、完整異動紀錄，**新增**：Settlement 已完成須改走正式 Correction／Reversal／Exception，不得走一般修正）；新增「Base Date 在不同階段的修改控制」表（Maker 未 Submit／已 Submit 未核准／已 `APPROVED`／Settlement 已完成，四階段各自的控制方式，避免草稿階段每次修改都觸發正式 Amendment）；新增 `AFTER_ACCEPTANCE` 情境下，實際承兌日確認前，畫面應標示為「Estimated Contractual Maturity Date」而非正式到期日。已同步更新 `Maturity-Date-UI-Display-Override-Decision-Request.md`（v14）與一頁業務確認摘要（修正「系統現在已經能正確算出到期日」這句與後文自相矛盾的表述）。**v30 摘要**：新增 4.4 節「Base Date 修正機制」，收錄使用者以 BA 角色提出的業務決議草案（本版已依業務覆核修正，見上方）。**v29 摘要**：收斂審查對 v28 的兩項意見：(1) 【P1】明確 `CALENDAR_SNAPSHOT_UNAVAILABLE` 是稽核／重驗算過程的例外代碼，不是第四節 `MaturityDateStatus` 之外的第四種狀態，且不得因為查不到原始 Snapshot 就把已經 `APPROVED` 的到期日自動改回 `PENDING_*`（第八節新增說明與 illustrative 型別）；(2) 【P2】審查建議全文逐句加 `[直接程式碼查證]`／`[文件記錄]` 等方括號標籤標示查證強度——本版改採輕量做法：新增一段「查證依據標示慣例」說明，把全文已經在用的敘述用詞（「核對…確認」＝直接查證程式碼；「依 `CLAUDE.md` 記錄」＝文件佐證非直接查碼；「已核定」＝業務決策；「提案／待確認」＝未落地設計）整理成對照規則，不逐句加標籤（近千行全文逐句貼標籤會犧牲可讀性、且容易漏貼），並註明若之後另外產出附錄 B 的精簡版文件，篇幅較短時更適合採用審查建議的標籤法。另修正一處自己造成的疏漏：v28 版本說明段落結尾誤把「版本記錄慣例」整句重複寫了兩次，本版刪除重複。**v28 摘要**：收斂審查對 v27 的三項意見（Calendar Snapshot 遺失處理區分首次收到 vs. 歷史重驗算兩種情境；修正 Checker Release「Snapshot 隨時間過期」的不精確用詞；附錄 B 精簡版建議結構更新為十段），另加一輪自行發起的程式碼複查——重新核對六項既有關鍵查證結論（`computeSourceDate()`／`AdjustBusinessDayResponse`／`assertAcceptanceSettlementAllowed()` 不存在／`resolveParentContract()` 位置／`maturityDateStatus`／`fixedMaturityDate` 全專案不存在）皆確認無誤；發現並修正一處查證出處問題——Angular interface 未宣告 `maturityDate`的說法本次查證範圍不含 Angular 原始碼，已改標註為依 `CLAUDE.md` 記錄判斷；另查核一則 `CLAUDE.md` 記錄（`BalanceMovement.maturityDate` 為宣告但無 DB 欄位的死欄位），直接讀 `types.ts`／`db/schema.ts` 後確認**這則記錄與現行程式碼不符**（`BalanceMovement` 介面根本沒有宣告這個欄位，`maturityDate` 只存在於 `BalanceContract`），故未採納、未修改文件內容，僅記錄查證過程。**v25／v26／v27 摘要**：查證發現 `fixedMaturityDate` 欄位跟 `tenorBasis` 一樣完全不存在於資料模型；兩步驗算（Base Date＋Tenor Days／假日調整）取代先前只驗一半的疏漏，並排除 `FIXED_MATURITY_DATE` 例外、新增日期角色辨識規則、重新驗算須釘住原始 `calendarSnapshotId`、與 UI 覆寫決策文件的機制切割；新增「Risk Containment Gate／Business Go-Live Gate」兩道關卡區分。
**版本記錄慣例**：舊版全文不重複保留，內容可從對話紀錄回溯；本版只收斂當前應交付的內容。

**查證依據標示慣例（回應審查對「證據與查證嚴謹性」的建議，本版新增）**：審查建議統一用類似 `[直接程式碼查證]`／`[文件記錄，待程式碼確認]`／`[業務已核定]`／`[設計提案，尚未實作]`／`[待其他團隊確認]` 的標籤逐句標示。本文件採用較輕量的做法：不逐句加標籤（全文近千行，逐句貼標籤會讓可讀性下降，且容易漏貼、誤貼），而是延續全文已經在用的敘述慣例——句子帶「核對／核對程式碼／直接讀取…確認」＝已對照實際原始碼查證；句子帶「依 `CLAUDE.md` 記錄」＝引用工程日誌等文件佐證，非本次直接讀原始碼所得（本版已把附錄與決策狀態總表中原本語氣像是直接查證、實際只有文件佐證的段落逐一改成這個明確用詞，見上方版本說明）；句子帶「業務已直接向使用者確認／已核定」＝業務決策本身，不是程式碼事實；句子帶「業務初步方向（待正式確認）」＝使用者以 BA 角色提出、尚未經業務正式簽核的決議草案，性質介於「已核定」跟「設計提案」之間，先寫進文件對齊設計方向，正式生效仍待業務確認（v30 的 4.4 節曾經是這個標示的例子，v31 已依業務覆核意見正式升級為「已核定」，見上方版本說明——這個分類仍保留供之後類似情境使用）；句子帶「提案」「建議」「本文件不預設答案」「待業務／工程確認」＝設計提案或未決事項，尚未寫入程式碼。讀者可依這五種用詞辨識查證強度，不需要額外的方括號標籤系統；若之後產出附錄 B 建議的精簡版「Approved Decision Baseline」文件，屆時篇幅較短，較適合採用審查建議的方括號標籤逐條標示。

**「業務已核定」的實際確認層級（本版新增，回應第二輪業務覆核對這個標示字面意義的提問）**：本文件通篇使用的「業務已核定」／「業務已直接向使用者確認」，代表使用者在本文件的協作過程中，以業務／BA 決策角色的身份於對話中明確表達同意或核准——這是文件協作過程中的決策紀錄，但**不等於**由具名的 TF Business／Ops 人員完成的正式書面或會議簽核。後者的正式紀錄位置是一頁業務確認摘要（`Maturity-Date-UI-Override-Business-Confirmation-Summary.md`）文末的「確認記錄」表格（確認人、確認日期、最終決定），**截至本版這張表仍是空白**，代表向實際業務人員的正式簽核尚未完成。兩者的差異可以用下面三段對照理解（依第二輪業務覆核建議的分級方式）：

| 狀況 | 本文件應標示 | 一頁業務確認摘要應呈現 |
|---|---|---|
| 尚未取得任何確認 | 業務初步方向，待正式確認 | 保留空白勾選欄位 |
| 使用者已於對話中明確表達同意（本文件目前多數「業務已核定」屬於這一層） | 業務已核定（本文件協作層級） | 勾選欄位仍保留，供實際業務人員覆核後填寫 |
| 已取得實際 TF Business／Ops 具名簽核 | 業務已核定（正式簽核） | 「確認記錄」表格填妥確認人、確認日期 |

換句話說，本文件現有的「業務已核定」標示，性質上等同第二格「使用者已核定方向」，不是第三格「正式書面核准」——這不代表這些決策內容有錯誤或需要重新討論，只是提醒讀者：向實際 TF Business／Ops 取得具名簽核、並回填一頁摘要的確認記錄，仍是本文件正式定案前的必要步驟，不能單憑本文件的「已核定」字樣就視為已完成對外簽核流程。

---

## 一、決策摘要（Executive Decision）

**業務政策（已直接向使用者二次確認，本文件正式採用）**：

> `tenorBasis = AFTER_SIGHT` 是本產品判斷 Export Confirmed LC 結算路由的直接依據：Export 端一律按 Sight 處理（B4 `HONOUR`，不建立 Acceptance Balance、不計算 Maturity Date）；Import 端一律是進口銀行對買方的融資，需要計算 Maturity Date（A6 `ACCEPT`）。

**本版把「一律」這件事做實**：上一版程式碼裡，`AFTER_SIGHT` 遇到 `tenorType = SELLERS_USANCE` 時會在 B4 執行當下轉人工覆核——這跟「一律」的文字表述矛盾（見第三節）。本版採納「盡早攔阻」的原則，把這個檢查**移到 A1/B1 建檔（與 A2/B2 修改）階段**做硬性驗證擋下，而不是讓不合規的資料先建檔成功、才在交易當下發現問題。B4 執行當下的路由判斷因此可以真正做到「讀到 `AFTER_SIGHT` 就是 `HONOUR`」，不需要再有例外分支。

**Release Blocker（維持最高優先，本版擴充稽核欄位，見第五節）**：`Contractual Maturity Date`／`Operational Payment Date` 必須分欄持久化——現行 `service/balanceService.ts` 第 1189–1207 行會把 `sourceDate` 丟棄，這是現行已上線程式碼的真實缺陷，與路由規則彼此獨立，兩者都要修。

---

## 二、分流矩陣（不變，本產品已核定規則）

| Tenor Basis | Import LC（A6） | Export Confirmed LC（B4） |
|---|---|---|
| `AFTER_SIGHT` | `ACCEPT`，計算 Maturity Date（進口銀行對買方融資） | `HONOUR`，不計算 Maturity Date、不建立 Acceptance Balance |
| `AFTER_BL_DATE`／`AFTER_INVOICE_DATE`／`AFTER_SHIPMENT_DATE`／`AFTER_ACCEPTANCE` | `ACCEPT`，計算 Maturity Date | `ACCEPT`，計算 Maturity Date（`AFTER_ACCEPTANCE` 且 Acceptance Date 未定時顯示 `PENDING_BASE_DATE`） |
| `FIXED_MATURITY_DATE` | `ACCEPT`，使用信用狀指定到期日 | `ACCEPT`，使用信用狀指定到期日 |
| `SIGHT`（`tenorType`，非 `tenorBasis`） | `UTILIZE`（A4），不計算到期日 | `HONOUR`（B4 Sight 分支），不計算到期日 |
| `DP`／`DA` | 待確認，**不得預設為 `ACCEPTANCE`**（見第三節 3.2） | 待確認，同左 |

---

## 三、程式修正

### 3.1 建檔階段硬性驗證（採納「盡早攔阻」，取代 B4 當下的例外分支）

**先說明這一節的性質，避免被誤讀成現況**：下面這一節（含 `fixedMaturityDate` 相關的 pseudocode）描述的是**應該怎麼設計**，`tenorBasis` 本身（見第 81 行查證）跟 `fixedMaturityDate`（本版查證新增，同樣完全不存在於 `types.ts`／`db/schema.ts`，先前版本誤以為是既有欄位，見第四節更正）**兩者現在都還沒加進資料模型**，這一節的驗證邏輯要等兩者都新增之後才能真的掛上去執行，不是現況描述。

```typescript
// requestSchema.ts / balanceService.ts — A1/B1 root ISSUE，以及 A2/B2 修改 tenorBasis/tenorType 時都要跑
function validateTenorBasisTypeCombination(tenorBasis: TenorBasis, tenorType: TenorType): void {
  if (tenorBasis === 'AFTER_SIGHT' && tenorType === 'SELLERS_USANCE') {
    throw new RequestValidationError(
      'AFTER_SIGHT cannot be combined with SELLERS_USANCE under the approved product policy — ' +
      'AFTER_SIGHT is reserved for the Buyer\'s-Usance/UPAS settlement pattern (Export Sight, Import financed).',
      // reasonCode: 'TENOR_BASIS_TYPE_COMBINATION_NOT_ALLOWED'
    );
  }
}
```

**`SIGHT` 不適用 `tenorBasis` 概念，建檔／回填都不該強行要求填值**：`tenorBasis`（到期日起算規則）只對會產生 Maturity Date 的 Usance 情境才有意義；`tenorType = SIGHT` 本身走 `UTILIZE`（A4）或 Sight `HONOUR`（B4），完全不計算到期日（見第二節矩陣），沒有到期日起算規則可言。新建檔與回填流程都應該明確允許／要求 `SIGHT` 的 `tenorBasis` 維持 `null`，而不是為了「欄位統一有值」硬塞一個沒有意義的值：

```typescript
if (tenorType === 'SIGHT') {
  // tenorBasis／tenorDays 對 SIGHT 沒有意義，不得要求填值，也不得由回填流程猜測填入
  assertTenorBasisIsNull(tenorBasis);
  assertTenorDaysIsNull(tenorDays);
}
if (tenorType === 'BUYERS_USANCE' || tenorType === 'SELLERS_USANCE') {
  assertTenorBasisIsPresent(tenorBasis);
}
if (tenorBasis === 'FIXED_MATURITY_DATE') {
  // fixedMaturityDate 必填；tenorDays 對這個 tenorBasis 沒有意義，應強制為 null，避免同時存在兩套互相矛盾的到期日輸入
  assertFixedMaturityDateIsPresent(fixedMaturityDate);
  assertTenorDaysIsNull(tenorDays);
  // A1/B1 建檔階段還沒有文件提示，不能拿 presentationDate 當比較基準——這裡只能跟 Issue/Confirm Date 比
  assertFixedMaturityDateNotBeforeIssueOrConfirmDate(fixedMaturityDate, issueOrConfirmDate);
}
```

**`fixedMaturityDate` 的比較基準要依業務階段分開，不能在 A1/B1 建檔時就要求跟提示日比較**——上一版把「不得早於文件提示日」直接放進建檔驗證，但 A1（LC Issue）／B1（Confirm）階段本來就還沒有任何文件被提示，`presentationDate` 這個時候根本不存在，不能拿一個還不存在的日期當比較基準。正確拆法：

- **A1／B1 建檔**：`fixedMaturityDate` 必填、不得早於 `issueDate`／`confirmDate`，`tenorDays` 必須為 `null`。
- **A3／B3 文件提示**：這時候 `presentationDate` 才存在，若 `fixedMaturityDate`（這個 `tenorBasis` 約定的固定到期日，即這筆貿易融資款項本身的到期日，**不是信用狀的 Expiry Date／有效期限**——兩者是不同概念，Expiry Date 是信用狀本身可提示單據的截止日，`fixedMaturityDate` 是提示、承兌之後這筆款項應付款的日期）早於這次的 `presentationDate`（代表這筆固定到期日比這次提示還早，理論上不該發生），應該擋下或轉人工例外，不能直接建立一筆建檔當下就已逾期的 Acceptance。
- **A6／B4 Acceptance**：再次確認 `fixedMaturityDate` 仍然符合產品規則（例如沒有被中途 Amendment 改到不合理的值）。

同一個 `TenorBasis`／`TenorType` 的允許型別要記得同步放寬成可為 `null`（例如 `tenorBasis?: TenorBasis | null`），避免「業務規則允許 `SIGHT` 不填 `tenorBasis`」，但 TypeScript 型別或 API Schema 卻要求必填，兩邊互相矛盾。

**`FIXED_MATURITY_DATE` 假日調整範圍的既有原則同樣適用**：`fixedMaturityDate` 是信用狀指定的 Contractual Maturity Date，遇假日只調整 `operationalPaymentDate`（呼叫 Standing），`fixedMaturityDate` 本身不被覆蓋——這跟第六節「Contractual／Operational 分欄」的既有原則一致，不是這個 `tenorBasis` 的特例。

**既有資料（Legacy）的處理——這是上線前的 Production Readiness Gate，不是「需不需要」的開放問題**（統一前一版兩處用詞不一致的地方）：這道建檔驗證只能擋住「這次修正上線之後」新建立或新修改的合約，不會回頭修正既有資料，上線前必須完成第八節的查詢與處理。

**比查詢結果更根本的一個前提，核對程式碼後發現**：`tenorBasis`／`tenor_basis` 目前在整個 `microservices/balance-component/src` 裡**完全不存在**——不是「有欄位但沒填」，是這個欄位本身還沒被加進 `types.ts`／`db/schema.ts`。這代表第七節那條 SQL 沒辦法直接執行，因為 `balance_contracts` 表現在根本沒有 `tenor_basis` 欄位可以查。真正的 Legacy 檢查，因此不是一次簡單的唯讀查詢，而是**新增欄位＋回填（backfill）流程的一部分**：`tenor_basis` 這個欄位對所有既有合約而言原本就是 `NULL`（因為概念上根本沒存過），backfill 時（不論是從信用狀原始條款文字反推，還是由業務逐筆確認）如果某筆既有合約被回填成 `tenor_basis = 'AFTER_SIGHT'`，同時 `tenor_type = 'SELLERS_USANCE'`，這筆資料在回填當下就應該被攔下來要求人工確認，而不是等回填完成後才用第七節的 SQL 去「事後抓出來」——回填流程本身就是檢查點，SQL 查詢只在回填完成後用來做最終確認，兩者不是互斥，但回填流程才是主要的把關點。

#### 3.1.1 `tenor_basis` 從無到有的完整實作順序（本版新增，回應「這麼多相依步驟到底先做哪個」）

上面兩段分別講了「驗證邏輯長什麼樣」跟「這個欄位現在不存在」，但沒有給出一個**可以真的排進 Sprint 的順序**。這件事本質上是欄位新增＋既有資料回填＋新驗證上線三者交織，順序錯了會出問題（例如驗證邏輯先上線、欄位還沒回填，會讓所有既有合約的 Amendment 全部因為 `tenorBasis = null` 落入 `MANUAL_REVIEW_REQUIRED`）。建議順序：

1. **Standing／OAS 層面確認**：`tenorBasis` 的合法值集合（`AFTER_BL_DATE`／`AFTER_INVOICE_DATE`／`AFTER_SHIPMENT_DATE`／`AFTER_SIGHT`／`AFTER_ACCEPTANCE`／`FIXED_MATURITY_DATE`）與既有 `TenorType`（`SIGHT`／`BUYERS_USANCE`／`SELLERS_USANCE`／`DP`／`DA`）的關係最終定案，寫進本文件或另一份規格（本文件第一、二節已完成這部分業務確認，這步驟是把它變成正式規格文字）。
2. **TypeScript 型別新增**：`types.ts` 新增 `TenorBasis` 型別與 `TENOR_BASIS_VALUES` 常數陣列（比照現有 `TenorType`／`TENOR_TYPE_VALUES` 的既有寫法），`BalanceContract` 新增 `tenorBasis?: TenorBasis | null` 欄位；**本版查證新增：`fixedMaturityDate?: string | null` 這個欄位本身也完全不存在，應該跟 `tenorBasis` 同一批加**（先前版本誤以為是既有欄位，見第四節更正），否則 `tenorBasis = FIXED_MATURITY_DATE` 這個值就算加進了合法清單，也沒有對應欄位可以存實際到期日。
3. **DB schema 新增欄位**：`db/schema.ts` 的 `balance_contracts` 新增 `tenor_basis` 欄位（可為 `NULL`，因為既有資料本來就沒有這個概念），連同上一步的 `fixed_maturity_date` 欄位、以及 3.1 節後段會提到的 `tenorBasisSource`／`tenorBasisBackfilledBy`／`tenorBasisBackfilledAt`／`tenorBasisBackfillApprovedBy` 這幾個稽核欄位一起加，不要分兩次遷移。
4. **索引與現行驗證邏輯先不啟用**：欄位加進去後，`validateTenorBasisTypeCombination()`／`resolveExportSettlementRoute()` 先寫好但**不掛進 A1/B1／A2/B2 的實際請求路徑**——這一步只讓程式碼存在、可以被單元測試覆蓋，還不影響任何正式交易。
5. **A1/B1（新建）流程串接**：新合約的 Issue／Confirm 流程開始要求／接受 `tenorBasis`，並在建檔當下跑 3.1 的硬性驗證——這一步之後，**新建立**的合約都會有 `tenorBasis`，但既有合約仍是 `NULL`。
6. **A2/B2（修改）流程串接**：Amendment 修改 `tenorBasis`／`tenorType` 時比照第七節的路由重算流程；同時 Amendment 也是既有合約補上 `tenorBasis` 的**天然時機**之一（業務在做 Amendment 時，可以順便要求／確認這筆既有合約的 `tenorBasis`）。
7. **既有資料 Legacy Backfill**：對 5、6 步驟之後仍然是 `NULL` 的既有合約（沒被 Amendment 觸碰過的），依 3.1.2 節的來源優先順序與稽核欄位執行批次回填，回填當下即套用 3.1 的驗證邏輯把違規組合攔下來。
8. **違規既有資料的處理**：第八節 SQL 查詢在回填完成後執行，抓出任何在回填當下沒被攔下、但實際上是 `AFTER_SIGHT` + `SELLERS_USANCE` 組合的既有資料（理論上不該有，因為第 7 步驟回填當下就會擋，這一步是最終確認網）。
9. **覆蓋率確認——區分 ACTIVE／CLOSED，門檻不同**：`ACTIVE`（未結清）的 Usance 合約（`tenor_type IN ('BUYERS_USANCE', 'SELLERS_USANCE')`）要求 `tenorBasis` 覆蓋率 **100%**，不允許有效合約仍是 `NULL`——否則新路由邏輯正式啟用後，這些合約的 A2/B2 或後續 B4 會因為 `tenorBasis` 缺漏被判成 `MANUAL_REVIEW_REQUIRED`，可能擋住正常交易。上線前應執行類似下面這條查詢，結果必須為 0 才能進第 10 步：

```sql
SELECT balance_contract_id
FROM balance_contracts
WHERE contract_status = 'ACTIVE'
  AND tenor_type IN ('BUYERS_USANCE', 'SELLERS_USANCE')
  AND tenor_basis IS NULL;
```

`CLOSED`（已結清／已到期多年）的既有合約可以評估是否豁免回填，但豁免必須有正式清單與核准紀錄（誰核准、豁免範圍、日期），不是無條件跳過。
10. **正式啟用新路由邏輯**：確認 8、9 步驟都完成後，`resolveExportSettlementRoute()` 才正式取代舊有的路由判斷邏輯，成為 B4 執行當下唯一的路由依據。

第 4 步到第 5/6 步之間存在一個順序風險：如果驗證邏輯（第 4 步）比 A1/B1／A2/B2 串接（第 5/6 步）晚做，會導致有一段時間新建合約完全沒有這道防線；反過來若串接比驗證邏輯先做，會導致新建合約要求填 `tenorBasis` 卻沒有任何檢查。兩者應該在同一個部署裡一起上線，不要分開兩次部署。

#### 3.1.2 Legacy Backfill 的來源與核准稽核——明文禁止用 `tenorType` 反推猜測

上一輪的說法只講了「回填時要攔違規組合」，但沒有講回填的**資料從哪裡來**，也沒有講清楚「絕對不能怎麼做」。這輪明確補上：

```typescript
tenorBasis?: TenorBasis | null;
tenorBasisSource?: 'ORIGINAL_LC_TERMS' | 'STRUCTURED_MESSAGE' | 'AUTHORIZED_MANUAL_BACKFILL' | null;
tenorBasisBackfilledBy?: string | null;       // 執行回填的人員／系統帳號
tenorBasisBackfilledAt?: string | null;       // 回填時間戳
tenorBasisBackfillSource?: string | null;     // 回填依據的原始文件／訊息參照（如 SWIFT MT700 欄位、信用狀掃描檔編號）
tenorBasisBackfillApprovedBy?: string | null; // 核准回填結果的人員，Maker/Checker 精神比照既有 Amendment 慣例
```

- `ORIGINAL_LC_TERMS`：從信用狀原始條款文字（掃描檔／結構化訊息）直接讀出，人工確認後填入。
- `STRUCTURED_MESSAGE`：從既有的結構化訊息欄位（若既有系統其他地方已經有等價資訊）直接對應填入。
- `AUTHORIZED_MANUAL_BACKFILL`：前兩者都沒有時，由被授權的業務人員依個案判斷填入，**必須**同時填 `tenorBasisBackfillApprovedBy`。

**明文禁止的做法**：不得由系統自動用既有 `tenorType` 反推猜測 `tenorBasis`（例如看到 `tenorType = BUYERS_USANCE` 就自動填 `tenorBasis = AFTER_SIGHT`，或看到 `tenorType = SELLERS_USANCE` 就自動填 `tenorBasis = AFTER_BL_DATE`）——`tenorType` 反映的是資金結構（誰融資），`tenorBasis` 反映的是到期日起算規則（UCP 600 Art. 3 的 from/after），兩者雖然在本產品目前已核定的政策下有強關聯（見第一、二節），但這個關聯是**業務政策**，不是可以無條件反向推導的數學對應——尤其 `DP`／`DA` 這兩個 `tenorType` 完全沒有對應的 `tenorBasis` 規則（第二節已列為待確認），任何自動反推邏輯遇到這兩者就會需要瞎猜。回填必須逐筆有 `tenorBasisSource` 佐證，不是批次程式規則推算。

### 3.2 路由解析：明確列舉，不得有「其餘一律視為 ACCEPTANCE」的隱性 catch-all

上一版的解析函式最後用 `return { route: 'ACCEPTANCE', ... }` 當作沒有命中前面分支時的預設值——這會讓 `DP`／`DA`，或任何未來新增、目前還沒定義的 `tenorBasis`，被靜默當成 `ACCEPTANCE`，跟文件本身「`DP`/`DA` 不預設答案」的立場矛盾。修正為明確列舉：

```typescript
const ACCEPTANCE_TENOR_BASES: readonly TenorBasis[] = [
  'AFTER_BL_DATE', 'AFTER_INVOICE_DATE', 'AFTER_SHIPMENT_DATE', 'AFTER_ACCEPTANCE', 'FIXED_MATURITY_DATE',
];

function resolveExportSettlementRoute(input: {
  tenorBasis?: TenorBasis | null;
  tenorType: TenorType;
}): { route: ExportSettlementRoute; status: 'RESOLVED' } | { status: 'MANUAL_REVIEW_REQUIRED'; reason: string } {

  if (input.tenorType === 'SIGHT') {
    return { route: 'HONOUR', status: 'RESOLVED' };
  }
  if (input.tenorType === 'DP' || input.tenorType === 'DA') {
    return { status: 'MANUAL_REVIEW_REQUIRED', reason: 'DP/DA settlement routing is not yet defined for this product.' };
  }
  if (input.tenorBasis === 'AFTER_SIGHT') {
    // tenorType === 'SELLERS_USANCE' 已在 3.1 建檔階段被擋下，理論上不會走到這裡；
    // 這裡保留一道防線，只針對「3.1 上線前就已存在的既有資料」——見 3.1 的 Legacy 說明。
    if (input.tenorType === 'SELLERS_USANCE') {
      return { status: 'MANUAL_REVIEW_REQUIRED', reason: 'Legacy contract violates the AFTER_SIGHT/SELLERS_USANCE product policy — requires manual review.' };
    }
    return { route: 'HONOUR', status: 'RESOLVED' };
  }
  if (input.tenorBasis && ACCEPTANCE_TENOR_BASES.includes(input.tenorBasis)) {
    return { route: 'ACCEPTANCE', status: 'RESOLVED' };
  }
  // tenorBasis 缺漏，或不在上面任何一個已知清單裡（含未來新增但還沒定義規則的值）
  return { status: 'MANUAL_REVIEW_REQUIRED', reason: 'Unsupported or missing tenor basis.' };
}
```

---

## 四、Sight Date 的來源與確認時點（新增，Release Blocker 的必要前提）

`AFTER_SIGHT` 的 Base Date 是 Sight Date，但「Sight Date」本身指的是哪個實際發生的動作，目前文件與程式碼都沒有定義過，不能由系統自行假設 `documentPresentationDate` 就等於 Sight Date（兩者概念不同：前者是文件送達的事實，後者是銀行完成審單/確認見票的動作，兩者理論上可能不同一天）。建議新增：

```typescript
sightDate?: string | null;
sightDateSource?: 'ISSUING_BANK_CONFIRMED' | 'AUTHORIZED_PRESENTATION_DATE' | 'MANUAL_AUTHORIZED' | null;
sightDateConfirmedBy?: string | null;    // 確認人（Maker/系統帳號），稽核用
sightDateConfirmedAt?: string | null;    // 確認時間戳，稽核用
```

**本版修正 enum 命名，避免誤讀**：原本的 `'DOCUMENT_PRESENTATION'` 容易被讀成「單據一送達就自動等於 Sight Date」，改名為 `AUTHORIZED_PRESENTATION_DATE`——只有在信用狀條款及銀行作業規則明確允許「以提示日視為見票日」時，才可以用這個來源值；不是文件到了就自動套用。`sightDateConfirmedBy`／`sightDateConfirmedAt` 補齊誰在什麼時候做了這個確認，讓 `sightDate` 有完整的稽核鏈，不是一個沒有來源的日期欄位。

```text
Sight Date 未確認 → Maturity Status = PENDING_BASE_DATE，不得建立正式 Maturity Date
Sight Date 已確認 → 計算 Contractual Maturity Date → 再呼叫 Standing 計算 Operational Payment Date
```

**本版把 `Maturity Status` 從單一「未定/已算」二分，細分成三段生命週期，把「金額 Earmark 邏輯」跟「到期日生效邏輯」分開處理（回應審查意見：兩者不是同一件事，不能共用同一套判斷）**：

```typescript
type MaturityDateStatus =
  | 'PENDING_BASE_DATE'  // 這個 tenorBasis 所需的基準日尚未確認，不得計算 Contractual/Operational Maturity Date
  | 'PENDING_APPROVAL'   // 基準日已確認、已算出日期，但這筆 Acceptance 尚未 Checker Release
  | 'APPROVED';          // 已 Release，Maturity Date 正式生效，可供 A7 到期付款／報表／到期提醒／逾期判斷使用
```

**`PENDING_BASE_DATE` 不是只為 `sightDate` 設計的狀態——不同 `tenorBasis` 各自需要不同的基準日，本版把命名跟語意都改成通用**（回應審查意見：先前版本的欄位命名／註解過度聚焦在 `AFTER_SIGHT` 一種情境，容易讓人誤以為其他 `tenorBasis` 不受這個生命週期規範）：

| `tenorBasis` | 所需基準日 | 未確認時的狀態 |
|---|---|---|
| `AFTER_SIGHT` | `sightDate`（見票日） | `PENDING_BASE_DATE` |
| `AFTER_ACCEPTANCE` | Acceptance Date（承兌日，操作定義見下方待確認事項） | `PENDING_BASE_DATE` |
| `AFTER_BL_DATE` | BL Date（提單日期——**本版更正：不是既有欄位，見下方說明**） | `PENDING_BASE_DATE` |
| `AFTER_INVOICE_DATE` | Invoice Date（發票日期——**本版更正：不是既有欄位，見下方說明**） | `PENDING_BASE_DATE` |
| `AFTER_SHIPMENT_DATE` | Shipment Date（裝運日期——**本版更正：不是既有欄位，見下方說明**） | `PENDING_BASE_DATE` |
| `FIXED_MATURITY_DATE` | 無需另一個基準日——直接使用 `fixedMaturityDate`（**本版查證更正：這個欄位目前也不存在，見下方說明**） | 欄位新增並完成 A1/B1 建檔驗證前，同樣停留在 `PENDING_BASE_DATE` |

**本版更正一個未經查證的錯誤說法**：先前版本一直寫「`AFTER_BL_DATE`／`AFTER_INVOICE_DATE`／`AFTER_SHIPMENT_DATE` 三者的基準日都來自單據本身既有欄位（A3/B3 文件提示時即可取得）」——這句話從未被拿去對照過 `types.ts`，本版查證後確認是錯的：`blDate`／`invoiceDate`／`shipmentDate` 這三個欄位**在 `types.ts`、`requestSchema.ts`、或任何 `analysis/` 底下的規格文件裡都不存在**，唯一跟文件日期相關的既有欄位是 `documentPresentationDate`（A3/B3 用來核對是否逾期提示的「文件送達日」，語意上是銀行收到單據的日期，不是單據上印的 BL／Invoice／裝運日期本身，兩者可能不同天）。也就是說，這三個 `tenorBasis` 的基準日目前**完全沒有地方可以存**，不是「有欄位、只是程式沒讀」，而是「連欄位都還沒新增」——實務上很可能會跟 `AFTER_SIGHT`／`AFTER_ACCEPTANCE` 一樣，長期停留在 `PENDING_BASE_DATE`，直到 A3/B3 新增對應欄位並在文件提示時由 Maker／Checker 輸入為止。真正會停留在 `PENDING_BASE_DATE` 的因此不只 `AFTER_SIGHT`（`sightDate` 定義本身待業務確認，見下方）跟 `AFTER_ACCEPTANCE`（Acceptance Date 定義本身也待業務確認，見下方新增的待確認事項），`AFTER_BL_DATE`／`AFTER_INVOICE_DATE`／`AFTER_SHIPMENT_DATE` 三者現階段也會，直到對應欄位新增為止——本文件在此之前的版本把這三者當成「已經有資料可用」的簡單情境，是沒有查證過的誤判。

**本版再查證一次發現同一類錯誤，這次連本文件自己第 3.1 節大篇幅描述的 `fixedMaturityDate` 也中招**：第 3.1 節的建檔驗證 pseudocode（`assertFixedMaturityDateIsPresent()` 等）與本節上面的表格，先前版本都把 `fixedMaturityDate` 講得像是「A1/B1 建檔時就已確定」的既有欄位——但直接查證 `types.ts`／`db/schema.ts`（跟第 81 行對 `tenorBasis` 做的查證方法完全一樣），`fixedMaturityDate` 這個欄位**同樣完全不存在**，全專案零筆符合。第 3.1 節那段 pseudocode 描述的是**應該怎麼設計**（等 `fixedMaturityDate` 跟 `tenorBasis` 一起新增之後該有的建檔驗證），不是現況——`fixedMaturityDate` 需要跟 `tenorBasis` 一起排進 3.1.1 節的欄位新增與回填順序，不是一個現在就能直接拿來用的既有欄位。這代表第八節先前版本寫的「`FIXED_MATURITY_DATE` 例外，可用既有 `fixedMaturityDate`」同樣是沒查證過的錯誤說法，本版一併更正（見第八節）。

`PENDING_APPROVAL` 這個中間態不影響第四節 Mode A／Mode B 的既有討論——不論最終選 Mode A 或 Mode B，只要基準日已確認、`maturityDate` 已算出但這筆 Acceptance 還沒 Release，狀態就該顯示 `PENDING_APPROVAL`，讓下游系統／畫面可以明確判斷「這個日期能不能被引用」，而不是只能從 `BalanceMovement.status` 間接推斷。

**Acceptance Settlement（Import A7／Export B5-到期結算共通，見 4.2 節）必須同時檢查 Acceptance 自己的 `confirmedBalance` 跟 `maturityDateStatus`，兩個條件都成立才能提交，不能只看其中一個——本版核對過現有程式碼後確認，這不是理論上的預防性建議，是一個真實存在、可驗證的缺口**（下文為求對照方便沿用「A7」稱呼實際觸發此缺口的既有功能，但檢查邏輯本身不是 A7 專屬，見文末重新命名說明）：

核對 `service/balanceService.ts` 的 `movementTypeRegistry` 確認，A7 對應的 `PARTIAL_SETTLE`／`FULL_SETTLE` 目前用的是 `outstandingCapped` 這個共用的充分性檢查（跟 SG 贖回、REIMBURSE、RECLASSIFY_OUT 共用同一套邏輯），實際呼叫 `domain/shgtRedeem.ts` 的 `checkRedeemSufficiency({ redeemAmount, sgAvailableBalance: ctx.availableBalance })`——**這個檢查比對的是 Acceptance 自己的 `availableBalance`，不是 `confirmedBalance`**。而 `availableBalance` 本來就設計成會反映 PENDING 異動（第四節 4.1 已詳細說明）——也就是說，一筆 A6 Submit 完成、CREATE 還是 `PENDING` 的 Acceptance，它自己的 `availableBalance` 就已經顯示 Preview 金額，如果這時候直接對這筆 Acceptance 送出 A7（`PARTIAL_SETTLE`／`FULL_SETTLE`），現行的 `outstandingCapped` 檢查是會通過的——因為它比對的基準本來就包含這筆還沒 Release 的 PENDING CREATE 自己的金額。

**這跟 `balanceService.ts` 自己文件記錄過的另一個 bug 是同一種形狀，只是換了一層**：`assertRootIssueReleased()` 這個既有防護（2026-08-18 修的 S10 bug，doc comment 原文：「a contract's own row is created with status: 'ACTIVE' at Maker Submit time... nothing stopped a second movement... from being created or even Released before the root LC/Confirmation's own foundational ISSUE had ever been Checker-approved」）只覆蓋 `ROOT_INSTRUMENT_TYPES`（`IPLC_LC`／`EPLC_LC`／`EPLC_CONFIRMATION`）——保護的是「根合約自己的 ISSUE 沒 Release 前，不能對根合約做其他動作，也不能在它底下建立新的子合約」。但這個防護**沒有涵蓋子合約自己的基礎動作**：`IPLC_ACCEPTANCE`／`EPLC_ACCEPTANCE`（Acceptance）不在 `ROOT_INSTRUMENT_TYPES` 裡，通篇程式碼也找不到任何「Acceptance 自己的 CREATE 沒 Release 前，不能對這個 Acceptance 做 A7」的等價檢查。換句話說：根層級（LC 的 ISSUE）已經修過的這個 bug 類型，在子層級（Acceptance 的 CREATE）目前還沒有對應的修正——A7 就是這個缺口實際會被觸發的地方。

**本版把這件事從「A7 應該檢查」的建議，提升為「A7 目前確實沒有檢查，需要修正」的驗證過缺口**——但修正時必須小心一個容易犯的錯：**不能把既有的 `settlementAmount <= availableBalance` 檢查改成 `settlementAmount <= confirmedBalance`，兩者用途不同，`confirmedBalance` 不能取代 `availableBalance`**。`domain/shgtRedeem.ts` 自己的 doc comment 記錄過一個 2026-08-15 修過的 bug（LC S001 的 SG G01：一筆 7,000 的 `FULL_REDEEM` 還在 PENDING，另一筆 5,000 的 `PARTIAL_REDEEM` 又通過了，兩筆合計 12,000 超過 7,000 的實際 outstanding）——原因正是當時比對基準用了 `confirmedBalance`（不會反映其他還在 PENDING 的同類贖回/結算），後來才改成比對 `availableBalance`（`Confirmed ± Σ PENDING`，會把其他還沒 Release 的同一筆 Acceptance 上的 PENDING 結算一起net 進去）修好。如果這次為了擋「Acceptance 自己還沒 Release」而把金額檢查換成比對 `confirmedBalance`，等於重新引入這個已經修過的雙重結算漏洞——例如 Acceptance `confirmedBalance = 1,000`，A7-A 先送出 700（PENDING，此時 `availableBalance` 降到 300），A7-B 再送 600：若只比對 `confirmedBalance`（1,000），600 會被誤判通過，但兩筆合計 1,300 已經超過這筆 Acceptance 實際只有的 1,000。

正確做法是**兩組檢查分開、都要做，不是互相取代**——「Acceptance 本身是否已經正式成立、到期日是否已生效」是一組新的前置條件；「這次結算金額是否超過還剩多少可用餘額（already net 掉其他 PENDING 結算）」沿用既有的 `availableBalance` 充分性檢查，不動：

**命名更正（回應審查：這組檢查應該叫「Acceptance Settlement 共通業務檢查」，不是「A7 專屬檢查」）**——4.2 節已確認 Export B5-到期結算（`PARTIAL_SETTLE`／`FULL_SETTLE` 作用在 `EPLC_ACCEPTANCE`）跟 Import A7 是同一段程式邏輯，這裡把函式命名成通用的 `assertAcceptanceSettlementAllowed()`，兩個功能共用同一份實作，不需要各自重寫一次：

```typescript
// Acceptance Settlement 共通前置條件——Import A7、Export B5-到期結算共用，
// 不分 IPLC_ACCEPTANCE／EPLC_ACCEPTANCE，只要是被結算的 Acceptance 合約自己就適用
function assertAcceptanceSettlementAllowed(
  acceptance: AcceptanceContract,
  acceptanceCreateMovement: BalanceMovement,  // 被結算的 Acceptance 自己那筆 CREATE
  settlementAmount: Decimal,
): void {
  // 前置條件（本版新增）——Acceptance 必須已經正式成立、到期日必須已生效，兩者缺一不可
  if (acceptance.confirmedBalance.lte(0) || acceptance.maturityDateStatus !== 'APPROVED') {
    throw new BusinessValidationError(
      'Cannot settle a Preview/un-Released/invalid Acceptance — ' +
      'confirmedBalance must be positive AND maturityDateStatus must be APPROVED.',
    );
  }
  // 前置條件（4.3 節新增，P0；本版修正為 fail-closed，回應審查）——沿用既有的 referencedTransactionId 欄位
  // （doc comment 原文：A6/B4 的 Acceptance CREATE 在 Submit 當下就把它設成來源動用的 movementId，Import 側
  // 已核對確認）。**舊版寫法只在 referencedTransactionId 有值時才檢查，欄位缺失時整段檢查直接跳過、視同放行
  // ——這其實沒有真正達成「必須關聯到已 Release 的來源動用」這個目標，只是把「未關聯」跟「已關聯且已 Release」
  // 兩種情況都當成合法放行**。本版改為 fail-closed：缺少關聯、找不到來源動用、來源動用未 RELEASED，三種情況
  // 都必須拒絕——見下方「回應審查」段落，這個修正在正式啟用前需要先確認既有資料／Export 側的相容性
  const sourceMovementId = acceptanceCreateMovement.referencedTransactionId;
  if (!sourceMovementId) {
    throw new BusinessValidationError(
      'Acceptance CREATE has no referencedTransactionId — cannot verify its source UTILIZE/ACCEPT movement has been Released.',
    );
  }
  const sourceMovement = findMovementById(sourceMovementId);
  if (!sourceMovement) {
    throw new BusinessValidationError('Acceptance CREATE references a source movement that cannot be found.');
  }
  if (sourceMovement.status !== 'RELEASED') {
    throw new BusinessValidationError(
      'The source UTILIZE/ACCEPT movement this Acceptance was created from has not been Released yet.',
    );
  }
  // 一致性檢查（本版新增，回應審查：只確認「某一筆 RELEASED movement」還不夠，還要確認這筆確實是「這張 Acceptance
  // 自己根合約」底下的動用——用 currency（BalanceMovement 既有欄位）跟 resolveParentContract() 解出的根合約
  // balanceContractId 比對；這個系統的資料模型目前沒有 tenantId 欄位，不比對）
  const rootContract = resolveParentContract(acceptance);
  if (sourceMovement.currency !== acceptance.currency) {
    throw new BusinessValidationError('Source movement currency does not match this Acceptance.');
  }
  if (!rootContract || sourceMovement.balanceContractId !== rootContract.balanceContractId) {
    throw new BusinessValidationError("Source movement does not belong to this Acceptance's own root LC/Confirmation.");
  }
  // movementType 白名單檢查（本版新增，回應審查：同一根合約、同一 currency 底下可能有多筆已 RELEASED 的
  // movement——ISSUE、AMEND_INCREASE、AMEND_DECREASE 都可能符合前面兩個檢查，只看「已 RELEASED」不夠精確，
  // 必須確認這筆來源動用的 movementType 本身就是「可以是 Acceptance 來源」的那一種）。
  // Import（IPLC_ACCEPTANCE）：只有 UTILIZE 會是來源——附錄 A 已確認 IPLC_LC 沒有 ACCEPT 這個 movementType，
  // MOVEMENT_DIRECTION 表（domain/balanceDerivation.ts）裡 IPLC_LC 系列只有 ISSUE／AMEND_INCREASE／
  // AMEND_DECREASE／UTILIZE 四種，Acceptance 只可能從 UTILIZE 轉出。
  // Export（EPLC_ACCEPTANCE）：只有 ACCEPT（Usance 分支）會是來源——附錄 A 已確認 HONOUR（Sight 分支）從不
  // 建立 EPLC_ACCEPTANCE，兩者不對稱，不能把 HONOUR 也列進允許清單。這份清單本身沿用附錄 A 已核對過的
  // B4 分支對應關係，但 Export 側是否真的把 referencedTransactionId 設成這筆 ACCEPT 的 movementId，仍是
  // 附錄A標註的待查證項目——這裡假設「一旦有值，型別上就該是 ACCEPT」，不是「Export 側一定有值」
  const ALLOWED_SOURCE_MOVEMENT_TYPES: Readonly<Record<string, readonly string[]>> = {
    IPLC_ACCEPTANCE: ['UTILIZE'],
    EPLC_ACCEPTANCE: ['ACCEPT'],
  };
  const allowedTypes = ALLOWED_SOURCE_MOVEMENT_TYPES[acceptance.instrumentType] ?? [];
  if (!allowedTypes.includes(sourceMovement.movementType)) {
    throw new BusinessValidationError(
      `Referenced movement type "${sourceMovement.movementType}" is not an eligible Acceptance source for ${acceptance.instrumentType} (expected one of: ${allowedTypes.join(', ')}).`,
    );
  }
  if (settlementAmount.lte(0)) {
    throw new BusinessValidationError('Settlement amount must be greater than zero.');
  }
  // 金額充分性檢查——沿用既有 outstandingCapped／checkRedeemSufficiency 的邏輯，比對 availableBalance 不是 confirmedBalance，
  // 這樣才能正確net掉其他還在 PENDING、尚未 Release 的同一筆 Acceptance 結算，避免雙重結算超額
  if (settlementAmount.gt(acceptance.availableBalance)) {
    throw new BusinessValidationError('Settlement amount exceeds the Acceptance available balance.');
  }
}
```

**回應審查：fail-closed 在正式啟用前，需要先處理兩個相容性風險，否則可能反過來擋下合法的既有交易**：

1. **既有（Legacy）Acceptance 資料**——`referencedTransactionId` 這個欄位是 2026-08-16 才修的 bug（doc comment 原文：「extending the same-day businessEventId fix to A6/B4」），代表在這之前建立的 Acceptance CREATE，即使業務上確實有對應的來源動用，這個欄位也可能是空的。這跟 3.1.2 節 Legacy Backfill 是同一類問題——fail-closed 上線前，需要先跑一次資料檢查，確認正式環境有多少筆 `APPROVED` 但 `referencedTransactionId` 為空的既有 Acceptance；若數量不為零，需要業務判斷是要（a）針對這批既有資料補建關聯、（b）用一個明確的例外清單／時間戳記門檻讓 fail-closed 只套用在門檻之後建立的 Acceptance，還是（c）其他處理方式，不應該讓 fail-closed 上線當下就直接擋下這批既有合法交易的後續結算。
2. **Export 側對稱性尚未確認（附錄 A）**——本文件已經明確標註 Export 側（`EPLC_ACCEPTANCE` 等）是否也把 `referencedTransactionId` 設成對應的 `ACCEPT`／`HONOUR` movementId 尚未查證。**在工程確認這一點之前，fail-closed 不能直接套用到 Export 側**——如果 Export 目前完全沒有設定這個欄位，fail-closed 上線的瞬間會讓所有 Export B5-到期結算全部被擋下，這比現在的「未驗證但至少放行」更嚴重。建議的順序是：先由工程查證 Export 側現況（見附錄 A 的待確認事項）→ 若確認 Export 也有設定，兩側一起切換成 fail-closed；若尚未設定，Export 側需要先補上這個欄位的寫入邏輯，兩者都完成後才能統一切換，中間不應該有「Import fail-closed、Export 仍 fail-open」這種不對稱的過渡態長期存在而未被明確追蹤。

**上面新增的 `referencedTransactionId` 檢查，更好的位置其實是提前到 Acceptance `CREATE` 自己 Release 的當下（P0，建議優先於只在結算時檢查）**：與其等到 A7／B5 才發現來源動用還沒 Release，更根本的做法是讓 Acceptance `CREATE` 自己的 `release()` 也做同一個檢查——這樣一來，Acceptance 本身要 Release，前提就是它引用的來源動用已經先 Release，等於把 doc comment 原本描述的預期順序（先 Release 根合約、再建立 Acceptance）直接變成程式碼層面的硬性規則，而不只是一個沒被驗證的假設。結算時的檢查則作為第二層防線保留，涵蓋這條規則被繞過或欄位未正確填入的情況；上面兩個相容性風險（既有資料、Export 對稱性）在這個更早的檢查點同樣適用，不因為挪到 Release 時點就自動解決。

**架構層面的建議（P1，非本次必要，與上面的 `referencedTransactionId` 檢查是兩件互補的事，不是同一件）**：比照 `assertRootIssueReleased()` 對 `ROOT_INSTRUMENT_TYPES` 的既有保護模式，可以考慮新增一個通用的子合約防護（例如 `assertAcceptanceCreateReleased()`），直接檢查 Acceptance 自己的 `CREATE` 這筆 `BalanceMovement` 的 `status === 'RELEASED'`（這條管的是「Acceptance 自己有沒有 Release」）——這跟上面新增的 `referencedTransactionId` 檢查（管的是「Acceptance 引用的來源動用有沒有 Release」）是兩個不同方向的防護，可以疊加，也能重複用在其他共用 `outstandingCapped` 的 movementType 上（`REIMBURSE`／`RECLASSIFY_OUT`，是否需要同樣的防護待工程確認影響範圍，本文件不預設答案）。分層設計：這兩層子合約防護只管「Release 狀態」本身；`confirmedBalance > 0`／`maturityDateStatus === 'APPROVED'`／金額不超過 `availableBalance` 這三條則是 `assertAcceptanceSettlementAllowed()` 這組 Acceptance Settlement 共通業務檢查，適用 Import A7 與 Export B5-到期結算兩個進入點，不應該不經業務確認就套用到 B5-求償收回或其他子合約／movementType（見 4.2 節）。

是否允許分批結算（例如 Acceptance 1,000、A7 先結 400、剩餘 600 留待下一次）本文件不預設答案，需依既有產品規則確認；上面的檢查只保證「結算金額必須是正數且不超過還剩下的可用餘額」這個底線，不預設一定要一次全額結清。到期日相關的正常到期／提前付款／逾期付款是否各自需要不同的授權例外流程，同樣待業務確認，不在本次範圍內展開。

**驗收案例（九組，涵蓋未 Release／已 Release／並發 PENDING／金額異常／到期日未生效／並發 Release／來源動用未 Release／來源動用關聯缺失／來源動用型別錯誤九種情境；`assertAcceptanceSettlementAllowed()` 是共通邏輯，下面用 A7 舉例，Export B5-到期結算對 `EPLC_ACCEPTANCE` 套用完全相同的九組案例，不需要另外設計一份）**：

```text
案例一：A6/B4 尚未 Release → confirmedBalance=0, availableBalance=1,000, maturityDateStatus=PENDING_APPROVAL → Settlement Submit 1,000 → 拒絕
案例二：A6/B4 已 Release → confirmedBalance=1,000, availableBalance=1,000, maturityDateStatus=APPROVED → Settlement Submit 1,000 → 允許
案例三：已有一筆 Pending Settlement-A（700）→ availableBalance 降至 300 → 再送 Settlement-B（600）→ 拒絕（600 > 300，即使 confirmedBalance 仍是 1,000）
案例四：Settlement 金額為 0 或負數 → 拒絕
案例五：confirmedBalance > 0 但 maturityDateStatus 仍是 PENDING_APPROVAL（到期日尚未正式生效）→ Settlement Submit → 拒絕
案例六：兩筆 Settlement 幾乎同時提交或核准，合計超過可用餘額 → 最多只允許符合剩餘餘額的一筆成功，其餘拒絕或需要重新驗證（跟第五節版本檢查／Optimistic Locking 是同一類併發控制問題）
案例七：Acceptance 自己已 APPROVED（confirmedBalance > 0, maturityDateStatus = APPROVED），但它 referencedTransactionId 指向的來源 UTILIZE／ACCEPT 這筆動用 status 仍是 PENDING（尚未真正 Release）→ Settlement 必須拒絕，即使 Acceptance 自己所有既有欄位看起來都已經 APPROVED
案例八：Acceptance 自己已 APPROVED，但它自己的 CREATE 這筆 `referencedTransactionId` 是 null／空值（例如 Legacy 資料，或呼叫端沒有正確填入）→ Settlement 必須拒絕，不能因為「沒有值可比對」就當作沒有這條檢查、直接放行——這正是 fail-closed 修正要防的情況，舊版寫法（有值才檢查）在這個案例會錯誤地允許結算
案例九（本版新增，回應審查：movementType 白名單）：Acceptance 的 `referencedTransactionId` 指向同一根合約、同一 currency、已 `RELEASED` 的**其他** movement（例如 `AMEND_INCREASE`、`ISSUE`，而不是它真正應該對應的 `UTILIZE`／`ACCEPT`）→ Settlement 必須拒絕，即使 currency 與根合約都比對得上——這種情況通常代表呼叫端把 `referencedTransactionId` 填錯了，只檢查「已 RELEASED」跟「同根合約」還不夠精確
```

若產品不允許 Partial Settlement（一次只能全額結清），案例三應改成驗證「已存在一筆 Pending Settlement 時，不得再提交另一筆」，這點待業務確認，本文件不預設答案。

**範圍定位（回應審查意見）**：A7 在這份文件裡的角色是 Maturity Date／`MaturityDateStatus` 這條主線的**下游控制點**——它之所以出現在這裡，是因為 A7 剛好是「Acceptance 的 Maturity Date 是否已生效」跟「Acceptance 自己的 CREATE 是否已 Release」這兩件事第一次被實際用到的地方，不是本文件要把 A7 本身的完整驗收規格納入主體討論。上面提到的通用子合約防護 `assertAcceptanceCreateReleased()`，以及 `REIMBURSE`／`RECLASSIFY_OUT` 是否需要同樣保護，屬於比本次 Maturity Date 決策更廣的「子合約基礎動作 Release 控制」題目——如果後續要深入這個題目，適合另開一份聚焦文件（例如「子合約基礎動作 Release 控制檢討」），本文件到此為止只記錄「A7 是這個缺口會被觸發的已驗證入口」跟對應的最小必要修正，不在此展開子合約防護的完整通用設計。

**`sightDate` 具體對應銀行內部哪一個操作動作（收單／審單完成／確認見票），仍需業務/Ops 最終拍板，本文件不預設答案**——上面三個 `sightDateSource` 列舉值是候選集合，不是最終答案；只確立「未確認前必須是 `PENDING_BASE_DATE`」這個原則不受定義細節影響。

**Sight Date／Maturity Date 是否要等 Checker Release 才正式生效——這個問題原本拆成兩半分開回答，本版兩半都已定案，不再是待確認問題**：Balance 金額這一半，核對 `domain/balanceDerivation.ts`／`domain/offBalanceExposure.ts` 後確認既有架構本來就正確，不需要改動；`maturityDate` 這一半，本版新增的 `MaturityDateStatus` 三段生命週期（見下文）已經定案「只有 `APPROVED` 可供正式下游引用」，同樣不再是開放問題。過程記錄如下：

核對 `routes/balanceMovements.ts` 第 42–61 行確認，**現行程式碼的 Standing 呼叫跟 Maturity Date 計算是在 Maker Submit 當下、`POST /balance-movements` 這支 API 同步執行的**（`isAcceptanceCreate` 判斷式成立時，直接呼叫 `service.calculateAcceptanceMaturityDate()` 並把結果寫進 `body.maturityDate`，再交給 `createMovement()`）——這點跟前一版一樣，先如實記錄。

**（半確認）「Maker Submit 只是預覽，Checker Release 才正式生效」這個精神，對「金額」而言，其實已經是現行架構本來就有的行為，不需要改**：核對 `domain/balanceDerivation.ts` 第 76–78 行的 `computeConfirmedBalance()`：

```typescript
export function computeConfirmedBalance(movements: readonly Pick<BalanceMovement, 'movementType' | 'ceilingAmount' | 'status'>[]): Decimal {
  return movements.filter((m) => m.status === 'RELEASED').reduce((acc, m) => acc.plus(signedAmount(m)), ZERO);
}
```

`Confirmed Balance`（正式、對外的餘額數字）**只加總 `status === 'RELEASED'` 的 `BalanceMovement`**；一筆 Maker Submit 完成、狀態還是 `PENDING` 的 A6 Acceptance `CREATE`，只會計入 `computeAvailableBalance()`，不會計入 `Confirmed Balance`。這代表：**A6/B4 這筆 Acceptance 本身「占不占用正式 Balance」這件事，現行架構已經天然做到「Submit=預覽、Release=正式」，不需要為這個目的另外改程式碼**——上一輪審查建議的「Maker Submit 應該只產生預覽、不正式更新 Balance」，就 Balance 金額而言已經是既有事實，只是文件之前沒有明講、也沒有拿程式碼驗證過。

**這裡講的 `computeAvailableBalance()` 是哪一個 BalanceContract 自己的，容易讀混，明確一下（呼應 4.1 節完整範例）**：A6 這筆 `CREATE` 建立在**它自己那個新的 `IPLC_ACCEPTANCE` 合約**上，PENDING 期間影響的是**這個新 Acceptance 合約自己的** `availableBalance`（可以在 Maker/Checker 畫面上顯示為 Preview 用途），跟**父合約 `IPLC_LC` 自己的** `availableBalance` 是兩組完全獨立的數字——LC 自己的 `availableBalance` 在 A6 Submit 這一步**不會**、也不應該再被扣一次，因為額度已經在 A3 那一步透過 `UTILIZE` 的 Earmark 扣過了（見 4.1 節完整範例的 LC 欄位，A6 Submit 前後 LC `availableBalance` 都維持 99,000 不變）。驗收時應該明確拆成兩條分別檢查（見第八節）：LC 自己的 `availableBalance` 不因 A6 Submit 而重複扣減；Acceptance 合約自己的 `availableBalance`／`confirmedBalance` 依它自己的 PENDING/RELEASED 生命週期各自變化。

**（本版收斂，不再是開放問題）這個「已驗證」的結論，範圍原本只到 Balance 金額，不涵蓋 `maturityDate` 這個欄位本身**：`domain/balanceDerivation.ts`／`domain/offBalanceExposure.ts` 兩份檔案通篇沒有出現任何一次 `maturityDate` 字樣——換句話說，「PENDING 的 Balance 不算進 Confirmed Balance」這條既有規則，管的是**金額**怎麼加總，不直接涵蓋 `maturityDate` 這個欄位。但上面的 `MaturityDateStatus` 三段生命週期已經把這半個問題定案，不再列為待確認：**`PENDING_BASE_DATE`／`PENDING_APPROVAL` 這兩個非 `APPROVED` 狀態下，`maturityDate` 一律只能是 Maker/Checker 畫面上的 Preview，正式下游（A7 到期付款、正式報表、到期提醒、逾期判斷）一律禁止引用；只有 `maturityDateStatus === 'APPROVED'` 才視為正式生效**。`routes/balanceMovements.ts` 現行程式碼在 Maker Submit 當下就把算好的日期寫進 `body.maturityDate`，這件事本身不需要改——需要新增的是 `maturityDateStatus` 這個獨立狀態欄位，讓下游系統可以直接依狀態值判斷能不能用，不必自己再去推斷 `BalanceMovement.status` 或找補資訊。真正還沒定案、留在第九節的，只剩「`sightDate` 尚未取得時是否允許先送出 A6 Submit」（即 Mode A vs Mode B 本身該選哪個），跟「`maturityDate` 能不能被下游引用」是兩個不同的問題，不要混在一起。

**Mode A vs Mode B——若業務判斷「已確認」半邊需要動，這裡先把兩個可能方向攤開，本文件不預設選哪一個**：

| | Mode A：Submit 允許 `sightDate` 未定，Release 前擋下 | Mode B：`sightDate` 未確認就不允許 Submit |
|---|---|---|
| Maker Submit | 允許成立，`maturityDate = null`／`Maturity Status = PENDING_BASE_DATE` | 不允許成立，`RequestValidationError` 擋在 Submit 當下 |
| 未確認 `sightDate` 時 | `Maturity Status = PENDING_BASE_DATE`（Submit 允許成立） | Submit 本身直接被拒絕 |
| Checker Release（**兩個 Mode 都需要**，差別只在 Release 前是否可能還卡在未確認狀態） | 若 `sightDate` 仍未確認，Release 本身被擋下，需先由 Maker（或另一個有權限的角色）補上 `sightDate` 才能繼續；已確認後 Release 正常走 Maker/Checker 流程，`maturityDateStatus` 變 `APPROVED` | Submit 階段就已經確保 `sightDate` 存在，Release 不會再卡在「`sightDate` 未確認」這個原因上，但 Checker Release 本身仍然是必要步驟，`maturityDateStatus` 同樣要等 Release 才變 `APPROVED` |
| 對既有流程的影響 | 較小——現行「Submit 當下算 Maturity Date」的既有模式不變，只是 `sightDate` 未定時計算結果是 `PENDING_BASE_DATE` 而非報錯 | 較大——需要在 Submit 這一步就先取得 `sightDate`，可能要求前端／API 呼叫方在送出 A6/B4 CREATE 之前就先完成 Sight Date 確認的另一個步驟 |
| 何時適合 | 若業務流程允許「先建檔、後補 Sight Date」（例如文件審核跟合約建檔在組織上是分開的兩個步驟） | 若業務要求「沒有 Sight Date 就不該有這筆 Acceptance 存在」 |

第四節前段已經定義 `Maturity Status = PENDING_BASE_DATE` 這個狀態本身，實際上就是 Mode A 的行為（Submit 允許成立，只是標記為未定）——**若不特別要求改動，Mode A 是與現行程式碼行為最接近、改動範圍最小的選項**，但最終選擇仍需業務確認，不由本文件片面決定。

### 4.1 明確不採納一項審查意見：「Maker Submit 不得更新 Available Balance」——與已核對的實際系統行為矛盾

本版收到一輪 9.2/10 的審查，其中兩個 P0 都建立在「業務已核定：Maker Submit 除了 `Pending Earmark Total` 之外不得更新其他 Balance（含 `Available Balance`）」這個前提上，並要求把現行「Maker Submit 當下 `availableBalance` 就已經反映這筆 PENDING 異動」的行為改成「只在 Checker Release 後才更新 `Available Balance`／`Acceptance Balance`」。

**本文件不採納這兩個 P0，理由如下**——這不是本文件片面認定，而是直接跟使用者核對、並用具體數字驗證過的結論：

1. `computeAvailableBalance()`（`domain/balanceDerivation.ts`）的既有設計本來就是 `Confirmed ± Σ PENDING`（Design doc §3.3），這是本次 Maturity Date 工作之前就存在、套用在 A1/A3/A8 等所有既有功能上的通用算法，不是本文件新引入的行為。
2. `pendingEarmarkTotal` 本身在 `service/balanceService.ts` 的 `assembleSnapshot()` 裡是 `available.minus(confirmed)` 算出來的——換句話說 `Pending Earmark Total` 依賴 `Available Balance` 已經反映 PENDING 異動才能算出來，兩者是同一組數字的兩種呈現方式，不是「只能動一個、不能動另一個」的獨立欄位。
3. 核對 `routes/balanceMovements.ts`／`service/balanceService.ts` 的 `acknowledgeArrival()` doc comment 後確認一個更根本的機制：**A3/A3S 的 Checker 步驟本來就刻意設計成「只是 acknowledgment，不是真的 Release」**——原文：「A3/A3S's own Checker step is still deliberately acknowledgment-only (the LC's own UTILIZE genuinely stays PENDING; A4/A6 finalizes it for real later)」。也就是說，A3 建立的 `UTILIZE` 這筆 `BalanceMovement`，`status` 從 Maker Submit 到 Checker「核准」，**自始至終都還是 `PENDING`**——Checker 那個動作只寫入 `acknowledgedBy`／`acknowledgedAt` 兩個獨立欄位（給畫面判斷要不要繼續顯示在 Checker Queue 用），不會把 `status` 改成 `RELEASED`。這筆 `UTILIZE` 真正被 Release（`status` 變 `RELEASED`）要等到 A4（Sight）或 A6（Acceptance）finalize 它的那一刻。

把這個機制套進使用者提供、並直接確認過的 A1→A3→A6 數字序列（金額：A1 面額 100,000；A3 提示文件金額 1,000；A6 Acceptance 金額 1,000），並補上使用者要求的 Acceptance Balance 欄位（A6 CREATE 建立在另一個獨立的 `IPLC_ACCEPTANCE` BalanceContract 上，`Acceptance Balance` 就是那個合約自己的 `confirmedBalance`）：

| 階段 | LC `confirmedBalance` | LC `availableBalance` | LC `pendingEarmarkTotal` | Acceptance Balance | LC 這筆 `UTILIZE` 的 `status` | 畫面顯示（依 CLAUDE.md「Event Status Display Mapping」） |
|---|---|---|---|---|---|---|
| A1 Approved | 100,000 | 100,000 | 0 | 0（尚無 Acceptance 合約） | — | — |
| A3 Submit（建立 UTILIZE） | 100,000 | 99,000 | -1,000 | 0 | `PENDING` | EARMARKING |
| A3 acknowledge（俗稱「A3 Approve」，`status` 不變） | 100,000 | 99,000 | -1,000 | 0 | 仍是 `PENDING` | EARMARKED |
| A6 Submit（建立 Acceptance `CREATE`，同一筆 `UTILIZE` 仍未變動） | 100,000 | 99,000 | -1,000 | 0（可顯示 Preview：1,000） | 仍是 `PENDING` | PENDING |
| A6 Release（同一筆 `UTILIZE` 才真正 finalize 為 `RELEASED`；Acceptance `CREATE` 也 `RELEASED`——**但兩者是呼叫端分兩次呼叫的獨立操作，不是同一次原子操作，見下方修正說明**） | 99,000 | 99,000 | 0 | 1,000 | `RELEASED` | APPROVED |

這張表跟使用者原本給的數字完全吻合，而且解釋了「為什麼 A3 acknowledge 之後 Confirmed Balance 沒有變」——不是巧合或近似值，是因為 A3 那筆 `UTILIZE` 的 `status` 本來就設計成一路維持 `PENDING` 到 A4/A6 才 finalize，`acknowledgedAt` 只是另一個獨立於 `status` 之外、給 UI 用的欄位。這正好是「Maker Submit 當下就更新 `Available Balance`、但 `Confirmed Balance`／`Acceptance Balance` 要等真正 Release 才更新」的具體證明——不但 Balance 金額如此，A6 這筆全新的 Acceptance Balance 本身也遵循同一套 Submit=Preview／Release=正式的既有原則，跟審查意見要求的方向相反。

**`Off-Balance Exposure` 全程顯示 0，是正確的，但不是因為「LC 未使用餘額算出來是 0」**——`domain/offBalanceExposure.ts` 這個欄位的定義是「Σ (PENDING+RELEASED) SHGT ISSUE 淨額」，專門處理 Shipping Guarantee（SG）這類或有負債對 LC 的淨額，只有當 `instrumentType` 是 `IPLC_LC`／`EPLC_LC` 且存在對應的 SHGT 合約時才會有非零值。上面這個例子完全沒有出現 SG／Shipping Guarantee，所以 `Off-Balance Exposure = 0` 是「這個情境沒有 SG」的正確結果，不是「LC 承諾未使用金額」的意思——這兩個概念不應該混為一談，若真的需要「LC 尚未動用的承諾額度」這種一般性指標，需要另外定義，不是重用 `Off-Balance Exposure` 這個既有、語意已經專屬 SG 的欄位。**命名層面的建議（非強制，`offBalanceExposure` 是既有對外欄位名，改名有相容性成本）**：若日後要新增 API／畫面欄位，可以考慮取更精確的名字（例如 `sgOffBalanceExposure`），或至少在欄位說明文件裡註明「僅反映 Shipping Guarantee 相關 Exposure，不代表一般 LC 未使用餘額」；本文件不要求現在就改既有欄位名稱。

**`Pending Earmark Total` 這個欄位名稱在 A3 acknowledge 之後容易讓業務使用者誤解（非強制，同樣是既有對外欄位名，命名層面建議）**：從底層技術狀態看，A3 acknowledge 之後這個欄位維持 `-1,000` 是正確的（因為 `UTILIZE` 仍是 `PENDING`，見上文機制說明），但業務使用者看到「A3 已經 Approved，為什麼還叫 Pending Earmark」可能會困惑。兩個方向擇一，不強制立即執行：(a) 維持欄位名稱，但在畫面 Tooltip／欄位說明補一句「本欄位包含已 Earmark、但尚未由 A4／A6 正式轉換的金額，不代表這筆 Earmark 本身還沒被核准」；(b) 若之後有機會做畫面／API 命名的整體調整，可以考慮改成語意更中性的名稱（例如 `Outstanding Earmark Total`）。

**修正（本版，核對 `service/balanceService.ts` 檔頭 doc comment 後發現）：上一版「A6 Release 是涵蓋 LC＋Acceptance 兩個合約的單一原子交易」這個描述是錯的，需要更正**——`service/balanceService.ts` 檔頭原文明講：「Deliberately does NOT implement the linked 'UTILIZE+CREATE Acceptance' ... combination as a single server-side operation — Design doc §7.4's 'one movement, one call' principle means the CALLER (the Node.js 中台 orchestrator) makes two separate calls for a Usance drawing: release the UTILIZE/ACCEPT, then create+release the Acceptance CREATE. This keeps release() a plain, uniform state transition with no hidden cross-contract side effects.」——也就是說，**這個微服務自己刻意不把「UTILIZE finalize」跟「Acceptance CREATE Release」合成一個跨合約的資料庫交易**，兩者是外部呼叫端（中台 Orchestrator）分兩次獨立呼叫這個服務完成的：

```text
呼叫一：POST .../balance-movements/{movementId}/release（Release 這筆 A3 建立的 UTILIZE）
  → 在這一次呼叫「自己的」DB Transaction 內完成：UTILIZE PENDING→RELEASED、LC confirmedBalance 扣減、pendingEarmarkTotal 收斂為 0
呼叫二：POST /balance-movements（建立 Acceptance CREATE）+ POST .../release（Release 它）
  → 在這一次呼叫「自己的」DB Transaction 內完成：Acceptance CREATE PENDING→RELEASED、Acceptance confirmedBalance 建立、
    contractualMaturityDate／operationalPaymentDate／maturityDateStatus（變 APPROVED）／standingCalculationId／calendarSnapshotId
    全部寫在這筆新建的 Acceptance 合約自己的列上
```

**這個設計本身其實是自洽的，不是缺陷**——因為 Maturity Date 相關欄位（`contractualMaturityDate`／`maturityDateStatus`／`standingCalculationId`／`calendarSnapshotId`）本來就定義在 Acceptance 合約自己身上（第五節已核定），不是 LC 合約的欄位，所以「呼叫二」自己就能把這些欄位全部原子性地寫完，不需要跨合約交易——**但這代表「呼叫一」成功、「呼叫二」失敗或根本沒送出」這個中間狀態是可能真實發生的**：LC 這筆 `UTILIZE` 已經 finalize（`confirmedBalance` 已扣減），但對應的 Acceptance 合約還沒建立——錢已經從 LC 的 Confirmed Balance「離開」，但還沒有一筆正式的 Acceptance 負債記錄下來。這是兩個各自獨立呼叫、各自獨立 Transaction 之間的落差，Balance Component 自己的兩次呼叫各自都是原子的，但**兩次呼叫合起來不是原子的**，需要由中台 Orchestrator 自己的重試／補償邏輯負責銜接（例如呼叫二失敗時要能重試，或提供人工介入的補救流程）——**這是本文件新發現、需要業務／工程確認 Orchestrator 端如何處理的開放問題，不在 Balance Component 這個微服務自己的職責範圍內解決**。

**Standing 的 HTTP 呼叫本身，仍然不能天真地放進任何一次呼叫的 DB Rollback 邊界**——這點結論不變，只是要放對位置：`operationalPaymentDate`／`standingCalculationId`／`calendarSnapshotId` 是「呼叫二」（Acceptance CREATE）需要的資料，取得它們的 Standing HTTP 呼叫必須在「呼叫二」自己的 DB Transaction 開始之前先完成並拿到結果：

```text
Step 1（呼叫二的 DB Transaction 之外）：若 Standing 尚未在 Submit 階段呼叫過，或呼叫過但需要重新驗證，先呼叫 Standing 取得 operationalPaymentDate／standingCalculationId／calendarSnapshotId
Step 2：開啟「呼叫二」自己的 DB Transaction，鎖定 Acceptance（及讀取 LC）相關資料列
Step 3：在 Transaction 內重新確認計算依據（tenorBasis／tenorDays／sightDate／calendar／版本號）跟 Step 1 呼叫 Standing 當下一致——見下方版本檢查
Step 4：一致 → 在同一個 Transaction 裡完成 Acceptance CREATE Release、Maturity Date 相關欄位、Standing 結果持久化所有資料庫寫入；不一致 → Rollback，回到 Step 1 用最新資料重新呼叫 Standing
Step 5：Commit；任一步寫入失敗 → 這次「呼叫二」的 Transaction Rollback，Standing 那次呼叫本身不需要（也無法）撤銷，只是這次 Acceptance CREATE 沒有寫入任何結果，可以重試（「呼叫一」LC 端已經 finalize 的結果不受影響，也不會被這裡的 Rollback 撤銷——這正是上面提到的中間狀態風險）
```

**若 Standing 已經在 Maker Submit 階段呼叫過（現行程式碼就是這樣，見上文第 183 行），Checker Release 時應該重新確認計算依據是否仍然有效，必要時重新呼叫 Standing（本版依審查意見更正用詞精確度）**：`calendarSnapshotId` 對應的快照本身應該是不可變、可精確重現的歷史版本，不會因為時間經過而「失效」——真正需要在 Release 前確認的，是 `tenorBasis`／`tenorDays`／`sightDate`／適用行事曆這幾個 **Submit 時的計算輸入**是否在 Submit 到 Release 之間被其他 Amendment 改變過（改變了就代表 Submit 當下算出的 `maturityDate` 已經過期，必須重新呼叫 Standing）；至於行事曆本身在這段期間發布了新版本，是否要改採新版重算，屬於獨立的 Recalculation Policy 決定，不是「舊 Snapshot 過期了」，不得在沒有明確政策依據的情況下靜默更換 Snapshot。Release 前應該重新比對這幾項計算輸入是否跟 Submit 當下一致，不一致就重新呼叫 Standing 計算，不能直接沿用 Submit 時的舊結果。

**Standing 呼叫（Step 1）跟 DB Transaction 開啟（Step 2）之間仍有一段時間差，光是「Transaction 之前比對過一次」不夠**：這段時間差裡，仍然可能有另一筆 Amendment 搶先改變了 `tenorBasis`／`tenorDays`／`sightDate`／行事曆，而 Release 卻沿用了 Step 1 那次呼叫的舊結果。單純把比對放在 Transaction 開始之前並不能防住這個競態，比對本身必須在 Transaction **內**、鎖定相關資料列之後再做一次，用 Optimistic Locking（例如 Acceptance／LC 合約各自的 `version` 欄位）或 Row-level Lock 確保：Transaction 內重新讀到的 `tenorBasis`／`tenorDays`／`sightDate`／行事曆／版本號，跟 Step 1 呼叫 Standing 時用的輸入完全一致，才真正寫入並 Commit；不一致就整批 Rollback，回到 Step 1 用最新資料重新呼叫 Standing，不能只在 Transaction 外做一次性檢查就當作足夠。

**「呼叫一」跟「呼叫二」都應該各自支援 Idempotency，避免重送造成重複扣減／重複建立 Acceptance**：Checker 端網路逾時重試、或使用者重複點擊，都可能讓同一筆 Release 請求（呼叫一）或同一筆 Acceptance CREATE 請求（呼叫二）被送出兩次——各自的 API 都應該能辨識「這筆已經處理過」並直接回傳原本的結果，而不是重複扣減一次 LC Balance，或重複建立第二筆 Acceptance。這點已列入第八節驗收標準。**呼叫二（Acceptance CREATE）的 Idempotency Key 建議由 LC Number + IB Number + Acceptance Reference + Release Request ID 組成**——同一組 Key 重送，直接回傳第一次成功的結果（Acceptance Balance 不重複增加）；同一組 Key 但 payload 內容跟第一次不同，應該拒絕並記錄異常，不能靜默套用新的內容。

**結論**：Balance 金額的「預覽 vs 正式」問題，答案是既有架構本來就是對的（`Available Balance` 本應在 Submit 當下就反映 PENDING 異動；`Confirmed Balance`／新建立的 Acceptance Balance 則要等真正 Release／finalize 才更新），不需要修改，也不應該為了迎合一份跟實際系統行為矛盾的審查意見去改動 `computeAvailableBalance()` 這個影響全部既有功能的通用邏輯。`maturityDate` 欄位本身是否需要 Submit/Release 兩階段保護，本版已用第四節的 `MaturityDateStatus` 三段生命週期定案（只有 `APPROVED` 可供正式下游引用）——這兩個問題現在都已收斂，唯一還留在第九節的待確認事項，是「`sightDate` 未取得時是否允許先 A6 Submit」（Mode A vs Mode B），不是 `maturityDate` 能不能被下游引用本身。

---

### 4.2 B4／B5 對等控制——結論與分流矩陣（回應審查：Export B4→B5 沒有對等於 Import A6→A7 的描述）

上一輪審查指出，本文件詳細描述了 Import A6→A7，卻沒有對等描述 Export Usance 的 B4→B5，並要求「請讀一下代碼 把B4 B5 澄清清楚」。**核對程式碼後的結論：B4／B5 跟 A6／A7 並不是簡單的一對一對稱關係——B4 比 A6 多一個 Import 完全沒有的資產面求償權維度，B5 這個功能代號底下實際上包著兩種結構不同的操作**。這一節只保留由此推導出的分流矩陣與後端判斷依據（本文件真正的決策/建議部分）；完整的程式碼比對過程、逐項引用與比較表，屬於單純解釋既有功能邏輯、不含新決策，移到**附錄 A**，避免決策主體被背景說明稀釋。

**B5 分流控制矩陣（把附錄 A 的結論拆成四個具體分支，供 API／後端分流判斷使用）**：

| B5 分支 | 合約種類（`instrumentType`） | `movementType` | 是否要求 `maturityDateStatus === 'APPROVED'` |
|---|---|---|---|
| Acceptance 到期結算 | `EPLC_ACCEPTANCE` | `PARTIAL_SETTLE`／`FULL_SETTLE` | **必須**——沿用 `assertAcceptanceSettlementAllowed()`，跟 A7 完全相同 |
| Sight 求償收回 | `EPLC_DUE_FROM_ISSUING_BANK` | `REIMBURSE` | **業務上不適用**（即使欄位技術上存在也須保持 `null`，理由見附錄 A） |
| Usance 求償收回 | `EPLC_ACCEPTANCE_REIMB_RECEIVABLE` | `REIMBURSE` | **待業務確認**——這是 Confirming Bank 對 Issuing Bank 的求償，不是對受益人的到期付款，是否要掛勾 `EPLC_ACCEPTANCE` 自己的 Maturity Date 概念不預設答案 |
| 求償權轉類（貼現賣斷） | `EPLC_ACCEPTANCE_REIMB_RECEIVABLE` → `EPLC_EXPORT_BILLS_DISCOUNTED` | `RECLASSIFY_OUT` | **待業務確認**——不涉及現金，是否需要獨立於 Acceptance 到期規則之外的轉類控制條件，本文件不預設答案 |

**後端分流判斷依據（回應「不應只依前端傳入文字判斷」的建議）**：B5 這四個分支不應該由前端傳入的功能代號字串直接決定要跑哪一組檢查——後端應該依實際送入的 `instrumentType`＋`movementType`（必要時再對照 `parentLogicalContractId` 確認掛在哪個 `EPLC_CONFIRMATION` 底下）組合判斷，這樣即使前端的功能代號分類有誤，後端仍然套用跟合約實際型別相符的那一組檢查，不會因為呼叫方傳錯「B5」這個標籤就誤套用 Acceptance 到期規則到求償合約上（或反過來）。

---

### 4.3 Orchestrator 跨呼叫一致性——具體控制建議（回應審查：「待確認補償機制」需要提升為具體上線控制）

4.1 節已確認 A6／B4 Release 是兩次（Export Usance 可能是三次，見 4.2 節）各自獨立原子的呼叫，Balance Component 自己不提供跨呼叫補償。上一輪審查進一步指出，只把這件事標成「待確認」不足以作為正式上線標準，建議具體化成可以落地的控制項目——這幾點屬於中台 Orchestrator（不是 Balance Component 自己）的職責範圍，本文件以**建議**（非本文件片面核定的需求）提出，最終設計仍由 Orchestrator 團隊決定：

**建議的流程狀態追蹤（P1，建議，非本文件片面核定；本版修正：不用單一線性 Enum，因為不同流程所需步驟數不同，且現行程式碼未強制單一完成順序）**——上一版用一個線性 `OrchestrationStatus` Enum（`PENDING → ROOT_MOVEMENT_RELEASED → ACCEPTANCE_CREATED → RECEIVABLE_CREATED → COMPLETED`）隱含了固定順序跟固定步驟數，但本節自己也已經確認：現行程式碼沒有強制呼叫順序（見下文用詞修正），而且 Import A6 Usance／Export B4 Sight／Export B4 Usance 三種流程需要的步驟本來就不一樣（Import 不需要 Receivable；Export Sight 不需要 Acceptance）。改成「整體狀態＋各步驟各自獨立狀態」，`overallStatus` 由各步驟是否都滿足自己的必要條件推導出來，不是呼叫端自行寫入的值：

```typescript
// Orchestrator 自己的流程狀態，不是 Balance Component 的欄位
type StepStatus = 'NOT_REQUIRED' | 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

interface BalanceOrchestration {
  workflowType: 'IMPORT_USANCE_ACCEPTANCE' | 'EXPORT_SIGHT_HONOUR' | 'EXPORT_USANCE_ACCEPTANCE';
  // 由 rootMovementStatus／acceptanceStatus／receivableStatus（依 workflowType 決定哪些是 NOT_REQUIRED）
  // 共同推導出來，不由呼叫端任意寫入——例如 EXPORT_SIGHT_HONOUR 的 acceptanceStatus 恆為 NOT_REQUIRED，
  // 不會因為它是 NOT_REQUIRED 就卡住 overallStatus 無法變成 COMPLETED
  overallStatus: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'RECOVERY_REQUIRED';
  rootMovementStatus: StepStatus;   // 呼叫一（Release LC/Confirmation 的 UTILIZE／HONOUR／ACCEPT）
  acceptanceStatus: StepStatus;     // 呼叫二（Acceptance CREATE），EXPORT_SIGHT_HONOUR 恆為 NOT_REQUIRED
  receivableStatus: StepStatus;     // 呼叫三（求償權資產 CREATE，見附錄 A 待確認事項），IMPORT_USANCE_ACCEPTANCE 恆為 NOT_REQUIRED
  businessEventId: string;
  lastErrorCode?: string;
  retryCount: number;
  nextRetryAt?: string;
  version: number;                  // Optimistic Locking，避免併發更新這筆流程狀態時互相覆蓋
}
```

最低限度建議包含：每完成一步就持久化該步驟自己的狀態；每一步使用可重送、跨重試保持不變的 Idempotency Key（見下方修正）；失敗後能從最後成功的步驟繼續重試，不必整個流程重來；超過重試上限後轉入 `RECOVERY_REQUIRED`，交由人工處理；建立日終或定期對帳，找出中間狀態的案件（見下方具體異常規則）；流程尚未 `COMPLETED` 前，畫面／下游事件不應把整筆 A6／B4 顯示為已完全處理完成（但見下文「流程完整性」與「Acceptance 付款義務是否可履行」的區分）；未經業務核准，不應該自動沖回已經正式 Release 的根合約異動（`UTILIZE`／`HONOUR`／`ACCEPT`）——這類已經生效的負債減少，補救方式應該是後續把 Acceptance／求償權補建完整，而不是反向撤銷已經合法完成的根合約動作。

**跨呼叫對帳的具體異常規則（P1，建議，本版新增，回應「日終對帳」不應只是一句需求）**：

```text
rootMovementStatus = COMPLETED AND acceptanceStatus 應為必要卻缺失（非 NOT_REQUIRED 但長時間非 COMPLETED）
  → MISSING_ACCEPTANCE
acceptanceStatus = COMPLETED AND 對應的 rootMovementStatus 尚未 COMPLETED
  → ORPHAN_ACCEPTANCE（見下文，兩種呼叫順序都可能觸發這一類或上一類，不是只有其中一種順序才需要對帳；若下方 referencedTransactionId 檢查已在 Acceptance CREATE Release 時強制擋下，這一類理論上不會再發生，保留作為防禦性對帳）
workflowType = EXPORT_SIGHT_HONOUR AND rootMovementStatus = COMPLETED AND receivableStatus 應為必要卻缺失
  → MISSING_SIGHT_REIMBURSEMENT_RECEIVABLE（本版修正：原規則只涵蓋 Usance，遺漏 Export Sight 的 EPLC_DUE_FROM_ISSUING_BANK 也可能漏建）
workflowType = EXPORT_USANCE_ACCEPTANCE AND acceptanceStatus = COMPLETED AND receivableStatus 應為必要卻缺失
  → MISSING_USANCE_REIMBURSEMENT_RECEIVABLE
overallStatus != COMPLETED AND 距上次更新超過約定門檻
  → STALE_ORCHESTRATION
同一筆來源動用（referencedTransactionId 指向同一個 movementId）底下出現一筆以上 Acceptance CREATE
  → DUPLICATE_ACCEPTANCE（本版修正：改用 referencedTransactionId 而非 businessEventId 判斷——一個 businessEventId 底下本來就可能合法對應多筆文件、多筆 Acceptance，用它當去重鍵可能誤報；referencedTransactionId 精確指向「這筆 Acceptance 是從哪一筆來源動用轉出來的」，同一來源動用只應該轉出一筆 Acceptance，用它判斷不會有這個誤報風險，而且是既有欄位，不需要另外定義新的複合鍵）
```

每筆異常至少保留：`businessEventId`／`rootContractId`／`referencedTransactionId`／IB／EB Number／Acceptance Reference／預期步驟／已完成步驟／失敗步驟／最後錯誤／重試次數／負責人／偵測時間／處理狀態——這是把「需要對帳」這句需求變成可以實際落地執行的最低限度欄位集合。

**Idempotency Key 需要修正：不能依賴每次呼叫都可能變動的 Request ID（回應審查，P1；本版再補齊 `tenantId`／payload hash）**——4.1 節原本建議的 Idempotency Key 包含「Release Request ID」，但這個名稱容易被誤實作成「每次 HTTP 呼叫都重新產生一個新值」，如果真的這樣，同一筆業務操作的兩次重試會被系統當成兩筆不同的操作，完全失去 Idempotency 的保護效果。**修正**：Idempotency Key 必須是「代表同一筆業務操作」的穩定值，不是「代表這一次 HTTP 呼叫」的臨時值——具體做法可以是（a）由呼叫端自己生成一個在重試時保持不變的 Request ID（呼叫端自己的責任，這是標準 Idempotency Key 的正確用法，本文件上一版沒有講清楚這個前提），或（b）改用業務欄位本身組成的穩定 Key，若是多租戶環境建議再加上 `tenantId`：`tenantId + businessEventId + operationType + targetContractType + targetReference`（不含任何每次呼叫都重新生成的欄位）。若需要另外追蹤個別 HTTP 呼叫本身（例如排查網路問題），`requestId`／`correlationId`／`traceId` 這類欄位可以另外保留，但不應該把它們當成判斷「是不是同一筆業務操作」的依據。伺服器端建議保存 `idempotencyKey`／`requestPayloadHash`／`resultReference`／`processingStatus`／`createdAt`：同一 Key、相同 payload hash → 回傳第一次結果；同一 Key、不同 payload hash → 拒絕並回傳 `IDEMPOTENCY_CONFLICT`；同一 Key 仍在執行中 → 回傳既有 processing 狀態，不得並行處理兩次。

**Retry 政策需要分層，不能把 Standing 的短暫 HTTP 重試跟已完成部分財務異動的跨呼叫恢復混為一談（P1，建議，本版新增）**：

| Retry 類型 | 對象 | 建議 |
|---|---|---|
| Standing HTTP Retry | `ECONNRESET`、502／503／504（第六節） | 短暫重試（例如最多 2 次，共 3 次嘗試），屬於單次 HTTP 呼叫層級 |
| Balance API Step Retry | 單一步驟呼叫結果未知／timeout | 使用相同 Idempotency Key 重試同一步驟 |
| Orchestrator Recovery | 多次呼叫中有部分已成功 | 依已完成步驟繼續，不重跑已完成的步驟 |
| Manual Recovery | 超過流程重試上限 | 轉 `RECOVERY_REQUIRED`，交由人工，需要告警而非單純迴圈重試 |

**流程完整性（Orchestration 是否 `COMPLETED`）跟「Acceptance 這筆付款義務本身是否可以履行」是兩個不同層次的問題，不應混為一談（P1，本版新增，重要）**：`assertAcceptanceSettlementAllowed()`（4.1 節）本身只檢查 Acceptance 合約自己的狀態（`confirmedBalance`／`maturityDateStatus`／`availableBalance`），完全不檢查 Receivable 這一側的狀態——這是既有設計已經正確的地方：即使 Export B4 Usance 的第三個步驟（求償權資產 CREATE）失敗、Orchestrator 整體流程還停在 `IN_PROGRESS`／`RECOVERY_REQUIRED`，只要 `EPLC_ACCEPTANCE` 這筆合約自己已經 `APPROVED`，B5-到期結算（銀行對受益人的合法付款義務）**不應該**被這個內部記帳問題卡住——受益人有權按時收到到期付款，不應該因為銀行自己內部「求償權資產還沒建好」這種技術／流程問題而被拖延。Orchestrator 的「流程完整性」狀態是給內部維運／稽核用的追蹤指標，不應該被實作成擋下對受益人合法付款義務的閘門；`receivableStatus` 未完成需要被對帳偵測、盡快補建，但不應該回頭去擋 `acceptanceStatus` 已經 `COMPLETED` 之後的 B5 到期結算。

**用詞修正（回應審查 P1）：「兩種呼叫順序都合法」講太過頭了，應該改成「程式目前沒有禁止」**——核對 `service/balanceService.ts` 檔頭 doc comment 的原文（「the CALLER... makes two separate calls for a Usance drawing: release the UTILIZE/ACCEPT, **then** create+release the Acceptance CREATE」）其實已經在描述一個具體的預期順序（先 Release 根合約、再建立 Acceptance），不是宣稱兩種順序都經過業務或工程正式核准。比較精確的講法是：**現行 Balance Component 沒有任何程式碼機制強制這個順序，所以理論上兩種順序都可能發生；但實際業務／Orchestrator 允許的順序為何，仍需業務與工程團隊共同確認，不是本文件能片面認定「兩者都合法」**。

**核對程式碼後找到一個比原本猜測更具體、也更可以直接落地的修正方向：這個「來源動用是否已 Release」的關聯，其實已經有一個現成欄位在用，只是從來沒有被拿來做驗證**——`types.ts` 的 `BalanceMovement.referencedTransactionId` 欄位（doc comment 原文：「the movementId of a PRE-EXISTING record this movement converts/finalizes（A6/B4's own 'still-PENDING source Document Arrival/Present Docs' picked at Submit time）」）明確記錄：**A6 自己建立的 Acceptance `CREATE` 這筆 `BalanceMovement`，本來就在 Submit 當下把 `referencedTransactionId` 設成 A3 那筆 `UTILIZE` 的 `movementId`**（`service/balanceService.ts` 第 1547 行註解直接點名「safe for A6's own `referencedTransactionId` use too... its own source is always an `IPLC_LC`/`UTILIZE`」）——這正是審查建議新增的 `sourceRootMovementId` 想做的事，差別只是**這個關聯欄位已經存在，不需要新增欄位，只是現行程式碼從來沒有拿它做過驗證**（doc comment 原文明講：「Passthrough only — this service never validates that it resolves to a real movement」，`release()` 裡目前唯一讀取這個欄位的地方，是第 1549–1555 行一段只服務 B3/B4 `presentDocsConsumedAt` 副作用的分支，對 A6 這個案例完全不會觸發任何邏輯）。**這證實了審查的 P0 判斷是對的**：目前確實沒有任何地方檢查「這筆 Acceptance 對應的來源動用是否已經 Release」，即使關聯欄位本身早就存在。

**建議的修正（P0，沿用既有欄位，不新增欄位）**：在 `assertAcceptanceSettlementAllowed()`（4.1 節）裡新增一條檢查——解析被結算的 Acceptance 自己那筆 `CREATE` 的 `referencedTransactionId`，找到它引用的來源動用，要求該筆動用 `status === 'RELEASED'` 才放行；同時建議把這條檢查提前到**更早、更適合的一層**——Acceptance `CREATE` 自己 Release 的當下就檢查（而不是等到 A7／B5 才發現），這樣一來，Acceptance 本身要 Release，前提就是它引用的來源動用已經先 Release，等於直接把「先 Release 根合約、再建立 Acceptance」這個 doc comment 原本描述的預期順序，變成程式碼層面真正強制的規則，不再只是一個沒被驗證的假設約定——這樣同時解決了本節原本標成「兩種順序都有孤兒風險」的開放問題，讓其中一種順序（先建立 Acceptance）在程式碼層面就直接被擋下，不會真的發生。

**Export 這一側目前無法完全比照確認，需要工程再查證**：核對 `referencedTransactionId` 目前唯一另一個已知用法，是 B4 自己的 `HONOUR`／`ACCEPT` 這筆動用本身的 `referencedTransactionId` 指向 B3 的 `EPLC_EXAMINATION CREATE`（Present Docs 記錄，第 692–697 行）——這是 B4 對 B3 的關聯，不是 Acceptance／求償權資產對 B4 自己的 `ACCEPT` 動用的關聯。`EPLC_ACCEPTANCE`／`EPLC_DUE_FROM_ISSUING_BANK`／`EPLC_ACCEPTANCE_REIMB_RECEIVABLE` 這幾個 Export 資產面合約自己的 `CREATE`，是否也比照 A6 的作法把 `referencedTransactionId` 設成對應的 `ACCEPT`／`HONOUR` 這筆動用的 `movementId`，本文件核對現有 doc comment 後無法完全確認（第 1431 行有一段舊註解提到 2026-08-18 之前 B4 的 client 端 compound release 曾經一次觸發三個 `/release` 呼叫——「the B3 earmark, the Honour, the Due From Issuing Bank」，可以佐證 Export 這一側同樣是多次獨立呼叫的結構，但沒有明講資產面 `CREATE` 自己的 `referencedTransactionId` 指向誰）——這是需要工程對照實際程式碼／資料確認的具體問題，本文件不假設答案跟 Import 一定相同。

---

### 4.4 Base Date 修正機制（業務已核定，本版新增並經業務覆核修正）

**這一節的內容源自使用者以 BA 角色提出的業務決議草案，經業務覆核後確認方向正確，並修正了一項重要業務概念（`fixedMaturityDate` 不是 Base Date，見下方），本版已依業務覆核意見更新，狀態標示為「業務已核定」**。這一節同時回答了問題一（見 `Maturity-Date-UI-Display-Override-Decision-Request.md`）先前留白的「Base Date 本身要怎麼被修正」。

**核心原則（與第八節既有立場完全一致，這裡是把「回頭修正真正的來源」具體化成一套機制）**：

- **Base Date 本身可以修正**：`AFTER_ACCEPTANCE` 情境下，正式承兌前的 Acceptance Date 可能只是預估值，實際承兌日確認後應允許更新；`AFTER_SIGHT`（`sightDate`）、`AFTER_BL_DATE`（`blDate`）、`AFTER_INVOICE_DATE`（`invoiceDate`）、`AFTER_SHIPMENT_DATE`（`shipmentDate`）如果原始輸入本身就錯了，同樣應允許依正確資料訂正。修正須保留異動紀錄（原值／新值／修改原因／修改人），並走 Maker／Checker 雙人控制（各階段的具體控制方式見下方「Base Date 在不同階段的修改控制」）。
- **Contractual Maturity Date 本身仍然不允許直接覆寫**——這點沒有改變，跟第八節、問題一的既有立場完全一致。Base Date 修正後，Contractual Maturity Date 必須由系統依 `tenorBasis`／`tenorDays`／新的 Base Date **重新計算**（呼叫既有的 `computeSourceDate()`，第 3.1 節），不是讓人直接輸入新的到期日。
- **重新計算後必須再跑一次假日調整**：新算出的 Contractual Maturity Date 送進既有的 Standing `adjustBusinessDay()`（第八節既有的兩步驗算邏輯），產生新的 Operational Payment Date——這一步不能省略，Base Date 修正如果只更新 Contractual、不重跑 Standing，Operational 那一側就會跟新的 Contractual 對不上。
- **所有新日期須經核准後才正式生效**，同時保留原日期、新日期、修改原因、核准紀錄——這跟本文件在其他地方（Calendar Snapshot、Operational Payment Date Override）反覆採用的「保留原值＋新值＋核准紀錄，不直接覆蓋」是同一個原則的又一次落地，不是新發明的資料模型風格。

**範例（使用者提供，逐字採用）**：

```text
Tenor：90 days after acceptance

原預估 Acceptance Date：2026-09-01
原 Contractual Maturity Date：2026-11-30

實際 Acceptance Date：2026-09-03
重新計算 Contractual Maturity Date：2026-12-02

再由 Standing 微服務計算 Operational Payment Date。
```

**核心原則一句話（使用者原文）**：允許修改正確的日期來源，不允許直接修改系統依條款計算的合約到期日。

**重要業務概念修正（本版依業務覆核意見更正，取代 v30 原本的「`fixedMaturityDate` 比照辦理」講法）**：`fixedMaturityDate` **不是** Base Date，不應該套用跟 Acceptance Date／Sight Date／BL Date／Invoice Date／Shipment Date 相同的修正機制。原因是兩者在概念上處於運算流程的不同位置：

```text
AFTER_ACCEPTANCE：
Acceptance Date + 90 Days
        ↓
Contractual Maturity Date
```

Acceptance Date（以及其餘四種 Base Date）是**計算基準**，用來算出 Contractual Maturity Date，修正它是「更正計算的輸入」。但：

```text
FIXED_MATURITY_DATE：
fixedMaturityDate 本身
        =
Contractual Maturity Date
```

`fixedMaturityDate` **本身就是**信用狀條款直接指定的合約到期日，不經過 Tenor＋Base Date 這一步運算（第 3.1 節既有說明：這個 `tenorBasis` 本來就跳過 `computeSourceDate()`）。修改它實質上是修改合約條款本身，不是修正一個計算用的輸入值——這是業務概念上的根本差異，v30 原本「比照辦理」的講法混淆了這兩件事，本版更正。

正確分類：

| 日期 | 是否屬於 Base Date | 修正方式 |
|---|---:|---|
| Acceptance Date | 是 | Base Date Correction |
| Sight Date（`sightDate`） | 是 | Base Date Correction |
| BL Date（`blDate`） | 是 | Base Date Correction |
| Invoice Date（`invoiceDate`） | 是 | Base Date Correction |
| Shipment Date（`shipmentDate`） | 是 | Base Date Correction |
| `fixedMaturityDate` | **不是** | 正式 LC Amendment／Contractual Date Correction |

兩條技術流程也要分開，不能共用同一段程式邏輯：

```text
一般 Base Date：
修正 Base Date
→ computeSourceDate(baseDate, tenorDays)
→ 新 Contractual Maturity Date
→ Standing
→ 新 Operational Payment Date
```

```text
FIXED_MATURITY_DATE：
正式修改 fixedMaturityDate（走 LC Amendment／Contractual Date Correction，不是 Base Date Correction）
→ 不呼叫 computeSourceDate()
→ fixedMaturityDate 直接成為新的 Contractual Maturity Date
→ Standing
→ 新 Operational Payment Date
```

`fixedMaturityDate` 的修正雖然不呼叫 `computeSourceDate()`，但**同樣要送進 Standing 重新計算 Operational Payment Date**，不能因為跳過 Tenor 運算就連假日調整這一步也一併跳過。

**適用範圍與現況提醒**：`Acceptance Date`（`AFTER_ACCEPTANCE` 的操作定義本身仍待業務確認，見第九節）、`sightDate`、`blDate`、`invoiceDate`、`shipmentDate`、`fixedMaturityDate` 這幾個欄位，依第四節既有查證，**目前全部不存在於 `types.ts`／`db/schema.ts`**——這一節定義的是這些欄位新增之後、修正機制該怎麼設計，不是現況已經有的功能，需要跟 3.1.1 節的欄位新增順序一起排入實作計畫。

**Base Date 在不同階段的修改控制（本版依業務覆核意見新增，取代原本「一律走 Maker／Checker」的籠統講法）**：

| 階段 | 建議控制 |
|---|---|
| Maker 尚未 Submit | 可以在輸入畫面直接修改；Submit 時保存最終輸入值及稽核資料，草稿階段的每次修改不需要各自產生一筆正式 Amendment |
| 已 Submit、尚未核准 | 退回／取消原 Submit，修正後重新 Submit |
| 已 `APPROVED` | 建立獨立的 Base Date Correction Event（見下方）；舊日期在新修正核准前繼續有效 |
| Settlement 已完成 | 不允許走一般修正，須改走正式 Correction／Reversal／Exception 流程 |

這樣可以避免 Maker 在草稿階段每改一次日期就觸發一筆正式 Amendment 紀錄，同時確保已經生效、甚至已經結算的日期，修正時受到更嚴格的控制。

**機制建議（BA 判斷，待工程確認是否可行，非業務決議的一部分）**：Maker／Checker 雙人控制＋不立即生效的模式，建議比照第七節 `AMEND_EXPIRY`／`AMEND_MATURITY_CALENDARS` 既有的 Amendment 慣例（Maker Submit 不立刻更新主檔，Checker Release 才正式生效並觸發重新計算），不需要另外發明一套新的生效模式；具體要不要新增一個對應的 `movementType`（例如 `AMEND_BASE_DATE`），還是併入既有的 `AMEND_MATURITY_CALENDARS`，屬於工程實作細節，本文件不預設答案。

**已 `APPROVED` 後修正 Base Date（業務已核定，本版依業務覆核意見確認並補齊細節）**：如果要修正 Base Date 的這筆 Acceptance 目前已經是 `APPROVED`（到期日已正式生效，下游可能已經在引用），業務已確認以下規則：

- 應建立獨立的 Base Date Correction／Amendment Event，不與一般 Submit 階段的修改共用同一套流程；
- 修正申請核准前，原本已生效的日期繼續有效；
- 不得先把 `maturityDateStatus` 從 `APPROVED` 改回 `PENDING_*`；
- Checker 核准修正後，新的 Contractual Maturity Date 及 Operational Payment Date 才正式生效；
- 保留原日期、新日期、修改原因、Maker、Checker 及核准時間的完整紀錄；
- **如果這筆 Acceptance 已經完成 Settlement（A7／B5 到期結算已執行），不得走一般的 Base Date Correction，須改走正式的 Correction／Reversal／Exception 流程**——這點是業務覆核新增的補充規則，避免已經完成的正式會計事實被一般修正流程繞過。

這與本文件在 `CALENDAR_SNAPSHOT_UNAVAILABLE`（第八節）與 `Maturity-Date-UI-Display-Override-Decision-Request.md` 問題五 (b)「已生效後才改」採用的是同一個原則：**修正提案在核准前，原本已生效的日期應該繼續有效**。

**`AFTER_ACCEPTANCE` 的顯示用詞（業務已核定，本版新增）**：實際承兌日尚未確定前，畫面上依預估 Acceptance Date 算出的到期日，只能標示為 **Estimated Contractual Maturity Date**（估計合約到期日），不得視為正式的 Contractual Maturity Date；實際承兌日確認並經 Checker 核准後，才形成正式生效的 Contractual Maturity Date。這點呼應 `Maturity-Date-UI-Display-Override-Decision-Request.md` 的三層顯示控制標準（Layer 1 試算值），此處為 `AFTER_ACCEPTANCE` 情境給出更精確的顯示用詞。

**Estimated 與正式生效日期的欄位區分（本版新增，回應第二輪業務覆核追問「Estimated 日期如何與 `PENDING_BASE_DATE` 並存」）**：上一段的顯示用詞規則，只回答了「這個日期在畫面上該怎麼標示」，還沒有回答「這個估算值在資料層面該怎麼存，會不會跟 `PENDING_BASE_DATE` 的既有定義互相矛盾」。這裡把兩者的關係講清楚：

第四節 `PENDING_BASE_DATE` 的既有定義是「這個 `tenorBasis` 所需的基準日尚未確認，不得計算 Contractual/Operational Maturity Date」——這句話禁止的是產生**正式生效**的日期，不禁止產生**僅供畫面顯示**的估算值。兩者必須在資料層面明確分開，不能共用同一組欄位，否則會出現「`maturityDateStatus` 明明還是 `PENDING_BASE_DATE`，`contractualMaturityDate` 卻已經有值」這種自相矛盾的資料狀態：

| 資料 | `maturityDateStatus = PENDING_BASE_DATE` 時是否允許存在 |
|---|---|
| Estimated Base Date（例如預估 Acceptance Date） | 可以 |
| Estimated Contractual Maturity Date | 可以，僅供畫面試算顯示 |
| Estimated Operational Payment Date | 可以，僅供畫面試算顯示（呼叫 Standing 試算，不落地為正式撥款日） |
| Confirmed Base Date | 尚不存在 |
| 正式生效的 Contractual Maturity Date | 不允許——這正是 `PENDING_BASE_DATE` 要擋的對象 |
| 正式生效的 Operational Payment Date | 不允許，理由同上 |
| `maturityDateStatus` | 維持 `PENDING_BASE_DATE`，不因為有估算值就被誤判成已進入 `PENDING_APPROVAL` |

範例（`AFTER_ACCEPTANCE`，實際承兌日尚未確認）：

```text
Tenor Basis：AFTER_ACCEPTANCE
Tenor Days：90
Estimated Acceptance Date：2026-09-01
Estimated Contractual Maturity Date：2026-11-30
Estimated Operational Payment Date：（由 Standing 依適用行事曆試算，僅供顯示）
Maturity Date Status：PENDING_BASE_DATE
```

實際承兌日確認後：

```text
Confirmed Acceptance Date：2026-09-03
Contractual Maturity Date：2026-12-02
Operational Payment Date：（由 Standing 重新計算）
Maker Submit → Maturity Date Status：PENDING_APPROVAL
Checker Approve → Maturity Date Status：APPROVED
```

**原則**：`PENDING_BASE_DATE` 表示正式 Base Date 尚未確認，因此不得產生正式生效的 Contractual／Operational Maturity Date；但若業務允許在正式 Base Date 確認前先呈現一個估算值（例如 `AFTER_ACCEPTANCE` 情境下用預估承兌日試算），UI 可以顯示 Estimated Contractual Maturity Date 及 Estimated Operational Payment Date，且必須明確標示為估算值，**不得供 Settlement、報表正式到期日、逾期判斷或任何正式客戶通知使用**。

**資料模型建議（工程設計層級，非業務決議，依本文件既有風格給出建議但不片面核定實作細節）**：為避免估算值被誤寫進正式欄位，建議把 Estimated／Confirmed 兩組欄位分開宣告，不共用同一個欄位：

```typescript
interface AcceptanceMaturityDates {
  estimatedBaseDate?: string;
  estimatedContractualMaturityDate?: string;
  estimatedOperationalPaymentDate?: string;
  confirmedBaseDate?: string;
  contractualMaturityDate?: string;
  operationalPaymentDate?: string;
  maturityDateStatus: 'PENDING_BASE_DATE' | 'PENDING_APPROVAL' | 'APPROVED';
}
```

另一種可行做法是完全不新增估算欄位：畫面試算結果只存在前端暫存狀態，不寫入任何後端欄位，等 Base Date 正式確認後才產生正式欄位。兩種做法都能避免「估算值被誤當正式值」的風險，但**必須二擇一**，不能讓「沒有 Base Date 卻已經有值的 `contractualMaturityDate`／`operationalPaymentDate`」這種矛盾狀態出現在資料庫裡。採用哪一種屬於工程實作決定，待實作團隊確認，不影響本節已核定的顯示與修正機制業務規則。

**與 Operational Payment Date 覆寫機制的欄位命名對照（v33 新增）**：本節的 `estimatedXxx`／`confirmedXxx` 欄位回答的是「Base Date 還沒確認時可以顯示什麼」；`Maturity-Date-UI-Display-Override-Decision-Request.md`「建議資料模型」另外定義了 `calculatedOperationalPaymentDate`／`overrideOperationalPaymentDate`／`effectiveOperationalPaymentDate` 這組回答「Base Date 確認、系統算出結果之後，覆寫機制怎麼運作」的欄位——兩組欄位分屬不同階段，不是互相矛盾的兩套設計，完整對照表見該文件同一節。

---

## 五、Release Blocker 擴充：稽核欄位補齊——多本行事曆各自版本，改用 Standing OAS 既有設計，不重新發明

上一輪建議用單一 `calendarVersion: string` 記錄行事曆版本，但這在跨境結算（本國銀行 Calendar + 國外付款/收款行 Calendar，各自可能不同版本）下不夠用——這點是對的。**但核對 `analysis/maturity_date/Standing_Microservice_Maturity_Date_OAS_Design.md`（v2.10.0）後發現：這個問題 Standing 這邊本來就已經設計過了，不需要 Balance Component 自己重新發明一套結構**：

> 「版本追溯由單一 `calendarVersion` 字串，改為 `calendarSnapshotId`（多行事曆於某核准時點的組合快照，恆回傳）＋ `calendarVersions[]`（每本行事曆各自版本）。歷史重算可用 `calendarSnapshotId` 精確重現。」

也就是說，Standing 的 `POST /business-days/adjust` 回應本來就會帶 `calendarSnapshotId`（單一、可重現整組計算的快照 ID）跟 `calendarVersions[]`（每本行事曆各自版本），還有逐行事曆判定明細 `calendarAssessments[]`／`adjustedDateAssessments[]`（例如「付款銀行 `businessDay=true`，USD 清算 `businessDay=false`」這種細節）。**問題是這個 Balance Component 自己的 `clients/standingClient.ts` 目前的 `AdjustBusinessDayResponse` 型別完全沒有宣告 `calendarSnapshotId`／`calendarVersions` 這兩個欄位**，`calendarAssessments`／`adjustedDateAssessments` 也只型別化成 `unknown[]`——**這是一個確實存在、可驗證的程式碼缺口，不是假設風險**：即使 Standing 端已經回傳這些資料，這個服務目前的型別定義跟呼叫邏輯（`service/balanceService.ts` 第 1206 行 `return { maturityDate: response.adjustedDate, standingCalculationId: response.calculationId }`）也只取用 `adjustedDate`／`calculationId`，其餘欄位連讀取都沒讀取，更不用說持久化。

修正方向：

```typescript
// clients/standingClient.ts — 依 Standing OAS v2.10.0 §3.1 補齊型別
export interface AdjustBusinessDayResponse {
  calculationId: string;
  adjustedDate: string;
  wasAdjusted: boolean;
  adjustmentDays: number;
  contractualDateChanged: false;
  calendarSnapshotId: string;          // 新增——單一可重現快照 ID
  calendarVersions: Array<{ calendarType: string; code: string; version: string }>;  // 新增
  calendarAssessments: CalendarAssessment[];        // 從 unknown[] 改為實際型別
  adjustedDateAssessments: CalendarAssessment[];    // 同上
  skippedDates: unknown[];
}
```

```typescript
contractualMaturityDate: string;
operationalPaymentDate: string;
standingCalculationId: string;
businessDayConvention: string;
calendarSnapshotId: string;          // 持久化，稽核時用這個精確重現當時計算
maturityDateStatus: MaturityDateStatus; // 見第四節，PENDING_BASE_DATE／PENDING_APPROVAL／APPROVED
```

**這幾個欄位要存在哪個實體上，本版明確一下（審查意見指出的重要缺口）：存在每一筆 Acceptance 自己的 `IPLC_ACCEPTANCE`／`EPLC_ACCEPTANCE` BalanceContract 上，不是存在父層 LC 合約上**。同一張 LC 可能有多次提示文件、對應多筆各自獨立的 A6 Acceptance（例如分批出貨、分批押匯），每一筆 A6 CREATE 本來就建立在它自己那個獨立的 Acceptance 合約上（第 4.1 節已說明這個兩合約模型），`sightDate`／`contractualMaturityDate`／`operationalPaymentDate`／`standingCalculationId`／`calendarSnapshotId`／`maturityDateStatus` 這一整組欄位也應該跟著存在同一個 Acceptance 合約上，各自獨立、互不覆蓋。若誤存在父層 LC 合約，第二筆 Acceptance 的到期日資料會直接覆蓋第一筆，是一個實質的資料遺失風險，不是命名或呈現問題。驗收應包含：同一張 LC 底下建立兩筆 A3/A6（不同 Sight Date、不同 Maturity Date），兩筆各自的 `contractualMaturityDate`／`calendarSnapshotId` 都能獨立查到，互不覆蓋，A7 各自依自己那筆 Acceptance 的 `operationalPaymentDate` 處理。

`calendarVersions[]`／逐行事曆判定明細本身不一定要整包持久化在 `balance_contracts`（可以只存 `calendarSnapshotId`，需要時再回頭查 Standing），但**至少 `calendarSnapshotId` 必須持久化**——這是回答「這筆到期日調整，當時參考了哪些行事曆、哪個版本」的最小必要欄位，且不需要 Balance Component 自己設計新結構，Standing 端已經提供。

**這個「只存 `calendarSnapshotId`、需要時回查 Standing」的設計有一個外部依賴，本文件無法自行確認**：Standing 必須保證 Snapshot 的保存期限不短於銀行對交易/稽核紀錄的留存要求（例如若銀行規定交易紀錄要保留 7–10 年，Standing 的 Snapshot 資料也要能保留同樣長，否則若干年後回查會查不到）——這是 Standing 微服務自己的服務等級承諾，不是 Balance Component 這份文件能單方面確定的事，需要跟 Standing 的所有權團隊另外確認。若 Standing 無法承諾足夠長的保存期限，**保守做法是在 `balance_contracts` 額外冗餘保存一份 `calendarVersions[]` 摘要**（第 121–130 行的型別已經包含這個欄位，只是本文件原本建議可以不持久化整包——若 Standing 保存期限不夠長，這個欄位就要改成必存），避免未來稽核時 Standing 那邊資料已經過期清除、Balance Component 這邊卻只有一個查不到東西的 `calendarSnapshotId`。

**本版把這件事從「待確認的外部依賴」進一步收斂為正式的 Go-Live 條件，寫進第八節驗收標準，不只是待確認事項裡的一條敘述**：

> **Standing Snapshot 保存期限 ≥ 銀行交易／稽核紀錄留存要求**——這是本次修正正式上線前必須拿到 Standing 所有權團隊書面（或至少正式紀錄形式）確認的前提條件，不是「最好去問一下」層級的建議。若確認前保存期限不足，`balance_contracts` 必須改採冗餘保存 `calendarVersions[]` 摘要這個保守方案，兩者擇一，不能兩者都不做就上線。

**跟 Standing 團隊確認保存期限時，一併確認的相關問題（本版新增，避免只問到期限數字、漏掉配套條件）**：

- Standing 是否提供依 `calendarSnapshotId` 查詢歷史快照的 API（不是只保證資料還在，還要有查得到的介面）。
- 這個查詢介面是否跨環境可用（例如正式環境的 Snapshot，之後若資料遷移或 DR 切換，查詢介面是否還能用同一個 `calendarSnapshotId` 查到）。
- 行事曆本身被修訂（例如某年後才發現某個國定假日公告有誤）時，歷史 Snapshot 是否會被覆蓋／改寫，還是每次修訂都產生新的 Snapshot、舊的仍可查詢原始版本（這關係到「回查 `calendarSnapshotId` 能不能精確重現當時計算」這件事本身是否成立）。
- 若 Standing 未來做資料庫遷移或版本升級，既有的 `calendarSnapshotId` 是否保證仍可查詢，不因遷移而失效。

---

## 六、Standing 服務失敗時的處理——對照現行程式碼修正

`clients/standingClient.ts` **現行程式碼已經有 fail-closed 設計**（第 74–76 行文件註解：「a caller that opted into Standing-calculated Maturity Date must never silently fall back to an uncalculated/wrong date just because Standing was unreachable」），這部分不是本文件新提出的，是已經存在且經過測試的既有行為，先如實記錄：

```text
連線失敗（fetch() 本身丟出例外，如 ECONNRESET/ECONNREFUSED/ETIMEDOUT/EPIPE/UND_ERR_CONNECT_TIMEOUT/UND_ERR_SOCKET）
    → 重試，間隔 100ms、200ms（2 次重試，共 3 次嘗試）
    → 仍失敗 → 拋出 CalendarServiceError（對應 HTTP 503）
```

**核對程式碼後發現一個既有缺口，這輪一併記錄**：上面的重試只發生在 `fetch()` 本身連線失敗時；**如果 Standing 有回應、但回應本身是非 2xx（例如 Standing 自己因為 `CALENDAR_SERVICE_TIMEOUT`／`CALENDAR_DATA_STALE` 這類暫時性狀況回傳它自己的 HTTP 503），目前的程式碼完全不重試，直接在第一次嘗試就拋出 `CalendarServiceError`**——而 Standing OAS 設計文件（`standingClient.ts` 第 75 行自己的註解也提到）明講 Standing 本來就會用 503 表達「這是暫時性狀況」，也就是說 Standing 端已經預期呼叫方應該對這種 503 做重試，但 Balance Component 目前沒有做。

**本版把修正方向從「503 要重試」再細緻化一步——不是所有非 2xx 都該重試，要區分暫時性狀況跟真正的請求錯誤**：把 HTTP `502`／`503`／`504` 這三個典型的「服務端暫時不可用」狀態碼視為可重試（跟現行連線層級失敗共用同一套重試機制），但 `400`（請求本身格式錯誤）／`401`／`403`（認證/授權失敗）／`404`（例如指定的 `calendarType`／`code` 這組行事曆代碼在 Standing 端根本不存在、或本次呼叫傳的 LC 資料本身不完整）這幾類**不應該重試**——這些是呼叫方自己送出的請求有問題，重試只會用一樣的錯誤請求再打三次，徒然拖長 Maker 等待時間，也不會因為多試幾次就變成成功：

```typescript
// clients/standingClient.ts —重試範圍不只涵蓋連線層級失敗，也涵蓋這幾個可重試的 HTTP 狀態碼
const RETRYABLE_HTTP_STATUSES = new Set([502, 503, 504]);
// 400/401/403/404 等——請求本身有問題，重試沒有意義，直接拋出對應錯誤，不進重試迴圈
```

重試次數/間隔沿用現有的 `[100, 200]` 設計，不需要另外發明新的重試參數；差別只在於「什麼情況該進重試迴圈」的判斷條件從「只看 `fetch()` 是否拋出例外」擴大成「`fetch()` 拋出例外，或收到回應但狀態碼在 `RETRYABLE_HTTP_STATUSES` 集合內」，`400`／`401`／`403`／`404` 這幾個維持現行「不重試、直接拋錯」的行為不變。

**這件事只影響 `operationalPaymentDate`（Standing 那一段），不影響 `contractualMaturityDate`**——`contractualMaturityDate` 是 `computeSourceDate()` 純本地運算（`domain/maturityDateCalculation.ts`），不需要呼叫 Standing，Standing 不可用時這部分本來就不受影響；受影響的只有「假日順延後的實際處理日」算不出來這件事，這時應該顯示 `CALENDAR_SERVICE_UNAVAILABLE`、不得完成正式 Approval，不得自行假設週六週日順延或直接拿 `contractualMaturityDate` 頂替——這跟現行程式碼「fail-closed，不靜默 fallback」的既有設計精神一致，本版只是把「連線失敗」擴大成「連線失敗或 503」，沒有推翻既有的 fail-closed 立場。

---

## 七、A2／B2 修改 Tenor Basis／Tenor Type 時的路由重算

```text
Amendment 修改 tenorBasis 或 tenorType：
    Maker Submit（PENDING）：重新呼叫 3.1 的驗證 + 3.2 的路由解析，但不立刻更新 exportSettlementRoute
    Checker Release（正式生效）：路由解析結果連同 exportSettlementRouteBasis／規則版本一併寫回 BalanceContract
```

這跟 `AMEND_EXPIRY`／`AMEND_MATURITY_CALENDARS` 既有的「Maker Submit 不正式更新主檔，Checker Release 才生效」慣例一致，不是新發明的模式。

**已經進入 B3/B4 的既有交易不受追溯影響**——若一份合約在 Amendment 之前已經有 B3 Present Docs 或 B4 Honour/Acceptance 的既有 `BalanceMovement`，Amendment 只改變**之後**的路由判斷依據，不回頭修改已經執行的 `BalanceMovement` 自己的 `event_snapshot`（既有機制，A3 UTILIZE 也是同樣原則：`event_snapshot` 凍結在交易當下）。

**修正：B3（Present Docs）跟 B4（Honour／Acceptance）不是同一種事件，不該共用同一個「已結算」判斷**——B3 只是文件提示，不是結算行為本身（呼應第三節、以及 `cs-tf-balance-knowhow` 對 Document Arrival 的既有定位）；真正決定 `exportSettlementRoute` 有沒有變成正式會計事實的，只有 B4。上一版的 `hasApprovedSettlementEvent` 把兩者混在一起，改成：

```typescript
if (hasApprovedB4SettlementEvent && previousSettlementRoute !== newSettlementRoute) {
  throw new BusinessValidationError(
    'Settlement route cannot be changed after an approved B4 Honour/Acceptance event — ' +
    'this requires a manual exception process, not a standard Amendment.',
  );
}
```

**本版再收斂一層：`hasApprovedB4SettlementEvent` 的判斷本身，不能只看功能代碼（B4），要同時檢查事件狀態跟 `movementType`**——單看「這是一筆 B4 事件」不足以確定它已經是正式、不可逆轉的結算事實：一筆 B4 事件也可能還是 `PENDING`（Maker Submit、Checker 尚未 Release），這時候並不構成「已核准的結算事實」，Amendment 不應該被這種還沒生效的事件擋下來；另外 B4 對應的實際 `movementType` 只會是 `HONOUR` 或 `ACCEPT`（呼應第三節的分流矩陣），排除任何非預期值也是同一道檢查的一部分，避免未來新增其他 `movementType` 時被誤判成結算事件：

```typescript
const hasApprovedB4SettlementEvent = events.some(
  (event) =>
    event.functionCode === 'B4' &&
    event.status === 'RELEASED' &&
    (event.movementType === 'HONOUR' || event.movementType === 'ACCEPT'),
);
```

這跟第四節「`computeConfirmedBalance()` 只加總 `RELEASED` 事件、PENDING 不算進 Confirmed Balance」是同一個「未 Release 不算數」的原則在 Amendment 控制矩陣上的體現——只是這裡管的不是金額加總，是「能不能改結算路由」這個業務規則本身，兩處各自獨立套用同一個 PENDING/RELEASED 原則，不是同一段程式碼共用。

**用詞對照（本版修正，避免開發人員誤讀成兩種不同的正式狀態，也避免誤把 A3/A3S/B3 的顯示狀態當成 `status` 本身；並修正上一版把 B3 誤推論成跟 A3/A3S 同一套機制的錯誤）**：`CLAUDE.md`「REQUIREMENT — Event Status Display Mapping（settled — do not re-derive）」規定 UI 顯示上 A3/A3S 跟 B3 都對應 EARMARKING／EARMARKED、其餘功能（含本節的 B4）對應 PENDING／APPROVED——但這只是**畫面顯示標籤**的規則，底層 `status` 機制 A3/A3S 跟 B3 其實不一樣，上一版文件誤把兩者當成同一套「Checker 核准後 `status` 仍是 `PENDING`」的機制描述，這是不對的，本版修正：

- **A3/A3S**：核對 `acknowledgeArrival()` 的 doc comment 確認，Checker「核准」動作**不會**把底層 `UTILIZE` 的 `status` 從 `PENDING` 改成 `RELEASED`——只寫入 `acknowledgedBy`／`acknowledgedAt` 兩個獨立欄位，`status` 一路維持 `PENDING` 直到 A4／A6 才真正 finalize。畫面上的「EARMARKED」對應的是 `status === 'PENDING'`（加上 `acknowledgedAt` 有值）。
- **B3 完全不同**：核對 `CLAUDE.md`「B3 redesigned to genuinely RELEASE — supersedes the acknowledge()-only design」這段記錄確認，B3 舊版也曾經是 acknowledge-only（同 A3 機制），但**已經被重新設計成走標準的 `release()` 路徑，`status` 真的會從 `PENDING` 變成 `RELEASED`**——用另一個獨立欄位 `presentDocsConsumedAt` 追蹤「是否已被 B4 消耗」，Present Docs Earmark 的認定基準是 `status === 'RELEASED' && !presentDocsConsumedAt`。也就是說 B3 的「EARMARKED」對應的其實是 `status === 'RELEASED'`（且尚未被 B4 消耗），跟 A3/A3S 的「EARMARKED = 仍是 PENDING」剛好相反，只是畫面顯示標籤剛好用了同一個名字。

第 4.1 節的完整範例表描述的是 A3（非 B3）機制，範例本身沒有錯，但這裡的用詞對照表需要把 A3/A3S 跟 B3 分開列，不能合併成一列：

| 功能 | 內部 `status` | 額外條件 | UI 顯示 |
|---|---|---|---|
| A3／A3S Submit | `PENDING` | 尚未 `acknowledgedAt` | EARMARKING |
| A3／A3S acknowledge | `PENDING`（不變） | 已有 `acknowledgedAt` | EARMARKED |
| B3 Submit | `PENDING` | 尚未 Release | EARMARKING |
| B3 Release（真的 Release，不是 acknowledge） | `RELEASED` | `presentDocsConsumedAt` 尚未有值（未被 B4 消耗） | EARMARKED |
| B3 已被 B4 消耗 | `RELEASED`（不變） | `presentDocsConsumedAt` 已有值 | 不再計入 Present Docs Earmark（已轉為正式 B4 結算的一部分） |
| A6／B4 Submit | `PENDING` | 尚未 Release | PENDING |
| A6／B4 Release | `RELEASED` | 已 Release | APPROVED |

對 B4（本節主要討論的對象）而言，`RELEASED` 就是「已核准（APPROVED）」在程式碼層的名稱，兩者是同一件事的兩種呈現——`hasApprovedB4SettlementEvent` 檢查 `status === 'RELEASED'` 是正確的，不需要（也不應該）在資料模型裡另外新增一個 `APPROVED` 狀態值。

已有 B3、但尚未 B4 的中間狀態，不直接套用同一條硬性規則，改成分層處理；本版另外新增「已有 Pending B4（尚未 Release）」這一列，處理 B4 已 Submit、但 Amendment 也同時想改路由的競態情況——若不特別攔阻，Checker 核准的先後順序可能讓 Pending B4 用到 Amendment 生效前或生效後不一致的路由：

| 交易狀態 | 是否可修改結算路由 |
|---|---|
| 尚未有 B3／B4 | 可以，走 3.1／3.2 正常 Amendment 流程 |
| 已有 B3，尚未 B4 | 不預設禁止，但需要人工檢查：修改後的路由是否影響已提示文件的既有 Earmark（`UTILIZE`），需 Maker/Checker 核准，且 B3 自己的 `event_snapshot` 不被追溯修改 |
| 已有 Pending B4（Submit 完成，尚未 Release） | 預設暫停會改變結算路由的 Amendment——需先由 Checker 對 Pending B4 做出決定（Release 或退回），再重新提交 Amendment，避免 Pending B4 跟 Amendment 誰先 Release 決定最終路由的競態 |
| 已有 Approved B4（`HONOUR` 或 `ACCEPT`） | 預設禁止，需另走人工例外流程（Maker/Checker 雙簽 + 理由存證，比照 `maturityDateOverrideReason` 既有模式） |

「已有 B3、尚未 B4」這一列的具體人工檢查標準（要看哪些既有 Earmark、由誰核准）本文件不預設答案，待業務確認；但「已核准 B4 之後預設禁止」跟「Pending B4 期間暫停路由修改」這兩個方向本版直接採用，不再列為完全開放的待確認項目。

---

## 八、驗收標準（合併更新）

**先區分兩道不同性質的關卡，避免「止血完成」被誤讀成「業務可以上線」（審查意見，本版採納）**：

- **Risk Containment Gate（風險控制關卡，本節上方的緊急止血方案屬於這一類）**：不再用「今天」冒充 Base Date；未經驗算的呼叫端 `maturityDate` 一律拒絕；沒有正確日期來源的 Acceptance 一律停在 `PENDING_BASE_DATE`，不得進入 A7／B5 到期結算。這道關卡的目的是**不再產生錯誤的到期日**，通過之後不代表 Usance 業務可以正常運作——如果六種 `tenorBasis` 現階段都還沒有正確資料來源，通過這道關卡的實際後果是**所有 Usance Acceptance 都停在 `PENDING_BASE_DATE`**：錯誤日期不再產生，但正確日期也還算不出來，Acceptance 進不了正式核准與後續到期處理。
- **Business Go-Live Gate（業務正式上線關卡）**：至少完成一種 `tenorBasis` 的正確 Base Date（或 `FIXED_MATURITY_DATE` 的 `fixedMaturityDate`）來源接入；`contractualMaturityDate`／`operationalPaymentDate` 分欄持久化；Standing 假日調整與 `calendarSnapshotId` 持久化；Maker／Checker 核准；A7／B5 Settlement 前置控制。下面的驗收項目同時涵蓋這兩道關卡，個別項目屬於哪一道，見各項目自己的 Go-Live Blocker 標記與第十節決策狀態總表。

一句話：**止血成功，不等於業務可以正式上線。**

- [ ] **Release Blocker**：`contractualMaturityDate`／`operationalPaymentDate` 分欄持久化，`standingCalculationId`／`businessDayConvention`／`calendarSnapshotId` 可稽核（第五節，`standingClient.ts` 型別需同步補齊）
- [ ] **實作進度分層記錄（本版修正，回應審查：「運算已完成並 live 驗證」這句話單獨講會誤導，容易讓人忽略上面 Release Blocker 那條「`contractualMaturityDate`／`operationalPaymentDate` 分欄持久化尚未完成」仍然成立）**：`analysis/A1-A10-B1-B5-Date-Control-Function-Revision-Spec.md` 第 2/3 節 A6/B4 兩列目前是單一狀態標記「✅ 決策已定案，待實作」，這個單一標記無法反映現況——不拆分容易讓人誤以為整列都還沒做（低估已完成的運算部分），或誤以為已經全部做完可以上線（高估，忽略下面好幾個子項其實都還沒做）。核對程式碼與 `CLAUDE.md` 記錄，實際狀態應拆成：

  | 子項 | 狀態 | 依據 |
  |---|---|---|
  | Base Date + Tenor Days 計算（`sourceDate`） | ⚠️ **已完成並測試，但僅限 Base Date＝Submission Date 當日這個特例**（本版查證新增，見下方說明） | `domain/maturityDateCalculation.ts` 純運算；本次以 Business Case Runner 驗證 90 天案例算出 2026-11-23、60 天案例算出 2026-10-22，與 `CLAUDE.md` 既有記錄的驗證案例一致——但這兩個案例用的都是「今天」當 Base Date |
  | Base Date 依 `tenorBasis` 差異化讀取（`sightDate`／BL Date／Invoice Date／Shipment Date） | ❌ **未實作**（本版查證新增，P0） | `routes/balanceMovements.ts` 第 51 行：`calculateAcceptanceMaturityDate({ acceptanceDate: service.getBusinessDate(), ... })`——不論 `tenorBasis` 是什麼，一律寫死傳入「今天」（`service.getBusinessDate()`），完全沒有依 `AFTER_SIGHT`／`AFTER_BL_DATE`／`AFTER_INVOICE_DATE`／`AFTER_SHIPMENT_DATE` 讀取第四節定義的各自 Base Date；`isAcceptanceCreate` 判斷式本身也不檢查 `tenorBasis`，任何 Acceptance CREATE 只要沒有自帶 `maturityDate` 且父合約有行事曆設定，就會走這條「今天當 Base Date」的路徑 |
  | Standing Business-Day Adjustment（`adjustedDate`） | ✅ 已完成並測試 | `clients/standingClient.ts`／`routes/balanceMovements.ts` 第 42–61 行；`CLAUDE.md` 記錄之 live 驗證，472/472 測試通過 |
  | Contractual Maturity Date 分欄持久化 | ❌ 未完成（Release Blocker，上面一條） | `calculateAcceptanceMaturityDate()` 核對第 1189–1207 行確認：只回傳 `{ maturityDate: response.adjustedDate, standingCalculationId }`，`sourceDate`（Contractual 候選值）算出來後即被丟棄，從未回傳也從未持久化 |
  | Operational Payment Date 分欄持久化 | ❌ 未完成（同上） | 同一段程式碼——目前只有單一 `maturityDate` 欄位被寫回合約，跟 Contractual 沒有分開儲存 |
  | Calendar Snapshot（`calendarSnapshotId`／`calendarVersions`）持久化 | ❌ 未完成 | 第五節：`standingClient.ts` 的 `AdjustBusinessDayResponse` 型別未宣告這兩個欄位，即使 Standing 回傳了也讀不到、存不了 |
  | Angular UI 唯讀顯示 | ❌ 未開始 | **查證範圍更正（本版）**：本次查證的程式碼快照不含 Angular 前端原始碼，無法直接核對 `BalanceContract`／`BalanceMovement` interface 是否宣告 `maturityDate` 這個結果欄位；依據 `CLAUDE.md` 記錄——「Angular UI wiring（A6/B4 唯讀顯示、`maturityDateOverrideReason` Override 欄位）仍是尚未開始的獨立工作項目」——判定為未開始，屬於文件佐證，不是本次直接讀原始碼得出的結論 |
  | Manual Override（`maturityDateOverrideReason`） | ❌ 未決定／未實作 | 全專案零筆符合，只出現在規劃文件；權限、流程、生效時機未定案，見 `Maturity-Date-UI-Display-Override-Decision-Request.md` |
  | A7／B5 Settlement 前置控制（`referencedTransactionId` 來源動用 Release 檢查） | 🔧 待實作（本文件 4.1 節建議的程式碼，尚未寫進實際 `assertAcceptanceSettlementAllowed()`） | 4.1／4.3 節 |
  | Export 側 `referencedTransactionId` 對稱性 | ❓ 待查證 | 附錄 A |

  **結論**：不宜寫成籠統的「Maturity Date Calculation：Completed」——只有「算出候選日期＋呼叫 Standing 調整」這一段運算邏輯完成，資料持久化（Contractual／Operational 分欄、Calendar Snapshot）、UI、Override、Settlement 前置控制、Export 對稱性查證都還沒完成，Revision-Spec 的狀態標記應該拆成上面這十個子項，不是單一的「待實作」

  **「Base Date 依 `tenorBasis` 差異化讀取」這一項需要特別說明，重要性不亞於上面任何一個 Release Blocker（本版查證新增）**：v20 原本把「Standing 呼叫與 Maturity Date 運算已完成並 live 驗證」寫成一句籠統的話，本版核對 `routes/balanceMovements.ts` 第 51 行才發現：目前唯一被 live 驗證過的路徑，傳進 `calculateAcceptanceMaturityDate()` 的 `acceptanceDate` 參數，寫死是 `service.getBusinessDate()`（今天）——也就是說，**現行程式碼只有在「Base Date 剛好等於 Acceptance 建立當天」時，運算結果才會剛好正確**（`AFTER_ACCEPTANCE` 且立即承兌、或 `AFTER_SIGHT` 且見票日剛好等於建檔當天等特例）——**這不代表系統「支援」或能辨識這個情境，程式碼本身不知道今天是不是正確的 Base Date，純屬巧合對上，跟 `Maturity-Date-UI-Display-Override-Decision-Request.md` 已經指出的「偶然算對 ≠ 正式支援」是同一件事，本版統一用語**。第二節分流矩陣、第四節 `sightDate`／Base Date 生命週期定義的其他情境——`AFTER_SIGHT`（見票日跟建檔日不同天）、`AFTER_BL_DATE`、`AFTER_INVOICE_DATE`、`AFTER_SHIPMENT_DATE`——目前完全沒有被讀取：程式碼裡沒有任何地方依 `tenorBasis` 去查對應的 BL Date／Invoice Date／Shipment Date／已確認的 `sightDate`，一律用「今天」下去算。**這代表如果現在就把這個自動計算功能套用到這些情境，會算出一個看起來正常、但實際上是錯的到期日，而且沒有任何錯誤或警告**——因為 `computeSourceDate()` 本身的輸入驗證只檢查日期格式跟 `tenorDays` 是不是非負整數，不會知道「今天」是不是這筆交易真正該用的 Base Date。這個缺口比 Contractual／Operational 分欄持久化更根本：分欄持久化沒做，頂多是把正確算出的兩個日期存成一個欄位；Base Date 沒有依 `tenorBasis` 差異化，是連「算出來的候選日期本身」都可能是錯的。**上線前必須先擴充 `routes/balanceMovements.ts` 的這段邏輯，讓它依 `tenorBasis` 讀取正確的 Base Date**——但「其餘讀對應單據既有欄位」這句話本身也是錯的（見上方第四節的更正）：`blDate`／`invoiceDate`／`shipmentDate` 目前不存在，不是單純「換一個欄位讀」就能解決。以下是六種 `tenorBasis` 各自正確的 Base Date 來源、以及目前資料是否已經存在：

| `tenorBasis` | 正確的 Base Date 輸入 | 資料現況 |
|---|---|---|
| `FIXED_MATURITY_DATE` | 不需要 Base Date＋Tenor 運算——直接使用 `fixedMaturityDate` | ❌ **欄位不存在（本版再次查證更正）**：跟 `tenorBasis` 一樣，`fixedMaturityDate` 目前完全不存在於 `types.ts`／`db/schema.ts`（見第四節的更正說明），先前版本一直誤寫成「既有欄位」；欄位新增後，`routes/balanceMovements.ts` 的自動計算分支不應該對這個 `tenorBasis` 執行 `computeSourceDate()`（Base Date＋Tenor Days 這段運算本身該跳過），但 Operational Payment Date 仍須把 `fixedMaturityDate` 送進 Standing 做假日調整——**跳過的只是 Tenor 運算，不是跳過 Standing 呼叫本身** |
| `AFTER_SIGHT` | 已確認的 `sightDate` | ❌ 欄位不存在——第四節提案的 `sightDate`／`sightDateSource`／`sightDateConfirmedBy`／`sightDateConfirmedAt` 都尚未寫進 `types.ts`，純屬本文件的設計提案 |
| `AFTER_ACCEPTANCE` | 「Acceptance Date」——但這個詞本身指的是 Maker Submit 時點、Checker Release 時點、還是銀行實際承兌動作發生的時點，尚未定義（第九節既有待確認事項） | ❌ 連操作定義都還沒確認，談不到欄位；業務先決定定義，才知道該存哪個時間點 |
| `AFTER_BL_DATE` | `blDate`（提單上印的日期） | ❌ 欄位不存在（本版更正） |
| `AFTER_INVOICE_DATE` | `invoiceDate`（發票上印的日期） | ❌ 欄位不存在（本版更正） |
| `AFTER_SHIPMENT_DATE` | `shipmentDate`（裝運日期） | ❌ 欄位不存在（本版更正） |

**BA 角度的建議解法，分兩個時間軸**：

**立即可做的緊急止血（P0，建議優先於下面的完整方案）——本版修正 v22 自己的一個矛盾**：`routes/balanceMovements.ts` 現在的問題不是「選錯了 Base Date 的來源」，是「在不知道正確來源前，自己編了一個（今天）」。v22 原本建議「先讀取父合約的 `tenorBasis`，只有已知才計算」，但這句話本身也有查證疏漏——`tenorBasis` 這個欄位目前**不存在於 `types.ts`／`db/schema.ts`**（見第 3.1 節），程式碼今天沒有 `tenorBasis` 可讀，談不上「先讀取再判斷」。**今天唯一可執行的保守動作**，是把第 42–61 行這段自動計算分支整段停用（或用 Feature Flag 關閉），不分任何情境，全面不再用「今天」去猜 Base Date；等 3.1.1 節 `tenorBasis` 正式加入資料模型後，才有條件恢復成「依 `tenorBasis` 逐一判斷」。

**（審查意見指出，本版收斂）自動計算停用後，不能無條件改用「一律要求呼叫端提供 `maturityDate`」當止血方案**——v22 引用 `createMovement()` 自己的 doc comment『a caller-supplied maturityDate always wins』，把這件事講成一個現成、安全的替代路徑；但核對程式碼（`service/balanceService.ts` 第 1752–1753 行 `maturityDate: req.maturityDate ?? null`）確認，這條 passthrough **對呼叫端送進來的值不做任何驗算**——不檢查是否符合 `tenorDays`、不檢查 Base Date 是否合理、也不記錄這個值從哪裡來。把猜錯的「今天」換成呼叫端任意送入、完全沒有驗算的值，並沒有讓風險變小，只是把「沒有根據的到期日」從後端搬到前端／呼叫端，而且新的來源連運算邏輯都沒有，比原本錯誤但至少可回推的「今天＋`tenorDays`」更難稽核。這也跟本文件與 `Maturity-Date-UI-Display-Override-Decision-Request.md` 共同建立的原則直接衝突：Contractual Maturity Date 不允許被直接覆寫，必須從 Base Date／Tenor Basis／Tenor Days 重新算出；一個沒有驗算、又被當成正式生效值的呼叫端輸入，實質上就是繞過這條原則的直接覆寫。

**（本版再次修正）上一版把「呼叫端提供的 `maturityDate`」標成 `PENDING_APPROVAL` 也是錯的，跟第四節自己下的定義矛盾**：第 190 行 `PENDING_APPROVAL` 的定義寫的是「**基準日已確認、已算出日期**，但這筆 Acceptance 尚未 Checker Release」——呼叫端隨手送一個 `maturityDate`，沒有 `tenorBasis`、沒有 `baseDate`、沒有任何驗算，並不符合「基準日已確認、已算出日期」這個前提；讓它進 `PENDING_APPROVAL`，會讓 Maker／Checker 誤以為這筆日期只是「等核准」，而不是「來源根本沒人驗證過」——雙人核准只能證明「兩個人都看過這個日期」，不能證明「這個日期真的符合信用狀條款算出來的結果」，這兩件事不能混為一談。**正確做法**：自動計算分支停用後，Acceptance CREATE 若沒有呼叫端提供 `maturityDate`，維持現行 `PENDING_BASE_DATE`（`maturityDate = null`），不變；呼叫端若確有提供 `maturityDate`，但沒有可驗算的 Base Date／`tenorBasis`／`tenorDays` 佐證（今天永遠如此，因為這些欄位還不存在），**該值必須被拒絕**（`RequestValidationError`），不得直接存入 `maturityDate` 也不得進 `PENDING_APPROVAL`——這一步需要在 `routes/balanceMovements.ts`／`createMovement()` 新增一個驗證檢查，**是一筆小的程式改動，不是零成本、什麼都不用做**；但不需要新增任何資料欄位，只是新增一個拒絕條件。這個修正後的狀態轉換完全沿用第四節既有設計的 `PENDING_BASE_DATE`／`PENDING_APPROVAL`／`APPROVED` 定義本身，**沒有更動這三個狀態的既有語意**，只是不再誤用 `PENDING_APPROVAL`。

**本版再次更正：上一版把 `FIXED_MATURITY_DATE` 當成這條拒絕規則的唯一例外，理由是「可以用既有 `fixedMaturityDate`」——查證後確認這個理由本身也是錯的**：`fixedMaturityDate` 跟 `tenorBasis` 一樣，目前完全不存在於 `types.ts`／`db/schema.ts`（見第四節上方更正），不是「既有、已核准的欄位」。這代表**今天沒有任何一種 `tenorBasis` 有真正可用的例外路徑**，這條拒絕規則必須對六種 `tenorBasis` 一視同仁地套用，沒有特例；`FIXED_MATURITY_DATE` 要等 `fixedMaturityDate` 欄位比照 `tenorBasis` 新增、完成第 3.1 節建檔驗證後，才能重新獲得例外資格，屬於下面完整方案的一部分，不是今天就能用的捷徑。

**啟用這條拒絕規則前，必須先完成一次相容性盤點，不能直接當破壞性變更上線（審查意見，本版採納，比照 3.1.2 節 `referencedTransactionId` Legacy Backfill 的既有原則）**：現行 `createMovement()` 的 `maturityDate: req.maturityDate ?? null` 這條 passthrough 沒有驗算，代表現在可能已經有 Maker UI、中台 Orchestrator、批次介接、或舊版前端正常依賴這個欄位送值運作。新規則一旦上線，會讓這些呼叫端既有的合法交易全部被 `RequestValidationError` 擋下。上線前應盤點：(a) 目前哪些呼叫來源會傳入 `maturityDate`；(b) 是否已有正式運作中的 A6/B4 流程依賴這個欄位；(c) 是否有既有未結案的 Acceptance，後續交易仍會經過同一段程式碼。確認呼叫端已改為提供可驗算依據（或屬於本節上方定義的新欄位到位前的正常 `PENDING_BASE_DATE` 情境）之後，才能正式切換到 fail-closed，不得直接假設沒有既有呼叫端受影響。

**必須誠實說明現況，不能講成「既有機制可直接重用」**：`maturityDateStatus` 這個欄位本身，第四節（345 行）已經寫明「需要新增」，目前**不在** `types.ts` 裡；4.1 節建議的 `assertAcceptanceSettlementAllowed()` 動用檢查，第八節（669 行）也標記「🔧 待實作」，**尚未寫進實際程式碼**。也就是說，`MaturityDateStatus` 三段生命週期與 A7／B5 Settlement 前置控制都是**本文件已經設計定案、但程式碼尚未落地**的項目，跟這個止血方案（停用自動計算分支＋拒絕未經驗算的呼叫端 `maturityDate`）必須同一批實作、同一批上線，不是「現成已存在，什麼都不用做」的保護；工程團隊不能誤以為「停用自動計算，系統就會自動擋下錯誤日期」——這個保護本身現在也還不存在。這個止血方案唯一站得住腳的「不需要新欄位」，指的是不需要在這三個既有狀態之外再發明新狀態、也不需要新增 `baseDate`／`tenorBasis` 這類新欄位才能執行**拒絕**這個動作；但 `maturityDateStatus` 欄位本身與 Settlement 前置控制程式碼，仍然是必須完成才算數的既有 Release Blocker（見第八、十節）。

**需要新欄位才能做到的更完整驗證（下面完整方案的一部分，僅在系統正式支援外部提供到期日時才構成 Release Blocker，見本段結尾的條件式說明；本版依使用者提議補上假日調整這一步，並依審查意見修正 `FIXED_MATURITY_DATE` 例外、日期角色辨識、Calendar Snapshot 一致性三處疏漏）**：若業務要求呼叫端可以送入「已由外部授權系統算好」的到期日，長期應要求呼叫端一併附上計算依據（`tenorBasis`／`tenorDays`／`baseDate`／`baseDateSource`／`calculationSource`／外部計算參考——`tenorDays` 現有欄位已存在，其餘皆為新欄位），後端**分兩步重新驗算，不是驗一半**：

1. **Contractual Maturity Date 候選值**：`tenorBasis === 'FIXED_MATURITY_DATE'` 時直接使用（新增後的）`fixedMaturityDate`，**不執行** `computeSourceDate()`；其餘五種 `tenorBasis` 用既有的 `computeSourceDate(baseDate, tenorDays)` 重新算出候選值。這一步都不涉及假日——Contractual Maturity Date 本身（第六節既有原則）遇假日不調整，`FIXED_MATURITY_DATE` 也不例外（見第 3.1 節「假日調整範圍」既有說明）。
2. **Holiday／Weekend Check（假日調整）**：把第 1 步算出的候選值送進既有的 Standing `adjustBusinessDay()`（沿用父合約的 `maturityDateCalendars`／`combinationRule`／`convention`，第四、五節既有設計），得出對應的 Operational Payment Date；**驗算時必須釘住同一個 `calendarSnapshotId`（第五節既有欄位）重算，不能拿當下最新的行事曆版本去跟舊值比對**——若行事曆在原始計算之後被修訂（例如政府事後才公告某天為臨時假日），用新版本重算會跟原值對不上，但這不代表呼叫端提供錯誤，是行事曆資料版本換了。**沒有原始 `calendarSnapshotId` 可釘時要分兩種情況（本版依審查意見補上，避免一律用最新行事曆重算後直接接受）**：(a) 第一次接收這筆外部日期、還沒有任何計算紀錄——可以用當前核准的 Calendar Snapshot 驗算，驗算成功後把這個 Snapshot 隨計算結果一併持久化，成為這筆的原始依據；(b) 對一筆已存在的歷史日期重新驗證，但原始 `calendarSnapshotId` 已遺失或查不到——**不得直接用當下最新行事曆重算後就判定原日期正確或錯誤**（用新版本重算，既不能證明原值當初算錯，也不能證明原值當初算對，因為比對基準本身不明），應該標示為 `CALENDAR_SNAPSHOT_UNAVAILABLE`，轉人工覆核，不自動判定。

**`CALENDAR_SNAPSHOT_UNAVAILABLE` 是稽核／重驗算過程中的一個例外／錯誤代碼，不是第四節 `MaturityDateStatus` 三段生命週期之外的第四種狀態（本版依審查意見補上，避免被誤讀成新增狀態）**：這筆 Acceptance 自己的 `maturityDateStatus`（`PENDING_BASE_DATE`／`PENDING_APPROVAL`／`APPROVED`）語意上回答的是「到期日本身有沒有正式生效」，`CALENDAR_SNAPSHOT_UNAVAILABLE` 回答的是完全不同的問題——「這次重新驗算能不能找到足夠的比對基準」，兩者屬於不同的資料維度，不應該合併成同一個欄位的第四個列舉值。特別是：**如果這筆 Acceptance 原本已經是 `APPROVED`（到期日已正式生效），只是因為某次稽核／重驗算時原始 `calendarSnapshotId` 查不到，絕對不能把 `maturityDateStatus` 自動改回 `PENDING_BASE_DATE` 或 `PENDING_APPROVAL`**——這會把一筆已經核准生效、下游可能已經在引用的到期付款義務憑空攔下，造成的業務風險比「暫時無法重驗算」本身更嚴重。較合理的設計方向（illustrative，實際型別與欄位命名待工程排入 3.1.1 節時定案）：

```typescript
interface MaturityDateValidationException {
  errorCode: 'CALENDAR_SNAPSHOT_UNAVAILABLE';
  resolutionStatus: 'MANUAL_REVIEW_REQUIRED' | 'RESOLVED';
  originalCalendarSnapshotId?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewReason?: string;
}
```

也就是用一筆獨立的例外／覆核記錄（可以掛在這筆 Acceptance 底下，或另開一張稽核表）承接「查不到原始 Snapshot」這件事本身，`maturityDateStatus` 欄位維持它原本已經生效的值不變；如果覆核後真的需要暫停某個操作（例如暫緩這筆到期結算），應該由 A7／B5 Settlement 前置控制那一層的獨立業務規則明確決定要不要擋，而不是靠竄改 `maturityDateStatus` 這個欄位本身去間接達到攔阻效果。

**日期角色必須明確，不能靠「猜」，現行單一 `maturityDate` 欄位對此不足**：呼叫端提供的值要比對第 1 步還是第 2 步的結果，取決於這個值宣稱的是 Contractual 還是 Operational——但現行 API 只有一個 `maturityDate` 欄位，沒有任何角色標記，後端無從辨別。長期應比照上面「Contractual／Operational Maturity Date 分欄持久化」的既有 Release Blocker，直接讓呼叫端分欄提供 `contractualMaturityDate`／`operationalPaymentDate`，各自獨立驗算；若短期仍只能維持單一欄位，至少要新增一個角色欄位（例如 `maturityDateRole: 'CONTRACTUAL_MATURITY_DATE' | 'OPERATIONAL_PAYMENT_DATE'`）。**沒有角色標記的 `maturityDate`，一律視為未經驗算、直接拒絕，不得用「兩個候選值剛好相等」（沒遇到假日的情況）去豁免這個規則**——日期數值相同不代表欄位語意可以互相替代。

**這條「必須等於重新驗算結果」的規則，只適用於這裡討論的 CREATE 時未經驗算 passthrough，不適用於 `Maturity-Date-UI-Display-Override-Decision-Request.md` 另外設計的 Operational Payment Date 覆寫流程**——覆寫走的是獨立的 Maker 提出／Checker 核准機制（該文件問題二、五），核准後的覆寫值本來就允許不等於 Standing 算出的原始值，這是已授權的例外，不是驗算失敗；兩套機制的差異詳見該文件的對應更新。

呼叫端提供的值，要看它宣稱的是哪一個日期分別比對：宣稱是 **Contractual Maturity Date** 就必須等於第 1 步算出的值（不得因為假日跟著變動）；宣稱是 **Operational Payment Date** 就必須等於第 2 步 Standing 實際調整後的值。只驗第 1 步、不驗第 2 步（或反過來），都可能誤判——例如候選日剛好是週末，Contractual 值本身不變，但如果呼叫端送的是「已經順延過的日期」卻拿去跟第 1 步比對，會被誤判成不一致而錯誤拒絕；反過來如果只驗第 2 步，會漏掉「呼叫端根本沒有用正確的 `baseDate`／`tenorDays` 算過，只是矇對了剛好落在營業日」這種情況。兩步都對得上，才允許進 `PENDING_APPROVAL`；任一步對不上就拒絕。這個兩步驗證也天然對齊第五節已定案的「Contractual／Operational Maturity Date 分欄持久化」這個 Release Blocker——欄位分開之後，呼叫端理論上應該分別提供並各自驗證這兩個值，而不是只送一個含糊的 `maturityDate`。

**這一整套外部日期驗算，是否構成 Release Blocker，取決於本期實際交付範圍，不是無條件必要**：若本期範圍完全不開放呼叫端提供到期日（所有日期一律系統自算或維持 `PENDING_BASE_DATE`），這套驗算邏輯不是上線前置，可以延後；若本期範圍確實要接受外部系統或人工提供的 Contractual／Operational Date，這套驗算才是必要控制；若只有現行這種模糊的單一 `maturityDate` 欄位、沒有日期角色，則不宜開放外部日期直送，應維持一律拒絕。

**完整方案（依 `tenorBasis`逐一補齊，需要業務／工程排入實作計畫，不是本次一次做完）**：(1) `FIXED_MATURITY_DATE` 把 `fixedMaturityDate` 欄位實際加進 `types.ts`／`db/schema.ts`（本版查證發現這個欄位也不存在，不是「既有欄位可直接用」，見上方更正），完成第 3.1 節的建檔驗證後，自動計算分支對這個 `tenorBasis` 直接跳過 Tenor 運算、改用這個新欄位；(2) `AFTER_SIGHT` 把第四節已經提案的 `sightDate` 相關欄位實際加進 `types.ts`，並在 A6/B4 Acceptance CREATE 前置條件裡要求已確認的 `sightDate` 才觸發計算；(3) `AFTER_ACCEPTANCE` 待業務確認操作定義（第九節）後，才能決定要新增哪個欄位、在哪個時間點捕捉；(4) `AFTER_BL_DATE`／`AFTER_INVOICE_DATE`／`AFTER_SHIPMENT_DATE` 各自新增一個對應欄位（`blDate`／`invoiceDate`／`shipmentDate`），在 A3/B3 文件提示流程新增輸入欄位讓 Maker 填入（比照 `documentPresentationDate` 既有的「A3/B3 呼叫端提供、伺服器端不推導」模式），並在這幾個欄位確認前，Acceptance CREATE 同樣停留在 `PENDING_BASE_DATE`。這四類欄位的新增與 UI 輸入介面，屬於比本文件原本範圍更大的一批工作，具體排期需要業務／工程另外規劃，本文件只記錄正確的目標狀態與現況落差
- [ ] **P0（本版四度修正緊急止血方案——v22「一律要求呼叫端提供 `maturityDate`」、上一版「一律標成 `PENDING_APPROVAL`」、以及上一版把 `FIXED_MATURITY_DATE` 當唯一例外，都經查證後確認不安全或不成立，已改正）**：`routes/balanceMovements.ts` 第 42–61 行的自動計算分支整段停用（`tenorBasis` 欄位本身還不存在，無法依 `tenorBasis` 判斷，見第 3.1 節）；沒有呼叫端 `maturityDate` 時維持 `PENDING_BASE_DATE`；呼叫端確有提供 `maturityDate`、但沒有可驗算的 `tenorBasis`／`baseDate`／`tenorDays` 佐證時（今天永遠如此），**必須新增驗證邏輯直接拒絕（`RequestValidationError`），不得存入 `maturityDate` 也不得進 `PENDING_APPROVAL`**——`PENDING_APPROVAL` 依第四節（190 行）既有定義要求「基準日已確認、已算出日期」，未經驗算的呼叫端輸入不符合這個前提；**`FIXED_MATURITY_DATE` 沒有例外**——`fixedMaturityDate` 本版查證確認也不存在於 `types.ts`／`db/schema.ts`，這條拒絕規則對六種 `tenorBasis` 一視同仁，`FIXED_MATURITY_DATE` 要等 `fixedMaturityDate` 欄位比照 `tenorBasis` 新增後才重新取得例外資格。**上線前先做相容性盤點**（比照 3.1.2 節既有原則）：確認現行哪些呼叫端（Maker UI／中台 Orchestrator／批次介接）正在依賴無驗算的 `maturityDate` passthrough，避免這條新的拒絕規則變成破壞性變更擋下既有合法交易。**誠實現況**：`maturityDateStatus` 欄位（第 345 行標記「需要新增」）與 4.1 節 Settlement 前置控制（第 669 行標記「🔧 待實作」）本身都還沒寫進程式碼，這個止血方案不是「重用現成保護」，是與這兩項既有 Release Blocker 同批實作；只是不需要在既有三段狀態外另外發明新狀態。需要新欄位的完整來源驗算方案（`baseDate`／`baseDateSource`／`fixedMaturityDate`／後端重新驗算）見第四節上方
- [ ] `AFTER_SIGHT` + `SELLERS_USANCE`：A1/B1 建檔（或 A2/B2 修改）階段即被 `RequestValidationError` 擋下，不能建立成功
- [ ] `AFTER_SIGHT` + Import A6 → `ACCEPT`，`sightDate` 已確認（含 `sightDateConfirmedBy`／`sightDateConfirmedAt`）時計算 Contractual／Operational Maturity Date
- [ ] `AFTER_SIGHT` + Import A6，`sightDate` 未確認 → `PENDING_BASE_DATE`，不得猜測到期日
- [ ] `AFTER_SIGHT` + Export B4 → `HONOUR`，不建立 Acceptance Balance，不計算 Maturity Date
- [ ] `AFTER_BL_DATE`／`AFTER_INVOICE_DATE`／`AFTER_SHIPMENT_DATE`／`AFTER_ACCEPTANCE` + Export B4 → `ACCEPTANCE`，Import/Export 對稱
- [ ] `DP`／`DA` → `exportSettlementRouteStatus = MANUAL_REVIEW_REQUIRED`，**不得**被 3.2 的 catch-all 靜默判成 `ACCEPTANCE`
- [ ] `tenorBasis` 缺漏或不在已知清單內（含未來新增但尚未定義規則的值）→ 同樣 `MANUAL_REVIEW_REQUIRED`，不得預設
- [ ] Contractual Maturity Date 遇假日 → 只產生 `operationalPaymentDate`，原值不被覆蓋，`calendarSnapshotId` 可回查
- [ ] A2/B2 修改 `tenorBasis`／`tenorType` → Maker Submit 不立即生效，Checker Release 後才更新 `exportSettlementRoute`；已執行的 B3/B4 `BalanceMovement` 的 `event_snapshot` 不被追溯修改
- [ ] Amendment 導致路由與已核准的 B4 結算事件矛盾 → `BusinessValidationError` 擋下，不走一般 Amendment 流程；`hasApprovedB4SettlementEvent` 同時檢查 `status === 'RELEASED'` 與 `movementType`（`HONOUR`／`ACCEPT`），不能只看 `functionCode === 'B4'`；已有 B3、尚未 B4 的中間狀態依第七節控制矩陣分層處理
- [ ] Standing 回應 HTTP `502`／`503`／`504` → 依第六節修正納入重試；`400`／`401`／`403`／`404` 維持不重試，直接拋出對應錯誤
- [ ] `tenor_basis` 新增與 Legacy Backfill 依 3.1.1 節十步驟順序執行，驗證邏輯與 A1/B1／A2/B2 串接在同一次部署上線，不分兩次部署
- [ ] Legacy Backfill 每筆既有合約回填時，`tenorBasisSource`／`tenorBasisBackfilledBy`／`tenorBasisBackfilledAt` 均有值；來源為 `AUTHORIZED_MANUAL_BACKFILL` 時另需 `tenorBasisBackfillApprovedBy`；**不得**由系統依 `tenorType` 自動反推填入
- [ ] `tenorType = SIGHT` 的合約，`tenorBasis`／`tenorDays` 維持 `null`，建檔與 Legacy Backfill 都不得強行要求／猜測填值
- [ ] `ACTIVE` 且 `tenorType IN (BUYERS_USANCE, SELLERS_USANCE)` 的既有合約，`tenor_basis` 覆蓋率 100%（見 3.1.1 節第 9 步查詢），`CLOSED` 合約豁免須有正式清單與核准紀錄
- [ ] Standing Snapshot 保存期限 ≥ 銀行交易／稽核紀錄留存要求，取得 Standing 所有權團隊正式確認（含快照查詢 API、跨環境可用性、行事曆修訂後是否覆蓋既有快照）；若確認保存期限不足，`balance_contracts` 改採冗餘保存 `calendarVersions[]` 摘要
- [ ] Amendment 遇到 Pending（尚未 Release）的 B4 事件 → 暫停會改變結算路由的 Amendment，需先由 Checker 對 Pending B4 做出決定，避免競態
- [ ] A3 Submit → LC `availableBalance` 立即反映 Earmark（如範例 100,000→99,000）；A6 Submit → LC `availableBalance` **不得**因同一筆金額被重複扣減（維持 99,000，不可變成 98,000）；Acceptance 合約自己的 `availableBalance`／`confirmedBalance` 依它自己的 PENDING/RELEASED 生命週期獨立變化，兩個 BalanceContract 的數字不得混算
- [ ] **修正**：A6／B4 Usance 的 Release 是**兩次獨立呼叫、各自獨立原子**，不是涵蓋 LC＋Acceptance 兩個合約的單一跨合約 Transaction（核對 `service/balanceService.ts` 檔頭 doc comment 確認，見 4.1 節修正說明）——呼叫一（Release LC/Confirmation 自己的 `UTILIZE`／`ACCEPT`）自己的 DB Transaction 涵蓋 `UTILIZE`／`ACCEPT` finalize、`confirmedBalance` 扣減、`pendingEarmarkTotal` 歸零；呼叫二（Acceptance `CREATE`＋Release）自己的 DB Transaction 涵蓋 Acceptance `CREATE` Release、Maturity Date 生效、`standingCalculationId`／`calendarSnapshotId` 持久化；呼叫 Standing 的 HTTP 動作在**呼叫二**的 DB Transaction **之外**先完成，不放進同一個 Rollback 邊界
- [ ] **新增**：中台 Orchestrator 需要能處理「呼叫一成功、呼叫二失敗或未送出」這個中間狀態（LC 端已扣減、Acceptance 端還沒建立）——本文件不預設具體補償機制（重試／人工介入／對帳報表），但這是上線前需要跟 Orchestrator 團隊確認的落地細節，不是 Balance Component 自己能單方面解決的（4.1 節）
- [ ] 呼叫一、呼叫二**各自**支援 Idempotency，**Key 必須是代表同一筆業務操作的穩定值，不能是每次 HTTP 呼叫都可能重新產生的臨時值**（4.3 節修正）——呼叫二建議 Key 組成：LC/Confirmation Number + IB Number + Acceptance Reference + 一個在重試時保持不變的操作識別碼（由呼叫端自己生成並在重試時重複使用，或改用 `businessEventId`／`rootContractId` 等業務欄位組成）；同一組 Key 重送直接回傳原結果，不得重複建立 Acceptance 或重複扣減 LC/Confirmation Balance；同一組 Key 但 payload 不同 → 拒絕並記錄異常；另外追蹤個別 HTTP 呼叫的 `requestId`／`traceId` 可以保留，但不得當成 Idempotency 判斷依據
- [ ] Release 前在 DB Transaction **內**（鎖定相關資料列後）重新比對 `tenorBasis`／`tenorDays`／`sightDate`／適用行事曆／版本號是否與呼叫 Standing 當下一致，不一致則 Rollback 並重新呼叫 Standing 計算，僅在 Transaction 外比對一次不足以防止 Standing 呼叫與 Transaction 開啟之間的競態
- [ ] **A7 已驗證缺口**：`PARTIAL_SETTLE`／`FULL_SETTLE`（A7）目前缺少「Acceptance 自己是否已正式成立、到期日是否已生效」這組前置條件——修正為 A7 提交前新增檢查 `confirmedBalance.lte(0)` 為 false（正數）且 `maturityDateStatus === 'APPROVED'`，兩者缺一不可；**既有的金額充分性檢查（`outstandingCapped`／`checkRedeemSufficiency` 比對 `availableBalance`）維持不變、不得改成比對 `confirmedBalance`**——`availableBalance` 才會正確 net 掉其他還在 PENDING、尚未 Release 的同一筆 Acceptance 結算，改成 `confirmedBalance` 會重新引入 2026-08-15 已修過的雙重結算漏洞（見第四節詳細說明與六組驗收案例）；A6 Submit（PENDING）階段即使 Acceptance 顯示 Preview 金額，A7 仍須被新的前置條件擋下
- [ ] 比照 `assertRootIssueReleased()` 對 `ROOT_INSTRUMENT_TYPES` 的既有保護模式，評估是否要為 `IPLC_ACCEPTANCE`／`EPLC_ACCEPTANCE` 這類子合約新增等價防護（子合約自己的 `CREATE` 未 Release 前，擋下針對它的其他動作），而不是只在 A7 這一個進入點修——同一個缺口形狀（子項可以在自己的基礎動作 Release 前被後續動作處理）理論上也可能發生在其他共用 `outstandingCapped` 的 movementType（`REIMBURSE`／`RECLASSIFY_OUT`）上，需要工程確認影響範圍
- [ ] **B5 是兩種結構不同操作共用同一個業務功能代號，不是單一 movementType**（4.2 節，核對程式碼確認）：B5-到期結算（`PARTIAL_SETTLE`／`FULL_SETTLE`，作用在 `EPLC_ACCEPTANCE`）跟 Import A7 結構完全對稱，共用同一段程式邏輯，A7 已修正的前置條件（`confirmedBalance > 0`／`maturityDateStatus === APPROVED`）只要寫在「被結算的 Acceptance 合約自己身上」即自動適用；B5-求償收回（`REIMBURSE`／`RECLASSIFY_OUT`，作用在 `EPLC_DUE_FROM_ISSUING_BANK`／`EPLC_ACCEPTANCE_REIMB_RECEIVABLE`）是 Import 沒有對應項的獨立維度，是否需要同樣的 Maturity Date 前置條件待業務確認，**不得**未經確認直接套用
- [ ] Export B4（Usance）除了建立 `EPLC_ACCEPTANCE` 之外，是否／何時另外建立 `EPLC_ACCEPTANCE_REIMB_RECEIVABLE`（Confirming Bank 對 Issuing Bank 的求償權），以及這是否又是一次獨立於前兩者的第三次呼叫端呼叫，本文件核對 doc comment 後無法完全確認呼叫次序，需要工程對照中台 Orchestrator 程式碼確認（附錄 A）
- [ ] （4.3 節，Orchestrator 團隊評估，本文件僅提供建議）Orchestrator 是否採用「整體狀態＋各步驟獨立狀態」的流程追蹤模型（`BalanceOrchestration`／`StepStatus`，依 `workflowType` 決定哪些步驟是 `NOT_REQUIRED`，不用隱含固定順序的單一線性 Enum）、具體對帳異常規則（`MISSING_ACCEPTANCE`／`ORPHAN_ACCEPTANCE`／`MISSING_REIMBURSEMENT_RECEIVABLE`／`STALE_ORCHESTRATION`／`DUPLICATE_ACCEPTANCE`）、分層 Retry 政策、未經業務核准不自動沖回已 Release 的根合約異動
- [ ] **流程完整性（Orchestrator `overallStatus`）不得成為擋下 Acceptance 合法付款義務的閘門**（4.3 節）：`assertAcceptanceSettlementAllowed()` 只檢查 Acceptance 合約自己的狀態，B5-到期結算（對受益人的到期付款）不應因為 `receivableStatus`（求償權資產這一側）尚未完成而被延遲拒絕——兩者是不同層次的問題，不得混為一談
- [ ] **P0（本版修正為 fail-closed）：`assertAcceptanceSettlementAllowed()` 新增檢查 Acceptance 自己 `CREATE` 的 `referencedTransactionId` 所指向的來源 `UTILIZE`／`ACCEPT` 是否已 `RELEASED`**（4.1 節）——核對 `types.ts`／`service/balanceService.ts` 確認這個關聯欄位本來就存在（A6 自己在 Submit 當下就把它設成來源 `UTILIZE` 的 `movementId`），只是現行程式碼從未拿它做過驗證；**`referencedTransactionId` 缺失時必須拒絕，不能因為沒有值可比對就跳過檢查、視同放行**（回應審查：舊版「有值才檢查」的寫法在欄位為空時會直接放行，沒有真正達成「必須關聯到已 Release 來源動用」的目標，見案例八）；另外新增來源動用的 `currency`／根合約 `balanceContractId` 一致性檢查，以及 `movementType` 白名單檢查（`IPLC_ACCEPTANCE` 只認 `UTILIZE`；`EPLC_ACCEPTANCE` 只認 `ACCEPT`，`HONOUR` 不列入——附錄 A 已確認 HONOUR 從不建立 Acceptance），避免關聯到不相干或型別錯誤的 movement（案例九）；建議優先把這條檢查提前到 Acceptance `CREATE` 自己 Release 的當下，結算時的檢查作為第二層防線；**fail-closed 正式啟用前，須先處理兩個相容性風險**：(1) 2026-08-16 之前建立、可能沒有這個欄位的既有 Acceptance 資料，需要先跑查詢確認數量並決定處理方式（同 3.1.2 節 Legacy Backfill 的性質）；(2) Export 側（`EPLC_ACCEPTANCE`／資產面合約）是否同樣把 `referencedTransactionId` 指向對應的 `ACCEPT`／`HONOUR` 動用尚未查證（附錄 A）——若 Export 側目前沒有設定這個欄位，fail-closed 上線會讓所有 Export B5-到期結算被擋下，必須先由工程查證並補齊，不應該讓 Import／Export 出現不對稱的過渡態
- [ ] 兩種呼叫順序（先 Release 根合約 vs 先建立 Acceptance）目前程式碼都不禁止，各自存在對稱的孤兒／中間狀態風險（4.3 節，核對 `assertRootIssueReleased()` 只檢查父層根合約 ISSUE、不檢查對應的特定 UTILIZE／ACCEPT 確認）——若採納上面 `referencedTransactionId` 檢查（P0），可把「先 Release 根合約」變成程式碼強制的唯一順序；即使不採納，驗收與對帳邏輯也不應假設某個固定呼叫順序就能完全避免問題，應該兩種中間狀態都能被對帳偵測到
- [ ] B5 分流依實際送入的 `instrumentType`＋`movementType`（必要時對照 `parentLogicalContractId`）由後端判斷該套用哪一組檢查，**不得**只依賴前端傳入的功能代號字串（4.2 節）

**補充驗收案例（本版新增，回應審查建議，聚焦既有六組 Acceptance Settlement 案例沒涵蓋到的跨呼叫／B5 分流情境）**：

```text
案例七：呼叫一（Release 根合約）成功，呼叫二（Acceptance CREATE）因網路逾時失敗；使用相同 Idempotency Key 重試 → 只建立一筆 Acceptance，不得重複
案例八：根合約已扣減，Acceptance 長時間未建立（超過約定門檻）→ 對帳報表應偵測並標示為需要人工處理的案件
案例九：Export B4 ACCEPT 與 EPLC_ACCEPTANCE 建立成功，但 EPLC_ACCEPTANCE_REIMB_RECEIVABLE 建立失敗 → 對帳應能偵測「負債面已建立、資產面缺失」這個不對稱狀態（若確認 B4 需要第三次呼叫，見附錄 A 待確認事項）
案例十：Export AFTER_SIGHT → B4 HONOUR → B5 REIMBURSE（作用在 `EPLC_DUE_FROM_ISSUING_BANK`）→ 不得要求一個不存在的 `EPLC_ACCEPTANCE.maturityDateStatus`
案例十一：呼叫端對一筆 `EPLC_ACCEPTANCE_REIMB_RECEIVABLE` 誤送 `PARTIAL_SETTLE`（該 movementType 語意上對應 Acceptance 到期結算）→ 依 instrumentType／movementType 組合判斷後拒絕
案例十二：呼叫端對一筆 `EPLC_ACCEPTANCE` 誤送 `REIMBURSE`（該 movementType 語意上對應求償收回）→ 依 instrumentType／movementType 組合判斷後拒絕
```

**完整 Export B4 Usance 跨步驟驗收案例（本版新增，涵蓋流程完整性與 Acceptance 付款義務可履行性的區分，4.3 節）**：

```text
1. EPLC_CONFIRMATION 的 ACCEPT Release 成功（rootMovementStatus = COMPLETED）
2. EPLC_ACCEPTANCE 的 CREATE／Release 成功（acceptanceStatus = COMPLETED，confirmedBalance > 0，maturityDateStatus = APPROVED）
3. EPLC_ACCEPTANCE_REIMB_RECEIVABLE 建立失敗（receivableStatus = FAILED，重試中或轉 RECOVERY_REQUIRED）
4. Orchestrator overallStatus = IN_PROGRESS 或 RECOVERY_REQUIRED（因為 receivableStatus 未完成）
5. 但此時對 EPLC_ACCEPTANCE 送出 B5-到期結算（PARTIAL_SETTLE／FULL_SETTLE）→ 必須允許（assertAcceptanceSettlementAllowed() 只檢查 Acceptance 自己的狀態，不受 receivableStatus 影響，見 4.3 節「流程完整性 vs 付款義務可履行性」）
6. 使用相同 Step Idempotency Key 重試步驟三
7. EPLC_ACCEPTANCE_REIMB_RECEIVABLE 成功建立（receivableStatus = COMPLETED）
8. Orchestrator overallStatus 轉為 COMPLETED
9. 步驟六的重試不得重複扣減 EPLC_CONFIRMATION，也不得重複建立第二筆 EPLC_ACCEPTANCE
10. 對帳報表不應（在步驟七完成後）再顯示這筆業務事件為 MISSING_REIMBURSEMENT_RECEIVABLE
```
- [ ] `contractualMaturityDate`／`operationalPaymentDate`／`standingCalculationId`／`calendarSnapshotId`／`maturityDateStatus` 存在**每一筆 Acceptance 自己的 BalanceContract**上，不存在父層 LC 合約；同一張 LC 有多筆 A3/A6 時，各筆 Acceptance 的到期日資料互不覆蓋
- [ ] `tenorBasis = FIXED_MATURITY_DATE` → A1/B1 建檔時 `fixedMaturityDate` 必填、不得早於 `issueDate`／`confirmDate`、`tenorDays` 必須為 `null`；A3/B3 文件提示時另檢查不得早於這次 `presentationDate`；假日調整只影響 `operationalPaymentDate`，`fixedMaturityDate` 本身不被覆蓋
- [ ] B3 的 EARMARKED 對應 `status === 'RELEASED' && !presentDocsConsumedAt`（真正 Release），跟 A3/A3S 的 EARMARKED（`status` 仍是 `PENDING`）機制不同，兩者不得在程式邏輯或文件裡混用同一套判斷
- [ ] **兩步驗算相關案例（本版新增，回應審查意見）**：合約到期日算出來是星期六，順延至星期一 → `contractualMaturityDate` 維持星期六不變，`operationalPaymentDate` 為星期一
- [ ] 呼叫端把「星期一」填進 `contractualMaturityDate`（或無角色標記的單一 `maturityDate` 宣稱為 Contractual）→ 拒絕，因為跟第 1 步未調整的候選值對不上
- [ ] 呼叫端把「星期一」填進 `operationalPaymentDate`（或宣稱為 Operational）→ 與 Standing 驗算結果相符則接受
- [ ] 呼叫端只送一個沒有角色標記的 `maturityDate`，即使數值剛好跟兩個候選值都相等 → 一律拒絕，不得以「數值相等」豁免角色不明的規則
- [ ] `FIXED_MATURITY_DATE` 遇假日 → 第 1 步不執行 `computeSourceDate()`，直接用 `fixedMaturityDate`；第 2 步仍正常執行 Standing 假日調整
- [ ] 重新驗算時行事曆已改版（例如原 `calendarSnapshotId` 對應版本之後才公告的臨時假日）→ 驗算應釘住原始 `calendarSnapshotId` 重算，不得拿當下最新版本重算後直接判定呼叫端提供錯誤；確實需要改用新版本重算，屬於獨立的重算事件，須保留原值、新值、版本差異與核准紀錄
- [ ] Maker 提出的 `overrideOperationalPaymentDate` 經 Checker 正式核准後，即使不等於 Standing 當初算出的 `calculatedOperationalPaymentDate`，也不得被本節「必須等於重新驗算結果」這條規則擋下——覆寫走 `Maturity-Date-UI-Display-Override-Decision-Request.md` 獨立的核准流程，兩者不得混用同一套比對邏輯

**上線前必查項目（Production Readiness Gate，獨立於程式碼驗收，需要能存取正式/準正式環境資料庫才能執行，本文件只給出查詢方式，不代為執行或預判結果）**：

**前提（見 3.1 節）：下面這條查詢要能跑，前提是 `tenor_basis` 欄位已經隨本次修正加進 `balance_contracts` 並完成 Legacy 資料回填**——這個欄位目前在既有程式碼裡完全不存在，回填之前這條查詢查不到任何有意義的結果（因為 `tenor_basis` 全部是 `NULL`）。正確順序是：先完成欄位新增與回填（3.1 節已說明回填流程本身就是主要檢查點），下面這條查詢是回填完成後的最終確認，不是回填之前就能執行的獨立步驟：

```sql
SELECT balance_contract_id, lc_number, tenor_basis, tenor_type
FROM balance_contracts
WHERE tenor_basis = 'AFTER_SIGHT' AND tenor_type = 'SELLERS_USANCE';
```

若查出結果不為零，代表回填流程本身沒有把該擋的組合擋下來——這些既有合約需要業務判斷（資料本身錯誤需更正／建立人工覆核清單／確認是否已有 B3/B4 交易受影響），不應該被本次修正默默略過。

**端對端驗收情境（範例，假設業務最終採用第四節的 Mode A——`sightDate` 未取得時允許先 A6 Submit；若業務最終選 Mode B，則 A6 Submit 在 `sightDate` 未確認時應直接被 `RequestValidationError` 擋下，不會走到 `PENDING_BASE_DATE` 這一步，其餘 A7／Export 情境不受影響）**：

```text
LC Number: LC-2026-000123
Tenor Type: BUYERS_USANCE
Tenor Basis: AFTER_SIGHT
Tenor Days: 90

Import：
    A6 Submit → sightDate 尚未確認 → Maturity Status = PENDING_BASE_DATE
    Sight Date 確認（2026-09-01，sightDateSource + sightDateConfirmedBy/At 皆有值）
    → Contractual Maturity Date = 2026-11-30
    → 呼叫 Standing → Operational Payment Date（依適用行事曆）
    → standingCalculationId／calendarSnapshotId 皆持久化
    → A7：到期依 Operational Payment Date 付款／結清

Export：
    B3 Present Docs → Payment Mode: SIGHT，Maturity Date: Not Applicable
    B4 → HONOUR → 即期付款 → 不建立 Acceptance Balance → 不計算 Maturity Date

驗證點：Inquire Events／Current Balance／Event Snapshot 三處對這筆交易的呈現一致，
Import 側可查到 Contractual／Operational 兩個日期與 calendarSnapshotId，
Export 側完全沒有 Acceptance Balance 相關欄位。
```

---

## 九、待確認事項

- Import A6 的 Acceptance Balance 語意（`LC_ACCEPTANCE`／`APPLICANT_FINANCING`／`INTERBANK_REFINANCING`）——維持前版立場，未解決。
- `DP`／`DA` 的 A6/B4 路由規則——不預設答案。
- `sightDate` 具體對應銀行內部哪一個操作動作——第四節已列出候選來源，最終定義待業務/Ops 確認。
- **`AFTER_ACCEPTANCE` 自己的「Acceptance Date」操作定義同樣未定，跟 `sightDate` 是同一類問題（本版新增，回應審查意見）**：`AFTER_ACCEPTANCE` 這個 `tenorBasis`（分流矩陣第二節已列入路由範圍）需要一個「Acceptance Date」當基準日去算 Maturity Date，但這個日期具體對應 Maker Submit 時點、Checker Release 時點，還是銀行實際承兌動作發生的時點，本文件尚未定義——三個候選時點在時間上通常不同，會算出不同的 Maturity Date（例如 Maker 於 T 日 Submit、Checker 於 T+2 日 Release，若以 Submit 當基準日跟以 Release 當基準日，算出的到期日可能相差數天）。這件事需要跟 `sightDate` 的操作定義一併交給業務/Ops 確認，若本期交付範圍不包含 `AFTER_ACCEPTANCE` 的實際上線，可以延後到下一階段處理，但分流矩陣（第二節）跟路由解析（3.2 節）既有把它列入合法值集合，代表程式碼層面需要為它保留 `PENDING_BASE_DATE` 的處理路徑，不能假設它一定有值。
- **`sightDate` 尚未取得時，是否允許先送出 A6 Submit（Mode A vs Mode B，第四節）**——這是唯一還沒定案的部分；`maturityDate` 能不能被下游引用這件事本身已經定案（`MaturityDateStatus` 三段生命週期，只有 `APPROVED` 可用），不要跟 Mode A/B 的選擇混為一談。
- `calendarSnapshotId` 的保存期限是否符合銀行稽核留存要求（第五節，本版已列為正式 Go-Live 條件，見第八節）——需要跟 Standing 所有權團隊確認服務等級承諾，若不夠長需要改成冗餘保存 `calendarVersions[]`。
- 已有 B3、尚未 B4 的中間狀態，修改結算路由的具體人工檢查標準（第七節控制矩陣已列出分層原則，細節待業務確認）。
- 上線前 Legacy 資料回填與查詢（第八節）的實際執行與結果處理，待有資料庫存取權限的團隊執行；`tenor_basis` 欄位本身的新增與回填時程（3.1.1 節十步驟）需要另外排入實作計畫。
- **中台 Orchestrator 如何處理「A6/B4 各次呼叫之間的中間狀態」（4.1／4.3 節）**：`service/balanceService.ts` 明確是各自獨立原子的多次呼叫，Balance Component 自己不提供跨呼叫的補償機制；4.3 節已提出流程狀態追蹤（`OrchestrationStatus`）、對帳、Idempotency Key 穩定性等具體建議供參考，但這些終究是**建議**，最終設計（是否採用、如何落地）需要跟中台 Orchestrator 團隊確認，本文件不能片面核定 Orchestrator 自己的實作。
- **B5-求償收回（`REIMBURSE`／`RECLASSIFY_OUT`，作用在 `EPLC_DUE_FROM_ISSUING_BANK`／`EPLC_ACCEPTANCE_REIMB_RECEIVABLE`）是否需要跟 B5-到期結算一樣的 `maturityDateStatus === APPROVED` 前置條件，以及是否需要自己獨立的到期日概念（4.2 節／附錄 A；問題本身經審查建議重新表述得更精確）**：`EPLC_ACCEPTANCE` 自己的 `maturityDateStatus` 管的是「銀行對受益人的到期付款義務何時生效」；Issuing Bank 對 Confirming Bank 的求償清償，業務語意上是完全不同的一件事——即使兩者在多數情況下剛好落在同一天，也不代表求償合約應該直接沿用／掛勾 `EPLC_ACCEPTANCE` 的 `maturityDateStatus`。若業務需要管理「預期何時能向 Issuing Bank 收到求償款」，比較合理的做法是在 `EPLC_ACCEPTANCE_REIMB_RECEIVABLE` 自己的合約上定義獨立的欄位（例如 `reimbursementDueDate`／`reimbursementStatus`），而不是重用 Acceptance 那一側的欄位——這組欄位是否需要、命名為何、生命週期怎麼設計，本文件不預設答案，需要業務確認。
- **Export B4（Usance）建立 `EPLC_ACCEPTANCE_REIMB_RECEIVABLE` 的確切時機與呼叫次序（本版新增，4.2 節）**：現有 doc comment 只確認這個 `instrumentType` 是 Honour／Accept 當下轉換出來的資產面對應項目，沒有明講呼叫端具體是幾次呼叫、跟 `EPLC_ACCEPTANCE` 的建立是否同一次呼叫——需要工程對照中台 Orchestrator 程式碼確認，本文件不猜測。

---

## 十、決策狀態總表

彙整全文各項決策目前的狀態，方便不同角色（業務／工程／Standing 團隊）快速定位自己要負責的部分，不取代前面各節的完整說明。「Go-Live Blocker」標記「是」代表沒解決就不能上線；標記「視範圍」代表是否必要取決於本期實際交付範圍。

| 項目 | Owner | 狀態 | Go-Live Blocker | 說明 |
|---|---|---|---|---|
| A6/B4 Calculated Maturity Date 實作進度（回應 Revision-Spec 狀態標記查證） | Balance Team／前端團隊 | **十個子項各自進度不同，不宜合併成單一狀態**（本版修正：避免「運算完成」被誤讀成整體完成，其中一項是新發現的 P0） | 是（UI 顯示、Contractual／Operational 分欄持久化、Base Date 差異化讀取都是必要條件，不是只有其中一項） | **P0 新發現**：`routes/balanceMovements.ts` 第 51 行寫死用「今天」當 Base Date，不分 `tenorBasis`，`AFTER_SIGHT`／`AFTER_BL_DATE`／`AFTER_INVOICE_DATE`／`AFTER_SHIPMENT_DATE` 情境會算出錯誤到期日且無警告；已完成：Base Date＋Tenor 運算（僅限今天當 Base Date 的特例）、Standing 呼叫；未完成：Contractual／Operational 分欄持久化（Release Blocker）、Calendar Snapshot 持久化、UI 顯示、Manual Override、Settlement 前置控制；待查證：Export `referencedTransactionId` 對稱性——完整十項清單見第八節；覆寫權限、流程、生效時機另見 `Maturity-Date-UI-Display-Override-Decision-Request.md` |
| `AFTER_SIGHT` Import 需計算 Maturity Date | TF Business | 已核定 | 是 | 業務已二次直接確認（第一節），本版無變動 |
| `AFTER_SIGHT` Export 一律 Sight Honour | TF Business | 已核定 | 是 | 同上，本版無變動 |
| Contractual／Operational Maturity Date 分欄持久化 | Balance Team | 上線必要（Release Blocker） | 是 | 現行程式碼會把 `sourceDate` 丟棄，第五節已給出修正型別 |
| `tenor_basis` 新增欄位＋Legacy Backfill | Balance Team | 上線必要 | 是 | 3.1.1 節十步驟順序；欄位目前完全不存在，需新增遷移並回填既有資料 |
| Legacy Backfill 稽核欄位（來源／核准人） | Balance Team | 上線必要 | 是 | 3.1.2 節，明文禁止用 `tenorType` 反推猜測 `tenorBasis` |
| `sightDate` 的業務定義（對應哪個操作動作） | TF Business／Ops | 待業務確認 | 是 | 第四節已列候選來源，非本文件可單方面決定 |
| `maturityDate` 的「預覽 vs 正式」保護 | Balance Team | 已核定 | 是 | `MaturityDateStatus`（`PENDING_BASE_DATE`／`PENDING_APPROVAL`／`APPROVED`）三段生命週期已定案，只有 `APPROVED` 可供 A7／報表／提醒／逾期判斷引用（第四節） |
| Estimated（試算）日期與 `PENDING_BASE_DATE` 的欄位區分（本版新增） | Balance Team | 已核定（原則與範例），具體資料模型二擇一待工程確認 | 是 | `PENDING_BASE_DATE` 只禁止正式生效的 Contractual／Operational Maturity Date，不禁止僅供顯示的 Estimated 值；Estimated／Confirmed 欄位須分開宣告，Estimated 值不得供 Settlement／報表／逾期判斷使用（4.4 節） |
| 「業務已核定」標示的實際確認層級（本版新增，v33 更正 Go-Live Blocker 分類） | 全文件 | 已澄清定義，正式對外簽核仍待完成 | **是**（v33 更正：定義本身已澄清不是問題，但若上線前仍未取得實際 TF Business／Ops 的具名簽核，屬於真正的上線阻礙，不只是文件用詞問題） | 本文件「業務已核定」代表使用者於協作過程中以業務／BA 角色確認，非具名 TF Business／Ops 正式簽核；後者以一頁業務確認摘要「確認記錄」表為準，目前仍空白（查證依據標示慣例段落） |
| `sightDate` 未取得時是否允許先 A6 Submit（Mode A vs Mode B） | TF Business | 待業務確認 | 是 | 第四節已攤開兩個方向，Mode A 與現行程式碼行為最接近但非本文件片面決定 |
| Maker Submit 是否可更新 Available Balance／何時建立正式 Acceptance Balance | Balance Team | 已核定（不採納一輪審查意見） | 否，不需改動 | 4.1 節：核對 `acknowledgeArrival()` 確認 A3 UTILIZE 在 Checker「核准」後仍是 `PENDING`，A4/A6 才真正 finalize；經使用者完整數字範例驗證現行行為正確，不採納「Submit 不可動 Available/Acceptance Balance」的審查意見 |
| Calendar Snapshot 保存期限 | Standing 團隊 | 待 Standing 團隊確認 | 是 | 本版已列為正式 Go-Live 條件（第五、八節），非 Balance Component 可單方面承諾 |
| DP／DA 路由規則 | TF Business | 待業務確認 | 視範圍（若本期不涉及 DP/DA 交易可延後） | 完全未定義，現行設計已確保不會被靜默預設為 `ACCEPTANCE` |
| Import A6 Acceptance Balance 會計分類 | Finance／TF Business | 待業務確認 | 視範圍 | `LC_ACCEPTANCE`／`APPLICANT_FINANCING`／`INTERBANK_REFINANCING` 三者語意未解決 |
| Standing 服務重試邏輯（502/503/504 vs 400/401/403/404） | Balance Team | 上線必要 | 是 | 第六節，屬既有程式碼缺口修正，不涉及業務政策 |
| B3／B4／Pending B4 分層 Amendment 控制矩陣 | Balance Team／TF Business | 已核定方向，細節待業務確認 | 是（核定部分）／視細節 | 「已核准 B4 後預設禁止」「Pending B4 期間暫停路由修改」已採用；B3-only 中間狀態的具體人工檢查標準待業務確認 |
| A7 需新增前置條件（`confirmedBalance`／`maturityDateStatus`），金額檢查仍用 `availableBalance` | Balance Team | **已驗證的現有缺口**（非僅建議） | 是 | `assertRootIssueReleased()` 只保護 `ROOT_INSTRUMENT_TYPES`、未覆蓋 Acceptance 子合約，A7 可能對還沒 Release 的 Preview Acceptance 生效——修正是**新增**前置條件，既有 `outstandingCapped`／`availableBalance` 金額充分性檢查不得替換成 `confirmedBalance`（否則重現 2026-08-15 雙重結算漏洞，第四節） |
| （P1，非本次必要）通用子合約防護 `assertAcceptanceCreateReleased()` | Balance Team | 建議，待評估 | 否 | 比照 `assertRootIssueReleased()`，直接檢查 Acceptance 自己 `CREATE` 的 `status === 'RELEASED'`；`REIMBURSE`／`RECLASSIFY_OUT` 是否需要同樣防護待工程確認影響範圍，本文件不預設答案（第四節） |
| Maturity Date 欄位存在每筆 Acceptance 自己的合約上（非父層 LC） | Balance Team | 已核定 | 是 | 同一 LC 多筆 A3/A6 時避免到期日資料互相覆蓋（第五節） |
| Standing HTTP 呼叫與 DB Transaction 邊界分離、Idempotency | Balance Team | 已核定 | 是 | 外部服務呼叫不能放進 DB Rollback 邊界；Release 需可重送不重複建立（4.1 節） |
| **修正**：A6／B4 Release 是兩次獨立呼叫、各自獨立原子，不是單一跨合約 Transaction | Balance Team | 已核對程式碼修正 | 是 | `service/balanceService.ts` 檔頭 doc comment 明確記錄「deliberately does NOT implement... as a single server-side operation」；上一版誤描述為單一原子交易，本版更正（4.1 節） |
| 中台 Orchestrator 對「多次呼叫之間中間狀態」的補償機制 | Orchestrator 團隊 | 待確認，本版提供具體建議供參考 | 是 | Balance Component 自己不提供跨呼叫補償；4.3 節建議流程狀態追蹤／對帳／Idempotency Key 穩定性，但屬建議非片面核定（4.1、4.3、九節） |
| B5 是四個分支共用同一業務代號：到期結算（對稱 A7）／Sight 求償收回／Usance 求償收回／求償權轉類 | Balance Team | 已核對程式碼釐清，並整理成分流矩陣 | 是（到期結算部分）／待確認（求償收回、轉類部分） | 到期結算（`PARTIAL_SETTLE`／`FULL_SETTLE`）跟 A7 共用同一段程式邏輯（`assertAcceptanceSettlementAllowed()`）天然適用；Sight 求償收回業務上不適用 `maturityDateStatus`（即使共用資料模型技術上存在該欄位也須保持 `null`，不得作為前置條件）；Usance 求償收回／轉類是否需要獨立到期日概念待業務確認（4.2 節） |
| 兩種呼叫順序（先根合約 vs 先 Acceptance）皆有對稱孤兒風險，程式目前未強制順序（用詞修正：不是「兩者都合法」） | Balance Team／Orchestrator 團隊 | 已核對程式碼確認風險對稱；已提出用既有欄位強制順序的修正 | 是 | `assertRootIssueReleased()` 只檢查父層 ISSUE，不檢查對應的特定 UTILIZE／ACCEPT；建議在 Acceptance CREATE Release 時新增 `referencedTransactionId` 來源動用已 Release 的檢查，等於把預期順序變成程式碼強制規則（4.3 節） |
| **P0（本版修正為 fail-closed＋movementType 白名單）**：Acceptance Settlement 需新增檢查其來源動用（`referencedTransactionId` 指向的 `UTILIZE`／`ACCEPT`）已 `RELEASED` 且型別正確 | Balance Team | 已核對程式碼確認缺口＋修正 fail-open 漏洞＋新增 movementType 檢查；上線前需先查證既有資料與 Export 側相容性 | 是 | `referencedTransactionId` 是既有欄位（Import A6 已核對確認用法），目前 passthrough 從未驗證；缺失時必須拒絕，不得視同放行（案例八）；來源動用型別必須是 `IPLC_ACCEPTANCE`→`UTILIZE`／`EPLC_ACCEPTANCE`→`ACCEPT`，不接受同根合約下其他已 RELEASED 的 movement（案例九）；Export 側是否同樣設置待工程確認，兩側需一起切換避免不對稱過渡態（4.1 節） |
| **P0（本版查證新增）**：A6/B4 自動計算 Maturity Date 的 Base Date 目前寫死「今天」，不分 `tenorBasis` | Balance Team | 已核對程式碼確認缺口；緊急止血方案本身經四次查證修正——v21「限制在建檔當天」、v22「一律要求呼叫端提供 `maturityDate`」、上一版「呼叫端提供值一律進 `PENDING_APPROVAL`」、上一版「`FIXED_MATURITY_DATE` 可用既有 `fixedMaturityDate` 當例外」都確認不安全或不成立 | 是 | `routes/balanceMovements.ts` 第 42–61 行；`tenorBasis`／`baseDate`／`fixedMaturityDate`／`blDate`／`invoiceDate`／`shipmentDate`／`sightDate` **全部**不存在於 `types.ts`／`db/schema.ts`（`fixedMaturityDate` 本版查證新增更正）；`AFTER_ACCEPTANCE` 的操作定義也未定；緊急止血：分支整段停用，未經驗算的呼叫端 `maturityDate` 一律拒絕，六種 `tenorBasis` 無例外；上線前先盤點現行呼叫端相容性；`maturityDateStatus` 欄位與 Settlement 前置控制本身仍待實作，非現成保護（第四、八節） |
| `DUPLICATE_ACCEPTANCE` 對帳規則改用 `referencedTransactionId`，不用 `businessEventId` | Balance Team | 已修正 | 否，屬對帳規則設計細節 | 一個 `businessEventId` 底下可能合法對應多筆 Acceptance，用它去重可能誤報；`referencedTransactionId` 精確對應單一來源動用，且是既有欄位（4.3 節） |
| `MISSING_REIMBURSEMENT_RECEIVABLE` 對帳規則需涵蓋 Export Sight，不只 Usance | Balance Team | 已修正 | 否，屬對帳規則設計細節 | 拆成 `MISSING_SIGHT_REIMBURSEMENT_RECEIVABLE`／`MISSING_USANCE_REIMBURSEMENT_RECEIVABLE` 兩條規則（4.3 節） |
| `AFTER_ACCEPTANCE` 的 Acceptance Date 業務定義 | TF Business／Ops | 待業務確認 | 視範圍（若本期支援 `AFTER_ACCEPTANCE` 則為必要） | 候選時點（Maker Submit／Checker Release／銀行實際承兌）會算出不同 Maturity Date，本文件不預設答案（第九節） |
| Idempotency Key 修正：須為穩定業務識別碼，不得是每次呼叫都變動的臨時值 | Balance Team | 已核對修正 | 是 | 原「Release Request ID」用詞易被誤實作成每次呼叫重新產生；修正為呼叫端自己在重試時保持不變的識別碼，或改用穩定業務欄位組成（4.3 節） |
| Export B4 是否／何時建立 `EPLC_ACCEPTANCE_REIMB_RECEIVABLE`（求償權資產） | Balance Team | 待工程確認 | 視範圍 | 現有 doc comment 只確認概念存在，未明講呼叫次序，需對照中台 Orchestrator 程式碼（4.2 節） |

---

## 附錄 A：B4／B5 與 A6／A7 程式碼比對細節（背景說明，非本文件決策項目）

本附錄是「請讀一下代碼 把B4 B5 澄清清楚」這項要求的完整回應——單純核對、解釋既有程式碼邏輯，不包含新的決策；由此推導出的分流矩陣與後端判斷依據等實際決策/建議，留在 4.2 節本文。

**B4 的兩個分支，核對 `service/balanceService.ts` 第 288–318 行的 `movementTypeRegistry` 確認**：`HONOUR`（Sight）跟 `ACCEPT`（Usance）都對應 `utilizeShaped` 這個充分性檢查（跟 A3/A4/A6 的 `UTILIZE` 同一組邏輯），都作用在 `EPLC_CONFIRMATION` 這個合約自己的 `CONF_LIAB` 餘額上——這一步是對稱的，B4 的角色跟 A3/A4/A6 一樣，都是把一筆已經 Earmark 的 Contingent 負債轉成正式減少 Confirmed Balance 的動作。

**但 Export 的 Confirmation，在 `HONOUR`／`ACCEPT` 當下多做一件 Import 完全沒有的事——核對 `types.ts` 第 7–16 行的 doc comment 確認**：`EPLC_DUE_FROM_ISSUING_BANK`／`EPLC_ACCEPTANCE_REIMB_RECEIVABLE`／`EPLC_EXPORT_BILLS_DISCOUNTED` 這三個 `instrumentType`（2026-08-15 新增，`Export Confirmation Gap Analysis §4.1`）是「Confirmation 這筆 Contingent 負債一旦 Honour／Accept 之後，轉換成的資產面對應項目」——因為 Confirming Bank 付款給受益人之後，換來的是對 Issuing Bank 的一筆求償權（資產），不是單純負債消失而已。doc comment 原文對應關係：`CNF_HONOUR_SIGHT`／`CNF_HONOUR_BU` → `EPLC_DUE_FROM_ISSUING_BANK`；`CNF_ACCEPT` → `EPLC_ACCEPTANCE_REIMB_RECEIVABLE`；`CNF_DISCOUNT`（若 Confirming Bank 把這筆求償權貼現賣斷）把 `EPLC_ACCEPTANCE_REIMB_RECEIVABLE` 轉類成 `EPLC_EXPORT_BILLS_DISCOUNTED`。

**這代表 B4 Usance（`ACCEPT`）在完整情境下，可能牽動到三個獨立的 `BalanceContract`，Import 的 A6 只有兩個**：

| | Import A6（Usance） | Export B4（Usance） |
|---|---|---|
| 根合約自己的負債減少 | `IPLC_LC` 的 `UTILIZE` | `EPLC_CONFIRMATION` 的 `ACCEPT` |
| 新建立的「對受益人負債」子合約 | `IPLC_ACCEPTANCE`（`CREATE`，代表 Issuing Bank 自己欠受益人的到期付款義務） | `EPLC_ACCEPTANCE`（`CREATE`，代表 Confirming Bank 自己欠受益人的到期付款義務——`ACCEPTANCE_TYPE_BY_ROOT` 這張表已確認 `EPLC_CONFIRMATION → EPLC_ACCEPTANCE` 這組對應關係存在） |
| 新建立的「對第三方求償權」子合約 | **不存在——Import 這條線沒有對應概念** | `EPLC_ACCEPTANCE_REIMB_RECEIVABLE`（`CREATE`，代表 Confirming Bank 對 Issuing Bank 的求償權，這是資產，不是負債） |

**這第三個維度目前程式碼裡的建立時機、是否跟 `EPLC_ACCEPTANCE` 一樣走「呼叫端分開呼叫」的模式，本文件無法只憑現有的 doc comment 完全確認，需要工程確認**——`balanceDerivation.ts` 只記錄了 `ACCEPT` 觸發 `EPLC_ACCEPTANCE` 的 `CREATE`（2026-08-14 的註解），`types.ts` 則是隔天（2026-08-15）才記錄這三個資產面 `instrumentType` 是「Honour／Accept 當下轉換出來的」——兩份 doc comment 沒有明講「呼叫端到底是分兩次呼叫（LC 端 + Acceptance 端）還是三次呼叫（再加資產求償權端）」，這個細節本文件不猜測，留給工程對照實際 Node.js 中台 Orchestrator 的呼叫程式碼確認（本次讀取範圍不含中台 Orchestrator 自己的程式碼；本項待確認事項見第九節）。

**B5（Settlement — Reimbursement/Maturity）不是單一操作，是兩種結構不同的操作共用同一個業務功能代號——`CLAUDE.md` 自己的既有記錄已經證實這件事**：「B5's EB Index merges candidates across both possible instrumentTypes」——B5 的候選記錄查詢本身就要跨兩種 `instrumentType` 找，不是只查一種：

| | B5-作為到期結算（Maturity Settlement） | B5-作為求償收回（Reimbursement） |
|---|---|---|
| 對應 `movementType` | `PARTIAL_SETTLE`／`FULL_SETTLE` | `REIMBURSE`（Issuing Bank 實際付款）／`RECLASSIFY_OUT`（Confirming Bank 把求償權貼現轉類，`CNF_DISCOUNT`，不涉及現金） |
| 作用的合約 | `EPLC_ACCEPTANCE`（B4 建立的「對受益人負債」） | `EPLC_ACCEPTANCE_REIMB_RECEIVABLE`（B4 建立的「對 Issuing Bank 求償權」），`RECLASSIFY_OUT` 另外建立 `EPLC_EXPORT_BILLS_DISCOUNTED` |
| 充分性檢查函式 | `outstandingCapped`／`checkRedeemSufficiency`（`domain/shgtRedeem.ts`） | **同一個函式**——`movementTypeRegistry` 裡 `PARTIAL_SETTLE`／`FULL_SETTLE`／`REIMBURSE`／`RECLASSIFY_OUT`／`PARTIAL_REDEEM`／`FULL_REDEEM` 全部共用 `outstandingCapped` |
| 跟 Import A7 的關係 | **結構完全對稱**——同一個 `movementType`、同一個充分性檢查函式，只是作用在 `EPLC_ACCEPTANCE` 而不是 `IPLC_ACCEPTANCE` | **沒有 Import 對應項**——Import 的 A7 只結清「對受益人的負債」這一側，沒有「向第三方求償」這件事，這條線是 Export Confirmed LC 特有的 |

**這對本文件已經修正的 A7 前置條件檢查有直接影響——本版把該修正明確定位成同時適用於 B5 的「到期結算」子流程，但不預設適用於「求償收回」子流程**：4.1 節已修正的「Acceptance `confirmedBalance > 0` 且 `maturityDateStatus === APPROVED`」這組前置條件，是專屬於 `PARTIAL_SETTLE`／`FULL_SETTLE` 這兩個 `movementType`（不分作用在 `IPLC_ACCEPTANCE` 還是 `EPLC_ACCEPTANCE`）的業務檢查——只要工程實作時把這組前置條件寫在「被結算的 Acceptance 合約自己身上」而不是寫死只認 `IPLC_ACCEPTANCE`，B5-到期結算這個子流程會自動、正確地套用同一套保護，不需要為 Export 另外重新設計一次。**但這組前置條件不應該未經確認就套用到 B5-求償收回（`REIMBURSE`／`RECLASSIFY_OUT`）**：`maturityDateStatus` 這個欄位定義在「對受益人的到期付款義務」這個概念上（第四節），Issuing Bank 何時對 Confirming Bank 完成求償清償，業務上是否受同一個 Maturity Date 概念約束，還是有自己獨立的判斷基準（例如純粹「Issuing Bank 何時實際撥款」，不掛勾到期日），本文件不預設答案——這是待工程確認事項（第九節），本附錄在此把它跟 B5 的具體觸發點對應起來，讓待確認事項不再只是抽象敘述。

**表述修正（回應審查：「沒有這個欄位」講法可能過度確定）**——核對 `types.ts` 第 112 行 `BalanceContract` 的定義確認：這個系統所有 `instrumentType` 共用同一個 `BalanceContract` 介面（`maturityDate`／`tenorType`等欄位都是選填、所有合約種類共用同一張表），本文件新提議的 `maturityDateStatus` 欄位若照這個既有慣例加入，技術上會是**每一種 `instrumentType` 的合約列都存在**的欄位，不是只有 `EPLC_ACCEPTANCE` 才有。上一版「`EPLC_DUE_FROM_ISSUING_BANK` 沒有這個欄位可檢查」的講法因此不夠精確——正確表述應該是：**Sight 求償收回業務上不適用 Acceptance 的到期日概念；即使 `maturityDateStatus` 欄位在共用資料模型中技術上存在於 `EPLC_DUE_FROM_ISSUING_BANK` 這筆列上，也必須保持 `null`，且不得被 `REIMBURSE` 這個 movementType 拿來當前置條件使用**——這樣不論實際實作時是每種 instrumentType 各自建表、還是像現在這樣全部共用同一張 `balance_contracts` 表，這個結論都成立。

**小結**：Import A6→A7 跟 Export B4→B5-到期結算是同一套機制的兩個入口，共用同一段程式邏輯，本文件既有的所有修正（A7 的前置條件、防超額檢查、通用子合約防護建議）天然適用於兩者，不需要另外重寫一份 B4/B5 專屬設計；但 Export B4 額外產生的「對 Issuing Bank 求償權」（`EPLC_ACCEPTANCE_REIMB_RECEIVABLE` 等）以及 B5-求償收回這條線，是 Import 完全沒有的獨立維度，套用同一套 Maturity Date 防護與否需要另外業務確認，不能假設答案一定跟到期結算那一側相同。這個結論的落地版本（分流矩陣、後端判斷依據）見 4.2 節。

---

## 附錄 B：文件格式

若需要正式對外流通的 docx 版本，可依專案既有的 `.md`／`.docx` 雙軌慣例另外產出一份；目前先維持 `.md` 作為工作版本。

**正式核准版本建議精簡結構（審查建議，本版依最新一輪審查回饋更新為十段，供之後產出獨立的「Approved Decision Baseline」精簡文件時參考）**：本工作版本刻意保留每一輪決策過程與程式碼佐證的完整脈絡，篇幅會持續累積（目前近千行），不適合作為簽核用文件直接使用；審查建議另外產出一份約 10–15 頁、給非本文件維護者簽核用的精簡版，建議收斂成：1. 已核定業務規則 2. Import／Export 路由矩陣 3. 六種 `tenorBasis` 各自的 Base Date 來源與現況 4. Contractual／Operational Maturity Date 分欄設計 5. Standing Calendar 規則（Snapshot／假日調整） 6. Maker／Checker 與 Override 機制 7. Risk Containment Gate（止血關卡） 8. Business Go-Live Gate（上線關卡） 9. Migration／Backfill 10. 驗收標準與未決事項——十個段落，只收斂本文件目前已核定或已釐清的結論本身，不重複帶出逐輪審查往返的查證過程與版本歷史。這是**另一份衍生文件**的建議結構，是否／何時實際產出由使用者決定，不是要求把這份工作版本本身重寫成十段，本文件本身仍維持完整脈絡版本繼續作為工程實作的查證依據。

**docx 轉檔的中文字型／表格渲染問題**：本文件本身是純 `.md` 純文字檔，不受任何字型或版面限制；若之後由 `.md` 轉出 `.docx`，轉檔工具或目標環境的中文字型缺失、表格欄寬過窄等渲染問題屬於**轉檔／目標環境**的呈現層問題，不是這份工作版本內容本身的缺陷。產出正式 docx 版本時，建議另外確認：使用的字型能否正確嵌入繁體中文、寬表格（例如第四節、4.1 節的多欄範例表）改用橫向頁面或縮減欄位寬度、避免核心表格被強制跨頁切斷。
