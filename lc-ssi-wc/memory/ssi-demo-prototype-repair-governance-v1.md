# SSI Demo Prototype repair governance v1

Decision date: 2026-09-17

This repository uses synthetic, AI-generated Demo Prototype fixtures. MT1,
MT2, MT347, pacs.008 and pacs.009 fixture repair is governed as a Demo
data-quality exercise, not as a Production data migration.

The objective is internally consistent, deterministic fixtures that correctly
demonstrate SSI Resolver behaviour. Existing approved BA rules remain binding
and are not reopened by implementation work.

Required acceptance checks:

- every governed context is classified as Candidate, Negative, OOS or Not Required;
- generated counts reconcile to the approved Rule Table and Test Oracle;
- expected outcomes and reason codes are typed;
- generation is deterministic;
- Positive cases resolve as expected;
- Negative cases produce the exact expected typed failure;
- OOS cases are not submitted to SSI resolution;
- Virtual Nostro/Account/Counterparty evidence is controlled and deterministic;
- FK/reference integrity, API Dry Run and automated tests pass;
- a repeated load creates no duplicate logical records;
- unrelated RMA, SSI, Nostro, Entity and reference data remain logically unchanged;
- one recoverable archive copy of the preceding Demo seed/database is retained.

Production DBA certification, Production migration/rollback certification,
multi-layer publication governance and repeated same-SHA approval rounds are
not required. Further BA/QA review is needed only for a genuine business-rule
ambiguity or test failure.

Virtual Nostro remains a controlled virtual microservice/stub. No real Nostro
microservice or real bank account evidence is in scope.

