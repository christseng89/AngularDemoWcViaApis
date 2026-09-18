# SWIFT 文件索引 — MT2xx 與 pacs.009（受控清單）
建立：Claude · 日期：2026-09-12 · 範圍：**僅 MT2 與 pacs.009**
來源資料夾：`SWIFT/`（全 24 檔，本索引只收在範圍內的 8 檔）

引用規則：**任何 MRG／CBPR+ 引用一律同時寫出「檔名 + SHA-256 + 頁碼」**，缺一不可。理由見第 3 節。

---

## 1 · MT2xx（Category 2 Message Reference Guide）

| 檔名 | 版次 | 頁數 | Bytes | SHA-256 |
|---|---|---|---|---|
| `us2m_20260717.pdf` | **SR2026（現行受控）** | 211 | 1,291,919 | `64483D7F7C094DB28E03791AB6BBC7A0522DAEC90487A7DD834228E848FA8323` |
| `us2m_20250718.pdf` | SR2025（**保留中，非作廢**） | 211 | 1,009,135 | `820581F85FC9EFA34A56F1A54FE66DDA684C6C2FFE9533E38F096A2176B9845C` |

### 已逐頁驗證之錨點（用於 MT202）

| 主題 | 頁 | 原文摘要 |
|---|---|---|
| MT 202 Usage Rules —— 自有帳戶間轉帳 | **p.40** | "…field 53B must specify the number of the account to be debited and field 58A the number of the account to be credited and the name of the Sender." |
| Field 53a Usage Rules —— option B、多重帳戶關係 | **p.46** | "…this field must be used with option B to identify the account to be debited." ／ "In those cases where there are multiple direct account relationships, in the currency of the transaction, … must be indicated in field 53a, using option B with the party identifier only." ／ "The absence of fields 53a and 54a implies that the single direct account relationship … will be used." |
| Field 57a Usage Rules | **p.52** | "When field 57a is not present, it means that the Receiver is also the account with institution." |
| Field 58a Usage Rules | **p.54** | "…option A must be used to specify the account to be credited and the name of the Sender." ／ "It is strongly recommended that when clearing payments take precedence over book transfer and book transfer is requested, Party Identifier be used to specify the account of the beneficiary." |

驗證方式：`pdftotext -layout -f <n> -l <n>`，逐頁抽取後比對原文。四個錨點均已確認。

---

## 2 · pacs.009（CBPR+ SR2026 Usage Guideline）

每個變體有**長短兩版**。長版為完整 Usage Guideline（含欄位定義與限制），短版為摘要。

| 變體 | 檔名 | 頁數 | Bytes | SHA-256 | 用途 |
|---|---|---|---|---|---|
| **plain（長）** | `…pacs_009_001_08_FinancialInstitutionCreditTransfer_20260521_0643.pdf` | **343** | 3,020,422 | `4B9436D21B141C5CEF75ACFFAE961B5130FEAD9B95C1B9CD144197DAA7EA6585` | **欄位級裁定之依據** |
| plain（短） | `…pacs_009_001_08_FinancialInstitutionCreditTransfer_20260522_0127.pdf` | 57 | 349,577 | `2373FC20D5AB13219C7F3A503B1FA217D4419389FE42394BBF3455D8F97FBA28` | 摘要，不足以支撐欄位裁定 |
| **COV（長）** | `…pacs_009_001_08_COV_FinancialInstitutionCreditTransfer_20260521_0643.pdf` | **410** | 3,668,555 | `745B302A700C785CAE1E5F630CC906F41DF31C1E5727BF03EF591F0AD1CFA0A1` | MT202COV 對照 |
| COV（短） | `…pacs_009_001_08_COV_FinancialInstitutionCreditTransfer_20260522_0129.pdf` | 126 | 949,771 | `7B447CD7AE29DA8BED5460DC82235641AE66A5746D49F31A0952E1E62722F58A` | 摘要 |
| **ADV（長）** | `…pacs_009_001_08_ADV_FinancialInstitutionCreditTransfer_20260521_0643.pdf` | **290** | 2,488,549 | `8F76D4071F67FC2AC2996B6BED68F2F2D1388FEB3CF14B83353ECF3B7F785CE1` | Advice 變體 |
| ADV（短） | `…pacs_009_001_08_ADV_FinancialInstitutionCreditTransfer_20260522_0131.pdf` | 62 | 390,057 | `4BBEAAA0D1C1173BBC9045990D2A6C795E8B58959C23C2F6D15855A9AE268668` | 摘要 |

### 關鍵欄位頁碼（長版）

| 欄位 | plain（343p） | COV（410p） |
|---|---|---|
| `CdtrAcct`（CreditorAccount） | 10, 22, 65, 85, 88, **90**, **101** | 11, 23, 77, 98, **101**, **103**, 123 |
| `SttlmAcct`（SettlementAccount） | 158（索引）, 256, **259** | 193（索引）, 316, **320** |
| `SttlmMtd`（SettlementMethod） | 158（索引）, 256, **259** | 193（索引）, 316, **319** |
| `IntrmyAgt1Acct` | 10, 21, 64, 76, 88, 90, 98 | 11, 23, 77, 89, 101, 103, 116 |

已抽取確認之定義（plain 長版）：

- **p.101 §5.24.22 CreditorAccount**，XML Tag `CdtrAcct`，Presence `[0..1]`
  Definition：*"Unambiguous identification of the account of the creditor to which a credit entry will be posted as a result of the payment transaction."*
- **p.259 §5.113.2 SettlementAccount**，XML Tag `SttlmAcct`，Presence `[0..1]`
  Definition：*"A specific purpose account used to post debit and credit entries as a result of the transaction."*
- **p.259 §5.113.1 SettlementMethod**，XML Tag `SttlmMtd`，Presence `[1..1]`

→ 這三條即為 TEST-REPORT-v2 之 **K6**（同一 nostro 在兩路徑渲染不同）與先前 `SttlmAcct` 語意爭點的裁定依據所在。
本索引**不作裁定**，僅指出依據位置。

---

## 3 · 兩個引用陷阱（本索引存在的理由）

### SR2025 為何保留
部分客戶使用**第三方 MT ↔ MX 轉換器**，其對應仍依 SR2025。因此 `us2m_20250718.pdf` 屬於現役參考，
不得視為作廢版本。涉及該類客戶的轉換議題時，須明確標示依據的是 SR2025 或 SR2026，兩者不可混用。
本專案 v15.2／v15.3 之受控裁定一律以 **SR2026（`64483D7F…8323`）** 為準；引用 SR2025 時必須另行註明。

---

**陷阱一 · `us2m` 2025 與 2026 頁數相同（皆 211 頁）。**
實測 p.46 兩版之 53a Usage Rules 文字相同，但整份檔案 Bytes 相差 282,784，代表他處有異動。
**只寫「p.46」無法區分版次** —— 必須同時寫 SHA-256。

**陷阱二 · pacs.009 每個變體有長短兩版，頁碼完全不可互換。**
例：plain 長版 343 頁、短版 57 頁；`CdtrAcct` 在長版出現於 7 頁、短版僅 1 頁（p.44）。
引用短版頁碼去對長版，必定錯位。**欄位級裁定一律引長版（20260521_0643）。**

---

## 4 · 抽取方法（可重現）

```
pdftotext -layout -f <page> -l <page> <file> -
```

以 **PDF 頁索引**指定，抽出的內容即該印刷頁。兩個文件族皆已確認頁尾印刷頁碼與 PDF 頁索引一致
（`us2m` p.46 頁尾為 46；pacs.009 plain p.101 頁尾為 101）。

**已知錯誤做法**：讀到頁尾 `n` 就把其後文字歸給第 n 頁。頁尾位於該頁**底部**，其後文字屬**下一頁**。
本專案 53a 錨點原誤記為 p.45，即由此而來，已更正為 p.46。
