# Angular Inquire Shared Controls Implementation Plan

> **For Codex:** Execute with Angular best practices and lint-and-validate.

**Goal:** Complete Inquire Events migration to shared search, pagination and contract-status presentation controls.

**Architecture:** Existing services continue owning all state and behavior. Standalone OnPush components receive primitive view state and emit user intent; contract status delegates to the existing contract-specific pure mappings and remains separate from movement status.

**Tech Stack:** Angular 17, TypeScript 5.4, Jest.

---

### Task 1: Contract status badge

**Files:**
- Create: `src/app/transaction-builder/contract-status-badge.component.ts`
- Create: `src/app/transaction-builder/contract-status-badge.component.html`
- Create: `src/app/transaction-builder/contract-status-badge.component.spec.ts`

1. Test ACTIVE, CLOSING and CLOSED presentation.
2. Implement an OnPush component delegating to existing contract-status mappings.
3. Run focused validation.

### Task 2: Inquire Events composition

**Files:**
- Modify: `src/app/transaction-builder/inquire-events.component.ts`
- Modify: `src/app/transaction-builder/inquire-events.component.html`

1. Migrate LC Index search to `TransactionSearchFieldComponent`.
2. Migrate Index and Events pagination to `TransactionPaginationComponent`.
3. Migrate Index contract status to `ContractStatusBadgeComponent`.
4. Preserve service fields and method calls.

### Task 3: Regression validation

1. Run affected and complete Jest suites.
2. Run ESLint, TypeScript and production build.
3. Clean generated coverage artifacts and verify the diff.
