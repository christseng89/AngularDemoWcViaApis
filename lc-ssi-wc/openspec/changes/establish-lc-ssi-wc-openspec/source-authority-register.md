# Source and Authority Register

## Identity

- Baseline repository path: `C:\Users\samfi\Downloads\outputs\lc-ssi-wc`
- Baseline Git commit: `98c5eb60809d1e5b4e567df8251d361a7fce1f2b`
- Register date: 2026-10-01
- Archive isolation: archive-management-only content is excluded from every source and evidence denominator.

## Concern-based Sources

| Concern                       | Authority / evidence source                                     | SHA-256 at baseline                                                | Use and limitation                                                                             |
| ----------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Workspace governance          | `AGENTS.md`                                                     | `f84a76608df20c8d8d185b31ba1ccabe839cc016628226609dd1bb49cfac601b` | Mandatory working, isolation and review rules; not a runtime wire contract.                    |
| Product operating model       | `memory/governance/lc-ssi-wc-operating-model-zh-v2.md`          | `f3574c973b97d16ca932778545ba455ffcbb3efd746ac6f6bf3f6c0da35897a8` | Controlled cross-product requirements; implementation still requires proof.                    |
| Page Parameter pattern        | `memory/governance/mt347-oas-page-parameters-ui-standard-v1.md` | `221be26604dd0cc821ecb459092dc972d2ab4d79238410ad049e1c000bdf5940` | Controlled architecture pattern; status remains pending 4-EYES revalidation.                   |
| Maintenance lifecycle         | `memory/ssi/ssi-maintenance-workflow-memory.md`                 | `4f1c970db0039decbedc2d3587978597c7945ce95c2052232ca802decfe66e73` | Latest-confirmed maintenance workflow decisions; verify each current behaviour in code/tests.  |
| RMA scope                     | `memory/ssi/rma-index-message-scope-memory.md`                  | `95ce9ec7452a580385f8a7e04566bbd27a252741f5ce726198c7b1b90a24b0ca` | RMA message scope and index decisions; OAS operation coverage is partial.                      |
| Resolver boundary             | `memory/ssi/ssi-resolver-service-boundary-v1.md`                | `f644f4e1c8ade9d92fec547b6f8ad2acb16a403afc41e6c2d3753f1a143f8d81` | SSI-resolution service boundary; family acceptance status must be checked separately.          |
| API wire description          | `openapi/swift-data-service.v1.json`                            | `29705c7382c1b124dea74f7aa6f0d24ad0c9485eaebab03fa3c38cae443dddd4` | Authoritative only where operation/schema coverage exists and agrees with typed contracts.     |
| Page Parameter typed contract | `libs/contracts/src/page-parameters.ts`                         | `a8ca029f66e449f0055af67339941a29f14c1b4bdaf408d0d460feadb1f8b7c3` | TypeScript contract for definition, lookup, submission, result, route and evidence structures. |

## Runtime and Verification Sources

- Governed parameter and seed files under `parameters/` and active data locations define catalogue/runtime content only for their declared release and binding.
- Production implementation under `apps/` and `libs/` proves observable behaviour but cannot create new SWIFT or product semantics.
- Automated tests under the active app/library test trees, `qa/tests` and `scripts` provide verification evidence only for the exact source identity tested.
- DB logical snapshot, fixture binding and runtime evidence are environment identities; they are not replaced by this source register.

## Family-source Acceptance Limits

- MT1/pacs.008 material is a controlled candidate with Independent BA/QA/Product Owner approval pending.
- MT2/pacs.009 correction evidence remains pending final 4-EYES acceptance.
- MT347 material remains controlled draft / pending QA evidence where identified by its source record.
- Accordingly, this baseline records generic, implemented platform contracts and does not declare pending family-specific semantics finally accepted.
