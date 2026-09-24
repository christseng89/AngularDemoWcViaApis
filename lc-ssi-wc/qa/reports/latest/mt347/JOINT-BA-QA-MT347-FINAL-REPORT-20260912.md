# MT347 SR2026 — Joint BA/QA Final Report

**Assessment date:** 2026-09-12  
**Controlled baseline:** TDD v5 SHA-256 `82C6ABCFD91E7D35E1382F8C86BF796D8DBF05CF8C8D94F9F0C7B5889AB52C9A`  
**BA memory:** `memory/swift-mt347-v2.md`, SHA-256 `682075A1EC36AD1A5397382063B1AFEE08F0E88921E139E7E62A8033552A985A`  
**Joint verdict:** **POSITIVE API/UI EVIDENCE ACCEPTED FOR THE EXECUTED SCOPE; OVERALL MT347 ACCEPTANCE REMAINS BLOCKED.**

The block is not caused by the corrected positive paths. It remains because 208 negative cases and 2 boundary cases have no execution evidence, all 48 TDD NVR cases have zero UI execution, and 41 of those NVRs require an upstream full-FIN validator that is not executable in the current product surface.

## 1. Corrections rechecked against MRG and Memory

The previously reported ten positive discrepancies are corrected:

- MT400-001, MT752-001 and MT756-001 now render `54A=BNPAFRPP`, matching the TDD role value for Receiver's Correspondent.
- MT765-001 now omits 56a as `NOT_REQUIRED` and renders only `57A=DEUTDEFF`, consistent with the MT765 message-level 56a/57a profile in `us7m_20260717.pdf` p.355.
- MT742-012, MT754-005, MT754-006, MT754-012, MT756-006 and MT756-012 now contain the required resolved tags.
- All returned positive results use snapshot `70EF9716C2692555A59950D75D6CB458B83CB4B94371F26B26060ACC849FAC08`.

The MT360/361 sequence rules, MT742/754 hybrid conditions, MT765 correction, 25-message scope, 53 scenarios and 164 confirmed 5x rules remain consistent with the controlled MRG and Memory v2.

## 2. Positive API result

Evidence: `controlled-positive-uat.json`, SHA-256 `0FEF8019C4B5A1F9065B9C84013A08FEDBFB8652922741C20CDEA529E21CCF41`.

| Measure | Result | BA ruling |
|---|---:|---|
| Planned/executed | 152 / 152 | Complete for API positive scope |
| HTTP 200 | 152 | Expected |
| Reported pass/fail | 152 / 0 | Accepted for this execution after independent BA comparison |
| Snapshot identities | 1 | `70EF9716...FAC08` |

Oracle qualification:

- 100 cases have exact non-empty `expectedTags`.
- A further 6 cases use presence-only assertions through `expectedPresentTags`.
- 46 cases remain dependent on textual TDD predicates rather than a complete exact machine oracle; 25 of them are clearing/member-code fidelity cases with recorded tags and 21 are omission cases.
- BA compared these recorded outputs to the TDD text for this run and found no remaining positive mismatch. This accepts the current evidence, but the 46 incomplete machine oracles remain evidence-automation debt and must not silently pass future regressions.

Fixture SHA-256: `mt347-positive.v1.json` = `E276F5B8B0229D1405C6E3535A730BE8622B2CC5C505B0DB3FC26B31434FE375`.

## 3. Browser UI result

Edge executed the 91 cases reachable from `http://localhost:4400` using snapshot `70EF9716...FAC08`.

| Evidence | SHA-256 | Result |
|---|---|---|
| `controlled-ui-positive-uat.json` | `8310CD79A6C2483BA8DBDDA2A883A271A908177146819AFBCC03B75668B23773` | Raw run: 91 executed; raw exact comparator 60/31 because of incomplete fixture oracle |
| `controlled-ui-positive-uat-adjudication.json` | `3C55FDFB156488DC96D71C7CEB49FBE537D3FEB393458D4B02364BD87153B9CC` | Independent TDD/text/input-policy adjudication: **91 PASS / 0 FAIL** |
| `controlled-ui-uat-scope-accounting.json` | `7184F9C9CEB905606710CD24E7B8A63F1E59E8E1B8E5ED964FD2157AD36E4A61` | 362-case scope ledger |

The final QA adjudication is accepted for these 91 UI-executable positive cases. It explicitly identifies 47 fixture-oracle gaps and does not convert those gaps into unqualified raw-comparator passes.

The remaining 61 positive cases were executed through the API but are not reachable through the current UI because the UI exposes only each message's default sequence. They are **not UI PASS**; they are `NOT_EXECUTABLE_IN_CURRENT_UI` with API evidence only.

## 4. Negative, boundary and NVR status

The controlled total remains:

| Polarity | Total | API/UI execution accepted | Remaining |
|---|---:|---:|---:|
| Positive | 152 | API 152; UI 91 | 61 have no UI entry point |
| Negative | 208 | 0 | **208 NOT_EXECUTED** |
| Boundary | 2 | 0 | **2 NOT_EXECUTED** |
| Total | 362 | — | Overall acceptance blocked |

The TDD contains 48 NVR-labelled cases. UI execution is **0/48**. Static inspection or an SSI resolver HTTP 200 is not NVR execution evidence.

### NVR ownership correction

The QA accounting file groups all 48 under the unavailable NVR surface. That is valid as an execution-availability statement, but it is not the final semantic ownership split.

| NVR owner | Count | Cases/rules | Required evidence |
|---|---:|---|---|
| SSI API-owned | 7 | MT360-021/-028 and MT361-035/-042 (C13); MT400-006 (C11); MT754-007 (C14); MT742-010 (controlled 57A FI/source validity) | Structured HTTP 422 from the SSI/field-resolution API with exact rule/source evidence |
| Upstream full-FIN validator-owned | 41 | E35 35 cases; MT362 C4/C5 occurrence 2; MT730/768/769 C77/C78 3; MT756 `/RCB/` usage 1 | Executable full FIN message validation carrying the MRG rule key |
| **Total** | **48** | — | UI executed 0; no case may be PASS |

MT742-007 is additionally an SSI API-owned 57a usage-rule case, expected HTTP 422, but it is not one of the 48 rows explicitly labelled NVR in TDD v5.

### Complete upstream NVR set

**E35, 86a without 56a — 35:** `MT306-006, MT306-012, MT306-018; MT320-006, MT320-012, MT320-018, MT320-024, MT320-030; MT330-006, MT330-012, MT330-018, MT330-024; MT340-006, MT340-012, MT340-018; MT341-006; MT350-006; MT360-006, MT360-013, MT360-020, MT360-027; MT361-006, MT361-013, MT361-020, MT361-027, MT361-034, MT361-041; MT362-006, MT362-013; MT364-006, MT364-012; MT365-006, MT365-012, MT365-018, MT365-024`.

**Other full-message NVR — 6:** `MT362-007, MT362-014` (occurrence C4/C5); `MT730-006, MT768-006, MT769-006` (25/32D versus 57a C77/C78); `MT756-011` (`/RCB/` with incomplete correspondent structure).

For these 41, the SSI resolver must record `validationOwner=UPSTREAM_FIN_VALIDATOR` and `nvrOutcome=NOT_EVALUATED`; it must not manufacture an NVR PASS or FAIL. TDD v5's SSI-side HTTP 422 expectation for these rows requires correction in a future controlled TDD version.

## 5. HTTP responsibility ledger

For the 210 negative plus boundary cases, the final BA responsibility split is:

- 169 SSI API-owned:
  - 74 expected structured HTTP 422, including the 7 API-owned NVR rows and 2 boundary rows.
  - 95 data-quality cases: HTTP 409 in DEV/DEMO and structured HTTP 500 outside DEV/DEMO.
- 41 upstream full-FIN NVR-owned:
  - SSI API returns normal resolution or N/A/evidence-only when its own inputs are valid.
  - The upstream validator supplies the actual FIN rejection and MRG code.

Conservation: `169 + 41 = 210`; `152 + 208 + 2 = 362`.

## 6. Final ruling and closure conditions

| Gate | Status |
|---|---|
| TDD/Memory/MRG semantic baseline | ACCEPTED as controlled DRAFT |
| Positive API, 152 cases | ACCEPTED for the recorded snapshot, with 46 machine-oracle gaps retained as evidence debt |
| Positive Browser UI, executable 91 cases | ACCEPTED after independent adjudication |
| Remaining 61 positive UI sequences | NOT_EXECUTABLE_IN_CURRENT_UI; API evidence only |
| Negative, 208 cases | **NOT_EXECUTED / BLOCKED** |
| Boundary, 2 cases | **NOT_EXECUTED / BLOCKED** |
| NVR, 48 cases | **0 executed through UI; BLOCKED** |
| Overall MT347 acceptance | **BLOCKED** |

Final closure requires:

1. Execute the 169 SSI API-owned negative/boundary cases with case-level response and snapshot evidence.
2. Execute the 41 upstream full-FIN NVR cases through an actual FIN validator.
3. Preserve the 7-versus-41 NVR ownership split in the next controlled TDD revision.
4. Populate complete machine oracles for the 46 API text-only and 47 UI-adjudicated oracle gaps.
5. Keep OPEN-347-004 through OPEN-347-010 open until their actual evidence conditions are satisfied.
6. Do not mark any unexecuted negative, boundary, NVR or non-reachable UI case PASS.

## 7. Engineering quality and reload evidence

The corrected canonical configuration was reloaded through the Development Settings UI. The transaction completed with `DEMO_DATA_RELOADED`, 9,442 imported records, seed SHA-256 `350E4072E9BD95EAE35F11B594FF80440AA7D81B3E424B1714E1B323295C4C37`, and WAL-aware logical snapshot `70EF9716C2692555A59950D75D6CB458B83CB4B94371F26B26060ACC849FAC08`.

| Engineering gate | Final result |
|---|---|
| Lint | PASS |
| Typecheck | PASS, 8/8 projects |
| Production build | PASS, 5/5 projects |
| Unit/integration tests | PASS, 8/8 projects |
| MT2 final-QA regression | PASS, 28/28 |
| MT347 controlled fixture contract | PASS, 6/6 |
| Aggregate executable line coverage | 95.47% (`4683/4905`) |
| SonarQube Quality Gate | `OK` |
| SonarQube Critical / Major | `0 / 0` |
| SonarQube new-code / overall duplication | `0.0% / 0.8%` |
| SonarQube overall coverage | 83.7% |

Sonar analysis ID: `AaCWUDGmpudeB0dK27KH`; worktree digest `e6ba0146ef30da3808f23b44d9ecbcade0469489d375d87a8c220060a9065d24`. The executable aggregate coverage and Sonar overall coverage are separate measures and are not represented as interchangeable. The Quality Gate had no `new_coverage` condition in this previous-version period because the final change contained no new coverable application line relative to the immediately preceding analysis.
