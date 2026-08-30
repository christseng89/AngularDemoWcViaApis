---
knowledge_id: checker-action-dispatch-and-compound-release-routing
title: "Checker 动作派发与复合放行路由"
domain: Balance
category: Flow
snapshot_date: 2026-08-22
tags:
  - balance
  - flow
---

# Checker 动作派发与复合放行路由

Checker 面板上一次简单的 Release/Reject 点击，如何被解析为四种不同行为之一，其中包括那个让真正独立的 Checker 会话也能放行一笔它自己从未 Submit 过的复合（多腿）提交的修复。

```mermaid
flowchart TD
  A[Checker 在队列中选取一笔 movement] --> B[checkerAct 动作：release/reject]
  B --> C{isCheckerCompoundOwnSubmission？}
  C -->|是| D[release/reject 完整服务调用]
  D --> E{selectedCheckerMovement 存在，或 makerContext.submitResult.movementId 存在？}
  E -->|否| F[空操作——守卫提前返回]
  E -->|是| G[通过 buildCheckerActionContext 调用 checkerActions.release/reject]
  G --> H{outcome.kind === released？}
  H -->|是| I[selectFunction 重置界面 + refreshLookUpForLastMakerContext + 成功提示]
  H -->|否| J[forwardOutcomeToMaker：设置 makerOutcomeSignal，若未失败则刷新队列与 lookup]
  C -->|否| K{release 且 deferSettlement 且 movementType 与 deferSettlementMovementType 匹配？}
  K -->|是| L[acknowledgeArrival——仅持久化 acknowledgedBy/At，状态不变]
  K -->|否| M{release 且 releasesExistingMovementInPlace 且 makerSubmittedAt 缺失？}
  M -->|是| N[被阻止——显示 checkerError，不发起 API 调用]
  M -->|否| O[普通的 api.release/api.reject 调用]
  O --> P[成功后 refreshNonce++ 与 checkerQueueRefreshNonce++]
```

## 相关知识

- Angular Pickers, Eligibility Hints, Orchestrating Shell
- [[Business-Rule-Index]]
