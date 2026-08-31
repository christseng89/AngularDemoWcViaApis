---
knowledge_id: createmovement-end-to-end-orchestration
title: "createMovement()——端到端编排"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# createMovement()——端到端编排

从一个原始的 CreateMovementRequest 到一笔已持久化、携带快照的 PENDING BalanceMovement（或幂等地返回一笔已存在的记录）的完整路径。

```mermaid
flowchart TD
  A["createMovement(req)"] --> B["assertValidAmount(movementType, amount)"]
  B -->|zero/negative, not AMEND/CLOSE exempt| B1["throw RequestValidationError"]
  B --> C["resolveOrCreateContract(req)"]
  C --> C1{"Contract resolves\nvia balanceContractId\nor naturalKey?"}
  C1 -->|yes, via naturalKey + isCreating movementType| C2["throw NaturalKeyAlreadyExistsError\n(Re-ISSUE guard)"]
  C1 -->|yes, non-ISSUE movementType| C3{"Root contract's own\nISSUE Released?"}
  C3 -->|no| C4["throw IllegalStateTransitionError\n(assertRootIssueReleased)"]
  C3 -->|yes| D
  C1 -->|no contract found| C5{"movementType isCreating?"}
  C5 -->|no| C6["throw NotFoundError"]
  C5 -->|yes| C7{"Has parentLogicalContractId?"}
  C7 -->|yes| C8{"Parent's own ISSUE Released?"}
  C8 -->|no| C4
  C8 -->|yes| C9
  C7 -->|no| C9["Acceptance Tenor consistency check\n(checkAcceptanceTenorConsistency)"]
  C9 --> C10{"newContractSufficiencyRegistry\nhas key instrumentType:movementType?"}
  C10 -->|SHGT:ISSUE| C11["checkNewShgtSufficiency\n(vs. parent LC net capacity)"]
  C10 -->|EPLC_EXAMINATION:CREATE| C12["checkNewPresentDocsSufficiency\n(vs. parent Confirmation net capacity, strict)"]
  C11 -->|fail| C13["throw InsufficientBalanceError"]
  C12 -->|fail| C13
  C11 -->|ok| C14["createContract()"]
  C12 -->|ok| C14
  C10 -->|no key match| C14
  D["contract resolved/created"] --> E{"findByContractAndEventSeq\nalready exists?"}
  E -->|yes| E1["return created:false, existing\n(idempotency)"]
  E -->|no| F["computeCeilingAmount (tolerance)"]
  F --> G{"sourceTransactionRef\nalready used on this contract?"}
  G -->|yes| G1["throw RequestValidationError"]
  G -->|no| H["movementTypeRegistry[movementType]\n.checkSufficiency(ctx)"]
  H -->|not ok| H1["throw InsufficientBalanceError"]
  H -->|ok| I["deriveContingentAccountEntry (Dr/Cr)"]
  I --> J["build BalanceMovement (status: PENDING)"]
  J --> K["captureSnapshotBundle()\n-> eventSnapshot/rootEventSnapshot/\nacceptanceEventSnapshot/sgEventSnapshot"]
  K --> L["movements.insert(movement)"]
  L -->|race: already exists| L1["return created:false, existing"]
  L -->|inserted| M["return created:true, movement"]
  C14 --> D
```

## Source Evidence

- `balanceService.ts:839-1103`

## Related Knowledge

- Maker/Checker 服务编排（balanceService.ts）
- [[Business-Rule-Index]]
