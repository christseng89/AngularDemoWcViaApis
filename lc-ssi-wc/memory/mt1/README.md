# MT1 / pacs.008 Controlled Artifact Index

## Active outward-SSI-only candidate

The active proposed knowledge entry point is [MT1 / pacs.008 SSI Memory v3](../swift-mt1xx-pacs008-ssi-v3.md). Its scope is `OUTWARD_SSI_ONLY`; `INWARD` and received-payment contexts are excluded before SSI discovery. Implementation remains unauthorized until Independent BA, QA and Product Owner approve the same externally recorded exact Git candidate commit.

| Active artifact                                                                                                                   | Purpose                                                             |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [SSI Memory v3](../swift-mt1xx-pacs008-ssi-v3.md)                                                                                 | Active boundary, Phase-1 scope, source register and approval status |
| [Scope and Context Contract v1](MT1_PACS008_SSI_RESOLUTION_SCOPE_CONTEXT_CONTRACT_v1_DRAFT.md)                                    | Minimum governed adapter input and explicit ownership exclusions    |
| [Settlement Context / SSI Role / Atomic Route Matrix v1](MT1_PACS008_SETTLEMENT_CONTEXT_SSI_ROLE_ATOMIC_ROUTE_MATRIX_v1_DRAFT.md) | INDA, INGA and COVE role, route, ambiguity and stale decisions      |

BA Maker: `/root/mt1_ba_review`. Independent BA Checker, QA Checker and Product Owner are pending.

## Historical / superseded v0.6 evidence

The following files are preserved unchanged for audit history. They are **historical / superseded**, are not active implementation authority and must not be used to expand the SSI-only product boundary:

| Historical artifact                                                                                                                | Disposition                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [Customer Payment Instructions Proposal v0.6](MT1XX_PACS008_CUSTOMER_PAYMENT_INSTRUCTIONS_PROPOSAL_v0.6_DRAFT.md)                  | Superseded scope proposal                                                                          |
| [OPEN-01 Creditor Destination Authority & Repair Matrix](MT1XX_PACS008_CREDITOR_DESTINATION_AUTHORITY_REPAIR_MATRIX_v0.1_DRAFT.md) | **Upstream interface reference** only; CPI authority and repair are outside SSI Resolver ownership |
| [Old Scenario / Context / SSI Role Matrix](MT1XX_PACS008_SCENARIO_CONTEXT_SSI_ROLE_MATRIX_v0.1_DRAFT.md)                           | Superseded by the active SSI-only atomic-route matrix                                              |
| [v0.6 Matrix Review](MT1XX_PACS008_v0.6_MATRIX_REVIEW.md)                                                                          | Historical review; does not approve v3                                                             |
| [v0.6 Final Bundle](MT1XX_PACS008_v0.6_FINAL.bundle.json)                                                                          | Historical bundle; not current identity or approval evidence                                       |
| [v0.6 Integrity Manifest](sha.txt)                                                                                                 | Historical local hash record                                                                       |
| [Memory v2](../swift-mt1xx-pacs008-v2.md)                                                                                          | Superseded controlled candidate; not implementation authority                                      |

Local Angular / Browser UAT endpoint remains `http://localhost:4600`; port `4400` is obsolete.
