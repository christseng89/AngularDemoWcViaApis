---
knowledge_id: one-movement-one-leg-one-call-correlation-without-atomicity
title: "一个 Movement、一条腿、一次调用——只有关联，没有原子性"
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

# 一个 Movement、一条腿、一次调用——只有关联，没有原子性

两份 OAS 文件中，每一个会改变状态的端点都只创建或迁移恰好一笔 BalanceMovement/ChannelTransaction；全库没有任何批量/复合端点，即便某些业务功能（A3S、B4、B5）按其获批设计本就需要多笔互相关联的 Movement，也是如此。相互关联的多条腿，要么通过调用方提供的 businessEventId 关联（同一次提交内的兄弟记录），要么——对于把某条已存在的先前记录进行转换的 Movement（A6/B4）——通过 referencedTransactionId 关联（该记录早于本次新提交，二者不共享 businessEventId）。这里明确只是关联关系，从来不是事务边界——如果调用方的第二条腿在第一条腿已成功之后失败，得到的将是一个部分结果，需要调用方自行决定如何补偿。

## Source Evidence

- `balance-component-api.yaml lines 1418-1429 (referencedTransactionId description)`
- `balance-component-api.yaml lines 36-49 (API design principle)`
- `balance-component-channel-api.yaml lines 30-50 (channel-level restatement)`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
