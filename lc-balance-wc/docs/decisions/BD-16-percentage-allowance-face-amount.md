# BD-16 — Percentage Allowance Uses Face Amount, Excluding Tolerance

Status: APPROVED by the business user on 2026-09-23 after BA、4-Eyes、independent QA and strict OpenSpec validation PASS.

For Import A3／A3S, the Percentage Allowance base is the current approved LC face amount after effective A2 amount amendments and before applying Amount Tolerance. Tolerance increases ordinary Covered drawing capacity only. For Export B3, the equivalent base is the current approved Confirmation face amount.

Boundary example:

```text
LC face amount       = 10,000
Tolerance 10%        =  1,000
Covered capacity     = 11,000
Allowance 2%         =    200

Arrival 11,200       = Covered 11,000 + Excess 200  -> percentage boundary PASS
Arrival 11,201       = Covered 11,000 + Excess 201  -> EXCESS_LIMIT_EXCEEDED, zero-write
```

This decision supersedes any wording that treats tolerance-added drawing capacity as part of the Percentage Allowance base.
