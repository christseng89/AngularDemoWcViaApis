## Purpose

Define how the Angular workbench renders and executes governed Page Parameter definitions without owning SSI business decisions.

## Requirements

### Requirement: Generic Field Rendering

**Requirement ID:** GRW-001

The workbench SHALL map Page Parameter field metadata into shared typed controls and MUST NOT select visibility, requiredness, lookup provider or execution action from hard-coded message, tag, scenario, BIC, account or fixture values.

#### Scenario: Render a supported definition

**Scenario ID:** GRW-001-S01

- **WHEN** a valid resolution-page definition is loaded
- **THEN** the workbench SHALL render fields in the declared sections and display order using their declared control, ownership, visibility and constraints
- **AND** visible SWIFT fields SHALL use governed tag/option and official-description metadata

#### Scenario: Unknown contract value

**Scenario ID:** GRW-001-S02

- **WHEN** the workbench receives an unsupported control or invalid required metadata
- **THEN** it MUST present a structured failure
- **AND** MUST NOT guess a message-specific control or rule

### Requirement: Dependency Invalidation

**Requirement ID:** GRW-002

The workbench MUST clear dependent values and selected identities when a declared upstream dependency changes, including transitive invalidations.

#### Scenario: Upstream context changes

**Scenario ID:** GRW-002-S01

- **WHEN** a user changes a field that invalidates one or more downstream fields
- **THEN** the workbench MUST clear every directly and transitively invalidated value and selection identity
- **AND** a later lookup MUST use the updated dependency context

### Requirement: Contract-bound Execution

**Requirement ID:** GRW-003

The workbench SHALL submit only the definition, scenario, fixture, contract and authorised user-input identities required by the typed execution contract, and SHALL render the structured result without deriving SSI outcomes locally.

#### Scenario: Valid execution submission

**Scenario ID:** GRW-003-S01

- **WHEN** all required user-owned values and governed lookup identities are valid
- **THEN** the workbench SHALL call the execution endpoint and method declared by the scenario
- **AND** SHALL present outcome, field results, output, evidence and remediation from the structured response

#### Scenario: Execution failure

**Scenario ID:** GRW-003-S02

- **WHEN** execution returns a structured invalid, stale, unavailable or data-quality failure
- **THEN** the workbench SHALL present that failure as non-success
- **AND** MUST NOT create a local fallback resolution or confirmed output
