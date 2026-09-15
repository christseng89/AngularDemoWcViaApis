# SSI Prototype API Tour coverage

Run `npm run demo:api-tour` while `npm run dev:all` is active.

The tour exercises every public BFF function and its upstream SSI or mock service: dashboard/list, full SSI CRUD, Maker/Checker/activation workflow, resolution, MT extraction/generation, controlled sample list/load/directory import, audit, Currency, paged Bank list, Bank detail, Account, Nostro and AML.

Delete is deliberately implemented as logical revocation (`REVOKED`). The temporary tour SSI and its audit/outbox evidence remain traceable.
