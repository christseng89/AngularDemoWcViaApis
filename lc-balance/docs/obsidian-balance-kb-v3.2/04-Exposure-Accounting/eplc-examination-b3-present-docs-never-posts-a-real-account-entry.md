---
knowledge_id: eplc-examination-b3-present-docs-never-posts-a-real-account-entry
title: "EPLC_EXAMINATION（B3 Present Docs）从不产生真实科目分录"
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

# EPLC_EXAMINATION（B3 Present Docs）从不产生真实科目分录

B3（Present Docs／提示单据，EPLC_EXAMINATION）依据设计原则 D3（"单据到达是一个物理事件……只有法律事件才会变动余额"）属于 MEMO_ONLY——它从不会真正过账到帐册中，因此无论 movementType 为何，deriveContingentAccountEntry() 针对每一笔 EPLC_EXAMINATION 异动都会回传 null。这一做法推翻了此前的一版设计——该版设计曾为其建立了一组具名的 Dr/Cr 分录（已于 2026-08-17 移除），即便源分类账自身的 Folio 1/4 中，确实以视觉方式为它命名了一行"无总账效果"（no GL effect）的记录。

## 来源证据

- `microservices/balance-component/src/domain/contingentAccountEntry.ts:16-29, 89-99`
- `test/unit/domain/contingentAccountEntry.test.ts:167-172`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
