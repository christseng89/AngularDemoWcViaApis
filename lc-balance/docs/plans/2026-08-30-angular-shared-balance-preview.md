# Shared Balance Preview Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reuse `BalanceSnapshotBoxComponent` for Maker balance preview without changing balance calculations or warning rules.

**Architecture:** Extend the existing OnPush presentation component with explicit `full|compact` and `current|default` configuration. Use content projection for Maker-only validation warnings so common balance rows are implemented once while business validation remains parent-owned.

**Tech Stack:** Angular 17 standalone components, TypeScript, Jest, SCSS.

---

### Task 1: Extend the shared balance box

**Files:**
- Modify: `src/app/transaction-builder/balance-snapshot-box.component.ts`
- Modify: `src/app/transaction-builder/balance-snapshot-box.component.html`
- Test: `src/app/transaction-builder/balance-snapshot-box.component.spec.ts`

**Steps:** Add configuration defaults and rendering tests; implement compact labels/rows, appearance selection, OnPush, and content projection; run focused lint/types/tests.

### Task 2: Migrate Maker preview

**Files:**
- Modify: `src/app/transaction-builder/maker-panel.component.ts`
- Modify: `src/app/transaction-builder/maker-panel.component.html`
- Modify: `src/app/transaction-builder/maker-panel.component.scss`

**Steps:** Replace duplicated balance rows with the shared component; project the unchanged amount warnings; remove only unused balance-row CSS; run Maker regressions.

### Task 3: Quality gate

Run full lint, TypeScript, Jest, dependency audit, production build, generated-file cleanup, and diff validation.
