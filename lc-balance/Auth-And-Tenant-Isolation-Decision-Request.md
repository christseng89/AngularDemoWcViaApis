# 決策請求：認證機制（GAP-01）＋ 租戶隔離技術方案（GAP-09）

**發起依據**：`Balance Contract Integration Proposal.md` 建議落地順序第 1 步——OAS-GAP-01 與
OAS-GAP-09 已判定併同一輪決策，不建議分開處理（見下方「為什麼兩個問題綁在一起問」）。
**請求對象**：業務側 + 資安側 + 架構側
**預期產出**：兩個問題各自一個答案（見下方「請回答的問題」）。第二題若當下答不出來，也有「先開最小範圍」的退路可用，不需要當場把技術細節定案。

---

## 背景（1 分鐘版）

**GAP-01**：`analysis/balance-component-api.yaml` 全檔沒有任何 `securitySchemes` 定義——`releasedBy`/
`makerSubmittedBy`/`createdBy` 這些欄位目前都是呼叫方自己填的自由文字，沒有機制驗證真正操作者身份。

**GAP-09**：資料模型是單一全域命名空間，沒有欄位標示「這筆合約屬於哪個分行/哪家銀行」。**這一項的拓撲
本身已經定案**——業務側已確認 TF Solutions 需要對接多家分行/多家銀行（見
`TF-Solutions-Tenant-Topology-Decision-Request.md`）。

**兩者現在卡在一起的原因**：沒有認證，就算加了「哪個機構」的欄位，也無法真正限制「這個呼叫方只能看自己
機構的資料」，因為根本不知道呼叫方是誰；反過來，認證機制的選型（尤其是 token 裡要不要帶機構識別）也會
直接決定租戶隔離該怎麼設計。分開做，其中一項極可能要在另一項定案後重工。

## 請回答的問題

### 問題 1：認證機制選哪一種？

| 選項 | 說明 | 對租戶隔離的影響 |
|---|---|---|
| **(a) mTLS（雙向 TLS 憑證）** | 每個呼叫方持有由銀行/內部 CA 簽發的用戶端憑證，服務端驗證憑證身份 | 機構識別通常需要另外從憑證的 Subject/SAN 欄位解析，或另建一張「憑證 → 機構」對照表——租戶隔離的來源不是憑證本身 |
| **(b) OAuth2 client-credentials** | 每個呼叫方（每家分行/銀行）拿到自己的 client_id/secret，換取帶 scope 的 access token | 機構識別可以直接放進 token 的 claim 裡（例如 `entityId` claim），驗證時原生拿得到，租戶隔離的實作最直接 |
| **(c) API Gateway 簽章/內部閘道** | 呼叫方對 Gateway 認證，微服務本身只信任 Gateway 轉發的請求（例如簽章 header） | 機構識別可以在 Gateway 層就決定路由/加 header 轉發下去，微服務端做輕量驗證即可，但要多維護一層 Gateway 邏輯 |

（如果現階段還沒有明確答案，「先選 (b) OAuth2 client-credentials 作為預設方向，因為它讓後續的租戶隔離
設計最直接」也是一個可以接受的暫定答案——重點是要有方向可以往下推進工程設計，不是每個細節都要現在拍板。）

### 問題 2：租戶隔離的技術方案，欄位式還是 Gateway 路由式？

| 選項 | 說明 | 工程範圍 |
|---|---|---|
| **(a) 欄位式**——`BalanceContract` 加一個 `ownerEntityId`（或類似）欄位 | 微服務自己維護租戶邊界，每個查詢端點都要加過濾邏輯 | 需要 DB migration、每個 `GET`/`POST` 端點補過濾條件、`BalanceContract`/`BalanceMovement` schema 變更；跟 OAuth2 token claim 搭配最自然 |
| **(b) API Gateway 路由式**——微服務本身維持單租戶，隔離全部在 Gateway 層做 | 微服務程式碼幾乎不用改，隔離邏輯集中在 Gateway | 需要 Gateway 本身支援多租戶路由（例如每個機構獨立的路徑前綴或後端實例），但這超出目前這個微服務的範圍，是另一個系統的工作 |

這一題可以在問題 1 有答案後再回答，不需要同一次會議決定——但兩題最終要互相對得上（例如選了 (c) API Gateway 簽章，卻想用欄位式隔離，兩者要銜接的地方需要另外設計）。

## 這個答案會決定什麼

回答之後，才能真正開始做以下這些原本卡住的事：

- OAS 補上真正的 `securitySchemes` 定義（GAP-01）
- `releasedBy`/`makerSubmittedBy`/`createdBy` 從請求 body 的自由文字改成從已驗證身份帶入
- 租戶隔離的實際 schema/查詢過濾設計（GAP-09，若選欄位式）
- **既有內部呼叫方的同步改造**——Angular UI／Business Case Runner 目前都是以「無認證、單一命名空間」呼叫微服務，這兩項落地後也要跟著改，不是只有未來的外部串接方需要遵守新契約（詳見 `Balance Contract Integration Proposal.md` 的「落地衝擊：現有內部呼叫方」一節）

## 不在這次決策範圍內的事

- 認證機制的實際導入細節（憑證簽發流程、OAuth2 Authorization Server 選型、Gateway 產品選型）——這是後續工程/資安團隊的事
- 租戶隔離欄位的精確資料型別、索引設計——這是後續 DB 設計的事
- Angular UI／Business Case Runner 同步改造的實際排程——這是拿到問題 1/2 答案後才能估的事

---

*對應完整落差分析：`lc-balance/Balance Contract Integration Proposal.md` 的 OAS-GAP-01、OAS-GAP-09 小節，
以及「落地衝擊：現有內部呼叫方」一節。*
