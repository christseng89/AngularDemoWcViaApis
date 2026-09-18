# Memory — lc-ssi-wc（Trade Finance SSI Microservice）

## 全專案交付治理必讀

- 開工、分派、設計、DB Reload、QA、SonarQube、Excel TDD、封存及 Block 回報，一律遵守 `memory/lc-ssi-wc-operating-model-zh-v2.md` v2.8.24。Active repository governance 以 repo path＋semantic version 識別；exact Git commit 只記錄於外部任務交接與 review evidence，不寫回本檔或 manifest。
- SSI Resolver 的產品責任與結案邊界一律遵守 `memory/ssi-resolver-service-boundary-v1.md`：第三方 FIN Validator／完整 FIN NVR／SWIFT Network 為 `OUT_OF_SCOPE — CLOSED`，不得建立 SSI Open／Block，禁止 scope creeping。
- MT1／pacs.008 的受控知識入口為 `memory/swift-mt1xx-pacs008-v2.md`；未完成 BA/QA 簽認的 OPEN 不得當作已核准規則。

## 全專案強制架構要求

- 唯一允許的執行資料流：`Controlled SWIFT/ISO source -> Controlled OAS/Typed Contract + Parameters/DB -> Domain Policy/API -> Page Definition -> Generic UI -> Execution -> Structured Result`。ISO／CBPR+／mapping 僅適用已核准 MT↔MX family；MT347 記 `N/A`＋原因。
- API 是頁面參數與 SSI 業務規則的唯一真實來源；UI 僅負責參數映射、通用渲染、提交與結果呈現。
- UI 禁止 hard-code MT 類型、sequence、5x 欄位、scenario、polarity、fixture binding 或個案判斷。
- 修改配置或測試資料後，必須可透過 Reload DB 反映至 API 與 UI，不得要求修改或重建 Angular 原始碼。
- 本要求適用 MT2、`pacs.009` plain／COV／ADV、MT347 及未來所有 message family。MT2→MX profile 必須由 API 依受控業務情境與 BAH `BizSvc` 決定；UI 不得用 MT code 或 `MsgDefIdr` 自行判斷。完整決策與驗收規則見 `docs/architecture/ADR-001-api-driven-ui.md` 及 `memory/mt347-oas-page-parameters-ui-standard-v1.md`。

## 專案

MT2xx SSI Resolution。**範圍恆為 MT2xx OUTWARD ONLY**（MT202／MT202COV／MT205／MT205COV）。
SWIFT 依據以 **SR2026** 為準；SR2025 為保留之相容來源，**僅在客戶／通道／轉換器合約明示時**適用
（第三方轉換器存在本身不代表 SR2025）。

**MT204 / `SENDER_BENEFICIARY_DIRECT_DEBIT` 不在範疇**（ISO 目標為 pacs.010，非 pacs.009）——
BA 2026-09-12 確認。不得由本記憶推導任何 MT204 規則。

## 溝通慣例

- 回覆用**中文**，不離題、只談本專案範圍
- 工作簿字型 **Times New Roman 11**
- Evidence 以**原始 JSON 文字**為準；截圖只作 UI 證據
- 未經明確授權**不得修改產品程式碼**
- 發布前多檢驗兩遍

## 報告紀律（必守）

- 以 JSON 為證據時，**先輸出完整鍵樹（頂層＋mx＋mt）再下判斷**
- 自建 fixture 產生的結果**不得報成產品缺陷**，須標明「我的 fixture，待正式 fixture 確認」
- 報告分兩區：**已驗證** / **待確認**，不得混寫
- 引用 SWIFT 文件一律「**檔名＋SHA-256＋頁碼**」三者並列
- 知識分四類：**normative rule / BA ruling / QA invariant / product policy**，不得混同

## 關鍵術語

| 詞                   | 意思                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------- |
| **MRG**              | Message Reference Guide，MT2 為 `us2m_*.pdf`                                            |
| **CBPR+ UG**         | pacs.009 Usage Guideline；**長版為欄位級權威**，短版僅供概覽                            |
| **own-account 情境** | `BOOK_TRANSFER_SAME_RECEIVER`、`CREDIT_ONE_OF_SEVERAL_AT_57A` —— **僅適用 plain MT202** |
| **generic 路徑**     | counterparty SSI 解析（一般 MT202）                                                     |
| **DEF-001**          | `instructedAgent` 誤取 `counterpartyBic` 之舊缺陷（已修復）                             |
| **K1–K8 / J1–J4**    | **時點性產品觀察**，非永久 MRG 知識，不得寫入規範章節                                   |

## Profile 路由（關鍵）

plain / COV / ADV **三者 `MsgDefIdr` 相同**（`pacs.009.001.08`）。
**必須以業務情境與 BAH `BizSvc` 選 profile，不得用 `MsgDefIdr` 或 MT code 判斷。**

| Profile | BizSvc                  | 用於                                        |
| ------- | ----------------------- | ------------------------------------------- |
| plain   | `swift.cbprplus.04`     | MT202、MT205                                |
| COV     | `swift.cbprplus.cov.04` | MT202COV、MT205COV                          |
| ADV     | `swift.cbprplus.adv.04` | **排除守則** —— 純 cover 預告，不做清算結算 |

## 錨點速查（皆逐頁驗證）

**`us2m_20260717.pdf`**（`64483D7F7C094DB2…`）

| 主題                                              | 頁                    |
| ------------------------------------------------- | --------------------- |
| MT202 53B 借／58A 貸＋Sender                      | p.40                  |
| MT202 53a option B、多重直接帳戶關係              | **p.46**（不是 p.45） |
| MT202 57a 缺席＝Receiver 為 AWI                   | p.52                  |
| MT202 58a option A                                | p.54                  |
| MT202COV：119=COV、121 UETR                       | p.59                  |
| MT202COV：Sequence B 必填                         | p.60                  |
| MT205 scope（同國further transmission、非 cover） | p.134                 |
| MT205 58a＝52a（初始為 MT200/201 時）             | **p.148**             |
| MT205COV：119=COV、UETR、cover 序列必填           | p.153                 |

**pacs.009 plain 長版 343p**（`4B9436D21B141C5C…`）

| 欄位                                          | 頁                                         |
| --------------------------------------------- | ------------------------------------------ |
| `BizSvc` = swift.cbprplus.04                  | p.16                                       |
| **主 `CdtrAcct`**                             | **p.85**                                   |
| `UnderlyingCustomerCreditTransfer` **已移除** | p.89                                       |
| ~~`CdtrAcct` p.101~~                          | **在已移除容器內，不可作 plain 映射**      |
| `SttlmAcct`                                   | p.259–260；**p.260 明載 synonym = MT 53B** |
| `SttlmMtd`：CLRG／COVE 移除，留 INDA／INGA    | p.338–339                                  |

**COV 長版 410p**：`BizSvc` p.17、主 `CdtrAcct` p.98、underlying 必填 p.101、underlying `CdtrAcct` p.123、`SttlmAcct` p.319–320（p.320 有 53B synonym）、`SttlmMtd` p.404–405
**ADV 長版 290p**：p.3 非清算、`BizSvc` p.15、`CdtrAcct` p.84、underlying 移除 p.88、**`SttlmAcct` 已移除 p.215（仍留 53B synonym 標註，不可用）**、`SttlmMtd`=COVE p.285–286

**頁碼陷阱**：頁尾印在該頁**底部**，其後文字屬**下一頁**（53a 曾被我誤記 p.45）。
`us2m` SR2025／SR2026 **頁數相同（211）**，只寫頁碼無法區分版次。

## 資料品質不變式

- 報文帳號一律用有效 `accountReference`；**`maskedAccountRef` 是顯示資料，禁止替代**
- 選中之 `accountReference` 為 NULL／空白／純空白 → **fail closed**
- 多重直接帳戶關係基數＝同 entity／實際 Receiver／幣別／有效日／ACTIVE／適用 purpose 內之**相異正規化帳號**
- 單一帳號的重複列**不構成**多重關係
- ranking／negative fixture 須宣告隔離；未分類合成列標 `DQ-REVIEW`
- 無法建立必要帳號時：DEV/DEMO → 409 `INCORRECT_SSI_CONFIGURATION`；其他 → 500。
  兩分支皆須自動化證據，且不得產生 payload／confirmed resolution／Repair Queue。
  **此 HTTP 分流是 product policy，不是 MRG 規則。**

---

# MT3／MT4／MT7 線（代號 `MT347`，與 MT2 線各自獨立）

> **`MT347` 不是 SWIFT 訊息型別**，是「MT3＋MT4＋MT7」的內部簡寫。
> SR2026 Cat 3 完整清單無 347（300/304/305/306/320/321/330/340/341/350/360/361/362/364/365/370/380/381/390–399）。

## 最高權威（**提任何範圍意見前必先讀**）

**`SWIFT_SR2026_MT3_MT4_MT7_SSI_分析_中文版_v7.docx`**（repo 根目錄）
SHA-256 `1A0B5CDBD6CC3F00CE13C8C978E445D2A54728A956B0240661FFE79230E2B985`，2026-09-08 **已同意**
→ 第 3 節逐支裁定 Cat3／4／7 **全 77 支**訊息；§4.3／§4.4 排除理由；§8 最終設計決議。

## 已同意之範圍（25 支，不得增刪）

MT300/304/305/306/320/330/340/341/350/360/361/362/364/365；MT400；MT730/734/742/750/752/754/756/765/768/769
計量：**25 messages｜362 cases｜164 rules｜53 scenarios**

## 已裁定為 N/A，**不得再提為「覆蓋缺口」**

**MT700／705／707／710／720／740／760**——有 5x 但屬 Trade Routing／Advising／Confirmation／Reimbursement Authority 角色。
不得出現在 memory、TDD、規則、案例、排除清單、OPEN 或 Coverage 分母；**不建立排除列，不新增 OPEN**。
其他 N/A：MT321（非 5x 結構）、MT370/380/381/39x、MT410/412/416/420/422/430/450/455/456/49x、MT701/708/711/721/732/744/747/759/761/767/79x。

## 核心原則（v7 §1）

- 「有 5x Tag ≠ 可由 SSI 推導」；只有 Settlement Routing／Correspondent／Account With Bank/Institution／Settlement Agent 屬 SSI。
- Cat 7 角色名稱陷阱：`53a`＝Reimbursing Bank、`56a`＝Advising Bank、`57a`＝'Advise Through' Bank、`58a`＝Requested Confirmation Party／Negotiating Bank——**皆非結算路徑**。
- 唯一 Mapping Key：`SR + Message + Direction + Sequence/Subsequence + Settlement Leg + Tag + Option + Official Role + Business Function`
- Runtime 僅三態：`RESOLVED`／`NOT_REQUIRED`／`NO_ELIGIBLE_SSI`（＋reasonCode）；Out-of-scope 用 `N_A`。
- FIN SSI Resolution 為 **REFERENCE_ONLY、paymentExecutable=false**；不執行付款。
- **MT↔MX 只適用 Category 1／2；MT3／4／7 一律不適用**（MT2／MX Settlement Resolution 為獨立流程，完全不變）。
  MT347 內所有 MX／pacs／converter／UG／round-trip Gate **必須移除**。Active OPEN 為 **7**：004、005、006、007、008、009、010。

## Cat3／4／7 MRG 錨點（皆逐頁驗證）

| 檔名                 |  頁 | SHA-256             |
| -------------------- | --: | ------------------- |
| `us3ma_20260717.pdf` | 774 | `5B4315EF876FF32C…` |
| `us3mb_20260717.pdf` | 635 | `BC510604859CF7C5…` |
| `us3u_20260717.pdf`  |  65 | `92F6F7E6D1D7EB1E…` |
| `us4m_20260717.pdf`  | 115 | `71F865223FD74B19…` |
| `us7m_20260717.pdf`  | 443 | `1F748A8262E5528F…` |

- Cat3 業務邊界：us3ma **p.6**「are not used for the transfer of funds」
- Scope 頁：MT300 p.14｜304 p.122｜305 p.194｜306 p.256｜320 p.422｜330 p.556｜340 p.638｜341 p.721｜350 p.15✳｜360 p.47✳｜361 p.206✳｜362 p.394✳｜364 p.446✳｜365 p.488✳（✳＝us3mb）
- **MT305 例外**：`53a`＝Sender's Correspondent、`57a`＝Account With Institution（**M**），us3ma p.195，在 Mandatory Sequence A 內
- MT400：欄位 us4m p.12；**NVR C1（C11）在 p.13**——57a 僅在 53a＋54a 皆存在時可present
- Cat7 欄位頁：730 p.177｜734 p.187｜742 p.215｜750 p.244｜752 p.252｜754 p.264｜756 p.275｜**765 p.355**（scope 在 p.354）｜768 p.389｜769 p.396
- Cat7 NVR 頁：730 C1/C2 p.177｜**754 C2 p.265**｜768 C1–C3 p.389｜**769 C1 p.396、C3 p.397**
- **MT742 p.221／MT754 p.271**：多重帳戶關係下須用 option A 並在帳號行指明具體帳號 →`58a` 為 `HYBRID_CONDITIONAL_SSI`（與 MT202 53a us2m p.46 同一教義）
- **MT765 修正中**：`56a`(No.21)／`57a`(No.22) 在 **End of Sequence A 之後**，為**訊息層**欄位；C3（D62）只管 Seq A ⟷ 59E，**不可作 56a/57a 的證據**。序列標籤 `A / Beneficiary` → **`MESSAGE / Message`**；欄位明細頁 p.363
- C81 方向陷阱：Cat2 五處為 `56a⇒57a`；**MT785 C1 p.410 為 `57a⇒56a`（反向）**→ 規則必須以 `(messageType, ruleNumber)` 為鍵

## 受控件與 SHA-256

| 檔案                                                        | SHA-256                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------ |
| `memory/swift-mt347.md`                                     | `F1B413E13253432E5153CA9EEC9D082460A897CAC4640E1288D8A2DDF1CCF490` |
| `qa/mt347/tdd/MT347_SR2026_SSI_TDD_CONTROLLED_v1.xlsx`      | `D586C86E61641CA3563771EA2AB937E3F15BA96A92F1F314007BCCE3BEA149D2` |
| `qa/mt347/MT347_SR2026_SSI_QA_Test_Plan_v4.xlsx`            | `1FDF15CFF1E78B0A6A3813163E6ADDD76517C0A045B240665003B249F2C5EFF5` |
| `qa/mt347/SWIFT_SR2026_MT3_MT4_MT7_SSI_分析_中文版_v5.xlsx` | `C3EC8EB1A5B256C51D707BE342C079DB9DEBE304B03B562046CBAF1C459BECD2` |

---

## 查證紀律（2026-09-12 新增，因我犯過的錯而立）

**提出任何「覆蓋缺口／範圍應擴張」之前，必須先讀完本檔列出的已同意歷史裁定文件。**
我曾在未讀 v7.docx 的情況下斷言 Cat 7 有 7 支「未裁定」，實則 v7 §3 表格與 §4.3／§4.4 早已逐支裁定 N/A。
這與 C2（未列 JSON 頂層鍵樹）、C6（自建 fixture 當缺陷）同屬「片面閱讀就下結論」。
**歷史裁定 > 我的即時觀察。**

---

→ 規範全文：`memory/swift-mt2xx-pacs009-v2.md`（CONTROLLED，BA/QA 2026-09-12 接受）
→ BA 裁定：`qa/mt2/reports/BA-MRG-MT202-53A-RULING-20260912.md`、`BA-DQ-NOSTRO-CONFIRMATION-20260912.md`
→ 獨立觀察與原始 JSON：`qa/mt2/reports/claude-independent-20260912/`
