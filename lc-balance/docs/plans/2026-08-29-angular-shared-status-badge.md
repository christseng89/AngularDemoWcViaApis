# Angular Shared Movement Status Badge Implementation Plan

> **For Codex:** Execute this plan task-by-task with Angular best practices and lint-and-validate.

**Goal:** Render movement status class, icon and label through one reusable Angular component while preserving the existing pure business mappings.

**Architecture:** A standalone OnPush presentation component accepts movement-status context and delegates exclusively to the existing `displayStatus`, `statusBadgeClass`, and `statusBadgeIcon` pure functions. Contract-status and accounting-set-status displays remain separate because they use different status domains.

**Tech Stack:** Angular 17 standalone components, TypeScript 5.4, Jest.

---

### Task 1: Create the shared movement status badge

**Files:**
- Create: `src/app/transaction-builder/transaction-status-badge.component.ts`
- Create: `src/app/transaction-builder/transaction-status-badge.component.html`
- Create: `src/app/transaction-builder/transaction-status-badge.component.spec.ts`

1. Test ordinary, earmarking, earmarked and finalized phase presentation.
2. Implement an OnPush component that delegates to the existing pure mappings.
3. Run focused lint, type-check and Jest tests.

### Task 2: Migrate low-risk movement-status call sites

**Files:**
- Modify: `src/app/transaction-builder/maker-queue.component.ts`
- Modify: `src/app/transaction-builder/maker-queue.component.html`
- Modify: `src/app/transaction-builder/inquire-events.component.ts`
- Modify: `src/app/transaction-builder/inquire-events.component.html`
- Modify: `src/app/transaction-builder/account-entries-dialog.component.ts`
- Modify: `src/app/transaction-builder/account-entries-dialog.component.html`

1. Replace movement badge markup in Maker Queue and the Inquire Events timeline.
2. Replace primary movement badges in Account Entries; leave linked accounting-set status unchanged.
3. Preserve existing public helper methods until all remaining callers migrate.
4. Do not merge contract status or linked accounting-set status into this component.

### Task 3: Regression validation

1. Run affected tests.
2. Run complete lint, TypeScript, Jest and production build validation.
3. Confirm unrelated working-tree changes remain untouched.
