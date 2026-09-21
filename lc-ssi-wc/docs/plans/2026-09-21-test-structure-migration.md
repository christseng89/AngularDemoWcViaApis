# Test Structure Migration Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use lint-and-validate after every migration batch.

**Goal:** Move every Jest unit, acceptance, and test source into a mirrored `src/test/` tree without changing production code or test semantics.

**Architecture:** Each Nx application moves tests from `apps/<app>/src/<relative-path>` to `apps/<app>/src/test/<relative-path>`. Each Nx library independently moves tests from `libs/<library>/src/<relative-path>` to `libs/<library>/src/test/<relative-path>`. Only imports, fixture paths, discovery/compilation configuration, scripts, and static old-path assertions may change.

**Tech Stack:** Nx, Jest, TypeScript, Angular, NestJS, ESLint.

---

## Governance and roles

- Maker: Codex, working on Git branch `unit-test`.
- Independent Checker: pending; the Maker must not approve this migration.
- Candidate identity: exact Git commit to be recorded only after all local gates pass.
- Remote operations: no push and no merge.

## Locked scope

Allowed changes:

- Move test files without renaming them.
- Fix relative imports and dynamic or fixture paths made invalid by the move.
- Fix Jest, Nx, or TypeScript test discovery/compilation configuration only when required.
- Fix scripts and static assertions that refer to old test paths.

Forbidden changes:

- Production code or business behavior changes.
- Test logic, test names, assertions, or semantics changes.
- Test merge, split, rename, refactor, or opportunistic cleanup.

## Decision log

1. All existing `*.spec.ts`, `*.test.ts`, and `*.acceptance.spec.ts` files move.
2. The destination mirrors the complete path below each project's `src/` directory.
3. Shared libraries use `libs/<library>/src/test/`, not a shared `libs/test/` project.
4. Projects migrate one at a time and are verified immediately after each batch.
5. The integrity gate compares file, suite, case, and four coverage metric counts before and after migration.

## Task 1: Capture immutable migration baseline

**Files:**

- Create transient evidence under `tmp/test-structure-migration/`.
- Do not modify source or test files.

**Steps:**

1. Inventory every test file by owning Nx project and record its SHA-256.
2. Run each Nx test target uncached and record suite count, test count, skipped count, and coverage totals.
3. Record current typecheck, build, and verifier behavior separately from the migration delta.
4. Store the baseline only under ignored `tmp/` because it is local QA evidence.

## Task 2: Migrate application projects independently

**Files:**

- Move: `apps/<app>/src/**/*.spec.ts` and `apps/<app>/src/**/*.test.ts`.
- Destination: `apps/<app>/src/test/<original-path-below-src>`.
- Modify only when required: that app's `jest.config.ts`, `tsconfig.spec.json`, `project.json`, moved imports, fixture paths, or old-path assertions.

**Per-project steps:**

1. Move files while preserving names and mirrored paths.
2. Mechanically adjust only paths broken by the added `test/` segment.
3. Confirm no test remains outside `src/test/`.
4. Run ESLint and the project's typecheck/test target uncached.
5. Compare file, suite, test, skipped, and coverage totals with the baseline before starting the next project.

## Task 3: Migrate library projects independently

**Files:**

- Move: `libs/<library>/src/**/*.spec.ts` and `libs/<library>/src/**/*.test.ts`.
- Destination: `libs/<library>/src/test/<original-path-below-src>`.
- Modify only when required: that library's test configuration and moved path references.

**Steps:** Repeat the same five per-project steps from Task 2 for every library with tests.

## Task 4: Repository-wide stale-path and duplication checks

1. Compare test filenames and content hashes with the baseline manifest.
2. Search for test files outside the allowed project `src/test/` trees.
3. Search scripts, configuration, and static assertions for stale old test paths.
4. Confirm Jest discovered each test file exactly once and reported no unexpected skips.

## Task 5: Final gates

1. Run repository typecheck.
2. Run all tests uncached with coverage.
3. Run the build.
4. Run `npm run verify`.
5. Run `npm audit --audit-level=high` as the security validation required by lint-and-validate.
6. Compare all migration integrity metrics with baseline; coverage after must be greater than or equal to coverage before for every metric.
7. Prepare the exact local candidate commit and hand it to a distinct Independent Checker; do not push or merge.
