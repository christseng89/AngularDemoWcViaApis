---
knowledge_id: MAKER-CHECKER-RULE-049
title: "渠道 API（Channel API）禁止除 A1/B1 之外的所有功能输入 Currency Code（仅规格层要求——微服务尚未强制执行）"
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

# MAKER-CHECKER-RULE-049 — 渠道 API 禁止除 A1/B1 之外的所有功能输入 Currency Code（仅规格层要求——微服务尚未强制执行）

## 状态
CONFIRMED

## 业务规则
ChannelDerivedTransactionRequest（用于 functionCode 为 A1/B1 以外的任何值时）根本没有 `currency` 属性，且 additionalProperties:false——提交 currency 字段会导致 400 schema 校验失败，而不是被静默接受并覆盖。CLAUDE.md 中明确记载这一点为『仅规格层要求，微服务尚未强制执行』——也就是说，这条规则描述的是渠道 API 门面（façade）自身的 OAS schema，而不是 balance-component 自身路由中一条实际生效的服务器端检查。

## 条件
functionCode 属于 {A2,A3,A3S,A4,A6,A7,A8,A9,B2,B3,B4,B5} 之一。

## 结果
根据渠道 API 的 OAS schema，若请求体中出现 currency 字段，将返回 400 REQUEST_VALIDATION_FAILED；本代码库中并未独立确认这一行为已针对一个真实运行中的渠道 API 服务实现。

## 示例
不适用。

## 验证说明
已降低表述强度（因为这是 OAS 自身实际记载的规格内容，属于真实可读的 schema 产物，故状态仍保留 CONFIRMED），但验证说明明确标注：这仅是规格层要求，正如 CLAUDE.md 自身明确披露的（"服务器端 Currency Code 推导规则已文档化（仅规格层要求，微服务尚未强制执行）"）——目前不存在任何关于实际强制执行的实现或测试证据，只有 schema 定义本身。应视为已文档化的『设计意图』，而非已验证的运行时行为。

## 来源证据

实现：
- `analysis/balance-component-channel-api.yaml:53-66,755-802`

测试：
- （未引用直接测试证据）

## 相关知识
- [[Maker Checker Lifecycle]]
- 渠道 Currency Code 规则（INPUT 与 CARRIED 之分）
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
