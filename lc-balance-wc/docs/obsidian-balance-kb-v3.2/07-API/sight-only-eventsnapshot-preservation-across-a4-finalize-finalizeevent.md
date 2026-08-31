---
knowledge_id: sight-only-eventsnapshot-preservation-across-a4-finalize-finalizeevent
title: "仅 Sight 场景下、跨 A4 finalize 的 eventSnapshot 保留（finalizeEventSnapshot 家族）"
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

# 仅 Sight 场景下、跨 A4 finalize 的 eventSnapshot 保留（finalizeEventSnapshot 家族）

对于 Sight 期限的 IPLC_LC/UTILIZE（A3 创建 -> A4 finalize），release() 并不会覆写该 Movement 自身的 eventSnapshot/sgEventSnapshot（这两个字段是在 A3 自身创建时刻捕获的，反映的是那一刻的真实状态，例如「当时尚不存在任何 SG」）——放行时刻的数值改为落入单独的 finalizeEventSnapshot/finalizeSgEventSnapshot 字段。而对于其他所有放行路径（例如一笔从未经过 maker-submit、经由 A6 放行的 Usance UTILIZE），eventSnapshot 在放行时会照常被正常覆写，finalizeEventSnapshot 则保持为 null——这种保留行为仅限于 Sight 场景。

## Source Evidence

- `test/unit/app.test.ts:2813-2938`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
