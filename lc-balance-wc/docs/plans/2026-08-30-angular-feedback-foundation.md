# Angular Feedback Foundation Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use angular-best-practices and lint-and-validate to implement this plan task-by-task.

**Goal:** Complete phases 10–12 by establishing globally reliable shared control styles, a reusable feedback renderer, and a tested API-error presentation policy with an initial Maker Queue migration.

**Architecture:** Global design-system partials own cross-component visual primitives. A pure presenter converts transport failures into a stable `UiMessage` view model, while an OnPush presentation component owns severity, ARIA and retry rendering. Feature services retain API orchestration and existing string state during the first migration to minimize behavioral risk.

**Tech Stack:** Angular 17 standalone components, TypeScript, SCSS, Jest.

---

### Task 1: Phase 10 — shared control stylesheet boundary

**Files:**
- Create: `src/styles/_transaction-controls.scss`
- Modify: `src/styles.scss`
- Modify: `src/app/transaction-builder/transaction-search-field.component.ts`
- Modify: `src/app/transaction-builder/transaction-pagination.component.ts`

**Steps:**
1. Move Search and Pagination visual primitives to an element-scoped global partial.
2. Remove their component-scoped stylesheet dependency.
3. Build and inspect the global CSS bundle for the expected selectors.

### Task 2: Phase 11 — feedback view model and renderer

**Files:**
- Create: `src/app/shared/feedback/ui-message.model.ts`
- Create: `src/app/shared/feedback/feedback-message.component.ts`
- Create: `src/app/shared/feedback/feedback-message.component.html`
- Create: `src/app/shared/feedback/feedback-message.component.spec.ts`
- Create: `src/styles/_feedback.scss`
- Modify: `src/styles.scss`

**Steps:**
1. Test severity class, alert/status semantics, optional next action, support code and retry event.
2. Implement a standalone OnPush renderer with no feature knowledge.
3. Put cross-feature feedback styling in the global design-system layer.

### Task 3: Phase 12 — API error presenter and Maker Queue migration

**Files:**
- Create: `src/app/shared/feedback/api-error-presenter.ts`
- Create: `src/app/shared/feedback/api-error-presenter.spec.ts`
- Modify: `src/app/transaction-builder/maker-queue.component.ts`
- Modify: `src/app/transaction-builder/maker-queue.component.html`
- Modify: `src/app/transaction-builder/maker-queue.component.spec.ts`

**Steps:**
1. Test 404 search, duplicate reference, conflict, network and unexpected errors.
2. Implement a pure presenter; never expose URLs, stack traces or `[object Object]` as primary copy.
3. Adapt Maker Queue's existing error string at the presentation boundary and render it through the shared component.
4. Keep service state, API calls, events and empty-result rules unchanged.
5. Run full lint, type check, Jest, dependency audit and production build.
