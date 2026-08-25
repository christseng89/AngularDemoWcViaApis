# business-days-mock

一個刻意做得很簡單的營業日行事曆服務 mock，本地用——是為了 `lc-balance/` 自己的 F1 proposal §13.5
「Auto Close Grace Period」Phase 2（**只服務 AUTO CLOSE，不是 AUTO EXPIRY**，實際需求見
`../../analysis/standing-microservice-reference/Auto-Close-Grace-Period-Business-Day-Requirement.md`）
在 dev/demo 環境有個真的東西可以呼叫，不需要一個真正上線的外部服務。

**不是複製 `lc-balance-new/microservices/standing-mock`。** 那個 mock 是為另一個專案的另一個功能建的
（A6/B4 Calculated Maturity Date——一個多方付款結算計算，需要 calendar role、combination rule、
Business Day Convention）。AUTO CLOSE 完全沒有交易對手——是單一銀行的背景批次作業，不是一筆付款——
所以這個 mock 刻意不做那些東西：一個行事曆、一個端點、一個簡單的問題。

## 範圍

**只**實作 `POST /business-days/add`——給一個日期加上 N 個營業日，只排除單一本國行事曆
（`data/calendar.json`，台灣，僅供示意的 **2026-2028** 資料——**並非權威資料來源**，實際使用前務必換成
銀行真正的假日清單）自己的週末與公眾假日。

**2026-08-26 擴充為 3 年（使用者要求）**：2026 的日期已對照真實星期幾／農曆日期（春節、端午、中秋）
逐一核對過；2027／2028 用同樣的月/日重複 2026 的型態（並非真正的農曆換算，僅供跨年度測試涵蓋範圍
用），但遇到週六/週日時**順延到下一個平日**——**除了**元旦（01-01）、和平紀念日／228（02-28）、
勞動節（05-01）、國慶日（10-10）這四個固定日期的國定假日，這四個永遠維持在同一天，即使剛好落在
週六/週日也**不順延**（本來就已經被 `weekendDays` 排除，不需要另外補假）。

不實作、且明確不在這個功能的範圍內（不是延後,是根本不需要）：`POST /business-days/adjust`
（對一個已知日期做行事曆調整,那是 Maturity Date 的用途）、任何多行事曆／角色／combination rule 的
概念、行事曆快照版本控管、身份驗證、correlation-ID/重試機制。

## 執行

```bash
cd microservices/business-days-mock
npm install
npm start          # 或 npm run dev 啟用 --watch 自動重啟
```

監聽 port `4500`（可用 `PORT` 環境變數覆蓋）——跟這個專案自己的 `4100`（balance-component）／`4200`
（Angular）／`4300`（backend）不同，也跟 `lc-balance-new/microservices/standing-mock` 自己的 `4400`
不同，以防兩邊哪天真的要在同一台機器上同時跑。

## 範例

```bash
curl http://localhost:4500/business-days/add -X POST -H "Content-Type: application/json" -d '{
  "date": "2026-01-08",
  "businessDays": 2
}'
```

`2026-01-08` 是星期四；+2 個營業日會落在星期一 `2026-01-12`，中間跳過週末。預期結果：
`{"adjustedDate":"2026-01-12", "skippedDates":[{"date":"2026-01-10","reasonCode":
"WEEKEND",...},{"date":"2026-01-11","reasonCode":"WEEKEND",...}], ...}`。

## 現況

**尚未接進 `microservices/balance-component/`**——Phase 1 那個同倉庫的週末限定 mock
（`domain/autoCloseGracePeriod.ts` 的 `addBusinessDays()`）目前還是照跑不變。這是給 Phase 2 用的
參考/開發素材，形狀跟那個函式一致（日期進、營業日數量進、日期出）——將來真正做 Phase 2 的人，只需要
把那個函式的本體換成呼叫這種形狀的 HTTP 服務（或真正的外部服務），函式簽名不用變。
