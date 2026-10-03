# SWIFT DATA Service／Nostro Account Addendum

**Parent plan:** `2026-09-07-swift-data-service-rma.md`

## Decision

SWIFT DATA Service Prototype 在同一 SQLite deployable 中新增第三個獨立 Aggregate：Nostro Account。SSI、RMA、Nostro 分開資料表、Application Service、Repository、狀態機、稽核與 outbox；Portal 只能經 OAS/BFF API 存取。

- RMA：證明 BIC／Service／Direction／Message scope 的通訊授權，不證明帳戶所有權。
- SSI：保存結算路由並引用 `nostroAccountId`，不複製 Nostro 主檔。
- Nostro：擁有 Bank、Currency、masked/tokenised Account Reference、Purpose、Priority、有效期與版本。
- SSI import 若帶入新帳戶，只能建立 Nostro DRAFT/Candidate；不得直接 ACTIVE 或覆寫既有主檔。

## OAS additions

- `GET/POST /api/nostro-accounts`
- `GET/PUT/DELETE /api/nostro-accounts/{id}`
- `POST /api/nostro-accounts/{id}/submit`
- `POST /api/nostro-accounts/{id}/approve`
- `POST /api/nostro-accounts/{id}/activate`
- `POST /api/nostro-accounts/{id}/revise`
- `POST /api/nostro-accounts/resolve`
- `POST /api/swift-data/imports`, where `dataType=SSI|RMA|NOSTRO`

## Data and rules

Natural selection dimensions:

`ownLegalEntityId + accountServicerBic + currency + purpose + priority + effective period`

- 同一銀行＋同一幣別允許多帳號。
- 若同一 purpose 有多個 Active default 且 priority 無法唯一決定，回 `NOSTRO_AMBIGUOUS`。
- 帳號只保存 synthetic masked value 或 token/reference；audit/outbox 不記完整帳號。
- 狀態：`DRAFT → PENDING_APPROVAL → APPROVED → ACTIVE`，另有 `SUSPENDED／REVOKED／SUPERSEDED`。
- Active 資料不可原地修改；修訂建立新 Version。
- Maker 不可 Checker；Upload 永遠不跳過四眼控制。

## Implementation files

- `parameters/nostro-rules.json`
- `apps/ssi-service/src/app/nostro/nostro.types.ts`
- `apps/ssi-service/src/app/nostro/nostro-policy.ts`
- `apps/ssi-service/src/app/nostro/sqlite-nostro.repository.ts`
- `apps/ssi-service/src/app/nostro/nostro-application.service.ts`
- `apps/ssi-service/src/app/nostro/nostro.controller.ts`
- `apps/ssi-service/src/app/nostro/*.test.ts`
- `fixtures/nostro-accounts.seed.json`
- `scripts/seed-demo-nostro.mjs`
- Angular `SWIFT DATA／RMA／Nostro` workbench and upload result view.

## Tag Lab gate

Outgoing generation sequence:

1. Resolve one Active SSI.
2. Check one effective RMA authorisation for BIC／Service／Direction／Message.
3. Resolve one eligible Nostro by currency／purpose／priority.
4. Pin SSI＋RMA＋Nostro versions and hashes.
5. Generate applicable MT 5x Tags or MX agent/account paths.

Any `NOT_FOUND／NOT_AUTHORISED／EXPIRED／AMBIGUOUS` result is fail-closed.

## Acceptance and quality gates

- OAS 3.1 validation passes and implementation paths match the contract.
- Multiple accounts per bank/currency are demonstrated and deterministic.
- SSI/RMA/Nostro upload supports dry-run, checksum, idempotency and per-row results.
- Unit/API/E2E coverage for new modules exceeds 95% lines and branches.
- ESLint, TypeScript, production builds and SonarQube Quality Gate pass.
- All sample BICs may be recognisable public examples, but RMA, SSI routes and accounts are explicitly synthetic.
