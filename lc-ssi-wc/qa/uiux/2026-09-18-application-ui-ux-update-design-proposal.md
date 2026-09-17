# Application UI/UX Update Design Proposal

**Date:** 2026-09-18  
**Owner:** Senior UI/UX Design System Engineer (Angular) / CS Design System Owner  
**Status:** Design recommendation for BA, QA, Product and Engineering review  
**Scope:** SSI, RMA, Entity, Nostro, CPI / Customer Payment Instructions, Reference Data and shared application patterns

## 1. Executive recommendation

The application should evolve from its current dark enterprise prototype into a governed **CS Enterprise Operations Design System**, rather than be visually redesigned page by page.

The present product already has a strong and appropriate identity: deep teal surfaces, restrained cyan and lime accents, high information density, clear operational terminology, and visible reuse across RMA, Entity and Nostro. The recommendation is therefore **evolution, not replacement**. Preserve the visual character and business context while correcting interaction ambiguity, accessibility gaps, responsive friction and state inconsistencies.

The target experience is one in which an operator can immediately distinguish:

- navigation from a state-changing workflow action;
- read-only detail from maintenance mode;
- current records from drafts, suppressed records and history;
- communication authorization from settlement instruction and account ownership;
- loading, empty, error and completed states;
- primary actions from secondary utilities and destructive operations.

Professional approval recommendation: **conditionally approve the current direction as the visual foundation, but do not approve Round 8 for final UI/UX or WCAG acceptance yet.** BA and QA may continue controlled functional testing. Final design-system acceptance should remain blocked until the priority-one dialog, keyboard and stateful-action issues in this proposal are resolved and regression-tested.

## 2. Evidence base and review boundary

This proposal is based on a live UI review of `http://localhost:4600/` on 2026-09-18 and the governing requirements in `APP_UI_UX_Design_System統一要求.md`.

Representative surfaces reviewed:

- RMA Authorisation index, read-only detail, revision form and Message Type dialog;
- SSI Maintenance index and read-only detail;
- Entity index;
- Nostro Account index;
- Settings theme controls;
- desktop dark theme and a 390 × 844 responsive viewport;
- keyboard focus order and dialog keyboard behavior.

The review was design- and behavior-focused. It did not authorize changes to application source code, API behavior, business rules or database state. No Save, Submit, Suppress or Revoke action was performed.

## 3. Current-state findings

### 3.1 Strengths to preserve

1. **Recognizable enterprise visual language.** The dark teal canvas, layered surfaces, cyan section accent and lime selection/action accent create a distinctive operations-console identity without excessive decoration.
2. **Strong information hierarchy.** Page eyebrow, display heading, section heading, status, helper copy and dense table content are visually distinguishable.
3. **Existing shared CRUD structure.** RMA, Entity and Nostro visibly use the same resource tabs, toolbar, status filters, search, data table, pagination and maker-checker action columns.
4. **Schema-driven form direction.** RMA detail and revision reuse the same field order and Formly-style presentation; read-only state is visibly different from editable state.
5. **Useful business-context copy.** RMA explicitly states that authorization does not prove SSI or account ownership. SSI fields explain the source and meaning of governed data.
6. **Governed Currency presentation.** SSI detail shows values such as `SGD · 2 decimals` and `JPY · 0 decimals`, while the index uses compact ISO codes. Helper text states that Currency comes from the Currency service and is not free input.
7. **Business-scope visibility.** The RMA selector presents Security, Trade Finance and Payment as governed categories and places INBOUND and OUTBOUND side by side.
8. **Responsive foundation exists.** At 390 px, navigation becomes a two-column block, resource tabs stack, cards reflow and data tables remain available through horizontal scrolling.
9. **Theme architecture is visible to users.** Settings exposes System, Light and Dark choices and identifies the preference as browser-local.

### 3.2 Problems requiring design correction

#### Priority 1 — dialog focus, semantics and layered dismissal

Opening **Inquire RMA Message Types** left keyboard focus on the underlying `View` button. The accessibility tree exposed the overlay as a generic container rather than a dialog. Closing through the visible Cancel control returned focus to the page root instead of the invoking control. A single Escape key closed both the dialog and the underlying RMA detail, returning the user to the index.

This breaks the user’s mental model of layers and is a material WCAG and operational-efficiency defect. The topmost dialog must own focus and Escape. Only one layer may close per Escape action.

#### Priority 1 — import actions are not semantically or keyboard available

`Dry-run JSON` and `Import JSON` appear visually as buttons, but were exposed to accessibility as combined text. Keyboard traversal moved from `Export Excel` to `Export JSON` directly to `Add`, skipping both controls.

Visually button-like controls must be real semantic actions with stable accessible names, visible focus, keyboard activation and defined loading/disabled/error states.

#### Priority 1 — revision initiation is stateful but presented like navigation

Selecting `Revise` entered an edit form. Cancelling then produced: `操作完成 Revise 已取消；ACTIVE 紀錄已解除修訂註記。`

This indicates that entering revision mode participates in workflow state. The current label and transition under-communicate that consequence. The design should use explicit language such as **Start revision / 建立修訂**, explain reservation or ownership behavior before entry, show who holds the revision, and clearly confirm cancellation outcome. The underlying business behavior must not be changed without BA approval.

#### Priority 2 — loading and empty states compete

When returning to SWIFT Data Service, the UI briefly displayed `Loading RMA Authorisation…` while also showing `0 records` and “沒有符合目前 Status 與 Search 的資料.” The records subsequently loaded.

Loading, empty, error and populated data are mutually exclusive states. A shared data-view pattern must ensure users never interpret an in-flight request as an authoritative empty result.

#### Priority 2 — mobile action density and table discoverability

On a 390 px viewport, the action toolbar compressed into a narrow vertical stack and labels such as `Dry-run JSON` and `Import JSON` wrapped aggressively. Nostro’s wide table remained horizontally scrollable, but status and row actions were initially off-screen and discoverable only through the scrollbar.

The mobile design should preserve data completeness while improving action priority and orientation. The recommended shared approach is a compact primary action, an overflow menu for utilities, sticky identity and action columns where practical, and a visible horizontal-scroll cue. A page-specific mobile table must not be created.

#### Priority 3 — terminology and close/cancel semantics

The application mixes `Add`, `Add SSI`, icon-only close controls and accessible labels of `Cancel`. Read-only overlays should use **Close**; editable workflows should use **Cancel**, with unsaved-state handling when relevant. Resource creation actions should follow one content pattern, with the resource name included when it improves certainty.

## 4. Target experience and design direction

The target is a calm, high-confidence operations workspace optimized for correctness, scanning and controlled action.

### 4.1 Experience principles

- **Business state before decoration:** status, ownership, direction, version and effective period remain immediately visible.
- **One semantic, one pattern:** the same operation, status or data type uses the same component throughout the application.
- **Read, decide, act:** index pages support scanning; detail pages support verification; maintenance pages support controlled change.
- **Consequences are explicit:** state-changing actions identify outcome, workflow owner and reversal behavior.
- **Progressive density:** desktop retains dense tables; smaller viewports reorganize controls without omitting information.
- **Accessible by construction:** focus behavior, labels, errors, contrast and keyboard operation are component responsibilities.
- **Business boundaries remain visible:** RMA, SSI, Nostro and Entity concepts must not visually collapse into interchangeable records.

### 4.2 Visual direction

Retain the present dark enterprise aesthetic as the reference expression:

- deep teal application background;
- slightly lighter layered surfaces rather than pure black;
- cyan for structural accents and informational context;
- lime for primary action, selected state and focus, used sparingly;
- warm neutral primary text and cooler muted text;
- serif display typography only for major page and panel titles;
- sans-serif typography for body, form, table and action content;
- fine borders and restrained elevation instead of heavy shadows;
- compact but not cramped control density.

Light theme should be a semantic translation of the same visual language, not a second design system.

## 5. Semantic token and theme recommendation

Tokens should be layered as primitives, semantic roles and component aliases. Page-level colors and spacing should not be authored directly.

### 5.1 Color roles

Recommended semantic contract:

- `--cs-color-bg-canvas`
- `--cs-color-bg-navigation`
- `--cs-color-surface-default`
- `--cs-color-surface-raised`
- `--cs-color-surface-selected`
- `--cs-color-text-primary`
- `--cs-color-text-secondary`
- `--cs-color-text-muted`
- `--cs-color-text-inverse`
- `--cs-color-border-subtle`
- `--cs-color-border-strong`
- `--cs-color-action-primary`
- `--cs-color-action-primary-hover`
- `--cs-color-focus-ring`
- `--cs-color-info`
- `--cs-color-success`
- `--cs-color-warning`
- `--cs-color-danger`
- `--cs-color-status-draft`
- `--cs-color-status-active`
- `--cs-color-status-suppressed`
- `--cs-color-status-revoked`
- `--cs-color-status-superseded`

Status colors must never be the only carrier of meaning. Each status remains textual and may include an icon when needed.

### 5.2 Non-color foundations

Define and govern:

- typography roles: display, page title, section title, body, label, caption, code/data;
- spacing scale and layout gutters;
- border widths, radii and elevation levels;
- control heights and table density modes;
- icon sizes and stroke weights;
- focus-ring width and offset;
- motion durations and reduced-motion behavior;
- overlay z-index and layering rules;
- desktop, tablet and mobile layout thresholds.

### 5.3 Theme acceptance

Dark and light themes must use the same semantic contract. Required state pairs include default, hover, active, selected, focus, disabled, read-only, loading, validation error, warning, success and information. Contrast must meet WCAG 2.2 AA for applicable text and controls in both themes.

## 6. Shared component recommendations

### 6.1 Preserve and formalize

- App Shell and primary navigation
- Page Header and contextual eyebrow
- Resource Tabs
- Status Filter / segmented radio group
- Search Filter Bar
- Data Table and Pagination
- Status Badge
- Formly field layout and helper text
- BIC and Currency governed fields
- Approval Comparison
- Toast / inline message
- Maker-checker action model

### 6.2 Consolidate or introduce

- **CS Action Bar:** primary action, secondary actions, import/export utilities and mobile overflow behavior.
- **CS Data View State:** mutually exclusive loading, error, empty and data states.
- **CS Data Table:** sorting, internal overflow, sticky identity/action columns, accessible caption, responsive configuration and consistent row/action hit areas.
- **CS Detail Panel:** read-only heading, status, version, request type and Close semantics.
- **CS Maintenance Panel:** mode title, validation summary, Save Draft / Cancel action bar and unsaved-state handling.
- **CS Dialog:** semantic dialog role, labelled title, initial focus, focus trap, return focus, top-layer Escape consumption and mobile full-screen mode.
- **CS Message Type Selector:** category tabs, INBOUND/OUTBOUND panels, search, selection counts and view/edit variants.
- **CS Currency Display / Select:** compact ISO display for tables and enriched code/precision display for detail/forms, both driven by the same data source.
- **CS Confirmation / Warning:** consequence-focused text for stateful, destructive or irreversible workflow actions.
- **CS Audit History:** version, maker/checker, timestamps and transition history in a consistent pattern.

Configuration should express resource-specific columns, fields, labels, permissions and allowed actions. It must not fork the visual implementation.

## 7. Page pattern recommendations

### Index pattern

Page header → optional operational metrics → resource/context tabs → action bar → status filters → search/filter → data table → pagination.

Row click opens read-only detail. Inline row actions must not trigger row navigation. Loading, error, empty and results are exclusive.

### Detail pattern

Read-only context label → resource identity and version → request/status badges → Close → schema-aligned field groups → comparison/history panels.

Read-only controls should not misleadingly appear editable. Use semantic read-only presentation where possible; disabled form controls are appropriate only when their disabled meaning is intentional and accessible.

### Maintenance pattern

Explicit mode (`Create draft`, `Edit draft`, `Start revision`) → workflow owner/context → field groups → validation summary and field errors → sticky Save Draft / Cancel action bar.

State changes that occur on entry must be explained before or at the transition.

### Lookup and inquiry pattern

Search/filter → governed result list → selection or inquiry-only state → clear source attribution. Lookup content must not imply authority beyond its source service.

### Dialog pattern

Dialog title and context → local navigation/search → content → actions. Focus begins inside the dialog, remains trapped, and returns to the invoking control. Escape closes only the topmost layer. On narrow screens, complex two-column selectors may become a full-screen dialog while preserving INBOUND/OUTBOUND semantics.

## 8. Domain application scope

### RMA

RMA is the first design-system pilot because it exercises direction, governed message categories, comparisons, dialogs and maker-checker controls.

Preserve exactly:

- Counterparty and own BIC context;
- Security, Trade Finance and Payment grouping;
- INBOUND and OUTBOUND meaning;
- Security and Trade Finance MT scope;
- Payment MT and MX scope;
- the statement that RMA does not prove SSI or account ownership.

The sampled Payment panel correctly presented MT103, MT202, MT202COV, MT205 and MT205COV together with `pacs.008.001.08` and `pacs.009.001.08`. Trade Finance presented MT-only entries such as MT730, MT754, MT756 and MT765. This behavior is a preservation baseline, not a proposal to change the matrix.

### SSI

SSI is the second pilot because it exercises ownership, Currency, BIC, Nostro reference, effective period and maker-checker states.

Preserve Own SSI / Counterparty SSI distinction, resolution semantics, fallback priority and the rule that transaction-provided data must not be stored or inferred as SSI data. Standardize Currency and BIC presentation through shared governed components.

### Entity and Nostro

Entity and Nostro should adopt the same resource-shell pattern after RMA and SSI validate it. Entity remains legal/booking organizational data. Nostro remains account-servicer and settlement-account data, including masked account references, purpose, priority and Currency. RMA must not be used as evidence of account ownership.

### CPI and Reference Data

CPI / Customer Payment Instructions and Reference Data should use the established index, detail, maintenance, lookup, dialog, table, status and theme patterns. They may define domain-specific fields and permissions, but must not create alternate visual components for the same semantics.

## 9. Accessibility and responsive recommendation

### Accessibility

Required acceptance behaviors:

- every visible action is reachable and operable by keyboard;
- visible focus meets contrast and thickness requirements;
- dialogs have correct role, name, modal semantics, initial focus, focus trap and focus restoration;
- one Escape dismisses one layer;
- tabs, radio groups, checkboxes, tables and pagination expose correct roles and names;
- form labels, required state, helper text and errors are programmatically associated;
- validation summaries identify and link to invalid fields;
- status and change comparisons are understandable without color;
- disabled and read-only states have intentional, documented semantics;
- notifications are announced without unexpectedly moving focus;
- zoom at 200% and reduced motion remain usable.

### Responsive

Validate at minimum 320, 390, 768, 1024 and 1440 px.

- App navigation may reflow but should not dominate the first mobile viewport.
- Action Bar should keep the primary action visible and move lower-priority utilities into a labelled overflow menu.
- Data tables may scroll internally; the page itself must not develop uncontrolled horizontal overflow.
- Identity and high-risk action context should remain discoverable through sticky columns, row detail or a shared adaptive representation.
- Form fields become one column at narrow widths, with helper and error text directly adjacent.
- Complex dialogs become full-screen when necessary, with stable Close/Cancel placement.

## 10. Staged adoption recommendation

This is a design adoption sequence, not authorization to refactor business behavior.

1. **Baseline and decision record:** capture current screenshots and behavior; inventory semantic duplicates; approve terminology, state model and business boundaries.
2. **Foundations:** approve semantic tokens, dark/light theme mapping, typography, spacing, focus and responsive rules.
3. **Critical interaction patterns:** approve Action Bar, Data View State, Dialog, Data Table, Detail and Maintenance patterns; fix the priority-one defects.
4. **RMA pilot:** validate index, detail, revision and Message Type selector against the approved business matrix.
5. **SSI pilot:** validate ownership, Currency/BIC/Nostro fields, status and maker-checker flows.
6. **Entity and Nostro adoption:** configure the proven shared shell and patterns.
7. **CPI and Reference Data adoption:** expand only after pilot metrics and behavior parity are accepted.
8. **Application consistency review:** remove obsolete local styling only after replacement parity is demonstrated.

## 11. BA and QA gates

### Gate A — current controlled testing

BA and QA may proceed with read-only navigation, content verification, search/filter, sorting, pagination, Currency presentation and non-destructive responsive checks. Current priority defects must be listed as known limitations.

### Gate B — workflow testing

Maker-checker, revision, submit, suppress and revoke scenarios require isolated or resettable test data. Tests must explicitly verify whether starting and cancelling a revision creates, reserves or removes workflow state.

### Gate C — design-system and WCAG acceptance

Blocked until:

- dialog semantics and focus lifecycle pass;
- Escape closes only the topmost layer;
- Dry-run JSON and Import JSON are semantic and keyboard operable;
- loading and empty states no longer appear together;
- responsive action and table patterns are approved.

### Gate D — release recommendation

Requires BA business-matrix approval, QA regression pass, automated accessibility checks plus manual keyboard/screen-reader review, visual regression in both themes, and representative desktop/tablet/mobile sign-off for RMA, SSI, Entity and Nostro.

## 12. Acceptance metrics

- 100% of visible actions on migrated pages are keyboard reachable and semantically named.
- 100% of modal dialogs pass initial focus, trap, return-focus and single-layer Escape tests.
- 100% of migrated semantic colors and spacing use approved tokens; no new page-specific hard-coded colors.
- 100% of migrated RMA/SSI pages use shared button, status, filter, table, form and dialog patterns.
- Zero simultaneous loading-and-empty or loading-and-error presentations.
- Zero business-matrix differences introduced by UI adoption.
- WCAG 2.2 AA contrast for applicable text, icons, focus and interactive-state boundaries in dark and light themes.
- No uncontrolled page-level horizontal overflow at approved viewport sizes.
- Shared-component and design-token coverage increases release over release; documented exceptions have an owner and retirement date.
- Build, lint, unit, integration, end-to-end, visual regression and accessibility suites pass for migrated scope.

## 13. Risks and business-rule boundaries

### Design and adoption risks

- replacing disabled fields with read-only presentation may change screen-reader behavior;
- row click and inline action events may conflict;
- mobile overflow can hide high-risk actions or their context;
- focus trapping can fail when dialogs are nested;
- token substitution can reduce contrast even when colors look similar;
- removing local styles before parity can cause silent regressions;
- a generic CRUD shell can incorrectly flatten genuine workflow differences;
- mixed Chinese/English terminology can become inconsistent without a content standard.

### Non-negotiable boundaries

This proposal does not authorize changes to:

- SSI or RMA resolution logic;
- RMA canonical grouping;
- INBOUND / OUTBOUND semantics;
- Payment routing;
- API business semantics;
- database schema;
- maker/checker segregation;
- status transitions;
- SWIFT MT/MX applicability;
- approved BA matrices or TDD expected outcomes.

If a visual or interaction recommendation requires any such change, mark it **`BUSINESS_DECISION_REQUIRED`** and stop that portion until approval is recorded.

## 14. Professional approval statement

As CS Design System Owner, I recommend adopting this proposal as the design direction for the next UI/UX update.

I approve the current dark enterprise style, shared CRUD direction, governed form presentation and visible business-context guidance as the foundation to preserve. I do not recommend a wholesale visual redesign.

I do **not** approve the current build for final UI/UX consistency or accessibility acceptance because the observed dialog focus lifecycle, Escape propagation, inaccessible import actions and stateful revision affordance create material usability and operational risks.

BA and QA may continue controlled testing under the gates above. Final approval should be granted only after priority-one issues are resolved, business behavior is proven unchanged, RMA and SSI pilots pass, and the representative application-wide consistency review is complete.
