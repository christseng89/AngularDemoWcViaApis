# MT3xx / MT4xx / MT7xx SSI-Related FIN Profiles — Durable Memory

Version: 2  
Created: 2026-09-12  
Status: CONTROLLED DRAFT — BA source review completed; QA execution evidence pending  
Scope: the 25 FIN messages approved for the SSI Workbench Treasury and Trade Finance catalogue

## 1. Scope boundary

`MT347` is an internal project label for the approved Category 3, Category 4 and Category 7 workstream. It is not a SWIFT FIN message type.

This memory covers only the SSI-relevant FIN 5x field profiles of:

- MT300, MT304, MT305, MT306, MT320, MT330, MT340, MT341, MT350, MT360, MT361, MT362, MT364 and MT365.
- MT400.
- MT730, MT734, MT742, MT750, MT752, MT754, MT756, MT765, MT768 and MT769.

It does not declare that every 5x field is populated from SSI or that every displayed message is end-to-end executable. Category 3 confirmations carry settlement instructions but are not themselves funds-transfer messages. Category 4 and Category 7 business messages may trigger or accompany a separate payment; their 5x roles do not make the whole message a payment instruction.

## 2. Knowledge categories

- **MRG verified**: message scope and 5x slot independently matched against the identified SR2026 MRG page.
- **SSI-supported**: the slot may reuse a controlled standing route/account candidate in the stated business function and sequence.
- **Transaction-context**: the field identifies a party or beneficiary from the transaction, not a reusable SSI route.
- **Hybrid source**: party identity is transactional while an account component may require controlled standing data.
- **Product observation**: current code, data or UI behaviour, not a SWIFT rule.

## 3. Controlled source identities

| File | Authority | Pages | SHA-256 |
|---|---|---:|---|
| `SWIFT/us3ma_20260717.pdf` | Category 3 Volume 1, MT300–MT341, SR2026 | 774 | `5B4315EF876FF32C416BF445C0ADB063D6E0A1600EF93F55DF73F98A175457E5` |
| `SWIFT/us3mb_20260717.pdf` | Category 3 Volume 2, MT350–MT399, SR2026 | 635 | `BC510604859CF7C5FE43A90176889AD21050ECE964A6244EBD92AC6E50FAF861` |
| `SWIFT/us3u_20260717.pdf` | Category 3 common usage rules, SR2026 | 65 | `92F6F7E6D1D7EB1EEA1BFB753ADA171D4099FA5215BA13D130C2E17494EB0E90` |
| `SWIFT/us4m_20260717.pdf` | Category 4 Collections, SR2026 | 115 | `71F865223FD74B19DD5AE721AA84F0288259A1C28600A5B8F8252346BAC1C06B` |
| `SWIFT/us7m_20260717.pdf` | Category 7 Documentary Credits and Guarantees, SR2026 | 443 | `1F748A8262E5528F6C9BD59DDD5FF1A992542CFCF25D0E8DA528241D12FEA2A4` |
| `qa/tdd/mt347/MT347_SR2026_SSI_QA_Test_Plan_v4.xlsx` | Original QA case plan | — | `1FDF15CFF1E78B0A6A3813163E6ADDD76517C0A045B240665003B249F2C5EFF5` |
| `qa/tdd/mt347/SWIFT_SR2026_MT3_MT4_MT7_SSI_分析_中文版_v5.xlsx` | BA analysis matrix | — | `C3EC8EB1A5B256C51D707BE342C079DB9DEBE304B03B562046CBAF1C459BECD2` |
| `SWIFT_SR2026_MT3_MT4_MT7_SSI_分析_中文版_v7.docx` | Approved internal BA scope ruling dated 2026-09-08 | — | `1A0B5CDBD6CC3F00CE13C8C978E445D2A54728A956B0240661FFE79230E2B985` |
| `qa/tdd/mt347/MT347_SR2026_SSI_TDD_CONTROLLED_v2.xlsx` | Prior controlled TDD baseline | — | `F72046E654068D516BD3CC35853580F194973AEFE17E913E775FC93569B7E60C` |
| `memory/swift-mt347.md` | Superseded memory v1 | — | `F1B413E13253432E5153CA9EEC9D082460A897CAC4640E1288D8A2DDF1CCF490` |

SR2026 becomes effective with the November 2026 standards release; production use before that date must follow the explicitly contracted active FIN release.

## 4. Category 3 business boundary

`SWIFT/us3ma_20260717.pdf` p.6 states that Category 3 confirmations confirm already agreed contract information and are not used to transfer funds. Therefore an SSI candidate may populate only the exact settlement-instruction sequence and leg shown below. It must not turn a confirmation into a payment order or flatten two currency/party legs into one route.

### FX and options — Volume 1

| MT | MRG scope | Verified SSI-related 5x slots and format page |
|---|---|---|
| MT300 Foreign Exchange Confirmation | p.14: confirms FX contract/post-trade events | B1 Bought: `53a A/J` O, `56a A/J` O, `57a A/J` M; B2 Sold: same plus `58a A/J` O — p.18. Split settlement D: `53a/56a/58a A/D/J` O, `57a A/D/J` M — p.19. |
| MT304 Third Party Deal Advice/Instruction | p.122: fund manager instructs/advises custodian settlement | B1 Bought: `53a A/J` M, `56a/57a A/J` O; B2 Sold: `53a/56a/58a A/J` O, `57a A/J` M — p.124. Net E: `53a/56a A/D/J` O p.125; `57a/58a A/D/J` O p.126. |
| MT305 Foreign Currency Option Confirmation | p.194: confirms an option contract | General A: `53a A/J` O Sender's Correspondent, `56a A/J` O Intermediary, `57a A/J` M Account With Institution — p.195. |
| MT306 Foreign Currency Option Confirmation | p.256: confirms averaging forwards/options | Premium C: `53a/56a/58a A/J` O, `57a A/J` M — p.262. Binary payout E: same — p.263. Additional amounts L: `53a/56a A/J` O, `57a A/J` M — p.267. |
| MT320 Fixed Loan/Deposit Confirmation | p.422: confirms fixed-term loan/deposit | C/D/E/F settlement legs: `53a/56a/58a A/D/J` O and `57a A/D/J` M — p.425–426. Additional amounts I: `53a/56a A/D/J` O, `57a A/D/J` M — p.428. |
| MT330 Call/Notice Loan/Deposit Confirmation | p.556: confirms call/notice loan/deposit | C/D/E/F settlement legs: `53a/56a/58a A/D/J` O and `57a A/D/J` M — p.558–559. |
| MT340 FRA Confirmation | p.638: confirms a forward-rate agreement | C/D settlement legs: `53a/56a/58a A/D/J` O and `57a A/D/J` M — p.640. Additional amounts F: `53a/56a A/D/J` O, `57a A/D/J` M — p.641. |
| MT341 FRA Settlement Confirmation | p.721: confirms FRA settlement after rate fixing | Settlement C: `53a/56a/58a A/D/J` O and `57a A/D/J` M — p.722. |

### Interest and derivatives — Volume 2

| MT | MRG scope | Verified SSI-related 5x slots and format page |
|---|---|---|
| MT350 Loan/Deposit Interest Payment Advice | p.15: advises interest paid to beneficiary account | Settlement C: `53a/56a/58a A/D/J` O and `57a A/D/J` M — p.17. |
| MT360 Single-Currency IRD Confirmation | p.47: confirms single-currency swap/cap/collar/floor | D p.51 and G p.53: `53a/56a A/D/J` O, `57a A/D/J` M. Additional L p.54 and M p.55: `53a/56a/57a A/D/J` O. |
| MT361 Cross-Currency IRS Confirmation | p.206: confirms cross-currency interest-rate swap | D p.210, G p.212, K p.214, L p.215: `53a/56a A/D/J` O, `57a A/D/J` M. Additional M/N p.216: all three optional. |
| MT362 IRD Payment Advice | p.394: advises reset/payment for an IRD | Net amount B, C p.396 and A, E p.397: `53a/56a A/D/J` O, `57a A/D/J` M. |
| MT364 Single-Currency IRD Termination/Recouponing | p.446: confirms termination or recouponing | Fee legs L/M: `53a/56a A/D/J` O, `57a A/D/J` M — p.448. |
| MT365 Cross-Currency IRS Termination/Recouponing | p.488: confirms termination or recouponing | Re-exchange J/K and fee L/M: `53a/56a A/D/J` O, `57a A/D/J` M — p.490–491. |

For Category 3, `53a` is Delivery Agent except MT305, where it is Sender's Correspondent; `56a` is Intermediary; `57a` is Receiving Agent except MT305, where it is Account With Institution; `58a` is Beneficiary Institution. Sequence and settlement leg are part of the identity of every resolved field.

## 5. MT400 Collections

`SWIFT/us4m_20260717.pdf` p.12 defines MT400 as Advice of Payment from collecting bank to remitting/other collecting bank; it may settle collection proceeds and normally uses the Sender/Receiver account relationship.

| Slot | MRG status | SSI disposition |
|---|---|---|
| `53a A/B/D` Sender's Correspondent | Optional, p.12 | SSI-supported route |
| `54a A/B/D` Receiver's Correspondent | Optional, p.12 | SSI-supported route |
| `57a A/D` Account With Bank | Optional, p.12 | SSI-supported route, but only with C1 |
| `58a A/B/D` Beneficiary Bank | Optional, p.12 | Transaction/party context; not a reusable SSI route by default |

NVR C1 is on p.13: field 57a is allowed only when both 53a and 54a are present. A direct-account or collapsed-route product rule must be labelled local policy and must not replace this NVR.

## 6. Category 7 profiles

| MT and scope anchor | Verified profile slots | SSI disposition |
|---|---|---|
| MT730 Acknowledgement — p.177 | `57a A/D` O Account With Bank — p.177 | SSI-supported only for the charge/account leg; C1/C2 on p.177 govern 25/57a and 32D/57a exclusion. |
| MT734 Advice of Refusal — p.187 | `57a A/B/D` O Account With Bank — p.187 | SSI-supported only when refund/settlement context requires it. |
| MT742 Reimbursement Claim — p.215 | `57a A/B/D` O Account With Bank; `58a A/D` O Beneficiary Bank — p.215 | 57a SSI-supported. 58a is hybrid: beneficiary branch/affiliate comes from transaction context, but its credited account can require controlled account data under p.220–221; conditional SSI review is required. |
| MT750 Advice of Discrepancy — p.244 | `57a A/B/D` O Account With Bank — p.244 | SSI-supported only for the amount-claimed/account leg; the message remains a discrepancy request. |
| MT752 Authorisation to Pay/Accept/Negotiate — p.252 | `53a A/B/D` O Sender's Correspondent; `54a A/B/D` O Receiver's Correspondent — p.252 | Both SSI-supported settlement-route roles. |
| MT754 Advice of Payment/Acceptance/Negotiation — p.264 | `53a A/B/D` O Reimbursing Bank; `57a A/B/D` O Account With Bank; `58a A/D` O Beneficiary Bank — p.264 | 57a is SSI-supported. 53a is controlled by the credit/reimbursement arrangement. 58a is hybrid: beneficiary branch/affiliate is transactional, while the credited account may require controlled account data under p.270–271. NVR C2 on p.265 prohibits using 53a and 57a together. |
| MT756 Advice of Reimbursement or Payment — p.275 | `53a A/B/D` O Sender's Correspondent; `54a A/B/D` O Receiver's Correspondent — p.275 | Both SSI-supported route roles. |
| MT765 Guarantee/Standby Demand — p.354–355 | Sequence A ends after `59R` on p.354. Message-level `56a A/B/D` O Intermediary and `57a A/B/D` O Account With Institution follow the sequence on p.355. They are not fields in Sequence A, and Sequence A NVR C3/D62 does not govern their presence. | Both message-level fields may use controlled routing data; the demand itself remains transaction narrative. |
| MT768 Guarantee/Standby Acknowledgement — p.389 | `57a A/B/D` O Account With Bank — p.389 | SSI-supported only for charges; C1/C2 on p.389 govern 25/57a and 32D/57a exclusion. |
| MT769 Advice of Reduction or Release — p.396 | `57a A/B/D` O Account With Bank — p.396 | SSI-supported only for charges; C1 p.396 and C3 p.397 govern 25/57a and 32D/57a exclusion. |

The primary message meaning remains the scope stated on the cited page: acknowledgement/refusal/reimbursement/discrepancy/authorisation/payment advice/guarantee demand/release. A charge-settlement sub-purpose must never relabel the complete MT730, MT768 or MT769 business message as a payment.

## 7. Option and source rules

- A, B, D and J are distinct FIN options; a generic `53a` label is not executable evidence.
- Option A is a BIC-capable institutional form. Option B commonly carries party/account/location data where allowed. Option D is name/address and requires exception-quality provenance. Category 3 Option J is structured party identification and must not be synthesized from a BIC-only SSI record.
- Mandatory/optional status is scoped to the exact sequence. A mandatory field inside an optional sequence is required only when that sequence is present.
- Reusable SSI applies only when the chosen record matches message type, direction, business function, sequence, settlement leg, currency/value-date applicability and role ownership.
- Transaction-context fields must not be silently populated from a standing route merely because their tag number is 5x.

## 8. Current implementation and data observations

Evidence identities:

| Artifact | SHA-256 |
|---|---|
| `parameters/ssi-mappings.sr2026.json` | `EDE49D11BBB06F63BB4426046660DFC720277D2B37B65C094B7F0E855082B7BD` |
| `apps/ssi-portal/src/app/app.component.ts` | `EFE3D9B3282474C55F56E04293FDC8BF23A90F9F10DBDBAE5E327200CE012B29` |
| `apps/ssi-service/src/app/fin-field-resolution.service.ts` | `135AA537F627D5534830CB0DB735F8242FB5245ECA53F27B61CC0AFC59F6F946` |

Independent comparison found that the catalogue's displayed slot sets match the cited MRG format pages for the 25 messages. The following discrepancies remain:

1. Portal `verified` is computed from whether a generated scenario is marked `executable`; generated scenarios default to `executable: true`. Therefore `VERIFIED REFERENCE` is not an independent MRG or end-to-end execution result. UI must distinguish `MRG PROFILE VERIFIED`, `SSI SEMANTICS VERIFIED` and `UAT EXECUTED`.
2. Catalogue evidence pages omit pages containing some referenced NVRs: MT400 C1 is p.13, not p.12; MT754 C2 is p.265, not p.264; MT769 C3 is p.397, not p.396. The format slots themselves are correctly anchored on p.12, p.264 and p.396.
3. The UI reduces concrete options such as `53A/53B/53D/53J` to `53a`; useful for an index, but insufficient for execution evidence.
4. `MT742.58a` and `MT754.58a` are currently marked `OUT_OF_SSI_SCOPE`, but MRG p.221 and p.271 require the specific credited account when multiple account relationships exist. Their institution identity remains transaction context, while the account component is conditionally SSI-relevant. A hybrid-source rule and tests are required; blanket exclusion is not supported by the MRG.
5. Category 3 and Category 7 transaction labels can overstate a settlement sub-purpose. The canonical payload and report must retain the MRG message meaning and the selected sequence/leg.

Data findings REC-011 and REC-012 remain observations pending controlled execution evidence. The current canonical seed was observed to contain no ACTIVE SSI route declaring the 25 scoped FIN message types. ACTIVE RMA coverage was observed missing for MT341, MT360, MT361, MT362, MT364, MT365, MT734, MT750, MT752, MT768 and MT769. These observations block a positive execution claim until reproduced against a SHA-identified seed/database snapshot and addressed with versioned fixtures; they are not MRG rules.

## 9. Active BA OPEN decisions

| ID | Decision required / closure condition |
|---|---|
| `OPEN-347-004` | Define the effective-date rule and controlled coexistence policy for pure FIN SR2025/SR2026 profiles. |
| `OPEN-347-005` | Approve one canonical positive seed shared by browser/API/QA and a separately governed negative fixture, each with version and SHA identity. |
| `OPEN-347-006` | Approve governed option-specific party, account, clearing and provenance data required to render A/B/D/J without unsafe fallback. |
| `OPEN-347-007` | Approve the MT742 58a hybrid-source contract: transaction-selected beneficiary institution plus conditionally controlled credited account. |
| `OPEN-347-008` | Approve the MT754 58a hybrid-source contract and its coexistence with the MT754 C2 53a/57a mutual-exclusion rule. |
| `OPEN-347-009` | Remove non-FIN target/version metadata from the MT347 UI/API and retain only controlled FIN message, option, sequence/leg and evidence identity. |
| `OPEN-347-010` | Define UI state semantics so MRG profile verification, SSI semantic verification and UAT execution are independently evidenced and never collapsed into `VERIFIED REFERENCE`. |

These seven items are the complete active OPEN set for this controlled memory version.

## 10. Minimum QA implications

1. For every table row, test each supported option independently; assert official field name, option, presence, sequence and settlement leg.
2. For Category 3, test both party/currency legs and every configured additional/net/fee/re-exchange leg. Reject a route resolved against the wrong sequence or currency.
3. Assert mandatory `57a` where the selected sequence requires it, and allow omission only where the format profile marks it optional.
4. MT400 must test C1: 57a absent, or 53a+54a+57a together; partial combinations fail.
5. MT730/MT768/MT769 must test field 25/57a mutual exclusion and 32D/57a exclusions. MT754 must test 53a/57a mutual exclusion.
6. Assert source boundaries: MT400 58a is transaction context; MT742/MT754 58a must combine the transaction-selected beneficiary branch/affiliate with a controlled credited account only when the MRG condition applies. MT754 53a requires the documentary-credit reimbursement arrangement and must not be guessed from a generic route.
7. MT765 tests must address message-level 56a and 57a only; no Sequence A rule may be used to make those message-level fields present or absent.
8. Option D/J suggestions require complete option-specific source data and provenance; BIC-only fallback fails closed.
9. Every evidence result records MRG filename/SHA/page, mapping-catalogue hash, fixture/snapshot identity and build/commit identity.

## 11. Maintenance rule

When a standards release, FIN field profile or SSI policy changes:

1. Preserve the prior controlled memory version.
2. Record exact source filename, SHA, release and page.
3. Re-run all affected option/sequence/leg tests and NVR combinations.
4. Re-adjudicate reusable SSI, hybrid-source and transaction-context roles.
5. Never carry a field rule forward solely because its FIN tag number is unchanged.

## 12. Change log

| Version | Date | Change | Prior controlled source |
|---|---|---|---|
| 2 | 2026-09-12 | Reissued as FIN-only controlled DRAFT; added the internal-label disclaimer; corrected MT765 56a/57a to message level; retained MT742/MT754 hybrid rulings; separated REC/data observations from MRG rules; consolidated the seven active BA OPENs. | `memory/swift-mt347.md`, SHA-256 `F1B413E13253432E5153CA9EEC9D082460A897CAC4640E1288D8A2DDF1CCF490` |
