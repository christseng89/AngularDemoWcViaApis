# Payment Component Cross-Reference (IPLC / EPLC / IMCO / EXCO)

> **Document Purpose:** Identify which Confirm-button business logic in the IPLC, EPLC, IMCO, and EXCO modules is **Payment Component**–related, per the scoping rule defined in `docs/analysis-guidelines.md` → "Payment Component Identification Rule", and document the account-type classification mechanism involved.

**Last Updated:** 2026-08-06

---

## Rule Recap

A transaction's settlement is Payment Component–related when:

```
(Dr Current Account XOR Cr Current Account) OR (Dr Nostro XOR Cr Nostro)
```

- **Current Account** = `PaymentDebit`/`PaymentCredit` DO field `CPYT_DR_AC_TYPE` / `CPYT_CR_AC_TYPE` = `CUSTOMER`
- **Nostro** = same fields = `NOSTRO` or `VOSTRO`
- Shared implementation layer: `Y/SYS_JS/Payment/*`, `X/CALJS/CDOSCRLEVEL/SSSS_PaymentDebit.js`, `SSSS_PaymentCredit.js`

## Method

Searched `X/CALJS/FUNCLEVEL/SYF_{IPLC,EPLC,IMCO,EXCO}_*.js` and `X/CALJS/COMMONLEVEL/SYM_{IPLC,EPLC,IMCO,EXCO}.js` for reads of `CPYT_DR_AC_TYPE` / `CPYT_CR_AC_TYPE` and calls to `SYS_GetObjByDoName("PaymentDebit"/"PaymentCredit")`. Corporate Edition (`FrCE`/`FromCE`) variants were excluded per the project's CE exclusion rule (`docs/analysis-guidelines.md`).

## Findings by Module

Every function below calls a Payment Component voucher-description routine **directly inside `csFuncLevelProto.ConfirmBusinessCall`** — meaning this logic belongs in Section 3 (Confirm Transaction) of that function's calculation-formula documentation.

### IPLC

| Function | File | Called in ConfirmBusinessCall | AC_DESC Routine (scope) | Voucher Code Prefix |
|---|---|---|---|---|
| Pay/Accept | `SYF_IPLC_IPLC_PayAccept.js` | line 23 | `SYF_IPLC_CAL_PAYMENT_AC_DESC()` (function-specific, line 193) | `IPLC03NULLNULLNULL` |
| Pay/Accept With Discount | `SYF_IPLC_IPLC_PayAcceptWithDiscount.js` | line 23 | `SYF_IPLC_CAL_PAYMENT_AC_DESC()` (function-specific, line 224) | `IPLC03NULLNULLNULL` |
| Payment at Maturity | `SYF_IPLC_IPLC_PaymentAtMaturity.js` | line 20 | `SYF_IPLC_CAL_PAYMENT_AC_DESC()` (function-specific, line 137) | `IPLC06NULLNULLNULL` |

### EPLC

| Function | File | Called in ConfirmBusinessCall | AC_DESC Routine (scope) | Voucher Code Prefix |
|---|---|---|---|---|
| Pay/Accept | `SYF_EPLC_EPLC_PayAccept.js` | line 19 | `SYF_EPLC_CAL_PAYMENT_AC_DESC()` (function-specific) | `EPLC07NULLNULLNULL` (discount leg), `EPLC03NULLNULLNULL` (sight leg) |
| Pay at Maturity | `SYF_EPLC_EPLC_PayAtMaturity.js` | line 16 | `SYF_EPLC_CAL_PAYMENT_AC_DESC()` (function-specific, line 319) | `EPLC06NULLNULLNULL` |
| Discount | `SYF_EPLC_EPLC_Discount.js` | line 48 | `SYF_EPLC_CAL_PAYMENT_AC_DESC()` (function-specific, line 265) | `EPLC07NULLNULLNULL` |

### EXCO

| Function | File | Called in ConfirmBusinessCall | AC_DESC Routine (scope) | Voucher Code Prefix |
|---|---|---|---|---|
| Payment | `SYF_EXCO_EXCO_Payment.js` | line 43 | `SYF_EXCO_CAL_PAYMENT_AC_DESC()` (function-specific, line 302) | `EXCO01NULLNULLNULL` |
| Settlement at Maturity | `SYF_EXCO_EXCO_SettlementAtMaturity.js` | line 52 | `SYF_EXCO_CAL_PAYMENT_AC_DESC()` (function-specific, line 329) | `EXCO06NULLNULLNULL` (usance leg), `EXCO01NULLNULLNULL` (sight leg) |
| Discount | `SYF_EXCO_EXCO_Discount.js` | line 30 | `SYF_EXCO_CAL_PAYMENT_AC_DESC()` (function-specific, line 224) | `EXCO04NULLNULLNULL` |
| Process 400 (Amendment/Protest processing) | `SYF_EXCO_EXCO_Process400.js` | line 237 | `SYF_EXCO_CAL_PAYMENT_AC_DESC()` (function-specific, line 129) | `EXCO01NULLNULLNULL` |

### IMCO

IMCO implements the routine once at **module level** (`SYM_*`, common/shared) instead of per-function, and three Confirm functions reuse it:

| Function | File | Called in ConfirmBusinessCall | AC_DESC Routine (scope) | Voucher Code Prefix |
|---|---|---|---|---|
| Pre-Payment | `SYF_IMCO_PrePayment.js` | line 184 | `SYM_IMCO_SetPaymentVchDesc()` (Common/Shared, `X/CALJS/COMMONLEVEL/SYM_IMCO.js:1644-1674`) | `IMCO03NULLNULLNULL` |
| Payment D/P | `SYF_IMCO_PaymentDP.js` | line 187 | `SYM_IMCO_SetPaymentVchDesc()` (Common/Shared) | `IMCO03NULLNULLNULL` |
| Settlement D/A | `SYF_IMCO_SettlementDA.js` | line 228 | `SYM_IMCO_SetPaymentVchDesc()` (Common/Shared) | `IMCO03NULLNULLNULL` |

## Excluded — Corporate Edition (CE) Variants

The same pattern exists in the following files but is out of scope per the project's CE exclusion rule:

- `SYF_IPLC_IPLC_PayAcceptFrCE.js`, `SYF_IPLC_IPLC_PaymentAtMaturityFrCE.js`
- `SYF_EPLC_EPLC_PayAcceptFrCE.js`, `SYF_EPLC_EPLC_PaymentAtMaturityFrCE.js`
- `SYF_EXCO_EXCO_SettlementAtMaturityFrCE.js`, `SYF_EXCO_EXCO_Payment_FromCE.js`
- `SYF_IMCO_SettlementFromCE.js`, `SYF_IMCO_PaymentDPFromCE.js`

## Key Takeaways

1. **Payment Component logic is always in-scope for Section 3.** Every non-CE Confirm-button function found in these four modules calls its Payment Component voucher-description routine directly inside `ConfirmBusinessCall` — it is not optional or conditional business logic, so it belongs in Section 3 (Confirm Transaction) documentation for each of these functions.
2. **Scope pattern differs by module.** IPLC, EPLC, and EXCO each implement the routine as a function-specific `SYF_*_CAL_PAYMENT_AC_DESC()`. IMCO instead implements it once as a module-common `SYM_IMCO_SetPaymentVchDesc()`, reused by three separate Confirm functions — a good illustration of the SYF_*/SYM_* scope distinction in `CLAUDE.md`.
3. **The XOR condition is data-driven, not hardcoded.** `CPYT_DR_AC_TYPE` / `CPYT_CR_AC_TYPE` come from whichever account the user selects for each `PaymentDebit`/`PaymentCredit` grid row (`CUSTOMER`, `NOSTRO`, `VOSTRO`, `SUSPENSE`, or `INTERNAL`). The calculation JS only assembles a voucher description code (`{MODULE}{FuncCode}NULLNULLNULL{TypeChar}`) once the type is known — it does not decide the account type itself. Evaluating the XOR rule for a specific transaction therefore requires the actual Dr/Cr account types selected at runtime, not just static code inspection.
4. **Confirms the shared layer.** All functions read/write through `SYS_GetObjByDoName("PaymentDebit"/"PaymentCredit")`, validating that `Y/SYS_JS/Payment/*` and `X/CALJS/CDOSCRLEVEL/SSSS_PaymentDebit.js` / `SSSS_PaymentCredit.js` are indeed the common Payment Component layer shared across modules, as documented in `CLAUDE.md`.
