---
knowledge_id: pure-function-extraction-pattern-function-policy-ts-builder-fields-ts-
title: "纯函数抽取模式（function-policy.ts / builder-fields.ts / submit-rules.ts）"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — 本次分析快照中无 .git 历史记录，详见 [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# 纯函数抽取模式（function-policy.ts / builder-fields.ts / submit-rules.ts）

这三个文件都被明确设计为纯函数：不使用 `this`、不发起 API 调用、不直接改动组件状态。所有状态都通过显式的上下文对象（BuilderModel、ContextRefState、BuilderFieldsContext、SubmitRulesContext）传入，任何改动则以显式的 `patch` 对象返回，由调用方通过 Object.assign 自行应用。文档中特别标注了一处微妙之处：无论 `error` 是否被设置，调用方都必须应用 `patch`，因为前面某个守卫产生的改动（例如 A1 的 tenorDays 归一化）必须在后面某个守卫失败的情况下依然保留生效。

## Source Evidence

- `src/app/transaction-builder/builder-fields.ts lines 7-11`
- `src/app/transaction-builder/function-policy.ts lines 12-17`
- `src/app/transaction-builder/submit-rules.ts lines 15-53 (SubmitValidation.patch doc comment)`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
