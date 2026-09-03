# Balance Component Submit APIs examples

This guide shows the Maker Submit API used by the `lc-balance-wc` reference UI for Import functions A1–A11 and Export functions B1–B7. A5 has been removed and has no API.

The examples call the Balance Component microservice directly:

```bash
BASE="http://localhost:4100"
```

Replace every `<...>` placeholder with an ID returned by the Catalog, lookup, movement, or snapshot APIs. `eventSeq` must be unique within the target Balance Contract. Monetary values are unformatted decimal strings on the wire.

For A2/B2 monetary amendments, send the non-negative whole-number change magnitude in `toleranceChangePct`
and its direction in `toleranceChangeDirection`. A PENDING Movement returns the old approved value in
`tolerancePct` and echoes both change fields; after Checker Release, Movement/Contract `tolerancePct`
contains the calculated final value.
The service recalculates the old and new full-contract upper limits, rounds each to the currency minor unit with
`ROUND_HALF_UP`, and posts their difference. Do not send `tolerancePct` on `AMEND_EXPIRY_DATE`.
A2/B2 may change Amount only, Tolerance only, or both. For Tolerance-only, keep the required wire field as
`"amount":"0"`; zero Amount plus an omitted/zero Tolerance Change is rejected as a no-op. A1/B1
`tolerancePct` and A2/B2 `toleranceChangePct` accept integer strings only.

## API routing summary

| Function  | Maker Submit endpoint                               | Movement shape                                                       |
| --------- | --------------------------------------------------- | -------------------------------------------------------------------- |
| A1        | `POST /balance-movements`                           | `IPLC_LC / ISSUE`                                                    |
| A2        | `POST /balance-movements`                           | `IPLC_LC / AMEND_INCREASE`, `AMEND_DECREASE`, or `AMEND_EXPIRY_DATE` |
| A3        | `POST /balance-movements`                           | `IPLC_LC / UTILIZE`                                                  |
| A3S       | `POST /balance-movements/compound`                  | SG redemption plus `IPLC_LC / UTILIZE`                               |
| A4        | `POST /balance-movements/{movementId}/maker-submit` | Marks an existing A3/A3S movement as Maker Submitted                 |
| A5        | None                                                | Removed from Balance Component                                       |
| A6        | `POST /balance-movements`                           | `IPLC_ACCEPTANCE / CREATE`                                           |
| A7        | `POST /balance-movements`                           | `IPLC_ACCEPTANCE / FULL_SETTLE` or `PARTIAL_SETTLE`                  |
| A8        | `POST /balance-movements`                           | `SHGT / ISSUE`                                                       |
| A9        | `POST /balance-movements`                           | `SHGT / FULL_REDEEM`                                                 |
| A10       | `POST /balance-movements`                           | `IPLC_LC / CLOSE`                                                    |
| A11       | `POST /balance-movements`                           | `IPLC_LC / REOPEN`                                                   |
| B1        | `POST /balance-movements`                           | `EPLC_CONFIRMATION / ISSUE`                                          |
| B2        | `POST /balance-movements`                           | `EPLC_CONFIRMATION / AMEND` or `AMEND_EXPIRY_DATE`                   |
| B3        | `POST /balance-movements`                           | `EPLC_EXAMINATION / CREATE`                                          |
| B4 Sight  | `POST /balance-movements/compound`                  | `HONOUR` plus Due From Issuing Bank                                  |
| B4 Usance | `POST /balance-movements/compound`                  | `ACCEPT` plus Acceptance and Reimbursement Receivable                |
| B5        | `POST /balance-movements`                           | `EPLC_ACCEPTANCE / FULL_SETTLE`                                      |
| B6        | `POST /balance-movements`                           | `EPLC_CONFIRMATION / CLOSE`                                          |
| B7        | `POST /balance-movements`                           | `EPLC_CONFIRMATION / REOPEN`                                         |

## Import A-series

### A1 — LC Issue

```bash
curl -X POST "$BASE/balance-movements" -H "Content-Type: application/json" -d '{
  "instrumentType":"IPLC_LC",
  "naturalKey":{"lcNumber":"S01"},
  "movementType":"ISSUE",
  "eventSeq":1001,
  "amount":"100000.00",
  "currency":"USD",
  "tenorType":"SIGHT",
  "expiryDate":"2028-12-28",
  "createdBy":"maker1"
}'
```

For a Usance LC, use `SELLERS_USANCE` or `BUYERS_USANCE` and supply `tenorDays`.

### A2 — LC Amendment

Increase:

```bash
curl -X POST "$BASE/balance-movements" -H "Content-Type: application/json" -d '{
  "instrumentType":"IPLC_LC",
  "balanceContractId":"<IPLC_LC_ID>",
  "movementType":"AMEND_INCREASE",
  "eventSeq":1002,
  "amount":"10000.00",
  "currency":"USD",
  "toleranceChangePct":"5",
  "toleranceChangeDirection":"INCREASE",
  "sourceTransactionRef":"A01",
  "createdBy":"maker1"
}'
```

Decrease uses `AMEND_DECREASE` with a positive Amount magnitude. Tolerance-only Decrease from 20% to 15% sends a change of 5:

```bash
curl -X POST "$BASE/balance-movements" -H "Content-Type: application/json" -d '{
  "instrumentType":"IPLC_LC",
  "balanceContractId":"<IPLC_LC_ID>",
  "movementType":"AMEND_DECREASE",
  "eventSeq":1003,
  "amount":"0",
  "currency":"USD",
  "toleranceChangePct":"5",
  "toleranceChangeDirection":"DECREASE",
  "sourceTransactionRef":"A02",
  "createdBy":"maker1"
}'
```

Expiry Date Amendment must not contain `tolerancePct`; the caller always sends `amount:"0"`. For ACTIVE
this stays date-only. For EXPIRED, the server replaces the persisted movement amount with the latest
RELEASED EXPIRE restoration amount and exposes Account Entries while PENDING; cancelled/rejected attempts
are ignored when finding that basis:

```bash
curl -X POST "$BASE/balance-movements" -H "Content-Type: application/json" -d '{
  "instrumentType":"IPLC_LC",
  "balanceContractId":"<IPLC_LC_ID>",
  "movementType":"AMEND_EXPIRY_DATE",
  "eventSeq":1003,
  "amount":"0",
  "currency":"USD",
  "newExpiryDate":"2029-12-28",
  "createdBy":"maker1"
}'
```

Do not submit a compensating `AMEND_INCREASE` after an EXPIRED Extension. Checker Release of this same
`AMEND_EXPIRY_DATE` restores Confirmed/Tight Available Balance and reactivates the contract.

### A3 — Document Arrival

```bash
curl -X POST "$BASE/balance-movements" -H "Content-Type: application/json" -d '{
  "instrumentType":"IPLC_LC",
  "balanceContractId":"<IPLC_LC_ID>",
  "movementType":"UTILIZE",
  "eventSeq":1004,
  "amount":"20000.00",
  "currency":"USD",
  "sourceTransactionRef":"B01",
  "createdBy":"maker1"
}'
```

### A3S — Document Arrival with Shipping Guarantee

A3S is one atomic compound create. Both legs must carry the same `businessEventId`.

```bash
curl -X POST "$BASE/balance-movements/compound" -H "Content-Type: application/json" -d '{
  "requests":[
    {
      "instrumentType":"SHGT",
      "balanceContractId":"<SHGT_ID>",
      "movementType":"FULL_REDEEM",
      "eventSeq":2002,
      "amount":"10000.00",
      "currency":"USD",
      "sourceTransactionRef":"B01",
      "businessEventId":"<BUSINESS_EVENT_UUID>",
      "createdBy":"maker1"
    },
    {
      "instrumentType":"IPLC_LC",
      "balanceContractId":"<IPLC_LC_ID>",
      "movementType":"UTILIZE",
      "eventSeq":1005,
      "amount":"10000.00",
      "currency":"USD",
      "sourceTransactionRef":"B01",
      "businessEventId":"<BUSINESS_EVENT_UUID>",
      "createdBy":"maker1"
    }
  ]
}'
```

### A4 — Sight Settlement Maker Submit

A4 does not create another movement. It marks the selected A3/A3S `UTILIZE` movement as Maker Submitted.

```bash
curl -X POST "$BASE/balance-movements/<A3_MOVEMENT_ID>/maker-submit" \
  -H "Content-Type: application/json" \
  -d '{"makerSubmittedBy":"maker1"}'
```

### A5 — Removed

A5 is not part of the current Balance Component function registry and has no Maker Submit endpoint.

### A6 — Acceptance (Usance)

```bash
curl -X POST "$BASE/balance-movements" -H "Content-Type: application/json" -d '{
  "instrumentType":"IPLC_ACCEPTANCE",
  "naturalKey":{"lcNumber":"S01","ibNumber":"IB0001"},
  "parentLogicalContractId":"<IPLC_LC_LOGICAL_ID>",
  "movementType":"CREATE",
  "eventSeq":2001,
  "amount":"20000.00",
  "currency":"USD",
  "tenorType":"SELLERS_USANCE",
  "tenorDays":120,
  "exposureNature":"ACTUAL",
  "referencedTransactionId":"<A3_MOVEMENT_ID>",
  "createdBy":"maker1"
}'
```

`referencedTransactionId` must identify an eligible, acknowledged A3/A3S movement under the same LC.

### A7 — Acceptance Settlement

```bash
curl -X POST "$BASE/balance-movements" -H "Content-Type: application/json" -d '{
  "instrumentType":"IPLC_ACCEPTANCE",
  "balanceContractId":"<IPLC_ACCEPTANCE_ID>",
  "movementType":"FULL_SETTLE",
  "eventSeq":2002,
  "amount":"20000.00",
  "currency":"USD",
  "remarks":"Acceptance settled at maturity",
  "createdBy":"maker1"
}'
```

For a partial settlement, use `PARTIAL_SETTLE` and the partial amount.

### A8 — Shipping Guarantee Issue

```bash
curl -X POST "$BASE/balance-movements" -H "Content-Type: application/json" -d '{
  "instrumentType":"SHGT",
  "naturalKey":{"lcNumber":"S01","sgNumber":"G01"},
  "parentLogicalContractId":"<IPLC_LC_LOGICAL_ID>",
  "movementType":"ISSUE",
  "eventSeq":3001,
  "amount":"10000.00",
  "currency":"USD",
  "createdBy":"maker1"
}'
```

### A9 — Shipping Guarantee Redemption

```bash
curl -X POST "$BASE/balance-movements" -H "Content-Type: application/json" -d '{
  "instrumentType":"SHGT",
  "balanceContractId":"<SHGT_ID>",
  "movementType":"FULL_REDEEM",
  "eventSeq":3002,
  "amount":"10000.00",
  "currency":"USD",
  "remarks":"Shipping Guarantee fully redeemed",
  "createdBy":"maker1"
}'
```

The current A9 UI supports Full Redeem only.

### A10 — LC Close

```bash
curl -X POST "$BASE/balance-movements" -H "Content-Type: application/json" -d '{
  "instrumentType":"IPLC_LC",
  "balanceContractId":"<IPLC_LC_ID>",
  "movementType":"CLOSE",
  "eventSeq":1010,
  "amount":"<CURRENT_CONFIRMED_BALANCE>",
  "currency":"USD",
  "reasonCode":"MAKER_INITIATED_CLOSE",
  "createdBy":"maker1"
}'
```

### A11 — LC Reopen

```bash
curl -X POST "$BASE/balance-movements" -H "Content-Type: application/json" -d '{
  "instrumentType":"IPLC_LC",
  "balanceContractId":"<CLOSED_IPLC_LC_ID>",
  "movementType":"REOPEN",
  "eventSeq":1011,
  "amount":"0",
  "currency":"USD",
  "reasonCode":"MAKER_INITIATED_REOPEN",
  "createdBy":"maker1"
}'
```

The service derives the actual restoration amount from the unreversed Close and Expiry history.

## Export B-series

### B1 — Confirm LC

```bash
curl -X POST "$BASE/balance-movements" -H "Content-Type: application/json" -d '{
  "instrumentType":"EPLC_CONFIRMATION",
  "naturalKey":{"lcNumber":"E01"},
  "movementType":"ISSUE",
  "eventSeq":1001,
  "amount":"100000.00",
  "currency":"USD",
  "tenorType":"SELLERS_USANCE",
  "tenorDays":120,
  "expiryDate":"2028-12-28",
  "createdBy":"maker1"
}'
```

### B2 — Confirm LC Amendment

Increase:

```bash
curl -X POST "$BASE/balance-movements" -H "Content-Type: application/json" -d '{
  "instrumentType":"EPLC_CONFIRMATION",
  "balanceContractId":"<EPLC_CONFIRMATION_ID>",
  "movementType":"AMEND",
  "eventSeq":1002,
  "amount":"10000.00",
  "currency":"USD",
  "toleranceChangePct":"5",
  "toleranceChangeDirection":"INCREASE",
  "sourceTransactionRef":"B02-1",
  "createdBy":"maker1"
}'
```

B2 Decrease uses `AMEND` with a negative wire amount. For Tolerance-only B2, `amount` is `"0"`;
for example decrease 20% to 15% by 5:

```bash
curl -X POST "$BASE/balance-movements" -H "Content-Type: application/json" -d '{
  "instrumentType":"EPLC_CONFIRMATION",
  "balanceContractId":"<EPLC_CONFIRMATION_ID>",
  "movementType":"AMEND",
  "eventSeq":1003,
  "amount":"0",
  "currency":"USD",
  "toleranceChangePct":"5",
  "toleranceChangeDirection":"DECREASE",
  "sourceTransactionRef":"B02-2",
  "createdBy":"maker1"
}'
```

Expiry Date Amendment follows the same dual-mode rule as A2: request `amount:"0"`, no `tolerancePct`;
ACTIVE is date-only, while EXPIRED derives the protected restore voucher from the latest RELEASED EXPIRE:

```bash
curl -X POST "$BASE/balance-movements" -H "Content-Type: application/json" -d '{
  "instrumentType":"EPLC_CONFIRMATION",
  "balanceContractId":"<EPLC_CONFIRMATION_ID>",
  "movementType":"AMEND_EXPIRY_DATE",
  "eventSeq":1003,
  "amount":"0",
  "currency":"USD",
  "newExpiryDate":"2029-12-28",
  "createdBy":"maker1"
}'
```

Checker Release restores the expired Confirmation through this same reviewed movement; do not add a
separate B2 monetary Increase for the restoration.

### B3 — Present Documents

```bash
curl -X POST "$BASE/balance-movements" -H "Content-Type: application/json" -d '{
  "instrumentType":"EPLC_EXAMINATION",
  "naturalKey":{"lcNumber":"E01","ibNumber":"E01"},
  "parentLogicalContractId":"<EPLC_CONFIRMATION_LOGICAL_ID>",
  "movementType":"CREATE",
  "eventSeq":2001,
  "amount":"20000.00",
  "currency":"USD",
  "createdBy":"maker1"
}'
```

### B4 — Sight Honour

```bash
curl -X POST "$BASE/balance-movements/compound" -H "Content-Type: application/json" -d '{
  "requests":[
    {
      "instrumentType":"EPLC_CONFIRMATION",
      "balanceContractId":"<EPLC_CONFIRMATION_ID>",
      "movementType":"HONOUR",
      "eventSeq":1004,
      "amount":"20000.00",
      "currency":"USD",
      "sourceTransactionRef":"E01",
      "referencedTransactionId":"<B3_MOVEMENT_ID>",
      "businessEventId":"<BUSINESS_EVENT_UUID>",
      "createdBy":"maker1"
    },
    {
      "instrumentType":"EPLC_DUE_FROM_ISSUING_BANK",
      "naturalKey":{"lcNumber":"E01","ibNumber":"E01"},
      "parentLogicalContractId":"<EPLC_CONFIRMATION_LOGICAL_ID>",
      "movementType":"CREATE",
      "eventSeq":3001,
      "amount":"20000.00",
      "currency":"USD",
      "businessEventId":"<BUSINESS_EVENT_UUID>",
      "createdBy":"maker1"
    }
  ]
}'
```

### B4 — Usance Acceptance

```bash
curl -X POST "$BASE/balance-movements/compound" -H "Content-Type: application/json" -d '{
  "requests":[
    {
      "instrumentType":"EPLC_CONFIRMATION",
      "balanceContractId":"<EPLC_CONFIRMATION_ID>",
      "movementType":"ACCEPT",
      "eventSeq":1004,
      "amount":"20000.00",
      "currency":"USD",
      "sourceTransactionRef":"E01",
      "referencedTransactionId":"<B3_MOVEMENT_ID>",
      "businessEventId":"<BUSINESS_EVENT_UUID>",
      "createdBy":"maker1"
    },
    {
      "instrumentType":"EPLC_ACCEPTANCE",
      "naturalKey":{"lcNumber":"E01","ibNumber":"IB0001"},
      "parentLogicalContractId":"<EPLC_CONFIRMATION_LOGICAL_ID>",
      "movementType":"CREATE",
      "eventSeq":3001,
      "amount":"20000.00",
      "currency":"USD",
      "tenorType":"SELLERS_USANCE",
      "tenorDays":120,
      "exposureNature":"ACTUAL",
      "businessEventId":"<BUSINESS_EVENT_UUID>",
      "createdBy":"maker1"
    },
    {
      "instrumentType":"EPLC_ACCEPTANCE_REIMB_RECEIVABLE",
      "naturalKey":{"lcNumber":"E01","ibNumber":"IB0001"},
      "parentLogicalContractId":"<EPLC_CONFIRMATION_LOGICAL_ID>",
      "movementType":"CREATE",
      "eventSeq":4001,
      "amount":"20000.00",
      "currency":"USD",
      "businessEventId":"<BUSINESS_EVENT_UUID>",
      "createdBy":"maker1"
    }
  ]
}'
```

All B4 legs must use the same `businessEventId`.

### B5 — Acceptance Maturity Settlement

```bash
curl -X POST "$BASE/balance-movements" -H "Content-Type: application/json" -d '{
  "instrumentType":"EPLC_ACCEPTANCE",
  "balanceContractId":"<EPLC_ACCEPTANCE_ID>",
  "movementType":"FULL_SETTLE",
  "eventSeq":3002,
  "amount":"20000.00",
  "currency":"USD",
  "remarks":"Acceptance settled at maturity",
  "createdBy":"maker1"
}'
```

B5 settles only the selected Acceptance. It does not resolve or settle a Reimbursement Receivable.

### B6 — Confirmed LC Close

```bash
curl -X POST "$BASE/balance-movements" -H "Content-Type: application/json" -d '{
  "instrumentType":"EPLC_CONFIRMATION",
  "balanceContractId":"<EPLC_CONFIRMATION_ID>",
  "movementType":"CLOSE",
  "eventSeq":1006,
  "amount":"<CURRENT_CONFIRMED_BALANCE>",
  "currency":"USD",
  "reasonCode":"MAKER_INITIATED_CLOSE",
  "createdBy":"maker1"
}'
```

### B7 — Confirmed LC Reopen

```bash
curl -X POST "$BASE/balance-movements" -H "Content-Type: application/json" -d '{
  "instrumentType":"EPLC_CONFIRMATION",
  "balanceContractId":"<CLOSED_EPLC_CONFIRMATION_ID>",
  "movementType":"REOPEN",
  "eventSeq":1007,
  "amount":"0",
  "currency":"USD",
  "reasonCode":"MAKER_INITIATED_REOPEN",
  "createdBy":"maker1"
}'
```

## Checker follow-up APIs

A normal Checker Release is:

```bash
curl -X POST "$BASE/balance-movements/<MOVEMENT_ID>/release" \
  -H "Content-Type: application/json" \
  -d '{"releasedBy":"checker1"}'
```

A3/A3S Checker acknowledgment is:

```bash
curl -X POST "$BASE/balance-movements/<A3_MOVEMENT_ID>/acknowledge" \
  -H "Content-Type: application/json" \
  -d '{"acknowledgedBy":"checker1"}'
```

A3S, A6, and B4 Checker processing uses the compound release/action APIs defined in the OAS. Do not release their linked legs as unrelated, non-atomic requests.

## Contract references

- Microservice OAS: `analysis/balance-component-api.yaml`
- Channel OAS: `analysis/balance-component-channel-api.yaml`
- Angular Maker orchestration: `src/app/transaction-builder/maker-submit.service.ts`
- Angular API client: `src/app/transaction-builder/balance-component-api.service.ts`

The Channel OAS also defines the logical `POST /channel/transactions` façade. The current reference Angular UI calls the microservice endpoints shown above directly.
