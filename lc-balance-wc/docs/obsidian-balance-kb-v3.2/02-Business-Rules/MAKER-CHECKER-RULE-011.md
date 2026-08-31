---
knowledge_id: MAKER-CHECKER-RULE-011
title: "A4 自身的 Checker Release 在其自身的 Maker Submit 存在之前，会被客户端阻止（纵深防御，有别于服务端的 BAL-123 关卡）"
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

# MAKER-CHECKER-RULE-011 — A4 自身的 Checker Release 在其自身的 Maker Submit 存在之前，会被客户端阻止（纵深防御，有别于服务端的 BAL-123 关卡）

## 状态
CONFIRMED

## 业务规则
对于其 Strategy 具有 checkerRelease.releasesExistingMovementInPlace 的功能（即 A4）而言，若对一笔缺少 makerSubmittedAt 的 movement 点击 Release，会在客户端就被阻止并显示说明性错误，而不会尝试发出该调用。这是叠加在（而非取代）release() 针对即期 tenor UTILIZE 的服务端 409 之上的一项 UX 清晰度／纵深防御检查。

## 适用条件
action === 'release' 且 checkerRelease.releasesExistingMovementInPlace 且 !selectedCheckerMovement.makerSubmittedAt。

## 结果
checkerError 被设置为一条指引性讯息；不会发出任何 API 调用。

## 示例
A4 已 EARMARKED 但尚未经 Maker Submit：点击 Release 会显示一条说明性讯息，而不会调用 release()。

## 核实说明
之所以将其视为独立于服务端 BAL-123 关卡的另一条规则，是因为它作用于不同的层面（客户端 UX 防护 vs. 服务端 409），且并未像服务端检查那样限定 tenorType——它适用于任何 A4 候选项，无论其 tenor 为何。未提供直接测试引用；仅凭源码检视即予确认，虽存在降级风险，但代码位置明确无误，且与本代码库在别处一贯采用的模式（客户端防护 + 服务端后盾）相符。

## 来源证据

实现代码：
- `src/app/transaction-builder/transaction-builder.component.ts:439-446`

测试：
- （未引用直接测试证据）

## 相关知识
- [[Maker Checker Lifecycle]]
- 即期（Sight）IPLC_LC/UTILIZE（A4）在 Checker 放行前必须先有一次真实的 Maker Submit——服务端强制执行（BAL-123）
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
