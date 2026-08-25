# AUTO CLOSE — 營業日行事曆參考資料（F1 proposal §13.5 Phase 2）

**2026-08-26 已簡化（使用者指示）——不再是 `lc-balance-new/` Maturity Date 資料的複製版。** 這個資料夾
先前複製過兩份 `lc-balance-new/`（獨立、gitignored 的平行專案）的文件（一份 947 行、19 輪審閱的
Standing 微服務 OAS 設計＋它的原始決策請求，兩份都是為那個專案的 A6/B4 Calculated Maturity Date 功能
寫的）跟一份 8 國行事曆資料。兩份文件都已刪除，改成自己撰寫的
`Auto-Close-Grace-Period-Business-Day-Requirement.md`——針對 `lc-balance/` 實際需求全新撰寫，因為真正
的需求遠比那份 Maturity Date 資料的多方付款結算範疇（calendar role、combination rule、calendar
snapshot 版本控管）簡單很多：AUTO CLOSE 是單一銀行的背景批次作業，完全沒有交易對手，不是一筆付款。

## 這是給哪個批次用的——只給 AUTO CLOSE，不是 AUTO EXPIRY

詳見 `Auto-Close-Grace-Period-Business-Day-Requirement.md` 自己的說明——簡短版：AUTO EXPIRY 自己的寬限期
是日曆天（`mail_float_grace_days`），完全不需要營業日行事曆；只有 AUTO CLOSE 的 Grace Period
（`domain/autoCloseGracePeriod.ts`）才需要。

## 檔案

- `Auto-Close-Grace-Period-Business-Day-Requirement.md` — 實際需求：一個日期進去
  （`effectiveTo`）、一個固定的 N（營業日），一個行事曆（銀行自己的，沒有交易對手），一個布林值出來。
  說明 Phase 1（已上線，只排除週末）已經涵蓋的部分，以及 Phase 2 真正要補的東西——不需要新的
  request/response 形狀，只要在同一個 `addBusinessDays()` 函式形狀底下換上真正的假日清單。
- `calendars.json` — 一份本國（`TW`，台灣）行事曆，僅供示意的 **2026-2028** 週末/假日日期。已從原本的
  8 國＋清算行事曆＋機構行事曆裁剪過（AUTO CLOSE 沒有交易對手的概念，單一行事曆就是全部）。
  2026-08-26 從單一年度擴充為 3 年（使用者要求）：2026 的日期已對照真實星期幾／農曆日期（春節、
  端午、中秋）逐一核對；2027／2028 用同樣的月/日重複 2026 的型態（並非真正的農曆換算，僅供跨年度
  測試涵蓋範圍用），遇到週六/週日時順延到下一個平日——**除了**元旦（01-01）、和平紀念日／228
  （02-28）、勞動節（05-01）、國慶日（10-10）這四個固定日期的國定假日，永遠維持在同一天不順延。
  並非權威資料來源，實際使用前務必換成銀行真正的假日清單。

一個對應這個形狀、可以直接執行的 mock server 也已經建好：`microservices/business-days-mock/`（自己的
`package.json`／`server.js`／`data/calendar.json`／`README.md`）——只有 `POST /business-days/add` 這
一個端點，單一本國（`TW`）行事曆，port `4500`。**不是**複製 `lc-balance-new/microservices/
standing-mock`（那個做的是 `POST /business-days/adjust`，服務不同的 Maturity Date 功能）——是重新
寫的，形狀對應這份資料夾自己簡化後的需求。2026-08-26 已即時 smoke test（跨週末順延、真實 TW 假日
順延、`businessDays: 0`、400 驗證錯誤都驗證正確）。**尚未接進 `microservices/balance-component/`
本身**——Phase 1 那個同倉庫的週末限定 mock 仍在跑，這個 mock server 目前只是 Phase 2 的參考/開發
用素材。

## 這份資料是做什麼用的

供 BA 審閱 `lc-balance/` 自己 F1 §13.5 Phase 2（真正實作,尚未動工）用的參考資料，也還沒決定真正的
假日清單要接哪個資料來源。目前就是文件＋一份範例資料＋一個 mock server，範圍完全對應 AUTO CLOSE
實際需要的東西，不多不少。
