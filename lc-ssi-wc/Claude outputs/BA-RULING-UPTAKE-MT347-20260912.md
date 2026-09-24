# BA 裁定接收（UPTAKE）— MT3／MT4／MT7 SSI 範圍重定與 MT765 規格缺陷修正

| 項目 | 值 |
|---|---|
| 接收日期 | 2026-09-12 |
| 裁定來源 | BA「已依最新範圍重新裁定，先前擴張裁決全部作廢」 |
| 本文取代 | `qa/mt347/reports/BA-REVIEW-MT347-MEMORY-20260912.md`（SHA-256 `CEEE87584CDD38D68BA590AD0731F2BA79DB35F8CE20C86DB7D2CD45FEFA7B85`）之 **F-347-02、F-347-03 兩節，以及 §3 建議裁定第 4、5 列** |
| 本文性質 | **裁定接收＋可執行編輯規格**。我未修改任何受控檔案，等待授權後執行。 |

---

## 0. 歷史紀錄盤點（依指示自行翻查後之完整清單）

我已把 MT3／MT4／MT7 這條線的全部歷史件翻出來並重算 SHA-256，時序如下：

| # | 日期 | 檔案 | SHA-256 | 性質 |
|---|---|---|---|---|
| 1 | 2026-09-07 | `qa/tdd/mt347/SWIFT_SR2026_MT3_MT4_MT7_SSI_分析_中文版_v5.xlsx` | `C3EC8EB1A5B256C51D707BE342C079DB9DEBE304B03B562046CBAF1C459BECD2` | 訊息級範圍矩陣，**恰為 25 支**（不含 MT416、MT785） |
| 2 | **2026-09-08** | **`SWIFT_SR2026_MT3_MT4_MT7_SSI_分析_中文版_v7.docx`** | **`1A0B5CDBD6CC3F00CE13C8C978E445D2A54728A956B0240661FFE79230E2B985`** | **已同意之 BA 範圍裁定全文**：Cat3／4／7 全 77 支逐支裁定 ＋ §1–§10 設計決議 |
| 3 | 2026-09-09 | `MT347_SR2026_SSI_BA_Analysis_v4.md` | — | v4 Gate 摘要（CONDITIONAL PASS） |
| 4 | 2026-09-09 | `qa/tdd/mt347/MT347_SR2026_SSI_QA_Test_Plan_v4.xlsx` | `1FDF15CFF1E78B0A6A3813163E6ADDD76517C0A045B240665003B249F2C5EFF5` | 358 案／164 錨點／27 範圍列 |
| 5 | 2026-09-12 | `memory/swift-mt347.md` | `F1B413E13253432E5153CA9EEC9D082460A897CAC4640E1288D8A2DDF1CCF490` | 受控記憶 |
| 6 | 2026-09-12 | `qa/tdd/mt347/MT347_SR2026_SSI_TDD_CONTROLLED_v1.xlsx` | `D586C86E61641CA3563771EA2AB937E3F15BA96A92F1F314007BCCE3BEA149D2` | 受控 TDD（362 案／53 情境／164 規則／11 OPEN） |

**第 2 項（v7.docx）就是 BA 所指「同意過的歷史文案」，它直接決定本次全部爭點。**

---

## 1. 撤回（RETRACTION）——並承認這是我的查證疏失

我於前份報告提出的兩項擴張建議，**全部撤回、不再主張**：

| 原編號 | 原主張 | 現狀 |
|---|---|---|
| **F-347-02** | Cat 7 另有 MT700／705／707／710／720／740／760 帶 5x 欄位，建議補排除裁定、開 OPEN-347-012 | **撤回** |
| **F-347-03** | 建議於記憶檔 §7 加入 Cat 7 5x 角色名稱分歧對照表 | **撤回** |

### 1.1 這兩項不是「被新裁定推翻」，而是**早已裁定、我沒查**

v7.docx 第 3 節的統一 Mapping 表**逐支涵蓋 Category 3／4／7 全部 77 支訊息**。我所謂「缺口」的 7 支，**每一支都已明確裁定為 `— / N/A`**：

| MT | v7 SSI Tags | v7 SSI Resolution |
|---|---|---|
| MT700 Issue of a Documentary Credit | — | **N/A** |
| MT705 Pre-Advice of a Documentary Credit | — | **N/A** |
| MT707 Amendment to a Documentary Credit | — | **N/A** |
| MT710 Advice of a Third Bank's / Non-Bank's DC | — | **N/A** |
| MT720 Transfer of a Documentary Credit | — | **N/A** |
| **MT740 Authorisation to Reimburse** | — | **N/A** |
| MT760 Issue of a Demand Guarantee / Standby LC | — | **N/A** |

裁定理由 v7 亦已寫明，與我事後「發現」的內容完全相同：

> **§4.3**：「MT700/705/707/710/720 說明『**有 5x**』不等於『**可由 SSI 決定**』。Reimbursing Bank、Advise Through Bank、Requested Confirmation Party 都是 Trade / Reimbursement Arrangement 角色。」
> **§4.4**：「MT760 應排除一般 SSI Resolution：56a Advising Bank、57a Advise Through Bank、58a Requested Confirmation Party 都屬 Trade Routing / Confirmation。MT765 則相反，56a Intermediary 與 57a Account With Institution 構成 Demand Payment Settlement。」
> **§9**：核對範圍已包含 MT700/705/707/710/720/730/734/**740**/742/750/752/754/756/**760**/765/768/769。

而 F-347-03 所謂「新發現的角色名稱分歧」，v7 §1 早已立為第一原則：

> 「SWIFT Message 中存在 5x Tag，**不代表該 Tag 可以由 SSI 推導**。」
> 「Trade Routing、Advising Bank、Requested Confirmation Party、Reimbursing Authority、交易指定的 Branch/Affiliate 等，不應由一般 Currency SSI 決定。」

**我的錯誤**：v7.docx 就在 repo 根目錄，與我讀的 v4 分析並列。我做覆核時只看了 `memory/swift-mt347.md`、v4 分析與兩份工作簿，**沒有先翻已同意的歷史裁定就斷言覆蓋缺口**。這與先前 C2（未列頂層鍵樹）、C6（自建 fixture 當缺陷）是同一個毛病：**片面閱讀就下結論**。本次不辯解，直接撤回並記錄。

### 1.2 連帶修正：我前份報告自身的一處引用

前報告 §1.9 C81 方向分歧表中，我以 **MT760 C7（us7m p.299）** 為反向範例之一。MT760 現已確認出範圍，**該列須移除**。反向 C81 範例保留 **MT785 C1（`us7m_20260717.pdf` p.410）**，結論不受影響。

前報告其餘各節（§0 MT347 非訊息型別、§1.1–1.8、§1.10–1.11、F-347-01、F-347-04、§4、§5）維持有效。

### 1.3 建議補登受控來源（traceability）

TDD `Source Register` 目前登錄 **v5.xlsx**，**但未登錄 v7.docx**——而 7 支 N/A 的**實際裁定文字在 v7，不在 v5**（v5 只有 25 列，出範圍訊息根本不出現）。建議增列：

```
SWIFT_SR2026_MT3_MT4_MT7_SSI_分析_中文版_v7.docx
| Source internal BA scope ruling (approved 2026-09-08)
| 1A0B5CDBD6CC3F00CE13C8C978E445D2A54728A956B0240661FFE79230E2B985
| Cat3/4/7 全 77 支訊息級 SSI 範圍裁定；§4.3/§4.4 排除理由；§8 最終設計決議
| 範圍納入／排除之權威；序列化由 SR2026 MRG 補充
```

這樣下一次任何人（含我）在提「覆蓋缺口」之前，都會在受控清單裡先看到已裁定的範圍來源。

---

## 2. 接收之範圍定義（生效版）

| 項目 | 生效值 |
|---|---|
| 訊息型別 | **25**（不變） |
| 案例 | **362**（不變） |
| 規則錨點 | **164**（不變） |
| 序列化情境 | **53**（不變） |
| MT↔MX | **僅適用 Category 1／2；MT3／4／7 一律不適用** |
| MX／pacs／converter／UG／round-trip Gate | **自 MT347 全數移除** |
| Active OPEN | **7**：`OPEN-347-004、005、006、007、008、009、010` |
| 唯一確認之規格缺陷 | **MT765 序列標註**（詳 §4） |

**此裁定與已同意之 v7 §8 一致，非新增限制**：

> v7 §8：「**MT2 / MX Settlement Resolution ＝ 維持既有獨立 Settlement Resolution Flow，完全不變**；本次 FIN SSI Resolution Scope 不得修改、取代或影響其 API、規則、資料模型與執行流程。」
> v7 §8：「FIN SSI Resolution 僅屬 **REFERENCE_ONLY / paymentExecutable = false**：Treasury 適用 MT3xx，Trade Finance 適用 MT4xx / MT7xx；Resolution 本身不執行 Payment。」

即：MX／pacs 本來就屬 MT2／MX 那條獨立流程，MT347 這條線自始就是 FIN-only、REFERENCE_ONLY。TDD v1 之所以長出 4 條 MT↔MX OPEN 與兩個 MX 欄位，是**偏離了已同意的 v7 §8**，本次移除是回歸原案，不是縮減範圍。

---

## 3. MX／converter 移除——編輯面（已逐格盤點）

### 3.1 `qa/tdd/mt347/MT347_SR2026_SSI_TDD_CONTROLLED_v1.xlsx`

| 分頁 | 動作 | 明細 |
|---|---|---|
| `TDD Cases` | **刪 2 欄** | `[F] MX Expected Output`（362 列全為 `{"status":"OUT_OF_SCOPE","reason":"NO_CONTROLLED_ISO_ARTIFACT"}`）、`[T] MT↔MX conversion gate`。欄數 **23 → 21**；**列數 362 不變** ✔ |
| `BA Open Decisions` | **刪 4 列** | `OPEN-347-001`（Cat3 MT↔MX）、`-002`（Cat4 MT↔MX）、`-003`（Cat7 MT↔MX）、`-011`（Converter round trip）→ 剩 **7 列** |
| `Coverage Ledger` | **改 1 列** | 「Open decisions」`Expected` **11 → 7**；公式 `=COUNTIF('BA Open Decisions'!G2:G12,"OPEN")` → `G2:G8`。「Ledger defects」須維持 **0** |
| `Reconciliation` | **刪 1 列** | `REC-008`（portal `pacs.009.001.12` vs 受控 `.001.08`；結語「converter tests remain blocked」）——連動 §5 問題 1 |
| `Document Control` | **刪 1 列／改 1 列** | 刪「MT↔MX boundary｜BLOCKED UNTIL CONTRACTED」；「Version coexistence」現值含 converter 字樣——連動 §5 問題 2 |
| `Source Register` | **增 1 列** | 依 §1.3 補登 v7.docx |
| `Scope`／`Excluded Scope Decisions` | **不動**（惟見 §5 問題 3） | 維持 27 列＝25 IN_SCOPE ＋ MT416 ＋ MT785 |

### 3.2 `memory/swift-mt347.md`

| 位置 | 動作 |
|---|---|
| §1 末句 | 刪「…or that any FIN message has a universal ISO 20022 target」 |
| §2 知識分類 | 刪 **Pending conversion** 一類（四類轉三類） |
| **§8 整節** | **刪除**「MT↔MX conversion boundary」全節（含 5 項受控合約要件與 `pacs.009.001.12` 段） |
| §10 第 8 點 | 刪「A converter test is not PASS without a contracted target guide/profile and semantic round-trip evidence…」 |
| §11 第 5 點 | 刪「Revalidate each contracted MT↔MX mapping…」 |
| §3 末段 | 「A third-party converter does not select a release by itself」——連動 §5 問題 2 |
| 章節重編號 | §8 刪除後，原 §9／§10／§11 上移為 §8／§9／§10 |
| **建議增補** | 依 v7 §8／§10 補一句範圍句：「FIN SSI Resolution 為 REFERENCE_ONLY、paymentExecutable=false；MT2／MX Settlement Resolution 為獨立流程，本範圍不涉及。」——使「為何沒有 MX」在記憶中留下正面依據，而非只是刪除留白 |

> 附帶已查得之引用漂移（同批修訂時宜一併校正）：`Reconciliation` REC-008 標註「memory discrepancy 5」，但 `pacs.009.001.12` 實際位於記憶檔 **§8 末段**；§9 第 5 點談的是「交易標籤誇大結算子目的」。REC-008 刪除後此漂移自動消滅。

---

## 4. MT765 規格缺陷修正——可執行編輯規格

### 4.1 缺陷與證據

`us7m_20260717.pdf`（SHA-256 `1F748A8262E5528F6C9BD59DDD5FF1A992542CFCF25D0E8DA528241D12FEA2A4`）**p.355**：

```
End of Sequence A Beneficiary          ← Sequence A 僅 59N/59S/59T/59P/59R（No.5–9）
  O  59E  Beneficiary Identification                              10
  …
  O  56a  Intermediary               A, B, or D                   21
  O  57a  Account With Institution   A, B, or D                   22
```

同頁 NVR C3：「Either sequence A (Beneficiary) or field 59E, but not both, may be present (Error code(s): D62).」
⇒ `56a`／`57a` 為**訊息層（單序列）欄位**，位於 Sequence A 之外。

此修正亦與已同意之 v7 §8 唯一 Mapping Key 相容——該 Key 明列 `Sequence/Subsequence` 為身分組成，MT765 之 56a／57a 的正確 Sequence 值即為訊息層。

### 4.2 編輯清單（共 **42 格**）

**A. 序列與情境標籤（14 格）**

| 分頁 | 列 | 欄 | 現值 | 改為 |
|---|---|---|---|---|
| `Scope` | row24 | Sequence / business scenarios | `A - Beneficiary` | `MESSAGE - Message` |
| `Confirmed Rules` | row162, row163 | Sequence | `A` | `MESSAGE` |
| `Confirmed Rules` | row162, row163 | Business Scenario | `Beneficiary` | `Message` |
| `Confirmed Rules` | row162, row163 | MRG evidence | `…Format table p.355; MT765 **A** 56a Field detail No.21 p.363`（57a 同式） | 刪去序列字元 `A` |
| `Scenario Registry` | row52 | Sequence | `A` | `MESSAGE` |
| `Scenario Registry` | row52 | Business Scenario | `Beneficiary` | `Message` |
| `Scenario Registry` | row52 | MRG evidence | 同上兩式以 `\|` 串接 | 同上，刪去兩處 `A` |

> 已獨立驗證、**不需修改**：欄位明細頁 `p.363` 正確——`us7m` p.363 確含「MT 765 - 21. Field 56a: Intermediary」與「MT 765 - 22. Field 57a: Account With Institution」；`Format table p.355` 亦正確。

**B. 識別碼（BA 指定之「兩個 rule ID」＋連帶 scenario ID）**

| 現值 | 改為 | 出現處 |
|---|---|---|
| `RULE-MT765-A-56a` | `RULE-MT765-MESSAGE-56a` | `Confirmed Rules` row162；`Scenario Registry` row52 `Rule IDs` |
| `RULE-MT765-A-57a` | `RULE-MT765-MESSAGE-57a` | `Confirmed Rules` row163；`Scenario Registry` row52 `Rule IDs` |
| `SCN-MT765-A-051` | `SCN-MT765-MESSAGE-051` | `Scenario Registry` row52 `Scenario ID` |

**C. 6 個案例（`TDD Cases`，16 格）**

| 案例 | 列 | `Business Scenario` 改為 | `MT Expected Output` 欄位鍵 |
|---|---|---|---|
| MT765-001 | row291 | `MESSAGE - Message / direct canonical route` | `A.57A` → `57A` |
| MT765-002 | row292 | `MESSAGE - Message / intermediary route` | `A.56A`、`A.57A` → `56A`、`57A` |
| MT765-003 | row293 | `MESSAGE - Message / optional route unavailable` | （無欄位鍵） |
| MT765-004 | row294 | `MESSAGE - Message / invalid option` | `A.56Z` → `56Z` |
| MT765-005 | row295 | `MESSAGE - Message / option B provenance boundary` | `A.56B` → `56B` |
| MT765-006 | row337 | `MESSAGE - Message / clearing-member code placement fidelity` | `A.56A` → `56A` |

**D. MRG 證據欄連帶修正（5 列）**

MT765-001～005 之 `MRG source/page/evidence` 現值皆為
`us7m_20260717.pdf p.355; C3 beneficiary sequence A XOR 59E - us7m_20260717.pdf p.355`。

**C3 規範的是 Sequence A 與 59E 互斥，與 56a／57a 無關**——序列標籤改正後續引 C3 會自相矛盾（既稱欄位不屬 Sequence A，又以 Sequence A 的規則為其證據）。
應改為：`us7m_20260717.pdf p.355 Format table fields No.21 (56a) / No.22 (57a)`
（MT765-006 原已只引 p.355，**不需修改** ✔）

**E. fixture 欄位（12 格）**

| 分頁 | 列 | 欄 | 動作 |
|---|---|---|---|
| `SSI Fixtures` | row291–295, row337 | `Sequence/scenario` | 同 C 欄新字串（6 格） |
| `Applicability Fixtures` | row291–295, row337 | `Sequence/scenario` | 同 C 欄新字串（6 格） |
| `RMA Fixtures`／`Nostro Fixtures`／`Fixture Manifest`／`Positive Seed`／`Negative Manifest` | — | — | **無序列欄，不需修改**（已逐欄確認欄名） |

### 4.3 修正後驗收條件

1. 全簿不再出現 `RULE-MT765-A-`、`SCN-MT765-A-`、`MT765 A 56a`、`MT765 A 57a`、`A - Beneficiary`（MT765 範圍內）、`A.56`、`A.57`。
2. `Coverage Ledger` 全部差異欄維持 **0**；`Field-rule anchors` = **164**；`Sequence-qualified scenarios` = **53**；`Total controlled cases` = **362**。
3. `SCN-MT765-MESSAGE-051` 的 `Field-anchor count` 仍為 **2**。
4. 產出新 SHA-256、更新 sidecar `.sha256.txt`、`Change Log` 新增一列。
5. 記憶檔若同批修訂，須同步更新 `Source Register`／`Document Control` 內登錄之記憶檔 SHA-256。

---

## 5. 待 BA 裁示（阻斷項，未獲答覆前不動該格）

### 問題 1 — `OPEN-347-009` 與「移除所有 MX／pacs」

`OPEN-347-009` 標題即為「Portal profile identity — 解決 portal `pacs.009.001.12` metadata 與受控 `.001.08` 指南之落差」，本質是 pacs 項；但 BA 指定之 Active OPEN 保留 009。

**我的建議：(a)**——依 v7 §8「MT2 / MX 維持既有獨立流程」，pacs 版本之爭屬 MT2／MX 那條線，不屬 MT347。故 009 在 MT347 內應重述為「**UI metadata 標籤不得宣稱任何轉換 profile**」（去除 pacs 版本比對字樣），`REC-008` 同步重述而非刪除。如此 Active OPEN = 7，與 BA 指定數量相符。
其他選項：(b) 一併刪除 009 → Active OPEN = **6**，與 BA 所述 7 不符，需 BA 確認；(c) 由 BA 給定措辭。

### 問題 2 — `OPEN-347-004` 與「移除所有 converter」

`OPEN-347-004`（Standards coexistence）條文為「Lock SR2025／SR2026 effective-date **and converter-version selection**」；`Document Control` 之「Version coexistence」與記憶檔 §3 末段同屬此脈絡。

**我的建議：(a)**——v7 全文沒有 MT3／4／7 的 converter 概念，故 004 重述為純「SR2025／SR2026 生效日與版次鎖定」，刪去 converter 字樣（記憶檔 §3 末段一併刪除）。
其他選項：(b) 認定 SR 版次選擇不屬 MT↔MX 映射，保留 converter-version 鎖定為版次治理項（三處不動）。

### 問題 3 — `Excluded Scope Decisions` 之 MT416／MT785 兩列是否保留

BA 裁定「不建立排除列」係針對該 7 支。惟：
- **MT416** 在 v7 表中確有裁定（`— / N/A`），TDD 為其建了排除列；
- **MT785 在 v7 的 77 列中完全不存在**（表列自 MT769 跳至 MT790），TDD 卻為其建了排除列並附證據。

請裁示：**(a)** 兩列均保留（現狀，Scope 27 列）；**(b)** 依「不建立排除列」原則一併移除，Scope 回到 25 列——但此舉會同時移除 2 個 `OUT_OF_SCOPE_CONFIRMED` boundary 案例，**Coverage Ledger 的 362／360／2 會變動**，與 BA「數量維持」相衝突，故我**不建議**；**(c)** 保留但於 v7 補登 MT785 之裁定依據。

---

## 6. 另請裁定（新發現，未擅自處置）

### F-347-06 `MT765-002` 引用 MT765 不存在的欄位

`us7m` p.354–355 之 MT765 完整欄位表為：
`20、21、23、52a（Issuer, M）、[Optional Sequence A: 59N/59S/59T/59P/59R]、59E、31L、22G、32B、78、71D、33a、49A、77、31E、31R、56a、57a、72Z、23X`
——**無 `53a`、無 `54a`、無 `58a`。**

`TDD Cases` row292（MT765-002）現值：

| 欄 | 現值 | 問題 |
|---|---|---|
| `Input` | `senderCorrespondentBankServiceId=BANK-SVC-CITIUS33; …` | MT765 無 53a Sender's Correspondent 槽位 |
| `SSI/Nostro ownership and source` | `**53a**=OWN_SSI/NOSTRO; 56a/57a=COUNTERPARTY_SSI; **58a**=explicit transaction/upstream beneficiary` | 53a、58a 於 MT765 不存在 |
| `Required fixture / data precondition` | `ownNostroId=1be0c8ed-…; expectedAccountReference=MT347-MT765-002-USD-001` | nostro／own-account 綁定預設存在 53a 借記槽位 |
| `Nostro Fixtures` row100 | 同一 nostro pin | 同上 |

該案例自身之 `MT Expected Output` 僅主張 `A.56A=HSBCHKHH; A.57A=DEUTDEFF`，**從未渲染 53a 或該帳號**——即該 nostro／`expectedAccountReference` 綁定為**孤兒**，無任何報文欄位可承載。研判為由 53a/56a/57a/58a 型訊息（如 MT300 B2）套版之殘留。

請裁示：**(a)** 認定為缺陷 → row292 之 `Input`／`ownership`／`fixture precondition` 三欄改為僅 `56a`／`57a`，`Nostro Fixtures` row100 與 `Fixture Manifest` row292 之 `Expected rendered accountReference` 改 `N/A`；**(b)** BA 認定該 nostro 綁定另有用意，請指明其對應之 MT765 欄位。

**未計入 §4 之 42 格編輯清單。**

### F-347-07 負向案例狀態碼與 v7 §2 狀態模型之對齊（低優先）

v7 §2／§6 定義之 Runtime 結果**僅三種**：`RESOLVED`／`NOT_REQUIRED`／`NO_ELIGIBLE_SSI`（＋`reasonCode`），Out-of-Scope 用 `N_A`。
但 TDD 之 MT765-004 為 `OPTION_CONSTRAINT_VIOLATION / FAIL_CLOSED`、MT765-005 為 `PROFILE_INCOMPLETE / FAIL_CLOSED`（其他訊息之負向案例亦同式）。

此**可能是刻意的**——`FAIL_CLOSED` 屬 API 層結果，與 resolution status 不同層。若確係如此，建議在 `Document Control` 或 `NVR Semantics` 加一列說明兩層對應（例：`PROFILE_INCOMPLETE` → resolutionStatus `NO_ELIGIBLE_SSI` ＋ reasonCode）。此項**非 MT765 專屬、不阻斷本次修正**，列此僅供 BA 決定是否另案處理。

---

## 7. 知識分類

- **normative rule**：§4.1（MT765 p.355／p.363 與 C3）、§6 F-347-06（MT765 完整欄位表）、§1.2（MT785 C1 p.410）
- **BA ruling**：§0 第 2 項 v7.docx 全文、§2 全表、§1 撤回
- **QA invariant**：§4.3 驗收條件、§3 之計數不變性檢查
- **product policy**：無

## 8. 執行狀態

**我尚未修改任何受控檔案。** §3、§4 為可直接執行之編輯規格（42 格 ＋ 2 欄刪除 ＋ 4 列刪除 ＋ 1 列增列）。§5 三問答覆後即可一次完成全部修訂，產出新 SHA-256 與 Change Log。請指示是否授權執行。
