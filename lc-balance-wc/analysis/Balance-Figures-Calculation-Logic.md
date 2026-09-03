# Balance Component — Balance Figure Calculation & Update Logic

> Current Import scope: A1, A2, A3, A3S, A4, A6, A7, A8, A9, A10, A11. Export scope: B1–B7.
> Tight Available Balance cannot be negative; A3S is capped by Tight Available
> plus the selected SG outstanding. See `../docs/current-behavior.md`.

**Scope:** every balance/earmark figure shown on a Current Balance snapshot (Look Up Current Balance,
Inquire Events' Balance Tabs, and every persisted Event Snapshot) — the five core figures **Confirmed
Balance**, **Available Balance**, **Pending Earmark Total**, **Off-Balance Exposure**, and **Tight
Available Balance**, plus three earmark/sub-ledger breakdowns — **Present Docs Earmark (Pending /
Approved)**, **SG (Pending / Approved)**, and **Document Arrival (Pending / Approved)** — and exactly
how each one updates at **Submit** (Maker, movement status `PENDING`) versus **Approved** (Checker
Release, movement status `RELEASED`), across all sixteen named business functions, A1–A10 (Import LC)
and B1–B6 (Export Confirmed LC). A2 and B2 are each split into their own **Increase** and **Decrease**
sub-tables, since the two directions move every figure the opposite way.

**Source of truth:** `microservices/balance-component/src/domain/balanceDerivation.ts`,
`domain/offBalanceExposure.ts`, `domain/amendDecrease.ts`, `domain/tolerance.ts`, and
`service/balanceService.ts`'s own `assembleSnapshot()` — the single function every snapshot surface (live
`GET .../balance`, the in-memory snapshot captured at `createMovement()`, and the one captured at
`release()`) funnels through. Every formula below is quoted from that code, not re-derived.

> **A2／B2 input rule, 2026-09-03.** A monetary amendment may change Amount only, Tolerance only, or
> both. Tolerance-only uses wire `amount = "0"`, so Current LC Amount stays unchanged while the rounded
> full-contract Upper Limit can still move. Zero Amount plus an omitted or unchanged Tolerance is a
> rejected no-op. This exception applies only to `AMEND_INCREASE`／`AMEND_DECREASE`／`AMEND`; other
> movement types retain their existing amount rules.

> **EXPIRED Expiry Date restoration, 2026-09-03.** The external `AMEND_EXPIRY_DATE` request always
> sends `amount = "0"` and never carries Tolerance. Against ACTIVE it remains a zero-effect date-only
> movement. Against EXPIRED, the server finds the latest RELEASED movement (ignoring CANCELLED／REJECTED
> audit attempts); when it is EXPIRE, the PENDING Amendment carries that EXPIRE's protected amount,
> reference, and reversed Account Entries. Confirmed／Tight Available remain unchanged while PENDING and
> are restored only at Checker Release. This restoration is not Face Amount growth and must not be
> followed by a compensating AMEND_INCREASE.

**Real API fields vs. derived breakdowns — read this before the tables.** Of the eight figures covered
here, **six are genuine, persisted `BalanceSnapshot` fields** (`confirmedBalance`, `availableBalance`,
`pendingEarmarkTotal`, `offBalanceExposure`, `tightAvailableBalance`, and — `EPLC_CONFIRMATION` only —
`presentDocsEarmarkPending`/`presentDocsEarmarkApproved`). **"SG (Pending / Approved)" and "Document
Arrival (Pending / Approved)" are NOT separate API fields** — no such fields exist anywhere in
`types.ts`. They are this document's own **derived decomposition** of the real `offBalanceExposure`
figure and the real `pendingEarmarkTotal`/`confirmedBalance` figures respectively, split by movement
status, computed with the exact same formulas the real fields already use (just not summed together).
They are included because they answer "how much of this real figure came from a Document Arrival /
Shipping Guarantee specifically, and is it still Pending or already Approved" — a question the combined
system fields alone can't answer, but every A1–A9/B1–B5 Maker/Checker screen visibly needs (e.g. the
Event Timeline's own EARMARKING/EARMARKED status labels are exactly this Document Arrival Pending/
Approved split, applied to one specific movement).

---

> **Formula change, 2026-08-20 (business instruction).** Figure #5 (**Tight Available Balance**) now
> derives from **Confirmed Balance**, not Available Balance — "Tight Available Balance 應該用 Confirmed
> LC Balance 減其他金額, 因為 APPROVED 才可以動用" (only APPROVED/RELEASED amounts are genuinely usable
> capacity). A still-PENDING **increase** (ISSUE/AMEND_INCREASE/B1/B2-Increase) therefore no longer
> raises Tight Available Balance until it is Approved — but a still-PENDING **decrease**
> (AMEND_DECREASE/UTILIZE/B2-Decrease/etc.) still reduces it immediately at Submit, same as before
> ("A2 B2 Decrease Submit 後，對 Tight LC Balance 也是減項" — "占用從寬", occupancy is counted early;
> "增加從嚴", increases are counted late). See the new **Pending Decrease Total** row (#5a) and the
> rewritten §5 general pattern below. A previously-missing sufficiency check on B2's own Decrease
> direction (`AMEND` with a negative signed amount) was closed in the same pass — see §4's own note.
> Every per-function table in §6/§7 below follows this updated rule; only the pure-increase,
> single-movement tables (A1, A2-Increase, B1, B2-Increase) were individually re-verified against it in
> this revision — read every other table's own "Tight Available Balance" row through §5's general rule
> rather than assuming it was re-audited line by line.

> **Sufficiency-check basis, same day, later pass ("A2 Decrease 輸入金額控制規則 B2 Decrease, A3 & B3
> 都適用" — business-confirmed via a balance-expert review).** `checkAmendDecreaseSufficiency`
> (A2's own `AMEND_DECREASE` and B2's own Decrease direction, §4/§6.2) was compared against **plain
> Available Balance** when Tight Available Balance was first introduced above — a real gap: it let a
> Decrease shrink an LC/Confirmation's own ceiling *below* its outstanding off-balance-sheet exposure
> (live-reproduced on U01: Confirmed 100, SG Outstanding 10, plain Available 100, Tight 90 — a Decrease of
> 95 used to pass, leaving only 5 of real capacity under a still-outstanding 10 SG). Now compares against
> **Tight Available Balance** instead, computed the same per-instrumentType way `assembleSnapshot()`
> already does (SHGT exposure for `IPLC_LC`/`EPLC_LC`, Present Docs Earmark for `EPLC_CONFIRMATION`) —
> bringing it in line with A3/A3S's own `checkUtilizeSufficiency` and B3's own
> `checkPresentDocsIssueSufficiency`, both already Tight-based since the original formula change above.
> **A8's own `checkShgtIssueSufficiency`** (SG Issue amount capped at the parent LC's own capacity, §6
> below) was **already** Tight-based before this session — its own table's prose below is corrected in
> this revision purely to stop describing it as "Available Balance," not because its behavior changed.

> **Off-Balance Exposure basis, same day, later pass ("SG 贖回提早放行" business scenario, then "A35 Refer
> to S02 G02 Tight Available Balance -8000???").** Figure #4 (**Off-Balance Exposure**) used to net a
> `PARTIAL_REDEEM`/`FULL_REDEEM` the moment it was Maker-Submitted (`PENDING`), the same as once genuinely
> `RELEASED` — a real gap, symmetric to the AMEND_DECREASE one above: a standalone A9 redemption
> Maker-Submitted but not yet Checker-approved could let a SECOND, unrelated SG Issue (A8) or Document
> Arrival (A3) pass against capacity that was never really freed — if the Checker later rejects that
> redemption, the bank ends up over its real LC capacity, entirely because the system itself released
> capacity before approval. Now only nets a redemption once genuinely **RELEASED** ("增加從嚴，對 LC
> Balance 而言") — **except** a redemption sharing a still-PENDING `UTILIZE`'s own `businessEventId` on
> the SAME LC (A3S's own matched compound pair — see A3S's own table below): that ONE case still nets from
> Submit, since both legs are always released together (or both auto-rolled-back on failure), so there is
> no cross-transaction leakage risk in treating them as one reclassification event rather than an
> independent "increase." A8's own table (§6) is corrected to no longer claim a standalone redemption
> "reacts immediately" — it only reacts at Checker Release now, same as every other genuine increase in
> usable capacity.

> **Present Docs Earmark basis, same day, Export-side twin of the note above ("B4 U02 也有類似問題 Tight
> Available Balance -10000").** Figures #6/#7 (**Present Docs Earmark Pending/Approved**) used to keep
> counting an already-RELEASED B3 presentation in full even while a B4 that *references it*
> (`referencedTransactionId`) was already Maker-Submitted, `PENDING` — displaying `-10000` instead of `0`
> even though B4's own consumption of that specific presentation is a foregone, self-balancing conclusion
> once Submitted (unlike a genuinely separate later Checker decision). Now a still-PENDING B4 also
> provisionally drops its referenced B3 record out of Figure #7 the moment B4 is Submitted, not only once
> B4 is Approved — mirroring the SG note above, and subject to the identical "增加從嚴，對 LC Balance 而言"
> guard: this provisional netting applies **only** at `assembleSnapshot()` (the live/persisted balance
> display); B3's own new-presentation sufficiency check and B2-Decrease's own sufficiency check both stay
> strict against the un-netted figure, so a genuinely independent transaction never benefits from another
> transaction's own provisional netting. See B3/B4's own tables in §7 below.

> **A10/B6 Close added, 2026-08-21.** A new movementType, `CLOSE` (`IPLC_LC`/`EPLC_LC`/`EPLC_CONFIRMATION`
> only), writes off whatever Confirmed Balance remains and retires the Logical Contract
> (`ContractStatus.CLOSED`, reserved since the original design but never previously reachable — see
> `domain/closeEligibility.ts`). Same direction as AMEND_DECREASE/UTILIZE (`-1` — see the updated §3
> table) and the same general Submit-vs-Approved shape as any other decrease-shaped movement (§5's general
> pattern), with two rules unique to it: `amount` must exactly equal the current Confirmed Balance at
> Submit (may be zero, never negative), and eligibility (not already Closed; zero SG/Acceptance Confirmed
> Balance; no open Event anywhere in the whole event tree) is checked BOTH at Submit and again at Approve,
> since it can stop holding in between. See A10/B6's own tables at the end of §6/§7.

> **A9 locked to Full Redeem only, 2026-08-21** (BA-confirmed, `TF_Balance_Component_Mapping-{en,zh}.xlsx`
> Rule #1 — "SG discharge is instrument-based, not amount-based"). A9's own Amount field is now protected
> (disabled), carried from the SG's Available Balance — `PARTIAL_REDEEM` is no longer reachable through
> this function; `ceilingAmount` in A9's own table (§6) is therefore always the FULL outstanding figure. No
> formula changed — reference-client (Angular) scope only; A3S's own matched, genuinely-partial redemption
> leg is a separate code path and unaffected. See A9's own section for the full detail.

## 1. The Five Core Figures — Exact Formulas

All five are **derived at query time from the full movement history of one `BalanceContract`** — none is
stored directly on the contract row itself. `ceilingAmount` (never the raw `amount`) is what every
formula sums; see §3 for how `ceilingAmount` itself is computed.

| # | Figure | Formula | Populated for |
|---|---|---|---|
| 1 | **Confirmed Balance** | Σ **RELEASED** movements' `ceilingAmount` × direction (`MOVEMENT_DIRECTION` table, §2) | every instrumentType |
| 2 | **Available Balance** | Confirmed Balance + Σ **PENDING** movements' `ceilingAmount` × direction | every instrumentType |
| 3 | **Pending Earmark Total** | Available Balance − Confirmed Balance (i.e. just the net PENDING delta, signed) | every instrumentType |
| 4 | **Off-Balance Exposure** | Σ (**PENDING**+**RELEASED**) child SHGT `ISSUE` − Σ (**RELEASED**, plus any **PENDING** redemption sharing a still-PENDING `UTILIZE`'s own `businessEventId` on the SAME LC — A3S's own matched compound pair only) child SHGT `PARTIAL_REDEEM`/`FULL_REDEEM` | `IPLC_LC` / `EPLC_LC` **only** — `null` for every other instrumentType |
| 5a | **Pending Decrease Total** *(new, not a persisted field)* | Σ **PENDING** movements' `ceilingAmount` on this SAME contract, counting only the ones whose signed `MOVEMENT_DIRECTION` contribution is negative (never netted against a PENDING increase on the same contract) | every instrumentType, but only consumed by #5 |
| 5 | **Tight Available Balance** | `IPLC_LC`/`EPLC_LC`: Confirmed − Pending Decrease Total − Off-Balance Exposure. `EPLC_CONFIRMATION`: Confirmed − Pending Decrease Total − (Present Docs Earmark Pending + Approved combined). | `IPLC_LC` / `EPLC_LC` / `EPLC_CONFIRMATION` **only** — `null` for every other instrumentType |

## 2. The Three Earmark / Sub-Ledger Breakdowns

| # | Figure | Formula | Real field? | Populated for |
|---|---|---|---|---|
| 6 | **Present Docs Earmark (Pending)** | Σ **PENDING**, not-yet-`presentDocsConsumedAt` `EPLC_EXAMINATION` `CREATE` `ceilingAmount`, excluding any record a still-PENDING B4 already provisionally references (display-only; see banner note above — always `0` in practice, since a PENDING B3 can never itself be B4-referenced) | **Yes** — `presentDocsEarmarkPending` | `EPLC_CONFIRMATION` only |
| 7 | **Present Docs Earmark (Approved)** | Σ **RELEASED**, not-yet-`presentDocsConsumedAt` `EPLC_EXAMINATION` `CREATE` `ceilingAmount`, excluding any record a still-PENDING B4 already provisionally references (`derivePresentDocsProvisionallyConsumedIds()` — display-only, at `assembleSnapshot()`; B3's own and B2-Decrease's own sufficiency checks stay strict/un-netted) | **Yes** — `presentDocsEarmarkApproved` | `EPLC_CONFIRMATION` only |
| 8 | **SG (Pending)** *(derived)* | Σ **PENDING** child SHGT `ISSUE` `ceilingAmount` − Σ **PENDING** child SHGT `PARTIAL_REDEEM`/`FULL_REDEEM` `ceilingAmount` **that shares a still-PENDING `UTILIZE`'s own `businessEventId` on the SAME LC** (A3S's own matched compound pair only — same exception as Figure #4; a standalone/unmatched PENDING redemption no longer subtracts here either, so this stays consistent with #4's own "增加從嚴" rule) | No — the PENDING-only half of `offBalanceExposure` | `IPLC_LC`/`EPLC_LC` (shown on the parent LC) |
| 9 | **SG (Approved)** *(derived)* | Σ **RELEASED** child SHGT `ISSUE` `ceilingAmount` − Σ **RELEASED** child SHGT `PARTIAL_REDEEM`/`FULL_REDEEM` `ceilingAmount` | No — the RELEASED-only half of `offBalanceExposure` | `IPLC_LC`/`EPLC_LC` (shown on the parent LC) |
| 10 | **Document Arrival (Pending)** *(derived)* | The specific Document Arrival `UTILIZE` movement's own `ceilingAmount`, while its own status is **PENDING** (UI label: **EARMARKING**) | No — the PENDING half of that one movement's own contribution to `pendingEarmarkTotal` | `IPLC_LC` only (Import side; the Export analog is Present Docs Earmark above) |
| 11 | **Document Arrival (Approved)** *(derived)* | The same movement's own `ceilingAmount` once genuinely **RELEASED** via A4/A6 (UI label: **EARMARKED**) | No — at that point it's already merged into `confirmedBalance`; this row tracks *that specific movement's* own state, not a separate ledger | `IPLC_LC` only |

**#8 + #9 always sum to `offBalanceExposure` (#4).** **#6 + #7 always sum to the combined figure
`tightAvailableBalance` (#5) subtracts for `EPLC_CONFIRMATION`.** Neither #10 nor #11 is additive with
anything else — they describe one specific movement's own lifecycle, not a running total.

## 3. Movement Direction Table (`MOVEMENT_DIRECTION`)

Every movement's contribution to Confirmed/Available Balance is its `ceilingAmount` multiplied by a
fixed **+1** (increases the balance) or **−1** (decreases it), keyed by `movementType`:

| Instrument family | movementType | Direction |
|---|---|---|
| `IPLC_LC` / `EPLC_LC` | `ISSUE` | **+1** |
| | `AMEND_INCREASE` | **+1** |
| | `AMEND_DECREASE` | **−1** |
| | `UTILIZE` | **−1** |
| `IPLC_ACCEPTANCE` / `EPLC_ACCEPTANCE` | `CREATE` | **+1** |
| | `PARTIAL_SETTLE` / `FULL_SETTLE` | **−1** |
| `SHGT` | `ISSUE` | **+1** |
| | `PARTIAL_REDEEM` / `FULL_REDEEM` | **−1** |
| `EPLC_CONFIRMATION` | `AMEND` (direction rides the sign of `amount`, not this table alone) | **+1** |
| | `HONOUR` / `ACCEPT` | **−1** |
| `EPLC_DUE_FROM_ISSUING_BANK` / `EPLC_ACCEPTANCE_REIMB_RECEIVABLE` | `CREATE` | **+1** |
| | `REIMBURSE` / `RECLASSIFY_OUT` | **−1** |
| `EPLC_EXAMINATION` (B3) | `CREATE` | — never contributes to Confirmed/Available at all; see B3's own section |
| `IPLC_LC` / `EPLC_LC` / `EPLC_CONFIRMATION` | `CLOSE` (A10/B6, added 2026-08-21) | **−1** |

## 4. Tolerance / `ceilingAmount` Conversion

`ceilingAmount = amount × (1 + tolerancePct / 100)` — applied **only** when both of the following hold:

- **instrumentType** is `IPLC_LC`, `EPLC_LC`, or `EPLC_CONFIRMATION` (never SHGT/Acceptance — their
  amounts are always their own face value, business-confirmed), and
- **movementType** is `ISSUE`, `AMEND_INCREASE`, `AMEND_DECREASE`, or `AMEND`.

Every other instrumentType/movementType combination uses `ceilingAmount = amount` unchanged. This
affects A1/A2 (`IPLC_LC`), B1/B2 (`EPLC_CONFIRMATION`) directly — A3/A3S/A4/A6/A7/A8/A9/B3/B4/B5 never
apply Tolerance, even where their own contract happens to carry a `tolerancePct` value.

**Gap closed 2026-08-20 (BA balance-check review).** B2 has no separate `AMEND_INCREASE`/
`AMEND_DECREASE` movementType — one `AMEND`, direction riding the sign of `amount` (§2) — and its
Decrease direction had **no sufficiency check at all** (grouped with the genuinely-unchecked
ISSUE/AMEND_INCREASE/CREATE movementTypes), unlike A2's own `AMEND_DECREASE` (checked by
`checkAmendDecreaseSufficiency`, §6.2). B2's own Decrease (`AMEND` with a negative signed
`ceilingAmount`) now runs the same floor check, by magnitude.

**Basis tightened, same day, later pass ("A2 Decrease... B2 Decrease, A3 & B3 都適用").**
`checkAmendDecreaseSufficiency` itself was re-based from plain Available Balance onto **Tight Available
Balance** — see the second banner note above this section for the full rationale (a Decrease could
otherwise shrink an LC/Confirmation's own ceiling below its own outstanding off-balance-sheet exposure).
Applies to A2's own `AMEND_DECREASE` and B2's own Decrease direction identically — never below what's
already utilized, AND never below outstanding off-balance-sheet exposure (SHGT for A2, Present Docs
Earmark for B2).

## 5. Submit vs. Approved — the General Pattern (read this before the per-function tables)

For **any single, non-compound movement** (one contract, one row, no linked legs), moving that SAME
movement from `PENDING` → `RELEASED` has a highly specific, non-obvious effect:

- **Confirmed Balance** — unaffected at Submit (only RELEASED counts); moves by the full signed
  `ceilingAmount` at Approval.
- **Available Balance** — moves by the full signed `ceilingAmount` **at Submit already** (PENDING
  already contributes to Available); **stays at that same total value at Approval** — the movement's
  own contribution simply migrates from the "Σ PENDING" term to the "Confirmed Balance" term, netting
  to an unchanged sum. **Available Balance genuinely does not change when a simple movement is
  Released** — only its internal composition does.
- **Pending Earmark Total** (= Available − Confirmed) — moves by the signed `ceilingAmount` at Submit;
  returns to its pre-Submit value at Approval.
- **A2/B2 display distinction** — `ceilingAmount` is the selected Amendment's own tolerance-adjusted
  balance effect; `Pending Earmark Total` is the net of that effect and every other PENDING movement.
  Example S01: old upper limit 100,000; face Increase 10,000 with proposed tolerance `0% → 20%` gives
  new upper limit 132,000 and Amendment Balance Effect +32,000. If an independent PENDING UTILIZE
  already consumes 10,000, the displayed Pending Earmark Total is +22,000. Standard Fix Pending
  replaces the persisted Event Snapshot immediately, so these corrected PENDING figures do not wait
  for Checker Release. Existing Off-Balance Exposure/Pending Earmark already booked by other events is
  not retrospectively re-toleranced.
- **Tight Available Balance** (2026-08-20 formula, #5/#5a above) — an **increase**-shaped movement
  (ISSUE/AMEND_INCREASE/B1/B2-Increase) is invisible to Tight at Submit (Confirmed hasn't moved yet) and
  only raises it **at Approval**, mirroring Confirmed Balance's own row exactly ("增加從嚴"). A
  **decrease**-shaped movement (AMEND_DECREASE/UTILIZE/B2-Decrease/etc.) instead lowers Tight
  **immediately at Submit** via Pending Decrease Total, then stays at that same lowered value through
  Approval — the movement's own contribution migrates from "Pending Decrease Total" to "Confirmed", net
  unchanged, same shape Available Balance's own row already has ("占用從寬"). Off-Balance
  Exposure/Present Docs Earmark already fold their own PENDING contribution in from Submit (next two
  bullets) — Tight's Confirmed-based swap doesn't change how those two behave, only how the LC/
  Confirmation's *own* pending items are treated.
- **Off-Balance Exposure / SG (Pending) / SG (Approved)** — asymmetric between the two directions
  ("增加從嚴，占用從寬" applied here too). **A8 (ISSUE, an increase)**: the COMBINED figure (#4) reacts
  **at Submit** and never again at Approval — but the two SPLIT halves (#8/#9) still move BETWEEN each
  other at Approval (Pending decreases, Approved increases by the same amount), sum staying fixed.
  **A9 (REDEEM, a decrease in exposure — i.e. an increase in usable capacity)**: standalone, the COMBINED
  figure does NOT react at Submit at all — both #4 and its own #8 half stay unchanged until genuine
  Approval, where #4 drops and #8→#9 finally migrates; the ONE exception is A3S's own matched compound
  pair (redemption sharing a still-PENDING `UTILIZE`'s own `businessEventId`), which reacts at Submit
  like A8 does, since both legs are always released or rolled back together. See A8/A9/A3S's own tables.
- **Present Docs Earmark (Pending) / (Approved)** — same "moves between buckets, combined total fixed"
  shape as SG above, but on B3's own Release specifically (not Submit) — see B3's own table.
- **Document Arrival (Pending) / (Approved)** — a SINGLE movement's own Pending amount fully migrates to
  Approved only once A4/A6 genuinely finalizes it — never at A3/A3S's own Submit, and never at A3's own
  Checker "Approve" (acknowledgment-only, not a real Release — see A3's own table). That acknowledgment
  is itself genuinely persisted again as of 2026-08-20 ("A3 A3S 交易 Approve 過後 不要再顯示" —
  `acknowledgedBy`/`acknowledgedAt`, restored on the same `POST .../acknowledge` route B3 used before its
  own 2026-08-18 redesign, now scoped to A3/A3S's `UTILIZE` instead): the Checker Queue (every PENDING
  movement on the resolved contract) now excludes an already-`acknowledgedAt` item, so an approved A3/A3S
  Document Arrival stops reappearing there instead of showing PENDING forever until A4/A6 finalizes it.
  Unified the same day across every other function too ("純粹 APPROVE PENDING 交易, APPROVED 後該筆交易
  應該消失, 不能重複 APPROVED"): a plain Release/Reject (A2, etc.) already correctly moved the movement's
  own `status` off `PENDING`, but the Checker Queue's already-fetched list was never re-fetched to notice
  — every successful Checker action now reloads it in place.

  **Genuine 4-eyes gate added the same day** ("A4 選取 EARMARKED 的交易" / "PENDING 或 EARMARKING 狀態的
  交易不得出現在下一個交易中"): A4/A6's own picker (both the LC-level Step-1 list and the specific-record
  Step-2 list) now requires a candidate UTILIZE to already be EARMARKED (`acknowledgedAt` set) — a
  still-EARMARKING one (Maker-Submitted but not yet Checker-acknowledged) is not selectable there at all.
  `displayStatus()` shows EARMARKED the moment `acknowledgedAt` is set, even though `status` itself is
  still `PENDING` (genuine finalization is still A4/A6's own job) — this is what the picker's own
  eligibility check now keys off. A4's Checker Search mirrors this: it now shows ONLY EARMARKED UTILIZE
  candidates (excludes still-EARMARKING ones), while A3/A3S's own Checker Search shows the opposite —
  excludes an already-EARMARKED one, since there's nothing left for A3/A3S's own Checker to do with it.
  A4's own picker additionally excludes a UTILIZE it has already Maker-Submitted itself
  (`makerSubmittedAt` set) — nothing left for A4's own Maker step either.

**Compound functions** (A3S, A6, B4) touch **more than one contract's row** at once — called out
explicitly, leg by leg, in their own tables below.

---

## 6. Import LC Functions (A1–A10)

### A1 — LC Issue (`IPLC_LC` / `ISSUE`)

Creates a brand-new Logical Contract. No parent, no linked legs. Tolerance applies (§4).

| Figure | At Submit (PENDING) | At Approved (RELEASED) |
|---|---|---|
| Confirmed Balance | unchanged | **+= ceilingAmount** |
| Available Balance | **+= ceilingAmount** | unchanged (already reflected) |
| Pending Earmark Total | **+= ceilingAmount** | reverts to 0 for this movement |
| Off-Balance Exposure | unaffected (no SHGT children yet) | unaffected |
| Tight Available Balance | unchanged (2026-08-20: tracks Confirmed now, not Available — an unApproved ISSUE isn't usable capacity yet) | **+= ceilingAmount** |
| Present Docs Earmark (P/A) | N/A — Import side | N/A |
| SG (Pending / Approved) | N/A — no SG issued against this LC yet | N/A |
| Document Arrival (Pending / Approved) | N/A — not a `UTILIZE` | N/A |

### A2 — LC Amendment (`IPLC_LC` / `AMEND_INCREASE` or `AMEND_DECREASE`)

Direction is picked explicitly (a `subChoice` dropdown) and drives which `movementType` is submitted —
**not** a sign on `amount`. Tolerance applies. A Decrease is additionally checked at Submit: its own
`ceilingAmount` must not exceed the current **Tight** Available Balance (2026-08-20, re-based from plain
Available Balance — see §4's own "Basis tightened" note) — never below what's already utilized, and
never below outstanding off-balance-sheet (SHGT) exposure.

#### A2 — Expiry Date (`AMEND_EXPIRY_DATE`)

| Target status | At Submit (PENDING) | At Approved (RELEASED) |
|---|---|---|
| ACTIVE | Amount／Account Entries 0／null; balances unchanged | expiryDate changes; balances unchanged |
| EXPIRED after RELEASED EXPIRE | Protected restore voucher is visible; Confirmed／Tight stay 0 | same movement restores the EXPIRE amount; status becomes ACTIVE |

CANCELLED／REJECTED retries are audit-only and do not replace the latest RELEASED EXPIRE basis. The
restored amount is not an amendment to Face Amount.

#### A2 — Increase (`AMEND_INCREASE`)

| Figure | At Submit (PENDING) | At Approved (RELEASED) |
|---|---|---|
| Confirmed Balance | unchanged | **+= ceilingAmount** |
| Available Balance | **+= ceilingAmount** | unchanged (already reflected) |
| Pending Earmark Total | **+= ceilingAmount** | reverts to 0 |
| Off-Balance Exposure | unaffected | unaffected |
| Tight Available Balance | unchanged (2026-08-20: tracks Confirmed now, not Available) | **+= ceilingAmount** |
| Present Docs Earmark (P/A) | N/A | N/A |
| SG (Pending / Approved) | unaffected by this movement | unaffected |
| Document Arrival (Pending / Approved) | N/A | N/A |

#### A2 — Decrease (`AMEND_DECREASE`)

| Figure | At Submit (PENDING) | At Approved (RELEASED) |
|---|---|---|
| Confirmed Balance | unchanged | **−= ceilingAmount** |
| Available Balance | **−= ceilingAmount** | unchanged (already reflected) |
| Pending Earmark Total | **−= ceilingAmount** | reverts to 0 |
| Off-Balance Exposure | unaffected | unaffected |
| Tight Available Balance | **−= ceilingAmount** | unchanged |
| Present Docs Earmark (P/A) | N/A | N/A |
| SG (Pending / Approved) | unaffected by this movement | unaffected |
| Document Arrival (Pending / Approved) | N/A | N/A |

### A3 — Document Arrival (`IPLC_LC` / `UTILIZE`, plain — no matching Shipping Guarantee)

**No Tolerance.** Sufficiency at Submit is the two-tier `checkUtilizeSufficiency()` check (compares
against Available Balance, then against Tight Available Balance).

| Figure | At Submit (PENDING) | At the Checker's "Approve" (acknowledgment only — status stays PENDING) |
|---|---|---|
| Confirmed Balance | unchanged | **unchanged — A3's own Checker action never calls the real release endpoint** |
| Available Balance | **−= ceilingAmount** | unchanged (Approve is not a real Release) |
| Pending Earmark Total | **−= ceilingAmount** | unchanged |
| Off-Balance Exposure | unaffected (plain A3, no SG match) | unaffected |
| Tight Available Balance | **−= ceilingAmount** | unchanged |
| Present Docs Earmark (P/A) | N/A | N/A |
| SG (Pending / Approved) | unaffected | unaffected |
| **Document Arrival (Pending)** | **+= ceilingAmount** (EARMARKING) | **stays at that same value — still EARMARKING** |
| **Document Arrival (Approved)** | 0 | **stays 0 — genuine finalization is A4/A6's own job, not A3's Approve** |

### A3S — Document Arrival w/ Shipping Gtee (`IPLC_LC` / `UTILIZE`, matched against an outstanding SG)

**Two movements created together** (one `businessEventId`): the LC's own `UTILIZE` (`req`) **and** the
matched SG's own `FULL_REDEEM`/`PARTIAL_REDEEM` (amount = MIN(Bill Amount, SG's own Available Balance)),
submitted SG-first. Checker Release releases the SG leg for real; the LC's own `UTILIZE` stays PENDING.

| Figure | At Submit (both legs PENDING) | At Checker Release (SG leg genuinely released; LC leg stays PENDING) |
|---|---|---|
| LC's Confirmed Balance | unchanged | **unchanged — same A3 exception, the LC leg is never released here** |
| LC's Available Balance | **−= UTILIZE's ceilingAmount** | unchanged |
| SG's Confirmed Balance | unchanged | **−= redemption ceilingAmount** |
| SG's Available Balance | **−= redemption ceilingAmount** | unchanged (already reflected) |
| LC's Off-Balance Exposure (combined) | **−= redemption ceilingAmount already at Submit** (PENDING redemptions count immediately) | unchanged — combined total already netted |
| **LC's SG (Pending)** | **−= redemption ceilingAmount** | **reverts (+= back)** — moves out of Pending |
| **LC's SG (Approved)** | unaffected | **−= redemption ceilingAmount** — moves into the Approved (RELEASED) bucket |
| LC's Tight Available Balance | **net moves by (redemption ceilingAmount − UTILIZE ceilingAmount)** — the SG's own reserved capacity is released back (**+= redemption ceilingAmount**, via the Off-Balance Exposure netting above) but the LC's own UTILIZE simultaneously consumes Pending Decrease Total in full (**−= UTILIZE's own ceilingAmount**) in the SAME Submit; since the redemption leg is MIN-capped at the SG's own Available Balance, it can never exceed the UTILIZE's own ceilingAmount, so the **combined net effect is always downward or flat, never a pure increase** — the "increases" wording this row previously had described only the Off-Balance Exposure side in isolation, not the combined figure Tight actually is. Business-confirmed live example (S02/G02, both business messages this fix is named after): LC 10,000 / SG 8,000 issued / Bill Amount 10,000 → Tight moves **2,000 → 0**, a net **−2,000**, not an increase ("這交易SUBMIT 後 Pending Earmark Total = +8,000 (SG Balance) − 2,000 (LC Balance)"). | unchanged — combined total already netted at Submit |
| Present Docs Earmark (P/A) | N/A | N/A |
| **LC's Document Arrival (Pending)** | **+= UTILIZE's ceilingAmount** (EARMARKING) | **unchanged — still EARMARKING**, A4/A6 finalizes it later |
| LC's Document Arrival (Approved) | 0 | 0 |

### A4 — Sight Settlement (no new movement — finalizes an existing A3/A3S `UTILIZE`)

**Maker Submit (`submitA4()`) writes only `makerSubmittedBy`/`makerSubmittedAt`** on the already-PENDING
movement — no new movement, no balance change of any kind. The Checker Release that follows is the
**real** finalization of that same `UTILIZE` (gated on `makerSubmittedAt` being set first).

| Figure | At Maker Submit (metadata-only, status stays PENDING) | At Checker Release (RELEASED) |
|---|---|---|
| Confirmed Balance | unchanged | **−= UTILIZE's ceilingAmount** |
| Available Balance | unchanged | unchanged (already reflected since the original A3 Submit) |
| Pending Earmark Total | unchanged | reverts to 0 for this movement |
| Off-Balance Exposure | unaffected (Sight-only, never touches SHGT) | unaffected |
| Tight Available Balance | unchanged | unchanged |
| Present Docs Earmark (P/A) | N/A | N/A |
| SG (Pending / Approved) | unaffected | unaffected |
| **Document Arrival (Pending)** | unchanged, still EARMARKING | **−= ceilingAmount — drops to 0** |
| **Document Arrival (Approved)** | 0 | **+= ceilingAmount — this is where EARMARKING becomes EARMARKED** |

### A6 — Acceptance, Usance (`IPLC_ACCEPTANCE` / `CREATE` — compound Checker Release)

Maker Submit creates **only** the new Acceptance contract's own `CREATE` (PENDING) — the source LC's own
`UTILIZE` (from A3) is picked, not re-submitted. Checker Release is compound: releases the source
Document Arrival first, then the new Acceptance `CREATE`.

| Figure | At Submit | At Checker Release |
|---|---|---|
| LC's Confirmed Balance | unchanged | **−= source UTILIZE's ceilingAmount** |
| LC's Available Balance | unchanged (already reflected since A3's own Submit) | unchanged |
| Acceptance's Confirmed Balance | unchanged | **+= ceilingAmount** |
| Acceptance's Available Balance | **+= ceilingAmount** | unchanged (already reflected) |
| Off-Balance Exposure (either contract) | unaffected — Acceptance already reduced LC Balance at UTILIZE time, SHGT-style double-counting is out of scope | unaffected |
| Tight Available Balance (LC) | unaffected by this function directly | unaffected |
| Present Docs Earmark (P/A) | N/A | N/A |
| SG (Pending / Approved) | unaffected | unaffected |
| **LC's Document Arrival (Pending)** | unchanged, still EARMARKING (set by the earlier A3/A3S) | **−= ceilingAmount — drops to 0** |
| **LC's Document Arrival (Approved)** | 0 | **+= ceilingAmount — EARMARKING becomes EARMARKED** |

### A7 — Acceptance Settlement (`IPLC_ACCEPTANCE` / `FULL_SETTLE` or `PARTIAL_SETTLE`)

Settles an existing Acceptance at/before maturity. **Never touches the parent LC's own Balance.** No
Tolerance.

| Figure | At Submit | At Approved |
|---|---|---|
| Acceptance's Confirmed Balance | unchanged | **−= ceilingAmount** |
| Acceptance's Available Balance | **−= ceilingAmount** | unchanged (already reflected) |
| Pending Earmark Total | **−= ceilingAmount** | reverts to 0 |
| Off-Balance Exposure / Tight Available | `null` (not `IPLC_LC`/`EPLC_LC`) | `null` |
| Present Docs Earmark (P/A) | N/A | N/A |
| SG (Pending / Approved) | N/A | N/A |
| Document Arrival (Pending / Approved) | N/A — this is Acceptance-side, not the LC's own UTILIZE | N/A |

### A8 — Shipping Gtee Issue (`SHGT` / `ISSUE`)

Amount is capped at the parent LC's own current **Tight** Available Balance at Submit (nets any
already-outstanding SG exposure first — `checkShgtIssueSufficiency`, already Tight-based since the
original 2026-08-20 formula change; this line is corrected here purely because it previously said "Available
Balance," not because the behavior itself changed). No Tolerance.

| Figure | At Submit (PENDING) | At Approved (RELEASED) |
|---|---|---|
| SG's Confirmed Balance | unchanged | **+= ceilingAmount** |
| SG's Available Balance | **+= ceilingAmount** | unchanged (already reflected) |
| **Parent LC's Off-Balance Exposure (combined)** | **+= ceilingAmount — reacts immediately** | **unchanged — no further reaction to the combined total** |
| **Parent LC's SG (Pending)** | **+= ceilingAmount** | **reverts to 0 for this movement** — moves out of Pending |
| **Parent LC's SG (Approved)** | 0 | **+= ceilingAmount** — moves into the Approved (RELEASED) bucket |
| Parent LC's Tight Available Balance | **−= ceilingAmount** | unchanged |
| Parent LC's Confirmed/Available Balance itself | unaffected — A8 never touches the LC's own contract row | unaffected |
| Present Docs Earmark (P/A) | N/A | N/A |
| Document Arrival (Pending / Approved) | N/A | N/A |

This is the one figure whose COMBINED total reacts **at Submit and never again at Release** — but the
Pending/Approved SPLIT still genuinely migrates between the two buckets at Release, same shape as B3's
own Present Docs Earmark.

### A9 — Shipping Gtee Redemption (`SHGT` / `FULL_REDEEM` — locked, `PARTIAL_REDEEM` no longer reachable through this function)

Amount is carried from the SG's own current Available Balance and protected (disabled) — `FULL_REDEEM` is
the only outcome; there is no longer a way to submit a Partial Redeem through A9.

> **Locked down 2026-08-21 (BA-confirmed — `TF_Balance_Component_Mapping-{en,zh}.xlsx`'s own Rule #1, "SG
> discharge is instrument-based, not amount-based": `SG_RELEASE` is always the FULL amount, no residual).**
> Previously the Amount field stayed editable, capped at Available Balance, with `FULL_REDEEM` vs.
> `PARTIAL_REDEEM` derived from whether the typed amount still equalled it — this let a Maker submit a
> genuine standalone Partial Redeem through A9, contradicting the Mapping workbook's own non-negotiable
> rule. `builder-fields.ts`'s own Amount field (and `submit-rules.ts`'s own defense-in-depth backstop) now
> lock it to Available Balance outright, so `ceilingAmount` below is always the FULL outstanding figure —
> the formulas themselves are unchanged, only the reachable amount is. This is a reference-client
> (Angular Transaction Builder) change only — the microservice's own `PARTIAL_REDEEM`/`FULL_REDEEM`
> movementTypes and `checkRedeemSufficiency()` are both untouched and still accept a Partial Redeem from
> any other caller (a known, disclosed scope limit, not closed in this pass). **A3S's own matched SG
> redemption leg is unaffected** — it is a completely separate code path (`documentArrivalWithSg`),
> genuinely capped at `MIN(Bill Amount, SG Available Balance)` and tied to a real Document Arrival via
> `businessEventId`, not a standalone user-typed amount; see A3S's own table above, which can still
> legitimately be `PARTIAL_REDEEM`.

> **Updated 2026-08-20 (see banner note above, "Off-Balance Exposure basis").** This table now covers the
> **standalone** case — an A9 redemption submitted **without** sharing a still-PENDING `UTILIZE`'s own
> `businessEventId` (the overwhelming majority of A9 submissions; A9 itself never creates a compound pair —
> that only happens via A3S, covered separately above). For that one exception, see A3S's own table, whose
> "at Submit" column genuinely does react immediately. A standalone A9 no longer reacts at Submit at all —
> it now waits for genuine Checker Release, same as every other genuine increase in usable capacity, closing
> the "Maker 送出贖回、Checker 還沒核准就先放行" gap.

| Figure | At Submit (PENDING) | At Approved (RELEASED) |
|---|---|---|
| SG's Confirmed Balance | unchanged | **−= ceilingAmount** |
| SG's Available Balance | **−= ceilingAmount** | unchanged (already reflected) |
| **Parent LC's Off-Balance Exposure (combined)** | **unchanged — no longer reacts at Submit** | **−= ceilingAmount — reacts here instead** |
| **Parent LC's SG (Pending)** | **unchanged** — a standalone (unmatched) PENDING redemption no longer subtracts here either, so this stays consistent with the combined total (§2's own #8+#9=#4 invariant) | **unchanged** |
| **Parent LC's SG (Approved)** | unaffected | **−= ceilingAmount** — moves into the Approved (RELEASED) bucket |
| Parent LC's Tight Available Balance | **unchanged — no longer reacts at Submit** | **+= ceilingAmount** (reserved capacity genuinely released back) |
| Present Docs Earmark (P/A) | N/A | N/A |
| Document Arrival (Pending / Approved) | N/A | N/A |

### A10 — Import LC Close (`IPLC_LC` / `EPLC_LC` / `CLOSE`)

Added 2026-08-21. Root-only (`IPLC_LC`/`EPLC_LC`) — writes off whatever Confirmed Balance remains and, once
Approved, retires the Logical Contract (`ContractStatus.CLOSED`). `amount` must exactly equal the current
Confirmed Balance at Submit (may be 0 for an already fully-utilized LC, never negative) — never
auto-derived from anything else. Eligibility (not already Closed; SG AND Acceptance Confirmed Balance both
exactly 0; no open Event anywhere in the whole event tree — root plus every SG/Acceptance/Examination
child) is checked at Submit **and again at Approve**, since it can stop holding in between (e.g. a fresh
Event submitted against a child ledger in that window) — the Checker Release fails outright rather than
silently re-deriving a different write-off amount.

| Figure | At Submit (PENDING) | At Approved (RELEASED) |
|---|---|---|
| Confirmed Balance | unchanged | **−= ceilingAmount — drops to exactly 0** |
| Available Balance | **−= ceilingAmount** | unchanged (already reflected) |
| Pending Earmark Total | **−= ceilingAmount** | reverts to 0 |
| Off-Balance Exposure | unaffected — Close is only eligible once it's already 0 | unaffected |
| Tight Available Balance | **−= ceilingAmount** (Pending Decrease Total, same as any other decrease-shaped movement) | unchanged (already reflected) |
| Present Docs Earmark (P/A) | N/A — Import side | N/A |
| SG (Pending / Approved) | N/A — Close is only eligible once outstanding SG is 0 | N/A |
| Document Arrival (Pending / Approved) | N/A — not a `UTILIZE` | N/A |
| **Contract status** | unchanged, still `ACTIVE` | **`ACTIVE` → `CLOSED`** (side effect of this Release, not a figure) |

---

## 7. Export Confirmed LC Functions (B1–B6)

### B1 — Confirm LC (`EPLC_CONFIRMATION` / `ISSUE`)

Establishes the confirming bank's own contingent (CONF LIAB). Tolerance applies — identical mechanics
to A1, on a different instrumentType.

| Figure | At Submit (PENDING) | At Approved (RELEASED) |
|---|---|---|
| Confirmed Balance | unchanged | **+= ceilingAmount** |
| Available Balance | **+= ceilingAmount** | unchanged (already reflected) |
| Pending Earmark Total | **+= ceilingAmount** | reverts to 0 |
| Off-Balance Exposure | `null` (Import-only figure) | `null` |
| Tight Available Balance | unchanged (2026-08-20: tracks Confirmed now, not Available) | **+= ceilingAmount** |
| Present Docs Earmark (Pending) | unaffected (no B3 presentation yet) | unaffected |
| Present Docs Earmark (Approved) | unaffected | unaffected |
| SG (Pending / Approved) | N/A — Export side | N/A |
| Document Arrival (Pending / Approved) | N/A — Import-only concept | N/A |

### B2 — Confirm LC Amendment (`EPLC_CONFIRMATION` / `AMEND`)

**No separate `AMEND_INCREASE`/`AMEND_DECREASE` movementType** — the UI's own Direction picker sets the
**sign** of the submitted `amount` (positive = Increase, negative = Decrease); the wire request always
carries `movementType: 'AMEND'`. Tolerance applies to the (signed) amount either way.

#### B2 — Increase

| Figure | At Submit (PENDING) | At Approved (RELEASED) |
|---|---|---|
| Confirmed Balance | unchanged | **+= ceilingAmount** |
| Available Balance | **+= ceilingAmount** | unchanged (already reflected) |
| Pending Earmark Total | **+= ceilingAmount** | reverts to 0 |
| Off-Balance Exposure | `null` | `null` |
| Tight Available Balance | unchanged (2026-08-20: tracks Confirmed now, not Available) | **+= ceilingAmount** |
| Present Docs Earmark (P/A) | unaffected by this movement | unaffected |
| SG (Pending / Approved) | N/A | N/A |
| Document Arrival (Pending / Approved) | N/A | N/A |

#### B2 — Decrease

Sufficiency gap closed 2026-08-20 — see §4's own note: this direction now runs the same floor check as
A2's own `AMEND_DECREASE` (`checkAmendDecreaseSufficiency`, by magnitude), previously ungated entirely —
checked against **Tight** Available Balance (Confirmed minus still-PENDING decreases minus the
Confirmation's own Present Docs Earmark), not plain Available Balance (§4's own "Basis tightened" note).

| Figure | At Submit (PENDING) | At Approved (RELEASED) |
|---|---|---|
| Confirmed Balance | unchanged | **−= ceilingAmount** |
| Available Balance | **−= ceilingAmount** | unchanged (already reflected) |
| Pending Earmark Total | **−= ceilingAmount** | reverts to 0 |
| Off-Balance Exposure | `null` | `null` |
| Tight Available Balance | **−= ceilingAmount** (unaffected by the 2026-08-20 formula change — a decrease still occupies Tight from Submit, via Pending Decrease Total) | unchanged |
| Present Docs Earmark (P/A) | unaffected by this movement | unaffected |
| SG (Pending / Approved) | N/A | N/A |
| Document Arrival (Pending / Approved) | N/A | N/A |

### B3 — Present Docs (`EPLC_EXAMINATION` / `CREATE`, `MEMO_ONLY`)

**Never contributes to the parent Confirmation's own Confirmed/Available Balance at all** — D3 ("only
legal events move balances"). What actually matters is the **Present Docs Earmark Pending/Approved**
pair on the **parent Confirmation**. Unlike every other function, B3 has a genuine **third lifecycle
state** — "Consumed" (`presentDocsConsumedAt` set, by B4) — beyond Submit/Approved.

| Figure (on the **parent Confirmation**) | At Submit (this presentation is PENDING) | At Checker Release (this presentation is RELEASED — genuinely finalizes B3 itself since the 2026-08-18 redesign) | Later, once B4 consumes it |
|---|---|---|---|
| Confirmed / Available Balance | unaffected — MEMO_ONLY | unaffected | unaffected |
| **Present Docs Earmark (Pending)** | **+= ceilingAmount** | **−= ceilingAmount** (moves out of Pending) | — |
| **Present Docs Earmark (Approved)** | unaffected | **+= ceilingAmount** (moves into Approved) | **−= ceilingAmount** (finally drops out) |
| Tight Available Balance | **−= ceilingAmount** (Pending already subtracts) | **unchanged** — the combined total is invariant across B3's own Release | **+= ceilingAmount** (capacity genuinely freed) |
| Off-Balance Exposure | `null` | `null` | `null` |
| SG (Pending / Approved) | N/A | N/A | N/A |
| Document Arrival (Pending / Approved) | N/A — Import-only concept; B3 is the Export analog, already covered above | N/A | N/A |

The combined Pending+Approved figure (what actually gates a NEW presentation's own sufficiency check)
only ever *genuinely* changes at Submit or genuine B4-consumption — never at B3's own Release. The
**displayed** Approved figure can additionally read provisionally lower, from B4's own Submit onward,
if a still-PENDING B4 already references this exact record (see the banner note and B4's own table
below) — display-only, reversed automatically if that B4 is later rejected/cancelled since nothing is
actually written to `presentDocsConsumedAt` until B4's genuine Release.

### B4 — Honour / Acceptance (`EPLC_CONFIRMATION` / `HONOUR` or `ACCEPT` — compound, tenor-routed)

Picks an already-RELEASED B3 record. **Sight (`HONOUR`)**: Submit creates 2 linked movements (PENDING) —
the Confirmation's own `HONOUR` **and** a new `EPLC_DUE_FROM_ISSUING_BANK` contract's own `CREATE`.
**Usance (`ACCEPT`)**: Submit creates 3 linked movements (PENDING) — the Confirmation's own `ACCEPT`, a
new `EPLC_ACCEPTANCE` contract's own `CREATE`, **and** a new `EPLC_ACCEPTANCE_REIMB_RECEIVABLE`
contract's own `CREATE`. Checker Release is compound: releases the primary first, then whichever
secondary leg(s) that tenor needs, and **marks the picked B3 record `presentDocsConsumedAt` as a side
effect** — no separate release call against B3 itself (it was already Released beforehand).

| Figure | At Submit (all legs PENDING) | At Checker Release |
|---|---|---|
| Confirmation's Confirmed Balance | unchanged | **−= ceilingAmount** (HONOUR/ACCEPT, −1 direction) |
| Confirmation's Available Balance | **−= ceilingAmount** | unchanged (already reflected) |
| `EPLC_DUE_FROM_ISSUING_BANK` (Sight) / `EPLC_ACCEPTANCE` (Usance) Confirmed Balance | unchanged | **+= ceilingAmount** |
| `EPLC_DUE_FROM_ISSUING_BANK` / `EPLC_ACCEPTANCE` Available Balance | **+= ceilingAmount** | unchanged (already reflected) |
| `EPLC_ACCEPTANCE_REIMB_RECEIVABLE` Confirmed Balance (Usance only) | unchanged | **+= ceilingAmount** |
| `EPLC_ACCEPTANCE_REIMB_RECEIVABLE` Available Balance (Usance only) | **+= ceilingAmount** | unchanged (already reflected) |
| **Confirmation's Present Docs Earmark (Approved)** | **displays as if −= B3's own ceilingAmount already** (provisional, `assembleSnapshot()`-only, per the banner note above — `presentDocsConsumedAt` itself is not yet written) | **−= B3's own ceilingAmount**, now genuine (`presentDocsConsumedAt` written; the picked presentation is finally consumed) |
| Confirmation's Present Docs Earmark (Pending) | unaffected — B3's own presentation was already RELEASED before B4 picked it | unaffected |
| Confirmation's Tight Available Balance | **displays += B3's own ceilingAmount already** (provisional, same display-only mechanism — see live-verified example below) | **+= B3's own ceilingAmount**, now genuine (capacity freed as the earmark clears) |

Live-verified (business-reported "B4 U02 也有類似問題", 2026-08-20): B1 Confirm 10,000 Usance (Approved) →
B3 Present Docs 10,000 (Approved) → B4 Acceptance 10,000 (Submit, still PENDING). Before this fix, the
Confirmation's own `GET .../balance` read `presentDocsEarmarkApproved: "10000"`,
`tightAvailableBalance: "-10000"` at this point — wrong, since B4's own consumption of that exact
presentation is already a foregone conclusion once Submitted. After the fix, the same query reads
`presentDocsEarmarkApproved: "0"`, `tightAvailableBalance: "0"`, `pendingEarmarkTotal: "-10000"` — and a
genuinely unrelated new B3 presentation submitted afterward still correctly rejects against the
un-netted, strict `-10000` figure (the provisional exception never leaks to a different presentation).
| Off-Balance Exposure | `null` | `null` |
| SG (Pending / Approved) | N/A | N/A |
| Document Arrival (Pending / Approved) | N/A — Import-only concept | N/A |

### B5 — Settlement / Maturity (`EPLC_ACCEPTANCE` / `FULL_SETTLE` or `PARTIAL_SETTLE` — Usance-held-to-maturity only)

Maker Submit creates one PENDING `FULL_SETTLE`/`PARTIAL_SETTLE` movement against the selected
Acceptance. It does not look up, create, reimburse, or release an `EPLC_ACCEPTANCE_REIMB_RECEIVABLE`.
Checker Release releases that Acceptance settlement only.

| Figure | At Submit (both legs PENDING) | At Checker Release |
|---|---|---|
| Acceptance's Confirmed Balance | unchanged | **−= ceilingAmount** |
| Acceptance's Available Balance | **−= ceilingAmount** | unchanged (already reflected) |
| Reimbursement Receivable's Confirmed Balance | unchanged | **−= ceilingAmount** |
| Reimbursement Receivable's Available Balance | **−= ceilingAmount** | unchanged (already reflected) |
| Off-Balance Exposure / Tight Available (either contract) | `null` — neither instrumentType is `IPLC_LC`/`EPLC_LC`/`EPLC_CONFIRMATION` | `null` |
| Present Docs Earmark (P/A) | unaffected — B5 never touches `EPLC_EXAMINATION` | unaffected |
| SG (Pending / Approved) | N/A | N/A |
| Document Arrival (Pending / Approved) | N/A | N/A |

Sight settlement (collecting `EPLC_DUE_FROM_ISSUING_BANK`) is explicitly out of Balance Component's own
scope — B4 books that asset, but nothing in this registry ever settles it.

### B6 — Export Confirmed LC Close (`EPLC_CONFIRMATION` / `CLOSE`)

Added 2026-08-21. Same mechanics as A10 (§6), on `EPLC_CONFIRMATION` instead of `IPLC_LC`/`EPLC_LC` —
eligibility nets Present Docs Earmark rather than SG exposure (no SHGT children on the Export side), but
is otherwise identical: not already Closed; zero Acceptance Confirmed Balance; no open Event anywhere in
the whole event tree (root plus every Acceptance/Examination child — including a RELEASED-but-not-yet-
`presentDocsConsumedAt` `EPLC_EXAMINATION`, which a plain PENDING scan would miss). `amount` must exactly
equal the current Confirmed Balance at Submit (may be 0, never negative); eligibility and the exact-amount
match are both re-checked at Approve.

| Figure | At Submit (PENDING) | At Approved (RELEASED) |
|---|---|---|
| Confirmed Balance | unchanged | **−= ceilingAmount — drops to exactly 0** |
| Available Balance | **−= ceilingAmount** | unchanged (already reflected) |
| Pending Earmark Total | **−= ceilingAmount** | reverts to 0 |
| Off-Balance Exposure | `null` (Import-only figure) | `null` |
| Tight Available Balance | **−= ceilingAmount** (Pending Decrease Total, same as any other decrease-shaped movement) | unchanged (already reflected) |
| Present Docs Earmark (P/A) | unaffected — Close is only eligible once no open Present Docs presentation remains | unaffected |
| SG (Pending / Approved) | N/A — Export side | N/A |
| Document Arrival (Pending / Approved) | N/A — Import-only concept | N/A |
| **Contract status** | unchanged, still `ACTIVE` | **`ACTIVE` → `CLOSED`** (side effect of this Release, not a figure) |

---

## 8. Quick-Reference — Which Function Touches Which Figure

| Function | Confirmed / Available / Pending Earmark | Off-Balance Exposure | Tight Available Balance | Present Docs Earmark P/A | SG P/A | Document Arrival P/A |
|---|---|---|---|---|---|---|
| A1 | own contract | — | own contract | — | — | — |
| A2 (Inc/Dec) | own contract | — | own contract | — | — | — |
| A3 | own contract | — | own contract | — | — | **own movement** |
| A3S | LC + SG contracts | LC (reacts at Submit) | LC | — | **LC (splits at Release)** | **LC's own UTILIZE** |
| A4 | LC (at Release only) | — | — | — | — | **LC's own UTILIZE (finalizes)** |
| A6 | LC (at Release) + Acceptance | — | — | — | — | **LC's own UTILIZE (finalizes)** |
| A7 | own contract | `null` | `null` | — | — | — |
| A8 | SG's own contract | **LC (reacts at Submit)** | LC | — | **LC (splits at Release)** | — |
| A9 | SG's own contract | **LC (reacts at Release only — standalone; A3S's own matched pair is the one exception, reacts at Submit)** | LC | — | **LC (Approved bucket only, no Pending-side reaction)** | — |
| A10 | own contract (writes off to 0) | — (only eligible once already 0) | own contract | — | — (only eligible once already 0) | — |
| B1 | own contract | `null` | own contract | unaffected | — | — |
| B2 (Inc/Dec) | own contract | `null` | own contract | unaffected | — | — |
| B3 | `null` effect on Confirmed/Available (MEMO_ONLY) | `null` | Confirmation (via Earmark) | **own contract, splits at Release** | — | — |
| B4 | Confirmation + new asset/liability contract(s) | `null` | Confirmation (Approved bucket consumed) | **Confirmation (Approved drops)** | — | — |
| B5 | Acceptance only | `null` | `null` | unaffected | — | — |
| B6 | own contract (writes off to 0) | `null` | own contract | — (only eligible once already 0) | — | — |

---

*Generated from `microservices/balance-component/src/domain/balanceDerivation.ts`,
`domain/offBalanceExposure.ts`, `domain/amendDecrease.ts`, `domain/tolerance.ts`,
`domain/closeEligibility.ts`, `service/balanceService.ts`, and
`src/app/transaction-builder/balance-component.model.ts`'s own `IMPORT_FUNCTIONS`/`EXPORT_FUNCTIONS`
registry. See `lc-balance/CLAUDE.md`'s own decision log for the business rationale/history behind each
rule.*
