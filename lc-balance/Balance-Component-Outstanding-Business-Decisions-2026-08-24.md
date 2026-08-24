# 決策請求（會議用彙整）：Balance Component 目前僅存的三項業務決策

**發起依據**：2026-08-24 盤點 `lc-balance/` 所有決策請求文件與 `Balance Contract Integration Proposal.md`
的落地順序表後，確認除了以下三項，其餘全部已回覆結案（GAP-15 自然到期範圍、GAP-16 Currency Derivation、
GAP-09 租戶拓撲、GAP-06/GAP-10、Natural-Expiry 批次觸發的寬限期/容錯/帳號政策、Maturity Date UI 覆寫
問題一～五，逐一核對過原始碼或既有決策文件的回覆記錄）。這三項是**唯一**還沒有任何回覆的業務決策，彙整
成一份文件方便同一次會議一次問完。
**請求對象**：業務側 + 架構側（議題一另需資安側）
**預期產出**：三個議題各自一個明確答案，可分開回覆，不需要事先準備簡報或文件。

---

## 議題一：認證機制（GAP-01）＋ 租戶隔離技術方案（GAP-09）

這題已經有自己完整的一份決策請求文件，**內容直接沿用，不在這裡重複**：`Auth-And-Tenant-Isolation-Decision-Request.md`。

**現況摘要**（完整內容見該文件）：GAP-09 的拓撲本身已定案（多家分行/多家銀行，2026-08-22 業務回覆），
但技術方案還沒決定；GAP-01 完全沒有 `securitySchemes`，`releasedBy`/`makerSubmittedBy`/`createdBy` 都是
呼叫方自己填的自由文字，沒有身份驗證機制。兩題被判定要併同一輪決策（沒有認證，租戶隔離欄位加了也無法真
正限制呼叫方只能看自己機構的資料）。

**該文件請回答的兩個問題**：
1. 認證機制選哪一種——mTLS／OAuth2 client-credentials／API Gateway 簽章／內部閘道（如果暫時答不出來，
   「先選 (b) OAuth2 client-credentials 作為預設方向」是可接受的暫定答案）。
2. 租戶隔離的技術方案——欄位式（`BalanceContract` 加 `ownerEntityId`）還是 Gateway 路由式（可以晚於
   問題一回答，不需要同一次會議決定，但兩題答案最終要銜接得上）。

**影響**：回答後才能真正開始做 OAS 補上 `securitySchemes`、`releasedBy`/`createdBy` 改成從已驗證身份帶
入、租戶隔離 schema／查詢過濾設計、以及既有內部呼叫方（Angular UI／Business Case Runner）的同步改造。
這是目前積壓最久、影響面最大的一項。

---

## 議題二：A9 Full-Redeem-only 究竟是 UI 政策，還是 API 也該強制？（OAS-GAP-03）

### 背景

`lc-balance/CLAUDE.md` 決策日誌 2026-08-21 的業務決議是「A9 must be Full Redeem only」，Angular UI 也已
經照這個政策把 A9 的 Partial Redeem 選項拿掉。但這個限制**只存在於 Angular 這個參考前端**——微服務本身
的 `PARTIAL_REDEEM` movementType 跟 `domain/shgtRedeem.ts`（`checkRedeemSufficiency()`）完全沒有跟著鎖
住，任何直接呼叫這支 API 的外部系統，現在仍然可以合法送出 `PARTIAL_REDEEM` 並拿到 `201` 成功——即使業務
政策已經明講「A9 只能全額贖回」。OAS 文件本身在 v0.4.0 changelog 甚至把 Partial Redeem 講成一般可用、
預期中的功能，跟這條業務政策直接矛盾。目前（v1.17.0）只在 schema description 補了警語，讓外部整合方至
少讀得到這個落差存在，但實際行為完全沒變。

### 請回答的問題

**A9 的 Full-Redeem-only 政策，要不要下沉到伺服器端變成真正強制執行的規則？**

| 方向 | 意涵 | 影響範圍 |
|---|---|---|
| **(a) 下沉到伺服器端強制** | 微服務對 A9（SG 贖回）的 `PARTIAL_REDEEM` 直接拒絕（或至少該功能路徑下拒絕），任何呼叫方都無法繞過 | 真正的行為變更——需要判斷這條限制是「A9 這個 Angular 業務功能專屬」還是「SG Partial Redeem 這個 movementType 本身全面禁用」（後者影響範圍更大，可能誤傷未來合法的 Partial Redeem 使用情境，需要業務先確認）；需要完整回歸測試 |
| **(b) 維持現狀，只在 OAS 說明政策落差** | 微服務保持中立、允許 Partial Redeem，Angular UI 的限制純粹是這個參考前端自己的業務政策，不代表 API 契約本身禁止 | 零程式碼風險，但任何未來直接對接這支 API 的外部系統，都得自己決定要不要在自己的閘道層重新實作這個限制——目前 OAS 警語只能提醒、不能強制 |

**如果現階段還沒有明確答案**，「維持現狀（方向 b），(a) 列為未來待評估項目」也是一個可以接受的明確答案
——重點是要有結論，不要讓 UI 政策跟 API 實際行為的落差無限期存在。

### 這個答案會決定什麼

無論選哪個方向，OAS 的 `PARTIAL_REDEEM`／`FULL_REDEEM` schema description、v0.4.0 changelog 條目都需要
跟著更新成跟決定一致的說法。若選 (a)，還需要業務先確認前面提到的範圍問題（只鎖 A9 這個業務功能，還是
連 SG Partial Redeem 這整個 movementType 都鎖）。

### 不在這次決策範圍內的事

- 若選 (a)，具體怎麼判斷「這次呼叫屬不屬於 A9」（`businessEventId`？`sourceFunction`？）——工程設計階段
  的事
- 是否要盤點其他功能是否也有類似「UI 管、API 不管」的落差——這是本議題之外、值得另外排一次的稽核工作，
  這次先只處理 A9 這個已確認的具體案例

---

## 議題三：複合交易失敗補償契約（OAS-GAP-04）與 Idempotency Payload 不一致時的處理（OAS-GAP-05）

這兩項都是「合約沒把邊界情況講清楚，需要業務先定政策方向」的同類問題，併在一起問。

### 3a．多腿交易失敗時，呼叫方該怎麼補償？

**背景**：`POST /balance-movements/{id}/release` 的 OAS 說明已經講清楚「不保證原子性」——像 A3S/B4/B5
這類需要串接多個 `release()` 呼叫的複合交易，OAS 只說了呼叫方要自己依序呼叫、共用 `businessEventId` 作
查詢關聯，但完全沒有規定「第二腿失敗時，呼叫方應該做什麼」。Angular 參考前端自己對 A3S 做了補償性
`cancel()`（第一腿失敗自動回滾），但這只是這個參考實作自選的策略，不是 OAS 規定外部呼叫方必須遵守的
契約——外部系統重新實作同類複合交易時，完全沒有規格可以照著寫失敗處理路徑，可能出現「LC 腿失敗但 SG 腿
孤兒地卡在 PENDING」這種銀行不樂見的中間態。

**請回答的問題**：多腿交易其中一腿失敗時，標準補償順序該怎麼定義，要不要寫進 OAS 成為外部呼叫方必須遵
守的契約（例如：「若某腿失敗，呼叫 `GET /balance-movements?businessEventId=` 找出已成功的腿並逐一
`cancel`」這樣的明確步驟）？如果不寫進正式契約，也是一個可接受的答案，但需要業務知情並接受「外部系統各
自可能有不同的失敗處理方式」這個風險。

### 3b．Idempotency Key 重送但 payload 不一致時，該怎麼處理？

**背景**：OAS 目前只規定「同一組 `(balanceContractId, eventSeq)` 重送、payload 也相同」這種**純重試**情
境會回傳既有紀錄（`200`），不會出錯或重複計數。但如果同一組 key 被重送、這次 payload 內容不一樣（真正
的衝突，不是單純重試），OAS 完全沒講會發生什麼——目前實際行為是**直接回傳原本的舊紀錄，新 payload 被靜
默忽略，連警告都沒有**。外部呼叫方會誤以為自己這次送出的新資料生效了（拿到 `200`，看起來成功），實際上
舊紀錄原封不動——這種靜默失敗對正式生產環境是高風險的。設計文件當年（`MAKER-CHECKER-RULE-050`）提過一
個更嚴謹的 `DUPLICATE_REF_PAYLOAD_MISMATCH` 硬拒絕方案，但從未真的實作。目前（v1.17.0）只在 `eventSeq`
description 補了警語。

**請回答的問題**：payload 不一致時，要嘛比對 payload hash、不一致時回傳 `409
DUPLICATE_REF_PAYLOAD_MISMATCH` 直接拒絕；要嘛在 response body 加一個 `isReplay: boolean` 欄位，讓呼叫
方至少能分辨「這是我原本送的那筆」還是「這是別人先送的、跟我這次內容不同的那筆」——選哪一種？

### 這兩項的答案會決定什麼

3a／3b 都需要業務先做政策決策，工程才能回頭寫進 OAS 合約與程式碼——目前都只在文件層面補了警語，實際行
為都還沒變，對外開放前這兩項的靜默行為都算高風險。

### 不在這次決策範圍內的事

- 3a／3b 選定方向後的實際錯誤碼命名、response schema 細節、程式碼實作方式——工程設計階段的事
- 是否要對既有呼叫方（Angular UI／Business Case Runner）目前依賴舊行為的地方做相容性處理——確認方向後
  再評估，不是這次要決定的範圍

---

## 對外開放前的整體提醒

三項議題都跟「這份 API 對外部系統開放使用」直接相關——議題一（認證/租戶隔離）跟議題三（補償契約/
idempotency）都被 `Balance Contract Integration Proposal.md` 列為 P0（會直接擋掉正式對外開放，不只是文
件問題）；議題二（A9 政策落差）目前是 P2，風險較低但同樣代表 OAS 文件本身跟實際行為之間還有一個已知矛
盾未解決。三項互相獨立，可以分開回覆，不需要一次會議全部決定。

---

*對應完整落差分析：`lc-balance/Balance Contract Integration Proposal.md` 的 OAS-GAP-01／GAP-03／GAP-04／
GAP-05／GAP-09 各小節；議題一完整決策請求見 `Auth-And-Tenant-Isolation-Decision-Request.md`。*
