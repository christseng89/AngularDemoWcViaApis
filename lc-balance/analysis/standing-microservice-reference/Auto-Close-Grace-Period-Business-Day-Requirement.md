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
