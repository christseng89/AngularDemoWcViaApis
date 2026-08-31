# Angular Shared Search and Pagination Implementation Plan

> **For Codex:** Execute this plan task-by-task with Angular best practices and lint-and-validate.

**Goal:** Replace repeated transaction search and pagination markup with reusable, presentation-only Angular components without changing service APIs or business behavior.

**Architecture:** Add two standalone OnPush components that receive primitive view state and emit user intent. Existing feature services remain the owners of search terms, loading state, paging state, and API orchestration; feature templates compose the shared controls and continue calling the same service methods.

**Tech Stack:** Angular 17 standalone components, TypeScript 5.4, Jest, RxJS.

---

### Task 1: Shared search field

**Files:**
- Create: `src/app/transaction-builder/transaction-search-field.component.ts`
- Create: `src/app/transaction-builder/transaction-search-field.component.html`
- Create: `src/app/transaction-builder/transaction-search-field.component.spec.ts`

1. Write tests for value propagation, Enter/Search emission, loading text, spinner and disabled state.
2. Implement a presentation-only OnPush component with `valueChange` and `searchRequested` outputs.
3. Run its Jest test, ESLint and TypeScript checks.

### Task 2: Shared pagination controls

**Files:**
- Create: `src/app/transaction-builder/transaction-pagination.component.ts`
- Create: `src/app/transaction-builder/transaction-pagination.component.html`
- Create: `src/app/transaction-builder/transaction-pagination.component.spec.ts`

1. Write tests for page summary, boundary disabled states and previous/next events.
2. Implement a presentation-only OnPush component using primitive inputs.
3. Run its Jest test, ESLint and TypeScript checks.

### Task 3: Migrate low-risk consumers

**Files:**
- Modify: `src/app/transaction-builder/maker-queue.component.ts`
- Modify: `src/app/transaction-builder/maker-queue.component.html`
- Modify: `src/app/transaction-builder/inquire-delete-pending.component.ts`
- Modify: `src/app/transaction-builder/inquire-delete-pending.component.html`

1. Replace Maker Queue LC search and pagination markup with the shared components.
2. Replace Inquire Delete Pending LC Index search and pagination markup with the shared components.
3. Preserve the existing service fields and method calls exactly.
4. Run affected component/service tests and production template compilation.

### Task 4: Regression validation

1. Run ESLint and TypeScript compilation.
2. Run the complete Jest suite and verify coverage thresholds.
3. Run the Angular production build.
4. Review the final diff and preserve unrelated user changes.
