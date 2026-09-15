# MT2XX 支援標準 SSI — SR2026 MRG 與 ISO 20022 對應覆核版 v5
## 審查意見與評分

**審查對象：** `MT2XX_支援標準SSI_SR2026_MRG與ISO20022對應覆核版_v5.xlsx`
SHA-256 `77E6C5B0B0E67C21912A4728FED62038E71D6F38B9F6EA5860077D3BE2FCCDFE`
**對照基準：** v4（86／100，六項缺陷 ＋ 一項未點出之議題）
SHA-256 `3AC088602967FAC65D426D7FE5E2E28D2FB12D0EB84943DC8DFCF9FBB25B4723`
**審查日期：** 2026-09-09
**覆核範圍：** SWIFT Standards MT **Category 2** 全部電文（MT200／201／202／202 COV／203／204／205／205 COV／210）。
Category 1、4、7 **不在本次範圍內**，本審查不就其覆蓋度加減分。

> **修訂註記（2026-09-09，同日）：** 本文件初版評 93 分，其中一項發現（原 5.1）將專案整體的 Category 1／4／7 缺口套用到本文件，屬範圍認定錯誤，已撤回；另修正一處無名目的扣分。**現行評分 97／100**，計分更正說明見第六節。

---

## 一、v4 七項發現的處理：全部關閉，其中四項優於我的建議

| v4 發現 | v5 處理 | 評價 |
|---|---|---|
| 4.1 九個 MRG 頁碼全數偏移 | 九個全部改正，且加註「（printed pages）」；Source Register 載明「由 PDF section boundaries 機械產生」 | **關閉。** 我對 PDF 逐頁重新定位每個 `MT nnn Scope` 標題，九筆與 v5 記載**完全相符**（見下節） |
| 4.2 COV Seq B 的 option 字母被刪除 | 兩列 COV 皆補回完整 option 集合，並加一行「Seq B 的 56a／57a 允許 option C，Seq A 不允許；兩段不得共用 mapping row」 | **關閉，且比我建議的更完整**——連 Seq A 的 `56a(A,D)／57a(A,B,D)` 也一併標出，讓差異在同一格內可直接對比 |
| 4.3 legacy channel 缺 fail-closed 定義 | 補「任一逐筆 SSI 未解析即整份 fail-closed、不部分放行」，並標明**「內部安全政策，非 SWIFT NVR」**；col 10 加上 C01 理由 | **關閉，且優於我的建議。** 我只要求補規則，v5 同時做了來源分層標註——這正是先前程式碼裡 `SWIFT_NVR` / `LOCAL_POLICY` 的紀律，寫進文件層是對的 |
| 4.4 MT205「無 54a」警語從 Scope 表消失 | MT205 與 MT205 COV 兩列皆補回 | 關閉 |
| 4.5 pacs.010 的 CBPR+ 範圍問題應與版本問題分層 | 範圍問題**已查證關閉**（`pacs.010（CBPR+ scope 已確認）`），版本問題保留為 `EXACT PROFILE PENDING`，並引 SR2026 CR3035 | **關閉。** 我已獨立驗證，見第三節 |
| 4.6 MT210 的 C06 攔截責任未指定 | 明確歸屬：輸出 MT210 時由 Notification profile 於送 FIN 前 enforce C06；輸出 camt.057 時改用其 SR2026 UG，**不沿用 MT C06** | **關閉，且優於我的建議。** 我只要求指定責任人，v5 多做了一層——指出 camt.057 不應機械套用 MT 的網路規則。這是對的：C06 是 FIN 的欄位互斥規則，MX 的對應約束由 UG 表達，兩者不可直接搬 |
| 第三節：contingency 不等於目標狀態 | 欄名改為「目標格式／FIN contingency input」；Index 規則 1 重寫為 `transportFormat`（由 profile 固定為 MX）vs `displayFormat`（僅改 renderer） | **關閉，且解法比我提的好。** 我只建議改標籤，v5 把它拆成兩個不同的 API 概念——標籤會被忽略，型別不會 |

### 頁碼複驗

我重新對 `us2m_20260717.pdf` 逐頁定位，與 v5 記載對照：

| MT | v5 記載 | 我重新定位 | 結果 |
|---|---|---|---|
| MT200 | 13–24 | 13–24 | 相符 |
| MT201 | 25–38 | 25–38 | 相符 |
| MT202 | 39–58 | 39–58 | 相符 |
| MT202 COV | 59–93 | 59–93 | 相符 |
| MT203 | 94–115 | 94–115 | 相符 |
| MT204 | 116–133 | 116–133 | 相符 |
| MT205 | 134–152 | 134–152 | 相符 |
| MT205 COV | 153–188 | 153–188 | 相符 |
| MT210 | 189–201 | 189–201 | 相符 |

**9／9 相符。** 位元組數亦相符：`1,291,919` 與 `1,009,135`，與檔案實際大小一致。

---

## 二、v5 自行更正了 v4 的一項引用錯誤

v4 引用「PMPG Cover Payments MPG **v4.1（2026）**」，指向 `swift-resource/252248/download`。
v5 改為 `pmpg-cover-payments-market-practice-guidance-v4-february-2024.pdf`。

我查證：swift.com 上該文件的正式標題為 **Cover Payments Market Practice Guidelines - Version 4.0, FEBRUARY 2024**。**v5 的引用正確，v4 的「v4.1（2026）」是錯的。** 這一項我在 v4 審查時沒有查到，是 v5 自行發現並更正的。

---

## 三、新事實主張的獨立驗證：pacs.010 的 CBPR+ 範圍

v4 寫「exact CBPR+/market profile 待確認」；v5 升格為「**CBPR+ scope 已確認**」，引 SR2026 CR3035。這是本版唯一一項從「待確認」變成「已確認」的事實主張，我做了獨立查證。

SWIFT 的 *ISO 20022 in bytes — Call-to-action for November 2026* 原文：

> **CR 3035 merges the pacs.010 and pacs.010 Margin Collection Usage Guidelines. The pacs.010 Margin Collection Usage Guideline will no longer exist.**

**主張成立。** 推論鏈是有效的：CBPR+ 若不涵蓋 pacs.010，就不會存在「CBPR+ pacs.010 Usage Guideline」，更不會有一個 SR2026 CR 去合併它。v5 把範圍問題與版本問題分層之後，範圍這一層確實可以關閉。

### 但這則證據還有一個 v5 未取用的操作性後果

CR3035 不只是「證明 pacs.010 在範圍內」的旁證，它本身是一個**會影響 MT204 目標 profile 的 SR2026 變更**：

> The pacs.010 Margin Collection Usage Guideline **will no longer exist**.

意即：**任何 profile registry 中指向「pacs.010 Margin Collection UG」的項目，自 SR2026 起必須退場**，改指向合併後的單一 pacs.010 UG。MT204 是財務市場直接借記，涵蓋保證金追繳情境，正好落在被合併掉的那一支上。

建議在 MT204 列的 BA decision 補一句：**目標 profile 必須是合併後的單一 pacs.010 UG，不得沿用 Margin Collection UG。**

順帶一提，這是「Cat 2 MT 側無變更、MX 側有變更」的**具體實例**——正好佐證 v5 在 Index 規則 6 新加的那句「Cat2 MT MRG 無變更不得擴張到 MX stack」。這個例子值得直接寫進該規則的說明欄，比抽象敘述有說服力。

---

## 四、兩張新表的評價

### 4.1 Source Register：做法正確，尤其是誠實標記

`WEB-LIVE-REFERENCE` 這個標記，配上「**此列是 web evidence，不冒充已封存 binary**」，是整份文件裡最值得肯定的一句。多數送審文件會把 URL 直接當成證據，v5 明確區分「已封存並雜湊的二進位檔」與「線上參照」，並把封存動作列為 Gate 前待辦。這是正確的證據紀律。

### 4.2 Translation Fidelity Tests：超出我的要求

我在 v4 審查只建議「加一條驗收準則」。v5 給的是八個 golden-fixture 測試案例，含 Assertions 與 Failure policy。其中第 5 項最能看出品質：

> **MT200 53B Party Identifier only** — Assertions: Verify whether/how account reaches SttlmInf/SttlmAcct; **no assertion until official fixture exists**
> Failure policy: No verified mapping → `PROFILE_INCOMPLETE`
> Gate status: **RELEASE BLOCKED BY RULE SOURCE**

**在沒有官方 fixture 之前拒絕寫下斷言**，而不是猜一個看起來合理的映射然後標成已驗證——這是對的認知姿態，也正是我在 v3 犯 52a 錯誤時缺的那一步。

第 3 項「Do not blanket-map to ClrSysMmbId」同樣切中要害：`//CP`、`//CH`、`//SW`、`//RU` 與 `//FW` 各變體的語意不同，統一映到 `ClrSysMmbId` 是最容易發生、也最難在測試中被發現的錯誤。

---

## 五、本次新發現（全部低度）

### 5.1 【已撤回】「仍待取得之卷冊」那一列被刪除

**原發現：** v4 的 `SR2025 vs SR2026` 工作表有一列載明 Category 1 與 Category 4／7 的 MRG 尚未取得，v5 將其換為只列 MX stack 項目的「仍待取得之受控文件」。我原判定為缺口揭露的退步。

**撤回理由：** Category 1／4／7 本就不在本次覆核範圍內。既然不在範圍，本文件的「仍待取得」欄位就不該承載它——那是專案整體的追蹤項，屬 Programme 層級的 Gate Register，不屬這份 MT2XX 專用文件。

**v5 的處理是對的。** 把範圍外項目寫進本文件的待辦欄，反而會模糊本文件的邊界，讓讀者誤以為它有意涵蓋 MT1xx／MT4xx／MT7xx。v5 將該欄收斂為「本文件所依賴、但尚未取得的受控文件」（Additional NVR、MyStandards exact UG、Translation Portal rules）——這三項確實是本文件結論的前提，範圍界定精準。

此項不計扣分。保留紀錄以維持審查軌跡完整。

### 5.2（低）文件本身沒有自我識別列

Source Register 完整記錄了**外部**證據，但文件**自己**沒有一列說明：本檔版本（v5）、自身 SHA-256、取代哪一版（v4／Test1）、以及取代的理由。

貴行在 G0 送審包已建立 append-only 與 supersession 的紀律，這份文件將來要被 Register 引用，卻不帶自我識別，會在引用時產生與先前 `G0-PACKAGE-REVIEW-02` 同型的問題——引用方與被引用方各自記載、無法交叉驗證。

建議加一列：

| Evidence ID | Title | Version | SHA-256 | Supersedes |
|---|---|---|---|---|
| `SELF-MT2XX-V5` | MT2XX 支援標準 SSI 覆核版 | v5 | `77E6C5B0…CCDFE` | v4（`3AC08860…4723`）、Test1 |

### 5.3（低）`Bytes / snapshot policy` 一欄混用兩種型別

SRC 列填的是數字（`1291919`），WEB 列填的是政策句子（「存取日期+URL 已記錄；Gate 前封存…」）。同一欄混用數值與敘述，機械檢核（如「位元組數須為正整數」）就做不了。建議拆成 `Bytes`（數值，可空）與 `Snapshot policy`（敘述）兩欄。

### 5.4（低）`www2.swift.com/go/book/cat2` 需標明取得條件

這個 URL 取自 MRG 封面的「Link to this document」，引用正確。但它需要 SWIFT 訂閱帳號才能存取——**外部稽核者無法據此自行取得檔案驗證雜湊**。建議在 `Evidence scope / limitation` 欄補一句「需 SWIFT 訂閱權限；外部稽核請以本列 SHA-256 對照本行封存副本」。

### 5.5（低）Translation Fidelity Tests 缺責任人與證據產出欄

八個案例都有 Assertions 與 Failure policy，但沒有「誰負責」與「通過後產出什麼證據」。既然其中兩項已標為 `RELEASE BLOCKED BY RULE SOURCE`，這張表實質上是一份發布阻擋清單，應有負責人與證據 artifact 欄位才能追蹤到關閉。

---

## 六、評分

| 構面 | 權重 | v4 | v5 | 說明 |
|---|---:|---:|---:|---|
| SWIFT MRG 正確性 | 30 | 27 | **30** | COV option 集合補回並加 Seq A/B 對比；MT205／205 COV 無 54a 補回；C06 責任歸屬且區分 FIN 與 MX 驗證。我對九個電文的 format／status／option／NVR／Usage Rule 全數複核，**未發現任何錯誤**，故給滿分 |
| ISO 20022 對應正確性 | 20 | 19 | **19** | pacs.010 之 CBPR+ 範圍已以 CR3035 關閉並經我獨立查證；Cover MPG 版本自行更正 v4 之誤。扣分：CR3035 之操作性後果（Margin Collection UG 退場）未取用 |
| 範疇與治理決策 | 20 | 19 | **20** | `transportFormat` vs `displayFormat` 的型別化拆分；legacy atomic fail-closed 並標為內部政策而非 NVR。無扣分項 |
| 證據與可稽核性 | 15 | 9 | **13** | 頁碼 9／9 複驗相符、雜湊與位元組數相符、官方 URL、`WEB-LIVE-REFERENCE` 誠實標記。扣分：無自我識別列（主要）、欄位型別混用、取得條件未標 |
| 缺口揭露之完整性 | 15 | 12 | **15** | Translation Fidelity Tests 超出要求；「Cat2 無變更」之嚴格範圍限定處理得好；「仍待取得」欄收斂至本文件真正依賴的受控文件，範圍界定精準 |
| **總計** | **100** | **86** | **97** | |

**97／100。**

### 兩處計分更正（相對於我第一版審查的 93 分）

1. **撤回 5.1**（Cat 1／4／7 缺口揭露），缺口揭露構面由 12 回到 **15**。理由見 5.1。
2. **SWIFT MRG 正確性由 29 改為 30。** 我原本保守扣了 1 分卻說不出扣在哪——複核九個電文後確實沒找到錯誤，扣一個講不出名目的分數不是嚴謹的做法。

### 剩下的 3 分

| 分數 | 項目 | 性質 |
|---:|---|---|
| 2 | 自我識別列（5.2）為主，加上欄位拆分、取得條件、責任人欄（5.3–5.5） | **機械性，約半小時** |
| 1 | CR3035 操作性後果寫進 MT204 列（第三節） | **一句話** |

這 3 分全部是文字工作，**一小時內可完成，之後本表為 100／100。**

Translation Fidelity Tests 中兩項標為 `RELEASE BLOCKED BY RULE SOURCE` 的案例**不扣分**——它們需要受控文件到位，而 v5 已正確地把它們標成阻擋項並拒絕在缺乏 fixture 時寫下斷言。這是文件能做到的最好狀態，不應該因為外部文件未到位而扣文件的分。

---

## 七、建議：本表修完那 3 分即可定版

這是第三輪（v3 → v4 → v5），每一輪都確實變好，而且 v4 與 v5 各更正了我的一項錯誤（52a 角色歸屬、Cover MPG 版本），本輪我又撤回一項發現。**文件面已到頂。**

接下來唯一擋在發布前面的，是**取得 Translation Portal / MyStandards exact rules**。Translation Fidelity Tests 的八個案例目前全部無法執行，其中兩個已標為發布阻擋——這是取得受控文件的問題，不是寫作問題，也不是這張表能自己解決的。

Additional NVR 同理：v5 已在 Source Register 中以 `LIMIT-NVR` 誠實列出，並明訂「未取得前不可聲稱完整 contingency NVR coverage」。這個處理方式本身就是正確答案。

---

Sources：
- SWIFT Standards MT Category 2 Message Reference Guide, November 2026（`us2m_20260717.pdf`，SHA-256 `64483D7F…8323`，1,291,919 bytes）
- SWIFT Standards MT Category 2 Message Reference Guide, November 2025（`us2m_20250718.pdf`，SHA-256 `820581F8…845C`，1,009,135 bytes）
- [Swift: ISO 20022 in bytes for payments — Call-to-action for November 2026（CR3035）](https://www.swift.com/standards/iso-20022/iso-20022-bytes/call-action-november-2026)
- [PMPG Cover Payments Market Practice Guidelines v4.0, February 2024](https://www.swift.com/sites/default/files/files/pmpg-cover-payments-market-practice-guidance-v4-february-2024.pdf)
- [PMPG End of Coexistence Considerations v1.0 (July 2025)](https://www.swift.com/sites/default/files/files/pmpg_end-of-coexistance-considerations_202507_v1.0.pdf)
- [Swift: Payments Market Practice Group](https://www.swift.com/standards/market-practice/payments-market-practice-group)
