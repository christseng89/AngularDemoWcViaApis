## 1. Specifications and Characterization

- [x] 1.1 Create OpenSpec config, current capability specs, proposal, design, tasks, delta spec, and BA review.
- [x] 1.2 Add failing shell tests for System default, persistence, OS changes, invalid storage, Simulator-first order, and Simulator-default state.

## 2. Sequential Angular Migration

- [x] 2.1 Update Angular 17 to its latest patch with official `ng update`; pass TypeScript, full Jest, and production build.
- [x] 2.2 Update Angular core/CLI/build to 18 with official migrations; align TypeScript, zone.js, Formly, and Jest only as required; pass all gates.
- [x] 2.3 Repeat the official migration and full gates for Angular 19.
- [x] 2.4 Repeat the official migration and full gates for Angular 20.
- [x] 2.5 Review every migration output; preserve standalone lazy routing, Reactive Forms behavior, and Web Component registration; stop at Angular 20 to match lc-balance-wc.

## 3. Theme and Navigation

- [x] 3.1 Implement the signal-based ThemeService and storage/system adapters.
- [x] 3.2 Add the accessible System/Light/Dark selector and make Simulator first/default.
- [x] 3.3 Replace shell/global hard-coded colors with semantic tokens and ensure custom components inherit both themes.
- [x] 3.4 Verify contrast, keyboard focus, reduced motion, and live system-theme switching.

## 4. Dead-code Review

- [x] 4.1 Search production, tests, build scripts, custom-element registrations, and docs for unused symbols/files.
- [x] 4.2 Remove only proven-dead code and record retained false positives with reasons.

## 5. Acceptance

- [x] 5.1 Pass all UI, backend, and microservice tests and coverage thresholds.
- [x] 5.2 Pass Angular/microservice builds, TypeScript checks, and OpenSpec structural/strict validation.
- [x] 5.3 Pass the local SonarQube Quality Gate with no new high/medium/security issues.
- [x] 5.4 Record final evidence and leave formal human BA sign-off as an explicit governance action if required.
