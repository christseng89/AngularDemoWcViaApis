# CS Enterprise Design System CSS Standard

**Version:** 0.1.0-proposal  
**Date:** 2026-09-18  
**Owner:** Senior UI/UX Design System Engineer (Angular) / CS Design System Owner  
**Companion stylesheet:** `qa/uiux/cs-enterprise-design-system.css`  
**Status:** Design-system reference; not wired into Angular

## 1. Purpose and scope

This standard defines the visual foundation and composable CSS class contracts for the CS Enterprise Operations application.

It covers:

- RMA;
- SSI;
- Entity;
- Nostro;
- CPI / Customer Payment Instructions;
- Reference Data;
- shared application shell, navigation, page patterns, forms, tables, dialogs and feedback states.

The standard is based on:

- the live Development Demo UI audit performed on 2026-09-18;
- `APP_UI_UX_Design_System統一要求.md`;
- `2026-09-18-application-ui-ux-update-design-proposal.md`;
- the latest **CS Enterprise Operations Design System** mockup supplied by the user;
- existing Angular 22 and Formly 7 conventions in `apps/ssi-portal`.

This stylesheet is intentionally not imported by `apps/ssi-portal/src/styles.css`. It is a reviewable target contract for later controlled migration. It does not change Angular behavior, business rules, APIs or database state.

## 2. Design direction

The target is a compact, confident enterprise operations workspace.

The supplied mockup establishes the intended direction:

- a dark teal reference theme with restrained cyan and lime accents;
- a compact horizontal desktop application bar;
- clear resource navigation for RMA, SSI, Entity, Nostro, CPI and Reference Data;
- sans-serif typography throughout the operational interface;
- strong page, status, filter and action hierarchy;
- dense but readable data tables;
- explicit read-only detail and message-type inquiry patterns;
- mobile header plus bottom navigation;
- shared index and detail patterns rather than page-specific styling.

The design evolves the current application rather than replacing its identity. Existing teal surfaces, lime primary emphasis, semantic helper text, governed Currency presentation and common CRUD shell are retained in a more systematic form.

## 3. Existing source compatibility

The existing portal uses:

- global `apps/ssi-portal/src/styles.css`;
- Angular component-scoped CSS;
- `html[data-theme="dark"]`;
- legacy custom properties such as `--ink`, `--paper`, `--line`, `--mint`, `--soft` and `--accent`;
- repeated local rules for fields, tables, buttons, dialogs and responsive layouts.

The proposed system reuses compatible conventions:

- it recognizes the current `:root[data-theme="dark"]` selector;
- it remains plain CSS and requires no new runtime dependency;
- it is compatible with Angular view templates and Formly wrappers;
- it uses modern capabilities already present in the current CSS, including `color-mix()`, `dvh`, logical properties and `:focus-visible`;
- it preserves compact enterprise density.

The proposal does not redefine legacy variables. Migration should deliberately move a component from legacy variables to `--cs-*` tokens so that incomplete coverage is visible during review.

## 4. File layering and naming

### 4.1 Recommended future layering

When the proposal is approved, split the reference stylesheet into this order:

1. `cs-tokens.primitives.css`
2. `cs-tokens.semantic.css`
3. `cs-theme-light.css`
4. `cs-theme-dark.css`
5. `cs-foundation.css`
6. `cs-layout.css`
7. `cs-components.css`
8. `cs-patterns.css`
9. `cs-responsive.css`
10. `cs-accessibility.css`
11. `cs-print.css`

During proposal review, `cs-enterprise-design-system.css` keeps these layers in one file with numbered section comments. This makes the contract easy to inspect without yet changing the application build.

### 4.2 Namespace rules

- Public custom properties begin with `--cs-`.
- Public component classes begin with `.cs-`.
- Elements use BEM-like names: `.cs-card__header`.
- Visual variants use modifiers: `.cs-button--primary`.
- transient UI state uses `is-*`: `.is-active`, `.is-invalid`.
- durable state should prefer native or ARIA attributes: `[aria-current="page"]`, `[aria-selected="true"]`, `[aria-invalid="true"]`.
- theme is selected with `data-cs-theme="light|dark|system"`.
- density is selected with `data-cs-density="compact|comfortable"`.

Do not encode a business domain or business rule into a generic class name. For example, use `.cs-badge--active`, not `.rma-active-green`.

## 5. Token architecture

### 5.1 Primitive tokens

Primitive tokens are implementation values and should not be consumed directly by page components unless no semantic meaning exists.

| Group        | Examples                                      | Purpose                                        |
| ------------ | --------------------------------------------- | ---------------------------------------------- |
| Typography   | `--cs-font-family-sans`, `--cs-font-size-md`  | Type families, sizes, weights and line heights |
| Spacing      | `--cs-space-1` through `--cs-space-16`        | Consistent component and layout rhythm         |
| Shape        | `--cs-radius-sm`, `--cs-radius-lg`            | Borders and corner shape                       |
| Control size | `--cs-control-height-sm/md/lg`                | Density and touch target foundation            |
| Motion       | `--cs-duration-fast`, `--cs-ease-standard`    | Predictable transitions                        |
| Layer        | `--cs-z-nav`, `--cs-z-dialog`                 | Systemic stacking contexts                     |
| Palette      | `--cs-palette-slate-*`, `--cs-palette-lime-*` | Raw color values used by semantic themes       |

### 5.2 Semantic color tokens

Page and component CSS should consume semantic roles.

| Role                         | Token                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------- |
| App canvas                   | `--cs-color-bg-canvas`                                                          |
| Navigation                   | `--cs-color-bg-navigation`                                                      |
| Default surface              | `--cs-color-surface-default`                                                    |
| Raised surface               | `--cs-color-surface-raised`                                                     |
| Sunken/input surface         | `--cs-color-surface-sunken`                                                     |
| Selected surface             | `--cs-color-surface-selected`                                                   |
| Primary/secondary/muted text | `--cs-color-text-primary`, `--cs-color-text-secondary`, `--cs-color-text-muted` |
| Subtle/default/strong border | `--cs-color-border-subtle/default/strong`                                       |
| Primary action               | `--cs-color-action-primary`                                                     |
| Secondary action             | `--cs-color-action-secondary`                                                   |
| Focus                        | `--cs-color-focus-ring`                                                         |
| Feedback                     | `--cs-color-info/success/warning/danger`                                        |
| Record status                | `--cs-color-status-*`                                                           |
| Message direction            | `--cs-color-direction-inbound/outbound`                                         |

### 5.3 Component aliases

Component aliases enable density without changing component selectors:

```css
--cs-button-height: var(--cs-control-height-md);
--cs-field-height: var(--cs-control-height-md);
--cs-table-row-height: 2.75rem;
--cs-table-cell-padding-block: var(--cs-space-3);
```

Components consume aliases, while density containers replace alias values.

### 5.4 Token usage rule

```css
/* Do */
.feature-panel {
  color: var(--cs-color-text-primary);
  background: var(--cs-color-surface-default);
  border: 1px solid var(--cs-color-border-subtle);
}

/* Do not */
.rma-panel {
  color: #edf4f2;
  background: #162629;
  border: 1px solid #34494c;
}
```

## 6. Theme usage

### 6.1 Explicit light theme

```html
<html data-cs-theme="light"></html>
```

Light values are defined on `:root`; the attribute documents intent and is recommended for application state.

### 6.2 Explicit dark theme

```html
<html data-cs-theme="dark"></html>
```

For compatibility during migration, the stylesheet also recognizes:

```html
<html data-theme="dark"></html>
```

Dark is the reference theme and the source of the visual direction in the supplied mockup.

### 6.3 System theme

```html
<html data-cs-theme="system"></html>
```

The stylesheet uses `prefers-color-scheme: dark` when the system choice is dark. Angular remains responsible for persisting the user’s choice and setting the root attribute.

### 6.4 Theme rules

- Components may not branch on theme names.
- Components may consume only semantic tokens.
- New component tokens must have light, dark and system behavior.
- A state must not be communicated only by color.
- Avoid page-specific dark mode overrides.

## 7. Core class contracts

The examples show required class structure and semantic HTML. They do not include Angular syntax so the contracts remain portable.

### 7.1 Application shell and navigation

```html
<div class="cs-app cs-shell" data-cs-theme="dark">
  <a class="cs-skip-link" href="#main-content">Skip to content</a>

  <header class="cs-topbar">
    <a class="cs-brand" href="/">
      <span class="cs-brand__mark" aria-hidden="true">CS</span>
      <span class="cs-sr-only">CS Enterprise Operations</span>
    </a>

    <nav class="cs-primary-nav" aria-label="Primary navigation">
      <a class="cs-primary-nav__item" aria-current="page" href="/rma">RMA</a>
      <a class="cs-primary-nav__item" href="/ssi">SSI</a>
      <a class="cs-primary-nav__item" href="/entity">Entity</a>
      <a class="cs-primary-nav__item" href="/nostro">Nostro</a>
      <a class="cs-primary-nav__item" href="/cpi">CPI</a>
      <a class="cs-primary-nav__item" href="/reference">Reference</a>
    </nav>
  </header>

  <main id="main-content" class="cs-main" tabindex="-1"></main>
</div>
```

The mobile pattern uses `.cs-mobile-nav`. Angular should ensure the same destination is not duplicated in the tab order when one navigation is visually hidden.

### 7.2 Page header

```html
<header class="cs-page-header">
  <div>
    <p class="cs-page-header__eyebrow">RMA master data</p>
    <h1 class="cs-page-header__title">RMA Authorisations</h1>
    <p class="cs-page-header__description">
      Manage communication authorisations. RMA does not prove SSI or account
      ownership.
    </p>
  </div>

  <div class="cs-page-header__actions cs-action-bar">
    <button class="cs-button cs-button--primary" type="button">New RMA</button>
  </div>
</header>
```

### 7.3 Buttons and action bar

```html
<div class="cs-action-bar" aria-label="Page actions">
  <div class="cs-action-bar__utilities">
    <button class="cs-button" type="button">Export</button>
  </div>
  <button
    class="cs-button cs-button--primary cs-action-bar__primary"
    type="button"
  >
    New SSI
  </button>
</div>
```

Use native `button` or `a` elements. Never style a `div` or `label` as a button. A hidden file input must have a real labelled control that remains keyboard operable.

### 7.4 Tabs

```html
<div class="cs-tabs" role="tablist" aria-label="RMA categories">
  <button
    class="cs-tab"
    role="tab"
    aria-selected="true"
    aria-controls="panel-all"
  >
    All
  </button>
  <button
    class="cs-tab"
    role="tab"
    aria-selected="false"
    aria-controls="panel-security"
  >
    Security
  </button>
  <button
    class="cs-tab"
    role="tab"
    aria-selected="false"
    aria-controls="panel-trade"
  >
    Trade Finance
  </button>
  <button
    class="cs-tab"
    role="tab"
    aria-selected="false"
    aria-controls="panel-payment"
  >
    Payment
  </button>
</div>
```

Angular owns roving `tabindex`, arrow-key behavior and panel visibility.

### 7.5 Filter and search pattern

```html
<form class="cs-filter-bar" role="search">
  <label class="cs-filter-group">
    <span class="cs-filter-group__label">Search RMA Authorisations</span>
    <span class="cs-search">
      <span class="cs-search__icon" aria-hidden="true"></span>
      <input class="cs-field__control" type="search" name="query" />
    </span>
  </label>

  <label class="cs-filter-group">
    <span class="cs-filter-group__label">Status</span>
    <select class="cs-field__control cs-select" name="status">
      <option>All</option>
      <option>Active</option>
      <option>Draft</option>
    </select>
  </label>

  <button class="cs-button cs-filter-bar__actions" type="reset">Reset</button>
</form>
```

Search input and filters require accessible labels even when visual placeholders are present.

### 7.6 Data table and state

```html
<section class="cs-data-region" aria-labelledby="rma-table-title">
  <div class="cs-table-scroll" tabindex="0" aria-label="Scrollable RMA table">
    <table class="cs-table">
      <caption id="rma-table-title" class="cs-table__caption cs-sr-only">
        RMA Authorisation records
      </caption>
      <thead class="cs-table__head">
        <tr>
          <th
            class="cs-table__header cs-table__header--sticky-start"
            scope="col"
          >
            <button class="cs-table__sort" type="button" aria-sort="ascending">
              RMA ID
            </button>
          </th>
          <th class="cs-table__header" scope="col">Counterparty</th>
          <th class="cs-table__header" scope="col">Status</th>
          <th
            class="cs-table__header cs-table__header--actions cs-table__header--sticky-end"
            scope="col"
          >
            Actions
          </th>
        </tr>
      </thead>
      <tbody>
        <tr class="cs-table__row">
          <th class="cs-table__cell cs-table__cell--sticky-start" scope="row">
            RMA-000245
          </th>
          <td class="cs-table__cell">ABC BANK</td>
          <td class="cs-table__cell">
            <span class="cs-badge cs-badge--active">Active</span>
          </td>
          <td
            class="cs-table__cell cs-table__cell--actions cs-table__cell--sticky-end"
          >
            <button class="cs-button cs-button--sm" type="button">View</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</section>
```

Loading, error, empty and populated results are mutually exclusive. Use `.cs-data-state` for loading, empty and error content, and do not render a “0 records” empty message while a request is pending.

```html
<div class="cs-data-state" role="status" aria-live="polite">
  <div class="cs-data-state__content">
    <span
      class="cs-skeleton"
      style="width: 14rem; height: 1rem"
      aria-hidden="true"
    ></span>
    <p>Loading RMA Authorisations…</p>
  </div>
</div>
```

Angular must remove or inert the table while this state is active.

### 7.7 Status badge

```html
<span class="cs-badge cs-badge--active">Active</span>
<span class="cs-badge cs-badge--draft">Draft</span>
<span class="cs-badge cs-badge--suppressed">Suppressed</span>
```

The text is mandatory. Do not rely on green, gray or red alone.

### 7.8 Detail panel and facts

```html
<section
  class="cs-detail-panel cs-detail-panel--read-only"
  aria-labelledby="detail-title"
>
  <header class="cs-detail-panel__header">
    <div>
      <p class="cs-eyebrow">RMA record · Read only</p>
      <h2 id="detail-title" class="cs-detail-panel__title">RMA-000245</h2>
    </div>
    <span class="cs-badge cs-badge--active">Active</span>
  </header>

  <div class="cs-detail-panel__body">
    <dl class="cs-fact-grid">
      <div class="cs-fact">
        <dt class="cs-fact__label">Counterparty</dt>
        <dd class="cs-fact__value">ABC BANK</dd>
      </div>
      <div class="cs-fact">
        <dt class="cs-fact__label">Direction</dt>
        <dd class="cs-fact__value">OUTBOUND</dd>
      </div>
    </dl>
  </div>
</section>
```

Read-only values should normally be text in a description list. Disabled inputs are not the default read-only presentation because they can be omitted or announced ambiguously by assistive technology.

### 7.9 Form field

```html
<div class="cs-field">
  <label class="cs-field__label" for="currency">
    Currency (ISO 4217)
    <span class="cs-field__required" aria-hidden="true">*</span>
  </label>
  <select
    id="currency"
    class="cs-field__control cs-select"
    aria-describedby="currency-help"
    required
  >
    <option value="SGD">SGD · 2 decimals</option>
    <option value="JPY">JPY · 0 decimals</option>
  </select>
  <p id="currency-help" class="cs-field__help">
    Provided by the Currency service; free input is not accepted.
  </p>
</div>
```

For an error, set `aria-invalid="true"`, reference the error from `aria-describedby`, and render `.cs-field__error`.

### 7.10 Dialog

```html
<div class="cs-dialog-backdrop">
  <section
    class="cs-dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="message-dialog-title"
    aria-describedby="message-dialog-description"
    tabindex="-1"
  >
    <header class="cs-dialog__header">
      <div>
        <p class="cs-eyebrow">RMA Authorisation</p>
        <h2 id="message-dialog-title" class="cs-dialog__title">
          Inquire RMA Message Types
        </h2>
      </div>
      <button
        class="cs-button cs-icon-button"
        type="button"
        aria-label="Close dialog"
      >
        ×
      </button>
    </header>

    <div class="cs-dialog__body">
      <p id="message-dialog-description">
        Authorised message types for this RMA.
      </p>
    </div>

    <footer class="cs-dialog__footer">
      <button class="cs-button" type="button">Close</button>
    </footer>
  </section>
</div>
```

CSS supplies backdrop, layer, size, focus ring and responsive full-screen presentation. CSS cannot:

- move initial focus into the dialog;
- trap focus;
- restore focus to the invoking control;
- mark background content inert;
- ensure only the topmost layer handles Escape;
- choose Close versus Cancel behavior.

Angular/HTML must implement those responsibilities, ideally through one shared dialog service/component.

### 7.11 Message type direction panels

```html
<div class="cs-direction-grid">
  <section
    class="cs-direction-panel cs-direction-panel--inbound"
    aria-labelledby="inbound-title"
  >
    <header class="cs-direction-panel__header">
      <h3 id="inbound-title" class="cs-direction-panel__title">Inbound</h3>
      <span>Messages received</span>
    </header>
    <ul class="cs-direction-panel__list">
      <li class="cs-message-type">
        <span>
          <span class="cs-message-type__code">MT103</span>
          <span class="cs-message-type__description"
            >Single Customer Credit Transfer</span
          >
        </span>
        <input
          class="cs-check__input"
          type="checkbox"
          aria-label="MT103 inbound"
        />
      </li>
    </ul>
  </section>

  <section
    class="cs-direction-panel cs-direction-panel--outbound"
    aria-labelledby="outbound-title"
  >
    <header class="cs-direction-panel__header">
      <h3 id="outbound-title" class="cs-direction-panel__title">Outbound</h3>
      <span>Messages sent</span>
    </header>
  </section>
</div>
```

This visual pattern does not determine which messages are allowed. Angular receives the approved RMA matrix and renders only the governed options.

### 7.12 Alerts and toasts

```html
<div class="cs-alert cs-alert--warning" role="alert">
  <span aria-hidden="true"></span>
  <div>
    <p class="cs-alert__title">Revision already in progress</p>
    <p class="cs-alert__body">
      Review the owner before starting another workflow action.
    </p>
  </div>
  <button
    class="cs-button cs-icon-button cs-button--ghost"
    type="button"
    aria-label="Dismiss"
  >
    ×
  </button>
</div>
```

Use `role="alert"` only for urgent messages. Routine success toasts should use a polite live region and must not steal focus.

## 8. Responsive and density patterns

### 8.1 Breakpoint intent

| Range         | Intent                                                                        |
| ------------- | ----------------------------------------------------------------------------- |
| Above 1024 px | Full desktop app bar, dense filters, table-first workflow                     |
| 769–1024 px   | Reduced utilities, wrapped filters, two-column facts                          |
| 481–768 px    | Mobile header and bottom navigation, single-column forms, full-screen dialogs |
| 320–480 px    | Single-column actions, full-width primary CTA, simplified pagination          |

Test at 320, 390, 768, 1024 and 1440 px. Breakpoints are design rules, not device identities.

### 8.2 Tables

Wide enterprise tables remain tables and scroll inside `.cs-table-scroll`. Use sticky identity and action cells selectively. Do not remove required columns from mobile without a documented alternative.

For a high-priority mobile workflow, a shared adaptive record-list component may be designed later. Do not create one-off RMA, SSI or Nostro mobile cards.

### 8.3 Action bars

At narrow widths:

- the primary action remains visible;
- utility actions move into a labelled overflow menu;
- destructive actions do not share the primary visual treatment;
- labels should not wrap into three or more lines.

### 8.4 Density

Default density is compact enterprise density.

```html
<section data-cs-density="compact">…</section>
<section data-cs-density="comfortable">…</section>
```

Density may change spacing and control/table size. It must not hide fields, actions or validation.

## 9. Accessibility responsibility matrix

| Concern        | CSS responsibility                         | Angular / HTML responsibility                                                               |
| -------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Visible focus  | Provide consistent `:focus-visible` ring   | Ensure control is focusable and focus order is logical                                      |
| Dialog         | Visual layer, backdrop, responsive sizing  | `role=dialog`, name, initial focus, trap, inert background, restore focus, Escape ownership |
| Tabs           | Selected visuals                           | Roles, ARIA state, roving tabindex, arrow keys, panel relationship                          |
| Forms          | Label/help/error layout and invalid visual | Native labels, required, `aria-describedby`, `aria-invalid`, error announcement             |
| Loading        | Skeleton/placeholder appearance            | Exclusive state model, `aria-live`, cancellation and request lifecycle                      |
| Status         | Distinct visual status tokens              | Visible text and canonical business status                                                  |
| Table          | Header/cell/sticky/scroll presentation     | Caption, scopes, sort state, row/action semantics                                           |
| Toast          | Position and visual severity               | Live region politeness, timing, dismiss control, no focus theft                             |
| Reduced motion | Disable animation and transitions          | Avoid JS motion when preference is reduced                                                  |
| Forced colors  | Preserve borders, selected state and focus | Native semantics that high-contrast mode can expose                                         |

The live audit found that the current RMA Message Type dialog did not take or restore focus and that a single Escape closed two layers. Those issues cannot be solved by this CSS file alone.

## 10. Migration guidance from current `styles.css`

Migration must be incremental and reversible.

### Step 1 — inventory and map

Map legacy variables to semantic intent without changing behavior:

| Legacy               | Likely target                                                           |
| -------------------- | ----------------------------------------------------------------------- |
| `--ink`              | `--cs-color-text-primary`                                               |
| `--paper`            | `--cs-color-surface-default`                                            |
| `--line`             | `--cs-color-border-subtle` or `default`                                 |
| `--muted`            | `--cs-color-text-muted`                                                 |
| `--mint`, `--accent` | action, focus or selection token according to meaning                   |
| `--soft`             | `--cs-color-surface-sunken`                                             |
| `--blue`             | `--cs-color-action-secondary` or information token according to meaning |

Do not perform a blind text replacement. The current `--mint` is used for primary actions, selection, focus and decorative accents; those meanings separate in the semantic model.

### Step 2 — add the new token layer

Add approved tokens before migrating components. Keep the current legacy theme active so non-migrated pages remain stable.

### Step 3 — migrate shared primitives

Recommended order:

1. focus and accessibility utilities;
2. buttons and Action Bar;
3. fields and Formly wrappers;
4. status badges;
5. tabs and filters;
6. Data View State, table and pagination;
7. dialog;
8. Page Header, Detail and Maintenance panels;
9. App Shell and navigation.

### Step 4 — RMA pilot

Apply shared classes to the RMA index, detail, revision and Message Type dialog. Verify Security and Trade Finance remain MT-only and Payment remains MT+MX according to the approved matrix.

### Step 5 — SSI pilot

Migrate SSI index/detail/edit, governed Currency and BIC fields, ownership tabs and maker-checker actions. Preserve SSI resolution and fallback behavior.

### Step 6 — Entity, Nostro, CPI and Reference Data

Adopt configuration-driven class contracts. Do not fork table, dialog or status styles.

### Step 7 — remove legacy rules

Remove a legacy rule only after:

- the replacement is wired;
- dark and light visual regression passes;
- responsive and accessibility behavior passes;
- business behavior is unchanged;
- no other page still depends on the rule.

## 11. Do and do not

### Buttons

```html
<!-- Do -->
<button class="cs-button cs-button--primary" type="button">New RMA</button>

<!-- Do not -->
<div class="green-button" tabindex="0">New RMA</div>
```

### Status

```html
<!-- Do -->
<span class="cs-badge cs-badge--active">Active</span>

<!-- Do not -->
<span class="green-dot" title="status"></span>
```

### Theme

```css
/* Do */
.component {
  background: var(--cs-color-surface-default);
}

/* Do not */
html[data-theme="dark"] .rma-component {
  background: #162629;
}
```

### Dialog

```html
<!-- Do -->
<section
  class="cs-dialog"
  role="dialog"
  aria-modal="true"
  aria-labelledby="dialog-title"
>
  <!-- Do not -->
  <div class="cs-dialog"></div>
</section>
```

### Data state

```html
<!-- Do: render one state -->
<div class="cs-data-state" role="status">Loading records…</div>

<!-- Do not: show empty data while loading -->
<div>Loading…</div>
<div>0 records · No matching records</div>
```

### Business boundaries

```text
Do: render approved status, permission, direction and message-scope data.
Do not: infer or transform RMA grouping, SSI resolution, routing or status transitions in CSS or UI configuration.
```

## 12. Intentional CSS exceptions

The reference stylesheet contains **zero `!important` declarations**.

If a future integration requires one, the author must document:

- the selector conflict;
- why cascade layers or specificity cannot solve it;
- the affected component;
- the planned removal version.

Component authors must not add `!important` merely to override legacy `styles.css`.

The print stylesheet contains literal neutral colors rather than semantic tokens. This is intentional: print output must remain legible and low-ink regardless of the active screen theme.

## 13. Business-rule boundary

This CSS standard governs presentation only. It does not authorize changes to:

- SSI or RMA resolution logic;
- RMA canonical grouping;
- INBOUND / OUTBOUND semantics;
- Payment routing;
- API business semantics;
- database schema;
- maker/checker segregation;
- status transitions;
- SWIFT MT/MX applicability;
- approved BA matrices;
- TDD expected outcomes.

CSS state classes such as `.cs-badge--active` style a business state supplied by the application. CSS must never calculate, infer or promote that state.

If a visual requirement appears to need a business-rule change, stop and mark it `BUSINESS_DECISION_REQUIRED`.

## 14. Validation checklist

### Tokens and themes

- [ ] Every public token begins with `--cs-`.
- [ ] Component rules use semantic tokens rather than palette values.
- [ ] Dark, light and system themes render the same semantic states.
- [ ] Text, focus and interactive states meet WCAG 2.2 AA contrast.

### Components

- [ ] Visible button-like controls use semantic native elements.
- [ ] Buttons include hover, active, focus and disabled states.
- [ ] Forms include labels, help and error relationships.
- [ ] Tables have caption, scopes, sort state and a keyboard-accessible scroll region where needed.
- [ ] Loading, error, empty and data states are mutually exclusive.
- [ ] Status is communicated by text, not color alone.

### Dialogs

- [ ] `role="dialog"` and `aria-modal="true"` are present.
- [ ] The title names the dialog.
- [ ] Initial focus moves inside.
- [ ] Focus is trapped and restored.
- [ ] Background content is inert.
- [ ] Escape closes only the topmost layer.
- [ ] Close and Cancel are used according to read-only versus editable mode.

### Responsive

- [ ] 320, 390, 768, 1024 and 1440 px are verified.
- [ ] No uncontrolled page-level horizontal overflow occurs.
- [ ] Wide data remains discoverable and operable.
- [ ] Primary actions remain visible.
- [ ] Utility actions move to an accessible overflow menu.
- [ ] Dialogs remain usable with safe-area insets.

### Accessibility preferences

- [ ] Keyboard-only operation passes.
- [ ] Screen-reader names and state pass.
- [ ] 200% zoom remains usable.
- [ ] Reduced motion removes non-essential animation.
- [ ] Forced-colors mode retains focus, borders, state and selection.

### Print

- [ ] Navigation, transient controls, dialogs and toasts do not print.
- [ ] tables fit or wrap without clipped sticky cells.
- [ ] status remains textual.

### Regression and safety

- [ ] Existing Angular tests pass.
- [ ] New shared-component tests pass.
- [ ] Visual regression passes in both themes.
- [ ] BA confirms no matrix or workflow behavior changed.
- [ ] QA confirms maker-checker, revision and status transitions are unchanged.

## 15. Versioning and governance

Use semantic versioning for the design-system contract:

- **Patch:** token value adjustment or visual correction with no class-contract change.
- **Minor:** new backward-compatible token, component or modifier.
- **Major:** removed/renamed token or class, changed markup contract, or incompatible visual behavior.

Every change requires:

1. CS Design System Owner review;
2. accessibility impact review;
3. dark and light evidence;
4. desktop, tablet and mobile evidence;
5. impacted component list;
6. migration note for breaking changes;
7. confirmation that business behavior is unchanged.

RMA, SSI, CPI and Reference Data teams may propose extensions, but one Design System Owner owns final semantic consistency. A domain-specific component is justified only when its interaction semantics are genuinely unique; different field names or columns are not sufficient.

## 16. Adoption approval recommendation

Approve `cs-enterprise-design-system.css` as a **proposal baseline** for visual and accessibility review.

Do not import it into Angular until:

- token names and dark/light values are reviewed;
- class contracts are reviewed against real templates;
- the shared dialog implementation plan includes focus trap, focus restoration, inert background and one-layer Escape behavior;
- the Action Bar plan makes Dry-run JSON and Import JSON semantic keyboard actions;
- RMA and SSI pilot acceptance cases are agreed by BA and QA.

After those gates, adopt the system incrementally. Do not replace `styles.css` in one change, and do not delete existing component styles before verified parity.
