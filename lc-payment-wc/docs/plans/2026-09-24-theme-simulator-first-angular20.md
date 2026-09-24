# Theme, Simulator-First, Angular 20, and OpenSpec Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a System-default theme system, make Simulator first/default, align safely with lc-balance-wc on Angular 20, establish Payment OpenSpec governance, and remove only proven dead code.

**Architecture:** A root-scoped signal-based ThemeService resolves persisted preference and OS color scheme, while semantic CSS tokens drive the lazy-loaded shell and custom elements. The Angular dependency set is upgraded together and accepted only through full regression/build/Sonar evidence; OpenSpec mirrors the lc-balance-wc spec-driven lifecycle.

**Tech Stack:** Angular 20, TypeScript 5.8, RxJS 7.8, Formly, Jest, SCSS, OpenSpec, SonarQube.

---

### Task 1: Characterize shell behavior

**Files:** create `src/app/core/theme/theme.service.spec.ts`; create `src/app/features/lc-payment/lc-payment.component.spec.ts`.

1. Write failing tests for System default, storage, OS changes, navigation order, and Simulator default.
2. Run the two specs and confirm they fail for the missing behavior.

### Task 2: Upgrade Angular toolchain

**Files:** modify `package.json`, `package-lock.json`, and official migration outputs only.

1. Run official `ng update` for the latest Angular 17 patch and validate.
2. Upgrade 17 → 18 with official core/CLI migrations; align TypeScript, zone.js, Formly, and Jest only when required; validate.
3. Repeat the same migrate-and-gate cycle for 18 → 19 and 19 → 20, then stop at the lc-balance-wc major baseline.
4. Do not advance to the next major until TypeScript, the full UI suite, and production build pass at the current major.
5. Review all migration output without changing observable payment business behavior.

### Task 3: Implement theme and navigation

**Files:** create `src/app/core/theme/theme.service.ts`; modify app shell/feature TS, HTML, SCSS, and global styles.

1. Implement preference/effective-theme signals and safe storage/media-query handling.
2. Add an accessible segmented theme selector.
3. Reorder navigation and set Simulator as default.
4. Convert hard-coded shell colors to semantic tokens and validate both themes.
5. Run tests, type check, and build.

### Task 4: Dead-code audit

**Files:** only proven unused production files/symbols.

1. Run reference searches and compiler/static checks.
2. Protect custom-element side effects, public contracts, tests, compatibility, and evidence code.
3. Remove safe candidates and rerun complete validation.

### Task 5: Acceptance

1. Run 3 test suites with coverage, Angular/Web Component/microservice builds, and TypeScript checks.
2. Validate OpenSpec structure/strict mode when CLI is available.
3. Run local SonarQube and require Quality Gate `OK`.
4. Record evidence and unresolved risks in OpenSpec tasks/review.
