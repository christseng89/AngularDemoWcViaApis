# MT1xx / pacs.008 SR2026 SSI Memory — v1

**Status:** CONTROLLED DRAFT — source review complete; BA/QA sign-off pending  
**Prepared:** 2026-09-13  
**Scope:** MT101, MT102, MT102 STP, MT103, MT103 REMIT, MT103 STP, MT104, MT107 and CBPR+ pacs.008 plain/STP  
**Architecture:** `Configuration / DB -> API -> Page parameter model -> Generic UI`

## 1. Authority and evidence discipline

Every normative statement must cite the official file name, SHA-256 and PDF page. Internal workbooks are business inputs, not substitutes for SWIFT MRG or CBPR+ Usage Guidelines.

| Source | SHA-256 | Controlled use |
|---|---|---|
| `MT1支援標準SSI_v3_MRG覆核版.xlsx` | `D5DD5EFE1A1B39062FD7F92157E6FEEA447D58A1E1A33861E79750B8E3836F0F` | Internal scope hypothesis and prior review record |
| `us1m_20260717.pdf` | `54002BDF2140563A543DE330283EE7BC64C0724DC69499326CE34F70A7E90E70` | SR2026 Category 1 normative MRG |
| `CBPRPlus_SR2026_(Combined)_CBPRPlus-pacs_008_001_08_FIToFICustomerCreditTransfer_20260521_0831.pdf` | `F563E3478ED76329DB2400BC1E58BE5D345C499DABEB4C4561A7A8E1D15566B3` | SR2026 pacs.008 plain Usage Guideline |
| `CBPRPlus_SR2026_(Combined)_CBPRPlus-pacs_008_001_08_STP_FIToFICustomerCreditTransfer_20260522_0133.pdf` | `D9807C95700CCFBFB6AAD03CE40AE32213F75B805A683937EB4BBD296EEF23F6` | SR2026 pacs.008 STP Usage Guideline |

Knowledge is classified as one of: **normative rule**, **BA ruling**, **QA invariant**, or **product policy**. Do not merge those categories.

## 2. Scope ruling proposed for BA confirmation

| Message/profile | Proposed classification | Reason |
|---|---|---|
| MT103 | `IN_SCOPE` | Customer credit transfer containing reimbursement and agent-chain fields 52a–57a. MRG scope/format/NVR/usage: `us1m_20260717.pdf`, SHA `54002BDF...E90E70`, pp.171–181. |
| MT103 REMIT | `IN_SCOPE` | Same settlement/agent semantics with additional remittance envelope. MRG: same file/SHA, pp.255–265. |
| MT103 STP | `IN_SCOPE` | Same customer-payment family with stricter option and validation constraints. MRG: same file/SHA, pp.297–307. |
| pacs.008.001.08 plain | `IN_SCOPE` | Official SR2026 CBPR+ customer credit-transfer target; `BizSvc=swift.cbprplus.04`. Plain UG, SHA `F563E347...566B3`, p.10. |
| pacs.008.001.08 STP | `IN_SCOPE` | Official SR2026 STP profile; `BizSvc=swift.cbprplus.stp.04`. STP UG, SHA `D9807C95...23F6`, p.10. |
| MT101 | `REFERENCE_ONLY_PENDING_BA` | It requests execution and may map into an MT103, but is not itself the final customer credit transfer. Its 52a/56a/57a still require correct validation. MRG pp.14–18 and mapping pp.51–64. |
| MT102 / MT102 STP | `PENDING_BA_SCOPE` | Multiple customer credit transfers contain settlement/agent fields. Whether this service resolves them directly or only after transaction splitting must be explicit. MRG pp.71–77 and pp.124–132. |
| MT104 / MT107 | `OUT_OF_PACS008_SCOPE` | Direct-debit families, not FI-to-FI customer credit transfers. MRG scopes pp.356 and 394. They require explicit no-route/no-conversion guardrails. |

The source workbook marks all MT1 rows `OUT_OF_SCOPE`. This new analysis does **not** silently overwrite that decision. MT103/pacs.008 inclusion and MT101/102 treatment remain BA sign-off items in TDD v1.

## 3. Normative MT field semantics

### 3.1 MT101

- Sequence A is general information; repeated Sequence B contains transaction details. `52a` may be in A or B but never both (C6); `56a` implies `57a` (C7). Source: `us1m_20260717.pdf`, SHA `54002BDF...E90E70`, pp.15–18.
- `52a` is Account Servicing Institution; option A is preferred and option C is used for a clearing-system code when no BIC is available. Same source, pp.26–28 and 37–39.
- `56a` is Intermediary and `57a` is Account With Institution. If `57a` is absent, Receiver is the account-with institution. Clearing code placement is coordinated across 56a/57a. Same source, pp.39–45.
- MT101-to-MT103 processing is not a blind field copy: when both 56a and 57a exist, 56a can determine the MT103 Receiver and 57a maps to MT103 57a; when only 57a exists it can determine the MT103 Receiver. Same source, pp.51–64.

### 3.2 MT102 and MT102 STP

- MT102 has common data and repeated transaction detail, with 52a placement mutually exclusive between sequences. Source: `us1m_20260717.pdf`, SHA `54002BDF...E90E70`, pp.71–77.
- MT102 `57a` absence means Receiver is the account-with institution. Same source, pp.100–103.
- Common settlement field `53a` absence means the bilaterally agreed account is used; multiple direct accounts require the chosen reimbursement account to be stated; no direct relationship requires 53a. Same source, pp.111–113.
- MT102 STP has a stricter profile and must be validated against its own format/NVR set, not the base MT102 options. Same source, pp.124–132 and field specifications through p.160.

### 3.3 MT103 / REMIT / STP

- Roles are distinct: `52a` Ordering Institution, `53a` Sender's Correspondent, `54a` Receiver's Correspondent, `55a` Third Reimbursement Institution, `56a` Intermediary Institution, `57a` Account With Institution. Base MT103 field anchors: `us1m_20260717.pdf`, SHA `54002BDF...E90E70`, pp.193–203.
- Base MT103 NVR includes the dependency that 55a requires 53a and 54a, and 56a requires 57a. Source: same file/SHA, pp.173–176.
- Absence of 53a denotes a unique or bilaterally agreed Sender/Receiver account; multiple direct accounts require option B with the party identifier only; no direct account relationship requires 53a. Source: same file/SHA, pp.195–196.
- 54a must not contain a Sender branch; if the institution in 53a services the Receiver, 54a must be absent; a non-Receiver-branch institution in 54a requires 53a. Source: same file/SHA, pp.196–197.
- If 57a is absent, Receiver is the account-with institution. Clearing codes such as `//FW`, `//AU`, `//CP`, `//IN`, `//RT` must occur only once and in the first applicable 56a/57a field. Source: same file/SHA, pp.198–203.
- MT103 REMIT repeats these role semantics but must use its own NVR set; anchors are pp.257–265 and pp.277–287.
- MT103 STP is a distinct profile with stricter option constraints; anchors are pp.297–307 and its field specifications. Do not infer STP from base MT103 by deleting fields in the UI.

## 4. pacs.008 profile and mapping rules

- Both official SR2026 guides fix `MsgDefIdr=pacs.008.001.08`. Profile selection therefore must use the business scenario plus BAH `BizSvc`, not `MsgDefIdr` alone.
- Plain: `BizSvc=swift.cbprplus.04`; plain UG, SHA `F563E347...566B3`, p.10.
- STP: `BizSvc=swift.cbprplus.stp.04`; STP UG, SHA `D9807C95...23F6`, p.10.
- `SttlmAcct` carries the MT 53B settlement-account synonym. Both UGs, p.13.
- Reimbursement roles are distinct: Instructing Reimbursement Agent (53a), Instructed Reimbursement Agent (54a), Third Reimbursement Agent (55a); plain UG pp.14–23 and STP UG pp.14–19.
- Agent chain must preserve ordered roles. Plain provides `PrvsInstgAgt1..3`, `InstgAgt`, `InstdAgt`, `IntrmyAgt1..3`, `DbtrAgt`, and `CdtrAgt`; anchors pp.28–59. STP has the same constrained chain at pp.22–43.
- BAH From/To must be consistent with `InstgAgt`/`InstdAgt`; plain formal rules pp.90–91, STP pp.52–53.
- The repository currently models `pacs.008.001.12`, while the supplied controlled SR2026 guides are `.001.08`. This is an **OPEN version-governance gap**; no test may treat `.001.12` as proven by the `.001.08` guides.

## 5. SSI ownership boundaries

| Concern | Owner |
|---|---|
| Select active SSI and Nostro from entity/receiver/currency/effective date/purpose | SSI resolution API |
| Determine MT option and render account/BIC from controlled data | SSI mapping/composer |
| MT NVR such as 55a→53a+54a and 56a→57a | Upstream FIN validator; API may pre-validate but must not fake validator evidence |
| MT↔MX role mapping and BAH/agent consistency | Converter/profile mapper |
| Customer parties 50a/59a and transaction amounts/references | Transaction payload, not standing SSI |
| UI control visibility and values | API page-parameter model only |

## 6. Data-quality invariants

- Message account values use active `accountReference`; `maskedAccountRef` is display-only and cannot substitute.
- A selected reimbursement or agent account with NULL/blank `accountReference` fails closed.
- Multiple-account logic counts distinct normalized account references in the same entity/receiver/currency/effective-date/purpose scope; duplicate rows for one account do not create multiplicity.
- Ambiguous or missing mandatory SSI produces no MT/MX payload, no confirmed resolution and no Repair Queue side effect.
- DEV/DEMO data-quality failure returns 409 `INCORRECT_SSI_CONFIGURATION`; other environments return structured 500. This is product policy, not SWIFT MRG.
- Positive, negative and boundary fixtures are isolated and versioned. QA and browser UAT must use the same fixture ID and logical snapshot identity.

## 7. Required evidence

- Every JSON review begins with the full top-level + `mx` + `mt` key tree.
- Each test records request/response raw JSON, HTTP status, rule owner, fixture identity/version, logical DB snapshot identity and rendering decisions.
- MT and MX assertions must compare role identity, BIC, account reference, omission reason and profile identity; presence-only assertions are insufficient.
- Upstream FIN-validator cases remain `NOT_EXECUTED` until real validator evidence exists.
- Browser UAT is required for all executable positive and negative cases after DB reload; static bundle inspection is not a substitute.

## 8. Open BA decisions

1. Confirm whether MT103/REMIT/STP are formally in the SSI microservice scope despite the source workbook's earlier all-MT1 exclusion.
2. Confirm MT101 as reference-only/no-SSI-resolution or define a controlled pre-execution resolution contract.
3. Decide whether MT102/102 STP are resolved as a message, split per transaction, or remain with the existing payment engine.
4. Resolve official product version: supplied SR2026 UG `.001.08` versus repository `pacs.008.001.12`.
5. Confirm whether plain and STP share one canonical route snapshot while retaining separate profile/validation rules.

## 9. Implementation rule

Engineering must implement from the controlled TDD and this memory through the repository-wide flow `Configuration / DB -> API -> Page parameter model -> Generic UI`. Adding MT1/pacs.008 must be configuration-driven and must not add MT-specific UI branches.
