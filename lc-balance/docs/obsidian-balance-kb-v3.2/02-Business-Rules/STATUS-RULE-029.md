---
knowledge_id: STATUS-RULE-029
title: "CONFLICT：文档将第 16(f) 条的自动排除（automatic preclusion）描述为系统自动生成、无需人工介入的事件，但已实现的代码中并不存在此类机制（定时器、排程任务或状态）"
domain: Balance
category: Business Rule
status: CONFLICT
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - status
  - conflict
---

# STATUS-RULE-029 — CONFLICT：文档将第 16(f) 条的自动排除（automatic preclusion）描述为系统自动生成、无需人工介入的事件，但已实现的代码中并不存在此类机制（定时器、排程任务或状态）

## 状态
CONFLICT

## 业务规则
立场 A（设计文档，TF_Contingent_Liability_Lifecycle-en.txt §3.4/§7.3、TF_Balance_Component_Spec-en.txt §5.1/§12）：若在交单后第五个银行工作日结束前，未发出有效且合规的拒付通知（UCP 600 第 16(c)/(d)/(f) 条），银行即被排除、不得再主张单据不符——该笔存在瑕疵的交单将转为强制承兑（mandatory honour），风险权重重新计为 100% 敞口，且该事件在无操作人员动作、无任何入站消息的情况下自动触发，并永久阻断此后任何拒付尝试。立场 B（实际代码）：微服务的源码与测试目录树中，任何地方都不存在 LC_DOC_PRECLUDED/EX_DOC_PRECLUDED 取值、定时器、cron／排程任务，或第五个银行工作日截止期限的逻辑。

## 条件
自 presentation_date（交单日）起满 5 个银行工作日，且未送达合规的拒付通知。

## 结果
设计文档自身要求的自动触发事件，在运行中的系统里从未发生——一笔存在瑕疵的交单可以无限期地保持未被拒付的状态，既不会被自动重新计权，也不会阻断此后的拒付尝试。

## 示例
对整个微服务源码与测试目录树搜索 LC_DOC_PRECLUDED/preclu，除设计文档本身的文字外，没有任何匹配结果；整个代码库中不存在任何排程任务／cron 机制（已对照 CLAUDE.md 自身的架构说明加以确认，其中未列出任何此类组件）。

## 冲突说明
> [!warning] Sources disagree
> 出于与上文受益人同意规则相同的原因，从候选规则原本的 CONFIRMED 状态降级——依据既定的证据优先级顺序，代码／测试证据（此处表现为其缺失）优先于设计文档的主张。这是一项已被文档化、但零实现的要求，而不是系统已验证的行为。同样被标记为一个 newGap。

## 验证说明
出于与上文受益人同意规则相同的原因，从候选规则原本的 CONFIRMED 状态降级——依据既定的证据优先级顺序，代码／测试证据（此处表现为其缺失）优先于设计文档的主张。这是一项已被文档化、但零实现的要求，而不是系统已验证的行为。同样被标记为一个 newGap。

## 来源证据

实现：
- `no corresponding implementation found in microservices/balance-component/src/`

测试：
- （未引用直接测试证据）

## 相关知识
- [[Close Eligibility]]
- [[Business-Rule-Index]]
- [[Knowledge-Gaps]]
- [[Balance-Traceability-Matrix]]
