---
knowledge_id: tenor-flow-control-on-acceptance-creation
title: "创建 Acceptance 时的 Tenor 流程控制"
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

# 创建 Acceptance 时的 Tenor 流程控制

创建一笔 IPLC_ACCEPTANCE（或 EPLC_ACCEPTANCE）在以下两种情况下会被以 400 REQUEST_VALIDATION_FAILED 拒绝：(1) 父级 LC 声明的 tenorType 为 SIGHT（错误信息中会出现「Sight LC」）；或 (2) 该 Acceptance 自身的 tenorType 与父级 LC 所声明的 tenorType 不一致（错误信息中会出现「does not match」）。相互匹配的 Sellers/Buyers Usance 两者都能成功创建，且产生完全相同的 ceilingAmount/余额计算机制——唯一的差异只在 tenorType 标签本身。

## Source Evidence

- `test/unit/app.test.ts:873-1280`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
