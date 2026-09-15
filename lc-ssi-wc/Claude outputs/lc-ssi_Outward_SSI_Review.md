# lc-ssi — Outward SSI Suggestion／Resolution 程式碼審查

**審查對象：** `D:\Baseline_V6_20251231\lc-ssi-wc`
**範圍：** Outward SWIFT 交易的 SSI Suggestion 與 SSI Resolution
**角度：** SWIFT 標準符合性 ＋ 與 v1.0-rc 規格的一致性
**日期：** 2026-09-07

---

## 一、先講結論

Service 層比我預期的成熟——`validateFinSuggestionRequest` 裡有真正的 message-specific NVR 檢查（`MT400_C11_57A_REQUIRES_53A_AND_54A`，並標了 `validationLayer: "SWIFT_NVR"`），也有 `ownerSide` 的證據來源強制（SENDER_SIDE／RECEIVER_SIDE），甚至把 MT400 Direct 模式「必須省略 53A／54A／57A」寫進去了。RMA 模組本身的演算法也正確。

問題不在「沒想到」，而在**幾個已經寫好的控制沒有接上主流程**，以及**規則放在程式碼而不是目錄裡**。

以下依優先度排列。P1 建議在 Sprint 0 結束前處理。

---

## 二、P1：必須修

### 2.1 RMA 模組存在,但 Suggestion 與 Resolution 都沒有呼叫它

`apps/ssi-service/src/app/rma/rma-application.service.ts:19` 的檢查邏輯是對的——`ownBic + counterpartyBic + service + direction + messageType` 加有效期，回 `AUTHORISED／NOT_AUTHORISED／AMBIGUOUS／NOT_FOUND`。抓到了 RMA+ 的 message-type 粒度，這點做得好。

但是：

- `MessageMappingService` **完全沒有 constructor**（`message-mapping.service.ts:1-3` 只 import 了 `@nestjs/common`／`node:fs`／`node:path`）→ Suggestion 路徑無法呼叫 RMA。
- `route-resolution.policy.ts` 對 `rma|Rma|authoris` 的比對結果是 **0 命中** → Resolution 路徑也沒呼叫。

RMA 目前是一座孤島：有 controller、有 repository、有正確演算法，但沒有任何消費者。

凍結版 §8.1 已把 `Channel Authorisation` 放進選取鍵、§8.3 要求 outward network-bound resolution 必須 `channelAuthorisation.status=AUTHORISED` 且未過 freshness SLA。規格改好了，程式沒接。

**修法：** `MessageMappingService` 與 route-resolution 注入 `RmaApplicationService`，以 `ownBic + receiverBic + FIN + OUTGOING + messageType + valueDate` 呼叫；非 `AUTHORISED` 時回 `CHANNEL_NOT_AUTHORISED`（422）或 `CHANNEL_AUTHORISATION_STALE`（503），並在輸出附上 `channelAuthorisationDecisionId`。

> 目前輸出標了 `paymentExecutable: false`／`REFERENCE_ONLY`，所以還不會真的送網——這是有效的緩衝。但規格把 RMA 綁在 **trade tag resolution**，不只綁付款；而且這個檢查一旦延到送網才做，就失去「在解析階段還能改選替代 route」的價值。

### 2.2 5x 過濾器排除了 52a

`message-mapping.service.ts` 的 `/(^|\.)5[3-8][A-Z]?$/` 只收 53–58。

但凍結版 §10 的 Outward 表明列 52a：MT400（52a Ordering Bank）、MT742（52a Issuing Bank）、MT760／765／767。目錄 `parameters/ssi-mappings.sr2026.json` 裡也**一列 52a 都沒有**。

結果：52a 永遠不會被建議，進向也會被判 `UNMAPPED_SSI_FIELD`。

**修法：** 正則改為涵蓋 52–58（`5[2-8]`），並在目錄補齊各報文的 52a 列。50a／59 維持排除是對的——非銀行當事人依規格走逐交易輸入。

### 2.3 Option 選擇整條鏈都不存在

- 目錄 24 列**全部是 option A**，沒有任何 D 列。
- `libs/swift-ssi-mapping/src/lib/mapping.ts:3-11` 的 `MappingKey` 宣告了 `option?` 與 `qualifier?`，但 `sameKey()`（:18-23）與 `generate()`（:48-50）**都沒有比對這兩個欄位**——宣告成鍵的欄位是死的。
- 因此 57A 與 57D 無法區分；若目錄同時有兩列且 `path` 不同，`generate()` 會**同時輸出兩者**，而它們是同一欄位的互斥 option。

規格 §13.3 要求：A＝已驗證 BIC；D＝名稱／地址且 MX 前須結構化；B＝不得假造 BIC，無合規識別送 Repair。目前沒有任何一條被實作。

**修法：** 把 `option` 納入 `sameKey()` 與 `generate()` 的比對；目錄補 D 列；實作 `optionSelectionRule`（無已驗證 BIC → D；地址不結構化 → `PARTY_DATA_INCOMPLETE` 進 Repair）。

### 2.4 NVR 存在,但寫死在程式碼裡而不是目錄裡

`validateFinSuggestionRequest` 用 `if (request.messageType === "MT400")` 的方式硬編碼規則。這在 demo 可以，但：

- 每新增一個報文就要改程式，不是改資料；
- 規則無法隨 Standards Release 版本化、hash 與簽署；
- 目錄沒有 `presence`／`nvrRefs`／`coexistence` 欄位，所以 Gate G2 的「已簽署 Catalogue」無法涵蓋這些規則。

規格 §18 Gate G2 要求 Catalogue 逐列帶 validation rule 並簽署。目前規則不在被簽署的那份東西裡。

**修法：** 把 NVR 移進目錄列（`nvrRefs[]` ＋ `nvrEffect`），程式改成通用的規則直譯器。MT400 現有的三條規則可以當第一批資料。

---

## 三、P2：Resolution 的選取與 Token

### 3.1 `libs/domain/src/lib/resolution.ts` 的選取鍵只有三個維度

`resolution.ts:22-26`：`status === 'ACTIVE' && counterpartyId === … && route.currency === …`

缺：`ownerLegalEntity`、`branch`、`direction`、`product/event`、`settlementMethod`、`clearingChannel`、**`valueDate` 有效期判斷**。規格 §8.1 的選取鍵有 13 個維度，§8.3 要求 `validFrom <= valueDate AND (validTo is null OR validTo >= valueDate)`——`ResolutionRequest`（:4-9）連 `valueDate` 欄位都沒有。

缺 `ownerLegalEntity` 尤其嚴重：多法人部署下，別的法人的 SSI 可以被選中。

**這也正是我看 MT750 那張畫面時提的問題的程式證據**：只用 counterparty 比對，去推導「我方希望收款的帳戶行」。`route-resolution.policy.ts` 有用到 `valueDate`（:91、:323），建議確認兩條路徑何者為準，並讓 libs 版本與之對齊或直接移除以免誤用。

### 3.2 `resolutionToken` 是裸 UUID

`resolution.ts:33`：`resolutionToken: randomUUID()`。

規格要求的是短效、單一 Payment Intent 使用、**可離線驗章**的 token，至少綁定 Payment Intent ID、SSI ID／Version、Snapshot Hash、Amount、Currency、Value Date、Settlement Method、Decision ID、issuedAt、expiresAt。

目前：無簽章、無綁定、無到期時間，也沒有 `decisionId`。任何持有該 UUID 的人都可以宣稱取得授權。

### 3.3 `snapshotHash` 用 `JSON.stringify`,不是 canonical 序列化

`resolution.ts:31,34`。`JSON.stringify` 的鍵序取決於物件建構順序，欄位重排或跨語言重算會得到不同 hash → 在 consume 階段產生**假的 `SSI_VERSION_CHANGED`**，把正常付款擋掉。

**修法：** 鍵排序的 canonical JSON，並把 `canonicalSchemaVersion` 一起放進被 hash 的 payload。

---

## 四、P3：SWIFT 語義與目錄內容

| # | 位置 | 問題 |
|---|---|---|
| 1 | 目錄 MT700 57A | `canonicalRole: "ADVISE_THROUGH_BANK"`。凍結版 §10.1 明訂 canonical role 應為 **`SECOND_ADVISING_BANK`**，`ADVISE_THROUGH_BANK` 只能作 release-aware **alias**。目前把別名當正名 |
| 2 | 目錄 MT760 57A／58A | 直接沿用 MT700 的 `ADVISE_THROUGH_BANK`／`REQUESTED_CONFIRMATION_PARTY`。MT760 自 SR2020 改為分 sequence 的擔保架構，當事人結構與 MT700 不同。這正是規格禁止的「同 tag 號碼＝同角色」推定，須以 Category 7 MRG 逐欄重建 |
| 3 | 目錄 sequence 編碼 | MT300 用 `B1.53A` 前綴，MT320／MT760 用裸 `53A`。sequence 不是 first-class 鍵欄位，只是 `path` 字串的一部分 → 無法驗證、無法查詢、改版時容易漏 |
| 4 | 目錄 pacs.008 | `CdtrAgt.FinInstnId.BICFI` → `BENEFICIARY_BANK`，但 pacs.009 同一 XPath → `ACCOUNT_WITH_INSTITUTION`。依你們 §13 對照表，`CdtrAgt` 對應 57a Account With Institution；58a Beneficiary 對應的是 pacs.009 的 `Cdtr`。**pacs.008 這一列應該是錯的** |
| 5 | 目錄無 `roleClass` | `ACCOUNT_WITH_INSTITUTION` 同時出現在 MT400／MT742／MT765 與 pacs.009。`generate()` 純以 canonicalRole 取值 → 一份由 MT765 擔保索賠建出的 roles map，可以直接灌進 pacs.009 的 `CdtrAgt`。缺 TRADE_ROUTING／SETTLEMENT 分類與 `prohibitedTargets` 守門 |
| 6 | 目錄無 INCOMING 列 | 24 列全是 OUTGOING → `extract()` 對任何進向欄位都回 `UNMAPPED_SSI_FIELD` |
| 7 | `reusableCandidate` | 掛在 OUTGOING 列上是死資料——該旗標治理的是進向擷取能否成為可重用 SSI |
| 8 | MT400 businessFunction | 只有 `COLLECTION_PAYMENT_DIRECT`，沒有 SEPARATE。規格 §8.5 兩種模式都要 |

---

## 五、P4：工程面

1. **`catalogue()` 每次呼叫都重讀檔案。** `message-mapping.service.ts:81-89` 做 `readFileSync` + `JSON.parse`，而 `extract()` 在**逐欄位迴圈內**呼叫它 → O(欄位數) 次檔案 I/O，且同一請求可能跨到不同版本的目錄。應啟動時載入一次並把版本＋hash pin 進每筆 decision。
2. **輸出的 provenance 沒有目錄版本／hash。** 檔案裡有 `catalogueVersion: "2026.1-demo"`，但 `suggestions[].provenance` 沒帶。規格 §7.11 的 `SwiftStandardProvenance` 要求 `sourceArtifactId` ＋ `sourceArtifactHash`。少了它，事後無法證明某筆建議是由哪版目錄產生。
3. **`catalogue()` 寫死 `ssi-mappings.sr2026.json`**，忽略 `request.standardsRelease`。§16.6 明文要求 current／future／deferred profile 可並行載入——目前架構做不到，明年切換時會卡住。
4. **`valueDate` 收了但沒用在有效性判斷**（`suggestFinTags` 只檢查它存在）。`roleEvidence.effectiveFrom/effectiveTo` 欄位也定義了卻沒有與 `valueDate` 比較。

---

## 六、做得對的地方,請保留

- **Fail-closed 姿態完整**：`usage: "REFERENCE_ONLY"`、`paymentExecutable: false`、`watermark: "NOT FOR PAYMENT RELEASE"`、以及 `MAPPING_PENDING` 時只回 `candidateFields` 不回推測值。MT750 那張畫面就是這條路徑，行為正確。
- **`validationLayer` 分類**（`SWIFT_NVR`／`SWIFT_FIELD_VALIDATION`／`SWIFT_USAGE_SEMANTIC`／`LOCAL_POLICY`／`EVIDENCE_MISSING`）是很好的設計——它讓「這是 SWIFT 規則」與「這是我們的政策」在錯誤回應裡就分得開。建議寫進規格當標準做法。
- **`ownerSide` ＋ `sourceTypes` 的證據強制**：53A 只接受 SENDER_SIDE 來源（Nostro／自家 SSI），54A 只接受 RECEIVER_SIDE 來源。這正是能防住「用對手行推導我方帳戶行」的控制——**它已經存在，只是還沒推廣到 MT400 以外的報文**。
- **MT400 Direct 模式**要求 53A／54A／57A 全部省略，且要 `directRelationshipEvidenceId`——與規格 §8.5 一致。
- **MT300 B1 的 53A=DELIVERY_AGENT／57A=RECEIVING_AGENT** 是 Category 3 的正確語義（與 Category 1／2 的 Sender's Correspondent／Account With Institution 不同）。
- BIC `^[A-Z0-9]{8}([A-Z0-9]{3})?$` 與 currency `^[A-Z]{3}$` 的格式檢查。

---

## 七、建議的處理順序

| 順序 | 項目 | 估計 |
|---|---|---|
| 1 | 注入並呼叫 RMA（Suggestion ＋ Resolution 兩條路徑） | 0.5 天 |
| 2 | 5x 正則改 `5[2-8]`；目錄補 52a 列 | 0.5 天 |
| 3 | `option` 納入 `sameKey()`／`generate()` 比對；目錄補 D 列 | 1 天 |
| 4 | Resolution 選取鍵補 `ownerLegalEntity` ＋ `valueDate` 有效期 | 0.5 天 |
| 5 | `snapshotHash` 改 canonical JSON；`resolutionToken` 改為簽章＋綁定＋expiresAt | 1 天 |
| 6 | 目錄修正：MT700 改 `SECOND_ADVISING_BANK`、pacs.008 `CdtrAgt` 改 `ACCOUNT_WITH_INSTITUTION`、MT760 待 MRG 重建、加 `roleClass` | 0.5 天＋MRG 查證 |
| 7 | NVR 由程式碼移入目錄資料；`ownerSide` 證據規則推廣至其他報文 | 2–3 天 |
| 8 | 目錄單次載入＋版本 hash 進 provenance；支援多 Release 並行 | 1 天 |

第 1–5 項不需要 licensed artifact 就能做完；第 6、7 項的正確值必須來自你們目標 SR 的授權 MRG——這也正好是 Gate G2 的工作。

---

## 八、與 UI 那張截圖的關聯

上一輪我從 MT750 畫面提的兩點，在程式碼裡都得到印證：

- **MT750 沒有目錄列** → `pendingCandidateFields()` 觸發 `MAPPING_PENDING`。畫面行為正確，缺的是目錄。
- **57a 由對手行推導** → `libs/domain/src/lib/resolution.ts:22-26` 只比對 counterparty＋currency。而正確的控制（`ownerSide: SENDER_SIDE` 的證據強制）其實已經寫在 MT400 分支裡了，只是還沒套用到其他報文——所以這一項的修法不是新設計，是把既有規則一般化。
