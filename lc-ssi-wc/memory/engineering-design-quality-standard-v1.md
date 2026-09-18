# Engineering and Design Quality Standard v1

**Status:** Controlled mandatory standard

**Version:** v1

**Owner:** Product Owner

## Mandatory start-work gate

Every UI, UI/UX, API, Backend, Data, Database, QA, Security, System Designer, and temporary specialist must, before controlled work starts:

1. Read the current controlled standard and its manifest.
2. Verify the declared version and canonical LF SHA-256.
3. Record role, person／agent identity, version, SHA, acknowledgement time, and task／handoff reference.
4. State the verified standard SHA in the handoff.

Missing acknowledgement or a stale／mismatched SHA means work must not start, merge, or receive `PASS`. Any controlled-standard change invalidates earlier acknowledgement; every active role must re-read, re-verify, and record a new acknowledgement before continuing.

## Engineering and design principles

- Apply OOP／OOD and SOLID with explicit responsibilities and dependency direction.
- Design shared behavior once. Resource-specific duplication is prohibited where a shared contract applies.
- Use suitable patterns deliberately:
  - Strategy／Policy for selectable behavior such as tab-to-column presentation.
  - Composable Specification／Predicate objects for row-presentation conditions.
  - Typed Registry／Configuration for resource wiring.
  - Adapter for connecting shared policy to different UI hosts.
- Avoid resource `if`／`switch` duplication, God components, Service Locator, Singleton state, and needless Abstract Factory layers.
- OAS and governed typed contracts are the source of truth. Do not replace them with UI literals or inferred schemas.
- Keep presentation decisions separate from domain eligibility. Server authorization, lifecycle, concurrency, maker-checker, and validation remain authoritative.
- Use strict typing; avoid unbounded casts, stringly typed commands, and ambiguous nulls.
- Accessibility is part of acceptance: semantic structure, keyboard parity, focus behavior, accessible names, and non-visual state must be verified.
- No behavior, API, DB, seed, fixture, or runtime-data mutation is allowed without explicit authority.
- Every feature and defect follows TDD: reproducible Red, minimum Green, Refactor, affected regression, then full verification.
- Every TDD implementation must run on an isolated Git branch, preferably in an isolated worktree. Direct implementation in a shared dirty working tree is prohibited.
- Before TDD work starts, record the exact base HEAD plus a dirty-file manifest with an owner for every pre-existing change. The task boundary must identify files and hunks it may modify.
- Each candidate handoff must provide the exact candidate SHA, same-SHA four-eyes evidence, and a recoverable patch. Do not use `reset`, `checkout`, `stash`, `clean`, or an equivalent operation in a way that can overwrite or hide another owner's work.
- Four-eyes review is mandatory. Maker and Independent QA／Checker must verify the same exact SHA; authors cannot approve their own work.

## Mandatory workstream reporting chain

This rule applies to every individual contributor and every workstream／workgroup. It applies whenever design, implementation, testing, investigation, review, a gate, or a checkpoint completes or reaches a terminal status.

The controlled reporting chain is:

```text
workgroup completes
  -> workstream owner immediately reports to PM/root
  -> PM verifies result, evidence, exact SHA, tests, risks, and remaining ownership
  -> PM immediately reports to Product Owner
```

- `PASS`, `FAIL`, `BLOCKED`, and `NOT_EXECUTED` are all reportable outcomes and must be reported immediately.
- The workstream owner report must include scope／result, status, exact SHA and changed files when applicable, tests／evidence, DB or other mutation status, remaining issues, and next owner.
- A workgroup must not close silently inside the group, wait for a Product Owner question, or treat fragmented direct messages as a substitute for the formal PM／root report.
- PM／root must verify the submitted evidence before relaying the status; forwarding an unverified conclusion is not completion of the reporting gate.
- Completion of technical work is not completion of the assigned work until this reporting chain has been executed.

## Quality gates

### Defect-level PASS

A defect or feature candidate may be reported as technically fixed only when all applicable gates pass:

| Gate                      | Quantified requirement                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Requirements traceability | 100% of approved requirements map to implementation and test evidence                                      |
| Acceptance matrix         | 100% executed; failed, missing, duplicate, unknown, and ambiguous cases = 0                                |
| Automated verification    | Applicable unit, integration, and UI regression tests = 100% PASS                                          |
| Static／build gates       | Lint, typecheck, format, diff-check, and build = PASS                                                      |
| Accessibility             | Applicable keyboard, focus, semantics, name, contrast, and screen-reader contracts = PASS                  |
| Determinism／idempotency  | Repeated controlled execution yields identical logical result; unexpected duplicates = 0                   |
| Mutation boundary         | Unexpected mutation = 0; DB writes = 0 unless explicitly authorized                                        |
| Security／authorization   | Authentication, authorization, server-authoritative eligibility, and fail-closed checks = PASS             |
| Performance               | No obvious regression; required budgets／plans／cold-hot evidence pass when the change affects performance |
| Observability／audit      | Required typed logs, audit events, correlation, and failure evidence are present                           |
| Reproducibility           | Exact base, ordered files, commands, environment, canonical bytes, and SHA are reproducible                |
| Defect severity           | Open Critical = 0; open High = 0                                                                           |
| Independent review        | Independent QA／Checker verifies the exact Maker SHA                                                       |

Defect-level `PASS` means only that the scoped defect candidate satisfies its approved acceptance contract. It is not release authorization.

### Overall release gate

Overall release authorization additionally requires every included defect／feature candidate to retain defect-level `PASS`, all cross-feature and end-to-end gates to pass, the complete release manifest and rollback／recovery evidence to match the release SHA, and the authorized release approvers to record approval. Any changed artifact, failed gate, unresolved Critical／High defect, unexpected mutation, or SHA mismatch returns the overall gate to `NOT AUTHORIZED`.

## Required acknowledgement evidence

Each controlled handoff must include:

```text
Role:
Person / Agent:
Task / Handoff ID:
Standard version:
Standard LF SHA-256:
Manifest LF SHA-256:
Read and verified at:
Reconfirmation required because standard changed: YES / NO
```

An acknowledgement is evidence of reading and identity verification; it does not replace technical evidence or independent approval.
