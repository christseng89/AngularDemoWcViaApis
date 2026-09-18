# MT2XX v7 — 受控證據獨立驗證報告與修訂評分

**驗證對象：** `MT2XX_支援標準SSI_SR2026_MRG與ISO20022對應覆核版_v7.xlsx`（SHA-256 `A655EADE…79FF`）之 `Source Register` 與 `Official Profile Evidence` 兩張表
**證據來源：** `SWIFT/`（2026-09-09 連接）
**驗證日期：** 2026-09-09

> **本報告取代 v7 審查意見第零節的驗證界線聲明。** 該節當時載明 11 份受控二進位檔「我手上沒有、無法驗證」。現已取得其中 10 份並完成獨立重算與內容比對。

---

## 一、雜湊、位元組數、頁數：10／10 全數相符

| Evidence ID | Register 記載 SHA-256 | 我重算 | Bytes | Pages |
|---|---|---|:---:|:---:|
| SRC-P009-CORE-DETAIL | `4B9436D2…6585` | **相符** | 3,020,422 ✔ | 343 ✔ |
| SRC-P009-CORE-RULES | `2373FC20…BA28` | **相符** | 349,577 ✔ | 57 ✔ |
| SRC-P009-COV-DETAIL | `745B302A…A0A1` | **相符** | 3,668,555 ✔ | 410 ✔ |
| SRC-P009-COV-RULES | `7B447CD7…F58A` | **相符** | 949,771 ✔ | 126 ✔ |
| SRC-P009-ADV-DETAIL | `8F76D407…5CE1` | **相符** | 2,488,549 ✔ | 290 ✔ |
| SRC-P009-ADV-RULES | `4BBEAAA0…8668` | **相符** | 390,057 ✔ | 62 ✔ |
| SRC-P010-DETAIL | `407406DD…2EF9` | **相符** | 1,496,210 ✔ | 181 ✔ |
| SRC-P010-RULES | `6D2B5FDA…A54C` | **相符** | 247,790 ✔ | 39 ✔ |
| SRC-C057-DETAIL | `A69E7B1B…D6C9` | **相符** | 2,210,110 ✔ | 253 ✔ |
| SRC-C057-RULES | `53A655EA…B95D` | **相符** | 306,883 ✔ | 52 ✔ |

加上前輪已驗證的 `SRC-MT2-2026`／`SRC-MT2-2025`，**Source Register 中所有已取得的受控二進位檔全部通過獨立驗證**（12／12 雜湊、12／12 位元組數、12／12 頁數）。

**唯一未能驗證者：`SRC-UHB`**（`ISO 20022_Programme_UHB_SR2026_v3.0.pdf`，`E5A93555…F0B8`，20,005,798 bytes，1,014 頁）——**不在此資料夾中**，見第四節。

---

## 二、Profile Evidence 頁碼錨點：5／5 精確命中

我依 Register 記載的頁碼逐頁擷取，結果與記載完全一致：

| Profile ID | 頁碼 | UG 原文 |
|---|---|---|
| P009-CORE-SR2026 | CORE-RULES **p.10** | `Message Definition Identifier <MsgDefIdr> [1..1] FV FixedValue: **pacs.009.001.08**`<br>`Business Service <BizSvc> [0..1] FV FixedValue: **swift.cbprplus.04**` |
| P009-COV-SR2026 | COV-RULES **p.10** | `FixedValue: pacs.009.001.08` / `FixedValue: **swift.cbprplus.cov.04**` |
| P009-ADV-SR2026 | ADV-RULES **p.10** | `FixedValue: pacs.009.001.08` / `FixedValue: **swift.cbprplus.adv.04**` |
| P010-SR2026 | P010-RULES **p.9** | `FixedValue: **pacs.010.001.03**` / `FixedValue: **swift.cbprplus.04**` |
| C057-SR2026 | C057-RULES **p.9** | `FixedValue: **camt.057.001.06**` / `FixedValue: **swift.cbprplus.04**` |

其餘錨點亦全數命中：

- **CORE-RULES p.13** — `Settlement Account <SttlmAcct> [0..1]　Synonym: **53B (in context : Sender's Correspondent (option 53B - account to be debited))**`
- **COV-RULES p.13** — 同上，`SttlmAcct [0..1] Synonym`
- **COV-RULES p.109** — `R16 "CBPR_UETR_COV_…"：In the pacs.009 COV, the UETR should transport the UETR of the underlying pacs.008.`
- **CORE-RULES p.3** — Collection 描述：`CBPRPlus SR2026 (Combined)`、`**These are FINAL usage guidelines**`、`30 Usage Guidelines that will be live on the network as of November 2026`

**Register 對 CBPR+ 這一批的記載，我沒有找到任何一處錯誤。** 上一輪「證據構面非由我背書」的保留可以撤除。

### 順帶關閉 Translation Test 5 的一半

`SttlmAcct` 確實帶有 53B synonym，且限定語境為「**Sender's Correspondent（option 53B - account to be debited）**」——與 MT200／MT202／MT203 的 53B 用法一致。v7 把 Test 5 標為「PROFILE EVIDENCE ACQUIRED / GOLDEN FIXTURE PENDING」是準確的：**「有沒有對應」已答，「怎麼轉」仍未答**，且 `SttlmAcct` 為 `[0..1]`，何時該產生仍需 translation rule 決定。

---

## 三、取得 UG 後浮現的三項測試缺口

這是本次驗證最重要的產出。有了 UG 全文，我得以逐條比對 Translation Fidelity Tests 的八個 Assertions 是否覆蓋 CBPR+ 的實際規則。**有三處沒有。**

### 3.1（高）CBPR+ 的 Agent Identification 三選項規則，文件全篇未出現

CORE-RULES **p.3** 的 Principles 第 1 條，以及規則清單 **R17／R18／R19／R20**：

| 規則 ID | 規則名稱 | 內容 |
|---|---|---|
| **R20** | `CBPR_Agent_Option_1_TextualRule` | **BICFI**，可選擇性附加 LEI（**preferred option**） |
| **R17** | `CBPR_Agent_Option_2_TextualRule` | （Clearing Code **OR** LEI）**AND**（Name **AND**［Structured postal address，至少 Town Name 與 Country］**OR**［Hybrid postal address，同上］） |
| **R19** | `CBPR_Agent_Option_3_TextualRule` | Name **AND**［Structured／Hybrid postal address，至少 Town Name 與 Country］ |
| **R18** | `CBPR_Agent_National_only_TextualRule` | **例外**：當 Debtor Agent、Creditor Agent **及其間所有 agent 都位於同一國家**時，**得僅使用 clearing code** |

Principles 原文另補：

> If BICFI is present, then (Name & Postal Address) is **NOT allowed**（ClearingSystemMemberIdentification 與 LEI 可補充）— 資訊衝突時 BICFI 永遠優先。
> If BICFI is absent, (Name & Postal Address) **必須**存在。
> Note: **"Instructing/Instructed Agents" 必須以 BICFI 識別**。

**這是決定一筆標準 SSI 能否在 MX 側產生合法 agent 的根本規則，而 v7 的八個測試沒有任何一條提到它。**

三個直接後果：

1. **SSI 主檔資料模型不足。** `ssiactive*.xlsx` 目前沒有 Name 與 Postal Address 欄位。依 R17／R19，**任何沒有 BIC 的 SSI 記錄都無法產生合法的 pacs.009 agent**——除非落在 R18 的同國例外。這比我先前提的「option A／D 選擇」更根本：MT 側 option D 允許無 BIC 的 Name&Address，MX 側則要求 **結構化地址且至少含 Town Name 與 Country**。
2. **我先前的 `//CP`／`//CH`／`//SW`／`//RU` 發現要升級。** 我原本說「這些碼只能用 MT option D」。加上 CBPR+ 之後更嚴：**只帶 CHIPS Participant ID、沒有 BIC 也沒有結構化地址的 SSI 記錄，在跨境 pacs.009 鏈中完全無法表達**，只有 R18 同國情境才成立。
3. **R18 需要「整條鏈的國別」。** 判斷同國例外，必須知道 Debtor Agent、Creditor Agent 與其間所有 agent 的國別——這無法逐欄判定，又一次指向我從 v3 起反覆提的 **agent-chain 後處理**。SSI 樣本有 `Counterparty Country` 與 `Settlement Country`，但沒有解析後完整鏈的國別。

**建議新增 Test 9：** 對每一筆標準 SSI，證明其可依 R20／R17／R19 之一產生合法 agent；不符者標為 `AGENT_ID_INSUFFICIENT` 並列入 SSI 資料補正清單。R18 同國例外須以完整解析鏈的國別評估，不得以單筆 SSI 欄位近似。

另附相關規則，同樣未被覆蓋：**R21／R23／R24／R25／R26**「Name and Address must always be present together」（逐 agent 適用）、**R22** `CBPR_Duplication_Postal_Address_TextualRule`「結構化元素內的資料，在任何情況下都不得於 AddressLine 重複」。

### 3.2（中）清算碼「單次出現且置於最前」的缺口已由一手資料證實

我在 v7 審查提出此點時是推論。現已查證：

`ClrSysMmbId` 在 pacs.009 中是 **`[0..1]`，掛在每一個 agent 之下獨立存在**——`DbtrAgt`、`CdtrAgt`、`IntrmyAgt1`、`IntrmyAgt2`、`IntrmyAgt3`、`InstgAgt`、`InstdAgt` 各自一份，我在 CORE-RULES 中共定位到 11 處。**CBPR+ 沒有任何規則限制它在鏈上只能出現一次。**

而 MT 側（MT202／203／205／COV 之 57a、58a Usage Rules）明訂：

> //FW、//AU、//CP、//IN 或 //RT **只能出現一次，且須置於 56a、57a、58a 之中最先出現的欄位**。

**兩側規則不對稱已獲證實。** v7 明訂 MT 為 compatibility view，代表系統會做 MX→MT 呈現——若 MX 在多個 agent 上都帶了 `ClrSysMmbId`，機械回轉必然產出**在 MT 側違規**的電文。Test 3 目前只斷言「不可一律映到 `ClrSysMmbId`」，未涵蓋位置與單次性。

### 3.3（低）R16：貴金屬幣別不得用於 pacs.009

CORE-RULES **R16** `CBPR_Interbank_Settlement_Currency_FormalRule`：

> The codes **XAU, XAG, XPD and XPT are not allowed**, as these codes are only used for commodities.

SSI 以幣別為解析鍵之一。若主檔存在 XAU／XAG／XPD／XPT 的 SSI 記錄，**不得解析到 pacs.009 路由**。建議加入解析階段的幣別前置檢核，並在 `解析結果代碼` 增列對應碼。

---

## 四、SRC-UHB 不在受控資料夾中

`SRC-UHB`（`ISO 20022_Programme_UHB_SR2026_v3.0.pdf`）未與其他 12 份受控二進位檔存放於同一處，我無法驗證其雜湊、位元組數、頁數，以及其全部頁碼錨點：

> p.3 CR3035；pp.20／33–34 Business Service；**p.26 clearing-code comparison**；pp.199／205 settlement account；p.259+ pacs.009；**pp.452–486 pacs.010**

這不是小事：**MT204 的證據鏈實質依賴 UHB。** `Official Profile Evidence` 的 P010 列引用 `SRC-P010-RULES pp.1,3,9; **SRC-UHB pp.3,452–486**`，Payment Message Index 的 MT204 列引用 `SRC-UHB pp.3,33,452–486`。CR3035（Margin Collection UG 退場）的一手依據也記在 UHB p.3。

**建議：** 將 UHB 移入同一受控資料夾，或在 Source Register 明載其保管位置。受控證據分散存放，等同於沒有單一可稽核點。

（另注：p.26 的 clearing-code comparison 正是 3.2 所需的材料。）

---

## 五、順帶發現：Category 1／3／4／6／7 的 SR2026 MRG 已在同一資料夾

雖不在本文件範圍，但資料夾中另有：

| 檔案 | 卷冊 | Bytes |
|---|---|---|
| `us1m_20260717.pdf` / `us1m_20250718.pdf` | Category 1（客戶匯款） | 3,389,263 / 2,121,496 |
| `us3ma_20260717.pdf` / `us3mb_20260717.pdf` / `us3u_20260717.pdf` | Category 3（Treasury） | 4,167,299 / 3,343,032 / 507,703 |
| **`us4m_20260717.pdf`** | **Category 4（託收）** | 898,897 |
| `us6mr_20260717.pdf` | Category 6 | 978,554 |
| **`us7m_20260717.pdf`** | **Category 7（信用狀與保證）** | 3,013,082 |

另有 `pacs.008` Core 與 STP 的 CBPR+ SR2026 UG（未登錄於 Source Register——正確，MT1xx 不在範圍）。

**MT4xx／MT7xx 的一手覆核現在有材料了。** 本文件建立的方法（逐欄 status／option／NVR 覆核 → 跨欄位規則 → 角色所有權分類 → 頁碼機械產生 → 受控證據登錄）可直接套用。

---

## 六、修訂評分

| 構面 | 權重 | v7（前次） | v7（修訂） | 說明 |
|---|---:|---:|---:|---|
| SWIFT MRG 正確性 | 30 | 30 | **30** | 不變 |
| ISO 20022 對應正確性 | 20 | 20 | **20** | 五個 profile 之 message definition identifier 與 Business Service **全部逐頁比對相符**，無一處錯誤 |
| 範疇與治理決策 | 20 | 20 | **20** | 不變 |
| 證據與可稽核性 | 15 | 14 | **14** | 12／12 受控檔案雜湊、位元組數、頁數全數通過獨立驗證，Register 記載零錯誤。扣分：supersession 鏈雜湊不全、外置 manifest 保管未指定、**SRC-UHB 未與其他受控檔案同處存放** |
| 缺口揭露與測試完整性 | 15 | 13 | **12** | 取得 UG 後發現第三項、且最根本的缺口：CBPR+ agent identification 規則族（R17／R18／R19／R20 及 R21–R26）全篇未出現 |
| **總計** | **100** | 97 | **96** | |

**96／100。**

### 為什麼分數降了 1 分

**不是文件退步，是證據變強、看見了原本看不見的東西。** 3.1 的缺口在 v5、v7 都存在，只是沒有 UG 就無從發現。同一時間，證據構面從「無法驗證」變成「12／12 通過」——那是文件本身做對了事：它記的雜湊全對，頁碼錨點全中。

若要一句話總結：**這份文件的證據登錄品質是我在這個專案裡看過最好的；它的測試矩陣還缺三條規則。**

### 剩下的 4 分

| 分數 | 項目 | 性質 |
|---:|---|---|
| 2 | 新增 Test 9（agent identification R20／R17／R19 ＋ R18 同國例外）；並將 R21–R26、R22 納入 Test 2 | **需要判斷，材料已在手；一天** |
| 1 | Test 3 補「單次出現且置於最前」斷言（MX→MT 方向）；R16 幣別檢核 | **半天** |
| 1 | UHB 歸位、supersession 鏈補雜湊、manifest 保管方式 | **機械性；數分鐘**（雜湊見下） |

供補入 supersession 鏈：

| 版本 | SHA-256 |
|---|---|
| v5 | `77E6C5B0B0E67C21912A4728FED62038E71D6F38B9F6EA5860077D3BE2FCCDFE` |
| v4 | `3AC088602967FAC65D426D7FE5E2E28D2FB12D0EB84943DC8DFCF9FBB25B4723` |
| v3 | `4390BD27DBE70D6784366F8CCC9B04D0BE72965EFDE9EAA670D8EFF0234663F4` |
| Test1（原稿） | `42F45FFE7C794E6B6F46EA19FFE3F254152EDC4E48E2D08FB5D38363916FD31A` |

---

## 七、對 SSI 主檔的直接影響（超出本文件範圍，但必須提出）

3.1 的規則族不只影響測試矩陣，它直接推翻了 SSI 資料模型目前的充分性假設：

| 需求 | 依據 | 現況 |
|---|---|---|
| 每筆 SSI 須可依 R20／R17／R19 之一產生合法 agent | CBPR+ Agent Identification Principles | `ssiactive*.xlsx` **無 Name、無 Postal Address 欄位** |
| 無 BIC 時須有 Name ＋ 結構化／混合地址（至少 Town Name、Country） | R17／R19 | 缺 |
| 僅用 clearing code 須全鏈同國 | R18 | 缺全鏈國別；`Counterparty Country`／`Settlement Country` 不足以判定 |
| Instructing／Instructed Agent 必須有 BICFI | Principles Note | 未檢核 |
| 結構化地址元素不得於 AddressLine 重複 | R22 | 無地址欄位，無從檢核 |

**建議把這一段獨立成一份 SSI 資料模型缺口清單**，因為它要動的是主檔結構與資料補正，前置時間遠長於改一張表。

---

Sources（全部經本次獨立驗證，除另註明）：
- `CBPRPlus_SR2026_(Combined)_CBPRPlus-pacs_009_001_08_FinancialInstitutionCreditTransfer_20260522_0127.pdf`（`2373FC20…BA28`，349,577 bytes，57 頁）— pp.3, 10, 13；R16–R26
- `CBPRPlus_SR2026_(Combined)_CBPRPlus-pacs_009_001_08_COV_…_20260522_0129.pdf`（`7B447CD7…F58A`，949,771 bytes，126 頁）— pp.10, 13, 109
- `CBPRPlus_SR2026_(Combined)_CBPRPlus-pacs_009_001_08_ADV_…_20260522_0131.pdf`（`4BBEAAA0…8668`）— p.10
- `CBPRPlus_SR2026_(Combined)_CBPRPlus-pacs_010_001_03_Interbank_Direct_Debit_20260526_1249.pdf`（`6D2B5FDA…A54C`）— p.9
- `CBPRPlus_SR2026_(Combined)_CBPRPlus-camt_057_001_06_NotificationToReceive_20260525_1853.pdf`（`53A655EA…B95D`）— p.9
- `us2m_20260717.pdf`（`64483D7F…8323`）／`us2m_20250718.pdf`（`820581F8…845C`）
- `ISO 20022_Programme_UHB_SR2026_v3.0.pdf` — **未取得，未驗證**
