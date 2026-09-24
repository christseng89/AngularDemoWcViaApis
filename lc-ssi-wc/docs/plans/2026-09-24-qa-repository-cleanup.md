# QA Repository Cleanup Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Follow the repository TDD and lint-and-validate gates while executing this plan task-by-task.

**Goal:** Reduce the Git-tracked `qa/` tree to `fixtures`, `tests`, `tdd`, `reports/latest`, and `README.md` without leaving broken repository path references.

**Architecture:** Current reproducible fixtures, executable QA tests, controlled TDD files, and latest summary evidence will be moved into the five approved locations. Generated build mirrors and superseded run evidence will be removed from Git tracking and ignored while remaining recoverable in the local working tree until the Product Owner chooses permanent deletion or external archival.

**Tech Stack:** Git, Node.js test runner, Nx/Jest, SonarQube repository tooling.

---

### Task 1: Add a failing repository-layout contract

**Files:**

- Create: `qa/tests/repository-layout.test.mjs`

1. Assert every tracked `qa/` file is under the approved layout.
2. Assert source/config files do not reference legacy tracked QA paths.
3. Run `node --test qa/tests/repository-layout.test.mjs` and retain the expected RED result.

### Task 2: Move current reproducible QA inputs

**Files:**

- Move current family fixtures to `qa/fixtures/<family>/`.
- Move executable QA runners/oracles to `qa/tests/<scope>/`.
- Move controlled TDD files to `qa/tdd/<family>/`.
- Move only current summary evidence to `qa/reports/latest/<family>/`.

1. Validate every source and destination resolves under `C:\Users\samfi\Downloads\outputs\lc-ssi-wc\qa`.
2. Move files without overwriting existing targets.
3. Leave superseded/generated material locally recoverable until it is removed from Git tracking.

### Task 3: Update repository references

**Files:**

- Modify callers and controlled manifests that reference moved QA files.
- Modify `.gitignore` to allow only the approved layout and ignore transient output beneath it.

1. Apply deterministic old-path to new-path replacements.
2. Search for remaining legacy QA paths.
3. Run the layout contract and obtain GREEN.

### Task 4: Remove unnecessary QA material from Git tracking

**Files:**

- Remove generated `qa/svcapp/` files from the Git index.
- Remove superseded run folders, raw probes, and historical remediation batches from the Git index.

1. Confirm removal targets are inside `lc-ssi-wc/qa`.
2. Remove them from the Git index while preserving local files.
3. Verify the staged/working-tree deletion list contains no approved current artifact.

### Task 5: Validate

1. Run `node --test qa/tests/repository-layout.test.mjs`.
2. Run affected QA runner unit tests.
3. Run `npm run lint` and `npm run typecheck`.
4. Run `npm run test`; report the already-known missing canonical seed separately if it remains absent.
5. Run `git diff --check` and provide the final tracked QA inventory.
