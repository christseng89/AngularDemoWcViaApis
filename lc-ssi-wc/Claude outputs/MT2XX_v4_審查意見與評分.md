# MT2XX 支援標準 SSI — SR2026 MRG 與 ISO 20022 對應覆核版 v4
## 審查意見與評分

**審查對象：** `MT2XX_支援標準SSI_SR2026_MRG與ISO20022對應覆核版_v4.xlsx`
SHA-256 `3AC088602967FAC65D426D7FE5E2E28D2FB12D0EB84943DC8DFCF9FBB25B4723`
**對照基準：** 我的 v3（`Test1_修訂_僅支援標準SSI_v3_MRG覆核版.xlsx`）
**一手依據：** `us2m_20260717.pdf`（SR2026 Cat 2 MRG，212 頁）、`us2m_20250718.pdf`（SR2025）
**審查日期：** 2026-09-09

---

## 一、v4 更正了我的一項實質錯誤——我確認接受

### 1.1 52a 的角色歸屬：v4 對，我錯

我在 v3 把 MT202／MT203／MT202 COV 的 `52a Ordering Institution` 標為 **【SSI／本行】**。v4 改為 **【TXN／MESSAGE】**。

我回查 MRG 欄位定義，v4 是對的，而且是定義層級的對錯，不是詮釋差異：

> **MT202 - 5. Field 52a: Ordering Institution**
> Definition: This field specifies the ordering financial institution **when other than the Sender of the message**.

也就是說，**52a 一旦出現，依定義它就不是本行**。把它標成「本行 Own SSI」在語意上直接矛盾。我當時是從「52a 通常填我們自己的 BIC」這個實務印象推的，沒有回查定義。

MT202 的 Usage Rule 進一步說明了它的傳遞語意：

> When the Sender of an initial MT 202 is also the ordering institution, that is, **this field is not used**, that Sender will be identified in this field in any **subsequent** messages as the ordering institution.

初始電文中「本行就是 ordering institution」的表達方式是**不填 52a**，而不是填自己。這條鏈到了 MT205 就成為必填。

### 1.2 MT205 的 `PREVIOUS MESSAGE CONTEXT` 標記，MRG 有直接依據

v4 把 MT205／MT205 COV 的 52a 標為 **【PREVIOUS MESSAGE CONTEXT】**，並主張缺值時應回 `MESSAGE_CONTEXT_MISSING` 而非 `SSI_NOT_FOUND`。MRG 原文：

> **MT205 - 5. Field 52a**　Presence: **Mandatory**
> Usage Rules: **If there was no ordering institution specified in the initial message, the Sender of that message will be the ordering institution in this message.**

MT205 的 52a 值完全由前手 Category 2 指示決定——前手有 52a 就沿用，前手沒有就填前手的 Sender。這條路徑上**沒有任何一步會查 SSI 主檔**。

因此 `MESSAGE_CONTEXT_MISSING ≠ SSI_NOT_FOUND` 這個區分是正確且必要的：兩者的修補動作完全不同（前者要回去找前手電文，後者要建 SSI 資料），錯誤碼混用會把作業導向錯的隊列。

**這一條我完全接受，並建議把「Definition 中出現 *when other than the Sender* 者一律不得由 SSI 生成」寫成通則檢核，套用到 MT1xx／MT4xx／MT7xx 的 52a。**

### 1.3 由此衍生的通則，v4 已寫進 Index 規則第 4 條

> 5x tag presence 不等於 SSI eligibility；52a/58a 等依 message context/transaction role 驗證。
> 不可由同一 SSI record 複製到 ordering、routing、beneficiary roles。

這正是我 v3 錯誤的一般化形式。這一條寫得比我原本的分類更根本——我的【SSI】/【TXN】二分是**依欄位**分，v4 是**依角色所有權**分。後者才是對的，因為同一個 tag 在不同電文、不同 sequence 可以屬於不同角色（MT204 的 53a 就是最極端的例子）。

---

## 二、MT201／MT203 的 `NOT SUPPORTED` 主張——已用一手來源驗證成立

v4 主張 MT201／MT203「自 2025-11-22 起 FIN FI-to-FI rejected」，屬 `NO 1:1 MAPPING / FIN FI-TO-FI REJECTED`。

**兩條獨立證據都支持：**

**證據一（PMPG end-of-coexistence considerations，v4 自己引用的來源）：**

> As of 22 November 2025, the following FIN messages will be **permanently rejected (NAK'ed)** for FI-to-FI flows: ⇒ **MT201 / MT203**.

而具備 contingency 轉換路徑的僅有：MT103／103 STP → pacs.008；MT200／202／202 COV／205／205 COV → pacs.009／009 COV。

**證據二（我們手上的 SR2025 Cat 2 MRG，Changes 章節原文）：**

> MT 103, MT 103 STP, MT 200, MT 202, MT 202 COV, MT 205, and MT 205 COV, sent FI-to-FI from 22 November 2025 will be automatically subject to contingency processing.

這份清單**恰好不含 MT201、MT203、MT204、MT210**。兩份來源的名單完全互補、無矛盾。

v4 保留「合法 legacy channel 仍可解析」的措辭也是對的——被拒絕的是 **FI-to-FI flows**，不是該電文型別本身。這個限定詞下得精準。

---

## 三、v4 未點出的一件事：contingency 不等於目標狀態

這是我認為 v4 最重要的**遺漏**，而且它會反過來影響 Index 的驗收準則。

MT200／202／202 COV／205／205 COV 走 FI-to-FI 時是**自動被轉成 pacs.009**。也就是說：**本行組出來的 MT，不是對手行收到的東西。** 這對 SSI 有三個直接後果：

### 3.1 option A/D 的清算碼問題在轉換後會被放大

我在 v3 findings 指出：`//CP`（CHIPS Participant）、`//CH`（CHIPS Universal）、`//SW`（瑞士 BC／SIC）、`//RU`、以及 9 位數全碼的 `//FW`，**只在 option D 合法**。

現在再加一層：這些值經 contingency 轉換後要落到 pacs.009 的 `ClrSysMmbId`。**MT option D 的 Name and Address 與 pacs.009 的結構化地址要求並不對等**，轉換保真度必須實測。建議在 Index 的驗收準則加一條：

> 對每個 `Clearing System` 值，驗證 MT（option A 或 D）→ pacs.009 轉換後 `ClrSysMmbId`／`Nm`／`PstlAdr` 之內容不遺失、不截斷。

### 3.2 MT200 的 53B「僅 Party Identifier」在 pacs.009 無對等結構

MT200 的 53B 在多帳戶情境下只填帳號、不填 Location。pacs.009 對應的是 `SttlmInf/SttlmAcct`，語意層級不同。這是 MT→MX 轉換中最容易靜默遺失的一種欄位，須列入測試。

### 3.3 Index 規則第 1 條的前提需要修正

現行規則第 1 條說：

> `responseFormat` 只能是 renderer choice。切換 MT/MX 不得改變 routeId、RMA decision、Nostro decision、snapshot hash。

**驗收準則本身完全正確**（我認為這是整份 Index 最好的一條）。但在 FI-to-FI 情境下，**本行沒有選擇權**——選 MT 也會被轉成 MX。建議把 `可選回覆格式` 欄的 `MT200 | MX pacs.009` 改標為：

> `MX pacs.009`（目標）／`MT200`（僅 contingency，非可持續選項）

否則使用者會誤以為 MT 是一個對等的長期選項。

---

## 四、須修正的缺陷

### 4.1（中）九個 MRG 頁碼引用**全部錯誤**

`Payment Message Index` 的「依據」欄逐列引用頁碼。我對 PDF 逐頁定位每個 `MT nnn Scope` 標題，結果如下：

| MT | v4 宣稱 | 實際 | 差異 |
|---|---|---|---|
| MT200 | pp.13–21 | **pp.13–24** | 結束頁少 3 |
| MT201 | pp.24–38 | **pp.25–38** | 起始頁少 1 |
| MT202 | pp.38–57 | **pp.39–58** | 前後各少 1 |
| MT202 COV | pp.58–92 | **pp.59–93** | 前後各少 1 |
| MT203 | pp.93–114 | **pp.94–115** | 前後各少 1 |
| MT204 | pp.115–132 | **pp.116–133** | 前後各少 1 |
| MT205 | pp.133–151 | **pp.134–152** | 前後各少 1 |
| MT205 COV | pp.152–187 | **pp.153–188** | 前後各少 1 |
| MT210 | pp.188–201 | **pp.189–201** | 起始頁少 1 |

系統性偏移 1 頁（MT200 起始頁正確，結束頁誤把 Examples 段排除）。

**這一項要優先修，理由不是數字本身，而是位置**——這是 Gate 送審用的 Source Register 等級欄位。稽核者翻到 p.24 找 MT201，看到的是 MT200 的 Examples，會直接質疑整份文件的引用可信度。建議同時加一道機械檢核：由 PDF 目錄自動產生頁碼，不手抄。

### 4.2（中）COV Seq B 的 option 字母被刪除了

v3 的 Seq B 明列：`56a — A,C,D`、`57a — A,B,C,D`；Seq A 則是 `56a — A,D`、`57a — A,B,D`。
v4 col 6 改成：

> Seq B：50a／52a／56a／57a／59a 【UNDERLYING TXN — 原樣帶入，不重新 Resolve】

「不重新 Resolve」的**決策**是對的，但把 option 集合刪掉會讓實作者看不出 **Seq A 與 Seq B 的允許 option 不同**——而這正是最容易共用同一組 mapping 而產生格式違規的地方。C68 的配對規則在 col 7 保留了，option 差異沒有。

**建議加回一行註記即可：** 「Seq B 之 56a／57a 允許 option C，Seq A 不允許；兩段不得共用 mapping row。」

### 4.3（中）MT201／MT203 的 legacy channel 缺 fail-closed 定義

v4 自己在 col 9 寫「合法 legacy channel 可解析共用 53B／53a／54a 與逐筆 56a／57a」，但 col 10 只寫：

> Payment Index 不提供 MT/MX 二選一；回覆 NOT_SUPPORTED（FIN FI-to-FI）或轉原生 ISO redesign。

**那條 legacy 路徑上若 SSI 查不到，行為未定義。** 而且 v3 有一句被刪掉了：

> 任一筆未解析即整份電文不產生（**不做部分放行**）。

MT201／MT203 是多筆電文（2–10 次重複序列），**部分放行是真實風險**：某一筆解析失敗但其餘照送，會產生金額與 19（Sum of Amounts）不符，直接觸發 C01。這句話應該加回。

### 4.4（低）MT205「無 54a」的警語從 Scope 表消失

該警語仍在「MRG 覆核結果」工作表第 1 列，但 Scope 表是實作者日常會看的那張，而 MT205 又是 v4 標為 `SUPPORTED` 的電文。建議在 col 6 保留一行 `※MT205／MT205 COV 無 54a`。

### 4.5（低）MT204 的 pacs.010 待確認項目，範圍應再放大

v4 寫「exact CBPR+/market profile 待確認」，誠實。但更根本的問題是：**pacs.010 是否在 CBPR+ 範圍內本身就存疑**——MT204 受 MUG（Message User Group）控管，是雙邊協議下的特殊電文，其 ISO 對應未必落在跨境 CBPR+ 的治理範圍。

建議把待確認項拆成兩層：
1. pacs.010 是否納入 CBPR+ 範圍（範圍問題）
2. 若納入，exact UG version／schema 為何（版本問題）

只列第 2 層會讓人誤以為第 1 層已確定。

### 4.6（低）MT210 的 C06 攔截責任未指定

MT210 的 C2（錯誤碼 **C06**：50a 與 52a 二者擇一、不得同時出現、不得同時缺席）在 col 7 保留了，但 col 9／col 10 改寫為「不進入 Payment SSI Resolver」「走獨立 Notification profile」之後，**C06 的送出前攔截由誰負責就沒有歸屬了**。

MT210 仍然要產生，這條網路驗證規則仍會 NAK。建議在 Notification profile 的驗收準則明列 C06。

---

## 五、來源與覆核限制表的兩點補強

這張表本身是 v4 最值得肯定的設計之一——明列「未取得 Additional NVR 前不可聲稱完整 SR2026 NVR coverage」，是正確的治理姿態。兩點補強：

**5.1 Primary local 來源不可稽核。** 目前記載為：

```
D:\Baseline_V6_20251231\lc-ssi-wc\us2m_20260717.pdf
```

Gate 稽核者無法據此取得檔案，也無法確認拿到的是同一份。應改為「檔名 ＋ SHA-256 ＋ 取得日期 ＋ 官方來源 URL」。兩份 MRG 的雜湊我已算過：

| 檔案 | SHA-256 |
|---|---|
| `us2m_20260717.pdf` | `64483D7F7C094DB28E03791AB6BBC7A0522DAEC90487A7DD834228E848FA8323` |
| `us2m_20250718.pdf` | `820581F85FC9EFA34A56F1A54FE66DDA684C6C2FFE9533E38F096A2176B9845C` |

**5.2 「Cat 2 SR2026 無變更」應升格為已驗證事實。** 兩版 MRG 全文 diff（濾除頁首頁尾後）僅四處差異、全部非規格內容，且 SR2026 版明載 *Category 2 - Financial Institution Transfers is not impacted by the November 2026 Standards release*。這比目前 TargetStandardsBaseline 以公告推論的敘述強得多，應直接取代。

---

## 六、評分

| 構面 | 權重 | 得分 | 說明 |
|---|---:|---:|---|
| SWIFT MRG 正確性 | 30 | 27 | 角色歸屬修正正確且有定義層級依據；status／option／NVR 皆與 MRG 相符。扣分：COV Seq B 之 option 集合被刪除 |
| ISO 20022 對應正確性 | 20 | 19 | pacs.009 Core／COV、pacs.010、camt.057 對應皆正確；MT201／203 無 1:1 對應之判斷正確。扣分：pacs.010 之 CBPR+ 範圍問題未拆出 |
| 範疇與治理決策 | 20 | 19 | fail-closed、NOT_SUPPORTED、獨立 profile、role ownership 通則——這一構面是本版最強處。扣分：legacy channel 之 fail-closed 未定義 |
| 證據與可稽核性 | 15 | 9 | 九個頁碼引用全數偏移；Primary source 記為本機路徑、無雜湊 |
| 缺口揭露之完整性 | 15 | 12 | 來源與覆核限制表誠實且具體。扣分：contingency 不等於目標狀態這一層未點出，導致 Index 的「可選回覆格式」有誤導性 |
| **總計** | **100** | **86** | |

**86／100。**

### 這個分數該怎麼讀

v4 在**判斷力**上明顯優於我的 v3——role ownership 這一刀切得比我準，而且切在正確的層級上。扣掉的 14 分裡有 **11 分是機械性瑕疵**（頁碼、雜湊、刪掉的 option 註記、缺一句部分放行禁令），全部是幾十分鐘的工作。

真正需要想清楚的只有 3 分：**contingency 不等於目標狀態**。這一點會影響 Index 的呈現方式，而不只是加一欄註記。

---

## 七、建議的下一步

1. **修頁碼**（4.1）——優先，且改為由目錄自動產生
2. **加回三句話**：COV Seq B option 差異（4.2）、MT201/203 不做部分放行（4.3）、MT205 無 54a（4.4）
3. **重寫「可選回覆格式」欄**，把 MT 標為 contingency-only（第三節）
4. **Source Register 補雜湊、去本機路徑**（5.1）
5. 取得 **Category 1 MRG** 與 **Category 4／7 MRG**——MT4xx／MT7xx 才是本專案主戰場，目前完全沒有一手覆核

第 1–4 項做完，本表可到 96–97；剩下的分數要靠 Additional NVR 與正式 CBPR+ UG，那是取得文件的問題，不是寫作的問題。

---

Sources：
- SWIFT Standards MT Category 2 Message Reference Guide, November 2026（本機檔 `us2m_20260717.pdf`，SHA-256 `64483D7F…8323`）
- SWIFT Standards MT Category 2 Message Reference Guide, November 2025（本機檔 `us2m_20250718.pdf`，SHA-256 `820581F8…845C`）
- [PMPG End of Coexistence Considerations v1.0 (July 2025)](https://www.swift.com/sites/default/files/files/pmpg_end-of-coexistance-considerations_202507_v1.0.pdf)
- [Swift: ISO 20022 for financial institutions — Navigating the end of coexistence](https://www.swift.com/sites/default/files/files/swift-iso-20022-end-of-coexistence-guide.pdf)
- [Swift: MT to ISO 20022 Conversion FAQ](https://www.swift.com/standards/iso-20022/iso-20022-faqs/mt-iso-20022-conversion)
