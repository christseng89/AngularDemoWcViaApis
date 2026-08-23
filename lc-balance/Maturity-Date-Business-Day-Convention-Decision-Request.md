# 決策請求：A6/B4 Calculated Maturity Date 的 Business Day Convention 怎麼定

> **✅ 已回覆（2026-08-23）**：業務與技術團隊決定新增一個獨立的外部 Standing 微服務負責 Business Day
> Convention／假日曆計算，GAP-15 的既有分工（假日曆邏輯不進 Balance Component）不變——實質上是下方選項
> (c) 的落地方式，但假日曆邏輯放進另一個專責的外部服務，而非 Balance Component 自己接一份假日曆。
> 詳細業務規則、資料模型與 OAS 設計見 `analysis/maturity_date/`（`Standing_Microservice_Maturity_Date_OAS_Design.md`
> v2.10.0、`standing-calendar-service.oas.yaml`）。Balance Component 端只需算出 `sourceDate`（候選
> Maturity Date，Base Date + Tenor，UCP 600 Art. 3 from/after 起算規則），呼叫 Standing 的
> `POST /business-days/adjust` 取回 `adjustedDate`（Operational Payment Date）；回應固定帶
> `contractualDateChanged: false`，Contractual Maturity Date 本身永遠不因這次呼叫而改變。此決策記錄僅
> 解除 A6/B4 的阻塞狀態，實作本身（含開發環境是否先用本地 Mock Server 對接）留待後續排入，詳見
> `analysis/A1-A10-B1-B5-Date-Control-Function-Revision-Spec.md` 第十版。以下原始問題與選項保留作為決策
> 過程的歷史記錄。

**發起依據**：`analysis/A1-A10-B1-B5-Date-Control-Function-Revision-Spec.md` §2/§3——實作 A6（Acceptance
Usance）/B4（Usance 分支 `ACCEPT`）的 Calculated Maturity Date 邏輯時發現的開放問題，不是已確認的缺陷。
**請求對象**：業務側（可能也需要法遵/交易確認）
**預期產出**：一個明確答案（見下方「請回答的問題」），不需要事先準備簡報或文件。

---

## 背景（1 分鐘版）

`A1-A10-B1-B5-Date-Control-Function-Revision-Spec.md` §2/§3 目前規劃：A6/B4 Usance 分支的 Maturity Date
應該有一個系統計算出來的預設值——

```
Calculated Maturity Date = Acceptance Date + tenorDays + Business Day Convention
```

（審查文件 §6.1；UI 唯讀顯示，Maker 勾選「手動調整」+ 填寫理由才可覆寫，覆寫值連同理由存進
`BalanceMovement` 的新欄位 `maturityDateOverrideReason`）。

但 **Balance Component 微服務完全沒有假日曆**——GAP-15 已經定案（見
`Natural-Expiry-Scope-Decision-Request.md`）：排程/計日相關邏輯（`floatDays`/`holidayCalendar` 這類參數）
是**外部系統**的職責，不是 Balance Component 自己要管的事。這代表「Business Day Convention」這半句話，
微服務目前完全沒有能力真正落地——沒有假日曆，就沒辦法判斷「這天是不是營業日」，自然也沒辦法「順延到下一
個營業日」。

這不是新問題，而是 GAP-15 那個既定分工，第一次在一個**具體工程細節**上撞到牆——這次是 A6/B4 的 Maturity
Date 計算，需要業務側明確一個方向，才能繼續照 spec 往下做。

## 請回答的問題

**Calculated Maturity Date 遇到非營業日（週末、國定假日）時，該怎麼處理？**

| 選項 | 說明 | 工程範圍 |
|---|---|---|
| **(a) 純日曆天數相加，不做任何假日判斷** | `Maturity Date = Acceptance Date + tenorDays`，不管算出來是不是假日；UI/文件明確標註「未考慮假日，僅供參考，Maker 應自行核對後視需要手動調整」 | 最小工程量，跟 GAP-15 既有分工完全一致（假日/排程邏輯不進微服務） |
| **(b) 加上週末順延（不含國定假日）** | 遇到週六/週日順延到下一個週一，但不知道任何國定假日 | 需要一個簡單的「是否為週末」判斷，仍然不完整（漏掉國定假日）——**風險**：這種「半套」的順延邏輯容易讓 Maker/Checker 誤以為系統已經正確處理了假日，反而比完全不處理更容易造成誤判 |
| **(c) 真正的 Business Day Convention（Following / Modified Following / Preceding）** | 需要一份真正的假日曆（哪個市場？哪個幣別對應哪個清算中心的假日？） | 這其實會推翻 GAP-15 已經定案的分工——排程/假日曆邏輯本來就決定是外部系統的事，若要在微服務內做，等於局部改變那個決定，需要重新討論範疇，工程量遠大於 (a)/(b) |

（如果現階段還沒有明確答案，「先選 (a)，之後真的需要時再升級」也是一個可以接受的暫定答案——重點是要有
方向可以繼續往下做 A6/B4，不需要每個細節都現在拍板。）

## 這個答案會決定什麼

| 回答 | 對 A6/B4 落地的影響 |
|---|---|
| 選 (a) 或 (b) | Calculated Maturity Date 可以按現有 GAP-15 分工繼續實作，不需要額外討論範疇問題 |
| 選 (c) | 需要回頭跟 GAP-15 的既有決定對齊——要嘛微服務真的要接一份假日曆（跟「排程邏輯是外部系統職責」的既定分工衝突，需要重新討論），要嘛請外部系統把算好的 Maturity Date 直接傳進來（Balance Component 只負責存、不負責算，UI 上就沒有「系統計算預設值」這件事了） |

## 不在這次決策範圍內的事

- 如果選 (c)，假日曆的實際資料來源/維護方式（哪個廠商、多久更新一次）——這是另一個需要找對應團隊才能
  回答的問題
- `maturityDateOverrideReason` 的 UI 呈現細節（Checker 端怎麼顯示覆寫理由）——不受這個決策影響，維持
  spec 原規劃，留給前端設計階段
- Tenor 一致性檢查（`tenorRouting.ts`）——與 Maturity Date 計算是兩件獨立的事，這次決策不影響它

---

*對應規格：`lc-balance/analysis/A1-A10-B1-B5-Date-Control-Function-Revision-Spec.md` §2（A6）/§3（B4）。
相關既定分工：`Natural-Expiry-Scope-Decision-Request.md`（GAP-15，排程/假日邏輯的既有範疇決定）。*
