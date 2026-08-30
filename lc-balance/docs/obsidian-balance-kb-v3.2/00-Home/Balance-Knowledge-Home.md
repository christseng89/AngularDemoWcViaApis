---
knowledge_id: Balance-Knowledge-Home
title: "Balance Knowledge Home"
domain: Balance
category: Home
snapshot_date: 2026-08-30
tags:
  - balance
  - home
---

# Balance 知识库首页

欢迎来到 **Balance 组件知识库** —— 这是针对 `microservices/balance-component/` 及其 Angular `transaction-builder`/`business-case-runner` 前端与 `backend/` 编排层，逆向工程重建、可追溯、对 AI 友好的贸易融资或有负债／风险敞口（exposure）总账地图。本知识库中的每一条论述都对照真实源代码、测试、API 规格与设计文档，标注为 CONFIRMED（已确认）、INFERRED（推断）、UNCLEAR（不确定）或 CONFLICT（冲突）——未能达到「可确认事实」门槛的内容全部收录于 [[Knowledge-Gaps]]。

## 从这里开始

- [[Balance Component Overview]] —— 该系统是什么、三大组成部分如何协同
- [[Balance Architecture]] —— 技术形态：分层结构、数据库、拆分演进历史、已知取舍

## 核心领域模型

- [[BalanceContract]]
- [[BalanceMovement]]
- [[InstrumentType]]
- [[Exposure Model]]
- [[Tolerance Processing]]
- [[Off-Balance-Sheet Exposure]]
- [[Maker Checker Lifecycle]]

## 按领域浏览

- [[Domain Concepts Index|领域概念索引]] —— 01-Domain-Concepts
- [[Balance Flow Index|Balance 流程总索引（跨功能总览）]] —— 03-Balance-Flows
- [[A-Import 功能索引]] —— 03-Balance-Flows/A-Import（进口方向 A1–A11，11 个功能）
- [[B-Export 功能索引]] —— 03-Balance-Flows/B-Export（出口方向 B1–B7，7 个功能）
- [[Function-API Integration Map|功能-API 整合对照表]] —— 开发者快速入口：按 API 端点／代码路径查找对应业务功能
- [[Exposure & Accounting Concepts Index|风险敞口与会计概念索引]] —— 04-Exposure-Accounting
- [[Tolerance & FX Concepts Index|容差与汇率概念索引]] —— 05-Tolerance-FX
- [[Maker-Checker Concepts Index|Maker-Checker 概念索引]] —— 06-Maker-Checker
- [[API Index|API 索引]] —— 07-API
- [[Data Model Concepts Index|数据模型概念索引]] —— 08-Data-Model
- [[Architecture Concepts Index|架构概念索引]] —— 09-Architecture

## 规则、证据与场景

- [[Business-Rule-Index|业务规则索引]] —— 每一条可追溯的 BALANCE-RULE / EXPOSURE-RULE / TOLERANCE-RULE / MOVEMENT-RULE / STATUS-RULE / MAKER-CHECKER-RULE 条目
- [[Balance Flow Index|Balance 流程索引]] —— 以 Mermaid 图重建的端到端业务逻辑流程
- [[Decision-Table-Index|决策表索引]] —— 每一张提取出的多条件决策表
- [[Test-Scenario-Index|测试场景索引]] —— 源自真实测试套件、以业务语言表达的 Given/When/Then 场景
- [[Balance-Traceability-Matrix|Balance 可追溯性矩阵]] —— 规则 → 实现 → 测试
- [[Source-to-Knowledge-Map|源码-知识映射表]] —— 源文件 → 生成的知识内容（新鲜度对照表）
- [[Knowledge-Gaps|知识缺口]] —— 未确定的规则、跨来源冲突，以及标记待验证的开放问题
- [[Knowledge-Quality-Report|知识质量报告]] —— 本知识库自评的质量评审（见下）
- [[Freshness-Update-Log-2026-08-26|知识新鲜度更新日志（2026-08-26）]] —— 本次增量同步做了什么、依据什么、诚实披露未覆盖范围
- [[Freshness-Update-Log-2026-08-30|知识新鲜度更新日志（2026-08-30）]] —— 对齐最新源码、OAS、Transaction Index、Tight Balance 与原子 compound 行为

## 方法论说明

早期 2026-08-22／26 快照无法取得 Git 历史；2026-08-30 起已可用 commit `3917866` 锚定本轮更新。完整说明见 [[Source-to-Knowledge-Map]]。来源冲突时遵循仓库 `CLAUDE.md`：最新确认的业务决策 > 当前批准规格 > OAS > 自动化测试 > 实现。
