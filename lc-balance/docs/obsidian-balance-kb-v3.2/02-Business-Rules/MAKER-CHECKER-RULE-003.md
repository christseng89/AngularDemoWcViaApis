---
knowledge_id: MAKER-CHECKER-RULE-003
title: "Maker 的 EC/Cancel（cancel()）不同于 Checker 的 reject()——两者是各自独立的终态操作，各自使用独立的审计栏位"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - maker-checker
  - confirmed
---

# MAKER-CHECKER-RULE-003 — Maker 的 EC/Cancel（cancel()）不同于 Checker 的 reject()——两者是各自独立的终态操作，各自使用独立的审计栏位

## 状态
CONFIRMED

## 业务规则
cancel(movementId, cancelledBy, reasonCode?, remarks?) 是由 Maker 主动撤回自己那笔仍处于 PENDING 状态记录的操作（透过 applyStatusTransition() 的 'CANCEL' 动作，由 PENDING 转为 CANCELLED），会写入专属的 cancelledBy/cancelledAt 栏位（而非 releasedBy/releasedAt）。reject(movementId, releasedBy, reasonCode, remarks) 则是 Checker 的四眼（4-eyes）驳回操作（透过 'REJECT' 动作，由 PENDING 转为 REJECTED），写入的是 releasedBy/releasedAt（沿用既有栏位，并没有专属的 rejectedBy/rejectedAt 组合）。两者都不会强制验证当前操作者确实是原来的 Maker，或确实是另一位 Checker——这交由外部授权层负责。

## 适用条件
不适用。

## 结果
cancel() 写入 cancelledBy/cancelledAt 并将状态设为 CANCELLED；reject() 写入 releasedBy/releasedAt 并将状态设为 REJECTED。

## 示例
一位提交了尚处 PENDING 状态 A2 Amendment 的 Maker，可以在任何 Checker 处理之前调用 cancel() 将其撤回。而若一位 Checker 要驳回同一类 PENDING 记录，则会改为调用 reject()。

## 核实说明
CLAUDE.md 自身关于 cancelledBy/cancelledAt 迁移的决策日志条目（11）直接佐证了 cancel() 与 reject() 在审计栏位上的这种差异化行为。虽未提供直接的测试引用，但该架构性主张同时有源码位置与独立文件来源作为支撑——鉴于此佐证，维持 CONFIRMED，不过若能补上直接的测试引用会更为稳妥。

## 来源证据

实现代码：
- `microservices/balance-component/src/service/balanceService.ts:1271-1308`

测试：
- （未引用直接测试证据）

## 2026-08-26 补充更正——「两者都不会强制验证」这一句现在只对 cancel() 仍然成立，reject() 已被业务反转

> [!warning] 本条目原文「两者都不会强制验证当前操作者确实是原来的 Maker，或确实是另一位 Checker」已部分过时
> 业务方已于 2026-08-24 明确反转 reject() 一侧的立场：`reject()` 走的正是 `applyStatusTransition()` 的 REJECT 动作，因此现在**会**强制校验——若 `createdBy === releasedBy`（即试图 reject 自己创建的记录），抛出 `MakerCheckerConflictError`（HTTP 409 `MAKER_CHECKER_CONFLICT`），详见 [[MAKER-CHECKER-RULE-060]]。
>
> `cancel()` 一侧则完全不受影响，本条目原文对 cancel() 的描述依旧成立：`cancel()` 走的是 CANCEL 动作，`domain/statusTransition.ts` 明确将 CANCEL/EDIT 排除在新校验之外——因为 CANCEL 本来就是 Maker 对自己名下仍处于 PENDING 状态记录的 Error Correction，`cancelledBy === createdBy` 正是这里唯一合法、预期中的情形，而不是需要拒绝的冲突。
>
> 换言之，本条目正文中「两者」这一并列表述现在需要拆开来看：cancel() 侧仍然「不强制验证」（且这是正确的设计），reject() 侧现在「强制验证」（业务反转后的新行为）。

## 相关知识
- [[Maker Checker Lifecycle]]
- Submit/EC/Approve 审计轨迹拆分（cancelledBy/cancelledAt 对比 releasedBy/releasedAt）
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
