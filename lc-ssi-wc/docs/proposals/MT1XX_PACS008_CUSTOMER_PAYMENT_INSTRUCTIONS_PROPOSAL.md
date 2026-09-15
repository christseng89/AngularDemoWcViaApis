# MT1xx／pacs.008 Customer Payment Instructions Proposal

**狀態：DRAFT — PEER REVIEW IN PROGRESS；BOUNDARY CONCEPT PASS，IMPLEMENTATION AUTHORIZATION FAIL**  
**版本：v0.2**  
**日期：2026-09-16**  
**適用範圍：第一階段 MT103／pacs.008 Customer Credit Transfer**  
**不在本版範圍：其他 MT1xx message type 的完整報文規則、完整 FIN／network validation、付款執行與 accounting posting**

## 1. Executive Decision

BA 共同結論如下：

1. **Customer 不持有 Bank SSI。** Customer 提供的是 **Customer Payment Instructions（CPI，客戶付款指示）**，代表客戶希望支付給誰、多少、何種幣別、使用哪個帳戶、用途與匯款資訊，以及在受控情況下提出 routing constraint。
2. **Bank SSI 是銀行控制的結算參考資料。** 它描述 correspondent、Nostro／Vostro account、clearing 與 settlement preference，用於建構可執行的銀行間結算路徑。
3. Customer payment 的最終可執行結果不是單一 SSI lookup，而是：

   `Customer-originated intent + Bank validation/enrichment + Own SSI + Counterparty SSI + Routing/Settlement Policy`

4. 系統必須保存兩層物件，禁止覆寫原始客戶意圖：

   - `CustomerOriginatedIntent`：客戶原始授權內容。
   - `ExecutablePaymentInstruction`：經銀行驗證、合規篩查、路徑選擇與結算資料補全後的可執行指示。

5. UI 的 **Customer** 頁應是 Party／Customer master 與 Payment Instruction Profile，不應顯示 `SSI Count`、`governed SSI record` 或把 Customer instruction 稱為 SSI。
6. MT 與 MX 必須由同一份 canonical payment instruction／route snapshot 產生；MT compatibility view 不得成為第二份業務真相。

## 2. Why This Boundary Matters

把 Customer instruction 誤當 SSI 會造成下列風險：

- 客戶輸入可直接覆寫本行 Nostro、correspondent 或 reimbursement route。
- Customer master、beneficiary template、Bank SSI 與 transaction data 混在同一生命週期。
- MT103 field 57a 或 pacs.008 Creditor Agent 的來源無法判定是 customer-provided、bank-resolved 或 route-derived。
- 更新銀行 SSI 時意外改變歷史客戶指示；更新 customer template 時意外改變 settlement master。
- Serial／Cover、INDA／INGA／COVE 被混成同一維度，導致錯誤的 message composition。
- 合規篩查只處理客戶原始資料，未對 route enrichment 新增的 agent 重新篩查。

## 3. Controlled Definitions

### 3.1 Customer Party Master

客戶的穩定身份資料，例如 customer ID、legal name、address、country、KYC status、account relationship 與 entitlement。它不是單筆付款指示，也不是 SSI。

### 3.2 Payment Instruction Profile

由客戶或銀行為客戶維護、可重用但仍受版本及授權控制的付款模板，例如常用 beneficiary、beneficiary account、remittance default、preferred route constraint。套用後必須形成 transaction-scoped snapshot，不能直接依 mutable template 執行。

### 3.3 Customer Payment Instructions（CPI）

客戶針對一筆付款所授權的 business intent，至少包含付款人、收款人、帳戶、金額、幣別、付款目的、匯款資訊、識別碼及可接受的客戶 routing constraint。CPI 不包含本行可自行更換的 Nostro、Vostro、reimbursement agent 或 bank settlement account。

### 3.4 Bank SSI, Reference Data and Policy

銀行控制、用於 settlement routing 的 Standing Settlement Instructions，包括 correspondent、settlement account、currency／payment-method applicability 與 instruction validity。Bank SSI、Clearing/Network Reference、Routing/Settlement Policy 及 Party/Account Master 必須分開管理，不得全部包成 SSI；customer/party master enrichment 也不是 SSI。這些來源維持獨立 ownership，但在 resolution 時組成版本鎖定的完整 route。

### 3.5 Executable Payment Instruction

在 CPI 通過 entitlement、validation、route discovery、exact route confirmation、RMA 與 SSI eligibility，並取得適用的 pre-release compliance、cut-off、funding/liquidity eligibility evidence 後產生的銀行可執行指示。這些是 release eligibility evidence，不代表本 Proposal 執行 payment、accounting posting 或 final settlement。它必須引用原始 CPI snapshot，不得以 enrichment 覆蓋 customer-originated values。

## 4. Scope and Message Boundary

### 4.1 Phase 1 In Scope

- Outgoing customer credit transfer。
- MT103 compatibility view。
- pacs.008 FIToFICustomerCreditTransfer。
- Serial 與 Cover payment method。
- pacs.008 customer chain；採 Cover 時另建 pacs.009 COV cover chain。
- Customer Party、Payment Instruction Profile、transaction CPI、bank enrichment、route resolution、provenance 與可測試的 UI/API contract。

### 4.2 Explicitly Out of Scope for This Proposal

- 以「MT1xx」概括套用到 MT101、MT102、MT110 等不同 business purpose 的訊息；每一 message type 必須另做 MRG／NVR scope ruling。
- 完整 FIN／network validator。
- payment release、ledger posting、confirmation、investigation 與 return／recall 的完整流程。
- 把 customer routing preference 當作直接可執行的 Bank SSI。

## 5. Information Ownership

| Business information | Canonical owner | Customer may provide | Bank may enrich/resolve | Must preserve origin |
| --- | --- | ---: | ---: | ---: |
| Debtor／Ordering Customer | CPI／Party Master | Yes | Validate only | Yes |
| Debtor Account | CPI + Account Master validation | Yes | Validate entitlement/status | Yes |
| Creditor／Beneficiary | CPI | Yes | Validate/repair under policy | Yes |
| Creditor Account | CPI | Yes | Validate format/reachability | Yes |
| Amount／Currency | CPI | Yes | Validate; no silent change | Yes |
| Purpose／Remittance | CPI | Yes | Validate/sanitize under policy | Yes |
| End-to-End／Customer Reference | CPI | Yes | Generate only when governed | Yes |
| Creditor Agent | CPI or Bank Reference, scenario-dependent | Sometimes | Resolve/validate | Yes |
| Intermediary preference/constraint | CPI constraint | Optional | Accept/reject/select route | Yes |
| Debtor Agent／Booking Entity | Bank context | No | Yes | Yes |
| Instructing／Instructed Agent | Message-hop context | No | Yes | Yes |
| Previous／Intermediary Agents | Route decision | Constraint only | Yes | Yes |
| Settlement Method | Bank policy | Preference only | Yes | Yes |
| Settlement Account／Nostro／Vostro | Own/Counterparty SSI + Account Master | No | Yes | Yes |
| Reimbursement Agents／Accounts | Bank SSI／Cover route | No | Yes | Yes |
| RMA authorization | Bank control | No | Validate chosen hop/profile | Yes |

## 6. MT103 Compatibility Ownership

本表是 CPI／SSI responsibility proposal，不取代正式 MRG／NVR。

| MT103 field | Proposed source／ownership | Decision note |
| --- | --- | --- |
| 20 Transaction Reference | Bank transaction context derived from customer instruction ID | Must be unique/idempotent |
| 23B Bank Operation Code | Bank message/profile policy | Not free customer input |
| 32A Value Date/Currency/Interbank Settled Amount | Transaction + settlement decision | May differ from 33B only under governed FX/charge derivation with rate/source/reconciliation evidence |
| 33B Currency/Instructed Amount | CPI | Preserve customer instructed amount |
| 50a Ordering Customer | CPI／Party Master | Customer-originated party |
| 52a Ordering Institution | Governed transaction context | Scenario-specific; not Bank SSI by default |
| 53a Sender's Correspondent | Own SSI／resolved route | Bank-controlled |
| 54a Receiver's Correspondent | Counterparty SSI／resolved route | Bank-controlled |
| 56a Intermediary Institution | Route-derived or governed customer constraint | Never accept unvalidated direct override |
| 57a Account With Institution | Usually creditor-agent/route role; authority is scenario-dependent | BA decision required per scenario |
| 59a Beneficiary Customer | CPI | Customer-originated beneficiary |
| 70 Remittance Information | CPI | Preserve/validate |
| 71A Details of Charges | CPI request constrained by product/route policy | Mapping loss must be explicit |
| 72 Sender-to-Receiver Information | Controlled transaction text only | No free-form route override |

## 7. pacs.008 Ownership

| pacs.008 business component | Proposed source／ownership | Decision note |
| --- | --- | --- |
| Debtor / Debtor Account | CPI + validated Party/Account Master | Customer intent |
| Creditor / Creditor Account | CPI | Customer intent |
| Instructed Amount / Currency | CPI | No silent modification |
| Purpose / Remittance Information | CPI | Validate under product policy |
| EndToEndId | CPI or governed bank generation | Origin recorded |
| Debtor Agent | Booking/account-servicing context | Not SSI by default |
| Creditor Agent | Customer-authoritative, customer-requested, or bank-repaired/derived, scenario-dependent | Authority and replaceability must be explicit; origin recorded |
| Instructing / Instructed Agent | Current message hop | Route/message context |
| Previous / Intermediary Agents | Selected route | Bank-resolved |
| Settlement Method | Settlement policy | `INDA`, `INGA`, `COVE`, or permitted clearing value |
| Settlement Account | Own/Counterparty SSI + Account Master | Bank-controlled |
| Reimbursement Agents / Accounts | Cover route | Bank-controlled |

## 8. Independent Decision Axes

三個維度必須獨立建模，禁止使用單一 `routeType` 混合：

1. `paymentTransferMethod = SERIAL | COVER`
2. `paymentChainTopology = DIRECT | INTERMEDIATED`
3. `messageSettlementMethod = INDA | INGA | COVE | CLRG`（僅適用於允許的 profile）

`DIRECT` 是 chain topology，不等於 settlement method；沒有 direct Nostro／Vostro 也不自動等於 Cover。

### 8.1 INDA / INGA

- `INDA` — **Instructed Agent performs settlement**；典型關係是 Instructing Agent 的 Nostro 由 Instructed Agent servicing。
- `INGA` — **Instructing Agent performs settlement**；典型關係是 Instructed Agent 的 account／Vostro 由 Instructing Agent servicing。
- 依當前 pacs.008 message hop 判斷誰是 settlement account owner／servicer 及 debit/credit role。
- 不得把 INDA 解讀成「付款」、INGA 解讀成「收款」。
- 必須保存 account owner、account servicer、currency、account role 與 exact route identity。

### 8.2 COVE

- pacs.008 是 customer credit transfer chain。
- pacs.009 COV 是獨立 cover settlement chain。
- 兩者是同一 business transaction 的兩個 route objects，不得把 pacs.009 COV 的 reimbursement SSI 填入 customer chain。
- Cover correlation cardinality、UETR/reference copying 與 underlying data consistency 必須依 current SR2026／CBPR+ UG／current PMPG 精確規則裁定；在 evidence 登錄前維持 `OPEN`，不得作 production rule。

### 8.3 Proposed Compatibility Matrix — Not Yet Authorized

| Transfer method | pacs.008 settlement method | Additional cover message | Proposed disposition |
| --- | --- | --- | --- |
| SERIAL | INDA | None | Candidate-valid; exact account-role rule required |
| SERIAL | INGA | None | Candidate-valid; exact account-role rule required |
| SERIAL | CLRG | None | Only for explicitly permitted profile/market infrastructure |
| SERIAL | COVE | Required | Invalid combination; fail closed |
| COVER | COVE | pacs.009 COV | Candidate-valid only after current-rule correlation evidence |
| COVER | INDA / INGA / CLRG | Unclear | Invalid unless an approved scenario-specific rule proves otherwise |

This matrix is a BA proposal, not a production rule. Illegal or unproven combinations must fail closed with `INVALID_TRANSFER_SETTLEMENT_COMBINATION`.

## 9. Proposed Canonical Model

```text
CustomerParty
  └─ PaymentInstructionProfile (optional reusable template)
       └─ CustomerOriginatedIntentSnapshot
            ├─ instructionIdentity / idempotencyKey
            ├─ channel / mandate / entitlement evidence
            ├─ debtor / debtorAccount
            ├─ creditor / creditorAccount / creditorAgentRequest
            ├─ amount / currency / dates / priority
            ├─ purpose / remittance / chargesRequest
            └─ routingConstraints[]

ExecutablePaymentInstruction
  ├─ customerIntentSnapshotId + sha256
  ├─ bankValidationAndEnrichment
  ├─ selectedRouteIdentity + discoverySnapshot
  ├─ settlementInstructions
  │    ├─ ownSsiIdentity/version
  │    ├─ counterpartySsiIdentity/version
  │    ├─ accounts and roles
  │    └─ RMA/profile/cutoff eligibility evidence
  ├─ customerChain (MT103 / pacs.008)
  ├─ coverChain (MT202 COV / pacs.009 COV, when applicable)
  ├─ status dimensions
  └─ provenance / validation / audit evidence
```

### 9.1 Routing Constraint

Customer routing input must be structured and non-authoritative:

```json
{
  "requestedRole": "CREDITOR_AGENT_OR_INTERMEDIARY",
  "agentId": "stable-party-or-bank-id",
  "strength": "MUST | PREFER | AVOID",
  "currency": "USD",
  "scope": "THIS_PAYMENT | PROFILE",
  "fallbackAllowed": false
}
```

The bank either accepts, rejects, or records an override reason. It never silently treats this as SSI.

## 10. Resolution and Execution Flow

1. **Intake** — capture channel, customer, mandate, entitlement, instruction ID/idempotency key and CPI.
2. **CPI validation** — validate required data, account authority, currency/amount/date, beneficiary data and product eligibility.
3. **Initial compliance screening** — screen customer-originated parties and text.
4. **Route discovery** — DB/API filters by booking entity, currency, value date, message profile, customer constraint and policy; return complete atomic route candidates plus opaque snapshot.
5. **Route selection** — auto-select only a unique best eligible complete route; ambiguity fails closed or requires selection of the whole route.
6. **Exact route confirmation** — revalidate exact SSI versions, accounts, RMA, calendar/cut-off, funding/liquidity and snapshot freshness.
7. **Post-enrichment compliance screening** — rerun screening for newly introduced agents/accounts and any repaired fields.
8. **Composition** — use one canonical instruction but do not cross-pair message families:

   - MT route: MT103; when approved Cover is selected, separate MT202 COV.
   - MX route: pacs.008; when approved Cover is selected, separate pacs.009 COV.
9. **Release gate** — only release when all status dimensions are eligible and evidence points to the same instruction/route snapshot.

## 11. Status Model

Avoid a single ambiguous `RESOLVED` flag. Use at least:

- `instructionValidationStatus`
- `entitlementStatus`
- `complianceStatus`
- `routeResolutionStatus`
- `settlementEligibilityStatus`
- `messageCompositionStatus`
- `releaseStatus`

Every status must carry reason codes and evidence identities. `REPAIR_REQUIRED`, `BLOCKED`, `STALE`, `AMBIGUOUS`, `NO_ELIGIBLE_ROUTE` and `REJECTED_CUSTOMER_CONSTRAINT` must be distinguishable.

## 12. Provenance and Audit

For every material value, keep three separate dimensions:

| Dimension | Example values |
| --- | --- |
| Origin | CUSTOMER_INPUT, CUSTOMER_PROFILE, PARTY_MASTER, OWN_SSI, COUNTERPARTY_SSI, ACCOUNT_MASTER, ROUTE_POLICY |
| Derivation | DIRECT, VALIDATED, NORMALIZED, RESOLVED, DEFAULTED, OVERRIDDEN, REPAIRED |
| Validation | NOT_CHECKED, VALID, INVALID, SCREENED, STALE, AMBIGUOUS |

Minimum audit identity:

- original value and effective value;
- source stable ID, version and SHA;
- rule/evidence ID;
- actor/system and timestamp;
- instruction snapshot, discovery snapshot and selected complete route ID;
- previous value and override reason;
- MT/MX projection SHA and correlation ID.

## 13. UI Proposal

### 13.1 Counterparty Inbox

Replace the current Customer tab semantics:

| Current label | Proposed label |
| --- | --- |
| `Customer` under SSI inbox | `Customer / Party` or separate Customer workspace |
| `SSI COUNT` | `PAYMENT PROFILE COUNT` |
| `CURRENCIES` from SSI record | `SUPPORTED / RECENT PAYMENT CURRENCIES` only if sourced and meaningful |
| `ACTIVE • governed record` | `ACTIVE • <n> payment instruction profile(s)` |
| Open SSI | Open customer / payment profiles |

Bank tabs remain:

- `Bank (SSI)` — governed bank settlement instructions.
- `Bank (No SSI)` — known financial institution without usable settlement instruction.

### 13.2 Payment Instruction Screen

Expose only customer-authorized payment fields and meaningful preferences. Do not expose Nostro/Vostro, reimbursement account, RMA or bank route internals as editable customer inputs. Route evidence may be shown read-only after resolution.

## 14. API Boundary

Suggested capabilities, not final endpoint names:

- `POST /customer-payment-instructions/validate`
- `POST /customer-payment-instructions/{id}/route-discovery`
- `POST /customer-payment-instructions/{id}/route-confirmation`
- `POST /customer-payment-instructions/{id}/compose`
- `GET /customers/{id}/payment-instruction-profiles`

Contract requirements:

- stable IDs and versions, not display strings;
- idempotency key on every mutating call;
- immutable intent snapshot and exact context hash;
- atomic complete-route selection;
- structured fail-closed reason code;
- no silent fallback when a customer `MUST` constraint is unsupported;
- same canonical result drives MT and MX projections.

## 15. Acceptance Criteria

1. **Given** a customer instruction, **when** it is persisted, **then** the original CPI snapshot and SHA remain immutable after bank enrichment.
2. **Given** a Customer record, **when** it is shown in UI, **then** it is not labelled SSI and does not display SSI Count.
3. **Given** a bank SSI update, **when** an existing CPI is reopened, **then** the original CPI remains unchanged and any route refresh creates new route evidence/version.
4. **Given** a customer `MUST` agent constraint with `fallbackAllowed=false`, **when** no eligible route satisfies it, **then** return `CUSTOMER_ROUTE_NOT_SUPPORTED`, create no route selection and produce no message. A separate scenario must test `PREFER` fallback only after BA-CPI-014 is approved.
5. **Given** route discovery, **when** more than one complete route shares best rank, **then** the system returns ambiguity or requires whole-route selection; it never selects by row order/UUID.
6. **Given** a selected route, **when** the DB/config snapshot changes, **then** confirmation fails closed with a stale reason and no message/payload is produced.
7. **Given** legal entities or branches sharing a BIC8, **when** exact legal entity, BIC11/branch, account servicer, currency, ledger account role or book-transfer capability differs, **then** result is not `SAME_CORRESPONDENT_BOOK_TRANSFER`.
8. **Given** a route claiming same correspondent, **when** legal entity, branch, account servicer, currency, ledger account role, active status or book-transfer capability is incompatible, **then** same-correspondent optimization is rejected.
9. **Given** a Serial payment, **when** no direct Nostro exists, **then** the system does not automatically change it to Cover without a governed transfer-method decision.
10. **Given** a Cover payment after BA-CPI-012 is approved, **when** messages are composed, **then** customer and cover chains are separate and the exact approved cardinality, UETR and reference-copying assertions pass; before approval this case is `NOT_EXECUTED`, not PASS.
11. **Given** pacs.008 with settlement method COVE, **when** no matching pacs.009 COV route is eligible, **then** release fails closed.
12. **Given** initial customer data has passed screening, **when** route enrichment introduces a new agent/account, **then** screening is rerun before release.
13. **Given** a charge request whose semantics cannot be preserved, **when** mapping is attempted, **then** return `CHARGE_BEARER_MAPPING_LOSS`, record source/target values and rule ID, set `messageCompositionStatus=REPAIR_REQUIRED`, and produce no releasable message.
14. **Given** a value date made ineligible by holiday/cut-off/timezone/funding/liquidity policy, **when** route confirmation runs, **then** return the gate-specific reason code, set `settlementEligibilityStatus=INELIGIBLE`, preserve the requested date and do not roll it automatically.
15. **Given** RMA is valid but the settlement account/SSI is invalid, **then** route confirmation fails; RMA alone never makes a route executable.
16. **Given** SSI/account is valid but RMA for the actual receiver/profile/direction is missing, **then** route confirmation fails.
17. **Given** a replay with the same idempotency key and same payload, **then** the response is stable and no duplicate side effect occurs; a different payload under the same key is rejected.
18. **Given** MT103 and pacs.008 views for one confirmed instruction, **then** both reference the same intent/route snapshot SHA; any truncation, omission or option change returns a structured `mappingDifferences[]` item containing path, source value, target value and rule ID.
19. **Given** a fixture with `usageScope=QA_NEGATIVE|QA_BOUNDARY`, **when** the Operational picker queries `usageScope=OPERATIONAL`, **then** it is absent from candidate IDs and the DB/API/UI snapshot identities remain equal.
20. **Given** any manual repair or route change, **when** release is retried, **then** `validationEvidence`, `screeningEvidence`, `routeConfirmationEvidence` and `releaseEligibilityEvidence` tied to the prior value/route SHA become `STALE` and are regenerated before release.
21. **Given** an INDA candidate, **when** account owner/servicer/debit-credit roles do not satisfy the approved INDA rule, **then** return `INVALID_INDA_ACCOUNT_RELATIONSHIP` and no complete route.
22. **Given** an INGA candidate, **when** account owner/servicer/debit-credit roles do not satisfy the approved INGA rule, **then** return `INVALID_INGA_ACCOUNT_RELATIONSHIP` and no complete route.
23. **Given** an unapproved axis combination such as `SERIAL+COVE`, **when** route confirmation runs, **then** return `INVALID_TRANSFER_SETTLEMENT_COMBINATION` and no message.
24. **Given** scenario-specific MT/MX population rules are not approved, **when** composer validation runs, **then** result is `RULE_EVIDENCE_MISSING`; it must not infer populate/omit behavior.

## 16. BA Decisions Required Before Implementation

| ID | Decision | Proposed default | Status |
| --- | --- | --- | --- |
| BA-CPI-001 | Phase-1 message scope | MT103 + pacs.008 only; other MT1xx separately ruled | PROPOSED |
| BA-CPI-002 | Authority for 57a / Creditor Agent by scenario | Preserve customer request, validate and resolve by scenario policy | OPEN |
| BA-CPI-003 | 52a applicability | Governed scenario context, not generic CPI/SSI | OPEN |
| BA-CPI-004 | Customer routing constraint strengths/fallback | MUST/PREFER/AVOID + explicit fallbackAllowed | PROPOSED |
| BA-CPI-005 | Serial vs Cover policy owner | Bank product/routing policy; customer supplies preference/constraint only | PROPOSED |
| BA-CPI-006 | Same-correspondent match key | Exact legal/branch/account/currency/role/capability identity, not BIC alone | PROPOSED |
| BA-CPI-007 | Charge bearer mapping/repair | Explicit compatibility matrix and mapping-loss reason | OPEN |
| BA-CPI-008 | Free text / field 72 policy | Controlled use only; never route override | PROPOSED |
| BA-CPI-009 | Customer profile lifecycle | Versioned template + immutable transaction snapshot | PROPOSED |
| BA-CPI-010 | UI placement | Separate Customer/Payment Instructions from Bank SSI inbox | PROPOSED |
| BA-CPI-011 | Transfer/settlement compatibility | Approve exact SERIAL/COVER × INDA/INGA/COVE/CLRG matrix and owner | OPEN |
| BA-CPI-012 | Cover correlation | Current-rule cardinality, UETR/reference copying and underlying-data rules | OPEN |
| BA-CPI-013 | 32A/33B reconciliation | Approve FX/charge derivation, rate/source and tolerance rules | OPEN |
| BA-CPI-014 | Unsupported customer constraint | Separate MUST rejection, PREFER governed fallback and consent/manual repair | OPEN |
| BA-CPI-015 | Scenario population/omission | MT 52/53/54/56/57 and MX agent/account matrix by Direct/Serial/Cover | OPEN |
| BA-CPI-016 | CLRG applicability | Explicit allowed profiles/market infrastructures only | OPEN |
| BA-CPI-017 | Gate ownership | Compliance/RMA/cut-off/liquidity fail policy, reason code and evidence owner | OPEN |

No engineering implementation should treat an `OPEN` item as an implicit default.

## 17. Delivery Plan

### Phase A — BA Contract

- Product Owner decides BA-CPI-001 through BA-CPI-017.
- BA Maker and Independent BA Checker verify the same proposal SHA against controlled SWIFT/ISO sources.
- Convert decisions into source register, typed domain vocabulary and TDD oracle.

### Phase B — Data and API

- Split Customer Party, Payment Instruction Profile, CPI snapshot and Bank SSI stores.
- Add complete-route discovery/confirmation contract.
- DBA verifies indexes, plans, cold/hot p50/p95/max and operational/QA snapshot parity.

### Phase C — Generic UI

- Rename/remove Customer SSI semantics.
- Render CPI from governed Page Parameters.
- Show selected route/provenance read-only and keep bank settlement data non-editable by customer workflow.

### Phase D — UAT and Release

- BA/QA jointly execute positive, negative, boundary, Serial, Cover, INDA, INGA and COVE scenarios.
- Verify MT/MX parity from the same canonical snapshot.
- Require same code SHA, proposal/TDD SHA, DB logical snapshot, Sonar run and evidence manifest for release sign-off.

## 18. BA Peer Validation Summary

| Reviewer perspective | Confirmed | Challenge incorporated |
| --- | --- | --- |
| MT103 BA preliminary review | CPI is transaction intent; fields 53a/54a are SSI/route, 57a is scenario-dependent | Added field ownership table and explicit 52a/57a OPEN decisions |
| ISO 20022/CBPR+ BA preliminary review | Separate intent from executable instruction; separate transfer method, topology and settlement method | Added canonical model, three independent axes and separate Cover chain |
| Payment Operations BA preliminary review | Concept alone is insufficient for UAT; exact route, compliance rerun, account roles, cut-off and lifecycle are required | Added operational flow, multidimensional statuses and 24 acceptance criteria |
| Independent BA Checker fresh-read | `CORRECT — NOT PASS`; concept boundary acceptable, controlled contract incomplete | Added corrected boundary, INDA/INGA definitions, compatibility proposal, OPEN decisions and deterministic criteria |

Review outcome: **Boundary concept PASS：Customer Payment Instructions are not Bank SSI. Controlled BA contract and implementation authorization FAIL** until OPEN BA decisions, current-rule evidence and same-SHA 4-EYES gate are closed. Preliminary reviews and checker result are review inputs, not controlled approval signatures.

## 19. Source Register

### 19.1 Project-Controlled Sources

| Source | Version / SHA-256 | Use |
| --- | --- | --- |
| `C:\Users\samfi\Downloads\MT1xx_pacs008_SSI_Customer_Payment_Instructions_v2.md` | `0376C320A51BE8A9F0972F043002674A94D73C49CA9EC01CA3F89E3520785A3F` | Initial domain proposal |
| `memory/lc-ssi-wc-operating-model-zh-v2.md` | v2.8.18; canonical LF SHA `5D3B1730409BB974137CCCEC59E7E2635F2E2C75FFCB452AD0C5983EBFC80318`; Windows CRLF raw SHA `326C488D265D0E24A7900A0676FBA1096F0C79C308C9BCFDF65B6A5D761ADD19` | Operating governance |
| `memory/mt347-oas-page-parameters-ui-standard-v1.md` | v1; canonical LF SHA `49802BC555A7609CDFF60C7B868C2C81FFE9A14977468E4EB61321A0842F5184`; Windows CRLF raw SHA `AAAF3CD3A6B0FE82904B10EA0B1507531DA197BE7C52699CD9AF66B3F59372B3` | Generic OAS/Page Parameters/UI pattern |

The canonical hashes match the controlled manifest after normalizing CRLF to LF; no semantic content change was detected from line-ending conversion.

### 19.2 External Primary References

- [ISO 20022 Message Definitions — pacs.008 FIToFICustomerCreditTransfer](https://www.iso20022.org/iso-20022-message-definitions?business-domain%5B0%5D=1&search=pacs.008)
- [SwiftRef Standing Settlement Instructions Directory](https://www.swift.com/products/swiftref-standing-settlement-instructions-directory)
- [Swift PMPG Document Centre — Cover Payments Market Practice Guidance](https://www.swift.com/es/node/8471?category%5B0%5D=168961&sort%5Bname%5D=ASC)
- [Swift PMPG Document Centre — current Cover Payments guidance entry](https://www.swift.com/es/node/8471?category%5B0%5D=168961&sort%5Bname%5D=ASC)

These references establish the message/catalogue and bank SSI/cover-payment context. A 2025 draft was consulted only as background and is not accepted as 2026 production-rule evidence. Final production field-level, correlation and cardinality rules require the licensed/current SR2026 MRG, CBPR+ Usage Guidelines, current PMPG guidance and applicable NVR evidence to be registered with exact page/rule/SHA before implementation.

## 20. Approval Record

| Role | Name/Agent | Artifact SHA | Verdict | Date |
| --- | --- | --- | --- | --- |
| BA Maker | Pending controlled assignment | Pending | NOT_SIGNED | — |
| Independent BA Checker | Pending controlled assignment | Pending | NOT_SIGNED | — |
| QA Checker | Pending after TDD | Pending | NOT_EXECUTED | — |
| Product Owner | Pending | Pending | OPEN | — |

This document is a peer-reviewed proposal, not a release approval. Any edit changes its SHA and invalidates prior sign-off.
