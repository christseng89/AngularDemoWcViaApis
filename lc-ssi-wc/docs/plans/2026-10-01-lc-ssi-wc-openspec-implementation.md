# LC SSI WC OpenSpec Baseline Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish an evidence-backed, strictly valid OpenSpec baseline and process-only adoption change for the current LC SSI Workbench.

**Architecture:** Current observable capabilities live directly under `openspec/specs/`. The `establish-lc-ssi-wc-openspec` change documents adoption only and sets `skip_specs: true`; source authority, discrepancies, risks, and traceability remain explicit rather than duplicating OAS, parameter, or governance content.

**Tech Stack:** OpenSpec CLI 1.12.0, Markdown, YAML, OpenAPI 3.x JSON, TypeScript/Nx/Jest source evidence, Git.

---

### Task 1: Establish the OpenSpec root and governance context

**Files:**

- Create: `openspec/config.yaml`
- Create: `openspec/changes/archive/.gitkeep`
- Create: `openspec/specs/.gitkeep`

**Step 1:** Record the precondition that `openspec list` fails because no root exists.

**Step 2:** Create the spec-driven configuration with concern-based authority, evidence thresholds, archive rules, and explicit `qa-archived/` exclusion.

**Step 3:** Run `openspec list` and confirm the root is recognised.

### Task 2: Create the process-only adoption change

**Files:**

- Create: `openspec/changes/establish-lc-ssi-wc-openspec/.openspec.yaml`
- Create: `openspec/changes/establish-lc-ssi-wc-openspec/proposal.md`
- Create: `openspec/changes/establish-lc-ssi-wc-openspec/design.md`
- Create: `openspec/changes/establish-lc-ssi-wc-openspec/tasks.md`
- Create: `openspec/changes/establish-lc-ssi-wc-openspec/evidence.md`
- Create: `openspec/changes/establish-lc-ssi-wc-openspec/source-authority-register.md`
- Create: `openspec/changes/establish-lc-ssi-wc-openspec/discrepancy-register.md`
- Create: `openspec/changes/establish-lc-ssi-wc-openspec/risk-assumption-register.md`
- Create: `openspec/changes/establish-lc-ssi-wc-openspec/traceability.md`
- Create: `openspec/changes/establish-lc-ssi-wc-openspec/four-eyes-review-template.md`

**Step 1:** Set `schema: spec-driven` and `skip_specs: true`.

**Step 2:** Document scope, non-goals, compatibility, rollback, lifecycle, and exact-commit review requirements.

**Step 3:** Record source classes and known OAS coverage gaps without asserting unsupported endpoint completeness.

**Step 4:** Create stable traceability columns and status vocabulary: `PROVEN`, `PARTIAL`, `NOT_PROVEN`, `DISCREPANCY`, `NOT_APPLICABLE`.

**Step 5:** Run `openspec status --change establish-lc-ssi-wc-openspec` and resolve missing required artifacts.

### Task 3: Specify shell, contract, and generic workbench capabilities

**Files:**

- Create: `openspec/specs/application-shell-and-accessibility/spec.md`
- Create: `openspec/specs/resolution-page-contract/spec.md`
- Create: `openspec/specs/generic-resolution-workbench/spec.md`

**Step 1:** Derive observable requirements from the shared shell, typed Page Parameter model, API page definition, and generic renderer.

**Step 2:** Add positive, invalid, stale, loading/error, accessibility, and metadata-driven scenarios with stable IDs.

**Step 3:** Ensure no MT-specific UI branch or copied field catalogue becomes a second source of truth.

### Task 4: Specify route, RMA, and output capabilities

**Files:**

- Create: `openspec/specs/settlement-route-discovery-and-resolution/spec.md`
- Create: `openspec/specs/rma-authorisation-and-message-scope/spec.md`
- Create: `openspec/specs/mt-mx-and-reference-output-contract/spec.md`

**Step 1:** Capture discovery snapshot, complete route selection, atomic resolve, ambiguity, stale context, and fail-closed behaviour.

**Step 2:** Separate RMA authorisation from route selection and display format from execution transport.

**Step 3:** Capture supported MT/MX structured output and the MT347 reference-only boundary without creating unsupported conversion scope.

### Task 5: Specify governed maintenance and concurrency

**Files:**

- Create: `openspec/specs/governed-reference-data-maintenance/spec.md`
- Create: `openspec/specs/maker-checker-and-concurrency/spec.md`

**Step 1:** Trace common SSI, Nostro, Entity, RMA, SWIFT-data import/repair responsibilities to implementation and tests.

**Step 2:** Specify server-authoritative WIP reservation, Save Draft, approve/reject, close/cancel, expiry, and stale/conflict behaviour only where proven.

**Step 3:** Put unproven governance mandates in the discrepancy register rather than current specs.

### Task 6: Specify indexes, development reload, Checker, and audit

**Files:**

- Create: `openspec/specs/governed-index-querying/spec.md`
- Create: `openspec/specs/development-data-reload/spec.md`
- Create: `openspec/specs/checker-workbench/spec.md`
- Create: `openspec/specs/audit-and-evidence/spec.md`

**Step 1:** Capture server-side pagination, allow-listed stable sorting, filtering, and page metadata.

**Step 2:** Capture development-only reload authorisation, maintenance barrier, backup/restore, audit, and failure behaviour where evidenced.

**Step 3:** Keep Checker actions separate from immutable audit/evidence presentation.

### Task 7: Complete traceability and discrepancy analysis

**Files:**

- Modify: `openspec/changes/establish-lc-ssi-wc-openspec/traceability.md`
- Modify: `openspec/changes/establish-lc-ssi-wc-openspec/discrepancy-register.md`
- Modify: `openspec/changes/establish-lc-ssi-wc-openspec/evidence.md`

**Step 1:** Map every requirement/scenario ID to authority, OAS operation/schema, typed symbol, parameter identity, implementation, test, and status.

**Step 2:** Record missing OAS operations and any implementation/governance mismatch.

**Step 3:** Verify all referenced paths exist and none enter `qa-archived/`.

### Task 8: Validate and prepare the Maker candidate

**Files:**

- Modify: `openspec/changes/establish-lc-ssi-wc-openspec/tasks.md`
- Modify: `openspec/changes/establish-lc-ssi-wc-openspec/evidence.md`

**Step 1:** Run `openspec list` and `openspec list --specs`.

**Step 2:** Run `openspec status --change establish-lc-ssi-wc-openspec`.

**Step 3:** Run `openspec validate --all --strict --no-interactive` and require all items to pass.

**Step 4:** Run path, reference, duplicate-ID, and archived-reference checks.

**Step 5:** Review `git diff --check`, explicit staged paths, and branch status.

**Step 6:** Commit the Maker candidate locally; do not push.

### Task 9: Independent exact-commit 4-EYES review

**Files:**

- Read-only review of the exact Maker candidate commit.
- External review evidence only; no authoritative verdict is committed into the candidate.

**Step 1:** Independent Checker reads the required governance and excludes `qa-archived/`.

**Step 2:** Checker reruns all OpenSpec and traceability checks against the exact candidate commit.

**Step 3:** Checker reports `PASS` or `CHANGES_REQUIRED` with file/requirement-specific findings.

**Step 4:** If changes are required, create a new Maker candidate and repeat the full review; do not carry approval forward.
