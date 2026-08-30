---
knowledge_id: MAKER-CHECKER-RULE-045
title: "RELEASE_SHAPED_STEP_TYPES — release/makerSubmit 业务案例（Business Case）步骤在结构上是完全相同的分派（dispatch）；已移除的 'acknowledge' 步骤类型再未重新出现"
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

# MAKER-CHECKER-RULE-045 — RELEASE_SHAPED_STEP_TYPES — release/makerSubmit 业务案例步骤在结构上是完全相同的分派；已移除的 'acknowledge' 步骤类型再未重新出现

## 状态
CONFIRMED

## 业务规则
'release' 或 'makerSubmit' 类型的业务案例（Business Case）步骤，最终都会通过同一张共享的 RELEASE_SHAPED_STEP_TYPES 分派表（BAL-124）解析为 POST /balance-movements/:id/<subPath>，且请求体（body）中恰好只有一个键（分别为 {releasedBy} 或 {makerSubmittedBy}）。在注册表（registry）或编排器（orchestrator）中，作为独立分派分支的 'acknowledge' 步骤类型已不复存在——CLAUDE.md 自身的决策日志（decision log）指出，微服务真实的 acknowledge 端点后来又被恢复（v1.13.0），但已被重新定位为专供 A3/A3S 自身的确认（acknowledgment）步骤使用，该步骤仍由同一张分派表以 'release-shaped'（release 形态）步骤的方式分派，而不是新增的第四种独立分支。

## 条件
step.type 为 'release' 或 'makerSubmit'。

## 结果
向匹配的子路径（sub-path）发起 POST 请求，并带上对应的请求体键；以 {type, label, status, ok, response} 的形式记录在追踪（trace）中。

## 示例
import-case-6 中的 3 个 makerSubmit 步骤，各自向 /balance-movements/{id}/maker-submit 发起 POST 请求，请求体为 {makerSubmittedBy:'maker1'}，紧接其后是一个 release 步骤，向 /balance-movements/{id}/release 发起 POST 请求，请求体为 {releasedBy:'checker1'}。

## 验证说明
由 CLAUDE.md 自身架构概览（architecture-overview）条目（"RELEASE_SHAPED_STEP_TYPES 涵盖 release/makerSubmit/acknowledge——作为真实微服务端点的 acknowledge 后来被移除"）以及后续 A3/A3S 确认步骤恢复条目相互印证。已确认（Confirmed），并将"acknowledge 端点已恢复"这一细节纳入以确保准确性。

## 来源证据

实现：
- `backend/server.js:48-62,109-124`

测试：
- `backend/test/runCase.test.js:106-133`
- `backend/test/server.test.js:186-206,215-234`

## 相关知识
- [[Maker Checker Lifecycle]]
- RELEASE_SHAPED_STEP_TYPES 分派表（BAL-124）
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
