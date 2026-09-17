# SSI Source

Gate 1 implementation is authorized against the frozen
`MT347-DEMO-CLOSURE-V1.1` Oracle only.

## Design

- `oracle.repository.ts` verifies the pinned SHA before loading the Oracle.
- `oracle-contract.ts` exposes typed immutable domain contracts.
- `mt347-demo.generator.ts` expands only Oracle-provided parameter rows and
  variants. It does not infer or reinterpret BA rules.
- `oracle-comparator.ts` compares every generated context with the frozen
  Oracle and reports exact field mismatches.
- `dry-run.ts` writes a deterministic generated dataset and comparison report.

Run:

```powershell
npm run demo:dry-run:ssi-mt347
```

Outputs are written under `qa/FIX_DATA/ssi/generated/`.

## Authorization boundary

This source package supports Implementation, TDD, Generator development and a
zero-write dry run only. It contains no database repository and no apply
operation. Fixture Runtime Apply, SSI ACTIVE mutation and DB Apply remain
unauthorized.
