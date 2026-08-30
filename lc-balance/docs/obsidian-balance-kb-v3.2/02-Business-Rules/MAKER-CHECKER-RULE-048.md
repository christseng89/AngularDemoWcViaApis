---
knowledge_id: MAKER-CHECKER-RULE-048
title: "服务器端幂等性、re-ISSUE 防护，以及 BAL-123 Sight-UTILIZE Maker-Submit 关卡，均已记录在微服务 OAS（balance-component-api.yaml）中，与实现保持一致"
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

# MAKER-CHECKER-RULE-048 — 服务器端幂等性、re-ISSUE 防护，以及 BAL-123 Sight-UTILIZE Maker-Submit 关卡，均已记录在微服务 OAS（balance-component-api.yaml）中，与实现保持一致

## 状态
CONFIRMED

## 业务规则
该 OAS 记录了以下内容：(1) 基于 (balanceContractId, eventSeq) 的幂等重放——返回 200 及未变更的既有 BalanceMovement，不会重复计数；(2) 针对已处于 ACTIVE 状态的合约再次提交『创建型』movementType 的 re-ISSUE 防护（409 NATURAL_KEY_ALREADY_EXISTS）；(3) A4 特有的 Sight-UTILIZE 409 规则，要求 release 前必须先有 makerSubmittedAt；(4) B3 已重新设计为真正的 release()（而非旧有的仅 acknowledge() 设计），presentDocsConsumedAt 作为关联的 HONOUR/ACCEPT 自身 release 的副作用而被记录。

## 条件
不适用——这是对已实现行为的规格层文档记录。

## 结果
根据 v1.15.0 变更日志自身的一次订正（用以核对陈旧的 schema 描述与实际代码是否一致），这 4 条规则的 OAS 描述与微服务实际行为相符。

## 示例
不适用——仅为规格引用。

## 验证说明
已将 4 个独立的 api-specs 分组候选条目（幂等重放、re-ISSUE 防护、A4 Sight 关卡、B3 重新设计）合并为一条汇总规则，因为它们各自都只是对上文已独立验证过的代码层规则（分别对应 balanceMovementStore.ts、errors.ts、balanceService.ts，以及 CLAUDE.md 自身关于 B3 重新设计的条目）的规格层复述——OAS 只是佐证性文档，并非新的独立证据；根据证据优先级规则（可执行代码与测试优先于规格/配置），本条目仅作为『规格与代码一致性』的陈述维持 CONFIRMED，不作为对底层规则本身的独立加权证明。

## 来源证据

实现：
- `analysis/balance-component-api.yaml:756-760,820-829（幂等性）`
- `analysis/balance-component-api.yaml:187-190,762-768,835-839（re-ISSUE）`
- `analysis/balance-component-api.yaml:281-289,919-938,985-994（A4 Sight 关卡）`
- `analysis/balance-component-api.yaml:372-393,396-411,941-950（B3 重新设计）`

测试：
- （未引用直接测试证据）

## 相关知识
- [[Maker Checker Lifecycle]]
- [[BalanceContract|幂等键（Idempotency Key）：(balanceContractId, eventSeq)]]
- Maker/Checker 四眼（4-eyes）生命周期
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
