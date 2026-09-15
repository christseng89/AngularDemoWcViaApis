# ADR-002: Scenario display order

## Status

Accepted by the user on 2026-09-14.

## Decision

All MT3, MT4, and MT7 Scenario selectors use one shared default display order:

1. Valid (`POSITIVE`) — rank `0`
2. Invalid (`NEGATIVE`) — rank `1`
3. Boundary (`BOUNDARY`) — rank `2`

Within the same rank, rows are ordered by the displayed Scenario description
(`label`) ascending, with the stable Scenario ID as the final tie-breaker.

The message Scenario drawer and the in-form Scenario dropdown must use the
same comparator. An explicit user-selected table-column sort may temporarily
override the default drawer order.

## Constraints

- Do not duplicate sorting rules between components.
- Do not add or change a stylesheet for this behavior.
- Do not duplicate or reshape OAS/page-parameter records to achieve UI order.
- The API polarity value remains the source of truth.
