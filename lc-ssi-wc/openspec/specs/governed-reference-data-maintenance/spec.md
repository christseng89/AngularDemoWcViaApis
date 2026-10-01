## Purpose

Define the evidenced maintenance and import behaviour for governed SSI, Nostro, Entity and RMA records without asserting one complete public contract where current OAS coverage is partial.

## Requirements

### Requirement: Governed Draft Creation and Revision

**Requirement ID:** GRM-001

The service SHALL validate and persist governed maintenance commands for supported SSI, Nostro, Entity and RMA resources as lifecycle-controlled records, and MUST reject invalid or conflicting identities and scopes.

#### Scenario: Valid new record

**Scenario ID:** GRM-001-S01

- **WHEN** a valid create command is submitted for a supported governed resource
- **THEN** the service SHALL persist a new lifecycle-controlled record with its maker and provenance

#### Scenario: Invalid or duplicate scope

**Scenario ID:** GRM-001-S02

- **WHEN** a command violates required fields, governed scope or a unique logical identity
- **THEN** the service MUST reject the command
- **AND** MUST NOT overwrite an existing active record

### Requirement: Governed SWIFT-data Import

**Requirement ID:** GRM-002

The service SHALL accept import requests only for supported SSI, RMA, Nostro and Entity data types, SHALL validate each record with its resource application policy, and MUST report unsupported or invalid input as non-success.

#### Scenario: Supported import record

**Scenario ID:** GRM-002-S01

- **WHEN** an import contains a supported data type and a valid resource command
- **THEN** the service SHALL apply the corresponding governed maintenance operation
- **AND** SHALL identify the imported resource outcome

#### Scenario: Unsupported data type or invalid record

**Scenario ID:** GRM-002-S02

- **WHEN** an import declares an unsupported data type or fails resource validation
- **THEN** the service MUST reject that input
- **AND** MUST NOT reinterpret it as another resource type

### Requirement: Independent Resource Ownership

**Requirement ID:** GRM-003

SSI, Nostro, Entity and RMA maintenance SHALL preserve separate resource identities, validation and lifecycle ownership even when the records later participate in one settlement route.

#### Scenario: Maintain one resource type

**Scenario ID:** GRM-003-S01

- **WHEN** a maker creates or revises one supported resource
- **THEN** the service SHALL apply that resource's own validation and lifecycle policy
- **AND** MUST NOT silently mutate a different governed resource
