---
knowledge_id: release-checker-approve-orchestration-including-b3-b4-consumption-and-
title: "release()——Checker Approve 编排流程，包含 B3/B4 消耗与 A10/B6 Close 的副作用"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# release()——Checker Approve 编排流程，包含 B3/B4 消耗与 A10/B6 Close 的副作用

描述一条 PENDING 变动记录如何迁移为 RELEASED，涵盖 Sight-UTILIZE 的 Maker-Submit 门控、CLOSE 的重新校验、快照路由，以及 release() 执行时的两项副作用（单据消耗、合约关闭）。

```mermaid
flowchart TD
  A["release(movementId, releasedBy)"] --> B["applyStatusTransition\n(PENDING -> RELEASE 动作)"]
  B --> C["assertValidAmount(movementType, amount)\n（纵深防御式复查）"]
  C --> D["推导 isSightUtilizeFinalize =\nUTILIZE && IPLC_LC && tenorType==SIGHT"]
  D --> E{"isSightUtilizeFinalize\n且 !makerSubmittedAt？"}
  E -->|是| E1["抛出 IllegalStateTransitionError\n（A4 要求先完成 Maker Submit，BAL-123）"]
  E -->|否| F{"movementType == CLOSE？"}
  F -->|是| G{"evaluateContractCloseEligibility\n（排除本笔变动记录）是否合格？"}
  G -->|否| G1["抛出 IllegalStateTransitionError"]
  G -->|是| H{"ceilingAmount 是否 ==\n当前 Confirmed Balance？"}
  H -->|否| H1["抛出 IllegalStateTransitionError\n（需以当前数值重新提交）"]
  H -->|是| I
  F -->|否| I["计算变动前后的 Confirmed Balance\n（在内存中模拟 RELEASED 状态）"]
  I --> J["captureSnapshotBundle()\n（自身+根级+同级快照，RELEASED 状态）"]
  J --> K["resolveSnapshotWriteTarget(isSightUtilizeFinalize)\n-> 写入普通列 或 finalize* 列"]
  K --> L["movements.updateStatus()\n（status 置为 RELEASED、releasedBy/At、\nbalanceBefore/After、快照字段）"]
  L --> M{"movement.referencedTransactionId 已设置\n且所引用记录是 EPLC_EXAMINATION/CREATE？"}
  M -->|是| N["markPresentDocsConsumed(referenced movement)\n（presentDocsConsumedBy/At）"]
  M -->|否| O
  N --> O{"movementType == CLOSE？"}
  O -->|是| P["contracts.markClosed(contract, releasedAt)\n（ContractStatus -> CLOSED）"]
  O -->|否| Q["返回此时已变为 RELEASED 的变动记录"]
  P --> Q
```

## 2026-08-26 补充——流程图中「movements.updateStatus()」这一步，此前会静默清空 reason_code（真实 Bug，现已修复）

流程图中 `movements.updateStatus()` 这一步所写入的字段里，`reason_code` 此前用的是普通覆盖而非本图其余快照字段所用的 COALESCE 保留模式——`release()` 自身从不传入 `reasonCode`（CLOSE/REOPEN 的必填 Reason Code 是在 createMovement() 时就已捕获），所以每次 Release 都会把它静默清空。已修复为 `COALESCE(@reasonCode, reason_code)`，与其余字段的保留语义一致。完整说明与测试证据见 event-snapshot-column-write-semantics-coalesce-preserve-vs-explicit-in 笔记的 2026-08-26 补充小节。已知遗留数据现象：既有演示数据（LC `S01` 的 CLOSE/REOPEN）仍显示空白 Reason Code，属修复前遗留、不可逆的数据现象。

## Source Evidence

- `balanceService.ts:1105-1269`

## Related Knowledge

- Maker/Checker 服务编排（balanceService.ts）
- [[Business-Rule-Index]]
