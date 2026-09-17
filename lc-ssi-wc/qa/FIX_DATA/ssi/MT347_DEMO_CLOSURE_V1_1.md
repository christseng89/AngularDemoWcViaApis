# MT347 Demo Closure V1.1

**Status:** BA Maker confirmed; Independent QA Checker pending.  
**Supersedes:** V1 SHA `85194857A111054FDE172B9DF6B0D5394B52FDCF49E0F61084E4F35E0E758D37`.  
**Direction:** `OUTBOUND / DEMO_POLICY_V1`.  
**Runtime isolation:** controlled artifact/virtual stubs only; no live service or DB access.

## Machine-oracle closure

- 208 groups × 15 exact contexts = 3,120.
- 172 SSI-owned groups × 15 = 2,580; exact resolver outcome `FAIL_CLOSED_NO_SSI_OUTPUT`.
- 36 OOS groups × 15 = 540; `ssiLookup=NOT_PERFORMED`, route rows/candidates = 0.
- All 208 side-effect objects contain only zero counters.
- `FIX-MT742-010`: 15 oracle contexts and zero SSI route candidates.
- Prior 29 blocked IDs are listed with Direction, Lookup Contract, Evidence Source, Resolver Outcome and Reason Code; completeness 29/29.
- DEMO HTTP assertion is a single `demoHttpStatus` value (409/422); OOS is null because it is not executed. Original prose is retained only in `sourceExpectedHttpNote`.
- Controlled virtual stub requirement is derived only from source Nostro/account identity; every other row states `NOT_REQUIRED`.

## Approved dimensions

Currencies: USD, EUR, GBP, JPY, HKD  
Counterparties: DEUTDEFF (BANK-SVC-DEUTDEFF), CHASUS33 (BANK-SVC-CHASUS33), BOFAUS3N (BANK-SVC-BOFAUS3N)  
Booking Entity: HK01

## QA validation

1. Validate the JSON against `qa/FIX_DATA/ssi/mt347-demo-closure.v1.1.schema.json`.
2. Recompute the bundle SHA file.
3. Re-run semantic assertions in `reconciliation.assertions`; all must be true.
4. Verify exact 208/172/36 and 3,120/2,580/540 counts.
5. Verify 3,120 globally unique variant keys and exact 5×3 context membership for every group.
6. This artifact does not authorize fixture, generator or DB mutation.

