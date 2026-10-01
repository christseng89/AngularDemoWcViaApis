## 1. Design and Governance

- [x] 1.1 Confirm scope, assumptions, non-goals and capability boundaries with the Product Owner.
- [x] 1.2 Obtain an AI-assisted independent OpenSpec expert design review and incorporate its blocking findings.
- [x] 1.3 Create the implementation plan and isolated task branch.

## 2. OpenSpec Root and Adoption Artifacts

- [x] 2.1 Create `config.yaml`, archive placeholder and process-only adoption metadata.
- [x] 2.2 Complete proposal, design, evidence, authority, discrepancy, risk and traceability artifacts.
- [x] 2.3 Verify archive-isolated content is not used as an active source or evidence citation.

## 3. Current Capability Baselines

- [x] 3.1 Specify shell, accessibility, Page Parameter contract and generic workbench behaviour.
- [x] 3.2 Specify route discovery/resolution, RMA scope and MT/MX/reference-only outputs.
- [x] 3.3 Specify reference-data maintenance, Maker/Checker concurrency and governed index querying.
- [x] 3.4 Specify development-data reload, Checker workbench and audit/evidence behaviour.

## 4. Traceability and Validation

- [x] 4.1 Map every requirement/scenario ID to available authority, contract, implementation and test evidence.
- [x] 4.2 Record incomplete OAS coverage and all `PARTIAL`, `NOT_PROVEN` or `DISCREPANCY` items.
- [x] 4.3 Pass OpenSpec list, status and `validate --all --strict --no-interactive` checks.
- [x] 4.4 Pass unique-ID, path-existence, archive-exclusion and `git diff --check` controls.

## 5. Four-eyes Acceptance

- [ ] 5.1 Commit an exact local Maker candidate without pushing.
- [ ] 5.2 Obtain an Independent Checker read-only review against that exact commit.
- [ ] 5.3 If findings require edits, create a new candidate and repeat validation and review.
- [ ] 5.4 Record the final external exact-commit verdict and clearly state any remaining governance limitations.
