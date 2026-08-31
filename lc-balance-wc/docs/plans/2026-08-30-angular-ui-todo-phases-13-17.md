# Angular UI TODO Phases 13–17 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use angular-best-practices, angular-ui-patterns and lint-and-validate task-by-task.

**Goal:** Complete the remaining UI_TODO message, accessibility and safe Remarks-only Fix Pending foundation in five sequential phases.

**Architecture:** Existing mutable feature services and business workflows remain authoritative. Components adapt their existing string state to `UiMessage` at presentation boundaries. Accessibility is added without changing submit/search rules. Remarks-only Fix Pending is restricted to standalone A9 and protected by an explicit policy plus backend strict allowlist and no-recalculation path.

**Tech Stack:** Angular 17, TypeScript, SCSS, Jest, Express, Zod, SQLite.

---

### Task 1: Phase 13 — Checker feedback

Migrate Checker search and action errors to `FeedbackMessageComponent`; retain existing error state and action methods. Test no-match, system error and retry routing.

### Task 2: Phase 14 — Maker feedback

Migrate Maker Result submit errors to `FeedbackMessageComponent`; use `ApiErrorPresenter` only at the view boundary so validation and workflow state remain unchanged.

### Task 3: Phase 15 — Inquiry feedback

Migrate Inquire Events and Inquire Delete Pending loading/error/empty states to semantic standard messages without changing index services or pagination.

### Task 4: Phase 16 — Accessibility

Add stable input ids, label associations, `aria-required`, `aria-invalid` and `aria-describedby` to shared Search and Checker search fields. Keep button disabled/loading behavior unchanged.

### Task 5: Phase 17 — A9 Remarks-only Fix Pending

Implement the UI_TODO-approved first function only: standalone A9. Add explicit `REMARKS_ONLY` policy, trimmed nullable 500-character remarks, changed-value gating, strict API schema/type support, direct remarks audit/update path, and tests proving amount/currency/status/event sequence/accounting remain unchanged. Do not enable settlement or compound functions A4/A6/A7/B4/B5.

### Task 6: Full verification

Run Angular and microservice lint/type checks, all Jest suites, dependency audit, production builds, and diff checks. Restore generated calendar and coverage files.
