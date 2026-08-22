# 決策請求：CURRENCY DERIVATION 規則——補實作，還是改文件？

**發起依據**：`Balance Contract Integration Proposal.md` 的 OAS-GAP-16——優先度高於 P0 的一項，
外部覆核第三輪對照原始碼逐項核實後發現。
**請求對象**：業務側 + 架構側
**預期產出**：兩個互斥方向擇一（見下方），不需要事先準備簡報。

---

## 背景（1 分鐘版）

`analysis/balance-component-api.yaml` 從 v1.0.0 起就有一條篇幅最長、被引用最多的核心規則，叫
「CURRENCY DERIVATION」：除了真正全新的根合約以外，呼叫方應該省略 `currency` 欄位，伺服器會自動從既有
合約或父合約推導並校驗，不一致就拒絕（`409 CURRENCY_MISMATCH`）。

**這條規則在實際運行的微服務裡完全不存在。** 三個獨立角度核實過：

1. 錯誤類別定義檔（`errors.ts`）裡沒有 `CurrencyMismatchError`，`CURRENCY_MISMATCH` 這個 code 從未被
   拋出過。
2. 建立合約的程式碼（`createContract()`）對 `currency` 就是原樣存值，沒有任何推導或比對邏輯。
3. 實際生效的請求驗證（zod schema）把 `currency` 列為**每一次**請求都必填的欄位——跟文件說的「應該省
   略」完全相反。

**影響**：任何照文件老實實作的外部呼叫方（非根創建時省略 currency），每次呼叫都會被現行服務以
`400 currency is required` 拒絕。這不是邊界情況，是文件跟實作方向完全相反。

## 請回答的問題

**這條規則該怎麼收尾——服務端補實作追上文件，還是文件改寫成符合服務端現狀？**

| 方向 | 意涵 | 影響範圍 |
|---|---|---|
| **(a) 服務端補實作** | 真的寫 currency 推導/比對邏輯；zod schema 的 `currency` 改成非根創建時可選 | 真正的行為變更（新增 `409 CURRENCY_MISMATCH` 的真實觸發路徑）——需要完整回歸測試；Angular UI 目前每次都送 currency，不受影響，但新增的推導邏輯需要驗證 |
| **(b) 文件改成符合實作現狀** | 拿掉 CURRENCY DERIVATION 的三條推導規則和 `CURRENCY_MISMATCH`，改寫成「currency 每次呼叫都必填，服務端不做一致性檢查」 | 對外部整合方更誠實，零程式碼風險，但等於承認「currency 一致性保護」這個設計意圖從未真正落地——之後如果真的發生多幣別合約下 currency 打錯的情況，目前完全沒有防線，這個風險要業務方知情並接受 |

如果現階段還沒有明確答案，「先維持現狀（方向 b，文件改到符合實作），(a) 列為未來待評估項目」也是一個
可以接受的明確答案——重點是要有結論，不要讓 OAS 繼續保留一條無法兌現的核心規則。

## 這個答案會決定什麼

無論選哪個方向，`analysis/balance-component-api.yaml` 裡的 CURRENCY DERIVATION 區塊、`Error.code` 的
`CURRENCY_MISMATCH` 枚舉值、以及所有引用這條規則的欄位說明都需要跟著更新——目前這些地方已經加上「⚠️
已確認矛盾」的警告文字，但警告不是解法，只是暫時防止外部團隊被誤導。

## 不在這次決策範圍內的事

這次只需要選方向，不需要當場決定：
- (a) 方向的具體推導演算法細節（優先序、邊界情況）——工程設計階段的事
- (b) 方向的具體改寫文字——文件更新階段的事

---

*對應完整分析：`lc-balance/Balance Contract Integration Proposal.md` 的 OAS-GAP-16 小節。*
