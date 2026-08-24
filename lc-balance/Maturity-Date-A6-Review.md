# A6 Acceptance — Sight Date／Base Date／Mode A vs B 決策紀錄（從主決策文件拆分）

**本文件的由來**：`Maturity-Date-Tenor-Basis-Decision-Review.md`（拆分前已成長至 v41）與
`Maturity-Date-UI-Display-Override-Decision-Request.md`（拆分前已成長至 v25）在多輪「A6 Acceptance
功能修正建議」業務覆核（第一輪至第十六輪，第七輪起本文件成為獨立追蹤單位）中，圍繞 **Sight Date 的業務定義、A6 使用的 Base Date
欄位與取得方式、Mode A vs Mode B、`tenorDays` 一致性檢查** 這組主題持續大量成長，導致兩份主文件本身過於龐大。
本文件把這幾輪覆核新增／修改的實質內容整份搬移出來，兩份主文件各自還原回本次拆分前的最後一次
**已提交（git 已 commit）版本**——`Maturity-Date-Tenor-Basis-Decision-Review.md` **v33**、
`Maturity-Date-UI-Display-Override-Decision-Request.md` **v17**——作為本文件內容的基準版本（baseline）。

**閱讀方式**：本文件內文出現「見上方」「見下方」，指本文件自己內部的段落；出現「見
`Maturity-Date-Tenor-Basis-Decision-Review.md` 第 N 節」或「見
`Maturity-Date-UI-Display-Override-Decision-Request.md`「問題 N」」，指仍留在對應主文件（v33／v17
基準版本）裡的段落——拆分後兩份文件分開閱讀，交叉引用已依此原則全部改寫，確保仍然可以正確定位。

**文件優先順序聲明（回應第七輪覆核意見，避免 BA／工程／測試依據不同文件做出不同實作）**：凡屬 A6
Acceptance 的業務規則、Base Date／Sight Date 的來源與取得方式、Mode A vs Mode B、`FIXED_MATURITY_DATE`
的 A6 輸入方式，一律以本文件為準；`Maturity-Date-Tenor-Basis-Decision-Review.md`（v33 基準版本）與
`Maturity-Date-UI-Display-Override-Decision-Request.md`（v17 基準版本）中，凡與本文件描述不同的段落
（例如主文件第十節決策狀態總表仍把 Mode A vs Mode B、`sightDate` 業務定義標示為「待業務確認」），
視為**已被本文件取代的舊敘述，不代表現行決策**——這是因為兩份主文件已還原至拆分前的最後一次已提交
版本，尚未回寫這幾輪覆核的最新結論；正式回寫、消除這個落差，要等本文件內容併回主文件的那一輪一次
處理（見本文件末段「與兩份主文件的關係」）。在那之前，BA、工程與測試若要確認 A6 相關規則，應以本
文件為唯一依據，不要只看兩份主文件就直接實作。

**查證依據標示慣例**：沿用兩份主文件既有的用詞慣例——「核對／核對程式碼／直接讀取…確認」＝已對照實際原始碼查證；
「依 `CLAUDE.md` 記錄」＝文件佐證非直接查碼；「業務已直接向使用者確認／已核定」＝業務決策本身，不是程式碼事實
（本文件通篇「業務已核定」的實際確認層級，跟兩份主文件相同——代表使用者於本文件協作過程中以業務／BA
決策角色明確表達同意，**不等於**具名 TF Business／Ops 完成的正式書面／會議簽核，後者的正式紀錄位置仍是
`Maturity-Date-UI-Override-Business-Confirmation-Summary.md` 文末的「確認記錄」表格，截至本文件拆分時仍是空白）；
「提案」「建議」「本文件不預設答案」「待業務／工程確認」＝設計提案或未決事項，尚未寫入程式碼。

---

## 一、`tenorDays` 一致性檢查現況與缺口（第三輪 BA 提案覆核查證發現，原主文件 §3.3）

第三輪 BA 提案主張「A6 不得修改 Tenor Basis／Tenor Days，如需修改應透過 A2 Amendment」——這個方向跟一般貿易融資實務一致：Tenor（例如「90 days after B/L date」）是信用狀條款本身的一部分，理論上應該在 A1/B1 建檔或 A2/B2 修改時就固定下來，A6 承兌只是讀取並依此計算到期日，不應該是重新輸入 Tenor 條件的地方。**但直接核對程式碼後發現，現行程式碼對這個方向完全沒有落實，而且落實程度比 `tenorType` 還要更弱**：

- **`tenorType` 已有一致性檢查，但只在「一次建立就固定」的層面**：`domain/tenorRouting.ts` 的 `checkAcceptanceTenorConsistency()`（由 `service/balanceService.ts` 的 `resolveOrCreateContract()` 在 Acceptance CREATE 當下呼叫，核對確認）會比對這筆 Acceptance CREATE 請求自帶的 `tenorType` 是否跟母合約（`parentLogicalContractId` 指向的 LC/Confirmation）自己的 `tenorType` 一致，不一致就用 `RequestValidationError` 擋下——這道防線目前只存在於 `tenorType`。
- **`tenorDays` 完全沒有對應的一致性檢查**：核對 `routes/balanceMovements.ts` 第 42–61 行與 `service/balanceService.ts` 第 1739–1752 行確認，Acceptance CREATE 的 `tenorDays` 是**直接從這次呼叫的請求 body 讀出並存入**（`tenorDays: req.tenorDays ?? null`），沒有任何程式碼把它拿去跟母合約自己的 `tenorDays` 比對——換句話說，同一筆 LC 底下，理論上可以用兩次呼叫、兩個不同的 `tenorDays` 值分別建立兩筆 Acceptance，系統不會發現、也不會擋下這個矛盾。這跟本文件對 `tenorType` 已經核對過的一致性保護程度不對稱。
- **這不是本文件憑空假設的風險，`service/balanceService.ts` 第 1087–1096 行自己的 doc comment 已經side-mention 這件事**：那段註解說明「必填與否」目前是 Angular 前端表單驗證規則，用的是「跟 `tenorDays` 現行做法一樣」的措辭（"gated on tenorType the same way tenorDays already is"）——確認 `tenorDays` 目前確實是每次呼叫端自己提供的欄位，伺服器端未加任何一致性把關，這條路徑本來就是這樣設計的，不是遺漏測試案例。

**本次對這項提案的查證結論：這是一個真實存在、值得補齊的缺口，不是已有邏輯的重複描述**——建議比照 `checkAcceptanceTenorConsistency()` 既有的模式，新增一道對稱的 `tenorDays`（未來 `tenorBasis` 正式新增欄位後，同樣適用）一致性檢查：**母合約已存有 `tenorDays` 時，Acceptance CREATE 只能讀取比對，提供不一致的值直接 `RequestValidationError` 擋下；母合約尚未存過 `tenorDays`（目前的過渡狀態，見 `Maturity-Date-Tenor-Basis-Decision-Review.md` §3.1.1 節）時，A6 不得自行、隱性地把這次請求的值回填到母合約**——第五輪 BA 提案覆核修正了一處先前的疏漏：曾有版本寫「才允許這次 Acceptance CREATE 的值回填到母合約」，這跟「A6 不得修改信用狀條款」的原則自相矛盾，等於是換一個名目讓 A6 悄悄改了 Tenor 條件。母合約缺漏 `tenorDays` 時，正確做法是走跟 `tenorBasis` 完全一致的 Legacy Backfill 流程（`Maturity-Date-Tenor-Basis-Decision-Review.md` §3.1.2 節既有原則：`tenorBasisSource`／`tenorBasisBackfilledBy`／`tenorBasisBackfilledAt`，`AUTHORIZED_MANUAL_BACKFILL` 來源須另有 `tenorBasisBackfillApprovedBy` 核准），需要對稱新增 `tenorDaysSource`／`tenorDaysBackfilledBy`／`tenorDaysBackfilledAt`／`tenorDaysBackfillApprovedBy` 這組稽核欄位，由被授權人員逐筆核准回填，不得由 A6 Acceptance CREATE 這個一般交易動作附帶完成。長期目標是 `tenorDays`／`tenorBasis` 都在 A1/B1 建檔、A2/B2 修改時就固定寫入母合約，A6 Acceptance CREATE 只讀取、不接受呼叫端另外提供不同的值，也不承擔補齊母合約資料的責任。此缺口已列入 `Maturity-Date-Tenor-Basis-Decision-Review.md` 第八節驗收標準。

---

## 二、Sight Date 的來源與確認時點

`AFTER_SIGHT` 的 Base Date 是 Sight Date，但「Sight Date」本身指的是哪個實際發生的動作，不能由系統自行假設 `documentPresentationDate` 就等於 Sight Date（兩者概念不同：前者是文件送達的事實，後者是銀行完成審單/確認見票的動作，兩者理論上可能不同一天）。

**Base Date 依 `tenorBasis` 分流決定來源（業務已核定，取代原本只針對 `sightDate` 單獨設計的欄位模型）**：業務覆核指出，A6 不應該對所有 `tenorBasis` 都要求輸入 Sight Date——不同 `tenorBasis` 需要不同的 Base Date，有些到期日在單據提示時就能依信用狀條款算出，有些則要等進口銀行承兌或確認見票日後才能確定。正確的設計流程應該是：

```text
Tenor Basis
→ 決定需要哪一種 Base Date
→ 決定 Base Date 的來源
→ 計算 Contractual Maturity Date
→ Standing 計算 Operational Payment Date
```

**六種 `tenorBasis` 各自的 Base Date 與取得方式**：

（**查證更正，回應第七輪覆核意見**：`FIXED_MATURITY_DATE` 這一列先前在本表與下方「本期 A6 輸入欄位對照」「A6 使用的 Base Date 欄位／日期來源」三張表都寫成「不需要 Base Date」／「不適用」，但下方「範例四」與「BA 說明」段落（第六輪 BA 提案覆核已核定）明確描述 A6 Maker 須輸入 Fixed Maturity Date、Checker 核對——三張表的舊敘述跟範例互相矛盾，容易讓讀者以為 `FIXED_MATURITY_DATE` 完全不需要 A6 輸入畫面。此次一併修正為一致的「A6 Maker 輸入」設計，不是重新開放輸入時點的討論，只是讓文件三處敘述前後一致。）

| `tenorBasis` | Base Date | A6 如何取得 | 出口銀行交單時是否可能已算出到期日 |
|---|---|---|---|
| `AFTER_SIGHT` | Sight Date | 由進口銀行於 A6 確認見票日或承兌日 | 通常無法單靠出口銀行交單確定；須依信用狀條款及實際見票認定 |
| `AFTER_ACCEPTANCE` | Acceptance Date（欄位名稱 `acceptanceDate`） | **業務已核定（第十六輪覆核）：A6 Maker 輸入或確認實際承兌日期，Checker 核對後核准；Submit 時必填，不得由 Maker Submit Date／Checker Approval Date 等系統時間自動代入** | 通常不能正式確定，因為實際承兌尚未發生 |
| `AFTER_BL_DATE` | B/L Date | **本期核定設計：A6 Maker 依提單輸入 B/L Date，Checker 核對** | 可以，因為 B/L Date 已記載於提單 |
| `AFTER_INVOICE_DATE` | Invoice Date | **本期核定設計：A6 Maker 依發票輸入 Invoice Date，Checker 核對** | 可以，因為 Invoice Date 已記載於發票 |
| `AFTER_SHIPMENT_DATE` | Shipment Date | **本期核定設計：A6 Maker 依運輸單據輸入 Shipment Date，Checker 核對** | 可以，因為 Shipment Date 通常可由運輸單據判定 |
| `FIXED_MATURITY_DATE` | 不適用 Base Date 概念（不透過「Base Date＋Tenor Days」計算） | **本期核定設計：A6 Maker 依信用狀或相關單據直接輸入 Fixed Maturity Date，Checker 核對後核准**（見下方「範例四」與「BA 說明」） | 可以，因為信用狀條款已直接指定到期日；但 A6 仍須由 Maker 輸入、Checker 核對，不是系統自動代入或略過人工確認 |

**本期範圍明確聲明：本期修正僅限 A6，不修改 A3／B3，也不保留「未來由 A3 提供」這種曖昧的過渡措辭**——本期核定的設計就是 A6 直接輸入，不是過渡方案，也不是等待 A3/B3 的暫時安排。若未來業務認為應該改由 A3/B3 提供這幾個欄位，屬於另一項獨立需求，需另立文件重新決策，不預先寫進本次核定設計裡。簡化後的本期 A6 輸入欄位對照如下：

| Tenor Basis | A6 輸入欄位 |
|---|---|
| `AFTER_BL_DATE` | B/L Date |
| `AFTER_INVOICE_DATE` | Invoice Date |
| `AFTER_SHIPMENT_DATE` | Shipment Date |
| `AFTER_SIGHT` | Sight Date |
| `AFTER_ACCEPTANCE` | Acceptance Date（A6 Maker 輸入或確認實際承兌日，Checker 核對；Submit 時必填） |
| `FIXED_MATURITY_DATE` | Fixed Maturity Date（A6 Maker 輸入，Checker 核對；不經「Base Date＋Tenor Days」計算，輸入值直接＝ Contractual Maturity Date，`Tenor Days` 不填、為 `null`） |

（欄位存在性提醒：這裡列的 `blDate`／`invoiceDate`／`shipmentDate`／`fixedMaturityDate` 目前仍完全不存在於 `types.ts`／`db/schema.ts`——上表講的是本期核定要落地的設計（A6 直接輸入），不是現況已有的欄位；兩者的差距是「還沒新增欄位」，不是「還沒決定怎麼設計」，設計本身已經定案。）

### 業務覆核：正式區分「系統判斷的 Base Date 欄位」與「日期來源證據」，並否決新增兩個 Tenor Basis 的提案

一輪 BA 提案曾把 `DOCUMENT_PRESENTATION_DATE`／`DOCUMENT_RECEIVED_DATE` 升格成兩個獨立的新 Tenor Basis（`AFTER_PRESENTATION_DATE`／`AFTER_DOCUMENT_RECEIVED_DATE`），並把「Tenor Basis 決定用哪個欄位」（系統自動判斷，不需使用者選）跟「`sightDate` 實際依哪個銀行操作事件認定」（`sightDateSource` 五值枚舉，仍需逐筆記錄——第十四輪覆核移除 `MANUAL_CONFIRMED_SIGHT_DATE` 後由六值改為五值）這兩層混在一起講成同一個「Base Date Source」；業務正式覆核後五點回覆：

1. **不新增 `AFTER_PRESENTATION_DATE` 與 `AFTER_DOCUMENT_RECEIVED_DATE` 這兩個 Tenor Basis**——除非業務提供實際信用狀條款文字，證明這兩種確實是跟「after sight」不同的獨立條款類型，否則不納入本期設計。`DOCUMENT_PRESENTATION_DATE`／`DOCUMENT_RECEIVED_DATE` 維持原本已核定的定位——它們只是 `tenorBasis = AFTER_SIGHT` 情境下 `sightDateSource` 五個候選值裡的其中兩個，不是獨立的 Tenor Basis，不重複建立第二套平行設計。六種 `tenorBasis` 的合法值集合維持不變。
2. **正式區分「Base Date 欄位」（系統依 `tenorBasis` 自動判斷，不需要使用者選）跟「日期來源證據」（`AFTER_SIGHT` 用 `sightDateSource`、`FIXED_MATURITY_DATE` 用 `fixedMaturityDateSource`，兩者皆需記錄實際認定依據——第十一輪覆核修正，原措辭「僅 `AFTER_SIGHT` 才有」在第八輪業務核定 `FIXED_MATURITY_DATE` 也需要 Date Source 後已過時，見下方表格與說明）**：

   | `tenorBasis` | A6 使用的 Base Date 欄位 | 日期來源 |
   |---|---|---|
   | `AFTER_BL_DATE` | `blDate` | 本期核定設計：A6 Maker 依提單輸入，Checker 核對 |
   | `AFTER_INVOICE_DATE` | `invoiceDate` | 本期核定設計：A6 Maker 依發票輸入，Checker 核對 |
   | `AFTER_SHIPMENT_DATE` | `shipmentDate` | 本期核定設計：A6 Maker 依運輸單據輸入，Checker 核對 |
   | `AFTER_SIGHT` | `sightDate` | 由 `sightDateSource`（五值枚舉，見下方）記錄實際認定來源，屬於稽核證據，不是另一組欄位選擇 |
   | `AFTER_ACCEPTANCE` | `acceptanceDate` | 由 A6 Maker 輸入或確認實際承兌日、Checker 核准（業務已核定，第十六輪覆核，見下方） |
   | `FIXED_MATURITY_DATE` | `fixedMaturityDate`（A6 Maker 輸入，Checker 核對） | `Date Source` 恆為 `FIXED_MATURITY_DATE`，系統自動設定、不需使用者選擇（業務已核定，見下方「業務已核定」段落） |

   「Base Date 欄位」這一層是 Tenor Basis 決定的固定對應，系統自動判斷、不需要使用者手動選擇；「日期來源」這一層目前有兩種 `tenorBasis` 需要——`AFTER_SIGHT` 用 `sightDateSource` 五值枚舉，`FIXED_MATURITY_DATE` 用恆定值 `fixedMaturityDateSource = 'FIXED_MATURITY_DATE'`（業務已核定，見下方第二節「業務已核定」段落）——其餘四種 `tenorBasis`（`AFTER_BL_DATE`／`AFTER_INVOICE_DATE`／`AFTER_SHIPMENT_DATE`／`AFTER_ACCEPTANCE`）的 Base Date 欄位本身就是單一事實，不需要來源枚舉；`AFTER_SIGHT` 的日期來源須逐筆記錄，不能靠 Tenor Basis 自動推導出唯一答案——先前提案把這兩層都稱作「Base Date Source」，容易被誤讀成 `sightDateSource` 枚舉要被單一值取代，業務已明確排除這個誤讀，枚舉維持獨立不變（見下方；第十四輪覆核將枚舉由六值調整為五值）。
3. **維持已核定的 Mode B，不重新開放討論**——`AFTER_SIGHT` 情境下 `sightDate` 未確認時，A6 Submit 必須直接被 `RequestValidationError` 擋下；不會回到「先允許 Submit、標記 `PENDING_BASE_DATE`」這個 Mode A 的行為（見下方第三節）。
4. **`AFTER_ACCEPTANCE` 的 `acceptanceDate` 操作定義業務已核定（第十六輪覆核，業務直接確認）**：`acceptanceDate` 是進口銀行實際承兌該筆匯票或單據的業務日期，由 A6 Maker 輸入或確認，Checker 核准；明確不是 Maker Submit Date，也不是 Checker Approval Date，不得由這兩個系統時間自動代入。
5. **現階段不新增 Tenor Basis，因此不涉及新增 Standing／OAS 枚舉**——`Maturity-Date-Tenor-Basis-Decision-Review.md` §3.1 節「Standing／OAS 層面確認 tenorBasis 合法值集合」這個步驟維持原本的六值範圍；若未來業務提供實際條款證明需要新增，再依正常程序跟 Standing／OAS 團隊對齊。

**`AFTER_ACCEPTANCE` 已解除 Release Blocker（第十六輪覆核，業務直接核定，取代上一輪的兩種互斥情況分析）**：`acceptanceDate` 操作定義已如上點 4 所述業務核定，不再是影響到期日正確性的實質空白。`acceptanceDate` 於 A6 Maker Submit 時必填；若未輸入，Submit 本身直接被 `RequestValidationError` 擋下，不建立這筆 Acceptance，也不產生 `maturityDateStatus = PENDING_BASE_DATE` 中繼狀態。若已輸入，Maker 可以 Submit，系統先計算 Contractual Maturity Date 並呼叫 Standing 計算 Operational Payment Date，交易進入 `PENDING_APPROVAL`；Checker 核准後，Acceptance 與相關日期才正式生效，狀態變為 `APPROVED`。**Checker Approval 是 Submit 後的核准步驟，不得被設計為 Submit 的前置條件**；本 Tenor Basis 不需要 `PENDING_BASE_DATE` 等待路徑，也不需要 Feature Flag 停用。

Submit 時驗證規則：

```typescript
if (tenorBasis === 'AFTER_ACCEPTANCE') {
  if (acceptanceDate == null) {
    throw new RequestValidationError('acceptanceDate is required when tenorBasis = AFTER_ACCEPTANCE');
  }
}
```

```text
A6 Maker 輸入實際 acceptanceDate
    ↓
Maker Submit：驗證 acceptanceDate 必填
    ↓
計算 Contractual Maturity Date = acceptanceDate + tenorDays
    ↓
Standing 計算 Operational Payment Date
    ↓
maturityDateStatus = PENDING_APPROVAL
    ↓
Checker Approve
    ↓
maturityDateStatus = APPROVED；Acceptance 與兩個日期正式生效
```

`acceptanceDate` 由 A6 Maker 輸入或確認。Maker Submit 時，系統依 `Contractual Maturity Date = acceptanceDate + tenorDays` 計算合約到期日，再呼叫 Standing 計算 Operational Payment Date；兩個日期都可供 Checker 核對，但在核准前狀態為 `PENDING_APPROVAL`，尚未正式生效。Checker 核准後，狀態變為 `APPROVED`，Acceptance、Contractual Maturity Date 與 Operational Payment Date 同時正式生效。此算法與其餘單一事實 Base Date 欄位（`blDate`／`invoiceDate`／`shipmentDate`）一致。這條 Submit 必填規則管的是「A6 Acceptance CREATE 這個動作本身」——在 A6 尚未辦理承兌前（例如 A3 收單當下），畫面仍可依 `Maturity-Date-Tenor-Basis-Decision-Review.md` §4.4 節既有的 Estimated／Confirmed 兩階段顯示機制顯示 Estimated Acceptance Date／Estimated Maturity Date（見下方範例三）；差別只在於：一旦進入 A6 Submit 這一步，`acceptanceDate` 必須是實際值，不允許用預估值或系統時間頂替。

**與現行程式碼的衝突（工程待修正，非本文件設計缺口）**：`routes/balanceMovements.ts` 目前在 Acceptance CREATE 的 Maker Submit 當下，`acceptanceDate` 參數無條件傳入 `service.getBusinessDate()`（即「今天」），直接違反業務核定的「不得由 Maker Submit Date／Checker Approval Date 等系統時間自動代入」規則——不論這筆交易的實際承兌日是否等於今天，現行程式碼都用系統當下時間覆蓋。這是既有程式碼需要配合本輪核定同步修正的工程缺陷。

**查證更正（回應第八輪覆核意見）**：這裡原本寫「主文件第八節驗收標準與第十節決策狀態總表已同步更新這個結論」，但跟第四節「本主題項目在主文件第十節決策狀態總表的異動摘要」自己已經記載的事實不符——主文件已還原至 v33 基準版本，第八節、第十節都還是舊敘述，並未真的回寫。正確講法是：這個結論**最新記錄於本文件**，主文件對應章節（第八節驗收標準、第十節決策狀態總表）尚待本文件併回主文件時一併更新（見第四節「本主題項目在主文件第十節決策狀態總表的異動摘要」）。

### `sightDateSource` 完整候選清單（業務已核定，取代原本三值枚舉，僅適用 `tenorBasis = AFTER_SIGHT`；第十四輪覆核修正為五值——移除 `MANUAL_CONFIRMED_SIGHT_DATE`，理由見下方）

```typescript
sightDate?: string | null;
sightDateSource?:
  | 'DRAFT_ACCEPTANCE_DATE'              // 以付款行／承兌行實際承兌匯票日期作為 Sight Date；常見且較明確，但仍須符合信用狀條款與銀行規則
  | 'DRAFT_SIGHTING_DATE'                // 銀行另外記錄的實際見票日期，須有明確業務定義與紀錄
  | 'ISSUING_BANK_CONFIRMED_SIGHT_DATE'  // 由開證銀行正式確認或通知的 Sight Date，須有通知或訊息證據
  | 'DOCUMENT_PRESENTATION_DATE'         // 以文件提示日期作為 Sight Date；只有信用狀條款或銀行核定規則明確如此規定時才可使用
  | 'DOCUMENT_RECEIVED_DATE'             // 以銀行收單日期作為 Sight Date；不應預設成立，除非有明確業務規則或條款依據
  | null;
sightDateConfirmedBy?: string | null;    // 系統依 Maker／Checker 操作自動記錄，非使用者輸入欄位
sightDateConfirmedAt?: string | null;    // 系統依 Maker／Checker 操作自動記錄，非使用者輸入欄位
```

`sightDateConfirmedBy`／`sightDateConfirmedAt` 補齊誰在什麼時候做了這個確認，讓 `sightDate` 有完整的稽核鏈，不是一個沒有來源的日期欄位。

**移除 `MANUAL_CONFIRMED_SIGHT_DATE`（第十四輪覆核，使用者以 BA 角色直接確認）**：A6 本身就是 Maker 輸入、Checker 核對確認——「人工輸入」是輸入方式，不是獨立的業務日期來源；手動輸入的日期若實際依據是匯票承兌紀錄，`sightDateSource` 就該記成 `DRAFT_ACCEPTANCE_DATE`，不該另立一個「人工確認」類別。`sightDateSource` 自此改為五值枚舉，文件裡「六值枚舉」的舊措辭同步更新為「五值」（歷史記錄不回頭改寫，見附錄對應輪次的補註）。

**與 Mode B 決策的一致性說明**：上面這四個欄位在型別上仍然宣告成 optional（`?`），這是刻意的、不是遺漏——因為這組欄位是**六種 `tenorBasis` 共用的同一個 `BalanceContract`／`BalanceMovement` 型別**的一部分，只有 `tenorBasis = AFTER_SIGHT` 才會用到它們，其餘五種 `tenorBasis`（`AFTER_ACCEPTANCE`／`AFTER_BL_DATE`／`AFTER_INVOICE_DATE`／`AFTER_SHIPMENT_DATE`／`FIXED_MATURITY_DATE`）的 Acceptance 完全不需要 `sightDate`，型別系統沒有辦法表達「只有在另一個欄位等於某個值時才必填」這種條件式必填，所以型別本身維持 optional 是正確做法。真正的「Mode B：未確認不得 Submit」這條規則，是**執行期（runtime）驗證**，只在 `tenorBasis === 'AFTER_SIGHT'` 這個分支生效：驗證 `sightDate`／`sightDateSource`／`sightDateConfirmedBy`／`sightDateConfirmedAt` 四者皆非 null（`sightDateSource` 另須屬於上方核定的五種候選值），缺一即以 `RequestValidationError` 擋下 Submit——不是靠型別系統強制，而是靠 Submit 當下的業務規則檢查；不同 `tenorBasis` 各自有各自的必填規則，不能用同一個型別必填/選填設定去籠統套用。

**明文不建議的來源值**：`SYSTEM_TODAY`（系統當天）、`MAKER_SUBMIT_DATE`（Maker 送出時間）、`CHECKER_APPROVAL_DATE`（Checker 核准時間）——除非銀行已經明確規定這個系統操作時間點就是正式見票日，否則不應該把系統動作的時間點直接當成業務上的見票日；這幾個時間點反映的是「這筆交易什麼時候被系統處理」，不是「見票這個商業行為什麼時候實際發生」，兩者混用會讓 `sightDate` 失去業務意義。

**`sightDateSourceJustification` 不屬於系統需求（第六輪 BA 提案覆核曾提出獨立佐證欄位，第十四輪覆核撤回，使用者以 BA 角色直接確認）**：A6 業務輸入只保留 `Sight Date`／`Sight Date Source`；`sightDateConfirmedBy`／`sightDateConfirmedAt` 由系統依既有 Maker／Checker 操作自動記錄。系統不建立 `sightDateSourceJustification` 欄位、不顯示輸入欄位，也不執行相關必填驗證。Sight Date 的正確性由 Maker 輸入、Checker 依單據核對的既有機制把關。除非銀行日後提出正式變更需求，工程不得自行增加此欄位。（`DOCUMENT_PRESENTATION_DATE`／`DOCUMENT_RECEIVED_DATE` 只有在條款或銀行規則允許時才可使用，屬於業務操作備註，不轉換成額外的系統欄位或驗證規則。）

### 架構備註（非本期系統需求，不得據此實作）：是否把 `sightDateSource` 推廣成通用的 `baseDateSource`

本節只保留作為架構比較資料。本期已採用個別欄位命名，不新增通用 `baseDate`／`baseDateSource` 模型；下列型別是未核定的替代方案，不得納入本期開發、OAS 或資料庫 Schema。若未來要採用，必須另立需求並重新取得業務及工程核准。

```typescript
type BaseDateSource =
  | 'DRAFT_ACCEPTANCE_DATE' | 'DRAFT_SIGHTING_DATE' | 'ISSUING_BANK_CONFIRMED_SIGHT_DATE'
  | 'DOCUMENT_PRESENTATION_DATE' | 'DOCUMENT_RECEIVED_DATE' // AFTER_SIGHT，完整五值，須與上方 sightDateSource 候選清單同步（第十四輪覆核移除 MANUAL_CONFIRMED_SIGHT_DATE，原六值改五值）
  | 'ACCEPTANCE_DATE'        // AFTER_ACCEPTANCE
  | 'BILL_OF_LADING_DATE'    // AFTER_BL_DATE
  | 'INVOICE_DATE'           // AFTER_INVOICE_DATE
  | 'SHIPMENT_DATE'          // AFTER_SHIPMENT_DATE
  | 'FIXED_MATURITY_DATE';   // FIXED_MATURITY_DATE（業務已核定，第八輪覆核）——先前版本漏列，只放在下方註解，型別上不存在，已修正為型別本身的合法值
// FIXED_MATURITY_DATE：baseDate = null，baseDateSource = 'FIXED_MATURITY_DATE'，contractualMaturityDate = fixedMaturityDate 直接帶入
// 提醒：這整組 baseDateSource 統一欄位是方案 (b)（見下方）才會採用的假設性設計，目前預設方案 (a)——實際命名見上方「業務已核定」段落的 fixedMaturityDateSource
```

**業務已核定（第十五輪覆核，業務直接確認）：本期採方案 (a)，不採方案 (b)**——**(a)** 保留現有做法——`sightDate`／`blDate`／`invoiceDate`／`shipmentDate`／Acceptance Date／`fixedMaturityDate` 各自獨立命名，`sightDate` 因為來源本身有多種可能才需要配一個 `sightDateSource`，`fixedMaturityDate` 雖然來源恆定為單一值，仍需配一個 `fixedMaturityDateSource` 供稽核記錄「這個 Contractual Maturity Date 的計算邏輯是直接輸入」（業務已核定，見上方「業務已核定」段落——第十二輪覆核修正，原措辭只提到 `sightDate` 需要配 Source，未同步提及 `fixedMaturityDate`）；其餘欄位（`blDate`／`invoiceDate`／`shipmentDate`／Acceptance Date）因為來源單一（單據上的日期），且不需要稽核區分計算邏輯來源，不需要額外的來源欄位；**(b)** 全面改用統一的 `baseDate`／`baseDateSource` 一對欄位取代上面所有個別命名的欄位，每種 `tenorBasis` 都用同一組欄位，只是 `baseDateSource` 的值域不同——方案 (b) 的好處是欄位設計對稱、未來加新 `tenorBasis` 不用再加新欄位，缺點是需要回頭把兩份主文件跟本文件已經寫好的大量引用個別欄位名稱的段落全部改掉，改動範圍不小；**業務評估後核定不採用方案 (b)，本節保留純作為架構比較記錄，不是待業務／工程評估的開放選項；未來如需改用，須另立需求並重新取得業務及工程核准**。

### 業務構想備註（非本期系統需求，不得據此實作）：對方已通知到期日時的核對機制

本期 A6 不新增 `Counterparty Advised Maturity Date`、`Validation Result` 或差異原因等欄位，也不建立相關比對流程。以下內容僅保留作為未來需求構想；若要納入系統，必須另立需求並完成業務、UI、API、資料模型及驗收規則核定。

如果出口銀行在交單時已經通知了它自己算出的到期日，A6 建議增加一個參考欄位做核對，而不是直接採信：

```text
Counterparty Advised Maturity Date：2026-11-30    // 對方通知的到期日，僅供參考
System Calculated Maturity Date：2026-11-30       // 本行系統依自己的 Base Date／Tenor Basis／Tenor Days 算出的到期日
Validation Result：MATCH                          // 或 MISMATCH
```

兩者不同時（例如對方通知 `2026-12-01`，本行算出 `2026-11-30`），應要求人工確認差異原因，常見類別包括：起算日不同、Tenor Days 不同、對方通知的其實是 Contractual Maturity Date 而本行顯示的是已經過假日調整的 Operational Payment Date（或反過來）、信用狀條款解讀不同。**不論原因為何，都不能直接把對方通知的日期覆蓋系統算出的 Contractual Maturity Date**——這跟 Contractual Maturity Date「系統計算、不接受人工直接輸入」的既有立場（`Maturity-Date-Tenor-Basis-Decision-Review.md` 第一節、`Maturity-Date-UI-Display-Override-Decision-Request.md` 問題一）完全一致：對方通知的日期只能觸發核對流程，不能繞過系統計算直接寫入。這是一個功能構想，**業務已核定（第十五輪覆核）本期不納入交付範圍**，僅保留作為未來需求參考；若未來要納入，須另立需求並完成業務、UI、API、資料模型及驗收規則核定。

```text
Sight Date 已確認 → 計算 Contractual Maturity Date → 再呼叫 Standing 計算 Operational Payment Date（Maturity Status = PENDING_APPROVAL，待 Checker Release）
Sight Date 未確認 → A6 Acceptance CREATE 的 Maker Submit 直接被 RequestValidationError 擋下（業務已核定 Mode B，見下方）——不會建立這筆 Acceptance，也就不會產生 Maturity Status = PENDING_BASE_DATE 這個中繼狀態
```

**重要澄清，避免誤讀**：「出口銀行已算出日期」不代表出口銀行單方面決定進口銀行的正式到期日。正確的說法是：如果信用狀條款與相關單據日期已經明確，出口銀行可以據此計算到期日；進口銀行在 A6 仍應依相同條款與單據核對，並完成承兌確認——出口銀行算出的日期是參考值，不是可以直接採用的正式答案。

### Maturity Date 與 Tenor Basis：出口行／進口行決策表（彙整上方查證結論，非新增業務規則）

下表把上方「六種 `tenorBasis` 各自的 Base Date 與取得方式」表格與「出口銀行交單時是否可能已算出到期日」欄位的結論，換一個角度彙整成一張速查表：

| Tenor Basis | 日期依據 | 出口行決定 | 進口行決定 |
|---|---|---|---|
| `AFTER_BL_DATE` | B/L Date + Tenor Days | ✓ | |
| `AFTER_INVOICE_DATE` | Invoice Date + Tenor Days | ✓ | |
| `AFTER_SHIPMENT_DATE` | Shipment Date + Tenor Days | ✓ | |
| `AFTER_SIGHT` | Sight Date + Tenor Days | | ✓ |
| `AFTER_ACCEPTANCE` | Acceptance Date + Tenor Days | | ✓ |
| `FIXED_MATURITY_DATE` | 指定日期直接等於 Contractual Maturity Date | ✓ | |

`AFTER_BL_DATE`、`AFTER_INVOICE_DATE`、`AFTER_SHIPMENT_DATE`、`FIXED_MATURITY_DATE` 這四種，出口行依信用狀條款與單據日期決定；`AFTER_SIGHT`、`AFTER_ACCEPTANCE` 的起算日期涉及進口行自己的見票或承兌動作，由進口行決定。**出口行決定的日期依據，由進口行於 A6 核對並確認；進口行決定的日期依據，則由進口行於 A6 確認見票日或承兌日**——不論哪一種，進口行 A6 的 Maker 輸入、Checker 核對都是 Contractual Maturity Date 正式生效的必要步驟，「出口行決定」指的是日期依據由哪一方的業務動作產生，不是略過 A6 直接生效。

### 工作範例

**範例一：`90 Days After B/L Date`**（示範「A6 交易本身的執行日期」跟「Base Date」是兩件事，這個原則同樣適用 Invoice Date／Shipment Date）：信用狀條款 `Tenor Basis = AFTER_BL_DATE`、`Tenor Days = 90`、`B/L Date = 2026-09-01`。出口銀行交單時即可計算 `Contractual Maturity Date = 2026-09-01 + 90 days = 2026-11-30`。進口銀行 A3 收單：`Document Arrival Date = 2026-09-05`，`B/L Date = 2026-09-01`（單據上印的日期，不是收單日）。進口銀行 A6 承兌：`Base Date = 2026-09-01`、`Contractual Maturity Date = 2026-11-30`，`Operational Payment Date` 由 Standing 計算（第十二輪覆核修正：原範例寫「`Base Date Source = BILL_OF_LADING`」，但現行核定設計裡 `AFTER_BL_DATE` 不需要獨立的 Source 欄位——只有 `AFTER_SIGHT`／`FIXED_MATURITY_DATE` 才有，見上方「業務已核定」段落；且即使沿用「架構備註」段落的假設性統一命名，正確枚舉值也是 `BILL_OF_LADING_DATE`，不是 `BILL_OF_LADING`，原範例兩處都不準確，已刪除該欄位）。即使 A6 實際辦理是在 `2026-09-08`（`Acceptance Date = 2026-09-08`，這是 A6 這筆交易的執行日期），也**不能**改用 `2026-09-08 + 90 days`，因為信用狀條款是「90 days after B/L date」，不是「90 days after acceptance」——**Acceptance Date 是 A6 交易日期，B/L Date 才是 Maturity Date 的 Base Date**，兩者不能混用。

**範例二：`90 Days After Sight`**（`sightDate` 的一種具體來源示範）：信用狀條款 `Tenor Basis = AFTER_SIGHT`、`Tenor Days = 90`。A3 收單：`Document Arrival Date = 2026-09-01`——但收單日期不一定等於正式 Sight Date。A6 辦理承兌：`Sight Date = 2026-09-03`、`Sight Date Source = DRAFT_ACCEPTANCE_DATE`，因此 `Contractual Maturity Date = 2026-09-03 + 90 days = 2026-12-02`。這個情境下 `A6 Acceptance Date = Sight Date = Base Date`，**前提是銀行業務已明確規定：A6 的承兌日期即為該筆匯票的正式見票日**——這是 `sightDateSource = DRAFT_ACCEPTANCE_DATE` 這個來源值適用時的情況，不是每一筆 `AFTER_SIGHT` 都必然如此（見上方 `sightDateSource` 完整候選清單，其他來源值不會有這個等式）。

**範例三：`90 Days After Acceptance`**（呼應 `Maturity-Date-Tenor-Basis-Decision-Review.md` §4.4 節已核定的 Estimated 概念，這裡用同一個 `tenorBasis` 具體示範；`acceptanceDate` 操作定義業務已核定，見上方第二節）：信用狀條款 `Tenor Basis = AFTER_ACCEPTANCE`、`Tenor Days = 90`。A3 收單：`Document Arrival Date = 2026-09-01`，此時最多只能給出預估：`Estimated Acceptance Date = 2026-09-03`、`Estimated Maturity Date = 2026-12-02`。A6 實際承兌：`Actual Acceptance Date = 2026-09-05`，正式計算 `Contractual Maturity Date = 2026-09-05 + 90 days = 2026-12-04`。預估日期（2026-12-02）與正式日期（2026-12-04）不同——出口銀行交單當時如果還不知道進口銀行實際承兌日期，就不能把預估日期當成正式到期日，這點跟 §4.4 節「Estimated 與正式生效日期的欄位區分」的原則完全一致。

**範例三之補充（業務提供的實務案例，第十六輪覆核）**：同一筆交易上，Maker Submit Date（A6 Maker 實際按下 Submit 的系統時間）、`acceptanceDate`（進口銀行實際承兌日）、Checker Approval Date（Checker 核准的系統時間）三者可能各不相同——例如 `Maker Submit Date = 2026-09-04`、`acceptanceDate = 2026-09-03`（實際承兌日早於 Maker 送出 Submit 的時間）、`Checker Approval Date = 2026-09-05`，`Tenor Basis = 90 Days After Acceptance`，則 `Contractual Maturity Date = 2026-09-03 + 90 days = 2026-12-02`——**必須以 `acceptanceDate`（2026-09-03）為準，不是 Maker Submit Date（2026-09-04），也不是 Checker Approval Date（2026-09-05）**；除非三者剛好同一天，否則用另外兩者任一個都會算錯到期日，這正是業務核定「`acceptanceDate` 不得由 Submit／Approval 系統時間自動代入」的實務理由。

**範例四（第六輪 BA 提案覆核新增——不是新的業務規則，是把上面各段已經分散核定的內容，補齊成跟範例一～三對稱的完整工作範例）：`FIXED_MATURITY_DATE`**：與其餘五種 `tenorBasis` 不同，`FIXED_MATURITY_DATE` 不透過「輸入日期 + Tenor Days」計算 Maturity Date，而是使用者直接輸入信用狀或相關單據載明的到期日，輸入值本身就是 Contractual Maturity Date：

| Tenor Basis | 輸入日期 | 計算方式 |
|---|---|---|
| `AFTER_BL_DATE` | B/L Date | B/L Date + Tenor Days = Contractual Maturity Date |
| `AFTER_INVOICE_DATE` | Invoice Date | Invoice Date + Tenor Days = Contractual Maturity Date |
| `AFTER_SHIPMENT_DATE` | Shipment Date | Shipment Date + Tenor Days = Contractual Maturity Date |
| `AFTER_SIGHT` | Sight Date | Sight Date + Tenor Days = Contractual Maturity Date |
| `AFTER_ACCEPTANCE` | Acceptance Date | Acceptance Date + Tenor Days = Contractual Maturity Date |
| `FIXED_MATURITY_DATE` | Fixed Maturity Date | 輸入日期直接 = Contractual Maturity Date，不執行 Tenor Days 加總 |

範例：

```text
Tenor Basis：FIXED_MATURITY_DATE
Fixed Maturity Date（使用者輸入）：2026-12-02
Fixed Maturity Date Source：FIXED_MATURITY_DATE（第十輪覆核新增——系統自動設定，不可手動選擇）
Tenor Days：不適用（不填、不參與計算）
Contractual Maturity Date：2026-12-02（＝ Fixed Maturity Date，不經過 computeSourceDate()）
Operational Payment Date：2026-12-03（Standing 依適用行事曆調整後的結果，假設 12-02 為週三國定假日）
```

**「Base Date Source」概念澄清（第六輪 BA 提案覆核查證發現並修正，歷史記錄，已被下方第八輪決議取代）**：使用者提供的原始草案曾建議畫面上加一個「Base Date Source = `FIXED_MATURITY_DATE`」欄位，用意是讓使用者清楚看到這筆交易的到期日計算邏輯是「直接輸入」而非「Base Date + Tenor Days」。第六輪查證當時認為不應該加這個欄位，理由是 `Maturity-Date-UI-Display-Override-Decision-Request.md`「建議 UI 顯示欄位」已核定「六種 `tenorBasis` 只有 `AFTER_SIGHT` 真正有『來源』這個概念」，且這個 Source 值恆等於 `tenorBasis` 本身、不提供新資訊。**這項結論已被下方第八輪業務決議取代，保留於此僅供沿革參考，不代表現行規則。**

**業務已核定（第八輪覆核，使用者以 BA 角色直接確認）：`FIXED_MATURITY_DATE` 需要記錄 Date Source，值恆為 `FIXED_MATURITY_DATE`**：

```text
Tenor Basis = FIXED_MATURITY_DATE
Date Source = FIXED_MATURITY_DATE
```

**建議型別（第十輪覆核新增——文件已決定欄位名稱，但先前未明確列出型別）**：

```ts
fixedMaturityDate?: string | null;
fixedMaturityDateSource?: 'FIXED_MATURITY_DATE' | null;
```

當 `tenorBasis = FIXED_MATURITY_DATE` 時：`fixedMaturityDate` 由 A6 Maker 輸入；`fixedMaturityDateSource` 由系統自動設定為 `'FIXED_MATURITY_DATE'`，使用者不可手動選擇；`tenorDays` 為 `null`；`contractualMaturityDate` 直接等於 `fixedMaturityDate`（不經過 `computeSourceDate()`）。

**條件式驗證規則（第十一輪覆核新增——先前只描述 `FIXED_MATURITY_DATE` 自身的欄位行為，未明確規定其餘五種 `tenorBasis` 下這兩個欄位必須為 `null`，避免舊資料殘留或同時存在兩套到期日計算依據）**：

```text
當 tenorBasis = FIXED_MATURITY_DATE：
- fixedMaturityDate 必填，不得為 null；
- fixedMaturityDateSource 必須等於 'FIXED_MATURITY_DATE'；
- tenorDays 必須為 null（不適用）；
- baseDate 必須為 null（不適用——FIXED_MATURITY_DATE 不使用 Base Date，見本節開頭定義）。

當 tenorBasis ≠ FIXED_MATURITY_DATE（其餘五種 tenorBasis）：
- fixedMaturityDate 必須為 null；
- fixedMaturityDateSource 必須為 null。
```

Submit 當下由伺服器端強制檢查，任一條件不成立即以 `RequestValidationError` 擋下。

**驗收案例（第十一輪覆核新增）**：

1. `tenorBasis = FIXED_MATURITY_DATE`，`fixedMaturityDate`／`fixedMaturityDateSource` 皆正確填寫 → 允許 Submit。
2. `tenorBasis = FIXED_MATURITY_DATE`，但 `fixedMaturityDate` 或 `fixedMaturityDateSource` 缺失，或仍帶有非 `null` 的 `tenorDays` → `RequestValidationError` 擋下，不允許 Submit。
3. `tenorBasis` 為其餘五種之一，但請求帶有非 `null` 的 `fixedMaturityDate` → `RequestValidationError` 擋下，不允許 Submit。
4. `tenorBasis = AFTER_SIGHT`，`sightDate` 有值，但 `sightDateSource` 為 `null` → `RequestValidationError` 擋下，不允許 Submit（第十二輪覆核新增）。
5. `tenorBasis` 不是 `FIXED_MATURITY_DATE`，`fixedMaturityDate` 為 `null`，但 `fixedMaturityDateSource` 仍有值（來源殘留但日期已清空的不一致狀態）→ `RequestValidationError` 擋下，不允許 Submit（第十二輪覆核新增，補齊第十輪條件式驗證規則遺漏的邊界情境）。
6. `tenorBasis = FIXED_MATURITY_DATE`，但 `baseDate` 仍有值（未依規則清空）→ `RequestValidationError` 擋下，不允許 Submit（第十二輪覆核新增，對應第十輪驗證規則「`baseDate` 必須為 `null`」這一條）。

- **`Date Source` 由系統依 `tenorBasis` 自動設定，不允許使用者手動選擇**——這點跟第六輪查證的結論從未衝突，衝突只在於「要不要保留／顯示這個值」，現在已由業務明確拍板：要保留。
- **資料層面，欄位命名須避免「Base Date」字面誤導**：`FIXED_MATURITY_DATE` 明確不適用 Base Date 概念（見上方），所以承接這個值的稽核欄位**不應該叫 `baseDateSource`**——那個名字暗示存在一個 Base Date，跟這個 `tenorBasis` 的定義本身矛盾。比照 `sightDate` → `sightDateSource` 的既有命名慣例，本文件建議命名為 **`fixedMaturityDateSource`**，值恆為 `'FIXED_MATURITY_DATE'`，不得是 `null`——與其餘五種 `tenorBasis` 一樣，每一筆 Acceptance 都要能在稽核資料中查到「這個 Contractual Maturity Date 的日期來源是什麼」，`FIXED_MATURITY_DATE` 不再是資料層面「沒有來源」的例外。（下方「架構備註」段落記錄的是否改用統一 `baseDateSource` 欄位取代個別命名，業務已核定不採用，僅供架構比較參考，見下方。）
- **UI 層面**：主畫面可以唯讀顯示「Date Source：`FIXED_MATURITY_DATE`」；若基於畫面精簡考量不放上主畫面，仍必須放在詳細資料／稽核畫面，不能完全不顯示——跟 `sightDateSource` 目前「只在 `AFTER_SIGHT` 時顯示，且放在詳細資料／稽核畫面」的既有安排一致（見上方「業務覆核」表格），不是重新開一個矛盾的例外，而是把 `FIXED_MATURITY_DATE` 一併納入「`AFTER_SIGHT` 與 `FIXED_MATURITY_DATE` 這兩種 `tenorBasis` 都有獨立 Date Source 欄位可稽核」這個通則裡（第十輪覆核修正——原措辭「每種 `tenorBasis` 都有稽核可查的 Date Source」不精確，容易誤讀成六種都有獨立欄位）；其餘四種 `tenorBasis`（`blDate`／`invoiceDate`／`shipmentDate`／`acceptanceDate`）本身即為單一事實欄位，經由該欄位本身及單據資料即可追溯，不需要獨立的 Source 欄位。
- **`Maturity-Date-UI-Display-Override-Decision-Request.md`「僅 `AFTER_SIGHT` 顯示 Source」的既有通則，併回主文件時需要同步修正**——不再是「僅 `AFTER_SIGHT`」，而是「六種 `tenorBasis` 均須能追溯其日期依據，但只有 `AFTER_SIGHT`（`sightDateSource` 五值枚舉）與 `FIXED_MATURITY_DATE`（恆定值 `'FIXED_MATURITY_DATE'`）需要獨立的 Date Source 欄位；其餘四種（`blDate`／`invoiceDate`／`shipmentDate`／`acceptanceDate`）本身就是單一事實欄位，沒有多值來源可記錄，經由該欄位本身及單據資料即可追溯，不需要另外的 Source 欄位」（第十輪覆核修正原「六種都有各自的 Date Source 記錄」這句容易誤讀為六種都有獨立欄位的措辭）。此項已列入下方「本主題項目在主文件第十節決策狀態總表的異動摘要」。

**BA 說明**：當 Tenor Basis 為 `FIXED_MATURITY_DATE` 時，A6 畫面應提供 Fixed Maturity Date 欄位，由使用者直接輸入信用狀或相關文件載明的到期日，不適用 Tenor Days。Contractual Maturity Date 直接等於 Fixed Maturity Date；Operational Payment Date 則由 Standing 微服務依適用行事曆計算。

**A6 初次輸入與核准後修正的時點區分（第七輪覆核提出，第八輪覆核指出原本三段階段界線寫得不一致，已修正）**：先前版本一邊在流程圖裡把界線畫在「已 `APPROVED`」，一邊在理由段落寫「含 Maker Submit 後、或已 `APPROVED`」，兩處對「已 Submit、尚未核准」這個中間階段該怎麼處理沒有講清楚、彼此矛盾。修正為明確三階段，比照主文件 §4.4 節「Base Date 在不同階段的修改控制」對其餘五種 `tenorBasis` 已核定的既有做法，`fixedMaturityDate` 套用相同的三段式界線：

| 階段 | 控制方式 |
|---|---|
| Maker 尚未 Submit | 可以直接修改 `fixedMaturityDate`；草稿階段的每次修改不需要各自產生正式紀錄，不算 Amendment |
| 已 Submit、尚未 `APPROVED` | 欄位視為待核准草稿，不得直接改值：須先 Withdraw／Reject 原 Submit，修正後重新 Submit；不需要走正式 LC Amendment |
| 已 `APPROVED` | 這個值已正式生效、下游可能已引用，必須走 `Maturity-Date-Tenor-Basis-Decision-Review.md` §4.4 節既有的正式 LC Amendment／Contractual Date Correction 機制，不得直接修改 |

理由：A6 Maker 在「尚未 Submit」與「已 Submit、尚未核准」這兩個階段輸入或修正 Fixed Maturity Date，都還屬於**建立這筆 Acceptance 本身的一部分**——在 `APPROVED` 之前，系統裡沒有任何一筆已生效的 `fixedMaturityDate` 可言，不存在「被修改」的正式對象；§4.4 節定義的 Amendment／Correction 機制，只適用**已 `APPROVED`、已正式生效之後才發生的變更**，不是從 Maker Submit 那一刻就算數——這點在把 `FIXED_MATURITY_DATE` 明確定調為 A6 Maker 輸入之後尤其需要講清楚，避免被誤讀成每一筆 A6 初次輸入或 Submit 後的小幅訂正都要先走一次 Amendment 流程。

---

## 三、Mode A vs Mode B（業務已核定：選 Mode B）

**Mode B：`sightDate` 未確認前，不允許送出 A6 Acceptance CREATE 的 Maker Submit。**

**特別註明：以下 Mode A/B 決策只針對 A6（Import）的處理，跟 B4（Export）或其他交易無關**——`Maturity-Date-Tenor-Basis-Decision-Review.md` 第一節已核定「`AFTER_SIGHT` Export 一律 Sight Honour」：Export 側在 `AFTER_SIGHT` 情境下走 B3 Present Docs → B4 HONOUR（即期付款），根本不建立 `EPLC_ACCEPTANCE`、不觸發 Maturity Date 計算，所以「`sightDate` 未確認時能不能送出 Acceptance CREATE」這個問題在 Export 側不存在，不需要、也不應該套用 Mode A/B 的討論。下面提到的兩點業務理由描述的都是 Import 端開證銀行自己的內部動作，不是在講 Export 端的收款時點，同樣只適用於 A6。

**業務核定依據（使用者原話，逐字保留）**：「MODEL B是一定的。因為SIGHT DATE這天 開證銀行一面承兌 一面付款給出口銀行 一面開始與客戶計息」「DAYS AFTER SIGHT是開證行給買方的融資行為」「所以出口行當作SIGHT處理」——也就是說 Sight Date 不是一個可以「先留白、之後再補」的行政欄位，而是三件事同時發生的**價值日（Value Date）**：(1) 開證銀行對匯票做出承兌（Acceptance，法律上的無條件承諾）、(2) 開證銀行對出口地銀行付款（Nostro 撥款，出口行視同即期取得款項）、(3) 開證銀行對買方（Applicant）的融資／計息正式起算。這三件事沒有先後，是同一天的同一個業務事件。

**獨立查證（未只憑使用者陳述照抄，已對照 `cs-tf-balance-knowhow` skill 的權威參考資料 `references/rationale-en.md` §3.6 逐條核對）**：`Maturity-Date-Tenor-Basis-Decision-Review.md` 第一節已核定「`AFTER_SIGHT` 依產品政策僅限 Buyer's Usance／UPAS 情境使用（Export Sight、Import 融資）」，因此適用的是 §3.6（Buyer's Usance／UPAS）的記帳機制，不是 §3.7–3.8（Seller's Usance／Acceptance-DPU，到期日才真正撥款出口行）的機制——這兩組機制在「出口行何時實際拿到錢」這件事上結論相反，選錯會導向錯誤的 Mode 判斷：

- §3.6 原文核心結論：「In **both** structures the beneficiary is paid **at sight**」——不論 BU-A（`fundingParty = SELF`，買方自行融資）或 BU-B（`fundingParty = REFINANCING_BANK`，轉融資銀行墊款），受益人（出口商／出口行）都在 Sight 當天就拿到錢，不是等到到期日。
- 同一節並明確：買方（Applicant）這一側的融資利息，是從這個 Sight／撥款日開始起算，一路計到到期日；BU-B 情境下，同一天也同時起算轉融資銀行與開證行之間的 Interbank 計息。
- 對照組 §3.7–3.8（Seller's Usance／Acceptance-DPU）：承兌本身在承兌當下即認列為資產負債表項目（Acceptance Reimbursement Receivable／Acceptances & DPU Outstanding），但對出口地銀行的實際現金撥款（Nostro payout）明文是「PAY OUT ON VALUE DATE」——即到期日才撥款，跟 §3.6 的「Sight 當天就撥款」完全不同的時點。這正好解釋了為什麼本產品刻意把 `AFTER_SIGHT` 限定在 Buyer's Usance／UPAS 情境（§3.6 的即期撥款模式），而不是開放給 Seller's Usance（§3.7–3.8 的到期撥款模式）——兩者的 Sight/Acceptance Date 在業務意義上並不對等，本產品既有政策的分流本身就已經隱含了「`AFTER_SIGHT` 情境下 Sight Date＝真正的撥款與計息起算日」這個事實，本文件只是把它明文化。

**與現行程式碼比對後的更正**：核對 `routes/balanceMovements.ts` 第 42–61 行與 `service/balanceService.ts` 的 `calculateAcceptanceMaturityDate()` 後發現，現行程式碼在 Acceptance CREATE 的 Maker Submit 當下，`acceptanceDate` 參數是**無條件**傳入 `service.getBusinessDate()`（也就是「今天」），完全沒有 `tenorBasis`、`sightDate`、`sightDateStatus`／`PENDING_BASE_DATE` 這些概念（本檔案通篇 grep 不到 `sightDate`／`tenorBasis`／`AFTER_SIGHT` 任何一個字），所以現行程式碼既不是 Mode A、也不是 Mode B，而是**兩者都不是**——它用「今天」硬套進 Maturity Date 計算，不管這筆交易的真正 Base Date（Sight Date／Acceptance Date／其他）是否等於今天，這正是既有缺陷本身，不能拿它當作「Mode A 改動較小」的論據。換句話說，不管選 Mode A 或 Mode B，都需要新增「`sightDate` 是否已確認」這個現行程式碼完全沒有的判斷；差別只在於**未確認時，是允許 Submit 先成立（Mode A）、還是直接擋下 Submit（Mode B）**，這才是兩個 Mode 之間唯一真正的實質差異。

| | Mode A（不採用） | **Mode B（業務核定採用）** |
|---|---|---|
| Maker Submit | 允許成立，`maturityDate = null`／`Maturity Status = PENDING_BASE_DATE` | **不允許成立**，`RequestValidationError` 擋在 Submit 當下 |
| 未確認 `sightDate` 時 | `Maturity Status = PENDING_BASE_DATE`（Submit 允許成立） | **Submit 本身直接被拒絕**——理由：`sightDate` 是承兌／撥款／計息同時發生的價值日，日期未定代表這筆交易真正的經濟事實（欠開證行多少融資、從哪天起息）尚未發生，不應該讓一筆「尚未真正存在」的 Acceptance 先建檔 |
| Checker Release | 若 `sightDate` 仍未確認，Release 本身被擋下 | Submit 階段已確保 `sightDate` 存在，Release 不會再卡在「`sightDate` 未確認」這個原因上；Checker Release 仍是必要步驟，`maturityDateStatus` 同樣要等 Release 才變 `APPROVED` |
| 對既有流程的影響 | 較小（但現行程式碼本來就沒有這個判斷，「較小」不是選 Mode A 的有效理由） | 需要在 Submit 這一步就先取得 `sightDate`——前端／API 呼叫方須在送出 A6 CREATE 之前，先完成 Sight Date 確認（例如開證銀行實際做出承兌動作、或取得對方通知的確認承兌日）這個前置步驟；此限制只針對 A6，B4 在 `AFTER_SIGHT` 情境下走 HONOUR，不受影響 |
| 何時適合 | 若業務流程允許「先建檔、後補 Sight Date」——**業務已明確否決此前提**（「沒確認 哪能建檔？」） | Sight Date 未確認時，這筆 Acceptance 對應的真實承兌／撥款／計息事件根本還沒發生，系統不應該讓它先以「存在但欄位空白」的狀態出現 |

**本節範圍限定**：以上 Mode B 決策的原始討論範圍是 `tenorBasis = AFTER_SIGHT`；`AFTER_ACCEPTANCE` 的 `acceptanceDate` 已於第十六輪覆核另行核定為 Submit 時必填（見上方第二節），性質上與此處的 Mode B 一致——未輸入即直接擋下 Submit，不建立 `PENDING_BASE_DATE` 中繼狀態——已無獨立未決問題。

```text
Sight Date 未確認 → Maturity Status = PENDING_BASE_DATE，不得建立正式 Maturity Date  ← 已廢棄的 Mode A 敘述，不適用
```

**流程圖（依業務核定的 Mode B 改寫）**：

```text
Sight Date 已確認 → 計算 Contractual Maturity Date → 再呼叫 Standing 計算 Operational Payment Date（Maturity Status = PENDING_APPROVAL，待 Checker Release）
Sight Date 未確認 → A6 Acceptance CREATE 的 Maker Submit 直接被 RequestValidationError 擋下（業務核定 Mode B）——不會建立這筆 Acceptance，也就不會產生 Maturity Status = PENDING_BASE_DATE 這個中繼狀態
```

**`AFTER_SIGHT` 這一列在 `Maturity-Date-Tenor-Basis-Decision-Review.md` 「六種 `tenorBasis` 各自 Base Date 與取得方式」表格中的既有標示**：`AFTER_SIGHT` 未確認時的狀態欄標示為「不適用」——業務已核定 Mode B（見上方），`sightDate` 未確認時 Acceptance CREATE 本身在 Maker Submit 當下就被 `RequestValidationError` 擋下，不會建立這筆 Acceptance，因此不會有機會進入 `PENDING_BASE_DATE` 狀態；這一列跟其餘五列不同，是唯一的例外。

**三種 Submit 時日期必填的 Tenor Basis**：`AFTER_SIGHT` 的 `sightDate`、`AFTER_ACCEPTANCE` 的 `acceptanceDate`，以及 `FIXED_MATURITY_DATE` 的 `fixedMaturityDate`，都必須在 Maker Submit 前取得。若對應日期缺失，Acceptance CREATE 直接以 `RequestValidationError` 拒絕，不建立 Acceptance，也不進入 `PENDING_BASE_DATE`。因此 `AFTER_SIGHT` 並非唯一例外；上述三種 Tenor Basis 適用相同的「先取得日期、再 Submit」原則。

**端對端驗收情境（依 Mode B 改寫）**：

```text
LC Number: LC-2026-000123
Tenor Basis: AFTER_SIGHT
Tenor Days: 90

Import：
    A6 Submit（sightDate 尚未確認）→ RequestValidationError 擋下，不允許建檔
    Sight Date 確認（2026-09-01，開證銀行完成承兌／付款出口行／對客戶起息同一天，
    sightDateSource + sightDateConfirmedBy/At 皆有值）
    A6 Submit（sightDate 已確認）→ Maturity Status = PENDING_APPROVAL
    → Contractual Maturity Date = 2026-11-30
    → 呼叫 Standing → Operational Payment Date（依適用行事曆）
    → standingCalculationId／calendarSnapshotId 皆持久化
```

---

## 四、對兩份主文件本身的修正（Layer 1 顯示規則、UI 適用範圍、決策狀態總表異動）

以下是這幾輪覆核順帶修正的、原本就存在兩份主文件裡的段落，因為跟上面的 Mode B／Base Date 決策緊密相關而放在一起記錄；文字已改寫成可獨立閱讀。

### `Maturity-Date-UI-Display-Override-Decision-Request.md`「三層顯示與驗算控制標準」Layer 1，`AFTER_SIGHT` 例外（區分「畫面草稿」與「正式建立 Acceptance」）

上一版寫法容易被誤讀成 `AFTER_SIGHT` 完全不會出現在 Layer 1——這不精確：Mode B 限制的是 **Submit 這個動作**，不是畫面輸入或試算本身。正確的三種情況是：

1. **A6 畫面草稿階段**：Maker 可以正常輸入 Sight Date，畫面也可以正常顯示依目前輸入試算出的 Contractual／Operational Payment Date（跟其餘 `tenorBasis` 的 Layer 1 行為一致，不是例外）；
2. **Sight Date 尚未確認就按下 Submit**：依 Mode B，Submit 本身被 `RequestValidationError` 直接拒絕，**不建立這筆 Acceptance**，因此不會產生 `maturityDateStatus = PENDING_BASE_DATE` 這個中繼記錄——這是跟其餘 `tenorBasis` 不同的地方：Base Date 未確認時，Submit 仍會成立、只是停在 `PENDING_BASE_DATE`；`AFTER_SIGHT` 則是 Submit 這一步直接不成立；
3. **Sight Date 已確認才 Submit**：正常成立，`maturityDateStatus = PENDING_APPROVAL`，跟其餘 `tenorBasis` 走同一套 Layer 2／3 流程。

「未確認時停在 `PENDING_BASE_DATE`」這句敘述，只適用 `AFTER_BL_DATE`／`AFTER_INVOICE_DATE`／`AFTER_SHIPMENT_DATE` 這三種——`AFTER_SIGHT` 走上述 Mode B（情況 2）；`AFTER_ACCEPTANCE` 的 `acceptanceDate` 已於第十六輪覆核核定為 Submit 時必填，Submit 本身直接被 `RequestValidationError` 擋下，同樣不會產生 `PENDING_BASE_DATE` 中繼記錄（見上方第二節）；`FIXED_MATURITY_DATE` 依第十一輪覆核核定的條件式驗證規則（見上方），`fixedMaturityDate` 同樣是 Submit 必填欄位，不留在 `PENDING_BASE_DATE`。

### `Maturity-Date-UI-Display-Override-Decision-Request.md`「延伸建議」第 2 點修正

原範例誤把 `tenorDays` 當成 A6 畫面上 Maker 可自由修改的輸入——`tenorDays` 屬於信用狀條款本身（Tenor Basis／Tenor Days），目標設計是由 A1/B1 建檔、A2/B2 Amendment 固定，A6 只讀取顯示，不應該是 Maker 在 A6 Submit 前隨手修改的欄位；現行程式碼確實還沒有這道保護（見本文件第一節查證），但這是待補的缺口，不是本畫面應該延續的設計。修正後的建議：「Layer 1 即時重算——如果 Maker 在 Submit 前又修改了 Base Date（例如 B/L Date、Sight Date），畫面應該即時重新試算並更新顯示，不要留著舊的試算值」。

### `Maturity-Date-UI-Display-Override-Decision-Request.md`「建議 UI 顯示欄位」適用範圍澄清與欄位調整

**適用範圍澄清**：下面這組欄位是 A6／B4「建立 Acceptance」情境專屬的，不適用 `AFTER_SIGHT` 的 B4 Honour（即期付款）情境——`Maturity-Date-Tenor-Basis-Decision-Review.md` 第一、二節已核定 Export 端 `AFTER_SIGHT` 一律走 B3 Present Docs → B4 HONOUR，根本不建立 Acceptance、不計算 Maturity Date，因此沒有 Tenor Basis／Tenor Days／Base Date／Maturity Date Status 這些欄位可顯示；B4 Honour 畫面應顯示的是即期付款本身的欄位（付款金額、付款日、對應的 B3 文件），不在本節討論範圍。下面的欄位清單，只適用於實際會建立 Acceptance 並計算 Maturity Date 的情境：Import A6（六種 `tenorBasis` 皆適用）、Export B4 的 Usance 分支（`AFTER_BL_DATE`／`AFTER_INVOICE_DATE`／`AFTER_SHIPMENT_DATE`／`AFTER_ACCEPTANCE`／`FIXED_MATURITY_DATE`，以及理論上進口融資性質的 `AFTER_SIGHT` 但這只發生在 Import 側）。

**「Base Date Source」不列為主畫面必要欄位**：先前把 `Base Date Source` 跟 `Base Date` 並列成主畫面必要欄位，這跟業務已核定的「Base Date 欄位（系統依 `tenorBasis` 自動判斷，不需要使用者選）vs. 日期來源證據（`AFTER_SIGHT` 用 `sightDateSource`、`FIXED_MATURITY_DATE` 用 `fixedMaturityDateSource`，皆屬稽核紀錄）」兩層區分不一致——六種 `tenorBasis` 只有 `AFTER_SIGHT` 與 `FIXED_MATURITY_DATE` 這兩種真正有獨立的「來源」欄位（`sightDateSource` 五值枚舉、`fixedMaturityDateSource` 恆定值——第十一輪覆核修正，原措辭「只有 `AFTER_SIGHT` 真正有」在第八輪業務核定 `FIXED_MATURITY_DATE` 也需要 Date Source 後已過時），其餘四種欄位（`blDate`／`invoiceDate`／`shipmentDate`／`acceptanceDate`）本身就是單一事實，不需要另一個來源欄位。修正為：`sightDateSource` 只在 `Tenor Basis = AFTER_SIGHT` 時顯示，`Date Source = FIXED_MATURITY_DATE` 只在 `Tenor Basis = FIXED_MATURITY_DATE` 時顯示（業務已核定，見本文件第二節），兩者都放在詳細資料／稽核畫面，不佔用主畫面版位；其餘四種 `tenorBasis`（`blDate`／`invoiceDate`／`shipmentDate`／`acceptanceDate`）本身是單一事實，沒有 Source 欄位。

**「核心欄位是否可修改」新增一列**：

| 欄位 | 是否可修改 |
|---|---|
| Tenor Basis／Tenor Days | A6 畫面唯讀顯示，**不接受 Maker 修改**——目標設計由 A1/B1 建檔、A2/B2 Amendment 固定；現行程式碼 `tenorDays` 尚未有這道保護（見本文件第一節查證的缺口），修正前不應在 A6 畫面提供修改入口 |

**`AFTER_ACCEPTANCE`／Acceptance Date 的畫面規劃（第十六輪覆核，Release Blocker 已解除）**：`acceptanceDate` 操作定義業務已核定（見上方第二節）——由 A6 Maker 輸入或確認實際承兌日，Checker 核對後核准；A6 畫面正常提供 `Acceptance Date` 輸入欄位，跟 `AFTER_BL_DATE`／`AFTER_INVOICE_DATE`／`AFTER_SHIPMENT_DATE` 的既有欄位規劃一致，不需要「尚待業務確認，暫不開放」的停用提示，也不需要 Feature Flag 停用這一種 `tenorBasis`。

### `Maturity-Date-UI-Display-Override-Decision-Request.md`「問題四：覆寫的原因記錄要求」——維持待業務確認，修正一處內部矛盾

「建議預設方向總覽」表格先前有一列寫「Reason Code 必填＋自由文字必填，兩者都要」，跟「問題四」段落已註明的「本問題目前仍是開放選項，尚未業務核定」直接矛盾——業務尚未在 (a)／(b)／(c) 中選定，不應寫成既定答案。已修正為「待業務確認，目前 `reasonCode` 維持 optional；業務選定 (b) 或 (c) 後，才改為必填的 `reasonCode: string`」。

> **後續更新（2026-08-24，晚於第十六輪）**：問題四連同問題二／三／五已由業務正式回覆結案——
> **Operational Payment Date 不允許獨立覆寫**，需要不同日期一律回頭修正 Base Date／`fixedMaturityDate`，
> 由系統與 Standing 重新計算，不建立 `MaturityDateOverride` 機制／reasonCode 欄位。上面這段「待業務確認」
> 是第十六輪當下的真實記錄，保留不改；最新結論見 `Maturity-Date-UI-Display-Override-Decision-Request.md`
> 開頭「✅ 問題二～五 已回覆」區塊。

### `Maturity-Date-UI-Display-Override-Decision-Request.md`「Operational Payment Date」欄位說明補充

> **後續更新（2026-08-24）**：下面這段描述的 `MaturityDateOverride` 覆寫寫回機制**不需要建置**——業務已
> 核定 Operational Payment Date 不允許覆寫，見上方註記與 `Maturity-Date-UI-Display-Override-Decision-Request.md`
> 「✅ 問題二～五 已回覆」區塊。以下維持第十六輪原文，作為決策過程的歷史記錄。

「覆寫核准後如何反映到主線的 `operationalPaymentDate`」：Checker Release 覆寫申請這個動作本身，除了寫入 `MaturityDateOverride` 記錄（`status: 'APPROVED'`）之外，必須同時把核准後的值寫回主流程的 `operationalPaymentDate` 欄位（覆蓋 Standing 原本算出的值）——這樣 A7／報表不需要另外認識覆寫機制或多讀一個欄位，只要繼續讀它們本來就在讀的 `operationalPaymentDate`；`calculatedOperationalPaymentDate`（Standing 原始算出值）維持不被覆蓋，作為「這筆到期日原本算出來是哪一天」的稽核追溯依據。**額外防護**：覆寫申請在 Maker 提出、尚未 Checker 核准前，不得修改目前生效的 `operationalPaymentDate`——`MaturityDateOverride` 記錄處於 `PENDING` 狀態期間，主線的 `operationalPaymentDate` 必須維持核准前的原值不變，只有 Checker 真正核准（`status` 變成 `APPROVED`）那一刻才觸發上述寫回；若覆寫申請被 `REJECTED` 或 `CANCELLED`，主線 `operationalPaymentDate` 從頭到尾都不受影響。

### `Maturity-Date-UI-Display-Override-Decision-Request.md`「不在這次決策範圍內的事」新增一項

`tenorDays` 與母合約的一致性檢查——屬於後端驗證邏輯，不是 UI 顯示問題，但呼應本文件上方新增的「Tenor Basis／Tenor Days 唯讀」欄位規則（見本文件第一節）。

### 本主題項目在主文件第十節「決策狀態總表」的異動摘要（尚未寫回主文件，待併回時同步）

**查證更正（本文件自我檢查發現）**：這裡原本的標題寫「已同步到主文件決策狀態總表」，但直接核對現行 `Maturity-Date-Tenor-Basis-Decision-Review.md`（v33 基準版本）第十節後發現不是事實——主文件已還原回拆分前的 v33 基準版本，第十節這幾列目前仍是 v33 當時的舊狀態，並未真的被改寫。以下表格記錄的是**這幾輪覆核針對這幾個項目得出的最新結論**，是本文件自己的正式狀態記錄；主文件第十節對應列目前仍顯示舊狀態（`sightDate` 的業務定義、Mode A vs Mode B 兩列在 v33 都還是「待業務確認」），須等本文件內容併回主文件那一輪，才會一併回寫更新，避免中途單獨改動又跟主文件其餘部分的版本節奏脫節：

| 項目 | 原狀態 | 新狀態 |
|---|---|---|
| `sightDate` 的業務定義（對應哪個操作動作） | 待業務確認 | **已核定**——見上方 `sightDateSource` 完整候選清單與明文排除值 |
| `sightDate` 未取得時是否允許先 A6 Submit（Mode A vs Mode B，只針對 A6，與 B4 無關） | 待業務確認 | **已核定：Mode B**——見上方第三節 |
| 是否新增 `AFTER_PRESENTATION_DATE`／`AFTER_DOCUMENT_RECEIVED_DATE` 兩個 Tenor Basis（新項目） | — | **已核定：不新增**——業務否決，除非取得實際信用狀條款文字證明是獨立條款類型 |
| `baseDateSource` 是否統一取代個別欄位命名（架構構想） | — | **非本期系統需求（第十五輪覆核，業務直接確認）**——本期採個別欄位命名，不新增通用 `baseDateSource`；未來如需改用，另立需求 |
| 對方（出口銀行）已通知到期日的核對機制（架構構想） | — | **非本期系統需求（第十五輪覆核，業務直接確認）**——本期不新增 Counterparty Advised Maturity Date、比對結果或差異原因欄位；未來如需納入，另立需求 |
| `sightDateSource ∈ {DOCUMENT_PRESENTATION_DATE, DOCUMENT_RECEIVED_DATE}` 須有可稽核依據，不得自動視為合格來源（新項目） | — | **已核定（第十四輪覆核修正做法）**：不新增獨立佐證欄位，由既有 Maker／Checker 單據核對機制把關 |
| `sightDateSource` 是否需要保留 `MANUAL_CONFIRMED_SIGHT_DATE` 這個例外候選值（新項目） | — | **已核定：移除**——第十四輪覆核，業務直接確認「人工輸入」只是輸入方式，不是獨立業務來源，`sightDateSource` 改為五值枚舉 |
| `AFTER_ACCEPTANCE` 的 Acceptance Date 業務定義 | 待業務確認，視範圍（若本期支援 `AFTER_ACCEPTANCE` 則為必要） | **已核定（第十六輪覆核，業務直接確認）**：`acceptanceDate` = 進口銀行實際承兌該筆匯票或單據的業務日期，由 A6 Maker 輸入或確認，Checker 核准；不是 Maker Submit Date，也不是 Checker Approval Date；A6 Submit 時必填，Release Blocker 解除 |
| `FIXED_MATURITY_DATE` 是否應標示為 CANDIDATE／OUT_OF_SCOPE（第六輪 BA 提案覆核質疑，新項目） | — | **已查證：提案前提不成立，維持既有核定地位，不改列 CANDIDATE／OUT_OF_SCOPE**——自第一節起即與其餘五種 `tenorBasis` 同等地位核定，且是 UCP 600 Art. 3 承認的真實 Tenor 型態；查證後接受的唯一落差是缺少對稱工作範例，已用上方「範例四」補齊 |
| `FIXED_MATURITY_DATE` 三張表格「不需要 Base Date／不適用」與「範例四」「BA 說明」互相矛盾（第七輪覆核意見發現，新項目） | — | **已修正**：統一為「A6 Maker 輸入 Fixed Maturity Date，Checker 核對」，見上方第二節三張表格 |
| `FIXED_MATURITY_DATE` 是否需要 Date Source（第八輪覆核，業務直接確認） | 第七輪列為方案 A／B 待確認 | **已核定**：`Date Source` 恆為 `FIXED_MATURITY_DATE`，系統自動設定、不允許手動選擇；資料層須存值（欄位命名 `fixedMaturityDateSource`，不得為 `null`，不沿用「baseDateSource」字面——見第九輪覆核修正），UI 至少在詳細資料／稽核畫面顯示——見上方第二節「業務已核定」段落 |

---

## 五、待確認事項（此主題範圍內，已無未決事項）

`AFTER_ACCEPTANCE` 自己的 `acceptanceDate` 操作定義已由業務核定（第十六輪覆核，見上方第二節）：`acceptanceDate` = 進口銀行實際承兌該筆匯票或單據的業務日期，由 A6 Maker 輸入或確認，Checker 核准；明確不是 Maker Submit Date，也不是 Checker Approval Date；A6 Submit 時必填，不得由系統時間自動代入。這是本文件系列最後一項懸而未決的業務定義，至此收斂——A6 功能範圍內已無其他待確認事項。

`baseDateSource` 統一模型與 `Counterparty Advised Maturity Date` 核對機制已由業務核定為非本期系統需求（第十五輪覆核），`sightDateSourceJustification`、`MANUAL_CONFIRMED_SIGHT_DATE` 已由業務核定移除／不採用（第十四輪覆核），均不再列入待確認事項；若未來需要，另立需求處理。

---

## 附錄：逐輪 BA 提案覆核記錄（第二輪至第十六輪）

**本附錄的定位（第七輪覆核意見：正文精簡，歷史查證移至附錄）**：一～五節已經是這幾輪覆核收斂後的**現行決策**，用敘述體、依主題分節；本附錄是逐輪覆核時「提案項目 vs 查證結果」的完整對照表，屬於**查證過程的稽核追溯記錄**，用來回答「這一條決策是哪一輪提出、怎麼查證出來的」，不是給 BA／工程／QA 日常查閱現行規則用的——現行規則請直接看一～五節，不需要先讀完整輪對照表。

每一輪查證都遵循同一個原則（業務指示）：**先讀代碼，如果已處理，就回覆已是原先邏輯處理，如果有效再改**——已處理的回覆已是既有決定或既有程式碼行為，不重複新增內容；查到真實缺口的才列為新增或修正。

### 第二輪 BA 提案（P0×6／P1×5）

逐項對照現行程式碼與文件既有決定：十一項裡有十項確認已是文件既有決定或現行程式碼既有行為（Mode B 維持、Contractual/Operational 分欄持久化、每筆 Acceptance 獨立保存日期、Standing fail-closed、A7 僅用 APPROVED 日期、sightDate/sightDateSource 分離、AFTER_ACCEPTANCE 待確認維持不變、A6 畫面顯示已在 UI 文件涵蓋、Base Date 修正機制）；唯一一項不採用——`effectiveOperationalPaymentDate` 不併入主線流程，因為這個欄位已經是 UI 文件「Operational Payment Date 覆寫機制」專屬定義，主線用 `maturityDateStatus` 三段生命週期已足以判斷可用性。

| 提案項目 | 查證結果 | 依據 |
|---|---|---|
| P0：A6 依 `tenorBasis` 顯示對應 Base Date 欄位，不應統一用系統日期 | **已是文件既有設計**，提案指出「A3 沒有 B/L Date／Invoice Date／Shipment Date 輸入欄位，不能假設能從 A3 自動帶入」這點跟查證結果一致，已據此把「日期來源」欄位的措辭修正得更精確 | `types.ts`／`db/schema.ts` 只有 `documentPresentationDate`，無 `blDate`／`invoiceDate`／`shipmentDate`；本文件第二節主線 |
| P0：`AFTER_SIGHT` 維持已核定 Mode B | **已核定，不重新討論**——提案本身也明講「只重申，不新增驗證規則」 | 上方第三節 |
| P0：`contractualMaturityDate`／`operationalPaymentDate` 分開持久化 | **已是文件既有 Release Blocker** | `Maturity-Date-Tenor-Basis-Decision-Review.md` 第五節 |
| P0：另外保存 `effectiveOperationalPaymentDate`（下游實際引用值） | **不採用這個提案在主線新增此欄位**——`effectiveOperationalPaymentDate`／`calculatedOperationalPaymentDate` 這組三段式欄位，已經是 `Maturity-Date-UI-Display-Override-Decision-Request.md`「建議資料模型」專屬於 **Operational Payment Date 覆寫機制** 的欄位，主線的 `maturityDateStatus` 已經足以讓下游判斷「這個 `operationalPaymentDate` 能不能被引用」，不需要在主線再疊加一個語意重複的欄位——若日後真的啟用覆寫功能，才會用到 UI 文件那組欄位，兩者不應該在主線流程重複定義 | `Maturity-Date-UI-Display-Override-Decision-Request.md`「建議資料模型」 |
| P0：A6 畫面顯示計算日期與核准狀態 | **已是 UI 文件既有內容**（比提案更完整：含 Override Indicator、Calendar Snapshot、依 `maturityDateStatus` 三態的 UI 標籤對照） | `Maturity-Date-UI-Display-Override-Decision-Request.md`「建議 UI 顯示欄位」 |
| P0：Standing 計算失敗不得產生正式付款日期 | **已是現行程式碼既有行為**（連線層級 fail-closed，不靜默 fallback）＋已是文件既有缺口修正（503 等暫時性狀態碼重試） | `clients/standingClient.ts` 現行 fail-closed 設計；`Maturity-Date-Tenor-Basis-Decision-Review.md` 第六節 |
| P0：A7 只能使用已核准（`APPROVED`）的 A6 日期 | **已是文件既有設計**——`assertAcceptanceSettlementAllowed()` 已要求 `maturityDateStatus === 'APPROVED'` 且 `confirmedBalance > 0` | `Maturity-Date-Tenor-Basis-Decision-Review.md` §4.1 節；第八節「A7 已驗證缺口」 |
| P1：`sightDate`／`sightDateSource` 分開保存 | **已核定**，當輪為六值枚舉（**第十四輪補註：現行已移除 `MANUAL_CONFIRMED_SIGHT_DATE`，改為五值枚舉**） | 上方 `sightDateSource` 完整候選清單 |
| P1：`AFTER_ACCEPTANCE` 的 `acceptanceDate` 定義待業務確認 | **已是既有開放項目**，維持不變 | 第九節（見主文件） |
| P1：每筆 Acceptance 獨立保存日期，不得只存 LC Master | **已是文件既有明確決定**——存在每一筆 Acceptance 自己的 `BalanceContract`，不存父層 LC 合約 | `Maturity-Date-Tenor-Basis-Decision-Review.md` 第五節 |
| P1：Base Date 修正後重新計算，不可直接覆寫 Contractual Maturity Date | **已核定**（Base Date 修正機制） | `Maturity-Date-Tenor-Basis-Decision-Review.md` §4.4 節 |

**結論：十一項裡有十項已是文件既有決定或既有程式碼行為，不需要新增內容；只有一項（`effectiveOperationalPaymentDate` 是否併入主線）明確不採用，理由如上表**，避免跟 UI 文件的覆寫專屬欄位定義重複、不同步。

同步修正「A6 使用的 Base Date 欄位／日期來源」對照表的措辭：`blDate`／`invoiceDate`／`shipmentDate` 這三列的「日期來源」歷經兩輪修正——最早寫「A3 單據記錄中的提單／發票／裝運日期」（容易讀成 A3 現在就有）、後改成「目標設計：由 A3 新增對應欄位提供；A3 尚未支援前暫由 A6 輸入」（仍暗示 A6 只是過渡方案），統一為「本期核定設計：A6 Maker 依單據輸入，Checker 核對」，不再帶任何「目標設計」或「A3 尚未支援前」的過渡措辭——這是本期真正核定的設計本身，不是等待 A3/B3 的權宜安排。

### 第三輪 BA 提案（P0×1、P1×4、P2×2）：五項採納、兩項不採納

| 提案項目 | 查證結果 | 依據 |
|---|---|---|
| P0：明確本期只修改 A6，不修改 A3／B3 | **已採納，且查證過程中發現並修正一處比提案本身描述更嚴重的問題**——「日期來源」表格與驗收標準對「`blDate`／`invoiceDate`／`shipmentDate` 這一期到底從哪裡輸入」曾給出兩個互相矛盾的答案（一處說 A6 直接輸入，一處說要等 A3/B3 修改），不只是範圍講不清楚，是文件自我矛盾。已統一為「本期僅 A6，A6 直接提供輸入介面，不依賴 A3/B3」 | 上方「本期範圍明確聲明」；`Maturity-Date-Tenor-Basis-Decision-Review.md` 第八節 3.1 節完整方案第 (4) 項 |
| P1：`Base Date Source` 不應列為 A6 主要畫面必要欄位 | **已採納**——跟已核定的「Base Date 欄位（系統自動判斷）vs. 日期來源證據（僅 `AFTER_SIGHT` 需要）」既有區分完全一致，UI 文件先前把它列為六種 `tenorBasis` 一律顯示的主畫面欄位，確實不精確，已同步修正 | `Maturity-Date-UI-Display-Override-Decision-Request.md`「建議 UI 顯示欄位」 |
| P1：A6 不得修改 Tenor Basis／Tenor Days，應透過 A2 Amendment | **不是既有邏輯，是查證後確認的真實缺口，已採納**——已新增第一節記錄查證細節與建議修正 | 本文件第一節；`routes/balanceMovements.ts` 第 42–61 行；`service/balanceService.ts` 第 1739–1752 行 |
| P1：清楚定義主流程與 Override 模組的付款日期對應 | **先前確實沒有回答，已補上**——Checker Release 覆寫申請時，同步寫回主線 `operationalPaymentDate`，`calculatedOperationalPaymentDate` 維持不被覆蓋作稽核追溯 | 上方「Operational Payment Date 欄位說明補充」 |
| P1：補充 `AFTER_SIGHT` 的 Mode B 例外，不得誤寫為先建立 `PENDING_BASE_DATE` 的 A6 Acceptance | **提案抓到的問題真實存在，已修正**——遺留一段 Mode A 核定前寫的流程圖，Mode B 核定後未同步更新，字面上仍描述「Sight Date 未確認 → 標記 `PENDING_BASE_DATE`」，已統一改寫 | 上方第三節流程圖 |
| P2：`reasonCode` 型別若已核定必填應改為非 optional | **不採納這項變更——提案的前提「已核定必填」目前不成立**：UI 文件「問題四」目前仍是 (a)／(b)／(c) 三選項的開放問題，`reasonCode?: string` 維持 optional 是正確的型別設計 | `Maturity-Date-UI-Display-Override-Decision-Request.md`「問題四」 |
| P2：精簡版本歷史，已否決方案移至 Change Log | **不採納變更文件結構——這個考量已有正式記錄的相反決定**：附錄 B 已明確記載版本記錄慣例（舊版全文不重複保留，只收斂當前應交付內容），精簡版是另一份衍生文件的結構，不是要改寫本文件本身 | `Maturity-Date-Tenor-Basis-Decision-Review.md` 附錄 B |

**結論：本輪七項提案裡，五項已採納（其中兩項——tenorDays 一致性缺口、A3/B3 範圍矛盾——查證後發現比提案原本描述的問題更根本，已一併處理），兩項不採納（reasonCode 型別因業務決策本身尚未定案而暫不變更；版本歷史精簡因與附錄 B 既有決定衝突而不變更文件結構）。**

### 第四輪 BA 提案（P0×1、P1×2、P2×2）：全部採納

| 提案項目 | 查證結果 | 依據 |
|---|---|---|
| P0：完全移除 A3／B3 作為「未來目標設計」的描述 | **提案指出的問題真實存在，已採納**——雖然已明確聲明本期只改 A6，但表格與說明段落仍保留「目標設計：由 A3 新增對應欄位提供；A3 尚未支援前暫由 A6 輸入」這種過渡措辭，確實容易讓工程師誤讀成 A6 輸入只是權宜方案。已全面移除這種措辭，改為「本期核定設計：A6 Maker 依單據輸入，Checker 核對」 | 上方「六種 `tenorBasis` 各自的 Base Date 與取得方式」表格；「本期範圍明確聲明」 |
| P1：UI 三層狀態表補上 `AFTER_SIGHT` Mode B 例外 | **已採納**——先前沒有同步補進「三層顯示與驗算控制標準」表格的 Layer 1 說明，已補上 | 上方「Layer 1，`AFTER_SIGHT` 例外」 |
| P1：統一 Override Reason Code 的決策狀態 | **提案指出的矛盾真實存在，已修正**——「問題四」段落已註明尚未業務核定，但「建議預設方向總覽」表格同一份文件裡卻寫成既定答案，兩處字面矛盾。已統一為「待業務確認，目前 `reasonCode` 維持 optional」 | 上方「問題四」段落 |
| P2：主流程與 Override 欄位的寫回規則再加一項防護 | **已採納**——先前只講了核准後怎麼寫回，沒講清楚核准前的保護；已補上「`PENDING` 期間不得修改主線 `operationalPaymentDate`」 | 上方「Operational Payment Date 欄位說明補充」 |
| P2：`AFTER_ACCEPTANCE` 應繼續明確標示為未完成項目 | **已採納，且升級為明確的 Release Blocker**——先前語氣偏向可以延後；查證確認若操作定義未定就上線，會產生錯誤的到期日，因此明確定調為 Release Blocker | 上方「`AFTER_ACCEPTANCE` 明確列為本期 Release Blocker」 |

**結論：本輪五項提案全部採納，其中兩項（A3/B3 過渡措辭、Reason Code 決策狀態矛盾）是前幾版遺留的措辭／內部矛盾問題，一項（AFTER_ACCEPTANCE）從「待確認」明確升級為「Release Blocker」，不再是可以無限期擱置的開放項目。**

### 第五輪 BA 提案（P0×1、P1×2、P2×1）：這一輪查證發現的兩個問題都不是新缺口，是前幾輪修正得不夠徹底留下的內部矛盾

| 提案項目 | 查證結果 | 依據 |
|---|---|---|
| P0：主文件仍有一組表格誤寫為「從 A3 帶入」 | **提案指出的問題真實存在，而且是最早引入的疏漏，前幾輪修正都漏掉它**——最早引入的「六種 `tenorBasis` 各自的 Base Date 與取得方式」表格，`AFTER_BL_DATE`／`AFTER_INVOICE_DATE`／`AFTER_SHIPMENT_DATE` 三列一直寫「從 A3 單據／發票／運輸單據資料帶入」，前兩輪只修正了下方另一張「A6 使用的 Base Date 欄位／日期來源」表格，這張最早的表格從未同步，導致同一份文件兩張表格互相矛盾。已統一修正 | 上方「六種 `tenorBasis` 各自的 Base Date 與取得方式」表格 |
| P1：Mode B 應區分「畫面草稿」與「正式建立 Acceptance」 | **已採納**——先前的寫法確實不夠精確，容易誤讀成 `AFTER_SIGHT` 完全不出現在 Layer 1；已重寫為三種情況 | 上方「Layer 1，`AFTER_SIGHT` 例外」 |
| P1：禁止透過 A6 隱性回填或變更母合約的 `tenorDays` | **提案指出的問題真實存在，是上一輪自己修正時留下的疏漏**——上一輪新增查證 `tenorDays` 一致性缺口時，建議修正寫成「母合約尚未存過 `tenorDays` 時才允許這次請求的值回填」，這跟「A6 不得修改信用狀條款」的原則自相矛盾，等於是換個名目讓 A6 悄悄改了 Tenor 條件。已修正為比照 `tenorBasis` 既有的 Legacy Backfill 核准流程 | 本文件第一節 |
| P2：`AFTER_ACCEPTANCE` 的 Release Blocker 應與上線範圍對應 | **已採納**——上一輪的定調雖然實質上已經只影響 `AFTER_ACCEPTANCE` 自己，但表述方式確實容易讓讀者誤解成「只要 Acceptance Date 未定義，整個 A6 都不能上線」。已改寫成「本期包含／本期不包含 `AFTER_ACCEPTANCE`」兩種互斥情況的明確結構 | 上方「`AFTER_ACCEPTANCE` 明確列為本期 Release Blocker」 |

**結論：本輪四項提案全部採納。其中兩項（A3 帶入表格、tenorDays 隱性回填）不是新發現的程式碼缺口，是前幾輪修正時不夠徹底留下的內部矛盾——第一項是最早的表格從未跟上後續版本的修正，第二項是剛補上 tenorDays 缺口時，修正方案本身又製造了一個新的原則矛盾。這兩項提醒本文件系列在做「新增查證發現」的同一版裡，也要回頭確認相關的既有段落是否同步更新，不能只改動當下新增查證的位置。**

### 第六輪 BA 提案（P0×1、P1×2、P2×1）：第一次不是全部針對本文件系列自己的疏漏，其中一項查證後確認提案前提本身不成立

| 提案項目 | 查證結果 | 依據 |
|---|---|---|
| P0：統一 `AFTER_SIGHT` 與 `sightDateSource` 的語意，`DOCUMENT_PRESENTATION_DATE`／`DOCUMENT_RECEIVED_DATE` 不應自動視為合格來源 | **提案指出的問題真實存在，已採納**——這兩個候選值先前只有描述性註解，沒有落實成可執行、可稽核的業務規則。已新增：Maker 選擇這兩個候選值時須同時填寫依據，Checker 須核對依據是否支持「此銀行操作事件日期＝正式 Sight Date」，其餘四個候選值不需要 | 上方 `sightDateSource` 清單「新增驗證要求」 |
| P1：釐清 `AFTER_ACCEPTANCE` 的 Estimated 顯示條件，操作定義未核定前不應顯示任何日期 | **提案指出的落差真實存在，已採納**——既有的 Estimated 顯示機制，前提是「Acceptance Date 的操作定義本身已經確定，只是這一筆交易的實際值還沒確認」；但 Release Blocker 描述的情境是操作定義本身都還沒業務核定，這種情況下系統連「該用哪個事件估算」都無所依據，繼續顯示 Estimated 值沒有計算原則可循。已在 Release Blocker 段落補上這個前提條件 | 上方「`AFTER_ACCEPTANCE` 明確列為本期 Release Blocker」 |
| P1：`FIXED_MATURITY_DATE` 缺乏實際業務案例，應標示為 CANDIDATE／OUT_OF_SCOPE | **提案前提查證後不成立，不採納「標示為候選／排除範圍」這個結論，但接受提案間接指出的文件缺口**——`FIXED_MATURITY_DATE` 不是臨時提出的候選項目：決策摘要、分流矩陣、建檔驗證、Base Date 修正機制的業務概念澄清都已經把它當成跟其餘五種 `tenorBasis` 同等地位的核定值處理，且「信用狀條款直接指定固定到期日」本身是 UCP 600 Art. 3 承認的真實 Tenor 型態，不是本產品自創或缺乏依據的組合。真正站得住腳的落差是：原本的三則工作範例涵蓋了 `AFTER_BL_DATE`／`AFTER_SIGHT`／`AFTER_ACCEPTANCE`，唯獨沒有 `FIXED_MATURITY_DATE` 自己的工作範例，容易讓讀者誤以為它的地位比較邊緣——已新增範例四補齊，不調整它在分流矩陣、驗收標準中既有的核定地位 | 上方「範例四」 |
| P2：縮小「A6／B4 Acceptance 畫面」UI 規則的適用範圍，排除 `AFTER_SIGHT` 的 Honour／即期付款情境 | **提案指出的問題真實存在，已採納**——UI 文件「建議 UI 顯示欄位」目前的標題與說明句沒有排除 B4 在 `AFTER_SIGHT` 情境下走 Honour（即期付款、不建立 Acceptance）的狀況，讀起來像是所有 B4 交易都要顯示 Tenor Basis／Tenor Days／Base Date 等 Acceptance 專屬欄位。已同步補上排除說明 | 上方「適用範圍澄清」 |

**結論：本輪四項提案，三項採納（`sightDateSource` 驗證要求、`AFTER_ACCEPTANCE` Estimated 顯示前提、B4 畫面適用範圍），一項不採納提案原本的結論但接受其間接指出的落差——`FIXED_MATURITY_DATE` 不應標示為 CANDIDATE／OUT_OF_SCOPE，因為它從決策摘要起就是核定的六值集合之一，且是 UCP 600 承認的真實 Tenor 型態，不是缺乏依據的臨時項目；提案間接點出的真正落差（缺少對稱的工作範例）已用新增範例四補齊。**

### 第七輪 BA 提案覆核（P0×2、P1×2、P2×1）：五項全部採納，一項不片面裁決僅列為待確認事項

| 提案項目 | 查證結果 | 依據 |
|---|---|---|
| P0：統一 `FIXED_MATURITY_DATE` 的 A6 輸入方式，修正三張表格與「範例四」「BA 說明」互相矛盾 | **提案指出的矛盾真實存在，已採納**——「六種 `tenorBasis` 各自的 Base Date 與取得方式」「本期 A6 輸入欄位對照」「A6 使用的 Base Date 欄位／日期來源」三張表格先前都寫「不需要 Base Date」／「不適用」，但「範例四」與「BA 說明」明確描述 A6 Maker 輸入——已統一為「A6 Maker 輸入 Fixed Maturity Date，Checker 核對，Tenor Days 為 null」 | 上方第二節三張表格 |
| P0：明確定義拆分後的文件優先順序，避免 BA／工程／測試依據不同文件實作不同規則 | **提案指出的落差真實存在，已採納**——已於文件開頭新增「文件優先順序聲明」，明文本文件對 A6 相關規則的描述優先於兩份主文件（v33／v17）裡尚未回寫的舊敘述 | 本文件開頭「文件優先順序聲明」 |
| P1：明確處理 `FIXED_MATURITY_DATE` 的 Date Source，確認方案 A／B 擇一 | **提案指出的矛盾真實存在，但方案擇一屬於業務決定，本文件不片面裁決**——已在原查證段落後補上業務後續說法與方案 A／B 對照，並列入第五節待確認事項，等業務當面確認 | 上方第二節「後續業務再次提出的說法」；第五節待確認事項 |
| P1：補充 `FIXED_MATURITY_DATE` 的初次輸入與後續修改控制，避免誤解每次 A6 輸入都要先走 Amendment | **已採納**——已新增「A6 初次輸入與核准後修正的時點區分」段落，比照主文件 §4.4 既有機制寫清楚兩個階段的差異 | 上方第二節「A6 初次輸入與核准後修正的時點區分」 |
| P2：刪除與 A6 無關或重複的歷史覆核內容，正文只保留已核定規則、待確認事項及驗收條件 | **已採納，但用「移至附錄」取代「刪除」**——逐輪覆核記錄本身是查證稽核追溯，不是無關內容，保留但不佔正文版面；已整段移至文末「附錄：逐輪 BA 提案覆核記錄」，正文一～五節維持精簡的現行決策敘述 | 本附錄；原第五節（今移至附錄） |

**結論：本輪五項提案，四項全部採納（三處內部矛盾修正、新增文件優先順序聲明、正文精簡移至附錄），一項（Date Source 方案擇一）性質上是業務決定，本文件如實記錄兩個方案、列入待確認事項，不片面選擇，避免「自作主張」重演。**

### 第八輪 BA 提案覆核（P0×2、P1×1、P2×1）：四項全部採納，含業務直接確認一項先前列為待確認的事項

| 提案項目 | 查證結果 | 依據 |
|---|---|---|
| P0：正式決定 `FIXED_MATURITY_DATE` 的 Date Source，不再列為待確認 | **業務以 BA 角色直接確認，已採納**——`Date Source` 恆為 `FIXED_MATURITY_DATE`，系統自動設定不允許手動選擇；資料層須存值（`baseDateSource` 不得為 `null`；**註（第十輪覆核補註）：現行核定欄位名稱為 `fixedMaturityDateSource`，見第九輪覆核修正，此處保留第八輪原始措辭作為歷史記錄，不代表現行實作欄位名**），UI 至少在詳細資料／稽核畫面顯示；第七輪列為方案 A／B 待確認的開放項目，本輪由業務直接拍板，不再開放 | 上方第二節「業務已核定」段落；第四節決策狀態總表新增列 |
| P0：修正 Fixed Maturity Date 修改時點的三階段矛盾 | **提案指出的矛盾真實存在，已採納**——原本流程圖把界線畫在「已 `APPROVED`」，理由段落卻寫「含 Maker Submit 後」，對「已 Submit、尚未核准」這個中間階段沒講清楚。已改寫成三階段表格，比照主文件 §4.4 節既有的「Base Date 在不同階段的修改控制」做法 | 上方第二節「A6 初次輸入與核准後修正的時點區分」 |
| P1：修正「已同步主文件」的不實敘述 | **提案指出的問題真實存在，已採納**——第二節 `AFTER_ACCEPTANCE` Release Blocker 段落結尾仍寫「已同步更新這個結論」，跟第四節自己已記載「主文件尚未回寫」的事實矛盾。已改為如實敘述：最新結論記錄於本文件，主文件對應章節待併回時更新 | 上方第二節查證更正段落 |
| P2：更新文件範圍與覆核輪次說明 | **已採納**——文件開頭「第一輪至第六輪」已不反映正文含第七、八輪的事實，已更新為「第一輪至第八輪」；附錄標題「第二輪至第六輪」同步更新為「第二輪至第八輪」 | 文件開頭；附錄標題 |

**結論：本輪四項提案全部採納。其中一項（Date Source）是業務本人以 BA 角色直接拍板，把第七輪誠實記錄為「不片面決定」的開放項目正式收斂為決策，不是本文件自行判斷；另外三項都是文件內部一致性問題（三階段界線矛盾、已同步的不實敘述、版本範圍未跟上正文），修正方式與前幾輪相同——查證屬實才改，不因為是覆核意見就照單全收。**

### 第九輪 BA 提案覆核（P0×2、P1×2）：四項全部採納

| 提案項目 | 查證結果 | 依據 |
|---|---|---|
| P0：修正「出口行／進口行決定」的業務意義 | **提案指出的問題真實存在，已採納**——上一輪把表格欄位改成「出口行可先行推算／須進口行A6確定」，用意是避免誤讀成出口行有正式決定權，但確實弱化了原本要表達的業務分工。已改回「出口行決定／進口行決定」，並補上一句釐清：出口行決定的日期依據仍須進口行於 A6 核對確認，不是略過 A6 直接生效 | 上方「Maturity Date 與 Tenor Basis：出口行／進口行決策表」 |
| P0：補齊 `BaseDateSource` 的合法值 | **核對後確認缺漏真實存在，已採納**——「架構延伸」段落的 `BaseDateSource` 型別，`AFTER_SIGHT` 分支只列了六值枚舉裡的四個，漏了 `DOCUMENT_PRESENTATION_DATE`／`DOCUMENT_RECEIVED_DATE`；`FIXED_MATURITY_DATE` 則完全沒有進到型別的聯集裡，只寫在下方註解，型別上不合法。已補齊六值與 `FIXED_MATURITY_DATE` 值（**第十四輪覆核補註**：`MANUAL_CONFIRMED_SIGHT_DATE` 其後於第十四輪移除，此處「六值」為當輪歷史記錄，現行為五值） | 上方「架構延伸」`BaseDateSource` 型別 |
| P1：修正「只有 `AFTER_SIGHT` 需要日期來源」的舊敘述 | **提案指出的問題真實存在，已採納**——業務覆核表格內文仍寫「日期來源這一層只有 `AFTER_SIGHT` 需要」，但業務已核定 `FIXED_MATURITY_DATE` 也需要記錄 Date Source（第八輪），兩處字面矛盾。已改為列出兩種需要日期來源的 `tenorBasis` | 上方「業務覆核」表格說明文字 |
| P1：統一 Date Source 的欄位名稱 | **提案的核心觀察站得住腳，已採納，但命名採 `fixedMaturityDateSource` 而非提案建議的通用 `dateSource`**——`FIXED_MATURITY_DATE` 明確不適用 Base Date 概念，繼續用 `baseDateSource` 承接這個值確實名不符實；比照 `sightDate → sightDateSource` 的既有命名慣例（本文件「架構延伸」段落已核定的預設方案 (a)：個別欄位各自獨立命名），新欄位命名為 `fixedMaturityDateSource` 更貼合現有慣例，兩者實質上解決同一個問題，只是選了跟既有欄位命名模式一致的名稱。「架構延伸」段落裡的 `baseDateSource` 保留，但已註明那是方案 (b)（統一欄位，尚未核定）才會用到的假設性名稱，不是本期實際採用的欄位名 | 上方第二節「業務已核定」段落；「架構延伸」段落 |

**結論：本輪四項提案全部採納。前兩項（決策表用詞、`BaseDateSource` 型別缺漏）是查證後確認的真實缺口；後兩項（『只有 `AFTER_SIGHT`』舊敘述、`baseDateSource` 命名）是前幾輪新增 `FIXED_MATURITY_DATE` 的 Date Source 決議時，沒有回頭檢查所有相關措辭是否同步更新，屬於同一種「新增查證發現時漏改既有段落」的老問題，已一併修正。**

### 第十輪 BA 提案覆核（P1×2、P2×2）：四項全部採納

| 提案項目 | 查證結果 | 依據 |
|---|---|---|
| P1：補齊 `fixedMaturityDate`／`fixedMaturityDateSource` 的建議型別 | **核對後確認缺漏真實存在，已採納**——文件已於第八、九輪核定欄位命名（`fixedMaturityDateSource`），但先前只有文字敘述，未列出明確型別。已補上 `fixedMaturityDate?: string \| null; fixedMaturityDateSource?: 'FIXED_MATURITY_DATE' \| null;` 及對應行為說明 | 上方第二節「業務已核定」段落 |
| P1：範例四補上 Fixed Maturity Date Source 行 | **提案指出的缺口真實存在，已採納**——範例四原本只示範 Tenor Basis／Fixed Maturity Date／Tenor Days／Contractual Maturity Date，未示範已核定的 Date Source 欄位，與範例一～三示範完整欄位的慣例不一致。已補上一行 | 上方「範例四」 |
| P2：修正「每種／六種 `tenorBasis` 都有 Date Source」的不精確措辭 | **查證後確認措辭確實容易誤讀，已採納**——原文字面暗示六種 `tenorBasis` 都有各自獨立的 Source 欄位，但緊接著的說明其實只有 `AFTER_SIGHT` 與 `FIXED_MATURITY_DATE` 有；已改寫為明確只有這兩種需要獨立 Source 欄位，其餘四種經由自身日期欄位及單據資料追溯 | 上方「業務已核定」段落 UI 層面與 UI 文件同步兩點 |
| P2：為第八輪附錄記錄的 `baseDateSource` 舊措辭補註現行欄位名 | **已採納，僅補註不改寫歷史記錄**——第八輪覆核表格本身如實記載當時措辭（`baseDateSource`），依既有慣例不重寫歷史記錄；但為避免工程師誤讀為現行規格，已在該格內補上一句註記現行核定欄位名為 `fixedMaturityDateSource`（見第九輪覆核修正） | 上方「第八輪 BA 提案覆核」表格 P0 列 |

**結論：本輪四項提案全部採納，均屬「已核定內容補齊呈現方式」性質（型別、範例、措辭精確度、歷史記錄補註），未變更任何已核定的業務規則本身。**

### 第十一輪 BA 提案覆核（P1×1、P2×2）：三項全部採納

| 提案項目 | 查證結果 | 依據 |
|---|---|---|
| P1：補充 `FIXED_MATURITY_DATE` 條件式驗證規則 | **核對後確認缺漏真實存在，已採納**——文件先前只描述 `tenorBasis = FIXED_MATURITY_DATE` 時各欄位該怎麼填，沒有明確規定其餘五種 `tenorBasis` 下 `fixedMaturityDate`／`fixedMaturityDateSource` 必須為 `null`，若不強制會有舊資料殘留、或同時存在「直接輸入」與「Base Date + Tenor Days」兩套到期日計算依據的風險。已補上雙向條件式驗證規則，並補上三組驗收案例（正確填寫允許、缺漏或殘留 `tenorDays` 拒絕、非 FIXED 卻帶 `fixedMaturityDate` 拒絕） | 上方第二節「業務已核定」段落 |
| P2：修正「日期來源證據……僅 `AFTER_SIGHT` 才有」的舊敘述（業務覆核表格標題句） | **提案指出的問題真實存在，已採納**——這是第九、十輪已修正過的「只有 `AFTER_SIGHT` 需要 Date Source」同一種老問題的另一個殘留分身，本輪查證時逐一比對全文所有「僅／只有 `AFTER_SIGHT`」字樣才找到。已改為同時提及 `AFTER_SIGHT` 與 `FIXED_MATURITY_DATE` | 上方第二節「業務覆核」小節標題句 2 |
| P2：修正「六種 `tenorBasis` 只有 `AFTER_SIGHT` 真正有『來源』這個概念」的舊敘述（第四節 UI 欄位調整段落） | **提案指出的問題真實存在，已採納**——同一種老問題的第三個殘留分身，位於第四節「Base Date Source 不列為主畫面必要欄位」段落，先前查證只改了同一段落後半句的「六種都有各自的 Date Source 記錄」，沒有回頭檢查前半句的「只有 `AFTER_SIGHT` 真正有」是否也同步。已改為明確列出 `AFTER_SIGHT` 與 `FIXED_MATURITY_DATE` 兩種 | 上方第四節「Base Date Source 不列為主畫面必要欄位」 |

**結論：本輪三項提案全部採納。第一項（條件式驗證規則）是真實的規格缺口；後兩項是同一個「只有 `AFTER_SIGHT` 需要 Date Source」舊敘述的殘留分身——這個措辭前後在第九、十、十一輪三輪裡陸續於不同段落現身，印證了「新增查證發現時，要逐一搜尋全文的所有措辭分身，不能只改使用者這次指出的那一處」這個一再出現的教訓。**

### 第十二輪 BA 提案覆核（P0×1、P1×2、P2×1）：四項全部採納

| 提案項目 | 查證結果 | 依據 |
|---|---|---|
| P0：補齊 `AFTER_SIGHT` 的 `sightDateSource` 驗證 | **核對後確認缺漏真實存在，已採納**——「與 Mode B 決策的一致性說明」段落只列了 `sightDate`／`sightDateConfirmedBy`／`sightDateConfirmedAt` 三個必填欄位，未把 `sightDateSource` 本身納入必填檢查，跟「Sight Date 來源必須逐筆記錄」這條業務規則字面矛盾。已補上正式驗證規則，含 `DOCUMENT_PRESENTATION_DATE`／`DOCUMENT_RECEIVED_DATE` 需額外驗證 `sightDateSourceJustification` 這一條（**第十四輪覆核補註**：`sightDateSourceJustification` 欄位其後於第十四輪撤回，這一條驗證規則已隨之移除，此處為當輪歷史記錄） | 上方「`sightDateSource` 完整候選清單」段落 |
| P1：修正範例一未核定的 Source 欄位與錯誤枚舉值 | **提案指出的兩個問題都真實存在，已採納**——範例一寫「`Base Date Source = BILL_OF_LADING`」：(1) 現行核定設計裡 `AFTER_BL_DATE` 不需要獨立 Source 欄位，只有 `AFTER_SIGHT`／`FIXED_MATURITY_DATE` 才有；(2) 即使沿用「架構延伸」假設性統一命名，正確枚舉值也是 `BILL_OF_LADING_DATE`，不是 `BILL_OF_LADING`。已刪除該欄位並補上查證說明 | 上方「範例一」 |
| P1：修正架構延伸方案 (a) 的舊敘述 | **提案指出的問題真實存在，已採納**——方案 (a) 描述仍寫「只有 `sightDate` 因為來源本身有多種可能才需要配一個 `sightDateSource`」，跟第八輪已核定 `fixedMaturityDate` 也需要配 `fixedMaturityDateSource` 的事實不一致，屬於同一種「只有 `AFTER_SIGHT`」舊敘述的第四個殘留分身。已補上 `fixedMaturityDate`／`fixedMaturityDateSource`，並說明兩者配 Source 的理由不同（多值來源 vs. 稽核記錄計算邏輯） | 上方「架構延伸」段落 (a) 選項 |
| P2：補充缺漏的驗收案例 | **已採納**——四組提案的案例都對應到上方已核定或本輪新補的驗證規則，尚未列在既有驗收案例清單中，屬於真實缺口。已補為案例 4～7，銜接第十一輪已有的案例 1～3 | 上方「驗收案例」清單 |

**結論：本輪四項提案全部採納。P0（`sightDateSource` 未列入必填）是本文件系列裡第一次針對 `AFTER_SIGHT` 驗證規則本身找到的真實缺口，不是措辭問題；兩項 P1 則再度印證「只有 `AFTER_SIGHT`」這句舊敘述的殘留分身還沒抓完——已知的分身至此累積到第四個（範例一是新的一種——不是措辭過時，是範例本身內容錯誤，性質略有不同）；P2 補齊對應驗收案例，不涉及新業務規則。**

### 第十三輪 BA 提案覆核（結案覆核：可提交，附三項工程／BA 後續追蹤項目）：兩項採納並修正，一項查證後不追加

第十三輪不是新一批 P0/P1/P2 提案，而是結案確認——「主要業務規則、A6 操作方式、進出口銀行責任、到期日計算、`FIXED_MATURITY_DATE` 處理及 Maker／Checker 控制已經完整，沒有影響提交的重大問題」，附帶三項可在工程實作或 BA 確認時補齊的項目：

| 項目 | 查證結果 | 依據 |
|---|---|---|
| 1. 統一 `AFTER_SIGHT` 四個必填欄位的文件描述 | **查證後確認是真實缺口，已採納**——「與 Mode B 決策的一致性說明」段落原本仍寫「驗證 `sightDate`／`sightDateConfirmedBy`／`sightDateConfirmedAt` 三者皆非 null」，是第十二輪加入 `sightDateSource` 正式驗證規則後遺留的舊敘述，兩段文字對同一條 Mode B 規則講出不同的必填欄位數。已統一為四欄位（含 `sightDateSource`） | 上方「與 Mode B 決策的一致性說明」段落 |
| 2. 將 `sightDateSourceJustification` 明確納入資料模型 | **查證後確認是真實缺口，已採納**——這個欄位先前只在「新增驗證要求」段落用文字描述、在第十二輪驗收案例與決策狀態總表中被引用，但沒有列進 `sightDateSource` 完整候選清單旁的正式 TypeScript 型別區塊。已補上（**第十四輪覆核補註**：業務其後直接確認這個欄位不需要設計進系統，第十四輪已撤回，此處為當輪歷史記錄） | 上方「`sightDateSource` 完整候選清單」型別區塊 |
| 3. 確認 `MANUAL_CONFIRMED_SIGHT_DATE` 是否必須提供理由或證據 | **查證後不追加為待確認事項**——這個候選值旁的註解寫「並附證據或原因」，跟正式驗證規則只要求 `DOCUMENT_PRESENTATION_DATE`／`DOCUMENT_RECEIVED_DATE` 附證據確實字面不完全對稱；但使用者確認業務並未實際提出這項要求，本文件不應該自己把這個字面差異包裝成一個新的業務待確認事項——避免無實際需求卻製造額外的開放議題（**第十四輪覆核補註**：這個候選值其後於第十四輪整個移除，此處「維持不變」為當輪歷史記錄，現行 `sightDateSource` 已不含 `MANUAL_CONFIRMED_SIGHT_DATE`） | 上方六值枚舉 `MANUAL_CONFIRMED_SIGHT_DATE` 候選值註解 |

**結論：本輪三項追蹤項目，兩項（Mode B 必填欄位數不一致、`sightDateSourceJustification` 缺型別）查證後確認是真實的文件完整性缺口，已補齊；第三項（`MANUAL_CONFIRMED_SIGHT_DATE` 佐證要求）查證後不追加為新的待確認事項，因為使用者確認這不是業務實際提出的要求，本文件的角色是如實記錄業務已核定與待業務確認的內容，不主動把字面上的措辭差異包裝成新的開放議題。至此文件狀態：使用者確認「可提交」，評分 9.9／10。**

### 第十四輪 BA 提案覆核（使用者以 BA 角色直接確認兩項系統範圍決定）：撤回第十三輪一項新增、移除一個候選值

第十四輪不是第三方 P0/P1/P2 提案，而是使用者針對第十三輪剛補上的 `sightDateSourceJustification`、以及第十三輪列為「不追加」但仍保留原樣的 `MANUAL_CONFIRMED_SIGHT_DATE`，以 BA 角色直接追問並拍板兩項系統範圍決定：

| 決定項目 | 內容 | 依據 |
|---|---|---|
| 撤回 `sightDateSourceJustification` | **業務直接確認：這個欄位不需要設計進系統**——A6 只保留 `Sight Date`／`Sight Date Source` 兩個欄位，正確性由既有 Maker 輸入、Checker 核對單據的機制把關，不另外設計一個佐證文字欄位。已從 TypeScript 型別區塊、Mode B 驗證規則、驗收案例、決策狀態總表移除；第十二、十三輪相關歷史記錄補註說明已撤回，不回頭改寫 | 上方「`sightDateSourceJustification` 不設計進系統」段落 |
| 移除 `MANUAL_CONFIRMED_SIGHT_DATE` | **業務直接確認：這個候選值不提供其他五個值無法涵蓋的真實業務情境**——A6 本身就是 Maker 輸入、Checker 核對確認，「人工輸入」是輸入方式，不是獨立的業務日期來源；手動輸入的日期若有實際依據（例如匯票承兌紀錄），應歸類到對應的既有候選值。`sightDateSource` 自此由六值枚舉改為五值枚舉，本文件內所有沿用「六值枚舉」指稱 `sightDateSource` 的既有措辭已同步更新為「五值枚舉」（`tenorBasis` 本身的六值集合不受影響，兩個「六」是不同的東西，未混淆）；「架構延伸」段落的 `BaseDateSource` 假設性型別、附錄第九、十二、十三輪相關歷史記錄已補註說明 | 上方「移除 `MANUAL_CONFIRMED_SIGHT_DATE`」段落 |

**結論：本輪兩項都是使用者以 BA 角色直接確認的系統範圍決定，不是查證既有內容對錯——第十三輪剛補齊的內容，被業務本人重新評估後認為不需要，本文件如實記錄這個變化，不因為是自己上一輪剛寫的內容就抗拒修改。全文已逐一排查「六值枚舉」「MANUAL_CONFIRMED_SIGHT_DATE」「sightDateSourceJustification」三組關鍵字，確認正文與相關歷史記錄補註皆已同步，未遺漏殘留分身。**

### 第十五輪 BA 提案覆核（業務直接確認兩項架構性項目為非本期系統需求）：兩項封閉，一項殘留缺口一併修正

業務提供修訂版文件，明確拍板兩項先前一直開放的架構性項目，並修正一處殘留缺口：

| 項目 | 內容 | 依據 |
|---|---|---|
| `baseDateSource` 統一模型封閉為非本期需求 | **業務直接確認**：本期不採方案 (b)，維持個別欄位命名（方案 (a)）；「架構延伸」改名「架構備註」，明確標示「非本期系統需求，不得據此實作」。原標題與決策狀態總表已改為封閉語氣，但底下本文一開始仍寫「這裡有一個真正的設計選擇，本文件不片面決定」「下一輪再改」，標題與內文自相矛盾——已一併改寫內文為業務已核定的封閉敘述，不只改標題 | 上方「架構備註」段落；決策狀態總表 |
| `Counterparty Advised Maturity Date` 核對機制封閉為非本期需求 | **業務直接確認**：本期不新增此機制；「新增提案」改名「業務構想備註」，同樣標示「非本期系統需求，不得據此實作」。同樣發現標題已封閉、內文仍寫「是否要排入這一期的交付範圍，需要業務另外評估優先順序」的矛盾，已一併改寫內文 | 上方「業務構想備註」段落；決策狀態總表；第五節待確認事項 |
| 補齊第十四輪殘留的「六個候選值」未改 | **查證後確認缺漏真實存在，已採納**——第一節業務五點回覆第 1 點仍寫 `sightDateSource` 六個候選值，第十四輪移除 `MANUAL_CONFIRMED_SIGHT_DATE` 後未同步這一處，已改為五個 | 上方「業務覆核」第 1 點 |

**結論：前兩項是業務本人直接拍板的系統範圍決定，不是本文件查證得出的結論；查證發現這兩項的標題／決策表已封閉，內文卻仍留著「不片面決定」「待業務評估」的舊措辭，屬於同一種「改了一處、沒回頭檢查同段落其他地方」的老問題，已一併修正，不是只改標題交差。第三項是第十四輪自己的殘留分身，找到就改，不因為是自己上一輪的疏漏就輕放。**

### 第十六輪 BA 提案覆核（業務直接核定 `AFTER_ACCEPTANCE` 的 `acceptanceDate` 操作定義——本文件系列最後一項未決事項收斂）：全文清理為 CLEAN COPY

業務直接確認 `acceptanceDate` 的業務定義並提供實務範例，明確指示移除文件中所有相關的待確認／Release Blocker／PENDING_BASE_DATE／Feature Flag 敘述：

| 項目 | 內容 | 依據 |
|---|---|---|
| `acceptanceDate` 操作定義業務核定 | **業務直接確認**：`acceptanceDate` = 進口銀行實際承兌該筆匯票或單據的業務日期，由 A6 Maker 輸入或確認，Checker 核准；明確不是 Maker Submit Date，也不是 Checker Approval Date，不得由這兩個系統時間自動代入；A6 Submit 時必填 | 上方「業務覆核」第 4 點；第二節 |
| 移除 `AFTER_ACCEPTANCE` Release Blocker 段落 | 改寫為「已解除 Release Blocker」，新增 Submit 時必填驗證規則（`RequestValidationError`），比照 `AFTER_SIGHT` Mode B 精神 | 上方第二節 |
| 移除 `PENDING_BASE_DATE`／Feature Flag 相關敘述 | `AFTER_ACCEPTANCE` 不再保留 `PENDING_BASE_DATE` 等待路徑，不需要 Feature Flag 停用；同步修正「其餘五種 tenorBasis 停留在 PENDING_BASE_DATE」清單的用詞（`AFTER_SIGHT`／`AFTER_ACCEPTANCE`／`FIXED_MATURITY_DATE` 三者實際上都是 Submit 必填、不留在 `PENDING_BASE_DATE`，真正符合此敘述的只剩 `AFTER_BL_DATE`／`AFTER_INVOICE_DATE`／`AFTER_SHIPMENT_DATE`） | 上方第三節「本節範圍限定」；UI 顯示章節「未確認時停在 PENDING_BASE_DATE」段落 |
| 範例三移除操作定義未核定的假設語句，補入業務提供的實務範例 | 移除「若操作定義本身尚未核定，見上方 Release Blocker 補充說明」的假設語氣；新增「範例三之補充」，以 Maker Submit Date／`acceptanceDate`／Checker Approval Date 三個不同日期示範必須以 `acceptanceDate` 為準 | 上方「範例三」「範例三之補充」 |
| 標記與現行程式碼的衝突為工程待修正項目 | `routes/balanceMovements.ts` 現行無條件以 `service.getBusinessDate()`（今天）帶入 `acceptanceDate`，違反業務核定的「不得由系統時間自動代入」規則，已明確標記為既有程式碼待修正的工程缺陷 | 上方第二節「與現行程式碼的衝突」段落 |
| 決策狀態總表、UI 畫面規劃段落、待確認事項同步更新 | 決策狀態總表該列改為「已核定」；UI 章節的 Release Blocker 畫面規劃改為正常欄位規劃；第五節待確認事項移除該項，改寫為收斂聲明 | 上方第四節決策狀態總表；UI 章節；第五節 |

**結論：本輪業務直接核定 `AFTER_ACCEPTANCE` 的 `acceptanceDate` 操作定義——這是本文件系列自第六／七輪起持續標記為「待業務確認」的最後一項核心業務空白，至此收斂。已依業務指示，將 Release Blocker、PENDING_BASE_DATE 專用路徑、Feature Flag 停用等因這項空白而存在的過渡性敘述全數移除或改寫，第五節「待確認事項」不再有未決項目。附錄逐輪查證記錄（第六、七、八輪等歷史條目中提及 `AFTER_ACCEPTANCE` Release Blocker 之處）維持原文不回頭改寫，僅本輪起的現行決策段落反映最新核定狀態，避免竄改歷史查證記錄。**

---

*本文件與兩份主文件的關係：拆分基準為 `Maturity-Date-Tenor-Basis-Decision-Review.md` v33、`Maturity-Date-UI-Display-Override-Decision-Request.md` v17（皆為 git 已提交版本）。兩份主文件拆分後的版本號變動、後續新一輪覆核，請直接在對應主文件記錄，不在本文件延續版本號——本文件是一次性拆分產物，往後若這個主題（Sight Date／Base Date／Mode A vs B／A6 Acceptance 功能修正建議／`FIXED_MATURITY_DATE` 輸入方式）繼續有新一輪業務覆核，比照本文件現有的組織方式延伸即可：現行決策更新寫進一～五節對應段落，逐輪查證表追加進附錄，不需要重新拆分。*
