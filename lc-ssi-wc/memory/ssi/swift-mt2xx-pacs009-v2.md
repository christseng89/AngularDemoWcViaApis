# MT202 / MT202COV / MT205 / MT205COV ↔ pacs.009 — Durable Memory v2.1

Version: 2.1  
Created: 2026-09-12  
Status: CORRECTION PENDING — v2 acceptance superseded; v2.1 awaits BA/QA Four-eyes  
Scope: executable MT202, MT202COV, MT205 and MT205COV flows, including third-party MT↔MX conversion

## 1. Scope boundary

This memory covers only:

- MT202 → pacs.009 plain.
- MT202COV → pacs.009 COV.
- MT205 → pacs.009 plain, with the initial MT200/MT201 provenance rule where applicable.
- MT205COV → pacs.009 COV, without applying the MT205-only initial MT200/MT201 equivalence rule.
- `BOOK_TRANSFER_SAME_RECEIVER` and `CREDIT_ONE_OF_SEVERAL_AT_57A` are valid for
  plain MT202 and may also describe the Sequence A settlement leg of MT202COV
  when the message remains a genuine cover payment with complete COV structure.
- `INITIAL_MT200_201_EQUIVALENCE` only for MT205.
- `NO_MT200_201_EQUIVALENCE` only for MT205COV.

MT204 / `SENDER_BENEFICIARY_DIRECT_DEBIT` is outside this file because its ISO 20022 target is pacs.010, not pacs.009. No MT204 rule may be inherited from this memory.

## 2. Knowledge categories

Every statement in this file belongs to one of four categories:

- **Normative rule**: extracted from the identified SWIFT MRG or CBPR+ Usage Guideline.
- **BA ruling**: an interpretation applied to the controlled business scenario and data facts.
- **QA invariant**: an acceptance condition derived from normative rules and BA rulings.
- **Product policy / observation**: implementation-specific behavior; it is not a SWIFT rule and must carry its own test or evidence identity.

## 3. Controlled source identities

### Category 2 MRG

| File                      | Role                                 | Pages | SHA-256                                                            |
| ------------------------- | ------------------------------------ | ----: | ------------------------------------------------------------------ |
| `SWIFT/us2m_20260717.pdf` | SR2026 readiness/UAT baseline        |   211 | `64483D7F7C094DB28E03791AB6BBC7A0522DAEC90487A7DD834228E848FA8323` |
| `SWIFT/us2m_20250718.pdf` | SR2025 retained compatibility source |   211 | `820581F85FC9EFA34A56F1A54FE66DDA684C6C2FFE9533E38F096A2176B9845C` |

Release-source precedence is deterministic:

1. Use the corresponding SR2026 rule and artifact whenever it exists.
2. Use SR2025 only as a compatibility fallback when the required SR2026 rule or
   artifact is absent and the customer/channel/third-party MT↔MX converter
   contract requires that legacy behavior.
3. An explicit SR2026 deprecation, prohibition or changed rule is authoritative;
   SR2025 must never be used to resurrect behavior that SR2026 removed.
4. Never merge individual SR2025 and SR2026 rules silently. Evidence must record
   the selected release, filename, SHA, converter version/profile and the exact
   fallback reason.

For MT202, MT202COV, MT205 and MT205COV base NVRs, SR2026 is present and is the
active source; SR2025 is not used for those rules.

### CBPR+ pacs.009.001.08 SR2026 Usage Guidelines

Long guides are the field-level authority. Short guides are retained for overview only.

| Profile | Business service        | Guide | Filename                                                                                                             | SHA-256                                                            |
| ------- | ----------------------- | ----- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| plain   | `swift.cbprplus.04`     | long  | `SWIFT/CBPRPlus_SR2026_(Combined)_CBPRPlus-pacs_009_001_08_FinancialInstitutionCreditTransfer_20260521_0643.pdf`     | `4B9436D21B141C5CEF75ACFFAE961B5130FEAD9B95C1B9CD144197DAA7EA6585` |
| plain   | `swift.cbprplus.04`     | short | `SWIFT/CBPRPlus_SR2026_(Combined)_CBPRPlus-pacs_009_001_08_FinancialInstitutionCreditTransfer_20260522_0127.pdf`     | `2373FC20D5AB13219C7F3A503B1FA217D4419389FE42394BBF3455D8F97FBA28` |
| COV     | `swift.cbprplus.cov.04` | long  | `SWIFT/CBPRPlus_SR2026_(Combined)_CBPRPlus-pacs_009_001_08_COV_FinancialInstitutionCreditTransfer_20260521_0643.pdf` | `745B302A700C785CAE1E5F630CC906F41DF31C1E5727BF03EF591F0AD1CFA0A1` |
| COV     | `swift.cbprplus.cov.04` | short | `SWIFT/CBPRPlus_SR2026_(Combined)_CBPRPlus-pacs_009_001_08_COV_FinancialInstitutionCreditTransfer_20260522_0129.pdf` | `7B447CD7AE29DA8BED5460DC82235641AE66A5746D49F31A0952E1E62722F58A` |
| ADV     | `swift.cbprplus.adv.04` | long  | `SWIFT/CBPRPlus_SR2026_(Combined)_CBPRPlus-pacs_009_001_08_ADV_FinancialInstitutionCreditTransfer_20260521_0643.pdf` | `8F76D4071F67FC2AC2996B6BED68F2F2D1388FEB3CF14B83353ECF3B7F785CE1` |
| ADV     | `swift.cbprplus.adv.04` | short | `SWIFT/CBPRPlus_SR2026_(Combined)_CBPRPlus-pacs_009_001_08_ADV_FinancialInstitutionCreditTransfer_20260522_0131.pdf` | `4BBEAAA0D1C1173BBC9045990D2A6C795E8B58959C23C2F6D15855A9AE268668` |

All three profiles use `pacs.009.001.08`. Profile selection must therefore use the business scenario and BAH `BizSvc`, never `MsgDefIdr` or MT code alone.

## 4. Profile invariants

### pacs.009 plain

- `BizSvc=swift.cbprplus.04` — plain long guide p.16.
- Main `CdtrAcct` is documented at p.85.
- The `UnderlyingCustomerCreditTransfer` container is removed at p.89. A `CdtrAcct` shown at p.101 is inside that removed container and is not a usable plain-profile mapping.
- `SttlmAcct` is documented at p.259–260; p.260 explicitly identifies MT 53B as a synonym.
- `SttlmMtd` permits INDA/INGA; CLRG and COVE are removed at p.338–339.

### pacs.009 COV

- `BizSvc=swift.cbprplus.cov.04` — COV long guide p.17.
- Main `CdtrAcct` is documented at p.98.
- The underlying-customer block is mandatory at p.101; its own `CdtrAcct` is documented at p.123.
- `SttlmAcct` is documented at p.319–320; p.320 explicitly identifies MT 53B as a synonym.
- `SttlmMtd` permits INDA/INGA, not COVE — p.404–405.
- The word “COV” in the profile name does not imply `SttlmMtd=COVE`.

### pacs.009 ADV exclusion guard

ADV is not one of the four executable MT flows in this memory, but it must remain an explicit routing guard because it has the same `MsgDefIdr`:

- It is cover pre-advice and does not itself perform clearing or settlement — ADV long guide p.3.
- `BizSvc=swift.cbprplus.adv.04` — p.15.
- Main `CdtrAcct` is documented at p.84; the underlying block is removed at p.88.
- `SttlmAcct` is removed at p.215 even though a synonym annotation exists.
- `SttlmMtd=COVE` only — p.285–286.
- ADV must never create a settlement posting; the later CORE pacs.009 performs settlement.

## 5. MT202 plain rules

Normative anchors in `us2m_20260717.pdf`:

- p.39–40: MT202 plain scope and usage; it must not carry cover underlying-customer content.
- p.40: for transfer between two Sender-owned accounts serviced by the Receiver, 53B identifies the debit account and 58A identifies the credit account plus Sender.
- p.46: when multiple direct account relationships exist in the transaction currency and one account is used for reimbursement, 53a must use Option B with Party Identifier only. Omission of both 53a and 54a implies a single direct account relationship.
- p.52: omission of 57a means the Receiver is also the Account With Institution.
- p.54: in the specified own-account scenarios, 58A Option A carries the credited account and Sender.

### Generic reimbursement ruling

When a generic MT202 selects one eligible direct reimbursement account from multiple valid direct account relationships with the actual SWIFT Receiver:

```text
53B = /<selected operational accountReference>
58A = <beneficiary institution BIC>
```

The canonical rendering decision is:

```json
{
  "MT202.53a": {
    "outcome": "INCLUDE",
    "option": "B",
    "renderedTag": "53B",
    "rule": "MRG_MT202_53A_MULTIPLE_DIRECT_ACCOUNTS"
  }
}
```

For generic A1/A2, a Party Identifier in 58A is not mandatory. The reimbursement account belongs in 53B; it must not be moved into 58A.

### Own-account settlement arrangements

- `BOOK_TRANSFER_SAME_RECEIVER`: 53B = own debit account; 58A = own credit account plus Sender; 57a omitted because Receiver is AWI.
- `CREDIT_ONE_OF_SEVERAL_AT_57A`: explicit 57A identifies the different credit-account institution; 58A = credit account plus Sender. Include 53B when the p.46 multiple-direct-account condition applies. A controlled scenario may additionally require 53B for deterministic debit pinning, but that requirement must be identified as a BA/product policy rather than a universal MRG rule.
- For MT202COV, these arrangements are permitted by the Sequence A 58a usage
  rules on MRG p.75 only when cover purpose, field 119=COV, UETR continuity and
  mandatory Sequence B are all present. The arrangement does not convert a
  cover payment into a plain payment.

## 6. MT202COV rules

Normative anchors in `us2m_20260717.pdf`:

- p.59: MT202COV is only for cover of an underlying customer credit transfer and must not be used for another interbank-transfer purpose.
- p.59–60: field 119 is COV. If the underlying customer transfer has a UETR, copy it unchanged; otherwise create a new valid UETR and record its provenance.
- p.60: Sequence B is mandatory.
- p.75: the Sequence A 58a usage rules include transfer between two
  Sender-owned accounts serviced by the Receiver and crediting one of several
  Sender accounts at the institution identified in 57a. These are settlement
  arrangements within a genuine cover payment, not alternative non-cover
  purposes.

QA must reject MT202COV when any of the following occurs:

- A BOOK/own-account arrangement is selected without genuine cover purpose or
  without the complete COV structure required below.
- Underlying-customer context or mandatory Sequence B is absent.
- Field 119 is not COV.
- An existing underlying UETR is not preserved exactly, or an absent underlying UETR does not result in a new valid UETR with generation provenance.
- The profile uses plain or ADV `BizSvc`.

## 7. MT205 plain rules

Normative anchors in `us2m_20260717.pdf`:

- p.134: MT205 scope is further transmission between financial institutions in the same country; it must not be used as a cover message.
- p.136: reference continuity rules apply to the transmitted transaction.
- p.139: where upstream 52a is absent, the initial Sender supplies 52a semantics.
- p.148: when the initial message is MT200 or MT201, MT205 field 58a must be identical to MT205 field 52a.

`INITIAL_MT200_201_EQUIVALENCE` must be triggered by preserved upstream message provenance. Equality of 52a and 58a alone must never be used to infer that the initial message was MT200/MT201.

## 8. MT205COV rules

Normative anchors in `us2m_20260717.pdf`:

- p.153: MT205COV only further-transmits MT202COV, MT205COV or an equivalent cover payment; field 119 is COV and the underlying-customer sequence is mandatory.
- p.155: MT205COV usage rules and cover continuity apply.
- p.168: MT205COV 58a rules apply to this profile.

`NO_MT200_201_EQUIVALENCE` means the MT205 p.148 rule must not be applied. QA must still verify Sequence A 52a/58a and the complete Sequence B independently.

## 9. MT↔MX mapping rules

There is no universal one-to-one tag-to-XPath mapping.

- MT option letters are semantic evidence: 53A/53B/53D, 57A/57B/57D and 58A/58D are not interchangeable.
- Presence versus omission is semantic evidence and must survive conversion.
- Sequence A/B provenance must be retained; unqualified `52a`, `57a` or `72` paths are unsafe for COV.
- The 53B↔`SttlmAcct` synonym annotation exists in plain p.260, COV p.320 and ADV p.215. It is usable only in plain/COV because ADV removes `SttlmAcct`.
- No reviewed MRG/UG source proves that every MT 58A Party Identifier universally maps to MX `CdtrAcct`. The mapping must use scenario semantics, selected profile and a recorded converter contract.
- MT202 and MT205 may both target pacs.009 plain. Reverse conversion must retain the source MT type and upstream context; the ISO payload alone may not reconstruct them reliably.

## 10. Third-party converter contract and evidence

Every conversion execution must record:

- source MT type, raw MT bytes/hash and MRG filename/SHA/release;
- target MX bytes/hash, Usage Guideline filename/SHA and profile;
- BAH `BizSvc`, `MsgDefIdr`, UETR and source/target direction;
- converter product, version, configuration hash and mapping-profile identity;
- MT field option, presence/omission and Sequence A/B identity;
- MX XPath values with profile-qualified paths;
- canonical roles and account identities, including selected `nostroId + version` and operational `accountReference`;
- value date, currency and relevant BIC identities.

Run both `MT→MX→MT` and `MX→MT→MX` semantic comparisons. Raw bytes and hashes remain evidence, but byte identity is required only when the converter contract explicitly promises it. Acceptance requires preservation of economic/account semantics and a profile-valid target, not merely the presence of tags or paths.

The selected SR2025/SR2026 rule set follows the source-precedence policy in
section 3 and must remain compatible with the explicit
customer/channel/converter contract and network release. Unknown converter
versions, missing fallback reasons, missing configuration provenance or release
mismatch invalidate the evidence.

## 11. Data-quality invariants

- FIN account Party Identifiers and MX operational account fields must use the selected row's valid `accountReference`; `maskedAccountRef` is display data and must not be substituted.
- A selected NULL, blank or whitespace-only `accountReference` fails closed.
- Multiple-direct-account cardinality counts distinct normalized operational account references within the same own entity, actual Receiver/servicer, currency, value-date validity, ACTIVE status and eligible purpose/applicability.
- Duplicate rows with one operational account do not create multiple MRG direct relationships.
- Ranking and negative fixtures must be declared and isolated; unclassified synthetic rows remain `DQ-REVIEW`.

Product HTTP policy when a required operational account cannot be established:

- DEVELOPMENT/DEMO: HTTP 409 `INCORRECT_SSI_CONFIGURATION`.
- Other environments: HTTP 500.
- Both branches must produce no payload, no confirmed resolution and no Repair Queue submission, and must have automated evidence.

The HTTP split is product policy, not a SWIFT MRG rule.

## 12. Minimum QA matrix

1. MT202 generic: single direct account omission decision; multiple direct accounts with 53B; missing operational account fail closed.
2. MT202 BOOK: correct debit/credit accounts; same rendered account collision; currency mismatch; Receiver/servicer mismatch.
3. MT202 explicit 57A: 57A differs from Receiver; 58A credit/Sender is preserved; 53B debit is asserted when the p.46 multiple-direct-account condition applies, or when an explicit BA/product policy requires deterministic debit pinning. Any unconditional double-pin requirement must be labelled as product policy.
4. MT202COV: valid field 119/UETR/Sequence B; the two p.75 own-account
   settlement arrangements accepted only with complete genuine-cover context,
   and rejected when that context is absent or incomplete.
5. MT205: same-country further transmission; non-cover constraint; initial MT200/201 52a=58a based on upstream provenance.
6. MT205COV: valid cover provenance and Sequence B; MT200/201 equivalence rule not applied.
7. Profile routing: identical `MsgDefIdr` with different `BizSvc` must select different profiles; profile change with unchanged payload is a failure.
8. Round-trip: option letters, omission, source MT type, A/B sequence, account identity and UETR remain semantically stable.
9. Versioning: SR2025/SR2026 mismatch or unknown converter configuration fails evidence validation.

## 13. Controlled records and volatile observations

Durable rulings:

- `qa/reports/latest/mt2/BA-MRG-MT202-53A-RULING-20260912.md`
- `qa/reports/latest/mt2/BA-DQ-NOSTRO-CONFIRMATION-20260912.md`

Independent product observations and raw JSON are maintained under:

- `qa/reports/latest/mt2/claude-independent-20260912/`

Product findings such as K1–K8 are time-bound observations, not permanent MRG knowledge. They must remain in a build/commit-specific report with its evidence SHA and must not be copied into the normative sections of this memory.

## 14. Maintenance rule

Whenever an MRG, Usage Guideline, converter or mapping profile changes:

1. Record filename, SHA, release and page anchor.
2. Re-evaluate profile routing and scenario eligibility.
3. Re-run the minimum QA matrix and both round-trip directions.
4. Update this file by new version; do not silently overwrite a controlled prior version.

## 15. v2.1 correction record

Version 2.1 corrects the derivative v2 statement that treated the two
own-account arrangements as universally invalid for MT202COV. The controlling
authority is `SWIFT/us2m_20260717.pdf` p.75, read together with pp.59–60. The
correction is deliberately narrow: it does not relax cover-purpose, 119=COV,
UETR, Sequence B, profile-routing or evidence requirements. This change
requires independent BA/Checker approval before release sign-off.

It also records the customer-approved compatibility precedence: SR2026 first;
SR2025 only for a genuinely absent SR2026 rule/artifact required by a controlled
third-party MT↔MX profile. Explicit SR2026 deprecation remains controlling.
