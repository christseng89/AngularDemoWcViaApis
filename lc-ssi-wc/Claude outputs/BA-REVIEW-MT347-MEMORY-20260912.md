# BA REVIEW — `memory/swift-mt347.md`（MT3／MT4／MT7 SSI 記憶）獨立覆核

| 項目 | 值 |
|---|---|
| 覆核日期 | 2026-09-12 |
| 覆核對象 | `memory/swift-mt347.md`（15,722 B，SHA-256 `F1B413E13253432E5153CA9EEC9D082460A897CAC4640E1288D8A2DDF1CCF490`） |
| 併同覆核 | `MT347_SR2026_SSI_BA_Analysis_v4.md`（1,483 B）<br>`qa/tdd/mt347/MT347_SR2026_SSI_QA_Test_Plan_v4.xlsx`（SHA-256 `1FDF15CFF1E78B0A6A3813163E6ADDD76517C0A045B240665003B249F2C5EFF5`）<br>`qa/tdd/mt347/MT347_SR2026_SSI_TDD_CONTROLLED_v1.xlsx`（SHA-256 `D586C86E61641CA3563771EA2AB937E3F15BA96A92F1F314007BCCE3BEA149D2`） |
| 覆核方式 | 於獨立容器以 `pdftotext -layout -f n -l n` **逐頁**重跑全部頁碼錨點；`sha256sum` 重算全部受控來源；`openpyxl` 重算工作簿列數與 Coverage Ledger |
| 結論 | **記憶檔本體：接受（ACCEPT）**。TDD 工作簿：**CONDITIONAL PASS**，1 項確認缺陷、1 項覆蓋率缺口待裁定 |

> 本報告嚴格分兩區。**已驗證**＝我在本次獨立環境中以官方 PDF 逐頁重現；**待確認**＝尚未重現或需 BA 裁定。
> 引用一律「檔名＋SHA-256＋頁碼」。

---

## 0. 先決事項：`MT347` 不是 SWIFT 訊息型別（已驗證）

對四份 MRG 做**全文件**掃描（非僅前 12 頁）：

| 檔名 | 頁數 | SHA-256 | `MT347` / `MT 347` 命中 |
|---|---:|---|---|
| `us3ma_20260717.pdf` | 774 | `5B4315EF876FF32C416BF445C0ADB063D6E0A1600EF93F55DF73F98A175457E5` | 0 |
| `us3mb_20260717.pdf` | 635 | `BC510604859CF7C5FE43A90176889AD21050ECE964A6244EBD92AC6E50FAF861` | 0 |
| `us4m_20260717.pdf` | 115 | `71F865223FD74B19DD5AE721AA84F0288259A1C28600A5B8F8252346BAC1C06B` | 0 |
| `us7m_20260717.pdf` | 443 | `1F748A8262E5528F6C9BD59DDD5FF1A992542CFCF25D0E8DA528241D12FEA2A4` | 0 |

字串 `347` 僅出現在頁尾頁碼（us3ma 第 347 頁、us3mb 第 347 頁、us7m 第 347 頁），以及 us7m 的帳號／金額示例（`700-373473`、`USD34750`）——**無一為訊息型別**。

SR2026 Category 3 完整訊息清單（自兩冊 MRG 全文萃取）：
`MT300, 304, 305, 306, 320, 321, 330, 340, 341, 350, 360, 361, 362, 364, 365, 370, 380, 381, 390, 391, 392, 395, 396, 398, 399`——**不含 347**。

**裁定**：`MT347` 係本專案內部對「MT3＋MT4＋MT7」的簡寫。記憶檔標題《MT3xx / MT4xx / MT7xx SSI-Related FIN Profiles》與 v4 分析標題均證實此意圖，**記憶內容本身沒有錯誤**。

**建議（命名風險，需 BA 決議）**：檔名／識別碼 `MT347` 讀起來像一支不存在的 FIN 訊息，對外部審計或新進 QA 具誤導性。建議更名為 `MT3-4-7` 或 `CAT347`，並在記憶檔 §1 首句加入一行免責：「MT347 為 Category 3／4／7 之內部簡寫，非 SWIFT 訊息型別。」

---

## 1. 已驗證（本次獨立重現，可直接引用）

### 1.1 受控來源身分——5 份全數重算相符
`us3ma`、`us3mb`、`us4m`、`us7m` 如上表；另 `us3u_20260717.pdf` 65 頁、SHA-256 `92F6F7E6D1D7EB1EEA1BFB753ADA171D4099FA5215BA13D130C2E17494EB0E90`。
記憶檔 §3 表格五列**逐字相符**。

### 1.2 Category 3 業務邊界（記憶檔 §4 首段）
`us3ma_20260717.pdf` p.6 原文：
> "The confirmation messages within this category are confirmations of information already known to both parties. They handle only the contract part of the business and **are not used for the transfer of funds**, which takes place by other means."

記憶檔的引述與推論（SSI 僅得填入該結算指示序列與腿，不得把確認書變成付款指令）**成立**。

### 1.3 Category 3 全部 14 支 scope 頁碼——逐頁比對，全數命中
`us3ma`：MT300 p.14、MT304 p.122、MT305 p.194、MT306 p.256、MT320 p.422、MT330 p.556、MT340 p.638、MT341 p.721
`us3mb`：MT350 p.15、MT360 p.47、MT361 p.206、MT362 p.394、MT364 p.446、MT365 p.488

### 1.4 Category 3 欄位表抽驗——四處全中
| 錨點 | 重現結果 |
|---|---|
| MT300 p.18 | B1：`53a Delivery Agent O A/J`、`56a Intermediary O A/J`、`57a Receiving Agent **M** A/J`；B2：同上再加 `58a Beneficiary Institution O A/J` ✔ |
| MT300 p.19 | Sequence D Split Settlement：`53a/56a O`、`57a M`、`58a O`，選項 `A, D, or J` ✔ |
| MT305 p.195 | `53a **Sender's Correspondent** O A/J`（No.26）、`56a Intermediary O A/J`（27）、`57a **Account With Institution** **M** A/J`（28），且三者均在 **Mandatory Sequence A General Information** 內（該序列於 No.31 結束） ✔ |
| MT306 p.262／p.263／p.267 | Seq C Premium：53a/56a O、57a M、58a O；Seq E Binary Payout：同；Seq L Additional Amounts：53a/56a O、57a M、**無 58a** ✔ |

記憶檔 §4 末段的角色名稱例外規則（「`53a` 為 Delivery Agent，MT305 除外為 Sender's Correspondent；`57a` 為 Receiving Agent，MT305 除外為 Account With Institution」）**經 p.18／p.195 對照證實正確**。

### 1.5 MT400（記憶檔 §5）——逐字相符
`us4m_20260717.pdf` p.12 欄位表：`53a Sender's Correspondent O A,B,D`／`54a Receiver's Correspondent O A,B,D`／`57a Account With Bank O A,D`／`58a Beneficiary Bank O A,B,D`。
p.13 原文：
> "C1 Field 57a may only be present if fields 53a and 54a are both present (Error code(s): **C11**)."

記憶檔「NVR C1 在 p.13」**正確**；記憶檔未誤稱其錯誤碼，亦正確。

### 1.6 Category 7 全部 10 支欄位頁碼與選項集——逐頁比對，全數命中
MT730 p.177（`57a Account With Bank O **A or D**`，與其餘 A/B/D 不同）、MT734 p.187、MT742 p.215（`57a O A/B/D`、`58a O **A or D**`）、MT750 p.244、MT752 p.252（`53a`／`54a`）、MT754 p.264（`53a **Reimbursing Bank**`／`57a`／`58a A or D`）、MT756 p.275、**MT765 p.355**（scope 在 p.354，欄位在 p.355——記憶檔正確分開）、MT768 p.389、MT769 p.396。

### 1.7 Category 7 NVR 頁碼——記憶檔 §9 第 2 點的三處更正全部成立
| NVR | 實際頁 | 原目錄所指 | 驗證原文 |
|---|---|---|---|
| MT400 C1 | **p.13** | p.12 | 見 §1.5 |
| MT754 C2 | **p.265** | p.264 | "Either field 53a or 57a may be present, but not both (C14)." |
| MT769 C3 | **p.397** | p.396 | "If field 32D is present, then field 57a must not be present (C78)."（C1 在 p.396） |

另併同驗證：MT730 C1／C2 均在 p.177；MT768 C1／C2／C3 均在 p.389。記憶檔 §6 對此三支的敘述正確。

### 1.8 MT742／MT754 `58a` 混合來源裁定——MRG 明文支持（記憶檔 §9 第 4 點）
`us7m_20260717.pdf` p.221（MT742）原文：
> "Additionally, where there are **multiple account relationships** between the Sender and the Receiver or the account with bank, this field shall specify the Sender's SWIFT address, that is, **option A**, and in the account number line, **the specific account to be credited**."

p.271（MT754）為同義條文（"the Sender's BIC, that is, option A…the specific account to be credited"）。

**此與 MT202 53a（`us2m_20260717.pdf` SHA `64483D7F7C094DB28E03791AB6BBC7A0522DAEC90487A7DD834228E848FA8323` p.46）的「多重直接帳戶關係須指明具體帳號」為同一套 MRG 教義，跨類別一致。**
故記憶檔否決 `MT742.58a`／`MT754.58a` 的一概 `OUT_OF_SSI_SCOPE`、改判 `HYBRID_CONDITIONAL_SSI`（TDD REC-003、OPEN-347-007／008）**在 MRG 上站得住腳，BA 應維持**。

### 1.9 C81 方向分歧——「以 (messageType, ruleNumber) 為鍵，不得只用錯誤碼」確有必要
us2m 全書 C81／C68 逐頁掃描，命中頁恰為 **p.40、p.61、p.95、p.135、p.155**（C81 共 5 處；C68 僅 p.61、p.155 共 2 處）——與 v4 分析所述之驗證器計數 `C81=5 / C68=2` **完全一致**。

| 訊息 | 規則 | 錯誤碼 | 方向 | 頁 |
|---|---|---|---|---|
| MT202 C1／MT202COV C1／MT203 C4／MT205 C1／MT205COV C1 | — | C81 | `56a ⇒ 57a` | us2m p.40／61／95／135／155 |
| MT202COV C2／MT205COV C2 | — | C68 | Seq B `56a ⇒ 57a` | us2m p.61／155 |
| **MT785 C1** | — | **C81** | **`57a ⇒ 56a`（相反）** | us7m **p.410** |
| **MT760 C7** | — | **C81** | **Seq B `57a ⇒ 56a`（相反）** | us7m **p.299** |

TDD `NVR Semantics` 分頁的 8 列與上表**完全相符**。

### 1.10 工作簿計量重算相符
| 指標 | 重算 | 宣稱 |
|---|---:|---:|
| Test Plan v4 — Test Cases | 358 | 358 |
| Test Plan v4 — Role Profiles | 164 | 164 |
| Test Plan v4 — Scope | 27（25 IN_SCOPE ＋ MT416 ＋ MT785） | 25 |
| TDD v1 — TDD Cases | 362 | 362 |
| TDD v1 — Scenario Registry | 53 | 53 |
| TDD v1 — Confirmed Rules | 164 | 164 |
| TDD v1 — Coverage Ledger 差異欄 | 全部 0 | 0 |
| TDD v1 自證 SHA（sidecar `.sha256.txt`） | `D586C86E…149D2` 相符 | — |
| TDD `Source Register` 登錄之 `memory/swift-mt347.md` SHA | `F1B413E1…CCF490` **與磁碟現檔相符** | — |

Coverage Ledger 的公式已含快取值（非空殼），可作為證據。

### 1.11 Category 3 覆蓋完整性——14 支的取捨可辯護
對 `us3ma`／`us3mb` 全文掃描 5x 當事人欄位：**MT321、MT370、MT380、MT381、MT390–399 完全沒有 5x 欄位**。因此排除它們不是缺口，是正確取捨。

---

## 2. 待確認 ／ 需 BA 裁定

### F-347-01 **CONFIRMED DEFECT（TDD 工作簿，非記憶檔）— MT765 序列標註錯誤**

`us7m_20260717.pdf` p.355 版面（逐行）：

```
End of Sequence A Beneficiary          ← Sequence A 僅含 59N/59S/59T/59P/59R（No.5–9）
  O  59E  Beneficiary Identification                                10
  …
  O  56a  Intermediary              A, B, or D                      21
  O  57a  Account With Institution  A, B, or D                      22
```

且同頁 NVR C3：
> "Either sequence A (Beneficiary) or field 59E, but not both, may be present (Error code(s): D62)."

**⇒ MT765 的 `56a`／`57a` 是訊息層（單序列）欄位，位於 Sequence A 之外。**

但 TDD v1 `Scope` 分頁將 MT765 的「Sequence / business scenarios」標為 `A - Beneficiary`，`Confirmed Rules` 亦標 `Sequence=A / Business Scenario=Beneficiary`，規則 ID 為 `RULE-MT765-A-56a`／`RULE-MT765-A-57a`。

**影響**：違反記憶檔 §7 自訂之不變式（「Mandatory/optional 依序列界定」「序列與結算腿是每個已解析欄位身分的一部分」）。若解析器依此鍵值實作，當 MT765 以 `59E` 形式送出（依 C3 此時 **Sequence A 不存在**）時，`56a`／`57a` 會被錯誤抑制或錯誤地置入不存在的序列。

**修正建議**：改為 `MESSAGE - Message`（與 MT730／734／742／750／752／754／756／768／769 同慣例），規則 ID 改為 `RULE-MT765-MESSAGE-56a`／`-57a`。

**注意**：`memory/swift-mt347.md` §6 對 MT765 僅寫「`56a` Intermediary；`57a` Account With Institution — p.355」，**未宣稱序列，故記憶檔本體無此缺陷**。建議記憶檔補一句明示「MT765 之 56a／57a 為訊息層欄位，不屬 Optional Sequence A Beneficiary（us7m p.355，C3 D62）」以防後續再犯。

---

### F-347-02 **覆蓋率缺口（需 BA 裁定）— Category 7 另有 7 支帶 5x 的訊息既未列 IN_SCOPE 亦未列 EXCLUDED**

TDD `Excluded Scope Decisions` 僅記錄 **MT416** 與 **MT785** 兩支。但全書掃描 `us7m_20260717.pdf` 顯示下列訊息同樣帶 5x 當事人欄位，卻在受控範圍文件中**完全沒有出現**（既非 IN_SCOPE，也沒有排除裁定）：

| MT | 5x 欄位（全部 Optional） | 頁 |
|---|---|---|
| MT700 Issue of a Documentary Credit | `53a Reimbursing Bank`、`57a 'Advise Through' Bank`、`58a Requested Confirmation Party` | p.18 |
| MT705 Pre-Advice | `57a 'Advise Through' Bank` | p.48 |
| MT707 Amendment | `53a Reimbursing Bank`、`57a 'Advise Through' Bank`、`58a Requested Confirmation Party` | p.65 |
| MT710 Advice of a Third Bank's DC | `53a Reimbursing Bank`、`57a 'Advise Through' Bank`、`58a Requested Confirmation Party` | p.106 |
| MT720 Transfer of a DC | `57a 'Advise Through' Bank`、`58a Requested Confirmation Party` | p.142 |
| **MT740 Authorisation to Reimburse** | `58a Negotiating Bank` | p.203 |
| MT760 Issue of a Demand Guarantee/SBLC | `56a Advising Bank`、`57a 'Advise Through' Bank`、`58a Requested Confirmation Party` | p.295／296／298 |

兩點不一致值得 BA 特別注意：

1. **同名角色處置不一致**：`MT754.53a Reimbursing Bank` 已入表並明確裁定為 `OUT_OF_SSI_SCOPE`（附證據），但 `MT700／707／710` 的**同名** `53a Reimbursing Bank` 連裁定都沒有。
2. **MT740 最具實質性**：MT740 是《Authorisation to Reimburse》，正是 MT742 索償所依據的償付授權；把它留在範圍文件之外，是整份範圍治理中最大的空白。

**建議**：比照 MT416／MT785 的嚴謹度，於 `Excluded Scope Decisions` 補 7 列（檔名＋頁碼＋欄位編號＋NVR＋API 預期）。就 MRG 語意判斷，**其中多數應合理落在 `OUT_OF_SSI_SCOPE`（屬通知鏈而非結算路徑）**，但「結論正確」不等於「已裁定」——必須留下紀錄，否則審計無法證明它們是被考慮過而排除，而非被遺漏。

---

### F-347-03 **建議寫入記憶（防呆）— Category 7 的 5x 角色名稱與 Cat 2／Cat 3 不同**

記憶檔 §7 末條已寫明原則（「不得僅因標籤號碼是 5x 就用標準路徑填入交易情境欄位」），但**沒有角色名稱分歧對照表**。這是「以標籤號碼驅動」的解析器最高風險項：

| 標籤 | Cat 2／Cat 3 慣常語意 | Category 7 實際語意（頁） |
|---|---|---|
| `53a` | Sender's Correspondent／Delivery Agent | **Reimbursing Bank**（MT700 p.18、MT707 p.65、MT710 p.106、MT754 p.264） |
| `56a` | Intermediary | **Advising Bank**（MT760 p.295、MT785 p.409） |
| `57a` | Account With Institution／Receiving Agent | **'Advise Through' Bank**（MT700 p.18、MT705 p.48、MT707 p.65、MT710 p.106、MT720 p.142、MT760 p.296/298、MT785 p.409） |
| `58a` | Beneficiary Institution／Beneficiary Bank | **Requested Confirmation Party**（MT700／707／710／720／760）、**Negotiating Bank**（MT740 p.203） |

建議於記憶檔 §7 加入此表。

---

### F-347-04 **尚未重現（不得列為已驗證）— TDD REC-011／REC-012 的現場設定觀察**

TDD `Reconciliation` 記載：
- REC-011：現行 canonical seed **沒有任何 MT3／MT4／MT7 FIN messageType 的 ACTIVE SSI route**，故全部核可案例皆 execution-blocked。
- REC-012：**MT341／360／361／362／364／365／734／750／752／768／769 缺 RMA**。

兩者標註為「QA live configuration inspection 2026-09-12；controlled reproduction evidence pending」。**我本次未重現這兩項**，故依報告紀律列為 **待確認**，不得引用為已驗證事實。若 BA 需要，我可比照 MT2 的做法在獨立容器中重跑並產出完整鍵樹證據。

---

### F-347-05 **維持既有立場（無新證據）— MT↔MX 轉換邊界與 UI `VERIFIED REFERENCE` 標籤**

記憶檔 §8、§9 第 1 點與 TDD OPEN-347-001～004、009～011 的立場（無普適 pacs 目標；`pacs.009.001.12` 之 UI metadata 不受本地受控 `.001.08` 指南支持；`verified` 係由 `executable: true` 預設值推導，非獨立 MRG／UAT 結果）——**本次未取得任何足以推翻的新證據，亦未取得可佐證的新證據**。維持 OPEN。

此處與已接受之 MT2 記憶一致：SR2025／SR2026 之適用，僅在客戶／通道／轉換器合約明示時方得認定；第三方轉換器存在本身不構成版次選擇。

---

## 3. BA 建議裁定（草案）

| # | 標的 | 建議裁定 |
|---|---|---|
| 1 | `memory/swift-mt347.md` 本體 | **ACCEPT**。§3 來源身分、§4 Cat3、§5 MT400、§6 Cat7、§9 第 2／4 點全部經獨立逐頁重現無誤。 |
| 2 | `MT347` 命名 | **RENAME 建議**（`MT3-4-7`／`CAT347`）＋記憶檔 §1 補免責句。非阻斷項。 |
| 3 | F-347-01 MT765 序列 | **CONFIRMED DEFECT**，修 TDD v1 `Scope`／`Confirmed Rules`；記憶檔 §6 補一句明示。 |
| 4 | F-347-02 Cat7 七支未裁定 | **開 OPEN-347-012**，補 7 列排除裁定；MT740 優先。 |
| 5 | F-347-03 角色名稱分歧表 | 併入記憶檔 §7。 |
| 6 | F-347-04 REC-011／012 | 維持 **待確認**，需受控重現證據方得結案。 |
| 7 | MT742／MT754 `58a` HYBRID | **維持記憶檔與 TDD 之判定**（MRG p.221／p.271 明文支持）；OPEN-347-007／008 續開。 |
| 8 | Gate | TDD v1 維持 **CONDITIONAL PASS**；362 案全數 `NOT_EXECUTED`，無任何驗收主張——此點正確且應保持。 |

---

## 4. 知識分類標註（依既定紀律）

- **normative rule**：§1.2、§1.3、§1.4、§1.5、§1.6、§1.7、§1.8、§1.9、§1.11、F-347-01 之 MRG 部分、F-347-02 之欄位事實、F-347-03 對照表
- **BA ruling**：§3 全表（草案，待 BA 正式裁定）
- **QA invariant**：§1.10 計量重算、F-347-04 之證據要求
- **product policy**：無（本報告未涉及 HTTP 分流等產品政策）

---

## 5. 覆核所用指令（可重跑）

```bash
# 訊息型別存在性
for f in us3ma us3mb us4m us7m; do pdftotext -layout ${f}_20260717.pdf - | grep -c "MT ?347"; done

# 頁碼錨點（逐頁，避免頁尾偏移一頁陷阱）
pdftotext -layout -f 355 -l 355 us7m_20260717.pdf -      # MT765 欄位表
pdftotext -layout -f 221 -l 221 us7m_20260717.pdf -      # MT742 58a 多重帳戶關係
pdftotext -layout -f 271 -l 271 us7m_20260717.pdf -      # MT754 58a 多重帳戶關係
pdftotext -layout -f 410 -l 410 us7m_20260717.pdf -      # MT785 C1 = 57a⇒56a
pdftotext -layout -f  13 -l  13 us4m_20260717.pdf -      # MT400 C1 (C11)

# 來源身分
sha256sum us3ma_20260717.pdf us3mb_20260717.pdf us3u_20260717.pdf us4m_20260717.pdf us7m_20260717.pdf
sha256sum memory/swift-mt347.md
```

> **頁碼陷阱提醒**：`us*m` 系列頁尾印在該頁**底部**，其後文字屬**下一頁**。本報告全部頁碼皆以 `-f n -l n` 單頁萃取取得，已規避此陷阱（MT2 曾因此把 53a 誤記為 p.45，實為 p.46）。
