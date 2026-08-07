# RPFM — Payment Component Gap Analysis

> **Document Purpose:** Document RPFM (Risk Participation Finance)'s relationship to the Payment Component shared layer (`Y/SYS_JS/Payment/*`, `SSSS_PaymentDebit.js`/`SSSS_PaymentCredit.js`) — the real Dr/Cr business events its 4 Confirm functions represent, why all 4 verdict as **GAP** (no Payment Component voucher-assembly call), and — going beyond the GAP verdict — whether each function's underlying accounting entry is actually posted anywhere in the baseline at all.

**Last Updated:** 2026-08-07

---

## 1. Scope and relationship to `COMMON-PaymentComponent-Cross-Reference.md`

`COMMON-PaymentComponent-Cross-Reference.md` documents the 4 confirmed Payment-Component-*using* modules (IPLC/EPLC/IMCO/EXCO). RPFM is a distinct case — **partial integration**: it populates typed `PaymentDebit`/`PaymentCredit` Dr/Cr legs (screen-lifecycle time, including the RPFM-only RTGS settlement flag — see `payment-instructions-post.yaml`'s `AccountType`/`rtgsIndicator` v1.3.0 note) but none of its 4 Confirm functions ever call a Payment Component voucher-assembly routine. It therefore doesn't belong in that document's PASS-only table and gets its own here.

## 2. Business events (domain-expert clarification, 2026-08-07)

| GAP function | Business event | Debit | Credit |
|---|---|---|---|
| Process Grantor | Grantor receives Participant funds | Nostro | Suspense or Internal |
| Repay Grantor | Grantor receives Borrower repayment | Nostro | Suspense or Internal |
| Repay Grantor | Grantor pays Participant | Suspense or Internal | Nostro |
| Process Participant | Participant remits funds | Suspense or Internal | Nostro |
| Settle Participant | Participant receives principal + interest (advance method) | Nostro | Suspense or Internal |
| Settle Participant | Participant receives interest only (arrears method) | Nostro | Suspense or Internal |

**Classification rule applied:** the non-Nostro leg of every event above is a sub-ledger account (loan/participation accounting) booked out in a different business component than Payment Component — so it classifies as `SUSPENSE` or `INTERNAL`, never `CUSTOMER`/`NOSTRO`/`VOSTRO`. Per `docs/analysis-guidelines.md` → "Payment Component Identification Rule" (recapped in `classification.ts`), `SUSPENSE` and `INTERNAL` never participate in any Dr/Cr XOR term — so which of the two is chosen doesn't affect `paymentComponentRelated`. The simulator (`lc-payment-wc/src/app/payment-component/business-case-registry.ts`) defaults to `INTERNAL` (a persistent asset/liability/income ledger account fits better than a transient clearing account) — a modeling judgment call, not itself business-confirmed.

Settle Participant's two events (advance vs. arrears interest method) are economically different but structurally identical (same Dr/Cr account-type shape) — the simulator represents one Dr Nostro / Cr Suspense-or-Internal pair for both, since the distinction doesn't affect classification.

## 3. Why all 4 functions verdict as GAP (Payment Component–specific)

Source-verified, unchanged by anything below: no `RPFM##NULLNULLNULL` voucher-code-prefix pattern exists anywhere in the codebase (the pattern every one of the 15 confirmed PASS functions uses — see `VOUCHER_CODE_PREFIXES` in `voucherDescription.ts`), and none of the 4 `ConfirmBusinessCall`s reads a `PaymentDebit`/`PaymentCredit` DO to assemble a voucher description. This is why the Business Case Simulator only offers a classify-only preview for these 4 (`POST /payment-instructions/classify`) — no Confirm action, since running the full confirm flow would have to fabricate a voucher prefix that doesn't exist in source.

- **Process Grantor** — `SYF_RPFM_ProcessGrantor.js`, `ConfirmBusinessCall:11-49` calls no Payment/voucher routine of any kind.
- **Repay Grantor** — `SYF_RPFM_RepayGrantor.js`, `ConfirmBusinessCall:19-50` calls no Payment/voucher routine.
- **Process Participant** — `SYF_RPFM_ProcessParticipant.js:59`, `ConfirmBusinessCall` calls generic `SYT_CHG_VOUCHER()` (charge voucher, not Payment-specific).
- **Settle Participant** — `SYF_RPFM_SettleParticipant.js:583`, `ConfirmBusinessCall` calls generic `SYT_CHG_VOUCHER()`.

## 4. Does "GAP" mean the money isn't tracked at all? — VCH-template completeness check (2026-08-07)

The GAP verdict above only says "doesn't call Payment Component." It does **not** by itself mean nothing posts the underlying accounting entry — RPFM has its own, separate real posting mechanism. This section checks whether that mechanism actually covers each business event.

**`SYT_CHG_VOUCHER()` ruled out as a candidate mechanism.** Definition: `X/CALJS/COMMONLEVEL/TrxSys.js:1810-1896`. Takes zero parameters; only reads/writes hardcoded `document.MAINFORM.CHG_*` screen fields (`Chg.Screen.getLocalChgCustPayTotalAmt()` etc.) and ends by calling `SYT_Cal_C_VOUCHER_DESC('charge')`. It has no GL-account argument of any kind — it is narrowly scoped to the generic bank-charge/commission voucher and cannot represent Nostro or any of the Suspense-or-Internal legs above.

**The real mechanism is VCH auto-generation.** RPFM's 4 function IDs (`X/Default/FUNC/function_root.xml:1576-1582`, `F05030704057/58/62/63`) map to per-function trigger scripts `X/Default/VCH/vch_F0503070406{57,58,62,63}.js`, which conditionally fire named voucher templates (`X/Default/VCH/vch_RPFM_*.xml`). These templates genuinely support arbitrary Dr/Cr GL posting (`<C_GL FV_TYPE="F">`, screen-field-driven) — this is RPFM's actual accounting-posting rail, separate from and parallel to Payment Component.

| Function | VCH coverage | Verdict |
|---|---|---|
| **Process Grantor** | `vch_F05030704057.js:3` fires `RPFM_ReceivingParticipationFund.xml`: Dr `RPFM_DR_AC` (Nostro, GL `12011101`, set at `ProcessGrantor.js:194`) / Cr `RPFM_CR_AC` (liability, GL `23611301`, set at `ProcessGrantor.js:184`) on `RECV_AMT` — exactly matches the business event. | **Complete**, via a real non-Payment-Component mechanism. GAP is Payment-Component-specific only; the money genuinely is tracked today. |
| **Repay Grantor** | `vch_F05030704058.js:1-4` only fires `RPFM_CashCollateepay.xml` when `FUND_FLAG=="Unfunded" && RISK_FLAG=="No"` — an unrelated collateral scenario. No template fires for the Funded/loan-repayment case described in §2. | **Apparent gap.** Neither of the two business events above appears to be posted anywhere for the funded case. |
| **Process Participant** | `vch_F05030704062.js:1-6` posts only a fixed-GL off-balance-sheet contingent-liability memo (`73013102`/`93013102`) plus the fee voucher. No template posts Dr Suspense-or-Internal / Cr Nostro. | **Apparent gap.** |
| **Settle Participant** | Fee voucher + (Unfunded only) contingent-liability reversal fire. The one template that could plausibly carry principal/interest — `RPFM_FincSinglePayment.xml` (GL `15611401`/`16571401`) — is **commented out** at `vch_F05030704063.js:11-14`, and is malformed even if re-enabled (both entries wrongly marked Credit, wrong DO reference `FincSinglePayment`). | **Apparent gap**, for both the advance and arrears events. |

## 5. Conclusion and recommendation

- **Process Grantor is not actually a gap in the "is the money tracked" sense** — only in the narrow "doesn't use Payment Component" sense. Its real posting mechanism (VCH auto-gen) already works correctly.
- **Repay Grantor, Process Participant, and Settle Participant appear to have a genuine accounting-posting gap in the baseline**, independent of Payment Component — the business events in §2 don't appear to be posted by any mechanism found in source for the real-world (funded) case.
- **The correct fix, if one is wanted, is not wiring these into Payment Component.** Payment Component isn't RPFM's real posting rail — the VCH templates are, and Process Grantor proves that mechanism works. Bolting Payment Component on top would create a second, duplicate posting path rather than complete anything. The actual fix would be completing/repairing the VCH templates the same way Process Grantor already does it (e.g. un-commenting and correcting `RPFM_FincSinglePayment.xml`, adding equivalent templates for Repay Grantor's funded case and Process Participant).
- That is core-ledger logic for a real module (GL account numbers, amounts, DO references) and needs the RPFM module owner's sign-off — it is intentionally **not** implemented here. The Business Case Simulator continues to represent all 4 functions honestly as GAP (classify-only, no Confirm), consistent with `classifyPreview.ts`'s design note that fabricating a voucher-assembly path "would be dishonest simulation."

## Related documents

- `docs/analysis-guidelines.md` → "Payment Component Identification Rule" — the classification rule applied in §2.
- `COMMON-PaymentComponent-Cross-Reference.md` — the sibling document for the 4 confirmed PASS modules (IPLC/EPLC/IMCO/EXCO).
- `PaymentComponent-Microservice-FSD-zh.docx` §8.4.2 — records RPFM as not yet a confirmed caller of the Payment Component API.
- `microservices/payment-component/src/domain/classifyPreview.ts` — the classify-only preview endpoint powering the simulator's 4 RPFM cases.
- `lc-payment-wc/src/app/payment-component/business-case-registry.ts` — the simulator's RPFM case definitions, updated 2026-08-07 to reflect §2/§4 of this document.
