# AUTO CLOSE — 營業日行事曆需求（F1 proposal §13.5，2026-08-26 簡化重寫）

這份文件是針對 `lc-balance/` 自己實際需求全新撰寫的，**不是**從 `lc-balance-new/` 抄過來的。之前曾複製
過那個專案的 Maturity Date OAS 設計文件（947 行、19 輪審閱）跟對應的決策請求文件，後來使用者親自指出
真正的需求簡單很多——那份文件的多方付款結算範疇（calendar role、combination rule、calendar snapshot
版本控管）反而有把範疇不小心擴大的風險，因此已刪除，改成這份文件。同一個資料夾裡的 `calendars.json`
也依同樣理由裁剪過——只留一個本國（`TW`）行事曆，不是原本的八國版本。

## 這是給哪個批次用的——只給 AUTO CLOSE，不是 AUTO EXPIRY

`lc-balance/` 的 F1 功能有兩個獨立的背景批次，只有其中一個需要營業日行事曆：

- **AUTO EXPIRY** — 由 `mail_float_grace_days` 把關（純**日曆天**數，`domain/expiryEligibility.ts` 的
  `isPastExpiryGrace()`）——已經實作完成，跟這份文件無關，不涉及也不需要任何營業日/假日判斷。
- **AUTO CLOSE** — 由 **Auto Close Grace Period** 把關（`domain/autoCloseGracePeriod.ts` 的
  `isPastAutoCloseGrace()`）——`Business Date > effectiveTo + N 個**營業**日`。這是 `lc-balance/` 裡
  唯一需要營業日行事曆的地方。Phase 1（已上線）是同倉庫內建的「只排除週末」mock；這份文件就是給
  真正的 Phase 2 用的需求。

## 從頭到尾，實際要問的問題

一個問題，一個背景批次作業，一次只問一張合約：

> 「這張合約在時間 T（`effectiveTo`）變成 EXPIRED（或被 Reopen 又打回 EXPIRED）。只算銀行自己的
> 營業日，從 T 到現在，是否已經過了 N 個營業日？」

就這樣。沒有交易對手、沒有付款腿、沒有多方清算、不需要判斷「哪一方要開門」。就是：一個日期
（`effectiveTo`）、一個整數（`N`，固定的 config 常數 `AUTO_CLOSE_GRACE_PERIOD_BUSINESS_DAYS`）、一個
行事曆（銀行自己的），一個布林值答案。

## 明確不需要的東西（對比被取代的那份 Maturity Date 設計文件）

- **不需要交易對手／付款行行事曆。** AUTO CLOSE 從頭到尾不涉及第二方——這是銀行自己帳上的一個純內部
  狀態轉換，不是一筆付款。單一行事曆（銀行自己那份）就是全部。
- **不需要 combination rule**（`ALL_REQUIRED_OPEN`／`ANY_ELIGIBLE_OPEN`）。這個概念本來是為了協調
  多方行事曆而存在的——只有一份行事曆，這件事根本不成立。
- **不需要 calendar role**（`PAYING_BANK`／`ISSUING_BANK`／`CURRENCY_CLEARING` 等）。角色是用來標記
  某份行事曆代表結算的哪一腿——這裡沒有結算這回事。
- **不需要歷史行事曆快照／版本控管。** 這個判斷永遠是「以現在生效的行事曆，問現在」——不需要重建
  某個過去日期當時的行事曆長什麼樣子，這點跟一筆付款必須按當初成立時的行事曆判斷不一樣。
- **不需要跨行 Business Day Convention**（Following／Modified Following／Preceding）去湊出某個特定
  日期。這不是在算一個「必須落在特定某天」的到期日——只是單純「往前數 N 個營業日，現在是否已經過了
  那個日期」，`domain/autoCloseGracePeriod.ts` 的 `addBusinessDays()` 現在就是這樣實作的（目前只排除
  週末；Phase 2 只需要換掉函式本體換上真正的假日清單，函式形狀不用變）。

## Phase 2 實際上只需要在 Phase 1 既有基礎上加什麼

Phase 1（已上線）的形狀已經是對的——`addBusinessDays(date, n)` ／
`isPastAutoCloseGrace(effectiveTo, graceBusinessDays, asOf)`——現在唯一缺的是真正的公眾假日（目前只
排除週六週日）。Phase 2 範圍很窄：讓 `addBusinessDays()` 拿到銀行自己這一份行事曆真正的假日清單，
資料來源可以是（真正的 Standing 微服務——如果將來真的為了這個功能建一個的話；一份 config 檔；一個
排程資料饋送）——這是真正要做的時候才決定的實作選擇，這份文件不預先拍板。不管資料來源是什麼，
需要回答的形狀就只是：

```
addBusinessDays(date: Date, n: number, calendar: { weekendDays: string[]; holidays: string[] }): Date
```

——一個日期進去，一份小小的行事曆進去（週末天＋一份純日期的假日清單，正好就是這個資料夾裡
`calendars.json` 單一 `TW` 那筆的形狀），一個日期出來。這個功能不需要比這更多的 request/response 包裝。

## 範例資料

`calendars.json`（同資料夾）——一份本國（`TW`，台灣）行事曆，僅供示意的 2026 週末/假日日期。並非
權威資料來源，實際使用前務必換成銀行真正的假日清單。


---

## Phase 2 設計強化：統一 `isBusinessDay()` 判斷 + Special Working Day Override（2026-08-26，業務端補充，BA 記錄）

使用者針對「先查週末、還是先查假日」這個問題，提出了更完整的 Trade Finance 作業日判斷設計，指出
單純固定順序（不管哪一種）都不夠，銀行系統還需要支援「補班日」选類例外。這一節記錄完整的補充需求，
供 Phase 2 真正實作時參考。

### 為什麼「先查週末」或「先查假日」都不是完整答案

上一輪 BA 複查發現 `domain/domesticCalendar.ts`（A1/B1 Expiry Date 檢查）跟
`microservices/business-days-mock/server.js`（AUTO CLOSE 參考用 mock）兩邊查詢順序不一樣（前者
先查假日、後者先查週末），純粹只影響「拒絕訊息文字」，不影響是否放行的結果。但使用者指出這個
「先查誰」的問題本身問錯了方向——**真正該問的是「有沒有補班日 Override」，而不是週末跟假日誰先查**。
如果某個週六被指定為補班日（例如颱風假後補班、或政府調整放假），單純的「Saturday/Sunday → 一律非
營業日」規則會直接判斷錯誤，不管週末檢查放第一還是第二都一樣錯——因為根本沒有查過 Override『

### 建議的判斷優先順序

```
1. 特殊營業日／補班日（Special Working Day / Working Day Override）
2. 法定假日／銀行假日（Holiday Calendar）
3. 一般週末規則（Weekend Rule）
4. 其餘日期 = 營業日
```

判斷邏輯：

```
if 日期被設定為 Special Working Day
    → BUSINESS DAY
else if 日期存在 Holiday Calendar
    → NON-BUSINESS DAY
else if 日期符合 Weekend Rule
    → NON-BUSINESS DAY
else
    → BUSINESS DAY
```

**範例**：`2026-10-10` 是星期六，但若該年度行事曆把這天設為補班日（`Special Working Day`），
正確答案應該是 `BUSINESS DAY`，而不是單純因為「星期六」就判定為非營業日。

### 建議的 Calendar 資料設計——每個日期可帶明確 Override

| 日期設定                 | 判斷結果 | 優先級 |
| ------------------------ | -------- | -----: |
| `WORKING_DAY_OVERRIDE`   | 營業日   |   最高 |
| `HOLIDAY`                | 非營業日 |   第二 |
| `WEEKEND`                | 非營業日 |   第三 |
| 沒有設定                 | 營業日   |   預設 |

週末規則本身也不應該寫死「只有星期六、星期日」——應按國家／銀行／分行配置（不同市場可能有不同的
週末安排）。

### Trade Finance 系統裡不只一處需要「今天是不是營業日」——而且未必是同一份行事曆

| 作業                       | 建議使用的行事曆                 |
| -------------------------- | -------------------------------- |
| AUTO EXPIRY／AUTO CLOSE     | 該 LC 所屬銀行／分行的行事曆      |
| Acceptance Maturity Date    | 本行與付款地／對手行相關的行事曆  |
| Operation／Payment Date     | 本行、幣別清算及對手行行事曆      |
| SWIFT 發送或交易處理        | 本行營業日曆                      |
| Currency Settlement         | 相應幣別的清算市場行事曆          |

這跟這份文件最上面「AUTO CLOSE 不需要交易對手／付款行行事曆」的結論並不衝突——AUTO CLOSE 本身
確實只需要單一行事曆，上面這張表列出的是「`lc-balance/` 之外，Trade Finance 整體還有其他作業也需要
問同一種問題（是不是營業日），但可能要問不同的行事曆」，屬於長期架構層級的觀察，不是要 AUTO CLOSE
自己去處理多行事曆的協調。

### 長期建議：統一走 `calendarService.isBusinessDay(date, calendarIds)`，而不是每個微服務各自土法煉鋼

目前這個 repo 裡實際上已經有三份各自獨立、寫法不完全一致的「是不是營業日」邏輯：
`domain/autoCloseGracePeriod.ts`（Phase 1，只排除週末）、`microservices/business-days-mock/
server.js`（AUTO CLOSE 參考 mock，週末優先）、`domain/domesticCalendar.ts`（A1/B1 Expiry Date
檢查，假日優先）——外加 Angular 手動同步的第四份副本 `domestic-calendar.ts`。三份都不支援
Special Working Day Override，且彼此順序不一致這件事本身就是「各自土法煉鋼」的直接後果：沒有一個
共同的服務可以問，每個地方就會各自寫一份、各自做出（可能不一致的）選擇。

長期設計方向應該是統一呼叫：

```
calendarService.isBusinessDay(date, calendarIds)
```

而不是讓每個微服務／每個功能自己各寫一份 `isWeekend(date)` / `isHoliday(date)`。

### 現階段（Phase 1／這份文件描述的 Phase 2 範圍）務實的中間做法

目前系統還沒有補班／特殊營業日機制的情況下，第一階段可以先檢查週末、再查假日（以減少查詢，效能
考量），這跟 `business-days-mock/server.js` 目前的做法一致，不需要現在就為了这个而重构。但長期設計
仍應以「統一 Calendar Service 的 `isBusinessDay()` 最終判斷結果」為準，並且優先順序要把
Special Working Day Override 放在最前面——這是正確性問題，不是效能問題，跟「先查週末還是先查假日」
的效能取捨是兩件不同層次的事，不能混為一談。

**結論**：這一節記錄業務端對 Phase 2（以及未來可能跨多個 Trade Finance 作業共用的 Calendar Service）
的完整設計期望，供工程team之後真正動手實作時參考。目前 Phase 1（`autoCloseGracePeriod.ts`）與
A1/B1 的 `domesticCalendar.ts` 都還沒有 Special Working Day Override 機制，不列為現階段阻擋項，
但正式做 Phase 2／統一 Calendar Service 時，Override 機制應該是設計的第一優先順序，而不是事後才加。
