---
knowledge_id: STATUS-RULE-027
title: "A10/B6 的 Close 资格判定透过一次聚合式服务端调用完成，绝不逐候选项分别判定"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - status
  - confirmed
---

# STATUS-RULE-027 — A10/B6 的 Close 资格判定透过一次聚合式服务端调用完成，绝不逐候选项分别判定

## 状态
CONFIRMED

## 业务规则
与 DocumentArrivalHintsService 中其他所有提示方法不同，Close 资格并不是在客户端针对第一步的每个候选项分别计算的——它完全委托给 GET /balance-contracts/close-eligible（由服务端的 evaluateContractCloseEligibility() 计算），从而避免每份 LC 都产生多次额外的往返调用。

## 条件
不适用（由服务端计算）

## 结果
catalogCloseEligible 集合直接由服务端响应自带的条目清单填充，无论目录规模多大，都只需一次 HTTP 调用。

## 示例
无论第一步索引中有多少份 LC，loadCloseEligibility(instrumentType, onDone) 都恰好只发出一次 HTTP 调用。

## 验证说明
直接阅读了 loadCloseEligibility()——文档注释与实现代码都证实了这一单次聚合调用的设计，并与同一文件中其他所有 loadXxx 方法（这些方法都接受一个 `list` 参数并分发多次调用）形成明确对比。未降级。

## 来源证据

实现：
- `src/app/transaction-builder/document-arrival-hints.service.ts:136-154`

测试：
- （未引用直接测试证据）

## 相关知识
- [[Close Eligibility]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
