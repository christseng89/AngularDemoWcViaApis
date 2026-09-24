## MODIFIED Requirements

### Requirement: Payment Simulator Navigation

The application SHALL present Payment Component Simulator before Import LC and Export LC and SHALL select Payment Component Simulator on initial application entry.

#### Scenario: Initial application entry

- **WHEN** a user opens the application
- **THEN** Payment Component Simulator SHALL be the first top-level navigation item
- **AND** SHALL be the selected view
- **AND** Import LC and Export LC SHALL remain directly available

## ADDED Requirements

### Requirement: Theme Preference

The application SHALL provide System, Light, and Dark theme preferences, SHALL default to System when no valid preference exists, and SHALL persist an explicit user selection locally.

#### Scenario: First visit

- **WHEN** no valid stored theme preference exists
- **THEN** the preference SHALL be System
- **AND** the effective theme SHALL match the operating-system preference

#### Scenario: Explicit Light or Dark selection

- **WHEN** a user selects Light or Dark
- **THEN** the effective theme SHALL change without reloading or losing transaction input
- **AND** the explicit preference SHALL persist for the next visit

#### Scenario: Operating-system theme changes under System

- **WHEN** the preference is System and the operating-system theme changes
- **THEN** the effective theme SHALL update automatically

#### Scenario: Operating-system theme changes under explicit preference

- **WHEN** the preference is Light or Dark and the operating-system theme changes
- **THEN** the effective theme SHALL remain the explicit preference

### Requirement: Framework Compatibility

The UI SHALL run on Angular 20, aligned with lc-balance-wc, using a supported Node, TypeScript, RxJS, Formly, Jest, and zone.js combination while preserving existing observable business behavior.

#### Scenario: Migration regression suite

- **WHEN** the Angular 20 dependency set is installed
- **THEN** the full UI test suite, TypeScript check, production build, and Web Component build SHALL pass
