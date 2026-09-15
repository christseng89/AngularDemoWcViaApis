# Settings and Demo Data Reload Implementation Plan

> **For Codex:** Execute this plan task-by-task with TDD, preserving unrelated worktree changes.

**Goal:** Add a Settings page below Audit with theme controls, a server-authoritative Development flag, password-gated canonical demo-data reload, and a reusable accessible alert system.

**Architecture:** Keep the current navigation model, but extract settings and severity responsibilities into focused Angular components/services. Add small NestJS runtime-settings and reload services; the server validates configuration and reloads the active SQLite database transactionally from the canonical seed. BFF endpoints remain thin pass-throughs and the existing centralized retry interceptor must never retry reload or governed SSI data-quality failures.

**Tech Stack:** Angular 22 standalone components/signals, NestJS 11, Node 22 `node:sqlite`, Jest/Nx, Playwright, SonarQube.

---

### Task 1: Restore the retry interceptor baseline

**Files:**
- Modify: `apps/ssi-bff/src/upstream-api.interceptor.ts`
- Modify: `apps/ssi-bff/src/upstream-api.interceptor.spec.ts`

1. Add a failing test proving a controlled JSON 503 is returned without retry and its body remains readable.
2. Inspect only retryable JSON responses, reconstruct any consumed response bytes, and return the reconstructed response for controlled failures.
3. Run the BFF unit suite and confirm all forwarding tests still pass.

### Task 2: Implement runtime-settings policy

**Files:**
- Create: `apps/ssi-service/src/app/runtime-settings.policy.ts`
- Create: `apps/ssi-service/src/app/runtime-settings.policy.spec.ts`
- Create: `apps/ssi-service/src/app/runtime-settings.controller.ts`
- Create: `apps/ssi-service/src/app/runtime-settings.controller.spec.ts`
- Modify: `apps/ssi-service/src/app/app.module.ts`

1. Write tests for `demo`/`development` ON, other/blank/unknown OFF, `SSI_RUNTIME_ENV` precedence, and reload disabled when password/paths are missing.
2. Implement a pure policy object and `GET /api/settings/runtime` with non-secret seed/current snapshot metadata.
3. Register the controller and run focused tests.

### Task 3: Implement transactional canonical reload

**Files:**
- Create: `apps/ssi-service/src/app/development-data-reload.service.ts`
- Create: `apps/ssi-service/src/app/development-data-reload.service.spec.ts`
- Create: `apps/ssi-service/src/app/development-data-reload.controller.ts`
- Create: `apps/ssi-service/src/app/development-data-reload.controller.spec.ts`
- Modify: `apps/ssi-service/src/app/app.module.ts`
- Modify: `.env.example`

1. Write failing tests for runtime OFF, missing configuration, wrong password, concurrent reload, invalid seed, schema mismatch, transaction rollback, and success.
2. Validate password with constant-time comparison and accept no client filesystem values.
3. Validate seed classification/schema/logical identity before writing.
4. Run `BEGIN IMMEDIATE`, delete and repopulate seed tables, verify integrity and logical identity, then commit; roll back on every failure.
5. Return only safe status, row counts, seed SHA, snapshot SHA/method, and completion time.
6. Document environment variable names and sample values without creating any password fallback.

### Task 4: Expose BFF settings endpoints

**Files:**
- Modify: `apps/ssi-bff/src/main.ts`
- Modify: `apps/ssi-bff/src/main.spec.ts`
- Modify: `apps/ssi-bff/src/upstream-api.interceptor.ts`

1. Add forwarding tests for runtime status and reload.
2. Add GET/POST BFF endpoints.
3. Ensure reload POST is never retried without an idempotency key and the UI does not send one.

### Task 5: Create reusable Angular settings state

**Files:**
- Create: `apps/ssi-portal/src/app/theme.service.ts`
- Create: `apps/ssi-portal/src/app/theme.service.spec.ts`
- Create: `apps/ssi-portal/src/app/runtime-settings.service.ts`
- Create: `apps/ssi-portal/src/app/runtime-settings.service.spec.ts`
- Create: `apps/ssi-portal/src/app/demo-data-reload.facade.ts`
- Create: `apps/ssi-portal/src/app/demo-data-reload.facade.spec.ts`
- Modify: `apps/ssi-portal/src/app/app.component.ts`

1. Move theme persistence/system observation behind `ThemeService` while preserving behavior.
2. Add typed runtime/reload API services and a facade with idle/confirming/reloading/success/error states.
3. Cover every state transition and error mapping before UI integration.

### Task 6: Build Settings UI below Audit

**Files:**
- Create: `apps/ssi-portal/src/app/settings-page.component.ts`
- Create: `apps/ssi-portal/src/app/settings-page.component.spec.ts`
- Create: `apps/ssi-portal/src/app/settings-page.component.css`
- Modify: `apps/ssi-portal/src/app/app.component.html`
- Modify: `apps/ssi-portal/src/app/app.component.ts`
- Modify: `apps/ssi-portal/src/styles.css`

1. Add Settings to the View union and navigation immediately below Audit.
2. Render Appearance, read-only Runtime Environment, and Development Data sections.
3. Implement an accessible password alert dialog; clear the password after every terminal result.
4. Disable reload when Development is OFF, configuration is incomplete, or a reload is active.
5. After success, refresh all portal data and show seed/snapshot verification metadata.
6. Test navigation, keyboard/focus behavior, disabled states, password handling, and success/failure rendering.

### Task 7: Unify Error and Warning presentation

**Files:**
- Create: `apps/ssi-portal/src/app/alert.component.ts`
- Create: `apps/ssi-portal/src/app/alert.component.spec.ts`
- Create: `apps/ssi-portal/src/app/alert.model.ts`
- Modify: `apps/ssi-portal/src/app/operational-issue.component.ts`
- Modify: `apps/ssi-portal/src/app/app.component.html`
- Modify: `apps/ssi-portal/src/styles.css`
- Modify: `apps/ssi-portal/src/app/swift-data-crud.component.css`

1. Define one typed severity/view model and inline/banner/blocking variants.
2. Use icon plus text, appropriate live-region roles, large readable hierarchy, and 44px actions.
3. Replace the root notice and operational issue visuals without changing domain logic.
4. Remove duplicated severity colors and define all light/dark values as CSS tokens.

### Task 8: Browser UAT and quality gates

**Files:**
- Create: `scripts/e2e-settings-demo-reload.mjs`
- Modify: `package.json`
- Update generated evidence only under the established QA report path.

1. Run lint, typecheck, and all unit tests after each code group.
2. Run browser UAT for Theme, Development OFF, wrong password, successful reload, snapshot identity, and post-reload SSI use.
3. Rerun all existing QA and UAT suites against the canonical data.
4. Run SonarQube and require zero Critical/Blocker/Major/Bugs/Vulnerabilities and greater than 95% New Code Coverage.
5. Do not claim completion while any gate fails; record any external dependency/audit issue separately.

## Execution note

The worktree already contains user-approved v15.3 data-quality and retry-policy changes. Implementation will remain in this working tree and will not commit or discard unrelated changes.
