---
knowledge_id: expected-error-step-styling-inversion
title: "预期错误步骤的样式反转"
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

# 预期错误步骤的样式反转

对于标记为 expectError:true 的 createMovement 步骤，rowClass()/statusText() 会把常规的 ok->颜色 映射反转过来：一个意外“成功”的步骤（ok:true，即预期中的业务规则拒绝并未触发）会渲染为 'step-error'（红色/失败），而一个按设计正确“失败”的步骤（ok:false）则会渲染为 'step-ok'（绿色/成功）——UI 评判的是该用例自身的测试断言，而不是原始的 HTTP 结果。

## 证据来源

- `src/app/business-case-runner/business-case-runner.component.ts:99-113`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
