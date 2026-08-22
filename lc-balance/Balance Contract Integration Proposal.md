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

（2026-08-22 更新：經過一輪外部覆核，原本 8 項發現 [OAS-GAP-01～08] 全部逐條複驗屬實，另新增 4 項
[OAS-GAP-09～12]——詳見上方「審查與版本歷程」。）

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
`createdBy` 改成從已驗證的呼叫方身份（token claim）帶入，而非請求 body 裡的自由文字。

---

### OAS-GAP-09 — 完全沒有租戶/分行/機構區隔欄位（外部覆核新增，2026-08-22）

> **⚠️ 待業務確認**：本項的 P0 定級前提是「TF Solutions 需要對接多家分行或多家銀行」——這是覆核當下
> 的假設，尚未跟業務側確認過。若 TF Solutions 實際上只對接單一機構，本項可降級為 P1 甚至延後至第二個
> 外部串接方出現時再處理。**啟動本項工作前的第一個動作項，是確認 TF Solutions 的租戶拓撲，而不是直接
> 假設多租戶並開始設計**——見下方「建議落地順序」的第 0 步。

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

### OAS-GAP-06 — `Error.code` 是 `type: string`，不是 `enum`

第 1735-1745 行的 `Error` schema：

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

### OAS-GAP-10 — 實際存在的限流機制，OAS 完全沒有文件化（外部覆核新增，2026-08-22）

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

---

## 建議落地順序

| 順序 | 項目 | 決策負責單位 | 粗估工作量 |
|---|---|---|---|
| 0 | 確認 TF Solutions 租戶拓撲（單一機構 vs 多機構）——決定 OAS-GAP-09 的真實優先度 | 業務 | 小（1 次會議） |
| 1 | OAS-GAP-01 + OAS-GAP-09（`securitySchemes` + 租戶/機構區隔模型，含「落地衝擊：現有內部呼叫方」的遷移範圍） | 資安 + 架構 | 中～大（視第 0 步的租戶模型決策而定，含 Angular UI／Business Case Runner 同步改造） |
| 2 | OAS-GAP-02（跨合約 Checker 待辦清單端點，設計時一併記錄 OAS-GAP-11 的長期方向） | 架構 + 前端 | 中 |
| 3 | OAS-GAP-03（A9 UI 政策 vs API 實際行為的落差，含全面盤點是否還有類似落差） | 業務 + 架構 | 小～中（盤點階段小，若發現更多落差則視數量放大） |
| 4 | OAS-GAP-06（`Error.code` 改 `enum` + `details.reasonCode`） | 後端 | 小 |
| 5 | OAS-GAP-10（限流 429/RateLimit header 文件化） | 後端 | 小 |
| 6 | OAS-GAP-04 / OAS-GAP-05（多腿失敗補償契約、idempotency payload-mismatch 語意） | 業務 + 架構 | 中（需要先做政策決策，才能回頭寫進合約與程式碼） |
| 7 | OAS-GAP-12（版本演進/棄用政策） | 架構 | 小 |
| 8 | OAS-GAP-07 / OAS-GAP-08（文件結構調整，優先度最低，可與其他項目並行） | 技術寫作 | 小 |

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
