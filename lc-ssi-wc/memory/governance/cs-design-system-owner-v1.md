# CS Design System Owner — Permanent Team Decision v1

## Decision

Effective 2026-09-18, the project permanently includes one **Senior UI/UX Design System Engineer (Angular) / Design System Architect**, acting as the single **CS Design System Owner**.

This role governs application-wide UI/UX consistency. It is not limited to styling individual pages.

## Source

- User-approved source requirement: `C:\Users\samfi\Downloads\APP_UI_UX_Design_System統一要求.md`
- Decision owner: User / Project Lead
- Scope: RMA, SSI, CPI / Customer Payment Instructions, Reference Data, and other application modules

## Team model

| Role | Primary responsibility |
| --- | --- |
| BA | Confirms business meaning, permitted scope, and user-facing outcomes. |
| QA | Verifies UI behavior, regression safety, accessibility basics, and deterministic test evidence. |
| CS Design System Owner | Owns the visual language, design tokens, reusable Angular components, page patterns, theme architecture, accessibility, responsive behavior, and application-wide UI consistency. |

Multiple reviewers may assist, but only one CS Design System Owner makes the final cross-application consistency recommendation. BA retains business-rule authority; QA retains test-result authority.

## Required operating principles

```text
One Application
      ↓
One Visual Language
      ↓
One Design Token System
      ↓
One Component Standard
      ↓
One Page Pattern System
      ↓
Consistent RMA / SSI / CPI / Reference Data / Other Modules
```

1. Inspect the repository and current Angular implementation before proposing changes.
2. Reuse sound existing architecture before creating replacement components.
3. Prefer configuration and parameters over copied page-specific components or CSS.
4. Use semantic design tokens rather than page-specific hard-coded values.
5. Light and dark themes must share one semantic token architecture.
6. Equal UI semantics must use equal components and page patterns across modules.
7. Accessibility should target applicable WCAG 2.2 AA practices.
8. Responsive rules belong primarily in shared layout components and page patterns.
9. Existing styles may be removed only after their verified replacement is in place.
10. Every implementation phase requires build, lint, tests, and representative-page review.

## Governed shared components and patterns

The owner governs App Shell, Navigation, Page Header, Index/List, Detail, Maintenance, Lookup/Inquiry, Search/Filter, Data Table, Form Field, Input, Select, Checkbox/Radio, Button, Tabs, Card, Status Badge, Direction Panel, Message Type Selector, Audit History, Dialog/Popup, Drawer, Pagination, Action Bar, and Empty/Loading/Error/Confirmation states.

The expected common page patterns are Index, Detail, Maintenance, Lookup, and Inquiry.

## Business-rule safety boundary

UI/UX and Design System work **must not** independently change:

- SSI/RMA resolution rules or canonical grouping;
- INBOUND/OUTBOUND semantics;
- payment routing or API business semantics;
- Maker/Checker or status transitions;
- SWIFT MT/MX applicability;
- approved BA matrices or TDD expected outcomes;
- database schema or data, unless separately authorized.

If a UI issue requires a business-rule change, stop that item and mark it `BUSINESS_DECISION_REQUIRED` for BA review.

## Delivery sequence

1. UI inventory and audit.
2. Design tokens.
3. Core shared components.
4. Shared page patterns.
5. RMA/SSI pilot migration.
6. Design System validation.
7. Application-wide migration.
8. Consistency cleanup.
9. Accessibility and responsive review.

## Required design-system deliverables

- `UI-DESIGN-SYSTEM-AUDIT.md`
- `CS-DESIGN-TOKENS.md`
- `CS-COMPONENT-STANDARD.md`
- `CS-PAGE-PATTERNS.md`
- `CS-THEME-ARCHITECTURE.md`
- `UI-MIGRATION-PLAN.md`
- `UI-CONSISTENCY-REVIEW.md`

Application-wide UI work is not complete until the consistency review is complete and existing business behavior remains unchanged.

## Current Round 8 UI review assignment

After the approved Round 8 Development DB Apply, BA, QA, and the CS Design System Owner are authorized to perform UI-only review on the Development Demo. The current review must not modify source code or the database. It covers:

- SSI Index/Search/View/Edit-without-save;
- required Currency rendering in Index and detail/edit views;
- MT1/MT2 and pacs.008/pacs.009 repaired Demo data presentation;
- representative RMA, Nostro, and Entity regression checks;
- button affordance, shared page patterns, dark-theme consistency, responsive behavior, and accessibility basics.

Any implementation arising from this review requires a separately agreed scope and normal validation.
