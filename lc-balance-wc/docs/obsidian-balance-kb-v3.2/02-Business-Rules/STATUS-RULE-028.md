---
knowledge_id: STATUS-RULE-028
title: "CONFLICT：文档要求 LC／保兑的减额修改（amendment decrease）须经受益人同意门控（UCP 600 第 10(a)/(c) 条），但已实现的代码中并不存在这一门控"
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

# STATUS-RULE-028 — CONFLICT：文档要求 LC／保兑的减额修改（amendment decrease）须经受益人同意门控（UCP 600 第 10(a)/(c) 条），但已实现的代码中并不存在这一门控

## 状态
CONFLICT

## 业务规则
立场 A（设计文档，TF_Contingent_Liability_Lifecycle-en.txt §3.2）：根据 UCP 600 第 10(a) 条，不可撤销信用证未经受益人同意不得修改，而第 10(c) 条明确指出沉默并不构成接受——因此，减额／撤销操作必须在任何余额变动之前，先门控于有证据支持的受益人（及保兑行）同意，并建模为一个中间的『待同意』状态。立场 B（实际代码）：ContractStatus 严格限定为 {ACTIVE, SUPERSEDED, CLOSED, CANCELLED}，MovementStatus 严格限定为 {PENDING, RELEASED, REJECTED, CANCELLED, SUPERSEDED}——types.ts 中任何地方都不存在 PENDING_BENE_CONSENT 或等效状态，AMEND_DECREASE（A2）／减额方向的 AMEND（B2）都直接通过 checkAmendDecreaseSufficiency 运行，完全没有任何同意跟踪字段、门控或状态。

## 条件
针对某份 LC 或保兑，movementType 为 AMEND_DECREASE 或 CANCEL/CLOSE。

## 结果
设计文档自身的要求在当前系统中并未被强制执行——Checker 可以在 Maker 一提交减额操作时立即将其 Release，全程无需记录或要求任何受益人同意的证据。

## 示例
对整个微服务源码与测试目录树搜索 PENDING_BENE_CONSENT/BENE_CONSENT/consent，除设计文档本身的文字外，没有任何匹配结果。

## 冲突说明
> [!warning] Sources disagree
> 从候选规则原本的 CONFIRMED 状态降级。依据证据优先级规则（可执行的代码／测试优先于设计文档），且 grep 结果确认任何同意跟踪机制均未被实现，因此不能维持 CONFIRMED——这是设计文档所主张的要求与已上线系统实际行为之间一个真实存在的冲突，而不是对运行中系统已验证的业务规则。同时也被标记为一个 newGap，因为尚不清楚这是一个刻意、已披露的推迟实现（如 BAL-001/BAL-002），还是一个未被察觉的合规缺口。

## 验证说明
从候选规则原本的 CONFIRMED 状态降级。依据证据优先级规则（可执行的代码／测试优先于设计文档），且 grep 结果确认任何同意跟踪机制均未被实现，因此不能维持 CONFIRMED——这是设计文档所主张的要求与已上线系统实际行为之间一个真实存在的冲突，而不是对运行中系统已验证的业务规则。同时也被标记为一个 newGap，因为尚不清楚这是一个刻意、已披露的推迟实现（如 BAL-001/BAL-002），还是一个未被察觉的合规缺口。

## 来源证据

实现：
- `ContractStatus/MovementStatus unions in microservices/balance-component/src/types.ts:39,48 — no consent-related state exists`

测试：
- （未引用直接测试证据）

## 相关知识
- [[Close Eligibility]]
- [[Business-Rule-Index]]
- [[Knowledge-Gaps]]
- [[Balance-Traceability-Matrix]]
