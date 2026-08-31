# Balance Component Web Component Phase 1 Implementation Plan

> **For Codex:** Implement this plan task-by-task in `lc-balance-wc`; the copied workspace intentionally has no Git metadata, so validation checkpoints replace commit steps.

**Goal:** Add a separately buildable `<balance-component-app>` custom element while preserving the existing Angular application mode.

**Architecture:** Keep the current Angular application entry unchanged. Add a framework-neutral shell with internal view state, register it through Angular Elements from a dedicated bootstrap entry, and expose only typed Web Component configuration and lifecycle events. The custom element must not use the host application's router.

**Tech Stack:** Angular 20 standalone components, Angular Elements, TypeScript, Jest, SCSS, Angular application builder.

---

### Task 1: Define the public contract

**Files:**
- Create: `src/app/web-component/balance-component-element.contract.ts`
- Test: `src/app/web-component/balance-component-element.contract.spec.ts`

1. Define versioned config, view, ready, navigation and error payload types.
2. Add normalization tests for missing and partial configuration.
3. Run the focused Jest suite and confirm the initial failure before implementation.
4. Implement the minimal normalization boundary and rerun the suite.

### Task 2: Add the framework-neutral Angular shell

**Files:**
- Create: `src/app/web-component/balance-component-element.component.ts`
- Create: `src/app/web-component/balance-component-element.component.html`
- Create: `src/app/web-component/balance-component-element.component.scss`
- Test: `src/app/web-component/balance-component-element.component.spec.ts`

1. Test default view, config application, view navigation and emitted Custom Element outputs.
2. Implement an OnPush standalone shell.
3. Lazy-load Transaction Builder and Business Case Runner internally without `RouterOutlet`.
4. Keep all Balance business logic in the existing feature components and services.

### Task 3: Register the custom element

**Files:**
- Create: `src/web-component.ts`
- Create: `tsconfig.web-component.json`
- Test: `src/web-component.spec.ts`

1. Export an idempotent `registerBalanceComponent()` function.
2. Bootstrap an Angular application context with the existing DI/Formly providers but no router.
3. Register the tag name `balance-component-app` exactly once.
4. Emit `balance-ready` after the element shell initializes.

### Task 4: Add a dedicated build target

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `angular.json`
- Modify: `tsconfig.spec.json`

1. Install matching `@angular/elements` 20.x.
2. Add `build:wc` and `typecheck:wc` scripts.
3. Add a separate Angular project/build target using `src/web-component.ts` and unhashed output filenames.
4. Preserve the existing `npm run build` application output unchanged.

### Task 5: Validate and document

**Files:**
- Create: `docs/web-component.md`
- Update: relevant Obsidian architecture index/source map
- Review only: `analysis/balance-component-api.yaml`
- Review only: `analysis/balance-component-channel-api.yaml`

1. Run focused and full Jest tests.
2. Run application and Web Component typechecks.
3. Run lint, format check, high-severity audit and both production builds.
4. Verify the Web Component bundle contains the registered tag and no router bootstrap.
5. Record that Phase 1 changes no HTTP API contract, so OAS remains unchanged.

