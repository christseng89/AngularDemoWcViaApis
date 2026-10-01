## Purpose

Define the observable application-shell, navigation, theme and accessibility contract shared by LC SSI Workbench features.

## Requirements

### Requirement: Lazy Feature Navigation

**Requirement ID:** AS-001

The application SHALL expose SSI maintenance, SWIFT data, Checker, Audit, domain resolution and Settings through guarded route-level feature boundaries, and SHALL route an unknown location to a deterministic safe entry.

#### Scenario: Enter a governed feature

**Scenario ID:** AS-001-S01

- **WHEN** an authorised user navigates to a supported feature route
- **THEN** the application SHALL load the route's feature component or route collection
- **AND** SHALL retain the shared application shell

#### Scenario: Enter an unknown route

**Scenario ID:** AS-001-S02

- **WHEN** a user navigates to an unsupported application route
- **THEN** the application SHALL redirect to the deterministic default entry
- **AND** SHALL NOT render an unguarded feature

### Requirement: Theme Preference

**Requirement ID:** AS-002

The application SHALL provide System, Light and Dark theme preferences, SHALL treat a missing or invalid stored value as System, and SHALL keep the explicit preference in browser-local storage.

#### Scenario: First or invalid preference

**Scenario ID:** AS-002-S01

- **WHEN** no valid theme preference is stored
- **THEN** the selected preference SHALL be System
- **AND** the effective theme SHALL follow the operating-system colour scheme

#### Scenario: Explicit preference

**Scenario ID:** AS-002-S02

- **WHEN** a user selects Light or Dark
- **THEN** the effective theme SHALL change without changing SSI transaction state
- **AND** the selected preference SHALL be restored on the next visit

### Requirement: Accessible Shared Presentation

**Requirement ID:** AS-003

Shared navigation, loading, forms, dialogs, tables and status presentation MUST expose keyboard-operable controls, visible focus, accessible names and status meaning that does not depend on colour alone.

#### Scenario: Keyboard interaction

**Scenario ID:** AS-003-S01

- **WHEN** a keyboard user moves through a route, form, dialog or governed table
- **THEN** each actionable control MUST expose a visible focus state and accessible name
- **AND** loading, failure and status information MUST remain programmatically distinguishable
