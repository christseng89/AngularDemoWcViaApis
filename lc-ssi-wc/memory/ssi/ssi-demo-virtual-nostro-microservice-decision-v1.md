# SSI Demo Virtual Nostro Microservice Decision v1

Version: 1.0  
Date: 2026-09-17  
Status: PRODUCT OWNER CONFIRMED — BA/QA SAME-SHA REVIEW REQUIRED  
Scope: Development SSI Demo Prototype generated test data only

## 1. Decision

For the SSI Demo Prototype, Nostro evidence is provided by a controlled virtual
microservice (Virtual Nostro Stub). It is not an integration with a real Nostro
microservice, Account Master, production database, or external network service.

The governed lookup contract is:

```text
LOOKUP-VIRTUAL-NOSTRO-OWNER-SERVICER-CURRENCY
implementationMode = CONTROLLED_VIRTUAL_MICROSERVICE
realServiceAccess  = PROHIBITED
realDatabaseAccess = PROHIBITED
sideEffects        = ZERO
```

## 2. Request contract

When an SSI resolution scenario requires Nostro evidence, the scenario must
provide the complete deterministic lookup request. The virtual microservice must
not infer missing business meaning.

```text
accountOwner
accountServicer
currency
officialRole
settlementLeg
valueDate / effective-date context, when applicable
scenario or fixture identity
```

Missing required request parameters fail closed.

## 3. Controlled responses

The virtual microservice may return only:

```text
FOUND
NOT_FOUND
AMBIGUOUS
```

Each response and its exact typed reason must be declared by the approved Rule
Table and Test Oracle. UUID order, database row order, timestamps and runtime
guessing must never select a result.

## 4. MT1/MT2 message-version remediation boundary

The current `pacs.008.001.12/.012 -> pacs.008.001.08` and
`pacs.009.001.12/.012 -> pacs.009.001.08` remediation is message-token
canonicalization. It does not perform SSI resolution or account discovery.

Therefore its invariant is:

```text
virtualNostroStubCallCount = 0
virtualNostroRequest       = NOT_APPLICABLE
realNostroCallCount        = 0
accountMutationCount       = 0
postingCount               = 0
```

The canonicalization operation must preserve the pacs.009 family and canonical
`pacs.009.001.08` membership. It does not authorize deletion of an SSI record,
Applicability record, Nostro record, or account record.

## 5. Later SSI resolution tests

Later MT1/MT2 SSI resolution tests may invoke only the governed virtual
microservice contract. Test fixtures must bind the exact request identity and
expected response in the same-SHA Test Oracle. No test may be represented as
having validated a real Nostro account or real Nostro service.

## 6. Environment boundary

This decision is valid only for generated Development Demo data. It does not
authorize UAT or Production use, real account creation, real Nostro validation,
payment execution, payment posting, or settlement processing.

Any change to this document creates a new SHA and requires BA and QA review of
the same artifact before it can be referenced by an executable Rule Table or
Test Oracle.
