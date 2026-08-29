# Maker Balance Warning Policy Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move Maker balance-warning decisions out of the template into a tested pure policy and OnPush renderer.

**Architecture:** `deriveMakerBalanceWarnings()` consumes already-derived Maker state and returns display messages. It does not recalculate capacity or replace backend validation. `MakerBalanceWarningsComponent` renders the messages inside the shared balance box.

**Tech Stack:** Angular 17 standalone components, TypeScript, Jest, SCSS.

---

### Task 1: Pure warning policy

**Files:** Create `maker-balance-warning.policy.ts` and its spec.

**Steps:** Test no-warning, Available precedence, Tight-only B3/A8, SG widening explanation, B4 presentation widening, and locked form; implement the minimal pure policy; run focused validation.

### Task 2: Warning renderer and Maker integration

**Files:** Create `maker-balance-warnings.component.*`; modify `maker-panel.component.ts/html`.

**Steps:** Test accessible rendering; replace both template expressions with one configured child; retain all existing capacity getters and backend rules; run Maker regressions.

### Task 3: Quality gate

Run full lint, TypeScript, Jest, dependency audit, production build, generated-file cleanup, and diff validation.
