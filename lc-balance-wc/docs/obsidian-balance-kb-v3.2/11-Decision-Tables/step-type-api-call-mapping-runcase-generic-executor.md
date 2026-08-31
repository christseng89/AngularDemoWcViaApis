---
knowledge_id: step-type-api-call-mapping-runcase-generic-executor
title: "步骤类型 -> API 调用映射（runCase() 通用执行器）"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# 步骤类型 -> API 调用映射（runCase() 通用执行器）

| 步骤类型 | HTTP 调用 | 请求体/替换内容 | 额外的 API 开销 | 前置条件缺失时的追踪记录 |
|---|---|---|---|---|
| createMovement | POST /balance-movements | 完整请求体，先解析并剥离 balanceContractIdRef/parentLogicalContractIdRef/referencedTransactionIdRef | 0-1 次额外 GET（仅在某个 parentLogicalContractIdRef 首次使用时） | 不适用——始终会尝试执行；仅当键存在时 captureAs 才会存储响应 |
| release | POST /balance-movements/:id/release | {releasedBy} | 0 | 若 movementRef 对应的 createMovement 从未捕获到 movementId，则记录 {skipped:true, reason} |
| makerSubmit | POST /balance-movements/:id/maker-submit | {makerSubmittedBy} | 0 | 若 movementRef 对应的 createMovement 从未捕获到 movementId，则记录 {skipped:true, reason} |
| snapshot | GET /balance-contracts/:id/balance | 无（contractRef 必须已被捕获） | 0（这本身就是该调用） | 不适用——若 contractRef 缺失，balanceContractId 会解析为 undefined，产生一个形同 404 的调用 |
| note | 无 | 不适用 | 0 | 不适用——始终只是 {type:'note', label} |

## Source Evidence

- `backend/server.js:64-137`

## Related Knowledge

- Business Case Registry (backend orchestrator) + Business Case Runner UI
- [[Business-Rule-Index]]
