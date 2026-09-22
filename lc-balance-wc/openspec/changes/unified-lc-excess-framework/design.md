## Context

Current implementation uses Tight Available and earmark／off-balance exposure to reject A8、A3、A3S、B3 amounts above capacity. v11.15 instead introduces a separate customer／bank excess allowance: a transaction remains one business movement, but its amount is deterministically split into Covered and Excess portions. Approved Excess is cumulative owner utilization and survives downstream settlement or honour until an explicit formal regularization or traceable reversal／return／cancellation event adjusts it.

## Goals and Non-Goals

Goals are a single typed policy for the four functions, exact decimal USD-equivalent validation, fail-closed FX gates, atomic Maker reservation and Checker conversion, immutable audit facts, A8→A3S anti-double-counting, downstream eligibility, and complete regression evidence. Non-goals are listed in `proposal.md`; especially, no `FX_RATE_PENDING` state and no production dependency on the `lc-payment-wc` demo endpoint.

## Service Boundaries

- **Excess Policy Service** calculates Covered／Excess in transaction currency and evaluates owner allowance. It has no HTTP or DB details.
- **Allowance Ledger** owns immutable pending reservation、approved utilization、regularization and reversal events plus derived aggregates. It does not own LC contractual amount or legal liability.
- **Currency Exchange Port** synchronously obtains a typed Booking Rate decision snapshot. Production uses an approved external provider adapter; deterministic tests may use a stub.
- **Movement Application Service** owns Maker／Checker authorization, idempotency, orchestration and the unit-of-work boundary.
- **Eligibility Policy** evaluates whether downstream commands may consume the original business movement; it cannot mutate Approved Excess.
- **SG Capacity Ledger** owns `Eligible SG Capacity Outstanding`; the existing SHGT ledger remains authoritative for SG legal／contingent liability.
- **Inquiry／UI** display snapshots and reasons only. They never calculate authoritative allowance or freshness.

## Technical Contracts for Gap Analysis Section 7

### TC-01 — Versioned Configuration

`ExcessPolicyConfig` is an effective-dated, versioned, immutable configuration containing `policyVersion`, owner type, allowance percentage, configured maximum USD equivalent, `fxMaxStaleness`, supported currency precision and activation interval. A submitted movement snapshots the resolved version. Overlapping active versions, missing required values, negative values or unknown owner types fail configuration loading. There is no FX fallback rate under BD-01; “fallback policy” is explicitly `FAIL_CLOSED`.

### TC-02 — Allowance Owner and Ledger

Import owner identity is the stable logical Import LC contract ID; A8、A3、A3S under that LC share it. Export owner identity is the stable logical Export Confirmation contract ID; its B3 movements share it. `excess_account` is unique by `(ownerType, ownerId)` and `excess_ledger_event` is append-only. Derived values are `pendingReservedUsd`, `approvedUtilizedUsd`, `regularizedUsd`, `reversedUsd` and `availableAllowanceUsd`; existing earmark or SHGT ledgers are not reused.

### TC-03 — Status Separation

Excess decision is `NOT_REQUIRED | WITHIN_ALLOWANCE | LIMIT_EXCEEDED`; `LIMIT_EXCEEDED` maps to external `EXCESS_LIMIT_EXCEEDED` and no movement is created. Workflow remains `PENDING | APPROVED | REJECTED | DELETED`; accounting and contract statuses remain separate. FX failure is a command result, never a persisted movement state in this release.

### TC-04 — Formal Increase Allocation

Regularization requires explicit allocation items `(approvedExcessEventId, amountTransactionCurrency)` supplied by the authorized command and validated against outstanding attributable excess. The service SHALL NOT infer FIFO, LIFO or pro-rata allocation. One `FORMAL_INCREASE_REGULARIZATION` event and its allocation rows are appended atomically; original Approved Excess snapshots remain immutable. This is a technical identity contract, not a new prioritization rule.

### TC-05 — Return Documents Identity and Boundary

Return is represented by typed movement `RETURN_DOCUMENTS` with direction `IMPORT` or `EXPORT`, linked to exactly one original approved A3／A3S／B3 event. Natural identity is `(ownerId, originalMovementId, clientEventId)`; it follows Maker／Checker and request-hash idempotency. It reverses only the explicitly returned amount’s Excess attribution and related pending／eligible capacity facts. It creates no external accounting payload by itself; any separate operational accounting remains outside this Balance command. A8 uses its existing cancel／delete／non-issuance lifecycle with the same explicit attribution rule rather than `RETURN_DOCUMENTS`.

### TC-06 — Idempotency

Maker Submit、compound Submit、Fix Pending、Formal Increase and Return／Cancellation commands require `Idempotency-Key`. Scope is `(commandType, ownerId, actorContext, key)`. The canonical request hash includes all business fields and referenced IDs but excludes transport metadata. Same key／same hash replays the original status and body without duplicate movement or reservation; same key／different hash returns `IDEMPOTENCY_CONFLICT`. Compound commands persist one idempotency record in the same unit of work.

### TC-07 — FX Decision Gate

Currency Exchange lookup is a bounded synchronous decision dependency at Maker Submit and Checker Release. The port accepts `baseCurrency`, `quoteCurrency=USD`, amount, `ratePurpose=BOOKING`, `decisionTime`, correlation ID and policy version. It returns exact decimal rate, converted USD amount, source, rate ID/version, rate timestamp, approval status and effective interval. Timeout, transport failure, missing pair, not Approved or not Effective map to `FX_RATE_UNAVAILABLE`; age beyond snapshotted `fxMaxStaleness` maps to `FX_RATE_STALE`. Retry uses the same correlation and command idempotency identity. Responses whose correlation, pair, purpose or provider version do not match the active request are ignored; no late response may create or mutate a transaction.

At Maker failure, the unit of work writes no movement, reservation or partial audit-as-transaction fact. At Checker failure, the pending movement and reservation are unchanged, and a separate command-attempt audit records the failure without changing workflow state.

### TC-08 — Eligible SG Capacity Outstanding

On A8 approval, Eligible SG Capacity is initialized to the approved SG amount and stores Covered／Excess attribution. A3S may reserve then redeem capacity partially or fully; available selection is approved amount less prior capacity redemptions and open reservations. Redeeming capacity transfers attributable coverage to A3S and prevents parent capacity／excess double counting. It does not reduce SHGT legal balance or release contingent liability. Reversal of A3S restores capacity only to the extent of its original allocation and only while the underlying SG remains legally eligible; otherwise an auditable exception is required. A9 and existing SG legal lifecycle remain independent.

## Core Calculation and Invariants

All money uses exact decimal values and currency-aware `ROUND_HALF_UP` only at the specified conversion boundary.

```text
coveredTxn = min(transactionAmountTxn, max(authoritativeCoveredCapacityTxn, 0))
excessTxn  = transactionAmountTxn - coveredTxn
proposedUsd = convert(excessTxn, fresh BOOKING rate)
availableAllowanceUsd = configuredLimitUsd
                      - approvedUtilizedUsd
                      - otherPendingReservedUsd
decision = proposedUsd <= availableAllowanceUsd
```

For A3S, authoritative covered capacity includes the selected SG capacity allocation and excludes the same amount from parent LC capacity exactly once. The owner aggregate is serialized／optimistically versioned so two concurrent submissions cannot both consume the same allowance.

## Maker Data Flow and Transaction Boundary

1. Validate OAS, function eligibility, actor and idempotency.
2. Read authoritative contract／linked ledgers and resolved config version.
3. Calculate Covered／Excess; for non-USD Excess call Currency Exchange and enforce BD-01.
4. Lock／version-check the owner allowance account and validate against approved plus other pending reservations.
5. In one DB transaction persist movement snapshot, FX snapshot, pending excess reservation, idempotency response and audit.
6. On any failure roll back all writes. `FX_RATE_UNAVAILABLE`, `FX_RATE_STALE` and `EXCESS_LIMIT_EXCEEDED` never create a pending movement.

USD transactions use rate 1 with internal source `USD_PAR`, effective at decision time, and do not call the external provider.

## Checker Data Flow and Transaction Boundary

1. Enforce Maker／Checker separation and reload all current facts.
2. Recalculate Covered／Excess and obtain the latest fresh Booking Rate for non-USD.
3. Revalidate allowance against current approved utilization while excluding this movement’s own pending reservation exactly once.
4. If FX unavailable／stale, preserve movement and reservation; append command-attempt audit only.
5. If revaluation exceeds allowance, reject Release with `EXCESS_LIMIT_EXCEEDED` and preserve pending facts for Fix／Reject／Delete handling.
6. On success, atomically convert reservation to Approved Excess, approve movement, update SG capacity when applicable, persist Checker FX snapshot and audit.

## Fix, Delete, Reject and Reversal

Amount Fix is allowed only for pending A8／A3／A3S／B3. It repeats Maker FX and allowance validation and atomically replaces the old reservation; FX failure leaves the original movement and reservation unchanged. Other functions retain protected monetary fields. Reject／Delete release the pending reservation atomically and retain immutable audit. Approved utilization changes only through explicit formal regularization, Return Documents or attributable A8 cancellation／non-issuance events.

## Currency Exchange Adapter Assessment

The inspected `lc-payment-wc/backend/server.js` endpoint `GET /api/fx/rates` declares its data fake/demo, returns an unversioned TWD-quoted table, and stamps response time rather than rate effective time. `FxRateService` caches the table indefinitely, bridges cross rates through TWD using JavaScript number, and converts HTTP failure to `{}`. It has no Booking purpose, Approved／Effective status, rate ID/source/version, freshness or decision correlation.

Therefore the current endpoint MUST NOT be used directly in production or as evidence that FX-01..FX-11 are implemented. It SHALL be extended as a non-production virtual Currency Exchange service whose fixture quote contains exact-decimal `buyRate` and `sellRate`; optional `bookingRate` is returned when explicitly supplied, otherwise the service derives `bookingRate = (buyRate + sellRate) / 2` with exact decimal arithmetic and the configured rate scale／rounding. The virtual response also supplies deterministic Approved／Effective／timestamp／source／version metadata so stale and unavailable cases can be injected. Existing single midpoint values are insufficient to infer a spread; migrated test fixtures must explicitly provide both sides and MAY set both equal to the legacy midpoint when preserving an old deterministic case.

Balance consumes this virtual service only through the same Currency Exchange port used by production adapters and requests `ratePurpose=BOOKING`. It never reads Payment Angular state or `fx-rates.json` directly. Environment validation MUST reject the virtual adapter in production.

The midpoint rule is strictly a non-production fixture behavior. A production Currency Exchange adapter MUST NOT derive, synthesize or fall back to `BOOKING_RATE` from `BUY_RATE`、`SELL_RATE`、mid-market rate or any cached／alternate purpose rate. Production MUST receive a provider-supplied `BOOKING` rate that independently satisfies Approved、Effective and Freshness validation. If that field or its qualifying evidence is absent, the adapter returns unavailable and the application applies BD-01: Maker performs zero writes; Checker denies Release while retaining the pending transaction and reservation.

## API and Data Model Shape

Commands add typed `excessPreview`／`excessDecision` and FX snapshot fields without accepting caller-computed authoritative amounts. Inquiry returns movement snapshot plus owner aggregates and allocation history. Proposed persistence entities are `excess_account`, `excess_ledger_event`, `excess_allocation`, `fx_rate_snapshot`, `sg_capacity_event` and `command_idempotency`; all financial events are append-only, with derived aggregates protected by transaction version.

## Failure, Security and Observability

- Fail closed for missing／invalid configuration, FX, ownership, authorization, stale version or ledger contention.
- Only authenticated roles may submit, fix, release, regularize or reverse; the same actor cannot Maker and Checker the same movement.
- Log correlation IDs, policy／rate versions and reason codes without sensitive payloads; metrics distinguish unavailable, stale, limit exceeded, contention and idempotent replay.
- External provider calls occur before the DB write transaction where possible; persistence revalidates locked state immediately afterward. No network call may hold a long DB lock.

## OOP／OOD／SOLID Decisions

Use ports and adapters for Currency Exchange, Strategy implementations for function-specific covered-capacity rules, and a single typed Excess Policy／Allowance Ledger. Application services depend on narrow interfaces and own orchestration. This keeps calculation, persistence, external integration and presentation separate, supports test doubles, and avoids duplicating A8／A3／A3S／B3 policy. Reject untyped expression rules, UI-authoritative calculations, and inheritance per function.

## Migration, Rollback and Coexistence

Schema migration is additive and verified before feature enablement. Existing events remain non-excess unless an authoritative migration source exists. Feature flags enable each function only after characterization and new regression suites pass. Rollback disables new submit but keeps reads and lifecycle actions for already-created records. Coordination with `configuration-first-product-extension` uses registered typed policies; neither change may weaken core controls.

## Open Questions

No unresolved Business Decision is identified for this Proposal. BD-01 and BD-02 are authoritative. TC-04 and TC-05 deliberately require explicit references rather than inventing business allocation priority or undocumented accounting effects.
