# Maker Context Header Extraction Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract Maker workflow notices and protected transaction identity into tested OnPush presentation components.

**Architecture:** A pure identity policy converts the existing A4/A6/A8/B3 natural-key conditions into display items. Two stateless standalone components render workflow notices and protected identity, while `MakerPanelComponent` retains all state and workflow behavior.

**Tech Stack:** Angular 17 standalone components, TypeScript, Jest, SCSS.

---

### Task 1: Protected identity policy and component

**Files:**
- Create: `src/app/transaction-builder/protected-transaction-identity.policy.ts`
- Create: `src/app/transaction-builder/protected-transaction-identity.component.ts`
- Create: `src/app/transaction-builder/protected-transaction-identity.component.html`
- Create: `src/app/transaction-builder/protected-transaction-identity.component.scss`
- Test: corresponding `*.spec.ts` files

**Steps:** Write failing cases for ordinary two-key records, A6 carried IB, A8/B3 new reference exclusion, and A4 carried IB; implement the pure policy and OnPush renderer; run focused lint, type, and Jest checks.

### Task 2: Workflow notices component

**Files:**
- Create: `src/app/transaction-builder/maker-workflow-notices.component.ts`
- Create: `src/app/transaction-builder/maker-workflow-notices.component.html`
- Create: `src/app/transaction-builder/maker-workflow-notices.component.scss`
- Test: `src/app/transaction-builder/maker-workflow-notices.component.spec.ts`

**Steps:** Test success, Fix Pending, and Delete Pending notices; implement an OnPush component with accessible alert semantics; run focused validation.

### Task 3: MakerPanel composition and regression

**Files:**
- Modify: `src/app/transaction-builder/maker-panel.component.ts`
- Modify: `src/app/transaction-builder/maker-panel.component.html`
- Modify: `src/app/transaction-builder/maker-panel.component.scss`

**Steps:** Replace duplicated markup, remove moved styles, execute full lint/types/tests/audit/build, restore generated artifacts, and inspect the diff.
