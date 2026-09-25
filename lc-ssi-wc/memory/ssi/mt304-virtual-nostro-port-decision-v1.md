# MT304-003 Virtual Nostro Port Prototype Decision v1

**Status:** CONTROLLED — BA DECIDED  
**Decision date:** 2026-09-17  
**Scope:** DEMO PROTOTYPE ONLY — not a production integration  
**Related baseline:** `memory/ssi/swift-mt347-v2.md`

## 1. Decision

This decision governs a **DEMO PROTOTYPE ONLY**. It validates the SSI
Resolver's virtual outbound contract and typed outcomes; it is not production
Nostro integration evidence and must not be presented as such.

The SSI Resolver owns only:

1. constructing a typed Nostro relationship lookup request from the approved
   MT304-003 RDT row;
2. invoking the `VirtualNostroPort`;
3. verifying controlled request/response identities;
4. interpreting `FOUND`, `NOT_FOUND` or `AMBIGUOUS`;
5. producing the corresponding typed SSI outcome with zero unauthorized side
   effects.

The Prototype shall use a **Controlled Stub only**. It shall not:

- connect to a real Nostro Microservice;
- query or write any Nostro database;
- inspect production or local Nostro account existence;
- validate, repair, create, suppress or otherwise maintain Nostro data;
- use a live database snapshot or a real zero-row query as test precondition
  or evidence.

Production SLA, production deployment, live-account evidence and operational
Nostro data remediation are outside this Demo Prototype scope. Their absence
must not block the Demo contract test, while a Demo PASS must never be reported
as production proof.

## 2. MT304-003 test semantics

MT304-003 shall be expressed as:

> Given an approved RDT-defined request for MT304, business function
> `THIRD_PARTY_DEAL_INSTRUCTION`, sequence `B1`, settlement leg
> `Amount Bought`, SWIFT field `53a`, official role `Delivery Agent`, and the
> exact RDT-approved option, owner, servicer, currency, entity, direction and
> effective-date criteria, when the controlled Virtual Nostro Port returns
> `NOT_FOUND`, the SSI Resolver shall fail closed with
> `REQUIRED_NOSTRO_NOT_FOUND` and shall produce no SSI output, selected route,
> confirmed resolution, repair action, payment/posting action or database
> mutation.

The `NOT_FOUND` response is a controlled virtual-contract stimulus. It does
not assert that HK01 or any other entity has no real Nostro account, and it
does not describe the contents of any real database.

## 3. Controlled evidence

Admissible Prototype evidence consists only of:

- approved RDT row identity, version and SHA;
- controlled virtual-contract fixture identity, version and SHA;
- canonical lookup-request SHA;
- controlled stub-response SHA;
- request/response correlation and context identity;
- expected typed SSI outcome and zero-side-effect assertions.

Real account rows, real Nostro IDs, live database snapshot hashes and
real-service query results are not admissible Prototype evidence.

## 4. Virtual response semantics

- `NOT_FOUND` -> `FAIL_CLOSED_NO_SSI_OUTPUT / REQUIRED_NOSTRO_NOT_FOUND`.
- `AMBIGUOUS` -> `FAIL_CLOSED_NO_SSI_OUTPUT / AMBIGUOUS_NOSTRO`; UUID,
  row-order, created-at and other technical tie-breakers are prohibited.
- `FOUND` supplies one controlled virtual evidence result for continued SSI
  route adjudication only; it does not confirm or select the final route.

`FOUND`, `NOT_FOUND` and `AMBIGUOUS` are separate controlled virtual-contract
cases. None may call or infer from a real Nostro service or database.

## 5. SWIFT and project boundary

The SWIFT FIN evidence is limited to SR2026 `us3ma_20260717.pdf`, MT304
format-table pages 123–124, field No. 30: sequence B1 `53a Delivery Agent`,
Mandatory, option A or J; source SHA-256:
`5B4315EF876FF32C416BF445C0ADB063D6E0A1600EF93F55DF73F98A175457E5`.

The MRG does not determine the virtual response, owner HK01, servicer, dataset
class or API reason code. The approved RDT must provide the exact request
values. The Controlled Stub and any future Generator shall not infer
direction, 53A versus 53J, owner/entity mapping, servicer, currency, purpose or
effective-date policy.

This decision is consistent with:

- `memory/ssi/swift-mt347-v2.md` sections 4 and 7;
- `memory/governance/lc-ssi-wc-operating-model-zh-v2.md`;
- `memory/ssi/ssi-resolver-service-boundary-v1.md`;
- `memory/governance/mt347-oas-page-parameters-ui-standard-v1.md`.

## 6. OWN53 conflict disposition

The prior `OWN53-CONFLICT` is **CLOSED**. A legacy Active Nostro record is
irrelevant to this Prototype case because MT304-003 is driven exclusively by a
controlled virtual response. No existing Nostro record shall be linked as
runtime proof, changed or repaired for this case.

The earlier requirement for a live Nostro lookup, a matching live snapshot or
a real zero-row query is withdrawn and superseded by this decision.

## 7. Authorization boundary

This decision does not close `OPEN-MT347-RDT-ORACLE-V1`, authorize
Generator/TDD, permit fixture regeneration, or authorize any source-code,
ACTIVE-record or database mutation.

The following RDT values remain subject to PO and Treasury SSI Data Owner
approval: direction, 53A versus 53J, owner stable-ID mapping, servicer stable
ID, purpose and effective-date rule. The API Product Owner must approve the
HTTP and response-envelope contract. BA and QA must review the same artifact
SHAs before any executable implementation begins.
