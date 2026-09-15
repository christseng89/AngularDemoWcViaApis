# MT2XX 支援標準 SSI — SR2026 MRG 與 ISO 20022 對應覆核版 v7
## 審查意見與評分

**審查對象：** `MT2XX_支援標準SSI_SR2026_MRG與ISO20022對應覆核版_v7.xlsx`
SHA-256 `A655EADE0EBCB9E203A572E7F058A4E3BBBC618261A16F45528AFBCCC73179FF`
**對照基準：** v5（97／100）SHA-256 `77E6C5B0B0E67C21912A4728FED62038E71D6F38B9F6EA5860077D3BE2FCCDFE`
**覆核範圍：** SWIFT Standards MT **Category 2**（MT200／201／202／202 COV／203／204／205／205 COV／210）。Category 1、4、7 不在範圍內。
**審查日期：** 2026-09-09

---

## 零、本次審查的驗證界線——請先讀這一段

v7 新登錄了 **11 份受控二進位檔**（ISO 20022 Programme UHB SR2026 v3.0，以及 pacs.009 Core／COV／ADV、pacs.010、camt.057 的 CBPR+ SR2026 Final UG，各含 detail 與 rules 兩份）。**這些檔案我手上沒有。**

因此本輪審查的驗證強度與前幾輪不同，必須明確區分：

| 我做了什麼 | 涵蓋範圍 |
|---|---|
| **獨立重算並比對** | 僅 `SRC-MT2-2026`／`SRC-MT2-2025` 兩份 MT2 MRG（前輪已完成，雜湊、位元組數、頁碼 9／9 相符）；以及本檔與 v4／v5 之雜湊 |
| **內部一致性複核** | Payment Message Index、Profile Evidence、Source Register、Translation Tests、MT2xx Scope 五張表之間的引用是否自洽 |
| **公開資料合理性檢查** | `pacs.009.001.08` 與已公開之 CBPR+ 素材一致；`swift.cbprplus.*` 命名族系形式正確 |
| **我無法驗證** | 11 份新登錄檔案的 SHA-256、位元組數、頁數；`swift.cbprplus.04` 之 `.04` 版次；所有頁碼錨點（p.3 agent ID、p.10 BizSvc、p.13 SttlmAcct synonym 53B、p.109 underlying UETR、UHB pp.452–486 等） |

**這不是文件的缺陷，是我的取用限制。** 但它必須寫在最前面，因為前幾輪的分數是由我獨立重算背書的，本輪的證據構面不是。

Gate 審查時，這 11 份的驗證方式應為：**以 Source Register 記載之 SHA-256 對本行留存的受控副本重算比對**——這正是 v7 在 `Snapshot policy` 欄寫的「Controlled binary retained; verify SHA-256」。做法本身是對的。

---

## 一、v5 三項未結事項：全部關閉

| v5 未結項 | v7 處理 | 評價 |
|---|---|---|
| 5.2 文件無自我識別列 | 新增 `Document Control` 工作表：Evidence ID `SELF-MT2XX-V7`、Title、Version、Status、Scope、Supersedes 鏈 | **關閉，且解法優於我的建議** |
| 5.3 `Bytes / snapshot policy` 欄混用型別 | 拆為 `Bytes`／`Pages`／`Snapshot policy` 三欄 | 關閉，且多給了頁數 |
| 5.4 `www2.swift.com` 需訂閱、外部稽核取不到 | 欄位改名 `Official source / controlled binary`，每列指名本行留存之受控副本檔名 | **關閉，且優於我的建議。** 我建議加一句說明；v7 的做法是把驗證對象從「線上檔案」改成「留存副本＋雜湊」，稽核路徑實際可走 |
| 5.5 Translation Tests 缺責任人與證據產出 | 新增 `Responsible owner` 與 `Evidence artifact on closure` 兩欄，八列全數填實 | 關閉 |
| 第三節 CR3035 操作性後果 | `Official Profile Evidence` 之 P010 決策欄寫入 **「Registered; old Margin Collection UG forbidden」**；Index 規則 6 補「不得解析到已退場 Margin Collection UG」 | **關閉，且升格為 guardrail 而非附註** |

### 自我識別列的解法比我提的好

我在 v5 審查建議「加一列填入本檔自身 SHA-256」。**這個建議本身有瑕疵——檔案不可能包含自己的雜湊。** v7 的處理是：

> **v7 integrity** ｜ External manifest: `MT2XX_支援標準SSI_SR2026_MRG與ISO20022對應覆核版_v7.sha256.txt` ｜ **Whole-file SHA-256 is external to avoid self-reference**

把整檔雜湊外置於獨立 manifest，並在文件內註明理由。這是正確做法，我的原建議是錯的。

---

## 二、本版最重要的一句話

`Document Control` 中：

> **Evidence distinction：`PROFILE_VERIFIED` ≠ `TRANSLATION_TEST_PASSED`**
> No unsupported claim: Translation Portal golden fixtures and Additional NVR remain release gates.

取得了官方 UG 之後，最容易發生、也最難事後補救的錯誤，就是把「我拿到了正式 profile 文件」講成「我的映射已通過驗證」。v7 把這個區分寫進文件控制層，並在 Index 規則 6 落實為 UI 狀態：

> 顯示 `MRG_VERIFIED` 與 `PROFILE_VERIFIED`；若 Additional NVR／exact Translation Portal rule 未載入，另顯示 `RELEASE_TEST_PENDING`，**不得錯標 `PROFILE_PENDING`**。

三種狀態各自對應不同的缺件，不互相頂替。這是我在這份文件裡看到最成熟的一處設計。

`Source Register` 的 `LIMIT-TRANS` 也守住同一條線：

> **UG 的 synonyms/usage rules 不等同完整 MT→MX transformation rules**

以及 `LIMIT-NVR`：

> **CBPR+ UG/UHB 不等同 FIN contingency Additional NVR**

兩者狀態都從「尚未取得」改為「**尚未在本批文件辨識**」——這個措辭更精確：說明已經在這批文件裡找過、沒有，而不是還沒開始找。

---

## 三、MT204 的狀態變更：合理，且升格幅度拿捏得當

MT204 從 `PROFILE PENDING` 升為 `SUPPORTED / RELEASE TESTS PENDING`，`對應狀態` 由 `EXACT PROFILE PENDING` 改為 `PROFILE VERIFIED`，並填入 `pacs.010.001.03 / swift.cbprplus.04`。

決策欄的措辭是關鍵：

> SR2026 Final UG 已驗證 exact message version 與 Business Service；建立獨立 FI Direct Debit profile，並只使用合併後單一 pacs.010 UG。**MT→MX golden fixture／translation fidelity 仍是 release gate，但不再把 profile 本身標為 PENDING。**

**升格的是 profile 這一層，不是整體可用性。** 這正是第二節那條區分的具體應用。若把 MT204 直接標成完全 SUPPORTED，就是我前面說的那種事後難補救的錯誤；v7 沒有犯。

`Official Profile Evidence` 中 P009-ADV 的處理也值得一提：登錄了 `swift.cbprplus.adv.04`，但決策欄明寫 **「Not exposed as a direct MT2 SSI message-index target」**——取得了證據不等於要暴露成路由目標，該排除的仍然排除。

---

## 四、Test 5（MT200 53B）的進展

v5 時這一項是 `RELEASE BLOCKED BY RULE SOURCE`，Assertions 欄寫「no assertion until official fixture exists」。v7 改為：

> Fixture required: **SR2026 pacs.009 Core UG p.13** + exact MT200 Translation Portal golden fixture
> Assertions: **UG identifies `SttlmInf/SttlmAcct` as synonym 53B**; verify the complete MT200 transformation and account content with a controlled fixture
> Gate status: `PROFILE EVIDENCE ACQUIRED / GOLDEN FIXTURE PENDING`

我在 v3 提出這個問題時說「MT200 的 53B 在 pacs.009 無對等結構」。UG 給出的答案是 `SttlmInf/SttlmAcct` 帶有 53B 的 synonym 標註——**「有沒有對應」這一半已回答，「怎麼轉」那一半仍未回答。** v7 只把狀態推進一半，措辭準確。

---

## 五、本次新發現

### 5.1（中）Translation Test 3 缺了「單次出現且置於最前」這條斷言

Test 3 涵蓋 `//CP`、`//CH`、`//SW`、`//RU` 與 `//FW` 各變體，Assertions 為：

> Do not blanket-map to `ClrSysMmbId`; verify exact target path and content per rule

這抓到了「不可一律映到同一路徑」，但**漏掉了 MT 側的位置約束**。MRG 原文（MT202／203／205／COV 之 57a、58a Usage Rules）：

> When one of the codes //FW, //AU, //CP, //IN or //RT is used, it should appear **only once and in the first of the fields 56a, 57a and 58a** of the payment instruction.
> （MT204 為「57a 與 58a 之中最先者」）

這條規則在 MX 側**沒有對等物**——pacs.009 的每個 agent 各自帶 `ClrSysMmbId`，不存在「只能出現一次、且要放在鏈上第一個」的限制。後果是雙向的：

- **MT → MX：** MT 只有一個清算碼，轉出後要落到哪一個 agent，需由規則決定。
- **MX → MT（compatibility view，本文件明訂會做）：** MX 若在多個 agent 上都帶了 `ClrSysMmbId`，機械回轉會產出**在 MT 側違規**的電文——多欄同時出現清算碼。

**建議在 Test 3 的 Assertions 補一條：** 「MX→MT 回轉後，`//FW`／`//AU`／`//CP`／`//IN`／`//RT` 於 56a／57a／58a 中僅出現一次，且位於三者中最先出現的欄位（MT204 為 57a／58a）。」

Source Register 已登錄 `SRC-UHB p.26 clearing-code comparison`，材料應該就在手上。

### 5.2（中）沒有「MT 必填欄位可由 MX 內容導出」的測試

v7 把 MT 定位為 compatibility view / renderer，意即系統會做 **MX → MT** 方向的呈現。但 MT 側有若干 **Mandatory** 欄位，其 MX 對應未必存在或未必必填：

| 電文 | 欄位 | MT 狀態 | 風險 |
|---|---|---|---|
| MT200 | 57a Account With Institution | **M** | 自有帳戶移轉情境下，MX 端是否必然帶有可導出之值？ |
| MT205 | 52a Ordering Institution | **M** | 語意為「前手指示之 ordering institution，若無則為前手 Sender」——回轉時須從 MX 的哪個元素取得？ |
| MT202／203／205 | 58a Beneficiary Institution | **M** | 本行自有帳戶情境下須載本行帳號與名稱（option A） |

Test 6 驗的是「Target MX 與 contingency MT 共用 routeId／RMA／Nostro／snapshot」，屬**不變性**測試；**可導出性**是另一回事——不變性成立不代表所有 MT 必填欄位都填得出來。

**建議新增 Test 9：** 「對每一個在 MT 側為 Mandatory 的欄位，證明其值可由對應 MX 訊息內容唯一導出；不可導出者，明列為 compatibility view 的已知限制並標註該電文型別不提供 MT 呈現。」上表三列即為具名起始案例。

### 5.3（低）Supersession 鏈只記了 v6 的雜湊

`Document Control` 記載：

> Supersedes：v6; v5; v4; Test1/v3
> v6 SHA-256：`C65FB4B0…C836`

鏈上列了四個前版，只有 v6 有雜湊。append-only 的 supersession 鏈，每一個被取代版本都應可驗證，否則「v5 存在過、內容為何」在鏈上仍是斷的——這與我在 Gate G0 rc.3 提過的問題同型。

我手上有的雜湊，可直接補入：

| 版本 | SHA-256 |
|---|---|
| v5 | `77E6C5B0B0E67C21912A4728FED62038E71D6F38B9F6EA5860077D3BE2FCCDFE` |
| v4 | `3AC088602967FAC65D426D7FE5E2E28D2FB12D0EB84943DC8DFCF9FBB25B4723` |
| v3（MRG 覆核版） | `4390BD27DBE70D6784366F8CCC9B04D0BE72965EFDE9EAA670D8EFF0234663F4` |
| Test1（原稿） | `42F45FFE7C794E6B6F46EA19FFE3F254152EDC4E48E2D08FB5D38363916FD31A` |

v6 我沒有，無法複核其記載值。

### 5.4（低）外置 manifest 的保管方式未指定

把整檔雜湊外置是對的，但 `MT2XX_…_v7.sha256.txt` 這份 manifest 本身：由誰保管、與 workbook 一同流通還是分開、Gate Register 引用 `SELF-MT2XX-V7` 時要不要一併引用 manifest——文件裡沒說。

外置雜湊若與檔案走同一條路徑同時被替換，就退化成沒有保護。**建議在 `Document Control` 補一列說明 manifest 的保管與交付方式**（例如：隨 Gate 送審包一併提交、或錨定於送審包的 integrity manifest）。

---

## 六、評分

| 構面 | 權重 | v5 | v7 | 說明 |
|---|---:|---:|---:|---|
| SWIFT MRG 正確性 | 30 | 30 | **30** | MT2xx Scope 內容未變動，前輪已逐欄複核無誤 |
| ISO 20022 對應正確性 | 20 | 19 | **20** | 五個 profile 登錄 exact message definition identifier 與 Business Service；CR3035 升格為 guardrail；ADV 取得證據但明確排除為路由目標。v5 的扣分項已關閉 |
| 範疇與治理決策 | 20 | 20 | **20** | `PROFILE_VERIFIED ≠ TRANSLATION_TEST_PASSED` 與三態 UI 標示是本版最成熟的設計 |
| 證據與可稽核性 | 15 | 13 | **14** | Document Control、外置 manifest、三欄拆分、受控副本驗證路徑——全部到位。扣分：supersession 鏈雜湊不全、manifest 保管未指定 |
| 缺口揭露與測試完整性 | 15 | 15 → **13** | **13** | 責任人與證據產出欄補齊、Gate 狀態分級精準。扣分：Test 3 缺位置約束斷言、缺 MT 必填欄位可導出性測試 |
| **總計** | **100** | 97 → **95** | **97** | |

**97／100。**

### 一項計分更正：v5 應為 95，不是 97

5.1 與 5.2 這兩個測試缺口 **在 v5 就已經存在**，我當時通篇稱讚 Translation Fidelity Tests 而給了缺口揭露構面滿分，沒有逐條檢視八個 Assertions 是否覆蓋我自己前幾輪提出的規則。這是我審查的疏漏，不是 v7 的退步。

因此 v5 的正確分數是 **95**，v7 為 **97**——實際進步 **+2 分**，來自證據取得與 ISO 對應的具體化；兩個測試缺口則是自 v5 起一路未關閉。

### 剩下的 3 分

| 分數 | 項目 | 性質 |
|---:|---|---|
| 2 | Test 3 補位置約束斷言、新增 Test 9（MT 必填欄位可導出性）（5.1、5.2） | **需要判斷，但材料在手（UHB p.26）；半天** |
| 1 | Supersession 鏈補雜湊、manifest 保管方式（5.3、5.4） | **機械性，數分鐘**（雜湊我已提供三筆） |

---

## 七、建議

**本表已達文件層的實質上限。** v4 更正了我的 52a 角色歸屬、v5 更正了我的 Cover MPG 版本、v7 更正了我的自我識別列建議；本輪我又撤回了一項範圍認定錯誤、並下修 v5 的評分。這種來回本身就是這份文件品質的證明。

補完上述 3 分之後，唯一還擋在發布前面的是兩件取得受控文件的事，v7 已在 Source Register 正確標為 `NOT ACQUIRED`：

1. **SWIFT Translation Portal exact MT↔MX transformation rules 與 golden fixtures**——八個測試案例全部依賴它。
2. **Contingency Processing Additional NVR（Cat 1 & 2）**——`LIMIT-NVR`。

這兩項不是寫作問題。**在它們到位之前，本文件已經把「知道什麼、不知道什麼、憑什麼這樣說」交代到了應有的程度。**

最後重申第零節：**本輪證據構面的 14 分，並非由我獨立重算背書。** Gate 前請以 Source Register 記載之 SHA-256 對本行留存的 11 份受控副本逐一重算比對——這一步無人可代。

---

Sources：
- SWIFT Standards MT Category 2 Message Reference Guide, November 2026（`us2m_20260717.pdf`，SHA-256 `64483D7F…8323`，1,291,919 bytes，211 頁）— 已獨立驗證
- SWIFT Standards MT Category 2 Message Reference Guide, November 2025（`us2m_20250718.pdf`，SHA-256 `820581F8…845C`，1,009,135 bytes，211 頁）— 已獨立驗證
- [Swift: ISO 20022 in bytes for payments — Call-to-action for November 2026（CR3035）](https://www.swift.com/standards/iso-20022/iso-20022-bytes/call-action-november-2026)
- [PMPG End of Coexistence Considerations v1.0 (July 2025)](https://www.swift.com/sites/default/files/files/pmpg_end-of-coexistance-considerations_202507_v1.0.pdf)
- [Swift: ISO 20022 CBPR+ compliance for partners](https://www.swift.com/standards/iso-20022/iso-20022-partners)
- v7 所引之 11 份受控二進位檔（UHB SR2026 v3.0 及五組 CBPR+ SR2026 Final UG）**未經本審查獨立驗證**，見第零節
