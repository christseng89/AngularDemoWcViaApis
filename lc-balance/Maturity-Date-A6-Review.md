# A6 Acceptance — Sight Date／Base Date／Mode A vs B 決策紀錄（從主決策文件拆分）

**本文件的由來**：`Maturity-Date-Tenor-Basis-Decision-Review.md`（拆分前已成長至 v41）與
`Maturity-Date-UI-Display-Override-Decision-Request.md`（拆分前已成長至 v25）在多輪「A6 Acceptance
功能修正建議」業務覆核（第一輪至第六輪）中，圍繞 **Sight Date 的業務定義、A6 使用的 Base Date
欄位與取得方式、Mode A vs Mode B、`tenorDays` 一致性檢查** 這組主題持續大量成長，導致兩份主文件本身過於龐大。
本文件把這幾輪覆核新增／修改的實質內容整份搬移出來，兩份主文件各自還原回本次拆分前的最後一次
**已提交（git 已 commit）版本**——`Maturity-Date-Tenor-Basis-Decision-Review.md` **v33**、
`Maturity-Date-UI-Display-Override-Decision-Request.md` **v17**——作為本文件內容的基準版本（baseline）。

**閱讀方式**：本文件內文出現「見上方」「見下方」，指本文件自己內部的段落；出現「見
`Maturity-Date-Tenor-Basis-Decision-Review.md` 第 N 節」或「見
`Maturity-Date-UI-Display-Override-Decision-Request.md`「問題 N」」，指仍留在對應主文件（v33／v17
基準版本）裡的段落——拆分後兩份文件分開閱讀，交叉引用已依此原則全部改寫，確保仍然可以正確定位。

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

| `tenorBasis` | Base Date | A6 如何取得 | 出口銀行交單時是否可能已算出到期日 |
|---|---|---|---|
| `AFTER_SIGHT` | Sight Date | 由進口銀行於 A6 確認見票日或承兌日 | 通常無法單靠出口銀行交單確定；須依信用狀條款及實際見票認定 |
| `AFTER_ACCEPTANCE` | Acceptance Date（欄位名稱 `acceptanceDate`） | 由進口銀行於 A6 確認實際承兌日期 | 通常不能正式確定，因為實際承兌尚未發生 |
| `AFTER_BL_DATE` | B/L Date | **本期核定設計：A6 Maker 依提單輸入 B/L Date，Checker 核對** | 可以，因為 B/L Date 已記載於提單 |
| `AFTER_INVOICE_DATE` | Invoice Date | **本期核定設計：A6 Maker 依發票輸入 Invoice Date，Checker 核對** | 可以，因為 Invoice Date 已記載於發票 |
| `AFTER_SHIPMENT_DATE` | Shipment Date | **本期核定設計：A6 Maker 依運輸單據輸入 Shipment Date，Checker 核對** | 可以，因為 Shipment Date 通常可由運輸單據判定 |
| `FIXED_MATURITY_DATE` | 不需要 Base Date | 從信用狀條款直接帶入指定到期日 | 可以，因為信用狀條款已直接指定日期 |

**本期範圍明確聲明：本期修正僅限 A6，不修改 A3／B3，也不保留「未來由 A3 提供」這種曖昧的過渡措辭**——本期核定的設計就是 A6 直接輸入，不是過渡方案，也不是等待 A3/B3 的暫時安排。若未來業務認為應該改由 A3/B3 提供這幾個欄位，屬於另一項獨立需求，需另立文件重新決策，不預先寫進本次核定設計裡。簡化後的本期 A6 輸入欄位對照如下：

| Tenor Basis | A6 輸入欄位 |
|---|---|
| `AFTER_BL_DATE` | B/L Date |
| `AFTER_INVOICE_DATE` | Invoice Date |
| `AFTER_SHIPMENT_DATE` | Shipment Date |
| `AFTER_SIGHT` | Sight Date |
| `AFTER_ACCEPTANCE` | Acceptance Date（**Release Blocker，見下方說明**） |
| `FIXED_MATURITY_DATE` | 不適用（直接使用信用狀條款指定的 `fixedMaturityDate`，不經 Base Date 輸入） |

（欄位存在性提醒：這裡列的 `blDate`／`invoiceDate`／`shipmentDate` 目前仍完全不存在於 `types.ts`／`db/schema.ts`——上表講的是本期核定要落地的設計（A6 直接輸入），不是現況已有的欄位；兩者的差距是「還沒新增欄位」，不是「還沒決定怎麼設計」，設計本身已經定案。）

### 業務覆核：正式區分「系統判斷的 Base Date 欄位」與「日期來源證據」，並否決新增兩個 Tenor Basis 的提案

一輪 BA 提案曾把 `DOCUMENT_PRESENTATION_DATE`／`DOCUMENT_RECEIVED_DATE` 升格成兩個獨立的新 Tenor Basis（`AFTER_PRESENTATION_DATE`／`AFTER_DOCUMENT_RECEIVED_DATE`），並把「Tenor Basis 決定用哪個欄位」（系統自動判斷，不需使用者選）跟「`sightDate` 實際依哪個銀行操作事件認定」（`sightDateSource` 六值枚舉，仍需逐筆記錄）這兩層混在一起講成同一個「Base Date Source」；業務正式覆核後五點回覆：

1. **不新增 `AFTER_PRESENTATION_DATE` 與 `AFTER_DOCUMENT_RECEIVED_DATE` 這兩個 Tenor Basis**——除非業務提供實際信用狀條款文字，證明這兩種確實是跟「after sight」不同的獨立條款類型，否則不納入本期設計。`DOCUMENT_PRESENTATION_DATE`／`DOCUMENT_RECEIVED_DATE` 維持原本已核定的定位——它們只是 `tenorBasis = AFTER_SIGHT` 情境下 `sightDateSource` 六個候選值裡的其中兩個，不是獨立的 Tenor Basis，不重複建立第二套平行設計。六種 `tenorBasis` 的合法值集合維持不變。
2. **正式區分「Base Date 欄位」（系統依 `tenorBasis` 自動判斷，不需要使用者選）跟「日期來源證據」（`sightDateSource`，僅 `AFTER_SIGHT` 才有，需要記錄實際依據哪個銀行操作事件認定）**：

   | `tenorBasis` | A6 使用的 Base Date 欄位 | 日期來源 |
   |---|---|---|
   | `AFTER_BL_DATE` | `blDate` | 本期核定設計：A6 Maker 依提單輸入，Checker 核對 |
   | `AFTER_INVOICE_DATE` | `invoiceDate` | 本期核定設計：A6 Maker 依發票輸入，Checker 核對 |
   | `AFTER_SHIPMENT_DATE` | `shipmentDate` | 本期核定設計：A6 Maker 依運輸單據輸入，Checker 核對 |
   | `AFTER_SIGHT` | `sightDate` | 由 `sightDateSource`（六值枚舉，見下方）記錄實際認定來源，屬於稽核證據，不是另一組欄位選擇 |
   | `AFTER_ACCEPTANCE` | `acceptanceDate` | 由 A6 確認；具體業務認定方式待確認（見第四節待確認事項） |
   | `FIXED_MATURITY_DATE` | 不適用（直接用 `fixedMaturityDate`） | 信用狀條款直接指定，無需另外認定來源 |

   「Base Date 欄位」這一層是 Tenor Basis 決定的固定對應，系統自動判斷、不需要使用者手動選擇；「日期來源」這一層只有 `AFTER_SIGHT` 需要（其餘 `tenorBasis` 的 Base Date 欄位本身就是單一事實，不需要來源枚舉），且必須逐筆記錄，不能靠 Tenor Basis 自動推導出唯一答案——先前提案把這兩層都稱作「Base Date Source」，容易被誤讀成 `sightDateSource` 六值枚舉要被單一值取代，業務已明確排除這個誤讀，六值枚舉維持不變（見下方）。
3. **維持已核定的 Mode B，不重新開放討論**——`AFTER_SIGHT` 情境下 `sightDate` 未確認時，A6 Submit 必須直接被 `RequestValidationError` 擋下；不會回到「先允許 Submit、標記 `PENDING_BASE_DATE`」這個 Mode A 的行為（見下方第三節）。
4. **`AFTER_ACCEPTANCE` 的 `acceptanceDate` 操作定義維持待業務確認**——在業務正式確認前，不預設它等於 Maker Submit Date、Checker Approval Date，或任何其他系統操作時間點。
5. **現階段不新增 Tenor Basis，因此不涉及新增 Standing／OAS 枚舉**——`Maturity-Date-Tenor-Basis-Decision-Review.md` §3.1 節「Standing／OAS 層面確認 tenorBasis 合法值集合」這個步驟維持原本的六值範圍；若未來業務提供實際條款證明需要新增，再依正常程序跟 Standing／OAS 團隊對齊。

**`AFTER_ACCEPTANCE` 明確列為本期 Release Blocker，不是單純的待確認事項；範圍限定在 `AFTER_ACCEPTANCE` 自己，不阻擋其餘五種 `tenorBasis`**：`acceptanceDate` 的操作定義（究竟等於 Maker Submit Date、Checker Approval Date，還是銀行實際承兌動作的日期）仍未業務核定（見第四節）——不同定義會算出不同的 Contractual Maturity Date，這不是文件用詞問題，是會影響到期日正確性的實質空白。定調成兩種互斥情況，上線前需先確認屬於哪一種，不是「只要 Acceptance Date 未定義就整個 A6 都不能上線」：

- **若本期上線範圍包含 `AFTER_ACCEPTANCE`**：`acceptanceDate` 操作定義必須先取得業務核定才能開放；未核定前，`tenorBasis = AFTER_ACCEPTANCE` 這一種維持在 `PENDING_BASE_DATE`、不允許進入 `PENDING_APPROVAL`，是這一種 `tenorBasis` 自己的 Release Blocker——**不影響**其餘五種 `tenorBasis` 正常上線。**這段期間畫面也不應該顯示任何到期日，連下方的 Estimated Contractual Maturity Date 都不例外**：下方的 Estimated 顯示機制，前提是「Acceptance Date 這個概念本身是清楚的，只是這一筆交易的實際值還沒確認」；但這裡的情況更根本——`acceptanceDate` 究竟對應 Maker Submit、Checker Release，還是銀行實際承兌動作，這個操作定義本身都還沒業務核定，代表系統連「該用哪個事件的日期去估算」都無所依據，據此產生的任何 Estimated 值都沒有計算原則可循，不是「精確度不夠」，是「連估算公式都不存在」。因此：操作定義業務核定之前，`AFTER_ACCEPTANCE` 一律不產生任何到期日（含 Estimated），畫面也不顯示試算值；操作定義業務核定之後（即使某一筆交易的實際承兌日仍待確認），才適用 `Maturity-Date-Tenor-Basis-Decision-Review.md` §4.4 節既有的 Estimated／Confirmed 兩階段顯示機制。
- **若本期上線範圍不包含 `AFTER_ACCEPTANCE`**：以 Feature Flag 或路由層明確停用這一種 `tenorBasis`（Acceptance CREATE 請求 `tenorBasis = AFTER_ACCEPTANCE` 時直接拒絕或導向下一期），不阻擋其餘五種 `tenorBasis` 的 A6 功能上線，`acceptanceDate` 操作定義待業務有空時再確認，改列下一期交付。

`Maturity-Date-Tenor-Basis-Decision-Review.md` 第八節驗收標準與第十節決策狀態總表已同步更新這個結論（見本文件第四節「已同步到主文件決策狀態總表的異動摘要」）。

### `sightDateSource` 完整候選清單（業務已核定，取代原本三值枚舉，僅適用 `tenorBasis = AFTER_SIGHT`）

```typescript
sightDate?: string | null;
sightDateSource?:
  | 'DRAFT_ACCEPTANCE_DATE'              // 以付款行／承兌行實際承兌匯票日期作為 Sight Date；常見且較明確，但仍須符合信用狀條款與銀行規則
  | 'DRAFT_SIGHTING_DATE'                // 銀行另外記錄的實際見票日期，須有明確業務定義與紀錄
  | 'ISSUING_BANK_CONFIRMED_SIGHT_DATE'  // 由開證銀行正式確認或通知的 Sight Date，須有通知或訊息證據
  | 'DOCUMENT_PRESENTATION_DATE'         // 以文件提示日期作為 Sight Date；只有信用狀條款或銀行核定規則明確如此規定時才可使用
  | 'DOCUMENT_RECEIVED_DATE'             // 以銀行收單日期作為 Sight Date；不應預設成立，除非有明確業務規則或條款依據
  | 'MANUAL_CONFIRMED_SIGHT_DATE'        // 由 Maker 輸入、Checker 確認，並附證據或原因，作例外處理
  | null;
sightDateConfirmedBy?: string | null;    // 確認人（Maker/系統帳號），稽核用
sightDateConfirmedAt?: string | null;    // 確認時間戳，稽核用
```

`sightDateConfirmedBy`／`sightDateConfirmedAt` 補齊誰在什麼時候做了這個確認，讓 `sightDate` 有完整的稽核鏈，不是一個沒有來源的日期欄位。

**與 Mode B 決策的一致性說明**：上面這四個欄位在型別上仍然宣告成 optional（`?`），這是刻意的、不是遺漏——因為這組欄位是**六種 `tenorBasis` 共用的同一個 `BalanceContract`／`BalanceMovement` 型別**的一部分，只有 `tenorBasis = AFTER_SIGHT` 才會用到它們，其餘五種 `tenorBasis`（`AFTER_ACCEPTANCE`／`AFTER_BL_DATE`／`AFTER_INVOICE_DATE`／`AFTER_SHIPMENT_DATE`／`FIXED_MATURITY_DATE`）的 Acceptance 完全不需要 `sightDate`，型別系統沒有辦法表達「只有在另一個欄位等於某個值時才必填」這種條件式必填，所以型別本身維持 optional 是正確做法。真正的「Mode B：未確認不得 Submit」這條規則，是**執行期（runtime）驗證**，只在 `tenorBasis === 'AFTER_SIGHT'` 這個分支生效：驗證 `sightDate`／`sightDateConfirmedBy`／`sightDateConfirmedAt` 三者皆非 null，缺一即以 `RequestValidationError` 擋下 Submit——不是靠型別系統強制，而是靠 Submit 當下的業務規則檢查；不同 `tenorBasis` 各自有各自的必填規則，不能用同一個型別必填/選填設定去籠統套用。

**明文不建議的來源值**：`SYSTEM_TODAY`（系統當天）、`MAKER_SUBMIT_DATE`（Maker 送出時間）、`CHECKER_APPROVAL_DATE`（Checker 核准時間）——除非銀行已經明確規定這個系統操作時間點就是正式見票日，否則不應該把系統動作的時間點直接當成業務上的見票日；這幾個時間點反映的是「這筆交易什麼時候被系統處理」，不是「見票這個商業行為什麼時候實際發生」，兩者混用會讓 `sightDate` 失去業務意義。

**新增驗證要求（第六輪 BA 提案覆核，回應「`DOCUMENT_PRESENTATION_DATE`／`DOCUMENT_RECEIVED_DATE` 不應自動視為合格來源」）**：上面兩個候選值的註解雖然已經寫明「只有信用狀條款或銀行核定規則明確如此規定時才可使用」／「不應預設成立，除非有明確業務規則或條款依據」，但這只是命名旁邊的說明文字，先前沒有落實成一條可執行、可稽核的業務規則——沒有規定「明確如此規定」這件事要怎麼被驗證、由誰驗證、留下什麼紀錄。補上：Maker 在 A6 選擇 `sightDateSource = DOCUMENT_PRESENTATION_DATE` 或 `DOCUMENT_RECEIVED_DATE` 時，必須同時填寫依據（信用狀條款文字引用，或銀行核定規則的文件編號／條號）；Checker 核對 Submit 內容時，除了確認 `sightDate` 本身正確，也必須核對這個依據是否確實支持「這個銀行操作事件的日期＝這筆交易正式的 Sight Date」這個等式，不能只因為 Maker 選了這個候選值就視為自動成立。其餘四個候選值（`DRAFT_ACCEPTANCE_DATE`／`DRAFT_SIGHTING_DATE`／`ISSUING_BANK_CONFIRMED_SIGHT_DATE`／`MANUAL_CONFIRMED_SIGHT_DATE`）性質上已經是銀行自己執行或確認的動作（承兌、見票、正式通知、人工確認），不需要另外舉證「這個事件是否等於 Sight Date」；只有這兩個以「文件到達」／「銀行收單」為基礎的候選值才需要額外的條款佐證，因為文件到達或收單本身不天然等於見票這個商業行為，兩者可能是不同天。建議 `sightDateSource` 型別旁新增對應的 `sightDateSourceJustification?: string | null` 欄位承接這個依據文字，僅在來源值為這兩者之一時必填，其餘四個候選值不強制要求。

### 架構延伸（工程設計層級，本文件提出但不片面核定，需要業務／工程共同確認）：是否要把 `sightDateSource` 概念推廣成通用的 `baseDateSource`

```typescript
type BaseDateSource =
  | 'DRAFT_ACCEPTANCE_DATE' | 'DRAFT_SIGHTING_DATE' | 'ISSUING_BANK_CONFIRMED_SIGHT_DATE' | 'MANUAL_CONFIRMED_SIGHT_DATE' // AFTER_SIGHT
  | 'ACCEPTANCE_DATE'        // AFTER_ACCEPTANCE
  | 'BILL_OF_LADING_DATE'    // AFTER_BL_DATE
  | 'INVOICE_DATE'           // AFTER_INVOICE_DATE
  | 'SHIPMENT_DATE';         // AFTER_SHIPMENT_DATE
// FIXED_MATURITY_DATE：baseDate = null，baseDateSource = null，contractualMaturityDate = fixedMaturityDate 直接帶入
```

這裡有一個真正的設計選擇，本文件不片面決定：**(a)** 保留現有做法——`sightDate`／`blDate`／`invoiceDate`／`shipmentDate`／Acceptance Date 各自獨立命名，只有 `sightDate` 因為來源本身有多種可能才需要配一個 `sightDateSource`，其餘欄位因為來源單一（單據上的日期）不需要額外的來源欄位；**(b)** 全面改用統一的 `baseDate`／`baseDateSource` 一對欄位取代上面所有個別命名的欄位，每種 `tenorBasis` 都用同一組欄位，只是 `baseDateSource` 的值域不同。方案 (b) 的好處是欄位設計對稱、未來加新 `tenorBasis` 不用再加新欄位；缺點是需要回頭把兩份主文件跟本文件已經寫好的大量引用個別欄位名稱的段落全部改掉，改動範圍不小。**本文件建議先採方案 (a)（改動最小），把 `baseDateSource` 的分類邏輯當作設計原則記錄在這裡，但不強制重新命名既有欄位；如果業務／工程評估後認為方案 (b) 的長期一致性值得這筆重構成本，下一輪再改**。

### 新增提案（屬於新增功能範圍，非本文件原始待確認事項，需要業務確認是否納入本期交付範圍）：對方（出口銀行）已通知到期日時的核對機制

如果出口銀行在交單時已經通知了它自己算出的到期日，A6 建議增加一個參考欄位做核對，而不是直接採信：

```text
Counterparty Advised Maturity Date：2026-11-30    // 對方通知的到期日，僅供參考
System Calculated Maturity Date：2026-11-30       // 本行系統依自己的 Base Date／Tenor Basis／Tenor Days 算出的到期日
Validation Result：MATCH                          // 或 MISMATCH
```

兩者不同時（例如對方通知 `2026-12-01`，本行算出 `2026-11-30`），應要求人工確認差異原因，常見類別包括：起算日不同、Tenor Days 不同、對方通知的其實是 Contractual Maturity Date 而本行顯示的是已經過假日調整的 Operational Payment Date（或反過來）、信用狀條款解讀不同。**不論原因為何，都不能直接把對方通知的日期覆蓋系統算出的 Contractual Maturity Date**——這跟 Contractual Maturity Date「系統計算、不接受人工直接輸入」的既有立場（`Maturity-Date-Tenor-Basis-Decision-Review.md` 第一節、`Maturity-Date-UI-Display-Override-Decision-Request.md` 問題一）完全一致：對方通知的日期只能觸發核對流程，不能繞過系統計算直接寫入。這是一個新提出的功能構想，不在原本列出的待確認事項或驗收範圍內，是否要排入這一期的交付範圍，需要業務另外評估優先順序。

```text
Sight Date 已確認 → 計算 Contractual Maturity Date → 再呼叫 Standing 計算 Operational Payment Date（Maturity Status = PENDING_APPROVAL，待 Checker Release）
Sight Date 未確認 → A6 Acceptance CREATE 的 Maker Submit 直接被 RequestValidationError 擋下（業務已核定 Mode B，見下方）——不會建立這筆 Acceptance，也就不會產生 Maturity Status = PENDING_BASE_DATE 這個中繼狀態
```

**重要澄清，避免誤讀**：「出口銀行已算出日期」不代表出口銀行單方面決定進口銀行的正式到期日。正確的說法是：如果信用狀條款與相關單據日期已經明確，出口銀行可以據此計算到期日；進口銀行在 A6 仍應依相同條款與單據核對，並完成承兌確認——出口銀行算出的日期是參考值，不是可以直接採用的正式答案。

### 工作範例

**範例一：`90 Days After B/L Date`**（示範「A6 交易本身的執行日期」跟「Base Date」是兩件事，這個原則同樣適用 Invoice Date／Shipment Date）：信用狀條款 `Tenor Basis = AFTER_BL_DATE`、`Tenor Days = 90`、`B/L Date = 2026-09-01`。出口銀行交單時即可計算 `Contractual Maturity Date = 2026-09-01 + 90 days = 2026-11-30`。進口銀行 A3 收單：`Document Arrival Date = 2026-09-05`，`B/L Date = 2026-09-01`（單據上印的日期，不是收單日）。進口銀行 A6 承兌：`Base Date = 2026-09-01`、`Base Date Source = BILL_OF_LADING`、`Contractual Maturity Date = 2026-11-30`，`Operational Payment Date` 由 Standing 計算。即使 A6 實際辦理是在 `2026-09-08`（`Acceptance Date = 2026-09-08`，這是 A6 這筆交易的執行日期），也**不能**改用 `2026-09-08 + 90 days`，因為信用狀條款是「90 days after B/L date」，不是「90 days after acceptance」——**Acceptance Date 是 A6 交易日期，B/L Date 才是 Maturity Date 的 Base Date**，兩者不能混用。

**範例二：`90 Days After Sight`**（`sightDate` 的一種具體來源示範）：信用狀條款 `Tenor Basis = AFTER_SIGHT`、`Tenor Days = 90`。A3 收單：`Document Arrival Date = 2026-09-01`——但收單日期不一定等於正式 Sight Date。A6 辦理承兌：`Sight Date = 2026-09-03`、`Sight Date Source = DRAFT_ACCEPTANCE_DATE`，因此 `Contractual Maturity Date = 2026-09-03 + 90 days = 2026-12-02`。這個情境下 `A6 Acceptance Date = Sight Date = Base Date`，**前提是銀行業務已明確規定：A6 的承兌日期即為該筆匯票的正式見票日**——這是 `sightDateSource = DRAFT_ACCEPTANCE_DATE` 這個來源值適用時的情況，不是每一筆 `AFTER_SIGHT` 都必然如此（見上方 `sightDateSource` 完整候選清單，其他來源值不會有這個等式）。

**範例三：`90 Days After Acceptance`**（呼應 `Maturity-Date-Tenor-Basis-Decision-Review.md` §4.4 節已核定的 Estimated 概念，這裡用同一個 `tenorBasis` 具體示範；本範例假設 `acceptanceDate` 操作定義已經業務核定，只是這筆交易的實際承兌日尚未確定——若操作定義本身尚未核定，見上方 Release Blocker 補充說明，畫面不產生任何日期）：信用狀條款 `Tenor Basis = AFTER_ACCEPTANCE`、`Tenor Days = 90`。A3 收單：`Document Arrival Date = 2026-09-01`，此時最多只能給出預估：`Estimated Acceptance Date = 2026-09-03`、`Estimated Maturity Date = 2026-12-02`。A6 實際承兌：`Actual Acceptance Date = 2026-09-05`，正式計算 `Contractual Maturity Date = 2026-09-05 + 90 days = 2026-12-04`。預估日期（2026-12-02）與正式日期（2026-12-04）不同——出口銀行交單當時如果還不知道進口銀行實際承兌日期，就不能把預估日期當成正式到期日，這點跟 §4.4 節「Estimated 與正式生效日期的欄位區分」的原則完全一致。

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
Tenor Days：不適用（不填、不參與計算）
Contractual Maturity Date：2026-12-02（＝ Fixed Maturity Date，不經過 computeSourceDate()）
Operational Payment Date：2026-12-03（Standing 依適用行事曆調整後的結果，假設 12-02 為週三國定假日）
```

**「Base Date Source」概念澄清，避免跟 `sightDateSource` 混淆、也避免跟 UI 文件既有決定矛盾（第六輪 BA 提案覆核查證發現並修正）**：使用者提供的原始草案曾建議畫面上加一個「Base Date Source = `FIXED_MATURITY_DATE`」欄位，用意是讓使用者清楚看到這筆交易的到期日計算邏輯是「直接輸入」而非「Base Date + Tenor Days」。**查證後確認這個欄位不應該加**：`Maturity-Date-UI-Display-Override-Decision-Request.md`「建議 UI 顯示欄位」已經業務核定「六種 `tenorBasis` 只有 `AFTER_SIGHT` 真正有『來源』這個概念，其餘 `tenorBasis` 不顯示任何『Source』欄位」，如果只為 `FIXED_MATURITY_DATE` 加一個內容恆等於 `tenorBasis` 本身、不需使用者選擇也不提供任何新資訊的「Source」欄位，等於是重新開了一個 UI 文件已經明確排除的欄位類別，跟該文件既有決定矛盾。畫面上使用者已經能從 `Tenor Basis = FIXED_MATURITY_DATE` 這個既有欄位直接判斷計算邏輯，不需要另一個恆為同值的欄位重複顯示同一件事——`FIXED_MATURITY_DATE` 這一列在資料層面沒有「日期來源」，維持上方表格既有標示的「不適用」。

**BA 說明（已移除上述查證不應新增的欄位）**：當 Tenor Basis 為 `FIXED_MATURITY_DATE` 時，A6 畫面應提供 Fixed Maturity Date 欄位，由使用者直接輸入信用狀或相關文件載明的到期日，不適用 Tenor Days。Contractual Maturity Date 直接等於 Fixed Maturity Date；Operational Payment Date 則由 Standing 微服務依適用行事曆計算。

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

**本節範圍限定**：以上 Mode B 決策，範圍限定在 `tenorBasis = AFTER_SIGHT`。`AFTER_ACCEPTANCE` 情境下 Estimated Acceptance Date 未定時是否同樣要擋下 Submit，屬於同一類但尚未經業務確認的獨立問題，本文件暫不預設答案，留待後續確認。

```text
Sight Date 未確認 → Maturity Status = PENDING_BASE_DATE，不得建立正式 Maturity Date  ← 已廢棄的 Mode A 敘述，不適用
```

**流程圖（依業務核定的 Mode B 改寫）**：

```text
Sight Date 已確認 → 計算 Contractual Maturity Date → 再呼叫 Standing 計算 Operational Payment Date（Maturity Status = PENDING_APPROVAL，待 Checker Release）
Sight Date 未確認 → A6 Acceptance CREATE 的 Maker Submit 直接被 RequestValidationError 擋下（業務核定 Mode B）——不會建立這筆 Acceptance，也就不會產生 Maturity Status = PENDING_BASE_DATE 這個中繼狀態
```

**`AFTER_SIGHT` 這一列在 `Maturity-Date-Tenor-Basis-Decision-Review.md` 「六種 `tenorBasis` 各自 Base Date 與取得方式」表格中的既有標示**：`AFTER_SIGHT` 未確認時的狀態欄標示為「不適用」——業務已核定 Mode B（見上方），`sightDate` 未確認時 Acceptance CREATE 本身在 Maker Submit 當下就被 `RequestValidationError` 擋下，不會建立這筆 Acceptance，因此不會有機會進入 `PENDING_BASE_DATE` 狀態；這一列跟其餘五列不同，是唯一的例外。

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
2. **Sight Date 尚未確認就按下 Submit**：依 Mode B，Submit 本身被 `RequestValidationError` 直接拒絕，**不建立這筆 Acceptance**，因此不會產生 `maturityDateStatus = PENDING_BASE_DATE` 這個中繼記錄——這才是跟其餘五種 `tenorBasis` 不同的地方：其餘五種 Base Date 未確認時，Submit 仍會成立、只是停在 `PENDING_BASE_DATE`；`AFTER_SIGHT` 則是 Submit 這一步直接不成立；
3. **Sight Date 已確認才 Submit**：正常成立，`maturityDateStatus = PENDING_APPROVAL`，跟其餘 `tenorBasis` 走同一套 Layer 2／3 流程。

「未確認時停在 `PENDING_BASE_DATE`」這句敘述，只適用情況 (2) 以外、經核定可以真的停留在該狀態的其餘五種 `tenorBasis`（`AFTER_ACCEPTANCE`／`AFTER_BL_DATE`／`AFTER_INVOICE_DATE`／`AFTER_SHIPMENT_DATE`／`FIXED_MATURITY_DATE`）。

### `Maturity-Date-UI-Display-Override-Decision-Request.md`「延伸建議」第 2 點修正

原範例誤把 `tenorDays` 當成 A6 畫面上 Maker 可自由修改的輸入——`tenorDays` 屬於信用狀條款本身（Tenor Basis／Tenor Days），目標設計是由 A1/B1 建檔、A2/B2 Amendment 固定，A6 只讀取顯示，不應該是 Maker 在 A6 Submit 前隨手修改的欄位；現行程式碼確實還沒有這道保護（見本文件第一節查證），但這是待補的缺口，不是本畫面應該延續的設計。修正後的建議：「Layer 1 即時重算——如果 Maker 在 Submit 前又修改了 Base Date（例如 B/L Date、Sight Date），畫面應該即時重新試算並更新顯示，不要留著舊的試算值」。

### `Maturity-Date-UI-Display-Override-Decision-Request.md`「建議 UI 顯示欄位」適用範圍澄清與欄位調整

**適用範圍澄清**：下面這組欄位是 A6／B4「建立 Acceptance」情境專屬的，不適用 `AFTER_SIGHT` 的 B4 Honour（即期付款）情境——`Maturity-Date-Tenor-Basis-Decision-Review.md` 第一、二節已核定 Export 端 `AFTER_SIGHT` 一律走 B3 Present Docs → B4 HONOUR，根本不建立 Acceptance、不計算 Maturity Date，因此沒有 Tenor Basis／Tenor Days／Base Date／Maturity Date Status 這些欄位可顯示；B4 Honour 畫面應顯示的是即期付款本身的欄位（付款金額、付款日、對應的 B3 文件），不在本節討論範圍。下面的欄位清單，只適用於實際會建立 Acceptance 並計算 Maturity Date 的情境：Import A6（六種 `tenorBasis` 皆適用）、Export B4 的 Usance 分支（`AFTER_BL_DATE`／`AFTER_INVOICE_DATE`／`AFTER_SHIPMENT_DATE`／`AFTER_ACCEPTANCE`／`FIXED_MATURITY_DATE`，以及理論上進口融資性質的 `AFTER_SIGHT` 但這只發生在 Import 側）。

**「Base Date Source」不列為主畫面必要欄位**：先前把 `Base Date Source` 跟 `Base Date` 並列成主畫面必要欄位，這跟業務已核定的「Base Date 欄位（系統依 `tenorBasis` 自動判斷，不需要使用者選）vs. 日期來源證據（`sightDateSource`，僅 `AFTER_SIGHT` 才需要，屬於稽核紀錄）」兩層區分不一致——六種 `tenorBasis` 只有 `AFTER_SIGHT` 真正有「來源」這個概念（`sightDateSource` 六值枚舉），其餘欄位（`blDate`／`invoiceDate`／`shipmentDate`／`acceptanceDate`）本身就是單一事實，不需要另一個來源欄位。修正為：`sightDateSource` 只在 `Tenor Basis = AFTER_SIGHT` 時顯示，且放在詳細資料／稽核畫面，不佔用主畫面版位；其餘 `tenorBasis` 不顯示任何「Source」欄位。

**「核心欄位是否可修改」新增一列**：

| 欄位 | 是否可修改 |
|---|---|
| Tenor Basis／Tenor Days | A6 畫面唯讀顯示，**不接受 Maker 修改**——目標設計由 A1/B1 建檔、A2/B2 Amendment 固定；現行程式碼 `tenorDays` 尚未有這道保護（見本文件第一節查證的缺口），修正前不應在 A6 畫面提供修改入口 |

**`AFTER_ACCEPTANCE`／Acceptance Date 為本期 Release Blocker 的畫面規劃配合**：主文件已把 `acceptanceDate` 操作定義（Maker Submit Date／Checker Approval Date／銀行實際承兌動作三選一，業務尚未核定）明確定調為 Release Blocker，但範圍只限 `tenorBasis = AFTER_ACCEPTANCE` 自己：**本期若包含 `AFTER_ACCEPTANCE`**，業務核定前應維持 `PENDING_BASE_DATE`，A6 畫面不應該讓使用者誤以為 Acceptance Date 已經是可以正式輸入生效的欄位，需要明確顯示「此 Tenor Basis 尚待業務確認操作定義，暫不開放」；**本期若不包含 `AFTER_ACCEPTANCE`**，由 Feature Flag／路由層直接停用即可，不影響其餘五種 `tenorBasis` 正常顯示與上線。

### `Maturity-Date-UI-Display-Override-Decision-Request.md`「問題四：覆寫的原因記錄要求」——維持待業務確認，修正一處內部矛盾

「建議預設方向總覽」表格先前有一列寫「Reason Code 必填＋自由文字必填，兩者都要」，跟「問題四」段落已註明的「本問題目前仍是開放選項，尚未業務核定」直接矛盾——業務尚未在 (a)／(b)／(c) 中選定，不應寫成既定答案。已修正為「待業務確認，目前 `reasonCode` 維持 optional；業務選定 (b) 或 (c) 後，才改為必填的 `reasonCode: string`」。

### `Maturity-Date-UI-Display-Override-Decision-Request.md`「Operational Payment Date」欄位說明補充

「覆寫核准後如何反映到主線的 `operationalPaymentDate`」：Checker Release 覆寫申請這個動作本身，除了寫入 `MaturityDateOverride` 記錄（`status: 'APPROVED'`）之外，必須同時把核准後的值寫回主流程的 `operationalPaymentDate` 欄位（覆蓋 Standing 原本算出的值）——這樣 A7／報表不需要另外認識覆寫機制或多讀一個欄位，只要繼續讀它們本來就在讀的 `operationalPaymentDate`；`calculatedOperationalPaymentDate`（Standing 原始算出值）維持不被覆蓋，作為「這筆到期日原本算出來是哪一天」的稽核追溯依據。**額外防護**：覆寫申請在 Maker 提出、尚未 Checker 核准前，不得修改目前生效的 `operationalPaymentDate`——`MaturityDateOverride` 記錄處於 `PENDING` 狀態期間，主線的 `operationalPaymentDate` 必須維持核准前的原值不變，只有 Checker 真正核准（`status` 變成 `APPROVED`）那一刻才觸發上述寫回；若覆寫申請被 `REJECTED` 或 `CANCELLED`，主線 `operationalPaymentDate` 從頭到尾都不受影響。

### `Maturity-Date-UI-Display-Override-Decision-Request.md`「不在這次決策範圍內的事」新增一項

`tenorDays` 與母合約的一致性檢查——屬於後端驗證邏輯，不是 UI 顯示問題，但呼應本文件上方新增的「Tenor Basis／Tenor Days 唯讀」欄位規則（見本文件第一節）。

### 已同步到 `Maturity-Date-Tenor-Basis-Decision-Review.md` 決策狀態總表的異動摘要

以下項目原本在主文件第十節「決策狀態總表」，狀態欄因這幾輪覆核而更新，摘要記錄於此（完整表格仍在主文件本身）：

| 項目 | 原狀態 | 新狀態 |
|---|---|---|
| `sightDate` 的業務定義（對應哪個操作動作） | 待業務確認 | **已核定**——見上方 `sightDateSource` 完整候選清單與明文排除值 |
| `sightDate` 未取得時是否允許先 A6 Submit（Mode A vs Mode B，只針對 A6，與 B4 無關） | 待業務確認 | **已核定：Mode B**——見上方第三節 |
| 是否新增 `AFTER_PRESENTATION_DATE`／`AFTER_DOCUMENT_RECEIVED_DATE` 兩個 Tenor Basis（新項目） | — | **已核定：不新增**——業務否決，除非取得實際信用狀條款文字證明是獨立條款類型 |
| `baseDateSource` 是否統一取代個別欄位命名（新項目） | — | 待業務／工程確認，屬欄位命名層級的工程決定；本文件建議先採改動最小的方案 (a) |
| 對方（出口銀行）已通知到期日的核對機制（Counterparty Advised Maturity Date，新項目） | — | 新提案，待業務確認是否納入本期範圍，視範圍 |
| `sightDateSource ∈ {DOCUMENT_PRESENTATION_DATE, DOCUMENT_RECEIVED_DATE}` 須有可稽核依據，不得自動視為合格來源（新項目） | — | 已核定（原則），`sightDateSourceJustification` 欄位待工程排入資料模型 |
| `AFTER_ACCEPTANCE` 的 Acceptance Date 業務定義 | 待業務確認，視範圍（若本期支援 `AFTER_ACCEPTANCE` 則為必要） | 待業務確認——**僅 `AFTER_ACCEPTANCE` 這一種 tenorBasis 的 Release Blocker，不阻擋其餘五種上線**；本期若包含，業務未核定前應維持 `PENDING_BASE_DATE` 且畫面不得顯示任何到期日（含 Estimated 值） |
| `FIXED_MATURITY_DATE` 是否應標示為 CANDIDATE／OUT_OF_SCOPE（第六輪 BA 提案覆核質疑，新項目） | — | **已查證：提案前提不成立，維持既有核定地位，不改列 CANDIDATE／OUT_OF_SCOPE**——自第一節起即與其餘五種 `tenorBasis` 同等地位核定，且是 UCP 600 Art. 3 承認的真實 Tenor 型態；查證後接受的唯一落差是缺少對稱工作範例，已用上方「範例四」補齊 |

---

## 五、業務覆核：逐項查證「A6 Acceptance 功能修正建議」六輪 BA 提案

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
| P1：`sightDate`／`sightDateSource` 分開保存 | **已核定**，六值枚舉與本提案一致 | 上方 `sightDateSource` 完整候選清單 |
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

---

## 六、待確認事項（此主題範圍內，尚未收斂）

- `AFTER_ACCEPTANCE` 自己的 `acceptanceDate`（欄位名稱已命名，見上方）操作定義仍未定：需要一個 `acceptanceDate` 當基準日去算 Maturity Date，但這個日期具體對應 Maker Submit 時點、Checker Release 時點，還是銀行實際承兌動作發生的時點，尚未定義，業務覆核時也明確維持「待業務確認」的立場，不預設等於上述任一系統操作時間點——三個候選時點在時間上通常不同，會算出不同的 Maturity Date。若本期交付範圍不包含 `AFTER_ACCEPTANCE` 的實際上線，可以延後到下一階段處理，但分流矩陣跟路由解析既有把它列入合法值集合，代表程式碼層面需要為它保留 `PENDING_BASE_DATE` 的處理路徑，不能假設它一定有值。
- `baseDateSource` 是否統一取代個別欄位命名——純工程設計層級決定，建議先採改動最小的做法（見上方「架構延伸」）。
- 對方（出口銀行）已通知到期日的核對機制（`Counterparty Advised Maturity Date`）——是否納入本期交付範圍待業務評估（見上方「新增提案」）。

---

*本文件與兩份主文件的關係：拆分基準為 `Maturity-Date-Tenor-Basis-Decision-Review.md` v33、`Maturity-Date-UI-Display-Override-Decision-Request.md` v17（皆為 git 已提交版本）。兩份主文件拆分後的版本號變動、後續新一輪覆核，請直接在對應主文件記錄，不在本文件延續版本號——本文件是一次性拆分產物，往後若這個主題（Sight Date／Base Date／Mode A vs B／A6 Acceptance 功能修正建議）繼續有新一輪業務覆核，比照本文件現有的組織方式（依主題分節、逐輪覆核記錄一張查證表）延伸即可，不需要重新拆分。*
