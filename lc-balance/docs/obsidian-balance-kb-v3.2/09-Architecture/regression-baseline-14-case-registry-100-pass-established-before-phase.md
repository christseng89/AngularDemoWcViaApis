---
knowledge_id: regression-baseline-14-case-registry-100-pass-established-before-phase
title: "回归基线——14 个案例注册表，100% 通过，建立于 Phase-1 OOD 重构之前"
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

# 回归基线——14 个案例注册表，100% 通过，建立于 Phase-1 OOD 重构之前

该基线建立于 2026-08-19，对应提交 450e6f8f51ce5835d17eb6c912ba83276f675dcc，作为后续每一个重构阶段都必须与之比对的“已知基线（Known Baseline）”。三个子项目全部达到其 95% 覆盖率下限（Angular 821/821，各项覆盖率为 99.37/96.28/99.35/99.48%；微服务 322/322，各项覆盖率为 99.25/97.16/100/99.49%；后端 34/34，各项覆盖率为 97.32/95.34/96.42/98.03%）。全部 14 个已注册的 Business Case 在真实运行中的完整端到端流程均通过；import-case-5 是该文件中唯一刻意设计的负向案例，也确实如设计所预期那样失败。这是一份明确的、只反映特定时间点状态、非持续更新的文档——事后从不修改。

## Source Evidence

- `REGRESSION-BASELINE.md:1-89`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
