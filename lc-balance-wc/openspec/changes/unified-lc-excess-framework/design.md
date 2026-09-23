## Final Change Update Precedence（2026-09-23）

`信用證超押處理業務需求_v11.15_V4_BA_REVIEW_FIXED_V2.docx`（FROZEN）及Owner其後明確確認的BUG決策是本輪業務基準。A8、A9與A3S SG Redemption behavior完全在本Change之外；其timing、ledger、legal effect、Available Balance update及lifecycle SHALL保持current spec／`main`不變。本Change只為A3S Covered／Excess計算淨除本筆自身SG redemption與LC UTILIZE legs，並保存main產生的Current SG Redemption Amount。較早以`selected existing Eligible SG Capacity`直接作為Excess基礎的設計，以及B3-only authorization／B4 read-only設計，均由V2取代且不再具規範性。Renewed Change Approval已於2026-09-23 PASS；2026-09-24 Owner確認A4／A6／B4統一ABSENT操作為approved bug correction，可同步更新implementation與OpenSpec。

## Context

Current implementation uses Tight Available and earmark／off-balance exposure to reject A3、A3S、B3 amounts above capacity. Under FROZEN V2, A3／A3S／B3 may be deterministically split into Covered and Excess portions; A3S uses a normalized parent basis plus the Current SG Redemption Amount produced by main. Approved Excess is cumulative owner utilization and survives downstream settlement or honour; this release provides no Return Documents、partial cancellation or Approved Excess reversal capability.

## Goals and Non-Goals

Goals are one typed Excess policy for A3／A3S／B3, exact-decimal owner-currency allowance validation, fail-closed FX gates, atomic Maker reservation and Checker conversion, immutable Legal／Covered／Excess facts, normalized A3S anti-double-counting without changing main SG processing, downstream eligibility, and complete regression evidence. Non-goals are listed in `proposal.md`; especially, no `FX_RATE_PENDING` state and no production dependency on the `lc-payment-wc` demo endpoint.

## Service Boundaries

- **Excess Policy Service** calculates Covered／Excess in transaction currency and evaluates owner allowance. It has no HTTP or DB details.
- **Allowance Ledger** owns immutable pending reservation、reservation release and approved utilization events plus derived aggregates. It does not own LC contractual amount, Formal Increase cure, Return Documents, cancellation reversal or legal liability.
- **Currency Exchange Port** synchronously obtains a typed Booking Rate decision snapshot. Production uses an approved external provider adapter; deterministic tests may use a stub.
- **Movement Application Service** owns Maker／Checker authorization, idempotency, orchestration and the unit-of-work boundary.
- **Eligibility Policy** evaluates whether downstream commands may consume the original business movement; it cannot mutate Approved Excess.
- **Main A3S Facts Port** reads the Base Parent Tight inputs and Current SG Redemption Amount produced by existing main behavior. It does not create、redeem or alter SG capacity.
- **Inquiry／UI** display snapshots and reasons only. They never calculate authoritative allowance or freshness.

## Technical Contracts for Gap Analysis Section 7

### TC-01 — Versioned Configuration

`ExcessPolicyConfig` is an effective-dated, versioned, immutable configuration containing `policyVersion`, owner type, allowance percentage, configured maximum USD amount, `fxMaxStaleness`, supported currency precision, activation interval and an explicit Previous Business Day fallback policy with `fallbackPolicyId`／`fallbackPolicyVersion`. An accepted movement snapshots the resolved version; a rejected over-limit command persists no transaction fact. Overlapping active versions, missing required values, negative values or unknown owner types fail configuration loading. PBD fallback is allowed only when the FX Policy explicitly authorizes it and the provider supplies a `BOOKING` rate that remains Approved／Effective and within Max Staleness; policy ID/version, reason, rate date and source are snapshotted only for an accepted command. All other fallback or derivation fails closed under BD-01.

### TC-02 — Allowance Owner and Ledger

Import owner identity is the stable logical Import LC contract ID for A3／A3S Excess. Export owner identity is the stable logical Export Confirmation contract ID for B3. `excess_account` is unique by `(ownerType, ownerId)` and `excess_ledger_event` is append-only.

Transaction currency is an invariant of the owner: `A3/A3S.transactionCurrency == ImportLC.currency` and `B3.transactionCurrency == Confirmation.currency`. A mismatch fails validation before FX or persistence. Therefore `excessTxn` is already `proposedExcessOwner`; there is no transaction-excess→owner second conversion. The only V4 FX conversion is the configured USD cap→owner currency contract in TC-07.

### TC-03 — Status Separation

The accepted movement stores only an eligible Excess decision. `EXCESS_LIMIT_EXCEEDED` is a command-level business error, not a persisted movement state. For an Excess-enabled, otherwise valid command whose projected total exceeds the calculable Effective Limit, Maker Submit returns HTTP `409`／`EXCESS_LIMIT_EXCEEDED` and performs zero writes. It does not create a `PENDING` movement, reservation, FX／decision snapshot, ledger event or idempotent success, and therefore no `LIMIT_EXCEEDED`／`BLOCKED` workflow fact exists for later Checker action. Workflow remains `PENDING | APPROVED | REJECTED | DELETED`; accounting and contract statuses remain separate. FX failure is likewise a command result, never a persisted movement state in this release.

### TC-04 — Formal Increase Guidance Boundary

This change does not modify existing A2／B2 transaction processing and introduces no Excess Allocation／Cure command, `FORMAL_INCREASE_REGULARIZATION` event or automatic Approved Excess reduction. A3／A3S／B3 validation and Resubmit may read the latest Checker-released Approved Contractual Maximum produced by the existing A2／B2 lifecycle. Pending, rejected or deleted A2／B2 facts are never authoritative.

Minimum Required Increase is the smallest non-negative owner-currency minor-unit contractual increment satisfying the same authoritative capacity、allowance、FX、rounding and committed-excess predicate while all other current-snapshot inputs are fixed. For an initial over-limit rejection no retained reservation exists; for Fix Pending the calculation excludes／replaces the existing accepted movement reservation exactly once without committing the rejected replacement. It never creates, modifies or submits A2／B2. If no finite increase alone resolves the breach, the response says so; if FX contributes to the breach, the response identifies that contribution. A partial Formal Increase means a subsequent fresh Submit remains rejected with zero writes; an increase beyond the minimum becomes ordinary contractual capacity and does not cure or rewrite Approved Excess history.

### TC-05 — Full Delete Pending Boundary

This release exposes no `RETURN_DOCUMENTS` movement, partial return／cancellation amount, `RETURN_REVERSAL` or `CANCELLATION_REVERSAL` event. Delete Pending is the sole withdrawal boundary for A3／A3S／B3: it accepts the complete `PENDING` or `REJECTED` movement identity, accepts no amount, atomically transitions the whole movement to `DELETED`, releases the whole Pending Excess Reservation and appends deletion audit. It rejects `APPROVED`／`RELEASED` movements and never changes Approved Excess utilization.

### TC-06 — Idempotency

Maker Submit、compound Submit、Fix／Resubmit Pending and Delete Pending commands require `Idempotency-Key`. Scope is `(commandType, ownerId, actorContext, key)`. The canonical request hash includes all business fields and referenced IDs but excludes transport metadata. Same key／same hash replays the original status and body without duplicate movement, reservation release or deletion audit; same key／different hash returns `IDEMPOTENCY_CONFLICT`. Compound commands persist one idempotency record in the same unit of work.

### TC-07 — FX Decision Gate

Currency Exchange lookup is a bounded synchronous decision dependency for A3／A3S／B3 Maker Submit and applicable Checker points: B3 own Release, A3／A3S Acknowledge and A4／A6 final Release. The existing provider-supplied BOOKING、Approved／Effective／Freshness、attempt matching and fail-closed contracts remain unchanged for the three Excess-enabled functions.

At Maker failure, the unit of work writes no movement, reservation or partial audit-as-transaction fact. At Checker failure, the pending movement and reservation are unchanged, and a separate command-attempt audit records the failure without changing workflow state. A policy-authorized PBD quote is valid only when it is provider-supplied for `BOOKING`, Approved／Effective and fresh under the same Max Staleness check; `fallbackReason`, `rateDate`, `source` and policy authorization are immutable audit evidence. Balance never derives, inverts or substitutes the rate.

### TC-08 — A3S Normalized Capacity and Locked Split

For A3S, `A3S Base Parent Tight Available` is the parent Tight snapshot normalized to exclude this transaction's own SG redemption leg and LC UTILIZE earmark／movement effect. `Current SG Redemption Amount` is the amount actually redeemed by existing main logic. The authoritative formulas are `Effective Presentation Capacity = A3S Base Parent Tight Available + Current SG Redemption Amount`, `Covered = MIN(Arrival Amount, Effective Presentation Capacity)`, and `Excess = MAX(0, Arrival Amount - Covered)`. The calculation MUST produce the same result while the SG leg is still pending and MUST NOT count either self-leg twice. Checker Acknowledge locks Legal Amount、Covered Amount、Excess Amount and the calculation snapshot; A3S additionally locks Base Parent Tight、Current SG Redemption Amount and Effective Presentation Capacity. A4／A6 SHALL NOT re-split those locked amounts because later parent capacity changes. Existing main entries remain `SG = -Current SG Redemption Amount` and `LC UTILIZE = -Covered`; unsigned parent capacity consumption is `Covered - Current SG Redemption Amount`, while its signed balance movement is `-(Covered - Current SG Redemption Amount)`.

### TC-09 — Zero Allowance Legacy Routing

After resolving one effective policy, A3／A3S／B3 evaluate the two allowance values before Covered／Excess processing.

The zero-allowance route performs no Currency Exchange call and persists no FX or Excess fact. It does not produce `NOT_REQUIRED`, `WITHIN_ALLOWANCE`, `LIMIT_EXCEEDED` or `EXCESS_LIMIT_EXCEEDED`, because no Excess decision is started. Maker／Checker continue through their existing non-Excess lifecycle. Both values must be strictly greater than zero before the Excess Framework may run.

### TC-10 — A3S Sequential Guidance

For A3S, the UI and API first return eligible SG alternatives and instruct the user to re-select; the system never auto-selects an SG. It does not simultaneously show Minimum Required Increase for the current SG selection. After the user selects a different eligible SG, the service re-reads the resulting Current SG Redemption Amount, re-normalizes A3S Base Parent Tight Available and recalculates Effective Presentation Capacity and the complete Excess decision. Only if the recalculated result remains insufficient may the response show the newly calculated Minimum Required Increase and guide the user to the existing A2 process.

### TC-11 — A3／A3S Post-Acknowledge Fix Boundary

A3 and A3S Amount Fix are eligible only before Checker Acknowledge. After `acknowledgedAt` is set, their Legal／Covered／Excess monetary state is immutable whether LC UTILIZE remains `PENDING`／EARMARKED or is subsequently `REJECTED`; neither Fix nor Resubmit may reopen Amount. The UI disables／protects Amount and the API independently rejects an Amount Fix／Resubmit with HTTP `409`／`ILLEGAL_STATE_TRANSITION` before policy resolution, FX, allowance or persistence. The rejection is zero-write and preserves movement、amount、reservation and locked snapshots. A3S additionally preserves Base Parent Tight、Current SG Redemption Amount、Effective Presentation Capacity and all main SG facts. BD-07 whole Delete Pending remains a separate allowed command for `PENDING|REJECTED`; remarks-only correction remains governed by existing function policy.

### TC-12 — Business Case Runner Auto-remediation Boundary

Business Case Runner的指定驗證案例可在收到HTTP `409 EXCESS_LIMIT_EXCEEDED`且guidance為`FINITE`時，依Minimum Required Increase自動建立並Release A02／B02，再fresh Submit原交易。此為demo測試編排，不是Balance Component、production UI或production API能力；負Tight snapshot、其他error code及非`FINITE` guidance不得觸發。原超限Submit仍須先完成zero-write驗證，亦不得產生cure／allocation或隱藏workflow state。

### TC-13 — Applicant Waiver Snapshot and Gate（SUPERSEDED）

2026-09-24 BUG決策以B4操作為標準取代本contract。A4／A6正數Excess不再要求`applicantWaiverValidationResult = CONFIRMED`、不回傳`APPLICANT_WAIVER_REQUIRED`，亦不建立Applicant Waiver snapshot。歷史API欄位及table只作向後相容，不是新Release的必要或權威fact。

### TC-14 — B4 Export Authorization Without Lookup Service

Authorization input is an optional claim evaluated when B4 creates the Covered and Excess assets, not at B3. A positive B4 Excess decision snapshots `claimStatus = ABSENT | SUBMITTED`、nullable `authorizationReference`／`authorizedAmountOwner`／`authorizedCurrency`、`authorizationValidationResult`、Checker identity／timestamp and resolved `excessDebtor`. The service objectively validates nonblank reference、`authorizedAmountOwner >= locked excessAmountOwner` and owner-currency equality. Checker manually confirms scope、applicability、authenticity and business validity with `CONFIRMED`. Only a fully valid claim attributes the entire Excess to `ISSUING_BANK`; absent、partial、currency-mismatched or non-confirmed claims attribute the entire Excess to `BENEFICIARY_OR_RECOURSE_PARTY`. `Checker == Maker` rejects the complete B4 Checker action with `MAKER_CHECKER_CONFLICT` and zero asset writes; it cannot fall back to Recourse. Partial split、later debtor conversion and an authorization lookup port／microservice are out of scope.

### TC-15 — Export Covered and Excess Asset Posting

The canonical dedicated Excess balance type is `EXPORT_EXCESS_ASSET`. Existing Covered mappings remain unchanged: Sight uses `Due from Issuing Bank`; Usance uses `Reimbursement Receivable`. B4 posting creates two separately mapped asset legs in one atomic business event:

```text
coveredAssetAmountOwner = coveredAmountOwner
excessAssetAmountOwner  = excessAmountOwner
legalAmountOwner        = coveredAssetAmountOwner + excessAssetAmountOwner
```

`EXPORT_EXCESS_ASSET` is used regardless of whether debtor attribution is Issuing Bank or Beneficiary／Recourse Party. `balance-account-mappings.json` and accounting-voucher projections MUST expose distinct mapping keys／account identities and MUST NOT rename existing Covered balance types to `Issuing Bank Asset`. B4 consumes the source B3 earmark and creates both asset legs atomically; B5 must preserve separation and cannot auto-clear／merge the Excess Asset without a later approved recovery contract.

### TC-16 — Downstream Legal Outstanding Versus Attribution

A6 creates／updates the complete Legal Acceptance Outstanding while retaining the Acknowledge-locked Covered／Excess attribution; it introduces no new capacity-control running balance. A7 reduces only Legal Acceptance Outstanding and performs no Covered-first、Excess-first or pro-rata allocation, leaving Approved Excess unchanged. B5 follows the same legal-outstanding boundary: it may settle existing Legal Acceptance Outstanding but cannot auto-clear、merge or reclassify the B4 Covered Asset／`EXPORT_EXCESS_ASSET`, and cannot reduce Approved Excess.

### TC-17 — Covered-only Formal Capacity Impact

Only locked Covered Amount may affect formal LC／Confirmation capacity. A3／A3S LC UTILIZE and B3 capacity earmark equal Covered, never Legal Amount. A4／A6／B4 finalise or consume only that locked Covered amount. Excess exists exclusively in the Excess ledger／attribution and MUST NOT increase、reduce、restore or double-consume Tight／formal capacity; therefore an allowed overdrawn transaction cannot make Tight negative through its Excess portion.

### TC-18 — Four Protected Exceed Fields and Zero-write Preview

A3／A3S／B3 SHALL expose the following four read-only fields in transaction currency. Because TC-02 requires transaction currency to equal allowance-owner currency, no second transaction-to-owner conversion exists:

```text
previousExceedAmount = sum(active outstanding Pending Excess Reservations
                         + active outstanding Approved Excess utilization),
                        excluding terminal RELEASED／REVERSED／DELETED／EXPIRED
                        allowance commitments and excluding the current Fix／Resubmit identity once
thisExceedAmount     = max(0, transactionAmount - effectivePresentationCapacity)
totalExceedAmount    = previousExceedAmount + thisExceedAmount
lcAmountTxn           = issueLcAmount
                      + cumulative formal／Checker-approved Increase
                      - cumulative formal／Checker-approved Decrease
percentageMaximumTxn = LC Amount excluding tolerance
                       * allowancePercentage
configuredMaximumTxn = configuredMaximumUsd converted to transaction currency
                       with the TC-07 compliant rate
maximumExceedAmount  = min(percentageMaximumTxn, configuredMaximumTxn)
```

`RELEASED` in this aggregation means that the allowance commitment itself is no longer outstanding; a downstream movement status alone MUST NOT silently release Approved Excess contrary to TC-05／TC-16. For Fix／Resubmit preview and authoritative validation, the current movement's existing reservation is excluded exactly once from `previousExceedAmount`; it remains persisted unchanged until a successful atomic replacement.

`maximumExceedAmount` is the final MIN result, never the raw provider-converted USD cap. The face-amount operand excludes tolerance-added capacity. If `configuredMaximumUsd = 0` OR `allowancePercentage = 0`, `maximumExceedAmount = 0` and the owner has no Excess capability under TC-09; no provider call or Excess validation is started.

For Import, `LC Amount` uses only the Checker-released Issue amount and cumulative formal／Checker-approved A2 amount increases and decreases. Pending、unapproved、rejected or deleted amendments do not change it; tolerance、tolerance-only and expiry-only amendments are excluded. Each decrease is subtracted by its approved non-negative magnitude. Export continues to use the equivalent current Checker-released Confirmation face amount.

The preview API is calculation-only and zero-write: it SHALL NOT create or update movement、reservation、ledger、FX／decision snapshot、audit-as-transaction fact or idempotent success. USD uses `USD_PAR` with zero provider calls. Non-USD SHALL use a provider-supplied `BOOKING` quote that is Approved、Effective and Fresh under TC-07; unavailable or invalid rate returns `FX_RATE_UNAVAILABLE`, while stale returns `FX_RATE_STALE`, with no partial fields treated as authoritative. Maker Submit SHALL ignore caller-provided or stale preview values and recalculate all four fields from current committed facts and a newly valid decision-point rate before any write.

### TC-19 — One Checker Excess Approval Presentation

`CheckerExcessReviewComponent` is one presentation-only component with one public approval contract: `amount`、`currency`、`approved` and `approvedChange`. It renders identical DOM order、labels、red warning styling and approval control for A4、A6 and B4. Parent orchestration treats all three as the same simple `ABSENT` claim path；A4／A6不產生Applicant Waiver payload／snapshot，B4提交`claimStatus = ABSENT`及`authorizationValidationResult = NOT_CONFIRMED`。Release remains disabled until the common approval is checked. Reject remains available without approval. The backend B4 Submitted-authorization command contract is retained for API compatibility but is not exposed by the demo UI.

## Core Calculation and Invariants

All money uses exact decimal values and currency-aware `ROUND_HALF_UP` only at the specified conversion boundary.

```text
if configuredMaximumUsd == 0 OR allowancePercentage == 0:
    route = LEGACY_SUFFICIENCY
    if transactionAmountTxn > authoritativeCoveredCapacityTxn:
        reject 409 INSUFFICIENT_AVAILABLE_BALANCE
    else:
        continue legacy Maker／Checker flow
else:
    route = EXCESS_FRAMEWORK

assert transactionCurrency == ownerCurrency
coveredTxn = min(transactionAmountTxn, max(authoritativeCoveredCapacityTxn, 0))
excessTxn  = transactionAmountTxn - coveredTxn
proposedExcessOwner = excessTxn
approvedAllowanceBaseOwner = approved face amount excluding tolerance-added capacity
percentageAllowanceOwner = approvedAllowanceBaseOwner * allowancePercentage
configuredMaximumOwner = provider.convertedAmount(
    fromCurrency=USD,
    toCurrency=ownerCurrency,
    amount=configuredMaximumUsd,
    purpose=BOOKING)
effectiveLimitOwner = min(percentageAllowanceOwner, configuredMaximumOwner)
availableAllowanceOwner = max(0,
    effectiveLimitOwner
  - approvedUtilizedOwner
  - otherPendingReservedOwner)
decision = proposedExcessOwner <= availableAllowanceOwner
```

For Import LC, `approvedAllowanceBaseOwner = Checker-released Issue LC Amount + cumulative formal／Checker-approved A2 Increase - cumulative formal／Checker-approved A2 Decrease`, excluding pending／unapproved amendments and Amount Tolerance. Tolerance may increase `authoritativeCoveredCapacityTxn`, but never the percentage allowance base. For Export Confirmation, the equivalent base is the current Checker-released Confirmation face amount. This distinction is normative: `10,000` face amount + `10%` tolerance + `2%` allowance gives Covered capacity `11,000` and Percentage Allowance `200`, not `220`.

For A3S, `authoritativeCoveredCapacityTxn` is the normalized Effective Presentation Capacity defined in TC-08. Every accepted A3／A3S／B3 event stores Legal Amount、Covered Amount、Excess Amount and workflow／Excess statuses; A3S also stores Base Parent Tight、Current SG Redemption Amount and Effective Presentation Capacity. The owner aggregate is serialized／optimistically versioned so two concurrent submissions cannot both consume the same allowance.

## Maker Data Flow and Transaction Boundary

1. Validate OAS, function eligibility, actor and idempotency.
2. Read authoritative facts for A3／A3S／B3, resolve config and apply BD-03 routing. For A3S, normalize Base Parent Tight by excluding this transaction's self SG and LC UTILIZE legs, then read Current SG Redemption Amount from main.
3. For an enabled Excess policy, calculate Covered／Excess in owner currency; for a non-USD owner call Currency Exchange with USD→owner direction to obtain the configured cap `convertedAmount` and enforce BD-01.
4. Lock／version-check the owner allowance account and validate against approved plus other pending reservations.
5. If projected total exceeds the Effective Limit, return HTTP `409`／`EXCESS_LIMIT_EXCEEDED` with Minimum Required Increase guidance and write nothing.
6. Otherwise, in one DB transaction persist movement snapshot, FX snapshot, pending excess reservation, eligible decision, idempotency response and audit. FX、configuration、pre-domain、over-limit or persistence failure creates no transaction fact.

Normative A3S example: Base Parent Tight `4,000` plus Current SG Redemption `6,000` gives Effective Capacity `10,000`. Arrival `10,200` therefore gives Covered `10,000` and Pending Excess `200`; main entries remain SG `-6,000` and LC UTILIZE `-10,000`, so parent net effect is `-4,000`. Maker Submit MUST return Excess `200` even while its SG redemption leg is pending, never `6,200`.

USD allowance owners use identity conversion rate 1 with internal source `USD_PAR`, effective at decision time, and do not call the external provider.

## Checker Data Flow and Transaction Boundary

1. Enforce Maker／Checker separation and reload all current facts.
2. At A3／A3S Acknowledge, recalculate and then lock Legal／Covered／Excess using current authoritative facts; A3S uses TC-08 normalization and locks its three capacity inputs. Obtain the latest provider-converted USD cap using a fresh USD→owner Booking quote for a non-USD allowance owner.
3. Revalidate allowance against current approved utilization while excluding this movement’s own pending reservation exactly once.
4. If FX unavailable／stale or revaluation exceeds allowance, deny the Checker action, preserve movement and reservation unchanged and append only the permitted command-attempt audit.
5. For B3, success atomically converts reservation to Approved Excess and locks the B3 Legal／Covered／Excess snapshot; authorization is not decided here.
6. For A3／A3S Checker Acknowledge, success keeps LC UTILIZE `PENDING`／EARMARKED and its reservation Pending while locking the split. Existing main A3S SG processing executes exactly as before.
7. For A4／A6, revalidate FX、allowance and release eligibility against the locked split after the common ABSENT Checker approval. Do not require Applicant Waiver and do not recalculate Covered／Excess from later parent capacity. Success converts the reservation and finalises locked Covered; failure leaves all pending facts unchanged.
8. For B4, validate the optional authorization claim, resolve all-or-nothing debtor attribution and atomically create Covered Asset plus `EXPORT_EXCESS_ASSET` from the locked B3 split.

## Fix, Delete and Reject

Amount Fix／Maker Resubmit is allowed for pending or rejected B3 and only pre-Acknowledge A3／A3S. All repeat Maker FX／allowance and atomically replace the reservation. A3S additionally re-normalizes Base Parent Tight, re-reads Current SG Redemption Amount and recalculates Effective Capacity／Covered／Excess. Post-Acknowledge A3 and A3S Amount Fix are prohibited. Reject／Delete and immutable Approved Excess behavior remain unchanged.

Fix Pending replacement uses the same pending identity and one unit of work:

```text
newPendingTransactionTotal = currentPendingTransactionTotal
                           - oldPendingTransactionAmount
                           + newPendingTransactionAmount
newPendingExcessTotal      = currentPendingExcessTotal
                           - oldPendingExcessReservation
                           + newlyRecalculatedPendingExcessReservation
```

The service validates the proposed replacement against authoritative current facts before committing either equation. It never releases the old amount／reservation first. On FX、allowance、A3S normalization／main validation、store or audit failure, the original pending movement、amount、reservation and authoritative snapshots remain unchanged.

Example with LC capacity `10,000`: original A3 amount `10,200` has Pending Excess `200`. Fix to `10,300` replaces it with Pending Excess `300`; Fix to `10,100` replaces it with Pending Excess `100`. The old `200` is excluded exactly once and is never added to the new result. The recalculated result then follows the ordinary current-snapshot limit decision; replacement arithmetic does not bypass allowance validation.

## Currency Exchange Adapter Assessment

The inspected `lc-payment-wc/backend/server.js` endpoint `GET /api/fx/rates` declares its data fake/demo, returns an unversioned TWD-quoted table, and stamps response time rather than rate effective time. `FxRateService` caches the table indefinitely, bridges cross rates through TWD using JavaScript number, and converts HTTP failure to `{}`. It has no Booking purpose, Approved／Effective status, rate ID/source/version, freshness or decision correlation.

Therefore the current endpoint MUST NOT be used directly in production or as evidence that FX-01..FX-11 are implemented. It SHALL be extended as a non-production virtual Currency Exchange service whose fixture quote contains exact-decimal `buyRate` and `sellRate`; optional `bookingRate` is returned when explicitly supplied, otherwise the service derives `bookingRate = (buyRate + sellRate) / 2` with exact decimal arithmetic and the configured rate scale／rounding. The virtual response also supplies deterministic Approved／Effective／timestamp／source／version metadata so stale and unavailable cases can be injected. Existing single midpoint values are insufficient to infer a spread; migrated test fixtures must explicitly provide both sides and MAY set both equal to the legacy midpoint when preserving an old deterministic case.

Balance consumes this virtual service only through the same Currency Exchange port used by production adapters and requests `ratePurpose=BOOKING`. It never reads Payment Angular state or `fx-rates.json` directly. Environment validation MUST reject the virtual adapter in production.

The midpoint rule is strictly a non-production fixture behavior. A production Currency Exchange adapter MUST NOT derive, synthesize or fall back to `BOOKING_RATE` from `BUY_RATE`、`SELL_RATE`、mid-market rate or any cached／alternate purpose rate. Production MUST receive a provider-supplied `BOOKING` rate that independently satisfies Approved、Effective and Freshness validation. If that field or its qualifying evidence is absent, the adapter returns unavailable and the application applies BD-01: Maker performs zero writes; Checker denies Release while retaining the pending transaction and reservation.

## API and Data Model Shape

Commands add typed Excess／FX fields plus B4 `exportAuthorizationValidation` snapshots. Every source event persists Legal／Covered／Excess and statuses; A3S also persists Base Parent Tight、Current SG Redemption Amount and Effective Presentation Capacity. New A4／A6 releases do not persist waiver facts；B4 authorization facts and dedicated Excess Asset attribution remain without authorization lookup state. Accounting mappings add canonical `EXPORT_EXCESS_ASSET`; existing `Due from Issuing Bank` and `Reimbursement Receivable` keys remain unchanged.

## Failure, Security and Observability

- Fail closed for missing／invalid configuration, FX, ownership, authorization, stale version or ledger contention.
- Only authenticated roles may submit, fix／resubmit, release or Delete Pending; the same actor cannot Maker and Checker the same movement.
- Log correlation IDs, policy／rate versions and reason codes without sensitive payloads; metrics distinguish unavailable, stale, limit exceeded, contention and idempotent replay.
- External provider calls occur before the DB write transaction where possible; persistence revalidates locked state immediately afterward. No network call may hold a long DB lock.

## OOP／OOD／SOLID Decisions

Use ports and adapters for Currency Exchange only; authorization validation is an internal typed policy plus Checker assertion, not an external port. Function strategies cover A3／A3S／B3 Excess. Accounting mapping strategy emits existing Covered Asset plus dedicated Excess Asset legs atomically.

## Migration, Rollback and Coexistence

Schema migration is additive and verified before feature enablement. Existing events remain non-excess unless an authoritative migration source exists. Feature flags enable each function only after characterization and new regression suites pass. Rollback disables new submit but keeps reads and lifecycle actions for already-created records. Coordination with `configuration-first-product-extension` uses registered typed policies; neither change may weaken core controls.

## Open Questions

No unresolved Business Decision remains in this Change Update. FROZEN V2 establishes normalized A3S calculation、Acknowledge split lock、A4／A6 no re-split、B4 all-or-nothing Export authorization and dedicated `EXPORT_EXCESS_ASSET`; the 2026-09-24 BUG decision establishes the common A4／A6／B4 ABSENT Checker approval. Scope-excluded behavior remains governed by current spec and `main`.
