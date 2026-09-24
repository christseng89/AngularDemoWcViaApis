# BA Ruling — MT202 Field 53a / 58A

Date: 2026-09-12  
Authority: SWIFT Category 2 Message Reference Guide, Standards MT November 2026  
Source: `SWIFT/us2m_20260717.pdf`

## Decision

- K4 (`53a` omitted on the generic MT202 path): **CONFIRMED DEFECT**.
- K5 (generic `58A` has no Party Identifier): **NOT A DEFECT** under the stated generic A1/A2 facts.

## MRG basis

- PDF p.45 begins the field 53a format definition.
- PDF p.46 contains the applicable Usage Rule: where the Sender and Receiver have multiple direct account relationships in the transaction currency and one account is used for reimbursement, field 53a must identify that account using option B with the Party Identifier only.
- PDF p.46 also states that omission of both 53a and 54a implies a single direct account relationship.
- PDF p.52 permits omission of field 57a when the Receiver is also the Account With Institution.
- PDF p.54 requires a Party Identifier in 58A for the specified own-account / book-transfer situations. It does not make the Party Identifier mandatory for the generic A1/A2 beneficiary-institution use.

## Application to A1/A2

The controlled data shows multiple distinct ACTIVE direct USD accounts between the own legal entity and the actual SWIFT Receiver, and the resolver selects a specific Nostro for reimbursement. The current response nevertheless lists `53a` as omitted and records no 53a rendering decision. This violates the p.46 rule.

Expected MT view:

```text
A1
:53B:/DEMO-NOSTRO-001-PRIMARY
:58A:CITIUS33

A2
:53B:/DEMO-NOSTRO-001-EXPCOLL
:58A:CHASUS33
```

For A2, the actual SWIFT Receiver remains `CITIUS33`; `CHASUS33` is the beneficiary institution. Field 57a may remain omitted because the Receiver is also the Account With Institution.

Required evidence decision:

```json
{
  "MT202.53a": {
    "outcome": "INCLUDE",
    "option": "B",
    "rule": "MRG_MT202_53A_MULTIPLE_DIRECT_ACCOUNTS",
    "source": "chosenRoute.nostroId+nostroVersion"
  }
}
```

The rendered account must come from the controlled `accountReference`; it must not silently substitute a semantically different `maskedAccountRef`.

## HTTP and fail-closed behavior

A valid, complete A1/A2 request remains HTTP 200 after the rendering correction. The present HTTP 200 response with a conditionally mandatory 53a omitted is a UAT failure.

If the renderer cannot obtain one unique and valid reimbursement account reference from the chosen route:

- DEVELOPMENT / DEMO: `409 INCORRECT_SSI_CONFIGURATION`.
- Other environments: `500` under the approved environment policy.
- No MT/MX payload and no confirmed resolution may be produced.

The HTTP split is a product policy, not a SWIFT MRG requirement.

## Required tests

1. Multiple valid direct accounts plus a selected reimbursement account: 53B is mandatory and equals the selected `accountReference`.
2. A single valid direct account: 53a may be omitted, but must record `OMITTED_BY_RULE / SINGLE_DIRECT_ACCOUNT_RELATIONSHIP`.
3. No direct account relationship: 53a must be present and identify the reimbursement institution; it must not use the multiple-account Party-Identifier-only rule.

Only accounts for the same own legal entity, actual Receiver, currency and value-date validity may be counted. Version duplicates or invalid data must not be treated as separate direct account relationships.

## Addendum — data validity and environment branches

### Valid operational account identifier

A NULL, blank or whitespace-only `accountReference` cannot satisfy the p.46 Party Identifier requirement and must fail closed. The renderer must not fall back to `maskedAccountRef`: that field is a display/masking value, not an approved operational account identifier.

Direct-account cardinality must use distinct normalized `accountReference` values within this scope:

```text
own legal entity / booking entity
+ actual SWIFT Receiver (accountServicerBic)
+ currency
+ value-date validity
+ ACTIVE status
+ reimbursement purpose/applicability
```

Duplicate rows with the same account string do not create multiple direct-account relationships. A request may proceed when `nostroId + version` pins one ACTIVE authoritative record with a valid `accountReference`. Conflicting duplicate master records, or selection based only on account text, priority or first-row order, must fail closed and be reported as a Data Quality finding.

### Required environment-branch tests

Automated unit or integration evidence must cover both branches:

- DEVELOPMENT / DEMO: HTTP 409 with `INCORRECT_SSI_CONFIGURATION`.
- Other environments: HTTP 500.
- Both branches: `payloadGenerated=false`, no confirmed resolution and no Repair Queue submission.
- The 500 response must not disclose database, SQL, filesystem path or internal exception details.

### Canonical rendering-decision key

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

`MT202.53a` identifies the MRG field family; `renderedTag` identifies the concrete FIN option. This preserves consistency with the existing `MT202.57a` decision key.

### Final A1/A2 acceptance criteria

- A1: actual Receiver `CITIUS33`; pinned Nostro `fe5d672f...` v4; `53B=/DEMO-NOSTRO-001-PRIMARY`; `58A=CITIUS33`.
- A2: actual Receiver `CITIUS33`; beneficiary `CHASUS33`; pinned Nostro `d28b0fc3...` v4; `53B=/DEMO-NOSTRO-001-EXPCOLL`; `58A=CHASUS33`.
- Both return HTTP 200 with payload generated.
- 53B comes from the pinned `accountReference`, never `maskedAccountRef`.
- `MT202.53a` records `INCLUDE / B` and `renderedTag=53B`.
- 57a may be omitted only with the Receiver-is-AWI `OMITTED_BY_RULE` decision.
- 58A Party Identifier remains optional for these two generic cases.
