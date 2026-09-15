# Gate G2 SR2026 Evidence Difference Report

Status: first checkpoint complete; minimal evidence-only catalogue patch applied.

## Source control

- `us4m.pdf`: SHA-256 `16173b9b054f3f228c6a89f0a27a4e8815c6d69a69c6fe1ba09454a541dc2668`, 59 pages, 224703 bytes.
- `us7m.pdf`: SHA-256 `489bd05ddd0181b1bbb2e326ee239cf2607980f59e344c96ba7c4258d60a0cab`, 286 pages, 950930 bytes.
- Both documents identify themselves as SWIFT Message Reference Guide - Standards Release Guide for Standards MT November 2026.
- The source PDFs were read only and were not modified.

## Evidence boundary

The Category 4 guide lists only MT416, MT420 and MT430 as modified. MT400 page 7 explicitly redirects to the current Standards MT documentation, so this PDF cannot prove MT400's 5x profile.

The Category 7 guide provides complete profiles for the relevant modified messages MT700, MT705, MT707, MT710, MT720, MT740, MT760 and MT765. For MT730, MT734, MT742, MT750, MT752, MT754, MT756, MT768 and MT769 it only says that the message is unchanged and redirects to the current documentation. Those messages remain `PENDING_EVIDENCE`.

## Confirmed profile differences

| Message | Evidence                                  | Current implementation difference                                                                                                                                                    |
| ------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MT400   | Insufficient (us4m pp.3,7)                | Current 53A/54A/57A/58A rows cannot be promoted by this artifact and must fail closed until current UHB/MRG evidence is supplied.                                                    |
| MT700   | Full (pp.8-10,14,30-32)                   | 51a Applicant Bank exists in the message profile but is absent from the catalogue. Existing 53/57/58 rows represent only option A and omit explicit option/profile metadata.         |
| MT705   | Full (pp.35-36,47-48)                     | 57a is A/B/D. The pending code exposes only a 57A candidate claim. SSI derivability remains a separate policy decision.                                                              |
| MT707   | Full (pp.50-53,56,80-81)                  | 52a Issuing Bank is missing from pending claims. 57a supports A/B/D; 53a and 58a support A/D.                                                                                        |
| MT710   | Full (pp.85-88,92,95,111-113)             | 51a Applicant Bank and 52a Issuing Bank are missing from pending claims. 57a supports A/B/D; 53a and 58a support A/D.                                                                |
| MT720   | Full (pp.116-119,123,141-142)             | 52a Issuing Bank of the Original Documentary Credit is missing from pending claims. 57a supports A/B/D and 58a supports A/D.                                                         |
| MT740   | Full (pp.151-155)                         | Pending 58A has the correct field name Negotiating Bank, but the profile is conditional under C3/D84 and allows A/D.                                                                 |
| MT742   | Insufficient (p.163)                      | Current active 57A/58A catalogue rows are unsupported by the supplied release guide.                                                                                                 |
| MT760   | Full (pp.174-180,190,193-194,198,211,215) | Current rows have no sequence. Sequence B has 52a/56a/57a/58a; sequence C has 52a/57a only. A bare 57A key is ambiguous between B and C. C7/C81 and C9/C20 are explicitly evidenced. |
| MT765   | Full (pp.225-227,235-236)                 | Catalogue contains only 57A. The profile also contains mandatory 52a Issuer and optional 56a Intermediary. 56a/57a allow A/B/D. Reusability is not proven by the message guide.      |

## Claims that remain pending

The supplied PDFs do not contain the field profiles for MT730, MT734, MT742, MT750, MT752, MT754, MT756, MT768 or MT769. Existing `pendingCandidateFields()` entries for those messages remain code-only claims and must not emit suggested values.

The PDFs prove field eligibility, option, name, presence, format and listed NVR references for modified messages. They do not prove that every eligible field should be sourced from SSI, nor do they provide a bank Usage Guideline or bilateral profile. `reusableCandidate`, owner-side source policy and automatic population remain separately governed decisions.

## Applied fail-closed changes

- MT400 and MT742 rows are retained for traceability but marked `PENDING_EVIDENCE` and `suggestionEnabled: false`. The suggestion API now returns `MAPPING_PENDING` with the evidence artifact/page instead of generating values.
- Existing MT700, MT760 Sequence B and MT765 option A rows now carry their exact sequence, option, field-profile evidence status, source artifact and page.
- No new 51a, 52a, 56a, option B/D, Sequence C or NVR-driven suggestion mapping was added. Those require separately approved SSI derivability and usage-policy evidence.
