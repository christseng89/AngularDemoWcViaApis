# BA MRG 裁定納入紀錄 — K4 / K5
撰寫：Claude · 日期：2026-09-12
依據：`qa/mt2/reports/BA-MRG-MT202-53A-RULING-20260912.md`，SHA-256 `752D40296DB19F56722E8CE312A92CA6BBDDBCFC57CD994B0E379A4195C50747`
本檔更新 `qa/reports/claude-independent-20260912/TEST-REPORT-v2.md` 之 K4、K5 與 P1。

---

## 1 · 裁定納入

| 項 | 原狀態 | 裁定後 |
|---|---|---|
| **K4**（generic 省略 53a） | 已驗證，待 BA 裁定 | **CONFIRMED DEFECT** |
| **K5**（generic 58A 無 Party Identifier） | 已驗證，待 BA 裁定 | **NOT A DEFECT — 關閉** |
| **P1**（53a 是否應輸出） | 待裁 | **已裁定，關閉** |

K5 關閉理由（BA）：generic MT202 之 58A Party Identifier 可省略；58A 帳號僅於 BOOK／Sender 自有帳戶情境強制。
本輪實測之 own-account 路徑確實輸出 `58A = "/<account>\nDEMOHKHH"`，與此裁定一致。

---

## 2 · MRG 錨點更正（我的錯誤）

**53a Usage Rules 位於 printed page 46，不是 p.45。**

我原先的抽取方式是讀到頁尾 "45" 後，把其後的文字歸給第 45 頁 —— 頁尾印在該頁**底部**，其後文字屬於**下一頁**。off-by-one。

已用 `pdftotext -layout -f <n> -l <n>` 逐頁重驗四個錨點（PDF SHA-256 `64483D7F7C094DB28E03791AB6BBC7A0522DAEC90487A7DD834228E848FA8323`）：

| 錨點 | 頁 | 驗證結果 |
|---|---|---|
| MT 202 Usage Rules（53B 借／58A 貸＋Sender） | **p.40** | ✔ 原判正確 |
| Field 53a Usage Rules（option B、多重帳戶關係） | **p.46** | ✘ 原寫 p.45，**已更正** |
| Field 57a Usage Rules（57a 缺席＝Receiver 為 AWI） | **p.52** | ✔ 原判正確 |
| Field 58a Usage Rules（option A 指明貸記帳戶與 Sender 名稱） | **p.54** | ✔ 原判正確 |

四個錨點中僅 53a 一個有誤，其餘不受影響。凡引用 p.45 之處一律改為 p.46。

---

## 3 · 實作警示：53B 的取值來源（高優先）

BA 裁定之正確輸出為：
```
A1  :53B:/DEMO-NOSTRO-001-PRIMARY
A2  :53B:/DEMO-NOSTRO-001-EXPCOLL
```

這兩個值等同 `chosenRoute.accountId`，即 **`accountReference`**。

但本輪實測（見 `probe-keytree.txt`）顯示，generic 路徑現行的帳戶渲染取的是 **`maskedAccountRef`**：

| 欄位 | A1 實測值 | 來源 |
|---|---|---|
| `chosenRoute.accountId` | `DEMO-NOSTRO-001-PRIMARY` | accountReference |
| `messageComposerContext.SttlmAcct.value` | `DEMO-NOSTRO-001-PRIMARY-PRIMARY` | maskedAccountRef |

兩者同為 `nostroId fe5d672f v4`。

→ **若 53B 的實作沿用現行 `SttlmAcct` 的取值來源，會輸出 `/DEMO-NOSTRO-001-PRIMARY-PRIMARY`，不符裁定。**
53B 必須取 `accountReference`（即 `chosenRoute.accountId`）。

這使原報告之 **K6**（同一 nostro 在兩路徑渲染成不同字串）從「一致性問題」升級為 **K4 修復的前置條件**。

---

## 4 · fail-closed 路徑的兩個待確認點

裁定：無法取得唯一有效 reimbursement account 時，DEVELOPMENT／DEMO 回 `409 INCORRECT_SSI_CONFIGURATION`，其他環境回 `500`，且不得產生 payload 或 confirmed resolution。

**Q1 · 「唯一有效」的判定是否涵蓋 `accountReference` 為 NULL 的情形？**
本輪 DB 實查：ACTIVE Nostro 共 163 列，其中 **69 列 `accountReference` 為 NULL**，另有 **42 組重複**。
若選中的 nostro 之 `accountReference` 為 NULL，現行渲染會回退 `maskedAccountRef`。
這算「取得了唯一有效帳號」還是應觸發 409？裁定文字未涵蓋，實作若不明訂會靜默擇一。

**Q2 · 500 路徑在受控環境永遠不會被測到。**
UAT 一律在 DEMO／DEVELOPMENT 執行，只會走 409。建議至少補一條單元測試覆蓋非 DEMO 環境的 500 分支，否則該分支無任何證據。
（附帶：對一個已知的業務條件回 500，與「未預期例外」在監控上難以區分 —— 這點僅供 BA 參考，不構成反對。）

---

## 5 · 尚未可重測

K4 之修復尚未進入程式碼（本輪 06:27 建置之 dist 仍省略 53a，無 rendering decision）。
待實作完成後，重跑 A1／A2 即可驗證，判準如下：

| 判準 | 期望 |
|---|---|
| `mt.tags["53B"]` | A1 = `/DEMO-NOSTRO-001-PRIMARY`；A2 = `/DEMO-NOSTRO-001-EXPCOLL` |
| `mt.omitted` | 不再含 `"53a"` |
| rendering decision | 須存在 53B 條目，含 `outcome`、`option: "B"`、`rule` |
| `mt.tags["58A"]` | A1 = `CITIUS33`；A2 = `CHASUS33`（維持無 Party Identifier，依 K5 裁定） |
| HTTP | 200 |
| 無唯一有效帳戶時 | DEMO/DEV → 409 `INCORRECT_SSI_CONFIGURATION`，且 `payloadGenerated = false` |
