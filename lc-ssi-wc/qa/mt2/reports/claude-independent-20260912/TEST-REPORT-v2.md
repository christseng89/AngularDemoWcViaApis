# MT2xx SSI Resolution — 獨立測試報告 v2
執行者：Claude（獨立執行，未參考專案端任何測試輸出）
執行日：2026-09-12 · 範圍：**MT2xx OUTWARD ONLY**
判定紀律：**每個回應先輸出完整鍵樹（頂層＋mx＋mt）再下判斷**；自建 fixture 的結果一律標明。

---

## 一、執行環境（全部由 Claude 自行建置）

| 項目 | 值 |
|---|---|
| 執行位置 | Claude 雲端容器（**非**專案端機器） |
| 服務 | `dist/apps/ssi-service`，Nest 11，port 3101，prefix `/api` |
| dist 建置時間 | 2026-09-12 06:27（晚於全部相關原始碼 06:08／06:14，非 stale） |
| DB | `data/ssi-demo.sqlite` SHA-256 `79952a31a1bc258f678f009eed58f1cc6627a2ca7b67d1f25fd760b307f6771a`（含 10,456,592 bytes WAL 與 SHM 一併複製） |
| 執行期快照識別 | `fd6a4c064fe81f42aab1d3e30c293f45fd3908fa6bf2c92fbbf3381fcad378a6`，method `SQLITE_WAL_AWARE_LOGICAL_SNAPSHOT_V1` |
| 案數 | 11（9 + 57A 補充 2） |

### 原始證據
| 檔 | SHA-256 |
|---|---|
| `probe-raw.json` | `EB072B55F5E5D2D1FAF2FF6E305394B0C67B0C208B2B71F38127842D8B837722` |
| `probe-keytree.txt` | `0EC814AC616B21D4F6DDC9941884D668AC9B5B73AC15E6A3B49405129BF3977E` |
| `probe-57a-raw.json` | `923A880A5C71E347079230A99CC8852EB9658D4A310CDD73D1B22141FA51B692` |

---

## 二、執行結果

| 案 | 情境 | HTTP | reasonCode |
|---|---|---|---|
| A1 | generic MT202 → CITIUS33 USD（受控 applicability） | 200 | — |
| A2 | generic MT202 → CHASUS33 USD（受控 applicability） | 200 | — |
| B1 | generic MT202 → CITIUS33 USD（overlay applicability） | 200 | — |
| B2 | generic MT202 → BARCGB22 USD（overlay applicability） | 200 | — |
| C1 | BOOK_TRANSFER 正向（帳號相異） | 200 | — |
| C2 | BOOK 不同 nostroId、相同 accountReference | 422 | `OWN_ACCOUNT_DEBIT_CREDIT_COLLISION` |
| C3 | BOOK 跨幣別 | 422 | `OWN_ACCOUNT_CURRENCY_MISMATCH` |
| C4 | BOOK servicer 不符 | 422 | `OWN_ACCOUNT_RECEIVER_MISMATCH` |
| C5 | 57A 情境，只給貸記 pin | 422 | `OWN_ACCOUNT_PIN_REQUIRED` |
| D1 | 57A 情境，借記在 Receiver、貸記在他行 | 200 | — |
| D2 | 57A 情境，貸記亦在 Receiver（退化形狀） | 422 | `OWN_ACCOUNT_RECEIVER_MISMATCH` |

---

## 三、已修復確認（本輪實測，可結案）

**F1 · BOOK 報文層完全正確**（C1）
```
53B = "/DEMO-NOSTRO-001-PRIMARY"
58A = "/DEMO-NOSTRO-001-EXPCOLL\nDEMOHKHH"
omitted = ["57A"]
renderingDecisions.53B = {outcome:"INCLUDE", option:"B", rule:"MRG_MT202_DEBIT_ACCOUNT"}
renderingDecisions.57A = {outcome:"OMITTED_BY_RULE", rule:"MRG_MT202_BOOK_TRANSFER_RECEIVER_IS_AWI"}
DbtrAcct = DEMO-NOSTRO-001-PRIMARY   CdtrAcct = DEMO-NOSTRO-001-EXPCOLL（相異）
SttlmAcct.semanticRole = "SETTLEMENT_DEBIT_ACCOUNT"
```
符合 MRG p.40（53B 借／58A 貸＋Sender）、p.52（57a 缺席＝Receiver 為 AWI）。

**F2 · 57A 情境已修正**（C5／D1／D2）
- C5：只給貸記 pin → 422 `OWN_ACCOUNT_PIN_REQUIRED`。舊版會令 `debit = credit`，**該行為已不存在**。
- D1（正確形狀）：`53B=/DEMO-NOSTRO-001-PRIMARY`、`58A=/DEMO-NOSTRO-001-SECONDARY + DEMOHKHH`、**`57A=HSBCHKHH` ≠ Receiver `CITIUS33`**，`omitted=[]`，`renderingDecisions.57A={outcome:"INCLUDE", rule:"MRG_MT202_CREDIT_ONE_OF_SEVERAL_AT_57A"}`，`DbtrAcct ≠ CdtrAcct`。
- D2（貸記亦在 Receiver）：422 `OWN_ACCOUNT_RECEIVER_MISMATCH` —— **相等性防護已實作**。

→ 前版報告之 C6、C7 兩項，本輪實測證實已修復並有防護。

**F3 · 撞號防護比對渲染字串**（C2）
`0f56135e` 與 `d633da6c` 為不同 nostroId、相同 `accountReference`，正確回 422。

**F4 · 快照身分**
`snapshotIdentityMethod = SQLITE_WAL_AWARE_LOGICAL_SNAPSHOT_V1`，雜湊 `fd6a4c06…78A6`。
本次在**不同機器、不同 DB 副本**上執行，得到與先前瀏覽器 UAT 相同的識別碼 —— 可重現性成立。

**F5 · BARCGB22 覆蓋**（B2）
overlay applicability 下 → `SSI-UAT-GEN-03 v1`，HTTP 200。前版 D1「BARCGB22 無覆蓋」之敘述本輪不成立，維持已更正之「跨 applicability 不對稱」。

---

# 1 · 代碼問題（已驗證）

> 全部位於 **generic／counterparty 路徑**。own-account 路徑本輪 6 案零缺陷。

## K1 · generic 路徑不輸出 `resolutionDomain` 與 `counterpartySsiResolution`
鍵樹全展開後確認：A1／A2／B1／B2 之頂層 15 鍵與 `mx` 13 鍵中**均無**此二欄；own-account 之 `mx` 20 鍵中兩者皆有。
影響：R9 之 GEN-202-01／02 期望 `COUNTERPARTY_SSI` / `RESOLVED`，無法取得。

## K2 · 證據欄位放置位置兩路徑相反
| 欄位 | generic | own-account |
|---|---|---|
| `snapshotHash`／`snapshotIdentityMethod`／`resolutionToken` | **頂層**，`mx` 內無 | **`mx` 內**，頂層無 |
| `renderingDecisions` | **頂層**，`mt` 內無 | **`mt` 內**，頂層無 |
| `chosenRoute`／`code` | 頂層與 `mx` 皆有 | 僅 `mx` |
單一 JSON Path 無法同時定址兩條路徑，evidence gate 必須寫兩套。

## K3 · 候選集合欄名不一致
generic 用 `alternatives`（A1 = 1 筆 `SSI-DEMO-002 v39`），own-account 用 `candidates`（C1 = `[]`）。R9 欄名為 `candidates`。

## K4 · generic 路徑省略 53a，且無任何 rendering decision
- `mt.omitted` 含 `"53a"`（A1、A2、B1、B2 皆同）
- generic 之 `mt` 僅 4 鍵（renderer／tags／omitted／assertions），**無 `renderingDecisions`**
- 頂層 `renderingDecisions` 僅兩鍵：`MT202.57a`（OMITTED_BY_RULE）與 `pacs.009.CdtrAgt`（INCLUDE），**無 53a 條目**

即：53a 既未渲染，也未留下任何省略裁決。
MRG p.45：多重同幣別直接帳戶關係且其一用於償付時，該帳戶 **must be indicated in field 53a, using option B with the party identifier only**；且「absence of 53a and 54a implies the **single** direct account relationship」。
本輪實測資料佐證見資料問題 J2。

## K5 · generic 路徑 58A 無 Party Identifier
A1 `58A = "CITIUS33"`、A2 `58A = "CHASUS33"`、B2 `58A = "BARCGB22"`，皆僅 Identifier Code。
格式本身合法（p.52 Party Identifier 為選用），但與 own-account 之 `/<account>\n<BIC>` 風格相反；在 K4 未裁定前，收報行無從得知應借記哪一戶。

## K6 · 同一個 nostro 在兩條路徑渲染成不同字串
同為 `nostroId fe5d672f v4`：
- generic（A1）：`messageComposerContext.SttlmAcct.value = "DEMO-NOSTRO-001-PRIMARY-PRIMARY"` ← maskedAccountRef
- own-account（C1）：`DbtrAcct.value = SttlmAcct.value = "DEMO-NOSTRO-001-PRIMARY"` ← accountReference

同一筆帳戶，兩條路徑上線的字串不同。

## K7 · `roleProvenance` 覆蓋範圍兩路徑差距大
- generic：2 筆（`instructedAgent`、`creditorAgent`）；`canonicalRoles` 有 7 鍵（含 `directAccount: true` 布林與 `creditorSource` 字串，兩者非角色）
- own-account：6 筆（sender／debtor／beneficiary／receiver／debitAccount／creditAccount）
- generic 之 58A 來源記於另一結構 `fieldProvenance`（1 筆：`58A → TRANSACTION_CONTEXT / CITIUS33`）

資訊存在但分散於兩種形狀，遍歷 `roleProvenance` 的斷言在 generic 路徑會漏掉 58A。

## K8 · `chosenRoute.routePurpose` 在受控 applicability 下為空字串
- A1／A2（受控）：`routePurpose = ""`，`selectedBy = "CONTROLLED_RANK_KEYS"`
- B1／B2（overlay）：`routePurpose = "INTERBANK_TRANSFER"`，`selectedBy = "EXACT_BUSINESS_PURPOSE_MATCH"`

v15.3 瀏覽器 UAT 斷言中含 `routePurpose`；若同一套斷言套用到受控案例，比對對象會是空字串。

---

# 2 · 資料問題（已驗證，以本輪 DB 實查）

DB：`79952a31a1bc258f678f009eed58f1cc6627a2ca7b67d1f25fd760b307f6771a`
`nostro_account` 240 列、`ssi` 268 列。

## J1 · ACTIVE Nostro 之 `accountReference` 大量重複，另有大量 NULL
- ACTIVE 共 **163** 列
- `accountReference` **重複組數 42**
- `accountReference` 為 **NULL 者 69 列**（渲染時回退 `maskedAccountRef`，使 53B／58A 的來源欄位在同一資料集內不一致）

## J2 · CITIUS33／USD 存在多重直接帳戶關係 —— K4 的資料依據
`accountServicerBic = CITIUS33` 且 `currency = USD` 的 ACTIVE 列：**12 列，6 個相異 `accountReference`**。
符合 MRG p.45「multiple direct account relationships in the currency of the transaction」之條件。
而 A1 選中 `DEMO-NOSTRO-001-PRIMARY`、A2 選中 `DEMO-NOSTRO-001-EXPCOLL`，兩案 53a 皆省略 —— 兩張報文在帳戶維度無法區分。

## J3 · `maskedAccountRef` 未遮罩，且與 `accountReference` 大量不同
**94 列**之 `maskedAccountRef` 與 `accountReference` 不同，例如 `DEMO-NOSTRO-001-PRIMARY` → `DEMO-NOSTRO-001-PRIMARY-PRIMARY`（更長的明碼）。欄名與內容不符，且與 K6 直接相關。

## J4 · live DB 含 12 筆 `SSI-UAT-*` overlay SSI
A1／A2（受控 applicability）解到 `SSI-DEMO-001 v44`／`SSI-DEMO-021 v39`；
B1／B2（overlay applicability）解到 `SSI-UAT-GEN-01 v1`／`SSI-UAT-GEN-03 v1`。
兩組 SSI 並存於同一 DB，由 applicability 區分。**本輪未觀察到 overlay 擠掉受控 SSI。**

---

# 3 · 待確認（未驗證，不得當作結論）

| 編號 | 事項 | 狀態 |
|---|---|---|
| P1 | K4 的 53a 是否應輸出 —— 須由 BA 依 MRG p.45 正式裁定。若裁定為「本資料集不構成多重直接帳戶關係」，K4／K5／J2 一併解除 | BA 已同意重裁，尚未裁定 |
| P2 | R9 的 48 案（SSI-DEMO-*）與 v15.3 的 48 案（SSI-UAT-*）兩套矩陣之名分 | 待裁 |
| P3 | BA 提出的 `MT202-14` false PASS（期望 SSI-DEMO-021、實得 SSI-UAT-GEN-10 仍判 PASS） | **本輪未獨立重現** —— 我未執行專案端 runner，僅能確認其根因與 K3／K8 一致：驗證器若不比對 `chosenRoute.ssiCode`＋`ssiVersion` 就不會失敗 |
| P4 | BOOK-05、UI-STALE-01、UI-RACE-01 | 本輪未執行（僅測 API 層） |

---

# 4 · 本報告不宣告之事
- 未宣告任何 UAT 案件通過。
- 未執行 UI 測試。
- 未使用專案端任何既有測試輸出；11 案全由本報告所附 raw JSON 佐證。
- K1～K8 與 J1～J4 皆可由 `probe-keytree.txt` 對應行次覆核。
