---
knowledge_id: MAKER-CHECKER-RULE-034
title: "reject() 使用写死的 checkerId（'checker1'）与写死的 reasonCode（'MANUAL_TEST_REJECT'），不同于 release() 依 createdBy 推导——属于真实的代码层级内部不一致"
domain: Balance
category: Business Rule
status: CONFLICT
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - maker-checker
  - conflict
---

# MAKER-CHECKER-RULE-034 — reject() 使用写死的 checkerId（'checker1'）与写死的 reasonCode（'MANUAL_TEST_REJECT'），不同于 release() 依 createdBy 推导——属于真实的代码层级内部不一致

## 状态
CONFLICT

## 业务规则
release() 与 acknowledgeArrival() 都会将实际操作的 checkerId 推导为 `ctx.createdBy === 'maker1' ? 'checker1' : 'checker2'`（第 50、138 行）。而 reject() 则一律传入字面字符串 'checker1'（以及字面 reasonCode 'MANUAL_TEST_REJECT'，本身看起来就像一个可疑的占位值）给 api.reject()，完全不理会 ctx.createdBy（第 155 行）。没有任何测试或注释说明，这种差异究竟是刻意设计成「拒绝一律以固定身份执行」，还是相对于 release() 自身推导方式的一处疏漏。

## 条件
任何一次 reject() 调用，其 ctx.createdBy 若依 release() 自身的推导规则，本应对应到 'checker2'（也就是任何非 'maker1' 的 createdBy 值）。

## 结果
reject() 所记录的 checkerId 一律为 'checker1'，即使针对同一笔 movement，release() 原本会使用 'checker2'——这是一处审计轨迹上的不一致：同一套复核人身份约定，并未在两个复核人操作之间被一致地套用。

## 示例
一笔由 createdBy='maker2' 建立的 movement（在 release() 中会对应到 checker2），若改为拒绝而非放行，仍会被记录为由 'checker1' 拒绝。

## 冲突说明
> [!warning] 来源存在分歧
> 已透过阅读源码直接重新核实：第 50 行与第 138 行都依 ctx.createdBy 推导 checkerId；第 155 行则写死了 'checker1'，以及同样可疑的字面值 'MANUAL_TEST_REJECT' 作为 reasonCode。这是两条逻辑上理应共用同一套 checkerId 推导约定的复核人操作代码路径之间，真实存在的代码层级 CONFLICT——依本任务自身对分歧规则的判定标准，维持为 CONFLICT，因为代码库自身对同一概念体现出两套不同规则，且没有任何文档说明这种差异的理由。'MANUAL_TEST_REJECT' 这个字面值另外也暗示，这段 reject() 实现本身可能是一条未完成/占位性质的路径，而非刻意的设计选择——此处记为一个尚待解答的开放问题，现有证据尚不足以定论。

## 验证说明
已透过阅读源码直接重新核实：第 50 行与第 138 行都依 ctx.createdBy 推导 checkerId；第 155 行则写死了 'checker1'，以及同样可疑的字面值 'MANUAL_TEST_REJECT' 作为 reasonCode。这是两条逻辑上理应共用同一套 checkerId 推导约定的复核人操作代码路径之间，真实存在的代码层级 CONFLICT——依本任务自身对分歧规则的判定标准，维持为 CONFLICT，因为代码库自身对同一概念体现出两套不同规则，且没有任何文档说明这种差异的理由。'MANUAL_TEST_REJECT' 这个字面值另外也暗示，这段 reject() 实现本身可能是一条未完成/占位性质的路径，而非刻意的设计选择——此处记为一个尚待解答的开放问题，现有证据尚不足以定论。

## 来源证据

实现：
- `src/app/transaction-builder/checker-actions.service.ts:50 (release's checkerId derivation), 138 (acknowledgeArrival's identical derivation), 151-159 (reject's hardcoded 'checker1'/'MANUAL_TEST_REJECT')`

测试：
- `src/app/transaction-builder/checker-actions.service.spec.ts:409-437 (does not assert checkerId varies by createdBy for reject())`

## 相关知识
- [[Maker Checker Lifecycle]]
- reject() 使用写死的 checkerId，并非依 createdBy 推导——与 release() 不一致
- [[Business-Rule-Index]]
- [[Knowledge-Gaps]]
- [[Balance-Traceability-Matrix]]
