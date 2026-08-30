---
knowledge_id: maker-checker-4-eyes-lifecycle
title: "Maker/Checker 双人复核（4-eyes）生命周期"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# Maker/Checker 双人复核（4-eyes）生命周期

每一笔 Movement 的 MovementStatus 生命周期都是：Maker 创建 PENDING（POST /balance-movements）→ Checker 放行（PENDING→RELEASED）或驳回（PENDING→REJECTED，earmark 立即释放）→ 或 Maker 取消自己仍处于 PENDING/REJECTED 状态的记录（→CANCELLED，若已是 REJECTED 则取消操作为空操作）。CANCELLED 记录永远不会被物理删除，会保留以供审计。Channel API 完全镜像这一流程，每次只处理一个调用，且没有内建的身份验证——createdBy/releasedBy/cancelledBy 都是调用方自行声明的身份主张（这是已披露的原型阶段范围缺口）。

## Source Evidence

- `balance-component-api.yaml lines 900-1194 (release/maker-submit/acknowledge/reject/cancel endpoints)`
- `balance-component-channel-api.yaml lines 69-82 (Maker/Checker top-level description)`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
