# QA 獨立覆核 — `MT347_SR2026_SSI_TDD_CONTROLLED_v5.xlsx`

| 項目 | 值 |
|---|---|
| 覆核對象 | `qa/mt347/tdd/MT347_SR2026_SSI_TDD_CONTROLLED_v5.xlsx`（333,945 B） |
| 檔案 SHA-256 | `82C6ABCFD91E7D35E1382F8C86BF796D8DBF05CF8C8D94F9F0C7B5889AB52C9A` |
| sidecar 比對 | `.sha256.txt` 記載值與重算值**逐字元相符** ✔ |
| 覆核範圍 | **僅 v5**，且**僅限已同意之 25 支範圍內**。未與 v1–v4 比對。 |
| 覆核方式 | `openpyxl` 讀全部 24 分頁；`pdftotext -layout -f n -l n` 逐頁重驗 v5 新增之 MRG 宣稱；計數與公式參照獨立重算 |
| **Gate 建議** | **CONDITIONAL PASS** —— 核心內容全數通過；4 項待處理 |

---

## 1. 已驗證

### 1.1 身分與計量
| 指標 | 重算值 | 宣稱 | 結果 |
|---|---:|---:|---|
| 案例總數 | 362（ID 不重複、編號無斷號、逐訊息加總吻合） | 362 | ✔ |
| 核可範圍／邊界 | 360 ／ 2 | 360 ／ 2 | ✔ |
| 極性 | 正 152 ／ 負 208 ／ 邊界 2 | 同 | ✔ |
| `IN_SCOPE` 訊息型別 | 25 | 25 | ✔ |
| 序列化情境 | 53 | 53 | ✔ |
| 欄位規則錨點 | 164（160 `SSI_RESOLVABLE` ＋ 2 `OUT_OF_SSI_SCOPE` ＋ 2 `HYBRID_CONDITIONAL_SSI`） | 同 | ✔ |
| Active OPEN | 7（`004、005、006、007、008、009、010`） | 7 | ✔ |
| 每案 fixture 綁定 | 362 | 362 | ✔ |
| Coverage Ledger 差異欄 | 19 列**全為 0**，快取值已存在 | 0 | ✔ |

### 1.2 Ledger 公式參照正確（刪除 MX 兩欄後的關鍵風險點）
`TDD Cases` 現為 21 欄。實際欄位位置與公式引用逐一比對：

| 欄位 | 實際欄 | 公式引用 | 結果 |
|---|---|---|---|
| `Rule status` | **J** | `'TDD Cases'!J2:J363` | ✔ |
| `Polarity` | **K** | `'TDD Cases'!K2:K363` | ✔ |
| `Execution status` | **T** | `'TDD Cases'!T2:T363` | ✔ |
| `BA Open Decisions` | 7 列 | `G2:G8` | ✔ |

### 1.3 MX／pacs／converter 清除
全簿掃描 `MX Expected`、`MT↔MX`、`pacs`、`converter`、`round-trip`、`NO_CONTROLLED_ISO_ARTIFACT`、`ISO 20022` —— **殘留 0 筆**（`Change Log` 之刪除稽核紀錄除外，該處保留為必要之可追溯性）。
`NVR Semantics` 未出現出範圍訊息 ✔。

### 1.4 MT360 C13 —— 逐字驗證，**正確**
`us3mb_20260717.pdf`（SHA-256 `BC510604859CF7C5FE43A90176889AD21050ECE964A6244EBD92AC6E50FAF861`）**p.58**：

> "C13 … Thus, for all occurrences of fields 53a, 56a and 57a **in sequences L or M**, the following rules apply (Error code(s): **D48**):"

**p.59** 表：`57a Present → 53a/56a Optional`；`57a Not present → 53a/56a **Not allowed**`。
v5 之「C13: 53a/56a require 57a **in L/M**」與 MT360-021／028 之「Reject under **D48**」**相符**。

### 1.5 MT361 C13 —— 逐字驗證，**正確**
`us3mb` **p.220**：同句式，序列為 **"in sequences M or N"**，錯誤碼同為 **D48**。
v5 之「C13: 53a/56a require 57a **in M/N**」**相符**。

> 序列範圍是 C13 的身分組成，L/M 與 M/N 寫反即為錯規則。**v5 兩支皆正確**，為本版實質改善。

### 1.6 C14／E35 —— 逐字驗證，**正確**
`us3mb` **p.59**（MT360）與 **p.220**（MT361）：

> "C14 … for all occurrences of fields **56a and 86a** … (Error code(s): **E35**)"；`56a Not present → 86a **Not allowed**`

v5 各負向案例之「MRG **E35** requires 56a before 86a in the same sequence」**相符**，並與 `BA Ruling`「86a = OUT_OF_SSI_OUTPUT，其 56a 依存關係以負向案例測試」一致。

### 1.7 MT765 修正 —— 端到端落實
| 分頁 | 狀態 |
|---|---|
| `Scope` | `MESSAGE - Message` ✔ |
| `Confirmed Rules` | `MESSAGE / Message`；`RULE-MT765-MESSAGE-56a`／`-57a`；證據已去除序列字元 `A` ✔ |
| `Scenario Registry` | `SCN-MT765-MESSAGE-051`，anchor count = 2 ✔ |
| 6 個案例 | 全部 `MESSAGE - Message / …`；欄位鍵已無 `A.` 前綴 ✔ |
| 證據欄 | 改為 `p.355 Format table fields No.21 (56a) / No.22 (57a)`，不再誤引 C3 ✔ |

**併同關閉 F-347-06**：`MT765-002` 先前引用 MT765 不存在之 `53a`／`58a` 並綁著無欄位可承載的 nostro＋`expectedAccountReference`，v5 已改為僅 `56a/57a`，孤兒綁定移除 ✔。
欄位明細頁 `p.363` 重驗正確（`us7m` p.363 確含「MT 765 - 21. Field 56a」「MT 765 - 22. Field 57a」）。

### 1.8 「36 筆上游受益人綁定」—— 以算術驗證，**相符**
- 引用 `BANK-SVC-BARCGB22` 之案例：**36 筆**，**全部為 Category 3**
- Category 3 中 `MT Expected Output` 含 `58A` 之案例：**36 筆**
- 兩集合數量一致；`Bank Services` 已登錄 `BANK-SVC-BARCGB22 / BARCGB22 / Transaction beneficiary institution`

### 1.9 受控來源身分
| 項目 | v5 登錄值 | 實查 |
|---|---|---|
| `memory/swift-mt347-v2.md` | `682075A1EC36AD1A5397382063B1AFEE08F0E88921E139E7E62A8033552A985A` | **相符** ✔（17,761 B） |
| `memory/swift-mt347.md`（v1） | — | **保留未刪** ✔ |
| `v7.docx` 範圍權威 | `1A0B5CDB…E2B985` | 已登錄於 `Document Control` r14 與 `Source Register` r2 ✔ |
| 五份 SR2026 MRG | 各 SHA-256 | 與重算值相符 ✔ |

---

## 2. 待處理

### V5-01 `Change Log` 第 3–6 列整體錯位一欄　**（事實性錯誤；源頭是我）**

表頭 `Version | Date | Status | Change | Authority`。r2 正確；**r3–r6 一致右移一欄**：

| 列 | Version 格 | Date 格 | Status 格 | Change 格 | Authority 格 |
|---|---|---|---|---|---|
| r3 | `2026-09-12` | `v1 -> v2` | 變更內容 | `BA 2026-09-12` | 計數 |
| r4 | `2026-09-12` | `v2 -> v3` | 變更內容 | `BA 2026-09-12` | 計數 |
| r5 | `2026-09-12` | `v3 -> v4` | 變更內容 | `QA identity-control review / BA` | 計數 |
| r6 | `2026-09-12` | `v4 -> v5` | 變更摘要 | 變更明細 | 核准與計數 |

四列彼此一致，但與表頭不符。**我在寫 v2 那列時欄序寫錯，v3/v4/v5 沿用。** 修正：四列重排為 `Version / Date / Status / Change / Authority`。

### V5-02 `MT742-007` 證據引用不精確，且將 Usage Rule 升級為 FAIL_CLOSED

`us7m_20260717.pdf`（SHA-256 `1F748A8262E5528F6C9BD59DDD5FF1A992542CFCF25D0E8DA528241D12FEA2A4`）**p.220–221** 實況：

- **欄位 `57a` 沒有 Usage Rules 段**——只有 Format / Presence / Definition / Network Validated Rules（NVR 僅 T27/T28/T29/T45/C05 之 BIC 檢核）。
- 「57a 不應出現」寫在 **欄位 `58a` 的 Usage Rules**（p.221）：
  > "If the account of a branch or an affiliate of the Sender is to be credited by the Receiver, this field will be used to identify that branch or affiliate and its account serviced by the Receiver. **In this case, field 57a should not be present.**"

**(a) 引用錯誤**：證據欄寫「MT742 **57a/58a** Usage Rules pp.220-221」，應為「**field 58a Usage Rules, p.221**」。

**(b) 規則強度被提升，需分類裁定**：MRG 用語為 **"should not"**，屬 Usage Rule，**無 error code**，SWIFT 網路不會據此退件。v5 期望 `CONDITIONAL_57A_USAGE_RULE_VIOLATION / **FAIL_CLOSED**`，等同硬退。

Fail-closed 可以是合理決策，但依知識四分類屬 **product policy**，**非 normative rule**；目前呈現方式會讓下游誤認為 SWIFT 強制。請裁示：
- **(i)** 維持 FAIL_CLOSED，於 `Expected status/error` 或證據欄明標 `product policy — MRG Usage Rule "should not", no NVR`；或
- **(ii)** 降為警示／可覆寫，實際 5x 由上游交易指示決定。

> 併同確認為正確、無須修改：`MT742-006`「58A emitted; 57a omitted per field 58a usage rule」與 MRG 一致 ✔；`MT742-009`（MT742 無 53a，拒絕 53A）與 p.215 欄位表一致 ✔；`MT742-010` 之 `T27/T28/T29/T45/C05` 與 p.220 NVR 逐字一致 ✔。

### V5-03 `Reconciliation` 未登錄 v5 自身的三項修正

REC-001～012 全數繼承自 v1。本版三項實質更動——**MT360/361 C13 序列範圍**、**MT742-007 條件限定**、**36 筆 Cat3 上游受益人綁定**——僅出現在 `Change Log` r6 與 `BA Ruling` r10。

`Reconciliation` 的欄位結構（`Source statement → Controlled ruling → Evidence → Effect`）正是為此設計。建議補 **REC-013～015**，否則日後無法從該分頁追溯 v5 改了什麼、依據為何。

### V5-04 「六筆負向案例理由」在 v5 內無法單獨驗證

`Change Log` r6 宣稱「corrected … **six negative-case reasons**」。要確認是哪六筆、原值為何，必須與 v4 逐格比對。**依「只看 v5」之指示未比對 v4**，故列為待確認，不列入已驗證。需要時開放比對 v4，我逐格列差異。

---

## 3. 觀察（不阻斷）

1. **空白尾列**：`Document Control` r15、`BA Open Decisions` r9–r12、`Evidence Controls` r11、`Data Gaps` r13–r15。目前不影響任何公式（Ledger 均用固定範圍），但會讓 `COUNTA` 型稽核誤判列數，建議清除。
2. **MT742／MT754 `58a` 之 `HYBRID_CONDITIONAL_SSI` 仍超出已同意之 v7 矩陣**（v7 表列此二支 SSI Tags 僅 `57a`）。v5 處理正確——`Scope` 標 `IN_SCOPE — 58a HYBRID OPEN`，規則掛 `OPEN-347-007/008`。**維持現狀**，但記憶與 TDD 須持續呈現為 OPEN，不得寫成既成事實。

---

## 4. 知識分類

- **normative rule**：§1.4、§1.5、§1.6、§1.7 之 p.355/p.363、V5-02 之 MRG 原文
- **BA ruling**：§1.1 範圍與計量、觀察 2 之 OPEN 掛號
- **QA invariant**：§1.1 計數重算、§1.2 公式參照、§1.3 殘留掃描、§1.8 算術一致性
- **product policy**：V5-02(b)（FAIL_CLOSED 之強度選擇）——**此項目前未被標示，即為 V5-02(b) 的問題本身**

---

## 5. 覆核所用指令（可重跑）

```bash
sha256sum MT347_SR2026_SSI_TDD_CONTROLLED_v5.xlsx        # 比對 sidecar

pdftotext -layout -f  58 -l  59 us3mb_20260717.pdf -     # MT360 C13 / C14
pdftotext -layout -f 220 -l 221 us3mb_20260717.pdf -     # MT361 C13 / C14
pdftotext -layout -f 220 -l 221 us7m_20260717.pdf  -     # MT742 57a / 58a 欄位段與 Usage Rules
pdftotext -layout -f 355 -l 355 us7m_20260717.pdf  -     # MT765 欄位表
pdftotext -layout -f 363 -l 363 us7m_20260717.pdf  -     # MT765 欄位明細
```

> **頁碼陷阱**：`us3mb`／`us7m` 頁尾印在該頁底部，其後文字屬下一頁。本報告全部頁碼皆以 `-f n -l n` 單頁萃取取得。
