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

- [x] ~~**F1 proposal §14.4（BA 第二輪 code review，2026-08-25 發現）— Checker 核准畫面看不到 Account
  Entries，跟 REOPEN 重新設計的初衷矛盾**~~ — **2026-08-25 已修復**（`analysis/Balance-Component-F1-Expire-Proposal-zh.md`
  §十四）。BA 核對整個 REOPEN 重新設計（上方那項，出發點正是「Checker要看交易出的帳 再決定 APPROVE或
  REJECT」）後發現：Maker 送出結果面板、Inquire Events 都有「Account Entries」按鈕可查看分錄，唯獨
  Checker 真正要核准的畫面（`checker-panel.component.ts`／父層 `transaction-builder.component.html` 的
  Release/Reject 動作區塊）完全沒有——後端算得對、存得對，Checker 事實上仍是「先核准、才看得到帳」。
  已在父層 `tb-checker-actions` 區塊（Release/Reject 按鈕旁）加上同等的「Account Entries」按鈕，接上
  既有共用的 `AccountEntriesDialogComponent`（呼叫父層既有的 `openAccountEntryDialog()`，跟這個元件自己
  的類別註解說「動作層留在父層」的既有架構一致，不需要在 `CheckerPanelComponent` 上新增 `@Output()`），
  可見性判斷比照 Maker 的既有寫法（`selectedCheckerMovement?.contingentAccountEntry` 有值才顯示）。
  `ng build --configuration production` 確認模板編譯乾淨，Angular 1133/1133 測試全綠（此為純模板改動，
  無 `.ts` 覆蓋率變化）。BA §14.1-14.3（REOPEN 重新設計本身、§9.7 沖銷鏈、AUTO EXPIRY/AUTO CLOSE 排除
  REOPEN 用的 `isRecentlyReopened()`、reasonCode 字面值）核對全部通過，無需修改；§13.7（`effective_to`）
  BA 確認已於同日稍早修復（見上方 §13 條目），不受本項影響。

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

- [ ] **BAL-143**（🔵 Minor，既有缺陷，非本次排序需求引入，不擋上線）— REJECTED 交易被 EC/Cancel 後，
  Reject 當下的 `released_at`/`released_by` 稽核時間被靜默覆寫成 Cancel 的值，Inquire Events 只看得到
  最後一次 EC，Reject 這個稽核事實消失
  完整查證過程、程式碼引用、建議修法方向已記錄於
  `analysis/Balance-Component-InquireEvents-EventSeq-Effective-Order-Proposal-zh.md` §8（BA Code
  Review，複查第9節排序實作時發現）；本條目為該節的摘要版，方便在 TODO 清單裡直接追蹤。
  使用者於本次 Inquire Events 排序需求（見第9節）驗證期間查證發現：`domain/statusTransition.ts`
  的 `LEGAL_TRANSITIONS`（第28行）允許 `REJECTED: { CANCEL: 'CANCELLED', EDIT: 'SUPERSEDED' }`——
  一筆已 Reject 的交易確實可以再被 Cancel（EC），並非終態。但 `store/balanceMovementStore.ts` 的
  `updateStatus()`（第450-466行）對 `released_by`/`released_at` 是直接覆寫（`SET released_by =
  @releasedBy, released_at = @releasedAt`），不像同一條 SQL 裡的 `reason_code` 那樣用
  `COALESCE(@reasonCode, reason_code)` 保留舊值；而 `reject()`（`balanceService.ts:2171`）本身就是把
  Checker 的 Reject 時間寫進這兩個共用欄位（`released_by`/`released_at` 兼作「Release 或 Reject 的
  第二方操作時間」，同一個「第二方操作時間」慣例，跟這次排序需求用的 `effectiveEventTime()` 概念
  一致），而 `cancel()`（`balanceService.ts:2195`）呼叫 `updateStatus()` 時完全沒傳
  `releasedBy`/`releasedAt` 這兩個 key，於是它們在 SQL 參數繫結時 `?? null`（第470-471行），直接把
  Reject 當下寫入的值覆寫成 `null`，只留下新的 `cancelled_by`/`cancelled_at`。
  `updateStatus()` 自己的 doc comment（第442-446行）宣稱「a movement is only ever transitioned once —
  status is terminal — so a plain write here, not a COALESCE, is safe」——這個假設對 PENDING→RELEASED／
  PENDING→REJECTED 成立，但對 REJECTED→CANCELLED 這條既有合法路徑不成立，是文件記載的設計理由本身有
  遺漏，不是單純的程式碼疏漏。
  **影響範圍**：僅限「先 Reject、後又被 EC/Cancel」這個複合情境（`REJECTED` 狀態下再 `CANCEL`）；純
  Release 或純 Reject（未再被 Cancel）不受影響，`reason_code`／`cancelled_by`／`cancelled_at` 等其他
  稽核欄位不受影響。**不擋這次 Inquire Events 排序上線**——本次改動（第9節）是純顯示層，且
  `effectiveEventTime()` 的 fallback 順序（`releasedAt ?? cancelledAt ?? createdAt`）在這個複合情境下
  仍會退回使用 `cancelledAt`，時間本身不會顯示錯誤或報錯，只是「Reject 這一段稽核歷史消失、只看得到
  最後一次 EC」這件事本身是既有缺陷，屬於資料完整性/稽核軌跡問題，不是這次排序邏輯造成的行為異常。
  **建議修法方向**：`updateStatus()` 的 `released_by`/`released_at` 仿照 `reason_code` 改成
  `COALESCE(@releasedBy, released_by)`/`COALESCE(@releasedAt, released_at)`，讓 `cancel()`（本來就不傳
  這兩個 key）保留 Reject 當下寫入的舊值；同時需要重新檢查其他所有呼叫 `updateStatus()` 的地方
  （`release()`/`reject()`）是否都預期在自己呼叫時「一定要能覆寫」這兩欄——目前只有 `reject()`
  會寫入非 null 值，`release()` 呼叫時機是否也有可能發生在已有舊值的列上需要一併確認，避免改成
  COALESCE 後反而讓 `release()` 自己的合法覆寫需求被誤擋。
  **建議測試補強點**：微服務新增一個「Reject 後再 Cancel」的整合測試，斷言 Cancel 後
  `released_at`/`released_by` 仍是 Reject 當下寫入的值（不是 null），`cancelled_at`/`cancelled_by`
  才是新值；`inquire-events.service.spec.ts` 補一個對應案例，確認這個複合情境下 Inquire Events 顯示的
  時間與 `reasonCode` 都完整反映兩段歷史，而不是只剩最後一次 EC。

- [x] ~~**BAL-129**（🔵 Minor，Test Gap）— BAL-117 修的「泛用 500 handler 不外洩內部錯誤訊息」本身沒有測試覆蓋~~
  — **2026-08-25 已修復**。`test/unit/app.test.ts` 新增一則測試：`jest.spyOn` 讓 `service.resolveContract()`
  拋出一個帶有特徵字串的普通 `Error`（不是 `ApiError` 子類別，故意走 `app.ts` 錯誤 middleware 的
  fallback 分支），驗證 (1) response body 固定是 `{code:'INTERNAL_ERROR', message:'An internal error
  occurred.'}`、(2) response body 完全不含那個特徵字串、(3) `console.error` 確實有收到真正的錯誤內容
  （server 端仍看得到細節，只是不回給呼叫端）。`app.ts` 覆蓋率從 91.3%/66.66% 補到 100%/100%
  （statements/branches），微服務三套測試全綠（547/547）。

- [ ] **BAL-120**（⚪ Info，已確認延後）— 冪等性衝突偵測仍靠字串比對 SQLite driver 的錯誤文字
  卡在 `node:sqlite`（Node 內建 `DatabaseSync`）目前沒有穩定的 constraint-violation 錯誤碼可用，
  非擱置不做，而是等上游能力補齊。

- [x] ~~**`ContractVersionConflictError`（⚪ Info，單向落差，2026-08-24 稽核發現）** — `errors.ts` 定義了這個
  409 `CONTRACT_VERSION_CONFLICT` 錯誤類別，但整個 `src/` 沒有任何地方真的拋出它（死碼）~~ —
  **2026-08-25 已刪除，確認為真死碼**。核查後發現：`contractVersion` 全 `src/` 只有一處賦值
  （`balanceService.ts` 的 `createContract()`），且永遠寫死 `1`；`markSuperseded()`／
  `supersedesBalanceContractId`／`supersededByBalanceContractId`／`listVersions()` 這整組「新版本」
  基礎設施從未被任何呼叫端使用——這個錯誤類別要真正觸發，唯一路徑是同一個 `logicalContractId`（每次新建
  合約都是新產生的 UUID）撞出重複的 `(logicalContractId, contractVersion)`，等同 UUID 碰撞，不是有意義的
  業務情境。跟同樣「未使用」的 `ContractStatus.SUPERSEDED`／`markSuperseded()` **不同**——那組在 OAS 裡有
  明確文件記錄為「刻意保留給未來 edit-in-place 流程，目前版本不可達」；`CONTRACT_VERSION_CONFLICT`
  在 OAS 的 `Error.code` enum 裡完全沒被列過，沒有類似的「刻意保留」文件佐證，判定為單純的死碼（可能是
  從 `lc-payment-wc` 的 `errors.ts` 範本複製過來時一併帶進來、從未真正接上）。已從 `errors.ts` 移除該
  類別，`errorsAndMoney.test.ts` 對應的 test.each 一列與 import 一併移除；`SUPERSEDED`／
  `markSuperseded()` 那組維持原狀不動（OAS 文件記錄的保留基礎設施，跟這次死碼清理是兩件事）。微服務
  三套測試全綠（546/546，`errors.ts` 仍 100%/100%/100%/100%）。

- [x] ~~**F1 §11.4（原三項「維持待決」，2026-08-25 由 BA 透過
  `analysis/Balance-Component-F1-Expire-Proposal-zh.md` §13〈§11.4 四項待決事項正式拍板〉正式拍板）**~~
  — **2026-08-25 全部完成**。四項拍板決議（Grace Period Phase 1、`effective_to` 修復、CLOSE/REOPEN
  強制 `reasonCode`、consent 欄位透傳）逐項落地，加上同日 BA 兩輪 code review（§14、§16）額外發現並
  關閉的 Checker Account Entries 缺口、§12.2 REVERSAL 收合、A11/B7 角色/權限 (c)(d)(e) 三項，
  **此區塊已無剩餘工程待辦**，以下保留各子項的完整實作/關閉紀錄：

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

  - [x] ~~**Sweep 分輪保護 — EXPIRE→同輪 AUTO CLOSE 這一段，BA 已拍板改用「Auto Close Grace Period」機制
    （§13.5）**~~ — **Phase 1 已於 2026-08-25 完成**（`analysis/balance-component-api.yaml` v1.24.0）。
    新增 `domain/autoCloseGracePeriod.ts`（`addBusinessDays()` 同倉庫內建「只排除週末」mock、
    `isPastAutoCloseGrace()`），`runAutoCloseSweep()` 現在同時要求
    `Business Date > effectiveTo + N 個營業日`（新 config 常數 `AUTO_CLOSE_GRACE_PERIOD_BUSINESS_DAYS = 2`），
    與既有 `isRecentlyReopened()` 並存（不是取代——見下方 §13.8 調和說明）。原始 §8.5 落差（一般 EXPIRE→
    同輪 AUTO CLOSE，非 REOPEN 情境）現已一併關閉，`runExpirySweepCycle` 的測試已改為驗證「同輪
    `close: []`，晚一輪才會真的 CLOSE」。**Phase 2（真接 Standing 微服務）仍未做**，目前 Phase 1 mock
    是這個 repo（`lc-balance/`）唯一實作,本身沒有任何 Standing client 接線；只服務 **AUTO CLOSE**
    自己的 Grace Period,跟 AUTO EXPIRY 無關（AUTO EXPIRY 自己的寬限期是 `mail_float_grace_days`,日曆
    天,不需要營業日行事曆）。

    **2026-08-25／26 反覆核對後定案的需求範圍（`analysis/standing-microservice-reference/`）**：一度
    複製了 `lc-balance-new/`（獨立平行專案）的 Maturity Date OAS 設計文件（947 行,19 輪審閱）＋8 國
    行事曆測試資料,後來使用者親自指出**真正的需求簡單很多**：這只是一個背景批次作業,問的問題只是
    「這張已 EXPIRED 的 LC,照銀行自己的單一行事曆算,是否已過 N 個營業日」——沒有交易對手、沒有多方
    付款路徑、不需要歷史版本重算,跟 Maturity Date 那種多方結算情境（calendar role、combination rule、
    calendar snapshot 版本控管）完全不是一回事。**已依此重新簡化**：複製來的兩份 Maturity Date 文件
    已刪除,改成自己撰寫的 `Auto-Close-Grace-Period-Business-Day-Requirement.md`（只描述這個單一行事曆、
    單一批次的實際需求，以及 Phase 1 現有的 `addBusinessDays()`/`isPastAutoCloseGrace()` 形狀跟 Phase 2
    真正要補的東西——換掉週末限定的邏輯本體,換成真正的假日清單，函式簽名不需要變）；
    `calendars.json` 也從 8 國行事曆裁剪到只剩 `TW`（本國）一份,因為 AUTO CLOSE 沒有交易對手的概念。

    **2026-08-26 新增可執行的 mock server**（使用者要求）：`microservices/business-days-mock/`
    （自己的 `package.json`／`server.js`／`data/calendar.json`／`README.md`）——只有
    `POST /business-days/add` 這一個端點,單一 `TW` 行事曆,port `4500`。**不是**複製
    `lc-balance-new/microservices/standing-mock`（那個做的是 `/adjust`,服務 Maturity Date 那個不同
    功能）,是重新寫的,形狀完全對應這裡簡化後的需求。已即時 smoke test 過（跨週末、真實 TW 假日、
    `businessDays: 0`、400 驗證錯誤都驗證正確）。**尚未接進 `microservices/balance-component/` 本身**
    ——Phase 1 的同倉庫週末限定 mock 仍在跑,這個 mock server 目前只是 Phase 2 的參考/開發用素材,還沒
    真正串接。

    **2026-08-26 行事曆測試資料擴充為 3 年（使用者要求,`calendars.json`／`data/calendar.json` 兩份都
    同步）**：原本只有 2026 一年,擴充到 2026-2028。2026 的日期先逐一核對過真實星期幾/農曆換算（春節
    2026-02-17、端午 2026-06-19、中秋 2026-09-25 均對照確認無誤）；2027／2028 用同樣的月/日重複 2026
    的型態（並非真正的農曆換算,僅供跨年度測試涵蓋範圍用,已在資料檔自己的 `_disclaimer` 裡註明），
    遇到週六/週日時順延到下一個平日——**除了**元旦、和平紀念日／228（使用者更正為 02-28,不是 02-27
    補假日那筆）、勞動節、國慶日（使用者更正為 10-10,不是 10-09 補假日那筆）這四個固定日期的國定
    假日,永遠維持在同一天不順延。已用即時 mock server smoke test 驗證跨年度（2026→2027 元旦）與
    順延（2027 端午節 06-19 是週六,正確順延到 06-21 週一）兩種情境都正確。

    **2026-08-26 BA 獨立複驗通過**：程式邏輯逐行手算追蹤過（README 範例 2026-01-08+2 營業日的每一步
    都對得上）；16 筆「應該順延」的 2027/2028 日期用獨立程式重新驗算,全部跟 `calendar.json` 實際內容
    一致；4 個固定假日（元旦/228/勞動節/國慶日）在 2026-2028 三年裡凡是落在週六日的都確認沒有被誤
    順延；`addBusinessDays(date, 0)` 跟 Phase 1 既有的 `domain/autoCloseGracePeriod.ts` 同名函式行為
    一致（直接回傳原日期），未來真要接 Phase 2 時函式簽名確實不需要改。

    - [x] ~~**小缺口，非阻擋（BA 複驗發現，2026-08-26）** — `business-days-mock` 沒有行事曆資料範圍
      檢查／fail-closed 機制~~ — **2026-08-26 已修復**。新增 `CALENDAR_MIN_DATE`/`CALENDAR_MAX_DATE`
      （從 `data/calendar.json` 自己的假日年份動態算出，不是寫死常數，未來擴充行事曆資料範圍會自動
      跟著變寬）：查詢的 `date` 本身、或是為了湊滿 `businessDays` 而必須往前走到的日期，只要超出涵蓋
      範圍（目前 2026-01-01 至 2028-12-31），一律回傳 `422 CALENDAR_RANGE_EXCEEDED`，不再安靜地把
      範圍外的年份當成「沒有假日資料、只看週末」處理。同時新增這個 mock 自己的第一份 Jest 測試套件
      （`test/server.test.js`，15 個測試，涵蓋原本的週末/假日/跨年度/固定假日不順延行為＋這次新增的
      fail-closed 邊界情況——範圍外日期、範圍內但走勢會超出範圍、邊界剛好卡在範圍內兩種情境都測過），
      全數通過。

    Phase 2 本身仍未動工,等 BA 審閱這份簡化後的參考資料＋mock server 後再決定要走哪個選項。

    - [x] ~~**Phase 2 設計強化 — 統一 `isBusinessDay()` 判斷 + Special Working Day Override（2026-08-26，
      BA 補充需求，記錄於 `analysis/standing-microservice-reference/Auto-Close-Grace-Period-Business-Day-
      Requirement.md`「Phase 2 設計強化」一節）**~~ — **2026-08-26 BA 最終決定：登記移交 Standing
      微服務團隊，Balance Component 不修改**（決策討論過程曾整理於一份決策比較文件，決定拍板後已刪除，
      見本條目末段說明）。起因是上一輪 BA 複查
      發現 `domain/domesticCalendar.ts`（A1/B1 Expiry Date 檢查）跟 `microservices/business-days-mock/
      server.js`（AUTO CLOSE 參考 mock）查詢順序不一致（前者先查假日、後者先查週末，已於 2026-08-26
      統一成「先查週末」，見本檔 `CLAUDE.md` 決策日誌對應條目）；使用者複核後指出這個「先查誰」本身
      問錯方向——真正該補的是「補班日／特殊營業日 Override」機制。BA 先補了完整設計期望（優先順序
      Override→Holiday→Weekend、逐日期 Override 標記、週末規則可配置、多作業可能要問不同行事曆、
      長期統一走 `calendarService.isBusinessDay(date, calendarIds)`），工程team接著整理出方案 A／B／C
      三個比較（各自補 Override／升格既有 `business-days-mock` 走 HTTP／抽成 repo 內共用套件），架構
      觀點原本傾向方案 B（先做 AUTO CLOSE 子選項）。

      **最終決定（Business Day Calculation Ownership，2026-08-26）**：
      ```text
      Decision: Deferred to Standing Service Team
      Balance Component Change: None
      ```
      Business Day／Weekend／Holiday／Working Day Override／Grace Period／`closeEligibleDate` 的計算
      統一交由 Standing 微服務（或其外部批次）負責；`balance-component` 本階段**不新增或修改任何
      Calendar 相關邏輯**（不建 Calendar Service、不建假日表、不做 `isBusinessDay()` 共用邏輯）——
      方案 A/B/C 均不在 `balance-component` 這邊執行，登記後直接移交。Standing 篩選出符合 AUTO CLOSE
      條件的 LC 後，應逐筆呼叫**既有**的 A10／B6 Maker API 與 Checker／Release API（BA 已查證這兩個
      Function Code/端點是本系統既有、已有完整 Maker/Checker/4-Eyes 邏輯與測試覆蓋的 API，不需要
      `balance-component` 為此另開新介面）；`balance-component` 繼續負責 Close Eligibility 最終檢查、
      Maker／Checker 分離、4-Eyes、Idempotency、Audit Trail，但不負責計算營業日/Grace Period/維護
      Calendar 資料。Angular／WC 的 Expiry Date 即時檢查，未來也應改調用 Standing 提供的 Calendar
      API，不在 Angular 或 `balance-component` 內維護另一份 Calendar 規則。

      **留給 Standing 團隊未來真正串接時才需要處理的實作細節（不影響本次決定，先記錄）**：
      - `runAutoCloseSweep()` 目前是 `balance-component` 服務**內部**直接呼叫
        `createMovement()`/`release()`（操作人身份是 `config.ts` 兩個寫死常數
        `BATCH_MAKER_ACTOR`/`BATCH_CHECKER_ACTOR`），不是透過對外 A10/B6 HTTP API 被呼叫進來——日後
        改成「Standing 從外部逐筆呼叫 A10/B6 API」時，這條內部 sweep 路徑要嘛被取代、要嘛跟外部呼叫
        並存，操作人身份是否要換成 Standing 自己的服務身份，屆時才需要拍板。
      - 目前 `BATCH_MAKER_ACTOR`/`BATCH_CHECKER_ACTOR` 是同一個自動化流程接續呼叫的兩個字串常數，
        滿足 `assertMakerCheckerSeparation()` 字面檢查，但不是兩個各自由 IAM 授權的真 4-Eyes 身份——
        跟 BAL-001（零身份驗證）同一個更大的既有 Gate Condition，不因這次決定而變成新的阻擋項，一併
        掛在第1節追蹤。
      - `processSweepCandidate()` 目前 Maker 成功、Checker 失敗時**不會**重複建立第二筆 Maker（該筆
        合約會因已有 PENDING 的 CLOSE/EXPIRE movement 被下一輪 `hasOpenEvents` 排除），但也**沒有**
        機制回頭單獨重試那筆卡住的 Checker/Release，等於一旦發生就永久卡住待人工介入——本輪查證挖出
        的真實缺口，暫不列為阻擋項（單一 process 記憶體內操作，`release()` 失敗率預期很低），先記錄。

      決策準備過程中曾整理方案 A/B/C 原始比較、以及對外部 19 節 Review Comments 的逐點採納/不採納分析
      （Fail-Closed 原則、`closeEligibleDate` 批次預算效能建議、Override schema 應結構化等技術判斷經
      查證屬實）於 `analysis/standing-microservice-reference/Phase2-CalendarService-Options-for-BA-
      Decision-zh.md`；該檔案本身已於決定拍板後刪除——決定內容與查證要點已完整收錄於本條目，不代表
      `balance-component` 這邊還有待辦，未來需要交接給 Standing 微服務團隊時以本條目為準。

  - [x] ~~**`reactivate()` 的 `effective_to` 重啟後未正確回填（§13.7）**~~ — **已於 2026-08-25 修復**。
    `balanceContractStore.ts` 的 `reactivate()` 新增必填的 `releasedAt` 參數；REOPEN 把合約恢復到
    `EXPIRED` 時（§9.2 情境2）現在正確寫入這次 Release 的時間戳，不再是 `NULL`（恢復到 `ACTIVE` 時仍維持
    `NULL`，未變）。這是上面 Auto Close Grace Period 能正確運作的前提，測試已透過
    `GRACE-CLOSE-001`（`expiryExtensionAndReopen.test.ts`）端到端驗證：REOPEN 恢復到 EXPIRED 後，Grace
    Period 期滿才真的被 AUTO CLOSE 處理，證明 `effective_to` 確實被正確當作錨點使用。

  - [x] ~~**CLOSE（含既有 A10/B6）／A11/B7 Reopen 強制要求 `reasonCode`（§13.1 第4項／第3項(a)）**~~ —
    **已於 2026-08-25 實作**。`BalanceService.assertReasonCodeRequired()`：`CLOSE`／`REOPEN` 兩者現在都
    要求呼叫端提供非空 `reasonCode`（Submit 時 400），AUTO CLOSE 批次內部自動帶入固定值
    `NATURAL_EXPIRY_ALL_BALANCES_CLEARED`（不是被排除在檢查之外，而是這個值由批次自己內部供應）。
    Angular 端新增對應的 `reasonCode` 表單欄位（`builder-fields.ts`／`submit-rules.ts`，只在
    A10/B6/A11/B7 顯示＋必填，複用既有的 `requiresCloseEligibility`/`requiresReopenEligibility` 旗標,
    未新增 BuilderModel 維度）。REOPEN 自己的資格判斷仍容忍「原 CLOSE 的 `reasonCode` 為空」（既有舊資料
    向下相容,視為原因不明,不阻擋）——這點在新規則下不變。三層（UI/Maker-Checker/API）測試已同步更新。

  - [x] ~~**Expiry Extension Amendment／A11-B7 Reopen 的 consent 把關——上游欄位部分（§13.1 第2項）**~~ —
    **已於 2026-08-25 實作**。新增三個選填 passthrough 欄位（`amendmentApproved`/`amendmentEffective`/
    `consentStatus`），OAS＋zod schema（`consentStatus` 有真正的列舉驗證,`NOT_REQUIRED`/`OBTAINED`
    以外的值會被拒絕）＋DB 三個新欄位（migration 17,無 CHECK constraint,比照既有 `reason_code`）全部
    到位。**刻意不做 Angular UI 輸入欄位**——BA 原意是「Balance Component 不判斷,只接收＋驗證」,這些欄位
    的語意屬於上游 Channel API 的職責,這個 Angular demo 的 Maker Panel 本身就是在扮演那個上游角色,但跟
    `sourceModule`/`sourceFunction` 等既有純 passthrough 稽核欄位一樣沒有對應輸入框——之後如果需要示範
    用途的輸入欄位,可以再補。**A11/B7 自己的角色/權限把關（§13.1 第3項）五個子項至此全部處理完畢**，見下方。

  - [x] ~~**A11/B7 Reopen 本身的角色/權限把關（§13.1 第3項 (b)-(e)）**~~ — **2026-08-25 正式關閉**
    （`analysis/Balance-Component-F1-Expire-Proposal-zh.md` §十六）。(a) `reasonCode` 已如上完成；
    (b) Maker≠Checker——**已存在**，走既有 `assertMakerCheckerSeparation()`，不需另外處理；
    (c) 特殊角色/權限管控——正式關閉，職責歸屬上游 Channel API／IAM／Entitlement 系統，Balance
    Component 不內建角色欄位或權限檢查，`domain/statusTransition.ts` 自己的 doc comment 本來就記載這是
    刻意的設計邊界。**注意區隔**：這項只關閉「權限管控邏輯該放在哪裡」的架構歸屬問題，**不代表**「上游
    真的已經做好身份驗證」這件事本身已解決——`app.ts` 目前完全沒有呼叫端身份驗證 middleware（只有
    `helmet()`＋rate-limiting），這是 BAL-001／F4 記錄的獨立缺口，維持「已決策延後」狀態，是上線前
    Gate Conditions 之一，**不因本項 (c) 關閉而一併解決或變動**；(d) 信用覆核——正式關閉，跨系統前置
    條件，本組件無法實作，非本組件範疇；(e)「法律義務已終止時應該開新 LC 而非 Reopen」——正式關閉，屬
    程序/教育訓練層面，不是系統需求，不需要程式碼變動。**§13.1 第3項五個子項至此全部處理完畢，無剩餘
    工程待辦**——唯一仍獨立存在、不受本次關閉影響的是 (c) 背後的身份驗證前提（BAL-001/F4），繼續掛在
    第1節 Gate Conditions 清單上。

  - [x] ~~**Inquire Events／Look Up 未收合同一 `businessEventId` 底下多筆 `REVERSAL` 列（§12.2，BA code
    review 發現）**~~ — **2026-08-25 正式關閉**（`analysis/Balance-Component-F1-Expire-Proposal-zh.md`
    §15.6）。BA 重新追查 `AMEND_EXPIRY_DATE`／`REOPEN` 兩條 `release()` 路徑的實際程式碼後更正：不是
    「多數情境已失效」這種機率性判斷，而是**觸發情境已被結構性移除**——
    (1) **REOPEN**：全檔案唯一呼叫 `createAndReleaseReversal()` 的地方（`balanceService.ts` 第1884行）
    完全在 `AMEND_EXPIRY_DATE` 分支內，REOPEN 自己的分支只做 `reactivate()`，不會建立任何額外
    movement——§12.2 原始發現引用的「REOPEN 路徑B、Approve 後產生1筆REOPEN+2筆REVERSAL、顯示3列」
    這個情境，在目前程式碼下已經**不可能發生**，不是測試剛好沒踩到。
    (2) **Extension（`AMEND_EXPIRY_DATE`）**：`createAndReleaseReversal()` 只在「trailing movement 是
    RELEASED 的 EXPIRE」這個條件成立時觸發一次，不是迴圈；EXPIRE 不能自我串接（要求 ACTIVE 狀態，
    release 後立刻清掉）、CLOSE 不可能出現在 EXPIRED 合約之前（CLOSE 只會晚於 EXPIRED）——所以 Extension
    最多是「1筆 AMEND_EXPIRY_DATE ＋1筆 REVERSAL」＝2列，從未達到§12.2 原始發現的「3列以上」情境，也
    不是使用者原始「REOPEN 在 Inquire Events/Lookup 只要一筆」需求鎖定的對象。**結論：不需要前端新增
    收合邏輯。**

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

- [x] ~~**`Balance-Component-Business-Rule-Decisions-2026-08-21.md` 的 action item 5**
  （Mapping workbook Rule #1 補充「Matched Amount ≠ Redeemed Amount」與 A3S 例外的措辭）~~ —
  **2026-08-25 正式關閉**（`analysis/Balance-Component-F1-Expire-Proposal-zh.md` §十七）。純文件性質,
  BA 直接補齊,不是這個 repo 的程式碼改動：README 先前已補齊,這輪 BA 發現 `L1_Event_Catalogue` 分頁
  `SG_RELEASE` 列（`TF_Balance_Component_Mapping-en.xlsx`／`-zh.xlsx` 的 `L1_Event_Catalogue!F31`）
  仍是舊文字,未提及 A3S 例外,已直接程式化（`openpyxl`）追加一句英文說明,兩份 workbook 同步完成,原始
  檔案改動前已備份（`.bak-2026-08-25`）。連同該決策備忘錄其餘五項行動項目（1-4、6，均已分別確認完成）,
  `Balance-Component-Business-Rule-Decisions-2026-08-21.md` 六項行動項目至此**全數處理完畢,無剩餘待辦**。

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

## 8. SonarQube 實際掃描發現（2026-08-26，`lc-balance/SonarQube-scan-report.md`）

Docker 上真實 SonarQube 9.9.8 LTS 掃描（`sonarsource/sonar-scanner-cli:5.0.1`，非人工 code review），對照
`SonarQube-report2.md`（2026-08-20 上次掃描）逐項比較。Bugs/Vulnerabilities/未複核 Security Hotspots 三項
維持 0，Reliability/Security/Maintainability/Security Review 四個 Rating 全維持 A——沒有退步；以下只收錄
這次掃描發現、值得排入待辦的項目，完整數據見報告檔案本身。

- [x] ~~**Quality Gate 現在是 FAILED（ERROR）**——New Duplicated Lines Density 5.15%（門檻 ≤3%）~~ —
  **2026-08-26 已修復並重新掃描驗證，Quality Gate 轉為 PASSED（OK）**。採用方案 (b)：
  `sonar-project.properties` 新增 `sonar.cpd.exclusions=backend/data/businessCases.js`（附註記引用
  BAL-127），未動任何應用程式邏輯。重新掃描結果：New Duplicated Lines Density 5.15% → **0.96%**；
  專案整體重複率 11.4% → **2.1%**（2,532 → 475 重複行，`businessCases.js` 的 2,057 行不再計入，其餘
  6 個檔案的重複行數完全不變）。

- [x] ~~**`microservices/balance-component/src/service/balanceService.ts:1737`（`release()`）Cognitive
  Complexity 93，全案最高**~~ — **2026-08-26 已拆解**，比照 BAL-141/BAL-142 的手法拆成
  `assertReleaseSubmitGuards()`（欄位/自然鍵/A4 Maker-Submit 閘門，不再上榜）、
  `assertReleaseEligibility()`（CLOSE/EXPIRE/REOPEN/A9 資格複查，降到 29）、
  `applyReleaseSideEffects()`（referencedTransactionId/CLOSE/EXPIRE/REOPEN 副作用，不再上榜）、
  `applyAmendExpiryDateReleaseSideEffect()`（AMEND_EXPIRY_DATE 子狀態機，降到 19）——純程式碼搬移，
  邏輯/訊息/順序逐字保留。**誠實記錄一個真實的取捨**：93/83min 這一筆消失了，但拆出來的 4 個方法有
  2 個仍然超過 15（29、19），所以這個檔案的 S3776 筆數從 4 筆變成 5 筆（+1）——不過總 effort 從 83min
  降到 48min，是淨改善，只是「筆數」這個單一指標没有跟著同步下降。細節與理由（為何不繼續往下拆）見
  `SonarQube-scan-report.md`「Follow-up」一節。三套測試全綠（微服務 585/585，coverage 不變）+ 瀏覽器
  實測 A1 Issue→Release 全程正確。

- [x] ~~**7 個 `Web:AvoidCommentedOutCodeCheck` 誤判，上次掃描就建議標記 False Positive，至今仍未標記**~~
  — **2026-08-26 已透過 SonarQube API（`/api/issues/do_transition`）逐筆標記 `WONTFIX`**，每筆附上
  查證註解。不需要改程式碼，這 7 筆已從後續掃描的 unresolved 清單消失。

- [x] ~~**持續存在、非阻擋的次要維護性項目**：`submit-rules.ts:56`（60）、`builder-fields.ts:24`（63）、
  `maker-panel.component.ts` 4 筆 `S1871`~~ — **2026-08-26 部分處理**：
  - `maker-panel.component.ts` 的 4 筆 `S1871`（重複條件分支）**已修復**——`afterResolved()`/
    `refreshSelectedContractSnapshot()`裡「3-4 個分支、內容完全一樣」的 if/else-if 鏈，各自收斂成一個
    布林 guard，行為逐字保留。瀏覽器實測 A9 SG Redeem 全程正確（Amount 自動帶入 SG Available Balance）。
  - `submit-rules.ts` 的 `validateSubmit()`（60）**已拆解**成 `validateMandatoryFields()`（降到 21）、
    `validateNaturalKeyFields()`（不再上榜）、`validateFunctionSpecificRules()`（降到 26）——跟
    `release()` 那項一樣的取捨：60/50min 這一筆消失，變成兩筆 21+26，但總 effort 50min→27min 是淨改善，
    這個檔案的 S3776 筆數因此從 3 筆變 4 筆（`buildSubmitRequest`/`hasEligibleTargetSelected` 兩個既有
    發現完全沒動，不在這次範圍內）。
  - `builder-fields.ts` 的 `buildFields()`（63）**部分改善**——把 Amount 欄位那段 6 層巢狀三元運算子
    抽成新函式 `amountFieldLabel()`（同時修掉 5 筆 `S3358` 巢狀三元判斷發現），複雜度降到 36，但函式
    本身仍超過 15 門檻（筆數不變，effort 從 53min 降到 26min）。
  - 三套測試全綠（Angular 1171/1171），瀏覽器實測 A1/A8/A9/A10 全程正確，Console 無錯誤。

**2026-08-26 整體結果**（重新掃描驗證，見 `SonarQube-scan-report.md`「Follow-up」一節完整數據）：
Quality Gate FAILED → **PASSED**；Code Smells 59 → **44**；Technical Debt 651min → **445min**
（−206min，−31.6%）；Cognitive Complexity 總和 1,672 → 1,651。誠實揭露：S3776（Cognitive Complexity）
筆數本身從 17 筆微幅增加到 19 筆（+2），因為兩個超大函式各自拆成兩個較小、但仍超過 15 門檻的函式——
細節見上方兩個條目與報告本身，這是揭露過的取捨，不是遺漏。

---

## 9. Inquire Events 事件排序（Event Effective Order）——業務提案，已評估並實作（2026-08-26）

`analysis/Balance-Component-InquireEvents-EventSeq-Effective-Order-Proposal-zh.md`（BA 先查證程式碼、
工程再逐項回覆 5 個評估問題、拍板選項 1 後同日實作完成）。

- [x] ~~**業務建議**：Inquire Events（`inquire-events.service.ts`，與 `LookUpPanelService` 共用同一套
  `toEventRows()`）目前依 `movement.createdAt`（Maker Submit 時間）排序事件，業務認為應改成反映「交易
  正式生效的先後順序」——APPROVED/EARMARKED 依 Checker Release/Approval Time 排序，PENDING/EARMARKING
  暫用 Maker Submit Time 兜底~~ — **已實作**。`toEventRows()` 的 `'primary'` phase（絕大多數事件）
  `eventTime` 改用新函式 `effectiveEventTime(movement) = movement.releasedAt ?? movement.cancelledAt
  ?? movement.createdAt`——只改這一處，`InquireEventsService`/`LookUpPanelService` 兩邊排序與顯示的
  TIME 欄位就同時反映新規則（兩邊本來就共用同一個 `toEventRows()`，不需要各自改 `.sort()`）。A4 既有
  `'create'`/`'finalize'` 兩列拆分維持原樣不動。

- [x] ~~**範圍界定**~~ — **採用選項 1（僅顯示層）**，選項 2（Balance 計算引擎本身的
  `confirmedBalance`/`availableBalance`/`asOfEventSeq`/REOPEN 還原金額）**未動**，`eventSeq`／冪等鍵
  （Design doc §8）完全未變更，符合 BA 原本「選項 2 不建議未經評估就動手」的建議。

- [x] ~~**BA 交予工程部門的 5 個評估問題**~~ — 全數回覆並記錄於文件 §6（範圍界定、冪等鍵不需調整、
  混合鍵邊界情況的具體實作方式、A4 特例不衝突且是既有先例、REJECT 沿用 `releasedAt`）。**額外發現
  一個 BA 文件沒提到的欄位**：Maker 自己 EC/Cancel 是獨立的 `cancelledAt`（不是 `releasedAt`），已
  一併納入 `effectiveEventTime()` 的判斷順序，不需要另外請示業務。

**驗證**（依 `CLAUDE.md` Standing Rule「every code change gets unit tests + a live functional pass」）：
新增 3 筆 `inquire-events.service.spec.ts` 測試（逐字重現業務 EB001/EB002 範例、PENDING 事件仍用
`createdAt`、`cancelledAt` 的獨立分支），Angular 1171→**1174**，三套測試全綠（Angular 1174/1174、
backend 38/38、微服務 585/585，微服務/backend 不受影響）。另外用 `curl` 直接建了一個真實情境（同 LC
下兩筆 SG Issue，一筆先 Submit 後 Approve、另一筆後 Submit 先 Approve），到瀏覽器打開 Inquire Events
親眼確認「後 Approve 的排在前面」——跟修改前的行為完全相反，親眼驗證過，不只是斷言通過。全程 Console
無錯誤。完整過程記錄在文件 §7。

- [ ] **BA Code Review 複查發現的既有缺陷**——見文件 §8：`released_at`/`released_by` 在 REJECTED→
  CANCELLED 這條既有合法路徑上被靜默覆寫成 `null`，Reject 稽核時間消失。不擋本次上線，已另立
  **BAL-143**（見第3節）獨立追蹤。

---

## 10. Fix Pending / Delete Pending 系列（2026-08-27）——現況與待辦，換人接手前必讀

完整過程記錄於 `analysis/Balance-Component-FixPending-DeletePending-Proposal-zh.md`（§1–§11）。**以下
所有項目截至本次記錄時全部尚未 commit**（使用者明確指示「不要COMMIT」，尚未收到「commit and push」
指示前不得執行 git 操作）。

- [x] **Phase 1（REJECTED 開放 Delete Pending）+ Phase 2（Maker Queue 新分頁）**——已實作、已三套件
  全綠、已 live 驗證（文件 §9.1/§9.2）。
- [x] **A1/B1 Delete Pending 後 LC Number 可重複使用**——新增 `ContractStatus.CANCELLED` 實際賦值
  （`BalanceContractStore.markCancelled()`），僅限 root ISSUE（A1/B1），A6/A7/A8/B3 等子合約類
  CREATE/ISSUE **不在範圍內**（文件 §9.3）。
- [x] **`delete_pending_audit` 稽核表（BA 方案B，涵蓋 A1–A11/B1–B7 全部功能）**——已實作、已三套件
  全綠（Angular 1210/1210、backend 39/39、microservice 602/602，覆蓋率四項皆過95%）、已 live 驗證
  （文件 §10）。**目前沒有任何 HTTP 路由可以查詢這張表的內容**——只有寫入路徑（`cancel()` 內部
  insert），讀取要等第11節的 Inquire Delete Pending 畫面做出來才有。
  - [x] **同日修復**：新表對 `balance_movements`/`balance_contracts` 有外鍵約束
    （`PRAGMA foreign_keys = ON`），既有的 `/admin/reset-database`（Cleanup Database Tables 按鈕）
    路由沒有同步更新去刪這張新表，只要資料庫裡發生過一次 Delete Pending，再點 Cleanup 就會外鍵違反
    500。已修復（`app.ts` 補上 `DELETE FROM delete_pending_audit`，順序放最前面）並補上專屬回歸測試
    （`test/unit/app.test.ts`：Submit→Cancel 產生稽核列→reset-database 應為 200 且三表皆清空）。
    **教訓（已記入 Claude 端的長期記憶，供以後所有新表都要照做）**：新增一張有外鍵約束的表，除了為
    新功能本身寫測試，還必須額外 grep 全 repo 找出所有既有對被參照資料表做 raw
    DELETE/reset/wipe 的地方（測試 helper 也算），逐一確認是否要同步更新——這種交叉情境不會被
    「新功能自己的測試全綠」抓到。
- [x] **業務已確認 (a) Delete Sequence 為系統自動生成、持久化欄位**——`delete_pending_audit` 新增
  `delete_seq INTEGER NOT NULL` 欄位，`BalanceService.cancel()` 寫入時依自然鍵
  （`instrument_type`/`lc_number`/`ib_number`/`sg_number`，不是 `balance_contract_id`）計算並存入，
  已實作、已三套件全綠（Angular 1210/1210、backend 39/39、microservice 605/605）、已 live 驗證
  （文件 §11.4）。
- [x] **Inquire Delete Pending 獨立稽核查詢功能——業務已回覆 (b)/(c) 並追加 UI 需求，全部實作完成**
  （見文件 §13）：
  1. (b) Secondary Reference——業務確認「用第一個方案」，採用 §11.2(b) 的合併邏輯（子合約類用
     `ib_number`/`sg_number`；Amendment/Utilize 類用 `source_transaction_ref`）。
  2. (c) Function 篩選——業務同意前端過濾，維持 §11.2(c) 的建議設計。
  3. **追加 UI 需求**：整體操作方式與 INQUIRE EVENTS 一致（Import/Export → LC Catalog → 選 LC →
     該 LC 的 Delete Pending 記錄）；LC Catalog 只顯示「曾經被 Delete Pending 過」的 LC（新
     microservice 路由 `GET /delete-pending-audit/lc-catalog`，`SELECT DISTINCT` 依 LC Number
     去重，即使跨多張合約列/多次 Delete Pending 也只顯示一次）；樣式表與 INQUIRE EVENTS 相同。
  4. **SOLID/避免重複**：新增共用的 `LcCatalogIndexService`（Import/Export 切換 + LC Catalog
     搜尋/分頁，`fetchPage`/`decorate` 可替換，供 Inquire Delete Pending 使用；`InquireEventsService`
     本身因為已有 80+ 測試綁定既有欄位名稱，這次未一併遷移，留作後續獨立重構項目）；把
     `InquireEventsService` 原本私有的 `loadIndexRow()` 抽成模組層級匯出函式
     `computeLcIndexRow()`，兩邊共用同一份 Tenor Type/Currency/Face Amount/Last Event Date 計算邏輯。
  5. **過程中發現並修復一個真實 UI bug**：切換 Function 篩選時，先前開著的 View 明細面板沒有跟著
     清除，顯示過期資料——已修正（`[ngModel]`+`(ngModelChange)` 展開語法，一併呼叫 `closeView()`）。
  6. **業務指示微調**：Delete Pending 記錄表格的「View」按鈕移除，改成點擊整列開啟（跟 Inquire
     Events 既有的 Row-click 慣例一致），`.tb-table` 既有的 `cursor: pointer` 樣式已內建，不需要
     額外補樣式。
  7. **過程中順手修復第二個真實 bug（橫跨全專案的共用函式）**：`describeApiError()`（`api-error.ts`）
     原本對連線層級的 HTTP 失敗（伺服器一時連不上、CORS、DNS 等）只認得伺服器 JSON 錯誤格式
     （`err.error.message`），退回 `String(err)` 會印出無意義的「[object Object]」——已修正為優先
     讀取 `HttpErrorResponse` 自帶的 `.message` 欄位；新增這個函式先前完全沒有的專屬測試
     （`api-error.spec.ts`，5 筆）。`CheckerActionsService`、`MakerQueueService` 等所有既有呼叫端
     都受益，不是 Inquire Delete Pending 專屬的修復。
  三套件全綠：Angular 1259/1259、backend 39/39、microservice 619/619，覆蓋率四項皆過 95%。已透過
  curl（確認 12 個曾 Delete Pending 過的 LC 各自只出現一次）與完整瀏覽器操作（LC Catalog → 選 LC →
  查看該 LC 的 Delete Pending 記錄，Delete Sequence 依自然鍵正確分組 → 點擊整列開啟 View → 切換
  Function 篩選確認 View 自動關閉）live 驗證，全程無 Console 錯誤。
- [x] **已 commit 並 push**（commit `9242f0c`，2026-08-27）——上述 Phase 1-3 全部項目（含 §13 的
  Inquire Delete Pending 畫面、兩個順手修復的 bug）已進 `main` 分支。
- [x] **API OAS 文件已同步更新**——`analysis/balance-component-api.yaml` bump 到 **v1.28.0**（新增
  `GET /delete-pending-audit`、`GET /delete-pending-audit/lc-catalog`、
  `GET /balance-contracts/{balanceContractId}`；`GET /balance-contracts/catalog` 新增
  `excludeCancelled`；`GET /balance-movements` 記錄新的 `createdBy`/`status` 查詢分支；
  `ContractStatus.CANCELLED`／`cancel()` 的兩個新副作用補上說明；新增 `DeletePendingAuditRecord`
  schema），`analysis/balance-component-channel-api.yaml` 同步 bump 到 **v1.6.0**（`.../cancel`
  補充說明，副作用透過 passthrough 一併生效，此 channel 層不額外開放稽核查詢端點）。兩份 YAML 皆
  已用 `js-yaml` 驗證語法正確。**此次 OAS 更新尚未 commit**，等候下一次「commit and push」指示。
- [x] **業務書面確認 Phase 3（Fix Pending）前置條件 (a)，並修正欄位範圍——排除 Currency**（文件
  §15，2026-08-27）：「Currency 的 FIX PENDING 不許修改。A1、A2 要修改，先 Delete Pending 重新輸入。」
  最終範圍＝除 LC Number／IB-SG Number／**Currency** 外皆可修改（比 §2.3 原先「含 Currency」的口頭
  轉述更窄）；Currency 如需修正一律走 Delete Pending＋重新 Submit，不走 Fix Pending 就地編輯——同時
  解掉 §5.4 當初對 Currency 連動 `ceilingAmount`/`contingentAccountEntry`/GL 分錄幣別的風險疑慮，
  Fix Pending 驗證邏輯不需處理這個分支。至此 §5.4/§6.3/§7.4/§8/§14 逐輪覆核的四項前置條件
  (a)(b)(c)(d) **全部解除**。
- [x] **BA 正式指示：Fix Pending（C項）實作唯一依據＝本文件 §2.2＋§15，舊草稿
  `structured-coalescing-quasar.md` 不採用**（文件 §16.3）。該草稿是另一個 session 的暫存草稿，從未
  進這個 repo、也早於 §5-§15 這輪 BA↔工程覆核，最關鍵的是它必然沒反映 Currency 排除這條最終定案——
  照舊草稿做很可能做出「允許改 Currency」的錯誤版本。工程隊若認為舊草稿某些技術細節值得保留，須重新
  提出、走一次跟本文件同樣的 BA 複查流程，不得直接搬用。
- [ ] **Phase 3（Fix Pending）尚未動工**——前置條件已全部解除（見上兩條），可以開始實作。依 §2.2
  （新記錄＋舊記錄標記 SUPERSEDED＋`db.transaction()` 包裝）與 §15（欄位範圍）進行，驗收標準納入
  §6.1（`db.transaction()` 中途失敗一致性測試）與 §7.2（Inquire Events 對 SUPERSEDED 記錄的顯示
  驗證測試——顯示鏈路已存在，只需補測試）。

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
- **2026-08-28 發現並完整修復**：Maker Queue（「My Pending/My Rejected」）對 B4 Usance 的顯示有兩個問題，
  reviewer 實測發現——(1) 同一次 B4 Submit 會在三個不同合約各建一筆 movement
  （`EPLC_CONFIRMATION/ACCEPT`、`EPLC_ACCEPTANCE/CREATE`、`EPLC_ACCEPTANCE_REIMB_RECEIVABLE/CREATE`，
  共用同一個 `businessEventId`），其中 Receivable 那筆因為 `function-strategy.ts` 的
  `resolveFunctionForMovement()` 沒有替 `EPLC_ACCEPTANCE_REIMB_RECEIVABLE`/`EPLC_DUE_FROM_ISSUING_BANK`
  這兩個 instrumentType 註冊 fallback，顯示成空白「—」Function——**已修復**（比照既有的
  `EPLC_ACCEPTANCE/CREATE` fallback 案例）。(2) 這三筆原本是三個獨立列，且 compound 形狀（A3S/B4/B5）
  的 Delete Pending 按鈕原本維持 disabled 設計（`maker-queue.service.ts`「Phase 4」註解：跨 session
  這個 Maker Queue 沒辦法重建 compound 事件各 leg 的 movementId，delete 需要的 cascade 清理機制尚未
  實作）——**業務最終裁示為「1 只應該顯示一筆 2 一筆刪全部」**（本清單先前記錄的「業務已拒絕擴大／
  維持現狀」是對使用者稍早一則較模糊回覆的誤判，已由使用者本人在同一天當場更正；此處以使用者最終
  明確裁示為準）。**已完整修復**：`Phase 4` 的原始技術阻礙（跨 session 無法重建 sibling movementId）
  其實已在同一天稍早被 `findByBusinessEventId()`（為 Account Entries linked-resolution 修復而新增的
  既有 API）解除，不需要新的後端能力——`MakerQueueService` 新增 `groupCompoundRows()`（載入時依
  `businessEventId` 分組，每組合併成一列，代表列選取「與其所屬 Function 自己註冊的 instrumentType
  直接相符」的那一腿，同時自然帶對 Reference）；`deletePending()` 對合併列改為級聯：先依序取消每個
  sibling movement，最後才取消代表列自己的 movement（同 `checker-actions.service.ts` 同 session 版
  `deleteMakerPending()` 的「secondary 先、primary 後」防孤兒順序）；範本移除 `[disabled]` 綁定。
  Angular 全套 1348/1348 綠燈，四項覆蓋率皆 ≥95%。瀏覽器對真實 dev server 實測：U01（Usance）合併成
  1 列、S01（Sight）合併成 1 列，點 U01 那列的 Delete Pending 後直接對 3 個底層合約各自的 movement
  查證，全部變成 `CANCELLED`，UI 上該列也正確消失、S01 那列不受影響。
