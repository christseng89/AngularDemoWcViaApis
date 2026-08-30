---
knowledge_id: a4-s-checker-visibility-gated-on-both-acknowledgedat-and-makersubmitte
title: "A4 的 Checker 可见性同时受 acknowledgedAt 与 makerSubmittedAt 双重门控"
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

# A4 的 Checker 可见性同时受 acknowledgedAt 与 makerSubmittedAt 双重门控

对于 requiresEarmarked 类功能（A4），一笔候选 UTILIZE 只有在同时满足以下两个条件时才会出现在 Checker Queue 中：已经 acknowledgedAt（即 A3/A3S 的 Checker 已确认——状态为 EARMARKED，而非仅仅 EARMARKING），以及已经 makerSubmittedAt（即 A4 自身的 Maker 已提交）。这是对服务端 409 的一个客户端先行镜像（release() 会拒绝一笔尚无 maker-submit 的 Sight-tenor UTILIZE）——该记录在两个条件都满足之前，甚至不应该看起来是可选中/可批准的。

## Source Evidence

- `checker-panel.component.spec.ts:518-541 (must find),547-569 (must exclude, not submitted),575-597 (must exclude, not acknowledged)`
- `checker-panel.component.ts:242-250,283`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
