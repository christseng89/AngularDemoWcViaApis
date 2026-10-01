## Context

LC SSI WC already follows a controlled OAS/typed-contract/parameters/API/Page-Parameters/generic-UI architecture. OpenSpec is being added after implementation, so the primary design risk is overstating current behaviour or creating a second copy of rules owned by OAS, governed parameters or controlled source registers.

## Baseline Strategy

Current, observable and evidenced capabilities are written directly under `openspec/specs/`. This adoption change is process-only and sets `skip_specs: true`; it records why and how the baseline was established without duplicating baseline requirements as proposed deltas.

## Authority and Data Flow

- Product and SWIFT semantics: explicit Product Owner decisions, controlled governance and registered sources.
- Wire shape: OAS and TypeScript typed contracts must agree.
- Runtime catalogue: governed parameters, seed/fixture identity and DB logical snapshot.
- Behaviour evidence: production implementation and automated tests.
- OpenSpec: accepted observable contract, not a replacement authority.

Conflicts or missing evidence are recorded as `DISCREPANCY` or `NOT_PROVEN`. They are not silently resolved by selecting the most convenient source.

## Capability Boundaries

Capabilities are divided by stable product responsibility rather than MT number or Angular component. Page definition, generic rendering, route resolution, RMA authorisation, maintenance, Maker/Checker, indexing, reload, Checker UI, audit and output contracts remain separate so future message families can reuse them without copying rules.

## Validation

Required controls are `openspec list`, `openspec list --specs`, `openspec status --change establish-lc-ssi-wc-openspec` and `openspec validate --all --strict --no-interactive`. Additional checks verify unique IDs, existing file references, absence of `qa-archived/` references, clean diffs and explicit staging.

## Four-eyes Review

The Maker commits a candidate. An Independent Checker reviews that exact commit read-only and records the authoritative verdict outside Git. Any subsequent edit creates a new candidate and invalidates the previous verdict. Files inside this change can provide review instructions or non-authoritative consultation notes, but cannot prove approval of the commit that contains them.

## Security and Failure Behaviour

No secrets, tokens, live customer data or database content are copied into OpenSpec. Missing evidence fails closed. OAS gaps are disclosed. AI-assisted review is labelled as such and never represented as human approval.

## Compatibility and Rollback

There is no runtime compatibility effect. OpenSpec adoption can be rolled back by reverting the documentation-only candidate commit. Existing governance, OAS and tests remain authoritative for their respective concerns.

## Decision Log

- Selected direct current baselines plus a process-only adoption change.
- Selected `skip_specs: true` to avoid duplicate lifecycle ownership.
- Selected concern-based authority and explicit discrepancy handling.
- Selected responsibility-based capabilities rather than message-specific specs.
- Selected external exact-commit Checker evidence to avoid self-referential approval.
- Selected explicit bulk strict validation for OpenSpec CLI 1.12.0.
