---
knowledge_id: the-microservice-s-own-uncredited-god-method-f-02
title: "微服务自身那个从未被点名的“God Method”（F-02）"
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

# 微服务自身那个从未被点名的“God Method”（F-02）

同一次 OOD 审查发现，createMovement() 长达约 300 行（重复 Issue 守卫、root-Issue 已释放守卫，以及各种按单据类型区分的充足性检查全部以一连串内联 if 代码块的形式存在），并指出：尽管 Angular 端的 God Component 已经历过九次修复整改，但这个方法——可以说是整个系统中最关键的一个函数，因为它决定了每一笔动账的合法性——在这次审查之前，从未在任何先前的质量审查中被点名。CLAUDE.md 记录了此问题后续得到处理：checkAcceptanceTenorConsistency 被抽取为一个新文件；checkShgtIssueSufficiency/checkPresentDocsIssueSufficiency 被新增到 offBalanceExposure.ts 中，二者各自复制了自己的单层检查逻辑，而不是复用 checkUtilizeSufficiency（后者是真正不同的双层结构）。

## Source Evidence

- `CLAUDE.md F-02 decision-log entry`
- `desiger-comments.md:81-92`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
