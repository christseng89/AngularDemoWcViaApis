---
knowledge_id: MAKER-CHECKER-RULE-050
title: "设计文档中的幂等性方案——基于 (entity, source_system, source_ref, semantic_key) 元组配合 payload 哈希比对、并硬性拒绝 DUPLICATE_REF_PAYLOAD_MISMATCH——在实际代码库中完全未实现，且在『payload 不匹配』这一关键问题上，与已上线的 (balanceContractId, eventSeq) 行为相冲突"
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

# MAKER-CHECKER-RULE-050 — 设计文档中的幂等性方案——基于 (entity, source_system, source_ref, semantic_key) 元组配合 payload 哈希比对、并硬性拒绝 DUPLICATE_REF_PAYLOAD_MISMATCH——在实际代码库中完全未实现，且在『payload 不匹配』这一关键问题上，与已上线的 (balanceContractId, eventSeq) 行为相冲突

## 状态
CONFLICT

## 业务规则
两种说法互相矛盾：(A) 设计文档（TF_Balance_Component_Spec-en.txt §5.4/I15，以及 TF_Balance_Component_Mapping-en.txt I15/T23/T31/T38）描述了一套更广泛的幂等性方案，以 (entity, source_system, source_ref, semantic_key) 为键并配合 payload_hash 比对：同一 payload_hash 的重放会返回已提交的结果，但同一元组上出现『不同』的 payload_hash 则必须硬性拒绝，返回 DUPLICATE_REF_PAYLOAD_MISMATCH——绝不能静默成功或覆盖数据——并配有一个永久性登记表（可配置的『热缓存』时间窗，如 90 天，仅作为快速路径，缓存未命中时绝不能视为『从未见过』）。(B) 实际实现并经过测试的行为（balanceMovementStore.ts、balanceService.ts、app.test.ts）仅使用 (balanceContractId, eventSeq) 作为幂等键，代码库中任何地方都没有 source_system/source_ref/semantic_key/payload_hash 这类概念（经全仓库 grep 确认零匹配）——更关键的是，该实现『并不会』对 payload 不匹配的情况硬性拒绝：在同一 (balanceContractId, eventSeq) 上以『不同』金额重新提交，会被静默接受为 200 OK，并返回『原始』（未变更的）记录——这恰恰就是设计文档中明确规定绝不能出现的『静默成功、无报错』结果。

## 条件
一次重复提交携带了相同的幂等键，但 payload 确实存在差异（例如金额不同）。

## 结果
设计文档立场：硬性拒绝（DUPLICATE_REF_PAYLOAD_MISMATCH）。实际上线代码的立场：静默返回 200 OK 并返回原始记录，不报错，且不区分『精确重放』与『payload 不匹配的重新提交』。

## 示例
设计文档自身给出的示例：一份 MT707 在第 95 天被重放（已超出 90 天的热缓存时间窗），仍必须通过永久性登记表（T38）被识别为重放——这一具体场景（基于 source-ref 的去重、缓存时间窗回退机制）在代码中完全没有对应实现可供测试对照。另外，实际代码自身一个通过的测试（app.test.ts:87-102）证明：对一个已存在的 eventSeq 3／金额 50000 的记录，以金额 999999 重新提交，会返回 200，且金额仍保持不变为 50000——从未触发任何等价于 DUPLICATE_REF_PAYLOAD_MISMATCH 的错误。

## 冲突说明
> [!warning] 来源之间存在分歧
> 已将两条源自设计文档的候选条目（"幂等性：完全相同的重放会返回已提交的结果……"以及"（TF Mapping）I15 幂等性……"）合并为一条，因为二者描述的是同一套、来自两个文档来源、但均未实现的方案。已通过对代码库全仓库 grep 检索 source_system/payload_hash/DUPLICATE_REF_PAYLOAD_MISMATCH/semantic_key 独立验证——在 microservices/balance-component/src、backend/、src/app/ 中均为零匹配——确认这套方案纯属设计文档层面的构想，从未被实现。根据证据优先级规则（可执行代码/测试优先于设计文档），本条目已从最初的 CONFIRMED/UNCLEAR 定位下调为 CONFLICT：设计文档自身明确要求的『绝不能静默成功』，与实际上线并经过测试的行为（对 payload 不匹配的重新提交静默返回 200）直接相矛盾。这是一个真实存在、且具有业务意义的缺口——CLAUDE.md 自身从未就尚未纳入版本控制的 TF_Balance_Component_Spec 中的幂等性章节，与已上线的、仅基于 (balanceContractId, eventSeq) 的实现之间的差异做出调和说明。

## 验证说明
已将两条源自设计文档的候选条目（"幂等性：完全相同的重放会返回已提交的结果……"以及"（TF Mapping）I15 幂等性……"）合并为一条，因为二者描述的是同一套、来自两个文档来源、但均未实现的方案。已通过对代码库全仓库 grep 检索 source_system/payload_hash/DUPLICATE_REF_PAYLOAD_MISMATCH/semantic_key 独立验证——在 microservices/balance-component/src、backend/、src/app/ 中均为零匹配——确认这套方案纯属设计文档层面的构想，从未被实现。根据证据优先级规则（可执行代码/测试优先于设计文档），本条目已从最初的 CONFIRMED/UNCLEAR 定位下调为 CONFLICT：设计文档自身明确要求的『绝不能静默成功』，与实际上线并经过测试的行为（对 payload 不匹配的重新提交静默返回 200）直接相矛盾。这是一个真实存在、且具有业务意义的缺口——CLAUDE.md 自身从未就尚未纳入版本控制的 TF_Balance_Component_Spec 中的幂等性章节，与已上线的、仅基于 (balanceContractId, eventSeq) 的实现之间的差异做出调和说明。

## 来源证据

实现：
- `TF_Balance_Component_Spec-en.txt §5.4, I15（设计文档，描述了未实现的方案）`
- `TF_Balance_Component_Mapping-en.txt line 601 (I15), 635/643/650 (T23/T31/T38)（设计文档，描述了未实现的方案）`
- `microservices/balance-component/src/store/balanceMovementStore.ts:122-211（实际实现——完全没有 payload 比对）`

测试：
- `TF_Balance_Component_Spec-en.txt §12.1 T23, T31, T38（设计文档内部的测试场景描述，并非针对真实代码的自动化测试）`
- `microservices/balance-component/test/unit/app.test.ts:87-102（真实且通过的测试，证明了实际的静默接受行为）`

## 相关知识
- [[Maker Checker Lifecycle]]
- [[BalanceContract|幂等键（Idempotency Key）：(balanceContractId, eventSeq)]]
- Balance Component GL 记账范围不匹配（GL-Posting Scope Mismatch）
- [[Business-Rule-Index]]
- [[Knowledge-Gaps]]
- [[Balance-Traceability-Matrix]]
