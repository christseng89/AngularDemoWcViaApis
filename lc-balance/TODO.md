# Balance Component — 未完成事項清單（TODO）

**整理日期**：2026-08-24（更新版，基於 `lc-balance/` 還原到 `LC-Balance-Component-Completed` 區塊1狀態
`e6ee8e7` 之後的內容，只保留區塊1的 A9 SG Redemption 鎖定、A10/B6 Close 相關收尾）
**依據**：`CLAUDE.md` 決策日誌（截至區塊1最後一筆 `Balance-Component-Test-Case-Proposal.md §4` 條目）、
`Quality-report-balance.md`（截至 2026-08-21 重審）、`analysis/Balance-Component-DB-Optimization-Analysis.md`（2026-08-21）、
`analysis/TF-Balance-Component-BA-Review-zh.docx`（2026-08-25 BA 專家評審，高嚴重度發現已併入第2節）

本清單只收錄「已知、已記錄、但尚未真正動手解決」的事項；已修復並在上述文件中標註 **Fixed/已完成** 的項目不重複列出。

---

## 1. 生產部署前的硬性阻擋項（Gate Conditions）

三項皆為**已決策延後**（deferred, user-confirmed），不是遺漏，但只要專案要處理真實交易金融資料或真實使用者身份，
三項都必須先解決，且是本清單中優先級最高、工程量最大的部分。

- [ ] **BAL-001**（🔴 Blocker）— 微服務完全沒有身份驗證/授權
  `createdBy`/`releasedBy` 等欄位目前直接信任 request body 內容；需要改成從已驗證身份在伺服器端推導，
  而非由呼叫端自行宣稱。**2026-08-25 BA 專家評審（`analysis/TF-Balance-Component-BA-Review-zh.docx` F4）
  獨立確認並列為高嚴重度**：`createdBy`/`releasedBy`/`checkerId` 均為呼叫端提供的自由文本，未經驗證即被
  信任，經辦/複核身份目前均為演示用數據；審計軌跡中「誰提交、誰複核」這一核心信息目前完全無法驗證，僅此
  一項就應阻止任何涉及真實交易對手或真實金額的試點——這不是 BA 職責範圍內可解決的問題，而是一道硬性的
  簽署關卡，在制定上線計劃前務必確認已列入關鍵路徑。

- [ ] **BAL-002**（🟠 Critical）— Angular 生產依賴 8 個 High 等級 CVE，卡在 17.3.x 版本線
  需要一次 major 版本升級（17 → 22）才能脫離受影響版本；本身是有真實破壞性風險的大工程，故延後。

- [ ] **BAL-102**（🟡 Major）— SQLite 全檔案鎖，無法達成「同一 LC 序列化、不同 LC 互不阻塞」的行級鎖需求
  須換成 PostgreSQL（`SELECT ... FOR UPDATE` 鎖在 `balance_contract_id` 上）或同等引擎才能真正驗證此需求；
  目前沙盒環境沒有 PostgreSQL 實例可開發/測試。

---

## 2. BA 專家評審高嚴重度發現（2026-08-25，`analysis/TF-Balance-Component-BA-Review-zh.docx`）

BA 專家評審（範圍：`microservices/balance-component` 源代碼、API 規範、決策表、知識庫、業務規則決策、
測試用例提案）原始版本記錄 16 項發現（高4／中8／低4）；**2026-08-25 該文件本身已修訂**，撤回原編號 F2
（承兌/DPU 影子備查科目與分類體系矛盾），現為 15 項發現（高3／中8／低4），發現編號整體往前遞補一位。
以下收錄修訂後的 **F1–F2**（高嚴重度中的2項）；修訂後第3項 **F3**（缺乏生產級身份驗證/授權）與第1節
**BAL-001** 為同一件事，已併入該項而非另立條目。中/低嚴重度發現（修訂後 F4–F15）該文件本身已建議
「各建一條待辦即可，不會阻礙後續開發」，暫不逐條搬進本清單，需要時直接查該 docx。

~~⚠️ 已知落差（2026-08-25 發現）~~ — **已由 BA 解決**：`analysis/` 底下曾同時存在三份 BA Review
docx，其中無 `-en` 後綴的那份內容已同步修訂，`-en.docx` 卻是過期的16項版本。BA 已於同日將無後綴檔案
重新命名為 `TF-Balance-Component-BA-Review-en.docx`（取代舊內容）並移除無後綴檔案，現在 `analysis/`
底下只剩 `-zh.docx`／`-en.docx` 兩份，符合本專案命名慣例，且兩份都已同步最新修訂（15項發現，高3／中8／
低4，含撤回原F2、改寫F2買方遠期的兩段 Revision note）——不必再另外核對。

- [x] ~~**F1**（🔴 High）— 完全缺失到期 / UCP 600 第16(f)條自動釋放觸發機制~~ — **2026-08-25 已完成**
  （`analysis/balance-component-api.yaml` v1.19.0/v1.20.0、`analysis/Balance-Component-F1-Expire-Proposal-zh.md`）。
  知識庫 Knowledge-Gaps GAP-005/GAP-006 的原始問題（不存在 timer/cron，僅靠人工 `CLOSE`）已解決：新增
  `EXPIRE`（`domain/expiryEligibility.ts`，資格判斷刻意不看 SG/Acceptance 餘額）與獨立的 `AUTO CLOSE` 批次
  （沿用既有 `evaluateCloseEligibility()`），兩者各自獨立 feature flag（`AUTO_EXPIRY_ENABLED`/
  `AUTO_CLOSE_ENABLED`），走現有、未修改的 Maker/Checker 兩段式流程（`BATCH_MAKER`/`BATCH_CHECKER` 系統
  角色），`mail_float_grace_days` 依進口/出口分開設定、於 ISSUE 當下記錄到合約上（不隨後續 config 調整回頭
  改變舊信用證的到期時點，本欄位當初提出的疑慮已解決）。同時交付：Expiry Extension Amendment（A2/B2 第三
  選項 `AMEND_EXPIRY_DATE`，EXPIRED 狀態下可延展效期恢復 `ACTIVE`）、A11/B7 LC/Confirmation Reopen（CLOSED
  狀態下可重新開啟，§9.7 正確處理 EXPIRE→AUTO CLOSE 鏈式沖銷）。**2026-08-25 同日 UAT 後重新設計**：REOPEN
  最初設計（金額固定 0、Release 時另外產生連動 `REVERSAL` movement）在使用者實測後發現 Checker 在核准前看不到
  真實分錄與金額——已改為 REOPEN 自己在 Submit 當下就帶入伺服器算出的真實金額（沖銷鏈加總）並產生真實
  `contingentAccountEntry`，Checker Approve 前即可審核；Inquire Events/Look Up 現在每筆 Reopen 只顯示一筆
  記錄，不再是兩筆。`REVERSAL` movementType 本身保留（Expiry Extension Amendment 仍在使用），只是 REOPEN
  不再用它。三套測試套件（microservice/Angular/backend）全綠，27 筆 Business Case Registry 案例（含新增的
  Import Case 13-15、Export Case #12）實測通過。

- [x] ~~承兑/遲期付款承諾被列為影子備查科目，與分類體系規範相矛盾（原編號 F2）~~ — **BA 已於
  2026-08-25 撤回此項發現，確認並非缺陷**。本項曾在同一天內反覆核查三次：(1) 對照原始碼確認
  `contingentAccountEntry.ts` 對 IPLC_ACCEPTANCE／EPLC_ACCEPTANCE 確實只產生 `(memo)` 影子配對；
  (2) 對照 `TF_Balance_Component_Mapping-{en,zh}.xlsx` 的 `Balance_Taxonomy`／`L2_Balance_Movement`
  分頁，發現該工作表把 `ACCEPTANCE_DPU_OUTSTANDING` 標成 `ON_BALANCE_LIABILITY`，「ON_BALANCE 是指
  EBL/IBL」的假設當時被判定不成立；(3) BA 隨後對照知識庫三份文檔——
  `docs/obsidian-balance-kb-v3.2/04-Exposure-Accounting/ifrs-9-contingent-to-actual-reclassification-boundary.md`、
  `.../exposurenature-actual-tagging-for-acceptance-dpu.md`、
  `.../on-balance-sheet-asset-instruments-are-out-of-balance-component-s-cont.md`——確認
  `analysis/contingent-liability-ledger.html` 的 Folio 3「Classification note」本身就明講：Folio 3/5
  的影子備忘 Dr/Cr 配對「永遠不構成會計記錄」，只供 MIS/對帳展示；承兌動作本身在 Balance Component
  自己的領域模型裡已正確標記 `exposureNature = ACTUAL`（反映 IFRS 9 下或有→現時無條件負債的形態轉換），
  而該負債實際的表內記帳與對應應收款，**按設計**排除在本組件範圍外（`deriveContingentAccountEntry()`
  對表內資產類工具一律回傳 `null`）——與 EBL/IBL 已貼現敞口記帳交由下游 Loan Component 處理的邊界方式
  一致。也就是說：`TF_Balance_Component_Mapping-*.xlsx` 工作表裡 `RECOGNISE_ONBS`／
  `ACCEPTANCE_DPU_OUTSTANDING` 那一步，屬於下游會計/GL 組件（透過 `accountEntries` 欄位過帳）的職責，
  不是 Balance Component 自己要做的事——兩份文件本來就不衝突，只是分別描述交易鏈的不同段落。
  `CLAUDE.md` 決策日誌已同步記錄最終結論（供未來 `TF_Balance_Component_Mapping-*.xlsx` 校閱時參考）。

- [x] ~~F2（🔴 High，原編號 F3）— 出口買方遠期（Buyer's Usance）路由邏輯尚未落實既有決策~~ —
  **2026-08-25 業務端確認：不需要動手實作，關閉**。與本文件第4節「`Balance-Component-Business-Rule-
  Decisions-2026-08-21.md` 的 action item 3」為同一件事。背景：BA 複核曾先把這項從「業務方尚未關閉的
  行動項」修正為「業務決策已定案（決策2：Buyer's Usance 是開證行對買方的融資安排，只存在於 Import
  側，Export／保兌行自身帳上不構成延期付款曝險，須與 Sight 做完全相同的處理），純屬工程待實作」；
  隨後**業務端進一步確認並更正**：實務上出口（Export／保兌）根本不存在 Buyer's Usance 案例，
  `tenorType: 'BUYERS_USANCE'` 對 `EPLC_CONFIRMATION` 這個組合在真實業務流程裡不會出現，因此不需要
  投入工程資源新增防護性拒絕邏輯。**若萬一真的出現，正確處理方式是當作 Sight 處理**（不是報錯拒絕）——
  對應到目前程式碼，就是 `maker-panel.component.ts:733`
  `this.model.movementType = this.selectedContract.tenorType === 'SIGHT' ? 'HONOUR' : 'ACCEPT'` 這行的
  三元判斷；嚴格照決策2實作的話應改成排除 `BUYERS_USANCE` 也走 `HONOUR`（例如
  `=== 'SELLERS_USANCE' ? 'ACCEPT' : 'HONOUR'`），但因為這個輸入實務上不會發生，這行維持現狀即可，
  純記錄「萬一發生時的正確行為」供之後參考，不代表現在要改。`export-case-2`／`export-case-4` 已改為
  `SELLERS_USANCE`（2026-08-22 驗證）即已反映正確的實務情境。若未來業務面出現真實的出口買方遠期案例，
  應重新開啟此項，並依上述方式（正規化為 Sight/HONOUR，而非拒絕）落實。

---

## 3. 次要但仍開著的項目

- [ ] **BAL-129**（🔵 Minor，Test Gap）— BAL-117 修的「泛用 500 handler 不外洩內部錯誤訊息」本身沒有測試覆蓋
  若未來不小心讓這個行為 regress，目前的測試套件不會抓到。

- [ ] **BAL-120**（⚪ Info，已確認延後）— 冪等性衝突偵測仍靠字串比對 SQLite driver 的錯誤文字
  卡在 `node:sqlite`（Node 內建 `DatabaseSync`）目前沒有穩定的 constraint-violation 錯誤碼可用，
  非擱置不做，而是等上游能力補齊。

- [ ] **`ContractVersionConflictError`（⚪ Info，單向落差，2026-08-24 稽核發現）** — `errors.ts` 定義了這個
  409 `CONTRACT_VERSION_CONFLICT` 錯誤類別，但整個 `src/` 沒有任何地方真的拋出它（死碼），OAS 的
  `Error.code` enum 也完全沒列這個代碼。影響很小（目前用不到），但屬於 OAS 全面稽核時發現、尚未處理的項目。

- [ ] **F1 §11.4（原三項「維持待決」，已於 2026-08-25 由 BA 透過
  `analysis/Balance-Component-F1-Expire-Proposal-zh.md` §13〈§11.4 四項待決事項正式拍板〉正式拍板——
  四項全部轉為「已決定、尚未實作」，不再是懸而未決；以下逐項列出拍板後的具體工程需求，仍未動手，記錄於此）**：

  - [x] ~~**Sweep 分輪保護 — REOPEN 這一段**~~ — **2026-08-25 已修復**（`analysis/balance-component-api.yaml`
    v1.21.0）。原問題：`DISPLAY-TEST-01` 實測重現「EXPIRE → 同一輪 AUTO CLOSE → 手動 A11 Reopen 後又立刻被
    下一輪 AUTO CLOSE 掃回關閉」，完全沒有 Expiry Extension Amendment 的重啟窗口。已加上
    `isRecentlyReopened()`：一筆合約的最新交易若是 RELEASED 的 `REOPEN`，AUTO EXPIRY／AUTO CLOSE 兩個批次
    都會在**一個完整 sweep 間隔**內跳過它不處理（不是永久排除——用意是給人為操作留出時間，不是讓合約卡死；
    間隔一過，或有其他交易落在這筆合約上，正常掃描行為即恢復，真正到期的 ACTIVE 合約仍會準時被 AUTO EXPIRY
    處理）。**與下方 §13.7/§13.5 的關係**：BA §13.8 事後分析認為 PENDING 期間本來就靠既有機制天然安全，
    不需要另外的「排除 REOPEN」邏輯，RELEASED 之後的缺口應該改用 §13.7＋§13.5 解決，而非本項這種以
    movementType＋時間窗口為準的做法——但本項是在 BA 這份分析成形前、依使用者當面回報的即時 bug
    （「才 REOPEN 下一秒就被 AUTO CLOSE 掉了」）實測修復並驗證有效的，**先保留做為過渡期防護**，待
    §13.7/§13.5 真正落地後再評估是要整個換掉、或當作額外一層防禦保留（兩者不互斥，屆時再決定）。

  - [ ] **Sweep 分輪保護 — EXPIRE→同輪 AUTO CLOSE 這一段，BA 已拍板改用「Auto Close Grace Period」機制
    （§13.5，尚未實作）** — 原始 §8.5 落差（「一筆從未動用過的乾淨 LC，AUTO EXPIRY 剛轉 EXPIRED，同一輪
    AUTO CLOSE 立刻關閉」）不再用「跳過本輪」這種簡化做法解決，BA 正式決定改採可設定的 **N 個銀行營業日**
    寬限期（`Business Date > Expiry Date + N 個營業日` 才允許 AUTO CLOSE，明確是**營業日**、不是日曆日——
    跟既有 `mail_float_grace_days`／`isPastExpiryGrace()` 的日曆日邏輯是兩個獨立機制，不要混用或合併）。
    營業日運算規劃委由一個獨立的「Standing」微服務負責（本 repo 目前不存在，`lc-balance-new/` 的
    `standing-mock` 可作為請求/回應形狀的**參考**，但目前連它都還沒有 `/business-days/add` 這個新功能
    實際需要的端點——不是現成可接的目標）；BA 建議分兩階段：Phase 1 先在 Balance Component 內自建一個
    最簡單的「只排除週末」mock，Phase 2 才真正對接 Standing 微服務。**尚未動工。**

  - [ ] **`reactivate()` 的 `effective_to` 重啟後未正確回填（§13.7，新發現，尚未修復）** —
    `balanceContractStore.ts` 的 `reactivate(balanceContractId, newStatus, newExpiryDate?)`，當 REOPEN
    把合約恢復到 `EXPIRED`（§9.2 情境2）時，目前把 `effective_to` 直接設回 `NULL`；BA 認為應該改成寫入
    這次 REOPEN 自己的 Release 時間戳，因為上面 §13.5 規劃中的 Auto Close Grace Period 機制需要
    `effective_to` 當作「這筆合約最近一次變成 EXPIRED 的時間點」這個計算基準——`NULL` 在那個機制下語意
    不對。**目前程式碼還沒有任何地方真的讀 `effective_to` 做資格判斷**，所以這個欄位錯誤現階段沒有實際
    行為影響（要等 §13.5 的 Grace Period 機制真的做出來才會被用到），但屬於已明確定案、待補的既知缺口，
    不應與 §13.5 一起無限期擱置——需要 `reactivate()` 多接受一個「新的 `effective_to`」參數。

  - [ ] **Expiry Extension Amendment／A11-B7 Reopen 的 consent 把關（§13.1 第2項，已拍板，尚未實作）** —
    BA 確認 Balance Component **不自行判斷** consent 是否已取得（不是自己去核實受益人/相關方同意），但
    請求本身必須能承接並驗證上游（Channel API/前置系統）傳入的新欄位：`amendmentApproved`（布林）、
    `amendmentEffective`（生效時間）、`consentStatus`（`NOT_REQUIRED`／`OBTAINED` 列舉）——目前
    `AMEND_EXPIRY_DATE` 請求形狀完全沒有這三個欄位，需要新增到 OAS＋zod schema＋domain 驗證。仍串既有
    F4（生產級身份驗證/授權，見上方 BAL-001）缺口一併處理，因為這些欄位的可信度最終仍取決於呼叫端是否
    真的是被授權的上游系統。

  - [ ] **A11/B7 Reopen 本身的把關（§13.1 第3項，已拍板，部分不在本組件範圍）** — 拆成四個子決策：
    (a) 強制要求 `reasonCode`——**可行，尚未實作**（目前 A11/B7 沒有這項要求）；(b) Maker≠Checker——
    **已存在**，走既有 `assertMakerCheckerSeparation()`，不需另外處理；(c) 特殊角色/權限管控——BA 明確
    決定屬於上游 Channel API／IAM 的職責，**不在 Balance Component 內建**（§13.5 子決策B 同時指出這個
    前提目前並不成立：`app.ts` 完全沒有呼叫端身份驗證 middleware，只有 `helmet()`＋rate-limiting——跟
    既有 BAL-001/F4 是同一個根因缺口，不是新問題，只是這裡再次被點名為「B 方案能不能真的成立」的前提
    條件）；(d) 信用覆核——跨系統前置條件，本組件無法實作，非本組件範疇；(e)「法律義務已終止時應該開新
    LC 而非 Reopen」——屬程序/教育訓練層面，不是系統需求，不需要程式碼變動。

  - [ ] **CLOSE（含既有 A10/B6）強制要求 `reasonCode`（§13.1 第4項，已拍板，尚未實作）** — 目前維持選填；
    BA 正式決定改為：A10/B6 及任何人工 CLOSE 呼叫端必須提供 `reasonCode`，AUTO CLOSE 批次自動代入固定值
    `NATURAL_EXPIRY_ALL_BALANCES_CLEARED`。REOPEN 自己的資格判斷已能容忍「原 CLOSE 的 `reasonCode`
    為空」（既有舊資料，視為原因不明，不阻擋）——這點在 CLOSE 改成必填後仍要保留向下相容。

  - [ ] **Inquire Events／Look Up 未收合同一 `businessEventId` 底下多筆 `REVERSAL` 列（§12.2，BA code
    review 發現，多數已隨 REOPEN 重新設計而失效）** — 原始發現是針對「REOPEN 舊設計（金額固定0＋Release
    時另外產生連動 REVERSAL）」寫的；REOPEN 已於 2026-08-25 UAT 後重新設計為 Submit 當下直接帶入真實金額、
    不再產生 REVERSAL，該情境已不存在。**唯一可能仍相關的殘留**：Expiry Extension Amendment
    （`AMEND_EXPIRY_DATE`）本身仍會在 Release 時對其中一筆 `REVERSAL` 動作，但每個 `businessEventId`
    下永遠只有這一筆，不構成「多筆需要收合」的情境——實務上很可能整項已經是 moot，暫不列入實作範圍，
    僅記錄避免遺漏，未來若真的出現多筆 REVERSAL 的案例再重新評估。

---

## 4. A9（SG Redemption）鎖定的已揭露 trade-off / 明確排除範圍

區塊1新引入的功能，非疏漏但**尚未收尾**，記錄於此供未來評估：

- [x] ~~A9 Full-Redeem-only 只在 Angular UI 層鎖定~~ — **已修復（2026-08-24）**。
  `buildMovementTypeRegistry()`（Maker/Submit）跟 `release()`（Checker/Release，防禦性複查）現在都會
  擋下「standalone（無 `businessEventId`）的 SHGT `PARTIAL_REDEEM`」，回 409。判斷依據是
  `businessEventId` 是否存在（A3S 配對贖回一定會帶，且其 MIN(Bill, SG Outstanding) 配對本來就可能剛好
  等於全額，不能只看 movementType 字串），不是 movementType 本身——A3S 自己的配對贖回、standalone
  `FULL_REDEEM` 都不受影響。OAS 已 bump 到 v1.18.0。新增 5 個測試（Maker 拒絕/接受、Checker 複查），
  三套測試全綠（微服務 442/442、Angular 1067/1067、backend 34/34）。

- [x] ~~`Balance-Component-Business-Rule-Decisions-2026-08-21.md` 的 action item 2（後端
  `businessEventId` 強制檢查）~~ — **已完成（2026-08-24）**，就是上面那項 A9 Full-Redeem-only
  伺服器端修復本身；先前記錄「本次範圍不做」是指更早一次 pass，這次 user 明確要求後已補上。

- [x] ~~`Balance-Component-Business-Rule-Decisions-2026-08-21.md` 的 action item 3
  （`BUYERS_USANCE` 的拒絕/正規化）~~ — **2026-08-25 業務端確認不需要處理，關閉**：實務上出口／保兌
  不存在 Buyer's Usance 案例，這個防護對應的是一個不會發生的輸入。詳見上方第2節 F2 條目的完整說明。

- [ ] **`Balance-Component-Business-Rule-Decisions-2026-08-21.md` 的 action item 5**
  （Mapping workbook Rule #1 補充「Matched Amount ≠ Redeemed Amount」與 A3S 例外的措辭）——
  純文件性質，屬於 BA 待辦（`analysis/TF_Balance_Component_Mapping-en.xlsx`／`-zh.xlsx`），不是程式碼
  改動，不在這個 repo 的動手範圍內；記錄於此避免被遺忘。詳見該決策文件本身的說明與舉例。

---

## 5. DB 優化 — 規劃與 PostgreSQL 遷移一併處理

- [ ] **`movement_actions`/`movement_snapshots` 正規化**
  `balance_movements` 表目前已 47 欄，`xxx_by`/`xxx_at`（released/acknowledged/maker_submitted/
  present_docs_consumed/cancelled）與 7 個 JSON snapshot 欄位持續用 `ALTER TABLE` 加欄位吸收新需求，
  是典型「該正規化成歷史/事件表卻攤平成稀疏欄位」訊號。建議屆時拆成：
  - `movement_actions(movement_id, action_type, actor, occurred_at)`
  - `movement_snapshots(movement_id, snapshot_type, payload_json)`

  現有 snapshot-on-write 設計本身是刻意取捨（換取讀取時不必重算），不是設計錯誤——只是值得跟
  SQLite→PostgreSQL 遷移一起做，屆時反正要重新設計表結構，一次到位成本較低。（與上方 BAL-102 為同一次
  遷移工程的一部分。）

---

## 6. 刻意不做（記錄理由，非疏漏，暫不排入待辦）

以下兩項經過評估後**明確決定不做**，列在此處僅供未來重新評估時參考，不需主動排期：

- **LIKE 前導萬用字元查詢改前綴比對 / FTS5** — `listCatalog()` 的 `lc_number LIKE '%q%'` 用不到索引，
  但改成前綴比對會拿掉使用者「查中間/尾碼字串也能搜到」的能力，是使用者搜尋行為的限縮，不能單方面決定；
  未來若真的變成效能痛點，應優先導入 FTS5（保留子字串搜尋），而非改前綴比對。
- **OFFSET 分頁改 keyset/cursor 分頁** — 現有資料量不需要，且會動到 API 介面。

---

## 7. 其他已知小殘留（不影響測試門檻）

- [x] ~~`maker-panel.component.scss` 超出 Angular `anyComponentStyle` 的 8kB 警告門檻~~ —
  **已修復（2026-08-24）**。根因：2026-08-21 從 `transaction-builder.component.scss` 整份複製
  過來時，複製了全部規則而非只複製這個元件真正用到的子集，導致約一半（997 行中的 473 行）是
  死碼——`.tb-page`/`.tb-workspace`/`.tb-function-chip*`（頁面外殼/功能選擇 chips）、
  `.tb-tabs`/`.tb-table--lookup-timeline`/`.tb-status-badge*`（Look Up 分頁跟 Event Timeline
  表格，屬於其他元件）等，逐一 grep 驗證零使用後刪除（同一套之前清 `.tb-quick-pick*`/
  `.tb-result*`/`.tb-row-sub` 死碼用的技法），檔案從 997 行降到 511 行。`ng build --configuration
  production` 確認警告完全消失，Angular 1067/1067 測試全綠。

---

## 備註

- 除以上項目外，`transaction-builder.component.ts`「God Component」(BAL-003) 已於 2026-08-21 正式收尾，
  `Quality-report-balance.md` 記錄「首次沒有任何重量級 Maintainability open finding」。
- 本清單中最關鍵的仍是第 1 節的三個 Gate Conditions（BAL-001/BAL-002/BAL-102），全部需要使用者/業務端
  再次確認才會啟動實際工程，動手前請先與使用者對齊排期與範圍。
- 若之後有新的重審 pass 更新了 `Quality-report-balance.md`/`CLAUDE.md`，應同步回來更新本清單，
  避免與來源文件的「單一事實來源」狀態脫節。
- **2026-08-24 發現並修復**：還原後 OAS 全面稽核發現 `currency` 欄位存在一致性驗證缺口——既有合約/父合約
  已存的幣別跟呼叫端傳入的新交易幣別完全沒有比對，錯的值會被原封不動存進交易紀錄。已補上
  `CurrencyMismatchError`（409 `CURRENCY_MISMATCH`），範圍刻意比原本被還原掉的 `ca8472e` 窄——`currency`
  仍維持必填（不像 `ca8472e` 把它改成可省略由伺服器推導），只補了缺少的一致性檢查。OAS 對應章節已從
  「CURRENCY DERIVATION」改寫為「CURRENCY CONSISTENCY」以準確反映目前實作，`CLAUDE.md` 決策日誌已記錄完整
  細節。三套測試全綠（微服務 429/429，含 4 個新測試）。
- **2026-08-25 新增，同日修訂**：`TF-Balance-Component-BA-Review-zh.docx`（外部 BA 專家評審）原始版本的 4
  項高嚴重度發現已收錄；同一天內 BA 又自行修訂該文件，**撤回原編號 F2**（承兌/DPU 表內列示 vs. 影子備查
  科目矛盾）並確認並非缺陷，發現總數由 16 項降為 15 項（高4→高3）。目前第2節收錄修訂後的 F1（到期/
  UCP 600 第16(f)條自動釋放，目前完全沒有對應程式碼）與 F2（原編號 F3，出口買方遠期，與既有第4節
  action item 3 為同一件事）。原 F4（缺乏生產級身份驗證/授權，修訂後編號 F3）與第1節 BAL-001 為同一件
  事，已直接併入 BAL-001 的說明中，未另立條目。撤回的原 F2 完整核查過程（含中途一度誤判的 EBL/IBL 假設、
  最終 BA 引用的三份知識庫文檔）記錄於第2節該條目本身與 `CLAUDE.md` 決策日誌，供之後避免重複誤會。
- **2026-08-25 再次修訂**：BA 針對第2節 F2（出口買方遠期）的定性提出更正——原始敘述誤將其描述為
  「業務方尚未關閉的行動項」，經核對 `analysis/Balance-Component-Business-Rule-Decisions-2026-08-21.md`
  「決策2」確認業務決策本身早已定案（Buyer's Usance 對出口／保兌行而言不構成延期付款曝險，須與 Sight
  做完全相同處理，B4 必須路由至 `HONOUR`），目前只剩程式碼落實（該備忘錄行動項3）尚未完成——已更正為
  「決策已定案、純屬工程待辦」的定性，嚴重程度維持 High 不變。`TF-Balance-Component-BA-Review.docx`／
  `-zh.docx` 與本清單第2節、第4節該條目已同步更新。
