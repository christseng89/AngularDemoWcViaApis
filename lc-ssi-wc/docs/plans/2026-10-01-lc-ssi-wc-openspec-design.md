# LC SSI WC OpenSpec Baseline Design

## Understanding Summary

- Establish a complete OpenSpec root for the existing LC SSI Workbench by following the structural pattern used by `lc-payment-wc`.
- Describe only implemented, observable behaviour that can be traced to controlled sources, contracts, production code, tests, or current evidence.
- Keep OpenSpec separate from OpenAPI: OAS and typed contracts govern wire shape; OpenSpec describes accepted product capabilities and scenarios.
- Preserve the controlled `OAS / typed contract + parameters / DB -> domain / API -> page parameters -> generic UI` architecture.
- Make no production-code, API, database, fixture, or UI behaviour change in this adoption task.
- Exclude `qa-archived/` from every source search, trace, validation, and review.
- Use Maker/Independent Checker separation and bind final review to one exact candidate commit in external handoff evidence.

## Assumptions and Non-goals

- Current `main` at design time is commit `98c5eb60809d1e5b4e567df8251d361a7fce1f2b`.
- Existing controlled governance, OAS, typed contracts, governed parameters, implementation, and automated tests are the available evidence sources.
- The current OAS is not assumed to cover every implemented endpoint; gaps are recorded rather than hidden.
- AI-assisted review does not replace an authorised human BA, QA, DBA, governance, or regulatory sign-off.
- This task does not introduce new SSI business rules, message support, UI behaviour, or runtime quality gates.

## Architecture

The OpenSpec root uses the `spec-driven` schema. Evidence-backed current capabilities are created directly under `openspec/specs/`. A process-only adoption change named `establish-lc-ssi-wc-openspec` records the reason, method, tasks, risks, evidence, and review guidance; it uses `skip_specs: true` so the same requirements are not represented as both current baselines and active deltas.

### Current capability specifications

1. `application-shell-and-accessibility`
2. `resolution-page-contract`
3. `generic-resolution-workbench`
4. `settlement-route-discovery-and-resolution`
5. `rma-authorisation-and-message-scope`
6. `governed-reference-data-maintenance`
7. `maker-checker-and-concurrency`
8. `governed-index-querying`
9. `development-data-reload`
10. `checker-workbench`
11. `audit-and-evidence`
12. `mt-mx-and-reference-output-contract`

Quality governance is recorded in `config.yaml` and the adoption artifacts. It is not presented as a runtime product capability unless a requirement is both testable and evidenced.

## Concern-based Authority Model

- Business and SWIFT semantics: explicit Product Owner decisions, controlled governance, source registers, and applicable controlled standards.
- API wire contract: OpenAPI and TypeScript typed contracts must agree; mismatch is a discrepancy.
- Catalogue and runtime data: governed parameters, seeds, fixture binding, and DB logical snapshot.
- Current OpenSpec: accepted, implemented, observable behaviour only.
- Implementation and tests: verification evidence; they do not invent business semantics.

Conflicts are never silently resolved by a single global precedence list. They are entered in the discrepancy register as `DISCREPANCY` or `NOT_PROVEN` and excluded from unqualified current requirements.

## Traceability

Every requirement and scenario receives a stable identifier. The traceability matrix records, where applicable: authority rule/page/SHA, OAS operation/schema, typed symbol, parameter key/release, implementation path, automated test, evidence, and status. Missing OAS coverage is explicitly recorded and does not invalidate implementation evidence, but it prevents a claim of complete OAS traceability.

## Validation and Failure Handling

The required OpenSpec checks are:

```powershell
openspec list
openspec list --specs
openspec status --change establish-lc-ssi-wc-openspec
openspec validate --all --strict --no-interactive
```

Validation failure blocks completion. Unsupported claims are marked `NOT_PROVEN`. Authority conflicts are recorded as discrepancies. References to `qa-archived/`, self-approval, or an unbound Checker verdict are blocking findings.

## Four-eyes Model

The Maker prepares the baseline and commits an exact candidate. The Independent Checker performs a read-only review of that commit and records the authoritative verdict outside the repository. Repository review files are templates or non-authoritative working notes only. Any Maker correction creates a new candidate commit and invalidates the previous verdict.

## Risks

- Baseline specs could overstate governance mandates that are not implemented.
- OAS gaps could be mistaken for complete API coverage.
- Capability boundaries could duplicate rules already owned by parameters or typed contracts.
- A committed Checker report could accidentally create a new, unreviewed commit.
- Large requirement sets could pass syntax validation while retaining weak traceability.

Controls are the evidence threshold, discrepancy register, concern-based authority model, stable IDs, full strict validation, and exact-commit independent re-review.

## Decision Log

| Decision                                                   | Alternatives                                     | Rationale                                                                                 |
| ---------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Direct current baselines plus process-only adoption change | Baseline only; all capabilities as active deltas | Preserves current-state truth and adoption history without duplicate lifecycle ownership. |
| `skip_specs: true` for adoption change                     | Duplicate quality-governance delta               | Avoids representing one requirement as current and proposed simultaneously.               |
| Concern-based authority                                    | Single linear precedence list                    | Different sources are authoritative for different concerns; conflicts must fail closed.   |
| Capability boundaries by stable responsibility             | MT-specific or component-specific specs          | Supports Open/Closed architecture and avoids message-specific duplication.                |
| External exact-commit Checker verdict                      | Commit a final approval file                     | Adding an approval file changes the candidate commit and breaks identity binding.         |
| `openspec validate --all --strict --no-interactive`        | `openspec validate --strict`                     | OpenSpec CLI 1.12.0 requires explicit bulk scope for reliable non-interactive validation. |

## Independent Expert Design Review

An AI-assisted OpenSpec expert independently reviewed the design against `lc-payment-wc`, OpenSpec CLI 1.12.0, and the current SSI repository. The initial design was `CHANGES_REQUIRED`; the blocking findings were incorporated into this final design. This consultation is not the final candidate-commit Checker verdict and is not a human BA/QA approval.
