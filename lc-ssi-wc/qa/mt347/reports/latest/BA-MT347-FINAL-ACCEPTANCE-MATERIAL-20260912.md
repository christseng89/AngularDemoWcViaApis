# MT347 SR2026 — Final BA Acceptance Material

**Assessment date:** 2026-09-12  
**BA verdict:** **BLOCKED — not Final Accepted**  
**Scope:** Controlled TDD v5; 25 approved FIN message types; 53 scenarios; 164 confirmed 5x rules; 362 cases (152 positive, 208 negative, 2 boundary).  
**Execution rule:** `PASS` is recorded only where executable evidence proves the TDD assertion. A planned case, an empty assertion, or an upstream-validator case without validator evidence is not a pass.

## 1. Controlled sources

| Artifact | SHA-256 | Role |
|---|---|---|
| `qa/mt347/tdd/MT347_SR2026_SSI_TDD_CONTROLLED_v5.xlsx` | `82C6ABCFD91E7D35E1382F8C86BF796D8DBF05CF8C8D94F9F0C7B5889AB52C9A` | Controlled TDD DRAFT |
| `memory/swift-mt347-v2.md` | `682075A1EC36AD1A5397382063B1AFEE08F0E88921E139E7E62A8033552A985A` | Controlled BA memory |
| `SWIFT/us3ma_20260717.pdf` | `5B4315EF876FF32C416BF445C0ADB063D6E0A1600EF93F55DF73F98A175457E5` | SR2026 Category 3 MRG, part A |
| `SWIFT/us3mb_20260717.pdf` | `BC510604859CF7C5FE43A90176889AD21050ECE964A6244EBD92AC6E50FAF861` | SR2026 Category 3 MRG, part B |
| `SWIFT/us3u_20260717.pdf` | `92F6F7E6D1D7EB1EEA1BFB753ADA171D4099FA5215BA13D130C2E17494EB0E90` | SR2026 Category 3 usage rules |
| `SWIFT/us4m_20260717.pdf` | `71F865223FD74B19DD5AE721AA84F0288259A1C28600A5B8F8252346BAC1C06B` | SR2026 Category 4 MRG |
| `SWIFT/us7m_20260717.pdf` | `1F748A8262E5528F6C9BD59DDD5FF1A992542CFCF25D0E8DA528241D12FEA2A4` | SR2026 Category 7 MRG |

The TDD format review remains accepted: 164/164 rules match the controlled MRG field number, mandatory/optional status, official field name and allowed option set. The MT360/361 sequence corrections, MT765 message-level 56a/57a model, and qualified MT742/754 hybrid rules remain valid.

## 2. QA evidence reconciliation

Evidence reviewed:

| Artifact | SHA-256 | Observation |
|---|---|---|
| `qa/mt347/reports/latest/controlled-positive-uat.json` | `C9455E660FAB446C81D9BF42D7840BA5E6492937A9EC5676B16B38D7FBE5F8BA` | 152 API calls, all HTTP 200, one snapshot hash, report declares 152 passed |
| `qa/mt347/fixtures/mt347-positive.v1.json` | `F661353AF3875028CEED49502E29635DBCED28928A2140C632BAB99DA3782BDD` | 152 positive records, but 60 records have an empty `expectedTags` assertion |
| `qa/mt347/fixtures/mt347-negative.v1.json` | `D82E43CF0CF15DF2D45D65BB6CA7B49C5ED6AF702DD0A512B200C242AFE66A09` | Negative fixture exists; no executable result file supplied |
| `qa/mt347/fixtures/mt347-boundary.v1.json` | `A6213528B911905E0857B8ED230BD1E7FC5E61DCADDDE76D44D692389584C2C2` | Boundary fixture exists; no executable result file supplied |

### Positive execution ruling

The file named `controlled-positive-uat.json` is direct API endpoint evidence (`/api/reference/fin-controlled-resolutions`), not browser-interaction evidence. It cannot close the Browser UAT channel.

Independent comparison found:

- 152/152 case IDs are present and returned HTTP 200.
- 115 cases had non-empty `expectedTags` and their recorded actual tags matched mechanically.
- 60 cases had `expectedTags={}`. The runner therefore could not validate their TDD 5x expectation.
- Within those 60, 50 recorded outputs appear consistent with the TDD text, but 10 contradict it. These ten are **FAIL / BLOCKED**, not PASS.
- Therefore the QA headline `152 passed` is a false-green result. At most 142 recorded results are BA-conformant; final positive acceptance remains blocked until all 152 cases have explicit, machine-comparable assertions and are rerun.

| Case | TDD expected result | Recorded actual | BA ruling |
|---|---|---|---|
| MT400-001 | 53A=CITIUS33; **54A=BNPAFRPP**; 57A=DEUTDEFF | 53A=CITIUS33; **54A=HSBCHKHH**; 57A=DEUTDEFF | FAIL — value mismatch |
| MT752-001 | 53A=CITIUS33; **54A=BNPAFRPP** | 53A=CITIUS33; **54A=HSBCHKHH** | FAIL — value mismatch |
| MT756-001 | 53A=CITIUS33; **54A=BNPAFRPP** | 53A=CITIUS33; **54A=HSBCHKHH** | FAIL — value mismatch |
| MT765-001 | 57A=DEUTDEFF; **56a omitted** | 56A=CITIUS33; 57A=DEUTDEFF | FAIL — forbidden extra 56A |
| MT754-005 | **53a emitted** | no tags | FAIL — required resolved field absent |
| MT754-006 | **57a emitted** | no tags | FAIL — required resolved field absent |
| MT742-012 | **57A resolved**; MT730/768/769 C77/C78 not applied | no tags | FAIL — required resolved field absent |
| MT754-012 | **57A emitted**; apply MT754 C2/C14 only | no tags | FAIL — required resolved field absent |
| MT756-006 | **53A emitted**; 54a omitted | no tags | FAIL — required resolved field absent |
| MT756-012 | **53A/54A resolved**; foreign C77/C78 not applied | no tags | FAIL — required resolved fields absent |

Required correction: generate explicit `expectedTags` for every positive case, include explicit omitted-tag assertions, fail when an expected assertion set is empty unless the TDD explicitly expects no 5x fields, and rerun API plus browser UAT against the same fixture identity.

## 3. Negative and boundary ownership ruling, including every NVR

No negative or boundary execution evidence was present in `qa/mt347/reports/latest/`. All 208 negative and 2 boundary cases therefore remain **NOT_EXECUTED**.

The 210 cases divide by validation ownership as follows:

| Owner | Count | Expected behavior |
|---|---:|---|
| SSI reference API | 169 | 74 structured HTTP 422 rejections; 95 data-quality failures using HTTP 409 in DEV/DEMO and HTTP 500 outside DEV/DEMO |
| Upstream full-FIN validator | 41 | SSI API does not claim the full-message NVR. It resolves SSI normally when its own inputs are valid and records `validationOwner=UPSTREAM_FIN_VALIDATOR`, `nvrOutcome=NOT_EVALUATED`, rule and MRG evidence. The upstream validator must provide the actual NVR rejection evidence. |
| **Total** | **210** | Conservation check satisfied |

### 3.1 SSI API-owned cases

The SSI API owns fields and evidence it resolves or renders: 5x field presence required by the selected SSI profile, option validity, role/source/provenance, applicability, ambiguity, data quality, unsupported SSI fields and the two explicit out-of-scope boundaries.

The 74 expected HTTP 422 cases comprise:

- 53 invalid-option cases: code `OPTION_CONSTRAINT_VIOLATION`.
- 6 mandatory-57a/profile cases: MT360-007, MT360-014, MT361-007, MT361-014, MT361-021, MT361-028.
- 4 pure-5x C13 cases: MT360-021, MT360-028, MT361-035, MT361-042. MRG: `us3mb` pp.57-59 and pp.217-220.
- MT400-006: C11, 57a supplied without both 53a and 54a; `us4m` pp.12-13.
- MT754-007: C14, 53a and 57a collision; `us7m` p.265.
- MT742-007: conditional 57a usage violation when Receiver directly services the beneficiary branch account; `us7m` pp.220-221.
- MT742-008: required transaction beneficiary context missing.
- MT742-009 and MT754-010: unsupported SSI field candidate.
- MT754-009 and MT756-009: ownership/source violation.
- MT742-010: invalid/unregistered 57A FI identifier treated as controlled source/directory failure; `us7m` p.220.
- MT416-AUDIT-001 and MT785-AUDIT-001: controlled out-of-scope boundary responses.

The 95 expected data-quality cases comprise:

- 92 profile/provenance incompleteness cases.
- MT756-010 duplicate role source.
- MT742-014 and MT754-014 non-unique credited account; exact API codes remain governed by OPEN-347-007 and OPEN-347-008.

For these cases the body must explain the data defect and remediation; HTTP 409 is permitted only in DEV/DEMO, while the accepted non-DEV contract is structured HTTP 500. A missing/broken negative fixture is not product PASS.

### 3.2 Upstream full-FIN validator-owned NVR cases

The following 41 cases require fields or occurrences beyond the SSI resolver's owned 5x output. TDD v5 currently writes SSI-side HTTP 422 for them; that is an ownership defect in the test contract and must be amended in the next controlled TDD revision.

**E35 — 86a present without 56a in the same sequence (35 cases):**

`MT306-006, MT306-012, MT306-018; MT320-006, MT320-012, MT320-018, MT320-024, MT320-030; MT330-006, MT330-012, MT330-018, MT330-024; MT340-006, MT340-012, MT340-018; MT341-006; MT350-006; MT360-006, MT360-013, MT360-020, MT360-027; MT361-006, MT361-013, MT361-020, MT361-027, MT361-034, MT361-041; MT362-006, MT362-013; MT364-006, MT364-012; MT365-006, MT365-012, MT365-018, MT365-024`.

**Occurrence NVR (2 cases):**

- MT362-007 and MT362-014: C4/C5, NET once or GROSS maximum three; `us3mb` pp.396-399.

**Cross-field NVR outside SSI ownership (3 cases):**

- MT730-006: C77/C78, field 25/32D versus 57a; `us7m` p.177.
- MT768-006: C77/C78, field 25/32D versus 57a; `us7m` p.389.
- MT769-006: C77/C78, field 25/32D versus 57a; `us7m` pp.396-398.

**Non-SSI usage rule (1 case):**

- MT756-011: `/RCB/` in 72Z requires both correspondent fields; `us7m` pp.275,278.

For all 41 cases, the SSI response must not say the NVR passed or failed. Expected SSI evidence is `NOT_EVALUATED` for the NVR. The upstream full-FIN validator must construct the complete FIN message and return evidence carrying the exact MRG rule key (`E35`, `C4/C5`, `C77/C78`, or the `/RCB/` usage rule). Without that executable validator evidence, the case remains NOT_EXECUTED.

## 4. Final closure gates

Final BA acceptance requires all of the following:

1. Fix the positive assertion generator so all 152 cases have explicit expected tags and explicit omission decisions; rerun and eliminate the ten listed mismatches.
2. Produce browser UAT evidence for all applicable positive, negative and boundary cases. The existing JSON proves API calls only.
3. Run the 169 SSI API-owned negative/boundary cases against the governed negative fixture and preserve request, response, fixture SHA, snapshot identity and case-level result.
4. Reclassify the 41 full-message NVR cases to the upstream validator channel and provide executable full-FIN validator evidence. Do not use SSI HTTP 422 as a substitute.
5. Preserve 169 + 41 = 210 ownership conservation and 152 + 208 + 2 = 362 case conservation.
6. Keep all seven controlled OPEN items (OPEN-347-004 through OPEN-347-010) open until their stated artifact/evidence conditions are actually met.
7. Update a future controlled TDD revision and its SHA sidecar; do not overwrite v5.

## 5. Formal conclusion

**TDD/MRG design baseline:** ACCEPTED as controlled DRAFT.  
**Positive API execution:** BLOCKED — false-green 152/152; ten recorded contradictions and sixty empty tag assertions.  
**Browser UAT:** NOT_EXECUTED / no browser evidence supplied.  
**Negative + boundary execution:** NOT_EXECUTED.  
**Full-FIN NVR execution:** NOT_EXECUTED.  
**Overall MT347 BA acceptance:** **BLOCKED**.

