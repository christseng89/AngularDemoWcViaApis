# Balance Component — Contract Integration Proposal

**Scope:** `analysis/balance-component-api.yaml`（Microservice OAS, `info.version: "1.16.0"`, 1751 行）——
評估這份「結構契約」（schema/類型/必填欄位）與「行為契約」（業務規則、狀態機、失敗處理）之間的落差，
判斷正式對外開放給銀行內部/外部 TF 交易系統整合前，還缺哪些東西。

**Method:** 直接逐段讀取 OAS 原始檔內容（`paths`/`components/schemas`/`Error` schema），並與
`lc-balance/CLAUDE.md` 決策日誌、`microservices/balance-component/src/service/balanceService.ts` 的實際
行為、以及 `docs/obsidian-balance-kb-v3.2/` 產出的決策表交叉比對——每一項發現都附實際行號或可重現的
grep 結果，沒有未經查證的推測。不是對 OAS 逐條 schema validate（那是 lint 工具的工作），而是找「schema
本身表達得出來、但目前沒表達」和「schema 表達不出來、只能靠文件補」這兩類落差。

**Review date:** 2026-08-22

**Reviewer posture:** 把這份 OAS 當作「準備正式對外開放」的候選合約來審查，不是當作內部原型文件審查——
落差分級以「會不會讓外部整合方做出跟銀行業務政策不一致的事」為主要判準，其次才是文件完整度/結構品質。

---

## 審查與版本歷程

| 日期 | 覆核輪次 | 綜合評分 | 變更摘要 |
|---|---|---:|---|
| 2026-08-22 | 初稿 | — | OAS-GAP-01～08，8 項發現 |
| 2026-08-22 | 第一輪外部覆核 | 8.6/10 | 複驗原始 8 項全部屬實；新增 OAS-GAP-09～12（租戶隔離、限流文件化、事件推送方向、版本政策） |
| 2026-08-22 | 第二輪外部覆核 | 9.3/10 | 複驗新增 4 項全部屬實；未再發現新缺口，審查深度確認已足夠；本段落格式精簡化（本次採納的建議） |
| 2026-08-22 | 治理建議套用 | 9.6/10 | 套用五項治理層面建議（GAP-09 標示待確認假設、新增「落地衝擊」章節、落地順序改表格、範疇邊界聲明、OAS diff 預告）；標題層級小修正 |
| 2026-08-22 | OAS 實作落地 | — | GAP-06/GAP-10 正式落地到 `analysis/balance-component-api.yaml`（v1.16.0 → v1.17.0）。獨立覆核直接審查 OAS 原始檔本身（非本提案文件，且讀到的是落地前的舊快照），確認該覆核已知的兩項（GAP-06/GAP-10）已解決，另發現 7 項新觀察：`movementType` 未 enum 化、idempotency 措辭誤導、`PARTIAL_REDEEM` 缺 A9 政策警語、回應 schema 缺 `required:`（以上 4 項低風險，已同步修進 v1.17.0）；`GET .../movements` 無分頁、七個 snapshot 欄位分散、`EXPIRE` 開放問題（以上 3 項需要架構/業務決策，新增為 OAS-GAP-13～15，未動 OAS 本身）；並回填 GAP-03/05/06/10 在本文件裡的完成狀態 |
| 2026-08-22 | 第三輪外部覆核（v1.17.0 逐項核實 + 深入原始碼） | 7.2/10（原 9.6/10，因本輪新發現大幅下修） | v1.17.0 的六項修補全數逐項核實準確（`Error.code`/`movementType` 枚舉值、429 端點數、`required:` 欄位、idempotency/`PARTIAL_REDEEM` 警語）。**新發現 OAS-GAP-16**：CURRENCY DERIVATION 規則（合約裡篇幅最長、被引用最多的核心規則）與實際微服務行為直接矛盾，三個獨立源碼角度核實（`errors.ts` 無 `CurrencyMismatchError`、`createContract()` 零推導邏輯、zod schema 把 currency 列為必填），自 v1.0.0 起即存在，非本輪引入。已在 OAS 加上安全的警告性文字（不預設解法），並在本文件新增 OAS-GAP-16、標記優先度高於 P0，需業務/架構側裁決兩個互斥方向。覆核同時指出檔案路徑的一個前提錯誤（誤判磁碟上仍是 v1.16.0），已現場核對 `git diff`/`git log` 澄清——不影響 GAP-16 本身的正確性，該發現獨立成立 |
| 2026-08-22 | 第四輪外部覆核（實機拉取本機檔案核對） | 8.3/10（原 7.2/10） | 確認 CURRENCY DERIVATION 警語處理得當（披露但不擅自決定方向）。**新發現同類問題**：`Error.details.reasonCode`（v1.17.0 新增的 schema）從未真正接通——`ApiError.toBody()` 只回傳 `{code, message}`，`details` 送不出去，OAS-GAP-06 因此被誤標成已解決。獨立核實屬實後**不只補警語，直接修好**：`errors.ts` 的 `ApiError` 新增 `details` 建構子參數，5 個 domain sufficiency-check 函式 + CLOSE 的兩個檢查改為回傳 `reasonCode`，串接到全部相關 `throw` 呼叫點；三個子專案測試套件（微服務 425/425、backend 34/34、Angular 1064/1064）全部重跑並全數通過，OAS 升版至 v1.18.0，本文件同步回填 GAP-06 狀態。此輪也指出一個小的自洽性問題（新增警語沒跟著版本號一起跳）——已在補實作的同一版一併處理 |
| 2026-08-22 | 第五輪外部覆核（獨立 `tsc --noEmit` 驗證） | 9.4/10（原 8.3/10） | 逐一追蹤全部 8 個 `reasonCode` 值到各自的 `throw` 呼叫點，含最容易漏掉的 CLOSE Release 時重新檢查，確認沒有「宣告了但沒接上」的殘留；獨立在覆核端重跑 `tsc --noEmit` 乾淨過關（Jest 因覆核端掛載環境限制無法獨立重跑，三個測試套件通過數字仍是採信回報，非獨立驗證）。**發現**：本人上一則訊息口頭聲稱 GAP-16「已發決策請求」，但文件本身（rollout 表、GAP-16 小節）當時仍寫「決策請求未發出」——兩邊沒同步。已修正為統一措辭「🟢 決策請求文件已備妥，待轉發」（比單純改成「已發出」更誠實：文件本身無法驗證是否真的轉發出去了），GAP-09 那列同步套用同一措辭 |
| 2026-08-22 | 第六輪外部覆核（三份決策請求文件核對） | 9.6/10（原 9.4/10） | 確認「已備妥待轉發」措辭統一套用到 GAP-16/09/15 三列，全文 grep 無殘留「已發出」；核實新建的 `Natural-Expiry-Scope-Decision-Request.md` 格式/範疇界定品質跟前兩份一致；確認 `TF-Solutions-Tenant-Topology-Decision-Request.md` 確實未被改動。**發現**：本表本身這輪沒有跟著 rollout 表狀態欄更新留下自己的一列——本列即補記 |
| 2026-08-22 | 業務/架構回覆落地 | — | 業務/架構側回覆：GAP-16 選方向 (a) 服務端補實作，GAP-09 確認需對接多家分行/多家銀行，GAP-15 本輪暫緩列入下一輪計畫。GAP-16 直接落地為程式碼：`errors.ts` 新增 `CurrencyMismatchError`，`resolveOrCreateContract()` 加上三條 CURRENCY DERIVATION 規則的真正推導/比對邏輯，`createContract()`/`createMovement()` 兩處改用已解析的 `contract.currency`，`validation/requestSchema.ts` 的 `currency` 改為選填並把小數位檢查在省略情境下移到 service 層重跑；新增 7 個單元測試，三個子專案測試套件全部重跑綠燈（微服務 432/432、backend 34/34、Angular 1064/1064）；OAS 移除矛盾警告、改為 RESOLVED 說明，v1.18.0 → v1.19.0。GAP-09 拓撲定案寫入文件，但技術方案（含程式碼）依提案自己原本的範圍界定，留待 GAP-01 認證機制選型後才動手，這輪未寫程式碼 |

各輪完整評分細項（分維度分數、逐條複驗過程）留在覆核當下的討論紀錄，不重複嵌入本文件正文——避免文件
隨覆核輪次增加而越來越像審查紀錄，而非工程合約規格。

---

## 摘要

這份 OAS 在行為語意的表達上，比一般 Demo/Prototype 專案常見的 OAS 豐富得多——多數端點的 `description`
欄位裡已經內嵌了 Tolerance 公式、Close 資格條件、Sight 4-eyes gate、idempotency 規則等實際業務規則，
不是只有裸的 schema。真正的落差集中在三類：

1. **合約裡完全沒有、但正式對外開放前必須有的東西**（P0）——認證/授權模型、租戶/機構區隔、跨合約的
   待審核清單端點。
2. **合約內容本身跟目前業務政策真實不一致，或關鍵行為完全沒講**（P1）——會讓外部呼叫方做出銀行不希望
   發生的事，或誤觸未文件化的限制。
3. **內容都在，但結構鬆散、要讀者自己拼湊；或屬於更長期的架構/治理備註**（P2）——不會直接出錯，但拖
   慢整合團隊上手速度，或需要提早記錄以免將來設計互相打架。

（2026-08-22 更新：目前共 16 項發現 [OAS-GAP-01～16]，其中 GAP-06/GAP-10/**GAP-16** 已實際落地到 OAS
（v1.17.0、v1.19.0），GAP-03/GAP-05 的警語也已補進 OAS 正文，GAP-09 的租戶拓撲已定案（多機構，技術方案
待 GAP-01 認證機制選型）——完整版本歷程與各項目目前狀態，詳見上方「審查與版本歷程」和下方「建議落地
順序」表格最後一欄。GAP-16 原本優先度高於 P0，現已解決，見下方「✅ OAS-GAP-16」獨立小節。）

---

## ✅ OAS-GAP-16 — CURRENCY DERIVATION 規則與實際微服務行為直接矛盾（曾比 P0 更優先，已解決）

> **✅ 已解決（2026-08-22，OAS v1.19.0）**：業務/架構側選擇 **方向 (a) — 服務端補實作**，讓行為追上
> 文件，已落地並通過三個子專案測試套件驗證。見本節末尾「實作狀態」小節。以下內容保留原本的分析與判斷
> 依據，作為歷史紀錄。

**分級比 P0 更高**：P0～P2 的其他 15 項都是「合約沒講清楚」或「合約裡缺東西」；這一項不同——**合約講得
非常詳細、非常肯定，但服務端的真實行為完全是另一回事**。任何相信這份合約去做直接對接的團隊會立刻撞牆，
而且很難第一時間意識到問題出在文件本身、不是自己的實作。這是外部覆核在第三輪對照原始碼逐項核實後才發
現的，前兩輪都沒抓到（覆核自己也坦白說明了這點）。

**OAS 怎麼講**（文件開頭篇幅最長、被 `BalanceContract.currency`/`BalanceMovementCreateRequest.currency`/
`POST /balance-movements` 端點說明反覆引用的核心規則，即「CURRENCY DERIVATION」）：除了真正全新的根合
約（ISSUE/CREATE 且無父合約）以外，`currency` 應該省略，服務端會從既有合約或父合約推導並校驗，不匹配
就 `409 CURRENCY_MISMATCH`。

**實際微服務怎麼做**（三個獨立角度核實，我這邊也重新對照原始碼確認過一致）：

1. `errors.ts`（全倉庫唯一的錯誤類別定義檔）裡**沒有** `CurrencyMismatchError`，全倉庫 grep
   `CURRENCY_MISMATCH`/`CurrencyMismatch` 在 `src/`/`test/` 都是零命中。
2. `createContract()` 對 `currency` 的處理，三個呼叫點全部是 `currency: req.currency`——原樣存值，沒有
   任何跟既有合約或父合約比較的邏輯。
3. 實際生效的 zod 請求校驗（`validation/requestSchema.ts` 第 27 行）把 `currency` 列為**每一次**
   `POST /balance-movements` 請求都必填的欄位（`required_error: 'currency is required.'`），跟 OAS 說
   的「省略才是推薦做法」完全相反。

**影響**：如果呼叫方老實照 OAS 說明實作（非根創建時省略 `currency`，信任伺服器推導），每一次呼叫都會被
現行服務以 `400 currency is required` 拒絕——不是隱蔽的邊界情況，是**完全相反**的行為。這個落差從
v1.0.0 就存在，一路延續到 v1.17.0，不是這次修訂引入的新問題。

**已做的處理（2026-08-22，安全、不預設結論的文件層面警告）**：在 OAS 的 CURRENCY DERIVATION 區塊本身、
以及 `Error.code` 的 `CURRENCY_MISMATCH` 枚舉說明旁，都加上了明確的「⚠️ 已確認矛盾」警告，並保留
`CURRENCY_MISMATCH` 在枚舉裡（不預設要拿掉，因為拿不拿掉正是待決策的部分）——只是讓現在讀這份合約的
任何人，至少會被提醒「這條規則目前不可信，先別照做」。

**沒有做的處理，且不應該由工程單方面決定**：CURRENCY DERIVATION 這條規則本身該怎麼收尾，有兩個方向，
彼此互斥，需要業務/架構側裁決：

| 方向 | 意涵 | 影響範圍 |
|---|---|---|
| (a) 服務端補實作，讓行為追上文件 | 需要真的寫 currency 推導/比對邏輯，並把 zod schema 的 `currency` 改成非根創建時可選 | 這是一個真正的行為變更（`400 currency is required` 會消失、新增 `409 CURRENCY_MISMATCH` 的真實觸發路徑）——對現有呼叫方（Angular UI）而言，目前每次都送 currency 仍然合法（推導邏輯只在省略時介入），但需要完整回歸測試 |
| (b) 文件改成符合實作現狀 | 拿掉 CURRENCY DERIVATION 的三條推導規則和 `CURRENCY_MISMATCH`，改寫成「currency 每次呼叫都必填，服務端不推導、不校驗一致性」 | 對外部整合方而言更誠實，但等於承認這個「服務端會保護 currency 一致性」的設計意圖從未真正落地——後續如果真的有多幣別合約下 currency 打錯的風險，目前完全沒有防線 |

**建議**：這是需要問業務/架構側的問題，跟 OAS-GAP-09 的租戶拓撲問題性質一樣——先確認方向再動手，不要
假設答案。可以比照 `TF-Solutions-Tenant-Topology-Decision-Request.md` 的做法，另外發一份決策請求。

**實作狀態：✅ 已完成（2026-08-22，OAS v1.18.0 → v1.19.0）**。落地內容——`errors.ts` 新增
`CurrencyMismatchError`（`409 CURRENCY_MISMATCH`）；`resolveOrCreateContract()` 加上真正的推導/比對邏輯
（三種情境：解析到既有合約 → 比對其 currency，不符則拒絕；創建子合約且 parent 可解析 → 比對 parent 的
currency；沒有可推導來源的根創建 → currency 仍然必填，成為新合約的權威值）；`createContract()` 改成接
收已推導好的 currency 參數，不再直接讀 `req.currency`；`createMovement()` 裡兩處原本用 `req.currency`
的地方（`contingentAccountEntry` 推導、`BalanceMovement.currency` 欄位）改用已解析的 `contract.currency`；
`validation/requestSchema.ts` 的 `currency` 改成選填（非空字串限制仍在），原本綁在該層的幣別小數位檢查
在 currency 省略時改成在 service 層對已推導出的 currency 重新驗證一次，確保省略 currency 時精度檢查不
會被繞過。這是真正的行為變更，不是純文件補強——但對現有呼叫方（Angular UI，每次都送 currency 且必然
一致）沒有影響，只有省略 currency 或送出不一致 currency 的呼叫方會看到新行為。新增 7 個單元測試涵蓋
既有合約/父合約的比對成功與失敗案例、根創建仍必填、省略時的小數位檢查；三個子專案測試套件全部重跑確認
綠燈（微服務 432/432、backend 34/34、Angular 1064/1064）才算完成。OAS 的「已確認矛盾」警告已移除，
CURRENCY DERIVATION 區塊改成「✅ RESOLVED」說明，新增 v1.19.0 changelog 條目。

---

## P0 — 會直接擋掉正式對外開放，不只是文件問題

### OAS-GAP-01 — 完全沒有 `security`/`securitySchemes` 定義

全檔 grep `security`/`securityScheme`/`bearerAuth`/`apiKey` 零命中。`releasedBy`/`makerSubmittedBy`/
`createdBy` 全部只是 `{ type: string }` 自由文字欄位，沒有跟任何認證機制綁定。

**來源證據**：`lc-balance/CLAUDE.md` 決策日誌——「BAL-001/002（無 Auth / Angular CVEs — 重新定型為
deliberately deferred，not fixed）」。

**為什麼擋開放**：這不是補一段 OAS description 能解決的問題，必須先由業務/資安團隊決定認證模型（mTLS？
OAuth2 client-credentials？內部 API Gateway 簽章?），才能回頭補 `securitySchemes` 區塊 + 每個端點的
`security` 綁定。目前 `releasedBy` 這類欄位本質上是「呼叫方自己宣稱」，沒有任何機制驗證真正操作者身份，
不符合 Maker/Checker 4-eyes 的真實安全要求。

**建議**：正式開放前，最少要有 (a) 一個 `securitySchemes` 定義，(b) `releasedBy`/`makerSubmittedBy`/
`createdBy` 改成從已驗證的呼叫方身份（token claim）帶入，而非請求 body 裡的自由文字。決策請求已備妥，
跟 GAP-09 併同一份，見 `Auth-And-Tenant-Isolation-Decision-Request.md`。

---

### OAS-GAP-09 — 完全沒有租戶/分行/機構區隔欄位（外部覆核新增，2026-08-22）

> **✅ 拓撲已定案（2026-08-22）**：業務側回覆——TF Solutions 需要對接**多家分行/多家銀行**。P0 定級
> 前提成立，維持 P0，跟 OAS-GAP-01 併同一輪決策。**但技術方案尚未設計**：`TF-Solutions-Tenant-
> Topology-Decision-Request.md` 本身已明確把「租戶隔離的具體技術方案」和「認證機制選型」都列為這次
> 決策範圍之外、留給後續工程設計階段——而 OAS-GAP-01 的認證機制（mTLS/OAuth2/API Gateway 簽章）目前
> 仍未有人決定。在認證機制定案之前，不會直接寫租戶隔離的程式碼——兩者要一起設計，分開做會需要之後重工。
> 承接這個決策的合併決策請求已備妥：`Auth-And-Tenant-Isolation-Decision-Request.md`，待轉發。

全檔 grep `tenant`/`branch`/`entityId`/`businessUnit` 零命中。`BalanceContract`/`BalanceMovement` 的
自然鍵（LC/IB/SG Number）目前是**單一全域命名空間**——沒有任何欄位標示「這筆合約屬於哪個分行/哪個銀行
實體」。

**為什麼可能跟 OAS-GAP-01 併列 P0**（前提是上述假設成立）：如果目標是讓 TF Solutions 對接多家分行、
甚至多家銀行，這是跟認證模型同一層級的架構前提——沒有租戶區隔，就算補了 `securitySchemes`，也只能做
到「驗證呼叫方是誰」，做不到「限制呼叫方只能看到自己機構的資料」。這兩項應該一起決策，不是先做
OAS-GAP-01 再回頭補這項。

**建議**：在補 `securitySchemes` 的同一輪決策裡，一併決定資料隔離模型（`BalanceContract` 加一個
`ownerEntityId` 欄位？還是在 API Gateway 層做租戶路由，微服務本身維持單租戶?），並反映進
`BalanceContract`/`BalanceMovement` 的 schema 與每個查詢端點的過濾邏輯。

---

### OAS-GAP-02 — 沒有跨合約的「Checker 待審核清單」端點

完整列出全部 12 條路徑：

```
GET  /balance-contracts
GET  /balance-contracts/catalog
GET  /balance-contracts/close-eligible
GET  /balance-contracts/{balanceContractId}/balance
GET  /balance-contracts/{balanceContractId}/movements
POST /balance-movements
GET  /balance-movements                       (by businessEventId only)
GET  /balance-movements/{movementId}/balance-as-of
POST /balance-movements/{movementId}/release
POST /balance-movements/{movementId}/maker-submit
POST /balance-movements/{movementId}/acknowledge
POST /balance-movements/{movementId}/reject
POST /balance-movements/{movementId}/cancel
```

沒有一條可以「跨合約列出所有等待審核的 PENDING movements」。`GET /balance-contracts/{id}/movements`
只能查單一合約底下的歷史。

**來源證據**：Angular 端 `checker-panel.component.ts` 的 `loadCheckerQueue()` 自行組合 EARMARKED/
EARMARKING 篩選、`movementTypeMatchesFunction()`、`requiresEarmarked`、`!makerSubmittedAt` 等條件——
這整套邏輯目前**只活在前端 TypeScript 裡**，OAS 沒有對應端點。

**為什麼擋開放**：外部銀行系統如果要做自己的 Checker 工作台，唯一的路是把 Angular 那整套過濾邏輯在自己
系統裡重新實作一遍，而且必須自己保持跟 Angular 端同步——這是目前最大的結構性缺口，也是後續整合成本最高
的一項。

**建議**：新增 `GET /balance-movements`（不帶 businessEventId 時）支援 `status`/`instrumentType`/
`movementType`/`requiresEarmarked` 等 query 參數，回傳跨合約的分頁結果——把現有 Angular 端的篩選邏輯
下沉到伺服器端，成為一個真正可查詢的 API，而不是前端專屬邏輯。

---

### 落地衝擊：現有內部呼叫方（外部覆核新增，2026-08-22）

OAS-GAP-01（認證）、OAS-GAP-09（租戶區隔）一旦落地，會直接影響**現有生產環境正在用這份 OAS 的內部呼叫
方**——Angular `transaction-builder` UI、Business Case Runner（`backend/` 中台）。這兩者目前都是以
「無認證、單一命名空間」的假設在呼叫微服務（見 OAS-GAP-01 的 BAL-001/002 來源證據），補上
`securitySchemes` 與租戶區隔欄位之後，這兩個既有呼叫方**也必須同步改造**才能繼續運作——不是只有「未來
外部串接方」需要遵守新契約，這是很容易被規劃時遺漏的一塊。

**建議**：在啟動 OAS-GAP-01/09 的同一輪規劃裡，把「Angular UI／Business Case Runner 遷移」列為同批工
作項，而不是等外部串接方對接時才發現內部系統也要跟著改。

---

## P1 — 真正的行為語意缺口，會造成正式串接時的隱性錯誤

### OAS-GAP-03 — A9 Full-Redeem-only 是 UI 層業務政策，OAS 內容甚至互相矛盾

> **🟡 文件面已部分處理（v1.17.0，2026-08-22）**：OAS 已在 v0.4.0 changelog 條目旁補上明確的
> KNOWN DEVIATION 說明，讓直接讀合約的外部整合方至少能知道這個政策落差存在。**但下方「為什麼擋開放」
> 描述的實際行為本身沒有改變**——這個端點仍然合法接受任意呼叫方送出 `PARTIAL_REDEEM`，只是現在呼叫方
> 至少有機會在合約裡讀到警告。是否要把限制下沉到伺服器端強制執行，仍是未決事項。

OAS 第 103 行（v0.4.0 changelog）明白寫著：

> SG's `REDEEM` movementType is replaced by `PARTIAL_REDEEM`/`FULL_REDEEM` — a redemption may now
> release less than the SG's full outstanding balance.

把 Partial Redeem 講成一般可用、預期中的功能。但 `lc-balance/CLAUDE.md` 決策日誌 2026-08-21 的 BA 決議
是「A9 must be Full Redeem only」，且明確註記：

> Scope confirmed as **A9-only, reference-client (Angular) only** — the microservice's own
> `PARTIAL_REDEEM` movementType and `domain/shgtRedeem.ts`'s `checkRedeemSufficiency()` are unchanged and
> still accept a Partial Redeem **from any other direct API caller**.

**為什麼擋開放**：任何外部系統直接照這份 OAS 串接，完全合法地送出 `PARTIAL_REDEEM`，會拿到 `201`
成功——即使銀行業務政策已經改成「A9 只能全額贖回」。OAS 對這個業務政策轉折毫無記錄，是目前找到最具體、
最可能咬人的一條。

**建議**：在 `PARTIAL_REDEEM` 的 schema description 補一段明確的「known deviation」說明（微服務本身仍
接受，但 A9 這個業務功能的官方政策是 Full-Redeem-only，外部呼叫方應自行決定是否要在自己的閘道層強制這
個限制），或是把這個限制真正下沉到伺服器端變成可選的 request 層驗證。

---

### OAS-GAP-04 — 複合交易（多腿）失敗時的補償契約，完全沒有寫進合約

`POST /balance-movements/{id}/release` 的 description 明講：

> a business function whose approved design requires releasing several linked movements together...
> is the caller's own responsibility to sequence as that many separate calls to this endpoint, sharing
> the linked movements' common `businessEventId` for audit/query correlation **only**.

這句話講清楚了「不保證原子」，但完全沒講「第二腿失敗時，呼叫方應該做什麼」。

**來源證據**：Angular 端對 A3S 有做補償性 `cancel()`（`lc-balance/CLAUDE.md` 決策日誌：「A3S compound
Submit now auto-rolls-back the SG redemption leg if the LC UTILIZE leg fails」）——但這只是**參考實作
自己選的策略**，不是 OAS 規定外部呼叫方必須遵守的契約。

**為什麼擋開放**：外部系統重新實作 A3S/B4/B5 這類複合交易 pattern 時，完全沒有規格可以照著寫失敗處理
路徑——可能會出現「LC 腿失敗但 SG 腿孤兒地卡在 PENDING」這種銀行不樂見的中間態，且沒有標準做法補救。

**建議**：在每個 `compoundSubmission` 相關端點（`POST /balance-movements`）補一段「多腿失敗時的建議
補償順序」，並在回應 schema 補一個 `businessEventId` 層級的查詢輔助（例如「若某腿失敗，呼叫
`GET /balance-movements?businessEventId=` 找出已成功的腿並逐一 `cancel`」的明確步驟）。

---

### OAS-GAP-05 — Idempotency Key 沒有規定「payload 不一致」時該怎麼辦

> **🟡 文件面已部分處理（v1.17.0，2026-08-22）**：`eventSeq` 的 description 已經補上明確警語，講清楚
> 「只有 payload 也相同才安全，payload 不同時會靜默回傳舊紀錄」。**但實際行為本身沒有改變**——下方
> 「建議」列的兩個真正修法（payload hash 比對 + `409`，或 `isReplay` 欄位）都還沒實作，需要業務/架構
> 團隊先決策才能真的關掉這個坑，目前只是讓呼叫方讀得到警告。

OAS 第 756-758 行只寫：

> resubmitting the same (balanceContractId, eventSeq) pair returns the existing record (200) instead
> of erroring or double-counting.

這只涵蓋了**純重試**（payload 完全相同）的情境。若同一組 key 被重送、但這次帶的 payload 內容不一樣（真
正的衝突，不是單純重試），OAS 完全沒講會發生什麼——目前實際行為是**直接回傳原本的舊紀錄，新 payload
被靜默忽略**，連警告都沒有。

**來源證據**：`docs/obsidian-balance-kb-v3.2/` 的 `MAKER-CHECKER-RULE-050`（CONFLICT 標記）——設計文
件當年提過一個更嚴謹的 `DUPLICATE_REF_PAYLOAD_MISMATCH` 硬拒絕方案，但從未真的實作。

**為什麼擋開放**：外部呼叫方以為自己送出的新資料生效了（拿到 `200`，看起來成功），實際上舊紀錄原封不
動——這種靜默失敗對正式生產環境是高風險的。

**建議**：對外開放前必須明確決定並寫進合約：要嘛比對 payload hash、不一致時回傳
`409 DUPLICATE_REF_PAYLOAD_MISMATCH`；要嘛在 response body 明確加一個 `isReplay: boolean` 欄位，讓
呼叫方至少能分辨「這是我原本送的那筆」還是「這是別人先送的、跟我這次內容不同的那筆」。

---

### OAS-GAP-06 — `Error.code` 是 `type: string`，不是 `enum` ✅ 已解決（v1.17.0 schema + v1.18.0 實作）

> `Error.code` 已改成真正的 `enum`（7 個值）。`Error.details.reasonCode`（8 個值）v1.17.0 當下只加了
> schema，**但 `ApiError.toBody()` 從頭到尾只回傳 `{code, message}`，`details` 根本送不出去**——這是
> 外部覆核第四輪對照 `errors.ts` 才抓到的，跟 CURRENCY DERIVATION 同一種「文件寫得很肯定、實作完全不存
> 在」的錯誤，只是這次是我自己這輪引入的新問題，不是繼承自舊版本。已在 v1.18.0 修好：`ApiError` 新增
> `details` 建構子參數，5 個 sufficiency-check domain 函式 + CLOSE 的兩個檢查全部改為回傳 `reasonCode`，
> 逐一串接到對應的 `throw` 呼叫點（含 Release 時 CLOSE 的重新檢查）。三個子專案測試套件全部重跑過
> （微服務 425/425、backend 34/34、Angular 1064/1064），涵蓋率都在各自門檻之上才算完成。以下內容保留
> 作為歷史紀錄，說明原本的問題與判斷依據。

第 1735-1745 行的 `Error` schema（v1.17.0 之前的行號，供歷史對照）：

```yaml
Error:
  type: object
  required: [code, message]
  properties:
    code: { type: string }
    message: { type: string }
    details: { type: object, additionalProperties: true }
```

七種實際會出現的 code（`REQUEST_VALIDATION_FAILED`/`INSUFFICIENT_AVAILABLE_BALANCE`/
`NATURAL_KEY_ALREADY_EXISTS`/`CURRENCY_MISMATCH`/`ILLEGAL_STATE_TRANSITION`/`NOT_FOUND`/
`INTERNAL_ERROR`）全部只活在 `description` 的自由文字裡，schema 本身沒有 `enum` 約束。

**為什麼擋開放**：任何用這份 OAS 產生型別化 client SDK 的工具（如 openapi-generator）拿到的都是裸
`string`，沒有編譯期窮舉檢查。而且同一個 `INSUFFICIENT_AVAILABLE_BALANCE` code 在不同端點底下代表完
全不同的業務原因（A3 餘額不足 vs A10 Close 資格不符 vs A8 SG 額度超過），目前只能靠人讀 `message` 文
字分辨，沒有結構化的子欄位。

**建議**：這是清單裡成本最低、投報比最高的一項——(a) 把 `code` 改成真正的 `enum`；(b) 在
`details` 補一個標準化的 `reasonCode` 子欄位，區分同一個 top-level code 底下的不同業務原因
（例如 `details.reasonCode: 'SG_BALANCE_NOT_ZERO' | 'ACCEPTANCE_BALANCE_NOT_ZERO' |
'OPEN_EVENTS_EXIST'`，對應 A10/B6 Close 資格檢查的三個獨立條件）。

---

### OAS-GAP-10 — 實際存在的限流機制，OAS 完全沒有文件化（外部覆核新增，2026-08-22） ✅ 已解決（v1.17.0）

> 全部 8 個 `/balance-movements*` 端點已補上 `429` 回應 + `RateLimit-Limit`/`RateLimit-Remaining`/
> `RateLimit-Reset` response header 定義（先去 `app.ts` 確認限流真的掛在共用 path prefix 上，涵蓋全部
> 8 個操作，不是只有 create）。以下內容保留作為歷史紀錄。

`microservices/balance-component/src/app.ts:23`：

```ts
app.use('/balance-movements', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));
```

`/balance-movements`（Maker/Checker 寫入面：create/release/reject/cancel/maker-submit）掛了
`express-rate-limit`，120 次/60 秒，`standardHeaders: true` 表示回應裡真的會帶 `RateLimit-*` 系列
header。但 OAS 全檔對 `429` 回應、`RateLimit-*` header 隻字未提。

**為什麼是行為語意缺口**：這正是本提案自己方法論定義的落差類型（「schema 表達不出來、只能靠文件補」）
——只是這次是提案自己第一輪沒抓到。外部呼叫方如果沒讀原始碼，完全不會知道超過 120 次/分鐘會被拒絕，
也不知道可以從 `RateLimit-*` header 讀剩餘配額做退避（backoff）設計。

**建議**：在 `POST /balance-movements`（以及未來 OAS-GAP-02 新增的跨合約查詢端點，若也掛限流）補上
`429` 回應定義與 `RateLimit-Limit`/`RateLimit-Remaining`/`RateLimit-Reset` 三個 response header 的
schema 說明。

---

## P2 — 結構品質問題，不會直接出錯，但會拖慢外部團隊上手

### OAS-GAP-07 — Sufficiency-check 公式散落在多段 changelog 式 description 裡，沒有集中的決策表

`movementType → 充足性檢查形態`的完整對照（`checkUtilizeSufficiency` 兩層 vs `outstandingCapped` 單
層 vs `closeShaped`）分散在 v0.3.0、v0.7.0、v1.16.0 等好幾段 changelog 式自由文字裡，沒有一個地方把 16
個業務功能各自對應的公式整理成一張表——內容都在，但要讀者自己拼起來。

**建議**：把 `docs/obsidian-balance-kb-v3.2/11-Decision-Tables/movementtyperegistry-...`/
`sufficiency-check-registry-...` 這兩張已經整理好的表，轉成 OAS 的 `x-sufficiency-check-registry`
extension 區塊或連結出去的附錄文件，取代目前分散在 changelog 裡的敘述方式。

### OAS-GAP-08 — A1–A10/B1–B6 業務語彙本身不在這份合約裡（設計上如此，需要明確告知使用者）

外部 TF 業務系統若直接照這份 OAS 串接，完全看不到 A1/A9 這類業務代碼，必須自己維護一份跟 Angular
`balance-component.model.ts` 一樣的 `(functionCode) → (instrumentType, movementType)` 對照表。
`balance-component-channel-api.yaml`（Channel API）本來是設計來解決這個問題的，但目前仍只是規格，
未真正上線（見 `07-API/channel-api-is-a-spec-only-contract-not-a-running-service.md`）。

**建議**：在 microservice OAS 的頂層 `description`（目前已有的 CURRENCY DERIVATION 說明區塊旁）明確
加一句話，告知使用者「本合約是 instrument-agnostic 的底層合約，若需要以業務功能代碼（A1–B6）整合，
請改參考 `balance-component-channel-api.yaml`（目前為規格，尚未上線）」——避免外部團隊誤以為這份合約
本身就是業務層的整合入口。

### OAS-GAP-11 — 整份合約是純輪詢式設計，沒有討論事件推送（外部覆核新增，2026-08-22）

OAS-GAP-02 已經點出「查詢型」缺口（沒有跨合約待審核清單端點），但更根本的是：這整份合約從頭到尾都是
request/response 輪詢式設計，對真正要做即時對帳/待審核通知的外部貿易金融系統來說，長期看輪詢不是理想
架構——外部系統要嘛自己定期輪詢 `GET /balance-contracts/{id}/movements`，要嘛等 OAS-GAP-02 補上跨合約
查詢端點後改成較密集的輪詢，兩者都不是真正的即時通知。

**定位**：這是比 OAS-GAP-02 更長期的架構備註，不是要求現在就做 Webhook/事件推送，而是建議在補
OAS-GAP-02 的同時，把這個長期方向記錄下來，避免將來查詢端點的設計選擇（分頁方式、排序欄位）跟未來可能
要做的事件推送機制互相打架。

### OAS-GAP-12 — 沒有版本演進/棄用政策（外部覆核新增，2026-08-22）

OAS 本身已經迭代到 v1.16.0，而且如 OAS-GAP-07 指出的，行為變更多半以 changelog 散文形式記錄在
`description` 欄位裡，沒有正式的 SemVer 語意或破壞性變更（breaking change）通知政策——全檔 grep
`semver`/`deprecat`/`breaking change` 零命中。

**為什麼要現在決定**：這份合約現在的讀者是內部參考實作（Angular UI）和這幾輪對話裡的探索性審查；一旦
正式交給外部長期整合方，`info.version` 的每一次跳動都會變成別人系統的相容性風險。現在決定，比日後累積
了外部串接方之後才回頭補政策，成本低得多。

**建議**：定義最小可行的版本政策——(a) 明確 `info.version` 遵循 SemVer（MINOR 新增不破壞既有欄位，
MAJOR 才允許破壞性變更）；(b) 破壞性變更需要在 changelog 標明生效日期與棄用期（deprecation window）；
(c) 把現有分散在各端點 description 裡的 changelog 敘述，集中到一個獨立章節（可與 OAS-GAP-07 的
「集中決策表」建議一併處理）。

> **🟢 已有第一個實戰先例（v1.17.0，2026-08-22）**：OAS-GAP-06/GAP-10 落地時，即採用「MINOR、非破壞性、
> 純文件補強」的版本判斷（v1.16.0 → v1.17.0），並在 changelog 裡明講這個判斷邏輯本身。上方 (a)(b)(c)
> 三項正式政策仍未定案，但至少已經有一次真實案例可以參照，不是空談。

### OAS-GAP-13 — `GET /balance-contracts/{id}/movements` 無分頁、無伺服器端篩選（外部覆核新增，2026-08-22）

這個端點回傳一個合約底下的**完整**事件歷史，`newest first`，沒有 `page`/`pageSize`，也沒有
`status`/`businessEventId` 等篩選參數——對比之下，`GET /balance-contracts/catalog` 是有分頁的。

**來源證據**：OAS 自己的 changelog 明講這是刻意設計，不是遺漏——「REMOVED `GET
/balance-contracts/{balanceContractId}/movements`'s query filters (`status`/`legRef`/`businessEventId`/
`businessDate`) — the real endpoint takes none; every filter currently happens client-side on the full
result set」。也就是說：現在的行為完全符合文件描述，這不是「文件缺口」，而是「架構決策是否還適用」的
問題。

**為什麼值得列進來**：append-only、永不刪除的儲存模型下，一個存續很久、事件很多的合約（例如 Mixed
Tenor LC，大量分批事件）沒有任何文件化的回應大小上限。以目前的資料量大概不是問題，但正式對外開放、且
有外部呼叫方長期高頻查詢的情境下，這個假設可能不再成立。

**建議**：不是現在就要改——先向架構側提出這個問題，確認「目前無上限的完整回傳」在正式開放的資料量與
呼叫頻率下是否仍然可接受。如果確認要改，比照 `catalog` 端點已經有的分頁 pattern 加上去即可，不是新設計。

### OAS-GAP-14 — `BalanceMovement` 的七個 snapshot 欄位分散、可合併但不是正確性問題（外部覆核新增，2026-08-22）

`eventSnapshot`/`rootEventSnapshot`/`acceptanceEventSnapshot`/`sgEventSnapshot`/`finalizeEventSnapshot`/
`finalizeAcceptanceEventSnapshot`/`finalizeSgEventSnapshot`——七個獨立欄位，各自的 nullable 規則都各自
獨立文件化得很仔細，但七條規則要同時記在腦子裡，對寫 client SDK 的人是負擔。這七個欄位是七次獨立的漸進
式修補（v1.6.0～v1.10.0）疊加出來的，不是一次設計出的形狀。

**為什麼不是缺陷**：每個欄位本身都有清楚、正確的文件；這是設計品質觀察，不是正確性問題——**不影響本文
件其他 GAP 項目的優先度判斷**。

**建議**：不建議現在動——把七個欄位合併成一個 `relatedSnapshots: { self, root, acceptance, sg }` +
`phase: created|finalized` 判別欄位的物件，是一個真正的 breaking change（現有欄位名稱全部消失），只適
合規劃進下一個 MAJOR 版本，而且要先確認有沒有現存呼叫方依賴目前這七個獨立欄位名稱。列在這裡純粹是留下
記錄，避免將來設計 MAJOR 版本時，這七個欄位的歷史包袱被遺忘。

### OAS-GAP-15 — 找不到 `EXPIRE`（自然到期）對應的 movementType 或事件（外部覆核新增，2026-08-22）

> **⏸️ 本輪暫緩，列入下一輪計畫（2026-08-22）**：業務/架構側這輪尚未回覆，決策請求先保留在「已備妥待
> 轉發」狀態，不阻塞這輪 GAP-16/GAP-09 的落地工作。

> **⚠️ 待業務/架構確認，不是缺陷**：A10/B6 Close 的設計明確自比為「cancellation before expiry」——也就
> 是說，Close 是 Maker/Checker 觸發的**提前**結案，隱含存在一個對應的、日期觸發的**自然到期**流程。但
> 整份合約（15 個 `movementType` 值逐一核對過，見 OAS-GAP-06 新增的 enum）裡找不到任何 `EXPIRE` 或等效
> 事件。**這不代表一定是缺口**——自然到期完全可能是外部批次流程的職責，本來就不該經過這個 API。但目前
> 沒有任何一份文件（OAS、`CLAUDE.md`、Obsidian KB）明講答案是哪一個。

**建議**：這是一個需要直接問業務/架構側的問題，不是工程面能自己判斷的：「LC/Confirmation 的自然到期，
是由外部批次流程處理、完全不經過 Balance Component，還是這個微服務本來就該有、但目前尚未實作的一塊？」
確認答案之前不建議編號成正式的實作項目——先弄清楚這是不是真的需要做的事，比先假設它需要做更重要。決策
請求已備妥，見 `Natural-Expiry-Scope-Decision-Request.md`。

---

## 建議落地順序

| 順序 | 項目 | 決策負責單位 | 粗估工作量 | 狀態 |
|---|---|---|---|---|
| — | ~~OAS-GAP-16 — CURRENCY DERIVATION 該補實作還是改文件~~ | 業務 + 架構 → 後端 | 已完成 | ✅ 已完成（方向 (a)，OAS v1.19.0，見 ✅ OAS-GAP-16 小節「實作狀態」） |
| 0 | 確認 TF Solutions 租戶拓撲（單一機構 vs 多機構）——決定 OAS-GAP-09 的真實優先度 | 業務 | 小（1 次會議） | 🟢 決策請求文件已備妥（`TF-Solutions-Tenant-Topology-Decision-Request.md`），待轉發 |
| — | 確認自然到期（EXPIRE）是否屬於本合約範圍 — 決定 OAS-GAP-15 要不要成為正式項目 | 業務 + 架構 | 小（1 次會議，可與第 0 步併同一次討論） | 🟢 決策請求文件已備妥（`Natural-Expiry-Scope-Decision-Request.md`），待轉發 |
| 1 | OAS-GAP-01 + OAS-GAP-09（`securitySchemes` + 租戶/機構區隔模型，含「落地衝擊：現有內部呼叫方」的遷移範圍） | 資安 + 架構 | 中～大（拓撲已定案為多機構，範圍不會再縮小；仍卡在 GAP-01 認證機制選型未決定） | 🟢 決策請求文件已備妥（`Auth-And-Tenant-Isolation-Decision-Request.md`），待轉發——未動程式碼 |
| 2 | OAS-GAP-02（跨合約 Checker 待辦清單端點，設計時一併記錄 OAS-GAP-11 的長期方向） | 架構 + 前端 | 中 | ⬜ 未開始 |
| 3 | OAS-GAP-03（A9 UI 政策 vs API 實際行為的落差，含全面盤點是否還有類似落差） | 業務 + 架構 | 小～中（盤點階段小，若發現更多落差則視數量放大） | 🟡 文件面已補警語，行為/政策決策未落地 |
| 4 | OAS-GAP-06（`Error.code` 改 `enum` + `details.reasonCode`） | 後端 | 小 | ✅ 已完成（schema v1.17.0，實作接通 v1.18.0） |
| 5 | OAS-GAP-10（限流 429/RateLimit header 文件化） | 後端 | 小 | ✅ 已完成（v1.17.0） |
| 6 | OAS-GAP-04 / OAS-GAP-05（多腿失敗補償契約、idempotency payload-mismatch 語意） | 業務 + 架構 | 中（需要先做政策決策，才能回頭寫進合約與程式碼） | 🟡 GAP-05 文件面已補警語；GAP-04 未開始；兩者行為本身都未變 |
| 7 | OAS-GAP-12（版本演進/棄用政策） | 架構 | 小 | 🟡 已有 v1.17.0 一次實戰先例，正式政策 (a)(b)(c) 三項仍未定案 |
| 8 | OAS-GAP-07 / OAS-GAP-08（文件結構調整，優先度最低，可與其他項目並行） | 技術寫作 | 小 | ⬜ 未開始 |
| 9 | OAS-GAP-13（`GET .../movements` 分頁/篩選——先確認是否需要，不預設要做） | 架構 | 小（確認階段）～中（若確認要做） | ⬜ 未開始（先問架構側） |
| 10 | OAS-GAP-14（七個 snapshot 欄位整併為 `relatedSnapshots`） | 架構 | 大（breaking change，只適合規劃進下一個 MAJOR 版本） | ⬜ 不建議現在做，僅留紀錄 |

工作量為粗略量級（小/中/大），不精算到人天；重點是標出「這項卡在誰手上」，讓文件從分析報告更進一步變
成可以直接排進 sprint 的行動清單。

**範疇邊界**：本文件範疇止於「合約落差辨識與落地優先順序」，不包含：(a) 具體 schema 修改的實際
diff／PR，(b) 落地後的驗收測試策略（例如未授權呼叫確實被拒絕、跨機構資料確實隔離的測試案例）。這兩項
建議在對應項目進入實作階段時，各自另立文件追蹤。待 OAS-GAP-01/09 的認證與租戶模型決策拍板後，下一版
本可考慮附上 `securitySchemes` 區塊與租戶區隔欄位的草擬 OAS diff，供架構團隊直接對著具體改動討論。

---

## 附錄：查證方式（供覆核）

本文件所有發現均可透過以下指令在 `lc-balance/` 目錄下重現：

```bash
# OAS-GAP-01／OAS-GAP-02：確認合約缺口
grep -n "security\|securityScheme\|bearerAuth\|apiKey" analysis/balance-component-api.yaml   # 零命中
grep -n "^  /" analysis/balance-component-api.yaml                                            # 12 條路徑，無跨合約 movements 清單端點

# OAS-GAP-03：A9 PARTIAL_REDEEM 矛盾
grep -n "PARTIAL_REDEEM\|FULL_REDEEM" analysis/balance-component-api.yaml

# OAS-GAP-06：Error.code 未 enum 化
sed -n '/^    Error:/,/^    [A-Za-z]/p' analysis/balance-component-api.yaml

# OAS-GAP-09：租戶/機構區隔缺失
grep -ni "tenant\|branch\|entityId\|businessUnit" analysis/balance-component-api.yaml         # 零命中

# OAS-GAP-10：限流機制存在但未文件化
grep -n "rateLimit(" microservices/balance-component/src/app.ts                               # 120 次/60 秒，掛在 /balance-movements
grep -n "429\|RateLimit" analysis/balance-component-api.yaml                                  # 零命中

# OAS-GAP-11／OAS-GAP-12：事件推送、版本政策
grep -ni "webhook\|semver\|deprecat" analysis/balance-component-api.yaml                      # 零命中
```

決策日誌交叉比對來源：`lc-balance/CLAUDE.md`（BAL-001/002、A3S 補償、A9 Full-Redeem-only 決議、
`Quality-report-balance.md` BAL-104 限流範圍決策）、`docs/obsidian-balance-kb-v3.2/02-Business-Rules/`
（MAKER-CHECKER-RULE-050 等 CONFLICT 標記規則）。OAS-GAP-09～12 為 2026-08-22 外部覆核新增，已獨立
複驗（見上方「審查與版本歷程」），非本文件原始查證範圍。
