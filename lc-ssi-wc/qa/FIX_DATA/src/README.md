# FIX_DATA Source Architecture

All repair and fixture tooling follows **OO classes + parameter-driven rules**.

## Shared source

Code directly under this directory is reusable across Entity, Nostro, RMA and
SSI packages. Shared code may define typed contracts, canonical identities,
repositories, snapshot evidence, orchestration and report writers. It must not
embed message-family decisions.

## Domain source

- [`rma/`](rma/) contains only RMA-specific policies and adapters.
- [`ssi/`](ssi/) contains only SSI-specific policies and adapters.

Domain behavior must be supplied through controlled parameters, typed API
contracts and versioned policy artifacts. Classes receive those dependencies
through constructors or factories. UI labels, database row order, UUIDs and
hard-coded MT/MX lists are not policy sources.

Shared orchestration calls domain interfaces; it must not switch on individual
messages, scenarios or fixture IDs.
