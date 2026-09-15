# MT2XX v8 — 變更規格與前份報告校正

**校正對象：** `MT2XX_v7_證據驗證報告與修訂評分.md`
**依據：** 使用者校正（2026-09-09）＋ 本次一手查證
**用途：** 可直接作為 v8 的變更規格

---

## 一、校正一：UHB 已驗證，我的「未驗證」敘述撤回

前份報告第四節稱 `SRC-UHB` 未驗證。**該敘述應改為「不在本次連接的資料夾中，故未由本審查獨立重算」**——這是我的取用限制，不是文件缺件。

我在 `$HOME/mnt/SWIFT` 與 `$HOME/mnt/lc-ssi-wc` 兩個掛載點全樹搜尋，未找到該檔（僅命中兩個同名巧合的 `node_modules` JS 檔）。使用者提供之值與 Source Register 記載一致：

| 項目 | 值 |
|---|---|
| SHA-256 | `E5A9355586780EF6078D95A43D95E1B221F94E46133E867F29842F433E5AF0B8` |
| Bytes | 20,005,798 |
| Pages | 1,014 |

三項與 Register 完全相符。**`SRC-UHB` 之驗證狀態記為「已由文件擁有者驗證，未由本審查獨立重算」**，並沿用你的第 7 項處置：納入統一受控證據庫，工作簿內的可攜式引用不變。

---

## 二、校正二：「SSI 資料模型不足」不成立——全數撤回

前份報告 3.1 後半段與**第七節整節**（〈對 SSI 主檔的直接影響〉）撤回。

我把 CBPR+ 的 **Agent** 識別規則套用到了 SSI 中並不存在的對象上。查證之後，你的設計選擇不只沒有問題，而且**正好是規則要的那一種**。

### 2.1 一手依據：1A 與 1B 是兩套規則

CBPR+ SR2026 pacs.009 COV UG **p.3** 明確分為兩節（Core UG p.3 同樣列 1A）：

> **1A. AGENTS IDENTIFICATION - Textual Rules**
> → If BICFI is present, then (Name & Postal Address) is **NOT allowed**（ClearingSystemMemberIdentification 與 LEI 可補充）— 資訊衝突時 BICFI 永遠優先。
> → If BICFI is absent, (Name & Postal Address) 必須存在。
> Exception（R18）：全鏈同國時得僅用 clearing code。
> Note：**"Instructing/Instructed Agents" 必須以 BICFI 識別**。
>
> **1B. DEBTOR/CREDITOR - PARTY IDENTIFICATION - Textual Rules**
> → If AnyBIC is present, then (Name and Postal Address) is NOT allowed（其他元素仍為選填）— 資訊衝突時 AnyBIC 優先。
> → **If Name is present, it is *recommended* to use Postal Address.**

### 2.2 你的設計為什麼是對的

**銀行 Agent 全部為 BIC ⟹ 直接落在 R20（`CBPR_Agent_Option_1_TextualRule`：BICFI，可選附 LEI，*preferred option*）。** R17／R19 是給沒有 BIC 的情形用的退路，你的模型結構上不會走到那裡。

更關鍵的是**方向反了過來**：規則 1A 第一句是「BICFI 在場時 Name & Postal Address **不被允許**」。所以 SSI 不帶地址，**不只是「不需要」，而是「不得帶」**。你的「ADDRESS 非 SSI 微服務範疇」不是一個範圍取捨，而是與 CBPR+ 規則同向的正確設計。

**Customer 走 1B，不走 1A。** 大客戶勞工境外匯款的非 BIC 帳號識別，屬 Debtor/Creditor party identification：AnyBIC 不在場時，地址是 **recommended** 而非 mandatory。而且在 MT2XX 範圍內，客戶資料只出現在 **MT202 COV／MT205 COV 的 Seq B（`UndrlygCstmrCdtTrf`）**，本文件已明訂該段**原樣帶入、不重新 Resolve**——SSI Resolver 從頭到尾不生成客戶當事人資料。

**結論：** Structured address 是 pacs.008／MT103 客戶匯款層與 underlying transaction 攜入資料的義務，**不是 SSI 微服務的義務**；而且在 MT2XX 的 agent 欄位上，SSI 反而必須**確保不輸出**地址。

### 2.3 但有一項要保留，且比我原本說的更嚴

1A 的 Note：

> **"Instructing/Instructed Agents" must be identified with a BICFI** — Clearing System Members Identification and LEI are optional.

`InstgAgt` 與 `InstdAgt` **沒有 R17／R19 退路，BIC 是硬性要求**，比一般 agent 更嚴。這一點應明寫進你的第 3 項 Agent 驗證，避免日後若真的開放 R17／R19 時，誤把這兩個角色一併放寬。

---

## 三、七項變更的精確規格

以下可直接作為 v8 的施工說明；規則 ID 與原文皆已對受控 UG 逐頁查證。

### 3.1　Test 2 — 補 R17–R26

**新增 Assertions（六條）：**

| # | 斷言 | 依據 |
|---|---|---|
| a | **BICFI 在場時，`Nm` 與 `PstlAdr` 一律不得輸出** | 1A 第一句（Core／COV UG p.3） |
| b | 資訊衝突時以 BICFI 為準，不得以其他元素覆寫 | 1A 第一句 |
| c | `InstgAgt`／`InstdAgt` 必須帶 BICFI，無替代方案 | 1A Note |
| d | `Nm` 與 `PstlAdr` 必須成對出現（逐 agent） | **R21／R23／R24／R25／R26** `CBPR_Agent_Name_Postal_Address_FormalRule`（適用 PreviousInstructingAgent1／2／3、IntermediaryAgent1／2…） |
| e | 結構化元素內的資料**不得**在 `AddressLine` 重複 | **R22** `CBPR_Duplication_Postal_Address_TextualRule` |
| f | 若未來開放 R17／R19，須驗證「至少含 Town Name 與 Country」之結構化或混合地址 | **R17** `CBPR_Agent_Option_2_TextualRule`、**R19** `CBPR_Agent_Option_3_TextualRule` |

第 f 條標為 `NOT_IN_SCOPE (v8)`——保留規格但不啟用，與你「除非未來明確支援 R17/R18/R19」的立場一致。

### 3.2　Test 3 — MX→MT 清算碼單次性與位置

**新增 Assertion：**

> MX→MT 呈現後，`//FW`、`//AU`、`//CP`、`//IN`、`//RT` 於 **56a／57a／58a 中僅出現一次，且位於三者中最先適用的欄位**；MT204 為 **57a／58a** 中最先者。

**依據與必要性（已查證）：**

- **MT 側：** MT202／203／205／COV 之 57a、58a Usage Rules 明訂「should appear only once and in the first of the fields 56a, 57a and 58a」。
- **MX 側：** `ClrSysMmbId` 為 `[0..1]`，**獨立掛在每一個 agent 之下**（`DbtrAgt`、`CdtrAgt`、`IntrmyAgt1/2/3`、`InstgAgt`、`InstdAgt`…，我在 Core RULES 中定位到 11 處），**CBPR+ 無任何單次性或位置限制**。

兩側規則不對稱，機械回轉必然產出 MT 側違規電文。此為 MX→MT 方向專屬，MT→MX 方向不受影響。

### 3.3　新增 Agent 驗證測試

**規格：**

```
輸入：解析後之銀行 agent（53a/54a/56a/57a 對應之 MX agent）
斷言：每個銀行 agent 必須帶 BICFI（R20）
      InstgAgt/InstdAgt 亦然，且無替代方案（1A Note）
失敗：AGENT_ID_INSUFFICIENT — fail-closed，不得以 Name/Address 補位
例外：無（R17/R18/R19 標為 NOT_IN_SCOPE，未來啟用須另行 ADR）
```

`AGENT_ID_INSUFFICIENT` 應同步加入「解析結果代碼」工作表，狀態標 `新增（v8）`。

### 3.4　pacs.009 幣別禁用碼

**規格：**

> SSI 解析鍵含幣別。若幣別為 **XAU／XAG／XPD／XPT**，不得解析到 pacs.009 路由。

**依據：** Core RULES **R16** `CBPR_Interbank_Settlement_Currency_FormalRule`

> The codes XAU, XAG, XPD and XPT are not allowed, as these codes are only used for commodities.
> （適用範圍：`…/CreditTransferTransactionInformation/InterbankSettlementAmount` 之每一次出現）

新增結果碼建議 `CURRENCY_NOT_ELIGIBLE_FOR_PACS009`，前置於路由解析，不待 MX 組建後才擋。

### 3.5　MT compatibility view 必填欄位可導出性測試

**規格：** 對每一個在 MT 側為 **Mandatory** 的欄位，證明其值可由對應 MX 訊息內容唯一導出；不可導出者，明列為 compatibility view 的已知限制，並標註該電文型別不提供 MT 呈現。

**具名起始案例（狀態已對 MRG 查證）：**

| 電文 | 欄位 | MT 狀態 | 須釐清之導出來源 |
|---|---|---|---|
| MT200 | 57a Account With Institution | **M** | 自有帳戶移轉情境下之 MX 對應 agent |
| MT205／205 COV | 52a Ordering Institution | **M** | 語意為前手指示之 ordering institution；MX 端對應元素 |
| MT202／203／205／COV | 58a Beneficiary Institution | **M** | 一般情境 vs 本行自有帳戶情境（option A ＋ 帳號 ＋ 本行名稱） |

註：Test 6 驗的是 **route 不變性**，本測試驗的是 **可導出性**——不變性成立不代表 MT 必填欄位填得出來，兩者不可互相替代。

### 3.6　Supersession hashes 與 manifest 保管政策

**補入 `Document Control` 之 Supersedes 鏈：**

| 版本 | SHA-256 |
|---|---|
| v6 | `C65FB4B0005739C7AFD310571F84ABA5D972DF25932C6DF9800B3F3321EDC836`（原已記載） |
| v5 | `77E6C5B0B0E67C21912A4728FED62038E71D6F38B9F6EA5860077D3BE2FCCDFE` |
| v4 | `3AC088602967FAC65D426D7FE5E2E28D2FB12D0EB84943DC8DFCF9FBB25B4723` |
| v3 | `4390BD27DBE70D6784366F8CCC9B04D0BE72965EFDE9EAA670D8EFF0234663F4` |
| Test1（原稿） | `42F45FFE7C794E6B6F46EA19FFE3F254152EDC4E48E2D08FB5D38363916FD31A` |

（v7 本身：`A655EADE0EBCB9E203A572E7F058A4E3BBBC618261A16F45528AFBCCC73179FF`）

**Manifest 保管政策（建議措辭）：**

> 外置 manifest 隨 Gate 送審包一併提交，並將其 SHA-256 納入送審包的 integrity manifest；manifest 不得與 workbook 分離流通。

理由：外置雜湊若與檔案走同一條路徑、可被同時替換，保護力即歸零；錨進上層 manifest 才形成鏈。

### 3.7　UHB 納入統一受控證據庫

**處置：** 將 `ISO 20022_Programme_UHB_SR2026_v3.0.pdf` 移入與其他 12 份受控二進位檔相同的證據庫位置。**工作簿內的可攜式引用（Evidence ID ＋ SHA-256 ＋ 頁碼錨點）維持不變**——這正是可攜式引用的用途：證據庫搬遷不影響文件。

附帶效益：UHB **p.26 clearing-code comparison** 正是 3.2 所需材料，歸位後同一稽核者可一次取得。

---

## 四、MT201／MT203 拆單政策——同意分開決策

同意這不屬證據修訂，應獨立成 BA 決策。提供三項決策所需的事實，不代表建議：

1. **ISO 側本來就是單筆。** 沒有多筆 pacs.009 的 1:1 對應，拆成逐筆 pacs.009 是 ISO 原生形狀，不是變通。
2. **「批次總額一致性」在 MX 側消失。** MT201／203 的欄位 19（Sum of Amounts）受 **C01** 約束，必須等於所有 32B 之和；pacs.009 拆單後沒有這個欄位，也就沒有這條網路層檢核。**批次原子性一旦放寬，就沒有任何下游機制會發現金額不齊。**
3. **因此真正要決定的不是技術可行性，而是來源系統的期待。** 若來源系統以「一筆批次 = 一個會計分錄」建帳，部分成功會直接造成帳務不平；若來源系統本來就逐筆記帳，部分成功可接受。

現行 v7 的立場是「任一逐筆 SSI 未解析即整份 fail-closed，不部分放行（內部安全政策，非 SWIFT NVR）」——這是安全的預設。BA 若要改為部分成功，建議連同「失敗筆的補送機制」與「來源系統對帳方式」一併定案，不要只改政策旗標。

---

## 五、評分修訂

| 構面 | 權重 | 前次 | 本次 | 說明 |
|---|---:|---:|---:|---|
| SWIFT MRG 正確性 | 30 | 30 | **30** | — |
| ISO 20022 對應正確性 | 20 | 20 | **20** | — |
| 範疇與治理決策 | 20 | 20 | **20** | — |
| 證據與可稽核性 | 15 | 14 | **14** | UHB 驗證狀態校正；剩餘扣分為 supersession 鏈雜湊、manifest 保管政策、證據庫未統一——即你的第 6、7 項 |
| 缺口揭露與測試完整性 | 15 | 12 | **13** | Agent 識別缺口由「高」下修為「中」：**是 guardrail 缺口，不是資料模型缺口**。其餘兩項（清算碼位置、必填欄位可導出性）維持 |
| **總計** | **100** | 96 | **97** | |

**97／100。**

前次 96 分中，有 1 分是我把 agent 規則誤套到 SSI 資料模型、將該缺口評為「高」所致。校正後回到 **97**——與取得 CBPR+ UG 之前的評分相同，但內涵完全不同：那時的 97 有一節「證據構面非由我背書」的保留，現在沒有。

**剩下 3 分全部對應你列的七項**：2 分在測試矩陣（第 1–5 項），1 分在證據治理（第 6–7 項）。七項做完即為 100。

---

Sources（本次查證，全部經獨立雜湊驗證）：
- `CBPRPlus_SR2026_(Combined)_CBPRPlus-pacs_009_001_08_COV_FinancialInstitutionCreditTransfer_20260522_0129.pdf`（`7B447CD7…F58A`）— **p.3 Principles 1A／1B**
- `CBPRPlus_SR2026_(Combined)_CBPRPlus-pacs_009_001_08_FinancialInstitutionCreditTransfer_20260522_0127.pdf`（`2373FC20…BA28`）— p.3 Principles；R16–R26；ClrSysMmbId 結構
- `us2m_20260717.pdf`（`64483D7F…8323`）— MT202／203／205／COV 之 57a、58a Usage Rules；MT200／205 欄位 status
- `ISO 20022_Programme_UHB_SR2026_v3.0.pdf`（`E5A93555…F0B8`）— **由文件擁有者驗證，未由本審查獨立重算**
