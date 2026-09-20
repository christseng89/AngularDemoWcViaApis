# Payment SSI businessService eligibility implementation plan

> **For Codex:** Follow the repository Red → Green → Refactor and independent Checker gates for this candidate.

**Goal:** Keep Payment SSI/Nostro route discovery driven by settlement attributes while retaining governed Core/COV profile and RMA authorization.

**Architecture:** `sourceMessageTypes`, pacs.009 message type, fixture/scenario, currency, entity, date, direction, counterparty, applicability and settlement route remain eligibility inputs. Remove `route.businessService` only from SSI discovery SQL and its in-memory candidate fallback; keep the governed message profile service on requests, COV profile validation and at the RMA gate. Keep controlled seeds and downstream profile configuration intact.

**Tech Stack:** NestJS, TypeScript, SQLite, Jest.

---

## Pre-implementation proof

`python tmp/payment-business-service-preflight.py` loads the controlled MT1/MT2 approved seed into an isolated SQLite database. On 2026-09-15, 40 message/currency cases (MT202, MT202COV, MT205, MT205COV, each mapped to pacs.009 Core/COV) returned identical SSI ID, account, Receiver and priority with the existing and proposed SQL; all 40 were nonempty. A synthetic Core-only and COV-only pair with distinct account IDs remained separate when the service predicate was absent. The seed contains 61 Payment records whose `route.businessService` is identically `swift.cbprplus.04,swift.cbprplus.cov.04`; it therefore adds no discrimination in this snapshot. This is evidence for the governed seed and is not a universal claim about future data.

## Tasks

1. Add failing repository tests for all four MT contexts, Core/COV-only routes, unchanged service, and Payment currency discovery. Run the focused Jest test and preserve Red output in `tmp/`.
2. Remove the service predicate from Payment candidate and currency SQL and from the in-memory candidate fallback; remove the unused SSI discovery query property. Keep COV profile validation, RMA exact service/profile authorization and all seed configuration. Run focused tests for Green.
3. Recheck Applicability for service duplication used only by SSI discovery. Do not remove a field used by RMA or profile ownership.
4. Run affected regression, lint, typecheck and `npm run verify`; record DB query plan/latency and independent DBA/QA review requirements for the exact candidate commit and logical snapshot.

**Maker:** Codex `/root` on `fix_ssi`, base `d34ecea1dd7c847a49a2c1493b477ebc3d8c0cfb`.

**Independent Checker / DBA / QA:** Required before acceptance; no self-approval.
