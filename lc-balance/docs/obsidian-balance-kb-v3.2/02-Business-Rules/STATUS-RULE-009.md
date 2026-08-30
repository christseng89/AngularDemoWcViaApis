---
knowledge_id: STATUS-RULE-009
title: "B3（EPLC_EXAMINATION/CREATE）在其自身的 Checker 动作上确实会真正 RELEASE；presentDocsConsumedAt 独立于状态、单独追踪 B4 后续的消耗动作"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - status
  - confirmed
---

# STATUS-RULE-009 — B3（EPLC_EXAMINATION/CREATE）在其自身的 Checker 动作上确实会真正 RELEASE；presentDocsConsumedAt 独立于状态、单独追踪 B4 后续的消耗动作

## 状态
CONFIRMED

## 业务规则
针对一笔 EPLC_EXAMINATION/CREATE 变动记录调用 release()，是一次真实、独立的 PENDING→RELEASED 转换。当 release() 之后又针对另一笔变动记录（通常是 B4 HONOUR/ACCEPT）被调用、且该记录的 referencedTransactionId 指向那笔已 RELEASED 的交单时，被引用记录的 presentDocsConsumedAt/presentDocsConsumedBy 会作为副作用被设置，而不会触及其状态。Present Docs Earmark（交单占用额度）的占用期间，是从 RELEASED 状态一直到 presentDocsConsumedAt 被设置为止，而不仅仅是状态离开 PENDING 为止——B3 在 Submit/Approved 之外，还拥有一个真实存在的第三生命周期状态（『已消耗』），只有 B4 才能设置这一状态。

## 触发条件
无（属于 release() 的副作用）

## 结果
一笔已 RELEASED 但尚未被消耗的 B3 交单，仍然占用 Present Docs Earmark；一旦引用它的 B4 被释放，presentDocsConsumedAt 即被设置，占用随之解除。

## 示例
一笔 60,000 的 B3 交单被释放（尚未消耗）→ presentDocsEarmarkApproved 读数为 60,000，阻挡针对同一笔 100,000 保兑信用证的另一笔独立 50,000 交单。一旦引用它的 B4 HONOUR 被释放，presentDocsConsumedAt 即被设置，占用额度降为 0。

## 验证说明
直接阅读了 release() 的副作用代码块——与描述完全一致。Balance-Figures-Calculation-Logic.txt 自身的 B3 小节（『一个真实存在的第三生命周期状态——已消耗』）作为设计文档层面的佐证，已折叠为附加证据，而非另立近似重复条目。

## 来源证据

实现:
- `microservices/balance-component/src/service/balanceService.ts:1133-1146,1236-1257`

测试:
- `microservices/balance-component/test/unit/service/balanceService.test.ts:813-990`

## 相关知识
- [[Close Eligibility]]
- EXPOSURE-RULE（B4 对所引用 B3 记录的临时净额计算）
- computePresentDocsEarmark()
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
