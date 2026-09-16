# MT1xx／pacs.008 Customer Payment Instructions and Bank SSI Scope Proposal

**狀態：CONTROLLED DRAFT — BA／QA SAME-BUNDLE REVIEW PENDING；IMPLEMENTATION NOT AUTHORIZED**  
**版本：v0.6 DRAFT — PHASE-1 DETERMINISTIC MATRIX CONSOLIDATION**  
**日期：2026-09-16**  
**前版：** `MT1XX_PACS008_CUSTOMER_PAYMENT_INSTRUCTIONS_PROPOSAL_v0.5_DRAFT.md`  
**前版 raw SHA-256：** `E21167BDADF315D15D92FAD2023F5C83ECB323C81655935C7A081D9F0F6F9D02`

> v0.6 不擴大 v0.5 scope。它把兩項 Phase-1 OPEN 收斂為可轉入 TDD Test Oracle 的獨立 deterministic matrix。Matrix 尚待 Independent BA Checker、QA 與 Product Owner 對 exact SHA 核准，因此本版仍不得實作。

## 1. Proposed decision

SSI applicability 以 **current FI-to-FI settlement leg** 判定，不以整個 MT/MX message code 判定。Customer Payment Instructions（CPI）不是 Bank SSI；只有由銀行控制的 settlement/reimbursement account relationship、correspondent/reimbursement role 和 complete route 可進 SSI Resolver。

Canonical resolution model remains:

```text
Scenario
+ Settlement Context
+ Customer Chain Topology
+ Settlement/Cover Route Topology
+ Correspondent Relationship
+ Currency / Booking Entity / Value Date / Creditor Destination
+ Current Hop / Ordered Route Legs
→ Required SSI Roles
→ Eligible Atomic Complete Route
```

`Scenario != Settlement Context != Route Topology`。INDA/INGA 是每個 `currentHop`/`routeLeg` 的 account relationship，不是整條多跳路徑的全域標籤。

## 2. Frozen scope

### 2.1 Phase 1

| Profile | Status |
|---|---|
| MT103 | `PHASE_1_IN_SCOPE` |
| MT103 STP | `PHASE_1_IN_SCOPE` |
| MT103 REMIT | `PROPOSED_PHASE_1_IN_SCOPE`; exact community/MUG/profile row未核准時 `UNSUPPORTED_PROFILE` |
| pacs.008.001.08 plain, `swift.cbprplus.04` | `PHASE_1_IN_SCOPE` |
| pacs.008.001.08 STP, `swift.cbprplus.stp.04` | `PHASE_1_IN_SCOPE` |

Phase 1 只涵蓋 Bank-controlled settlement portion，不涵蓋完整 message composition、full FIN/NVR validation、Customer Party/account、amount、purpose、remittance、FX、charges、compliance、RMA 或 payment execution。

### 2.2 Future — SSI-applicable, not authorized

| Profile | Status |
|---|---|
| MT102 / MT102 STP settlement portion | `DEFERRED_NOT_AUTHORIZED` |
| MT104 Direct Debit with Sequence C | `DEFERRED_NOT_AUTHORIZED` |
| MT107 FI-to-FI settlement portion | `DEFERRED_NOT_AUTHORIZED` |

Future profiles do not enter the Phase-1 executable denominator and return `UNSUPPORTED_PROFILE` until separately authorized.

### 2.3 Out of scope — closed

- MT101 as a Phase-1 SSI message;
- Customer/corporate-to-bank initiation and mandate;
- FI-to-FI MT104 Request without Sequence C;
- Customer data represented as SSI;
- full message population/conversion and full network validation;
- direct-debit lifecycle, accounting, FX/pricing, compliance and release gates.

## 3. Deterministic matrix contracts

### 3.1 OPEN-01 — Creditor Destination Authority & Repair

Authoritative file:

`docs/proposals/MT1XX_PACS008_CREDITOR_DESTINATION_AUTHORITY_REPAIR_MATRIX_v0.1_DRAFT.md`

Draft raw SHA-256:

`F18FEC54B2A61B2DFF9607543294D447BB323F31A95F75A572A49FDED68998D2`

Core rulings:

1. Creditor Destination is a transaction/reference-derived endpoint, not SSI.
2. Authority classes distinguish `AUTHORITATIVE` and `DERIVED_REPAIRED`; `REQUESTED_PREFERRED` is a route-only constraint and is never Creditor Destination authority.
3. Authoritative conflict fails closed; SSI/route may not silently replace customer instruction.
4. Automatic normalization is limited to the same uniquely proven stable legal/servicing identity.
5. Governed repair preserves original/effective values, approval, rule, reason, timestamp, CPI snapshot SHA and invalidates stale route/screening evidence.
6. Exactly one canonical Creditor Destination is required before SSI lookup.

OPEN-01 remains `OPEN — PENDING INDEPENDENT BA CHECK / QA / PO`.

### 3.2 OPEN-02 — Scenario × Context × SSI Role

Authoritative file:

`docs/proposals/MT1XX_PACS008_SCENARIO_CONTEXT_SSI_ROLE_MATRIX_v0.1_DRAFT.md`

Draft raw SHA-256:

`E409BE0882A1D3FB9873AE3D5C835A097D4D9CFE8DB13D4E81A048824F760C0F`

The contract is deliberately four-layered:

1. **Matrix A — Profile Eligibility:** exact message/profile/BizSvc/community/MUG and settlement-leg gate;
2. **Matrix B — Settlement Context:** INDA/INGA/COVE owner/servicer and SSI-role requirements;
3. **Matrix C — Route Topology:** direct, same-exact-servicer, intermediated and cover complete-route outcomes.
4. **Matrix D — Authoritative Composition:** every supported profile/context/topology combination links to exact B/C rows, canonical roles, prohibited roles and a single success/failure outcome.

Role requirement enum:

```text
REQUIRED
OPTIONAL
NOT_REQUIRED
PROHIBITED
REFERENCE_DATA_REQUIRED
```

`NOT_REQUIRED` is not `PROHIBITED`. Frozen Phase 1 does not approve CLRG; therefore CLRG returns `UNSUPPORTED_PROFILE`, not `REFERENCE_DATA_REQUIRED`.

Core relationship rules:

```text
INDA
Account Owner    = Instructing Agent
Account Servicer = Instructed Agent

INGA
Account Owner    = Instructed Agent
Account Servicer = Instructing Agent
```

Every COVE/intermediated leg independently satisfies its relationship. COVE distinguishes Own, Counterparty and actual Third reimbursement agent/account roles. One missing/invalid leg invalidates the whole candidate; partial resolution is prohibited. UI/client may select only an indivisible `routeBindingId` under one `snapshotToken`.

`SSI_NOT_REQUIRED` is permitted only when an approved profile/policy supplies a versioned external `bilateralRelationshipEvidenceId`, validated for exact identity/currency/entity/date, and the Resolver performs no SSI lookup/account selection. Omission of an MT/MX account element is not proof that SSI is unnecessary.

OPEN-02 remains `OPEN — PENDING INDEPENDENT BA CHECK / QA / PO`.

## 4. Required negative Test Oracle

| ID | Condition | Required outcome |
|---|---|---|
| `P1-NEG-01` | Authoritative CPI destination conflicts with derived destination | `CREDITOR_DESTINATION_CONFLICT` |
| `P1-NEG-02` | Two equally eligible Counterparty SSI routes | `AMBIGUOUS_ROUTE` |
| `P1-NEG-03` | INDA and account owner differs from Instructing Agent | Candidate invalid; no alternative → `NO_ELIGIBLE_SSI` |
| `P1-NEG-04` | INGA and account servicer differs from Instructing Agent | Candidate invalid; no alternative → `NO_ELIGIBLE_SSI` |
| `P1-NEG-05` | One intermediated route leg is invalid/missing | Whole route invalid; never partial `RESOLVED`; no alternative → `NO_ELIGIBLE_SSI` |

These tests close no OPEN by themselves; they become executable only after exact-matrix approval and TDD authorization.

## 5. Typed outcomes

Destination-stage enum:

- `CREDITOR_DESTINATION_CONFIRMED`
- `CREDITOR_DESTINATION_NORMALIZED`
- `CREDITOR_DESTINATION_DERIVED`
- `CREDITOR_DESTINATION_CONFLICT`
- `CREDITOR_DESTINATION_REPAIR_REQUIRED`
- `INVALID_CREDITOR_DESTINATION`
- `CREDITOR_DESTINATION_MISSING`
- `AMBIGUOUS_CREDITOR_DESTINATION`
- `UNSUPPORTED_PROFILE`

Resolver-stage enum:

- `BANK_TO_BANK_SSI_REQUIRED`
- `ELIGIBLE_COMPLETE_ROUTE`
- `SSI_NOT_REQUIRED`
- `REFERENCE_DATA_REQUIRED` only for a future explicitly approved profile
- `NON_BANK_LEG_OUT_OF_SCOPE`
- `BANK_TO_BANK_NON_SETTLEMENT_LEG_OUT_OF_SCOPE`
- `NO_ELIGIBLE_SSI`
- `AMBIGUOUS_ROUTE`
- `STALE`
- `INVALID_CONTEXT_TOPOLOGY`
- `UNSUPPORTED_PROFILE`

Destination-stage and Resolver-stage outcomes are separate typed fields. OPEN-01 cannot emit route-policy outcomes; OPEN-02 cannot silently change a successful destination.

## 5.1 Controlled local UI endpoint

For development and BA/QA browser UAT in this workspace, Angular/UI uses `http://localhost:4600`. Port `4400` is obsolete. This is an operational environment setting, not an SSI business-rule input and must not affect matrix decisions or snapshot identity.

## 6. Source register

| Source | SHA-256 | Use |
|---|---|---|
| `SWIFT/us1m_20260717.pdf` | `54002BDF2140563A543DE330283EE7BC64C0724DC69499326CE34F70A7E90E70` | SR2026 MT1 MRG roles, sequences and conditional settlement evidence |
| pacs.008 plain SR2026 UG | `F563E3478ED76329DB2400BC1E58BE5D345C499DABEB4C4561A7A8E1D15566B3` | plain profile and agent/account roles |
| pacs.008 STP SR2026 UG | `D9807C95700CCFBFB6AAD03CE40AE32213F75B805A683937EB4BBD296EEF23F6` | STP profile and agent/account roles |
| Proposal v0.5 | `E21167BDADF315D15D92FAD2023F5C83ECB323C81655935C7A081D9F0F6F9D02` | Frozen scope and full MRG recheck findings inherited by v0.6 |
| Memory v2 draft | `B74B46E1A5962DEE7E629CA61B9C0E5A4B208AD0290724BBF8F36301AA5CC080` | Current governed context model |

The detailed v0.5 MRG findings remain incorporated by exact SHA; v0.6 changes neither their evidence nor their scope conclusion.

## 7. Approval and bundle lifecycle

BA Maker, Independent BA Checker, QA and Product Owner review one frozen artifact bundle. Proposal v0.6, OPEN-01, OPEN-02, review report and memory each retain an independent SHA-256; the Bundle Manifest locks their correspondence. Different artifacts do not share one SHA.

| Gate | Current status |
|---|---|
| Proposal v0.6 Maker draft | COMPLETE |
| OPEN-01 Maker draft | COMPLETE |
| OPEN-02 Maker draft | COMPLETE |
| Independent BA Checker on exact SHAs | PENDING |
| QA Reader/Test Oracle review on exact SHAs | PENDING |
| Product Owner approval of exact bundle | PENDING |
| Implementation authorization | `NOT_AUTHORIZED` |

Any change to Proposal or either matrix invalidates its prior signatures and the bundle review. v0.5 remains the frozen predecessor until v0.6 is accepted; only then may v0.5 be moved to `qa-archived`.
