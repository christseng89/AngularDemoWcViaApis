---
knowledge_id: Freshness-Update-Log-2026-08-30
title: "知识新鲜度更新日志（2026-08-30）"
domain: Balance
category: Freshness
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "3917866"
snapshot_date: 2026-08-30
tags:
  - balance
  - freshness
  - source-sync
---

# 知识新鲜度更新日志（2026-08-30）

本轮以 commit `3917866` 的源码、自动化测试、`docs/current-behavior.md`、微服务 OAS `1.37.0` 与 Channel OAS `1.8.0` 为基准，增量更新受影响的知识节点。未受源码变更影响的会计与 tolerance 页面不作无依据改写。

## 已同步内容

- 现行功能范围为 A1–A11、B1–B7；A5 保留编号但不作为独立功能。
- A3/A3S 经 Maker Submit、Checker Approve 后进入 `EARMARKED`，Sight 由 A4 消费，Usance 由 A6 消费；B3 经相同门控后由 B4 消费。
- A3S、A6、B4 的关联 movement 由 compound submit/release 原子处理。
- Transaction Index 每页 10 笔。A3S 显示 SG Number／SG Amount；A6 显示 IB Number／IB Amount；B4 显示 EB Number／EB Amount，并一次选定完整交易身份。
- 不需要 Secondary Reference 的功能显示 Tight LC Balance；未选择功能时隐藏 Maker、Checker 与 Lookup 面板。
- Tight LC Balance 不得小于 0；UI Submit、服务端 API 与 Checker Release 在适用阶段执行充足性检查。
- Run All 完成后保留可供手工 A4、A6、B4 使用的合格前置交易。
- `BalanceService` 保留 façade 职责，将 movement、release、compound、query/transition 与 repository 职责委派给聚焦协作者。
- 微服务 OAS 已补齐 edit 与 withdraw-maker-submit；实现与 OAS 共 22 个 operations，无路由缺口。

## 验证基准

- Angular：51 suites／1,625 tests
- Backend：3 suites／57 tests
- Balance microservice：39 suites／784 tests
- 合计：93 suites／2,466 tests，全数通过；Angular production build 通过。

## 相关知识

- [[Balance-Knowledge-Home]]
- [[Balance Architecture]]
- [[Transaction Index Selection Contract]]
- [[BalanceService Facade Architecture]]
- [[Import-LC-Full-Lifecycle]]
- [[Export-Confirmed-LC-Full-Lifecycle]]
- [[API Index]]

