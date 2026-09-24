# MT2 SSI-Only COV Scope Companion — QUARANTINED

> **Status: SUPERSEDED / DO NOT USE FOR ACCEPTANCE.** The blanket rejection of
> MT202COV own-account settlement arrangements below conflicts with
> `SWIFT/us2m_20260717.pdf` p.75. This file is retained only as historical
> evidence until a corrected companion is issued and independently approved.

Version: 1  
Date: 2026-09-13  
Status: QUARANTINED — SUPERSEDED, NOT ACCEPTANCE EVIDENCE  
Applies to: `qa/fixtures/mt2/MT2XX_測試案例_SSI與NOSTRO_v6.2_FINAL.xlsx`
Supersedes: only the expected results of `MT202C-16` and `MT202C-17`; all other workbook rows remain unchanged

## 1. Authoritative scope ruling

This companion applies the current SSI-only scope decision:

- Third-party FIN validators, complete FIN Network Validated Rules and SWIFT Network execution are `OUT_OF_SCOPE — CLOSED` for this SSI delivery.
- They must not be recorded as an SSI OPEN item, release blocker or substitute SSI response.
- MT↔MX remains applicable only to the existing MT1/MT2 product boundary. This companion does not introduce a network-validation requirement.
- Historical ruling, superseded: the two arrangements were previously limited
  to plain MT202. MRG p.75 permits them in MT202COV Sequence A when genuine
  cover purpose, 119=COV, UETR/121 and mandatory Sequence B are complete.
- MT202COV is restricted to cover-payment semantics with field 119=COV, mandatory Sequence B and the COV business service/profile.

Normative and controlled basis:

- `memory/swift-mt2xx-pacs009-v2.md`, SHA-256 `B0BC5655CB843B771E8FBFFE0F6448D5400A42A2F2AE0F6F37444E0935E8132A`, sections 1, 4, 5 and 6.
- `SWIFT/us2m_20260717.pdf`, SHA-256 `64483D7F7C094DB28E03791AB6BBC7A0522DAEC90487A7DD834228E848FA8323`, MT202 plain pp.39–40 and MT202COV pp.59–61.
- pacs.009 COV profile requires `BizSvc=swift.cbprplus.cov.04`; profile selection uses the business scenario and BAH `BizSvc`, not the common `pacs.009.001.08` message definition alone.

## 2. Controlled corrections

| Case | Existing v6.2 expectation | Corrected SSI-only expectation | Owner | Rule classification |
|---|---|---|---|---|
| `MT202C-16` | HTTP 200 `RESOLVED` for `CREDIT_ONE_OF_SEVERAL_AT_57A` under MT202COV | HTTP 400 `COUNTERPARTY_PAYMENT_PROFILE_MISMATCH`; `payloadGenerated=false`; no confirmed resolution/snapshot; no Repair Queue submission. Detail must state that the own-account scenario is valid only for plain MT202. | `SSI_FIELD_RESOLUTION_API` | `BA_SCENARIO_PROFILE_GUARD` |
| `MT202C-17` | HTTP 200 `RESOLVED` for `BOOK_TRANSFER_SAME_RECEIVER` under MT202COV | HTTP 400 `COUNTERPARTY_PAYMENT_PROFILE_MISMATCH`; `payloadGenerated=false`; no confirmed resolution/snapshot; no Repair Queue submission. Detail must state that the book-transfer scenario is valid only for plain MT202. | `SSI_FIELD_RESOLUTION_API` | `BA_SCENARIO_PROFILE_GUARD` |

The two corrected cases must not emit MT tags, pacs.009 elements, a confirmed snapshot, a settlement payload or a Repair Queue item. Their failure is an SSI profile/scenario contract decision, not a FIN NVR result.

## 3. Machine-readable oracle

Both cases use the following expected oracle, with `caseId` set to the applicable case:

```json
{
  "caseId": "MT202C-16-or-MT202C-17",
  "expectedHttp": 400,
  "expectedCode": "COUNTERPARTY_PAYMENT_PROFILE_MISMATCH",
  "expectedDecision": "REJECTED",
  "payloadGenerated": false,
  "confirmedSnapshotCreated": false,
  "repairQueueSubmitted": false,
  "validationOwner": "SSI_FIELD_RESOLUTION_API",
  "ruleClassification": "BA_SCENARIO_PROFILE_GUARD",
  "networkValidation": "OUT_OF_SCOPE_CLOSED"
}
```

Acceptance requires exact comparison of every property. HTTP 200, an empty oracle or a manually inferred result is a failure.

## 4. Evidence and regression gates

For each corrected case, QA must preserve:

1. browser action and API request/response under one correlation ID;
2. application build/commit identity;
3. workbook SHA, this companion SHA sidecar and memory SHA;
4. canonical seed and WAL-aware logical snapshot identities;
5. exact assertion that no MT/MX payload, confirmed snapshot or Repair Queue item was produced.

Required regression:

- Plain MT202 `BOOK_TRANSFER_SAME_RECEIVER` remains executable when its SSI and Nostro preconditions are valid.
- Plain MT202 `CREDIT_ONE_OF_SEVERAL_AT_57A` remains executable when its SSI and Nostro preconditions are valid.
- Standard MT202COV and onward-cover cases remain executable only with valid COV context, Sequence B and `swift.cbprplus.cov.04`.
- Switching only `MsgDefIdr` is insufficient to change profile; scenario and BAH `BizSvc` remain authoritative.

## 5. Prior evidence treatment

The accepted MT2 final report and its 139-case execution remain historical evidence for the build that produced them. Its PASS assertions for `MT202C-16` and `MT202C-17` are superseded and quarantined for current semantic acceptance. The other 137 case results are not changed by this companion.

Source identities:

| Artifact | SHA-256 | Treatment |
|---|---|---|
| `qa/fixtures/mt2/MT2XX_測試案例_SSI與NOSTRO_v6.2_FINAL.xlsx` | `DF3328998BA24B904B1E8944F1680699F75A916A77716BB0AD831D4A4CAA2BED` | Preserved; two expected results overridden by this companion |
| `qa/reports/latest/mt2/final/mt2-final-qa-report.json` | `503B0479FA4F30DABCA2093FAB0B7F114C1ABEC3A9C487852A578952AA31D4D4` | Historical; two PASS assertions quarantined |
| `qa/tests/mt2/final/mt2-final-qa.config.json` | `5113FC2FEB4CFD60BF81EE90AB1E0B2695250F75493DB2012FFBAB6B0C340117` | Historical execution configuration |

## 6. BA sign-off

BA decision: **ACCEPTED AS THE CONTROLLING SSI-ONLY CORRECTION FOR MT202C-16 AND MT202C-17.**

This sign-off approves the corrected TDD semantics only. Product acceptance remains pending until both cases are rerun through the browser and API with exact machine-oracle evidence. No external FIN validator, FIN NVR or SWIFT Network evidence is required or permitted as an SSI closure condition.

Current SSI-only blocker assessment:

- Design/scope blocker: **NONE** after applying this companion.
- Execution blocker: `MT202C-16` and `MT202C-17` remain **NOT_EXECUTED against the corrected oracle**.
- Final acceptance blocker: the two corrected cases require QA rerun and BA/QA evidence sign-off.
