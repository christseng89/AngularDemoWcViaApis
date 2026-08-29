# Maker Action Bar Extraction Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract Maker transaction actions behind a tested presentation policy and reusable OnPush component without changing workflow behavior.

**Architecture:** A pure `deriveMakerActionBarView()` function converts existing Maker state into explicit visibility and disabled flags. `MakerActionBarComponent` renders that view and emits semantic events; `MakerPanelComponent` remains the application orchestrator and invokes all existing methods.

**Tech Stack:** Angular 17 standalone components, TypeScript, Jest, SCSS.

---

### Task 1: Encode the current action policy

**Files:**
- Create: `src/app/transaction-builder/maker-action-bar.policy.ts`
- Test: `src/app/transaction-builder/maker-action-bar.policy.spec.ts`

**Steps:**
1. Write tests covering A4, normal Submit, Fix Pending, and Delete Pending modes.
2. Run the focused policy test and verify the missing implementation failure.
3. Implement a pure derivation function returning visibility, label, and disabled flags.
4. Run ESLint, TypeScript, and the focused test.

### Task 2: Add the presentation component

**Files:**
- Create: `src/app/transaction-builder/maker-action-bar.component.ts`
- Create: `src/app/transaction-builder/maker-action-bar.component.html`
- Create: `src/app/transaction-builder/maker-action-bar.component.scss`
- Test: `src/app/transaction-builder/maker-action-bar.component.spec.ts`

**Steps:**
1. Write component tests for labels, disabled state, CSS classes, and semantic outputs.
2. Implement an OnPush standalone component with no injected service.
3. Keep button and spinner styling inside the child encapsulation boundary.
4. Run focused validation.

### Task 3: Compose it into MakerPanel

**Files:**
- Modify: `src/app/transaction-builder/maker-panel.component.ts`
- Modify: `src/app/transaction-builder/maker-panel.component.html`
- Modify: `src/app/transaction-builder/maker-panel.component.scss`
- Test: `src/app/transaction-builder/maker-panel.component.spec.ts`

**Steps:**
1. Replace the existing action markup with the child component.
2. Wire semantic outputs to the unchanged MakerPanel methods.
3. Remove only CSS rules that no longer have a parent-template consumer.
4. Run focused tests, full tests, production build, lint, TypeScript, and dependency audit.
