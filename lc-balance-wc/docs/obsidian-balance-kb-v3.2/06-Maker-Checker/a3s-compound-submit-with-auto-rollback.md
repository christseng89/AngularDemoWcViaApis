---
knowledge_id: a3s-compound-submit-with-auto-rollback
title: "A3S 组合提交与自动回滚（Auto-Rollback）"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# A3S 组合提交与自动回滚（Auto-Rollback）

A3S（Document Arrival 与一笔 SG 赎回相匹配）端到端 Maker 提交流程，包括当第二条（LC）leg 在第一条（SG）leg 已经成功之后失败时的补偿性事务（compensating-transaction）回滚。

```mermaid
flowchart TD
  A["Maker types Bill Amount, selects matching SG (A3S)"] --> B["submit() -> MakerSubmitService.submit()"]
  B --> C{"selectedArrivalSg AND arrivalSgSnapshot both set?"}
  C -->|No| P["submitPlain(): single createMovement (LC UTILIZE only)"]
  C -->|Yes| D["sgRedeemAmount = MIN(Bill Amount, SG confirmedBalance)"]
  D --> E["createMovement: SHGT FULL_REDEEM/PARTIAL_REDEEM, PENDING, businessEventId=X"]
  E -->|fails| F["Outcome: failed — 'Could not reserve the SG redemption'; result absent, secondary {}"]
  E -->|succeeds| G["createMovement: LC UTILIZE (req), PENDING, same businessEventId=X"]
  G -->|succeeds| H["Outcome: submitted — result = LC UTILIZE; secondary = SG redeem id + full movement"]
  G -->|fails| I["rollbackArrivalSgRedeem(): api.cancel(SG redemption id, AUTO_ROLLBACK_LC_LEG_FAILED)"]
  I -->|cancel succeeds| J["Outcome: failed — LC error + 'SG redemption automatically cancelled'; secondary {}"]
  I -->|cancel also fails| K["Outcome: failed — both the LC error AND the cancel error surfaced; points to A9 Checker panel as manual fallback"]
```

## Source Evidence

- `maker-submit.service.ts:66-150`

## Related Knowledge

- Angular Maker 面板 + Submit 编排
- [[Business-Rule-Index]]
