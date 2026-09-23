## ADDED Requirements

### Requirement: Excess Preview and Decision Evidence

當resolved policy的`configuredMaximumUsd > 0`且`allowancePercentage > 0`時，Transaction Builder SHALL對A3、A3S、B3顯示非權威Covered／Excess preview、owner currency、configured USD cap的provider-converted owner amount、policy version、FX timestamp／source、freshness與allowance result；服務端response MUST取代preview成為權威結果。任一配置值為零時，A3／A3S／B3 UI SHALL顯示不允許超押並使用既有capacity／sufficiency presentation。

UI SHALL以protected／read-only方式顯示四個欄位：`Previous Exceed Amount`、`This Exceed Amount`、`Total Exceed Amount`、`Maximum Exceed Amount`。欄位值及currency一律來自preview／Maker Submit API response，UI不得自行彙總、換匯、重算或允許使用者修改。Preview必須標示非權威；Maker Submit response才取代為該command的權威結果。

`Maximum Exceed Amount` SHALL顯示服務端最終`MIN(LC／Confirmation face amount excluding tolerance × allowancePercentage, configuredMaximumUsd converted to transaction currency with compliant rate)`，不得顯示raw converted USD cap。Import LC Amount只包含Issue LC Amount與累計formal／Checker-approved Increase減去累計formal／Checker-approved Decrease；Pending／未核准amendments及Tolerance不得改變UI所收到的Maximum。任一配置值為0時，Maximum SHALL顯示`0`／no Excess，且不得暗示Excess Framework已啟用。

#### Scenario: Four Protected Exceed Fields

- **WHEN** A3／A3S／B3 preview成功回傳四個Exceed fields
- **THEN** UI SHALL逐一顯示Previous、This、Total及Maximum與transaction currency，且四欄均為protected／read-only
- **AND** `Total Exceed Amount` SHALL顯示API回傳的`Previous + This`結果，UI SHALL NOT自行加總或換匯

#### Scenario: Preview Fails FX Gate

- **WHEN** preview API回傳`FX_RATE_UNAVAILABLE`或`FX_RATE_STALE`
- **THEN** UI SHALL顯示typed reason並將四個欄位標示為不可用／非權威，不得用舊值暗示可Submit
- **AND** SHALL NOT顯示`FX_RATE_PENDING`或preview persistence成功

#### Scenario: Submit Replaces Stale Preview

- **GIVEN** Preview後active commitments、capacity、policy或rate已改變
- **WHEN** Maker Submit回傳重新計算結果或typed rejection
- **THEN** UI SHALL以Submit response取代preview，或清楚顯示zero-write rejection
- **AND** SHALL NOT以舊preview覆蓋authoritative response

#### Scenario: Fresh Rate Preview

- **GIVEN** `configuredMaximumUsd > 0` 且 `allowancePercentage > 0`
- **WHEN** 使用者輸入非 USD amount 且取得 fresh preview
- **THEN** UI SHALL 顯示 rate timestamp、source、Covered／Excess 與 estimated remaining allowance
- **AND** SHALL 標示 submit 時服務端將重新驗證

#### Scenario: Maker FX Unavailable or Stale

- **GIVEN** `configuredMaximumUsd > 0` 且 `allowancePercentage > 0`
- **WHEN** Submit 回傳 `FX_RATE_UNAVAILABLE` 或 `FX_RATE_STALE`
- **THEN** UI SHALL 顯示明確 reason 與未建立 pending transaction 的結果
- **AND** SHALL NOT 顯示成功或 `FX_RATE_PENDING`

#### Scenario: Excess-enabled Over-limit Submit Is Rejected

- **WHEN** A3／A3S／B3任一功能的服務端權威結果為projected total超過Effective Limit
- **THEN** UI SHALL 顯示`EXCESS_LIMIT_EXCEEDED`與Minimum Required Increase或`INCREASE_ALONE_CANNOT_RESOLVE`
- **AND** SHALL 明確顯示未建立pending transaction／reservation，不得顯示`PENDING`、`BLOCKED`或成功Submit
- **AND** client-side preview或disabled control不得取代API端相同的權威zero-write validation

#### Scenario: Zero Allowance Legacy Presentation

- **GIVEN** `configuredMaximumUsd = 0` 或 `allowancePercentage = 0`
- **WHEN** 使用者建立A3／A3S／B3
- **THEN** UI SHALL 顯示該 owner 不允許超押及既有 available capacity
- **AND** 若顯示四個protected fields，`Maximum Exceed Amount` SHALL為transaction currency的`0`並標示no Excess；SHALL NOT 顯示非零Maximum、Covered／Excess decision、FX、USD_PAR 或 allowance decision preview

### Requirement: Checker Excess Review

對 Excess-enabled movement，Checker review SHALL 並列 Maker snapshot 與 Checker revaluation，包括 USD→owner rate direction、timestamp、provider `convertedAmount`、owner-currency allowance effect 與差異；Release／Acknowledge control MUST 在 FX／allowance gate 失敗時停用或顯示權威拒絕。A3／A3S Acknowledge成功後UI SHALL顯示`PENDING`／EARMARKED及Pending Excess；A4／A6 final Release成功後才顯示Approved Excess。對 BD-03 legacy route，Checker UI SHALL 使用既有 review presentation，不得要求 FX／allowance evidence。

#### Scenario: Release Revaluation Differs

- **GIVEN** `configuredMaximumUsd > 0` 且 `allowancePercentage > 0`
- **WHEN** Checker rate 與 Maker rate 不同但仍在 allowance 內
- **THEN** UI SHALL 顯示兩份 snapshots 與差異
- **AND** 成功 Release SHALL 顯示 Checker authoritative result

#### Scenario: Release Rate Failure

- **GIVEN** `configuredMaximumUsd > 0` 且 `allowancePercentage > 0`
- **WHEN** Release 回傳 FX unavailable／stale
- **THEN** UI SHALL 顯示 pending movement 與 reservation 仍保留
- **AND** SHALL 提供安全 retry 而不建立重複 movement

### Requirement: Excess-specific Fix Pending

只有B3以及`acknowledgedAt = null`的A3／A3S forms SHALL允許修改Amount。A3／B3／pre-Acknowledge A3S依適用policy顯示FX／allowance或legacy sufficiency revalidation；A3S另顯示重新normalized capacity snapshot。Post-Acknowledge A3／A3S Amount SHALL保持protected。

#### Scenario: Fix Pending Replaces the Whole Pending Amount

- **WHEN** Maker 將 A3／B3或pre-Acknowledge A3S pending Amount 從舊值改為新值並提交 Fix Pending
- **THEN** UI SHALL 表示這是同一 pending transaction 的整筆 amount replacement
- **AND** SHALL NOT 將差額呈現為 partial return、partial cancellation 或第二筆 transaction

#### Scenario: Amount Fix Rejected by FX Gate

- **GIVEN** `configuredMaximumUsd > 0` 且 `allowancePercentage > 0`
- **WHEN** Fix Submit 回傳 FX unavailable／stale
- **THEN** UI SHALL 保留並重新載入原 pending movement 與 reservation
- **AND** SHALL NOT 顯示未保存 amount 為權威資料

#### Scenario: Amount Fix Exceeds Allowance

- **WHEN** A3／B3或pre-Acknowledge A3S Fix Submit回傳`EXCESS_LIMIT_EXCEEDED`
- **THEN** UI SHALL 保留並重新載入原pending movement、amount與reservation
- **AND** SHALL 顯示新計算只供指引且未保存，不得顯示blocked replacement

#### Scenario: Zero Allowance Amount Fix Presentation

- **GIVEN** `configuredMaximumUsd = 0` 或 `allowancePercentage = 0`
- **WHEN** Maker 修改 pending A3／B3或pre-Acknowledge A3S Amount
- **THEN** UI SHALL 顯示將套用既有 sufficiency validation
- **AND** SHALL NOT 顯示 FX／allowance revalidation 或 Excess reservation replacement

#### Scenario: Non-excess Function

- **WHEN** 使用者開啟非 A3／A3S／B3 pending movement
- **THEN** Amount SHALL 維持 protected

#### Scenario: A3／A3S Acknowledge 後 Amount 維持 Protected

- **GIVEN** A3或A3S `acknowledgedAt != null`且Legal／Covered／Excess已鎖定
- **WHEN** Maker開啟該為`PENDING`／EARMARKED或`REJECTED`的A3／A3S Fix／Resubmit form
- **THEN** UI SHALL將Amount保持唯讀／protected且不得送出Amount replacement request
- **AND** remarks-only correction如由既有function policy允許，MAY保持可用但不得重新開放Amount

### Requirement: A3S Sequential Resolution Guidance

A3S UI SHALL 先顯示 eligible SG re-selection guidance，且 SHALL NOT 自動選擇 SG 或同時顯示目前選擇下的 Minimum Required Increase。只有使用者重新選擇 SG，服務端重讀Current SG Redemption Amount、重新normalize Base Parent Tight並重算Effective Presentation Capacity後仍不足，UI 才 SHALL顯示新snapshot的Minimum Required Increase並引導既有A2。

#### Scenario: Eligible Alternative SG Exists

- **WHEN** current SG capacity 不足但有其他 eligible SG
- **THEN** UI SHALL 顯示 re-select action 與 eligible alternatives
- **AND** SHALL NOT 同時顯示 Minimum Required Increase

#### Scenario: Re-selected SG Still Insufficient

- **WHEN** Maker 選擇另一 eligible SG 且權威重算仍不足
- **THEN** UI SHALL 顯示新計算的 Minimum Required Increase、snapshot evidence 與 A2 guidance
- **AND** SHALL NOT 自動建立或提交 A2

### Requirement: Waiver and Authorization Review UI

A4／A6／B4在selected event的`This Exceed Amount > 0`時 SHALL顯示完全相同的Checker Excess Review：`Excess Review`、紅色event-level `This Exceed Amount`、紅色`Checker Approve` checkbox、Checker ID、Release／Reject／Account Entries。不得依Import／Export顯示不同標題、不同first-level controls或不同版面。三者操作均以B4為標準：外部claim預設`ABSENT`，未勾選時Release SHALL disabled；Reject SHALL仍可用；勾選後可依其他Release gates繼續。A4／A6 SHALL NOT映射或要求Applicant Waiver `CONFIRMED`。B4 SHALL使用`claimStatus = ABSENT`、`authorizationValidationResult = NOT_CONFIRMED`，且 SHALL NOT顯示Authorization status／reference／amount／currency／scope／applicability／authenticity欄位；完整Excess debtor依權威服務結果為Beneficiary／Recourse Party。既有Submitted-authorization API／data model／backend validation contract保留。B3 UI不得提前決定或保存debtor attribution。

完成B4 Checker Release並回到Transaction Index後，畫面 SHALL清除上一筆`B4 Authorization & Export Asset Inquiry`結果，不得將已完成交易的authorization、debtor或reconciliation資訊殘留在新交易畫面。

A3／A3S／B3的Excess Preview及Maker Result Excess breakdown SHALL只在`Previous Exceed Amount > 0`或`This Exceed Amount > 0`時顯示。當兩者皆為零時，UI SHALL隱藏Previous／This／Total／Max Exceed、Within Allowance以及Maker Result的Covered／Excess／Excess Decision；此顯示規則不得跳過Maker Submit所需的authoritative Excess preview validation。

#### Scenario: Common Approval Is Not Checked

- **WHEN** A4／A6／B4 Checker尚未勾選共同`Checker Approve`
- **THEN** UI SHALL disable Release並保留pending狀態

#### Scenario: Import Excess Warning Is Event-specific

- **GIVEN** 同一LC有一筆Covered-only Arrival B01（`This Exceed Amount = 0`）及另一筆Excess Arrival B02（`This Exceed Amount > 0`）
- **WHEN** Checker分別在A4／A6選取B01及B02準備Release
- **THEN** B01 SHALL NOT顯示Exceed warning，B02 SHALL顯示該事件自己的This Exceed Amount並要求共同`Checker Approve`
- **AND** UI與API SHALL依selected source event的authoritative Excess判斷，不得用該LC的累計Pending／Approved Excess誤判B01

#### Scenario: Export Authorization Warning Is Event-specific

- **GIVEN** 同一Export Confirmation有一筆Covered-only Presentation B01（`This Exceed Amount = 0`）及另一筆Excess Presentation B02（`This Exceed Amount > 0`）
- **WHEN** Checker分別在B4選取B01及B02準備Release
- **THEN** B01 SHALL NOT顯示Exceed warning，B02 SHALL顯示該事件自己的This Exceed Amount並要求與A4／A6相同的`Checker Approve`
- **AND** UI與API SHALL依selected source B3 event的authoritative Approved Excess判斷，不得用該Confirmation的累計Pending／Approved Excess誤判B01

#### Scenario: B4 Uses the Simple Absent Authorization Path

- **GIVEN** B4 selected source B3 event具有正數Excess
- **WHEN** Checker勾選共同的`Checker Approve`並Release
- **THEN** UI SHALL送出`claimStatus = ABSENT`及`authorizationValidationResult = NOT_CONFIRMED`
- **AND** SHALL NOT顯示Submitted authorization欄位，服務 SHALL依BD-14將完整Excess debtor歸屬Beneficiary／Recourse Party

#### Scenario: Authorization Is Partial

- **GIVEN** Excess為200且authorized amount為100
- **WHEN** Checker檢視authorization結果
- **THEN** UI SHALL顯示authorization未覆蓋完整Excess，完整200 debtor為Beneficiary／Recourse Party
- **AND** SHALL NOT顯示100／100 partial split

### Requirement: Export Asset Split Presentation

Export accounting／inquiry UI SHALL分別顯示Covered Asset與`EXPORT_EXCESS_ASSET`，保留`Due from Issuing Bank`及`Reimbursement Receivable`名稱，並顯示debtor attribution及Covered + Excess = Legal Amount reconciliation。

#### Scenario: Usance Asset Presentation

- **WHEN** Legal Amount為10,200、Covered為10,000、Excess為200
- **THEN** UI SHALL顯示`Reimbursement Receivable 10,000`及`EXPORT_EXCESS_ASSET 200`
- **AND** total SHALL顯示10,200
