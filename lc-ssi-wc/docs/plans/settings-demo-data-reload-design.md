# Settings and Development Data Reload Design

## Status

Accepted for implementation on 2026-09-12.

## Understanding summary

- Add **Settings** immediately below **Audit / 稽核與事件** in the primary navigation.
- Move the existing System / Light / Dark theme preference into Settings.
- Show a server-derived, read-only Development flag. `demo` and `development` are ON; every other, blank, or unknown value is OFF.
- When Development is ON, an operator may reload the canonical synthetic database after entering the control password.
- Reload means build a replacement database from the modified canonical seed, validate it completely, then atomically replace the active demo database and refresh application data.
- Default localhost, QA, and UAT must use the same canonical seed and report the seed and logical snapshot identities.
- Redesign error and warning presentation around one accessible severity system without changing existing business flows.

## Assumptions and constraints

- This is a single-node demo/QA facility with low concurrency, not a production data-administration feature.
- `SSI_RUNTIME_ENV` is authoritative; `NODE_ENV` is a deprecated fallback only. Reload is denied unless the resolved environment is exactly `demo` or `development`.
- The control password is supplied only through uncommitted `.env` as `SSI_DEMO_ADMIN_PASSWORD`. `.env.example` contains a documented sample value only; the application has no password default or fallback.
- The password is never stored client-side, logged, returned, or persisted in audit payloads.
- Reload uses only the configured canonical synthetic seed. The client cannot supply a filesystem path.
- Existing production-like SSI maintenance, resolution, checker, and audit flows are out of scope for behavioral redesign.

## Chosen approach

**Enterprise Control Desk**: an independent Settings page plus reusable alert primitives.

Alternative approaches considered:

1. A Settings drawer was rejected because password confirmation, destructive-impact copy, progress, and verification results need more space and hierarchy.
2. A full console rewrite was deferred because it would expand the regression surface across mature UAT flows and selectors.

## Architecture

### Presentation

- `SettingsPageComponent` owns the page composition only.
- `ThemeSelectorComponent` renders accessible System / Light / Dark radio controls.
- `EnvironmentStatusComponent` renders the server-derived environment and Development ON/OFF badge.
- `DemoDataReloadPanelComponent` explains impact and starts the flow.
- `ReloadConfirmationDialogComponent` is an `alertdialog`, accepts the password, prevents duplicate submission, and exposes clear idle/reloading/success/error states.
- `AlertComponent` is the shared info/success/warning/error primitive with inline, banner, and blocking variants.
- `OperationalIssueComponent` delegates its severity presentation to the shared alert model.

### Application services

- `ThemeService` owns local preference persistence, system preference observation, and document theme application.
- `RuntimeSettingsService` reads runtime capability from the BFF.
- `DemoDataReloadService` owns the typed reload API call.
- `DemoDataReloadFacade` owns state transitions and coordinates the post-reload application refresh.
- `AlertPresentationMapper` maps API/domain failures into one `AlertModel`; feature components do not duplicate status parsing or remediation copy.

### Backend

- A settings status endpoint returns the resolved runtime environment, development flag, reload availability, seed identity, current logical snapshot identity, and status policy version.
- A password-protected reload endpoint checks the runtime gate and password before doing filesystem work.
- It validates the canonical seed and active schema first, then reloads all seed tables inside one `BEGIN IMMEDIATE` transaction. Any import failure rolls back the complete operation; existing repository connections observe only the committed state. This avoids stale SQLite file handles during Windows file replacement.
- No client-supplied seed path, target path, SQL, or command is accepted.
- Repositories must release and reopen database connections around the atomic replacement so no process continues reading the old inode or an incomplete database.
- The audit record contains actor, timestamp, environment, seed SHA-256, previous/new logical snapshot SHA-256, imported row counts, and success/failure; never the password.

## API behavior

- Runtime OFF: `403 DEVELOPMENT_MODE_REQUIRED`.
- Missing server password configuration: `503 DEMO_RELOAD_NOT_CONFIGURED`.
- Missing/malformed request: `400 INVALID_RELOAD_REQUEST`.
- Wrong password: `401 INVALID_DEMO_CONTROL_PASSWORD` with no detail that assists guessing.
- Concurrent reload: `409 DEMO_RELOAD_IN_PROGRESS`.
- Seed or rebuilt-data validation failure: fail closed; keep the original database and return `500 DEMO_DATA_RELOAD_FAILED` with a safe remediation code.
- Success: `200 DEMO_DATA_RELOADED` with non-secret verification metadata.

The endpoint is never retried automatically. UI disables repeat submission while a request is active.

## Visual system

- Preserve the current deep-green control-room identity and mint accent, but use mint only for primary actions, active navigation, and focus.
- Add shared severity tokens for brick-red error, amber warning, blue information, and green success in light and dark themes.
- Blocking alerts use a 20px title, reason, impact, next action, a 44px minimum action target, and a severity icon plus text. Technical codes are secondary details.
- Only errors use assertive announcements; warnings and information use polite status announcements.
- Settings uses section dividers and deliberate whitespace. Only the destructive reload area receives an emphasized risk container.

## Testing and acceptance

- Unit tests cover environment resolution, password gating, missing configuration, concurrency, validation failure, rollback, and successful connection refresh.
- Angular tests cover theme persistence, runtime OFF state, dialog accessibility, wrong password, in-progress locking, success metadata, and safe failure messages.
- Browser UAT covers keyboard-only operation, light/dark contrast, development OFF denial, incorrect password, successful reload, and immediate use of the reloaded canonical data.
- Regression tests verify existing SSI flows and selectors remain intact.
- Reload tests use temporary databases and never overwrite a controlled fixture.
- New-code coverage target is greater than 95%. SonarQube must report zero Critical, Blocker, Major, Bugs, and Vulnerabilities; lint, type checks, unit tests, browser UAT, and the quality gate must pass before completion.

## Decision log

1. Settings is a navigation destination below Audit because reload is an infrequent administrative operation.
2. Development mode is server-authoritative and read-only in the UI to prevent a browser from enabling destructive capabilities.
3. Password configuration stays outside Git; the example value is documentation, never a default.
4. Database reload is a single exclusive transaction so a failed import cannot destroy the working dataset and existing SQLite connections remain valid on Windows.
5. Theme and alerts become shared services/components to satisfy SRP, DIP, reuse, and consistent behavior.
6. The visual refresh is incremental; a full application rewrite is deferred to protect proven UAT flows.
