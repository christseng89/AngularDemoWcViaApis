---
knowledge_id: import-document-arrival-status-label-progression-across-a3-earmark-the
title: "进口单据到达——状态标签在 A3（预留/earmark）与 A4（终结）阶段间的演进"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# 进口单据到达——状态标签在 A3（预留/earmark）与 A4（终结）阶段间的演进

该业务流程由 isEarmarkFunction() 的 phase 参数、以 acknowledgedAt 为门槛区分的 EARMARKING/EARMARKED 拆分共同推导得出，并与 CLAUDE.md 决策记录中"4-eyes（双人复核）：要求 EARMARKED，而非仅 EARMARKING"这一规则相互印证。A3 自身的 Checker Approve 只是确认（acknowledgment），从来不是真正的 Release，因此分录在整个 A3 生命周期内始终保持 PENDING——只有后续 A4 真正的 Release 才会改变 MovementStatus。所展示的各标签，是 displayStatus()/statusBadgeClass() 根据同一底层分录（IPLC_LC, UTILIZE）在各阶段计算出的结果。

```mermaid
flowchart TD
  A[A3 Maker Submit\nstatus=PENDING, acknowledgedAt=null] -->|isEarmarkFunction=true, 尚未确认| B[显示：EARMARKING\n徽章 --pending]
  B --> C[A3 Checker Approve\n仅为确认动作——status 保持 PENDING\nacknowledgedAt 此时被设置]
  C -->|isEarmarkFunction=true, acknowledgedAt 已设置| D[显示：EARMARKED\n徽章 --earmark]
  D --> E{A4 提取资格判定\n要求 EARMARKED}
  E -->|符合资格| F[A4 Maker Submit\n在同一分录上设置新的 makerSubmittedAt]
  F --> G[A4 Checker Release\n真正的 Release：status 变为 RELEASED\n该行 phase 变为 'finalize']
  G -->|phase='finalize' 使其不再满足 isEarmarkFunction| H[显示：APPROVED\n徽章 --approved]
```

## 来源证据

- `balance-component.model.ts:505-560 (doc comment + isEarmarkFunction + displayStatus)`
- `CLAUDE.md decision log: 'A4/A6 picker eligibility now requires genuine 4-eyes: EARMARKED (Checker-acknowledged), not just EARMARKING'`
- `CLAUDE.md decision log: 'A finalized Sight Document Arrival splits into a create + finalize row in the merged timeline'`

## 相关知识

- Angular Domain Model（balance-component.model.ts，Angular 领域模型）
- [[Business-Rule-Index]]
</content>
